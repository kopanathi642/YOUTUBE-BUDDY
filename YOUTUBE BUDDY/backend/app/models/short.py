from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.models.base import Base


class Short(Base):
    __tablename__ = "shorts"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ratio = Column(String(16), nullable=False)
    clip_start = Column(Integer, nullable=False)
    clip_end = Column(Integer, nullable=False)
    storage_path = Column(String(1024), nullable=False)
    caption_style = Column(String(128), nullable=True)
    status = Column(String(64), default="queued")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    upload = relationship("Upload", back_populates="shorts")
