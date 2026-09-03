import { generateUUID } from '../utils/uuid';
import { useRef, useEffect, useCallback, useState } from 'react';
import { Stage, Layer, Circle, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useCanvasStore } from '../store/useCanvasStore';
import { ToolManager } from '../managers/ToolManager';
import { CursorOverlay } from './CursorOverlay';
import { TextEditor } from './TextEditor';
import { GridBackground } from './GridBackground';
import type { Shape, ImageShape } from '../types';
import { getEdgePoint } from '../types';
import { ShapeRenderer } from './ShapeRenderer';

const toolManager = new ToolManager();

function buildEraserCursor(radius: number): string {
  const size = Math.max(24, radius * 2 + 8);
  const cx = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<circle cx="${cx}" cy="${cx}" r="${radius}" fill="none" stroke="white" stroke-width="1.5" opacity="0.9"/>`
    + `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${cx} ${cx}, crosshair`;
}

export function WhiteboardCanvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const previewLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const shapes = useCanvasStore((s) => s.shapes);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const eraserRadius = useCanvasStore((s) => s.eraserRadius);
  const stageScale = useCanvasStore((s) => s.stageScale);
  const stageX = useCanvasStore((s) => s.stageX);
  const stageY = useCanvasStore((s) => s.stageY);
  const editingTextId = useCanvasStore((s) => s.editingTextId);
  const exportCounter = useCanvasStore((s) => s.exportCounter);

  useEffect(() => {
    if (editingTextId) {
      setHoveredTextId(null);
    }
  }, [editingTextId]);

  useEffect(() => {
    if (editingTextId && !shapes.find((s) => s.id === editingTextId)) {
      useCanvasStore.getState().setEditingTextId(null);
    }
  }, [shapes, editingTextId]);

  useEffect(() => {
    if (exportCounter > 0 && stageRef.current) {
      const dataURL = stageRef.current.toDataURL({ mimeType: 'image/png', pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `whiteboard-${Date.now()}.png`;
      link.href = dataURL;
      link.click();
    }
  }, [exportCounter]);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, stageX: 0, stageY: 0 });
  const wheelAccumRef = useRef(0);
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredTextId, _setHoveredTextId] = useState<string | null>(null);
  const hoveredTextIdRef = useRef<string | null>(null);
  const setHoveredTextId = (id: string | null) => {
    hoveredTextIdRef.current = id;
    _setHoveredTextId(id);
  };
  const [hoveredConnectorShapeId, _setHoveredConnectorShapeId] = useState<string | null>(null);
  const hoveredConnectorShapeIdRef = useRef<string | null>(null);
  const setHoveredConnectorShapeId = (id: string | null) => {
    if (hoveredConnectorShapeIdRef.current !== id) {
      hoveredConnectorShapeIdRef.current = id;
      _setHoveredConnectorShapeId(id);
    }
  };
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const stage = stageRef.current;
    if (stage) {
      toolManager.setStage(stage);
    }
  }, []);

  useEffect(() => {
    if (previewLayerRef.current) {
      toolManager.setPreviewLayer(previewLayerRef.current);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => toolManager.handleKeyDown(e);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleResize = () => setStageSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleWindowMouseUp = (e: MouseEvent) => {
      if (isPanningRef.current && e.button === 1) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
      if (e.button === 0) {
        // 正在编辑文本时不调用 cancelAll，避免清除 editingTextId 导致编辑器消失
        if (!useCanvasStore.getState().editingTextId) {
          toolManager.cancelAll();
        }
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  useEffect(() => {
    if (transformerRef.current && selectedIds.length > 0) {
      const stage = stageRef.current;
      if (!stage) return;
      const nodes = selectedIds
        .map((id) => stage.findOne('#' + id))
        .filter((n): n is Konva.Shape => {
          if (!n) return false;
          const s = shapes.find((sh) => sh.id === n.id());
          if (!s) return false;
          // 连接线和锁定图形不附加 Transformer
          if (s.type === 'connector' || s.locked) return false;
          return true;
        });
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedIds, shapes]);

  // Drag-and-drop image files onto the canvas
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const stage = stageRef.current;
          if (!stage) return;
          const maxWidth = 400;
          const scale = Math.min(1, maxWidth / img.width);
          const w = img.width * scale;
          const h = img.height * scale;
          const center = stage.getPointerPosition() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          const transform = stage.getAbsoluteTransform().copy().invert();
          const pos = transform.point(center);
          const store = useCanvasStore.getState();
          const newShape: ImageShape = {
            id: generateUUID(),
            type: 'image',
            userId: store.userId,
            x: pos.x - w / 2,
            y: pos.y - h / 2,
            width: w,
            height: h,
            imageData: reader.result as string,
            color: '#000000',
            strokeWidth: 0,
            createdAt: Date.now(),
            version: 1,
          };
          store.addShape(newShape);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Paste image from clipboard (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => {
            const img = new window.Image();
            img.onload = () => {
              const stage = stageRef.current;
              if (!stage) return;
              const maxWidth = 400;
              const scale = Math.min(1, maxWidth / img.width);
              const w = img.width * scale;
              const h = img.height * scale;
              const center = stage.getPointerPosition() || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
              const transform = stage.getAbsoluteTransform().copy().invert();
              const pos = transform.point(center);
              const store = useCanvasStore.getState();
              const newShape: ImageShape = {
                id: generateUUID(),
                type: 'image',
                userId: store.userId,
                x: pos.x - w / 2,
                y: pos.y - h / 2,
                width: w,
                height: h,
                imageData: reader.result as string,
                color: '#000000',
                strokeWidth: 0,
                createdAt: Date.now(),
                version: 1,
              };
              store.addShape(newShape);
            };
            img.src = reader.result as string;
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // ── 视口裁剪：计算图形 AABB ──
  const getShapeBounds = useCallback((shape: Shape) => {
    switch (shape.type) {
      case 'rectangle': case 'roundedRect': case 'diamond':
      case 'parallelogram': case 'cylinder': case 'document':
        return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
      case 'circle':
        return { x: shape.x - shape.radius, y: shape.y - shape.radius,
                 w: shape.radius * 2, h: shape.radius * 2 };
      case 'text': {
        const fs = shape.fontSize ?? 18;
        return { x: shape.x, y: shape.y, w: shape.text.length * fs * 0.6, h: fs * 1.4 };
      }
      case 'arrow': {
        const [x1, y1, x2, y2] = shape.points;
        return { x: Math.min(x1, x2), y: Math.min(y1, y2),
                 w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      }
      case 'brush': {
        if (shape.points.length < 4) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < shape.points.length; i += 2) {
          const px = shape.points[i], py = shape.points[i + 1];
          if (px < minX) minX = px; if (py < minY) minY = py;
          if (px > maxX) maxX = px; if (py > maxY) maxY = py;
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      default: return null;
    }
  }, []);

  // ── 预计算连接线端点（修复合约：端点移动时正确触发重渲染）──
  const shapesWithConnectors = useCallback((allShapes: Shape[]) => {
    return allShapes.map(shape => {
      if (shape.type !== 'connector') return { shape, connectorFrom: undefined, connectorTo: undefined };
      const fromShape = allShapes.find(s => s.id === (shape as typeof shape & { fromShapeId: string }).fromShapeId);
      const toShape = allShapes.find(s => s.id === (shape as typeof shape & { toShapeId: string }).toShapeId);
      const from = fromShape ? getEdgePoint(fromShape, (shape as typeof shape & { fromEdge: 'top' }).fromEdge) : undefined;
      const to = toShape ? getEdgePoint(toShape, (shape as typeof shape & { toEdge: 'top' }).toEdge) : undefined;
      return { shape, connectorFrom: from, connectorTo: to };
    });
  }, []);

  // ── 视口裁剪过滤（带 100px 容差避免边缘闪烁）──
  const MARGIN = 100;
  const viewportLeft = (-stageX - MARGIN) / stageScale;
  const viewportTop = (-stageY - MARGIN) / stageScale;
  const viewportRight = (-stageX + stageSize.width + MARGIN) / stageScale;
  const viewportBottom = (-stageY + stageSize.height + MARGIN) / stageScale;

  const visibleEntries = shapesWithConnectors(shapes).filter(({ shape }) => {
    const b = getShapeBounds(shape);
    if (!b) return true;
    return !(b.x + b.w < viewportLeft || b.x > viewportRight ||
             b.y + b.h < viewportTop || b.y > viewportBottom);
  });

  const currentUserId = useCanvasStore(s => s.userId);
  const currentEditingId = useCanvasStore(s => s.editingTextId);

  return (
    <>
    <Stage
      ref={stageRef}
      width={stageSize.width}
      height={stageSize.height}
      scaleX={stageScale}
      scaleY={stageScale}
      x={stageX}
      y={stageY}
      onMouseDown={(e) => {
        // Middle mouse button — start panning
        if (e.evt.button === 1) {
          e.evt.preventDefault();
          isPanningRef.current = true;
          setIsPanning(true);
          panStartRef.current = {
            x: e.evt.clientX,
            y: e.evt.clientY,
            stageX: useCanvasStore.getState().stageX,
            stageY: useCanvasStore.getState().stageY,
          };
          return;
        }
        if (e.target === e.target.getStage()) {
          useCanvasStore.getState().setSelectedId(null);
        }
        toolManager.handleMouseDown(e);
      }}
      onMouseMove={(e) => {
        // Connector hover tracking — 精确命中 + 接近搜索
        if (activeTool === 'connector') {
          const stage = e.target.getStage();
          if (stage) {
            const pos = stage.getPointerPosition();
            if (pos) {
              const shapeNode = stage.getIntersection(pos);
              if (shapeNode) {
                const nodeName = shapeNode.name() as string | undefined;
                if (nodeName && nodeName.startsWith('anchor-')) {
                  // 锚点上方不改变 hover 状态，跳过
                } else if (shapeNode.id() && shapeNode.getType() !== 'Stage') {
                  const s = shapes.find((sh) => sh.id === shapeNode.id());
                  if (s && s.type !== 'connector') {
                    setHoveredConnectorShapeId(shapeNode.id());
                  } else {
                    setHoveredConnectorShapeId(null);
                  }
                } else {
                  setHoveredConnectorShapeId(null);
                }
              } else {
                // 未命中任何节点时，接近搜索（30px 半径）
                const transform = stage.getAbsoluteTransform().copy();
                transform.invert();
                const canvasPos = transform.point(pos);
                let bestDist = 30;
                let bestId: string | null = null;
                for (const s of shapes) {
                  if (s.type === 'connector' || s.type === 'brush') continue;
                  if ('x' in s && 'y' in s && 'width' in s && 'height' in s) {
                    const cx = (s as Shape & { x: number; y: number; width: number; height: number }).x + (s as Shape & { width: number }).width / 2;
                    const cy = (s as Shape & { y: number; height: number }).y + (s as Shape & { height: number }).height / 2;
                    const dx = canvasPos.x - cx;
                    const dy = canvasPos.y - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < bestDist) {
                      bestDist = dist;
                      bestId = s.id;
                    }
                  } else if (s.type === 'circle' && 'x' in s && 'y' in s && 'radius' in s) {
                    const dx = canvasPos.x - (s as Shape & { x: number }).x;
                    const dy = canvasPos.y - (s as Shape & { y: number }).y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < bestDist + (s as Shape & { radius: number }).radius) {
                      bestDist = dist;
                      bestId = s.id;
                    }
                  }
                }
                setHoveredConnectorShapeId(bestId);
              }
            }
          }
        }

        // Panning with middle mouse
        if (isPanningRef.current) {
          const dx = e.evt.clientX - panStartRef.current.x;
          const dy = e.evt.clientY - panStartRef.current.y;
          useCanvasStore.getState().setStagePosition(
            panStartRef.current.stageX + dx,
            panStartRef.current.stageY + dy,
          );
          e.target.getStage()?.batchDraw();
          return;
        }
        toolManager.handleMouseMove(e);
      }}
      onMouseUp={(e) => {
        // End middle-mouse panning
        if (e.evt.button === 1 && isPanningRef.current) {
          isPanningRef.current = false;
          setIsPanning(false);
          return;
        }
        toolManager.handleMouseUp(e);
      }}
      onWheel={(e) => {
        // Ctrl+scroll zoom centered on cursor
        if (e.evt.ctrlKey || e.evt.metaKey) {
          e.evt.preventDefault();
          const stage = e.target.getStage();
          if (!stage) return;

          wheelAccumRef.current += e.evt.deltaY;
          const threshold = 50;
          if (Math.abs(wheelAccumRef.current) < threshold) return;

          const direction = wheelAccumRef.current > 0 ? -1 : 1;
          wheelAccumRef.current = 0;

          const oldScale = stage.scaleX();
          const newScale = direction > 0
            ? Math.min(5, oldScale * 1.1)
            : Math.max(0.1, oldScale * 0.9);
          const pointer = stage.getPointerPosition();
          if (pointer) {
            const mousePointTo = {
              x: (pointer.x - stage.x()) / oldScale,
              y: (pointer.y - stage.y()) / oldScale,
            };
            useCanvasStore.getState().setStageScale(newScale);
            useCanvasStore.getState().setStagePosition(
              pointer.x - mousePointTo.x * newScale,
              pointer.y - mousePointTo.y * newScale,
            );
          } else {
            useCanvasStore.getState().setStageScale(newScale);
          }
          stage.batchDraw();
        }
      }}
      onDblClick={(e) => {
        const target = e.target;
        if (target && target !== target.getStage() && target.attrs?.id) {
          const shapeId = target.attrs.id as string;
          const shape = useCanvasStore.getState().shapes.find(s => s.id === shapeId);
          if (shape && shape.type === 'text' && shape.userId === useCanvasStore.getState().userId) {
            useCanvasStore.getState().setEditingTextId(shapeId);
          }
        }
      }}
      style={{
        background: '#1a1a2e',
        cursor: isPanning
          ? 'grabbing'
          : activeTool === 'eraser'
            ? buildEraserCursor(eraserRadius * stageScale)
            : 'default',
      }}
      onContextMenu={(e) => e.evt.preventDefault()}
    >
      {/* Grid Layer */}
      <Layer listening={false}>
        <GridBackground />
      </Layer>

      {/* Shape Layer（视口裁剪 + memo 化渲染） */}
      <Layer>
        {visibleEntries.map(({ shape, connectorFrom, connectorTo }) => (
          <ShapeRenderer
            key={shape.id}
            shape={shape}
            isOwner={shape.userId === currentUserId}
            isEditing={currentEditingId === shape.id}
            showTextBorder={hoveredTextId === shape.id}
            connectorFrom={connectorFrom}
            connectorTo={connectorTo}
            onTextHoverEnter={() => setHoveredTextId(shape.id)}
            onTextHoverLeave={() => setHoveredTextId(null)}
          />
        ))}
      </Layer>

      {/* Preview Layer */}
      <Layer ref={previewLayerRef} />

      {/* Anchor Layer — connector 模式下悬停图形或拖拽连接线时显示锚点 */}
      {activeTool === 'connector' && (hoveredConnectorShapeId || toolManager.isConnecting()) && (() => {
        const anchorShape = shapes.find((s) => s.id === hoveredConnectorShapeId);
        if (!anchorShape || anchorShape.type === 'connector' || anchorShape.type === 'brush') return null;
        const edges: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
        return (
          <Layer listening={true}>
            {edges.map((edge) => {
              const pt = getEdgePoint(anchorShape, edge);
              return (
                <Circle
                  key={`anchor-${anchorShape.id}-${edge}`}
                  x={pt.x}
                  y={pt.y}
                  radius={5}
                  fill="#3B82F6"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  name={`anchor-${anchorShape.id}-${edge}`}
                  listening={true}
                />
              );
            })}
          </Layer>
        );
      })()}

      {/* Cursor Layer */}
      <Layer>
        <CursorOverlay />
      </Layer>

      {/* Selection Layer */}
      <Layer>
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={true}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 3 || newBox.height < 3) return oldBox;
            return newBox;
          }}
          onTransformEnd={() => {
            const stage = stageRef.current;
            if (!stage || !transformerRef.current) return;
            const nodes = transformerRef.current.nodes();
            const store = useCanvasStore.getState();
            for (const node of nodes) {
              const shapeId = node.id();
              const shape = store.shapes.find((s) => s.id === shapeId);
              if (!shape || shape.locked) continue;

              const scaleX = node.scaleX();
              const scaleY = node.scaleY();

              if (shape.type === 'rectangle' || shape.type === 'image'
                  || shape.type === 'roundedRect' || shape.type === 'diamond'
                  || shape.type === 'parallelogram' || shape.type === 'cylinder'
                  || shape.type === 'document') {
                const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
                const w = Math.max(3, node.width() * scaleX);
                const h = Math.max(3, node.height() * scaleY);
                const updates: Record<string, number> = { x: node.x(), y: node.y(), width: w, height: h };
                if (shape.type === 'roundedRect' && shape.cornerRadius) {
                  updates.cornerRadius = Math.max(2, Math.min(shape.cornerRadius * avgScale, Math.min(w, h) / 2));
                }
                if (shape.type === 'parallelogram' && shape.skew) {
                  updates.skew = Math.max(1, Math.min(shape.skew * avgScale, w * 0.4));
                }
                if (shape.type === 'document' && shape.foldSize) {
                  updates.foldSize = Math.max(2, Math.min(shape.foldSize * avgScale, Math.min(20, Math.min(w, h) * 0.3)));
                }
                store.updateShape(shapeId, updates as Partial<Shape>);
              } else if (shape.type === 'circle') {
                const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
                store.updateShape(shapeId, {
                  x: node.x(),
                  y: node.y(),
                  radius: Math.max(1, shape.radius * avgScale),
                });
              } else if (shape.type === 'text') {
                store.updateShape(shapeId, {
                  x: node.x(),
                  y: node.y(),
                  fontSize: Math.max(8, Math.round((shape.fontSize ?? 18) * Math.abs(scaleY))),
                });
              } else if ((shape.type === 'brush' || shape.type === 'arrow') && 'points' in shape) {
                const pts = [...(shape as Shape & { points: number[] }).points];
                const nx = node.x();
                const ny = node.y();
                const sx = Math.abs(scaleX);
                const sy = Math.abs(scaleY);
                const scaledPts = pts.map((p, i) =>
                  (i % 2 === 0) ? nx + p * sx : ny + p * sy
                );
                store.updateShape(shapeId, { points: scaledPts } as Partial<Shape>);
              }

              // Reset scale so next transform starts from 1
              node.scaleX(1);
              node.scaleY(1);
              node.x(0);
              node.y(0);
            }
          }}
        />
      </Layer>
    </Stage>
      {editingTextId && (() => {
        const shape = shapes.find(s => s.id === editingTextId);
        if (!shape || shape.type !== 'text') return null;
        const stage = stageRef.current;
        if (!stage) return null;
        return <TextEditor key={editingTextId} shape={shape} stage={stage} />;
      })()}
    </>
  );
}
