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
        assert r.status_code == 429 and "budget" in r.text, r.text
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
