# YouTube Buddy X - nightly backup (DRAFT FOR APPROVAL - not scheduled, not run).
# Writes ONLY under D:\YB-Backups. Reads production; the one thing it creates inside production is a temporary
# dump file /tmp/yb-backup.dump in the db container, which it deletes again.
# Never prints secrets. Never runs `docker inspect` on app containers or `docker compose config` (both expose secrets).
# Requires: the backup public key imported once (see docs/ops/BACKUP_AND_ROLLBACK.md, "Key setup").

param([string]$Root = "D:\YB-Backups", [string]$Repo = "$env:USERPROFILE\YOUTUBE-BUDDY", [string]$KeyId = "YouTube Buddy Backup")
$ErrorActionPreference = "Stop"
$Gpg   = "C:\Program Files\Git\usr\bin\gpg.exe"
$Day   = Get-Date -Format "yyyy-MM-dd"
$Dest  = Join-Path $Root "daily\$Day"
$Log   = Join-Path $Root "logs\backup-$Day.log"
$Lock  = Join-Path $Root "backup.lock"
$Db    = "youtubebuddy-db-1"
$Web   = "youtubebuddy-web-1"
$MediaSrc = "\\wsl.localhost\docker-desktop\mnt\docker-desktop-disk\data\docker\volumes\youtubebuddy_media\_data"   # confirmed by AUDIT-ASUS-2 before use
$status = [ordered]@{ day = $Day; started = (Get-Date).ToString("s"); steps = [ordered]@{} }

function Step($name, [scriptblock]$body) {
  $t = Get-Date
  try { & $body; $status.steps[$name] = "ok ($([int]((Get-Date) - $t).TotalSeconds)s)" }
  catch { $status.steps[$name] = "FAILED: $($_.Exception.Message)"; throw }
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs"), $Dest, (Join-Path $Root "media-current"), (Join-Path $Root "project-current") | Out-Null
Start-Transcript -Path $Log -Append | Out-Null
if (Test-Path $Lock) { throw "Another backup is running (or a crashed one left $Lock). Check the log, then delete the lock file." }
Set-Content $Lock $PID
try {
  Step "preflight" {
    if ((Get-PSDrive D).Free / 1GB -lt 50) { throw "Less than 50 GB free on D:" }
    if ((docker inspect -f "{{.State.Health.Status}}" $Db) -ne "healthy") { throw "Database container is not healthy" }
    if (!(Test-Path $Gpg)) { throw "gpg not found at $Gpg" }
  }

  # 1. Database first (logical, consistent snapshot). Media is copied AFTER, so every file the dump refers to is in the backup.
  Step "database" {
    docker exec $Db pg_dump -U creator -Fc -f /tmp/yb-backup.dump creator
    docker exec $Db sh -c "pg_restore --list /tmp/yb-backup.dump | grep -c 'TABLE DATA'" | Set-Content (Join-Path $Dest "db-table-count.txt")
    docker cp "${Db}:/tmp/yb-backup.dump" (Join-Path $Dest "creator.dump")
    docker exec $Db rm -f /tmp/yb-backup.dump
    docker exec $Db pg_dumpall -U creator --globals-only | Set-Content (Join-Path $Dest "globals.sql")
    # row counts at backup time, used by the restore test
    docker exec $Db psql -U creator -d creator -At -c "select 'users',count(*) from users union all select 'projects',count(*) from projects union all select 'media_assets',count(*) from media_assets union all select 'sequence_versions',count(*) from sequence_versions union all select 'jobs',count(*) from jobs union all select 'payments',count(*) from payments" | Set-Content (Join-Path $Dest "db-rowcounts.txt")
    if ((Get-Item (Join-Path $Dest "creator.dump")).Length -lt 1KB) { throw "Dump is suspiciously small" }
  }

  # 2. Uploaded and exported media (RustFS volume). Incremental copy; never deletes from the backup (/E, no /PURGE or /MIR).
  Step "media" {
    if (!(Test-Path $MediaSrc)) { throw "Media volume path not reachable: $MediaSrc" }
    robocopy $MediaSrc (Join-Path $Root "media-current") /E /COPY:DAT /DCOPY:T /R:2 /W:5 /NP /NFL /NDL /LOG+:$Log | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy media failed with code $LASTEXITCODE" }
    # object count + size from production, read-only, used by the restore test
    docker exec $Web python -c "from app import storage;c=storage.client();n=s=0`nfor p in c.get_paginator('list_objects_v2').paginate(Bucket=storage.bucket()):`n  for o in p.get('Contents',[]): n+=1; s+=o['Size']`nprint(n,s)" | Set-Content (Join-Path $Dest "media-objects.txt")
  }

  # 3. Project files: full git history incl. stash + the uncommitted work. Secrets excluded here (they go encrypted below).
  Step "project" {
    git -C $Repo bundle create (Join-Path $Dest "repo.bundle") --all
    git -C $Repo --no-optional-locks diff | Set-Content (Join-Path $Dest "uncommitted.patch")
    git -C $Repo --no-optional-locks status --porcelain | Set-Content (Join-Path $Dest "git-status.txt")
    robocopy $Repo (Join-Path $Root "project-current") /E /XD node_modules dist .venv __pycache__ cloudflared .git /XF .env *.pem tunnel.json /R:1 /W:1 /NP /NFL /NDL /LOG+:$Log | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy project failed with code $LASTEXITCODE" }
  }

  # 4. Docker configuration (no secrets)
  Step "docker-config" {
    Copy-Item (Join-Path $Repo "deploy\home\compose.yaml"), (Join-Path $Repo "deploy\home\cloudflared\config.yml") $Dest
    docker image ls --digests --format "{{.Repository}}:{{.Tag}} {{.Digest}} {{.ID}}" | Set-Content (Join-Path $Dest "docker-images.txt")
    docker ps -a --format "{{.Names}} {{.Image}} {{.Status}}" | Set-Content (Join-Path $Dest "docker-containers.txt")
    docker volume ls --format "{{.Name}}" | Set-Content (Join-Path $Dest "docker-volumes.txt")
    $ds = Join-Path $env:APPDATA "Docker\settings-store.json"; if (Test-Path $ds) { Copy-Item $ds (Join-Path $Dest "docker-desktop-settings.json") }
    $w = Join-Path $env:USERPROFILE ".wslconfig"; if (Test-Path $w) { Copy-Item $w (Join-Path $Dest "wslconfig.txt") }
  }

  # 5. Secrets: .env + Cloudflare credentials, encrypted to the backup PUBLIC key. No plaintext copy is written to disk
  #    (tar streams straight into gpg through cmd, which passes bytes unchanged). Only the private key - kept OFF this laptop - can open it.
  Step "secrets-encrypted" {
    $out = Join-Path $Dest "secrets.tar.gpg"
    cmd /c "tar -cf - -C `"$Repo\deploy\home`" .env cloudflared | `"$Gpg`" --batch --yes --trust-model always --recipient `"$KeyId`" --encrypt -o `"$out`""
    if ($LASTEXITCODE -ne 0 -or (Get-Item $out).Length -lt 200) { throw "Encrypting secrets failed" }
  }

  # 6. Manifest: SHA-256 of every file in today's folder
  Step "manifest" {
    Get-ChildItem $Dest -File | Where-Object Name -ne "SHA256SUMS.txt" | ForEach-Object { "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name } | Set-Content (Join-Path $Dest "SHA256SUMS.txt")
  }

  # 7. Weekly snapshot on Sundays (keeps 8) and retention for dailies (keeps 14). Deletes ONLY dated folders inside $Root.
  Step "retention" {
    if ((Get-Date).DayOfWeek -eq "Sunday") {
      $wk = Join-Path $Root ("weekly\" + (Get-Date -UFormat "%Y-W%V"))
      robocopy $Dest "$wk\daily" /E /NP /NFL /NDL | Out-Null
      robocopy (Join-Path $Root "media-current") "$wk\media" /E /NP /NFL /NDL | Out-Null
    }
    Get-ChildItem (Join-Path $Root "daily") -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Recurse -Force
    Get-ChildItem (Join-Path $Root "weekly") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d{4}-W\d{2}$' } | Sort-Object Name -Descending | Select-Object -Skip 8 | Remove-Item -Recurse -Force
  }
  $status.result = "OK"
}
catch { $status.result = "FAILED"; $status.error = $_.Exception.Message }
finally {
  $status.finished = (Get-Date).ToString("s")
  $status | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Root "LAST-STATUS.json")
  Remove-Item $Lock -ErrorAction SilentlyContinue
  Stop-Transcript | Out-Null
}
if ($status.result -ne "OK") { exit 1 }
