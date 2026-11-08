# Your old Ubuntu laptop as the YouTube Buddy server (₹0)

For: ASUS laptop, Intel Core i3-6006U, 8 GB RAM, 233 GB SSD + 932 GB HDD, Ubuntu 24.04. It runs 24/7 with the lid closed,
and https://youtubebuddy.com reaches it through a free Cloudflare Tunnel (no router changes, no card).

**What to expect:**
- Editing, uploads and exports work normally.
- AI dubbing is slow on this CPU: roughly 20–40 minutes for a 10-minute video.
- Jobs wait in a queue while another one runs.
- Fine for testing and your first users.

## 1. Prepare the laptop (5 min)
- Keep it **plugged in** and on **Wi-Fi or a LAN cable**. A cable is more reliable.
- Put it somewhere with airflow: lid closed is fine, but don't put it on a bed or cushion.
- Optional battery care: in Ubuntu **Settings → Power**, turn on battery health / charge limit if it's shown.

## 2. One command: server mode + app install (10–15 min)
Open **Terminal** (Ctrl+Alt+T) and paste:
```bash
curl -fsSL https://raw.githubusercontent.com/kopanathi642/YOUTUBE-BUDDY/main/deploy/home/laptop-server.sh | bash
```
It asks for your Ubuntu password (for `sudo`), then:
- turns off sleep, so the laptop keeps running with the lid closed;
- installs Docker and makes it start at boot;
- adds 4 GB of swap;
- downloads the code to `~/YOUTUBE-BUDDY`;
- creates `deploy/home/.env` with random passwords;
- schedules a daily database backup at 03:30, keeping 14 days.

To put the backups on the **1 TB HDD**, open **Files** and click the HDD once so Ubuntu mounts it. Then run this instead (change `HDD` to the drive's name shown in Files):
```bash
curl -fsSL https://raw.githubusercontent.com/kopanathi642/YOUTUBE-BUDDY/main/deploy/home/laptop-server.sh | BACKUP_DIR=/media/$USER/HDD/youtubebuddy-backups bash
```
Then restart once, so the lid and sleep settings take effect:
```bash
sudo reboot
```

## 3. Cloudflare: domain (in the browser, once)
Follow **§2 of `deploy/home/README.md`**:
1. Create a free Cloudflare account.
2. **Add a domain** → `youtubebuddy.com` → **Free** plan.
3. In **BigRock → Name Servers**, replace `dns1–4.bigrock.in` with Cloudflare's two nameservers.
4. Wait until Cloudflare shows the domain as **Active**.
5. Delete any old A/CNAME records for `@` and `www` in Cloudflare. Keep MX and TXT.

## 4. Tunnel (4 commands, in Terminal)
```bash
cd ~/YOUTUBE-BUDDY/deploy/home
```
```bash
sudo docker compose run --rm --no-deps tunnel tunnel login
```
A link appears. Open it in Firefox on this laptop, sign in to Cloudflare, and click **youtubebuddy.com → Authorize**. Then:
```bash
sudo docker compose run --rm --no-deps tunnel tunnel create --credentials-file /root/.cloudflared/tunnel.json youtubebuddy
```
```bash
sudo docker compose run --rm --no-deps tunnel tunnel route dns -f youtubebuddy youtubebuddy.com
```
```bash
sudo docker compose run --rm --no-deps tunnel tunnel route dns -f youtubebuddy www.youtubebuddy.com
```

## 5. Start the app
```bash
sudo docker compose up -d --build
```
- The first build takes 15–30 minutes on this CPU.
- The worker then downloads about 10 GB of free AI models and checks them. Uploads and renders start working when that finishes. Follow it with `sudo docker compose logs -f worker` (Ctrl+C to stop watching).
- Open **https://youtubebuddy.com**, then **Continue with Google** as kumarbhargav642@gmail.com. You should see the Pro plan and the Payments admin card.

After a reboot or power cut, Docker starts by itself and brings the app back. Nothing to do.

## Everyday commands (in `~/YOUTUBE-BUDDY/deploy/home`)
| What | Command |
|---|---|
| Is everything running? | `sudo docker compose ps` |
| Update to the newest code | `git pull && sudo docker compose up -d --build` |
| See errors | `sudo docker compose logs --tail 100 web` (or `worker`, `tunnel`) |
| Add a free key (Pexels, Pixabay, Google OAuth…) | `nano .env` → remove `#`, paste the key after `=` → Ctrl+O, Enter, Ctrl+X → `sudo docker compose up -d` |
| Stop the app | `sudo docker compose down` (**never** add `-v`: that deletes all data) |
| Backups | in `~/youtubebuddy-backups` (or your HDD folder): `db-YYYY-MM-DD.sql.gz` + `env-backup.txt` |

## Keep it safe
- **Never share** `.env`, `env-backup.txt` or the files in `deploy/home/cloudflared/`.
- Ubuntu installs security updates automatically. Restart the laptop about once a month: `sudo reboot`.
- The tunnel publishes only the website. Your laptop's files and other programs stay private, and no router ports are opened.
- If the laptop is off or offline, the site shows a Cloudflare error page until it's back.
