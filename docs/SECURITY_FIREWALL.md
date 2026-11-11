# Firewall: two layers

No site can be made impossible to attack. The goal is to make attacks expensive, automatic to block and visible.

## Layer 1: Cloudflare (in front of everything, free plan)
Every visitor reaches youtubebuddy.com through Cloudflare and the Cloudflare Tunnel. The laptop opens no ports to the internet.
The owner switches these on in the Cloudflare dashboard (they can't be set from the code):

| Where in Cloudflare | Setting | Why |
| --- | --- | --- |
| Security → Settings | Security level **Medium**, Browser Integrity Check **On** | Challenges known-bad IPs and fake browsers |
| Security → Bots | **Bot Fight Mode On** | Blocks simple scraping and credential-stuffing bots |
| Security → WAF → Managed rules | **Cloudflare Free Managed Ruleset On** | Blocks common exploits (SQL injection, Log4j, etc.) |
| Security → WAF → Rate limiting rules (1 free rule) | Path starts with `/api/v1/auth/`, 20 requests / 10 s per IP → Block 1 hour | Stops password guessing before it reaches the server |
| Security → WAF → Custom rules (5 free) | Block `(http.request.uri.path contains "/.env") or (http.request.uri.path contains "/wp-") or (http.request.uri.path contains ".php")` | Drops scanner traffic at the edge |
| SSL/TLS → Edge certificates | **Always Use HTTPS On**, **Minimum TLS 1.2**, **HSTS On** (6 months, include subdomains) | Encrypted connections only |
| DNS → Settings | **DNSSEC On** | Stops DNS spoofing of the domain |
| Overview | **Under Attack Mode**: only during an attack | Every visitor solves a check before entering |

## Layer 2: the app's own shield (`backend/app/shield.py`, on by default)
- **Real visitor IP:** behind the tunnel the app uses `CF-Connecting-IP` (`TRUST_CLOUDFLARE_IP=true`). Before this, the login limits used a header a visitor could fake.
- **Rate limits per IP:**
  - API: 6 requests/s sustained, bursts up to 180.
  - Pages: 25/s, bursts up to 400.
  - Over the limit: answers 429 with `Retry-After`.
  - `/api/v1/health` is exempt, for uptime monitors.
- **Automatic bans:**
  - Scanner probes (`/.env`, `/.git`, `wp-admin`, `*.php`, `../` traversal and similar) answer 404 and count as strikes.
  - So does flooding on after being told to slow down.
  - 8 strikes in 10 minutes bans the IP from the whole site for 1 hour (403).
- **Request hygiene:**
  - Only normal HTTP methods are accepted; TRACE and similar get 405.
  - URLs are capped at 2,048 characters and query strings at 4,096 (414).
  - API request bodies are capped at 10 MB (413). Media never goes through the API; it goes straight to storage with signed URLs.
- **Already in place before:**
  - Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, nosniff and Permissions-Policy.
  - CSRF guard, Argon2id passwords, and per-email plus per-IP login limits.
  - Workspace isolation on every route; upload type and size checks with ffprobe; signed, expiring storage URLs.
  - Paid-AI budget caps.
- **Tuning:** all limits are environment settings (`SHIELD_API_RATE`, `SHIELD_API_BURST`, `SHIELD_PAGE_RATE`, `SHIELD_PAGE_BURST`, `SHIELD_MAX_BODY_BYTES`, `SHIELD_BAN_SECONDS`). `SHIELD_ENABLED=false` switches the shield off.
- **Tests:** `backend/tests/test_shield.py` covers floods, bans, scanner probes, IP spoofing, oversize bodies, long URLs and bad methods.

## Still open (owner actions)
- **Make the GitHub repository private.** It is public, so anyone can read how the app works.
- Restrict the Firebase browser key to youtubebuddy.com (Google Cloud console → Credentials).
- Turn on two-step login for the Cloudflare, GitHub, Google and domain registrar accounts.
