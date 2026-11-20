# deploy-fast.ps1 - put the latest version live WITHOUT building the web app on this laptop.
# The web app (frontend/prebuilt-dist) is built on a stronger machine and copied here first.
# Steps: git pull, check the prebuilt app is there, build only the light Python image, restart, health check.
$ErrorActionPreference = "Stop"
$Repo = "C:\Users\kumar\YOUTUBE-BUDDY"
function Fail($m) { Write-Host "`nSTOPPED: $m" -ForegroundColor Red; Read-Host "Enter to close"; exit 1 }

Write-Host "== 1/4 Get latest code ==" -ForegroundColor Cyan
Set-Location $Repo
git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE) { Fail "git pull failed - nothing changed on the live site" }

Write-Host "`n== 2/4 Check the prebuilt web app ==" -ForegroundColor Cyan
if (-not (Test-Path "$Repo\frontend\prebuilt-dist\index.html")) { Fail "frontend\prebuilt-dist is missing - ask Claude to copy the built web app first" }
Write-Host ("prebuilt web app found ({0} files)" -f (Get-ChildItem "$Repo\frontend\prebuilt-dist" -Recurse -File).Count) -ForegroundColor Green

Write-Host "`n== 3/4 Build + restart (site down ~1 min) ==" -ForegroundColor Yellow
Set-Location "$Repo\deploy\home"
$env:WEB_DOCKERFILE = "Dockerfile.prebuilt"
docker compose build web
if ($LASTEXITCODE) { Fail "build failed - the OLD version is still running, site is fine" }
docker compose up -d
if ($LASTEXITCODE) { Fail "docker compose up failed - run: docker compose logs web" }

Write-Host "`n== 4/4 Health check ==" -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  Start-Sleep 5
  try { $ok = (Invoke-WebRequest http://127.0.0.1:8000/api/v1/health -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200 } catch {}
}
if (-not $ok) { Fail "app not healthy after 5 min. Run: docker compose logs --tail 60 web" }
Write-Host "`nDONE. youtubebuddy.com is updated." -ForegroundColor Green
Read-Host "Enter to close"
