"""Clip effects used by the Shorts studio (rounded corners, border, shadow, blur, mirror), text styles and wide crops,
rendered with real FFmpeg and measured pixel by pixel."""
import subprocess
import uuid

import pytest
from PIL import Image

from app.timeline import AssetInfo, Crop, Timeline, Title, Transform, compile_ffmpeg

W, H, FPS = 360, 640, 30


def _img(tmp_path, name, w, h, draw=None, colour=(220, 30, 30)):
    im = Image.new("RGB", (w, h), colour)
    if draw:
        draw(im)
    p = str(tmp_path / f"{name}.png")
    im.save(p)
    return p, w, h


def _render(tmp_path, tracks, assets, n=1):
    tl = {"schema_version": 1, "fps": FPS, "width": W, "height": H, "tracks": tracks}
    t = Timeline.model_validate(tl)
    out = str(tmp_path / f"out{uuid.uuid4().hex[:6]}.mp4")
    argv, _ = compile_ffmpeg(t, assets, out, workdir=str(tmp_path))
    r = subprocess.run(argv, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-2000:]
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out],
                           capture_output=True, text=True, check=True).stdout.strip()
    assert probe == f"{W},{H}"
    png = str(tmp_path / "f.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", out, "-frames:v", "1", png], check=True)
    return Image.open(png).convert("RGB")


def _asset(path, w, h):
    aid = uuid.uuid4()
    return aid, AssetInfo(path=path, kind="image", has_audio=False, has_video=True, width=w, height=h)


def _clip(cid, aid, **kw):
    return {"id": cid, "asset_id": str(aid), "start": 0, "in": 0, "out": 15, **kw}


def _track(tid, *clips):
    return {"id": tid, "kind": "video", "name": tid, "clips": list(clips)}


def near(px, rgb, tol=40):
    return all(abs(a - b) <= tol for a, b in zip(px, rgb))


def test_rounded_corners_border_and_shadow(tmp_path):
    p, w, h = _img(tmp_path, "red", 400, 400)
    aid, info = _asset(p, w, h)
    bg, bw, bh = _img(tmp_path, "grey", 64, 64, colour=(128, 128, 128))
    bid, binfo = _asset(bg, bw, bh)
    # grey full-canvas background, then a 200x200 red square with radius 40, white 8px border and a shadow
    fx = {"radius": 40, "border": 8, "border_color": "#ffffff", "shadow": 10, "shadow_opacity": 0.8}
    img = _render(tmp_path, [_track("v2", _clip("c", aid, transform={"scale": 200 / 360}, fx=fx)),
                             _track("v1", _clip("b", bid, transform={"scale": 640 / 360 * 1.0}))],
                  {aid: info, bid: binfo})
    cx, cy = W // 2, H // 2
    assert near(img.getpixel((cx, cy)), (220, 30, 30))                      # picture
    assert near(img.getpixel((cx - 100 + 3, cy)), (220, 30, 30))            # straight edge still picture
    assert not near(img.getpixel((cx - 100 + 3, cy - 100 + 3)), (220, 30, 30))  # rounded corner cut away
    assert near(img.getpixel((cx - 100 - 4, cy)), (255, 255, 255), 50)     # 8px border outside the left edge
    below = img.getpixel((cx, cy + 100 + 8 + 6))                             # shadow under the bottom border
    assert sum(below) < sum((128, 128, 128)) - 30


def test_blur_mirror_and_wide_crop(tmp_path):
    def halves(im):
        for x in range(200):
            for y in range(100):
                im.putpixel((x, y), (20, 20, 220))     # left half blue, right half red
    p, w, h = _img(tmp_path, "split", 400, 100, halves)
    aid, info = _asset(p, w, h)
    # mirror: blue must end up on the right
    img = _render(tmp_path, [_track("v1", _clip("c", aid, fx={"flip_h": True}))], {aid: info})
    y = H // 2
    assert near(img.getpixel((W - 20, y)), (20, 20, 220)) and near(img.getpixel((20, y)), (220, 30, 30))
    # crop keeping only the right 10% (needs more than the old 45% limit) -> all red
    img = _render(tmp_path, [_track("v1", _clip("c", aid, crop={"left": 0.9, "right": 0, "top": 0, "bottom": 0}))], {aid: info})
    assert near(img.getpixel((W // 2, H // 2)), (220, 30, 30))
    # blur softens the hard blue/red edge in the middle
    sharp = _render(tmp_path, [_track("v1", _clip("c", aid))], {aid: info})
    soft = _render(tmp_path, [_track("v1", _clip("c", aid, fx={"blur": 12}))], {aid: info})
    def edge(im):
        row = [im.getpixel((x, H // 2))[2] for x in range(W // 2 - 20, W // 2 + 20)]
        return max(abs(a - b) for a, b in zip(row, row[1:]))
    assert edge(soft) < edge(sharp) / 3
    with pytest.raises(ValueError):
        Crop(left=0.6, right=0.5)


def test_shaped_clip_with_keyframes_and_rotation_renders(tmp_path):
    p, w, h = _img(tmp_path, "red", 300, 300)
    aid, info = _asset(p, w, h)
    fx = {"radius": 30, "border": 6, "shadow": 8}
    kf = {"y": [{"t": 0, "v": -200}, {"t": 14, "v": 200}], "scale": [{"t": 0, "v": 0.8}, {"t": 14, "v": 1.0}]}
    img = _render(tmp_path, [_track("v1", _clip("c", aid, fx=fx, keyframes=kf, transform={"rotation": 10}))], {aid: info})
    assert sum(img.getpixel((W // 2, H // 2 - 200))) > 150                   # first frame: clip moved up by 200


def test_text_styles_render(tmp_path):
    title = Title(text="Header line\nsecond", font_size=48, color="#ffee00", stroke=4, stroke_color="#000000", shadow=0.7, align="left")
    tl = {"schema_version": 1, "fps": FPS, "width": W, "height": H,
          "tracks": [_track("v1", {"id": "t", "start": 0, "in": 0, "out": 15, "title": title.model_dump(), "transform": {"y": -200}})]}
    t = Timeline.model_validate(tl)
    out = str(tmp_path / "t.mp4")
    argv, _ = compile_ffmpeg(t, {}, out, workdir=str(tmp_path))
    subprocess.run(argv, check=True, capture_output=True)
    png = str(tmp_path / "t.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", out, "-frames:v", "1", png], check=True)
    img = Image.open(png).convert("RGB")
    band = [img.getpixel((x, y)) for x in range(W) for y in range(90, 160)]
    assert any(near(px, (255, 238, 0), 50) for px in band)                   # yellow letters
    assert any(sum(px) < 60 for px in band)                                  # black outline
    assert Title(text="x").align == "center" and Title(text="x").stroke == 0  # old titles unchanged
    with pytest.raises(ValueError):
        Title(text="x", align="middle")
    assert Transform().scale == 1
