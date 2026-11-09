"""Hosted engines (fal.ai, language model, YouTube) and the handler tables for local tools and pipelines."""
import os

from . import providers
from .run import RunCtx, ToolError

# ---------------------------------------------------------------- prompt direction (camera/lens/light words the models understand)

CAMERA_WORDS = {"static": "locked-off static camera", "push in": "slow dolly push-in", "pull out": "slow dolly pull-out",
                "pan left": "smooth pan left", "pan right": "smooth pan right", "tilt up": "tilt up", "tilt down": "tilt down",
                "orbit": "orbit around the subject", "crane up": "crane shot rising up", "tracking": "tracking shot following the subject",
                "handheld": "handheld camera with natural shake", "dolly zoom": "dolly zoom (vertigo effect)"}
DOF_WORDS = {"deep focus": "deep focus", "natural": "", "shallow": "shallow depth of field, soft background bokeh",
             "very shallow": "very shallow depth of field, creamy bokeh"}


def direct_video(p: dict, base: str | None = None) -> str:
    parts = [(base if base is not None else p.get("prompt", "")).strip()]
    if p.get("subject_motion"):
        parts.append(f"Action: {p['subject_motion'].strip()}.")
    shot = [x for x in (p.get("camera_angle"), f"{p['lens']} lens" if p.get("lens") else None, DOF_WORDS.get(p.get("depth_of_field") or "", "")) if x]
    if shot:
        parts.append("Shot: " + ", ".join(shot) + ".")
    if p.get("camera_move"):
        parts.append(f"Camera: {CAMERA_WORDS.get(p['camera_move'], p['camera_move'])}.")
    if p.get("lighting"):
        parts.append(f"Lighting: {p['lighting']}.")
    if p.get("motion") is not None:
        m = float(p["motion"])
        parts.append("Motion: " + ("very subtle, calm" if m < 0.25 else "gentle" if m < 0.5 else "dynamic" if m < 0.8 else "fast, energetic") + ".")
    return " ".join(x for x in parts if x)


def direct_image(p: dict, base: str | None = None) -> str:
    parts = [(base if base is not None else p.get("prompt", "")).strip()]
    if p.get("style"):
        parts.append(f"Style: {p['style']}.")
    if p.get("composition"):
        parts.append(f"Composition: {p['composition']}.")
    if p.get("lighting"):
        parts.append(f"Lighting: {p['lighting']}.")
    if p.get("lens"):
        parts.append(f"Shot on a {p['lens']} lens.")
    pal = p.get("palette")
    if pal and pal != "auto":
        from .registry import PALETTE
        cols = next((o["colors"] for o in PALETTE["options"] if o["id"] == pal), [])
        parts.append(f"Colour palette: {pal} ({', '.join(cols)}).")
    return " ".join(x for x in parts if x)


def tool_prompt(rc: RunCtx) -> str:
    """Turn each tool's controls into the instruction its model needs."""
    p, tid = rc.p, rc.tool["id"]
    if tid in ("001", "002", "004", "007", "009", "032"):
        if tid == "032":
            return direct_video(p, f"The character performs: {p.get('action', 'wave hello')}. {p.get('prompt') or ''}")
        return direct_video(p)
    if tid == "031":
        return direct_video(p, f"Bring this photo to life with subtle motion: {p.get('motion_preset', 'living portrait')}. Keep the composition and identity unchanged.")
    if tid == "003":
        return p.get("prompt") or "smooth natural transition between the two frames"
    if tid == "006":
        return p.get("prompt") or "natural, friendly delivery with subtle head motion"
    if tid == "010":
        return p.get("prompt", "")
    if tid in ("011", "019"):
        base = p.get("prompt", "")
        if tid == "019":
            base += ". Seamless tileable pattern, edges match perfectly, flat even lighting." if p.get("tile", True) else ". Texture."
        return direct_image(p, base)
    if tid == "013":
        return f"Keep exactly the same character (face, hair, build) as in the reference images. New scene: {p.get('prompt', '')}"
    if tid == "014":
        s = float(p.get("strength") or 0.7)
        return (f"Repaint this image in {p.get('style', 'watercolor')} style. Keep the layout, subjects and pose. "
                f"Style strength {int(s * 100)}%. {p.get('prompt') or ''}")
    if tid == "015":
        return (direct_image(p, f"{p.get('prompt', '')}. Format: {p.get('format', 'Instagram post')}.") +
                f' The design must include exactly this text, spelled correctly: "{p.get("text", "")}"')
    if tid == "016":
        return (f"Logo concept for the brand \"{p.get('brand', '')}\" ({p.get('industry') or 'a modern company'}). Mark type: {p.get('mark', 'symbol')}. "
                "Simple, scalable vector style on a plain background, centred, no mockup.") + (" " + direct_image({"palette": p.get("palette")}, ""))
    if tid == "017":
        return (f"Place this exact product in a {p.get('scene', 'marble studio')} scene, professional product photography, "
                f"{p.get('lighting', 'studio softbox')} lighting, keep the product's shape, label and colours exactly. {p.get('prompt') or ''}")
    if tid == "020":
        return f"Create a variation of this image. Amount of change: {int(float(p.get('amount') or 0.4) * 100)}%. {p.get('prompt') or ''}"
    if tid == "021":
        return f"Restyle this video as {p.get('style', 'anime')}. Keep motion, timing and composition. {p.get('prompt') or ''}"
    if tid == "024":
        return f"Remove {p.get('remove', 'the unwanted object')} from the video and fill the area naturally, consistent across frames."
    if tid == "025":
        bits = [f"Relight the scene with {p.get('lighting')} lighting" if p.get("lighting") else ""]
        if p.get("weather") and p["weather"] != "unchanged":
            bits.append(f"weather: {p['weather']}")
        if p.get("time_of_day") and p["time_of_day"] != "unchanged":
            bits.append(f"time of day: {p['time_of_day']}")
        return ", ".join(b for b in bits if b) + ". Keep people, motion and framing unchanged."
    if tid == "083":
        return f"Extend the image outward to fill a {p.get('expand', '16:9')} canvas. Continue the scene seamlessly. {p.get('prompt') or ''}"
    if tid == "085":
        return f"Relight this photo with {p.get('lighting', 'golden hour')} lighting coming from {p.get('direction', 45)} degrees. Keep everything else unchanged."
    if tid == "087":
        return p.get("prompt", "")
    if tid == "088":
        a = float(p.get("amount") or 0.4)
        return f"Natural portrait retouch ({int(a * 100)}% strength): even skin tone, reduce blemishes, brighten eyes; keep skin texture and identity."
    if tid == "042":
        inst = ", ".join(p.get("instruments") or [])
        return f"{p.get('prompt', '')}. Tempo {p.get('bpm', 96)} BPM. Instruments: {inst}. {'Instrumental, no vocals.' if p.get('instrumental', True) else ''}"
    if tid == "082":
        return f"In the masked area, replace with: {p.get('prompt')}. Blend naturally."
    return p.get("prompt", "") or ""


ASPECT_TO_FLUX = {"16:9": "landscape_16_9", "9:16": "portrait_16_9", "1:1": "square_hd", "4:5": "portrait_4_3", "3:2": "landscape_4_3", "21:9": "landscape_16_9"}


def _dur(m: dict, d) -> object:
    allowed = m.get("durations") or [5]
    d = min(allowed, key=lambda x: abs(x - float(d or allowed[0])))
    if m.get("duration_fmt") == "s":
        return f"{d}s"
    if m.get("duration_fmt") == "str":
        return str(d)
    return d


def fal_input(rc: RunCtx, m: dict) -> dict:
    p, fam = rc.p, m["family"]
    prompt = tool_prompt(rc)
    common = {k: p[k] for k in ("seed", "negative_prompt") if p.get(k) not in (None, "")}
    if fam in ("t2v", "i2v", "flf", "ref2v"):
        x = {"prompt": prompt, "duration": _dur(m, p.get("duration")), **common}
        if p.get("aspect_ratio"):
            x["aspect_ratio"] = p["aspect_ratio"]
        if p.get("resolution"):
            x["resolution"] = p["resolution"]
        if m.get("audio"):
            x["generate_audio"] = bool(p.get("generate_audio", True))
        if fam == "i2v":
            x["image_url"] = rc.url(rc.asset("image"))
        if fam == "flf":
            a, b = rc.url(rc.asset("image")), rc.url(rc.asset("tail_image"))
            x.update({"first_frame_url": a, "last_frame_url": b} if "veo" in m["id"] else {"image_url": a, "tail_image_url": b})
        if fam == "ref2v":
            x["image_urls"] = [rc.url(rc.asset_by_id(i)) for i in (p.get("references") or [])][:4]
        return x
    if fam == "avatar":
        return {"image_url": rc.url(rc.asset("image")), "audio_url": rc.url(rc.asset("audio")), "prompt": prompt}
    if fam == "lipsync":
        return {"video_url": rc.url(rc.asset("video")), "audio_url": rc.url(rc.asset("audio")), "sync_mode": p.get("sync_mode", "cut_off")}
    if fam == "motion":
        return {"image_url": rc.url(rc.asset("image")), "video_url": rc.url(rc.asset("video")), "prompt": prompt}
    if fam == "a2v":
        return {"audio_url": rc.url(rc.asset("audio")), "prompt": prompt, "aspect_ratio": p.get("aspect_ratio", "16:9")}
    if fam == "v2v":
        return {"video_url": rc.url(rc.asset("video")), "prompt": prompt}
    if fam == "upscale_v":
        return {"video_url": rc.url(rc.asset("video")), "target_resolution": "4k" if p.get("target") == "4K" else "1080p"}
    if fam == "t2i":
        x = {"prompt": prompt, "num_images": 1, **common}
        ar = p.get("aspect_ratio") or ("1:1" if rc.tool["id"] in ("016", "019") else "16:9")
        if "flux" in m["id"]:
            x["image_size"] = ASPECT_TO_FLUX.get(ar, "landscape_16_9")
        else:
            x["aspect_ratio"] = ar
        return x
    if fam == "i2i":
        refs = p.get("references") or ([p["image"]] if p.get("image") else [])
        x = {"prompt": prompt, "image_urls": [rc.url(rc.asset_by_id(i)) for i in refs][:4], "num_images": 1}
        if p.get("aspect_ratio"):
            x["aspect_ratio"] = p["aspect_ratio"]
        if rc.tool["id"] == "083":
            x["aspect_ratio"] = p.get("expand", "16:9")
        if rc.tool["id"] == "082" and rc.p.get("_mask_url"):
            x["mask_url"] = rc.p["_mask_url"]
        return x
    if fam == "upscale_i":
        return {"image_url": rc.url(rc.asset("image")), "scale": int(p.get("scale") or 4)}
    if fam == "tts":
        from ..ai_engines import VOICE_BY_ID
        return {"text": p.get("text", ""), **({"voice": p["voice_id"]} if p.get("voice_id") and p["voice_id"] not in VOICE_BY_ID else {})}
    if fam == "music":
        return {"prompt": prompt, "music_length_ms": int(float(p.get("duration") or 60) * 1000)}
    if fam == "sfx":
        return {"text": p.get("prompt", ""), "duration_seconds": float(p.get("duration") or 5)}
    if fam == "v2sfx":
        return {"video_url": rc.url(rc.asset("video")), **({"prompt": p["prompt"]} if p.get("prompt") else {})}
    if fam == "s2s":
        return {"source_audio_url": rc.url(rc.asset("audio")), "target_voice_audio_url": rc.url(rc.asset("target_voice"))}
    if fam == "stems":
        return {"audio_url": rc.url(rc.asset("audio"))}
    if fam == "t23d":
        return {"prompt": p.get("prompt", "")}
    if fam == "i23d":
        u = rc.url(rc.asset("image"))
        return {"input_image_url": u, "image_url": u}
    if fam == "rig":
        return {"model_url": p.get("model_url")}
    if fam == "t2motion":
        return {"prompt": p.get("prompt", ""), "duration": float(p.get("duration") or 5)}
    if fam == "vqa":
        return {"video_url": rc.url(rc.asset("video")), "prompt": p.get("question", "")}
    if fam == "dub":
        a = rc.asset("video")
        return {("video_url" if a.kind == "video" else "audio_url"): rc.url(a), "target_lang": p.get("target", "hi")}
    raise ToolError(f"model family {fam} not wired")


OUT_KIND = {"t2v": "video", "i2v": "video", "flf": "video", "ref2v": "video", "avatar": "video", "lipsync": "video", "motion": "video",
            "a2v": "video", "v2v": "video", "upscale_v": "video", "t2i": "image", "i2i": "image", "upscale_i": "image",
            "tts": "audio", "music": "audio", "sfx": "audio", "v2sfx": "video", "s2s": "audio", "stems": "audio", "dub": "video",
            "t23d": "model3d", "i23d": "model3d", "rig": "model3d", "t2motion": "model3d"}


def pick_model(rc: RunCtx, models: list[dict]) -> dict:
    m = next((x for x in models if x["id"] == rc.model), None) or models[0]
    rc.model = m["id"]
    return m


def call_fal(rc: RunCtx, m: dict, payload: dict, lo=0.05, hi=0.9) -> dict:
    return providers.fal_run(m["id"], payload, progress=lambda f, s: rc.progress(lo + (hi - lo) * f, s), should_cancel=rc.cancelled)


def save_fal_files(rc: RunCtx, out: dict, kind: str, name: str, limit: int = 8) -> list[str]:
    files = providers.output_urls(out)
    if kind == "video":
        files = [f for f in files if "video" in f["content_type"] or f["url"].split("?")[0].lower().endswith((".mp4", ".mov", ".webm"))] or files
    elif kind == "image":
        files = [f for f in files if "image" in f["content_type"] or f["url"].split("?")[0].lower().endswith((".png", ".jpg", ".jpeg", ".webp"))] or files
    elif kind == "audio":
        files = [f for f in files if "audio" in f["content_type"] or f["url"].split("?")[0].lower().endswith((".wav", ".mp3", ".m4a", ".flac", ".ogg"))] or files
    if not files:
        raise ToolError("The model finished but returned no file")
    paths = []
    for i, f in enumerate(files[:limit]):
        ext = os.path.splitext(f["url"].split("?")[0])[1].lower()
        if not ext or len(ext) > 5:
            ext = {"video": ".mp4", "image": ".png", "audio": ".mp3", "model3d": ".glb"}.get(kind, ".bin")
        path = rc.path(f"fal{len(rc.outputs)}_{i}{ext}")
        providers.download(f["url"], path)
        label = name if len(files) == 1 else f"{name} {i + 1}"
        if kind == "model3d":
            rc.add(path, "model3d", label, ai=True)
        else:
            rc.add(path, kind, label, ai=True)
        paths.append(path)
    return paths


def short_name(rc: RunCtx) -> str:
    base = (rc.p.get("prompt") or rc.p.get("text") or rc.p.get("product_name") or rc.tool["name"]).strip().replace("\n", " ")
    return f"{rc.tool['name']} — {base[:40]}"


def run_fal(rc: RunCtx):
    models = rc.tool["engine"].get("models") or []
    m = pick_model(rc, models)
    kind = OUT_KIND[m["family"]]
    n = max(1, min(4, int(rc.p.get("variations") or 1)))
    if rc.tool["id"] == "082":  # inpaint with replacement prompt: upload the mask so the model can read it
        rc.p["_mask_url"] = rc.put_url(_mask_png(rc))
    for i in range(n):
        if rc.cancelled():
            raise providers.Cancelled()
        payload = fal_input(rc, m)
        if n > 1 and "seed" in payload:
            payload["seed"] = int(payload["seed"]) + i
        out = call_fal(rc, m, payload, 0.05 + 0.85 * i / n, 0.05 + 0.85 * (i + 1) / n)
        save_fal_files(rc, out, kind, short_name(rc) + (f" v{i + 1}" if n > 1 else ""))
        if kind == "model3d":
            rc.result["model_files"] = [o["name"] for o in rc.outputs]
        if m["family"] == "vqa":
            rc.result = {"answer": out.get("output") or out.get("answer") or out.get("text") or out}


def _mask_png(rc: RunCtx) -> str:
    import base64
    data = rc.p.get("mask") or ""
    if not data.startswith("data:image/png;base64,"):
        raise ToolError("Paint over the area to change first")
    path = rc.path("mask.png")
    with open(path, "wb") as f:
        f.write(base64.b64decode(data.split(",", 1)[1]))
    return path


# ---------------------------------------------------------------- language-model tools

LANG_HINT = lambda p: f" Write in {p.get('language') or 'English'} (language code {p.get('language') or 'en'}; 'hi' means Hindi in Devanagari)."  # noqa: E731

TASKS = {
    "script": ("You are a senior YouTube scriptwriter for Indian creators.",
               "Write a {format} script. Brief: {brief}\nTone: {tone}. Audience: {audience}. Length: {length}.",
               '{"title": str, "logline": str, "scenes": [{"heading": str, "narration": str, "visuals": str, "on_screen_text": str, "duration_s": number}], "cta": str}'),
    "hooks": ("You write scroll-stopping video hooks.", "Write {count} different opening hooks (first 3 seconds). Brief: {brief}. Tone: {tone}. Audience: {audience}.",
              '{"items": [{"text": str, "technique": str, "score": number(1-10), "why": str}]}'),
    "titles": ("You are a YouTube packaging expert.", "Write {count} titles under 70 characters. Brief: {brief}. Tone: {tone}. Audience: {audience}.",
               '{"items": [{"text": str, "curiosity": number(1-10), "clarity": number(1-10), "chars": number, "why": str}]}'),
    "description": ("You write YouTube descriptions that rank.", "Write an SEO description and tags. Brief: {brief}. Links to include: {links}.",
                    '{"description": str, "tags": [str], "hashtags": [str], "keywords": [str]}'),
    "outline": ("You are a story editor.", "Outline this as a {structure} story. Brief: {brief}. Tone: {tone}. Audience: {audience}.",
                '{"title": str, "beats": [{"name": str, "summary": str, "purpose": str, "minutes": number}]}'),
    "dialogue": ("You write natural, funny, culturally specific dialogue.", "Write a {length} scene. Brief: {brief}. Characters: {characters}. Tone: {tone}.",
                 '{"title": str, "setting": str, "lines": [{"character": str, "line": str, "direction": str}]}'),
    "shotlist": ("You are a director of photography.", "Break this script into shots for a {aspect_ratio} video:\n{script}",
                 '{"shots": [{"prompt": str, "camera_move": one of [static, push in, pull out, pan left, pan right, tilt up, tilt down, orbit, crane up, tracking, handheld], "camera_angle": str, "lens": str, "duration": number(4-10), "narration": str}]}'),
    "prompt": ("You write prompts for state-of-the-art {target} generation models (Veo, Kling, FLUX).",
               "Turn this idea into 3 precise prompts in {style} style. Include subject, action, setting, camera, lens, light, mood. Idea: {prompt}",
               '{"items": [{"text": str, "why": str}]}'),
    "social": ("You are a social media copywriter.", "Write posts for {platforms}. Brief: {brief}. Tone: {tone}. Audience: {audience}.",
               '{"items": [{"platform": str, "text": str, "hashtags": [str]}]}'),
    "rewrite": ("You are an editor.", "Rewrite to be {goal}, tone {tone}:\n{text}", '{"text": str, "changes": [str]}'),
    "title_ab": ("You are a YouTube packaging analyst. Be honest; these are judgments, not predictions of real click-through rate.",
                 "Compare these titles for audience {audience}:\n{titles}",
                 '{"items": [{"text": str, "clarity": number(1-10), "curiosity": number(1-10), "specificity": number(1-10), "chars": number, "verdict": str}], "winner": str, "why": str}'),
    "seo": ("You are a YouTube SEO analyst.", "Grade this metadata for keyword '{keyword}'. Title: {title}\nDescription: {description}\nTags: {tags}",
            '{"score": number(0-100), "checks": [{"name": str, "pass": bool, "detail": str}], "improved_title": str, "improved_tags": [str]}'),
    "calendar": ("You are a content strategist.", "Plan 4 weeks, {per_week} uploads per week, for niche {niche}, audience {audience}.",
                 '{"weeks": [{"week": number, "items": [{"day": str, "format": str, "title": str, "hook": str}]}]}'),
    "director": ("You are the Director Agent of a creative studio. You plan workflows using ONLY the tools listed.",
                 "Brief: {brief}\nMax model spend: ${budget_usd}.\nAvailable tools (id: name — inputs):\n{tool_list}\n"
                 "Plan a workflow graph. Each node uses one tool id and params; connect outputs to inputs with edges.",
                 '{"summary": str, "nodes": [{"id": str, "tool_id": str, "params": object, "note": str}], "edges": [{"from": str, "to": str, "input": str}], "est_cost_usd": number}'),
}


class _Safe(dict):
    def __missing__(self, k):
        return ""


def run_llm(rc: RunCtx, task: str, extra: dict | None = None) -> dict:
    sys, user, schema = TASKS[task]
    vals = _Safe({k: (", ".join(v) if isinstance(v, list) else v) for k, v in {**rc.p, **(extra or {})}.items()})
    rc.progress(0.2, "writing")
    out, model = providers.llm_json(sys.format_map(vals) + LANG_HINT(rc.p) + "\nReply with ONE JSON object only, matching: " + schema,
                                    user.format_map(vals))
    rc.model = model
    rc.result = {"kind": task, **out}
    return out


# ---------------------------------------------------------------- YouTube Data API tools


def _channel_id(ref: str) -> str:
    ref = ref.strip().rstrip("/")
    if "/channel/" in ref:
        return ref.split("/channel/")[1].split("/")[0]
    handle = ref.split("/")[-1]
    if not handle.startswith("@"):
        handle = "@" + handle
    j = providers.yt_get("channels", part="id", forHandle=handle)
    if not j.get("items"):
        raise ToolError(f"Channel {ref} not found")
    return j["items"][0]["id"]


def _channel(ref: str, n: int = 25) -> dict:
    cid = _channel_id(ref)
    ch = providers.yt_get("channels", part="snippet,statistics,contentDetails", id=cid)["items"][0]
    up = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    items = providers.yt_get("playlistItems", part="contentDetails", playlistId=up, maxResults=n).get("items", [])
    vids = [i["contentDetails"]["videoId"] for i in items]
    vd = providers.yt_get("videos", part="snippet,statistics,contentDetails", id=",".join(vids)).get("items", []) if vids else []
    videos = [{"id": v["id"], "title": v["snippet"]["title"], "published": v["snippet"]["publishedAt"],
               "views": int(v["statistics"].get("viewCount", 0)), "likes": int(v["statistics"].get("likeCount", 0)),
               "comments": int(v["statistics"].get("commentCount", 0)), "duration": v["contentDetails"]["duration"]} for v in vd]
    st = ch["statistics"]
    return {"id": cid, "title": ch["snippet"]["title"], "subscribers": int(st.get("subscriberCount", 0)),
            "views": int(st.get("viewCount", 0)), "video_count": int(st.get("videoCount", 0)), "recent": videos}


def _iso_minutes(d: str) -> float:
    import re
    h, m, s = (int(x or 0) for x in re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d).groups())
    return h * 60 + m + s / 60


def run_youtube(rc: RunCtx, task: str):
    import os
    from .registry import local_llm_only
    if task in ("channel", "strategy", "compare") and (not os.environ.get("YOUTUBE_API_KEY") or (task != "compare" and local_llm_only())
                                                       or (task != "compare" and not providers.llm_ready())):
        from . import yt_free
        return yt_free.run(rc, task)   # public feeds + rules: no key, nothing invented
    p = rc.p
    rc.progress(0.1, "reading public YouTube data")
    if task in ("channel", "strategy"):
        ch = _channel(p["channel"])
        vids = ch["recent"]
        shorts = [v for v in vids if _iso_minutes(v["duration"]) <= 1]
        data = {"channel": ch, "stats": {"avg_views_recent": round(sum(v["views"] for v in vids) / max(1, len(vids))),
                                         "shorts_share": round(len(shorts) / max(1, len(vids)), 2),
                                         "top": sorted(vids, key=lambda v: -v["views"])[:5]}}
        rc.progress(0.5, "analysing")
        out, model = providers.llm_json(
            "You are a YouTube strategist. Use only the data given; say when data is insufficient. Reply with one JSON object.",
            f"Goal: {p.get('goal') or 'grow the channel'}\nData: {providers.json.dumps(data)[:20000]}\n"
            'Return {"summary": str, "findings": [{"finding": str, "evidence": str}], "actions": [{"action": str, "priority": "high|medium|low", "why": str}]}')
        rc.model = f"YouTube Data API + {model}"
        rc.result = {"kind": task, **data, **out}
        return
    if task == "compare":
        chans = [c for c in p.get("channels", "").splitlines() if c.strip()][:4]
        rows = []
        for i, c in enumerate(chans):
            rc.progress(0.1 + 0.6 * i / max(1, len(chans)), f"reading {c.strip()}")
            ch = _channel(c, 15)
            v = ch["recent"]
            rows.append({"title": ch["title"], "subscribers": ch["subscribers"], "videos": ch["video_count"],
                         "avg_recent_views": round(sum(x["views"] for x in v) / max(1, len(v))),
                         "uploads_last_15": len(v), "top_title": max(v, key=lambda x: x["views"])["title"] if v else ""})
        rc.model = "YouTube Data API"
        rc.result = {"kind": "compare", "rows": rows}
        return
    if task == "trends":
        cats = {"music": "10", "gaming": "20", "education": "27", "entertainment": "24", "tech": "28", "news": "25"}
        q = {"part": "snippet,statistics", "chart": "mostPopular", "regionCode": p.get("region", "IN"), "maxResults": 25}
        if p.get("category") in cats:
            q["videoCategoryId"] = cats[p["category"]]
        items = providers.yt_get("videos", **q).get("items", [])
        rc.model = "YouTube Data API"
        rc.result = {"kind": "trends", "rows": [{"title": v["snippet"]["title"], "channel": v["snippet"]["channelTitle"],
                                                  "views": int(v["statistics"].get("viewCount", 0)), "id": v["id"]} for v in items]}
        return
    if task in ("topics", "opportunity"):
        j = providers.yt_get("search", part="snippet", q=p["niche"], type="video", order="viewCount", regionCode=p.get("region", "IN"),
                             publishedAfter=_days_ago(30), maxResults=25)
        ids = [i["id"]["videoId"] for i in j.get("items", [])]
        vd = providers.yt_get("videos", part="snippet,statistics", id=",".join(ids)).get("items", []) if ids else []
        data = [{"title": v["snippet"]["title"], "channel": v["snippet"]["channelTitle"], "views": int(v["statistics"].get("viewCount", 0))} for v in vd]
        rc.progress(0.5, "finding gaps")
        out, model = providers.llm_json(
            "You are a content strategist. Ground every topic in the given videos. Reply with one JSON object.",
            f"Niche: {p['niche']}. Recent top videos (30 days):\n{providers.json.dumps(data)[:15000]}\n"
            'Return {"topics": [{"topic": str, "demand": number(1-10), "competition": number(1-10), "angle": str, "evidence": [str]}]}')
        rc.model = f"YouTube Data API + {model}"
        rc.result = {"kind": task, "videos": data, **out}
        return
    raise ToolError("unknown task")


def _days_ago(n: int) -> str:
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime("%Y-%m-%dT%H:%M:%SZ")


def __getattr__(name):  # lazy: pipelines imports this module, so it cannot be imported at load time
    if name == "LOCAL":
        from .local import LOCAL
        return LOCAL
    if name == "PIPES":
        from .pipelines import PIPES
        return PIPES
    raise AttributeError(name)
