"""Speech-to-text with faster-whisper (MIT), from the pinned local model folder — never downloads at run time.

Language handling:
- The whole file's language is detected automatically, unless the user gives one.
- Mixed-language speech (Hinglish, English phrases inside Spanish, ...) is handled explicitly: every segment of
  at least MIN_DETECT_S gets its own language check; a confident disagreement re-transcribes that segment in its own
  language and marks it, so translation later treats each segment by its real language.
"""
from __future__ import annotations

import os
import threading

from . import assets, catalog

_model = None
_mlock = threading.Lock()
MIN_DETECT_S = 1.2
SWITCH_PROB = 0.70     # a segment switches language only when Whisper is at least this sure
# Spoken Hindi and Urdu are nearly identical and Whisper often says "ur" for Hindi speech (it would then write Urdu
# script). For an Indian audience prefer Hindi whenever Whisper gives it a real chance. "ur:hi:0.10" = if Whisper picks
# ur but hi has >= 10 % probability, use hi. ASR_PREFER="" turns it off; users can always set the language by hand.
PREFER = os.environ.get("ASR_PREFER", "ur:hi:0.10")


def _merged(probs: list[tuple[str, float]]) -> dict[str, float]:
    """Whisper's language probabilities with confusable pairs merged (ur folded into hi when hi has a real chance):
    Hindi speech typically scores e.g. hi 0.45 / ur 0.40, so neither alone looks confident."""
    p = dict(probs or [])
    for rule in [x for x in PREFER.split(",") if x.strip()]:
        a, b, thr = rule.split(":")
        if p.get(b, 0.0) >= float(thr) and a in p:
            p[b] = p.get(b, 0.0) + p.pop(a)
    return p


def _prefer(lang: str, probs: list[tuple[str, float]]) -> str:
    p = _merged(probs)
    return max(p, key=p.get) if p else lang


def _detect(m, audio) -> tuple[str, float, dict[str, float]]:
    """Language of a whole file: up to 6 windows of 15 s spread over the speech, probabilities merged and weighted by length."""
    sr, win = 16000, 15 * 16000
    n = len(audio)
    starts = [0] if n <= win else [int(k * (n - win) / 5) for k in range(6)]
    acc: dict[str, float] = {}
    total = 0.0
    for a in dict.fromkeys(starts):
        chunk = audio[a:a + win]
        if len(chunk) < sr:
            continue
        _, _, probs = m.detect_language(audio=chunk)
        w = len(chunk) / sr
        for k, v in _merged(probs).items():
            acc[k] = acc.get(k, 0.0) + v * w
        total += w
    if not acc:
        lang, prob, probs = m.detect_language(audio=audio)
        acc, total = _merged(probs), 1.0
    best = max(acc, key=acc.get)
    return best, acc[best] / total, {k: round(v / total, 3) for k, v in sorted(acc.items(), key=lambda x: -x[1])[:5]}


def model():
    global _model
    with _mlock:
        if _model is None:
            wm = assets.whisper_model()
            for a in assets.manifest():
                if a.id.startswith(f"whisper-{wm}/"):
                    assets.ensure(a)
            from faster_whisper import WhisperModel
            threads = int(os.environ.get("WHISPER_THREADS", "0")) or min(4, os.cpu_count() or 1)
            _model = WhisperModel(os.path.join(assets.CACHE, "whisper", wm), device="cpu", compute_type="int8", cpu_threads=threads)
    return _model


def unload() -> None:
    """Free the Whisper model (~0.5 GB for small) between jobs on a small worker."""
    global _model
    with _mlock:
        _model = None


def _app(code: str) -> str:
    return catalog.WHISPER_TO_APP.get(code, code)


def _whisper(code: str | None) -> str | None:
    return catalog.WHISPER_CODE.get(code, code) if code else None


def transcribe(wav16k: str, language: str | None = None, per_segment_language: bool = True) -> dict:
    """{"language", "language_prob", "engine", "mixed", "languages": {code: seconds}, "segments": [{start, end, text, lang, lang_prob}]}"""
    from faster_whisper import decode_audio
    m = model()
    audio = decode_audio(wav16k, sampling_rate=16000)
    chosen, chosen_prob = _whisper(language), 1.0
    candidates: dict = {}
    if not language:   # detect across the whole file, not just the first 30 s
        chosen, chosen_prob, candidates = _detect(m, audio)
    segs, info = m.transcribe(audio, language=chosen, vad_filter=True, beam_size=5, condition_on_previous_text=False)
    main = _app(chosen)
    out = [{"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(), "lang": main,
            "lang_prob": round(chosen_prob, 3)} for s in segs if s.text.strip()]
    if per_segment_language:
        for s in out:
            if s["end"] - s["start"] < MIN_DETECT_S:
                continue
            chunk = audio[int(s["start"] * 16000):int(s["end"] * 16000)]
            _, _, probs = m.detect_language(audio=chunk)
            mp = _merged(probs)
            lang = _app(max(mp, key=mp.get))
            prob = mp[max(mp, key=mp.get)]
            if lang != main and prob >= SWITCH_PROB:
                re, _ = m.transcribe(chunk, language=_whisper(lang), beam_size=5, condition_on_previous_text=False)
                text = " ".join(x.text.strip() for x in re).strip()
                if text:
                    s.update(text=text, lang=lang, lang_prob=round(float(prob), 3))
    langs: dict[str, float] = {}
    for s in out:
        langs[s["lang"]] = round(langs.get(s["lang"], 0) + s["end"] - s["start"], 2)
    return {"language": main, "language_prob": round(chosen_prob, 3), "candidates": candidates, "engine": f"faster-whisper-{assets.whisper_model()}",
            "mixed": len(langs) > 1, "languages": langs, "segments": out, "duration": round(float(info.duration), 2)}
