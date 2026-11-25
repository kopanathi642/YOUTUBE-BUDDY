# YB Writer — the site's own free writing model (Kaggle)

Trains a small writing model for the 13 writing tasks in `backend/app/tools/engines.py` (`TASKS`) in English, Hindi,
Telugu, Tamil, Kannada, Malayalam, Bengali and Marathi, so the writing tools run on the ASUS processor for ₹0.

| Step | What | Where |
|---|---|---|
| 1 | Teacher **Qwen3-14B-AWQ** (vLLM, 2×T4; fallback Qwen3-8B) answers the site's exact prompts; every answer is checked | `gen.py` |
| 2 | Student **Qwen3-1.7B** LoRA (r=32, fp16, 2 epochs) learns the good answers, prompt formatted exactly as llama.cpp does | `train.py` |
| 3 | Held-out test, base vs trained, same checks | `evaluate.py` → `report.md` |
| 4 | Merge → GGUF Q4_K_M (~1.1 GB) + sha256 | notebook |

All models Apache-2.0 (commercial use allowed).

**Checks** (`ybw_data.check`): valid JSON in the tool's shape; exact item counts; titles ≤ 70 characters (lengths
recomputed, not trusted); ≥ 60% of letters in the chosen language's script (Hinglish must be Latin letters); camera
moves from the allowed list; description includes the given link; SEO scores honest (weak metadata ≤ 45, strong ≥ 55).

**Run:** upload `yb_writer_kaggle.ipynb` to Kaggle → GPU T4 x2 + Internet on → Save Version → Save & Run All.

**Keep in sync:** when `TASKS` or `LANG_HINT` change, re-export `prompts.json` and run `python build_notebook.py`.
`prompts.json` is checked against the backend by building prompts through `engines.run_llm` (0 mismatches on 2026-11-25).

**Tested here (no GPU):** data builder with a stub teacher; check() positive/negative cases; train → merge → evaluate
end-to-end on a tiny random Qwen3 on CPU. Not yet run with the real models — the first Kaggle run is the real test.

**Not enabled on the site until** `report.md` shows the trained model passing, and the same tools pass the site's own
`backend/scripts/eval_writing.py` on the ASUS.
