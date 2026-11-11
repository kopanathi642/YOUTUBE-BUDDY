import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..shield import client_ip
from ..config import get_settings
from ..db import get_db
from ..models import Role, User, Workspace, WorkspaceMember
from ..firebase_auth import InvalidToken, verify_id_token
from ..security import (audit, auth_limiter, create_session, current_user, hash_password, revoke_session,
                        verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(min_length=10, max_length=200)
    display_name: str = Field(min_length=1, max_length=120)
    ref: str | None = Field(None, max_length=20)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("invalid email")
        return v


class GoogleIn(BaseModel):
    id_token: str = Field(min_length=20, max_length=8000)
    ref: str | None = Field(None, max_length=20)


class LoginIn(BaseModel):
    email: str
    password: str


def _set_cookie(resp: Response, token: str):
    s = get_settings()
    resp.set_cookie(s.session_cookie_name, token, httponly=True, secure=s.cookie_secure,
                    samesite=s.cookie_samesite, max_age=s.session_ttl_hours * 3600, path="/")


from ..billing import active_plan, apply_developer_benefits, find_referrer, is_platform_admin, referral_code  # noqa: E402


def me_payload(db: Session, user: User) -> dict:
    rows = db.execute(select(WorkspaceMember, Workspace).join(Workspace)
                      .where(WorkspaceMember.user_id == user.id, Workspace.deleted_at.is_(None))
                      .order_by(Workspace.is_personal.desc(), Workspace.created_at)).all()
    return {"user": {"id": str(user.id), "email": user.email, "display_name": user.display_name,
                     "email_verified": user.email_verified, "avatar_url": user.avatar_url,
                     "has_password": user.password_hash is not None, "google_linked": user.firebase_uid is not None},
            "is_platform_admin": is_platform_admin(user), "referral_code": referral_code(user.id),
            "workspaces": [{"id": str(w.id), "name": w.name, "is_personal": w.is_personal, "role": m.role.value, "plan": active_plan(w)}
                           for m, w in rows]}


def _create_user(db: Session, **fields) -> tuple[User, Workspace]:
    user = User(**fields)
    db.add(user)
    db.flush()
    ws = Workspace(name=f"{user.display_name}'s workspace", is_personal=True)
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=Role.owner))
    return user, ws


@router.get("/config")
def auth_config():
    """Public sign-in options for the web app. Firebase web config values are public identifiers by design."""
    s = get_settings()
    enabled = bool(s.firebase_project_id and s.firebase_api_key and s.firebase_auth_domain)
    return {"brand": s.brand_name, "contact_email": s.contact_email, "password": True, "google": enabled,
            "firebase": {"apiKey": s.firebase_api_key, "authDomain": s.firebase_auth_domain,
                         "projectId": s.firebase_project_id, "appId": s.firebase_app_id} if enabled else None}


@router.post("/google")
def google_sign_in(body: GoogleIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Exchange a verified Firebase ID token (Google provider) for our own session cookie."""
    auth_limiter.check(f"google-ip:{client_ip(request)}")
    try:
        claims = verify_id_token(body.id_token, get_settings().firebase_project_id or "")
    except InvalidToken as e:
        audit(db, request, "auth.google_rejected", reason=str(e)[:100])
        db.commit()
        raise HTTPException(401, "Google sign-in could not be verified")
    provider = (claims.get("firebase") or {}).get("sign_in_provider")
    email = (claims.get("email") or "").strip().lower()
    if provider != "google.com" or not email or claims.get("email_verified") is not True:
        raise HTTPException(401, "A verified Google account email is required")
    uid = claims["sub"]
    user = db.scalar(select(User).where(User.firebase_uid == uid))
    created = False
    if not user:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            if user.firebase_uid and user.firebase_uid != uid:
                raise HTTPException(409, "This email is linked to a different Google account")
            user.firebase_uid = uid  # Google has verified ownership of this email, so linking is safe
            user.email_verified = True
        else:
            name = (claims.get("name") or email.split("@")[0])[:120]
            inviter = find_referrer(db, getattr(body, "ref", None))
            user, _ = _create_user(db, email=email, display_name=name, password_hash=None, firebase_uid=uid,
                                   email_verified=True, referred_by=inviter and inviter.id)
            created = True
    if not user.is_active:
        raise HTTPException(403, "Account disabled")
    pic = claims.get("picture")
    if isinstance(pic, str) and pic.startswith("https://") and len(pic) <= 500:
        user.avatar_url = pic
    apply_developer_benefits(db, user)
    token = create_session(db, user, request.headers.get("user-agent"))
    audit(db, request, "auth.signup" if created else "auth.login", user=user, method="google")
    db.commit()
    _set_cookie(response, token)
    return me_payload(db, user)


@router.post("/signup", status_code=201)
def signup(body: SignupIn, request: Request, response: Response, db: Session = Depends(get_db)):
    auth_limiter.check(f"signup:{client_ip(request)}")
    if db.scalar(select(func.count()).select_from(User).where(User.email == body.email)):
        raise HTTPException(409, "An account with this email already exists")
    inviter = find_referrer(db, body.ref)
    user, ws = _create_user(db, email=body.email, display_name=body.display_name.strip(), password_hash=hash_password(body.password),
                            referred_by=inviter and inviter.id)
    apply_developer_benefits(db, user)
    token = create_session(db, user, request.headers.get("user-agent"))
    audit(db, request, "auth.signup", user=user, workspace_id=ws.id)
    db.commit()
    _set_cookie(response, token)
    return me_payload(db, user)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    auth_limiter.check(f"login:{email}")
    auth_limiter.check(f"login-ip:{client_ip(request)}")
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        audit(db, request, "auth.login_failed", email_domain=email.split("@")[-1])
        db.commit()
        raise HTTPException(401, "Email or password is incorrect")
    apply_developer_benefits(db, user)
    token = create_session(db, user, request.headers.get("user-agent"))
    audit(db, request, "auth.login", user=user)
    db.commit()
    _set_cookie(response, token)
    return me_payload(db, user)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    token = request.cookies.get(s.session_cookie_name)
    if token:
        revoke_session(db, token)
        db.commit()
    response.delete_cookie(s.session_cookie_name, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return me_payload(db, user)
