# YouTube Buddy X - finish the ASUS backup setup in one run (ADMINISTRATOR PowerShell).
#   1. read-only image of the USB stick F: (skipped if F: is not plugged in)        -> D:\YB-Backups\recovery
#   2. partial restore test of the 14 Nov backup (no key): DB + media + project, isolated throwaway containers
#   3. stay awake on mains power (sleep/hibernate never, lid = do nothing); battery settings untouched;
#      the previous values are saved first to D:\YB-Backups\logs\power-before-*.txt
#   4. ONLY if step 2 reported PARTIAL or PASSED: schedule the nightly backup at 02:41 (won't replace an existing task)
#   5. deploy the new server code (GPU-worker API, switched OFF): tag current version, git pull --ff-only, build the image
#      while the site keeps running, then recreate ONLY web + worker (~1 min down; never starts the llm container),
#      and wait for https://youtubebuddy.com/api/v1/health to answer ok
# Stops at the first failure. Does not touch the website, Docker volumes, .env or existing backups.
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File D:\YB-Backups\scripts\ASUS-FINISH.ps1

param([string]$Day = "2026-11-14", [string]$Root = "D:\YB-Backups", [switch]$SkipUsb, [switch]$SkipDeploy,
      [string]$Repo = "$env:USERPROFILE\YOUTUBE-BUDDY")
$ErrorActionPreference = "Stop"
$Scripts = Join-Path $Root "scripts"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Start-Transcript -Path (Join-Path $Root "logs\asus-finish-$stamp.log") | Out-Null
function Head($t) { Write-Host "`n==== $t ====" -ForegroundColor Cyan }
try {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { throw "Run this in an ADMINISTRATOR PowerShell. Nothing was done." }

  Head "1/5 USB image (read-only)"
  if ($SkipUsb) { Write-Host "skipped (-SkipUsb)" }
  elseif (-not (Get-Volume -DriveLetter F -ErrorAction SilentlyContinue)) { Write-Host "F: not plugged in - skipped. Plug it in and run IMAGE-USB.ps1 later." -ForegroundColor Yellow }
  else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "IMAGE-USB.ps1") -Drive F
    if ($LASTEXITCODE -ne 0) { throw "USB imaging failed (see above). Stopping before anything else." }
  }

  Head "2/5 Partial restore test ($Day, no key)"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "RESTORE-TEST.ps1") -Day $Day -NoKey
  $rt = Get-Content (Join-Path $Root "logs\restore-test-$Day-nokey.json") -Raw | ConvertFrom-Json
  if ($rt.result -notin "PARTIAL", "PASSED") { throw "Restore test result: $($rt.result). Stopping: no schedule is created on an unproven backup." }
  Write-Host "restore test: $($rt.result)" -ForegroundColor Green

  Head "3/5 Stay awake on mains power (battery unchanged)"
  $before = Join-Path $Root "logs\power-before-$stamp.txt"
  powercfg /qh SCHEME_CURRENT SUB_SLEEP | Out-File $before
  powercfg /qh SCHEME_CURRENT SUB_BUTTONS | Out-File $before -Append
  powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 0
  powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE 0
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
  powercfg /setactive SCHEME_CURRENT
  $chk = powercfg /qh SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String "Current AC"
  if ("$chk" -notmatch "0x00000000") { throw "Sleep setting did not apply: $chk" }
  Write-Host "done. Previous values saved in $before. Undo: powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 10800; ... HIBERNATEIDLE 10800; SUB_BUTTONS LIDACTION 1; powercfg /setactive SCHEME_CURRENT" -ForegroundColor Green

  Head "4/5 Nightly backup schedule (02:41)"
  if (Get-ScheduledTask -TaskName "YB Nightly Backup" -ErrorAction SilentlyContinue) { Write-Host "a task named 'YB Nightly Backup' already exists - left unchanged" -ForegroundColor Yellow }
  else {
    $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Scripts\BACKUP-NIGHTLY.ps1`""
    $trg = New-ScheduledTaskTrigger -Daily -At "02:41"
    $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $who = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $pri = New-ScheduledTaskPrincipal -UserId $who -LogonType Interactive -RunLevel Limited   # Docker needs your signed-in session
    Register-ScheduledTask -TaskName "YB Nightly Backup" -Action $act -Trigger $trg -Settings $set -Principal $pri -Description "YouTube Buddy X nightly backup to D:\YB-Backups" | Out-Null
    Write-Host "scheduled daily at 02:41 for $who (missed runs start when the laptop is next on). Undo: Unregister-ScheduledTask -TaskName 'YB Nightly Backup'" -ForegroundColor Green
  }
  Head "5/5 Deploy new server code (GPU worker API stays OFF)"
  if ($SkipDeploy) { Write-Host "skipped (-SkipDeploy)" }
  else {
    $home_ = Join-Path $Repo "deploy\home"
    $prev = (git -C $Repo rev-parse --short HEAD).Trim()
    git -C $Repo tag -f "live-before-gpu" $prev | Out-Null
    Write-Host "current live version $prev tagged 'live-before-gpu' (rollback point)"
    git -C $Repo pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull failed - the live site was NOT changed." }
    Push-Location $home_
    try {
      docker compose build web                      # the old containers keep serving while this builds
      if ($LASTEXITCODE -ne 0) { throw "image build failed - the live site was NOT changed (old containers still running)." }
      docker compose up -d --no-deps web worker     # only these two; never the llm profile; db/storage/tunnel untouched
      if ($LASTEXITCODE -ne 0) { throw "restart of web/worker failed" }
    } finally { Pop-Location }
    $ok = $false
    for ($i = 0; $i -lt 36 -and -not $ok; $i++) {
      Start-Sleep 5
      try { $r = Invoke-WebRequest -UseBasicParsing "https://youtubebuddy.com/api/v1/health" -TimeoutSec 10; $ok = ($r.StatusCode -eq 200 -and $r.Content -match '"status":"ok"') } catch { }
    }
    if (-not $ok) { throw "site not healthy 3 minutes after the restart. Rollback: git -C `"$Repo`" checkout live-before-gpu -- backend gpu-worker; then in deploy\home: docker compose build web; docker compose up -d --no-deps web worker" }
    Write-Host "site healthy on the new version $((git -C $Repo rev-parse --short HEAD).Trim())" -ForegroundColor Green
  }
  Write-Host "`nALL STEPS DONE." -ForegroundColor Green
}
catch { Write-Host "`nSTOPPED: $($_.Exception.Message)" -ForegroundColor Red; Stop-Transcript | Out-Null; exit 1 }
Stop-Transcript | Out-Null
