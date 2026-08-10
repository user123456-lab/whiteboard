"""网络信息端点 — 供前端获取服务器局域网地址"""
from fastapi import APIRouter

router = APIRouter()

# 由 run.py 启动时注入
LAN_IP = "127.0.0.1"
PORT = 8000
FRONTEND_PORT = 3000


@router.get("/api/network")
async def get_network_info():
    return {
        "lanIp": LAN_IP,
        "port": PORT,
        "frontendPort": FRONTEND_PORT,
    }
