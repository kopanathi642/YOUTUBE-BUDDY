# YouTube Buddy X - nightly backup (v3, FOR APPROVAL - not scheduled, not yet run).
# Writes ONLY under D:\YB-Backups. Only READS production: the database dump streams out of the db container straight
# to D: (nothing is written inside any production container) and is checked in a throwaway container with no network.
# Never prints secrets. Never runs `docker inspect` on app containers or `docker compose config` (both expose secrets).
# Needs: the backup PUBLIC key in D:\YB-Backups\keys\gnupg (see docs/ops/BACKUP_AND_ROLLBACK.md, "Key setup").
# Run by hand:  powershell -ExecutionPolicy Bypass -File BACKUP-NIGHTLY.ps1

param([string]$Root = "D:\YB-Backups", [string]$Repo = "$env:USERPROFILE\YOUTUBE-BUDDY", [string]$KeyId = "YouTube Buddy Backup")
$ErrorActionPreference = "Stop"
$Gpg      = "C:\Program Files\Git\usr\bin\gpg.exe"
$GpgHome  = ($Root -replace '\\', '/') + "/keys/gnupg"          # public key only; forward slashes for Git's gpg
$Day      = Get-Date -Format "yyyy-MM-dd"
$Dest     = Join-Path $Root "daily\$Day"
$Log      = Join-Path $Root "logs\backup-$Day.log"
$CopyLog  = Join-Path $Root "logs\robocopy-$Day.log"
$Lock     = Join-Path $Root "backup.lock"
$Db       = "youtubebuddy-db-1"
$Web      = "youtubebuddy-web-1"
$MediaSrc = "\\wsl.localhost\docker-desktop\mnt\docker-desktop-disk\data\docker\volumes\youtubebuddy_media\_data"   # reachable per AUDIT-ASUS-2
$status   = [ordered]@{ day = $Day; started = (Get-Date).ToString("s"); steps = [ordered]@{} }
$ownLock  = $false

function Step($name, [scriptblock]$body) {
  $t = Get-Date
  try { & $body; $status.steps[$name] = "ok ($([int]((Get-Date) - $t).TotalSeconds)s)" }
  catch { $status.steps[$name] = "FAILED: $($_.Exception.Message)"; throw }
}
function Ok($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }   # check every external command

New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs"), (Join-Path $Root "media-current"), (Join-Path $Root "project-current") | Out-Null
Start-Transcript -Path $Log -Append | Out-Null
try {
  # lock: one backup at a time; a lock whose process is gone is stale and is cleared
  if (Test-Path $Lock) {
    $old = Get-Content $Lock -ErrorAction SilentlyContinue
    if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) { throw "Another backup (PID $old) is running" }
    Remove-Item $Lock
  }
  Set-Content $Lock $PID; $ownLock = $true
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  Remove-Item (Join-Path $Dest "FAILED.txt") -ErrorAction SilentlyContinue

  Step "preflight" {
    if ((Get-PSDrive D).Free / 1GB -lt 50) { throw "Less than 50 GB free on D:" }
    $h = docker inspect -f "{{.State.Health.Status}}" $Db; Ok "docker inspect db health"
    if ($h -ne "healthy") { throw "Database container is not healthy ($h)" }
    if (!(Test-Path $Gpg)) { throw "gpg not found at $Gpg" }
    & $Gpg --homedir $GpgHome --batch --list-keys $KeyId | Out-Null; Ok "backup public key lookup"
    if (!(Test-Path $MediaSrc)) { throw "Media volume path not reachable: $MediaSrc" }
  }

  # 1. Database FIRST (pg_dump = one consistent snapshot). Media is copied AFTER, so every file the dump refers to is included.
  Step "database" {
    $dump = Join-Path $Dest "creator.dump"
    cmd /c "docker exec $Db pg_dump -U creator -Fc creator > `"$dump`""; Ok "pg_dump"        # cmd passes the bytes unchanged
    if ((Get-Item $dump).Length -lt 1KB) { throw "Dump is suspiciously small" }
    # readable? throwaway postgres: no network, backup folder read-only, 512 MB cap, removed afterwards
    $tables = docker run --rm --pull never --network none --memory 512m -v "${Dest}:/b:ro" postgres:16 sh -c "pg_restore --list /b/creator.dump | grep -c 'TABLE DATA'"; Ok "pg_restore --list"
    if ([int]$tables -lt 10) { throw "Dump lists only $tables tables" }
    $tables | Set-Content (Join-Path $Dest "db-table-count.txt")
    $g = docker exec $Db pg_dumpall -U creator --globals-only; Ok "pg_dumpall --globals-only"
    $g | Set-Content (Join-Path $Dest "globals.sql")
    # row counts at backup time (read-only SELECT), compared by the restore test
    $rc = docker exec $Db psql -U creator -d creator -At -c "select 'users',count(*) from users union all select 'projects',count(*) from projects union all select 'media_assets',count(*) from media_assets union all select 'sequence_versions',count(*) from sequence_versions union all select 'jobs',count(*) from jobs union all select 'payments',count(*) from payments"; Ok "row counts"
    $rc | Set-Content (Join-Path $Dest "db-rowcounts.txt")
  }

  # 2. Uploads + exports (RustFS volume): incremental copy that NEVER deletes from the backup (/E, no /PURGE, no /MIR)
  Step "media" {
    robocopy $MediaSrc (Join-Path $Root "media-current") /E /COPY:DAT /DCOPY:T /R:2 /W:5 /NP /NFL /NDL "/LOG+:$CopyLog" | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy media failed with code $LASTEXITCODE" }
    # production object count + bytes (read-only listing), compared by the restore test
    $m = docker exec $Web python -c "from app import storage;c=storage.client();o=[x for p in c.get_paginator('list_objects_v2').paginate(Bucket=storage.bucket()) for x in p.get('Contents',[])];print(len(o),sum(x['Size'] for x in o))"; Ok "media object count"
    $m | Set-Content (Join-Path $Dest "media-objects.txt")
  }

  # 3. Project: full git history incl. branches + stash, the uncommitted work, and a working copy WITHOUT secrets
  Step "project" {
    git -C $Repo bundle create --quiet (Join-Path $Dest "repo.bundle") --all; Ok "git bundle"   # no 2>: in PS 5.1 that turns progress text into errors
    $d = git -C $Repo --no-optional-locks diff; Ok "git diff"; $d | Set-Content (Join-Path $Dest "uncommitted.patch")
    $s = git -C $Repo --no-optional-locks status --porcelain; Ok "git status"; $s | Set-Content (Join-Path $Dest "git-status.txt")
    robocopy $Repo (Join-Path $Root "project-current") /E /XD node_modules dist .venv __pycache__ cloudflared .git /XF .env ".env.*" *.pem tunnel.json /R:1 /W:1 /NP /NFL /NDL "/LOG+:$CopyLog" | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy project failed with code $LASTEXITCODE" }
  }

  # 4. Docker configuration (nothing secret)
  Step "docker-config" {
    Copy-Item (Join-Path $Repo "deploy\home\compose.yaml"), (Join-Path $Repo "deploy\home\cloudflared\config.yml") $Dest
    $i = docker image ls --digests --format "{{.Repository}}:{{.Tag}} {{.Digest}} {{.ID}}"; Ok "image list"; $i | Set-Content (Join-Path $Dest "docker-images.txt")
    $c = docker ps -a --format "{{.Names}} {{.Image}} {{.Status}}"; Ok "container list"; $c | Set-Content (Join-Path $Dest "docker-containers.txt")
    $v = docker volume ls --format "{{.Name}}"; Ok "volume list"; $v | Set-Content (Join-Path $Dest "docker-volumes.txt")
    $ds = Join-Path $env:APPDATA "Docker\settings-store.json"   # selected keys only (the file can hold proxy credentials)
    if (Test-Path $ds) { Select-String -Path $ds -Pattern '"AutoStart"|"MemoryMiB"|"Cpus"' | ForEach-Object { $_.Line.Trim() } | Set-Content (Join-Path $Dest "docker-desktop-settings.txt") }
  }

  # 5. Secrets (.env + Cloudflare cert.pem, tunnel.json, config.yml), encrypted to the backup PUBLIC key.
  #    tar streams straight into gpg (cmd pipes bytes unchanged): no plaintext copy is ever written to disk.
  Step "secrets-encrypted" {
    $out = Join-Path $Dest "secrets.tar.gpg"
    cmd /c "tar -cf - -C `"$Repo\deploy\home`" .env cloudflared | `"$Gpg`" --homedir `"$GpgHome`" --batch --yes --trust-model always --recipient `"$KeyId`" --output `"$out`" --encrypt"; Ok "encrypt secrets"
    if ((Get-Item $out).Length -lt 200) { throw "Encrypted secrets file is too small" }
  }

  # 6. Manifest: SHA-256 of every file in today's folder
  Step "manifest" {
    Get-ChildItem $Dest -File | Where-Object Name -notin "SHA256SUMS.txt" | ForEach-Object { "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name } | Set-Content (Join-Path $Dest "SHA256SUMS.txt")
  }

  # 7. Only after success: weekly snapshot on Sundays (keep 8), dailies (keep 14). Deletes ONLY dated folders inside $Root.
  Step "retention" {
    if ((Get-Date).DayOfWeek -eq "Sunday") {
      $wk = Join-Path $Root ("weekly\" + (Get-Date -UFormat "%Y-W%V"))
      robocopy $Dest "$wk\daily" /E /NP /NFL /NDL "/LOG+:$CopyLog" | Out-Null; if ($LASTEXITCODE -ge 8) { throw "weekly copy failed" }
      robocopy (Join-Path $Root "media-current") "$wk\media" /E /NP /NFL /NDL "/LOG+:$CopyLog" | Out-Null; if ($LASTEXITCODE -ge 8) { throw "weekly media copy failed" }
    }
    Get-ChildItem (Join-Path $Root "daily") -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Recurse -Force
    Get-ChildItem (Join-Path $Root "weekly") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d{4}-W\d{2}$' } | Sort-Object Name -Descending | Select-Object -Skip 8 | Remove-Item -Recurse -Force
  }
  $status.result = "OK"
}
catch {
  $status.result = "FAILED"; $status.error = $_.Exception.Message
  if (Test-Path $Dest) { "Backup FAILED at $(Get-Date -Format s): $($_.Exception.Message)" | Set-Content (Join-Path $Dest "FAILED.txt") }
}
finally {
  $status.finished = (Get-Date).ToString("s")
  $status | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Root "LAST-STATUS.json")
  if ($ownLock) { Remove-Item $Lock -ErrorAction SilentlyContinue }
  Stop-Transcript | Out-Null
}
Write-Host "Backup $($status.result). Details: $Root\LAST-STATUS.json"
if ($status.result -ne "OK") { exit 1 }
