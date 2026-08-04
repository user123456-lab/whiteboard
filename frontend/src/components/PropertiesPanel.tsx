import { useEffect, useMemo, useState } from 'react';
import {
  Pencil,
  Square,
  Circle,
  ArrowRight,
  Type,
  Image,
  Lock,
  Unlock,
  Trash2,
  X,
} from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { Shape, ShapeType } from '../types';

const TYPE_ICONS: Record<ShapeType, React.ComponentType<{ className?: string }>> = {
  brush: Pencil,
  rectangle: Square,
  circle: Circle,
  arrow: ArrowRight,
  text: Type,
  image: Image,
};

const TYPE_NAMES: Record<ShapeType, string> = {
  brush: 'Brush',
  rectangle: 'Rectangle',
  circle: 'Circle',
  arrow: 'Arrow',
  text: 'Text',
  image: 'Image',
};

function updateProperty(shapeId: string, changes: Record<string, unknown>) {
  const store = useCanvasStore.getState();
  store.updateShape(shapeId, changes);
}

function toggleLockProperty(shape: Shape) {
  const store = useCanvasStore.getState();
  if (shape.userId !== store.userId) return;
  store.toggleLock(shape.id);
}

function deleteShape(shapeId: string) {
  useCanvasStore.getState().deleteShape(shapeId);
}

/* ── Inline mini-components ── */

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px] text-slate-400 flex-shrink-0">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="color-input !w-7 !h-7"
        aria-label={label}
      />
    </div>
  );
}

function RangeSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 gap-1.5">
      <span className="text-[11px] text-slate-400 flex-shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="styled-slider flex-1 min-w-[50px]"
        aria-label={label}
      />
      <span className="text-[11px] text-slate-500 tabular-nums w-6 text-right">{value}</span>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(Math.round(value)));

  // Sync from external shape changes (remote update, align, etc.)
  useEffect(() => {
    const extRounded = String(Math.round(value));
    if (String(Math.round(Number(local))) !== extRounded && document.activeElement?.tagName !== 'INPUT') {
      setLocal(extRounded);
    }
  }, [value]);

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-500 w-3 text-right">{label}</span>
      <input
        type="number"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          const n = Number(e.target.value);
          if (!isNaN(n)) onChange(Math.round(n));
        }}
        onBlur={() => setLocal(String(Math.round(value)))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const n = Math.round(value) + (e.shiftKey ? 10 : 1);
            onChange(n);
            setLocal(String(n));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const n = Math.round(value) - (e.shiftKey ? 10 : 1);
            onChange(n);
            setLocal(String(n));
          }
        }}
        className="w-16 px-1.5 py-0.5 bg-white/5 rounded text-[11px] text-slate-200 outline-none border border-white/10 focus:border-accent focus:ring-1 focus:ring-accent/20 tabular-nums text-center transition-all"
        aria-label={label}
      />
    </div>
  );
}

/* ── Main component ── */

export function PropertiesPanel() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const shapes = useCanvasStore((s) => s.shapes);
  const userId = useCanvasStore((s) => s.userId);

  const shape = useMemo(() => shapes.find((s) => s.id === selectedIds[0]), [shapes, selectedIds]);

  if (selectedIds.length === 0 || !shape) return null;

  const isOwner = shape.userId === userId;
  const TypeIcon = TYPE_ICONS[shape.type];
  const showStroke = shape.type !== 'text' && shape.type !== 'image';
  const showFill = shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'arrow';
  const showFont = shape.type === 'text';
  const showPos = shape.type === 'rectangle' || shape.type === 'circle' || shape.type === 'text' || shape.type === 'image';
  const showSize = shape.type === 'rectangle' || shape.type === 'image';

  return (
    <div className="fixed right-3 top-1/2 -translate-y-1/2 glass-panel p-3 w-[200px] z-overlay select-none space-y-0.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <TypeIcon className="w-4 h-4 text-slate-300" />
          <span className="text-[12px] text-slate-300 font-medium">
            {TYPE_NAMES[shape.type]}
          </span>
        </div>
        <button
          onClick={() => useCanvasStore.getState().setSelectedId(null)}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 cursor-pointer transition-colors"
          aria-label="Close properties"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stroke Color */}
      {showStroke && (
        <ColorInput
          label="Stroke"
          value={shape.color}
          onChange={(v) => updateProperty(shape.id, { color: v })}
        />
      )}

      {/* Fill Color */}
      {showFill && (
        <div className="flex items-center justify-between py-0.5">
          <span className="text-[11px] text-slate-400">Fill</span>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={(shape.fill && shape.fill !== 'transparent') ? shape.fill : '#ffffff'}
              onChange={(e) => updateProperty(shape.id, { fill: e.target.value })}
              className="color-input !w-7 !h-7"
              aria-label="Fill color"
            />
            <button
              onClick={() =>
                updateProperty(shape.id, {
                  fill: (shape.fill && shape.fill !== 'transparent') ? 'transparent' : '#3B82F6',
                })
              }
              className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold transition-colors cursor-pointer ${
                !shape.fill || shape.fill === 'transparent'
                  ? 'text-slate-600 bg-white/5'
                  : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
              }`}
              title={(!shape.fill || shape.fill === 'transparent') ? 'No fill' : 'Clear fill'}
              aria-label="Toggle fill"
            >
              {(!shape.fill || shape.fill === 'transparent') ? '∅' : '×'}
            </button>
          </div>
        </div>
      )}

      {/* Stroke Width */}
      {showStroke && (
        <RangeSlider
          label="Width"
          value={shape.strokeWidth}
          min={1}
          max={20}
          onChange={(v) => updateProperty(shape.id, { strokeWidth: v })}
        />
      )}

      {/* Font Size + Text Color */}
      {showFont && 'fontSize' in shape && (
        <>
          <ColorInput
            label="Color"
            value={shape.color}
            onChange={(v) => updateProperty(shape.id, { color: v })}
          />
          <RangeSlider
            label="Size"
            value={(shape as Shape & { fontSize: number }).fontSize ?? 18}
            min={8}
            max={72}
            step={2}
            onChange={(v) => updateProperty(shape.id, { fontSize: v })}
          />
        </>
      )}

      {/* Position & Size */}
      {(showPos || showSize) && (
        <div className="border-t border-white/5 pt-2 mt-1 space-y-1">
          {showPos && 'x' in shape && 'y' in shape && (
            <div className="flex items-center justify-between">
              <NumberInput
                label="X"
                value={(shape as Shape & { x: number }).x}
                onChange={(v) => updateProperty(shape.id, { x: v })}
              />
              <NumberInput
                label="Y"
                value={(shape as Shape & { y: number }).y}
                onChange={(v) => updateProperty(shape.id, { y: v })}
              />
            </div>
          )}

          {showSize && 'width' in shape && 'height' in shape && (
            <div className="flex items-center justify-between">
              <NumberInput
                label="W"
                value={(shape as Shape & { width: number }).width}
                onChange={(v) => updateProperty(shape.id, { width: v })}
              />
              <NumberInput
                label="H"
                value={(shape as Shape & { height: number }).height}
                onChange={(v) => updateProperty(shape.id, { height: v })}
              />
            </div>
          )}

          {shape.type === 'circle' && 'radius' in shape && (
            <NumberInput
              label="R"
              value={(shape as Shape & { radius: number }).radius}
              onChange={(v) => updateProperty(shape.id, { radius: v })}
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-white/5 pt-2 mt-1 flex gap-1.5">
        {isOwner && (
          <button
            onClick={() => toggleLockProperty(shape)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer ${
              shape.locked
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                : 'text-slate-400 bg-white/5 border border-white/5 hover:bg-white/10 hover:text-slate-200'
            }`}
          >
            {shape.locked ? (
              <Lock className="w-3 h-3" />
            ) : (
              <Unlock className="w-3 h-3" />
            )}
            {shape.locked ? 'Locked' : 'Lock'}
          </button>
        )}
        <button
          onClick={() => deleteShape(shape.id)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-all cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  );
}
