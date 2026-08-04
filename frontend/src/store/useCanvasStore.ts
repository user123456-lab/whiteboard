import { create } from 'zustand';
import type { Shape, ToolType, UserInfo, CursorPosition, HistoryEntry } from '../types';
import { whiteboardSync } from '../services/yjsSync';

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
  requestExport: () => void;

  setUserId: (id: string) => void;
  setUserName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;

  // Shape CRUD — delegates to Yjs whiteboardSync
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

  // Undo / Redo — global (CRDT-based)
  undo: () => void;
  redo: () => void;

  // Remote ingest — delegates to whiteboardSync
  remoteCreateShape: (shape: Shape) => void;
  remoteUpdateShape: (id: string, data: Partial<Shape>) => void;
  remoteDeleteShape: (id: string) => void;

  // Bootstrap
  bootstrapYjs: (shapes: Shape[], force?: boolean) => void;

  setSelectedId: (id: string | null) => void;
  selectOnly: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectGroup: (groupId: string) => void;
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

  requestExport: () => set((s) => ({ exportCounter: s.exportCounter + 1 })),

  // ── Identity ──
  setUserId: (id) => set({ userId: id }),
  setUserName: (name) => set({ userName: name }),
  setRoomId: (id) => set({ roomId: id }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),

  // ── Shape CRUD (→ Yjs) ──
  addShape: (shape) => {
    whiteboardSync.addShape(shape);
  },

  updateShape: (id, data) => {
    whiteboardSync.updateShape(id, data);
  },

  deleteShape: (id) => {
    whiteboardSync.deleteShape(id);
  },

  toggleLock: (shapeId) => {
    return whiteboardSync.toggleLock(shapeId);
  },

  batchApplySweepResult: (result) => {
    whiteboardSync.batchApply(result);
  },

  // ── Z-order (→ Yjs Y.Array) ──
  moveShapeUp: (shapeId) => whiteboardSync.moveShapeUp(shapeId),
  moveShapeDown: (shapeId) => whiteboardSync.moveShapeDown(shapeId),
  moveShapeTop: (shapeId) => whiteboardSync.moveShapeTop(shapeId),
  moveShapeBottom: (shapeId) => whiteboardSync.moveShapeBottom(shapeId),

  // ── Undo / Redo (global) ──
  undo: () => whiteboardSync.undo(),
  redo: () => whiteboardSync.redo(),

  // ── Remote ingest (→ Yjs) ──
  remoteCreateShape: (shape) => whiteboardSync.applyRemoteCreate(shape),
  remoteUpdateShape: (id, data) => whiteboardSync.applyRemoteUpdate(id, data),
  remoteDeleteShape: (id) => whiteboardSync.applyRemoteDelete(id),

  // ── Bootstrap ──
  bootstrapYjs: (shapes, force) => whiteboardSync.bootstrap(shapes, force),

  // ── Local state ──
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

  // ── Users & cursors ──
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

  loadShapes: (shapes) => set({ shapes }),

  // ── Viewport ──
  setStageScale: (scale) => {
    if (!Number.isFinite(scale)) return;
    set({ stageScale: Math.max(0.1, Math.min(5, scale)) });
  },
  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  // ── Misc ──
  setClipboard: (shape) => set({ clipboard: shape }),
  setGridMode: (mode) => set({ gridMode: mode }),
  setShowHistory: (show) => set({ showHistory: show }),
}));
