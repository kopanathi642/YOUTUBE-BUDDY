"""Plans & payments with no payment gateway: the user pays the founder's UPI QR, submits the 12-digit UTR, and a platform
admin approves it after checking the bank app. Approval activates the plan for 30 days per month paid."""
import base64
import io
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import storage
from ..billing import PLANS, active_plan, is_platform_admin, paid_runs_limit
from ..db import get_db
from ..models import Payment, PlatformSetting, Role, User, Workspace, WorkspaceMember
from ..security import RateLimiter, audit, current_user

router = APIRouter(tags=["billing"])
pay_limiter = RateLimiter(limit=10, window_s=3600)
QR_KEY = "platform/upi-qr.png"
PAYPAL_QR_KEY = "platform/paypal-qr.png"


def _setting(db: Session, key: str) -> dict:
    row = db.get(PlatformSetting, key)
    return dict(row.value) if row else {}


def _put_setting(db: Session, key: str, value: dict) -> None:
    row = db.get(PlatformSetting, key)
    if row:
        row.value = value
    else:
        db.add(PlatformSetting(key=key, value=value))


def _upi(db: Session) -> dict:
    v = _setting(db, "upi")
    return {"upi_id": v.get("upi_id"), "payee_name": v.get("payee_name"),
            "qr_url": storage.signed_get(QR_KEY) if v.get("qr_version") else None, "configured": bool(v.get("qr_version") or v.get("upi_id")),
            "paypal": {"link": v.get("paypal_link"), "qr_url": storage.signed_get(PAYPAL_QR_KEY) if v.get("paypal_qr_version") else None,
                       "configured": bool(v.get("paypal_link") or v.get("paypal_qr_version"))}}


def _member_ws(db: Session, user: User, ws_id: uuid.UUID, min_role: Role = Role.viewer) -> Workspace:
    row = db.execute(select(WorkspaceMember, Workspace).join(Workspace).where(
        WorkspaceMember.user_id == user.id, Workspace.id == ws_id, Workspace.deleted_at.is_(None))).first()
    if not row:
        raise HTTPException(404, "Workspace not found")
    order = [Role.viewer, Role.editor, Role.admin, Role.owner]
    if order.index(row[0].role) < order.index(min_role):
        raise HTTPException(403, "Only the workspace owner or an admin can change its plan")
    return row[1]


def ser_payment(p: Payment) -> dict:
    return {"id": str(p.id), "workspace_id": str(p.workspace_id), "plan": p.plan, "months": p.months, "amount_inr": p.amount_inr,
            "method": p.method, "utr": p.utr, "status": p.status, "note": p.note, "created_at": p.created_at.isoformat(),
            "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None}


@router.get("/billing")
def overview(workspace_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = _member_ws(db, user, workspace_id)
    pays = db.scalars(select(Payment).where(Payment.workspace_id == ws.id).order_by(Payment.created_at.desc()).limit(20)).all()
    plan = active_plan(ws)
    return {"plans": [{"id": k, **v} for k, v in PLANS.items()], "plan": plan,
            "plan_expires_at": ws.plan_expires_at.isoformat() if plan != "free" and ws.plan_expires_at else None,
            "paid_runs_per_day": paid_runs_limit(ws), "upi": _upi(db), "payments": [ser_payment(p) for p in pays],
            "is_platform_admin": is_platform_admin(user)}


class PayIn(BaseModel):
    workspace_id: uuid.UUID
    plan: str = Field(pattern="^(creator|pro)$")
    months: int = Field(1, ge=1, le=12)
    utr: str = Field(min_length=12, max_length=22)
    method: str = Field("upi", pattern="^(upi|paypal)$")


@router.post("/billing/payments", status_code=201)
def submit_payment(body: PayIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pay_limiter.check(f"pay:{user.id}")
    ws = _member_ws(db, user, body.workspace_id, Role.admin)
    utr = re.sub(r"\s", "", body.utr).upper()
    if body.method == "upi" and not re.fullmatch(r"\d{12}", utr):
        raise HTTPException(422, "Enter the 12-digit UPI transaction ID (UTR) from your payment app")
    if body.method == "paypal" and not re.fullmatch(r"[0-9A-Z]{17}", utr):
        raise HTTPException(422, "Enter the 17-character PayPal transaction ID (from the PayPal receipt)")
    if db.scalar(select(func.count()).select_from(Payment).where(Payment.user_id == user.id, Payment.status == "pending")) >= 3:
        raise HTTPException(429, "You already have 3 payments waiting for approval")
    p = Payment(user_id=user.id, workspace_id=ws.id, plan=body.plan, months=body.months,
                amount_inr=PLANS[body.plan]["price_inr"] * body.months, utr=utr, method=body.method, status="pending")
    db.add(p)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This UTR has already been submitted")
    audit(db, request, "billing.payment.submit", user=user, workspace_id=ws.id, target_type="payment", target_id=p.id,
          plan=body.plan, amount_inr=p.amount_inr)
    db.commit()
    return ser_payment(p)


# ---------------------------------------------------------------- platform admin
def admin_user(user: User = Depends(current_user)) -> User:
    if not is_platform_admin(user):
        raise HTTPException(404, "Not found")
    return user


@router.get("/admin/payments")
def list_payments(status: str = "pending", user: User = Depends(admin_user), db: Session = Depends(get_db)):
    q = select(Payment, User, Workspace).join(User, User.id == Payment.user_id).join(Workspace, Workspace.id == Payment.workspace_id)
    if status != "all":
        q = q.where(Payment.status == status)
    rows = db.execute(q.order_by(Payment.created_at.desc()).limit(200)).all()
    return {"payments": [{**ser_payment(p), "user_email": u.email, "user_name": u.display_name, "workspace_name": w.name} for p, u, w in rows]}


class ReviewIn(BaseModel):
    note: str | None = Field(None, max_length=300)


def _review(db: Session, pid: uuid.UUID) -> Payment:
    p = db.get(Payment, pid, with_for_update=True)
    if not p:
        raise HTTPException(404, "Payment not found")
    if p.status != "pending":
        raise HTTPException(409, f"Payment is already {p.status}")
    return p


@router.post("/admin/payments/{pid}/approve")
def approve(pid: uuid.UUID, body: ReviewIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    p = _review(db, pid)
    ws = db.get(Workspace, p.workspace_id, with_for_update=True)
    now = datetime.now(timezone.utc)
    start = ws.plan_expires_at if active_plan(ws) == p.plan and ws.plan_expires_at and ws.plan_expires_at > now else now
    ws.plan, ws.plan_expires_at = p.plan, start + timedelta(days=30 * p.months)
    p.status, p.note, p.reviewed_by, p.reviewed_at = "approved", body.note, user.id, now
    audit(db, request, "billing.payment.approve", user=user, workspace_id=ws.id, target_type="payment", target_id=p.id, plan=p.plan)
    db.commit()
    return ser_payment(p)


@router.post("/admin/payments/{pid}/reject")
def reject(pid: uuid.UUID, body: ReviewIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    p = _review(db, pid)
    p.status, p.note, p.reviewed_by, p.reviewed_at = "rejected", body.note or "Payment not found in our account", user.id, datetime.now(timezone.utc)
    audit(db, request, "billing.payment.reject", user=user, workspace_id=p.workspace_id, target_type="payment", target_id=p.id)
    db.commit()
    return ser_payment(p)


class UpiIn(BaseModel):
    upi_id: str | None = Field(None, max_length=80, pattern=r"^[A-Za-z0-9.\-_]{2,60}@[A-Za-z][A-Za-z0-9.]{1,30}$")
    payee_name: str | None = Field(None, max_length=80)
    qr_data_url: str | None = Field(None, max_length=3_000_000)
    paypal_link: str | None = Field(None, max_length=120, pattern=r"^(https://(www\.)?paypal\.(me|com)/[A-Za-z0-9/._-]{1,80})?$")
    paypal_qr_data_url: str | None = Field(None, max_length=3_000_000)


@router.put("/admin/billing/upi")
def set_upi(body: UpiIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    v = _setting(db, "upi")
    if body.upi_id is not None:
        v["upi_id"] = body.upi_id
    if body.payee_name is not None:
        v["payee_name"] = body.payee_name.strip()
    if body.paypal_link is not None:
        v["paypal_link"] = body.paypal_link or None
    if body.qr_data_url:
        _save_qr(body.qr_data_url, QR_KEY)
        v["qr_version"] = int(v.get("qr_version", 0)) + 1
    if body.paypal_qr_data_url:
        _save_qr(body.paypal_qr_data_url, PAYPAL_QR_KEY)
        v["paypal_qr_version"] = int(v.get("paypal_qr_version", 0)) + 1
    _put_setting(db, "upi", v)
    audit(db, request, "billing.upi.update", user=user, qr=bool(body.qr_data_url), paypal_qr=bool(body.paypal_qr_data_url))
    db.commit()
    return _upi(db)


def _save_qr(data_url: str, key: str) -> None:
    m = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", data_url)
    if not m:
        raise HTTPException(422, "QR must be a PNG, JPEG or WebP image")
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(base64.b64decode(m.group(2))))
        img.load()
    except Exception:
        raise HTTPException(422, "That file is not a readable image")
    if img.width < 100 or img.height < 100:
        raise HTTPException(422, "QR image is too small to scan")
    img = img.convert("RGB")
    img.thumbnail((1024, 1024))
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png") as f:   # re-encoded: strips metadata and anything hidden in the file
        img.save(f.name, "PNG")
        storage.upload(f.name, key, "image/png")
