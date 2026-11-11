"""The app firewall: per-IP rate limits, scanner bans, spoof-proof visitor IP, request hygiene."""
import pytest

from app.config import get_settings
from app.shield import shield


@pytest.fixture
def tight(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "shield_api_rate", 1.0)
    monkeypatch.setattr(s, "shield_api_burst", 5)
    monkeypatch.setattr(s, "shield_page_rate", 1.0)
    monkeypatch.setattr(s, "shield_page_burst", 5)
    shield.reset()
    yield s
    shield.reset()


def test_api_flood_gets_429_then_ban(make_client, tight):
    c = make_client()
    codes = [c.get("/api/v1/auth/me").status_code for _ in range(5)]
    assert 429 not in codes
    r = c.get("/api/v1/auth/me")
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1
    assert c.get("/api/v1/health").status_code == 200          # uptime checks are never limited
    for _ in range(220):                                         # keeps hammering → banned
        c.get("/api/v1/auth/me")
    assert c.get("/api/v1/auth/me").status_code == 403
    assert c.get("/").status_code == 403                         # the ban covers the whole site


def test_scanner_probes_are_404_and_lead_to_a_ban(make_client, tight, monkeypatch):
    monkeypatch.setattr(tight, "shield_api_burst", 1000)
    monkeypatch.setattr(tight, "shield_page_burst", 1000)
    c = make_client()
    for path in ("/.env", "/.git/config", "/wp-admin/install.php", "/index.php"):
        assert c.get(path).status_code == 404
    assert c.get("/api/v1/auth/me").status_code == 403           # 4 probes × 2 strikes = banned
    shield.reset()
    assert c.get("/api/v1/auth/me").status_code == 401           # normal again after the ban


def test_cloudflare_ip_cannot_be_spoofed_and_isolates_visitors(make_client, tight, monkeypatch):
    monkeypatch.setattr(tight, "trust_cloudflare_ip", True)
    c = make_client()
    for _ in range(5):
        c.get("/api/v1/auth/me", headers={"cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1"})
    assert c.get("/api/v1/auth/me", headers={"cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9"}).status_code == 429
    assert c.get("/api/v1/auth/me", headers={"cf-connecting-ip": "198.51.100.2"}).status_code == 401   # another visitor is fine


def test_request_hygiene(make_client, tight, monkeypatch):
    monkeypatch.setattr(tight, "shield_api_burst", 1000)
    monkeypatch.setattr(tight, "shield_max_body_bytes", 1000)
    c = make_client()
    assert c.request("TRACE", "/").status_code == 405
    assert c.get("/" + "a" * 3000).status_code == 414
    r = c.post("/api/v1/auth/login", content=b"x" * 2000, headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_build_assets_are_cached_for_a_year(make_client):
    import os
    from app.main import app  # noqa: F401
    dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist", "assets")
    if not os.path.isdir(dist):
        pytest.skip("frontend not built")
    name = next(f for f in os.listdir(dist) if f.endswith(".js"))
    r = make_client().get(f"/assets/{name}")
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
    assert "no-cache" in make_client().get("/").headers["cache-control"]
