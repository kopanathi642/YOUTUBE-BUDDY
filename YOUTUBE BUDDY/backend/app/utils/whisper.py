"""
Production Whisper transcription utility.

Supports multiple providers:
  - openai   → OpenAI Whisper-1 API (default, best quality)
  - huggingface → HF Inference API with Whisper model
  - local    → (future) local Whisper model via transformers
"""
import logging
from typing import Any

from app.utils.openai_client import transcribe_audio_file
from app.utils.huggingface_client import transcribe_audio as hf_transcribe

logger = logging.getLogger(__name__)


def transcribe_audio(
    audio_path: str,
    language: str = "en",
    provider: str = "openai",
) -> dict[str, Any]:
    """
    Transcribe an audio file using the specified provider.

    Returns a dict with at least 'text' and optionally 'segments'.
    """
    logger.info("Transcribing audio | provider=%s file=%s language=%s", provider, audio_path, language)

    if provider in {"huggingface", "hf"}:
        result = hf_transcribe(audio_path, language=language)
    else:
        # Default: OpenAI Whisper-1
        result = transcribe_audio_file(audio_path, language=language)

    logger.info(
        "Transcription complete | text_len=%d segments=%d",
        len(result.get("text", "")),
        len(result.get("segments", [])),
    )
    return result


def extract_timestamps(transcript_response: dict) -> list[dict]:
    """Extract structured timestamp segments from a transcription response."""
    segments = transcript_response.get("segments", [])
    return [
        {
            "start": segment.get("start"),
            "end": segment.get("end"),
            "text": segment.get("text"),
        }
        for segment in segments
        if segment.get("text")
    ]


def extract_word_timestamps(transcript_response: dict) -> list[dict]:
    """Extract word-level timestamps (when available from Whisper)."""
    words = []
    for segment in transcript_response.get("segments", []):
        for word_info in segment.get("words", []):
            words.append({
                "word": word_info.get("word", "").strip(),
                "start": word_info.get("start"),
                "end": word_info.get("end"),
            })
    return words


def generate_srt_from_segments(segments: list[dict]) -> str:
    """Generate SRT subtitle content from timestamp segments."""
    lines = []
    for i, seg in enumerate(segments, 1):
        start = _format_timestamp(seg.get("start", 0), separator=",")
        end = _format_timestamp(seg.get("end", 0), separator=",")
        text = seg.get("text", "").strip()
        if text:
            lines.append(f"{i}")
            lines.append(f"{start} --> {end}")
            lines.append(text)
            lines.append("")
    return "\n".join(lines)


def generate_vtt_from_segments(segments: list[dict]) -> str:
    """Generate WebVTT subtitle content from timestamp segments."""
    lines = ["WEBVTT", ""]
    for seg in segments:
        start = _format_timestamp(seg.get("start", 0), separator=".")
        end = _format_timestamp(seg.get("end", 0), separator=".")
        text = seg.get("text", "").strip()
        if text:
            lines.append(f"{start} --> {end}")
            lines.append(text)
            lines.append("")
    return "\n".join(lines)


def _format_timestamp(seconds: float, separator: str = ",") -> str:
    """Format seconds into HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT)."""
    total = float(seconds)
    millis = int((total - int(total)) * 1000)
    total_int = int(total)
    hours = total_int // 3600
    minutes = (total_int % 3600) // 60
    secs = total_int % 60
    return f"{hours:02}:{minutes:02}:{secs:02}{separator}{millis:03}"
