"""网络信息端点 — 供前端获取服务器局域网地址"""
import os
import socket
from fastapi import APIRouter

router = APIRouter()


def _get_lan_ip() -> str:
    """通过 UDP 连接获取本机局域网 IPv4 地址。

    注意：多网卡环境下（如同时连接 WiFi 和以太网），返回的是
    操作系统路由到外网的接口 IP，可能不是用户期望的局域网接口。
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2.0)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


# 在模块加载时获取网络信息（兼容 uvicorn reload 子进程）
LAN_IP = _get_lan_ip()
PORT = int(os.getenv("PORT", "8000"))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "3000"))


@router.get("/api/network")
async def get_network_info():
    return {
        "lanIp": LAN_IP,
        "port": PORT,
        "frontendPort": FRONTEND_PORT,
    }
