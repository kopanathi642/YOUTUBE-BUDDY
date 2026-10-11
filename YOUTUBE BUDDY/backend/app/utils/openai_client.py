"""
Production OpenAI client.

Handles chat completions, image generation (DALL·E / gpt-image-1),
and audio transcription (Whisper-1) with retry logic, structured
error handling, and response validation.
"""
import base64
import json
import logging
import time
from pathlib import Path
from typing import Any

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)
OPENAI_API_BASE = "https://api.openai.com/v1"

# ── retry defaults ──────────────────────────────────────────────────────────
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # seconds, multiplied by attempt number


# ── auth / headers ──────────────────────────────────────────────────────────

def ensure_openai_api_key() -> None:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is required for AI features. "
            "Set OPENAI_API_KEY in backend/.env before using model endpoints."
        )


def _headers(content_type: str = "application/json") -> dict[str, str]:
    ensure_openai_api_key()
    headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _raise_for_provider_error(response: requests.Response) -> None:
    if response.status_code < 400:
        return
    try:
        detail = response.json()
    except ValueError:
        detail = response.text
    raise RuntimeError(f"OpenAI API error {response.status_code}: {detail}")


def _retry_request(method: str, url: str, **kwargs: Any) -> requests.Response:
    """Execute an HTTP request with exponential backoff retry on 429 / 5xx."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.request(method, url, timeout=settings.AI_REQUEST_TIMEOUT_SECONDS, **kwargs)
            if response.status_code == 429 or response.status_code >= 500:
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "OpenAI %s %s → %d, retrying in %ds (attempt %d/%d)",
                    method, url, response.status_code, wait, attempt, MAX_RETRIES,
                )
                time.sleep(wait)
                continue
            return response
        except requests.exceptions.Timeout as exc:
            last_exc = exc
            logger.warning("OpenAI request timeout (attempt %d/%d)", attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF * attempt)
        except requests.exceptions.ConnectionError as exc:
            last_exc = exc
            logger.warning("OpenAI connection error (attempt %d/%d)", attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF * attempt)
    raise RuntimeError(f"OpenAI request failed after {MAX_RETRIES} retries: {last_exc}")


# ── text completion ─────────────────────────────────────────────────────────

def response_text(prompt: str, system: str | None = None, **kwargs: Any) -> str:
    """Call the OpenAI chat completion API and return the assistant's text."""
    payload: dict[str, Any] = {
        "model": kwargs.pop("model", settings.OPENAI_MODEL),
        "messages": [
            {
                "role": "system",
                "content": system or "You are an AI assistant for production creator workflows.",
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": kwargs.pop("max_tokens", 1500),
    }
    payload.update(kwargs)

    response = _retry_request(
        "POST",
        f"{OPENAI_API_BASE}/chat/completions",
        headers=_headers(),
        json=payload,
    )
    _raise_for_provider_error(response)
    data = response.json()

    choices = data.get("choices")
    if choices and len(choices) > 0:
        content = choices[0].get("message", {}).get("content", "").strip()
        logger.info(
            "OpenAI completion | model=%s tokens_in=%s tokens_out=%s",
            data.get("model"),
            data.get("usage", {}).get("prompt_tokens"),
            data.get("usage", {}).get("completion_tokens"),
        )
        return content

    raise RuntimeError(f"OpenAI API response did not contain choices: {data}")


def create_completion(prompt: str, **kwargs: Any) -> dict[str, Any]:
    """Wrapper that returns an OpenAI-style response dict."""
    text = response_text(prompt, **kwargs)
    return {"choices": [{"message": {"content": text}}]}


def parse_response_content(content: str) -> dict | str:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return content


def summarize_transcript(transcript: str) -> str:
    prompt = (
        "Analyze this creator transcript and return strict JSON with keys: "
        "clip_timestamps (array of objects with start, end, score, reason), "
        "suggested_titles (array of strings), summary (string), and risks (array of strings). "
        "Do not include markdown.\n\n"
        f"Transcript:\n{transcript}"
    )
    return response_text(prompt, system="You are a senior YouTube shorts producer and retention analyst.")


# ── image generation ────────────────────────────────────────────────────────

def generate_image(prompt: str, size: str = "1024x1024") -> str:
    """
    Generate an image using the OpenAI Images API (DALL·E 3 / gpt-image-1).

    Returns:
        Image URL or base64 data URI.
    """
    payload = {
        "model": settings.OPENAI_IMAGE_MODEL,
        "prompt": prompt,
        "size": size,
    }
    logger.info("OpenAI image generation | model=%s size=%s prompt_len=%d", settings.OPENAI_IMAGE_MODEL, size, len(prompt))

    response = _retry_request(
        "POST",
        f"{OPENAI_API_BASE}/images/generations",
        headers=_headers(),
        json=payload,
    )
    _raise_for_provider_error(response)
    data = response.json()

    image = (data.get("data") or [{}])[0]
    if image.get("url"):
        logger.info("OpenAI image generated → URL")
        return image["url"]
    if image.get("b64_json"):
        logger.info("OpenAI image generated → base64 (%d chars)", len(image["b64_json"]))
        return f"data:image/png;base64,{image['b64_json']}"
    raise RuntimeError("OpenAI image response did not include an image URL or b64_json payload")


def download_image(url_or_data: str, output_path: str) -> str:
    """Download an image from URL or decode base64 data URI to a local file."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if url_or_data.startswith("data:"):
        _, b64 = url_or_data.split(",", 1)
        path.write_bytes(base64.b64decode(b64))
    elif url_or_data.startswith("http"):
        resp = requests.get(url_or_data, timeout=60)
        resp.raise_for_status()
        path.write_bytes(resp.content)
    else:
        raise ValueError(f"Cannot download image from: {url_or_data[:50]}")

    logger.info("Downloaded image → %s (%d bytes)", path, path.stat().st_size)
    return str(path.resolve())


# ── audio transcription ─────────────────────────────────────────────────────

def transcribe_audio_file(audio_path: str, language: str = "en") -> dict[str, Any]:
    """
    Transcribe an audio file using the OpenAI Whisper API.

    Returns the full API response with text, segments, and timestamps.
    """
    ensure_openai_api_key()
    logger.info("OpenAI Whisper transcription | file=%s language=%s", audio_path, language)

    with open(audio_path, "rb") as audio_file:
        response = _retry_request(
            "POST",
            f"{OPENAI_API_BASE}/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            data={
                "model": settings.OPENAI_TRANSCRIPTION_MODEL,
                "language": language,
                "response_format": "verbose_json",
            },
            files={"file": audio_file},
        )
    _raise_for_provider_error(response)
    result = response.json()
    logger.info(
        "Whisper transcription complete | duration=%.1fs segments=%d",
        result.get("duration", 0),
        len(result.get("segments", [])),
    )
    return result
