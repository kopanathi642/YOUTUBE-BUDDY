"""CPU story decisions using source order, measured image quality, motion and existing transcripts."""
import math
import re

from .run import ToolError


# Format, identifying words, cutting strategy, default feeling.
FORMATS = {
    "General video": (r"$^", "montage", "Natural"),
    "Vlog / travel": (r"vlog|travel|trip", "journey", "Joyful"),
    "Wedding / event": (r"wedding|ceremony|vows|family|celebration", "journey", "Tender"),
    "Interview / podcast": (r"interview|podcast|conversation|speech", "dialogue", "Natural"),
    "Tutorial": (r"tutorial|lesson|teach|how.to|demonstration", "dialogue", "Natural"),
    "Documentary / film": (r"documentary|short film|filmmaking|cinematic film", "journey", "Reflective"),
    "Sports / gaming": (r"sport|athlet|goal|gaming|gameplay|match", "action", "Energetic"),
    "Music video": (r"music video|dance|concert", "montage", "Energetic"),
    "Short / reel": (r"shorts?\b|reel|tiktok", "montage", "Energetic"),
    "Advertisement": (r"\bad\b|advertis|commercial|product reveal|teaser", "advert", "Natural"),
}
FEELINGS = {
    "Tender": (r"tender|heartfelt|romantic|intimate|emotional", 1.45, "elegant warm"),
    "Reflective": (r"reflective|quiet|thoughtful|nostalg|melanchol|sad", 1.6, "natural"),
    "Joyful": (r"joy|happy|celebrat|cheerful", .85, "elegant warm"),
    "Tense": (r"tense|tension|suspense|anxious", .8, "cool cinematic"),
    "Energetic": (r"energetic|excit|fast|hype", .65, "teal & orange"),
    "Natural": (r"natural|neutral", 1., "natural"),
}


def direction(text, requested, feeling):
    text = text.casefold()
    if requested not in FORMATS and re.search(FORMATS["Advertisement"][0], text):
        requested = "Advertisement"
    genre = requested if requested in FORMATS else next(
        (name for name, (pattern, _, _) in FORMATS.items() if re.search(pattern, text)), "General video")
    mood = feeling if feeling in FEELINGS else next(
        (name for name, (pattern, _, _) in FEELINGS.items() if re.search(pattern, text)), FORMATS[genre][2])
    return genre, mood


def story_picks(assets, pool, settings, beats, previous):
    """Return frame-aligned, natural-speed source ranges; each selection consumes its source range."""
    fps = 30
    genre, feeling = settings["genre"], settings["feeling"]
    strategy = FORMATS[genre][1]
    words = set(re.findall(r"\w{3,}", settings.get("brief", "").casefold())) - {
        "the", "and", "this", "that", "with", "video", "make", "edit", "keep", "from", "into", "show"}
    order = list(assets)
    limit = {aid: math.floor((a.duration_s or 0) * fps) if a.kind == "video" else 6 * fps for aid, a in assets.items()}
    cursor = dict.fromkeys(order, 0)
    target = int(settings["duration"] * fps)
    if sum(limit.values()) < target:
        raise ToolError("The selected footage is shorter than the requested edit. Choose a shorter length or add clips.")
    hold = {"dialogue": 12, "journey": 6, "action": 3, "montage": 4}[strategy]
    hold *= FEELINGS[feeling][1] * {"calm": 1.35, "medium": 1, "energetic": .75}[settings["pace"]]
    pos, shots = 0, []
    end_id = settings.get("reveal_asset")
    reserve = min(round(hold * fps), target // 4, limit.get(end_id, 0))
    if reserve:
        limit[end_id] -= reserve
    end = target - reserve
    beat_frames = [round(t * fps) for t in beats]
    prev_shots = (previous or {}).get("shots", [])
    while pos < end:
        left = end - pos
        spare = sum(limit[a] - cursor[a] for a in order) - left
        candidates = []
        for rank, aid in enumerate(order):
            a = assets[aid]
            available = limit[aid] - cursor[aid]
            if available < 1:
                continue
            analysis = a.analysis or {}
            transcript = (analysis.get("transcript") or {}).get("segments") or []
            for w in pool:
                if w["clip"] != aid:
                    continue
                start = max(cursor[aid], round(w["start"] * fps))
                if start >= limit[aid] or start - cursor[aid] > spare or round(w["end"] * fps) <= cursor[aid]:
                    continue
                score = w["quality"] + (w["energy"] if strategy == "action" else .4 * w["calm"])
                reason = "Measured motion and picture quality" if strategy == "action" else "Measured steadiness and picture quality"
                if strategy in ("journey", "dialogue"):
                    expected_rank = min(len(order) - 1, math.floor(pos * len(order) / max(1, end)))
                    score -= abs(rank - expected_rank) * 4 + (start - cursor[aid]) / fps * .1
                if not (0.08 <= w["bright"] <= .95 and w["sharp"] >= 15):
                    score -= 12
                if shots and strategy in ("action", "montage") and shots[-1][0] == aid:
                    score -= 1
                if feeling == "Tender" and w["faces"]:
                    score += .35
                    reason += "; face visible"
                if strategy == "dialogue":
                    for seg in transcript:
                        sf = round(seg["start"] * fps)
                        if start <= sf < min(limit[aid], round(w["end"] * fps)) and sf - cursor[aid] <= spare:
                            matched = words.intersection(re.findall(r"\w{3,}", seg["text"].casefold()))
                            start = sf
                            score += .5 + min(4, len(matched))
                            reason = "Transcript phrase start" + (" matching “" + sorted(matched)[0] + "”" if matched else "")
                            break
                if not shots and settings.get("avoid_hook") and prev_shots and prev_shots[0]["window"] == w["uid"]:
                    score -= 10
                candidates.append((score, -rank, -start, aid, start, w, reason))
            # Measured windows may omit short tails. Keep remaining source material available.
            if not any(c[3] == aid for c in candidates):
                w = next((x for x in pool if x["clip"] == aid), None)
                if w:
                    candidates.append((-100, -rank, -cursor[aid], aid, cursor[aid], w, "Next unused source interval"))
        if not candidates:
            raise ToolError("There is too little usable footage for this duration.")
        _, _, _, aid, start, w, reason = max(candidates, key=lambda c: c[:3])
        maximum = min(left, limit[aid] - start)
        arc = 1 - .45 * pos / target if feeling == "Tense" else 1
        length = min(maximum, max(1, round(hold * arc * fps)))
        if strategy == "dialogue":
            segs = ((assets[aid].analysis or {}).get("transcript") or {}).get("segments") or []
            ends = [round(x["end"] * fps) - start for x in segs]
            near = [n for n in ends if length * .55 <= n <= min(maximum, length * 1.5)]
            if near:
                length = min(near, key=lambda n: abs(n-length))
                reason += "; held to a transcript phrase ending"
        elif beats:
            near = [b-pos for b in beat_frames if max(1, length*.75) <= b-pos <= min(maximum, length*1.25)]
            if near:
                length = min(near, key=lambda n: abs(n-length))
        shots.append((aid, start, length, pos, w, reason))
        cursor[aid] = start + length
        pos += length
    if reserve:
        w = next(w for w in pool if w["clip"] == end_id)
        shots.append((end_id, limit[end_id], reserve, pos, w, "Your chosen closing clip"))
    return shots
