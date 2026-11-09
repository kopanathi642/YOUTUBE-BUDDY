"""Tools that run entirely on our worker: FFmpeg, Pillow, OpenCV, rembg (U²-Net), Piper, Whisper, Argos.
Each handler reads rc.p, writes files into rc.tmp, and registers outputs with rc.add / rc.add_sequence / rc.result."""
import base64
import json
import math
import os
import re
import statistics
import uuid

from .. import analysis, media
from ..timeline import ColorGrade, Timeline, default_timeline, grade_filters
from .run import RunCtx, ToolError

FF = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
H264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]


def ff(args: list[str], what: str, timeout: int = 3600):
    r = media.run(FF + args, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{what} failed: {r.stderr[-400:]}")


def _hex(c: str, a: int = 255):
    c = (c or "#ffffff").lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a


def _audio_args(a) -> list[str]:
    return ["-c:a", "aac", "-b:a", "192k"] if a.has_audio else ["-an"]


def _name(rc: RunCtx, a=None, suffix="") -> str:
    base = os.path.splitext(a.filename)[0] if a else rc.tool["name"]
    return f"{base} ({suffix or rc.tool['name']})"


# ---------------------------------------------------------------- C. video transformation


def video_bg_remove(rc: RunCtx):
    from .. import derive
    a = rc.asset("video")
    src, out = rc.local(a), rc.path("cutout.mov")
    try:
        derive.remove_background(src, out, a, lambda f, s: rc.progress(0.05 + 0.85 * f, s))
    except ValueError as e:
        raise ToolError(str(e))
    rc.add(out, "video", _name(rc, a, "no background"))


def _background_layer(rc: RunCtx, bg: dict, w: int, h: int, dur: float) -> list[str]:
    """FFmpeg input args for the new background (colour, gradient or one of the user's images/videos)."""
    bg = bg or {"type": "color", "value": "#0f172a"}
    if bg.get("type") == "asset" and bg.get("asset_id"):
        b = rc.asset_by_id(bg["asset_id"])
        path = rc.local(b)
        if b.kind == "image":
            return ["-loop", "1", "-t", f"{dur:.3f}", "-i", path]
        return ["-stream_loop", "-1", "-t", f"{dur:.3f}", "-i", path]
    if bg.get("type") == "gradient":
        from PIL import Image
        c1, c2 = _hex(bg.get("from", "#1e1b4b")), _hex(bg.get("to", "#7c3aed"))
        im = Image.new("RGB", (w, h))
        px = im.load()
        for y in range(h):
            t = y / max(1, h - 1)
            row = tuple(round(c1[i] * (1 - t) + c2[i] * t) for i in range(3))
            for x in range(w):
                px[x, y] = row
        g = rc.path("grad.png")
        im.save(g)
        return ["-loop", "1", "-t", f"{dur:.3f}", "-i", g]
    col = (bg.get("value") or "#0f172a").lstrip("#")
    return ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", f"color=c=0x{col}:s={w}x{h}"]


def video_bg_replace(rc: RunCtx):
    from .. import derive
    a = rc.asset("video")
    src, cut = rc.local(a), rc.path("cutout.mov")
    try:
        derive.remove_background(src, cut, a, lambda f, s: rc.progress(0.05 + 0.7 * f, s))
    except ValueError as e:
        raise ToolError(str(e))
    w, h = a.width or 1280, a.height or 720
    if h > 720:
        w, h = int(w * 720 / h) // 2 * 2, 720
    dur = a.duration_s or 1
    rc.progress(0.8, "compositing onto the new background")
    out = rc.path("bg_replaced.mp4")
    bg = _background_layer(rc, rc.p.get("background"), w, h, dur)
    ff(bg + ["-i", cut, "-filter_complex", f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1[b];[b][1:v]overlay=0:0:shortest=1[v]",
             "-map", "[v]"] + (["-map", "1:a?"] if a.has_audio else []) + H264 + _audio_args(a) + [out], "composite")
    rc.add(out, "video", _name(rc, a, "new background"))


def video_stabilize(rc: RunCtx):
    a = rc.asset("video")
    src, out, trf = rc.local(a), rc.path("stab.mp4"), rc.path("t.trf")
    sm = int(rc.p.get("smoothing") or 24)
    rc.progress(0.1, "analysing camera shake")
    ff(["-i", src, "-vf", f"vidstabdetect=shakiness=6:accuracy=12:result={trf}", "-f", "null", "-"], "shake analysis")
    rc.progress(0.5, "smoothing")
    ff(["-i", src, "-vf", f"vidstabtransform=input={trf}:smoothing={sm}:zoom=3:optzoom=0,unsharp=5:5:0.5"] + H264 + _audio_args(a) + [out], "stabilize")
    rc.add(out, "video", _name(rc, a, "stabilized"))


def video_interpolate(rc: RunCtx):
    a = rc.asset("video")
    factor = int(rc.p.get("factor") or 2)
    fps = int(rc.p.get("target_fps") or 60)
    if (a.duration_s or 0) * factor > 120:
        raise ToolError("Slow motion output is limited to 2 minutes")
    src, out = rc.local(a), rc.path("interp.mp4")
    vf = (f"setpts={factor}*PTS," if factor > 1 else "") + f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
    rc.progress(0.1, "creating in-between frames")
    args = ["-i", src, "-vf", vf]
    if a.has_audio and factor == 1:
        args += ["-c:a", "aac"]
    elif a.has_audio and factor in (2, 4):
        args += ["-af", "atempo=0.5" if factor == 2 else "atempo=0.5,atempo=0.5", "-c:a", "aac"]
    else:
        args += ["-an"]
    ff(args + H264 + [out], "frame interpolation", timeout=4 * 3600)
    rc.add(out, "video", _name(rc, a, f"{factor}x slow-mo {fps}fps" if factor > 1 else f"{fps}fps"))


def video_denoise(rc: RunCtx):
    a = rc.asset("video")
    d, s = float(rc.p.get("denoise") or 4), float(rc.p.get("sharpen") or 0.6)
    src, out = rc.local(a), rc.path("clean.mp4")
    vf = []
    if d > 0:
        vf.append(f"hqdn3d={d:.1f}:{d * 0.75:.1f}:{d * 1.5:.1f}:{d * 1.1:.1f}")
    if s > 0:
        vf.append(f"unsharp=5:5:{s:.2f}:3:3:0")
    rc.progress(0.1, "cleaning")
    ff(["-i", src, "-vf", ",".join(vf) or "null"] + H264 + _audio_args(a) + [out], "denoise")
    rc.add(out, "video", _name(rc, a, "clean"))


LOOKS = {"natural": {}, "warm": {"temperature": 0.25}, "cool": {"temperature": -0.25},
         "teal & orange": {"temperature": 0.12, "tint": -0.08, "saturation": 1.15, "contrast": 1.08},
         "punchy": {"saturation": 1.3, "contrast": 1.15}, "faded film": {"contrast": 0.85, "saturation": 0.8, "lift": [0.06, 0.05, 0.07]},
         "mono": {"saturation": 0.0, "contrast": 1.1}}


def video_autograde(rc: RunCtx):
    a = rc.asset("video")
    st = (a.analysis or {}).get("color_stats")
    src, out = rc.local(a), rc.path("graded.mp4")
    g: dict = {}
    if st:
        g = analysis.auto_grade(st, float(rc.p.get("strength") or 0.6))
    look = LOOKS.get(rc.p.get("look") or "natural", {})
    g = {**g, **{k: v for k, v in look.items() if k != "lift"}}
    if "lift" in look:
        g["lift"] = list(look["lift"])
    try:
        cg = ColorGrade.model_validate(g)
    except Exception:  # noqa: BLE001
        cg = ColorGrade.model_validate({k: v for k, v in g.items() if k in ("temperature", "tint", "saturation", "contrast")})
    rc.progress(0.2, "applying grade")
    ff(["-i", src, "-vf", ",".join(grade_filters(cg) + ["format=yuv420p"])] + H264 + _audio_args(a) + [out], "grade")
    rc.result = {"grade": cg.model_dump(), "measured": st}
    rc.add(out, "video", _name(rc, a, f"graded {rc.p.get('look') or 'natural'}"))


# ---------------------------------------------------------------- D. animation: text, ken burns, captions


ASPECT_WH = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080), "4:5": (1080, 1350)}


def _font(text: str, size: int):
    from PIL import ImageFont
    from ..titles import FONTS, font_for
    return ImageFont.truetype(str(FONTS / font_for(text)), size, layout_engine=ImageFont.Layout.RAQM)


def draw_text(im, text: str, *, size: int, color: str, outline: str | None, position: str = "bottom", box: bool = False, max_w: float = 0.9):
    """Typeset text with automatic wrapping, per-script fonts (Indic + Latin), outline and optional box."""
    from PIL import ImageDraw, ImageFont
    from ..titles import FONTS, runs
    W, H = im.size
    d = ImageDraw.Draw(im)
    fonts: dict = {}
    get = lambda f: fonts.setdefault(f, ImageFont.truetype(str(FONTS / f), size, layout_engine=ImageFont.Layout.RAQM))  # noqa: E731
    width = lambda s: sum(d.textlength(t, font=get(f)) for f, t in runs(s))  # noqa: E731
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if cur and width(trial) > W * max_w:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    if cur:
        lines.append(cur)
    lh = int(size * 1.18)
    total = lh * len(lines)
    y0 = {"top": int(H * 0.06), "center": (H - total) // 2, "bottom": H - total - int(H * 0.07),
          "left": (H - total) // 2, "right": (H - total) // 2, "lower third": int(H * 0.72) - total // 2}.get(position, H - total - int(H * 0.07))
    sw = max(2, size // 12) if outline else 0
    for i, ln in enumerate(lines):
        w = width(ln)
        x = {"left": int(W * 0.05), "right": int(W * 0.95 - w)}.get(position, int((W - w) / 2))
        y = y0 + i * lh + int(size * 0.92)
        if box:
            pad = size // 5
            d.rectangle([x - pad, y - int(size * 0.95), x + w + pad, y + int(size * 0.3)], fill=(0, 0, 0, 170))
        for f, t in runs(ln):
            d.text((x, y), t, font=get(f), fill=_hex(color), anchor="ls", stroke_width=sw, stroke_fill=_hex(outline) if outline else None)
            x += d.textlength(t, font=get(f))
    return im


def kinetic_type(rc: RunCtx):
    from PIL import Image
    text = " ".join((rc.p.get("text") or "").split())
    if not text:
        raise ToolError("Type some text")
    words = text.split()[:120]
    W, H = ASPECT_WH.get(rc.p.get("aspect_ratio") or "16:9", (1920, 1080))
    fps, wps = 30, float(rc.p.get("words_per_second") or 2.5)
    per = max(4, int(fps / wps))
    anim = rc.p.get("animation") or "pop"
    bg, fg = rc.p.get("bg_color") or "#0b0b14", rc.p.get("text_color") or "#ffffff"
    frames = rc.path("kt")
    os.makedirs(frames, exist_ok=True)
    size = int(min(W, H) * 0.12)
    n = 0
    for wi, word in enumerate(words):
        for k in range(per):
            t = k / per
            im = Image.new("RGBA", (W, H), _hex(bg))
            if anim == "typewriter":
                shown = " ".join(words[max(0, wi - 5):wi]) + " " + word[:max(1, int(len(word) * min(1, t * 2.5)))]
                draw_text(im, shown.strip(), size=int(size * 0.6), color=fg, outline=None, position="center")
            else:
                s = size
                if anim == "pop":
                    s = int(size * (0.6 + 0.4 * min(1, t * 4) + 0.08 * math.sin(min(1, t * 4) * math.pi)))
                layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                draw_text(layer, word, size=max(8, s), color=fg, outline=None, position="center")
                if anim == "slide up":
                    off = int((1 - min(1, t * 4)) * H * 0.08)
                    layer = layer.transform(layer.size, Image.AFFINE, (1, 0, 0, 0, 1, -off))
                if anim == "fade":
                    alpha = layer.getchannel("A").point(lambda v: int(v * min(1, t * 3)))
                    layer.putalpha(alpha)
                im.alpha_composite(layer)
            im.convert("RGB").save(os.path.join(frames, f"{n:05d}.png"))
            n += 1
        rc.progress(0.05 + 0.75 * wi / len(words), f"animating word {wi + 1}/{len(words)}")
    out = rc.path("kinetic.mp4")
    ff(["-framerate", str(fps), "-i", os.path.join(frames, "%05d.png")] + H264 + [out], "encode")
    rc.add(out, "video", f"Kinetic text — {text[:30]}")


def ken_burns(rc: RunCtx):
    a = rc.asset("image")
    src = rc.local(a)
    W, H = ASPECT_WH.get(rc.p.get("aspect_ratio") or "16:9", (1920, 1080))
    dur = float(rc.p.get("duration") or 6)
    fps = 30
    n = int(dur * fps)
    mv = rc.p.get("move") or "push in"
    z = {"push in": f"1+0.25*on/{n}", "pull out": f"1.25-0.25*on/{n}"}.get(mv, "1.15")
    x = {"pan left": f"(iw-iw/zoom)*(1-on/{n})", "pan right": f"(iw-iw/zoom)*on/{n}"}.get(mv, "iw/2-(iw/zoom/2)")
    y = {"tilt up": f"(ih-ih/zoom)*(1-on/{n})", "tilt down": f"(ih-ih/zoom)*on/{n}"}.get(mv, "ih/2-(ih/zoom/2)")
    out = rc.path("kenburns.mp4")
    rc.progress(0.2, "animating")
    ff(["-loop", "1", "-i", src, "-vf", f"scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},"
        f"zoompan=z='{z}':x='{x}':y='{y}':d={n}:s={W}x{H}:fps={fps}", "-frames:v", str(n)] + H264 + [out], "ken burns")
    rc.add(out, "video", _name(rc, a, mv))


def _transcript(rc: RunCtx, a, language: str | None = None) -> dict:
    """Reuse the worker's Whisper transcript cache on the asset (same as the editor's captions)."""
    from ..worker import _ensure_transcript, Permanent
    try:
        return _ensure_transcript(rc.w, rc.tmp, a, language if language and language != "auto" else None)
    except Permanent as e:
        raise ToolError(str(e))


def _sub_frames(rc: RunCtx, a, segs: list[dict], style: dict) -> tuple[list[str], str]:
    """One transparent PNG per subtitle segment + an FFmpeg overlay graph that shows each for its time."""
    from PIL import Image
    W, H = a.width or 1920, a.height or 1080
    size = int(min(W, H) * (0.075 if style.get("big") else 0.055))
    inputs, chain, last = [], [], "0:v"
    for i, s in enumerate(segs[:400]):
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw_text(im, s["text"].strip(), size=size, color=style.get("color", "#ffffff"), outline=style.get("outline"),
                  position=style.get("position", "lower third"), box=style.get("box", False), max_w=0.86)
        p = rc.path(f"sub{i:04d}.png")
        im.save(p)
        inputs += ["-i", p]
        lab = f"s{i}"
        chain.append(f"[{last}][{i + 1}:v]overlay=0:0:enable='between(t,{s['start']:.3f},{s['end']:.3f})'[{lab}]")
        last = lab
    return inputs, ";".join(chain) + f";[{last}]format=yuv420p[v]" if chain else "[0:v]format=yuv420p[v]"


def animated_captions(rc: RunCtx):
    a = rc.asset("video")
    t = _transcript(rc, a)
    style = rc.p.get("caption_style") or "bold pop"
    segs = []
    for s in t["segments"]:  # split long segments into 3-4 word chunks, timed evenly across the segment
        words = s["text"].split()
        if not words:
            continue
        k = 3 if style != "clean subtitle" else 8
        chunks = [words[i:i + k] for i in range(0, len(words), k)]
        span = (s["end"] - s["start"]) / len(chunks)
        for j, c in enumerate(chunks):
            segs.append({"start": s["start"] + j * span, "end": s["start"] + (j + 1) * span, "text": " ".join(c)})
    if not segs:
        raise ToolError("No speech found to caption")
    src, out = rc.local(a), rc.path("captioned.mp4")
    rc.progress(0.6, "drawing captions")
    color = rc.p.get("highlight") if style == "karaoke highlight" else rc.p.get("text_color") or "#ffffff"
    inputs, graph = _sub_frames(rc, a, segs, {"color": color, "outline": "#000000", "position": rc.p.get("position") or "lower third",
                                              "big": style != "clean subtitle", "box": style == "clean subtitle"})
    ff(["-i", src] + inputs + ["-filter_complex", graph, "-map", "[v]", "-map", "0:a?"] + H264 + ["-c:a", "aac", out], "burn captions")
    rc.add(out, "video", _name(rc, a, "captions"))


# ---------------------------------------------------------------- E. audio


def tts(rc: RunCtx):
    from .. import ai_engines
    text = (rc.p.get("text") or "").strip()
    if not text:
        raise ToolError("Type a script")
    voice = rc.p.get("voice_id") or ai_engines.default_voice("en")
    rc.progress(0.2, "generating voice")
    out = rc.path("voice.wav")
    try:
        ai_engines.tts(text, voice, out, 1 / max(0.5, float(rc.p.get("speed") or 1)))
    except ai_engines.EngineError as e:
        raise ToolError(str(e))
    rc.model = f"piper:{voice}"
    rc.add(out, "audio", f"Voice — {text[:36]}", ai=True)


def _audio_src(rc: RunCtx, key="audio"):
    a = rc.asset(key)
    if not a.has_audio:
        raise ToolError("This file has no audio")
    return a, rc.local(a)


def audio_denoise(rc: RunCtx):
    a, src = _audio_src(rc)
    nr = int(rc.p.get("strength") or 18)
    out = rc.path("denoised.wav")
    rc.progress(0.2, "removing noise")
    ff(["-i", src, "-vn", "-af", f"highpass=f=70,afftdn=nr={nr}:nf=-40:tn=1,lowpass=f=15000", "-c:a", "pcm_s16le", out], "denoise")
    rc.add(out, "audio", _name(rc, a, "clean audio"))


def audio_master(rc: RunCtx):
    a, src = _audio_src(rc)
    tgt = float(rc.p.get("target") or -14)
    rc.progress(0.1, "measuring loudness")
    r = media.run(["ffmpeg", "-hide_banner", "-i", src, "-vn", "-af", f"loudnorm=I={tgt}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], timeout=1800)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
    if not m:
        raise RuntimeError("loudness measurement failed")
    j = json.loads(m.group(0))
    out = rc.path("mastered.wav")
    rc.progress(0.5, "mastering")
    ff(["-i", src, "-vn", "-af", f"loudnorm=I={tgt}:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
        f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true",
        "-ar", "48000", "-c:a", "pcm_s16le", out], "mastering")
    after = analysis.loudness_lufs(out)
    rc.result = {"before_lufs": float(j["input_i"]), "after_lufs": after, "target_lufs": tgt, "true_peak_db": float(j["input_tp"])}
    rc.add(out, "audio", _name(rc, a, f"{int(tgt)} LUFS"))


def _silences(path: str, dur: float, min_s: float) -> list[dict]:
    r = media.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", f"silencedetect=noise=-35dB:d={min_s}", "-f", "null", "-"], timeout=1800)
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return [{"start": s, "end": en[i] if i < len(en) else dur} for i, s in enumerate(st)]


def _keep_spans(dur: float, sil: list[dict], keep: float) -> list[tuple[float, float]]:
    spans, t = [], 0.0
    for s in sil:
        a, b = s["start"] + keep / 2, s["end"] - keep / 2
        if a > t:
            spans.append((t, a))
        t = max(t, b)
    if t < dur:
        spans.append((t, dur))
    return [(a, b) for a, b in spans if b - a > 0.05]


def audio_silence_trim(rc: RunCtx):
    a, src = _audio_src(rc)
    dur = a.duration_s or 0
    sil = _silences(src, dur, float(rc.p.get("min_silence") or 0.8))
    spans = _keep_spans(dur, sil, float(rc.p.get("keep") or 0.15))
    if not sil:
        raise ToolError("No pauses long enough to cut")
    sel = "+".join(f"between(t,{x:.3f},{y:.3f})" for x, y in spans)
    out = rc.path("trimmed.wav")
    ff(["-i", src, "-vn", "-af", f"aselect='{sel}',asetpts=N/SR/TB", "-c:a", "pcm_s16le", out], "trim")
    rc.result = {"removed_s": round(dur - sum(y - x for x, y in spans), 2), "cuts": len(sil)}
    rc.add(out, "audio", _name(rc, a, "pauses removed"))


def beat_detect(rc: RunCtx):
    """Onset-energy beat tracker: spectral-flux onsets + autocorrelation tempo (60-180 BPM)."""
    import numpy as np
    a, src = _audio_src(rc)
    sr = 22050
    import subprocess
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True, timeout=900).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    if x.size < sr * 2:
        raise ToolError("Audio is too short to find a beat")
    hop, n = 512, 2048
    frames = 1 + (x.size - n) // hop
    win = np.hanning(n).astype(np.float32)
    spec = np.abs(np.fft.rfft(np.stack([x[i * hop:i * hop + n] * win for i in range(frames)]), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(spec), axis=0)).sum(axis=1)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    fr = sr / hop
    ac = np.correlate(flux, flux, "full")[flux.size - 1:]
    lo, hi = int(fr * 60 / 180), int(fr * 60 / 60)
    lag = lo + int(np.argmax(ac[lo:hi]))
    bpm = 60 * fr / lag
    phase = int(np.argmax([flux[p::lag].sum() for p in range(lag)]))
    beats = [round((phase + k * lag) / fr, 3) for k in range((flux.size - phase) // lag)]
    peaks = [round(i / fr, 3) for i in range(1, flux.size - 1) if flux[i] > 1.5 and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]]
    rc.result = {"bpm": round(bpm, 1), "beats": beats[:2000], "onsets": peaks[:2000], "duration_s": round(x.size / sr, 2),
                 "confidence": round(float(ac[lag] / (ac[0] + 1e-9)), 2)}


# ---------------------------------------------------------------- G. content intelligence reports


def _frames_at(path: str, times: list[float]):
    import cv2
    cap = cv2.VideoCapture(path)
    out = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, fr = cap.read()
        out.append(fr if ok else None)
    cap.release()
    return out


def _thumb_b64(frame, w=240) -> str:
    import cv2
    h = int(frame.shape[0] * w / frame.shape[1])
    ok, buf = cv2.imencode(".jpg", cv2.resize(frame, (w, h)), [cv2.IMWRITE_JPEG_QUALITY, 70])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode() if ok else ""


def scene_report(rc: RunCtx):
    a = rc.asset("video")
    src = rc.local(a)
    scenes = (a.analysis or {}).get("scenes") or analysis.detect_scenes(src, a.duration_s or 0)
    frames = _frames_at(src, [min(s["end"] - 0.05, s["start"] + 0.3) for s in scenes[:120]])
    rows = [{**s, "length": round(s["end"] - s["start"], 2), "thumb": _thumb_b64(f) if f is not None else ""} for s, f in zip(scenes, frames)]
    lens = [r["length"] for r in rows] or [0]
    rc.result = {"kind": "scenes", "duration_s": a.duration_s, "scenes": rows,
                 "summary": {"count": len(rows), "avg_shot_s": round(statistics.mean(lens), 2), "longest_s": max(lens), "shortest_s": min(lens)}}


def transcript_report(rc: RunCtx):
    a = rc.asset("video")
    t = _transcript(rc, a, rc.p.get("language"))
    rc.result = {"kind": "transcript", "language": t["language"], "engine": t.get("engine"), "segments": t["segments"],
                 "srt": to_srt(t["segments"]), "words": sum(len(s["text"].split()) for s in t["segments"])}


def to_srt(segs: list[dict]) -> str:
    def ts(x):
        ms = int(round(x * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    return "\n".join(f"{i + 1}\n{ts(s['start'])} --> {ts(s['end'])}\n{s['text'].strip()}\n" for i, s in enumerate(segs))


def parse_srt(text: str) -> list[dict]:
    out = []
    for blk in re.split(r"\n\s*\n", text.strip().replace("\r", "")):
        m = re.search(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\s*\n(.*)", blk, re.S)
        if m:
            g = [int(x) for x in m.groups()[:8]]
            out.append({"start": g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000, "end": g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000,
                        "text": m.group(9).strip()})
    return out


def _face_samples(path: str, dur: float, n: int):
    import cv2
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    times = [dur * (i + 0.5) / n for i in range(n)]
    out = []
    for t, fr in zip(times, _frames_at(path, times)):
        if fr is None:
            continue
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        faces = det.detectMultiScale(g, scaleFactor=1.15, minNeighbors=6, minSize=(g.shape[0] // 14,) * 2)
        H, W = g.shape
        out.append({"t": round(t, 2), "frame": fr, "boxes": [{"x": round(x / W, 4), "y": round(y / H, 4), "w": round(w / W, 4), "h": round(h / H, 4)} for x, y, w, h in faces]})
    return out


def face_report(rc: RunCtx):
    a = rc.asset("video")
    src = rc.local(a)
    rc.progress(0.2, "detecting faces")
    s = _face_samples(src, a.duration_s or 1, 24)
    rc.result = {"kind": "faces", "samples": [{"t": x["t"], "boxes": x["boxes"], "thumb": _thumb_b64(x["frame"], 320)} for x in s],
                 "summary": {"frames_with_faces": sum(1 for x in s if x["boxes"]), "frames": len(s),
                             "max_faces": max((len(x["boxes"]) for x in s), default=0)}}


def _energy(path: str, dur: float, step: float = 0.5) -> list[float]:
    r = media.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af",
                   f"asetnsamples=n={int(48000 * step)},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
                   "-ar", "48000", "-f", "null", "-"], timeout=1800)
    vals = [float(v) if v not in ("-inf", "inf") else -90.0 for v in re.findall(r"RMS_level=([-\w.]+)", r.stdout)]
    return vals


def highlight_scores(a, src: str) -> list[dict]:
    dur = a.duration_s or 0
    an = a.analysis or {}
    step = 0.5
    en = _energy(src, dur, step) if a.has_audio else []
    cuts = [s["start"] for s in an.get("scenes", [])]
    n = max(1, int(dur / step))
    score = []
    for i in range(n):
        t = i * step
        e = en[i] if i < len(en) else -60
        loud = max(0.0, min(1.0, (e + 45) / 30))
        change = sum(1 for c in cuts if abs(c - t) < 2.5) * 0.25
        score.append({"t": round(t, 2), "score": round(0.75 * loud + min(0.5, change), 3)})
    return score


def highlights(a, src: str, count: int, length: float) -> list[dict]:
    sc = highlight_scores(a, src)
    dur = a.duration_s or 0
    win = max(1, int(length / 0.5))
    sums = [(sum(x["score"] for x in sc[i:i + win]) / win, sc[i]["t"]) for i in range(0, max(1, len(sc) - win + 1))]
    picks = []
    for s, t in sorted(sums, reverse=True):
        if all(abs(t - p["start"]) >= length for p in picks):
            picks.append({"start": t, "end": round(min(dur, t + length), 2), "score": round(s, 3)})
        if len(picks) >= count:
            break
    return sorted(picks, key=lambda p: p["start"])


def highlights_report(rc: RunCtx):
    a = rc.asset("video")
    src = rc.local(a)
    rc.progress(0.3, "scoring every moment")
    picks = highlights(a, src, int(rc.p.get("count") or 5), float(rc.p.get("length") or 20))
    frames = _frames_at(src, [p["start"] + 1 for p in picks])
    rc.result = {"kind": "highlights", "highlights": [{**p, "thumb": _thumb_b64(f) if f is not None else ""} for p, f in zip(picks, frames)],
                 "curve": highlight_scores(a, src)[::2], "duration_s": a.duration_s,
                 "method": "audio energy + scene changes (rule-based)"}


def retention_report(rc: RunCtx):
    a = rc.asset("video")
    an = a.analysis or {}
    dur = a.duration_s or 0
    scenes = an.get("scenes", [])
    sil = an.get("silences", [])
    flags = []
    first_cut = scenes[1]["start"] if len(scenes) > 1 else dur
    if first_cut > 8:
        flags.append({"t": 0, "severity": "high", "issue": f"No visual change for the first {first_cut:.0f} s",
                      "evidence": "scene detection", "fix": "Open with a cut, B-roll or on-screen text inside 3 s"})
    for s in scenes:
        if s["end"] - s["start"] > 25:
            flags.append({"t": s["start"], "severity": "medium", "issue": f"Static shot for {s['end'] - s['start']:.0f} s",
                          "evidence": f"scene {s['start']:.1f}–{s['end']:.1f}s", "fix": "Add a punch-in, B-roll or graphic"})
    for s in sil:
        if s["end"] - s["start"] > 1.5:
            flags.append({"t": s["start"], "severity": "medium" if s["start"] > 10 else "high",
                          "issue": f"{s['end'] - s['start']:.1f} s of silence", "evidence": "silence detection", "fix": "Cut the pause (Auto Cut Silences)"})
    lu = an.get("loudness_lufs")
    if lu is not None and lu < -20:
        flags.append({"t": 0, "severity": "medium", "issue": f"Quiet audio ({lu:.1f} LUFS)", "evidence": "EBU R128 loudness",
                      "fix": "Master to -14 LUFS (Loudness Mastering)"})
    pace = len(scenes) / max(1, dur / 60)
    rc.result = {"kind": "retention", "flags": sorted(flags, key=lambda f: f["t"]), "duration_s": dur,
                 "summary": {"cuts_per_minute": round(pace, 1), "silence_s": round(sum(s["end"] - s["start"] for s in sil), 1), "flags": len(flags)},
                 "note": "Rule-based signals measured from your file. They are not your real audience-retention data."}


def _num(pat: str, text: str):
    m = re.search(pat, text)
    if not m:
        return None
    v = m.group(1)
    return -120.0 if v == "-inf" else 0.0 if v == "inf" else float(v)


def audio_report(rc: RunCtx):
    a = rc.asset("video")
    if not a.has_audio:
        raise ToolError("This file has no audio")
    src = rc.local(a)
    r = media.run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-vn", "-af", "astats=measure_perchannel=none,ebur128=peak=true:framelog=quiet",
                   "-f", "null", "-"], timeout=1800)
    t = r.stderr
    I, LRA, TP = _num(r"I:\s+(-?[\d.]+) LUFS", t), _num(r"LRA:\s+(-?[\d.]+) LU", t), _num(r"Peak:\s+(-?[\d.]+) dBFS", t)
    peak, rms = _num(r"Peak level dB:\s*(-?[\d.]+|-?inf)", t), _num(r"RMS level dB:\s*(-?[\d.]+|-?inf)", t)
    nf, flat = _num(r"Noise floor dB:\s*(-?[\d.]+|-?inf)", t), _num(r"Flat factor:\s*([\d.]+)", t) or 0
    clipping = (peak is not None and peak >= -0.1) or flat > 0
    checks = [
        {"name": "Loudness for YouTube (-14 LUFS ±2)", "value": I, "pass": I is not None and -16 <= I <= -12},
        {"name": "True peak at or below -1 dBTP", "value": TP, "pass": TP is not None and TP <= -1},
        {"name": "No clipping", "value": peak, "pass": not clipping},
        {"name": "Noise floor below -55 dB", "value": nf, "pass": nf is not None and nf <= -55},
        {"name": "Loudness range under 15 LU (consistent)", "value": LRA, "pass": LRA is not None and LRA <= 15}]
    rc.result = {"kind": "audio", "integrated_lufs": I, "lra": LRA, "true_peak": TP, "peak_db": peak, "rms_db": rms, "noise_floor_db": nf,
                 "clipping": clipping, "checks": checks}


def _laplacian_var(frame) -> float:
    import cv2
    return float(cv2.Laplacian(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def visual_report(rc: RunCtx):
    import numpy as np
    a = rc.asset("video")
    src = rc.local(a)
    scenes = (a.analysis or {}).get("scenes") or [{"start": 0, "end": a.duration_s or 1}]
    rows = []
    frames = _frames_at(src, [(s["start"] + s["end"]) / 2 for s in scenes[:80]])
    for s, f in zip(scenes, frames):
        if f is None:
            continue
        rgb = f[..., ::-1].astype(np.float32) / 255
        y = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
        m = rgb.reshape(-1, 3).mean(0)
        cast = m - m.mean()
        sharp = _laplacian_var(f)
        issues = []
        if y.mean() < 0.22:
            issues.append("underexposed")
        if y.mean() > 0.78:
            issues.append("overexposed")
        if (y > 0.98).mean() > 0.05:
            issues.append("clipped highlights")
        if y.std() < 0.12:
            issues.append("flat / low contrast")
        if sharp < 60:
            issues.append("soft / out of focus")
        if abs(cast[0] - cast[2]) > 0.06:
            issues.append("warm cast" if cast[0] > cast[2] else "cool cast")
        rows.append({"start": s["start"], "end": s["end"], "brightness": round(float(y.mean()), 3), "contrast": round(float(y.std()), 3),
                     "sharpness": round(sharp, 1), "rgb_mean": [round(float(v), 3) for v in m], "issues": issues, "thumb": _thumb_b64(f)})
    rc.result = {"kind": "visual", "scenes": rows, "summary": {"scenes": len(rows), "with_issues": sum(1 for r in rows if r["issues"])}}


# ---------------------------------------------------------------- H. thumbnail A/B (measurements)


def thumbnail_ab(rc: RunCtx):
    import cv2
    import numpy as np
    ids = rc.p.get("images") or []
    if len(ids) < 2:
        raise ToolError("Add at least two thumbnails")
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    rows = []
    for aid in ids[:4]:
        a = rc.asset_by_id(aid)
        img = cv2.imread(rc.local(a))
        if img is None:
            raise ToolError(f"Could not read {a.filename}")
        img = cv2.resize(img, (1280, 720))
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(img, (168, 94))  # how it looks in a phone feed
        sg = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        faces = det.detectMultiScale(g, 1.15, 6, minSize=(60, 60))
        face_area = max((w * h for _, _, w, h in faces), default=0) / (1280 * 720)
        edges = cv2.Canny(g, 100, 200)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        rows.append({"asset_id": str(a.id), "name": a.filename, "contrast": round(float(g.std() / 255), 3),
                     "small_contrast": round(float(sg.std() / 255), 3), "saturation": round(float(hsv[..., 1].mean() / 255), 3),
                     "faces": int(len(faces)), "largest_face_pct": round(face_area * 100, 1),
                     "busyness": round(float((edges > 0).mean()), 3), "brightness": round(float(g.mean() / 255), 3)})
    for r in rows:
        s = 0
        s += min(30, r["small_contrast"] * 120)
        s += 25 if 4 <= r["largest_face_pct"] <= 30 else 12 if r["faces"] else 0
        s += min(20, r["saturation"] * 40)
        s += 25 * (1 - min(1, abs(r["busyness"] - 0.08) / 0.12))
        r["score"] = round(s)
    rc.result = {"kind": "thumb_ab", "rows": sorted(rows, key=lambda r: -r["score"]),
                 "method": "Measured: small-size contrast, face size, saturation and visual clutter. A guide, not a CTR prediction."}


# ---------------------------------------------------------------- I. image editing


def _img_in(rc: RunCtx):
    from PIL import Image
    a = rc.asset("image")
    im = Image.open(rc.local(a))
    im.load()
    return a, im


def image_bg_remove(rc: RunCtx):
    from rembg import new_session, remove
    a, im = _img_in(rc)
    rc.progress(0.2, "finding the subject")
    out = remove(im.convert("RGB"), session=new_session("u2netp"), post_process_mask=True)
    p = rc.path("cutout.png")
    out.save(p)
    rc.add(p, "image", _name(rc, a, "no background"))


def image_bg_replace(rc: RunCtx):
    from PIL import Image
    from rembg import new_session, remove
    a, im = _img_in(rc)
    rc.progress(0.2, "finding the subject")
    cut = remove(im.convert("RGB"), session=new_session("u2netp"), post_process_mask=True)
    bg = rc.p.get("background") or {"type": "color", "value": "#f1f5f9"}
    W, H = cut.size
    if bg.get("type") == "asset" and bg.get("asset_id"):
        b = Image.open(rc.local(rc.asset_by_id(bg["asset_id"]))).convert("RGBA")
        s = max(W / b.width, H / b.height)
        b = b.resize((math.ceil(b.width * s), math.ceil(b.height * s)))
        base = b.crop(((b.width - W) // 2, (b.height - H) // 2, (b.width - W) // 2 + W, (b.height - H) // 2 + H))
    elif bg.get("type") == "gradient":
        c1, c2 = _hex(bg.get("from", "#1e1b4b")), _hex(bg.get("to", "#7c3aed"))
        base = Image.linear_gradient("L").resize((W, H))
        base = Image.composite(Image.new("RGBA", (W, H), c2), Image.new("RGBA", (W, H), c1), base)
    else:
        base = Image.new("RGBA", (W, H), _hex(bg.get("value") or "#f1f5f9"))
    base.alpha_composite(cut)
    p = rc.path("bg_replaced.png")
    base.convert("RGB").save(p)
    rc.add(p, "image", _name(rc, a, "new background"))


def image_adjust(rc: RunCtx):
    import numpy as np
    from PIL import Image, ImageEnhance, ImageFilter
    a, im = _img_in(rc)
    p = rc.p
    alpha = im.getchannel("A") if im.mode == "RGBA" else None
    x = im.convert("RGB")
    x = ImageEnhance.Brightness(x).enhance(2 ** float(p.get("exposure") or 0))
    x = ImageEnhance.Contrast(x).enhance(1 + float(p.get("contrast") or 0))
    x = ImageEnhance.Color(x).enhance(1 + float(p.get("saturation") or 0))
    w = float(p.get("warmth") or 0)
    if w:
        arr = np.asarray(x).astype(np.float32)
        arr[..., 0] *= 1 + 0.15 * w
        arr[..., 2] *= 1 - 0.15 * w
        x = Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))
    s = float(p.get("sharpness") or 0)
    if s:
        x = x.filter(ImageFilter.UnsharpMask(radius=2, percent=int(80 * s), threshold=2))
    if alpha:
        x.putalpha(alpha)
    out = rc.path("adjusted.png")
    x.save(out)
    rc.add(out, "image", _name(rc, a, "adjusted"))


def image_inpaint(rc: RunCtx):
    """Erase what the user painted (OpenCV Telea inpainting). If a replacement prompt is given and a fal key exists,
    the hosted image-edit model paints the new content instead."""
    import cv2
    import numpy as np
    from .engines import run_fal
    from .registry import keys
    if (rc.p.get("prompt") or "").strip():
        if not keys()["fal"]:
            raise ToolError("Replacing with new content needs a fal.ai key (FAL_KEY). Leave the prompt empty to erase instead.")
        return run_fal(rc)
    a = rc.asset("image")
    img = cv2.imread(rc.local(a), cv2.IMREAD_COLOR)
    data = rc.p.get("mask") or ""
    if not data.startswith("data:image/png;base64,"):
        raise ToolError("Paint over the area to erase first")
    m = cv2.imdecode(np.frombuffer(base64.b64decode(data.split(",", 1)[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    if m is None:
        raise ToolError("Could not read the mask")
    m = m[..., 3] if m.ndim == 3 and m.shape[2] == 4 else (m if m.ndim == 2 else cv2.cvtColor(m, cv2.COLOR_BGR2GRAY))
    m = cv2.resize(m, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
    m = cv2.dilate((m > 20).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
    if not m.any():
        raise ToolError("Paint over the area to erase first")
    rc.progress(0.3, "filling the area")
    res = cv2.inpaint(img, m, 9, cv2.INPAINT_TELEA)
    out = rc.path("inpainted.png")
    cv2.imwrite(out, res)
    rc.model = "OpenCV Telea inpainting"
    rc.add(out, "image", _name(rc, a, "erased"))


def image_text(rc: RunCtx):
    a, im = _img_in(rc)
    im = im.convert("RGBA")
    size = int(min(im.size) * float(rc.p.get("size") or 0.11) * 1.6)
    draw_text(im, rc.p.get("text") or "", size=size, color=rc.p.get("text_color") or "#ffffff", outline=rc.p.get("accent") or "#000000",
              position=rc.p.get("text_position") or "bottom")
    out = rc.path("text.png")
    im.convert("RGB").save(out)
    rc.add(out, "image", _name(rc, a, "text"))


# ---------------------------------------------------------------- J. video intelligence → sequences


def _video_ready(rc: RunCtx):
    a = rc.asset("video")
    if a.kind != "video":
        raise ToolError("Choose a video")
    return a


def seq_from_spans(rc: RunCtx, a, spans, *, W=None, H=None, scales=None) -> dict:
    fps = rc.main_fps()
    tl = default_timeline(fps, W or 1920, H or 1080)
    v1 = next(t for t in tl["tracks"] if t["id"] == "v1")
    pos = 0
    for i, (s, e) in enumerate(spans):
        fi, fo = int(round(s * fps)), int(round(e * fps))
        if fo - fi < 2:
            continue
        clip = {"id": f"g{uuid.uuid4().hex[:10]}", "asset_id": str(a.id), "start": pos, "in": fi, "out": fo}
        if scales and scales[i] != 1:
            clip["transform"] = {"x": 0, "y": 0, "scale": scales[i], "rotation": 0, "opacity": 1}
        v1["clips"].append(clip)
        pos += fo - fi
    Timeline.model_validate(tl)
    return tl


def _cover(a, W2, H2, sx=None):
    if not (a.width and a.height):
        return {}
    contain = min(W2 / a.width, H2 / a.height)
    cover = max(W2 / a.width, H2 / a.height)
    dw = a.width * cover
    sx = sx if sx is not None else (a.analysis or {}).get("subject_center_x") or 0.5
    limit = max(0.0, (dw - W2) / 2)
    return {"x": round(max(-limit, min(limit, -(sx - 0.5) * dw)), 1), "y": 0, "scale": round(min(10, cover / contain), 4), "rotation": 0, "opacity": 1}


FORMAT_WH = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080), "4:5": (1080, 1350)}


def shots_to_sequence(rc: RunCtx):
    a = _video_ready(rc)
    scenes = (a.analysis or {}).get("scenes") or analysis.detect_scenes(rc.local(a), a.duration_s or 0)
    tl = seq_from_spans(rc, a, [(s["start"], s["end"]) for s in scenes], W=a.width and a.width // 2 * 2 or 1920, H=a.height and a.height // 2 * 2 or 1080)
    sid = rc.add_sequence(f"{os.path.splitext(a.filename)[0]} — {len(scenes)} shots", tl)
    rc.result = {"kind": "shots", "shots": scenes, "sequence_id": sid}


def reframe_sequence(rc: RunCtx):
    a = _video_ready(rc)
    fmt = rc.p.get("format") or "9:16"
    W, H = FORMAT_WH[fmt]
    tl = seq_from_spans(rc, a, [(0, a.duration_s or 0)], W=W, H=H)
    tl["tracks"][3]["clips"][0]["transform"] = _cover(a, W, H)
    Timeline.model_validate(tl)
    rc.add_sequence(f"{os.path.splitext(a.filename)[0]} — {fmt}", tl)
    rc.result = {"kind": "reframe", "format": fmt, "subject_center_x": (a.analysis or {}).get("subject_center_x")}


def silence_sequence(rc: RunCtx):
    a = _video_ready(rc)
    if not a.has_audio:
        raise ToolError("This video has no audio to find pauses in")
    src = rc.local(a)
    sil = _silences(src, a.duration_s or 0, float(rc.p.get("min_silence") or 0.7))
    spans = _keep_spans(a.duration_s or 0, sil, 0.12)
    tl = seq_from_spans(rc, a, spans, W=(a.width or 1920) // 2 * 2, H=(a.height or 1080) // 2 * 2)
    rc.add_sequence(f"{os.path.splitext(a.filename)[0]} — tight cut", tl)
    rc.result = {"kind": "silence_cut", "removed_s": round((a.duration_s or 0) - sum(y - x for x, y in spans), 1), "cuts": len(sil)}


def shorts_sequences(rc: RunCtx):
    a = _video_ready(rc)
    src = rc.local(a)
    picks = highlights(a, src, int(rc.p.get("count") or 3), float(rc.p.get("length") or 30))
    W, H = FORMAT_WH["9:16"]
    for i, p in enumerate(picks):
        tl = seq_from_spans(rc, a, [(p["start"], p["end"])], W=W, H=H)
        tl["tracks"][3]["clips"][0]["transform"] = _cover(a, W, H)
        rc.add_sequence(f"Short {i + 1} — {os.path.splitext(a.filename)[0]} @{int(p['start'])}s", tl)
    rc.result = {"kind": "shorts", "highlights": picks}


def punchin_sequence(rc: RunCtx):
    a = _video_ready(rc)
    src = rc.local(a)
    dur = a.duration_s or 0
    en = _energy(src, dur, 0.5) if a.has_audio else []
    every, zoom = float(rc.p.get("every") or 6), float(rc.p.get("zoom") or 1.2)
    if not en:
        raise ToolError("Punch-ins follow speech emphasis, so the video needs audio")
    thr = sorted(en)[int(len(en) * 0.8)]
    marks, last = [], -every
    for i, e in enumerate(en):
        t = i * 0.5
        if e >= thr and t - last >= every and t > 1:
            marks.append(t)
            last = t
    edges = [0.0]
    for m in marks:
        edges += [m, min(dur, m + 2.5)]
    edges.append(dur)
    spans, scales = [], []
    for i in range(len(edges) - 1):
        if edges[i + 1] - edges[i] > 0.1:
            spans.append((edges[i], edges[i + 1]))
            scales.append(zoom if i % 2 == 1 else 1)
    tl = seq_from_spans(rc, a, spans, W=(a.width or 1920) // 2 * 2, H=(a.height or 1080) // 2 * 2, scales=scales)
    rc.add_sequence(f"{os.path.splitext(a.filename)[0]} — punch-ins", tl)
    rc.result = {"kind": "punchin", "punch_ins": marks}


def continuity_report(rc: RunCtx):
    rc.p.setdefault("video", rc.p.get("video"))
    visual_report(rc)
    rows = rc.result["scenes"]
    a = rc.asset("video")
    src = rc.local(a)
    en = _energy(src, a.duration_s or 0, 0.5) if a.has_audio else []
    flags = []
    for p, q in zip(rows, rows[1:]):
        db = q["brightness"] - p["brightness"]
        dc = [round(x - y, 3) for x, y in zip(q["rgb_mean"], p["rgb_mean"])]
        if abs(db) > 0.15:
            flags.append({"t": q["start"], "issue": f"Brightness jumps {'up' if db > 0 else 'down'} {abs(db) * 100:.0f}%", "evidence": f"{p['brightness']} → {q['brightness']}"})
        if max(abs(x) for x in dc) > 0.08:
            flags.append({"t": q["start"], "issue": "Colour balance shift between shots", "evidence": f"RGB change {dc}"})
        if en:
            i0, i1 = int(p["start"] * 2), int(q["start"] * 2)
            e0 = statistics.mean(en[i0:i1] or [-60])
            e1 = statistics.mean(en[i1:int(q["end"] * 2)] or [-60])
            if abs(e1 - e0) > 8 and e0 > -50 and e1 > -50:
                flags.append({"t": q["start"], "issue": f"Audio level jumps {e1 - e0:+.0f} dB", "evidence": "RMS level per shot"})
    rc.result = {"kind": "continuity", "flags": flags, "scenes": rows}


def tracking_report(rc: RunCtx):
    a = _video_ready(rc)
    src = rc.local(a)
    rc.progress(0.2, "tracking")
    s = _face_samples(src, a.duration_s or 1, 40)
    path = []
    for x in s:
        if x["boxes"]:
            b = max(x["boxes"], key=lambda b: b["w"] * b["h"])
            path.append({"t": x["t"], "cx": round(b["x"] + b["w"] / 2, 4), "cy": round(b["y"] + b["h"] / 2, 4), "size": round(b["w"], 4)})
    rc.result = {"kind": "tracking", "path": path, "coverage": round(len(path) / max(1, len(s)), 2),
                 "frames": [{"t": x["t"], "thumb": _thumb_b64(x["frame"], 200)} for x in s[::5]]}


def multiformat_sequences(rc: RunCtx):
    a = _video_ready(rc)
    fmts = rc.p.get("formats") or ["9:16", "1:1"]
    for f in fmts:
        W, H = FORMAT_WH[f]
        tl = seq_from_spans(rc, a, [(0, a.duration_s or 0)], W=W, H=H)
        tl["tracks"][3]["clips"][0]["transform"] = _cover(a, W, H)
        rc.add_sequence(f"{os.path.splitext(a.filename)[0]} — {f}", tl)
    rc.result = {"kind": "formats", "formats": fmts}


def markers_sequence(rc: RunCtx):
    a = _video_ready(rc)
    an = a.analysis or {}
    marks = [{"t": s["start"], "kind": "scene"} for s in an.get("scenes", [])[1:]] + \
            [{"t": s["start"], "kind": "silence"} for s in an.get("silences", [])]
    marks.sort(key=lambda m: m["t"])
    tl = seq_from_spans(rc, a, [(0, a.duration_s or 0)], W=(a.width or 1920) // 2 * 2, H=(a.height or 1080) // 2 * 2)
    tl["notes"] = "Markers:\n" + "\n".join(f"{int(m['t'] // 60)}:{m['t'] % 60:05.2f}  {m['kind']}" for m in marks)[:9000]
    rc.add_sequence(f"{os.path.splitext(a.filename)[0]} — markers", tl)
    rc.result = {"kind": "markers", "markers": marks}


# ---------------------------------------------------------------- K. localization


def translate_subs(rc: RunCtx):
    from ..worker import _ensure_translation, Permanent
    a = rc.asset("video")
    out = {}
    targets = rc.p.get("targets") or ["hi"]
    for i, lang in enumerate(targets):
        rc.progress(0.1 + 0.8 * i / len(targets), f"translating to {lang}")
        try:
            tr = _ensure_translation(rc.w, rc.tmp, a, lang)
        except Permanent as e:
            raise ToolError(str(e))
        out[lang] = {"segments": tr["segments"], "srt": to_srt(tr["segments"]), "engine": tr["engine"]}
    src = (a.analysis or {}).get("transcript") or {}
    rc.result = {"kind": "subtitles", "source": {"language": src.get("language"), "segments": src.get("segments", [])}, "translations": out}


def burn_subtitles(rc: RunCtx):
    a = rc.asset("video")
    lang = rc.p.get("language") or "en"
    t = _transcript(rc, a)
    segs = t["segments"]
    if lang != t["language"]:
        from ..worker import _ensure_translation, Permanent
        try:
            segs = _ensure_translation(rc.w, rc.tmp, a, lang)["segments"]
        except Permanent as e:
            raise ToolError(str(e))
    segs = [s for s in segs if s["text"].strip()]
    if not segs:
        raise ToolError("No speech found")
    src, out = rc.local(a), rc.path("subbed.mp4")
    rc.progress(0.6, "burning subtitles")
    inputs, graph = _sub_frames(rc, a, segs, {"color": rc.p.get("text_color") or "#ffffff", "outline": None if rc.p.get("box", True) else "#000000",
                                              "box": bool(rc.p.get("box", True)), "position": "bottom"})
    ff(["-i", src] + inputs + ["-filter_complex", graph, "-map", "[v]", "-map", "0:a?"] + H264 + ["-c:a", "aac", out], "burn subtitles")
    rc.add(out, "video", _name(rc, a, f"{lang} subtitles"))


def dub(rc: RunCtx):
    """The editor's proven dubbing pipeline (Whisper -> translate -> Piper, each line timed to the original)."""
    from .. import ai_engines
    from ..worker import Permanent, dub_to_wav
    a = rc.asset("video")
    target = rc.p.get("target") or "hi"
    voice = rc.p.get("voice_id") or ai_engines.default_voice(target)
    if not voice:
        raise ToolError(f"No built-in voice for {target} yet")
    out = rc.path("dub.wav")
    try:
        dub_to_wav(rc.w, rc.tmp, a, target, voice, out)
    except Permanent as e:
        raise ToolError(str(e))
    rc.model = f"whisper + translate + piper:{voice}"
    rc.add(out, "audio", _name(rc, a, f"{target} dub"), ai=True)


def subtitle_sync(rc: RunCtx):
    segs = parse_srt(rc.p.get("srt") or "")
    if not segs:
        raise ToolError("Paste subtitles in .srt format")
    off, k = float(rc.p.get("offset") or 0), float(rc.p.get("stretch") or 1)
    fixed = [{**s, "start": max(0, s["start"] * k + off), "end": max(0.01, s["end"] * k + off)} for s in segs]
    rc.result = {"kind": "subtitles", "source": {"language": None, "segments": fixed}, "srt": to_srt(fixed), "translations": {}}


LOCAL = {f.__name__: f for f in [
    video_bg_remove, video_bg_replace, video_stabilize, video_interpolate, video_denoise, video_autograde, kinetic_type, ken_burns,
    animated_captions, tts, audio_denoise, audio_master, audio_silence_trim, beat_detect, scene_report, transcript_report, face_report,
    highlights_report, retention_report, audio_report, visual_report, thumbnail_ab, image_bg_remove, image_bg_replace, image_adjust,
    image_inpaint, image_text, shots_to_sequence, reframe_sequence, silence_sequence, shorts_sequences, punchin_sequence,
    continuity_report, tracking_report, multiformat_sequences, markers_sequence, translate_subs, burn_subtitles, dub, subtitle_sync]}


from .local_more import HANDLERS as _MORE  # noqa: E402  (free engines added later; they import helpers from this module)
LOCAL.update({f.__name__: f for f in _MORE})
