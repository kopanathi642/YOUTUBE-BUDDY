"""Worker API for GPU workers (the HP laptop) + admin controls.

Worker side (/api/v1/worker/*): token auth (only its SHA-256 is stored), refused when the request came through the
public Cloudflare tunnel (CF-Connecting-IP / CF-Ray present: Cloudflare sets these on every public request and visitors
can't remove them), refused entirely unless GPU_WORKERS_ENABLED=true. A worker only ever sees the jobs it claimed.
Admin side (/api/v1/admin/gpu*): platform admins only (same rule as payments admin).
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .. import gpu, jobs
from ..config import get_settings
from ..db import get_db
from ..models import GpuWorker, Job, JobStatus, PlatformSetting
from .billing import admin_user

router = APIRouter()          # worker endpoints: bearer token, no cookies, no CSRF header
admin_router = APIRouter()    # admin endpoints: normal session + CSRF


def _now():
    return datetime.now(timezone.utc)


def _global_paused(db: Session) -> bool:
    row = db.get(PlatformSetting, "gpu")
    return bool(row and row.value.get("paused"))


def worker_auth(request: Request, authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> GpuWorker:
    if not gpu.enabled():
        raise HTTPException(503, "GPU workers are switched off on this server")
    if request.headers.get("cf-connecting-ip") or request.headers.get("cf-ray"):
        raise HTTPException(403, "The worker API is only reachable over the private network")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing worker token")
    w = db.scalar(select(GpuWorker).where(GpuWorker.token_hash == gpu.hash_token(authorization[7:].strip())))
    if w is None:
        raise HTTPException(401, "Unknown worker token")
    if w.revoked_at is not None:
        raise HTTPException(403, "This worker has been revoked")
    return w


def _wid(w: GpuWorker) -> str:
    return f"gpu:{w.name}"


class HeartbeatIn(BaseModel):
    capabilities: dict = Field(default_factory=dict)


@router.post("/worker/heartbeat")
def heartbeat(body: HeartbeatIn, w: GpuWorker = Depends(worker_auth), db: Session = Depends(get_db)):
    caps = body.capabilities
    if len(str(caps)) > 8000:
        raise HTTPException(413, "capabilities too large")
    w.capabilities, w.last_seen_at = caps, _now()
    db.commit()
    return {"ok": True, "paused": w.paused or _global_paused(db), "lease_seconds": get_settings().job_lease_seconds}


class ClaimIn(BaseModel):
    tasks: list[str] = Field(default_factory=lambda: ["llm"])
    vram_free_mb: int | None = None


@router.post("/worker/claim")
def claim(body: ClaimIn, w: GpuWorker = Depends(worker_auth), db: Session = Depends(get_db)):
    w.last_seen_at = _now()
    db.commit()
    if w.paused or _global_paused(db):
        return Response(status_code=204)
    lease = get_settings().job_lease_seconds
    # same atomic claim as jobs.claim (FOR UPDATE SKIP LOCKED + expired-lease reclaim), limited to task types this worker can do
    row = db.execute(text("""
        UPDATE jobs SET status='running', attempts = attempts + 1, worker_id=:wid,
               lease_until = now() + make_interval(secs => :lease), started_at = coalesce(started_at, now()),
               updated_at = now(), error = NULL, stage = 'Running on GPU worker'
        WHERE id = (
            SELECT id FROM jobs
            WHERE queue = :q AND cancel_requested = false AND payload->'gpu_task'->>'type' = ANY(:types) AND (
                  (status='queued' AND run_after <= now())
               OR (status='running' AND lease_until < now()))
            ORDER BY (SELECT ws.plan = 'pro' AND ws.plan_expires_at > now() FROM workspaces ws WHERE ws.id = jobs.workspace_id) DESC NULLS LAST,
                     created_at
            FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id"""), {"wid": _wid(w), "lease": lease, "q": gpu.GPU_QUEUE, "types": body.tasks}).first()
    db.commit()
    if not row:
        return Response(status_code=204)
    job = db.get(Job, row[0])
    jobs.log(db, job, f"claimed by GPU worker {w.name} (attempt {job.attempts})")
    db.commit()
    return {"job_id": str(job.id), "task": job.payload["gpu_task"], "lease_seconds": lease, "attempt": job.attempts}


def _owned(db: Session, job_id: uuid.UUID, w: GpuWorker) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.worker_id != _wid(w) or job.status != JobStatus.running or job.queue != gpu.GPU_QUEUE:
        raise HTTPException(409, "This job is not running on this worker (lease expired, cancelled or already finished)")
    return job


class ProgressIn(BaseModel):
    progress: float | None = None
    stage: str | None = Field(default=None, max_length=80)


@router.post("/worker/jobs/{job_id}/progress")
def progress(job_id: uuid.UUID, body: ProgressIn, w: GpuWorker = Depends(worker_auth), db: Session = Depends(get_db)):
    _owned(db, job_id, w)
    keep = jobs.heartbeat(db, job_id, _wid(w), get_settings().job_lease_seconds, progress=body.progress, stage=body.stage)
    return {"continue": keep}     # False = the user cancelled: stop and report /fail


class CompleteIn(BaseModel):
    sha: str = Field(min_length=64, max_length=64)
    text: str = Field(min_length=1, max_length=gpu.MAX_REPLY_CHARS)


@router.post("/worker/jobs/{job_id}/complete")
def complete(job_id: uuid.UUID, body: CompleteIn, w: GpuWorker = Depends(worker_auth), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if job is not None and body.sha in (job.payload or {}).get("gpu_replies", {}):
        return {"status": "already_delivered"}            # idempotent: a retried request changes nothing
    job = _owned(db, job_id, w)
    if job.cancel_requested:                               # the user cancelled while the GPU was working: don't apply it
        jobs.fail(db, job, "cancelled by user", retryable=False)
        from ..worker import _mark_media_failed
        _mark_media_failed(db, job, "cancelled by user")
        return {"status": "cancelled"}
    task = job.payload.get("gpu_task") or {}
    if task.get("sha") != body.sha:
        raise HTTPException(409, "The result does not belong to this job's task")
    from ..tools.providers import ProviderError, parse_json
    try:
        parse_json(body.text)                              # validate before accepting: the job must be able to use it
    except ProviderError as e:
        jobs.fail(db, job, f"GPU worker returned an unusable answer: {e}", retryable=True)
        if job.status == JobStatus.failed:
            from ..worker import _mark_media_failed
            _mark_media_failed(db, job, str(e))
        return {"status": "rejected", "reason": str(e)}
    gpu.deliver(db, job, body.text)
    return {"status": "accepted"}


class FailIn(BaseModel):
    error: str = Field(min_length=1, max_length=2000)
    retryable: bool = True


@router.post("/worker/jobs/{job_id}/fail")
def fail(job_id: uuid.UUID, body: FailIn, w: GpuWorker = Depends(worker_auth), db: Session = Depends(get_db)):
    job = _owned(db, job_id, w)
    jobs.fail(db, job, f"GPU worker: {body.error}", retryable=body.retryable)
    if job.status in (JobStatus.failed, JobStatus.canceled):
        from ..worker import _mark_media_failed
        _mark_media_failed(db, job, "cancelled by user" if job.status == JobStatus.canceled else body.error)
    return {"status": job.status.value}


# ---------------------------------------------------------------- admin


def _ser(w: GpuWorker) -> dict:
    online = w.last_seen_at is not None and w.last_seen_at > _now() - timedelta(seconds=gpu.ONLINE_SECONDS) and not w.revoked_at
    return {"id": str(w.id), "name": w.name, "online": online, "last_seen_at": w.last_seen_at.isoformat() if w.last_seen_at else None,
            "capabilities": w.capabilities, "paused": w.paused, "revoked": w.revoked_at is not None}


@admin_router.get("/admin/gpu")
def gpu_overview(user=Depends(admin_user), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Job.status, func.count()).where(Job.queue == gpu.GPU_QUEUE).group_by(Job.status)).all())
    return {"enabled": gpu.enabled(), "llm_routed": gpu.llm_routed(), "paused": _global_paused(db),
            "workers": [_ser(w) for w in db.scalars(select(GpuWorker).order_by(GpuWorker.created_at))],
            "queue": {s.value: counts.get(s, 0) for s in JobStatus}}


class NewWorkerIn(BaseModel):
    name: str = Field(min_length=2, max_length=60, pattern=r"^[A-Za-z0-9._-]+$")


@admin_router.post("/admin/gpu/workers", status_code=201)
def create_worker(body: NewWorkerIn, user=Depends(admin_user), db: Session = Depends(get_db)):
    if db.scalar(select(GpuWorker).where(GpuWorker.name == body.name)):
        raise HTTPException(409, "A worker with this name already exists")
    tok, h = gpu.new_token()
    w = GpuWorker(name=body.name, token_hash=h, capabilities={})
    db.add(w)
    db.commit()
    return {**_ser(w), "token": tok, "note": "Shown once. Put it in the worker's local config file; never in chat or Git."}


@admin_router.post("/admin/gpu/workers/{worker_id}/revoke")
def revoke_worker(worker_id: uuid.UUID, user=Depends(admin_user), db: Session = Depends(get_db)):
    w = db.get(GpuWorker, worker_id)
    if w is None:
        raise HTTPException(404, "Not found")
    w.revoked_at = w.revoked_at or _now()
    db.commit()
    return _ser(w)


class PauseIn(BaseModel):
    paused: bool


@admin_router.post("/admin/gpu/pause")
def pause_all(body: PauseIn, user=Depends(admin_user), db: Session = Depends(get_db)):
    row = db.get(PlatformSetting, "gpu")
    if row is None:
        db.add(PlatformSetting(key="gpu", value={"paused": body.paused}))
    else:
        row.value = {**row.value, "paused": body.paused}
    db.commit()
    return {"paused": body.paused}
