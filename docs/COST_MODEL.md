# Cost model (Editor Universe, launch scale)

Prices checked 5 Nov 2026 from render.com/pricing and developers.cloudflare.com/r2/pricing. Re-check before committing; USD, excluding GST.

| Item | Choice | Monthly |
|---|---|---|
| Web app (API + SPA) | Render 0.5 CPU / 512 MB | $7 |
| Render worker (FFmpeg) | Render 1 CPU / 2 GB, always on | $25 |
| Database | Render Postgres 256 MB + ~1 GB storage | ≈ $6.30 |
| Render workspace | Hobby (upgrade to Pro $25 when a team needs access) | $0 |
| Model disk for AI engines (worker) | Render persistent disk 5 GB (≈ $0.25/GB) | ≈ $1.25 |
| Media storage | Cloudflare R2: $0.015/GB-month after 10 GB free; egress free | 100 GB ≈ $1.35 · 1 TB ≈ $15 |
| R2 operations | $4.50 / M writes, $0.36 / M reads (1 M + 10 M free) | ≈ $0 at launch |
| App bandwidth | Render: 5 GB included (Hobby), $0.15/GB after. Media bytes go browser↔R2 directly, so app traffic stays small | ≈ $0 |
| Email (verification/reset) | not yet configured — e.g. Resend free tier | $0 |
| Monitoring | Render logs; add Sentry free tier later | $0 |
| GPU | **not needed** for the Editor Universe | $0 |
| **Total** | | **≈ $41 / month (≈ ₹3,500)** |
| Optional: OpenAI for captions/translation | Whisper API ≈ $0.006/min audio; GPT-4o-mini translation ≈ cents per video | pay per use |

## Capacity of that setup
* One worker renders one export at a time. A 1-CPU worker encodes 1080p H.264 (`veryfast`) at roughly real-time to 2× real-time for simple timelines; complex multi-layer timelines are slower. Measure on real footage before setting plan limits.
* Media processing (proxy + thumbnail + waveform) for a 10-minute 1080p upload takes a few minutes on the same worker.
* AI on a 1-CPU worker: captions ≈ real time to 2× real time (Whisper small), background removal ≈ 15× real time (so limited to 60 s clips), AI voice ≈ 20× faster than real time. Heavy users will need a bigger worker (2–4 CPU, $85+/mo) or OpenAI for captions.
* To serve more users: add workers (≈ $25 each) — queue fairness is FIFO today; per-workspace concurrency cap = 2.

## Cost controls already in code
* Max export duration 60 min, max upload 20 GB, ≤ 300 clips per sequence, 2 concurrent exports per workspace.
* Proxies are small (540p, CRF 28). Originals are kept; proxies/exports can get a lifecycle rule later (e.g. delete exports after 30 days).

## Before charging money (Phase 8)
Measure real cost per render-minute (worker $/hour ÷ minutes rendered per hour) and per stored GB, then set Buddy Credit prices = cost + payment fees (Razorpay ≈ 2%) + GST + support + margin. Do not publish prices before that measurement.

## Profitability review (2026-11-07)

Checked against the founder's reference *"How to Make Your Business Profitable | Why Startups Fail? ft. Teja Gudluru – SriLakshmi Iyengar EP 2"* (YouTube `kRdr01w-jEc`) and public research on why startups fail. CB Insights' post-mortems put **no market need** and **running out of cash** at the top, with **pricing/cost problems** and **no business model** also common. Indian SaaS write-ups recommend rupee pricing, UPI, and a free-forever tier over a short trial.

**What was wrong:**
- Plans promised premium AI by *runs per day*: Creator 50/day for ₹299/month, Pro 200/day for ₹799.
- One hosted video generation costs $0.50–$3+, and every workspace (Free included) could spend up to **$10/day**.
- Nothing capped the whole platform.

One busy user could cost more than a hundred paying users bring in. That is the "price below cost → run out of cash" failure.

**What the code does now** (`backend/app/billing.py`, `routers/tools.py`):

| Plan | Price | After 18% GST* | Premium-AI credit (max provider cost) | Worst-case margin / month |
|---|---|---|---|---|
| Free | ₹0 | — | ₹0 (`FREE_PLAN_AI_CREDIT_INR`); free tools unlimited | − CPU time only |
| Creator | ₹299 / month or ₹2,990 / year | ₹253 (yearly ≈ ₹211/mo) | ₹100 per rolling 30 days | ≥ ₹153 (yearly ≥ ₹111) |
| Pro | ₹799 / month or ₹7,990 / year | ₹677 (yearly ≈ ₹564/mo) | ₹300 per rolling 30 days | ≥ ₹377 (yearly ≥ ₹264) |

\*Only if GST-registered; check the turnover threshold with a CA. UPI-to-QR has no gateway fee.

- **Credits are counted in money, not runs.** The estimated provider cost of every paid run counts, including premium runs of local tools, and runs with an unknown price at `PAID_RUN_FLOOR_USD`.
- **Walls around the credit:**
  - per workspace per day: `AI_DAILY_BUDGET_USD` (default $3) and `AI_DAILY_PAID_RUNS`;
  - whole platform per calendar month: `AI_MONTHLY_BUDGET_USD` (default $50). Set it to what you can actually pay. When it's reached, premium AI pauses and the free tools keep working.
- **Test guard:** `test_plan_credits_and_yearly_price` fails if a plan's credit goes above half its after-GST price.
- **Pro's "priority" is real now:** jobs from active Pro workspaces are claimed first (`jobs.claim`), with a test.
- **Yearly plans:** 12 months for the price of 10. Cash up front extends runway.
- **Prices are public:** the landing page Pricing section reads the same `PLANS` the payment flow charges.

**Break-even** on fixed costs (≈ ₹3,600/month from the table above), worst case with every credit fully used: about **24 Creator** or **10 Pro** monthly subscribers. With typical use, half the credit, about 18 Creator.

**Founder checklist:**
1. Set a spending limit in the fal.ai account too. It's a second wall outside the app.
2. Set `AI_MONTHLY_BUDGET_USD` to what you can afford this month, and raise it only as paid revenue grows.
3. "No market need" is the number one killer. Before building more features, get the first 20 creators using the free plan. Watch activation and conversion in Settings → Founder metrics. Ask the ones who export every week what they would pay for.
4. Add a second worker ($25) only when paid revenue covers it. Until then Pro jobs jump the queue.
5. Re-check provider prices (`usd_per_s` / `usd_per_run` in `tools/registry.py`) and `USD_INR` every few months, since credits depend on them.
