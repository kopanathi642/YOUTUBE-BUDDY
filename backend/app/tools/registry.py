"""The AI Generator Universe tool registry: exactly 120 tools in 12 studios (10 each), ids 001-120.

Every tool declares how it really runs:
  local     - runs on our own worker (FFmpeg, Piper, Whisper, rembg, OpenCV, Pillow). No extra cost.
  fal       - a hosted model on fal.ai (Veo, Kling, Seedance, MiniMax, FLUX, ElevenLabs...). Needs FAL_KEY. Paid per use.
  llm       - a language model (Anthropic Claude or OpenAI). Needs ANTHROPIC_API_KEY or OPENAI_API_KEY.
  youtube   - public YouTube Data API v3 + an LLM. Needs YOUTUBE_API_KEY (+ LLM key).
  pipeline  - a chain of the above; ready only when every step it needs is ready.
  unbuilt   - listed honestly with what it still needs; never runs.
Status is computed from the environment at request time, so the UI never offers a tool that cannot run.
"""
import os

# ---------------------------------------------------------------- parameter helpers


def P(key: str, type: str, label: str, **kw) -> dict:
    return {"key": key, "type": type, "label": label, **kw}


def prompt(label="Prompt", ph="Describe the shot…", required=True, max=2000):
    return P("prompt", "prompt", label, placeholder=ph, required=required, max=max)


def media(key="video", label="Source video", accept=("video",), required=True, **kw):
    return P(key, "media", label, accept=list(accept), required=required, **kw)


NEG = P("negative_prompt", "text", "Avoid", placeholder="blurry, extra fingers, watermark", group="advanced")
SEED = P("seed", "seed", "Seed", group="advanced", help="Same seed + same settings = repeatable result (where the model supports it)")
ASPECT_V = P("aspect_ratio", "aspect", "Aspect ratio", options=["16:9", "9:16", "1:1"], default="16:9")
ASPECT_I = P("aspect_ratio", "aspect", "Aspect ratio", options=["16:9", "9:16", "1:1", "4:5", "3:2", "21:9"], default="16:9")
DUR = P("duration", "duration", "Duration", options=[5, 8, 10], default=5, unit="s")
RES_V = P("resolution", "chips", "Resolution", options=["720p", "1080p"], default="720p")
FPS = P("fps", "chips", "Frame rate", options=[24, 30], default=24, group="advanced", help="Generated clips are conformed to this rate on import")
AUDIO = P("generate_audio", "toggle", "Native audio", default=True, help="Models that support it create matching sound")
CAMERA = P("camera_move", "camera_move", "Camera movement", default="static", options=[
    "static", "push in", "pull out", "pan left", "pan right", "tilt up", "tilt down", "orbit", "crane up", "tracking", "handheld", "dolly zoom"])
ANGLE = P("camera_angle", "chips", "Camera angle", default="eye level", options=[
    "eye level", "low angle", "high angle", "overhead", "dutch angle", "close-up", "wide shot", "over the shoulder"])
LENS = P("lens", "lens", "Lens", default="35mm", options=["14mm", "24mm", "35mm", "50mm", "85mm", "135mm", "macro"])
DOF = P("depth_of_field", "chips", "Depth of field", default="natural", options=["deep focus", "natural", "shallow", "very shallow"])
LIGHT = P("lighting", "lighting", "Lighting", default="soft daylight", options=[
    "soft daylight", "golden hour", "blue hour", "harsh noon", "studio softbox", "rim light", "neon", "candlelight", "moonlight", "volumetric fog"])
MOTION = P("motion", "slider", "Motion intensity", min=0, max=1, step=0.1, default=0.5)
SUBJECT = P("subject_motion", "text", "Subject movement", placeholder="she turns and smiles at the camera")
VARIATIONS = P("variations", "stepper", "Variations", min=1, max=4, default=1, help="Each variation is a separate paid generation")
STYLE = P("style", "style", "Art style", default="cinematic photo", options=[
    "cinematic photo", "editorial", "anime", "3D render", "watercolor", "oil painting", "comic", "pixel art", "low poly", "line art",
    "claymation", "vaporwave", "Indian miniature", "Madhubani", "Bollywood poster", "documentary"])
PALETTE = P("palette", "palette", "Colour palette", default="auto", options=[
    {"id": "auto", "colors": []}, {"id": "warm sunset", "colors": ["#ff7a59", "#ffb347", "#ffd56b", "#7a2e3b"]},
    {"id": "teal & orange", "colors": ["#0f4c5c", "#21a0a0", "#f4a259", "#e36414"]},
    {"id": "pastel", "colors": ["#ffd6e0", "#c1f0f6", "#d4f8d4", "#fdf3c4"]},
    {"id": "neon night", "colors": ["#0d0221", "#ff2a6d", "#05d9e8", "#d1f7ff"]},
    {"id": "earthy", "colors": ["#4a3f35", "#8c6e54", "#c2a878", "#e9dcc9"]},
    {"id": "monochrome", "colors": ["#111111", "#555555", "#aaaaaa", "#eeeeee"]},
    {"id": "festive India", "colors": ["#ff9933", "#e4007c", "#138808", "#ffd700"]}])
COMPOSITION = P("composition", "chips", "Composition", default="rule of thirds", options=[
    "centered", "rule of thirds", "symmetrical", "leading lines", "negative space", "close-up portrait", "flat lay"])
LANG = P("language", "language", "Language", default="en")
LANGS = P("targets", "languages", "Target languages", default=["hi"], min_items=1, max_items=6)
VOICE = P("voice_id", "voice", "Voice")
TONE = P("tone", "chips", "Tone", default="friendly", options=["friendly", "energetic", "calm", "funny", "serious", "inspiring", "dramatic"])
AUDIENCE = P("audience", "text", "Audience", placeholder="Indian students preparing for exams")
LENGTH = P("length", "chips", "Length", default="medium", options=["short", "medium", "long"])
BRIEF = P("brief", "longtext", "Brief", placeholder="What is it about? Key points, call to action…", required=True, max=6000)
CHANNEL = P("channel", "text", "Channel", placeholder="youtube.com/channel/UC… link or channel ID", required=True)
REGION = P("region", "chips", "Region", default="IN", options=["IN", "US", "GB", "AE", "SG", "CA", "AU"])


# ---------------------------------------------------------------- model catalogue (fal.ai endpoint ids)

def M(id, label, family, usd_per_s=None, usd_per_run=None, **kw):
    return {"id": id, "label": label, "family": family, "usd_per_s": usd_per_s, "usd_per_run": usd_per_run, **kw}


T2V = [M("fal-ai/veo3.1", "Google Veo 3.1", "t2v", 0.40, duration_fmt="s", durations=[4, 6, 8], audio=True, tier="best"),
       M("fal-ai/veo3.1/fast", "Google Veo 3.1 Fast", "t2v", 0.15, duration_fmt="s", durations=[4, 6, 8], audio=True, tier="fast"),
       M("fal-ai/kling-video/v3/pro/text-to-video", "Kling 3.0 Pro", "t2v", 0.168, duration_fmt="str", durations=[5, 10], audio=True),
       M("bytedance/seedance-2.0/fast/text-to-video", "Seedance 2.0 Fast", "t2v", 0.2419, durations=[5, 10], audio=True),
       M("minimax/h3/text-to-video", "MiniMax Hailuo H3", "t2v", 0.13, durations=[6, 10]),
       M("fal-ai/kling-video/v2.5-turbo/pro/text-to-video", "Kling 2.5 Turbo (budget)", "t2v", 0.07, duration_fmt="str", durations=[5, 10], tier="budget"),
       M("alibaba/wan-3.0/text-to-video", "Wan 3.0", "t2v", None, durations=[5])]
I2V = [M("fal-ai/kling-video/v3/pro/image-to-video", "Kling 3.0 Pro", "i2v", 0.168, duration_fmt="str", durations=[5, 10], audio=True, tier="best"),
       M("fal-ai/veo3.1/image-to-video", "Google Veo 3.1", "i2v", 0.40, duration_fmt="s", durations=[4, 6, 8], audio=True),
       M("bytedance/seedance-2.0/fast/image-to-video", "Seedance 2.0 Fast", "i2v", 0.2419, durations=[5, 10], audio=True),
       M("minimax/h3/image-to-video", "MiniMax Hailuo H3", "i2v", 0.13, durations=[6, 10]),
       M("fal-ai/kling-video/v2.5-turbo/pro/image-to-video", "Kling 2.5 Turbo (budget)", "i2v", 0.07, duration_fmt="str", durations=[5, 10], tier="budget")]
FLF = [M("fal-ai/kling-video/v3/pro/image-to-video", "Kling 3.0 Pro (start + end frame)", "flf", 0.168, duration_fmt="str", durations=[5, 10]),
       M("fal-ai/veo3.1/first-last-frame-to-video", "Google Veo 3.1 (first + last frame)", "flf", 0.40, duration_fmt="s", durations=[8])]
REF2V = [M("fal-ai/kling-video/o3/pro/reference-to-video", "Kling O3 Pro reference", "ref2v", None, duration_fmt="str", durations=[5, 10]),
         M("minimax/h3/reference-to-video", "MiniMax H3 reference", "ref2v", None, durations=[6]),
         M("alibaba/wan-3.0-prime/reference-to-video", "Wan 3.0 Prime reference", "ref2v", None, durations=[5])]
AVATAR = [M("fal-ai/kling-video/ai-avatar/v2/pro", "Kling AI Avatar v2 Pro", "avatar", None),
          M("fal-ai/bytedance/omnihuman/v1.5", "OmniHuman 1.5", "avatar", None)]
LIPSYNC = [M("fal-ai/sync-lipsync/v3", "Sync Lipsync 3", "lipsync", None),
           M("fal-ai/kling-video/lipsync/audio-to-video", "Kling LipSync", "lipsync", None)]
MOTION_CTRL = [M("fal-ai/kling-video/v3/pro/motion-control", "Kling 3.0 Motion Control", "motion", None)]
A2V = [M("fal-ai/ltx-2.3/audio-to-video", "LTX 2.3 audio-to-video", "a2v", None)]
V2V = [M("fal-ai/kling-video/o3/pro/video-to-video/edit", "Kling O3 Pro video edit", "v2v", None)]
UPSCALE_V = [M("fal-ai/bytedance-upscaler/upscale/video", "ByteDance video upscaler", "upscale_v", None)]
T2I = [M("fal-ai/nano-banana-pro", "Nano Banana Pro (Gemini)", "t2i", usd_per_run=0.15, tier="best"),
       M("fal-ai/flux-2-pro", "FLUX.2 Pro", "t2i", usd_per_run=0.05),
       M("openai/gpt-image-2", "GPT Image 2 (best text)", "t2i", usd_per_run=0.08),
       M("fal-ai/flux/schnell", "FLUX Schnell (fast, budget)", "t2i", usd_per_run=0.003, tier="budget")]
I2I = [M("fal-ai/nano-banana-pro/edit", "Nano Banana Pro edit", "i2i", usd_per_run=0.15, tier="best"),
       M("openai/gpt-image-2/edit", "GPT Image 2 edit", "i2i", usd_per_run=0.08),
       M("fal-ai/nano-banana/edit", "Nano Banana edit (budget)", "i2i", usd_per_run=0.04, tier="budget")]
UPSCALE_I = [M("fal-ai/esrgan", "Real-ESRGAN", "upscale_i", usd_per_run=0.002)]
TTS = [M("elevenlabs/tts/eleven-v4", "ElevenLabs v4", "tts", None), M("fal-ai/minimax/speech-2.8-hd", "MiniMax Speech 2.8 HD", "tts", None)]
MUSIC = [M("fal-ai/elevenlabs/music", "ElevenLabs Music", "music", None)]
SFX = [M("fal-ai/elevenlabs/sound-effects/v2", "ElevenLabs SFX v2", "sfx", None)]
V2SFX = [M("mirelo-ai/sfx-v1.5/video-to-audio", "Mirelo SFX 1.5", "v2sfx", None), M("sonilo/v1.1/video-to-sound-effects", "Sonilo 1.1", "v2sfx", None)]
S2S = [M("resemble-ai/chatterboxhd/speech-to-speech", "Chatterbox HD speech-to-speech", "s2s", None)]
STEMS = [M("fal-ai/demucs", "Demucs stem separation", "stems", None)]
T23D = [M("tripo3d/h3.1/text-to-3d", "Tripo H3.1", "t23d", None)]
I23D = [M("fal-ai/hunyuan-3d/v3.1/pro/image-to-3d", "Hunyuan3D 3.1 Pro", "i23d", None), M("fal-ai/trellis-2", "TRELLIS 2", "i23d", None)]
RIG = [M("fal-ai/meshy/rigging", "Meshy rigging", "rig", None)]
T2MOTION = [M("fal-ai/hunyuan-motion", "Hunyuan Motion", "t2motion", None)]
VQA = [M("fal-ai/video-understanding", "Video understanding", "vqa", None)]
DETECT = [M("fal-ai/moondream3-preview/detect", "Moondream 3 detect", "detect", None)]
NSFW = [M("fal-ai/imageutils/nsfw", "NSFW image check", "nsfw", None)]
DUB_EL = [M("fal-ai/elevenlabs/dubbing", "ElevenLabs Dubbing (voice-preserving)", "dub", None)]


def local(handler, note="Runs on our worker — no extra cost", **kw):
    return {"type": "local", "handler": handler, "note": note, **kw}


def fal(models, note=None, **kw):
    return {"type": "fal", "models": models, "note": note or "Hosted model on fal.ai — billed per use", **kw}


def llm(task, note="Language model (Groq, Claude, OpenAI or local)", **kw):
    return {"type": "llm", "task": task, "note": note, **kw}


def pipe(handler, needs, note, models=None, **kw):
    return {"type": "pipeline", "handler": handler, "needs": needs, "note": note, "models": models or [], **kw}


def yt(task, note="Public YouTube Data API + language model", free=False):
    """free=True: works without keys from the channel's public uploads feed (engines.run_youtube -> yt_free)."""
    return {"type": "youtube", "task": task, "note": note, "free": free}


def unbuilt(reason):
    return {"type": "unbuilt", "note": reason}


WHISPER_NOTE = "Runs on our worker (Whisper; downloads the model on first use) — or OpenAI Whisper with your key"

STUDIOS = [
    {"id": "video", "code": "A", "name": "AI Video Generation", "tagline": "Direct cinematic shots from words and images"},
    {"id": "image", "code": "B", "name": "AI Image Generation", "tagline": "Art-direct images on a live artboard"},
    {"id": "transform", "code": "C", "name": "AI Video Transformation", "tagline": "Restyle, relight and rebuild existing footage"},
    {"id": "animation", "code": "D", "name": "AI Animation", "tagline": "Bring characters, photos and type to life"},
    {"id": "audio", "code": "E", "name": "AI Audio & Music", "tagline": "Voices, music and sound on a multitrack bench"},
    {"id": "writing", "code": "F", "name": "AI Creative Writing", "tagline": "Scripts, hooks and stories in a writer's room"},
    {"id": "content", "code": "G", "name": "AI Content Intelligence", "tagline": "See inside your media, scene by scene"},
    {"id": "creator", "code": "H", "name": "AI Creator Intelligence", "tagline": "Strategy from real channel and trend data"},
    {"id": "imageedit", "code": "I", "name": "AI Image Editing", "tagline": "Layer, mask, inpaint and relight"},
    {"id": "videointel", "code": "J", "name": "AI Video Intelligence", "tagline": "Edits that understand your footage"},
    {"id": "localize", "code": "K", "name": "AI Localization", "tagline": "Subtitles, translation and dubbing in many languages"},
    {"id": "automation", "code": "L", "name": "AI Creative Automation", "tagline": "Wire tools into pipelines that run themselves"},
]

_T: list[dict] = []


def T(num, slug, name, studio, summary, engine, params, output, timeline=False, **kw):
    _T.append({"id": f"{num:03d}", "slug": slug, "name": name, "studio": studio, "summary": summary, "engine": engine,
               "params": params, "output": output, "timeline": timeline, **kw})


SHOT_CTRL = [CAMERA, ANGLE, LENS, DOF, LIGHT, MOTION, SUBJECT]

# ---------------------------------------------------------------- A. AI Video Generation (001-010)
T(1, "text-to-video", "Text to Video", "video", "Write a scene, direct the camera, get a cinematic clip.",
  fal(T2V), [prompt(), *SHOT_CTRL, ASPECT_V, DUR, RES_V, FPS, AUDIO, NEG, SEED, VARIATIONS], "video", True, ui="director")
T(2, "image-to-video", "Image to Video", "video", "Animate a still with directed camera and subject motion.",
  fal(I2V), [media("image", "Start frame", ("image",)), prompt("Motion prompt", "the waves roll in, hair moves in the wind"),
             CAMERA, MOTION, SUBJECT, ASPECT_V, DUR, AUDIO, NEG, SEED, VARIATIONS], "video", True, ui="refmotion")
T(3, "first-last-frame", "First & Last Frame", "video", "Give the opening and closing frames; the model invents the journey between.",
  fal(FLF), [media("image", "First frame", ("image",)), media("tail_image", "Last frame", ("image",)),
             prompt("Transition", "smooth morph as the camera flies through"), DUR, NEG, SEED], "video", True, ui="keyframes2")
T(4, "reference-to-video", "Reference to Video", "video", "Keep the same character, product or place across shots using reference images.",
  fal(REF2V), [P("references", "media_multi", "Reference board", accept=["image"], min_items=1, max_items=4, required=True),
               prompt(), *SHOT_CTRL[:3], ASPECT_V, DUR, NEG, SEED], "video", True, ui="refboard")
T(5, "storyboard-film", "Multi-Shot Film Builder", "video", "Compose several shots on a storyboard, generate each, and get one stitched film.",
  pipe("storyboard_film", ["fal"], "Generates every shot on fal.ai, stitches on our worker", models=T2V),
  [P("shots", "shots", "Shots", min_items=2, max_items=8, required=True), ASPECT_V, RES_V, AUDIO, SEED], "video", True, ui="shotbuilder")
T(6, "talking-avatar", "Talking Avatar", "video", "A portrait that speaks your voice-over, with natural head and lip motion.",
  fal(AVATAR), [media("image", "Portrait", ("image",)), media("audio", "Voice track", ("audio",)),
                prompt("Performance notes", "warm, nods while explaining", required=False)], "video", True, ui="avatar",
  consent=True)
T(7, "video-extend", "Video Extend", "video", "Continue a clip past its last frame for as long as you need.",
  pipe("video_extend", ["fal"], "Takes your last frame on our worker, continues it on fal.ai, joins both", models=I2V),
  [media(), prompt("What happens next", "the camera keeps rising above the city"), DUR, CAMERA], "video", True, ui="extend")
T(8, "product-ad", "Product Ad Video", "video", "Turn a product photo into an ad shot with an end card.",
  pipe("product_ad", ["fal"], "Animates on fal.ai, end card rendered on our worker", models=I2V),
  [media("image", "Product photo", ("image",)), P("product_name", "text", "Product name", required=True),
   P("tagline", "text", "Tagline", placeholder="Fresh coffee, every morning"),
   P("ad_style", "chips", "Ad style", default="premium studio", options=["premium studio", "lifestyle", "unboxing", "festive", "tech launch"]),
   CAMERA, ASPECT_V, DUR, P("brand_color", "color", "Brand colour", default="#7c3aed")], "video", True, ui="adbuilder")
T(9, "motion-transfer", "Motion Transfer", "video", "Make a character in a photo perform the moves from a reference video.",
  fal(MOTION_CTRL), [media("image", "Character", ("image",)), media("video", "Motion reference", ("video",)),
                     prompt("Scene notes", required=False)], "video", True, ui="motionref", consent=True)
T(10, "audio-to-video", "Music to Video", "video", "Generate visuals that follow the rhythm and mood of a track.",
  fal(A2V), [media("audio", "Music or audio", ("audio",)), prompt("Visual world", "neon city at night, rain"), ASPECT_V],
  "video", True, ui="audioviz")

# ---------------------------------------------------------------- B. AI Image Generation (011-020)
IMG_CTRL = [STYLE, PALETTE, COMPOSITION, LIGHT, LENS]
T(11, "text-to-image", "Text to Image", "image", "Art-direct an image: style, palette, light, lens and composition.",
  fal(T2I), [prompt(ph="A chai stall at dawn in old Delhi"), *IMG_CTRL, ASPECT_I, NEG, SEED, VARIATIONS], "image", True, ui="artboard")
T(12, "thumbnail-generator", "Thumbnail Generator", "image", "A 1280×720 thumbnail with bold, readable title text that supports Indian scripts.",
  pipe("thumbnail", ["fal"], "Image on fal.ai, title typeset on our worker (Indian scripts supported)", models=T2I),
  [prompt("Scene", "shocked face pointing at a huge stack of books"), P("headline", "text", "Headline", max=60, required=True),
   P("text_color", "color", "Text colour", default="#ffffff"), P("accent", "color", "Outline / accent", default="#ff2a2a"),
   P("text_position", "chips", "Text position", default="right", options=["left", "right", "top", "bottom"]), STYLE, SEED, VARIATIONS],
  "image", True, ui="thumb")
T(13, "character-sheet", "Consistent Character", "image", "One character from reference photos in new poses, outfits and scenes.",
  fal(I2I), [P("references", "media_multi", "Character references", accept=["image"], min_items=1, max_items=4, required=True),
             prompt("New scene", "the same girl riding a scooter in Mumbai rain"), ASPECT_I, VARIATIONS], "image", True, ui="refboard",
  consent=True)
T(14, "style-transfer", "Style Transfer", "image", "Re-paint an image in a new art style while keeping its layout.",
  fal(I2I), [media("image", "Image", ("image",)), STYLE, P("strength", "slider", "Style strength", min=0.1, max=1, step=0.1, default=0.7),
             prompt("Extra direction", required=False)], "image", True, ui="compare")
T(15, "poster-design", "Poster & Social Post", "image", "Posters and posts with accurate in-image text.",
  fal([m for m in T2I if m["id"] in ("openai/gpt-image-2", "fal-ai/nano-banana-pro")]),
  [prompt("Design", "Diwali sale poster, 50% off, gold and maroon"), P("text", "text", "Exact text to include", required=True),
   PALETTE, P("format", "chips", "Format", default="Instagram post", options=["Instagram post", "Story", "YouTube banner", "A4 poster"]), VARIATIONS],
  "image", True, ui="poster")
T(16, "logo-concepts", "Logo & Icon Concepts", "image", "Explore logo marks and app icons on a clean grid.",
  fal(T2I), [P("brand", "text", "Brand name", required=True), P("industry", "text", "What the brand does"),
             P("mark", "chips", "Mark type", default="symbol", options=["symbol", "lettermark", "wordmark", "mascot", "app icon"]),
             PALETTE, P("variations", "stepper", "Variations", min=1, max=4, default=4)], "image", False, ui="grid",
  notice="Check trademarks before using any logo commercially.")
T(17, "product-photo", "Product Photography", "image", "Place your product in a styled scene with studio lighting.",
  fal(I2I), [media("image", "Product photo", ("image",)), P("scene", "chips", "Scene", default="marble studio", options=[
      "marble studio", "kitchen counter", "outdoor nature", "festive table", "minimal pastel", "tech desk"]), LIGHT,
      prompt("Extra direction", required=False), VARIATIONS], "image", True, ui="compare")
T(18, "storyboard-frames", "Storyboard Frames", "image", "Turn a script into a numbered storyboard of frames.",
  pipe("storyboard_frames", ["llm", "fal"], "Shot list by language model, frames on fal.ai", models=T2I),
  [P("script", "longtext", "Script", required=True, max=8000), STYLE, ASPECT_I, P("max_frames", "stepper", "Frames", min=2, max=12, default=6)],
  "image", True, ui="storyboard")
T(19, "pattern-texture", "Pattern & Texture", "image", "Seamless patterns and textures for backgrounds and merch.",
  fal(T2I), [prompt(ph="block-print paisley, indigo"), PALETTE, P("tile", "toggle", "Seamless tile", default=True), VARIATIONS],
  "image", True, ui="pattern")
T(20, "image-variations", "Image Variations", "image", "Explore variations around an image you already like.",
  fal(I2I), [media("image", "Base image", ("image",)), P("amount", "slider", "How different", min=0.1, max=1, step=0.1, default=0.4),
             prompt("Direction", required=False), P("variations", "stepper", "Variations", min=2, max=4, default=4)], "image", True, ui="grid")

# ---------------------------------------------------------------- C. AI Video Transformation (021-030)
T(21, "video-restyle", "Video Restyle", "transform", "Turn footage into anime, claymation, film noir and more — motion kept.",
  fal(V2V), [media(), STYLE, prompt("Direction", "make it a Ghibli-like watercolour world", required=False)], "video", True, ui="splitview")
T(22, "background-replace", "Background Replace", "transform", "Cut out the person and put them in a new background.",
  local("video_bg_replace", "Runs on our worker (U²-Net cut-out, clips ≤ 60 s)"),
  [media(), P("background", "background", "New background", default={"type": "color", "value": "#0f172a"})], "video", True, ui="splitview")
T(23, "background-remove", "Background Removal", "transform", "Transparent cut-out of the subject, ready for compositing.",
  local("video_bg_remove", "Runs on our worker (U²-Net, clips ≤ 60 s)"), [media()], "video", True, ui="splitview")
T(24, "object-remove-video", "Object Removal", "transform", "Describe what to erase; the model fills the gap across frames.",
  fal(V2V), [media(), P("remove", "text", "What to remove", placeholder="the person walking in the background", required=True)],
  "video", True, ui="splitview")
T(25, "relight-weather", "Relight & Weather", "transform", "Change time of day, lighting and weather of a shot.",
  fal(V2V), [media(), LIGHT, P("weather", "chips", "Weather", default="unchanged", options=["unchanged", "rain", "snow", "fog", "storm", "sunny"]),
             P("time_of_day", "chips", "Time of day", default="unchanged", options=["unchanged", "dawn", "noon", "sunset", "night"])],
  "video", True, ui="splitview")
T(26, "video-upscale", "Video Upscale", "transform", "Upscale to sharper 1080p/4K with AI detail recovery.",
  {"type": "local", "handler": "video_upscale", "models": UPSCALE_V,
   "note": "Free AI upscaler (FSRCNN) on our worker up to 1080p; 4K and detail recovery with the premium upscaler (fal.ai key)"},
  [media(), P("target", "chips", "Target", default="1080p", options=["1080p", "4K"])], "video", True, ui="splitview")
T(27, "stabilize", "Stabilization", "transform", "Smooth shaky handheld footage.",
  local("video_stabilize", "Runs on our worker (FFmpeg vid.stab)"), [media(), P("smoothing", "slider", "Smoothing", min=5, max=60, step=1, default=24)],
  "video", True, ui="splitview")
T(28, "slow-motion", "Slow Motion & Frame Interpolation", "transform", "Create new in-between frames for smooth slow motion or higher frame rates.",
  local("video_interpolate", "Runs on our worker (motion-compensated interpolation)"),
  [media(), P("factor", "chips", "Slow down", default=2, options=[1, 2, 4], help="1 = same speed, smoother frame rate"),
   P("target_fps", "chips", "Output frame rate", default=60, options=[30, 50, 60])], "video", True, ui="splitview")
T(29, "denoise-sharpen", "Denoise & Sharpen", "transform", "Clean grainy low-light video and restore crisp detail.",
  local("video_denoise"), [media(), P("denoise", "slider", "Denoise", min=0, max=10, step=0.5, default=4),
                           P("sharpen", "slider", "Sharpen", min=0, max=2, step=0.1, default=0.6)], "video", True, ui="splitview")
T(30, "auto-grade", "Auto Colour Grade", "transform", "Measure exposure and white balance, then bake a balanced grade or a look.",
  local("video_autograde"), [media(), P("strength", "slider", "Strength", min=0.1, max=1, step=0.1, default=0.6),
                             P("look", "chips", "Look", default="natural", options=["natural", "warm", "cool", "teal & orange", "punchy", "faded film", "mono"])],
  "video", True, ui="splitview")

# ---------------------------------------------------------------- D. AI Animation (031-040)
T(31, "photo-animate", "Photo Animate", "animation", "Subtle, living motion in a photo: breathing, blinking, moving water.",
  fal(I2V), [media("image", "Photo", ("image",)), P("motion_preset", "chips", "Motion", default="living portrait",
                                                  options=["living portrait", "flowing water", "wind in trees", "drifting clouds", "flickering lights"]),
             MOTION, DUR], "video", True, ui="stage")
T(32, "character-animate", "Character Performance", "animation", "Animate a drawn or 3D character with a motion description.",
  fal(I2V), [media("image", "Character art", ("image",)), P("action", "chips", "Action", default="wave hello",
                                                           options=["wave hello", "walk cycle", "jump", "dance", "talk and gesture", "run"]),
             prompt("Performance notes", required=False), CAMERA, DUR], "video", True, ui="stage")
T(33, "lip-sync", "Lip Sync", "animation", "Sync a face's mouth to any voice track.",
  fal(LIPSYNC), [media("video", "Face video", ("video",)), media("audio", "Voice track", ("audio",)),
                 P("sync_mode", "chips", "When lengths differ", default="cut_off", options=["cut_off", "loop", "bounce"])],
  "video", True, ui="lipsync", consent=True)
T(34, "text-to-3d", "Text to 3D Model", "animation", "Generate a textured 3D model (GLB) from a description.",
  fal(T23D), [prompt(ph="a cute robot mascot holding a camera")], "model3d", False, ui="model3d")
T(35, "image-to-3d", "Image to 3D Model", "animation", "Lift an object photo into a textured 3D model.",
  fal(I23D), [media("image", "Object photo", ("image",))], "model3d", False, ui="model3d")
T(36, "auto-rig", "Auto Rig", "animation", "Add a skeleton to a humanoid 3D model so it can be animated.",
  fal(RIG), [P("model_url", "text", "GLB model URL (from Text/Image to 3D)", required=True)], "model3d", False, ui="model3d")
T(37, "text-to-motion", "Text to Motion", "animation", "Generate 3D character motion data from a description.",
  fal(T2MOTION), [prompt(ph="a person does a cartwheel then waves"), P("duration", "duration", "Duration", options=[3, 5, 8], default=5, unit="s")],
  "model3d", False, ui="model3d")
T(38, "kinetic-type", "Kinetic Typography", "animation", "Animated word-by-word text in Indian and Latin scripts.",
  local("kinetic_type", "Rendered on our worker (Indian scripts supported)"),
  [P("text", "longtext", "Text", required=True, max=400), P("animation", "chips", "Animation", default="pop",
                                                           options=["pop", "slide up", "typewriter", "fade"]),
   P("text_color", "color", "Text colour", default="#ffffff"), P("bg_color", "color", "Background", default="#0b0b14"),
   P("words_per_second", "slider", "Words per second", min=1, max=5, step=0.5, default=2.5), ASPECT_V], "video", True, ui="keyframes")
T(39, "ken-burns", "Ken Burns & Parallax", "animation", "Cinematic pan-and-zoom movement over a still image.",
  local("ken_burns"), [media("image", "Image", ("image",)), P("move", "camera_move", "Move", default="push in",
                                                             options=["push in", "pull out", "pan left", "pan right", "tilt up", "tilt down"]),
                       P("duration", "slider", "Duration", min=2, max=20, step=1, default=6, unit="s"), ASPECT_V], "video", True, ui="keyframes")
T(40, "animated-captions", "Animated Captions", "animation", "Bold, word-timed captions burned into your video, shorts-style.",
  local("animated_captions", WHISPER_NOTE), [media(), P("caption_style", "chips", "Style", default="bold pop",
                                                        options=["bold pop", "clean subtitle", "karaoke highlight"]),
                                             P("text_color", "color", "Text colour", default="#ffffff"),
                                             P("highlight", "color", "Highlight", default="#facc15"),
                                             P("position", "chips", "Position", default="lower third", options=["lower third", "center", "top"])],
  "video", True, ui="keyframes")

# ---------------------------------------------------------------- E. AI Audio & Music (041-050)
T(41, "text-to-speech", "Voice Studio (Text to Speech)", "audio", "Natural voice-overs in English and Indian languages.",
  {"type": "local", "handler": "tts", "note": "Free Piper voices on our worker; premium ElevenLabs/MiniMax voices with a fal.ai key", "models": TTS},
  [P("text", "longtext", "Script", required=True, max=5000), VOICE, P("speed", "slider", "Speed", min=0.7, max=1.4, step=0.05, default=1.0),
   P("emotion", "chips", "Delivery (premium voices)", default="neutral", options=["neutral", "happy", "excited", "calm", "sad", "serious"])],
  "audio", True, ui="voice")
T(42, "music-generator", "Music Generator", "audio", "Royalty-safe background music from a mood, genre and tempo.",
  fal(MUSIC), [prompt("Mood & genre", "uplifting lo-fi with tabla and soft piano"), P("bpm", "bpm", "Tempo", min=60, max=180, default=96),
               P("instruments", "multichips", "Instruments", default=["piano"], options=[
                   "piano", "guitar", "tabla", "sitar", "flute", "strings", "synth", "drums", "bass", "shehnai"]),
               P("duration", "slider", "Length", min=10, max=180, step=5, default=60, unit="s"), P("instrumental", "toggle", "Instrumental", default=True)],
  "audio", True, ui="music")
T(43, "sound-effects", "Sound Effects", "audio", "Any sound effect from a description.",
  fal(SFX), [prompt("Sound", "crowd cheering in a cricket stadium"), P("duration", "slider", "Length", min=1, max=22, step=1, default=5, unit="s")],
  "audio", True, ui="sfx")
T(44, "video-to-sfx", "Video to Sound", "audio", "Watch a silent clip and generate matching foley and ambience.",
  fal(V2SFX), [media(), prompt("Hint", "footsteps on gravel, light wind", required=False)], "video", True, ui="sfx")
T(45, "voice-changer", "Voice Changer", "audio", "Re-perform a recording in a different voice, keeping timing and emotion.",
  fal(S2S), [media("audio", "Recording", ("audio", "video")), media("target_voice", "Target voice sample (with consent)", ("audio",))],
  "audio", True, ui="compareaudio", consent=True)
T(46, "stem-splitter", "Stem Splitter", "audio", "Separate vocals, drums, bass and other instruments.",
  fal(STEMS), [media("audio", "Song or mix", ("audio", "video"))], "audio", True, ui="stems")
T(47, "noise-removal", "Noise Removal", "audio", "Remove hiss, hum and background noise from speech.",
  local("audio_denoise"), [media("audio", "Recording", ("audio", "video")), P("strength", "slider", "Strength", min=5, max=40, step=1, default=18, unit="dB")],
  "audio", True, ui="compareaudio")
T(48, "loudness-master", "Loudness Mastering", "audio", "Hit YouTube/Spotify loudness targets with a true-peak limit.",
  local("audio_master"), [media("audio", "Audio", ("audio", "video")),
                          P("target", "chips", "Target", default=-14, options=[-14, -16, -23], unit="LUFS")], "audio", True, ui="compareaudio")
T(49, "silence-trim", "Silence Trimmer", "audio", "Remove dead air between sentences.",
  local("audio_silence_trim"), [media("audio", "Speech", ("audio", "video")),
                                P("min_silence", "slider", "Shortest pause to cut", min=0.3, max=3, step=0.1, default=0.8, unit="s"),
                                P("keep", "slider", "Pause to keep", min=0, max=0.5, step=0.05, default=0.15, unit="s")], "audio", True, ui="compareaudio")
T(50, "beat-detect", "Beat & Tempo Detector", "audio", "Find the tempo and beat positions to cut video on the beat.",
  local("beat_detect"), [media("audio", "Music", ("audio", "video"))], "report", False, ui="beats")

# ---------------------------------------------------------------- F. AI Creative Writing (051-060)
W = [TONE, AUDIENCE, LANG]
T(51, "script-writer", "Script Writer", "writing", "Full video scripts with scenes, narration and visual notes.",
  llm("script"), [BRIEF, *W, LENGTH, P("format", "chips", "Format", default="YouTube video", options=["YouTube video", "Short / Reel", "Ad", "Explainer", "Podcast"])],
  "doc", False, ui="script")
T(52, "hook-generator", "Hook Generator", "writing", "Scroll-stopping first lines for your video.",
  llm("hooks"), [BRIEF, *W, P("count", "stepper", "Hooks", min=3, max=15, default=8)], "doc", False, ui="list")
T(53, "title-generator", "Title Lab", "writing", "Titles scored for curiosity, clarity and length.",
  llm("titles"), [BRIEF, *W, P("count", "stepper", "Titles", min=3, max=15, default=10)], "doc", False, ui="list")
T(54, "description-tags", "Description & Tags", "writing", "SEO description, chapters outline and tags.",
  llm("description"), [BRIEF, LANG, P("links", "longtext", "Links to include", required=False)], "doc", False, ui="doc")
T(55, "story-outline", "Story Structure", "writing", "Beat-by-beat story outline (hook, rising action, payoff).",
  llm("outline"), [BRIEF, *W, P("structure", "chips", "Structure", default="three-act", options=["three-act", "hero's journey", "problem-solution", "listicle", "before-after"])],
  "doc", False, ui="beats_board")
T(56, "dialogue-writer", "Dialogue Writer", "writing", "Character dialogue for skits and short films.",
  llm("dialogue"), [BRIEF, P("characters", "longtext", "Characters", placeholder="Raju — talkative chaiwala\nPriya — tired engineer", required=True), *W, LENGTH],
  "doc", False, ui="dialogue")
T(57, "shot-list", "Script to Shot List", "writing", "Break a script into shots with camera, framing and duration — sends straight to the Film Builder.",
  llm("shotlist"), [P("script", "longtext", "Script", required=True, max=8000), ASPECT_V], "doc", False, ui="shotlist")
T(58, "prompt-enhancer", "Prompt Director", "writing", "Expand a rough idea into a precise, model-ready video or image prompt.",
  llm("prompt"), [prompt("Idea", "boy flying kite on rooftop"), P("target", "chips", "For", default="video", options=["video", "image"]), STYLE],
  "doc", False, ui="list")
T(59, "social-captions", "Social Post Writer", "writing", "Captions and hashtags for Instagram, X, LinkedIn and Shorts.",
  llm("social"), [BRIEF, *W, P("platforms", "multichips", "Platforms", default=["Instagram"], options=["Instagram", "YouTube Shorts", "X", "LinkedIn", "Facebook"])],
  "doc", False, ui="list")
T(60, "rewrite-tone", "Rewrite & Tone Shift", "writing", "Rewrite text shorter, simpler or in a new tone or language.",
  llm("rewrite"), [P("text", "longtext", "Text", required=True, max=8000), TONE, LANG,
                   P("goal", "chips", "Goal", default="clearer", options=["clearer", "shorter", "longer", "simpler", "more persuasive", "Hinglish"])],
  "doc", False, ui="doc")

# ---------------------------------------------------------------- G. AI Content Intelligence (061-070)
T(61, "scene-breakdown", "Scene Breakdown", "content", "Every cut and scene with thumbnails and timings.",
  local("scene_report"), [media()], "report", False, ui="analysis")
T(62, "transcript", "Transcript", "content", "Accurate, timestamped transcript you can search and export.",
  local("transcript_report", WHISPER_NOTE), [media(accept=("video", "audio")), LANG], "report", False, ui="transcript")
T(63, "people-detection", "Face & People Detection", "content", "Where faces appear in each shot, drawn as overlays.",
  local("face_report", "Runs on our worker (OpenCV face detector)"), [media()], "report", False, ui="analysis")
T(64, "video-qa", "Ask the Video", "content", "Ask questions about what happens in a video.",
  local("video_qa", "Answers from the transcript and scene cuts on our worker + language model; a fal.ai key adds a model that sees the pictures",
        needs=["llm"], or_fal=True, models=VQA), [media(accept=("video", "audio")), P("question", "text", "Question", placeholder="What does she say about the price?", required=True)],
  "doc", False, ui="qa")
T(65, "highlight-finder", "Highlight Finder", "content", "Scores every moment by energy and change, then marks the best.",
  local("highlights_report"), [media(), P("count", "stepper", "Highlights", min=1, max=10, default=5),
                               P("length", "slider", "Highlight length", min=5, max=60, step=5, default=20, unit="s")], "report", False, ui="analysis")
T(66, "retention-risk", "Retention Risk Check", "content", "Flags slow intros, long static shots and dead air that tend to lose viewers.",
  local("retention_report", "Runs on our worker — rule-based signals, not a prediction of your real analytics"), [media()], "report", False, ui="analysis")
T(67, "audio-report", "Audio Quality Report", "content", "Loudness, peaks, clipping and noise floor against platform targets.",
  local("audio_report"), [media(accept=("video", "audio"))], "report", False, ui="analysis")
T(68, "visual-report", "Visual Quality Report", "content", "Exposure, contrast, sharpness and colour cast per scene.",
  local("visual_report"), [media()], "report", False, ui="analysis")
T(69, "safety-check", "Content Safety Check", "content", "Checks frames for unsafe imagery before you publish.",
  pipe("safety_check", ["fal"], "Frames sampled on our worker, checked by a hosted safety model", models=NSFW), [media()], "report", False, ui="analysis")
T(70, "chapters", "Chapter Generator", "content", "YouTube chapters from scenes and transcript.",
  pipe("chapters", ["llm"], "Transcript on our worker + language model"), [media(accept=("video", "audio")), LANG], "doc", False, ui="transcript")

# ---------------------------------------------------------------- H. AI Creator Intelligence (071-080)
T(71, "channel-analyzer", "Channel Analyzer", "creator", "Upload cadence, best formats and top videos for any public channel.",
  yt("channel", "Public uploads feed + rules on our worker (no key); YouTube Data API + language model add subscribers and a written summary", free=True),
  [CHANNEL], "doc", False, ui="dashboard")
T(72, "topic-discovery", "Topic Discovery", "creator", "Topics with demand in your niche, from what is getting views right now.",
  yt("topics"), [P("niche", "text", "Niche", placeholder="personal finance for students", required=True), REGION, LANG], "doc", False, ui="opportunity")
T(73, "competitor-compare", "Competitor Compare", "creator", "Side-by-side comparison of up to 4 channels.",
  yt("compare", "Public uploads feeds (no key); a YouTube Data API key adds subscriber counts", free=True),
  [P("channels", "longtext", "Channels (one per line)", required=True)], "doc", False, ui="dashboard")
T(74, "opportunity-map", "Content Opportunity Map", "creator", "Plots topics by demand vs. competition to find gaps.",
  yt("opportunity"), [P("niche", "text", "Niche", required=True), REGION], "doc", False, ui="opportunity")
T(75, "trend-explorer", "Trend Explorer", "creator", "What's trending now by country and category.",
  yt("trends"), [REGION, P("category", "chips", "Category", default="all", options=["all", "music", "gaming", "education", "entertainment", "tech", "news"])],
  "doc", False, ui="dashboard")
T(76, "title-ab", "Title A/B Scorer", "creator", "Compare title options and see which is clearer and more clickable — and why.",
  llm("title_ab"), [P("titles", "longtext", "Titles (one per line)", required=True), AUDIENCE], "doc", False, ui="abtest")
T(77, "thumbnail-ab", "Thumbnail A/B Analyzer", "creator", "Measures contrast, face size, text area and small-size readability.",
  local("thumbnail_ab", "Runs on our worker (image measurements)"),
  [P("images", "media_multi", "Thumbnails", accept=["image"], min_items=2, max_items=4, required=True)], "report", False, ui="abtest")
T(78, "seo-analyzer", "SEO Analyzer", "creator", "Grades your title, description and tags against search intent.",
  llm("seo"), [P("title", "text", "Title", required=True), P("description", "longtext", "Description"), P("tags", "text", "Tags"),
               P("keyword", "text", "Main keyword")], "doc", False, ui="doc")
T(79, "content-calendar", "Content Calendar", "creator", "A month of planned uploads with formats and hooks.",
  llm("calendar"), [P("niche", "text", "Niche", required=True), P("per_week", "stepper", "Uploads per week", min=1, max=14, default=3), AUDIENCE, LANG],
  "doc", False, ui="calendar")
T(80, "strategy-report", "Growth Strategy", "creator", "A prioritised growth plan from your goals and channel data.",
  yt("strategy", "Public uploads feed + rules on our worker (no key); YouTube Data API + language model add a written plan", free=True),
  [CHANNEL, P("goal", "text", "Goal", placeholder="100k subscribers in 12 months")], "doc", False, ui="doc")

# ---------------------------------------------------------------- I. AI Image Editing (081-090)
T(81, "image-bg-remove", "Background Remover", "imageedit", "Clean transparent cut-out of the subject.",
  local("image_bg_remove", "Runs on our worker (U²-Net)"), [media("image", "Image", ("image",))], "image", True, ui="canvas")
T(82, "inpaint", "Inpaint / Erase", "imageedit", "Brush over anything to erase it or replace it with something new.",
  {"type": "local", "handler": "image_inpaint", "models": I2I,
   "note": "Erase runs on our worker (OpenCV); replace-with-prompt uses a hosted model with a fal.ai key"},
  [media("image", "Image", ("image",)), P("mask", "mask", "Mask", required=True), prompt("Replace with (optional)", "a potted plant", required=False)],
  "image", True, ui="canvas")
T(83, "outpaint", "Outpaint / Expand", "imageedit", "Extend the canvas and let the model paint the new area.",
  {"type": "local", "handler": "image_outpaint", "models": I2I,
   "note": "Free: soft extension of the picture's own edges, on our worker. Painting new content from a description needs a fal.ai key"},
  [media("image", "Image", ("image",)), P("expand", "aspect", "New shape", options=["16:9", "9:16", "1:1", "4:5", "21:9"], default="16:9"),
             prompt("What's beyond the edges", required=False)], "image", True, ui="canvas")
T(84, "image-upscale", "Image Upscale", "imageedit", "4× resolution with AI detail.",
  {"type": "local", "handler": "image_upscale", "models": UPSCALE_I, "note": "Free AI upscaler (FSRCNN) on our worker; Real-ESRGAN with a fal.ai key"},
  [media("image", "Image", ("image",)), P("scale", "chips", "Scale", default=4, options=[2, 4])], "image", True, ui="canvas")
T(85, "relight-image", "Relight", "imageedit", "Change the lighting of a photo after it was taken.",
  {"type": "local", "handler": "image_relight", "models": I2I,
   "note": "Free directional relight on our worker (light colour, direction and falloff); generative relighting with a fal.ai key"},
  [media("image", "Image", ("image",)), LIGHT, P("direction", "lighting_dir", "Light direction", default=45)], "image", True, ui="canvas")
T(86, "color-adjust", "Colour Adjust", "imageedit", "Exposure, contrast, saturation, warmth and sharpness.",
  local("image_adjust"), [media("image", "Image", ("image",)), P("exposure", "slider", "Exposure", min=-1, max=1, step=0.05, default=0),
                          P("contrast", "slider", "Contrast", min=-1, max=1, step=0.05, default=0), P("saturation", "slider", "Saturation", min=-1, max=1, step=0.05, default=0),
                          P("warmth", "slider", "Warmth", min=-1, max=1, step=0.05, default=0), P("sharpness", "slider", "Sharpness", min=0, max=2, step=0.1, default=0)],
  "image", True, ui="canvas")
T(87, "instruct-edit", "Edit with Words", "imageedit", "Describe the change: 'make it sunset', 'add a hat'.",
  fal(I2I), [media("image", "Image", ("image",)), prompt("Edit", "make the sky a dramatic sunset")], "image", True, ui="canvas")
T(88, "portrait-retouch", "Portrait Retouch", "imageedit", "Gentle skin, eyes and light clean-up that keeps texture.",
  {"type": "local", "handler": "portrait_retouch", "models": I2I,
   "note": "Free face-only skin smoothing on our worker (keeps texture); generative retouch with a fal.ai key"},
  [media("image", "Portrait", ("image",)), P("amount", "slider", "Amount", min=0.1, max=1, step=0.1, default=0.4)], "image", True, ui="canvas",
  consent=True)
T(89, "image-bg-replace", "Background Replace", "imageedit", "Cut out the subject and place it on a new background.",
  local("image_bg_replace", "Runs on our worker (U²-Net)"),
  [media("image", "Image", ("image",)), P("background", "background", "New background", default={"type": "color", "value": "#f1f5f9"})], "image", True, ui="canvas")
T(90, "text-on-image", "Text on Image", "imageedit", "Typeset headlines on images with outlines and shadows — Indian scripts supported.",
  local("image_text", "Rendered on our worker"), [media("image", "Image", ("image",)), P("text", "text", "Text", required=True, max=120),
                                                   P("text_color", "color", "Colour", default="#ffffff"), P("accent", "color", "Outline", default="#000000"),
                                                   P("size", "slider", "Size", min=0.04, max=0.25, step=0.01, default=0.11),
                                                   P("text_position", "chips", "Position", default="bottom", options=["top", "center", "bottom", "left", "right"])],
  "image", True, ui="canvas")

# ---------------------------------------------------------------- J. AI Video Intelligence (091-100)
T(91, "shot-detect", "Shot Detection to Timeline", "videointel", "Detect every shot and build a sequence already cut at each change.",
  local("shots_to_sequence"), [media()], "sequence", True, ui="shots")
T(92, "smart-reframe", "Smart Reframe", "videointel", "Vertical, square and 4:5 versions that keep faces in frame.",
  local("reframe_sequence"), [media(), P("format", "aspect", "Format", options=["9:16", "1:1", "4:5"], default="9:16")], "sequence", True, ui="reframe")
T(93, "auto-cut-silence", "Auto Cut Silences", "videointel", "A sequence with pauses removed, ready to fine-tune.",
  local("silence_sequence"), [media(), P("min_silence", "slider", "Shortest pause to cut", min=0.3, max=3, step=0.1, default=0.7, unit="s")],
  "sequence", True, ui="shots")
T(94, "auto-shorts", "Auto Shorts", "videointel", "Finds the strongest moments and makes vertical shorts from them.",
  local("shorts_sequences"), [media(), P("count", "stepper", "Shorts", min=1, max=5, default=3),
                              P("length", "slider", "Length", min=10, max=60, step=5, default=30, unit="s")], "sequence", True, ui="reframe")
T(95, "broll-suggest", "B-roll Suggestions", "videointel", "Moments that need cutaways and what to show, matched to your library.",
  pipe("broll", ["llm"], "Transcript on our worker + language model"), [media(accept=("video",))], "doc", False, ui="shots")
T(96, "auto-zoom", "Auto Punch-in", "videointel", "Adds punch-in zooms on emphasised moments to keep talking-head videos lively.",
  local("punchin_sequence"), [media(), P("zoom", "slider", "Zoom", min=1.05, max=1.5, step=0.05, default=1.2),
                              P("every", "slider", "At most every", min=3, max=20, step=1, default=6, unit="s")], "sequence", True, ui="shots")
T(97, "continuity-check", "Continuity Check", "videointel", "Flags jumps in brightness, colour and audio level between shots.",
  local("continuity_report"), [media()], "report", False, ui="analysis")
T(98, "subject-tracking", "Subject Tracking", "videointel", "Tracks the main face through the clip; data drives reframing.",
  local("tracking_report", "Runs on our worker (OpenCV)"), [media()], "report", False, ui="analysis")
T(99, "multi-format", "Multi-Format Versions", "videointel", "16:9, 9:16, 1:1 and 4:5 sequences from one video in one click.",
  local("multiformat_sequences"), [media(), P("formats", "multichips", "Formats", default=["9:16", "1:1"], options=["16:9", "9:16", "1:1", "4:5"])],
  "sequence", True, ui="reframe")
T(100, "markers", "Auto Markers", "videointel", "Scene, silence and loudness markers placed on a new sequence.",
  local("markers_sequence"), [media()], "sequence", True, ui="shots")

# ---------------------------------------------------------------- K. AI Localization (101-110)
T(101, "transcribe", "Transcribe", "localize", "Speech to text with word timings, in 90+ languages.",
  local("transcript_report", WHISPER_NOTE), [media(accept=("video", "audio")), LANG], "subtitles", False, ui="subtitles")
T(102, "translate-subs", "Translate Subtitles", "localize", "Translated .srt subtitles, line-timed to the original.",
  local("translate_subs", "Runs on our worker (Argos) — or OpenAI with your key"), [media(accept=("video", "audio")), LANGS], "subtitles", False, ui="subtitles")
T(103, "burn-subtitles", "Subtitle Burn-in", "localize", "Hard-coded subtitles with Indian-script fonts.",
  local("burn_subtitles", WHISPER_NOTE), [media(), P("language", "language", "Subtitle language", default="en"),
                                          P("text_color", "color", "Text colour", default="#ffffff"), P("box", "toggle", "Background box", default=True)],
  "video", True, ui="subtitles")
T(104, "ai-dub", "AI Dubbing", "localize", "Translate and re-voice speech, timed to the original.",
  local("dub", "Runs on our worker (Whisper + Argos + Piper)"), [media(accept=("video", "audio")), P("target", "language", "Dub into", default="hi"), VOICE],
  "audio", True, ui="dubbing")
T(105, "voice-dub", "Voice-Preserving Dub", "localize", "Dub that keeps the speaker's own voice.",
  fal(DUB_EL), [media(accept=("video", "audio")), P("target", "language", "Dub into", default="hi")], "video", True, ui="dubbing", consent=True)
T(106, "lipsync-dub", "Lip-Synced Dub", "localize", "Dub plus matching lip movement.",
  pipe("lipsync_dub", ["fal"], "Dub on our worker, lip sync on fal.ai", models=LIPSYNC),
  [media(), P("target", "language", "Dub into", default="hi"), VOICE], "video", True, ui="dubbing", consent=True)
T(107, "speaker-split", "Speaker Diarization", "localize", "Who spoke when, for multi-speaker subtitles and dubbing.",
  local("speaker_report", "Runs on our worker (Whisper + WeSpeaker voice prints, CC-BY-4.0)"), [media(accept=("video", "audio")), LANG], "report", False,
  ui="subtitles")
T(108, "multi-language", "Multi-Language Pack", "localize", "Subtitles in several languages at once.",
  local("translate_subs", "Runs on our worker (Argos) — or OpenAI with your key"), [media(accept=("video", "audio")),
                                                                                    P("targets", "languages", "Languages", default=["hi", "ta", "te", "bn"], min_items=2, max_items=8)],
  "subtitles", False, ui="subtitles")
T(109, "translation-compare", "Translation Compare", "localize", "Two translations side by side, line by line.",
  pipe("translation_compare", ["llm"], "Argos on our worker vs. language model"), [media(accept=("video", "audio")), P("target", "language", "Language", default="hi")],
  "doc", False, ui="subtitles")
T(110, "subtitle-sync", "Subtitle Timing Fix", "localize", "Shift and stretch subtitle timing to match the speech.",
  local("subtitle_sync"), [P("srt", "longtext", "Subtitles (.srt text)", required=True, max=200000), P("offset", "slider", "Shift", min=-10, max=10, step=0.1, default=0, unit="s"),
                           P("stretch", "slider", "Stretch", min=0.9, max=1.1, step=0.001, default=1)], "subtitles", False, ui="subtitles")

# ---------------------------------------------------------------- L. AI Creative Automation (111-120)
T(111, "workflow-builder", "Workflow Builder", "automation", "Wire tools into a node graph and run it as one job.",
  pipe("workflow", [], "Runs each node on its own engine"), [P("graph", "nodes", "Workflow", required=True),
                                                                 media("video", "Input file", ("video", "audio", "image"), required=False)], "workflow", True, ui="nodes")
T(112, "long-to-shorts", "Long Video → Shorts", "automation", "Template: highlights → vertical reframe → captions.",
  pipe("template", [], "Runs on our worker", template="long_to_shorts"), [media()], "workflow", True, ui="nodes")
T(113, "faceless-video", "Faceless Video Maker", "automation", "Template: script → voice-over → images → animated video.",
  pipe("template", ["llm", "fal"], "Language model + fal.ai images + our worker", template="faceless"), [BRIEF, LANG, ASPECT_V], "workflow", True, ui="nodes")
T(114, "podcast-clips", "Podcast to Clips", "automation", "Template: transcript → best moments → captioned clips.",
  pipe("template", [], "Runs on our worker", template="podcast_clips"), [media()], "workflow", True, ui="nodes")
T(115, "auto-localize", "Auto Localize", "automation", "Template: subtitles + dubs in several languages.",
  pipe("template", [], "Runs on our worker", template="auto_localize"), [media(), LANGS], "workflow", True, ui="nodes")
T(116, "batch-process", "Batch Processor", "automation", "Run one tool on many files at once.",
  pipe("batch", [], "Runs the chosen tool on each file"), [P("tool", "tool", "Tool", required=True),
                                                        P("items", "media_multi", "Files", accept=["video", "audio", "image"], min_items=1, max_items=20, required=True)],
  "workflow", True, ui="nodes")
T(117, "scheduled-workflows", "Scheduled Workflows", "automation", "Run a workflow on a schedule.",
  unbuilt("Needs a scheduler service (cron worker) — not built yet"), [P("graph", "nodes", "Workflow")], "workflow", False, ui="nodes")
T(118, "approval-gates", "Approval Gates", "automation", "Pause a workflow until you approve the step before it.",
  pipe("workflow", [], "Workflow node that waits for your approval"), [P("graph", "nodes", "Workflow", required=True),
                                                                          media("video", "Input file", ("video", "audio", "image"), required=False)], "workflow", True, ui="nodes")
T(119, "director-agent", "Director Agent", "automation", "Describe the video you want; the agent drafts the workflow for you to review and run.",
  llm("director"), [BRIEF, P("budget_usd", "slider", "Max model spend", min=0, max=20, step=0.5, default=2, unit="$")], "workflow", False, ui="nodes")
T(120, "workflow-templates", "Workflow Templates", "automation", "Ready-made pipelines to start from.",
  pipe("templates_gallery", [], "Loads a template into the Workflow Builder"), [], "workflow", False, ui="nodes")

TOOLS: dict[str, dict] = {t["id"]: t for t in _T}
assert len(TOOLS) == 120 and sorted(TOOLS) == [f"{i:03d}" for i in range(1, 121)], "registry must hold exactly 120 tools"
for s in STUDIOS:
    assert sum(1 for t in _T if t["studio"] == s["id"]) == 10, s["id"]


# ---------------------------------------------------------------- live status


# Writing tools whose output from the free self-hosted model (Qwen2.5-1.5B-Instruct, Apache-2.0) passed review on
# 2026-11-07 (docs/WRITING_TOOLS_EVAL.md): English only. Others stay hidden until a Claude/OpenAI key is set.
LOCAL_LLM_TOOLS_DEFAULT = "052,054,055,056,057,059"


def local_llm_only() -> bool:
    return bool(os.environ.get("LLM_BASE_URL")) and not (os.environ.get("GROQ_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY"))


def local_llm_tools() -> set[str]:
    return {x.strip() for x in os.environ.get("LLM_LOCAL_TOOLS", LOCAL_LLM_TOOLS_DEFAULT).split(",") if x.strip()}


def keys() -> dict:
    return {"fal": bool(os.environ.get("FAL_KEY")),
            "llm": bool(os.environ.get("GROQ_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_BASE_URL")),
            "youtube": bool(os.environ.get("YOUTUBE_API_KEY"))}


NEEDS_TEXT = {"fal": "FAL_KEY (fal.ai account — pay per generation)", "llm": "GROQ_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY",
              "youtube": "YOUTUBE_API_KEY (free Google Cloud key)"}


def status(t: dict, k: dict | None = None) -> dict:
    k = k or keys()
    e = t["engine"]
    typ = e["type"]
    if typ == "unbuilt":
        return {"state": "unbuilt", "needs": [], "detail": e["note"]}
    need = {"fal": ["fal"], "llm": ["llm"], "youtube": [] if e.get("free") else ["youtube", "llm"], "local": list(e.get("needs", [])),
            "pipeline": list(e.get("needs", []))}[typ]
    missing = [n for n in need if not k[n]]
    if "llm" in need and "llm" not in missing and local_llm_only() and t["id"] not in local_llm_tools():
        missing.append("llm")   # the free local model didn't pass review for this tool: needs a hosted model
    if missing and e.get("or_fal") and k["fal"]:
        missing = []            # the hosted model on fal.ai can do the whole job instead
    if missing:
        return {"state": "needs_key", "needs": [NEEDS_TEXT[m] for m in dict.fromkeys(missing)], "detail": e["note"]}
    return {"state": "ready", "needs": [], "detail": e["note"]}


def public(t: dict, k: dict | None = None) -> dict:
    e = t["engine"]
    models = e.get("models", [])
    return {**{x: t[x] for x in ("id", "slug", "name", "studio", "summary", "params", "output", "timeline", "ui")},
            "engine": e["type"], "models": models, "consent": t.get("consent", False), "notice": t.get("notice"),
            "status": status(t, k), "premium_models": bool(models) and e["type"] == "local"}
