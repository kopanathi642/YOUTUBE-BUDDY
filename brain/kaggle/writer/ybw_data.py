"""YB Writer: builds training examples for the site's writing tools and checks answers.

The prompts come from prompts.json, exported from backend/app/tools/engines.py (TASKS + LANG_NAMES), so the
trained model sees exactly what the website sends it. Re-export prompts.json whenever those prompts change.
"""
import json
import random
import re

ALL_LANGS = ["en", "hi", "te", "ta", "kn", "ml", "bn", "mr"]
LANG_WEIGHTS = [40, 20, 15, 7, 4.5, 4.5, 4.5, 4.5]
TONES = ["friendly", "energetic", "calm", "funny", "serious", "inspiring", "dramatic"]
LENGTHS = ["short", "medium", "long"]
FORMATS = ["YouTube video", "Short / Reel", "Ad", "Explainer", "Podcast"]
STRUCTURES = ["three-act", "hero's journey", "problem-solution", "listicle", "before-after"]
GOALS = ["clearer", "shorter", "longer", "simpler", "more persuasive", "Hinglish"]
PLATFORMS = ["Instagram", "YouTube Shorts", "X", "LinkedIn", "Facebook"]
ASPECTS = ["16:9", "9:16", "1:1"]
STYLES = ["cinematic photo", "editorial", "anime", "3D render", "watercolor", "oil painting", "comic", "pixel art", "low poly",
          "line art", "claymation", "vaporwave", "Indian miniature", "Madhubani", "Bollywood poster", "documentary"]
CAMERA_MOVES = {"static", "push in", "pull out", "pan left", "pan right", "tilt up", "tilt down", "orbit", "crane up", "tracking", "handheld"}

NICHES = [
    "Hyderabad street food", "Telugu cooking at home", "budget travel in India", "Kerala backwaters travel", "Himalayan treks",
    "personal finance for salaried Indians", "stock market basics", "mutual funds for beginners", "UPSC preparation",
    "JEE physics tips", "class 10 maths", "spoken English for beginners", "coding for beginners in Python", "AI tools for students",
    "smartphone reviews under 20000 rupees", "laptop buying guide", "BGMI gaming", "Free Fire gaming", "chess for beginners",
    "cricket analysis", "kabaddi highlights", "home workouts without equipment", "yoga for back pain", "healthy Indian breakfast",
    "skincare for Indian skin", "budget fashion for college students", "saree draping styles", "wedding vlogs", "family vlogs",
    "village life vlogs", "farming and organic vegetables", "small business ideas in India", "freelancing from home",
    "Instagram growth tips", "YouTube growth for small channels", "Telugu movie reviews", "Bollywood music covers",
    "carnatic music lessons", "devotional temple tours", "Indian history stories", "science experiments for kids",
    "pet care for dogs", "car reviews for Indian roads", "bike rides and road trips", "real estate tips for first homes",
    "mobile photography", "video editing tutorials", "comedy sketches", "motivational stories", "book summaries",
    "language learning Hindi to English", "kids rhymes and stories", "festival recipes for Diwali", "Sankranti traditions",
    "monsoon travel", "tech news in simple words", "government schemes explained", "career advice after 12th",
    "interview preparation", "productivity for students",
]

SEED_SYSTEM = "You create realistic test inputs for a writing app used by Indian YouTube creators. Reply with ONE JSON object only."
SEED_USER = """Niche: {niche}.
Create varied, realistic inputs that creators in this niche would type. Mix English, Hinglish and a few in Hindi or Telugu.
Return JSON with exactly these keys:
"briefs": 6 items {{"brief": 1-3 sentences describing one specific video, "audience": who it is for}},
"dialogues": 2 items {{"brief": a short scene idea, "characters": 2-3 lines like "Name: trait"}},
"scripts": 2 short video scripts (4-6 sentences each, plain text),
"texts": 4 short informal captions or sentences a creator wants rewritten,
"title_sets": 2 lists of 3-4 candidate titles of mixed quality,
"metadata": 3 items {{"title", "description", "tags", "keyword", "quality"}} where quality is "weak" for the first (vague title, tiny description, few tags), "average" for the second and "strong" for the third,
"ideas": 3 short visual ideas for an image or video prompt."""


def lang_hint(p, lang_names):
    code = (p.get("language") or "en").strip()
    return f" Write in {lang_names.get(code, code)} (language code {code}). Keep JSON keys in English."


class _Safe(dict):
    def __missing__(self, k):
        return ""


def build_prompt(prompts, task, params):
    """Exactly what backend run_llm() sends: (system, user)."""
    sys_t, user_t, schema = prompts["tasks"][task]
    params = public_params(params)
    vals = _Safe({k: (", ".join(v) if isinstance(v, list) else v) for k, v in params.items()})
    system = sys_t.format_map(vals) + lang_hint(params, prompts["lang_names"]) + "\nReply with ONE JSON object only, matching: " + schema
    return system, user_t.format_map(vals)


def parse_json(text):
    """Same rules as backend providers.parse_json; returns None instead of raising."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if m:
        text = m.group(1)
    else:
        a, b = text.find("{"), text.rfind("}")
        if a >= 0 and b > a:
            text = text[a:b + 1]
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        return None
    return out if isinstance(out, dict) else None


def pick_lang(rng):
    return rng.choices(ALL_LANGS, LANG_WEIGHTS)[0]


def make_params(task, seed, rng):
    """Random but realistic tool inputs for one task, from one niche's seed object."""
    b = rng.choice(seed["briefs"])
    common = {"brief": b["brief"], "audience": b.get("audience", ""), "tone": rng.choice(TONES)}
    if task == "script":
        return {**common, "language": pick_lang(rng), "length": rng.choice(["short", "short", "medium"]), "format": rng.choice(FORMATS)}
    if task == "hooks":
        return {**common, "language": pick_lang(rng), "count": rng.randint(3, 8)}
    if task == "titles":
        return {**common, "language": pick_lang(rng), "count": rng.randint(4, 10)}
    if task == "description":
        links = rng.choice(["", "Instagram: @" + re.sub(r"\W", "", b["brief"].split()[0].lower())[:12] + "_official",
                            "Shop: https://example.in/store", "Telegram: t.me/mychannel"])
        return {"brief": b["brief"], "language": pick_lang(rng), "links": links}
    if task == "outline":
        return {**common, "language": pick_lang(rng), "structure": rng.choice(STRUCTURES)}
    if task == "dialogue":
        d = rng.choice(seed["dialogues"])
        return {"brief": d["brief"], "characters": d["characters"], "tone": rng.choice(TONES), "audience": b.get("audience", ""),
                "language": pick_lang(rng), "length": rng.choice(["short", "medium"])}
    if task == "shotlist":
        return {"script": rng.choice(seed["scripts"]), "aspect_ratio": rng.choice(ASPECTS)}
    if task == "prompt":
        return {"prompt": rng.choice(seed["ideas"]), "target": rng.choice(["video", "image"]), "style": rng.choice(STYLES)}
    if task == "social":
        return {**common, "language": pick_lang(rng), "platforms": rng.sample(PLATFORMS, rng.randint(1, 3))}
    if task == "rewrite":
        return {"text": rng.choice(seed["texts"]), "tone": rng.choice(TONES), "language": pick_lang(rng), "goal": rng.choice(GOALS)}
    if task == "title_ab":
        return {"titles": "\n".join(rng.choice(seed["title_sets"])), "audience": b.get("audience", "")}
    if task == "seo":
        m = rng.choice(seed["metadata"])
        tags = m["tags"] if isinstance(m["tags"], str) else ", ".join(m["tags"])
        return {"title": m["title"], "description": m["description"], "tags": tags, "keyword": m["keyword"], "_quality": m.get("quality", "")}
    if task == "calendar":
        return {"niche": seed["niche"], "per_week": rng.randint(1, 4), "audience": b.get("audience", ""), "language": pick_lang(rng)}
    raise ValueError(task)


def seed_ok(s):
    try:
        return (len(s["briefs"]) >= 3 and all(x["brief"] for x in s["briefs"]) and s["dialogues"] and s["scripts"] and s["texts"]
                and all(isinstance(t, list) and len(t) >= 2 for t in s["title_sets"]) and len(s["metadata"]) >= 3 and s["ideas"])
    except (KeyError, TypeError):
        return False


SCRIPT_RANGES = {"hi": (0x0900, 0x097F), "mr": (0x0900, 0x097F), "te": (0x0C00, 0x0C7F), "ta": (0x0B80, 0x0BFF),
                 "kn": (0x0C80, 0x0CFF), "ml": (0x0D00, 0x0D7F), "bn": (0x0980, 0x09FF)}
# Fields whose text should be in the chosen language (others, e.g. camera_move or tags, may stay English).
TEXT_FIELDS = {"script": ["title", "logline", "narration", "cta"], "hooks": ["text"], "titles": ["text"], "description": ["description"],
               "outline": ["title", "summary"], "dialogue": ["line"], "social": ["text"], "rewrite": ["text"], "calendar": ["title", "hook"]}


def _strings(o, keys):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, str) and k in keys:
                yield v
            else:
                yield from _strings(v, keys)
    elif isinstance(o, list):
        for v in o:
            yield from _strings(v, keys)


def language_ok(task, lang, out):
    """Share of letters in the target script. Hindi output in Latin letters was the old model's main failure."""
    if task not in TEXT_FIELDS:
        return True
    text = " ".join(_strings(out, set(TEXT_FIELDS[task])))
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 5:
        return False
    if lang in SCRIPT_RANGES:
        lo, hi = SCRIPT_RANGES[lang]
        return sum(lo <= ord(c) <= hi for c in letters) / len(letters) >= 0.6
    return sum(c.isascii() for c in letters) / len(letters) >= 0.9


def _items(out, key="items", n=None):
    v = out.get(key)
    return isinstance(v, list) and len(v) > 0 and (n is None or len(v) == n) and all(isinstance(x, dict) for x in v)


def check(task, params, out):
    """Returns (ok, reason). Also fixes numbers the model can't count reliably (title lengths)."""
    if out is None:
        return False, "not JSON"
    lang = params.get("language") or "en"
    try:
        if task == "script":
            ok = isinstance(out.get("title"), str) and _items(out, "scenes") and all("narration" in s for s in out["scenes"])
        elif task == "hooks":
            ok = _items(out, n=int(params["count"])) and all(x.get("text") for x in out["items"])
        elif task == "titles":
            ok = _items(out, n=int(params["count"])) and all(x.get("text") for x in out["items"])
            if ok:
                for x in out["items"]:
                    x["chars"] = len(x["text"])
                ok = all(x["chars"] <= 70 for x in out["items"])
        elif task == "description":
            ok = isinstance(out.get("description"), str) and len(out["description"]) > 80 and isinstance(out.get("tags"), list)
            if ok and params.get("links"):
                ok = params["links"].split(": ", 1)[-1] in out["description"]
        elif task == "outline":
            ok = _items(out, "beats") and all(b.get("name") and b.get("summary") for b in out["beats"])
        elif task == "dialogue":
            ok = _items(out, "lines") and len(out["lines"]) >= 4 and all(x.get("character") and x.get("line") for x in out["lines"])
        elif task == "shotlist":
            ok = _items(out, "shots") and all(s.get("prompt") and s.get("camera_move") in CAMERA_MOVES for s in out["shots"])
        elif task == "prompt":
            ok = _items(out, n=3) and all(len(x.get("text", "")) > 40 for x in out["items"])
        elif task == "social":
            plats = params["platforms"] if isinstance(params["platforms"], list) else [params["platforms"]]
            ok = _items(out) and {x.get("platform") for x in out["items"]} >= set(plats) and all(x.get("text") for x in out["items"])
        elif task == "rewrite":
            ok = isinstance(out.get("text"), str) and len(out["text"]) > 3
            if ok and params.get("goal") == "Hinglish":   # Hindi words in Latin letters, so the script check doesn't apply
                latin = sum(c.isascii() for c in out["text"] if c.isalpha()) / max(1, sum(c.isalpha() for c in out["text"])) > 0.9
                return latin, "" if latin else "Hinglish must be Latin letters"
        elif task == "title_ab":
            n = len([t for t in params["titles"].split("\n") if t.strip()])
            ok = _items(out, n=n) and isinstance(out.get("winner"), str) and out.get("why")
            if ok:
                for x in out["items"]:
                    x["chars"] = len(x.get("text", ""))
        elif task == "seo":
            s = out.get("score")
            ok = isinstance(s, (int, float)) and 0 <= s <= 100 and _items(out, "checks") and out.get("improved_title")
            q = params.get("_quality")
            if ok and q == "weak" and s > 45:
                return False, f"weak metadata scored {s}"
            if ok and q == "strong" and s < 55:
                return False, f"strong metadata scored {s}"
        elif task == "calendar":
            pw = int(params["per_week"])
            ok = _items(out, "weeks", n=4) and all(_items(w, "items", n=pw) and all(i.get("title") for i in w["items"]) for w in out["weeks"])
        else:
            return False, "unknown task"
    except (TypeError, ValueError, AttributeError, KeyError):
        return False, "wrong shape"
    if not ok:
        return False, "wrong shape"
    if task != "rewrite" or params.get("goal") != "Hinglish":
        if not language_ok(task, lang, out):
            return False, f"not in {lang}"
    return True, ""


def public_params(p):
    return {k: v for k, v in p.items() if not k.startswith("_")}


def jobs(prompts, seeds, counts, seed=7):
    """[(task, params)] for the teacher, spread across niches."""
    rng = random.Random(seed)
    out = []
    for task, n in counts.items():
        for i in range(n):
            out.append((task, make_params(task, seeds[i % len(seeds)], rng)))
    rng.shuffle(out)
    return out
