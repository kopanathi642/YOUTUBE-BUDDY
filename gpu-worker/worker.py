"""YouTube Buddy X - GPU worker for the HP laptop. Python standard library only.

It calls OUT to the ASUS server over the private Tailscale network (it never listens on any port), runs AI steps on
this laptop's GPU and sends back only the result. It never sees the database or storage credentials.

Config: gpu-worker/worker.local.toml (never commit it; it holds the worker token):
    server_url = "http://yb-server"            # ASUS name inside your tailnet (tailscale serve, port 80)
    token      = "ybw_..."                     # shown once on the admin page when you register this worker
    llm_url    = "http://127.0.0.1:11434"      # Ollama server on this laptop (ollama serve)
    llm_model  = "qwen3:4b"                    # model name as Ollama knows it; "local" for llama.cpp
    name_hint  = "hp-victus"                   # optional, shown in logs
Run:  python gpu-worker/worker.py            (stop with Ctrl+C; a running job is handed back for another try)
"""
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import tomllib
import urllib.error
import urllib.request

VERSION = "1.0"
HEARTBEAT_S = 15
POLL_S = 3


def log(msg: str) -> None:
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


def load_config(path: str | None = None) -> dict:
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), "worker.local.toml")
    with open(path, "rb") as f:
        cfg = tomllib.load(f)
    for k in ("server_url", "token", "llm_url"):
        if not cfg.get(k):
            raise SystemExit(f"{path}: '{k}' is missing")
    if not cfg["token"].startswith("ybw_"):
        raise SystemExit(f"{path}: token doesn't look like a worker token (ybw_...)")
    cfg["server_url"] = cfg["server_url"].rstrip("/")
    cfg["llm_url"] = cfg["llm_url"].rstrip("/")
    return cfg


class ApiError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status


def _http(method: str, url: str, body: dict | None = None, headers: dict | None = None, timeout: float = 30):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read() or b"{}").get("detail", "")
        except ValueError:
            detail = ""
        raise ApiError(e.code, str(detail)[:300]) from None


class Server:
    def __init__(self, cfg: dict):
        self.base = cfg["server_url"] + "/api/v1/worker"
        self._auth = {"authorization": "Bearer " + cfg["token"]}

    def call(self, path: str, body: dict | None = None, timeout: float = 30):
        return _http("POST", self.base + path, body or {}, self._auth, timeout)


def gpu_info() -> dict:
    """Best effort: GPU name and free VRAM from nvidia-smi (absent = no NVIDIA driver; the LLM may still run on CPU)."""
    if not shutil.which("nvidia-smi"):
        return {"gpu": None}
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=10).stdout.strip().splitlines()[0]
        name, total, used = [x.strip() for x in out.split(",")]
        return {"gpu": name, "vram_total_mb": int(total), "vram_free_mb": int(total) - int(used)}
    except Exception as e:  # noqa: BLE001
        return {"gpu": None, "gpu_error": type(e).__name__}


def llm_ready(cfg: dict) -> bool:
    # Ollama: GET / returns plain text "Ollama is running" with status 200.
    # llama.cpp: GET /health returns {"status":"ok"} with status 200.
    # Accept any 200 on either path — the content is not important.
    for path in ("/", "/health"):
        try:
            status, _body = _http("GET", cfg["llm_url"] + path, timeout=5)
            if status == 200:
                return True
        except Exception:  # noqa: BLE001
            pass
    return False


def capabilities(cfg: dict) -> dict:
    tasks = ["llm"] if llm_ready(cfg) else []
    return {"version": VERSION, "tasks": tasks, "llm_label": cfg.get("llm_label", "Qwen3-4B (GPU worker)"), **gpu_info()}


def run_llm(cfg: dict, task: dict, stop: threading.Event) -> str:
    """Call the local LLM via OpenAI-compatible /v1/chat/completions.

    Works with both Ollama (llm_model = "qwen3:4b", think suppressed via options)
    and llama.cpp (llm_model = "local", chat_template_kwargs for thinking control).
    """
    model = cfg.get("llm_model", "qwen3:4b")
    max_tok = min(int(task["max_tokens"]), int(cfg.get("max_tokens", 2500)))
    body = {
        "model": model,
        "max_tokens": max_tok,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
        # Ollama: suppress chain-of-thought via options (think key ignored on /v1 path,
        # but num_ctx and num_predict are honoured).
        # llama.cpp: chat_template_kwargs suppresses thinking; Ollama silently ignores it.
        "chat_template_kwargs": {"enable_thinking": False},
        "options": {"num_ctx": 6144, "num_predict": max_tok, "temperature": 0.4},
        "messages": [{"role": "system", "content": task["system"]}, {"role": "user", "content": task["user"]}],
    }
    result: dict = {}

    def go():
        try:
            result["r"] = _http("POST", cfg["llm_url"] + "/v1/chat/completions", body, timeout=float(cfg.get("llm_timeout", 900)))
        except Exception as e:  # noqa: BLE001
            result["e"] = e
    t = threading.Thread(target=go, daemon=True)
    t.start()
    while t.is_alive():
        if stop.wait(0.5):
            raise InterruptedError("cancelled")
    if "e" in result:
        raise result["e"]
    return result["r"][1]["choices"][0]["message"]["content"]


def run_once(cfg: dict, server: Server) -> bool:
    """Claim and process at most one job. Returns True if a job was handled."""
    caps = capabilities(cfg)
    if not caps["tasks"]:
        return False
    status, job = server.call("/claim", {"tasks": caps["tasks"], "vram_free_mb": caps.get("vram_free_mb")})
    if status == 204 or not job:
        return False
    jid, task = job["job_id"], job["task"]
    log(f"job {jid}: {task['type']} (attempt {job['attempt']})")
    stop, alive = threading.Event(), threading.Event()
    every = max(5, int(job.get("lease_seconds", 60)) // 3)

    def keep_lease():                       # renew the lease while working; the server says when the user cancelled
        while not alive.wait(every):
            try:
                _, r = server.call(f"/jobs/{jid}/progress", {"stage": "generating on GPU"})
                if not r.get("continue", True):
                    stop.set()
                    return
            except ApiError as e:
                if e.status == 409:         # lease lost (we were too slow / server restarted): stop, someone else retries
                    stop.set()
                    return
            except Exception:  # noqa: BLE001  network blip: keep trying until the lease would expire
                pass
    threading.Thread(target=keep_lease, daemon=True).start()
    t0 = time.time()
    try:
        if task["type"] != "llm":
            raise ValueError(f"unsupported task type {task['type']}")
        out = run_llm(cfg, task, stop)
        _, r = server.call(f"/jobs/{jid}/complete", {"sha": task["sha"], "text": out})
        log(f"job {jid}: {r.get('status')} in {time.time() - t0:.1f}s")
    except InterruptedError:
        try:
            server.call(f"/jobs/{jid}/fail", {"error": "stopped: cancelled or lease lost", "retryable": False})
        except ApiError:
            pass
        log(f"job {jid}: stopped (cancelled or lease lost)")
    except Exception as e:  # noqa: BLE001
        try:
            server.call(f"/jobs/{jid}/fail", {"error": f"{type(e).__name__}: {str(e)[:300]}", "retryable": True})
        except ApiError:
            pass
        log(f"job {jid}: failed ({type(e).__name__}), handed back for retry")
    finally:
        alive.set()
    return True


def main(argv=None) -> None:
    cfg = load_config(argv[1] if argv and len(argv) > 1 else None)
    server = Server(cfg)
    log(f"YouTube Buddy X GPU worker {VERSION} -> {cfg['server_url']} (model server {cfg['llm_url']})")
    backoff, last_hb = 2, 0.0
    while True:
        try:
            if time.time() - last_hb >= HEARTBEAT_S:
                caps = capabilities(cfg)
                _, hb = server.call("/heartbeat", {"capabilities": caps})
                last_hb = time.time()
                if not caps["tasks"]:
                    log("not ready: the local model server is not answering at " + cfg["llm_url"])
                if hb.get("paused"):
                    time.sleep(HEARTBEAT_S)
                    continue
            did = run_once(cfg, server)
            backoff = 2
            if not did:
                time.sleep(POLL_S)
        except ApiError as e:
            if e.status in (401, 403):
                raise SystemExit(f"Server refused this worker ({e}). Check the token, or whether it was revoked.")
            log(f"server error {e}; retrying in {backoff}s")
            time.sleep(backoff); backoff = min(60, backoff * 2)
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            log(f"server unreachable ({type(e).__name__}); retrying in {backoff}s")
            time.sleep(backoff); backoff = min(60, backoff * 2)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except KeyboardInterrupt:
        log("stopped")
