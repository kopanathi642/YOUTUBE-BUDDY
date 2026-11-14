"""GPU worker (HP laptop) routing: writing-model jobs wait in the gpu queue while no worker is online, a registered
worker claims them over the worker API, and the server finishes them. Covers: auth, public-tunnel refusal, the off
switch, atomic claim, lease expiry + reclaim (worker died mid-job), idempotent completion, output validation,
cancellation, pausing and revocation."""
import json
import os
from datetime import datetime, timedelta, timezone

import pytest

from tests.test_editor_flow import drain, new_project, signup

TOOL = "052"   # Hook Generator: a reviewed local-model writing tool
REPLY = json.dumps({"hooks": [{"text": "You won't believe this temple at sunrise", "why": "curiosity"}]})


@pytest.fixture
def gpu_env(monkeypatch, make_client):
    for k in ("GROQ_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LLM_BASE_URL"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("GPU_WORKERS_ENABLED", "true")
    monkeypatch.setenv("GPU_LLM", "true")
    admin = make_client()
    try:
        signup(admin, "founder@example.com")
    except AssertionError:
        assert admin.post("/api/v1/auth/login", json={"email": "founder@example.com", "password": "correct horse battery"}).status_code == 200
    user = make_client()
    me = signup(user)
    p = new_project(user, me["workspaces"][0]["id"])
    return {"admin": admin, "user": user, "pid": p["id"], "mk": make_client}


def _worker(env, name):
    r = env["admin"].post("/api/v1/admin/gpu/workers", json={"name": name})
    assert r.status_code == 201, r.text
    tok = r.json()["token"]
    w = env["mk"]()
    w.headers.pop("x-requested-with", None)           # a worker is not a browser: no CSRF header, no cookies
    w.headers["authorization"] = f"Bearer {tok}"
    return w, r.json()


def _run_tool(env, brief="Sunrise at Hampi"):
    r = env["user"].post(f"/api/v1/projects/{env['pid']}/ai/tools/{TOOL}/run", json={"params": {"brief": brief, "count": 3}})
    assert r.status_code == 201, r.text
    return r.json()


def _job_of(gen_id):
    from app.db import session_factory
    from app.models import Generation, Job
    db = session_factory()()
    try:
        g = db.get(Generation, __import__("uuid").UUID(gen_id))
        return db.get(Job, g.job_id) if getattr(g, "job_id", None) else db.query(Job).filter(Job.payload["generation_id"].astext == gen_id).one()
    finally:
        db.close()


def _set_lease_expired(job_id):
    from app.db import session_factory
    from app.models import Job
    db = session_factory()()
    try:
        j = db.get(Job, job_id)
        j.lease_until = datetime.now(timezone.utc) - timedelta(seconds=5)
        db.commit()
    finally:
        db.close()


def test_status_says_it_runs_on_the_gpu_worker(gpu_env):
    t = gpu_env["user"].get(f"/api/v1/ai/tools/{TOOL}").json()
    assert t["status"]["state"] == "ready" and t["status"]["runs_on"] == "gpu_worker"
    # a tool the local model did not pass review for stays honestly unavailable
    assert gpu_env["user"].get("/api/v1/ai/tools/051").json()["status"]["state"] == "needs_key"


def test_job_waits_then_gpu_worker_completes_it(gpu_env):
    g = _run_tool(gpu_env)
    drain()                                                   # server worker runs the tool up to the model call
    job = _job_of(g["id"])
    assert job.queue == "gpu" and job.status.value == "queued" and job.stage == "Waiting for GPU worker"
    assert job.attempts == 0                                  # waiting is not a failed attempt
    out = gpu_env["user"].get(f"/api/v1/generations/{g['id']}").json()
    assert out["status"] not in ("succeeded", "failed")       # nothing is shown as done before the GPU answered

    w, _ = _worker(gpu_env, "hp-test-1")
    hb = w.post("/api/v1/worker/heartbeat", json={"capabilities": {"gpu": "RTX 4050", "vram_mb": 6144, "tasks": ["llm"]}})
    assert hb.status_code == 200 and hb.json()["paused"] is False
    c = w.post("/api/v1/worker/claim", json={"tasks": ["llm"]})
    assert c.status_code == 200, c.text
    task = c.json()["task"]
    assert task["type"] == "llm" and "Sunrise at Hampi" in task["user"] and len(task["sha"]) == 64
    assert w.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).status_code == 204   # nothing else to do: no double claim
    assert w.post(f"/api/v1/worker/jobs/{c.json()['job_id']}/progress", json={"progress": 0.5, "stage": "generating"}).json() == {"continue": True}
    done = w.post(f"/api/v1/worker/jobs/{c.json()['job_id']}/complete", json={"sha": task["sha"], "text": REPLY})
    assert done.json() == {"status": "accepted"}
    again = w.post(f"/api/v1/worker/jobs/{c.json()['job_id']}/complete", json={"sha": task["sha"], "text": REPLY})
    assert again.json() == {"status": "already_delivered"}   # a retried request changes nothing

    drain()                                                   # server worker replays the job with the GPU answer
    out = gpu_env["user"].get(f"/api/v1/generations/{g['id']}").json()
    assert out["status"] == "succeeded", out
    assert out["result"]["hooks"][0]["text"].startswith("You won't believe")
    assert "GPU worker" in out["model"]
    job = _job_of(g["id"])
    assert job.status.value == "succeeded" and job.queue == "media" and job.attempts == 1

    ov = gpu_env["admin"].get("/api/v1/admin/gpu").json()
    assert ov["enabled"] and any(x["name"] == "hp-test-1" and x["online"] for x in ov["workers"])


def test_worker_dies_mid_job_and_job_is_reclaimed(gpu_env):
    g = _run_tool(gpu_env)
    drain()
    w1, _ = _worker(gpu_env, "hp-test-2a")
    w2, _ = _worker(gpu_env, "hp-test-2b")
    c1 = w1.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).json()
    assert w2.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).status_code == 204   # held by w1's lease
    _set_lease_expired(c1["job_id"])                          # w1 lost power: its lease runs out
    c2 = w2.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).json()
    assert c2["job_id"] == c1["job_id"] and c2["attempt"] == 2
    late = w1.post(f"/api/v1/worker/jobs/{c1['job_id']}/complete", json={"sha": c1["task"]["sha"], "text": REPLY})
    assert late.status_code == 409                            # the dead worker can't finish a job it no longer owns
    assert w2.post(f"/api/v1/worker/jobs/{c2['job_id']}/complete", json={"sha": c2["task"]["sha"], "text": REPLY}).json()["status"] == "accepted"
    drain()
    assert gpu_env["user"].get(f"/api/v1/generations/{g['id']}").json()["status"] == "succeeded"


def _set_max_attempts(job_id, n):
    from app.db import session_factory
    from app.models import Job
    db = session_factory()()
    try:
        db.get(Job, job_id).max_attempts = n
        db.commit()
    finally:
        db.close()


def test_unusable_answer_is_rejected_then_retried_or_failed(gpu_env):
    w, _ = _worker(gpu_env, "hp-test-3")
    # a run that allows retries goes back in the GPU queue (with backoff), never shown as done
    g = _run_tool(gpu_env); drain()
    _set_max_attempts(_job_of(g["id"]).id, 3)
    c = w.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).json()
    assert w.post(f"/api/v1/worker/jobs/{c['job_id']}/complete", json={"sha": "0" * 64, "text": REPLY}).status_code == 409   # wrong task
    bad = w.post(f"/api/v1/worker/jobs/{c['job_id']}/complete", json={"sha": c["task"]["sha"], "text": "sorry, no json here"})
    assert bad.json()["status"] == "rejected"
    job = _job_of(g["id"])
    assert job.status.value == "queued" and job.queue == "gpu" and "unusable" in job.error and job.run_after > datetime.now(timezone.utc)
    assert gpu_env["user"].get(f"/api/v1/generations/{g['id']}").json()["status"] not in ("succeeded", "failed")
    # a single-attempt run (the default for runs that can cost credits) fails cleanly: clear error, no second charge
    g2 = _run_tool(gpu_env, "Monsoon in Kerala"); drain()
    j2 = _job_of(g2["id"]); assert j2.max_attempts == 1
    c2 = w.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).json()
    assert c2["job_id"] == str(j2.id)
    w.post(f"/api/v1/worker/jobs/{c2['job_id']}/complete", json={"sha": c2["task"]["sha"], "text": "still no json"})
    out = gpu_env["user"].get(f"/api/v1/generations/{g2['id']}").json()
    assert out["status"] == "failed" and "unreadable" in out["error"]


def test_cancel_while_waiting_and_while_running(gpu_env):
    g = _run_tool(gpu_env)
    drain()
    assert gpu_env["user"].post(f"/api/v1/jobs/{g['job']['id']}/cancel").status_code == 200
    assert _job_of(g["id"]).status.value == "canceled"
    assert gpu_env["user"].get(f"/api/v1/generations/{g['id']}").json()["status"] == "canceled"   # not stuck at "running"
    w, _ = _worker(gpu_env, "hp-test-4")
    assert w.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).status_code == 204       # cancelled jobs are never handed out

    g2 = _run_tool(gpu_env, "Street food in Delhi")
    drain()
    c = w.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).json()
    assert gpu_env["user"].post(f"/api/v1/jobs/{g2['job']['id']}/cancel").status_code == 200
    assert w.post(f"/api/v1/worker/jobs/{c['job_id']}/progress", json={"progress": 0.3}).json() == {"continue": False}
    r = w.post(f"/api/v1/worker/jobs/{c['job_id']}/fail", json={"error": "stopped: cancelled", "retryable": False})
    assert r.json()["status"] == "canceled"
    assert gpu_env["user"].get(f"/api/v1/generations/{g2['id']}").json()["status"] == "canceled"


def test_auth_tunnel_switch_pause_and_revoke(gpu_env, monkeypatch):
    w, info = _worker(gpu_env, "hp-test-5")
    anon = gpu_env["mk"]()
    assert anon.post("/api/v1/worker/heartbeat", json={}).status_code == 401
    anon.headers["authorization"] = "Bearer ybw_not-a-real-token"
    assert anon.post("/api/v1/worker/heartbeat", json={}).status_code == 401
    # a valid token arriving through the public Cloudflare tunnel is refused
    assert w.post("/api/v1/worker/heartbeat", json={}, headers={"cf-connecting-ip": "203.0.113.9"}).status_code == 403
    assert w.post("/api/v1/worker/heartbeat", json={}, headers={"cf-ray": "abc123-BOM"}).status_code == 403
    # a normal user can't reach the admin controls
    assert gpu_env["user"].get("/api/v1/admin/gpu").status_code == 404
    assert gpu_env["user"].post("/api/v1/admin/gpu/workers", json={"name": "evil"}).status_code == 404
    # pause: worker gets nothing
    _run_tool(gpu_env); drain()
    assert gpu_env["admin"].post("/api/v1/admin/gpu/pause", json={"paused": True}).json() == {"paused": True}
    assert w.post("/api/v1/worker/heartbeat", json={}).json()["paused"] is True
    assert w.post("/api/v1/worker/claim", json={"tasks": ["llm"]}).status_code == 204
    gpu_env["admin"].post("/api/v1/admin/gpu/pause", json={"paused": False})
    # a worker that can't do llm never receives llm tasks
    assert w.post("/api/v1/worker/claim", json={"tasks": ["image"]}).status_code == 204
    # revoke
    assert gpu_env["admin"].post(f"/api/v1/admin/gpu/workers/{info['id']}/revoke").json()["revoked"] is True
    assert w.post("/api/v1/worker/heartbeat", json={}).status_code == 403
    # off switch
    monkeypatch.setenv("GPU_WORKERS_ENABLED", "false")
    w2, _ = _worker(gpu_env, "hp-test-6")
    assert w2.post("/api/v1/worker/heartbeat", json={}).status_code == 503


def test_off_switch_keeps_todays_behaviour(monkeypatch):
    from app import gpu
    from app.tools import providers, registry
    for k in ("GROQ_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LLM_BASE_URL", "GPU_LLM", "GPU_WORKERS_ENABLED"):
        monkeypatch.delenv(k, raising=False)
    assert not gpu.enabled() and not gpu.llm_routed()
    assert registry.status(registry.TOOLS[TOOL])["state"] == "needs_key"
    with pytest.raises(providers.ProviderError):
        providers.llm_json("x", "y")
    # routed but called outside a job (e.g. a chat request): honest error, never a hang
    monkeypatch.setenv("GPU_WORKERS_ENABLED", "true"); monkeypatch.setenv("GPU_LLM", "true")
    with pytest.raises(providers.ProviderError, match="GPU worker"):
        providers.llm_json("x", "y")
    # a hosted key still takes precedence over the GPU worker
    monkeypatch.setenv("LLM_BASE_URL", "")
    assert registry.status(registry.TOOLS[TOOL])["state"] == "ready"
