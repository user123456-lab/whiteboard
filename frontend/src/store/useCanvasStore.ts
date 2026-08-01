import { create } from 'zustand';
import type { Shape, ToolType, UserInfo, CursorPosition } from '../types';

export interface CanvasState {
  shapes: Shape[];
  selectedId: string | null;
  activeTool: ToolType;
  toolColor: string;
  toolWidth: number;
  userId: string;
  userName: string;
  roomId: string | null;
  users: UserInfo[];
  remoteCursors: Record<string, CursorPosition>;
  wsConnected: boolean;

  setUserId: (id: string) => void;
  setUserName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  addShape: (shape: Shape) => void;
  updateShape: (id: string, data: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setToolColor: (color: string) => void;
  setToolWidth: (width: number) => void;
  undoOwn: (userId: string) => string | null;
  setUsers: (users: UserInfo[]) => void;
  addUser: (user: UserInfo) => void;
  removeUser: (userId: string) => void;
  updateRemoteCursor: (cursor: CursorPosition) => void;
  removeRemoteCursor: (userId: string) => void;
  loadShapes: (shapes: Shape[]) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  shapes: [],
  selectedId: null,
  activeTool: 'select',
  toolColor: '#3B82F6',
  toolWidth: 2,
  userId: '',
  userName: '',
  roomId: null,
  users: [],
  remoteCursors: {},
  wsConnected: false,

  setUserId: (id) => set({ userId: id }),
  setUserName: (name) => set({ userName: name }),
  setRoomId: (id) => set({ roomId: id }),
  setWsConnected: (connected) => set({ wsConnected: connected }),

  addShape: (shape) =>
    set((state) => ({ shapes: [...state.shapes, shape] })),

  updateShape: (id, data) =>
    set((state) => ({
      shapes: state.shapes.map((s) => (s.id === id ? ({ ...s, ...data } as Shape) : s)),
    })),

  deleteShape: (id) =>
    set((state) => ({
      shapes: state.shapes.filter((s) => s.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  setSelectedId: (id) => set({ selectedId: id }),

  setActiveTool: (tool) => set({ activeTool: tool, selectedId: null }),
  setToolColor: (color) => set({ toolColor: color }),
  setToolWidth: (width) => set({ toolWidth: width }),

  undoOwn: (userId) => {
    const { shapes } = get();
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapes[i].userId === userId) {
        const shapeId = shapes[i].id;
        set({
          shapes: shapes.filter((_, idx) => idx !== i),
          selectedId: get().selectedId === shapeId ? null : get().selectedId,
        });
        return shapeId;
      }
    }
    return null;
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

  loadShapes: (shapes) => set({ shapes }),
}));
