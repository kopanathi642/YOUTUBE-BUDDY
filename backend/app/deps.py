"""Shared loaders that enforce tenant isolation, plus JSON serializers."""
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import storage
from .models import Export, Job, MediaAsset, Project, Role, Sequence, User
from .security import require_member


def load_project(db: Session, user: User, project_id: uuid.UUID, min_role: Role = Role.viewer) -> Project:
    p = db.get(Project, project_id)
    if not p or p.deleted_at:
        raise HTTPException(404, "Not found")
    require_member(db, user, p.workspace_id, min_role)
    return p


def load_asset(db: Session, user: User, asset_id: uuid.UUID, min_role: Role = Role.viewer) -> MediaAsset:
    a = db.get(MediaAsset, asset_id)
    if not a or a.deleted_at:
        raise HTTPException(404, "Not found")
    require_member(db, user, a.workspace_id, min_role)
    return a


def load_sequence(db: Session, user: User, seq_id: uuid.UUID, min_role: Role = Role.viewer) -> Sequence:
    s = db.get(Sequence, seq_id)
    if not s:
        raise HTTPException(404, "Not found")
    load_project(db, user, s.project_id, min_role)
    return s


def load_job(db: Session, user: User, job_id: uuid.UUID, min_role: Role = Role.viewer) -> Job:
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Not found")
    require_member(db, user, j.workspace_id, min_role)
    return j


def ser_job(j: Job | None) -> dict | None:
    if j is None:
        return None
    return {"id": str(j.id), "kind": j.kind, "status": j.status.value, "progress": j.progress, "stage": j.stage,
            "error": j.error, "attempts": j.attempts, "created_at": j.created_at.isoformat(),
            "started_at": j.started_at and j.started_at.isoformat(), "finished_at": j.finished_at and j.finished_at.isoformat(),
            "result": j.result, "cancel_requested": j.cancel_requested}


def ser_asset(a: MediaAsset, job: Job | None = None) -> dict:
    return {
        "id": str(a.id), "project_id": str(a.project_id), "filename": a.filename, "kind": a.kind,
        "status": a.status.value, "status_detail": a.status_detail, "size_bytes": a.size_bytes,
        "duration_s": a.duration_s, "width": a.width, "height": a.height, "fps": a.fps,
        "video_codec": a.video_codec, "audio_codec": a.audio_codec, "has_audio": a.has_audio, "has_video": a.has_video,
        "sha256": a.sha256, "created_at": a.created_at.isoformat(),
        "thumbnail_url": storage.signed_get(a.thumbnail_key) if a.thumbnail_key else None,
        "proxy_url": storage.signed_get(a.proxy_key) if a.proxy_key else None,
        "waveform_url": storage.signed_get(a.waveform_key) if a.waveform_key else None,
        "analysis": a.analysis,
        "job": ser_job(job),
    }


def ser_project(p: Project, extra: dict | None = None) -> dict:
    d = {"id": str(p.id), "workspace_id": str(p.workspace_id), "name": p.name, "universe": p.universe,
         "created_at": p.created_at.isoformat(), "updated_at": p.updated_at.isoformat(),
         "archived": p.archived_at is not None,
         "thumbnail_url": storage.signed_get(p.thumbnail_key) if p.thumbnail_key else None}
    if extra:
        d.update(extra)
    return d


def ser_export(e: Export, job: Job | None) -> dict:
    ok = job is not None and job.status.value == "succeeded" and e.output_key
    return {"id": str(e.id), "sequence_id": str(e.sequence_id), "sequence_version": e.sequence_version,
            "preset": e.preset, "settings": e.settings, "created_at": e.created_at.isoformat(),
            "output_size_bytes": e.output_size_bytes, "validation": e.validation,
            "download_url": storage.signed_get(e.output_key, filename=f"export-{str(e.id)[:8]}.mp4") if ok else None,
            "job": ser_job(job)}
