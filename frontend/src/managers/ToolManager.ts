import { generateUUID } from '../utils/uuid';
import type Konva from 'konva';
import type { Shape } from '../types';
import { getEdgePoint } from '../types';
import { useCanvasStore, type CanvasState } from '../store/useCanvasStore';
import { sendMessage, getWs } from '../services/websocket';
import { BrushTool } from '../tools/BrushTool';
import { RectangleTool } from '../tools/RectangleTool';
import { CircleTool } from '../tools/CircleTool';
import { ArrowTool } from '../tools/ArrowTool';
import { TextTool } from '../tools/TextTool';
import { SelectTool } from '../tools/SelectTool';
import { EraserTool, type SweepResult } from '../tools/EraserTool';
import { RoundedRectTool } from '../tools/RoundedRectTool';
import { DiamondTool } from '../tools/DiamondTool';
import { ParallelogramTool } from '../tools/ParallelogramTool';
import { CylinderTool } from '../tools/CylinderTool';
import { DocumentTool } from '../tools/DocumentTool';
import { ConnectorTool } from '../tools/ConnectorTool';

function offsetPoints(points: number[], dx: number, dy: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push(points[i] + dx, points[i + 1] + dy);
  }
  return result;
}

export class ToolManager {

  private brushTool = new BrushTool();
  private rectangleTool = new RectangleTool();
  private circleTool = new CircleTool();
  private arrowTool = new ArrowTool();
  private textTool = new TextTool();
  private selectTool = new SelectTool();
  private eraserTool = new EraserTool();
  private roundedRectTool = new RoundedRectTool();
  private diamondTool = new DiamondTool();
  private parallelogramTool = new ParallelogramTool();
  private cylinderTool = new CylinderTool();
  private documentTool = new DocumentTool();
  private connectorTool = new ConnectorTool();

  private isDrawing = false;
  private erasedInStroke: Set<string> = new Set();
  private lastEraserPos: { x: number; y: number } | null = null;
  private previewLayer: Konva.Layer | null = null;
  private stage: Konva.Stage | null = null;

  setStage(stage: Konva.Stage | null): void {
    this.stage = stage;
  }

  setPreviewLayer(layer: Konva.Layer): void {
    this.previewLayer = layer;
  }

  /** 是否正在绘制连接线（供 WhiteboardCanvas 锚点层查询） */
  isConnecting(): boolean {
    return this.isDrawing && useCanvasStore.getState().activeTool === 'connector';
  }

  handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    try {
      const store = useCanvasStore.getState();
      const pos = this.getRelativePos(e);

      if (store.activeTool === 'select') {
        const target = e.target;
        const shiftKey = e.evt.shiftKey;
        if (target && target !== this.stage && target.attrs?.id) {
          const shapeId = target.attrs.id as string;
          const shape = store.shapes.find((s) => s.id === shapeId);
          if (shape) {
            if (shape.locked) return;
            if (shiftKey) {
              store.toggleSelect(shapeId);
            } else if (shape.groupId) {
              // 点击编组内图形始终选中整个编组
              store.selectGroup(shape.groupId);
            } else {
              // 如果图形已在选中列表中，保持多选状态
              const selIds = useCanvasStore.getState().selectedIds;
              if (!selIds.includes(shapeId)) {
                store.selectOnly(shapeId);
              }
            }
            const selIds2 = useCanvasStore.getState().selectedIds;
            this.selectTool.setDraggedShapes(
              store.shapes.filter((s) => selIds2.includes(s.id) && !s.locked)
            );
          }
        } else if (!shiftKey) {
          store.clearSelection();
          this.selectTool.setDraggedShapes([]);
        }
        this.selectTool.onMouseDown(pos, store, this.previewLayer!);
        return;
      }

      if (store.activeTool === 'eraser') {
        this.isDrawing = true;
        this.erasedInStroke.clear();
        this.lastEraserPos = pos;
        this.tryEraseAtTarget(e.target);
        return;
      }

      if (store.activeTool === 'connector') {
        // 检查是否点击了锚点
        const target = e.target;
        if (target && target !== this.stage) {
          const name = target.name() as string | undefined;
          if (name && name.startsWith('anchor-')) {
            // 解析 "anchor-{shapeId}-{edge}"
            const lastDash = name.lastIndexOf('-');
            const edge = name.slice(lastDash + 1) as 'top' | 'right' | 'bottom' | 'left';
            const shapeId = name.slice('anchor-'.length, lastDash);
            const shape = store.shapes.find((s) => s.id === shapeId);
            if (shape && shape.type !== 'connector') {
              store.clearSelection();
              this.isDrawing = true;
              const anchorPos = getEdgePoint(shape, edge);
              this.connectorTool.startDrag(shapeId, edge, anchorPos, store, this.previewLayer!);
            }
          }
        }
        return;
      }

      // Text tool: click anywhere → create new text and enter edit mode.
      // Existing text: hover shows dashed border, double-click enters edit (handled by Stage onDblClick).
      if (store.activeTool === 'text') {
        // 正在编辑中点击画布 → 先触发 textarea blur 保存文本，再关闭编辑器
        if (store.editingTextId) {
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        // Click on existing text → skip (handled by double-click)
        const target = e.target;
        if (target && target !== this.stage && target.attrs?.id) {
          const shape = store.shapes.find((s) => s.id === target.attrs.id as string);
          if (shape && shape.type === 'text') return;
        }
        // Empty area → create new text, immediately enter edit mode on mouseup
        store.clearSelection();
        this.isDrawing = true;
        this.textTool.onMouseDown(pos, store, this.previewLayer!);
        return;
      }

      store.clearSelection();
      this.isDrawing = true;
      this.getActiveDrawingTool()?.onMouseDown(pos, store, this.previewLayer!);
    } catch (err) {
      console.error('handleMouseDown error:', err);
      this.isDrawing = false;
    }
  }

  handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const store = useCanvasStore.getState();

    // Cursor position throttle is handled by sendMessage in websocket.ts
    const pos = this.getRelativePos(e);
    sendMessage(getWs(), 'cursor_move', { x: pos.x, y: pos.y }, store.userId);

    if (store.activeTool === 'select') {
      this.selectTool.onMouseMove(pos, store, this.previewLayer!);
      return;
    }

    if (store.activeTool === 'eraser') {
      if (this.isDrawing) {
        this.applySweepErase(pos);
      }
      return;
    }

    if (store.activeTool === 'connector') {
      if (this.isDrawing) {
        this.connectorTool.onMouseMove(pos, store, this.previewLayer!);
      }
      return;
    }

    if (!this.isDrawing) return;
    this.getActiveDrawingTool()?.onMouseMove(pos, store, this.previewLayer!);
  }

  handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>): void {
    try {
      const store = useCanvasStore.getState();
      const pos = this.getRelativePos(e);

      if (store.activeTool === 'select') {
        this.selectTool.onMouseUp(pos, store, this.previewLayer!);
        return;
      }

      if (store.activeTool === 'eraser') {
        this.erasedInStroke.clear();
        this.lastEraserPos = null;
        return;
      }

      if (store.activeTool === 'connector') {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        // 1. 先尝试精确锚点命中
        const connTarget = e.target;
        let targetShapeId: string | null = null;
        let targetEdge: 'top' | 'right' | 'bottom' | 'left' | null = null;
        if (connTarget && connTarget !== this.stage) {
          const name = connTarget.name() as string | undefined;
          if (name && name.startsWith('anchor-')) {
            const lastDash = name.lastIndexOf('-');
            targetEdge = name.slice(lastDash + 1) as 'top' | 'right' | 'bottom' | 'left';
            targetShapeId = name.slice('anchor-'.length, lastDash);
          }
        }
        // 2. 未命中锚点时执行接近搜索 (30px 吸附半径)
        if (!targetShapeId) {
          const snapResult = this.findClosestEdge(pos, store, 30);
          if (snapResult) {
            targetShapeId = snapResult.shapeId;
            targetEdge = snapResult.edge;
          }
        }
        const shape = this.connectorTool.onMouseUp(pos, store, this.previewLayer!, targetShapeId, targetEdge);
        if (shape) store.addShape(shape);
        return;
      }

      if (!this.isDrawing) return;

      const shape = this.getActiveDrawingTool()?.onMouseUp(pos, store, this.previewLayer!) ?? null;

      if (shape) {
        store.addShape(shape);
        // Text tool: immediately enter edit mode after creating text
        if (shape.type === 'text') {
          store.setEditingTextId(shape.id);
        }
      }
    } finally {
      this.isDrawing = false;
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    const store = useCanvasStore.getState();

    // 文本编辑期间忽略所有快捷键，防止按键触发工具切换/撤销等
    if (store.editingTextId) return;

    // Tool shortcuts
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+C — copy selected shape to clipboard
      if (e.key === 'c') {
        const selId = store.selectedIds[0];
        if (selId) {
          const shape = store.shapes.find((s) => s.id === selId);
          if (shape) store.setClipboard(structuredClone(shape));
        }
        return;
      }

      // Ctrl+V — paste shape from clipboard
      if (e.key === 'v') {
        e.preventDefault();
        if (store.clipboard) {
          const newShape: Shape = {
            ...structuredClone(store.clipboard),
            id: generateUUID(),
            createdAt: Date.now(),
            version: undefined,
          } as Shape;

          // Offset position for non-brush/arrow shapes
          if ('x' in newShape && 'y' in newShape) {
            (newShape as Shape & { x: number }).x += 20;
            (newShape as Shape & { y: number }).y += 20;
          }

          // Offset points for brush/arrow shapes
          if ('points' in newShape && Array.isArray(newShape.points)) {
            (newShape as Shape & { points: number[] }).points = offsetPoints(
              (newShape as Shape & { points: number[] }).points,
              20,
              20,
            );
          }

          store.addShape(newShape);
          store.setSelectedId(newShape.id);
        }
        return;
      }

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        store.redo();
        return;
      }

      // Ctrl+G — group selected shapes
      if (e.key === 'g') {
        e.preventDefault();
        if (store.selectedIds.length >= 2) {
          const groupId = generateUUID();
          for (const id of store.selectedIds) {
            store.updateShape(id, { groupId } as Partial<Shape>);
          }
          store.selectGroup(groupId);
        }
        return;
      }
      // Ctrl+Shift+G — ungroup
      if (e.key === 'G') {
        e.preventDefault();
        if (store.selectedIds.length > 0) {
          for (const id of store.selectedIds) {
            store.updateShape(id, { groupId: undefined } as unknown as Partial<Shape>);
          }
          store.clearSelection();
        }
        return;
      }
      // Ctrl+] — move shape to top
      if (e.key === ']') {
        e.preventDefault();
        const sel = store.selectedIds[0];
        if (sel) store.moveShapeTop(sel);
        return;
      }
      // Ctrl+[ — move shape to bottom
      if (e.key === '[') {
        e.preventDefault();
        const sel = store.selectedIds[0];
        if (sel) store.moveShapeBottom(sel);
        return;
      }

      // Ctrl+A — 全选
      if (e.key === 'a') {
        e.preventDefault();
        store.selectAll();
        return;
      }

      return;
    }

    switch (e.key.toLowerCase()) {
      case 'delete':
      case 'backspace':
        for (const id of store.selectedIds) {
          const shape = store.shapes.find((s) => s.id === id);
          if (shape && (shape.userId === store.userId || (!shape.userId && !shape.locked))) {
            store.deleteShape(id);
          }
        }
        break;
      case 'v': this.cancelAll(); store.setActiveTool('select'); break;
      case 'b': this.cancelAll(); store.setActiveTool('brush'); break;
      case 'r': this.cancelAll(); store.setActiveTool('rectangle'); break;
      case 'c': this.cancelAll(); store.setActiveTool('circle'); break;
      case 'a': this.cancelAll(); store.setActiveTool('arrow'); break;
      case 't': this.cancelAll(); store.setActiveTool('text'); break;
      case 'e': this.cancelAll(); store.setActiveTool('eraser'); break;
      case 'q': this.cancelAll(); store.setActiveTool('roundedRect'); break;
      case 'd': this.cancelAll(); store.setActiveTool('diamond'); break;
      case 'p': this.cancelAll(); store.setActiveTool('parallelogram'); break;
      case 'y': this.cancelAll(); store.setActiveTool('cylinder'); break;
      case 'f': this.cancelAll(); store.setActiveTool('document'); break;
      case 'x': this.cancelAll(); store.setActiveTool('connector'); break;
      case 'l':
        for (const id of store.selectedIds) {
          const shape = store.shapes.find((s) => s.id === id);
          if (shape && shape.userId === store.userId) {
            store.toggleLock(id);
          }
        }
        break;
      case 'escape':
        store.clearSelection();
        this.cancelAll();
        break;
      case ']':
        e.preventDefault();
        const upId = store.selectedIds[0];
        if (upId) store.moveShapeUp(upId);
        break;
      case '[':
        e.preventDefault();
        const downId = store.selectedIds[0];
        if (downId) store.moveShapeDown(downId);
        break;
    }
  }

  private getActiveDrawingTool() {
    const store = useCanvasStore.getState();
    switch (store.activeTool) {
      case 'brush': return this.brushTool;
      case 'rectangle': return this.rectangleTool;
      case 'circle': return this.circleTool;
      case 'arrow': return this.arrowTool;
      case 'text': return this.textTool;
      case 'roundedRect': return this.roundedRectTool;
      case 'diamond': return this.diamondTool;
      case 'parallelogram': return this.parallelogramTool;
      case 'cylinder': return this.cylinderTool;
      case 'document': return this.documentTool;
      default: return null;
    }
  }

  private getRelativePos(e: Konva.KonvaEventObject<MouseEvent>): { x: number; y: number } {
    if (!this.stage) return { x: 0, y: 0 };
    const transform = this.stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point({ x: e.evt.offsetX, y: e.evt.offsetY });
    return pos;
  }

  private tryEraseAtTarget(target: Konva.Shape | Konva.Stage | null): void {
    const store = useCanvasStore.getState();
    const shapeId = this.eraserTool.tryErase(target, this.stage, store);
    if (!shapeId) return;
    if (this.erasedInStroke.has(shapeId)) return;

    this.erasedInStroke.add(shapeId);
    store.deleteShape(shapeId);
  }

  private lastSweepTime = 0;

  private applySweepErase(pos: { x: number; y: number }): void {
    // Throttle to at most 60fps
    const now = performance.now();
    if (now - this.lastSweepTime < 16) return;
    this.lastSweepTime = now;

    const store = useCanvasStore.getState();
    const prev = this.lastEraserPos;
    this.lastEraserPos = pos;

    const result: SweepResult = this.eraserTool.sweepErase(pos, prev, store, this.erasedInStroke, store.eraserRadius);

    if (result.shapesToUpdate.length === 0 && result.shapesToCreate.length === 0 && result.shapesToDelete.length === 0) {
      return;
    }

    // 批量提交所有状态变更（一次 apply，随后由 store 统一触发同步/广播）
    store.batchApplySweepResult({
      shapesToUpdate: result.shapesToUpdate,
      shapesToCreate: result.shapesToCreate,
      shapesToDelete: result.shapesToDelete,
    });

    // Track deleted shapes in stroke
    for (const shapeId of result.shapesToDelete) {
      this.erasedInStroke.add(shapeId);
    }
  }

  /**
   * 在给定位置附近搜索最近的图形边缘锚点（连接线吸附）
   */
  private findClosestEdge(
    pos: { x: number; y: number },
    store: CanvasState,
    snapRadius: number,
  ): { shapeId: string; edge: 'top' | 'right' | 'bottom' | 'left' } | null {
    let bestDist = snapRadius;
    let best: { shapeId: string; edge: 'top' | 'right' | 'bottom' | 'left' } | null = null;
    const edges: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
    for (const s of store.shapes) {
      if (s.type === 'connector' || s.type === 'brush') continue;
      for (const edge of edges) {
        const pt = getEdgePoint(s, edge);
        const dx = pos.x - pt.x;
        const dy = pos.y - pt.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { shapeId: s.id, edge };
        }
      }
    }
    return best;
  }

  cancelAll(): void {
    this.isDrawing = false;
    this.erasedInStroke.clear();
    this.brushTool.cancel();
    this.rectangleTool.cancel();
    this.circleTool.cancel();
    this.arrowTool.cancel();
    this.textTool.cancel();
    this.roundedRectTool.cancel();
    this.diamondTool.cancel();
    this.parallelogramTool.cancel();
    this.cylinderTool.cancel();
    this.documentTool.cancel();
    this.connectorTool.cancel();
    useCanvasStore.getState().setEditingTextId(null);
    this.selectTool.cancel();
    this.previewLayer?.destroyChildren();
    this.previewLayer?.batchDraw();
  }
}
