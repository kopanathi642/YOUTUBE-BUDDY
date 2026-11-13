# HP worker: secure connection and job routing plan (for approval)

## What depends on the writing model today (checked in code)

`LLM_BASE_URL=http://llm:8080` (set) and `GROQ_API_KEY` (empty), so every call to `providers.llm_json` goes to the ASUS `llm` container:

| Caller | How it runs | Users see |
|---|---|---|
| The 6 approved writing tools: 052 Hook Generator, 054 Description & Tags, 055 Story Structure, 056 Dialogue Writer, 057 Script to Shot List, 059 Social Post Writer | queued `ai.tool` jobs (worker) | tool pages |
| Tool pipelines that write chapters/summaries (`tools/pipelines.py`) | inside other `ai.tool` jobs | tool pages |
| Growth engine blueprint (`growth_engine.py`) | `growth.*` jobs | Growth Studio |
| Growth Studio coach (`routers/growth_studio.py`) | **directly inside a web request** (not queued) | Growth Studio chat |

**Today's state:** the `llm` container stopped 23 h ago (exit 137), but tool 052 still reports `"state":"ready"` on the live site. So right now these features probably fail when used. **Decision needed, see the end.**

## Connection: Tailscale, HP calls out, nothing calls the HP

1. Install Tailscale on both laptops; you sign in yourself. Tags: ASUS `tag:server`, HP `tag:gpu-worker`.
2. Access rule (tailnet policy): the only allowed flow is **HP → ASUS port 80 (inside the tailnet)**.
   ```json
   {"tagOwners": {"tag:server": ["autogroup:admin"], "tag:gpu-worker": ["autogroup:admin"]},
    "acls": [{"action": "accept", "src": ["tag:gpu-worker"], "dst": ["tag:server:80"]}]}
   ```
   No rule points at the HP, so nothing can connect to it, from the internet or from the tailnet.
3. ASUS (Administrator console): `tailscale serve --bg --http=80 http://127.0.0.1:8000`. Serve is tailnet-only (Funnel, the public variant, is never used). Plain HTTP is deliberate: WireGuard already encrypts every packet between the laptops, and Tailscale's HTTPS mode would publish the machine names in public Certificate Transparency logs. Docker, compose and the public tunnel are untouched.
4. **Second lock against the public internet:** the worker API is also reachable on 127.0.0.1:8000, which the public tunnel serves. Add one Cloudflare Tunnel rule *above* the others:
   ```yaml
   - hostname: youtubebuddy.com
     path: ^/api/v1/worker/
     service: http_status:404
   ```
   (same for www). The public internet then can't even reach the worker API; the HP reaches it only over Tailscale. This is a production config change: approval required, one tunnel container restart (a few seconds).
5. Worker identity: from the admin page you create a worker; its token is shown **once**. The ASUS stores only a SHA-256 hash; you can revoke it with one click. Every worker call carries `Authorization: Bearer <token>`. An unknown, revoked or paused worker gets 401/403 and claims nothing.
6. Reconnect: the HP worker retries with backoff (2 s doubling to 60 s) and re-checks readiness after every reconnect.

## Worker API (inside the existing backend; additive)

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/worker/heartbeat` | every 15 s: readiness, GPU name, free VRAM, RAM, disk, loaded models, app version |
| `POST /api/v1/worker/claim` | atomic claim from the `gpu` queue (existing `FOR UPDATE SKIP LOCKED`), only jobs that fit the reported free VRAM |
| `POST /api/v1/worker/jobs/{id}/progress` | renews the lease (existing heartbeat); replies `cancel: true` if the user cancelled |
| `GET /api/v1/worker/jobs/{id}/inputs/{n}` | streams one input file from storage (storage stays private; no keys on the HP) |
| `PUT /api/v1/worker/jobs/{id}/outputs/{name}?part=k` | 16 MB parts into a staging prefix |
| `POST /api/v1/worker/jobs/{id}/complete` | list of outputs with SHA-256 + size; the ASUS re-hashes the staged files, and only on a match moves them to the final keys and marks the job succeeded |
| `POST /api/v1/worker/jobs/{id}/fail` | error + retryable flag (existing bounded retries with 10 s × 2^attempt backoff) |

Database (one additive migration): new table `workers` (id, name, token_hash, capabilities, last_heartbeat, paused, revoked_at), plus a `gpu_paused` platform setting. No existing column changes.

## Job routing

| Job | Queue | When the HP is offline |
|---|---|---|
| Writing (`ai.tool` for tools with engine `llm`), growth blueprints | `gpu` (HP's local Qwen3-4B on CUDA) | waits; status "Waiting for GPU worker" |
| Growth Studio coach (direct web request) | becomes a short queued job, or keeps a direct call to the HP's model through the worker channel (decide during build) | shows "Writing model offline, try later" |
| Transcription, dubbing speech-to-text | `gpu` if an HP heartbeat is under 2 min old, otherwise `media` (ASUS CPU, current model) | runs on the ASUS as today |
| Exports / renders | stays on the ASUS (`render`) until NVENC output is proven identical to the preview | unchanged |
| Everything else | unchanged | unchanged |

Global switch `GPU_WORKERS_ENABLED` (default **false**). Off = everything routes exactly as today. The admin **Pause GPU jobs** switch stops new GPU claims without touching the website.

## Order of switching (no step until the previous one passes)

1. Build the worker API + migration + tests; deploy with the switch **off** (site behaves exactly as now).
2. HP set up (H0–H4), worker online, heartbeats visible on the admin page.
3. Shadow test: on the HP, run the 6 tools' eval cases (`scripts/eval_writing.py` brief set) against its local model; compare with `docs/WRITING_TOOLS_EVAL.md`.
4. Switch on routing **for writing jobs only**. Real tests on the live site: run each of the 6 tools once, as you, with the HP on (expect success) and with the HP off (expect "Waiting for GPU worker", then success when it comes back).
5. Only when step 4 passes for all 6 tools: remove `COMPOSE_PROFILES=llm` and `LLM_BASE_URL` from the ASUS `.env` and recreate web + worker (~1 min). Tool status then comes from the HP's heartbeat instead of `LLM_BASE_URL`.
6. Then run the 18 integration tests.

## Design check (13 Nov, from Tailscale's docs and this repo's code)

| Question | Answer | Consequence |
|---|---|---|
| Is `tailscale serve` public? | No: "available only within the tailnet"; Funnel is the public feature | Don't run Funnel. Verify with test N1 |
| Can Tailscale identity headers authenticate the HP? | No: they "are not populated for traffic originating from tagged devices" (serve strips spoofed copies) | The worker token is the credential |
| Does the HP need any open port? | No: no rule targets `tag:gpu-worker` | The HP only makes outgoing connections |
| Windows Firewall changes? | None. Tailscale manages its own adapter; serve listens only on the tailnet | No firewall changes on either laptop |
| Does the worker key expire? | Tagged devices have key expiry off by default | Worker keeps working unattended |
| Could the worker API be reached through the public tunnel? | Yes, unless blocked: the tunnel forwards **every** path to web:8000 | **Three layers**, below |

Three layers keep the worker API off the public internet:
1. **Tunnel rule:** `^/api/v1/worker/` → `http_status:404` for both hostnames (Cloudflare never forwards it).
2. **App check:** worker routes refuse any request carrying `CF-Connecting-IP` or `CF-Ray`. Cloudflare sets these headers on every public request and a visitor can't remove them, so this holds even if layer 1 were ever misconfigured.
3. **Token:** a valid, unrevoked, unpaused worker token (stored only as a SHA-256 hash) is required on every call. A worker can see only the jobs it has claimed, and only those jobs' inputs.

### Networking tests before anything goes live (each recorded in OPS_CHANGELOG)

| # | Test | Expected |
|---|---|---|
| N1 | From a phone on mobile data (no Tailscale): `http://<asus-tailnet-name>/api/v1/health` | Does not load |
| N2 | From the HP: same URL | `"status":"ok"` |
| N3 | From the HP: any other ASUS port (e.g. 8000, 5432, 9000) | Connection refused or times out |
| N4 | From the ASUS: anything on the HP | Fails (no rule allows it) |
| N5 | Public: `https://youtubebuddy.com/api/v1/worker/heartbeat` | 404 from the tunnel rule |
| N6 | Over the tailnet, no token / wrong token / revoked token | 401 / 401 / 403 |
| N7 | Request with a forged `CF-Connecting-IP` over the tailnet | 403 (app check) |
| N8 | The live site during all of the above | Unchanged: health OK, sign-in works |

## Option A: the exact change, for approval (not applied)

What changes: one character in `deploy\home\.env`, a `#` in front of the `LLM_BASE_URL=` line. `COMPOSE_PROFILES=llm` and the `llm` container stay exactly as they are.

Why this way: `.env` has mixed Windows (CRLF) and Unix (LF) line endings, and a PowerShell rewrite could alter every line, including the passwords. A one-character `sed` edit leaves every other byte identical, and the old value stays in the file as a comment.

Steps:
1. Record the SHA-256 of `.env` (a hash reveals nothing).
2. `sed -i 's/^LLM_BASE_URL=/#LLM_BASE_URL=/' deploy/home/.env` (run by me through the device shell; it touches only that line).
3. Confirm only that line differs: the line count is the same, and only that line now starts with `#`.
4. You run, in `deploy\home`: `docker compose up -d web worker`. Only web and worker are recreated; db, storage, tunnel and llm aren't touched, and no image is rebuilt. Expect 30–60 s of "site unavailable" (error 502 through the tunnel). A job running at that moment is picked up again after its 60 s lease expires.
5. Verify: `/api/v1/health` returns ok; `/api/v1/ai/tools/052` shows `needs_key`; the worker container reports healthy; the editor opens.

Rollback: `sed -i 's/^#LLM_BASE_URL=/LLM_BASE_URL=/' deploy/home/.env`, then `docker compose up -d web worker` (the same 30–60 s).

No change without a restart is possible with today's code: tool status is read from environment variables and there's no runtime switch. The worker-API release will add an admin switch for tool availability (stored in `platform_settings`), so future pauses won't need a restart.
