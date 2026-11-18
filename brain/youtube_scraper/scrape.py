"""
YouTube data scraper for Buddy Brain training.
Collects video metadata from YouTube into Postgres.

Usage:
  python brain/youtube_scraper/scrape.py --channels @MrBeast @TechBurner --max 500
  python brain/youtube_scraper/scrape.py --query "cooking india" --max 1000
  python brain/youtube_scraper/scrape.py --niches cooking tech gaming --max 2000

Requires:
  pip install yt-dlp psycopg2-binary python-dotenv
  DATABASE_URL in deploy/home/.env  (same Postgres as the app)

Output table: brain_yt_videos (auto-created)
"""

import argparse
import json
import os
import sys
import time
import subprocess
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
NICHES = {
    "cooking":  ["cooking india", "indian recipe", "dal recipe", "biryani recipe", "quick recipe hindi"],
    "tech":     ["tech review india", "best smartphone india", "laptop review hindi"],
    "gaming":   ["gaming india", "free fire tips", "bgmi tips hindi"],
    "finance":  ["stock market india", "mutual fund hindi", "paisa invest kaise kare"],
    "fitness":  ["gym workout hindi", "weight loss india", "yoga beginners hindi"],
    "comedy":   ["comedy india", "standup hindi", "funny video india"],
    "study":    ["study tips hindi", "board exam preparation", "jee neet tips"],
}

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS brain_yt_videos (
    id              SERIAL PRIMARY KEY,
    video_id        TEXT UNIQUE NOT NULL,
    channel_id      TEXT,
    channel_name    TEXT,
    title           TEXT NOT NULL,
    description     TEXT,
    tags            TEXT[],
    view_count      BIGINT,
    like_count      BIGINT,
    comment_count   BIGINT,
    duration_s      INTEGER,
    upload_date     DATE,
    thumbnail_url   TEXT,
    niche           TEXT,
    query_used      TEXT,
    scraped_at      TIMESTAMP DEFAULT NOW(),
    raw_json        JSONB
);
CREATE INDEX IF NOT EXISTS brain_yt_views  ON brain_yt_videos(view_count DESC);
CREATE INDEX IF NOT EXISTS brain_yt_niche  ON brain_yt_videos(niche);
CREATE INDEX IF NOT EXISTS brain_yt_date   ON brain_yt_videos(upload_date DESC);
"""

# ---------------------------------------------------------------------------
# Scrape with yt-dlp
# ---------------------------------------------------------------------------
def scrape_query(query: str, max_results: int, niche: str) -> list[dict]:
    """Use yt-dlp to search YouTube and return metadata dicts."""
    cmd = [
        "yt-dlp",
        f"ytsearch{max_results}:{query}",
        "--dump-json",
        "--no-download",
        "--no-playlist",
        "--ignore-errors",
        "--quiet",
        "--flat-playlist",
        "--extractor-args", "youtube:skip=hls,dash",
    ]
    print(f"  Searching: {query!r} (max {max_results}) ...", flush=True)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        print("  TIMEOUT — skipping query", flush=True)
        return []

    videos = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            info = json.loads(line)
        except json.JSONDecodeError:
            continue
        vid = _parse_info(info, niche, query)
        if vid:
            videos.append(vid)
    print(f"  → {len(videos)} videos parsed", flush=True)
    return videos


def scrape_channel(channel: str, max_results: int, niche: str) -> list[dict]:
    """Scrape all videos from a channel handle or URL."""
    # Normalise handle
    if not channel.startswith("http"):
        channel = f"https://www.youtube.com/{channel}/videos"
    cmd = [
        "yt-dlp",
        channel,
        "--dump-json",
        "--no-download",
        "--ignore-errors",
        "--quiet",
        "--flat-playlist",
        f"--max-downloads={max_results}",
        "--extractor-args", "youtube:skip=hls,dash",
    ]
    print(f"  Channel: {channel} (max {max_results}) ...", flush=True)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        print("  TIMEOUT — skipping channel", flush=True)
        return []

    videos = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            info = json.loads(line)
        except json.JSONDecodeError:
            continue
        vid = _parse_info(info, niche, channel)
        if vid:
            videos.append(vid)
    print(f"  → {len(videos)} videos parsed", flush=True)
    return videos


def _parse_info(info: dict, niche: str, query: str) -> dict | None:
    video_id = info.get("id") or info.get("display_id")
    title    = info.get("title", "").strip()
    if not video_id or not title or title == "[Deleted video]":
        return None
    return {
        "video_id":      video_id,
        "channel_id":    info.get("channel_id") or info.get("uploader_id"),
        "channel_name":  info.get("channel") or info.get("uploader"),
        "title":         title[:500],
        "description":   (info.get("description") or "")[:2000],
        "tags":          info.get("tags") or [],
        "view_count":    info.get("view_count"),
        "like_count":    info.get("like_count"),
        "comment_count": info.get("comment_count"),
        "duration_s":    info.get("duration"),
        "upload_date":   _parse_date(info.get("upload_date")),
        "thumbnail_url": info.get("thumbnail"),
        "niche":         niche,
        "query_used":    query[:200],
        "raw_json":      json.dumps({k: info.get(k) for k in
                         ("id","title","view_count","like_count","duration","upload_date","tags")}),
    }


def _parse_date(d: str | None) -> str | None:
    """YYYYMMDD → YYYY-MM-DD."""
    if d and len(d) == 8 and d.isdigit():
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return None


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_conn():
    load_dotenv(os.path.join(os.path.dirname(__file__), "../../deploy/home/.env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not found in deploy/home/.env")
    return psycopg2.connect(url)


def ensure_table(conn):
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE)
    conn.commit()
    print("Table brain_yt_videos ready.", flush=True)


def upsert_videos(conn, videos: list[dict]) -> int:
    if not videos:
        return 0
    rows = [(
        v["video_id"], v["channel_id"], v["channel_name"],
        v["title"], v["description"], v["tags"],
        v["view_count"], v["like_count"], v["comment_count"],
        v["duration_s"], v["upload_date"], v["thumbnail_url"],
        v["niche"], v["query_used"], v["raw_json"],
    ) for v in videos]

    sql = """
    INSERT INTO brain_yt_videos
      (video_id, channel_id, channel_name, title, description, tags,
       view_count, like_count, comment_count, duration_s, upload_date,
       thumbnail_url, niche, query_used, raw_json)
    VALUES %s
    ON CONFLICT (video_id) DO UPDATE SET
      view_count    = EXCLUDED.view_count,
      like_count    = EXCLUDED.like_count,
      comment_count = EXCLUDED.comment_count,
      scraped_at    = NOW()
    """
    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    conn.commit()
    return len(rows)


def print_stats(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT niche, COUNT(*) FROM brain_yt_videos GROUP BY niche ORDER BY COUNT(*) DESC")
        rows = cur.fetchall()
    print("\n── Database stats ──────────────────")
    total = 0
    for niche, cnt in rows:
        print(f"  {niche or 'unknown':15s} {cnt:6,}")
        total += cnt
    print(f"  {'TOTAL':15s} {total:6,}")
    print("────────────────────────────────────")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Scrape YouTube metadata for Buddy Brain training")
    ap.add_argument("--channels", nargs="*", default=[], help="Channel handles e.g. @MrBeast")
    ap.add_argument("--query",    type=str,  default=None, help="Single search query")
    ap.add_argument("--niches",   nargs="*", default=[], help=f"Niche keys: {list(NICHES)}")
    ap.add_argument("--max",      type=int,  default=200, help="Max results per query")
    ap.add_argument("--all-niches", action="store_true", help="Scrape all built-in niches")
    args = ap.parse_args()

    if not any([args.channels, args.query, args.niches, args.all_niches]):
        print("Nothing to scrape. Use --channels, --query, --niches, or --all-niches")
        ap.print_help()
        sys.exit(1)

    conn = get_conn()
    ensure_table(conn)

    total_saved = 0

    # Channels
    for ch in args.channels:
        videos = scrape_channel(ch, args.max, niche="channel")
        saved  = upsert_videos(conn, videos)
        total_saved += saved
        print(f"  Saved {saved} from {ch}", flush=True)
        time.sleep(2)

    # Single query
    if args.query:
        videos = scrape_query(args.query, args.max, niche="custom")
        saved  = upsert_videos(conn, videos)
        total_saved += saved
        print(f"  Saved {saved}", flush=True)

    # Niche queries
    niche_keys = list(NICHES.keys()) if args.all_niches else args.niches
    for niche in niche_keys:
        queries = NICHES.get(niche)
        if not queries:
            print(f"Unknown niche: {niche}. Available: {list(NICHES)}")
            continue
        for q in queries:
            videos = scrape_query(q, args.max, niche=niche)
            saved  = upsert_videos(conn, videos)
            total_saved += saved
            print(f"  Saved {saved} [{niche}]", flush=True)
            time.sleep(3)  # be polite to YouTube

    print(f"\nDone. Total saved/updated: {total_saved:,}")
    print_stats(conn)
    conn.close()


if __name__ == "__main__":
    main()
