import type Konva from 'konva';
import type { Shape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class SelectTool {
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private draggedShape: Shape | null = null;
  private currentX = 0;
  private currentY = 0;

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDragging = true;
    this.dragStartX = pos.x;
    this.dragStartY = pos.y;
    if (this.draggedShape && 'x' in this.draggedShape && 'y' in this.draggedShape) {
      const s = this.draggedShape as Shape & { x: number; y: number };
      this.currentX = s.x;
      this.currentY = s.y;
    }
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, _layer: Konva.Layer): void {
    if (!this.isDragging || !this.draggedShape) return;
    // Re-check lock in case remote user locked it mid-drag
    if (this.draggedShape.locked && this.draggedShape.userId !== store.userId) {
      this.isDragging = false;
      this.draggedShape = null;
      return;
    }

    const dx = pos.x - this.dragStartX;
    const dy = pos.y - this.dragStartY;
    this.currentX += dx;
    this.currentY += dy;

    if ('x' in this.draggedShape && 'y' in this.draggedShape) {
      store.updateShape(this.draggedShape.id, { x: this.currentX, y: this.currentY });
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
