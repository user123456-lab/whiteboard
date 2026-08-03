import { create } from 'zustand';
import type { Shape, ToolType, UserInfo, CursorPosition } from '../types';

export interface CanvasState {
  shapes: Shape[];
  selectedId: string | null;
  activeTool: ToolType;
  toolColor: string;
  toolWidth: number;
  toolFontSize: number;
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

  setUserId: (id: string) => void;
  setUserName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  setWsReconnecting: (reconnecting: boolean) => void;
  addShape: (shape: Shape) => void;
  updateShape: (id: string, data: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setToolColor: (color: string) => void;
  setToolWidth: (width: number) => void;
  setToolFontSize: (size: number) => void;
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
  setStageScale: (scale: number) => void;
  setStagePosition: (x: number, y: number) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  shapes: [],
  selectedId: null,
  activeTool: 'select',
  toolColor: '#3B82F6',
  toolWidth: 2,
  toolFontSize: 18,
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

  setUserId: (id) => set({ userId: id }),
  setUserName: (name) => set({ userName: name }),
  setRoomId: (id) => set({ roomId: id }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setWsReconnecting: (reconnecting) => set({ wsReconnecting: reconnecting }),

  addShape: (shape) =>
    set((state) => ({ shapes: [...state.shapes, shape], redoStack: [] })),

  updateShape: (id, data) =>
    set((state) => ({
      shapes: state.shapes.map((s) => (s.id === id ? ({ ...s, ...data } as Shape) : s)),
    })),

  deleteShape: (id) =>
    set((state) => ({
      shapes: state.shapes.filter((s) => s.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      redoStack: [],
    })),

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

  setStageScale: (scale) => {
    if (!Number.isFinite(scale)) return;
    set({ stageScale: Math.max(0.1, Math.min(5, scale)) });
  },
  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),
}));
