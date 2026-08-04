import type Konva from 'konva';
import type { Shape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

interface DragEntry {
  shape: Shape;
  startX: number;
  startY: number;
}

export class SelectTool {
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private draggedShapes: DragEntry[] = [];

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDragging = true;
    this.dragStartX = pos.x;
    this.dragStartY = pos.y;
    // Capture start positions for all dragged shapes
    for (const entry of this.draggedShapes) {
      const s = entry.shape;
      if ('x' in s && 'y' in s) {
        entry.startX = (s as Shape & { x: number }).x;
        entry.startY = (s as Shape & { y: number }).y;
      }
    }
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, _layer: Konva.Layer): void {
    if (!this.isDragging || this.draggedShapes.length === 0) return;

    const dx = pos.x - this.dragStartX;
    const dy = pos.y - this.dragStartY;

    for (const entry of this.draggedShapes) {
      // Re-check lock
      const latest = store.shapes.find(s => s.id === entry.shape.id);
      if (!latest || (latest.locked && latest.userId !== store.userId)) continue;

      if ('x' in latest && 'y' in latest) {
        store.updateShape(latest.id, {
          x: entry.startX + dx,
          y: entry.startY + dy,
        });
      }
    }
  }

  onMouseUp(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): null {
    this.isDragging = false;
    return null;
  }

  setDraggedShape(shape: Shape | null): void {
    this.draggedShapes = shape ? [{ shape, startX: 0, startY: 0 }] : [];
  }

  setDraggedShapes(shapes: Shape[]): void {
    this.draggedShapes = shapes.map(s => ({ shape: s, startX: 0, startY: 0 }));
  }

  cancel(): void {
    this.isDragging = false;
    this.draggedShapes = [];
  }
}
