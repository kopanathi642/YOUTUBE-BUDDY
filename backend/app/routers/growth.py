"""Founder metrics (from data we already keep) and in-app feedback."""
from datetime import datetime, timedelta, timezone

import threading
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AgentReport, AuditLog, Export, Job, Payment, User, Workspace
from ..security import RateLimiter, audit, current_user
from .billing import admin_user

router = APIRouter(tags=["growth"])
fb_limiter = RateLimiter(limit=10, window_s=3600)


class FeedbackIn(BaseModel):
    message: str = Field(min_length=3, max_length=2000)
    page: str = Field("", max_length=200)
    rating: int | None = Field(None, ge=1, le=5)


@router.post("/feedback", status_code=201)
def feedback(body: FeedbackIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fb_limiter.check(f"fb:{user.id}")
    audit(db, request, "feedback", user=user, message=body.message.strip(), page=body.page, rating=body.rating)
    db.commit()
    return {"ok": True}


@router.get("/admin/metrics")
def metrics(user: User = Depends(admin_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    d1, d7, d30 = now - timedelta(days=1), now - timedelta(days=7), now - timedelta(days=30)
    count = lambda q: db.scalar(q) or 0  # noqa: E731
    active = lambda since: count(select(func.count(distinct(AuditLog.user_id))).where(AuditLog.created_at >= since, AuditLog.user_id.is_not(None)))  # noqa: E731
    exporters = count(select(func.count(distinct(Job.created_by))).where(Job.kind == "render.export", Job.status == "succeeded"))
    users = count(select(func.count()).select_from(User))
    paying = count(select(func.count()).select_from(Workspace).where(Workspace.plan != "free", Workspace.plan_expires_at > now))
    top = db.execute(select(AuditLog.action, func.count()).where(AuditLog.created_at >= d30, AuditLog.action.not_like("auth.%"),
                                                                 AuditLog.action != "feedback")
                     .group_by(AuditLog.action).order_by(func.count().desc()).limit(15)).all()
    fb = db.execute(select(AuditLog, User.email).join(User, User.id == AuditLog.user_id, isouter=True)
                    .where(AuditLog.action == "feedback").order_by(AuditLog.created_at.desc()).limit(30)).all()
    day = func.date_trunc("day", User.created_at)
    daily = db.execute(select(day, func.count()).where(User.created_at >= d30).group_by(day).order_by(day)).all()
    return {
        "users": users, "signups_7d": count(select(func.count()).select_from(User).where(User.created_at >= d7)),
        "active_1d": active(d1), "active_7d": active(d7), "active_30d": active(d30),
        "users_with_export": exporters, "activation_rate": round(exporters / users, 3) if users else 0,
        "exports_7d": count(select(func.count()).select_from(Export).join(Job, Job.id == Export.job_id)
                            .where(Export.created_at >= d7, Job.status == "succeeded")),
        "paying_workspaces": paying, "conversion_rate": round(paying / users, 3) if users else 0,
        "revenue_30d_inr": count(select(func.coalesce(func.sum(Payment.amount_inr), 0)).where(Payment.status == "approved", Payment.reviewed_at >= d30)),
        "pending_payments": count(select(func.count()).select_from(Payment).where(Payment.status == "pending")),
        "referred_users": count(select(func.count()).select_from(User).where(User.referred_by.is_not(None))),
        "top_features_30d": [{"action": a, "count": n} for a, n in top],
        "signups_daily_30d": [{"day": d.date().isoformat(), "count": n} for d, n in daily],
        "feedback": [{"at": a.created_at.isoformat(), "email": e, "message": a.meta.get("message"), "page": a.meta.get("page"),
                      "rating": a.meta.get("rating")} for a, e in fb],
    }



# ------------------------------------------------------------------ Creator Scout agent (founder only)
def ser_report(r: AgentReport | None) -> dict | None:
    return r and {"id": str(r.id), "kind": r.kind, "status": r.status, "summary": r.summary, "data": r.data, "created_at": r.created_at.isoformat()}


@router.get("/admin/agent")
def agent_reports(user: User = Depends(admin_user), db: Session = Depends(get_db)):
    from ..tools.providers import llm_ready
    latest = lambda k: db.scalar(select(AgentReport).where(AgentReport.kind == k).order_by(AgentReport.created_at.desc()).limit(1))  # noqa: E731
    hist = db.scalars(select(AgentReport).order_by(AgentReport.created_at.desc()).limit(30)).all()
    return {"research": ser_report(latest("research")), "health": ser_report(latest("health")), "ai_mode": llm_ready(),
            "history": [{"id": str(h.id), "kind": h.kind, "status": h.status, "summary": h.summary, "created_at": h.created_at.isoformat()} for h in hist]}


_running: set[str] = set()


class RunIn(BaseModel):
    kind: str = Field(pattern="^(health|research)$")


@router.post("/admin/agent/run", status_code=202)
def agent_run(body: RunIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    if body.kind in _running:
        raise HTTPException(409, "Already running")
    audit(db, request, "agent.run", user=user, kind=body.kind)
    db.commit()
    from .. import agent
    from ..db import session_factory

    def go():
        _running.add(body.kind)
        try:
            with session_factory()() as s:
                agent.run(s, body.kind)
        finally:
            _running.discard(body.kind)
    if body.kind == "health":   # quick: answer with the result
        go()
        return {"started": True, "done": True}
    threading.Thread(target=go, daemon=True).start()
    return {"started": True, "done": False}


class DecideIn(BaseModel):
    index: int = Field(ge=0, le=200)
    decision: str = Field(pattern="^(accepted|dismissed|open)$")


@router.post("/admin/agent/reports/{rid}/decide")
def agent_decide(rid: uuid.UUID, body: DecideIn, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    r = db.get(AgentReport, rid)
    if not r or r.kind != "research" or body.index >= len(r.data.get("problems") or []):
        raise HTTPException(404, "Not found")
    d = dict(r.data); probs = list(d["problems"]); probs[body.index] = {**probs[body.index], "decision": body.decision}
    d["problems"] = probs; r.data = d
    db.commit()
    return ser_report(r)
