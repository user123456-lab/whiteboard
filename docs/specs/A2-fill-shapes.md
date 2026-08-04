# A2 — 填充形状（fill + stroke 分离）

> 优先级: P1 | 类型: 新功能 | 预估: 0.5d | 关联: A1, D3

---

## 一、需求描述

当前矩形、圆形、箭头只有描边（stroke），无法绘制实心填充的图形。用户需要：
- 独立的填充颜色选择器（含透明选项）
- 描边颜色和填充颜色分离配置
- 支持透明填充（无填充）

## 二、数据模型变更

### 2.1 Shape 类型扩展

```typescript
// types/index.ts — BaseShape 增加可选字段
export interface BaseShape {
  // ... 现有字段
  fill?: string;  // 填充颜色，如 "#FF0000"；undefined/"transparent" 表示无填充
}
```

**兼容性**: 旧 shape 数据无 `fill` 字段，渲染时 `fill || 'transparent'` → 无填充，完全兼容。

### 2.2 仅影响可填充的图形

仅 `rectangle`、`circle`、`arrow` 支持填充。`brush` 和 `text` 有其自身的颜色语义（笔刷是描边、文字是 fill），不支持 fill 字段。

## 三、UI 变更

### 3.1 Toolbar 增加填充色选择器

当 `activeTool ∈ {rectangle, circle, arrow}` 时，在颜色选择器旁增加填充色选择器：

```
[描边色选择器]  [填充色选择器]  [线宽滑块]
```

填充色选择器：
- 左侧显示当前填充色方块
- 点击弹出颜色面板
- 右侧 "×" 按钮清除填充（设为透明）

### 3.2 Store 增加 toolFill 状态

```typescript
// useCanvasStore.ts
toolFill: string;         // 默认 '#FFFFFF80'（半透明白色）
setToolFill: (color: string) => void;
```

### 3.3 工具同步

矩形/圆形/箭头工具的 `onMouseUp` 创建 shape 时读取 `store.toolFill`：
```typescript
return {
  // ...现有字段
  fill: store.toolFill !== 'transparent' ? store.toolFill : undefined,
};
```

## 四、渲染变更

### 4.1 WhiteboardCanvas.tsx

```tsx
// 矩形
<Rect {...common} fill={shape.fill || 'transparent'} />
// 圆形
<Circle {...common} fill={shape.fill || 'transparent'} />
// 箭头
<Arrow {...common} fill={shape.fill || shape.color} /> // 箭头默认用描边色填充
```

### 4.2 预览层

工具预览（绘制中的虚线框）也需显示填充色预览：
```typescript
// RectangleTool.ts
this.previewRect = new Konva.Rect({
  fill: store.toolFill !== 'transparent' ? store.toolFill + '80' : 'transparent', // 预览半透明
  // ...
});
```

## 五、涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/types/index.ts` | `BaseShape` 增加 `fill?: string` |
| `frontend/src/store/useCanvasStore.ts` | 增加 `toolFill` 状态 + setter |
| `frontend/src/components/Toolbar.tsx` | 几何工具模式下显示填充色选择器 |
| `frontend/src/components/WhiteboardCanvas.tsx` | `renderShape` 传递 fill 属性 |
| `frontend/src/tools/RectangleTool.ts` | 创建 shape 时读取 `toolFill`，预览显示填充 |
| `frontend/src/tools/CircleTool.ts` | 同上 |
| `frontend/src/tools/ArrowTool.ts` | 同上 |

## 六、验收标准

- [ ] 矩形可选择填充色，绘制后显示实心填充
- [ ] 圆形可选择填充色，绘制后显示实心填充
- [ ] 箭头可选择填充色
- [ ] 填充色和描边色独立：可红色描边 + 蓝色填充
- [ ] "×" 按钮可清除填充，图形仅显示描边
- [ ] 旧画布数据（无 fill 字段）正常显示（无填充）
- [ ] 填充图形仍可被橡皮擦正常擦除
