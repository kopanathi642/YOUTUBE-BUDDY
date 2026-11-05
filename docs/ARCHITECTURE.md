# Architecture — Creator Universe

## The three universes
One product, one account, one media library, one timeline model, one render pipeline:

| Universe | Purpose | Status |
|---|---|---|
| **1. Editor Universe** | Professional editing: media, multitrack timeline, cloud render/export | **Being built now (v0.1 live in code)** |
| 2. AI Creation Universe | AI Magic, Shorts/Clips, captions, translate & dub, lip sync, generation | Planned — will reuse the same Project/Sequence/Job/Export model |
| 3. Super Universe | Teams, review/approvals, automation, developer API, billing | Planned |

`projects.universe` is stored now so later universes share the same data without migration pain.

## Runtime
```
Browser (React SPA) ──HTTPS──► Web service (FastAPI, serves SPA + /api/v1)
   │                                  │
   │  signed PUT/GET (direct)         ├── PostgreSQL  (users, workspaces, projects, media metadata,
   ▼                                  │                sequences + versions, jobs, exports, audit log)
Private object storage (R2) ◄─────────┤
   ▲                                  │
   └──── Worker(s) (FFmpeg) ──────────┘  claim jobs with FOR UPDATE SKIP LOCKED, lease + heartbeat
```
* Media bytes never pass through the API: the browser uploads parts straight to storage using 15-minute signed URLs; playback/download use signed GETs.
* Originals are immutable (`…/media/<id>/original.<ext>`); derived files live under `…/derived/`. Final renders always read originals, preview uses proxies.

## Key decisions (and why)
| Decision | Reason |
|---|---|
| **Vite + React SPA** instead of Next.js | The editor is a client-heavy single page; no SEO/SSR need inside the app. Smaller, faster, one static bundle served by the API. Marketing site can move to Next.js later without touching the editor. |
| **SPA served by the API (same origin)** | Session cookies stay `SameSite=Lax`, no cross-site cookie/CORS complexity; one deployable web service. |
| **Postgres-backed job queue** instead of Redis/Celery | Jobs must be durable (survive browser close + worker restarts). Postgres gives transactions, `SKIP LOCKED` claiming, leases and an auditable history with zero extra infrastructure. Redis will be added for rate limiting/pub-sub when the API scales out. |
| **Integer frames** for all timeline timing | Frame-exact edits; no float drift between preview and render. |
| **One timeline schema (v1) validated in Python and mirrored in TS** | Server rejects overlaps/invalid values; versioned for future migrations. |
| **Timeline → FFmpeg filter graph compiler** (`backend/app/timeline.py`) | Deterministic, testable render; same transform maths as the browser preview. |
| **Optimistic concurrency on sequence saves** | Two tabs/teammates never silently overwrite each other (HTTP 409 + UI choice). |

## Data model (implemented)
`users`, `user_sessions`, `workspaces`, `workspace_members(role)`, `projects`, `media_assets`, `sequences(version, timeline JSONB)`, `sequence_versions` (append-only), `jobs` (durable queue), `exports` (settings + validation report), `audit_logs`. UUID keys, workspace ownership on every tenant row, timestamps, soft delete. Migrations: Alembic (`backend/migrations`).

## Job lifecycle
`queued → running (lease 60s, renewed with progress) → succeeded | failed | canceled`.
Expired lease ⇒ another worker reclaims. Transient errors retry with exponential back-off up to `max_attempts`; permanent errors (rejected file, missing media, failed validation) stop immediately. Cancellation is checked on every heartbeat and kills FFmpeg.

## Render pipeline
1. Load the exact saved sequence **version** referenced by the export.
2. Verify every referenced asset is `ready` and belongs to the same workspace + project.
3. Download originals → compile filter graph (black canvas → overlays bottom-up with scale/rotate/opacity/fades; audio delayed, faded and mixed onto a silent bed) → `libx264 veryfast` + AAC.
4. Progress parsed from `ffmpeg -progress`; validate output with ffprobe + decode test; upload; record size and report.
