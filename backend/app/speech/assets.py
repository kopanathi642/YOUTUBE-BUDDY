"""Pinned model assets for the speech stack: download once, verify SHA-256, load-test before the worker takes jobs.

    python -m app.speech.assets prefetch   # download every asset for the enabled languages, verify hashes
    python -m app.speech.assets verify     # hashes + actually load every model (what the worker runs at start-up)
    python -m app.speech.assets list       # what is pinned, sizes, licences
    python -m app.speech.assets lock       # maintainers only: (re)compute models.lock.json for ALL languages

Every URL names an exact revision (Hugging Face commit, GitHub release tag, Argos package version) and every file's
SHA-256 is pinned in models.lock.json, so the worker runs byte-identical models everywhere. With MODELS_OFFLINE=1
nothing is ever downloaded: a missing or altered file is an error, not a silent fetch.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tarfile
import threading
import time
import zipfile
from dataclasses import dataclass

import httpx

from . import catalog

CACHE = os.environ.get("MODEL_CACHE", "/tmp/creator-models")
LOCK_PATH = os.path.join(os.path.dirname(__file__), "models.lock.json")
_lock = threading.Lock()

WHISPER_REVS = {   # Systran faster-whisper conversions (MIT), pinned commits
    "small": "536b0662742c02347bc0e980a01041f333bce120",
    "medium": "08e178d48790749d25932bbc082711ddcfdfbc4f",
}
PIPER_VOICES_REV = "375a0fe641dea077c2a47b4e9a056d6da521eed3"   # rhasspy/piper-voices tag v1.0.0
PIPER_BIN_URL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/{}"
WESPEAKER_URL = "https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/f0c48c298fd835726c27956a5d617bad7115627e/voxceleb_resnet34_LM.onnx"


class AssetError(Exception):
    pass


@dataclass(frozen=True)
class Asset:
    id: str          # unique key in the lock file
    url: str
    path: str        # relative to CACHE
    purpose: str
    licence: str


def offline() -> bool:
    return os.environ.get("MODELS_OFFLINE", "").lower() in ("1", "true", "yes")


def whisper_model() -> str:
    return os.environ.get("WHISPER_MODEL", "small")


def _langs(var: str, allowed: list[str]) -> list[str]:
    v = os.environ.get(var, "all").strip()
    if v in ("", "all"):
        return list(allowed)
    want = [x.strip() for x in v.split(",") if x.strip()]
    bad = [x for x in want if x not in allowed]
    if bad:
        raise AssetError(f"{var} lists unsupported languages: {', '.join(bad)} (supported: {', '.join(allowed)})")
    return want


def enabled_sources() -> list[str]:
    return _langs("DUB_SOURCES", catalog.SOURCE_LANGS)


def enabled_targets() -> list[str]:
    return _langs("DUB_TARGETS", catalog.TARGET_LANGS)


def piper_voice_path(key: str) -> str:
    loc, name, quality = key.split("-")[0], key.split("-")[1], key.split("-")[-1]
    return f"{loc.split('_')[0]}/{loc}/{name}/{quality}/{key}"


def manifest(sources: list[str] | None = None, targets: list[str] | None = None, whisper: str | None = None) -> list[Asset]:
    sources = enabled_sources() if sources is None else sources
    targets = enabled_targets() if targets is None else targets
    wm = whisper or whisper_model()
    if wm not in WHISPER_REVS:
        raise AssetError(f"WHISPER_MODEL must be one of {', '.join(WHISPER_REVS)}")
    out = [Asset(f"whisper-{wm}/{f}", f"https://huggingface.co/Systran/faster-whisper-{wm}/resolve/{WHISPER_REVS[wm]}/{f}",
                 f"whisper/{wm}/{f}", "speech-to-text", "MIT")
           for f in ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")]
    out.append(Asset("wespeaker-resnet34", WESPEAKER_URL, "wespeaker/voxceleb_resnet34_LM.onnx", "speaker separation", "CC-BY-4.0"))
    voices = [v for v in catalog.VOICES if v["language"] in targets]
    if any(v["engine"] == catalog.KOKORO for v in voices):
        out += [Asset(f"kokoro/{f}", KOKORO_URL.format(f), f"kokoro/{f}", "voice (Kokoro)", "Apache-2.0")
                for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin")]
    piper = sorted({v["model"] for v in voices if v["engine"] == catalog.PIPER})
    if piper:
        out.append(Asset("piper-bin", PIPER_BIN_URL, "piper.tgz", "voice engine (Piper)", "MIT"))
    for key in piper:
        lic = next(v["licence"] for v in catalog.VOICES if v["model"] == key)
        base = f"https://huggingface.co/rhasspy/piper-voices/resolve/{PIPER_VOICES_REV}/{piper_voice_path(key)}"
        out += [Asset(f"piper/{key}.onnx", base + ".onnx", f"piper-voices/{key}.onnx", "voice (Piper)", lic),
                Asset(f"piper/{key}.onnx.json", base + ".onnx.json", f"piper-voices/{key}.onnx.json", "voice (Piper)", lic)]
    pairs = {(s, "en") for s in sources if s != "en"} | {("en", catalog.ARGOS_TARGET_CODE.get(t, t)) for t in targets if t != "en"}
    for a, b in sorted(pairs):
        ver = catalog.ARGOS_TO_EN[a] if b == "en" else catalog.ARGOS_FROM_EN[b]
        name = f"translate-{a}_{b}-{ver.replace('.', '_')}.argosmodel"
        out.append(Asset(f"argos/{a}_{b}", f"https://argos-net.com/v1/{name}", f"argos/{name}", "translation", "MIT project / OPUS data"))
    return out


def _load_lock() -> dict:
    try:
        return json.load(open(LOCK_PATH))
    except FileNotFoundError:
        return {}


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    try:
        with httpx.stream("GET", url, follow_redirects=True, timeout=httpx.Timeout(60, read=300)) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in r.iter_bytes(1 << 20):
                    f.write(chunk)
    except Exception as e:
        raise AssetError(f"download failed from {url.split('/')[2]}: {type(e).__name__}") from e
    os.replace(tmp, dest)


def _verified_marker(path: str) -> str:
    return path + ".sha256ok"


def ensure(a: Asset, lock: dict | None = None) -> str:
    """Return the local path of a verified asset, downloading it first unless offline."""
    lock = _load_lock() if lock is None else lock
    pin = lock.get(a.id)
    if not pin:
        raise AssetError(f"{a.id} is not pinned in models.lock.json — run `python -m app.speech.assets lock`")
    path = os.path.join(CACHE, a.path)
    marker = _verified_marker(path)
    if os.path.exists(path):
        st = os.stat(path)
        stamp = f"{pin['sha256']} {st.st_size} {int(st.st_mtime)}"
        if os.path.exists(marker) and open(marker).read() == stamp:
            return path
        if _sha256(path) == pin["sha256"]:
            open(marker, "w").write(stamp)
            return path
        os.remove(path)   # altered or truncated: never use it
        if offline():
            raise AssetError(f"{a.id} failed its SHA-256 check and MODELS_OFFLINE=1 forbids re-downloading it")
    if offline():
        raise AssetError(f"{a.id} is missing from {CACHE} and MODELS_OFFLINE=1 forbids downloading it — run prefetch")
    with _lock:
        _download(a.url, path)
        got = _sha256(path)
        if got != pin["sha256"]:
            os.remove(path)
            raise AssetError(f"{a.id} downloaded but its SHA-256 is {got[:12]}…, pinned {pin['sha256'][:12]}… — refusing to use it")
        st = os.stat(path)
        open(marker, "w").write(f"{pin['sha256']} {st.st_size} {int(st.st_mtime)}")
    return path


def asset_path(asset_id: str) -> str:
    for a in manifest():
        if a.id == asset_id:
            return ensure(a)
    raise AssetError(f"{asset_id} is not part of the enabled model set")


def unpack(asset_id: str, kind: str) -> str:
    """Extract an archive asset once (tar for Piper, zip for Argos) and return the folder."""
    src = asset_path(asset_id)
    d = src + ".d"
    ok = os.path.join(d, ".ok")
    if not os.path.exists(ok):
        with _lock:
            if not os.path.exists(ok):
                os.makedirs(d, exist_ok=True)
                if kind == "tar":
                    with tarfile.open(src) as t:
                        t.extractall(d, filter="data")
                else:
                    with zipfile.ZipFile(src) as z:
                        z.extractall(d)
                open(ok, "w").write(open(_verified_marker(src)).read())
    return d


# ------------------------------------------------------------------ commands

def prefetch(progress=print) -> list[str]:
    lock, paths = _load_lock(), []
    items = manifest()
    total = sum(lock.get(a.id, {}).get("size", 0) for a in items)
    progress(f"{len(items)} assets, {total / 1e9:.2f} GB, into {CACHE}")
    for i, a in enumerate(items, 1):
        t0 = time.time()
        paths.append(ensure(a, lock))
        progress(f"[{i}/{len(items)}] {a.id} ok ({time.time() - t0:.1f}s)")
    return paths


def load_check(progress=print) -> dict:
    """Hashes, then load every engine and run one tiny inference per language. Raises on the first failure."""
    prefetch(progress)
    from . import asr, mt, tts
    report: dict = {"whisper": None, "voices": {}, "translation": {}}
    t0 = time.time()
    asr.model()
    report["whisper"] = f"{whisper_model()} loaded in {time.time() - t0:.1f}s"
    for t in enabled_targets():
        for v in catalog.voices_for(t)[:1]:
            sec = tts.speak(_SAMPLE.get(t, "Hello"), v["id"], os.path.join(CACHE, ".check.wav"))
            if sec <= 0.2:
                raise AssetError(f"voice {v['id']} produced no audio")
            report["voices"][t] = v["id"]
    for s in enabled_sources():
        if s != "en":
            report["translation"][f"{s}->en"] = mt.translate([_SAMPLE.get(s, "test")], s, "en")[0][0]
            mt.unload()   # load-test one pair at a time: all 71 together would need ~9 GB of RAM
    for t in enabled_targets():
        if t != "en":
            report["translation"][f"en->{t}"] = mt.translate(["Thank you"], "en", t)[0][0]
            mt.unload()
    asr.unload(), tts.unload(), mt.unload()   # the check proves they load; jobs load what they need when they run
    import gc
    gc.collect()
    progress(f"all models loaded and answered ({len(report['voices'])} voices, {len(report['translation'])} translation pairs)")
    return report


_SAMPLE = {"hi": "नमस्ते", "en": "Hello", "es": "Hola", "fr": "Bonjour", "it": "Ciao", "pt": "Olá", "ja": "こんにちは", "zh": "你好",
           "de": "Hallo", "nl": "Hallo", "ru": "Привет", "pl": "Cześć", "tr": "Merhaba", "uk": "Привіт", "vi": "Xin chào",
           "cs": "Ahoj", "da": "Hej", "el": "Γεια σου", "fa": "سلام", "fi": "Hei", "hu": "Szia", "lv": "Sveiki", "nb": "Hei",
           "ro": "Salut", "sk": "Ahoj", "sl": "Živjo", "sv": "Hej", "ca": "Hola"}


def lock_all() -> None:
    """Maintainers: download every asset for every supported language and both Whisper sizes, write sha256 + size."""
    items = {a.id: a for wm in WHISPER_REVS for a in manifest(catalog.SOURCE_LANGS, catalog.TARGET_LANGS, wm)}
    lock = _load_lock()
    for i, a in enumerate(sorted(items.values(), key=lambda x: x.id), 1):
        path = os.path.join(CACHE, a.path)
        if not os.path.exists(path):
            _download(a.url, path)
        lock[a.id] = {"sha256": _sha256(path), "size": os.path.getsize(path), "url": a.url, "licence": a.licence}
        json.dump(dict(sorted(lock.items())), open(LOCK_PATH, "w"), indent=1)   # saved after every file: resumable
        print(f"[{i}/{len(items)}] {a.id} {lock[a.id]['size'] / 1e6:.1f} MB", flush=True)
    print(f"wrote {LOCK_PATH}")


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "verify"
    try:
        if cmd == "prefetch":
            prefetch()
        elif cmd == "verify":
            print(json.dumps(load_check(), ensure_ascii=False, indent=1))
        elif cmd == "list":
            lock = _load_lock()
            for a in manifest():
                print(f"{a.id:48} {lock.get(a.id, {}).get('size', 0) / 1e6:8.1f} MB  {a.licence:22} {a.purpose}")
        elif cmd == "lock":
            lock_all()
        else:
            print(__doc__)
            return 2
    except AssetError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
