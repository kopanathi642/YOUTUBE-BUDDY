"""
Production AI generation service.

Routes prompts through the selected provider (OpenAI, HuggingFace, Ollama)
and applies professional prompt templates for every studio tool.
"""
import json
import logging
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.prompt_templates import (
    build_image_prompt,
    build_text_prompt,
    get_negative_prompt,
    get_system_prompt,
)
from app.utils.openai_client import (
    generate_image as generate_openai_image,
    response_text as openai_response_text,
    summarize_transcript as summarize_openai,
)
from app.utils.huggingface_client import (
    generate_image as generate_hf_image,
    generate_text as generate_hf_text,
)
from app.utils.ollama_client import generate_text as generate_ollama_text
from app.utils.gemini_client import (
    generate_text as generate_gemini_text,
    generate_image as generate_gemini_image,
)

logger = logging.getLogger(__name__)


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_json_or_text(text: str) -> dict:
    """Try to parse LLM output as JSON; fall back to wrapping in a dict."""
    stripped = text.strip()
    # Strip markdown code fences
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {"summary": text}


def _call_text_provider(prompt: str, provider: str, system: str | None = None) -> str:
    """Route a text prompt to the selected AI provider.

    Provider priority: explicit choice > auto-fallback chain.
    Auto-fallback: OpenAI → Gemini → HuggingFace → Ollama
    """
    if provider in {"huggingface", "hf"}:
        return generate_hf_text(prompt)
    if provider == "ollama":
        return generate_ollama_text(prompt, system=system)
    if provider == "gemini":
        return generate_gemini_text(prompt, system=system)
    if provider == "openai":
        # If OpenAI key is configured, use it
        if settings.OPENAI_API_KEY:
            return openai_response_text(prompt, system=system)
        # Auto-fallback to Gemini if OpenAI key is missing
        if settings.GEMINI_API_KEY:
            logger.info("OpenAI key not set, falling back to Gemini (free tier)")
            return generate_gemini_text(prompt, system=system)
        # Final fallback to HuggingFace
        if settings.HUGGINGFACE_API_KEY:
            logger.info("No OpenAI/Gemini keys, falling back to HuggingFace")
            return generate_hf_text(prompt)
        raise RuntimeError(
            "No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, "
            "or HUGGINGFACE_API_KEY in backend/.env. "
            "Gemini is FREE: https://aistudio.google.com/apikey"
        )
    # Default: try OpenAI with auto-fallback
    return _call_text_provider(prompt, "openai", system=system)


# ── transcript analysis ─────────────────────────────────────────────────────

def analyze_transcript_for_clips(transcript: str, provider: str = "openai") -> dict:
    """
    Analyse a creator transcript for viral potential, hooks, and emotional peaks.
    Uses the professional viral‑clip prompt template.
    """
    system = get_system_prompt("viral")
    prompt = build_text_prompt("viral", transcript)

    content = _call_text_provider(prompt, provider, system=system)
    parsed = _parse_json_or_text(content)

    return {
        "analysis": parsed,
        "clip_timestamps": parsed.get("clip_timestamps", []),
        "suggested_titles": parsed.get("suggested_titles", []),
        "summary": parsed.get("summary", content),
        "overall_viral_score": parsed.get("overall_viral_score"),
        "risks": parsed.get("risks", []),
    }


# ── metadata generation ─────────────────────────────────────────────────────

def generate_metadata_for_upload(
    upload_name: str,
    topic: str,
    provider: str = "openai",
) -> dict:
    """Generate optimised YouTube metadata for an upload."""
    system = get_system_prompt("upload")
    prompt = build_text_prompt("upload", topic, upload_name=upload_name)

    response_text_str = _call_text_provider(prompt, provider, system=system)
    parsed = _parse_json_or_text(response_text_str)

    return {
        "raw": response_text_str,
        "parsed": parsed,
    }


# ── image generation ────────────────────────────────────────────────────────

def generate_image_from_prompt(
    prompt: str,
    provider: str = "openai",
    tool_id: str = "cineshot",
    **kwargs: Any,
) -> str:
    """
    Generate an image using the selected provider with professional prompt templates.

    Returns the image URL (OpenAI) or base64 data URI (HuggingFace).
    """
    # Build a production‑grade prompt from templates
    full_prompt = build_image_prompt(tool_id, prompt, **kwargs)
    logger.info("Image generation | tool=%s provider=%s prompt_len=%d", tool_id, provider, len(full_prompt))

    if provider in {"huggingface", "hf"}:
        return generate_hf_image(full_prompt)
    if provider == "gemini":
        return generate_gemini_image(full_prompt)
    # Default: OpenAI with auto-fallback
    if settings.OPENAI_API_KEY:
        return generate_openai_image(full_prompt)
    if settings.GEMINI_API_KEY:
        logger.info("OpenAI key not set, falling back to Gemini for image generation")
        return generate_gemini_image(full_prompt)
    if settings.HUGGINGFACE_API_KEY:
        logger.info("No OpenAI/Gemini keys, falling back to HuggingFace for image generation")
        return generate_hf_image(full_prompt)
    raise RuntimeError(
        "No image generation provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, "
        "or HUGGINGFACE_API_KEY in backend/.env."
    )


def save_generated_image(image_url_or_data: str, filename: str) -> str:
    """
    Download / decode a generated image and persist it to the rendered directory.
    Returns the local file path.
    """
    import base64
    import requests as http_requests

    render_dir = Path(settings.RENDER_DIR)
    render_dir.mkdir(parents=True, exist_ok=True)
    output_path = render_dir / filename

    if image_url_or_data.startswith("data:"):
        # Base64 data URI
        header, b64data = image_url_or_data.split(",", 1)
        output_path.write_bytes(base64.b64decode(b64data))
    elif image_url_or_data.startswith("http"):
        # Remote URL — download
        resp = http_requests.get(image_url_or_data, timeout=60)
        resp.raise_for_status()
        output_path.write_bytes(resp.content)
    else:
        raise ValueError(f"Unsupported image source format: {image_url_or_data[:40]}…")

    logger.info("Saved generated image → %s (%d bytes)", output_path, output_path.stat().st_size)
    return str(output_path.resolve())


# ── studio text generation ──────────────────────────────────────────────────

def generate_studio_text(
    tool_id: str,
    user_prompt: str,
    provider: str = "openai",
    **kwargs: str,
) -> dict[str, Any]:
    """
    Run a text‑generation studio tool (script, SEO, trend, cinematic, etc.).
    Returns structured output parsed from the LLM response.
    """
    system = get_system_prompt(tool_id)
    prompt = build_text_prompt(tool_id, user_prompt, **kwargs)

    raw = _call_text_provider(prompt, provider, system=system)
    parsed = _parse_json_or_text(raw)

    return {
        "raw": raw,
        "parsed": parsed,
        "tool_id": tool_id,
        "provider": provider,
    }


# ── specialised generators (used by agent_manager) ──────────────────────────

def generate_script(topic: str, duration: str = "10", style: str = "educational", provider: str = "openai") -> dict:
    return generate_studio_text("script", topic, provider, duration=duration, style=style)


def generate_seo_package(topic: str, provider: str = "openai") -> dict:
    return generate_studio_text("seo", topic, provider)


def generate_trend_report(context: str, provider: str = "openai") -> dict:
    return generate_studio_text("trend", context, provider)


def generate_cinematic_brief(scene: str, duration: str = "6", camera: str = "smooth dolly", provider: str = "openai") -> dict:
    return generate_studio_text("cinematic", scene, provider, duration=duration, camera_movement=camera)
