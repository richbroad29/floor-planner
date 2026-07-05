// Ephemeral editor UI state: current tool, viewport (pan/zoom), the in-progress
// wall draft, the snapped cursor, and the current selection. NOT persisted and
// NOT part of the plan document / undo history.
import { create } from 'zustand';
import type { Point } from '../lib/geometry';

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'scale';

export interface Viewport {
  /** CSS pixels per millimetre */
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.004;
const MAX_SCALE = 3;

interface UIState {
  tool: Tool;
  viewport: Viewport;
  /** committed points of the wall currently being drawn (world mm), or null */
  draft: Point[] | null;
  /** snapped cursor position in world mm, for previews */
  cursor: Point | null;
  selectedWallIds: string[];
  selectedOpeningIds: string[];
  selectedFurnitureIds: string[];
  /** current canvas pixel size, used to place new items at the view centre */
  size: { w: number; h: number };
  /** first point of the scale-calibration line (world mm), or null */
  calibStart: Point | null;

  setTool: (t: Tool) => void;
  setViewport: (vp: Viewport) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;

  startDraft: (p: Point) => void;
  addDraftPoint: (p: Point) => void;
  clearDraft: () => void;
  setCursor: (p: Point | null) => void;

  setSelectedWalls: (ids: string[]) => void;
  setSelectedOpenings: (ids: string[]) => void;
  setSelectedFurniture: (ids: string[]) => void;
  setSize: (w: number, h: number) => void;
  clearSelection: () => void;
  setCalibStart: (p: Point | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  tool: 'select',
  viewport: { scale: 0.06, tx: 120, ty: 120 },
  draft: null,
  cursor: null,
  selectedWallIds: [],
  selectedOpeningIds: [],
  selectedFurnitureIds: [],
  size: { w: 800, h: 600 },
  calibStart: null,

  setTool: (t) =>
    set({
      tool: t,
      draft: null,
      selectedWallIds: [],
      selectedOpeningIds: [],
      selectedFurnitureIds: [],
      calibStart: null,
    }),
  setViewport: (vp) => set({ viewport: vp }),

  panBy: (dx, dy) =>
    set((s) => ({ viewport: { ...s.viewport, tx: s.viewport.tx + dx, ty: s.viewport.ty + dy } })),

  zoomAt: (screenX, screenY, factor) =>
    set((s) => {
      const vp = s.viewport;
      const wx = (screenX - vp.tx) / vp.scale;
      const wy = (screenY - vp.ty) / vp.scale;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale * factor));
      return { viewport: { scale, tx: screenX - wx * scale, ty: screenY - wy * scale } };
    }),

  startDraft: (p) => set({ draft: [p] }),
  addDraftPoint: (p) => set((s) => ({ draft: s.draft ? [...s.draft, p] : [p] })),
  clearDraft: () => set({ draft: null }),
  setCursor: (p) => set({ cursor: p }),

  setSelectedWalls: (ids) => set({ selectedWallIds: ids }),
  setSelectedOpenings: (ids) => set({ selectedOpeningIds: ids }),
  setSelectedFurniture: (ids) => set({ selectedFurnitureIds: ids }),
  setSize: (w, h) => set({ size: { w, h } }),
  clearSelection: () =>
    set({ selectedWallIds: [], selectedOpeningIds: [], selectedFurnitureIds: [], draft: null }),
  setCalibStart: (p) => set({ calibStart: p }),
}));
