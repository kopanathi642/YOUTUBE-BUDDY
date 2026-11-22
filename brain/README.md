# Buddy Super Editor Brain — training workspace

Custom models for YouTube Buddy X. Status of every model is in `reports/MODEL_INVENTORY.md`;
nothing is called "trained" without weights, a manifest with file hashes, a held-out evaluation and a
fresh-process verification.

## What is here

| Path | What it is |
|---|---|
| `reports/` | Phase 0 audit: model inventory, dataset inventory, compute, readiness, execution plan |
| `buddy_brain/plan.py` | Edit-plan format (`S asset start end transition`, `M music vol`, `G grade`, `<END>`) and strict parser |
| `buddy_brain/executor.py` | Turns a plan into the editor's real `Timeline` and validates it with `backend/app/timeline.py` |
| `buddy_brain/rules.py` | Rule planner (label generator for synthetic data) and naive baseline |
| `buddy_brain/metrics.py` | parsed / executable / duration / lock / quality / pacing / transition / grade / music / fully_valid / shot IoU |
| `data/build_synth.py` | Builds **BuddyPlan-Synth v0** (6000 / 300 / 400, separate seeds, sha256 manifest) |
| `schema/annotated_project.schema.json` | Format for real, rights-cleared annotated projects (provenance + consent required) |
| `train_scratch.py` | Stage B0: small GPT-2-style planner trained from scratch (CPU OK) |
| `train_lora.py` | Stage B1: LoRA / QLoRA on Qwen2.5-0.5B-Instruct or Qwen3-4B-Instruct-2507 (GPU) |
| `evaluate.py` | Held-out test evaluation vs the naive baseline → `EVAL_REPORT.json` |
| `verify.py` | Fresh-process check: file hashes, finite weights, reload, plans pass the editor's validator → `VERIFICATION.json` |
| `kaggle/buddy_planner_lora.ipynb` | One-click GPU run on a free Kaggle T4 |

## Commands

### CPU advertisement draft

In a project's Editor, open **AI Assistant → Director · Make a 30-second ad**. Select at least 30 seconds of ready footage,
choose the product reveal, and optionally add a music track. The Director reserves the end of the reveal clip, assembles
the remaining shots using measured scene cuts and clip order, applies a grade, and creates a separate sequence with
editable markers. Music-grid timing uses the entered BPM and assumes a downbeat at zero. Export with the normal MP4
exporter. Revisions use the existing timeline, version history, undo and redo.

Run `python brain/hardware.py` to inspect host CPU, RAM and NVIDIA driver visibility without loading a model.
With the backend dependencies and FFmpeg installed, set `PYTHONPATH=backend` and run
`python brain/demo_ad.py OUTPUT_DIRECTORY` from the repository root. Use a new output directory.
The demo generates original watch footage and a score, measures the footage, builds the same timeline as the editor,
renders a 30-second ad and a quieter-music revision, and decodes both files to check playback.

This first Director workflow uses rules for pacing and grade. Opening footage follows the selected media order.
The user identifies the product reveal. Semantic shot recognition, unrestricted natural-language revisions and blind
professional evaluations remain future phases. No cloud account or local accelerator is required for this workflow.
Optional weight training belongs in the existing Kaggle notebook or an explicitly provisioned cloud notebook.
Existing hosted generation adapters and remote GPU workers are separate capabilities with their own configuration and costs.

```bash
python brain/data/build_synth.py
python brain/train_scratch.py --epochs 3 --layers 4 --dim 192 --heads 6 --out brain/checkpoints/planner-scratch-v0
python brain/evaluate.py --model brain/checkpoints/planner-scratch-v0 --n 400
python brain/verify.py   --model brain/checkpoints/planner-scratch-v0
```

## Honest limits

- Synth v0 labels come from a rule planner (`label_source: synthetic_rule_v0`). A model trained on them learns the
  plan format and the editor's hard constraints, **not** professional taste. Real taste needs rights-cleared
  projects annotated with the schema above (`label_source: human_expert`).
- No model reaches 100% on subjective creative quality. Hard constraints (valid timeline, duration, locks,
  no unusable footage) can be enforced to 100% by running the plan through the executor and falling back to
  the rule planner when it fails.
- No YouTube videos are downloaded or used for training.
