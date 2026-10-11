from datetime import datetime
from pydantic import BaseModel


class RenderJobRequest(BaseModel):
    upload_id: int
    job_type: str
    metadata: dict | None = None


class RenderJobResponse(BaseModel):
    id: int
    upload_id: int
    user_id: int
    job_type: str
    status: str
    progress: int
    result_path: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
