import { generateUUID } from '../utils/uuid';
import Konva from 'konva';
import type { CircleShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class CircleTool {
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private previewCircle: Konva.Circle | null = null;

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDrawing = true;
    this.startX = pos.x;
    this.startY = pos.y;
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): void {
    if (!this.isDrawing) return;

    const radius = Math.sqrt((pos.x - this.startX) ** 2 + (pos.y - this.startY) ** 2);

    this.previewCircle?.destroy();
    this.previewCircle = new Konva.Circle({
      x: this.startX,
      y: this.startY,
      radius,
      stroke: store.toolColor,
      strokeWidth: store.toolWidth,
      fill: store.toolFill !== 'transparent' ? store.toolFill + '80' : 'transparent',
      dash: [6, 3],
    });
    layer.add(this.previewCircle);
    layer.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): CircleShape | null {
    this.isDrawing = false;
    this.previewCircle?.destroy();
    this.previewCircle = null;
    layer.batchDraw();

    const radius = Math.sqrt((pos.x - this.startX) ** 2 + (pos.y - this.startY) ** 2);
    if (radius < 2) return null;

    return {
      id: generateUUID(),
      type: 'circle',
      userId: store.userId,
      x: this.startX,
      y: this.startY,
      radius,
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      fill: store.toolFill !== 'transparent' ? store.toolFill : undefined,
      version: 1,
      createdAt: Date.now(),
    };
  }

  cancel(): void {
    this.isDrawing = false;
    this.previewCircle?.destroy();
    this.previewCircle = null;
  }
}
