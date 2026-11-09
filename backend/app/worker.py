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

from . import analysis, jobs, media, storage
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
        ext, ctype = (".webm", "video/webm") if meta.get("has_alpha") else (".mp4", "video/mp4")
        proxy = os.path.join(tmp, "proxy" + ext)
        media.make_proxy(src, proxy, meta)
        storage.upload(proxy, f"{base}/proxy{ext}", ctype)
        asset.proxy_key = f"{base}/proxy{ext}"
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
    if meta["kind"] in ("video", "audio"):
        # Analyse the proxy for video (much faster, same content); originals for audio-only.
        src_an = proxy if meta["kind"] == "video" else src
        try:
            keep = {k: v for k, v in (asset.analysis or {}).items() if k in ("generation", "ai_generated", "transcript", "translations", "stock")}
            asset.analysis = {**analysis.analyze(src_an, meta, lambda p, s: ctx.progress(0.88 + 0.1 * p, s, force=True)), **keep}
        except Cancelled:
            raise
        except Exception as e:  # analysis is helpful, not essential: never fail the upload over it
            asset.analysis = {**(asset.analysis or {}), "version": 1, "error": f"{type(e).__name__}"}
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
                                duration_s=a.duration_s, width=a.width, height=a.height)
    ow, oh = preset_dimensions(tl, exp.preset)
    out = os.path.join(tmp, "export.mp4")
    from .billing import active_plan
    from .models import Workspace
    wm = None
    if active_plan(ctx.db.get(Workspace, exp.workspace_id)) == "free" and get_settings().free_plan_watermark:
        from .titles import render_watermark_png
        wm = os.path.join(tmp, "watermark.png")
        render_watermark_png(f"Made with {get_settings().brand_name}", wm)
    exp.settings = {**exp.settings, "watermark": bool(wm)}
    argv, dur = compile_ffmpeg(tl, infos, out, ow, oh, crf=EXPORT_PRESETS[exp.preset]["crf"], workdir=tmp, watermark=wm)
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
    if ctx.job.created_by:   # a friend's first finished export earns their inviter free Creator days
        from .billing import reward_referral
        from .models import User
        reward_referral(db, db.get(User, ctx.job.created_by))
    db.commit()
    return {"export_id": str(exp.id), "duration_s": dur, "width": ow, "height": oh, "bytes": exp.output_size_bytes}


# ------------------------------------------------------------------ media.derive (stabilize / remove background / remove object)

def handle_media_derive(ctx: Ctx, tmp: str):
    """Make a new media file from an existing one, then process it like a normal upload. Source stays untouched."""
    db = ctx.db
    p = ctx.job.payload
    new = db.get(MediaAsset, uuid.UUID(p["asset_id"]))
    src_a = db.get(MediaAsset, uuid.UUID(p["source_id"]))
    if not new or not src_a or src_a.deleted_at:
        raise Permanent("source media no longer exists")
    src = os.path.join(tmp, "src" + os.path.splitext(src_a.filename)[1].lower())
    ctx.progress(0.02, "downloading", force=True)
    storage.download(src_a.storage_key, src)
    out = os.path.join(tmp, "derived" + os.path.splitext(new.storage_key)[1])
    from . import derive
    if p["op"] == "stabilize":
        derive.stabilize(src, out, src_a.has_audio, lambda f, s: ctx.progress(0.05 + 0.6 * f, s))
    elif p["op"] == "remove_bg":
        derive.remove_background(src, out, src_a, lambda f, s: ctx.progress(0.05 + 0.6 * f, s))
    elif p["op"] == "remove_object":
        try:
            derive.remove_object(src, out, src_a.has_audio, src_a.width, src_a.height, p.get("boxes") or [],
                                 lambda f, s: ctx.progress(0.05 + 0.6 * f, s))
        except ValueError as e:
            raise Permanent(str(e))
    else:
        raise Permanent(f"unknown operation {p['op']}")
    new.size_bytes = os.path.getsize(out)
    storage.upload(out, new.storage_key, new.declared_content_type)
    db.commit()
    sub = os.path.join(tmp, "process")
    os.makedirs(sub, exist_ok=True)
    return handle_media_process(ctx, sub)


def handle_media_import(ctx: Ctx, tmp: str):
    """Download a stock file from its provider's media host (URL resolved on the server), then process it like an upload."""
    from . import stock
    new = _load(ctx)
    ctx.progress(0.03, "downloading from stock library", force=True)
    path = os.path.join(tmp, "stock" + os.path.splitext(new.storage_key)[1])
    try:
        stock.download(ctx.job.payload["url"], path)
    except stock.StockError as e:
        raise Permanent(str(e))
    return _finish_generated(ctx, tmp, new, path)


def handle_youtube_upload(ctx: Ctx, tmp: str):
    """Publish a finished export to the user's linked YouTube channel."""
    from . import youtube
    from .models import Export, YouTubeConnection
    p = ctx.job.payload
    e = ctx.db.get(Export, uuid.UUID(p["export_id"]))
    c = ctx.db.scalar(select(YouTubeConnection).where(YouTubeConnection.user_id == uuid.UUID(p["user_id"])))
    if e is None or not e.output_key:
        raise Permanent("The export no longer exists")
    if c is None:
        raise Permanent("YouTube was disconnected — connect it again in Settings")
    try:
        ctx.progress(0.02, "connecting to YouTube", force=True)
        token = youtube.access_token(youtube.decrypt(c.refresh_token_enc))
        path = os.path.join(tmp, "video.mp4")
        ctx.progress(0.05, "fetching the export", force=True)
        storage.download(e.output_key, path)
        res = youtube.upload(token, path, p["meta"], lambda f: ctx.progress(0.1 + 0.88 * f, "uploading to YouTube"))
    except youtube.YouTubeError as x:
        raise Permanent(str(x))
    ctx.progress(1.0, "published", force=True)
    return {**res, "channel_title": c.channel_title}


# ------------------------------------------------------------------ AI: voice, transcription, translation, dubbing

MAX_TRANSCRIBE_S = 30 * 60


def _engine(fn, *a, **k):
    from .ai_engines import EngineError
    try:
        return fn(*a, **k)
    except EngineError as e:
        raise Permanent(str(e))


def _ensure_transcript(ctx: Ctx, tmp: str, asset: MediaAsset, language: str | None = None) -> dict:
    from . import ai_engines
    an = dict(asset.analysis or {})
    t = an.get("transcript")
    if t and (not language or t.get("language") == language):
        return t
    if not asset.has_audio:
        raise Permanent("This media has no audio to transcribe")
    if (asset.duration_s or 0) > MAX_TRANSCRIBE_S:
        raise Permanent("Transcription is limited to 30-minute files for now")
    src = os.path.join(tmp, "tsrc" + os.path.splitext(asset.filename)[1].lower())
    ctx.progress(0.05, "downloading", force=True)
    storage.download(asset.storage_key, src)
    wav = os.path.join(tmp, "speech16k.wav")
    r = media.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", wav])
    if r.returncode:
        raise RuntimeError("audio extraction failed")
    ctx.progress(0.15, "transcribing speech", force=True)
    t = _engine(ai_engines.transcribe, wav, language)
    an = dict(asset.analysis or {})
    an["transcript"] = t
    asset.analysis = an
    ctx.db.commit()
    return t


def _ensure_translation(ctx: Ctx, tmp: str, asset: MediaAsset, target: str) -> dict:
    from . import ai_engines
    t = _ensure_transcript(ctx, tmp, asset)
    cached = (asset.analysis or {}).get("translations", {}).get(target)
    if cached:
        return cached
    ctx.progress(0.5, f"translating to {ai_engines.LANG_NAMES.get(target, target)}", force=True)
    texts, engine = _engine(ai_engines.translate, [s["text"] for s in t["segments"]], t["language"], target)
    tr = {"language": target, "source_language": t["language"], "engine": engine,
          "segments": [{**s, "text": x} for s, x in zip(t["segments"], texts)]}
    an = dict(asset.analysis or {})
    an["translations"] = {**an.get("translations", {}), target: tr}
    asset.analysis = an
    ctx.db.commit()
    return tr


def _load(ctx, key="asset_id") -> MediaAsset:
    a = ctx.db.get(MediaAsset, uuid.UUID(ctx.job.payload[key]))
    if a is None or a.deleted_at:
        raise Permanent("media no longer exists")
    return a


def handle_ai_transcribe(ctx: Ctx, tmp: str):
    t = _ensure_transcript(ctx, tmp, _load(ctx), ctx.job.payload.get("language"))
    return {"language": t["language"], "segments": len(t["segments"]), "engine": t.get("engine")}


def handle_ai_translate(ctx: Ctx, tmp: str):
    tr = _ensure_translation(ctx, tmp, _load(ctx), ctx.job.payload["target"])
    return {"language": tr["language"], "segments": len(tr["segments"]), "engine": tr["engine"]}


def _finish_generated(ctx: Ctx, tmp: str, new: MediaAsset, path: str):
    new.size_bytes = os.path.getsize(path)
    storage.upload(path, new.storage_key, new.declared_content_type)
    ctx.db.commit()
    sub = os.path.join(tmp, "process")
    os.makedirs(sub, exist_ok=True)
    return handle_media_process(ctx, sub)


def handle_ai_tts(ctx: Ctx, tmp: str):
    from . import ai_engines
    new = _load(ctx)
    ctx.progress(0.1, "generating voice", force=True)
    out = os.path.join(tmp, "voice.wav")
    _engine(ai_engines.tts, ctx.job.payload["text"], ctx.job.payload["voice_id"], out)
    return _finish_generated(ctx, tmp, new, out)


def dub_to_wav(ctx: Ctx, tmp: str, src: MediaAsset, target: str, voice_id: str, out: str) -> str:
    """Transcribe -> translate -> speak each line in the target voice at its original time -> one aligned audio track."""
    from . import ai_engines
    tr = _ensure_translation(ctx, tmp, src, target)
    segs = [s for s in tr["segments"] if s["text"].strip()]
    if not segs:
        raise Permanent("No speech found to dub")
    total = src.duration_s or (segs[-1]["end"] + 1)
    parts = []
    for i, s in enumerate(segs):
        ctx.progress(0.6 + 0.3 * i / len(segs), f"voicing line {i + 1}/{len(segs)}", force=True)
        slot = max(0.4, (segs[i + 1]["start"] if i + 1 < len(segs) else total) - s["start"])
        wav = os.path.join(tmp, f"line{i}.wav")
        d = _engine(ai_engines.tts, s["text"], voice_id, wav)
        if d > slot * 1.02:  # speak faster to fit the original timing (never more than ~1.5x)
            d = _engine(ai_engines.tts, s["text"], voice_id, wav, max(0.66, slot / d * 0.98))
        parts.append((wav, s["start"]))
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    for wav, _ in parts:
        cmd += ["-i", wav]
    fl = [f"[{i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={int(st * 1000)}:all=1[d{i}]" for i, (_, st) in enumerate(parts)]
    fl.append("[0:a]" + "".join(f"[d{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts) + 1}:duration=first:normalize=0[o]")
    r = media.run(cmd + ["-filter_complex", ";".join(fl), "-map", "[o]", "-c:a", "pcm_s16le", out], timeout=1800)
    if r.returncode:
        raise RuntimeError("dub mix failed: " + r.stderr[-300:])
    return out


def handle_ai_dub(ctx: Ctx, tmp: str):
    new, src = _load(ctx), _load(ctx, "source_id")
    p = ctx.job.payload
    out = dub_to_wav(ctx, tmp, src, p["target"], p["voice_id"], os.path.join(tmp, "dub.wav"))
    return _finish_generated(ctx, tmp, new, out)


# ------------------------------------------------------------------ AI Generator Universe tools

def handle_ai_tool(ctx: Ctx, tmp: str):
    from .models import Generation
    from .tools.run import ToolError, execute
    gen = ctx.db.get(Generation, uuid.UUID(ctx.job.payload["generation_id"]))
    if gen is None:
        raise Permanent("generation no longer exists")
    try:
        return execute(ctx, gen, tmp)
    except ToolError as e:
        raise Permanent(str(e))


def _dubbing():
    from . import dubbing   # imported lazily: it pulls in the speech stack
    return dubbing


HANDLERS = {"media.process": handle_media_process, "media.derive": handle_media_derive, "media.import": handle_media_import, "youtube.upload": handle_youtube_upload, "render.export": handle_render_export,
            "ai.transcribe": handle_ai_transcribe, "ai.translate": handle_ai_translate, "ai.tts": handle_ai_tts, "ai.dub": handle_ai_dub,
            "ai.tool": handle_ai_tool,
            "growth.produce": lambda ctx, tmp: __import__("app.growth_produce", fromlist=["produce"]).produce(ctx, tmp),
            "export.zip": lambda ctx, tmp: __import__("app.routers.compose", fromlist=["handle_zip"]).handle_zip(ctx, tmp),
            "growth.cycle": lambda ctx, tmp: __import__("app.growth_cycle", fromlist=["handle"]).handle(ctx, tmp),
            "dub.prepare": lambda ctx, tmp: _dubbing().handle_prepare(ctx, tmp),
            "dub.translate": lambda ctx, tmp: _dubbing().handle_translate(ctx, tmp),
            "dub.render": lambda ctx, tmp: _dubbing().handle_render(ctx, tmp)}


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
            _mark_media_failed(db, job, "cancelled by user")
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
    if job.kind.startswith("dub."):
        from . import dubbing
        dubbing.mark_failed(db, job, msg)
        return
    if job.kind == "ai.tool":
        from .models import Generation
        g = db.get(Generation, uuid.UUID(job.payload["generation_id"]))
        if g and g.status not in ("succeeded", "awaiting_approval"):
            g.status = "canceled" if msg == "cancelled by user" else "failed"
            g.error = msg[:1000]
            db.commit()
        return
    if job.kind in ("media.process", "media.derive", "ai.tts", "ai.dub"):
        a = db.get(MediaAsset, uuid.UUID(job.payload["asset_id"]))
        if a and a.status not in (MediaStatus.rejected, MediaStatus.ready):
            a.status, a.status_detail = MediaStatus.failed, msg[:500]
            db.commit()


def models_required() -> bool:
    """Production workers verify every speech/voice/translation model before taking ANY job (MODELS_REQUIRED, on by default
    in production). Development and tests skip it unless MODELS_REQUIRED=1."""
    v = os.environ.get("MODELS_REQUIRED")
    return v.lower() in ("1", "true", "yes") if v else get_settings().env == "production"


def wait_for_models(stop: threading.Event) -> None:
    from .speech import assets
    while not stop.is_set():
        with open(ALIVE_FILE, "w") as f:
            f.write(str(time.time()))
        try:
            t0 = time.time()
            rep = assets.load_check(progress=lambda m: log.info(f"models: {m}"))
            log.info(f"models verified in {time.time() - t0:.0f}s: whisper {rep['whisper']}; {len(rep['voices'])} voices; "
                     f"{len(rep['translation'])} translation pairs — accepting jobs")
            return
        except Exception as e:  # noqa: BLE001
            log.error(f"models NOT ready, not accepting jobs yet: {e} — retrying in 5 minutes")
            stop.wait(300)


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
    if not a.once and models_required():
        wait_for_models(stop)
    agent_t = 0.0
    while not stop.is_set():
        with open(ALIVE_FILE, "w") as f:
            f.write(str(time.time()))
        did = process_one(worker_id, queues)
        if not did and not a.once and time.monotonic() - agent_t > 60:   # idle: let the background agent check in
            agent_t = time.monotonic()
            try:
                from . import agent
                with session_factory()() as adb:
                    agent.maybe_run(adb)
                from . import growth_cycle
                with session_factory()() as gdb:
                    growth_cycle.maybe_run_all(gdb)
            except Exception:  # noqa: BLE001
                log.exception("agent check failed")
        if a.once and not did:
            break
        if not did:
            stop.wait(get_settings().worker_poll_seconds)
    log.info("worker stopped")


if __name__ == "__main__":
    main()
