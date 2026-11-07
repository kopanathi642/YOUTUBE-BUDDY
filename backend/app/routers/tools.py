"""AI Generator Universe API: tool catalogue, runs (generations), history, versions, approvals and Edit in Timeline."""
import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs, storage
from ..db import get_db
from ..deps import load_project, ser_asset, ser_job
from ..security import require_member
from ..models import Generation, Job, MediaAsset, MediaStatus, Project, Role, Sequence, SequenceVersion, User
from ..config import get_settings
from ..security import ai_limiter, audit, current_user
from ..timeline import Timeline
from ..tools.registry import STUDIOS, TOOLS, keys, public, status
from ..tools.run import estimate_cost

router = APIRouter(tags=["ai-tools"])


@router.get("/ai/tools")
def catalogue(user: User = Depends(current_user)):
    k = keys()
    tools = [public(t, k) for t in TOOLS.values()]
    counts = {s: sum(1 for t in tools if t["status"]["state"] == s) for s in ("ready", "needs_key", "unbuilt")}
    return {"studios": STUDIOS, "tools": tools, "keys": k, "counts": counts}


@router.get("/public/studios")
def public_studios():
    """Signed-out landing page: studios with real live/total tool counts. Only names of tools that work right now."""
    k = keys()
    out = []
    for st in STUDIOS:
        ts = [t for t in TOOLS.values() if t["studio"] == st["id"]]
        live = [t["name"] for t in ts if status(t, k)["state"] == "ready"]
        out.append({**st, "total": len(ts), "live": len(live), "live_tools": live})
    return {"studios": out, "total": len(TOOLS), "live": sum(s["live"] for s in out)}


@router.get("/ai/tools/{tool_id}")
def tool(tool_id: str, user: User = Depends(current_user)):
    t = TOOLS.get(tool_id) or next((x for x in TOOLS.values() if x["slug"] == tool_id), None)
    if not t:
        raise HTTPException(404, "No such tool")
    return public(t)


@router.get("/ai/workflow-templates")
def templates(user: User = Depends(current_user)):
    from ..tools.pipelines import TEMPLATES
    return [{"id": k, **v} for k, v in TEMPLATES.items()]


class RunIn(BaseModel):
    params: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(None, max_length=200)
    parent_id: uuid.UUID | None = None


def _check_params(db: Session, t: dict, params: dict, workspace_id) -> dict:
    out = {}
    specs = {p["key"]: p for p in t["params"]}
    for k, v in params.items():
        if k not in specs and k not in ("tool_params",):
            continue  # ignore unknown keys
        out[k] = v
    for k, p in specs.items():
        v = out.get(k, p.get("default"))
        if v is not None:
            out[k] = v
        if p.get("required") and (v is None or v == "" or v == [] or v == {}):
            raise HTTPException(422, f"“{p['label']}” is required")
        if v is None:
            continue
        if p["type"] in ("prompt", "text", "longtext") and isinstance(v, str) and len(v) > int(p.get("max") or 4000):
            raise HTTPException(422, f"“{p['label']}” is too long")
        if p["type"] in ("media", "media_multi"):
            ids = v if isinstance(v, list) else [v]
            if p["type"] == "media_multi" and p.get("max_items") and len(ids) > p["max_items"]:
                raise HTTPException(422, f"At most {p['max_items']} files for “{p['label']}”")
            for x in ids:
                try:
                    a = db.get(MediaAsset, uuid.UUID(str(x)))
                except ValueError:
                    raise HTTPException(422, "Invalid file id")
                if not a or a.deleted_at or a.workspace_id != workspace_id:
                    raise HTTPException(404, "File not found")
                if a.status != MediaStatus.ready:
                    raise HTTPException(409, f"“{a.filename}” is still processing")
                acc = p.get("accept") or []
                if acc and a.kind not in acc:
                    raise HTTPException(422, f"“{p['label']}” needs {' or '.join(acc)}, not {a.kind}")
        if p["type"] == "mask" and isinstance(v, str) and len(v) > 12_000_000:
            raise HTTPException(422, "Mask too large")
        if p["type"] in ("slider", "stepper") and isinstance(v, (int, float)):
            if ("min" in p and v < p["min"]) or ("max" in p and v > p["max"]):
                raise HTTPException(422, f"“{p['label']}” must be between {p.get('min')} and {p.get('max')}")
        if p["type"] in ("chips", "aspect", "camera_move", "lens", "lighting", "style") and p.get("options") and v not in p["options"]:
            raise HTTPException(422, f"“{p['label']}”: unsupported choice {v}")
    bg = out.get("background")
    if isinstance(bg, dict) and bg.get("type") == "asset":
        a = db.get(MediaAsset, uuid.UUID(str(bg.get("asset_id"))))
        if not a or a.workspace_id != workspace_id or a.status != MediaStatus.ready:
            raise HTTPException(404, "Background file not found")
    if t["id"] in ("111", "118") and isinstance(out.get("graph"), dict):
        from ..tools.pipelines import validate_graph
        from ..tools.run import ToolError
        try:
            validate_graph(out["graph"])
        except ToolError as e:
            raise HTTPException(422, str(e))
    if t["id"] == "116" and out.get("tool") not in TOOLS:
        raise HTTPException(422, "Choose a tool to run")
    return out




def _check_ai_budget(db: Session, workspace_id, est: float) -> None:
    """Paid AI runs only within the plan's monthly credit, a per-workspace daily abuse cap and a platform-wide monthly wall,
    so pricing always covers the provider bill (docs/COST_MODEL.md)."""
    from datetime import datetime, timezone
    from sqlalchemy import func
    from ..billing import active_plan, ai_credit_inr, ai_spent_inr
    from ..models import Workspace
    s = get_settings()
    if s.ai_daily_budget_usd <= 0 or s.ai_monthly_budget_usd <= 0:
        raise HTTPException(403, "Paid AI models are switched off on this server")
    ws = db.get(Workspace, workspace_id)
    plan = active_plan(ws)
    credit, spent = ai_credit_inr(ws), ai_spent_inr(db, workspace_id)
    est_inr = est * s.usd_inr
    if credit <= 0:
        raise HTTPException(402, "Premium AI models come with the Creator and Pro plans. The free AI tools keep working — "
                                 "upgrade in Settings → Plans to use this one.")
    if spent + est_inr > credit:
        up = " Upgrade to Pro for more." if plan != "pro" else ""
        raise HTTPException(429, f"Your premium AI credit is used up: ₹{spent:.0f} of ₹{credit:.0f} in the last 30 days, and this run "
                                 f"costs about ₹{est_inr:.0f}. It frees up as older runs pass 30 days.{up} Free AI tools keep working.")
    day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    runs, spent_day = db.execute(select(func.count(), func.coalesce(func.sum(Generation.est_cost_usd), 0.0)).where(
        Generation.workspace_id == workspace_id, Generation.created_at >= day, Generation.est_cost_usd.isnot(None),
        Generation.status != "canceled")).one()
    if runs >= s.ai_daily_paid_runs or float(spent_day) + est > s.ai_daily_budget_usd:
        raise HTTPException(429, "Daily safety limit for premium AI reached on this workspace. It resets at 05:30 IST.")
    month = day.replace(day=1)
    platform = db.scalar(select(func.coalesce(func.sum(Generation.est_cost_usd), 0.0)).where(
        Generation.created_at >= month, Generation.est_cost_usd.isnot(None), Generation.status != "canceled")) or 0.0
    if float(platform) + est > s.ai_monthly_budget_usd:
        raise HTTPException(429, "Premium AI is paused for the rest of this month. All free AI tools keep working.")


def ser_gen(db: Session, g: Generation, full: bool = True) -> dict:
    t = TOOLS.get(g.tool_id, {})
    job = db.get(Job, g.job_id) if g.job_id else None
    assets = []
    if g.output_asset_ids:
        rows = {str(a.id): a for a in db.scalars(select(MediaAsset).where(MediaAsset.id.in_([uuid.UUID(x) for x in g.output_asset_ids])))}
        assets = [ser_asset(rows[x]) for x in g.output_asset_ids if x in rows and not rows[x].deleted_at]
    params = dict(g.params or {})
    if not full and isinstance(params.get("mask"), str):
        params["mask"] = "(mask)"
    res = g.result
    if not full and isinstance(res, dict):
        res = {k: v for k, v in res.items() if k in ("kind", "sequence_ids", "files", "summary", "verdict", "bpm", "answer", "title")}
    files = [{**f, "url": storage.signed_get(f["key"], f["name"])} for f in ((g.result or {}).get("files") or [])]
    return {"id": str(g.id), "tool_id": g.tool_id, "tool_name": t.get("name"), "studio": t.get("studio"), "project_id": str(g.project_id),
            "status": g.status, "engine": g.engine, "model": g.model, "params": params, "version": g.version, "root_id": str(g.root_id or g.id),
            "parent_id": g.parent_id and str(g.parent_id), "outputs": assets, "result": res, "files": files, "error": g.error,
            "est_cost_usd": g.est_cost_usd, "rating": g.rating, "created_at": g.created_at.isoformat(), "job": ser_job(job)}


@router.post("/projects/{project_id}/ai/tools/{tool_id}/run", status_code=201)
def run(project_id: uuid.UUID, tool_id: str, body: RunIn, request: Request, user: User = Depends(current_user),
        db: Session = Depends(get_db)):
    p = load_project(db, user, project_id, Role.editor)
    t = TOOLS.get(tool_id)
    if not t:
        raise HTTPException(404, "No such tool")
    ai_limiter.check(f"ai:{user.id}")
    st = status(t)
    premium = body.model and t["engine"]["type"] == "local" and body.model in {m["id"] for m in t["engine"].get("models", [])}
    if st["state"] == "unbuilt":
        raise HTTPException(409, st["detail"])
    if st["state"] == "needs_key" or (premium and not keys()["fal"]):
        raise HTTPException(409, "Not available yet — the server needs " + ", ".join(st["needs"] or ["FAL_KEY"]))
    models = t["engine"].get("models") or []
    if body.model and body.model not in {m["id"] for m in models}:
        raise HTTPException(422, "Unknown model for this tool")
    params = _check_params(db, t, body.params, p.workspace_id)
    if t.get("consent") and not params.get("_consent"):
        raise HTTPException(422, "Confirm you have the right to use this person's face or voice")
    parent = None
    if body.parent_id:
        parent = db.get(Generation, body.parent_id)
        if not parent or parent.workspace_id != p.workspace_id or parent.tool_id != tool_id:
            raise HTTPException(404, "Previous version not found")
    root = (parent.root_id or parent.id) if parent else None
    version = 1
    if root:
        version = 1 + max(g.version for g in db.scalars(select(Generation).where((Generation.root_id == root) | (Generation.id == root))))
    model = body.model or (models[0]["id"] if models and t["engine"]["type"] != "local" else None)
    paid = t["engine"]["type"] in ("fal", "llm", "youtube") or (t["engine"]["type"] == "pipeline" and t["engine"].get("needs")) or premium
    from ..tools.providers import llm_local
    if t["engine"]["type"] == "llm" and llm_local() and not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")):
        paid = False   # self-hosted writing model: no per-run bill, so it doesn't use the plan's premium credit
        if (params.get("language") or "en") not in ("en", "auto"):
            raise HTTPException(422, "The free writing model on this server writes English only — other languages need a Claude or OpenAI key")
    # Duplicate protection (a double click must never pay twice): an explicit Idempotency-Key header returns the first run;
    # without one, the same run by the same person that is still queued/running from the last 15 s is returned instead.
    idem = request.headers.get("idempotency-key")
    idem_key = f"tool:{user.id}:{idem[:80]}" if idem else None
    if idem_key:
        prev_job = db.scalar(select(Job).where(Job.workspace_id == p.workspace_id, Job.idempotency_key == idem_key))
        if prev_job and (prev := db.scalar(select(Generation).where(Generation.job_id == prev_job.id))):
            return ser_gen(db, prev)
    else:
        from datetime import datetime, timedelta, timezone
        recent = db.scalars(select(Generation).where(
            Generation.project_id == p.id, Generation.created_by == user.id, Generation.tool_id == tool_id,
            Generation.status.in_(("queued", "running")), Generation.created_at >= datetime.now(timezone.utc) - timedelta(seconds=15))).all()
        for prev in recent:
            if prev.params == params and prev.model == model:
                return ser_gen(db, prev)
    est = estimate_cost(t, model, params) if paid else None   # only paid runs carry a cost; spend totals sum exactly these
    if paid:
        est = est if est is not None else get_settings().paid_run_floor_usd   # unknown price still counts against the credit
        _check_ai_budget(db, p.workspace_id, est)
    g = Generation(workspace_id=p.workspace_id, project_id=p.id, created_by=user.id, tool_id=tool_id, engine=t["engine"]["type"],
                   model=model, params=params, status="queued", parent_id=parent and parent.id, version=version,
                   output_asset_ids=[], est_cost_usd=est)
    db.add(g)
    db.flush()
    g.root_id = root or g.id
    j = jobs.enqueue(db, workspace_id=p.workspace_id, project_id=p.id, created_by=user.id, kind="ai.tool",
                     payload={"generation_id": str(g.id)}, idempotency_key=idem_key, max_attempts=1 if paid else 2)
    g.job_id = j.id
    audit(db, request, "ai.tool.run", user=user, workspace_id=p.workspace_id, target_type="generation", target_id=g.id,
          tool_id=tool_id, model=model, est_cost_usd=g.est_cost_usd)
    db.commit()
    return ser_gen(db, g)


@router.get("/projects/{project_id}/generations")
def list_project(project_id: uuid.UUID, tool_id: str | None = None, limit: int = 40, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    p = load_project(db, user, project_id)
    q = select(Generation).where(Generation.project_id == p.id)
    if tool_id:
        q = q.where(Generation.tool_id == tool_id)
    return [ser_gen(db, g, full=False) for g in db.scalars(q.order_by(Generation.created_at.desc()).limit(min(limit, 100)))]


@router.get("/workspaces/{workspace_id}/generations")
def list_ws(workspace_id: uuid.UUID, tool_id: str | None = None, studio: str | None = None, limit: int = 40,
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, user, workspace_id)
    q = select(Generation).where(Generation.workspace_id == workspace_id)
    if tool_id:
        q = q.where(Generation.tool_id == tool_id)
    if studio:
        q = q.where(Generation.tool_id.in_([t["id"] for t in TOOLS.values() if t["studio"] == studio]))
    return [ser_gen(db, g, full=False) for g in db.scalars(q.order_by(Generation.created_at.desc()).limit(min(limit, 100)))]


def _load_gen(db: Session, user: User, gid: uuid.UUID, role: Role = Role.viewer) -> Generation:
    g = db.get(Generation, gid)
    if not g:
        raise HTTPException(404, "Not found")
    require_member(db, user, g.workspace_id, role)
    return g


@router.get("/generations/{gid}")
def get_gen(gid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    g = _load_gen(db, user, gid)
    out = ser_gen(db, g)
    out["versions"] = [{"id": str(v.id), "version": v.version, "status": v.status, "created_at": v.created_at.isoformat()}
                       for v in db.scalars(select(Generation).where(Generation.root_id == (g.root_id or g.id)).order_by(Generation.version))]
    return out


class RateIn(BaseModel):
    rating: int = Field(ge=1, le=5)


@router.post("/generations/{gid}/rate")
def rate(gid: uuid.UUID, body: RateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    g = _load_gen(db, user, gid, Role.editor)
    g.rating = body.rating
    db.commit()
    return {"ok": True}


class ApproveIn(BaseModel):
    node_id: str = Field(max_length=64)


@router.post("/generations/{gid}/approve")
def approve(gid: uuid.UUID, body: ApproveIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    g = _load_gen(db, user, gid, Role.editor)
    st = (g.result or {}).get("state") or {}
    if g.status != "awaiting_approval" or st.get("waiting") != body.node_id:
        raise HTTPException(409, "This workflow is not waiting for that approval")
    g.result = {**g.result, "state": {**st, "approved": list(set(st.get("approved") or []) | {body.node_id}), "waiting": None}}
    g.status = "queued"
    j = jobs.enqueue(db, workspace_id=g.workspace_id, project_id=g.project_id, created_by=user.id, kind="ai.tool",
                     payload={"generation_id": str(g.id)}, max_attempts=1)
    g.job_id = j.id
    audit(db, request, "ai.workflow.approve", user=user, workspace_id=g.workspace_id, target_type="generation", target_id=g.id, node=body.node_id)
    db.commit()
    return ser_gen(db, g)


class TimelineIn(BaseModel):
    sequence_id: uuid.UUID | None = None


AUDIO_TRACK = {"042": "a2", "043": "a3", "044": "a3", "046": "a2"}


@router.post("/generations/{gid}/timeline")
def to_timeline(gid: uuid.UUID, body: TimelineIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Edit in Timeline: place this generation's outputs at the end of the right tracks of a sequence (new versions are kept)."""
    g = _load_gen(db, user, gid, Role.editor)
    if g.status != "succeeded":
        raise HTTPException(409, "Wait until the generation has finished")
    seqs = (g.result or {}).get("sequence_ids") or []
    if seqs and not g.output_asset_ids:
        return {"project_id": str(g.project_id), "sequence_id": seqs[0], "placed": 0}
    assets = [a for a in db.scalars(select(MediaAsset).where(MediaAsset.id.in_([uuid.UUID(x) for x in g.output_asset_ids]))) if not a.deleted_at]
    if not assets:
        raise HTTPException(409, "This result has no media to place on a timeline")
    if any(a.status != MediaStatus.ready for a in assets):
        raise HTTPException(409, "The new media is still being prepared — try again in a moment")
    if body.sequence_id:
        s = db.get(Sequence, body.sequence_id)
        if not s or s.project_id != g.project_id:
            raise HTTPException(404, "Sequence not found")
    else:
        s = db.scalar(select(Sequence).where(Sequence.project_id == g.project_id).order_by(Sequence.created_at))
    if not s:
        raise HTTPException(404, "This project has no sequence")
    db.refresh(s, with_for_update=True)
    tl = dict(s.timeline)
    fps = tl["fps"]
    tracks = {t["id"]: t for t in tl["tracks"]}
    end = lambda tr: max((c["start"] + _len(c) for c in tr["clips"]), default=0)  # noqa: E731
    vend = max((end(t) for t in tl["tracks"] if t["kind"] == "video"), default=0)
    placed = 0
    for a in assets:
        if a.kind in ("video", "image"):
            tr = tracks.get("v1") or next(t for t in tl["tracks"] if t["kind"] == "video")
            frames = int(round((a.duration_s or 5) * fps)) if a.kind == "video" else 5 * fps
            start = max(vend, end(tr))
            tr["clips"].append({"id": f"gen{uuid.uuid4().hex[:10]}", "asset_id": str(a.id), "start": start, "in": 0, "out": max(2, frames)})
            vend = start + max(2, frames)
        else:
            tid = AUDIO_TRACK.get(g.tool_id, "a1")
            tr = tracks.get(tid) or next(t for t in tl["tracks"] if t["kind"] == "audio")
            frames = int(round((a.duration_s or 1) * fps))
            tr["clips"].append({"id": f"gen{uuid.uuid4().hex[:10]}", "asset_id": str(a.id), "start": end(tr), "in": 0, "out": max(2, frames)})
        placed += 1
    tl = Timeline.model_validate(tl).model_dump(by_alias=True, mode="json")
    s.version += 1
    s.timeline = tl
    db.add(SequenceVersion(sequence_id=s.id, version=s.version, timeline=tl, saved_by=user.id))
    audit(db, request, "ai.timeline.place", user=user, workspace_id=g.workspace_id, target_type="sequence", target_id=s.id, generation=str(g.id))
    db.commit()
    return {"project_id": str(g.project_id), "sequence_id": str(s.id), "placed": placed, "version": s.version}


def _len(c: dict) -> int:
    import math
    return max(1, math.floor((c["out"] - c["in"]) / c.get("speed", 1) + 0.5))


_ = Project
