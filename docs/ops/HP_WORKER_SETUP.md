# HP Victus 15: GPU worker setup (exact steps)

Role: `gpu-worker`. The HP never hosts the website or the database. It calls out to the ASUS, runs AI jobs, and sends verified results back. When it's off, the site keeps working and GPU jobs wait.

Each stage ends with a check. **Do not start a stage that installs software until you've approved it** (marked ⚠). Write each result in `docs/ops/OPS_CHANGELOG.md`.

## H0: Open Claude on the HP (2 min)

1. On the HP, open the **Claude desktop app** and sign in with the same account.
2. Start a new chat. Choose **"HP Victus 15"** when it asks which laptop you're on.
3. Click **Add folder** and connect `C:\Users\<you>\Downloads` (for the audit) and later the worker folder.
4. That chat checks the hardware (CPU must be i5-14450HX, GPU RTX 4050). If it doesn't match, it stops.

## H1: Read-only audit (5 min, installs nothing)

1. Download `deploy/hp-worker/AUDIT-HP.ps1` from GitHub (repo → that file → **Download raw**) into Downloads.
2. Right-click it → **Run with PowerShell**. If Windows blocks it: open PowerShell in Downloads and run
   `powershell -ExecutionPolicy Bypass -File .\AUDIT-HP.ps1`
3. It writes `audit-hp-report.txt` next to itself. The HP chat reads it.

Pass criteria: `nvidia-smi` lists the RTX 4050 with 6 GB; at least 60 GB free disk; 24 GB RAM.

## H2 ⚠: Base software on the HP (approve first, ~30 min)

Only what's missing from the audit, all free:

| Software | Why | Source |
|---|---|---|
| NVIDIA driver, current Studio or Game Ready | CUDA for the GPU | NVIDIA App (already on most Victus laptops) |
| Git for Windows | Get the worker code | git-scm.com |
| Python 3.11 (64-bit) | Worker runtime, in its own venv | python.org |
| FFmpeg full build (includes NVENC) | GPU video encoding | gyan.dev "ffmpeg-release-full" |
| Tailscale | Private, encrypted link to the ASUS | tailscale.com/download (you sign in yourself) |

Check: the audit re-run shows each tool, and `ffmpeg -encoders` lists `h264_nvenc`.

## H3 ⚠: Private network with Tailscale (approve first; touches the ASUS too)

Tailscale's free Personal plan allows 6 users and is free. **Tailscale describes it as for individual use, so check that its terms cover your business before relying on it.**

1. Install Tailscale on **both** laptops and sign in with the same account (you type your own sign-in; never share it).
2. In the Tailscale admin console, give each machine a tag: ASUS = `tag:server`, HP = `tag:gpu-worker`.
3. Access rules (the HP may talk to the ASUS, nothing else is allowed):
   ```json
   {"tagOwners": {"tag:server": ["autogroup:admin"], "tag:gpu-worker": ["autogroup:admin"]},
    "acls": [{"action": "accept", "src": ["tag:gpu-worker"], "dst": ["tag:server:443"]}]}
   ```
4. On the **ASUS**: `tailscale serve --bg --https=443 http://127.0.0.1:8000`. This publishes the app **only inside your tailnet**; Docker and the Cloudflare Tunnel stay as they are.
5. Check from the HP: `curl https://<asus-name>.<tailnet>.ts.net/api/v1/health` returns `"status":"ok"`. From a phone off Wi-Fi without Tailscale, the same address must **not** load.

Rollback: `tailscale serve reset` on the ASUS, then uninstall Tailscale. The public site is never affected.

## H4 ⚠: Worker environment on the HP (approve first, ~20 min + model downloads)

```powershell
git clone https://github.com/kopanathi642/YOUTUBE-BUDDY.git C:\YB-Worker
cd C:\YB-Worker
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cu126
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"   # must print True NVIDIA GeForce RTX 4050 ...
```
The exact CUDA wheel (`cu126`) is confirmed against the driver the audit finds.

Writing model on the HP: llama.cpp's Windows CUDA release (GitHub `ggml-org/llama.cpp` → Releases → `…bin-win-cuda-…x64.zip`), with the same Qwen3-4B Q4_K_M model the ASUS uses. It listens **only on 127.0.0.1**; the worker calls it locally, so nothing reaches it from the network. Expected use: about 3 GB of VRAM.

## H5: GPU worker app (built and tested; switched off on the server until you approve)

What exists now in the repo:
- `gpu-worker/worker.py`, the HP client. Python standard library only, nothing to `pip install`.
- `/api/v1/worker/*` on the server, plus admin controls at `/api/v1/admin/gpu*`.
- Both stay inactive until `GPU_WORKERS_ENABLED=true` (and `GPU_LLM=true` for the writing tools) is set on the ASUS.

How a writing-tool run flows:
1. The ASUS worker runs the tool up to the model call.
2. It parks the job in the `gpu` queue ("Waiting for GPU worker").
3. The HP claims it, runs Qwen3-4B on its GPU through its local llama.cpp, and returns only the text.
4. The ASUS validates the text and finishes the job with the existing code.

The HP never receives database or storage credentials.

Tested (pytest, real PostgreSQL, the real client against the API served by uvicorn):
- waits while no worker is online; the claim is atomic, with no second claim;
- lease expiry reclaims a job from a worker that died mid-job, and the dead worker can't complete it afterwards;
- a duplicate completion is a no-op; an unusable answer is rejected, then retried or failed according to the run's attempt limit;
- cancelling while waiting or while running is handled, including a completion that arrives after a cancel;
- the public tunnel (`CF-Connecting-IP`/`CF-Ray`) is refused, bad and revoked tokens are refused, the off switch and pause work, and normal users can't reach the admin controls.

Setup on the HP, after H2–H4:
1. On the ASUS admin page (or `POST /api/v1/admin/gpu/workers {"name":"hp-victus"}`), register the worker. Copy the token shown **once**.
2. On the HP, copy `gpu-worker\worker.local.toml.example` to `worker.local.toml`, then paste the token and the ASUS tailnet name. This file is git-ignored.
3. Start the model server on the HP, bound to 127.0.0.1 only: `llama-server -hf Qwen/Qwen3-4B-GGUF:Q4_K_M --host 127.0.0.1 --port 8080 -ngl 99 -c 6144 --jinja`
4. Start the worker: `py -3.11 gpu-worker\worker.py`. The log shows heartbeats and each job.
5. Auto-start: a Task Scheduler task "YB GPU Worker" at sign-in, restarting on failure. It's set up from the HP chat.

Readiness: the worker offers the `llm` task only while its local model server answers `/health`. It reports GPU name and free VRAM from `nvidia-smi` with each heartbeat.

## H6: Integration tests (all 18 from the master prompt)

Run with both laptops on. Each result, pass or fail, goes in the change log. Nothing is reported as passed unless it was actually run.
