@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set PROJECT_ROOT=D:\Projects\whiteboard
set NGINX_PATH=C:\nginx\nginx.exe
set NGINX_CONF=%PROJECT_ROOT%\nginx.conf

echo.
echo ============================================
echo   Whiteboard 生产启动器
echo ============================================
echo.

REM --- 1. 构建前端（dist/ 不存在时自动构建）---
if not exist "%PROJECT_ROOT%\frontend\dist\index.html" (
    echo [1/3] 构建前端...
    cd /d "%PROJECT_ROOT%\frontend"
    call npm run build
    if !errorlevel! neq 0 (
        echo [错误] 前端构建失败！
        pause
        exit /b 1
    )
    echo [1/3] 前端构建完成。
) else (
    echo [1/3] dist/ 已存在，跳过构建（需更新请手动运行 npm run build）
)

REM --- 2. 启动后端 ---
echo [2/3] 启动后端 (127.0.0.1:8000)...
start "Whiteboard-Backend" /min cmd /c ^
  "cd /d %PROJECT_ROOT%\backend && set WHITEBOARD_ENV=production && python run.py >> backend.log 2>&1"

REM 健康检查：轮询等待后端就绪（最多 15 秒）
echo 等待后端就绪...
for /L %%i in (1,1,15) do (
    curl -s http://127.0.0.1:8000/ >nul 2>nul
    if !errorlevel! equ 0 (
        echo 后端已就绪。
        goto :backend_ready
    )
    timeout /t 1 /nobreak >nul
)
echo [警告] 后端在 15 秒内未就绪，继续启动 Nginx...

:backend_ready

REM --- 3. 启动或重载 Nginx ---
echo [3/3] 启动 Nginx...
if not exist "%NGINX_PATH%" (
    echo [错误] 未找到 Nginx: %NGINX_PATH%
    echo        请从 https://nginx.org/en/download.html 下载并解压到 C:\nginx\
    pause
    exit /b 1
)

REM 检查 Nginx 是否已在运行
tasklist /fi "IMAGENAME eq nginx.exe" 2>nul | find /i "nginx.exe" >nul
if !errorlevel! equ 0 (
    REM 已在运行，做热重载
    echo Nginx 已在运行，执行热重载...
    "%NGINX_PATH%" -s reload
) else (
    REM 首次启动
    "%NGINX_PATH%" -c "%NGINX_CONF%"
)

if !errorlevel! neq 0 (
    echo [警告] Nginx 启动或重载失败
) else (
    echo Nginx 就绪。
)

echo.
echo ============================================
echo   白板已启动！访问 http://localhost
echo   停止: stop.bat
echo ============================================
echo.

pause
