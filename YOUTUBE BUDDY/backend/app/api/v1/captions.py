from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.caption import Caption
from app.schemas.caption import CaptionRequest, CaptionResponse
from app.schemas.user import UserProfile
from app.services.ownership import require_upload, require_user

router = APIRouter()


def _timestamp(seconds: float, separator: str) -> str:
    millis = int((seconds - int(seconds)) * 1000)
    total = int(seconds)
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    return f"{hours:02}:{minutes:02}:{secs:02}{separator}{millis:03}"


def _caption_content(request: CaptionRequest) -> str:
    caption_format = request.format.lower()
    segments = request.segments or []
    if not segments and request.transcript:
        segments = [{"start": 0, "end": 5, "text": request.transcript}]
    if not segments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transcript or timestamped segments are required to generate captions",
        )

    if caption_format == "vtt":
        lines = ["WEBVTT", ""]
        separator = "."
    elif caption_format == "srt":
        lines = []
        separator = ","
    else:
        return "\n".join(str(segment.get("text", "")).strip() for segment in segments if segment.get("text"))

    for index, segment in enumerate(segments, start=1):
        start = float(segment.get("start", 0))
        end = float(segment.get("end", start + 3))
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        if caption_format == "srt":
            lines.append(str(index))
        lines.append(f"{_timestamp(start, separator)} --> {_timestamp(end, separator)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


@router.post("/generate", response_model=CaptionResponse)
async def generate_captions(
    request: CaptionRequest,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Caption:
    user = await require_user(session, current_user)
    await require_upload(session, request.upload_id, user)

    caption = Caption(
        upload_id=request.upload_id,
        user_id=user.id,
        format=request.format.lower(),
        content=_caption_content(request),
        style=request.style or "default",
        language=request.language or "en",
    )
    session.add(caption)
    await session.commit()
    await session.refresh(caption)
    return caption


@router.get("/list/{upload_id}", response_model=list[CaptionResponse])
async def list_captions_by_upload(
    upload_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Caption]:
    user = await require_user(session, current_user)
    await require_upload(session, upload_id, user)

    query = select(Caption).where(Caption.upload_id == upload_id, Caption.user_id == user.id)
    result = await session.execute(query)
    return list(result.scalars().all())
