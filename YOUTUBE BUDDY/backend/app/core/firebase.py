"""
Production Firebase integration.

Used for:
  - Google Login / Firebase Auth token verification
  - Firebase Storage file uploads (when STORAGE_PROVIDER=firebase)

NOT used for: video processing, AI generation, or rendering.
"""
import logging
from pathlib import Path
from typing import Optional

from app.core.config import settings
from google.auth.transport import requests
from google.oauth2 import id_token as google_id_token

logger = logging.getLogger(__name__)

# ── Firebase Admin SDK (lazy init) ──────────────────────────────────────────

_firebase_app = None
_storage_bucket = None


def _init_firebase_admin():
    """Lazily initialise Firebase Admin SDK for storage operations."""
    global _firebase_app, _storage_bucket

    if _firebase_app is not None:
        return

    try:
        import firebase_admin
        from firebase_admin import credentials, storage

        if settings.FIREBASE_SERVICE_ACCOUNT_PATH:
            cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
        elif settings.FIREBASE_PRIVATE_KEY and settings.FIREBASE_CLIENT_EMAIL:
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": settings.FIREBASE_PROJECT_ID,
                "private_key": settings.FIREBASE_PRIVATE_KEY.replace("\\n", "\n"),
                "client_email": settings.FIREBASE_CLIENT_EMAIL,
                "token_uri": "https://oauth2.googleapis.com/token",
            })
        else:
            logger.warning(
                "Firebase Admin SDK credentials not configured. "
                "Storage operations will not be available."
            )
            return

        _firebase_app = firebase_admin.initialize_app(cred, {
            "storageBucket": settings.FIREBASE_STORAGE_BUCKET or f"{settings.FIREBASE_PROJECT_ID}.appspot.com",
        })
        _storage_bucket = storage.bucket(app=_firebase_app)
        logger.info("Firebase Admin SDK initialised | project=%s", settings.FIREBASE_PROJECT_ID)

    except ImportError:
        logger.error(
            "firebase-admin package not installed. "
            "Run: pip install firebase-admin"
        )
    except Exception as exc:
        logger.error("Failed to initialise Firebase Admin: %s", exc)


# ── Auth token verification ─────────────────────────────────────────────────

def verify_firebase_token(id_token_str: str) -> dict:
    if not settings.FIREBASE_PROJECT_ID:
        raise ValueError("FIREBASE_PROJECT_ID is not configured in backend/.env")

    project_id = settings.FIREBASE_PROJECT_ID
    request = requests.Request()
    try:
        payload = google_id_token.verify_firebase_token(
            id_token_str,
            request,
            audience=project_id
        )

        # Verify the issuer matches Firebase's expected format
        expected_iss = f"https://securetoken.google.com/{project_id}"
        if payload.get("iss") != expected_iss:
            # Fallback for standard Google tokens if they were used directly
            if payload.get("iss") not in ["accounts.google.com", "https://accounts.google.com"]:
                raise ValueError(f"Invalid token issuer: {payload.get('iss')}")

        logger.info(
            "Firebase token verified | uid=%s email=%s provider=%s",
            payload.get("sub"),
            payload.get("email"),
            payload.get("firebase", {}).get("sign_in_provider", "unknown"),
        )
        return payload
    except Exception as exc:
        logger.error(
            "Firebase token verification failed | project=%s error=%s",
            project_id, str(exc),
        )
        raise ValueError(f"Invalid Firebase token: {str(exc)}") from exc


# ── Firebase Storage operations ─────────────────────────────────────────────

def upload_file_to_firebase(local_path: str, destination_path: str) -> str:
    """
    Upload a local file to Firebase Storage.

    Returns the public download URL.
    """
    _init_firebase_admin()

    if _storage_bucket is None:
        raise RuntimeError(
            "Firebase Storage not configured. "
            "Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL "
            "in backend/.env"
        )

    blob = _storage_bucket.blob(destination_path)
    blob.upload_from_filename(local_path)
    blob.make_public()

    url = blob.public_url
    logger.info("Uploaded to Firebase Storage → %s", url)
    return url


def get_firebase_download_url(destination_path: str) -> str:
    """Get the public download URL for a Firebase Storage file."""
    _init_firebase_admin()

    if _storage_bucket is None:
        raise RuntimeError("Firebase Storage not configured")

    blob = _storage_bucket.blob(destination_path)
    if blob.exists():
        blob.make_public()
        return blob.public_url

    raise FileNotFoundError(f"Firebase Storage file not found: {destination_path}")


def delete_firebase_file(destination_path: str) -> bool:
    """Delete a file from Firebase Storage."""
    _init_firebase_admin()

    if _storage_bucket is None:
        raise RuntimeError("Firebase Storage not configured")

    blob = _storage_bucket.blob(destination_path)
    if blob.exists():
        blob.delete()
        logger.info("Deleted from Firebase Storage: %s", destination_path)
        return True
    return False
