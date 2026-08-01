import type Konva from 'konva';
import type { TextShape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class TextTool {
  onMouseDown(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    // no-op
  }

  onMouseMove(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    // no-op
  }

  onMouseUp(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): null {
    return null;
  }

  createText(x: number, y: number, text: string, store: CanvasState): TextShape {
    return {
      id: crypto.randomUUID(),
      type: 'text',
      userId: store.userId,
      x,
      y,
      text,
      fontSize: 18,
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      createdAt: Date.now(),
    };
  }
}
