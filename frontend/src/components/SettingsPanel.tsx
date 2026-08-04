import { X } from 'lucide-react';
import { useUserPrefs, type UiStyle } from '../store/useUserPrefs';

const STYLE_OPTIONS: { value: UiStyle; label: string; bg: string }[] = [
  { value: 'oled-dark', label: 'OLED Dark', bg: '#0A0A0B' },
  { value: 'slate-dark', label: 'Slate Dark', bg: '#0F172A' },
];

const CANVAS_PRESETS = [
  '#0A0A0B', '#0F172A', '#1a1a2e', '#0d1117',
  '#1a1c23', '#1e1e24', '#2d2d2d', '#ffffff',
];

export function SettingsPanel() {
  const canvasBg = useUserPrefs((s) => s.canvasBg);
  const uiStyle = useUserPrefs((s) => s.uiStyle);
  const setCanvasBg = useUserPrefs((s) => s.setCanvasBg);
  const setUiStyle = useUserPrefs((s) => s.setUiStyle);
  const setShowSettings = useUserPrefs((s) => s.setShowSettings);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-modal bg-black/60 backdrop-blur-sm">
      <div className="glass-panel p-5 w-[320px] max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm text-slate-200 font-semibold">Settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* UI Style */}
        <label className="text-[11px] text-slate-500 font-medium tracking-wide uppercase mb-2 block">
          Theme
        </label>
        <div className="flex gap-2 mb-4">
          {STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setUiStyle(opt.value)}
              className={`flex-1 py-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer border ${
                uiStyle === opt.value
                  ? 'bg-accent/15 text-accent border-accent/40'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full mx-auto mb-1 border border-white/20"
                style={{ background: opt.bg }}
              />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Canvas Background */}
        <label className="text-[11px] text-slate-500 font-medium tracking-wide uppercase mb-2 block">
          Canvas Background
        </label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {CANVAS_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => setCanvasBg(color)}
              className={`w-7 h-7 rounded-md border-2 transition-all cursor-pointer ${
                canvasBg === color ? 'border-accent scale-110' : 'border-white/10 hover:border-white/30'
              }`}
              style={{ background: color }}
              title={color}
            />
          ))}
        </div>

        {/* Custom color */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Custom</span>
          <input
            type="color"
            value={canvasBg}
            onChange={(e) => setCanvasBg(e.target.value)}
            className="color-input !w-7 !h-7"
          />
          <span className="text-[11px] text-slate-400 font-mono">{canvasBg}</span>
        </div>
      </div>
    </div>
  );
}
