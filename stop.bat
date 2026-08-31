@echo off
setlocal enabledelayedexpansion

set PROJECT_ROOT=D:\Projects\whiteboard
set NGINX_PATH=%PROJECT_ROOT%\tools\nginx\nginx.exe

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
    "%NGINX_PATH%" -s quit 2>nul
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
