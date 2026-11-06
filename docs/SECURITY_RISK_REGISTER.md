# Security & risk register

| # | Risk | Control in place | Remaining work | Severity |
|---|---|---|---|---|
| 1 | Cross-tenant data access | Every loader checks workspace membership; foreign IDs return 404; tested on 9 routes | Add isolation tests for every new route (CI gate) | High → mitigated |
| 2 | Session theft / CSRF | httpOnly cookie, SameSite=Lax, Secure in prod, hashed tokens, server-side revocation; custom-header CSRF guard | Session list + "sign out everywhere" UI | Medium |
| 3 | Credential stuffing | Argon2id, generic error, per-email + per-IP rate limit, audit of failures | Redis-backed limiter when API scales out; MFA; breached-password check | Medium |
| 4 | Malicious uploads | Extension + MIME allow-list, ffprobe signature check, rejected files deleted, size limits, sanitised names, uploads never executed | ClamAV scan; decompression-bomb limits (resolution/duration caps exist) | Medium |
| 5 | FFmpeg exploitation via crafted media | Worker isolated from API, non-root container, timeouts | Run worker with seccomp/no network except storage + DB; keep FFmpeg patched | Medium |
| 6 | Storage exposure | Private bucket, 15-min signed URLs, keys only server-side, per-object paths by workspace | R2 token scoped to one bucket (documented) | Low |
| 7 | Secrets in repo | `.env.example` placeholders only; secrets via Render dashboard | Secret scanning in CI (gitleaks) | Low |
| 8 | Data loss | Originals immutable; sequence versions append-only; soft deletes | Backup restore drill; purge job for soft-deleted data with retention policy | Medium |
| 9 | Cost abuse (render farming) | Max duration, concurrency cap, clip cap | Per-plan quotas + credits (Phase 8); sign-up abuse controls | Medium |
| 10 | Brand / trademark | Working name avoids "YouTube" | Trademark check + legal review before launch | High (business) |
| 11 | Legal pages | None published as final | Privacy policy, terms, refund policy need qualified legal review (India DPDP Act) | High (business) |
| 12 | Forged Google/Firebase tokens (e.g. decoding JWT without verifying) | RS256 signature checked against Google certs, aud/iss/exp/iat/auth_time/sub enforced, `alg` pinned, fails closed if keys can't be fetched; 9 attack cases tested | Restrict the Firebase browser API key to app domains | High → mitigated |
| 13 | Account takeover via email linking | Link only when Google says `email_verified`; a second Google UID for the same email gets 409 | — | Medium → mitigated |
| 14 | Script injection (XSS) / clickjacking | Strict Content-Security-Policy (only our own scripts; storage + Google sign-in allow-listed; `object-src 'none'`, `frame-ancestors 'none'`), X-Frame-Options DENY, nosniff, Permissions-Policy (camera/mic only for this site, no geolocation/payment/USB); 0 CSP violations across all pages in the browser audits | Drop `'unsafe-inline'` for styles (needs moving inline style attributes to classes) | Medium → mitigated |
| 15 | Open redirect after sign-in (React Router advisory) | `safeNext()` accepts only same-origin paths; blocks `//`, backslashes, control chars and other origins — 11 attack cases tested | Upgrade to React Router 7 when convenient | Medium → mitigated |
| 16 | Paid-AI cost abuse | Per-user AI rate limit (30 runs / 10 min), upload limit (120 / 10 min), per-workspace daily paid-AI budget (`AI_DAILY_BUDGET_USD`, default $10) and run cap (`AI_DAILY_PAID_RUNS`, default 200), checked before any provider call; `AI_DAILY_BUDGET_USD=0` switches paid models off | Per-plan budgets once billing exists; fal.ai account spending limit as a second wall | High → mitigated |
| 17 | Downgrade to plain HTTP | HSTS (1 year, subdomains) whenever cookies are Secure / in production | HSTS preload after the final domain is chosen | Low |
| 18 | Information exposure | API docs/OpenAPI schema disabled in production; logs record paths only, never query strings | — | Low |
| 19 | Third-party tracking via fonts | Inter + JetBrains Mono bundled with the app (no Google Fonts request) | — | Low |
| 20 | Vulnerable dependencies | `npm audit` reviewed: React Router 6.30.6, Firebase 13.2; remaining Firebase advisories are in Node-only Firestore/gRPC code that the browser bundle never uses | Dependabot + `pip-audit`/`npm audit` in CI | Low |
| 21 | Source code exposure | Repository must be **private** on GitHub | Owner action: GitHub → Settings → Change visibility → Private | High until done |
