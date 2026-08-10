# 局域网联机功能 — 设计文档

**日期：** 2026-05-30
**状态：** 待实现
**版本：** v2.1

---

## 目标

支持局域网内两台机器协作：机器 A 运行白板服务，机器 B 通过局域网地址访问并参与协作。

## 使用场景

- **开发测试：** 一台跑服务，另一台浏览器访问测试
- **小团队协作：** 局域网内多人日常使用

## 范围

### 包含
- 前后端端口可配置（`.env` 文件）
- 后端启动时显示本机局域网 IP
- `GET /api/network` 返回网络信息
- 前端 Vite 绑定 `0.0.0.0`
- WebSocket 端口从环境变量读取
- 房间面板显示局域网地址 + 复制按钮

### 排除（后续迭代）
- mDNS / Bonjour 自动服务发现
- 移动端二维码分享
- WebRTC 备选通道

---

## 架构

```
┌──────────────────────────────────────────┐
│ Machine A (服务端)                         │
│                                          │
│  backend/.env      frontend/.env         │
│  (from .env.example, git-ignored)         │
│  HOST=0.0.0.0      VITE_DEV_PORT=3000    │
│  PORT=8000         VITE_BACKEND_PORT=8000│
│                    　　　　　　　　　　　　　│
│  FastAPI :8000 ◄── Vite :3000            │
│  /api/network      (0.0.0.0 绑定)        │
│  /ws/{room_id}                          │
│                                          │
└──────────────┬───────────────────────────┘
               │ 局域网
               │ http://192.168.1.100:3000
               ▼
┌──────────────────────────────────────────┐
│ Machine B (客户端)                        │
│                                          │
│  浏览器访问 http://192.168.1.100:3000     │
│  → 加载前端页面                           │
│  → GET /api/network 获取网络信息          │
│  → WebSocket ws://192.168.1.100:8000     │
│                                          │
└──────────────────────────────────────────┘
```

---

## 详细设计

### 1. 配置文件

**backend/.env.example**（实际 .env 不提交到 git）
```
HOST=0.0.0.0
PORT=8000
```
- 新建 `backend/requirements.txt` 加 `python-dotenv`
- `run.py` 用 `dotenv.load_dotenv()` 加载，默认值覆盖未设置的情况

**frontend/.env.example**（实际 .env 不提交到 git）
```
VITE_BACKEND_PORT=8000
```
- Vite 原生支持 `.env`，无需额外依赖
- 只暴露 `VITE_` 前缀变量给客户端代码

### 2. 后端

#### run.py
- 用 `os.getenv("HOST", "0.0.0.0")` 和 `os.getenv("PORT", "8000")`
- 启动时用 `socket.gethostbyname(socket.gethostname())` 获取局域网 IP
- 无法获取时回退到 `127.0.0.1`
- 打印 `白板服务: http://<LAN_IP>:<PORT>`
- 前端端口也打印（用于告知用户访问地址）

#### api/network.py（新增）
```python
from fastapi import APIRouter

router = APIRouter()

@router.get("/api/network")
async def get_network_info():
    return {
        "lanIp": LAN_IP,      # 本机局域网 IPv4
        "port": PORT,         # 后端端口
        "frontendPort": FRONTEND_PORT  # 前端端口
    }
```

#### main.py
- `app.include_router(network_router)`
- 其他不变

### 3. 前端

#### vite.config.ts
```typescript
server: {
  host: '0.0.0.0',
  port: parseInt(process.env.VITE_DEV_PORT || '3000'),
  proxy: {
    '/ws': {
      target: `ws://localhost:${process.env.VITE_BACKEND_PORT || '8000'}`,
      ws: true,
    },
  },
}
```

#### websocket.ts
```typescript
const port = import.meta.env.VITE_BACKEND_PORT || '8000';
const url = `${protocol}//${host}:${port}/ws/${roomId}...`;
```

#### 新增 network.ts 服务
```typescript
// 获取网络信息的 API 调用
export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  const resp = await fetch('/api/network');
  return resp.json();
}
```

#### store/useCanvasStore.ts
- 新增 `networkInfo: NetworkInfo | null`
- 新增 `setNetworkInfo(info: NetworkInfo)`

#### App.tsx
- useEffect 启动时调用 `fetchNetworkInfo()`，存入 store

#### RoomPanel.tsx
- 房间面板顶部新增局域网地址行
- 显示 `http://<lanIp>:<frontendPort>` + 📋 复制按钮
- 已加入房间后同样可见

---

## 网络信息获取方式

后端在 `run.py` 中获取 IP：
```python
import socket

def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
```

通过 UDP 连接到外部地址获取本机 IP，避免 `socket.gethostbyname(socket.gethostname())` 在多网卡/虚拟机环境下的问题。

---

## 错误处理

| 场景 | 处理 |
|------|------|
| 无法获取局域网 IP | 降级为 `127.0.0.1`，前端显示 `localhost` |
| `/api/network` 请求失败 | 前端不显示 IP 行，其他功能正常 |
| 另一台机器无法连接 | 浏览器自然报错，不做额外处理 |
| `.env` 文件不存在 | 使用硬编码默认值 |

---

## 测试计划

- **E2E：** `test_e2e.py` 增加局域网端点测试（`GET /api/network` 返回格式验证）
- **手动测试：** 机器 A 启动服务 → 机器 B 浏览器访问 `http://<IP>:3000` → 创建/加入房间 → 验证同步

---

## 文件清单

| 操作 | 文件 |
|------|------|
| 新建 | `backend/.env.example`（模板，.env 不提交） |
| 新建 | `frontend/.env.example`（模板，.env 不提交） |
| 新建 | `backend/api/__init__.py` |
| 新建 | `backend/api/network.py` |
| 修改 | `backend/run.py` |
| 修改 | `backend/requirements.txt`（+ python-dotenv） |
| 修改 | `backend/main.py` |
| 修改 | `frontend/vite.config.ts` |
| 修改 | `frontend/src/services/websocket.ts` |
| 修改 | `frontend/src/store/useCanvasStore.ts` |
| 修改 | `frontend/src/App.tsx` |
| 修改 | `frontend/src/components/RoomPanel.tsx` |
