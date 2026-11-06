"""Plans and what they unlock. Prices are in INR per month and are the founder's to change (PLANS below)."""
from datetime import datetime, timezone

from .config import get_settings
from .models import User, Workspace

PLANS = {
    "free":    {"name": "Free",    "price_inr": 0,   "paid_runs": None, "blurb": "Full editor, free AI (captions, translate, dub, voices), 1080p export"},
    "creator": {"name": "Creator", "price_inr": 299, "paid_runs": 50,   "blurb": "Everything in Free + 50 premium AI generations a day"},
    "pro":     {"name": "Pro",     "price_inr": 799, "paid_runs": 200,  "blurb": "Everything in Creator + 200 premium AI generations a day, priority renders"},
}


def active_plan(ws: Workspace) -> str:
    if ws.plan != "free" and ws.plan_expires_at and ws.plan_expires_at > datetime.now(timezone.utc):
        return ws.plan
    return "free"


def paid_runs_limit(ws: Workspace) -> int:
    s = get_settings()
    p = active_plan(ws)
    lim = s.free_plan_paid_runs if p == "free" else PLANS[p]["paid_runs"]
    return min(lim, s.ai_daily_paid_runs)


def is_platform_admin(user: User) -> bool:
    s = get_settings()
    if user.email.lower() not in s.admin_email_set:
        return False
    # In production an admin email must be verified (Google sign-in), so nobody can claim it by signing up first.
    return user.email_verified or s.env in ("development", "test")
