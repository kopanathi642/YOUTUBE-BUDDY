# Page-by-page reference plan

Source references (founder supplied, in `source-references/`):
* **EDITOR-MASTER-reference.png** — the editor page must follow this layout (media bin left, program viewer centre, assistant/inspector right, multitrack timeline bottom, export bottom-right).
* **page-sheet-A-16-pages.png** and **page-sheet-B-20-pages.png** — every other page has its own design taken from its panel in these sheets.

Built pages have a spec in `page-specs/` and a screenshot of the real implementation (1440×900 desktop + 390×844 mobile) in `references/`.

| Page | Route | Universe | Reference panel | Status |
|---|---|---|---|---|
| Landing | `/` | all | A-01, B-1 | **Built** — honest "what's live" section instead of fake 16K/240 FPS claims |
| Sign in / Sign up | `/signin`, `/signup` | all | (style of B-1) | **Built** |
| Dashboard (Home) | `/home` | Editor | A-02, B-2 | **Built** — quick tiles; AI tiles shown as Soon |
| Projects | `/projects` | Editor | B-2 (Recent projects) | **Built** |
| Main Video Editor | `/edit/:id` | Editor | EDITOR-MASTER, A-03, B-3 | **Built** |
| Export & Render | inside editor (Export tab) | Editor | A-16, B-20 | **Built** (queue, presets, verified download) |
| Color Grading Studio | `/edit/:id/color` | Editor | A-08, B-9 | Planned (Phase 6) |
| Audio / Fairlight-style Studio | `/edit/:id/audio` | Editor | A-10, B-10 | Planned (Phase 6) |
| Fusion / Node VFX | `/edit/:id/fusion` | Editor | A-09, B-8 | Planned (Phase 6) |
| Motion Graphics & Titles | `/edit/:id/motion` | Editor | A-11 | Planned (Phase 2b/6) |
| Templates & Asset Library | `/library` | Editor | A-13, B-14 | Planned |
| Cloud Storage | `/storage` | Editor | B-18 | Planned (data already available via workspace summary) |
| Account & Settings | `/settings` | all | B-19 | Planned (Phase 1b) |
| AI Magic – One Click | `/ai/magic` | AI Creation | A-04, image 04 | Planned (Phase 3) |
| Shorts Maker | `/ai/shorts` | AI Creation | A-05, B-4 | Planned (Phase 4) |
| Clips & Reels | `/ai/clips` | AI Creation | B-5 | Planned (Phase 4) |
| Translate & Dub | `/ai/translate` | AI Creation | A-06, B-6 | Planned (Phase 5) |
| Lip Sync Studio | `/ai/lipsync` | AI Creation | A-07, B-7 | Planned (Phase 5, consent-gated) |
| Design & Thumbnail | `/design` | AI Creation | A-12, B-11 | Planned (Phase 7) |
| AI Generate | `/ai/generate` | AI Creation | B-13 | Planned (Phase 7) |
| Buddy Credits & Pricing | `/billing`, `/pricing` | Super | A-14, B-15 | Planned (Phase 8) |
| Developer Platform | `/developers` | Super | A-15, B-16 | Planned (Phase 9) |
| Team & Collaboration | `/team` | Super | A-16, B-17 | Planned |

Rule for every new page: write `page-specs/<page>.md` (purpose, layout at 1440×900 and mobile, primary action, states: loading / empty / error / permission-denied / offline / success) → build → screenshot into `references/` → compare with its sheet panel.
