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
    const store = useCanvasStore.getState();
    const pos = this.getRelativePos(e);

    if (store.activeTool === 'select') {
      // Hit test shapes
      const target = e.target;
      if (target && target !== this.stage && target.attrs?.id) {
        const shapeId = target.attrs.id as string;
        const shape = store.shapes.find((s) => s.id === shapeId);
        if (shape) {
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

    store.setSelectedId(null);
    this.isDrawing = true;
    this.getActiveDrawingTool()?.onMouseDown(pos, store, this.previewLayer!);
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
    const store = useCanvasStore.getState();
    const pos = this.getRelativePos(e);

    if (store.activeTool === 'select') {
      const shape = store.shapes.find((s) => s.id === store.selectedId);
      if (shape) {
        sendMessage(getWs(), 'shape_updated', {
          shapeId: shape.id,
          changes: { x: (shape as Shape & { x: number }).x, y: (shape as Shape & { y: number }).y },
        }, store.userId);
      }
      this.selectTool.onMouseUp(pos, store, this.previewLayer!);
      return;
    }

    if (store.activeTool === 'eraser') {
      this.isDrawing = false;
      this.erasedInStroke.clear();
      this.lastEraserPos = null;
      return;
    }

    if (!this.isDrawing) return;
    this.isDrawing = false;

    let shape: Shape | null = null;

    if (store.activeTool === 'text') {
      const text = window.prompt('Enter text:');
      if (text) {
        shape = this.textTool.createText(pos.x, pos.y, text, store);
      }
    } else {
      shape = this.getActiveDrawingTool()?.onMouseUp(pos, store, this.previewLayer!) ?? null;
    }

    if (shape) {
      store.addShape(shape);
      sendMessage(getWs(), 'shape_created', { shape }, store.userId);
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    const store = useCanvasStore.getState();

    // Tool shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const shapeId = store.undoOwn(store.userId);
        if (shapeId) {
          sendMessage(getWs(), 'shape_deleted', { shapeId }, store.userId);
        }
        return;
      }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'delete':
      case 'backspace':
        if (store.selectedId) {
          const shape = store.shapes.find((s) => s.id === store.selectedId);
          if (shape && (shape.userId === store.userId || !shape.userId)) {
            store.deleteShape(shape.id);
            sendMessage(getWs(), 'shape_deleted', { shapeId: shape.id }, store.userId);
          }
        }
        break;
      case 'v': store.setActiveTool('select'); break;
      case 'b': store.setActiveTool('brush'); break;
      case 'r': store.setActiveTool('rectangle'); break;
      case 'c': store.setActiveTool('circle'); break;
      case 'a': store.setActiveTool('arrow'); break;
      case 't': store.setActiveTool('text'); break;
      case 'e': store.setActiveTool('eraser'); break;
      case 'escape':
        store.setSelectedId(null);
        this.cancelAll();
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
    sendMessage(getWs(), 'shape_deleted', { shapeId }, store.userId);
  }

  private applySweepErase(pos: { x: number; y: number }): void {
    const store = useCanvasStore.getState();
    const prev = this.lastEraserPos;
    this.lastEraserPos = pos;

    const result: SweepResult = this.eraserTool.sweepErase(pos, prev, store, this.erasedInStroke, store.eraserRadius);

    for (const upd of result.shapesToUpdate) {
      store.updateShape(upd.shapeId, { points: upd.points });
      sendMessage(getWs(), 'shape_updated', {
        shapeId: upd.shapeId,
        changes: { points: upd.points },
      }, store.userId);
    }

    for (const newShape of result.shapesToCreate) {
      store.addShape(newShape);
      sendMessage(getWs(), 'shape_created', { shape: newShape }, store.userId);
    }

    for (const shapeId of result.shapesToDelete) {
      if (this.erasedInStroke.has(shapeId)) continue;
      this.erasedInStroke.add(shapeId);
      store.deleteShape(shapeId);
      sendMessage(getWs(), 'shape_deleted', { shapeId }, store.userId);
    }
  }

  cancelAll(): void {
    this.isDrawing = false;
    this.erasedInStroke.clear();
    this.brushTool.cancel();
    this.rectangleTool.cancel();
    this.circleTool.cancel();
    this.arrowTool.cancel();
    this.selectTool.cancel();
    this.previewLayer?.destroyChildren();
    this.previewLayer?.batchDraw();
  }
}
