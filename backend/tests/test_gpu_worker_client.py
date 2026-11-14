"""End-to-end: the real HP worker client (gpu-worker/worker.py) against the real API served by uvicorn on a local port,
with a fake llama.cpp server standing in for the GPU model. Proves the client and server agree on the protocol."""
import importlib.util
import json
import os
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from tests.test_editor_flow import drain
from tests.test_gpu_workers import REPLY, _job_of, _run_tool, gpu_env  # noqa: F401  (fixture)

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def _load_client():
    spec = importlib.util.spec_from_file_location("yb_gpu_worker", os.path.join(ROOT, "gpu-worker", "worker.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close()
    return p


@pytest.fixture
def live_api():
    import uvicorn
    from app.main import app
    port = _free_port()
    srv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    t = threading.Thread(target=srv.run, daemon=True); t.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    srv.should_exit = True; t.join(5)


class FakeLlama:
    def __init__(self, delay=0.0):
        self.calls, self.delay = [], delay
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
                self.wfile.write(b'{"status":"ok"}')

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                fake.calls.append(body)
                time.sleep(fake.delay)
                out = json.dumps({"choices": [{"message": {"content": REPLY}}]}).encode()
                self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(out))); self.end_headers()
                self.wfile.write(out)
        self.port = _free_port()
        self.srv = ThreadingHTTPServer(("127.0.0.1", self.port), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown()


def _register(env, name):
    r = env["admin"].post("/api/v1/admin/gpu/workers", json={"name": name})
    assert r.status_code == 201
    return r.json()["token"]


def test_real_worker_client_completes_a_queued_job(gpu_env, live_api):
    client = _load_client()
    llama = FakeLlama()
    try:
        g = _run_tool(gpu_env, "Client end-to-end")
        drain()
        assert _job_of(g["id"]).queue == "gpu"
        cfg = {"server_url": live_api, "token": _register(gpu_env, "hp-e2e-1"), "llm_url": f"http://127.0.0.1:{llama.port}"}
        server = client.Server(cfg)
        _, hb = server.call("/heartbeat", {"capabilities": client.capabilities(cfg)})
        assert hb["paused"] is False
        assert client.run_once(cfg, server) is True
        assert client.run_once(cfg, server) is False                 # nothing left: no duplicate work
        sent = llama.calls[0]
        assert sent["response_format"] == {"type": "json_object"} and "Client end-to-end" in sent["messages"][1]["content"]
        drain()
        out = gpu_env["user"].get(f"/api/v1/generations/{g['id']}").json()
        assert out["status"] == "succeeded" and out["result"]["hooks"]
    finally:
        llama.close()


def test_real_worker_client_stops_when_the_user_cancels(gpu_env, live_api):
    client = _load_client()
    llama = FakeLlama(delay=6)                                          # a slow generation
    try:
        g = _run_tool(gpu_env, "Client cancel")
        drain()
        cfg = {"server_url": live_api, "token": _register(gpu_env, "hp-e2e-2"), "llm_url": f"http://127.0.0.1:{llama.port}"}
        server = client.Server(cfg)
        done = {}
        t = threading.Thread(target=lambda: done.setdefault("r", client.run_once(cfg, server)))
        t.start()
        time.sleep(1.0)
        assert gpu_env["user"].post(f"/api/v1/jobs/{g['job']['id']}/cancel").status_code == 200
        t.join(30)
        assert done.get("r") is True
        drain()
        assert gpu_env["user"].get(f"/api/v1/generations/{g['id']}").json()["status"] == "canceled"
    finally:
        llama.close()
