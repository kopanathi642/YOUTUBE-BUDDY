"""Website traffic: page views are recorded without cookies or personal data; only admin accounts can read the stats."""
from app.models import PageVisit
from app.routers import stats as st
from tests.test_billing import _admin
from tests.test_editor_flow import signup

UA_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"


def test_track_and_admin_only_stats(make_client):
    st.limiter.reset()
    anon = make_client()
    h = {"user-agent": UA_PHONE, "cf-ipcountry": "IN"}
    assert anon.post("/api/v1/track", json={"path": "/tools/youtube-money-calculator?x=1", "referrer": "https://www.google.com/search?q=yt"}, headers=h).status_code == 204
    anon.post("/api/v1/track", json={"path": "/tools", "referrer": "https://youtubebuddy.com/"}, headers=h)
    anon.post("/api/v1/track", json={"path": "/", "ref": "whatsapp"}, headers={"user-agent": UA_PC})
    anon.post("/api/v1/track", json={"path": "/edit/0e8f1c2a-1111-2222-3333-444455556666"}, headers={"user-agent": UA_PC})
    anon.post("/api/v1/track", json={"path": "/"}, headers={"user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"})   # bot: ignored

    # a normal account can't see the stats — the page doesn't even exist for it
    u = make_client()
    signup(u)
    assert u.get("/api/v1/admin/stats").status_code == 404
    assert anon.get("/api/v1/admin/stats").status_code == 401

    d = _admin(make_client).get("/api/v1/admin/stats?days=7").json()
    assert d["today"]["views"] >= 4 and len(d["series"]) == 7
    names = {x["name"] for x in d["sources"]}
    assert {"Google", "Whatsapp"} <= names or {"Google", "WhatsApp"} <= names
    assert any(p["name"] == "/tools/youtube-money-calculator" for p in d["pages"])        # query string dropped
    assert any(p["name"] == "/edit/:id" for p in d["pages"])                              # ids grouped
    assert {x["name"] for x in d["devices"]} >= {"phone", "computer"}
    assert any(c["name"] == "IN" for c in d["countries"])
    assert "No cookies" in d["privacy"]


def test_no_personal_data_stored(make_client, db_session=None):
    from app.db import session_factory
    st.limiter.reset()
    make_client().post("/api/v1/track", json={"path": "/about"}, headers={"user-agent": UA_PC})
    with session_factory()() as db:
        v = db.query(PageVisit).order_by(PageVisit.id.desc()).first()
        assert v.path == "/about" and len(v.visitor) == 16
        row = " ".join(str(getattr(v, c.name)) for c in PageVisit.__table__.columns)
        assert "127.0.0.1" not in row and "testclient" not in row and "Mozilla" not in row   # no IP or raw browser string


def test_same_visitor_counts_once_per_day(make_client):
    st.limiter.reset()
    c = make_client()
    for p in ("/a1", "/a2", "/a3"):
        c.post("/api/v1/track", json={"path": p}, headers={"user-agent": UA_PC + " unique-visitor-test"})
    d = _admin(make_client).get("/api/v1/admin/stats?days=1").json()
    a = [x for x in d["pages"] if x["name"] in ("/a1", "/a2", "/a3")]
    assert len(a) == 3 and all(x["visitors"] == 1 for x in a)


def test_signed_in_visit_is_marked(make_client):
    from app.db import session_factory
    st.limiter.reset()
    c = make_client()
    signup(c)
    c.post("/api/v1/track", json={"path": "/settings"}, headers={"user-agent": UA_PC})
    with session_factory()() as db:
        v = db.query(PageVisit).order_by(PageVisit.id.desc()).first()
        assert v.path == "/settings" and v.signed_in is True
