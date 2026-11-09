# Growth (`/growth`)

The YouTube Growth system: plan, make and measure videos from real channel data. Built from `docs/SUPER_MASTER_BUILD_PROMPT.md`
on the existing stack (FastAPI and the Postgres job queue instead of Next.js, Celery and Redis; on-server voices instead of a GPU model).

## Pages
| Page | What it does | Data source |
|---|---|---|
| Growth overview | Channels, best recent uploads (views/day), pipeline, upcoming | Public channel feeds |
| Next video | Ranked ideas with the score split into 6 visible weighted parts, evidence (measured / research / learning), confidence, best window, title options → "add to plan" | Own and competitor feeds, Creator Scout reports, learning factors |
| Growth coach | Q&A with evidence, action and what to measure | Needs `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`; without one it says so (409) |
| Content intelligence | Title words (YouTube API when connected), views/day bars, learned factors | Feeds and `/youtube/insights` |
| Competitor research | Cadence, typical views/day, Shorts share, frequent words, top uploads | Public feeds only |
| Content calendar | Month grid, drag and drop to schedule or unschedule | `content_items` |
| Automation center | Assisted / Semi-automatic / Autonomous, 12 modules, publish permission, editable weights, Run now, job history | `growth_settings` |
| Publishing studio | Kanban board idea→published; blueprint editor; Produce; Open in editor; Approve; Publish (privacy, time) | `content_items`, jobs |
| Performance | Estimate vs measured views at day 1/3/7/30 | Own feed snapshots |
| Strategy library | Evidence-based practices | Static |

## Rules that are enforced in code
- **Data**: each channel's public uploads feed (latest 15 videos: titles, dates, view counts, like counts). No scraping of private data, and no invented numbers.
  Retention, CTR and watch time are **not shown**: they need YouTube Analytics (`yt-analytics.readonly` scope). That scope isn't requested yet.
- **Scores**: the default weights are relevance 25, history 20, demand 20, differentiation 15, feasibility 10 and consistency 10. Admins can edit them.
  The page says they are this app's weights, not YouTube's ranking, and that scores don't predict views.
- **Estimates**: a range from the channel's own history (YouTube API if connected, else at least 5 public uploads older than 7 days). Otherwise none is shown.
- **Production**: `growth.produce` job builds a normal, editable project with these tracks:
  - v1: scene cards
  - a1: narration (free on-server voice)
  - v2: captions

  It also makes a thumbnail asset and adds chapters to the description. Unwritten template text blocks production.
  If the voice engine fails, the video is still built (silent, timed for reading) and the warning is shown.
  A failed job returns the plan to Script with the reason.
- **Approval**: Approved needs a produced video. Published is only set by a real finished upload.
  Publish needs approval, a configured YouTube, and a connected channel. Uploads are marked AI-altered.
- **Autonomous** still stops at Review: a person approves every video.
  Only with the "publish authorised" switch on does it upload **approved** videos, and only as **Private**.
- **Growth cycle**: runs every 2 hours from the worker (advisory lock 424243) or via Run now. It does four things:
  1. Syncs channels.
  2. Records outcomes.
  3. Moves authorised uploads forward.
  4. Does the mode-gated steps.

## Setup
- Nothing required for feeds. Channels are added by ID (`UC…`) or by `/channel/UC…` link.
- `@handle` links need `YOUTUBE_API_KEY`.
- AI scripts and the coach need `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Without one, blueprints are templates the creator fills in.
- Publishing needs `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` (docs/GO_LIVE_GOOGLE.md). The user then connects YouTube on My channel.
- `YT_FEED_URL` overrides the feed host (tests, local fake).

## Tests
- `backend/tests/test_growth_studio.py`: fake feeds and voice.
- `e2e/growth.mjs`: 11 browser steps. Run it against a server whose `YT_FEED_URL` points at a feed.

## Not built yet
- YouTube Analytics (retention, CTR, watch time).
- Thumbnail A/B testing.
- Stock footage auto-placement (scene cards are placeholders to replace in the editor).
- Comment analysis.
