# Test plan (current)
* `backend/tests` — pytest against real Postgres, moto S3 server and FFmpeg. Fixtures are generated synthetically (colour bars + tones) so they are licence-clean: MP4 H.264/AAC 720p, WebM VP9/Opus portrait, MOV without audio, WAV, PNG, and a fake `.mp4` containing text.
  Covers: auth + CSRF, rate limiting, tenant isolation, viewer role, upload validation, resumable part listing, full multi-track render with pixel check, optimistic concurrency, overlap rejection, idempotent export, cancel, worker-crash reclaim, version restore, migrations from empty DB.
* `frontend/src/timeline.test.ts` — vitest for all timeline edit operations.
* Browser E2E (Playwright script used in development) — sign-up → project → upload 4 files → add/drag clips → transform → split + ripple delete → autosave → export → download → reload persistence → mobile layouts.
* Next to add: Playwright E2E in CI, visual regression snapshots per page, large-file upload (multi-GB) and long-video render tests, accessibility audit (axe).
