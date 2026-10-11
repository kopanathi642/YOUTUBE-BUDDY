"""
Google Gemini API client (free tier).

Free tier limits: 15 RPM, 1 million tokens/day, 1,500 RPD.
Supports text generation (Gemini 2.0 Flash) and image generation (Imagen 3).
"""
import base64
import json
import logging
import time
from typing import Any

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

MAX_RETRIES = 3
RETRY_BACKOFF = 2


def ensure_gemini_api_key() -> None:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is required for Gemini features. "
            "Get a free key at https://aistudio.google.com/apikey "
            "and set GEMINI_API_KEY in backend/.env"
        )


def _retry_request(method: str, url: str, **kwargs: Any) -> requests.Response:
    """Execute an HTTP request with exponential backoff retry on 429 / 5xx."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.request(
                method, url,
                timeout=settings.AI_REQUEST_TIMEOUT_SECONDS,
                **kwargs,
            )
            if response.status_code == 429 or response.status_code >= 500:
                wait = RETRY_BACKOFF * attempt
                logger.warning(
                    "Gemini %s → %d, retrying in %ds (attempt %d/%d)",
                    url.split("?")[0].split("/")[-1],
                    response.status_code, wait, attempt, MAX_RETRIES,
                )
                time.sleep(wait)
                continue
            return response
        except requests.exceptions.Timeout as exc:
            last_exc = exc
            logger.warning("Gemini timeout (attempt %d/%d)", attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF * attempt)
        except requests.exceptions.ConnectionError as exc:
            last_exc = exc
            logger.warning("Gemini connection error (attempt %d/%d)", attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF * attempt)
    raise RuntimeError(f"Gemini request failed after {MAX_RETRIES} retries: {last_exc}")


def _raise_for_error(response: requests.Response) -> None:
    if response.status_code < 400:
        return
    try:
        detail = response.json()
    except ValueError:
        detail = response.text
    raise RuntimeError(f"Gemini API error {response.status_code}: {detail}")


# ── text generation ─────────────────────────────────────────────────────────

def generate_text(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    max_tokens: int = 1500,
    temperature: float = 0.7,
) -> str:
    """Generate text using the Gemini API (free tier).

    Uses Gemini 2.0 Flash by default — fast and free.
    """
    ensure_gemini_api_key()
    model = model or settings.GEMINI_MODEL or "gemini-2.0-flash"
    url = f"{GEMINI_API_BASE}/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"

    # Build the contents array
    contents: list[dict[str, Any]] = []
    if system:
        contents.append({
            "role": "user",
            "parts": [{"text": f"[System Instructions]\n{system}\n\n[User Request]\n{prompt}"}],
        })
    else:
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}],
        })

    payload = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature,
        },
    }

    logger.info("Gemini text generation | model=%s prompt_len=%d", model, len(prompt))

    response = _retry_request(
        "POST", url,
        headers={"Content-Type": "application/json"},
        json=payload,
    )
    _raise_for_error(response)
    data = response.json()

    # Extract text from the response
    candidates = data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        if parts:
            text = parts[0].get("text", "").strip()
            usage = data.get("usageMetadata", {})
            logger.info(
                "Gemini completion | model=%s tokens_in=%s tokens_out=%s",
                model,
                usage.get("promptTokenCount"),
                usage.get("candidatesTokenCount"),
            )
            return text

    raise RuntimeError(f"Gemini API response did not contain candidates: {data}")


# ── image generation ────────────────────────────────────────────────────────

def generate_image(
    prompt: str,
    model: str | None = None,
    aspect_ratio: str = "16:9",
) -> str:
    """Generate an image using Gemini's Imagen 3 model (free tier).

    Returns a base64 data URI of the generated image.
    Falls back to text-based image description if image generation is unavailable.
    """
    ensure_gemini_api_key()
    model = model or "gemini-2.0-flash-preview-image-generation"
    url = f"{GEMINI_API_BASE}/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"

    payload = {
        "contents": [{
            "parts": [{"text": f"Generate an image: {prompt}"}],
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }

    logger.info("Gemini image generation | model=%s prompt_len=%d", model, len(prompt))

    response = _retry_request(
        "POST", url,
        headers={"Content-Type": "application/json"},
        json=payload,
    )
    _raise_for_error(response)
    data = response.json()

    # Look for inline_data (base64 image) in the response
    candidates = data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            inline_data = part.get("inlineData")
            if inline_data:
                mime_type = inline_data.get("mimeType", "image/png")
                b64_data = inline_data.get("data", "")
                if b64_data:
                    logger.info(
                        "Gemini image generated | mime=%s size=%d bytes",
                        mime_type, len(b64_data),
                    )
                    return f"data:{mime_type};base64,{b64_data}"

    raise RuntimeError(
        "Gemini image generation did not return an image. "
        "The Imagen model may not be available on the free tier for your region. "
        "Try using OpenAI or HuggingFace for image generation."
    )
