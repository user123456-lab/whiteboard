# D3 — 复制粘贴图形（Ctrl+C/V）

> 优先级: P1 | 类型: 新功能 | 预估: 0.5d | 关联: A2

---

## 一、需求描述

选中图形后 `Ctrl+C` 复制到剪贴板，`Ctrl+V` 粘贴到画布。粘贴的图形偏移 20px，生成新 ID 和时间戳。

## 二、实现方案

### 2.1 剪贴板存储

使用内存剪贴板（不依赖系统剪贴板 API，避免跨浏览器兼容问题）：

```typescript
// useCanvasStore.ts
clipboard: Shape | null;
setClipboard: (shape: Shape | null) => void;
```

**为什么不用系统剪贴板？** 系统 `navigator.clipboard.write()` 只能写文本/图片，序列化 Shape 对象需额外序列化/反序列化。内存剪贴板更简单可靠，且同一页签内复制粘贴满足需求。

### 2.2 快捷键处理

```typescript
// ToolManager.ts handleKeyDown 方法中增加：

if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
  if (store.selectedId) {
    const shape = store.shapes.find(s => s.id === store.selectedId);
    if (shape) {
      store.setClipboard(structuredClone(shape));
    }
  }
  return;
}

if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
  e.preventDefault();
  if (store.clipboard) {
    const newShape: Shape = {
      ...structuredClone(store.clipboard),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      // 偏移 20px 避免完全重叠
      ...(store.clipboard.type === 'brush' || store.clipboard.type === 'arrow'
        ? { points: offsetPoints(store.clipboard.points, 20, 20) }
        : {}),
      ...('x' in store.clipboard && 'y' in store.clipboard
        ? { x: (store.clipboard as Shape & {x:number}).x + 20,
            y: (store.clipboard as Shape & {y:number}).y + 20 }
        : {}),
      version: undefined,  // 新图形无版本号
    };
    store.addShape(newShape);
    sendMessage(getWs(), 'shape_created', { shape: newShape }, store.userId);
    store.setSelectedId(newShape.id);
  }
  return;
}
```

### 2.3 点偏移辅助函数

```typescript
function offsetPoints(points: number[], dx: number, dy: number): number[] {
  const result = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push(points[i] + dx, points[i + 1] + dy);
  }
  return result;
}
```

### 2.4 边界情况

| 场景 | 行为 |
|------|------|
| 无选中图形时 Ctrl+C | 无操作，不报错 |
| 无剪贴板时 Ctrl+V | 无操作，不报错 |
| 粘贴他人图形 | 允许（所有权归粘贴者，userId 不变） |
| 粘贴锁定图形 | 新图形不锁定（`locked: undefined`） |
| 连续粘贴 | 每次偏移 20px，可叠加创建等距排列 |

## 三、涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/store/useCanvasStore.ts` | 增加 `clipboard` 状态 |
| `frontend/src/managers/ToolManager.ts` | `handleKeyDown` 增加 Ctrl+C/V 分支 |

## 四、验收标准

- [ ] 选中图形 Ctrl+C 复制（无可见反馈，静默存入剪贴板）
- [ ] Ctrl+V 粘贴，新图形偏移 20px
- [ ] 粘贴后自动选中新图形
- [ ] 粘贴的图形同步到所有协作端
- [ ] 连续粘贴 5 次，图形等距排列不重叠
- [ ] 无选中时 Ctrl+C 不报错
- [ ] 空剪贴板时 Ctrl+V 不报错
- [ ] 粘贴的图形保留原填充色
