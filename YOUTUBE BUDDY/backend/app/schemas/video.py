from pydantic import BaseModel
from typing import List


class VideoMetadata(BaseModel):
    filename: str
    duration: float
    width: int
    height: int
    codec: str
    bitrate: int
    frame_rate: float


class VideoAnalysisResult(BaseModel):
    transcript_id: int | None = None
    clip_candidates: List[dict]
    suggested_titles: List[str]
    recommended_ratios: List[str]
