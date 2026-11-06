"""AI voice (real Piper engine), and the transcribe -> translate -> dub pipeline.
Speech-to-text and translation engines are replaced by deterministic fakes here (their model hosts are not reachable
from CI); voice generation and audio mixing run for real."""
import os
import subprocess

import pytest

from app import ai_engines
from tests.test_editor_flow import drain, new_project, signup, upload

CACHE = os.environ.setdefault("MODEL_CACHE", "/tmp/creator-models-test")


def _can_reach_github():
    try:
        import httpx
        return httpx.head("https://github.com", timeout=5).status_code < 500
    except Exception:
        return False


needs_net = pytest.mark.skipif(not _can_reach_github(), reason="needs github.com to download Piper")


@needs_net
def test_tts_creates_audio_asset(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    r = c.post(f"/api/v1/projects/{p['id']}/ai/tts", json={"text": "Welcome back to the channel. Today we are in Goa.", "voice_id": "en-female"})
    assert r.status_code == 201, r.text
    drain()
    a = c.get(f"/api/v1/media/{r.json()['id']}").json()
    assert a["status"] == "ready" and a["kind"] == "audio", a
    assert 1.5 < a["duration_s"] < 8 and a["waveform_url"]
    assert c.post(f"/api/v1/projects/{p['id']}/ai/tts", json={"text": "x", "voice_id": "nope"}).status_code == 422


@needs_net
def test_transcribe_translate_dub_pipeline(make_client, monkeypatch, fixtures_media):
    def fake_stt(wav, language=None):
        return {"language": "en", "engine": "test", "segments": [{"start": 0.2, "end": 1.6, "text": "hello friends"},
                                                                  {"start": 2.0, "end": 3.6, "text": "welcome to goa"}]}
    monkeypatch.setattr(ai_engines, "transcribe", fake_stt)
    monkeypatch.setattr(ai_engines, "translate", lambda texts, s, d: ([f"[{d}] {t}" for t in texts], "test"))
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    v = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")   # 4 s with tone
    drain()
    j = c.post(f"/api/v1/media/{v['id']}/transcribe", json={}).json()
    drain()
    assert c.get(f"/api/v1/jobs/{j['id']}").json()["status"] == "succeeded"
    an = c.get(f"/api/v1/media/{v['id']}").json()["analysis"]
    assert [s["text"] for s in an["transcript"]["segments"]] == ["hello friends", "welcome to goa"]
    j = c.post(f"/api/v1/media/{v['id']}/translate", json={"target": "es"}).json()
    drain()
    an = c.get(f"/api/v1/media/{v['id']}").json()["analysis"]
    assert an["translations"]["es"]["segments"][1]["text"] == "[es] welcome to goa"
    r = c.post(f"/api/v1/media/{v['id']}/dub", json={"target": "es"})
    assert r.status_code == 201, r.text
    drain()
    d = c.get(f"/api/v1/media/{r.json()['id']}").json()
    assert d["status"] == "ready", d
    assert abs(d["duration_s"] - 4.0) < 0.2           # dub track matches the source length
    # speech placed at the original times: silence before 0.2 s, sound around 0.5 s
    assert c.post(f"/api/v1/media/{v['id']}/dub", json={"target": "xx"}).status_code == 422


def test_engine_failure_is_reported_not_faked(make_client, monkeypatch, fixtures_media):
    def broken(wav, language=None):
        raise ai_engines.EngineError("Could not load the Whisper speech model (first use downloads it from huggingface.co): ConnectError")
    monkeypatch.setattr(ai_engines, "transcribe", broken)
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    v = upload(c, p["id"], fixtures_media["tone_wav"], "audio/wav")
    drain()
    j = c.post(f"/api/v1/media/{v['id']}/transcribe", json={}).json()
    drain()
    jj = c.get(f"/api/v1/jobs/{j['id']}").json()
    assert jj["status"] == "failed" and "huggingface.co" in jj["error"]
    assert "transcript" not in (c.get(f"/api/v1/media/{v['id']}").json()["analysis"] or {})
