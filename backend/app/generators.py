"""Resolve-style generators (solid colour, gradients, bars, grey scale, grid, window, speed lines, paper).
Each one is drawn once as a PNG at the sequence size and added to the media bin as an ordinary image, so effects,
transforms, keyframes and transitions work on it and the preview is the same picture the export uses."""
import math
import subprocess
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pydantic import BaseModel, ConfigDict, Field

HEX = r"^#[0-9a-fA-F]{6}$"
GenType = Literal["solid", "gradient", "fourcolor", "radial", "bars", "smpte", "greyscale", "grid", "window", "speedlines", "paper"]
LABELS = {"solid": "Solid Color", "gradient": "Gradient", "fourcolor": "Four Color Gradient", "radial": "Radial Gradient", "bars": "Color Bars",
          "smpte": "SMPTE Bars", "greyscale": "Grey Scale", "grid": "Grid", "window": "Window", "speedlines": "Comic Speed Lines", "paper": "Paper"}


class GenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: GenType
    width: int = Field(1920, ge=144, le=3840)
    height: int = Field(1080, ge=144, le=3840)
    color: str = Field("#7c3aed", pattern=HEX)
    color2: str = Field("#22d3ee", pattern=HEX)
    color3: str = Field("#f59e0b", pattern=HEX)
    color4: str = Field("#ef4444", pattern=HEX)
    angle: float = Field(90, ge=-360, le=360)    # CSS-style: 0 = to top, 90 = to right


def _rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)


def render(g: GenIn, path: str) -> None:
    W, H = g.width, g.height
    c1, c2, c3, c4 = (_rgb(c) for c in (g.color, g.color2, g.color3, g.color4))
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float64) + 0.5
    if g.type == "smpte":   # FFmpeg's own SMPTE HD bars at the exact size
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"smptehdbars=s={W}x{H}:d=1", "-frames:v", "1", path], check=True)
        return
    if g.type == "solid":
        arr = np.broadcast_to(c1, (H, W, 3))
    elif g.type == "gradient":   # same geometry as a CSS linear-gradient(angle)
        a = math.radians(g.angle)
        L = abs(W * math.sin(a)) + abs(H * math.cos(a))
        t = np.clip(((xs - W / 2) * math.sin(a) - (ys - H / 2) * math.cos(a)) / L + 0.5, 0, 1)[..., None]
        arr = c1 * (1 - t) + c2 * t
    elif g.type == "fourcolor":   # corners: top-left, top-right, bottom-left, bottom-right
        u, v = (xs / W)[..., None], (ys / H)[..., None]
        arr = (c1 * (1 - u) + c2 * u) * (1 - v) + (c3 * (1 - u) + c4 * u) * v
    elif g.type == "radial":
        r = np.clip(np.hypot(xs - W / 2, ys - H / 2) / math.hypot(W / 2, H / 2), 0, 1)[..., None]
        arr = c1 * (1 - r) + c2 * r
    elif g.type == "bars":   # 75 % colour bars
        cols = [(191, 191, 191), (191, 191, 0), (0, 191, 191), (0, 191, 0), (191, 0, 191), (191, 0, 0), (0, 0, 191)]
        idx = np.minimum((xs * 7 / W).astype(int), 6)
        arr = np.array(cols, dtype=np.float64)[idx]
    elif g.type == "greyscale":   # 11 steps, black to white
        idx = np.minimum((xs * 11 / W).astype(int), 10)
        arr = np.repeat((idx * 25.5)[..., None], 3, axis=2)
    elif g.type == "grid":
        s = max(8, round(min(W, H) / 12))
        on = ((xs // s + ys // s) % 2 == 0)[..., None]
        arr = np.where(on, c1, c2)
    elif g.type == "window":   # white rounded rectangle on black: a matte for picture-in-picture or vignettes
        im = Image.new("RGB", (W, H), "black")
        m = round(min(W, H) * 0.12)
        ImageDraw.Draw(im).rounded_rectangle([m, m, W - m, H - m], radius=round(min(W, H) * 0.06), fill=g.color)
        im.save(path)
        return
    elif g.type == "speedlines":   # comic speed lines around a clear centre
        im = Image.new("RGB", (W, H), g.color2)
        d = ImageDraw.Draw(im)
        R = math.hypot(W, H)
        rng = np.random.default_rng(7)
        for i in range(140):
            ang = i / 140 * 2 * math.pi + rng.uniform(-0.01, 0.01)
            r0 = R * rng.uniform(0.22, 0.34)
            w = rng.uniform(0.004, 0.012)
            pts = [(W / 2 + math.cos(ang - w) * R, H / 2 + math.sin(ang - w) * R), (W / 2 + math.cos(ang) * r0, H / 2 + math.sin(ang) * r0),
                   (W / 2 + math.cos(ang + w) * R, H / 2 + math.sin(ang + w) * R)]
            d.polygon(pts, fill=g.color)
        im.save(path)
        return
    else:   # paper: warm off-white with fixed fibre noise
        rng = np.random.default_rng(11)
        base = c1
        noise = rng.normal(0, 1, (H // 2 + 1, W // 2 + 1))
        im = Image.fromarray(np.uint8(np.clip(128 + noise * 40, 0, 255))).resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
        n = (np.asarray(im, dtype=np.float64) - 128) / 128
        arr = np.clip(base + n[..., None] * 10, 0, 255)
    Image.fromarray(np.uint8(np.round(np.asarray(arr)))).save(path)
