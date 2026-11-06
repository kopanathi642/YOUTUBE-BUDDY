"""AI engines that run on the cloud worker. Free/open-source by default, OpenAI used instead when a key is set.

- Voice (TTS): Piper (open source, runs on CPU). Binary + voices download from GitHub/Hugging Face on first use.
- Speech-to-text: OpenAI Whisper API if OPENAI_API_KEY, else faster-whisper (open model, downloads on first use).
- Translation: OpenAI if OPENAI_API_KEY, else Argos models run with CTranslate2 + SentencePiece (no PyTorch).

Every failure raises EngineError with a message the user can act on. Nothing is faked.
"""
import json
import os
import shutil
import subprocess
import tarfile
import threading
import zipfile

import httpx

CACHE = os.environ.get("MODEL_CACHE", "/tmp/creator-models")
_lock = threading.Lock()


class EngineError(Exception):
    pass


def _download(url: str, dest: str, timeout: float = 600) -> str:
    if os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    try:
        with httpx.stream("GET", url, follow_redirects=True, timeout=timeout) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in r.iter_bytes(1 << 20):
                    f.write(chunk)
    except Exception as e:
        raise EngineError(f"Could not download model from {url.split('/')[2]} ({type(e).__name__})") from e
    os.replace(tmp, dest)
    return dest


# ------------------------------------------------------------------ Piper TTS

PIPER_URL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
GH = "https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-{}.tar.gz"
HF = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/{}"
VOICES = [  # id, label, language, style, source
    ("en-female", "Amy (English, female)", "en", "Female", ("gh", "en-us-amy-low")),
    ("en-male", "Ryan (English, male)", "en", "Male", ("gh", "en-us-ryan-low")),
    ("en-narrator", "Lessac (English, narrator)", "en", "Narrator", ("gh", "en-us-lessac-low")),
    ("en-young", "Kathleen (English, young)", "en", "Young", ("gh", "en-us-kathleen-low")),
    ("en-studio", "Southern English (studio)", "en", "Studio", ("gh", "en-gb-southern_english_female-low")),
    ("hi-male", "Pratham (Hindi, male)", "hi", "Male", ("hf", "hi/hi_IN/pratham/medium/hi_IN-pratham-medium")),
    ("hi-female", "Priyamvada (Hindi, female)", "hi", "Female", ("hf", "hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium")),
    ("es-male", "Carlfm (Spanish)", "es", "Male", ("gh", "es-carlfm-x-low")),
    ("fr-female", "Siwis (French)", "fr", "Female", ("gh", "fr-siwis-low")),
    ("de-male", "Thorsten (German)", "de", "Male", ("gh", "de-thorsten-low")),
    ("it-male", "Riccardo (Italian)", "it", "Male", ("gh", "it-riccardo_fasol-x-low")),
    ("pt-male", "Edresson (Portuguese)", "pt", "Male", ("gh", "pt-br-edresson-low")),
    ("nl-male", "RDH (Dutch)", "nl", "Male", ("gh", "nl-rdh-x-low")),
    ("ru-female", "Irina (Russian)", "ru", "Female", ("gh", "ru-irinia-medium")),
    ("uk-female", "Lada (Ukrainian)", "uk", "Female", ("gh", "uk-lada-x-low")),
    ("ne-female", "Google (Nepali)", "ne", "Female", ("gh", "ne-google-x-low")),
    ("zh-female", "Huayan (Chinese)", "zh", "Female", ("gh", "zh-cn-huayan-x-low")),
    ("vi-female", "25hours (Vietnamese)", "vi", "Female", ("gh", "vi-25hours-single-low")),
]
VOICE_BY_ID = {v[0]: v for v in VOICES}


def voices_public() -> list[dict]:
    return [{"id": v[0], "label": v[1], "language": v[2], "style": v[3],
             "first_use_download": "huggingface.co" if v[4][0] == "hf" else "github.com"} for v in VOICES]


def default_voice(lang: str, style: str | None = None) -> str | None:
    cands = [v for v in VOICES if v[2] == lang]
    for v in cands:
        if style and v[3] == style:
            return v[0]
    return cands[0][0] if cands else None


def _piper_bin() -> str:
    exe = os.environ.get("PIPER_BIN") or os.path.join(CACHE, "piper", "piper")
    if os.path.exists(exe):
        return exe
    with _lock:
        if not os.path.exists(exe):
            tgz = _download(PIPER_URL, os.path.join(CACHE, "piper.tgz"))
            with tarfile.open(tgz) as t:
                t.extractall(CACHE, filter="data")
    if not os.path.exists(exe):
        raise EngineError("Voice engine (Piper) is not installed")
    return exe


def _voice_files(voice_id: str) -> str:
    v = VOICE_BY_ID.get(voice_id)
    if not v:
        raise EngineError(f"Unknown voice {voice_id}")
    kind, name = v[4]
    d = os.path.join(CACHE, "voices", voice_id)
    onnx = os.path.join(d, "model.onnx")
    if os.path.exists(onnx) and os.path.exists(onnx + ".json"):
        return onnx
    with _lock:
        os.makedirs(d, exist_ok=True)
        if kind == "gh":
            tgz = _download(GH.format(name), os.path.join(d, "voice.tgz"))
            with tarfile.open(tgz) as t:
                t.extractall(d, filter="data")
            src = next(f for f in os.listdir(d) if f.endswith(".onnx"))
            os.replace(os.path.join(d, src), onnx)
            os.replace(os.path.join(d, src + ".json"), onnx + ".json")
        else:
            _download(HF.format(name + ".onnx"), onnx)
            _download(HF.format(name + ".onnx.json"), onnx + ".json")
    return onnx


def tts(text: str, voice_id: str, out_wav: str, length_scale: float = 1.0) -> float:
    """Synthesize speech to a WAV file. Returns duration in seconds."""
    text = " ".join(text.split())
    if not text:
        raise EngineError("Nothing to say")
    model = _voice_files(voice_id)
    r = subprocess.run([_piper_bin(), "--model", model, "--output_file", out_wav, "--length_scale", f"{length_scale:.3f}",
                        "--sentence_silence", "0.15"], input=text, capture_output=True, text=True, timeout=600)
    if r.returncode != 0 or not os.path.exists(out_wav):
        raise EngineError("Voice generation failed: " + r.stderr[-200:])
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out_wav], capture_output=True, text=True)
    return float(p.stdout.strip() or 0)


# ------------------------------------------------------------------ Speech to text

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")


def transcribe(wav16k: str, language: str | None = None) -> dict:
    """Returns {"language": "hi", "engine": "...", "segments": [{"start", "end", "text"}]}"""
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        try:
            with open(wav16k, "rb") as f:
                r = httpx.post("https://api.openai.com/v1/audio/transcriptions", headers={"Authorization": f"Bearer {key}"},
                               data={"model": "whisper-1", "response_format": "verbose_json", **({"language": language} if language else {})},
                               files={"file": ("audio.wav", f, "audio/wav")}, timeout=600)
            r.raise_for_status()
            d = r.json()
        except Exception as e:
            raise EngineError(f"OpenAI transcription failed ({type(e).__name__})") from e
        segs = [{"start": round(s["start"], 3), "end": round(s["end"], 3), "text": s["text"].strip()} for s in d.get("segments", []) if s["text"].strip()]
        return {"language": d.get("language", language or ""), "engine": "openai-whisper-1", "segments": segs}
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise EngineError("Speech-to-text engine not installed") from e
    try:
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8", download_root=os.path.join(CACHE, "whisper"))
    except Exception as e:
        raise EngineError(f"Could not load the Whisper speech model (first use downloads it from huggingface.co): {type(e).__name__}") from e
    segments, info = model.transcribe(wav16k, language=language, vad_filter=True, beam_size=5)
    segs = [{"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()} for s in segments if s.text.strip()]
    return {"language": info.language, "engine": f"faster-whisper-{WHISPER_MODEL}", "segments": segs}


# ------------------------------------------------------------------ Translation

ARGOS_INDEX = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
LANG_NAMES = {"en": "English", "hi": "Hindi", "es": "Spanish", "fr": "French", "de": "German", "pt": "Portuguese", "ar": "Arabic",
              "ja": "Japanese", "ko": "Korean", "zh": "Chinese", "it": "Italian", "ru": "Russian", "bn": "Bengali", "ta": "Tamil",
              "te": "Telugu", "mr": "Marathi", "ur": "Urdu", "nl": "Dutch", "tr": "Turkish", "uk": "Ukrainian", "vi": "Vietnamese"}


def translate(texts: list[str], src: str, dst: str) -> tuple[list[str], str]:
    if src == dst:
        return list(texts), "none"
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        prompt = (f"Translate each item from {LANG_NAMES.get(src, src)} to {LANG_NAMES.get(dst, dst)} for video subtitles. "
                  "Keep meaning, names and tone; keep each item short. Reply with a JSON object {\"items\": [...]} with exactly the same number of items.")
        try:
            r = httpx.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, timeout=300,
                           json={"model": os.environ.get("OPENAI_TEXT_MODEL", "gpt-4o-mini"), "response_format": {"type": "json_object"},
                                 "messages": [{"role": "system", "content": prompt}, {"role": "user", "content": json.dumps({"items": texts}, ensure_ascii=False)}]})
            r.raise_for_status()
            items = json.loads(r.json()["choices"][0]["message"]["content"])["items"]
        except Exception as e:
            raise EngineError(f"OpenAI translation failed ({type(e).__name__})") from e
        if len(items) != len(texts):
            raise EngineError("Translation returned a different number of lines")
        return [str(x) for x in items], "openai"
    return _argos(texts, src, dst)


def _argos_pair_dir(src: str, dst: str) -> str:
    d = os.path.join(CACHE, "argos", f"{src}_{dst}")
    if os.path.exists(os.path.join(d, "ok")):
        return d
    with _lock:
        idx_path = _download(ARGOS_INDEX, os.path.join(CACHE, "argos", "index.json"))
        idx = json.load(open(idx_path))
        pkg = next((p for p in idx if p.get("from_code") == src and p.get("to_code") == dst), None)
        if not pkg:
            raise EngineError(f"No free translation model for {LANG_NAMES.get(src, src)} → {LANG_NAMES.get(dst, dst)}"
                              + (" (try via English, or add an OpenAI key)" if "en" not in (src, dst) else ""))
        z = _download(pkg["links"][0], os.path.join(d, "model.argosmodel"))
        with zipfile.ZipFile(z) as zf:
            zf.extractall(d)
        open(os.path.join(d, "ok"), "w").close()
    return d


def _argos(texts: list[str], src: str, dst: str) -> tuple[list[str], str]:
    if src != "en" and dst != "en":  # pivot through English, like Argos itself does
        mid, _ = _argos(texts, src, "en")
        out, _ = _argos(mid, "en", dst)
        return out, "argos (via English)"
    import ctranslate2
    import sentencepiece as spm
    d = _argos_pair_dir(src, dst)
    root = next((os.path.join(d, x) for x in os.listdir(d) if os.path.isdir(os.path.join(d, x, "model"))), d)
    tr = ctranslate2.Translator(os.path.join(root, "model"), device="cpu", compute_type="int8")
    sp = spm.SentencePieceProcessor(model_file=os.path.join(root, "sentencepiece.model"))
    toks = [sp.encode(t, out_type=str) for t in texts]
    res = tr.translate_batch(toks, beam_size=4, max_decoding_length=256)
    return [sp.decode(r.hypotheses[0]).replace("▁", " ").strip() for r in res], "argos"


def cleanup_cache() -> None:
    shutil.rmtree(CACHE, ignore_errors=True)
