# CLAUDE.md — Online Whiteboard 全栈协作白板

## 对话规则

- **强制使用中文进行对话**：所有回复、解释、代码注释均使用中文。

## 项目概述

实时多人协作绘图白板，支持画笔、几何图形、橡皮擦、远程光标和房间系统。

## 技术栈

| 层     | 技术                                                |
| ------ | --------------------------------------------------- |
| 前端   | React 18 · TypeScript · Vite · TailwindCSS · Konva.js · Zustand |
| 后端   | FastAPI · WebSocket · Python                        |
| 通信   | WebSocket (JSON 广播)                               |

## 关键路径

- 项目根目录：`D:\Projects\whiteboard\`
- 前端源码：`frontend/src/`
- 后端源码：`backend/`

## 常用命令

```bash
# 前端开发服务器 (端口 3000)
cd frontend && npm run dev

# 前端类型检查
cd frontend && npx tsc --noEmit

# 后端开发服务器 (端口 8000)
cd backend && python run.py

# 安装依赖
cd frontend && npm install
cd backend && pip install -r requirements.txt
```

## 项目结构

```
whiteboard/
├── frontend/
│   ├── src/
│   │   ├── types/index.ts             # 类型定义 (Shape, ToolType, WSMessage...)
│   │   ├── store/useCanvasStore.ts    # Zustand 全局状态（shapes, users, tools...）
│   │   ├── services/websocket.ts      # WebSocket 客户端（连接、重连、消息路由）
│   │   ├── managers/ToolManager.ts    # 事件路由 + 键盘快捷键
│   │   ├── tools/
│   │   │   ├── BrushTool.ts           # 手绘自由线条
│   │   │   ├── RectangleTool.ts      # 矩形
│   │   │   ├── CircleTool.ts         # 圆形
│   │   │   ├── ArrowTool.ts          # 箭头
│   │   │   ├── TextTool.ts           # 文字（点击创建 + 双击编辑）
│   │   │   ├── SelectTool.ts         # 选中/拖拽移动
│   │   │   └── EraserTool.ts         # 橡皮擦（线段-圆精确裁剪）
│   │   └── components/
│   │       ├── WhiteboardCanvas.tsx   # 主画布 (Stage + 5 Layer)
│   │       ├── Toolbar.tsx            # 工具栏（工具切换、颜色、线宽、缩放、撤销）
│   │       ├── CursorOverlay.tsx      # 远程光标叠加层
│   │       ├── RoomPanel.tsx          # 房间面板（创建/加入/离开）
│   │       └── UserList.tsx           # 在线用户列表
│   └── [config files]
├── backend/
│   ├── main.py                        # FastAPI + WebSocket 路由
│   ├── room_manager.py                # 房间管理（Room, RoomManager）
│   ├── run.py                         # uvicorn 启动入口
│   └── data/                          # JSON 持久化数据
├── docs/
├── README.md
└── online-whiteboard-design-doc.md    # 详细设计文档
```

## 架构

```
Browser (React)
  ┌──────────┐   ┌───────────────┐
  │  Konva   │   │ Zustand Store │
  │  Canvas  │   │ (shapes,tools,│
  │ (5 Layer)│   │  users,cursors│
  └──────────┘   └───────┬───────┘
                         │
                ┌────────▼────────┐
                │  WebSocket Cli  │
                └────────┬────────┘
                         │ JSON
                ┌────────▼────────┐
                │  FastAPI Server │
                │  RoomManager    │
                │  rooms → {shapes│
                │   , users}      │
                │  broadcast()    │
                └─────────────────┘
```

## WebSocket 协议

所有消息 JSON 格式：`{type, userId, timestamp, payload}`

| 类型            | 方向        | 说明               |
| --------------- | ----------- | ------------------ |
| `shape_created` | C→S→All     | 新图形             |
| `shape_updated` | C→S→All     | 图形修改           |
| `shape_deleted` | C→S→All     | 图形删除           |
| `cursor_move`   | C→S→Others  | 光标位置（100ms节流）|
| `user_joined`   | S→All       | 用户加入           |
| `user_left`     | S→All       | 用户离开           |
| `room_state`    | S→C         | 新用户全量同步     |
| `ping`/`pong`   | C↔S         | 心跳               |

## Shape 类型

```typescript
type ShapeType = 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text';
// Brush: { points: number[] }
// Rectangle: { x, y, width, height }
// Circle: { x, y, radius }
// Arrow: { points: [x1,y1,x2,y2] }
// Text: { x, y, text, fontSize? }
// 所有 shape 都有: id, type, userId, color, strokeWidth, createdAt, locked?
```

## 画布 Layer 层级

1. Grid Layer — 背景（预留）
2. Shape Layer — 已确认的图形
3. Preview Layer — 绘制中的临时预览
4. Cursor Layer — 远程用户光标
5. Selection Layer — Transformer 选中框

## 关键设计决策

- **同步策略**: 广播式 LWW（非 CRDT），服务器只存储转发
- **撤销**: undoOwn（按 userId 逆序查找，只撤销自己的图形）
- **橡皮擦**: 单击→删除图形（需所有权）；长按扫过→线段-圆裁剪（仅画笔）
- **持久化**: JSON 文件，最后一个用户离开时原子写入，新用户进入时加载
- **断线重连**: 指数退避 1s→2s→…→30s，最多 10 次

## 已知局限

1. 几何图形（矩形/圆/箭头）不支持橡皮擦部分擦除，仅点击整体删除
2. LWW 冲突：多人同时编辑同一图形可能丢更新
3. 无操作历史面板 UI
4. 文字编辑框位置不跟随缩放/平移实时更新
