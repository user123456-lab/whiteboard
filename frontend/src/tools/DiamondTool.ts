import Konva from 'konva';
import type { DiamondShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class DiamondTool {
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private previewLine: Konva.Line | null = null;

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDrawing = true;
    this.startX = pos.x;
    this.startY = pos.y;
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): void {
    if (!this.isDrawing) return;

    const x = Math.min(this.startX, pos.x);
    const y = Math.min(this.startY, pos.y);
    const w = Math.abs(pos.x - this.startX);
    const h = Math.abs(pos.y - this.startY);
    const cx = x + w / 2;
    const cy = y + h / 2;

    this.previewLine?.destroy();
    this.previewLine = new Konva.Line({
      points: [cx, y, x + w, cy, cx, y + h, x, cy],
      closed: true,
      stroke: store.toolColor,
      strokeWidth: store.toolWidth,
      fill: store.toolFill !== 'transparent' ? store.toolFill + '80' : 'transparent',
      dash: [6, 3],
    });
    layer.add(this.previewLine);
    layer.batchDraw();
  }

  onMouseUp(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): DiamondShape | null {
    this.isDrawing = false;
    this.previewLine?.destroy();
    this.previewLine = null;
    layer.batchDraw();

    const width = Math.abs(pos.x - this.startX);
    const height = Math.abs(pos.y - this.startY);
    if (width < 3 && height < 3) return null;

    return {
      id: crypto.randomUUID(),
      type: 'diamond',
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
    this.previewLine?.destroy();
    this.previewLine = null;
  }
}
