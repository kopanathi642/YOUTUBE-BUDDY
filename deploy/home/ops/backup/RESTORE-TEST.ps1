# YouTube Buddy X - isolated restore test (v3, FOR APPROVAL - not yet run).
# Restores one backup into THROWAWAY containers and compares it with what production had at backup time.
# Isolation:
#   * creates only: containers ybrestore-db / ybrestore-storage, volumes ybrestore_pg / ybrestore_media, network ybrestore-net
#   * refuses to start if any ybrestore* object already exists (so cleanup can only remove what THIS run created)
#   * network is --internal (no route to the host, the internet or production) or none; no published ports
#   * no production volume is ever mounted; the backup folder is mounted read-only; --pull never; 512 MB memory cap each
#   * the private key lives only in a temporary key folder, deleted at the end; decrypted .env is read into memory only
#     and credentials are handed to Docker as environment names (not in a file, not on the command line)
# You type the passphrase into gpg's prompt; it is never shown or stored.
# Usage:  powershell -ExecutionPolicy Bypass -File RESTORE-TEST.ps1 -Day 2026-11-14 -PrivateKey F:\yb-backup-private.asc

param([Parameter(Mandatory)][string]$Day, [Parameter(Mandatory)][string]$PrivateKey,
      [string]$Root = "D:\YB-Backups", [string]$Repo = "$env:USERPROFILE\YOUTUBE-BUDDY")
$ErrorActionPreference = "Stop"
$Gpg     = "C:\Program Files\Git\usr\bin\gpg.exe"
$GpgConf = "C:\Program Files\Git\usr\bin\gpgconf.exe"
$Src     = Join-Path $Root "daily\$Day"
$TmpKeys = Join-Path $env:TEMP ("ybr" + [guid]::NewGuid().ToString("N").Substring(0, 8))   # short path: gpg-agent socket name limit
$TmpHome = $TmpKeys -replace '\\', '/'
$Rustfs  = "rustfs/rustfs:1.0.4@sha256:ed9210d6411d77ffceb70d94b964a3cb7d225983368bc25bebe01e995293dcc2"   # same as production
$result  = [ordered]@{ day = $Day; tested = (Get-Date).ToString("s"); checks = [ordered]@{} }
$created = $false
function Check($name, $ok, $detail) { $result.checks[$name] = @{ pass = [bool]$ok; detail = "$detail" }; Write-Host ("{0} {1} - {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail) -ForegroundColor $(if ($ok) { "Green" } else { "Red" }) }
function Ok($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }

try {
  if (!(Test-Path (Join-Path $Src "SHA256SUMS.txt"))) { throw "No completed backup for $Day in $Src" }
  if (Test-Path (Join-Path $Src "FAILED.txt")) { throw "The backup for $Day is marked FAILED" }

  # 0. Guard
  $clash = @(docker ps -a --format "{{.Names}}") + @(docker volume ls --format "{{.Name}}") + @(docker network ls --format "{{.Name}}") | Where-Object { $_ -like "ybrestore*" }
  if ($clash) { throw "Leftover ybrestore objects exist ($($clash -join ', ')). This script will not touch them; inspect and remove them yourself." }

  # 1. Integrity: every file matches the SHA-256 recorded at backup time
  $bad = Get-Content (Join-Path $Src "SHA256SUMS.txt") | ForEach-Object { $h, $f = $_ -split '  ', 2; if ((Get-FileHash (Join-Path $Src $f) -Algorithm SHA256).Hash.ToLower() -ne $h) { $f } }
  Check "hashes" (-not $bad) $(if ($bad) { "mismatched: " + ($bad -join ", ") } else { "all files match SHA256SUMS.txt" })

  # 2. Secrets: private key into a TEMPORARY key folder; decrypt to memory only. The passphrase is read hidden and
  #    passed to gpg through its input stream (never on the command line or disk).
  $sec = Read-Host "Backup key passphrase" -AsSecureString
  $pp = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  New-Item -ItemType Directory -Force $TmpKeys | Out-Null
  $pp | & $Gpg --homedir $TmpHome --batch --pinentry-mode loopback --passphrase-fd 0 --import $PrivateKey; Ok "import private key (temporary key folder)"
  $dec = "`"$Gpg`" --homedir `"$TmpHome`" --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt `"$Src\secrets.tar.gpg`""
  $list = $pp | cmd /c "$dec | tar -tf -"; Ok "decrypt + list secrets (wrong passphrase stops here)"
  $envText = $pp | cmd /c "$dec | tar -xOf - .env"; Ok "read .env from the encrypted archive"
  $pp = $null
  $envVars = @{}; $envText | Where-Object { $_ -match '^\s*([A-Z0-9_]+)=(.*?)\s*$' } | ForEach-Object { $envVars[$Matches[1]] = $Matches[2] }
  $need = "POSTGRES_PASSWORD", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "TOKEN_ENCRYPTION_KEY"
  $missing = $need | Where-Object { -not $envVars[$_] }
  Check "secrets-env" (-not $missing) $(if ($missing) { "missing: $($missing -join ', ')" } else { "required names present (values not shown)" })
  $cf = @("cloudflared/cert.pem", "cloudflared/tunnel.json", "cloudflared/config.yml") | Where-Object { $list -notcontains $_ }
  Check "secrets-cloudflare" (-not $cf) $(if ($cf) { "missing: $($cf -join ', ')" } else { "cert.pem, tunnel.json, config.yml present" })

  # 3. Database: fresh Postgres 16 on the isolated network; compare row counts with those recorded at backup time
  docker network create --internal ybrestore-net | Out-Null; Ok "create isolated network"; $created = $true
  $env:POSTGRES_PASSWORD = [guid]::NewGuid().ToString("N")       # throwaway password for the throwaway database
  docker run -d --pull never --memory 512m --name ybrestore-db --network ybrestore-net -e POSTGRES_PASSWORD -e POSTGRES_USER=creator -e POSTGRES_DB=creator -v ybrestore_pg:/var/lib/postgresql/data postgres:16 | Out-Null; Ok "start throwaway db"
  Remove-Item Env:\POSTGRES_PASSWORD
  for ($i = 0; $i -lt 30; $i++) { if ((docker exec ybrestore-db pg_isready -U creator) -match "accepting") { break }; Start-Sleep 2 }
  docker cp (Join-Path $Src "creator.dump") ybrestore-db:/tmp/r.dump; Ok "copy dump into throwaway db"
  docker exec ybrestore-db pg_restore -U creator -d creator --no-owner /tmp/r.dump   # warnings allowed; the row counts decide
  $want = Get-Content (Join-Path $Src "db-rowcounts.txt")
  $sql = ($want | ForEach-Object { $t = ($_ -split '\|')[0]; "select '$t',count(*) from $t" }) -join " union all "
  $got = docker exec ybrestore-db psql -U creator -d creator -At -c $sql; Ok "count restored rows"
  Check "database-rows" ($null -eq (Compare-Object $want $got)) ("backup: " + ($want -join "; ") + " | restored: " + ($got -join "; "))

  # 4. Media: copy the backup into a fresh volume, start the SAME RustFS version on it, count objects
  docker run --rm --pull never --network none --memory 512m -v ybrestore_media:/data -v "${Root}\media-current:/src:ro" postgres:16 cp -a /src/. /data/; Ok "copy media into throwaway volume"
  $env:RUSTFS_ACCESS_KEY = $envVars.S3_ACCESS_KEY_ID; $env:RUSTFS_SECRET_KEY = $envVars.S3_SECRET_ACCESS_KEY
  docker run -d --pull never --memory 512m --name ybrestore-storage --network ybrestore-net -e RUSTFS_ACCESS_KEY -e RUSTFS_SECRET_KEY -e RUSTFS_CONSOLE_ENABLE=false -v ybrestore_media:/data --entrypoint /entrypoint.sh $Rustfs rustfs | Out-Null; Ok "start throwaway storage"
  $py = "import boto3,os,time;c=boto3.client('s3',endpoint_url='http://ybrestore-storage:9000',aws_access_key_id=os.environ['RUSTFS_ACCESS_KEY'],aws_secret_access_key=os.environ['RUSTFS_SECRET_KEY'],region_name='us-east-1');o=None`nfor i in range(30):`n  try: o=[x for p in c.get_paginator('list_objects_v2').paginate(Bucket='youtubebuddy-media') for x in p.get('Contents',[])]; break`n  except Exception: time.sleep(2)`nprint(len(o),sum(x['Size'] for x in o)) if o is not None else print('unreachable')"
  $gotMedia = docker run --rm --pull never --memory 512m --network ybrestore-net -e RUSTFS_ACCESS_KEY -e RUSTFS_SECRET_KEY youtubebuddy-app python -c $py
  Remove-Item Env:\RUSTFS_ACCESS_KEY, Env:\RUSTFS_SECRET_KEY
  $wantMedia = (Get-Content (Join-Path $Src "media-objects.txt")) -split ' '
  $okMedia = ($gotMedia -ne 'unreachable') -and ([int64](($gotMedia -split ' ')[0]) -ge [int64]$wantMedia[0])
  Check "media-objects" $okMedia "backup-time objects/bytes: $($wantMedia -join ' ') | restored: $gotMedia (restored may be larger: uploads after the dump)"

  # 5. Project: the git bundle is complete (verified against your repo, read-only)
  git -C $Repo bundle verify --quiet (Join-Path $Src "repo.bundle")
  Check "repo-bundle" ($LASTEXITCODE -eq 0) "git bundle verify"
}
catch { Check "stopped" $false $_.Exception.Message }
finally {
  if ($created) {   # remove ONLY what this run created (the guard guarantees none of these existed before)
    docker rm -f ybrestore-db ybrestore-storage | Out-Null
    docker volume rm ybrestore_pg ybrestore_media | Out-Null
    docker network rm ybrestore-net | Out-Null
  }
  $pp = $null; $envVars = $null; $envText = $null
  Remove-Item Env:\RUSTFS_ACCESS_KEY, Env:\RUSTFS_SECRET_KEY, Env:\POSTGRES_PASSWORD -ErrorAction SilentlyContinue
  if (Test-Path $TmpKeys) { & $GpgConf --homedir $TmpHome --kill gpg-agent; Remove-Item $TmpKeys -Recurse -Force }   # private key gone from this laptop
  $result.passed = -not ($result.checks.Values | Where-Object { -not $_.pass })
  $result | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Root "logs\restore-test-$Day.json")
  Write-Host ("RESULT: " + $(if ($result.passed) { "PASSED" } else { "FAILED" }))
}
