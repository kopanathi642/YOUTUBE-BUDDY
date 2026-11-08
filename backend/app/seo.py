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
SITEMAP = ["/", "/signup", "/privacy", "/terms"]

# Every path the web app knows. Anything else is a real 404 (no "soft 404" pages in Google's index).
_APP_ROUTES = re.compile(
    r"^/(|signin|signup|privacy|terms|universes|editor|editor/projects|ai-generator|ai-generator/explore|"
    r"ai-generator/studio/[^/]+|ai-generator/tool/[^/]+|super|library|channel|settings|home|projects|edit/[^/]+|ai-creation(/.*)?)/?$")


def known(path: str) -> bool:
    return bool(_APP_ROUTES.match(path))


def _abs(base: str, path: str) -> str:
    return base.rstrip("/") + path


def head_tags(path: str, brand: str, base: str) -> tuple[str, str]:
    """(title, extra <head> HTML) for a request path."""
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
    if path == "/":
        data = {
            "@context": "https://schema.org", "@type": "SoftwareApplication", "name": brand,
            "applicationCategory": "MultimediaApplication", "operatingSystem": "Web browser",
            "description": desc, "url": url, "image": img, "inLanguage": "en-IN",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR", "description": "Free plan"},
        }
        # "</" can't appear inside the JSON, so the script block can't be closed early by data
        tags.append('<script type="application/ld+json">' + json.dumps(data).replace("</", "<\\/") + "</script>")
    return full, "\n    ".join(tags)


def fallback_body(path: str, brand: str) -> str:
    """Plain HTML shown before the app starts (and to clients without JavaScript). React replaces it on load."""
    if path != "/":
        return ""
    b = html.escape(brand)
    return (f'<main style="max-width:720px;margin:64px auto;padding:0 16px;font-family:system-ui,sans-serif;color:#f3f5ef">'
            f"<h1>{b}: make one video, reach every language</h1>"
            f"<p>{html.escape(PUBLIC['/'][1])}</p>"
            '<ul><li>Multitrack video editor in the browser with colour grading, titles in Indian scripts and cloud export</li>'
            "<li>Automatic captions, translation and Hindi dubbing</li><li>Highlights, Shorts and smart 9:16 reframing</li></ul>"
            '<p><a href="/signup" style="color:#c3f53c">Create your free account</a> · <a href="/signin" style="color:#c3f53c">Sign in</a>'
            ' · <a href="/privacy" style="color:#9aa09a">Privacy</a> · <a href="/terms" style="color:#9aa09a">Terms</a></p></main>')


def render_index(template: str, path: str, brand: str, base: str) -> str:
    title, tags = head_tags(path, brand, base)
    out = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)}</title>\n    {tags}", template, count=1, flags=re.S)
    out = re.sub(r'\s*<meta name="description"[^>]*>', "", out, count=1) if path in PUBLIC else out
    body = fallback_body(path, brand)
    if body:
        out = out.replace('<div id="root"></div>', f'<div id="root">{body}</div>', 1)
    return out


def robots_txt(base: str) -> str:
    return "\n".join([
        "User-agent: *",
        "Allow: /$", "Allow: /signup", "Allow: /signin", "Allow: /privacy", "Allow: /terms", "Allow: /assets/", "Allow: /og.png",
        "Disallow: /api/", "Disallow: /edit/", "Disallow: /editor", "Disallow: /universes", "Disallow: /ai-generator",
        "Disallow: /super", "Disallow: /library", "Disallow: /channel", "Disallow: /settings",
        "", f"Sitemap: {_abs(base, '/sitemap.xml')}", "",
    ])


def sitemap_xml(base: str) -> str:
    urls = "".join(f"<url><loc>{html.escape(_abs(base, p))}</loc><changefreq>weekly</changefreq>"
                   f"<priority>{'1.0' if p == '/' else '0.5'}</priority></url>" for p in SITEMAP)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
