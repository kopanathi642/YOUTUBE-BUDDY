"""Dub rendering: voice every translated line at its original time, mix over the ducked original, write subtitles.

Timing alignment: each line starts where the original line started. If the voiced line is longer than the gap before the
next original line, it is re-voiced faster (up to tts.MAX_SPEED). If it still doesn't fit, later lines are pushed back
just enough to avoid overlap and catch up at the next pause. Every line's shift, speed and overrun is reported.

Background audio: the original track is kept (music, effects, ambience) and lowered to `duck` during original speech
with 120 ms ramps. Without a source-separation model the original voice stays faintly audible under the dub at the
default duck level; duck=0 mutes the original during speech.
"""
from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass

import numpy as np

from . import tts

SR = 48000
GAP = 0.06          # minimum silence between two dubbed lines
RAMP = 0.12


@dataclass
class Line:
    i: int
    start: float      # original speech start
    end: float        # original speech end
    text: str
    voice: str


def _ffmpeg(args: list[str], **kw) -> subprocess.CompletedProcess:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, timeout=3600, **kw)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg: " + r.stderr.decode(errors="replace")[-300:])
    return r


def _read_mono(path: str) -> np.ndarray:
    r = _ffmpeg(["-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(r.stdout, dtype="<i2").astype(np.float32) / 32768.0


def voice_lines(lines: list[Line], total: float, tmp: str, progress=lambda f, m: None) -> tuple[np.ndarray, list[dict]]:
    """Voice all lines and place them on one mono track. Returns (track float32 @48k, timings)."""
    track = np.zeros(int((total + 30) * SR), dtype=np.float32)
    lines = sorted(lines, key=lambda x: x.start)
    timings, cursor = [], 0.0
    for k, ln in enumerate(lines):
        progress(k / max(1, len(lines)), f"voicing line {k + 1}/{len(lines)}")
        nxt = lines[k + 1].start if k + 1 < len(lines) else total
        avail = max(0.3, nxt - ln.start - GAP)
        wav = os.path.join(tmp, f"l{ln.i}.wav")
        d = tts.speak(ln.text, ln.voice, wav, 1.0)
        speed = 1.0
        if d > avail:
            speed = min(tts.MAX_SPEED, d / avail * 1.03)
            d = tts.speak(ln.text, ln.voice, wav, speed)
        y = _read_mono(wav)
        t = max(ln.start, cursor)
        a = int(t * SR)
        if a + len(y) > len(track):
            track = np.concatenate([track, np.zeros(a + len(y) - len(track) + SR, dtype=np.float32)])
        track[a:a + len(y)] += y
        cursor = t + d + GAP
        timings.append({"i": ln.i, "orig_start": ln.start, "orig_end": ln.end, "start": round(t, 3), "end": round(t + d, 3),
                        "shift": round(t - ln.start, 3), "speed": round(speed, 3), "overrun": round(max(0.0, t + d - nxt), 3),
                        "text": ln.text, "voice": ln.voice})
    end = max([total] + [x["end"] for x in timings])
    return track[:int((end + 0.25) * SR)], timings


def mix(original_media: str | None, voice: np.ndarray, speech: list[tuple[float, float]], out_wav: str, duck: float = 0.15) -> float:
    """Original audio (if any), lowered to `duck` during original speech, plus the voice track. Writes stereo 48 kHz WAV."""
    n = len(voice)
    if original_media:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", original_media, "-vn", "-f", "s16le", "-ac", "2",
                            "-ar", str(SR), "-"], capture_output=True, timeout=3600)
        orig = np.frombuffer(r.stdout, dtype="<i2").reshape(-1, 2).astype(np.float32) / 32768.0 if r.returncode == 0 else np.zeros((0, 2), np.float32)
    else:
        orig = np.zeros((0, 2), np.float32)
    n = max(n, len(orig))
    env = np.ones(n, dtype=np.float32)
    ramp = int(RAMP * SR)
    for a, b in speech:
        ia, ib = max(0, int((a - 0.05) * SR)), min(n, int((b + 0.05) * SR))
        env[ia:ib] = np.minimum(env[ia:ib], duck)
        if ia > 0:
            r0 = max(0, ia - ramp)
            env[r0:ia] = np.minimum(env[r0:ia], np.linspace(1, duck, ia - r0, dtype=np.float32))
        r1 = min(n, ib + ramp)
        env[ib:r1] = np.minimum(env[ib:r1], np.linspace(duck, 1, r1 - ib, dtype=np.float32))
    out = np.zeros((n, 2), dtype=np.float32)
    if len(orig):
        out[:len(orig)] = orig * env[:len(orig), None]
    out[:len(voice)] += voice[:, None]
    peak = float(np.max(np.abs(out))) if n else 0.0
    if peak > 0.98:          # simple limiter: scale down instead of clipping
        out *= 0.98 / peak
    import wave
    w = wave.open(out_wav, "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
    w.close()
    return n / SR


def _ts(t: float, sep: str) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def subtitles(timings: list[dict], fmt: str) -> str:
    rows = sorted(timings, key=lambda x: x["start"])
    if fmt == "srt":
        return "".join(f"{k}\n{_ts(r['start'], ',')} --> {_ts(r['end'], ',')}\n{r['text']}\n\n" for k, r in enumerate(rows, 1))
    return "WEBVTT\n\n" + "".join(f"{_ts(r['start'], '.')} --> {_ts(r['end'], '.')}\n{r['text']}\n\n" for r in rows)


def export_mp4(video: str, audio_wav: str, out_mp4: str) -> None:
    _ffmpeg(["-i", video, "-i", audio_wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
             "-shortest", "-movflags", "+faststart", out_mp4])


def export_audio(audio_wav: str, out_m4a: str) -> None:
    _ffmpeg(["-i", audio_wav, "-c:a", "aac", "-b:a", "192k", out_m4a])
