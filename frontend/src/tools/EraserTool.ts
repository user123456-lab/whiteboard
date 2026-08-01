import type Konva from 'konva';
import type { Shape, BrushShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export interface SweepResult {
  shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
  shapesToCreate: Array<BrushShape>;
  shapesToDelete: string[];
}

export class EraserTool {

  onMouseDown(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {}
  onMouseMove(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {}
  onMouseUp(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): null { return null; }

  /** Click-to-delete: hit test a single shape */
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

  /**
   * Long-press sweep: cut brush strokes where the eraser circle intersects them.
   * Uses segment-to-circle distance to split brush strokes into fragments.
   */
  sweepErase(
    pos: { x: number; y: number },
    _prevPos: { x: number; y: number } | null,
    store: CanvasState,
    excludeIds: Set<string>,
    eraserRadius: number
  ): SweepResult {
    const result: SweepResult = { shapesToUpdate: [], shapesToCreate: [], shapesToDelete: [] };

    for (const shape of store.shapes) {
      if (!this.canErase(shape, store.userId)) continue;

      if (shape.type === 'brush') {
        if (excludeIds.has(shape.id)) continue;

        const fragments = this.cutBrushStroke(shape.points, pos, eraserRadius);

        if (fragments === null) continue;

        if (fragments.length === 0) {
          result.shapesToDelete.push(shape.id);
        } else {
          result.shapesToUpdate.push({ shapeId: shape.id, points: fragments[0] });
          for (let i = 1; i < fragments.length; i++) {
            result.shapesToCreate.push({
              ...shape,
              id: crypto.randomUUID(),
              points: fragments[i],
              createdAt: Date.now(),
            });
          }
        }
      }
      // Geometric shapes: only deleted on click, not on sweep
    }

    return result;
  }

  /**
   * Cut a brush stroke where segments intersect the eraser circle.
   * Returns array of point arrays (fragments), null if no intersection, empty if fully erased.
   */
  private cutBrushStroke(
    points: number[],
    pos: { x: number; y: number },
    radius: number
  ): number[][] | null {
    const n = points.length / 2;
    if (n < 2) return null;

    const keep: boolean[] = new Array(n - 1).fill(true);
    let anyCut = false;

    for (let i = 0; i < n - 1; i++) {
      const x1 = points[i * 2];
      const y1 = points[i * 2 + 1];
      const x2 = points[(i + 1) * 2];
      const y2 = points[(i + 1) * 2 + 1];

      if (this.segmentIntersectsCircle(x1, y1, x2, y2, pos.x, pos.y, radius)) {
        keep[i] = false;
        anyCut = true;
      }
    }

    if (!anyCut) return null;

    const fragments: number[][] = [];
    let currentFrag: number[] = [points[0], points[1]];

    for (let i = 0; i < n - 1; i++) {
      if (keep[i]) {
        currentFrag.push(points[(i + 1) * 2], points[(i + 1) * 2 + 1]);
      } else {
        if (currentFrag.length >= 4) {
          fragments.push(currentFrag);
        }
        currentFrag = [points[(i + 1) * 2], points[(i + 1) * 2 + 1]];
      }
    }

    if (currentFrag.length >= 4) {
      fragments.push(currentFrag);
    }

    return fragments;
  }

  /** Check if line segment (x1,y1)→(x2,y2) intersects a circle at (cx,cy) with given radius */
  private segmentIntersectsCircle(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    r: number
  ): boolean {
    // Check endpoints
    if ((x1 - cx) ** 2 + (y1 - cy) ** 2 <= r * r) return true;
    if ((x2 - cx) ** 2 + (y2 - cy) ** 2 <= r * r) return true;

    // Check closest point on segment
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return false;

    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nearX = x1 + t * dx;
    const nearY = y1 + t * dy;

    return (cx - nearX) ** 2 + (cy - nearY) ** 2 <= r * r;
  }

  private canErase(shape: Shape, userId: string): boolean {
    return shape.userId === userId || !shape.userId;
  }
}
