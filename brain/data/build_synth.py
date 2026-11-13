"""BuddyPlan-Synth v0 — synthetic editing-decision dataset with provenance.

What it is: randomly generated (seeded) asset inventories shaped like the editor's media analysis, natural-language
briefs from templates, and target plans from `rules.rule_plan` (label_source = synthetic_rule_v0).
What it is NOT: real footage or expert editing judgements. It teaches the plan format, the editor's constraints and
documented pacing conventions — a starting point before licensed/consented real projects exist.

Usage: python brain/data/build_synth.py --out brain/data/synth_v0 --train 6000 --val 300 --test 400"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from buddy_brain.plan import MOODS, Asset, Brief, Example, Lock, Segment, plan_text, prompt_text  # noqa: E402
from buddy_brain.rules import MOOD_RULES, rule_plan  # noqa: E402

VERSION = "buddyplan-synth-v0"
TAGS = ("wide", "close", "action", "talk", "detail", "landscape")
SUBJECTS = ("Goa beach trip", "Diwali at home", "street food tour in Hyderabad", "college fest", "morning run",
            "wedding sangeet", "Kerala backwaters", "unboxing a new phone", "cricket match with friends",
            "Himalayan trek", "cooking biryani", "city night drive", "temple festival", "product launch event")
PHRASES = {
    "calm": ("peaceful", "slow and calm", "relaxing", "gentle"),
    "energetic": ("high-energy", "fast and punchy", "hype", "energetic"),
    "emotional": ("emotional", "heartfelt", "touching", "nostalgic"),
    "suspenseful": ("suspenseful", "mysterious", "tense", "thriller-style"),
    "happy": ("happy", "cheerful", "fun", "joyful"),
    "documentary": ("documentary-style", "informative", "story-driven documentary", "factual"),
}
FORMATS = {"16:9": ("YouTube video", "landscape video"), "9:16": ("Short", "Reel", "vertical video"), "1:1": ("square post",)}


def make_video(rng: random.Random, vid: str) -> Asset:
    t, segs = 0.0, []
    dur = round(rng.uniform(8, 90), 1)
    while t < dur - 0.5:
        L = round(min(dur - t, rng.uniform(1.5, 12)), 1)
        if L < 0.5:
            break
        q = rng.betavariate(5, 2) if rng.random() > 0.2 else rng.uniform(0.05, 0.44)
        segs.append(Segment(start=round(t, 1), end=round(t + L, 1), quality=round(q, 2), tag=rng.choice(TAGS),
                            motion=rng.choice(("low", "med", "high"))))
        t = round(t + L, 1)
    return Asset(id=vid, kind="video", duration=segs[-1].end, segments=segs)


def make_example(rng: random.Random, idx: int, split: str) -> Example | None:
    n = rng.randint(1, 5)
    assets = [make_video(rng, f"A{i + 1}") for i in range(n)]
    if rng.random() < 0.55:
        assets.append(Asset(id="M1", kind="music", duration=round(rng.uniform(60, 240), 1), bpm=rng.choice((80, 96, 110, 120, 128, 140))))
    mood = rng.choice(MOODS)
    aspect = rng.choice(list(FORMATS))
    target = float(rng.choice((10, 15, 20, 25, 30, 40, 45, 60)))
    lo = MOOD_RULES[mood]["length"][0]
    usable = sum(s.end - s.start for a in assets if a.kind == "video" for s in a.segments if s.quality >= 0.45 and s.end - s.start >= lo)
    if usable < target * 1.3:
        return None                               # not enough good footage for this brief: skip, regenerate
    lock = None
    if rng.random() < 0.25:
        a = rng.choice([a for a in assets if a.kind == "video"])
        good = [s for s in a.segments if s.quality >= 0.45 and s.end - s.start >= 2]
        if good:
            s = rng.choice(good)
            L = round(min(s.end - s.start, rng.uniform(2, 5)), 1)
            lock = Lock(asset=a.id, start=s.start, end=round(s.start + L, 1))
    fmt = rng.choice(FORMATS[aspect])
    text = rng.choice((
        f"Make a {rng.choice(PHRASES[mood])} {int(target)}-second {fmt} about my {rng.choice(SUBJECTS)}.",
        f"{rng.choice(PHRASES[mood]).capitalize()} {fmt} from these clips, {int(target)} seconds.",
        f"Edit my {rng.choice(SUBJECTS)} footage into a {int(target)}s {fmt}. Keep it {rng.choice(PHRASES[mood])}.",
    ))
    if lock:
        text += f" Start with the shot from {lock.asset} at {lock.start:.1f}s."
    brief = Brief(text=text, mood=mood, target_s=target, aspect=aspect, lock=lock)
    plan = rule_plan(brief, assets)
    from buddy_brain.metrics import score
    chk = score(plan_text(plan), brief, assets)
    if not (chk["fully_valid"] and chk["pacing_ok"] and chk["transition_ok"]):
        return None                               # labels must satisfy every rule they teach
    return Example(id=f"{split}-{idx:05d}", brief=brief, assets=assets, plan=plan.model_dump(), source="generated:build_synth.py",
                   license="project-owned (synthetic, no third-party media)", label_source="synthetic_rule_v0", dataset_version=VERSION)


def build(split: str, n: int, seed: int, out: str) -> dict:
    rng = random.Random(seed)
    path = os.path.join(out, f"{split}.jsonl")
    made = 0
    with open(path, "w") as f:
        while made < n:
            ex = make_example(rng, made, split)
            if ex is None:
                continue
            from buddy_brain.plan import EditPlan
            rec = ex.model_dump()
            rec["prompt"] = prompt_text(ex.brief, ex.assets)
            rec["completion"] = plan_text(EditPlan.model_validate(ex.plan))
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            made += 1
    sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
    return {"split": split, "file": os.path.basename(path), "records": n, "seed": seed, "sha256": sha}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "synth_v0"))
    ap.add_argument("--train", type=int, default=6000)
    ap.add_argument("--val", type=int, default=300)
    ap.add_argument("--test", type=int, default=400)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    files = [build("train", a.train, 1001, a.out), build("val", a.val, 2002, a.out), build("test", a.test, 3003, a.out)]
    manifest = {"dataset_version": VERSION, "label_source": "synthetic_rule_v0",
                "warning": "Synthetic labels from documented rules. Not real footage, not expert annotations.",
                "generator": "brain/data/build_synth.py", "files": files}
    json.dump(manifest, open(os.path.join(a.out, "MANIFEST.json"), "w"), indent=2)
    print(json.dumps(manifest, indent=2))
