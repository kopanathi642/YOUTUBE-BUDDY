"""IndexNow: tell Bing (and Yahoo, Yandex, Seznam, Naver — they share submissions) that our public pages exist or changed.

The key is public by design: search engines fetch https://<site>/<key>.txt to confirm we own the site. Run after a deploy:
    python -m app.indexnow
"""
from __future__ import annotations

import os
import sys

import httpx

from . import seo
from .config import get_settings

DEFAULT_KEY = "5f0c3b9e7a1d4c2e8b6a9d0f1e2c3b4a"   # public; override with INDEXNOW_KEY


def key() -> str:
    k = "".join(ch for ch in os.environ.get("INDEXNOW_KEY", DEFAULT_KEY) if ch.isalnum() or ch == "-")
    return k[:128] if len(k) >= 8 else DEFAULT_KEY


def submit(base: str | None = None, timeout: float = 20) -> int:
    base = (base or get_settings().public_base_url).rstrip("/")
    host = base.split("://", 1)[-1].split("/")[0]
    body = {"host": host, "key": key(), "keyLocation": f"{base}/{key()}.txt", "urlList": [base + p for p in seo.SITEMAP]}
    r = httpx.post(os.environ.get("INDEXNOW_URL", "https://api.indexnow.org/indexnow"), json=body, timeout=timeout)
    return r.status_code


if __name__ == "__main__":
    code = submit()
    print(f"IndexNow answered {code} ({'accepted' if code in (200, 202) else 'not accepted'}) for {len(seo.SITEMAP)} pages")
    sys.exit(0 if code in (200, 202) else 1)
