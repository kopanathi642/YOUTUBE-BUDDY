"""Voices: Kokoro-82M (Apache-2.0, ONNX) and Piper (commercial-licence voices only). CPU, local files only."""
from __future__ import annotations

import os
import subprocess
import threading
import wave

from . import assets, catalog

_kokoro = None
_klock = threading.Lock()
MIN_SPEED, MAX_SPEED = 0.8, 1.45


class VoiceError(Exception):
    pass


def _kokoro_engine():
    global _kokoro
    with _klock:
        if _kokoro is None:
            from kokoro_onnx import Kokoro
            _kokoro = Kokoro(assets.asset_path("kokoro/kokoro-v1.0.onnx"), assets.asset_path("kokoro/voices-v1.0.bin"))
    return _kokoro


def unload() -> None:
    """Free the Kokoro model (~1 GB in RAM) between jobs on a small worker."""
    global _kokoro
    with _klock:
        _kokoro = None


def _write_wav(path: str, samples, sr: int) -> None:
    import numpy as np
    w = wave.open(path, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
    w.close()


def duration(path: str) -> float:
    with wave.open(path) as w:
        return w.getnframes() / float(w.getframerate())


def _piper_bin() -> str:
    exe = os.environ.get("PIPER_BIN")
    if exe and os.path.exists(exe):
        return exe
    d = assets.unpack("piper-bin", "tar")
    exe = os.path.join(d, "piper", "piper")
    if not os.path.exists(exe):
        raise VoiceError("Piper engine missing from its pinned archive")
    return exe


def speak(text: str, voice_id: str, out_wav: str, speed: float = 1.0) -> float:
    """Synthesize `text` into a mono WAV. `speed` > 1 talks faster. Returns seconds of audio."""
    text = " ".join((text or "").split())
    if not text:
        raise VoiceError("Nothing to say")
    v = catalog.VOICE_BY_ID.get(voice_id)
    if not v:
        raise VoiceError(f"Unknown voice {voice_id}")
    speed = max(MIN_SPEED, min(MAX_SPEED, speed))
    if v["engine"] == catalog.KOKORO:
        lang = catalog.KOKORO_LANG[v["language"]]
        if v["language"] == "en" and v["model"] in catalog.BRITISH:
            lang = "en-gb"
        samples, sr = _kokoro_engine().create(text, voice=v["model"], speed=speed, lang=lang)
        _write_wav(out_wav, samples, sr)
    else:
        model = assets.asset_path(f"piper/{v['model']}.onnx")
        assets.asset_path(f"piper/{v['model']}.onnx.json")
        cmd = [_piper_bin(), "--model", model, "--output_file", out_wav, "--length_scale", f"{1 / speed:.3f}", "--sentence_silence", "0.12"]
        if v["speaker"] is not None:
            cmd += ["--speaker", str(v["speaker"])]
        r = subprocess.run(cmd, input=text, capture_output=True, text=True, timeout=600)
        if r.returncode != 0 or not os.path.exists(out_wav):
            raise VoiceError("Voice generation failed: " + r.stderr[-200:])
    d = duration(out_wav)
    if d <= 0:
        raise VoiceError("Voice produced no audio")
    return d
