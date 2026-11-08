"""Plans and what they unlock. Prices are in INR per month and are the founder's to change (PLANS below).

Profitability rule (docs/COST_MODEL.md): a plan's premium-AI credit must stay well under what the plan brings in after GST,
so every paying workspace covers its own AI bill plus a share of hosting. Premium AI is measured in rupees of estimated
provider cost over a rolling 30 days, not in "runs", because one video generation can cost as much as fifty images.
"""
from datetime import datetime, timedelta, timezone

from .config import get_settings
from .models import User, Workspace

PLANS = {
    "free":    {"name": "Free",    "price_inr": 0,   "ai_credit_inr": None,
                "blurb": "Full editor and the free AI tools that run on our servers: captions, translation, Hindi dubbing, voices, "
                         "background and object removal. 1080p export with a small badge."},
    "creator": {"name": "Creator", "price_inr": 299, "ai_credit_inr": 100,
                "blurb": "Everything in Free, no badge on exports, plus ₹100 of premium AI each month (hosted video, image and voice models)."},
    "pro":     {"name": "Pro",     "price_inr": 799, "ai_credit_inr": 300,
                "blurb": "Everything in Creator, ₹300 of premium AI each month, and priority: your exports and AI jobs go to the front of the queue."},
}
YEAR_MONTHS = 12
YEAR_PRICE_MONTHS = 10   # pay for 10 months, get 12 (cash up front; the single strongest lever for a small team's runway)
CREDIT_WINDOW = timedelta(days=30)


def price_inr(plan: str, months: int) -> int:
    p = PLANS[plan]["price_inr"]
    return p * YEAR_PRICE_MONTHS if months == YEAR_MONTHS else p * months


def ai_credit_inr(ws: Workspace) -> float:
    """Premium-AI credit (₹ of estimated provider cost) this workspace may use per rolling 30 days."""
    p = active_plan(ws)
    return float(get_settings().free_plan_ai_credit_inr if p == "free" else PLANS[p]["ai_credit_inr"])


def ai_spent_inr(db, workspace_id) -> float:
    """Estimated premium-AI spend of a workspace over the last 30 days, in rupees."""
    from sqlalchemy import func, select
    from .models import Generation
    since = datetime.now(timezone.utc) - CREDIT_WINDOW
    usd = db.scalar(select(func.coalesce(func.sum(Generation.est_cost_usd), 0.0)).where(
        Generation.workspace_id == workspace_id, Generation.created_at >= since, Generation.est_cost_usd.isnot(None),
        Generation.status != "canceled")) or 0.0
    return round(float(usd) * get_settings().usd_inr, 2)



def active_plan(ws: Workspace) -> str:
    if ws.plan != "free" and ws.plan_expires_at and ws.plan_expires_at > datetime.now(timezone.utc):
        return ws.plan
    return "free"


def is_priority(ws: Workspace) -> bool:
    return active_plan(ws) == "pro"


def is_platform_admin(user: User) -> bool:
    s = get_settings()
    if user.email.lower() not in s.admin_email_set:
        return False
    # In production an admin email must be verified (Google sign-in), so nobody can claim it by signing up first.
    return user.email_verified or s.env in ("development", "test")


# ------------------------------------------------------------------ developer accounts
DEVELOPER_UNTIL = datetime(2100, 1, 1, tzinfo=timezone.utc)


def is_developer(user: User) -> bool:
    s = get_settings()
    if user.email.lower() not in s.developer_email_set:
        return False
    return user.email_verified or s.env in ("development", "test")   # production: only a Google-verified sign-in counts


def apply_developer_benefits(db, user: User) -> bool:
    """Developer accounts (DEVELOPER_EMAILS) get Pro free on the workspaces they own until payments are added for them."""
    if not is_developer(user):
        return False
    from sqlalchemy import select
    from .models import Role, WorkspaceMember
    owned = db.scalars(select(Workspace).join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id).where(
        WorkspaceMember.user_id == user.id, WorkspaceMember.role == Role.owner, Workspace.deleted_at.is_(None))).all()
    for ws in owned:
        ws.plan, ws.plan_expires_at = "pro", DEVELOPER_UNTIL
    return bool(owned)


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
