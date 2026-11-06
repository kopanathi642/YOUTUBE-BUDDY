"""YouTube publishing through the founder's own (free) Google Cloud OAuth client and the YouTube Data API v3.
All Google URLs can be overridden by env vars so tests can run against a fake server."""
from __future__ import annotations

import base64
import hashlib
import os
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings

SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"


def _u(name: str, default: str) -> str:
    return os.environ.get(name) or default


AUTH_URL = lambda: _u("GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth")          # noqa: E731
TOKEN_URL = lambda: _u("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token")                   # noqa: E731
REVOKE_URL = lambda: _u("GOOGLE_REVOKE_URL", "https://oauth2.googleapis.com/revoke")                # noqa: E731
API_URL = lambda: _u("YOUTUBE_API_URL", "https://www.googleapis.com/youtube/v3")                    # noqa: E731
UPLOAD_URL = lambda: _u("YOUTUBE_UPLOAD_URL", "https://www.googleapis.com/upload/youtube/v3/videos")  # noqa: E731


class YouTubeError(Exception):
    pass


def _fernet() -> Fernet | None:
    s = get_settings()
    if s.token_encryption_key:
        try:
            return Fernet(s.token_encryption_key.encode())
        except ValueError:   # any other random secret (e.g. a host-generated value): derive a Fernet key from it
            return Fernet(base64.urlsafe_b64encode(hashlib.sha256(s.token_encryption_key.encode()).digest()))
    if s.env in ("development", "test"):   # dev only: a fixed local key so the feature can be tried without setup
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"dev-only-youtube-token-key").digest()))
    return None


def missing() -> list[str]:
    s = get_settings()
    need = []
    if not s.google_oauth_client_id:
        need.append("GOOGLE_OAUTH_CLIENT_ID")
    if not s.google_oauth_client_secret:
        need.append("GOOGLE_OAUTH_CLIENT_SECRET")
    if _fernet() is None:
        need.append("TOKEN_ENCRYPTION_KEY")
    return need


def redirect_uri() -> str:
    return get_settings().public_base_url.rstrip("/") + "/api/v1/youtube/callback"


def auth_url(state: str) -> str:
    s = get_settings()
    return AUTH_URL() + "?" + urlencode({"client_id": s.google_oauth_client_id, "redirect_uri": redirect_uri(), "response_type": "code",
                                         "scope": SCOPES, "access_type": "offline", "prompt": "consent", "state": state,
                                         "include_granted_scopes": "true"})


def encrypt(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt(blob: str) -> str:
    try:
        return _fernet().decrypt(blob.encode()).decode()
    except (InvalidToken, AttributeError):
        raise YouTubeError("Your YouTube connection can't be read any more — please reconnect YouTube in Settings")


def _check(r: httpx.Response, what: str) -> dict:
    if r.status_code >= 400:
        try:
            err = r.json().get("error")
            msg = err.get("message") if isinstance(err, dict) else (r.json().get("error_description") or err)
        except Exception:
            msg = r.text[:200]
        if r.status_code in (400, 401) and what == "refresh":
            raise YouTubeError("YouTube access was revoked or expired — please reconnect YouTube in Settings")
        if r.status_code == 403 and "quota" in str(msg).lower():
            raise YouTubeError("YouTube's free daily upload quota for this app is used up — try again tomorrow")
        raise YouTubeError(f"YouTube {what} failed ({r.status_code}): {msg}")
    return r.json() if r.content else {}


def exchange_code(code: str) -> dict:
    s = get_settings()
    return _check(httpx.post(TOKEN_URL(), data={"code": code, "client_id": s.google_oauth_client_id, "client_secret": s.google_oauth_client_secret,
                                                 "redirect_uri": redirect_uri(), "grant_type": "authorization_code"}, timeout=20), "sign-in")


def access_token(refresh_token: str) -> str:
    s = get_settings()
    return _check(httpx.post(TOKEN_URL(), data={"refresh_token": refresh_token, "client_id": s.google_oauth_client_id,
                                                 "client_secret": s.google_oauth_client_secret, "grant_type": "refresh_token"}, timeout=20),
                  "refresh")["access_token"]


def my_channel(token: str) -> dict:
    d = _check(httpx.get(API_URL() + "/channels", params={"part": "snippet", "mine": "true"},
                         headers={"Authorization": f"Bearer {token}"}, timeout=20), "channel lookup")
    items = d.get("items") or []
    if not items:
        raise YouTubeError("This Google account has no YouTube channel yet — create one on youtube.com first")
    return {"id": items[0]["id"], "title": items[0]["snippet"]["title"]}


def revoke(token: str) -> None:
    try:
        httpx.post(REVOKE_URL(), data={"token": token}, timeout=10)
    except httpx.HTTPError:
        pass


def upload(token: str, path: str, meta: dict, progress=None) -> dict:
    """Resumable upload (one session, 8 MB chunks). Returns {id, url}."""
    size = os.path.getsize(path)
    body = {"snippet": {"title": meta["title"], "description": meta.get("description", ""), "tags": meta.get("tags") or [],
                        "categoryId": meta.get("category_id", "22")},
            "status": {"privacyStatus": meta.get("privacy", "private"), "selfDeclaredMadeForKids": bool(meta.get("made_for_kids")),
                       "containsSyntheticMedia": bool(meta.get("ai_altered"))}}
    h = {"Authorization": f"Bearer {token}"}
    r = httpx.post(UPLOAD_URL(), params={"uploadType": "resumable", "part": "snippet,status"}, json=body, timeout=30,
                   headers={**h, "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
    _check(r, "upload start")
    loc = r.headers.get("location")
    if not loc:
        raise YouTubeError("YouTube did not return an upload session")
    chunk = 8 * 1024 * 1024
    with open(path, "rb") as f:
        off = 0
        while True:
            data = f.read(chunk)
            end = off + len(data) - 1
            r = httpx.put(loc, content=data, timeout=httpx.Timeout(30, write=300, read=120),
                          headers={**h, "Content-Length": str(len(data)), "Content-Range": f"bytes {off}-{end}/{size}"})
            if r.status_code == 308:
                rng = r.headers.get("range")
                off = int(rng.split("-")[1]) + 1 if rng else off + len(data)
                f.seek(off)
                if progress:
                    progress(off / size)
                continue
            d = _check(r, "upload")
            if not d.get("id"):
                raise YouTubeError("YouTube finished the upload but returned no video id")
            return {"id": d["id"], "url": f"https://youtu.be/{d['id']}", "privacy": (d.get("status") or {}).get("privacyStatus")}
