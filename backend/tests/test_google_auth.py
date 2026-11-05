"""Google sign-in via Firebase: only correctly signed, unexpired tokens for OUR project are accepted."""
import datetime as dt
import time
import uuid

import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from app import firebase_auth
from app.config import get_settings

PROJECT = "ytbuddy-3"


def _keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(days=1))
            .not_valid_after(now + dt.timedelta(days=1)).sign(key, hashes.SHA256()))
    return key, cert.public_bytes(serialization.Encoding.PEM).decode()


GOOD_KEY, GOOD_CERT = _keypair()
EVIL_KEY, _ = _keypair()


@pytest.fixture(autouse=True)
def firebase(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "firebase_project_id", PROJECT)
    monkeypatch.setattr(s, "firebase_api_key", "AIza-test-public-key")
    monkeypatch.setattr(s, "firebase_auth_domain", f"{PROJECT}.firebaseapp.com")
    monkeypatch.setattr(firebase_auth, "_fetch_certs", lambda: ({"kid1": GOOD_CERT}, time.time() + 3600))
    firebase_auth._cache.update(keys={}, expires=0)


def token(key=GOOD_KEY, kid="kid1", alg="RS256", **over):
    now = int(time.time())
    claims = {"iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT, "sub": "google-uid-" + uuid.uuid4().hex[:8],
              "iat": now, "exp": now + 3600, "auth_time": now, "email": f"g{uuid.uuid4().hex[:8]}@gmail.com",
              "email_verified": True, "name": "Google User", "picture": "https://lh3.googleusercontent.com/a/x",
              "firebase": {"sign_in_provider": "google.com"}}
    claims.update(over)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})


def test_config_exposes_public_firebase_settings(make_client):
    c = make_client().get("/api/v1/auth/config").json()
    assert c["google"] is True and c["firebase"]["projectId"] == PROJECT


def test_valid_google_token_creates_account_and_session(make_client):
    c = make_client()
    t = token(sub="uid-abc-1", email="creator.one@gmail.com")
    r = c.post("/api/v1/auth/google", json={"id_token": t})
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["user"]["google_linked"] and not me["user"]["has_password"] and me["user"]["email_verified"]
    assert me["workspaces"][0]["role"] == "owner"
    assert c.get("/api/v1/auth/me").status_code == 200
    # Same Google account again -> same user, not a duplicate
    again = make_client().post("/api/v1/auth/google", json={"id_token": token(sub="uid-abc-1", email="creator.one@gmail.com")}).json()
    assert again["user"]["id"] == me["user"]["id"]
    # Google-only account cannot be signed into with an empty/guessed password
    bad = make_client().post("/api/v1/auth/login", json={"email": "creator.one@gmail.com", "password": "anything-at-all"})
    assert bad.status_code == 401


@pytest.mark.parametrize("why,tok", [
    ("signed by attacker key", lambda: token(key=EVIL_KEY)),
    ("other firebase project", lambda: token(aud="someone-elses-project")),
    ("wrong issuer", lambda: token(iss="https://evil.example.com/ytbuddy-3")),
    ("expired", lambda: token(exp=int(time.time()) - 3600, iat=int(time.time()) - 7200)),
    ("unknown key id", lambda: token(kid="nope")),
    ("missing auth_time", lambda: token(auth_time=None)),
    ("unsigned alg none", lambda: jwt.encode({"sub": "x", "aud": PROJECT}, None, algorithm="none", headers={"kid": "kid1"})),
    ("HS256 confusion", lambda: token(key="secret-shared-key-that-is-long-enough", alg="HS256")),
    ("garbage", lambda: "not-a-jwt-at-all-really-not"),
])
def test_forged_or_invalid_tokens_rejected(make_client, why, tok):
    r = make_client().post("/api/v1/auth/google", json={"id_token": tok()})
    assert r.status_code == 401, why


def test_unverified_email_or_non_google_provider_rejected(make_client):
    assert make_client().post("/api/v1/auth/google", json={"id_token": token(email_verified=False)}).status_code == 401
    assert make_client().post("/api/v1/auth/google", json={"id_token": token(firebase={"sign_in_provider": "anonymous"})}).status_code == 401


def test_links_existing_password_account_by_verified_email(make_client):
    c = make_client()
    email = f"linkme{uuid.uuid4().hex[:6]}@gmail.com"
    created = c.post("/api/v1/auth/signup", json={"email": email, "password": "correct horse battery", "display_name": "Linker"}).json()
    g = make_client().post("/api/v1/auth/google", json={"id_token": token(email=email, sub="uid-link-1")}).json()
    assert g["user"]["id"] == created["user"]["id"] and g["user"]["google_linked"] and g["user"]["has_password"]
    # A *different* Google account claiming the same email cannot take it over
    r = make_client().post("/api/v1/auth/google", json={"id_token": token(email=email, sub="uid-attacker")})
    assert r.status_code == 409


def test_disabled_when_not_configured(make_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "firebase_project_id", None)
    assert make_client().get("/api/v1/auth/config").json()["google"] is False
    assert make_client().post("/api/v1/auth/google", json={"id_token": token()}).status_code == 401
