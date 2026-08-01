import json
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from room_manager import RoomManager

app = FastAPI(title="Whiteboard Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

room_manager = RoomManager()


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
    await websocket.accept()

    room = room_manager.get_or_create_room(room_id)
    user_info = room.add_user(userId, userName, websocket)

    await websocket.send_json({
        "type": "room_state",
        "userId": "server",
        "timestamp": int(time.time() * 1000),
        "payload": {
            "shapes": room.shapes,
            "users": [u.to_dict() for u in room.users.values()],
        },
    })

    await room.broadcast({
        "type": "user_joined",
        "userId": userId,
        "timestamp": int(time.time() * 1000),
        "payload": user_info.to_dict(),
    }, exclude_user_id=userId)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = message.get("type")
            msg_user_id = message.get("userId", userId)
            payload = message.get("payload", {})

            if msg_type == "shape_created":
                shape = payload.get("shape", {})
                room.add_shape(shape)
                await room.broadcast(message, exclude_user_id=msg_user_id)

            elif msg_type == "shape_updated":
                shape_id = payload.get("shapeId")
                changes = payload.get("changes", {})
                if shape_id:
                    room.update_shape(shape_id, changes)
                    await room.broadcast(message, exclude_user_id=msg_user_id)

            elif msg_type == "shape_deleted":
                shape_id = payload.get("shapeId")
                if shape_id:
                    room.delete_shape(shape_id)
                    await room.broadcast(message, exclude_user_id=msg_user_id)

            elif msg_type == "cursor_move":
                await room.broadcast(message, exclude_user_id=msg_user_id)

            elif msg_type == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "userId": "server",
                    "timestamp": int(time.time() * 1000),
                    "payload": {},
                })

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        room.remove_user(userId)
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
