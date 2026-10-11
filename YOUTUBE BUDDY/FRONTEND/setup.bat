@echo off
echo ========================================
echo  YouTube Buddy - Setup Script
echo ========================================
echo.

echo [1/3] Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Creating .env.local from template...
if not exist .env.local (
    copy .env.local.example .env.local
    echo Created .env.local - You can run in local development mode without Firebase credentials.
) else (
    echo .env.local already exists, skipping.
)

echo.
echo [3/3] Starting development server...
echo Open http://localhost:3000 in your browser
echo.
echo LOCAL DEVELOPMENT: Firebase is optional. Blank Firebase settings will run in demo mode.
echo.
npm run dev
