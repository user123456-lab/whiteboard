import { Pencil, Square, Circle, ArrowRight, Type, Image } from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { HistoryEntry, ShapeType } from '../types';

const typeIcons: Record<ShapeType, React.ComponentType<{ className?: string }>> = {
  brush: Pencil,
  rectangle: Square,
  circle: Circle,
  arrow: ArrowRight,
  text: Type,
  image: Image,
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export function HistoryPanel() {
  const history = useCanvasStore((s) => s.history);
  const shapes = useCanvasStore((s) => s.shapes);
  const setSelectedId = useCanvasStore((s) => s.setSelectedId);

  const entries = [...history].reverse();

  const handleClick = (entry: HistoryEntry) => {
    const exists = shapes.some((s) => s.id === entry.shapeId);
    if (exists) {
      setSelectedId(entry.shapeId);
    }
  };

  return (
    <div className="fixed right-3 top-14 w-60 max-h-80 overflow-y-auto glass-panel z-overlay">
      <div className="px-3 py-2.5 border-b border-white/5">
        <h3 className="text-xs text-slate-300 font-medium tracking-wide">History</h3>
      </div>

      {entries.length === 0 ? (
        <div className="px-3 py-4">
          <p className="text-[11px] text-slate-600 text-center">No actions yet</p>
        </div>
      ) : (
        <div className="divide-y divide-white/3">
          {entries.map((entry) => {
            const exists = shapes.some((s) => s.id === entry.shapeId);
            const Icon = typeIcons[entry.shapeType];
            return (
              <button
                key={entry.id}
                onClick={() => handleClick(entry)}
                disabled={!exists}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  exists
                    ? 'hover:bg-white/5 cursor-pointer'
                    : 'cursor-default opacity-40'
                }`}
              >
                {Icon && <Icon className="w-4 h-4 flex-shrink-0 text-slate-400" />}
                <span className="flex-1 text-[12px] text-slate-300 truncate">
                  {entry.label}
                  {!exists && (
                    <span className="text-red-400 text-[10px] ml-1">(deleted)</span>
                  )}
                </span>
                <span className="text-[10px] text-slate-600 flex-shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
