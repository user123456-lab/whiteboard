# Flowchart Shapes Design

**Date:** 2026-05-21
**Status:** Implemented
**Project:** Online Whiteboard v1.9 — 添加流程图形

## 目标

模仿 draw.io 的核心流程图形，添加 5 种新形状：
- 圆角矩形 (roundedRect)
- 菱形 (diamond)
- 平行四边形 (parallelogram)
- 圆柱 (cylinder)
- 文档 (document)

## 方案

方案 A：每个形状独立 Tool 类，完全遵循现有 RectangleTool 模式。最小化更改，不影响现有功能。

## 类型定义

新增 5 个 ShapeType 和对应 interface：

```typescript
// ShapeType 新增
type ShapeType = 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'image'
  | 'roundedRect' | 'diamond' | 'parallelogram' | 'cylinder' | 'document';

// 新增 interface
interface RoundedRectShape extends BaseShape {
  type: 'roundedRect';
  x: number; y: number; width: number; height: number;
  cornerRadius?: number; // 默认 10
}

interface DiamondShape extends BaseShape {
  type: 'diamond';
  x: number; y: number; width: number; height: number;
}

interface ParallelogramShape extends BaseShape {
  type: 'parallelogram';
  x: number; y: number; width: number; height: number;
  skew?: number; // 默认 width * 0.2
}

interface CylinderShape extends BaseShape {
  type: 'cylinder';
  x: number; y: number; width: number; height: number;
}

interface DocumentShape extends BaseShape {
  type: 'document';
  x: number; y: number; width: number; height: number;
  foldSize?: number; // 默认 20
}
```

所有形状继承 BaseShape（id, userId, color, strokeWidth, fill, locked, groupId, version, createdAt）。

## 新增工具文件

```
frontend/src/tools/
├── RoundedRectTool.ts   # 拖拽创建圆角矩形
├── DiamondTool.ts       # 拖拽创建菱形
├── ParallelogramTool.ts # 拖拽创建平行四边形
├── CylinderTool.ts     # 拖拽创建圆柱
└── DocumentTool.ts     # 拖拽创建文档
```

每个工具接口与 RectangleTool 一致：`onMouseDown` / `onMouseMove` / `onMouseUp` / `cancel`。
绘制中预览（dash 虚线）在 Preview Layer 上显示。

## 工具栏

| 形状 | 图标 (lucide-react) | 快捷键 |
|---|---|---|
| Rectangle (existing) | Square | R |
| RoundedRect | RectangleHorizontal | Q |
| Diamond | Diamond | D |
| Parallelogram | BetweenHorizontalStart | P |
| Cylinder | Database | Y |
| Document | FileText | F |

showFill 条件：5 种新形状全部支持 fill，工具栏显示 Fill 颜色选择器。

## 画布渲染

在 `WhiteboardCanvas.tsx` 的 `renderShape` 中新增 5 个 case：

- **roundedRect**: `<Rect cornerRadius={10} ... />`，与 rectangle 仅多 cornerRadius
- **diamond**: `<Line closed points={[cx, top, right, cy, cx, bottom, left, cy]} ... />`
- **parallelogram**: `<Line closed points={[x+skew, y, x+w, y, x+w-skew, y+h, x, y+h]} ... />`
- **cylinder**: `<Shape sceneFunc={customDraw} ... />` 用 canvas 2D API 绘制上下椭圆弧 + 两侧竖线
- **document**: `<Line closed points={折角轮廓} ... />` + 折角折线

每种形状显示 locked 🔒 标记。

## Transformer 支持

onTransformEnd 中，5 种新形状统一走 (x, y, width, height) 分支，与 rectangle 相同：
```typescript
type === 'rectangle' || type === 'image' || type === 'roundedRect' 
  || type === 'diamond' || type === 'parallelogram' 
  || type === 'cylinder' || type === 'document'
```

## 属性面板

- showFill: rectangle/circle/arrow + 5 种新形状
- showPos: 5 种新形状都有 x/y
- showSize: 5 种新形状都有 width/height
- TYPE_ICONS / TYPE_NAMES: 新增 5 条

## 橡皮擦

- 单击删除：走现有包围盒碰撞检测
- 长按扫过：走几何图形相交检测，与矩形/圆一致

## 不动文件（零影响）

- backend/ (main.py, room_manager.py, run.py)
- services/websocket.ts
- services/yjsSync.ts
- services/alignService.ts（自动兼容 x/y/width/height）
- HistoryPanel.tsx（记录 shapeType 字符串）
- SettingsPanel.tsx

## 改动文件汇总

| 文件 | 改动 |
|---|---|
| types/index.ts | 扩展类型 |
| tools/RoundedRectTool.ts 他 5 | 新增 |
| tools/index.ts | 新增导出 |
| managers/ToolManager.ts | 注册+快捷键 |
| components/Toolbar.tsx | 按钮+图标 |
| components/WhiteboardCanvas.tsx | 渲染+transformEnd |
| components/PropertiesPanel.tsx | 属性编辑 |
| tools/EraserTool.ts | 橡皮擦支持 |

## 验证

- `cd frontend && npx tsc --noEmit` 类型检查通过
- 手动：创建→选中→移动→填充→resize→橡皮擦→复制粘贴
- 不写单元测试（MVP 策略）
