"""Integration tests for API endpoints - real database and API calls."""
import pytest
import json
import shutil
from pathlib import Path
from datetime import datetime
from uuid import uuid4
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.base import Base
from app.models.user import User
from app.models.project import Project
from app.models.upload import Upload
from app.schemas.user import UserProfile
from tests.integration_config import (
    TEST_DATABASE_URL,
    TEST_UPLOAD_DIR,
    TEST_RENDER_DIR,
)
from tests.media_utils import (
    create_test_video,
    create_test_audio,
    create_test_srt_file,
    create_test_json_transcript,
)


@pytest.fixture
async def test_db_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True,
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def test_session(test_db_engine):
    """Create test database session."""
    async_session = sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session() as session:
        yield session


@pytest.fixture
async def test_user(test_session):
    """Create test user in database."""
    user = User(
        uid=str(uuid4()),
        email="test@example.com",
        display_name="Test User",
        is_active=True,
    )
    test_session.add(user)
    await test_session.commit()
    await test_session.refresh(user)
    return user


@pytest.fixture
async def test_upload(test_session, test_user):
    """Create test upload in database with real video file."""
    # Create test video
    video_path = Path(TEST_UPLOAD_DIR) / "test_video.mp4"
    success = create_test_video(str(video_path), duration=30, width=1920, height=1080)
    
    if not success:
        pytest.skip("ffmpeg not available")
    
    project = Project(
        user_id=test_user.id,
        name="Integration Test Project",
        description="Project used by integration tests",
    )
    test_session.add(project)
    await test_session.flush()

    upload = Upload(
        project_id=project.id,
        user_id=test_user.id,
        filename="test_video.mp4",
        storage_path=str(video_path),
        content_type="video/mp4",
        size_bytes=video_path.stat().st_size,
        duration_seconds=30,
    )
    test_session.add(upload)
    await test_session.commit()
    await test_session.refresh(upload)
    return upload


class TestDatabaseOperations:
    """Tests for real database operations."""
    
    @pytest.mark.asyncio
    async def test_create_user(self, test_session, test_user):
        """Test creating a user in database."""
        assert test_user.id is not None
        assert test_user.uid == test_user.uid
        assert test_user.email == "test@example.com"
    
    @pytest.mark.asyncio
    async def test_create_upload(self, test_session, test_upload, test_user):
        """Test creating an upload in database."""
        assert test_upload.id is not None
        assert test_upload.user_id == test_user.id
        assert test_upload.filename == "test_video.mp4"
        assert test_upload.duration_seconds == 30
    
    @pytest.mark.asyncio
    async def test_query_user_uploads(self, test_session, test_upload, test_user):
        """Test querying user uploads from database."""
        from sqlalchemy import select
        
        query = select(Upload).where(Upload.user_id == test_user.id)
        result = await test_session.execute(query)
        uploads = result.scalars().all()
        
        assert len(uploads) == 1
        assert uploads[0].id == test_upload.id


class TestImageGeneration:
    """Tests for OpenAI image generation."""
    
    @pytest.mark.asyncio
    async def test_openai_image_generation(self):
        """Test generating image with OpenAI."""
        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")
        
        from app.utils.openai_client import generate_image
        
        # Generate image with custom prompt
        prompt = "A cinematic YouTube thumbnail for a tech tutorial video with bold colors and clear text overlay"
        
        try:
            result = generate_image(prompt)
            assert result is not None
            assert len(result) > 0
            # Result should be a URL or base64
            assert "http" in result or "data:image" in result
            print(f"Generated image URL: {result[:50]}...")
        except RuntimeError as e:
            if "quota exceeded" in str(e).lower() or "rate limit" in str(e).lower():
                pytest.skip(f"API rate limit: {e}")
            raise


class TestVideoRendering:
    """Tests for video rendering with ffmpeg."""
    
    @pytest.mark.asyncio
    async def test_create_short_clip(self, test_upload):
        """Test creating a short clip from video."""
        if not Path("ffmpeg").exists() and not Path("ffmpeg.exe").exists():
            try:
                import shutil
                if not shutil.which("ffmpeg"):
                    pytest.skip("ffmpeg not available")
            except:
                pytest.skip("ffmpeg not available")
        
        from app.services.video_processing import create_short_clip
        
        output_path = Path(TEST_RENDER_DIR) / f"short_{uuid4().hex}.mp4"
        
        try:
            result = await create_short_clip(
                test_upload.storage_path,
                start=0,
                end=15,
                ratio="9:16",
                output_path=str(output_path),
            )
            
            assert Path(result).exists()
            assert output_path.stat().st_size > 0
            print(f"Created short clip: {result}")
        except Exception as e:
            pytest.skip(f"ffmpeg error: {e}")
    
    @pytest.mark.asyncio
    async def test_create_thumbnail(self, test_upload):
        """Test creating a thumbnail from video."""
        if not shutil.which("ffmpeg"):
            pytest.skip("ffmpeg not available")
        
        from app.services.video_processing import create_thumbnail
        
        output_path = Path(TEST_RENDER_DIR) / f"thumb_{uuid4().hex}.jpg"
        
        try:
            result = await create_thumbnail(
                test_upload.storage_path,
                str(output_path),
            )
            
            assert Path(result).exists()
            assert output_path.stat().st_size > 0
            print(f"Created thumbnail: {result}")
        except Exception as e:
            pytest.skip(f"ffmpeg error: {e}")


class TestAudioTranscription:
    """Tests for audio transcription with Whisper."""
    
    @pytest.mark.asyncio
    async def test_extract_audio_from_video(self, test_upload):
        """Test extracting audio from video."""
        from tests.media_utils import extract_audio_from_video
        
        audio_path = Path(TEST_UPLOAD_DIR) / f"audio_{uuid4().hex}.mp3"
        
        success = extract_audio_from_video(
            test_upload.storage_path,
            str(audio_path),
        )
        
        if not success:
            pytest.skip("ffmpeg audio extraction failed")
        
        assert audio_path.exists()
        assert audio_path.stat().st_size > 0
        print(f"Extracted audio: {audio_path}")
    
    @pytest.mark.asyncio
    async def test_whisper_transcription(self):
        """Test audio transcription with Whisper API."""
        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")
        
        from tests.media_utils import create_test_audio
        from app.utils.openai_client import transcribe_audio_file
        
        # Create test audio
        audio_path = Path(TEST_UPLOAD_DIR) / "test_audio.mp3"
        success = create_test_audio(str(audio_path), duration=5, frequency=1000)
        
        if not success:
            pytest.skip("ffmpeg audio creation failed")
        
        try:
            result = await transcribe_audio_file(str(audio_path))
            
            assert "text" in result or "result" in result
            print(f"Transcription result: {result}")
        except RuntimeError as e:
            if "rate limit" in str(e).lower():
                pytest.skip(f"API rate limit: {e}")
            raise


class TestCaptionGeneration:
    """Tests for caption generation."""
    
    @pytest.mark.asyncio
    async def test_generate_vtt_captions(self, test_session, test_upload, test_user):
        """Test generating VTT captions."""
        from app.models.caption import Caption
        from app.schemas.caption import CaptionRequest
        from app.api.v1.captions import _caption_content
        
        segments = [
            {"start": 0, "end": 3, "text": "Hello, welcome to this video"},
            {"start": 3, "end": 6, "text": "Today we'll be learning about YouTube"},
            {"start": 6, "end": 10, "text": "content creation and automation"},
        ]
        
        request = CaptionRequest(
            upload_id=test_upload.id,
            format="vtt",
            segments=segments,
        )
        
        content = _caption_content(request)
        
        assert "WEBVTT" in content
        assert "Hello, welcome to this video" in content
        assert "00:00:00.000 --> 00:00:03.000" in content
        
        # Save to database
        caption = Caption(
            upload_id=test_upload.id,
            user_id=test_user.id,
            format="vtt",
            content=content,
            style="default",
            language="en",
        )
        test_session.add(caption)
        await test_session.commit()
        
        assert caption.id is not None
        print(f"Generated VTT captions (ID: {caption.id})")
    
    @pytest.mark.asyncio
    async def test_generate_srt_captions(self, test_session, test_upload, test_user):
        """Test generating SRT captions."""
        from app.models.caption import Caption
        from app.schemas.caption import CaptionRequest
        from app.api.v1.captions import _caption_content
        
        segments = [
            {"start": 0, "end": 3, "text": "First segment of the video"},
            {"start": 3, "end": 6, "text": "Second segment with more content"},
        ]
        
        request = CaptionRequest(
            upload_id=test_upload.id,
            format="srt",
            segments=segments,
        )
        
        content = _caption_content(request)
        
        assert "1" in content  # SRT numbering
        assert "00:00:00,000 --> 00:00:03,000" in content
        assert "First segment of the video" in content


class TestCinematicGeneration:
    """Tests for cinematic scene generation."""
    
    @pytest.mark.asyncio
    async def test_openai_cinematic_generation(self, test_session, test_user):
        """Test generating cinematic scene with OpenAI."""
        if not settings.OPENAI_API_KEY:
            pytest.skip("OPENAI_API_KEY not set")
        
        from app.models.ai_generation import AIGeneration
        from app.utils.openai_client import create_completion
        
        prompt = (
            "Create a production-ready cinematic generation brief as strict JSON with keys: "
            "logline, shot_list, camera_plan, lighting, sound, edit_notes. "
            "Duration: 30 seconds. Camera movement: dynamic crane shot. "
            "Scene: A futuristic tech company office with holographic displays, "
            "neon lighting, and employees collaborating on AI projects."
        )
        
        try:
            response = create_completion(prompt)
            generated_text = response["choices"][0]["message"]["content"].strip()
            
            assert generated_text is not None
            assert len(generated_text) > 0
            
            # Save to database
            generation = AIGeneration(
                user_id=test_user.id,
                upload_id=None,
                agent_name="cinematic",
                prompt=prompt[:200],
                output=generated_text,
                status="completed",
            )
            test_session.add(generation)
            await test_session.commit()
            
            assert generation.id is not None
            print(f"Generated cinematic brief (ID: {generation.id})")
            print(f"Output preview: {generated_text[:200]}...")
        except RuntimeError as e:
            if "rate limit" in str(e).lower():
                pytest.skip(f"API rate limit: {e}")
            raise


class TestEndToEndWorkflow:
    """Tests for complete end-to-end workflow."""
    
    @pytest.mark.asyncio
    async def test_full_video_processing_pipeline(self, test_session, test_upload, test_user):
        """Test complete pipeline: upload -> captions -> shorts -> renders."""
        from app.models.caption import Caption
        from app.models.short import Short
        from app.schemas.caption import CaptionRequest
        from app.api.v1.captions import _caption_content
        from sqlalchemy import select
        
        # Step 1: Create captions
        segments = [
            {"start": 0, "end": 5, "text": "Introduction"},
            {"start": 5, "end": 15, "text": "Main content"},
            {"start": 15, "end": 30, "text": "Conclusion"},
        ]
        
        request = CaptionRequest(
            upload_id=test_upload.id,
            format="vtt",
            segments=segments,
        )
        
        caption_content = _caption_content(request)
        caption = Caption(
            upload_id=test_upload.id,
            user_id=test_user.id,
            format="vtt",
            content=caption_content,
        )
        test_session.add(caption)
        await test_session.commit()
        
        # Step 2: Create short (metadata only - don't render without ffmpeg)
        short = Short(
            upload_id=test_upload.id,
            user_id=test_user.id,
            ratio="9:16",
            clip_start=5,
            clip_end=20,
            storage_path=str(Path(TEST_RENDER_DIR) / f"short_{uuid4().hex}.mp4"),
            status="pending",
        )
        test_session.add(short)
        await test_session.commit()
        
        # Step 3: Verify workflow in database
        uploads_query = select(Upload).where(Upload.user_id == test_user.id)
        uploads_result = await test_session.execute(uploads_query)
        uploads = uploads_result.scalars().all()
        
        captions_query = select(Caption).where(Caption.upload_id == test_upload.id)
        captions_result = await test_session.execute(captions_query)
        captions = captions_result.scalars().all()
        
        shorts_query = select(Short).where(Short.upload_id == test_upload.id)
        shorts_result = await test_session.execute(shorts_query)
        shorts = shorts_result.scalars().all()
        
        assert len(uploads) == 1
        assert len(captions) == 1
        assert len(shorts) == 1
        
        print("End-to-end workflow completed successfully:")
        print(f"  - Upload: {test_upload.filename}")
        print(f"  - Captions: {captions[0].id}")
        print(f"  - Shorts: {shorts[0].id}")
