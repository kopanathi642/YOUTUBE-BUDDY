"""
Production Hugging Face Inference API client.

Supports text generation, image generation (Stable Diffusion),
and audio transcription with retry logic for model cold‑starts.
"""
import base64
import logging
import time
from typing import Any

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 4
RETRY_BACKOFF = 5  # HF models can take 20‑30s to load


def ensure_huggingface_api_key() -> None:
    if not settings.HUGGINGFACE_API_KEY:
        raise RuntimeError(
            "HUGGINGFACE_API_KEY is required for Hugging Face features. "
            "Set HUGGINGFACE_API_KEY in backend/.env before using Hugging Face endpoints."
        )


def _model_url(model: str) -> str:
    return f"https://api-inference.huggingface.co/models/{model}"


def _make_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.HUGGINGFACE_API_KEY}"}


def _retry_hf_request(
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any] | None = None,
    files: dict | None = None,
) -> requests.Response:
    """Execute HF Inference request with retry on 503 (model loading)."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if files:
                response = requests.post(url, headers=headers, files=files, timeout=settings.AI_REQUEST_TIMEOUT_SECONDS)
            else:
                response = requests.post(url, headers=headers, json=payload, timeout=settings.AI_REQUEST_TIMEOUT_SECONDS)

            if response.status_code == 503:
                # Model is loading — wait for estimated time
                try:
                    est = response.json().get("estimated_time", RETRY_BACKOFF * attempt)
                except Exception:
                    est = RETRY_BACKOFF * attempt
                wait = min(float(est), 30)
                logger.warning(
                    "HF model loading, waiting %.0fs (attempt %d/%d)",
                    wait, attempt, MAX_RETRIES,
                )
                time.sleep(wait)
                continue

            if response.status_code == 429:
                wait = RETRY_BACKOFF * attempt
                logger.warning("HF rate limit, waiting %ds (attempt %d/%d)", wait, attempt, MAX_RETRIES)
                time.sleep(wait)
                continue

            return response

        except requests.exceptions.Timeout as exc:
            last_exc = exc
            logger.warning("HF timeout (attempt %d/%d)", attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF * attempt)
        except requests.exceptions.ConnectionError as exc:
            last_exc = exc
            logger.warning("HF connection error (attempt %d/%d)", attempt, MAX_RETRIES)
            time.sleep(RETRY_BACKOFF * attempt)

    raise RuntimeError(f"Hugging Face request failed after {MAX_RETRIES} retries: {last_exc}")


# ── text generation ─────────────────────────────────────────────────────────

def generate_text(
    prompt: str,
    model: str | None = None,
    max_new_tokens: int = 500,
    temperature: float = 0.7,
) -> str:
    """Generate text using a HF Inference API text model."""
    ensure_huggingface_api_key()
    model = model or settings.HUGGINGFACE_TEXT_MODEL or settings.HUGGINGFACE_MODEL
    url = _model_url(model)
    headers = _make_headers()
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": max_new_tokens,
            "temperature": temperature,
            "return_full_text": False,
        },
    }

    logger.info("HF text generation | model=%s prompt_len=%d", model, len(prompt))
    response = _retry_hf_request(url, headers, payload)

    if response.status_code != 200:
        raise RuntimeError(f"Hugging Face API error: {response.status_code} - {response.text}")

    result = response.json()
    if isinstance(result, list) and result:
        text = result[0].get("generated_text", str(result[0]))
        logger.info("HF text generated | len=%d", len(text))
        return text
    if isinstance(result, dict) and "generated_text" in result:
        return result["generated_text"]
    return str(result)


# ── image generation ────────────────────────────────────────────────────────

def generate_image(
    prompt: str,
    model: str | None = None,
    negative_prompt: str | None = None,
    guidance_scale: float = 7.5,
    num_inference_steps: int = 50,
) -> str:
    """
    Generate an image using a HF Inference API diffusion model.

    Returns a base64 data URI or raises on failure.
    """
    ensure_huggingface_api_key()
    model = model or settings.HUGGINGFACE_IMAGE_MODEL
    url = _model_url(model)
    headers = _make_headers()
    payload: dict[str, Any] = {"inputs": prompt}
    if negative_prompt:
        payload["parameters"] = {
            "negative_prompt": negative_prompt,
            "guidance_scale": guidance_scale,
            "num_inference_steps": num_inference_steps,
        }

    logger.info("HF image generation | model=%s prompt_len=%d", model, len(prompt))
    response = _retry_hf_request(url, headers, payload)

    if response.status_code != 200:
        raise RuntimeError(f"Hugging Face API error: {response.status_code} - {response.text}")

    content_type = response.headers.get("content-type", "")
    if content_type.startswith("image/"):
        encoded = base64.b64encode(response.content).decode("utf-8")
        logger.info("HF image generated | content_type=%s size=%d", content_type, len(response.content))
        return f"data:{content_type};base64,{encoded}"

    try:
        result = response.json()
        if isinstance(result, dict) and "error" in result:
            raise RuntimeError(f"Hugging Face image error: {result['error']}")
        if isinstance(result, list) and result:
            return result[0].get("generated_text", "")
        return str(result)
    except ValueError:
        return response.text


# ── audio transcription (Whisper on HF) ─────────────────────────────────────

def transcribe_audio(
    audio_path: str,
    model: str | None = None,
    language: str = "en",
) -> dict[str, Any]:
    """
    Transcribe audio using a HF Inference API Whisper model.

    Falls back to openai/whisper-base if no model specified.
    """
    ensure_huggingface_api_key()
    model = model or settings.HUGGINGFACE_AUDIO_MODEL or "openai/whisper-base"
    url = _model_url(model)
    headers = _make_headers()

    logger.info("HF audio transcription | model=%s file=%s", model, audio_path)

    with open(audio_path, "rb") as f:
        response = _retry_hf_request(url, headers, files={"file": f})

    if response.status_code != 200:
        raise RuntimeError(f"Hugging Face transcription error: {response.status_code} - {response.text}")

    result = response.json()
    logger.info("HF transcription complete | result_type=%s", type(result).__name__)

    if isinstance(result, dict):
        return result
    if isinstance(result, list) and result:
        return {"text": result[0].get("text", str(result[0]))}
    return {"text": str(result)}
