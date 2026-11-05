import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import jobs
from ..config import get_settings
from ..db import get_db
from ..deps import load_job, load_project, load_sequence, ser_export, ser_job
from ..models import Export, Job, JobStatus, MediaAsset, MediaStatus, Role, User
from ..security import audit, current_user
from ..timeline import EXPORT_PRESETS, Timeline, preset_dimensions

router = APIRouter(tags=["exports"])


class ExportIn(BaseModel):
    preset: str = "match"
    idempotency_key: str | None = Field(None, max_length=100)


@router.get("/export-presets")
def presets():
    return [{"id": k, "label": v["label"], "short_side": v["short_side"]} for k, v in EXPORT_PRESETS.items()]


@router.post("/sequences/{sequence_id}/exports", status_code=201)
def create_export(sequence_id: uuid.UUID, body: ExportIn, request: Request, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    s = load_sequence(db, user, sequence_id, Role.editor)
    if body.preset not in EXPORT_PRESETS:
        raise HTTPException(422, "Unknown export preset")
    tl = Timeline.model_validate(s.timeline)
    if tl.duration_frames == 0:
        raise HTTPException(422, "The timeline is empty — add a clip before exporting")
    dur = tl.duration_frames / tl.fps
    if dur > get_settings().max_export_seconds:
        raise HTTPException(422, f"Exports are limited to {get_settings().max_export_seconds // 60} minutes for now")
    ids = tl.asset_ids()
    ready = set(db.scalars(select(MediaAsset.id).where(MediaAsset.id.in_(ids), MediaAsset.status == MediaStatus.ready,
                                                       MediaAsset.deleted_at.is_(None))).all())
    if ids - ready:
        raise HTTPException(422, "Some clips use media that is missing or still processing")
    active = db.scalar(select(func.count()).select_from(Job).where(
        Job.workspace_id == s.workspace_id, Job.kind == "render.export",
        Job.status.in_([JobStatus.queued, JobStatus.running])))
    if active >= get_settings().max_concurrent_exports_per_workspace:
        raise HTTPException(429, "Too many exports running in this workspace; wait for one to finish")
    w, h = preset_dimensions(tl, body.preset)
    idem = f"export:{s.id}:{s.version}:{body.preset}:{body.idempotency_key}" if body.idempotency_key else None
    if idem:
        dup = db.scalar(select(Job).where(Job.workspace_id == s.workspace_id, Job.idempotency_key == idem))
        if dup:
            e = db.scalar(select(Export).where(Export.job_id == dup.id))
            return ser_export(e, dup)
    export_id = uuid.uuid4()
    job = jobs.enqueue(db, workspace_id=s.workspace_id, project_id=s.project_id, created_by=user.id, kind="render.export",
                       payload={"export_id": str(export_id)}, idempotency_key=idem, max_attempts=2)
    e = Export(id=export_id, workspace_id=s.workspace_id, project_id=s.project_id, sequence_id=s.id, sequence_version=s.version,
               job_id=job.id, preset=body.preset,
               settings={"width": w, "height": h, "fps": tl.fps, "duration_s": dur, "video_codec": "h264",
                         "audio_codec": "aac", "container": "mp4"})
    db.add(e)
    audit(db, request, "export.create", user=user, workspace_id=s.workspace_id, target_type="export", target_id=e.id,
          preset=body.preset, duration_s=dur)
    db.commit()
    return ser_export(e, job)


@router.get("/projects/{project_id}/exports")
def list_exports(project_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = load_project(db, user, project_id)
    rows = db.execute(select(Export, Job).join(Job, Job.id == Export.job_id).where(Export.project_id == p.id)
                      .order_by(Export.created_at.desc()).limit(50)).all()
    return [ser_export(e, j) for e, j in rows]


@router.get("/workspaces/{workspace_id}/jobs")
def workspace_jobs(workspace_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from ..security import require_member
    require_member(db, user, workspace_id)
    rows = db.scalars(select(Job).where(Job.workspace_id == workspace_id).order_by(Job.created_at.desc()).limit(20)).all()
    return [ser_job(j) | {"project_id": j.project_id and str(j.project_id)} for j in rows]


@router.get("/jobs/{job_id}")
def get_job(job_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ser_job(load_job(db, user, job_id)) | {"logs": load_job(db, user, job_id).logs}


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = load_job(db, user, job_id, Role.editor)
    jobs.request_cancel(db, j)
    audit(db, request, "job.cancel", user=user, workspace_id=j.workspace_id, target_type="job", target_id=j.id)
    db.commit()
    return ser_job(j)
