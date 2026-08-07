# Connector System Design

**Date:** 2026-05-21
**Status:** Implemented
**Project:** Online Whiteboard v2.0 — 连接线系统

## 目标

实现图形间连接线，端点吸附到图形边缘，拖拽图形时连接线自动跟随。

## 设计决策

- **连接模型**: 端点坐标 + 形状引用（A 方案）
- **走线方式**: 直线（A 方案 MVP）
- **创建交互**: 浮动锚点（A 方案）

## ConnectorShape 类型

```typescript
interface ConnectorShape extends BaseShape {
  type: 'connector';
  fromShapeId: string;
  toShapeId: string;
  fromEdge: 'top' | 'right' | 'bottom' | 'left';
  toEdge: 'top' | 'right' | 'bottom' | 'left';
  fromX: number;   // 派生值，由 fromShapeId + fromEdge 计算
  fromY: number;
  toX: number;     // 派生值，由 toShapeId + toEdge 计算
  toY: number;
  endArrow?: boolean;  // 默认 true
}
```

`fromX/fromY/toX/toY` 是派生坐标，形状移动或 resize 时由 connected shapes 重新计算。不通过 CRDT 同步（只同步 fromShapeId/fromEdge/toShapeId/toEdge）。

## 工具类: ConnectorTool

- `onMouseDown`: 光标悬停在图形锚点时开始拖拽
- `onMouseMove`: 画虚线预览直线
- `onMouseUp`: 释放到目标图形锚点时创建 ConnectorShape，否则取消
- `cancel`: 清理预览

## 浮动锚点渲染

WhiteboardCanvas 中为 selected 或 hovered 的 shape 渲染 4 个锚点圆：
- top: (x + w/2, y)
- right: (x + w, y + h/2)
- bottom: (x + w/2, y + h)
- left: (x, y + h/2)

样式：小圆点（r=5），accent color，hover 时高亮（r=7）。

显示条件：activeTool === 'connector' 时，鼠标悬停的图形显示锚点。

## 连接线渲染

Konva `Line` 绘制，from → to，to 端带箭头（用 `Arrow` 或手工绘制三角形）。

## 形状移动时跟随

- `onDragEnd`: 遍历所有 connector 检查 fromShapeId/toShapeId，重新计算端点
- `onTransformEnd`: 同上，resize 后重新计算端点

端点重新计算函数：
```typescript
function getEdgePoint(shape: Shape, edge: string): { x: number; y: number } {
  // 获取形状边缘中点坐标
}
```

## 工具栏

新增 Connector 按钮（lucide `Link2` 图标），快捷键 `X`。

## 橡皮擦

Connector 按线段-圆碰撞检测擦除，与现有 arrow 一致。

## 改动文件

| 类型 | 文件 |
|---|---|
| 扩展 | `types/index.ts` |
| 新增 | `tools/ConnectorTool.ts` |
| 修改 | `tools/index.ts` |
| 修改 | `managers/ToolManager.ts` |
| 修改 | `components/Toolbar.tsx` |
| 修改 | `components/WhiteboardCanvas.tsx` |
| 修改 | `components/PropertiesPanel.tsx` |
| 修改 | `components/HistoryPanel.tsx` |
| 修改 | `tools/EraserTool.ts` |

## 不动文件

backend/、services/websocket.ts、services/yjsSync.ts、services/alignService.ts

## 验证

- `npx tsc --noEmit` 零错误
- 手动：创建连接线 → 拖拽图形验证跟随 → resize 验证跟随 → 橡皮擦删除 → 复制粘贴
