# HANDOFF — YouTube Buddy X (working name)

Last updated: 2026-11-08 (developer account, Connect channel + My channel insights, go-live guide for youtubebuddy.com). Read this first when you pick the project up in Claude Code.

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
- **Payments:** no gateway. The founder's UPI QR and/or PayPal QR is uploaded by the platform admin in Settings → Payments admin (never committed to the repo). The user submits the UTR (12 digits) or PayPal transaction ID (17 characters), the admin approves, and the plan runs for 30 days per month paid. Plans are Free / Creator ₹299 / Pro ₹799 (yearly = 10 months' price), each with a **monthly premium-AI credit in rupees** (Free ₹0, Creator ₹100, Pro ₹300); edit `PLANS` in `backend/app/billing.py`. See the profitability review in `docs/COST_MODEL.md` before changing prices or credits.
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

**Speech and dubbing, measured on real speech offline** (full tables: `docs/DUBBING_EVAL.md`; language list: `docs/DUBBING_LANGUAGES.md`):
- **Captions (FLEURS human speech, Whisper small):**
  - English: WER 6.4%;
  - Spanish: WER 3.7%;
  - Hindi: CER 23–34%. With Whisper medium, Hindi drops to 19.5% at ~1.9× real time.
- **Dub into each language:** pronunciation was judged by Whisper medium re-listening to every voiced line:
  - most languages: 0–10% CER (Hindi 9.5%, English 1.6%, Spanish 1.7%, French 1.4%, German 2.7%);
  - Persian 26.9% and Latvian 18.7% are weaker;
  - Japanese (309%) and Chinese (60%) failed, so they are disabled as targets.
  
  Back-translation chrF was 67–94 for most languages (Vietnamese 52.8). Renders take 0.2–0.5× the clip length.
- **End to end through the running app** (50 s Hindi+English clip, 4 people, 3 target languages):
  - detection: Hindi + mixed English;
  - speakers: 4 found;
  - rendering: all languages took 40 s;
  - files: MP4/M4A/WAV/SRT/VTT downloaded and checked, dubbed MP4s ready in the media bin;
  - worker peak RAM: 1.64 GB.
  
  A worker without models refused jobs; the real worker verified everything offline (47–65 s) first.
- **Weak spot:** Hindi as the *source* language. Noisy Hindi can come out garbled with Whisper small, and then the translations are wrong. Creators should check the transcript in the studio, and Hindi channels should use `WHISPER_MODEL=medium` on a ≥ 4 GB worker.

**Latest results** (re-run 2026-11-07 in a fresh cloud container):
- Backend: 122 passed, 5 skipped (the skipped ones are real-model tests, run with `REAL_MODELS=1`).
- Frontend: 38 vitest passed, tsc clean, build OK.
- `e2e/audit.mjs`: 63/63 on the final code with real models, including Remove Object and the **Dubbing studio** step. It uploads `Speech_Sample.mp4` (optional in MEDIA: any short clip with real speech), recognises it, dubs it into Hindi and finds all five download links. Without that file the step records a NOTE. Before this change it passed 63/63 (also with the backend suite running in parallel). Start the server with `ADMIN_EMAILS=founder@example.com` or the payments step fails. The old intermittent "Translate & Voice / Lip Sync panels" failure is **root-caused and fixed**: the Record dialog sometimes stayed open and blocked the next step. Cause: `RecordModal` created a new preview blob URL on every render (the level meter re-renders ~60×/s), which leaked memory and kept reloading the preview, so "Add to project" moved and clicks missed. Fix: one memoised URL per take (revoked afterwards), and a fixed 16:9 preview box. The audit now flags any dialog left open by a step (as a WARN naming the dialog) and screenshots failures before cleaning up.
- Captions and dubbing ran as NOTE (not FAIL) in the audit: the build sandbox can't reach huggingface.co to download Whisper. CI's real-models job covers them.
- AI tool audit (`e2e/ai_tools_audit.mjs`, re-run 2026-11-07): 120/120 tool pages pass. The 49 working tools show their full workspace; the 71 that need a key or aren't built are hidden ("isn't available yet", nothing to run). 40 of 49 executed successfully; the other 9 (captions/transcript based) only failed because this sandbox can't download Whisper from huggingface.co, which CI's real-models job covers. 0 real failures. The audit was updated to check hidden tools are hidden (it still expected the old locked pages and crashed). Report: `docs/AI_TOOL_AUDIT.md`.
- Design sweep (12 pages × 4 widths): no horizontal scroll, no page errors. Security scans: 0 known vulnerabilities.
- Don't run two pytest sessions at once: they share the `creator_test` database and fail each other.
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
- **Object removal (basic, marked areas)**: Video tools → *Remove Object (marked area)* or Quick Actions → *Object Remove*. The user drags boxes on the clip's own frame; the worker fills each box from its surroundings on every frame (FFmpeg `delogo`, `backend/app/derive.py: remove_object`) and the cleaned copy is swapped in (Ctrl+Z restores). For logos, watermarks, timestamps, small objects with a still camera. No downloads, CPU only.
- Captions/SRT, translation and **multilingual dubbing studio** (self-hosted speech stack, see "Speech stack" below).
- AI voice (Kokoro and Piper, commercial-licence voices only).
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

**Business (profitability fixes 2026-11-07, see `docs/COST_MODEL.md` → Profitability review):**
- Premium AI is limited by a rupee credit per plan over a rolling 30 days, not runs per day; plus a platform-wide monthly wall. Every paying plan keeps a positive worst-case margin.
- Pro "priority" is real: Pro jobs are claimed first.
- Yearly plans: 12 months for the price of 10 (UPI flow, `months=12`).
- Public Pricing section on the landing page, from `/api/v1/public/plans` (same `PLANS` the payment flow charges).
- Billing card shows premium-AI credit used; the payment form no longer overflows in the Settings column.

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
- Paid-AI spend: plan credit per 30 days, per-workspace daily cap (`AI_DAILY_BUDGET_USD`, `AI_DAILY_PAID_RUNS`) and a platform-wide monthly wall (`AI_MONTHLY_BUDGET_USD`).
- `safeNext` redirect guard.
- Dependencies scanned 2026-11-07: `pip-audit` and `npm audit --omit=dev` both report **0 known vulnerabilities**. Upgrades: Pillow 12.3 → 13.0 (21 CVEs), rembg 2.0.67 → 2.0.87, react-router-dom 6 → 7.18.5 (open-redirect fix), `@grpc/grpc-js` pinned to ≥ 1.14.7 via `overrides` (only pulled in by Firestore, never shipped to browsers). Re-run both scans before each release.
- Login gives the same message for unknown email and wrong password; API responses carry `X-Robots-Tag: noindex`.
- `render.yaml` holds the Firebase **web** API key. That key is public by design, but restrict it to your domain in Google Cloud → APIs & Services → Credentials (HTTP referrer restriction).

**Google-friendly (SEO) and speed** (`backend/app/seo.py`, `tests/test_seo.py`):
- The server writes title, description, canonical URL, Open Graph / Twitter preview tags and robots rules into the HTML of every page; the home page also gets `SoftwareApplication` structured data and plain crawlable text before the app starts. Brand from `BRAND_NAME`, absolute URLs from `PUBLIC_BASE_URL` (**set it to the real domain in production**).
- Public pages (`/`, `/signup`, `/signin`, `/privacy`, `/terms`) are indexable; signed-in pages are `noindex`; unknown paths return a real **404**.
- `/robots.txt` and `/sitemap.xml` are generated; `frontend/public/og.png` is the 1200×630 link-preview image (no brand name on it, so it survives the rename).
- Signed-in pages are lazy-loaded: the JavaScript a visitor downloads for the landing page dropped from 703 KB to 246 KB (80 KB gzipped).
- The server re-reads `index.html` when a new build replaces it, so a rebuild without a restart no longer serves stale asset names.

**Landing page hero** follows the founder's photo of the localhost:3000 "YouTubeBuddy" design: a centred "Create like a studio with AI" headline over a twinkling star-field canvas with soft light beams, a "New: object removal" pill, a glowing "Start for free" button, and a true trust line (free plan, no card, UPI). Glass stat cards show **real numbers only** (live AI tools, workspaces, title scripts, ₹0 to start), by founder decision: no invented user counts, ratings or "viral rate" figures. Add user counts only once they are real, from the database. There's no "Watch demo" button until a demo video exists.

**Landing page 3D / motion** (`frontend/src/pages/LandingHero.tsx`, `landing.css`): pure CSS 3D (no WebGL library). A studio scene (editor window with moving playhead, floating Captions / 9:16 Short / Dub ready / colour-wheel cards) tilts toward the pointer; cards tilt with a spotlight on hover; sections rise into view on scroll; animated border on the call-to-action band; rising sparks behind the final section. All motion stops under `prefers-reduced-motion`, and content is only hidden for the reveal once JavaScript runs (crawlers see everything). Every element shows a real feature.

**Design checks (2026-11-07):** every main page at 390 / 768 / 1366 / 1920 px has no horizontal scroll and no page errors (signed-in pages included). Dim text colours were raised to pass WCAG AA (≥ 4.5:1): landing `--lp-text-3` → `#878c83`, app `--text-3` → `#8a8fc4`. Phone fixes: the editor dashboard's top bar and tiles, and the shared top bar (search moves to its own row).

**Removed from the screens until built** (listed in `docs/HIDDEN_FEATURES.md`): Motion Tracking / Mask & Roto "Soon" rows, the "blur, glow, sharpen, keying are planned" note, greyed YouTube / Automation editor tabs, the disabled notifications bells (editor dashboard and editor top bar), AI Magic checklist items Magic doesn't do, non-ready engines in status lists, studios with no live tool on the landing page, and the outdated Razorpay note.

**Speech stack** (`backend/app/speech/`, 2026-11-07); full details in `docs/DUBBING_LANGUAGES.md` and `docs/DUBBING_EVAL.md`:
- **Pinned models:** `models.lock.json` pins 135 files (10.4 GB including Whisper medium; ~8.9 GB for all languages with Whisper small), each by exact revision + SHA-256.
- **Startup check:** `python -m app.speech.assets prefetch | verify | list | lock`. In production (`MODELS_REQUIRED`), the worker downloads, hash-checks and **load-tests every model before taking any job**, and retries every 5 minutes if one fails. With `MODELS_OFFLINE=1`, nothing ever downloads; a missing or altered file is an error. Offline verify: 29 s, 1.2 GB peak RAM.
- **Engines:**
  - speech-to-text: Whisper small (MIT), with per-sentence language detection for mixed speech;
  - translation: Argos (CTranslate2; SentencePiece *and* BPE packages; non-English pairs go through English; at most 3 language pairs kept in memory);
  - voices: Kokoro-82M (Apache-2.0: Hindi ×4, English ×5, Spanish, French, Italian, Portuguese BR, Japanese, Chinese) plus Piper voices with CC0/CC-BY licences (20 more languages);
  - speakers: WeSpeaker ResNet34 ONNX (CC-BY-4.0) + clustering.
- **Licence fix:** both Hindi Piper voices (Pratham, Priyamvada) and several English ones were **CC BY-NC-SA, non-commercial** and must not be used in a paid product. They are removed; Kokoro voices replace them, keeping the same voice IDs (`hi-female`, `hi-male`, `en-female`…).
- **Dubbing studio** (editor → Voice panel → *Open Dubbing Studio*; API `/dub/languages`, `/media/{id}/dubs`, `/dubs/{id}`, `/dubs/{id}/targets`, `/dubs/{id}/render`; table `dubs`, migration 0008):
  - spoken language auto-detected, with manual correction (which re-recognises the speech);
  - mixed-language sentences marked and translated from their own language;
  - speakers detected and renameable, one consistent voice per speaker per language;
  - transcript and translation editing, with a version check against lost edits;
  - up to 10 target languages per video;
  - render per language: voice on original timing (up to 1.45× speed-up, overruns reported), original audio ducked under speech;
  - outputs: **dubbed MP4, mixed M4A, voice-only WAV, SRT, VTT**, plus MP4/M4A added to the media bin;
  - one render per language per revision: a double click doesn't render twice.
- **Paid speech APIs:** OpenAI is no longer used for captions, translation or dubbing (it bypassed plan credits). Dubbing costs ₹0, CPU time only.

**Writing tools on a free self-hosted model:** `LLM_BASE_URL` points to an OpenAI-compatible server such as llama.cpp, with no key and ₹0 per run. It was tested with Qwen2.5-1.5B-Instruct (Apache-2.0); real outputs are in `docs/WRITING_TOOLS_EVAL.md`.
- Only the 6 tools that passed review are enabled (`LLM_LOCAL_TOOLS`, default `052,054,055,056,057,059`), and in **English only**: Hindi requests came back in English, so other languages are refused with a clear message.
- The Director Agent, the scorers and the SEO analyzer gave misleading output and stay hidden until a Claude/OpenAI key is set.
- Hosted writing models are untested here (no key): run `backend/scripts/eval_writing.py` after adding one.

**Duplicate-job protection:**
- AI tool runs accept an `Idempotency-Key` header, which the frontend sends on every click. Without one, an identical run from the same person that is still queued in the last 15 s is reused. A double click never pays twice.
- Dub prepare, translate and render are keyed per dub and revision.

**Developer account (2026-11-08):** emails in `DEVELOPER_EMAILS` (set in `render.yaml` to the developer's address, also in `ADMIN_EMAILS`) get the Pro plan on every sign-in (`billing.apply_developer_benefits`, expiry 2100). In production this applies only to a Google-verified email, so typing the address into the password sign-up gets nothing. Developer payouts come later.

**Connect channel + My channel (2026-11-08):**
- A red YouTube button next to the profile name in every top bar (`components/ChannelButton.tsx`, rendered by `UserMenu`). It reads "Connect channel", or the channel name once connected, and opens `/channel` (`pages/Channel.tsx`).
- It is hidden until the YouTube OAuth keys are set; platform admins see it earlier, together with the set-up steps.
- `GET /youtube/insights` (`app/channel_insights.py`) reads the user's channel, last 50 uploads and video stats with their own OAuth token: about 3 quota units, cached 10 min, a forced refresh at most once a minute.
- Every number comes from the channel's own history, and the page says so:
  - next-video views range = p25–p75 of the last 15 videos of the same format that are at least 3 days old, plus the trend;
  - best weekday and 3-hour time slot (in the viewer's time zone), video length, Shorts vs long;
  - title words that go with above/below-usual views, top videos, and "follow-up" ideas;
  - tips need at least 3 videos per group;
  - fewer than 5 mature videos → no estimate, with a clear message.
- OAuth now returns to `/channel` when started there.
- Tested: `test_channel_insights.py`, plus a browser run of connect → insights against a fake Google server on desktop and phone, with no console errors and no horizontal scroll.
- Also fixed: the CSP blocked Pexels/Pixabay thumbnails and would block YouTube thumbnails. Their image hosts are now allowed only when the matching key is set. The Creator Scout's User-Agent carries the site URL.

**Firebase status (checked 2026-11-08 via the public Identity Toolkit API):** project `ytbuddy-3`, Google provider **enabled**; authorized domains are only localhost, ytbuddy-3.firebaseapp.com and ytbuddy-3.web.app. youtubebuddy.com and www.youtubebuddy.com were **added** (verified 2026-11-08). The browser key is now **locked to website referrers** (verified: requests without a referrer are refused, requests from youtubebuddy.com work). The founder reports the public-facing name was renamed and the BigRock DNS pointed at Render; the build sandbox can't reach the live site to confirm. All four FIREBASE_* values are in `render.yaml`, and the local app shows "Continue with Google" with them. The domain is **youtubebuddy.com** (BigRock DNS); the support email is youtubebuddyhelp@gmail.com.

**Go-live guide:** `docs/GO_LIVE_GOOGLE.md` covers domain and email, Search Console, Firebase Google sign-in, the OAuth consent screen and verification, the YouTube API audit, Pexels/Pixabay and Creator Scout, plus a smoke test. Real feeds and stock APIs could not be called from the build sandbox: its network policy blocks them and the request to allow them was rejected. They are covered by fake-server tests only.

**₹0 hosting (2026-11-08, founder has no budget for Render's ~$42/month):** `deploy/home/` runs the full production stack on the founder's own PC (Docker Desktop) and publishes it at https://youtubebuddy.com through a free, locally managed **Cloudflare Tunnel** (no card, no open ports). Step-by-step for Windows: `deploy/home/README.md`.
- Services: Postgres 16, **RustFS 1.0.4** (Apache-2.0, S3-compatible, pinned by digest), web, worker (models volume), cloudflared.
- MinIO no longer publishes free Docker images, so the dev `docker-compose.yml` uses RustFS now too. RustFS passed every storage call the app makes (multipart upload, list/complete, signed range GET). SeaweedFS 3.97 failed the upload.
- Files are served on the same site at `youtubebuddy.com/youtubebuddy-media/...` (a tunnel path rule sends that path to storage), so no CORS is needed.
- New: `www.` gets a 301 redirect to `PUBLIC_BASE_URL` in production (`main.py`, tested).
- `make_env.py` writes random secrets into `deploy/home/.env` (git-ignored, never overwritten). Storage refuses to start without it.
- Tested in the sandbox with a simulated tunnel: health, Google sign-in config, CSP, HSTS, secure cookie, upload → worker → ready → signed playback (206), www redirect. **Not tested:** the real `cloudflared tunnel login/create`, which needs the founder's Cloudflare account.
- Limits: the site is down when the PC is off; Cloudflare's free plan isn't meant for heavy video streaming. For scale, move to R2 + paid hosting (`render.yaml`).
- **Azure for Students** ($100/yr, no card): `deploy/azure/README.md` + `deploy/azure/setup.sh` (installs Docker and 4 GB swap, clones the repo, creates .env, sets `MT_MAX_LOADED=1`). It runs the same `deploy/home` stack on a B2s VM (2 vCPU, 4 GiB) in Central India, about 3 months of credit. The script is syntax-checked and its .env step tested; the full script hasn't run on a real VM yet.
- **Founder's server:** an old ASUS laptop (i3-6006U, 8 GB RAM, 233 GB SSD + 1 TB HDD, Ubuntu 24.04) running 24/7. Guide: `deploy/home/LINUX_LAPTOP.md`. `deploy/home/laptop-server.sh` sets no sleep with the lid closed, Docker at boot, runs `deploy/azure/setup.sh`, and adds a daily pg_dump at 03:30 (14 days, `BACKUP_DIR`, HDD). Syntax-checked; not run on the real laptop (no access from the sandbox).
- Next step for the founder: move the youtubebuddy.com nameservers from BigRock to Cloudflare (README §2). That also fixes the current NXDOMAIN.

### Growth system (`/growth`, Nov 2026)
Ten pages, `routers/growth_studio.py`, `growth_engine.py`, `growth_produce.py`, `growth_cycle.py`, migration 0009. Full detail: `docs/GROWTH.md`.
Tests: `tests/test_growth_studio.py` (4) and `e2e/growth.mjs` (11/11).

## 4. Incomplete / unverified / known issues
- **Hidden until keys are set** (`docs/HIDDEN_FEATURES.md`):
  - Lip sync (tool 033) and the AI Generator's text-described object removal (tool 024) need `FAL_KEY`. The editor's basic marked-area object removal is always on.
  - Stock library needs `PEXELS_API_KEY` or `PIXABAY_API_KEY` (free).
  - YouTube publishing needs a Google OAuth client.
  - 71 of 120 AI tools: 44 need fal.ai, the rest need an LLM key or `YOUTUBE_API_KEY`.
- **Not built:** speaker diarization (107), scheduled workflows (117), motion tracking, masks, HSL qualifiers, nested sequences, roll/slip/slide, 4K/ProRes/HDR export, email (verification, reset, invites), MFA, malware scanning, metrics/alerts.
- **Unverified live:**
  - Google sign-in popup: needs the Firebase console steps in `docs/GO_LIVE_GOOGLE.md` §1.
  - Connect channel / My channel with a real Google account (needs the OAuth client; in Testing mode Google expires connections after 7 days).
  - **Brand risk:** Google OAuth verification and YouTube branding rules may reject "YouTube"/"youtubuddy"-like names; rename (`BRAND_NAME`, domain) before requesting verification.
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
  - AI models are not trained in-house: the free features use ready-made open models (Whisper, Argos, Piper, U²-Net); better models are swapped in (see §5), training needs GPUs and data the project doesn't have.
  - Basic object removal fills fixed boxes only: it does not track moving objects, and large areas or busy textures come out smooth/blurred (≤ 25 % of the frame per box). An object cut off by the frame edge can leave a faint streak.
- **Licensing for the next steps:**
  - Lip sync: use MuseTalk (MIT) or LatentSync (Apache-2.0), not Wav2Lip weights (non-commercial).
  - Object removal: SAM 2 + LaMa (Apache-2.0), not ProPainter (non-commercial).

## 5. Next priorities
1. **Launch prep** (founder): rename, run `deploy/home` (₹0) or deploy on Render, follow `docs/GO_LIVE_GOOGLE.md` (Firebase, OAuth client and verification, YouTube audit, Pexels/Pixabay keys), set the env vars below, upload the QR codes, make the repo private, onboard the first 20 creators. See `docs/` and the project doc LAUNCH_PLAYBOOK.
2. **Object removal, next level:** the basic marked-area version is live (see section 3). Upgrade path: SAM 2 (click to mask, tracks the object across frames) + LaMa (realistic fill) per frame, short clips, on the existing worker. Plug in as a second engine behind the same `remove_object` derive op and dialog. Needs huggingface.co access to download weights (blocked in the build sandbox).
3. **Lip sync on CPU:** MuseTalk with a 10 s limit and queue. A rented GPU later.
3a. **Dubbing quality next steps** (measured gaps, `docs/DUBBING_EVAL.md`):
    - Whisper medium for Hindi on a 4 GB worker;
    - misaki ja/zh phonemizer to re-enable Japanese/Chinese voices;
    - IndicTrans2 + Indic Parler-TTS for Tamil/Telugu/Marathi/Bengali (`docs/FINE_TUNING_PLAN.md` §2);
    - vocal separation (e.g. Demucs, MIT) to remove the original voice instead of ducking it.
    
    Fine-tuning is a separate phase with its own dataset, budget and evaluation plan (`docs/FINE_TUNING_PLAN.md`).
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
- **Limits / budget:** `AI_MONTHLY_BUDGET_USD`, `AI_DAILY_BUDGET_USD`, `AI_DAILY_PAID_RUNS`, `PAID_RUN_FLOOR_USD`, `USD_INR`, `AI_RUNS_PER_10MIN`, `UPLOADS_PER_10MIN`, `FREE_PLAN_AI_CREDIT_INR`, `FREE_PLAN_WATERMARK`
- **Billing / admin:** `ADMIN_EMAILS`, `DEVELOPER_EMAILS`
- **YouTube publishing:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (same value on web and worker)
- **AI providers (optional):** `FAL_KEY`, `FAL_QUEUE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `LLM_MODEL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_TEXT_MODEL`, `YOUTUBE_API_KEY`, `YOUTUBE_API_URL`
- **Stock:** `PEXELS_API_KEY`, `PIXABAY_API_KEY`
- **Local models / speech stack:** `MODEL_CACHE`, `WHISPER_MODEL` (`small` default, or `medium`), `PIPER_BIN`, `MODELS_REQUIRED`, `MODELS_OFFLINE`, `DUB_SOURCES`, `DUB_TARGETS` (comma lists or `all`), `MT_MAX_LOADED`, `WHISPER_THREADS`
- **Self-hosted writing model:** `LLM_BASE_URL`, `LLM_LOCAL_MODEL`, `LLM_LOCAL_TOOLS`, `LLM_MAX_TOKENS`, `LLM_TIMEOUT`
- **Agent:** `AGENT_ENABLED`, `AGENT_RESEARCH_HOURS`, `AGENT_SOURCES`
- **Test-only overrides:** `REAL_MODELS`, `GOOGLE_TOKEN_URL`, `GOOGLE_AUTH_URL`, `GOOGLE_REVOKE_URL`, `YOUTUBE_UPLOAD_URL`, `PEXELS_API_URL`, `PIXABAY_API_URL`

## 8. AI integrations and model locations
| Engine | Used for | Where the model comes from | Status |
|---|---|---|---|
| faster-whisper small (MIT; `WHISPER_MODEL`) | captions, transcripts, dub, per-sentence language | pinned HF revision → `$MODEL_CACHE/whisper/small` | VERIFIED offline (DUBBING_EVAL.md) |
| Argos Translate (71 packages, SPM + BPE) | translation, 45 sources × 28 targets via English | argos-net.com, pinned versions + SHA-256 → `$MODEL_CACHE/argos` | VERIFIED offline (every pair load-tested) |
| Kokoro-82M ONNX (Apache-2.0) | Hindi/English/es/fr/it/pt/ja/zh voices | GitHub release `model-files-v1.0` → `$MODEL_CACHE/kokoro` | VERIFIED offline |
| Piper (MIT) + 25 CC0/CC-BY voices | 20 more voice languages | pinned GitHub release + HF `rhasspy/piper-voices` @ v1.0.0 → `$MODEL_CACHE/piper*` | VERIFIED offline |
| WeSpeaker ResNet34 ONNX (CC-BY-4.0) | speaker labels | pinned HF revision → `$MODEL_CACHE/wespeaker` | VERIFIED (eval) |
| rembg u2netp | background removal | downloaded by rembg on first use (home cache) | VERIFIED (tests) |
| FFmpeg / vid.stab / OpenCV / Pillow + HarfBuzz | editing, export, stabilise, analysis, titles | system packages / pip | VERIFIED |
| fal.ai queue (Veo, Kling, Seedance, Wan, FLUX, Nano Banana, ElevenLabs, Sync lip sync, OmniHuman, Tripo…) | 44 hosted tools | remote API, `FAL_KEY` | MISSING KEY, code tested with a fake provider |
| Claude / OpenAI (`LLM_MODEL`) | writing tools, Director agent, Creator Scout AI mode | remote API | MISSING KEY, tested with a fake server |
| YouTube Data API v3 | trend tools (public data) + publishing (OAuth) | remote API | MISSING KEY/CLIENT, tested with a fake server |
| Wan 2.2 TI2V-5B (diffusers) | GPU pilot only | Hugging Face, run on Kaggle via `gpu/youtube_buddy_x_wan_pilot.ipynb` | NOT integrated in the app; Kaggle run unverified |
| FFmpeg `delogo` | basic object removal (marked areas) | system FFmpeg | VERIFIED (tests + audit) |
| MuseTalk / LatentSync, SAM 2 + LaMa | planned lip sync / object-removal upgrade | — | NOT STARTED |

No model weights are committed to the repo; everything downloads on first use into `MODEL_CACHE`. On Render, mount a persistent disk there so models aren't re-downloaded.
