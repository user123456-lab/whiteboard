import Konva from 'konva';
import type { ArrowShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class ArrowTool {
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private previewLine: Konva.Arrow | null = null;

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDrawing = true;
    this.startX = pos.x;
    this.startY = pos.y;
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): void {
    if (!this.isDrawing) return;

    this.previewLine?.destroy();
    this.previewLine = new Konva.Arrow({
      points: [this.startX, this.startY, pos.x, pos.y],
      stroke: store.toolColor,
      strokeWidth: store.toolWidth,
      lineCap: 'round',
      pointerLength: 10,
      pointerWidth: 8,
      fill: store.toolColor,
      dash: [6, 3],
    });
    layer.add(this.previewLine);
    layer.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): ArrowShape | null {
    this.isDrawing = false;
    this.previewLine?.destroy();
    this.previewLine = null;
    layer.batchDraw();

    const dx = pos.x - this.startX;
    const dy = pos.y - this.startY;
    if (Math.sqrt(dx * dx + dy * dy) < 5) return null;

    return {
      id: crypto.randomUUID(),
      type: 'arrow',
      userId: store.userId,
      points: [this.startX, this.startY, pos.x, pos.y],
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      createdAt: Date.now(),
    };
  }

  cancel(): void {
    this.isDrawing = false;
    this.previewLine?.destroy();
    this.previewLine = null;
  }
}
