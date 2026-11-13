# Dataset inventory (2026-11-13)

| Dataset | Status | Provenance | Rights for training |
| --- | --- | --- | --- |
| "YouTube Buddy X Director Preserved V3" (private Kaggle) | **Claimed, not accessible here** | Unknown — its manifest must be checked | Unknown until its sources are listed |
| `brain` **BuddyPlan-Synth v0** | **Created** by `brain/data/build_synth.py` (deterministic, seed recorded) | Programmatically generated asset inventories and briefs; plans from a documented rule planner | Owned by the project. **Labels are synthetic rules, not expert judgements** (`label_source: synthetic_rule_v0`) |
| Professional editing projects (target 1,000) | **0 collected** | — | Needs licensed/consented sources (see `TRAINING_EXECUTION_PLAN.md`) |
| Expert preference pairs | **0 collected** | — | Needs paid/consented expert annotators |
| Users' uploaded media | **Excluded** | — | Never used without explicit opt-in |

Rule: no YouTube downloads. Every record carries `source`, `license`, `label_source`, `dataset_version`.
