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
2. Access rule (tailnet policy): the only allowed flow is **HP → ASUS port 443**.
   ```json
   {"tagOwners": {"tag:server": ["autogroup:admin"], "tag:gpu-worker": ["autogroup:admin"]},
    "acls": [{"action": "accept", "src": ["tag:gpu-worker"], "dst": ["tag:server:443"]}]}
   ```
   No rule points at the HP, so nothing can connect to it, from the internet or from the tailnet.
3. ASUS: `tailscale serve --bg --https=443 http://127.0.0.1:8000`. This puts the app on the private tailnet name with Tailscale's HTTPS certificate. Docker, compose and the public tunnel are untouched.
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

## Decision needed now: writing tools on the live site

| Option | What happens | Risk |
|---|---|---|
| **A. Hide them honestly until the HP takes over (recommended)** | Change the 6 tools' status to "temporarily unavailable" by emptying `LLM_BASE_URL` in `.env`, then `docker compose up -d web worker` (~30–60 s of restart). `COMPOSE_PROFILES=llm` stays, the `llm` container stays as it is. | Tools unavailable until the HP is live, but users no longer hit errors |
| B. Restart the `llm` container as it is | Tools work again | It may freeze Docker again: 4 GB limit inside a 3.77 GB Docker VM; it happened on 12 Nov |
| C. Leave as is | Nothing changes | Users see "ready", run the tool and get an error |

Rollback for A: put the old value back, the same one-line edit, then `docker compose up -d web worker`.
