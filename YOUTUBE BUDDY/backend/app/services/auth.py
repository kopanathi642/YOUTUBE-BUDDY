import hashlib
import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
from app.models.user import User
from app.schemas.user import UserProfile, UserUpdate
from app.core.cache import get_cache, set_cache, delete_cache
from app.core.config import settings


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


async def get_or_create_user(session: AsyncSession, profile: UserProfile) -> User:
    query = select(User).where(User.uid == profile.uid)
    result = await session.execute(query)
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            uid=profile.uid,
            email=profile.email,
            display_name=profile.display_name,
            picture=profile.picture,
            provider=profile.provider,
            channel_name=profile.channel_name,
            channel_url=profile.channel_url,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


async def create_user(session: AsyncSession, email: str, password: str, display_name: str | None = None) -> User:
    existing = await get_user_by_email(session, email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        uid=str(uuid.uuid4()),
        email=email.lower(),
        password_hash=hash_password(password),
        display_name=display_name or email.split("@")[0],
        provider="local",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User | None:
    query = select(User).where(User.email == email.lower())
    result = await session.execute(query)
    user = result.scalar_one_or_none()
    if not user:
        return None
    if user.password_hash != hash_password(password):
        return None
    return user


async def get_or_create_demo_user(session: AsyncSession) -> User:
    """Return the stable local demo account used by the development login page."""
    user = await get_user_by_email(session, settings.DEMO_LOGIN_EMAIL)
    if user:
        if not user.password_hash:
            user.password_hash = hash_password(settings.DEMO_LOGIN_PASSWORD)
            user.provider = "local"
            await session.commit()
            await session.refresh(user)
        return user

    user = User(
        uid="demo-user-123",
        email=settings.DEMO_LOGIN_EMAIL,
        password_hash=hash_password(settings.DEMO_LOGIN_PASSWORD),
        display_name="Demo Creator",
        provider="local",
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    query = select(User).where(User.email == email.lower())
    result = await session.execute(query)
    return result.scalar_one_or_none()


async def get_user_by_uid(session: AsyncSession, uid: str) -> User | None:
    # Try cache first
    cache_key = f"user:{uid}"
    cached_user = await get_cache(cache_key)
    if cached_user:
        if isinstance(cached_user.get("created_at"), str):
            cached_user["created_at"] = datetime.fromisoformat(cached_user["created_at"])
        if isinstance(cached_user.get("updated_at"), str):
            cached_user["updated_at"] = datetime.fromisoformat(cached_user["updated_at"])
        return User(**cached_user)

    query = select(User).where(User.uid == uid)
    result = await session.execute(query)
    user = result.scalar_one_or_none()

    # Cache for 10 minutes if user exists
    if user:
        await set_cache(cache_key, {
            "id": user.id,
            "uid": user.uid,
            "email": user.email,
            "password_hash": user.password_hash,
            "display_name": user.display_name,
            "picture": user.picture,
            "provider": user.provider,
            "channel_name": user.channel_name,
            "channel_url": user.channel_url,
            "is_active": user.is_active,
            "is_paid": user.is_paid,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        }, 600)

    return user


async def update_user_profile(session: AsyncSession, uid: str, payload: UserUpdate) -> User:
    user = await get_user_by_uid(session, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.channel_name is not None:
        user.channel_name = payload.channel_name
    if payload.channel_url is not None:
        user.channel_url = payload.channel_url

    session.add(user)
    await session.commit()
    await session.refresh(user)

    # Invalidate cache
    cache_key = f"user:{uid}"
    await delete_cache(cache_key)

    return user


async def assert_user_active(user: User) -> None:
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
