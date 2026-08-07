import Konva from 'konva';
import type { ConnectorShape, ConnectorEdge } from '../types';
import type { CanvasState } from '../store/useCanvasStore';

export class ConnectorTool {
  private isDragging = false;
  private fromShapeId = '';
  private fromEdge: ConnectorEdge = 'top';
  private anchorX = 0;
  private anchorY = 0;
  private previewLine: Konva.Line | null = null;

  get dragging(): boolean {
    return this.isDragging;
  }

  get sourceShapeId(): string {
    return this.fromShapeId;
  }

  startDrag(shapeId: string, edge: ConnectorEdge, anchorPos: { x: number; y: number }, _store: CanvasState, layer: Konva.Layer): void {
    this.isDragging = true;
    this.fromShapeId = shapeId;
    this.fromEdge = edge;
    this.anchorX = anchorPos.x;
    this.anchorY = anchorPos.y;
    this.previewLine?.destroy();
    this.previewLine = null;
    layer.batchDraw();
  }

  onMouseDown(_pos: { x: number; y: number }, _store: CanvasState, _layer: Konva.Layer): void {}

  onMouseMove(pos: { x: number; y: number }, store: CanvasState, layer: Konva.Layer): void {
    if (!this.isDragging) return;

    this.previewLine?.destroy();
    this.previewLine = new Konva.Line({
      points: [this.anchorX, this.anchorY, pos.x, pos.y],
      stroke: store.toolColor,
      strokeWidth: store.toolWidth,
      dash: [6, 3],
      lineCap: 'round',
      listening: false,
    });
    layer.add(this.previewLine);
    layer.batchDraw();
  }

  onMouseUp(
    pos: { x: number; y: number },
    store: CanvasState,
    layer: Konva.Layer,
    targetShapeId: string | null,
    targetEdge: ConnectorEdge | null
  ): ConnectorShape | null {
    this.isDragging = false;
    this.previewLine?.destroy();
    this.previewLine = null;
    layer.batchDraw();

    // 必须释放到目标图形的锚点上
    if (!targetShapeId || !targetEdge) return null;
    // 不能连接自身
    if (targetShapeId === this.fromShapeId) return null;
    // 最小距离检查
    const dx = pos.x - this.anchorX;
    const dy = pos.y - this.anchorY;
    if (Math.sqrt(dx * dx + dy * dy) < 10) return null;

    return {
      id: crypto.randomUUID(),
      type: 'connector',
      userId: store.userId,
      fromShapeId: this.fromShapeId,
      toShapeId: targetShapeId,
      fromEdge: this.fromEdge,
      toEdge: targetEdge,
      endArrow: true,
      color: store.toolColor,
      strokeWidth: store.toolWidth,
      fill: undefined,
      version: 1,
      createdAt: Date.now(),
    };
  }

  cancel(): void {
    this.isDragging = false;
    this.fromShapeId = '';
    this.previewLine?.destroy();
    this.previewLine = null;
  }
}
