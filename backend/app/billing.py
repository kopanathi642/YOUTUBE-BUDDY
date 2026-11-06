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


# ------------------------------------------------------------------ referrals
REFERRAL_DAYS = 7      # Creator days the inviter earns when a friend finishes their first export
REFERRAL_MAX = 12      # rewarded invites per user (about 3 months free)


def referral_code(user_id) -> str:
    return str(user_id).replace("-", "")[:10]


def find_referrer(db, code: str | None):
    import re
    from sqlalchemy import String, cast, func, select
    if not code or not re.fullmatch(r"[0-9a-f]{10}", code):
        return None
    return db.scalar(select(User).where(func.replace(cast(User.id, String), "-", "").like(code + "%")).limit(1))


def reward_referral(db, user: User) -> bool:
    """Called when a user's first export succeeds: give their inviter REFERRAL_DAYS of Creator on their personal workspace."""
    from datetime import timedelta
    from sqlalchemy import func, select
    from .models import WorkspaceMember
    if not user or not user.referred_by or user.referral_rewarded:
        return False
    user.referral_rewarded = True
    done = db.scalar(select(func.count()).select_from(User).where(User.referred_by == user.referred_by, User.referral_rewarded.is_(True)))
    if done > REFERRAL_MAX:
        return False
    ws = db.scalar(select(Workspace).join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id).where(
        WorkspaceMember.user_id == user.referred_by, Workspace.is_personal.is_(True)))
    if not ws:
        return False
    now = datetime.now(timezone.utc)
    if active_plan(ws) == "pro":
        ws.plan_expires_at = ws.plan_expires_at + timedelta(days=REFERRAL_DAYS)
    else:
        base = ws.plan_expires_at if active_plan(ws) == "creator" else now
        ws.plan, ws.plan_expires_at = "creator", base + timedelta(days=REFERRAL_DAYS)
    return True
