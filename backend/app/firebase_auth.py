"""Verify Firebase Authentication ID tokens (Google sign-in).

We check the RS256 signature against Google's published certificates, plus audience (project id),
issuer, expiry, issued-at, auth_time and subject — exactly as Firebase documents for third-party
backends. Never trust a token's payload without this check.
"""
import re
import threading
import time

import httpx
import jwt
from cryptography.x509 import load_pem_x509_certificate

CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_lock = threading.Lock()
_cache: dict = {"keys": {}, "expires": 0.0}
CLOCK_SKEW_S = 60


class InvalidToken(Exception):
    pass


def _fetch_certs() -> tuple[dict[str, str], float]:
    r = httpx.get(CERTS_URL, timeout=10)
    r.raise_for_status()
    m = re.search(r"max-age=(\d+)", r.headers.get("cache-control", ""))
    return r.json(), time.time() + (int(m.group(1)) if m else 3600)


def _public_key(kid: str):
    with _lock:
        if kid not in _cache["keys"] or time.time() >= _cache["expires"]:
            try:
                keys, exp = _fetch_certs()
            except Exception as e:  # network trouble: fail closed
                raise InvalidToken("could not fetch Google signing keys") from e
            _cache.update(keys=keys, expires=exp)
        pem = _cache["keys"].get(kid)
    if not pem:
        raise InvalidToken("unknown signing key")
    return load_pem_x509_certificate(pem.encode()).public_key()


def verify_id_token(token: str, project_id: str) -> dict:
    if not project_id:
        raise InvalidToken("Google sign-in is not configured")
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise InvalidToken("malformed token") from e
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise InvalidToken("unexpected token algorithm")
    try:
        claims = jwt.decode(
            token, _public_key(header["kid"]), algorithms=["RS256"], audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}", leeway=CLOCK_SKEW_S,
            options={"require": ["exp", "iat", "aud", "iss", "sub", "auth_time"]},
        )
    except jwt.PyJWTError as e:
        raise InvalidToken(f"token rejected: {type(e).__name__}") from e
    if not claims.get("sub") or len(claims["sub"]) > 128:
        raise InvalidToken("invalid subject")
    if claims["auth_time"] > time.time() + CLOCK_SKEW_S:
        raise InvalidToken("auth_time in the future")
    return claims
