"""Title rendering with Pillow + libraqm (HarfBuzz/FriBiDi shaping), so Indic and Arabic scripts join correctly.
FFmpeg's drawtext in common builds does not shape Devanagari properly, so titles are rendered here as PNG layers."""
from functools import lru_cache
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
    """Main script font for a text (Latin -> Inter)."""
    for ch in text:
        cp = ord(ch)
        for lo, hi, f in SCRIPTS:
            if lo <= cp <= hi:
                return f
    return DEFAULT


@lru_cache(maxsize=None)
def _cmap(f: str) -> frozenset:
    from fontTools.ttLib import TTFont
    return frozenset(TTFont(str(FONTS / f)).getBestCmap().keys())


def runs(line: str) -> list[tuple[str, str]]:
    """Split a line into (font_file, text) runs: script letters use the Noto script font, everything else the
    first font that has the glyph (Noto Indic fonts have no Latin letters, Inter has no Indic letters)."""
    main = font_for(line)
    out: list[list[str]] = []
    for ch in line:
        cp = ord(ch)
        if ch.isspace() or 0x200C <= cp <= 0x200D:  # spaces and joiners stay with the current run
            f = out[-1][0] if out else main
        elif main != DEFAULT and cp in _cmap(main) and (any(lo <= cp <= hi for lo, hi, _ in SCRIPTS) or not out or out[-1][0] == main):
            f = main
        else:
            f = DEFAULT if cp in _cmap(DEFAULT) else main
        if out and out[-1][0] == f:
            out[-1][1] += ch
        else:
            out.append([f, ch])
    return [(f, t) for f, t in out]


def _hex(c: str, a: float = 1.0) -> tuple[int, int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), round(255 * a)


def render_title_png(title, transform, W: int, H: int, path: str) -> None:
    """Full-canvas transparent PNG with the title centred at (W/2 + x, H/2 + y), rotated about its own centre.
    Mixed-script lines (e.g. Hindi + English) are drawn run by run, each run in a font that has its letters."""
    size = max(4, round(title.font_size * transform.scale))
    fonts: dict[str, ImageFont.FreeTypeFont] = {}
    get = lambda f: fonts.setdefault(f, ImageFont.truetype(str(FONTS / f), size, layout_engine=ImageFont.Layout.RAQM))  # noqa: E731
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    lines = title.text.split("\n") or [""]
    asc = max(get(f).getmetrics()[0] for f in {DEFAULT, font_for(title.text)})
    desc = max(get(f).getmetrics()[1] for f in {DEFAULT, font_for(title.text)})
    line_h, gap = asc + desc, round(size * 0.2)
    laid = [[(get(f), t, probe.textlength(t, font=get(f))) for f, t in runs(ln)] for ln in lines]
    widths = [sum(w for _, _, w in ln) for ln in laid]
    pad = max(2, round(size * 0.25)) if title.bg_color else 2
    lw = round(max(widths + [1])) + 2 * pad
    lh = len(lines) * line_h + (len(lines) - 1) * gap + 2 * pad
    layer = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if title.bg_color:
        d.rectangle([0, 0, lw - 1, lh - 1], fill=_hex(title.bg_color, title.bg_opacity))
    for i, (ln, wdt) in enumerate(zip(laid, widths)):
        x, base = (lw - wdt) / 2, pad + i * (line_h + gap) + asc
        for font, t, w in ln:
            d.text((x, base), t, font=font, fill=_hex(title.color), anchor="ls")
            x += w
    if transform.rotation:
        layer = layer.rotate(-transform.rotation, resample=Image.BICUBIC, expand=True)  # positive = clockwise, like CSS
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, cy = W / 2 + transform.x, H / 2 + transform.y
    canvas.paste(layer, (round(cx - layer.width / 2), round(cy - layer.height / 2)), layer)  # clips safely at edges
    canvas.save(path, optimize=False)


def render_watermark_png(text: str, path: str) -> None:
    """A translucent pill with the product name, used on Free-plan exports."""
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype(str(FONTS / font_for(text)), 44)
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=f)
    w, h = x1 - x0 + 56, y1 - y0 + 30
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    dr.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=(0, 0, 0, 120))
    dr.text((28 - x0, 15 - y0), text, font=f, fill=(255, 255, 255, 220))
    img.save(path)
