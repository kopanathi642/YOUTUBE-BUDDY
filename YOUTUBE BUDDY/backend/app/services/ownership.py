from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.upload import Upload
from app.models.user import User
from app.schemas.user import UserProfile
from app.services.auth import get_user_by_uid


async def require_user(session: AsyncSession, current_user: UserProfile) -> User:
    user = await get_user_by_uid(session, current_user.uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def get_or_create_default_project(session: AsyncSession, user: User) -> Project:
    query = select(Project).where(Project.user_id == user.id).order_by(Project.id.asc())
    result = await session.execute(query)
    project = result.scalars().first()
    if project:
        return project

    project = Project(
        user_id=user.id,
        name="Default Project",
        description="Auto-created workspace for uploaded videos.",
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


async def require_upload(session: AsyncSession, upload_id: int, user: User) -> Upload:
    query = select(Upload).where(Upload.id == upload_id, Upload.user_id == user.id)
    result = await session.execute(query)
    upload = result.scalar_one_or_none()
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    return upload
