from datetime import datetime
from pydantic import BaseModel, Field


class ShortRequest(BaseModel):
    upload_id: int | None = Field(default=None, alias="videoId")
    start_seconds: int | None = Field(default=0, alias="startSeconds")
    end_seconds: int | None = Field(default=15, alias="endSeconds")
    ratio: str | None = Field(default="9:16", alias="aspectRatio")
    caption_style: str | None = Field(default=None, alias="captionStyle")
    captions: bool | None = Field(default=None)
    auto_detect: bool | None = Field(default=None, alias="autoDetect")

    model_config = {
        "populate_by_name": True,
    }


class ShortResponse(BaseModel):
    id: int
    upload_id: int
    user_id: int
    ratio: str
    clip_start: int
    clip_end: int
    storage_path: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
