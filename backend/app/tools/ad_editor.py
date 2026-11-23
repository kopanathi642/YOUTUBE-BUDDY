"""AI Ad Editor: clips + a brief → a planned, cut, graded, scored, rendered ad on a CPU-only worker.

Pipeline (every step real, every decision recorded):
  1. INSPECT   each clip: scene cuts, then per shot window sharpness, exposure, colourfulness, motion, faces (OpenCV).
               Cached on the asset (analysis["ad_shots"]) so revisions don't re-analyse footage.
  2. READ      the brief: length, aspect, look, pace, reveal, end title (rules; explicit options win).
  3. PLAN      a story arc — hook → build → climax → reveal — with cut points on the music's beats.
  4. SELECT    a shot window for every slot from the scores, with the reason written down.
  5. ASSEMBLE  a normal editable timeline (same format as the editor): cover-crop per aspect, colour grade, vignette,
               push-in on the reveal, dissolve into it, end title, music bed with fades.
  6. RENDER    with the export compiler (FFmpeg), master audio to -14 LUFS.
  7. CHECK     duration, streams, black frames, loudness — reported pass/fail.
  Revisions: pass `previous` (an earlier run) + `changes` ("faster, warmer, 15 seconds, vertical") — the cached analysis
  and the earlier settings are reused; only the plan and the render are redone.
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
import uuid

from .. import analysis, media
from ..models import Generation
from ..timeline import AssetInfo, Timeline, compile_ffmpeg, default_timeline
from .run import RunCtx, ToolError
from .story_edit import FEELINGS, FORMATS as STORY_FORMATS, direction, story_picks

ANALYSIS_KEY = "ad_shots_v1"
FORMATS = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080), "4:5": (1080, 1350)}
LOOKS = {
    "elegant warm": {"temperature": 0.16, "contrast": 1.08, "saturation": 1.04, "lift": (0.015, 0.008, 0.0), "gamma": (1.02, 1.0, 0.98)},
    "cool cinematic": {"temperature": -0.18, "contrast": 1.12, "saturation": 0.9, "lift": (0.0, 0.01, 0.03)},
    "teal & orange": {"temperature": 0.05, "contrast": 1.14, "saturation": 1.1, "lift": (0.0, 0.02, 0.04), "gain": (1.05, 1.0, 0.94)},
    "natural": {"contrast": 1.04, "saturation": 1.03},
    "black & white": {"contrast": 1.2, "saturation": 0.0},
}
PACES = {"calm": (4, 8, 2), "medium": (2, 4, 1), "energetic": (1, 2, 1)}   # beats per shot: build min, build max, climax
PACE_BPM = {"calm": 84, "medium": 100, "energetic": 124}                   # cut grid when there is no music
WINDOW_S = 4.0


# ---------------------------------------------------------------- 2. reading the brief
def read_brief(brief: str, p: dict) -> dict:
    """Settings from the brief text; an explicit option (not "auto") always wins. Returns settings + what was read."""
    b = (brief or "").lower()
    genre, feeling = direction(b, p.get("genre"), p.get("feeling"))
    advert = genre == "Advertisement"
    why = {}

    def pick(key, found, reason):
        v = p.get(key)
        if v not in (None, "", "auto"):
            why[key] = "you chose it"
            return v
        if found is not None:
            why[key] = reason
            return found
        return None

    m = re.search(r"(\d{1,3})\s*[- ]?\s*(?:s\b|sec|second)", b)
    dur = pick("duration", int(m.group(1)) if m else None, f"brief says “{m.group(0)}”" if m else "")
    dur = int(dur or 30)
    if "duration" not in why:
        why["duration"] = "default draft length"
    asp = None
    for words, a in (((r"vertical|9:16|reel|shorts?\b|tiktok"), "9:16"), ((r"square|1:1"), "1:1"), ((r"4:5|portrait post"), "4:5"),
                     ((r"16:9|landscape|youtube video|widescreen|tv"), "16:9")):
        mm = re.search(words, b)
        if mm:
            asp = (a, f"brief mentions “{mm.group(0)}”")
            break
    aspect = pick("aspect", asp[0] if asp else None, asp[1] if asp else "") or "16:9"
    why.setdefault("aspect", "default (landscape)")
    lk = None
    for words, l in ((r"black and white|black & white|monochrome|b&w", "black & white"), (r"teal|orange|blockbuster|action", "teal & orange"),
                     (r"cool|cold|blue|tech|modern", "cool cinematic"), (r"elegant|warm|luxur|premium|golden", "elegant warm"),
                     (r"natural|realistic|documentary", "natural"), (r"emotional|wedding|romantic", "elegant warm")):   # colour words before mood words
        mm = re.search(words, b)
        if mm:
            lk = (l, f"brief mentions “{mm.group(0)}”")
            break
    look = pick("look", lk[0] if lk else None, lk[1] if lk else "") or ("elegant warm" if advert else FEELINGS[feeling][2])
    why.setdefault("look", f"{feeling} colour palette")
    pc = None
    for words, pv in ((r"energetic|fast|hype|punchy|action|sport|upbeat|exciting", "energetic"), (r"calm|slow|gentle|soft|relax|serene", "calm"),
                      (r"emotional|cinematic|story|elegant", "medium")):
        mm = re.search(words, b)
        if mm:
            pc = (pv, f"brief mentions “{mm.group(0)}”")
            break
    pace = pick("pace", pc[0] if pc else None, pc[1] if pc else "") or "medium"
    why.setdefault("pace", "default")
    reveal = bool(re.search(r"reveal|product shot|end on|final shot|logo", b)) or bool(p.get("reveal"))
    return {"genre": genre, "feeling": feeling, "brief": brief, "duration": max(6, min(120, dur)), "aspect": aspect if aspect in FORMATS else "16:9", "look": look if look in LOOKS else "elegant warm",
            "pace": pace if pace in PACES else "medium", "reveal": reveal, "why": why}


def apply_changes(settings: dict, changes: str) -> tuple[dict, list[str]]:
    """Plain-language revision requests → setting changes. Returns new settings and what was understood."""
    c = (changes or "").lower()
    s, done = dict(settings), []
    order = ["calm", "medium", "energetic"]
    if re.search(r"faster|more energy|quicker|punchier|more cuts", c):
        s["pace"] = order[min(2, order.index(s["pace"]) + 1)]
        done.append(f"pace → {s['pace']}")
    if re.search(r"slower|calmer|fewer cuts|longer shots|more breathing", c):
        s["pace"] = order[max(0, order.index(s["pace"]) - 1)]
        done.append(f"pace → {s['pace']}")
    for words, l in ((r"black and white|black & white|b&w|monochrome", "black & white"), (r"warmer|warm", "elegant warm"),
                     (r"cooler|cool|colder", "cool cinematic"), (r"teal|orange", "teal & orange"), (r"natural|less grad|no grade", "natural")):
        if re.search(words, c):
            s["look"] = l
            done.append(f"look → {l}")
            break
    m = re.search(r"(\d{1,3})\s*[- ]?\s*(?:s\b|sec|second)", c)
    if m:
        s["duration"] = max(6, min(120, int(m.group(1))))
        done.append(f"length → {s['duration']} s")
    elif re.search(r"shorter", c):
        s["duration"] = max(6, int(s["duration"] * 0.66))
        done.append(f"length → {s['duration']} s")
    elif re.search(r"longer", c):
        s["duration"] = min(120, int(s["duration"] * 1.5))
        done.append(f"length → {s['duration']} s")
    for words, a in ((r"vertical|9:16|reel|short", "9:16"), (r"square|1:1", "1:1"), (r"4:5", "4:5"), (r"landscape|16:9|horizontal", "16:9")):
        if re.search(words, c):
            s["aspect"] = a
            done.append(f"format → {a}")
            break
    t = re.search(r"(?:title|tagline|end text|end card)\s*[:=]\s*[\"“]?([^\"”\n]{1,80})", changes or "", re.I)
    if t:
        s["end_title"] = t.group(1).strip()
        done.append(f"end title → “{s['end_title']}”")
    if re.search(r"no title|remove (?:the )?title", c):
        s["end_title"] = ""
        done.append("end title removed")
    if re.search(r"different (?:opening|hook|first shot)|change (?:the )?(?:hook|opening)", c):
        s["avoid_hook"] = True
        done.append("new opening shot")
    if re.search(r"different (?:reveal|ending|last shot)|change (?:the )?(?:reveal|ending)", c):
        s["avoid_reveal"] = True
        done.append("new final shot")
    if re.search(r"no music|without music|mute music", c):
        s["music_off"] = True
        done.append("music off")
    return s, done


# ---------------------------------------------------------------- 1. inspecting footage
def _colourfulness(fr) -> float:
    import numpy as np
    b, g, r = [fr[:, :, i].astype(np.float32) for i in range(3)]
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(math.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * math.sqrt(rg.mean() ** 2 + yb.mean() ** 2)) / 100.0


def inspect_clip(path: str, a) -> list[dict]:
    """Shot windows (≤ 4 s) with measured qualities, from the clip's scene cuts."""
    import cv2
    import numpy as np
    dur = float(a.duration_s or 0)
    if dur <= 0.3:
        return []
    scenes = (a.analysis or {}).get("scenes") or analysis.detect_scenes(path, dur) or [{"start": 0.0, "end": dur}]
    spans = []
    for s in scenes:
        st, en = float(s["start"]), float(s["end"])
        n = max(1, math.ceil((en - st) / WINDOW_S))
        for k in range(n):
            spans.append((st + (en - st) * k / n, st + (en - st) * (k + 1) / n))
    cascade = None
    try:
        cascade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    except Exception:  # noqa: BLE001 — face count is optional
        cascade = None
    cap = cv2.VideoCapture(path)
    out = []

    def grab(t):
        cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t) * 1000)
        ok, fr = cap.read()
        if not ok:
            return None
        h, w = fr.shape[:2]
        return cv2.resize(fr, (320, max(2, int(h * 320 / w))))

    for st, en in spans:
        if en - st < 0.4:
            continue
        ts = [st + (en - st) * f for f in (0.2, 0.5, 0.8)]
        frames = [grab(t) for t in ts]
        frames = [f for f in frames if f is not None]
        if not frames:
            continue
        grey = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
        sharp = float(np.mean([cv2.Laplacian(g, cv2.CV_64F).var() for g in grey]))
        bright = float(np.mean([g.mean() for g in grey]) / 255)
        colour = float(np.mean([_colourfulness(f) for f in frames]))
        motion = float(np.mean([np.abs(grey[i + 1].astype(np.int16) - grey[i]).mean() / 255 for i in range(len(grey) - 1)])) if len(grey) > 1 else 0.0
        faces = 0
        if cascade is not None and not cascade.empty():
            faces = max(len(cascade.detectMultiScale(g, 1.2, 5, minSize=(24, 24))) for g in grey)
        out.append({"start": round(st, 3), "end": round(en, 3), "sharp": round(sharp, 1), "bright": round(bright, 3),
                    "colour": round(colour, 3), "motion": round(motion, 4), "faces": int(faces)})
    cap.release()
    return out


def score_windows(wins: list[dict]) -> list[dict]:
    """Normalised quality scores. Exposure outside 0.12–0.9 and blur are penalised; faces and colour help."""
    if not wins:
        return wins
    # Sharpness on an absolute scale (Laplacian variance at 320 px wide): ≤ 15 is visibly blurred, ≥ 500 is crisp.
    # Absolute, not relative to the other clips, so one black or blurred clip can't make another look sharp.
    lo, hi = math.log1p(15), math.log1p(500)
    ls = [min(1.0, max(0.0, (math.log1p(w["sharp"]) - lo) / (hi - lo))) for w in wins]
    mo = [w["motion"] for w in wins]
    mlo, mhi = min(mo), max(mo)
    for w, l in zip(wins, ls):
        sharp = l
        expo = 1.0 if 0.18 <= w["bright"] <= 0.82 else (0.5 if 0.1 <= w["bright"] <= 0.9 else 0.1)
        colour = min(1.0, w["colour"] / 0.6)
        motion = (w["motion"] - mlo) / (mhi - mlo) if mhi > mlo else 0.3
        face = 1.0 if w["faces"] else 0.0
        w["quality"] = round(0.45 * sharp + 0.25 * expo + 0.2 * colour + 0.1 * face, 3)
        w["energy"] = round(0.6 * motion + 0.4 * colour, 3)
        w["calm"] = round(1 - motion, 3)
    return wins


# ---------------------------------------------------------------- 3. beats
def beats_for(path: str | None, duration: float, pace: str) -> tuple[list[float], float, str]:
    """Beat times covering `duration`. From the music when there is some (spectral-flux tracker), else a steady grid."""
    if path:
        import numpy as np
        sr, hop, n = 22050, 512, 2048
        raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr),
                              "-t", f"{duration + 2:.2f}", "-f", "f32le", "-"], capture_output=True, timeout=600).stdout
        x = np.frombuffer(raw, dtype=np.float32)
        if x.size > sr * 3:
            frames = 1 + (x.size - n) // hop
            win = np.hanning(n).astype(np.float32)
            spec = np.abs(np.fft.rfft(np.stack([x[i * hop:i * hop + n] * win for i in range(frames)]), axis=1))
            flux = np.maximum(0, np.diff(np.log1p(spec), axis=0)).sum(axis=1)
            flux = (flux - flux.mean()) / (flux.std() + 1e-9)
            fr = sr / hop
            ac = np.correlate(flux, flux, "full")[flux.size - 1:]
            lo, hi = int(fr * 60 / 180), int(fr * 60 / 60)
            if hi > lo + 1 and ac.size > hi:
                lag = lo + int(np.argmax(ac[lo:hi]))
                phase = int(np.argmax([flux[p::lag].sum() for p in range(lag)]))
                beats = [(phase + k * lag) / fr for k in range((flux.size - phase) // lag)]
                bpm = 60 * fr / lag
                if bpm > 130:   # cut on every other beat for fast songs
                    beats, bpm = beats[::2], bpm / 2
                if len(beats) >= 4:
                    return [round(b, 3) for b in beats], round(bpm, 1), "music beats"
    bpm = PACE_BPM[pace]
    step = 60 / bpm
    return [round(k * step, 3) for k in range(int(duration / step) + 2)], float(bpm), f"steady {bpm} BPM grid (no music)"


# ---------------------------------------------------------------- 4–5. plan, select, assemble
def plan_cuts(D: float, beats: list[float], pace: str, reveal_s: float) -> list[tuple[str, float, float]]:
    """(section, start_s, end_s) slots on beat boundaries: hook, build…, climax…, reveal."""
    bmin, bmax, cl = PACES[pace]
    grid = [b for b in beats if 0 < b < D - reveal_s - 0.3]

    def next_beat(t, nb):
        later = [b for b in grid if b > t + 0.55]
        return later[min(nb, len(later)) - 1] if later else None

    slots, t = [], 0.0
    hook_end = next_beat(0, max(2, bmax)) or min(3.0, D * 0.12)
    slots.append(("hook", 0.0, hook_end))
    t, k = hook_end, 0
    climax_from = (D - reveal_s) * 0.72
    while t < D - reveal_s - 0.5:
        sec = "climax" if t >= climax_from else "build"
        nb = cl if sec == "climax" else (bmax if k % 2 == 0 else bmin)
        e = next_beat(t, nb)
        if e is None or e > D - reveal_s:
            e = D - reveal_s
        if e - t < 0.5:
            if slots and slots[-1][0] != "hook":
                slots[-1] = (slots[-1][0], slots[-1][1], e)
            break
        slots.append((sec, t, e))
        t, k = e, k + 1
    slots.append(("reveal", D - reveal_s, D))
    return slots


def choose(pool: list[dict], section: str, need: float, used: set, last_clip, avoid: set) -> dict | None:
    key = {"hook": lambda w: w["quality"] + 0.8 * w["energy"], "build": lambda w: w["quality"] + 0.2 * w["energy"],
           "climax": lambda w: 0.6 * w["quality"] + w["energy"], "reveal": lambda w: w["quality"] + 0.6 * w["calm"] + 0.3 * (w["faces"] > 0)}[section]
    usable = [w for w in pool if usable_shot(w)] or pool          # too dark/blown-out/blurred shots only if nothing else exists
    fits = [w for w in usable if w["end"] - w["start"] >= min(need, w["clip_dur"]) - 1e-3] or usable
    for rule in ("fresh", "fresh-any-clip", "reuse"):
        cands = [w for w in fits if w["uid"] not in avoid and (rule == "reuse" or w["uid"] not in used) and (rule != "fresh" or w["clip"] != last_clip)]
        if rule == "reuse":   # out of fresh shots: reuse the least-used good ones, never the same clip twice in a row if avoidable
            cands = sorted(cands, key=lambda w: (used_count(w, used), w["clip"] == last_clip, -key(w)))[:3]
        if cands:
            return max(cands, key=lambda w: (key(w), -w["start"])) if rule != "reuse" else cands[0]
    return max(usable, key=key) if usable else None


def usable_shot(w: dict) -> bool:
    return 0.08 <= w["bright"] <= 0.95 and w["sharp"] >= 15 and w["quality"] >= 0.2


def used_count(w: dict, used) -> int:
    return sum(1 for u in used if u == w["uid"])


def reason_for(section: str, w: dict) -> str:
    bits = []
    if w["quality"] >= 0.7:
        bits.append("sharp, well exposed")
    if w["faces"]:
        bits.append("a person in frame")
    if w["energy"] >= 0.6:
        bits.append("lots of movement")
    elif w["calm"] >= 0.8:
        bits.append("steady, calm framing")
    if w["colour"] >= 0.45:
        bits.append("rich colour")
    role = {"hook": "Strong opening image to stop the scroll", "build": "Builds the story", "climax": "Fast cut at the peak",
            "reveal": "Calm, clean hero shot for the reveal"}[section]
    return role + (": " + ", ".join(bits) if bits else "")


def _cover(a, W: int, H: int) -> dict:
    if not (a.width and a.height):
        return {"x": 0, "y": 0, "scale": 1, "rotation": 0, "opacity": 1}
    contain, cover = min(W / a.width, H / a.height), max(W / a.width, H / a.height)
    sx = (a.analysis or {}).get("subject_center_x") or 0.5
    limit = max(0.0, (a.width * cover - W) / 2)
    return {"x": round(max(-limit, min(limit, -(sx - 0.5) * a.width * cover)), 1), "y": 0, "scale": round(min(10, cover / contain), 4),
            "rotation": 0, "opacity": 1}


def build(rc: RunCtx, assets: dict, pool: list[dict], s: dict, music, beats: list[float], prev_plan: dict | None) -> tuple[dict, list[dict]]:
    fps = 30
    W, H = FORMATS[s["aspect"]]
    D = float(s["duration"])
    reveal_s = max(2.5, min(6.0, D * 0.18))
    story = s.get("genre", "Advertisement") != "Advertisement"
    dialogue = story and STORY_FORMATS[s["genre"]][1] == "dialogue"
    picks = story_picks(assets, pool, s, beats, prev_plan) if story else []
    if story:
        slots = [("Opening" if i == 0 else "Closing" if i == len(picks)-1 else "Development",
                  pos / fps, (pos + length) / fps) for i, (_, _, length, pos, _, _) in enumerate(picks)]
    else:
        slots = plan_cuts(D, beats, s["pace"], reveal_s)
    tl = default_timeline(fps, W, H)
    tr = {t["id"]: t for t in tl["tracks"]}
    grade = {"enabled": True, **{k: list(v) if isinstance(v, tuple) else v for k, v in LOOKS[s["look"]].items()}}
    used, last_clip, avoid, plan = [], None, set(), []
    if prev_plan and s.get("avoid_hook"):
        avoid |= {x["window"] for x in prev_plan.get("shots", []) if x["section"] == "hook"}
    if prev_plan and s.get("avoid_reveal"):
        avoid |= {x["window"] for x in prev_plan.get("shots", []) if x["section"] == "reveal"}
    reveal_asset = s.get("reveal_asset")
    for i, (sec, t0, t1) in enumerate(slots):
        need = t1 - t0
        if story:
            _, source_frame, _, _, w, why = picks[i]
        elif sec == "reveal" and reveal_asset:
            ra = assets[reveal_asset]
            w = max((x for x in pool if x["clip"] == reveal_asset), key=lambda x: x["quality"] + 0.6 * x["calm"], default=None)
            w = w or {"uid": f"{reveal_asset}:0", "clip": reveal_asset, "start": 0.0, "end": float(ra.duration_s or need),
                      "quality": 1, "energy": 0, "calm": 1, "faces": 0, "colour": 0, "clip_dur": float(ra.duration_s or need)}
            why = "Your chosen product/reveal shot"
        else:
            w = choose(pool, sec, need, used, last_clip, avoid)
            if w is None:
                raise ToolError("None of the clips has a usable shot (too dark, too short or unreadable)")
            why = reason_for(sec, w)
        a = assets[w["clip"]]
        src_len = float(a.duration_s or need)
        if story:
            src_in = source_frame / fps
        elif a.kind == "image":
            src_in = 0.0
        else:
            k = used.count(w["uid"])   # a reused shot starts somewhere else in its clip, so it isn't an exact repeat
            mid = (w["start"] + w["end"]) / 2 if k == 0 else (w["start"] + (k * 0.37 * src_len)) % max(need, src_len)
            src_in = max(0.0, min(src_len - need, mid - need / 2)) if src_len >= need else 0.0
        frames = max(2, int(round(t1 * fps)) - int(round(t0 * fps)))
        fi = int(round(src_in * fps))
        speed = 1.0
        if a.kind != "image" and src_len < need - 0.05:   # shot shorter than its slot: slow it down (never below 0.5×)
            speed = max(0.5, src_len / need)
        fo = fi + max(2, int(round(frames * speed)))
        if a.kind != "image":
            fo = min(fo, max(fi + 2, int(src_len * fps)))
        clip = {"id": f"ad{i}{uuid.uuid4().hex[:6]}", "asset_id": str(a.id), "start": int(round(t0 * fps)), "in": fi, "out": fo,
                "speed": round((fo - fi) / frames, 4) if a.kind != "image" else 1.0, "volume": 0.12 if music else 0.45,
                "transform": _cover(a, W, H), "color": grade,
                "effects": [{"type": "vignette", "amount": 0.25}] + ([{"type": "letterbox", "amount": 0.1}] if s["aspect"] == "16:9" and s["look"] != "natural" else [])}
        clip["speed"] = max(0.25, min(4, clip["speed"]))
        if story:
            clip.update({"in": source_frame, "out": source_frame + picks[i][2], "speed": 1.0,
                         "volume": 1.0 if dialogue else .65, "effects": []})
        if sec == "reveal":
            sc = clip["transform"]["scale"]
            clip["keyframes"] = {"scale": [{"t": 0, "v": sc, "ease": "ease"}, {"t": frames - 1, "v": round(min(10, sc * 1.07), 4)}]}
            if tr["v1"]["clips"]:
                clip["transition_in"] = {"type": "fade", "frames": 14}
        if i == 0:
            clip["fade_in"] = min(10, frames // 3)
        if i == len(slots) - 1:
            clip["fade_out"] = min(24, frames // 2)
        tr["v1"]["clips"].append(clip)
        used.append(w["uid"])
        last_clip = w["clip"]
        plan.append({"section": sec, "timeline_s": [round(t0, 2), round(t1, 2)], "clip": a.filename, "source_s": [round(src_in, 2), round(src_in + need * clip["speed"], 2)],
                     "window": w["uid"], "reason": why, "scores": {k: w.get(k) for k in ("quality", "energy", "calm", "faces")}})
    if s.get("end_title"):
        t0 = D - reveal_s + min(0.8, reveal_s / 3)
        n = int(round((D - t0) * fps))
        tr["v2"]["clips"].append({"id": "adtitle", "start": int(round(t0 * fps)), "in": 0, "out": n,
                                  "title": {"text": s["end_title"][:120], "font_size": int(H * (0.075 if W >= H else 0.05)), "color": "#ffffff", "shadow": 0.6},
                                  "transform": {"x": 0, "y": round(H * 0.28), "scale": 1, "rotation": 0, "opacity": 1},
                                  "fade_in": min(12, n // 3), "fade_out": min(12, n // 3)})
    if music:
        mlen = float(music.duration_s or D)
        n = int(round(min(D, mlen) * fps))
        tr["a2"]["clips"].append({"id": "admusic", "asset_id": str(music.id), "start": 0, "in": 0, "out": n, "volume": 0.14 if dialogue else 0.9,
                                  "fade_in": min(6, n // 4), "fade_out": min(int(1.8 * fps), n // 3)})
    Timeline.model_validate(tl)
    return tl, plan


# ---------------------------------------------------------------- 6–7. render + checks
def render_and_check(rc: RunCtx, tl: dict, assets: dict, D: float, has_music: bool = False) -> tuple[str, list[dict]]:
    infos = {}
    for a in assets.values():
        infos[a.id] = AssetInfo(path=rc.local(a), kind=a.kind, has_audio=bool(a.has_audio), has_video=bool(a.has_video),
                                duration_s=a.duration_s, width=a.width, height=a.height)
    raw, out = rc.path("ad_raw.mp4"), rc.path("ad.mp4")
    argv, _ = compile_ffmpeg(Timeline.model_validate(tl), infos, raw, crf=19, workdir=rc.tmp)
    argv = [x for x in argv if x not in ("-progress", "pipe:1")] if "-progress" in argv else argv
    r = media.run(argv, timeout=3600)
    if r.returncode != 0 or not os.path.exists(raw):
        raise RuntimeError(f"render failed: {(r.stderr or '')[-300:]}")
    rc.progress(0.85, "mastering audio")
    r = media.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
                   "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out], timeout=1800)
    if r.returncode != 0:
        out = raw
    rc.progress(0.93, "checking the result")
    checks = []
    pr = media.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,nb_frames", "-of", "json", out], timeout=120)
    info = json.loads(pr.stdout or "{}")
    got = float((info.get("format") or {}).get("duration") or 0)
    vs = [s for s in info.get("streams", []) if s.get("codec_type") == "video"]
    aus = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    checks.append({"check": "Length", "ok": abs(got - D) <= 0.25, "detail": f"{got:.2f} s (planned {D:.0f} s)"})
    checks.append({"check": "Picture size", "ok": bool(vs) and (vs[0].get("width"), vs[0].get("height")) == (tl["width"], tl["height"]),
                   "detail": f"{vs[0].get('width')}×{vs[0].get('height')}" if vs else "no video stream"})
    checks.append({"check": "Sound track", "ok": bool(aus), "detail": "present" if aus else "missing"})
    bd = media.run(["ffmpeg", "-hide_banner", "-nostats", "-i", out, "-vf", "blackdetect=d=0.4:pix_th=0.08", "-an", "-f", "null", "-"], timeout=900)
    blacks = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", bd.stderr or "")]
    unplanned = [b for b in blacks if b[0] < D - 1.2]   # the fade-out at the end is planned
    checks.append({"check": "No black gaps", "ok": not unplanned, "detail": "none" if not unplanned else ", ".join(f"{a:.1f}–{b:.1f}s" for a, b in unplanned)})
    ln = media.run(["ffmpeg", "-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"], timeout=900)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", ln.stderr or "")
    lufs = float(m[-1]) if m else None
    ok_l = lufs is not None and -16.5 <= lufs <= -11.5
    if not ok_l and not has_music and (lufs is None or lufs < -16.5):   # nothing loud enough to master: say what to do
        checks.append({"check": "Loudness (online standard −14 LUFS)", "ok": True, "warn": True,
                       "detail": (f"{lufs:.1f} LUFS — " if lufs is not None else "") + "your clips are mostly silent; add music for a finished ad"})
    else:
        checks.append({"check": "Loudness (online standard −14 LUFS)", "ok": ok_l, "detail": f"{lufs:.1f} LUFS" if lufs is not None else "not measured"})
    return out, checks


# ---------------------------------------------------------------- the tool
def ad_edit(rc: RunCtx):
    prev, prev_plan, base = None, None, {}
    if rc.p.get("previous"):
        try:
            prev = rc.db.get(Generation, uuid.UUID(str(rc.p["previous"])))
        except ValueError:
            prev = None
        if not prev or prev.workspace_id != rc.gen.workspace_id or prev.tool_id != rc.gen.tool_id or not prev.result:
            raise ToolError("The edit to revise was not found. Create an edit first.")
        prev_plan = prev.result
        base = dict(prev.result.get("settings") or {})
        for k in ("clips", "music", "reveal"):
            if not rc.p.get(k) and (prev.params or {}).get(k):
                rc.p[k] = prev.params[k]
    ids = rc.p.get("clips") or []
    if isinstance(ids, str):
        ids = [ids]
    if not ids:
        raise ToolError("Add at least one video clip")
    clips = [rc.asset_by_id(x) for x in ids[:20]]
    if not any(a.kind == "video" for a in clips):
        raise ToolError("Add at least one video clip (photos alone can't make a moving ad yet)")
    music = rc.asset("music", required=False)
    if music is not None and music.kind not in ("audio", "video"):
        raise ToolError("Music must be an audio file")
    reveal = rc.asset("reveal", required=False)
    if prev:
        changes = rc.p.get("changes") or ""
        s, understood = apply_changes(base, changes)
        if base.get("genre", "Advertisement") != "Advertisement":
            for name, (pattern, _, look) in FEELINGS.items():
                if re.search(pattern, changes, re.I):
                    s["feeling"] = name
                    if s["look"] == base["look"]:
                        s["look"] = look
                    understood.append(f"feeling → {name}")
                    break
        for k in ("duration", "aspect", "look", "pace"):
            if rc.p.get(k) not in (None, "", "auto") and str(rc.p[k]) != str(base.get(k)):
                s[k] = int(rc.p[k]) if k == "duration" else rc.p[k]
                understood.append(f"{k} → {s[k]}")
        if rc.p.get("end_title") is not None and rc.p.get("end_title") != base.get("end_title") and "end_title" not in (rc.p.get("changes") or ""):
            s["end_title"] = rc.p.get("end_title") or ""
        brief_reading = prev_plan.get("brief_reading")
    else:
        s = read_brief(rc.p.get("brief") or "", rc.p)
        s["end_title"] = (rc.p.get("end_title") or "").strip()
        understood, brief_reading = [], s.pop("why")
    if s.get("music_off"):
        music = None
    s["reveal_asset"] = reveal.id if reveal is not None else None
    assets = {a.id: a for a in clips}
    if reveal is not None:
        assets[reveal.id] = reveal
    # 1. inspect (cached per asset)
    pool, reused = [], 0
    for n, a in enumerate(assets.values()):
        rc.progress(0.05 + 0.4 * n / max(1, len(assets)), f"watching {a.filename[:40]}")
        if a.kind == "image":
            wins = [{"start": 0.0, "end": 60.0, "sharp": 200.0, "bright": 0.5, "colour": 0.4, "motion": 0.0, "faces": 0}]
        else:
            cached = (a.analysis or {}).get(ANALYSIS_KEY)
            if cached is not None:
                wins, reused = cached, reused + 1
            else:
                wins = inspect_clip(rc.local(a), a)
                a.analysis = {**(a.analysis or {}), ANALYSIS_KEY: wins}
                rc.db.flush()
        for j, w in enumerate(score_windows([dict(x) for x in wins])):
            pool.append({**w, "uid": f"{a.id}:{j}", "clip": a.id, "clip_dur": float(a.duration_s or 60)})
    if s.get("genre", "Advertisement") == "Advertisement" and reveal is not None and len(assets) > 1:
        pool_main = [w for w in pool if w["clip"] != reveal.id]
        pool = pool_main or pool
    if not pool:
        raise ToolError("Couldn't read any shots from these clips")
    # 3. beats
    rc.progress(0.5, "finding the beat")
    mpath = rc.local(music) if music is not None else None
    beats, bpm, beat_src = beats_for(mpath, float(s["duration"]), s["pace"])
    # 4–5. plan + timeline
    rc.progress(0.55, "planning the edit")
    if reveal is not None:
        s["reveal_asset"] = reveal.id
    tl, shots = build(rc, assets, pool, s, music, beats, prev_plan)
    # 6–7. render + checks
    rc.progress(0.6, "rendering")
    if music is not None:
        assets[music.id] = music
    out, checks = render_and_check(rc, tl, assets, float(s["duration"]), has_music=music is not None)
    label = s.get("genre", "Advertisement")
    name = f"{label} — {s['duration']} s {s['aspect']} {s['look']}" + (" (revised)" if prev else "")
    rc.add(out, "video", name)
    seq = rc.add_sequence(name, tl)
    settings = {k: (str(v) if k == "reveal_asset" and v else v) for k, v in s.items() if k not in ("avoid_hook", "avoid_reveal")}
    rc.result = {
        "kind": "ad_edit", "sequence_id": seq, "settings": settings, "brief_reading": brief_reading, "revision_of": str(prev.id) if prev else None,
        "understood_changes": understood if prev else None, "shots": shots,
        "sections": [{"name": n, "shots": sum(1 for x in shots if x["section"] == n)} for n in dict.fromkeys(x["section"] for x in shots)],
        "music": {"used": bool(music), "bpm": bpm, "cut_on": beat_src}, "checks": checks, "all_checks_ok": all(c["ok"] for c in checks),
        "analysis_reused": reused, "cost_usd": 0,
        "method": (f"{label} edit · {s.get('feeling')} direction. Uses measured footage and available transcript timings. Open the sequence to change any cut." if label != "Advertisement" else "Measured shot quality (sharpness, exposure, colour, motion, faces) → hook/build/climax/reveal plan cut on the beat → "
                  "the editor's own render engine (FFmpeg) on our CPU worker. Open the sequence to change any cut."),
        "limits": "Rule-based planning from measured signals: it does not understand what is happening in a shot the way a person does. "
                  "Generated footage (new shots that weren't filmed) needs a paid cloud model and is not used here.",
    }
