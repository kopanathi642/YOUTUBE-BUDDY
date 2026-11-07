"""Google-friendly HTML: per-page metadata, noindex on private pages, real 404s, robots.txt and sitemap."""
from app import seo

TEMPLATE = ('<!doctype html><html><head><meta name="description" content="x" /><title>T</title></head>'
            '<body><div id="root"></div></body></html>')


def test_public_page_gets_title_canonical_preview_and_structured_data():
    out = seo.render_index(TEMPLATE, "/", "Clip Studio", "https://clip.example")
    assert "<title>Clip Studio — Video editor &amp; AI studio for creators</title>" in out
    assert '<link rel="canonical" href="https://clip.example/">' in out
    assert '<meta property="og:image" content="https://clip.example/og.png">' in out
    assert '"@type": "SoftwareApplication"' in out and "index, follow" in out
    assert out.count('name="description"') == 1                 # template's generic description replaced
    assert "<h1>Clip Studio: make one video" in out              # crawlable text before the app starts


def test_private_and_unknown_pages_are_not_indexed():
    assert 'content="noindex, nofollow"' in seo.render_index(TEMPLATE, "/edit/abc", "B", "https://x")
    assert "og:title" not in seo.render_index(TEMPLATE, "/settings", "B", "https://x")
    assert seo.known("/ai-generator/tool/024") and seo.known("/edit/123/") and not seo.known("/wp-admin")
    assert 'content="noindex"' in seo.render_index(TEMPLATE, "/nope", "B", "https://x")


def test_brand_is_escaped():
    out = seo.render_index(TEMPLATE, "/", 'A"<script>', "https://x")
    assert "<script>" not in out.split("application/ld+json")[0]


def test_robots_and_sitemap():
    r = seo.robots_txt("https://clip.example")
    assert "Disallow: /api/" in r and "Disallow: /edit/" in r and "Sitemap: https://clip.example/sitemap.xml" in r
    sm = seo.sitemap_xml("https://clip.example")
    assert "<loc>https://clip.example/</loc>" in sm and "/settings" not in sm
