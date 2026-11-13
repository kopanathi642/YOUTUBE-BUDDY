"""Two non-learned planners.

`rule_plan`  — synthetic_rule_v0, the label generator for BuddyPlan-Synth v0. It encodes common, documented editing
               conventions (pacing per mood, skip technically bad footage, keep the user's locked shot, hit the target
               length, music under non-documentary edits). These are conventions, not expert judgements.
`naive_plan` — the baseline any trained model must beat: take each clip from the start until the time runs out."""
from __future__ import annotations

from .plan import LOW_QUALITY, Asset, Brief, EditPlan, Shot

# shot length range (s), transition into each shot, colour preset, preferred shot tags
MOOD_RULES = {
    "calm":        dict(length=(4.0, 7.0), transition="fade", grade="soft", prefer=("wide", "landscape")),
    "energetic":   dict(length=(1.2, 2.5), transition="cut", grade="punchy", prefer=("action", "close")),
    "emotional":   dict(length=(3.0, 6.0), transition="fadeblack", grade="warm", prefer=("close", "detail")),
    "suspenseful": dict(length=(2.0, 4.0), transition="cut", grade="cool_dark", prefer=("detail", "close")),
    "happy":       dict(length=(2.0, 3.5), transition="slideleft", grade="bright", prefer=("action", "wide")),
    "documentary": dict(length=(4.0, 8.0), transition="cut", grade="natural", prefer=("talk", "wide")),
}


def _r(x: float) -> float:
    return round(x + 1e-9, 1)


def rule_plan(brief: Brief, assets: list[Asset]) -> EditPlan:
    rules = MOOD_RULES[brief.mood]
    lo, hi = rules["length"]
    want = _r((lo + hi) / 2)
    videos = [a for a in assets if a.kind == "video"]
    music = next((a for a in assets if a.kind == "music"), None)

    # candidates: usable segments, scored by quality + fit to the mood's preferred shot types
    cands = []
    for ai, a in enumerate(videos):
        for si, s in enumerate(a.segments):
            if s.quality < LOW_QUALITY or s.end - s.start < lo:
                continue
            if brief.lock and brief.lock.asset == a.id and s.start < brief.lock.end and s.end > brief.lock.start:
                continue                      # don't reuse the locked footage
            score = s.quality + (0.25 if s.tag in rules["prefer"] else 0)
            # a long good segment can give several shots (later pieces rank a little lower)
            n = max(1, int((s.end - s.start) // want))
            piece = (s.end - s.start) / n
            for k in range(n):
                cands.append((score - 0.05 * k, ai, si * 100 + k, a, s.model_copy(update={"start": s.start + k * piece, "end": s.start + (k + 1) * piece})))
    cands.sort(key=lambda c: (-c[0], c[1], c[2]))

    shots: list[Shot] = []
    total = 0.0
    if brief.lock:
        L = brief.lock
        shots.append(Shot(asset=L.asset, start=_r(L.start), end=_r(L.end), transition="cut"))
        total = _r(L.end - L.start)
    picked = []
    for score, ai, si, a, s in cands:
        if total >= brief.target_s - 0.05:
            break
        seg_len = s.end - s.start
        length = min(want, seg_len, brief.target_s - total)
        if length < min(lo, brief.target_s - total) - 1e-6:
            continue
        start = _r(s.start + 0.25 * (seg_len - length))
        end = _r(min(start + length, s.end))
        if end - start <= 0.05:
            continue
        picked.append((ai, start, a.id, end))
        total = _r(total + (end - start))
    # story order: by asset, then by time inside the asset
    for ai, start, aid, end in sorted(picked):
        shots.append(Shot(asset=aid, start=start, end=end, transition=rules["transition"] if shots else "cut"))
    plan = EditPlan(shots=shots, grade=rules["grade"])
    if music and brief.mood != "documentary":
        plan.music = music.id
        plan.music_volume = 0.7 if brief.mood == "energetic" else 0.5
    return plan


def naive_plan(brief: Brief, assets: list[Asset]) -> EditPlan:
    shots, total = [], 0.0
    for a in (a for a in assets if a.kind == "video"):
        if total >= brief.target_s:
            break
        length = min(a.duration, brief.target_s - total)
        shots.append(Shot(asset=a.id, start=0.0, end=_r(length), transition="cut"))
        total += _r(length)
    return EditPlan(shots=shots or [Shot(asset=assets[0].id, start=0, end=1.0)])
