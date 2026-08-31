@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set NGINX_PATH=C:\nginx\nginx.exe

echo 正在停止 Whiteboard...

REM --- 1. 先优雅停止后端（让 FastAPI shutdown 执行 close_db + user_left 广播）---
echo [1/2] 停止后端...
REM 先尝试优雅关闭（无 /f），等待最多 5 秒
taskkill /fi "WINDOWTITLE eq Whiteboard-Backend*" 2>nul
if !errorlevel! equ 0 (
    timeout /t 3 /nobreak >nul
    REM 检查窗口标题对应的进程是否仍在运行
    tasklist /fi "WINDOWTITLE eq Whiteboard-Backend*" 2>nul | find /i "cmd.exe" >nul
    if !errorlevel! equ 0 (
        echo 后端未响应，强制终止...
        taskkill /fi "WINDOWTITLE eq Whiteboard-Backend*" /f 2>nul
    )
    echo 后端已停止。
) else (
    echo 后端未在运行（或窗口标题不匹配，请手动检查）。
)

REM --- 2. 再停止 Nginx（后端已安全退出）---
echo [2/2] 停止 Nginx...
if exist "%NGINX_PATH%" (
    "%NGINX_PATH%" -s quit 2>nul
    if !errorlevel! equ 0 (
        echo Nginx 已停止。
    ) else (
        echo Nginx 未在运行或已停止。
    )
) else (
    echo Nginx 路径不存在，跳过。
)

echo.
echo 所有服务已停止。
pause
