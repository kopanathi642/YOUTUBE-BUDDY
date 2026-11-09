# YouTube Buddy on Windows: local setup (save this file)

For: the ASUS (or any) Windows laptop. Result: the app running at **http://localhost:8000** on that laptop.
Takes about 30–60 minutes the first time (mostly downloads). Uses ₹0.

## A. One-time installs (CMD: Windows key → `cmd` → Enter)
```
winget install -e --id Git.Git
winget install -e --id Docker.DockerDesktop
```
Restart the laptop. Open **Docker Desktop**: accept the terms, **Skip** sign-in, and wait for **"Engine running"** (green, bottom left).
If it asks to install or update **WSL**, say yes. If it says **virtualization is disabled**, it has to be switched on in the BIOS.

## B. Get or update the project
First time:
```
cd %USERPROFILE%
git clone https://github.com/kopanathi642/YOUTUBE-BUDDY.git
```
Already downloaded (gets the newest files, including these helpers):
```
cd %USERPROFILE%\YOUTUBE-BUDDY
git pull
```

## C. Start the app (double-click)
Open File Explorer → `C:\Users\kumar\YOUTUBE-BUDDY\deploy\windows` → double-click **`start-local.bat`**.
It checks Docker, builds and starts everything, then opens **http://localhost:8000**.

## D. If Docker can't download ("no such host")
Your internet provider blocks public DNS (8.8.8.8). Double-click **`fix-docker-dns.bat`** (same folder). It points Docker at your router (`192.168.1.1`).
Then quit Docker Desktop (right-click the whale icon near the clock → **Quit**), open it again, wait for **"Engine running"**, and run `start-local.bat` again.

## E. Everyday commands (CMD, in `%USERPROFILE%\YOUTUBE-BUDDY`)
| What | Command |
|---|---|
| Is it running? | `docker compose ps` |
| Stop | `docker compose down` (never add `-v`: that deletes all data) |
| Start again | `docker compose up -d` |
| Update | `git pull` then `docker compose up -d --build` |
| See errors | `docker compose logs --tail 50 web` |

## F. Let Claude do it on this laptop (optional)
Install **Claude for Windows** from **claude.ai/download**, sign in, open **Claude Code**, choose the folder
`C:\Users\kumar\YOUTUBE-BUDDY`, and paste:

> Set up this project locally on Windows with Docker Desktop. If Docker can't download images ("no such host"),
> run deploy\windows\fix-docker-dns.bat (my ISP blocks 8.8.8.8; my router DNS 192.168.1.1 works). Then run
> `docker compose up -d --build`, check `docker compose ps`, and open http://localhost:8000. Read HANDOFF.md first.

## G. Going live on youtubebuddy.com later
This local test is only for this laptop. To publish it (free Cloudflare Tunnel, Google sign-in), follow `deploy/home/README.md`.
For a 24/7 server, Ubuntu on the ASUS is faster: `deploy/home/LINUX_LAPTOP.md`.

Never share passwords, the `.env` file, or the files in `deploy/home/cloudflared/`.
