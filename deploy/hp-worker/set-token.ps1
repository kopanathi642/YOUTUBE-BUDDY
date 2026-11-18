# set-token.ps1 - run on the HP (double-click SET-TOKEN.cmd). Asks for the worker key, saves it, starts the worker.
$ErrorActionPreference = "Stop"
$Dir = "C:\YB-Worker"
$cfg = Join-Path $Dir "gpu-worker\worker.local.toml"
if (-not (Test-Path $cfg)) { Copy-Item (Join-Path $Dir "gpu-worker\worker.local.toml.example") $cfg }

while ($true) {
  $sec = Read-Host "Type the key shown on the ASUS (starts with ybw_)" -AsSecureString
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
  if ($tok -match '^ybw_[A-Za-z0-9_-]{16,}$') { break }
  Write-Host "That doesn't look like a key (it must start with ybw_). Try again." -ForegroundColor Yellow
}
$txt = Get-Content $cfg -Raw
$txt = [regex]::Replace($txt, '(?m)^\s*token\s*=.*$', ('token      = "' + $tok + '"'))
Set-Content $cfg $txt -Encoding utf8 -NoNewline
$tok = $null
Write-Host "Key saved in $cfg" -ForegroundColor Green

# quick check against the ASUS
try {
  $line = (Get-Content $cfg | Where-Object { $_ -match '^\s*token\s*=' }) -replace '^\s*token\s*=\s*"(.*)".*$', '$1'
  $r = Invoke-WebRequest "http://yb-server/api/v1/worker/heartbeat" -Method Post -ContentType "application/json" `
        -Headers @{ authorization = "Bearer $line" } -Body '{"capabilities":{"version":"setup-check","tasks":[]}}' -UseBasicParsing -TimeoutSec 15
  Write-Host "ASUS accepted the key (HTTP $($r.StatusCode))." -ForegroundColor Green
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -in 401,403) { Write-Host "ASUS REFUSED the key - typo? Run SET-TOKEN.cmd again." -ForegroundColor Red; Read-Host "Enter to close"; exit 1 }
  Write-Host "Could not reach the ASUS ($($_.Exception.Message)). Check Tailscale is on, then run again." -ForegroundColor Red; Read-Host "Enter to close"; exit 1
}
$line = $null

Write-Host "Starting the GPU worker in a new window ..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/k title YB GPU worker && cd /d $Dir && py -3.12 gpu-worker\worker.py" -WorkingDirectory $Dir
Write-Host "Done. Keep the 'YB GPU worker' window open." -ForegroundColor Green
Read-Host "Enter to close"
