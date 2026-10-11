from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Boolean
from sqlalchemy.orm import relationship
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(128), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    display_name = Column(String(255), nullable=True)
    picture = Column(String(1024), nullable=True)
    provider = Column(String(128), nullable=True)
    channel_name = Column(String(255), nullable=True)
    channel_url = Column(String(1024), nullable=True)
    is_active = Column(Boolean, default=True)
    is_paid = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects = relationship("Project", back_populates="owner")
    uploads = relationship("Upload", back_populates="owner")
    subscriptions = relationship("Subscription", back_populates="user")
