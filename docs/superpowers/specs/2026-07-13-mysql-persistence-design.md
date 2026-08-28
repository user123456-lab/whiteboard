# MySQL 持久化改造设计文档

> 版本: 1.0
> 日期: 2026-07-13
> 状态: 待实施

## 目标

将白板项目后端持久化从 JSON 文件改为 MySQL，同时移除前端 Yjs CRDT 层，简化为直接 WebSocket 同步 + 乐观锁。

## 变更范围

| 文件 | 操作 |
|------|------|
| `backend/main.py` | 添加数据库连接池初始化、建表、shutdown 清理 |
| `backend/room_manager.py` | 重写，去掉内存 shapes，改为 MySQL 读写 |
| `backend/requirements.txt` | 添加 `sqlalchemy[asyncio]` + `aiomysql` |
| `frontend/src/services/yjsSync.ts` | **删除** |
| `frontend/src/store/useCanvasStore.ts` | 改写 CRUD 方法，直接操作 shapes 数组 + 发 WebSocket |
| `frontend/src/managers/ToolManager.ts` | undo/redo 改为自维护操作栈 |

前端其他文件（组件、工具、WebSocket 服务）不改。

## 数据库设计

### rooms 表

| 列 | 类型 | 说明 |
|----|------|------|
| id | VARCHAR(6) PK | 6位房间码 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 最后活跃时间（自动更新） |

### shapes 表

公共属性独立列（可查询），类型专属几何数据存入 `geometry` JSON 列：

| 列 | 类型 | 说明 |
|----|------|------|
| id | VARCHAR(36) PK | UUID |
| room_id | VARCHAR(6) FK→rooms | 所属房间 |
| user_id | VARCHAR(36) | 创建者 ID |
| type | VARCHAR(20) | brush/rectangle/circle/arrow/text/image/roundedRect/diamond/parallelogram/cylinder/document/connector |
| color | VARCHAR(9) | 描边颜色 |
| stroke_width | INT | 线宽 |
| fill | VARCHAR(20) | 填充色，默认 transparent |
| locked | BOOLEAN | 锁定状态 |
| group_id | VARCHAR(36) | 编组 ID |
| version | INT DEFAULT 1 | 乐观锁版本号 |
| sort_order | INT DEFAULT 0 | 图层顺序，值越小越在底层 |
| geometry | JSON | 图形专属几何数据（见下表） |
| created_at | BIGINT | 创建时间戳 |
| updated_at | BIGINT | 更新时间戳 |

### geometry 列内容（按 type）

| type | geometry 示例 |
|------|--------------|
| rectangle | `{"x":100,"y":100,"width":200,"height":150}` |
| roundedRect | `{"x":100,"y":100,"width":200,"height":150,"cornerRadius":10}` |
| diamond | `{"x":100,"y":100,"width":160,"height":100}` |
| parallelogram | `{"x":100,"y":100,"width":200,"height":120,"skew":40}` |
| cylinder | `{"x":100,"y":100,"width":180,"height":140}` |
| document | `{"x":100,"y":100,"width":160,"height":200,"foldSize":20}` |
| circle | `{"x":200,"y":200,"radius":50}` |
| brush | `{"points":[10,20,30,40,50,60]}` |
| arrow | `{"points":[0,0,100,100]}` |
| text | `{"x":300,"y":400,"text":"Hello","fontSize":18}` |
| image | `{"x":100,"y":100,"width":300,"height":200,"imageData":"base64..."}` |
| connector | `{"fromShapeId":"s1","toShapeId":"s2","fromEdge":"right","toEdge":"left","endArrow":true}` |

### 索引

- `idx_room (room_id)` — 按房间批量查询
- `idx_room_sort (room_id, sort_order)` — 按房间+图层顺序查询（最常用）

## 后端改动

### 数据库连接

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine

engine: AsyncEngine  # 全局连接池

@on_event("startup")
async def startup():
    engine = create_async_engine(
        "mysql+aiomysql://user:pass@localhost/whiteboard",
        pool_size=5, max_overflow=10
    )
    # 建表
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_TABLE_SQL))
```

### room_manager.py 改动

- **删除** `Room.shapes` 和 `Room.users` 内存字典
- **删除** `RoomManager.save_room()` / `_load_shapes()` / `save_all_rooms()`
- **删除** `data/` 目录
- **新增** `db_get_shapes(room_id)` — 按 sort_order 排序查询
- **新增** `db_insert_shape(room, shape)` — INSERT
- **新增** `db_update_shape(shape_id, changes, expected_version)` — UPDATE + 乐观锁检查
- **新增** `db_delete_shape(shape_id)` — DELETE
- **删除** `UserInfo` 类（用户信息保持内存，仅不落库）

### 乐观锁

```python
async def db_update_shape(conn, shape_id, changes, expected_version):
    result = await conn.execute(
        text("""
            UPDATE shapes
            SET color=:color, ..., version=version+1, updated_at=:now
            WHERE id=:id AND version=:expected
        """),
        {...}
    )
    if result.rowcount == 0:
        # 版本不匹配，发送 conflict
        ...
```

## 前端改动

### useCanvasStore.ts 改动

去掉所有 `whiteboardSync.xxx()` 委托调用，CRUD 方法直接操作本地状态：

```typescript
addShape: (shape) => {
  set((s) => ({ shapes: [...s.shapes, shape] }));
  sendMessage(getWs(), 'shape_created', { shape }, userId);
},

updateShape: (id, data) => {
  set((s) => ({
    shapes: s.shapes.map((sh) =>
      sh.id === id ? { ...sh, ...data, version: (sh.version ?? 1) + 1 } : sh
    ),
  }));
  sendMessage(getWs(), 'shape_updated', {
    shapeId: id, changes: data, expectedVersion: oldVersion
  }, userId);
},
```

### ToolManager.ts undo/redo

删除 `store.undo()` / `store.redo()`，替换为自维护操作栈：

```typescript
private undoStack: UndoEntry[] = [];
private redoStack: UndoEntry[] = [];

// undo: 出栈 → 根据操作类型发反向 WS 消息
// redo: 出栈 → 重新执行原操作
```

### yjsSync.ts

整个文件删除。`bootstrapYjs()` → 直接用 WS 收到的 `room_state.shapes` 调用 `loadShapes()`。

## 数据流（最终状态）

```
用户操作 → ToolManager
  → store.addShape() → 本地 shapes 更新 + 发送 WS → 后端 INSERT MySQL + 广播
  → 其他人 WS onmessage → remoteCreateShape → 本地 shapes 更新

冲突处理：
  → 后端 UPDATE WHERE version=expected → 匹配失败
  → 返回 shape_conflict → 客户端拉全量 room_state

undo/redo：
  → 操作栈出栈/入栈 → 发送对应反向 WS 消息
```

## WebSocket 协议

保持不变。所有消息类型不变，仅后端处理从"内存+JSON文件"变为"MySQL读写"。

## 不涉及

- 前端组件（WhiteboardCanvas、Toolbar 等）
- 前端工具类（所有 tools/）
- WebSocket 连接管理（websocket.ts）
- 远程光标同步
- 房间加入/离开流程
- 对齐服务、网络服务

## 数据库连接配置

通过 `backend/.env` 配置：

```
DB_USER=root
DB_PASS=
DB_HOST=localhost
DB_PORT=3306
DB_NAME=whiteboard
```

启动时从环境变量读取，不存在则使用默认值。
