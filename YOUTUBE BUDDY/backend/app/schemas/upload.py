from datetime import datetime
from pydantic import BaseModel


class UploadCreate(BaseModel):
    project_id: int | None = None
    filename: str
    content_type: str
    size_bytes: int
    duration_seconds: int | None = None
    storage_path: str


class UploadResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    filename: str
    content_type: str
    storage_path: str
    preview_url: str | None = None
    duration_seconds: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
