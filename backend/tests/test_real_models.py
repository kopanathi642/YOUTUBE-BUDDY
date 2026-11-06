"""REAL free AI models, end to end — no stand-ins. Runs only with REAL_MODELS=1 (GitHub Actions job `real-models`),
because the build sandbox can't download models. Proves: Piper voice → Whisper captions (round trip) → Argos translation
to Hindi → Hindi Piper voice → full dub of a video through the API, exactly as a user would run it."""
import os
import re
import subprocess

import pytest

from app import ai_engines
from tests.test_editor_flow import drain, new_project, signup, upload

pytestmark = pytest.mark.skipif(os.environ.get("REAL_MODELS") != "1", reason="set REAL_MODELS=1 (needs internet to download free models)")
SENTENCE = "Welcome to our travel vlog. Today we are exploring the beautiful beaches of Goa."
DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def _wav16k(src, dst):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", dst], check=True)
    return dst


def test_piper_voice_then_whisper_transcribes_it_back(tmp_path):
    wav = str(tmp_path / "en.wav")
    dur = ai_engines.tts(SENTENCE, "en-female", wav)
    assert 3 < dur < 15, dur
    t = ai_engines.transcribe(_wav16k(wav, str(tmp_path / "en16.wav")))
    text = " ".join(s["text"] for s in t["segments"]).lower()
    print("WHISPER:", t["engine"], t["language"], text)
    assert t["language"] == "en"
    for w in ("travel", "goa", "beach"):
        assert w in text, (w, text)
    assert t["segments"][0]["start"] < 1.0 and t["segments"][-1]["end"] <= dur + 0.5


def test_argos_translates_english_to_hindi():
    out, engine = ai_engines.translate(["Welcome to our travel vlog.", "Goa has beautiful beaches."], "en", "hi")
    print("ARGOS:", engine, out)
    assert len(out) == 2 and all(DEVANAGARI.search(x) for x in out), out


def test_hindi_voice_speaks_devanagari(tmp_path):
    wav = str(tmp_path / "hi.wav")
    dur = ai_engines.tts("नमस्ते दोस्तों, आज हम गोवा में हैं।", "hi-female", wav)
    print("HINDI TTS seconds:", dur)
    assert 1 < dur < 10


def test_full_dub_of_a_video_through_the_api(make_client, tmp_path):
    # a real "talking" video: colour bars + an English Piper voice track
    wav = str(tmp_path / "talk.wav")
    dur = ai_engines.tts(SENTENCE, "en-male", wav)
    mp4 = str(tmp_path / "talk.mp4")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s=640x360:r=25:d={dur + 0.5:.2f}",
                    "-i", wav, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4], check=True)
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    v = upload(c, p["id"], mp4, "video/mp4")
    drain()
    # captions
    j = c.post(f"/api/v1/media/{v['id']}/transcribe", json={}).json()
    drain()
    assert c.get(f"/api/v1/jobs/{j['id']}").json()["status"] == "succeeded", c.get(f"/api/v1/jobs/{j['id']}").json()
    segs = c.get(f"/api/v1/media/{v['id']}").json()["analysis"]["transcript"]["segments"]
    print("CAPTIONS:", segs)
    assert "goa" in " ".join(s["text"] for s in segs).lower()
    # dub into Hindi with a Hindi voice
    r = c.post(f"/api/v1/media/{v['id']}/dub", json={"target": "hi", "voice_id": "hi-male"})
    assert r.status_code == 201, r.text
    drain()
    d = c.get(f"/api/v1/media/{r.json()['id']}").json()
    print("DUB:", d["filename"], d["status"], d.get("duration_s"), d.get("error"))
    assert d["status"] == "ready", d
    assert d["duration_s"] > 2, d   # the dub track spans the video
    tr = c.get(f"/api/v1/media/{v['id']}").json()["analysis"]["translations"]["hi"]["segments"]
    print("HINDI SUBTITLES:", tr)
    assert any(DEVANAGARI.search(s["text"]) for s in tr)
