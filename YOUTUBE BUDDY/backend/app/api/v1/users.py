import hashlib
import secrets
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import delete_cache
from app.core.database import get_session
from app.core.security import get_current_user
from app.models.api_key import ApiKey
from app.models.short import Short
from app.models.subscription import Subscription
from app.models.upload import Upload
from app.schemas.user import UserProfile, UserResponse, UserUpdate
from app.services.auth import update_user_profile
from app.services.ownership import require_user

router = APIRouter()


async def _profile_payload(session: AsyncSession, current_user: UserProfile) -> dict:
    user = await require_user(session, current_user)

    video_count = await session.scalar(select(func.count(Upload.id)).where(Upload.user_id == user.id)) or 0
    shorts_count = await session.scalar(select(func.count(Short.id)).where(Short.user_id == user.id)) or 0
    storage_used = await session.scalar(select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(Upload.user_id == user.id)) or 0

    subscription = await session.scalar(
        select(Subscription)
        .where(Subscription.user_id == user.id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )

    return {
        "id": user.id,
        "uid": user.uid,
        "email": user.email,
        "display_name": user.display_name,
        "picture": user.picture,
        "provider": user.provider,
        "channel_name": user.channel_name,
        "channel_url": user.channel_url,
        "is_active": user.is_active,
        "is_paid": user.is_paid,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "plan": subscription.plan if subscription else "free",
        "total_videos": video_count,
        "total_shorts": shorts_count,
        "storage_used": int(storage_used),
        "storage_limit": 10737418240,
    }


@router.get("/profile", response_model=UserResponse)
async def get_profile(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await _profile_payload(session, current_user)


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    payload: UserUpdate,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await require_user(session, current_user)
    await update_user_profile(session, current_user.uid, payload)
    await delete_cache(f"user_profile:{current_user.uid}")
    return await _profile_payload(session, current_user)


@router.get("/api-keys")
async def list_api_keys(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    query = select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.is_active.is_(True)).order_by(ApiKey.created_at.desc())
    result = await session.execute(query)
    keys = result.scalars().all()
    return {
        "data": [
            {
                "id": key.id,
                "name": key.name,
                "prefix": key.key_prefix,
                "createdAt": key.created_at.isoformat() if key.created_at else None,
            }
            for key in keys
        ]
    }


@router.post("/api-keys")
async def create_api_key(
    name: str = Body(default="Production API Key", embed=True),
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    raw_key = f"ytb_live_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    api_key = ApiKey(
        user_id=user.id,
        name=name,
        key_prefix=raw_key[:16],
        key_hash=key_hash,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)
    return {
        "data": {
            "id": api_key.id,
            "name": api_key.name,
            "key": raw_key,
            "prefix": api_key.key_prefix,
            "createdAt": api_key.created_at.isoformat() if api_key.created_at else None,
        }
    }


@router.delete("/api-keys/{key_id}")
async def delete_api_key(
    key_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    api_key = await session.scalar(select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id))
    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    api_key.is_active = False
    api_key.revoked_at = datetime.utcnow()
    await session.commit()
    return {"status": "revoked", "id": key_id}


@router.get("/subscription")
async def get_subscription(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    subscription = await session.scalar(
        select(Subscription)
        .where(Subscription.user_id == user.id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    if not subscription:
        return {"data": {"plan": "free", "status": "active", "renewalDate": None}}
    return {
        "data": {
            "plan": subscription.plan,
            "status": subscription.status,
            "provider": subscription.provider,
            "renewalDate": subscription.expires_at.isoformat() if subscription.expires_at else None,
        }
    }
