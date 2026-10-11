"""Tests for video processing utilities."""
import pytest
from app.services.video_processing import RATIO_DIMENSIONS, AspectRatio


class TestRatioDimensions:
    """Tests for aspect ratio dimension mappings."""

    def test_ratio_16_9(self):
        """Test 16:9 ratio dimensions."""
        assert RATIO_DIMENSIONS["16:9"] == (1920, 1080)

    def test_ratio_9_16(self):
        """Test 9:16 ratio dimensions."""
        assert RATIO_DIMENSIONS["9:16"] == (1080, 1920)

    def test_ratio_1_1(self):
        """Test 1:1 ratio dimensions."""
        assert RATIO_DIMENSIONS["1:1"] == (1080, 1080)

    def test_ratio_4_5(self):
        """Test 4:5 ratio dimensions."""
        assert RATIO_DIMENSIONS["4:5"] == (1080, 1350)

    def test_all_ratios_valid(self):
        """Test that all aspect ratios are valid."""
        valid_ratios = ["16:9", "9:16", "1:1", "4:5"]
        for ratio in valid_ratios:
            assert ratio in RATIO_DIMENSIONS
            width, height = RATIO_DIMENSIONS[ratio]
            assert isinstance(width, int)
            assert isinstance(height, int)
            assert width > 0
            assert height > 0

    def test_aspect_ratio_type_hints(self):
        """Test that aspect ratio type is defined."""
        # This is a Literal type, so we just check the string values match
        valid_ratios: list[AspectRatio] = ["16:9", "9:16", "1:1", "4:5"]
        for ratio in valid_ratios:
            assert ratio in RATIO_DIMENSIONS


class TestRatioValidation:
    """Tests for aspect ratio validation in requests."""

    def test_valid_ratio_9_16(self):
        """Test validation of 9:16 ratio."""
        from app.schemas.short import ShortRequest
        request = ShortRequest(
            upload_id=1,
            start_seconds=0,
            end_seconds=15,
            ratio="9:16",
        )
        # Should not raise an error
        assert request.ratio == "9:16"

    def test_valid_ratio_1_1(self):
        """Test validation of 1:1 ratio."""
        from app.schemas.short import ShortRequest
        request = ShortRequest(
            upload_id=1,
            start_seconds=0,
            end_seconds=15,
            ratio="1:1",
        )
        assert request.ratio == "1:1"

    def test_ratio_dimensions_consistency(self):
        """Test that dimension pairs are consistent across ratios."""
        ratios = ["16:9", "9:16", "1:1", "4:5"]
        for ratio in ratios:
            width, height = RATIO_DIMENSIONS[ratio]
            # Width and height should swap between 16:9 and 9:16
            if ratio == "16:9":
                other_width, other_height = RATIO_DIMENSIONS["9:16"]
                assert width == other_height
                assert height == other_width
            # 1:1 should be square
            if ratio == "1:1":
                assert width == height
