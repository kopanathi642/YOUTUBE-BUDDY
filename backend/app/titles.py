"""Title rendering with Pillow + libraqm (HarfBuzz/FriBiDi shaping), so Indic and Arabic scripts join correctly.
FFmpeg's drawtext in common builds does not shape Devanagari properly, so titles are rendered here as PNG layers."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTS = Path(__file__).parent / "assets" / "fonts"
DEFAULT = "InterDisplay-Bold.otf"
SCRIPTS = [  # (first, last codepoint, font file) — keep in sync with frontend/src/fonts.ts
    (0x0900, 0x097F, "NotoSansDevanagari-Bold.ttf"), (0x0980, 0x09FF, "NotoSansBengali-Bold.ttf"),
    (0x0A00, 0x0A7F, "NotoSansGurmukhi-Bold.ttf"), (0x0A80, 0x0AFF, "NotoSansGujarati-Bold.ttf"),
    (0x0B00, 0x0B7F, "NotoSansOriya-Bold.ttf"), (0x0B80, 0x0BFF, "NotoSansTamil-Bold.ttf"),
    (0x0C00, 0x0C7F, "NotoSansTelugu-Bold.ttf"), (0x0C80, 0x0CFF, "NotoSansKannada-Bold.ttf"),
    (0x0D00, 0x0D7F, "NotoSansMalayalam-Bold.ttf"), (0x0600, 0x06FF, "NotoSansArabic-Bold.ttf"),
]


def font_for(text: str) -> str:
    for ch in text:
        cp = ord(ch)
        for lo, hi, f in SCRIPTS:
            if lo <= cp <= hi:
                return f
    return DEFAULT


def _hex(c: str, a: float = 1.0) -> tuple[int, int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), round(255 * a)


def render_title_png(title, transform, W: int, H: int, path: str) -> None:
    """Full-canvas transparent PNG with the title centred at (W/2 + x, H/2 + y), rotated about its own centre."""
    size = max(4, round(title.font_size * transform.scale))
    font = ImageFont.truetype(str(FONTS / font_for(title.text)), size, layout_engine=ImageFont.Layout.RAQM)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    l, t, r, b = probe.multiline_textbbox((0, 0), title.text, font=font, align="center", spacing=round(size * 0.2))
    pad = max(2, round(size * 0.25)) if title.bg_color else 2
    lw, lh = (r - l) + 2 * pad, (b - t) + 2 * pad
    layer = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if title.bg_color:
        d.rectangle([0, 0, lw - 1, lh - 1], fill=_hex(title.bg_color, title.bg_opacity))
    d.multiline_text((pad - l, pad - t), title.text, font=font, fill=_hex(title.color), align="center", spacing=round(size * 0.2))
    if transform.rotation:
        layer = layer.rotate(-transform.rotation, resample=Image.BICUBIC, expand=True)  # positive = clockwise, like CSS
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, cy = W / 2 + transform.x, H / 2 + transform.y
    canvas.paste(layer, (round(cx - layer.width / 2), round(cy - layer.height / 2)), layer)  # clips safely at edges
    canvas.save(path, optimize=False)
