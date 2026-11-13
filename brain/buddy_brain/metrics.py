"""Objective, automatic metrics for an editing plan. None of these measures taste; they measure whether the plan
is executable and follows the brief's hard constraints and the documented conventions it was trained on."""
from __future__ import annotations

import statistics

from .executor import to_timeline
from .plan import LOW_QUALITY, Asset, Brief, EditPlan, parse_plan
from .rules import MOOD_RULES

KEYS = ("parsed", "executable", "duration_ok", "lock_ok", "quality_ok", "pacing_ok", "transition_ok", "grade_ok",
        "music_ok", "fully_valid")


def score(text: str, brief: Brief, assets: list[Asset], reference: EditPlan | None = None) -> dict:
    r = {k: False for k in KEYS}
    r.update(duration_err_s=None, shot_iou=None, error=None)
    try:
        plan = parse_plan(text)
        r["parsed"] = True
    except Exception as e:  # noqa: BLE001
        r["error"] = f"parse: {e}"[:200]
        return r
    try:
        tl = to_timeline(plan, brief, assets)
        r["executable"] = True
    except Exception as e:  # noqa: BLE001
        r["error"] = f"execute: {e}"[:200]
        return r
    total = tl.duration_frames / tl.fps
    r["duration_err_s"] = round(abs(total - brief.target_s), 2)
    r["duration_ok"] = r["duration_err_s"] <= 1.0
    L = brief.lock
    first = plan.shots[0]
    r["lock_ok"] = (L is None) or (first.asset == L.asset and abs(first.start - L.start) <= 0.05 and abs(first.end - L.end) <= 0.05)
    by_id = {a.id: a for a in assets}
    bad = 0
    for s in plan.shots:
        for seg in by_id[s.asset].segments:
            overlap = min(s.end, seg.end) - max(s.start, seg.start)
            if seg.quality < LOW_QUALITY and overlap > 0.5:
                bad += 1
    r["quality_ok"] = bad == 0
    rules = MOOD_RULES[brief.mood]
    free = [s for s in plan.shots[(1 if L else 0):]]
    lengths = [s.end - s.start for s in free[:-1]] or [s.end - s.start for s in free] or [0]
    lo, hi = rules["length"]
    r["pacing_ok"] = lo - 0.3 <= statistics.median(lengths) <= hi + 0.3
    r["transition_ok"] = all(s.transition == rules["transition"] for s in free if s is not plan.shots[0])
    r["grade_ok"] = plan.grade == rules["grade"]
    has_music = any(a.kind == "music" for a in assets)
    r["music_ok"] = bool(plan.music) == (has_music and brief.mood != "documentary")
    r["fully_valid"] = all(r[k] for k in ("executable", "duration_ok", "lock_ok", "quality_ok"))
    if reference is not None:
        r["shot_iou"] = round(_iou(plan, reference), 3)
    return r


def _iou(a: EditPlan, b: EditPlan) -> float:
    """Time overlap between the source ranges two plans use (per asset)."""
    def spans(p):
        d = {}
        for s in p.shots:
            d.setdefault(s.asset, []).append((s.start, s.end))
        return d
    A, B = spans(a), spans(b)
    inter = union = 0.0
    for k in set(A) | set(B):
        xs, ys = A.get(k, []), B.get(k, [])
        ia = sum(max(0.0, min(x1, y1) - max(x0, y0)) for x0, x1 in xs for y0, y1 in ys)
        inter += ia
        union += sum(x1 - x0 for x0, x1 in xs) + sum(y1 - y0 for y0, y1 in ys) - ia
    return inter / union if union else 0.0


def summarize(rows: list[dict]) -> dict:
    n = len(rows)
    out = {"n": n}
    for k in KEYS:
        out[k] = round(sum(1 for r in rows if r[k]) / n, 4) if n else 0
    errs = [r["duration_err_s"] for r in rows if r["duration_err_s"] is not None]
    out["mean_duration_err_s"] = round(sum(errs) / len(errs), 3) if errs else None
    ious = [r["shot_iou"] for r in rows if r.get("shot_iou") is not None]
    out["mean_shot_iou_vs_reference"] = round(sum(ious) / len(ious), 3) if ious else None
    return out
