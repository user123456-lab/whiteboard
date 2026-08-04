# E1 — 文字编辑框跟随缩放/平移

> 优先级: P0 | 类型: Bug 修复 | 预估: 0.5d | 关联: 无

---

## 一、问题描述

当前 `WhiteboardCanvas.tsx` 中文字编辑框（`<textarea>`）的位置计算仅在组件挂载时执行一次（通过 `useEffect` 依赖 `editingTextId`），不响应 `stageScale`、`stageX`、`stageY` 的变化。用户缩放或平移画布后，编辑框停留在原位，与下方文字图形错位。

## 二、根因定位

```tsx
// 当前代码 (WhiteboardCanvas.tsx: 403-456)
{editingTextId && (() => {
  const shape = shapes.find(s => s.id === editingTextId);
  if (!shape || shape.type !== 'text') return null;
  const stage = stageRef.current;
  if (!stage) return null;
  const absPos = stage.getAbsoluteTransform().point({ x: shape.x, y: shape.y });
  // ... absPos 只在 render 时计算一次，但 scale/position 变化时该 IIFE 不重新执行
})()}
```

问题在于 `editingTextId` 不变时（用户仍在编辑同一文字），`shapes`、`stageScale`、`stageX`、`stageY` 变化不会触发 `textarea` 位置重新计算。

## 三、修复方案

### 3.1 将 textarea 提取为独立组件 `TextEditor`

```tsx
// 新文件: frontend/src/components/TextEditor.tsx
function TextEditor({ shape, stage }: { shape: TextShape; stage: Konva.Stage }) {
  const stageScale = useCanvasStore(s => s.stageScale);
  const stageX = useCanvasStore(s => s.stageX);
  const stageY = useCanvasStore(s => s.stageY);

  // 每次 scale/position 变化都重新计算绝对位置
  const absPos = useMemo(() => {
    return stage.getAbsoluteTransform().point({ x: shape.x, y: shape.y });
  }, [stageScale, stageX, stageY, shape.x, shape.y, stage]);

  // ... textarea JSX
}
```

### 3.2 关键改动

1. **提取 `TextEditor` 组件**：从 `WhiteboardCanvas.tsx` 中移出 textarea 渲染逻辑
2. **订阅 scale/position**：通过 `useCanvasStore` 选择器订阅 `stageScale`、`stageX`、`stageY`
3. **`useMemo` 计算位置**：依赖 scale + position + shape 坐标重新计算绝对位置
4. **编辑框样式**：使用 CSS `transform` 或直接更新 `left/top`，字体大小同步缩放

### 3.3 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/components/TextEditor.tsx` | **新建** — 提取的编辑框组件 |
| `frontend/src/components/WhiteboardCanvas.tsx` | 删除内联 textarea 代码，改用 `<TextEditor>` |

## 四、验收标准

- [ ] 编辑文字时 Ctrl+滚轮缩放，编辑框随文字图形同步移动和缩放
- [ ] 编辑文字时中键拖拽平移，编辑框随文字图形同步移动
- [ ] 字体大小随 `stageScale` 等比缩放
- [ ] Esc / Ctrl+Enter 仍然正常退出编辑
