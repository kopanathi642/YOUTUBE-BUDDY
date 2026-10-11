import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from jose import JWTError, jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import settings
from app.core.firebase import verify_firebase_token
from app.schemas.user import UserProfile

logger = logging.getLogger(__name__)

security = HTTPBearer()


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    additional_claims: Optional[dict[str, Any]] = None,
) -> str:
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    if additional_claims:
        payload.update(additional_claims)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials") from exc


def firebase_token_to_profile(id_token: str) -> UserProfile:
    """Verify a Firebase ID token and return a UserProfile.

    This should ONLY be called from the firebase-login endpoint.
    Firebase tokens are signed by Google — never decode them as local JWTs.
    """
    try:
        payload = verify_firebase_token(id_token)
        uid = payload.get("sub")
        email = payload.get("email")
        if not uid or not email:
            logger.error("Firebase token missing sub/email: %s", {k: v for k, v in payload.items() if k in ("sub", "email", "iss", "aud")})
            raise HTTPException(status_code=401, detail="Firebase token is missing user identity")
        return UserProfile(
            uid=uid,
            email=email,
            display_name=payload.get("name"),
            picture=payload.get("picture"),
            provider=payload.get("firebase", {}).get("sign_in_provider", "google"),
        )
    except ValueError as exc:
        logger.error("Firebase token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {exc}") from exc


def token_to_profile(token: str) -> UserProfile:
    """Verify a bearer token (local JWT first, then Firebase fallback).

    Used by get_current_user() on protected routes where the token
    could be either a local JWT (issued by /login, /signup) or a
    Firebase ID token (issued by /firebase-login).
    """
    # Try local JWT first
    try:
        decoded = verify_access_token(token)
        uid = decoded.get("sub")
        email = decoded.get("email")
        if not uid or not email:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return UserProfile(
            uid=uid,
            email=email,
            display_name=decoded.get("name"),
            picture=decoded.get("picture"),
            provider=decoded.get("provider") or "local",
        )
    except HTTPException:
        logger.debug("Local JWT decode failed, trying Firebase token verification")

    # Fallback: Firebase ID token
    try:
        payload = verify_firebase_token(token)
        return UserProfile(
            uid=payload.get("sub"),
            email=payload.get("email"),
            display_name=payload.get("name"),
            picture=payload.get("picture"),
            provider=payload.get("firebase", {}).get("sign_in_provider", "google"),
        )
    except ValueError as exc:
        logger.error("Both JWT and Firebase verification failed for token")
        raise HTTPException(status_code=401, detail="Invalid authentication credentials") from exc


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> UserProfile:
    token = credentials.credentials
    return token_to_profile(token)
