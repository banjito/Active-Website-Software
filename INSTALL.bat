@echo off
echo ================================================
echo   ampOS Desktop - Installation Script
echo ================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js found: %NODE_VERSION%

:: Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm is not installed
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm found: %NPM_VERSION%
echo.

:: Install dependencies
echo 📦 Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed
echo.

:: Check for .env file
if not exist .env (
    echo ⚠️  No .env file found
    echo Creating .env file from template...
    echo VITE_SUPABASE_URL=your_supabase_url > .env
    echo VITE_SUPABASE_ANON_KEY=your_supabase_anon_key >> .env
    echo ⚠️  Please edit .env file with your Supabase credentials
)

echo.
echo ================================================
echo   Installation Complete! 🎉
echo ================================================
echo.
echo Next steps:
echo.
echo 1. Edit .env file with your Supabase credentials (if needed)
echo.
echo 2. Test in development mode:
echo    npm run dev:electron
echo.
echo 3. Build for production:
echo    npm run build:desktop
echo.
echo 4. Read the documentation:
echo    - QUICK_START.md       (quick start guide)
echo    - OFFLINE_SETUP.md     (detailed setup)
echo    - README-DESKTOP.md    (user guide)
echo.
echo ================================================
pause
