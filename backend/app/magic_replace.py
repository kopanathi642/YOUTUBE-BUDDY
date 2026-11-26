"""Magic Edit -> Replace: redraw the selected area as something else ("a red sports car").

Engines, tried in order (each only when its keys are set in the server .env):
  1. Gemini image editing   GEMINI_API_KEY (Google AI Studio; a Google AI Pro plan includes monthly developer credits)
                            GEMINI_IMAGE_MODEL optional (else the newest "flash-image" model the key can use)
  2. Cloudflare Workers AI  CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN (free daily allowance)
                            model @cf/runwayml/stable-diffusion-v1-5-inpainting

Whatever the engine returns, only the selected area (slightly grown, feathered) is blended back into the original
photo, so everything outside the selection keeps its exact original pixels.
Daily caps protect the credits: MAGIC_REPLACE_DAILY (whole site, default 8) and MAGIC_REPLACE_USER_DAILY (default 3).
"""
from __future__ import annotations

import base64
import io
import os
import threading
from datetime import datetime, timezone

import httpx
import numpy as np
from PIL import Image, ImageFilter

from .magic_edit import MagicError, _grow

TIMEOUT = httpx.Timeout(20, read=120)
_count_lock = threading.Lock()
_counts: dict[str, int] = {}
_model_cache: dict[str, str] = {}


def engines() -> list[str]:
    out = []
    if os.environ.get("GEMINI_API_KEY", "").strip():
        out.append("gemini")
    if os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip() and os.environ.get("CLOUDFLARE_AI_TOKEN", "").strip():
        out.append("cloudflare")
    return out


def _cap(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, default)))
    except ValueError:
        return default


def take_quota(user_key: str) -> None:
    """Count one replace for today (UTC). Raises before any paid call when a cap is reached."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _count_lock:
        for k in [k for k in _counts if not k.startswith(day)]:
            del _counts[k]
        site, mine = _counts.get(f"{day}|site", 0), _counts.get(f"{day}|{user_key}", 0)
        if site >= _cap("MAGIC_REPLACE_DAILY", 8):
            raise MagicError("Today's Replace limit for the whole site is used up. Remove, Move and Resize keep working; "
                             "Replace opens again after 05:30 IST.")
        if mine >= _cap("MAGIC_REPLACE_USER_DAILY", 3):
            raise MagicError("You've used today's Replace edits. Remove, Move and Resize keep working; try Replace again tomorrow.")
        _counts[f"{day}|site"], _counts[f"{day}|{user_key}"] = site + 1, mine + 1


def give_back(user_key: str) -> None:
    """A failed engine call doesn't use up the user's edit."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _count_lock:
        for k in (f"{day}|site", f"{day}|{user_key}"):
            if _counts.get(k, 0) > 0:
                _counts[k] -= 1


def _png(im: Image.Image) -> bytes:
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def _region(mask: np.ndarray, w: int, h: int, pad: float = 0.6, minimum: int = 384) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    side = max(int(max(x1 - x0, y1 - y0) * (1 + 2 * pad)), minimum)
    side = min(side, max(w, h))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    X0, Y0 = max(0, min(cx - side // 2, w - side)), max(0, min(cy - side // 2, h - side))
    return X0, Y0, min(w, X0 + side), min(h, Y0 + side)


def _marked(crop: Image.Image, hole: np.ndarray) -> Image.Image:
    """The crop with the selected area tinted magenta and outlined, so the model knows exactly what to change."""
    over = Image.new("RGBA", crop.size, (255, 0, 255, 0))
    a = Image.fromarray((hole * 110).astype(np.uint8))
    over.putalpha(a)
    out = Image.alpha_composite(crop.convert("RGBA"), over)
    edge = Image.fromarray(hole.astype(np.uint8) * 255).filter(ImageFilter.FIND_EDGES)
    out.paste((255, 0, 255, 255), mask=edge)
    return out.convert("RGB")


# ------------------------------------------------------------------ Gemini

def _gemini_model(key: str) -> str:
    want = os.environ.get("GEMINI_IMAGE_MODEL", "").strip()
    if want:
        return want
    if key in _model_cache:
        return _model_cache[key]
    r = httpx.get("https://generativelanguage.googleapis.com/v1beta/models", params={"pageSize": 200},
                  headers={"x-goog-api-key": key}, timeout=TIMEOUT)
    if r.status_code in (400, 401, 403):
        raise MagicError("The Gemini key was refused. Check GEMINI_API_KEY in the server settings.")
    r.raise_for_status()
    names = [m["name"].split("/", 1)[-1] for m in r.json().get("models", [])
             if "generateContent" in m.get("supportedGenerationMethods", []) and "image" in m["name"] and "flash" in m["name"]]
    if not names:
        raise MagicError("This Gemini key has no image-editing model. Set GEMINI_IMAGE_MODEL in the server settings.")
    names.sort(key=lambda n: ("preview" in n, [-int(x) if x.isdigit() else 0 for x in n.replace("-", ".").split(".")]))
    _model_cache[key] = names[0]
    return names[0]


def _gemini(crop: Image.Image, hole: np.ndarray, prompt: str) -> Image.Image:
    key = os.environ["GEMINI_API_KEY"].strip()
    model = _gemini_model(key)
    text = (f"Edit the FIRST image. In it, replace only the object/area that is highlighted in magenta in the SECOND image with: "
            f"{prompt}. Match the original photo's lighting, shadows, perspective, colour and grain so it looks real. "
            "Do not change anything outside the highlighted area. Return the edited first image at the same framing, "
            "with no magenta, no text and no border.")
    body = {"contents": [{"parts": [
        {"text": text},
        {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(_png(crop)).decode()}},
        {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(_png(_marked(crop, hole))).decode()}},
    ]}], "generationConfig": {"responseModalities": ["IMAGE"]}}
    r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                   headers={"x-goog-api-key": key}, json=body, timeout=TIMEOUT)
    if r.status_code == 429:
        raise MagicError("Gemini's limit is reached for now.")
    if r.status_code in (400, 401, 403):
        detail = (r.json().get("error", {}) or {}).get("message", "") if r.headers.get("content-type", "").startswith("application/json") else ""
        raise MagicError(f"Gemini refused the edit{': ' + detail[:160] if detail else ''}.")
    r.raise_for_status()
    for cand in r.json().get("candidates", []):
        for part in (cand.get("content") or {}).get("parts", []):
            data = (part.get("inline_data") or part.get("inlineData") or {}).get("data")
            if data:
                return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
    raise MagicError("Gemini didn't return a picture (it may have declined this request). Try different words.")


# ------------------------------------------------------------------ Cloudflare Workers AI

CF_MODEL = "@cf/runwayml/stable-diffusion-v1-5-inpainting"


def _cloudflare(crop: Image.Image, hole: np.ndarray, prompt: str) -> Image.Image:
    acct, token = os.environ["CLOUDFLARE_ACCOUNT_ID"].strip(), os.environ["CLOUDFLARE_AI_TOKEN"].strip()
    size = 512
    img = crop.resize((size, size), Image.LANCZOS)
    m = Image.fromarray(hole.astype(np.uint8) * 255).resize((size, size), Image.NEAREST)
    body = {"prompt": f"{prompt}, photorealistic, natural lighting, matching the scene",
            "negative_prompt": "text, watermark, blurry, distorted, cartoon",
            "image": list(_png(img)), "mask": list(_png(m)), "num_steps": 20, "strength": 1, "guidance": 7.5}
    r = httpx.post(f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/{CF_MODEL}",
                   headers={"Authorization": f"Bearer {token}"}, json=body, timeout=TIMEOUT)
    if r.status_code == 429 or (r.status_code == 403 and "5035" in r.text):
        raise MagicError("Cloudflare's free limit is reached for today.")
    if r.status_code in (400, 401, 403):
        raise MagicError("Cloudflare refused the edit. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.")
    r.raise_for_status()
    if r.headers.get("content-type", "").startswith("image/"):
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    raise MagicError("Cloudflare didn't return a picture.")


# ------------------------------------------------------------------ public

def replace(im: Image.Image, mask: np.ndarray, prompt: str) -> tuple[Image.Image, str]:
    """Returns (edited photo, engine used). Only the selected area changes."""
    prompt = " ".join((prompt or "").split())[:300]
    if len(prompt) < 2:
        raise MagicError("Type what should appear there, e.g. “a cup of coffee”.")
    if not mask.any():
        raise MagicError("Nothing is selected. Tap the object first.")
    avail = engines()
    if not avail:
        raise MagicError("Replace isn't switched on yet on this server. Remove, Move and Resize work now.")
    w, h = im.size
    grow = max(6, int(round(max(w, h) / 120)))
    hole_full = _grow(mask, grow)
    X0, Y0, X1, Y1 = _region(hole_full, w, h)
    crop, hole = im.crop((X0, Y0, X1, Y1)), hole_full[Y0:Y1, X0:X1]
    errors = []
    for name in avail:
        try:
            gen = (_gemini if name == "gemini" else _cloudflare)(crop, hole, prompt)
        except MagicError as e:
            errors.append(str(e))
            continue
        except httpx.HTTPError as e:
            errors.append(f"{name} couldn't be reached ({type(e).__name__}).")
            continue
        gen = gen.resize(crop.size, Image.LANCZOS)
        soft = Image.fromarray(hole.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(max(2.0, grow / 2)))
        out = im.copy()
        out.paste(Image.composite(gen, crop, soft), (X0, Y0))
        return out, name
    raise MagicError(" ".join(errors) or "Replace failed.")
