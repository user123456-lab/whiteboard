import type { WSMessage } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';

let wsInstance: WebSocket | null = null;
let throttleTimer = 0;

export function connect(roomId: string, userId: string, userName: string): WebSocket {
  if (wsInstance) {
    wsInstance.close();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const url = `${protocol}//${host}:8000/ws/${roomId}?userId=${userId}&userName=${encodeURIComponent(userName)}`;

  const ws = new WebSocket(url);
  wsInstance = ws;

  ws.onopen = () => {
    useCanvasStore.getState().setWsConnected(true);
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
    useCanvasStore.getState().setWsConnected(false);
    wsInstance = null;
  };

  ws.onerror = () => {
    // onclose will fire after this
  };

  return ws;
}

function handleMessage(msg: WSMessage): void {
  const store = useCanvasStore.getState();

  switch (msg.type) {
    case 'shape_created':
      store.addShape(msg.payload.shape as never);
      break;

    case 'shape_updated': {
      const shapeId = msg.payload.shapeId as string;
      const changes = msg.payload.changes as Record<string, unknown>;
      store.updateShape(shapeId, changes);
      break;
    }

    case 'shape_deleted':
      store.deleteShape(msg.payload.shapeId as string);
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

  // Throttle cursor moves to 100ms
  if (type === 'cursor_move') {
    const now = Date.now();
    if (now - throttleTimer < 100) return;
    throttleTimer = now;
  }

  ws.send(
    JSON.stringify({
      type,
      userId,
      timestamp: Date.now(),
      payload,
    })
  );
}

export function disconnect(): void {
  if (wsInstance) {
    wsInstance.close();
    wsInstance = null;
  }
}

export function getWs(): WebSocket | null {
  return wsInstance;
}
