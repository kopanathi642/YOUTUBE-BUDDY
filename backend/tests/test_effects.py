"""Resolve/Premiere/CapCut-style clip effects rendered with real FFmpeg and checked against the preview maths
(the same matrices / curves as frontend/src/effects.ts)."""
import subprocess
import uuid

import pytest
from PIL import Image
from pydantic import ValidationError

from app.effects import Effect, effect_filters, hue_m, saturate_m, sepia_m, vignette_factor
from app.timeline import AssetInfo, Timeline, compile_ffmpeg

W, H, FPS = 320, 180, 30


def _render(tmp_path, colour, effects, size=(320, 180), draw=None):
    im = Image.new("RGB", size, colour)
    if draw:
        draw(im)
    p = str(tmp_path / f"in{uuid.uuid4().hex[:6]}.png")
    im.save(p)
    aid = uuid.uuid4()
    info = AssetInfo(path=p, kind="image", has_audio=False, has_video=True, width=size[0], height=size[1])
    tl = {"schema_version": 1, "fps": FPS, "width": W, "height": H, "tracks": [
        {"id": "v1", "kind": "video", "name": "V1", "clips": [{"id": "c", "asset_id": str(aid), "start": 0, "in": 0, "out": 6, "effects": effects}]}]}
    t = Timeline.model_validate(tl)
    out = str(tmp_path / f"o{uuid.uuid4().hex[:6]}.mp4")
    argv, _ = compile_ffmpeg(t, {aid: info}, out, workdir=str(tmp_path))
    r = subprocess.run(argv, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-2000:]
    png = str(tmp_path / f"f{uuid.uuid4().hex[:6]}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", out, "-frames:v", "1", png], check=True)
    return Image.open(png).convert("RGB")


def apply(m, rgb):
    r, g, b = rgb
    return tuple(max(0, min(255, round(m[i * 3] * r + m[i * 3 + 1] * g + m[i * 3 + 2] * b))) for i in range(3))


def near(a, b, tol=14):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


SRC = (200, 120, 60)


@pytest.mark.parametrize("effect, expect", [
    ({"type": "bw", "amount": 1}, apply(saturate_m(0), SRC)),
    ({"type": "sepia", "amount": 0.8}, apply(sepia_m(0.8), SRC)),
    ({"type": "hue", "amount": 90}, apply(hue_m(90), SRC)),
    ({"type": "invert", "amount": 1}, tuple(255 - v for v in SRC)),
    ({"type": "posterize", "amount": 2}, (255, 0, 0)),
])
def test_colour_effects_match_preview_maths(tmp_path, effect, expect):
    px = _render(tmp_path, SRC, [effect]).getpixel((W // 2, H // 2))
    assert near(px, expect), (effect, px, expect)


def test_vignette_darkens_corners_by_the_shared_curve(tmp_path):
    img = _render(tmp_path, (200, 200, 200), [{"type": "vignette", "amount": 0.8}])
    centre, corner = img.getpixel((W // 2, H // 2)), img.getpixel((3, 3))
    assert near(centre, (200, 200, 200))
    want = 200 * vignette_factor(0.8, 0.97)
    assert abs(corner[0] - want) < 25, (corner, want)


def test_letterbox_flip_rgbsplit_grain_sharpen_render(tmp_path):
    def top_red(im):
        for x in range(320):
            for y in range(90):
                im.putpixel((x, y), (220, 30, 30))
    img = _render(tmp_path, (30, 30, 220), [{"type": "letterbox", "amount": 0.15}, {"type": "flipv", "amount": 1}], draw=top_red)
    assert near(img.getpixel((W // 2, 5)), (0, 0, 0), 20)           # bar on top
    assert near(img.getpixel((W // 2, H - 5)), (0, 0, 0), 20)       # bar at the bottom
    assert near(img.getpixel((W // 2, H - 40)), (220, 30, 30), 40)  # flipped: red now at the bottom
    img = _render(tmp_path, (128, 128, 128), [{"type": "rgbsplit", "amount": 6}, {"type": "grain", "amount": 0.3}, {"type": "sharpen", "amount": 1}])
    assert img.size == (W, H)


def test_effect_validation():
    with pytest.raises(ValidationError):
        Effect(type="posterize", amount=40)
    with pytest.raises(ValidationError):
        Effect(type="nope", amount=1)
    with pytest.raises(ValidationError):   # same effect twice on one clip
        Timeline.model_validate({"schema_version": 1, "fps": 30, "width": 320, "height": 180, "tracks": [{"id": "v1", "kind": "video", "name": "V1", "clips": [
            {"id": "c", "asset_id": str(uuid.uuid4()), "start": 0, "in": 0, "out": 5, "effects": [{"type": "bw", "amount": 1}, {"type": "bw", "amount": 0.5}]}]}]})
    geo, pic = effect_filters([Effect(type="flipv", amount=1), Effect(type="sepia", amount=1)])
    assert geo == ["vflip"] and pic[0].startswith("colorchannelmixer=")


@pytest.mark.parametrize("kind", ["solid", "gradient", "fourcolor", "radial", "bars", "smpte", "greyscale", "grid", "window", "speedlines", "paper"])
def test_generators_draw_at_sequence_size(tmp_path, kind):
    from app.generators import GenIn, render
    p = str(tmp_path / f"{kind}.png")
    render(GenIn(type=kind, width=320, height=180, color="#ff0000", color2="#0000ff"), p)
    im = Image.open(p).convert("RGB")
    assert im.size == (320, 180)
    if kind == "gradient":   # CSS angle 90° = to the right: colour 1 on the left, colour 2 on the right
        assert near(im.getpixel((1, 90)), (255, 0, 0), 8) and near(im.getpixel((318, 90)), (0, 0, 255), 8)
    if kind == "solid":
        assert im.getpixel((160, 90)) == (255, 0, 0)


def test_emboss_edges_sketch_scanlines(tmp_path):
    def half(im):   # left half dark grey, right half light grey: one vertical edge in the middle
        for x in range(160):
            for y in range(180):
                im.putpixel((x, y), (60, 60, 60))
    base = (200, 200, 200)
    flat = _render(tmp_path, base, [{"type": "emboss", "amount": 1}])          # kernel sums to 1: flat areas keep their colour
    assert near(flat.getpixel((W // 2, H // 2)), base)
    e = _render(tmp_path, base, [{"type": "edges", "amount": 1}], draw=half)
    assert max(e.getpixel((40, 90))) < 30 and max(e.getpixel((280, 90))) < 30   # flat → black
    assert max(e.getpixel((160, 90))) > 120 or max(e.getpixel((159, 90))) > 120  # the edge lights up
    s = _render(tmp_path, base, [{"type": "sketch", "amount": 1}], draw=half)
    assert min(s.getpixel((40, 90))) > 225 and min(s.getpixel((280, 90))) > 225  # paper white
    sl = _render(tmp_path, (200, 200, 200), [{"type": "scanlines", "amount": 0.5}])
    col = [sl.getpixel((W // 2, y))[0] for y in range(40, 48)]
    assert min(col) < 150 and max(col) > 185                                   # dark line every 4 px, rest untouched
    assert near(sl.getpixel((0, 41)), sl.getpixel((W // 2, 41)), 12)           # no vertical line at x = 0
