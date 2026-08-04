import Konva from 'konva';
import type { RectangleShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class RectangleTool {
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private previewRect: Konva.Rect | null = null;

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDrawing = true;
    this.startX = pos.x;
    this.startY = pos.y;
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): void {
    if (!this.isDrawing) return;

    const x = Math.min(this.startX, pos.x);
    const y = Math.min(this.startY, pos.y);
    const width = Math.abs(pos.x - this.startX);
    const height = Math.abs(pos.y - this.startY);

    this.previewRect?.destroy();
    this.previewRect = new Konva.Rect({
      x,
      y,
      width,
      height,
      stroke: store.toolColor,
      strokeWidth: store.toolWidth,
      fill: store.toolFill !== 'transparent' ? store.toolFill + '80' : 'transparent',
      dash: [6, 3],
    });
    layer.add(this.previewRect);
    layer.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): RectangleShape | null {
    this.isDrawing = false;
    this.previewRect?.destroy();
    this.previewRect = null;
    layer.batchDraw();

    const width = Math.abs(pos.x - this.startX);
    const height = Math.abs(pos.y - this.startY);
    if (width < 3 && height < 3) return null;

    return {
      id: crypto.randomUUID(),
      type: 'rectangle',
      userId: store.userId,
      x: Math.min(this.startX, pos.x),
      y: Math.min(this.startY, pos.y),
      width,
      height,
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      fill: store.toolFill !== 'transparent' ? store.toolFill : undefined,
      version: 1,
      createdAt: Date.now(),
    };
  }

  cancel(): void {
    this.isDrawing = false;
    this.previewRect?.destroy();
    this.previewRect = null;
  }
}
