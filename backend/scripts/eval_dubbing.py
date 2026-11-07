"""Evaluate captions and dubbing on REAL speech, fully offline.

    MODELS_OFFLINE=1 MODEL_CACHE=... python scripts/eval_dubbing.py FLEURS_DIR OUT_DIR [--targets all|hi,es,...]

FLEURS_DIR holds google/fleurs dev splits (CC-BY-4.0): <lang>/dev.tsv and <lang>/dev.tar.gz for hi_in, en_us, es_419.
Measures, per the founder's checklist:
  * caption accuracy: WER (en, es) / CER (hi) against the human transcripts, speed (real-time factor), peak memory
  * language detection: per-file and per-segment on a Hindi+English mixed clip
  * speaker labels: two real speakers alternating
  * every target language end to end: translation (back-translation chrF vs the English source), pronunciation
    (Whisper re-transcribes the dubbed voice; CER vs the text the voice was asked to say), timing (shifts, speed-ups,
    overruns), and the exported MP4/M4A/SRT/VTT are probed/parsed
Writes OUT_DIR/eval.json and OUT_DIR/DUBBING_EVAL.md, plus sample outputs.
"""
from __future__ import annotations

import csv
import json
import os
import re
import resource
import subprocess
import sys
import tarfile
import time
import unicodedata

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.speech import asr, assets, catalog, diarize, dub, mt, tts  # noqa: E402

N_ASR = {"en_us": 25, "es_419": 15, "hi_in": 25}
APP = {"en_us": "en", "es_419": "es", "hi_in": "hi"}


_judge = None


def judge():
    """Whisper medium as an independent listener (the app itself transcribes with WHISPER_MODEL, normally small)."""
    global _judge
    if _judge is None:
        from faster_whisper import WhisperModel
        for a in assets.manifest(whisper="medium"):
            if a.id.startswith("whisper-medium/"):
                assets.ensure(a)
        _judge = WhisperModel(os.path.join(assets.CACHE, "whisper", "medium"), device="cpu", compute_type="int8", cpu_threads=4)
    return _judge


def peak_mb() -> int:
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)


def ff(*a: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *a], check=True)


def norm(t: str, lang: str) -> str:
    t = unicodedata.normalize("NFKC", t).lower()
    t = re.sub(r"[।॥.,!?;:\"“”'‘’()\[\]{}«»¿¡、。，！？：；…\-–—/]", " ", t)
    return " ".join(t.split())


def lev(a: list, b: list) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def wer(ref: str, hyp: str) -> tuple[int, int]:
    r = ref.split()
    return lev(r, hyp.split()), len(r)


def cer(ref: str, hyp: str) -> tuple[int, int]:
    r = list(ref.replace(" ", ""))
    return lev(r, list(hyp.replace(" ", ""))), len(r)


def chrf(ref: str, hyp: str, n: int = 6, beta: float = 2.0) -> float:
    ref, hyp = ref.replace(" ", ""), hyp.replace(" ", "")
    ps, rs = [], []
    for k in range(1, n + 1):
        rg = {}
        for i in range(len(ref) - k + 1):
            rg[ref[i:i + k]] = rg.get(ref[i:i + k], 0) + 1
        hg = {}
        for i in range(len(hyp) - k + 1):
            hg[hyp[i:i + k]] = hg.get(hyp[i:i + k], 0) + 1
        m = sum(min(c, rg.get(g, 0)) for g, c in hg.items())
        if hg:
            ps.append(m / sum(hg.values()))
        if rg:
            rs.append(m / sum(rg.values()))
    p, r = (sum(ps) / len(ps) if ps else 0), (sum(rs) / len(rs) if rs else 0)
    return round(100 * (1 + beta ** 2) * p * r / (beta ** 2 * p + r), 1) if p + r else 0.0


def load_fleurs(root: str, code: str, n: int, wav_dir: str) -> list[dict]:
    rows = list(csv.reader(open(os.path.join(root, code, "dev.tsv"), encoding="utf-8"), delimiter="\t"))
    picked, seen = [], set()
    for r in rows:
        if r[1] in seen:
            continue
        seen.add(r[1])
        picked.append({"file": r[1], "text": r[2], "gender": r[6] if len(r) > 6 else "", "id": r[0]})
        if len(picked) >= n:
            break
    want = {p["file"] for p in picked}
    os.makedirs(wav_dir, exist_ok=True)
    with tarfile.open(os.path.join(root, code, "dev.tar.gz")) as t:
        for m in t:
            b = os.path.basename(m.name)
            if b in want and not os.path.exists(os.path.join(wav_dir, b)):
                f = t.extractfile(m)
                open(os.path.join(wav_dir, b), "wb").write(f.read())
    for p in picked:
        p["path"] = os.path.join(wav_dir, p["file"])
    return [p for p in picked if os.path.exists(p["path"])]


def wav_dur(p: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def concat(paths: list[str], out: str, gap: float = 0.8) -> list[tuple[float, float]]:
    """Join utterances with silence between them; returns (start, end) of each in the result (16 kHz mono WAV)."""
    spans, t, inputs, filt = [], 0.0, [], []
    for k, p in enumerate(paths):
        d = wav_dur(p)
        spans.append((t, t + d))
        t += d + gap
        inputs += ["-i", p]
        filt.append(f"[{k}:a]aresample=16000,aformat=channel_layouts=mono,apad=pad_dur={gap}[a{k}]")
    filt.append("".join(f"[a{k}]" for k in range(len(paths))) + f"concat=n={len(paths)}:v=0:a=1[o]")
    ff(*inputs, "-filter_complex", ";".join(filt), "-map", "[o]", "-ac", "1", "-ar", "16000", out)
    return spans


def eval_asr(fleurs: str, work: str) -> dict:
    out = {}
    for code, n in N_ASR.items():
        items = load_fleurs(fleurs, code, n, os.path.join(work, "wav", code))
        lang = APP[code]
        errs = tot = 0
        audio_s = proc_s = 0.0
        detected = {}
        examples = []
        for it in items:
            t0 = time.time()
            r = asr.transcribe(it["path"], None, per_segment_language=False)
            proc_s += time.time() - t0
            audio_s += wav_dur(it["path"])
            detected[r["language"]] = detected.get(r["language"], 0) + 1
            hyp = " ".join(s["text"] for s in r["segments"])
            ref_n, hyp_n = norm(it["text"], lang), norm(hyp, lang)
            e, n_ = (cer if lang == "hi" else wer)(ref_n, hyp_n)
            errs += e
            tot += n_
            if len(examples) < 3:
                examples.append({"ref": it["text"], "hyp": hyp})
        out[lang] = {"utterances": len(items), "metric": "CER" if lang == "hi" else "WER", "error_rate": round(100 * errs / max(1, tot), 1),
                     "audio_s": round(audio_s, 1), "realtime_factor": round(proc_s / max(1, audio_s), 2),
                     "language_detected": detected, "examples": examples}
        print(f"ASR {lang}: {out[lang]['metric']} {out[lang]['error_rate']}%  rtf {out[lang]['realtime_factor']}  detected {detected}", flush=True)
    return out


def eval_mixed(fleurs: str, work: str) -> dict:
    hi = load_fleurs(fleurs, "hi_in", 3, os.path.join(work, "wav", "hi_in"))
    en = load_fleurs(fleurs, "en_us", 3, os.path.join(work, "wav", "en_us"))
    order = [hi[0], en[0], hi[1], en[1], hi[2]]
    clip = os.path.join(work, "mixed_hi_en.wav")
    spans = concat([x["path"] for x in order], clip)
    r = asr.transcribe(clip)
    truth = ["hi", "en", "hi", "en", "hi"]
    got = []
    for (a, b), want in zip(spans, truth):
        segs = [s for s in r["segments"] if s["start"] < b and s["end"] > a]
        langs = {s["lang"] for s in segs}
        got.append({"truth": want, "detected": sorted(langs), "ok": langs == {want}})
    res = {"file_language": r["language"], "mixed_flag": r["mixed"], "languages": r["languages"], "spans": got,
           "correct_spans": sum(g["ok"] for g in got), "total_spans": len(got)}
    print(f"MIXED: file={r['language']} mixed={r['mixed']} spans ok {res['correct_spans']}/{len(got)} {got}", flush=True)
    return res


def eval_speakers(fleurs: str, work: str) -> dict:
    en = load_fleurs(fleurs, "en_us", 40, os.path.join(work, "wav", "en_us"))
    m = [x for x in en if x["gender"].upper().startswith("M")][:3]
    f = [x for x in en if x["gender"].upper().startswith("F")][:3]
    if len(m) < 3 or len(f) < 3:
        return {"skipped": "not enough labelled speakers"}
    order = [m[0], f[0], m[1], f[1], m[2], f[2]]
    clip = os.path.join(work, "two_speakers.wav")
    spans = concat([x["path"] for x in order], clip)
    from faster_whisper import decode_audio
    segs = [{"start": a, "end": b} for a, b in spans]
    labels = diarize.label(decode_audio(clip, sampling_rate=16000), segs)
    truth = ["A", "B", "A", "B", "A", "B"]
    mapping = {}
    for l, t in zip(labels, truth):
        mapping.setdefault(l, {}).setdefault(t, 0)
        mapping[l][t] += 1
    purity = sum(max(v.values()) for v in mapping.values()) / len(truth)
    res = {"labels": labels, "truth_gender": [x["gender"] for x in order], "speakers_found": len(set(labels)), "purity": round(purity, 2),
           "note": "FLEURS gives gender but not speaker ids; utterances of the same gender may be different people"}
    print(f"SPEAKERS: {labels} purity {res['purity']}", flush=True)
    return res


def eval_targets(fleurs: str, work: str, targets: list[str]) -> dict:
    en = load_fleurs(fleurs, "en_us", 4, os.path.join(work, "wav", "en_us"))
    speech = os.path.join(work, "en_source.wav")
    spans = concat([x["path"] for x in en], speech, gap=1.0)
    total = spans[-1][1] + 1.0
    # a "video": colour bars + the speech over a quiet music bed (to check background mixing)
    video = os.path.join(work, "en_source.mp4")
    ff("-f", "lavfi", "-i", f"testsrc2=s=640x360:r=25:d={total:.2f}", "-i", speech, "-f", "lavfi", "-i", f"sine=f=220:d={total:.2f}",
       "-filter_complex", "[2:a]volume=0.08[m];[1:a][m]amix=inputs=2:duration=longest:normalize=0[a]", "-map", "0:v", "-map", "[a]",
       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video)
    t0 = time.time()
    src = asr.transcribe(speech)
    asr_s = time.time() - t0
    segs = src["segments"]
    src_text = " ".join(s["text"] for s in segs)
    results = {"source": {"language": src["language"], "segments": len(segs), "audio_s": round(total, 1), "asr_s": round(asr_s, 1),
                          "wer_vs_human": round(100 * wer(norm(" ".join(x["text"] for x in en), "en"), norm(src_text, "en"))[0] /
                                                max(1, len(norm(" ".join(x["text"] for x in en), "en").split())), 1)}}
    for lang in targets:
        d = os.path.join(work, "dub", lang)
        os.makedirs(d, exist_ok=True)
        t0 = time.time()
        texts, eng = mt.translate([s["text"] for s in segs], "en", lang) if lang != "en" else ([s["text"] for s in segs], "none")
        mt_s = time.time() - t0
        voice = catalog.default_voice(lang)
        lines = [dub.Line(k, s["start"], s["end"], tx, voice) for k, (s, tx) in enumerate(zip(segs, texts))]
        t1 = time.time()
        track, timings = dub.voice_lines(lines, total, d)
        tts_s = time.time() - t1
        mix_wav = os.path.join(d, "mix.wav")
        dub.mix(video, track, [(s["start"], s["end"]) for s in segs], mix_wav)
        mp4, m4a = os.path.join(d, f"{lang}.mp4"), os.path.join(d, f"{lang}.m4a")
        dub.export_mp4(video, mix_wav, mp4)
        dub.export_audio(mix_wav, m4a)
        srt, vtt = dub.subtitles(timings, "srt"), dub.subtitles(timings, "vtt")
        open(os.path.join(d, f"{lang}.srt"), "w", encoding="utf-8").write(srt)
        open(os.path.join(d, f"{lang}.vtt"), "w", encoding="utf-8").write(vtt)
        render_s = time.time() - t0
        # files really playable?
        pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", mp4], capture_output=True, text=True).stdout)
        kinds = sorted(s["codec_type"] for s in pr.get("streams", []))
        files_ok = kinds == ["audio", "video"] and abs(float(pr["format"]["duration"]) - total) < 1.5 and srt.count("-->") == len(timings) \
            and vtt.startswith("WEBVTT") and wav_dur(m4a) > total - 1.5
        # pronunciation: an independent judge (Whisper medium) re-recognises every voiced line in the target language;
        # CER = how far what it heard is from the text the voice was asked to say (line by line: no silence to hallucinate in)
        e = n = 0
        heard_all, detected = [], {}
        for k, tx in enumerate(texts):
            lw = os.path.join(d, f"l{k}.wav")
            l16 = os.path.join(d, f"l{k}_16.wav")
            ff("-i", lw, "-ac", "1", "-ar", "16000", l16)
            segs_h, _ = judge().transcribe(l16, language=catalog.WHISPER_CODE.get(lang, lang), beam_size=5, condition_on_previous_text=False)
            h = " ".join(x.text.strip() for x in segs_h)
            heard_all.append(h)
            ei, ni = cer(norm(tx, lang), norm(h, lang))
            e, n = e + ei, n + ni
            dl, _, _ = judge().detect_language(audio=__import__("faster_whisper").decode_audio(l16, sampling_rate=16000))
            detected[dl] = detected.get(dl, 0) + 1
        heard = " | ".join(heard_all)
        # translation adequacy: translate back to English, chrF against the English source transcript
        bt = mt.translate(texts, lang, "en")[0] if lang != "en" else texts
        mt.unload()
        res = {"voice": voice, "engine": catalog.VOICE_BY_ID[voice]["engine"], "translation": eng, "mt_s": round(mt_s, 1), "tts_s": round(tts_s, 1),
               "render_s": round(render_s, 1), "realtime_factor": round(render_s / total, 2),
               "pronunciation_cer": round(100 * e / max(1, n), 1), "judge_heard_language": detected,
               "back_translation_chrf": chrf(norm(src_text, "en"), norm(" ".join(bt), "en")),
               "lines": len(timings), "sped_up": sum(1 for x in timings if x["speed"] > 1), "max_speed": max(x["speed"] for x in timings),
               "overruns": sum(1 for x in timings if x["overrun"] > 0), "max_shift_s": max(x["shift"] for x in timings),
               "files_ok": files_ok, "sample_line": texts[0][:120], "heard_back": heard[:120], "peak_mb": peak_mb()}
        results[lang] = res
        print(f"DUB {lang}: CER {res['pronunciation_cer']}% (judge heard {detected}) chrF {res['back_translation_chrf']} "
              f"render {res['render_s']}s rtf {res['realtime_factor']} sped {res['sped_up']} overruns {res['overruns']} files {files_ok}", flush=True)
    return results


def eval_sources(fleurs: str, work: str) -> dict:
    """Representative real-speech sources into other languages (incl. pivots through English)."""
    out = {}
    for code, targets in (("hi_in", ["en", "es", "de"]), ("es_419", ["hi", "en"])):
        items = load_fleurs(fleurs, code, 3, os.path.join(work, "wav", code))
        clip = os.path.join(work, f"{code}_src.wav")
        spans = concat([x["path"] for x in items], clip)
        r = asr.transcribe(clip)
        src_lang = APP[code]
        for t in targets:
            t0 = time.time()
            texts, eng = mt.translate([s["text"] for s in r["segments"]], r["language"], t)
            d = os.path.join(work, "src", f"{src_lang}_{t}")
            os.makedirs(d, exist_ok=True)
            v = catalog.default_voice(t)
            track, timings = dub.voice_lines([dub.Line(k, s["start"], s["end"], x, v) for k, (s, x) in enumerate(zip(r["segments"], texts))],
                                             spans[-1][1] + 1, d)
            open(os.path.join(d, f"{t}.srt"), "w", encoding="utf-8").write(dub.subtitles(timings, "srt"))
            mt.unload()
            out[f"{src_lang}>{t}"] = {"detected": r["language"], "route": eng, "seconds": round(time.time() - t0, 1),
                                      "source_line": r["segments"][0]["text"][:120], "translated_line": texts[0][:160],
                                      "overruns": sum(1 for x in timings if x["overrun"] > 0)}
            print(f"SRC {src_lang}>{t}: {out[f'{src_lang}>{t}']}", flush=True)
    return out


def main() -> None:
    fleurs, outdir = sys.argv[1], sys.argv[2]
    targets = catalog.TARGET_LANGS
    if "--targets" in sys.argv:
        v = sys.argv[sys.argv.index("--targets") + 1]
        targets = targets if v == "all" else v.split(",")
    work = os.path.join(outdir, "work")
    os.makedirs(work, exist_ok=True)
    parts = sys.argv[sys.argv.index("--parts") + 1].split(",") if "--parts" in sys.argv else ["asr", "mixed", "speakers", "targets", "sources"]
    t0 = time.time()
    path = os.path.join(outdir, "eval.json")
    rep = json.load(open(path)) if os.path.exists(path) and "--parts" in sys.argv else {}   # re-running some parts updates them in place
    rep.update({"whisper": assets.whisper_model(), "offline": assets.offline(), "cpu": os.cpu_count()})
    for name, fn in (("asr", lambda: eval_asr(fleurs, work)), ("mixed", lambda: eval_mixed(fleurs, work)),
                     ("speakers", lambda: eval_speakers(fleurs, work)), ("targets", lambda: eval_targets(fleurs, work, targets)),
                     ("sources", lambda: eval_sources(fleurs, work))):
        if name in parts:
            rep[name] = fn()
    rep["total_s"] = round(time.time() - t0, 1) if "--parts" not in sys.argv else rep.get("total_s")
    rep["peak_mb"] = max(peak_mb(), rep.get("peak_mb") or 0)
    json.dump(rep, open(path, "w"), ensure_ascii=False, indent=1)
    print("DONE", rep["total_s"], "s, peak", rep["peak_mb"], "MB")


if __name__ == "__main__":
    main()
