"""
Studio API — Production image & text generation endpoint.

Uses professional prompt templates for every tool, saves generated
images to disk, and persists all generations to the database.
"""
import json
from datetime import datetime
from enum import Enum
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.security import get_current_user
from app.models.ai_generation import AIGeneration
from app.schemas.user import UserProfile
from app.services.ai_generation import (
    generate_image_from_prompt,
    generate_studio_text,
    save_generated_image,
)
from app.services.ownership import require_upload, require_user

router = APIRouter()


class Provider(str, Enum):
    openai = "openai"
    huggingface = "huggingface"
    hf = "hf"
    ollama = "ollama"
    gemini = "gemini"


class StudioGenerateRequest(BaseModel):
    tool_id: str
    prompt: str | None = None
    style: str | None = None
    aspect_ratio: str | None = None
    duration: int | None = None
    provider: Provider = Provider.openai
    upload_id: int | None = None


class StudioGenerateResponse(BaseModel):
    id: int
    tool_id: str
    provider: Provider
    prompt: str | None = None
    style: str | None = None
    preview_url: str | None = None
    generated_text: str | None = None
    model_output: dict | str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
        "protected_namespaces": (),
    }


IMAGE_TOOLS = {
    "cineshot",
    "moodboard",
    "character",
    "persona",
    "aesthetic",
    "relight",
    "inpaint",
    "faceswap",
    "charswap",
    "fashion",
}


@router.post("/generate", response_model=StudioGenerateResponse)
@router.post("/", response_model=StudioGenerateResponse, include_in_schema=False)
async def generate_tool(
    request: StudioGenerateRequest,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    prompt_text = (request.prompt or "").strip()
    if request.upload_id is not None:
        await require_upload(session, request.upload_id, user)
    if not prompt_text and request.upload_id is None:
        prompt_text = f"Professional studio generation for {request.tool_id}."
    elif not prompt_text:
        prompt_text = f"Run {request.tool_id} on uploaded media #{request.upload_id}."

    preview_url: str | None = None
    generated_text: str | None = None
    model_output: dict | str | None = None

    try:
        if request.tool_id in IMAGE_TOOLS:
            # Generate image with professional prompt templates
            image_result = generate_image_from_prompt(
                prompt_text,
                provider=request.provider.value,
                tool_id=request.tool_id,
                style=request.style or "cinematic",
                aspect_ratio=request.aspect_ratio or "16:9",
            )

            # Save image to disk
            filename = f"{request.tool_id}_{uuid4().hex[:8]}.png"
            local_path = save_generated_image(image_result, filename)
            preview_url = f"{settings.BACKEND_HOST}/rendered/{filename}"

            generated_text = f"Image generated successfully using {request.provider.value}."
            model_output = {
                "type": "image",
                "url": preview_url,
                "local_path": local_path,
                "original_url": image_result if image_result.startswith("http") else None,
            }
        else:
            # Text generation with professional prompt templates
            result = generate_studio_text(
                request.tool_id,
                prompt_text,
                provider=request.provider.value,
                style=request.style or "professional",
                duration=str(request.duration or 10),
                aspect_ratio=request.aspect_ratio or "16:9",
            )
            generated_text = result.get("raw", "")
            model_output = result.get("parsed", generated_text)

            # For video-centric tools, also generate a visual poster/thumbnail card
            try:
                from app.services.ai_generation import generate_mock_image, _clean_user_prompt
                poster_result = generate_mock_image(
                    tool_id=request.tool_id,
                    prompt=_clean_user_prompt(prompt_text),
                    aspect_ratio="9:16",
                    style=request.style or "Cinematic",
                )
                filename = f"{request.tool_id}_{uuid4().hex[:8]}.png"
                save_generated_image(poster_result, filename)
                preview_url = f"{settings.BACKEND_HOST}/rendered/{filename}"
            except Exception:
                pass

    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    generation = AIGeneration(
        user_id=user.id,
        upload_id=request.upload_id,
        agent_name=f"studio:{request.tool_id}",
        prompt=prompt_text,
        output=generated_text,
        generation_metadata=json.dumps(
            {
                "tool_id": request.tool_id,
                "provider": request.provider,
                "style": request.style,
                "aspect_ratio": request.aspect_ratio,
                "duration": request.duration,
                "preview_url": preview_url,
            }
        ),
        status="completed",
    )
    session.add(generation)
    await session.commit()
    await session.refresh(generation)

    return {
        "id": generation.id,
        "tool_id": request.tool_id,
        "provider": request.provider,
        "prompt": prompt_text,
        "style": request.style,
        "preview_url": preview_url,
        "generated_text": generated_text,
        "model_output": model_output,
        "status": generation.status,
        "created_at": generation.created_at,
        "updated_at": generation.updated_at,
    }


@router.get("/history")
async def studio_history(
    tool_id: str | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List past studio generations for the current user."""
    user = await require_user(session, current_user)
    query = (
        select(AIGeneration)
        .where(
            AIGeneration.user_id == user.id,
            AIGeneration.agent_name.startswith("studio:"),
        )
        .order_by(AIGeneration.created_at.desc())
        .limit(limit)
    )
    if tool_id:
        query = query.where(AIGeneration.agent_name == f"studio:{tool_id}")

    result = await session.execute(query)
    generations = result.scalars().all()

    return {
        "data": [
            {
                "id": g.id,
                "tool_id": g.agent_name.replace("studio:", ""),
                "prompt": g.prompt,
                "output_preview": (g.output or "")[:200],
                "status": g.status,
                "created_at": g.created_at,
            }
            for g in generations
        ]
    }


@router.get("/providers")
async def get_providers_status() -> dict:
    """Return health and availability of all AI generation providers."""
    providers = {
        "openai": {
            "name": "OpenAI",
            "available": bool(settings.OPENAI_API_KEY),
            "model": settings.OPENAI_MODEL,
            "image_model": settings.OPENAI_IMAGE_MODEL,
            "transcription_model": settings.OPENAI_TRANSCRIPTION_MODEL,
        },
        "gemini": {
            "name": "Google Gemini",
            "available": bool(settings.GEMINI_API_KEY),
            "model": settings.GEMINI_MODEL,
            "free_tier": True,
            "info": "Free 15 RPM / 1M tokens/day via Google AI Studio",
        },
        "huggingface": {
            "name": "Hugging Face",
            "available": bool(settings.HUGGINGFACE_API_KEY),
            "model": settings.HUGGINGFACE_MODEL,
        },
        "ollama": {
            "name": "Ollama (Local)",
            "available": True,
            "base_url": settings.OLLAMA_BASE_URL,
            "model": settings.OLLAMA_MODEL,
        },
    }

    if settings.OPENAI_API_KEY:
        active = "openai"
    elif settings.GEMINI_API_KEY:
        active = "gemini"
    elif settings.HUGGINGFACE_API_KEY:
        active = "huggingface"
    else:
        active = "ollama"

    return {
        "active_default": active,
        "providers": providers,
    }
