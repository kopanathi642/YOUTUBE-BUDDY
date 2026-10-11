@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   YouTube Buddy - Google-Style Production Dev Starter
echo ===================================================
echo.

:: 1. Clear Next.js cache if present to prevent hydration/stale errors
if exist FRONTEND\.next (
    echo [*] Clearing Next.js cache for clean startup...
    rmdir /s /q FRONTEND\.next
)

:: 2. Detect Python executable
set "PYTHON_EXE="
if exist .venv-windows\Scripts\python.exe (
    set "PYTHON_EXE=%~dp0.venv-windows\Scripts\python.exe"
) else if exist .venv\Scripts\python.exe (
    set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
) else (
    where py >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_EXE=py -3"
    ) else (
        where python >nul 2>&1
        if !errorlevel! equ 0 (
            set "PYTHON_EXE=python"
        )
    )
)

if "%PYTHON_EXE%"=="" (
    echo [!] ERROR: Python not found! Please install Python 3.12+ or run setup.
    pause
    exit /b 1
)

echo [*] Using Python: %PYTHON_EXE%

:: 3. Check for FFmpeg in PATH
where ffmpeg >nul 2>&1
if !errorlevel! neq 0 (
    echo [!] NOTICE: FFmpeg is not detected in your PATH.
    echo     Video processing functions will be simulated or limited until installed.
    echo     To install on Windows: winget install Gyan.FFmpeg
    echo.
)

:: 4. Start Backend API
echo [*] Launching FastAPI Backend on http://127.0.0.1:8000 ...
start "YT Buddy - Backend API" powershell -NoExit -ExecutionPolicy Bypass -Command "cd '%~dp0backend'; & '%PYTHON_EXE%' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

:: 5. Start Frontend Dev Server
echo [*] Launching Next.js Frontend on http://localhost:3000 ...
start "YT Buddy - Next.js Frontend" powershell -NoExit -ExecutionPolicy Bypass -Command "cd '%~dp0FRONTEND'; npm run dev"

echo.
echo ===================================================
echo   All systems active!
echo.
echo   - Web App:      http://localhost:3000
echo   - API Swagger:  http://127.0.0.1:8000/api/v1/docs
echo   - Health Check: http://127.0.0.1:8000/healthz
echo   - AI Registry:  http://127.0.0.1:8000/api/v1/studio/providers
echo ===================================================
echo.
echo Windows terminals have been spawned for both services.
pause
