import { generateUUID } from '../utils/uuid';
import type Konva from 'konva';
import type { Shape, BrushShape, RectangleShape, CircleShape, ArrowShape, TextShape,
  RoundedRectShape, DiamondShape, ParallelogramShape, CylinderShape, DocumentShape,
  ConnectorShape, ShapeType } from '../types';
import { getEdgePoint } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export interface SweepResult {
  shapesToUpdate: Array<{ shapeId: string; points: number[] }>;
  shapesToCreate: Array<BrushShape>;
  shapesToDelete: string[];
}

type Segment = [number, number, number, number];

// ── 通用几何辅助函数 ──

/** 点 (px, py) 到圆 (cx, cy, r) 的距离判据 */
function pointInCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** AABB 矩形与圆碰撞：矩形上离圆心最近的点是否在圆内 */
function rectHitsCircle(x: number, y: number, w: number, h: number, cx: number, cy: number, r: number): boolean {
  const nearX = Math.max(x, Math.min(cx, x + w));
  const nearY = Math.max(y, Math.min(cy, y + h));
  return (cx - nearX) ** 2 + (cy - nearY) ** 2 <= r * r;
}

/** 线段 (x1,y1)→(x2,y2) 上最近点到 (px,py) 的距离是否 ≤ r */
function segmentNearPoint(
  x1: number, y1: number, x2: number, y2: number,
  px: number, py: number, r: number,
): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - x1) ** 2 + (py - y1) ** 2 <= r * r;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2 <= r * r;
}

/** 凸多边形（顶点顺时针）与圆碰撞：圆心在内部或任一边距离 < r */
function polygonHitsCircle(verts: Array<[number, number]>, cx: number, cy: number, r: number): boolean {
  let inside = true;
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    if ((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1) > 0) { inside = false; break; }
  }
  if (inside) return true;
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    if (segmentNearPoint(x1, y1, x2, y2, cx, cy, r)) return true;
  }
  return false;
}

/** 矩形四条边 → 线段列表 */
function rectToSegments(x: number, y: number, w: number, h: number): Segment[] {
  return [
    [x, y, x + w, y], [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h], [x, y + h, x, y],
  ];
}


// ── 图形擦除行为表（每种图形只定义一次） ──

interface ErasableDef {
  /** 碰撞检测：橡皮擦圆是否碰到此图形边界 */
  hits: (s: Shape, cx: number, cy: number, r: number, store: CanvasState) => boolean;
  /** 轮廓线段列表（null 表示"碰了就整删"，不拆线段） */
  contour: ((s: Shape) => Segment[]) | null;
}

const ERASABLE: Record<ShapeType, ErasableDef> = {
  brush: { hits: () => false, contour: null },  // brush 走 clipBrushStroke 特殊路径

  rectangle: {
    hits: (s, cx, cy, r) => {
      const { x, y, width, height } = s as RectangleShape;
      return rectHitsCircle(x, y, width, height, cx, cy, r);
    },
    contour: (s) => {
      const { x, y, width: w, height: h } = s as RectangleShape;
      return rectToSegments(x, y, w, h);
    },
  },

  circle: {
    hits: (s, cx, cy, r) => {
      const { x, y, radius } = s as CircleShape;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist > r + radius) return false;        // 不接触
      if (dist + r < radius) return false;         // 橡皮擦完全在圆内部，碰不到边界
      return true;                                 // 边界相交 或 橡皮擦覆盖整个圆
    },
    contour: (s) => {
      const { x, y, radius } = s as CircleShape;
      const N = 48;
      const segs: Segment[] = [];
      for (let i = 0; i < N; i++) {
        const a1 = (2 * Math.PI * i) / N, a2 = (2 * Math.PI * (i + 1)) / N;
        segs.push([x + radius * Math.cos(a1), y + radius * Math.sin(a1),
                   x + radius * Math.cos(a2), y + radius * Math.sin(a2)]);
      }
      return segs;
    },
  },

  arrow: {
    hits: (s, cx, cy, r) => {
      const pts = (s as ArrowShape).points;
      return pointInCircle(pts[0], pts[1], cx, cy, r)
          || pointInCircle(pts[2], pts[3], cx, cy, r)
          || segmentNearPoint(pts[0], pts[1], pts[2], pts[3], cx, cy, r);
    },
    contour: (s) => {
      const pts = (s as ArrowShape).points;
      return [[pts[0], pts[1], pts[2], pts[3]]];
    },
  },

  text: {
    hits: (s, cx, cy, r) => pointInCircle(cx, cy, (s as TextShape).x, (s as TextShape).y, r + 30),
    contour: null,
  },

  image: {
    hits: (s, cx, cy, r) => {
      const { x, y, width, height } = s as RectangleShape;
      return rectHitsCircle(x, y, width, height, cx, cy, r);
    },
    contour: null,
  },

  connector: {
    hits: (s, cx, cy, r, store) => {
      const sc = s as ConnectorShape;
      const fromS = store.shapes.find(sh => sh.id === sc.fromShapeId);
      const toS = store.shapes.find(sh => sh.id === sc.toShapeId);
      if (!fromS || !toS) return false;
      const from = getEdgePoint(fromS, sc.fromEdge);
      const to = getEdgePoint(toS, sc.toEdge);
      return segmentNearPoint(from.x, from.y, to.x, to.y, cx, cy, r);
    },
    contour: null,
  },

  roundedRect: {
    hits: (s, cx, cy, r) => {
      const { x, y, width, height } = s as RoundedRectShape;
      return rectHitsCircle(x, y, width, height, cx, cy, r);
    },
    contour: (s) => {
      const { x, y, width: w, height: h } = s as RoundedRectShape;
      return rectToSegments(x, y, w, h);
    },
  },

  diamond: {
    hits: (s, cx, cy, r) => {
      const { x, y, width: w, height: h } = s as DiamondShape;
      const dcx = x + w / 2, dcy = y + h / 2;
      return polygonHitsCircle([[dcx, y], [x + w, dcy], [dcx, y + h], [x, dcy]], cx, cy, r);
    },
    contour: (s) => {
      const { x, y, width: w, height: h } = s as DiamondShape;
      const dcx = x + w / 2, dcy = y + h / 2;
      return [[dcx, y, x + w, dcy], [x + w, dcy, dcx, y + h], [dcx, y + h, x, dcy], [x, dcy, dcx, y]];
    },
  },

  parallelogram: {
    hits: (s, cx, cy, r) => {
      const { x, y, width: w, height: h } = s as ParallelogramShape;
      const skew = (s as ParallelogramShape).skew ?? w * 0.2;
      return polygonHitsCircle([[x + skew, y], [x + w, y], [x + w - skew, y + h], [x, y + h]], cx, cy, r);
    },
    contour: (s) => {
      const { x, y, width: w, height: h } = s as ParallelogramShape;
      const skew = (s as ParallelogramShape).skew ?? w * 0.2;
      return [[x + skew, y, x + w, y], [x + w, y, x + w - skew, y + h],
              [x + w - skew, y + h, x, y + h], [x, y + h, x + skew, y]];
    },
  },

  cylinder: {
    hits: (s, cx, cy, r) => {
      const { x, y, width: w, height: h } = s as CylinderShape;
      return rectHitsCircle(x, y, w, h, cx, cy, r);
    },
    contour: (s) => {
      const { x, y, width: w, height: h } = s as CylinderShape;
      const arcH = Math.min(15, h * 0.2);
      const ecx = x + w / 2, erx = w / 2, ery = arcH;
      const N = 24;
      const segs: Segment[] = [];
      // 顶弧下半（左→右）
      for (let i = 0; i < N; i++) {
        const a1 = Math.PI - (Math.PI * i) / N, a2 = Math.PI - (Math.PI * (i + 1)) / N;
        segs.push([ecx + erx * Math.cos(a1), y + arcH + ery * Math.sin(a1),
                   ecx + erx * Math.cos(a2), y + arcH + ery * Math.sin(a2)]);
      }
      // 右边
      segs.push([x + w, y + arcH, x + w, y + h - arcH]);
      // 底弧上半（右→左）
      for (let i = 0; i < N; i++) {
        const a1 = (Math.PI * i) / N, a2 = (Math.PI * (i + 1)) / N;
        segs.push([ecx + erx * Math.cos(a1), y + h - arcH + ery * Math.sin(a1),
                   ecx + erx * Math.cos(a2), y + h - arcH + ery * Math.sin(a2)]);
      }
      // 左边
      segs.push([x, y + h - arcH, x, y + arcH]);
      return segs;
    },
  },

  document: {
    hits: (s, cx, cy, r) => {
      const { x, y, width: w, height: h } = s as DocumentShape;
      return rectHitsCircle(x, y, w, h, cx, cy, r);
    },
    contour: (s) => {
      const { x, y, width: w, height: h } = s as DocumentShape;
      const fold = (s as DocumentShape).foldSize ?? 20;
      return [
        [x, y, x + w - fold, y], [x + w - fold, y, x + w, y + fold],
        [x + w, y + fold, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y],
      ];
    },
  },
};


// ── 线段-圆裁剪（为 brush 和几何轮廓共用） ──

function circleLineIntersectionParams(
  x1: number, y1: number, x2: number, y2: number,
  cx: number, cy: number, r: number,
): number[] {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const D = b * b - 4 * a * c;
  if (D < 0) return [];
  if (D === 0) { const t = -b / (2 * a); return (t >= 0 && t <= 1) ? [t] : []; }
  const sqrtD = Math.sqrt(D);
  const results: number[] = [];
  const t1 = (-b - sqrtD) / (2 * a), t2 = (-b + sqrtD) / (2 * a);
  if (t1 >= 0 && t1 <= 1) results.push(t1);
  if (t2 >= 0 && t2 <= 1) results.push(t2);
  return results;
}

function clipSegmentToCircle(
  x1: number, y1: number, x2: number, y2: number,
  cx: number, cy: number, r: number,
): { portions: number[][]; hasIntersection: boolean } {
  const d1 = (x1 - cx) ** 2 + (y1 - cy) ** 2;
  const d2 = (x2 - cx) ** 2 + (y2 - cy) ** 2;
  const inside1 = d1 <= r * r, inside2 = d2 <= r * r;

  if (!inside1 && !inside2) {
    const tValues = circleLineIntersectionParams(x1, y1, x2, y2, cx, cy, r);
    if (tValues.length < 2) return { portions: [[x1, y1, x2, y2]], hasIntersection: false };
    const t1 = Math.min(...tValues), t2 = Math.max(...tValues);
    const portions: number[][] = [];
    if (t1 > 0) portions.push([x1, y1, x1 + t1 * (x2 - x1), y1 + t1 * (y2 - y1)]);
    if (t2 < 1) portions.push([x1 + t2 * (x2 - x1), y1 + t2 * (y2 - y1), x2, y2]);
    return { portions, hasIntersection: true };
  }
  if (inside1 && inside2) return { portions: [], hasIntersection: true };

  const tValues = circleLineIntersectionParams(x1, y1, x2, y2, cx, cy, r);
  if (tValues.length === 0) return { portions: [[x1, y1, x2, y2]], hasIntersection: false };
  const t = inside1 ? Math.max(...tValues) : Math.min(...tValues);
  if (t <= 0 || t >= 1) return { portions: [[x1, y1, x2, y2]], hasIntersection: false };
  if (inside1) return { portions: [[x1 + t * (x2 - x1), y1 + t * (y2 - y1), x2, y2]], hasIntersection: true };
  return { portions: [[x1, y1, x1 + t * (x2 - x1), y1 + t * (y2 - y1)]], hasIntersection: true };
}

function clipSegmentsToFragments(segments: Segment[], cx: number, cy: number, r: number): number[][] {
  const fragments: number[][] = [];
  let current: number[] = [];
  for (const [x1, y1, x2, y2] of segments) {
    const clipped = clipSegmentToCircle(x1, y1, x2, y2, cx, cy, r);
    for (const portion of clipped.portions) {
      if (current.length === 0) {
        current.push(...portion);
      } else {
        const lastX = current[current.length - 2], lastY = current[current.length - 1];
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

function clipBrushStroke(points: number[], cx: number, cy: number, r: number): number[][] | null {
  const n = points.length / 2;
  if (n < 2) return null;
  const outsidePortions: Array<number[][]> = [];
  let anyIntersection = false;
  for (let i = 0; i < n - 1; i++) {
    const clipped = clipSegmentToCircle(
      points[i * 2], points[i * 2 + 1], points[(i + 1) * 2], points[(i + 1) * 2 + 1], cx, cy, r);
    outsidePortions.push(clipped.portions);
    if (clipped.hasIntersection) anyIntersection = true;
  }
  if (!anyIntersection) return null;

  const fragments: number[][] = [];
  let currentFrag: number[] = [];
  for (const portions of outsidePortions) {
    for (const portion of portions) {
      if (currentFrag.length > 0) {
        const lastX = currentFrag[currentFrag.length - 2], lastY = currentFrag[currentFrag.length - 1];
        const gap = Math.sqrt((portion[0] - lastX) ** 2 + (portion[1] - lastY) ** 2);
        if (gap < 1e-6) { currentFrag.push(...portion.slice(2)); }
        else { if (currentFrag.length >= 4) fragments.push(currentFrag); currentFrag = [...portion]; }
      } else { currentFrag = [...portion]; }
    }
  }
  if (currentFrag.length >= 4) fragments.push(currentFrag);
  return fragments;
}


// ── EraserTool ──

export class EraserTool {

  onMouseDown(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {}
  onMouseMove(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {}
  onMouseUp(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): null { return null; }

  /** 单击删除：命中测试单个图形 */
  tryErase(target: Konva.Shape | Konva.Stage | null, stage: Konva.Stage | null, store: CanvasState): string | null {
    if (!target || !stage || target === stage) return null;
    const shapeId = target.attrs?.id as string | undefined;
    if (!shapeId) return null;
    const shape = store.shapes.find(s => s.id === shapeId);
    if (!shape || !this.canErase(shape, store.userId)) return null;
    if (shape.locked && shape.userId !== store.userId) return null;
    return shapeId;
  }

  /** 长按扫过精准裁剪 */
  sweepErase(
    pos: { x: number; y: number },
    prevPos: { x: number; y: number } | null,
    store: CanvasState,
    excludeIds: Set<string>,
    eraserRadius: number,
  ): SweepResult {
    const result: SweepResult = { shapesToUpdate: [], shapesToCreate: [], shapesToDelete: [] };

    // 路径插值：避免两次鼠标移动之间漏掉
    const centers: Array<{ x: number; y: number }> = [];
    if (prevPos) {
      const dx = pos.x - prevPos.x, dy = pos.y - prevPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(1, eraserRadius * 1.2);
      const steps = Math.ceil(dist / step);
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        centers.push({ x: prevPos.x + dx * t, y: prevPos.y + dy * t });
      }
    } else {
      centers.push(pos);
    }

    const brushesHit = new Set<string>();

    for (const center of centers) {
      for (const shape of store.shapes) {
        if (!this.canErase(shape, store.userId)) continue;
        if (shape.locked && shape.userId !== store.userId) continue;

        // brush 特殊路径：线段裁剪
        if (shape.type === 'brush') {
          if (brushesHit.has(shape.id)) continue;
          const fragments = clipBrushStroke(shape.points, center.x, center.y, eraserRadius);
          if (fragments === null) continue;
          brushesHit.add(shape.id);
          if (fragments.length === 0) {
            result.shapesToDelete.push(shape.id);
          } else {
            result.shapesToUpdate.push({ shapeId: shape.id, points: fragments[0] });
            for (let i = 1; i < fragments.length; i++) {
              result.shapesToCreate.push({
                ...shape, id: generateUUID(), type: 'brush' as const,
                points: fragments[i], createdAt: Date.now(), version: 1,
              });
            }
          }
          continue;
        }

        // 几何图形：统一走 ERASABLE 表
        const def = ERASABLE[shape.type];
        if (excludeIds.has(shape.id)) continue;
        if (!def.hits(shape, center.x, center.y, eraserRadius, store)) continue;
        excludeIds.add(shape.id);

        // contour = null → 碰了就整删
        if (def.contour === null) {
          result.shapesToDelete.push(shape.id);
          continue;
        }

        // 分解轮廓 → 线段裁剪 → 剩余片段转为 brush
        const segments = def.contour(shape);
        const remainingFragments = clipSegmentsToFragments(segments, center.x, center.y, eraserRadius);
        for (const frag of remainingFragments) {
          result.shapesToCreate.push({
            id: generateUUID(), type: 'brush' as const,
            userId: shape.userId, color: shape.color, strokeWidth: shape.strokeWidth,
            points: frag, createdAt: Date.now(), version: 1,
            ...(shape.groupId ? { groupId: shape.groupId } : {}),
          } as BrushShape);
        }
        result.shapesToDelete.push(shape.id);
      }
    }
    return result;
  }

  private canErase(shape: Shape, userId: string): boolean {
    return shape.userId === userId || !shape.userId;
  }
}
