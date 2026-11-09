@echo off
rem Makes Docker Desktop use your router for DNS (fixes "lookup registry-1.docker.io: no such host"
rem when your internet provider blocks public DNS like 8.8.8.8). Safe to run again.
echo Finding your router...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$gw = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).IPv4DefaultGateway.NextHop;" ^
  "if (-not $gw) { Write-Host 'No router found - check your Wi-Fi.'; exit 1 }" ^
  "$dir = Join-Path $env:USERPROFILE '.docker'; New-Item -ItemType Directory -Force -Path $dir | Out-Null;" ^
  "$p = Join-Path $dir 'daemon.json';" ^
  "if (Test-Path $p) { Copy-Item $p ($p + '.backup') -Force; $j = Get-Content $p -Raw | ConvertFrom-Json }; if (-not $j) { $j = New-Object psobject };" ^
  "$j | Add-Member -NotePropertyName dns -NotePropertyValue @($gw) -Force;" ^
  "$j | ConvertTo-Json -Depth 20 | Set-Content -Path $p -Encoding Ascii;" ^
  "Write-Host ('Docker DNS set to your router: ' + $gw)"
if errorlevel 1 ( pause & exit /b 1 )
echo Restarting Docker's engine...
wsl --shutdown
echo.
echo Now: quit Docker Desktop (right-click its whale icon near the clock - Quit), open it again,
echo wait for "Engine running", then double-click start-local.bat.
pause
