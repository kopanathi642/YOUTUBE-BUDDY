# Training readiness (2026-11-13)

## Available now
- Live app with a strict, validated timeline format (`backend/app/timeline.py`) → editing plans can be **checked for executability**, not just parsed.
- Media analysis already produces scene cuts, silences, faces, loudness (`backend/app/analysis.py`) → planner inputs.
- `brain/` pipeline (this phase): plan schema, synthetic dataset v0 with provenance, validator, metrics, from-scratch trainer (CPU), LoRA trainer (GPU), evaluator, checkpoint hashing, fresh-process verification, Kaggle notebook.

## Missing (exact)
1. `YouTube-Buddy-X-Director-Pilot.zip` — need its location (or the Kaggle output files: `adapter_model.safetensors`, `adapter_config.json`, tokenizer files, training log).
2. Access to the Kaggle dataset "YouTube Buddy X Director Preserved V3" — download it from Kaggle (Output tab) and put it in the repo's `brain/incoming/`, or share its manifest.
3. Pretrained base weights in this workspace — blocked network. Either allow `huggingface.co` for this workspace (claude.ai → Settings → Capabilities) or run `brain/kaggle/buddy_planner_lora.ipynb` on Kaggle.
4. Real editing data with rights (see plan). Without it, models learn **format and constraints**, not professional taste.

## Executable immediately
- Build BuddyPlan-Synth v0, train the from-scratch pipeline model on CPU, evaluate, hash, fresh-process verify (done here; results in `brain/results/`).
- Kaggle notebook for the real Qwen LoRA run (owner runs it; I verify the downloaded adapter with `brain/verify.py`).
