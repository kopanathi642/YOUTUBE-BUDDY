"""UPI QR + UTR + admin approval: no gateway, no fees. Only platform admins see/approve; approval activates the plan."""
import base64
import io

import httpx
from PIL import Image

from app.config import get_settings
from tests.test_editor_flow import signup


def _qr_data_url():
    img = Image.new("RGB", (300, 300), "white")
    for x in range(0, 300, 20):
        for y in range(0, 300, 20):
            if (x + y) % 40 == 0:
                img.paste((0, 0, 0), (x, y, x + 20, y + 20))
    b = io.BytesIO(); img.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def _admin(make_client):
    a = make_client()
    try:
        signup(a, "founder@example.com")
    except AssertionError:   # already exists from another test: sign in
        r = a.post("/api/v1/auth/login", json={"email": "founder@example.com", "password": "correct horse battery"})
        assert r.status_code == 200, r.text
    return a


def test_full_upi_flow(make_client):
    admin = _admin(make_client)
    assert admin.get("/api/v1/auth/me").json()["is_platform_admin"] is True
    r = admin.put("/api/v1/admin/billing/upi", json={"upi_id": "founder@ybl", "payee_name": "Founder", "qr_data_url": _qr_data_url()})
    assert r.status_code == 200, r.text
    assert httpx.get(r.json()["qr_url"]).status_code == 200

    u = make_client()
    me = signup(u)
    assert me["is_platform_admin"] is False and me["workspaces"][0]["plan"] == "free"
    ws = me["workspaces"][0]["id"]
    b = u.get("/api/v1/billing", params={"workspace_id": ws}).json()
    assert b["plan"] == "free" and b["upi"]["upi_id"] == "founder@ybl" and b["upi"]["qr_url"]
    assert [p["id"] for p in b["plans"]] == ["free", "creator", "pro"]

    assert u.post("/api/v1/billing/payments", json={"workspace_id": ws, "plan": "creator", "utr": "12345"}).status_code == 422
    import random
    utr = "".join(random.choice("0123456789") for _ in range(12))
    r = u.post("/api/v1/billing/payments", json={"workspace_id": ws, "plan": "creator", "months": 2, "utr": utr})
    assert r.status_code == 201, r.text
    assert r.json()["amount_inr"] == 598 and r.json()["status"] == "pending"
    assert u.post("/api/v1/billing/payments", json={"workspace_id": ws, "plan": "creator", "utr": utr}).status_code == 409  # reused UTR

    # a normal user can't see or approve payments (admin routes look like they don't exist)
    assert u.get("/api/v1/admin/payments").status_code == 404
    assert u.post(f"/api/v1/admin/payments/{r.json()['id']}/approve", json={}).status_code == 404

    pend = admin.get("/api/v1/admin/payments").json()["payments"]
    pay = next(p for p in pend if p["utr"] == utr)
    assert pay["user_email"] == me["user"]["email"]
    assert admin.post(f"/api/v1/admin/payments/{pay['id']}/approve", json={"note": "seen in PhonePe"}).status_code == 200
    assert admin.post(f"/api/v1/admin/payments/{pay['id']}/approve", json={}).status_code == 409   # not twice

    b = u.get("/api/v1/billing", params={"workspace_id": ws}).json()
    assert b["plan"] == "creator" and b["plan_expires_at"] and b["payments"][0]["status"] == "approved"
    assert b["paid_runs_per_day"] == 50


def test_reject_and_validation(make_client):
    admin = _admin(make_client)
    u = make_client(); me = signup(u); ws = me["workspaces"][0]["id"]
    r = u.post("/api/v1/billing/payments", json={"workspace_id": ws, "plan": "pro", "utr": "9876 5432 1012"})   # spaces allowed
    assert r.status_code == 201, r.text
    assert admin.post(f"/api/v1/admin/payments/{r.json()['id']}/reject", json={}).json()["status"] == "rejected"
    assert u.get("/api/v1/billing", params={"workspace_id": ws}).json()["plan"] == "free"
    # bad QR uploads are refused
    assert admin.put("/api/v1/admin/billing/upi", json={"qr_data_url": "data:image/png;base64,AAAA"}).status_code == 422
    assert admin.put("/api/v1/admin/billing/upi", json={"upi_id": "not a upi id"}).status_code == 422
    # someone else's workspace
    other = make_client(); ows = signup(other)["workspaces"][0]["id"]
    assert u.post("/api/v1/billing/payments", json={"workspace_id": ows, "plan": "pro", "utr": "111122223333"}).status_code == 404


def test_free_plan_paid_run_limit(make_client, monkeypatch):
    from app.billing import paid_runs_limit
    from app.models import Workspace
    monkeypatch.setattr(get_settings(), "free_plan_paid_runs", 5)
    assert paid_runs_limit(Workspace(plan="free")) == 5
    from datetime import datetime, timedelta, timezone
    assert paid_runs_limit(Workspace(plan="pro", plan_expires_at=datetime.now(timezone.utc) + timedelta(days=1))) == 200
    assert paid_runs_limit(Workspace(plan="pro", plan_expires_at=datetime.now(timezone.utc) - timedelta(days=1))) == 5   # expired
