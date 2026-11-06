import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import load_project, load_sequence, ser_project
from ..models import MediaAsset, Project, Role, Sequence, SequenceVersion, User
from ..security import audit, current_user, require_member
from ..timeline import Timeline, default_timeline

router = APIRouter(tags=["projects"])

FORMATS = {"landscape": (1920, 1080), "vertical": (1080, 1920), "square": (1080, 1080), "landscape_720": (1280, 720)}


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    format: Literal["landscape", "vertical", "square", "landscape_720"] = "landscape"
    fps: Literal[24, 25, 30, 50, 60] = 30


class ProjectPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    archived: bool | None = None


class SequenceSave(BaseModel):
    base_version: int
    timeline: dict


class RestoreIn(BaseModel):
    version: int


def ser_sequence(s: Sequence) -> dict:
    return {"id": str(s.id), "project_id": str(s.project_id), "name": s.name, "version": s.version,
            "timeline": s.timeline, "updated_at": s.updated_at.isoformat()}


@router.get("/workspaces/{workspace_id}/projects")
def list_projects(workspace_id: uuid.UUID, q: str | None = None, archived: bool = False, sort: str = "updated",
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, user, workspace_id)
    stmt = select(Project).where(Project.workspace_id == workspace_id, Project.deleted_at.is_(None))
    stmt = stmt.where(Project.archived_at.is_not(None) if archived else Project.archived_at.is_(None))
    if q:
        stmt = stmt.where(Project.name.ilike(f"%{q.replace('%', '').replace('_', '')}%"))
    stmt = stmt.order_by(Project.name if sort == "name" else Project.updated_at.desc())
    projects = db.scalars(stmt.limit(200)).all()
    counts = dict(db.execute(select(MediaAsset.project_id, func.count()).where(
        MediaAsset.project_id.in_([p.id for p in projects]), MediaAsset.deleted_at.is_(None))
        .group_by(MediaAsset.project_id)).all()) if projects else {}
    return [ser_project(p, {"media_count": counts.get(p.id, 0)}) for p in projects]


@router.post("/workspaces/{workspace_id}/projects", status_code=201)
def create_project(workspace_id: uuid.UUID, body: ProjectIn, request: Request, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    require_member(db, user, workspace_id, Role.editor)
    p = Project(workspace_id=workspace_id, name=body.name.strip(), created_by=user.id, universe="editor")
    db.add(p)
    db.flush()
    w, h = FORMATS[body.format]
    tl = default_timeline(body.fps, w, h)
    s = Sequence(workspace_id=workspace_id, project_id=p.id, name="Main sequence", version=1, timeline=tl)
    db.add(s)
    db.flush()
    db.add(SequenceVersion(sequence_id=s.id, version=1, timeline=tl, saved_by=user.id))
    audit(db, request, "project.create", user=user, workspace_id=workspace_id, target_type="project", target_id=p.id)
    db.commit()
    return ser_project(p, {"sequences": [ser_sequence(s)]})


@router.get("/projects/{project_id}")
def get_project(project_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = load_project(db, user, project_id)
    m = require_member(db, user, p.workspace_id)
    seqs = db.scalars(select(Sequence).where(Sequence.project_id == p.id).order_by(Sequence.created_at)).all()
    return ser_project(p, {"sequences": [ser_sequence(s) for s in seqs], "my_role": m.role.value})


@router.patch("/projects/{project_id}")
def patch_project(project_id: uuid.UUID, body: ProjectPatch, request: Request, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    p = load_project(db, user, project_id, Role.editor)
    if body.name is not None:
        p.name = body.name.strip()
    if body.archived is not None:
        p.archived_at = datetime.now(timezone.utc) if body.archived else None
    audit(db, request, "project.update", user=user, workspace_id=p.workspace_id, target_type="project", target_id=p.id,
          fields=[k for k, v in body.model_dump().items() if v is not None])
    db.commit()
    return ser_project(p)


@router.delete("/projects/{project_id}")
def delete_project(project_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Soft delete (recoverable by support). Storage purge is a separate retention job."""
    p = load_project(db, user, project_id, Role.admin)
    p.deleted_at = datetime.now(timezone.utc)
    audit(db, request, "project.delete", user=user, workspace_id=p.workspace_id, target_type="project", target_id=p.id)
    db.commit()
    return {"ok": True}


@router.get("/sequences/{sequence_id}")
def get_sequence(sequence_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ser_sequence(load_sequence(db, user, sequence_id))


@router.put("/sequences/{sequence_id}")
def save_sequence(sequence_id: uuid.UUID, body: SequenceSave, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Optimistic concurrency: a stale base_version gets 409 so two editors never silently overwrite each other."""
    s = load_sequence(db, user, sequence_id, Role.editor)
    db.refresh(s, with_for_update=True)
    if body.base_version != s.version:
        raise HTTPException(409, {"message": "Sequence changed elsewhere", "current_version": s.version})
    try:
        tl = Timeline.model_validate(body.timeline)
    except ValidationError as e:
        raise HTTPException(422, {"message": "Invalid timeline", "errors": e.errors(include_url=False, include_context=False)})
    ids = tl.asset_ids()
    if ids:
        kinds = dict(db.execute(select(MediaAsset.id, MediaAsset.kind).where(MediaAsset.id.in_(ids), MediaAsset.project_id == s.project_id,
                                                                            MediaAsset.deleted_at.is_(None))).all())
        if ids - set(kinds):
            raise HTTPException(422, {"message": "Timeline references media outside this project"})
        if any(kinds[i] == "lut" for i in tl.clip_asset_ids()) or any(kinds[i] != "lut" for i in tl.lut_asset_ids()):
            raise HTTPException(422, {"message": "A LUT can only be used in colour grading, and clips need video, audio or images"})
    data = tl.model_dump(by_alias=True, mode="json")
    s.version += 1
    s.timeline = data
    db.add(SequenceVersion(sequence_id=s.id, version=s.version, timeline=data, saved_by=user.id))
    db.get(Project, s.project_id).updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": str(s.id), "version": s.version, "updated_at": s.updated_at.isoformat()}


@router.get("/sequences/{sequence_id}/versions")
def versions(sequence_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = load_sequence(db, user, sequence_id)
    rows = db.execute(select(SequenceVersion.version, SequenceVersion.created_at, User.display_name)
                      .outerjoin(User, User.id == SequenceVersion.saved_by)
                      .where(SequenceVersion.sequence_id == s.id).order_by(SequenceVersion.version.desc()).limit(100)).all()
    return [{"version": v, "created_at": c.isoformat(), "saved_by": n} for v, c, n in rows]


@router.post("/sequences/{sequence_id}/restore")
def restore(sequence_id: uuid.UUID, body: RestoreIn, request: Request, user: User = Depends(current_user),
            db: Session = Depends(get_db)):
    """Restoring never deletes history: it saves the old state as a new version."""
    s = load_sequence(db, user, sequence_id, Role.editor)
    old = db.scalar(select(SequenceVersion).where(SequenceVersion.sequence_id == s.id, SequenceVersion.version == body.version))
    if not old:
        raise HTTPException(404, "Version not found")
    db.refresh(s, with_for_update=True)
    s.version += 1
    s.timeline = old.timeline
    db.add(SequenceVersion(sequence_id=s.id, version=s.version, timeline=old.timeline, saved_by=user.id))
    audit(db, request, "sequence.restore", user=user, workspace_id=s.workspace_id, target_type="sequence", target_id=s.id,
          from_version=body.version)
    db.commit()
    return ser_sequence(s)


# ---------------------------------------------------------------- multiple sequences + smart reframe

class SequenceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    format: Literal["landscape", "vertical", "square", "portrait_45"] | None = None
    from_sequence_id: uuid.UUID | None = None
    reframe: bool = False  # subject-aware cover crop of the main video track into the new format
    range_from: int | None = Field(None, ge=0)  # frames: make a short from just this part of the source sequence
    range_to: int | None = Field(None, gt=0)


ASPECTS = {**FORMATS, "portrait_45": (1080, 1350)}


def reframe_timeline(src: dict, W2: int, H2: int, assets: dict[uuid.UUID, MediaAsset]) -> dict:
    """Fill a new canvas with the bottom video track (cover crop, centred on the detected face when known).
    Overlay tracks keep their look, with positions scaled to the new canvas. Static crop per clip:
    no motion tracking yet."""
    tl = Timeline.model_validate(src)
    W1, H1 = tl.width, tl.height
    vids = [t for t in tl.tracks if t.kind == "video"]
    base = vids[-1] if vids else None
    for t in vids:
        for c in t.clips:
            a = assets.get(c.asset_id)
            if t is base and a and a.width and a.height:
                contain = min(W2 / a.width, H2 / a.height)
                cover = max(W2 / a.width, H2 / a.height)
                dw = a.width * cover
                sx = (a.analysis or {}).get("subject_center_x") or 0.5
                limit = max(0.0, (dw - W2) / 2)
                x = max(-limit, min(limit, -(sx - 0.5) * dw))
                c.transform.scale = round(min(10.0, cover / contain), 4)
                c.transform.x, c.transform.y = round(x, 1), 0.0
            else:
                c.transform.x = round(c.transform.x * W2 / W1, 1)
                c.transform.y = round(c.transform.y * H2 / H1, 1)
    tl.width, tl.height = W2, H2
    return tl.model_dump(by_alias=True, mode="json")


@router.post("/projects/{project_id}/sequences", status_code=201)
def create_sequence(project_id: uuid.UUID, body: SequenceCreate, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    p = load_project(db, user, project_id, Role.editor)
    if db.scalar(select(func.count()).select_from(Sequence).where(Sequence.project_id == p.id)) >= 20:
        raise HTTPException(422, "A project can have at most 20 sequences")
    if body.from_sequence_id:
        src = db.get(Sequence, body.from_sequence_id)
        if not src or src.project_id != p.id:
            raise HTTPException(404, "Source sequence not found")
        tl = src.timeline
        if body.range_from is not None and body.range_to is not None:
            from ..timeline import slice_timeline
            try:
                tl = slice_timeline(tl, body.range_from, body.range_to)
            except ValueError as e:
                raise HTTPException(422, str(e))
        if body.format:
            W2, H2 = ASPECTS[body.format]
            if body.reframe:
                ids = Timeline.model_validate(tl).asset_ids()
                assets = {a.id: a for a in db.scalars(select(MediaAsset).where(MediaAsset.id.in_(ids)))} if ids else {}
                tl = reframe_timeline(tl, W2, H2, assets)
            else:
                tl = {**tl, "width": W2, "height": H2}
    else:
        W2, H2 = ASPECTS[body.format or "landscape"]
        main = db.scalar(select(Sequence).where(Sequence.project_id == p.id).order_by(Sequence.created_at))
        tl = default_timeline(main.timeline["fps"] if main else 30, W2, H2)
    s = Sequence(workspace_id=p.workspace_id, project_id=p.id, name=body.name.strip(), version=1, timeline=tl)
    db.add(s)
    db.flush()
    db.add(SequenceVersion(sequence_id=s.id, version=1, timeline=tl, saved_by=user.id))
    audit(db, request, "sequence.create", user=user, workspace_id=p.workspace_id, target_type="sequence", target_id=s.id,
          reframe=body.reframe, format=body.format)
    db.commit()
    return ser_sequence(s)


class SequencePatch(BaseModel):
    name: str = Field(min_length=1, max_length=200)


@router.patch("/sequences/{sequence_id}")
def rename_sequence(sequence_id: uuid.UUID, body: SequencePatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = load_sequence(db, user, sequence_id, Role.editor)
    s.name = body.name.strip()
    db.commit()
    return ser_sequence(s)


@router.delete("/sequences/{sequence_id}")
def delete_sequence(sequence_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = load_sequence(db, user, sequence_id, Role.editor)
    if db.scalar(select(func.count()).select_from(Sequence).where(Sequence.project_id == s.project_id)) <= 1:
        raise HTTPException(422, "A project needs at least one sequence")
    audit(db, request, "sequence.delete", user=user, workspace_id=s.workspace_id, target_type="sequence", target_id=s.id)
    db.delete(s)
    db.commit()
    return {"ok": True}
