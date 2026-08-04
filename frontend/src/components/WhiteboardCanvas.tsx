import { useRef, useEffect, useCallback, useState } from 'react';
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Transformer, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useCanvasStore } from '../store/useCanvasStore';
import { ToolManager } from '../managers/ToolManager';
import { CursorOverlay } from './CursorOverlay';
import { TextEditor } from './TextEditor';
import { GridBackground } from './GridBackground';
import type { Shape, ImageShape } from '../types';

const toolManager = new ToolManager();

function measureTextSize(text: string, fontSize: number): { width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: text.length * fontSize * 0.6, height: fontSize * 1.4 };
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text || 'Text');
  return {
    width: Math.max(40, metrics.width),
    height: fontSize * 1.4,
  };
}

function buildEraserCursor(radius: number): string {
  const size = Math.max(24, radius * 2 + 8);
  const cx = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<circle cx="${cx}" cy="${cx}" r="${radius}" fill="none" stroke="white" stroke-width="1.5" opacity="0.9"/>`
    + `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${cx} ${cx}, crosshair`;
}

function ImageRenderer({ shape }: { shape: ImageShape }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    setImg(null);
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError(true);
    image.src = shape.imageData;
    return () => { image.onload = null; image.onerror = null; };
  }, [shape.imageData]);

  if (error) {
    return (
      <Rect x={shape.x} y={shape.y} width={shape.width} height={shape.height}
        fill="#333" stroke="#666" strokeWidth={1} dash={[4, 4]} />
    );
  }
  if (!img) return null;
  return (
    <KonvaImage
      image={img}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      listening={true}
    />
  );
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
        .filter(Boolean) as Konva.Shape[];
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedIds]);

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
            id: crypto.randomUUID(),
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
                id: crypto.randomUUID(),
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

  const renderShape = useCallback((shape: Shape) => {
    const common = {
      id: shape.id,
      key: shape.id,
      stroke: shape.color,
      strokeWidth: shape.strokeWidth,
    };

    switch (shape.type) {
      case 'brush':
        return (
          <>
            <Line
              {...common}
              points={shape.points}
              tension={0}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation="source-over"
            />
            {shape.locked && (
              <Text
                x={shape.points[0] - 2}
                y={shape.points[1] - 16}
                text="🔒"
                fontSize={14}
                fill="#F59E0B"
                listening={false}
              />
            )}
          </>
        );
      case 'rectangle':
        return (
          <>
            <Rect
              {...common}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              fill={shape.fill || 'transparent'}
            />
            {shape.locked && (
              <Text
                x={shape.x - 2}
                y={shape.y - 16}
                text="🔒"
                fontSize={14}
                fill="#F59E0B"
                listening={false}
              />
            )}
          </>
        );
      case 'circle':
        return (
          <>
            <Circle
              {...common}
              x={shape.x}
              y={shape.y}
              radius={shape.radius}
              fill={shape.fill || 'transparent'}
            />
            {shape.locked && (
              <Text
                x={shape.x - shape.radius - 4}
                y={shape.y - shape.radius - 16}
                text="🔒"
                fontSize={14}
                fill="#F59E0B"
                listening={false}
              />
            )}
          </>
        );
      case 'arrow':
        return (
          <>
            <Arrow
              {...common}
              points={shape.points}
              fill={shape.fill || shape.color}
              pointerLength={10}
              pointerWidth={8}
            />
            {shape.locked && (
              <Text
                x={shape.points[0] - 2}
                y={shape.points[1] - 16}
                text="🔒"
                fontSize={14}
                fill="#F59E0B"
                listening={false}
              />
            )}
          </>
        );
      case 'text': {
        const isOwner = shape.userId === useCanvasStore.getState().userId;
        const isEditing = useCanvasStore.getState().editingTextId === shape.id;
        return (
          <>
            <Text
              {...common}
              x={shape.x}
              y={shape.y}
              text={shape.text}
              fontSize={shape.fontSize ?? 18}
              fill={shape.color}
              stroke={undefined}
              onMouseEnter={isOwner && !isEditing ? () => setHoveredTextId(shape.id) : undefined}
              onMouseLeave={isOwner ? () => setHoveredTextId(null) : undefined}
            />
            {/* Dashed border on hover (only for owner, not while editing) */}
            {hoveredTextIdRef.current === shape.id && isOwner && !isEditing && (() => {
              const size = measureTextSize(shape.text, shape.fontSize ?? 18);
              return (
                <Rect
                  x={shape.x - 4}
                  y={shape.y - 4}
                  width={size.width + 8}
                  height={size.height + 8}
                  stroke="#6B7280"
                  strokeWidth={1}
                  dash={[4, 4]}
                  listening={false}
                />
              );
            })()}
            {shape.locked && (
              <Text
                x={shape.x - 2}
                y={shape.y - 16}
                text="🔒"
                fontSize={14}
                fill="#F59E0B"
                listening={false}
              />
            )}
          </>
        );
      }
      case 'image':
        return <ImageRenderer key={shape.id} shape={shape as ImageShape} />;
      default:
        return null;
    }
  }, []);

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

      {/* Shape Layer */}
      <Layer>{shapes.map(renderShape)}</Layer>

      {/* Preview Layer */}
      <Layer ref={previewLayerRef} />

      {/* Cursor Layer */}
      <Layer>
        <CursorOverlay />
      </Layer>

      {/* Selection Layer */}
      <Layer>
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={false}
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
              if (!shape || shape.locked && shape.userId !== store.userId) continue;

              const scaleX = node.scaleX();
              const scaleY = node.scaleY();

              if (shape.type === 'rectangle' || shape.type === 'image') {
                store.updateShape(shapeId, {
                  x: node.x(),
                  y: node.y(),
                  width: Math.max(3, node.width() * scaleX),
                  height: Math.max(3, node.height() * scaleY),
                });
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
                // Scale all points relative to bounding box origin
                const pts = [...(shape as Shape & { points: number[] }).points];
                let minX = Infinity, minY = Infinity;
                for (let i = 0; i < pts.length; i += 2) {
                  minX = Math.min(minX, pts[i]);
                  minY = Math.min(minY, pts[i + 1]);
                }
                const scaledPts = pts.map((p, i) =>
                  (i % 2 === 0)
                    ? minX + (p - minX) * Math.abs(scaleX)
                    : minY + (p - minY) * Math.abs(scaleY)
                );
                store.updateShape(shapeId, { points: scaledPts } as Partial<Shape>);
              }

              // Reset scale so next transform starts from 1
              node.scaleX(1);
              node.scaleY(1);
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
