"""Authentication, sessions, CSRF defence, rate limiting and tenant access checks."""
import hashlib
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AuditLog, Role, User, UserSession, WorkspaceMember

_ph = PasswordHasher()

ROLE_RANK = {Role.viewer: 0, Role.editor: 1, Role.admin: 2, Role.owner: 3}


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str | None) -> bool:
    if not hashed:
        _ph.hash(pw)  # same cost as a real check, so timing doesn't reveal Google-only accounts
        return False
    try:
        return _ph.verify(hashed, pw)
    except (VerifyMismatchError, InvalidHashError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User, user_agent: str | None) -> str:
    token = secrets.token_urlsafe(32)
    s = get_settings()
    db.add(UserSession(
        user_id=user.id,
        token_hash=_token_hash(token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=s.session_ttl_hours),
        user_agent=(user_agent or "")[:300],
    ))
    return token


def revoke_session(db: Session, token: str) -> None:
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == _token_hash(token)))
    if sess and not sess.revoked_at:
        sess.revoked_at = datetime.now(timezone.utc)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == _token_hash(token)))
    now = datetime.now(timezone.utc)
    if not sess or sess.revoked_at or sess.expires_at < now or not sess.user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return sess.user


def require_member(db: Session, user: User, workspace_id: uuid.UUID, min_role: Role = Role.viewer) -> WorkspaceMember:
    """Tenant isolation gate. Return 404 (not 403) for non-members so IDs cannot be probed."""
    m = db.scalar(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id))
    if not m or m.workspace.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if ROLE_RANK[m.role] < ROLE_RANK[min_role]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {min_role.value} role")
    return m


def audit(db: Session, request: Request | None, action: str, *, user: User | None = None,
          workspace_id=None, target_type=None, target_id=None, **meta) -> None:
    db.add(AuditLog(
        workspace_id=workspace_id, user_id=user.id if user else None, action=action,
        target_type=target_type, target_id=str(target_id) if target_id else None,
        ip=(request.client.host if request and request.client else None), meta=meta,
    ))


# --- CSRF: cookie auth + mandatory custom header on unsafe methods (blocked cross-site by CORS preflight) ---
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


async def csrf_guard(request: Request):
    if request.method not in SAFE_METHODS and request.headers.get("x-requested-with") != "creator-universe":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing CSRF header")


# --- Simple sliding-window limiter (per process). Replace with Redis-backed limiter when scaling API horizontally. ---
class RateLimiter:
    def __init__(self, limit, window_s: int):
        self._limit, self.window = limit, window_s  # limit: int, or a callable read at check time (from settings)
        self.hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts, try again shortly")
        q.append(now)

    @property
    def limit(self) -> int:
        return self._limit() if callable(self._limit) else self._limit

    def reset(self):
        self.hits.clear()


auth_limiter = RateLimiter(limit=10, window_s=60)
def _setting(name):
    from .config import get_settings
    return lambda: getattr(get_settings(), name)


ai_limiter = RateLimiter(limit=_setting("ai_runs_per_10min"), window_s=600)      # stops scripted abuse / runaway costs
upload_limiter = RateLimiter(limit=_setting("uploads_per_10min"), window_s=600)
