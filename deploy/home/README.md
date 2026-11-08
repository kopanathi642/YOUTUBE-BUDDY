# Run YouTube Buddy on your own PC for ₹0, live at https://youtubebuddy.com

Everything is free and needs no card:

- **Docker Desktop** runs the app on your PC: database, file storage (RustFS), website and AI worker.
- A **Cloudflare Tunnel** connects https://youtubebuddy.com to your PC with HTTPS. You don't open any router ports and you don't need a fixed IP address.
- Your **Firebase Google sign-in** (project `ytbuddy-3`) is already set up in `compose.yaml`.

Tested in the build sandbox (2026-11-08) with a simulated tunnel: the site, sign-up, secure cookies, upload → worker → playback, and the www → main address redirect all worked. The real tunnel login needs your Cloudflare account, so it hasn't been tested yet.

## What your PC needs

- Windows 10/11 (64-bit), **8 GB RAM minimum, 16 GB better**, and about **40 GB free disk** (the AI models alone are about 10 GB).
- It must stay **switched on and connected** while people use the site. Set Windows Settings → System → Power → Sleep to **Never** (plugged in).
- Home broadband is fine. Your upload speed limits how fast people can stream videos.

## One-time setup (about 30–45 minutes, mostly downloads)

### 1. Install the tools (free)
1. **Docker Desktop**: https://www.docker.com/products/docker-desktop/ → install → restart. If it asks for **WSL 2**, accept (it installs itself). Then open Docker Desktop → Settings → General → tick **"Start Docker Desktop when you sign in"**.
2. **Git for Windows**: https://git-scm.com/download/win → install with the default options.

### 2. Move the domain's DNS to Cloudflare (free; this also fixes the current "can't be reached" error)
1. Create a free account at https://dash.cloudflare.com/sign-up. (Use your own email and password. Never share them.)
2. **Add a domain** → `youtubebuddy.com` → choose the **Free** plan → Continue.
3. Cloudflare shows **two nameservers** (for example `xxx.ns.cloudflare.com`). In **BigRock** → your domain → **Name Servers** → replace `dns1–dns4.bigrock.in` with Cloudflare's two → Save.
4. Wait until Cloudflare says the domain is **Active**. This takes minutes to a few hours, and Cloudflare emails you.
5. In Cloudflare → DNS → Records: **delete** any existing `A`, `AAAA` or `CNAME` records for `youtubebuddy.com` and `www`. The tunnel creates the right ones. **Keep** the MX and TXT records.

### 3. Get the app and create its passwords
Open **Command Prompt** (Windows key → type `cmd` → Enter) and run these one at a time:

```bash
git clone https://github.com/kopanathi642/YOUTUBE-BUDDY.git
```
```bash
cd YOUTUBE-BUDDY\deploy\home
```
```bash
docker compose run --rm setup
```
This last command creates `deploy\home\.env` with strong random passwords. **Back this file up** (copy it to a USB drive or private cloud storage): without it you can't open your own database. Never share or upload it.

### 4. Connect the tunnel (still in the same folder)
```bash
docker compose run --rm --no-deps tunnel tunnel login
```
It prints a link: open it, sign in to Cloudflare, click **youtubebuddy.com → Authorize**. The command finishes when it says the certificate was saved.
```bash
docker compose run --rm --no-deps tunnel tunnel create --credentials-file /root/.cloudflared/tunnel.json youtubebuddy
```
```bash
docker compose run --rm --no-deps tunnel tunnel route dns -f youtubebuddy youtubebuddy.com
```
```bash
docker compose run --rm --no-deps tunnel tunnel route dns -f youtubebuddy www.youtubebuddy.com
```
The tunnel's secret files (`cert.pem`, `tunnel.json`) are now in `deploy\home\cloudflared\`. Git ignores them; back them up with `.env`.

### 5. Start everything
```bash
docker compose up -d --build
```
- The first start downloads and builds for 10–30 minutes. Then the worker downloads the free AI models (about 10 GB) and checks each one. Video processing and dubbing start working when that finishes. You can follow it with `docker compose logs -f worker`.
- Open **https://youtubebuddy.com**. Sign in with Google as kumarbhargav642@gmail.com: you get the Pro plan and the Payments admin card.

## Everyday commands (run inside `YOUTUBE-BUDDY\deploy\home`)

| What | Command |
|---|---|
| Start (also runs automatically after a reboot, once Docker Desktop starts) | `docker compose up -d` |
| Stop | `docker compose down` |
| Update to the newest code | `git pull` then `docker compose up -d --build` |
| See what's running | `docker compose ps` |
| See errors | `docker compose logs --tail 100 web` (or `worker`, `tunnel`) |
| Add a free key (Pexels, Pixabay, Google OAuth…) | Open `.env` in Notepad, remove the `#` in front of the line, paste the key after `=`, save, then `docker compose up -d` |

**Never** run `docker compose down -v`: the `-v` deletes the database and every uploaded file.

## Limits to know (honest)

- When the PC is off, asleep or offline, the site is down. Cloudflare shows an error page until the PC is back.
- All files live on this PC. Back them up: copy `.env` and `cloudflared\` somewhere safe, and from time to time export the database with `docker compose exec db pg_dump -U creator creator > backup.sql`.
- Cloudflare's free plan limits each upload request to 100 MB. The app uploads in 16 MB parts, so big videos still work.
- Cloudflare's free plan isn't designed for heavy video streaming. For the first users and testing it's fine. Once you have many viewers or paying users, move the files to a proper storage service: Cloudflare R2 (10 GB free, but it needs a card) or a paid server. `render.yaml` is ready for that.
- Paid AI is switched off (`AI_*_BUDGET_USD=0`). Only the free models run, at ₹0.
