@echo off
REM YouTube Buddy Backend Setup Script for Windows

setlocal enabledelayedexpansion

echo YouTube Buddy Backend Setup Script
echo ====================================

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please install Python 3.12+
    exit /b 1
)

echo Creating virtual environment...
python -m venv venv

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing dependencies...
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

echo Initializing local database...
python -c "import asyncio; from app.core.database import init_db; asyncio.run(init_db())"

echo Checking for FFmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo WARNING: FFmpeg is not installed
    echo Please download and install FFmpeg from https://ffmpeg.org/download.html
) else (
    echo FFmpeg is installed
)

echo Setup complete!
echo To start the backend:
echo   venv\Scripts\activate.bat
echo   uvicorn app.main:app --reload
pause
