// Local-first editor store.
//
// Holds ONE project (with many named layout options / versions) and autosaves it
// to localStorage on every change. Supabase sync layers on top of this later —
// the persisted `project` object is exactly what we'll push to `plan_versions`.
//
// Undo/redo (zundo) is wired in the Design phase, once geometry mutations exist.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { PlanDocument, Project, PlanVersion, Opening, Wall, FurnitureItem, TraceImage } from '../types/plan';
import { createProject, createVersion, createBlankPlan } from '../lib/factory';
import { catalogueByKind } from '../lib/catalogue';
import { newId, nowIso } from '../lib/id';

const STORAGE_KEY = 'floor-planner:project';

interface EditorState {
  project: Project;

  // --- selectors ---
  getActiveVersion: () => PlanVersion | undefined;
  getActivePlan: () => PlanDocument | undefined;

  // --- project actions ---
  newProject: (name?: string) => void;
  renameProject: (name: string) => void;
  loadProject: (project: Project) => void;

  // --- version / option actions ---
  addVersion: (name?: string) => void;
  duplicateActiveVersion: (name?: string) => void;
  switchVersion: (id: string) => void;
  renameVersion: (id: string, name: string) => void;
  deleteVersion: (id: string) => void;

  // --- plan editing ---
  updatePlan: (recipe: (plan: PlanDocument) => void) => void;

  // --- geometry ---
  /** commit a chain of world points as walls, reusing existing nodes when close */
  addWallChain: (points: { x: number; y: number }[], closed: boolean) => void;
  deleteWalls: (ids: string[]) => void;
  updateWall: (id: string, patch: Partial<Pick<Wall, 'thickness'>>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  /** name an auto-detected room by its node-set signature (empty clears it) */
  setRoomName: (signature: string, name: string) => void;

  // --- openings (doors / windows) ---
  addOpening: (wallId: string, offset: number, type: 'door' | 'window') => void;
  deleteOpenings: (ids: string[]) => void;
  moveOpening: (id: string, offset: number) => void;
  updateOpening: (id: string, patch: Partial<Pick<Opening, 'width'>>) => void;

  // --- furniture / fixtures ---
  addFurniture: (kind: string, x: number, y: number) => void;
  moveFurniture: (id: string, x: number, y: number) => void;
  updateFurniture: (id: string, patch: Partial<Pick<FurnitureItem, 'w' | 'h' | 'rotation'>>) => void;
  deleteFurniture: (ids: string[]) => void;

  // --- floors / storeys ---
  addFloor: () => void;
  duplicateFloor: () => void;
  switchFloor: (id: string) => void;
  renameFloor: (id: string, name: string) => void;
  deleteFloor: (id: string) => void;

  // --- trace image ---
  setTraceImage: (t: TraceImage) => void;
  removeTraceImage: () => void;
  moveTraceImage: (x: number, y: number) => void;
  setTraceOpacity: (opacity: number) => void;
  setTraceRotation: (deg: number) => void;
  setTraceScale: (mmPerPixel: number) => void;
}

const DEFAULT_WALL_THICKNESS = 100; // mm
const NODE_MERGE_EPS = 5; // mm — points this close to an existing node reuse it
const FLOOR_HEIGHT = 2500; // mm between storeys
const FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor'];
const floorName = (i: number) => FLOOR_NAMES[i] ?? `Floor ${i + 1}`;

export const usePlanStore = create<EditorState>()(
  persist(
    immer((set, get) => ({
      project: createProject(),

      getActiveVersion: () => {
        const p = get().project;
        return p.versions.find((v) => v.id === p.activeVersionId);
      },
      getActivePlan: () => get().getActiveVersion()?.plan,

      newProject: (name) =>
        set((s) => {
          s.project = createProject(name);
        }),

      renameProject: (name) =>
        set((s) => {
          s.project.name = name;
          s.project.updatedAt = nowIso();
        }),

      loadProject: (project) =>
        set((s) => {
          s.project = project;
        }),

      addVersion: (name) =>
        set((s) => {
          const v = createVersion(name ?? `Option ${s.project.versions.length + 1}`);
          s.project.versions.push(v);
          s.project.activeVersionId = v.id;
          s.project.updatedAt = nowIso();
        }),

      duplicateActiveVersion: (name) => {
        // clone the committed (plain) plan via get(), NOT inside the immer
        // producer — cloning a draft proxy throws DataCloneError.
        const st = get();
        const cur = st.project.versions.find((v) => v.id === st.project.activeVersionId);
        const sourcePlan = cur ? structuredClone(cur.plan) : createBlankPlan();
        const copy = createVersion(name ?? `${cur?.name ?? 'Option'} (copy)`, sourcePlan);
        set((s) => {
          s.project.versions.push(copy);
          s.project.activeVersionId = copy.id;
          s.project.updatedAt = nowIso();
        });
      },

      switchVersion: (id) =>
        set((s) => {
          if (s.project.versions.some((v) => v.id === id)) {
            s.project.activeVersionId = id;
          }
        }),

      renameVersion: (id, name) =>
        set((s) => {
          const v = s.project.versions.find((x) => x.id === id);
          if (v) {
            v.name = name;
            v.updatedAt = nowIso();
          }
        }),

      deleteVersion: (id) =>
        set((s) => {
          // never delete the last remaining option
          if (s.project.versions.length <= 1) return;
          const idx = s.project.versions.findIndex((v) => v.id === id);
          if (idx === -1) return;
          s.project.versions.splice(idx, 1);
          if (s.project.activeVersionId === id) {
            s.project.activeVersionId = s.project.versions[Math.max(0, idx - 1)].id;
          }
          s.project.updatedAt = nowIso();
        }),

      updatePlan: (recipe) =>
        set((s) => {
          const v = s.project.versions.find((x) => x.id === s.project.activeVersionId);
          if (!v) return;
          recipe(v.plan);
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      addWallChain: (points, closed) =>
        set((s) => {
          const v = s.project.versions.find((x) => x.id === s.project.activeVersionId);
          if (!v || points.length < 2) return;
          const plan = v.plan;
          const floor = plan.activeFloor;

          const nodeIdForPoint = (pt: { x: number; y: number }): string => {
            const existing = plan.nodes.find(
              (n) => n.floor === floor && Math.hypot(n.x - pt.x, n.y - pt.y) <= NODE_MERGE_EPS,
            );
            if (existing) return existing.id;
            const id = newId();
            plan.nodes.push({ id, floor, x: pt.x, y: pt.y });
            return id;
          };

          const ids = points.map(nodeIdForPoint);
          const addWall = (a: string, b: string) => {
            if (a === b) return;
            const exists = plan.walls.some(
              (w) => (w.a === a && w.b === b) || (w.a === b && w.b === a),
            );
            if (exists) return;
            plan.walls.push({ id: newId(), a, b, thickness: DEFAULT_WALL_THICKNESS });
          };

          for (let i = 0; i < ids.length - 1; i++) addWall(ids[i], ids[i + 1]);
          if (closed && ids.length >= 3) addWall(ids[ids.length - 1], ids[0]);

          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      deleteWalls: (ids) =>
        set((s) => {
          const v = s.project.versions.find((x) => x.id === s.project.activeVersionId);
          if (!v) return;
          const plan = v.plan;
          const removing = new Set(ids);
          plan.walls = plan.walls.filter((w) => !removing.has(w.id));
          // drop openings that were hosted on removed walls
          plan.openings = plan.openings.filter((o) => plan.walls.some((w) => w.id === o.wallId));
          // drop nodes no longer referenced by any wall
          const used = new Set<string>();
          plan.walls.forEach((w) => {
            used.add(w.a);
            used.add(w.b);
          });
          plan.nodes = plan.nodes.filter((n) => used.has(n.id));
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      updateWall: (id, patch) =>
        set((s) => {
          const v = s.project.versions.find((x) => x.id === s.project.activeVersionId);
          if (!v) return;
          const w = v.plan.walls.find((x) => x.id === id);
          if (!w) return;
          if (patch.thickness !== undefined) w.thickness = Math.max(20, patch.thickness);
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      moveNode: (id, x, y) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const n = v.plan.nodes.find((z) => z.id === id);
          if (!n) return;
          n.x = x;
          n.y = y;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      setRoomName: (signature, name) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          if (!v.plan.roomNames) v.plan.roomNames = {};
          const trimmed = name.trim();
          if (trimmed) v.plan.roomNames[signature] = trimmed;
          else delete v.plan.roomNames[signature];
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      addOpening: (wallId, offset, type) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const plan = v.plan;
          const w = plan.walls.find((x) => x.id === wallId);
          if (!w) return;
          const a = plan.nodes.find((n) => n.id === w.a);
          const b = plan.nodes.find((n) => n.id === w.b);
          if (!a || !b) return;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const width = type === 'door' ? 900 : 1200;
          if (len < width + 40) return; // wall too short to host this opening
          const off = Math.max(width / 2 + 20, Math.min(len - width / 2 - 20, offset));
          const opening: Opening =
            type === 'door'
              ? { id: newId(), type: 'door', wallId, offset: off, width, swing: 'left-in' }
              : { id: newId(), type: 'window', wallId, offset: off, width, sill: 900 };
          plan.openings.push(opening);
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      deleteOpenings: (ids) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const rm = new Set(ids);
          v.plan.openings = v.plan.openings.filter((o) => !rm.has(o.id));
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      moveOpening: (id, offset) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const o = v.plan.openings.find((x) => x.id === id);
          if (!o) return;
          const w = v.plan.walls.find((x) => x.id === o.wallId);
          if (!w) return;
          const a = v.plan.nodes.find((n) => n.id === w.a);
          const b = v.plan.nodes.find((n) => n.id === w.b);
          if (!a || !b) return;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          o.offset = Math.max(o.width / 2 + 20, Math.min(len - o.width / 2 - 20, offset));
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      updateOpening: (id, patch) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const o = v.plan.openings.find((x) => x.id === id);
          if (!o) return;
          if (patch.width !== undefined) {
            const w = v.plan.walls.find((x) => x.id === o.wallId);
            const a = w && v.plan.nodes.find((n) => n.id === w.a);
            const b = w && v.plan.nodes.find((n) => n.id === w.b);
            const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : Infinity;
            // at least 200mm, and small enough to leave a 20mm jamb each side of the wall
            const maxWidth = Math.max(200, len - 40);
            o.width = Math.max(200, Math.min(maxWidth, patch.width));
            // re-clamp the centre so the resized opening still sits within the wall
            if (Number.isFinite(len)) {
              o.offset = Math.max(o.width / 2 + 20, Math.min(len - o.width / 2 - 20, o.offset));
            }
          }
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      addFurniture: (kind, x, y) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const cat = catalogueByKind.get(kind);
          if (!cat) return;
          v.plan.furniture.push({
            id: newId(),
            floor: v.plan.activeFloor,
            kind,
            x,
            y,
            w: cat.w,
            h: cat.h,
            rotation: 0,
          });
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      moveFurniture: (id, x, y) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const f = v.plan.furniture.find((z) => z.id === id);
          if (!f) return;
          f.x = x;
          f.y = y;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      updateFurniture: (id, patch) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const f = v.plan.furniture.find((z) => z.id === id);
          if (!f) return;
          if (patch.w !== undefined) f.w = Math.max(50, patch.w);
          if (patch.h !== undefined) f.h = Math.max(50, patch.h);
          if (patch.rotation !== undefined) f.rotation = ((patch.rotation % 360) + 360) % 360;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      deleteFurniture: (ids) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const rm = new Set(ids);
          v.plan.furniture = v.plan.furniture.filter((f) => !rm.has(f.id));
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      addFloor: () =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const plan = v.plan;
          const id = newId();
          const maxElev = Math.max(...plan.floors.map((f) => f.elevation));
          plan.floors.push({ id, name: floorName(plan.floors.length), elevation: maxElev + FLOOR_HEIGHT });
          plan.activeFloor = id;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      duplicateFloor: () =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const plan = v.plan;
          const src = plan.activeFloor;
          const srcFloor = plan.floors.find((f) => f.id === src);
          const newFloorId = newId();
          const maxElev = Math.max(...plan.floors.map((f) => f.elevation));
          plan.floors.push({
            id: newFloorId,
            name: `${srcFloor?.name ?? 'Floor'} (copy)`,
            elevation: maxElev + FLOOR_HEIGHT,
          });
          // remap nodes on the source floor to fresh ids on the new floor
          const idMap = new Map<string, string>();
          for (const n of plan.nodes.filter((n) => n.floor === src)) {
            const nid = newId();
            idMap.set(n.id, nid);
            plan.nodes.push({ id: nid, floor: newFloorId, x: n.x, y: n.y });
          }
          // walls whose endpoints are both on the source floor
          const wallMap = new Map<string, string>();
          for (const w of plan.walls) {
            if (!idMap.has(w.a) || !idMap.has(w.b)) continue;
            const wid = newId();
            wallMap.set(w.id, wid);
            plan.walls.push({ id: wid, a: idMap.get(w.a)!, b: idMap.get(w.b)!, thickness: w.thickness });
          }
          // openings hosted on those walls
          for (const o of plan.openings) {
            if (!wallMap.has(o.wallId)) continue;
            plan.openings.push({ ...o, id: newId(), wallId: wallMap.get(o.wallId)! });
          }
          // furniture on the source floor
          for (const f of plan.furniture.filter((f) => f.floor === src)) {
            plan.furniture.push({ ...f, id: newId(), floor: newFloorId });
          }
          plan.activeFloor = newFloorId;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      switchFloor: (id) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          if (v.plan.floors.some((f) => f.id === id)) v.plan.activeFloor = id;
        }),

      renameFloor: (id, name) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const f = v.plan.floors.find((x) => x.id === id);
          if (f && name.trim()) f.name = name.trim();
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      deleteFloor: (id) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          const plan = v.plan;
          if (plan.floors.length <= 1) return; // keep at least one floor
          const nodeIds = new Set(plan.nodes.filter((n) => n.floor === id).map((n) => n.id));
          const wallIds = new Set(
            plan.walls.filter((w) => nodeIds.has(w.a) || nodeIds.has(w.b)).map((w) => w.id),
          );
          plan.walls = plan.walls.filter((w) => !wallIds.has(w.id));
          plan.openings = plan.openings.filter((o) => !wallIds.has(o.wallId));
          plan.nodes = plan.nodes.filter((n) => n.floor !== id);
          plan.furniture = plan.furniture.filter((f) => f.floor !== id);
          plan.floors = plan.floors.filter((f) => f.id !== id);
          if (plan.activeFloor === id) plan.activeFloor = plan.floors[0].id;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      setTraceImage: (t) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          v.plan.traceImage = t;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      removeTraceImage: () =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v) return;
          v.plan.traceImage = null;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      moveTraceImage: (x, y) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v || !v.plan.traceImage) return;
          v.plan.traceImage.x = x;
          v.plan.traceImage.y = y;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      setTraceOpacity: (opacity) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v || !v.plan.traceImage) return;
          v.plan.traceImage.opacity = Math.max(0.05, Math.min(1, opacity));
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      setTraceRotation: (deg) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v || !v.plan.traceImage) return;
          v.plan.traceImage.rotation = ((deg % 360) + 360) % 360;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),

      setTraceScale: (mmPerPixel) =>
        set((s) => {
          const v = s.project.versions.find((z) => z.id === s.project.activeVersionId);
          if (!v || !v.plan.traceImage) return;
          if (mmPerPixel > 0 && Number.isFinite(mmPerPixel)) v.plan.traceImage.mmPerPixel = mmPerPixel;
          v.updatedAt = nowIso();
          s.project.updatedAt = nowIso();
        }),
    })),
    {
      name: STORAGE_KEY,
      // only persist the project data, never the action functions
      partialize: (s) => ({ project: s.project }),
    },
  ),
);
