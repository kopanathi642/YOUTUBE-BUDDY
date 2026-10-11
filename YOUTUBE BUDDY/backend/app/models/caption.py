from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.models.base import Base


class Caption(Base):
    __tablename__ = "captions"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    format = Column(String(32), nullable=False)
    content = Column(Text, nullable=False)
    style = Column(String(128), nullable=True)
    language = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    upload = relationship("Upload", back_populates="captions")
