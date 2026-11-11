"""Canva-style import: a file the browser can already play is usable after the quick first step (probe + thumbnail);
the light proxy, waveform and analysis arrive afterwards in media.enrich. Uploads run in their own 'ingest' lane."""
import os
import time

from app import worker
from tests.test_editor_flow import new_project, signup, upload


def _one(queues):
    return worker.process_one("t", queues)


def test_playable_video_is_ready_after_first_step(make_client, fixtures_media):
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    a = upload(c, p["id"], fixtures_media["landscape_mp4"], "video/mp4")      # 1280x720 H.264 + AAC
    assert not _one(["media", "render"])                                        # the slow AI lane never takes uploads
    t0 = time.time()
    assert _one(["ingest"])                                                     # first step only
    first = time.time() - t0
    got = c.get(f"/api/v1/media/{a['id']}").json()
    assert got["status"] == "ready" and got["thumbnail_url"] and got["proxy_url"] and got["duration_s"] > 3
    assert "original." in got["proxy_url"].split("?")[0]                         # previewing the original, no transcode yet
    assert got["waveform_url"] is None                                         # still to come
    assert not _one(["ingest"])                                                 # follow-up work has its own lane
    assert _one(["enrich"])                                                     # enrich: 720p keeps the original as proxy
    got = c.get(f"/api/v1/media/{a['id']}").json()
    assert got["waveform_url"] and got["analysis"] and "original." in got["proxy_url"].split("?")[0]
    assert first < 15


def test_heavy_or_unplayable_video_gets_a_proxy(make_client, fixtures_media, tmp_path):
    import subprocess
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    p = new_project(c, ws)
    mov = upload(c, p["id"], fixtures_media["silent_mov"], "video/quicktime")   # .mov: not shown directly
    hd = str(tmp_path / "hd.mp4")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=2",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", hd], check=True)
    big = upload(c, p["id"], hd, "video/mp4")
    while _one(["ingest"]) or _one(["enrich"]):
        pass
    m = c.get(f"/api/v1/media/{mov['id']}").json()
    assert m["status"] == "ready" and "/derived/proxy.mp4" in m["proxy_url"]
    b = c.get(f"/api/v1/media/{big['id']}").json()
    assert b["status"] == "ready" and "/derived/proxy.mp4" in b["proxy_url"]   # 1080p original swapped for a 540p proxy
    tenbit = str(tmp_path / "10bit.mp4")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p10le", tenbit], check=True)
    from app import media
    assert not media.browser_playable("10bit.mp4", media.inspect(tenbit, "video"))
    assert media.browser_playable("x.mp4", media.inspect(fixtures_media["landscape_mp4"], "video"))
    webm = str(tmp_path / "v.webm")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=25:d=1",
                    "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "200k", webm], check=True)
    assert media.browser_playable("v.webm", media.inspect(webm, "video"))
    assert not media.browser_playable("x.webm", media.inspect(fixtures_media["portrait_webm"], "video"))   # 4:4:4 VP9
    assert media.browser_playable("logo.png", media.inspect(fixtures_media["logo_png"], "image"))
    assert not media.browser_playable("tone.wav", media.inspect(fixtures_media["tone_wav"], "audio"))
    os.remove(hd)
