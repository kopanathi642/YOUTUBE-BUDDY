from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.render_job import RenderJob
from app.models.short import Short
from app.models.upload import Upload
from app.schemas.user import UserProfile
from app.services.ownership import require_user

router = APIRouter()


@router.get("/overview")
async def overview(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    total_videos = await session.scalar(select(func.count(Upload.id)).where(Upload.user_id == user.id)) or 0
    total_shorts = await session.scalar(select(func.count(Short.id)).where(Short.user_id == user.id)) or 0
    active_jobs = await session.scalar(
        select(func.count(RenderJob.id)).where(RenderJob.user_id == user.id, RenderJob.status.in_(["pending", "processing"]))
    ) or 0
    storage_used = await session.scalar(select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(Upload.user_id == user.id)) or 0
    return {
        "totalVideos": total_videos,
        "totalShorts": total_shorts,
        "activeJobs": active_jobs,
        "storageUsed": int(storage_used),
    }


@router.get("/channel")
async def channel_stats(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return channel stats from our own database only.

    YouTube-specific metrics (views, subscribers) should be fetched
    client-side from the YouTube Data API v3 — we never fake those.
    """
    user = await require_user(session, current_user)
    total_videos = await session.scalar(select(func.count(Upload.id)).where(Upload.user_id == user.id)) or 0
    total_shorts = await session.scalar(select(func.count(Short.id)).where(Short.user_id == user.id)) or 0
    active_jobs = await session.scalar(
        select(func.count(RenderJob.id)).where(RenderJob.user_id == user.id, RenderJob.status.in_(["pending", "processing"]))
    ) or 0
    return {
        "totalVideos": total_videos,
        "totalShorts": total_shorts,
        "activeJobs": active_jobs,
    }


@router.get("/videos/{video_id}")
async def video_stats(
    video_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    upload = await session.scalar(select(Upload).where(Upload.id == video_id, Upload.user_id == user.id))
    if not upload:
        return {"views": 0, "likes": 0, "comments": 0, "shares": 0}
    return {"views": 0, "likes": 0, "comments": 0, "shares": 0, "uploadId": upload.id}
