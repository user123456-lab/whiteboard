# C1 — 网格/点阵背景

> 优先级: P2 | 类型: 新功能 | 预估: 0.5d | 关联: 无

---

## 一、需求描述

画布当前纯暗色背景（`#1a1a2e`），绘制时缺乏空间参照感。需要可切换的背景模式：
- **无背景**（默认，保持现状）
- **点阵背景**（dot grid）
- **网格背景**（line grid）

## 二、实现方案

### 2.1 背景渲染方式

在 Stage 的第一个 Layer（Grid Layer）中绘制背景，不参与图形交互（`listening={false}`）：

```tsx
// WhiteboardCanvas.tsx Grid Layer
<Layer listening={false}>
  <GridBackground />
</Layer>
```

### 2.2 GridBackground 组件

```tsx
// 新文件: frontend/src/components/GridBackground.tsx
import { Line, Circle } from 'react-konva';
import { useCanvasStore } from '../store/useCanvasStore';

const GRID_SIZE = 40; // 网格间距

function GridBackground() {
  const gridMode = useCanvasStore(s => s.gridMode);     // 'none' | 'dot' | 'line'
  const stageScale = useCanvasStore(s => s.stageScale);
  const stageX = useCanvasStore(s => s.stageX);
  const stageY = useCanvasStore(s => s.stageY);
  const { width, height } = { width: window.innerWidth, height: window.innerHeight };

  if (gridMode === 'none') return null;

  // 计算可见范围的网格线/点（跟随视口）
  const startX = Math.floor(-stageX / stageScale / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(-stageY / stageScale / GRID_SIZE) * GRID_SIZE;
  const endX = startX + width / stageScale + GRID_SIZE;
  const endY = startY + height / stageScale + GRID_SIZE;

  const elements: JSX.Element[] = [];

  if (gridMode === 'line') {
    // 竖线
    for (let x = startX; x <= endX; x += GRID_SIZE) {
      elements.push(
        <Line key={`v${x}`} points={[x, startY, x, endY]}
          stroke="#ffffff10" strokeWidth={0.5} />
      );
    }
    // 横线
    for (let y = startY; y <= endY; y += GRID_SIZE) {
      elements.push(
        <Line key={`h${y}`} points={[startX, y, endX, y]}
          stroke="#ffffff10" strokeWidth={0.5} />
      );
    }
  } else if (gridMode === 'dot') {
    for (let x = startX; x <= endX; x += GRID_SIZE) {
      for (let y = startY; y <= endY; y += GRID_SIZE) {
        elements.push(
          <Circle key={`${x}_${y}`} x={x} y={y} radius={1}
            fill="#ffffff20" />
        );
      }
    }
  }

  return <>{elements}</>;
}
```

### 2.3 性能优化

- 仅渲染可见范围内的网格元素（视口 + 1 格边距）
- 缩放 < 0.25 时自动隐藏点阵（太密无意义）
- 缩放 > 3 时自动隐藏网格（太稀疏无意义）

### 2.4 Store 增加 gridMode

```typescript
// useCanvasStore.ts
gridMode: 'none' | 'dot' | 'line';
setGridMode: (mode: 'none' | 'dot' | 'line') => void;
```

### 2.5 Toolbar 增加背景切换

在工具栏底部（缩放控制下方）增加背景切换按钮：

```
[⊞] — 点击循环切换: 无 → 点阵 → 网格 → 无
```

## 三、涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/components/GridBackground.tsx` | **新建** — 网格/点阵背景组件 |
| `frontend/src/store/useCanvasStore.ts` | 增加 `gridMode` 状态 |
| `frontend/src/components/WhiteboardCanvas.tsx` | Grid Layer 中引用 `GridBackground` |
| `frontend/src/components/Toolbar.tsx` | 增加背景切换按钮 |

## 四、验收标准

- [ ] 默认无网格背景（保持现状）
- [ ] 点击切换按钮 → 点阵显示
- [ ] 再次点击 → 网格显示
- [ ] 第三次点击 → 恢复无背景
- [ ] Ctrl+滚轮缩放时网格/点阵间距同步缩放
- [ ] 中键拖拽时网格/点阵位置跟随
- [ ] 缩放 < 0.25 时点阵自动隐藏
- [ ] 网格/点阵不响应鼠标事件（穿透到下层图形）
