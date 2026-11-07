"""Multilingual dubbing API and worker flow, with stand-in engines (the real models are measured by scripts/eval_dubbing.py)."""
import json
import math
import os
import subprocess
import wave

import httpx
import pytest

from tests.test_editor_flow import drain, new_project, signup, upload

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _talk():
    p = os.path.join(FIX, "talk.mp4")
    if not os.path.exists(p):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=25:d=8", "-f", "lavfi",
                        "-i", "sine=frequency=300:duration=8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", p], check=True)
    return p


SEGS = [  # a Hinglish clip with two people
    {"start": 0.5, "end": 2.0, "text": "नमस्ते दोस्तों", "lang": "hi", "lang_prob": 0.95},
    {"start": 2.4, "end": 4.0, "text": "This part is in English", "lang": "en", "lang_prob": 0.91},
    {"start": 4.5, "end": 6.5, "text": "आज हम गोवा में हैं", "lang": "hi", "lang_prob": 0.97},
]


@pytest.fixture
def engines(monkeypatch):
    from app import ai_engines
    from app.speech import diarize, mt, tts
    calls = {"transcribe": [], "translate": [], "speak": 0}

    def fake_transcribe(wav, language=None):
        calls["transcribe"].append(language)
        segs = [dict(s) for s in SEGS]
        if language:
            for s in segs:
                s["lang"] = language
        langs = {}
        for s in segs:
            langs[s["lang"]] = langs.get(s["lang"], 0) + s["end"] - s["start"]
        return {"language": language or "hi", "language_prob": 0.93, "engine": "fake", "mixed": len(langs) > 1, "languages": langs, "segments": segs}

    def fake_translate(texts, src, dst):
        calls["translate"].append((src, dst, len(texts)))
        return [f"[{src}>{dst}] {t}" for t in texts], "fake"

    def fake_speak(text, voice_id, out_wav, speed=1.0):
        calls["speak"] += 1
        sr, secs = 24000, min(1.2, 0.05 * len(text)) / speed
        with wave.open(out_wav, "wb") as w:
            w.setnchannels(1), w.setsampwidth(2), w.setframerate(sr)
            w.writeframes(b"".join(int(8000 * math.sin(i / 8)).to_bytes(2, "little", signed=True) for i in range(int(sr * secs))))
        return secs

    monkeypatch.setattr(ai_engines, "transcribe", fake_transcribe)
    monkeypatch.setattr(mt, "translate", fake_translate)
    monkeypatch.setattr(tts, "speak", fake_speak)
    monkeypatch.setattr(diarize, "label", lambda audio, segs: ["S1", "S2", "S1"][:len(segs)])
    return calls


def _setup(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    a = upload(c, p["id"], _talk(), "video/mp4")
    drain()
    return c, p, a


def test_languages_lists_only_commercial_voices(make_client):
    c = make_client(); signup(c)
    d = c.get("/api/v1/dub/languages").json()
    targets = {t["code"]: t for t in d["targets"]}
    assert {"hi", "en", "es", "de"} <= set(targets) and len(targets) == 26 and "ja" not in targets and "zh" not in targets
    assert all(v["licence"] in ("Apache-2.0", "CC0", "CC-BY-4.0", "CC-BY-SA-3.0") for t in d["targets"] for v in t["voices"])
    assert {v["engine"] for v in targets["hi"]["voices"]} == {"kokoro"} and len(targets["hi"]["voices"]) == 4
    assert d["pairs"]["hi>es"]["ok"] and "en" in d["pairs"]["hi>es"]["route"]            # pivot through English
    assert "ta" not in {s["code"] for s in d["sources"]} and "bn" in {s["code"] for s in d["sources"]}
    assert "bn" not in targets                                                           # translation yes, licensed voice no


def test_full_dub_flow(make_client, engines):
    c, p, a = _setup(make_client)
    r = c.post(f"/api/v1/media/{a['id']}/dubs", json={"targets": ["en", "es"]})
    assert r.status_code == 201, r.text
    dub = r.json()
    # duplicate protection: the same request while preparing returns the same dub
    assert c.post(f"/api/v1/media/{a['id']}/dubs", json={"targets": ["en", "es"]}).json()["id"] == dub["id"]
    drain()
    d = c.get(f"/api/v1/dubs/{dub['id']}").json()
    assert d["status"] == "ready" and d["detected_language"] == "hi" and d["detection"]["mixed"]
    assert [s["speaker"] for s in d["segments"]] == ["S1", "S2", "S1"] and set(d["speakers"]) == {"S1", "S2"}
    en, es = d["targets"]["en"], d["targets"]["es"]
    # mixed speech: the English line is kept as-is for English, and translated from English (not Hindi) for Spanish
    assert en["segments"][1]["text"] == "This part is in English"
    assert es["segments"][1]["text"].startswith("[en>es]") and es["segments"][0]["text"].startswith("[hi>es]")
    assert en["voices"]["S1"] != en["voices"]["S2"]                                      # different people, different voices

    # transcript edit: version check, then only the edited line is retranslated
    assert c.patch(f"/api/v1/dubs/{dub['id']}", json={"version": 1, "segments": []}).status_code == 409
    before = len(engines["translate"])
    r = c.patch(f"/api/v1/dubs/{dub['id']}", json={"version": d["version"], "speakers": {"S1": {"label": "Asha"}}})
    drain()
    assert len(engines["translate"]) == before                                          # renaming a speaker translates nothing
    r = c.patch(f"/api/v1/dubs/{dub['id']}", json={"version": r.json()["version"], "segments": [{"i": 2, "text": "आज हम मुंबई में हैं"}]})
    assert r.status_code == 200, r.text
    drain()
    d = c.get(f"/api/v1/dubs/{dub['id']}").json()
    assert d["speakers"]["S1"]["label"] == "Asha" and "मुंबई" in d["targets"]["es"]["segments"][2]["text"]

    # translation edit + voice choice, then render both languages
    r = c.patch(f"/api/v1/dubs/{dub['id']}/targets/es", json={"segments": [{"i": 0, "text": "¡Hola amigos!"}], "voices": {"S2": "es-female"}})
    assert r.status_code == 200 and r.json()["targets"]["es"]["voices"]["S2"] == "es-female"
    assert c.patch(f"/api/v1/dubs/{dub['id']}/targets/es", json={"voices": {"S2": "hi-male"}}).status_code == 422
    r = c.post(f"/api/v1/dubs/{dub['id']}/render", json={"languages": ["es", "en"]})
    assert r.status_code == 200, r.text
    # an edit right after asking for the render: the render must use the newest text, not get stuck as "queued"
    c.patch(f"/api/v1/dubs/{dub['id']}/targets/es", json={"segments": [{"i": 0, "text": "¡Hola amigos!"}]})
    c.post(f"/api/v1/dubs/{dub['id']}/render", json={"languages": ["es"]})               # double click: same job, not a second render
    speaks_before = engines["speak"]
    drain()
    d = c.get(f"/api/v1/dubs/{dub['id']}").json()
    for lang in ("es", "en"):
        t = d["targets"][lang]
        assert t["status"] == "done", t
        assert set(t["files"]) == {"mp4", "audio_m4a", "voice_wav", "srt", "vtt"}
        srt = httpx.get(t["files"]["srt"]).text
        assert srt.count("-->") == 3 and (lang != "es" or "¡Hola amigos!" in srt)
        assert httpx.get(t["files"]["vtt"]).text.startswith("WEBVTT")
        mp4 = os.path.join("/tmp/creator-worker-test", f"dub_{lang}.mp4")
        open(mp4, "wb").write(httpx.get(t["files"]["mp4"]).content)
        pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", mp4], capture_output=True, text=True).stdout)
        assert sorted(s["codec_type"] for s in pr["streams"]) == ["audio", "video"] and abs(float(pr["format"]["duration"]) - 8) < 1
        assert t["report"]["lines"] == 3 and t["report"]["cost_inr"] == 0
        assert t["asset_ids"]["mp4_asset"] and t["asset_ids"]["audio_asset"]
    assert engines["speak"] - speaks_before <= 2 * 3 * 2                                # each line voiced at most twice per language
    media = {m["id"]: m for m in c.get(f"/api/v1/projects/{p['id']}/media").json()}
    assert media[d["targets"]["es"]["asset_ids"]["mp4_asset"]]["status"] == "ready"     # dubbed MP4 is in the media bin


def test_source_language_override_and_errors(make_client, engines):
    c, p, a = _setup(make_client)
    assert c.post(f"/api/v1/media/{a['id']}/dubs", json={"targets": ["ta"]}).status_code == 422          # no Tamil voice/translation
    assert c.post(f"/api/v1/media/{a['id']}/dubs", json={"source_language": "ta", "targets": ["hi"]}).status_code == 422
    r = c.post(f"/api/v1/media/{a['id']}/dubs", json={"source_language": "en", "targets": ["hi"]})
    assert r.status_code == 201
    drain()
    assert engines["transcribe"][-1] == "en"
    d = c.get(f"/api/v1/dubs/{r.json()['id']}").json()
    assert d["detected_language"] == "en" and not d["detection"]["mixed"]
    # manual correction re-recognises in the chosen language
    r2 = c.patch(f"/api/v1/dubs/{d['id']}", json={"version": d["version"], "source_language": "hi"})
    assert r2.status_code == 200 and r2.json()["status"] == "preparing"
    drain()
    assert engines["transcribe"][-1] == "hi"
    other = make_client(); signup(other)
    assert other.get(f"/api/v1/dubs/{d['id']}").status_code == 404
    assert c.post(f"/api/v1/dubs/{d['id']}/render", json={"languages": ["fr"]}).status_code == 409    # not added yet
