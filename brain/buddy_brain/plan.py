"""Buddy Editing Planner — data contract.

Input  = an editing brief + an inventory of analysed assets (what `backend/app/analysis.py` produces, simplified).
Output = an EditPlan: ordered shots with source in/out seconds, the transition into each shot, optional music,
         and a colour preset. The executor turns a plan into the editor's real Timeline, so "valid" means
         "the editor accepts it and can render it", not just "parses as JSON".

The plan format is deliberately compact so a small model can learn it; rationale text is optional."""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PLAN_VERSION = "bep-0.1"
MOODS = ("calm", "energetic", "emotional", "suspenseful", "happy", "documentary")
ASPECTS = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}
TRANSITIONS = ("cut", "fade", "fadeblack", "wipeleft", "slideleft")
GRADES = ("natural", "soft", "punchy", "warm", "cool_dark", "bright")
LOW_QUALITY = 0.45          # segments below this are technically unusable (blur, exposure, shake)
END = "<END>"


class Segment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    quality: float = Field(ge=0, le=1)       # technical quality (sharpness, exposure, stability)
    tag: str                                 # wide | close | action | talk | detail | landscape
    motion: Literal["low", "med", "high"]


class Asset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["video", "music"]
    duration: float = Field(gt=0)
    segments: list[Segment] = Field(default_factory=list)   # video only, in time order, covering the clip
    bpm: int | None = None                                  # music only


class Lock(BaseModel):
    """A shot the user fixed: it must open the edit unchanged."""
    asset: str
    start: float
    end: float


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str
    mood: Literal[MOODS]                     # type: ignore[valid-type]
    target_s: float = Field(gt=0, le=600)
    aspect: Literal["16:9", "9:16", "1:1"]
    lock: Lock | None = None


class Example(BaseModel):
    """One training/eval record (provenance travels with the record)."""
    id: str
    brief: Brief
    assets: list[Asset]
    plan: dict | None = None
    source: str
    license: str
    label_source: str
    dataset_version: str


class Shot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    transition: Literal[TRANSITIONS] = "cut"    # type: ignore[valid-type]


class EditPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shots: list[Shot] = Field(min_length=1, max_length=120)
    music: str | None = None
    music_volume: float = Field(0.5, ge=0, le=1)
    grade: Literal[GRADES] = "natural"           # type: ignore[valid-type]


# ---------------------------------------------------------------- text format (what the model reads and writes)

def _n(x: float) -> str:
    return f"{x:.1f}"


def prompt_text(brief: Brief, assets: list[Asset]) -> str:
    lines = [f"BRIEF: {brief.text}", f"TARGET: {_n(brief.target_s)}s {brief.aspect} mood={brief.mood}"]
    if brief.lock:
        lines.append(f"LOCK: {brief.lock.asset} {_n(brief.lock.start)}-{_n(brief.lock.end)}")
    lines.append("ASSETS:")
    for a in assets:
        if a.kind == "music":
            lines.append(f"{a.id} music {_n(a.duration)}s bpm {a.bpm}")
        else:
            segs = " | ".join(f"{_n(s.start)}-{_n(s.end)} q{int(round(s.quality * 100)):02d} {s.tag} {s.motion}" for s in a.segments)
            lines.append(f"{a.id} video {_n(a.duration)}s | {segs}")
    lines.append("PLAN:")
    return "\n".join(lines) + "\n"


def plan_text(plan: EditPlan) -> str:
    """Compact, line-based plan the model writes. One shot per line: `S asset start end transition`."""
    out = [f"S {s.asset} {_n(s.start)} {_n(s.end)} {s.transition}" for s in plan.shots]
    if plan.music:
        out.append(f"M {plan.music} {plan.music_volume:.1f}")
    out.append(f"G {plan.grade}")
    return "\n".join(out) + f"\n{END}"


def parse_plan(text: str) -> EditPlan:
    """Strict parser: anything unexpected raises (counted as an invalid plan by the metrics)."""
    body = text.split(END)[0].strip()
    shots, music, vol, grade = [], None, 0.5, "natural"
    for line in body.splitlines():
        p = line.split()
        if not p:
            continue
        if p[0] == "S" and len(p) == 5:
            shots.append(Shot(asset=p[1], start=float(p[2]), end=float(p[3]), transition=p[4]))
        elif p[0] == "M" and len(p) == 3:
            music, vol = p[1], float(p[2])
        elif p[0] == "G" and len(p) == 2:
            grade = p[1]
        else:
            raise ValueError(f"unrecognised plan line: {line[:60]!r}")
    return EditPlan(shots=shots, music=music, music_volume=vol, grade=grade)


def to_json(plan: EditPlan) -> str:
    return json.dumps(plan.model_dump(), separators=(",", ":"))
