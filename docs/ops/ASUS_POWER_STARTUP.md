# ASUS: sleep, lid, restart and Docker start-up (findings + proposal)

## Current state (audit 13 Nov 17:18 IST)

| Setting | Now | Needed for a server | Evidence |
|---|---|---|---|
| Power plan | Balanced | Balanced is fine | audit |
| Sleep on mains (AC) | 0x2a30 = **10,800 s = 3 h** idle | **Never** | audit (exact GUIDs re-read by part 2) |
| Hibernate on AC | 3 h (same reading; part 2 re-reads it separately) | Never | audit |
| On battery (DC) | 0x3840 = 4 h | Leave as is (runs on battery through a power cut, then sleeps safely) | audit |
| Lid close on AC | not shown by part 1; part 2 reads it by GUID | Do nothing | pending |
| Docker Desktop at sign-in | Registered in Windows startup ("Run" key), but Docker's own `AutoStart` = false | On, set in Docker's own setting too | audit |
| Containers after Docker starts | `restart: unless-stopped` on every service | already OK | compose.yaml |
| After a Windows restart | **Docker waits for someone to sign in: the site stays down until then** | decide (below) | Docker Desktop design |
| Windows Update active hours | 10:00–23:00 (restarts can happen 23:00–10:00) | match your routine | audit |
| Network | Wi-Fi only (Qualcomm AR956x) | Ethernet would be steadier, if a cable reaches the router | audit |

Why the site hasn't gone down despite the 3-hour sleep: the laptop has been used regularly. Part 2 lists real sleep and wake events from the last 7 days to confirm.

## Proposed changes (each needs your approval; none affects the running site)

```powershell
# record current values first (written into OPS_CHANGELOG.md)
powercfg /query SCHEME_CURRENT SUB_SLEEP > "$env:USERPROFILE\Desktop\power-before.txt"
powercfg /query SCHEME_CURRENT SUB_BUTTONS >> "$env:USERPROFILE\Desktop\power-before.txt"
# apply (plugged in only)
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0
powercfg /setactive SCHEME_CURRENT
```
The screen can still turn off; that doesn't affect the site.

Docker: Docker Desktop → Settings → General → tick **"Start Docker Desktop when you sign in to your computer"** → Apply. That's a UI setting, no restart of containers.

**Rollback:** `powercfg /change standby-timeout-ac 180`, `powercfg /change hibernate-timeout-ac 180`, set the lid value back to what part 2 recorded, `powercfg /setactive SCHEME_CURRENT`; untick the Docker setting.

## Unattended start-up without automatic sign-in (investigated 13 Nov)

You ruled out automatic sign-in. Findings:

- **Docker Desktop has no supported way to start before someone signs in.** On Docker's forum, community members say Docker Desktop "was made for development". The one reported workaround (WSL 2 off, a scheduled task launching the Docker Desktop frontend as an elevated user) is unsupported and "may break in future versions".
- **Docker Engine inside a WSL 2 Linux distro started at boot by Task Scheduler** is a community approach. It isn't documented by Microsoft for Windows 11 Home, and reports include a boot task failing with return code 4294967295 and the WSL network adapter resetting. Unverified here.
- **Linux on the ASUS** (the repo has `deploy/home/LINUX_LAPTOP.md`; D: even holds an old Linux installer) starts Docker as a system service with nobody signed in. This is the robust long-term answer, but it is a migration: restore everything from backups onto Linux, with downtime.

| Option | Unattended after reboot? | Risk | Recommendation |
|---|---|---|---|
| 1. Keep Docker Desktop + fewer surprise restarts + an alert when the site is down | No, but you're told at once | Low; no migration | **Now** |
| 2. Docker Engine in WSL 2 via a boot task | Maybe (unverified on Home) | Medium: unsupported; data must move from Docker Desktop's volumes | Try on the **HP first**, never directly on the ASUS |
| 3. Linux on the ASUS | Yes | High one-time migration; proven backups required first | Later, as a planned project |

Option 1, concretely (each needs your approval):
- Windows Update: active hours set to the widest window (Windows allows 18 h, e.g. 06:00–24:00), "Notify me when a restart is required" on, and you restart manually after installing updates while you're at the laptop. Updates can be paused for up to 5 weeks if something is in progress.
- A free external uptime check (e.g. UptimeRobot's free tier) on `https://youtubebuddy.com/api/v1/health` every 5 minutes, alerting your phone, so a reboot that waits for sign-in is noticed within minutes. It's an outside account you would create; I can't create it for you.
