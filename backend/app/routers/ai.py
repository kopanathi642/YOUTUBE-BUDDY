"""AI capabilities and actions. The UI enables an AI action only when it reports `ready`."""
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import jobs
from ..ai_engines import LANG_NAMES, VOICE_BY_ID, default_voice, voices_public
from ..db import get_db
from ..deps import load_asset, load_project, ser_asset, ser_job
from ..models import MediaAsset, MediaStatus, Role, User
from ..security import ai_limiter, audit, current_user

router = APIRouter(tags=["ai"])

BUILT_IN = "Built in — runs on the cloud worker, no extra cost"


def _caps() -> list[tuple]:
    oa = bool(os.environ.get("OPENAI_API_KEY"))
    stt = "OpenAI Whisper (your key)" if oa else "Free Whisper model on the worker (downloads ~460 MB from huggingface.co on first use)"
    mt = "OpenAI (your key)" if oa else "Free Argos models on the worker (one download per language pair on first use)"
    return [
        ("scene_detect", "Scene detection", True, BUILT_IN),
        ("silence_remove", "Silence removal", True, BUILT_IN),
        ("auto_color", "Auto colour & exposure", True, BUILT_IN),
        ("loudness", "Audio level / loudness", True, BUILT_IN),
        ("smart_reframe", "Smart reframe (9:16, 1:1, 4:5)", True, BUILT_IN + " — static subject-centred crop"),
        ("stabilize", "Stabilisation", True, BUILT_IN + " (FFmpeg vid.stab)"),
        ("background_remove", "Background removal", True, BUILT_IN + " (open-source U²-Net, ~15× real time, clips ≤ 60 s)"),
        ("tts", "AI voice / text to speech", True, "Free Piper voices on the worker"),
        ("transcribe", "Speech to text / captions", True, stt),
        ("translate", "Translation", True, mt),
        ("dubbing", "Translate & dub", True, f"{stt} + {mt} + Piper voices"),
        ("lip_sync", "Lip sync", False, "Needs a GPU lip-sync model provider (e.g. sync.so or Replicate) + recorded consent"),
        ("object_remove", "Object removal", False, "Needs a GPU video-inpainting model provider"),
    ]


@router.get("/ai/capabilities")
def capabilities(user: User = Depends(current_user)):
    return [{"id": i, "label": l, "ready": r, "built_in": True, "needs": n} for i, l, r, n in _caps()]


@router.get("/ai/voices")
def voices(user: User = Depends(current_user)):
    return {"voices": voices_public(), "languages": LANG_NAMES}


def _new_audio(db: Session, p_ws, p_id, user: User, filename: str) -> MediaAsset:
    nid = uuid.uuid4()
    a = MediaAsset(id=nid, workspace_id=p_ws, project_id=p_id, uploaded_by=user.id, filename=filename[:200], kind="audio",
                   declared_content_type="audio/wav", size_bytes=0, storage_key=f"ws/{p_ws}/proj/{p_id}/media/{nid}/original.wav",
                   status=MediaStatus.processing)
    db.add(a)
    db.flush()
    return a


class TTSReq(BaseModel):
    text: str = Field(min_length=1, max_length=3000)
    voice_id: str


@router.post("/projects/{project_id}/ai/tts", status_code=201)
def tts(project_id: uuid.UUID, body: TTSReq, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ai_limiter.check(f"ai:{user.id}")
    p = load_project(db, user, project_id, Role.editor)
    if body.voice_id not in VOICE_BY_ID:
        raise HTTPException(422, "Unknown voice")
    words = " ".join(body.text.split()[:6])
    a = _new_audio(db, p.workspace_id, p.id, user, f"Voice - {words}.wav")
    job = jobs.enqueue(db, workspace_id=p.workspace_id, project_id=p.id, created_by=user.id, kind="ai.tts",
                       payload={"asset_id": str(a.id), "text": body.text, "voice_id": body.voice_id}, idempotency_key=f"tts:{a.id}", max_attempts=2)
    audit(db, request, "ai.tts", user=user, workspace_id=p.workspace_id, target_type="media", target_id=a.id, chars=len(body.text))
    db.commit()
    return ser_asset(a, job)


class TranscribeReq(BaseModel):
    language: str | None = Field(None, max_length=5)


@router.post("/media/{asset_id}/transcribe", status_code=201)
def transcribe(asset_id: uuid.UUID, body: TranscribeReq, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ai_limiter.check(f"ai:{user.id}")
    a = load_asset(db, user, asset_id, Role.editor)
    if a.status != MediaStatus.ready or not a.has_audio:
        raise HTTPException(422, "Choose a ready clip that has sound")
    job = jobs.enqueue(db, workspace_id=a.workspace_id, project_id=a.project_id, created_by=user.id, kind="ai.transcribe",
                       payload={"asset_id": str(a.id), "language": body.language}, idempotency_key=f"stt:{a.id}:{uuid.uuid4().hex[:6]}", max_attempts=2)
    audit(db, request, "ai.transcribe", user=user, workspace_id=a.workspace_id, target_type="media", target_id=a.id)
    db.commit()
    return ser_job(job)


class TranslateReq(BaseModel):
    target: str = Field(min_length=2, max_length=5)


@router.post("/media/{asset_id}/translate", status_code=201)
def translate(asset_id: uuid.UUID, body: TranslateReq, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ai_limiter.check(f"ai:{user.id}")
    a = load_asset(db, user, asset_id, Role.editor)
    if a.status != MediaStatus.ready or not a.has_audio:
        raise HTTPException(422, "Choose a ready clip that has sound")
    if body.target not in LANG_NAMES:
        raise HTTPException(422, "Unsupported language")
    job = jobs.enqueue(db, workspace_id=a.workspace_id, project_id=a.project_id, created_by=user.id, kind="ai.translate",
                       payload={"asset_id": str(a.id), "target": body.target}, idempotency_key=f"mt:{a.id}:{body.target}:{uuid.uuid4().hex[:6]}", max_attempts=2)
    audit(db, request, "ai.translate", user=user, workspace_id=a.workspace_id, target_type="media", target_id=a.id, target=body.target)
    db.commit()
    return ser_job(job)


class DubReq(BaseModel):
    target: str = Field(min_length=2, max_length=5)
    voice_id: str | None = None
    style: str | None = None


@router.post("/media/{asset_id}/dub", status_code=201)
def dub(asset_id: uuid.UUID, body: DubReq, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ai_limiter.check(f"ai:{user.id}")
    src = load_asset(db, user, asset_id, Role.editor)
    if src.status != MediaStatus.ready or not src.has_audio:
        raise HTTPException(422, "Choose a ready clip that has speech")
    voice = body.voice_id or default_voice(body.target, body.style)
    if not voice or voice not in VOICE_BY_ID or VOICE_BY_ID[voice][2] != body.target:
        raise HTTPException(422, f"No AI voice available for {LANG_NAMES.get(body.target, body.target)} yet")
    stem = src.filename.rsplit(".", 1)[0][:120]
    a = _new_audio(db, src.workspace_id, src.project_id, user, f"{stem} (dub {body.target}).wav")
    job = jobs.enqueue(db, workspace_id=src.workspace_id, project_id=src.project_id, created_by=user.id, kind="ai.dub",
                       payload={"asset_id": str(a.id), "source_id": str(src.id), "target": body.target, "voice_id": voice},
                       idempotency_key=f"dub:{a.id}", max_attempts=2)
    audit(db, request, "ai.dub", user=user, workspace_id=src.workspace_id, target_type="media", target_id=a.id, source=str(src.id), target=body.target)
    db.commit()
    return ser_asset(a, job)
