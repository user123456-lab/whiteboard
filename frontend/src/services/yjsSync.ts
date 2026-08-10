import { generateUUID } from '../utils/uuid';
import * as Y from 'yjs';
import { useCanvasStore } from '../store/useCanvasStore';
import type { Shape, HistoryEntry } from '../types';

// ── Transport ──

const LOCAL_ORIGIN = Symbol('local-origin');
const UNDO_ORIGIN = Symbol('undo-origin');

type SendFn = (type: string, payload: object) => void;
let transportSend: SendFn | null = null;

export function setSyncTransport(fn: SendFn): void {
  transportSend = fn;
}

function broadcast(type: string, payload: object): void {
  transportSend?.(type, payload);
}

// ── Helpers ──

function shapeToMap(shape: Shape): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(shape)) {
    if (v === undefined) continue; // 跳过 undefined 值，防止 JSON 序列化时丢失
    if (k === 'points' && Array.isArray(v)) {
      const arr = new Y.Array<number>();
      arr.insert(0, v);
      m.set(k, arr);
    } else {
      m.set(k, v);
    }
  }
  // 确保可填充图形始终有 fill 值
  if (!m.has('fill') && !['brush', 'arrow', 'connector'].includes(shape.type)) {
    m.set('fill', 'transparent');
  }
  return m;
}

function mapToShape(m: Y.Map<unknown>): Shape {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of m.entries()) {
    if (v instanceof Y.Array) {
      obj[k] = v.toArray() as number[];
    } else {
      obj[k] = v;
    }
  }
  return obj as unknown as Shape;
}

function getPointsArray(map: Y.Map<unknown>): Y.Array<number> {
  const existing = map.get('points');
  if (existing instanceof Y.Array) return existing as Y.Array<number>;
  const arr = new Y.Array<number>();
  map.set('points', arr);
  return arr;
}

// ── WhiteboardSync ──

class WhiteboardSync {
  doc: Y.Doc;
  shapes: Y.Array<Y.Map<unknown>>;
  undoManager: Y.UndoManager;
  private suppressBroadcast = false;
  private bootstrapped = false;

  constructor() {
    this.doc = new Y.Doc();
    this.shapes = this.doc.getArray('shapes');
    this.undoManager = new Y.UndoManager(this.shapes, {
      captureTimeout: 400,
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });

    this.shapes.observeDeep(() => {
      // Always sync Y.Doc → Zustand (never skip)
      const shapes = this.shapes.toArray().map(mapToShape);
      const store = useCanvasStore.getState();
      const oldShapes = store.shapes;
      store.loadShapes(shapes);

      // 追踪历史记录（仅本地变更）
      if (!this.suppressBroadcast) {
        this.trackHistory(oldShapes, shapes);
        this.broadcastDiff(oldShapes, shapes);
      }
    });
  }

  // ── Bootstrap ──

  bootstrap(shapes: Shape[], force = false): void {
    if (this.bootstrapped && !force) return;
    this.bootstrapped = true;
    this.suppressBroadcast = true;
    try {
      this.doc.transact(() => {
        this.shapes.delete(0, this.shapes.length);
        for (const shape of shapes) {
          this.shapes.push([shapeToMap(shape)]);
        }
      });
    } finally {
      this.suppressBroadcast = false;
    }
  }

  // ── Local mutations (broadcast = yes) ──

  addShape(shape: Shape): void {
    this.doc.transact(() => {
      this.shapes.push([shapeToMap(shape)]);
    }, LOCAL_ORIGIN);
  }

  updateShape(id: string, changes: Partial<Shape>): void {
    const idx = this.findIndex(id);
    if (idx === -1) return;
    const map = this.shapes.get(idx);
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined) continue;
        if (k === 'points' && Array.isArray(v)) {
          const arr = getPointsArray(map);
          arr.delete(0, arr.length);
          arr.insert(0, v);
        } else {
          map.set(k, v);
        }
      }
    }, LOCAL_ORIGIN);
  }

  deleteShape(id: string): void {
    const idx = this.findIndex(id);
    if (idx === -1) return;
    this.doc.transact(() => {
      this.shapes.delete(idx, 1);
    }, LOCAL_ORIGIN);
  }

  toggleLock(id: string): boolean {
    const idx = this.findIndex(id);
    if (idx === -1) return false;
    const map = this.shapes.get(idx);
    const current = map.get('locked') as boolean | undefined;
    const newLocked = !current;
    this.updateShape(id, { locked: newLocked } as Partial<Shape>);
    return newLocked;
  }

  // ── Z-order ──

  moveShapeUp(id: string): void {
    const idx = this.findIndex(id);
    if (idx !== -1 && idx < this.shapes.length - 1) {
      this.moveShapeInternal(id, idx + 1);
    }
  }

  moveShapeDown(id: string): void {
    const idx = this.findIndex(id);
    if (idx > 0) {
      this.moveShapeInternal(id, idx - 1);
    }
  }

  moveShapeTop(id: string): void {
    this.moveShapeInternal(id, this.shapes.length - 1);
  }

  moveShapeBottom(id: string): void {
    this.moveShapeInternal(id, 0);
  }

  private moveShapeInternal(id: string, newIndex: number): void {
    const idx = this.findIndex(id);
    if (idx === -1 || newIndex < 0 || newIndex >= this.shapes.length) return;
    this.doc.transact(() => {
      const map = this.shapes.get(idx);
      this.shapes.delete(idx, 1);
      this.shapes.insert(Math.min(newIndex, this.shapes.length), [map]);
    }, LOCAL_ORIGIN);
  }

  // ── Sweep erase ──

  batchApply(result: {
    shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
    shapesToCreate: Shape[];
    shapesToDelete: string[];
  }): void {
    this.doc.transact(() => {
      for (const { shapeId, points } of result.shapesToUpdate) {
        const idx = this.findIndex(shapeId);
        if (idx === -1) continue;
        const arr = getPointsArray(this.shapes.get(idx));
        arr.delete(0, arr.length);
        arr.insert(0, points);
      }
      for (const shape of result.shapesToCreate) {
        this.shapes.push([shapeToMap(shape)]);
      }
      for (const id of result.shapesToDelete) {
        const idx = this.findIndex(id);
        if (idx !== -1) this.shapes.delete(idx, 1);
      }
    }, LOCAL_ORIGIN);
  }

  // ── Remote apply (broadcast = no) ──

  applyRemoteCreate(shape: Shape): void {
    if (this.findIndex(shape.id) !== -1) return;
    this.suppressBroadcast = true;
    try {
      this.doc.transact(() => {
        this.shapes.push([shapeToMap(shape)]);
      });
    } finally {
      this.suppressBroadcast = false;
    }
  }

  applyRemoteUpdate(shapeId: string, changes: Partial<Shape>): void {
    this.suppressBroadcast = true;
    try {
      const idx = this.findIndex(shapeId);
      if (idx !== -1) {
        const map = this.shapes.get(idx);
        this.doc.transact(() => {
          for (const [k, v] of Object.entries(changes)) {
            if (v === undefined) continue;
            if (k === 'points' && Array.isArray(v)) {
              const arr = getPointsArray(map);
              arr.delete(0, arr.length);
              arr.insert(0, v);
            } else {
              map.set(k, v);
            }
          }
        });
      }
    } finally {
      this.suppressBroadcast = false;
    }
  }

  applyRemoteDelete(shapeId: string): void {
    this.suppressBroadcast = true;
    try {
      const idx = this.findIndex(shapeId);
      if (idx !== -1) {
        this.doc.transact(() => {
          this.shapes.delete(idx, 1);
        });
      }
    } finally {
      this.suppressBroadcast = false;
    }
  }

  // ── Undo / Redo ──

  undo(): void {
    if (this.undoManager.undoStack.length === 0) return;
    this.undoManager.undo();
  }

  redo(): void {
    if (this.undoManager.redoStack.length === 0) return;
    this.undoManager.redo();
  }

  // ── Group / Ungroup ──

  groupShapes(ids: string[]): void {
    if (ids.length < 2) return;
    const groupId = generateUUID();
    this.doc.transact(() => {
      for (const id of ids) {
        const idx = this.findIndex(id);
        if (idx !== -1) {
          this.shapes.get(idx).set('groupId', groupId);
        }
      }
    }, LOCAL_ORIGIN);
    // Select the group after creating it
    useCanvasStore.getState().selectGroup(groupId);
  }

  ungroupShapes(ids: string[]): void {
    this.doc.transact(() => {
      for (const id of ids) {
        const idx = this.findIndex(id);
        if (idx !== -1) {
          this.shapes.get(idx).set('groupId', null);
        }
      }
    }, LOCAL_ORIGIN);
  }

  canUndo(): boolean { return this.undoManager.undoStack.length > 0; }
  canRedo(): boolean { return this.undoManager.redoStack.length > 0; }

  // ── Private ──

  private findIndex(id: string): number {
    for (let i = 0; i < this.shapes.length; i++) {
      if (this.shapes.get(i).get('id') === id) return i;
    }
    return -1;
  }

  private broadcastDiff(oldShapes: Shape[], newShapes: Shape[]): void {
    const oldIds = new Set(oldShapes.map(s => s.id));
    const newIds = new Set(newShapes.map(s => s.id));

    for (const old of oldShapes) {
      if (!newIds.has(old.id)) {
        broadcast('shape_deleted', { shapeId: old.id });
      }
    }

    for (const s of newShapes) {
      if (!oldIds.has(s.id)) {
        broadcast('shape_created', { shape: s });
      }
    }

    const updates: Array<{ shapeId: string; changes: Record<string, unknown> }> = [];
    for (const s of newShapes) {
      if (!oldIds.has(s.id)) continue;
      const old = oldShapes.find(o => o.id === s.id);
      if (!old) continue;
      const changes = this.diffShape(old, s);
      if (Object.keys(changes).length === 0) continue;
      updates.push({
        shapeId: s.id,
        changes,
      });
    }

    if (updates.length === 1) {
      broadcast('shape_updated', updates[0]);
    } else if (updates.length > 1) {
      broadcast('shape_updated_batch', { updates });
    }

    // 检测图层排序变化：IDs 集合相同但顺序不同
    if (oldShapes.length === newShapes.length && updates.length === 0) {
      let orderChanged = false;
      for (let i = 0; i < oldShapes.length; i++) {
        if (oldShapes[i].id !== newShapes[i].id) {
          orderChanged = true;
          break;
        }
      }
      if (orderChanged) {
        broadcast('shapes_reorder', { order: newShapes.map(s => s.id) });
      }
    }
  }

  // ── History tracking ──

  private trackHistory(oldShapes: Shape[], newShapes: Shape[]): void {
    const store = useCanvasStore.getState();
    const now = Date.now();
    const maxEntries = 200;

    const oldIds = new Set(oldShapes.map(s => s.id));
    const newIds = new Set(newShapes.map(s => s.id));

    const entries: HistoryEntry[] = [];

    // 检测删除
    for (const old of oldShapes) {
      if (!newIds.has(old.id)) {
        entries.push({
          id: generateUUID(),
          shapeId: old.id,
          shapeType: old.type,
          action: 'deleted',
          userId: store.userId,
          timestamp: now,
          label: `Deleted ${old.type}`,
        });
      }
    }

    // 检测新建
    for (const s of newShapes) {
      if (!oldIds.has(s.id)) {
        entries.push({
          id: generateUUID(),
          shapeId: s.id,
          shapeType: s.type,
          action: 'created',
          userId: store.userId,
          timestamp: now,
          label: `Created ${s.type}`,
        });
      }
    }

    // 检测更新
    for (const s of newShapes) {
      if (!oldIds.has(s.id)) continue;
      const old = oldShapes.find(o => o.id === s.id);
      if (!old) continue;
      const changes = this.diffShape(old, s);
      if (Object.keys(changes).length > 0) {
        entries.push({
          id: generateUUID(),
          shapeId: s.id,
          shapeType: s.type,
          action: 'updated',
          userId: store.userId,
          timestamp: now,
          label: `Updated ${s.type}`,
        });
      }
    }

    if (entries.length > 0) {
      const currentHistory = [...store.history, ...entries];
      if (currentHistory.length > maxEntries) {
        currentHistory.splice(0, currentHistory.length - maxEntries);
      }
      useCanvasStore.setState({ history: currentHistory });
    }
  }

  private diffShape(old: Shape, next: Shape): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    const oldRec = old as unknown as Record<string, unknown>;
    const nextRec = next as unknown as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(oldRec), ...Object.keys(nextRec)]);
    for (const k of allKeys) {
      const a = oldRec[k];
      const b = nextRec[k];
      if (b === undefined && a !== undefined) {
        changes[k] = null; // key was removed
      } else if (k === 'points' && Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length || a.some((v: number, i: number) => v !== (b as number[])[i])) {
          changes[k] = b;
        }
      } else if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes[k] = b;
      }
    }
    return changes;
  }
}

export const whiteboardSync = new WhiteboardSync();
