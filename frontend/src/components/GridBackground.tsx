import { useMemo } from 'react';
import { Line, Circle } from 'react-konva';
import { useCanvasStore } from '../store/useCanvasStore';

const GRID_SIZE = 40;

export function GridBackground() {
  const gridMode = useCanvasStore((s) => s.gridMode);
  const stageScale = useCanvasStore((s) => s.stageScale);
  const stageX = useCanvasStore((s) => s.stageX);
  const stageY = useCanvasStore((s) => s.stageY);

  const width = window.innerWidth;
  const height = window.innerHeight;

  const elements = useMemo(() => {
    if (gridMode === 'none') return null;

    // Auto-hide dots when too zoomed out, lines when too zoomed in
    if (gridMode === 'dot' && stageScale < 0.25) return null;
    if (gridMode === 'line' && stageScale > 3) return null;

    const startX = Math.floor(-stageX / stageScale / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(-stageY / stageScale / GRID_SIZE) * GRID_SIZE;
    const endX = startX + width / stageScale + GRID_SIZE;
    const endY = startY + height / stageScale + GRID_SIZE;

    const items: JSX.Element[] = [];

    if (gridMode === 'line') {
      // Vertical lines
      for (let x = startX; x <= endX; x += GRID_SIZE) {
        items.push(
          <Line
            key={`v${x}`}
            points={[x, startY, x, endY]}
            stroke="#ffffff10"
            strokeWidth={0.5}
          />,
        );
      }
      // Horizontal lines
      for (let y = startY; y <= endY; y += GRID_SIZE) {
        items.push(
          <Line
            key={`h${y}`}
            points={[startX, y, endX, y]}
            stroke="#ffffff10"
            strokeWidth={0.5}
          />,
        );
      }
    } else if (gridMode === 'dot') {
      for (let x = startX; x <= endX; x += GRID_SIZE) {
        for (let y = startY; y <= endY; y += GRID_SIZE) {
          items.push(
            <Circle
              key={`${x}_${y}`}
              x={x}
              y={y}
              radius={1}
              fill="#ffffff20"
            />,
          );
        }
      }
    }

    return items;
  }, [gridMode, stageScale, stageX, stageY, width, height]);

  return <>{elements}</>;
}
