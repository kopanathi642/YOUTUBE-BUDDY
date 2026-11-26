"""Magic Edit: tap an object in a photo, then remove, move, resize or replace it (like phone "generative edit").

Runs on the CPU, no GPU:
  * select  - Segment Anything (SAM ViT-B, Apache-2.0), quantized ONNX from the rembg project's releases.
  * remove  - LaMa big-lama (Apache-2.0), ONNX export by Carve. Fixed 512x512, so we inpaint a crop around the
              object and blend only the hole back into the full-resolution photo.
  * replace - a generative image model (Gemini or Cloudflare Workers AI) when a key is set; see magic_replace.py.

Model files are pinned by SHA-256 and downloaded once into MODEL_CACHE (same rules as the speech models,
including MODELS_OFFLINE=1).
"""
from __future__ import annotations

import hashlib
import io
import os
import threading
from collections import OrderedDict
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter

from .speech import assets as _assets


@dataclass(frozen=True)
class Model:
    path: str
    sha256: str
    urls: tuple[str, ...]
    licence: str


MODELS = {
    "lama": Model("magic/lama_fp32.onnx", "1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6", (
        "https://huggingface.co/Carve/LaMa-ONNX/resolve/a3ee2fca54baebec351b8fa7786154ffa7555aa6/lama_fp32.onnx",
        "https://github.com/neureps/carousel-fit-models/releases/download/lama-v1/lama-fp32-1faef5301d78.onnx",
    ), "Apache-2.0 (LaMa, advimman; ONNX by Carve)"),
    "sam_encoder": Model("magic/vit_b-encoder-quant.onnx", "cf99a3b79eea0ac4f7c9b06cdce5b2763ff41a3f631213c748d497cba233df6a", (
        "https://github.com/danielgatis/rembg/releases/download/v0.0.0/vit_b-encoder-quant.onnx",
    ), "Apache-2.0 (Segment Anything ViT-B, Meta)"),
    "sam_decoder": Model("magic/vit_b-decoder-quant.onnx", "40b02c2f694bb87b8360bb04ad8aaa84eab9673f4092b4911e0513890812b42e", (
        "https://github.com/danielgatis/rembg/releases/download/v0.0.0/vit_b-decoder-quant.onnx",
    ), "Apache-2.0 (Segment Anything ViT-B, Meta)"),
}

_lock = threading.Lock()
_sessions: dict = {}


class MagicError(Exception):
    pass


def model_path(name: str) -> str:
    """Local path of a verified model file; downloads it (trying each mirror) unless MODELS_OFFLINE=1."""
    m = MODELS[name]
    path = os.path.join(_assets.CACHE, m.path)
    marker = path + ".sha256ok"
    if os.path.exists(path):
        st = os.stat(path)
        stamp = f"{m.sha256} {st.st_size} {int(st.st_mtime)}"
        if os.path.exists(marker) and open(marker).read() == stamp:
            return path
        if _assets._sha256(path) == m.sha256:
            open(marker, "w").write(stamp)
            return path
        os.remove(path)
    if _assets.offline():
        raise MagicError(f"{name} model is missing and MODELS_OFFLINE=1 forbids downloading it")
    with _lock:
        if os.path.exists(path) and _assets._sha256(path) == m.sha256:
            return path
        last = ""
        for url in m.urls:
            try:
                _assets._download(url, path)
            except _assets.AssetError as e:
                last = str(e)
                continue
            if _assets._sha256(path) == m.sha256:
                st = os.stat(path)
                open(marker, "w").write(f"{m.sha256} {st.st_size} {int(st.st_mtime)}")
                return path
            os.remove(path)
            last = f"{name} from {url.split('/')[2]} failed its SHA-256 check"
        raise MagicError(last or f"could not download {name}")


IDLE_UNLOAD_S = 600
_last_use = [0.0]
_reaper: list = []


def _reap() -> None:
    """Free the models' memory (~1.5 GB) after 10 minutes without Magic Edit use."""
    import time
    while True:
        time.sleep(60)
        if _sessions and time.time() - _last_use[0] > IDLE_UNLOAD_S:
            with _lock:
                _sessions.clear()
                _embeddings.clear()
            import gc
            gc.collect()


def _session(name: str):
    import time
    _last_use[0] = time.time()
    if not _reaper:
        t = threading.Thread(target=_reap, daemon=True, name="magic-reaper")
        t.start()
        _reaper.append(t)
    if name not in _sessions:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = max(1, min(4, (os.cpu_count() or 2)))
        _sessions[name] = ort.InferenceSession(model_path(name), opts, providers=["CPUExecutionProvider"])
    return _sessions[name]


def ready() -> bool:
    """True when every model is already downloaded (so a request won't wait on a download)."""
    return all(os.path.exists(os.path.join(_assets.CACHE, m.path)) for m in MODELS.values())


# ------------------------------------------------------------------ images

MAX_SIDE = 4096


def load_image(data: bytes) -> Image.Image:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:  # noqa: BLE001
        raise MagicError("That file isn't a picture we can open (use JPG, PNG or WebP).") from e
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return im.convert("RGB")


def image_key(im: Image.Image) -> str:
    return hashlib.sha1(im.tobytes()[:2_000_000] + str(im.size).encode()).hexdigest()


# ------------------------------------------------------------------ select (SAM)

SAM_SIZE = 1024
_MEAN = np.array([123.675, 116.28, 103.53], dtype=np.float32)
_STD = np.array([58.395, 57.12, 57.375], dtype=np.float32)
_embeddings: "OrderedDict[str, np.ndarray]" = OrderedDict()


def _embed(im: Image.Image) -> np.ndarray:
    key = image_key(im)
    if key in _embeddings:
        _embeddings.move_to_end(key)
        return _embeddings[key]
    w, h = im.size
    s = SAM_SIZE / max(w, h)
    nw, nh = int(w * s + 0.5), int(h * s + 0.5)
    x = (np.asarray(im.resize((nw, nh), Image.BILINEAR), dtype=np.float32) - _MEAN) / _STD
    pad = np.zeros((SAM_SIZE, SAM_SIZE, 3), np.float32)
    pad[:nh, :nw] = x
    emb = _session("sam_encoder").run(None, {"x": pad.transpose(2, 0, 1)[None]})[0]
    _embeddings[key] = emb
    while len(_embeddings) > 6:
        _embeddings.popitem(last=False)
    return emb


def select(im: Image.Image, points: list[tuple[float, float, int]], box: tuple[float, float, float, float] | None = None) -> np.ndarray:
    """Object mask (H, W bool) from taps. points: (x, y, 1=object / 0=not object) in image pixels; optional box."""
    if not points and not box:
        raise MagicError("Tap the object you want to select.")
    w, h = im.size
    s = SAM_SIZE / max(w, h)
    coords, labels = [], []
    for x, y, lab in points[:12]:
        coords.append([x * s, y * s])
        labels.append(1.0 if lab else 0.0)
    if box:
        coords += [[box[0] * s, box[1] * s], [box[2] * s, box[3] * s]]
        labels += [2.0, 3.0]
    else:
        coords.append([0.0, 0.0])
        labels.append(-1.0)
    out = _session("sam_decoder").run(None, {
        "image_embeddings": _embed(im),
        "point_coords": np.array([coords], np.float32),
        "point_labels": np.array([labels], np.float32),
        "mask_input": np.zeros((1, 1, 256, 256), np.float32),
        "has_mask_input": np.zeros(1, np.float32),
        "orig_im_size": np.array([h, w], np.float32),
    })
    masks, scores = out[0], out[1]
    best = int(np.argmax(scores[0])) if masks.shape[1] > 1 else 0
    mask = masks[0, best] > 0.0
    if mask.shape != (h, w):
        mask = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)) > 127
    return clean(mask)


def clean(mask: np.ndarray) -> np.ndarray:
    """Fill small gaps inside the object and drop specks, so the eraser doesn't leave bits of it behind."""
    import cv2
    m = mask.astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    if n > 1:
        biggest = stats[1:, cv2.CC_STAT_AREA].max()
        keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= max(64, biggest * 0.02)]
        m = np.isin(lab, keep).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    inv = (1 - m).astype(np.uint8)                       # holes = background regions not touching the border
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    h, w = m.shape
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if x > 0 and y > 0 and x + bw < w and y + bh < h and area < m.sum() * 0.05:
            m[lab == i] = 1
    return m > 0


def mask_png(mask: np.ndarray) -> bytes:
    b = io.BytesIO()
    Image.fromarray(mask.astype(np.uint8) * 255).save(b, "PNG", optimize=True)
    return b.getvalue()


def read_mask(data: bytes, size: tuple[int, int]) -> np.ndarray:
    try:
        m = Image.open(io.BytesIO(data)).convert("L")
    except Exception as e:  # noqa: BLE001
        raise MagicError("The selection couldn't be read. Select the object again.") from e
    if m.size != size:
        m = m.resize(size, Image.NEAREST)
    return np.asarray(m) > 127


# ------------------------------------------------------------------ remove (LaMa)

LAMA = 512


def _grow(mask: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return mask
    import cv2
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return cv2.dilate(mask.astype(np.uint8), k) > 0


def _lama(crop: Image.Image, hole: np.ndarray) -> Image.Image:
    """Inpaint one crop (any size) by resizing to 512x512 and back."""
    cw, ch = crop.size
    img = np.asarray(crop.resize((LAMA, LAMA), Image.LANCZOS), np.float32) / 255.0
    m = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255).resize((LAMA, LAMA), Image.NEAREST), np.float32) / 255.0
    m = (m > 0.5).astype(np.float32)
    out = _session("lama").run(None, {"image": img.transpose(2, 0, 1)[None], "mask": m[None, None]})[0][0]
    out = out.transpose(1, 2, 0)
    if out.max() <= 1.5:      # some exports give 0..1, this one gives 0..255
        out = out * 255.0
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((cw, ch), Image.LANCZOS)


def remove(im: Image.Image, mask: np.ndarray, grow: int | None = None) -> Image.Image:
    """Erase the masked object and fill it from its surroundings. Only the (slightly grown) hole changes."""
    w, h = im.size
    if not mask.any():
        raise MagicError("Nothing is selected. Tap the object first.")
    if mask.mean() > 0.6:
        raise MagicError("The selection covers most of the photo. Select a smaller object.")
    grow = grow if grow is not None else max(6, int(round(max(w, h) / 160)))
    hole = _grow(mask, grow)
    ys, xs = np.where(hole)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    # context around the hole: at least as big as the hole itself, square-ish, inside the photo
    bw, bh = x1 - x0, y1 - y0
    side = int(max(bw, bh) * 2.0 + 64)
    side = max(side, 256)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    X0, Y0 = max(0, min(cx - side // 2, w - side)), max(0, min(cy - side // 2, h - side))
    X1, Y1 = min(w, X0 + side), min(h, Y0 + side)
    crop = im.crop((X0, Y0, X1, Y1))
    filled = _lama(crop, hole[Y0:Y1, X0:X1])
    # feathered blend of the hole only, so the rest of the photo keeps its original pixels and sharpness
    soft = Image.fromarray(hole[Y0:Y1, X0:X1].astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(max(1.5, grow / 3)))
    out = im.copy()
    out.paste(Image.composite(filled, crop, soft), (X0, Y0))
    return out


# ------------------------------------------------------------------ move / resize

def move(im: Image.Image, mask: np.ndarray, dx: float, dy: float, scale: float = 1.0) -> Image.Image:
    """Lift the object, fill where it was, and put it back shifted (dx, dy pixels) and scaled."""
    if not 0.2 <= scale <= 4.0:
        raise MagicError("Resize between 20% and 400%.")
    background = remove(im, mask)
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    obj = im.crop((x0, y0, x1, y1)).convert("RGBA")
    alpha = Image.fromarray(mask[y0:y1, x0:x1].astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(1.0))
    obj.putalpha(alpha)
    if abs(scale - 1.0) > 1e-3:
        obj = obj.resize((max(1, int((x1 - x0) * scale)), max(1, int((y1 - y0) * scale))), Image.LANCZOS)
    cx, cy = (x0 + x1) / 2 + dx, (y0 + y1) / 2 + dy
    out = background.convert("RGBA")
    out.alpha_composite(obj, (int(round(cx - obj.width / 2)), int(round(cy - obj.height / 2)))) if _inside(out, obj, cx, cy) else \
        out.paste(obj, (int(round(cx - obj.width / 2)), int(round(cy - obj.height / 2))), obj)
    return out.convert("RGB")


def _inside(base: Image.Image, obj: Image.Image, cx: float, cy: float) -> bool:
    left, top = int(round(cx - obj.width / 2)), int(round(cy - obj.height / 2))
    return left >= 0 and top >= 0 and left + obj.width <= base.width and top + obj.height <= base.height


def to_jpeg(im: Image.Image, quality: int = 93) -> bytes:
    b = io.BytesIO()
    im.save(b, "JPEG", quality=quality, optimize=True)
    return b.getvalue()
