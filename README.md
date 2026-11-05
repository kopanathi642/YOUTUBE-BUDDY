# Creator Universe — Editor Universe (v0.1)

Cloud video editor for creators. First of three universes (Editor · AI Creation · Super).
Working name only — see `docs/DEPLOYMENT.md` → *Naming warning*.

**What works today:** accounts and workspaces with roles · projects · resumable uploads straight to private cloud storage · automatic media checks, thumbnails, proxies and waveforms · multitrack timeline (move, trim, split, ripple delete, snapping, lock/hide/mute, position/scale/rotation/opacity, volume, fades) · undo/redo · autosave with version history · cloud MP4 export that keeps running after you close the browser, with real progress, cancel and automatic output checks.

**Not yet:** AI features, colour/audio/VFX pages, billing, developer API. They appear in the UI as "Soon" and do nothing. Full list: `docs/FEATURE_STATUS_MATRIX.md`.

```
backend/   FastAPI API + FFmpeg worker, SQLAlchemy models, Alembic migrations, pytest suite
frontend/  React + Vite + TypeScript single-page app (editor, dashboard, projects, auth, landing)
docs/      architecture, status matrix, roadmap, security, cost model, deployment, UI references
render.yaml  one-click cloud blueprint (web + worker + Postgres) · Dockerfile · docker-compose.yml
```

* Go online: **`docs/DEPLOYMENT.md`**
* Run locally: `docker compose up --build` → http://localhost:8000
* Tests: `cd backend && pytest` (9 integration tests, real FFmpeg renders) · `cd frontend && npm test && npm run typecheck`
* API docs (when running): `/api/v1/docs`
