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
