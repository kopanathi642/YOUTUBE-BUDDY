"""Free public tools: work without an account, are rate-limited, and every tool page is known to search engines."""
import re
from pathlib import Path

from app import channel_insights as ci, seo
from app.routers import public_tools as pt


def test_seo_catalog_matches_the_web_app():
    ts = (Path(__file__).parents[2] / "frontend/src/tools/catalog.ts").read_text()
    slugs = re.findall(r'slug: "([a-z0-9-]+)"', ts)
    assert slugs and set(slugs) == set(seo.TOOLS)
    for s in slugs:
        assert f'title: "{seo.TOOLS[s][0]}"' in ts, s
        assert seo.known(f"/tools/{s}") and f"/tools/{s}" in seo.SITEMAP
    assert not seo.known("/tools/made-up") and "Allow: /tools" in seo.robots_txt("https://x")


def test_tool_pages_are_indexable_html(make_client):
    c = make_client()
    r = c.get("/tools/youtube-money-calculator")
    if r.status_code == 200 and "<html" in r.text.lower():   # only when a built web app is present
        assert "YouTube Money Calculator" in r.text and 'rel="canonical"' in r.text and "noindex" not in r.text
        assert c.get("/tools/made-up").status_code == 404


def test_keywords_without_account(make_client, monkeypatch):
    calls = []

    class R:
        status_code = 200

        def __init__(self, q):
            self.content = ('["%s", ["%s vlog", "%s food", "%s"]]' % (q, q, q, q)).encode()
    monkeypatch.setattr(pt.httpx, "get", lambda url, params, **kw: calls.append(params["q"]) or R(params["q"]))
    pt._cache.clear(); pt.limiter.reset()
    c = make_client()   # not signed in
    r = c.get("/api/v1/public/keywords", params={"q": "  Goa   Trip "})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["query"] == "goa trip" and d["total"] >= 3 and d["groups"][0]["items"][0] == "goa trip vlog"
    assert "how to goa trip" in calls
    n = len(calls)
    c.get("/api/v1/public/keywords", params={"q": "goa trip"})
    assert len(calls) == n   # cached


def test_channel_and_audit_without_account(make_client, monkeypatch):
    from app import growth_engine as ge
    from datetime import datetime, timedelta, timezone
    cid = "UC" + "d" * 22
    vids = [{"id": f"x{i}", "title": f"Video {i}", "published_at": datetime.now(timezone.utc) - timedelta(days=5 + 3 * i),
             "views": 1000 + i, "likes": 5, "description": ""} for i in range(8)]
    monkeypatch.setattr(ge, "fetch_feed", lambda c: {"title": "Demo", "videos": vids})
    pt._cache.clear(); ci._cache.clear(); pt.limiter.reset()
    c = make_client()
    r = c.get("/api/v1/public/channel", params={"ref": f"https://www.youtube.com/channel/{cid}"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["id"] == cid and d["rss"].endswith(cid) and len(d["videos"]) == 8 and d["videos"][0]["url"].startswith("https://www.youtube.com/watch?v=")
    a = c.get("/api/v1/public/audit", params={"ref": cid})
    assert a.status_code == 200 and a.json()["source"] == "public"
    assert c.get("/api/v1/public/channel", params={"ref": "%%%"}).status_code == 422


def test_rate_limited(make_client, monkeypatch):
    monkeypatch.setattr(pt, "limiter", pt.RateLimiter(limit=2, window_s=60))
    monkeypatch.setattr(ci, "resolve_channel", lambda ref: (_ for _ in ()).throw(ci.youtube.YouTubeError("x")))
    c = make_client()
    codes = [c.get("/api/v1/public/channel", params={"ref": "abc"}).status_code for _ in range(3)]
    assert codes == [422, 422, 429]


def test_every_tool_page_renders_even_with_unicode_in_its_data():
    tpl = "<html><head><title>x</title></head><body><div id=\"root\"></div></body></html>"
    for slug in seo.TOOLS:
        out = seo.render_index(tpl, f"/tools/{slug}", "Brand", "https://youtubebuddy.com")
        assert seo.TOOLS[slug][0] in out and "application/ld+json" in out


def test_indexnow_key_file_and_payload(make_client, monkeypatch):
    from app import indexnow
    sent = {}

    class R:
        status_code = 202
    monkeypatch.setattr(indexnow.httpx, "post", lambda url, json, timeout: sent.update(json) or R())
    assert indexnow.submit("https://youtubebuddy.com") == 202
    assert sent["host"] == "youtubebuddy.com" and sent["keyLocation"] == f"https://youtubebuddy.com/{indexnow.key()}.txt"
    assert "https://youtubebuddy.com/tools/youtube-money-calculator" in sent["urlList"]


def test_home_has_organization_data():
    _, tags = seo.head_tags("/", "Brand", "https://youtubebuddy.com")
    assert '"@type": "Organization"' in tags and '"@type": "WebSite"' in tags


def test_keywords_in_indian_language_skip_english_addons(make_client, monkeypatch):
    calls = []

    class R:
        status_code = 200

        def __init__(self, q):
            self.content = ('["%s", ["%s 1"]]' % (q, q)).encode()
    monkeypatch.setattr(pt.httpx, "get", lambda url, params, **kw: calls.append((params["q"], params["hl"])) or R(params["q"]))
    pt._cache.clear(); pt.limiter.reset()
    r = make_client().get("/api/v1/public/keywords", params={"q": "गोवा यात्रा", "lang": "hi"})
    assert r.status_code == 200 and all(hl == "hi" for _, hl in calls) and not any(q.startswith("how to") for q, _ in calls)


def test_growth_tools_accept_handles(monkeypatch):
    from app import growth_engine as ge
    monkeypatch.setattr(ci, "resolve_channel", lambda ref: "UC" + "e" * 22 if "@" in ref else (_ for _ in ()).throw(ci.youtube.YouTubeError("bad")))
    assert ge.parse_channel_ref("youtube.com/@AnimalKids") == "UC" + "e" * 22
    import pytest
    with pytest.raises(ge.GrowthError):
        ge.parse_channel_ref("nope nope")


def test_search_name_about_page_and_alternate_names():
    t, tags = seo.head_tags("/", "Creator Universe", "https://youtubebuddy.com")
    assert t.startswith("YouTube Buddy (youtubebuddy.com)") and '"alternateName"' in tags and "youtubebuddy" in tags
    assert seo.known("/about") and "/about" in seo.SITEMAP and "Allow: /about" in seo.robots_txt("https://x")
    body = seo.fallback_body("/about", "B")
    assert all(n in body for n, _ in seo.SERVICES)
