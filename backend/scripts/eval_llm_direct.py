"""Evaluate the writing tools on the configured language model WITHOUT the web API (no account, no database):
calls the same prompt code the tools use (engines.run_llm) and saves every real answer plus automatic checks.

    LLM_BASE_URL=http://llm:8080 python scripts/eval_llm_direct.py            (prints JSON to stdout)

Used on the home server:  deploy/home/EVAL-WRITING.bat  ->  writing-eval.json
"""
import json
import re
import sys
import time

sys.path.insert(0, ".")
from app.tools import engines, providers  # noqa: E402

BRIEF = "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night."
DEVA = re.compile(r"[ऀ-ॿ]")
TELU = re.compile(r"[ఀ-౿]")


def chk_lang(out, script):
    txt = json.dumps(out, ensure_ascii=False)
    n = len(script.findall(txt))
    return n > 40, f"{n} characters in the target script"


CASES = [
    ("051", "script", {"brief": BRIEF, "format": "YouTube video", "tone": "friendly", "audience": "Indian college students", "length": "short"},
     lambda o: (len(o.get("scenes", [])) >= 3 and all(s.get("narration") for s in o.get("scenes", [])), f"{len(o.get('scenes', []))} scenes")),
    ("051", "script", {"brief": BRIEF, "format": "YouTube video", "language": "hi", "length": "short"}, lambda o: chk_lang(o, DEVA)),
    ("052", "hooks", {"brief": BRIEF, "count": 5}, lambda o: (len(o.get("items", [])) >= 4, f"{len(o.get('items', []))} hooks")),
    ("052", "hooks", {"brief": BRIEF, "count": 5, "language": "te"}, lambda o: chk_lang(o, TELU)),
    ("053", "titles", {"brief": BRIEF, "count": 6},
     lambda o: (len(o.get("items", [])) >= 5 and all(len(i.get("text", "")) <= 70 for i in o.get("items", [])),
                f"{len(o.get('items', []))} titles, longest {max([len(i.get('text', '')) for i in o.get('items', [])] or [0])} chars")),
    ("054", "description", {"brief": BRIEF, "links": "Instagram: @foodie_hyd"},
     lambda o: (len(o.get("description", "")) > 200 and len(o.get("tags", [])) >= 5, f"{len(o.get('description', ''))} chars, {len(o.get('tags', []))} tags")),
    ("055", "outline", {"brief": BRIEF, "structure": "three-act"}, lambda o: (len(o.get("beats", [])) >= 3, f"{len(o.get('beats', []))} beats")),
    ("056", "dialogue", {"brief": "Two friends argue whether Irani chai or filter coffee is better", "characters": "Ravi: funny, loud\nMeera: calm, sarcastic", "length": "short"},
     lambda o: (len(o.get("lines", [])) >= 6, f"{len(o.get('lines', []))} lines")),
    ("057", "shotlist", {"script": "Open on Charminar at sunset. I walk into the lane, steam rising from a haleem pot. Close-up of the first bite. I react, laugh, and point to the next stall.", "aspect_ratio": "9:16"},
     lambda o: (len(o.get("shots", [])) >= 3, f"{len(o.get('shots', []))} shots")),
    ("058", "prompt", {"prompt": "street food stall at night in old Hyderabad", "target": "video", "style": "cinematic"}, lambda o: (len(o.get("items", [])) >= 2, f"{len(o.get('items', []))} prompts")),
    ("059", "social", {"brief": BRIEF, "platforms": ["Instagram", "X"]}, lambda o: (len(o.get("items", [])) >= 2, f"{len(o.get('items', []))} posts")),
    ("060", "rewrite", {"text": "Bro this biryani is literally insane, you have to try it, no cap.", "tone": "professional", "goal": "clearer"},
     lambda o: ("biryani" in o.get("text", "").lower(), "keeps the subject")),
    ("060", "rewrite", {"text": "This biryani is excellent and you should definitely try it when you visit.", "goal": "Hinglish (Hindi words in Latin letters mixed with English)", "tone": "casual"},
     lambda o: (bool(re.search(r"\b(hai|bhai|yaar|zaroor|ekdum|kya|bahut|mast)\b", o.get("text", "").lower())), "has Hindi words")),
    ("076", "title_ab", {"titles": "I Ate Hyderabad Street Food for ₹500\nHyderabad Food Tour - Old City\n5 Foods You MUST Try in Hyderabad", "audience": "Indian food lovers"},
     lambda o: (len(o.get("items", [])) == 3 and bool(o.get("winner")), f"winner: {o.get('winner')}")),
    ("078", "seo", {"title": "Hyderabad street food", "description": "food vlog", "tags": "food, vlog", "keyword": "hyderabad street food"},
     lambda o: (0 <= float(o.get("score", 100)) <= 60, f"score {o.get('score')} for a weak 2-word description (should be low)")),
    ("079", "calendar", {"niche": "South Indian street food", "per_week": 2, "audience": "Indian 18-30"},
     lambda o: (len(o.get("weeks", [])) == 4 and all(len(w.get("items", [])) >= 2 for w in o.get("weeks", [])), f"{len(o.get('weeks', []))} weeks")),
]


class RC:
    def __init__(self, p):
        self.p, self.model, self.result = p, None, {}

    def progress(self, *a):
        pass


def main():
    only = set(sys.argv[1:])
    out = {"model": providers.os.environ.get("LLM_LOCAL_MODEL", "local"), "base": providers.os.environ.get("LLM_BASE_URL"), "cases": []}
    for tid, task, params, check in CASES:
        if only and tid not in only:
            continue
        t0 = time.time()
        rec = {"tool": tid, "task": task, "params": params}
        try:
            o = engines.run_llm(RC(params), task)
            ok, why = check(o)
            rec.update(status="ok", seconds=round(time.time() - t0, 1), check=ok, check_detail=why, output=o)
        except Exception as e:  # noqa: BLE001
            rec.update(status="error", seconds=round(time.time() - t0, 1), check=False, check_detail=f"{type(e).__name__}: {e}"[:300])
        out["cases"].append(rec)
        print(f"{tid} {task} {rec['status']} {rec['seconds']}s check={rec['check']} {rec['check_detail']}", file=sys.stderr, flush=True)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
