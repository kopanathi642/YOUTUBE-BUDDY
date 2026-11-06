import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs, storage
from ..config import get_settings
from ..db import get_db
from ..deps import load_asset, load_project, ser_asset
from ..media import MediaRejected, classify
from ..models import Job, MediaAsset, MediaStatus, Role, User
from ..security import audit, current_user, upload_limiter

router = APIRouter(tags=["media"])


class UploadInit(BaseModel):
    filename: str = Field(min_length=1, max_length=300)
    size_bytes: int = Field(gt=0)
    content_type: str = Field(max_length=120)


class PartsReq(BaseModel):
    part_numbers: list[int] = Field(min_length=1, max_length=100)


class PartDone(BaseModel):
    part_number: int = Field(ge=1, le=10000)
    etag: str = Field(max_length=200)


class CompleteReq(BaseModel):
    parts: list[PartDone] = Field(min_length=1, max_length=10000)


def _latest_jobs(db: Session, asset_ids: list[uuid.UUID]) -> dict:
    if not asset_ids:
        return {}
    rows = db.scalars(select(Job).where(Job.kind.in_(["media.process", "media.derive"]),
                                        Job.payload["asset_id"].astext.in_([str(i) for i in asset_ids]))
                      .order_by(Job.created_at)).all()
    return {uuid.UUID(j.payload["asset_id"]): j for j in rows}


def _safe_name(name: str) -> str:
    name = name.replace("\\", "/").split("/")[-1].strip()  # strip any path (traversal defence)
    return "".join(ch for ch in name if ch.isprintable())[:200] or "file"


@router.post("/projects/{project_id}/media/uploads", status_code=201)
def init_upload(project_id: uuid.UUID, body: UploadInit, request: Request, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    p = load_project(db, user, project_id, Role.editor)
    upload_limiter.check(f"up:{user.id}")
    s = get_settings()
    name = _safe_name(body.filename)
    try:
        kind = classify(name, body.content_type)
    except MediaRejected as e:
        raise HTTPException(415, str(e))
    if body.size_bytes > s.max_upload_bytes:
        raise HTTPException(413, f"File exceeds the {s.max_upload_bytes // 1024**3} GB upload limit")
    asset_id = uuid.uuid4()
    ext = name.rsplit(".", 1)[-1].lower()
    key = f"ws/{p.workspace_id}/proj/{p.id}/media/{asset_id}/original.{ext}"
    upload_id = storage.create_multipart(key, body.content_type or "application/octet-stream")
    a = MediaAsset(id=asset_id, workspace_id=p.workspace_id, project_id=p.id, uploaded_by=user.id, filename=name, kind=kind,
                   declared_content_type=body.content_type, size_bytes=body.size_bytes, storage_key=key,
                   s3_upload_id=upload_id, status=MediaStatus.uploading)
    db.add(a)
    audit(db, request, "media.upload_start", user=user, workspace_id=p.workspace_id, target_type="media", target_id=a.id,
          size=body.size_bytes, kind=kind)
    db.commit()
    part_size = s.multipart_part_size
    while math.ceil(body.size_bytes / part_size) > 10000:
        part_size *= 2
    return {"asset": ser_asset(a), "part_size": part_size, "part_count": math.ceil(body.size_bytes / part_size)}


def _uploading(db, user, asset_id) -> MediaAsset:
    a = load_asset(db, user, asset_id, Role.editor)
    if a.status != MediaStatus.uploading or not a.s3_upload_id:
        raise HTTPException(409, "Upload is not in progress")
    return a


@router.post("/media/{asset_id}/upload/parts")
def sign_parts(asset_id: uuid.UUID, body: PartsReq, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _uploading(db, user, asset_id)
    if any(n < 1 or n > 10000 for n in body.part_numbers):
        raise HTTPException(422, "Invalid part number")
    return {"urls": {n: storage.presign_part(a.storage_key, a.s3_upload_id, n) for n in body.part_numbers}}


@router.get("/media/{asset_id}/upload/parts")
def uploaded_parts(asset_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Lets an interrupted upload resume: the client skips parts already stored."""
    a = _uploading(db, user, asset_id)
    return {"parts": storage.list_parts(a.storage_key, a.s3_upload_id)}


@router.post("/media/{asset_id}/upload/complete")
def complete_upload(asset_id: uuid.UUID, body: CompleteReq, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    a = _uploading(db, user, asset_id)
    try:
        storage.complete_multipart(a.storage_key, a.s3_upload_id, [p.model_dump() for p in body.parts])
    except Exception:
        raise HTTPException(400, "Upload could not be completed; some parts are missing or corrupt")
    h = storage.head(a.storage_key)
    if not h or h["ContentLength"] != a.size_bytes:
        storage.delete_prefix(a.storage_key)
        a.status, a.status_detail = MediaStatus.failed, "Stored size does not match declared size"
        db.commit()
        raise HTTPException(400, a.status_detail)
    a.status, a.s3_upload_id = MediaStatus.processing, None
    job = jobs.enqueue(db, workspace_id=a.workspace_id, project_id=a.project_id, created_by=user.id, kind="media.process",
                       payload={"asset_id": str(a.id)}, idempotency_key=f"media.process:{a.id}")
    audit(db, request, "media.upload_complete", user=user, workspace_id=a.workspace_id, target_type="media", target_id=a.id)
    db.commit()
    return ser_asset(a, job)


@router.delete("/media/{asset_id}/upload")
def abort_upload(asset_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _uploading(db, user, asset_id)
    try:
        storage.abort_multipart(a.storage_key, a.s3_upload_id)
    except Exception:
        pass
    a.deleted_at, a.status, a.status_detail = datetime.now(timezone.utc), MediaStatus.failed, "Upload cancelled"
    db.commit()
    return {"ok": True}


@router.get("/projects/{project_id}/media")
def list_media(project_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = load_project(db, user, project_id)
    assets = db.scalars(select(MediaAsset).where(MediaAsset.project_id == p.id, MediaAsset.deleted_at.is_(None))
                        .order_by(MediaAsset.created_at.desc())).all()
    js = _latest_jobs(db, [a.id for a in assets])
    return [ser_asset(a, js.get(a.id)) for a in assets]


@router.get("/media/{asset_id}")
def get_media(asset_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = load_asset(db, user, asset_id)
    return ser_asset(a, _latest_jobs(db, [a.id]).get(a.id))


@router.post("/media/{asset_id}/retry")
def retry_processing(asset_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = load_asset(db, user, asset_id, Role.editor)
    if a.status != MediaStatus.failed or not storage.head(a.storage_key):
        raise HTTPException(409, "Only failed media whose original is still stored can be retried")
    a.status = MediaStatus.processing
    job = jobs.enqueue(db, workspace_id=a.workspace_id, project_id=a.project_id, created_by=user.id, kind="media.process",
                       payload={"asset_id": str(a.id)}, idempotency_key=f"media.process:{a.id}:{uuid.uuid4().hex[:8]}")
    db.commit()
    return ser_asset(a, job)


@router.delete("/media/{asset_id}")
def delete_media(asset_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Removes the item from the project. Timeline clips that used it show as missing media."""
    a = load_asset(db, user, asset_id, Role.editor)
    a.deleted_at = datetime.now(timezone.utc)
    audit(db, request, "media.delete", user=user, workspace_id=a.workspace_id, target_type="media", target_id=a.id)
    db.commit()
    return {"ok": True}


class DeriveReq(BaseModel):
    op: str = Field(pattern="^(stabilize|remove_bg)$")


DERIVE = {"stabilize": (" (stabilized)", "mp4", "video/mp4"), "remove_bg": (" (no background)", "mov", "video/quicktime")}


@router.post("/media/{asset_id}/derive", status_code=201)
def derive_media(asset_id: uuid.UUID, body: DeriveReq, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Create a processed copy (stabilized / background removed) as a NEW media item. The original is never changed."""
    from ..derive import MAX_BG_SECONDS
    src = load_asset(db, user, asset_id, Role.editor)
    if src.status != MediaStatus.ready or src.kind != "video" or not src.has_video:
        raise HTTPException(422, "Only ready video files can be processed this way")
    if body.op == "remove_bg" and (src.duration_s or 0) > MAX_BG_SECONDS:
        raise HTTPException(422, f"Background removal works on clips up to {MAX_BG_SECONDS} seconds for now — trim or split the file first")
    suffix, ext, ctype = DERIVE[body.op]
    stem = src.filename.rsplit(".", 1)[0][:150]
    new_id = uuid.uuid4()
    a = MediaAsset(id=new_id, workspace_id=src.workspace_id, project_id=src.project_id, uploaded_by=user.id,
                   filename=f"{stem}{suffix}.{ext}", kind="video", declared_content_type=ctype, size_bytes=0,
                   storage_key=f"ws/{src.workspace_id}/proj/{src.project_id}/media/{new_id}/original.{ext}", status=MediaStatus.processing)
    db.add(a)
    db.flush()
    job = jobs.enqueue(db, workspace_id=src.workspace_id, project_id=src.project_id, created_by=user.id, kind="media.derive",
                       payload={"asset_id": str(new_id), "source_id": str(src.id), "op": body.op},
                       idempotency_key=f"derive:{new_id}", max_attempts=2)
    audit(db, request, f"media.derive.{body.op}", user=user, workspace_id=src.workspace_id, target_type="media", target_id=new_id, source=str(src.id))
    db.commit()
    return ser_asset(a, job)


# ---------------------------------------------------------------- 3D LUTs (.cube) for colour grading

class LutIn(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=10, max_length=8 * 1024 * 1024)


@router.post("/projects/{project_id}/luts", status_code=201)
def upload_lut(project_id: uuid.UUID, body: LutIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Small text upload (≤ 8 MB) validated as a 3D .cube LUT and stored privately with the project."""
    import os
    import tempfile
    from ..colorlut import LutError, parse_cube
    p = load_project(db, user, project_id, Role.editor)
    upload_limiter.check(f"up:{user.id}")
    if not body.filename.lower().endswith(".cube"):
        raise HTTPException(422, "Choose a .cube LUT file")
    try:
        size, _rows, title = parse_cube(body.content)
    except (LutError, ValueError) as e:
        raise HTTPException(422, str(e) or "Not a valid .cube LUT")
    aid = uuid.uuid4()
    name = os.path.basename(body.filename).replace("/", "_")[:200]
    key = f"ws/{p.workspace_id}/proj/{p.id}/luts/{aid}.cube"
    with tempfile.NamedTemporaryFile("w", suffix=".cube", delete=False) as f:
        f.write(body.content)
        tmp = f.name
    try:
        storage.upload(tmp, key, "text/plain")
    finally:
        os.unlink(tmp)
    a = MediaAsset(id=aid, workspace_id=p.workspace_id, project_id=p.id, uploaded_by=user.id, filename=name, kind="lut",
                   declared_content_type="text/plain", size_bytes=len(body.content.encode()), storage_key=key, proxy_key=key,
                   status=MediaStatus.ready, analysis={"lut": {"size": size, "title": title}})
    db.add(a)
    audit(db, request, "lut.upload", user=user, workspace_id=p.workspace_id, target_type="media", target_id=aid, size=size)
    db.commit()
    return ser_asset(a)
