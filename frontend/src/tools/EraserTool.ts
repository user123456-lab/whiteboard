import type Konva from 'konva';
import type { Shape, BrushShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export interface SweepResult {
  shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
  shapesToDelete: string[];
}

export class EraserTool {
  readonly eraserRadius = 15;

  onMouseDown(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    // Handled by ToolManager
  }

  onMouseMove(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    // Handled by ToolManager
  }

  onMouseUp(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): null {
    return null;
  }

  /** Click-to-delete: hit test a single shape and return its id if erasable */
  tryErase(
    target: Konva.Shape | Konva.Stage | null,
    stage: Konva.Stage | null,
    store: CanvasState
  ): string | null {
    if (!target || !stage || target === stage) return null;
    const shapeId = target.attrs?.id as string | undefined;
    if (!shapeId) return null;
    const shape = store.shapes.find((s) => s.id === shapeId);
    if (!shape) return null;
    if (!this.canErase(shape, store.userId)) return null;
    return shapeId;
  }

  /** Long-press sweep: find shapes intersected by the eraser circle */
  sweepErase(pos: { x: number; y: number }, store: CanvasState, excludeIds: Set<string>): SweepResult {
    const result: SweepResult = { shapesToUpdate: [], shapesToDelete: [] };

    for (const shape of store.shapes) {
      if (!this.canErase(shape, store.userId)) continue;

      if (shape.type === 'brush') {
        if (excludeIds.has(shape.id)) continue;
        const newPoints = this.eraseBrushPoints(shape.points, pos.x, pos.y);
        if (newPoints === null) continue;
        if (newPoints.length < 4) {
          result.shapesToDelete.push(shape.id);
        } else {
          result.shapesToUpdate.push({ shapeId: shape.id, points: newPoints });
        }
      } else if (!excludeIds.has(shape.id) && this.isGeometricShapeIntersected(shape, pos.x, pos.y)) {
        result.shapesToDelete.push(shape.id);
      }
    }

    return result;
  }

  private canErase(shape: Shape, userId: string): boolean {
    return shape.userId === userId || !shape.userId;
  }

  private eraseBrushPoints(points: number[], ex: number, ey: number): number[] | null {
    const result: number[] = [];
    let anyRemoved = false;

    for (let i = 0; i < points.length; i += 2) {
      const px = points[i];
      const py = points[i + 1];
      const dist = Math.sqrt((px - ex) ** 2 + (py - ey) ** 2);
      if (dist <= this.eraserRadius) {
        anyRemoved = true;
      } else {
        result.push(px, py);
      }
    }

    return anyRemoved ? result : null;
  }

  private isGeometricShapeIntersected(shape: Shape, ex: number, ey: number): boolean {
    const r = this.eraserRadius;

    switch (shape.type) {
      case 'rectangle': {
        const rx = shape.x;
        const ry = shape.y;
        const rw = shape.width;
        const rh = shape.height;
        // Closest point on rect to eraser center
        const cx = Math.max(rx, Math.min(ex, rx + rw));
        const cy = Math.max(ry, Math.min(ey, ry + rh));
        return (ex - cx) ** 2 + (ey - cy) ** 2 <= r * r;
      }
      case 'circle': {
        const dist = Math.sqrt((ex - shape.x) ** 2 + (ey - shape.y) ** 2);
        return dist <= r + shape.radius;
      }
      case 'arrow': {
        const [ax1, ay1, ax2, ay2] = shape.points;
        const d1 = Math.sqrt((ex - ax1) ** 2 + (ey - ay1) ** 2);
        const d2 = Math.sqrt((ex - ax2) ** 2 + (ey - ay2) ** 2);
        return d1 <= r || d2 <= r || this.pointToSegmentDist(ex, ey, ax1, ay1, ax2, ay2) <= r;
      }
      case 'text': {
        const dist = Math.sqrt((ex - shape.x) ** 2 + (ey - shape.y) ** 2);
        return dist <= r + 30; // approximate text bounds
      }
      default:
        return false;
    }
  }

  private pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nearX = x1 + t * dx;
    const nearY = y1 + t * dy;
    return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
  }
}
