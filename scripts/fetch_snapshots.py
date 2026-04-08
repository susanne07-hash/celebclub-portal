#!/usr/bin/env python3
"""
CelebClub · Daily Snapshot Fetcher
-----------------------------------
Reads data/handles.json, fetches public follower counts from
Instagram (via instaloader) and TikTok (via HTML scraping),
and appends a new entry to data/snapshots.json.

NOTE ON RELIABILITY:
  • Instagram: instaloader fetches public profiles without login.
    GitHub Actions IPs may get rate-limited after repeated runs.
    If that happens, set up an IG session file (see instaloader docs)
    and store it as a GitHub Secret.
  • TikTok: Parses the public page JSON embedded in the HTML.
    TikTok frequently changes its page structure; this may break.
    If it does, the existing snapshot is left unchanged.
"""

import json
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
HANDLES_FILE   = ROOT / "data" / "handles.json"
SNAPSHOTS_FILE = ROOT / "data" / "snapshots.json"
MAX_HISTORY    = 90   # keep at most 90 days per platform

TODAY = date.today().isoformat()


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
        profile = instaloader.Profile.from_username(L.context, handle)
        return profile.followers
    except ImportError:
        print("  [WARN] instaloader not installed — skipping Instagram", flush=True)
        return None
    except Exception as e:
        print(f"  [WARN] Instagram fetch failed for @{handle}: {e}", flush=True)
        return None


# ── TikTok via HTML scraping ─────────────────────────────────────────────────

def fetch_tiktok(handle: str) -> int | None:
    try:
        import requests
    except ImportError:
        print("  [WARN] requests not installed — skipping TikTok", flush=True)
        return None

    url = f"https://www.tiktok.com/@{handle}"
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
            # Navigate into nested structure (may change across TikTok deployments)
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

        print(f"  [WARN] TikTok: could not parse follower count for @{handle}", flush=True)
        return None

    except Exception as e:
        print(f"  [WARN] TikTok fetch failed for @{handle}: {e}", flush=True)
        return None


# ── Snapshot helpers ─────────────────────────────────────────────────────────

def load_snapshots() -> dict:
    if SNAPSHOTS_FILE.exists():
        with open(SNAPSHOTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"updated": TODAY, "snapshots": {}}


def save_snapshots(data: dict):
    data["updated"] = TODAY
    with open(SNAPSHOTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved {SNAPSHOTS_FILE}", flush=True)


def append_entry(history: list, followers: int) -> list:
    """Append today's entry (or update if already exists), keep last MAX_HISTORY days."""
    entry = {"date": TODAY, "followers": followers}
    # Replace today's entry if already present
    history = [e for e in history if e.get("date") != TODAY]
    history.append(entry)
    # Trim to MAX_HISTORY most recent
    history.sort(key=lambda e: e["date"])
    return history[-MAX_HISTORY:]


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not HANDLES_FILE.exists():
        print(f"ERROR: {HANDLES_FILE} not found", flush=True)
        sys.exit(1)

    with open(HANDLES_FILE, "r", encoding="utf-8") as f:
        handles_cfg = json.load(f)

    snap_data = load_snapshots()
    models    = handles_cfg.get("models", [])

    for model in models:
        mid  = model["id"]
        name = model.get("name", mid)
        print(f"\n── {name} ({mid}) ──", flush=True)

        if mid not in snap_data["snapshots"]:
            snap_data["snapshots"][mid] = {}

        model_snap = snap_data["snapshots"][mid]

        # Instagram
        ig_handle = model.get("instagram")
        if ig_handle:
            print(f"  Fetching Instagram @{ig_handle} ...", flush=True)
            followers = fetch_instagram(ig_handle)
            if followers is not None:
                print(f"  IG followers: {followers:,}", flush=True)
                if "instagram" not in model_snap:
                    model_snap["instagram"] = {"handle": ig_handle, "history": []}
                model_snap["instagram"]["handle"]  = ig_handle
                model_snap["instagram"]["history"] = append_entry(
                    model_snap["instagram"].get("history", []), followers
                )
            else:
                print(f"  Keeping existing IG data for @{ig_handle}", flush=True)
            # Be polite — avoid hammering Instagram
            time.sleep(3)

        # TikTok
        tt_handle = model.get("tiktok")
        if tt_handle:
            print(f"  Fetching TikTok @{tt_handle} ...", flush=True)
            followers = fetch_tiktok(tt_handle)
            if followers is not None:
                print(f"  TT followers: {followers:,}", flush=True)
                if "tiktok" not in model_snap:
                    model_snap["tiktok"] = {"handle": tt_handle, "history": []}
                model_snap["tiktok"]["handle"]  = tt_handle
                model_snap["tiktok"]["history"] = append_entry(
                    model_snap["tiktok"].get("history", []), followers
                )
            else:
                print(f"  Keeping existing TT data for @{tt_handle}", flush=True)
            time.sleep(2)

    save_snapshots(snap_data)
    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
