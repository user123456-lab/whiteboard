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
  // Close existing connection cleanly
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

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const url = `${protocol}//${host}:8000/ws/${roomId}?userId=${userId}&userName=${encodeURIComponent(userName)}`;

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
    // Unexpected disconnect — start reconnect loop
    useCanvasStore.getState().setWsConnected(false);
    useCanvasStore.getState().setWsReconnecting(true);
    scheduleReconnect(roomId, userId, userName);
  };

  ws.onerror = () => {
    // onclose will fire after this
  };

  return ws;
}

function scheduleReconnect(roomId: string, userId: string, userName: string): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    useCanvasStore.getState().setWsReconnecting(false);
    return;
  }
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (capped at 30s)
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    connect(roomId, userId, userName);
  }, delay);
}

// handleMessage — keep EXACTLY the same as current (imports addRemoteShape, removeRemoteShape, etc.)
function handleMessage(msg: WSMessage): void {
  const store = useCanvasStore.getState();

  switch (msg.type) {
    case 'shape_created':
      store.addRemoteShape(msg.payload.shape as never);
      break;

    case 'shape_updated': {
      const shapeId = msg.payload.shapeId as string;
      const changes = msg.payload.changes as Record<string, unknown>;
      store.updateShape(shapeId, changes);
      break;
    }

    case 'shape_deleted':
      store.removeRemoteShape(msg.payload.shapeId as string);
      break;

    case 'cursor_move':
      store.updateRemoteCursor(msg.payload as never);
      break;

    case 'user_joined':
      store.addUser(msg.payload as never);
      break;

    case 'user_left':
      store.removeUser(msg.payload.userId as string);
      break;

    case 'room_state': {
      const payload = msg.payload as { shapes: never[]; users: never[] };
      store.loadShapes(payload.shapes);
      store.setUsers(payload.users);
      break;
    }

    case 'pong':
      break;
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
