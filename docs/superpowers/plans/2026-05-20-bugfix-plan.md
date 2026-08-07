# 白板项目 6 个已知问题修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修复 v1.8 中 6 个已知问题，不新增功能，打磨至稳定。

**Architecture:** 每个修复独立修改 1-2 个文件，按复杂度递增顺序执行（低→中→高）。前 3 个修复互不重叠可并行，后 3 个涉及核心同步模块需顺序执行。

**Tech Stack:** React 18 + TypeScript + Konva.js + Zustand + Yjs (前端), FastAPI + WebSocket + Python (后端，仅修复 4 透明转发无需修改)

---

## 文件修改矩阵

| 文件 | 修复 1 | 修复 2 | 修复 3 | 修复 4 | 修复 5 | 修复 6 |
|------|--------|--------|--------|--------|--------|--------|
| `frontend/src/services/websocket.ts` | ✏️ | | | ✏️ | | |
| `frontend/src/components/TextEditor.tsx` | | | | | ✏️ | |
| `frontend/src/components/WhiteboardCanvas.tsx` | | ✏️ | | | | |
| `frontend/src/services/yjsSync.ts` | | | ✏️ | ✏️ | | |
| `frontend/src/tools/EraserTool.ts` | | | | | | ✏️ |

**无共享文件冲突的并行组：** 修复 1 + 修复 5 + 修复 2 可并行执行。修复 3/4 共享 yjsSync.ts，需顺序执行。修复 6 独立。

---

### Task 1: 修复光标消息缺 userName/color

**Files:**
- Modify: `frontend/src/services/websocket.ts:107-109`

- [ ] **Step 1: 修改 handleMessage 中 cursor_move 分支**

将第 107-109 行：
```typescript
    case 'cursor_move':
      store.updateRemoteCursor(msg.payload as never);
      break;
```

替换为：
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

- [ ] **Step 2: 类型检查**

```bash
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit
```
预期：无新增类型错误。

- [ ] **Step 3: 验证**

1. `cd frontend && npm run dev` 启动前端
2. `cd backend && python run.py` 启动后端
3. 两个浏览器窗口打开 `http://localhost:3000`，加入同一房间
4. 移动鼠标，确认远端能看到带颜色和用户名的光标

---

### Task 2: 修复文字编辑框不跟随缩放/平移

**Files:**
- Modify: `frontend/src/components/TextEditor.tsx:1-26`

- [ ] **Step 1: 将 useMemo 改为 useState + useLayoutEffect**

在文件顶部添加 `useState, useLayoutEffect` 导入，将第 1 行：
```typescript
import { useRef, useEffect, useMemo, useCallback } from 'react';
```

改为：
```typescript
import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
```

- [ ] **Step 2: 替换 absPos 计算逻辑**

将第 23-26 行：
```typescript
  // Recalculate absolute position whenever scale or position changes
  const absPos = useMemo(() => {
    return stage.getAbsoluteTransform().point({ x: shape.x, y: shape.y });
  }, [stageScale, stageX, stageY, shape.x, shape.y, stage]);
```

替换为：
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

- [ ] **Step 3: 类型检查**

```bash
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit
```
预期：无新增类型错误。

- [ ] **Step 4: 验证**

1. 创建文字，双击进入编辑态
2. Ctrl+滚轮缩放，确认编辑框实时跟随
3. 中键拖拽平移，确认编辑框跟随
4. 输入文字，Enter 保存，确认正常

---

### Task 3: 修复画笔/箭头 resize 坐标系偏移

**Files:**
- Modify: `frontend/src/components/WhiteboardCanvas.tsx:596-609`

- [ ] **Step 1: 修改 onTransformEnd 中 brush/arrow 缩放逻辑**

将第 596-609 行：
```typescript
              } else if ((shape.type === 'brush' || shape.type === 'arrow') && 'points' in shape) {
                // Scale all points relative to bounding box origin
                const pts = [...(shape as Shape & { points: number[] }).points];
                let minX = Infinity, minY = Infinity;
                for (let i = 0; i < pts.length; i += 2) {
                  minX = Math.min(minX, pts[i]);
                  minY = Math.min(minY, pts[i + 1]);
                }
                const scaledPts = pts.map((p, i) =>
                  (i % 2 === 0)
                    ? minX + (p - minX) * Math.abs(scaleX)
                    : minY + (p - minY) * Math.abs(scaleY)
                );
                store.updateShape(shapeId, { points: scaledPts } as Partial<Shape>);
              }
```

替换为：
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

- [ ] **Step 2: 类型检查**

```bash
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit
```
预期：无新增类型错误。

- [ ] **Step 3: 验证**

1. 画画笔线条，选中后拖动 Transform 四角控制点缩放
2. 取消选中 → 再次选中，确认 Transformer 包围盒与线条完全贴合
3. 对箭头重复验证
4. 混合多种图形，确认其他类型不受影响

---

### Task 4: 修复 UndoManager 仅跟踪本地变更

**Files:**
- Modify: `frontend/src/services/yjsSync.ts`

此任务改动点分布在 yjsSync.ts 多个位置，按以下顺序修改：

- [ ] **Step 1: 新增 origin 常量（第 4 行之后插入）**

在 `let transportSend: SendFn | null = null;` 之前插入：
```typescript
const LOCAL_ORIGIN = Symbol('local-origin');
const UNDO_ORIGIN = Symbol('undo-origin');
```

- [ ] **Step 2: 修改 UndoManager 构造函数（第 66 行）**

将：
```typescript
    this.undoManager = new Y.UndoManager(this.shapes, { captureTimeout: 400 });
```

改为：
```typescript
    this.undoManager = new Y.UndoManager(this.shapes, {
      captureTimeout: 400,
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
```

- [ ] **Step 3: 修改 addShape — doc.transact 加 LOCAL_ORIGIN（第 104 行）**

将：
```typescript
    this.doc.transact(() => {
      this.shapes.push([shapeToMap(shape)]);
    });
```

改为：
```typescript
    this.doc.transact(() => {
      this.shapes.push([shapeToMap(shape)]);
    }, LOCAL_ORIGIN);
```

- [ ] **Step 4: 修改 updateShape — doc.transact 加 LOCAL_ORIGIN（第 113 行）**

将：
```typescript
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(changes)) {
```

改为：
```typescript
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(changes)) {
```

在同一个 `doc.transact()` 调用的第二个参数位置加 `LOCAL_ORIGIN`：
```typescript
    this.doc.transact(() => {
      // ... 内部代码不变
    }, LOCAL_ORIGIN);
```

- [ ] **Step 5: 修改 deleteShape — doc.transact 加 LOCAL_ORIGIN（第 130 行）**

将：
```typescript
    this.doc.transact(() => {
      this.shapes.delete(idx, 1);
    });
```

改为：
```typescript
    this.doc.transact(() => {
      this.shapes.delete(idx, 1);
    }, LOCAL_ORIGIN);
```

- [ ] **Step 6: 修改 moveShapeInternal — doc.transact 加 LOCAL_ORIGIN（第 172 行）**

将：
```typescript
    this.doc.transact(() => {
      const map = this.shapes.get(idx);
      this.shapes.delete(idx, 1);
      this.shapes.insert(Math.min(newIndex, this.shapes.length), [map]);
    });
```

改为：
```typescript
    this.doc.transact(() => {
      const map = this.shapes.get(idx);
      this.shapes.delete(idx, 1);
      this.shapes.insert(Math.min(newIndex, this.shapes.length), [map]);
    }, LOCAL_ORIGIN);
```

- [ ] **Step 7: 修改 batchApply — doc.transact 加 LOCAL_ORIGIN（第 186 行）**

将第 186 行的 `this.doc.transact(() => {` 对应的结束括号 `});` 改为 `}, LOCAL_ORIGIN);`

- [ ] **Step 8: 修改 groupShapes — doc.transact 加 LOCAL_ORIGIN（第 274 行）**

将第 274 行的 `this.doc.transact(() => {` 对应的结束括号 `});` 改为 `}, LOCAL_ORIGIN);`

- [ ] **Step 9: 修改 ungroupShapes — doc.transact 加 LOCAL_ORIGIN（第 287 行）**

将第 287 行的 `this.doc.transact(() => {` 对应的结束括号 `});` 改为 `}, LOCAL_ORIGIN);`

- [ ] **Step 10: 修改 undo 方法（第 258-262 行）**

将：
```typescript
  undo(): void {
    if (this.undoManager.undoStack.length === 0) return;
    this.undoManager.undo();
    // observer fires automatically, suppressBroadcast is false → auto-broadcasts
  }

  redo(): void {
    if (this.undoManager.redoStack.length === 0) return;
    this.undoManager.redo();
  }
```

改为：
```typescript
  undo(): void {
    if (this.undoManager.undoStack.length === 0) return;
    this.doc.transact(() => {
      this.undoManager.undo();
    }, UNDO_ORIGIN);
    // observer fires → auto-broadcasts so remote peers see the undo result
  }

  redo(): void {
    if (this.undoManager.redoStack.length === 0) return;
    this.doc.transact(() => {
      this.undoManager.redo();
    }, UNDO_ORIGIN);
  }
```

- [ ] **Step 11: 类型检查**

```bash
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit
```
预期：无新增类型错误。

- [ ] **Step 12: 验证**

1. 两个浏览器窗口加入同一房间
2. 用户 A 画一条线，用户 B 画一个矩形
3. 用户 A 按 Ctrl+Z：仅撤销 A 的线，B 的矩形不受影响
4. 用户 A 按 Ctrl+Shift+Z：线恢复
5. 验证 undo 后双方画布状态一致

---

### Task 5: 修复编组广播非原子性

**Files:**
- Modify: `frontend/src/services/yjsSync.ts:309-335`（broadcastDiff 方法）
- Modify: `frontend/src/services/websocket.ts:87-133`（handleMessage 新增分支）

- [ ] **Step 1: 修改 broadcastDiff — 收集更新批量发送（yjsSync.ts 第 309-335 行）**

将整个 `broadcastDiff` 方法替换为：
```typescript
  private broadcastDiff(oldShapes: Shape[], newShapes: Shape[]): void {
    const oldIds = new Set(oldShapes.map(s => s.id));
    const newIds = new Set(newShapes.map(s => s.id));

    for (const old of oldShapes) {
      if (!newIds.has(old.id)) {
        broadcast('shape_deleted', { shapeId: old.id });
      }
    }

    for (const s of newShapes) {
      if (!oldIds.has(s.id)) {
        broadcast('shape_created', { shape: s });
      }
    }

    const updates: Array<{ shapeId: string; changes: Record<string, unknown>; expectedVersion: number }> = [];
    for (const s of newShapes) {
      if (!oldIds.has(s.id)) continue;
      const old = oldShapes.find(o => o.id === s.id);
      if (!old) continue;
      const changes = this.diffShape(old, s);
      if (Object.keys(changes).length === 0) continue;
      updates.push({
        shapeId: s.id,
        changes,
        expectedVersion: s.version ?? 1,
      });
    }

    if (updates.length === 1) {
      broadcast('shape_updated', updates[0]);
    } else if (updates.length > 1) {
      broadcast('shape_updated_batch', { updates });
    }
  }
```

- [ ] **Step 2: 在 websocket.ts handleMessage 中新增 shape_updated_batch 分支**

在 `case 'shape_updated':` 分支之后插入：
```typescript
    case 'shape_updated_batch': {
      const { updates } = msg.payload as {
        updates: Array<{ shapeId: string; changes: Record<string, unknown> }>
      };
      for (const u of updates) {
        store.remoteUpdateShape(u.shapeId, u.changes);
      }
      break;
    }
```

- [ ] **Step 3: 类型检查**

```bash
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit
```
预期：无新增类型错误。

- [ ] **Step 4: 验证**

1. 选中 3+ 个 shape，Ctrl+G 编组
2. 打开 DevTools Network 面板，筛选 WS，确认只发送 1 条 `shape_updated_batch`
3. 远端确认所有 shape 的 groupId 一致
4. 单独修改一个 shape 属性（颜色），确认仍发 `shape_updated` 单条

---

### Task 6: 修复几何图形橡皮擦部分擦除

**Files:**
- Modify: `frontend/src/tools/EraserTool.ts`

- [ ] **Step 1: 修改 sweepErase 中几何图形处理分支（第 100-108 行）**

将第 100-108 行：
```typescript
        } else {
          // Geometric shapes (rectangle, circle, arrow, text): cross-mousemove dedup
          if (excludeIds.has(shape.id)) continue;

          if (this.shapeIntersectsCircle(shape, center.x, center.y, eraserRadius)) {
            excludeIds.add(shape.id);
            result.shapesToDelete.push(shape.id);
          }
        }
```

替换为：
```typescript
        } else if (shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'arrow' || shape.type === 'text') {
          if (excludeIds.has(shape.id)) continue;

          if (!this.shapeIntersectsCircle(shape, center.x, center.y, eraserRadius)) continue;
          excludeIds.add(shape.id);

          if (shape.type === 'text') {
            result.shapesToDelete.push(shape.id);
            continue;
          }

          // Decompose geometric outline into line segments, clip, convert remainder to brush
          const segments: Array<[number, number, number, number]> = [];
          if (shape.type === 'rectangle') {
            const r = shape;
            segments.push(
              [r.x, r.y, r.x + r.width, r.y],
              [r.x + r.width, r.y, r.x + r.width, r.y + r.height],
              [r.x + r.width, r.y + r.height, r.x, r.y + r.height],
              [r.x, r.y + r.height, r.x, r.y],
            );
          } else if (shape.type === 'circle') {
            const c = shape;
            const N = 48;
            for (let i = 0; i < N; i++) {
              const a1 = (2 * Math.PI * i) / N;
              const a2 = (2 * Math.PI * (i + 1)) / N;
              segments.push([
                c.x + c.radius * Math.cos(a1), c.y + c.radius * Math.sin(a1),
                c.x + c.radius * Math.cos(a2), c.y + c.radius * Math.sin(a2),
              ]);
            }
          } else if (shape.type === 'arrow') {
            const a = shape;
            segments.push([a.points[0], a.points[1], a.points[2], a.points[3]]);
          }

          const remainingPoints = this.clipSegmentsToFragments(segments, center, eraserRadius);
          if (remainingPoints.length >= 4) {
            const { id, userId, ...rest } = shape as Record<string, unknown>;
            result.shapesToCreate.push({
              id: crypto.randomUUID(),
              type: 'brush',
              userId: userId as string,
              color: rest.color as string,
              strokeWidth: rest.strokeWidth as number,
              points: remainingPoints,
              createdAt: Date.now(),
              version: 1,
              ...(rest.groupId ? { groupId: rest.groupId as string } : {}),
            } as BrushShape);
          }
          result.shapesToDelete.push(shape.id);
        }
```

- [ ] **Step 2: 新增 clipSegmentsToFragments 辅助方法（在 canErase 方法之前）**

在第 313 行 `canErase` 之前插入：
```typescript
  /** Clip multiple segments against a circle, join remaining outside portions into a single point array */
  private clipSegmentsToFragments(
    segments: Array<[number, number, number, number]>,
    center: { x: number; y: number },
    radius: number
  ): number[] {
    const allPoints: number[] = [];
    for (const [x1, y1, x2, y2] of segments) {
      const clipped = this.clipSegmentToCircle(x1, y1, x2, y2, center.x, center.y, radius);
      for (const portion of clipped.portions) {
        if (allPoints.length === 0) {
          allPoints.push(...portion);
        } else {
          const lastX = allPoints[allPoints.length - 2];
          const lastY = allPoints[allPoints.length - 1];
          if (Math.abs(lastX - portion[0]) > 1e-6 || Math.abs(lastY - portion[1]) > 1e-6) {
            allPoints.push(...portion);
          } else {
            allPoints.push(...portion.slice(2));
          }
        }
      }
    }
    return allPoints;
  }
```

- [ ] **Step 3: 类型检查**

```bash
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit
```
预期：无新增类型错误。

- [ ] **Step 4: 验证**

1. 画矩形，橡皮擦扫过一角 → 矩形被替换为轮廓弧线，扫过部分消失
2. 画圆形，扫过一侧 → 剩余弧线保留
3. 画箭头，扫过中间 → 两端分离为 brush
4. 文本仍为整删行为
5. 连续两次 sweep 同一几何图形，第二次也正确裁剪
6. 橡皮擦对不同用户的图形和锁定图形行为不变

---

## 总体验证

```bash
# 前端类型检查
cd D:/Projects/whiteboard/frontend && npx tsc --noEmit

# 后端 E2E 测试
cd D:/Projects/whiteboard/backend && python test_e2e.py
```

---

## 执行策略

**方案 A（推荐 — 并行 agent）：**
1. 修复 1、5、2 无文件冲突，可用 3 个 dev agent 并行开发
2. 修复 3 顺序执行（修改 yjsSync.ts 多处）
3. 修复 4 在修复 3 之后执行（共享 yjsSync.ts）
4. 修复 6 可与修复 4 并行（独立文件）
5. 全部完成后 2+ review agent 并行审查

**方案 B（顺序执行）：**
按 1 → 5 → 2 → 3 → 4 → 6 逐一执行，每步验证后继续。

选择方案 A 可大幅缩短总时间。
