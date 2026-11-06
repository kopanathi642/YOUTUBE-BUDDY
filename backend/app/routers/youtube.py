"""Connect a YouTube channel (OAuth, youtube.upload scope) and publish finished exports to it."""
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import jobs, youtube
from ..config import get_settings
from ..db import get_db
from ..deps import load_project, ser_job
from ..models import Export, Job, Role, User, YouTubeConnection
from ..security import audit, current_user

router = APIRouter(tags=["youtube"])
STATE_COOKIE = "yt_oauth_state"


@router.get("/youtube/status")
def status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.scalar(select(YouTubeConnection).where(YouTubeConnection.user_id == user.id))
    return {"configured": not youtube.missing(), "missing": youtube.missing(), "connected": c is not None,
            "channel_title": c and c.channel_title, "channel_id": c and c.channel_id, "redirect_uri": youtube.redirect_uri()}


@router.get("/youtube/connect")
def connect(user: User = Depends(current_user)):
    if youtube.missing():
        raise HTTPException(409, "YouTube publishing isn't set up on this server yet: add " + ", ".join(youtube.missing()))
    state = secrets.token_urlsafe(24)
    from fastapi.responses import JSONResponse
    r = JSONResponse({"url": youtube.auth_url(state)})
    s = get_settings()
    r.set_cookie(STATE_COOKIE, f"{state}.{user.id}", max_age=600, httponly=True, secure=s.cookie_secure, samesite="lax",
                 path="/api/v1/youtube")
    return r


@router.get("/youtube/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
             user: User = Depends(current_user), db: Session = Depends(get_db)):
    def back(result: str):
        r = RedirectResponse(f"/settings?youtube={result}", status_code=303)
        r.delete_cookie(STATE_COOKIE, path="/api/v1/youtube")
        return r
    expected = request.cookies.get(STATE_COOKIE, "")
    if not state or not secrets.compare_digest(expected, f"{state}.{user.id}"):
        return back("bad_state")
    if error or not code:
        return back("denied")
    try:
        tok = youtube.exchange_code(code)
        if not tok.get("refresh_token"):
            return back("no_refresh")
        ch = youtube.my_channel(tok["access_token"])
    except youtube.YouTubeError:
        return back("failed")
    c = db.scalar(select(YouTubeConnection).where(YouTubeConnection.user_id == user.id))
    if c is None:
        c = YouTubeConnection(user_id=user.id, refresh_token_enc="")
        db.add(c)
    c.channel_id, c.channel_title, c.refresh_token_enc = ch["id"], ch["title"][:200], youtube.encrypt(tok["refresh_token"])
    audit(db, request, "youtube.connect", user=user, channel=ch["id"])
    db.commit()
    return back("connected")


@router.delete("/youtube/connection", status_code=204)
def disconnect(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.scalar(select(YouTubeConnection).where(YouTubeConnection.user_id == user.id))
    if c:
        try:
            youtube.revoke(youtube.decrypt(c.refresh_token_enc))
        except youtube.YouTubeError:
            pass
        db.delete(c)
        audit(db, request, "youtube.disconnect", user=user)
        db.commit()


class PublishIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field("", max_length=5000)
    tags: list[str] = Field(default_factory=list, max_length=30)
    privacy: str = Field("private", pattern="^(private|unlisted|public)$")
    made_for_kids: bool = False
    ai_altered: bool = False
    category_id: str = Field("22", pattern=r"^\d{1,3}$")


@router.post("/exports/{export_id}/youtube", status_code=201)
def publish(export_id: uuid.UUID, body: PublishIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = db.get(Export, export_id)
    if not e:
        raise HTTPException(404, "Export not found")
    load_project(db, user, e.project_id, Role.editor)
    j = db.get(Job, e.job_id)
    if not (j and j.status.value == "succeeded" and e.output_key):
        raise HTTPException(409, "This export hasn't finished rendering yet")
    if youtube.missing():
        raise HTTPException(409, "YouTube publishing isn't set up on this server yet")
    if not db.scalar(select(YouTubeConnection).where(YouTubeConnection.user_id == user.id)):
        raise HTTPException(409, "Connect your YouTube channel in Settings first")
    if any(len(t) > 100 for t in body.tags) or sum(len(t) for t in body.tags) > 450:
        raise HTTPException(422, "Tags are too long for YouTube (about 500 characters in total)")
    if any(c in body.title for c in "<>"):
        raise HTTPException(422, "YouTube titles can't contain < or >")
    job = jobs.enqueue(db, workspace_id=e.workspace_id, project_id=e.project_id, created_by=user.id, kind="youtube.upload",
                       payload={"export_id": str(e.id), "user_id": str(user.id), "meta": body.model_dump()}, max_attempts=2)
    audit(db, request, "youtube.publish", user=user, workspace_id=e.workspace_id, target_type="export", target_id=e.id, privacy=body.privacy)
    db.commit()
    return ser_job(job)


@router.get("/exports/{export_id}/youtube")
def publish_history(export_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = db.get(Export, export_id)
    if not e:
        raise HTTPException(404, "Export not found")
    load_project(db, user, e.project_id)
    rows = db.scalars(select(Job).where(Job.kind == "youtube.upload", Job.project_id == e.project_id).order_by(Job.created_at.desc()).limit(50)).all()
    return [ser_job(j) for j in rows if j.payload.get("export_id") == str(e.id)]
