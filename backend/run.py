import os
import socket
from pathlib import Path
from dotenv import load_dotenv
import uvicorn


def get_lan_ip() -> str:
    """通过 UDP 连接获取本机局域网 IPv4 地址"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2.0)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    # 加载 .env 文件（不存在则使用默认值）
    load_dotenv()

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    frontend_port = int(os.getenv("FRONTEND_PORT", "3000"))

    # 确保 data 目录存在
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    lan_ip = get_lan_ip()

    print("=" * 50)
    print("Whiteboard Backend")
    print(f"  后端:  http://{lan_ip}:{port}")
    print(f"  前端:  http://{lan_ip}:{frontend_port}")
    print(f"  WebSocket: ws://{lan_ip}:{port}/ws/{{room_id}}")
    print("=" * 50)

    uvicorn.run("main:app", host=host, port=port, reload=True)
