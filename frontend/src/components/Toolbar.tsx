import { useCanvasStore } from '../store/useCanvasStore';
import { sendMessage, getWs } from '../services/websocket';
import type { ToolType } from '../types';

const tools: { type: ToolType; label: string; shortcut: string; icon: string }[] = [
  { type: 'select', label: 'Select', shortcut: 'V', icon: '↖' },
  { type: 'brush', label: 'Brush', shortcut: 'B', icon: '✎' },
  { type: 'rectangle', label: 'Rect', shortcut: 'R', icon: '□' },
  { type: 'circle', label: 'Circle', shortcut: 'C', icon: '○' },
  { type: 'arrow', label: 'Arrow', shortcut: 'A', icon: '→' },
  { type: 'text', label: 'Text', shortcut: 'T', icon: 'T' },
];

export function Toolbar() {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const toolColor = useCanvasStore((s) => s.toolColor);
  const setToolColor = useCanvasStore((s) => s.setToolColor);
  const toolWidth = useCanvasStore((s) => s.toolWidth);
  const setToolWidth = useCanvasStore((s) => s.setToolWidth);
  const userId = useCanvasStore((s) => s.userId);

  const handleUndo = () => {
    const store = useCanvasStore.getState();
    const shapeId = store.undoOwn(userId);
    if (shapeId) {
      sendMessage(getWs(), 'shape_deleted', { shapeId }, userId);
    }
  };

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 bg-gray-800/90 backdrop-blur rounded-xl p-2 shadow-xl border border-gray-700 z-50">
      {tools.map((tool) => (
        <button
          key={tool.type}
          onClick={() => setActiveTool(tool.type)}
          title={`${tool.label} (${tool.shortcut})`}
          className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg transition-colors ${
            activeTool === tool.type
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      <div className="border-t border-gray-700 my-1" />

      {/* Color picker */}
      <div className="flex items-center justify-center py-1">
        <input
          type="color"
          value={toolColor}
          onChange={(e) => setToolColor(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          title="Color"
        />
      </div>

      {/* Stroke width */}
      <div className="flex items-center justify-center gap-1">
        <input
          type="range"
          min="1"
          max="20"
          value={toolWidth}
          onChange={(e) => setToolWidth(Number(e.target.value))}
          className="w-20 h-1 accent-blue-500"
          title="Stroke width"
        />
        <span className="text-xs text-gray-400 w-6 text-center">{toolWidth}</span>
      </div>

      <div className="border-t border-gray-700 my-1" />

      {/* Undo */}
      <button
        onClick={handleUndo}
        title="Undo (Ctrl+Z)"
        className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-sm transition-colors"
      >
        ↩
      </button>
    </div>
  );
}
