import { useRef, useEffect, useCallback, useState } from 'react';
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useCanvasStore } from '../store/useCanvasStore';
import { sendMessage, getWs } from '../services/websocket';
import { ToolManager } from '../managers/ToolManager';
import { CursorOverlay } from './CursorOverlay';
import type { Shape } from '../types';

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

export function WhiteboardCanvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const previewLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const shapes = useCanvasStore((s) => s.shapes);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const eraserRadius = useCanvasStore((s) => s.eraserRadius);
  const stageScale = useCanvasStore((s) => s.stageScale);
  const stageX = useCanvasStore((s) => s.stageX);
  const stageY = useCanvasStore((s) => s.stageY);
  const editingTextId = useCanvasStore((s) => s.editingTextId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingTextId) {
      setHoveredTextId(null);
      // Auto-select all text when entering edit mode
      requestAnimationFrame(() => textareaRef.current?.select());
    }
  }, [editingTextId]);

  useEffect(() => {
    if (editingTextId && !shapes.find((s) => s.id === editingTextId)) {
      useCanvasStore.getState().setEditingTextId(null);
    }
  }, [shapes, editingTextId]);

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
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  useEffect(() => {
    if (transformerRef.current && selectedId) {
      const stage = stageRef.current;
      if (!stage) return;
      const node = stage.findOne('#' + selectedId);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, shapes]);

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
              tension={0.5}
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
            />
            {shape.locked && (
              <Text
                x={shape.x - 2}
                y={shape.y - 16}
                text="🔒"
                fontSize={14}
                fill="#F59E0B"
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
            />
            {shape.locked && (
              <Text
                x={shape.x - shape.radius - 4}
                y={shape.y - shape.radius - 16}
                text="🔒"
                fontSize={14}
                fill="#F59E0B"
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
              fill={shape.color}
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
              />
            )}
          </>
        );
      }
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
      <Layer>
        {/* Optional: render a dot grid here */}
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
        />
      </Layer>
    </Stage>
      {editingTextId && (() => {
        const shape = shapes.find(s => s.id === editingTextId);
        if (!shape || shape.type !== 'text') return null;
        const stage = stageRef.current;
        if (!stage) return null;
        const absPos = stage.getAbsoluteTransform().point({ x: shape.x, y: shape.y });
        const scale = stage.scaleX();

        return (
          <textarea
            ref={textareaRef}
            autoFocus
            defaultValue={shape.text}
            style={{
              position: 'absolute',
              left: absPos.x,
              top: absPos.y,
              fontSize: (shape.fontSize ?? 18) * scale,
              color: shape.color,
              background: 'rgba(30,30,40,0.95)',
              border: '1px solid #555',
              borderRadius: 4,
              padding: 4,
              minWidth: 100,
              outline: 'none',
              resize: 'both',
              zIndex: 100,
              fontFamily: 'sans-serif',
              lineHeight: 1.3,
            }}
            onBlur={(e) => {
              const store = useCanvasStore.getState();
              const text = e.target.value.trim();
              if (text) {
                const changes: Record<string, unknown> = { text, fontSize: store.toolFontSize };
                store.updateShape(editingTextId, changes);
                sendMessage(getWs(), 'shape_updated', {
                  shapeId: editingTextId,
                  changes,
                }, store.userId);
              }
              store.setEditingTextId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                (e.target as HTMLTextAreaElement).blur();
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
        );
      })()}
    </>
  );
}
