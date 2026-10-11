import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_session
from app.core.security import get_current_user
from app.models.render_job import RenderJob
from app.models.short import Short
from app.schemas.short import ShortRequest, ShortResponse
from app.schemas.user import UserProfile
from app.services.ownership import require_upload, require_user
from app.services.video_processing import RATIO_DIMENSIONS, create_short_clip

logger = logging.getLogger(__name__)
router = APIRouter()


async def _process_short_render_job(
    short_id: int,
    job_id: int,
    source_path: str,
    start: int,
    end: int,
    ratio: str,
    output_path: str,
) -> None:
    """Asynchronous background worker that renders the short clip and updates status."""
    async with AsyncSessionLocal() as session:
        try:
            job = await session.get(RenderJob, job_id)
            if job:
                job.progress = 20
                await session.commit()

            await create_short_clip(source_path, start, end, ratio, output_path)

            short = await session.get(Short, short_id)
            job = await session.get(RenderJob, job_id)
            if short:
                short.status = "completed"
            if job:
                job.status = "completed"
                job.progress = 100
                job.result_path = output_path
            await session.commit()
            logger.info("Short #%d rendered successfully -> %s", short_id, output_path)
        except Exception as exc:
            logger.exception("Background render failed for Short #%d: %s", short_id, exc)
            short = await session.get(Short, short_id)
            job = await session.get(RenderJob, job_id)
            if short:
                short.status = "failed"
            if job:
                job.status = "failed"
                job.progress = 100
                job.error_message = str(exc)
            await session.commit()


@router.post("/generate", response_model=ShortResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_short(
    request: ShortRequest,
    background_tasks: BackgroundTasks,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Short:
    user = await require_user(session, current_user)
    if request.upload_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="videoId/upload_id is required")
    if request.ratio not in RATIO_DIMENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported aspect ratio")

    upload = await require_upload(session, request.upload_id, user)
    if request.end_seconds <= request.start_seconds:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="endSeconds must be greater than startSeconds")

    render_dir = Path(settings.RENDER_DIR)
    render_dir.mkdir(parents=True, exist_ok=True)
    output_path = str((render_dir / f"short_{upload.id}_{uuid4().hex}_{request.ratio.replace(':', 'x')}.mp4").resolve())

    short = Short(
        upload_id=upload.id,
        user_id=user.id,
        ratio=request.ratio,
        clip_start=request.start_seconds or 0,
        clip_end=request.end_seconds or 15,
        storage_path=output_path,
        caption_style=request.caption_style,
        status="processing",
    )
    session.add(short)
    await session.flush()

    render_job = RenderJob(
        upload_id=upload.id,
        user_id=user.id,
        job_type="short",
        status="processing",
        progress=5,
        result_path=output_path,
    )
    session.add(render_job)
    await session.commit()
    await session.refresh(short)

    # Dispatch to background task without blocking the HTTP request
    background_tasks.add_task(
        _process_short_render_job,
        short.id,
        render_job.id,
        upload.storage_path,
        short.clip_start,
        short.clip_end,
        request.ratio,
        output_path,
    )

    return short


@router.get("", response_model=list[ShortResponse], include_in_schema=False)
@router.get("/", response_model=list[ShortResponse])
async def list_shorts(
    videoId: int | None = Query(default=None),
    upload_id: int | None = Query(default=None),
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Short]:
    user = await require_user(session, current_user)
    target_upload_id = upload_id or videoId
    query = select(Short).where(Short.user_id == user.id).order_by(Short.created_at.desc())
    if target_upload_id is not None:
        await require_upload(session, target_upload_id, user)
        query = query.where(Short.upload_id == target_upload_id)
    result = await session.execute(query)
    return list(result.scalars().all())


@router.get("/list/{upload_id}", response_model=list[ShortResponse])
async def list_shorts_by_upload(
    upload_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Short]:
    return await list_shorts(upload_id=upload_id, current_user=current_user, session=session)
