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

## Sign-in after a restart: your decision

| Option | Effect | Trade-off |
|---|---|---|
| A. Keep as is (recommended now) | After an update restart, the site is down until you sign in | Safest; downtime overnight is possible |
| B. Narrow restarts | Set active hours to the longest window you allow (e.g. 06:00–24:00) and turn on "Notify me when a restart is required" | Fewer surprise restarts; Windows Home still forces some |
| C. Windows auto sign-in | The site comes back by itself after any restart | Anyone who opens the laptop is signed in to your account. Only with the laptop kept locked away; adds a lock-screen task after sign-in |

Recommendation: A + B now; reconsider C only if overnight downtime turns out to be a real problem.
