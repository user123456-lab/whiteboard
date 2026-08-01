import type Konva from 'konva';
import type { Shape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class SelectTool {
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private draggedShape: Shape | null = null;

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDragging = true;
    this.dragStartX = pos.x;
    this.dragStartY = pos.y;
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, _layer: Konva.Layer): void {
    if (!this.isDragging || !this.draggedShape) return;

    const dx = pos.x - this.dragStartX;
    const dy = pos.y - this.dragStartY;

    if ('x' in this.draggedShape && 'y' in this.draggedShape) {
      const shape = this.draggedShape as Shape & { x: number; y: number };
      store.updateShape(shape.id, { x: shape.x + dx, y: shape.y + dy });
    }

    this.dragStartX = pos.x;
    this.dragStartY = pos.y;
  }

  onMouseUp(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): null {
    this.isDragging = false;
    this.draggedShape = null;
    return null;
  }

  setDraggedShape(shape: Shape | null): void {
    this.draggedShape = shape;
  }

  cancel(): void {
    this.isDragging = false;
    this.draggedShape = null;
  }
}
