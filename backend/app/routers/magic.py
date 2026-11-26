"""Magic Edit API: open a photo from a project, tap to select, then remove / move / resize / replace.

Flow: POST /magic/open {asset_id} -> session id; POST /magic/{sid}/select {points} -> mask PNG (base64);
POST /magic/{sid}/apply {action, mask, ...} -> new version; GET /magic/{sid}/image -> current JPEG;
POST /magic/{sid}/undo. The browser saves the final picture into the project as a new media file.

Sessions live in memory + a temp folder for 2 hours and belong to the user who opened them. Heavy work runs one at a
time (CPU), so the site stays responsive.
"""
from __future__ import annotations

import base64
import os
import shutil
import tempfile
import threading
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import magic_edit as M
from .. import magic_replace as R
from .. import storage
from ..db import get_db
from ..models import MediaAsset, MediaStatus, Role, User
from ..security import RateLimiter, current_user, require_member

router = APIRouter(tags=["magic"])
limiter = RateLimiter(limit=60, window_s=60)
_work = threading.Semaphore(1)
_sessions: dict[str, dict] = {}
_slock = threading.Lock()
TTL = 2 * 3600
ROOT = os.path.join(tempfile.gettempdir(), "magic-edit")
_prefetching = threading.Event()


def _prefetch() -> None:
    if _prefetching.is_set():
        return
    _prefetching.set()

    def run():
        try:
            for name in M.MODELS:
                M.model_path(name)
        except Exception:  # noqa: BLE001 - reported on the next status call
            pass
        finally:
            _prefetching.clear()
    threading.Thread(target=run, daemon=True, name="magic-prefetch").start()


@router.get("/magic/status")
def status(user: User = Depends(current_user)):
    ready = M.ready()
    if not ready and not M._assets.offline():
        _prefetch()
    return {"ready": ready, "preparing": not ready and _prefetching.is_set(), "replace": R.engines(),
            "note": None if ready else "Getting the free eraser ready (first time only, about 1–3 minutes)."}


def _cleanup() -> None:
    now = time.time()
    with _slock:
        for sid in [k for k, v in _sessions.items() if now - v["t"] > TTL]:
            shutil.rmtree(_sessions.pop(sid)["dir"], ignore_errors=True)


def _get(sid: str, user: User) -> dict:
    _cleanup()
    s = _sessions.get(sid)
    if not s or s["user"] != user.id:
        raise HTTPException(404, "This edit has expired. Open the photo again.")
    s["t"] = time.time()
    return s


def _busy():
    if not _work.acquire(timeout=90):
        raise HTTPException(503, "Magic Edit is busy with another photo. Try again in a minute.")


def _err(e: Exception):
    raise HTTPException(422, str(e)) from e


class OpenIn(BaseModel):
    asset_id: uuid.UUID


@router.post("/magic/open")
def open_photo(body: OpenIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    limiter.check(f"m:{user.id}")
    a = db.get(MediaAsset, body.asset_id)
    if not a:
        raise HTTPException(404, "Photo not found")
    require_member(db, user, a.workspace_id, Role.editor)
    if a.kind != "image" or a.status != MediaStatus.ready:
        raise HTTPException(422, "Magic Edit works on photos (images). Pick an image from your media.")
    if not M.ready() and M._assets.offline():
        raise HTTPException(503, "Magic Edit's models aren't installed on this server.")
    sid = uuid.uuid4().hex
    d = os.path.join(ROOT, sid)
    os.makedirs(d, exist_ok=True)
    src = os.path.join(d, "src")
    try:
        storage.download(a.storage_key, src)
        im = M.load_image(open(src, "rb").read())
    except M.MagicError as e:
        shutil.rmtree(d, ignore_errors=True)
        _err(e)
    os.remove(src)
    first = os.path.join(d, "v0.jpg")
    im.save(first, "JPEG", quality=95)
    with _slock:
        _sessions[sid] = {"user": user.id, "dir": d, "versions": [first], "t": time.time(), "asset": a.id,
                          "filename": a.filename, "project": a.project_id, "workspace": a.workspace_id}
    return {"sid": sid, "width": im.width, "height": im.height, "version": 0, "filename": a.filename}


@router.get("/magic/{sid}/image")
def image(sid: str, v: int | None = None, user: User = Depends(current_user)):
    s = _get(sid, user)
    vs = s["versions"]
    path = vs[-1] if v is None or not 0 <= v < len(vs) else vs[v]
    return Response(open(path, "rb").read(), media_type="image/jpeg", headers={"cache-control": "private, max-age=3600"})


class SelectIn(BaseModel):
    points: list[tuple[float, float, int]] = Field(default_factory=list, max_length=12)
    box: tuple[float, float, float, float] | None = None


@router.post("/magic/{sid}/select")
def select(sid: str, body: SelectIn, user: User = Depends(current_user)):
    limiter.check(f"m:{user.id}")
    s = _get(sid, user)
    _busy()
    try:
        im = M.load_image(open(s["versions"][-1], "rb").read())
        mask = M.select(im, body.points, body.box)
    except M.MagicError as e:
        _err(e)
    finally:
        _work.release()
    return {"mask": base64.b64encode(M.mask_png(mask)).decode(), "area": round(float(mask.mean()), 4)}


class ApplyIn(BaseModel):
    action: str = Field(pattern="^(remove|move|replace)$")
    mask: str = Field(max_length=8_000_000)      # base64 PNG (white = selected)
    dx: float = 0
    dy: float = 0
    scale: float = 1.0
    prompt: str = Field(default="", max_length=300)


@router.post("/magic/{sid}/apply")
def apply(sid: str, body: ApplyIn, user: User = Depends(current_user)):
    limiter.check(f"m:{user.id}")
    s = _get(sid, user)
    if len(s["versions"]) > 30:
        raise HTTPException(422, "That's a lot of edits on one photo. Save it, then open the saved copy to keep going.")
    engine = "lama"
    if body.action == "replace":
        try:
            R.take_quota(str(user.id))
        except M.MagicError as e:
            raise HTTPException(429, str(e)) from e
    _busy()
    try:
        im = M.load_image(open(s["versions"][-1], "rb").read())
        try:
            mask = M.read_mask(base64.b64decode(body.mask), im.size)
        except ValueError as e:
            raise M.MagicError("The selection couldn't be read. Select the object again.") from e
        if body.action == "remove":
            out = M.remove(im, mask)
        elif body.action == "move":
            out = M.move(im, mask, body.dx, body.dy, body.scale)
        else:
            try:
                out, engine = R.replace(im, mask, body.prompt)
            except M.MagicError:
                R.give_back(str(user.id))
                raise
    except M.MagicError as e:
        _err(e)
    finally:
        _work.release()
    path = os.path.join(s["dir"], f"v{len(s['versions'])}.jpg")
    out.save(path, "JPEG", quality=95)
    s["versions"].append(path)
    return {"version": len(s["versions"]) - 1, "engine": engine, "ai_generated": body.action == "replace"}


@router.post("/magic/{sid}/undo")
def undo(sid: str, user: User = Depends(current_user)):
    s = _get(sid, user)
    if len(s["versions"]) > 1:
        os.remove(s["versions"].pop())
    return {"version": len(s["versions"]) - 1}
