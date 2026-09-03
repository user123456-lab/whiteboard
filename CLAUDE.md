# CLAUDE.md — Online Whiteboard 全栈协作白板

## 对话规则

- **强制使用中文进行对话**：所有回复、解释、代码注释均使用中文。

## 项目概述

实时多人协作绘图白板，支持 12+ 种图形、13 种工具、连接线系统、WebSocket JSON 广播同步和协作房间系统。

## 技术栈

| 层     | 技术                                                |
| ------ | --------------------------------------------------- |
| 前端   | React 18 · TypeScript · Vite · TailwindCSS · Konva.js · Zustand · Lucide React |
| 后端   | FastAPI · WebSocket · Python                        |
| 同步   | WebSocket (JSON 消息广播)                            |
| 持久化 | MySQL（SQLAlchemy 异步 + aiomysql）                  |

## 关键路径

- 项目根目录：本仓库根目录（仓库克隆到哪就在哪，不依赖固定盘符）
- 前端源码：`frontend/src/`
- 后端源码：`backend/`

## 常用命令

```bash
# 前端开发服务器 (端口 3000)
cd frontend && npm run dev

# 前端类型检查
cd frontend && npx tsc --noEmit

# 前端生产构建
cd frontend && npm run build

# 后端开发服务器 (端口 8000)
cd backend && python run.py

# E2E 测试（需先后端启动）
cd backend && python test_e2e.py

# 安装依赖
cd frontend && npm install
cd backend && pip install -r requirements.txt
```

## 项目结构

```
whiteboard/
├── frontend/
│   ├── src/
│   │   ├── types/index.ts             # 类型定义 (12+ Shape + 13 Tool + WS协议)
│   │   ├── store/useCanvasStore.ts    # Zustand 全局状态（shapes, users, tools, cursors）
│   │   ├── services/
│   │   │   ├── websocket.ts           # WebSocket 客户端（连接、重连、消息路由）
│   │   │   └── network.ts            # REST 网络信息获取（/api/network）
│   │   ├── managers/ToolManager.ts    # 事件路由 + 键盘快捷键 + 连接线拖拽锚点
│   │   ├── tools/
│   │   │   ├── BrushTool.ts           # 手绘自由线条
│   │   │   ├── RectangleTool.ts      # 矩形
│   │   │   ├── RoundedRectTool.ts    # 圆角矩形
│   │   │   ├── DiamondTool.ts        # 菱形
│   │   │   ├── ParallelogramTool.ts  # 平行四边形
│   │   │   ├── CylinderTool.ts       # 圆柱体
│   │   │   ├── DocumentTool.ts       # 文档图形
│   │   │   ├── CircleTool.ts         # 圆形
│   │   │   ├── ArrowTool.ts          # 箭头
│   │   │   ├── TextTool.ts           # 文字（点击创建 + 双击编辑）
│   │   │   ├── ConnectorTool.ts      # 连接线（浮动锚点拖拽 + 端到端吸附 + 自动跟随）
│   │   │   ├── SelectTool.ts         # 选中/拖拽/Transformer resize/多选
│   │   │   └── EraserTool.ts         # 橡皮擦（单击删除 + 长按扫过精确裁剪）
│   │   └── components/
│   │       ├── WhiteboardCanvas.tsx   # 主画布 (Stage + 多 Layer + 浮动锚点渲染)
│   │       ├── Toolbar.tsx            # 工具栏（13工具切换、颜色、线宽、字号、填充、缩放、撤销/重做）
│   │       ├── CursorOverlay.tsx      # 远程光标叠加层
│   │       ├── RoomPanel.tsx          # 房间面板（创建/加入/离开/复制链接）
│   │       ├── UserList.tsx           # 在线用户列表
│   │       ├── PropertiesPanel.tsx    # 属性面板（描边/填充/线宽/字号/位置/尺寸/锁定/删除）
│   │       └── HistoryPanel.tsx       # 操作历史面板（200条上限）
│   └── [config files]
├── backend/
│   ├── main.py                        # FastAPI + WebSocket 路由（含 batch_update 支持）
│   ├── database.py                    # MySQL 连接池/建表/数据转换（SQLAlchemy 异步）
│   ├── room_manager.py                # 房间管理（Room, RoomManager, 乐观锁）
│   ├── run.py                         # uvicorn 启动入口
│   └── test_e2e.py                    # E2E 协议测试（7项）
├── .env / .env.production             # 后端配置（端口 + MySQL 连接串）
├── docs/
│   └── superpowers/specs/             # 设计规格文档
├── README.md
└── online-whiteboard-design-doc.md    # 详细设计文档（v1.0，部分内容过时）
```

## 架构

```
Browser (React)
  ┌──────────┐   ┌───────────────┐   ┌────────────┐
  │  Konva   │   │ Zustand Store │   │ Yjs Y.Doc  │
  │  Canvas  │   │ (shapes,tools,│   │ (CRDT sync)│
  │ (6 Layer)│   │  users,cursors│   │ UndoManager│
  └──────────┘   └───────┬───────┘   └─────┬──────┘
                         │                  │
                ┌────────▼────────┐         │
                │  WebSocket Cli  │◄────────┘
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

## Shape 类型（14种）

```typescript
type ShapeType = 'brush' | 'rectangle' | 'roundedRect' | 'diamond' | 'parallelogram'
  | 'cylinder' | 'document' | 'circle' | 'arrow' | 'text' | 'image' | 'connector';

// 所有 shape: id, type, userId, color, strokeWidth, createdAt, version?, locked?, fill?, groupId?
// Brush: { points: number[] }
// Rectangle/RoundedRect/Diamond/Parallelogram/Cylinder/Document: { x, y, width, height } + 特有属性
// Circle: { x, y, radius }
// Arrow: { points: [x1,y1,x2,y2] }
// Text: { x, y, text, fontSize? }
// Connector: { fromShapeId, toShapeId, fromEdge, toEdge, endArrow? }
// Image: { x, y, width, height, imageData }
```

## Tool 类型（13种）

| 工具 | 快捷键 | 说明 |
|------|--------|------|
| Select | V | 选中/拖拽/多选/Transformer resize |
| Brush | B | 手绘自由线条 |
| Rectangle | R | 矩形 |
| RoundedRect | Q | 圆角矩形 |
| Diamond | D | 菱形 |
| Parallelogram | P | 平行四边形 |
| Cylinder | Y | 圆柱体 |
| Document | F | 文档图形 |
| Circle | C | 圆形 |
| Arrow | A | 箭头 |
| Text | T | 文字 |
| Connector | X | 连接线（浮动锚点拖拽） |
| Eraser | E | 橡皮擦（单击删除+长按裁剪） |

## WebSocket 协议

所有消息 JSON 格式：`{type, userId, timestamp, payload}`

| 类型                 | 方向       | 说明                     |
| -------------------- | ---------- | ------------------------ |
| `shape_created`      | C→S→All    | 新图形                   |
| `shape_updated`      | C→S→All    | 图形修改（支持乐观锁）   |
| `shape_updated_batch`| C→S→All    | 批量图形更新（编组移动等）|
| `shape_deleted`      | C→S→All    | 图形删除                 |
| `shape_conflict`     | S→C        | 乐观锁冲突通知           |
| `cursor_move`        | C→S→Others | 光标位置（100ms节流）    |
| `user_joined`        | S→All      | 用户加入                 |
| `user_left`          | S→All      | 用户离开                 |
| `room_state`         | S→C        | 新用户全量同步           |
| `ping`/`pong`        | C↔S        | 心跳（30s间隔）          |

## 画布 Layer 层级（6层）

1. Grid Layer — 背景（dot/line/none）
2. Connector Layer — 连接线（单独层以确保渲染顺序）
3. Shape Layer — 已确认的图形
4. Preview Layer — 绘制中的临时预览
5. Anchor Layer — 浮动锚点（hover 图形时显示）
6. Cursor Layer — 远程用户光标 + Transformer 选中框

## 核心功能

- **连接线系统**: 浮动锚点（hover 图形时显示4个边缘中点）+ 端点吸附 + 拖拽创建 + 图形移动/resize时自动跟随
- **橡皮擦**: 单击删除（需所有权）+ 长按扫过精确裁剪（画笔线段-圆求交 + 几何图形轮廓分解 + 多边形碰撞检测）
- **流程图形**: draw.io 风格 6 种核心形状，支持 fill/stroke/Transformer resize/属性面板编辑
- **圆柱体精确橡皮擦**: 椭圆弧轮廓分解为 48 段
- **菱形/平行四边形精确碰撞**: 凸多边形-圆碰撞检测（叉积+边距离）
- **Resize 比例缩放**: skew/cornerRadius/foldSize 随宽高同比缩放
- **实时同步**: WebSocket JSON 消息广播（乐观更新 + LWW 最后写入获胜）
- **多选**: Shift+点击 + 多拖拽 + 多节点Transformer + 批量删除/锁定
- **编组**: Ctrl+G编组 / Ctrl+Shift+G解组 + 广播 shape_updated_batch
- **对齐分布**: 6向对齐（左/中/右 + 上/中/下）
- **图层排序**: [/]上移/下移 + Ctrl+[/]置顶/置底
- **属性面板**: 选中图形后右侧面板编辑描边/填充/线宽/字号/位置/尺寸/锁定/删除
- **操作历史**: HistoryPanel + 200条上限
- **PNG导出**: 工具栏按钮 + 2x像素比
- **主题个性化**: 2种主题 + 8种画布背景色
- **房间系统**: 6位码创建/加入 + 复制链接 + 在线用户列表
- **远程光标**: 彩色光标 + 名称标签，100ms节流
- **画布**: Ctrl+滚轮缩放（以光标为中心）+ 中键平移 + 网格/点阵背景
- **数据持久化**: MySQL 数据库实时落库 + 断线重连指数退避
- **复制粘贴**: Ctrl+C/V + 20px偏移

## 关键设计决策

- **同步策略**: 广播式同步（服务器存储转发，乐观更新 + LWW），WebSocket 传输 JSON
- **撤销**: undoOwn/redoOwn（仅撤销自己创建的图形，保留 z-order）
- **橡皮擦**: 单击→删除图形（需所有权）；长按扫过→线段-圆裁剪（画笔），轮廓分解（几何图形）
- **持久化**: MySQL 数据库，图形创建/更新/删除时实时落库，房间状态从库中恢复
- **断线重连**: 指数退避 1s→2s→…→30s，最多 10 次
- **乐观锁**: server 端 version 字段 + shape_conflict 通知

## 已知局限

1. undoOwn 只回退自己创建的图形（协作时不会误删他人图形，但无法撤销他人操作）
2. groupShapes 广播 N 个独立 shape_updated（非原子批量），但通过 shape_updated_batch 改善
3. 光标消息仅携带 {x,y}（userName/color 依赖顶层字段）
4. roundedRect 橡皮擦用矩形边框（非圆角精确轮廓），精度损失小
5. 工具栏13个工具在低分辨率屏幕上需滚动查看
6. 文字编辑框位置不跟随缩放/平移实时更新
