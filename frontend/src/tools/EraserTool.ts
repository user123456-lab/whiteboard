import type Konva from 'konva';
import type { Shape, BrushShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export interface SweepResult {
  shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
  shapesToCreate: Array<BrushShape>;
  shapesToDelete: string[];
}

export class EraserTool {
  readonly eraserRadius = 15;

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
    prevPos: { x: number; y: number } | null,
    store: CanvasState,
    excludeIds: Set<string>
  ): SweepResult {
    const result: SweepResult = { shapesToUpdate: [], shapesToCreate: [], shapesToDelete: [] };

    for (const shape of store.shapes) {
      if (!this.canErase(shape, store.userId)) continue;

      if (shape.type === 'brush') {
        if (excludeIds.has(shape.id)) continue;

        const fragments = this.cutBrushStroke(
          shape.points, pos, prevPos, this.eraserRadius, shape
        );

        if (fragments === null) continue; // no intersection

        if (fragments.length === 0) {
          result.shapesToDelete.push(shape.id);
        } else {
          // First fragment keeps original shapeId
          result.shapesToUpdate.push({ shapeId: shape.id, points: fragments[0] });
          // Additional fragments become new shapes
          for (let i = 1; i < fragments.length; i++) {
            result.shapesToCreate.push({
              ...shape,
              id: crypto.randomUUID(),
              points: fragments[i],
              createdAt: Date.now(),
            });
          }
        }
      } else if (!excludeIds.has(shape.id) && this.isGeometricShapeIntersected(shape, pos.x, pos.y)) {
        result.shapesToDelete.push(shape.id);
      }
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
    prevPos: { x: number; y: number } | null,
    radius: number,
    _shape: Shape
  ): number[][] | null {
    const n = points.length / 2;
    if (n < 2) return null;

    // keep[i] = segment i→i+1 should be preserved (not cut)
    const keep: boolean[] = new Array(n - 1).fill(true);
    let anyCut = false;

    // Check each segment against the eraser circle at current position
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

    // Also check against the sweep path from prevPos to pos
    if (prevPos && !anyCut) {
      const samples = 4;
      for (let s = 1; s <= samples; s++) {
        const t = s / (samples + 1);
        const sx = prevPos.x + (pos.x - prevPos.x) * t;
        const sy = prevPos.y + (pos.y - prevPos.y) * t;

        for (let i = 0; i < n - 1; i++) {
          if (!keep[i]) continue;
          const x1 = points[i * 2];
          const y1 = points[i * 2 + 1];
          const x2 = points[(i + 1) * 2];
          const y2 = points[(i + 1) * 2 + 1];

          if (this.segmentIntersectsCircle(x1, y1, x2, y2, sx, sy, radius)) {
            keep[i] = false;
            anyCut = true;
          }
        }
      }
    }

    if (!anyCut) return null;

    // Build connected fragments across non-cut segments
    const fragments: number[][] = [];
    let currentFrag: number[] = [points[0], points[1]];

    for (let i = 0; i < n - 1; i++) {
      if (keep[i]) {
        // Segment preserved: add endpoint to current fragment
        currentFrag.push(points[(i + 1) * 2], points[(i + 1) * 2 + 1]);
      } else {
        // Segment cut: finalize current fragment and start new one
        if (currentFrag.length >= 4) {
          fragments.push(currentFrag);
        }
        currentFrag = [points[(i + 1) * 2], points[(i + 1) * 2 + 1]];
      }
    }

    // Final fragment
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

  private isGeometricShapeIntersected(shape: Shape, ex: number, ey: number): boolean {
    const r = this.eraserRadius;
    switch (shape.type) {
      case 'rectangle': {
        const cx = Math.max(shape.x, Math.min(ex, shape.x + shape.width));
        const cy = Math.max(shape.y, Math.min(ey, shape.y + shape.height));
        return (ex - cx) ** 2 + (ey - cy) ** 2 <= r * r;
      }
      case 'circle': {
        const dist = Math.sqrt((ex - shape.x) ** 2 + (ey - shape.y) ** 2);
        return dist <= r + shape.radius;
      }
      case 'arrow': {
        const [ax1, ay1, ax2, ay2] = shape.points;
        return (ex - ax1) ** 2 + (ey - ay1) ** 2 <= r * r
          || (ex - ax2) ** 2 + (ey - ay2) ** 2 <= r * r
          || this.pointToSegmentDist(ex, ey, ax1, ay1, ax2, ay2) <= r;
      }
      case 'text': {
        return (ex - shape.x) ** 2 + (ey - shape.y) ** 2 <= (r + 30) ** 2;
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
    return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
  }
}
