# YB AI Editor Brain — status against the master prompt (23 Nov 2026)

Rule: only what is built and tested is marked done. No quality claims without measurements.

## Built and tested — the "first required demonstration" (master prompt §15)

**AI Ad Editor** (`/ai-generator/tool/121`, `backend/app/tools/ad_editor.py`) — runs on the CPU worker, no GPU, no paid key.

| Step from §15 | How it is done | Test |
|---|---|---|
| 1. Inspect footage | Scene cuts → ≤4 s windows; sharpness (absolute Laplacian scale), exposure, colourfulness, motion, faces (OpenCV). Cached on the asset. | `test_ad_editor.py` |
| 2. Editing plan | Brief → length / format / look / pace / reveal (explicit options win); hook → build → climax → reveal arc | `test_brief_is_read_into_settings` |
| 3. Select shots | Scored per section; dark (<8 % brightness) and blurred (sharpness <15) shots are never picked while usable ones exist; every pick has a written reason | e2e asserts dark/blurry unused |
| 4. Real timeline | Normal editor sequence: cover-crop per aspect, colour grade, vignette, letterbox, push-in + dissolve on the reveal, end title, music bed with fades | sequence validated, opens in the editor |
| 5. Editing operations | Cuts on music beats (spectral-flux beat tracker; steady grid without music) | `test_cut_plan_lands_on_beats_and_has_an_arc` |
| 6. Render | The export compiler (FFmpeg), audio mastered to −14 LUFS | real MP4 in tests |
| 7. Validate | Length, picture size, sound track, black-gap scan, loudness — pass/fail shown to the user | `all_checks_ok` |
| 8. Download | Output video in the asset library | browser test |
| 9–10. Revisions | "faster, 15 seconds, vertical, cooler, title: …, different opening" → only plan + render redone; analysis reused | revision test (15 s 9:16 from a 30 s 16:9) |

Measured on the test footage: 30 s ad rendered in ~75 s on the dev worker; revision ~60 s.

**Honest limits:** planning is rule-based from measured signals — it does not understand story content the way a
person does. No generated footage (needs a paid cloud model, cost shown and approved first).

## Master prompt phases

| Phase | State |
|---|---|
| 1 Audit existing features | Done — `docs/FEATURE_STATUS_MATRIX.md`, all suites green 22–23 Nov |
| 2 CPU timeline + render engine | Done earlier (multi-track, keyframes, undo/redo, autosave, 34 transitions, 28 effects) |
| 3 Director LLM + structured planning | Partial — Director Agent (119) needs a hosted LLM key (Groq has a free tier) |
| 4 Hosted image/video/audio models | Built behind `FAL_KEY` (40 tools); off until a key is added |
| 5 Autonomous editing workflows | **AI Ad Editor (this doc)**, Auto Shorts, Long→Shorts, Podcast clips |
| 6 Professional skill library (20 genres) | Not started — next: make the ad editor's arc/pace/look a per-genre "skill" record |
| 7 Personalisation + online skill research | Not started (needs approval for per-user preference storage — DB column) |
| 8 Benchmark arena | Not started — needs licensed test projects + independent reviewers; no scores claimed |
| 9 Cloud fine-tuning (Kaggle/Colab) | Not started — notebooks only, never as production servers |
| 10 SaaS hardening | Ongoing (rate limits, CSP, signed URLs, credit ledger exist) |

## Next steps (in order)
1. Optional LLM pass over the plan when a key exists (better hook choice from transcripts), still with the rule plan as fallback.
2. Genre skills: wedding, product, YouTube intro, sports highlight, real estate — each a versioned record (arc, pace, look, checks).
3. Speech-aware cutting (never cut mid-word) using the existing Whisper transcripts.
4. A small blind-review set (10 projects, 3 reviewers) before any quality claim.
