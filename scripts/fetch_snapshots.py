#!/usr/bin/env python3
"""
CelebClub · Daily Snapshot Fetcher
-----------------------------------
Reads model handles from Supabase (models table), fetches public follower
counts from Instagram and TikTok via HTTP scraping (no login required),
then upserts the results into the Supabase follower_snapshots table.

Required environment variables (set as GitHub Secrets):
  SUPABASE_URL          – e.g. https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  – service_role key (full DB access, never expose in frontend)

INSTAGRAM APPROACH:
  Uses Instagram's internal web-profile API endpoint with browser-like headers.
  No login or API key required. Falls back to HTML meta-tag scraping if the
  API returns a non-200 status.

TIKTOK APPROACH:
  Parses the __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob embedded in the page.
  Falls back to a simple regex on the raw HTML.
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

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")

# Browser User-Agent used for direct social media requests (TikTok fallback)
_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.0 Mobile/15E148 Safari/604.1"
)


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
        "model_id":  model_id,
        "platform":  platform,
        "handle":    handle,
        "date":      TODAY,
        "followers": followers,
    }
    headers = {**HEADERS_SB, "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, headers=headers, json=payload, timeout=15)
    r.raise_for_status()
    print(f"  ✓ Saved {platform} @{handle}: {followers:,} followers", flush=True)


# ── Instagram via RapidAPI ───────────────────────────────────────────────────

def fetch_instagram(handle: str) -> int | None:
    """
    Fetch public Instagram follower count via RapidAPI Instagram Scraper.
    Falls back to direct web scraping if RAPIDAPI_KEY is not set.
    """
    username = handle.lstrip("@")

    # ── Strategy 1: RapidAPI (reliable, bypasses IP blocks) ──────────
    if RAPIDAPI_KEY:
        try:
            r = requests.get(
                "https://instagram-scraper-20251.p.rapidapi.com/userinfo/",
                params={"username_or_id": username},
                headers={
                    "X-RapidAPI-Key":  RAPIDAPI_KEY,
                    "X-RapidAPI-Host": "instagram-scraper-20251.p.rapidapi.com",
                },
                timeout=20,
            )
            r.raise_for_status()
            data = r.json()

            # Try common response shapes from this API
            count = (
                _dig(data, "user", "follower_count") or
                _dig(data, "data", "follower_count") or
                _dig(data, "follower_count") or
                _dig(data, "data", "user", "follower_count") or
                _dig(data, "user", "edge_followed_by", "count") or
                _dig(data, "data", "user", "edge_followed_by", "count")
            )
            if count is not None:
                return int(count)

            # Log the raw keys so we can fix the parser if shape changed
            print(f"  [WARN] RapidAPI: could not find follower count in response. "
                  f"Top-level keys: {list(data.keys())}", flush=True)
            return None

        except Exception as e:
            print(f"  [WARN] RapidAPI fetch failed for @{username}: {e}", flush=True)
            return None

    # ── Strategy 2: direct web scrape (may be blocked by GitHub Actions IPs) ─
    print("  [INFO] RAPIDAPI_KEY not set — trying direct web scrape (may fail)", flush=True)
    session = requests.Session()
    base_url = f"https://www.instagram.com/{username}/"
    common_headers = {
        "User-Agent":      _UA,
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        session.get(base_url, headers=common_headers, timeout=15)
        time.sleep(1)
        api_url = (
            "https://www.instagram.com/api/v1/users/web_profile_info/"
            f"?username={username}"
        )
        r = session.get(api_url, headers={
            **common_headers,
            "Accept":           "*/*",
            "x-ig-app-id":      "936619743392459",
            "Referer":          base_url,
            "X-Requested-With": "XMLHttpRequest",
        }, timeout=20)
        if r.status_code == 200:
            return int(r.json()["data"]["user"]["edge_followed_by"]["count"])
        print(f"  [WARN] Direct IG API returned HTTP {r.status_code} for @{username}", flush=True)
    except Exception as e:
        print(f"  [WARN] Direct IG scrape failed for @{username}: {e}", flush=True)
    return None


def _dig(obj: dict, *keys):
    """Safely traverse a nested dict; returns None if any key is missing."""
    for k in keys:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj


# ── TikTok via HTML scraping ─────────────────────────────────────────────────

def fetch_tiktok(handle: str) -> int | None:
    url = f"https://www.tiktok.com/@{handle.lstrip('@')}"
    headers = {
        "User-Agent":      _UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        r = requests.get(url, headers=headers, timeout=20)
        r.raise_for_status()

        # Strategy 1: __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob
        m = re.search(
            r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
            r.text, re.DOTALL,
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
            print(f"  Fetching Instagram @{ig_handle.lstrip('@')} ...", flush=True)
            followers = fetch_instagram(ig_handle)
            if followers is not None:
                try:
                    upsert_snapshot(mid, "instagram", ig_handle, followers)
                except Exception as e:
                    print(f"  [WARN] Failed to save IG snapshot: {e}", flush=True)
            else:
                print("  Skipping IG snapshot (fetch failed).", flush=True)
            time.sleep(3)

        # TikTok
        tt_handle = model.get("tiktok")
        if tt_handle:
            print(f"  Fetching TikTok @{tt_handle.lstrip('@')} ...", flush=True)
            followers = fetch_tiktok(tt_handle)
            if followers is not None:
                try:
                    upsert_snapshot(mid, "tiktok", tt_handle, followers)
                except Exception as e:
                    print(f"  [WARN] Failed to save TT snapshot: {e}", flush=True)
            else:
                print("  Skipping TT snapshot (fetch failed).", flush=True)
            time.sleep(2)

    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
