@echo off
setlocal enabledelayedexpansion

REM Project root: derived from script location (not hardcoded)
set PROJECT_ROOT=%~dp0
if "%PROJECT_ROOT:~-1%"=="\" set PROJECT_ROOT=%PROJECT_ROOT:~0,-1%
set NGINX_HOME=%PROJECT_ROOT%\tools\nginx
set NGINX_PATH=%NGINX_HOME%\nginx.exe

echo Stopping Whiteboard...

REM --- 1. Stop backend gracefully first ---
echo [1/2] Stopping backend...
taskkill /fi "WINDOWTITLE eq Whiteboard-Backend*" 2>nul
if !errorlevel! equ 0 (
    timeout /t 3 /nobreak >nul
    tasklist /fi "WINDOWTITLE eq Whiteboard-Backend*" 2>nul | find /i "cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo Backend not responding, force killing...
        taskkill /fi "WINDOWTITLE eq Whiteboard-Backend*" /f 2>nul
    )
    echo Backend stopped.
) else (
    echo Backend not running (or window title mismatch).
)

REM --- 2. Stop Nginx ---
echo [2/2] Stopping Nginx...
if exist "%NGINX_PATH%" (
    REM Keep in sync with start.bat's -p prefix so nginx.pid is found
    "%NGINX_PATH%" -p "%NGINX_HOME%" -s quit 2>nul
    if !errorlevel! equ 0 (
        echo Nginx stopped.
    ) else (
        echo Nginx not running or already stopped.
    )
) else (
    echo Nginx not found, skip.
)

echo.
echo All stopped.
pause
