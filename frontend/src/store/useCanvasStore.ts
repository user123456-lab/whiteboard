import { create } from 'zustand';
import type { Shape, ToolType, UserInfo, CursorPosition, HistoryEntry } from '../types';
import { sendMessage, getWs } from '../services/websocket';
import type { NetworkInfo } from '../services/network';

// ── Undo/Redo 操作栈 ──

interface UndoEntry {
  undo: () => void;
  redo: () => void;
}

let _undoStack: UndoEntry[] = [];
let _redoStack: UndoEntry[] = [];
let _undoRedoing = false;

function pushUndo(entry: UndoEntry): void {
  if (_undoRedoing) return;
  _undoStack.push(entry);
  if (_undoStack.length > 200) _undoStack.shift();
  _redoStack = [];
}

export interface CanvasState {
  shapes: Shape[];
  selectedIds: string[];
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
  clipboard: Shape | null;
  gridMode: 'none' | 'dot' | 'line';
  history: HistoryEntry[];
  showHistory: boolean;
  exportCounter: number;
  networkInfo: NetworkInfo | null;
  requestExport: () => void;

  setUserId: (id: string) => void;
  setUserName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;

  addShape: (shape: Shape) => void;
  updateShape: (id: string, data: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  toggleLock: (shapeId: string) => boolean;
  batchApplySweepResult: (result: {
    shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
    shapesToCreate: Array<Shape>;
    shapesToDelete: string[];
  }) => void;
  moveShapeUp: (shapeId: string) => void;
  moveShapeDown: (shapeId: string) => void;
  moveShapeTop: (shapeId: string) => void;
  moveShapeBottom: (shapeId: string) => void;

  undo: () => void;
  redo: () => void;

  remoteCreateShape: (shape: Shape) => void;
  remoteUpdateShape: (id: string, data: Partial<Shape>) => void;
  remoteDeleteShape: (id: string) => void;
  bootstrapShapes: (shapes: Shape[]) => void;

  setSelectedId: (id: string | null) => void;
  selectOnly: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectGroup: (groupId: string) => void;
  selectAll: () => void;
  setActiveTool: (tool: ToolType) => void;
  setToolColor: (color: string) => void;
  setToolWidth: (width: number) => void;
  setToolFontSize: (size: number) => void;
  setToolFill: (color: string) => void;
  setEditingTextId: (id: string | null) => void;
  setEraserRadius: (radius: number) => void;
  setUsers: (users: UserInfo[]) => void;
  addUser: (user: UserInfo) => void;
  removeUser: (userId: string) => void;
  updateRemoteCursor: (cursor: CursorPosition) => void;
  removeRemoteCursor: (userId: string) => void;
  loadShapes: (shapes: Shape[]) => void;
  setStageScale: (scale: number) => void;
  setStagePosition: (x: number, y: number) => void;
  setClipboard: (shape: Shape | null) => void;
  setGridMode: (mode: 'none' | 'dot' | 'line') => void;
  setShowHistory: (show: boolean) => void;
  setNetworkInfo: (info: NetworkInfo) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  shapes: [],
  selectedIds: [],
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
  clipboard: null,
  gridMode: 'none',
  history: [],
  showHistory: false,
  exportCounter: 0,
  networkInfo: null,

  requestExport: () => set((s) => ({ exportCounter: s.exportCounter + 1 })),

  setUserId: (id) => set({ userId: id }),
  setUserName: (name) => set({ userName: name }),
  setRoomId: (id) => set({ roomId: id }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),

  // ── Shape CRUD（直接操作 Zustand + 发送 WebSocket）──

  addShape: (shape) => {
    set((s) => ({ shapes: [...s.shapes, shape] }));
    const store = get();
    pushUndo({
      undo: () => store.deleteShape(shape.id),
      redo: () => {
        _undoRedoing = true;
        store.addShape(shape);
        _undoRedoing = false;
      },
    });
    sendMessage(getWs(), 'shape_created', { shape }, store.userId);
  },

  updateShape: (id, data) => {
    let prev: Partial<Shape> | null = null;
    let oldVersion: number | undefined;
    set((s) => {
      const old = s.shapes.find((sh) => sh.id === id);
      if (old) {
        prev = {};
        oldVersion = old.version;
        for (const k of Object.keys(data)) {
          (prev as Record<string, unknown>)[k] = (old as unknown as Record<string, unknown>)[k];
        }
      }
      return {
        shapes: s.shapes.map((sh) =>
          sh.id === id ? { ...sh, ...data, version: (sh.version ?? 1) + 1 } as Shape : sh,
        ),
      };
    });
    const store = get();
    if (prev) {
      const prevData = prev;
      pushUndo({
        undo: () => store.updateShape(id, prevData),
        redo: () => store.updateShape(id, data),
      });
    }
    sendMessage(
      getWs(), 'shape_updated',
      { shapeId: id, changes: data, expectedVersion: oldVersion },
      store.userId,
    );
  },

  deleteShape: (id) => {
    let shape: Shape | null = null;
    set((s) => {
      shape = s.shapes.find((sh) => sh.id === id) ?? null;
      return { shapes: s.shapes.filter((sh) => sh.id !== id) };
    });
    const store = get();
    if (shape) {
      const capturedShape = shape;
      pushUndo({
        undo: () => {
          _undoRedoing = true;
          store.addShape(capturedShape);
          _undoRedoing = false;
        },
        redo: () => store.deleteShape(id),
      });
    }
    sendMessage(getWs(), 'shape_deleted', { shapeId: id }, store.userId);
  },

  toggleLock: (shapeId) => {
    const shape = get().shapes.find((s) => s.id === shapeId);
    if (!shape) return false;
    const newLocked = !shape.locked;
    get().updateShape(shapeId, { locked: newLocked } as Partial<Shape>);
    return newLocked;
  },

  batchApplySweepResult: (result) => {
    _undoRedoing = true;
    set((s) => {
      let shapes = [...s.shapes];
      for (const { shapeId, points } of result.shapesToUpdate) {
        shapes = shapes.map((sh) =>
          sh.id === shapeId ? { ...sh, points } : sh,
        );
      }
      for (const shape of result.shapesToCreate) {
        shapes = [...shapes, shape];
      }
      const deleteSet = new Set(result.shapesToDelete);
      shapes = shapes.filter((sh) => !deleteSet.has(sh.id));
      return { shapes };
    });
    _undoRedoing = false;
    const store = get();
    if (result.shapesToUpdate.length > 0) {
      sendMessage(getWs(), 'shape_updated_batch', {
        updates: result.shapesToUpdate.map((u) => ({
          shapeId: u.shapeId,
          changes: { points: u.points },
        })),
      }, store.userId);
    }
    for (const shape of result.shapesToCreate) {
      sendMessage(getWs(), 'shape_created', { shape }, store.userId);
    }
    for (const id of result.shapesToDelete) {
      sendMessage(getWs(), 'shape_deleted', { shapeId: id }, store.userId);
    }
  },

  // ── 图层排序 ──

  moveShapeUp: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx === -1 || idx >= s.shapes.length - 1) return s;
      const newShapes = [...s.shapes];
      [newShapes[idx], newShapes[idx + 1]] = [newShapes[idx + 1], newShapes[idx]];
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  moveShapeDown: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx <= 0) return s;
      const newShapes = [...s.shapes];
      [newShapes[idx], newShapes[idx - 1]] = [newShapes[idx - 1], newShapes[idx]];
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  moveShapeTop: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx === -1 || idx >= s.shapes.length - 1) return s;
      const newShapes = s.shapes.filter((sh) => sh.id !== shapeId);
      newShapes.push(s.shapes[idx]);
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  moveShapeBottom: (shapeId) => {
    set((s) => {
      const idx = s.shapes.findIndex((sh) => sh.id === shapeId);
      if (idx <= 0) return s;
      const newShapes = s.shapes.filter((sh) => sh.id !== shapeId);
      newShapes.unshift(s.shapes[idx]);
      return { shapes: newShapes };
    });
    const order = get().shapes.map((s) => s.id);
    sendMessage(getWs(), 'shapes_reorder', { order }, get().userId);
  },

  // ── Undo / Redo（自维护操作栈）──

  undo: () => {
    if (_undoStack.length === 0) return;
    _undoRedoing = true;
    const entry = _undoStack.pop()!;
    entry.undo();
    _redoStack.push(entry);
    _undoRedoing = false;
  },

  redo: () => {
    if (_redoStack.length === 0) return;
    _undoRedoing = true;
    const entry = _redoStack.pop()!;
    entry.redo();
    _undoStack.push(entry);
    _undoRedoing = false;
  },

  // ── 远程消息处理（不触发 undo 栈，不重复广播）──

  remoteCreateShape: (shape) => {
    set((s) => {
      if (s.shapes.find((sh) => sh.id === shape.id)) return s;
      return { shapes: [...s.shapes, shape] as Shape[] };
    });
  },

  remoteUpdateShape: (id, data) => {
    set((s) => ({
      shapes: s.shapes.map((sh) =>
        sh.id === id ? { ...sh, ...data } as Shape : sh,
      ),
    }));
  },

  remoteDeleteShape: (id) => {
    set((s) => ({ shapes: s.shapes.filter((sh) => sh.id !== id) }));
  },

  bootstrapShapes: (shapes) => {
    set({ shapes });
  },

  // ── 选择 ──

  setSelectedId: (id) => set({ selectedIds: id ? [id] : [] }),
  selectOnly: (id) => set({ selectedIds: [id] }),
  toggleSelect: (id) =>
    set((state) => {
      const exists = state.selectedIds.includes(id);
      return {
        selectedIds: exists
          ? state.selectedIds.filter((i) => i !== id)
          : [...state.selectedIds, id],
      };
    }),
  clearSelection: () => set({ selectedIds: [] }),
  selectAll: () =>
    set((state) => {
      const selectableIds = state.shapes
        .filter((s) => s.type !== 'connector')
        .map((s) => s.id);
      return { selectedIds: selectableIds };
    }),
  selectGroup: (groupId) =>
    set((state) => {
      const groupIds = state.shapes
        .filter((s) => s.groupId === groupId)
        .map((s) => s.id);
      return { selectedIds: groupIds };
    }),
  setActiveTool: (tool) => set({ activeTool: tool, selectedIds: [] }),
  setToolColor: (color) => set({ toolColor: color }),
  setToolWidth: (width) => set({ toolWidth: width }),
  setToolFontSize: (size) => set({ toolFontSize: Math.max(8, Math.min(72, size)) }),
  setToolFill: (color) => set({ toolFill: color }),
  setEditingTextId: (id) => set({ editingTextId: id }),
  setEraserRadius: (radius) => set({ eraserRadius: radius }),

  // ── 用户与光标 ──

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

  loadShapes: (shapes) =>
    set((state) => {
      const validIds = new Set(shapes.map((s) => s.id));
      const selectedIds = state.selectedIds.filter((id) => validIds.has(id));
      return { shapes, selectedIds };
    }),

  setStageScale: (scale) => {
    if (!Number.isFinite(scale)) return;
    set({ stageScale: Math.max(0.1, Math.min(5, scale)) });
  },
  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  setClipboard: (shape) => set({ clipboard: shape }),
  setGridMode: (mode) => set({ gridMode: mode }),
  setShowHistory: (show) => set({ showHistory: show }),
  setNetworkInfo: (info) => set({ networkInfo: info }),
}));
