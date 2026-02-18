@echo off
REM start_dev.bat — starts backend and frontend in separate PowerShell windows with structured logs
SETLOCAL
REM Resolve repository directory (this script's folder)
set REPO_DIR=%~dp0

REM Ensure logs directory exists
if not exist "%REPO_DIR%logs" mkdir "%REPO_DIR%logs"

REM Start backend in new PowerShell window with helpful title and timestamped logs
start "" powershell -NoExit -Command "Set-Location -LiteralPath '%REPO_DIR%'; $Host.UI.RawUI.WindowTitle = 'FR: Backend'; if (!(Test-Path 'logs')) { New-Item -ItemType Directory -Path 'logs' | Out-Null }; $env:API_KEY='changeme'; $env:FACE_MATCH_THRESHOLD='0.30'; $env:LOG_LEVEL='DEBUG'; Write-Host 'Starting backend (python -u backend/app.py). Logs: %REPO_DIR%logs\backend.log'; Start-Transcript -Path 'logs\backend.log' -Append; python -u backend/app.py; Stop-Transcript"

REM Start frontend Vite dev server in another PowerShell window with title and timestamped logs
start "" powershell -NoExit -Command "Set-Location -LiteralPath '%REPO_DIR%frontend'; $Host.UI.RawUI.WindowTitle = 'FR: Frontend'; Write-Host 'Starting frontend (npm run dev). Logs: %REPO_DIR%logs\\frontend.log'; Start-Transcript -Path '..\\logs\\frontend.log' -Append; npm run dev; Stop-Transcript"

REM Print quick access links locally (frontend Vite default port shown; check logs for exact bind if different)
echo Backend: http://localhost:8000 (check logs/backend.log for actual bind port if 8000 in use)
echo Frontend (Vite): http://localhost:5173/  (see logs/frontend.log for exact output)
echo Logs are written to the 'logs' folder.



ENDLOCAL
