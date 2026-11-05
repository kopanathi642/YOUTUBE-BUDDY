import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import MediaAsset, Project, Role, User, Workspace, WorkspaceMember, Job, JobStatus
from ..security import audit, current_user, require_member, ROLE_RANK

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class MemberIn(BaseModel):
    email: str
    role: Role = Role.editor


@router.post("", status_code=201)
def create_workspace(body: WorkspaceIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = Workspace(name=body.name.strip())
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=Role.owner))
    audit(db, request, "workspace.create", user=user, workspace_id=ws.id)
    db.commit()
    return {"id": str(ws.id), "name": ws.name, "is_personal": False, "role": "owner"}


@router.get("/{workspace_id}/summary")
def summary(workspace_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Dashboard numbers — all computed from real rows, nothing estimated."""
    require_member(db, user, workspace_id)
    projects = db.scalar(select(func.count()).select_from(Project).where(
        Project.workspace_id == workspace_id, Project.deleted_at.is_(None), Project.archived_at.is_(None)))
    storage_bytes = db.scalar(select(func.coalesce(func.sum(MediaAsset.size_bytes), 0)).where(
        MediaAsset.workspace_id == workspace_id, MediaAsset.deleted_at.is_(None))) or 0
    media_count = db.scalar(select(func.count()).select_from(MediaAsset).where(
        MediaAsset.workspace_id == workspace_id, MediaAsset.deleted_at.is_(None)))
    active = db.scalar(select(func.count()).select_from(Job).where(
        Job.workspace_id == workspace_id, Job.status.in_([JobStatus.queued, JobStatus.running])))
    return {"projects": projects, "media_count": media_count, "storage_bytes": int(storage_bytes),
            "active_jobs": active, "limits": {"max_upload_bytes": get_settings().max_upload_bytes,
                                              "max_concurrent_exports": get_settings().max_concurrent_exports_per_workspace}}


@router.get("/{workspace_id}/members")
def members(workspace_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_member(db, user, workspace_id)
    rows = db.execute(select(WorkspaceMember, User).join(User).where(WorkspaceMember.workspace_id == workspace_id)
                      .order_by(WorkspaceMember.created_at)).all()
    return [{"user_id": str(u.id), "email": u.email, "display_name": u.display_name, "role": m.role.value} for m, u in rows]


@router.post("/{workspace_id}/members", status_code=201)
def add_member(workspace_id: uuid.UUID, body: MemberIn, request: Request, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Add an existing account. Email invitations for new people need an email provider (not configured yet)."""
    me = require_member(db, user, workspace_id, Role.admin)
    if me.workspace.is_personal:
        raise HTTPException(400, "Personal workspaces cannot have members; create a team workspace")
    if body.role == Role.owner or ROLE_RANK[body.role] > ROLE_RANK[me.role]:
        raise HTTPException(403, "Cannot grant a role higher than your own")
    target = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not target:
        raise HTTPException(404, "No account with that email. Ask them to sign up first.")
    if db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == target.id)):
        raise HTTPException(409, "Already a member")
    db.add(WorkspaceMember(workspace_id=workspace_id, user_id=target.id, role=body.role))
    audit(db, request, "workspace.member_add", user=user, workspace_id=workspace_id, target_type="user", target_id=target.id,
          role=body.role.value)
    db.commit()
    return {"user_id": str(target.id), "email": target.email, "display_name": target.display_name, "role": body.role.value}


@router.delete("/{workspace_id}/members/{user_id}")
def remove_member(workspace_id: uuid.UUID, user_id: uuid.UUID, request: Request, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    me = require_member(db, user, workspace_id, Role.admin)
    m = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id))
    if not m:
        raise HTTPException(404, "Not found")
    if m.role == Role.owner:
        raise HTTPException(400, "The owner cannot be removed")
    if ROLE_RANK[m.role] > ROLE_RANK[me.role]:
        raise HTTPException(403, "Insufficient role")
    db.delete(m)
    audit(db, request, "workspace.member_remove", user=user, workspace_id=workspace_id, target_type="user", target_id=user_id)
    db.commit()
    return {"ok": True}
