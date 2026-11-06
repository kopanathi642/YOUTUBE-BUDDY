"""Titles (with awkward characters), speed changes and crop render correctly."""
import subprocess

import httpx

from tests.test_editor_flow import drain, new_project, signup, upload
from tests.test_studio_tools import _grey


def _render(c, seq, tl, preset="draft"):
    r = c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": seq["version"], "timeline": tl})
    assert r.status_code == 200, r.text
    e = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": preset}).json()
    drain()
    ex = next(x for x in c.get(f"/api/v1/projects/{seq['project_id']}/exports").json() if x["id"] == e["id"])
    assert ex["job"]["status"] == "succeeded", ex["job"]
    path = f"/tmp/creator-worker-test/{e['id']}.mp4"
    open(path, "wb").write(httpx.get(ex["download_url"]).content)
    return ex, path


def _px(path, t, x, y, w=8, h=8):
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", path, "-frames:v", "1", "-vf", f"crop={w}:{h}:{x}:{y},scale=1:1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return tuple(out[:3])


def test_title_speed_and_crop(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws, format="landscape")
    vid = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")   # 4 s, 30 fps, with tone
    grey = upload(c, p["id"], _grey(), "video/mp4")
    drain()
    seq = p["sequences"][0]
    tl = seq["timeline"]
    tr = {t["id"]: t for t in tl["tracks"]}
    # V1: 4 s of source at 2x = 2 s, then grey (1 s source) at 0.5x = 2 s with a 50% crop from the left
    tr["v1"]["clips"] = [
        {"id": "fast", "asset_id": vid["id"], "start": 0, "in": 0, "out": 120, "speed": 2.0},
        {"id": "slow", "asset_id": grey["id"], "start": 60, "in": 0, "out": 30, "speed": 0.5, "crop": {"left": 0.4}},
    ]
    # V2: title with characters that break naive escaping
    tr["v2"]["clips"] = [{"id": "t1", "title": {"text": "It's 100% \"LIVE\": a\\b {x} — टेस्ट", "font_size": 120,
                                               "color": "#ffffff", "bg_color": "#7c3aed", "bg_opacity": 1.0},
                          "start": 0, "in": 0, "out": 60, "transform": {"y": 0}}]
    ex, path = _render(c, seq, tl)
    assert abs(ex["validation"]["measured"]["duration_s"] - 4.0) < 0.1, ex["validation"]   # 2 s + 2 s
    W, H = ex["validation"]["measured"]["width"], ex["validation"]["measured"]["height"]
    # title box (purple) is centred while the title is on screen
    r, g, b = _px(path, 1.0, W // 2 - 4, H // 2 - 4 - 30)
    assert b > 150 and r > 80 and g < 120, (r, g, b)
    # cropped grey clip: right half of the frame black is impossible — the crop keeps the right half of the source,
    # scaled to fit; centre should be grey, and audio of fast clip exists
    r, g, b = _px(path, 3.0, W // 2 - 4, H // 2 - 4)
    assert abs(r - 128) < 20 and abs(g - 128) < 20, (r, g, b)
    # the 2x clip's audio really lasts ~2 s (atempo), then silence
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "silencedetect=noise=-40dB:d=0.5", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    assert "silence_start: 2" in out or "silence_start: 1.9" in out, out[-500:]


def test_clip_must_have_media_or_title(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    seq = p["sequences"][0]
    tl = seq["timeline"]
    tl["tracks"][2]["clips"] = [{"id": "x", "start": 0, "in": 0, "out": 30}]
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 422
    tl["tracks"][2]["clips"] = [{"id": "x", "start": 0, "in": 0, "out": 30, "title": {"text": "Hi"}, "speed": 2}]
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 422


def test_title_png_picks_script_font_and_draws(tmp_path):
    from PIL import Image
    from app.timeline import Title, Transform
    from app.titles import font_for, render_title_png
    assert font_for("नमस्ते दोस्तों") == "NotoSansDevanagari-Bold.ttf"
    assert font_for("வணக்கம்") == "NotoSansTamil-Bold.ttf"
    assert font_for("Hello") == "InterDisplay-Bold.otf"
    p = tmp_path / "t.png"
    render_title_png(Title(text="नमस्ते", font_size=80, bg_color="#000000"), Transform(x=100, rotation=10), 640, 360, str(p))
    im = Image.open(p)
    assert im.size == (640, 360) and im.getbbox() is not None
    l, t, r, b = im.getbbox()
    assert (l + r) / 2 > 320 + 60   # shifted right by x=100


def test_mixed_hindi_english_title_uses_two_fonts_and_no_missing_glyphs(tmp_path):
    from PIL import Image
    from app.timeline import Title, Transform
    from app.titles import render_title_png, runs
    r = runs("गोवा Trip 2026 की यात्रा!")
    assert [f for f, _ in r] == ["NotoSansDevanagari-Bold.ttf", "InterDisplay-Bold.otf", "NotoSansDevanagari-Bold.ttf", "InterDisplay-Bold.otf"] or \
        "InterDisplay-Bold.otf" in [f for f, _ in r] and "NotoSansDevanagari-Bold.ttf" in [f for f, _ in r]
    assert "".join(t for _, t in r) == "गोवा Trip 2026 की यात्रा!"
    # English run must draw ink (Noto Devanagari alone would draw empty boxes / nothing for Latin letters)
    p1, p2 = tmp_path / "a.png", tmp_path / "b.png"
    render_title_png(Title(text="Trip"), Transform(), 400, 200, str(p1))
    render_title_png(Title(text="गोवा\nTrip"), Transform(), 400, 300, str(p2))
    a, b = Image.open(p1).getbbox(), Image.open(p2).getbbox()
    assert a and b and (b[2] - b[0]) >= (a[2] - a[0]) * 0.9
