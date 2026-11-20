"""Fairlight-style audio effects: FFmpeg accepts them, and the filters match the RBJ-cookbook maths that Web Audio's
BiquadFilterNode uses in the editor preview (measured with sine tones through real FFmpeg)."""
import cmath
import math
import subprocess

import numpy as np
import pytest
from pydantic import ValidationError

from app.effects import AudioFx, audio_filters, reverb_gains, REVERB_TAPS_MS

SR = 48000


def run(af: str, freq: float, amp: float = 0.25, secs: float = 1.0) -> np.ndarray:
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"sine=f={freq}:r={SR}:d={secs},volume={amp / 0.125},aformat=channel_layouts=stereo",
                        "-af", af, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2)


def gain_db(af: str, f: float) -> float:
    ref, out = run("anull", f), run(af, f)
    n = len(ref) // 2   # skip the filter's start-up
    return 20 * math.log10(np.sqrt(np.mean(out[n:, 0] ** 2)) / np.sqrt(np.mean(ref[n:, 0] ** 2)))


def rbj(kind: str, f0: float, f: float, gain_db_: float = 0, q: float = 0.7071, s: float = 1) -> float:
    """|H(f)| in dB for the RBJ cookbook biquads (what Web Audio implements)."""
    A, w0 = 10 ** (gain_db_ / 40), 2 * math.pi * f0 / SR
    cw, sw = math.cos(w0), math.sin(w0)
    if kind in ("lowshelf", "highshelf"):
        alpha = sw / 2 * math.sqrt((A + 1 / A) * (1 / s - 1) + 2)
        k = 2 * math.sqrt(A) * alpha
        if kind == "lowshelf":
            b = [A * ((A + 1) - (A - 1) * cw + k), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - k)]
            a = [(A + 1) + (A - 1) * cw + k, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - k]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + k), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - k)]
            a = [(A + 1) - (A - 1) * cw + k, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - k]
    else:
        alpha = sw / (2 * q)
        if kind == "peaking":
            b, a = [1 + alpha * A, -2 * cw, 1 - alpha * A], [1 + alpha / A, -2 * cw, 1 - alpha / A]
        elif kind == "highpass":
            b, a = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2], [1 + alpha, -2 * cw, 1 - alpha]
        elif kind == "lowpass":
            b, a = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2], [1 + alpha, -2 * cw, 1 - alpha]
        else:  # notch
            b, a = [1, -2 * cw, 1], [1 + alpha, -2 * cw, 1 - alpha]
    z = cmath.exp(-1j * 2 * math.pi * f / SR)
    h = (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return 20 * math.log10(abs(h))


@pytest.mark.parametrize("fx, f, expect", [
    (("eqlow", 6), 60, lambda f: rbj("lowshelf", 100, f, 6)),
    (("eqmid", -6), 1000, lambda f: rbj("peaking", 1000, f, -6, q=1)),
    (("eqmid", 6), 2500, lambda f: rbj("peaking", 1000, f, 6, q=1)),
    (("eqhigh", 6), 12000, lambda f: rbj("highshelf", 8000, f, 6)),
    (("highpass", 200), 100, lambda f: rbj("highpass", 200, f)),
    (("lowpass", 2000), 4000, lambda f: rbj("lowpass", 2000, f)),
])
def test_biquads_match_web_audio_maths(fx, f, expect):
    got = gain_db(",".join(audio_filters([AudioFx(type=fx[0], amount=fx[1])])), f)
    assert abs(got - expect(f)) < 0.6, (fx, f, got, expect(f))


def test_dehum_kills_50hz_but_keeps_voice():
    af = ",".join(audio_filters([AudioFx(type="dehum", amount=1)]))
    assert gain_db(af, 50) < -20 and abs(gain_db(af, 1000)) < 0.5


def test_echo_and_reverb_are_the_same_taps_as_the_preview():
    ref = run("anull", 1000, secs=0.02)   # a 20 ms burst … then silence
    click = np.zeros((SR // 2, 2), np.float32); click[0] = 0.5
    import tempfile, os, wave
    d = tempfile.mkdtemp(); p = os.path.join(d, "click.wav")
    with wave.open(p, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((click * 32767).astype("<i2").tobytes())
    af = ",".join(audio_filters([AudioFx(type="echo", amount=250)]))
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-af", af, "-f", "f32le", "-"], capture_output=True, check=True)
    out = np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2)[:, 0]
    i = int(0.25 * SR)
    assert abs(out[0] - 0.5) < 0.01 and abs(out[i] - 0.2) < 0.01        # dry click, then one echo at 250 ms × 0.4
    assert len(reverb_gains(0.5)) == len(REVERB_TAPS_MS) and all(0 < g < 1 for g in reverb_gains(1))


def test_width_and_distortion_maths():
    out = run(",".join(audio_filters([AudioFx(type="width", amount=0)])), 440)
    assert np.allclose(out[:, 0], out[:, 1], atol=1e-4)                  # width 0 = mono
    peak = run("anull", 440, amp=0.5).max()
    out = run(",".join(audio_filters([AudioFx(type="distortion", amount=4)])), 440, amp=0.5)
    assert abs(out.max() - math.tanh(4 * peak) / math.tanh(4)) < 0.005   # tanh(drive·x)/tanh(drive), same curve as the preview


def test_every_audio_effect_runs_and_validates():
    fx = [AudioFx(type=t, amount=a) for t, a in [("eqlow", 3), ("eqmid", -3), ("eqhigh", 3), ("highpass", 80), ("lowpass", 12000), ("dehum", 1),
          ("echo", 200), ("reverb", 0.4), ("compressor", 0.5), ("limiter", -1), ("distortion", 2), ("tremolo", 5), ("width", 1.4),
          ("deesser", 0.5), ("pitch", 3), ("leveler", 1)]]
    out = run(",".join(audio_filters(fx)), 440, secs=1.5)
    assert np.isfinite(out).all() and np.abs(out).max() <= 1.0
    with pytest.raises(ValidationError):
        AudioFx(type="pitch", amount=30)
