import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.ai_generation import AIGeneration
from app.schemas.user import UserProfile
from app.services.ownership import require_user
from app.utils.huggingface_client import generate_text
from app.utils.openai_client import create_completion

router = APIRouter()


class CinematicRequest(BaseModel):
    prompt: str
    cameraMovement: str | None = None
    duration: int | None = 6
    preset: str | None = None


class CinematicResponse(BaseModel):
    id: int
    status: str
    prompt: str | None = None
    cameraMovement: str | None = None
    duration: int | None = 6
    preset: str | None = None
    preview_url: str | None = None
    generated_text: str | None = None
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }


@router.post("/generate", response_model=CinematicResponse)
async def generate_scene(
    request: CinematicRequest,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    if not request.prompt.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="prompt is required")

    prompt = (
        "Create a production-ready cinematic generation brief as strict JSON with keys: "
        "logline, shot_list, camera_plan, lighting, sound, edit_notes, safety_risks. "
        f"Duration seconds: {request.duration or 6}. "
        f"Camera movement: {request.cameraMovement or 'director choice'}. "
        f"Preset/provider: {request.preset or 'openai'}.\n\n"
        f"Scene prompt:\n{request.prompt}"
    )

    try:
        if request.preset == "huggingface":
            generated_text = generate_text(prompt)
        else:
            response = create_completion(prompt)
            generated_text = response["choices"][0]["message"]["content"].strip()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    generation = AIGeneration(
        user_id=user.id,
        upload_id=None,
        agent_name="cinematic",
        prompt=request.prompt,
        output=generated_text,
        generation_metadata=json.dumps(
            {
                "cameraMovement": request.cameraMovement,
                "duration": request.duration,
                "preset": request.preset,
            }
        ),
        status="completed",
    )
    session.add(generation)
    await session.commit()
    await session.refresh(generation)

    return {
        "id": generation.id,
        "status": generation.status,
        "prompt": request.prompt,
        "cameraMovement": request.cameraMovement,
        "duration": request.duration,
        "preset": request.preset,
        "preview_url": None,
        "generated_text": generated_text,
        "created_at": generation.created_at,
    }
