# Feature Status Matrix — YouTube Buddy X (v0.6)

Whole-app check: `e2e/audit.mjs` drives a real browser through **55 steps covering every enabled control** — last run 55/55 passed.

Labels: **WORKING** (verified end-to-end with evidence) · **PARTIAL** · **NOT_IMPLEMENTED** · **BLOCKED** (needs an external account/credential/approval).
Evidence: `backend/tests/test_editor_flow.py` (pytest, real Postgres + S3 protocol + FFmpeg), `frontend/src/timeline.test.ts` (vitest), and a browser end-to-end run (Playwright, screenshots in `docs/ui/references/`).

| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Auth | Email + password sign-up / sign-in / sign-out | WORKING | `test_auth_and_csrf`, browser E2E |
| Auth | Argon2 password hashing, hashed session tokens, httpOnly cookie | WORKING | `security.py` |
| Auth | CSRF defence (custom header + CORS) | WORKING | `test_auth_and_csrf` (403 without header) |
| Auth | Login/sign-up rate limit | PARTIAL | `test_login_rate_limited`; in-process only — move to Redis when API runs >1 instance |
| Auth | Email verification, password reset | BLOCKED | Needs an email provider (e.g. Resend/SES) |
| Auth | Google sign-in via Firebase (project `ytbuddy-3`), server-side ID-token signature verification, account linking by verified email | WORKING (code) / BLOCKED (live) | `test_google_auth.py` (14 tests incl. 9 forged-token attacks). Live popup needs the Firebase console steps in DEPLOYMENT.md (enable Google provider, authorize domain) |
| Auth | YouTube OAuth scopes | NOT_IMPLEMENTED | deliberately deferred: restricted scope needs Google verification; request only when a YouTube feature exists |
| Auth | MFA | NOT_IMPLEMENTED | Phase 1b |
| Workspaces | Personal workspace on sign-up, team workspaces, roles (owner/admin/editor/viewer) | WORKING | `test_viewer_cannot_edit` |
| Workspaces | Add existing user as member, remove member, create team workspace | WORKING | UI in Super Universe → Team |
| Workspaces | Email invitations, ownership transfer, workspace deletion | NOT_IMPLEMENTED | needs email provider |
| Tenancy | Cross-workspace isolation (404 on every foreign ID) | WORKING | `test_tenant_isolation` (6 GET + 3 write routes) |
| Projects | Create (16:9 / 9:16 / 1:1, 24–60 fps), list, search, sort, rename, archive, restore, soft-delete | WORKING | browser E2E, API |
| Projects | Duplicate, folders, tags, project thumbnails | NOT_IMPLEMENTED | |
| Media | Resumable multipart upload direct to private object storage via signed URLs | WORKING | `test_full_edit_and_render`, `test_resume_lists_uploaded_parts`, browser E2E |
| Media | Extension + MIME + real file-signature validation (ffprobe), size limit, path-traversal-safe names | WORKING | `test_upload_rejects_bad_files` (fake .mp4 rejected and deleted) |
| Media | Probe metadata, SHA-256, thumbnail, 540p proxy, waveform peaks | WORKING | MP4/H.264, WebM/VP9+Opus, MOV (silent), WAV, PNG tested |
| Media | Retry failed processing, delete from project | WORKING | |
| Media | Malware scanning (ClamAV), URL import | NOT_IMPLEMENTED | |
| Editor | Multitrack timeline (video + audio tracks, add tracks) | WORKING | |
| Editor | Move (incl. between tracks), trim both edges, split at playhead, delete, ripple delete, snapping | WORKING | vitest + browser E2E |
| Editor | Lock / hide / mute tracks | WORKING | respected by preview **and** render |
| Editor | Transform: position, scale, rotation, opacity; volume; fade in/out | WORKING | render pixel check in pytest; preview ↔ export position match verified visually |
| Editor | Undo / redo, keyboard shortcuts | WORKING | |
| Editor | Autosave with optimistic concurrency (409 on stale save), conflict banner | WORKING | `test_full_edit_and_render` |
| Editor | Version history + restore (non-destructive) | WORKING | |
| Editor | Proxy preview playback in browser | PARTIAL | Real playback from proxies; multi-layer sync is best-effort, not frame-locked |
| Editor | Reverse, keyframes, cross-dissolve transitions, nested sequences, roll/slip/slide, motion tracking, masks | NOT_IMPLEMENTED | next phases |
| Editor v2 | Layout matching the founder's master reference (tool sidebar, monitor bar, AI assistant, translate & voice, colour/scopes/nodes/quick-actions strip, V4–V1/A1–A3, inspector tabs, storyboard, recommendations, export dock) | WORKING | screenshots `docs/ui/references/editor-v2*.png` |
| Colour | Lift/gamma/gain/offset wheels, exposure, contrast, saturation, temperature, tint, 8 looks, bypass — identical maths in preview (SVG filter) and export (lutrgb + matrix) | WORKING | `test_colour_grade_changes_rendered_pixels`, `grade.test.ts` |
| Colour | Curves, HSL qualifiers, LUT import, masks, shot matching | NOT_IMPLEMENTED | |
| Scopes | Waveform, RGB parade, vectorscope, histogram computed live from the composited program frame (incl. grade) | WORKING | needs bucket CORS (configured) |
| Analysis | Scene cuts, silences, loudness (LUFS), auto-colour suggestion, face position — computed on the worker for every upload | WORKING | `test_analysis_detects_scene_cut_silence_and_loudness` |
| AI (rule-based) | AI Magic plan (review → apply → undo): silence cuts, auto colour, level balance, noise reduction, fades; AI Recommendations; Quick Actions (Auto Edit, Shorts Maker, Clips at scene cuts, Scene Detect, Silence Remove, Smart Reframe) | WORKING | `smart.test.ts`, browser run. Labelled "rule-based" — no generative AI involved |
| Reframe | New 9:16 / 4:5 sequence, cover crop centred on detected face (static per clip) | WORKING | `test_smart_reframe_creates_vertical_sequence`. Motion tracking: NOT_IMPLEMENTED |
| Sequences | Multiple sequences per project, switcher, rename/delete API | WORKING | |
| Capture | Webcam/mic recording (browser permission, level meter, retake) → upload; frame snapshot → image asset | WORKING | WebM without duration header handled |
| Nodes | Read-only node view of the clip's real render chain, ColorCorrect bypass | PARTIAL | free-form node editor NOT_IMPLEMENTED |
| Titles | Title clips (any Indian script + Arabic + Latin, shaped with HarfBuzz via Pillow), 6 styles, size/colour/box, position/scale/rotation/opacity/fades | WORKING | `test_titles_speed_crop.py` (awkward characters, Hindi font pick, pixel check) |
| Speed | 0.25×–4× per clip, pitch-preserved audio (atempo), speed-aware trim/split/silence maths | WORKING | render duration + audio length verified |
| Crop | Left/right/top/bottom crop, preview == render | WORKING | |
| Stabilization | FFmpeg vid.stab two-pass → new "(stabilized)" media, auto-swapped into the timeline | WORKING | `test_derive.py`, audit |
| Background removal | Open-source U²-Net (u2netp) per frame → lossless alpha MOV + VP9-alpha preview, auto-swapped; clips ≤ 60 s, ~15× real time on 1 CPU | WORKING | `test_derive.py` composites over grey and checks pixels |
| AI voice (TTS) | Piper voices: English ×5, Spanish, French, German, Italian, Portuguese, Dutch, Russian, Ukrainian, Nepali, Chinese, Vietnamese (GitHub); Hindi ×2 (Hugging Face, online) | WORKING | `test_tts_creates_audio_asset` (real Piper). Hindi voices: download online — verify after deploy |
| Captions / transcript / SRT | Transcribe on the worker → caption title clips on a Captions track + .srt download; translate captions | WORKING (pipeline) / VERIFY ONLINE (model) | pipeline tested with a stand-in engine; free Whisper model downloads from huggingface.co (blocked in build sandbox) — or OpenAI key |
| Translate & dub | Transcribe → translate → Piper voice per line, timed to the original, new dub track under the clip, original lowered/muted | WORKING (pipeline) / VERIFY ONLINE (models) | `test_transcribe_translate_dub_pipeline`; Argos/Whisper models download online |
| Highlights & batch shorts | Rule-based scoring (energy, speech, scene changes) → N shorts as new sequences (range slice + 9:16/4:5/1:1 reframe) | WORKING | `test_short_from_range_slices_and_trims`, audit |
| Thumbnail designer | Frame + multi-language headline, outline, tilt, shade, position → PNG download / media bin | WORKING | audit |
| Version history | Top-bar history window, restore any version | WORKING | audit |
| AI (providers) | Lip sync, object removal | BLOCKED | need GPU model providers; buttons locked with the reason |
| Export | Server-side FFmpeg render from originals (H.264/AAC MP4; match / 720p / draft 480p) | WORKING | |
| Export | Real progress from FFmpeg, cancel, retry, idempotency key | WORKING | `test_export_validation_and_cancel` |
| Export | Output validation: exists, streams, codec, dimensions, fps, duration, decodability | WORKING | stored on each export, shown as “Verified” |
| Export | Keeps running with browser closed; worker crash → lease expiry → reclaim | WORKING | `test_crashed_worker_job_is_reclaimed` |
| Export | 4K / ProRes / HEVC / HDR / high FPS | NOT_IMPLEMENTED | deliberately not offered until workers support it |
| Billing | Buddy Credits, plans, payments | NOT_IMPLEMENTED | Phase 8. Renders are free during early access with limits (2 concurrent exports, 60 min max) |
| AI Generator Universe | Generation, captions, translate, dub, lip sync, shorts | SUPERSEDED | see the v0.6 section below |
| Super Universe | Developer API keys, webhooks, teams review, automation | NOT_IMPLEMENTED | |
| Ops | Health endpoint (DB + storage), worker alive file, structured logs with request IDs | WORKING | |
| Ops | Docker image, Render blueprint, CI | PARTIAL | written; image builds in CI (no Docker daemon in build sandbox); first deploy pending founder accounts |
| Ops | Metrics/alerts, backups restore drill | NOT_IMPLEMENTED | Render Postgres has daily backups on paid plans; drill not yet run |

## v0.5 — Three Universe Gateway

| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Gateway | `/universes` — 3 floating portals (Editor blue, AI Generator violet, Super emerald/cyan/gold), CSS 3D + mouse parallax, glow rings, particle canvas, hover focus/dim, cinematic warp entry | WORKING | `scratchpad e2e/gw.mjs`: each portal routes correctly, 0 console errors |
| Gateway | Reduced-motion mode (instant entry, no particles/float) and low-end tuning (adaptive particle count, pauses when tab hidden) | WORKING | gw.mjs reduced-motion check |
| Gateway | Bottom dock: continue working, recent projects, recent exports, processing jobs, model availability | WORKING | real API data, no placeholders |
| Global bar | Global project search, notifications (finished/failed jobs), usage, model status, settings, profile, switch universe, return to gateway | WORKING | on every universe page |
| Shared | Asset library `/library` across all projects (search, kind filter, preview, open in editor) | WORKING | `test_workspace_library_and_exports_are_tenant_scoped` |
| AI Generator | Renamed from “AI Creation Universe” (v0.6); old `/ai-creation/*` links redirect | WORKING | |
| Super | `/super` — stats, universe status, job board (filter, cancel), engines list, team, all projects | WORKING | |
| Super | Automation, scheduled publishing, developer API | NOT_IMPLEMENTED | roadmap, non-clickable |
| Routing | `/editor`, `/editor/projects`, `/edit/:id`; old `/home` and `/projects` redirect | WORKING | |

## v0.6 — AI Generator Universe: 120 tools in 12 studios

Full per-tool results: [AI_TOOL_AUDIT.md](AI_TOOL_AUDIT.md) (generated by `e2e/ai_tools_audit.mjs`).

| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Registry | Exactly 120 tools, ids 001–120, 12 studios × 10, each with its own controls, engine, models, outputs and timeline compatibility | WORKING | `test_registry_has_exactly_120_tools_in_12_studios` |
| Honesty | Live status per tool: ready / needs key (names the key) / not built (2: speaker diarization, scheduled workflows). Runs refused with 409 when not ready | WORKING | `test_hosted_tool_without_key_is_refused_not_faked` |
| Local engines | 49 tools run on our worker (FFmpeg, OpenCV, Pillow, rembg, Piper, Whisper, Argos) | WORKING (Whisper/Argos need live check) | `test_ai_tools.py`, tool audit |
| Hosted models | fal.ai queue adapter (Veo 3.1, Kling 3, Seedance, MiniMax, Wan, FLUX.2, Nano Banana Pro, GPT Image 2, ElevenLabs, Sync, OmniHuman, Tripo/Hunyuan 3D…) with cost estimate, cancel, error messages | WORKING (code) / BLOCKED (live: needs FAL_KEY) | simulated-provider tests |
| LLM tools | Claude (or OpenAI) JSON tools: script, hooks, titles, SEO, calendar, dialogue, shot list, Director Agent (hallucinated tools removed) | WORKING (code) / BLOCKED (needs key) | simulated-provider tests |
| YouTube tools | YouTube Data API v3 (public data) + LLM | WORKING (code) / BLOCKED (needs key) | simulated-provider test (trends) |
| Versions | Every run is a generation with version, parent, root, params, model, cost; regenerate/variation/use settings/rating | WORKING | `test_versions_and_edit_in_timeline` |
| Edit in Timeline | Places outputs on the right track (video→V1, music→A2, SFX→A3, voice→A1) as a new sequence version and opens the editor on that sequence; provenance kept on the asset | WORKING | test + browser run |
| AI labelling | Generated files carry visible "AI-generated" badge + embedded metadata (India IT Rules 2026) | WORKING | `test_text_to_video_directs_camera_and_labels_output` |
| Consent | Face/voice tools (avatar, lip-sync, voice changer, motion transfer, character, retouch, voice dub) require a consent tick | WORKING | API 422 without it |
| Workflows | Node canvas, templates, batch, approval gates (pause/resume), input-type checks per node | WORKING | `test_workflow_with_approval_gate`, `test_workflow_node_checks_input_kind` |
| UI | 12 distinct studio workspaces; tools share their studio's workspace with tool-specific controls; laptop (1366) + desktop verified | WORKING | tool audit screenshots |
| Not built | Speaker diarization (107), scheduled workflows (117) | NOT_IMPLEMENTED | listed with reason |

### v0.6 fixes found by the audits
- Studio stylesheet was global: its `.stage` rule enlarged the editor's program monitor and hid the playback buttons (editor audit 54/55). All AI Generator styles are now scoped under `.aiw`; editor audit back to 55/55.
- Tool 077 (Thumbnail A/B Analyzer) failed only because the audit passed a generation id instead of a media file id; the audit now uses tool 086's output file and 077 runs successfully.
- Hub studio-card artwork no longer draws over card text.

### v0.6.1 — universe access
| Universe | Status | Notes |
|---|---|---|
| Editor Universe (`/editor`) | OPEN | All editing tools unchanged |
| AI Generator Universe (`/ai-generator`) | OPEN | The 120 generator tools |
| Super Universe (`/super`) | LOCKED | Portal shows "Locked", `/super` shows a lock page. Unlock later by setting `locked: false` in `frontend/src/universes.ts`. Team management moved to Settings → Team so it stays available. |
| Gateway fix | — | Dimmed portals no longer sit "behind" the 3D stage, so clicking straight from one portal to another always works |

### v0.6.2 — two dashboards: public landing before sign-in, app after
| Area | Feature | Status | Evidence / notes |
|---|---|---|---|
| Public | Signed-out landing at `/`: sticky nav with Editor and AI-studio menus, tool search, six workspace cards, directory of all 13 workspaces with live tool counts, "What's live" panel, call-to-action sections, footer with live server status | WORKING | `e2e/audit.mjs` step 1, `test_public_studios_needs_no_login_and_counts_honestly`; checked at 1440, 1366 and 390 px |
| Public | `GET /api/v1/public/studios` (no sign-in): per-studio live/total counts and names of live tools only | WORKING | same test; counts change when keys are set |
| Public | Signed-in visitors to `/` go straight to the app dashboard (`/universes`); links on the landing page go to sign-in and return to the chosen workspace afterwards | WORKING | browser check |

