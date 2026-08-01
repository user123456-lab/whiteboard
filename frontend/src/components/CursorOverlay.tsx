import { Group, Line, Text } from 'react-konva';
import { useCanvasStore } from '../store/useCanvasStore';

export function CursorOverlay() {
  const remoteCursors = useCanvasStore((s) => s.remoteCursors);
  const cursors = Object.values(remoteCursors);

  return (
    <>
      {cursors.map((cursor) => (
        <Group key={cursor.userId}>
          {/* Cursor arrow */}
          <Line
            points={[
              cursor.x, cursor.y,
              cursor.x, cursor.y + 16,
              cursor.x + 3, cursor.y + 13,
              cursor.x + 6, cursor.y + 18,
              cursor.x + 8, cursor.y + 17,
              cursor.x + 5, cursor.y + 12,
              cursor.x + 10, cursor.y + 12,
            ]}
            fill={cursor.color}
            stroke={cursor.color}
            strokeWidth={1}
            closed
          />
          {/* User name label */}
          <Text
            x={cursor.x + 12}
            y={cursor.y + 14}
            text={cursor.userName}
            fontSize={11}
            fill="#fff"
            padding={2}
            fillAfterStrokeEnabled
            stroke={cursor.color}
            strokeWidth={1}
          />
        </Group>
      ))}
    </>
  );
}
