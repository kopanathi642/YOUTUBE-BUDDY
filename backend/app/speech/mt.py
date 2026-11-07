"""Translation with pinned Argos models (CTranslate2 + SentencePiece, CPU). Pairs without English pivot through English."""
from __future__ import annotations

import os
import threading

from . import assets, catalog

from collections import OrderedDict

_cache: "OrderedDict[str, tuple]" = OrderedDict()   # least-recently-used first
_lock = threading.Lock()
MAX_LOADED = int(os.environ.get("MT_MAX_LOADED", "3"))   # each pair takes ~100-130 MB of RAM; a 2 GB worker can't hold all 71


class NoPath(Exception):
    pass


class _SPM:
    """SentencePiece packages (most Argos models)."""
    def __init__(self, root: str):
        import sentencepiece as spm
        self.sp = spm.SentencePieceProcessor(model_file=os.path.join(root, "sentencepiece.model"))

    def encode(self, text: str) -> list[str]:
        return self.sp.encode(text, out_type=str)

    def decode(self, toks: list[str]) -> str:
        return self.sp.decode(toks).replace("▁", " ").strip()


class _BPE:
    """Moses tokenisation + subword-nmt BPE (newer Argos 1.9.x packages ship bpe.model instead of SentencePiece)."""
    def __init__(self, root: str, src: str, dst: str):
        from sacremoses import MosesDetokenizer, MosesTokenizer
        from subword_nmt.apply_bpe import BPE
        self.tok, self.detok = MosesTokenizer(lang=src), MosesDetokenizer(lang=dst)
        with open(os.path.join(root, "bpe.model"), encoding="utf-8") as f:
            self.bpe = BPE(f)

    def encode(self, text: str) -> list[str]:
        return self.bpe.segment_tokens(self.tok.tokenize(text, escape=False))

    def decode(self, toks: list[str]) -> str:
        words = " ".join(toks).replace("@@ ", "").replace("@@", "").split()
        return self.detok.detokenize(words).strip()


def _engine(a: str, b: str):
    key = f"{a}_{b}"
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
        else:
            import ctranslate2
            d = assets.unpack(f"argos/{key}", "zip")
            root = next(os.path.join(d, x) for x in os.listdir(d) if os.path.isdir(os.path.join(d, x, "model")))
            threads = min(4, os.cpu_count() or 1)
            tok = _SPM(root) if os.path.exists(os.path.join(root, "sentencepiece.model")) else _BPE(root, a, b)
            _cache[key] = (ctranslate2.Translator(os.path.join(root, "model"), device="cpu", compute_type="int8", intra_threads=threads), tok)
            while len(_cache) > MAX_LOADED:
                _cache.popitem(last=False)
    return _cache[key]


def unload() -> None:
    with _lock:
        _cache.clear()


def _leg(texts: list[str], a: str, b: str) -> list[str]:
    tr, tok = _engine(a, b)
    res = tr.translate_batch([tok.encode(t) for t in texts], beam_size=4, max_decoding_length=256, max_batch_size=16)
    return [tok.decode(r.hypotheses[0]) for r in res]


def translate(texts: list[str], src: str, dst: str) -> tuple[list[str], str]:
    if src == dst or not texts:
        return list(texts), "none"
    path = catalog.translation_path(src, dst)
    if not path:
        raise NoPath(f"No translation model for {catalog.LANG_NAMES.get(src, src)} → {catalog.LANG_NAMES.get(dst, dst)}")
    out = list(texts)
    for a, b in path:
        out = _leg(out, a, b)
    return out, "argos" + (" via English" if len(path) > 1 else "")
