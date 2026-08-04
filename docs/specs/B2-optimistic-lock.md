# B2 — 版本号乐观锁

> 优先级: P3 | 类型: 架构增强 | 预估: 1d | 关联: A2, D3

---

## 一、问题描述

当前采用纯 LWW（最后写入获胜）策略，服务器无条件接受所有 `shape_updated` 并广播。问题场景：

```
时间线:
1. 用户A 修改矩形颜色为红 → 发送 shape_updated { color: "red", ... }
2. 用户B 同时修改矩形位置    → 发送 shape_updated { x: 150, y: 200, ... }
3. 服务器先收到B的消息 → 更新 x/y
4. 服务器再收到A的消息 → 更新 color，但 A 的消息基于旧位置，覆盖 B 的新位置
结果: B 的位置修改被静默覆盖，用户无感知
```

## 二、解决方案

### 2.1 协议增强

**shape 增加 version 字段**（已有字段，但未使用）：

```typescript
// types/index.ts — BaseShape 已有 version?: number
// 创建时 version = 1，每次 shape_updated 后递增
```

**shape_updated 消息增加 expectedVersion**：

```json
// 客户端 → 服务器
{
  "type": "shape_updated",
  "userId": "...",
  "payload": {
    "shapeId": "shape_xxx",
    "changes": { "color": "#FF0000" },
    "expectedVersion": 2   // 新增：客户端期望的当前版本号
  }
}
```

### 2.2 服务器端冲突检测

```python
# room_manager.py — Room.update_shape 方法增强

def update_shape(self, shape_id: str, changes: dict, expected_version: int = None) -> bool:
    for shape in self.shapes:
        if shape.get("id") == shape_id:
            if expected_version is not None:
                current_version = shape.get("version", 1)
                if expected_version != current_version:
                    return False  # 版本冲突，拒绝更新
            shape.update(changes)
            shape["version"] = shape.get("version", 1) + 1
            return True
    return False
```

### 2.3 服务器端消息路由

```python
# main.py — shape_updated 处理分支

elif msg_type == "shape_updated":
    shape_id = payload.get("shapeId")
    changes = payload.get("changes", {})
    expected_version = payload.get("expectedVersion")  # 新字段
    if shape_id:
        success = room.update_shape(shape_id, changes, expected_version)
        if success:
            await room.broadcast(message, exclude_user_id=userId)
        else:
            # 版本冲突: 发送最新状态给请求者，让它重新同步
            shape = room.get_shape(shape_id)
            if shape:
                await websocket.send_json({
                    "type": "shape_conflict",
                    "userId": "server",
                    "timestamp": int(time.time() * 1000),
                    "payload": {"shape": shape},
                })
```

### 2.4 客户端端冲突处理

```typescript
// websocket.ts — handleMessage 增加 shape_conflict 处理

case 'shape_conflict': {
  const serverShape = msg.payload.shape as Shape;
  store.updateShape(serverShape.id, serverShape);
  // 可选：弹出轻提示 "图形已被他人修改，已同步最新版本"
  break;
}
```

### 2.5 客户端发送更新时携带 expectedVersion

```typescript
// ToolManager.ts / Toolbar.tsx — 所有发送 shape_updated 的地方

const shape = store.shapes.find(s => s.id === shapeId);
sendMessage(getWs(), 'shape_updated', {
  shapeId: shape.id,
  changes: { color: newColor },
  expectedVersion: shape.version ?? 1,   // 新增
}, store.userId);
```

## 三、兼容性

| 场景 | 处理 |
|------|------|
| 服务器收到不带 `expectedVersion` 的更新 | `expectedVersion = None` → 无条件接受（兼容旧客户端） |
| 新创建的 shape | `version = 1` |
| 旧 shape 数据无 version 字段 | `shape.get("version", 1)` → 默认 1 |
| 首次创建时的 shape_created | 不校验版本，直接存储 |

## 四、涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/services/websocket.ts` | `handleMessage` 增加 `shape_conflict` 分支 |
| `frontend/src/managers/ToolManager.ts` | `shape_updated` 消息增加 `expectedVersion` |
| `frontend/src/components/Toolbar.tsx` | 同上 |
| `frontend/src/components/WhiteboardCanvas.tsx` | 同上 |
| `backend/main.py` | `shape_updated` 路由增加冲突检测 + 返回 |
| `backend/room_manager.py` | `update_shape` 增加 `expected_version` 参数和版本号递增 |

## 五、验收标准

- [ ] 创建新图形时 version = 1
- [ ] 每次 shape_updated 成功后 version 递增
- [ ] 两个客户端同时编辑同一图形，先到者成功、后到者收到 `shape_conflict` 并同步最新状态
- [ ] 无 `expectedVersion` 的旧消息仍然被接受（向后兼容）
- [ ] shape_created 不触发版本校验
