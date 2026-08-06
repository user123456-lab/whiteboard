import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import type Konva from 'konva';
import type { TextShape } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';

interface TextEditorProps {
  shape: TextShape;
  stage: Konva.Stage;
}

export function TextEditor({ shape, stage }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const escapedRef = useRef(false);
  const stageScale = useCanvasStore((s) => s.stageScale);
  const stageX = useCanvasStore((s) => s.stageX);
  const stageY = useCanvasStore((s) => s.stageY);

  // Auto-select all text when entering edit mode
  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.select());
  }, []);

  const [absPos, setAbsPos] = useState({ x: shape.x, y: shape.y });

  useLayoutEffect(() => {
    if (stage) {
      setAbsPos(stage.getAbsoluteTransform().point({ x: shape.x, y: shape.y }));
    }
  }, [stageScale, stageX, stageY, shape.x, shape.y, stage]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      // Esc pressed — discard changes, just close editor
      if (escapedRef.current) {
        escapedRef.current = false;
        useCanvasStore.getState().setEditingTextId(null);
        return;
      }
      const store = useCanvasStore.getState();
      const text = e.target.value.trim();
      if (text) {
        store.updateShape(shape.id, { text, fontSize: shape.fontSize ?? 18 });
      }
      store.setEditingTextId(null);
    },
    [shape.id, shape.fontSize],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        escapedRef.current = true;
        (e.target as HTMLTextAreaElement).blur();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        (e.target as HTMLTextAreaElement).blur();
      }
    },
    [shape.text],
  );

  return (
    <textarea
      ref={textareaRef}
      autoFocus
      defaultValue={shape.text}
      style={{
        position: 'absolute',
        left: absPos.x,
        top: absPos.y,
        fontSize: (shape.fontSize ?? 18) * stageScale,
        color: shape.color,
        background: 'rgba(18, 18, 22, 0.95)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '6px 8px',
        minWidth: 120,
        outline: 'none',
        resize: 'both',
        zIndex: 100,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        lineHeight: 1.4,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.2)',
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
