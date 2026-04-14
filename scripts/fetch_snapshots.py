#!/usr/bin/env python3
"""
CelebClub · Daily Snapshot Fetcher
-----------------------------------
Reads model handles from Supabase (models table), fetches public follower
counts from Instagram (via instaloader) and TikTok (via HTML scraping),
then upserts the results into the Supabase follower_snapshots table.

Required environment variables (set as GitHub Secrets):
  SUPABASE_URL          – e.g. https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  – service_role key (full DB access, never expose in frontend)

NOTE ON RELIABILITY:
  • Instagram: instaloader fetches public profiles without login.
    GitHub Actions IPs may get rate-limited after repeated runs.
  • TikTok: Parses the public page JSON embedded in the HTML.
    TikTok frequently changes its page structure; this may break.
    On failure the existing snapshot row is left unchanged (upsert with
    resolution=ignore-duplicates is not used — only successful fetches write).
"""

import json
import os
import re
import sys
import time
from datetime import date

import requests

TODAY = date.today().isoformat()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", flush=True)
    sys.exit(1)

HEADERS_SB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


# ── Supabase helpers ─────────────────────────────────────────────────────────

def get_models() -> list[dict]:
    """Read all models with instagram/tiktok handles from Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/models?select=id,name,instagram,tiktok"
    r = requests.get(url, headers=HEADERS_SB, timeout=15)
    r.raise_for_status()
    return r.json()


def upsert_snapshot(model_id: str, platform: str, handle: str, followers: int):
    """Upsert a follower_snapshots row (unique on model_id + platform + date)."""
    url = f"{SUPABASE_URL}/rest/v1/follower_snapshots"
    payload = {
        "model_id": model_id,
        "platform": platform,
        "handle":   handle,
        "date":     TODAY,
        "followers": followers,
    }
    # Prefer merge-duplicates so re-running the same day updates the count
    headers = {**HEADERS_SB, "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, headers=headers, json=payload, timeout=15)
    r.raise_for_status()
    print(f"  ✓ Saved {platform} @{handle}: {followers:,} followers", flush=True)


# ── Instagram via instaloader ────────────────────────────────────────────────

def fetch_instagram(handle: str) -> int | None:
    try:
        import instaloader
        L = instaloader.Instaloader(
            quiet=True,
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
        )
        profile = instaloader.Profile.from_username(L.context, handle.lstrip("@"))
        return profile.followers
    except ImportError:
        print("  [WARN] instaloader not installed — skipping Instagram", flush=True)
        return None
    except Exception as e:
        print(f"  [WARN] Instagram fetch failed for {handle}: {e}", flush=True)
        return None


# ── TikTok via HTML scraping ─────────────────────────────────────────────────

def fetch_tiktok(handle: str) -> int | None:
    url = f"https://www.tiktok.com/@{handle.lstrip('@')}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        r = requests.get(url, headers=headers, timeout=20)
        r.raise_for_status()

        # Strategy 1: __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob
        m = re.search(
            r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
            r.text, re.DOTALL
        )
        if m:
            data = json.loads(m.group(1))
            try:
                stats = (
                    data["__DEFAULT_SCOPE__"]["webapp.user-detail"]
                    ["userInfo"]["stats"]
                )
                return int(stats["followerCount"])
            except (KeyError, TypeError, ValueError):
                pass

        # Strategy 2: simple regex fallback
        m2 = re.search(r'"followerCount"\s*:\s*(\d+)', r.text)
        if m2:
            return int(m2.group(1))

        print(f"  [WARN] TikTok: could not parse follower count for {handle}", flush=True)
        return None
    except Exception as e:
        print(f"  [WARN] TikTok fetch failed for {handle}: {e}", flush=True)
        return None


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"CelebClub Snapshot Fetcher — {TODAY}", flush=True)
    print("Fetching models from Supabase...", flush=True)

    try:
        models = get_models()
    except Exception as e:
        print(f"ERROR: Could not fetch models from Supabase: {e}", flush=True)
        sys.exit(1)

    if not models:
        print("No models found in Supabase — nothing to do.", flush=True)
        return

    print(f"Found {len(models)} model(s).\n", flush=True)

    for model in models:
        mid  = model["id"]
        name = model.get("name", mid)
        print(f"── {name} ──", flush=True)

        # Instagram
        ig_handle = model.get("instagram")
        if ig_handle:
            print(f"  Fetching Instagram {ig_handle} ...", flush=True)
            followers = fetch_instagram(ig_handle)
            if followers is not None:
                try:
                    upsert_snapshot(mid, "instagram", ig_handle, followers)
                except Exception as e:
                    print(f"  [WARN] Failed to save IG snapshot: {e}", flush=True)
            else:
                print(f"  Skipping IG snapshot (fetch failed).", flush=True)
            time.sleep(3)

        # TikTok
        tt_handle = model.get("tiktok")
        if tt_handle:
            print(f"  Fetching TikTok {tt_handle} ...", flush=True)
            followers = fetch_tiktok(tt_handle)
            if followers is not None:
                try:
                    upsert_snapshot(mid, "tiktok", tt_handle, followers)
                except Exception as e:
                    print(f"  [WARN] Failed to save TT snapshot: {e}", flush=True)
            else:
                print(f"  Skipping TT snapshot (fetch failed).", flush=True)
            time.sleep(2)

    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
