# MySQL 持久化改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将白板后端持久化从 JSON 文件改为 MySQL（SQLAlchemy Core），同时移除前端 Yjs CRDT 层，简化为直接 WebSocket 同步 + version 乐观锁。

**Architecture:** 后端新增 `database.py` 管理 MySQL 连接池和建表，`room_manager.py` 精简为仅管理 WebSocket 连接与广播，`main.py` 的 WebSocket 处理器直接读写数据库。前端删除 `yjsSync.ts`，`useCanvasStore.ts` 的 CRUD 方法改为直接操作 Zustand + 发送 WebSocket 消息，undo/redo 改为自维护操作栈。

**Tech Stack:** FastAPI + SQLAlchemy Core (async) + aiomysql + MySQL 8.x（后端），React + Zustand + WebSocket（前端，去掉 yjs 依赖）

---

### Task 1: 后端依赖与数据库配置

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/.env.example`

- [ ] **Step 1: 添加 Python 依赖**

在 `backend/requirements.txt` 末尾追加：

```
# MySQL 持久化
sqlalchemy[asyncio]>=2.0
aiomysql>=0.2.0
python-dotenv>=1.0
```

- [ ] **Step 2: 添加数据库环境变量配置**

将 `backend/.env.example` 内容替换为：

```ini
# 后端监听地址和端口
HOST=0.0.0.0
PORT=8000
# 前端端口 — 仅用于启动信息显示，不控制实际前端端口
FRONTEND_PORT=3000
# MySQL 连接配置
DB_USER=root
DB_PASS=
DB_HOST=localhost
DB_PORT=3306
DB_NAME=whiteboard
```

- [ ] **Step 3: 安装依赖**

```bash
cd D:/Projects/whiteboard/backend && pip install sqlalchemy[asyncio] aiomysql python-dotenv
```

- [ ] **Step 4: 提交**

```bash
git add backend/requirements.txt backend/.env.example
git commit -m "[chore] 添加 MySQL 持久化依赖与环境变量配置"
```

---

### Task 2: 新建数据库连接模块

**Files:**
- Create: `backend/database.py`

- [ ] **Step 1: 创建 database.py**

写入以下完整内容：

```python
"""MySQL 数据库连接池管理与建表（SQLAlchemy Core 异步模式）"""
import os
import json
import time
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

# ── 配置（从环境变量读取） ──

DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "whiteboard")

DATABASE_URL = f"mysql+aiomysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = None
_session_factory = None


def get_session() -> AsyncSession:
    """获取一个新的异步数据库会话"""
    return _session_factory()


async def init_db():
    """初始化连接池，创建数据库和表"""
    global engine, _session_factory

    # 1. 创建数据库（如果不存在）
    import pymysql
    try:
        conn = pymysql.connect(
            host=DB_HOST, port=int(DB_PORT),
            user=DB_USER, password=DB_PASS,
        )
        conn.cursor().execute(
            f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` "
            f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        conn.close()
        print(f"[DB] 数据库 '{DB_NAME}' 已就绪")
    except Exception as e:
        print(f"[DB] 数据库创建跳过（可能已存在）: {e}")

    # 2. 创建异步引擎与连接池
    engine = create_async_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_recycle=3600,
    )
    _session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # 3. 建表
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rooms (
                id          VARCHAR(6)  PRIMARY KEY,
                created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shapes (
                id           VARCHAR(36)  PRIMARY KEY,
                room_id      VARCHAR(6)   NOT NULL,
                user_id      VARCHAR(36)  NOT NULL,
                type         VARCHAR(20)  NOT NULL,
                color        VARCHAR(9)   NOT NULL DEFAULT '#3B82F6',
                stroke_width INT          NOT NULL DEFAULT 2,
                fill         VARCHAR(20)  DEFAULT 'transparent',
                locked       BOOLEAN      DEFAULT FALSE,
                group_id     VARCHAR(36),
                version      INT          DEFAULT 1,
                sort_order   INT          NOT NULL DEFAULT 0,
                geometry     JSON         NOT NULL,
                created_at   BIGINT       NOT NULL,
                updated_at   BIGINT       NOT NULL,
                INDEX idx_room (room_id),
                INDEX idx_room_sort (room_id, sort_order),
                CONSTRAINT fk_shapes_room FOREIGN KEY (room_id)
                    REFERENCES rooms(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
    print("[DB] 连接池已初始化，表结构已就绪")


async def close_db():
    """关闭数据库连接池"""
    global engine
    if engine:
        await engine.dispose()
        engine = None
        print("[DB] 连接池已关闭")


# ── 数据转换辅助函数 ──

# shape type 特有的几何字段列表
_GEOMETRY_FIELDS = {
    'x', 'y', 'width', 'height', 'radius', 'points', 'text', 'fontSize',
    'cornerRadius', 'skew', 'foldSize', 'imageData',
    'fromShapeId', 'toShapeId', 'fromEdge', 'toEdge', 'endArrow',
}


def _shape_to_row(shape: dict, room_id: str, sort_order: int, now: int) -> dict:
    """将前端 shape dict 拆分为数据库列 + geometry JSON"""
    geometry = {}
    for key in _GEOMETRY_FIELDS:
        if key in shape:
            geometry[key] = shape[key]

    return {
        'id': shape.get('id'),
        'room_id': room_id,
        'user_id': shape.get('userId', ''),
        'type': shape.get('type', ''),
        'color': shape.get('color', '#3B82F6'),
        'stroke_width': shape.get('strokeWidth', 2),
        'fill': shape.get('fill') if shape.get('fill') and shape['fill'] != 'transparent' else 'transparent',
        'locked': shape.get('locked', False),
        'group_id': shape.get('groupId'),
        'version': shape.get('version', 1),
        'sort_order': sort_order,
        'geometry': json.dumps(geometry, ensure_ascii=False),
        'created_at': shape.get('createdAt', now),
        'updated_at': now,
    }


def _row_to_shape(row) -> dict:
    """将数据库行还原为前端 Shape dict"""
    d = dict(row._mapping)
    geometry = json.loads(d.pop('geometry', '{}'))

    shape = {
        'id': d['id'],
        'type': d['type'],
        'userId': d['user_id'],
        'color': d['color'],
        'strokeWidth': d['stroke_width'],
        'createdAt': d['created_at'],
        'version': d['version'],
    }
    if d.get('fill') and d['fill'] != 'transparent':
        shape['fill'] = d['fill']
    if d.get('locked'):
        shape['locked'] = True
    if d.get('group_id'):
        shape['groupId'] = d['group_id']
    shape.update(geometry)
    return shape
```

- [ ] **Step 2: 提交**

```bash
git add backend/database.py
git commit -m "[feat] 添加 MySQL 异步连接池与建表模块"
```

---

### Task 3: 重写 room_manager.py（精简为 WebSocket 连接管理）

**Files:**
- Modify: `backend/room_manager.py`

- [ ] **Step 1: 完整重写 room_manager.py**

用以下内容替换整个文件：

```python
"""房间管理 — WebSocket 连接追踪与消息广播"""
import re
from typing import Dict
from fastapi import WebSocket

USER_COLORS = [
    "#EF4444", "#10B981", "#3B82F6", "#F59E0B",
    "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
]


class UserInfo:
    """在线用户信息（内存中，不持久化）"""
    def __init__(self, user_id: str, user_name: str, color: str):
        self.user_id = user_id
        self.user_name = user_name
        self.color = color

    def to_dict(self):
        return {
            "userId": self.user_id,
            "userName": self.user_name,
            "color": self.color,
        }


class Room:
    """房间：管理 WebSocket 连接与用户信息"""
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.connections: Dict[str, WebSocket] = {}
        self.users: Dict[str, UserInfo] = {}

    def add_user(self, user_id: str, user_name: str, ws: WebSocket) -> UserInfo:
        """用户加入房间"""
        if user_id in self.connections:
            import asyncio
            try:
                asyncio.ensure_future(self.connections[user_id].close())
            except Exception:
                pass
        color = USER_COLORS[len(self.users) % len(USER_COLORS)]
        user = UserInfo(user_id, user_name, color)
        self.users[user_id] = user
        self.connections[user_id] = ws
        return user

    def remove_user(self, user_id: str, ws: WebSocket = None):
        """用户离开房间 — 仅当 ws 匹配时才移除（防止旧连接误删新连接）"""
        if ws is not None and self.connections.get(user_id) is not ws:
            return
        self.users.pop(user_id, None)
        self.connections.pop(user_id, None)

    async def broadcast(self, message: dict, exclude_user_id: str = None):
        """向房间内所有用户广播消息"""
        stale = []
        for uid, ws in list(self.connections.items()):
            if uid == exclude_user_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(uid)
        for uid in stale:
            self.remove_user(uid)

    @property
    def user_count(self) -> int:
        return len(self.connections)


class RoomManager:
    """全局房间管理器"""
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create_room(self, room_id: str) -> Room:
        """获取或创建房间（验证 room_id 合法性）"""
        if not re.match(r'^[a-zA-Z0-9_-]{1,64}$', room_id):
            raise ValueError(f"Invalid room_id: {room_id}")
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id)
        return self.rooms[room_id]

    def remove_room_if_empty(self, room_id: str):
        """删除空房间的内存追踪"""
        room = self.rooms.get(room_id)
        if room and room.user_count == 0:
            del self.rooms[room_id]
```

- [ ] **Step 2: 提交**

```bash
git add backend/room_manager.py
git commit -m "[refactor] 精简 room_manager 为纯 WebSocket 连接管理，移除 JSON 持久化"
```

---

### Task 4: 重写 main.py（集成 MySQL 数据库操作）

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: 完整重写 main.py**

用以下内容替换整个文件：

```python
"""FastAPI 主入口 — WebSocket 路由 + MySQL 持久化"""
import json
import time
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from room_manager import RoomManager
from database import init_db, close_db, get_session, _shape_to_row, _row_to_shape
from api.network import router as network_router

app = FastAPI(title="Whiteboard Backend")
app.include_router(network_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

room_manager = RoomManager()


@app.on_event("startup")
async def startup():
    await init_db()
    asyncio.create_task(heartbeat_loop())


@app.on_event("shutdown")
async def shutdown():
    await close_db()
    print("[Server] Shutdown complete")


async def heartbeat_loop():
    while True:
        await asyncio.sleep(30)
        for room in list(room_manager.rooms.values()):
            for uid, ws in list(room.connections.items()):
                try:
                    await ws.send_json({
                        "type": "ping", "userId": "server",
                        "timestamp": int(time.time() * 1000), "payload": {},
                    })
                except Exception:
                    room.remove_user(uid)


@app.get("/")
async def root():
    return {"status": "ok", "rooms": len(room_manager.rooms)}


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    userId: str = Query(...),
    userName: str = Query("Anonymous"),
):
    # 1. 获取或创建房间
    try:
        room = room_manager.get_or_create_room(room_id)
    except ValueError:
        await websocket.close(code=4000, reason="Invalid room ID")
        return

    # 2. 在数据库中创建房间记录（幂等）
    async with get_session() as session:
        await session.execute(
            text("INSERT IGNORE INTO rooms (id) VALUES (:rid)"),
            {"rid": room_id},
        )
        await session.commit()

    # 3. 用户加入房间（内存追踪）
    user_info = room.add_user(userId, userName, websocket)
    await websocket.accept()

    # 4. 从数据库加载房间图形，发送 room_state
    now = int(time.time() * 1000)
    async with get_session() as session:
        result = await session.execute(
            text("SELECT * FROM shapes WHERE room_id = :rid ORDER BY sort_order"),
            {"rid": room_id},
        )
        shapes = [_row_to_shape(row) for row in result.fetchall()]

    await websocket.send_json({
        "type": "room_state",
        "userId": "server",
        "timestamp": now,
        "payload": {
            "shapes": shapes,
            "users": [u.to_dict() for u in room.users.values() if u.user_id != userId],
        },
    })

    # 5. 广播用户加入
    await room.broadcast({
        "type": "user_joined",
        "userId": userId,
        "timestamp": now,
        "payload": user_info.to_dict(),
    }, exclude_user_id=userId)

    # 6. 消息循环
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = message.get("type")
            payload = message.get("payload", {})
            now_ts = int(time.time() * 1000)

            async with get_session() as session:

                if msg_type == "shape_created":
                    shape = payload.get("shape", {})
                    if not shape.get("id") or not shape.get("type"):
                        continue

                    # 确定 sort_order：当前最大 sort_order + 1
                    r = await session.execute(
                        text("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM shapes WHERE room_id = :rid"),
                        {"rid": room_id},
                    )
                    next_order = r.scalar()

                    row = _shape_to_row(shape, room_id, next_order, now_ts)
                    await session.execute(
                        text("""
                            INSERT INTO shapes (id, room_id, user_id, type, color, stroke_width, fill,
                                locked, group_id, version, sort_order, geometry, created_at, updated_at)
                            VALUES (:id, :room_id, :user_id, :type, :color, :stroke_width, :fill,
                                :locked, :group_id, :version, :sort_order, :geometry, :created_at, :updated_at)
                        """),
                        row,
                    )
                    await session.commit()
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shape_updated":
                    shape_id = payload.get("shapeId")
                    changes = payload.get("changes", {})
                    expected_version = payload.get("expectedVersion")
                    if not shape_id:
                        continue

                    if expected_version is not None:
                        # 乐观锁检查
                        r = await session.execute(
                            text("SELECT version FROM shapes WHERE id = :id"),
                            {"id": shape_id},
                        )
                        row = r.fetchone()
                        if not row or row[0] != expected_version:
                            await websocket.send_json({
                                "type": "shape_conflict",
                                "userId": "server",
                                "timestamp": now_ts,
                                "payload": {"shapeId": shape_id},
                            })
                            continue

                    # 构建 SET 子句 — 公共列直接设置，几何字段合并到 geometry
                    sets = []
                    params = {"id": shape_id, "now": now_ts}
                    geo_fields = {}
                    for k, v in changes.items():
                        if k == 'color':
                            sets.append("color = :color"); params['color'] = v
                        elif k == 'strokeWidth':
                            sets.append("stroke_width = :sw"); params['sw'] = v
                        elif k == 'fill':
                            sets.append("fill = :fill"); params['fill'] = v
                        elif k == 'locked':
                            sets.append("locked = :l"); params['l'] = v
                        elif k == 'groupId':
                            sets.append("group_id = :gid"); params['gid'] = v
                        elif k == 'x':
                            geo_fields['x'] = v
                        elif k == 'y':
                            geo_fields['y'] = v
                        elif k == 'width':
                            geo_fields['width'] = v
                        elif k == 'height':
                            geo_fields['height'] = v
                        elif k == 'radius':
                            geo_fields['radius'] = v
                        elif k == 'points':
                            geo_fields['points'] = v
                        elif k == 'text':
                            geo_fields['text'] = v
                        elif k == 'fontSize':
                            geo_fields['fontSize'] = v
                        elif k == 'cornerRadius':
                            geo_fields['cornerRadius'] = v
                        elif k == 'skew':
                            geo_fields['skew'] = v
                        elif k == 'foldSize':
                            geo_fields['foldSize'] = v
                        elif k == 'endArrow':
                            geo_fields['endArrow'] = v
                        elif k == 'imageData':
                            geo_fields['imageData'] = v

                    if geo_fields:
                        sets.append("geometry = JSON_MERGE_PATCH(geometry, :geo)")
                        params['geo'] = json.dumps(geo_fields, ensure_ascii=False)

                    if sets:
                        sets.append("version = version + 1")
                        sets.append("updated_at = :now")
                        sql = f"UPDATE shapes SET {', '.join(sets)} WHERE id = :id"
                        await session.execute(text(sql), params)
                    await session.commit()
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shape_updated_batch":
                    updates = payload.get("updates", [])
                    for update in updates:
                        shape_id = update.get("shapeId")
                        changes = update.get("changes", {})
                        if not shape_id:
                            continue
                        sets = []
                        params = {"id": shape_id, "now": now_ts}
                        geo_fields = {}
                        for k, v in changes.items():
                            if k == 'color':
                                sets.append("color = :color"); params['color'] = v
                            elif k == 'strokeWidth':
                                sets.append("stroke_width = :sw"); params['sw'] = v
                            elif k == 'fill':
                                sets.append("fill = :fill"); params['fill'] = v
                            elif k == 'locked':
                                sets.append("locked = :l"); params['l'] = v
                            elif k == 'groupId':
                                sets.append("group_id = :gid"); params['gid'] = v
                            elif k in ('x', 'y', 'width', 'height', 'radius', 'points',
                                        'text', 'fontSize', 'cornerRadius', 'skew', 'foldSize',
                                        'endArrow', 'imageData'):
                                geo_fields[k] = v
                        if geo_fields:
                            sets.append("geometry = JSON_MERGE_PATCH(geometry, :geo)")
                            params['geo'] = json.dumps(geo_fields, ensure_ascii=False)
                        if sets:
                            sets.append("version = version + 1")
                            sets.append("updated_at = :now")
                            sql = f"UPDATE shapes SET {', '.join(sets)} WHERE id = :id"
                            await session.execute(text(sql), params)
                    await session.commit()
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shape_deleted":
                    shape_id = payload.get("shapeId")
                    if shape_id:
                        await session.execute(
                            text("DELETE FROM shapes WHERE id = :id"),
                            {"id": shape_id},
                        )
                        await session.commit()
                        await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shapes_reorder":
                    order = payload.get("order", [])
                    if isinstance(order, list):
                        for idx, shape_id in enumerate(order):
                            await session.execute(
                                text("UPDATE shapes SET sort_order = :so WHERE id = :id"),
                                {"so": idx, "id": shape_id},
                            )
                        await session.commit()
                        await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "cursor_move":
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "ping":
                    await websocket.send_json({
                        "type": "pong", "userId": "server",
                        "timestamp": now_ts, "payload": {},
                    })

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        room.remove_user(userId, websocket)
        if room.user_count == 0:
            room_manager.remove_room_if_empty(room_id)
        else:
            try:
                await room.broadcast({
                    "type": "user_left",
                    "userId": userId,
                    "timestamp": int(time.time() * 1000),
                    "payload": {"userId": userId},
                })
            except Exception:
                pass
```

- [ ] **Step 2: 提交**

```bash
git add backend/main.py
git commit -m "[feat] WebSocket 处理器集成 MySQL 持久化，按 shape_created/updated/deleted/reorder 类型读写数据库"
```

---

### Task 5: 删除前端 Yjs 同步层并重写 Store

**Files:**
- Delete: `frontend/src/services/yjsSync.ts`
- Modify: `frontend/src/store/useCanvasStore.ts`

- [ ] **Step 1: 删除 yjsSync.ts**

```bash
cd D:/Projects/whiteboard/frontend && rm src/services/yjsSync.ts
```

- [ ] **Step 2: 重写 useCanvasStore.ts**

用以下内容替换整个文件：

```typescript
import { create } from 'zustand';
import type { Shape, ToolType, UserInfo, CursorPosition, HistoryEntry } from '../types';
import { sendMessage, getWs } from '../services/websocket';
import type { NetworkInfo } from '../services/network';

// ── Undo/Redo 操作栈 ──

interface UndoEntry {
  undo: () => void;
  redo: () => void;
}

let _undoStack: UndoEntry[] = [];
let _redoStack: UndoEntry[] = [];
let _undoRedoing = false;

function pushUndo(entry: UndoEntry): void {
  if (_undoRedoing) return;
  _undoStack.push(entry);
  if (_undoStack.length > 200) _undoStack.shift();
  _redoStack = [];
}

export interface CanvasState {
  shapes: Shape[];
  selectedIds: string[];
  activeTool: ToolType;
  toolColor: string;
  toolWidth: number;
  toolFontSize: number;
  toolFill: string;
  editingTextId: string | null;
  eraserRadius: number;
  userId: string;
  userName: string;
  roomId: string | null;
  users: UserInfo[];
  remoteCursors: Record<string, CursorPosition>;
  wsConnected: boolean;
  wsReconnecting: boolean;
  stageScale: number;
  stageX: number;
  stageY: number;
  clipboard: Shape | null;
  gridMode: 'none' | 'dot' | 'line';
  history: HistoryEntry[];
  showHistory: boolean;
  exportCounter: number;
  networkInfo: NetworkInfo | null;
  requestExport: () => void;

  setUserId: (id: string) => void;
  setUserName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;

  addShape: (shape: Shape) => void;
  updateShape: (id: string, data: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  toggleLock: (shapeId: string) => boolean;
  batchApplySweepResult: (result: {
    shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
    shapesToCreate: Array<Shape>;
    shapesToDelete: string[];
  }) => void;
  moveShapeUp: (shapeId: string) => void;
  moveShapeDown: (shapeId: string) => void;
  moveShapeTop: (shapeId: string) => void;
  moveShapeBottom: (shapeId: string) => void;

  undo: () => void;
  redo: () => void;

  remoteCreateShape: (shape: Shape) => void;
  remoteUpdateShape: (id: string, data: Partial<Shape>) => void;
  remoteDeleteShape: (id: string) => void;
  bootstrapShapes: (shapes: Shape[]) => void;

  setSelectedId: (id: string | null) => void;
  selectOnly: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectGroup: (groupId: string) => void;
  selectAll: () => void;
  setActiveTool: (tool: ToolType) => void;
  setToolColor: (color: string) => void;
  setToolWidth: (width: number) => void;
  setToolFontSize: (size: number) => void;
  setToolFill: (color: string) => void;
  setEditingTextId: (id: string | null) => void;
  setEraserRadius: (radius: number) => void;
  setUsers: (users: UserInfo[]) => void;
  addUser: (user: UserInfo) => void;
  removeUser: (userId: string) => void;
  updateRemoteCursor: (cursor: CursorPosition) => void;
  removeRemoteCursor: (userId: string) => void;
  loadShapes: (shapes: Shape[]) => void;
  setStageScale: (scale: number) => void;
  setStagePosition: (x: number, y: number) => void;
  setClipboard: (shape: Shape | null) => void;
  setGridMode: (mode: 'none' | 'dot' | 'line') => void;
  setShowHistory: (show: boolean) => void;
  setNetworkInfo: (info: NetworkInfo) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  shapes: [],
  selectedIds: [],
  activeTool: 'select',
  toolColor: '#3B82F6',
  toolWidth: 2,
  toolFontSize: 18,
  toolFill: 'transparent',
  editingTextId: null,
  eraserRadius: 10,
  userId: '',
  userName: '',
  roomId: null,
  users: [],
  remoteCursors: {},
  wsConnected: false,
  wsReconnecting: false,
  stageScale: 1,
  stageX: 0,
  stageY: 0,
  clipboard: null,
  gridMode: 'none',
  history: [],
  showHistory: false,
  exportCounter: 0,
  networkInfo: null,

  requestExport: () => set((s) => ({ exportCounter: s.exportCounter + 1 })),

  setUserId: (id) => set({ userId: id }),
  setUserName: (name) => set({ userName: name }),
  setRoomId: (id) => set({ roomId: id }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),

  // ── Shape CRUD（直接操作 Zustand + 发送 WebSocket）──

  addShape: (shape) => {
    set((s) => ({ shapes: [...s.shapes, shape] }));
    const store = get();
    pushUndo({
      undo: () => store.deleteShape(shape.id),
      redo: () => {
        _undoRedoing = true;
        store.addShape(shape);
        _undoRedoing = false;
      },
    });
    sendMessage(getWs(), 'shape_created', { shape }, store.userId);
  },

  updateShape: (id, data) => {
    let prev: Partial<Shape> | null = null;
    let oldVersion: number | undefined;
    set((s) => {
      const old = s.shapes.find((sh) => sh.id === id);
      if (old) {
        prev = {};
        oldVersion = old.version;
        for (const k of Object.keys(data)) {
          (prev as Record<string, unknown>)[k] = (old as Record<string, unknown>)[k];
        }
      }
      return {
        shapes: s.shapes.map((sh) =>
          sh.id === id ? { ...sh, ...data, version: (sh.version ?? 1) + 1 } : sh,
        ),
      };
    });
    const store = get();
    if (prev) {
      pushUndo({
        undo: () => store.updateShape(id, prev!),
        redo: () => store.updateShape(id, data),
      });
    }
    sendMessage(
      getWs(), 'shape_updated',
      { shapeId: id, changes: data, expectedVersion: oldVersion },
      store.userId,
    );
  },

  deleteShape: (id) => {
    let shape: Shape | null = null;
    set((s) => {
      shape = s.shapes.find((sh) => sh.id === id) ?? null;
      return { shapes: s.shapes.filter((sh) => sh.id !== id) };
    });
    const store = get();
    if (shape) {
      pushUndo({
        undo: () => {
          _undoRedoing = true;
          store.addShape(shape!);
          _undoRedoing = false;
        },
        redo: () => store.deleteShape(id),
      });
    }
    sendMessage(getWs(), 'shape_deleted', { shapeId: id }, store.userId);
  },

  toggleLock: (shapeId) => {
    const shape = get().shapes.find((s) => s.id === shapeId);
    if (!shape) return false;
    const newLocked = !shape.locked;
    get().updateShape(shapeId, { locked: newLocked } as Partial<Shape>);
    return newLocked;
  },

  batchApplySweepResult: (result) => {
    _undoRedoing = true;
    set((s) => {
      let shapes = [...s.shapes];
      for (const { shapeId, points } of result.shapesToUpdate) {
        shapes = shapes.map((sh) =>
          sh.id === shapeId ? { ...sh, points } : sh,
        );
      }
      for (const shape of result.shapesToCreate) {
        shapes = [...shapes, shape];
      }
      const deleteSet = new Set(result.shapesToDelete);
      shapes = shapes.filter((sh) => !deleteSet.has(sh.id));
      return { shapes };
    });
    _undoRedoing = false;
    const store = get();
    if (result.shapesToUpdate.length > 0) {
      sendMessage(getWs(), 'shape_updated_batch', {
        updates: result.shapesToUpdate.map((u) => ({
          shapeId: u.shapeId,
          changes: { points: u.points },
        })),
      }, store.userId);
    }
    for (const shape of result.shapesToCreate) {
      sendMessage(getWs(), 'shape_created', { shape }, store.userId);
    }
    for (const id of result.shapesToDelete) {
      sendMessage(getWs(), 'shape_deleted', { shapeId: id }, store.userId);
    }
  },

  // ── 图层排序 ──

  moveShapeUp: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx === -1 || idx >= s.shapes.length - 1) return s;
      const newShapes = [...s.shapes];
      [newShapes[idx], newShapes[idx + 1]] = [newShapes[idx + 1], newShapes[idx]];
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  moveShapeDown: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx <= 0) return s;
      const newShapes = [...s.shapes];
      [newShapes[idx], newShapes[idx - 1]] = [newShapes[idx - 1], newShapes[idx]];
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  moveShapeTop: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx === -1 || idx >= s.shapes.length - 1) return s;
      const newShapes = s.shapes.filter((sh) => sh.id !== shapeId);
      newShapes.push(s.shapes[idx]);
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  moveShapeBottom: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx <= 0) return s;
      const newShapes = s.shapes.filter((sh) => sh.id !== shapeId);
      newShapes.unshift(s.shapes[idx]);
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  // ── Undo / Redo（自维护操作栈）──

  undo: () => {
    if (_undoStack.length === 0) return;
    _undoRedoing = true;
    const entry = _undoStack.pop()!;
    entry.undo();
    _redoStack.push(entry);
    _undoRedoing = false;
  },

  redo: () => {
    if (_redoStack.length === 0) return;
    _undoRedoing = true;
    const entry = _redoStack.pop()!;
    entry.redo();
    _undoStack.push(entry);
    _undoRedoing = false;
  },

  // ── 远程消息处理（不触发 undo 栈，不重复广播）──

  remoteCreateShape: (shape) => {
    set((s) => {
      if (s.shapes.find((sh) => sh.id === shape.id)) return s;
      return { shapes: [...s.shapes, shape] };
    });
  },

  remoteUpdateShape: (id, data) => {
    set((s) => ({
      shapes: s.shapes.map((sh) =>
        sh.id === id ? { ...sh, ...data } : sh,
      ),
    }));
  },

  remoteDeleteShape: (id) => {
    set((s) => ({ shapes: s.shapes.filter((sh) => sh.id !== id) }));
  },

  bootstrapShapes: (shapes) => {
    set({ shapes });
  },

  // ── 选择 ──

  setSelectedId: (id) => set({ selectedIds: id ? [id] : [] }),
  selectOnly: (id) => set({ selectedIds: [id] }),
  toggleSelect: (id) =>
    set((state) => {
      const exists = state.selectedIds.includes(id);
      return {
        selectedIds: exists
          ? state.selectedIds.filter((i) => i !== id)
          : [...state.selectedIds, id],
      };
    }),
  clearSelection: () => set({ selectedIds: [] }),
  selectAll: () =>
    set((state) => {
      const selectableIds = state.shapes
        .filter((s) => s.type !== 'connector')
        .map((s) => s.id);
      return { selectedIds: selectableIds };
    }),
  selectGroup: (groupId) =>
    set((state) => {
      const groupIds = state.shapes
        .filter((s) => s.groupId === groupId)
        .map((s) => s.id);
      return { selectedIds: groupIds };
    }),
  setActiveTool: (tool) => set({ activeTool: tool, selectedIds: [] }),
  setToolColor: (color) => set({ toolColor: color }),
  setToolWidth: (width) => set({ toolWidth: width }),
  setToolFontSize: (size) => set({ toolFontSize: Math.max(8, Math.min(72, size)) }),
  setToolFill: (color) => set({ toolFill: color }),
  setEditingTextId: (id) => set({ editingTextId: id }),
  setEraserRadius: (radius) => set({ eraserRadius: radius }),

  // ── 用户与光标 ──

  setUsers: (users) => set({ users }),
  addUser: (user) =>
    set((state) => {
      if (state.users.find((u) => u.userId === user.userId)) return state;
      return { users: [...state.users, user] };
    }),
  removeUser: (userId) =>
    set((state) => {
      const cursors = { ...state.remoteCursors };
      delete cursors[userId];
      return {
        users: state.users.filter((u) => u.userId !== userId),
        remoteCursors: cursors,
      };
    }),
  updateRemoteCursor: (cursor) =>
    set((state) => ({
      remoteCursors: { ...state.remoteCursors, [cursor.userId]: cursor },
    })),
  removeRemoteCursor: (userId) =>
    set((state) => {
      const cursors = { ...state.remoteCursors };
      delete cursors[userId];
      return { remoteCursors: cursors };
    }),

  loadShapes: (shapes) =>
    set((state) => {
      const validIds = new Set(shapes.map((s) => s.id));
      const selectedIds = state.selectedIds.filter((id) => validIds.has(id));
      return { shapes, selectedIds };
    }),

  setStageScale: (scale) => {
    if (!Number.isFinite(scale)) return;
    set({ stageScale: Math.max(0.1, Math.min(5, scale)) });
  },
  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  setClipboard: (shape) => set({ clipboard: shape }),
  setGridMode: (mode) => set({ gridMode: mode }),
  setShowHistory: (show) => set({ showHistory: show }),
  setNetworkInfo: (info) => set({ networkInfo: info }),
}));
```

- [ ] **Step 3: 更新 websocket.ts — 修改 room_state 处理**

在 `websocket.ts` 的 `handleMessage` 函数中，将：

```typescript
case 'room_state': {
  const payload = msg.payload as { shapes: never[]; users: never[] };
  store.bootstrapYjs(payload.shapes, true);
  store.setUsers(payload.users);
  break;
}
```

改为：

```typescript
case 'room_state': {
  const payload = msg.payload as { shapes: never[]; users: never[] };
  store.bootstrapShapes(payload.shapes as never);
  store.setUsers(payload.users as never);
  break;
}
```

同时删除文件顶部的 `import { setSyncTransport } from './yjsSync';` 行。

同时删除 `ws.onopen` 回调中的 `setSyncTransport(...)` 调用。

- [ ] **Step 4: 更新 ToolManager.ts — 删除 Yjs 引用**

删除文件顶部的 `import { whiteboardSync } from '../services/yjsSync';` 行。

在 `groupShapes` 方法调用处（`handleKeyDown` 中 Ctrl+G 分支），将：

```typescript
if (store.selectedIds.length >= 2) {
  whiteboardSync.groupShapes(store.selectedIds);
}
```

改为：

```typescript
if (store.selectedIds.length >= 2) {
  const groupId = generateUUID();
  for (const id of store.selectedIds) {
    store.updateShape(id, { groupId } as Partial<Shape>);
  }
  store.selectGroup(groupId);
}
```

同样 Ctrl+Shift+G 分支，将：

```typescript
if (store.selectedIds.length > 0) {
  whiteboardSync.ungroupShapes(store.selectedIds);
  store.clearSelection();
}
```

改为：

```typescript
if (store.selectedIds.length > 0) {
  for (const id of store.selectedIds) {
    store.updateShape(id, { groupId: null } as Partial<Shape>);
  }
  store.clearSelection();
}
```

- [ ] **Step 5: 卸载 yjs 包**

```bash
cd D:/Projects/whiteboard/frontend && npm uninstall yjs
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/services/yjsSync.ts frontend/src/store/useCanvasStore.ts frontend/src/services/websocket.ts frontend/src/managers/ToolManager.ts frontend/package.json frontend/package-lock.json
git commit -m "[refactor] 移除 Yjs CRDT 层，改为直接 Zustand + WebSocket 同步 + 自维护 undo/redo 栈"
```

---

### Task 6: 验证构建

**Files:** 无新建，验证现有文件

- [ ] **Step 1: 前端类型检查**

```bash
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit
```

预期：0 错误。若有错误，检查类型导出是否遗漏。

- [ ] **Step 2: 前端构建**

```bash
cd D:/Projects/whiteboard/frontend && npm run build
```

预期：构建成功。

- [ ] **Step 3: 清理残留 JSON 数据文件（可选）**

清理历史 JSON 文件：

```bash
rm -rf D:/Projects/whiteboard/backend/data/
```

---

### Task 7: 清理前端 yjs 残留引用

**Files:**
- Modify: `frontend/src/managers/ToolManager.ts`

- [ ] **Step 1: 确认没有遗漏的 yjsSync 引用**

```bash
cd D:/Projects/whiteboard && grep -r "yjsSync\|whiteboardSync\|bootstrapYjs\|yjs" --include="*.ts" --include="*.tsx" frontend/src/
```

预期：无匹配结果。

- [ ] **Step 2: 最终提交**

```bash
git add -A
git commit -m "[chore] 清理 Yjs 残留引用，删除 JSON 持久化数据文件"
```

---

### Task 8: 更新 E2E 测试

**Files:**
- Modify: `backend/test_e2e.py`

- [ ] **Step 1: 更新持久化测试连接等待时间**

在 `test_persistence` 函数中，reconnect 之前增加等待时间确保 MySQL 写入完成：

将：
```python
await asyncio.sleep(0.5)
```

改为：
```python
await asyncio.sleep(1.0)
```

（MySQL 写入比内存操作稍慢，需要多等一会儿确保数据落库）

- [ ] **Step 2: 提交**

```bash
git add backend/test_e2e.py
git commit -m "[test] 适配 MySQL 持久化的 E2E 测试等待时间"
```
