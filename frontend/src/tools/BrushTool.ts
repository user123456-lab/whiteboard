import { generateUUID } from '../utils/uuid';
import type { BrushShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class BrushTool {
  private isDrawing = false;
  private points: number[] = [];
  private currentShapeId: string | null = null;

  onMouseDown(pos: { x: number; y: number }, store: CanvasState, _layer: unknown): void {
    this.isDrawing = true;
    this.points = [pos.x, pos.y];
    // 立即创建图形到 Shape Layer，实现实时同步
    const shape: BrushShape = {
      id: generateUUID(),
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

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, _layer: unknown): void {
    if (!this.isDrawing) return;
    this.points.push(pos.x, pos.y);
    // 图形已创建到 Shape Layer，持续更新 points 即可实时渲染到画布
    if (this.currentShapeId) {
      store.updateShape(this.currentShapeId, { points: [...this.points] });
    }
  }

  onMouseUp(_pos: { x: number; y: number }, store: CanvasState, _layer: unknown): BrushShape | null {
    this.isDrawing = false;
    if (this.points.length < 4) {
      // 点数太少（只有起点没有移动），删除已创建的图形
      if (this.currentShapeId) store.deleteShape(this.currentShapeId);
      this.points = [];
      this.currentShapeId = null;
      return null;
    }
    // 图形已在 onMouseDown 创建并持续更新，不需要重复添加
    this.points = [];
    this.currentShapeId = null;
    return null;
  }

  cancel(): void {
    this.isDrawing = false;
    this.points = [];
    this.currentShapeId = null;
  }
}
