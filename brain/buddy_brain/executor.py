"""Turn an EditPlan into the editor's real Timeline and validate it with the editor's own rules
(`backend/app/timeline.py`): overlapping clips, out-of-range values, too many clips, bad transitions all fail here."""
from __future__ import annotations

import os
import sys
import uuid

from .plan import ASPECTS, Asset, Brief, EditPlan

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

from app.timeline import ColorGrade, Timeline  # noqa: E402  (the real editor schema)

FPS = 30
GRADE_PRESETS = {          # values inside the ranges the renderer accepts
    "natural": None,
    "soft": dict(contrast=0.9, saturation=0.9, gamma=(1.05, 1.05, 1.05)),
    "punchy": dict(contrast=1.2, saturation=1.25),
    "warm": dict(temperature=0.25, saturation=1.05, contrast=1.05),
    "cool_dark": dict(temperature=-0.2, exposure=-0.3, contrast=1.15, saturation=0.85),
    "bright": dict(exposure=0.2, saturation=1.15),
}
TRANSITION_FRAMES = 12


def asset_uuid(asset_id: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"buddy-brain/{asset_id}")


def to_timeline(plan: EditPlan, brief: Brief, assets: list[Asset]) -> Timeline:
    """Raises ValueError for any plan the editor could not execute exactly as written."""
    by_id = {a.id: a for a in assets}
    W, H = ASPECTS[brief.aspect]
    grade = GRADE_PRESETS[plan.grade]
    clips, t = [], 0
    for i, s in enumerate(plan.shots):
        a = by_id.get(s.asset)
        if a is None or a.kind != "video":
            raise ValueError(f"shot {i}: unknown video asset {s.asset}")
        if not (0 <= s.start < s.end <= a.duration + 1e-6):
            raise ValueError(f"shot {i}: {s.start}-{s.end} outside {s.asset} (0-{a.duration})")
        fin, fout = round(s.start * FPS), round(s.end * FPS)
        if fout - fin < 2:
            raise ValueError(f"shot {i}: shorter than 2 frames")
        clip = {"id": f"c{i}", "asset_id": str(asset_uuid(s.asset)), "start": t, "in": fin, "out": fout}
        if grade:
            clip["color"] = ColorGrade(**grade).model_dump()
        if i and s.transition != "cut":
            clip["transition_in"] = {"type": s.transition, "frames": min(TRANSITION_FRAMES, fout - fin - 1)}
        clips.append(clip)
        t += fout - fin
    tracks = [{"id": "v1", "kind": "video", "name": "Video", "clips": clips}]
    if plan.music:
        m = by_id.get(plan.music)
        if m is None or m.kind != "music":
            raise ValueError(f"unknown music asset {plan.music}")
        mlen = min(t, round(m.duration * FPS))
        tracks.append({"id": "a2", "kind": "audio", "name": "Music", "clips": [
            {"id": "m0", "asset_id": str(asset_uuid(m.id)), "start": 0, "in": 0, "out": mlen,
             "volume": plan.music_volume, "fade_out": min(30, mlen // 2)}]})
    return Timeline.model_validate({"fps": FPS, "width": W, "height": H, "tracks": tracks})
