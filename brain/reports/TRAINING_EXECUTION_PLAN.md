# Training execution plan

| Stage | Model | Data | Where | Gate to pass |
| --- | --- | --- | --- | --- |
| A Baseline | rule planner + base LLM zero-shot | BuddyPlan-Synth v0 test split | Kaggle | numbers recorded in `results/` |
| B0 Pipeline proof | tiny GPT from scratch (≈4M params) | Synth v0 | this workspace (CPU) | executable-plan rate on held-out, fresh-process reload, hashes |
| B1 Planner LoRA | Qwen2.5-0.5B-Instruct (Apache-2.0), then Qwen3-4B-Instruct-2507 QLoRA | Synth v0 + owner-approved real projects | Kaggle T4 | beats Stage A on every validity metric; no regression |
| C Shot ranker | small MLP / GBDT on analysis features | expert pairwise labels (to collect) | CPU | pairwise accuracy vs. 2 human raters |
| D Creative planning | B1 + expert plans | licensed/consented projects | Kaggle/rented GPU | blind human preference ≥ baseline |
| E Preference (DPO) | B1 | expert A/B choices | GPU | win-rate with confidence interval |

Data acquisition toward 1,000 projects (all with written rights):
1. The owner's own channel projects (raw + final + timeline) — fastest, cleanest.
2. Paid editors on contract: raw footage + their edit + timeline export + short rationale (rights assigned in contract).
3. Creator partners opting in through the app (explicit training consent checkbox, revocable).
4. Openly licensed footage (CC0/CC-BY, e.g. Pexels/Pixabay licences checked per clip) edited by contracted editors.
Never: scraped YouTube videos.
