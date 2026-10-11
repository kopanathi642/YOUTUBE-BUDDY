from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserProfile(BaseModel):
    uid: str
    email: EmailStr
    displayName: str | None = Field(default=None, alias='display_name')
    picture: str | None = None
    provider: str | None = None
    channelName: str | None = Field(default=None, alias='channel_name')
    channelUrl: str | None = Field(default=None, alias='channel_url')

    model_config = {
        'from_attributes': True,
        'populate_by_name': True,
    }


class UserCreate(BaseModel):
    uid: str
    email: EmailStr
    password_hash: str | None = None
    display_name: str | None = None
    picture: str | None = None
    provider: str | None = None
    channel_name: str | None = None
    channel_url: str | None = None


class UserUpdate(BaseModel):
    displayName: str | None = Field(default=None, alias='display_name')
    channelName: str | None = Field(default=None, alias='channel_name')
    channelUrl: str | None = Field(default=None, alias='channel_url')

    model_config = {
        'populate_by_name': True,
    }


class UserResponse(UserProfile):
    id: int
    is_active: bool
    is_paid: bool
    created_at: datetime
    updated_at: datetime
    plan: str | None = "free"
    total_videos: int | None = 0
    total_shorts: int | None = 0
    storage_used: int | None = 0
    storage_limit: int | None = 0

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }
