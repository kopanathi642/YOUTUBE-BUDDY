"""GPU worker routing (the HP laptop): jobs that need the GPU wait in the `gpu` queue until a registered worker claims them.

Design: the GPU worker never touches the database or object storage. For the writing model, a normal `ai.tool` job runs
on the server worker up to the moment it needs the model; `providers.llm_json` then raises `DeferToGpu`. The worker
parks the job in the `gpu` queue with the exact prompt. A GPU worker claims it through the worker API, runs the model
locally and returns only the text. The job goes back to its home queue and is replayed: this time `llm_json` finds the
reply for that exact prompt (by SHA-256) and the existing code finishes the job as before.

Off unless GPU_WORKERS_ENABLED=true. Writing-model routing additionally needs GPU_LLM=true.
"""
import contextvars
import hashlib
import json
import os
import secrets
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import Job, JobStatus

GPU_QUEUE = "gpu"
WAITING_STAGE = "Waiting for GPU worker"
ONLINE_SECONDS = 60          # a worker counts as online if its last heartbeat is newer than this
MAX_REPLY_CHARS = 200_000

CURRENT_JOB: contextvars.ContextVar[Job | None] = contextvars.ContextVar("yb_current_job", default=None)


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def enabled() -> bool:
    return _flag("GPU_WORKERS_ENABLED")


def llm_routed() -> bool:
    """Writing-model calls go to the GPU worker (unless a hosted model key takes precedence, see providers.llm_json)."""
    return enabled() and _flag("GPU_LLM")


def model_label() -> str:
    return os.environ.get("GPU_LLM_LABEL", "Qwen3-4B (GPU worker)")


class DeferToGpu(BaseException):
    """Not an error: the current job needs a GPU worker for this step. BaseException so generic
    `except Exception` handlers inside tools can't swallow it."""

    def __init__(self, task: dict):
        super().__init__("deferred to GPU worker")
        self.task = task


def prompt_sha(system: str, user: str, max_tokens: int) -> str:
    return hashlib.sha256(json.dumps([system, user, int(max_tokens)], ensure_ascii=False).encode()).hexdigest()


def llm_task(system: str, user: str, max_tokens: int) -> dict:
    return {"type": "llm", "sha": prompt_sha(system, user, max_tokens), "system": system, "user": user, "max_tokens": int(max_tokens)}


def prepared_reply(system: str, user: str, max_tokens: int) -> str | None:
    job = CURRENT_JOB.get()
    if job is None:
        return None
    return (job.payload or {}).get("gpu_replies", {}).get(prompt_sha(system, user, max_tokens))


def park(db: Session, job: Job, task: dict) -> None:
    """Move a running job to the gpu queue with its task. Not counted as a failed attempt."""
    home = job.payload.get("gpu_home_queue") or job.queue
    job.payload = {**job.payload, "gpu_task": task, "gpu_home_queue": home}
    job.queue, job.status, job.stage = GPU_QUEUE, JobStatus.queued, WAITING_STAGE
    job.attempts = max(0, job.attempts - 1)
    job.worker_id, job.lease_until = None, None
    job.run_after = datetime.now(timezone.utc)
    from .jobs import log
    log(db, job, f"waiting for GPU worker ({task['type']})")
    db.commit()


def deliver(db: Session, job: Job, text_out: str) -> None:
    """Store a GPU worker's reply on the job and send it back to its home queue to finish."""
    task = job.payload["gpu_task"]
    replies = {**job.payload.get("gpu_replies", {}), task["sha"]: text_out}
    payload = {k: v for k, v in job.payload.items() if k != "gpu_task"}
    job.payload = {**payload, "gpu_replies": replies}
    job.queue = job.payload.get("gpu_home_queue", "media")
    job.status, job.stage = JobStatus.queued, "GPU result received"
    job.attempts = max(0, job.attempts - 1)          # the hop itself is not an attempt
    job.worker_id, job.lease_until = None, None
    job.run_after = datetime.now(timezone.utc)
    from .jobs import log
    log(db, job, "GPU worker returned its result")
    db.commit()


def new_token() -> tuple[str, str]:
    """(token shown once to the admin, sha256 hash stored in the database)."""
    tok = "ybw_" + secrets.token_urlsafe(32)
    return tok, hashlib.sha256(tok.encode()).hexdigest()


def hash_token(tok: str) -> str:
    return hashlib.sha256(tok.encode()).hexdigest()
