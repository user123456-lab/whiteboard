# A1 — 几何图形橡皮擦部分擦除

> 优先级: P0 | 类型: 功能增强 | 预估: 1d | 关联: A2

---

## 一、问题描述

当前橡皮擦长按扫过（sweepErase）只处理 `brush` 类型：
```typescript
// EraserTool.ts: 47-74
for (const shape of store.shapes) {
  if (shape.type === 'brush') {
    // ... 线段-圆裁剪逻辑
  }
  // 几何图形完全不处理
}
```

矩形、圆形、箭头被橡皮擦圆圈扫过时无任何反应，用户困惑。

## 二、技术决策

**选择方案 B — 扫过整体删除**（本次迭代）

| 方案 | 描述 | 优缺点 |
|------|------|--------|
| A 几何裁剪 | 裁剪矩形边界，生成新的不规则路径 | 完美但复杂（矩形裁剪为多边形路径，圆裁剪为弧段） |
| **B 整体删除** | 橡皮擦圆圈与几何图形相交时，直接删除整个图形 | 简单可靠，符合 MVP 预期，用户可接受 |

**理由**: 几何图形部分裁剪需要将 Konva 矢量图形转为通用 Path 再裁剪，工作量大且边角 case 多。MVP 阶段先做扫过删除，后续可升级为方案 A。

## 三、实现方案

### 3.1 复用已有的 `shapeIntersectsCircle` 方法

`EraserTool.ts` 中已实现完整的几何图形与圆相交检测（241-276行），只需在 `sweepErase` 中调用：

```typescript
// EraserTool.ts sweepErase 方法中，在 brush 处理之后增加：
for (const shape of store.shapes) {
  if (!this.canErase(shape, store.userId)) continue;
  if (shape.locked && shape.userId !== store.userId) continue;
  if (excludeIds.has(shape.id)) continue;

  // 新增：几何图形相交检测
  if (shape.type !== 'brush') {
    if (this.shapeIntersectsCircle(shape, pos.x, pos.y, eraserRadius)) {
      result.shapesToDelete.push(shape.id);
    }
    continue;
  }

  // 已有的 brush 裁剪逻辑...
}
```

### 3.2 注意事项

1. **排除已处理的图形**：`excludeIds` 防止同一 stroke 内重复删除
2. **仅删除一次**：图形加入 `shapesToDelete` 后加入 `excludeIds`
3. **锁定检查**：已锁定且非自己创建的图形不可擦除
4. **与单击删除的关系**：单击删除（`tryErase`）已支持几何图形，无需修改

### 3.3 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/tools/EraserTool.ts` | `sweepErase` 方法增加几何图形相交检测分支 |

## 四、验收标准

- [ ] 橡皮擦长按扫过矩形时，矩形被删除
- [ ] 橡皮擦长按扫过圆形时，圆形被删除
- [ ] 橡皮擦长按扫过箭头时，箭头被删除
- [ ] 同一 stroke 内同一图形仅删除一次（不重复发 `shape_deleted`）
- [ ] 他人锁定图形不被擦除
- [ ] 单击删除几何图形（已有功能）继续正常工作
