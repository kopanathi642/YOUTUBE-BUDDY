@echo off
echo ========================================
echo  YouTube Buddy - One-Click Dev Starter
echo ========================================
echo.

echo [1/3] Cleaning Next.js cache to prevent errors...
if exist FRONTEND\.next (
    rmdir /s /q FRONTEND\.next
    echo Cache cleared.
)

echo.
echo [2/3] Starting Backend API...
start "YT Buddy Backend" powershell -NoExit -ExecutionPolicy Bypass -Command "if (Test-Path '..\.venv-local\Scripts\Activate.ps1') { & '..\.venv-local\Scripts\Activate.ps1' } elseif (Test-Path '..\.venv\Scripts\Activate.ps1') { & '..\.venv\Scripts\Activate.ps1' }; cd backend; python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo.
echo [3/3] Starting Frontend Dev Server...
start "YT Buddy Frontend" powershell -NoExit -ExecutionPolicy Bypass -Command "$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; cd FRONTEND; npm run dev"

echo.
echo ========================================
echo  All systems starting! 
echo.
echo  - Frontend: http://localhost:3000
echo  - Backend Docs: http://localhost:8000/api/v1/docs
echo ========================================
echo.
echo You can close this window now.
pause

