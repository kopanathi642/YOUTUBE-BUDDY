"""
Convert brain_yt_videos Postgres table → Unsloth/Hugging Face JSONL training dataset.

Each record becomes a chat-format instruction pair:
  system: Buddy Brain master prompt
  user:   "Generate a title/hook/description for: <niche>, <keywords>, <target>"
  assistant: {"title": "...", "hook": "...", "description": "...", "tags": [...]}

Usage:
  python brain/youtube_dataset/build_dataset.py --out brain/youtube_dataset/yt_v1 --min-views 10000
  python brain/youtube_dataset/build_dataset.py --out brain/youtube_dataset/yt_v1 --min-views 5000 --niche cooking

Requires: psycopg2-binary python-dotenv
Output: train.jsonl, val.jsonl, test.jsonl + MANIFEST.json
"""

import argparse
import hashlib
import json
import os
import random
import sys
from datetime import datetime

import psycopg2
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Master system prompt (Buddy Brain identity)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are Buddy Brain, an expert YouTube content strategist for Indian creators.
You understand what makes videos go viral on YouTube India — emotional hooks, curiosity gaps,
regional language mixing (Hinglish), thumbnail-title synergy, and niche-specific patterns.

Given a niche, some keywords, and a target audience, you output a JSON object with:
- title: a compelling YouTube title (max 70 chars), optimised for CTR
- hook: the first 15 seconds script (what the creator should say to keep viewers watching)
- description: YouTube description with keywords (150-200 words)
- tags: list of 10-15 relevant tags
- thumbnail_text: 3-5 word text overlay for the thumbnail

Rules:
- Titles should create curiosity, urgency, or promise a transformation
- Use numbers when they help ("5 Tips", "₹10,000", "100 Days")
- Mix Hindi/English naturally for Indian audiences when appropriate
- Always return valid JSON only, no markdown, no explanation
"""

# ---------------------------------------------------------------------------
# Prompt templates — varied so the model learns generalisation
# ---------------------------------------------------------------------------
USER_TEMPLATES = [
    "Create YouTube content for:\nNiche: {niche}\nKeywords: {keywords}\nChannel type: {channel_type}\nTarget views: {view_tier}",
    "I need a viral YouTube video strategy.\nTopic: {keywords}\nNiche: {niche}\nAudience: Indian {channel_type} viewers",
    "Generate content plan for a {niche} video.\nMain topic: {keywords}\nChannel size: {view_tier} views",
    "YouTube content generation:\n- Niche: {niche}\n- Topic: {keywords}\n- Format: {channel_type} video",
]

VIEW_TIERS = [
    (0,       50_000,   "small (under 50K views)"),
    (50_000,  500_000,  "growing (50K-500K views)"),
    (500_000, 5_000_000,"popular (500K-5M views)"),
    (5_000_000, 999_999_999, "viral (5M+ views)"),
]


def view_tier_label(view_count: int | None) -> str:
    if not view_count:
        return "unknown"
    for lo, hi, label in VIEW_TIERS:
        if lo <= view_count < hi:
            return label
    return "viral (5M+ views)"


def keywords_from_title(title: str, tags: list) -> str:
    """Extract 3-5 keyword phrases from title + tags."""
    words = title.replace("|", " ").replace("-", " ").split()
    # Keep words > 3 chars, dedup, limit
    kw = []
    seen = set()
    for w in words:
        w = w.strip(".,!?\"'").lower()
        if len(w) > 3 and w not in seen:
            kw.append(w)
            seen.add(w)
    # Add top tags
    for t in (tags or [])[:5]:
        if t.lower() not in seen:
            kw.append(t)
            seen.add(t.lower())
    return ", ".join(kw[:8])


def channel_type_from_niche(niche: str) -> str:
    mapping = {
        "cooking":  "food & cooking",
        "tech":     "tech review",
        "gaming":   "gaming",
        "finance":  "personal finance",
        "fitness":  "health & fitness",
        "comedy":   "entertainment",
        "study":    "education",
        "channel":  "general",
    }
    return mapping.get(niche, niche or "general")


def build_assistant_output(row: dict) -> dict:
    """Build the expected JSON output from a real video's metadata."""
    title = row["title"] or ""
    description = (row["description"] or "")[:500]
    tags = row["tags"] or []

    # Thumbnail text heuristic: take first 4 words of title
    words = title.split()
    thumb = " ".join(words[:4]).upper() if words else title[:20].upper()

    # Hook heuristic: first sentence of description, or title reframed as a question
    if description and len(description) > 30:
        hook_base = description.split(".")[0].strip()
        hook = f"{hook_base[:100]}... Stay till the end!"
    else:
        hook = f"Kya aap jaante ho {title[:60]}? Aaj main aapko sab kuch bataunga!"

    return {
        "title":          title[:70],
        "hook":           hook[:200],
        "description":    description[:500] if description else f"Watch this video about {title}.",
        "tags":           tags[:15],
        "thumbnail_text": thumb[:30],
    }


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_conn():
    load_dotenv(os.path.join(os.path.dirname(__file__), "../../deploy/home/.env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not found in deploy/home/.env")
    return psycopg2.connect(url)


def fetch_videos(conn, min_views: int, niche: str | None, limit: int) -> list[dict]:
    sql = """
    SELECT video_id, channel_name, title, description, tags,
           view_count, niche, upload_date
    FROM brain_yt_videos
    WHERE view_count >= %s
      AND title IS NOT NULL
      AND length(title) > 10
    """
    params: list = [min_views]
    if niche:
        sql += " AND niche = %s"
        params.append(niche)
    sql += " ORDER BY view_count DESC LIMIT %s"
    params.append(limit)

    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def make_record(row: dict, idx: int) -> dict:
    niche   = row.get("niche") or "general"
    kw      = keywords_from_title(row["title"], row.get("tags") or [])
    ch_type = channel_type_from_niche(niche)
    tier    = view_tier_label(row.get("view_count"))

    template = USER_TEMPLATES[idx % len(USER_TEMPLATES)]
    user_msg = template.format(niche=niche, keywords=kw, channel_type=ch_type, view_tier=tier)
    assistant_obj = build_assistant_output(row)

    return {
        "id": f"yt-{row['video_id']}",
        "source_video_id": row["video_id"],
        "source_views": row.get("view_count"),
        "messages": [
            {"role": "system",    "content": SYSTEM_PROMPT.strip()},
            {"role": "user",      "content": user_msg.strip()},
            {"role": "assistant", "content": json.dumps(assistant_obj, ensure_ascii=False)},
        ],
    }


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def write_split(records: list[dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description="Build Buddy Brain YouTube training dataset")
    ap.add_argument("--out",       required=True, help="Output directory e.g. brain/youtube_dataset/yt_v1")
    ap.add_argument("--min-views", type=int, default=10_000, help="Minimum view count filter (default 10000)")
    ap.add_argument("--niche",     type=str, default=None,   help="Filter to one niche")
    ap.add_argument("--limit",     type=int, default=50_000, help="Max rows to fetch from DB")
    ap.add_argument("--seed",      type=int, default=42)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    conn = get_conn()
    print(f"Fetching videos (min_views={args.min_views:,}, niche={args.niche or 'all'}) ...", flush=True)
    rows = fetch_videos(conn, args.min_views, args.niche, args.limit)
    conn.close()

    if not rows:
        print("No videos found. Run the scraper first:\n  python brain/youtube_scraper/scrape.py --all-niches --max 500")
        sys.exit(1)

    print(f"Fetched {len(rows):,} videos.", flush=True)

    rng = random.Random(args.seed)
    rng.shuffle(rows)

    records = [make_record(r, i) for i, r in enumerate(rows)]

    # 80 / 10 / 10 split
    n = len(records)
    n_train = int(n * 0.80)
    n_val   = int(n * 0.10)
    train   = records[:n_train]
    val     = records[n_train:n_train + n_val]
    test    = records[n_train + n_val:]

    train_path = os.path.join(args.out, "train.jsonl")
    val_path   = os.path.join(args.out, "val.jsonl")
    test_path  = os.path.join(args.out, "test.jsonl")

    write_split(train, train_path)
    write_split(val,   val_path)
    write_split(test,  test_path)

    manifest = {
        "dataset_version": os.path.basename(args.out),
        "built_at":        datetime.utcnow().isoformat() + "Z",
        "source":          "brain_yt_videos Postgres table",
        "min_views_filter": args.min_views,
        "niche_filter":    args.niche,
        "warning":         "Labels derived from real YouTube metadata. High-view videos used as positive examples.",
        "files": [
            {"split": "train", "file": "train.jsonl", "records": len(train), "sha256": sha256_file(train_path)},
            {"split": "val",   "file": "val.jsonl",   "records": len(val),   "sha256": sha256_file(val_path)},
            {"split": "test",  "file": "test.jsonl",  "records": len(test),  "sha256": sha256_file(test_path)},
        ],
    }
    with open(os.path.join(args.out, "MANIFEST.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDataset written to {args.out}/")
    print(f"  train: {len(train):,}  val: {len(val):,}  test: {len(test):,}")
    print(f"  MANIFEST.json written")


if __name__ == "__main__":
    main()
