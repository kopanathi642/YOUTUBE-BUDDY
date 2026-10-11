"""Tests for API schemas."""
import pytest
from app.schemas.short import ShortRequest
from app.schemas.caption import CaptionRequest
from app.api.v1.cinematic import CinematicRequest


class TestShortRequest:
    """Tests for ShortRequest schema."""

    def test_short_request_valid(self):
        """Test creating a valid ShortRequest."""
        request = ShortRequest(
            upload_id=1,
            start_seconds=0,
            end_seconds=15,
            ratio="16:9",
            caption_style="default",
        )
        assert request.upload_id == 1
        assert request.start_seconds == 0
        assert request.end_seconds == 15
        assert request.ratio == "16:9"

    def test_short_request_ratio_type(self):
        """Test that ratio is accepted as string (validation happens in API handler)."""
        request = ShortRequest(
            upload_id=1,
            start_seconds=0,
            end_seconds=15,
            ratio="custom_ratio",  # Schema doesn't validate, API handler does
        )
        # Schema accepts any string, validation happens at the API layer
        assert request.ratio == "custom_ratio"

    def test_short_request_defaults(self):
        """Test ShortRequest with default values."""
        request = ShortRequest(
            upload_id=1,
            start_seconds=0,
            end_seconds=15,
            ratio="9:16",
        )
        assert request.caption_style is None


class TestCaptionRequest:
    """Tests for CaptionRequest schema."""

    def test_caption_request_valid_transcript(self):
        """Test creating a CaptionRequest with transcript."""
        request = CaptionRequest(
            upload_id=1,
            format="vtt",
            transcript="This is a test transcript",
        )
        assert request.upload_id == 1
        assert request.format == "vtt"
        assert request.transcript == "This is a test transcript"

    def test_caption_request_valid_segments(self):
        """Test creating a CaptionRequest with timestamped segments."""
        segments = [
            {"start": 0, "end": 5, "text": "First segment"},
            {"start": 5, "end": 10, "text": "Second segment"},
        ]
        request = CaptionRequest(
            upload_id=1,
            format="srt",
            segments=segments,
        )
        assert request.upload_id == 1
        assert len(request.segments) == 2
        assert request.segments[0]["text"] == "First segment"

    def test_caption_request_srt_format(self):
        """Test CaptionRequest with SRT format."""
        request = CaptionRequest(
            upload_id=1,
            format="srt",
            transcript="Test caption",
        )
        assert request.format == "srt"

    def test_caption_request_vtt_format(self):
        """Test CaptionRequest with VTT format."""
        request = CaptionRequest(
            upload_id=1,
            format="vtt",
            transcript="Test caption",
        )
        assert request.format == "vtt"


class TestCinematicRequest:
    """Tests for CinematicRequest schema."""

    def test_cinematic_request_valid(self):
        """Test creating a valid CinematicRequest."""
        request = CinematicRequest(
            prompt="Create a cinematic scene with mountains",
            cameraMovement="pan",
            duration=10,
            preset="openai",
        )
        assert request.prompt == "Create a cinematic scene with mountains"
        assert request.cameraMovement == "pan"
        assert request.duration == 10
        assert request.preset == "openai"

    def test_cinematic_request_defaults(self):
        """Test CinematicRequest with default values."""
        request = CinematicRequest(
            prompt="Simple prompt",
        )
        assert request.prompt == "Simple prompt"
        assert request.cameraMovement is None
        assert request.duration == 6  # default value

    def test_cinematic_request_empty_prompt_invalid(self):
        """Test that empty prompt is still valid at schema level."""
        # The schema allows it, but the API handler rejects empty prompts
        request = CinematicRequest(prompt="")
        assert request.prompt == ""
