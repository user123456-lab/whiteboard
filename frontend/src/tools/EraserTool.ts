import type Konva from 'konva';
import type { Shape } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class EraserTool {
  onMouseDown(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    // Hit testing and deletion handled by ToolManager
  }

  onMouseMove(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {
    // continuous erasing handled by ToolManager via hit testing
  }

  onMouseUp(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): null {
    return null;
  }

  tryErase(
    target: Konva.Shape | Konva.Stage | null,
    stage: Konva.Stage | null,
    store: CanvasState
  ): string | null {
    if (!target || !stage || target === stage) return null;

    const shapeId = target.attrs?.id as string | undefined;
    if (!shapeId) return null;

    const shape: Shape | undefined = store.shapes.find((s) => s.id === shapeId);
    if (!shape) return null;

    // Ownership check: only creator can erase, or legacy shapes without userId
    if (shape.userId !== store.userId && shape.userId) return null;

    return shapeId;
  }
}
