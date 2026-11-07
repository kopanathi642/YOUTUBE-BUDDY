"""Who speaks when, per transcript segment: WeSpeaker ResNet34 embeddings (CC-BY-4.0, ONNX) + agglomerative clustering.

Segment-level only (one speaker per Whisper segment; overlapping speech is not separated). Users can correct any label,
and voices are assigned per speaker so a person keeps the same dubbed voice for the whole video.
"""
from __future__ import annotations

import threading

import numpy as np

from . import assets

_sess = None
_lock = threading.Lock()
MIN_EMB_S = 0.8
SAME_SPEAKER = 0.45      # cosine similarity above which two clusters are merged
MAX_SPEAKERS = 6


def _session():
    global _sess
    with _lock:
        if _sess is None:
            import onnxruntime as ort
            o = ort.SessionOptions()
            o.intra_op_num_threads = 2
            _sess = ort.InferenceSession(assets.asset_path("wespeaker-resnet34"), o, providers=["CPUExecutionProvider"])
    return _sess


def _mel_bank(n_mels=80, n_fft=512, sr=16000, low=20.0, high=8000.0):
    mel = lambda f: 1127.0 * np.log(1 + f / 700.0)  # noqa: E731  (Kaldi mel scale)
    lo, hi = mel(low), mel(high)
    centers = np.linspace(lo, hi, n_mels + 2)
    freqs = mel(np.arange(n_fft // 2 + 1) * sr / n_fft)
    bank = np.zeros((n_mels, n_fft // 2 + 1), dtype=np.float32)
    for m in range(n_mels):
        l, c, r = centers[m], centers[m + 1], centers[m + 2]
        up = (freqs - l) / (c - l)
        down = (r - freqs) / (r - c)
        bank[m] = np.maximum(0, np.minimum(up, down))
    return bank


_BANK = _mel_bank()


def fbank(x: np.ndarray) -> np.ndarray:
    """Kaldi-compatible 80-dim log mel filterbank (25 ms / 10 ms, Povey window, pre-emphasis 0.97), mean-normalised."""
    x = x.astype(np.float32) * 32768.0
    flen, shift = 400, 160
    if len(x) < flen:
        x = np.pad(x, (0, flen - len(x)))
    n = 1 + (len(x) - flen) // shift
    idx = np.arange(flen)[None, :] + shift * np.arange(n)[:, None]
    fr = x[idx]
    fr = fr - fr.mean(axis=1, keepdims=True)
    fr = np.concatenate([fr[:, :1], fr[:, 1:] - 0.97 * fr[:, :-1]], axis=1)
    win = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(flen) / (flen - 1))) ** 0.85
    spec = np.abs(np.fft.rfft(fr * win, n=512)) ** 2
    feats = np.log(np.maximum(spec @ _BANK.T, np.finfo(np.float32).eps))
    return (feats - feats.mean(axis=0, keepdims=True)).astype(np.float32)


def embed(x16k: np.ndarray) -> np.ndarray:
    s = _session()
    e = s.run(None, {s.get_inputs()[0].name: fbank(x16k)[None]})[0][0]
    return e / (np.linalg.norm(e) + 1e-9)


def label(audio16k: np.ndarray, segments: list[dict]) -> list[str]:
    """Return a speaker label ("S1", "S2", ...) per segment, numbered by first appearance."""
    if not segments:
        return []
    embs, idx = [], []
    for i, s in enumerate(segments):
        if s["end"] - s["start"] >= MIN_EMB_S:
            embs.append(embed(audio16k[int(s["start"] * 16000):int(s["end"] * 16000)]))
            idx.append(i)
    if not embs:
        return ["S1"] * len(segments)
    clusters = [[k] for k in range(len(embs))]
    E = np.stack(embs)
    def centroid(c):
        v = E[c].mean(axis=0)
        return v / (np.linalg.norm(v) + 1e-9)
    while len(clusters) > 1:
        cents = np.stack([centroid(c) for c in clusters])
        sim = cents @ cents.T
        np.fill_diagonal(sim, -1)
        a, b = np.unravel_index(np.argmax(sim), sim.shape)
        if sim[a, b] < SAME_SPEAKER and len(clusters) <= MAX_SPEAKERS:
            break
        clusters[a] += clusters[b]
        del clusters[b]
    lab_of = {}
    for ci, c in enumerate(clusters):
        for k in c:
            lab_of[idx[k]] = ci
    # short segments take the label of the nearest labelled neighbour in time
    out_c = []
    for i, s in enumerate(segments):
        if i in lab_of:
            out_c.append(lab_of[i])
        else:
            j = min(lab_of, key=lambda k: abs(segments[k]["start"] - s["start"]))
            out_c.append(lab_of[j])
    order: dict[int, str] = {}
    for c in out_c:
        order.setdefault(c, f"S{len(order) + 1}")
    return [order[c] for c in out_c]
