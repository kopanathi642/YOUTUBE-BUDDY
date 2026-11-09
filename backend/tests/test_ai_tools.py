"""AI Creation Universe: 120-tool registry, local engines end-to-end, hosted engines against a fake provider server,
versions, Edit in Timeline, workflows with approval, honest key gating and tenant isolation."""
import base64
import io
import json
import os
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from tests.test_editor_flow import drain, new_project, signup, upload

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _media(name, args):
    p = os.path.join(FIX, name)
    if not os.path.exists(p):
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, p], check=True)
    return p


@pytest.fixture(scope="module")
def clip():
    # 6 s: three visually different shots + speech-like bursts with pauses (for scenes, silences, highlights)
    return _media("tools_clip.mp4", [
        "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2", "-f", "lavfi", "-i", "smptebars=s=640x360:r=30:d=2",
        "-f", "lavfi", "-i", "mandelbrot=s=640x360:r=30", "-f", "lavfi", "-i", "sine=f=300:d=6",
        "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,trim=duration=6[v];[3:a]volume='if(between(t,1.6,2.8),0,1)':eval=frame[a]",
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"])


@pytest.fixture(scope="module")
def photo():
    return _media("tools_photo.png", ["-f", "lavfi", "-i", "color=c=0x2878c8:s=640x360:d=1", "-vf",
                                      "drawbox=x=260:y=80:w=120:h=160:color=0xe6be9f:t=fill", "-frames:v", "1"])


@pytest.fixture(scope="module")
def music():
    return _media("tools_beat.wav", ["-f", "lavfi", "-i", "sine=f=60:d=8:sample_rate=22050", "-af",
                                     "volume='if(lt(mod(t,0.5),0.06),1,0.02)':eval=frame"])


def run(c, pid, tid, params, model=None, expect=201, parent=None):
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/{tid}/run", json={"params": params, "model": model, "parent_id": parent})
    assert r.status_code == expect, r.text
    return r.json()


def done(c, g):
    drain()
    out = c.get(f"/api/v1/generations/{g['id']}").json()
    assert out["status"] == "succeeded", (out["tool_name"], out["error"], out["job"])
    return out


@pytest.fixture(scope="module")
def env(clip, photo, music):
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    c.headers["x-requested-with"] = "creator-universe"
    me = signup(c)
    ws = me["workspaces"][0]["id"]
    p = new_project(c, ws)
    ids = {k: upload(c, p["id"], path, ct)["id"] for k, path, ct in
           [("video", clip, "video/mp4"), ("image", photo, "image/png"), ("music", music, "audio/wav")]}
    drain()
    return {"c": c, "ws": ws, "pid": p["id"], **ids}


# ---------------------------------------------------------------- registry


def test_registry_has_exactly_120_tools_in_12_studios(env):
    c = env["c"]
    cat = c.get("/api/v1/ai/tools").json()
    assert len(cat["tools"]) == 120 and len(cat["studios"]) == 12
    assert [t["id"] for t in cat["tools"]] == [f"{i:03d}" for i in range(1, 121)]
    for s in cat["studios"]:
        assert sum(1 for t in cat["tools"] if t["studio"] == s["id"]) == 10
    assert len({t["slug"] for t in cat["tools"]}) == 120
    # every non-ready tool says exactly what it needs; nothing is silently hidden
    for t in cat["tools"]:
        st = t["status"]
        assert st["state"] in ("ready", "needs_key", "unbuilt")
        if st["state"] == "needs_key":
            assert st["needs"]
        assert t["params"] is not None and t["ui"]
    assert cat["counts"]["unbuilt"] == 1


def test_hosted_tool_without_key_is_refused_not_faked(env, monkeypatch):
    monkeypatch.delenv("FAL_KEY", raising=False)
    r = env["c"].post(f"/api/v1/projects/{env['pid']}/ai/tools/001/run", json={"params": {"prompt": "a cat"}})
    assert r.status_code == 409 and "FAL_KEY" in r.text
    r = env["c"].post(f"/api/v1/projects/{env['pid']}/ai/tools/117/run", json={"params": {}})
    assert r.status_code == 409


def test_param_validation(env):
    c, pid = env["c"], env["pid"]
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/086/run", json={"params": {}})
    assert r.status_code == 422 and "required" in r.text
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/086/run", json={"params": {"image": env["music"]}})
    assert r.status_code == 422  # wrong kind
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/086/run", json={"params": {"image": env["image"], "exposure": 9}})
    assert r.status_code == 422  # out of range
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/092/run", json={"params": {"video": env["video"], "format": "7:3"}})
    assert r.status_code == 422


# ---------------------------------------------------------------- local engines (real outputs)


def _asset(c, aid):
    return c.get(f"/api/v1/media/{aid}").json()


def test_image_tools(env):
    from PIL import Image
    c, pid, img = env["c"], env["pid"], env["image"]
    g = done(c, run(c, pid, "086", {"image": img, "exposure": 0.5, "saturation": -1}))
    a = _asset(c, g["outputs"][0]["id"])
    assert a["status"] == "ready" and a["kind"] == "image" and a["analysis"]["generation"]["tool_id"] == "086"
    g = done(c, run(c, pid, "090", {"image": img, "text": "नमस्ते India", "text_position": "bottom"}))
    assert g["outputs"][0]["kind"] == "image"
    # inpaint: erase the skin-coloured box with a painted mask -> that area becomes background blue
    m = Image.new("RGBA", (640, 360), (0, 0, 0, 0))
    m.paste((255, 255, 255, 255), (250, 70, 390, 250))
    buf = io.BytesIO()
    m.save(buf, "PNG")
    mask = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    g = done(c, run(c, pid, "082", {"image": img, "mask": mask}))
    from app import storage
    from app.db import session_factory
    from app.models import MediaAsset
    db = session_factory()()
    a = db.get(MediaAsset, uuid.UUID(g["outputs"][0]["id"]))
    storage.download(a.storage_key, "/tmp/creator-worker-test/inp.png")
    px = Image.open("/tmp/creator-worker-test/inp.png").convert("RGB").getpixel((320, 160))
    assert px[2] > px[0] + 40, px  # blue background, not skin
    db.close()


def test_background_tools(env):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "089", {"image": env["image"], "background": {"type": "gradient", "from": "#000000", "to": "#ffffff"}}))
    assert g["outputs"][0]["kind"] == "image"
    g = done(c, run(c, pid, "081", {"image": env["image"]}))
    assert g["outputs"][0]["kind"] == "image"


def test_video_transform_tools(env):
    c, pid, v = env["c"], env["pid"], env["video"]
    for tid, extra in [("029", {"denoise": 3}), ("030", {"look": "teal & orange"}), ("028", {"factor": 1, "target_fps": 60}),
                       ("027", {"smoothing": 10})]:
        g = done(c, run(c, pid, tid, {"video": v, **extra}))
        a = _asset(c, g["outputs"][0]["id"])
        assert a["status"] == "ready" and a["kind"] == "video", (tid, a)
        assert abs(a["duration_s"] - 6) < 0.3, (tid, a["duration_s"])
    g = done(c, run(c, pid, "028", {"video": v, "factor": 2, "target_fps": 30}))
    assert abs(_asset(c, g["outputs"][0]["id"])["duration_s"] - 12) < 0.5


def test_animation_tools(env):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "039", {"image": env["image"], "move": "pan right", "duration": 3, "aspect_ratio": "9:16"}))
    a = _asset(c, g["outputs"][0]["id"])
    assert (a["width"], a["height"]) == (1080, 1920) and abs(a["duration_s"] - 3) < 0.2
    g = done(c, run(c, pid, "038", {"text": "नमस्ते दोस्तों welcome back", "words_per_second": 4}))
    a = _asset(c, g["outputs"][0]["id"])
    assert a["kind"] == "video" and a["duration_s"] > 0.8


def test_audio_tools(env):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "048", {"audio": env["video"], "target": -14}))
    assert abs(g["result"]["after_lufs"] - (-14)) < 1.5, g["result"]
    g = done(c, run(c, pid, "049", {"audio": env["video"], "min_silence": 0.5}))
    assert g["result"]["removed_s"] > 0.5
    assert _asset(c, g["outputs"][0]["id"])["duration_s"] < 5.6
    done(c, run(c, pid, "047", {"audio": env["video"]}))
    g = done(c, run(c, pid, "050", {"audio": env["music"]}))
    assert 100 <= g["result"]["bpm"] <= 140, g["result"]["bpm"]  # pulses every 0.5 s = 120 BPM
    assert len(g["result"]["beats"]) >= 10


def test_tts_uses_real_voice(env):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "041", {"text": "Hello from the voice studio."}))
    a = _asset(c, g["outputs"][0]["id"])
    assert a["kind"] == "audio" and a["duration_s"] > 1 and a["analysis"]["ai_generated"] is True


def test_intelligence_reports(env):
    c, pid, v = env["c"], env["pid"], env["video"]
    r = done(c, run(c, pid, "061", {"video": v}))["result"]
    assert r["summary"]["count"] >= 2 and r["scenes"][0]["thumb"].startswith("data:image/jpeg")
    r = done(c, run(c, pid, "065", {"video": v, "count": 1, "length": 5}))["result"]
    assert len(r["highlights"]) == 1 and r["curve"]
    r = done(c, run(c, pid, "066", {"video": v}))["result"]
    assert "flags" in r and "not your real" in r["note"]
    r = done(c, run(c, pid, "067", {"video": v}))["result"]
    assert r["integrated_lufs"] is not None and len(r["checks"]) == 5
    r = done(c, run(c, pid, "068", {"video": v}))["result"]
    assert r["summary"]["scenes"] >= 2
    done(c, run(c, pid, "063", {"video": v}))
    done(c, run(c, pid, "097", {"video": v}))
    done(c, run(c, pid, "098", {"video": v}))
    g = done(c, run(c, pid, "077", {"images": [env["image"], g2 := _another_image(c, pid, env["image"])]}))
    assert len(g["result"]["rows"]) == 2 and all("score" in r for r in g["result"]["rows"])
    _ = g2


def _another_image(c, pid, img):
    g = done(c, run(c, pid, "086", {"image": img, "contrast": 0.8}))
    drain()
    return g["outputs"][0]["id"]


def test_video_intelligence_makes_sequences(env):
    c, pid, v = env["c"], env["pid"], env["video"]
    before = len(c.get(f"/api/v1/projects/{pid}").json().get("sequences", []))
    for tid, extra in [("091", {}), ("092", {"format": "9:16"}), ("093", {"min_silence": 0.5}), ("094", {"count": 1, "length": 10}),
                       ("096", {"every": 3, "zoom": 1.2}), ("099", {"formats": ["1:1", "4:5"]}), ("100", {})]:
        g = done(c, run(c, pid, tid, {"video": v, **extra}))
        assert g["result"]["sequence_ids"], tid
        s = c.get(f"/api/v1/sequences/{g['result']['sequence_ids'][0]}").json()
        assert any(t["clips"] for t in s["timeline"]["tracks"]), tid
    after = len(c.get(f"/api/v1/projects/{pid}").json().get("sequences", []))
    assert after >= before + 8


def test_subtitle_sync(env):
    c, pid = env["c"], env["pid"]
    srt = "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,500\nWorld\n"
    r = done(c, run(c, pid, "110", {"srt": srt, "offset": 0.5}))["result"]
    assert "00:00:01,500 --> 00:00:02,500" in r["srt"]


# ---------------------------------------------------------------- versions + Edit in Timeline


def test_versions_and_edit_in_timeline(env):
    c, pid = env["c"], env["pid"]
    g1 = done(c, run(c, pid, "039", {"image": env["image"], "duration": 2}))
    g2 = done(c, run(c, pid, "039", {"image": env["image"], "duration": 3, "move": "pull out"}, parent=g1["id"]))
    assert g2["version"] == 2 and g2["root_id"] == g1["id"]
    assert [v["version"] for v in g2["versions"]] == [1, 2]
    drain()
    r = c.post(f"/api/v1/generations/{g2['id']}/timeline", json={})
    assert r.status_code == 200, r.text
    s = c.get(f"/api/v1/sequences/{r.json()['sequence_id']}").json()
    v1 = next(t for t in s["timeline"]["tracks"] if t["id"] == "v1")
    assert any(cl["asset_id"] == g2["outputs"][0]["id"] for cl in v1["clips"])
    # music goes to the music track
    a = _asset(c, g2["outputs"][0]["id"])
    assert a["analysis"]["generation"]["version"] == 2 and a["analysis"]["generation"]["params"]["move"] == "pull out"


# ---------------------------------------------------------------- workflows


def test_workflow_with_approval_gate(env):
    c, pid, v = env["c"], env["pid"], env["video"]
    graph = {"nodes": [{"id": "in", "tool_id": "input", "params": {}}, {"id": "g", "tool_id": "030", "params": {"look": "warm"}},
                       {"id": "ok", "tool_id": "approval", "params": {}}, {"id": "s", "tool_id": "092", "params": {"format": "1:1"}}],
             "edges": [{"from": "in", "to": "g", "input": "video"}, {"from": "g", "to": "ok", "input": "video"}, {"from": "ok", "to": "s", "input": "video"}]}
    g = run(c, pid, "118", {"graph": graph, "video": v})
    drain()
    st = c.get(f"/api/v1/generations/{g['id']}").json()
    assert st["status"] == "awaiting_approval" and st["result"]["state"]["waiting"] == "ok"
    graded = st["result"]["state"]["results"]["g"]["assets"][0]
    assert _asset(c, graded)["status"] == "ready"
    r = c.post(f"/api/v1/generations/{g['id']}/approve", json={"node_id": "ok"})
    assert r.status_code == 200, r.text
    fin = done(c, g)
    assert fin["result"]["sequence_ids"]
    s = c.get(f"/api/v1/sequences/{fin['result']['sequence_ids'][0]}").json()
    assert s["timeline"]["width"] == 1080 and s["timeline"]["height"] == 1080
    assert s["timeline"]["tracks"][3]["clips"][0]["asset_id"] == graded  # the approved graded clip was used


def test_tool_modules_import_in_any_order():
    """The API imports pipelines first (graph validation); the worker imports engines first. Both must work."""
    import subprocess
    import sys
    for first in ("app.tools.pipelines", "app.tools.engines", "app.tools.local", "app.routers.tools"):
        r = subprocess.run([sys.executable, "-c", f"import {first}; from app.tools import engines; engines.LOCAL; engines.PIPES"],
                           capture_output=True, text=True, cwd=os.path.join(os.path.dirname(__file__), ".."))
        assert r.returncode == 0, (first, r.stderr[-400:])


def test_workflow_node_checks_input_kind(env):
    c, pid = env["c"], env["pid"]
    graph = {"nodes": [{"id": "in", "tool_id": "input", "params": {}}, {"id": "g", "tool_id": "030", "params": {}}],
             "edges": [{"from": "in", "to": "g", "input": "video"}]}
    g = run(c, pid, "111", {"graph": graph, "video": env["music"]})
    drain()
    st = c.get(f"/api/v1/generations/{g['id']}").json()
    assert st["status"] == "failed" and "needs video" in st["error"], st["error"]


def test_workflow_rejects_loops(env):
    c, pid = env["c"], env["pid"]
    graph = {"nodes": [{"id": "a", "tool_id": "030", "params": {}}, {"id": "b", "tool_id": "029", "params": {}}],
             "edges": [{"from": "a", "to": "b", "input": "video"}, {"from": "b", "to": "a", "input": "video"}]}
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/111/run", json={"params": {"graph": graph}})
    assert r.status_code == 422 and "loop" in r.text


def test_batch_and_templates(env):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "116", {"tool": "086", "items": [env["image"]], "tool_params": {"warmth": 0.5}}))
    assert len(g["result"]["items"]) == 1
    t = done(c, run(c, pid, "120", {}))
    assert len(t["result"]["templates"]) >= 6


# ---------------------------------------------------------------- hosted engines against a fake provider


class Fake(BaseHTTPRequestHandler):
    calls: list = []
    files: dict = {}

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
        base = f"http://127.0.0.1:{self.server.server_port}"
        if self.path == "/v1/messages":  # Anthropic
            Fake.calls.append(("llm", self.headers.get("x-api-key"), body))
            sysp = body["system"]
            if "Director Agent" in sysp:
                out = {"summary": "grade then reframe", "nodes": [{"id": "a", "tool_id": "030", "params": {}}, {"id": "b", "tool_id": "999", "params": {}},
                                                                   {"id": "c", "tool_id": "092", "params": {"format": "9:16"}}],
                       "edges": [{"from": "a", "to": "c", "input": "video"}, {"from": "a", "to": "b", "input": "video"}], "est_cost_usd": 0}
            else:
                out = {"title": "Chai Story", "logline": "x", "scenes": [{"heading": "Open", "narration": "Hi", "visuals": "tea", "on_screen_text": "", "duration_s": 5}], "cta": "Subscribe"}
            return self._json({"content": [{"type": "text", "text": "```json\n" + json.dumps(out) + "\n```"}]})
        if self.path == "/v1/chat/completions":  # OpenAI-compatible (also a self-hosted llama.cpp server at LLM_BASE_URL)
            Fake.calls.append(("llm-openai", self.headers.get("authorization"), body))
            out = {"title": "Chai Story", "logline": "x", "scenes": [{"heading": "Open", "narration": "Hi", "visuals": "tea", "on_screen_text": "", "duration_s": 5}], "cta": "Subscribe"}
            return self._json({"choices": [{"message": {"content": json.dumps(out)}}]})
        auth = self.headers.get("authorization")
        Fake.calls.append(("fal", self.path.lstrip("/"), auth, body))
        rid = uuid.uuid4().hex
        Fake.files[rid] = self.path.lstrip("/")
        return self._json({"request_id": rid, "status_url": f"{base}/r/{rid}/status", "response_url": f"{base}/r/{rid}", "cancel_url": f"{base}/r/{rid}/cancel"})

    def do_GET(self):
        base = f"http://127.0.0.1:{self.server.server_port}"
        path = self.path.split("?")[0]
        if path.startswith("/videos"):  # YouTube trends
            return self._json({"items": [{"id": "abc", "snippet": {"title": "Trend 1", "channelTitle": "Ch"}, "statistics": {"viewCount": "1234"}}]})
        if path.startswith("/r/") and path.endswith("/status"):
            return self._json({"status": "COMPLETED"})
        if path.startswith("/r/"):
            model = Fake.files[path.split("/")[2]]
            if "music" in model:
                return self._json({"audio": {"url": f"{base}/f/a.wav", "content_type": "audio/wav"}})
            if any(k in model for k in ("nano-banana", "flux", "gpt-image")):
                return self._json({"images": [{"url": f"{base}/f/i.png", "content_type": "image/png"}]})
            return self._json({"video": {"url": f"{base}/f/v.mp4", "content_type": "video/mp4"}})
        if path.startswith("/f/"):
            p = {"/f/v.mp4": os.path.join(FIX, "landscape_h264_aac.mp4"), "/f/i.png": os.path.join(FIX, "tools_photo.png"),
                 "/f/a.wav": os.path.join(FIX, "tone.wav")}[path]
            data = open(p, "rb").read()
            self.send_response(200)
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._json({"detail": "nope"}, 404)


@pytest.fixture
def fake_provider(monkeypatch):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}"
    for k, v in {"FAL_KEY": "test-fal-key", "FAL_QUEUE_URL": base, "ANTHROPIC_API_KEY": "test-llm-key", "ANTHROPIC_BASE_URL": base,
                 "YOUTUBE_API_KEY": "test-yt", "YOUTUBE_API_URL": base}.items():
        monkeypatch.setenv(k, v)
    Fake.calls.clear()
    yield Fake
    srv.shutdown()


def test_text_to_video_directs_camera_and_labels_output(env, fake_provider):
    c, pid = env["c"], env["pid"]
    g = run(c, pid, "001", {"prompt": "a chai stall at dawn", "camera_move": "push in", "lens": "85mm", "lighting": "golden hour",
                            "duration": 8, "aspect_ratio": "9:16"}, model="fal-ai/veo3.1")
    assert g["est_cost_usd"] == 3.2
    g = done(c, g)
    _, model, auth, body = [x for x in fake_provider.calls if x[0] == "fal"][-1]
    assert model == "fal-ai/veo3.1" and auth == "Key test-fal-key"
    assert "slow dolly push-in" in body["prompt"] and "85mm lens" in body["prompt"] and "golden hour" in body["prompt"]
    assert body["duration"] == "8s" and body["aspect_ratio"] == "9:16"
    a = _asset(c, g["outputs"][0]["id"])
    assert a["status"] == "ready" and a["analysis"]["ai_generated"] is True and a["analysis"]["generation"]["model"] == "fal-ai/veo3.1"
    # provenance label embedded in the file
    from app import storage
    from app.db import session_factory
    from app.models import MediaAsset
    db = session_factory()()
    m = db.get(MediaAsset, uuid.UUID(a["id"]))
    storage.download(m.storage_key, "/tmp/creator-worker-test/lab.mp4")
    db.close()
    tags = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_format", "-of", "json", "/tmp/creator-worker-test/lab.mp4"],
                                     capture_output=True, text=True).stdout)["format"]["tags"]
    assert "AI-generated" in tags.get("comment", "")


def test_image_and_music_and_film_builder(env, fake_provider):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "011", {"prompt": "temple at night", "style": "anime", "palette": "neon night", "variations": 2}, model="fal-ai/flux-2-pro"))
    assert len(g["outputs"]) == 2
    body = [x for x in fake_provider.calls if x[0] == "fal"][-1][3]
    assert "anime" in body["prompt"] and "#ff2a6d" in body["prompt"] and body["image_size"] == "landscape_16_9"
    g = done(c, run(c, pid, "042", {"prompt": "lofi", "bpm": 90, "instruments": ["tabla", "piano"], "duration": 30}))
    body = [x for x in fake_provider.calls if x[0] == "fal"][-1][3]
    assert "90 BPM" in body["prompt"] and "tabla" in body["prompt"] and body["music_length_ms"] == 30000
    r = c.post(f"/api/v1/generations/{g['id']}/timeline", json={})
    assert r.status_code == 200, r.text
    s = c.get(f"/api/v1/sequences/{r.json()['sequence_id']}").json()
    assert any(cl["asset_id"] == g["outputs"][0]["id"] for t in s["timeline"]["tracks"] if t["id"] == "a2" for cl in t["clips"])
    shots = [{"prompt": "wide city", "camera_move": "crane up", "duration": 5}, {"prompt": "close face", "camera_move": "push in", "duration": 5}]
    g = done(c, run(c, pid, "005", {"shots": shots}, model="fal-ai/kling-video/v3/pro/text-to-video"))
    film = [o for o in g["outputs"] if o["filename"].startswith("Film")]
    assert film and len(g["outputs"]) == 3
    assert abs(_asset(c, film[0]["id"])["duration_s"] - 8) < 0.6  # two 4 s fixture clips stitched


def test_thumbnail_pipeline_typesets_headline(env, fake_provider):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "012", {"prompt": "student with books", "headline": "पढ़ाई का राज़", "text_position": "right"}))
    a = _asset(c, g["outputs"][0]["id"])
    assert (a["width"], a["height"]) == (1280, 720)


def test_llm_and_director_and_youtube(env, fake_provider):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "051", {"brief": "chai business", "language": "hi"}))
    assert g["result"]["title"] == "Chai Story" and g["result"]["scenes"]
    sysp = [x for x in fake_provider.calls if x[0] == "llm"][-1][2]["system"]
    assert "Hindi" in sysp
    g = done(c, run(c, pid, "119", {"brief": "make a vertical version"}))
    tids = [n["tool_id"] for n in g["result"]["graph"]["nodes"]]
    assert tids == ["030", "092"]  # the hallucinated tool 999 and its edge were dropped
    g = done(c, run(c, pid, "075", {"region": "IN"}))
    assert g["result"]["rows"][0]["views"] == 1234


def test_generation_isolated_between_workspaces(env, make_client):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "086", {"image": env["image"]}))
    other = make_client()
    signup(other)
    assert other.get(f"/api/v1/generations/{g['id']}").status_code in (403, 404)
    assert other.post(f"/api/v1/generations/{g['id']}/timeline", json={}).status_code in (403, 404)
    assert other.post(f"/api/v1/projects/{pid}/ai/tools/086/run", json={"params": {"image": env["image"]}}).status_code in (403, 404)
    me2 = other.get("/api/v1/auth/me").json()
    p2 = new_project(other, me2["workspaces"][0]["id"])
    r = other.post(f"/api/v1/projects/{p2['id']}/ai/tools/086/run", json={"params": {"image": env["image"]}})
    assert r.status_code == 404  # cannot use another workspace's file as input


def test_public_studios_needs_no_login_and_counts_honestly(make_client, monkeypatch):
    for k in ("FAL_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    client = make_client()  # signed out
    r = client.get("/api/v1/public/studios")
    assert r.status_code == 200
    d = r.json()
    assert len(d["studios"]) == 12 and d["total"] == 120
    assert sum(s["total"] for s in d["studios"]) == 120
    assert 0 < d["live"] < 120  # local tools are live; key-only tools are not
    for s in d["studios"]:
        assert s["live"] == len(s["live_tools"]) <= s["total"]
    monkeypatch.setenv("FAL_KEY", "x")
    assert client.get("/api/v1/public/studios").json()["live"] > d["live"]
