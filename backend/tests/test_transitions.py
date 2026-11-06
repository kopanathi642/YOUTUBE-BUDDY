"""Transitions between touching clips: centred on the cut, held frames where a clip runs out, measured in real renders."""
import subprocess
import uuid

import pytest

from app.timeline import AssetInfo, Timeline, compile_ffmpeg, default_timeline, transition_links, TRANSITIONS

W, H, FPS = 256, 144, 30


def _png(tmp_path, colour):
    p = str(tmp_path / f"{colour}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={colour}:s={W}x{H}", "-frames:v", "1", p], check=True)
    return p


def _render(tmp_path, kind="fade", frames=10, b_extra=None, scale=1.0):
    ida, idb = uuid.uuid4(), uuid.uuid4()
    tl = default_timeline(FPS, W, H)
    tl["tracks"][3]["clips"] = [
        {"id": "A-1", "asset_id": str(ida), "start": 0, "in": 0, "out": 30, "transform": {"scale": scale}},
        {"id": "B.2", "asset_id": str(idb), "start": 30, "in": 0, "out": 30, "transform": {"scale": scale},
         "transition_in": {"type": kind, "frames": frames}, **(b_extra or {})}]
    t = Timeline.model_validate(tl)
    assets = {ida: AssetInfo(path=_png(tmp_path, "red"), kind="image", has_audio=False, has_video=True),
              idb: AssetInfo(path=_png(tmp_path, "blue"), kind="image", has_audio=False, has_video=True)}
    out = str(tmp_path / f"{kind}.mp4")
    argv, dur = compile_ffmpeg(t, assets, out, workdir=str(tmp_path))
    r = subprocess.run(argv, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-2000:]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", out, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    fr = [raw[i * W * H * 3:(i + 1) * W * H * 3] for i in range(len(raw) // (W * H * 3))]
    return fr, dur


def px(frame, x, y):
    i = (y * W + x) * 3
    return tuple(frame[i:i + 3])


def test_links_need_touching_clips_and_are_capped():
    t = Timeline.model_validate({**default_timeline(FPS, W, H)})
    from app.timeline import Clip
    a = Clip(id="a", asset_id=uuid.uuid4(), start=0, out=20)
    b = Clip(id="b", asset_id=uuid.uuid4(), start=20, out=8, transition_in={"type": "fade", "frames": 30})
    c = Clip(id="c", asset_id=uuid.uuid4(), start=40, out=20, transition_in={"type": "fade", "frames": 10})  # gap before it
    assert transition_links([a, b, c]) == {"b": (4, 4)}   # capped to the shorter clip (8 frames), split around the cut
    assert len(TRANSITIONS) == 12


def test_dissolve_is_centred_on_the_cut_and_keeps_timing(tmp_path):
    fr, dur = _render(tmp_path, "fade", 10)
    assert len(fr) == 60 and dur == pytest.approx(2.0)          # timeline length unchanged
    r24, r30, r36 = px(fr[24], 80, 45), px(fr[30], 128, 72), px(fr[36], 80, 45)
    print("frame 24", r24, "frame 30 (cut)", r30, "frame 36", r36)
    assert r24[0] > 230 and r24[2] < 30                         # before: red
    assert 100 < r30[0] < 160 and 100 < r30[2] < 160            # at the cut: half way
    assert r36[2] > 230 and r36[0] < 30                         # after: blue


def test_wipe_moves_the_right_way(tmp_path):
    fr, _ = _render(tmp_path, "wipeleft", 10)
    mid = fr[30]
    print("wipeleft at cut: left", px(mid, 10, 72), "right", px(mid, 240, 72))
    assert px(mid, 10, 72)[0] > 200 and px(mid, 240, 72)[2] > 200   # incoming clip enters from the right


@pytest.mark.parametrize("kind", ["fadeblack", "slideup", "circleopen"])
def test_other_transitions_render(tmp_path, kind):
    fr, _ = _render(tmp_path, kind, 12)
    assert px(fr[10], 128, 72)[0] > 200 and px(fr[50], 128, 72)[2] > 200   # red well before, blue well after


def test_transition_between_smaller_clips_keeps_transparency(tmp_path):
    fr, _ = _render(tmp_path, "fade", 10, scale=0.5)
    print("corner during dissolve", px(fr[30], 5, 5), "centre", px(fr[30], 128, 72))
    assert max(px(fr[30], 5, 5)) < 25            # outside the half-size clips stays the black background
    assert px(fr[30], 128, 72)[0] > 90 and px(fr[30], 128, 72)[2] > 90
