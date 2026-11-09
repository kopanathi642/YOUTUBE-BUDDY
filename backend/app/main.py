import os
import logging
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import text

from . import storage
from .config import get_settings
from .db import get_engine
from .routers import tools, ai, auth, billing, dubbing, exports, growth, growth_studio, media, projects, stock, workspaces, youtube
from .security import csrf_guard

log = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","msg":"%(message)s"}')


def create_app() -> FastAPI:
    s = get_settings()
    prod = s.env == "production"
    # The interactive API docs are a development aid; in production they are switched off.
    app = FastAPI(title="Creator Universe API", version="0.1.0", openapi_url=None if prod else "/api/v1/openapi.json",
                  docs_url=None if prod else "/api/v1/docs", redoc_url=None)
    csp = content_security_policy(s)
    hsts = s.cookie_secure or prod
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                       allow_headers=["content-type", "x-requested-with", "idempotency-key"])

    canonical = s.public_base_url.rstrip("/")
    www_host = "www." + canonical.split("://", 1)[-1]

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        # one address for users and Google: www.<domain> → <domain> (keeps uploads/cookies on one origin too)
        if prod and canonical.startswith("https://") and request.headers.get("host", "").lower() == www_host:
            q = f"?{request.url.query}" if request.url.query else ""
            return RedirectResponse(canonical + request.url.path + q, status_code=301)
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        t0 = time.perf_counter()
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "strict-origin-when-cross-origin"
        response.headers["x-frame-options"] = "DENY"
        response.headers["permissions-policy"] = "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()"
        response.headers["cross-origin-opener-policy"] = "same-origin-allow-popups"  # Google sign-in uses a popup
        if request.url.path.startswith("/api/"):
            response.headers["x-robots-tag"] = "noindex"
        if not request.url.path.startswith("/api/v1/docs"):
            response.headers["content-security-policy"] = csp
        if hsts:
            response.headers["strict-transport-security"] = "max-age=31536000; includeSubDomains"
        # path only — never query strings (could contain tokens/signatures)
        log.info(f"rid={rid} {request.method} {request.url.path} {response.status_code} {1000 * (time.perf_counter() - t0):.0f}ms")
        return response

    deps = [Depends(csrf_guard)]
    for r in (ai.router, auth.router, workspaces.router, projects.router, media.router, exports.router, tools.router, stock.router, billing.router, youtube.router, growth.router, dubbing.router, growth_studio.router):
        app.include_router(r, prefix="/api/v1", dependencies=deps)

    @app.get("/api/v1/health")
    def health():
        checks = {}
        try:
            with get_engine().connect() as c:
                c.execute(text("select 1"))
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "error"
        try:
            storage.client().head_bucket(Bucket=storage.bucket())
            checks["storage"] = "ok"
        except Exception:
            checks["storage"] = "error"
        ok = all(v == "ok" for v in checks.values())
        return JSONResponse({"status": "ok" if ok else "degraded", "checks": checks}, status_code=200 if ok else 503)

    _mount_frontend(app)
    return app


def content_security_policy(s) -> str:
    """Only our own code may run. Media, uploads and downloads may also talk to the private storage endpoint;
    Google sign-in may talk to Firebase/Google. Everything else (injected scripts, foreign frames) is blocked."""
    from urllib.parse import urlparse
    storage = ""
    ep = s.s3_public_endpoint_url or s.s3_endpoint_url
    if ep:
        u = urlparse(ep)
        if u.scheme and u.netloc:
            storage = f" {u.scheme}://{u.netloc}"
    google = ""
    if s.firebase_project_id:
        auth = s.firebase_auth_domain or f"{s.firebase_project_id}.firebaseapp.com"
        google = (" https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com"
                  " https://apis.google.com"), auth
    g_connect, g_auth = google if google else ("", "")
    # third-party images the UI shows directly, allowed only when that service is configured
    ext_img = ""
    if os.environ.get("PEXELS_API_KEY"):
        ext_img += " https://images.pexels.com"
    if os.environ.get("PIXABAY_API_KEY"):
        ext_img += " https://cdn.pixabay.com https://i.vimeocdn.com"
    if s.google_oauth_client_id:   # channel page: video thumbnails and channel avatars
        ext_img += " https://i.ytimg.com https://yt3.ggpht.com"
    return "; ".join([
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        f"script-src 'self'{' https://apis.google.com https://www.gstatic.com' if g_auth else ''}",
        "style-src 'self' 'unsafe-inline'",   # React inline style attributes
        f"img-src 'self' data: blob:{storage}{' https://lh3.googleusercontent.com' if g_auth else ''}{ext_img}",
        f"media-src 'self' data: blob:{storage}",
        "font-src 'self' data:",
        f"connect-src 'self'{storage}{g_connect}",
        f"frame-src {('https://' + g_auth) if g_auth else chr(39) + 'none' + chr(39)}",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
    ])


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built web app from the same origin as the API (simplest secure cookie setup)."""
    import os
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles
    dist = os.environ.get("FRONTEND_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
    index = os.path.join(dist, "index.html")
    if not os.path.exists(index):
        return
    from fastapi.responses import HTMLResponse, PlainTextResponse, Response
    from . import seo
    app.mount("/assets", StaticFiles(directory=os.path.join(dist, "assets")), name="assets")
    s = get_settings()
    cached = {"mtime": None, "html": ""}

    def template() -> str:
        """index.html, re-read when a new build replaces it (asset file names change on every build)."""
        m = os.path.getmtime(index)
        if m != cached["mtime"]:
            cached["html"], cached["mtime"] = open(index, encoding="utf-8").read(), m
        return cached["html"]

    @app.get("/robots.txt", include_in_schema=False)
    def robots():
        return PlainTextResponse(seo.robots_txt(s.public_base_url))

    @app.get("/sitemap.xml", include_in_schema=False)
    def sitemap():
        return Response(seo.sitemap_xml(s.public_base_url), media_type="application/xml")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        f = os.path.realpath(os.path.join(dist, path))
        if path and f.startswith(os.path.realpath(dist) + os.sep) and os.path.isfile(f):
            return FileResponse(f)
        route = "/" + path
        page = seo.render_index(template(), route, s.brand_name, s.public_base_url)
        # Unknown paths still get the app (it shows "Page not found") but with a real 404 status for crawlers.
        return HTMLResponse(page, status_code=200 if seo.known(route) else 404, headers={"cache-control": "no-cache"})


app = create_app()
