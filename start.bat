@echo off
setlocal enabledelayedexpansion

set PROJECT_ROOT=D:\Projects\whiteboard
set NGINX_HOME=%PROJECT_ROOT%\tools\nginx
set NGINX_PATH=%NGINX_HOME%\nginx.exe
set NGINX_CONF=%PROJECT_ROOT%\nginx.conf

echo.
echo ============================================
echo   Whiteboard Launcher
echo ============================================
echo.

REM --- 1. Build frontend if dist/ missing ---
if not exist "%PROJECT_ROOT%\frontend\dist\index.html" (
    echo [1/3] Building frontend...
    cd /d "%PROJECT_ROOT%\frontend"
    call npm run build
    if !errorlevel! neq 0 (
        echo [ERROR] Frontend build failed!
        pause
        exit /b 1
    )
    echo [1/3] Build complete.
) else (
    echo [1/3] dist/ exists, skip build.
)

REM --- 2. Start backend ---
echo [2/3] Starting backend on 127.0.0.1:8000...
start "Whiteboard-Backend" /min cmd /c ^
  "cd /d %PROJECT_ROOT%\backend && python run.py --prod >> backend.log 2>&1"

REM Health check: poll until backend is ready (max 15s)
echo Waiting for backend...
for /L %%i in (1,1,15) do (
    curl -s http://127.0.0.1:8000/ >nul 2>nul
    if !errorlevel! equ 0 (
        echo Backend is ready.
        goto :backend_ready
    )
    timeout /t 1 /nobreak >nul
)
echo [WARN] Backend not ready after 15s, starting Nginx anyway...

:backend_ready

REM --- 3. Start or reload Nginx ---
echo [3/3] Starting Nginx...
if not exist "%NGINX_PATH%" (
    echo [ERROR] Nginx not found: %NGINX_PATH%
    echo        Download from https://nginx.org/en/download.html
    echo        Extract to %PROJECT_ROOT%\tools\nginx\
    pause
    exit /b 1
)

REM Check if Nginx is already running
tasklist /fi "IMAGENAME eq nginx.exe" 2>nul | find /i "nginx.exe" >nul
if !errorlevel! equ 0 (
    echo Nginx is running, hot reloading...
    "%NGINX_PATH%" -s reload
) else (
    "%NGINX_PATH%" -p "%NGINX_HOME%" -c "%NGINX_CONF%"
)

if !errorlevel! neq 0 (
    echo [WARN] Nginx start/reload may have failed
) else (
    echo Nginx is ready.
)

echo.
echo ============================================
echo   Whiteboard running: http://localhost
echo   Stop: stop.bat
echo ============================================
echo.

pause
