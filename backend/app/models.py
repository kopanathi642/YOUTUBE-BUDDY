"""Relational data model for the Editor Universe slice.

Media blobs never live here — only metadata, ownership and storage keys.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint, func, Index,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uuid_pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Role(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class User(Base, Timestamped):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))  # NULL for Google-only accounts
    firebase_uid: Mapped[str | None] = mapped_column(String(128), unique=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    referred_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))          # who invited this user
    referral_rewarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")


class UserSession(Base):
    __tablename__ = "user_sessions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    user: Mapped[User] = relationship()


class Workspace(Base, Timestamped):
    __tablename__ = "workspaces"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="free", server_default="free")
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WorkspaceMember(Base, Timestamped):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[Role] = mapped_column(Enum(Role, name="workspace_role"), nullable=False)
    workspace: Mapped[Workspace] = relationship()
    user: Mapped[User] = relationship()


class Project(Base, Timestamped):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    universe: Mapped[str] = mapped_column(String(32), default="editor", nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    thumbnail_key: Mapped[str | None] = mapped_column(String(500))


class MediaStatus(str, enum.Enum):
    uploading = "uploading"
    processing = "processing"
    ready = "ready"
    failed = "failed"
    rejected = "rejected"


class MediaAsset(Base, Timestamped):
    __tablename__ = "media_assets"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # video | audio | image (claimed until probed)
    declared_content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)  # original, immutable
    s3_upload_id: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[MediaStatus] = mapped_column(Enum(MediaStatus, name="media_status"), nullable=False)
    status_detail: Mapped[str | None] = mapped_column(Text)
    sha256: Mapped[str | None] = mapped_column(String(64))
    # Probed technical metadata (typed columns for what we query on, JSON for the full ffprobe result)
    duration_s: Mapped[float | None] = mapped_column(Float)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    fps: Mapped[float | None] = mapped_column(Float)
    video_codec: Mapped[str | None] = mapped_column(String(40))
    audio_codec: Mapped[str | None] = mapped_column(String(40))
    has_audio: Mapped[bool | None] = mapped_column(Boolean)
    has_video: Mapped[bool | None] = mapped_column(Boolean)
    probe: Mapped[dict | None] = mapped_column(JSONB)
    proxy_key: Mapped[str | None] = mapped_column(String(500))
    thumbnail_key: Mapped[str | None] = mapped_column(String(500))
    waveform_key: Mapped[str | None] = mapped_column(String(500))
    analysis: Mapped[dict | None] = mapped_column(JSONB)  # scenes, silences, loudness, auto grade, subject position
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Sequence(Base, Timestamped):
    __tablename__ = "sequences"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    timeline: Mapped[dict] = mapped_column(JSONB, nullable=False)


class SequenceVersion(Base):
    """Append-only history of every saved timeline state (autosave + restore)."""
    __tablename__ = "sequence_versions"
    __table_args__ = (UniqueConstraint("sequence_id", "version"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    sequence_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sequences.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    timeline: Mapped[dict] = mapped_column(JSONB, nullable=False)
    saved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    canceled = "canceled"


class Job(Base, Timestamped):
    """Durable background job. Survives browser closure and worker restarts (lease + reclaim)."""
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("workspace_id", "idempotency_key"),
        Index("ix_jobs_claim", "status", "run_after"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(40), nullable=False)  # media.process | render.export
    queue: Mapped[str] = mapped_column(String(40), nullable=False, default="default")
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus, name="job_status"), nullable=False, default=JobStatus.queued)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    result: Mapped[dict | None] = mapped_column(JSONB)
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    stage: Mapped[str | None] = mapped_column(String(80))
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    worker_id: Mapped[str | None] = mapped_column(String(120))
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(120))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    logs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class Export(Base, Timestamped):
    __tablename__ = "exports"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    sequence_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sequences.id", ondelete="CASCADE"))
    sequence_version: Mapped[int] = mapped_column(Integer, nullable=False)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    preset: Mapped[str] = mapped_column(String(40), nullable=False)
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False)
    output_key: Mapped[str | None] = mapped_column(String(500))
    output_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    validation: Mapped[dict | None] = mapped_column(JSONB)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workspaces.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(String(64))
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Generation(Base, Timestamped):
    """One run of an AI Generator Universe tool. Versions of the same idea share a root_id; outputs are media assets
    (with provenance in their analysis["generation"]) or a JSON result (reports, scripts, subtitles)."""
    __tablename__ = "generations"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    tool_id: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    engine: Mapped[str] = mapped_column(String(20), nullable=False)
    model: Mapped[str | None] = mapped_column(String(200))
    params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")  # queued|running|succeeded|failed|canceled|awaiting_approval
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("generations.id", ondelete="SET NULL"))
    root_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    output_asset_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    result: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    est_cost_usd: Mapped[float | None] = mapped_column(Float)
    quality: Mapped[dict | None] = mapped_column(JSONB)
    rating: Mapped[int | None] = mapped_column(Integer)


class PlatformSetting(Base):
    """Small admin-editable settings (UPI payee details, QR storage key). Never secrets."""
    __tablename__ = "platform_settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Payment(Base, Timestamped):
    """A UPI payment a user reports (plan + UTR). An admin checks it against the bank app and approves or rejects it."""
    __tablename__ = "payments"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    months: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    amount_inr: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="upi", server_default="upi")  # upi | paypal
    utr: Mapped[str] = mapped_column(String(22), unique=True, nullable=False)  # UPI UTR or PayPal transaction ID
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending", index=True)  # pending|approved|rejected
    note: Mapped[str | None] = mapped_column(String(300))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class YouTubeConnection(Base, Timestamped):
    """A user's linked YouTube channel. The refresh token is encrypted (Fernet) and never sent to the browser."""
    __tablename__ = "youtube_connections"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    channel_id: Mapped[str | None] = mapped_column(String(64))
    channel_title: Mapped[str | None] = mapped_column(String(200))
    refresh_token_enc: Mapped[str] = mapped_column(Text, nullable=False)


class AgentReport(Base):
    """Output of the background Creator Scout agent: 'research' (creator problems + tool ideas) or 'health' (self-check)."""
    __tablename__ = "agent_reports"
    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="ok")   # ok | warn | error
    summary: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Dub(Base, Timestamped):
    """A multilingual dubbing project for one source clip: editable transcript (with per-segment language and speaker),
    and per target language an editable translation, voice per speaker, render status and output files."""
    __tablename__ = "dubs"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    source_asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media_assets.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="preparing")   # preparing | ready | failed
    error: Mapped[str | None] = mapped_column(Text)
    source_language: Mapped[str | None] = mapped_column(String(8))     # user's manual choice; None = auto-detect
    detected_language: Mapped[str | None] = mapped_column(String(8))
    detection: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    segments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    speakers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    targets: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


# ------------------------------------------------------------------ YouTube Growth
class GrowthChannel(Base, Timestamped):
    """A YouTube channel the workspace tracks: its own channel or a public competitor (read from the channel's public feed)."""
    __tablename__ = "growth_channels"
    __table_args__ = (UniqueConstraint("workspace_id", "channel_id", name="uq_growth_channel"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    channel_id: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(12), nullable=False, default="competitor")   # own | competitor
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_error: Mapped[str | None] = mapped_column(String(300))


class VideoSnapshot(Base):
    """Public view counts of a video at a moment in time (from the channel feed). Repeated snapshots show growth."""
    __tablename__ = "video_snapshots"
    __table_args__ = (Index("ix_video_snap", "channel_row_id", "video_id", "captured_at"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    channel_row_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("growth_channels.id", ondelete="CASCADE"), nullable=False)
    video_id: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    views: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    likes: Mapped[int | None] = mapped_column(BigInteger)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ContentItem(Base, Timestamped):
    """One planned video moving through Idea → Research → Script → Production → Review → Approved → Scheduled → Published."""
    __tablename__ = "content_items"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    fmt: Mapped[str] = mapped_column(String(10), nullable=False, default="long")          # long | short
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="idea", index=True)
    series: Mapped[str | None] = mapped_column(String(120))
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    recommendation: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)   # score breakdown + evidence
    blueprint: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)        # hook, sections, scenes, cta, seo
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    youtube_video_id: Mapped[str | None] = mapped_column(String(20))
    prediction: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)       # estimate made when produced
    outcome: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)          # measured views at 1/3/7/30 days
    notes: Mapped[str | None] = mapped_column(Text)


class GrowthSettings(Base, Timestamped):
    """Per-workspace automation mode and module switches. Publishing is never automatic unless publish_authorized is on."""
    __tablename__ = "growth_settings"
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True)
    mode: Mapped[str] = mapped_column(String(12), nullable=False, default="assisted")    # assisted | semi | autonomous
    modules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    publish_authorized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    weights: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class CompositionTemplate(Base, Timestamped):
    """A Shorts-studio layout saved by a creator: layers with their settings, media replaced by numbered slots."""
    __tablename__ = "composition_templates"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
