"""Durable Postgres-backed job queue.

Claiming uses `FOR UPDATE SKIP LOCKED`, so any number of workers can run safely. A running job
holds a lease that its worker renews; if the worker dies, the lease expires and another worker
reclaims the job. After max_attempts the job is failed permanently (dead-lettered) with its error.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from .models import Job, JobStatus

QUEUES = {"media.process": "media", "media.derive": "media", "media.import": "media", "render.export": "render",
          "ai.transcribe": "media", "ai.translate": "media", "ai.tts": "media", "ai.dub": "media", "ai.tool": "media", "youtube.upload": "media",
          "dub.prepare": "media", "dub.translate": "media", "dub.render": "media"}


def enqueue(db: Session, *, workspace_id, kind: str, payload: dict, project_id=None, created_by=None,
            idempotency_key: str | None = None, max_attempts: int = 3) -> Job:
    if idempotency_key:
        existing = db.scalar(select(Job).where(Job.workspace_id == workspace_id, Job.idempotency_key == idempotency_key))
        if existing:
            return existing
    job = Job(workspace_id=workspace_id, project_id=project_id, created_by=created_by, kind=kind,
              queue=QUEUES.get(kind, "default"), payload=payload, idempotency_key=idempotency_key,
              max_attempts=max_attempts, status=JobStatus.queued, logs=[])
    db.add(job)
    db.flush()
    return job


def claim(db: Session, worker_id: str, queues: list[str], lease_s: int) -> Job | None:
    row = db.execute(text("""
        UPDATE jobs SET status='running', attempts = attempts + 1, worker_id=:wid,
               lease_until = now() + make_interval(secs => :lease), started_at = coalesce(started_at, now()),
               updated_at = now(), error = NULL
        WHERE id = (
            SELECT id FROM jobs
            WHERE queue = ANY(:queues) AND cancel_requested = false AND (
                  (status='queued' AND run_after <= now())
               OR (status='running' AND lease_until < now()))
            -- Pro workspaces (active plan) go first: "priority renders" in billing.PLANS. Then oldest first.
            ORDER BY (SELECT w.plan = 'pro' AND w.plan_expires_at > now() FROM workspaces w WHERE w.id = jobs.workspace_id) DESC NULLS LAST,
                     created_at
            FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id"""), {"wid": worker_id, "lease": lease_s, "queues": queues}).first()
    db.commit()
    return db.get(Job, row[0]) if row else None


def heartbeat(db: Session, job_id: uuid.UUID, worker_id: str, lease_s: int, *, progress: float | None = None,
              stage: str | None = None) -> bool:
    """Renew lease + report progress. Returns False if the job was cancelled or taken over."""
    vals = {"lease_until": datetime.now(timezone.utc) + timedelta(seconds=lease_s)}
    if progress is not None:
        vals["progress"] = max(0.0, min(1.0, progress))
    if stage is not None:
        vals["stage"] = stage
    res = db.execute(update(Job).where(Job.id == job_id, Job.worker_id == worker_id, Job.status == JobStatus.running)
                     .values(**vals).returning(Job.cancel_requested))
    row = res.first()
    db.commit()
    return bool(row) and not row[0]


def log(db: Session, job: Job, msg: str) -> None:
    job.logs = [*job.logs, {"t": datetime.now(timezone.utc).isoformat(), "msg": msg[:500]}][-50:]


def finish(db: Session, job: Job, *, result: dict | None = None) -> None:
    job.status, job.result, job.progress, job.stage = JobStatus.succeeded, result, 1.0, "done"
    job.finished_at, job.lease_until = datetime.now(timezone.utc), None
    db.commit()


def fail(db: Session, job: Job, error: str, *, retryable: bool) -> None:
    job.error = error[:2000]
    job.lease_until = None
    if job.cancel_requested:
        job.status, job.finished_at = JobStatus.canceled, datetime.now(timezone.utc)
    elif retryable and job.attempts < job.max_attempts:
        job.status = JobStatus.queued
        job.run_after = datetime.now(timezone.utc) + timedelta(seconds=10 * 2 ** job.attempts)
        log(db, job, f"attempt {job.attempts} failed, will retry: {error[:200]}")
    else:
        job.status, job.finished_at = JobStatus.failed, datetime.now(timezone.utc)
    db.commit()


def request_cancel(db: Session, job: Job) -> None:
    if job.status in (JobStatus.succeeded, JobStatus.failed, JobStatus.canceled):
        return
    job.cancel_requested = True
    if job.status == JobStatus.queued:
        job.status, job.finished_at = JobStatus.canceled, datetime.now(timezone.utc)
