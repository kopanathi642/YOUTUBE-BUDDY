# Ops change log: dual-laptop setup

Every inspection, change, test, error and rollback on the two machines, newest first.
Machines: **ASUS X507UA** = `server` (hostname kumar-bhargav); **HP Victus 15** = `gpu-worker` (not linked yet).
Rule: nothing on the ASUS changes without a written plan, a verified backup and your approval of that specific change.

| When (IST) | Machine | Type | What | Result | Rollback |
|---|---|---|---|---|---|
| 2026-11-13 17:05 | ASUS | read-only | Reviewed AUDIT-ASUS.ps1 line by line for you. Fixed one inaccurate comment (it said it never reads .env; it opens .env only to print the COMPOSE_PROFILES line). Laptop copy and repo copy identical, SHA-256 d9f1406fd6f97205aec42ca03c38002054b1c2308950f9ad97fd01dc947fa242. | Waiting for you to run it | Delete the folder |
| 2026-11-13 14:00 | ASUS | read-only | Wrote `Downloads\youtubebuddy-audit\AUDIT-ASUS.ps1` (outside the repo). It only reads: disks, volumes, power/lid, Docker status/stats/volumes/log config, the value of `COMPOSE_PROFILES` (not a secret), Tailscale presence, scheduled tasks, network adapters, Windows Update hours. | Waiting for you to run it | Delete the folder |
| 2026-11-13 13:50 | ASUS | read-only | Tried to read drives/power on screen. Computer Management (mmc.exe) can't be granted to screen control and covered the screen. | Stopped; switched to the audit script. **Computer Management may still be open on the ASUS; close it.** | None needed |
| 2026-11-13 13:45 | ASUS | read-only | `.env`: checked only whether values are empty. LLM_BASE_URL set (15 chars), COMPOSE_PROFILES set (3 chars), GROQ_API_KEY **empty**, GROQ_MODEL set. | The writing tools depend on the ASUS `llm` container today. **Do not disable it until the HP serves them.** | n/a |
| 2026-11-13 13:42 | ASUS | read-only | Drive skeleton: C: (system + project, 233 GB, 105 GB free), D: (`[boot]`, `pool`, `simple-cdd`: an old Linux installer), E: (personal files). No existing backups (*.sql, *.dump, *backup*) found in YOUTUBE-BUDDY, Downloads or Documents. | **No backup exists today** | n/a |
| 2026-11-13 13:00 | ASUS | read-only | Audit: CPU i3-6006U, no NVIDIA GPU; repo at 477d39e with 6 modified frontend files, 9 untracked files, 1 stash; compose stack; secrets as names only; job queue reviewed. | Machine confirmed as ASUS = `server` | n/a |
| 2026-11-13 12:58 | ASUS | read-only | Live check in the browser: `/api/v1/health` returned database ok, storage ok; home page and /universes loaded signed in. | Site healthy | n/a |
| 2026-11-12 17:57 | ASUS | incident (earlier) | CHECK-SITE: site 530, Docker engine HTTP 500 while the `llm` container ran. Recovered by stopping `llm`. | Recovered | n/a |

## Tests run so far

| Test | Command / method | Result |
|---|---|---|
| Live health | browser → https://youtubebuddy.com/api/v1/health | PASS: `{"status":"ok","checks":{"database":"ok","storage":"ok"}}` |
| Live site + sign-in | browser → https://youtubebuddy.com/ | PASS: /universes loaded for the signed-in admin |
| Machine identity | `/proc/cpuinfo` from the device shell | PASS: i3-6006U = ASUS |
| Integration tests 1–18 (dual-laptop) | not started | NOT RUN |

## Errors seen

- Device shell has no internet (curl to youtubebuddy.com returns 000). Live checks go through the browser instead.
- Screen control cannot see Computer Management (mmc.exe). Read-only data comes from the audit script instead.
