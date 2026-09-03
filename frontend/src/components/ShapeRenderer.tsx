import { memo, useState, useEffect, useRef } from 'react';
import { Line, Rect, Circle, Arrow as KonvaArrow, Text, Image as KonvaImage, Shape as KonvaShape } from 'react-konva';
import type { Shape, ImageShape } from '../types';

/** offscreen canvas 文字测量 */
function measureTextSize(text: string, fontSize: number): { width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: text.length * fontSize * 0.6, height: fontSize * 1.4 };
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text || 'Text');
  return { width: Math.max(40, metrics.width), height: fontSize * 1.4 };
}

/** 图片渲染器（独立组件，避免无效重渲染） */
const ImageRenderer = memo(function ImageRenderer({ shape }: { shape: ImageShape }) {
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
  return <KonvaImage image={img} x={shape.x} y={shape.y} width={shape.width} height={shape.height} listening={true} />;
});

export interface ShapeRendererProps {
  shape: Shape;
  /** 当前用户是否为 shape 所有者 */
  isOwner: boolean;
  /** 是否正在文本编辑状态 */
  isEditing: boolean;
  /** 文本 hover 时是否显示虚线框 */
  showTextBorder: boolean;
  /** 预计算的连接线起点坐标（connector 专用） */
  connectorFrom?: { x: number; y: number };
  /** 预计算的连接线终点坐标（connector 专用） */
  connectorTo?: { x: number; y: number };
  onTextHoverEnter?: () => void;
  onTextHoverLeave?: () => void;
}

export const ShapeRenderer = memo(function ShapeRenderer(props: ShapeRendererProps) {
  const { shape, isOwner, isEditing, showTextBorder, connectorFrom, connectorTo, onTextHoverEnter, onTextHoverLeave } = props;

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
          <Line {...common} points={shape.points} tension={0} lineCap="round" lineJoin="round"
            globalCompositeOperation="source-over" />
          {shape.locked && shape.points.length >= 2 && <Text x={shape.points[0] - 2} y={shape.points[1] - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );

    case 'rectangle':
      return (
        <>
          <Rect {...common} x={shape.x} y={shape.y} width={shape.width} height={shape.height}
            fill={shape.fill || 'transparent'} />
          {shape.locked && <Text x={shape.x - 2} y={shape.y - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );

    case 'roundedRect':
      return (
        <>
          <Rect {...common} x={shape.x} y={shape.y} width={shape.width} height={shape.height}
            cornerRadius={shape.cornerRadius ?? 10} fill={shape.fill || 'transparent'} />
          {shape.locked && <Text x={shape.x - 2} y={shape.y - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );

    case 'diamond': {
      const dcx = shape.x + shape.width / 2;
      const dcy = shape.y + shape.height / 2;
      return (
        <>
          <Line {...common} closed fill={shape.fill || 'transparent'}
            points={[dcx, shape.y, shape.x + shape.width, dcy, dcx, shape.y + shape.height, shape.x, dcy]} />
          {shape.locked && <Text x={shape.x - 2} y={shape.y - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );
    }

    case 'parallelogram': {
      const skew = (shape as Shape & { skew?: number }).skew ?? shape.width * 0.2;
      return (
        <>
          <Line {...common} closed fill={shape.fill || 'transparent'}
            points={[shape.x + skew, shape.y, shape.x + shape.width, shape.y,
                     shape.x + shape.width - skew, shape.y + shape.height,
                     shape.x, shape.y + shape.height]} />
          {shape.locked && <Text x={shape.x - 2} y={shape.y - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );
    }

    case 'cylinder':
      return <CylinderRenderer shape={shape} common={common} />;

    case 'document': {
      const fold = (shape as Shape & { foldSize?: number }).foldSize ?? 20;
      return (
        <>
          <Line {...common} closed fill={shape.fill || 'transparent'}
            points={[shape.x, shape.y, shape.x + shape.width - fold, shape.y,
                     shape.x + shape.width, shape.y + fold,
                     shape.x + shape.width, shape.y + shape.height,
                     shape.x, shape.y + shape.height]} />
          <Line points={[shape.x + shape.width - fold, shape.y,
                         shape.x + shape.width - fold, shape.y + fold,
                         shape.x + shape.width, shape.y + fold]}
            stroke={shape.color} strokeWidth={shape.strokeWidth * 0.7} listening={false} />
          {shape.locked && <Text x={shape.x - 2} y={shape.y - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );
    }

    case 'circle':
      return (
        <>
          <Circle {...common} x={shape.x} y={shape.y} radius={shape.radius} fill={shape.fill || 'transparent'} />
          {shape.locked && <Text x={shape.x - shape.radius - 4} y={shape.y - shape.radius - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );

    case 'arrow':
      return (
        <>
          <KonvaArrow {...common} points={shape.points} fill={shape.fill || shape.color}
            pointerLength={10} pointerWidth={8} />
          {shape.locked && shape.points.length >= 2 && <Text x={shape.points[0] - 2} y={shape.points[1] - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );

    case 'text': {
      return (
        <>
          <Text {...common} x={shape.x} y={shape.y} text={shape.text} fontSize={shape.fontSize ?? 18}
            fill={shape.color} stroke={undefined}
            onMouseEnter={isOwner && !isEditing ? onTextHoverEnter : undefined}
            onMouseLeave={isOwner ? onTextHoverLeave : undefined} />
          {showTextBorder && isOwner && !isEditing && (() => {
            const size = measureTextSize(shape.text, shape.fontSize ?? 18);
            return <Rect x={shape.x - 4} y={shape.y - 4} width={size.width + 8} height={size.height + 8}
              stroke="#6B7280" strokeWidth={1} dash={[4, 4]} listening={false} />;
          })()}
          {shape.locked && <Text x={shape.x - 2} y={shape.y - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );
    }

    case 'image':
      return <ImageRenderer shape={shape as ImageShape} />;

    case 'connector': {
      if (!connectorFrom || !connectorTo) return null;
      return (
        <>
          <KonvaArrow {...common} points={[connectorFrom.x, connectorFrom.y, connectorTo.x, connectorTo.y]}
            fill={common.stroke} pointerLength={10} pointerWidth={8} />
          {shape.locked && <Text x={connectorFrom.x - 2} y={connectorFrom.y - 16}
            text="🔒" fontSize={14} fill="#F59E0B" listening={false} />}
        </>
      );
    }

    default:
      return null;
  }
}, (prev, next) => {
  return prev.shape === next.shape
    && prev.isOwner === next.isOwner
    && prev.isEditing === next.isEditing
    && prev.showTextBorder === next.showTextBorder
    && prev.connectorFrom?.x === next.connectorFrom?.x
    && prev.connectorFrom?.y === next.connectorFrom?.y
    && prev.connectorTo?.x === next.connectorTo?.x
    && prev.connectorTo?.y === next.connectorTo?.y;
});

/** 圆柱体渲染器 — 使用 sceneFunc 自定义绘制 + Konva cache 加速 */
const CylinderRenderer = memo(function CylinderRenderer({ shape, common }: {
  shape: Shape & { x: number; y: number; width: number; height: number; fill?: string };
  common: { id: string; key: string; stroke: string; strokeWidth: number };
}) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.clearCache();
      ref.current.cache();
    }
  }, [shape.width, shape.height, shape.color, shape.strokeWidth, shape.fill]);

  useEffect(() => {
    if (ref.current) {
      ref.current.cache();
    }
  }, []);

  return (
    <>
      <KonvaShape
        {...common}
        ref={ref}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        sceneFunc={(ctx: any, shapeKonva: any) => {
          const w = shapeKonva.width();
          const h = shapeKonva.height();
          const arcH = Math.min(15, h * 0.2);
          const cx = w / 2;
          ctx.beginPath();
          ctx.ellipse(cx, h - arcH, w / 2, arcH, 0, 0, Math.PI * 2);
          ctx.fillStrokeShape(shapeKonva);
          ctx.beginPath();
          ctx.moveTo(0, arcH);
          ctx.ellipse(cx, arcH, w / 2, arcH, 0, Math.PI, Math.PI * 2, false);
          ctx.lineTo(w, h - arcH);
          ctx.ellipse(cx, h - arcH, w / 2, arcH, 0, 0, Math.PI, false);
          ctx.closePath();
          ctx.fillStrokeShape(shapeKonva);
          ctx.beginPath();
          ctx.ellipse(cx, arcH, w / 2, arcH, 0, 0, Math.PI * 2);
          ctx.fillStrokeShape(shapeKonva);
        }}
        fill={shape.fill || 'transparent'}
      />
      {shape.locked && (
        <Text x={shape.x - 2} y={shape.y - 16} text="🔒" fontSize={14} fill="#F59E0B" listening={false} />
      )}
    </>
  );
});
