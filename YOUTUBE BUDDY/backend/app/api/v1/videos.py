from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.upload import Upload
from app.schemas.upload import UploadResponse
from app.schemas.user import UserProfile
from app.services.ai_generation import analyze_transcript_for_clips
from app.services.transcription import transcribe_video as run_transcription
from app.services.ownership import get_or_create_default_project, require_upload, require_user
from app.services.storage import save_upload_file, unique_upload_path
from app.core.config import settings

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Upload:
    user = await require_user(session, current_user)
    project = await get_or_create_default_project(session, user)

    destination = unique_upload_path(file.filename or "upload.bin")
    size_bytes = await save_upload_file(file, destination, settings.MAX_UPLOAD_SIZE_BYTES)

    upload = Upload(
        project_id=project.id,
        user_id=user.id,
        filename=file.filename or Path(destination).name,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=size_bytes,
        storage_path=destination,
    )
    session.add(upload)
    await session.commit()
    await session.refresh(upload)
    return upload


@router.get("", response_model=list[UploadResponse], include_in_schema=False)
@router.get("/", response_model=list[UploadResponse])
async def list_videos(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Upload]:
    user = await require_user(session, current_user)
    query = select(Upload).where(Upload.user_id == user.id).order_by(Upload.created_at.desc())
    result = await session.execute(query)
    return list(result.scalars().all())


@router.get("/{video_id}", response_model=UploadResponse)
async def get_video(
    video_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Upload:
    user = await require_user(session, current_user)
    return await require_upload(session, video_id, user)


@router.delete("/{video_id}")
async def delete_video(
    video_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    upload = await require_upload(session, video_id, user)
    storage_path = Path(upload.storage_path)
    if storage_path.exists() and storage_path.is_file():
        storage_path.unlink()
    await session.delete(upload)
    await session.commit()
    return {"status": "deleted", "id": video_id}


@router.get("/{video_id}/status")
async def get_video_status(
    video_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    upload = await require_upload(session, video_id, user)
    return {
        "id": upload.id,
        "status": "uploaded",
        "filename": upload.filename,
        "content_type": upload.content_type,
        "size_bytes": upload.size_bytes,
    }


@router.post("/transcribe")
async def transcribe_video_endpoint(
    upload_id: int,
    language: str = "en",
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    upload = await require_upload(session, upload_id, user)
    
    if not Path(upload.storage_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Uploaded file is missing from storage")

    transcript_dir = Path(settings.UPLOAD_DIR) / "transcripts"
    transcript_dir.mkdir(parents=True, exist_ok=True)
    transcript_path = transcript_dir / f"{upload.id}.json"

    try:
        result = await run_transcription(upload.storage_path, str(transcript_path), language=language)
        return {
            "upload_id": upload.id,
            "status": "completed",
            "transcript": result.get("raw_response", {}).get("text", ""),
            "timestamps": result.get("timestamps", []),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(exc)}"
        ) from exc


@router.post("/analyze")
async def analyze_for_clips(
    upload_id: int,
    transcript: str,
    provider: str = Query("openai", pattern="^(openai|huggingface|hf|ollama)$"),
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    await require_upload(session, upload_id, user)

    try:
        result = analyze_transcript_for_clips(transcript, provider=provider.lower())
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return {
        "transcript_id": upload_id,
        "provider": provider,
        "clip_candidates": result.get("clip_timestamps", []),
        "suggested_titles": result.get("suggested_titles", []),
        "summary": result.get("summary"),
        "recommended_ratios": ["9:16", "1:1", "4:5"],
    }
