"""Free stock library (Pexels + Pixabay). Search is proxied so API keys stay on the server; import re-looks-up by id."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import jobs, stock
from ..db import get_db
from ..deps import load_project, ser_asset
from ..models import MediaAsset, MediaStatus, Role, User
from ..security import RateLimiter, audit, current_user, upload_limiter

router = APIRouter(tags=["stock"])
search_limiter = RateLimiter(limit=60, window_s=60)


@router.get("/stock/status")
def status(user: User = Depends(current_user)):
    return stock.keys()


@router.get("/stock/search")
def search(q: str = Query(min_length=1, max_length=100), kind: str = Query("video", pattern="^(video|photo)$"),
           provider: str = Query("pexels", pattern="^(pexels|pixabay)$"), page: int = Query(1, ge=1, le=50),
           user: User = Depends(current_user)):
    search_limiter.check(f"stock:{user.id}")
    try:
        return stock.search(provider, kind, q.strip(), page)
    except stock.StockError as e:
        raise HTTPException(409 if "API key" in str(e) else 502, str(e))


class ImportIn(BaseModel):
    provider: str = Field(pattern="^(pexels|pixabay)$")
    kind: str = Field(pattern="^(video|photo)$")
    id: str = Field(min_length=1, max_length=20)


@router.post("/projects/{project_id}/stock/import", status_code=201)
def import_item(project_id: uuid.UUID, body: ImportIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = load_project(db, user, project_id, Role.editor)
    upload_limiter.check(f"up:{user.id}")
    try:
        it = stock.lookup(body.provider, body.kind, body.id)
    except stock.StockError as e:
        raise HTTPException(409 if "API key" in str(e) else 422, str(e))
    aid = uuid.uuid4()
    ext = "mp4" if body.kind == "video" else ("png" if it["download_url"].lower().split("?")[0].endswith(".png") else "jpg")
    kind = "video" if body.kind == "video" else "image"
    name = f"{body.provider.title()} {body.id} - {it.get('author') or 'stock'}.{ext}"[:200]
    a = MediaAsset(id=aid, workspace_id=p.workspace_id, project_id=p.id, uploaded_by=user.id, filename=name, kind=kind,
                   declared_content_type="video/mp4" if kind == "video" else ("image/png" if ext == "png" else "image/jpeg"), size_bytes=0,
                   storage_key=f"ws/{p.workspace_id}/proj/{p.id}/media/{aid}/original.{ext}", status=MediaStatus.processing,
                   analysis={"stock": {"provider": body.provider, "id": body.id, "author": it.get("author"), "author_url": it.get("author_url"),
                                       "page_url": it.get("page_url"),
                                       "license": "Pexels License" if body.provider == "pexels" else "Pixabay Content License"}})
    db.add(a)
    db.flush()
    job = jobs.enqueue(db, workspace_id=p.workspace_id, project_id=p.id, created_by=user.id, kind="media.import",
                       payload={"asset_id": str(aid), "url": it["download_url"]}, idempotency_key=f"stock:{aid}", max_attempts=3)
    audit(db, request, "stock.import", user=user, workspace_id=p.workspace_id, target_type="media", target_id=aid, provider=body.provider, item=body.id)
    db.commit()
    return ser_asset(a, job)
