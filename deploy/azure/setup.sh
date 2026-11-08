#!/usr/bin/env bash
# One-command server setup for an Ubuntu 24.04 VM (Azure for Students or any cloud VM).
#   curl -fsSL https://raw.githubusercontent.com/kopanathi642/YOUTUBE-BUDDY/main/deploy/azure/setup.sh | bash
# Safe to run again: it skips whatever is already done. It never prints or uploads your secrets.
set -euo pipefail
REPO="${REPO:-https://github.com/kopanathi642/YOUTUBE-BUDDY.git}"
DIR="$HOME/YOUTUBE-BUDDY"

echo "== 1/4 Docker"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sudo sh          # Docker's official install script
fi
sudo usermod -aG docker "$USER" || true

echo "== 2/4 Swap (extra memory for a 4 GB server, so big renders don't crash)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== 3/4 Code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi

echo "== 4/4 Secrets (.env, created once with random passwords)"
cd "$DIR/deploy/home"
sudo docker compose run --rm setup
sudo chown "$USER" .env && chmod 600 .env     # the setup container writes it as root
# small server: keep one translation model in memory at a time
grep -q '^MT_MAX_LOADED=' .env || echo 'MT_MAX_LOADED=1' >> .env

echo
echo "Done. Next: connect the Cloudflare tunnel (deploy/azure/README.md step 5), then:"
echo "  cd ~/YOUTUBE-BUDDY/deploy/home && sudo docker compose up -d --build"
