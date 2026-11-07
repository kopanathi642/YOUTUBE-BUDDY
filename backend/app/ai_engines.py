"""Compatibility layer: the editor's captions, translation, AI voice and dub tools call these functions.

Everything runs on the self-hosted speech stack in app/speech (pinned, licence-checked models, local files only):
- Speech-to-text: faster-whisper (MIT), per-segment language detection for mixed speech.
- Translation: Argos (CTranslate2), pivoting through English when needed.
- Voices: Kokoro-82M (Apache-2.0) and commercial-licence Piper voices.

Paid speech APIs are deliberately NOT used here: they would bypass the plan credits. Every failure raises EngineError with
a message the user can act on. Nothing is faked.
"""
from __future__ import annotations

import shutil

from .speech import assets, catalog

CACHE = assets.CACHE
LANG_NAMES = catalog.LANG_NAMES
VOICE_BY_ID = catalog.VOICE_BY_ID


class EngineError(Exception):
    pass


_STYLE = {"en-narrator": "Narrator", "en-young": "Soft", "en-studio": "Studio", "hi-female-2": "Warm", "hi-male-2": "Deep",
          "ru-male-2": "Deep", "tr-male-2": "Deep", "fa-male-2": "Deep"}


def _style(v: dict) -> str:
    return _STYLE.get(v["id"], v["gender"].title())


def voices_public() -> list[dict]:
    return [{"id": v["id"], "label": v["label"], "language": v["language"], "style": _style(v), "gender": v["gender"],
             "engine": v["engine"], "licence": v["licence"]} for v in catalog.VOICES]


def default_voice(lang: str, style: str | None = None) -> str | None:
    vs = catalog.voices_for(lang)
    for v in vs:
        if style and _style(v).lower() == style.lower():
            return v["id"]
    return vs[0]["id"] if vs else None


def _wrap(fn, *a, **k):
    from .speech import mt, tts
    try:
        return fn(*a, **k)
    except (assets.AssetError, tts.VoiceError, mt.NoPath) as e:
        raise EngineError(str(e)) from e


def tts(text: str, voice_id: str, out_wav: str, length_scale: float = 1.0) -> float:
    """Synthesize speech to a WAV file. `length_scale` > 1 is slower (kept for older callers). Returns seconds."""
    from .speech import tts as t
    return _wrap(t.speak, text, voice_id, out_wav, 1.0 / max(0.5, length_scale))


def transcribe(wav16k: str, language: str | None = None) -> dict:
    """{"language", "engine", "segments": [{start, end, text, lang}], "mixed", "languages"}"""
    from .speech import asr
    try:
        return _wrap(asr.transcribe, wav16k, language)
    except EngineError:
        raise
    except Exception as e:  # noqa: BLE001  (model load problems surface as one clear message)
        raise EngineError(f"Speech-to-text failed ({type(e).__name__})") from e


def translate(texts: list[str], src: str, dst: str) -> tuple[list[str], str]:
    from .speech import mt
    return _wrap(mt.translate, texts, src, dst)


_argos = translate   # older name used by the translation pipeline tool


def cleanup_cache() -> None:
    shutil.rmtree(CACHE, ignore_errors=True)
