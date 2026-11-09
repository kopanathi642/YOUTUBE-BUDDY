"""Auto-production for a content item: blueprint -> narration (free on-worker voices) -> scene cards -> captions -> thumbnail
-> a normal, fully editable project timeline. Uses the existing media pipeline; nothing is uploaded anywhere."""
from __future__ import annotations

import os
import re
import subprocess
import uuid

from PIL import Image, ImageDraw, ImageFont

from . import jobs, storage
from .models import ContentItem, MediaAsset, MediaStatus, Project, Sequence, SequenceVersion
from .timeline import Timeline, default_timeline
from .titles import FONTS, font_for

THEMES = [((18, 16, 46), (88, 52, 214)), ((6, 32, 46), (16, 140, 160)), ((40, 12, 30), (196, 60, 120)), ((14, 30, 20), (40, 150, 90))]


def _font(text: str, size: int):
    return ImageFont.truetype(str(FONTS / font_for(text)), size)


def _wrap(draw, text: str, font, width: int) -> list[str]:
    out, line = [], ""
    for w in text.split():
        t = (line + " " + w).strip()
        if draw.textlength(t, font=font) <= width:
            line = t
        else:
            if line:
                out.append(line)
            line = w
    if line:
        out.append(line)
    return out


def scene_card(path: str, W: int, H: int, heading: str, sub: str, idx: int, total: int) -> None:
    """A clean gradient card for one scene (heading + what it's about). Replace with real footage anytime in the editor."""
    import numpy as np
    a, b = (np.array(c, dtype=np.float32) for c in THEMES[idx % len(THEMES)])
    u = (np.linspace(0, 1, W)[None, :] + np.linspace(0, 1, H)[:, None]) / 2
    img = Image.fromarray((a + (b - a) * u[..., None]).astype(np.uint8), "RGB")
    d = ImageDraw.Draw(img)
    m = int(min(W, H) * 0.08)
    hf = _font(heading, int(min(W, H) * 0.085))
    lines = _wrap(d, heading, hf, W - 2 * m)[:3]
    y = int(H * 0.36) - len(lines) * hf.size // 2
    for ln in lines:
        d.text((m, y), ln, font=hf, fill=(255, 255, 255))
        y += int(hf.size * 1.15)
    if sub:
        sf = _font(sub, int(min(W, H) * 0.038))
        for ln in _wrap(d, sub, sf, W - 2 * m)[:3]:
            y += 8
            d.text((m, y), ln, font=sf, fill=(225, 225, 240))
            y += sf.size
    nf = _font("1", int(min(W, H) * 0.032))
    d.text((m, H - m - nf.size), f"{idx + 1:02d} / {total:02d}", font=nf, fill=(255, 255, 255, 180))
    img.save(path, "PNG")


def thumbnail(path: str, text: str) -> None:
    W, H = 1280, 720
    scene_card(path, W, H, "", "", 0, 1)
    img = Image.open(path).convert("RGB")
    d = ImageDraw.Draw(img)
    f = _font(text, 120)
    lines = _wrap(d, text.upper(), f, W - 120)[:3]
    y = (H - len(lines) * 135) // 2
    for ln in lines:
        d.text((62, y + 5), ln, font=f, fill=(0, 0, 0))
        d.text((56, y), ln, font=f, fill=(255, 230, 60))
        y += 135
    img.save(path, "PNG")


def sentences(text: str, max_chars: int = 80) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=[.!?।])\s+", text.strip()) if p.strip()]
    out = []
    for p in parts:
        while len(p) > max_chars:
            cut = p.rfind(" ", 0, max_chars)
            cut = cut if cut > 20 else max_chars
            out.append(p[:cut].strip())
            p = p[cut:].strip()
        if p:
            out.append(p)
    return out


def _asset(db, item: ContentItem, project: Project, user_id, path: str, filename: str, kind: str, ctype: str) -> MediaAsset:
    aid = uuid.uuid4()
    ext = filename.rsplit(".", 1)[1]
    a = MediaAsset(id=aid, workspace_id=item.workspace_id, project_id=project.id, uploaded_by=user_id, filename=filename, kind=kind,
                   declared_content_type=ctype, size_bytes=os.path.getsize(path),
                   storage_key=f"ws/{item.workspace_id}/proj/{project.id}/media/{aid}/original.{ext}", status=MediaStatus.processing,
                   analysis={"generation": {"source": "growth.produce", "content_item": str(item.id)}})
    storage.upload(path, a.storage_key, ctype)
    db.add(a)
    db.flush()
    jobs.enqueue(db, workspace_id=item.workspace_id, project_id=project.id, created_by=user_id, kind="media.process",
                 payload={"asset_id": str(aid)}, idempotency_key=f"proc:{aid}")
    return a


def produce(ctx, tmp: str) -> dict:
    """Wrapper: a failed run puts the plan back to Script with the reason, so it never sits in Production forever."""
    try:
        return _produce(ctx, tmp)
    except Exception as e:
        db = ctx.db
        db.rollback()
        item = db.get(ContentItem, uuid.UUID(ctx.job.payload["item_id"]))
        if item is not None and (ctx.job.attempts >= ctx.job.max_attempts or type(e).__name__ == "Permanent"):
            item.status = "script"
            item.blueprint = {**(item.blueprint or {}), "produce_error": str(e)[:300] or type(e).__name__}
            db.commit()
        raise


def _produce(ctx, tmp: str) -> dict:
    from . import ai_engines
    from .growth_engine import chapters, unfinished
    from .worker import Permanent
    db, p = ctx.db, ctx.job.payload
    item = db.get(ContentItem, uuid.UUID(p["item_id"]))
    if item is None:
        raise Permanent("This video plan no longer exists")
    bp = item.blueprint or {}
    missing = unfinished(bp)
    if missing:
        raise Permanent("Finish the script first: " + ", ".join(missing[:4]))
    scenes = bp["scenes"]
    vertical = item.fmt == "short"
    W, H = (1080, 1920) if vertical else (1920, 1080)
    fps = 30
    voice = p.get("voice_id") or ai_engines.default_voice(p.get("language", "en")) or ""
    project = Project(workspace_id=item.workspace_id, name=item.title[:200], created_by=ctx.job.created_by, universe="editor")
    db.add(project)
    db.flush()
    tl = default_timeline(fps, W, H)
    tracks = {t["id"]: t for t in tl["tracks"]}
    t0, durs, warnings = 0, [], []
    for i, s in enumerate(scenes):
        ctx.progress(0.05 + 0.8 * i / len(scenes), f"scene {i + 1}/{len(scenes)}: voice and card", force=True)
        wav = os.path.join(tmp, f"vo{i}.wav")
        secs = 0.0
        if voice:
            try:
                secs = ai_engines.tts(s["narration"], voice, wav)
            except Exception as e:  # noqa: BLE001 — voice engine missing/failed: keep going silent and say so
                warnings.append(f"Voice unavailable ({type(e).__name__}: {str(e)[:120]}) — scenes are timed for reading; add a voiceover in the editor")
                voice = ""
        if not secs:
            secs = len(s["narration"].split()) / 2.6       # normal speaking pace
        secs = max(secs, 1.5) + 0.35                         # small breath between scenes
        n = int(round(secs * fps))
        png = os.path.join(tmp, f"card{i}.png")
        scene_card(png, W, H, s.get("heading", ""), s.get("visual", "") if not s.get("visual", "").startswith("[") else "", i, len(scenes))
        card = _asset(db, item, project, ctx.job.created_by, png, f"Scene {i + 1:02d}.png", "image", "image/png")
        tracks["v1"]["clips"].append({"id": f"card{i}", "asset_id": str(card.id), "start": t0, "in": 0, "out": n,
                                   "fade_in": 6 if i else 0, "fade_out": 6})
        if voice:
            m4a = os.path.join(tmp, f"vo{i}.m4a")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "aac", "-b:a", "160k", m4a], check=True)
            vo = _asset(db, item, project, ctx.job.created_by, m4a, f"Narration {i + 1:02d}.m4a", "audio", "audio/mp4")
            tracks["a1"]["clips"].append({"id": f"vo{i}", "asset_id": str(vo.id), "start": t0, "in": 0, "out": n})
        # captions: split the narration and give each part time in proportion to its length
        parts = sentences(s["narration"]) if p.get("captions", True) else []
        total_chars = sum(len(x) for x in parts) or 1
        ct = t0
        for j, line in enumerate(parts):
            ln = max(12, int(n * len(line) / total_chars))
            tracks["v2"]["clips"].append({"id": f"cap{i}_{j}", "title": {"text": line[:300], "font_size": 54 if not vertical else 64,
                                       "color": "#ffffff", "bg_color": "#000000", "bg_opacity": 0.55},
                                       "start": ct, "in": 0, "out": ln, "transform": {"y": (H * 0.36) if not vertical else (H * 0.28)}})
            ct += ln
        durs.append(n / fps)
        t0 += n
    thumb = os.path.join(tmp, "thumb.png")
    thumbnail(thumb, bp.get("thumbnail_text") or item.title)
    th = _asset(db, item, project, ctx.job.created_by, thumb, "Thumbnail.png", "image", "image/png")
    tl_json = Timeline.model_validate(tl).model_dump(by_alias=True, mode="json")     # validates the whole timeline
    seq = Sequence(workspace_id=item.workspace_id, project_id=project.id, name="Main sequence", version=1, timeline=tl_json)
    db.add(seq)
    db.flush()
    db.add(SequenceVersion(sequence_id=seq.id, version=1, timeline=tl_json, saved_by=ctx.job.created_by))
    seo = dict(bp.get("seo") or {})
    ch = chapters(scenes, durs)
    if ch and "0:00" not in (seo.get("description") or ""):
        seo["description"] = ((seo.get("description") or "").strip() + "\n\n" + ch).strip()
    item.blueprint = {**{k: v for k, v in bp.items() if k != "produce_error"}, "seo": seo, "produced": {"project_id": str(project.id), "sequence_id": str(seq.id), "thumbnail_id": str(th.id),
                                                      "duration_s": round(t0 / fps, 1), "voice_id": voice or None, "scenes": len(scenes),
                                                      "warnings": warnings}}
    item.project_id, item.status = project.id, "review"
    db.commit()
    ctx.progress(1.0, "ready for review in the editor", force=True)
    return {"project_id": str(project.id), "duration_s": round(t0 / fps, 1), "voice": bool(voice), "warnings": warnings}
