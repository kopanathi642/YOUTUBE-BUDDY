from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.schemas.user import UserProfile
from app.services.ownership import require_upload, require_user
from app.services.social_upload import prepare_social_post

router = APIRouter()


@router.post("/prepare")
async def prepare_social_media_post(
    upload_id: int,
    platform: str,
    title: str,
    description: str,
    hashtags: list[str],
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    await require_upload(session, upload_id, user)
    payload = prepare_social_post(upload_id, title, description, hashtags)
    payload["platform"] = platform
    payload["status"] = "draft"
    return payload


@router.post("/schedule")
async def schedule_social_upload(
    upload_id: int,
    platform: str,
    title: str,
    description: str,
    publish_time: str,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    await require_upload(session, upload_id, user)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"{platform} publishing is not configured. Connect the platform API and token storage before scheduling uploads.",
    )
