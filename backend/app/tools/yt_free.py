"""Channel Analyzer (071), Competitor Compare (073) and Growth Strategy (080) without a YouTube API key or a paid language
model: each channel's public uploads feed (latest 15 videos: titles, dates, views, likes) and rules whose every finding
cites the numbers it came from. A Claude/OpenAI key adds a written summary on top (engines.run_youtube)."""
from __future__ import annotations

import statistics
from collections import Counter
from datetime import datetime, timezone

from .. import growth_engine as ge
from .run import RunCtx, ToolError


def _feed(ref: str) -> dict:
    try:
        cid = ge.parse_channel_ref(ref)
        f = ge.fetch_feed(cid)
    except ge.GrowthError as e:
        msg = str(e)
        if "@handle" in msg or "handle" in msg.lower():
            msg = "Paste the channel link that contains /channel/UC… (YouTube → the channel → Share → Copy channel ID). @handles need a YouTube API key."
        raise ToolError(msg)
    now = datetime.now(timezone.utc)
    vids = []
    for v in f["videos"]:
        age = max(0.5, (now - v["published_at"]).total_seconds() / 86400)
        vids.append({"id": v["id"], "title": v["title"], "published": v["published_at"].isoformat(), "views": v["views"], "likes": v["likes"],
                     "age_days": round(age, 1), "vpd": round(v["views"] / age, 1), "short": "#short" in v["title"].lower(),
                     "url": f"https://www.youtube.com/watch?v={v['id']}"})
    return {"id": cid, "title": f["title"], "recent": vids, "url": f"https://www.youtube.com/channel/{cid}"}


def _stats(vids: list[dict]) -> dict:
    by_date = sorted(vids, key=lambda v: v["published"])
    gaps = [(datetime.fromisoformat(b["published"]) - datetime.fromisoformat(a["published"])).total_seconds() / 86400 for a, b in zip(by_date, by_date[1:])]
    shorts, longs = [v for v in vids if v["short"]], [v for v in vids if not v["short"]]
    med = lambda xs: round(statistics.median(xs), 1) if xs else None  # noqa: E731
    return {"videos": len(vids), "median_views": med([v["views"] for v in vids]), "median_views_per_day": med([v["vpd"] for v in vids]),
            "upload_every_days": med(gaps), "last_upload_days_ago": round(min(v["age_days"] for v in vids), 1) if vids else None,
            "shorts_share": round(len(shorts) / len(vids), 2) if vids else 0,
            "shorts_median_vpd": med([v["vpd"] for v in shorts]), "long_median_vpd": med([v["vpd"] for v in longs]),
            "like_rate": med([v["likes"] / v["views"] for v in vids if v["views"] > 50]),
            "top": sorted(vids, key=lambda v: -v["vpd"])[:5]}


def _word_signal(vids: list[dict]) -> list[dict]:
    mature = [v for v in vids if v["age_days"] >= 3]
    if len(mature) < 6:
        return []
    med = statistics.median(v["vpd"] for v in mature)
    cnt, good = Counter(), Counter()
    for v in mature:
        for w in set(ge.words(v["title"])):
            cnt[w] += 1
            good[w] += v["vpd"] > med
    out = [{"word": w, "videos": n, "above_typical": good[w]} for w, n in cnt.items() if n >= 2]
    return sorted(out, key=lambda x: (-x["above_typical"] / x["videos"], -x["videos"]))[:6]


def _findings(ch: dict, st: dict, goal: str = "") -> tuple[list[dict], list[dict], str]:
    F, A = [], []
    n = st["videos"]
    if not n:
        raise ToolError("This channel has no public uploads in its feed")
    if st["upload_every_days"]:
        F.append({"finding": f"Uploads about every {st['upload_every_days']} days", "evidence": f"median gap between the last {n} uploads"})
        if st["upload_every_days"] > 7:
            A.append({"action": f"Post on a fixed schedule — at least every {min(7, max(2, round(st['upload_every_days'] / 2)))} days",
                      "priority": "high", "why": f"the current gap is {st['upload_every_days']} days; regular uploads keep returning viewers"})
    if st["last_upload_days_ago"] and st["last_upload_days_ago"] > 14:
        F.append({"finding": f"No upload for {round(st['last_upload_days_ago'])} days", "evidence": "date of the newest video in the feed"})
        A.append({"action": "Publish a new video this week", "priority": "high", "why": "the channel has been quiet for over two weeks"})
    top = st["top"][0]
    F.append({"finding": f"Strongest recent video: “{top['title']}”", "evidence": f"{int(top['vpd']):,} views/day vs. typical {int(st['median_views_per_day'] or 0):,}"})
    if st["median_views_per_day"] and top["vpd"] > 2 * st["median_views_per_day"]:
        A.append({"action": f"Make a follow-up to “{top['title'][:70]}”", "priority": "high",
                  "why": f"it earns {round(top['vpd'] / st['median_views_per_day'], 1)}× the channel's typical views per day"})
    if st["shorts_median_vpd"] and st["long_median_vpd"]:
        better = "Shorts" if st["shorts_median_vpd"] > st["long_median_vpd"] else "long videos"
        ratio = max(st["shorts_median_vpd"], st["long_median_vpd"]) / max(1, min(st["shorts_median_vpd"], st["long_median_vpd"]))
        F.append({"finding": f"{better.capitalize()} get more views per day here", "evidence": f"median {st['shorts_median_vpd']:,} (Shorts) vs. {st['long_median_vpd']:,} (long)"})
        if ratio > 1.5:
            A.append({"action": f"Shift the mix toward {better}", "priority": "medium", "why": f"{round(ratio, 1)}× the views per day in this channel's own recent uploads"})
    elif st["shorts_share"] == 0:
        A.append({"action": "Test 2–3 Shorts cut from your best long video", "priority": "medium", "why": "no Shorts in the recent uploads, so there's no data on them yet"})
    for w in _word_signal(ch["recent"])[:3]:
        if w["above_typical"] / w["videos"] >= 0.66:
            F.append({"finding": f"Titles with “{w['word']}” tend to do better", "evidence": f"{w['above_typical']} of {w['videos']} such videos beat the channel's typical views/day"})
    if st["like_rate"]:
        F.append({"finding": f"About {round(st['like_rate'] * 100, 1)}% of viewers like a video", "evidence": "median likes ÷ views"})
    summary = (f"{ch['title']}: {n} recent uploads, typically {int(st['median_views_per_day'] or 0):,} views per day per video"
               + (f", one upload every {st['upload_every_days']} days" if st["upload_every_days"] else "") + "."
               + (f" Goal: {goal}." if goal else "") + " Based on the public uploads feed (latest 15 videos); subscriber counts need a YouTube API key.")
    if not A:
        A.append({"action": "Keep the current rhythm and repeat the formats of your top 3 videos", "priority": "medium", "why": "no single weak spot stands out in the recent uploads"})
    return F, A, summary


def run(rc: RunCtx, task: str):
    p = rc.p
    rc.progress(0.1, "reading the public uploads feed")
    if task == "compare":
        chans = [c for c in (p.get("channels") or "").splitlines() if c.strip()][:4]
        if not chans:
            raise ToolError("Add at least one channel")
        rows = []
        for i, c in enumerate(chans):
            rc.progress(0.1 + 0.8 * i / len(chans), f"reading {c.strip()[:40]}")
            ch = _feed(c)
            st = _stats(ch["recent"])
            rows.append({"title": ch["title"], "subscribers": None, "videos": st["videos"], "avg_recent_views": st["median_views"],
                         "views_per_day": st["median_views_per_day"], "upload_every_days": st["upload_every_days"],
                         "shorts_share": st["shorts_share"], "uploads_last_15": st["videos"], "top_title": st["top"][0]["title"] if st["top"] else "",
                         "url": ch["url"]})
        rc.model = "Public YouTube feeds (no key)"
        rc.result = {"kind": "compare", "rows": rows, "note": "Median of each channel's latest 15 public uploads. Subscriber counts need a YouTube API key."}
        return
    ch = _feed(p["channel"])
    st = _stats(ch["recent"])
    F, A, summary = _findings(ch, st, p.get("goal") or "")
    rc.model = "Public YouTube feed + rules (no key)"
    rc.result = {"kind": task, "channel": {**ch, "subscribers": None, "views": None, "video_count": None}, "stats": st,
                 "summary": summary, "findings": F, "actions": A}
