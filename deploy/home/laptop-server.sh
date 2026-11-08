#!/usr/bin/env bash
# Turn an Ubuntu 24.04 laptop into the YouTube Buddy server (run once, as your normal user):
#   curl -fsSL https://raw.githubusercontent.com/kopanathi642/YOUTUBE-BUDDY/main/deploy/home/laptop-server.sh | bash
# Optional: BACKUP_DIR=/media/$USER/HDD/youtubebuddy-backups  (default: ~/youtubebuddy-backups)
# What it does: never sleep (lid closed is fine), Docker starts at boot, installs the app (Docker, swap, code, .env),
# and a daily database backup at 03:30 that keeps the last 14 days. Safe to run again.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-$HOME/youtubebuddy-backups}"

echo "== Keep the laptop awake (also with the lid closed, on charger or battery)"
sudo mkdir -p /etc/systemd/logind.conf.d
printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleLidSwitchDocked=ignore\nIdleAction=ignore\n' \
  | sudo tee /etc/systemd/logind.conf.d/youtubebuddy-server.conf >/dev/null
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null
# the desktop's own "blank screen / suspend" timers (GNOME); the screen may turn off, the computer keeps running
if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' 2>/dev/null || true
fi

echo "== Install Docker, swap, code and secrets"
curl -fsSL https://raw.githubusercontent.com/kopanathi642/YOUTUBE-BUDDY/main/deploy/azure/setup.sh | bash
sudo systemctl enable --now docker >/dev/null

echo "== Daily database backup -> $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
CRON="30 3 * * * cd $HOME/YOUTUBE-BUDDY/deploy/home && docker compose exec -T db pg_dump -U creator creator | gzip > $BACKUP_DIR/db-\$(date +\%F).sql.gz && find $BACKUP_DIR -name 'db-*.sql.gz' -mtime +14 -delete"
( sudo crontab -l 2>/dev/null | grep -v 'youtubebuddy-backup' ; echo "$CRON # youtubebuddy-backup" ) | sudo crontab -
cp "$HOME/YOUTUBE-BUDDY/deploy/home/.env" "$BACKUP_DIR/env-backup.txt" && chmod 600 "$BACKUP_DIR/env-backup.txt"

echo
echo "Laptop is ready. Next (deploy/home/LINUX_LAPTOP.md): Cloudflare domain + tunnel, then"
echo "  cd ~/YOUTUBE-BUDDY/deploy/home && sudo docker compose up -d --build"
echo "Lid/sleep settings apply after a restart:  sudo reboot"
