# SUPER MASTER BUILD PROMPT
## Production-grade AI Creator Studio SaaS — complete product, engineering, infrastructure, billing and launch specification

**Instruction to the AI coding agent:** Treat this document as the governing product and engineering specification. Build a real, secure, maintainable SaaS product. Do not create a demo, static prototype, fake dashboard, fake AI, fake cloud status, fake payment flow, fake progress, or nonfunctional buttons. Do not mark a feature complete until it works end-to-end and has automated tests and evidence.

---

# 0. YOUR ROLE AND MISSION

You are the principal product architect, staff full-stack engineer, video-processing engineer, AI/ML engineer, cloud/platform engineer, security engineer, QA lead, and technical writer for this startup.

Your mission is to turn the existing repository (if one exists) into a production-grade, cloud-hosted, multi-tenant creative SaaS platform that combines the useful capability categories of:

- DaVinci Resolve: professional editing, colour grading, node-based compositing/VFX, scopes, audio post-production.
- Adobe Premiere Pro: professional multitrack timeline, media management, editing, effects, captions, collaboration workflows.
- Canva: approachable design studio, templates, brand kits, graphics, thumbnails, simple content creation.
- CapCut: fast creator workflows, auto captions, short-form editing, social formats, templates and accessible AI tools.
- Original AI workflows: intelligent media analysis, task planning, smart edits, translation, dubbing, speech, lip sync, highlight detection, automated exports and workflow orchestration.

This is a capability-category reference only. Build original product design, code, workflows, assets and models. Do not copy proprietary source code, exact screens, logos, protected templates, brand assets, or proprietary implementations. Do not imply affiliation with any referenced company.

The product should feel like one coherent creative operating system, not five disconnected applications.

## Non-negotiable product principles

1. Real implementation over appearance.
2. Professional output quality, with measurable quality checks.
3. One project, one media library, one timeline model, one render pipeline and one billing ledger shared across studios.
4. Progressive disclosure: beginners can use simple workflows; professionals can access advanced controls.
5. Cloud-first execution: uploads, jobs, AI tasks and renders continue after the user's laptop/browser is closed.
6. No fake capability claims. Clearly label unavailable, experimental, queued, failed and completed features.
7. User data isolation, privacy, consent, security, auditability and recoverability.
8. Cost-aware AI and rendering. Estimate charges before paid work.
9. No destructive edits to original media. Keep source files immutable.
10. Build in tested milestones. Never attempt to build every advanced feature in one unverified code dump.

---

# 1. FIRST ACTION: REPOSITORY DISCOVERY AND HONEST AUDIT

Before changing code:

1. Inspect the entire repository, git status, branches, existing architecture, package manifests, environment variables, migrations, tests, deployment files, worker processes, storage adapters, API routes, and UI routes.
2. Identify what is implemented, partially implemented, mocked, broken, duplicated, insecure, or missing.
3. Run the existing test suite and record the baseline.
4. Run the application and inspect every current page at desktop and mobile breakpoints.
5. Inspect current data models and migration history. Do not destroy or reset user data.
6. Create:
   - `docs/REPOSITORY_AUDIT.md`
   - `docs/FEATURE_STATUS_MATRIX.md`
   - `docs/ARCHITECTURE_CURRENT.md`
   - `docs/IMPLEMENTATION_ROADMAP.md`
   - `docs/SECURITY_RISK_REGISTER.md`
7. Use evidence-based status labels:
   - `WORKING`: verified end-to-end.
   - `PARTIAL`: some real functionality exists but acceptance criteria are not met.
   - `UI_ONLY`: visible UI without a working backend operation.
   - `MOCKED`: hard-coded or simulated result.
   - `BROKEN`: implementation exists but fails.
   - `NOT_IMPLEMENTED`: absent.
   - `BLOCKED`: depends on an external credential, provider, hardware or approval.
8. Do not delete working features simply to make the architecture look cleaner. Refactor with migrations and compatibility plans.
9. Create a backup before risky schema or storage changes.
10. After the audit, implement the highest-priority missing vertical slice end-to-end before expanding.

Do not claim that the application is production-ready until the release gates in this document pass.

---

# 2. PRODUCT IDENTITY AND USER EXPERIENCE

Working internal project name: `Creator Studio` / `Creator Universe`. Final public brand and domain must be checked for trademark, domain and third-party API policy compatibility before launch.

**Important naming/compliance check:** If integrating with YouTube APIs, review Google's current YouTube API Services Branding Guidelines before choosing the company/product name or domain. Avoid using YouTube or derivatives as the overall API client/product name or domain where the policy prohibits it. Refer to YouTube as a supported publishing/analytics integration, not as the company's identity. Do not use YouTube logos or imply endorsement. Obtain legal review before public launch.

## User groups

- Beginner creator: wants one-click edits and simple templates.
- Creator/influencer: wants shorts, reels, captions, voice and fast publishing.
- Professional editor: wants multitrack editing, precise controls, scopes and effects.
- Motion/VFX artist: wants node graphs, masks, tracking and compositing.
- Designer: wants thumbnails, graphics, templates and brand kits.
- Agency/team: wants shared projects, roles, review, approvals and usage controls.
- Developer/API customer: wants paid processing APIs, keys, docs, logs and webhooks.

## Main navigation

Top bar:
- Brand/workspace switcher
- Home
- Projects
- Edit
- AI
- Effects
- Audio
- Color
- Fusion/Nodes
- Graphics
- Subtitles
- Export
- Search
- Notifications
- Help
- User/profile menu
- Cloud sync state (real status only)

Left sidebar (collapsible):
- Home
- Dashboard
- All Studios
- AI Magic (One-Click)
- Video Tools
  - Auto Edit (AI)
  - Shorts Maker
  - Clips & Reels
  - Scene Detection
  - Silence Removal
  - Auto Reframe
  - Video to Shorts
  - Highlight Finder
  - Multi-Shorts Generator
  - Smart Reframe (9:16)
- Video Editing
- Direct Video workflow
- Color Grading
- Audio Studio
- Subtitle & Translate
- Voice & Dubbing
- Text to Speech
- Speech to Text
- Lip Sync (AI)
- AI Transcribe
- VFX & Fusion
- Motion Graphics
- Design & Thumbnail
- Templates
- Stock Library
- Effects & Filters
- Transitions
- Projects
- Export & Share
- API Developer Portal
- Billing / Buddy Credits
- Settings / Help

The sidebar must keep Shorts Maker and Clips & Reels visible and easy to access. They must launch direct workflows without requiring the user to hunt through menus.

---

# 3. REQUIRED UI REFERENCE SYSTEM — EVERY PAGE

The package includes reference images in `ui_references/`. Treat them as visual direction for the dark professional editing workspace, AI Magic panel, media bin, timeline, translation/voice controls and export layout.

Do not use one editor screenshot as the design for every page. Each page needs its own designed reference.

## Before implementing each page

For every route/page listed below:

1. Create a page-specific design brief in `docs/ui/page-specs/<page>.md`.
2. Create a page-specific visual reference image in `docs/ui/references/<page>.png` or an equivalent approved design artifact.
3. The reference must show the actual page layout at a stated viewport size, preferably 1440×900 desktop and a mobile adaptation.
4. The reference must include page title, navigation, primary action, empty/loading/error/success states where relevant, and realistic data.
5. Do not place tiny unreadable fake controls everywhere. Prioritize usable hierarchy and clear spacing.
6. Implement the page from its approved spec and reference.
7. Compare the built page against the reference using screenshots and visual regression checks.
8. Keep all reference images and page specifications in the repository.

If image generation is unavailable, create an HTML/CSS reference prototype or a structured design spec; do not pretend a missing image exists.

## Design system

- Default theme: professional dark theme, with optional light theme later.
- Base surfaces: deep charcoal/navy; panels separated by subtle borders.
- Accent: restrained electric blue, cyan and violet. Avoid excessive glow that reduces readability.
- Typography: readable modern sans-serif, consistent hierarchy.
- Use a consistent 8px spacing system, radii, shadows, icons and states.
- Support keyboard navigation, visible focus, screen readers, reduced motion and sufficient contrast.
- Responsive layouts: desktop-first for professional editor; tablet/mobile for dashboards, review, uploads and simple creator workflows.
- Do not force the full desktop timeline onto a narrow phone screen. Use responsive mobile editing layouts.
- All pages need skeleton/loading, empty, error, permission-denied, offline, success and retry states.
- All buttons, tabs, menus, filters and controls must work. No decorative dead controls.

---

# 4. PAGE-BY-PAGE PRODUCT MAP AND UI REQUIREMENTS

Create a page-specific reference for every page below. Add more pages when required by the audit.

## 4.1 Public website

### Landing page
- Clear value proposition and product demonstration.
- Feature categories, workflows, pricing preview, trust/security, FAQs, contact and CTA.
- Real product screenshots or real product video only. Do not fabricate customer logos or testimonials.
- Performance-optimized responsive design, metadata, SEO, accessibility and consent management.
- CTA: Sign up, Sign in, View plans, Explore API.

### Pricing page
- Plans, included monthly credits, storage, project limits, team seats, render limits and API allowances.
- Clearly separate subscription allowances from purchased top-up credits.
- Explain metering and overage behavior.
- No hidden automatic top-ups.
- Show indicative costs before paid actions.

### Documentation / status / legal pages
- Product docs, API docs, status page, privacy policy, terms, acceptable-use policy, cookie policy, refund policy and contact/support.
- Do not publish placeholder legal promises as final. Require qualified legal review.

## 4.2 Authentication and onboarding

### Sign up / sign in
- Email/password and supported OAuth providers.
- Email verification, secure password reset, session management, optional MFA.
- Rate limits, abuse protection and audit logging.
- Never log passwords, tokens or secrets.

### Onboarding
- Ask role/use case, editing skill, typical video formats and goals.
- Let users skip optional steps.
- Explain cloud media storage, AI processing and credit consumption.
- Provide sample project only if clearly labelled as a sample, never as a fake completed customer project.
- Offer a short interactive product tour.

### Workspace creation
- Personal workspace, team workspace, invite members, roles and permissions.
- Workspace ownership transfer and deletion flows.

## 4.3 Home and dashboard

- Recent projects, create project, upload media, recent exports, render jobs, storage use, credits, activity, alerts and quick actions.
- Quick launch: AI Magic, Video Editing, Shorts Maker, Clips & Reels, Translate & Dub, Thumbnail Designer.
- Show real job status from backend.
- Display storage/credit usage from ledger and storage metadata.

## 4.4 Projects and media management

- Project list with search, sort, filters, folders, tags, thumbnails and status.
- Project create/duplicate/archive/restore/delete.
- Media bin for video, audio, images, fonts, graphics and generated assets.
- Upload progress, resumable uploads, multipart uploads, checksum, retry and cancel.
- Validate MIME type, extension, file signature, duration, codec, resolution and size.
- Generate thumbnails, proxies, metadata and audio waveforms asynchronously.
- Keep original source media immutable.
- Store media blobs in object storage, not in PostgreSQL.
- Store media metadata, ownership, permissions and storage references in database.
- Provide media relinking and missing-file handling.
- Support large files without requiring the browser to hold the entire file in memory.

## 4.5 AI Magic — central one-click intelligent editor

This is a flagship feature and must be prominent in the left sidebar and editor workspace.

When the user presses **AI Magic**:

1. Create a real analysis job for the selected project/media.
2. Inspect video, audio, transcript and metadata.
3. Detect scenes, shots, people, faces, objects, speech, silence, noise, camera shake, exposure, colour, orientation, aspect ratio, content type and likely platform.
4. Understand the user's intent, such as “make a polished 45-second short with English captions.”
5. Produce a structured edit plan with reasons, selected tools, estimated duration and estimated credit cost.
6. Let user review plan and estimate before paid processing.
7. Apply selected operations as non-destructive timeline changes.
8. Generate preview/proxy output and quality report.
9. Allow per-operation accept/reject, undo and restore.
10. Export only after the user approves.

### AI decision engine

Use a controlled planner, not an unconstrained agent that can execute arbitrary code.

The planner should:
- Use typed tool definitions and schemas.
- Select from an allowlisted tool registry.
- Check prerequisites and input/output compatibility.
- Check user permissions, quotas and credit balance.
- Estimate cost before dispatch.
- Create a deterministic execution plan.
- Validate every output.
- Record tool versions, model versions, parameters and provenance.
- Retry only safe/idempotent steps.
- Stop and request confirmation for destructive, expensive, identity-sensitive or ambiguous actions.

AI must not blindly apply every available effect. It should choose only what is appropriate for the actual media and requested outcome.

### AI Magic operations
- Smart cuts and highlight selection
- Silence/filler-word removal
- Scene detection
- Auto captions
- Audio enhancement/noise reduction
- Stabilization
- Exposure/colour correction
- Smart reframe
- Face/object tracking
- Background removal where supported
- Smart transitions
- Music recommendations/licensed music workflow
- Thumbnail suggestions
- Translation/dubbing recommendations
- Shorts/clips creation
- Quality analysis

Show analysis state, detected content, proposed changes, cost estimate, progress, preview and final report.

## 4.6 Professional Video Editing Studio

Implement a real non-linear editor with:
- Multi-track video, audio, title, overlay and effects tracks.
- Timeline zoom, scroll, snapping, markers, ripple/roll/slip/slide edits where supported.
- Split, trim, cut, move, duplicate, group, unlink, lock, mute, hide and delete.
- Source viewer and program viewer.
- In/out points, playback controls, timecode, frame stepping and loop playback.
- Transform, crop, position, scale, rotation, opacity, anchor point and blend modes.
- Speed controls, reverse, freeze frame and speed ramps.
- Keyframes and interpolation curves.
- Transitions and effects.
- Nested sequences and compound clips.
- Proxy workflow, relinking and media cache.
- Autosave, crash recovery and version history.
- Keyboard shortcuts and customizable shortcut maps.
- Timeline state persisted in database with versioning.
- Preview quality settings distinct from final export quality.
- Export queue and background render jobs.

Do not implement a fake timeline that only moves colored rectangles. Timeline edits must update a real project/sequence representation and render correctly.

## 4.7 Shorts Maker

Directly accessible from left sidebar.

- Convert landscape/portrait/square media into 9:16, 1:1, 4:5 and custom aspect ratios.
- Detect subject and face positions over time.
- Track subject and keep framing stable.
- Support manual crop and tracking corrections.
- Detect highlights, speech segments and scene boundaries.
- Set target duration and platform preset.
- Auto captions and safe-area placement.
- Hook/title suggestions, progress bars and optional overlays.
- Generate multiple candidate shorts from long videos.
- Batch render and download.
- Each short becomes an editable sequence in the same project.

## 4.8 Clips & Reels

Directly accessible from left sidebar.

- Highlight finder and moment scoring.
- Clip boundaries with handles and editable in/out.
- Batch clip generation.
- Clip title, captions, aspect ratio and output presets.
- Deduplicate overlapping clips and explain why moments were selected.
- User can manually approve or adjust each clip.
- No claim that a clip will go viral.

## 4.9 Scene detection / silence removal / smart reframing

- Scene boundary detection with confidence.
- Silence detection with configurable threshold and padding.
- Filler word detection only where speech model supports it.
- User-reviewable cuts; preserve context and avoid cutting words.
- Face/person/object tracking with confidence and manual correction.
- Reframe keyframes with smooth interpolation.
- Avoid abrupt crop jumps and keep important subjects inside safe area.

## 4.10 Color Grading Studio

- Primary correction: lift, gamma, gain, offset, exposure, contrast, saturation, temperature, tint.
- Curves, wheels, hue-vs-hue, hue-vs-saturation, hue-vs-luma, luma curves.
- LUT import, preview, strength, management and licensing metadata.
- Scopes: waveform, RGB parade, vectorscope and histogram.
- Masks, qualifiers and tracking where supported.
- Shot matching and reference stills.
- Node-based colour pipeline.
- HDR workflows only when the processing/export pipeline genuinely supports them.
- Preserve source colour metadata and provide correct colour-space transforms.

## 4.11 Fusion / Node-Based VFX and Compositing

Build an original node graph system.

Node categories:
- Media input/output
- Merge/composite
- Transform
- Crop
- Resize
- Colour correction
- Curves
- Blur/sharpen
- Glow
- Keyer/chroma key
- Masks and roto
- Tracking
- Text and shapes
- Particles where supported
- 2D/3D transforms where supported
- Camera/light/3D scene nodes only when genuinely implemented
- AI segmentation/background removal nodes
- Audio analysis nodes where useful

Node editor:
- Pan/zoom canvas, node search, categories, minimap.
- Typed input/output ports.
- Connect/disconnect, select, group, bypass, disable, duplicate, delete.
- Parameter inspector.
- Graph validation, cycle detection and missing-input handling.
- Undo/redo and graph versioning.
- Save graph as reusable user preset.
- Deterministic graph evaluation and render integration.
- Show unsupported node state clearly.
- Prevent cycles and invalid graph types.

Do not claim advanced 3D, particles, rotoscoping or tracking are complete until tested with real media.

## 4.12 Audio Studio

- Multitrack audio timeline.
- Waveforms, clip gain, volume automation, fades and crossfades.
- EQ, compressor, limiter, gate, reverb, delay and pan where implemented.
- Voice isolation, noise reduction and loudness normalization.
- Audio meters and clipping warnings.
- Separate voice, music, SFX and ambience tracks.
- Ducking and sidechain-style workflows where supported.
- Export sample rate, bit depth and channel configuration.
- Preserve original audio track and allow restoration.

## 4.13 Language, Subtitles, Translation, Voice and Lip Sync

Create a dedicated integrated Language & Voice Studio and accessible sidebar tools.

### Speech-to-text
- Detect language and speakers where supported.
- Generate timestamped transcript.
- Editable transcript linked to timeline.
- Search transcript and jump to time.
- Export SRT, VTT and supported subtitle formats.

### Translation
- Original language auto-detection.
- User-selected target language(s).
- Translate transcript and subtitles.
- Preserve meaning, terminology and timing.
- Allow glossary and preferred names.
- Human-editable translation review.
- Do not silently replace original transcript.

### AI dubbing
- Generate target-language speech.
- Voice selection, pronunciation controls, emotion/style settings where supported.
- Segment-level regeneration.
- Maintain timing and sync.
- Preserve background music and SFX as separate tracks.
- Allow original/dubbed voice toggling.
- Explicit consent for voice cloning and identity simulation.
- Do not clone a person's voice without authorization.

### Text-to-speech
- Language and voice catalogue based on licensed/authorized providers/models.
- Preview before generation.
- Control pace, pronunciation and voice style.
- Store generated audio as project assets.

### Lip sync
- Match approved speech audio to a face in the video.
- Provide a before/after preview.
- Validate face visibility, duration, audio alignment and quality.
- Clearly disclose synthetic alteration.
- Require consent and block impersonation or deceptive use.

### Voice recording
- Record microphone input in browser where permission is granted.
- Show recording status and input level.
- Allow playback, trim, retake and add to timeline.
- Never record without clear user action and browser permission.

## 4.14 Motion Graphics, Titles and Animation

- Text and title editor.
- Typography, font management and licensing metadata.
- Shapes, vectors, stickers and graphic layers.
- Keyframe animation, easing, curves and motion paths.
- Lower thirds, captions, intros, outros and transitions.
- Template-based animations.
- Export with alpha where the pipeline supports it.
- Reusable presets and user-owned templates.

## 4.15 Design Studio / Canva-style workflows

- Thumbnail and social graphic design.
- Canvas sizes and custom dimensions.
- Layers, text, images, shapes, brand colours and guides.
- Brand kits: logos, fonts, colours and reusable assets.
- Templates and user-created template library.
- Resize design to supported social formats.
- Background removal where supported.
- Export PNG, JPEG, SVG/PDF only when actual renderer supports it.
- Respect font, stock and template licensing.

## 4.16 Image and Video Generation

- Separate image generation and video generation workflows.
- Model/provider registry with capabilities, cost, latency, region and policy metadata.
- Prompt builder, reference assets, aspect ratio, duration, quality and seed where provider supports them.
- Show provider, estimated credits and limitations before generation.
- Track generation jobs asynchronously.
- Store outputs in the user's media library.
- Support retries, cancellation and provider failure recovery.
- Do not claim local model inference if a third-party provider is being used.
- Do not promise unsupported 16K, 240 FPS, codec, duration or quality combinations.

## 4.17 Effects, Filters, Transitions and Asset Library

- Searchable categories, tags, favourites and recent tools.
- Effect preview and parameter controls.
- Drag-and-drop to timeline or node graph.
- Non-destructive effect stacks and bypass.
- Transitions with duration and alignment controls.
- Asset licence and attribution metadata.
- Do not redistribute third-party stock assets without appropriate licences.

## 4.18 Export and Render Queue

- Export presets for common social, web and professional formats.
- Resolution, frame rate, codec, bitrate/quality, audio, colour and container options.
- Render estimate and credit estimate before queueing.
- Server-side background rendering.
- Queue, pause/cancel where safe, retry and download.
- Progress from actual worker state, not a fake timer.
- Output validation: file exists, duration, dimensions, FPS, audio streams, codec and decodability.
- Failed jobs refund reserved credits according to billing policy.
- Keep export history and job logs.

**Resolution/FPS honesty:** Treat resolution, frame rate, codec, bit depth, HDR and chroma subsampling as separate capabilities. A UI option is available only if the selected worker/encoder can genuinely render it. Validate hardware, memory, disk, encoder support and expected time. 16K and very high FPS must be capability-gated, not advertised as universally available. Distinguish source FPS, timeline FPS, preview FPS, export FPS and frame interpolation. Do not invent intermediate frames without a real interpolation process.

---

# 5. AI PLATFORM ARCHITECTURE

Create a provider/model abstraction layer.

## AI orchestration
- Task router and planner.
- Model registry.
- Provider adapters.
- Tool registry with typed schemas.
- Workflow DAG/queue.
- Cost estimation and metering.
- Timeout, retry, fallback and circuit breaker.
- Output validation and quality checks.
- Per-user/workspace quotas.
- Model/provider audit trail.
- Human confirmation gates.

## AI tasks
- Classification and content understanding.
- Scene detection.
- Speech recognition.
- Translation.
- Text-to-speech.
- Voice enhancement.
- Smart reframing.
- Face/person/object tracking.
- Segmentation/background removal.
- Caption generation.
- Highlight ranking.
- Image generation.
- Video generation.
- Lip sync.
- Editing plan generation.

Use local/open models where feasible, and licensed external providers only where needed. Do not hardcode one model as universally best. Benchmark models on representative user media and record latency, quality, failure rate, privacy terms and cost. Provide configuration per environment.

AI-generated edit decisions must be inspectable and reversible. Keep a record of input asset IDs, model versions, prompts where appropriate, parameters, output IDs and credit consumption.

---

# 6. SHARED MEDIA AND PROJECT DATA MODEL

Design a coherent domain model. At minimum consider:

- User
- Workspace
- WorkspaceMember
- Role/Permission
- Subscription
- Plan
- CreditWallet
- CreditTransaction
- UsageRecord
- Project
- ProjectVersion
- Sequence
- Track
- Clip
- TimelineOperation
- Keyframe
- MediaAsset
- MediaProxy
- Thumbnail
- Waveform
- Transcript
- SubtitleTrack
- Translation
- VoiceAsset
- GeneratedAsset
- Effect
- EffectPreset
- NodeGraph
- Node
- NodeConnection
- RenderJob
- AIJob
- Export
- APIKey
- APIUsage
- Webhook
- AuditLog
- Notification
- SupportTicket

Use UUIDs, tenant/workspace ownership, created/updated timestamps, soft-delete where appropriate, indexes, constraints and migrations. Use JSON only where schema flexibility is justified; preserve critical fields as typed relational columns.

Timeline and node graph formats need versioned schemas and migration support.

---

# 7. RECOMMENDED TECHNICAL ARCHITECTURE

First inspect the current stack. Retain sound existing decisions unless there is a strong reason to change them.

A suitable baseline, subject to repository audit:

## Frontend
- Next.js with TypeScript.
- React.
- Accessible component system and design tokens.
- State management appropriate to editor complexity.
- WebSocket/SSE for job status and collaboration.
- Web Workers for heavy browser-side tasks.
- WebCodecs only where supported; fallback gracefully.
- Canvas/WebGL/WebGPU only where justified and tested.

## Backend
- FastAPI / Python.
- Versioned REST API `/api/v1`.
- WebSocket endpoints for real-time job/project updates.
- Server-Sent Events where appropriate.
- Pydantic validation.
- SQLAlchemy and Alembic migrations.
- Strict service/repository separation.

## Data and jobs
- PostgreSQL for relational metadata and project state.
- Redis for queue/broker/cache/locks with clear retention policy.
- Celery, Dramatiq or equivalent workers for background processing.
- FFmpeg/FFprobe for media inspection, transcode, proxy and render.
- OpenCV and specialist libraries for supported CV operations.
- Object storage for all media blobs.
- Optional search engine only when product scale justifies it.

## Cloud
- Host frontend and backend on reliable cloud infrastructure.
- Separate API and media/render workers.
- Private S3-compatible object storage, e.g. Cloudflare R2 or another suitable provider.
- CDN for authorized delivery.
- DNS and HTTPS.
- Containerized deployment.
- Health checks, restart policy, backups, metrics, logs and alerts.
- Infrastructure as code where practical.

Do not assume a free tier is reliable enough for a commercial rendering SaaS. Calculate storage, bandwidth, compute, GPU and egress costs before selecting vendors. Never promise 24/7 service based on a best-effort free tier.

## Cloud media storage
- Private buckets.
- Short-lived signed upload/download URLs.
- Resumable multipart uploads.
- File size and content validation.
- Checksums.
- User/workspace isolation.
- Retention and deletion policies.
- Lifecycle management for proxies/cache.
- Backups and restore testing.
- Do not expose storage credentials in frontend code.

## Worker architecture
Separate queues by resource profile:
- metadata/probe
- thumbnail/proxy
- CPU media operations
- GPU AI operations
- render/export
- transcription/translation/voice
- image/video generation

Each job needs:
- unique ID
- tenant/user ownership
- input references
- validated parameters
- estimated cost
- reserved credits
- status and progress
- retry count
- worker lease/heartbeat
- logs
- outputs
- quality validation
- final actual cost
- idempotency key

Jobs must survive browser closure and worker restart. Use durable job state, retry policies, dead-letter handling and reconciliation.

---

# 8. PAID CREDITS / TOKENIZATION / PRICING

Use an internal usage currency named **Buddy Credits** (working label). Credits are not the same as LLM tokens. Explain the distinction clearly.

## Billing principles
- Never charge for ordinary manual editing actions unless there is a real metered compute cost.
- Charge for AI inference, cloud rendering, storage overage, generation and paid API processing.
- Show an estimated credit cost before the user confirms.
- Reserve estimated credits before job dispatch.
- Calculate actual usage after completion.
- Settle the actual amount and release unused reserve.
- If a job fails without usable output, refund the reserved amount according to transparent policy.
- Never double-charge retries.
- Never allow negative balances unless an explicit approved credit facility exists.
- No silent auto top-up.
- Provide usage caps and alerts.
- Keep an immutable append-only transaction ledger.
- Make billing reconciliation auditable.

## Metered operations
Potential units:
- AI analysis: per source minute / complexity band.
- Speech-to-text: audio minute.
- Translation: source words/minutes and target count.
- Voice generation: generated audio seconds/characters.
- Voice enhancement: processed audio minute.
- Lip sync: processed video second/minute and resolution tier.
- Image generation: image/quality tier.
- Video generation: generated seconds, resolution and model tier.
- Upscaling: source minute/output resolution.
- Cloud render: CPU/GPU seconds or validated compute units.
- Storage: GB-month.
- Public API: endpoint-specific units and compute usage.

Do not set final prices arbitrarily. Build a pricing calculator from real provider/compute costs, storage, bandwidth, support, payment fees, tax and margin. Initial plan prices are experiments only until cost data exists.

## Wallet and ledger
- Wallet balance.
- Available credits.
- Reserved credits.
- Purchased credits.
- Promotional credits with expiry.
- Transaction history.
- Refunds and adjustments.
- Monthly plan allocation.
- Expiry rules clearly stated.
- Admin adjustment with reason and audit record.

## Subscription system
Support configurable plans:
- Free
- Starter
- Creator
- Pro
- Studio/Team
- Enterprise

Plan entitlements must be data-driven, not hardcoded into frontend. Define credit allowance, storage, active projects, team seats, render concurrency, maximum upload size, API access and support level.

## Payments
Integrate an approved payment provider suitable for target countries, such as Razorpay or another compliant provider after merchant onboarding and legal review.
- Hosted checkout/tokenized payment methods.
- Verify signed webhooks server-side.
- Idempotent payment events.
- Refund and dispute handling.
- Invoices/receipts and tax-ready records.
- Never store raw card data.
- Never credit wallet from an unverified browser callback.
- Payment provider secrets stay server-side.

---

# 9. PUBLIC PAID DEVELOPER API PLATFORM

Build a real API product, not merely an API key form.

## API product categories
- Media upload and metadata
- Video probe
- Proxy/transcode
- Scene detection
- Silence detection
- Speech-to-text
- Translation
- Subtitle generation
- Audio enhancement
- Smart reframing
- Shorts/clips generation
- Render/export
- Image generation
- Video generation
- Project/timeline operations
- Node graph processing
- Workflow orchestration

Only publish endpoints that are implemented, secured, documented and tested.

## Developer portal pages
- Overview
- Get started
- API keys
- API documentation
- Usage and quota
- Billing
- Request logs
- Webhooks
- SDKs/examples
- Sandbox/test environment
- Error catalogue
- Status/incident history
- Account settings

## API security and reliability
- API key secrets shown only once and stored hashed.
- Create, rotate, revoke keys.
- Scopes and workspace-level permissions.
- Rate limits per key/user/plan.
- Usage quotas and credit billing.
- Request IDs and idempotency keys.
- Webhook signing and retry.
- Pagination and stable response schemas.
- Versioned APIs and deprecation policy.
- Tenant isolation.
- Abuse prevention and anomaly detection.
- Do not put API keys in browser bundles.
- Provide SDKs only after API contracts stabilize.

Example endpoint shape (adapt to actual architecture):
- `POST /api/v1/media/uploads`
- `POST /api/v1/video/probe`
- `POST /api/v1/ai/analyze`
- `POST /api/v1/shorts/generate`
- `POST /api/v1/transcription`
- `POST /api/v1/translation`
- `POST /api/v1/dubbing`
- `POST /api/v1/render/jobs`
- `GET /api/v1/jobs/{job_id}`
- `POST /api/v1/webhooks`

Use OpenAPI as the source of truth. Add examples, schemas, error codes, auth, rate limits and cost units.

---

# 10. TEAM / COLLABORATION / WORKFLOW

- Workspace members, invitations and roles.
- Project sharing with least-privilege access.
- Comments and timecoded review notes.
- Approval workflow.
- Version history and restore.
- Real-time presence only if implemented reliably.
- Conflict handling for simultaneous timeline edits.
- Audit trail.
- Team credit budget and per-member limits.
- Agency client review links with expiry and revocation.

---

# 11. SECURITY, PRIVACY AND COMPLIANCE

Implement:
- Strong authentication and session controls.
- MFA option.
- RBAC and workspace tenant isolation.
- CSRF protection where applicable.
- Secure CORS configuration.
- Rate limiting.
- Input validation and output encoding.
- File upload malware/content validation.
- SSRF protection for URL imports.
- Path traversal protection.
- Secrets manager/environment secrets.
- Encryption in transit and at rest.
- Signed URLs with short expiry.
- Audit logging.
- Backup encryption and restore drills.
- Account export and deletion.
- Data retention and consent controls.
- Privacy-safe telemetry.
- Dependency and container scanning.
- Incident response process.

Do not use uploaded user media to train models without explicit, informed opt-in. Make provider data retention and processing terms visible. Provide deletion pathways for source media, generated assets, transcripts and account data.

For YouTube or other platform integrations:
- Follow current platform API policies, branding guidelines, OAuth scopes and consent requirements.
- Request minimum scopes.
- Let users revoke access.
- Respect data deletion and refresh requirements.
- Do not download, rehost or manipulate platform audiovisual content unless the user has the necessary rights and platform terms allow it.
- Obtain legal review before enabling publishing or analytics features.

For voice cloning, face/lip-sync and synthetic media:
- Require user authorization and appropriate consent.
- Prevent deceptive impersonation and non-consensual identity misuse.
- Clearly label synthetic outputs where appropriate.
- Keep audit records for high-risk actions.

---

# 12. OBSERVABILITY, ADMIN AND SUPPORT

## Admin console
- User/workspace management.
- Subscription and payment status.
- Credit ledger and usage.
- Job queues and worker health.
- Provider/model health and cost.
- Storage use.
- API usage and rate-limit events.
- Refunds and support tools with audit trail.
- Feature flags and rollout controls.
- Abuse/security alerts.

Admin actions must be permission-controlled and audited. Support staff must not see private media content unless the user explicitly shares it or a documented support process authorizes limited access.

## Observability
- Structured logs with correlation/request/job IDs.
- Metrics: latency, queue wait, render duration, failure rate, provider errors, storage, bandwidth, credit settlement.
- Traces across API, queue and workers.
- Error monitoring.
- Uptime/health checks.
- Alerting on queue backlog, failed renders, storage failures, payment webhook failures and unusual spend.

Never log passwords, access tokens, API keys, signed URLs or private media contents.

---

# 13. TESTING AND QUALITY GATES

Create automated tests at multiple levels.

## Backend
- Unit tests for services and billing calculations.
- API contract tests.
- Database migration tests.
- Permission/tenant isolation tests.
- Job idempotency/retry tests.
- Payment webhook signature and duplicate-event tests.
- API key scope/rate-limit tests.
- Storage signed URL and ownership tests.

## Media pipeline
Use real sample media of varied types:
- MP4 H.264/AAC
- MP4 HEVC where supported
- WebM
- MOV
- WAV/MP3/AAC
- PNG/JPEG
- Variable frame rate media
- Portrait, landscape and square
- Different resolutions and durations
- Multiple audio tracks
- Subtitles and unusual metadata

Test:
- Probe
- Thumbnail
- Proxy
- Trim/split
- Multi-track composite
- Audio mixing
- Captions
- Translation/dubbing
- Reframe
- Export
- Output decode and metadata validation
- Cancellation/retry/recovery

## Frontend
- Unit/component tests.
- Route tests.
- Accessibility checks.
- Responsive layout checks.
- End-to-end tests for onboarding, upload, project, AI Magic, edit, shorts, translation, export, billing and API keys.
- Visual regression screenshots for every page.

## Performance and resilience
- Large uploads.
- Long videos.
- Concurrent jobs.
- Queue restart.
- Worker crash.
- Database restart.
- Storage timeout.
- Provider outage.
- Browser closed while job continues.
- Network interruption during upload.
- Duplicate payment webhooks.
- User cancellation.
- Low-credit and insufficient-quota cases.

## Quality acceptance
A feature is complete only if:
1. UI works.
2. Backend operation works.
3. Data persists.
4. Permissions are enforced.
5. Errors are handled.
6. Usage/credits are correct if billable.
7. Output passes validation.
8. Automated tests pass.
9. Documentation is updated.
10. Feature status is updated with evidence.

---

# 14. DEPLOYMENT AND 24/7 CLOUD OPERATION

Build production deployment with:
- Separate development, staging and production environments.
- Docker images and pinned dependencies.
- CI pipeline: lint, typecheck, tests, build, security checks.
- Database migrations as controlled release step.
- Secrets management.
- HTTPS and secure headers.
- Automatic restart and health checks.
- Database backups and restore tests.
- Object storage lifecycle and backup plan.
- Queue monitoring and dead-letter queue.
- Worker autoscaling or controlled concurrency.
- Deployment rollback.
- Release notes and change log.

The app must continue processing queued tasks when the user's local computer is off. Do not depend on a local laptop process for production jobs.

Do not choose infrastructure based solely on “free.” Provide a monthly cost estimate for:
- frontend/server hosting
- API compute
- CPU render workers
- GPU workers
- database
- Redis/queue
- object storage
- bandwidth/egress
- monitoring
- email/auth
- payment fees
- backups

Provide a cost-control plan: worker shutdown/scale-down, quotas, file retention, proxy cleanup, queue limits, maximum render duration and spend alerts.

---

# 15. DELIVERY PLAN — BUILD IN VERIFIED PHASES

Do not attempt to implement every advanced feature in one giant untested commit. Build the complete product in the following dependency order.

### Phase 0 — Audit and design foundation
Repository audit, status matrix, architecture, threat model, design system, page-specific UI specs and references.

### Phase 1 — SaaS foundation
Authentication, workspaces, roles, projects, database migrations, object storage, upload pipeline, dashboard, logs and cloud deployment skeleton.

### Phase 2 — Real editing foundation
Media probe, thumbnails, proxies, sequence model, multitrack timeline, basic editing, autosave, preview and render queue.

### Phase 3 — AI Magic
Analysis pipeline, typed tool registry, plan generation, cost estimate, approval, execution, undo and quality report.

### Phase 4 — Creator workflows
Shorts Maker, Clips & Reels, scene detection, silence removal, smart reframing, captions and batch export.

### Phase 5 — Language and voice
Transcription, subtitle editor, translation, TTS, dubbing, voice controls and consent-gated lip sync.

### Phase 6 — Professional post-production
Colour grading, scopes, audio studio, effects, transitions, keyframes, motion graphics and node-based VFX in incremental releases.

### Phase 7 — Design and generation
Design studio, thumbnails, templates, brand kit, image generation and video generation adapters.

### Phase 8 — Monetization
Buddy Credits, ledger, plans, payment integration, invoices, usage limits, admin billing and refunds.

### Phase 9 — Developer API
API keys, scopes, rate limits, metering, portal, docs, webhooks, logs and SDKs.

### Phase 10 — Scale and launch readiness
Load tests, security audit, accessibility, observability, backups, recovery drills, cost model, legal review and production release.

At the end of each phase:
- Run tests.
- Fix failures.
- Update docs.
- Update feature matrix.
- Provide a concise completion report.
- List blockers and exact next steps.
- Do not silently skip unfinished work.

---

# 16. REQUIRED REPOSITORY DELIVERABLES

Create and maintain:
- `README.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/API_CONTRACTS.md`
- `docs/AI_MODEL_REGISTRY.md`
- `docs/AI_TOOL_CATALOG.md`
- `docs/MEDIA_PIPELINE.md`
- `docs/RENDER_PIPELINE.md`
- `docs/BILLING_AND_CREDITS.md`
- `docs/DEVELOPER_API.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/DEPLOYMENT.md`
- `docs/COST_MODEL.md`
- `docs/TEST_PLAN.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/REPOSITORY_AUDIT.md`
- `docs/FEATURE_STATUS_MATRIX.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/ui/page-specs/`
- `docs/ui/references/`

Also provide:
- `.env.example` with placeholders only.
- Docker/deployment files.
- Database migrations.
- Seed data only for development/test environments.
- CI workflows.
- API OpenAPI schema.
- Worker health checks.
- Backup/restore instructions.
- Test media fixtures or links to legally usable fixtures.
- A clear local development guide.
- A production deployment guide.

Never commit secrets, production media, private keys or real customer data.

---

# 17. FINAL ACCEPTANCE CHECKLIST

The product is not ready for public launch until all critical items are verified:

- [ ] Existing repository audited; no working code discarded without reason.
- [ ] Every page has a page-specific UI specification and visual reference.
- [ ] Authentication, workspace and permissions work.
- [ ] Uploads are secure, resumable and cloud-backed.
- [ ] Projects and timeline state persist.
- [ ] AI Magic performs real analysis and applies approved real operations.
- [ ] Shorts Maker and Clips & Reels work end-to-end.
- [ ] Translation, transcription, TTS and dubbing work with real configured providers/models.
- [ ] Lip sync is implemented only with valid consent and quality checks.
- [ ] Timeline edits render correctly.
- [ ] Node graph operations render correctly for supported nodes.
- [ ] Colour and audio operations are validated.
- [ ] Exports run on cloud workers after browser closure.
- [ ] Output media is probed and validated.
- [ ] Buddy Credits ledger and reservations are correct.
- [ ] Payment webhooks are verified and idempotent.
- [ ] Public API keys are secure and metered.
- [ ] Tenant isolation tests pass.
- [ ] Backups and restore have been tested.
- [ ] Monitoring, alerts and incident procedures exist.
- [ ] Pricing reflects measured operating cost.
- [ ] Privacy, terms, platform API and branding policies are reviewed.
- [ ] No fake buttons, fake AI, fake progress, fake cloud status or fake completion claims remain.
- [ ] Critical end-to-end and security tests pass.

---

# 18. HOW YOU MUST WORK WITH THE FOUNDER

The founder is not expected to understand every engineering detail. Explain decisions in clear, simple English.

At the end of each implementation milestone, report:

1. What you completed.
2. What actually works now.
3. What remains incomplete.
4. Tests run and exact pass/fail results.
5. Any external accounts, credentials, approvals or paid services needed.
6. Estimated ongoing infrastructure/API cost and assumptions.
7. The single next action required from the founder, if any.

Do not ask the founder to provide credentials in chat. Explain how to add them securely to the hosting provider's secrets manager.

If a provider account, GPU, API key, payment approval, legal review or hardware is unavailable, build the correct adapter and mark the feature `BLOCKED` or `NOT_CONFIGURED`; do not fake its output.

**Start now with Phase 0: inspect the repository, run the baseline tests, create the audit and feature matrix, and produce the page-by-page UI reference plan. Do not start by replacing the whole application.**
