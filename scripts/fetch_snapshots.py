#!/usr/bin/env python3
"""
CelebClub · Daily Snapshot Fetcher
-----------------------------------
1. Reads ALL Instagram accounts from social_accounts table (multiple per model).
2. For each handle: fetches follower count → upserts into follower_snapshots.
3. For each handle: fetches recent posts (likes, comments, views)
                  → upserts into post_snapshots.

TikTok and YouTube are intentionally excluded — analytics focus on Instagram.

Required environment variables (GitHub Secrets):
  SUPABASE_URL          – https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  – service_role key (bypasses RLS)
  RAPIDAPI_KEY          – RapidAPI key for instagram-scraper-20251
"""

import os
import re
import sys
import time
from datetime import date, datetime, timezone

import requests

TODAY      = date.today().isoformat()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", flush=True)
    sys.exit(1)

if not RAPIDAPI_KEY:
    print("ERROR: RAPIDAPI_KEY must be set", flush=True)
    sys.exit(1)

HEADERS_SB = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}

RAPIDAPI_HOST    = "instagram-scraper-20251.p.rapidapi.com"
HEADERS_RAPID    = {
    "X-RapidAPI-Key":  RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
}


# ── Supabase helpers ─────────────────────────────────────────────────────────

def get_instagram_accounts() -> list[dict]:
    """
    Return all Instagram accounts.
    Primary source: social_accounts table (supports multiple handles per model).
    Fallback: models.instagram column (single handle, legacy).
    Each entry: { model_id, model_name, handle }
    """
    # ── Primary: social_accounts ─────────────────────────────────
    url = (
        f"{SUPABASE_URL}/rest/v1/social_accounts"
        "?select=model_id,username,models(name)"
        "&platform=eq.instagram"
        "&order=model_id"
    )
    r = requests.get(url, headers=HEADERS_SB, timeout=15)
    r.raise_for_status()
    rows = r.json()

    if rows:
        accounts = []
        for row in rows:
            accounts.append({
                "model_id":   row["model_id"],
                "model_name": (row.get("models") or {}).get("name", row["model_id"]),
                "handle":     row["username"].lstrip("@"),
            })
        return accounts

    # ── Fallback: models.instagram ───────────────────────────────
    print("  [INFO] social_accounts is empty — falling back to models.instagram column.", flush=True)
    print("  [INFO] Run scripts/migrate_add_post_snapshots.sql in Supabase to populate", flush=True)
    print("         social_accounts (enables multiple handles per model).\n", flush=True)

    url2 = f"{SUPABASE_URL}/rest/v1/models?select=id,name,instagram&instagram=not.is.null"
    r2   = requests.get(url2, headers=HEADERS_SB, timeout=15)
    r2.raise_for_status()

    accounts = []
    for m in r2.json():
        ig = (m.get("instagram") or "").strip().lstrip("@")
        if ig:
            accounts.append({
                "model_id":   m["id"],
                "model_name": m.get("name", m["id"]),
                "handle":     ig,
            })
    return accounts


def upsert_follower_snapshot(model_id: str, handle: str, followers: int):
    url     = f"{SUPABASE_URL}/rest/v1/follower_snapshots"
    payload = {
        "model_id":  model_id,
        "platform":  "instagram",
        "handle":    handle,
        "date":      TODAY,
        "followers": followers,
    }
    hdrs = {**HEADERS_SB, "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, headers=hdrs, json=payload, timeout=15)
    r.raise_for_status()
    print(f"    ✓ Followers saved: {followers:,}", flush=True)


def upsert_post_snapshot(model_id: str, handle: str, post: dict):
    url     = f"{SUPABASE_URL}/rest/v1/post_snapshots"
    payload = {
        "model_id":  model_id,
        "handle":    handle,
        "post_id":   post["post_id"],
        "shortcode": post.get("shortcode"),
        "post_url":  post.get("post_url"),
        "caption":   (post.get("caption") or "")[:500],  # cap length
        "posted_at": post.get("posted_at"),
        "likes":     post.get("likes", 0),
        "comments":  post.get("comments", 0),
        "views":     post.get("views", 0),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    hdrs = {**HEADERS_SB, "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, headers=hdrs, json=payload, timeout=15)
    r.raise_for_status()


# ── RapidAPI helpers ─────────────────────────────────────────────────────────

def _dig(obj, *keys):
    """Safely traverse a nested dict; returns None if any key is missing."""
    for k in keys:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj


def rapidapi_get(endpoint: str, params: dict) -> dict | None:
    """GET from RapidAPI; returns parsed JSON or None on error."""
    try:
        r = requests.get(
            f"https://{RAPIDAPI_HOST}/{endpoint.lstrip('/')}",
            params=params,
            headers=HEADERS_RAPID,
            timeout=25,
        )
        if r.status_code == 404:
            print(f"    [WARN] RapidAPI {endpoint} → 404 (endpoint may not exist)", flush=True)
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"    [WARN] RapidAPI {endpoint} failed: {e}", flush=True)
        return None


# ── Instagram: follower count ─────────────────────────────────────────────────

def fetch_followers(handle: str) -> int | None:
    data = rapidapi_get("/userinfo/", {"username_or_id": handle})
    if not data:
        return None

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

    print(f"    [WARN] Could not find follower_count in /userinfo/ response. "
          f"Top-level keys: {list(data.keys())}", flush=True)
    return None


# ── Instagram: recent posts ───────────────────────────────────────────────────

def _parse_timestamp(ts) -> str | None:
    """Convert Unix timestamp or ISO string to ISO 8601 string."""
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        return str(ts)
    except Exception:
        return None


def _normalise_post(raw: dict) -> dict | None:
    """
    Extract a normalised post dict from a raw API row.
    Returns None if post_id cannot be determined.
    """
    post_id = (
        _dig(raw, "id") or
        _dig(raw, "pk") or
        _dig(raw, "media_id")
    )
    if not post_id:
        return None

    shortcode = _dig(raw, "shortcode") or _dig(raw, "code")
    post_url  = (
        _dig(raw, "url") or
        _dig(raw, "permalink") or
        (f"https://www.instagram.com/p/{shortcode}/" if shortcode else None)
    )

    # Caption
    caption = (
        _dig(raw, "caption") or
        _dig(raw, "caption_text") or
        _dig(raw, "edge_media_to_caption", "edges", 0, "node", "text") or
        ""
    )
    if isinstance(caption, dict):
        caption = caption.get("text", "")

    # Timestamp
    posted_at = _parse_timestamp(
        _dig(raw, "taken_at") or
        _dig(raw, "timestamp") or
        _dig(raw, "taken_at_timestamp")
    )

    # Metrics
    likes = int(
        _dig(raw, "like_count") or
        _dig(raw, "likes", "count") or
        _dig(raw, "edge_liked_by", "count") or
        _dig(raw, "edge_media_preview_like", "count") or 0
    )
    comments = int(
        _dig(raw, "comment_count") or
        _dig(raw, "comments_count") or
        _dig(raw, "edge_media_to_comment", "count") or 0
    )
    views = int(
        _dig(raw, "view_count") or
        _dig(raw, "video_view_count") or
        _dig(raw, "play_count") or 0
    )

    return {
        "post_id":   str(post_id),
        "shortcode": shortcode,
        "post_url":  post_url,
        "caption":   caption,
        "posted_at": posted_at,
        "likes":     likes,
        "comments":  comments,
        "views":     views,
    }


def fetch_posts(handle: str) -> list[dict]:
    """
    Try multiple endpoint patterns to get recent posts.
    Returns a list of normalised post dicts (may be empty).
    """
    # Endpoints to try in order
    endpoints = [
        ("/userposts/",      {"username_or_id": handle, "count": 20}),
        ("/user/posts/",     {"username_or_id": handle, "count": 20}),
        ("/posts/",          {"username_or_id": handle}),
        ("/media/",          {"username_or_id": handle}),
    ]

    for endpoint, params in endpoints:
        data = rapidapi_get(endpoint, params)
        if data is None:
            continue

        # Find the posts list — try common response shapes
        raw_list = (
            _dig(data, "posts") or
            _dig(data, "data", "posts") or
            _dig(data, "items") or
            _dig(data, "data", "items") or
            _dig(data, "medias") or
            _dig(data, "data", "medias") or
            _dig(data, "data", "user", "edge_owner_to_timeline_media", "edges")
        )

        if raw_list and isinstance(raw_list, list):
            posts = []
            for item in raw_list:
                # GraphQL edges wrap the actual node
                if "node" in item:
                    item = item["node"]
                p = _normalise_post(item)
                if p:
                    posts.append(p)
            if posts:
                print(f"    ✓ {len(posts)} posts found via {endpoint}", flush=True)
                return posts

        # If we got data but couldn't parse it, log top-level keys for debugging
        if data:
            print(f"    [INFO] {endpoint} responded but posts not found. "
                  f"Top-level keys: {list(data.keys())}", flush=True)
            # Return empty so we don't retry the remaining endpoints
            # (we got a 200 — just couldn't parse)
            return []

    print("    [WARN] No working posts endpoint found for this API plan.", flush=True)
    return []


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"CelebClub Snapshot Fetcher — {TODAY}", flush=True)
    print("Reading Instagram accounts from social_accounts table...\n", flush=True)

    try:
        accounts = get_instagram_accounts()
    except Exception as e:
        print(f"ERROR: Could not fetch social_accounts: {e}", flush=True)
        sys.exit(1)

    if not accounts:
        print("No Instagram accounts found in social_accounts table.", flush=True)
        print("→ Add accounts via the dashboard or directly in Supabase.", flush=True)
        return

    # Group by model for readable output
    by_model: dict[str, list] = {}
    for acc in accounts:
        by_model.setdefault(acc["model_id"], []).append(acc)

    print(f"Found {len(accounts)} Instagram account(s) across "
          f"{len(by_model)} model(s).\n", flush=True)

    for model_id, accs in by_model.items():
        model_name = accs[0]["model_name"]
        print(f"══ {model_name} ({len(accs)} IG account(s)) ══", flush=True)

        for acc in accs:
            handle = acc["handle"]
            print(f"  @{handle}", flush=True)

            # ── Follower count ───────────────────────────────────
            print("    Fetching followers...", flush=True)
            followers = fetch_followers(handle)
            if followers is not None:
                try:
                    upsert_follower_snapshot(model_id, handle, followers)
                except Exception as e:
                    print(f"    [WARN] Could not save follower snapshot: {e}", flush=True)
            else:
                print("    Skipping follower snapshot (fetch failed).", flush=True)

            time.sleep(1)

            # ── Post performance ─────────────────────────────────
            print("    Fetching recent posts...", flush=True)
            posts = fetch_posts(handle)
            saved = 0
            for post in posts:
                try:
                    upsert_post_snapshot(model_id, handle, post)
                    saved += 1
                except Exception as e:
                    print(f"    [WARN] Could not save post {post['post_id']}: {e}", flush=True)
            if posts:
                print(f"    ✓ {saved}/{len(posts)} posts saved to post_snapshots.", flush=True)

            time.sleep(2)

        print("", flush=True)

    print("Done.", flush=True)


if __name__ == "__main__":
    main()
