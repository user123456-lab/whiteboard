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
| Text | T | 点击放置文字，双击编辑，字号可调 8-72px |
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
- **所有权控制**: 仅创建者可删除/擦除/锁定自己的图形
- **撤销/重做**: `Ctrl+Z` undoOwn / `Ctrl+Shift+Z` redoOwn（保留 z-order）
- **图形锁定**: `L` 键 — 锁定后他人无法选中/移动/删除/擦除
- **数据持久化**: JSON 文件存储，原子写入，shutdown 保存
- **断线重连**: 指数退避自动重连（1s→2s→…→30s ×10次）

### 画布操作

| 操作 | 方式 |
|------|------|
| 缩放 | Ctrl+滚轮（以光标为中心），工具栏 +/− 按钮 |
| 平移 | 鼠标中键拖拽 |
| 复位 | 工具栏百分比点击 / ⊡ 按钮 |

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
| **几何图形无法部分擦除** | 矩形/圆/箭头不支持橡皮擦扫过部分擦除，仅点击整体删除 |
| **LWW 冲突** | 多人同时编辑同一图形可能丢更新（后续加版本号乐观锁） |
| **无操作历史面板** | undo/redo 无 UI 历史列表 |
| **文字编辑时缩放/平移** | 编辑框位置不跟随缩放/平移实时更新 |

## 开发命令

```bash
cd frontend && npm run dev          # 前端开发
cd frontend && npx tsc --noEmit    # 类型检查
cd backend && python run.py         # 后端开发
```

## 版本历史

| 版本 | 内容 |
|------|------|
| v1.4 | 文字工具增强：点击创建+双击编辑+字号可调+悬停虚线框+自动全选 |
| v1.3 | WebSocket 断线重连+图形锁定+全面 Bug 修复（16项安全/竞态） |
| v1.2 | undoOwn+redoOwn（z-order 保留+竞态修复）+数据持久化（原子写入） |
| v1.1 | 画布缩放平移+橡皮擦精确裁剪+SelectTool 修复 |
| v1.0 | MVP：6 种工具+房间系统+远程光标+WebSocket 同步 |

## License

MIT
