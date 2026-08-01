import { useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useCanvasStore } from '../store/useCanvasStore';
import { ToolManager } from '../managers/ToolManager';
import { CursorOverlay } from './CursorOverlay';
import type { Shape } from '../types';

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
  const selectedId = useCanvasStore((s) => s.selectedId);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const eraserRadius = useCanvasStore((s) => s.eraserRadius);

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
      draggable: shape.userId === useCanvasStore.getState().userId,
    };

    switch (shape.type) {
      case 'brush':
        return (
          <Line
            {...common}
            points={shape.points}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
            globalCompositeOperation="source-over"
          />
        );
      case 'rectangle':
        return (
          <Rect
            {...common}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
          />
        );
      case 'circle':
        return (
          <Circle
            {...common}
            x={shape.x}
            y={shape.y}
            radius={shape.radius}
          />
        );
      case 'arrow':
        return (
          <Arrow
            {...common}
            points={shape.points}
            fill={shape.color}
            pointerLength={10}
            pointerWidth={8}
          />
        );
      case 'text':
        return (
          <Text
            {...common}
            x={shape.x}
            y={shape.y}
            text={shape.text}
            fontSize={shape.fontSize ?? 18}
            fill={shape.color}
            stroke={undefined}
          />
        );
      default:
        return null;
    }
  }, []);

  return (
    <Stage
      ref={stageRef}
      width={window.innerWidth}
      height={window.innerHeight}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) {
          useCanvasStore.getState().setSelectedId(null);
        }
        toolManager.handleMouseDown(e);
      }}
      onMouseMove={(e) => toolManager.handleMouseMove(e)}
      onMouseUp={(e) => toolManager.handleMouseUp(e)}
      style={{
        background: '#1a1a2e',
        cursor: activeTool === 'eraser' ? buildEraserCursor(eraserRadius) : 'default',
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
  );
}
