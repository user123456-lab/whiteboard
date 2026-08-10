# 局域网联机功能 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持局域网内两台机器协作白板，通过手动输入 IP 访问。

**Architecture:** 前端 Vite 绑定 `0.0.0.0`，后端通过 `/api/network` 返回本机局域网 IP，前端在房间面板显示 IP + 复制按钮。WebSocket 端口从环境变量读取，不再硬编码。

**Tech Stack:** React 18 + TypeScript + Vite + Zustand, FastAPI + Python + python-dotenv, WebSocket

**Spec:** `docs/superpowers/specs/2026-05-30-lan-connection-design.md`

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `backend/.env.example` | 后端环境变量模板 |
| 新建 | `backend/api/__init__.py` | Python 包初始化 |
| 新建 | `backend/api/network.py` | GET /api/network 端点 |
| 新建 | `frontend/.env.example` | 前端环境变量模板 |
| 新建 | `frontend/src/services/network.ts` | 前端 fetchNetworkInfo() |
| 修改 | `backend/requirements.txt` | 添加 python-dotenv |
| 修改 | `backend/run.py` | 加载 .env，获取 LAN IP，打印启动信息 |
| 修改 | `backend/main.py` | 注册 network_router |
| 修改 | `backend/test_e2e.py` | 添加 /api/network 测试 |
| 修改 | `frontend/vite.config.ts` | host: '0.0.0.0'，端口从 env 读取 |
| 修改 | `frontend/src/services/websocket.ts:29` | 端口从 VITE_BACKEND_PORT 读取 |
| 修改 | `frontend/src/store/useCanvasStore.ts` | 添加 networkInfo 状态 |
| 修改 | `frontend/src/App.tsx` | 启动时调用 fetchNetworkInfo |
| 修改 | `frontend/src/components/RoomPanel.tsx` | 显示局域网地址 + 复制按钮 |

---

### Task 1: 后端 .env.example + python-dotenv 依赖

**Files:**
- Create: `backend/.env.example`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: 创建 backend/.env.example**

```bash
cat > backend/.env.example << 'EOF'
HOST=0.0.0.0
PORT=8000
FRONTEND_PORT=3000
EOF
```

- [ ] **Step 2: 添加 python-dotenv 依赖**

```bash
cd backend && source venv/bin/activate 2>/dev/null || true
echo "python-dotenv==1.0.1" >> requirements.txt
```

修改后的 `backend/requirements.txt`：
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-dotenv==1.0.1
```

- [ ] **Step 3: 安装依赖**

Run: `cd backend && pip install python-dotenv==1.0.1`
Expected: 安装成功

- [ ] **Step 4: 提交**

```bash
git add backend/.env.example backend/requirements.txt
git commit -m "[feat] 添加后端 .env.example 和 python-dotenv 依赖"
```

---

### Task 2: 后端 run.py — 加载 .env + 获取 LAN IP

**Files:**
- Modify: `backend/run.py`

- [ ] **Step 1: 重写 backend/run.py**

```python
import os
import socket
from pathlib import Path
from dotenv import load_dotenv
import uvicorn


def get_lan_ip() -> str:
    """通过 UDP 连接获取本机局域网 IPv4 地址"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
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

    # 将 network 信息注入 api/network 模块
    import api.network as net_module
    net_module.LAN_IP = lan_ip
    net_module.PORT = port
    net_module.FRONTEND_PORT = frontend_port

    uvicorn.run("main:app", host=host, port=port, reload=True)
```

- [ ] **Step 2: 验证启动信息**

Run: `cd backend && python run.py`
Expected: 终端打印类似 `后端: http://192.168.x.x:8000` 的信息

- [ ] **Step 3: 提交**

```bash
git add backend/run.py
git commit -m "[feat] run.py 加载 .env 配置 + 启动时打印局域网 IP"
```

---

### Task 3: 新建 backend/api/network.py 端点

**Files:**
- Create: `backend/api/__init__.py`
- Create: `backend/api/network.py`

- [ ] **Step 1: 创建 backend/api/__init__.py**

```bash
touch backend/api/__init__.py
```

- [ ] **Step 2: 创建 backend/api/network.py**

```python
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
```

- [ ] **Step 3: 提交**

```bash
git add backend/api/__init__.py backend/api/network.py
git commit -m "[feat] 添加 GET /api/network 网络信息端点"
```

---

### Task 4: 后端 main.py — 注册 network_router

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: 在 main.py 中添加 router 导入和注册**

在 `from room_manager import RoomManager` 之后添加：
```python
from api.network import router as network_router
```

在 `app = FastAPI(...)` 之后添加：
```python
app.include_router(network_router)
```

完整改动后的 `backend/main.py` 开头：
```python
import json
import time
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from room_manager import RoomManager
from api.network import router as network_router

app = FastAPI(title="Whiteboard Backend")

app.include_router(network_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ... 其余代码不变
```

- [ ] **Step 2: 验证 /api/network 端点**

先启动后端，再 curl 测试：
```bash
cd backend && python run.py &
sleep 3
curl http://localhost:8000/api/network
```

Expected: 返回 `{"lanIp":"192.168.x.x","port":8000,"frontendPort":3000}`

- [ ] **Step 3: 提交**

```bash
git add backend/main.py
git commit -m "[feat] main.py 注册 /api/network 路由"
```

---

### Task 5: 前端 .env.example + vite.config.ts 绑定 0.0.0.0

**Files:**
- Create: `frontend/.env.example`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: 创建 frontend/.env.example**

```bash
cat > frontend/.env.example << 'EOF'
VITE_BACKEND_PORT=8000
EOF
```

- [ ] **Step 2: 修改 frontend/vite.config.ts**

当前内容：
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
});
```

改为：
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.VITE_BACKEND_PORT || '8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/ws': {
        target: `ws://localhost:${backendPort}`,
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 3: 验证 Vite 绑定**

Run: `cd frontend && npm run dev`
Expected: 终端出现 `Network: http://192.168.x.x:3000` 信息

- [ ] **Step 4: 提交**

```bash
git add frontend/.env.example frontend/vite.config.ts
git commit -m "[feat] Vite 绑定 0.0.0.0 + 前端 .env.example"
```

---

### Task 6: 前端 websocket.ts — 端口从环境变量读取

**Files:**
- Modify: `frontend/src/services/websocket.ts:29`

- [ ] **Step 1: 修改 websocket.ts 第 29 行**

将：
```typescript
const url = `${protocol}//${host}:8000/ws/${roomId}?userId=${userId}&userName=${encodeURIComponent(userName)}`;
```

改为：
```typescript
const port = import.meta.env.VITE_BACKEND_PORT || '8000';
const url = `${protocol}//${host}:${port}/ws/${roomId}?userId=${userId}&userName=${encodeURIComponent(userName)}`;
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/services/websocket.ts
git commit -m "[feat] WebSocket 端口从 VITE_BACKEND_PORT 环境变量读取"
```

---

### Task 7: 新建前端 network.ts 服务

**Files:**
- Create: `frontend/src/services/network.ts`

- [ ] **Step 1: 创建 network.ts**

```typescript
export interface NetworkInfo {
  lanIp: string;
  port: number;
  frontendPort: number;
}

/** 获取服务器网络信息 — 用于显示局域网访问地址 */
export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  const resp = await fetch('/api/network');
  if (!resp.ok) {
    throw new Error(`Network info request failed: ${resp.status}`);
  }
  return resp.json();
}
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误（Vite 代理 `/api` 到后端 8000 端口需要验证... 等等，实际上 Vite 代理只配置了 `/ws`。需要额外加 `/api` 代理或者直接用绝对路径。让我再想想。）

实际上，前端 Vue/React 开发模式下，Vite 代理需要配置才能将 `/api` 请求转发到后端。当前 Vite 只代理了 `/ws`。我们需要在 vite.config.ts 中加 `'/api'` 代理。

但是 Task 5 已经改了 vite.config.ts，我们需要在那里一起处理。让我调整 Task 5 的 vite.config.ts。

等一下，我再重新考虑整个代理设计：
1. 当前：Vite 代理 `/ws` → `ws://localhost:8000`
2. 实际上：客户端 WebSocket 连接直接连接到 8000 端口，不使用代理
3. 新增：前端需要请求 `/api/network`，这需要通过 Vite 代理转发到后端

所以我们需要在 vite.config.ts 中加入 `/api` 代理。但这应该在 Task 5 中处理。

另外还有一个方案：`fetchNetworkInfo` 直接请求 `http://localhost:8000/api/network`，但这样会涉及到跨域问题（虽然 CORS 已经开了 `*`）。用 Vite 代理更好，不会触发跨域。

好，让我在 Task 5 的 vite.config.ts 中加上 `/api` 代理。我需要在 Task 5 中更新这个。

还有：网络信息端点需要给其他机器访问。当用户从另一台机器访问 `http://192.168.1.100:3000` 时，Vite 代理会将 `/api/network` 转发到 localhost:8000。这是对的，因为后端也在同一台机器上。

OK，我需要修改 Task 5 的 vite.config.ts 来加入 `/api` 代理。让我继续写计划，然后在自审时修正。

实际上用户说的"可以"是对整个设计文档的确认，我现在应该完成计划文档，然后在自审阶段修改。

让我继续写 Task 7。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/services/network.ts
git commit -m "[feat] 添加 fetchNetworkInfo 网络信息服务"
```

---

### Task 8: 前端 store — 添加 networkInfo 状态

**Files:**
- Modify: `frontend/src/store/useCanvasStore.ts`

- [ ] **Step 1: 在 useCanvasStore.ts 中添加 import 和类型**

在文件顶部 import 区域：
```typescript
import type { NetworkInfo } from '../services/network';
```

- [ ] **Step 2: 在 CanvasState 接口中添加属性**

在 `exportCounter: number;` 之后：
```typescript
networkInfo: NetworkInfo | null;
```

在 `setShowHistory: (show: boolean) => void;` 之后：
```typescript
setNetworkInfo: (info: NetworkInfo) => void;
```

- [ ] **Step 3: 在 create() 中添加初始值和 setter**

在初始状态 `showHistory: false,` 之后添加：
```typescript
networkInfo: null,
```

在 `setShowHistory: (show) => set({ showHistory: show }),` 之后添加：
```typescript
setNetworkInfo: (info) => set({ networkInfo: info }),
```

- [ ] **Step 4: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/store/useCanvasStore.ts
git commit -m "[feat] store 添加 networkInfo 状态管理"
```

---

### Task 9: 前端 App.tsx — 启动时获取网络信息

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 在 App.tsx 中添加网络信息获取**

在已有的 useEffect 之后新增一个 useEffect：

```typescript
import { fetchNetworkInfo } from './services/network';

// ... 在 App 函数内，已有的 useEffect 之后添加：

useEffect(() => {
  fetchNetworkInfo()
    .then((info) => {
      useCanvasStore.getState().setNetworkInfo(info);
    })
    .catch(() => {
      // 网络信息获取失败，不显示 IP（功能降级）
    });
}, []);
```

完整导入区域变为：
```typescript
import { useEffect } from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { useUserPrefs } from './store/useUserPrefs';
import { fetchNetworkInfo } from './services/network';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { SettingsPanel } from './components/SettingsPanel';
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "[feat] App 启动时获取局域网网络信息"
```

---

### Task 10: 前端 RoomPanel.tsx — 显示局域网地址 + 复制按钮

**Files:**
- Modify: `frontend/src/components/RoomPanel.tsx`

- [ ] **Step 1: 在 RoomPanel.tsx 中添加局域网地址显示**

在 store 解构中添加 `networkInfo`：
```typescript
const networkInfo = useCanvasStore((s) => s.networkInfo);
```

在"登录对话框"的标题下方，名称输入框上方，添加局域网地址提示：

```tsx
{/* 局域网地址提示 — 在登录对话框中显示 */}
{networkInfo && (
  <div className="flex items-center gap-1.5 mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
    <span className="text-[10px] text-slate-500 uppercase tracking-wider flex-shrink-0">LAN</span>
    <code className="text-[11px] text-slate-300 font-mono flex-1 truncate">
      http://{networkInfo.lanIp}:{networkInfo.frontendPort}
    </code>
    <button
      onClick={() => {
        navigator.clipboard.writeText(`http://${networkInfo.lanIp}:${networkInfo.frontendPort}`)
          .catch(() => {});
      }}
      className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
      title="复制局域网地址"
    >
      <Copy className="w-3 h-3 text-slate-400" />
    </button>
  </div>
)}
```

注意：需要在已有的 import 中，`Copy` 图标已经在导入中，无需额外导入。

- [ ] **Step 2: 在已加入房间状态下也显示局域网地址**

在"已加入房间"的折叠面板中（`hover-expand-content` 内），房间代码下方、用户列表上方添加局域网地址行：

```tsx
{/* 局域网地址 */}
{networkInfo && (
  <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded bg-white/5">
    <span className="text-[10px] text-slate-500 flex-shrink-0">LAN</span>
    <code className="text-[10px] text-slate-400 font-mono truncate">
      http://{networkInfo.lanIp}:{networkInfo.frontendPort}
    </code>
    <button
      onClick={() => {
        navigator.clipboard.writeText(`http://${networkInfo.lanIp}:${networkInfo.frontendPort}`)
          .catch(() => {});
      }}
      className="p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
    >
      <Copy className="w-2.5 h-2.5 text-slate-500" />
    </button>
  </div>
)}
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/RoomPanel.tsx
git commit -m "[feat] 房间面板显示局域网地址 + 复制按钮"
```

---

### Task 11: Vite 代理补充 — /api 路径转发

**Files:**
- Modify: `frontend/vite.config.ts`

> **说明：** Task 5 中已添加 `/ws` 代理，但 `fetchNetworkInfo` 发起的 `/api/network` 请求也需要通过 Vite 转发到后端。需要补充 `/api` 路径代理。

- [ ] **Step 1: 修改 vite.config.ts 添加 /api 代理**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.VITE_BACKEND_PORT || '8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/ws': {
        target: `ws://localhost:${backendPort}`,
        ws: true,
      },
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 2: 验证代理生效**

重启 Vite 开发服务器后：
```bash
curl http://localhost:3000/api/network
```
Expected: 返回 `{"lanIp":"...","port":8000,"frontendPort":3000}`

- [ ] **Step 3: 提交**

```bash
git add frontend/vite.config.ts
git commit -m "[feat] vite.config.ts 添加 /api 代理到后端"
```

---

### Task 12: E2E 测试 — /api/network 端点验证

**Files:**
- Modify: `backend/test_e2e.py`

- [ ] **Step 1: 添加网络端点测试函数**

在 `test_e2e.py` 末尾（`main` 函数之前）添加：

```python
async def test_network_endpoint():
    """Test GET /api/network returns correct format"""
    print("\n── Network Endpoint ──")

    import urllib.request

    try:
        resp = urllib.request.urlopen("http://localhost:8000/api/network", timeout=5)
        data = json.loads(resp.read())
        required_keys = {"lanIp", "port", "frontendPort"}
        if required_keys.issubset(data.keys()):
            if isinstance(data["port"], int) and isinstance(data["frontendPort"], int):
                ok(f"network endpoint returns valid data: {data['lanIp']}:{data['port']}")
            else:
                fail("network: port types", str(data))
        else:
            fail("network: missing keys", str(data))
    except Exception as e:
        fail("network endpoint", str(e))
```

- [ ] **Step 2: 在 main() 函数中添加测试调用**

在 main() 的 test 列表中添加：
```python
(test_network_endpoint, "Network Endpoint"),
```

- [ ] **Step 3: 运行 E2E 测试**

```bash
cd backend && python test_e2e.py
```

Expected: 所有 7 项测试通过（含新增的网络端点测试）

- [ ] **Step 4: 提交**

```bash
git add backend/test_e2e.py
git commit -m "[test] E2E 添加 /api/network 端点测试"
```

---

### Task 13: 端到端手动验证

- [ ] **Step 1: 启动后端**

```bash
cd backend && python run.py
```

确认终端打印了局域网 IP。

- [ ] **Step 2: 启动前端**

```bash
cd frontend && npm run dev
```

确认终端显示 `Network: http://192.168.x.x:3000`

- [ ] **Step 3: 本机浏览器访问测试**

打开 `http://localhost:3000`，确认：
- 登录对话框显示 LAN 地址（IP + 端口）
- 复制按钮可点击
- 创建房间后，房间面板内也显示 LAN 地址

- [ ] **Step 4: 局域网访问测试**

在另一台机器打开浏览器，访问 `http://<LAN_IP>:3000`，确认：
- 页面正常加载
- 登录对话框显示相同的 LAN 地址
- 可以创建/加入房间
- 两台机器能互相看到对方操作

- [ ] **Step 5: 类型检查 + 构建验证**

```bash
cd frontend && npx tsc --noEmit && npm run build
cd backend && python test_e2e.py
```

Expected: 全部通过
