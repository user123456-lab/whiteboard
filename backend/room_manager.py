"""房间管理 — WebSocket 连接追踪与消息广播"""
import re
from typing import Dict
from fastapi import WebSocket

USER_COLORS = [
    "#EF4444", "#10B981", "#3B82F6", "#F59E0B",
    "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
]


class UserInfo:
    """在线用户信息（内存中，不持久化）"""
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
    """房间：管理 WebSocket 连接与用户信息"""
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.connections: Dict[str, WebSocket] = {}
        self.users: Dict[str, UserInfo] = {}

    def add_user(self, user_id: str, user_name: str, ws: WebSocket) -> UserInfo:
        """用户加入房间"""
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

    def remove_user(self, user_id: str, ws: WebSocket = None):
        """用户离开房间 — 仅当 ws 匹配时才移除（防止旧连接误删新连接）"""
        if ws is not None and self.connections.get(user_id) is not ws:
            return
        self.users.pop(user_id, None)
        self.connections.pop(user_id, None)

    async def broadcast(self, message: dict, exclude_user_id: str = None):
        """向房间内所有用户广播消息"""
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
    """全局房间管理器"""
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create_room(self, room_id: str) -> Room:
        """获取或创建房间（验证 room_id 合法性）"""
        if not re.match(r'^[a-zA-Z0-9_-]{1,64}$', room_id):
            raise ValueError(f"Invalid room_id: {room_id}")
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(room_id)
        return self.rooms[room_id]

    def remove_room_if_empty(self, room_id: str):
        """删除空房间的内存追踪"""
        room = self.rooms.get(room_id)
        if room and room.user_count == 0:
            del self.rooms[room_id]
