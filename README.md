# Online Whiteboard — 全栈协作白板

实时多人协作绘图白板，支持画笔、几何图形、橡皮擦、远程光标和房间系统。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18 · TypeScript · Vite · TailwindCSS · Konva.js · Zustand |
| 后端 | FastAPI · WebSocket · Python |
| 通信 | WebSocket (JSON 广播) |

## 快速启动

### 安装

```bash
# 前端
cd frontend
npm install

# 后端
cd backend
pip install -r requirements.txt
```

### 运行

```bash
# 终端 1 — 后端 (端口 8000)
cd backend
python run.py

# 终端 2 — 前端 (端口 3000)
cd frontend
npm run dev
```

打开 `http://localhost:3000`，输入用户名，创建或加入房间即可开始协作。

## 功能

### 绘图工具

| 工具 | 快捷键 | 说明 |
|------|--------|------|
| Select | V | 选中/拖拽移动图形 |
| Brush | B | 手绘自由线条 |
| Rectangle | R | 绘制矩形 |
| Circle | C | 绘制圆形 |
| Arrow | A | 绘制箭头 |
| Text | T | 点击放置文字 |
| Eraser | E | 擦除图形（详见下方） |

### 橡皮擦

| 模式 | 触发 | 效果 |
|------|------|------|
| 单击 | 点击图形 | 删除整个图形（需所有权） |
| 长按扫过 | 按住拖拽扫过画笔线条 | 精确擦除圆圈内部分，线段-圆交点裁剪 |
| 尺寸调节 | 工具栏滑块 | 3–40px 半径可调，光标同步 |

### 协作

- **房间系统**: 创建房间（6位码） / 输入房间码加入
- **远程光标**: 不同用户彩色光标 + 名称标签，100ms 节流
- **实时同步**: WebSocket 广播，乐观更新
- **所有权控制**: 仅创建者可删除/擦除自己的图形
- **撤销**: `Ctrl+Z` — 仅撤销自己创建的图形 (undoOwn)

### 工具栏

- 工具切换按钮（含快捷键提示）
- 颜色选择器（非橡皮擦模式）
- 线宽调节（非橡皮擦模式）
- 橡皮擦尺寸滑块（橡皮擦模式）
- 撤销按钮

## 架构

```
┌───────────────────────────────────┐
│          Browser (React)           │
│  ┌─────────┐  ┌────────────────┐  │
│  │ Konva   │  │  Zustand Store  │  │
│  │ Canvas  │  │  (shapes,       │  │
│  │ Layers  │  │   tools, users, │  │
│  │         │  │   cursors...)   │  │
│  └─────────┘  └───────┬────────┘  │
│                       │            │
│              ┌────────▼────────┐   │
│              │  WebSocket Cli  │   │
│              └────────┬────────┘   │
└───────────────────────┼───────────┘
                        │ JSON
┌───────────────────────┼───────────┐
│          FastAPI Server            │
│  ┌────────────────────▼────────┐  │
│  │    WebSocket Endpoint       │  │
│  │    /ws/{room_id}            │  │
│  └────────────┬────────────────┘  │
│  ┌────────────▼────────────────┐  │
│  │       RoomManager           │  │
│  │  rooms → {shapes, users}    │  │
│  │  broadcast(exclude)         │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

### WebSocket 协议

所有消息 JSON 格式：`{type, userId, timestamp, payload}`

| 类型 | 方向 | 说明 |
|------|------|------|
| `shape_created` | C→S→All | 新图形 |
| `shape_updated` | C→S→All | 图形修改（含部分擦除后的 points） |
| `shape_deleted` | C→S→All | 图形删除 |
| `cursor_move` | C→S→Others | 光标位置（100ms 节流） |
| `user_joined` | S→All | 用户加入 |
| `user_left` | S→All | 用户离开 |
| `room_state` | S→C | 新用户全量同步 |
| `ping` / `pong` | C↔S | 心跳 |

## 项目结构

```
whiteboard/
├── frontend/
│   ├── src/
│   │   ├── types/index.ts             # 类型定义
│   │   ├── store/useCanvasStore.ts    # Zustand 状态
│   │   ├── services/websocket.ts      # WebSocket 客户端
│   │   ├── tools/
│   │   │   ├── BrushTool.ts           # 画笔
│   │   │   ├── RectangleTool.ts      # 矩形
│   │   │   ├── CircleTool.ts         # 圆形
│   │   │   ├── ArrowTool.ts          # 箭头
│   │   │   ├── TextTool.ts           # 文字
│   │   │   ├── SelectTool.ts         # 选择/拖拽
│   │   │   └── EraserTool.ts         # 橡皮擦（线段-圆裁剪）
│   │   ├── managers/ToolManager.ts   # 事件路由 + 键盘
│   │   └── components/
│   │       ├── WhiteboardCanvas.tsx   # 画布 (5 Layer)
│   │       ├── Toolbar.tsx            # 工具栏
│   │       ├── CursorOverlay.tsx      # 远程光标
│   │       ├── RoomPanel.tsx          # 房间面板
│   │       └── UserList.tsx           # 在线用户
│   └── [config files]
├── backend/
│   ├── main.py            # FastAPI + WebSocket
│   ├── room_manager.py    # 房间/广播管理
│   ├── run.py             # 启动入口
│   └── requirements.txt
├── docs/
│   └── online-whiteboard-design-doc.md  # 设计文档
└── README.md
```

## 设计决策

### undoOwn（用户所有权撤销）

不采用全局历史栈，而是按 userId 逆序查找、只撤销自己创建的图形。避免协作冲突（A 撤销不会误删 B 的图形）。

### 橡皮擦线段-圆裁剪

画笔部分擦除采用解析几何：每条线段与擦除圆求交（解二次方程），精确移除圆内部分、保留圆外部分。线段被裁剪为 0/1/2 个圆外片段，按连通性拼接。

### 广播式同步（非 CRDT）

服务器只存储转发，不处理冲突。采用乐观更新 + LWW（最后写入获胜）。MVP 阶段够用，后续可升级为 CRDT。

## 已知局限

| 局限 | 说明 |
|------|------|
| **几何图形无法部分擦除** | 矩形/圆/箭头/文字不支持橡皮擦扫过部分擦除，仅支持点击整体删除。实现需 SVG path + boolean subtract，规划为后续大版本 |
| **无持久化** | 所有用户离开后房间数据丢失。后续可加 JSON/SQLite |
| **无断线重连** | WebSocket 断开需刷新页面 |
| **无画布缩放/平移** | Stage 无 scale/offset 控制 |
| **无 redoOwn** | 仅支持撤销，不支持重做 |
| **LWW 冲突** | 多人同时编辑同一图形可能丢更新 |

## 开发命令

```bash
cd frontend && npm run dev          # 前端开发
cd frontend && npx tsc --noEmit    # 类型检查
cd backend && python run.py         # 后端开发
```

## 版本历史

| Commit | 内容 |
|--------|------|
| `48d3cbb` | 橡皮擦几何图形扫过忽略，画笔拼接阈值归零 |
| `106ba80` | 橡皮擦线段-圆精确交点裁剪 |
| `7bfe54b` | 橡皮擦尺寸可调 + 光标同步 + 扫过仅画笔 |
| `d9b18e8` | 橡皮擦扫掠线段交点检测切割画笔 |
| `954b959` | 橡皮擦部分擦除初版 |
| `330b32a` | 新增橡皮擦工具（所有权检查） |
| `4c6c93e` | MVP 基线 |

## License

MIT
