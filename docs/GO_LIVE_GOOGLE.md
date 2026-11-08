# Go live on youtubebuddy.com — Google sign-in, YouTube, stock, Creator Scout

Everything below is **configuration only**: the code is finished and tested against fake Google/Pexels/Pixabay servers
(`backend/tests/test_google_auth.py`, `test_youtube.py`, `test_channel_insights.py`, `test_stock.py`, `test_agent.py`).
Put every key into **Render → your service → Environment** (API and worker). Never paste keys into chat, issues or git.
Each feature stays hidden until its keys are present, then appears on its own.

> ⚠️ **Name check before you submit anything to Google.** YouTube's API branding rules do not allow app names or domains
> that use "YouTube", "YT", "Tube" or look-alikes in a way that suggests YouTube made or endorses the app. Google's OAuth
> verification team checks this. "YouTube Buddy" and possibly "youtubuddy" are at risk of rejection. Pick the final
> `BRAND_NAME` (and ideally the domain) **before** you request verification; changing it afterwards means verifying again.
> Everything below works the same with any domain: replace `youtubebuddy.com` with the final one.

## 0. Domain (BigRock) and support email (once)

Domain: **youtubebuddy.com**, registered at BigRock (DNS is managed in BigRock → Manage DNS). Support email:
**youtubebuddyhelp@gmail.com** (already the Firebase support email; also `CONTACT_EMAIL` on /privacy and /terms).

1. Deploy on Render first (Blueprint from `render.yaml`). Then Render → web service → **Settings → Custom domains** →
   add `youtubebuddy.com` and `www.youtubebuddy.com`. Render then shows the exact DNS records to create.
2. BigRock → Manage DNS for youtubebuddy.com:
   - **A record** (host `@`/blank): *edit the existing one* to the IP address Render shows for the root domain
     (at the time of writing Render documents `216.24.57.1`, but use what the dashboard shows). Keep only one A record for `@`.
   - **CNAME** host `www` → `<your-service>.onrender.com` (exactly as Render shows).
   - Don't delete the existing **MX** and **TXT** records: they handle email/verification. Don't change **NS**.
   - Click "Verify" in Render; when DNS has spread (minutes to a few hours), Render issues the HTTPS certificate on its own.
3. **Google Search Console** → add the *Domain* property `youtubebuddy.com` → Google gives you a TXT value → BigRock →
   **+Add TXT Record**, host `@`, paste the value → Verify. Google OAuth needs a verified domain, and Search Console is also how
   your site gets into Google Search (the sitemap is at `/sitemap.xml`).
4. Optional, later: an address at the domain (e.g. `help@youtubebuddy.com`) through Zoho Mail free or BigRock email
   forwarding. If you do this, add the MX records your email provider gives you, and do it before step 2 of §2.

Render environment (already in `render.yaml`): `PUBLIC_BASE_URL=https://youtubebuddy.com`, `CORS_ORIGINS=https://youtubebuddy.com`,
`ADMIN_EMAILS` and `DEVELOPER_EMAILS` set to the developer's Google address. Set `CONTACT_EMAIL=youtubebuddyhelp@gmail.com`.

## 1. Google sign-in (Firebase Authentication)

1. Firebase project: **done** — `ytbuddy-3` ("YOUTUBE BUDDY"). The app does not use Google Analytics (`measurementId` is not needed).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**. Public-facing name = your `BRAND_NAME`;
   support email = `youtubebuddyhelp@gmail.com` (if Firebase only lets you pick a Google account, add the help address as a
   Google group or project owner first). Save.
3. **Authentication → Settings → Authorized domains → Add domain**: `youtubebuddy.com` and `www.youtubebuddy.com`.
   `localhost` is already there for development.
   **Project settings → General → Public settings → Public-facing name**: change `project-303749195157` to your brand
   name. Google shows this name in the sign-in window ("Continue to …").
4. **Project settings (⚙) → General → Your apps → Web (</>)**. Done already: the "YOUTUBE BUDDY" web app of project
   `ytbuddy-3`. Its values are already in `render.yaml`:

   | Render variable | From the Firebase snippet |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `projectId` |
   | `FIREBASE_API_KEY` | `apiKey` (a public identifier, not a secret, but keep it in env vars anyway) |
   | `FIREBASE_AUTH_DOMAIN` | `authDomain` — keep `<project>.firebaseapp.com` |
   | `FIREBASE_APP_ID` | `appId` (optional) |

5. Redeploy. "Continue with Google" appears on /signin and /signup. The backend verifies every Google ID token against
   Google's public keys and the project id. Developer benefits (Pro free) apply only to a **Google-verified** email.

**Lock the browser key** (Google Cloud → APIs & Services → Credentials → Browser key → Website restrictions):
`youtubebuddy.com/*`, `www.youtubebuddy.com/*`, `localhost/*` **and `ytbuddy-3.firebaseapp.com/*`**. The last one is
required: the Google sign-in popup runs on Firebase's auth domain with this key, and without it sign-in fails with
"requests from referer … are blocked". (Add `<service>.onrender.com/*` too if you test on Render's address.)

Test: sign in with the developer Google account → Settings shows the Pro plan and the Payments admin card.

## 2. YouTube connection: "Connect channel", channel insights, publishing

The Firebase project *is* a Google Cloud project, so use the same project.

1. <https://console.cloud.google.com> → select the Firebase project → **APIs & Services → Library → YouTube Data API v3 → Enable**.
2. **OAuth consent screen** (Google Auth Platform → Branding / Audience / Data access):
   - User type **External**. App name = `BRAND_NAME`. User support email and developer contact = `youtubebuddyhelp@gmail.com`.
   - App home page `https://youtubebuddy.com`, privacy policy `https://youtubebuddy.com/privacy`,
     terms `https://youtubebuddy.com/terms`. Authorized domain `youtubebuddy.com`.
   - **Data access → Add scopes**: `.../auth/youtube.upload` and `.../auth/youtube.readonly`. Both are *sensitive* scopes:
     Google verification is needed (no paid security assessment; that is only for *restricted* scopes).
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origin: `https://youtubebuddy.com`
   - Authorized redirect URI: `https://youtubebuddy.com/api/v1/youtube/callback` (Settings → YouTube shows the exact URI the server uses)
4. Render: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` (a long random value; generate
   one with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` on your own computer).
   Do not lose or change it later: stored channel connections can't be read without it, and users would have to reconnect.
5. Redeploy. The red YouTube **Connect channel** button appears next to the profile name in every top bar, and opens `/channel`.

**While the app is in "Testing"** (before verification): only the Google accounts you add under *Audience → Test users*
(up to 100) can connect, and Google expires their connection after **7 days**, so they have to reconnect weekly.

**Verification** (*Audience → Publish app*, then *Verification centre*): Google asks for
- a short unlisted YouTube demo video showing the sign-in, the consent screen (with the URL bar visible), and how each scope is
  used: `youtube.readonly` → the My channel page; `youtube.upload` → Export → Publish to YouTube;
- a written reason for each scope, the verified domain, and matching privacy policy text. It usually takes from a few days to a few weeks.

**YouTube API audit (separate from OAuth verification).** For API projects created after July 2020, videos uploaded
through the API are **locked to private** until the project passes YouTube's API Services compliance audit
(form: "YouTube API Services – Audit and Quota Extension"). The app's publish dialog lets users choose public/unlisted, but
until the audit passes YouTube will keep those uploads private. The default quota is 10,000 units/day. An upload costs far
more units than a read (check Google's current quota calculator). Channel insights cost about 3 units per refresh and are
cached for 10 minutes. Ask for more quota in the same audit form.

**Channel research tools** (AI Generator, public data of any channel) use a plain API key instead of OAuth:
Credentials → **API key** → restrict it to *YouTube Data API v3* → Render `YOUTUBE_API_KEY`.

## 3. Stock videos and photos: Pexels and Pixabay (both free)

| Provider | Get the key | Render variable | Rules to follow |
|---|---|---|---|
| Pexels | <https://www.pexels.com/api/> → sign up → "Your API key" | `PEXELS_API_KEY` | Show "Photos/Videos provided by Pexels" and credit the author. The editor's Stock tab already does this, and the import keeps the attribution. Default 200 requests/hour. |
| Pixabay | <https://pixabay.com/api/docs/> (signed in, the key is shown on the page) | `PIXABAY_API_KEY` | No permanent hotlinking: the app downloads a file to your own storage on import and shows thumbnails only in search results. 100 requests/minute; cache searches. |

Redeploy. The Stock tab appears in the editor. The server re-checks each item by id before downloading, and only from the providers' media hosts.
The page's Content-Security-Policy allows their image hosts only when the matching key is set.

## 4. Creator Scout (real feeds)

Nothing to buy. The Scout reads public RSS feeds every 24 h from the worker (`AGENT_RESEARCH_HOURS`; reports in Settings → Creator Scout card, founder only), suggests things and never acts on them:
r/NewTubers, r/youtubers, r/PartneredYoutube, r/VideoEditing (top of the week), the official YouTube blog, and Google
News for "YouTube creators India". With `ANTHROPIC_API_KEY` set it writes a deeper analysis; otherwise it runs a free keyword mode.

- To change sources, set `AGENT_SOURCES` to a comma-separated list of `https://` RSS/Atom URLs.
- The Scout identifies itself as `CreatorScoutBot/1.0 (+https://youtubebuddy.com)`. Reddit sometimes blocks cloud-server
  IPs (Render included). A blocked feed shows up as a per-source error in the run report, and the other feeds still work.
  If Reddit keeps refusing, take it out of `AGENT_SOURCES`, or apply for Reddit Data API access for commercial use.
- Feed content is untrusted data: it is shown as evidence links, and nothing in a feed can trigger an action.

## 5. After each step: smoke test on the live site

1. `/signin` → Continue with Google → you land in /universes. As the developer account: Settings shows Pro and the Payments admin card.
2. Top bar → **Connect channel** → Google consent → back on `/channel` with your channel numbers. A brand-new channel with
   fewer than 5 videos that are at least 3 days old sees "Upload at least 5 videos…" instead of an estimate. That is intended.
3. Editor → Export → finish a render → **Publish to YouTube** (private) → the link opens your video.
4. Editor → Stock tab → search "goa beach" → import a clip → it shows up in the media bin with attribution.
5. Settings (founder account) → Creator Scout card → run it → the report lists the posts read, plus any per-source errors.
