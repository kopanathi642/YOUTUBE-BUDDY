from datetime import datetime
from pydantic import BaseModel


class CaptionRequest(BaseModel):
    upload_id: int
    format: str
    style: str | None = None
    language: str | None = "en"
    transcript: str | None = None
    segments: list[dict] | None = None


class CaptionResponse(BaseModel):
    id: int
    upload_id: int
    user_id: int
    format: str
    content: str
    style: str | None = None
    language: str | None = None
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }
