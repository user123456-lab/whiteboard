"""FastAPI 主入口 — WebSocket 路由 + MySQL 持久化"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# 在导入其他模块前加载环境变量（api/network.py 模块级常量依赖这些变量）
is_prod = "--prod" in sys.argv
env_file = Path(__file__).parent / (".env.production" if is_prod else ".env")
if env_file.exists():
    load_dotenv(env_file, override=True)

import json
import time
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from room_manager import RoomManager
from database import init_db, close_db, get_session, _shape_to_row, _row_to_shape
from api.network import router as network_router

app = FastAPI(title="Whiteboard Backend")
app.include_router(network_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

room_manager = RoomManager()


@app.on_event("startup")
async def startup():
    await init_db()
    asyncio.create_task(heartbeat_loop())


@app.on_event("shutdown")
async def shutdown():
    await close_db()
    print("[Server] Shutdown complete")


async def heartbeat_loop():
    while True:
        await asyncio.sleep(30)
        for room in list(room_manager.rooms.values()):
            for uid, ws in list(room.connections.items()):
                try:
                    await ws.send_json({
                        "type": "ping", "userId": "server",
                        "timestamp": int(time.time() * 1000), "payload": {},
                    })
                except Exception:
                    room.remove_user(uid)


@app.get("/")
async def root():
    return {"status": "ok", "rooms": len(room_manager.rooms)}


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    userId: str = Query(...),
    userName: str = Query("Anonymous"),
):
    # 1. 获取或创建房间
    try:
        room = room_manager.get_or_create_room(room_id)
    except ValueError:
        await websocket.close(code=4000, reason="Invalid room ID")
        return

    # 2. 在数据库中创建房间记录（幂等）
    async with get_session() as session:
        await session.execute(
            text("INSERT IGNORE INTO rooms (id) VALUES (:rid)"),
            {"rid": room_id},
        )
        await session.commit()

    # 3. 用户加入房间（内存追踪）
    user_info = room.add_user(userId, userName, websocket)
    await websocket.accept()

    # 4. 从数据库加载房间图形，发送 room_state
    now = int(time.time() * 1000)
    async with get_session() as session:
        result = await session.execute(
            text("SELECT * FROM shapes WHERE room_id = :rid ORDER BY sort_order"),
            {"rid": room_id},
        )
        shapes = [_row_to_shape(row) for row in result.fetchall()]

    await websocket.send_json({
        "type": "room_state",
        "userId": "server",
        "timestamp": now,
        "payload": {
            "shapes": shapes,
            "users": [u.to_dict() for u in room.users.values() if u.user_id != userId],
        },
    })

    # 5. 广播用户加入
    await room.broadcast({
        "type": "user_joined",
        "userId": userId,
        "timestamp": now,
        "payload": user_info.to_dict(),
    }, exclude_user_id=userId)

    # 6. 消息循环
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = message.get("type")
            payload = message.get("payload", {})
            now_ts = int(time.time() * 1000)

            async with get_session() as session:

                if msg_type == "shape_created":
                    shape = payload.get("shape", {})
                    if not shape.get("id") or not shape.get("type"):
                        continue

                    # 确定 sort_order：当前最大 sort_order + 1
                    r = await session.execute(
                        text("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM shapes WHERE room_id = :rid"),
                        {"rid": room_id},
                    )
                    next_order = r.scalar()

                    row = _shape_to_row(shape, room_id, next_order, now_ts)
                    await session.execute(
                        text("""
                            INSERT INTO shapes (id, room_id, user_id, type, color, stroke_width, fill,
                                locked, group_id, version, sort_order, geometry, created_at, updated_at)
                            VALUES (:id, :room_id, :user_id, :type, :color, :stroke_width, :fill,
                                :locked, :group_id, :version, :sort_order, :geometry, :created_at, :updated_at)
                        """),
                        row,
                    )
                    await session.commit()
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shape_updated":
                    shape_id = payload.get("shapeId")
                    changes = payload.get("changes", {})
                    expected_version = payload.get("expectedVersion")
                    if not shape_id:
                        continue

                    if expected_version is not None:
                        # 乐观锁检查
                        r = await session.execute(
                            text("SELECT version FROM shapes WHERE id = :id"),
                            {"id": shape_id},
                        )
                        row = r.fetchone()
                        if not row or row[0] != expected_version:
                            await websocket.send_json({
                                "type": "shape_conflict",
                                "userId": "server",
                                "timestamp": now_ts,
                                "payload": {"shapeId": shape_id},
                            })
                            continue

                    # 构建 SET 子句 — 公共列直接设置，几何字段合并到 geometry
                    sets = []
                    params = {"id": shape_id, "now": now_ts}
                    geo_fields = {}
                    for k, v in changes.items():
                        if k == 'color':
                            sets.append("color = :color"); params['color'] = v
                        elif k == 'strokeWidth':
                            sets.append("stroke_width = :sw"); params['sw'] = v
                        elif k == 'fill':
                            sets.append("fill = :fill"); params['fill'] = v
                        elif k == 'locked':
                            sets.append("locked = :l"); params['l'] = v
                        elif k == 'groupId':
                            sets.append("group_id = :gid"); params['gid'] = v
                        elif k == 'x':
                            geo_fields['x'] = v
                        elif k == 'y':
                            geo_fields['y'] = v
                        elif k == 'width':
                            geo_fields['width'] = v
                        elif k == 'height':
                            geo_fields['height'] = v
                        elif k == 'radius':
                            geo_fields['radius'] = v
                        elif k == 'points':
                            geo_fields['points'] = v
                        elif k == 'text':
                            geo_fields['text'] = v
                        elif k == 'fontSize':
                            geo_fields['fontSize'] = v
                        elif k == 'cornerRadius':
                            geo_fields['cornerRadius'] = v
                        elif k == 'skew':
                            geo_fields['skew'] = v
                        elif k == 'foldSize':
                            geo_fields['foldSize'] = v
                        elif k == 'endArrow':
                            geo_fields['endArrow'] = v
                        elif k == 'imageData':
                            geo_fields['imageData'] = v

                    if geo_fields:
                        sets.append("geometry = JSON_MERGE_PATCH(geometry, :geo)")
                        params['geo'] = json.dumps(geo_fields, ensure_ascii=False)

                    if sets:
                        sets.append("version = version + 1")
                        sets.append("updated_at = :now")
                        sql = f"UPDATE shapes SET {', '.join(sets)} WHERE id = :id"
                        await session.execute(text(sql), params)
                    await session.commit()
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shape_updated_batch":
                    updates = payload.get("updates", [])
                    for update in updates:
                        shape_id = update.get("shapeId")
                        changes = update.get("changes", {})
                        if not shape_id:
                            continue
                        sets = []
                        params = {"id": shape_id, "now": now_ts}
                        geo_fields = {}
                        for k, v in changes.items():
                            if k == 'color':
                                sets.append("color = :color"); params['color'] = v
                            elif k == 'strokeWidth':
                                sets.append("stroke_width = :sw"); params['sw'] = v
                            elif k == 'fill':
                                sets.append("fill = :fill"); params['fill'] = v
                            elif k == 'locked':
                                sets.append("locked = :l"); params['l'] = v
                            elif k == 'groupId':
                                sets.append("group_id = :gid"); params['gid'] = v
                            elif k in ('x', 'y', 'width', 'height', 'radius', 'points',
                                        'text', 'fontSize', 'cornerRadius', 'skew', 'foldSize',
                                        'endArrow', 'imageData'):
                                geo_fields[k] = v
                        if geo_fields:
                            sets.append("geometry = JSON_MERGE_PATCH(geometry, :geo)")
                            params['geo'] = json.dumps(geo_fields, ensure_ascii=False)
                        if sets:
                            sets.append("version = version + 1")
                            sets.append("updated_at = :now")
                            sql = f"UPDATE shapes SET {', '.join(sets)} WHERE id = :id"
                            await session.execute(text(sql), params)
                    await session.commit()
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shape_deleted":
                    shape_id = payload.get("shapeId")
                    if shape_id:
                        await session.execute(
                            text("DELETE FROM shapes WHERE id = :id"),
                            {"id": shape_id},
                        )
                        await session.commit()
                        await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "shapes_reorder":
                    order = payload.get("order", [])
                    if isinstance(order, list):
                        for idx, shape_id in enumerate(order):
                            await session.execute(
                                text("UPDATE shapes SET sort_order = :so WHERE id = :id"),
                                {"so": idx, "id": shape_id},
                            )
                        await session.commit()
                        await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "cursor_move":
                    await room.broadcast(message, exclude_user_id=userId)

                elif msg_type == "ping":
                    await websocket.send_json({
                        "type": "pong", "userId": "server",
                        "timestamp": now_ts, "payload": {},
                    })

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        import traceback
        print(f"[ERROR] WebSocket handler exception: {exc}")
        traceback.print_exc()
    finally:
        room.remove_user(userId, websocket)
        if room.user_count == 0:
            room_manager.remove_room_if_empty(room_id)
        else:
            try:
                await room.broadcast({
                    "type": "user_left",
                    "userId": userId,
                    "timestamp": int(time.time() * 1000),
                    "payload": {"userId": userId},
                })
            except Exception:
                pass
