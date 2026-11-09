"""More free, on-worker engines for tools that used to need a paid key:
speaker detection (107), AI upscaling for images (084) and video (026) with FSRCNN, relighting (085), portrait retouch (088)
and canvas expansion (083). Each tool keeps its premium hosted model as an option when a fal.ai key is set."""
from __future__ import annotations

import math
import os
import subprocess

from . import providers
from .run import RunCtx, ToolError
from .local import H264, _audio_args, _img_in, _name, _transcript, ff, to_srt

SR_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "sr")


def _premium(rc: RunCtx) -> bool:
    """The creator picked the hosted model (only offered with a fal.ai key)."""
    from .registry import keys
    return bool(rc.gen.model) and keys()["fal"]


# ---------------------------------------------------------------- 107 speaker diarization


def speaker_report(rc: RunCtx):
    from faster_whisper import decode_audio
    from ..speech import diarize
    a = rc.asset("video")
    t = _transcript(rc, a, rc.p.get("language"))
    segs = [dict(s) for s in t["segments"]]
    if not segs:
        raise ToolError("No speech found in this file")
    rc.progress(0.6, "telling the voices apart")
    wav = rc.path("speech16k.wav")
    ff(["-i", rc.local(a), "-vn", "-ac", "1", "-ar", "16000", wav], "audio extraction")
    labels = diarize.label(decode_audio(wav, sampling_rate=16000), segs)
    names = {s: f"Speaker {s[1:]}" for s in dict.fromkeys(labels)}
    stats = {}
    for s, lab in zip(segs, labels):
        s["speaker"], s["speaker_name"] = lab, names[lab]
        st = stats.setdefault(lab, {"id": lab, "name": names[lab], "seconds": 0.0, "lines": 0, "first": s["start"]})
        st["seconds"] += s["end"] - s["start"]
        st["lines"] += 1
    srt = to_srt([{**s, "text": f"[{s['speaker_name']}] {s['text'].strip()}"} for s in segs])
    rc.model = "WeSpeaker ResNet34 + clustering (on our worker)"
    rc.result = {"kind": "speakers", "language": t["language"], "segments": segs, "srt": srt,
                 "speakers": [{**v, "seconds": round(v["seconds"], 1)} for v in stats.values()],
                 "note": "One speaker per subtitle line; people talking over each other are not separated. "
                         "Short lines (under 0.8 s) take the nearest voice."}


# ---------------------------------------------------------------- 084 / 026 upscaling (FSRCNN, Apache-2.0)


class _DepthToSpace:
    """TensorFlow DepthToSpace (DCR order) for OpenCV's DNN module, which doesn't ship it: (N, C*b*b, H, W) -> (N, C, H*b, W*b)."""
    def __init__(self, params, blobs):
        self.b = 1

    def getMemoryShapes(self, inputs):
        n, c, h, w = inputs[0]
        self.b = int(round(c ** 0.5))         # FSRCNN predicts scale² channels for the single luma channel
        return [[n, c // (self.b * self.b), h * self.b, w * self.b]]

    def forward(self, inputs):
        x = inputs[0]
        n, c, h, w = x.shape
        b = self.b
        return [x.reshape(n, b, b, c // (b * b), h, w).transpose(0, 3, 4, 1, 5, 2).reshape(n, c // (b * b), h * b, w * b)]


_nets: dict = {}


def _sr(scale: int):
    import cv2
    if scale not in _nets:
        if not _nets.get("_registered"):
            cv2.dnn_registerLayer("DepthToSpace", _DepthToSpace)   # once per process (a second call aborts OpenCV)
            _nets["_registered"] = True
        _nets[scale] = cv2.dnn.readNetFromTensorflow(os.path.join(SR_DIR, f"FSRCNN_x{scale}.pb"))
    return _nets[scale]


def _upsample(net, img, scale: int):
    """FSRCNN on the luma (Y) channel, colour upscaled with bicubic (how FSRCNN is meant to run), then a light unsharp mask."""
    import cv2
    import numpy as np
    ycc = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    net.setInput((ycc[..., 0].astype(np.float32) / 255)[None, None])
    y = net.forward()[0, 0]
    up = cv2.resize(ycc, (y.shape[1], y.shape[0]), interpolation=cv2.INTER_CUBIC)
    up[..., 0] = np.clip(y * 255, 0, 255).astype(np.uint8)
    out = cv2.cvtColor(up, cv2.COLOR_YCrCb2BGR)
    blur = cv2.GaussianBlur(out, (0, 0), 1.0 + 0.4 * scale)
    return cv2.addWeighted(out, 1.35, blur, -0.35, 0)


def image_upscale(rc: RunCtx):
    if _premium(rc):
        from .engines import run_fal
        return run_fal(rc)
    import cv2
    import numpy as np
    a, im = _img_in(rc)
    scale = int(rc.p.get("scale") or 4)
    if scale not in (2, 4):
        raise ToolError("Scale must be 2× or 4×")
    w, h = im.size
    if max(w, h) * scale > 8192:
        raise ToolError(f"The result would be {w * scale}×{h * scale} — choose 2× or a smaller image (max 8192 px)")
    rc.progress(0.2, f"upscaling {scale}×")
    rgba = np.array(im.convert("RGBA"))
    bgr = cv2.cvtColor(rgba[..., :3], cv2.COLOR_RGB2BGR)
    out = _upsample(_sr(scale), bgr, scale)
    res = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)
    if im.mode in ("RGBA", "LA", "P") and rgba[..., 3].min() < 255:
        alpha = cv2.resize(rgba[..., 3], (out.shape[1], out.shape[0]), interpolation=cv2.INTER_CUBIC)
        res = np.dstack([res, alpha])
    from PIL import Image
    p = rc.path("upscaled.png")
    Image.fromarray(res).save(p)
    rc.model = f"FSRCNN ×{scale} (on our worker)"
    rc.result = {"kind": "image", "width": out.shape[1], "height": out.shape[0], "from": [w, h]}
    rc.add(p, "image", _name(rc, a, f"{scale}x"))


def video_upscale(rc: RunCtx):
    if _premium(rc):
        from .engines import run_fal
        return run_fal(rc)
    import cv2
    import numpy as np
    a = rc.asset("video")
    if (rc.p.get("target") or "1080p") == "4K":
        raise ToolError("4K upscaling needs the premium upscaler (fal.ai key). The free upscaler on our worker goes up to 1080p.")
    if not (a.width and a.height):
        raise ToolError("This video's size is unknown — re-upload it")
    short = min(a.width, a.height)
    if short >= 1080:
        raise ToolError(f"This video is already {a.width}×{a.height} (1080p or more)")
    if (a.duration_s or 0) > 600:
        raise ToolError("The free upscaler handles videos up to 10 minutes")
    k = 1080 / short
    scale = 2 if k <= 2 else 4
    tw, th = (round(a.width * k / 2) * 2, round(a.height * k / 2) * 2)
    src, out = rc.local(a), rc.path("upscaled.mp4")
    fps = a.fps or 30
    sr = _sr(scale)
    total = max(1, int((a.duration_s or 1) * fps))
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    enc_args = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{tw}x{th}", "-r", str(fps), "-i", "-",
                "-i", src, "-map", "0:v", "-map", "1:a?"] + H264 + _audio_args(a) + ["-shortest", out]
    enc = subprocess.Popen(enc_args, stdin=subprocess.PIPE)
    fsz = a.width * a.height * 3
    n = 0
    try:
        while True:
            buf = dec.stdout.read(fsz)
            if len(buf) < fsz:
                break
            fr = np.frombuffer(buf, np.uint8).reshape(a.height, a.width, 3)
            up = _upsample(sr, fr, scale)
            if up.shape[1] != tw or up.shape[0] != th:
                up = cv2.resize(up, (tw, th), interpolation=cv2.INTER_AREA)
            enc.stdin.write(up.tobytes())
            n += 1
            if n % 15 == 0:
                rc.progress(0.05 + 0.9 * min(1, n / total), f"frame {n}/{total}")
                if n % 150 == 0 and rc.cancelled():
                    from .providers import Cancelled
                    raise Cancelled()
    finally:
        dec.stdout.close()
        dec.kill()
        try:
            enc.stdin.close()
        except BrokenPipeError:
            pass
        rc_enc = enc.wait()
    if rc_enc or n == 0:
        raise ToolError("Encoding the upscaled video failed")
    rc.model = f"FSRCNN ×{scale} per frame (on our worker)"
    rc.result = {"kind": "video", "width": tw, "height": th, "from": [a.width, a.height], "frames": n}
    rc.add(out, "video", _name(rc, a, f"{th if th < tw else tw}p"))


# ---------------------------------------------------------------- 085 relight, 088 retouch, 083 expand (classic image processing)

LIGHTS = {  # colour of the new light (RGB 0..1), warmth of the shadows
    "soft daylight": ((1.0, 0.98, 0.94), 0.0), "golden hour": ((1.0, 0.78, 0.48), 0.15), "blue hour": ((0.62, 0.74, 1.0), -0.12),
    "harsh noon": ((1.0, 1.0, 0.97), 0.0), "studio softbox": ((1.0, 1.0, 1.0), 0.0), "rim light": ((1.0, 0.95, 0.9), 0.0),
    "neon": ((1.0, 0.35, 0.85), -0.1), "candlelight": ((1.0, 0.66, 0.32), 0.2), "moonlight": ((0.66, 0.78, 1.0), -0.18),
    "volumetric fog": ((0.92, 0.94, 1.0), 0.0)}


def image_relight(rc: RunCtx):
    """A directional light: brightens the side the light comes from (angle in degrees, 0 = from the right, 90 = from above),
    darkens the far side, tints by the light's colour. Respects the subject's own shading (multiplied, not painted)."""
    if _premium(rc):
        from .engines import run_fal
        return run_fal(rc)
    import numpy as np
    from PIL import Image
    a, im = _img_in(rc)
    light = rc.p.get("lighting") or "soft daylight"
    col, warm = LIGHTS.get(light, LIGHTS["soft daylight"])
    ang = math.radians(float(rc.p.get("direction") or 45))
    x = np.asarray(im.convert("RGB")).astype(np.float32) / 255
    h, w = x.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = ((xx / w - 0.5) * math.cos(ang) - (yy / h - 0.5) * math.sin(ang))          # +0.7 on the lit side, -0.7 far side
    u = np.clip(u / 0.7, -1, 1)
    strength = {"harsh noon": 0.55, "rim light": 0.45, "studio softbox": 0.3, "volumetric fog": 0.25}.get(light, 0.38)
    gain = 1 + strength * u
    lum = x.mean(axis=2, keepdims=True)
    tint = np.array(col, np.float32)
    tint = tint / float(0.299 * tint[0] + 0.587 * tint[1] + 0.114 * tint[2])   # colour only; brightness comes from the gain
    lit = x * gain[..., None] * (1 + (tint - 1) * (0.5 + 0.5 * u[..., None]) * 0.8)
    if warm:
        lit[..., 0] *= 1 + warm * 0.25 * (u < 0)
        lit[..., 2] *= 1 - warm * 0.25 * (u < 0)
    if light == "rim light":   # a bright edge on the lit side of the subject's outline
        import cv2
        g = cv2.Canny((lum[..., 0] * 255).astype(np.uint8), 40, 120).astype(np.float32) / 255
        g = cv2.GaussianBlur(g, (0, 0), 3) * (u > 0.2)
        lit += g[..., None] * 0.6 * tint
    if light == "volumetric fog":
        lit = lit * 0.82 + 0.18 * tint * (0.6 + 0.4 * (u[..., None] + 1) / 2)
    out = Image.fromarray((np.clip(lit, 0, 1) * 255).astype(np.uint8))
    if im.mode == "RGBA":
        out.putalpha(im.getchannel("A"))
    p = rc.path("relit.png")
    out.save(p)
    rc.model = "Directional relight (on our worker)"
    rc.add(p, "image", _name(rc, a, f"{light}"))


def portrait_retouch(rc: RunCtx):
    """Skin smoothing that keeps texture: edge-preserving smoothing on detected faces only, blended with the original
    detail (frequency separation), plus a slight lift of shadows on the face. Faces from OpenCV's detector."""
    if _premium(rc):
        from .engines import run_fal
        return run_fal(rc)
    import cv2
    import numpy as np
    a, im = _img_in(rc)
    amt = max(0.1, min(1.0, float(rc.p.get("amount") or 0.4)))
    img = cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = det.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(max(40, gray.shape[0] // 20),) * 2)
    if not len(faces):
        raise ToolError("No face found — use a clear, front-facing portrait")
    rc.progress(0.3, f"retouching {len(faces)} face{'s' if len(faces) > 1 else ''}")
    mask = np.zeros(gray.shape, np.float32)
    for (x, y, w, h) in faces:
        cv2.ellipse(mask, (int(x + w / 2), int(y + h * 0.55)), (int(w * 0.62), int(h * 0.78)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), max(4, faces[:, 2].mean() * 0.08))[..., None]
    d = int(9 + 10 * amt)
    smooth = cv2.bilateralFilter(img, d, 30 + 50 * amt, 8 + 6 * amt)
    smooth = cv2.bilateralFilter(smooth, d, 25 + 40 * amt, 6 + 6 * amt).astype(np.float32)   # second pass evens out blotches
    f = img.astype(np.float32)
    detail = f - cv2.GaussianBlur(f, (0, 0), 1.2)                 # fine texture (pores, hair) to keep
    soft = smooth + detail * (1 - 0.6 * amt)
    lifted = soft + (255 - soft) * 0.06 * amt                     # gentle brighten on the face
    out = f * (1 - mask * amt) + lifted * (mask * amt)
    res = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB)
    from PIL import Image
    p = rc.path("retouched.png")
    Image.fromarray(res).save(p)
    rc.model = "Face-only skin smoothing (on our worker)"
    rc.result = {"kind": "image", "faces": int(len(faces))}
    rc.add(p, "image", _name(rc, a, "retouched"))


ASPECTS = {"16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1.0, "4:5": 4 / 5, "21:9": 21 / 9}


def image_outpaint(rc: RunCtx):
    """Expand the canvas to a new shape. Free version: the new area is a soft, blurred continuation of the picture's own
    edges (mirrored + blurred, blended into the seam). Describing new content needs the premium model."""
    if _premium(rc) or (rc.p.get("prompt") or "").strip():
        from .registry import keys
        if not keys()["fal"]:
            raise ToolError("Painting new content from a description needs the premium model (fal.ai key). "
                            "Leave the description empty for a soft extension of the edges.")
        from .engines import run_fal
        return run_fal(rc)
    import cv2
    import numpy as np
    a, im = _img_in(rc)
    target = ASPECTS.get(rc.p.get("expand") or "16:9", 16 / 9)
    img = cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    if abs(w / h - target) < 0.01:
        raise ToolError("The image already has this shape")
    W, H = (round(h * target), h) if w / h < target else (w, round(w / target))
    if max(W, H) > 8192:
        raise ToolError("The expanded image would be too large (max 8192 px)")
    px, py = (W - w) // 2, (H - h) // 2
    canvas = cv2.copyMakeBorder(img, py, H - h - py, px, W - w - px, cv2.BORDER_REFLECT_101)
    k = max(31, int(max(W - w, H - h) * 0.35) | 1)
    soft = cv2.GaussianBlur(canvas, (k, k), 0)
    soft = cv2.addWeighted(soft, 0.85, np.full_like(soft, int(soft.mean())), 0.15, 0)   # calmer than the subject
    m = np.zeros((H, W), np.float32)
    m[py:py + h, px:px + w] = 1
    feather = max(8, int(min(w, h) * 0.03))
    m = cv2.GaussianBlur(m, (0, 0), feather)
    m[py + feather * 2:py + h - feather * 2, px + feather * 2:px + w - feather * 2] = 1   # the original stays untouched
    out = canvas.astype(np.float32) * m[..., None] + soft.astype(np.float32) * (1 - m[..., None])
    res = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB)
    from PIL import Image
    p = rc.path("expanded.png")
    Image.fromarray(res).save(p)
    rc.model = "Soft edge extension (on our worker)"
    rc.result = {"kind": "image", "width": W, "height": H, "from": [w, h]}
    rc.add(p, "image", _name(rc, a, f"expanded {rc.p.get('expand') or '16:9'}"))


def qa_prompt(lines: str, scenes: str, question: str) -> tuple[str, str]:
    return ("You answer questions about a video using ONLY its transcript and scene list. If the answer isn't in them, say so plainly. "
            "Give timestamps for your evidence. Reply with one JSON object.",
            f"Transcript with timestamps:\n{lines}\nScene cuts (seconds): {scenes}\nQuestion: {question}\n"
            'Return {"answer": str, "evidence": [{"t": seconds, "quote": str}], "confident": bool}')


def video_qa(rc: RunCtx):
    """Answer from what is said (Whisper transcript) and where the cuts are; a hosted video model also sees the pictures."""
    from .engines import run_fal
    from .registry import keys
    k = keys()
    if k["fal"] and (_premium(rc) or not k["llm"]):
        if not rc.gen.model:
            rc.gen.model = rc.tool["engine"]["models"][0]["id"]
        return run_fal(rc)
    a = rc.asset("video")
    t = _transcript(rc, a)
    if not t["segments"]:
        raise ToolError("No speech found — this free version answers from what is said. Visual questions need the premium video model (fal.ai key).")
    lines = "\n".join(f"[{s['start']:.0f}s] {s['text'].strip()}" for s in t["segments"])[:28000]
    scenes = ", ".join(f"{s['start']:.0f}" for s in (a.analysis or {}).get("scenes", [])[:80])
    rc.progress(0.6, "answering")
    out, model = providers.llm_json(*qa_prompt(lines, scenes, rc.p.get("question") or ""))
    rc.model = f"whisper + {model}"
    rc.result = {"kind": "qa", "question": rc.p.get("question"), **out, "segments": t["segments"],
                 "note": "Answered from the transcript and scene cuts — the model doesn't see the pictures."}


HANDLERS = [video_qa, speaker_report, image_upscale, video_upscale, image_relight, portrait_retouch, image_outpaint]
