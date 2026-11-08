"""Channel insights: rule-based analysis (pure) and the endpoint against the fake Google server."""
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from app import channel_insights as ci
from tests.test_editor_flow import signup
from tests.test_youtube import Fake, google  # noqa: F401  (fixture)

NOW = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)


def _vid(i, days_ago, views, title, dur="PT10M", hour_utc=13):
    pub = (NOW - timedelta(days=days_ago)).replace(hour=hour_utc, minute=0)
    return {"id": f"v{i}", "title": title, "published_at": pub.isoformat().replace("+00:00", "Z"), "thumbnail": None,
            "duration_s": ci._duration_s(dur), "views": views, "likes": views // 20, "comments": views // 100}


def _data(n=12):
    vids = []
    for i in range(n):
        days = 4 + i * 7                                  # weekly uploads
        goa = i % 3 == 0
        vids.append(_vid(i, days, 9000 if goa else 3000 + 100 * i, ("Goa travel vlog " if goa else "Daily routine ") + str(i)))
    vids.append(_vid(99, 1, 50, "Brand new upload"))      # too young: not in the estimates
    return {"channel": {"id": "UC1", "title": "T", "thumbnail": None, "subscribers": 1000, "views": 1, "videos": n + 1}, "videos": vids}


def test_duration_parser():
    assert ci._duration_s("PT1H2M3S") == 3723 and ci._duration_s("PT45S") == 45 and ci._duration_s("P1DT1S") == 86401 and ci._duration_s("") == 0


def test_not_enough_videos_says_so():
    out = ci.analyze({"channel": {}, "videos": _data(3)["videos"]}, now=NOW)
    assert out["enough_data"] is False and "at least 5" in out["message"] and "next_video" not in out


def test_analysis_is_from_own_history():
    out = ci.analyze(_data(), now=NOW)
    assert out["enough_data"] and out["mature_videos"] == 12 and out["analysed_videos"] == 13
    nv = out["next_video"]
    assert nv["low"] <= nv["typical"] <= nv["high"] and nv["format"] == "Long video" and nv["based_on"] == 12
    strong = {k["word"] for k in out["title_words"]["strong"]}
    assert {"goa", "travel", "vlog"} <= strong and "daily" not in strong
    assert out["top_videos"][0]["views"] == 9000 and any("Goa" in i for i in out["ideas"])
    assert out["summary"]["upload_every_days"] == 7.0
    assert out["recent"][0]["id"] == "v99" and "estimates" in out["method"]
    assert any("goa" in t for t in out["tips"])


def test_endpoint(make_client, google, monkeypatch):  # noqa: F811
    seen = []
    orig = Fake.do_GET

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        seen.append(u.path)
        if u.path == "/channels" and "statistics" in q.get("part", [""])[0]:
            assert self.headers["authorization"] == "Bearer at2"
            return self._json(200, {"items": [{"id": "UC123", "snippet": {"title": "Bhargav Vlogs"}, "statistics": {"subscriberCount": "1200", "viewCount": "90000", "videoCount": "13"},
                                               "contentDetails": {"relatedPlaylists": {"uploads": "UU123"}}}]})
        if u.path == "/playlistItems":
            assert q["playlistId"] == ["UU123"]
            return self._json(200, {"items": [{"contentDetails": {"videoId": v["id"]}} for v in _data()["videos"]]})
        if u.path == "/videos":
            now = datetime.now(timezone.utc)
            items = [{"id": v["id"], "snippet": {"title": v["title"], "publishedAt": (now - (NOW - datetime.fromisoformat(v["published_at"].replace("Z", "+00:00")))).isoformat()},
                      "statistics": {"viewCount": str(v["views"]), "likeCount": "1", "commentCount": "0"}, "contentDetails": {"duration": "PT10M"}}
                     for v in _data()["videos"]]
            return self._json(200, {"items": items})
        return orig(self)
    monkeypatch.setattr(Fake, "do_GET", do_GET)
    c = make_client(); signup(c)
    assert c.get("/api/v1/youtube/insights").status_code == 409                 # not connected
    r = c.get("/api/v1/youtube/connect", params={"back": "channel"})
    q = parse_qs(urlparse(r.json()["url"]).query)
    assert "youtube.readonly" in q["scope"][0]
    for k in ("yt_oauth_state", "yt_oauth_back"):
        c.cookies.set(k, r.cookies.get(k), path="/api/v1/youtube")
    r3 = c.get("/api/v1/youtube/callback", params={"code": "good-code", "state": q["state"][0]}, follow_redirects=False)
    assert r3.headers["location"] == "/channel?youtube=connected"
    d = c.get("/api/v1/youtube/insights", params={"tz": "Not/AZone"}).json()
    assert d["channel"]["subscribers"] == 1200 and d["enough_data"] and d["timezone"] == "Asia/Kolkata"
    assert d["next_video"]["typical"] > 0 and json.dumps(d).count("rt-secret") == 0
    n = len(seen)
    c.get("/api/v1/youtube/insights")                                          # cached: no new Google calls
    assert len(seen) == n
    other = make_client(); signup(other)
    assert other.get("/api/v1/youtube/insights").status_code == 409            # another user sees nothing
