# Backup, restore and rollback plan: ASUS server (v2, for approval)

Status: **proposal. Nothing here has been run.** Based on `audit-asus-report.txt` (13 Nov 17:18 IST).

## Facts this plan is built on

| Fact | Source |
|---|---|
| C: = Crucial P5 NVMe SSD 233 GB (disk 1), 105 GB free: Windows, project, Docker data | audit |
| D: (460 GB, 446 GB free) and E: (391 GB, 357 GB free) = **one** HGST 932 GB SATA HDD (disk 0) | audit |
| Docker volumes total 18.75 GB (includes ~10 GB of re-downloadable AI models) | audit |
| Live volumes: `youtubebuddy_pgdata`, `youtubebuddy_media`; models: `youtubebuddy_models`, `youtubebuddy_llmmodels` | audit |
| Old volumes from an earlier project name: `youtube-buddy_pgdata`, `youtube-buddy_media` (contents unknown) | audit |
| No USB drive attached; no backup task exists (the "Backup" tasks found are Windows' own) | audit |
| Git for Windows is installed; its `gpg.exe` should be available for encryption (confirmed by part 2) | part 2 |

**Where the backups go:** `D:\YB-Backups\` on the HDD. It's a different physical disk from the SSD that holds production, so it survives the SSD failing. It does **not** survive theft, fire, a power surge or ransomware, so the weekly off-machine copy (section 5) is required, not optional. Nothing on D: or E: is formatted or modified: the script creates one new folder and writes only inside it.

## 1. What is backed up, how, how often

| Data | Method | Frequency | Kept | Encrypted |
|---|---|---|---|---|
| PostgreSQL `creator` DB | `pg_dump -Fc` inside the db container → `docker cp` → D:, plus roles (`pg_dumpall --globals-only`) and row counts of key tables | nightly 02:41 | 14 daily + 8 weekly | on D: no (same trust as the live DB on the same laptop); off-machine yes |
| Uploads + exports (RustFS `youtubebuddy_media`) | `robocopy /E` (incremental, **never deletes** in the backup) from the volume folder, plus production object count and bytes | nightly, **after** the DB dump | rolling copy + 8 weekly snapshots | off-machine yes |
| Project files | `git bundle --all` (all history, branches, stash) + `uncommitted.patch` + working-tree copy without node_modules and secrets | nightly | 14 + 8 | off-machine yes |
| Docker configuration | compose.yaml, tunnel config.yml (not secret), image list with digests, container + volume list, Docker Desktop settings, .wslconfig. **Never** `docker inspect` / `docker compose config` (they print secrets) | nightly | 14 + 8 | n/a |
| `.env` + Cloudflare `cert.pem`, `tunnel.json`, `config.yml` | `tar` streamed straight into `gpg --encrypt` to the backup **public** key: no plaintext copy ever touches disk | nightly | 14 + 8 | **always** |
| Old `youtube-buddy_*` volumes | one-time read-only archive before any cleanup is ever discussed | once | until you decide | yes |
| AI model volumes | not backed up: re-downloadable from their sources | n/a | n/a | n/a |

Every night ends with `SHA256SUMS.txt` (a hash of every file) and `D:\YB-Backups\LAST-STATUS.json` (OK/FAILED per step). The script is `deploy/home/ops/backup/BACKUP-NIGHTLY.ps1`.

## 2. Key setup (once, you type everything secret yourself)

The encryption uses a key pair. The ASUS keeps only the **public** key, so it can lock backups every night without any secret stored on it. The **private** key, which is the only thing that can unlock them, lives off the laptop.

```powershell
$gpg = "C:\Program Files\Git\usr\bin\gpg.exe"
& $gpg --quick-generate-key "YouTube Buddy Backup" rsa4096 encr never      # gpg asks YOU for a passphrase in its own window
& $gpg --armor --export "YouTube Buddy Backup" > D:\YB-Backups\keys\backup-public.asc
& $gpg --armor --export-secret-keys "YouTube Buddy Backup" > F:\yb-backup-private.asc   # F: = your USB stick (letter may differ)
# Keep TWO copies off this laptop: that USB stick at home + (later) the HP. Write the passphrase on paper.
& $gpg --delete-secret-keys "YouTube Buddy Backup"                          # private key leaves the ASUS
```
**Risk: if both private-key copies or the passphrase are lost, the encrypted backups can never be opened.** Nobody, including me, can recover them.

## 3. Verification (automatic, every night)

The script stops and marks the night **FAILED** if:
- D: has less than 50 GB free, or the database isn't healthy;
- the dump is under 1 KB, or `pg_restore --list` can't read it;
- robocopy returns an error (exit code 8 or higher), or the media folder can't be reached;
- the encrypted secrets file is missing or tiny.

A failed night keeps the previous good backups; retention only removes old dated folders after a successful run.

## 4. Real restore test (first one before trusting backups, then monthly, ~20 min)

`deploy/home/ops/backup/RESTORE-TEST.ps1 -Day <date> -PrivateKey <USB path>`. Everything it creates is named `ybrestore-*`: 2 containers, 2 volumes, 1 network with no internet, no published ports. It removes them at the end.

| Check | Pass when |
|---|---|
| hashes | every file matches `SHA256SUMS.txt` |
| secrets | decrypts with your passphrase; `.env` has POSTGRES_PASSWORD, S3 keys, TOKEN_ENCRYPTION_KEY; `cert.pem` + `tunnel.json` present (values never printed) |
| database | fresh Postgres 16 restore; users, projects, media_assets, sequence_versions, jobs and payments row counts **equal** the counts recorded at backup time |
| media | the same RustFS version (pinned digest) starts on the restored data; object count ≥ the backup-time count |
| project | `git bundle verify` passes |

The private key is imported only for the test and deleted from the ASUS at the end. Expected extra memory: about 0.5 GB, fine while the llm container is stopped. Once the HP is set up, restore tests move there, which also proves the backup works on a second machine.

## 5. Independent second copy (weekly)

| Option | How | Protects against | Needs |
|---|---|---|---|
| **A. External USB drive (recommended first)** | Plug in on Sundays; a task copies the latest weekly snapshot, DB dump and secrets (all gpg-encrypted) to it; unplug and keep it away from the laptop | theft, fire, surge, ransomware (offline when unplugged) | a USB HDD ≥ 64 GB |
| B. HP Victus over Tailscale | ASUS sends the encrypted weekly bundle with `tailscale file cp … hp-victus:`; the HP saves it to its own drive | ASUS loss; automatic | Tailscale on both (H3) |

Do both once the HP is ready: A is offline, B is automatic.

## 6. Full disaster restore (new or repaired machine)

1. Install Docker Desktop + Git, `git clone` (or `git clone repo.bundle` if GitHub is unavailable), `git checkout` the tag of the live commit.
2. Import the private key, decrypt `secrets.tar.gpg` into `deploy\home\` (`.env` + `cloudflared\`).
3. `docker compose up -d db storage` → copy `creator.dump` into db → `pg_restore --clean --if-exists --no-owner -U creator -d creator`.
4. `docker compose stop storage` → copy `media-current` into the `youtubebuddy_media` volume → `docker compose start storage`.
5. `docker compose up -d` (web applies migrations; the tunnel reconnects with the same credentials). **Make sure the old machine's tunnel is off.**
6. Check: health OK, sign in, open a project, play an upload, export a short clip.

Estimates: restore time 1–2 h. Up to 24 h of new data can be lost (nightly backups). The DB is small, so dumping it every 6 h is an easy upgrade if you want that window smaller.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Laptop stolen or destroyed: D: copy lost too | Weekly off-machine copy (section 5) |
| Windows restarts for updates at night (allowed outside 10:00–23:00): backup interrupted; **site down until someone signs in** (Docker needs a signed-in user) | A failed night is marked FAILED and retried the next night. Sign-in after reboot: see `ASUS_POWER_STARTUP.md` |
| Media copy isn't an atomic snapshot: a file being uploaded at 02:41 may be half-copied | DB dumped first; the next night copies it complete |
| Backup never deletes: a file users deleted stays in `media-current` and could reappear after a full restore | Accepted (safer than losing data); weekly snapshots show history |
| Docker Desktop update moves the volume folder path | Script checks the path and fails loudly; path re-confirmed by part 2 |
| Unencrypted DB dump on D: holds user emails and password hashes | Same laptop, same trust as the live DB; every off-machine copy is encrypted |
| Private key or passphrase lost | Two key copies + passphrase on paper; a restore test proves it works before anything relies on it |
| Backup load on an i3 | ~1–3 min for the DB; media is incremental; runs at 02:41 |

## 8. Rollback of the backup system itself

The backup system never changes production. To remove it completely:
1. `Unregister-ScheduledTask -TaskName "YB Nightly Backup" -Confirm:$false`
2. Optionally delete `D:\YB-Backups` (your decision; it holds your only backups).
3. `gpg --delete-keys "YouTube Buddy Backup"`

The one production touch per night is a temporary `/tmp/yb-backup.dump` inside the db container, deleted in the same run.

## 9. Exact changes requested for approval (in this order)

1. Create `D:\YB-Backups\` with `keys\`, `daily\`, `weekly\`, `logs\`, `media-current\`, `project-current\`.
2. Key setup (section 2), with you at the keyboard.
3. Run `BACKUP-NIGHTLY.ps1` **once by hand** at a quiet hour; check `LAST-STATUS.json`.
4. Run `RESTORE-TEST.ps1` on that backup. **Only if it passes:**
5. Register the Task Scheduler task "YB Nightly Backup", daily 02:41, "run only when user is logged on" (Docker needs your session), stop if running over 2 h.
6. Off-machine copy A (USB) when you have a drive; B after Tailscale.
