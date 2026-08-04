import {
  MousePointer2,
  Pencil,
  Square,
  Circle,
  ArrowRight,
  Type,
  Eraser,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  History,
  Download,
  Minus,
  Plus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Settings,
} from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import { useUserPrefs } from '../store/useUserPrefs';
import type { ToolType } from '../types';
import { useMemo } from 'react';
import * as alignService from '../services/alignService';

interface ToolDef {
  type: ToolType;
  label: string;
  shortcut: string;
  Icon: typeof MousePointer2;
}

const TOOLS: ToolDef[] = [
  { type: 'select', label: 'Select', shortcut: 'V', Icon: MousePointer2 },
  { type: 'brush', label: 'Brush', shortcut: 'B', Icon: Pencil },
  { type: 'rectangle', label: 'Rectangle', shortcut: 'R', Icon: Square },
  { type: 'circle', label: 'Circle', shortcut: 'C', Icon: Circle },
  { type: 'arrow', label: 'Arrow', shortcut: 'A', Icon: ArrowRight },
  { type: 'text', label: 'Text', shortcut: 'T', Icon: Type },
  { type: 'eraser', label: 'Eraser', shortcut: 'E', Icon: Eraser },
];

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function nextZoomStep(current: number, direction: 'in' | 'out'): number {
  const rounded = Math.round(current * 1000) / 1000;
  if (direction === 'in') {
    for (const step of ZOOM_STEPS) {
      if (step > rounded) return step;
    }
    return 5;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < rounded) return ZOOM_STEPS[i];
  }
  return 0.1;
}

export function Toolbar() {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const toolColor = useCanvasStore((s) => s.toolColor);
  const setToolColor = useCanvasStore((s) => s.setToolColor);
  const toolWidth = useCanvasStore((s) => s.toolWidth);
  const setToolWidth = useCanvasStore((s) => s.setToolWidth);
  const toolFill = useCanvasStore((s) => s.toolFill);
  const setToolFill = useCanvasStore((s) => s.setToolFill);
  const eraserRadius = useCanvasStore((s) => s.eraserRadius);
  const setEraserRadius = useCanvasStore((s) => s.setEraserRadius);
  const userId = useCanvasStore((s) => s.userId);
  const stageScale = useCanvasStore((s) => s.stageScale);
  const toolFontSize = useCanvasStore((s) => s.toolFontSize);
  const setToolFontSize = useCanvasStore((s) => s.setToolFontSize);
  const gridMode = useCanvasStore((s) => s.gridMode);
  const setGridMode = useCanvasStore((s) => s.setGridMode);
  const showHistory = useCanvasStore((s) => s.showHistory);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const shapes = useCanvasStore((s) => s.shapes);

  const showAlign = useMemo(() => {
    if (selectedIds.length < 2) return false;
    let positioned = 0;
    for (const id of selectedIds) {
      const s = shapes.find((sh) => sh.id === id);
      if (s && 'x' in s && 'y' in s) positioned++;
    }
    return positioned >= 2;
  }, [selectedIds, shapes]);

  const showFill = activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'arrow';
  const showProps = activeTool !== 'eraser' && activeTool !== 'text' && activeTool !== 'select';

  const gridLabel = useMemo(() => {
    switch (gridMode) {
      case 'dot': return 'Dots';
      case 'line': return 'Grid';
      default: return 'Off';
    }
  }, [gridMode]);

  const handleUndo = () => {
    useCanvasStore.getState().undo();
  };

  const handleRedo = () => {
    useCanvasStore.getState().redo();
  };

  const zoomToCenter = (direction: 'in' | 'out') => {
    const store = useCanvasStore.getState();
    const oldScale = store.stageScale;
    const newScale = nextZoomStep(oldScale, direction);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const mouseX = (cx - store.stageX) / oldScale;
    const mouseY = (cy - store.stageY) / oldScale;
    store.setStageScale(newScale);
    store.setStagePosition(cx - mouseX * newScale, cy - mouseY * newScale);
  };

  return (
    <div className="fixed left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 glass-panel p-1.5 z-panel select-none">
      {/* ─── Drawing Tools ─── */}
      {TOOLS.map(({ type, label, shortcut, Icon }) => (
        <button
          key={type}
          onClick={() => setActiveTool(type)}
          title={`${label} (${shortcut})`}
          className={`tool-btn ${activeTool === type ? 'active' : ''}`}
          aria-label={label}
          aria-pressed={activeTool === type}
        >
          <Icon />
        </button>
      ))}

      <div className="toolbar-sep" />

      {/* ─── Tool Properties ─── */}
      {activeTool === 'eraser' ? (
        <div className="flex flex-col items-center gap-1 py-1.5 px-0.5">
          <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Size</span>
          <input
            type="range"
            min={3}
            max={40}
            value={eraserRadius}
            onChange={(e) => setEraserRadius(Number(e.target.value))}
            className="styled-slider w-20"
            title="Eraser size"
            aria-label="Eraser size"
          />
          <span className="text-[11px] text-slate-400 tabular-nums">{eraserRadius}px</span>
        </div>
      ) : activeTool === 'text' ? (
        <div className="flex flex-col items-center gap-1 py-1.5 px-0.5">
          <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Font</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setToolFontSize(Math.max(8, toolFontSize - 2))}
              className="tool-btn !w-7 !h-7"
              aria-label="Decrease font size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[11px] text-slate-300 tabular-nums w-8 text-center">{toolFontSize}</span>
            <button
              onClick={() => setToolFontSize(Math.min(72, toolFontSize + 2))}
              className="tool-btn !w-7 !h-7"
              aria-label="Increase font size"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : showProps && (
        <div className="flex flex-col items-center gap-2 py-1.5 px-0.5">
          {/* Color pickers */}
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-slate-500">Stroke</span>
              <input
                type="color"
                value={toolColor}
                onChange={(e) => setToolColor(e.target.value)}
                className="color-input"
                title="Stroke color"
                aria-label="Stroke color"
              />
            </div>
            {showFill && (
              <>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-slate-500">Fill</span>
                  <input
                    type="color"
                    value={toolFill === 'transparent' ? '#ffffff' : toolFill}
                    onChange={(e) => setToolFill(e.target.value)}
                    className="color-input"
                    title="Fill color"
                    aria-label="Fill color"
                  />
                </div>
                <button
                  onClick={() => {
                    if (toolFill === 'transparent') {
                      setToolFill('#3B82F6');
                    } else {
                      setToolFill('transparent');
                    }
                  }}
                  className={`tool-btn !w-6 !h-6 mt-3.5 !rounded-md ${
                    toolFill === 'transparent' ? 'opacity-40' : ''
                  }`}
                  title={toolFill === 'transparent' ? 'Enable fill' : 'Clear fill'}
                  aria-label={toolFill === 'transparent' ? 'Enable fill' : 'Clear fill'}
                >
                  <span className="text-[11px] font-bold leading-none">
                    {toolFill === 'transparent' ? '∅' : '×'}
                  </span>
                </button>
              </>
            )}
          </div>

          {/* Stroke width */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500 w-5 text-right">W</span>
            <input
              type="range"
              min={1}
              max={20}
              value={toolWidth}
              onChange={(e) => setToolWidth(Number(e.target.value))}
              className="styled-slider flex-1 min-w-[60px]"
              title="Stroke width"
              aria-label="Stroke width"
            />
            <span className="text-[11px] text-slate-400 tabular-nums w-5">{toolWidth}</span>
          </div>
        </div>
      )}

      <div className="toolbar-sep" />

      {/* ─── Undo / Redo ─── */}
      <button onClick={handleUndo} title="Undo (Ctrl+Z)" className="tool-btn" aria-label="Undo">
        <Undo2 />
      </button>
      <button onClick={handleRedo} title="Redo (Ctrl+Shift+Z)" className="tool-btn" aria-label="Redo">
        <Redo2 />
      </button>

      <div className="toolbar-sep" />

      {/* ─── Zoom ─── */}
      <button onClick={() => zoomToCenter('in')} title="Zoom In (Ctrl+Scroll)" className="tool-btn" aria-label="Zoom in">
        <ZoomIn />
      </button>
      <button
        onClick={() => {
          const store = useCanvasStore.getState();
          store.setStageScale(1);
          store.setStagePosition(0, 0);
        }}
        title="Reset zoom & position"
        className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer py-1 font-medium tabular-nums"
      >
        {Math.round(stageScale * 100)}%
      </button>
      <button onClick={() => zoomToCenter('out')} title="Zoom Out (Ctrl+Scroll)" className="tool-btn" aria-label="Zoom out">
        <ZoomOut />
      </button>
      <button
        onClick={() => useCanvasStore.getState().setStagePosition(0, 0)}
        title="Reset Position"
        className="tool-btn"
        aria-label="Reset position"
      >
        <Maximize />
      </button>

      <div className="toolbar-sep" />

      {/* ─── View Options ─── */}
      <button
        onClick={() => {
          const next: Record<string, 'none' | 'dot' | 'line'> = {
            none: 'dot',
            dot: 'line',
            line: 'none',
          };
          setGridMode(next[gridMode] || 'none');
        }}
        title={`Grid: ${gridLabel}`}
        className={`tool-btn ${gridMode !== 'none' ? 'active' : ''}`}
        aria-label={`Grid mode: ${gridLabel}`}
      >
        <Grid3X3 />
      </button>
      <button
        onClick={() => {
          const store = useCanvasStore.getState();
          store.setShowHistory(!store.showHistory);
        }}
        title="History"
        className={`tool-btn ${showHistory ? 'active' : ''}`}
        aria-label="Toggle history panel"
      >
        <History />
      </button>

      <div className="toolbar-sep" />

      {/* ─── Align (multi-select only) ─── */}
      {showAlign && (
        <>
          <div className="flex items-center gap-0.5">
            <button onClick={alignService.alignLeft} title="Align Left" className="tool-btn" aria-label="Align left">
              <AlignLeft />
            </button>
            <button onClick={alignService.alignCenterH} title="Align Center (H)" className="tool-btn" aria-label="Align center horizontal">
              <AlignCenter />
            </button>
            <button onClick={alignService.alignRight} title="Align Right" className="tool-btn" aria-label="Align right">
              <AlignRight />
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={alignService.alignTop} title="Align Top" className="tool-btn" aria-label="Align top">
              <AlignVerticalJustifyStart />
            </button>
            <button onClick={alignService.alignCenterV} title="Align Center (V)" className="tool-btn" aria-label="Align center vertical">
              <AlignVerticalJustifyCenter />
            </button>
            <button onClick={alignService.alignBottom} title="Align Bottom" className="tool-btn" aria-label="Align bottom">
              <AlignVerticalJustifyEnd />
            </button>
          </div>
          <div className="toolbar-sep" />
        </>
      )}

      {/* ─── Settings ─── */}
      <button
        onClick={() => useUserPrefs.getState().setShowSettings(true)}
        title="Settings"
        className="tool-btn"
        aria-label="Open settings"
      >
        <Settings />
      </button>

      {/* ─── Export ─── */}
      <button
        onClick={() => useCanvasStore.getState().requestExport()}
        title="Export PNG"
        className="tool-btn"
        aria-label="Export as PNG"
      >
        <Download />
      </button>
    </div>
  );
}
