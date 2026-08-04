import { create } from 'zustand';

export type UiStyle = 'oled-dark' | 'slate-dark';

interface UserPrefs {
  canvasBg: string;
  uiStyle: UiStyle;
  showSettings: boolean;
  setCanvasBg: (color: string) => void;
  setUiStyle: (style: UiStyle) => void;
  setShowSettings: (show: boolean) => void;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem('wb-prefs');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function savePrefs(prefs: { canvasBg: string; uiStyle: UiStyle }) {
  localStorage.setItem('wb-prefs', JSON.stringify(prefs));
}

const saved = loadPrefs();

export const useUserPrefs = create<UserPrefs>((set, get) => ({
  canvasBg: (saved.canvasBg as string) || '#0A0A0B',
  uiStyle: (saved.uiStyle as UiStyle) || 'oled-dark',
  showSettings: false,

  setCanvasBg: (color) => {
    set({ canvasBg: color });
    savePrefs({ canvasBg: color, uiStyle: get().uiStyle });
  },

  setUiStyle: (style) => {
    set({ uiStyle: style });
    const bgMap: Record<UiStyle, string> = {
      'oled-dark': '#0A0A0B',
      'slate-dark': '#0F172A',
    };
    set({ canvasBg: bgMap[style] });
    savePrefs({ canvasBg: bgMap[style], uiStyle: style });
  },

  setShowSettings: (show) => set({ showSettings: show }),
}));
