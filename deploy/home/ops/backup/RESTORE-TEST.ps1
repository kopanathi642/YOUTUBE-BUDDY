# YouTube Buddy X - restore test (DRAFT FOR APPROVAL - not run).
# Restores one backup into THROWAWAY containers and compares it with what production had at backup time.
# Touches only things it creates, all named "ybrestore-*": 2 containers, 2 volumes, 1 network with no internet and no
# published ports. Production containers, volumes and files are never written. Run it at a quiet hour with you present:
# gpg asks for the backup key's passphrase (you type it into gpg's own window; it is never shown or stored).
# Usage:  powershell -ExecutionPolicy Bypass -File RESTORE-TEST.ps1 -Day 2026-11-15 -PrivateKey E:\yb-backup-private.asc

param([Parameter(Mandatory)][string]$Day, [Parameter(Mandatory)][string]$PrivateKey, [string]$Root = "D:\YB-Backups")
$ErrorActionPreference = "Stop"
$Gpg = "C:\Program Files\Git\usr\bin\gpg.exe"
$Src = Join-Path $Root "daily\$Day"
$Tmp = Join-Path $env:TEMP "ybrestore-secrets"
$result = [ordered]@{ day = $Day; tested = (Get-Date).ToString("s"); checks = [ordered]@{} }
function Check($name, $ok, $detail) { $result.checks[$name] = @{ pass = [bool]$ok; detail = "$detail" }; if (-not $ok) { Write-Host "FAIL $name - $detail" -ForegroundColor Red } else { Write-Host "PASS $name - $detail" -ForegroundColor Green } }

try {
  # 0. Guard: refuse to run if anything named ybrestore* already exists, so cleanup can only ever remove what THIS run created
  $clash = @(docker ps -a --format "{{.Names}}" | Where-Object { $_ -like "ybrestore*" }) + @(docker volume ls --format "{{.Name}}" | Where-Object { $_ -like "ybrestore*" }) + @(docker network ls --format "{{.Name}}" | Where-Object { $_ -like "ybrestore*" })
  if ($clash) { $script:noCleanup = $true; throw "Leftover ybrestore objects exist ($($clash -join ', ')). Inspect them; this script will not touch them." }
  # 1. Integrity: every file matches the SHA-256 recorded at backup time
  $bad = Get-Content (Join-Path $Src "SHA256SUMS.txt") | ForEach-Object { $h, $f = $_ -split '  ', 2; if ((Get-FileHash (Join-Path $Src $f) -Algorithm SHA256).Hash.ToLower() -ne $h) { $f } }
  Check "hashes" (-not $bad) ("mismatched: " + ($bad -join ", "))

  # 2. Secrets: decrypt into a private temp folder, confirm the expected files and variable NAMES exist (values never printed)
  & $Gpg --import $PrivateKey
  New-Item -ItemType Directory -Force $Tmp | Out-Null
  cmd /c "`"$Gpg`" --decrypt `"$Src\secrets.tar.gpg`" | tar -xf - -C `"$Tmp`""
  $envVars = @{}; Get-Content (Join-Path $Tmp ".env") | Where-Object { $_ -match '^\s*([A-Z0-9_]+)=(.*)$' } | ForEach-Object { $envVars[$Matches[1]] = $Matches[2] }
  $need = "POSTGRES_PASSWORD","S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY","TOKEN_ENCRYPTION_KEY"
  Check "secrets-env" (@($need | Where-Object { -not $envVars[$_] }).Count -eq 0) "required names present"
  Check "secrets-cloudflare" ((Test-Path "$Tmp\cloudflared\cert.pem") -and (Test-Path "$Tmp\cloudflared\tunnel.json")) "cert.pem + tunnel.json present"

  # 3. Database: restore into a fresh Postgres 16 and compare row counts with the counts taken at backup time
  docker network create --internal ybrestore-net | Out-Null
  $pw = [guid]::NewGuid().ToString("N")          # throwaway password for the throwaway database
  docker run -d --pull never --name ybrestore-db --network ybrestore-net -e POSTGRES_PASSWORD=$pw -e POSTGRES_USER=creator -e POSTGRES_DB=creator -v ybrestore_pg:/var/lib/postgresql/data postgres:16 | Out-Null
  for ($i = 0; $i -lt 30 -and (docker exec ybrestore-db pg_isready -U creator) -notmatch "accepting"; $i++) { Start-Sleep 2 }
  docker cp (Join-Path $Src "creator.dump") ybrestore-db:/tmp/r.dump
  docker exec ybrestore-db pg_restore -U creator -d creator --no-owner /tmp/r.dump
  $want = Get-Content (Join-Path $Src "db-rowcounts.txt")
  $sql = ($want | ForEach-Object { $t = ($_ -split '\|')[0]; "select '$t',count(*) from $t" }) -join " union all "
  $got = docker exec ybrestore-db psql -U creator -d creator -At -c $sql
  Check "database-rows" ((Compare-Object $want $got) -eq $null) ("backup: " + ($want -join "; ") + " | restored: " + ($got -join "; "))

  # 4. Media: copy the backup into a fresh volume, start the SAME RustFS version on it, count objects and bytes
  docker run --rm --pull never --network none -v ybrestore_media:/data -v "${Root}\media-current:/src:ro" postgres:16 cp -a /src/. /data/
  $ef = Join-Path $Tmp "restore.env"          # credentials passed by file, not on the command line
  "RUSTFS_ACCESS_KEY=$($envVars.S3_ACCESS_KEY_ID)`nRUSTFS_SECRET_KEY=$($envVars.S3_SECRET_ACCESS_KEY)`nRUSTFS_CONSOLE_ENABLE=false`nK=$($envVars.S3_ACCESS_KEY_ID)`nS=$($envVars.S3_SECRET_ACCESS_KEY)" | Set-Content $ef
  docker run -d --pull never --name ybrestore-storage --network ybrestore-net --env-file $ef -v ybrestore_media:/data rustfs/rustfs:1.0.4@sha256:ed9210d6411d77ffceb70d94b964a3cb7d225983368bc25bebe01e995293dcc2 | Out-Null
  Start-Sleep 8
  $py = "import boto3,os;c=boto3.client('s3',endpoint_url='http://ybrestore-storage:9000',aws_access_key_id=os.environ['K'],aws_secret_access_key=os.environ['S'],region_name='us-east-1');n=s=0`nfor p in c.get_paginator('list_objects_v2').paginate(Bucket='youtubebuddy-media'):`n  for o in p.get('Contents',[]): n+=1; s+=o['Size']`nprint(n,s)"
  $gotMedia = docker run --rm --pull never --network ybrestore-net --env-file $ef youtubebuddy-app python -c $py
  $wantMedia = Get-Content (Join-Path $Src "media-objects.txt")
  $wn, $ws = ($wantMedia -split ' '); $gn, $gs = ($gotMedia -split ' ')
  Check "media-objects" ([int64]$gn -ge [int64]$wn) "backup-time objects/bytes: $wantMedia | restored: $gotMedia (restored may be larger: files uploaded after the dump)"

  # 5. Project: the git bundle is complete and readable
  git bundle verify (Join-Path $Src "repo.bundle") 2>&1 | Out-Null
  Check "repo-bundle" ($LASTEXITCODE -eq 0) "git bundle verify"
}
catch { Check "unexpected-error" $false $_.Exception.Message }
finally {
  # Clean up ONLY what this script created (skipped if the guard found leftovers it did not create)
  if (-not $script:noCleanup) {
  docker rm -f ybrestore-db ybrestore-storage 2>$null | Out-Null
  docker volume rm ybrestore_pg ybrestore_media 2>$null | Out-Null
  docker network rm ybrestore-net 2>$null | Out-Null
  }
  if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
  # Take the private key off this laptop again (it was imported only for this test)
  $fpr = (& $Gpg --list-secret-keys --with-colons "YouTube Buddy Backup" | Select-String '^fpr' | Select-Object -First 1).ToString().Split(':')[9]
  if ($fpr) { & $Gpg --batch --yes --delete-secret-keys $fpr }
  $result.passed = -not ($result.checks.Values | Where-Object { -not $_.pass })
  $result | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Root "logs\restore-test-$Day.json")
  Write-Host ("RESULT: " + ($(if ($result.passed) { "PASSED" } else { "FAILED" })))
}
