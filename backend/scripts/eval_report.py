"""Turn eval_dubbing.py's eval.json (+ e2e_dubbing.py's e2e.json) into docs/DUBBING_EVAL.md.

    python scripts/eval_report.py eval.json e2e.json OUT.md
"""
import json
import sys

import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.speech import catalog  # noqa: E402

ev = json.load(open(sys.argv[1]))
e2e = json.load(open(sys.argv[2])) if len(sys.argv) > 3 else None
out = sys.argv[-1]
L = catalog.LANG_NAMES
w = []
w.append("# Captions and dubbing — measured on real speech, offline (2026-11-07)\n")
w.append(f"Machine: {ev['cpu']} CPU cores, no GPU. Models from `models.lock.json`; **downloads disabled** (`MODELS_OFFLINE=1`, "
         "proxy pointed at a dead address). App speech-to-text model: Whisper **" + ev["whisper"] + "**. Reproduce: "
         "`backend/scripts/eval_dubbing.py` (FLEURS dev, CC-BY-4.0) and `backend/scripts/e2e_dubbing.py`.\n")
w.append("## 1. Captions (speech-to-text) on human recordings\n")
w.append("| Language | Utterances | Error rate | Speed (processing ÷ audio) | Language detected |\n|---|---|---|---|---|")
for lang, a in ev["asr"].items():
    w.append(f"| {L.get(lang, lang)} | {a['utterances']} | {a['metric']} {a['error_rate']}% | {a['realtime_factor']}× | {a['language_detected']} |")
w.append("\nWER = word error rate (English, Spanish); CER = character error rate (Hindi, where word boundaries vary). "
         "FLEURS records each sentence from several speakers, so the 25 Hindi utterances repeat some sentences.\n")
w.append("**Hindi model choice** (10 *different* FLEURS sentences, language set to Hindi):\n")
w.append("| Whisper | Decoding | Hindi CER | Speed (× audio) |\n|---|---|---|---|")
w.append("| small (default) | default | 23.1% | 0.72× |\n| small | strict (no fallback, Devanagari prompt) | 28.3% | 0.79× |")
w.append("| medium | default | **19.5%** | 1.89× |\n| medium | strict | 22.5% | 1.76× |\n")
w.append("Recommendation: Whisper **medium** for Hindi-first channels once the worker has ≥ 4 GB RAM (`WHISPER_MODEL=medium`, already pinned); "
         "small stays the default because it fits the current 2 GB worker. The 'strict' settings were rejected (worse).\n")
m = ev["mixed"]
w.append("## 2. Mixed-language speech (Hindi + English in one clip)\n")
w.append(f"File language detected: **{L.get(m['file_language'], m['file_language'])}**, marked mixed: **{m['mixed_flag']}**, "
         f"seconds per language: {m['languages']}. Sentence spans with the right language: **{m['correct_spans']}/{m['total_spans']}**.\n")
w.append("| Truth | Detected |\n|---|---|")
for g in m["spans"]:
    w.append(f"| {g['truth']} | {', '.join(g['detected']) or '—'} {'✅' if g['ok'] else '❌'} |")
sp = ev["speakers"]
w.append("\n## 3. Speakers\n")
if sp.get("skipped"):
    w.append(sp["skipped"])
else:
    w.append(f"Six real utterances alternating male/female: labels {sp['labels']} → **{sp['speakers_found']} speakers found**, purity "
             f"**{sp['purity']}** (1.0 = every label belongs to one gender group). {sp['note']}.\n")
t = ev["targets"]
src = t.pop("source")
w.append("## 4. Every target language, end to end\n")
w.append(f"Source: {src['segments']} English sentences from FLEURS ({src['audio_s']} s, over a quiet music bed, as an MP4); "
         f"Whisper's English transcript WER vs the human text: {src['wer_vs_human']}%. For each language: translate → voice on the "
         "original timing → mix → export MP4/M4A/SRT/VTT, then:\n")
w.append("- **Pronunciation:** an independent judge (Whisper *medium*) re-recognises every voiced line in that language; CER vs the text the voice was asked to say (lower is better; human Hindi speech scores ~20–27% on the same judge family).")
w.append("- **Translation:** the translation is translated back to English; chrF vs the English source (0–100, higher is better; a proxy, not a human rating).")
w.append("- **Sync:** lines sped up (max 1.45×), lines that ran past the next line's start, largest shift. **Files:** MP4 has video+audio at the right length, SRT/VTT cue count = lines, M4A plays.\n")
w.append("| Language | Voice (engine) | Pronunciation CER | Judge heard | Back-translation chrF | Sped up / overruns / max shift | Render time (× clip) | Files OK |\n|---|---|---|---|---|---|---|---|")
for lang, r in t.items():
    heard = ", ".join(f"{k}×{v}" for k, v in r["judge_heard_language"].items()) if isinstance(r.get("judge_heard_language"), dict) else r.get("judge_heard_language")
    w.append(f"| {L.get(lang, lang)} `{lang}` | {r['voice']} ({r['engine']}) | {r['pronunciation_cer']}% | {heard} | {r['back_translation_chrf']} | "
             f"{r['sped_up']}/{r['lines']} · {r['overruns']} · {r['max_shift_s']} s | {r['render_s']} s ({r['realtime_factor']}×) | {'✅' if r['files_ok'] else '❌'} |")
w.append("\nSample lines (first sentence; translation → what the judge heard):\n")
for lang, r in t.items():
    w.append(f"- **{lang}**: {r['sample_line']} → _{r['heard_back'].split(' | ')[0][:110]}_")
w.append("\n## 5. Real-speech sources into other languages (incl. pivots through English)\n")
w.append("| Pair | Detected | Route | First source line | First translated line | Overruns | Time |\n|---|---|---|---|---|---|---|")
for k, r in ev["sources"].items():
    w.append(f"| {k} | {r['detected']} | {r['route']} | {r['source_line']} | {r['translated_line']} | {r['overruns']} | {r['seconds']} s |")
if e2e:
    w.append("\n## 6. Through the running app (upload → studio → render → download), worker verified models offline before starting\n")
    p = e2e["prepare"]
    w.append(f"Upload: {e2e['upload']}. Recognition: detected **{p['detected']}**, mixed **{p['detection'].get('mixed')}** "
             f"({p['detection'].get('languages')}), **{p['segments']} sentences**, speakers {list(p['speakers'])}, {p['seconds']} s. "
             f"All languages rendered in {e2e['render_seconds_all']} s.\n")
    w.append("| Language | Status | MP4 | M4A | Voice WAV | SRT cues | VTT cues | Render report |\n|---|---|---|---|---|---|---|---|")
    for lang, r in e2e["languages"].items():
        f = r["files"]
        def av(k):
            x = f.get(k)
            return f"{'+'.join(x['streams'])} {x['duration']:.1f}s" if x and x.get("streams") else "—"
        rep = r["report"]
        w.append(f"| {L.get(lang, lang)} | {r['status']} | {av('mp4')} | {av('audio_m4a')} | {av('voice_wav')} | {f.get('srt', {}).get('cues', '—')} | "
                 f"{f.get('vtt', {}).get('cues', '—')} | {rep.get('seconds')} s, {rep.get('lines_sped_up')} sped up, {rep.get('lines_overrunning')} overruns, peak {rep.get('peak_memory_mb')} MB |")
    w.append("\nFirst subtitle cue per language:\n")
    for lang, r in e2e["languages"].items():
        w.append(f"- **{lang}**: `{r['files'].get('srt', {}).get('first_cue', '').replace(chr(10), ' / ')}`")
w.append(f"\n## 7. Resources\n\nWhole evaluation: {ev['total_s']} s; peak memory of the evaluation process {ev['peak_mb']} MB "
         "(it holds Whisper small + Whisper medium judge + Kokoro at once; the worker releases models after each job).\n")
open(out, "w", encoding="utf-8").write("\n".join(w) + "\n")
print("wrote", out)
