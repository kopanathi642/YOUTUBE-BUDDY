"""YouTube Growth: channels from (faked) public feeds, transparent recommendations, blueprint -> produce -> editable project,
the approval gate, and publishing only with authorisation. YouTube and the voice engine are replaced by deterministic fakes."""
import subprocess
from datetime import datetime, timedelta, timezone

import pytest

from app import ai_engines, growth_engine as ge
from tests.test_editor_flow import drain, signup

NOW = datetime.now(timezone.utc)
OWN = "UC" + "a" * 22
COMP = "UC" + "b" * 22


def _feed(cid):
    if cid == OWN:
        rows = [("Goa travel vlog budget trip", 3, 9000), ("Budget Goa food tour", 10, 12000), ("My desk setup", 20, 800),
                ("Goa beaches guide", 30, 15000), ("Q&A stream", 40, 500)]
    elif cid == COMP:
        rows = [("Kerala budget travel guide", 2, 40000), ("Hampi travel guide budget", 9, 25000), ("Camera review", 15, 3000)]
    else:
        raise ge.GrowthError("YouTube says this channel doesn't exist (check the channel ID)")
    return {"title": f"Channel {cid[-3:]}", "videos": [{"id": f"{cid[-4:]}{i}", "title": t, "published_at": NOW - timedelta(days=d),
                                                        "views": v, "likes": v // 20, "description": ""} for i, (t, d, v) in enumerate(rows)]}


@pytest.fixture
def growth(make_client, monkeypatch):
    monkeypatch.setattr(ge, "fetch_feed", _feed)
    monkeypatch.setattr(ai_engines, "default_voice", lambda lang, style=None: "test-voice")

    def fake_tts(text, voice, out, length_scale=1.0):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=300:d=2:sample_rate=24000", out], check=True)
        return 2.0
    monkeypatch.setattr(ai_engines, "tts", fake_tts)
    c = make_client()
    ws = signup(c)["workspaces"][0]["id"]
    return c, ws


def test_channels_recommendations_and_honest_errors(growth):
    c, ws = growth
    assert c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": "not a channel"}).status_code == 422
    assert c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": "UC" + "z" * 22}).status_code == 422
    assert c.get(f"/api/v1/growth/overview?workspace_id={ws}").json()["channels"] == []       # failed adds are not kept
    r = c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": f"https://www.youtube.com/channel/{OWN}", "role": "own"})
    assert r.status_code == 201, r.text
    assert c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": OWN}).status_code == 409
    assert c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": COMP}).status_code == 201
    ov = c.get(f"/api/v1/growth/overview?workspace_id={ws}").json()
    assert len(ov["channels"]) == 2 and len(ov["own_recent"]) == 5
    comp = c.get(f"/api/v1/growth/competitors?workspace_id={ws}").json()["channels"]
    assert {x["role"] for x in comp} == {"own", "competitor"} and all(x["median_views_per_day"] for x in comp)
    rec = c.get(f"/api/v1/growth/recommendations?workspace_id={ws}").json()
    top = rec["candidates"][0]
    assert top["weights"] == ge.DEFAULT_WEIGHTS and set(top["parts"]) == set(ge.DEFAULT_WEIGHTS)
    assert top["evidence"] and top["confidence"] in ("low", "medium", "fair")
    assert "don't predict views" in rec["method"]
    # coach without an AI key: an honest 409, not an invented answer
    r = c.post("/api/v1/growth/coach", json={"workspace_id": ws, "question": "What should I post next?"})
    assert r.status_code == 409 and "AI key" in r.json()["detail"]


def test_blueprint_produce_review_and_publish_gate(growth):
    c, ws = growth
    c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": OWN, "role": "own"})
    it = c.post("/api/v1/growth/items", json={"workspace_id": ws, "title": "Goa on a budget", "format": "short"}).json()
    assert it["status"] == "idea"
    assert c.post(f"/api/v1/growth/items/{it['id']}/produce", json={}).status_code == 409       # no blueprint yet
    bp = c.post(f"/api/v1/growth/items/{it['id']}/blueprint").json()
    assert bp["status"] == "script" and bp["blueprint"]["method"].startswith("template") and bp["unfinished"]
    r = c.post(f"/api/v1/growth/items/{it['id']}/produce", json={})
    assert r.status_code == 409 and "Finish the script" in r.json()["detail"]                 # template markers must be written
    scenes = [{"heading": f"Part {i}", "narration": f"This is part {i}. It is short and clear.", "visual": "beach"} for i in range(3)]
    b = bp["blueprint"]
    filled = {**b, "hook": "Goa for under 5000 rupees.", "scenes": scenes, "cta": "Subscribe for more budget trips.",
              "thumbnail_text": "GOA ₹5000", "seo": {"description": "Budget Goa.", "tags": ["goa", "budget"]}}
    filled = {k: v for k, v in filled.items() if not isinstance(v, str) or "[Write" not in v}
    r = c.patch(f"/api/v1/growth/items/{it['id']}", json={"blueprint": filled})
    assert r.status_code == 200 and r.json()["unfinished"] == [], r.json()["unfinished"]
    assert c.patch(f"/api/v1/growth/items/{it['id']}", json={"status": "approved"}).status_code == 409   # not produced yet
    j = c.post(f"/api/v1/growth/items/{it['id']}/produce", json={})
    assert j.status_code == 201, j.text
    drain()
    assert c.get(f"/api/v1/jobs/{j.json()['id']}").json()["status"] == "succeeded"
    item = c.get(f"/api/v1/growth/items?workspace_id={ws}").json()[0]
    assert item["status"] == "review" and item["project_id"] and item["prediction"] == {}   # too little history: no estimate shown
    assert item["blueprint"]["produced"]["scenes"] == 3
    assert "0:00" in item["blueprint"]["seo"]["description"]                                       # chapters added
    seqs = c.get(f"/api/v1/projects/{item['project_id']}").json()
    assert seqs                                                                                    # a normal, editable project
    assert c.patch(f"/api/v1/growth/items/{it['id']}", json={"status": "published"}).status_code == 409  # only by a real upload
    assert c.patch(f"/api/v1/growth/items/{it['id']}", json={"status": "approved"}).status_code == 200
    r = c.post(f"/api/v1/growth/items/{it['id']}/publish", json={"privacy": "private"})
    assert r.status_code == 409                                                                    # YouTube not configured here


def test_automation_settings_and_cycle(growth):
    c, ws = growth
    c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": OWN, "role": "own"})
    c.post("/api/v1/growth/channels", json={"workspace_id": ws, "ref": COMP})
    a = c.get(f"/api/v1/growth/automation?workspace_id={ws}").json()
    assert a["mode"] == "assisted" and a["publish_authorized"] is False and a["capabilities"]["ai_writing"] is False
    assert c.put("/api/v1/growth/automation", json={"workspace_id": ws, "weights": {"relevance": 0}}).status_code == 422
    a = c.put("/api/v1/growth/automation", json={"workspace_id": ws, "mode": "semi", "modules": {"script": True}}).json()
    assert a["mode"] == "semi" and a["modules"]["script"] is True
    j = c.post(f"/api/v1/growth/automation/run?workspace_id={ws}").json()
    drain()
    res = c.get(f"/api/v1/jobs/{j['id']}").json()
    assert res["status"] == "succeeded", res
    items = c.get(f"/api/v1/growth/items?workspace_id={ws}").json()
    assert 1 <= len(items) <= 3 and all(i["status"] == "script" for i in items)                   # ideas + drafts, nothing produced
    assert c.get(f"/api/v1/growth/performance?workspace_id={ws}").json()["videos"] == []


def test_produce_without_a_voice_engine_still_builds_and_says_so(growth, monkeypatch):
    c, ws = growth

    def broken(*a, **k):
        raise ModuleNotFoundError("No module named 'kokoro_onnx'")
    monkeypatch.setattr(ai_engines, "tts", broken)
    it = c.post("/api/v1/growth/items", json={"workspace_id": ws, "title": "Silent test", "format": "long"}).json()
    scenes = [{"heading": "One", "narration": "Six words are spoken right here.", "visual": ""}]
    c.patch(f"/api/v1/growth/items/{it['id']}", json={"blueprint": {"scenes": scenes, "seo": {}}})
    assert c.post(f"/api/v1/growth/items/{it['id']}/produce", json={}).status_code == 201
    drain()
    item = c.get(f"/api/v1/growth/items?workspace_id={ws}").json()[0]
    assert item["status"] == "review"
    assert item["blueprint"]["produced"]["voice_id"] is None and "Voice unavailable" in item["blueprint"]["produced"]["warnings"][0]
