"""Runtime configuration. Every secret comes from environment variables / the host's secret manager."""
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"  # development | test | staging | production
    database_url: str = "postgresql+psycopg://creator:creator@localhost:5432/creator"

    # S3-compatible object storage (Cloudflare R2 in production, moto/MinIO locally)
    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_public_endpoint_url: str | None = None  # endpoint the *browser* uses for signed URLs (defaults to s3_endpoint_url)
    s3_region: str = "auto"
    s3_access_key_id: str = "dev-access-key"
    s3_secret_access_key: str = "dev-secret-key"
    s3_bucket: str = "creator-media-dev"
    signed_url_ttl_seconds: int = 900

    # Firebase Authentication (Google sign-in). Web config values are public identifiers, not secrets.
    firebase_project_id: str | None = None
    firebase_api_key: str | None = None
    firebase_auth_domain: str | None = None
    firebase_app_id: str | None = None

    # Product name shown in the app. Change in one place (env BRAND_NAME) — see DEPLOYMENT.md naming warning.
    brand_name: str = "Creator Universe"

    # Web
    cors_origins: str = "http://localhost:5173"
    session_cookie_name: str = "cu_session"
    session_ttl_hours: int = 24 * 14
    cookie_secure: bool = False
    ai_daily_budget_usd: float = 10.0   # max estimated spend on PAID AI models per workspace per day (UTC); 0 = paid models off
    ai_daily_paid_runs: int = 200
    ai_runs_per_10min: int = 60          # per-user AI run rate limit
    uploads_per_10min: int = 120         # per-user upload rate limit       # max paid-model runs per workspace per day, even when the cost estimate is unknown
    # Billing (UPI QR + manual approval). Platform admins approve payments; list their emails, comma-separated.
    admin_emails: str = ""
    free_plan_paid_runs: int = 5         # paid AI runs per workspace per day on the Free plan (paid plans use their own limits)
    # YouTube publishing: a free Google Cloud OAuth client (YouTube Data API v3). Tokens are encrypted at rest.
    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None
    public_base_url: str = "http://localhost:8000"   # where Google sends users back after connecting YouTube
    token_encryption_key: str | None = None           # Fernet key; required in production for YouTube tokens
    cookie_samesite: str = "lax"  # use "none" (+ secure) only when frontend and API are on different sites

    # Upload limits (plan entitlements will replace these once billing exists)
    max_upload_bytes: int = 20 * 1024**3
    multipart_part_size: int = 16 * 1024**2

    # Worker
    worker_poll_seconds: float = 1.0
    job_lease_seconds: int = 60
    max_export_seconds: int = 60 * 60  # longest timeline we will render
    max_concurrent_exports_per_workspace: int = 2
    scratch_dir: str = "/tmp/creator-worker"

    @field_validator("database_url")
    @classmethod
    def _driver(cls, v: str) -> str:
        # Hosts (Render, Neon, Supabase…) hand out postgres:// URLs; SQLAlchemy needs the psycopg driver named.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
