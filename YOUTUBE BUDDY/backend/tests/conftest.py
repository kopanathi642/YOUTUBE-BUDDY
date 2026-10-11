"""Pytest configuration and shared fixtures — REAL database, no mocks."""
import asyncio
import pytest
import pytest_asyncio
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.user import User
from app.models.project import Project
from app.models.upload import Upload
from app.models.short import Short
from app.models.caption import Caption
from app.models.render_job import RenderJob
from app.models.ai_generation import AIGeneration
from app.core.security import create_access_token
from app.schemas.user import UserProfile


# ── Real async SQLite database for testing ──────────────────────────────────

TEST_DB_PATH = Path(__file__).parent / "fixtures" / "test.db"
TEST_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH}"

TEST_UPLOAD_DIR = Path(__file__).parent / "fixtures" / "uploads"
TEST_RENDER_DIR = Path(__file__).parent / "fixtures" / "rendered"
TEST_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEST_RENDER_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture(scope="session")
def event_loop():
    """Create a shared event loop for all async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    """Create a real async engine and set up all tables."""
    eng = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    """Provide a real AsyncSession with transaction rollback per test."""
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as sess:
        async with sess.begin():
            yield sess
            await sess.rollback()


# ── Real model fixtures ─────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_user(session: AsyncSession) -> User:
    """Create a real user in the database."""
    user = User(
        uid="test_uid_prod_001",
        email="testuser@youtubebuddy.com",
        display_name="Test Creator",
        picture="https://example.com/avatar.jpg",
        provider="google",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


@pytest_asyncio.fixture
async def test_project(session: AsyncSession, test_user: User) -> Project:
    """Create a real project in the database."""
    project = Project(
        user_id=test_user.id,
        name="Test Channel Project",
        description="Production test workspace",
    )
    session.add(project)
    await session.flush()
    return project


@pytest_asyncio.fixture
async def test_upload(session: AsyncSession, test_user: User, test_project: Project) -> Upload:
    """Create a real upload record in the database."""
    # Create a small test file
    test_file = TEST_UPLOAD_DIR / "test_video.mp4"
    if not test_file.exists():
        test_file.write_bytes(b"\x00" * 1024)  # Placeholder for tests that don't need real video

    upload = Upload(
        project_id=test_project.id,
        user_id=test_user.id,
        filename="test_video.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path=str(test_file),
    )
    session.add(upload)
    await session.flush()
    return upload


@pytest_asyncio.fixture
def test_user_profile() -> UserProfile:
    """Create a UserProfile for auth testing."""
    return UserProfile(
        uid="test_uid_prod_001",
        email="testuser@youtubebuddy.com",
        display_name="Test Creator",
        picture="https://example.com/avatar.jpg",
        provider="google",
    )


@pytest_asyncio.fixture
def test_auth_token(test_user_profile: UserProfile) -> str:
    """Create a real JWT token for the test user."""
    return create_access_token(
        subject=test_user_profile.uid,
        additional_claims={
            "email": test_user_profile.email,
            "name": test_user_profile.display_name,
        },
    )


# ── Helper fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def upload_dir() -> Path:
    return TEST_UPLOAD_DIR


@pytest.fixture
def render_dir() -> Path:
    return TEST_RENDER_DIR
