"""
Real database operation tests — no mocks.

Tests CRUD operations on all models using a real SQLite database.
"""
import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.project import Project
from app.models.upload import Upload
from app.models.short import Short
from app.models.caption import Caption
from app.models.render_job import RenderJob
from app.models.ai_generation import AIGeneration


# ── User CRUD ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_user(session: AsyncSession):
    user = User(
        uid="db_test_user_001",
        email="dbtest@example.com",
        display_name="DB Test User",
        provider="local",
    )
    session.add(user)
    await session.flush()

    assert user.id is not None
    assert user.id > 0
    assert user.uid == "db_test_user_001"
    assert user.email == "dbtest@example.com"
    assert user.is_active is True


@pytest.mark.asyncio
async def test_query_user(session: AsyncSession, test_user: User):
    result = await session.execute(select(User).where(User.uid == test_user.uid))
    found = result.scalar_one_or_none()
    assert found is not None
    assert found.email == test_user.email


@pytest.mark.asyncio
async def test_update_user(session: AsyncSession, test_user: User):
    test_user.display_name = "Updated Creator Name"
    session.add(test_user)
    await session.flush()

    result = await session.execute(select(User).where(User.id == test_user.id))
    updated = result.scalar_one()
    assert updated.display_name == "Updated Creator Name"


# ── Project CRUD ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_project(session: AsyncSession, test_user: User):
    project = Project(
        user_id=test_user.id,
        name="My YouTube Channel",
        description="Main project",
    )
    session.add(project)
    await session.flush()

    assert project.id is not None
    assert project.user_id == test_user.id


@pytest.mark.asyncio
async def test_project_belongs_to_user(session: AsyncSession, test_user: User, test_project: Project):
    assert test_project.user_id == test_user.id


# ── Upload CRUD ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_upload(session: AsyncSession, test_user: User, test_project: Project):
    upload = Upload(
        project_id=test_project.id,
        user_id=test_user.id,
        filename="new_video.mp4",
        content_type="video/mp4",
        size_bytes=5000000,
        storage_path="/uploads/new_video.mp4",
    )
    session.add(upload)
    await session.flush()

    assert upload.id is not None
    assert upload.size_bytes == 5000000


@pytest.mark.asyncio
async def test_upload_relationships(session: AsyncSession, test_upload: Upload):
    assert test_upload.user_id is not None
    assert test_upload.project_id is not None


# ── Short CRUD ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_short(session: AsyncSession, test_user: User, test_upload: Upload):
    short = Short(
        upload_id=test_upload.id,
        user_id=test_user.id,
        ratio="9:16",
        clip_start=5,
        clip_end=20,
        storage_path="/rendered/short_001.mp4",
        status="completed",
    )
    session.add(short)
    await session.flush()

    assert short.id is not None
    assert short.ratio == "9:16"
    assert short.clip_end - short.clip_start == 15


# ── Caption CRUD ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_caption(session: AsyncSession, test_user: User, test_upload: Upload):
    caption = Caption(
        upload_id=test_upload.id,
        user_id=test_user.id,
        format="srt",
        content="1\n00:00:00,000 --> 00:00:03,000\nHello World\n",
        style="default",
        language="en",
    )
    session.add(caption)
    await session.flush()

    assert caption.id is not None
    assert caption.format == "srt"
    assert "Hello World" in caption.content


# ── RenderJob CRUD ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_render_job(session: AsyncSession, test_user: User, test_upload: Upload):
    job = RenderJob(
        upload_id=test_upload.id,
        user_id=test_user.id,
        job_type="short",
        status="processing",
        progress=50,
        result_path="/rendered/job_output.mp4",
    )
    session.add(job)
    await session.flush()

    assert job.id is not None
    assert job.status == "processing"
    assert job.progress == 50


@pytest.mark.asyncio
async def test_render_job_lifecycle(session: AsyncSession, test_user: User, test_upload: Upload):
    """Test the full lifecycle: pending → processing → completed."""
    job = RenderJob(
        upload_id=test_upload.id,
        user_id=test_user.id,
        job_type="thumbnail",
        status="pending",
        progress=0,
    )
    session.add(job)
    await session.flush()
    assert job.status == "pending"

    job.status = "processing"
    job.progress = 50
    await session.flush()
    assert job.status == "processing"

    job.status = "completed"
    job.progress = 100
    job.result_path = "/rendered/thumb.jpg"
    await session.flush()
    assert job.status == "completed"
    assert job.progress == 100


# ── AIGeneration CRUD ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_ai_generation(session: AsyncSession, test_user: User):
    gen = AIGeneration(
        user_id=test_user.id,
        agent_name="studio:cineshot",
        prompt="A dramatic sunset over mountains",
        output="Generated image URL: https://example.com/image.png",
        status="completed",
    )
    session.add(gen)
    await session.flush()

    assert gen.id is not None
    assert gen.agent_name == "studio:cineshot"
    assert gen.status == "completed"


@pytest.mark.asyncio
async def test_ai_generation_with_upload(session: AsyncSession, test_user: User, test_upload: Upload):
    gen = AIGeneration(
        user_id=test_user.id,
        upload_id=test_upload.id,
        agent_name="viral",
        prompt="Analyse transcript for viral moments",
        output='{"clip_timestamps": [], "summary": "test"}',
        status="completed",
    )
    session.add(gen)
    await session.flush()

    assert gen.upload_id == test_upload.id


# ── Aggregate queries ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_count_user_uploads(session: AsyncSession, test_user: User, test_upload: Upload):
    count = await session.scalar(
        select(func.count(Upload.id)).where(Upload.user_id == test_user.id)
    )
    assert count >= 1


@pytest.mark.asyncio
async def test_user_generation_history(session: AsyncSession, test_user: User):
    # Create multiple generations
    for i in range(3):
        gen = AIGeneration(
            user_id=test_user.id,
            agent_name=f"agent_{i}",
            prompt=f"Test prompt {i}",
            status="completed",
        )
        session.add(gen)
    await session.flush()

    result = await session.execute(
        select(AIGeneration)
        .where(AIGeneration.user_id == test_user.id)
        .order_by(AIGeneration.created_at.desc())
    )
    generations = result.scalars().all()
    assert len(generations) >= 3
