"""Run the writing tools through a running server's API and save their real outputs for review.

    python scripts/eval_writing.py OUT.json   (server at http://127.0.0.1:8000 with LLM_BASE_URL or a Claude/OpenAI key)
"""
import json, sys, time, httpx
B = "http://127.0.0.1:8000/api/v1"; H = {"x-requested-with": "creator-universe"}
c = httpx.Client(base_url=B, headers=H, timeout=60)
c.post("/auth/signup", json={"email": f"writer{int(time.time())}@example.com", "password": "correct horse battery", "display_name": "Writer"})
ws = c.get("/auth/me").json()["workspaces"][0]["id"]
pid = c.post(f"/workspaces/{ws}/projects", json={"name": "Writing eval"}).json()["id"]
BRIEF = "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night."
CASES = [
    ("051", {"brief": BRIEF, "tone": "friendly", "audience": "Indian college students", "length": "short"}),
    ("051", {"brief": BRIEF, "language": "hi", "length": "short"}),
    ("052", {"brief": BRIEF, "count": 5}),
    ("053", {"brief": BRIEF, "count": 6}),
    ("054", {"brief": BRIEF, "links": "Instagram: @foodie_hyd"}),
    ("055", {"brief": BRIEF, "structure": "three-act"}),
    ("056", {"brief": "Two friends argue whether Irani chai or filter coffee is better", "characters": "Ravi: funny, loud\nMeera: calm, sarcastic"}),
    ("057", {"script": "Open on Charminar at sunset. I walk into the lane, steam rising from a haleem pot. Close-up of the first bite. I react, laugh, and point to the next stall."}),
    ("058", {"prompt": "street food stall at night in old Hyderabad"}),
    ("059", {"brief": BRIEF, "platforms": ["Instagram", "X"]}),
    ("060", {"text": "Bro this biryani is literally insane, you have to try it, no cap.", "tone": "serious", "goal": "clearer"}),
    ("060", {"text": "This biryani is excellent and you should definitely try it when you visit.", "goal": "Hinglish"}),
    ("076", {"titles": "I Ate Hyderabad Street Food for ₹500\nHyderabad Food Tour - Old City\n5 Foods You MUST Try in Hyderabad", "audience": "Indian food lovers"}),
    ("078", {"title": "Hyderabad street food", "description": "food vlog", "tags": "food, vlog", "keyword": "hyderabad street food"}),
    ("079", {"niche": "South Indian street food", "per_week": 2, "audience": "Indian 18-30"}),
    ("119", {"brief": "Make a 30 second vertical teaser from my vlog with captions", "budget_usd": 0}),
]
out = []
for tid, params in CASES:
    t0 = time.time()
    r = c.post(f"/projects/{pid}/ai/tools/{tid}/run", json={"params": params})
    if r.status_code != 201:
        out.append({"tool": tid, "params": params, "status": f"refused {r.status_code}", "error": r.text[:300]}); print(tid, "refused", r.text[:200], flush=True); continue
    g = r.json()
    while g["status"] in ("queued", "running") and time.time() - t0 < 900:
        time.sleep(3); g = c.get(f"/generations/{g['id']}").json()
    out.append({"tool": tid, "params": params, "status": g["status"], "error": g.get("error"), "seconds": round(time.time() - t0),
                "est_cost_usd": g.get("est_cost_usd"), "result": g.get("result")})
    print(tid, g["status"], round(time.time() - t0), "s", (g.get("error") or json.dumps(g.get("result"), ensure_ascii=False))[:300], flush=True)
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
