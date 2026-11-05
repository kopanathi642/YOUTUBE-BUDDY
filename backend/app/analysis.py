"""Rule-based media analysis on the worker (no external AI provider needed).

Produces: scene cuts, silences, integrated loudness, an automatic colour-correction suggestion
(levels + grey-world white balance) and the average horizontal subject (face) position for
smart reframing. Everything is measured from the actual file — nothing is guessed.
"""
import re
import statistics

from .media import run

SCENE_THRESHOLD = 0.32
SILENCE_DB = -35
SILENCE_MIN_S = 0.6


def detect_scenes(path: str, duration: float) -> list[dict]:
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-an", "-vf",
             f"select='gt(scene,{SCENE_THRESHOLD})',metadata=print:file=-", "-f", "null", "-"], timeout=1800)
    times = [0.0] + [float(m) for m in re.findall(r"pts_time:([\d.]+)", r.stdout)]
    scores = [1.0] + [float(m) for m in re.findall(r"lavfi\.scene_score=([\d.]+)", r.stdout)]
    cuts = sorted({round(t, 3) for t in times if t < duration - 0.2})
    out = []
    for i, t in enumerate(cuts):
        end = cuts[i + 1] if i + 1 < len(cuts) else duration
        out.append({"start": t, "end": round(end, 3), "score": round(scores[i] if i < len(scores) else 0, 3)})
    return out


def detect_silences(path: str, duration: float) -> list[dict]:
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af",
             f"silencedetect=noise={SILENCE_DB}dB:d={SILENCE_MIN_S}", "-f", "null", "-"], timeout=1800)
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    out = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else duration
        out.append({"start": round(max(0.0, s), 3), "end": round(min(duration, e), 3)})
    return out


def loudness_lufs(path: str) -> float | None:
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128", "-f", "null", "-"], timeout=1800)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    if not m:
        return None
    v = float(m[-1])
    return None if v <= -70 else v


def color_stats(path: str, duration: float) -> dict | None:
    fps = max(0.2, min(2.0, 12 / max(duration, 1)))
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-an", "-vf",
             f"fps={fps:.3f},scale=320:-2,signalstats,metadata=print:file=-", "-f", "null", "-"], timeout=900)
    keys = ("YLOW", "YHIGH", "YAVG", "UAVG", "VAVG")
    vals = {k: [float(x) for x in re.findall(rf"lavfi\.signalstats\.{k}=([\d.]+)", r.stdout)] for k in keys}
    if not vals["YAVG"]:
        return None
    return {k: round(statistics.median(v), 2) for k, v in vals.items() if v}


def auto_grade(st: dict, strength: float = 0.6) -> dict:
    """Gentle levels stretch (10th..90th luma percentile) + grey-world white balance.
    Deliberately conservative: never more than +/-0.12 lift or 1.5x gain, and no white balance on
    strongly coloured shots (sunsets, neon, graphics) where a colour cast is intended."""
    lo = max(0.0, st["YLOW"] / 255 - 0.06)
    hi = min(1.0, st["YHIGH"] / 255 + 0.06)
    span = max(0.35, hi - lo)          # low-contrast or very dark shots get only a modest stretch
    L = max(-0.12, min(0.12, -lo / span))
    G = max(0.7, min(1.5, (1 - lo) / span))
    y, u, v = st["YAVG"], st["UAVG"] - 128, st["VAVG"] - 128
    wb = [1.0, 1.0, 1.0]
    if abs(u) + abs(v) < 18 and y > 30:  # mild cast on a normally lit shot -> neutralise half of it
        rgb = (y + 1.402 * v, y - 0.344 * u - 0.714 * v, y + 1.772 * u)
        grey = sum(rgb) / 3
        wb = [max(0.85, min(1.15, grey / c)) if c > 1 else 1.0 for c in rgb]
    mix = lambda a, b: round(b + (a - b) * strength, 4)  # noqa: E731
    lift = tuple(max(-0.12, min(0.12, mix(L * w, 0.0))) for w in wb)
    gain = tuple(max(0.7, min(1.5, mix(G * w, 1.0))) for w in wb)
    return {"enabled": True, "lift": lift, "gamma": (1.0, 1.0, 1.0), "gain": gain, "offset": (0.0, 0.0, 0.0),
            "exposure": 0.0, "contrast": 1.0, "saturation": 1.05, "temperature": 0.0, "tint": 0.0}


def subject_center_x(path: str, duration: float) -> float | None:
    """Average horizontal centre (0..1) of the largest detected face across sampled frames."""
    try:
        import cv2
    except ImportError:
        return None
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return None
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    xs = []
    for i in range(8):
        cap.set(cv2.CAP_PROP_POS_MSEC, (duration * (i + 0.5) / 8) * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = det.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=6, minSize=(gray.shape[0] // 12,) * 2)
        if len(faces):
            x, _, w, _ = max(faces, key=lambda f: f[2] * f[3])
            xs.append((x + w / 2) / gray.shape[1])
    cap.release()
    return round(statistics.median(xs), 4) if len(xs) >= 2 else None


def analyze(path: str, meta: dict, progress=lambda p, s: None) -> dict:
    dur = meta.get("duration_s") or 0
    out: dict = {"version": 1}
    if meta["kind"] == "video":
        progress(0.0, "detecting scenes")
        out["scenes"] = detect_scenes(path, dur)
        progress(0.4, "colour analysis")
        st = color_stats(path, dur)
        if st:
            out["color_stats"] = st
            out["auto_grade"] = auto_grade(st)
        progress(0.6, "finding subject")
        out["subject_center_x"] = subject_center_x(path, dur)
    if meta["has_audio"] and meta["kind"] in ("video", "audio"):
        progress(0.75, "detecting silences")
        out["silences"] = detect_silences(path, dur)
        out["loudness_lufs"] = loudness_lufs(path)
    return out
