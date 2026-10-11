from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.render_job import RenderJob
from app.schemas.user import UserProfile
from app.services.ownership import require_user

router = APIRouter()


def _job_payload(job: RenderJob) -> dict:
    return {
        "id": job.id,
        "upload_id": job.upload_id,
        "type": job.job_type,
        "status": job.status,
        "progress": job.progress,
        "result_path": job.result_path,
        "error": job.error_message,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


@router.get("", include_in_schema=False)
@router.get("/")
async def list_render_jobs(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    query = select(RenderJob).where(RenderJob.user_id == user.id).order_by(RenderJob.created_at.desc())
    result = await session.execute(query)
    return {"data": [_job_payload(job) for job in result.scalars().all()]}


@router.delete("/{job_id}")
async def cancel_render_job(
    job_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    job = await session.scalar(select(RenderJob).where(RenderJob.id == job_id, RenderJob.user_id == user.id))
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Render job not found")
    if job.status not in {"pending", "processing"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending or processing jobs can be cancelled")
    job.status = "cancelled"
    await session.commit()
    return {"status": "cancelled", "id": job_id}


@router.post("/{job_id}/retry")
async def retry_render_job(
    job_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    job = await session.scalar(select(RenderJob).where(RenderJob.id == job_id, RenderJob.user_id == user.id))
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Render job not found")
    job.status = "pending"
    job.progress = 0
    job.error_message = None
    await session.commit()
    return {"status": "pending", "id": job_id}
