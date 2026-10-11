from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.schemas.user import UserProfile
from app.services.ownership import require_upload, require_user
from app.services.transcription import transcribe_video

router = APIRouter()


@router.get("/{video_id}")
async def get_transcription(
    video_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    upload = await require_upload(session, video_id, user)
    transcript_path = Path(upload.storage_path).with_suffix(".transcript.json")
    if not transcript_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")
    return {"upload_id": upload.id, "transcript_path": str(transcript_path)}


@router.post("/{video_id}/create")
async def create_transcription(
    video_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    upload = await require_upload(session, video_id, user)
    transcript_path = str(Path(upload.storage_path).with_suffix(".transcript.json"))
    try:
        result = await transcribe_video(upload.storage_path, transcript_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return {"upload_id": upload.id, **result}
