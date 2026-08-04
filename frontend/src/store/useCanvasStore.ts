import { create } from 'zustand';
import type { Shape, ToolType, UserInfo, CursorPosition, HistoryEntry } from '../types';

export interface CanvasState {
  shapes: Shape[];
  selectedId: string | null;
  activeTool: ToolType;
  toolColor: string;
  toolWidth: number;
  toolFontSize: number;
  toolFill: string;
  editingTextId: string | null;
  eraserRadius: number;
  userId: string;
  userName: string;
  roomId: string | null;
  users: UserInfo[];
  remoteCursors: Record<string, CursorPosition>;
  wsConnected: boolean;
  wsReconnecting: boolean;
  stageScale: number;
  stageX: number;
  stageY: number;
  redoStack: { shape: Shape; index: number }[];
  clipboard: Shape | null;
  gridMode: 'none' | 'dot' | 'line';
  history: HistoryEntry[];
  showHistory: boolean;
  exportCounter: number;
  requestExport: () => void;
  clearHistory: () => void;

  setUserId: (id: string) => void;
  setUserName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;
  addShape: (shape: Shape) => void;
  updateShape: (id: string, data: Partial<Shape>) => void;
  applyRemoteUpdate: (id: string, data: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setToolColor: (color: string) => void;
  setToolWidth: (width: number) => void;
  setToolFontSize: (size: number) => void;
  setToolFill: (color: string) => void;
  setEditingTextId: (id: string | null) => void;
  setEraserRadius: (radius: number) => void;
  undoOwn: (userId: string) => string | null;
  redoOwn: (userId: string) => Shape | null;
  setUsers: (users: UserInfo[]) => void;
  addUser: (user: UserInfo) => void;
  removeUser: (userId: string) => void;
  updateRemoteCursor: (cursor: CursorPosition) => void;
  removeRemoteCursor: (userId: string) => void;
  loadShapes: (shapes: Shape[]) => void;
  addRemoteShape: (shape: Shape) => void;
  removeRemoteShape: (id: string) => void;
  toggleLock: (shapeId: string) => boolean;
  batchApplySweepResult: (result: {
    shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
    shapesToCreate: Array<Shape>;
    shapesToDelete: string[];
  }) => void;
  setStageScale: (scale: number) => void;
  setStagePosition: (x: number, y: number) => void;
  setClipboard: (shape: Shape | null) => void;
  setGridMode: (mode: 'none' | 'dot' | 'line') => void;
  setShowHistory: (show: boolean) => void;
  moveShapeUp: (shapeId: string) => void;
  moveShapeDown: (shapeId: string) => void;
  moveShapeTop: (shapeId: string) => void;
  moveShapeBottom: (shapeId: string) => void;
}

function makeLabel(action: string, shapeType: string): string {
  const typeName: Record<string, string> = {
    brush: '画笔',
    rectangle: '矩形',
    circle: '圆形',
    arrow: '箭头',
    text: '文字',
    image: '图片',
  };
  const actionName: Record<string, string> = {
    created: '创建',
    updated: '修改',
    deleted: '删除',
  };
  return `${actionName[action] || action}${typeName[shapeType] || shapeType}`;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  shapes: [],
  selectedId: null,
  activeTool: 'select',
  toolColor: '#3B82F6',
  toolWidth: 2,
  toolFontSize: 18,
  toolFill: 'transparent',
  editingTextId: null,
  eraserRadius: 10,
  userId: '',
  userName: '',
  roomId: null,
  users: [],
  remoteCursors: {},
  wsConnected: false,
  wsReconnecting: false,
  stageScale: 1,
  stageX: 0,
  stageY: 0,
  redoStack: [],
  clipboard: null,
  gridMode: 'none',
  history: [],
  showHistory: false,
  exportCounter: 0,

  setUserId: (id) => set({ userId: id }),
  setUserName: (name) => set({ userName: name }),
  setRoomId: (id) => set({ roomId: id }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),

  addShape: (shape) =>
    set((state) => {
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        shapeId: shape.id,
        shapeType: shape.type,
        action: 'created',
        userId: shape.userId,
        timestamp: Date.now(),
        label: makeLabel('created', shape.type),
      };
      const newHistory = [...state.history, entry];
      return {
        shapes: [...state.shapes, shape],
        redoStack: [],
        history: newHistory.length >= 200 ? newHistory.slice(-199) : newHistory,
      };
    }),

  updateShape: (id, data) =>
    set((state) => {
      const target = state.shapes.find((s) => s.id === id);
      const shapes = state.shapes.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...data } as Shape;
        if (!('version' in data)) {
          merged.version = (s.version ?? 0) + 1;
        }
        return merged;
      });
      if (!target) return { shapes };
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        shapeId: id,
        shapeType: target.type,
        action: 'updated',
        userId: target.userId,
        timestamp: Date.now(),
        label: makeLabel('updated', target.type),
      };
      const newHistory = [...state.history, entry];
      return {
        shapes,
        history: newHistory.length >= 200 ? newHistory.slice(-199) : newHistory,
      };
    }),

  // 远程更新（不录制历史），用于 websocket shape_updated / shape_conflict
  applyRemoteUpdate: (id, data) =>
    set((state) => ({
      shapes: state.shapes.map((s) =>
        s.id === id ? { ...s, ...data, version: (s.version ?? 0) + 1 } as Shape : s
      ),
    })),

  deleteShape: (id) =>
    set((state) => {
      const target = state.shapes.find((s) => s.id === id);
      const shapes = state.shapes.filter((s) => s.id !== id);
      const result: Record<string, unknown> = {
        shapes,
        selectedId: state.selectedId === id ? null : state.selectedId,
        redoStack: [],
      };
      if (target) {
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          shapeId: id,
          shapeType: target.type,
          action: 'deleted',
          userId: target.userId,
          timestamp: Date.now(),
          label: makeLabel('deleted', target.type),
        };
        const newHistory = [...state.history, entry];
        result.history = newHistory.length >= 200 ? newHistory.slice(-199) : newHistory;
      }
      return result;
    }),

  setSelectedId: (id) => set({ selectedId: id }),

  setActiveTool: (tool) => set({ activeTool: tool, selectedId: null }),
  setToolColor: (color) => set({ toolColor: color }),
  setToolWidth: (width) => set({ toolWidth: width }),
  setToolFontSize: (size) => set({ toolFontSize: Math.max(8, Math.min(72, size)) }),
  setEditingTextId: (id) => set({ editingTextId: id }),
  setEraserRadius: (radius) => set({ eraserRadius: radius }),

  undoOwn: (userId) => {
    const { shapes } = get();
    let shapeId: string | null = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapes[i].userId === userId) {
        shapeId = shapes[i].id;
        break;
      }
    }
    if (!shapeId) return null;

    let didMutate = false;
    set((state) => {
      const idx = state.shapes.findIndex((s) => s.id === shapeId);
      if (idx === -1) return state;
      didMutate = true;
      const shape = state.shapes[idx];
      return {
        shapes: state.shapes.filter((_, i) => i !== idx),
        selectedId: state.selectedId === shapeId ? null : state.selectedId,
        redoStack: [...state.redoStack, { shape, index: idx }],
      };
    });
    return didMutate ? shapeId : null;
  },

  redoOwn: (userId) => {
    // Quick check: is there anything to redo?
    if (!get().redoStack.some((e) => e.shape.userId === userId)) return null;

    let restored: Shape | null = null;
    set((state) => {
      // Find the last matching entry from current state
      let entryIdx = -1;
      for (let i = state.redoStack.length - 1; i >= 0; i--) {
        if (state.redoStack[i].shape.userId === userId) {
          entryIdx = i;
          break;
        }
      }
      if (entryIdx === -1) return state;
      const entry = state.redoStack[entryIdx];
      restored = entry.shape;
      const insertAt = Math.min(entry.index, state.shapes.length);
      return {
        shapes: [...state.shapes.slice(0, insertAt), entry.shape, ...state.shapes.slice(insertAt)],
        redoStack: state.redoStack.filter((_, i) => i !== entryIdx),
      };
    });
    return restored;
  },

  setUsers: (users) => set({ users }),
  addUser: (user) =>
    set((state) => {
      if (state.users.find((u) => u.userId === user.userId)) return state;
      return { users: [...state.users, user] };
    }),
  removeUser: (userId) =>
    set((state) => {
      const cursors = { ...state.remoteCursors };
      delete cursors[userId];
      return {
        users: state.users.filter((u) => u.userId !== userId),
        remoteCursors: cursors,
      };
    }),

  updateRemoteCursor: (cursor) =>
    set((state) => ({
      remoteCursors: { ...state.remoteCursors, [cursor.userId]: cursor },
    })),

  removeRemoteCursor: (userId) =>
    set((state) => {
      const cursors = { ...state.remoteCursors };
      delete cursors[userId];
      return { remoteCursors: cursors };
    }),

  loadShapes: (shapes) => set({ shapes, redoStack: [] }),

  addRemoteShape: (shape) =>
    set((state) => {
      if (state.shapes.find((s) => s.id === shape.id)) return state;
      return { shapes: [...state.shapes, shape] };
    }),

  removeRemoteShape: (id) =>
    set((state) => ({
      shapes: state.shapes.filter((s) => s.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  batchApplySweepResult: (result: {
    shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
    shapesToCreate: Array<Shape>;
    shapesToDelete: string[];
  }) => set((state) => {
    let shapes = [...state.shapes];
    for (const upd of result.shapesToUpdate) {
      shapes = shapes.map((s) =>
        s.id === upd.shapeId ? { ...s, points: upd.points, version: (s.version ?? 0) + 1 } as Shape : s
      );
    }
    for (const s of result.shapesToCreate) {
      shapes.push(s);
    }
    for (const id of result.shapesToDelete) {
      shapes = shapes.filter((s) => s.id !== id);
    }
    return { shapes, selectedId: result.shapesToDelete.includes(state.selectedId ?? '') ? null : state.selectedId };
  }),

  toggleLock: (shapeId) => {
    let newLocked = false;
    set((state) => ({
      shapes: state.shapes.map((s) => {
        if (s.id === shapeId) {
          newLocked = !s.locked;
          return { ...s, locked: newLocked } as Shape;
        }
        return s;
      }),
    }));
    return newLocked;
  },

  setToolFill: (color) => set({ toolFill: color }),
  setClipboard: (shape) => set({ clipboard: shape }),
  setGridMode: (mode) => set({ gridMode: mode }),

  clearHistory: () => set({ history: [] }),

  setShowHistory: (show) => set({ showHistory: show }),

  requestExport: () => set((s) => ({ exportCounter: s.exportCounter + 1 })),

  setStageScale: (scale) => {
    if (!Number.isFinite(scale)) return;
    set({ stageScale: Math.max(0.1, Math.min(5, scale)) });
  },
  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  moveShapeUp: (shapeId) => set((state) => {
    const idx = state.shapes.findIndex(s => s.id === shapeId);
    if (idx === -1 || idx === state.shapes.length - 1) return state;
    const shapes = [...state.shapes];
    [shapes[idx], shapes[idx + 1]] = [shapes[idx + 1], shapes[idx]];
    return { shapes };
  }),

  moveShapeDown: (shapeId) => set((state) => {
    const idx = state.shapes.findIndex(s => s.id === shapeId);
    if (idx <= 0) return state;
    const shapes = [...state.shapes];
    [shapes[idx], shapes[idx - 1]] = [shapes[idx - 1], shapes[idx]];
    return { shapes };
  }),

  moveShapeTop: (shapeId) => set((state) => {
    const idx = state.shapes.findIndex(s => s.id === shapeId);
    if (idx === -1 || idx === state.shapes.length - 1) return state;
    const shapes = [...state.shapes];
    const [item] = shapes.splice(idx, 1);
    shapes.push(item);
    return { shapes };
  }),

  moveShapeBottom: (shapeId) => set((state) => {
    const idx = state.shapes.findIndex(s => s.id === shapeId);
    if (idx <= 0) return state;
    const shapes = [...state.shapes];
    const [item] = shapes.splice(idx, 1);
    shapes.unshift(item);
    return { shapes };
  }),
}));
