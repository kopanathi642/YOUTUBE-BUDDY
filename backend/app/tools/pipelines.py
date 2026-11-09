"""Multi-step tools: several engines chained, with the heavy lifting (stitching, typesetting, sampling) on our worker."""
import os
import uuid

from .. import media
from . import providers
from .engines import call_fal, direct_image, direct_video, fal_input, pick_model, run_fal, run_llm, save_fal_files
from .local import FF, H264, LOCAL, draw_text, ff, to_srt
from .registry import TOOLS, keys, status
from .run import RunCtx, ToolError


def _conform(src: str, out: str, W: int, H: int, fps: int = 30):
    """Same size/rate/audio layout for every clip so they can be joined without re-timing glitches."""
    ff(["-i", src, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex",
        f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},format=yuv420p[v]",
        "-map", "[v]", "-map", "0:a?", "-map", "1:a", "-shortest"] + H264 + ["-c:a", "aac", "-ar", "48000", "-ac", "2", out], "conform")


def _concat(paths: list[str], out: str):
    lst = out + ".txt"
    with open(lst, "w") as f:
        f.write("".join(f"file '{p}'\n" for p in paths))
    ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out], "join")


WH = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}


def storyboard_film(rc: RunCtx):
    shots = [s for s in (rc.p.get("shots") or []) if (s.get("prompt") or "").strip()]
    if len(shots) < 2:
        raise ToolError("Add at least two shots with a description")
    models = rc.tool["engine"]["models"]
    m = pick_model(rc, models)
    W, H = WH.get(rc.p.get("aspect_ratio") or "16:9", (1920, 1080))
    if rc.p.get("resolution") != "1080p":
        W, H = W * 2 // 3 // 2 * 2, H * 2 // 3 // 2 * 2
    parts = []
    base = {k: rc.p.get(k) for k in ("aspect_ratio", "resolution", "generate_audio", "seed")}
    for i, s in enumerate(shots):
        if rc.cancelled():
            raise providers.Cancelled()
        sub = RunCtx.__new__(RunCtx)
        sub.__dict__.update(rc.__dict__)
        sub.p = {**base, **s}
        sub.tool = {**rc.tool, "id": "001"}
        payload = fal_input(sub, m)
        payload["prompt"] = direct_video(sub.p)
        lo, hi = 0.05 + 0.8 * i / len(shots), 0.05 + 0.8 * (i + 1) / len(shots)
        out = call_fal(rc, m, payload, lo, hi)
        n0 = len(rc.outputs)
        save_fal_files(rc, out, "video", f"Shot {i + 1} — {s['prompt'][:30]}", limit=1)
        raw = rc.outputs[n0]["path"]
        conf = rc.path(f"shot{i}.mp4")
        _conform(raw, conf, W, H)
        parts.append(conf)
    rc.progress(0.9, "stitching the film")
    film = rc.path("film.mp4")
    _concat(parts, film)
    rc.add(film, "video", f"Film — {shots[0]['prompt'][:30]}", ai=True)
    rc.result = {"shots": len(shots)}


def _last_frame(src: str, out: str):
    ff(["-sseof", "-0.1", "-i", src, "-frames:v", "1", "-update", "1", out], "last frame")


def video_extend(rc: RunCtx):
    a = rc.asset("video")
    src = rc.local(a)
    lf = rc.path("last.png")
    _last_frame(src, lf)
    m = pick_model(rc, rc.tool["engine"]["models"])
    payload = {"prompt": direct_video(rc.p), "image_url": rc.put_url(lf), "duration": fal_input(_with(rc, {"image": None}), {**m, "family": "t2v"})["duration"]}
    if m.get("audio"):
        payload["generate_audio"] = bool(a.has_audio)
    out = call_fal(rc, m, payload, 0.1, 0.8)
    n0 = len(rc.outputs)
    save_fal_files(rc, out, "video", "Extension", limit=1)
    ext = rc.outputs.pop(n0)["path"]
    W, H = (a.width or 1920) // 2 * 2, (a.height or 1080) // 2 * 2
    p1, p2 = rc.path("a.mp4"), rc.path("b.mp4")
    rc.progress(0.85, "joining")
    _conform(src, p1, W, H)
    _conform(ext, p2, W, H)
    joined = rc.path("extended.mp4")
    _concat([p1, p2], joined)
    rc.add(joined, "video", f"{os.path.splitext(a.filename)[0]} (extended)", ai=True)


def _with(rc: RunCtx, extra: dict) -> RunCtx:
    sub = RunCtx.__new__(RunCtx)
    sub.__dict__.update(rc.__dict__)
    sub.p = {**rc.p, **extra}
    return sub


AD_STYLE = {"premium studio": "luxury product commercial, seamless studio backdrop, slow reveal, glossy reflections",
            "lifestyle": "lifestyle commercial, the product in a real home setting, warm natural light",
            "unboxing": "unboxing moment, hands opening the package, the product revealed",
            "festive": "festive Indian celebration setting, diyas and marigolds, warm bokeh",
            "tech launch": "sleek tech launch, dark background, rim light, particles, dramatic reveal"}


def product_ad(rc: RunCtx):
    from PIL import Image
    m = pick_model(rc, rc.tool["engine"]["models"])
    rc.p["prompt"] = (f"{AD_STYLE.get(rc.p.get('ad_style') or 'premium studio')}. The product is {rc.p.get('product_name', 'the product')}. "
                      "Keep the product's exact shape, label and colours.")
    payload = fal_input(_with(rc, {}), {**m, "family": "i2v"})
    out = call_fal(rc, m, payload, 0.05, 0.75)
    n0 = len(rc.outputs)
    save_fal_files(rc, out, "video", "Ad shot", limit=1)
    shot = rc.outputs.pop(n0)["path"]
    W, H = WH.get(rc.p.get("aspect_ratio") or "16:9", (1920, 1080))
    W, H = W * 2 // 3 // 2 * 2, H * 2 // 3 // 2 * 2
    rc.progress(0.8, "end card")
    card = Image.new("RGBA", (W, H), _rgba(rc.p.get("brand_color") or "#7c3aed"))
    draw_text(card, rc.p.get("product_name") or "", size=int(H * 0.11), color="#ffffff", outline=None, position="center")
    if rc.p.get("tagline"):
        draw_text(card, rc.p["tagline"], size=int(H * 0.05), color="#ffffff", outline=None, position="lower third")
    cp = rc.path("card.png")
    card.convert("RGB").save(cp)
    cv = rc.path("card.mp4")
    ff(["-loop", "1", "-t", "2.5", "-i", cp, "-f", "lavfi", "-t", "2.5", "-i", "anullsrc=r=48000:cl=stereo", "-vf", "fps=30,format=yuv420p",
        "-shortest"] + H264 + ["-c:a", "aac", cv], "end card")
    p1, p2 = rc.path("s.mp4"), rc.path("c.mp4")
    _conform(shot, p1, W, H)
    _conform(cv, p2, W, H)
    final = rc.path("ad.mp4")
    _concat([p1, p2], final)
    rc.add(final, "video", f"Ad — {rc.p.get('product_name', '')}", ai=True)


def _rgba(h):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255


def thumbnail(rc: RunCtx):
    from PIL import Image
    m = pick_model(rc, rc.tool["engine"]["models"])
    n = max(1, min(4, int(rc.p.get("variations") or 1)))
    side = {"left": "right", "right": "left"}.get(rc.p.get("text_position") or "right", "center")
    for i in range(n):
        p = {**rc.p, "prompt": f"{rc.p.get('prompt', '')}. YouTube thumbnail, bold and high contrast, subject on the {side} side, "
                               f"leave clean empty space on the {rc.p.get('text_position', 'right')} for a headline. No text in the image."}
        payload = fal_input(_with(rc, p), m)
        payload["prompt"] = direct_image(p)
        if "aspect_ratio" in payload:
            payload["aspect_ratio"] = "16:9"
        if rc.p.get("seed") not in (None, ""):
            payload["seed"] = int(rc.p["seed"]) + i
        out = call_fal(rc, m, payload, 0.05 + 0.8 * i / n, 0.05 + 0.8 * (i + 1) / n)
        n0 = len(rc.outputs)
        save_fal_files(rc, out, "image", "bg", limit=1)
        bg = rc.outputs.pop(n0)["path"]
        im = Image.open(bg).convert("RGBA")
        s = max(1280 / im.width, 720 / im.height)
        im = im.resize((int(im.width * s + 0.5), int(im.height * s + 0.5)))
        im = im.crop(((im.width - 1280) // 2, (im.height - 720) // 2, (im.width - 1280) // 2 + 1280, (im.height - 720) // 2 + 720))
        draw_text(im, (rc.p.get("headline") or "").upper(), size=118, color=rc.p.get("text_color") or "#ffffff",
                  outline=rc.p.get("accent") or "#ff2a2a", position=rc.p.get("text_position") or "right", max_w=0.5)
        out_p = rc.path(f"thumb{i}.png")
        im.convert("RGB").save(out_p)
        rc.add(out_p, "image", f"Thumbnail — {rc.p.get('headline', '')[:30]}" + (f" v{i + 1}" if n > 1 else ""), ai=True)


def storyboard_frames(rc: RunCtx):
    plan = run_llm(_with(rc, {"aspect_ratio": rc.p.get("aspect_ratio")}), "shotlist")
    shots = (plan.get("shots") or [])[: int(rc.p.get("max_frames") or 6)]
    if not shots:
        raise ToolError("The language model returned no shots")
    llm_model = rc.model
    m = pick_model(rc, rc.tool["engine"]["models"])
    frames = []
    for i, s in enumerate(shots):
        p = {"prompt": s.get("prompt", ""), "style": rc.p.get("style"), "aspect_ratio": rc.p.get("aspect_ratio")}
        payload = fal_input(_with(rc, p), m)
        payload["prompt"] = direct_image(p) + f" Camera: {s.get('camera_angle', '')}, {s.get('lens', '')}."
        out = call_fal(rc, m, payload, 0.2 + 0.7 * i / len(shots), 0.2 + 0.7 * (i + 1) / len(shots))
        save_fal_files(rc, out, "image", f"Frame {i + 1:02d} — {s.get('prompt', '')[:28]}", limit=1)
        frames.append({**s, "n": i + 1})
    rc.model = f"{llm_model} + {m['id']}"
    rc.result = {"kind": "storyboard", "shots": frames}


def safety_check(rc: RunCtx):
    a = rc.asset("video")
    src = rc.local(a)
    m = pick_model(rc, rc.tool["engine"]["models"])
    dur = a.duration_s or 1
    rows = []
    for i in range(8):
        t = dur * (i + 0.5) / 8
        fp = rc.path(f"f{i}.jpg")
        ff(["-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=640:-2", fp], "frame")
        out = call_fal(rc, m, {"image_url": rc.put_url(fp)}, 0.05 + 0.1 * i, 0.15 + 0.1 * i)
        prob = out.get("nsfw_probability")
        if prob is None and isinstance(out.get("results"), list) and out["results"]:
            prob = out["results"][0].get("nsfw_probability")
        rows.append({"t": round(t, 1), "nsfw_probability": prob})
    worst = max((r["nsfw_probability"] or 0) for r in rows)
    rc.result = {"kind": "safety", "frames": rows, "verdict": "review needed" if worst > 0.5 else "no unsafe imagery detected in sampled frames",
                 "note": "8 evenly spaced frames were checked; this is a screen, not a guarantee."}


def chapters_prompt(lines: str, scenes: str) -> tuple[str, str]:
    return ("You make YouTube chapters. First chapter must start at 0:00, at least 3 chapters, each at least 10 s apart. Reply with one JSON object.",
            f"Transcript with timestamps:\n{lines}\nScene cuts: {scenes}\nReturn {{\"chapters\": [{{\"t\": seconds, \"title\": str}}], \"description_block\": str}}")


def chapters(rc: RunCtx):
    from .local import _transcript
    a = rc.asset("video")
    t = _transcript(rc, a)
    lines = "\n".join(f"[{int(s['start'] // 60)}:{int(s['start'] % 60):02d}] {s['text'].strip()}" for s in t["segments"])[:30000]
    scenes = ", ".join(f"{s['start']:.0f}s" for s in (a.analysis or {}).get("scenes", [])[:80])
    out, model = providers.llm_json(*chapters_prompt(lines, scenes))
    rc.model = f"whisper + {model}"
    rc.result = {"kind": "chapters", **out, "segments": t["segments"]}


def broll(rc: RunCtx):
    from sqlalchemy import select
    from ..models import MediaAsset, MediaStatus
    from .local import _transcript
    a = rc.asset("video")
    t = _transcript(rc, a)
    lib = rc.db.scalars(select(MediaAsset).where(MediaAsset.project_id == a.project_id, MediaAsset.status == MediaStatus.ready,
                                                 MediaAsset.deleted_at.is_(None), MediaAsset.id != a.id)).all()
    names = "\n".join(f"{x.id}: {x.filename} ({x.kind})" for x in lib[:200])
    lines = "\n".join(f"[{s['start']:.1f}-{s['end']:.1f}] {s['text'].strip()}" for s in t["segments"])[:25000]
    out, model = providers.llm_json(
        "You are a video editor. Suggest cutaways (B-roll) where they help understanding or pacing. Use library files when they fit; otherwise describe what to film or generate. Reply with one JSON object.",
        f"Transcript:\n{lines}\nProject library:\n{names}\nReturn {{\"suggestions\": [{{\"start\": number, \"end\": number, \"why\": str, \"show\": str, \"library_asset_id\": str|null, \"generate_prompt\": str}}]}}")
    valid = {str(x.id) for x in lib}
    for s in out.get("suggestions", []):
        if s.get("library_asset_id") not in valid:
            s["library_asset_id"] = None
    rc.model = f"whisper + {model}"
    rc.result = {"kind": "broll", **out}


def lipsync_dub(rc: RunCtx):
    from .. import ai_engines
    from ..worker import Permanent, dub_to_wav
    a = rc.asset("video")
    target = rc.p.get("target") or "hi"
    voice = rc.p.get("voice_id") or ai_engines.default_voice(target)
    wav = rc.path("dub.wav")
    try:
        dub_to_wav(rc.w, rc.tmp, a, target, voice, wav)
    except Permanent as e:
        raise ToolError(str(e))
    m = pick_model(rc, rc.tool["engine"]["models"])
    out = call_fal(rc, m, {"video_url": rc.url(a), "audio_url": rc.put_url(wav), "sync_mode": "cut_off"}, 0.6, 0.9)
    save_fal_files(rc, out, "video", f"{os.path.splitext(a.filename)[0]} ({target} lip-synced)", limit=1)


def translation_compare(rc: RunCtx):
    from .. import ai_engines
    from .local import _transcript
    a = rc.asset("video")
    t = _transcript(rc, a)
    tgt = rc.p.get("target") or "hi"
    texts = [s["text"] for s in t["segments"]][:200]
    rc.progress(0.4, "machine translation")
    try:
        mt, eng = ai_engines._argos(texts, t["language"], tgt)
    except Exception as e:  # noqa: BLE001
        mt, eng = [f"(unavailable: {type(e).__name__})"] * len(texts), "argos"
    rc.progress(0.6, "language-model translation")
    out, model = providers.llm_json(
        "You translate video subtitles naturally for native viewers. Reply with one JSON object.",
        f"Translate each item from {t['language']} to {tgt}. Return {{\"items\": [...]}} with the same count.\n{providers.json.dumps(texts, ensure_ascii=False)}")
    lm = out.get("items", [])
    rc.model = f"{eng} vs {model}"
    rc.result = {"kind": "compare", "rows": [{"start": s["start"], "end": s["end"], "source": s["text"], "a": mt[i] if i < len(mt) else "",
                                              "b": lm[i] if i < len(lm) else ""} for i, s in enumerate(t["segments"][:200])],
                 "a_engine": eng, "b_engine": model}


# ---------------------------------------------------------------- workflows (111, 112-116, 118, 120)

TEMPLATES = {
    "long_to_shorts": {"name": "Long video → Shorts", "nodes": [
        {"id": "in", "tool_id": "input", "params": {}, "note": "Your long video"},
        {"id": "s", "tool_id": "094", "params": {"count": 3, "length": 30}, "note": "Find the best moments as vertical shorts"},
        {"id": "c", "tool_id": "040", "params": {"caption_style": "bold pop"}, "note": "Burn animated captions into the source"}],
        "edges": [{"from": "in", "to": "s", "input": "video"}, {"from": "in", "to": "c", "input": "video"}]},
    "faceless": {"name": "Faceless video", "nodes": [
        {"id": "w", "tool_id": "051", "params": {"format": "Short / Reel", "length": "short"}, "note": "Write the script"},
        {"id": "v", "tool_id": "041", "params": {}, "note": "Voice-over from the script"},
        {"id": "i", "tool_id": "011", "params": {"style": "cinematic photo"}, "note": "A key image for the topic"},
        {"id": "k", "tool_id": "039", "params": {"move": "push in", "duration": 8}, "note": "Animate the image"}],
        "edges": [{"from": "w", "to": "v", "input": "text"}, {"from": "w", "to": "i", "input": "prompt"}, {"from": "i", "to": "k", "input": "image"}]},
    "podcast_clips": {"name": "Podcast → clips", "nodes": [
        {"id": "in", "tool_id": "input", "params": {}, "note": "Podcast video"},
        {"id": "h", "tool_id": "065", "params": {"count": 5, "length": 45}, "note": "Score every moment"},
        {"id": "s", "tool_id": "094", "params": {"count": 3, "length": 45}, "note": "Make vertical clips"},
        {"id": "m", "tool_id": "048", "params": {"target": -14}, "note": "Master the audio"}],
        "edges": [{"from": "in", "to": "h", "input": "video"}, {"from": "in", "to": "s", "input": "video"}, {"from": "in", "to": "m", "input": "audio"}]},
    "auto_localize": {"name": "Auto localize", "nodes": [
        {"id": "in", "tool_id": "input", "params": {}, "note": "Source video"},
        {"id": "t", "tool_id": "102", "params": {}, "note": "Subtitles in each language"},
        {"id": "d", "tool_id": "104", "params": {}, "note": "Dub into the first language"}],
        "edges": [{"from": "in", "to": "t", "input": "video"}, {"from": "in", "to": "d", "input": "video"}]},
    "polish_talking_head": {"name": "Polish a talking-head video", "nodes": [
        {"id": "in", "tool_id": "input", "params": {}, "note": "Raw recording"},
        {"id": "g", "tool_id": "030", "params": {"look": "natural"}, "note": "Balance colour"},
        {"id": "n", "tool_id": "047", "params": {"strength": 18}, "note": "Clean the voice"},
        {"id": "z", "tool_id": "096", "params": {"zoom": 1.2}, "note": "Punch-ins on emphasis"},
        {"id": "a", "tool_id": "066", "params": {}, "note": "Retention check"}],
        "edges": [{"from": "in", "to": "g", "input": "video"}, {"from": "in", "to": "n", "input": "audio"},
                  {"from": "g", "to": "z", "input": "video"}, {"from": "in", "to": "a", "input": "video"}]},
    "product_launch": {"name": "Product launch kit", "nodes": [
        {"id": "p", "tool_id": "input", "params": {}, "note": "Product photo"},
        {"id": "ph", "tool_id": "017", "params": {"scene": "marble studio"}, "note": "Hero product shot"},
        {"id": "ad", "tool_id": "008", "params": {"ad_style": "premium studio"}, "note": "Animated ad with end card"},
        {"id": "m", "tool_id": "042", "params": {"prompt": "modern upbeat corporate", "duration": 20}, "note": "Background music"}],
        "edges": [{"from": "p", "to": "ph", "input": "image"}, {"from": "ph", "to": "ad", "input": "image"}]},
}


def _node_inputs(tool: dict) -> list[str]:
    return [p["key"] for p in tool["params"] if p["type"] in ("media", "media_multi")]


def validate_graph(g: dict) -> list[dict]:
    nodes = {n["id"]: n for n in g.get("nodes", [])}
    if not nodes:
        raise ToolError("The workflow is empty")
    if len(nodes) > 20:
        raise ToolError("A workflow can have at most 20 nodes")
    for n in nodes.values():
        if n["tool_id"] not in ("input", "approval") and n["tool_id"] not in TOOLS:
            raise ToolError(f"Unknown tool {n['tool_id']}")
        if n["tool_id"] in ("111", "116", "117", "118", "119", "120") or TOOLS.get(n["tool_id"], {}).get("output") == "workflow":
            raise ToolError("Workflows cannot contain other workflows")
    indeg = {k: 0 for k in nodes}
    for e in g.get("edges", []):
        if e["from"] not in nodes or e["to"] not in nodes:
            raise ToolError("An edge points at a missing node")
        indeg[e["to"]] += 1
    order, ready = [], [k for k, d in indeg.items() if d == 0]
    while ready:
        k = ready.pop(0)
        order.append(nodes[k])
        for e in g.get("edges", []):
            if e["from"] == k:
                indeg[e["to"]] -= 1
                if indeg[e["to"]] == 0:
                    ready.append(e["to"])
    if len(order) != len(nodes):
        raise ToolError("The workflow has a loop")
    return order


def _run_node(rc: RunCtx, tool_id: str, params: dict) -> dict:
    """Run one tool inline inside the workflow job; return its outputs (new asset ids are processed synchronously)."""
    from ..worker import handle_media_process
    from .run import store_outputs
    t = TOOLS[tool_id]
    for spec in t["params"]:  # each node checks its inputs, exactly like a direct run would
        if spec["type"] not in ("media", "media_multi") or not params.get(spec["key"]):
            continue
        for aid in (params[spec["key"]] if isinstance(params[spec["key"]], list) else [params[spec["key"]]]):
            a = rc.asset_by_id(aid)
            if spec.get("accept") and a.kind not in spec["accept"]:
                raise ToolError(f"{t['name']} needs {' or '.join(spec['accept'])} for “{spec['label']}”, but got {a.kind} ({a.filename})")
    st = status(t, keys())
    if st["state"] != "ready":
        raise ToolError(f"{t['name']} is not available: {', '.join(st['needs']) or st['detail']}")
    sub = RunCtx.__new__(RunCtx)
    sub.__dict__.update(rc.__dict__)
    sub.tool, sub.p, sub.outputs, sub.result, sub.sequences, sub.model = t, params, [], {}, [], None
    from . import engines
    e = t["engine"]
    if e["type"] == "fal":
        engines.run_fal(sub)
    elif e["type"] == "llm":
        engines.run_llm(sub, e["task"])
    elif e["type"] == "youtube":
        engines.run_youtube(sub, e["task"])
    elif e["type"] == "local":
        LOCAL[e["handler"]](sub)
    else:
        PIPES[e["handler"]](sub)
    ids = store_outputs(sub)
    # make outputs usable by the next node right away
    from ..models import Job, JobStatus
    from sqlalchemy import select
    for aid in ids:
        j = rc.db.scalar(select(Job).where(Job.kind == "media.process", Job.payload["asset_id"].astext == aid, Job.status == JobStatus.queued))
        if j:
            class _W:  # minimal ctx for the media pipeline, reporting progress through the workflow job
                db, job = rc.db, j
                progress = staticmethod(lambda p, s=None, force=False: None)
            os.makedirs(rc.path(f"proc-{aid}"), exist_ok=True)
            handle_media_process(_W, rc.path(f"proc-{aid}"))
            from .. import jobs as J
            rc.db.refresh(j)
            J.finish(rc.db, j, result={"asset_id": aid, "by": "workflow"})
    rc.sequences += sub.sequences
    return {"assets": ids, "result": sub.result, "sequences": sub.sequences, "model": sub.model}


def _text_of(res: dict) -> str:
    r = res.get("result") or {}
    if r.get("scenes") and isinstance(r["scenes"], list) and r["scenes"] and "narration" in r["scenes"][0]:
        return " ".join(s.get("narration", "") for s in r["scenes"])
    for k in ("text", "logline", "description", "answer"):
        if isinstance(r.get(k), str):
            return r[k]
    return ""


def workflow(rc: RunCtx, graph: dict | None = None):
    g = graph or rc.p.get("graph") or {}
    order = validate_graph(g)
    state = dict((rc.gen.result or {}).get("state") or {})  # resumes after an approval
    results: dict = dict(state.get("results") or {})
    approved = set(state.get("approved") or []) | set(rc.p.get("_approved") or [])
    for idx, n in enumerate(order):
        if n["id"] in results:
            continue
        rc.progress(0.05 + 0.9 * idx / len(order), f"step {idx + 1}/{len(order)}: {TOOLS.get(n['tool_id'], {}).get('name', n['tool_id'])}")
        if n["tool_id"] == "input":
            results[n["id"]] = {"assets": [x for x in [n.get("params", {}).get("asset_id") or rc.p.get("video") or rc.p.get("image")] if x], "result": {}}
            continue
        if n["tool_id"] == "approval":
            if n["id"] not in approved:
                rc.gen.status = "awaiting_approval"
                rc.result = {"kind": "workflow", "graph": g, "state": {"results": results, "approved": list(approved), "waiting": n["id"]}}
                return
            results[n["id"]] = {"assets": [a for e in g.get("edges", []) if e["to"] == n["id"] for a in results.get(e["from"], {}).get("assets", [])], "result": {}}
            continue
        params = dict(n.get("params") or {})
        for e in g.get("edges", []):
            if e["to"] != n["id"]:
                continue
            up = results.get(e["from"], {})
            key = e.get("input") or "video"
            if key in ("text", "prompt", "brief", "script"):
                params[key] = params.get(key) or _text_of(up) or ""
            elif up.get("assets"):
                tool = TOOLS[n["tool_id"]]
                spec = next((p for p in tool["params"] if p["key"] == key), None)
                params[key] = up["assets"] if spec and spec["type"] == "media_multi" else up["assets"][0]
        for k in ("video", "image", "audio"):  # tools given a top-level input
            spec = next((p for p in TOOLS[n["tool_id"]]["params"] if p["key"] == k), None)
            if spec and k not in params and rc.p.get(k):
                params[k] = rc.p[k]
        if n["tool_id"] in ("102", "104") and rc.p.get("targets"):
            params.setdefault("targets", rc.p["targets"])
            params.setdefault("target", rc.p["targets"][0])
        if n["tool_id"] in ("051",) and rc.p.get("brief"):
            params.setdefault("brief", rc.p["brief"])
        res = _run_node(rc, n["tool_id"], params)
        results[n["id"]] = res
    rc.result = {"kind": "workflow", "graph": g, "state": {"results": results, "approved": list(approved), "waiting": None},
                 "outputs": {k: v.get("assets", []) for k, v in results.items()}}
    rc.model = "workflow"


def template(rc: RunCtx):
    t = TEMPLATES[rc.tool["engine"]["template"]]
    workflow(rc, t)


def batch(rc: RunCtx):
    tid = rc.p.get("tool")
    if tid not in TOOLS or TOOLS[tid]["output"] == "workflow":
        raise ToolError("Choose a tool to run")
    t = TOOLS[tid]
    key = next((p["key"] for p in t["params"] if p["type"] == "media"), None)
    if not key:
        raise ToolError("That tool does not take a file")
    items = rc.p.get("items") or []
    done = {}
    for i, aid in enumerate(items[:20]):
        rc.progress(0.05 + 0.9 * i / len(items), f"file {i + 1}/{len(items)}")
        params = {p["key"]: p.get("default") for p in t["params"] if "default" in p}
        params.update(rc.p.get("tool_params") or {})
        params[key] = aid
        done[aid] = _run_node(rc, tid, params)
    rc.result = {"kind": "batch", "tool_id": tid, "items": {k: {"assets": v["assets"], "sequences": v["sequences"]} for k, v in done.items()}}
    rc.model = f"batch:{tid}"


def templates_gallery(rc: RunCtx):
    rc.result = {"kind": "templates", "templates": [{"id": k, **v} for k, v in TEMPLATES.items()]}


PIPES = {f.__name__: f for f in [storyboard_film, video_extend, product_ad, thumbnail, storyboard_frames, safety_check, chapters, broll,
                                 lipsync_dub, translation_compare, workflow, template, batch, templates_gallery]}


def director_tool_list() -> str:
    lines = []
    for t in TOOLS.values():
        if t["output"] == "workflow":
            continue
        ins = ", ".join(f"{p['key']}({p['type']})" for p in t["params"][:6])
        lines.append(f"{t['id']}: {t['name']} — {ins}")
    return "\n".join(lines)


_ = (uuid, media, FF, to_srt, run_fal)
