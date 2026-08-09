import Konva from 'konva';
import type { BrushShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class BrushTool {
  private isDrawing = false;
  private points: number[] = [];
  private previewLine: Konva.Line | null = null;
  private currentShapeId: string | null = null;

  onMouseDown(pos: { x: number; y: number }, store: CanvasState, _layer: Konva.Layer): void {
    this.isDrawing = true;
    this.points = [pos.x, pos.y];
    // 立即创建图形到 store，实现实时同步
    const shape: BrushShape = {
      id: crypto.randomUUID(),
      type: 'brush',
      userId: store.userId,
      points: [pos.x, pos.y],
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      version: 1,
      createdAt: Date.now(),
    };
    this.currentShapeId = shape.id;
    store.addShape(shape);
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
    // 实时更新 store 中的图形，触发 Yjs 同步到对端
    if (this.currentShapeId) {
      store.updateShape(this.currentShapeId, { points: [...this.points] });
    }
  }

  onMouseUp(_pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): BrushShape | null {
    this.isDrawing = false;
    this.previewLine?.destroy();
    this.previewLine = null;
    layer.batchDraw();

    if (this.points.length < 4) {
      // 点数太少，删除已创建的图形
      if (this.currentShapeId) store.deleteShape(this.currentShapeId);
      this.points = [];
      this.currentShapeId = null;
      return null;
    }

    // 图形已在 onMouseDown 创建并持续更新，此处返回 null 避免重复添加
    this.points = [];
    this.currentShapeId = null;
    return null;
  }

  cancel(): void {
    this.isDrawing = false;
    this.points = [];
    this.previewLine?.destroy();
    this.previewLine = null;
    this.currentShapeId = null;
  }
}
