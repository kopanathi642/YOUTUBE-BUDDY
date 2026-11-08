# Run YouTube Buddy on Azure for Students ($100 free credit, no card)

**Azure for Students:**
- gives full-time university students **$100 of credit for 12 months, with no credit card**;
- renews every year while you are a student;
- when the credit runs out, Azure switches the subscription **off**. It can't charge you, because there is no card.

We use a small Ubuntu server in **Central India** and the same free **Cloudflare Tunnel** setup as `deploy/home` (HTTPS on youtubebuddy.com, no open web ports).

| | |
|---|---|
| Server | Standard **B2s** (2 vCPU, 4 GiB RAM) or any 2-vCPU / 4-GiB B-series size offered, Ubuntu 24.04, 64 GB Standard SSD |
| Cost | roughly **$30–40/month** of credit, so **about 3 months** from $100 (Azure → Education → shows what's left) |
| Stretch it | **Stop** the VM in the portal when nobody needs the site (you don't pay for compute while it's stopped; the disk costs ~$5/month) |

> Prices vary by size and region. Check what the VM-size picker shows before you click Create.

## 1. Activate Azure for Students (10 min)
1. Go to <https://azure.microsoft.com/free/students> → **Start free**.
2. Sign in with a Microsoft account. Then verify you're a student with your **college email** (or the other proof the page asks for) and your phone number.
3. When it's done, the portal shows the subscription **"Azure for Students"**.

Never share your Microsoft password or a verification code with anyone, including assistants.

## 2. Create the server (10 min)
Azure portal → **Virtual machines → Create → Azure virtual machine**:

- Subscription **Azure for Students**. Resource group: new, `youtubebuddy`.
- Name `youtubebuddy`, Region **(Asia Pacific) Central India**, Availability: *No infrastructure redundancy required*.
- Image **Ubuntu Server 24.04 LTS – x64**. Size: **B2s** (2 vCPU, 4 GiB). If it isn't offered, pick another 2 vCPU / 4 GiB size such as B2s_v2 or B2as_v2.
- Authentication **SSH public key**, username `azureuser`, key source *Generate new key pair*, key name `youtubebuddy`.
- Inbound ports: **SSH (22)** only. Don't open 80/443: the tunnel doesn't need them.
- **Disks:** OS disk size **64 GiB**, type **Standard SSD**.
- **Review + create → Create → Download private key and create resource.** Save the downloaded `youtubebuddy.pem` (for example in your Downloads folder). It's the key to your server, so never share it.
- When it's ready, open the VM and copy its **Public IP address**.

## 3. Connect from your Windows PC
Open **Command Prompt** and run (replace `PUBLIC-IP` with the address you copied):
```bash
ssh -i %USERPROFILE%\Downloads\youtubebuddy.pem azureuser@PUBLIC-IP
```
Type `yes` the first time. If Windows says the key file is "too open", run this once and try again:
```bash
icacls %USERPROFILE%\Downloads\youtubebuddy.pem /inheritance:r /grant:r "%USERNAME%":R
```
You're now typing **on the server**. The commands below all run there.

## 4. Install everything (one command, about 5 min)
```bash
curl -fsSL https://raw.githubusercontent.com/kopanathi642/YOUTUBE-BUDDY/main/deploy/azure/setup.sh | bash
```
This command:
- installs Docker;
- adds 4 GB of swap (extra memory);
- downloads the code;
- creates `~/YOUTUBE-BUDDY/deploy/home/.env` with random passwords.

To keep a copy of that file, run `cat ~/YOUTUBE-BUDDY/deploy/home/.env`, select the text, and paste it into a private note. Never share it.

## 5. Cloudflare: domain and tunnel (same as the home guide)
1. Do **§2 of `deploy/home/README.md`** in your browser if you haven't yet: add youtubebuddy.com to Cloudflare (Free plan) and put Cloudflare's two nameservers in BigRock. Wait until the domain is **Active**.
2. On the server:
```bash
cd ~/YOUTUBE-BUDDY/deploy/home
```
```bash
sudo docker compose run --rm --no-deps tunnel tunnel login
```
Open the link it prints **in your PC's browser**, sign in to Cloudflare, and click **youtubebuddy.com → Authorize**. Then run:
```bash
sudo docker compose run --rm --no-deps tunnel tunnel create --credentials-file /root/.cloudflared/tunnel.json youtubebuddy
```
```bash
sudo docker compose run --rm --no-deps tunnel tunnel route dns -f youtubebuddy youtubebuddy.com
```
```bash
sudo docker compose run --rm --no-deps tunnel tunnel route dns -f youtubebuddy www.youtubebuddy.com
```

## 6. Start the app
```bash
sudo docker compose up -d --build
```
- The first build takes 10–20 min.
- The worker then downloads about 10 GB of free AI models. Uploads and renders start working when that finishes.
- Follow it with `sudo docker compose logs -f worker` (press Ctrl+C to stop watching).
- Open **https://youtubebuddy.com** and sign in with Google.

## Everyday use (on the server, in `~/YOUTUBE-BUDDY/deploy/home`)
| What | Command |
|---|---|
| Status | `sudo docker compose ps` |
| Update to the newest code | `git pull && sudo docker compose up -d --build` |
| Errors | `sudo docker compose logs --tail 100 web` (or `worker`, `tunnel`) |
| Add a free key (Pexels, Pixabay, Google OAuth…) | `nano .env` → remove the `#` and paste the key after `=` → Ctrl+O, Enter, Ctrl+X → `sudo docker compose up -d` |
| Database backup | `sudo docker compose exec db pg_dump -U creator creator > ~/backup.sql` |

- After an Azure **Stop/Start**, the app starts on its own (every service has `restart: unless-stopped`).
- **Never** run `docker compose down -v`: it deletes the database and all uploaded files.

## Honest limits
- **About 3 months per $100.** Plan the move to paid hosting (or the next year's renewal) before the credit runs out, and back up the database first.
- **4 GB of RAM is tight for dubbing.** The setup keeps one translation model loaded at a time (`MT_MAX_LOADED=1`) and adds swap. Long videos process slowly.
- **Cloudflare's free plan isn't meant for heavy video streaming:** fine for early users, not for scale.
- **If the GitHub repo is made private later,** the one-line install needs a GitHub token. Ask before doing that.
