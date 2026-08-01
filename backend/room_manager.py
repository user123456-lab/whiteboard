from typing import Dict, List
from fastapi import WebSocket

USER_COLORS = [
    "#EF4444", "#10B981", "#3B82F6", "#F59E0B",
    "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
]


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

    def update_shape(self, shape_id: str, changes: dict):
        for shape in self.shapes:
            if shape.get("id") == shape_id:
                shape.update(changes)
                return

    def delete_shape(self, shape_id: str):
        self.shapes = [s for s in self.shapes if s.get("id") != shape_id]

    async def broadcast(self, message: dict, exclude_user_id: str = None):
        stale = []
        for uid, ws in self.connections.items():
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
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id)
        return self.rooms[room_id]

    def remove_room_if_empty(self, room_id: str):
        room = self.rooms.get(room_id)
        if room and room.user_count == 0:
            del self.rooms[room_id]
