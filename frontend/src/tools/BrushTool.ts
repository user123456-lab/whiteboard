import Konva from 'konva';
import type { BrushShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class BrushTool {
  private isDrawing = false;
  private points: number[] = [];
  private previewLine: Konva.Line | null = null;

  onMouseDown(pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isDrawing = true;
    this.points = [pos.x, pos.y];
  }

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): void {
    if (!this.isDrawing) return;

    this.points.push(pos.x, pos.y);

    this.previewLine?.destroy();
    this.previewLine = new Konva.Line({
      points: this.points,
      stroke: store.toolColor,
      strokeWidth: store.toolWidth,
      tension: 0.5,
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation: 'source-over',
    });
    layer.add(this.previewLine);
    layer.batchDraw();
  }

  onMouseUp(_pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): BrushShape | null {
    this.isDrawing = false;
    this.previewLine?.destroy();
    this.previewLine = null;
    layer.batchDraw();

    if (this.points.length < 4) {
      this.points = [];
      return null;
    }

    const shape: BrushShape = {
      id: crypto.randomUUID(),
      type: 'brush',
      userId: store.userId,
      points: [...this.points],
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      version: 1,
      createdAt: Date.now(),
    };

    this.points = [];
    return shape;
  }

  cancel(): void {
    this.isDrawing = false;
    this.points = [];
    this.previewLine?.destroy();
    this.previewLine = null;
  }
}
