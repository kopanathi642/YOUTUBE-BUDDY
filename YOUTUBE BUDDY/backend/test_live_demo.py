"""
YouTube Buddy — Live Demo Test Script
Tests the full flow: signup → auth → AI generation (text + image)
"""
import json
import sys
import requests

BASE_URL = "http://127.0.0.1:8000/api/v1"

def header_box(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def step(num, desc):
    print(f"\n  [{num}] {desc}")
    print(f"  {'-'*50}")

# ── 1. Sign Up ──────────────────────────────────────────────
header_box("YOUTUBE BUDDY — LIVE DEMO TEST")

step(1, "Creating test user via /auth/signup")
signup_resp = requests.post(f"{BASE_URL}/auth/signup", json={
    "email": "demo@youtubebuddy.com",
    "password": "DemoTest123!",
    "display_name": "Demo Creator"
})

if signup_resp.status_code == 200:
    token_data = signup_resp.json()
    token = token_data["access_token"]
    print(f"  [OK] Signed up! Token: {token[:30]}...")
elif signup_resp.status_code in [400, 409]:
    # User already exists, try login
    step("1b", "User exists, logging in via /auth/login")
    login_resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "demo@youtubebuddy.com",
        "password": "DemoTest123!"
    })
    if login_resp.status_code != 200:
        print(f"  [FAIL] Login failed: {login_resp.status_code} {login_resp.text}")
        sys.exit(1)
    token = login_resp.json()["access_token"]
    print(f"  [OK] Logged in! Token: {token[:30]}...")
else:
    print(f"  [FAIL] Signup failed: {signup_resp.status_code} {signup_resp.text}")
    sys.exit(1)

auth_headers = {"Authorization": f"Bearer {token}"}

# ── 2. Test auth works ─────────────────────────────────────
step(2, "Verifying auth via /auth/profile")
me_resp = requests.get(f"{BASE_URL}/auth/profile", headers=auth_headers)
if me_resp.status_code == 200:
    user = me_resp.json()
    print(f"  [OK] Authenticated as: {user.get('email')} (display: {user.get('display_name')})")
else:
    print(f"  [FAIL] Auth check failed: {me_resp.status_code} {me_resp.text}")
    sys.exit(1)

# ── 3. Test analytics (no fake data) ───────────────────────
step(3, "Checking analytics overview (should show real DB counts)")
analytics_resp = requests.get(f"{BASE_URL}/analytics/overview", headers=auth_headers)
if analytics_resp.status_code == 200:
    stats = analytics_resp.json()
    print(f"  [OK] Analytics Overview:")
    for k, v in stats.items():
        print(f"     * {k}: {v}")
else:
    print(f"  [WARN] Analytics: {analytics_resp.status_code} {analytics_resp.text}")

step("3b", "Checking channel stats (no hardcoded YouTube data)")
channel_resp = requests.get(f"{BASE_URL}/analytics/channel", headers=auth_headers)
if channel_resp.status_code == 200:
    channel = channel_resp.json()
    print(f"  [OK] Channel Stats (from DB only - no fake YouTube data):")
    for k, v in channel.items():
        print(f"     * {k}: {v}")
    # Verify no fake YouTube fields
    if "totalViews" not in channel and "avgViewsPerVideo" not in channel:
        print(f"  [OK] PASS: No fake YouTube metrics - only real DB data!")
    else:
        print(f"  [WARN] Still has YouTube fields: {[k for k in channel if k in ('totalViews','avgViewsPerVideo','subscriberGrowthRate')]}")
else:
    print(f"  [WARN] Channel stats: {channel_resp.status_code}")

# ── 4. Test AI Text Generation ──────────────────────────────
step(4, "Testing AI text generation via /studio/generate")

# Try Gemini first, then any available provider
text_result = None
for provider in ["gemini", "openai", "huggingface", "ollama"]:
    print(f"  -> Trying provider: {provider}...")
    gen_resp = requests.post(f"{BASE_URL}/studio/generate", headers=auth_headers, json={
        "tool_id": "script",
        "prompt": "Write a 30-second YouTube Shorts script about '5 mind-blowing AI facts that will change your life'. Make it energetic and engaging.",
        "provider": provider,
        "style": "viral"
    })
    if gen_resp.status_code == 200:
        result = gen_resp.json()
        text_result = result
        print(f"  [OK] TEXT GENERATION SUCCESS with {provider}!")
        print(f"     Tool: {result.get('tool_id')}")
        print(f"     Provider: {result.get('provider')}")
        print(f"     Status: {result.get('status')}")
        print(f"\n  -- Generated Script ------------------------------")
        generated = result.get('generated_text', '')
        # Show first 500 chars
        preview = generated[:500] + ("..." if len(generated) > 500 else "")
        for line in preview.split('\n'):
            print(f"     {line}")
        print(f"  ------------------------------------------------")
        break
    else:
        detail = gen_resp.json().get('detail', gen_resp.text)
        print(f"     [FAIL] {provider}: {gen_resp.status_code} - {detail[:100]}")

if not text_result:
    print(f"\n  [WARN] No AI provider available. You need to set at least one API key:")
    print(f"     * GEMINI_API_KEY (FREE!) - https://aistudio.google.com/apikey")
    print(f"     * OPENAI_API_KEY")
    print(f"     * HUGGINGFACE_API_KEY")

# ── 5. Test AI Image Generation ─────────────────────────────
step(5, "Testing AI image generation via /studio/generate")

image_result = None
for provider in ["gemini", "openai", "huggingface"]:
    print(f"  -> Trying provider: {provider}...")
    img_resp = requests.post(f"{BASE_URL}/studio/generate", headers=auth_headers, json={
        "tool_id": "cineshot",
        "prompt": "A futuristic YouTube studio with neon lights, holographic screens showing analytics, and a creator sitting in a gaming chair. Cinematic, moody lighting, 4K quality.",
        "provider": provider,
        "style": "cinematic",
        "aspect_ratio": "16:9"
    })
    if img_resp.status_code == 200:
        result = img_resp.json()
        image_result = result
        print(f"  [OK] IMAGE GENERATION SUCCESS with {provider}!")
        print(f"     Tool: {result.get('tool_id')}")
        print(f"     Provider: {result.get('provider')}")
        print(f"     Status: {result.get('status')}")
        output = result.get('model_output', {})
        if isinstance(output, dict):
            print(f"     Image URL: {output.get('url', 'N/A')}")
            print(f"     Local Path: {output.get('local_path', 'N/A')}")
        break
    else:
        detail = img_resp.json().get('detail', img_resp.text)
        print(f"     [FAIL] {provider}: {img_resp.status_code} - {detail[:100]}")

if not image_result:
    print(f"\n  [WARN] No image provider available. Set GEMINI_API_KEY or OPENAI_API_KEY.")

# ── 6. Test Studio History ──────────────────────────────────
step(6, "Checking studio generation history")
hist_resp = requests.get(f"{BASE_URL}/studio/history", headers=auth_headers)
if hist_resp.status_code == 200:
    history = hist_resp.json()
    entries = history.get("data", [])
    print(f"  [OK] Found {len(entries)} generation(s) in history:")
    for entry in entries:
        print(f"     * [{entry.get('tool_id')}] {entry.get('prompt','')[:60]}... ({entry.get('status')})")
else:
    print(f"  [WARN] History: {hist_resp.status_code}")

# ── Summary ─────────────────────────────────────────────────
header_box("TEST RESULTS SUMMARY")
results = [
    ("Auth (signup/login)", True),
    ("Auth (me endpoint)", me_resp.status_code == 200),
    ("Analytics (no fake data)", channel_resp.status_code == 200 and "totalViews" not in channel_resp.json()),
    ("AI Text Generation", text_result is not None),
    ("AI Image Generation", image_result is not None),
    ("Studio History", hist_resp.status_code == 200),
]

for name, passed in results:
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}")

passed_count = sum(1 for _, p in results if p)
total = len(results)
print(f"\n  Score: {passed_count}/{total} tests passed")

if passed_count < total:
    print(f"\n  [TIP] To fix failing tests, add a free Gemini API key:")
    print(f"     1. Go to: https://aistudio.google.com/apikey")
    print(f"     2. Create a key and paste it in backend/.env:")
    print(f"        GEMINI_API_KEY=your_key_here")
    print(f"     3. Restart the backend and re-run this test")
