from datetime import datetime
from pydantic import BaseModel


class AIGenerationRequest(BaseModel):
    upload_id: int | None = None
    agent_name: str
    prompt: str | None = None
    metadata: dict | None = None


class AIGenerationResponse(BaseModel):
    id: int
    user_id: int
    upload_id: int | None = None
    agent_name: str
    prompt: str | None = None
    output: dict | str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
