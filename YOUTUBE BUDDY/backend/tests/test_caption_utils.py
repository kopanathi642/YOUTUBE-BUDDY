"""Tests for caption utility functions."""
import pytest
from app.api.v1.captions import _timestamp, _caption_content
from app.schemas.caption import CaptionRequest


class TestTimestampFunction:
    """Tests for _timestamp helper function."""

    def test_timestamp_vtt_format(self):
        """Test VTT timestamp formatting."""
        result = _timestamp(5.5, ".")
        assert result == "00:00:05.500"

    def test_timestamp_srt_format(self):
        """Test SRT timestamp formatting."""
        result = _timestamp(5.5, ",")
        assert result == "00:00:05,500"

    def test_timestamp_zero(self):
        """Test timestamp at zero seconds."""
        result = _timestamp(0, ".")
        assert result == "00:00:00.000"

    def test_timestamp_large_values(self):
        """Test timestamp with hours and minutes."""
        result = _timestamp(3661.5, ".")  # 1 hour, 1 minute, 1.5 seconds
        assert result == "01:01:01.500"

    def test_timestamp_fractional_seconds(self):
        """Test timestamp with fractional seconds."""
        result = _timestamp(10.123, ".")
        # Note: rounding can cause slight variance, so we check for approximate value
        assert "00:00:10.12" in result


class TestCaptionContent:
    """Tests for _caption_content function."""

    def test_caption_content_vtt_from_transcript(self):
        """Test VTT caption generation from transcript."""
        request = CaptionRequest(
            upload_id=1,
            format="vtt",
            transcript="Hello, this is a test",
        )
        content = _caption_content(request)
        assert "WEBVTT" in content
        assert "Hello, this is a test" in content

    def test_caption_content_srt_from_transcript(self):
        """Test SRT caption generation from transcript."""
        request = CaptionRequest(
            upload_id=1,
            format="srt",
            transcript="Hello world",
        )
        content = _caption_content(request)
        assert "00:00:00,000 --> 00:00:05,000" in content
        assert "Hello world" in content

    def test_caption_content_with_segments_vtt(self):
        """Test VTT caption with explicit segments."""
        segments = [
            {"start": 0, "end": 5, "text": "First segment"},
            {"start": 5, "end": 10, "text": "Second segment"},
        ]
        request = CaptionRequest(
            upload_id=1,
            format="vtt",
            segments=segments,
        )
        content = _caption_content(request)
        assert "WEBVTT" in content
        assert "First segment" in content
        assert "Second segment" in content
        assert "00:00:00.000 --> 00:00:05.000" in content
        assert "00:00:05.000 --> 00:00:10.000" in content

    def test_caption_content_with_segments_srt(self):
        """Test SRT caption with explicit segments."""
        segments = [
            {"start": 0, "end": 5, "text": "First segment"},
            {"start": 5, "end": 10, "text": "Second segment"},
        ]
        request = CaptionRequest(
            upload_id=1,
            format="srt",
            segments=segments,
        )
        content = _caption_content(request)
        # SRT format should have numbered indices
        assert "1" in content
        assert "2" in content
        assert "First segment" in content
        assert "Second segment" in content

    def test_caption_content_plain_text(self):
        """Test plain text caption output."""
        segments = [
            {"start": 0, "end": 5, "text": "First"},
            {"start": 5, "end": 10, "text": "Second"},
        ]
        request = CaptionRequest(
            upload_id=1,
            format="plain",
            segments=segments,
        )
        content = _caption_content(request)
        assert "First" in content
        assert "Second" in content
        assert "WEBVTT" not in content  # Plain text shouldn't have VTT header

    def test_caption_content_empty_segments_raises_error(self):
        """Test that empty segments without transcript raises error."""
        from fastapi import HTTPException
        request = CaptionRequest(
            upload_id=1,
            format="vtt",
        )
        with pytest.raises(HTTPException) as exc_info:
            _caption_content(request)
        assert exc_info.value.status_code == 400
        assert "transcript or timestamped segments are required" in exc_info.value.detail

    def test_caption_content_filters_empty_text(self):
        """Test that segments with empty text are filtered."""
        segments = [
            {"start": 0, "end": 5, "text": ""},
            {"start": 5, "end": 10, "text": "Valid text"},
        ]
        request = CaptionRequest(
            upload_id=1,
            format="vtt",
            segments=segments,
        )
        content = _caption_content(request)
        # Should only contain one segment with valid text
        assert "Valid text" in content
        # Count occurrences of timestamps to verify only one segment
        count = content.count("-->")
        assert count == 1
