import { useCanvasStore } from '../store/useCanvasStore';
import type { Shape } from '../types';

interface PosEntry {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
}

function getBounds(s: PosEntry) {
  if (s.radius !== undefined) {
    // Circle: x,y is center
    return { left: s.x - s.radius, top: s.y - s.radius, right: s.x + s.radius, bottom: s.y + s.radius };
  }
  // Rectangle/Image/Text: x,y is top-left
  return { left: s.x, top: s.y, right: s.x + (s.width ?? 0), bottom: s.y + (s.height ?? 0) };
}

function getCenter(s: PosEntry) {
  const b = getBounds(s);
  return { cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 };
}

function getSelectedPositioned(): PosEntry[] {
  const store = useCanvasStore.getState();
  const result: PosEntry[] = [];
  for (const id of store.selectedIds) {
    const s = store.shapes.find((sh) => sh.id === id);
    if (!s || !('x' in s) || !('y' in s)) continue;
    result.push({
      id: s.id,
      x: (s as Shape & { x: number }).x,
      y: (s as Shape & { y: number }).y,
      width: 'width' in s ? (s as Shape & { width: number }).width : undefined,
      height: 'height' in s ? (s as Shape & { height: number }).height : undefined,
      radius: 'radius' in s ? (s as Shape & { radius: number }).radius : undefined,
    });
  }
  return result;
}

export function alignLeft(): void {
  const shapes = getSelectedPositioned();
  if (shapes.length < 2) return;
  const minX = Math.min(...shapes.map((s) => s.x));
  const store = useCanvasStore.getState();
  for (const s of shapes) store.updateShape(s.id, { x: minX });
}

export function alignRight(): void {
  const shapes = getSelectedPositioned();
  if (shapes.length < 2) return;
  const maxRight = Math.max(...shapes.map((s) => getBounds(s).right));
  const store = useCanvasStore.getState();
  for (const s of shapes) store.updateShape(s.id, { x: s.x + maxRight - getBounds(s).right });
}

export function alignCenterH(): void {
  const shapes = getSelectedPositioned();
  if (shapes.length < 2) return;
  const avgCx = shapes.reduce((a, s) => a + getCenter(s).cx, 0) / shapes.length;
  const store = useCanvasStore.getState();
  for (const s of shapes) store.updateShape(s.id, { x: s.x + avgCx - getCenter(s).cx });
}

export function alignTop(): void {
  const shapes = getSelectedPositioned();
  if (shapes.length < 2) return;
  const minY = Math.min(...shapes.map((s) => s.y));
  const store = useCanvasStore.getState();
  for (const s of shapes) store.updateShape(s.id, { y: minY });
}

export function alignBottom(): void {
  const shapes = getSelectedPositioned();
  if (shapes.length < 2) return;
  const maxBottom = Math.max(...shapes.map((s) => getBounds(s).bottom));
  const store = useCanvasStore.getState();
  for (const s of shapes) store.updateShape(s.id, { y: s.y + maxBottom - getBounds(s).bottom });
}

export function alignCenterV(): void {
  const shapes = getSelectedPositioned();
  if (shapes.length < 2) return;
  const avgCy = shapes.reduce((a, s) => a + getCenter(s).cy, 0) / shapes.length;
  const store = useCanvasStore.getState();
  for (const s of shapes) store.updateShape(s.id, { y: s.y + avgCy - getCenter(s).cy });
}

