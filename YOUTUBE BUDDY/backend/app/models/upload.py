from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.models.base import Base


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(512), nullable=False)
    content_type = Column(String(128), nullable=False)
    duration_seconds = Column(Integer, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    storage_path = Column(String(1024), nullable=False)
    preview_url = Column(String(1024), nullable=True)
    upload_metadata = Column(Text, nullable=True, name="metadata")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="uploads")
    owner = relationship("User", back_populates="uploads")
    shorts = relationship("Short", back_populates="upload")
    captions = relationship("Caption", back_populates="upload")
    render_jobs = relationship("RenderJob", back_populates="upload")
