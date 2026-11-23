"""AI Ad Editor, end to end on the CPU worker: real clips + music + the brief from the spec → planned, rendered,
checked ad; then a plain-language revision that reuses the analysis."""
import json
import subprocess

import pytest

from app.tools import ad_editor as ad
from tests.test_ai_tools import done, run
from tests.test_editor_flow import drain, new_project, signup, upload

BRIEF = ("Create a cinematic 30-second advertisement with an emotional hook, professional cuts, synchronized music, "
         "elegant color grading, and a final product reveal.")


def _make(path, args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args, str(path)], check=True)
    return str(path)


@pytest.fixture(scope="module")
def footage(tmp_path_factory):
    d = tmp_path_factory.mktemp("ad")
    enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30"]
    return {
        "lively": _make(d / "lively.mp4", ["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=8", "-f", "lavfi", "-i", "sine=f=220:d=8",
                                           *enc, "-c:a", "aac", "-shortest"]),
        "dark": _make(d / "dark.mp4", ["-f", "lavfi", "-i", "color=c=0x050505:s=1280x720:r=30:d=6", *enc]),
        "blurry": _make(d / "blurry.mp4", ["-f", "lavfi", "-i", "testsrc=s=1280x720:r=30:d=6", "-vf", "boxblur=20:5", *enc]),
        "pattern": _make(d / "pattern.mp4", ["-f", "lavfi", "-i", "mandelbrot=s=1280x720:r=30", "-t", "7", *enc]),
        "product": _make(d / "product.mp4", ["-f", "lavfi", "-i", "color=c=0x2a1a3a:s=1280x720:r=30:d=5", "-vf",
                                             "drawbox=x=520:y=220:w=240:h=280:color=0xf2c14e:t=fill,drawbox=x=560:y=260:w=160:h=40:color=0xffffff:t=fill", *enc]),
        "music": _make(d / "music.wav", ["-f", "lavfi", "-i", "sine=f=70:d=32:sample_rate=22050", "-af",
                                         "volume='if(lt(mod(t,0.5),0.07),1,0.03)':eval=frame"]),
    }


@pytest.fixture(scope="module")
def env(footage):
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    c.headers["x-requested-with"] = "creator-universe"
    me = signup(c)
    p = new_project(c, me["workspaces"][0]["id"])
    ids = {k: upload(c, p["id"], path, "audio/wav" if k == "music" else "video/mp4")["id"] for k, path in footage.items()}
    drain()
    return {"c": c, "pid": p["id"], **ids}


def _probe(c, asset_id):
    a = c.get(f"/api/v1/media/{asset_id}").json()
    return a


def test_brief_is_read_into_settings():
    s = ad.read_brief(BRIEF, {})
    assert s["duration"] == 30 and s["look"] == "elegant warm" and s["reveal"] and s["aspect"] == "16:9"
    assert "30-sec" in s["why"]["duration"] and "elegant" in s["why"]["look"]
    assert ad.read_brief("15 sec vertical reel, energetic", {"look": "natural"})["aspect"] == "9:16"
    assert ad.read_brief("15 sec vertical reel, energetic", {"look": "natural"})["look"] == "natural"   # explicit option wins
    s2, done_ = ad.apply_changes({"duration": 30, "aspect": "16:9", "look": "elegant warm", "pace": "medium"},
                                 "make it faster, 15 seconds, vertical, title: Diwali Sale")
    assert s2 == {"duration": 15, "aspect": "9:16", "look": "elegant warm", "pace": "energetic", "end_title": "Diwali Sale"} and len(done_) == 4


def test_cut_plan_lands_on_beats_and_has_an_arc():
    beats = [i * 0.5 for i in range(80)]
    slots = ad.plan_cuts(30, beats, "medium", 5.4)
    assert [s[0] for s in slots][0] == "hook" and slots[-1][0] == "reveal" and "build" in [s[0] for s in slots]
    assert abs(slots[-1][2] - 30) < 1e-6
    for (_, a, b), (_, c, _) in zip(slots, slots[1:]):
        assert abs(b - c) < 1e-6                                     # no gaps
    for _, a, b in slots[:-1]:
        assert abs(b * 2 - round(b * 2)) < 1e-6 or abs(b - (30 - 5.4)) < 1e-6   # every cut on a beat (or the reveal)


def test_ad_end_to_end_and_revision(env):
    c, pid = env["c"], env["pid"]
    clips = [env["lively"], env["dark"], env["blurry"], env["pattern"]]
    g = done(c, run(c, pid, "121", {"clips": clips, "brief": BRIEF, "music": env["music"], "reveal": env["product"], "end_title": "Golden Hour Tea"}))
    r = g["result"]
    assert r["kind"] == "ad_edit" and r["settings"]["duration"] == 30 and r["settings"]["look"] == "elegant warm"
    assert r["all_checks_ok"], r["checks"]
    assert r["music"]["used"] and 100 <= r["music"]["bpm"] <= 130 and r["music"]["cut_on"] == "music beats"
    secs = [s["section"] for s in r["shots"]]
    assert secs[0] == "hook" and secs[-1] == "reveal" and secs.count("build") >= 3
    assert r["shots"][-1]["clip"].startswith("product") and r["shots"][-1]["reason"] == "Your chosen product/reveal shot"
    assert not r["shots"][0]["clip"].startswith("dark")                      # never open on the black clip
    assert not any(s["clip"].startswith(("dark", "blurry")) for s in r["shots"]), [s["clip"] for s in r["shots"]]   # unusable shots never picked
    assert all(s["reason"] for s in r["shots"])
    vid = next(o for o in g["outputs"] if o["kind"] == "video")
    a = _probe(c, vid["id"])
    assert (a["width"], a["height"]) == (1920, 1080) and abs(a["duration_s"] - 30) < 0.3 and a["has_audio"]
    seq = c.get(f"/api/v1/sequences/{r['sequence_id']}").json()
    tl = seq["timeline"]
    v1 = next(t for t in tl["tracks"] if t["id"] == "v1")["clips"]
    assert len(v1) == len(r["shots"]) and v1[-1].get("keyframes", {}).get("scale")     # push-in on the reveal
    assert any(t["id"] == "v2" and t["clips"] and t["clips"][0]["title"]["text"] == "Golden Hour Tea" for t in tl["tracks"])

    # revision: plain words, no re-analysis, only plan + render redone
    first = {"clips": clips, "brief": BRIEF, "music": env["music"], "reveal": env["product"], "end_title": "Golden Hour Tea"}
    g2 = done(c, run(c, pid, "121", {**first, "previous": g["id"], "changes": "faster, 15 seconds, vertical, cooler"}))
    r2 = g2["result"]
    assert r2["revision_of"] == g["id"] and r2["settings"]["duration"] == 15 and r2["settings"]["aspect"] == "9:16"
    assert r2["settings"]["pace"] == "energetic" and r2["settings"]["look"] == "cool cinematic"
    assert r2["analysis_reused"] == 5 and r2["all_checks_ok"], r2["checks"]
    v2 = _probe(c, next(o for o in g2["outputs"] if o["kind"] == "video")["id"])
    assert (v2["width"], v2["height"]) == (1080, 1920) and abs(v2["duration_s"] - 15) < 0.3


def test_ad_without_music_still_works(env):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "121", {"clips": [env["lively"], env["pattern"]], "brief": "calm 12 second square teaser", "duration": "auto"}))
    r = g["result"]
    assert r["settings"]["aspect"] == "1:1" and r["settings"]["duration"] == 12 and not r["music"]["used"]
    assert "grid" in r["music"]["cut_on"] and r["all_checks_ok"], r["checks"]
    assert any(c.get("warn") and "add music" in c["detail"] for c in r["checks"])


def test_director_renders_a_tutorial_without_a_product_arc(env):
    c, pid = env["c"], env["pid"]
    g = done(c, run(c, pid, "121", {"clips": [env["lively"], env["pattern"]], "music": env["music"],
                                    "brief": "A reflective 12 second tutorial about movement and texture."}))
    result = g["result"]
    assert result["settings"]["genre"] == "Tutorial" and result["settings"]["feeling"] == "Reflective"
    assert result["all_checks_ok"] and result["sections"][-1]["name"] == "Closing"
    output = _probe(c, next(o for o in g["outputs"] if o["kind"] == "video")["id"])
    assert abs(output["duration_s"] - 12) < .3
    tl = c.get(f"/api/v1/sequences/{result['sequence_id']}").json()["timeline"]
    spoken = next(t for t in tl["tracks"] if t["id"] == "v1")["clips"]
    assert all(clip["speed"] == 1 and clip["volume"] == 1 for clip in spoken)
    assert next(t for t in tl["tracks"] if t["id"] == "a2")["clips"][0]["volume"] < .2


def test_director_distinguishes_situation_from_genre():
    from app.tools.story_edit import cutting_strategy
    s = ad.read_brief("A tender wedding toast", {})
    assert (s["genre"], s["feeling"], cutting_strategy(s)) == ("Wedding / event", "Tender", "dialogue")
    s = ad.read_brief("A tense racing film", {"genre": "Documentary / film"})
    assert (s["genre"], s["feeling"], cutting_strategy(s)) == ("Documentary / film", "Tense", "action")
