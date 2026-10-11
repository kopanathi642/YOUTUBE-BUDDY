"""
Production Celery task definitions.

Each task runs in a background worker process and handles:
  - Video rendering (short clips, transcoding)
  - Thumbnail generation
  - Audio transcription (Whisper)
  - AI analysis (viral clip detection)
  - Image generation (studio tools)

Tasks support progress reporting via self.update_state() and
automatic retry with exponential backoff on failure.
"""
import asyncio
import json
import logging
from pathlib import Path

from app.core.celery_app import celery_app
from app.services.video_processing import create_short_clip, create_thumbnail, assemble_short_with_captions
from app.services.ai_generation import (
    analyze_transcript_for_clips,
    generate_image_from_prompt,
    generate_studio_text,
    save_generated_image,
)
from app.services.transcription import transcribe_video

logger = logging.getLogger(__name__)


# ── Video rendering tasks ───────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.render_short")
def render_short_task(
    self,
    upload_path: str,
    start: int,
    end: int,
    ratio: str,
    output_path: str,
) -> dict:
    """Render a short clip from a source video."""
    try:
        self.update_state(state="STARTED", meta={"progress": 5, "stage": "extracting_clip"})
        logger.info("Render short task started | upload=%s %d-%d %s", upload_path, start, end, ratio)

        self.update_state(state="PROGRESS", meta={"progress": 20, "stage": "transcoding"})
        result = asyncio.run(create_short_clip(upload_path, start, end, ratio, output_path))

        self.update_state(state="PROGRESS", meta={"progress": 90, "stage": "finalising"})
        file_size = Path(output_path).stat().st_size if Path(output_path).exists() else 0

        return {
            "status": "completed",
            "output": result,
            "file_size": file_size,
        }
    except Exception as exc:
        logger.exception("Render short failed")
        raise self.retry(exc=exc, countdown=30, max_retries=3)


@celery_app.task(bind=True, name="tasks.render_short_with_captions")
def render_short_with_captions_task(
    self,
    upload_path: str,
    start: int,
    end: int,
    ratio: str,
    subtitle_file: str,
    output_path: str,
) -> dict:
    """Render a short clip with burned-in captions."""
    try:
        self.update_state(state="STARTED", meta={"progress": 5, "stage": "preparing"})
        result = asyncio.run(
            assemble_short_with_captions(upload_path, start, end, ratio, subtitle_file, output_path)
        )
        return {"status": "completed", "output": result}
    except Exception as exc:
        logger.exception("Render short with captions failed")
        raise self.retry(exc=exc, countdown=30, max_retries=3)


# ── Thumbnail tasks ─────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.generate_thumbnail")
def generate_thumbnail_task(self, upload_path: str, output_path: str) -> dict:
    """Generate a thumbnail from a video."""
    try:
        asyncio.run(create_thumbnail(upload_path, output_path))
        return {"status": "completed", "output": output_path}
    except Exception as exc:
        logger.exception("Thumbnail generation failed")
        raise self.retry(exc=exc, countdown=20, max_retries=2)


# ── Transcription tasks ─────────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.transcribe")
def transcribe_task(
    self,
    upload_path: str,
    transcript_path: str,
    language: str = "en",
    provider: str = "openai",
) -> dict:
    """Full transcription pipeline: extract audio → transcribe → save."""
    try:
        self.update_state(state="STARTED", meta={"progress": 5, "stage": "extracting_audio"})
        logger.info("Transcription task started | file=%s provider=%s", upload_path, provider)

        self.update_state(state="PROGRESS", meta={"progress": 20, "stage": "transcribing"})
        result = asyncio.run(transcribe_video(upload_path, transcript_path, language, provider))

        self.update_state(state="PROGRESS", meta={"progress": 90, "stage": "saving"})
        return {
            "status": "completed",
            "result": {
                "transcript_path": result.get("transcript_path"),
                "full_text": result.get("full_text", "")[:500],  # Preview
                "timestamp_count": len(result.get("timestamps", [])),
                "srt_path": result.get("srt_path"),
                "vtt_path": result.get("vtt_path"),
            },
        }
    except Exception as exc:
        logger.exception("Transcription failed")
        raise self.retry(exc=exc, countdown=30, max_retries=3)


# ── AI analysis tasks ───────────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.viral_clip_analysis")
def viral_clip_analysis_task(
    self,
    transcript: str,
    provider: str = "openai",
) -> dict:
    """Analyse transcript for viral clip potential."""
    try:
        self.update_state(state="STARTED", meta={"progress": 10, "stage": "analysing"})
        metrics = analyze_transcript_for_clips(transcript, provider=provider)
        return {"status": "completed", "analysis": metrics}
    except Exception as exc:
        logger.exception("Viral clip analysis failed")
        raise self.retry(exc=exc, countdown=30, max_retries=3)


# ── Image generation tasks ──────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.generate_image")
def generate_image_task(
    self,
    prompt: str,
    tool_id: str = "cineshot",
    provider: str = "openai",
    filename: str | None = None,
) -> dict:
    """Generate an image using AI and save to disk."""
    try:
        self.update_state(state="STARTED", meta={"progress": 10, "stage": "generating"})
        logger.info("Image generation task | tool=%s provider=%s", tool_id, provider)

        url_or_data = generate_image_from_prompt(prompt, provider=provider, tool_id=tool_id)

        self.update_state(state="PROGRESS", meta={"progress": 70, "stage": "saving"})
        output_filename = filename or f"{tool_id}_{Path(prompt[:20]).stem.replace(' ', '_')}.png"
        local_path = save_generated_image(url_or_data, output_filename)

        return {
            "status": "completed",
            "image_url": url_or_data,
            "local_path": local_path,
        }
    except Exception as exc:
        logger.exception("Image generation failed")
        raise self.retry(exc=exc, countdown=20, max_retries=2)


# ── Text generation tasks ───────────────────────────────────────────────────

@celery_app.task(bind=True, name="tasks.generate_text")
def generate_text_task(
    self,
    tool_id: str,
    prompt: str,
    provider: str = "openai",
) -> dict:
    """Run a text-generation studio tool as a background task."""
    try:
        self.update_state(state="STARTED", meta={"progress": 10, "stage": "generating"})
        result = generate_studio_text(tool_id, prompt, provider=provider)
        return {"status": "completed", "result": result}
    except Exception as exc:
        logger.exception("Text generation failed")
        raise self.retry(exc=exc, countdown=20, max_retries=2)


# ── Health check task ────────────────────────────────────────────────────────

@celery_app.task(name="tasks.health_check")
def health_check_task() -> dict:
    """Simple health check to verify worker is alive."""
    return {"status": "ok", "worker": "alive"}
