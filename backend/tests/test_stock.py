"""Stock library: keys stay on the server, search is normalised, import re-looks-up by id and only downloads from the
provider's own media host, then the file is processed like any upload and keeps its attribution."""
import os
import shutil

from app import stock
from tests.test_editor_flow import drain, new_project, signup

FIX = os.path.join(os.path.dirname(__file__), "fixtures")
VIDEO = {"id": 123, "url": "https://www.pexels.com/video/123/", "image": "https://images.pexels.com/v/123.jpg", "duration": 3,
         "width": 1280, "height": 720, "user": {"name": "Asha", "url": "https://www.pexels.com/@asha"},
         "video_files": [{"file_type": "video/mp4", "width": 3840, "height": 2160, "link": "https://videos.pexels.com/4k.mp4"},
                         {"file_type": "video/mp4", "width": 1280, "height": 720, "link": "https://videos.pexels.com/hd.mp4"}]}


def _fake(monkeypatch, video=VIDEO):
    monkeypatch.setenv("PEXELS_API_KEY", "test")
    calls = []

    def get(provider, path, **params):
        calls.append(path)
        return {"videos": [video], "total_results": 1} if path == "/videos/search" else video
    monkeypatch.setattr(stock, "_get", get)
    monkeypatch.setattr(stock, "download", lambda url, dest: shutil.copy(os.path.join(FIX, "landscape_h264_aac.mp4"), dest) and 1)
    return calls


def test_status_and_missing_key(make_client, monkeypatch):
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)
    c = make_client(); signup(c)
    assert c.get("/api/v1/stock/status").json()["pexels"] is False
    r = c.get("/api/v1/stock/search", params={"q": "beach"})
    assert r.status_code == 409 and "API key" in r.json()["detail"]


def test_search_normalises_and_picks_hd(make_client, monkeypatch):
    _fake(monkeypatch)
    c = make_client(); signup(c)
    r = c.get("/api/v1/stock/search", params={"q": "beach", "kind": "video"})
    assert r.status_code == 200, r.text
    it = r.json()["items"][0]
    assert it["download_url"] == "https://videos.pexels.com/hd.mp4"  # 4K skipped: max 1920 wide
    assert it["author"] == "Asha" and "Pexels" in r.json()["attribution"]


def test_import_downloads_processes_and_keeps_attribution(make_client, monkeypatch):
    _fake(monkeypatch)
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    r = c.post(f"/api/v1/projects/{p['id']}/stock/import", json={"provider": "pexels", "kind": "video", "id": "123"})
    assert r.status_code == 201, r.text
    drain()
    a = c.get(f"/api/v1/media/{r.json()['id']}").json()
    assert a["status"] == "ready", a
    assert a["duration_s"] > 0
    assert a["analysis"]["stock"]["author"] == "Asha" and a["analysis"]["stock"]["license"] == "Pexels License"


def test_import_refuses_foreign_host(make_client, monkeypatch):
    bad = {**VIDEO, "video_files": [{"file_type": "video/mp4", "width": 1280, "link": "https://evil.example.com/x.mp4"}]}
    _fake(monkeypatch, bad)
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    r = c.post(f"/api/v1/projects/{p['id']}/stock/import", json={"provider": "pexels", "kind": "video", "id": "123"})
    assert r.status_code == 422 and "download location" in r.json()["detail"]
    r = c.post(f"/api/v1/projects/{p['id']}/stock/import", json={"provider": "pexels", "kind": "video", "id": "../x"})
    assert r.status_code == 422
