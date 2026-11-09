"""The Growth automation cycle for one workspace. Runs as the `growth.cycle` job (button) and every ~2 hours from the worker.

Always: refresh tracked channels, record measured outcomes, move authorised uploads forward.
Semi-automatic / Autonomous (with the module switched on): keep a few fresh ideas in the plan, draft their blueprints.
Autonomous only: produce videos whose blueprints are complete (still lands in Review — a person approves).
Uploading to YouTube ALWAYS needs a per-video Publish click, or the workspace-wide "publish authorised" switch plus an approved video."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import growth_engine as ge, jobs
from .models import ContentItem, Export, GrowthChannel, GrowthSettings, Job, JobStatus, Role, Sequence, WorkspaceMember

log = logging.getLogger("growth")
CYCLE_EVERY = timedelta(hours=2)
MAX_OPEN_IDEAS = 3


def _owner(db: Session, ws_id):
    return db.scalar(select(WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == ws_id, WorkspaceMember.role == Role.owner).limit(1))


def advance_publishing(db: Session, ws_id) -> list[str]:
    """Scheduled items: once the export is rendered and the time has come, start the YouTube upload; when it finishes, mark Published."""
    notes, now = [], datetime.now(timezone.utc)
    for it in db.scalars(select(ContentItem).where(ContentItem.workspace_id == ws_id, ContentItem.status == "scheduled")).all():
        pub = dict((it.blueprint or {}).get("publish") or {})
        if not pub.get("export_id"):
            continue
        if pub.get("upload_job_id"):
            j = db.get(Job, uuid.UUID(pub["upload_job_id"]))
            if j and j.status == JobStatus.succeeded and (j.result or {}).get("id"):
                it.youtube_video_id, it.status = j.result["id"], "published"
                pub["url"] = j.result.get("url")
                notes.append(f"published {it.title!r}")
            elif j and j.status in (JobStatus.failed, JobStatus.cancelled):
                it.status = "approved"
                pub.pop("upload_job_id", None)
                pub["error"] = j.error or "Upload failed"
                notes.append(f"upload failed for {it.title!r}")
            it.blueprint = {**it.blueprint, "publish": pub}
            continue
        when = datetime.fromisoformat(pub["when"]) if pub.get("when") else None
        if when and when > now:
            continue
        e = db.get(Export, uuid.UUID(pub["export_id"]))
        ej = db.get(Job, e.job_id) if e else None
        if not e or (ej and ej.status in (JobStatus.failed, JobStatus.cancelled)):
            it.status = "approved"
            pub["error"] = "The export failed — open the project, fix it and publish again"
            it.blueprint = {**it.blueprint, "publish": pub}
            continue
        if not (ej and ej.status == JobStatus.succeeded and e.output_key):
            continue
        meta = {"title": pub.get("title") or it.title[:100], "description": pub.get("description", ""), "tags": pub.get("tags", []),
                "privacy": pub.get("privacy", "private"), "made_for_kids": bool(pub.get("made_for_kids")),
                "ai_altered": bool(pub.get("ai_altered", True)), "category_id": "22"}
        j = jobs.enqueue(db, workspace_id=ws_id, project_id=it.project_id, created_by=uuid.UUID(pub["user_id"]), kind="youtube.upload",
                         payload={"export_id": pub["export_id"], "user_id": pub["user_id"], "meta": meta},
                         idempotency_key=f"gup:{it.id}:{pub['export_id']}", max_attempts=2)
        pub["upload_job_id"] = str(j.id)
        it.blueprint = {**it.blueprint, "publish": pub}
        notes.append(f"uploading {it.title!r}")
    db.commit()
    return notes


def run_cycle(db: Session, ws_id, actor=None) -> dict:
    st = ge.settings_for(db, ws_id)
    mods = st.modules or {}
    out = {"synced": 0, "errors": [], "outcomes": 0, "ideas": 0, "blueprints": 0, "produced": 0, "publishing": []}
    for c in (db.scalars(select(GrowthChannel).where(GrowthChannel.workspace_id == ws_id)).all() if mods.get("research", True) else []):
        try:
            ge.sync_channel(db, c)
            out["synced"] += 1
        except ge.GrowthError as e:
            out["errors"].append(f"{c.title}: {e}")
    db.commit()
    if mods.get("performance", True):
        out["outcomes"] = ge.record_outcomes(db, ws_id)
    out["publishing"] = advance_publishing(db, ws_id)
    actor = actor or _owner(db, ws_id)
    if st.mode == "assisted" or actor is None:
        return out
    # semi / autonomous: keep the plan stocked with evidence-backed ideas
    open_ideas = db.scalars(select(ContentItem).where(ContentItem.workspace_id == ws_id, ContentItem.status.in_(["idea", "research", "script"]))).all()
    if mods.get("recommend") and len(open_ideas) < MAX_OPEN_IDEAS:
        try:
            recs = ge.recommend(db, ws_id).get("candidates", [])
        except ge.GrowthError:
            recs = []
        have = {i.title.lower() for i in db.scalars(select(ContentItem).where(ContentItem.workspace_id == ws_id)).all()}
        for r in recs:
            if len(open_ideas) >= MAX_OPEN_IDEAS:
                break
            title = (r.get("title_suggestions") or [r.get("topic", "")])[0]
            if not title or title.lower() in have:
                continue
            it = ContentItem(workspace_id=ws_id, created_by=actor, title=title[:200], fmt=r.get("format", "long"), status="idea",
                             recommendation=r, blueprint={}, prediction={}, outcome={}, notes="Added by the Growth automation")
            db.add(it)
            open_ideas.append(it)
            out["ideas"] += 1
        db.commit()
    if mods.get("script"):
        from .tools.providers import ProviderError, llm_ready
        for it in open_ideas:
            if (it.blueprint or {}).get("scenes"):
                continue
            try:
                it.blueprint = ge.blueprint_ai(it.title, it.fmt, it.recommendation or {}, "") if llm_ready() else \
                    ge.blueprint_template(it.title, it.fmt, (it.recommendation or {}).get("topic") or it.title)
            except ProviderError as e:
                out["errors"].append(f"blueprint: {e}")
                break
            it.status = "script"
            out["blueprints"] += 1
        db.commit()
    if st.mode == "autonomous" and mods.get("edit"):
        for it in open_ideas:
            bp = it.blueprint or {}
            if it.status == "script" and bp.get("scenes") and not ge.unfinished(bp):
                it.prediction = ge.predict(None, ge.latest_videos(db, ws_id, "own"), it.fmt)
                it.status = "production"
                jobs.enqueue(db, workspace_id=ws_id, created_by=actor, kind="growth.produce", payload={"item_id": str(it.id), "captions": True},
                             idempotency_key=f"produce:{it.id}:auto", max_attempts=2)
                out["produced"] += 1
        db.commit()
    if st.mode == "autonomous" and st.publish_authorized:
        # approved videos only — a human has reviewed every one of them; uploads go out as Private at the best window
        from . import youtube
        from .models import YouTubeConnection
        conn = db.scalar(select(YouTubeConnection).where(YouTubeConnection.user_id == actor))
        if conn and not youtube.missing():
            for it in db.scalars(select(ContentItem).where(ContentItem.workspace_id == ws_id, ContentItem.status == "approved")).all():
                if (it.blueprint or {}).get("publish", {}).get("error"):
                    continue
                seq = db.scalar(select(Sequence).where(Sequence.project_id == it.project_id).order_by(Sequence.created_at).limit(1))
                if not seq:
                    continue
                job = jobs.enqueue(db, workspace_id=ws_id, project_id=it.project_id, created_by=actor, kind="render.export",
                                   payload={}, idempotency_key=f"gpub-auto:{it.id}:{seq.version}", max_attempts=2)
                e = db.scalar(select(Export).where(Export.job_id == job.id))
                if e is None:
                    from .timeline import Timeline, preset_dimensions
                    tl = Timeline.model_validate(seq.timeline)
                    w, h = preset_dimensions(tl, "match")
                    e = Export(id=uuid.uuid4(), workspace_id=ws_id, project_id=it.project_id, sequence_id=seq.id, sequence_version=seq.version,
                               job_id=job.id, preset="match", settings={"width": w, "height": h, "fps": tl.fps,
                               "duration_s": tl.duration_frames / tl.fps, "video_codec": "h264", "audio_codec": "aac", "container": "mp4"})
                    db.add(e)
                    job.payload = {"export_id": str(e.id)}
                seo = (it.blueprint or {}).get("seo") or {}
                it.blueprint = {**it.blueprint, "publish": {"export_id": str(e.id), "user_id": str(actor), "privacy": "private", "made_for_kids": False,
                                "ai_altered": True, "when": None, "authorized_at": "workspace setting", "title": it.title[:100],
                                "description": (seo.get("description") or "")[:5000], "tags": (seo.get("tags") or [])[:30]}}
                it.status = "scheduled"
            db.commit()
    return out


def handle(ctx, tmp) -> dict:
    p = ctx.job.payload
    ctx.progress(0.1, "checking channels and plans", force=True)
    res = run_cycle(ctx.db, uuid.UUID(p["workspace_id"]), ctx.job.created_by)
    ctx.progress(1.0, "done", force=True)
    return res


def maybe_run_all(db: Session) -> None:
    """Called from the worker loop: workspaces with Growth set up, at most every CYCLE_EVERY, one worker at a time."""
    if not db.execute(text("select pg_try_advisory_lock(424243)")).scalar():
        return
    try:
        now = datetime.now(timezone.utc)
        for st in db.scalars(select(GrowthSettings)).all():
            last = (st.modules or {}).get("_last_cycle")
            if last and now - datetime.fromisoformat(last) < CYCLE_EVERY:
                continue
            st.modules = {**(st.modules or {}), "_last_cycle": now.isoformat()}
            db.commit()
            try:
                run_cycle(db, st.workspace_id)
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception(f"growth cycle failed for {st.workspace_id}")
        # workspaces that track channels but never opened settings
        ws_ids = set(db.scalars(select(GrowthChannel.workspace_id).distinct()).all()) - {s.workspace_id for s in db.scalars(select(GrowthSettings)).all()}
        for ws in ws_ids:
            ge.settings_for(db, ws)
            db.commit()
    finally:
        db.execute(text("select pg_advisory_unlock(424243)"))
        db.commit()
