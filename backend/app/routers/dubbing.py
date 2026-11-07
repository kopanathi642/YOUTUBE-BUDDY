"""Multilingual dubbing API: create a dub for a clip, edit transcript/speakers/translations, render languages, download files."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import dubbing, jobs
from ..db import get_db
from ..deps import load_asset, load_project
from ..models import Dub, MediaStatus, Role, User
from ..security import ai_limiter, audit, current_user, require_member
from ..speech import catalog

router = APIRouter(tags=["dubbing"])
MAX_TARGETS = 10


def _dub(db: Session, user: User, dub_id: uuid.UUID, role: Role = Role.viewer) -> Dub:
    d = db.get(Dub, dub_id)
    if not d:
        raise HTTPException(404, "Not found")
    require_member(db, user, d.workspace_id, role)
    return d


def _check_targets(langs: list[str]) -> list[str]:
    info = dubbing.languages()
    ok = {t["code"] for t in info["targets"]}
    bad = [x for x in langs if x not in ok]
    if bad:
        raise HTTPException(422, f"Can't dub into {', '.join(catalog.LANG_NAMES.get(b, b) for b in bad)} on this server. "
                                 f"Available: {', '.join(catalog.LANG_NAMES.get(c, c) for c in sorted(ok))}")
    return list(dict.fromkeys(langs))


@router.get("/dub/languages")
def languages(user: User = Depends(current_user)):
    return dubbing.languages()


class CreateIn(BaseModel):
    source_language: str | None = Field(None, max_length=8)   # None = detect automatically
    targets: list[str] = Field(default_factory=list, max_length=MAX_TARGETS)


@router.post("/media/{asset_id}/dubs", status_code=201)
def create(asset_id: uuid.UUID, body: CreateIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ai_limiter.check(f"ai:{user.id}")
    src = load_asset(db, user, asset_id, Role.editor)
    if src.status != MediaStatus.ready or not src.has_audio:
        raise HTTPException(422, "Choose a ready clip that has speech")
    if (src.duration_s or 0) > dubbing.MAX_DUB_SECONDS:
        raise HTTPException(422, "Dubbing is limited to 30-minute files for now — split the video first")
    if body.source_language and body.source_language not in {s["code"] for s in dubbing.languages()["sources"]}:
        raise HTTPException(422, f"{catalog.LANG_NAMES.get(body.source_language, body.source_language)} can't be dubbed from yet")
    targets = _check_targets(body.targets)
    if body.source_language:
        for t in targets:
            ok, why = dubbing.pair_ok(body.source_language, t)
            if not ok:
                raise HTTPException(422, why)
    # duplicate protection: the same clip already being prepared with the same settings returns that dub
    same = db.scalar(select(Dub).where(Dub.source_asset_id == src.id, Dub.status == "preparing",
                                       Dub.source_language.is_(None) if not body.source_language else Dub.source_language == body.source_language))
    if same:
        return dubbing.ser(same)
    d = Dub(workspace_id=src.workspace_id, project_id=src.project_id, source_asset_id=src.id, created_by=user.id,
            source_language=body.source_language, targets={t: {"status": "waiting", "revision": 0} for t in targets})
    db.add(d)
    db.flush()
    jobs.enqueue(db, workspace_id=d.workspace_id, project_id=d.project_id, created_by=user.id, kind="dub.prepare",
                 payload={"dub_id": str(d.id)}, idempotency_key=f"dubprep:{d.id}:1", max_attempts=2)
    audit(db, request, "dub.create", user=user, workspace_id=d.workspace_id, target_type="dub", target_id=d.id, targets=targets)
    db.commit()
    return dubbing.ser(d)


@router.get("/dubs/{dub_id}")
def get(dub_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return dubbing.ser(_dub(db, user, dub_id))


@router.get("/projects/{project_id}/dubs")
def list_project(project_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = load_project(db, user, project_id)
    ds = db.scalars(select(Dub).where(Dub.project_id == p.id).order_by(Dub.created_at.desc()).limit(50)).all()
    return [dubbing.ser(d, full=False) for d in ds]


class SegEdit(BaseModel):
    i: int
    text: str | None = Field(None, max_length=2000)
    lang: str | None = Field(None, max_length=8)
    speaker: str | None = Field(None, max_length=8)


class PatchIn(BaseModel):
    version: int
    source_language: str | None = Field(None, max_length=8)
    redetect: bool = False
    segments: list[SegEdit] = Field(default_factory=list, max_length=2000)
    speakers: dict[str, dict] | None = None


@router.patch("/dubs/{dub_id}")
def patch(dub_id: uuid.UUID, body: PatchIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Correct the source language (re-recognises the speech) or edit transcript lines, line languages and speakers."""
    d = _dub(db, user, dub_id, Role.editor)
    if body.version != d.version:
        raise HTTPException(409, "This dub changed in another tab — reload to see the latest version")
    if d.status == "preparing":
        raise HTTPException(409, "Still recognising speech — try again in a moment")
    if body.source_language is not None or body.redetect:
        if body.source_language and body.source_language not in {s["code"] for s in dubbing.languages()["sources"]}:
            raise HTTPException(422, f"{catalog.LANG_NAMES.get(body.source_language, body.source_language)} can't be dubbed from yet")
        d.source_language = body.source_language or None
        d.status, d.version = "preparing", d.version + 1
        jobs.enqueue(db, workspace_id=d.workspace_id, project_id=d.project_id, created_by=user.id, kind="dub.prepare",
                     payload={"dub_id": str(d.id)}, idempotency_key=f"dubprep:{d.id}:{d.version}", max_attempts=2)
        db.commit()
        return dubbing.ser(d)
    segs = {s["i"]: dict(s) for s in d.segments or []}
    changed = []
    for e in body.segments:
        s = segs.get(e.i)
        if not s:
            raise HTTPException(422, f"Line {e.i} doesn't exist")
        if e.text is not None and e.text.strip() != s["text"]:
            s["text"] = e.text.strip()
            changed.append(e.i)
        if e.lang is not None and e.lang != s["lang"]:
            if e.lang not in catalog.LANG_NAMES:
                raise HTTPException(422, "Unknown language")
            s["lang"] = e.lang
            changed.append(e.i)
        if e.speaker is not None:
            if e.speaker not in (d.speakers or {}) and not (e.speaker.startswith("S") and e.speaker[1:].isdigit()):
                raise HTTPException(422, "Unknown speaker")
            s["speaker"] = e.speaker
    d.segments = [segs[k] for k in sorted(segs)]
    spk = dict(d.speakers or {})
    for s in d.segments:
        spk.setdefault(s["speaker"], {"label": f"Speaker {s['speaker'][1:]}"})
    for k, v in (body.speakers or {}).items():
        if k in spk and isinstance(v.get("label"), str):
            spk[k] = {**spk[k], "label": v["label"][:40]}
    d.speakers = {k: v for k, v in spk.items() if any(s["speaker"] == k for s in d.segments)}
    d.version += 1
    db.commit()
    changed = sorted(set(changed))
    for lang in (d.targets or {}) if changed else ():   # speaker names/labels don't change any translation
        jobs.enqueue(db, workspace_id=d.workspace_id, project_id=d.project_id, created_by=user.id, kind="dub.translate",
                     payload={"dub_id": str(d.id), "lang": lang, "only": changed or None},
                     idempotency_key=f"dubtr:{d.id}:{lang}:{d.version}", max_attempts=2)
    audit(db, request, "dub.edit", user=user, workspace_id=d.workspace_id, target_type="dub", target_id=d.id, lines=len(body.segments))
    db.commit()
    return dubbing.ser(d)


class TargetsIn(BaseModel):
    languages: list[str] = Field(min_length=1, max_length=MAX_TARGETS)


@router.post("/dubs/{dub_id}/targets")
def add_targets(dub_id: uuid.UUID, body: TargetsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = _dub(db, user, dub_id, Role.editor)
    langs = _check_targets(body.languages)
    if len(set(d.targets or {}) | set(langs)) > MAX_TARGETS:
        raise HTTPException(422, f"Up to {MAX_TARGETS} languages per dub")
    src = d.source_language or d.detected_language
    if src:
        for t in langs:
            ok, why = dubbing.pair_ok(src, t)
            if not ok:
                raise HTTPException(422, why)
    tg = dict(d.targets or {})
    for t in langs:
        tg.setdefault(t, {"status": "waiting", "revision": 0})
    d.targets = tg
    d.version += 1
    if d.status == "ready":
        for t in langs:
            jobs.enqueue(db, workspace_id=d.workspace_id, project_id=d.project_id, created_by=user.id, kind="dub.translate",
                         payload={"dub_id": str(d.id), "lang": t}, idempotency_key=f"dubtr:{d.id}:{t}:{d.version}", max_attempts=2)
    db.commit()
    return dubbing.ser(d)


class TargetPatch(BaseModel):
    segments: list[SegEdit] = Field(default_factory=list, max_length=2000)
    voices: dict[str, str] | None = None


@router.patch("/dubs/{dub_id}/targets/{lang}")
def patch_target(dub_id: uuid.UUID, lang: str, body: TargetPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Edit translated lines and choose the voice for each speaker in one language."""
    d = _dub(db, user, dub_id, Role.editor)
    tg = dict((d.targets or {}).get(lang) or {})
    if not tg or tg.get("status") in ("waiting", None):
        raise HTTPException(409, "This language isn't translated yet")
    segs = {s["i"]: dict(s) for s in tg.get("segments", [])}
    for e in body.segments:
        if e.i not in segs:
            raise HTTPException(422, f"Line {e.i} doesn't exist")
        if e.text is not None:
            segs[e.i].update(text=e.text.strip(), edited=True)
    voices = dict(tg.get("voices") or {})
    for spk, vid in (body.voices or {}).items():
        v = catalog.VOICE_BY_ID.get(vid)
        if not v or v["language"] != lang:
            raise HTTPException(422, f"{vid} is not a {catalog.LANG_NAMES.get(lang, lang)} voice")
        if spk not in (d.speakers or {}):
            raise HTTPException(422, f"Unknown speaker {spk}")
        voices[spk] = vid
    dubbing._set_target(d, lang, segments=[segs[k] for k in sorted(segs)], voices=voices, revision=tg.get("revision", 0) + 1,
                        status="ready" if tg.get("status") != "rendering" else "ready")
    d.version += 1
    db.commit()
    return dubbing.ser(d)


@router.delete("/dubs/{dub_id}/targets/{lang}")
def remove_target(dub_id: uuid.UUID, lang: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = _dub(db, user, dub_id, Role.editor)
    tg = dict(d.targets or {})
    tg.pop(lang, None)
    d.targets, d.version = tg, d.version + 1
    db.commit()
    return dubbing.ser(d)


class RenderIn(BaseModel):
    languages: list[str] = Field(min_length=1, max_length=MAX_TARGETS)
    duck: float = Field(0.15, ge=0, le=1)   # original audio level under the dub


@router.post("/dubs/{dub_id}/render")
def render(dub_id: uuid.UUID, body: RenderIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ai_limiter.check(f"ai:{user.id}")
    d = _dub(db, user, dub_id, Role.editor)
    if d.status != "ready":
        raise HTTPException(409, "Speech recognition isn't finished yet")
    started = []
    for lang in dict.fromkeys(body.languages):
        tg = (d.targets or {}).get(lang)
        if not tg or tg.get("status") not in ("ready", "done", "failed"):
            raise HTTPException(409, f"{catalog.LANG_NAMES.get(lang, lang)} isn't translated yet")
        rev = tg.get("revision", 1)
        # duplicate protection: one render per language per revision (a double click returns the same job)
        jobs.enqueue(db, workspace_id=d.workspace_id, project_id=d.project_id, created_by=user.id, kind="dub.render",
                     payload={"dub_id": str(d.id), "lang": lang, "revision": rev, "duck": body.duck},
                     idempotency_key=f"dubrender:{d.id}:{lang}:{rev}:{body.duck}", max_attempts=2)
        if tg.get("status") != "done" or tg.get("revision") != rev:
            dubbing._set_target(d, lang, status="queued")
        started.append(lang)
    audit(db, request, "dub.render", user=user, workspace_id=d.workspace_id, target_type="dub", target_id=d.id, languages=started)
    db.commit()
    return dubbing.ser(d)
