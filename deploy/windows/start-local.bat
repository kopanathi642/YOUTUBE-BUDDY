@echo off
rem YouTube Buddy - start the app on this Windows PC (local test: http://localhost:8000)
rem Double-click this file. Needs Docker Desktop running ("Engine running").
setlocal
cd /d "%~dp0..\.."
echo == YouTube Buddy local start ==
where docker >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not installed. Install it: winget install -e --id Docker.DockerDesktop
  pause & exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not running. Open Docker Desktop, wait for "Engine running", then run this file again.
  pause & exit /b 1
)
echo Checking that Docker can download...
docker pull hello-world >nul 2>&1
if errorlevel 1 (
  echo Docker cannot download images ^(internet/DNS^). Run fix-docker-dns.bat in this folder, then try again.
  pause & exit /b 1
)
echo Building and starting. The first time takes 15-30 minutes...
docker compose up -d --build
if errorlevel 1 (
  echo Something failed. Take a photo of the messages above and send it.
  pause & exit /b 1
)
docker compose ps
echo Waiting 30 seconds for the website to start...
timeout /t 30 >nul
start "" http://localhost:8000
echo Opened http://localhost:8000  -  to stop the app later run:  docker compose down
pause
