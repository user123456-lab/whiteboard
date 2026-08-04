import json
import os
import re
from pathlib import Path
from typing import Dict, List
from fastapi import WebSocket

USER_COLORS = [
    "#EF4444", "#10B981", "#3B82F6", "#F59E0B",
    "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
]

DATA_DIR = Path(__file__).parent / "data"


class UserInfo:
    def __init__(self, user_id: str, user_name: str, color: str):
        self.user_id = user_id
        self.user_name = user_name
        self.color = color

    def to_dict(self):
        return {
            "userId": self.user_id,
            "userName": self.user_name,
            "color": self.color,
        }


class Room:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.connections: Dict[str, WebSocket] = {}
        self.users: Dict[str, UserInfo] = {}
        self.shapes: List[dict] = []

    def add_user(self, user_id: str, user_name: str, ws: WebSocket) -> UserInfo:
        # If user already in room, close old connection first
        if user_id in self.connections:
            import asyncio
            try:
                asyncio.ensure_future(self.connections[user_id].close())
            except Exception:
                pass
        color = USER_COLORS[len(self.users) % len(USER_COLORS)]
        user = UserInfo(user_id, user_name, color)
        self.users[user_id] = user
        self.connections[user_id] = ws
        return user

    def remove_user(self, user_id: str):
        self.users.pop(user_id, None)
        self.connections.pop(user_id, None)

    def add_shape(self, shape: dict):
        for i, s in enumerate(self.shapes):
            if s.get("id") == shape.get("id"):
                self.shapes[i] = shape
                return
        self.shapes.append(shape)

    def update_shape(self, shape_id: str, changes: dict, expected_version: int = None) -> bool:
        for shape in self.shapes:
            if shape.get("id") == shape_id:
                if expected_version is not None:
                    current_version = shape.get("version", 1)
                    if expected_version != current_version:
                        return False
                shape.update(changes)
                shape["version"] = shape.get("version", 1) + 1
                return True
        return False

    def get_shape(self, shape_id: str) -> dict | None:
        for shape in self.shapes:
            if shape.get("id") == shape_id:
                return shape
        return None

    def delete_shape(self, shape_id: str):
        self.shapes = [s for s in self.shapes if s.get("id") != shape_id]

    async def broadcast(self, message: dict, exclude_user_id: str = None):
        stale = []
        for uid, ws in list(self.connections.items()):
            if uid == exclude_user_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(uid)
        for uid in stale:
            self.remove_user(uid)

    @property
    def user_count(self) -> int:
        return len(self.connections)


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create_room(self, room_id: str) -> Room:
        if not re.match(r'^[a-zA-Z0-9_-]{1,64}$', room_id):
            raise ValueError(f"Invalid room_id: {room_id}")
        if room_id not in self.rooms:
            room = Room(room_id)
            shapes = self._load_shapes(room_id)
            if shapes:
                room.shapes = shapes
            self.rooms[room_id] = room
        return self.rooms[room_id]

    def save_room(self, room_id: str):
        room = self.rooms.get(room_id)
        if not room:
            return
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        filepath = DATA_DIR / f"{room_id}.json"
        tmppath = DATA_DIR / f"{room_id}.json.tmp"
        try:
            with open(tmppath, "w", encoding="utf-8") as f:
                json.dump(room.shapes, f, ensure_ascii=False, indent=2)
            os.replace(tmppath, filepath)  # atomic rename
        except Exception as e:
            print(f"[Persistence] Failed to save room {room_id}: {e}")
            try:
                tmppath.unlink(missing_ok=True)
            except Exception:
                pass

    def _load_shapes(self, room_id: str) -> List[dict]:
        filepath = DATA_DIR / f"{room_id}.json"
        if not filepath.exists():
            return []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                print(f"[Persistence] Loaded {len(data)} shapes for room {room_id}")
                return data
        except Exception as e:
            print(f"[Persistence] Failed to load room {room_id}: {e}")
            corrupted = DATA_DIR / f"{room_id}.json.corrupted"
            try:
                os.replace(filepath, corrupted)
                print(f"[Persistence] Corrupted file moved to {corrupted}")
            except Exception:
                pass
        return []

    def save_all_rooms(self):
        for room_id in list(self.rooms.keys()):
            self.save_room(room_id)

    def remove_room_if_empty(self, room_id: str):
        room = self.rooms.get(room_id)
        if room and room.user_count == 0:
            self.save_room(room_id)
            del self.rooms[room_id]
