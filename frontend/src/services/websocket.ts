import type { WSMessage } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';

let wsInstance: WebSocket | null = null;
let throttleTimer = 0;
let intentionalClose = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;

export function connect(roomId: string, userId: string, userName: string): WebSocket {
  if (wsInstance) {
    intentionalClose = true;
    wsInstance.close();
    wsInstance = null;
  }

  intentionalClose = false;
  reconnectAttempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  let url: string;
  if (import.meta.env.DEV) {
    // 开发模式：直连后端端口
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = import.meta.env.VITE_BACKEND_PORT || '8000';
    url = `${protocol}//${host}:${port}/ws/${roomId}?userId=${userId}&userName=${encodeURIComponent(userName)}`;
  } else {
    // 生产模式：同源 WebSocket 走 Nginx 反向代理
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    url = `${protocol}//${window.location.host}/ws/${roomId}?userId=${userId}&userName=${encodeURIComponent(userName)}`;
  }

  const ws = new WebSocket(url);
  wsInstance = ws;

  ws.onopen = () => {
    useCanvasStore.getState().setWsConnected(true);
    useCanvasStore.getState().setWsReconnecting(false);
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const msg: WSMessage = JSON.parse(event.data);
      handleMessage(msg);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    if (wsInstance === ws) {
      wsInstance = null;
    }
    if (intentionalClose) {
      useCanvasStore.getState().setWsConnected(false);
      useCanvasStore.getState().setWsReconnecting(false);
      return;
    }
    useCanvasStore.getState().setWsConnected(false);
    useCanvasStore.getState().setWsReconnecting(true);
    scheduleReconnect(roomId, userId, userName);
  };

  ws.onerror = (event) => {
    console.error('[WS] 连接错误，将触发 onclose 进入重连:', event);
  };

  return ws;
}

function scheduleReconnect(roomId: string, userId: string, userName: string): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    useCanvasStore.getState().setWsReconnecting(false);
    return;
  }
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    connect(roomId, userId, userName);
  }, delay);
}

function handleMessage(msg: WSMessage): void {
  const store = useCanvasStore.getState();

  switch (msg.type) {
    case 'shape_created': {
      const shape = msg.payload.shape;
      if (shape && typeof shape === 'object' && 'id' in shape && 'type' in shape) {
        store.remoteCreateShape(shape as never);
      }
      break;
    }

    case 'shape_updated': {
      const shapeId = msg.payload.shapeId as string;
      const changes = msg.payload.changes as Record<string, unknown>;
      store.remoteUpdateShape(shapeId, changes);
      break;
    }

    case 'shape_updated_batch': {
      const { updates } = msg.payload as {
        updates: Array<{ shapeId: string; changes: Record<string, unknown> }>
      };
      for (const u of updates) {
        store.remoteUpdateShape(u.shapeId, u.changes);
      }
      break;
    }

    case 'shape_deleted':
      store.remoteDeleteShape(msg.payload.shapeId as string);
      break;

    case 'cursor_move': {
      const pos = msg.payload as { x: number; y: number };
      const user = store.users.find(u => u.userId === msg.userId);
      store.updateRemoteCursor({
        userId: msg.userId,
        userName: user?.userName ?? msg.userId,
        color: user?.color ?? '#999',
        x: pos.x,
        y: pos.y,
      });
      break;
    }

    case 'user_joined': {
      const user = msg.payload as Record<string, unknown>;
      if (user && typeof user.userId === 'string' && typeof user.userName === 'string') {
        store.addUser(msg.payload as never);
      }
      break;
    }

    case 'user_left': {
      const leftUserId = (msg.payload as { userId?: string } | null)?.userId;
      if (leftUserId) store.removeUser(leftUserId);
      break;
    }

    case 'room_state': {
      const payload = msg.payload as { shapes: never[]; users: never[] };
      store.bootstrapShapes(payload.shapes as never);
      store.setUsers(payload.users as never);
      break;
    }

    case 'shape_conflict': {
      // 服务端版本更新，用权威数据覆盖本地（败方看到正确状态）
      const serverShape = (msg.payload as { shape?: Record<string, unknown> })?.shape;
      if (serverShape && serverShape.id) {
        store.remoteUpdateShape(serverShape.id as string, serverShape);
      }
      break;
    }

    case 'pong':
      break;

    case 'shapes_reorder': {
      const order = (msg.payload as { order: string[] }).order;
      if (Array.isArray(order) && order.length > 0) {
        const store2 = useCanvasStore.getState();
        const lookup = new Map(store2.shapes.map(s => [s.id, s]));
        const reordered = order
          .map((oid: string) => lookup.get(oid))
          .filter((s): s is NonNullable<typeof s> => s != null);
        // 追加不在 order 列表中的图形
        const inOrder = new Set(order);
        for (const s of store2.shapes) {
          if (!inOrder.has(s.id)) reordered.push(s);
        }
        store2.loadShapes(reordered);
      }
      break;
    }
  }
}

export function sendMessage(ws: WebSocket | null, type: string, payload: object, userId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  if (type === 'cursor_move') {
    const now = Date.now();
    if (now - throttleTimer < 100) return;
    throttleTimer = now;
  }

  try {
    ws.send(
      JSON.stringify({
        type,
        userId,
        timestamp: Date.now(),
        payload,
      })
    );
  } catch {
    // Socket closed between check and send — ignore
  }
}

export function disconnect(): void {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (wsInstance) {
    const ws = wsInstance;
    wsInstance = null;
    ws.close();
  }
}

export function getWs(): WebSocket | null {
  return wsInstance;
}
