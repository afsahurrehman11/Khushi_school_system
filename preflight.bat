@echo off
setlocal

:: Resolve repository root (this batch file's directory)
set REPO_DIR=%~dp0
if "%REPO_DIR:~-1%"=="\" set REPO_DIR=%REPO_DIR:~0,-1%
echo Repository: %REPO_DIR%
echo.
call :log INFO Checking Python availability and preparing virtualenv...

set VENV_DIR=%REPO_DIR%\.venv
set VENV_PY=%VENV_DIR%\Scripts\python.exe

:: Find a candidate system python — prefer the py launcher, then system python excluding repo venv
set SYS_PY=

:: Simple logger: call :log LEVEL message...
:log
setlocal
set "LEVEL=%~1"
shift
set "MSG=%*"
set "TS=%TIME:~0,8%"
echo [%TS%] %LEVEL%: %MSG%
endlocal & exit /b 0
for /f "delims=" %%I in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do if not defined SYS_PY set SYS_PY=%%I
if not defined SYS_PY (
    for /f "delims=" %%I in ('where python 2^>nul') do (
        call :is_repo_venv "%%~I"
        if ERRORLEVEL 1 (
            if not defined SYS_PY set SYS_PY=%%~I
        )
    )
)

if not defined SYS_PY (
    echo ERROR: No suitable system Python found. Install Python 3 and retry.
    exit /b 1
)

call :log INFO System Python candidate: %SYS_PY%

:: Create repo venv if missing (use system python to create)
if not exist "%VENV_PY%" (
    call :log INFO Creating virtualenv at %VENV_DIR% using %SYS_PY% ...
    "%SYS_PY%" -m venv "%VENV_DIR%"
    if ERRORLEVEL 1 (
        echo ERROR: Failed to create virtualenv at %VENV_DIR%
        exit /b 1
    )
    call :log INFO Created virtualenv at %VENV_DIR%.
)

:: Quick health check: ensure venv python runs and pip module works. If not, recreate venv.
call :log INFO Checking venv health...
"%VENV_PY%" -c "import sys; print(sys.executable)" >nul 2>&1
if ERRORLEVEL 1 (
    call :log WARN venv python is not runnable. Recreating venv using %SYS_PY%...
    rmdir /s /q "%VENV_DIR%" >nul 2>&1
    "%SYS_PY%" -m venv "%VENV_DIR%"
    if ERRORLEVEL 1 (
        call :log ERROR Failed to recreate virtualenv at %VENV_DIR%
        exit /b 1
    )
    call :log INFO Recreated virtualenv at %VENV_DIR%.
)

:: Also ensure pip works; if pip invocation fails due to broken launcher, recreate venv.
"%VENV_PY%" -m pip --version >nul 2>&1
if ERRORLEVEL 1 (
    echo venv pip is not working. Recreating venv using %SYS_PY%...
    rmdir /s /q "%VENV_DIR%" >nul 2>&1
    "%SYS_PY%" -m venv "%VENV_DIR%"
    if ERRORLEVEL 1 (
        echo ERROR: Failed to recreate virtualenv at %VENV_DIR%
        exit /b 1
    )
    echo Recreated virtualenv at %VENV_DIR%.
)

:: Confirm venv python exists
if not exist "%VENV_PY%" (
    echo ERROR: virtualenv python not found at %VENV_PY% after creation.
    exit /b 1
)

call :log INFO Upgrading pip in venv...
"%VENV_PY%" -m pip install --upgrade pip setuptools wheel >nul 2>&1

:: Install backend requirements if present
if exist "%REPO_DIR%\backend\requirements.txt" (
    call :log INFO Installing backend Python requirements...
    "%VENV_PY%" -m pip install -r "%REPO_DIR%\backend\requirements.txt"
    if ERRORLEVEL 1 (
        call :log ERROR Failed to install backend requirements.
        exit /b 1
    )
)
if not exist "%REPO_DIR%\backend\requirements.txt" (
    echo Note: backend requirements file not found at %REPO_DIR%\backend\requirements.txt — skipping Python deps install.
)

echo.
call :log INFO Checking Node.js and npm...
set NODE_CMD=
set NPM_CMD=
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set NODE_CMD=%%I
for /f "delims=" %%I in ('where npm 2^>nul') do if not defined NPM_CMD set NPM_CMD=%%I

if not defined NODE_CMD (
    call :log WARN Node.js not found on PATH. Frontend setup will be skipped. Install Node.js to enable frontend.
    set SKIP_FRONTEND=1
)

if defined NODE_CMD (
    call :log INFO Found Node: %NODE_CMD%
)
if defined NPM_CMD (
    call :log INFO Found npm: %NPM_CMD%
)

:: Frontend deps (flattened logic to avoid parser issues)
set FRONT_DIR=%REPO_DIR%\frontend
if not exist "%FRONT_DIR%" (
    echo Warning: frontend folder not found at %FRONT_DIR% - skipping frontend checks.
    set SKIP_FRONTEND=1
)

if not defined SKIP_FRONTEND (
    pushd "%FRONT_DIR%"
    if not exist package.json (
        echo Warning: package.json not found in %FRONT_DIR% - skipping frontend dependency check.
        popd
    ) else (
        rem package.json exists
        if exist node_modules (
            echo node_modules already present - skipping npm install.
            popd
        ) else (
            call :log INFO Installing frontend packages (this may take a while)...
            if exist package-lock.json (
                npm ci
            ) else (
                npm install
            )
            if ERRORLEVEL 1 (
                call :log ERROR npm install failed in %FRONT_DIR%
                popd
                exit /b 1
            )
            popd
        )
    )
)

call :log INFO Preflight checks completed successfully.
exit /b 0

:: Helper: returns 0 if argument path is inside a repo .venv folder, otherwise returns 1
:is_repo_venv
setlocal
set "_p=%~1"
echo %_p% | findstr /i "\\.venv\\" >nul
if %errorlevel%==0 (endlocal & exit /b 0) else (endlocal & exit /b 1)
