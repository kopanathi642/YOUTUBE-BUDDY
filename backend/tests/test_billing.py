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
    assert b["ai_credit_inr"] == 100 and b["ai_spent_inr"] == 0


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


def test_plan_credits_and_yearly_price(make_client, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app.billing import PLANS, ai_credit_inr, price_inr
    from app.models import Workspace
    monkeypatch.setattr(get_settings(), "free_plan_ai_credit_inr", 0.0)
    soon, past = datetime.now(timezone.utc) + timedelta(days=1), datetime.now(timezone.utc) - timedelta(days=1)
    assert ai_credit_inr(Workspace(plan="free")) == 0
    assert ai_credit_inr(Workspace(plan="creator", plan_expires_at=soon)) == 100
    assert ai_credit_inr(Workspace(plan="pro", plan_expires_at=soon)) == 300
    assert ai_credit_inr(Workspace(plan="pro", plan_expires_at=past)) == 0          # expired -> free
    assert price_inr("creator", 1) == 299 and price_inr("creator", 3) == 897
    assert price_inr("creator", 12) == 2990 and price_inr("pro", 12) == 7990         # 12 months for the price of 10
    # profitability rule: the AI credit stays under half of what the plan brings in after 18% GST
    for k, p in PLANS.items():
        if p["price_inr"]:
            assert p["ai_credit_inr"] <= 0.5 * p["price_inr"] / 1.18, k


def test_yearly_payment_amount_and_public_prices(make_client):
    u = make_client(); ws = signup(u)["workspaces"][0]["id"]
    r = u.post("/api/v1/billing/payments", json={"workspace_id": ws, "plan": "creator", "months": 12, "utr": "555566667777"})
    assert r.status_code == 201 and r.json()["amount_inr"] == 2990
    anon = make_client()   # signed out
    pub = anon.get("/api/v1/public/plans").json()
    assert [p["id"] for p in pub["plans"]] == ["free", "creator", "pro"]
    assert pub["plans"][1]["price_inr"] == 299 and pub["plans"][1]["year_price_inr"] == 2990 and pub["year_months"] == 12


def test_pro_jobs_are_claimed_first(make_client):
    from datetime import datetime, timedelta, timezone
    import uuid
    from app import jobs
    from app.db import session_factory
    from app.models import Workspace
    u1, u2 = make_client(), make_client()
    free_ws, pro_ws = signup(u1)["workspaces"][0]["id"], signup(u2)["workspaces"][0]["id"]
    q = f"prio-{uuid.uuid4().hex[:8]}"
    with session_factory()() as db:
        db.get(Workspace, uuid.UUID(pro_ws)).plan = "pro"
        db.get(Workspace, uuid.UUID(pro_ws)).plan_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        a = jobs.enqueue(db, workspace_id=uuid.UUID(free_ws), kind="noop", payload={}); a.queue = q
        db.commit()
        b = jobs.enqueue(db, workspace_id=uuid.UUID(pro_ws), kind="noop", payload={}); b.queue = q   # queued later
        db.commit()
        first = jobs.claim(db, "w1", [q], 60)
        second = jobs.claim(db, "w1", [q], 60)
        assert first.id == b.id and second.id == a.id   # Pro first, then the older free job


def test_paypal_option(make_client):
    admin = _admin(make_client)
    r = admin.put("/api/v1/admin/billing/upi", json={"paypal_link": "https://paypal.me/founder", "paypal_qr_data_url": _qr_data_url()})
    assert r.status_code == 200, r.text
    assert r.json()["paypal"]["configured"] and httpx.get(r.json()["paypal"]["qr_url"]).status_code == 200
    assert admin.put("/api/v1/admin/billing/upi", json={"paypal_link": "https://evil.example/pay"}).status_code == 422
    u = make_client(); ws = signup(u)["workspaces"][0]["id"]
    assert u.post("/api/v1/billing/payments", json={"workspace_id": ws, "plan": "pro", "method": "paypal", "utr": "123456789012"}).status_code == 422
    import uuid
    tid = uuid.uuid4().hex[:17].upper()
    r = u.post("/api/v1/billing/payments", json={"workspace_id": ws, "plan": "pro", "method": "paypal", "utr": tid})
    assert r.status_code == 201 and r.json()["method"] == "paypal", r.text


def test_developer_account_gets_pro_free_only_when_verified(make_client, monkeypatch):
    from app.models import User
    monkeypatch.setattr(get_settings(), "developer_emails", "dev@example.com")
    c = make_client()
    r = c.post("/api/v1/auth/signup", json={"email": "dev@example.com", "password": "correct horse battery", "display_name": "Dev"})
    assert r.status_code == 201
    ws = r.json()["workspaces"][0]["id"]
    b = c.get("/api/v1/billing", params={"workspace_id": ws}).json()
    assert b["plan"] == "pro" and b["plan_expires_at"].startswith("2100") and b["ai_credit_inr"] == 300   # test env: no verification needed
    other = make_client(); ows = signup(other)["workspaces"][0]["id"]
    assert other.get("/api/v1/billing", params={"workspace_id": ows}).json()["plan"] == "free"           # nobody else
    # production: an unverified (password) account with the developer email gets nothing
    monkeypatch.setattr(get_settings(), "env", "production")
    from app.billing import is_developer
    assert not is_developer(User(email="dev@example.com", email_verified=False))
    assert is_developer(User(email="dev@example.com", email_verified=True))
