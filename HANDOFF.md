# HANDOFF — YouTube Buddy X (working name)

Last updated: 2026-11-07. Read this first when you pick the project up in Claude Code.

## 1. Location
- **GitHub:** https://github.com/kopanathi642/YOUTUBE-BUDDY, branch **`main`** (the repo is still **public**; the founder should make it private).
- Build session path: `/home/claude/creator-universe` (temporary cloud container). The GitHub copy and the ZIP are the durable copies.
- Layout:
  ```
  backend/   FastAPI API + worker (FFmpeg, AI engines), SQLAlchemy models, Alembic migrations (0001–0007), pytest suite
  frontend/  React 18 + Vite + TypeScript SPA (gateway, editor, AI Generator, settings, landing)
  e2e/       Playwright audits: audit.mjs (editor, 62 steps), ai_tools_audit.mjs (120 AI tools)
  gpu/       Kaggle notebook: Wan 2.2 TI2V-5B pilot (youtube_buddy_x_wan_pilot.ipynb)
  docs/      FEATURE_STATUS_MATRIX, HIDDEN_FEATURES, AI_TOOL_AUDIT, DEPLOYMENT, ARCHITECTURE, SECURITY_RISK_REGISTER, COST_MODEL, ui/
  render.yaml (web + worker + Postgres blueprint) · Dockerfile · docker-compose.yml · .github/workflows/ci.yml
  ```

## 2. Product shape (decisions from the founder)
- **Three universes** behind a 3D gateway at `/universes`:
  - **Editor Universe** (`/editor`, `/edit/:id`): OPEN. All editing tools.
  - **AI Generator Universe** (`/ai-generator`, renamed from "AI Creation"; old `/ai-creation/*` redirects): OPEN. 120 generator tools in 12 studios, each studio its own UI.
  - **Super Universe** (`/super`): **LOCKED** by founder decision (`locked: true` in `frontend/src/universes.ts`). Team management lives in Settings → Team.
- **Show only what works.** Features that need a key/model are hidden, not shown as locked, and reappear automatically when the key is set. The list is in `docs/HIDDEN_FEATURES.md`.
- **Founder has no budget:** prefer free/open-source engines, free API tiers, CPU first. Paid providers (fal.ai, Claude/OpenAI) stay optional behind keys plus a daily budget cap.
- **Honesty rule:** never show a fake or placeholder control as working. Label rule-based features as rule-based.
- **Positioning:** Indian YouTubers ("Make one video. Reach every language."): dubbing, captions, Shorts, UPI pricing.
- **Name:** "YouTube Buddy X" is a working name only. It must be renamed before launch (YouTube brand rules); set via `BRAND_NAME`.
- **Payments:** no gateway. The founder's UPI QR and/or PayPal QR is uploaded by the platform admin in Settings → Payments admin (never committed to the repo). The user submits the UTR (12 digits) or PayPal transaction ID (17 characters), the admin approves, and the plan runs for 30 days per month paid. Plans are Free / Creator ₹299 / Pro ₹799; prices are placeholders, edit `PLANS` in `backend/app/billing.py`.
- **Admin:** `ADMIN_EMAILS` (the founder said `kumarbhargav642@gmail.com`; set it in hosting env, not in code). In production an admin must sign in with Google (verified email).
- **Security asks:** never ask the founder for passwords or keys in chat. Secrets go only into the hosting provider's secret settings. Never commit secrets.
- **UI requirements:**
  - Dark premium theme; violet / blue / emerald universe colours inside the app. The signed-out landing page (`/`) uses the founder's lime-on-black reference instead (styles scoped under `.lp` in `frontend/src/landing.css`).
  - Two dashboards: the public landing page before sign-in, and the universe gateway (`/universes`) after sign-in. Signed-in visitors to `/` are sent to `/universes`.
  - Editor layout matches the founder's master reference: tool sidebar, monitor, inspector tabs, V1–V4 / A1–A3, colour/scopes strip, export dock (`docs/ui/references/`).
  - Each AI studio has a distinct UI. AI Generator CSS is scoped under `.aiw` so it can't leak into the editor.
  - Must work at 1366 px laptops and on phones.
  - Bundled fonts (`@fontsource`, no Google Fonts).

## 3. Implemented and tested
The evidence for each item is tests in `backend/tests`, `frontend/src/*.test.ts` and the browser audits.

**Latest results:**
- Backend: 106 passed, 4 skipped (the skipped ones are real-model tests, run with `REAL_MODELS=1`).
- Frontend: 38 vitest passed, tsc clean, build OK.
- `e2e/audit.mjs`: 62/62.
- AI tool audit: 120/120 UIs render, 40 executed, 0 failed.
- CI real-models job: green. It runs Whisper, Argos (Hindi), Piper (Hindi) and a full dub.

**Platform:**
- Email/password and Google (Firebase) authentication.
- Argon2 passwords, hashed session tokens, CSRF header.
- Workspaces with roles.
- Tenant isolation.
- Resumable S3 uploads with file-signature checks.
- Proxies, thumbnails, waveforms, analysis.
- Postgres job queue with leases and reclaim.

**Editor:**
- Multitrack timeline: trim, split, ripple, snapping, lock/hide/mute.
- Undo/redo, autosave with 409 conflict handling, version history.
- Transform (position, scale, rotation, opacity), crop, speed 0.25–4× with pitch-preserved audio.
- Colour grading:
  - wheels, exposure, contrast, saturation, temperature, tint, looks, live scopes;
  - **Curves**: monotone cubic, identical in TS and Python;
  - **3D .cube LUTs** with strength.
- **Keyframes** for position, scale, rotation and opacity (linear / ease / hold). Frame-exact in export.
- **Transitions**: 12 xfade types centred on the cut. Visual only; audio cuts.
- Titles in Indian scripts (HarfBuzz) with 6 styles, plus **8 animated title templates** and **24 elements/stickers**.
- Stabilisation (vid.stab).
- Background removal (u2netp).
- Captions/SRT, translation and dubbing (Whisper, Argos, Piper).
- AI voice (Piper).
- Highlights and batch Shorts, smart reframe (face-centred).
- Thumbnail designer.
- Webcam recording and frame snapshot.
- Cloud MP4 export with validation, cancel and retry.
- Free-plan **"Made with <brand>" badge** on exports.

**AI Generator:**
- Registry of exactly 120 tools.
- Live status per tool: ready / needs key / not built.
- Generations with versions, regenerate and rating.
- "Edit in Timeline" places outputs on the right tracks.
- AI labelling plus embedded metadata.
- Consent checks for face/voice tools.
- Workflows with approval gates.

**Business:**
- Plans, UPI and PayPal QR, UTR approval flow, plan-based premium-AI daily limits.
- Referrals: the inviter gets 7 Creator days when a friend finishes a first export, up to 12.
- Founder metrics: activation, active users, conversion, revenue, top features, feedback.
- In-app feedback.
- `/privacy` and `/terms`. These are drafts; they need a lawyer's review.

**Stock library:** Pexels/Pixabay search and import. Server-side lookup, downloads only from allowlisted hosts, attribution kept.

**YouTube publishing:**
- OAuth with the `youtube.upload` scope; refresh token Fernet-encrypted.
- Resumable chunked upload job and a publish dialog.
- Tested only against a fake Google server.

**Creator Scout agent** (`backend/app/agent.py`, runs in the worker loop):
- Hourly health check: DB, storage, ffmpeg, stuck/failed jobs, disk.
- Daily research from public RSS feeds. Claude/OpenAI if a key is set, otherwise a free keyword mode.
- Suggestions only; it never changes anything.
- Founder card in Settings with accept/dismiss.
- Tested with fake feeds only; the build sandbox had no internet.

**Security:**
- CSP, HSTS, Permissions-Policy, COOP; API docs off in production.
- Rate limits: auth, AI, uploads, stock, payments, feedback.
- Daily paid-AI budget (`AI_DAILY_BUDGET_USD`, `AI_DAILY_PAID_RUNS`).
- `safeNext` redirect guard.

## 4. Incomplete / unverified / known issues
- **Hidden until keys are set** (`docs/HIDDEN_FEATURES.md`):
  - Lip sync (tool 033) and object removal (tool 024) need `FAL_KEY`.
  - Stock library needs `PEXELS_API_KEY` or `PIXABAY_API_KEY` (free).
  - YouTube publishing needs a Google OAuth client.
  - 71 of 120 AI tools: 44 need fal.ai, the rest need an LLM key or `YOUTUBE_API_KEY`.
- **Not built:** speaker diarization (107), scheduled workflows (117), motion tracking, masks, HSL qualifiers, nested sequences, roll/slip/slide, 4K/ProRes/HDR export, email (verification, reset, invites), MFA, malware scanning, metrics/alerts.
- **Unverified live:**
  - Google sign-in popup: needs Firebase console steps in `docs/DEPLOYMENT.md`.
  - Real YouTube upload; Google audit pending, so uploads stay private until approved.
  - Agent reading real feeds; Reddit may rate-limit cloud IPs.
  - Real Pexels/Pixabay calls.
  - First deploy on Render.
- **Known limitations:**
  - Argos Hindi translation can drop a clause (quality).
  - Transitions don't crossfade audio.
  - LUT preview appears only in the LUT tab; the monitor shows a "LUT in export" chip.
  - Multi-layer preview sync is best-effort.
  - Rate limits are in-process; move them to Redis when running more than one API instance.
  - No font picker or bold/italic/outline for titles yet; the founder asked about "word formats".
- **Licensing for the next steps:**
  - Lip sync: use MuseTalk (MIT) or LatentSync (Apache-2.0), not Wav2Lip weights (non-commercial).
  - Object removal: SAM 2 + LaMa (Apache-2.0), not ProPainter (non-commercial).

## 5. Next priorities
1. **Launch prep** (founder): rename, deploy on Render, set the env vars below, upload the QR codes, make the repo private, onboard the first 20 creators. See `docs/` and the project doc LAUNCH_PLAYBOOK.
2. **Object removal on CPU:** SAM 2 (click to mask) + LaMa per frame, short clips. Free, runs on the existing worker.
3. **Lip sync on CPU:** MuseTalk with a 10 s limit and queue. A rented GPU later.
4. Kaggle test notebooks for 2 and 3 to check quality and speed. The founder runs them; never take a password.
5. Title text formatting: font picker, bold, italic, outline.
6. Audio crossfades for transitions.

## 6. Commands
**Local stack without Docker** (what the build session used):
```bash
# Postgres 16 with DBs creator (dev) and creator_test (tests); user/password creator/creator
cd backend && pip install --break-system-packages -r requirements.txt -r requirements-dev.txt
moto_server -H 127.0.0.1 -p 9000 &                    # S3 emulator for dev
python -c "from app import storage; storage.ensure_bucket(['http://localhost:8000'])"
alembic upgrade head
uvicorn app.main:app --port 8000 &                     # API (+ serves frontend/dist)
python -m app.worker &                                 # jobs + Creator Scout agent
cd ../frontend && npm ci && npm run build              # or: npm run dev (Vite on :5173, proxies /api)
```

**With Docker:** `docker compose up --build`, then open http://localhost:8000.

**Tests:**
```bash
cd backend && python -m pytest -q                      # needs Postgres DB creator_test; starts its own S3 emulator on :9100
REAL_MODELS=1 MODEL_CACHE=/tmp/models python -m pytest -q -s tests/test_real_models.py   # downloads free models (internet)
cd frontend && npm run typecheck && npm test && npm run build
# Browser audits (server running on :8000, demo media folder with sample files):
BASE=http://localhost:8000 MEDIA=<demo media dir> OUT=<screenshots dir> node e2e/audit.mjs
AI_RUNS_PER_10MIN=1000 (on the server) + node e2e/ai_tools_audit.mjs
```

**Deploy:** `render.yaml` (web + worker share env). Steps in `docs/DEPLOYMENT.md`.

## 7. Environment variables (names only; never commit values)
- **Core:** `ENV`, `DATABASE_URL`, `CORS_ORIGINS`, `COOKIE_SECURE`, `BRAND_NAME`, `CONTACT_EMAIL`, `PUBLIC_BASE_URL`, `SCRATCH_DIR`, `FRONTEND_DIST`
- **Storage (S3/R2):** `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`
- **Google sign-in (Firebase):** `FIREBASE_PROJECT_ID` (project `ytbuddy-3`), `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`
- **Limits / budget:** `AI_DAILY_BUDGET_USD`, `AI_DAILY_PAID_RUNS`, `AI_RUNS_PER_10MIN`, `UPLOADS_PER_10MIN`, `FREE_PLAN_PAID_RUNS`, `FREE_PLAN_WATERMARK`
- **Billing / admin:** `ADMIN_EMAILS`
- **YouTube publishing:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (same value on web and worker)
- **AI providers (optional):** `FAL_KEY`, `FAL_QUEUE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `LLM_MODEL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_TEXT_MODEL`, `YOUTUBE_API_KEY`, `YOUTUBE_API_URL`
- **Stock:** `PEXELS_API_KEY`, `PIXABAY_API_KEY`
- **Local models:** `MODEL_CACHE`, `WHISPER_MODEL` (default `small`), `PIPER_BIN`
- **Agent:** `AGENT_ENABLED`, `AGENT_RESEARCH_HOURS`, `AGENT_SOURCES`
- **Test-only overrides:** `REAL_MODELS`, `GOOGLE_TOKEN_URL`, `GOOGLE_AUTH_URL`, `GOOGLE_REVOKE_URL`, `YOUTUBE_UPLOAD_URL`, `PEXELS_API_URL`, `PIXABAY_API_URL`

## 8. AI integrations and model locations
| Engine | Used for | Where the model comes from | Status |
|---|---|---|---|
| faster-whisper (`WHISPER_MODEL`, default small) | captions, transcripts, dub | huggingface.co on first use → `$MODEL_CACHE/whisper` | VERIFIED in CI (needs `av==18.1.0`) |
| Argos Translate | translation incl. Hindi | argospm index (GitHub) → `$MODEL_CACHE/argos/<src>_<dst>` | VERIFIED in CI; quality limits |
| Piper TTS | voices, dub (Hindi voices from HF) | binary from GitHub releases → `$MODEL_CACHE/piper`; voices from huggingface.co `rhasspy/piper-voices` v1.0.0 | VERIFIED in CI |
| rembg u2netp | background removal | downloaded by rembg on first use (home cache) | VERIFIED (tests) |
| FFmpeg / vid.stab / OpenCV / Pillow + HarfBuzz | editing, export, stabilise, analysis, titles | system packages / pip | VERIFIED |
| fal.ai queue (Veo, Kling, Seedance, Wan, FLUX, Nano Banana, ElevenLabs, Sync lip sync, OmniHuman, Tripo…) | 44 hosted tools | remote API, `FAL_KEY` | MISSING KEY, code tested with a fake provider |
| Claude / OpenAI (`LLM_MODEL`) | writing tools, Director agent, Creator Scout AI mode | remote API | MISSING KEY, tested with a fake server |
| YouTube Data API v3 | trend tools (public data) + publishing (OAuth) | remote API | MISSING KEY/CLIENT, tested with a fake server |
| Wan 2.2 TI2V-5B (diffusers) | GPU pilot only | Hugging Face, run on Kaggle via `gpu/youtube_buddy_x_wan_pilot.ipynb` | NOT integrated in the app; Kaggle run unverified |
| MuseTalk / LatentSync, SAM 2 + LaMa | planned lip sync / object removal | — | NOT STARTED |

No model weights are committed to the repo; everything downloads on first use into `MODEL_CACHE`. On Render, mount a persistent disk there so models aren't re-downloaded.
