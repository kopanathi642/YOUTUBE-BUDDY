"""Growth loop: Free-plan exports carry a small 'Made with …' badge bottom-right; paid plans don't."""
import os
import subprocess
from datetime import datetime, timedelta, timezone

import httpx
import numpy as np

from app.config import get_settings
from tests.test_editor_flow import drain, new_project, signup, upload

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _corner_brightness(url, tmp_path):
    p = tmp_path / "out.mp4"; p.write_bytes(httpx.get(url).content)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "0.5", "-i", str(p), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    w, h = 1280, 720
    a = np.frombuffer(raw, np.uint8).reshape(h, w)
    return float(a[-60:, -300:].std()), float(a[:60, :300].std())


def _export(c, plan=None):
    me = signup(c); ws = me["workspaces"][0]["id"]
    if plan:
        from app.db import session_factory
        from app.models import Workspace
        with session_factory()() as db:
            w = db.get(Workspace, ws); w.plan = plan; w.plan_expires_at = datetime.now(timezone.utc) + timedelta(days=5); db.commit()
    p = new_project(c, ws, format="landscape_720")
    a = upload(c, p["id"], os.path.join(FIX, "grey.mp4"), "video/mp4")
    drain()
    seq = p["sequences"][0]; tl = seq["timeline"]
    next(t for t in tl["tracks"] if t["id"] == "v1")["clips"] = [{"id": "c1", "asset_id": a["id"], "start": 0, "in": 0, "out": 30}]
    assert c.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl}).status_code == 200
    c.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "match"})
    drain()
    return c.get(f"/api/v1/projects/{p['id']}/exports").json()[0]


def test_free_export_has_badge_paid_does_not(make_client, monkeypatch, tmp_path):
    monkeypatch.setattr(get_settings(), "free_plan_watermark", True)
    e = _export(make_client())
    assert e["job"]["status"] == "succeeded" and e["settings"]["watermark"] is True
    br, tl = _corner_brightness(e["download_url"], tmp_path)
    assert br > tl + 5, (br, tl)      # text in the bottom-right corner, flat grey elsewhere
    e = _export(make_client(), plan="creator")
    assert e["settings"]["watermark"] is False
    br, tl = _corner_brightness(e["download_url"], tmp_path)
    assert br < 3


def test_referral_rewards_inviter_after_friends_first_export(make_client):
    inv = make_client(); me = signup(inv)
    code = me["referral_code"]
    friend = make_client()
    r = friend.post("/api/v1/auth/signup", json={"email": f"f{code}@example.com", "password": "correct horse battery",
                                                  "display_name": "Friend", "ref": code})
    assert r.status_code == 201
    ws_inv = me["workspaces"][0]["id"]
    assert inv.get("/api/v1/billing", params={"workspace_id": ws_inv}).json()["plan"] == "free"   # signing up alone earns nothing
    ws = r.json()["workspaces"][0]["id"]
    p = new_project(friend, ws, format="landscape_720")
    a = upload(friend, p["id"], os.path.join(FIX, "grey.mp4"), "video/mp4"); drain()
    seq = p["sequences"][0]; tl = seq["timeline"]
    next(t for t in tl["tracks"] if t["id"] == "v1")["clips"] = [{"id": "c1", "asset_id": a["id"], "start": 0, "in": 0, "out": 15}]
    friend.put(f"/api/v1/sequences/{seq['id']}", json={"base_version": 1, "timeline": tl})
    for _ in range(2):   # two exports: reward only once
        friend.post(f"/api/v1/sequences/{seq['id']}/exports", json={"preset": "draft"}); drain()
    b = inv.get("/api/v1/billing", params={"workspace_id": ws_inv}).json()
    assert b["plan"] == "creator"
    days = (datetime.fromisoformat(b["plan_expires_at"]) - datetime.now(timezone.utc)).days
    assert 6 <= days <= 7, days
    # garbage codes are ignored, not errors
    assert make_client().post("/api/v1/auth/signup", json={"email": f"g{code}@example.com", "password": "correct horse battery",
                                                           "display_name": "G", "ref": "'; drop"}).status_code == 201


def test_feedback_and_founder_metrics(make_client):
    from tests.test_billing import _admin
    u = make_client(); signup(u)
    assert u.post("/api/v1/feedback", json={"message": "Please add more Hindi fonts", "page": "/edit/x", "rating": 4}).status_code == 201
    assert u.get("/api/v1/admin/metrics").status_code == 404
    m = _admin(make_client).get("/api/v1/admin/metrics").json()
    assert m["users"] >= 2 and any(f["message"] == "Please add more Hindi fonts" for f in m["feedback"])
    assert {"active_7d", "activation_rate", "conversion_rate", "revenue_30d_inr", "top_features_30d"} <= m.keys()
