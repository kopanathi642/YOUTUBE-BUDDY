"""Background worker. Run with:  python -m app.worker --queues media,render

Processes jobs from Postgres; keeps working when every browser is closed.
"""
import argparse
import logging
import os
import shutil
import signal
import socket
import subprocess
import tempfile
import threading
import time
import uuid

from sqlalchemy import select

from . import jobs, media, storage
from .config import get_settings
from .db import session_factory
from .models import Export, Job, MediaAsset, MediaStatus, Sequence, SequenceVersion
from .timeline import AssetInfo, Timeline, compile_ffmpeg, preset_dimensions, EXPORT_PRESETS

log = logging.getLogger("worker")
logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","msg":"%(message)s"}')

ALIVE_FILE = "/tmp/creator-worker-alive"


class Cancelled(Exception):
    pass


class Permanent(Exception):
    """Failure that retrying cannot fix."""


class Ctx:
    def __init__(self, db, job: Job, worker_id: str):
        self.db, self.job, self.worker_id = db, job, worker_id
        self.lease = get_settings().job_lease_seconds
        self._last = 0.0

    def progress(self, p: float, stage: str | None = None, force: bool = False):
        now = time.monotonic()
        if not force and now - self._last < 1.0:
            return
        self._last = now
        if not jobs.heartbeat(self.db, self.job.id, self.worker_id, self.lease, progress=p, stage=stage):
            raise Cancelled()


# ------------------------------------------------------------------ media.process

def handle_media_process(ctx: Ctx, tmp: str):
    db = ctx.db
    asset = db.get(MediaAsset, uuid.UUID(ctx.job.payload["asset_id"]))
    if asset is None or asset.deleted_at:
        raise Permanent("asset no longer exists")
    asset.status = MediaStatus.processing
    db.commit()
    src = os.path.join(tmp, "source" + os.path.splitext(asset.filename)[1].lower())
    ctx.progress(0.05, "downloading", force=True)
    storage.download(asset.storage_key, src)
    ctx.progress(0.2, "validating", force=True)
    try:
        meta = media.inspect(src, asset.kind)
    except media.MediaRejected as e:
        asset.status, asset.status_detail = MediaStatus.rejected, str(e)
        db.commit()
        storage.delete_prefix(asset.storage_key)  # never keep unverified content
        raise Permanent(f"rejected: {e}")
    asset.sha256 = media.sha256_file(src)
    for k in ("duration_s", "width", "height", "fps", "video_codec", "audio_codec", "has_video", "has_audio", "probe"):
        setattr(asset, k, meta[k])
    db.commit()
    base = asset.storage_key.rsplit("/", 1)[0] + "/derived"

    if meta["has_video"]:
        ctx.progress(0.3, "thumbnail", force=True)
        thumb = os.path.join(tmp, "thumb.jpg")
        media.make_thumbnail(src, thumb, meta)
        storage.upload(thumb, f"{base}/thumb.jpg", "image/jpeg")
        asset.thumbnail_key = f"{base}/thumb.jpg"
    ctx.progress(0.4, "proxy", force=True)
    if meta["kind"] == "video":
        proxy = os.path.join(tmp, "proxy.mp4")
        media.make_proxy(src, proxy, meta)
        storage.upload(proxy, f"{base}/proxy.mp4", "video/mp4")
        asset.proxy_key = f"{base}/proxy.mp4"
    elif meta["kind"] == "audio":
        proxy = os.path.join(tmp, "proxy.m4a")
        media.make_audio_proxy(src, proxy)
        storage.upload(proxy, f"{base}/proxy.m4a", "audio/mp4")
        asset.proxy_key = f"{base}/proxy.m4a"
    else:  # image: a browser-safe JPEG/PNG preview at up to 1920px
        prev = os.path.join(tmp, "preview.png")
        r = media.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-frames:v", "1",
                       "-vf", "scale='min(1920,iw)':-2", prev])
        if r.returncode:
            raise RuntimeError("image preview failed")
        storage.upload(prev, f"{base}/preview.png", "image/png")
        asset.proxy_key = f"{base}/preview.png"
    if meta["has_audio"]:
        ctx.progress(0.85, "waveform", force=True)
        wf = os.path.join(tmp, "waveform.json")
        media.make_waveform(src, wf, meta["duration_s"] or 0)
        storage.upload(wf, f"{base}/waveform.json", "application/json")
        asset.waveform_key = f"{base}/waveform.json"
    asset.status, asset.status_detail = MediaStatus.ready, None
    db.commit()
    return {"asset_id": str(asset.id), "duration_s": meta["duration_s"], "width": meta["width"], "height": meta["height"]}


# ------------------------------------------------------------------ render.export

def handle_render_export(ctx: Ctx, tmp: str):
    db = ctx.db
    exp = db.get(Export, uuid.UUID(ctx.job.payload["export_id"]))
    if exp is None:
        raise Permanent("export record missing")
    sv = db.scalar(select(SequenceVersion).where(SequenceVersion.sequence_id == exp.sequence_id,
                                                 SequenceVersion.version == exp.sequence_version))
    if sv is None:
        raise Permanent("sequence version missing")
    tl = Timeline.model_validate(sv.timeline)
    if tl.duration_frames / tl.fps > get_settings().max_export_seconds:
        raise Permanent("timeline exceeds maximum export duration")
    ids = tl.asset_ids()
    rows = db.scalars(select(MediaAsset).where(MediaAsset.id.in_(ids), MediaAsset.project_id == exp.project_id,
                                               MediaAsset.workspace_id == exp.workspace_id,
                                               MediaAsset.deleted_at.is_(None))).all()
    by_id = {a.id: a for a in rows}
    missing = [str(i) for i in ids if i not in by_id or by_id[i].status != MediaStatus.ready]
    if missing:
        raise Permanent(f"media not available: {', '.join(missing)}")
    infos = {}
    for n, a in enumerate(rows):
        ctx.progress(0.02 + 0.08 * n / max(1, len(rows)), "fetching media", force=True)
        p = os.path.join(tmp, f"{a.id}{os.path.splitext(a.filename)[1].lower()}")
        storage.download(a.storage_key, p)  # final renders always use originals, never proxies
        infos[a.id] = AssetInfo(path=p, kind=a.kind, has_audio=bool(a.has_audio), has_video=bool(a.has_video),
                                duration_s=a.duration_s)
    ow, oh = preset_dimensions(tl, exp.preset)
    out = os.path.join(tmp, "export.mp4")
    argv, dur = compile_ffmpeg(tl, infos, out, ow, oh, crf=EXPORT_PRESETS[exp.preset]["crf"])
    ctx.progress(0.1, "rendering", force=True)
    proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stderr_buf: list[str] = []
    t_err = threading.Thread(target=lambda: stderr_buf.extend(proc.stderr), daemon=True)
    t_err.start()
    try:
        for line in proc.stdout:  # real progress from ffmpeg -progress
            if line.startswith("out_time_us="):
                try:
                    us = int(line.split("=", 1)[1])
                except ValueError:
                    continue
                ctx.progress(0.1 + 0.8 * min(1.0, us / 1e6 / dur), "rendering")
    except Cancelled:
        proc.kill()
        raise
    rc = proc.wait()
    t_err.join(timeout=5)
    if rc != 0:
        raise RuntimeError("ffmpeg render failed: " + "".join(stderr_buf)[-800:])
    ctx.progress(0.92, "validating output", force=True)
    report = media.validate_output(out, width=ow, height=oh, fps=tl.fps, duration_s=dur)
    exp.validation = report
    if not report["ok"]:
        db.commit()
        raise Permanent(f"output failed validation: {[k for k, v in report['checks'].items() if not v]}")
    ctx.progress(0.95, "uploading", force=True)
    key = f"ws/{exp.workspace_id}/proj/{exp.project_id}/exports/{exp.id}.mp4"
    storage.upload(out, key, "video/mp4")
    exp.output_key, exp.output_size_bytes = key, os.path.getsize(out)
    db.commit()
    return {"export_id": str(exp.id), "duration_s": dur, "width": ow, "height": oh, "bytes": exp.output_size_bytes}


HANDLERS = {"media.process": handle_media_process, "render.export": handle_render_export}


def process_one(worker_id: str, queues: list[str]) -> bool:
    s = get_settings()
    db = session_factory()()
    try:
        job = jobs.claim(db, worker_id, queues, s.job_lease_seconds)
        if not job:
            return False
        log.info(f"claimed job {job.id} kind={job.kind} attempt={job.attempts}")
        os.makedirs(s.scratch_dir, exist_ok=True)
        tmp = tempfile.mkdtemp(prefix=f"job-{job.id}-", dir=s.scratch_dir)
        ctx = Ctx(db, job, worker_id)
        try:
            result = HANDLERS[job.kind](ctx, tmp)
            db.refresh(job)
            jobs.finish(db, job, result=result)
            log.info(f"job {job.id} succeeded")
        except Cancelled:
            db.rollback(); db.refresh(job)
            jobs.fail(db, job, "cancelled by user", retryable=False)
            log.info(f"job {job.id} cancelled")
        except Permanent as e:
            db.rollback(); db.refresh(job)
            _mark_media_failed(db, job, str(e))
            jobs.fail(db, job, str(e), retryable=False)
            log.warning(f"job {job.id} failed permanently: {e}")
        except Exception as e:  # noqa: BLE001 — transient: storage timeout, ffmpeg crash, etc.
            db.rollback(); db.refresh(job)
            jobs.fail(db, job, f"{type(e).__name__}: {e}", retryable=True)
            if job.status.value == "failed":
                _mark_media_failed(db, job, str(e))
            log.exception(f"job {job.id} error")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        return True
    finally:
        db.close()


def _mark_media_failed(db, job: Job, msg: str):
    if job.kind == "media.process":
        a = db.get(MediaAsset, uuid.UUID(job.payload["asset_id"]))
        if a and a.status not in (MediaStatus.rejected, MediaStatus.ready):
            a.status, a.status_detail = MediaStatus.failed, msg[:500]
            db.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--queues", default="media,render")
    ap.add_argument("--once", action="store_true", help="drain available jobs then exit (tests)")
    a = ap.parse_args()
    queues = a.queues.split(",")
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    log.info(f"worker {worker_id} started queues={queues}")
    while not stop.is_set():
        with open(ALIVE_FILE, "w") as f:
            f.write(str(time.time()))
        did = process_one(worker_id, queues)
        if a.once and not did:
            break
        if not did:
            stop.wait(get_settings().worker_poll_seconds)
    log.info("worker stopped")


if __name__ == "__main__":
    main()
