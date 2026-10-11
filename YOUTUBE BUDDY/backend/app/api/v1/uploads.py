from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.security import get_current_user
from app.models.upload import Upload
from app.schemas.upload import UploadCreate, UploadResponse
from app.schemas.user import UserProfile
from app.services.ownership import get_or_create_default_project, require_user
from app.services.storage import save_upload_file, unique_upload_path

router = APIRouter()


@router.post("/chunk")
async def upload_chunk(
    file: UploadFile = File(...),
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await require_user(session, current_user)
    destination = unique_upload_path(file.filename or "upload.bin")
    size_bytes = await save_upload_file(file, destination, settings.MAX_UPLOAD_SIZE_BYTES)
    return {"uploaded": True, "path": destination, "size_bytes": size_bytes}


@router.post("/metadata", response_model=UploadResponse)
async def register_upload(
    payload: UploadCreate,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Upload:
    user = await require_user(session, current_user)
    project = await get_or_create_default_project(session, user)

    upload = Upload(
        project_id=project.id,
        user_id=user.id,
        filename=payload.filename,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        duration_seconds=payload.duration_seconds,
        storage_path=payload.storage_path,
    )
    session.add(upload)
    await session.commit()
    await session.refresh(upload)
    return upload


@router.post("/cloud-upload")
async def cloud_upload(current_user: UserProfile = Depends(get_current_user)) -> dict:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Cloud upload is not configured. Configure a production storage provider before enabling this endpoint.",
    )


@router.get("/progress")
async def upload_progress(file_id: int, current_user: UserProfile = Depends(get_current_user)) -> dict:
    return {"file_id": file_id, "progress": None, "status": "not_tracked"}
