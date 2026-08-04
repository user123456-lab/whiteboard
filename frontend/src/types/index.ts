export type ToolType = 'select' | 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'eraser';

export type ShapeType = 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'image';

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

export type Shape = BrushShape | RectangleShape | CircleShape | ArrowShape | TextShape | ImageShape;

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
