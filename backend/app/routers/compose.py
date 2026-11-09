"""Shorts Creative Studio support: generated graphics (backgrounds, gradients, vignette, light leak), custom layout
templates per workspace, and ZIP downloads of several finished exports. The layouts themselves are ordinary timelines
(plus a `composition` description), rendered by the normal export pipeline."""
import math
import os
import tempfile
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs, storage
from ..db import get_db
from ..deps import load_project, ser_asset, ser_job
from ..models import CompositionTemplate, Export, Job, MediaAsset, MediaStatus, Role, User
from ..security import RateLimiter, audit, current_user
from .workspaces import require_member

router = APIRouter(tags=["compose"])
gfx_limiter = RateLimiter(limit=60, window_s=600)
HEXP = r"^#[0-9a-fA-F]{6}$"


def _rgb(h: str) -> tuple[int, int, int]:
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def render_graphic(kind: str, w: int, h: int, color: str, color2: str, angle: float, strength: float, path: str) -> None:
    """Pure-Pillow still images. All are smooth, so the studio can scale them to any canvas without visible loss."""
    import numpy as np
    from PIL import Image
    c1, c2 = np.array(_rgb(color), np.float32), np.array(_rgb(color2), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    if kind == "solid":
        img = Image.new("RGB", (w, h), _rgb(color))
    elif kind == "gradient":
        a = math.radians(angle)
        u = ((xx - w / 2) * math.sin(a) - (yy - h / 2) * math.cos(a))
        u = (u - u.min()) / max(1e-6, u.max() - u.min())
        img = Image.fromarray((c1 + (c2 - c1) * u[..., None]).clip(0, 255).astype(np.uint8), "RGB")
    elif kind == "vignette":
        r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / math.sqrt(2)
        alpha = (np.clip((r - 0.35) / 0.65, 0, 1) ** 1.6) * 255 * strength
        rgba = np.zeros((h, w, 4), np.uint8)
        rgba[..., :3] = _rgb(color)
        rgba[..., 3] = alpha.astype(np.uint8)
        img = Image.fromarray(rgba, "RGBA")
    elif kind == "light_leak":
        cx, cy = w * (0.15 + 0.7 * (angle % 360) / 360), h * 0.1
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max(w, h)
        alpha = np.exp(-(d / 0.45) ** 2) * 255 * strength
        rgba = np.zeros((h, w, 4), np.uint8)
        mix = np.clip(d / 0.6, 0, 1)[..., None]
        rgba[..., :3] = (c1 * (1 - mix) + c2 * mix).clip(0, 255).astype(np.uint8)
        rgba[..., 3] = alpha.astype(np.uint8)
        img = Image.fromarray(rgba, "RGBA")
    else:  # pragma: no cover — validated by the request model
        raise ValueError(kind)
    img.save(path, "PNG")


class GraphicIn(BaseModel):
    kind: Literal["solid", "gradient", "vignette", "light_leak"]
    color: str = Field("#111111", pattern=HEXP)
    color2: str = Field("#7b61ff", pattern=HEXP)
    angle: float = Field(180, ge=0, le=360)
    strength: float = Field(0.8, ge=0, le=1)
    width: int = Field(1080, ge=16, le=3840)
    height: int = Field(1920, ge=16, le=3840)


NAMES = {"solid": "Background", "gradient": "Gradient", "vignette": "Vignette", "light_leak": "Light leak"}


@router.post("/projects/{project_id}/graphics", status_code=201)
def create_graphic(project_id: uuid.UUID, body: GraphicIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = load_project(db, user, project_id, Role.editor)
    gfx_limiter.check(f"gfx:{user.id}")
    aid = uuid.uuid4()
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "g.png")
        render_graphic(body.kind, body.width, body.height, body.color, body.color2, body.angle, body.strength, path)
        a = MediaAsset(id=aid, workspace_id=p.workspace_id, project_id=p.id, uploaded_by=user.id,
                       filename=f"{NAMES[body.kind]} {body.color}{'-' + body.color2 if body.kind in ('gradient', 'light_leak') else ''}.png",
                       kind="image", declared_content_type="image/png", size_bytes=os.path.getsize(path),
                       storage_key=f"ws/{p.workspace_id}/proj/{p.id}/media/{aid}/original.png", status=MediaStatus.processing,
                       analysis={"generation": {"source": "studio.graphic", **body.model_dump()}})
        storage.upload(path, a.storage_key, "image/png")
    db.add(a)
    db.flush()
    job = jobs.enqueue(db, workspace_id=p.workspace_id, project_id=p.id, created_by=user.id, kind="media.process",
                       payload={"asset_id": str(aid)}, idempotency_key=f"proc:{aid}")
    audit(db, request, "studio.graphic", user=user, workspace_id=p.workspace_id, target_type="media", target_id=aid, kind=body.kind)
    db.commit()
    return ser_asset(a, job)


# ------------------------------------------------------------------ custom templates
class TemplateIn(BaseModel):
    workspace_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    category: str = Field("Custom", min_length=1, max_length=60)
    data: dict


class TemplatePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    category: str | None = Field(None, min_length=1, max_length=60)
    favorite: bool | None = None
    data: dict | None = None


def ser_tpl(t: CompositionTemplate) -> dict:
    return {"id": str(t.id), "name": t.name, "category": t.category, "data": t.data, "favorite": t.favorite,
            "updated_at": t.updated_at.isoformat(), "custom": True}


def _check_data(d: dict) -> None:
    import json
    if len(json.dumps(d)) > 200_000:
        raise HTTPException(413, "Template is too large")
    if not isinstance(d.get("layers"), list) or not d["layers"] or len(d["layers"]) > 40:
        raise HTTPException(422, "A template needs between 1 and 40 layers")


@router.get("/workspaces/{workspace_id}/composition-templates")
def list_templates(workspace_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, user, workspace_id, Role.viewer)
    rows = db.scalars(select(CompositionTemplate).where(CompositionTemplate.workspace_id == workspace_id)
                      .order_by(CompositionTemplate.favorite.desc(), CompositionTemplate.updated_at.desc()).limit(200)).all()
    return [ser_tpl(t) for t in rows]


@router.post("/composition-templates", status_code=201)
def create_template(body: TemplateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, user, body.workspace_id, Role.editor)
    _check_data(body.data)
    n = db.scalar(select(CompositionTemplate.id).where(CompositionTemplate.workspace_id == body.workspace_id).offset(199).limit(1))
    if n:
        raise HTTPException(422, "A workspace can keep up to 200 custom templates")
    t = CompositionTemplate(workspace_id=body.workspace_id, created_by=user.id, name=body.name.strip(), category=body.category.strip(),
                            data=body.data, favorite=False)
    db.add(t)
    db.commit()
    return ser_tpl(t)


def _tpl(db, user, tid, role=Role.editor) -> CompositionTemplate:
    t = db.get(CompositionTemplate, tid)
    if not t:
        raise HTTPException(404, "Template not found")
    require_member(db, user, t.workspace_id, role)
    return t


@router.patch("/composition-templates/{tid}")
def patch_template(tid: uuid.UUID, body: TemplatePatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _tpl(db, user, tid)
    if body.data is not None:
        _check_data(body.data)
        t.data = body.data
    for k in ("name", "category", "favorite"):
        v = getattr(body, k)
        if v is not None:
            setattr(t, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return ser_tpl(t)


@router.post("/composition-templates/{tid}/duplicate", status_code=201)
def duplicate_template(tid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _tpl(db, user, tid)
    c = CompositionTemplate(workspace_id=t.workspace_id, created_by=user.id, name=f"{t.name} copy"[:120], category=t.category, data=t.data, favorite=False)
    db.add(c)
    db.commit()
    return ser_tpl(c)


@router.delete("/composition-templates/{tid}", status_code=204)
def delete_template(tid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _tpl(db, user, tid)
    db.delete(t)
    db.commit()


# ------------------------------------------------------------------ ZIP of several exports
class ZipIn(BaseModel):
    export_ids: list[uuid.UUID] = Field(min_length=1, max_length=24)
    name: str = Field("shorts", min_length=1, max_length=60, pattern=r"^[\w\- ]+$")


@router.post("/exports/zip", status_code=201)
def zip_exports(body: ZipIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    exps = [db.get(Export, i) for i in body.export_ids]
    if any(e is None for e in exps):
        raise HTTPException(404, "Export not found")
    for e in exps:
        load_project(db, user, e.project_id)
        j = db.get(Job, e.job_id)
        if not (j and j.status.value == "succeeded" and e.output_key):
            raise HTTPException(409, "Wait until every export has finished")
    ws = {e.workspace_id for e in exps}
    if len(ws) != 1:
        raise HTTPException(422, "Exports must come from one workspace")
    job = jobs.enqueue(db, workspace_id=exps[0].workspace_id, project_id=exps[0].project_id, created_by=user.id, kind="export.zip",
                       payload={"export_ids": [str(e.id) for e in exps], "name": body.name}, max_attempts=2)
    db.commit()
    return ser_job(job)


@router.get("/exports/zip/{job_id}")
def zip_download(job_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = db.get(Job, job_id)
    if not j or j.kind != "export.zip":
        raise HTTPException(404, "Not found")
    require_member(db, user, j.workspace_id, Role.viewer)
    if j.status.value != "succeeded":
        return {**ser_job(j), "download_url": None}
    return {**ser_job(j), "download_url": storage.signed_get(j.result["key"], filename=f"{j.payload.get('name', 'shorts')}.zip")}


def handle_zip(ctx, tmp: str) -> dict:
    """Worker: fetch each finished export and store them uncompressed (MP4 is already compressed) in one ZIP."""
    import zipfile
    db, p = ctx.db, ctx.job.payload
    out = os.path.join(tmp, "out.zip")
    names = set()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
        for n, eid in enumerate(p["export_ids"]):
            e = db.get(Export, uuid.UUID(eid))
            if e is None or not e.output_key:
                continue
            ctx.progress(0.05 + 0.85 * n / len(p["export_ids"]), f"adding {n + 1}/{len(p['export_ids'])}", force=True)
            f = os.path.join(tmp, f"{n}.mp4")
            storage.download(e.output_key, f)
            w, h = (e.settings or {}).get("width"), (e.settings or {}).get("height")
            base = f"{p.get('name', 'shorts')}-{n + 1:02d}" + (f"-{w}x{h}" if w and h else "")
            name = base + ".mp4"
            while name in names:
                name = base + f"-{len(names)}.mp4"
            names.add(name)
            z.write(f, name)
            os.remove(f)
    key = f"ws/{ctx.job.workspace_id}/zips/{ctx.job.id}.zip"
    storage.upload(out, key, "application/zip")
    ctx.progress(1.0, "ready", force=True)
    return {"key": key, "files": len(names), "size_bytes": os.path.getsize(out)}
