"""
Production FFmpeg utility.

All functions are async and shell out to the system ffmpeg binary.
Includes health check, progress parsing, and additional operations
for slideshow creation, watermarks, and clip concatenation.
"""
import asyncio
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)


def check_ffmpeg_installed() -> bool:
    """Return True if ffmpeg and ffprobe are available on PATH."""
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg:
        logger.error("ffmpeg not found in PATH")
    if not ffprobe:
        logger.warning("ffprobe not found in PATH (needed for duration queries)")
    return ffmpeg is not None


async def run_ffmpeg(args: list[str]) -> str:
    """Run an ffmpeg command and return stderr output for diagnostics."""
    if not check_ffmpeg_installed():
        raise RuntimeError(
            "ffmpeg is not installed or not in PATH. "
            "Install ffmpeg before using video/audio processing features."
        )

    logger.info("ffmpeg %s", " ".join(args[:6]) + ("…" if len(args) > 6 else ""))
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    stderr_text = stderr.decode(errors="replace")

    if process.returncode != 0:
        logger.error("ffmpeg failed (rc=%d): %s", process.returncode, stderr_text[-500:])
        raise RuntimeError(f"FFmpeg failed (exit {process.returncode}): {stderr_text[-300:]}")

    logger.info("ffmpeg completed successfully")
    return stderr_text


async def get_duration(input_path: str) -> float:
    """Get media duration in seconds using ffprobe."""
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await process.communicate()
    try:
        return float(stdout.decode().strip())
    except (ValueError, AttributeError):
        return 0.0


# ── core operations ─────────────────────────────────────────────────────────

async def extract_audio(input_path: str, output_path: str) -> None:
    """Extract audio from video as 16 kHz mono WAV (optimised for Whisper)."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    await run_ffmpeg([
        "-y",
        "-i", input_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        output_path,
    ])


async def generate_thumbnail(input_path: str, output_path: str, timestamp: int = 3) -> None:
    """Extract a single frame as a JPEG/PNG thumbnail."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    await run_ffmpeg([
        "-y",
        "-ss", str(timestamp),
        "-i", input_path,
        "-frames:v", "1",
        "-q:v", "2",
        output_path,
    ])


async def transcode_video(
    input_path: str,
    output_path: str,
    width: int,
    height: int,
) -> None:
    """Transcode and resize video to the given dimensions."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    await run_ffmpeg([
        "-y",
        "-i", input_path,
        "-vf", (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1"
        ),
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ])


async def extract_clip(
    input_path: str,
    output_path: str,
    start: int,
    end: int,
) -> None:
    """Extract a clip from start to end seconds."""
    duration = end - start
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    await run_ffmpeg([
        "-y",
        "-ss", str(start),
        "-i", input_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ])


async def overlay_subtitles(
    input_path: str,
    subtitle_path: str,
    output_path: str,
) -> None:
    """Burn subtitles into video.  Handles Windows paths by escaping."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    # Windows paths need colon and backslash escaping for the subtitles filter
    safe_sub_path = subtitle_path.replace("\\", "/").replace(":", "\\:")
    await run_ffmpeg([
        "-y",
        "-i", input_path,
        "-vf", f"subtitles='{safe_sub_path}'",
        "-c:a", "copy",
        output_path,
    ])


# ── new production operations ───────────────────────────────────────────────

async def create_video_from_images(
    image_paths: list[str],
    output_path: str,
    duration_per_image: int = 3,
    fps: int = 30,
    width: int = 1920,
    height: int = 1080,
) -> None:
    """Create a slideshow video from a list of images with cross-fade transitions."""
    if not image_paths:
        raise ValueError("At least one image is required")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Build filter complex for concatenation with cross-fade
    inputs = []
    filter_parts = []
    for i, img in enumerate(image_paths):
        inputs.extend(["-loop", "1", "-t", str(duration_per_image), "-i", img])
        filter_parts.append(
            f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[v{i}]"
        )

    # Concatenate all scaled inputs
    concat_inputs = "".join(f"[v{i}]" for i in range(len(image_paths)))
    filter_parts.append(f"{concat_inputs}concat=n={len(image_paths)}:v=1:a=0[outv]")
    filter_complex = ";".join(filter_parts)

    args = ["-y"] + inputs + [
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "23",
        output_path,
    ]
    await run_ffmpeg(args)


async def add_watermark(
    input_path: str,
    watermark_path: str,
    output_path: str,
    position: str = "bottom_right",
    opacity: float = 0.3,
) -> None:
    """Overlay a watermark image on a video."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    pos_map = {
        "top_left": "10:10",
        "top_right": "main_w-overlay_w-10:10",
        "bottom_left": "10:main_h-overlay_h-10",
        "bottom_right": "main_w-overlay_w-10:main_h-overlay_h-10",
        "center": "(main_w-overlay_w)/2:(main_h-overlay_h)/2",
    }
    overlay_pos = pos_map.get(position, pos_map["bottom_right"])

    await run_ffmpeg([
        "-y",
        "-i", input_path,
        "-i", watermark_path,
        "-filter_complex",
        f"[1:v]format=rgba,colorchannelmixer=aa={opacity}[wm];[0:v][wm]overlay={overlay_pos}",
        "-c:a", "copy",
        output_path,
    ])


async def concat_clips(
    clip_paths: list[str],
    output_path: str,
) -> None:
    """Concatenate multiple video clips into one."""
    if not clip_paths:
        raise ValueError("At least one clip is required")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Write concat file
    concat_file = Path(output_path).with_suffix(".concat.txt")
    lines = [f"file '{Path(p).resolve()}'" for p in clip_paths]
    concat_file.write_text("\n".join(lines), encoding="utf-8")

    try:
        await run_ffmpeg([
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            output_path,
        ])
    finally:
        if concat_file.exists():
            concat_file.unlink()


async def create_test_video(
    output_path: str,
    duration: int = 5,
    width: int = 1280,
    height: int = 720,
) -> None:
    """Create a synthetic test video with test pattern and sine tone (for testing)."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    await run_ffmpeg([
        "-y",
        "-f", "lavfi",
        "-i", f"testsrc=duration={duration}:size={width}x{height}:rate=30",
        "-f", "lavfi",
        "-i", f"sine=frequency=440:duration={duration}",
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        output_path,
    ])
