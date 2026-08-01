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
   * Long-press sweep:
   * - Brush strokes: clip segments at circle intersection points, only remove portions inside the circle
   * - Geometric shapes: delete entirely if intersected by eraser circle
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

        const fragments = this.clipBrushStroke(shape.points, pos, eraserRadius);

        if (fragments === null) continue; // no intersection at all

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
      } else if (!excludeIds.has(shape.id) && this.shapeIntersectsCircle(shape, pos.x, pos.y, eraserRadius)) {
        result.shapesToDelete.push(shape.id);
      }
    }

    return result;
  }

  /**
   * Clip a brush stroke: for each segment, compute circle-line intersection points.
   * Keep portions OUTSIDE the circle, discard portions INSIDE.
   * Returns array of outside point arrays (fragments), null if no intersection, empty if fully inside.
   */
  private clipBrushStroke(
    points: number[],
    pos: { x: number; y: number },
    radius: number
  ): number[][] | null {
    const n = points.length / 2;
    if (n < 2) return null;

    // For each segment, collect the "outside" portions
    // Each portion is an array of points
    const outsidePortions: Array<number[][]> = []; // per segment
    let anyIntersection = false;

    for (let i = 0; i < n - 1; i++) {
      const x1 = points[i * 2];
      const y1 = points[i * 2 + 1];
      const x2 = points[(i + 1) * 2];
      const y2 = points[(i + 1) * 2 + 1];

      const clipped = this.clipSegmentToCircle(x1, y1, x2, y2, pos.x, pos.y, radius);
      outsidePortions.push(clipped.portions);

      if (clipped.hasIntersection) {
        anyIntersection = true;
      }
    }

    if (!anyIntersection) return null;

    // Stitch adjacent outside portions into connected fragments
    const fragments: number[][] = [];
    let currentFrag: number[] = [];

    for (let i = 0; i < outsidePortions.length; i++) {
      const portions = outsidePortions[i];

      for (const portion of portions) {
        if (currentFrag.length > 0) {
          // Check if this portion connects to the end of currentFrag
          const lastX = currentFrag[currentFrag.length - 2];
          const lastY = currentFrag[currentFrag.length - 1];
          const firstX = portion[0];
          const firstY = portion[1];
          const gap = Math.sqrt((firstX - lastX) ** 2 + (firstY - lastY) ** 2);

          if (gap < radius * 0.5) {
            // Continuous: append
            currentFrag.push(...portion.slice(2));
          } else {
            // Gap: finalize current and start new
            if (currentFrag.length >= 4) fragments.push(currentFrag);
            currentFrag = [...portion];
          }
        } else {
          currentFrag = [...portion];
        }
      }
    }

    if (currentFrag.length >= 4) fragments.push(currentFrag);

    return fragments;
  }

  /**
   * Clip a single line segment against a circle.
   * Returns the portions that are OUTSIDE the circle.
   */
  private clipSegmentToCircle(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    r: number
  ): { portions: number[][]; hasIntersection: boolean } {
    const d1 = (x1 - cx) ** 2 + (y1 - cy) ** 2;
    const d2 = (x2 - cx) ** 2 + (y2 - cy) ** 2;
    const inside1 = d1 <= r * r;
    const inside2 = d2 <= r * r;

    // Both outside, no intersection → keep entire segment
    if (!inside1 && !inside2) {
      const tValues = this.circleLineIntersectionParams(x1, y1, x2, y2, cx, cy, r);
      if (tValues.length < 2) {
        return { portions: [[x1, y1, x2, y2]], hasIntersection: false };
      }
      // Segment passes through circle: outside1 → inside → outside2
      const t1 = Math.min(...tValues);
      const t2 = Math.max(...tValues);
      const portions: number[][] = [];
      if (t1 > 0) {
        portions.push([x1, y1, x1 + t1 * (x2 - x1), y1 + t1 * (y2 - y1)]);
      }
      if (t2 < 1) {
        portions.push([x1 + t2 * (x2 - x1), y1 + t2 * (y2 - y1), x2, y2]);
      }
      return { portions, hasIntersection: true };
    }

    // Both inside → no outside portion
    if (inside1 && inside2) {
      return { portions: [], hasIntersection: true };
    }

    // One inside, one outside
    const tValues = this.circleLineIntersectionParams(x1, y1, x2, y2, cx, cy, r);
    if (tValues.length === 0) {
      return { portions: [[x1, y1, x2, y2]], hasIntersection: false };
    }

    const t = inside1 ? Math.max(...tValues) : Math.min(...tValues);
    if (t <= 0 || t >= 1) {
      return { portions: [[x1, y1, x2, y2]], hasIntersection: false };
    }

    if (inside1) {
      return { portions: [[x1 + t * (x2 - x1), y1 + t * (y2 - y1), x2, y2]], hasIntersection: true };
    } else {
      return { portions: [[x1, y1, x1 + t * (x2 - x1), y1 + t * (y2 - y1)]], hasIntersection: true };
    }
  }

  /** Solve quadratic for circle-line intersection, returns t values in [0,1] */
  private circleLineIntersectionParams(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    r: number
  ): number[] {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;

    const a = dx * dx + dy * dy;
    if (a < 1e-12) return []; // degenerate

    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const D = b * b - 4 * a * c;

    if (D < 0) return [];
    if (D === 0) {
      const t = -b / (2 * a);
      return (t >= 0 && t <= 1) ? [t] : [];
    }

    const sqrtD = Math.sqrt(D);
    const results: number[] = [];
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    if (t1 >= 0 && t1 <= 1) results.push(t1);
    if (t2 >= 0 && t2 <= 1) results.push(t2);
    return results;
  }

  /** Check if a geometric shape intersects the eraser circle */
  private shapeIntersectsCircle(shape: Shape, ex: number, ey: number, r: number): boolean {
    switch (shape.type) {
      case 'rectangle': {
        const rx = shape.x;
        const ry = shape.y;
        const rw = shape.width;
        const rh = shape.height;
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
        if ((ex - ax1) ** 2 + (ey - ay1) ** 2 <= r * r) return true;
        if ((ex - ax2) ** 2 + (ey - ay2) ** 2 <= r * r) return true;
        // Closest point on arrow segment
        const dx = ax2 - ax1;
        const dy = ay2 - ay1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return false;
        let t = ((ex - ax1) * dx + (ey - ay1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const nearX = ax1 + t * dx;
        const nearY = ay1 + t * dy;
        return (ex - nearX) ** 2 + (ey - nearY) ** 2 <= r * r;
      }
      case 'text': {
        return (ex - shape.x) ** 2 + (ey - shape.y) ** 2 <= (r + 30) ** 2;
      }
      default:
        return false;
    }
  }

  private canErase(shape: Shape, userId: string): boolean {
    return shape.userId === userId || !shape.userId;
  }
}
