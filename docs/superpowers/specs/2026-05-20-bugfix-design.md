# 白板项目 v1.8 已知问题修复设计文档

**日期：** 2026-05-20
**版本范围：** v1.8 (commit `aa6701f`) → v1.9
**目标：** 修复 6 个已知问题，打磨现有功能至稳定状态

---

## 概述

白板项目 v1.8 功能已较完整，但存在 6 个影响用户体验和协作一致性的已知问题。本次不新增功能，全部精力投入修复。

## 修复概览

| # | 问题 | 复杂度 | 改文件数 | 协议变更 |
|---|------|--------|----------|----------|
| 1 | 光标缺 userName/color | 低 | 1 | 无 |
| 2 | 画笔/箭头 resize 偏移 | 低 | 1 | 无 |
| 3 | UndoManager 分叉 | 中 | 1 | 无 |
| 4 | 编组广播非原子 | 中 | 2 | 新增 `shape_updated_batch` |
| 5 | 文字编辑框滞后 | 低 | 1 | 无 |
| 6 | 几何图形部分擦除 | 高 | 1 | 无 |

**推荐修复顺序：** 1 → 5 → 2 → 3 → 4 → 6

---

## 修复 1：光标消息补全 userName/color

### 问题

`ToolManager.ts` 发送 `cursor_move` 时 payload 仅含 `{x, y}`，但 `CursorPosition` 类型要求含 `userName` 和 `color`。远端光标渲染时用户名标签为空、颜色为 undefined。

### 方案

**不在发送端修改**（避免增大每条光标消息的负载），**在接收端补全**。`websocket.ts` 收到 `cursor_move` 时，用 `msg.userId` 从本地 `store.users` 查找用户信息，拼合为完整的 `CursorPosition`。

### 修改文件

`frontend/src/services/websocket.ts` — `handleMessage` 中 `cursor_move` 分支

```typescript
case 'cursor_move': {
  const pos = msg.payload as { x: number; y: number };
  const user = store.users.find(u => u.userId === msg.userId);
  if (user) {
    store.updateRemoteCursor({
      userId: msg.userId,
      userName: user.userName,
      color: user.color,
      x: pos.x,
      y: pos.y,
    });
  }
  break;
}
```

### 边界处理

- user 不在 users 中（极端时序：cursor_move 先于 user_joined 到达）：静默忽略

### 验证

1. 两个浏览器窗口加入同一房间
2. 移动鼠标，远端应显示带颜色和用户名标签的光标
3. 控制台无报错

---

## 修复 2：画笔/箭头 resize 坐标系偏移

### 问题

`WhiteboardCanvas.tsx` `onTransformEnd` 对 brush/arrow 的点缩放时使用 `minX + (p - minX) * scaleX`（相对原始包围盒原点），忽略了 Transformer resize 过程中 `node.x()`/`node.y()` 产生的偏移。导致缩放后点的实际渲染位置与视觉位置存在偏差。

### 方案

用点的实际渲染位置 `node.x() + p * scaleX` 作为新点坐标。这等于将 Line 节点变换到 `x=0, y=0, scaleX=1, scaleY=1` 状态后的正确绝对坐标。

### 修改文件

`frontend/src/components/WhiteboardCanvas.tsx` — `onTransformEnd` 中 brush/arrow 分支

```typescript
} else if ((shape.type === 'brush' || shape.type === 'arrow') && 'points' in shape) {
  const pts = [...(shape as Shape & { points: number[] }).points];
  const nx = node.x();
  const ny = node.y();
  const sx = Math.abs(scaleX);
  const sy = Math.abs(scaleY);
  const scaledPts = pts.map((p, i) =>
    (i % 2 === 0) ? nx + p * sx : ny + p * sy
  );
  store.updateShape(shapeId, { points: scaledPts } as Partial<Shape>);
}
```

### 补充说明

React-Konva 的 Line 组件默认 `x=0, y=0`，下一次 render 自动重置，node.x(0)/node.y(0) 无需显式调用。

### 验证

1. 画画笔线条，选中后拖动四角控制点缩放
2. 取消选中 → 再次选中，Transformer 包围盒应与线条完全贴合
3. 对箭头重复验证

---

## 修复 3：UndoManager 仅跟踪本地变更

### 问题

Y.UndoManager 默认跟踪所有 Y.Doc 变更（含远程 apply）。用户 A 的 Ctrl+Z 可能撤销用户 B 的操作，导致各自 undo 栈分叉。

### 方案

使用 `trackedOrigins` 限制 UndoManager 只捕获本地操作。新增 `LOCAL_ORIGIN` symbol，所有本地 mutation 的事务传入此 origin。远程 apply 不传 origin，不会被记录。undo/redo 事务用 `UNDO_ORIGIN`（不在 trackedOrigins 中），避免 undo 循环入栈。

### 修改文件

`frontend/src/services/yjsSync.ts`

**(a) 新增常量（类顶部）**

```typescript
const LOCAL_ORIGIN = Symbol('local-origin');
const UNDO_ORIGIN = Symbol('undo-origin');
```

**(b) UndoManager 构造**

```typescript
this.undoManager = new Y.UndoManager(this.shapes, {
  captureTimeout: 400,
  trackedOrigins: new Set([LOCAL_ORIGIN]),
});
```

**(c) 修改所有本地 mutation 方法**：`addShape`、`updateShape`、`deleteShape`、`moveShapeInternal`、`batchApply`、`groupShapes`、`ungroupShapes` 中 `doc.transact(() => {...}, LOCAL_ORIGIN)`

**(d) undo/redo 方法**

```typescript
undo(): void {
  if (this.undoManager.undoStack.length === 0) return;
  this.doc.transact(() => { this.undoManager.undo(); }, UNDO_ORIGIN);
}

redo(): void {
  if (this.undoManager.redoStack.length === 0) return;
  this.doc.transact(() => { this.undoManager.redo(); }, UNDO_ORIGIN);
}
```

### 验证

1. 用户 A 画线，用户 B 画矩形
2. 用户 A Ctrl+Z：仅撤销 A 的线，B 的矩形不受影响
3. 用户 A Ctrl+Shift+Z：线恢复
4. 双方画布状态保持一致（undo/redo 操作仍通过 broadcastDiff 同步）

---

## 修复 4：编组广播原子性

### 问题

`groupShapes`/`ungroupShapes` 批量设置 `groupId` 后，`broadcastDiff` 对每个变化的 shape 单独发送 `shape_updated`，N 条消息逐条发出。网络不稳时可能部分到达。

### 方案

新增 `shape_updated_batch` 消息类型，在 `broadcastDiff` 中：单条变更走原有 `shape_updated`，多条变更合并为一条 `shape_updated_batch`。后端透明转发，无需修改。

### 修改文件

**(a)** `frontend/src/services/yjsSync.ts` — `broadcastDiff` 方法：收集所有更新，≥2 条时发送 `shape_updated_batch`

**(b)** `frontend/src/services/websocket.ts` — `handleMessage` 新增分支：

```typescript
case 'shape_updated_batch': {
  const { updates } = msg.payload as {
    updates: Array<{ shapeId: string; changes: Record<string, unknown> }>
  };
  for (const u of updates) store.remoteUpdateShape(u.shapeId, u.changes);
  break;
}
```

### 向后兼容

- 后端不感知消息内容，透明转发，无需修改
- 单个 shape 变更仍走 `shape_updated`，兼容旧逻辑

### 验证

1. 选中 3+ 个 shape，Ctrl+G 编组
2. DevTools Network 面板检查 WebSocket 消息：仅有 1 条 `shape_updated_batch`
3. 远端检查所有 groupId 一致
4. 用 Network Throttling 模拟弱网，确认不丢变更

---

## 修复 5：文字编辑框跟随缩放/平移

### 问题

`TextEditor.tsx` 用 `useMemo` + `getAbsoluteTransform().point()` 计算编辑框绝对位置。React render 阶段可能在 Konva batchDraw 之前执行，导致 `getAbsoluteTransform()` 返回上一帧的变换矩阵，编辑框滞后一帧。

### 方案

将 `useMemo` 改为 `useState` + `useLayoutEffect` + `requestAnimationFrame`。`useLayoutEffect` 在 DOM 更新后同步执行一次，`rAF` 确保 Konva 已更新内部状态后再执行第二次。

### 修改文件

`frontend/src/components/TextEditor.tsx`

```typescript
const [absPos, setAbsPos] = useState({ x: shape.x, y: shape.y });

useLayoutEffect(() => {
  const update = () => {
    if (stage) {
      setAbsPos(stage.getAbsoluteTransform().point({ x: shape.x, y: shape.y }));
    }
  };
  update();
  const raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
}, [stageScale, stageX, stageY, shape.x, shape.y, stage]);
```

### 验证

1. 双击文字进入编辑态
2. Ctrl+滚轮缩放，编辑框应实时跟随无滞后
3. 中键拖拽平移，编辑框跟随
4. 文字可正常输入和保存

---

## 修复 6：几何图形橡皮擦部分擦除

### 问题

`EraserTool.ts` 对几何图形（矩形/圆/箭头）只做整体相交检测，命中即整删。无法像画笔那样部分擦除。

### 方案

将矩形/圆/箭头的轮廓分解为线段，复用已有的 `clipSegmentToCircle` 做精确裁剪。未被擦除的剩余部分转换为 `BrushShape`。文本保持整删（无实际意义）。

具体策略：
- **矩形**：四边分解为 4 条线段
- **圆形**：48 段线段近似
- **箭头**：单条线段（箭头主体）
- **文本**：保持整体删除

### 修改文件

`frontend/src/tools/EraserTool.ts`

新增方法：
- `clipSegmentsToRemainingFragments()` — 收集被裁剪后的剩余片段
- `approximateCircleSegments()` — 用 N 段线段近似圆形轮廓

修改 `sweepErase` 中几何图形分支：
1. 分解轮廓为线段 → `clipSegmentToCircle` 裁剪 → 拼接剩余片段
2. 若 `remainingPoints.length > 0`：创建新 brush shape（stroke 颜色保留，fill 丢失）
3. 删除原几何图形

### 边界处理

- 全部擦除时只删不创建
- `excludeIds` 跨帧去重
- fill 转为 brush 后丢失（brush 不支持 fill）

### 性能

圆 48 段近似 + sweep 中每帧每 shape 最多一次裁剪，60fps 下无性能问题。

### 验证

1. 画矩形，橡皮扫过一角 → 矩形被替换为轮廓弧线 brush，扫过部分消失
2. 画圆，扫过一侧 → 剩余弧线保留
3. 画箭头，扫过中间 → 两端分离为两条 brush
4. 文本仍为整删
5. 连续两次 sweep 同一几何图形，第二次也能正确裁剪

---

## 总体验证

修复完成后执行：

```bash
# 前端类型检查
cd frontend && npx tsc --noEmit

# 后端 E2E 测试
cd backend && python test_e2e.py
```

手动验证矩阵：

| 场景 | 操作 | 预期 |
|------|------|------|
| 双人协作 | A 移动鼠标 | B 看到带颜色的用户名光标 |
| 缩放 | Ctrl+滚轮 | 所有图形包含文字编辑框跟随 |
| 画笔 resize | 选中+拖拽手柄 | 缩放后 Transformer 贴合 |
| 多人 undo | A 画线，B 画矩形 | 各撤销各的，不相干扰 |
| 编组同步 | A 选 3 个 Ctrl+G | B 看到原子编组结果 |
| 几何擦除 | 扫过矩形/圆/箭头 | 部分擦除为 brush |

---

## 不涉及的范围

- 不新增功能
- 不重构现有架构
- 不引入新的依赖
- 不修改数据库/持久化格式
