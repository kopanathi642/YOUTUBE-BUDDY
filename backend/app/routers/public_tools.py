"""Free YouTube tools that anyone can use without an account (public pages under /tools).

Only public data: YouTube's search suggestions, a channel's public page/feed. Rate-limited per IP and cached, because
these endpoints are open to the internet. Everything we return is plain data; the page shows it as text, never as HTML.
"""
from __future__ import annotations

import json
import os
import threading
import time

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from .. import channel_insights, youtube
from ..security import RateLimiter
from ..shield import client_ip

router = APIRouter(prefix="/public", tags=["public-tools"])
limiter = RateLimiter(limit=40, window_s=60)
SUGGEST = lambda: os.environ.get("YT_SUGGEST_URL", "https://suggestqueries.google.com/complete/search")  # noqa: E731
_cache: dict[str, tuple[float, object]] = {}
_lock = threading.Lock()
TTL = 3600


def _cached(key: str, fn):
    with _lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    val = fn()
    with _lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[key] = (time.time(), val)
    return val


def _suggest(q: str, lang: str) -> list[str]:
    try:
        r = httpx.get(SUGGEST(), params={"client": "firefox", "ds": "yt", "hl": lang, "gl": "IN", "q": q}, timeout=10,
                      headers={"User-Agent": "Mozilla/5.0"})
        data = json.loads(r.content.decode("utf-8", "replace")) if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return []
    return [str(s)[:120] for s in (data[1] if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list) else [])][:10]


@router.get("/keywords")
def keywords(request: Request, q: str = Query(..., min_length=2, max_length=80), lang: str = "en"):
    """What people actually type into YouTube search around a topic (YouTube's own autocomplete), India region."""
    limiter.check(f"kw:{client_ip(request)}")
    q = " ".join(q.split()).lower()
    lang = lang if lang in ("en", "hi", "te", "ta", "bn", "mr", "kn", "ml", "gu") else "en"

    def run():
        seen, groups = set(), []
        for label, query in [("Popular searches", q), ("How-to searches", f"how to {q}"), ("Best / top", f"best {q}"),
                             ("Hindi phrasing", f"{q} kaise"), ("For beginners", f"{q} for beginners")]:
            items = [s for s in _suggest(query, lang) if s not in seen]
            seen.update(items)
            if items:
                groups.append({"label": label, "items": items})
        return {"query": q, "groups": groups, "total": len(seen)}
    out = _cached(f"kw:{lang}:{q}", run)
    if not out["total"]:
        raise HTTPException(502, "YouTube didn't return suggestions right now — try again in a minute")
    return out


@router.get("/channel")
def channel(request: Request, ref: str = Query(..., min_length=2, max_length=300)):
    """Channel ID, name, feed link and latest public uploads from a channel link or @handle."""
    limiter.check(f"ch:{client_ip(request)}")
    try:
        cid = channel_insights.resolve_channel(ref)
        data = _cached(f"ch:{cid}", lambda: channel_insights._from_feed(cid))
    except youtube.YouTubeError as e:
        raise HTTPException(422, str(e))
    return {"id": cid, "title": data["channel"]["title"], "url": f"https://www.youtube.com/channel/{cid}",
            "rss": f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}",
            "videos": [{"id": v["id"], "title": v["title"], "url": f"https://www.youtube.com/watch?v={v['id']}",
                        "published_at": v["published_at"], "views": v["views"]} for v in data["videos"]]}


@router.get("/audit")
def audit(request: Request, ref: str = Query(..., min_length=2, max_length=300), tz: str = "Asia/Kolkata"):
    """Free channel audit: the same analysis as My channel, from public numbers only."""
    limiter.check(f"audit:{client_ip(request)}")
    try:
        return channel_insights.public_insights(ref, tz if len(tz) <= 64 else "Asia/Kolkata")
    except youtube.YouTubeError as e:
        raise HTTPException(422, str(e))
