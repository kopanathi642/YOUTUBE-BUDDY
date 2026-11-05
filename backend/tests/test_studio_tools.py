"""Colour grading render, media analysis (scenes/silences/loudness/auto grade), smart reframe, capabilities."""
import os
import subprocess

import httpx

from tests.test_editor_flow import drain, new_project, signup, upload

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _cut_and_gap():
    """2s red then 2s blue (hard cut at 2.0s); tone 0-1.5s, silence 1.5-3.0s, tone 3.0-4.0s."""
    p = os.path.join(FIX, "cut_and_gap.mp4")
    if not os.path.exists(p):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=640x360:r=30:d=2", "-f", "lavfi",
                        "-i", "color=c=blue:s=640x360:r=30:d=2", "-f", "lavfi",
                        "-i", "aevalsrc='0.5*sin(2*PI*440*t)*(lt(t,1.5)+gte(t,3))':s=48000:d=4",
                        "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-map", "2:a",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", p], check=True)
    return p


def _grey():
    p = os.path.join(FIX, "grey.mp4")
    if not os.path.exists(p):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x808080:s=640x360:r=30:d=1",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", p], check=True)
    return p


def test_analysis_detects_scene_cut_silence_and_loudness(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    a = upload(c, p["id"], _cut_and_gap(), "video/mp4")
    drain()
    an = c.get(f"/api/v1/media/{a['id']}").json()["analysis"]
    starts = [round(s["start"], 1) for s in an["scenes"]]
    assert starts[:2] == [0.0, 2.0], an["scenes"]
    sil = an["silences"]
    assert len(sil) == 1 and abs(sil[0]["start"] - 1.5) < 0.15 and abs(sil[0]["end"] - 3.0) < 0.15, sil
    assert an["loudness_lufs"] is not None and an["loudness_lufs"] < -3
    assert an["auto_grade"]["enabled"] is True and "subject_center_x" in an


def test_colour_grade_changes_rendered_pixels(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws, format="landscape")
    a = upload(c, p["id"], _grey(), "video/mp4")
    drain()
    seq = p["sequences"][0]
    tl = seq["timeline"]
    v1 = next(t for t in tl["tracks"] if t["id"] == "v1")
    v1["clips"] = [{"id": "g", "asset_id": a["id"], "start": 0, "in": 0, "out": 30,
                    "color": {"gain": [1.6, 1.0, 0.6], "saturation": 1.0}}]
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 200
    e = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "draft"}).json()
    drain()
    ex = c.get(f"/api/v1/projects/{p['id']}/exports").json()[0]
    assert ex["job"]["status"] == "succeeded", ex["job"]
    out = "/tmp/creator-worker-test/grade.mp4"
    open(out, "wb").write(httpx.get(ex["download_url"]).content)
    px = subprocess.run(["ffmpeg", "-v", "error", "-ss", "0.5", "-i", out, "-frames:v", "1", "-vf", "crop=20:20:300:200,scale=1:1",
                         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    r, g, b = px[0], px[1], px[2]
    assert r > g + 40 and g > b + 25, (r, g, b)   # grey became warm: gain applied in the real render
    assert abs(g - 128) < 15                        # untouched channel stays put


def test_invalid_grade_rejected(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    seq = p["sequences"][0]
    tl = seq["timeline"]
    a = upload(c, p["id"], _grey(), "video/mp4")
    next(t for t in tl["tracks"] if t["id"] == "v1")["clips"] = [
        {"id": "g", "asset_id": a["id"], "start": 0, "in": 0, "out": 10, "color": {"gamma": [0, 1, 1]}}]
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 422


def test_smart_reframe_creates_vertical_sequence(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws, format="landscape")
    a = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")
    drain()
    seq = p["sequences"][0]
    tl = seq["timeline"]
    next(t for t in tl["tracks"] if t["id"] == "v1")["clips"] = [{"id": "c1", "asset_id": a["id"], "start": 0, "in": 0, "out": 60}]
    c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl})
    r = c.post(f"/api/v1/projects/{p['id']}/sequences", json={"name": "Short 9:16", "from_sequence_id": seq["id"],
                                                               "format": "vertical", "reframe": True})
    assert r.status_code == 201, r.text
    v = r.json()["timeline"]
    assert (v["width"], v["height"]) == (1080, 1920)
    clip = next(t for t in v["tracks"] if t["id"] == "v1")["clips"][0]
    assert abs(clip["transform"]["scale"] - (1920 / 720) / (1080 / 1280)) < 0.01  # cover / contain for 1280x720 source
    proj = c.get(f"/api/v1/projects/{p['id']}").json()
    assert len(proj["sequences"]) == 2
    e = c.post(f"/api/v1/sequences/{r.json()['id']}/exports", json={"preset": "draft"}).json()
    drain()
    ex = [x for x in c.get(f"/api/v1/projects/{p['id']}/exports").json() if x["id"] == e["id"]][0]
    assert ex["job"]["status"] == "succeeded" and ex["validation"]["measured"]["height"] > ex["validation"]["measured"]["width"]


def test_capabilities_are_honest(make_client):
    c = make_client()
    signup(c)
    caps = {x["id"]: x for x in c.get("/api/v1/ai/capabilities").json()}
    assert caps["scene_detect"]["ready"] and caps["silence_remove"]["ready"] and caps["auto_color"]["ready"]
    assert not caps["lip_sync"]["ready"] and not caps["dubbing"]["ready"]
