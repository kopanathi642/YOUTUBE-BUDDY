# Cost model (Editor Universe, launch scale)

Prices checked 5 Nov 2026 from render.com/pricing and developers.cloudflare.com/r2/pricing. Re-check before committing; USD, excluding GST.

| Item | Choice | Monthly |
|---|---|---|
| Web app (API + SPA) | Render 0.5 CPU / 512 MB | $7 |
| Render worker (FFmpeg) | Render 1 CPU / 2 GB, always on | $25 |
| Database | Render Postgres 256 MB + ~1 GB storage | ≈ $6.30 |
| Render workspace | Hobby (upgrade to Pro $25 when a team needs access) | $0 |
| Media storage | Cloudflare R2: $0.015/GB-month after 10 GB free; egress free | 100 GB ≈ $1.35 · 1 TB ≈ $15 |
| R2 operations | $4.50 / M writes, $0.36 / M reads (1 M + 10 M free) | ≈ $0 at launch |
| App bandwidth | Render: 5 GB included (Hobby), $0.15/GB after. Media bytes go browser↔R2 directly, so app traffic stays small | ≈ $0 |
| Email (verification/reset) | not yet configured — e.g. Resend free tier | $0 |
| Monitoring | Render logs; add Sentry free tier later | $0 |
| GPU | **not needed** for the Editor Universe | $0 |
| **Total** | | **≈ $40 / month (≈ ₹3,400)** |

## Capacity of that setup
* One worker renders one export at a time. A 1-CPU worker encodes 1080p H.264 (`veryfast`) at roughly real-time to 2× real-time for simple timelines; complex multi-layer timelines are slower. Measure on real footage before setting plan limits.
* Media processing (proxy + thumbnail + waveform) for a 10-minute 1080p upload takes a few minutes on the same worker.
* To serve more users: add workers (≈ $25 each) — queue fairness is FIFO today; per-workspace concurrency cap = 2.

## Cost controls already in code
* Max export duration 60 min, max upload 20 GB, ≤ 300 clips per sequence, 2 concurrent exports per workspace.
* Proxies are small (540p, CRF 28). Originals are kept; proxies/exports can get a lifecycle rule later (e.g. delete exports after 30 days).

## Before charging money (Phase 8)
Measure real cost per render-minute (worker $/hour ÷ minutes rendered per hour) and per stored GB, then set Buddy Credit prices = cost + payment fees (Razorpay ≈ 2%) + GST + support + margin. Do not publish prices before that measurement.
