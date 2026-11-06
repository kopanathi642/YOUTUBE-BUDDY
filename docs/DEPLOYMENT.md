# Putting Creator Universe online (founder guide)

Everything is prepared in the repository. Going live needs **three accounts that only you can create** (they need your identity and a payment card). No passwords or keys should ever be pasted into chat — you type them into each provider's dashboard.

| What | Provider | Why this one | Monthly (launch scale) |
|---|---|---|---|
| Code + automatic tests | GitHub | Render deploys from it; CI runs on every push | Free |
| Web app + render worker + database | Render (region: Singapore, closest to India) | Runs Docker, always-on background worker, managed Postgres, HTTPS | ≈ $38 |
| Media storage | Cloudflare R2 | Private S3-compatible storage, **no download (egress) fees** — crucial for video | ≈ $0–2 for the first 100 GB |

## Step 1 — GitHub
1. Create a GitHub account (or use yours) and an **empty private repository**, e.g. `creator-universe`.
2. In claude.ai → Settings → Connectors, connect GitHub so Claude can push the code for you. (Or download the project zip and upload it to the repository yourself.)

## Step 2 — Cloudflare R2 (media storage)
1. Sign up at cloudflare.com → **R2 Object Storage** → enable (needs a card; 10 GB/month is free).
2. **Create bucket** → name `creator-media-prod`, location hint *Asia-Pacific*. Leave public access **off**.
3. Bucket → **Settings → CORS policy** → paste (replace the URL with your Render URL from step 3):
   ```json
   [{"AllowedOrigins":["https://creator-universe-web.onrender.com"],
     "AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],
     "ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
   ```
   `ETag` must be exposed or browser uploads cannot complete.
4. R2 → **Manage API tokens → Create token** → permission *Object Read & Write*, scoped to this bucket only. Keep the page open: you need **Access Key ID**, **Secret Access Key** and the **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).

## Step 3 — Render (app, worker, database)
1. Sign up at render.com with your GitHub account.
2. **New → Blueprint** → pick the repository. Render reads `render.yaml` and proposes: `creator-db` (Postgres 16), `creator-universe-web`, `creator-universe-worker`.
3. It asks for the secret values (`sync: false`). Enter:
   - `S3_ENDPOINT_URL` = the R2 S3 endpoint
   - `S3_BUCKET` = `creator-media-prod`
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` = from the R2 token
   - `CORS_ORIGINS` = your web URL, e.g. `https://creator-universe-web.onrender.com`
4. **Apply.** Render builds the Docker image, runs `alembic upgrade head` (database migrations), starts the web app and the worker.
5. Open `https://<your-web-url>/api/v1/health` → must show `"database":"ok","storage":"ok"`.
6. Open the web URL → sign up → create a project → upload → export. The export keeps rendering even if you close the laptop.

> If Render rejects a plan name in `render.yaml` (it renamed instance types in 2026), choose the equivalent in the dashboard: web **512 MB**, worker **1 CPU / 2 GB**, Postgres **256 MB**.

## Step 3b — Google sign-in (your Firebase project `ytbuddy-3`)
`render.yaml` already sets `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_DOMAIN` and `FIREBASE_API_KEY` (public values by design). In the Firebase console:
1. **Authentication → Sign-in method → Google → Enable** (set a support email).
2. **Authentication → Settings → Authorized domains → Add domain**: your Render host (e.g. `creator-universe-web.onrender.com`) and later your own domain. Without this, the Google window shows `auth/unauthorized-domain`.
3. **Project settings → Your apps → Web app** → copy the real `appId` (looks like `1:303749195157:web:` + hex) into Render's `FIREBASE_APP_ID` (optional, but don't use `…web:ytbuddyx`, which isn't valid).
4. Google Cloud console (same project) → **APIs & Services → Credentials → the "Browser key"** → *Application restrictions: Websites* → add your app domains, so nobody can use the key from other sites.
5. **OAuth consent screen**: app name, logo, support email, privacy-policy URL. Only basic scopes (email, profile) are requested, so no Google review is needed. Do **not** add YouTube scopes yet: `youtube.readonly` requires Google's verification review and will be requested later, only when a YouTube feature is switched on.

How it works: the browser signs in with Google through Firebase, sends the ID token once to `POST /api/v1/auth/google`, the backend verifies the signature against Google's public keys (plus project, issuer, expiry, verified email) and starts its normal session. A Google user whose email matches an existing account is linked to it.

## Step 4 — Your domain youtubebuddy.com (BigRock)
1. Render → `creator-universe-web` → **Settings → Custom Domains → Add**: `youtubebuddy.com`, then add `www.youtubebuddy.com`.
2. BigRock → **My Account → Manage Orders → List/Search Orders → youtubebuddy.com → DNS Management** (if it says "Manage DNS" first, activate it). Then:
   | Type | Host / Name | Value | TTL |
   |---|---|---|---|
   | **A** | `@` (blank / root) | `216.24.57.1` | 3600 |
   | **CNAME** | `www` | `creator-universe-web.onrender.com` (your exact Render host) | 3600 |
   Delete any other **A** or **AAAA** records for `@` and `www` (BigRock parking or forwarding records), and switch off BigRock "Domain Forwarding" if it is on.
3. Back in Render press **Verify** on both domains. HTTPS certificates are issued automatically (minutes to a few hours while DNS spreads).
4. Update settings to the new address:
   - Render env `CORS_ORIGINS` = `https://youtubebuddy.com,https://www.youtubebuddy.com`
   - R2 bucket CORS `AllowedOrigins` = the same two URLs
   - Firebase → Authentication → Authorized domains → add `youtubebuddy.com` and `www.youtubebuddy.com`
5. Optional: set Render env **`BRAND_NAME`** to the name you want shown in the app (default "Creator Universe").

## Naming warning (please read before launch)
You plan to use **youtubebuddy.com** and the name “YouTube Buddy X”. YouTube’s API branding rules forbid using “YouTube” (or look-alikes) in an app/company name or domain if you integrate their API, and using it could create trademark problems even without the API. The app currently uses the working name **Creator Universe**. Google's OAuth/YouTube API review is likely to reject an app whose name or domain contains “YouTube”, and Google may send a trademark complaint. It is your decision; the brand shown in the app is one setting (`BRAND_NAME`), so you can switch later without code changes. A common pattern: launch on a non-YouTube domain and point youtubebuddy.com at it as a redirect.

## Step 5 — AI tools (free by default)
Everything below runs on your own render worker with open-source models — no AI subscription needed:
| Tool | Engine | First use online |
|---|---|---|
| AI voice / text to speech, dubbing voices | Piper | downloads each voice once (~20–60 MB) |
| Captions, transcript, dubbing (speech-to-text) | Whisper "small" (faster-whisper) | downloads ~460 MB once from huggingface.co |
| Caption translation, dubbing (translation) | Argos models via CTranslate2 | downloads ~100 MB per language pair once |
| Background removal | U²-Net (u2netp) | downloads 5 MB once from GitHub |
| Stabilization, scene/silence detection, auto colour, loudness | FFmpeg / OpenCV | nothing to download |

`render.yaml` gives the worker a 5 GB disk at `/var/models` so these downloads survive restarts. **First job after deploy is slower** while a model downloads. Captions and translation could not be test-run inside the build sandbox (Hugging Face is blocked there) — run one caption job right after your first deploy to confirm.

Optional: add `OPENAI_API_KEY` in Render → Environment to use OpenAI for captions and translation instead (better accuracy for Hindi/Hinglish; costs per minute). Not available yet: lip sync and object removal (need GPU providers).

## Operating it
* **Deploys:** every push to `main` → CI runs tests → Render auto-deploys. Roll back from Render → *Deploys → Rollback*.
* **Scaling renders:** increase the worker instance count (each worker renders one job at a time) or size. Per-workspace concurrency is capped by `MAX_CONCURRENT_EXPORTS_PER_WORKSPACE` (default 2).
* **Backups:** Render Postgres paid plans include daily backups; test a restore into a new database once before launch. R2 originals are never modified by the app.
* **Logs:** Render → service → *Logs*. Every request has an `x-request-id`; logs never contain passwords, tokens or signed URLs.

## Local development
```bash
# Option A — Docker (needs Docker Desktop)
docker compose up --build      # → http://localhost:8000
# Option B — without Docker: Postgres 16 + ffmpeg installed
cd backend && pip install -r requirements.txt -r requirements-dev.txt
moto_server -p 9000 &           # local S3 emulator
cp ../.env.example .env && alembic upgrade head
uvicorn app.main:app --reload & python -m app.worker &
cd ../frontend && npm ci && npm run dev   # → http://localhost:5173
```
Tests: `cd backend && pytest` · `cd frontend && npm test && npm run typecheck`.
