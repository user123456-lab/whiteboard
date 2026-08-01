export type ToolType = 'select' | 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text';

export type ShapeType = 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text';

export interface BaseShape {
  id: string;
  type: ShapeType;
  userId: string;
  color: string;
  strokeWidth: number;
  createdAt: number;
  version?: number;
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

export type Shape = BrushShape | RectangleShape | CircleShape | ArrowShape | TextShape;

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

export interface WSMessage {
  type: string;
  userId: string;
  timestamp: number;
  payload: Record<string, unknown>;
}
