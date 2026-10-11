"""
Production transcription service.

Handles the full pipeline: extract audio → transcribe → save results → generate captions.
"""
import json
import logging
from pathlib import Path

from app.models.caption import Caption
from app.schemas.caption import CaptionRequest
from app.utils.ffmpeg import extract_audio
from app.utils.whisper import (
    extract_timestamps,
    generate_srt_from_segments,
    generate_vtt_from_segments,
    transcribe_audio,
)

logger = logging.getLogger(__name__)


async def transcribe_video(
    upload_path: str,
    transcript_path: str,
    language: str = "en",
    provider: str = "openai",
) -> dict:
    """
    Full transcription pipeline:
      1. Extract audio from video as WAV
      2. Transcribe via selected provider (OpenAI Whisper / HuggingFace)
      3. Extract structured timestamps
      4. Save transcript JSON
      5. Auto-generate SRT and VTT caption files

    Returns dict with transcript_path, full_text, timestamps, srt_path, vtt_path.
    """
    logger.info("Starting transcription pipeline | video=%s provider=%s", upload_path, provider)

    # Step 1 — extract audio
    audio_path = str(Path(transcript_path).with_suffix(".wav"))
    await extract_audio(upload_path, audio_path)
    logger.info("Audio extracted → %s", audio_path)

    # Step 2 — transcribe
    result = transcribe_audio(audio_path, language=language, provider=provider)

    # Step 3 — extract timestamps
    timestamps = extract_timestamps(result)
    full_text = result.get("text", "")

    # Step 4 — save transcript JSON
    Path(transcript_path).parent.mkdir(parents=True, exist_ok=True)
    transcript_data = {
        "text": full_text,
        "timestamps": timestamps,
        "language": language,
        "provider": provider,
        "duration": result.get("duration"),
        "raw_response": result,
    }
    Path(transcript_path).write_text(
        json.dumps(transcript_data, default=str, indent=2),
        encoding="utf-8",
    )
    logger.info("Transcript saved → %s", transcript_path)

    # Step 5 — auto-generate caption files
    srt_path = str(Path(transcript_path).with_suffix(".srt"))
    vtt_path = str(Path(transcript_path).with_suffix(".vtt"))

    if timestamps:
        srt_content = generate_srt_from_segments(timestamps)
        Path(srt_path).write_text(srt_content, encoding="utf-8")
        logger.info("SRT captions generated → %s", srt_path)

        vtt_content = generate_vtt_from_segments(timestamps)
        Path(vtt_path).write_text(vtt_content, encoding="utf-8")
        logger.info("VTT captions generated → %s", vtt_path)
    else:
        srt_path = ""
        vtt_path = ""

    # Cleanup temp audio
    audio_file = Path(audio_path)
    if audio_file.exists():
        audio_file.unlink()
        logger.debug("Cleaned up temp audio: %s", audio_path)

    return {
        "transcript_path": transcript_path,
        "full_text": full_text,
        "timestamps": timestamps,
        "srt_path": srt_path,
        "vtt_path": vtt_path,
        "duration": result.get("duration"),
        "raw_response": result,
    }


def create_caption_file(
    upload_id: int,
    caption_request: CaptionRequest,
    caption_text: str,
) -> Caption:
    """Create a Caption model instance from a request."""
    caption = Caption(
        upload_id=upload_id,
        user_id=0,
        format=caption_request.format,
        content=caption_text,
        style=caption_request.style or "default",
        language=caption_request.language,
    )
    return caption
