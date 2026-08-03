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
  { type: 'eraser', label: 'Eraser', shortcut: 'E', icon: '⌫' },
];

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function nextZoomStep(current: number, direction: 'in' | 'out'): number {
  const rounded = Math.round(current * 1000) / 1000; // round to 3 decimal places
  if (direction === 'in') {
    for (const step of ZOOM_STEPS) {
      if (step > rounded) return step;
    }
    return 5;
  } else {
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (ZOOM_STEPS[i] < rounded) return ZOOM_STEPS[i];
    }
    return 0.1;
  }
}

export function Toolbar() {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const toolColor = useCanvasStore((s) => s.toolColor);
  const setToolColor = useCanvasStore((s) => s.setToolColor);
  const toolWidth = useCanvasStore((s) => s.toolWidth);
  const setToolWidth = useCanvasStore((s) => s.setToolWidth);
  const eraserRadius = useCanvasStore((s) => s.eraserRadius);
  const setEraserRadius = useCanvasStore((s) => s.setEraserRadius);
  const userId = useCanvasStore((s) => s.userId);
  const stageScale = useCanvasStore((s) => s.stageScale);
  const toolFontSize = useCanvasStore((s) => s.toolFontSize);
  const setToolFontSize = useCanvasStore((s) => s.setToolFontSize);

  const handleUndo = () => {
    const store = useCanvasStore.getState();
    const shapeId = store.undoOwn(userId);
    if (shapeId) {
      sendMessage(getWs(), 'shape_deleted', { shapeId }, userId);
    }
  };

  const handleRedo = () => {
    const store = useCanvasStore.getState();
    const shape = store.redoOwn(userId);
    if (shape) {
      sendMessage(getWs(), 'shape_created', { shape }, userId);
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

      {activeTool === 'eraser' ? (
        /* Eraser size control */
        <div className="flex flex-col items-center gap-1 py-1">
          <span className="text-[10px] text-gray-500">Size</span>
          <input
            type="range"
            min="3"
            max="40"
            value={eraserRadius}
            onChange={(e) => setEraserRadius(Number(e.target.value))}
            className="w-20 h-1 accent-orange-400"
            title="Eraser size"
          />
          <span className="text-xs text-gray-400">{eraserRadius}px</span>
        </div>
      ) : activeTool === 'text' ? (
        /* Font size control */
        <div className="flex flex-col items-center gap-1 py-1">
          <span className="text-[10px] text-gray-500">Font</span>
          <input
            type="range"
            min="8"
            max="72"
            value={toolFontSize}
            onChange={(e) => setToolFontSize(Number(e.target.value))}
            className="w-20 h-1 accent-green-500"
            title="Font size"
          />
          <span className="text-xs text-gray-400">{toolFontSize}px</span>
        </div>
      ) : (
        <>
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
        </>
      )}

      <div className="border-t border-gray-700 my-1" />

      {/* Undo */}
      <button
        onClick={handleUndo}
        title="Undo (Ctrl+Z)"
        className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-sm transition-colors"
      >
        ↩
      </button>

      {/* Redo */}
      <button
        onClick={handleRedo}
        title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
        className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-sm transition-colors"
      >
        ↷
      </button>

      <div className="border-t border-gray-700 my-1" />

      {/* Zoom controls */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => {
            const store = useCanvasStore.getState();
            const oldScale = store.stageScale;
            const newScale = nextZoomStep(oldScale, 'in');
            // Zoom to center of viewport
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const mouseX = (cx - store.stageX) / oldScale;
            const mouseY = (cy - store.stageY) / oldScale;
            store.setStageScale(newScale);
            store.setStagePosition(cx - mouseX * newScale, cy - mouseY * newScale);
          }}
          title="Zoom In (Ctrl+Scroll Up)"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-sm transition-colors"
        >
          +
        </button>

        <button
          onClick={() => {
            const store = useCanvasStore.getState();
            store.setStageScale(1);
            store.setStagePosition(0, 0);
          }}
          title="Reset Zoom"
          className="text-xs text-gray-400 hover:text-white cursor-pointer py-0.5"
        >
          {Math.round(stageScale * 100)}%
        </button>

        <button
          onClick={() => {
            const store = useCanvasStore.getState();
            const oldScale = store.stageScale;
            const newScale = nextZoomStep(oldScale, 'out');
            // Zoom to center of viewport
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const mouseX = (cx - store.stageX) / oldScale;
            const mouseY = (cy - store.stageY) / oldScale;
            store.setStageScale(newScale);
            store.setStagePosition(cx - mouseX * newScale, cy - mouseY * newScale);
          }}
          title="Zoom Out (Ctrl+Scroll Down)"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-sm transition-colors"
        >
          −
        </button>

        <button
          onClick={() => {
            useCanvasStore.getState().setStagePosition(0, 0);
          }}
          title="Reset Position"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white text-xs transition-colors"
        >
          ⊡
        </button>
      </div>
    </div>
  );
}
