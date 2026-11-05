# Feature Status Matrix — Editor Universe (v0.1)

Labels: **WORKING** (verified end-to-end with evidence) · **PARTIAL** · **NOT_IMPLEMENTED** · **BLOCKED** (needs an external account/credential/approval).
Evidence: `backend/tests/test_editor_flow.py` (pytest, real Postgres + S3 protocol + FFmpeg), `frontend/src/timeline.test.ts` (vitest), and a browser end-to-end run (Playwright, screenshots in `docs/ui/references/`).

| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Auth | Email + password sign-up / sign-in / sign-out | WORKING | `test_auth_and_csrf`, browser E2E |
| Auth | Argon2 password hashing, hashed session tokens, httpOnly cookie | WORKING | `security.py` |
| Auth | CSRF defence (custom header + CORS) | WORKING | `test_auth_and_csrf` (403 without header) |
| Auth | Login/sign-up rate limit | PARTIAL | `test_login_rate_limited`; in-process only — move to Redis when API runs >1 instance |
| Auth | Email verification, password reset | BLOCKED | Needs an email provider (e.g. Resend/SES) |
| Auth | Google sign-in via Firebase (project `ytbuddy-3`), server-side ID-token signature verification, account linking by verified email | WORKING (code) / BLOCKED (live) | `test_google_auth.py` (14 tests incl. 9 forged-token attacks). Live popup needs the Firebase console steps in DEPLOYMENT.md (enable Google provider, authorize domain) |
| Auth | YouTube OAuth scopes | NOT_IMPLEMENTED | deliberately deferred: restricted scope needs Google verification; request only when a YouTube feature exists |
| Auth | MFA | NOT_IMPLEMENTED | Phase 1b |
| Workspaces | Personal workspace on sign-up, team workspaces, roles (owner/admin/editor/viewer) | WORKING | `test_viewer_cannot_edit` |
| Workspaces | Add existing user as member, remove member | WORKING | API only; no UI page yet |
| Workspaces | Email invitations, ownership transfer, workspace deletion | NOT_IMPLEMENTED | needs email provider |
| Tenancy | Cross-workspace isolation (404 on every foreign ID) | WORKING | `test_tenant_isolation` (6 GET + 3 write routes) |
| Projects | Create (16:9 / 9:16 / 1:1, 24–60 fps), list, search, sort, rename, archive, restore, soft-delete | WORKING | browser E2E, API |
| Projects | Duplicate, folders, tags, project thumbnails | NOT_IMPLEMENTED | |
| Media | Resumable multipart upload direct to private object storage via signed URLs | WORKING | `test_full_edit_and_render`, `test_resume_lists_uploaded_parts`, browser E2E |
| Media | Extension + MIME + real file-signature validation (ffprobe), size limit, path-traversal-safe names | WORKING | `test_upload_rejects_bad_files` (fake .mp4 rejected and deleted) |
| Media | Probe metadata, SHA-256, thumbnail, 540p proxy, waveform peaks | WORKING | MP4/H.264, WebM/VP9+Opus, MOV (silent), WAV, PNG tested |
| Media | Retry failed processing, delete from project | WORKING | |
| Media | Malware scanning (ClamAV), URL import | NOT_IMPLEMENTED | |
| Editor | Multitrack timeline (video + audio tracks, add tracks) | WORKING | |
| Editor | Move (incl. between tracks), trim both edges, split at playhead, delete, ripple delete, snapping | WORKING | vitest + browser E2E |
| Editor | Lock / hide / mute tracks | WORKING | respected by preview **and** render |
| Editor | Transform: position, scale, rotation, opacity; volume; fade in/out | WORKING | render pixel check in pytest; preview ↔ export position match verified visually |
| Editor | Undo / redo, keyboard shortcuts | WORKING | |
| Editor | Autosave with optimistic concurrency (409 on stale save), conflict banner | WORKING | `test_full_edit_and_render` |
| Editor | Version history + restore (non-destructive) | WORKING | |
| Editor | Proxy preview playback in browser | PARTIAL | Real playback from proxies; multi-layer sync is best-effort, not frame-locked |
| Editor | Speed/reverse, keyframes, crop, transitions, effects, nested sequences, roll/slip/slide | NOT_IMPLEMENTED | Phase 2b / 6 |
| Export | Server-side FFmpeg render from originals (H.264/AAC MP4; match / 720p / draft 480p) | WORKING | |
| Export | Real progress from FFmpeg, cancel, retry, idempotency key | WORKING | `test_export_validation_and_cancel` |
| Export | Output validation: exists, streams, codec, dimensions, fps, duration, decodability | WORKING | stored on each export, shown as “Verified” |
| Export | Keeps running with browser closed; worker crash → lease expiry → reclaim | WORKING | `test_crashed_worker_job_is_reclaimed` |
| Export | 4K / ProRes / HEVC / HDR / high FPS | NOT_IMPLEMENTED | deliberately not offered until workers support it |
| Billing | Buddy Credits, plans, payments | NOT_IMPLEMENTED | Phase 8. Renders are free during early access with limits (2 concurrent exports, 60 min max) |
| AI Creation Universe | AI Magic, Shorts, Clips, captions, translate, dub, lip sync, generation | NOT_IMPLEMENTED | shown in UI as “Soon”, inert |
| Super Universe | Developer API keys, webhooks, teams review, automation | NOT_IMPLEMENTED | |
| Ops | Health endpoint (DB + storage), worker alive file, structured logs with request IDs | WORKING | |
| Ops | Docker image, Render blueprint, CI | PARTIAL | written; image builds in CI (no Docker daemon in build sandbox); first deploy pending founder accounts |
| Ops | Metrics/alerts, backups restore drill | NOT_IMPLEMENTED | Render Postgres has daily backups on paid plans; drill not yet run |
