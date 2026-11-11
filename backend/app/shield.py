"""Shield: a small application firewall in front of every request (Cloudflare's WAF sits in front of this).

- one trusted visitor IP: Cloudflare's CF-Connecting-IP when behind the tunnel (headers a visitor sends can't spoof it)
- per-IP token buckets for the API and for pages, 429 + Retry-After when exceeded
- attack-scanner probes (/.env, /.git, wp-admin, *.php, path traversal…) answer 404 and count as strikes;
  repeated strikes or sustained flooding = temporary ban (403) for that IP
- request hygiene: only normal HTTP methods, bounded URL length, bounded API body size
Everything is in memory (one API process). Limits come from settings (SHIELD_*)."""
from __future__ import annotations

import hashlib
import re
import threading
import time
from collections import deque

from fastapi import Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .config import get_settings

ALLOWED_METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
PROBE = re.compile(
    r"(^|/)(\.env|\.git|\.svn|\.hg|\.DS_Store|\.aws|\.ssh|\.htaccess|\.htpasswd|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php"
    r"|phpmyadmin|pma|adminer|cgi-bin|vendor/phpunit|server-status|actuator|boaform|HNAP1|owa/|autodiscover|_ignition|telescope"
    r"|config\.json|credentials|id_rsa|web\.config|\.well-known/security\.txt\.php)"
    r"|\.(php|asp|aspx|jsp|cgi|pl|sh|bak|sql|old|swp)$"
    r"|\.\./|%2e%2e|%00|\x00", re.I)
EXEMPT = ("/api/v1/health",)


def client_ip(request: Request) -> str:
    if get_settings().trust_cloudflare_ip:
        cf = request.headers.get("cf-connecting-ip")
        if cf:
            return cf.strip()[:64]
    return request.client.host if request.client else "-"


class _Bucket:
    __slots__ = ("tokens", "at")

    def __init__(self, burst: int):
        self.tokens, self.at = float(burst), time.monotonic()


class Shield:
    def __init__(self):
        self.lock = threading.Lock()
        self.buckets: dict[tuple[str, str], _Bucket] = {}
        self.bans: dict[str, float] = {}
        self.strikes: dict[str, deque] = {}
        self.blocked = 0
        self.denials: dict[str, int] = {}

    def reset(self):
        with self.lock:
            self.buckets.clear(); self.bans.clear(); self.strikes.clear(); self.denials.clear(); self.blocked = 0

    def _take(self, ip: str, lane: str, rate: float, burst: int) -> float:
        """0 when allowed, else seconds until a token is available."""
        now = time.monotonic()
        b = self.buckets.get((ip, lane))
        if b is None:
            if len(self.buckets) > 50_000:      # bounded memory under a distributed flood
                self.buckets.clear()
            b = self.buckets[(ip, lane)] = _Bucket(burst)
        b.tokens = min(burst, b.tokens + (now - b.at) * rate)
        b.at = now
        if b.tokens >= 1:
            b.tokens -= 1
            return 0.0
        return (1 - b.tokens) / rate

    def strike(self, ip: str, weight: int = 1) -> None:
        s = get_settings()
        now = time.monotonic()
        q = self.strikes.setdefault(ip, deque())
        for _ in range(weight):
            q.append(now)
        while q and now - q[0] > 600:
            q.popleft()
        if len(q) >= 8:
            self.bans[ip] = now + s.shield_ban_seconds
            q.clear()

    def banned(self, ip: str) -> bool:
        until = self.bans.get(ip)
        if until is None:
            return False
        if time.monotonic() > until:
            self.bans.pop(ip, None)
            return False
        return True

    def check(self, request: Request):
        """None to let the request through, or the response to send instead."""
        s = get_settings()
        path = request.url.path
        if not s.shield_enabled or path in EXEMPT:
            return None
        ip = client_ip(request)
        with self.lock:
            if self.banned(ip):
                self.blocked += 1
                return PlainTextResponse("Access temporarily blocked", status_code=403)
            if request.method not in ALLOWED_METHODS:
                self.strike(ip)
                return PlainTextResponse("Method not allowed", status_code=405)
            raw = request.scope.get("raw_path", b"") or path.encode()
            if len(raw) > 2048 or len(request.url.query) > 4096:
                self.strike(ip)
                return PlainTextResponse("URL too long", status_code=414)
            if PROBE.search(path) or PROBE.search(raw.decode("latin-1")):
                self.strike(ip, 2)
                return PlainTextResponse("Not found", status_code=404)
            api = path.startswith("/api/")
            if api:
                cl = request.headers.get("content-length")
                if cl and cl.isdigit() and int(cl) > s.shield_max_body_bytes:
                    return JSONResponse({"detail": "Request too large"}, status_code=413)
            # Each signed-in session gets its own bucket, so people sharing one IP (mobile carrier NAT, college Wi-Fi)
            # don't slow each other down; one higher ceiling per IP still stops a flood with made-up cookies.
            sid = request.cookies.get(s.session_cookie_name, "")
            who = f"{ip}|{hashlib.sha256(sid.encode()).hexdigest()[:16]}" if sid else ip
            wait = self._take(ip, "ip", s.shield_ip_rate, s.shield_ip_burst) or (
                self._take(who, "api", s.shield_api_rate, s.shield_api_burst) if api
                else self._take(who, "page", s.shield_page_rate, s.shield_page_burst))
            if wait:
                self.blocked += 1
                n = self.denials[ip] = self.denials.get(ip, 0) + 1
                if n % 25 == 0:                  # keeps hammering after being told to slow down: ~200 refusals → ban
                    self.strike(ip)
                if len(self.denials) > 50_000:
                    self.denials.clear()
                return JSONResponse({"detail": "Too many requests, slow down"}, status_code=429,
                                    headers={"retry-after": str(max(1, int(wait + 0.999)))})
        return None


shield = Shield()
