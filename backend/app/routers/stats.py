"""Website traffic, WordPress-style: the web app records each page view; the two admin accounts see the Stats page.

Privacy: no cookies, nothing stored that names a person. The visitor id is sha256(server secret, day, IP, browser) cut
to 16 hex — the same visitor on the same day counts once, and it can't be turned back into an IP or followed across days.
Known bots aren't recorded. Admin-only reading uses the same rule as every admin page (email on the list + verified).
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import PageVisit, User
from ..security import RateLimiter, current_user
from ..shield import client_ip
from .billing import admin_user

router = APIRouter(tags=["stats"])
limiter = RateLimiter(limit=120, window_s=60)
BOTS = re.compile(r"bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|pingdom|uptime|python|curl|wget", re.I)
SOURCES = [  # (label, host pattern)
    ("Google", r"(^|\.)google\."), ("Bing", r"(^|\.)bing\.com$"), ("YouTube", r"(^|\.)(youtube\.com|youtu\.be)$"),
    ("WhatsApp", r"whatsapp"), ("Instagram", r"instagram\.com$"), ("Facebook", r"(facebook\.com|fb\.com)$"),
    ("X / Twitter", r"(^|\.)(t\.co|x\.com|twitter\.com)$"), ("LinkedIn", r"(linkedin\.com|lnkd\.in)$"), ("Reddit", r"reddit\.com$"),
    ("Telegram", r"(t\.me|telegram)"), ("DuckDuckGo", r"duckduckgo\.com$"), ("Yahoo", r"yahoo\."), ("ChatGPT", r"chatgpt\.com$"),
    ("Product Hunt", r"producthunt\.com$"),
]


class Hit(BaseModel):
    path: str = Field(min_length=1, max_length=400)
    referrer: str | None = Field(None, max_length=500)
    ref: str | None = Field(None, max_length=60)     # ?ref= / ?utm_source= tag from the link
    w: int | None = Field(None, ge=0, le=10000)       # screen width, for phone / tablet / computer


def _source(referrer: str | None, ref: str | None, own_host: str) -> tuple[str, str | None]:
    if ref:
        tag = re.sub(r"[^\w .-]", "", ref)[:40].strip()
        if tag:
            return tag.capitalize() if tag.islower() else tag, None
    host = (urlparse(referrer or "").hostname or "").lower().removeprefix("www.")
    if not host or host == own_host:
        return "Direct", None
    for label, pat in SOURCES:
        if re.search(pat, host):
            return label, host[:120]
    return host[:40], host[:120]


def _device(ua: str, w: int | None) -> str:
    if re.search(r"ipad|tablet", ua, re.I) or (w and 600 <= w < 1024 and re.search(r"android", ua, re.I)):
        return "tablet"
    if re.search(r"mobi|iphone|android", ua, re.I) or (w is not None and 0 < w < 600):
        return "phone"
    return "computer"


def _browser(ua: str) -> str:
    for name, pat in (("Edge", r"Edg/"), ("Opera", r"OPR/|Opera"), ("Samsung", r"SamsungBrowser"), ("Chrome", r"Chrome/"),
                      ("Firefox", r"Firefox/"), ("Safari", r"Safari/")):
        if re.search(pat, ua):
            return name
    return "Other"


def _clean_path(p: str) -> str:
    p = p.split("?")[0].split("#")[0][:200] or "/"
    p = re.sub(r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/:id", p)   # project/clip ids → one row
    return p if p.startswith("/") else "/" + p


def _signed_in(request: Request, db: Session) -> bool:
    try:
        current_user(request, db)
        return True
    except Exception:  # noqa: BLE001 — signed out is the normal case here
        return False


@router.post("/track", status_code=204)
def track(hit: Hit, request: Request, db: Session = Depends(get_db)):
    ua = request.headers.get("user-agent", "")[:400]
    if not ua or BOTS.search(ua):
        return Response(status_code=204)
    ip = client_ip(request)
    limiter.check(f"track:{ip}")
    s = get_settings()
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    secret = s.token_encryption_key or s.public_base_url or "dev"
    visitor = hashlib.sha256(f"{secret}|{day}|{ip}|{ua}".encode()).hexdigest()[:16]
    own = (urlparse(s.public_base_url or "").hostname or "").removeprefix("www.")
    source, rhost = _source(hit.referrer, hit.ref, own)
    country = (request.headers.get("cf-ipcountry") or "").upper()[:2] or None
    if country in ("XX", "T1"):
        country = None
    db.add(PageVisit(path=_clean_path(hit.path), source=source, referrer_host=rhost, country=country,
                     device=_device(ua, hit.w), browser=_browser(ua), visitor=visitor, signed_in=_signed_in(request, db)))
    db.commit()
    return Response(status_code=204)


@router.get("/admin/stats")
def stats(days: int = Query(30, ge=1, le=365), user: User = Depends(admin_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    q = select(PageVisit).where(PageVisit.ts >= since)
    day_col = func.date_trunc("day", PageVisit.ts)
    daily = db.execute(select(day_col, func.count(), func.count(func.distinct(PageVisit.visitor))).where(PageVisit.ts >= since)
                       .group_by(day_col).order_by(day_col)).all()
    by_day = {d.date().isoformat(): (v, u) for d, v, u in daily}
    series = []
    for i in range(days):
        d = (since + timedelta(days=i)).date().isoformat()
        v, u = by_day.get(d, (0, 0))
        series.append({"day": d, "views": v, "visitors": u})

    def top(col, n=10, where=None):
        stmt = select(col, func.count(), func.count(func.distinct(PageVisit.visitor))).where(PageVisit.ts >= since)
        if where is not None:
            stmt = stmt.where(where)
        return [{"name": k or "Unknown", "views": v, "visitors": u}
                for k, v, u in db.execute(stmt.group_by(col).order_by(func.count().desc()).limit(n)).all()]

    today = now.date().isoformat()
    t = by_day.get(today, (0, 0))
    total_views = sum(x["views"] for x in series)
    total_visitors = sum(x["visitors"] for x in series)   # unique per day, added up (like WordPress)
    online = db.scalar(select(func.count(func.distinct(PageVisit.visitor))).where(PageVisit.ts >= now - timedelta(minutes=5))) or 0
    return {
        "days": days, "today": {"views": t[0], "visitors": t[1]}, "online_now": online,
        "total": {"views": total_views, "visitors": total_visitors,
                  "views_per_visitor": round(total_views / total_visitors, 2) if total_visitors else 0},
        "series": series, "pages": top(PageVisit.path, 15), "sources": top(PageVisit.source, 12),
        "referrers": top(PageVisit.referrer_host, 10, PageVisit.referrer_host.is_not(None)),
        "countries": top(PageVisit.country, 12), "devices": top(PageVisit.device, 5), "browsers": top(PageVisit.browser, 6),
        "signed_in_share": round(100 * (db.scalar(select(func.count()).select_from(q.where(PageVisit.signed_in.is_(True)).subquery())) or 0)
                                 / total_views, 1) if total_views else 0,
        "privacy": "No cookies. Visitors are counted once per day from a one-way hash; no IP addresses or names are stored.",
    }
