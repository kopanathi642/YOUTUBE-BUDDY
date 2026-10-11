"""
Production video processing service.

Combines ffmpeg operations into higher‑level pipelines for the API layer.
"""
import logging
from pathlib import Path
from typing import Literal

from app.utils.ffmpeg import (
    extract_clip,
    generate_thumbnail,
    overlay_subtitles,
    transcode_video,
    create_video_from_images,
    concat_clips,
)

logger = logging.getLogger(__name__)

AspectRatio = Literal["16:9", "9:16", "1:1", "4:5"]
RATIO_DIMENSIONS: dict[AspectRatio, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
}


async def create_short_clip(
    source_path: str,
    start: int,
    end: int,
    ratio: AspectRatio,
    output_path: str,
) -> str:
    """Extract a clip and transcode it to the target aspect ratio."""
    logger.info(
        "Creating short clip | source=%s start=%d end=%d ratio=%s",
        source_path, start, end, ratio,
    )
    temp_clip = str(Path(output_path).with_suffix(".clip.mp4"))
    await extract_clip(source_path, temp_clip, start, end)

    width, height = RATIO_DIMENSIONS[ratio]
    await transcode_video(temp_clip, output_path, width, height)

    # Cleanup temp clip
    temp_path = Path(temp_clip)
    if temp_path.exists():
        temp_path.unlink()
        logger.debug("Cleaned up temp clip: %s", temp_clip)

    logger.info("Short clip created → %s", output_path)
    return output_path


async def create_styled_caption_video(
    source_path: str,
    subtitle_file: str,
    output_path: str,
) -> str:
    """Burn subtitles into a video."""
    logger.info("Overlaying subtitles | source=%s subs=%s", source_path, subtitle_file)
    await overlay_subtitles(source_path, subtitle_file, output_path)
    logger.info("Caption video created → %s", output_path)
    return output_path


async def create_thumbnail(source_path: str, output_path: str) -> str:
    """Generate a thumbnail from a video at the 3‑second mark."""
    logger.info("Generating thumbnail | source=%s", source_path)
    await generate_thumbnail(source_path, output_path)
    logger.info("Thumbnail created → %s", output_path)
    return output_path


async def assemble_short_with_captions(
    source_path: str,
    start: int,
    end: int,
    ratio: AspectRatio,
    subtitle_file: str,
    output_path: str,
) -> str:
    """
    Full pipeline: extract clip → resize → burn captions → final output.
    """
    logger.info("Assembling short with captions | start=%d end=%d ratio=%s", start, end, ratio)
    clip_path = str(Path(output_path).with_suffix(".nocaption.mp4"))
    await create_short_clip(source_path, start, end, ratio, clip_path)
    await overlay_subtitles(clip_path, subtitle_file, output_path)

    # Cleanup intermediate
    clip = Path(clip_path)
    if clip.exists():
        clip.unlink()

    logger.info("Short with captions assembled → %s", output_path)
    return output_path


async def create_slideshow_video(
    image_paths: list[str],
    output_path: str,
    duration_per_image: int = 3,
    ratio: AspectRatio = "16:9",
) -> str:
    """Create a slideshow video from a list of images."""
    width, height = RATIO_DIMENSIONS[ratio]
    logger.info("Creating slideshow | images=%d ratio=%s", len(image_paths), ratio)
    await create_video_from_images(image_paths, output_path, duration_per_image, width=width, height=height)
    logger.info("Slideshow created → %s", output_path)
    return output_path


async def merge_clips(clip_paths: list[str], output_path: str) -> str:
    """Merge multiple video clips into a single video."""
    logger.info("Merging %d clips", len(clip_paths))
    await concat_clips(clip_paths, output_path)
    logger.info("Merged video → %s", output_path)
    return output_path
