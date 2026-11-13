# Backup and rollback plan: ASUS server (proposal, not applied)

Status: **proposal awaiting approval.** Nothing below has been run on the ASUS yet.

## What must be backed up

| Item | Where it lives | Why it matters | How |
|---|---|---|---|
| Database (accounts, projects, jobs, payments) | Docker volume `youtubebuddy_pgdata` | Losing it loses every user | `pg_dump -Fc` nightly |
| Uploaded and exported media | Docker volume `youtubebuddy_media` (RustFS) | Users' files | Weekly full copy + nightly copy of new files (size from the audit decides) |
| Secrets: `deploy\home\.env`, `deploy\home\cloudflared\` | ASUS disk only, git-ignored | Without them the database can't be opened and the tunnel can't start | Copy to the backup drive and to an offline USB. **Never to Git or cloud chat** |
| Code | GitHub `main` | Already off-machine | Tag the live commit before each change |
| Uncommitted laptop edits (6 files + 9 untracked + 1 stash) | ASUS working tree | Work in progress | `git diff > patch` + copy of untracked files, once, before any change |

## Where backups go (recommendation; final pick after the audit report)

A folder on C: alone is **not** a backup: one disk failure loses both copies.

1. **Primary, nightly:** the other internal disk, if the audit shows D:/E: are on a different physical disk from C:. That covers C: failing, but not theft, fire or a power surge.
2. **Off-machine, weekly:** an external USB drive you plug in on a fixed day, **or** the HP over Tailscale (an independent device; it syncs when it's on). Either one covers losing the whole ASUS.
3. Keep **14 daily + 8 weekly** database dumps. Media: latest full copy + 2 previous weeks.

## Nightly job (to be added to Task Scheduler at 02:41 IST, after approval)

```bat
:: deploy\home\ops\BACKUP-NIGHTLY.bat (draft): read-only towards the app; writes only to the backup folder
set DEST=E:\YB-Backups\%DATE:~-4%-%DATE:~3,2%-%DATE:~0,2%
mkdir "%DEST%"
docker compose -f "%USERPROFILE%\YOUTUBE-BUDDY\deploy\home\compose.yaml" exec -T db pg_dump -U creator -Fc creator > "%DEST%\creator.dump"
docker run --rm -v youtubebuddy_media:/data:ro -v "%DEST%":/backup alpine tar czf /backup/media.tgz -C /data .
copy "%USERPROFILE%\YOUTUBE-BUDDY\deploy\home\.env" "%DEST%\env.backup"
xcopy /E /I "%USERPROFILE%\YOUTUBE-BUDDY\deploy\home\cloudflared" "%DEST%\cloudflared"
```

Checks the job runs after every backup (it fails loudly, never silently):
- the dump is larger than 0 bytes and `pg_restore --list` reads it;
- the media archive passes `tar tzf` without error;
- free space on the backup drive is above 20%, otherwise the oldest copies are pruned.

**Restore test, before trusting it:** restore the first dump into a throwaway `postgres:16` container, count rows in `users`, `projects` and `jobs`, compare them with production, then remove the container. Repeat monthly.

## Rollback for each proposed ASUS change

| Change | How to apply | How to undo | Downtime |
|---|---|---|---|
| Backups (Task Scheduler) | Register the task | `Unregister-ScheduledTask -TaskName YB-Backup` | none |
| No sleep on AC, lid = do nothing | `powercfg /change standby-timeout-ac 0` + lid action AC = 0 | Re-apply the values the audit recorded | none |
| Docker starts at sign-in | Docker Desktop setting | Untick it | none |
| Docker log limits (`max-size 10m`, `max-file 3`) | compose change + `docker compose up -d` | `git revert` + `docker compose up -d` | **~1 min** (containers recreate; done at a quiet hour) |
| Writing model moves to the HP | Only after the HP passes its tests: route writing jobs to the GPU queue, then remove `COMPOSE_PROFILES`/`LLM_BASE_URL` | Put both lines back + `docker compose up -d` | ~1 min |
| Worker API + migration | Additive migration, feature switch `GPU_WORKERS_ENABLED=false` | Switch off; tagged commit `git checkout live-YYYY-MM-DD` + `docker compose up -d --build`; restore the dump if ever needed | ~2–5 min for the rebuild |

Before every change: tag the commit, take and verify a backup, write the entry in `OPS_CHANGELOG.md`, change, test, write the result.
