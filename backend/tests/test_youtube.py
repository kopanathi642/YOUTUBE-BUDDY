"""YouTube publishing against a fake Google server: OAuth state check, encrypted refresh token, resumable chunked upload."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import get_settings
from tests.test_editor_flow import drain, new_project, signup, upload


class Fake(BaseHTTPRequestHandler):
    received = bytearray()
    meta = {}

    def log_message(self, *a):
        pass

    def _json(self, code, d, headers=None):
        b = json.dumps(d).encode()
        self.send_response(code)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(n)
        u = urlparse(self.path)
        if u.path == "/token":
            f = parse_qs(body.decode())
            if f["grant_type"] == ["authorization_code"]:
                assert f["code"] == ["good-code"]
                return self._json(200, {"access_token": "at1", "refresh_token": "rt-secret"})
            assert f["refresh_token"] == ["rt-secret"]
            return self._json(200, {"access_token": "at2"})
        if u.path == "/revoke":
            return self._json(200, {})
        if u.path == "/upload":
            assert self.headers["authorization"] == "Bearer at2"
            Fake.meta = json.loads(body); Fake.received = bytearray()
            Fake.total = int(self.headers["x-upload-content-length"])
            port = self.server.server_address[1]
            return self._json(200, {}, {"location": f"http://127.0.0.1:{port}/session/1"})

    def do_GET(self):
        if urlparse(self.path).path == "/channels":
            return self._json(200, {"items": [{"id": "UC123", "snippet": {"title": "Bhargav Vlogs"}}]})

    def do_PUT(self):
        n = int(self.headers["content-length"])
        Fake.received += self.rfile.read(n)
        if len(Fake.received) < Fake.total:
            self.send_response(308); self.send_header("range", f"bytes=0-{len(Fake.received) - 1}"); self.send_header("content-length", "0"); self.end_headers()
            return
        self._json(200, {"id": "vid42", "status": {"privacyStatus": Fake.meta["status"]["privacyStatus"]}})


@pytest.fixture
def google(monkeypatch):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    for k, v in {"GOOGLE_TOKEN_URL": "/token", "GOOGLE_REVOKE_URL": "/revoke", "YOUTUBE_API_URL": "", "YOUTUBE_UPLOAD_URL": "/upload"}.items():
        monkeypatch.setenv(k, base + v)
    s = get_settings()
    monkeypatch.setattr(s, "google_oauth_client_id", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(s, "google_oauth_client_secret", "csecret")
    yield base
    srv.shutdown()


def _export(c, fixtures_media):
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws, format="landscape_720")
    a = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")
    drain()
    seq = p["sequences"][0]
    tl = seq["timeline"]
    for t in tl["tracks"]:
        if t["id"] == "v1":
            t["clips"] = [{"id": "c1", "asset_id": a["id"], "start": 0, "in": 0, "out": 30}]
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 200
    e = c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "draft"}).json()
    drain()
    return e


def test_not_configured_says_what_is_missing(make_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "google_oauth_client_id", None)
    c = make_client(); signup(c)
    s = c.get("/api/v1/youtube/status").json()
    assert s["configured"] is False and "GOOGLE_OAUTH_CLIENT_ID" in s["missing"]
    assert c.get("/api/v1/youtube/connect").status_code == 409


def test_connect_publish_disconnect(make_client, google, fixtures_media):
    c = make_client()
    e = _export(c, fixtures_media)
    r = c.get("/api/v1/youtube/connect")
    assert r.status_code == 200
    q = parse_qs(urlparse(r.json()["url"]).query)
    assert "youtube.upload" in q["scope"][0] and q["access_type"] == ["offline"]
    # wrong state is refused (CSRF)
    r2 = c.get("/api/v1/youtube/callback", params={"code": "good-code", "state": "forged"}, follow_redirects=False)
    assert r2.headers["location"].endswith("youtube=bad_state")
    c.cookies.set("yt_oauth_state", r.cookies.get("yt_oauth_state"), path="/api/v1/youtube")
    r3 = c.get("/api/v1/youtube/callback", params={"code": "good-code", "state": q["state"][0]}, follow_redirects=False)
    assert r3.headers["location"].endswith("youtube=connected"), r3.headers["location"]
    s = c.get("/api/v1/youtube/status").json()
    assert s["connected"] and s["channel_title"] == "Bhargav Vlogs"

    from app.db import session_factory
    from app.models import YouTubeConnection
    with session_factory()() as db:
        rows = db.query(YouTubeConnection).filter(YouTubeConnection.channel_id == "UC123").all()
        assert rows and all("rt-secret" not in r.refresh_token_enc for r in rows)   # encrypted at rest

    bad = c.post(f"/api/v1/exports/{e['id']}/youtube", json={"title": "<script>", "privacy": "private"})
    assert bad.status_code == 422
    j = c.post(f"/api/v1/exports/{e['id']}/youtube", json={"title": "My first upload", "description": "Made in YouTube Buddy X",
                                                           "tags": ["vlog", "goa"], "privacy": "unlisted", "ai_altered": True})
    assert j.status_code == 201, j.text
    drain()
    hist = c.get(f"/api/v1/exports/{e['id']}/youtube").json()
    assert hist[0]["status"] == "succeeded", hist[0]
    assert hist[0]["result"]["url"] == "https://youtu.be/vid42" and hist[0]["result"]["privacy"] == "unlisted"
    assert Fake.meta["snippet"]["tags"] == ["vlog", "goa"] and Fake.meta["status"]["containsSyntheticMedia"] is True
    assert len(Fake.received) == Fake.total > 1000

    assert c.delete("/api/v1/youtube/connection").status_code == 204
    assert c.get("/api/v1/youtube/status").json()["connected"] is False
    assert c.post(f"/api/v1/exports/{e['id']}/youtube", json={"title": "x"}).status_code == 409


def test_resumable_chunks(google, tmp_path, monkeypatch):
    from app import youtube
    p = tmp_path / "v.mp4"; p.write_bytes(b"x" * 2500)
    import builtins   # force 1000-byte chunks so the 308 "resume incomplete" path runs

    class Small:
        def __init__(self, f): self.f = f
        def read(self, n): return self.f.read(1000)
        def seek(self, o): return self.f.seek(o)
        def __enter__(self): return self
        def __exit__(self, *a): self.f.close()
    monkeypatch.setattr(youtube, "open", lambda path, mode: Small(builtins.open(path, mode)), raising=False)
    seen = []
    r = youtube.upload("at2", str(p), {"title": "t"}, seen.append)
    assert r["id"] == "vid42" and bytes(Fake.received) == b"x" * 2500 and len(seen) == 2
