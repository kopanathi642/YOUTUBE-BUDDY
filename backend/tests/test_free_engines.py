"""Free on-worker engines that replaced paid-only tools: image/video upscaling (FSRCNN), relight, portrait retouch,
canvas expansion and speaker diarization. Real outputs, measured."""
import subprocess

import numpy as np
import pytest
from PIL import Image

from tests.test_ai_tools import FIX, _media, clip, done, env, music, photo, run  # noqa: F401  (fixtures)
from tests.test_editor_flow import drain, upload


def _download(c, gen, tmp_path, idx=0):
    import uuid
    from app import storage
    from app.db import session_factory
    from app.models import MediaAsset
    with session_factory()() as db:
        m = db.get(MediaAsset, uuid.UUID(gen["outputs"][idx]["id"]))
        p = str(tmp_path / f"o{idx}{'.png' if m.kind == 'image' else '.mp4'}")
        storage.download(m.storage_key, p)
        return {"width": m.width, "height": m.height, "kind": m.kind}, p


def test_free_tools_are_ready_without_keys(env, monkeypatch):
    monkeypatch.delenv("FAL_KEY", raising=False)
    cat = env["c"].get("/api/v1/ai/tools").json()
    by = {t["id"]: t for t in cat["tools"]}
    for tid in ("026", "083", "084", "085", "088", "107"):
        assert by[tid]["status"]["state"] == "ready", (tid, by[tid]["status"])
        assert by[tid]["engine"] == "local"
    assert cat["counts"]["unbuilt"] == 1     # only Scheduled Workflows is left


def test_image_upscale_sharper_than_resize(env, tmp_path):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "084", {"image": env["image"], "scale": 2}))
    a, p = _download(c, g, tmp_path)
    assert (a["width"], a["height"]) == (1280, 720) and "FSRCNN" in g["model"]
    im = np.asarray(Image.open(p).convert("L")).astype(float)
    # the drawn box's edge stays crisp: a strong step over 3 px, not a long ramp
    row = im[300, 500:560]
    assert np.abs(np.diff(row)).max() > 60
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/084/run", json={"params": {"image": env["image"], "scale": 3}})
    assert r.status_code == 422


def test_video_upscale_to_1080p(env, tmp_path):
    c, pid = env["c"], env["pid"]
    small = _media("tools_small.mp4", ["-f", "lavfi", "-i", "testsrc2=s=320x180:r=15:d=2", "-f", "lavfi", "-i", "sine=f=440:d=2",
                                       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
    vid = upload(c, pid, small, "video/mp4")["id"]
    drain()
    g = done(c, run(c, pid, "026", {"video": vid, "target": "1080p"}))
    a, p = _download(c, g, tmp_path)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0", p],
                           capture_output=True, text=True, check=True).stdout
    assert "video,1920,1080" in probe and "audio" in probe
    assert g["result"]["frames"] >= 28
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/026/run", json={"params": {"video": vid, "target": "4K"}})
    g2 = r.json()
    drain()
    assert c.get(f"/api/v1/generations/{g2['id']}").json()["error"].startswith("4K upscaling needs")


def test_relight_changes_the_lit_side(env, tmp_path):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "085", {"image": env["image"], "lighting": "golden hour", "direction": 0}))   # light from the right
    _, p = _download(c, g, tmp_path)
    src = np.asarray(Image.open(f"{FIX}/tools_photo.png").convert("RGB")).astype(float)
    out = np.asarray(Image.open(p).convert("RGB")).astype(float)
    luma = lambda x: (x * np.array([0.299, 0.587, 0.114])).sum(axis=2)   # noqa: E731
    assert luma(out[:, -80:]).mean() > luma(src[:, -80:]).mean() + 10     # brighter where the light comes from
    assert luma(out[:, :80]).mean() < luma(src[:, :80]).mean()            # darker on the far side
    assert out[:, -80:, 0].mean() - out[:, -80:, 2].mean() > src[:, -80:, 0].mean() - src[:, -80:, 2].mean()   # warmer


def test_portrait_retouch_only_on_faces(env, tmp_path, monkeypatch):
    c, pid = env["c"], env["pid"]
    g = run(c, pid, "088", {"image": env["image"], "amount": 0.6, "_consent": True})
    drain()
    assert "No face found" in c.get(f"/api/v1/generations/{g['id']}").json()["error"]
    # a noisy "face" area: the fake detector finds it, smoothing must reduce noise there and leave the rest alone
    rng = np.random.default_rng(1)
    img = np.full((360, 640, 3), 180, np.uint8)
    import cv2
    blotches = cv2.resize(rng.normal(0, 22, (25, 25, 3)), (200, 200), interpolation=cv2.INTER_CUBIC)   # uneven skin, not pores
    img[80:280, 220:420] = np.clip(np.array([210, 170, 150]) + blotches, 0, 255)
    img[300:350, 20:120] = np.clip(120 + rng.normal(0, 18, (50, 100, 3)), 0, 255)
    p = tmp_path / "face.png"
    Image.fromarray(img).save(p)
    fid = upload(c, pid, str(p), "image/png")["id"]
    drain()

    class FakeDet:
        def __init__(self, *_):
            pass

        def detectMultiScale(self, *a, **k):
            return np.array([[230, 70, 180, 200]])
    monkeypatch.setattr(cv2, "CascadeClassifier", FakeDet)
    g = done(c, run(c, pid, "088", {"image": fid, "amount": 0.8, "_consent": True}))
    assert g["result"]["faces"] == 1
    _, op = _download(c, g, tmp_path)
    out = np.asarray(Image.open(op).convert("RGB")).astype(float)
    luma = lambda x: (x.astype(float) * np.array([0.299, 0.587, 0.114])).sum(axis=2)   # noqa: E731
    assert luma(out[140:220, 280:360]).std() < luma(img[140:220, 280:360]).std() * 0.7     # smoother skin
    assert abs(luma(out[300:350, 20:120]).std() - luma(img[300:350, 20:120]).std()) < 1     # background untouched


def test_outpaint_expands_and_keeps_original(env, tmp_path):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "083", {"image": env["image"], "expand": "9:16"}))
    a, p = _download(c, g, tmp_path)
    assert (a["width"], a["height"]) == (640, 1138)
    out = np.asarray(Image.open(p).convert("RGB")).astype(int)
    src = np.asarray(Image.open(f"{FIX}/tools_photo.png").convert("RGB")).astype(int)
    py = (1138 - 360) // 2
    assert np.abs(out[py + 60:py + 300, 60:580] - src[60:300, 60:580]).max() <= 2      # the original is untouched
    r = run(c, pid, "083", {"image": env["image"], "expand": "9:16", "prompt": "a beach"})
    drain()
    assert "premium model" in c.get(f"/api/v1/generations/{r['id']}").json()["error"]


def test_speaker_diarization_report(env, monkeypatch):
    from app.speech import diarize
    from app.tools import local_more
    segs = [{"start": 0.0, "end": 1.5, "text": "Hello there"}, {"start": 1.6, "end": 3.0, "text": "Hi, how are you"},
            {"start": 3.1, "end": 5.0, "text": "Great, thanks"}]
    monkeypatch.setattr(local_more, "_transcript", lambda rc, a, lang=None: {"language": "en", "segments": segs})
    monkeypatch.setattr(diarize, "label", lambda audio, s: ["S1", "S2", "S1"])
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "107", {"video": env["video"]}))
    r = g["result"]
    assert r["kind"] == "speakers" and [s["speaker"] for s in r["segments"]] == ["S1", "S2", "S1"]
    assert {s["id"]: s["lines"] for s in r["speakers"]} == {"S1": 2, "S2": 1}
    assert "[Speaker 2] Hi, how are you" in r["srt"]


def test_channel_tools_work_from_public_feeds(env, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app import growth_engine as ge
    now = datetime.now(timezone.utc)
    rows = [("Goa food tour #shorts", 2, 30000), ("Kerala travel guide", 10, 20000), ("Budget Goa trip", 18, 8000),
            ("Camera review", 30, 900), ("Goa beaches", 45, 15000), ("Q&A", 60, 400), ("Goa night market", 75, 12000)]

    def feed(cid):
        if cid.endswith("x" * 3):
            raise ge.GrowthError("YouTube says this channel doesn't exist (check the channel ID)")
        return {"title": f"Channel {cid[-2:]}", "videos": [{"id": f"v{i}", "title": t, "published_at": now - timedelta(days=d), "views": v,
                                                             "likes": v // 25, "description": ""} for i, (t, d, v) in enumerate(rows)]}
    monkeypatch.setattr(ge, "fetch_feed", feed)
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    c, pid = env["c"], env["pid"]
    cid = "UC" + "a" * 22
    g = done(c, run(c, pid, "071", {"channel": f"https://www.youtube.com/channel/{cid}"}))
    r = g["result"]
    assert r["kind"] == "channel" and r["stats"]["videos"] == 7 and r["findings"] and r["actions"]
    assert any("Goa food tour" in f["finding"] for f in r["findings"])          # top video named, with its numbers
    assert all(f["evidence"] for f in r["findings"]) and g["est_cost_usd"] in (0, None)
    g = done(c, run(c, pid, "080", {"channel": cid, "goal": "100k subscribers"}))
    assert "100k subscribers" in g["result"]["summary"]
    g = done(c, run(c, pid, "073", {"channels": f"{cid}\nUC{'b' * 22}"}))
    assert len(g["result"]["rows"]) == 2 and g["result"]["rows"][0]["views_per_day"]
    bad = run(c, pid, "071", {"channel": "@somehandle"})
    drain()
    assert "/channel/UC" in c.get(f"/api/v1/generations/{bad['id']}").json()["error"]


def test_ask_the_video_from_transcript(env, monkeypatch):
    from app.tools import local_more, providers, registry
    segs = [{"start": 0.0, "end": 4.0, "text": "Welcome to Hyderabad"}, {"start": 75.0, "end": 80.0, "text": "This haleem is 180 rupees"}]
    by = {t["id"]: t for t in env["c"].get("/api/v1/ai/tools").json()["tools"]}
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    assert registry.status(registry.TOOLS["064"])["state"] == "needs_key"
    monkeypatch.setenv("FAL_KEY", "x")
    assert registry.status(registry.TOOLS["064"])["state"] == "ready"           # the hosted video model alone can answer
    monkeypatch.delenv("FAL_KEY")
    monkeypatch.setenv("LLM_BASE_URL", "http://llm:8080")
    monkeypatch.setenv("LLM_LOCAL_TOOLS", "064")
    assert registry.status(registry.TOOLS["064"])["state"] == "ready"
    seen = {}

    def fake_llm(system, user):
        seen["user"] = user
        return {"answer": "180 rupees", "evidence": [{"t": 75, "quote": "This haleem is 180 rupees"}], "confident": True}, "local"
    monkeypatch.setattr(local_more, "_transcript", lambda rc, a, lang=None: {"language": "en", "segments": segs})
    monkeypatch.setattr(providers, "llm_json", fake_llm)
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "064", {"video": env["video"], "question": "How much is the haleem?"}))
    r = g["result"]
    assert r["kind"] == "qa" and r["answer"] == "180 rupees" and r["evidence"][0]["t"] == 75
    assert "[75s] This haleem is 180 rupees" in seen["user"] and "How much is the haleem?" in seen["user"]
    assert g["est_cost_usd"] in (0, None) and by["064"]["engine"] == "local"
    monkeypatch.setattr(local_more, "_transcript", lambda rc, a, lang=None: {"language": "en", "segments": []})
    bad = run(c, pid, "064", {"video": env["video"], "question": "What colour is the shirt?"})
    drain()
    assert "No speech found" in c.get(f"/api/v1/generations/{bad['id']}").json()["error"]
