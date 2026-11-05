import logging
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from . import storage
from .config import get_settings
from .db import get_engine
from .routers import ai, auth, exports, media, projects, workspaces
from .security import csrf_guard

log = logging.getLogger("api")
logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","msg":"%(message)s"}')


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Creator Universe API", version="0.1.0", openapi_url="/api/v1/openapi.json", docs_url="/api/v1/docs")
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                       allow_headers=["content-type", "x-requested-with", "idempotency-key"])

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        t0 = time.perf_counter()
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "strict-origin-when-cross-origin"
        response.headers["x-frame-options"] = "DENY"
        # path only — never query strings (could contain tokens/signatures)
        log.info(f"rid={rid} {request.method} {request.url.path} {response.status_code} {1000 * (time.perf_counter() - t0):.0f}ms")
        return response

    deps = [Depends(csrf_guard)]
    for r in (ai.router, auth.router, workspaces.router, projects.router, media.router, exports.router):
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


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built web app from the same origin as the API (simplest secure cookie setup)."""
    import os
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles
    dist = os.environ.get("FRONTEND_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
    index = os.path.join(dist, "index.html")
    if not os.path.exists(index):
        return
    app.mount("/assets", StaticFiles(directory=os.path.join(dist, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        f = os.path.realpath(os.path.join(dist, path))
        if path and f.startswith(os.path.realpath(dist) + os.sep) and os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(index, headers={"cache-control": "no-cache"})


app = create_app()
