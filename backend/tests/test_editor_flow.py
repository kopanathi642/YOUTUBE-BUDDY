"""End-to-end backend tests: real Postgres, real S3 protocol (moto), real FFmpeg."""
import os
import uuid

import httpx
import pytest

from app import worker


def signup(client, email=None):
    email = email or f"u{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/api/v1/auth/signup", json={"email": email, "password": "correct horse battery", "display_name": "Tester"})
    assert r.status_code == 201, r.text
    return r.json()


def new_project(client, ws, **kw):
    r = client.post(f"/api/v1/workspaces/{ws}/projects", json={"name": "Test project", **kw})
    assert r.status_code == 201, r.text
    return r.json()


def drain():
    while worker.process_one("test-worker", ["media", "render"]):
        pass


def upload(client, project_id, path, content_type):
    size = os.path.getsize(path)
    r = client.post(f"/api/v1/projects/{project_id}/media/uploads",
                    json={"filename": os.path.basename(path), "size_bytes": size, "content_type": content_type})
    assert r.status_code == 201, r.text
    init = r.json()
    aid, ps, n = init["asset"]["id"], init["part_size"], init["part_count"]
    urls = client.post(f"/api/v1/media/{aid}/upload/parts", json={"part_numbers": list(range(1, n + 1))}).json()["urls"]
    parts = []
    with open(path, "rb") as f:
        for i in range(1, n + 1):
            resp = httpx.put(urls[str(i)], content=f.read(ps))
            assert resp.status_code == 200
            parts.append({"part_number": i, "etag": resp.headers["etag"]})
    r = client.post(f"/api/v1/media/{aid}/upload/complete", json={"parts": parts})
    assert r.status_code == 200, r.text
    return r.json()


def test_auth_and_csrf(make_client):
    c = make_client()
    me = signup(c)
    assert me["workspaces"][0]["role"] == "owner"
    assert c.get("/api/v1/auth/me").status_code == 200
    raw = make_client()
    raw.headers.pop("x-requested-with")
    raw.cookies = c.cookies
    assert raw.post(f"/api/v1/workspaces/{me['workspaces'][0]['id']}/projects", json={"name": "x"}).status_code == 403
    c.post("/api/v1/auth/logout")
    assert c.get("/api/v1/auth/me").status_code == 401
    bad = make_client().post("/api/v1/auth/login", json={"email": me["user"]["email"], "password": "wrong password!!"})
    assert bad.status_code == 401
    assert make_client().post("/api/v1/auth/login", json={"email": me["user"]["email"],
                                                         "password": "correct horse battery"}).status_code == 200


def test_login_rate_limited(make_client):
    c = make_client()
    codes = [c.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "x" * 12}).status_code for _ in range(12)]
    assert 429 in codes


def test_tenant_isolation(make_client, fixtures_media):
    a, b = make_client(), make_client()
    wa = signup(a)["workspaces"][0]["id"]
    signup(b)
    p = new_project(a, wa)
    asset = upload(a, p["id"], fixtures_media["tone_wav"], "audio/wav")
    seq = p["sequences"][0]
    for path in (f"/api/v1/projects/{p['id']}", f"/api/v1/projects/{p['id']}/media", f"/api/v1/media/{asset['id']}",
                 f"/api/v1/sequences/{seq['id']}", f"/api/v1/workspaces/{wa}/projects", f"/api/v1/jobs/{asset['job']['id']}"):
        assert b.get(path).status_code == 404, path
    assert b.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": seq["timeline"]}).status_code == 404
    assert b.delete(f"/api/v1/media/{asset['id']}").status_code == 404
    assert b.post(f"/api/v1/jobs/{asset['job']['id']}/cancel").status_code == 404


def test_viewer_cannot_edit(make_client):
    owner, viewer = make_client(), make_client()
    signup(owner)
    vme = signup(viewer)
    ws = owner.post("/api/v1/workspaces", json={"name": "Team"}).json()["id"]
    assert owner.post(f"/api/v1/workspaces/{ws}/members", json={"email": vme["user"]["email"], "role": "viewer"}).status_code == 201
    p = new_project(owner, ws)
    assert viewer.get(f"/api/v1/projects/{p['id']}").status_code == 200
    seq = p["sequences"][0]
    assert viewer.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": seq["timeline"]}).status_code == 403
    assert viewer.post(f"/api/v1/workspaces/{ws}/projects", json={"name": "nope"}).status_code == 403


def test_upload_rejects_bad_files(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    r = c.post(f"/api/v1/projects/{p['id']}/media/uploads", json={"filename": "evil.exe", "size_bytes": 10, "content_type": "application/x-msdownload"})
    assert r.status_code == 415
    r = c.post(f"/api/v1/projects/{p['id']}/media/uploads", json={"filename": "../../etc/x.mp4", "size_bytes": 10**13, "content_type": "video/mp4"})
    assert r.status_code == 413
    a = upload(c, p["id"], fixtures_media["fake_mp4"], "video/mp4")  # passes name check, must fail content check
    drain()
    got = c.get(f"/api/v1/media/{a['id']}").json()
    assert got["status"] == "rejected"
    assert got["job"]["status"] == "failed"


def test_resume_lists_uploaded_parts(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    path = fixtures_media["tone_wav"]
    init = c.post(f"/api/v1/projects/{p['id']}/media/uploads",
                  json={"filename": "tone.wav", "size_bytes": os.path.getsize(path), "content_type": "audio/wav"}).json()
    aid = init["asset"]["id"]
    url = c.post(f"/api/v1/media/{aid}/upload/parts", json={"part_numbers": [1]}).json()["urls"]["1"]
    with open(path, "rb") as f:
        httpx.put(url, content=f.read(init["part_size"]))
    parts = c.get(f"/api/v1/media/{aid}/upload/parts").json()["parts"]
    assert [p["part_number"] for p in parts] == [1]


def test_full_edit_and_render(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws, format="landscape", fps=30)
    vid = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")
    port = upload(c, p["id"], fixtures_media["portrait_webm"], "video/webm")
    mov = upload(c, p["id"], fixtures_media["silent_mov"], "video/quicktime")
    wav = upload(c, p["id"], fixtures_media["tone_wav"], "audio/wav")
    png = upload(c, p["id"], fixtures_media["logo_png"], "image/png")
    drain()
    media = {m["id"]: m for m in c.get(f"/api/v1/projects/{p['id']}/media").json()}
    for a in (vid, port, mov, wav, png):
        m = media[a["id"]]
        assert m["status"] == "ready", m
        assert m["proxy_url"]
    assert media[vid["id"]]["width"] == 1280 and abs(media[vid["id"]]["duration_s"] - 4) < 0.1
    assert media[mov["id"]]["has_audio"] is False
    assert media[wav["id"]]["waveform_url"] and media[wav["id"]]["thumbnail_url"] is None
    assert httpx.get(media[vid["id"]]["thumbnail_url"]).status_code == 200

    seq = p["sequences"][0]
    tl = seq["timeline"]
    tracks = {t["id"]: t for t in tl["tracks"]}
    # V1: 3s of landscape (trimmed from 0.5s) then 2s of the silent MOV; V2: logo overlay; A1: tone under all
    tracks["v1"]["clips"] = [
        {"id": "c1", "asset_id": vid["id"], "start": 0, "in": 15, "out": 105, "fade_in": 6},
        {"id": "c2", "asset_id": mov["id"], "start": 90, "in": 0, "out": 60},
    ]
    tracks["v2"]["clips"] = [{"id": "c3", "asset_id": png["id"], "start": 30, "in": 0, "out": 60,
                              "transform": {"x": 600, "y": -350, "scale": 0.25, "rotation": 10, "opacity": 0.8}},
                             {"id": "c5", "asset_id": port["id"], "start": 100, "in": 0, "out": 45}]
    tracks["a1"]["clips"] = [{"id": "c4", "asset_id": wav["id"], "start": 0, "in": 0, "out": 150, "volume": 0.5}]
    r = c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2
    # stale save is refused, never silently overwrites
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 409
    # overlapping clips are refused
    bad = {**tl, "tracks": [{**t, "clips": t["clips"] + ([{"id": "x", "asset_id": vid["id"], "start": 10, "in": 0, "out": 30}]
                                                         if t["id"] == "v1" else [])} for t in tl["tracks"]]}
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 2, "timeline": bad}).status_code == 422

    e = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "720p", "idempotency_key": "k1"})
    assert e.status_code == 201, e.text
    e = e.json()
    again = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "720p", "idempotency_key": "k1"}).json()
    assert again["id"] == e["id"]  # idempotent: no duplicate render
    drain()
    ex = c.get(f"/api/v1/projects/{p['id']}/exports").json()[0]
    assert ex["job"]["status"] == "succeeded", ex["job"]
    v = ex["validation"]
    assert v["ok"], v
    assert v["measured"]["width"] == 1280 and v["measured"]["height"] == 720
    assert abs(v["measured"]["duration_s"] - 5.0) < 0.1
    body = httpx.get(ex["download_url"]).content
    assert len(body) == ex["output_size_bytes"] > 10_000

    # pixels: at t=4.0 the MOV smpte bars are on V1 under the portrait webm on V2 -> not black
    out = "/tmp/creator-worker-test/check.mp4"
    open(out, "wb").write(body)
    import subprocess
    frame = subprocess.run(["ffmpeg", "-v", "error", "-ss", "4.0", "-i", out, "-frames:v", "1", "-f", "rawvideo",
                            "-pix_fmt", "gray", "-s", "32x18", "-"], capture_output=True).stdout
    assert sum(frame) / len(frame) > 40

    # version history + restore
    vers = c.get(f"/api/v1/sequences/{seq['id']}/versions").json()
    assert [x["version"] for x in vers][:2] == [2, 1]
    restored = c.post(f"/api/v1/sequences/{seq['id']}/restore", json={"version": 1}).json()
    assert restored["version"] == 3 and all(not t["clips"] for t in restored["timeline"]["tracks"])


def test_export_validation_and_cancel(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    seq = p["sequences"][0]
    assert c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "match"}).status_code == 422  # empty
    vid = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")
    tl = seq["timeline"]
    tl["tracks"][1]["clips"] = [{"id": "c1", "asset_id": vid["id"], "start": 0, "in": 0, "out": 30}]
    c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl})
    # media still processing -> export refused
    assert c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "match"}).status_code == 422
    drain()
    e = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "draft"}).json()
    cj = c.post(f"/api/v1/jobs/{e['job']['id']}/cancel").json()
    assert cj["status"] == "canceled"
    drain()
    assert c.get(f"/api/v1/jobs/{e['job']['id']}").json()["status"] == "canceled"


def test_crashed_worker_job_is_reclaimed(make_client, fixtures_media):
    """A worker that dies mid-job loses its lease; another worker picks the job up."""
    from datetime import datetime, timedelta, timezone
    from app import jobs
    from app.db import session_factory
    from app.models import Job
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    a = upload(c, p["id"], fixtures_media["tone_wav"], "audio/wav")
    db = session_factory()()
    j = jobs.claim(db, "doomed-worker", ["media"], 60)
    assert j and j.id == uuid.UUID(a["job"]["id"])
    j.lease_until = datetime.now(timezone.utc) - timedelta(seconds=1)  # simulate crash: lease lapses
    db.commit()
    db.close()
    drain()
    got = c.get(f"/api/v1/media/{a['id']}").json()
    assert got["status"] == "ready" and got["job"]["attempts"] == 2


def test_workspace_library_and_exports_are_tenant_scoped(make_client, fixtures_media):
    a, b = make_client(), make_client()
    wa = signup(a)["workspaces"][0]["id"]
    wb = signup(b)["workspaces"][0]["id"]
    p = new_project(a, wa)
    upload(a, p["id"], fixtures_media["tone_wav"], "audio/wav")
    drain()
    lib = a.get(f"/api/v1/workspaces/{wa}/media?kind=audio").json()
    assert len(lib) == 1 and lib[0]["project_name"] == "Test project"
    assert a.get(f"/api/v1/workspaces/{wa}/media?q=nomatch").json() == []
    assert b.get(f"/api/v1/workspaces/{wa}/media").status_code == 404
    assert b.get(f"/api/v1/workspaces/{wa}/exports").status_code == 404
    assert b.get(f"/api/v1/workspaces/{wb}/media").json() == []
