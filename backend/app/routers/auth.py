import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Role, User, Workspace, WorkspaceMember
from ..security import (audit, auth_limiter, create_session, current_user, hash_password, revoke_session,
                        verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(min_length=10, max_length=200)
    display_name: str = Field(min_length=1, max_length=120)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("invalid email")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


def _set_cookie(resp: Response, token: str):
    s = get_settings()
    resp.set_cookie(s.session_cookie_name, token, httponly=True, secure=s.cookie_secure,
                    samesite=s.cookie_samesite, max_age=s.session_ttl_hours * 3600, path="/")


def me_payload(db: Session, user: User) -> dict:
    rows = db.execute(select(WorkspaceMember, Workspace).join(Workspace)
                      .where(WorkspaceMember.user_id == user.id, Workspace.deleted_at.is_(None))
                      .order_by(Workspace.is_personal.desc(), Workspace.created_at)).all()
    return {"user": {"id": str(user.id), "email": user.email, "display_name": user.display_name,
                     "email_verified": user.email_verified},
            "workspaces": [{"id": str(w.id), "name": w.name, "is_personal": w.is_personal, "role": m.role.value}
                           for m, w in rows]}


@router.post("/signup", status_code=201)
def signup(body: SignupIn, request: Request, response: Response, db: Session = Depends(get_db)):
    auth_limiter.check(f"signup:{request.client.host if request.client else '-'}")
    if db.scalar(select(func.count()).select_from(User).where(User.email == body.email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=body.email, display_name=body.display_name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    ws = Workspace(name=f"{user.display_name}'s workspace", is_personal=True)
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=Role.owner))
    token = create_session(db, user, request.headers.get("user-agent"))
    audit(db, request, "auth.signup", user=user, workspace_id=ws.id)
    db.commit()
    _set_cookie(response, token)
    return me_payload(db, user)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    auth_limiter.check(f"login:{email}")
    auth_limiter.check(f"login-ip:{request.client.host if request.client else '-'}")
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        audit(db, request, "auth.login_failed", email_domain=email.split("@")[-1])
        db.commit()
        raise HTTPException(401, "Email or password is incorrect")
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
