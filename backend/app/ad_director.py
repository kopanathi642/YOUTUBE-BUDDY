"""Deterministic CPU ad assembly from the project's measured clip lengths and scene boundaries."""
import math
import re
from uuid import UUID

from pydantic import BaseModel, Field

from .timeline import Timeline, default_timeline


class AdBrief(BaseModel):
    brief: str = Field(min_length=1, max_length=1500)
    videos: list[UUID] = Field(min_length=1, max_length=40)
    reveal: UUID
    music: UUID | None = None
    bpm: int | None = Field(None, ge=40, le=240)


def build_ad(brief: AdBrief, assets: dict, fps: int, width: int, height: int) -> dict:
    """Reserve the reveal, then fill beat-aligned slots from unused source intervals."""
    if len(set(brief.videos)) != len(brief.videos) or brief.reveal not in brief.videos:
        raise ValueError("Select distinct videos and choose a reveal from those videos.")
    def frames(aid, kind):
        asset = assets.get(aid)
        if not asset or asset.kind != kind or not asset.duration_s:
            raise ValueError(f"Select a ready {kind} from this project.")
        return math.floor(asset.duration_s * fps)

    total = 30 * fps
    lengths = {aid: frames(aid, "video") for aid in brief.videos}
    if sum(lengths.values()) < total:
        raise ValueError("Add at least 30 seconds of footage. The cut uses each source interval once.")
    reveal_length = min(4 * fps, lengths[brief.reveal])
    if reveal_length < fps:
        raise ValueError("Choose a reveal clip at least one second long.")
    lengths[brief.reveal] -= reveal_length
    timeline = default_timeline(fps, width, height)
    tracks = {track["id"]: track for track in timeline["tracks"]}
    markers = []
    fast = bool(re.search(r"\b(fast|energetic|punchy)\b", brief.brief, re.I))
    cool = bool(re.search(r"\b(cool|blue|cold)\b", brief.brief, re.I))
    grade = {"temperature": -0.15 if cool else 0.12, "contrast": 1.05, "saturation": 1.04}
    def shot(aid, start, length, position, label):
        idx = len(markers)
        tracks["v1"]["clips"].append({"id": f"shot{idx}", "asset_id": aid, "start": position,
                                      "in": start, "out": start + length, "color": grade})
        markers.append({"id": f"mark{idx}", "frame": position, "name": label})

    # Split at measured scene boundaries. Round-robin selection gives each chosen video a turn.
    cuts = {}
    for aid, end in lengths.items():
        boundaries = {0, end}
        for scene in (assets[aid].analysis or {}).get("scenes", []):
            frame = round(scene["start"] * fps)
            if 0 < frame < end:
                boundaries.add(frame)
        bounds = sorted(boundaries)
        cuts[aid] = list(zip(bounds, bounds[1:]))
    position = 0
    body_end = total - reveal_length
    interval = (4 if fast else 8) * 60 / brief.bpm if brief.music and brief.bpm else (2 if fast else 4)
    while position < body_end:
        for aid in brief.videos:
            if position >= body_end or not cuts[aid]:
                continue
            start, end = cuts[aid][0]
            grid = interval * fps
            next_cut = round((math.floor((position + 0.5) / grid) + 1) * grid)
            length = min(end - start, next_cut - position, body_end - position)
            shot(aid, start, length, position, "Opening hook" if position == 0 else "Product story")
            position += length
            if start + length == end:
                cuts[aid].pop(0)
            else:
                cuts[aid][0] = (start + length, end)
    shot(brief.reveal, lengths[brief.reveal], reveal_length, position, "Final product reveal")
    if brief.music:
        if frames(brief.music, "audio") < total:
            raise ValueError("Choose at least 30 seconds of music for a continuous music track.")
        tracks["a2"]["clips"].append({"id": "music", "asset_id": brief.music, "start": 0, "in": 0,
                                      "out": total, "volume": 0.32, "fade_out": fps})
    timeline.update(markers=markers, notes=brief.brief)
    return Timeline.model_validate(timeline).model_dump(mode="json", by_alias=True)
