import { generateUUID } from '../utils/uuid';
import type Konva from 'konva';
import type { TextShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class TextTool {
  private isPlacing = false;

  onMouseDown(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    this.isPlacing = true;
  }

  onMouseMove(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    // no-op
  }

  onMouseUp(pos: { x: number; y: number }, store: CanvasState, _layer: Konva.Layer): TextShape | null {
    if (!this.isPlacing) return null;
    this.isPlacing = false;
    return this.createText(pos.x, pos.y, 'Text', store);
  }

  createText(x: number, y: number, text: string, store: CanvasState): TextShape {
    return {
      id: generateUUID(),
      type: 'text',
      userId: store.userId,
      x,
      y,
      text,
      fontSize: store.toolFontSize ?? 18,
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      version: 1,
      createdAt: Date.now(),
    };
  }

  cancel(): void {
    this.isPlacing = false;
  }
}
