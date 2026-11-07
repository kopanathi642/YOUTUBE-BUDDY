"""Multilingual dubbing: language matrix, worker steps (prepare -> translate -> render) and serialization.

prepare   : extract speech audio, transcribe (auto-detect or the user's language), per-segment language for mixed speech,
            speaker labels; then translate every requested target.
translate : per target language, segment by segment from each segment's own language (segments already in the target
            language are kept), default voice per speaker (different voices for different speakers where available).
render    : voice every line on time, mix over the ducked original, export dubbed MP4 (if the source has video), mixed
            audio (M4A, also added to the media bin), voice-only WAV, SRT and VTT. Idempotent per target revision.
"""
from __future__ import annotations

import os
import resource
import time
import uuid

from . import jobs, media, storage
from .models import Dub, MediaAsset, MediaStatus
from .speech import assets, catalog

MAX_DUB_SECONDS = 30 * 60


# ------------------------------------------------------------------ language matrix

def languages() -> dict:
    """Exactly what this server can do right now: sources, targets, voices, and the route for every pair."""
    try:
        srcs, tgts = assets.enabled_sources(), assets.enabled_targets()
    except assets.AssetError as e:
        return {"error": str(e), "sources": [], "targets": [], "pairs": {}}
    lock = assets._load_lock()
    have = {a.id for a in assets.manifest() if a.id in lock}
    def argos_ok(a, b):
        return f"argos/{a}_{b}" in have
    targets = []
    for t in tgts:
        vs = catalog.voices_for(t)
        if not vs:
            continue
        targets.append({"code": t, "name": catalog.LANG_NAMES.get(t, t), "voices": [
            {"id": v["id"], "label": v["label"], "gender": v["gender"], "engine": v["engine"], "licence": v["licence"]} for v in vs]})
    sources = [{"code": s, "name": catalog.LANG_NAMES.get(s, s)} for s in srcs]
    pairs = {}
    for s in srcs:
        for t in [x["code"] for x in targets]:
            if s == t:
                pairs[f"{s}>{t}"] = {"ok": True, "route": "same language: re-voice only"}
                continue
            path = catalog.translation_path(s, t)
            ok = bool(path) and all(argos_ok(a, b) for a, b in path)
            pairs[f"{s}>{t}"] = {"ok": ok, "route": " → ".join([s] + [b if b != "pb" else "pt" for _, b in path]) if ok else
                                 f"no translation model for {catalog.LANG_NAMES.get(s, s)} → {catalog.LANG_NAMES.get(t, t)}"}
    return {"sources": sources, "targets": targets, "pairs": pairs, "whisper": assets.whisper_model(),
            "recognises": "Whisper recognises ~100 languages; only the sources above can be translated",
            "not_available": {
                "ta, te, mr, kn, gu, pa, ml, or (Indian languages)": "No commercially usable free translation model; Whisper recognises them as speech only",
                "bn, ur (as targets)": "Translation exists but no commercially licensed voice",
                "ar, ko, th, id and other sources-only": "Can be dubbed FROM, but no commercially licensed voice to dub INTO",
                "ja, zh (as targets)": "Kokoro voices failed the pronunciation check (judge CER 309 % / 60 %) — need the misaki ja/zh phonemizer",
                "hi Piper voices (pratham, priyamvada)": "Licence is CC BY-NC-SA (non-commercial) — replaced by Kokoro Hindi voices"}}


def pair_ok(src: str, dst: str) -> tuple[bool, str]:
    p = languages()["pairs"].get(f"{src}>{dst}")
    if not p:
        return False, f"{catalog.LANG_NAMES.get(src, src)} → {catalog.LANG_NAMES.get(dst, dst)} is not supported on this server"
    return p["ok"], p["route"]


# ------------------------------------------------------------------ serialization

def ser(d: Dub, full: bool = True) -> dict:
    tg = {}
    for lang, t in (d.targets or {}).items():
        outs = dict(t.get("outputs") or {})
        files = {}
        for kind, key, name in (("srt", outs.get("srt_key"), f"{lang}.srt"), ("vtt", outs.get("vtt_key"), f"{lang}.vtt"),
                                ("voice_wav", outs.get("voice_key"), f"{lang}-voice.wav"), ("audio_m4a", outs.get("audio_key"), f"{lang}-dub.m4a"),
                                ("mp4", outs.get("mp4_key"), f"{lang}-dubbed.mp4")):
            if key:
                files[kind] = storage.signed_get(key, name)
        tg[lang] = {"status": t.get("status"), "error": t.get("error"), "revision": t.get("revision", 1), "voices": t.get("voices", {}),
                    "notes": t.get("notes", []), "report": t.get("report"), "files": files,
                    "asset_ids": {k: v for k, v in outs.items() if k.endswith("_asset")},
                    **({"segments": t.get("segments", [])} if full else {})}
    return {"id": str(d.id), "project_id": str(d.project_id), "source_asset_id": str(d.source_asset_id), "status": d.status, "error": d.error,
            "source_language": d.source_language, "detected_language": d.detected_language, "detection": d.detection or {},
            "speakers": d.speakers or {}, "version": d.version, "targets": tg, "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            **({"segments": d.segments or []} if full else {"segment_count": len(d.segments or [])})}


def _set_target(d: Dub, lang: str, **kw) -> None:
    tg = dict(d.targets or {})
    tg[lang] = {**tg.get(lang, {}), **kw}
    d.targets = tg


# ------------------------------------------------------------------ worker steps

def _load(ctx) -> Dub:
    from .worker import Permanent
    d = ctx.db.get(Dub, uuid.UUID(ctx.job.payload["dub_id"]))
    if d is None:
        raise Permanent("dub no longer exists")
    return d


def _speech_wav(ctx, tmp: str, src: MediaAsset) -> tuple[str, str]:
    from .worker import Permanent
    if not src or src.deleted_at:
        raise Permanent("source media no longer exists")
    if not src.has_audio:
        raise Permanent("This media has no audio to dub")
    if (src.duration_s or 0) > MAX_DUB_SECONDS:
        raise Permanent("Dubbing is limited to 30-minute files for now — split the video first")
    path = os.path.join(tmp, "src" + os.path.splitext(src.filename)[1].lower())
    storage.download(src.storage_key, path)
    wav = os.path.join(tmp, "speech16k.wav")
    r = media.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar", "16000", wav])
    if r.returncode:
        raise RuntimeError("audio extraction failed")
    return path, wav


def handle_prepare(ctx, tmp: str):
    from . import ai_engines
    from .speech import diarize
    from .worker import Permanent, _engine
    d = _load(ctx)
    t0 = time.time()
    src = ctx.db.get(MediaAsset, d.source_asset_id)
    ctx.progress(0.05, "extracting speech", force=True)
    _, wav = _speech_wav(ctx, tmp, src)
    ctx.progress(0.15, "recognising speech", force=True)
    tr = _engine(ai_engines.transcribe, wav, d.source_language)
    segs = tr["segments"]
    if not segs:
        raise Permanent("No speech found in this clip")
    ctx.progress(0.6, "finding speakers", force=True)
    try:
        from faster_whisper import decode_audio
        labels = diarize.label(decode_audio(wav, sampling_rate=16000), segs)
        spk_note = None
    except Exception as e:  # noqa: BLE001  (speaker detection is a nice-to-have; the dub still works with one speaker)
        labels, spk_note = ["S1"] * len(segs), f"speaker detection unavailable ({type(e).__name__}); all lines use one voice"
    old = d.speakers or {}
    d.speakers = {s: old.get(s, {"label": f"Speaker {s[1:]}"}) for s in dict.fromkeys(labels)}
    d.segments = [{"i": k, "start": s["start"], "end": s["end"], "text": s["text"], "lang": s.get("lang", tr["language"]),
                   "lang_prob": s.get("lang_prob"), "speaker": labels[k]} for k, s in enumerate(segs)]
    d.detected_language = tr["language"]
    d.detection = {"language_prob": tr.get("language_prob"), "mixed": tr.get("mixed", False), "languages": tr.get("languages", {}),
                   "engine": tr.get("engine"), "speaker_note": spk_note, "seconds": round(time.time() - t0, 1)}
    d.status, d.error = "ready", None
    d.version += 1
    ctx.db.commit()
    from .speech import asr
    asr.unload()   # free Whisper before translation/voices: a 2 GB worker can't hold every model at once
    for i, lang in enumerate(list((d.targets or {}).keys())):
        ctx.progress(0.7 + 0.25 * i / max(1, len(d.targets)), f"translating to {catalog.LANG_NAMES.get(lang, lang)}", force=True)
        translate_target(ctx.db, d, lang)
    return {"segments": len(d.segments), "language": d.detected_language, "speakers": len(d.speakers), "mixed": d.detection["mixed"]}


def translate_target(db, d: Dub, lang: str, only: list[int] | None = None) -> None:
    """(Re)translate a target from each segment's own language; keep the user's edits unless `only` names them."""
    from .speech import mt
    tg = (d.targets or {}).get(lang, {})
    prev = {s["i"]: s for s in tg.get("segments", [])}
    notes, out = [], []
    by_lang: dict[str, list[dict]] = {}
    for s in d.segments or []:
        by_lang.setdefault(s["lang"], []).append(s)
    texts: dict[int, str] = {}
    for sl, items in by_lang.items():
        todo = [s for s in items if (only is None or s["i"] in only) and not (prev.get(s["i"], {}).get("edited") and (only is None or s["i"] not in only))]
        if not todo:
            continue
        if sl == lang:
            for s in todo:
                texts[s["i"]] = s["text"]
            continue
        try:
            res, _ = mt.translate([s["text"] for s in todo], sl, lang)
            texts.update({s["i"]: x for s, x in zip(todo, res)})
        except Exception as e:  # noqa: BLE001
            notes.append(f"{len(todo)} line(s) in {catalog.LANG_NAMES.get(sl, sl)} could not be translated: {e}")
            for s in todo:
                texts[s["i"]] = s["text"]
    for s in d.segments or []:
        p = prev.get(s["i"])
        if s["i"] in texts:
            out.append({"i": s["i"], "text": texts[s["i"]], "edited": False, "from": s["lang"]})
        elif p:
            out.append(p)
    voices = dict(tg.get("voices") or {})
    pool = catalog.voices_for(lang)
    used = set(voices.values())
    for k, spk in enumerate(d.speakers or {}):
        if voices.get(spk) not in catalog.VOICE_BY_ID or catalog.VOICE_BY_ID[voices[spk]]["language"] != lang:
            free = [v["id"] for v in pool if v["id"] not in used] or [v["id"] for v in pool]
            voices[spk] = free[0]
            used.add(free[0])
    if len(d.speakers or {}) > len(pool):
        notes.append(f"{len(d.speakers)} speakers but only {len(pool)} {catalog.LANG_NAMES.get(lang, lang)} voice(s): some speakers share a voice")
    _set_target(d, lang, status="ready", segments=out, voices=voices, notes=notes, error=None,
                revision=tg.get("revision", 0) + 1)
    db.commit()


def handle_translate(ctx, tmp: str):
    d = _load(ctx)
    translate_target(ctx.db, d, ctx.job.payload["lang"], ctx.job.payload.get("only"))
    return {"lang": ctx.job.payload["lang"]}


def _peak_mb() -> float:
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)


def handle_render(ctx, tmp: str):
    from .speech import dub as D
    from .worker import Permanent, _engine
    from . import ai_engines
    d = _load(ctx)
    lang, rev = ctx.job.payload["lang"], ctx.job.payload["revision"]
    tg = (d.targets or {}).get(lang)
    if not tg:
        raise Permanent("This language was removed from the dub")
    if tg.get("revision") != rev:
        # The user edited after asking for this render: render the latest version instead (once — the key dedupes).
        if tg.get("status") in ("queued", "ready", "done", "failed"):
            jobs.enqueue(ctx.db, workspace_id=d.workspace_id, project_id=d.project_id, created_by=d.created_by, kind="dub.render",
                         payload={**ctx.job.payload, "revision": tg.get("revision")},
                         idempotency_key=f"dubrender:{d.id}:{lang}:{tg.get('revision')}:{ctx.job.payload.get('duck', 0.15)}", max_attempts=2)
            _set_target(d, lang, status="queued")
            ctx.db.commit()
        return {"skipped": "newer edits — re-queued for the latest version"}
    t0 = time.time()
    src = ctx.db.get(MediaAsset, d.source_asset_id)
    _set_target(d, lang, status="rendering", error=None)
    ctx.db.commit()
    ctx.progress(0.03, "downloading source", force=True)
    path, _ = _speech_wav(ctx, tmp, src)
    text = {s["i"]: s["text"] for s in tg.get("segments", [])}
    voices = tg.get("voices", {})
    lines = [D.Line(s["i"], s["start"], s["end"], text.get(s["i"], ""), voices.get(s["speaker"]) or catalog.default_voice(lang))
             for s in d.segments if text.get(s["i"], "").strip()]
    if not lines:
        raise Permanent("Nothing to dub — every line is empty")
    total = float(src.duration_s or (max(s["end"] for s in d.segments) + 1))
    try:
        voice, timings = D.voice_lines(lines, total, tmp, lambda f, m: ctx.progress(0.08 + 0.6 * f, m))
    except Exception as e:  # noqa: BLE001
        raise Permanent(f"Voice generation failed: {e}") from e
    ctx.progress(0.72, "mixing with the original audio", force=True)
    mix_wav = os.path.join(tmp, "mix.wav")
    D.mix(path, voice, [(s["start"], s["end"]) for s in d.segments], mix_wav, float(ctx.job.payload.get("duck", 0.15)))
    import wave
    voice_wav = os.path.join(tmp, "voice.wav")
    with wave.open(voice_wav, "wb") as w:
        import numpy as np
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(D.SR)
        w.writeframes((np.clip(voice, -1, 1) * 32767).astype("<i2").tobytes())
    base = f"ws/{d.workspace_id}/proj/{d.project_id}/dubs/{d.id}/{lang}/r{rev}"
    stem = src.filename.rsplit(".", 1)[0][:100]
    outs: dict = {}
    ctx.progress(0.8, "writing subtitles and files", force=True)
    for fmt in ("srt", "vtt"):
        p = os.path.join(tmp, f"sub.{fmt}")
        open(p, "w", encoding="utf-8").write(D.subtitles(timings, fmt))
        storage.upload(p, f"{base}/{lang}.{fmt}", "text/vtt" if fmt == "vtt" else "application/x-subrip")
        outs[f"{fmt}_key"] = f"{base}/{lang}.{fmt}"
    storage.upload(voice_wav, f"{base}/voice.wav", "audio/wav")
    outs["voice_key"] = f"{base}/voice.wav"
    m4a = os.path.join(tmp, "dub.m4a")
    D.export_audio(mix_wav, m4a)
    outs["audio_key"] = f"{base}/dub.m4a"
    storage.upload(m4a, outs["audio_key"], "audio/mp4")
    outs["audio_asset"] = str(_register(ctx, d, m4a, f"{stem} ({lang} dub).m4a", "audio", "audio/mp4"))
    if src.has_video:
        ctx.progress(0.9, "writing dubbed video", force=True)
        mp4 = os.path.join(tmp, "dub.mp4")
        D.export_mp4(path, mix_wav, mp4)
        outs["mp4_key"] = f"{base}/dubbed.mp4"
        storage.upload(mp4, outs["mp4_key"], "video/mp4")
        outs["mp4_asset"] = str(_register(ctx, d, mp4, f"{stem} ({lang} dub).mp4", "video", "video/mp4"))
    from .speech import mt, tts
    tts.unload(), mt.unload()
    secs = time.time() - t0
    rep = {"seconds": round(secs, 1), "realtime_factor": round(secs / max(1.0, total), 2), "peak_memory_mb": _peak_mb(),
           "lines": len(timings), "max_shift_s": max((x["shift"] for x in timings), default=0),
           "lines_sped_up": sum(1 for x in timings if x["speed"] > 1.0), "max_speed": max((x["speed"] for x in timings), default=1.0),
           "lines_overrunning": sum(1 for x in timings if x["overrun"] > 0), "cost_inr": 0,
           "engines": sorted({catalog.VOICE_BY_ID[x["voice"]]["engine"] for x in timings}), "timings": timings}
    d = ctx.db.get(Dub, d.id)   # re-read: the user may have edited while we rendered
    cur = (d.targets or {}).get(lang, {})
    if cur.get("revision") == rev:
        _set_target(d, lang, status="done", outputs=outs, report=rep, error=None)
    ctx.db.commit()
    return {k: v for k, v in rep.items() if k != "timings"}


def _register(ctx, d: Dub, path: str, filename: str, kind: str, ctype: str) -> uuid.UUID:
    """Put an output into the project's media bin like an upload (proxies, waveform, analysis)."""
    nid = uuid.uuid4()
    ext = os.path.splitext(path)[1]
    a = MediaAsset(id=nid, workspace_id=d.workspace_id, project_id=d.project_id, uploaded_by=d.created_by, filename=filename[:200],
                   kind=kind, declared_content_type=ctype, size_bytes=os.path.getsize(path),
                   storage_key=f"ws/{d.workspace_id}/proj/{d.project_id}/media/{nid}/original{ext}", status=MediaStatus.processing)
    ctx.db.add(a)
    ctx.db.flush()
    storage.upload(path, a.storage_key, ctype)
    jobs.enqueue(ctx.db, workspace_id=d.workspace_id, project_id=d.project_id, created_by=d.created_by, kind="media.process",
                 payload={"asset_id": str(nid)}, idempotency_key=f"process:{nid}")
    ctx.db.commit()
    return nid


def mark_failed(db, job, msg: str) -> None:
    d = db.get(Dub, uuid.UUID(job.payload["dub_id"]))
    if not d:
        return
    if job.kind == "dub.prepare":
        d.status, d.error = "failed", msg[:1000]
    else:
        _set_target(d, job.payload["lang"], status="failed", error=msg[:1000])
    db.commit()
