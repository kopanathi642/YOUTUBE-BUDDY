# Model inventory — YouTube Buddy X (audited 2026-11-13)

Legend: **Verified** = checked in this audit (file, hash or fresh load). **Claimed** = mentioned by the owner, not seen.
States: Proposed · Dataset preparation · Training ready · Training in progress · Trained · Verified · Deployed.

## A. Custom (owner-trained) models
| Model | Where it should be | What the audit found | State |
| --- | --- | --- | --- |
| YouTube Buddy X **Director** (Qwen/Qwen3-4B-Instruct-2507 base, LoRA?) | `YouTube-Buddy-X-Director-Pilot.zip`; Kaggle notebook `animalhtkids/youtube-buddy-x-qwen3-director-training`; private Kaggle dataset "YouTube Buddy X Director Preserved V3" | **Not found.** Not in GitHub repo `kopanathi642/youtubebuddy` (209 files, commit 7da379f, no training code, no Qwen/LoRA/adapter/safetensors references), not in `kopanathi642/YOUTUBE-BUDDY`, not in laptop `Downloads` or `Documents`. Kaggle is not reachable from this workspace (network allowlist: PyPI, npm, GitHub only). | **Claimed, unverified.** Treated as not available until the files are produced and pass `brain/verify.py`. |
| Buddy Editing Planner (Model 2) | `brain/` | Built in this phase — see `brain/results/` | see `TRAINING_EXECUTION_PLAN.md` |
| Models 1, 3–10 of the Buddy Editor family | — | Nothing exists | Proposed |

## B. Pretrained third-party models the live app already runs (unmodified, pinned)
| Purpose | Model | Licence (as published) | Evidence |
| --- | --- | --- | --- |
| Speech-to-text | faster-whisper (Whisper small/medium) | MIT | `backend/app/speech/models.lock.json`, sha256 pinned |
| Translation | Argos Translate packages (≈60 language pairs) | MIT project / OPUS data | same lock file, sha256 per package |
| Voices | Kokoro-82M ONNX; Piper voices | Apache-2.0 / per-voice | lock file |
| Speaker labels | WeSpeaker ResNet34 | Apache-2.0 | `app/speech/diarize.py` |
| Background removal | rembg u2netp | Apache-2.0 | `app/ai_engines.py` |
| Object removal | LaMa (big-lama) | Apache-2.0 | `app/ai_engines.py` |
| Upscaling | FSRCNN x2/x4 | Apache-2.0 | `backend/app/assets/sr/NOTICE.md` (sha256) |
| Face finding | OpenCV Haar cascade | BSD/Apache | OpenCV package |
| Writing (optional) | Qwen3-4B GGUF via llama.cpp (laptop), Groq-hosted models, Claude/OpenAI | Apache-2.0 / provider terms | `deploy/home/compose.yaml`, `app/tools/providers.py` |
| Video generation pilot | Wan 2.2 TI2V-5B | Apache-2.0 | `gpu/youtube_buddy_x_wan_pilot.ipynb` (notebook only; no results file in repo) |

None of section B is fine-tuned. `docs/FINE_TUNING_PLAN.md` (speech) is a plan only.

## C. Second repository `kopanathi642/youtubebuddy`
Older separate app (Next.js + FastAPI, LangGraph). Calls Ollama, Groq, Gemini, OpenRouter, SDXL and Whisper through providers.
**No training code, datasets, checkpoints or adapters.** Its `AI_PRODUCTION_SETUP.md` describes fine-tuning options only as text.

## Update 2026-11-13 — planner-scratch-v0 (Stage B0) result

| Field | Value |
|---|---|
| Status | **Trained, evaluated, FAILED the quality bar. Not verified. Not for app use.** |
| Weights | `brain/checkpoints/planner-scratch-v0/model.safetensors` (2,178,432 params, sha256 in TRAINING_MANIFEST.json) |
| Training | CPU, 5,994 synth_v0 examples, 3 epochs, 66 min; val loss 1.415 → 1.222 → 1.137 |
| Held-out test (400 briefs) | parsed 42%, executable 12%, **fully valid 1%** (naive baseline 29%) — `EVAL_REPORT.json` |
| Fresh-process check | hashes OK, weights finite, reload OK; inference 0/50 fully valid → `verified: false` — `VERIFICATION.json` |
| Why it failed | A 2M-param model trained from scratch learned the plan's structure, transitions and grades, but not to write valid numbers (e.g. `S A1 16.0 4.0` = end before start). |
| Next | (1) Change the output from free-typed seconds to choosing candidate segments by id, with the executor computing times — a far easier task; (2) LoRA on a pretrained Qwen (GPU, `brain/kaggle/`). |
