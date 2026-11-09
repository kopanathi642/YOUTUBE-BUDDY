"""Every Shorts-studio style on every aspect ratio, as compiled by the browser's composer (frontend/src/compose.ts ->
tests/fixtures/compositions/matrix.json, regenerate with WRITE_FIXTURES=1 npx vitest run src/compose.test.ts), rendered by
the real export compiler and checked with ffprobe and frame sampling."""
import json
import os
import subprocess
import uuid

import pytest
from PIL import Image

from app.routers.compose import render_graphic
from app.timeline import AssetInfo, Timeline, compile_ffmpeg

HERE = os.path.dirname(__file__)
MATRIX = json.load(open(os.path.join(HERE, "fixtures", "compositions", "matrix.json")))


@pytest.fixture(scope="module")
def media(tmp_path_factory, fixtures_media):
    d = tmp_path_factory.mktemp("mx")
    logo = str(d / "img.png")
    Image.new("RGB", (400, 200), (240, 200, 20)).save(logo)
    return d, {"A_LAND": AssetInfo(path=fixtures_media["landscape_mp4"], kind="video", has_audio=True, has_video=True, duration_s=4, width=1280, height=720),
               "A_PORT": AssetInfo(path=fixtures_media["portrait_webm"], kind="video", has_audio=True, has_video=True, duration_s=3, width=360, height=640),
               "A_IMG": AssetInfo(path=logo, kind="image", has_audio=False, has_video=True, width=400, height=200)}


@pytest.mark.parametrize("key", sorted(MATRIX))
def test_style_renders_on_ratio(key, media, tmp_path):
    d, base = media
    raw = MATRIX[key]
    W, H = raw["width"], raw["height"]
    names = dict(base)
    for k in ("solid", "gradient", "vignette", "light_leak"):
        p = str(tmp_path / f"{k}.png")
        render_graphic(k, W, H, "#203050", "#a040c0", 180, 0.8, p)
        names[f"G_{k}"] = AssetInfo(path=p, kind="image", has_audio=False, has_video=True, width=W, height=H)
    ids = {k: uuid.uuid5(uuid.NAMESPACE_OID, k) for k in names}
    txt = json.dumps(raw)
    for k, u in ids.items():
        txt = txt.replace(f'"{k}"', f'"{u}"')
    tl = Timeline.model_validate(json.loads(txt))
    assert tl.composition is not None
    out = str(tmp_path / "o.mp4")
    argv, dur = compile_ffmpeg(tl, {ids[k]: v for k, v in names.items()}, out, workdir=str(tmp_path))
    r = subprocess.run(argv, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-1500:]
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", out],
                                      capture_output=True, text=True, check=True).stdout)
    v = [s for s in probe["streams"] if s["codec_type"] == "video"][0]
    assert (v["width"], v["height"]) == (W, H)
    assert abs(float(probe["format"]["duration"]) - 1.0) < 0.1
    png = str(tmp_path / "f.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.6", "-i", out, "-frames:v", "1", png], check=True)
    img = Image.open(png).convert("RGB")
    lit = sum(1 for p in img.resize((32, 32)).getdata() if sum(p) > 60)
    assert lit > 32 * 32 * 0.2, f"{key}: mostly black frame"
    # every visible media layer shows picture at its box centre
    for t in tl.tracks:
        for c in t.clips:
            if c.asset_id and t.kind == "video" and not t.hidden and c.keyframes is None and not (c.fx and c.fx.blur) and c.transform.opacity == 1:
                px = img.getpixel((min(W - 1, int(W / 2 + c.transform.x)), min(H - 1, int(H / 2 + c.transform.y))))
                assert sum(px) > 30, (key, t.name, px)
