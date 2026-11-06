"""Stabilize and background removal create new, processed media; originals untouched; render keeps alpha."""
import os
import subprocess

import httpx

from tests.test_editor_flow import drain, new_project, signup, upload

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _shaky():
    p = os.path.join(FIX, "shaky.mp4")
    if not os.path.exists(p):  # a test pattern whose crop window jitters, like hand-held footage
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=800x450:r=30:d=3",
                        "-vf", "crop=640:360:80+40*sin(t*13):45+30*cos(t*11)", "-c:v", "libx264", "-pix_fmt", "yuv420p", p], check=True)
    return p


def _person():
    p = os.path.join(FIX, "person.mp4")
    if not os.path.exists(p):  # a face-like blob on a flat background
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x2878c8:s=640x360:r=10:d=1", "-vf",
                        "drawbox=x=250:y=60:w=140:h=180:color=0xe6be9f:t=fill,drawbox=x=220:y=230:w=200:h=130:color=0xc82828:t=fill",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", p], check=True)
    return p


def test_stabilize_creates_new_ready_asset(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    a = upload(c, p["id"], _shaky(), "video/mp4")
    drain()
    r = c.post(f"/api/v1/media/{a['id']}/derive", json={"op": "stabilize"})
    assert r.status_code == 201, r.text
    nid = r.json()["id"]
    assert r.json()["filename"] == "shaky (stabilized).mp4"
    drain()
    n = c.get(f"/api/v1/media/{nid}").json()
    assert n["status"] == "ready", n
    assert abs(n["duration_s"] - 3) < 0.15 and n["width"] == 640
    assert c.get(f"/api/v1/media/{a['id']}").json()["status"] == "ready"  # original untouched


def test_remove_background_has_alpha_and_renders(make_client):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws, format="landscape_720")
    a = upload(c, p["id"], _person(), "video/mp4")
    drain()
    r = c.post(f"/api/v1/media/{a['id']}/derive", json={"op": "remove_bg"})
    assert r.status_code == 201, r.text
    nid = r.json()["id"]
    drain()
    n = c.get(f"/api/v1/media/{nid}").json()
    assert n["status"] == "ready", n
    assert n["proxy_url"] and ".webm" in n["proxy_url"].split("?")[0]   # alpha preview proxy
    # Put it over a grey background: corners must show grey (background removed), centre shows the subject
    grey = os.path.join(FIX, "grey.mp4")
    if not os.path.exists(grey):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x808080:s=640x360:r=30:d=1",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", grey], check=True)
    g = upload(c, p["id"], grey, "video/mp4")
    drain()
    seq = p["sequences"][0]
    tl = seq["timeline"]
    tr = {t["id"]: t for t in tl["tracks"]}
    tr["v1"]["clips"] = [{"id": "bg", "asset_id": g["id"], "start": 0, "in": 0, "out": 30}]
    tr["v2"]["clips"] = [{"id": "fg", "asset_id": nid, "start": 0, "in": 0, "out": 30}]
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 200
    e = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "match"}).json()
    drain()
    ex = next(x for x in c.get(f"/api/v1/projects/{p['id']}/exports").json() if x["id"] == e["id"])
    assert ex["job"]["status"] == "succeeded", ex["job"]
    out = "/tmp/creator-worker-test/bg.mp4"
    open(out, "wb").write(httpx.get(ex["download_url"]).content)
    def px(x, y):
        b = subprocess.run(["ffmpeg", "-v", "error", "-ss", "0.5", "-i", out, "-frames:v", "1", "-vf", f"crop=6:6:{x}:{y},scale=1:1",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        return tuple(b[:3])
    corner = px(20, 20)
    assert all(abs(v - 128) < 25 for v in corner), corner   # was blue (0x2878c8) before removal
    centre = px(637, 200)
    assert centre[0] > 170, centre                           # skin-tone subject kept


def test_derive_rejects_audio_and_unknown(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    a = upload(c, p["id"], fixtures_media["tone_wav"], "audio/wav")
    drain()
    assert c.post(f"/api/v1/media/{a['id']}/derive", json={"op": "stabilize"}).status_code == 422
    assert c.post(f"/api/v1/media/{a['id']}/derive", json={"op": "explode"}).status_code == 422
