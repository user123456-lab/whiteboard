import { generateUUID } from '../utils/uuid';
import type Konva from 'konva';
import type { Shape, BrushShape } from '../types';
import { getEdgePoint } from '../types';
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
    if (shape.locked && shape.userId !== store.userId) return null;
    return shapeId;
  }

  /**
   * Long-press sweep:
   * - Brush strokes: clip segments at circle intersection points, only remove portions inside the circle
   * - Geometric shapes: delete entirely if intersected by eraser circle
   */
  sweepErase(
    pos: { x: number; y: number },
    prevPos: { x: number; y: number } | null,
    store: CanvasState,
    excludeIds: Set<string>,
    eraserRadius: number
  ): SweepResult {
    const result: SweepResult = { shapesToUpdate: [], shapesToCreate: [], shapesToDelete: [] };

    // Build eraser-circle centers along the path from prevPos to pos
    const centers: Array<{ x: number; y: number }> = [];
    if (prevPos) {
      const dx = pos.x - prevPos.x;
      const dy = pos.y - prevPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(1, eraserRadius * 1.2);
      const steps = Math.ceil(dist / step);
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        centers.push({
          x: prevPos.x + dx * t,
          y: prevPos.y + dy * t,
        });
      }
    } else {
      centers.push(pos);
    }

    // Dedup brush hits within this single sweepErase call only.
    // Brushes must be re-processable across mousemove events since
    // each mousemove clips different portions.  Geometric shapes
    // continue using cross-mousemove excludeIds (once deleted, done).
    const brushesHitThisCall = new Set<string>();

    for (const center of centers) {
      for (const shape of store.shapes) {
        if (!this.canErase(shape, store.userId)) continue;
        if (shape.locked && shape.userId !== store.userId) continue;

        if (shape.type === 'brush') {
          if (brushesHitThisCall.has(shape.id)) continue;

          const fragments = this.clipBrushStroke(shape.points, center, eraserRadius);

          if (fragments === null) continue; // no intersection at all

          brushesHitThisCall.add(shape.id);

          if (fragments.length === 0) {
            result.shapesToDelete.push(shape.id);
          } else {
            result.shapesToUpdate.push({ shapeId: shape.id, points: fragments[0] });
            for (let i = 1; i < fragments.length; i++) {
              result.shapesToCreate.push({
                ...shape,
                id: generateUUID(),
                type: 'brush' as const,
                points: fragments[i],
                createdAt: Date.now(),
                version: 1,
              });
            }
          }
        } else if (shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'arrow' || shape.type === 'text'
            || shape.type === 'roundedRect' || shape.type === 'diamond' || shape.type === 'parallelogram'
            || shape.type === 'cylinder' || shape.type === 'document' || shape.type === 'connector') {
          if (excludeIds.has(shape.id)) continue;

          // Connector: 单线段，整条删除
          if (shape.type === 'connector') {
            if (!this.connectorIntersectsCircle(shape, center.x, center.y, eraserRadius, store)) continue;
            excludeIds.add(shape.id);
            result.shapesToDelete.push(shape.id);
            continue;
          }

          if (!this.shapeIntersectsCircle(shape, center.x, center.y, eraserRadius)) continue;
          excludeIds.add(shape.id);

          // Text: whole-delete only
          if (shape.type === 'text') {
            result.shapesToDelete.push(shape.id);
            continue;
          }

          // Decompose geometric outline into line segments for partial erase
          const segments: Array<[number, number, number, number]> = [];
          if (shape.type === 'rectangle') {
            const r = shape;
            segments.push(
              [r.x, r.y, r.x + r.width, r.y],
              [r.x + r.width, r.y, r.x + r.width, r.y + r.height],
              [r.x + r.width, r.y + r.height, r.x, r.y + r.height],
              [r.x, r.y + r.height, r.x, r.y],
            );
          } else if (shape.type === 'circle') {
            const c = shape;
            const N = 48;
            for (let i = 0; i < N; i++) {
              const a1 = (2 * Math.PI * i) / N;
              const a2 = (2 * Math.PI * (i + 1)) / N;
              segments.push([
                c.x + c.radius * Math.cos(a1), c.y + c.radius * Math.sin(a1),
                c.x + c.radius * Math.cos(a2), c.y + c.radius * Math.sin(a2),
              ]);
            }
          } else if (shape.type === 'arrow') {
            const a = shape;
            segments.push([a.points[0], a.points[1], a.points[2], a.points[3]]);
          } else if (shape.type === 'roundedRect') {
            const r = shape as Shape & { x: number; y: number; width: number; height: number };
            segments.push(
              [r.x, r.y, r.x + r.width, r.y],
              [r.x + r.width, r.y, r.x + r.width, r.y + r.height],
              [r.x + r.width, r.y + r.height, r.x, r.y + r.height],
              [r.x, r.y + r.height, r.x, r.y],
            );
          } else if (shape.type === 'diamond') {
            const d = shape as Shape & { x: number; y: number; width: number; height: number };
            const dcx = d.x + d.width / 2;
            const dcy = d.y + d.height / 2;
            segments.push(
              [dcx, d.y, d.x + d.width, dcy],
              [d.x + d.width, dcy, dcx, d.y + d.height],
              [dcx, d.y + d.height, d.x, dcy],
              [d.x, dcy, dcx, d.y],
            );
          } else if (shape.type === 'parallelogram') {
            const p = shape as Shape & { x: number; y: number; width: number; height: number; skew?: number };
            const pskew = p.skew ?? p.width * 0.2;
            segments.push(
              [p.x + pskew, p.y, p.x + p.width, p.y],
              [p.x + p.width, p.y, p.x + p.width - pskew, p.y + p.height],
              [p.x + p.width - pskew, p.y + p.height, p.x, p.y + p.height],
              [p.x, p.y + p.height, p.x + pskew, p.y],
            );
          } else if (shape.type === 'cylinder') {
            const c = shape as Shape & { x: number; y: number; width: number; height: number };
            const arcH = Math.min(15, c.height * 0.2);
            const ecx = c.x + c.width / 2;
            const erx = c.width / 2;
            const ery = arcH;
            const N = 24;
            // 顶部椭圆 — 可见下半弧: π → 0 逆时针（经过 π/2 底部）
            for (let i = 0; i < N; i++) {
              const a1 = Math.PI - (Math.PI * i) / N;
              const a2 = Math.PI - (Math.PI * (i + 1)) / N;
              segments.push([
                ecx + erx * Math.cos(a1), c.y + arcH + ery * Math.sin(a1),
                ecx + erx * Math.cos(a2), c.y + arcH + ery * Math.sin(a2),
              ]);
            }
            // 右侧竖边
            segments.push([c.x + c.width, c.y + arcH, c.x + c.width, c.y + c.height - arcH]);
            // 底部椭圆 — 可见下半弧: 0 → π 顺时针（经过 π/2 底部）
            for (let i = 0; i < N; i++) {
              const a1 = (Math.PI * i) / N;
              const a2 = (Math.PI * (i + 1)) / N;
              segments.push([
                ecx + erx * Math.cos(a1), c.y + c.height - arcH + ery * Math.sin(a1),
                ecx + erx * Math.cos(a2), c.y + c.height - arcH + ery * Math.sin(a2),
              ]);
            }
          } else if (shape.type === 'document') {
            const doc = shape as Shape & { x: number; y: number; width: number; height: number; foldSize?: number };
            const dfold = doc.foldSize ?? 20;
            segments.push(
              [doc.x, doc.y, doc.x + doc.width - dfold, doc.y],
              [doc.x + doc.width - dfold, doc.y, doc.x + doc.width, doc.y + dfold],
              [doc.x + doc.width, doc.y + dfold, doc.x + doc.width, doc.y + doc.height],
              [doc.x + doc.width, doc.y + doc.height, doc.x, doc.y + doc.height],
              [doc.x, doc.y + doc.height, doc.x, doc.y],
            );
          }

          const remainingFragments = this.clipSegmentsToFragments(segments, center, eraserRadius);
          for (const frag of remainingFragments) {
            result.shapesToCreate.push({
              id: generateUUID(),
              type: 'brush' as const,
              userId: shape.userId,
              color: shape.color,
              strokeWidth: shape.strokeWidth,
              points: frag,
              createdAt: Date.now(),
              version: 1,
              ...(shape.groupId ? { groupId: shape.groupId } : {}),
            } as BrushShape);
          }
          result.shapesToDelete.push(shape.id);
        }
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

          if (gap < 1e-6) {
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
      case 'roundedRect':
      case 'cylinder':
      case 'document': {
        const s = shape as Shape & { x: number; y: number; width: number; height: number };
        const cx = Math.max(s.x, Math.min(ex, s.x + s.width));
        const cy = Math.max(s.y, Math.min(ey, s.y + s.height));
        return (ex - cx) ** 2 + (ey - cy) ** 2 <= r * r;
      }
      case 'diamond': {
        const d = shape as Shape & { x: number; y: number; width: number; height: number };
        const dcx = d.x + d.width / 2;
        const dcy = d.y + d.height / 2;
        return this.polygonIntersectsCircle([
          [dcx, d.y], [d.x + d.width, dcy],
          [dcx, d.y + d.height], [d.x, dcy],
        ], ex, ey, r);
      }
      case 'parallelogram': {
        const p = shape as Shape & { x: number; y: number; width: number; height: number; skew?: number };
        const pskew = p.skew ?? p.width * 0.2;
        return this.polygonIntersectsCircle([
          [p.x + pskew, p.y], [p.x + p.width, p.y],
          [p.x + p.width - pskew, p.y + p.height], [p.x, p.y + p.height],
        ], ex, ey, r);
      }
      default:
        return false;
    }
  }

  /**
   * Clip multiple line segments against a circle.
   * Returns disconnected outside fragments separately (like clipBrushStroke).
   */
  private clipSegmentsToFragments(
    segments: Array<[number, number, number, number]>,
    center: { x: number; y: number },
    radius: number
  ): number[][] {
    const fragments: number[][] = [];
    let current: number[] = [];

    for (const [x1, y1, x2, y2] of segments) {
      const clipped = this.clipSegmentToCircle(x1, y1, x2, y2, center.x, center.y, radius);
      for (const portion of clipped.portions) {
        if (current.length === 0) {
          current.push(...portion);
        } else {
          const lastX = current[current.length - 2];
          const lastY = current[current.length - 1];
          if (Math.abs(lastX - portion[0]) < 1e-6 && Math.abs(lastY - portion[1]) < 1e-6) {
            current.push(...portion.slice(2));
          } else {
            if (current.length >= 4) fragments.push(current);
            current = [...portion];
          }
        }
      }
    }
    if (current.length >= 4) fragments.push(current);
    return fragments;
  }

  /** 检查连接线是否与橡皮擦圆相交 */
  private connectorIntersectsCircle(
    shape: Shape & { fromShapeId: string; toShapeId: string; fromEdge: string; toEdge: string },
    cx: number, cy: number, r: number,
    store: CanvasState
  ): boolean {
    const fromShape = store.shapes.find((s) => s.id === shape.fromShapeId);
    const toShape = store.shapes.find((s) => s.id === shape.toShapeId);
    if (!fromShape || !toShape) return false;
    const from = getEdgePoint(fromShape, shape.fromEdge);
    const to = getEdgePoint(toShape, shape.toEdge);
    // 最近点在线段上
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return false;
    let t = ((cx - from.x) * dx + (cy - from.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nx = from.x + t * dx;
    const ny = from.y + t * dy;
    return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
  }

  private canErase(shape: Shape, userId: string): boolean {
    return shape.userId === userId || !shape.userId;
  }

  /** 检查圆与凸多边形的碰撞：圆心在内部或任一边距离 < r */
  private polygonIntersectsCircle(
    vertices: Array<[number, number]>,
    cx: number, cy: number, r: number
  ): boolean {
    // 1. 圆心在凸多边形内部（叉积法，顶点顺时针排列）
    let inside = true;
    for (let i = 0; i < vertices.length; i++) {
      const [x1, y1] = vertices[i];
      const [x2, y2] = vertices[(i + 1) % vertices.length];
      if ((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1) > 0) {
        inside = false;
        break;
      }
    }
    if (inside) return true;

    // 2. 圆心到各边的最近点距离 < r
    for (let i = 0; i < vertices.length; i++) {
      const [x1, y1] = vertices[i];
      const [x2, y2] = vertices[(i + 1) % vertices.length];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const nearX = x1 + t * dx;
      const nearY = y1 + t * dy;
      if ((cx - nearX) ** 2 + (cy - nearY) ** 2 <= r * r) return true;
    }

    return false;
  }
}
