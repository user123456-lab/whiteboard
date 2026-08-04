import type Konva from 'konva';
import type { Shape } from '../types';
import { useCanvasStore, type CanvasState } from '../store/useCanvasStore';
import { sendMessage, getWs } from '../services/websocket';
import { BrushTool } from '../tools/BrushTool';
import { RectangleTool } from '../tools/RectangleTool';
import { CircleTool } from '../tools/CircleTool';
import { ArrowTool } from '../tools/ArrowTool';
import { TextTool } from '../tools/TextTool';
import { SelectTool } from '../tools/SelectTool';
import { EraserTool, type SweepResult } from '../tools/EraserTool';

function offsetPoints(points: number[], dx: number, dy: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push(points[i] + dx, points[i + 1] + dy);
  }
  return result;
}

export class ToolManager {

  private brushTool = new BrushTool();
  private rectangleTool = new RectangleTool();
  private circleTool = new CircleTool();
  private arrowTool = new ArrowTool();
  private textTool = new TextTool();
  private selectTool = new SelectTool();
  private eraserTool = new EraserTool();

  private isDrawing = false;
  private erasedInStroke: Set<string> = new Set();
  private lastEraserPos: { x: number; y: number } | null = null;
  private previewLayer: Konva.Layer | null = null;
  private stage: Konva.Stage | null = null;

  setStage(stage: Konva.Stage | null): void {
    this.stage = stage;
  }

  setPreviewLayer(layer: Konva.Layer): void {
    this.previewLayer = layer;
  }

  handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    try {
      const store = useCanvasStore.getState();
      const pos = this.getRelativePos(e);

      if (store.activeTool === 'select') {
        // Hit test shapes
        const target = e.target;
        if (target && target !== this.stage && target.attrs?.id) {
          const shapeId = target.attrs.id as string;
          const shape = store.shapes.find((s) => s.id === shapeId);
          if (shape) {
            if (shape.locked && shape.userId !== store.userId) {
              store.setSelectedId(null);
              this.selectTool.setDraggedShape(null);
              return; // locked by someone else — can't select
            }
            store.setSelectedId(shapeId);
            this.selectTool.setDraggedShape(shape);
          }
        } else {
          store.setSelectedId(null);
          this.selectTool.setDraggedShape(null);
        }
        this.selectTool.onMouseDown(pos, store, this.previewLayer!);
        return;
      }

      if (store.activeTool === 'eraser') {
        this.isDrawing = true;
        this.erasedInStroke.clear();
        this.lastEraserPos = pos;
        this.tryEraseAtTarget(e.target);
        return;
      }

      // Text tool: click anywhere → create new text and enter edit mode.
      // Existing text: hover shows dashed border, double-click enters edit (handled by Stage onDblClick).
      if (store.activeTool === 'text') {
        // Click outside while editing → close editor, don't create new
        if (store.editingTextId) {
          store.setEditingTextId(null);
          return;
        }
        // Click on existing text → skip (handled by double-click)
        const target = e.target;
        if (target && target !== this.stage && target.attrs?.id) {
          const shape = store.shapes.find((s) => s.id === target.attrs.id as string);
          if (shape && shape.type === 'text') return;
        }
        // Empty area → create new text, immediately enter edit mode on mouseup
        store.setSelectedId(null);
        this.isDrawing = true;
        this.textTool.onMouseDown(pos, store, this.previewLayer!);
        return;
      }

      store.setSelectedId(null);
      this.isDrawing = true;
      this.getActiveDrawingTool()?.onMouseDown(pos, store, this.previewLayer!);
    } catch (err) {
      console.error('handleMouseDown error:', err);
      this.isDrawing = false;
    }
  }

  handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const store = useCanvasStore.getState();

    // Cursor position throttle is handled by sendMessage in websocket.ts
    const pos = this.getRelativePos(e);
    sendMessage(getWs(), 'cursor_move', { x: pos.x, y: pos.y }, store.userId);

    if (store.activeTool === 'select') {
      this.selectTool.onMouseMove(pos, store, this.previewLayer!);
      return;
    }

    if (store.activeTool === 'eraser') {
      if (this.isDrawing) {
        this.applySweepErase(pos);
      }
      return;
    }

    if (!this.isDrawing) return;
    this.getActiveDrawingTool()?.onMouseMove(pos, store, this.previewLayer!);
  }

  handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>): void {
    try {
      const store = useCanvasStore.getState();
      const pos = this.getRelativePos(e);

      if (store.activeTool === 'select') {
        this.selectTool.onMouseUp(pos, store, this.previewLayer!);
        return;
      }

      if (store.activeTool === 'eraser') {
        this.erasedInStroke.clear();
        this.lastEraserPos = null;
        return;
      }

      if (!this.isDrawing) return;

      const shape = this.getActiveDrawingTool()?.onMouseUp(pos, store, this.previewLayer!) ?? null;

      if (shape) {
        store.addShape(shape);
        // Text tool: immediately enter edit mode after creating text
        if (shape.type === 'text') {
          store.setEditingTextId(shape.id);
        }
      }
    } finally {
      this.isDrawing = false;
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    const store = useCanvasStore.getState();

    // Tool shortcuts
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+C — copy selected shape to clipboard
      if (e.key === 'c') {
        if (store.selectedId) {
          const shape = store.shapes.find((s) => s.id === store.selectedId);
          if (shape) {
            store.setClipboard(structuredClone(shape));
          }
        }
        return;
      }

      // Ctrl+V — paste shape from clipboard
      if (e.key === 'v') {
        e.preventDefault();
        if (store.clipboard) {
          const newShape: Shape = {
            ...structuredClone(store.clipboard),
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            version: undefined,
          } as Shape;

          // Offset position for non-brush/arrow shapes
          if ('x' in newShape && 'y' in newShape) {
            (newShape as Shape & { x: number }).x += 20;
            (newShape as Shape & { y: number }).y += 20;
          }

          // Offset points for brush/arrow shapes
          if ('points' in newShape && Array.isArray(newShape.points)) {
            (newShape as Shape & { points: number[] }).points = offsetPoints(
              (newShape as Shape & { points: number[] }).points,
              20,
              20,
            );
          }

          store.addShape(newShape);
          store.setSelectedId(newShape.id);
        }
        return;
      }

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        store.redo();
        return;
      }

      // Ctrl+] — move shape to top
      if (e.key === ']') {
        if (store.selectedId) store.moveShapeTop(store.selectedId);
        return;
      }
      // Ctrl+[ — move shape to bottom
      if (e.key === '[') {
        if (store.selectedId) store.moveShapeBottom(store.selectedId);
        return;
      }

      return;
    }

    switch (e.key.toLowerCase()) {
      case 'delete':
      case 'backspace':
        if (store.selectedId) {
          const shape = store.shapes.find((s) => s.id === store.selectedId);
          if (shape && (shape.userId === store.userId || (!shape.userId && !shape.locked))) {
            store.deleteShape(shape.id);
          }
        }
        break;
      case 'v': this.cancelAll(); store.setActiveTool('select'); break;
      case 'b': this.cancelAll(); store.setActiveTool('brush'); break;
      case 'r': this.cancelAll(); store.setActiveTool('rectangle'); break;
      case 'c': this.cancelAll(); store.setActiveTool('circle'); break;
      case 'a': this.cancelAll(); store.setActiveTool('arrow'); break;
      case 't': this.cancelAll(); store.setActiveTool('text'); break;
      case 'e': this.cancelAll(); store.setActiveTool('eraser'); break;
      case 'l':
        if (store.selectedId) {
          const shape = store.shapes.find((s) => s.id === store.selectedId);
          if (shape && shape.userId === store.userId) {
            store.toggleLock(shape.id);
          }
        }
        break;
      case 'escape':
        store.setSelectedId(null);
        this.cancelAll();
        break;
      // Layer ordering (when shape is selected)
      case ']':
        if (store.selectedId) {
          store.moveShapeUp(store.selectedId);
        }
        break;
      case '[':
        if (store.selectedId) {
          store.moveShapeDown(store.selectedId);
        }
        break;
    }
  }

  private getActiveDrawingTool() {
    const store = useCanvasStore.getState();
    switch (store.activeTool) {
      case 'brush': return this.brushTool;
      case 'rectangle': return this.rectangleTool;
      case 'circle': return this.circleTool;
      case 'arrow': return this.arrowTool;
      case 'text': return this.textTool;
      default: return null;
    }
  }

  private getRelativePos(e: Konva.KonvaEventObject<MouseEvent>): { x: number; y: number } {
    if (!this.stage) return { x: 0, y: 0 };
    const transform = this.stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point({ x: e.evt.offsetX, y: e.evt.offsetY });
    return pos;
  }

  private tryEraseAtTarget(target: Konva.Shape | Konva.Stage | null): void {
    const store = useCanvasStore.getState();
    const shapeId = this.eraserTool.tryErase(target, this.stage, store);
    if (!shapeId) return;
    if (this.erasedInStroke.has(shapeId)) return;

    this.erasedInStroke.add(shapeId);
    store.deleteShape(shapeId);
  }

  private lastSweepTime = 0;

  private applySweepErase(pos: { x: number; y: number }): void {
    // Throttle to at most 60fps
    const now = performance.now();
    if (now - this.lastSweepTime < 16) return;
    this.lastSweepTime = now;

    const store = useCanvasStore.getState();
    const prev = this.lastEraserPos;
    this.lastEraserPos = pos;

    const result: SweepResult = this.eraserTool.sweepErase(pos, prev, store, this.erasedInStroke, store.eraserRadius);

    if (result.shapesToUpdate.length === 0 && result.shapesToCreate.length === 0 && result.shapesToDelete.length === 0) {
      return;
    }

    // Batch all store mutations — Yjs auto-syncs the entire batch
    store.batchApplySweepResult({
      shapesToUpdate: result.shapesToUpdate,
      shapesToCreate: result.shapesToCreate,
      shapesToDelete: result.shapesToDelete,
    });

    // Track deleted shapes in stroke
    for (const shapeId of result.shapesToDelete) {
      this.erasedInStroke.add(shapeId);
    }
  }

  cancelAll(): void {
    this.isDrawing = false;
    this.erasedInStroke.clear();
    this.brushTool.cancel();
    this.rectangleTool.cancel();
    this.circleTool.cancel();
    this.arrowTool.cancel();
    this.textTool.cancel();
    useCanvasStore.getState().setEditingTextId(null);
    this.selectTool.cancel();
    this.previewLayer?.destroyChildren();
    this.previewLayer?.batchDraw();
  }
}
