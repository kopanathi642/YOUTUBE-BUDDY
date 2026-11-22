"""Search-engine and link-preview friendliness for the single-page app.

Crawlers and chat apps (WhatsApp, X, Facebook) often read the raw HTML without running JavaScript, so the server
writes the right title, description, canonical URL, Open Graph/Twitter tags, robots rule and structured data into
index.html for every page. Public pages are indexable; signed-in pages are `noindex`. Unknown paths get a real 404.
The brand comes from BRAND_NAME and absolute URLs from PUBLIC_BASE_URL, so a rename needs no code change.
"""
from __future__ import annotations

import html
import json
import re

PUBLIC = {
    "/": ("Video editor & AI studio for creators",
          "Edit videos in your browser, add captions automatically, dub into Hindi and other languages, and turn long "
          "videos into Shorts. Free to start, pay by UPI."),
    "/signup": ("Create your free account", "Start editing in your browser for free: captions, dubbing, Shorts and cloud export."),
    "/signin": ("Sign in", "Sign in to your video editor and AI studio."),
    "/privacy": ("Privacy policy", "How we handle your account, uploads and payments."),
    "/terms": ("Terms of service", "The rules for using the editor and AI tools."),
}
# Free public tools (/tools/<slug>): (title, description). Keep in sync with frontend/src/tools/catalog.ts (a test checks).
TOOLS = {
    "youtube-channel-audit": ("Free YouTube Channel Audit", "Paste your channel link and see what works: best upload day and time, title words that get views, and an estimate for your next video."),
    "youtube-money-calculator": ("YouTube Money Calculator (India)", "Estimate how much a YouTube video or channel can earn in rupees from views, for long videos and Shorts."),
    "youtube-monetization-checker": ("YouTube Monetization Checker", "Check if your channel meets YouTube Partner Programme rules: 500 or 1,000 subscribers, watch hours or Shorts views."),
    "youtube-engagement-calculator": ("YouTube Engagement Rate Calculator", "Work out the engagement rate of a video or channel from views, likes and comments."),
    "youtube-watch-time-calculator": ("YouTube Watch Time Calculator", "Turn views and average view duration into watch hours and see how far you are from 4,000 hours."),
    "youtube-keyword-research": ("Free YouTube Keyword Research Tool", "See what people really search on YouTube in India around your topic, from YouTube's own search suggestions."),
    "youtube-hashtag-generator": ("YouTube Hashtag Generator", "Get relevant hashtags for your video or Short from real YouTube search phrases."),
    "youtube-channel-id-finder": ("YouTube Channel ID Finder", "Find the UC… channel ID of any YouTube channel from its link or @handle."),
    "youtube-channel-video-links": ("YouTube Channel Video Links Extractor", "Get the links of a channel's latest uploads in one list, ready to copy."),
    "youtube-rss-feed-generator": ("YouTube RSS Feed Generator", "Get the RSS feed link of any YouTube channel to follow new uploads in a feed reader."),
    "youtube-thumbnail-downloader": ("YouTube Thumbnail Downloader", "Get the full-size thumbnail of any YouTube video in HD, SD and smaller sizes."),
    "youtube-timestamp-link-generator": ("YouTube Timestamp Link Generator", "Make a YouTube link that starts the video at an exact minute and second."),
    "youtube-subscribe-link-generator": ("YouTube Subscribe Link Generator", "Make a link that opens your channel with the subscribe pop-up, for bios and descriptions."),
    "youtube-embed-code-generator": ("YouTube Embed Code Generator", "Make the embed code for a YouTube video with start time, autoplay, loop and privacy-enhanced mode."),
}
PUBLIC["/tools"] = ("Free YouTube tools for creators", "Free YouTube tools: channel audit, money and monetization calculators, keyword research, hashtags, thumbnail downloader and link generators. No sign-up.")
for _slug, (_t, _d) in TOOLS.items():
    PUBLIC[f"/tools/{_slug}"] = (_t, _d)
SITEMAP = ["/", "/tools", *[f"/tools/{k}" for k in TOOLS], "/signup", "/privacy", "/terms"]

# Every path the web app knows. Anything else is a real 404 (no "soft 404" pages in Google's index).
_APP_ROUTES = re.compile(
    r"^/(|signin|signup|privacy|terms|tools|tools/[a-z0-9-]+|universes|editor|editor/projects|ai-generator|ai-generator/explore|"
    r"ai-generator/studio/[^/]+|ai-generator/tool/[^/]+|super|library|channel|growth|settings|shorts/[^/]+|home|projects|edit/[^/]+|ai-creation(/.*)?)/?$")


def known(path: str) -> bool:
    if path.rstrip("/").startswith("/tools/"):
        return path.rstrip("/")[len("/tools/"):] in TOOLS
    return bool(_APP_ROUTES.match(path))


def _abs(base: str, path: str) -> str:
    return base.rstrip("/") + path


def _verification() -> str:
    """Google Search Console / Bing ownership tags (public tokens, set in the server env)."""
    import os
    out = []
    for env, name in (("GOOGLE_SITE_VERIFICATION", "google-site-verification"), ("BING_SITE_VERIFICATION", "msvalidate.01")):
        v = re.sub(r"[^A-Za-z0-9_\-]", "", os.environ.get(env, ""))[:100]
        if v:
            out.append(f'<meta name="{name}" content="{v}">')
    return "".join(out)


def head_tags(path: str, brand: str, base: str) -> tuple[str, str]:
    """(title, extra <head> HTML) for a request path."""
    title, tags = _head_tags(path, brand, base)
    return title, (_verification() + "\n    " + tags) if path == "/" and _verification() else tags


def _head_tags(path: str, brand: str, base: str) -> tuple[str, str]:
    e = lambda v: html.escape(v, quote=True)  # noqa: E731
    if not known(path):
        return f"Page not found · {brand}", '<meta name="robots" content="noindex">'
    if path not in PUBLIC:
        return brand, '<meta name="robots" content="noindex, nofollow">'
    title, desc = PUBLIC[path]
    full = f"{brand} — {title}" if path == "/" else f"{title} · {brand}"
    url = _abs(base, path)
    img = _abs(base, "/og.png")
    tags = [
        f'<meta name="description" content="{e(desc)}">',
        f'<link rel="canonical" href="{e(url)}">',
        '<meta name="robots" content="index, follow, max-image-preview:large">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{e(brand)}">',
        f'<meta property="og:title" content="{e(full)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:url" content="{e(url)}">',
        f'<meta property="og:image" content="{e(img)}">',
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
        '<meta property="og:locale" content="en_IN">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{e(full)}">',
        f'<meta name="twitter:description" content="{e(desc)}">',
        f'<meta name="twitter:image" content="{e(img)}">',
    ]
    if path.startswith("/tools/"):
        data = {"@context": "https://schema.org", "@type": "WebApplication", "name": title, "url": url, "description": desc,
                "applicationCategory": "UtilitiesApplication", "operatingSystem": "Web browser", "inLanguage": "en-IN",
                "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"},
                "publisher": {"@type": "Organization", "name": brand, "url": _abs(base, "/")}}
        tags.append('<script type="application/ld+json">' + json.dumps(data).replace("</", "<\\/") + "</script>")
    if path == "/":
        data = {
            "@context": "https://schema.org", "@type": "SoftwareApplication", "name": brand,
            "applicationCategory": "MultimediaApplication", "operatingSystem": "Web browser",
            "description": desc, "url": url, "image": img, "inLanguage": "en-IN",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR", "description": "Free plan"},
        }
        org = {"@context": "https://schema.org", "@type": "Organization", "name": brand, "url": url, "logo": _abs(base, "/og.png"),
               "description": "Free YouTube tools and a browser video editor for creators in India.", "areaServed": "IN"}
        site = {"@context": "https://schema.org", "@type": "WebSite", "name": brand, "url": url, "inLanguage": "en-IN"}
        # "</" can't appear inside the JSON, so the script block can't be closed early by data
        for d in (data, org, site):
            tags.append('<script type="application/ld+json">' + json.dumps(d).replace("</", "<\\/") + "</script>")
    return full, "\n    ".join(tags)


def fallback_body(path: str, brand: str) -> str:
    """Plain HTML shown before the app starts (and to clients without JavaScript). React replaces it on load."""
    b = html.escape(brand)
    if path == "/tools" or path.startswith("/tools/"):
        head = PUBLIC.get(path.rstrip("/"), PUBLIC["/tools"])
        items = "".join(f'<li><a href="/tools/{k}" style="color:#c3f53c">{html.escape(t)}</a> — {html.escape(d)}</li>' for k, (t, d) in TOOLS.items())
        return (f'<main style="max-width:760px;margin:64px auto;padding:0 16px;font-family:system-ui,sans-serif;color:#f3f5ef">'
                f"<h1>{html.escape(head[0])}</h1><p>{html.escape(head[1])}</p><h2>All free tools from {b}</h2><ul>{items}</ul>"
                '<p><a href="/" style="color:#c3f53c">Home</a> · <a href="/signup" style="color:#c3f53c">Create a free account</a></p></main>')
    if path != "/":
        return ""
    return (f'<main style="max-width:720px;margin:64px auto;padding:0 16px;font-family:system-ui,sans-serif;color:#f3f5ef">'
            f"<h1>{b}: make one video, reach every language</h1>"
            f"<p>{html.escape(PUBLIC['/'][1])}</p>"
            '<ul><li>Multitrack video editor in the browser with colour grading, titles in Indian scripts and cloud export</li>'
            "<li>Automatic captions, translation and Hindi dubbing</li><li>Highlights, Shorts and smart 9:16 reframing</li></ul>"
            '<p><a href="/tools" style="color:#c3f53c">Free YouTube tools</a> · <a href="/signup" style="color:#c3f53c">Create your free account</a> · <a href="/signin" style="color:#c3f53c">Sign in</a>'
            ' · <a href="/privacy" style="color:#9aa09a">Privacy</a> · <a href="/terms" style="color:#9aa09a">Terms</a></p></main>')


def render_index(template: str, path: str, brand: str, base: str) -> str:
    title, tags = head_tags(path, brand, base)
    head = f"<title>{html.escape(title)}</title>\n    {tags}"
    out = re.sub(r"<title>.*?</title>", lambda _m: head, template, count=1, flags=re.S)   # a function: backslashes in data (\u2026) stay literal
    out = re.sub(r'\s*<meta name="description"[^>]*>', "", out, count=1) if path in PUBLIC else out
    body = fallback_body(path, brand)
    if body:
        out = out.replace('<div id="root"></div>', f'<div id="root">{body}</div>', 1)
    return out


def robots_txt(base: str) -> str:
    return "\n".join([
        "User-agent: *",
        "Allow: /$", "Allow: /tools", "Allow: /signup", "Allow: /signin", "Allow: /privacy", "Allow: /terms", "Allow: /assets/", "Allow: /og.png",
        "Disallow: /api/", "Disallow: /edit/", "Disallow: /editor", "Disallow: /universes", "Disallow: /ai-generator",
        "Disallow: /super", "Disallow: /library", "Disallow: /channel", "Disallow: /growth", "Disallow: /shorts", "Disallow: /settings",
        "", f"Sitemap: {_abs(base, '/sitemap.xml')}", "",
    ])


def sitemap_xml(base: str) -> str:
    urls = "".join(f"<url><loc>{html.escape(_abs(base, p))}</loc><changefreq>weekly</changefreq>"
                   f"<priority>{'1.0' if p == '/' else ('0.8' if p.startswith('/tools') else '0.5')}</priority></url>" for p in SITEMAP)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
