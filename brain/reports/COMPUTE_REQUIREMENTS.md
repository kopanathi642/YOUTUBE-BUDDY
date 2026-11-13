# Compute (verified 2026-11-13 unless marked)

| Machine | Verified facts | Can train |
| --- | --- | --- |
| This cloud workspace | 2 CPUs, 7 GB RAM, **no GPU**; downloads only from PyPI/npm/GitHub (Hugging Face, Kaggle, PyTorch CDN blocked) | Small models **from scratch** on CPU only; cannot fetch pretrained weights |
| Owner's laptop (kumar-bhargav) | Windows; Docker's WSL VM capped at 3.68 GB (consistent with ~8 GB RAM); Intel graphics profile present; Task Manager showed 90–97 % CPU and 90 % memory in use during the audit. The prompt states RTX 4050 6 GB / 24 GB RAM — **not confirmed by this audit** | Not for LLM training while it also hosts the live site |
| Kaggle free GPU (T4 16 GB / P100) | Owner has an account (previous notebooks). Quota/limits not checked here | **LoRA of 0.5B–4B models** (4-bit for 4B) — the recommended place for Model 2 |

Rough needs (estimates):
- Qwen2.5/Qwen3 0.5–0.6B LoRA, 5k examples × 512 tokens, 3 epochs: ~20–40 min on a T4.
- Qwen3-4B QLoRA, same data: ~2–4 h on a T4.
- Shot ranker / cut predictor (feature models): CPU minutes once features exist.
