@echo off
setlocal enabledelayedexpansion

:: Resolve repository root (this batch file's directory)
set REPO_DIR=%~dp0

:: Normalize: remove trailing backslash if present
if "%REPO_DIR:~-1%"=="\" set REPO_DIR=%REPO_DIR:~0,-1%

:: Run preflight checks (will create venv / install deps if missing)
call "%REPO_DIR%\preflight.bat"
if ERRORLEVEL 1 (
	echo Preflight checks failed. Aborting startup.
	exit /b 1
)

:: Start Backend in a new terminal window using the virtualenv python if available
set VENV_PY="%REPO_DIR%\.venv\Scripts\python.exe"
if not exist %VENV_PY% (
	echo Warning: virtualenv python not found at %REPO_DIR%\.venv\Scripts\python.exe
	echo Falling back to system python.
	set VENV_PY=python
)

:: Development mode: disable RBAC permission checks to allow all users full access
set DISABLE_RBAC=1

start "Backend Server" cmd /k "cd /d "%REPO_DIR%\backend" && set DISABLE_RBAC=1 && %VENV_PY% main.py"

:: Wait a bit to give backend process time to initialize
timeout /t 2 /nobreak >nul

:: Start Frontend in a new terminal window (will use system npm)
start "Frontend Server" cmd /k "cd /d "%REPO_DIR%\frontend" && set ELECTRON_ENABLE_LOGGING=0 && npm run dev"

:: Start Electron (dev) with --disable-gpu using local node_modules electron if available.
:: This will load the dev Vite server inside Electron by setting VITE_DEV_SERVER_URL.

echo.
echo Backend and Frontend servers are starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
