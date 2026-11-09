"""Security hardening: browser security headers, production lockdown, AI abuse limits and the paid-AI daily budget."""
import pytest

from app.config import get_settings
from tests.test_ai_tools import env, clip, photo, music, run, fake_provider  # noqa: F401  (fixtures)


def test_security_headers_on_every_response(make_client):
    c = make_client()
    for path in ("/api/v1/health", "/", "/signin"):
        h = c.get(path).headers
        assert h["x-content-type-options"] == "nosniff"
        assert h["x-frame-options"] == "DENY"
        assert "camera=(self)" in h["permissions-policy"] and "geolocation=()" in h["permissions-policy"]
        csp = h["content-security-policy"]
        for d in ("default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"):
            assert d in csp, (path, d)
        assert "unsafe-eval" not in csp and "script-src 'self'" in csp
        assert "fonts.googleapis.com" not in csp  # fonts are bundled, no third-party font requests


def test_csp_allows_storage_and_google_only_when_configured(monkeypatch):
    from app.main import content_security_policy
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT_URL", "https://acct.r2.cloudflarestorage.com/some/path")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "ytbuddy-3")
    get_settings.cache_clear()
    try:
        csp = content_security_policy(get_settings())
        assert "media-src 'self' data: blob: https://acct.r2.cloudflarestorage.com;" in csp
        assert "frame-src https://ytbuddy-3.firebaseapp.com" in csp
        monkeypatch.delenv("FIREBASE_PROJECT_ID")
        get_settings.cache_clear()
        csp = content_security_policy(get_settings())
        assert "frame-src 'none'" in csp and "googleapis" not in csp
        assert "pexels" not in csp and "pixabay" not in csp and "ytimg" not in csp
        monkeypatch.setenv("PEXELS_API_KEY", "k"); monkeypatch.setenv("PIXABAY_API_KEY", "k"); monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "c")
        get_settings.cache_clear()
        img = [d for d in content_security_policy(get_settings()).split("; ") if d.startswith("img-src")][0]
        assert all(h in img for h in ("https://images.pexels.com", "https://cdn.pixabay.com", "https://i.ytimg.com", "https://yt3.ggpht.com"))
    finally:
        get_settings.cache_clear()


def test_production_hides_api_docs_and_sends_hsts(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import create_app
    monkeypatch.setenv("ENV", "production")
    get_settings.cache_clear()
    try:
        c = TestClient(create_app())
        assert c.get("/api/v1/docs").status_code == 404 and "swagger" not in c.get("/api/v1/docs").text.lower()
        assert c.get("/api/v1/openapi.json").status_code == 404
        assert "max-age=31536000" in c.get("/api/v1/health").headers["strict-transport-security"]
    finally:
        monkeypatch.setenv("ENV", "test")
        get_settings.cache_clear()


def test_ai_runs_are_rate_limited_per_user(env):
    from app.security import ai_limiter
    c, pid = env["c"], env["pid"]
    ai_limiter.reset()
    for _ in range(ai_limiter.limit):
        ai_limiter.check(f"ai:{c.get('/api/v1/auth/me').json()['user']['id']}")
    r = c.post(f"/api/v1/projects/{pid}/ai/tools/038/run", json={"params": {"text": "Hello"}})
    assert r.status_code == 429 and "Too many" in r.text
    ai_limiter.reset()


def test_paid_ai_daily_budget_is_enforced(env, fake_provider, monkeypatch):
    c, pid = env["c"], env["pid"]
    monkeypatch.setenv("AI_DAILY_BUDGET_USD", "0.5")
    get_settings.cache_clear()
    try:
        # Veo 3.1 at $0.40/s for 8 s is ~$3.20 — far above a $0.50/day budget: refused before any provider call
        before = len(fake_provider.calls)
        r = c.post(f"/api/v1/projects/{pid}/ai/tools/001/run",
                   json={"params": {"prompt": "A drone shot over Goa beach", "duration": 8}, "model": "fal-ai/veo3.1"})
        assert r.status_code == 429 and "safety limit" in r.text, r.text
        assert len(fake_provider.calls) == before
        monkeypatch.setenv("AI_DAILY_BUDGET_USD", "0")
        get_settings.cache_clear()
        r = c.post(f"/api/v1/projects/{pid}/ai/tools/001/run", json={"params": {"prompt": "x"}, "model": "fal-ai/veo3.1"})
        assert r.status_code == 403 and "switched off" in r.text
        # free, built-in tools are never blocked by the paid budget
        r = c.post(f"/api/v1/projects/{pid}/ai/tools/038/run", json={"params": {"text": "Free tool"}})
        assert r.status_code == 201, r.text
    finally:
        get_settings.cache_clear()


def test_paid_ai_needs_plan_credit_and_respects_platform_wall(env, fake_provider, monkeypatch):
    c, pid = env["c"], env["pid"]
    run = lambda: c.post(f"/api/v1/projects/{pid}/ai/tools/001/run",  # noqa: E731  (~$3.20 ≈ ₹282)
                         json={"params": {"prompt": "A drone shot over Goa beach", "duration": 8}, "model": "fal-ai/veo3.1"})
    try:
        before = len(fake_provider.calls)
        monkeypatch.setenv("FREE_PLAN_AI_CREDIT_INR", "0"); get_settings.cache_clear()
        r = run(); assert r.status_code == 402 and "Creator and Pro" in r.text, r.text
        monkeypatch.setenv("FREE_PLAN_AI_CREDIT_INR", "100"); get_settings.cache_clear()
        r = run(); assert r.status_code == 429 and "credit is used up" in r.text and "₹282" in r.text, r.text
        monkeypatch.setenv("FREE_PLAN_AI_CREDIT_INR", "1000000"); monkeypatch.setenv("AI_MONTHLY_BUDGET_USD", "1"); get_settings.cache_clear()
        r = run(); assert r.status_code == 429 and "paused for the rest of this month" in r.text, r.text
        assert len(fake_provider.calls) == before            # refused before any provider call
        r = c.post(f"/api/v1/projects/{pid}/ai/tools/038/run", json={"params": {"text": "Free tool"}})
        assert r.status_code == 201, r.text                   # free tools are never blocked
    finally:
        get_settings.cache_clear()


def test_double_click_never_pays_twice(env, fake_provider):
    from app.db import session_factory
    from app.models import Generation
    c, pid = env["c"], env["pid"]
    body = {"params": {"prompt": "A drone shot over Goa beach", "duration": 5}, "model": "fal-ai/veo3.1"}
    a = c.post(f"/api/v1/projects/{pid}/ai/tools/001/run", json=body, headers={"idempotency-key": "click-1"})
    b = c.post(f"/api/v1/projects/{pid}/ai/tools/001/run", json=body, headers={"idempotency-key": "click-1"})   # retried request
    assert a.status_code == 201 and a.json()["id"] == b.json()["id"]
    d = c.post(f"/api/v1/projects/{pid}/ai/tools/001/run", json=body)       # no key: the identical run still queued is reused
    assert d.json()["id"] == a.json()["id"]
    f = c.post(f"/api/v1/projects/{pid}/ai/tools/001/run", json={**body, "params": {**body["params"], "prompt": "Mumbai rain"}})
    g = c.post(f"/api/v1/projects/{pid}/ai/tools/001/run", json={**body, "params": {**body["params"], "prompt": "Mumbai rain"}})
    assert f.json()["id"] != a.json()["id"] and g.json()["id"] == f.json()["id"]   # a different request is a new run, once
    with session_factory()() as db:
        assert db.query(Generation).filter(Generation.project_id == pid, Generation.tool_id == "001",
                                           Generation.params["prompt"].astext.in_(["A drone shot over Goa beach", "Mumbai rain"])).count() >= 2


def test_self_hosted_writing_model_is_free_and_needs_no_key(env, fake_provider, monkeypatch):
    from tests.test_editor_flow import drain
    c, pid = env["c"], env["pid"]
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("LLM_BASE_URL", f"http://127.0.0.1:{_port(fake_provider)}")
    monkeypatch.setenv("LLM_LOCAL_MODEL", "qwen2.5-1.5b-instruct")
    monkeypatch.setenv("FREE_PLAN_AI_CREDIT_INR", "0")              # Free plan: no premium credit at all
    get_settings.cache_clear()
    try:
        r = c.post(f"/api/v1/projects/{pid}/ai/tools/052/run", json={"params": {"brief": "Street food in Hyderabad"}})
        assert r.status_code == 201, r.text
        hi = c.post(f"/api/v1/projects/{pid}/ai/tools/052/run", json={"params": {"brief": "x", "language": "hi"}})
        assert hi.status_code == 422 and "supports: en" in hi.text
        assert r.json()["est_cost_usd"] is None                       # self-hosted: no charge against the credit
        drain()
        g = c.get(f"/api/v1/generations/{r.json()['id']}").json()
        assert g["status"] == "succeeded", g
        call = [x for x in fake_provider.calls if x[0] == "llm-openai"][-1]
        assert call[1] is None and call[2]["model"] == "qwen2.5-1.5b-instruct"   # no API key sent anywhere
        # tools that failed review on the free model stay hidden; other languages are refused, not silently English
        tools = {t["id"]: t for t in c.get("/api/v1/ai/tools").json()["tools"]}
        assert tools["051"]["status"]["state"] == "needs_key" and tools["119"]["status"]["state"] == "needs_key"
        r = c.post(f"/api/v1/projects/{pid}/ai/tools/051/run", json={"params": {"brief": "x"}})
        assert r.status_code == 409 and "ANTHROPIC_API_KEY" in r.text, r.text   # hidden tool refused, names the key
    finally:
        get_settings.cache_clear()


def _port(fake) -> int:
    import os
    return int(os.environ["FAL_QUEUE_URL"].rsplit(":", 1)[1])


def test_worker_takes_no_job_until_models_verified(monkeypatch):
    import threading
    from app import worker
    from app.speech import assets
    calls = []
    def broken(progress=print):
        calls.append(1)
        raise assets.AssetError("whisper-small/model.bin is missing and MODELS_OFFLINE=1 forbids downloading it")
    monkeypatch.setattr(assets, "load_check", broken)
    stop = threading.Event()
    stop.wait = lambda t=None: stop.set()            # don't sleep 5 minutes in a test: stop after the first failed check
    worker.wait_for_models(stop)
    assert calls == [1] and stop.is_set()             # it checked, failed, and returned without ever claiming a job
    ok = []
    monkeypatch.setattr(assets, "load_check", lambda progress=print: ok.append(1) or {"whisper": "small", "voices": {}, "translation": {}})
    worker.wait_for_models(threading.Event())
    assert ok == [1]
    monkeypatch.setenv("MODELS_REQUIRED", "1"); assert worker.models_required()
    monkeypatch.setenv("MODELS_REQUIRED", "0"); assert not worker.models_required()


def test_www_redirects_to_canonical_host_in_production(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import create_app
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://youtubebuddy.com")
    get_settings.cache_clear()
    try:
        c = TestClient(create_app(), base_url="https://www.youtubebuddy.com")
        r = c.get("/signin?ref=abc", follow_redirects=False)
        assert r.status_code == 301 and r.headers["location"] == "https://youtubebuddy.com/signin?ref=abc"
        c2 = TestClient(create_app(), base_url="https://youtubebuddy.com")
        assert c2.get("/api/v1/health").status_code in (200, 503)            # the canonical host is served normally
    finally:
        get_settings.cache_clear()
