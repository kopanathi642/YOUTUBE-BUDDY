"""Keyframe animation: maths, validation, and real FFmpeg renders measured frame by frame."""
import subprocess
import uuid

import pytest

from app.timeline import (AssetInfo, Keyframe, Keyframes, Timeline, Transform, compile_ffmpeg, default_timeline, kf_value,
                          slice_keyframes, slice_timeline)

W, H, FPS = 320, 180, 30


def test_values_linear_ease_hold_and_validation():
    k = [Keyframe(t=0, v=0), Keyframe(t=10, v=100, ease="ease"), Keyframe(t=20, v=0, ease="hold"), Keyframe(t=30, v=50)]
    assert kf_value(k, -5, 9) == 0 and kf_value(k, 5, 9) == 50                  # before first, linear middle
    assert kf_value(k, 15, 9) == pytest.approx(50) and kf_value(k, 12, 9) > 100 - 100 * 0.2   # ease leaves slowly (linear would be 80)
    assert kf_value(k, 25, 9) == 0 and kf_value(k, 30, 9) == 50 and kf_value(k, 99, 9) == 50   # hold, then last value
    assert kf_value([], 5, 7) == 7
    with pytest.raises(ValueError):
        Keyframes(x=[Keyframe(t=5, v=0), Keyframe(t=5, v=1)])
    with pytest.raises(ValueError):
        Keyframes(opacity=[Keyframe(t=0, v=2)])


def test_slicing_keeps_the_animation_continuous():
    kf = Keyframes(x=[Keyframe(t=0, v=0), Keyframe(t=30, v=90)])
    part = slice_keyframes(kf, 10, 20, Transform())
    assert [(f.t, round(f.v)) for f in part.x] == [(0, 30), (9, 57)]


def _solid(tmp_path, colour="white", w=80, h=45):
    p = str(tmp_path / f"{colour}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={colour}:s={w}x{h}", "-frames:v", "1", p], check=True)
    return p


def _render(tmp_path, clip: dict, asset_path=None) -> list[bytes]:
    tl = default_timeline(FPS, W, H)
    assets = {}
    if asset_path:
        aid = uuid.uuid4()
        clip = {**clip, "asset_id": str(aid)}
        assets[aid] = AssetInfo(path=asset_path, kind="image", has_audio=False, has_video=True)
    tl["tracks"][3 if asset_path else 2]["clips"] = [clip]
    t = Timeline.model_validate(tl)
    out = str(tmp_path / "anim.mp4")
    argv, _ = compile_ffmpeg(t, assets, out, workdir=str(tmp_path))
    r = subprocess.run(argv, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-1500:]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", out, "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    return [raw[i * W * H:(i + 1) * W * H] for i in range(len(raw) // (W * H))]


def _centroid(frame: bytes):
    xs = ys = n = 0
    for i, v in enumerate(frame):
        if v > 128:
            xs += i % W; ys += i // W; n += 1
    return (xs / n, ys / n, n) if n else (None, None, 0)


def test_render_moves_scales_and_rotates_a_clip(tmp_path):
    clip = {"id": "c1", "start": 0, "in": 0, "out": 30, "transform": {"scale": 0.25},
            "keyframes": {"x": [{"t": 0, "v": -100}, {"t": 29, "v": 100}], "rotation": [{"t": 0, "v": 0}, {"t": 29, "v": 90}]}}
    fr = _render(tmp_path, clip, _solid(tmp_path))
    x0, y0, n0 = _centroid(fr[0])
    x1, y1, n1 = _centroid(fr[-1])
    print("start", x0, y0, n0, "end", x1, y1, n1)
    assert abs(x0 - (W / 2 - 100)) < 4 and abs(x1 - (W / 2 + 100)) < 4 and abs(y0 - H / 2) < 4
    # 80x45 source fits the 320x180 canvas exactly at scale 1 -> 80x45 at 0.25; rotated 90° it becomes 45 wide, 80 tall
    tall = [i // W for i, v in enumerate(fr[-1]) if v > 128]
    assert 70 < max(tall) - min(tall) < 90
    mid = _centroid(fr[15])[0]
    assert abs(mid - (W / 2 - 100 + 200 * 15 / 29)) < 4   # exact frame timing: keyframe t counts the clip's frames from 0


def test_render_animates_opacity(tmp_path):
    clip = {"id": "c1", "start": 0, "in": 0, "out": 30, "keyframes": {"opacity": [{"t": 0, "v": 0}, {"t": 20, "v": 1}]}}
    fr = _render(tmp_path, clip, _solid(tmp_path))
    centre = lambda f: f[(H // 2) * W + W // 2]   # noqa: E731
    vals = [centre(f) for f in fr]
    print("brightness", vals[0], vals[10], vals[20], vals[-1])
    assert vals[0] < 30 and 90 < vals[10] < 170 and vals[20] > 225 and vals[-1] > 225


def test_render_animates_a_title(tmp_path):
    clip = {"id": "t1", "start": 0, "in": 0, "out": 30, "title": {"text": "Goa", "font_size": 60, "color": "#ffffff"},
            "keyframes": {"y": [{"t": 0, "v": 60}, {"t": 29, "v": -60, "ease": "linear"}]}}
    fr = _render(tmp_path, clip)
    y0, y1 = _centroid(fr[0])[1], _centroid(fr[-1])[1]
    print("title y", y0, y1)
    assert y0 - y1 > 100


def test_shorts_slice_keeps_keyframes():
    tl = default_timeline(FPS, W, H)
    tl["tracks"][2]["clips"] = [{"id": "t1", "start": 0, "in": 0, "out": 60, "title": {"text": "Hi", "font_size": 40, "color": "#ffffff"},
                                "keyframes": {"x": [{"t": 0, "v": 0}, {"t": 59, "v": 59}]}}]
    out = slice_timeline(tl, 30, 60)
    c = out["tracks"][2]["clips"][0]
    assert c["keyframes"]["x"][0] == {"t": 0, "v": 30.0, "ease": "linear"}
