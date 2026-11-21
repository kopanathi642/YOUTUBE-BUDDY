"""Channel insights for a connected YouTube channel: what works, and an honest, rule-based estimate for the next video.

Data: YouTube Data API v3 with the user's own OAuth token (youtube.readonly) — channels (1 unit) + uploads playlist (1) + videos (1)
= about 3 quota units per 50 videos; the whole channel (up to 500 videos) is read, about 20 units per refresh. Nothing here is a trained model: every number is computed from the channel's own recent
uploads and labelled as an estimate. With fewer than MIN_VIDEOS finished videos we say so instead of guessing.
"""
from __future__ import annotations

import os
import re
import statistics
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx

from . import youtube

MIN_VIDEOS = 5          # below this, no predictions
MATURE_DAYS = 3         # videos younger than this are still collecting views; left out of the estimates
SHORT_MAX_S = 180       # YouTube Shorts can be up to 3 minutes
CACHE_S = 600
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
STOP = set("""a an the and or of to in on for with is are was be this that it my your our you we i me at by from as how what why
when who vs not do does did can will just new video part ft feat official full hd 4k shorts short ki ka ke hai se me mein aur ko
kya kaise""".split())

_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()


def _get(path: str, token: str, **params) -> dict:
    if token.startswith("key:"):   # public data with the server's free API key (no Google sign-in)
        r = httpx.get(youtube.API_URL() + path, params={**params, "key": token[4:]}, timeout=20)
    else:
        r = httpx.get(youtube.API_URL() + path, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=20)
    return youtube._check(r, "channel read")


def _duration_s(iso: str) -> int:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


FULL_CHANNEL_MAX = 500   # whole channel, newest first; 10 pages of 50 = about 20 quota units per refresh


def fetch(token: str, max_videos: int = FULL_CHANNEL_MAX, channel_id: str | None = None) -> dict:
    who = {"id": channel_id} if channel_id else {"mine": "true"}
    ch = _get("/channels", token, part="snippet,statistics,contentDetails", **who).get("items") or []
    if not ch:
        raise youtube.YouTubeError("This Google account has no YouTube channel yet")
    c = ch[0]
    uploads = (c.get("contentDetails") or {}).get("relatedPlaylists", {}).get("uploads")
    ids: list[str] = []
    if uploads:   # page through the uploads playlist (50 per page) until the whole channel or max_videos is read
        page = None
        while len(ids) < max_videos:
            params = dict(part="contentDetails", playlistId=uploads, maxResults=str(min(50, max_videos - len(ids))))
            if page:
                params["pageToken"] = page
            pl = _get("/playlistItems", token, **params)
            ids += [i["contentDetails"]["videoId"] for i in pl.get("items") or [] if i.get("contentDetails", {}).get("videoId")]
            page = pl.get("nextPageToken")
            if not page:
                break
    vids = []
    for k in range(0, len(ids), 50):   # the videos endpoint takes up to 50 ids per call
        vd = _get("/videos", token, part="snippet,statistics,contentDetails", id=",".join(ids[k:k + 50]))
        for v in vd.get("items") or []:
            sn, st = v.get("snippet") or {}, v.get("statistics") or {}
            if sn.get("liveBroadcastContent") in ("live", "upcoming"):
                continue
            vids.append({"id": v["id"], "title": sn.get("title", ""), "published_at": sn.get("publishedAt"),
                         "thumbnail": ((sn.get("thumbnails") or {}).get("medium") or {}).get("url"),
                         "duration_s": _duration_s((v.get("contentDetails") or {}).get("duration", "")),
                         "views": int(st.get("viewCount") or 0), "likes": int(st.get("likeCount") or 0),
                         "comments": int(st.get("commentCount") or 0)})
    s = c.get("statistics") or {}
    return {"channel": {"id": c["id"], "title": (c.get("snippet") or {}).get("title", ""),
                        "thumbnail": (((c.get("snippet") or {}).get("thumbnails") or {}).get("default") or {}).get("url"),
                        "subscribers": None if s.get("hiddenSubscriberCount") else int(s.get("subscriberCount") or 0),
                        "views": int(s.get("viewCount") or 0), "videos": int(s.get("videoCount") or 0)},
            "videos": vids}


def _q(xs: list[float], p: float) -> float:
    xs = sorted(xs)
    if len(xs) == 1:
        return xs[0]
    k = (len(xs) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def _words(title: str) -> set[str]:
    return {w for w in re.findall(r"[^\W\d_]{3,}", title.lower()) if w not in STOP}


def _len_bucket(sec: int) -> str:
    if sec <= SHORT_MAX_S:
        return "Short (≤ 3 min)"
    if sec < 480:
        return "3–8 min"
    if sec < 1200:
        return "8–20 min"
    return "20 min +"


def analyze(data: dict, tz: str = "Asia/Kolkata", now: datetime | None = None) -> dict:
    """Pure: turns fetch() output into insights. Every estimate is a range from the channel's own history."""
    now = now or datetime.now(timezone.utc)
    try:
        zone = ZoneInfo(tz)
    except Exception:
        zone, tz = ZoneInfo("Asia/Kolkata"), "Asia/Kolkata"
    vids = []
    for v in data["videos"]:
        try:
            pub = datetime.fromisoformat(v["published_at"].replace("Z", "+00:00"))
        except (AttributeError, ValueError, TypeError):
            continue
        age = max((now - pub).total_seconds() / 86400, 0.0)
        local = pub.astimezone(zone)
        dur = v.get("duration_s")
        fmt = "video" if dur is None else ("short" if 0 < dur <= SHORT_MAX_S else "long")   # the public feed has no durations
        vids.append({**v, "age_days": round(age, 1), "weekday": local.weekday(), "hour": local.hour, "format": fmt,
                     "engagement": round(100 * ((v.get("likes") or 0) + (v.get("comments") or 0)) / v["views"], 2) if v["views"] else 0.0})
    vids.sort(key=lambda v: v["published_at"], reverse=True)
    mature = [v for v in vids if v["age_days"] >= MATURE_DAYS]
    out = {"channel": data["channel"], "timezone": tz, "analysed_videos": len(vids), "mature_videos": len(mature),
           "recent": [{k: v[k] for k in ("id", "title", "published_at", "thumbnail", "duration_s", "views", "likes", "comments",
                                         "engagement", "format", "age_days")} for v in vids[:12]],
           "method": f"Computed from your last {len(vids)} public uploads. Videos younger than {MATURE_DAYS} days are left out of the "
                     "estimates because they are still collecting views. These are estimates from your own history, not guarantees.",
           "enough_data": len(mature) >= MIN_VIDEOS}
    if not out["enough_data"]:
        out["message"] = (f"Upload at least {MIN_VIDEOS} videos (each {MATURE_DAYS}+ days old) to get estimates — "
                          f"you have {len(mature)} so far.")
        return out

    views = [v["views"] for v in mature]
    med = statistics.median(views)
    out["summary"] = {"median_views": round(med), "p25_views": round(_q(views, .25)), "p75_views": round(_q(views, .75)),
                      "median_engagement": round(statistics.median(v["engagement"] for v in mature), 2)}
    gaps = [(datetime.fromisoformat(a["published_at"].replace("Z", "+00:00")) - datetime.fromisoformat(b["published_at"].replace("Z", "+00:00"))).total_seconds() / 86400
            for a, b in zip(vids, vids[1:])]
    out["summary"]["upload_every_days"] = round(statistics.median(gaps), 1) if gaps else None

    def groups(key, label, min_n=2):
        g = defaultdict(list)
        for v in mature:
            g[key(v)].append(v["views"])
        rows = [{"label": label(k), "videos": len(xs), "median_views": round(statistics.median(xs)),
                 "vs_channel": round(statistics.median(xs) / med, 2) if med else None} for k, xs in g.items() if len(xs) >= min_n]
        return sorted(rows, key=lambda r: -r["median_views"])

    out["by_weekday"] = groups(lambda v: v["weekday"], lambda k: WEEKDAYS[k])
    out["by_time"] = groups(lambda v: v["hour"] // 3, lambda k: f"{k * 3:02d}:00–{k * 3 + 3:02d}:00")
    has_dur = all(v.get("duration_s") is not None for v in mature)
    out["by_length"] = groups(lambda v: _len_bucket(v["duration_s"]), lambda k: k) if has_dur else []
    out["by_format"] = groups(lambda v: v["format"], lambda k: {"short": "Shorts", "long": "Long videos"}[k]) if has_dur else []

    wv = defaultdict(list)
    for v in mature:
        for w in _words(v["title"]):
            wv[w].append(v["views"])
    kw = [{"word": w, "videos": len(xs), "median_views": round(statistics.median(xs)), "vs_channel": round(statistics.median(xs) / med, 2)}
          for w, xs in wv.items() if len(xs) >= 2 and med]
    out["title_words"] = {"strong": sorted([k for k in kw if k["vs_channel"] >= 1.2], key=lambda k: -k["vs_channel"])[:8],
                          "weak": sorted([k for k in kw if k["vs_channel"] <= 0.8], key=lambda k: k["vs_channel"])[:5]}
    best = sorted(mature, key=lambda v: -v["views"])[:3]
    out["top_videos"] = [{"id": v["id"], "title": v["title"], "views": v["views"], "vs_channel": round(v["views"] / med, 2) if med else None}
                         for v in best]

    # next-video estimate: the format the channel posts most recently, from the last 15 mature videos of that format
    fmt = vids[0]["format"]
    same = [v["views"] for v in mature if v["format"] == fmt][:15] or views[:15]
    pred = {"format": {"short": "Short", "long": "Long video", "video": "Video"}[fmt], "based_on": len(same),
            "low": round(_q(same, .25)), "typical": round(statistics.median(same)), "high": round(_q(same, .75)),
            "window_days": 30, "confidence": "low" if len(same) < 8 else ("medium" if len(same) < 15 else "fair")}
    trend = None
    if len(same) >= 6:
        recent, older = statistics.median(same[:len(same) // 2]), statistics.median(same[len(same) // 2:])
        trend = round(recent / older, 2) if older else None
    pred["trend"] = trend
    out["next_video"] = pred

    tips = []
    if out["by_weekday"] and out["by_weekday"][0]["vs_channel"] and out["by_weekday"][0]["vs_channel"] >= 1.15 and out["by_weekday"][0]["videos"] >= 3:
        b = out["by_weekday"][0]
        tips.append(f"Your {b['label']} uploads get {b['vs_channel']}× your usual views ({b['videos']} videos) — try publishing on {b['label']}.")
    if out["by_time"] and out["by_time"][0]["vs_channel"] and out["by_time"][0]["vs_channel"] >= 1.15 and out["by_time"][0]["videos"] >= 3:
        b = out["by_time"][0]
        tips.append(f"Videos published {b['label']} ({tz}) do best: {b['vs_channel']}× usual views.")
    if len(out["by_format"]) == 2:
        a, b = out["by_format"]
        if a["vs_channel"] and b["vs_channel"] and a["median_views"] >= 1.3 * max(b["median_views"], 1):
            tips.append(f"{a['label']} get {round(a['median_views'] / max(b['median_views'], 1), 1)}× the views of {b['label'].lower()} on your channel.")
    if out["by_length"] and len(out["by_length"]) > 1 and out["by_length"][0]["vs_channel"] and out["by_length"][0]["vs_channel"] >= 1.2:
        tips.append(f"Length that works best for you: {out['by_length'][0]['label']} ({out['by_length'][0]['vs_channel']}× usual views).")
    if out["title_words"]["strong"]:
        tips.append("Topics/words in your best titles: " + ", ".join(f"“{k['word']}”" for k in out["title_words"]["strong"][:4]) + ".")
    if trend is not None and trend < 0.75:
        tips.append("Your recent videos are getting fewer views than earlier ones — revisit the topics of your top videos below.")
    elif trend is not None and trend > 1.3:
        tips.append("Your recent videos are trending up — keep the same style and upload rhythm.")
    ue = out["summary"]["upload_every_days"]
    if ue and ue > 10:
        tips.append(f"You upload about every {ue} days. A steadier schedule (e.g. weekly) usually helps viewers come back.")
    out["tips"] = tips or ["No clear pattern yet — keep uploading; the estimates get better with more videos."]
    out["ideas"] = [f"A follow-up to “{v['title'][:70]}” ({v['vs_channel']}× your usual views)" for v in out["top_videos"] if (v["vs_channel"] or 0) >= 1.3]
    return out


def insights(user_id: str, refresh_token: str, tz: str, refresh: bool = False) -> dict:
    with _lock:
        hit = _cache.get(user_id)
    if hit and time.time() - hit[0] < (60 if refresh else CACHE_S):   # a forced refresh still waits 60 s (quota)
        data = hit[1]
    else:
        data = fetch(youtube.access_token(refresh_token))
        with _lock:
            _cache[user_id] = (time.time(), data)
    res = analyze(data, tz)
    res["fetched_at"] = datetime.fromtimestamp((_cache.get(user_id) or (time.time(),))[0], timezone.utc).isoformat()
    return res


def forget(user_id: str) -> None:
    with _lock:
        _cache.pop(user_id, None)


# ---------------------------------------------------------------- public analysis by channel link (no Google sign-in)
PAGE = lambda: os.environ.get("YT_PAGE_URL", "https://www.youtube.com")   # noqa: E731
FEED_MAX = 15   # YouTube's public feed lists the latest 15 uploads


def resolve_channel(ref: str) -> str:
    """Channel ID from what a creator can easily copy: a channel link, an @handle (or its link), or the UC… ID itself."""
    ref = (ref or "").strip()[:300]
    m = re.search(r"(UC[0-9A-Za-z_-]{22})", ref)
    if m:
        return m.group(1)
    h = re.search(r"@([A-Za-z0-9._-]{3,30})", ref)
    c = re.search(r"youtube\.com/(c|user)/([A-Za-z0-9._-]{1,100})", ref)
    if not h and not c:
        if re.fullmatch(r"[A-Za-z0-9._-]{3,30}", ref):
            h = re.match(r"(.*)", ref)   # a bare handle without the @
        else:
            raise youtube.YouTubeError("Paste your channel link (like youtube.com/@yourname) or your @handle")
    path = f"/@{h.group(1)}" if h else f"/{c.group(1)}/{c.group(2)}"
    key = os.environ.get("YOUTUBE_API_KEY")
    if h and key:
        d = _get("/channels", "key:" + key, part="id", forHandle="@" + h.group(1))
        if d.get("items"):
            return d["items"][0]["id"]
        raise youtube.YouTubeError(f"No YouTube channel found for @{h.group(1)}")
    try:   # no key: read the channel page itself, which names its channel ID
        r = httpx.get(PAGE() + path, headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en"}, timeout=20, follow_redirects=True)
    except httpx.HTTPError as e:
        raise youtube.YouTubeError(f"YouTube could not be reached ({type(e).__name__})")
    if r.status_code == 404:
        raise youtube.YouTubeError(f"No YouTube channel found at youtube.com{path}")
    m = re.search(r'"(?:externalId|channelId)":"(UC[0-9A-Za-z_-]{22})"', r.text) or re.search(r"/channel/(UC[0-9A-Za-z_-]{22})", r.text)
    if not m:
        raise youtube.YouTubeError("Couldn't find that channel — paste the link from your channel page")
    return m.group(1)


def _from_feed(channel_id: str) -> dict:
    from .growth_engine import GrowthError, fetch_feed
    try:
        f = fetch_feed(channel_id)
    except GrowthError as e:
        raise youtube.YouTubeError(str(e))
    vids = [{"id": v["id"], "title": v["title"], "published_at": v["published_at"].isoformat(),
             "thumbnail": f"https://i.ytimg.com/vi/{v['id']}/mqdefault.jpg", "duration_s": None,
             "views": v["views"], "likes": v["likes"] or 0, "comments": None} for v in f["videos"]]
    return {"channel": {"id": channel_id, "title": f["title"], "thumbnail": None, "subscribers": None, "views": None, "videos": None},
            "videos": vids, "limited": True}


def public_insights(ref: str, tz: str, refresh: bool = False) -> dict:
    """What works on any channel, from public numbers only. Full channel with YOUTUBE_API_KEY, else the latest 15 uploads."""
    cid = resolve_channel(ref)
    ck = "pub:" + cid
    with _lock:
        hit = _cache.get(ck)
    if hit and time.time() - hit[0] < (60 if refresh else CACHE_S):
        data = hit[1]
    else:
        key = os.environ.get("YOUTUBE_API_KEY")
        data = fetch("key:" + key, channel_id=cid) if key else _from_feed(cid)
        with _lock:
            _cache[ck] = (time.time(), data)
    res = analyze(data, tz)
    res["source"] = "public"
    if data.get("limited"):
        res["method"] = (f"Computed from your latest {len(data['videos'])} public uploads (YouTube's public feed shows the newest {FEED_MAX}). "
                         + res["method"].split(". ", 1)[1])
    res["fetched_at"] = datetime.fromtimestamp((_cache.get(ck) or (time.time(),))[0], timezone.utc).isoformat()
    return res
