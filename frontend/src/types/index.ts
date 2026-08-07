export type ToolType = 'select' | 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'eraser'
  | 'roundedRect' | 'diamond' | 'parallelogram' | 'cylinder' | 'document' | 'connector';

export type ShapeType = 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'image'
  | 'roundedRect' | 'diamond' | 'parallelogram' | 'cylinder' | 'document' | 'connector';

export interface BaseShape {
  id: string;
  type: ShapeType;
  userId: string;
  color: string;
  strokeWidth: number;
  createdAt: number;
  version?: number;
  locked?: boolean;
  fill?: string;
  groupId?: string;
}

export interface BrushShape extends BaseShape {
  type: 'brush';
  points: number[];
}

export interface RectangleShape extends BaseShape {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleShape extends BaseShape {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
}

export interface ArrowShape extends BaseShape {
  type: 'arrow';
  points: number[];
}

export interface TextShape extends BaseShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize?: number;
}

export interface ImageShape extends BaseShape {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  imageData: string;  // base64 data URL
}

export interface RoundedRectShape extends BaseShape {
  type: 'roundedRect';
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
}

export interface DiamondShape extends BaseShape {
  type: 'diamond';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParallelogramShape extends BaseShape {
  type: 'parallelogram';
  x: number;
  y: number;
  width: number;
  height: number;
  skew?: number;
}

export interface CylinderShape extends BaseShape {
  type: 'cylinder';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentShape extends BaseShape {
  type: 'document';
  x: number;
  y: number;
  width: number;
  height: number;
  foldSize?: number;
}

export type ConnectorEdge = 'top' | 'right' | 'bottom' | 'left';

export interface ConnectorShape extends BaseShape {
  type: 'connector';
  fromShapeId: string;
  toShapeId: string;
  fromEdge: ConnectorEdge;
  toEdge: ConnectorEdge;
  endArrow?: boolean;
}

export type Shape = BrushShape | RectangleShape | CircleShape | ArrowShape | TextShape | ImageShape
  | RoundedRectShape | DiamondShape | ParallelogramShape | CylinderShape | DocumentShape | ConnectorShape;

export interface UserInfo {
  userId: string;
  userName: string;
  color: string;
}

export interface CursorPosition {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
}

export interface HistoryEntry {
  id: string;
  shapeId: string;
  shapeType: ShapeType;
  action: 'created' | 'updated' | 'deleted';
  userId: string;
  timestamp: number;
  label: string;
}

export interface WSMessage {
  type: string;
  userId: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

/** 计算图形指定边的中点坐标（世界坐标系） */
export function getEdgePoint(shape: Shape, edge: string): { x: number; y: number } {
  if ('x' in shape && 'y' in shape) {
    const s = shape as Shape & { x: number; y: number };
    let w = 0, h = 0;
    if ('width' in s && 'height' in s) { w = (s as Shape & { width: number }).width; h = (s as Shape & { height: number }).height; }
    else if (shape.type === 'circle' && 'radius' in shape) { const r = (shape as Shape & { radius: number }).radius; w = r * 2; h = r * 2; }
    else if (shape.type === 'text') { w = (shape as Shape & { text: string; fontSize?: number }).text.length * ((shape as Shape & { fontSize?: number }).fontSize ?? 18) * 0.6; h = ((shape as Shape & { fontSize?: number }).fontSize ?? 18) * 1.4; }
    if (shape.type === 'circle') {
      // circle: (x, y) 是圆心，使用半径计算边缘点
      switch (edge) {
        case 'top': return { x: s.x, y: s.y - h / 2 };
        case 'bottom': return { x: s.x, y: s.y + h / 2 };
        case 'left': return { x: s.x - w / 2, y: s.y };
        case 'right': return { x: s.x + w / 2, y: s.y };
      }
    }
    const cx = s.x + w / 2;
    const cy = s.y + h / 2;
    switch (edge) {
      case 'top': return { x: cx, y: s.y };
      case 'bottom': return { x: cx, y: s.y + h };
      case 'left': return { x: s.x, y: cy };
      case 'right': return { x: s.x + w, y: cy };
    }
  }
  // brush/arrow: 用线段中点作为近似
  if ((shape.type === 'brush' || shape.type === 'arrow') && 'points' in shape) {
    const pts = (shape as Shape & { points: number[] }).points;
    if (pts.length >= 4) return { x: (pts[0] + pts[2]) / 2, y: (pts[1] + pts[3]) / 2 };
    if (pts.length >= 2) return { x: pts[0], y: pts[1] };
  }
  return { x: 0, y: 0 };
}
