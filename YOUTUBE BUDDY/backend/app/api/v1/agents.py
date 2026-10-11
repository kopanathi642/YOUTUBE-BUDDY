import json

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.ai_generation import AIGeneration
from app.schemas.ai_generation import AIGenerationRequest, AIGenerationResponse
from app.schemas.user import UserProfile
from app.services.agent_manager import (
    run_script_agent,
    run_seo_agent,
    run_shorts_agent,
    run_trend_agent,
    run_upload_agent,
)
from app.services.ownership import require_user

router = APIRouter()


AGENTS_MAP = {
    "trend": run_trend_agent,
    "script": run_script_agent,
    "seo": run_seo_agent,
    "shorts": run_shorts_agent,
    "upload": run_upload_agent,
}


def _decode_output(output: str | None) -> dict | str | None:
    if not output:
        return None
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        return output


def _response(generation: AIGeneration) -> dict:
    return {
        "id": generation.id,
        "user_id": generation.user_id,
        "upload_id": generation.upload_id,
        "agent_name": generation.agent_name,
        "prompt": generation.prompt,
        "output": _decode_output(generation.output),
        "status": generation.status,
        "created_at": generation.created_at,
        "updated_at": generation.updated_at,
    }


def _output_summary(output: str | None) -> str | None:
    decoded = _decode_output(output)
    if decoded is None:
        return None
    if isinstance(decoded, dict):
        for key in ("summary", "title", "message", "status"):
            value = decoded.get(key)
            if value:
                return str(value)
        return json.dumps(decoded)[:160]
    return str(decoded)[:160]


@router.get("", include_in_schema=False)
@router.get("/")
async def list_agents(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    result = await session.execute(
        select(AIGeneration)
        .where(AIGeneration.user_id == user.id, AIGeneration.agent_name.in_(list(AGENTS_MAP)))
        .order_by(AIGeneration.created_at.desc())
    )
    latest_by_agent: dict[str, AIGeneration] = {}
    for generation in result.scalars().all():
        latest_by_agent.setdefault(generation.agent_name, generation)

    return {
        "data": [
            {
                "id": agent_id,
                "name": agent_id.title(),
                "status": latest_by_agent[agent_id].status if agent_id in latest_by_agent else "idle",
                "last_run": latest_by_agent[agent_id].created_at if agent_id in latest_by_agent else None,
                "latest_output": _output_summary(latest_by_agent[agent_id].output) if agent_id in latest_by_agent else None,
            }
            for agent_id in AGENTS_MAP
        ]
    }


@router.post("/run", response_model=AIGenerationResponse)
async def run_agent(
    request: AIGenerationRequest,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    agent_func = AGENTS_MAP.get(request.agent_name)
    if not agent_func:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown agent: {request.agent_name}")

    prompt = request.prompt or request.agent_name
    try:
        result = agent_func(prompt)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    generation = AIGeneration(
        user_id=user.id,
        upload_id=request.upload_id,
        agent_name=request.agent_name,
        prompt=request.prompt,
        output=json.dumps(result),
        status="completed",
    )
    session.add(generation)
    await session.commit()
    await session.refresh(generation)
    return _response(generation)


@router.post("/{agent_id}/trigger", response_model=AIGenerationResponse)
async def trigger_agent(
    agent_id: str,
    payload: dict = Body(default={}),
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prompt = str(payload.get("prompt") or payload.get("context") or agent_id)
    return await run_agent(
        AIGenerationRequest(agent_name=agent_id, prompt=prompt, upload_id=payload.get("upload_id")),
        current_user=current_user,
        session=session,
    )


@router.get("/history", response_model=list[AIGenerationResponse])
async def get_agent_history(
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    user = await require_user(session, current_user)
    query = select(AIGeneration).where(AIGeneration.user_id == user.id).order_by(AIGeneration.created_at.desc())
    result = await session.execute(query)
    return [_response(generation) for generation in result.scalars().all()]


@router.get("/jobs/{job_id}", response_model=AIGenerationResponse)
async def get_agent_job(
    job_id: int,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    generation = await session.scalar(
        select(AIGeneration).where(AIGeneration.id == job_id, AIGeneration.user_id == user.id)
    )
    if not generation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent job not found")
    return _response(generation)


@router.get("/{agent_id}/logs")
async def get_agent_logs(
    agent_id: str,
    current_user: UserProfile = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(session, current_user)
    query = (
        select(AIGeneration)
        .where(AIGeneration.user_id == user.id, AIGeneration.agent_name == agent_id)
        .order_by(AIGeneration.created_at.desc())
        .limit(20)
    )
    result = await session.execute(query)
    return {
        "data": [
            {
                "timestamp": generation.created_at.isoformat() if generation.created_at else None,
                "level": "success" if generation.status == "completed" else "error",
                "message": f"{generation.agent_name} {generation.status}",
            }
            for generation in result.scalars().all()
        ]
    }
