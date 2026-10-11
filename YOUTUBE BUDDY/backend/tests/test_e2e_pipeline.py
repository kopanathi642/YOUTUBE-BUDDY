"""
End-to-end pipeline tests.

These tests exercise the full production flow:
  Upload → Transcribe → Analyse → Generate Short → Captions

Requires:
  - ffmpeg installed
  - OPENAI_API_KEY set (for AI-powered tests)
"""
import asyncio
import os
import json
import pytest
from pathlib import Path

from tests.conftest import TEST_UPLOAD_DIR, TEST_RENDER_DIR

HAS_OPENAI = bool(os.getenv("OPENAI_API_KEY", ""))
live = pytest.mark.live
skip_no_openai = pytest.mark.skipif(not HAS_OPENAI, reason="OPENAI_API_KEY not set")


# ── FFmpeg Pipeline Tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ffmpeg_health_check():
    """Verify ffmpeg is installed and accessible."""
    from app.utils.ffmpeg import check_ffmpeg_installed

    result = check_ffmpeg_installed()
    if not result:
        pytest.skip("ffmpeg not installed")
    assert result is True
    print("\n✓ ffmpeg is installed and accessible")


@pytest.mark.asyncio
async def test_create_test_video():
    """Create a synthetic test video with ffmpeg."""
    from app.utils.ffmpeg import create_test_video, check_ffmpeg_installed

    if not check_ffmpeg_installed():
        pytest.skip("ffmpeg not installed")

    output = str(TEST_UPLOAD_DIR / "e2e_test_video.mp4")
    await create_test_video(output, duration=5, width=1280, height=720)

    assert Path(output).exists()
    assert Path(output).stat().st_size > 1000
    print(f"\n✓ Test video created: {output} ({Path(output).stat().st_size} bytes)")


@pytest.mark.asyncio
async def test_extract_clip_from_video():
    """Extract a clip from a test video."""
    from app.utils.ffmpeg import create_test_video, check_ffmpeg_installed
    from app.services.video_processing import create_short_clip

    if not check_ffmpeg_installed():
        pytest.skip("ffmpeg not installed")

    # Create source video
    source = str(TEST_UPLOAD_DIR / "clip_source.mp4")
    await create_test_video(source, duration=10)

    # Extract clip
    output = str(TEST_RENDER_DIR / "e2e_short_clip.mp4")
    result = await create_short_clip(source, start=2, end=7, ratio="9:16", output_path=output)

    assert Path(result).exists()
    assert Path(result).stat().st_size > 1000
    print(f"\n✓ Short clip extracted: {result} ({Path(result).stat().st_size} bytes)")


@pytest.mark.asyncio
async def test_generate_thumbnail():
    """Generate a thumbnail from a test video."""
    from app.utils.ffmpeg import create_test_video, check_ffmpeg_installed
    from app.services.video_processing import create_thumbnail

    if not check_ffmpeg_installed():
        pytest.skip("ffmpeg not installed")

    source = str(TEST_UPLOAD_DIR / "thumb_source.mp4")
    await create_test_video(source, duration=5)

    output = str(TEST_RENDER_DIR / "e2e_thumbnail.jpg")
    result = await create_thumbnail(source, output)

    assert Path(result).exists()
    assert Path(result).stat().st_size > 100
    print(f"\n✓ Thumbnail generated: {result}")


@pytest.mark.asyncio
async def test_extract_audio_from_video():
    """Extract audio from video for transcription."""
    from app.utils.ffmpeg import create_test_video, extract_audio, check_ffmpeg_installed

    if not check_ffmpeg_installed():
        pytest.skip("ffmpeg not installed")

    source = str(TEST_UPLOAD_DIR / "audio_source.mp4")
    await create_test_video(source, duration=5)

    output = str(TEST_RENDER_DIR / "e2e_extracted_audio.wav")
    await extract_audio(source, output)

    assert Path(output).exists()
    assert Path(output).stat().st_size > 1000
    print(f"\n✓ Audio extracted: {output} ({Path(output).stat().st_size} bytes)")


# ── Full Transcription Pipeline ──────────────────────────────────────────────

@live
@skip_no_openai
@pytest.mark.asyncio
async def test_full_transcription_pipeline():
    """Full pipeline: create video → extract audio → transcribe with Whisper."""
    from app.utils.ffmpeg import create_test_video, check_ffmpeg_installed
    from app.services.transcription import transcribe_video

    if not check_ffmpeg_installed():
        pytest.skip("ffmpeg not installed")

    # Create test video with audio
    source = str(TEST_UPLOAD_DIR / "transcribe_source.mp4")
    await create_test_video(source, duration=5)

    # Run full transcription pipeline
    transcript_path = str(TEST_RENDER_DIR / "e2e_transcript.json")
    result = await transcribe_video(source, transcript_path, provider="openai")

    assert result["transcript_path"] == transcript_path
    assert Path(transcript_path).exists()

    # Verify transcript JSON
    transcript_data = json.loads(Path(transcript_path).read_text())
    assert "text" in transcript_data
    assert "timestamps" in transcript_data

    # Verify auto-generated caption files
    if result.get("srt_path"):
        assert Path(result["srt_path"]).exists()
        print(f"  SRT: {result['srt_path']}")
    if result.get("vtt_path"):
        assert Path(result["vtt_path"]).exists()
        print(f"  VTT: {result['vtt_path']}")

    print(f"\n✓ Full transcription pipeline completed")
    print(f"  Text: {transcript_data.get('text', '')[:100]}...")
    print(f"  Segments: {len(transcript_data.get('timestamps', []))}")


# ── Viral Clip Analysis Pipeline ─────────────────────────────────────────────

@live
@skip_no_openai
def test_viral_clip_analysis():
    """Analyse a transcript for viral clip potential using real AI."""
    from app.services.ai_generation import analyze_transcript_for_clips

    test_transcript = (
        "Hey everyone, welcome back to the channel! Today I'm going to show you "
        "something absolutely incredible that nobody is talking about. This changed "
        "everything for me and I think it will change everything for you too. "
        "So let me break it down step by step. First, you need to understand that "
        "the algorithm favors watch time above all else. If you can keep viewers "
        "watching for the first 30 seconds, you're golden. Second, thumbnails with "
        "faces and bright colors get 73% more clicks. And third — this is the big "
        "one — posting at the right time can double your views overnight. "
        "I tested this on my own channel and went from 100 views to 10,000 views "
        "in just one week. Let me show you exactly how I did it."
    )

    result = analyze_transcript_for_clips(test_transcript, provider="openai")

    assert "analysis" in result
    assert "summary" in result
    print(f"\n✓ Viral clip analysis completed")
    print(f"  Clips found: {len(result.get('clip_timestamps', []))}")
    print(f"  Titles suggested: {result.get('suggested_titles', [])[:3]}")
    print(f"  Viral score: {result.get('overall_viral_score')}")


# ── Studio Image Generation Pipeline ─────────────────────────────────────────

@live
@skip_no_openai
def test_studio_image_generation_and_save():
    """Generate an image with a studio tool and save to disk."""
    from app.services.ai_generation import generate_image_from_prompt, save_generated_image

    # Generate image
    result = generate_image_from_prompt(
        "A dramatic sunset over mountains with a silhouetted hiker",
        provider="openai",
        tool_id="cineshot",
    )

    assert result is not None

    # Save to disk
    output_path = save_generated_image(result, "e2e_studio_cineshot.png")
    assert Path(output_path).exists()
    assert Path(output_path).stat().st_size > 1000
    print(f"\n✓ Studio image generated and saved: {output_path}")


# ── Caption Generation ───────────────────────────────────────────────────────

def test_srt_generation():
    """Test SRT caption file generation from segments."""
    from app.utils.whisper import generate_srt_from_segments

    segments = [
        {"start": 0.0, "end": 3.5, "text": "Hello and welcome to the channel."},
        {"start": 3.5, "end": 7.2, "text": "Today we're going to talk about AI."},
        {"start": 7.2, "end": 12.0, "text": "Let's dive right in."},
    ]

    srt = generate_srt_from_segments(segments)

    assert "1\n" in srt
    assert "00:00:00,000 --> 00:00:03,500" in srt
    assert "Hello and welcome" in srt
    assert srt.count("-->") == 3
    print(f"\n✓ SRT generation:\n{srt}")


def test_vtt_generation():
    """Test VTT caption file generation from segments."""
    from app.utils.whisper import generate_vtt_from_segments

    segments = [
        {"start": 0.0, "end": 3.5, "text": "Hello and welcome."},
        {"start": 3.5, "end": 7.2, "text": "Let's get started."},
    ]

    vtt = generate_vtt_from_segments(segments)

    assert vtt.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:03.500" in vtt
    assert "Hello and welcome" in vtt
    print(f"\n✓ VTT generation:\n{vtt}")


# ── Celery Task Verification ─────────────────────────────────────────────────

def test_celery_health_check():
    """Test Celery health check task (eager mode)."""
    os.environ["CELERY_TASK_ALWAYS_EAGER"] = "True"

    from app.workers.celery_tasks import health_check_task

    result = health_check_task()
    assert result["status"] == "ok"
    assert result["worker"] == "alive"
    print("\n✓ Celery health check passed")


# ── Prompt Template Verification ─────────────────────────────────────────────

def test_all_prompt_templates_exist():
    """Verify all studio tools have prompt templates."""
    from app.services.prompt_templates import TOOL_PROMPTS, build_image_prompt, build_text_prompt, get_system_prompt

    expected_tools = [
        "cineshot", "moodboard", "character", "persona", "aesthetic",
        "relight", "inpaint", "faceswap", "charswap", "fashion",
        "script", "seo", "trend", "viral", "cinematic", "voiceover", "upload",
    ]

    for tool_id in expected_tools:
        assert tool_id in TOOL_PROMPTS, f"Missing prompt template for: {tool_id}"

        system = get_system_prompt(tool_id)
        assert len(system) > 20, f"System prompt too short for: {tool_id}"

        text_prompt = build_text_prompt(tool_id, "test prompt")
        assert len(text_prompt) > 50, f"Text prompt too short for: {tool_id}"

    # Test image prompts for image tools
    image_tools = ["cineshot", "moodboard", "character", "persona", "aesthetic",
                   "relight", "inpaint", "faceswap", "charswap", "fashion"]
    for tool_id in image_tools:
        img_prompt = build_image_prompt(tool_id, "test scene")
        assert len(img_prompt) > 50, f"Image prompt too short for: {tool_id}"

    print(f"\n✓ All {len(expected_tools)} prompt templates verified")
