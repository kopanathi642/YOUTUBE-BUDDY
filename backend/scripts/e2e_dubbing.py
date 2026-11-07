"""End-to-end dubbing through a RUNNING server + worker, the way a user does it (upload → studio → render → download).

    python scripts/e2e_dubbing.py BASE_URL MEDIA.mp4 OUT_DIR [targets=en,es,de]

Uses only the public HTTP API: resumable upload, /media/{id}/dubs, PATCH edits, /render, signed download links.
Every downloaded file is checked (ffprobe streams/duration, SRT/VTT cue counts). Prints a JSON report.
"""
import json
import os
import subprocess
import sys
import time

import httpx

B, MEDIA, OUT = sys.argv[1].rstrip("/") + "/api/v1", sys.argv[2], sys.argv[3]
TARGETS = (sys.argv[4] if len(sys.argv) > 4 else "en,es,de").split(",")
os.makedirs(OUT, exist_ok=True)
c = httpx.Client(base_url=B, headers={"x-requested-with": "creator-universe"}, timeout=120)
rep: dict = {"targets": TARGETS}
t0 = time.time()
c.post("/auth/signup", json={"email": f"dub{int(time.time())}@example.com", "password": "correct horse battery", "display_name": "Dub Tester"})
ws = c.get("/auth/me").json()["workspaces"][0]["id"]
pid = c.post(f"/workspaces/{ws}/projects", json={"name": "E2E dubbing"}).json()["id"]

# resumable upload, exactly like the browser
size = os.path.getsize(MEDIA)
init = c.post(f"/projects/{pid}/media/uploads", json={"filename": os.path.basename(MEDIA), "size_bytes": size, "content_type": "video/mp4"}).json()
aid, n, ps = init["asset"]["id"], init["part_count"], init["part_size"]
urls = c.post(f"/media/{aid}/upload/parts", json={"part_numbers": list(range(1, n + 1))}).json()["urls"]
buf, parts = open(MEDIA, "rb").read(), []
for i in range(1, n + 1):
    r = httpx.put(urls[str(i)], content=buf[(i - 1) * ps:i * ps])
    parts.append({"part_number": i, "etag": r.headers["etag"]})
c.post(f"/media/{aid}/upload/complete", json={"parts": parts})
while (a := c.get(f"/media/{aid}").json())["status"] not in ("ready", "failed", "rejected"):
    time.sleep(2)
rep["upload"] = {"status": a["status"], "duration_s": a["duration_s"], "seconds": round(time.time() - t0)}

t1 = time.time()
d = c.post(f"/media/{aid}/dubs", json={"targets": TARGETS}).json()
while (d := c.get(f"/dubs/{d['id']}").json())["status"] == "preparing" or any(t["status"] == "waiting" for t in d["targets"].values()):
    time.sleep(3)
rep["prepare"] = {"status": d["status"], "error": d["error"], "detected": d["detected_language"], "detection": d["detection"],
                  "segments": len(d["segments"]), "speakers": d["speakers"], "seconds": round(time.time() - t1),
                  "first_lines": [s["text"] for s in d["segments"][:3]]}
print("prepared:", json.dumps(rep["prepare"], ensure_ascii=False)[:600], flush=True)

# edit: rename a speaker, fix a translation line
c.patch(f"/dubs/{d['id']}", json={"version": d["version"], "speakers": {"S1": {"label": "Host"}}})
d = c.get(f"/dubs/{d['id']}").json()
first = TARGETS[0]
c.patch(f"/dubs/{d['id']}/targets/{first}", json={"segments": [{"i": 0, "text": d["targets"][first]["segments"][0]["text"] + " (edited)"}]})

t2 = time.time()
c.post(f"/dubs/{d['id']}/render", json={"languages": TARGETS})
c.post(f"/dubs/{d['id']}/render", json={"languages": TARGETS})          # double click: must not render twice
while any((d := c.get(f"/dubs/{d['id']}").json())["targets"][t]["status"] in ("queued", "rendering", "ready") for t in TARGETS):
    time.sleep(4)
rep["render_seconds_all"] = round(time.time() - t2)


def probe(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", p], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    return sorted(s["codec_type"] for s in j.get("streams", [])), float(j.get("format", {}).get("duration", 0))


rep["languages"] = {}
for t in TARGETS:
    tg = d["targets"][t]
    out = {"status": tg["status"], "error": tg["error"], "report": {k: v for k, v in (tg.get("report") or {}).items() if k != "timings"}, "files": {}}
    for kind, url in tg.get("files", {}).items():
        ext = {"mp4": "mp4", "audio_m4a": "m4a", "voice_wav": "wav", "srt": "srt", "vtt": "vtt"}[kind]
        path = os.path.join(OUT, f"{t}.{ext}")
        resp = httpx.get(url)
        open(path, "wb").write(resp.content)
        info = {"http": resp.status_code, "bytes": len(resp.content)}
        if ext in ("mp4", "m4a", "wav"):
            info["streams"], info["duration"] = probe(path)
        else:
            txt = resp.content.decode("utf-8")
            info["cues"] = txt.count("-->")
            info["first_cue"] = txt.split("\n\n")[0 if ext == "srt" else 1][:200]
        out["files"][kind] = info
    out["edited_line_in_srt"] = t != first or "(edited)" in open(os.path.join(OUT, f"{t}.srt"), encoding="utf-8").read()
    rep["languages"][t] = out
    print(t, json.dumps(out, ensure_ascii=False)[:700], flush=True)
media = c.get(f"/projects/{pid}/media").json()
rep["media_bin"] = sorted((m["filename"], m["status"]) for m in media)
rep["total_seconds"] = round(time.time() - t0)
json.dump(rep, open(os.path.join(OUT, "e2e.json"), "w"), ensure_ascii=False, indent=1)
print("E2E DONE", rep["total_seconds"], "s")
