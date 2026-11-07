# Custom fine-tuning: separate phase (not started)

Status: **plan only**. Nothing in the app is fine-tuned today. The app runs pinned, unmodified open models
(`backend/app/speech/models.lock.json`). Start this phase only after real creators use dubbing and the evaluation
below shows where quality is actually lacking. Training has a real cost; swapping in a better ready-made model is
usually cheaper and comes first.

## 1. Why, and what to improve (measured, not guessed)
Baseline from `backend/scripts/eval_dubbing.py` (`docs/DUBBING_EVAL.md`):

| Area | Current model | Baseline to beat | Target before shipping a tuned model |
|---|---|---|---|
| Hindi / Hinglish speech-to-text | Whisper small (MIT) | CER on FLEURS-hi dev (see eval) | ≥ 25% relative CER reduction, no regression on English |
| Hindi ↔ English translation | Argos en↔hi 1.1 | back-translation chrF (see eval) | +5 chrF and fewer dropped clauses in a 100-line human review |
| Hindi voice | Kokoro-82M hf_/hm_ voices (Apache-2.0) | judge CER 9–13% on FLEURS sentences | ≥ 4.0 MOS from 20 native listeners, judge CER ≤ 8% |
| More Indian languages (ta, te, mr, bn, kn, gu, ml, pa…) | none commercially usable | — | a working, licence-clean path per language |

## 2. Step 0: try better pretrained models first (no training)
| Need | Candidate | Licence (verify before use) | Cost to run |
|---|---|---|---|
| Better Hindi ASR | Whisper medium (already pinned) / large-v3 | MIT | 3× / 6× slower on CPU, more RAM |
| 22 Indian languages, translation | AI4Bharat IndicTrans2 (distilled 200M) | MIT | PyTorch, ~1–2 GB RAM, CPU possible but slow |
| Indian-language voices | AI4Bharat Indic Parler-TTS | Apache-2.0 | ~0.9B params: needs ≥ 4 GB RAM, GPU recommended |
| Speaker separation | pyannote 3.1 | MIT (gated download) | PyTorch; better overlap handling than WeSpeaker clustering |

Each swap goes through the same evaluation (section 5) and the same pin/verify process (`app/speech/assets.py`).

## 3. Datasets (licences must allow commercial use; check each again before downloading)
| Use | Dataset | Licence as published | Notes |
|---|---|---|---|
| ASR eval + tuning | Google FLEURS (hi, en, bn, ta, te, mr…) | CC-BY-4.0 | Read speech; the dev split is already used for evaluation, so keep test separate |
| ASR tuning | Mozilla Common Voice (hi and Indic) | CC0 | Crowd-sourced; filter by up-votes |
| ASR tuning | AI4Bharat IndicVoices / Kathbath | CC-BY-4.0 (verify per release) | Large, diverse Indian speech |
| ASR, Hinglish | **Your own creators' videos, with written consent** | your terms | Best source for real Hinglish; needs consent + PII review |
| Translation | AI4Bharat BPCC / Samanantar | CC0 / CC-BY (verify) | Parallel en↔Indic corpora |
| TTS voice | A **paid, consented voice actor** recording 3–10 h | contract | Only clean route to a unique, commercial Hindi brand voice |

Never train on users' media without explicit opt-in. Keep a dataset card (source, licence, consent, date) for each set.

## 4. Budget (estimates; get current quotes before committing)
| Item | Rough size | Estimate |
|---|---|---|
| Whisper small/medium fine-tune on ~100–300 h Hindi/Hinglish | 1× A100-class GPU, 10–30 GPU-hours | $25–$90 rented GPU time |
| Translation fine-tune (IndicTrans2-distilled) | 1 GPU, 10–20 h | $20–$60 |
| Custom Hindi voice (voice actor + training) | 5 h studio recording + 20–40 GPU-hours | ₹40,000–₹1,50,000 recording + $50–$150 compute |
| Human evaluation (20 listeners × 1 h) | per language | ₹10,000–₹20,000 |
| Engineering time | 2–4 weeks per model | the biggest cost |

Free GPU tiers (Kaggle, Colab) are fine for experiments, not for production training runs.

## 5. Evaluation plan (gate for every candidate model)
1. **Fixed test sets** that are never trained on: FLEURS test split per language, plus 30 minutes of consented
   creator Hinglish with human transcripts.
2. **Automatic metrics:**
   - speech-to-text: WER/CER;
   - translation: chrF and COMET;
   - voice: judge-ASR CER (Whisper medium re-transcribes each voiced line, as in `eval_dubbing.py`);
   - sync: overruns, speed-ups and shift (from the render report).
3. **Human review:**
   - 100 translated lines rated adequacy/fluency 1–5 by two native speakers;
   - voice MOS 1–5 by 20 native listeners, blind against the current model;
   - for dubs, a lip/scene sync check on 10 real videos.
4. **Ship gate:** better on the targets in section 1, no regression > 2% on any other language, same or lower RAM on
   the worker, licence of weights + data confirmed in writing, pinned in `models.lock.json`, `assets verify` passes offline.
5. **Rollback:** the previous pinned model stays in the lock file; switching back is a config change.
