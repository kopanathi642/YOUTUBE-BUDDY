# Writing tools on the free self-hosted model — real outputs reviewed (2026-11-07)

Model: **Qwen2.5-1.5B-Instruct** (Apache-2.0), GGUF Q4_K_M (pinned sha256 `6a1a2eb6…407e`), served by llama.cpp (`llama-cpp-python` 0.3.16) on 4 CPU cores at ~10 tokens/s, through the app's own API (`LLM_BASE_URL`, no API key, ₹0 per run).

**Decision:** with only `LLM_BASE_URL` set, the 6 tools marked ✅ are enabled, in **English only** (other languages are refused with a clear message instead of silently answering in English). Every other writing tool, and all non-English writing, stays hidden until a Claude or OpenAI key is added (`LLM_LOCAL_TOOLS` overrides the list). Hosted models were **not** tested here (no key): run `backend/scripts/eval_writing.py` after adding one before announcing them.

| Tool | Result | Time | Verdict |
|---|---|---|---|
| 052 Hook Generator | succeeded | 36 s | ✅ usable — generic but on-brief hooks |
| 053 Title Lab | succeeded | 27 s | ⚠️ weak — bland titles, character counts not reliable |
| 054 Description & Tags | succeeded | 42 s | ✅ usable — relevant tags/hashtags |
| 056 Dialogue Writer | succeeded | 33 s | ✅ usable — natural back-and-forth, keeps the characters |
| 057 Script to Shot List | succeeded | 33 s | ✅ usable — shots follow the script |
| 058 Prompt Director | succeeded | 60 s | ⚠️ ok-ish prompt, slow (60 s) |
| 059 Social Post Writer | succeeded | 24 s | ✅ usable — on-brief posts with emoji |
| 076 Title A/B Scorer | succeeded | 42 s | ⚠️ scores plausible but reasons shallow |
| 078 SEO Analyzer | succeeded | 21 s | ❌ scored a 2-word title and 'food vlog' description 90/100 — misleading |
| 079 Content Calendar | failed | 160 s | ⚠️ good when it works, but failed 1 of 2 runs (long answer → invalid JSON) — not enabled |
| 119 Director Agent | succeeded | 45 s | ❌ planned a Talking Avatar with made-up file paths — nonsense |
| 051 Script Writer | failed | 160 s | ❌ English: answer cut off (long script exceeded the length limit, invalid JSON). Hindi: came back 100% English (0 Devanagari characters) |
| 051 Script Writer (Hindi) | succeeded | 87 s | ❌ English: answer cut off (long script exceeded the length limit, invalid JSON). Hindi: came back 100% English (0 Devanagari characters) |
| 055 Story Structure | succeeded | 54 s | ✅ usable — sensible three-act outline |
| 060 Rewrite & Tone Shift | succeeded | 6 s | ❌ tone shifts lose meaning ('No limits'); 'Hinglish' goal not followed |
| 060 Rewrite & Tone Shift | succeeded | 6 s | ❌ tone shifts lose meaning ('No limits'); 'Hinglish' goal not followed |
| 079 Content Calendar | succeeded | 87 s | ⚠️ good when it works, but failed 1 of 2 runs (long answer → invalid JSON) — not enabled |

## Sample outputs (verbatim, truncated)

**052 Hook Generator** — input: `{"brief": "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night.", "count": 5}`

```json
{
 "kind": "hooks",
 "items": [
  {
   "why": "It sets the tone right from the beginning and piques interest",
   "text": "Hey there, folks! I'm super excited to start my travel vlog today. We're hitting the streets of Hyderabad's Old City for a culinary adventure!",
   "score": 8,
   "technique": "Hooked with excitement and anticipation"
  },
  {
   "why": "It sets the tone for what to expect throughout the video",
   "text": "Let’s dive into Hyderabad’s vibrant streets where we’re trying out five famous street foods. It's all about exploring local flavors at an unbeatable price.",
   "score": 8,
   "technique": "Hooked with curiosity and excitement"
  },
  {
   "why": "It sets the tone for
```

**053 Title Lab** — input: `{"brief": "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night.", "count": 6}`

```json
{
 "kind": "titles",
 "items": [
  {
   "why": "Exploring local cuisine in a friendly tone",
   "text": "6-minute travel vlog: Hyderabad's Old City street foods",
   "chars": 70,
   "clarity": 9,
   "curiosity": 8
  },
  {
   "why": "Simplifying the journey with clear details",
   "text": "5 famous street foods under 500 rupees",
   "chars": 70,
   "clarity": 8,
   "curiosity": 6
  },
  {
   "why": "Adding a destination to make it more engaging",
   "text": "Charminar at night: ending our Hyderabad adventure",
   "chars": 70,
   "clarity": 9,
   "curiosity": 5
  }
 ]
}
```

**054 Description & Tags** — input: `{"brief": "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night.", "links": "Instagra`

```json
{
 "kind": "description",
 "tags": [
  "travel",
  "vlog",
  "street foods",
  "Hyderabad",
  "Old City",
  "charminar",
  "budget-friendly"
 ],
 "hashtags": [
  "#foodie_hyd",
  "#hyd_travel",
  "#streetfoods",
  "#budgettravel",
  "#oldcity",
  "#charminar"
 ],
 "keywords": [
  "Hyderabad street foods",
  "5 famous street foods",
  "travel vlog",
  "street food adventure",
  "budget-friendly travel",
  "Old City Hyderabad",
  "Charminar visit",
  "foodie_hyd Instagram",
  "street food experiences"
 ],
 "description": "Experience the vibrant flavors of Hyderabad's Old City with our latest travel vlog! In just 6 minutes, we explore and enjoy 5 famous street foods that are under 500 rupees. D
```

**056 Dialogue Writer** — input: `{"brief": "Two friends argue whether Irani chai or filter coffee is better", "characters": "Ravi: funny, loud\nMeera: calm, sarcastic"}`

```json
{
 "kind": "dialogue",
 "lines": [
  {
   "line": "Meera, you're the one who always insists on Irani chai. How about we decide this once and for all?",
   "character": "Ravi",
   "direction": "Ravi is trying to get Meera's attention with a loud voice."
  },
  {
   "line": "Oh come on, Ravi. Let's have some fun. I'll show you what it means to drink filter coffee.",
   "character": "Meera",
   "direction": "Meera is calm and sarcastic as she starts brewing the filter coffee."
  },
  {
   "line": "Alright, alright. You're on Meera. Let's see how good your Irani chai can be.",
   "character": "Ravi",
   "direction": "Ravi agrees to let Meera have her way, trying to keep a friendly tone."
  }
 ],
```

**057 Script to Shot List** — input: `{"script": "Open on Charminar at sunset. I walk into the lane, steam rising from a haleem pot. Close-up of the first bite. I react, laugh, and point to the next`

```json
{
 "kind": "shotlist",
 "shots": [
  {
   "lens": "wide-angle",
   "prompt": "Opening shot: Charminar at sunset",
   "duration": 3,
   "camera_move": "static",
   "camera_angle": ""
  },
  {
   "lens": "standard",
   "prompt": "Close-up of the first bite",
   "duration": 1.5,
   "camera_move": "static",
   "camera_angle": "up close"
  },
  {
   "lens": "wide-angle",
   "prompt": "Reaction shot: I walk into the lane, steam rising from a haleem pot.",
   "duration": 2,
   "camera_move": "push in",
   "camera_angle": ""
  },
  {
   "lens": "standard",
   "prompt": "Close-up of the first bite. I react, laugh, and point to the next stall.",
   "duration": 1.5,
   "camera_move": "pan left",
   "ca
```

**058 Prompt Director** — input: `{"prompt": "street food stall at night in old Hyderabad"}`

```json
{
 "kind": "prompt",
 "items": [
  {
   "why": "The prompts capture a vivid scene of street food preparation at night in Hyderabad, emphasizing the vibrant colors and flickering lights to create an immersive cinematic photo style.",
   "text": "A bustling street food stall at night in old Hyderabad, with vibrant colors and flickering lights. The camera captures the action of cooks preparing dishes while customers browse for their favorite snacks. The setting is a dimly lit alleyway lined with traditional bazaars. The lens focuses on intricate details of the food stalls and the faces of the street vendors. The light source comes from overhead, casting long shadows that highlight the textures 
```

**059 Social Post Writer** — input: `{"brief": "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night.", "platforms": ["Ins`

```json
{
 "kind": "social",
 "items": [
  {
   "text": "Hey friends! 🚀 So, I've got a super fun travel vlog for you today. 🌟 It's a 6-minute journey through Hyderabad's Old City, where we're trying out some of the best street foods under 500 rupees. 🍳 Let me show you how to taste the local flavors without spending too much! We'll end our adventure at Charminar in the evening, and I promise it’ll be a night to remember. #HyderabadFoodFestival #StreetFood #TravelVlog",
   "hashtags": [
    "#HyderabadOldCity",
    "#StreetFood",
    "#TasteTheLocal",
    "#Under500Rupees"
   ],
   "platform": "Instagram"
  }
 ]
}
```

**076 Title A/B Scorer** — input: `{"titles": "I Ate Hyderabad Street Food for ₹500\nHyderabad Food Tour - Old City\n5 Foods You MUST Try in Hyderabad", "audience": "Indian food lovers"}`

```json
{
 "why": "The title 'I Ate Hyderabad Street Food for ₹500' offers high clarity and curiosity by clearly stating that it's a food tour costing ₹500, which is likely to attract audience interested in street food experiences at an affordable price.",
 "kind": "title_ab",
 "items": [
  {
   "text": "I Ate Hyderabad Street Food for ₹500",
   "chars": 124,
   "clarity": 8,
   "verdict": "High Clarity and Curiosity, with a specific focus on the cost and variety of street food options in Hyderabad.",
   "curiosity": 7,
   "specificity": 9
  },
  {
   "text": "Hyderabad Food Tour - Old City",
   "chars": 104,
   "clarity": 6,
   "verdict": "Moderate Clarity and Curiosity, with a focus on the overall
```

**078 SEO Analyzer** — input: `{"title": "Hyderabad street food", "description": "food vlog", "tags": "food, vlog", "keyword": "hyderabad street food"}`

```json
{
 "kind": "seo",
 "score": 90,
 "checks": [
  {
   "name": "Title",
   "pass": true,
   "detail": ""
  },
  {
   "name": "Description",
   "pass": false,
   "detail": "The description should be more specific and informative about the content. It's currently just 'food vlog'."
  },
  {
   "name": "Tags",
   "pass": true,
   "detail": ""
  }
 ],
 "improved_tags": [
  "Hyderabad street food",
  "street food tour",
  "food culture",
  "vlog"
 ],
 "improved_title": "Hyderabad Street Food: A Vlog"
}
```

**119 Director Agent** — input: `{"brief": "Make a 30 second vertical teaser from my vlog with captions", "budget_usd": 0}`

```json
{
 "kind": "workflow_plan",
 "graph": {
  "edges": [],
  "nodes": [
   {
    "id": "006",
    "note": "Create a 3D model from the vlog video and add captions to it.",
    "params": {
     "audio": "/path/to/audio/captions.mp3",
     "image": "/path/to/my/vlog/video.mp4"
    },
    "tool_id": "006"
   }
  ]
 },
 "summary": "Create a 30-second vertical teaser video from my vlog with captions",
 "est_cost_usd": 0
}
```

**051 Script Writer** — input: `{"brief": "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night.", "language": "hi", `

```json
{
 "cta": "Don't forget to like, share, and subscribe! See you in the next adventure!",
 "kind": "script",
 "title": "5 Street Foods in Hyderabad's Old City: A Street Food Adventure",
 "scenes": [
  {
   "heading": "Introduction",
   "visuals": [
    "A shot of a bustling Old City market with locals selling various street food items"
   ],
   "narration": "Hello everyone! Welcome back to my channel. Today I'm diving into the vibrant streets of Hyderabad's Old City and trying out some delicious street foods for under 500 rupees!",
   "duration_s": 30,
   "on_screen_text": "I'll be showcasing five famous street foods that you won't want to miss."
  },
  {
   "heading": "Street Food Adventure",
```

**055 Story Structure** — input: `{"brief": "A 6-minute travel vlog: trying 5 famous street foods in Hyderabad's Old City for under 500 rupees, ending at Charminar at night.", "structure": "thre`

```json
{
 "kind": "outline",
 "beats": [
  {
   "name": "Introduction",
   "minutes": 3,
   "purpose": "To engage the audience and set the tone for the story.",
   "summary": "A friendly travel vlogger introduces himself and sets the scene for a three-act street food adventure in Hyderabad’s Old City."
  },
  {
   "name": "Act 1: The First Street Food",
   "minutes": 3,
   "purpose": "To showcase the variety and quality of street food in Hyderabad’s Old City while engaging the audience.",
   "summary": "The vlogger tries the first of five famous street foods, describing each dish with a friendly tone."
  },
  {
   "name": "Act 2: The Second Street Food",
   "minutes": 3,
   "purpose": "To continue 
```

**060 Rewrite & Tone Shift** — input: `{"text": "Bro this biryani is literally insane, you have to try it, no cap.", "tone": "serious", "goal": "clearer"}`

```json
{
 "kind": "rewrite",
 "text": "This biryani is absolutely incredible; you must try it. No limits."
}
```

**060 Rewrite & Tone Shift** — input: `{"text": "This biryani is excellent and you should definitely try it when you visit.", "goal": "Hinglish"}`

```json
{
 "kind": "rewrite",
 "text": "This biryani is bang and you should definitely give it a try when u visit."
}
```

**079 Content Calendar** — input: `{"niche": "South Indian street food", "per_week": 2, "audience": "Indian 18-30"}`

```json
{
 "kind": "calendar",
 "weeks": [
  {
   "week": 1,
   "items": [
    {
     "day": "Monday",
     "hook": "Explore the rich history behind one of India's most beloved street foods, dosa. Learn how this simple yet versatile dish has evolved over centuries and its cultural significance.",
     "title": "Street Food Street Stories: The Origin of Dosa",
     "format": "Video"
    },
    {
     "day": "Tuesday",
     "hook": "Discover the latest trends in street food, from traditional vendors to online platforms that are transforming the way we eat and shop.",
     "title": "Street Food Trends: Street Vendors vs. Online Platforms",
     "format": "Blog Post"
    }
   ]
  },
  {
   "week": 2,
  
```

