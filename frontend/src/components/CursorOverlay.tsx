import { Group, Line, Text } from 'react-konva';
import { useCanvasStore } from '../store/useCanvasStore';

export function CursorOverlay() {
  const remoteCursors = useCanvasStore((s) => s.remoteCursors);
  const cursors = Object.values(remoteCursors);

  return (
    <>
      {cursors.map((cursor) => (
        <Group key={cursor.userId} listening={false}>
          <Line
            points={[
              cursor.x, cursor.y,
              cursor.x, cursor.y + 17,
              cursor.x + 3.5, cursor.y + 14,
              cursor.x + 6.5, cursor.y + 19,
              cursor.x + 8.5, cursor.y + 18,
              cursor.x + 5.5, cursor.y + 12.5,
              cursor.x + 10, cursor.y + 12.5,
            ]}
            fill={cursor.color}
            stroke={cursor.color}
            strokeWidth={0.5}
            closed
            listening={false}
            shadowColor="rgba(0,0,0,0.4)"
            shadowBlur={2}
          />
          <Text
            x={cursor.x + 13}
            y={cursor.y + 15}
            text={cursor.userName}
            fontSize={11}
            fontFamily="Inter, system-ui, sans-serif"
            fill="#F1F5F9"
            padding={3}
            fillAfterStrokeEnabled
            stroke={cursor.color}
            strokeWidth={1.5}
            shadowColor="rgba(0,0,0,0.6)"
            shadowBlur={3}
            shadowOffsetY={1}
            listening={false}
          />
        </Group>
      ))}
    </>
  );
}
