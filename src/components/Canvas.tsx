// The 2D drawing surface: an SVG with a world->screen transform group.
// Handles pan (space-drag / middle-drag), wheel zoom, the wall tool
// (click-to-place polyline with snapping + close-loop) and basic selection.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePlanStore } from '../store/planStore';
import { useUIStore } from '../store/uiStore';
import type { Viewport } from '../store/uiStore';
import type { PlanDocument } from '../types/plan';
import {
  dist,
  distPointToSegment,
  midpoint,
  pointInRect,
  projectPointToSegment,
  rectFromPoints,
  screenToWorld,
  segmentIntersectsRect,
  snapToGrid,
  worldToScreen,
  type Point,
  type Rect,
} from '../lib/geometry';
import { formatArea, formatLength } from '../lib/units';
import { detectRooms } from '../lib/rooms';
import { computeOpenings, openingGeom, type OpeningGeom } from '../lib/openings';
import type { Opening, FurnitureItem, TraceImage, ClipboardData } from '../types/plan';
import { catalogueByKind } from '../lib/catalogue';

const OPENING_WALL_TOL_PX = 40; // how close to a wall a click/hover counts

/** top-left (min x, min y) of a clipboard's contents, in world mm — used to
 *  drop the paste so its top-left lands under the mouse. */
function clipboardTopLeft(data: ClipboardData): Point | null {
  let minX = Infinity;
  let minY = Infinity;
  for (const n of data.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
  }
  for (const f of data.furniture) {
    const rad = (f.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = f.w / 2;
    const hh = f.h / 2;
    for (const [sx, sy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as const) {
      const x = f.x + sx * cos - sy * sin;
      const y = f.y + sx * sin + sy * cos;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY };
}

/** does a (rotated) furniture footprint's bounding box overlap rect r? */
function furnitureIntersectsRect(f: FurnitureItem, r: Rect): boolean {
  const rad = (f.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = f.w / 2;
  const hh = f.h / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ] as const) {
    const x = f.x + sx * cos - sy * sin;
    const y = f.y + sx * sin + sy * cos;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return minX <= r.maxX && maxX >= r.minX && minY <= r.maxY && maxY >= r.minY;
}

/** all active-floor walls / openings / furniture touched by a marquee rect */
function collectInRect(
  plan: PlanDocument,
  rect: Rect,
): { wallIds: string[]; openingIds: string[]; furnitureIds: string[] } {
  const floor = plan.activeFloor;
  const wallIds: string[] = [];
  for (const w of plan.walls) {
    const a = plan.nodes.find((n) => n.id === w.a);
    const b = plan.nodes.find((n) => n.id === w.b);
    if (!a || !b || a.floor !== floor) continue;
    if (segmentIntersectsRect(a, b, rect)) wallIds.push(w.id);
  }
  const openingIds: string[] = [];
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const a = plan.nodes.find((n) => n.id === w.a);
    const b = plan.nodes.find((n) => n.id === w.b);
    if (!a || !b || a.floor !== floor) continue;
    const len = dist(a, b);
    if (len === 0) continue;
    const cx = a.x + ((b.x - a.x) * o.offset) / len;
    const cy = a.y + ((b.y - a.y) * o.offset) / len;
    if (pointInRect({ x: cx, y: cy }, rect)) openingIds.push(o.id);
  }
  const furnitureIds: string[] = [];
  for (const f of plan.furniture) {
    if (f.floor !== floor) continue;
    if (furnitureIntersectsRect(f, rect)) furnitureIds.push(f.id);
  }
  return { wallIds, openingIds, furnitureIds };
}

/** build a self-contained clipboard from the selected walls + furniture.
 *  Walls carry their nodes and every opening hosted on them; openings whose
 *  host wall isn't selected can't be copied (they have nowhere to live). */
function buildClipboard(
  plan: PlanDocument,
  wallIds: string[],
  furnitureIds: string[],
): ClipboardData | null {
  const wallSet = new Set(wallIds);
  const walls = plan.walls
    .filter((w) => wallSet.has(w.id))
    .map((w) => ({ id: w.id, a: w.a, b: w.b, thickness: w.thickness }));
  const nodeIds = new Set<string>();
  walls.forEach((w) => {
    nodeIds.add(w.a);
    nodeIds.add(w.b);
  });
  const nodes = plan.nodes.filter((n) => nodeIds.has(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
  const openings = plan.openings.filter((o) => wallSet.has(o.wallId)).map((o) => ({ ...o }));
  const furnitureSet = new Set(furnitureIds);
  const furniture = plan.furniture.filter((f) => furnitureSet.has(f.id)).map((f) => ({ ...f }));
  if (!walls.length && !furniture.length) return null;
  return { nodes, walls, openings, furniture };
}

/** find the wall nearest to a world point (within tol mm) and the offset along it */
function nearestWall(
  world: Point,
  plan: PlanDocument,
  tol: number,
): { wall: PlanDocument['walls'][number]; offset: number } | null {
  let best: { wall: PlanDocument['walls'][number]; offset: number } | null = null;
  let bestD = tol;
  for (const w of plan.walls) {
    const a = plan.nodes.find((n) => n.id === w.a);
    const b = plan.nodes.find((n) => n.id === w.b);
    if (!a || !b || a.floor !== plan.activeFloor) continue; // active floor only
    const pr = projectPointToSegment(world, a, b);
    if (pr.dist <= bestD) {
      bestD = pr.dist;
      best = { wall: w, offset: pr.t * dist(a, b) };
    }
  }
  return best;
}

/** is a world point inside a (rotated) furniture footprint? */
function pointInItem(world: Point, f: FurnitureItem): boolean {
  const dx = world.x - f.x;
  const dy = world.y - f.y;
  const r = (-f.rotation * Math.PI) / 180;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= f.w / 2 && Math.abs(ly) <= f.h / 2;
}

/** is a world point inside the (rotated) trace image, whose origin is its top-left? */
function pointInTrace(world: Point, t: TraceImage): boolean {
  const dx = world.x - t.x;
  const dy = world.y - t.y;
  const r = (-t.rotation * Math.PI) / 180;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return lx >= 0 && ly >= 0 && lx <= t.naturalW * t.mmPerPixel && ly <= t.naturalH * t.mmPerPixel;
}

const CLICK_SNAP_PX = 12; // screen px within which we snap to a node / draft start
const WALL_HIT_PX = 8;

function activePlan(): PlanDocument | undefined {
  const p = usePlanStore.getState().project;
  return p.versions.find((v) => v.id === p.activeVersionId)?.plan;
}

/** snap a screen point to the nearest node, then draft-start (for closing), then grid */
function computeSnap(screen: Point, vp: Viewport, plan: PlanDocument, draft: Point[] | null): Point {
  const raw = screenToWorld(screen, vp);
  const tol = CLICK_SNAP_PX / vp.scale; // world mm

  let best: Point | null = null;
  let bestD = tol;
  for (const n of plan.nodes) {
    if (n.floor !== plan.activeFloor) continue;
    const d = dist(raw, n);
    if (d <= bestD) {
      bestD = d;
      best = { x: n.x, y: n.y };
    }
  }
  if (best) return best;

  if (draft && draft.length > 0 && dist(raw, draft[0]) <= tol) return draft[0];
  if (plan.grid.snap) return snapToGrid(raw, plan.grid.size);
  return raw;
}

export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const panning = useRef<{ x: number; y: number } | null>(null);
  const nodeDrag = useRef<{ id: string } | null>(null);
  const openingDrag = useRef<{ id: string } | null>(null);
  const furnitureDrag = useRef<{ id: string; gx: number; gy: number } | null>(null);
  const traceDrag = useRef<{ gx: number; gy: number } | null>(null);
  const spaceHeld = useRef(false);

  // last pointer position over the canvas (svg-relative screen px), for paste-at-mouse
  const pointerScreen = useRef<Point | null>(null);

  // marquee (rubber-band) selection, in world coords
  const marqueeStart = useRef<Point | null>(null);
  const marqueeRectRef = useRef<Rect | null>(null);
  const [marquee, setMarqueeState] = useState<Rect | null>(null);
  const setMarquee = useCallback((r: Rect | null) => {
    marqueeRectRef.current = r;
    setMarqueeState(r);
  }, []);

  // reactive slices for rendering
  const plan = usePlanStore((s) => s.project.versions.find((v) => v.id === s.project.activeVersionId)?.plan);
  const viewport = useUIStore((s) => s.viewport);
  const tool = useUIStore((s) => s.tool);
  const draft = useUIStore((s) => s.draft);
  const cursor = useUIStore((s) => s.cursor);
  const selected = useUIStore((s) => s.selectedWallIds);
  const selectedOpenings = useUIStore((s) => s.selectedOpeningIds);
  const selectedFurniture = useUIStore((s) => s.selectedFurnitureIds);
  const calibStart = useUIStore((s) => s.calibStart);

  // stable actions
  const {
    startDraft,
    addDraftPoint,
    clearDraft,
    setCursor,
    panBy,
    zoomAt,
    setSelectedWalls,
    setSelectedOpenings,
    setSelectedFurniture,
    setSize: setUiSize,
    setCalibStart,
  } = useUIStore.getState();
  const {
    addWallChain,
    deleteWalls,
    moveNode,
    setRoomName,
    addOpening,
    deleteOpenings,
    moveOpening,
    moveFurniture,
    updateFurniture,
    deleteFurniture,
    moveTraceImage,
    setTraceScale,
    pasteItems,
  } = usePlanStore.getState();

  // keep the SVG sized to its container
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const sync = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      setUiSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, [setUiSize]);

  const screenPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const p = activePlan();
      if (!p) return;
      svgRef.current?.setPointerCapture(e.pointerId);
      const screen = screenPoint(e.clientX, e.clientY);
      pointerScreen.current = screen;
      const vp = useUIStore.getState().viewport;

      // pan: middle button, or space + left
      if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
        panning.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;

      const t = useUIStore.getState().tool;
      const d = useUIStore.getState().draft;

      if (t === 'wall') {
        const snap = computeSnap(screen, vp, p, d);
        if (!d) {
          startDraft(snap);
        } else if (d.length >= 2 && dist(snap, d[0]) <= 1) {
          addWallChain(d, true); // clicked the start node -> close the loop
          clearDraft();
        } else if (dist(snap, d[d.length - 1]) > 1) {
          addDraftPoint(snap);
        }
        return;
      }

      if (t === 'door' || t === 'window') {
        const world = screenToWorld(screen, vp);
        const hit = nearestWall(world, p, OPENING_WALL_TOL_PX / vp.scale);
        if (hit) addOpening(hit.wall.id, hit.offset, t);
        return;
      }

      if (t === 'scale') {
        const world = screenToWorld(screen, vp);
        const cs = useUIStore.getState().calibStart;
        if (!cs) {
          setCalibStart(world);
        } else {
          const ti = p.traceImage;
          const len = dist(cs, world);
          if (ti && len > 0) {
            const answer = window.prompt('Real length of this line, in metres:');
            const realMm = answer ? parseFloat(answer) * 1000 : NaN;
            if (Number.isFinite(realMm) && realMm > 0) setTraceScale((ti.mmPerPixel * realMm) / len);
          }
          setCalibStart(null);
        }
        return;
      }

      // select tool
      const world = screenToWorld(screen, vp);
      const nodeTol = CLICK_SNAP_PX / vp.scale;
      let hitNode: string | null = null;
      let bnd = nodeTol;
      for (const n of p.nodes) {
        if (n.floor !== p.activeFloor) continue;
        const dd = dist(world, n);
        if (dd <= bnd) {
          bnd = dd;
          hitNode = n.id;
        }
      }
      if (hitNode) {
        nodeDrag.current = { id: hitNode };
        return;
      }

      // opening hit-test (doors/windows sit on top of walls)
      const openTol = (CLICK_SNAP_PX * 1.6) / vp.scale;
      let hitOpening: string | null = null;
      let bod = openTol;
      for (const o of p.openings) {
        const w = p.walls.find((x) => x.id === o.wallId);
        if (!w) continue;
        const a = p.nodes.find((n) => n.id === w.a);
        const b = p.nodes.find((n) => n.id === w.b);
        if (!a || !b || a.floor !== p.activeFloor) continue;
        const len = dist(a, b);
        if (len === 0) continue;
        const cx = a.x + ((b.x - a.x) * o.offset) / len;
        const cy = a.y + ((b.y - a.y) * o.offset) / len;
        const dd = dist(world, { x: cx, y: cy });
        if (dd <= bod) {
          bod = dd;
          hitOpening = o.id;
        }
      }
      if (hitOpening) {
        openingDrag.current = { id: hitOpening };
        setSelectedOpenings([hitOpening]);
        setSelectedWalls([]);
        setSelectedFurniture([]);
        return;
      }

      // furniture hit-test (topmost first)
      for (let i = p.furniture.length - 1; i >= 0; i--) {
        const f = p.furniture[i];
        if (f.floor !== p.activeFloor) continue;
        if (pointInItem(world, f)) {
          furnitureDrag.current = { id: f.id, gx: world.x - f.x, gy: world.y - f.y };
          setSelectedFurniture([f.id]);
          setSelectedWalls([]);
          setSelectedOpenings([]);
          return;
        }
      }

      const wallTol = WALL_HIT_PX / vp.scale;
      let hitWall: string | null = null;
      let bwd = wallTol;
      for (const w of p.walls) {
        const a = p.nodes.find((n) => n.id === w.a);
        const b = p.nodes.find((n) => n.id === w.b);
        if (!a || !b || a.floor !== p.activeFloor) continue;
        const dd = distPointToSegment(world, a, b);
        if (dd <= bwd) {
          bwd = dd;
          hitWall = w.id;
        }
      }
      if (hitWall) {
        setSelectedWalls([hitWall]);
        setSelectedOpenings([]);
        setSelectedFurniture([]);
        return;
      }
      // trace image drag (lowest priority — only when nothing else was hit)
      const ti = p.traceImage;
      if (ti && ti.floor === p.activeFloor && pointInTrace(world, ti)) {
        traceDrag.current = { gx: world.x - ti.x, gy: world.y - ti.y };
        setSelectedWalls([]);
        setSelectedOpenings([]);
        setSelectedFurniture([]);
        return;
      }
      // nothing hit — begin a marquee. A plain click ends as a zero-area rect,
      // which selects nothing and so clears the selection on pointer-up.
      marqueeStart.current = world;
      setMarquee(rectFromPoints(world, world));
    },
    [
      screenPoint,
      startDraft,
      addDraftPoint,
      clearDraft,
      addWallChain,
      addOpening,
      setCalibStart,
      setTraceScale,
      setSelectedWalls,
      setSelectedOpenings,
      setSelectedFurniture,
      setMarquee,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const p = activePlan();
      if (!p) return;
      if (panning.current) {
        panBy(e.clientX - panning.current.x, e.clientY - panning.current.y);
        panning.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const screen = screenPoint(e.clientX, e.clientY);
      pointerScreen.current = screen;
      const vp = useUIStore.getState().viewport;
      if (nodeDrag.current) {
        const snap = computeSnap(screen, vp, p, null);
        moveNode(nodeDrag.current.id, snap.x, snap.y);
        return;
      }
      if (openingDrag.current) {
        const o = p.openings.find((x) => x.id === openingDrag.current!.id);
        const w = o && p.walls.find((x) => x.id === o.wallId);
        const a = w && p.nodes.find((n) => n.id === w.a);
        const b = w && p.nodes.find((n) => n.id === w.b);
        if (o && a && b) {
          const world = screenToWorld(screen, vp);
          const pr = projectPointToSegment(world, a, b);
          moveOpening(o.id, pr.t * dist(a, b));
        }
        return;
      }
      if (furnitureDrag.current) {
        const world = screenToWorld(screen, vp);
        let nx = world.x - furnitureDrag.current.gx;
        let ny = world.y - furnitureDrag.current.gy;
        if (p.grid.snap) {
          const g = snapToGrid({ x: nx, y: ny }, p.grid.size);
          nx = g.x;
          ny = g.y;
        }
        moveFurniture(furnitureDrag.current.id, nx, ny);
        return;
      }
      if (traceDrag.current) {
        const world = screenToWorld(screen, vp);
        moveTraceImage(world.x - traceDrag.current.gx, world.y - traceDrag.current.gy);
        return;
      }
      if (marqueeStart.current) {
        const world = screenToWorld(screen, vp);
        setMarquee(rectFromPoints(marqueeStart.current, world));
        return;
      }
      const t = useUIStore.getState().tool;
      if (t === 'door' || t === 'window' || t === 'scale') {
        setCursor(screenToWorld(screen, vp)); // raw: preview projects onto the wall / trace
        return;
      }
      const d = useUIStore.getState().draft;
      setCursor(computeSnap(screen, vp, p, d));
    },
    [screenPoint, panBy, moveNode, moveOpening, moveFurniture, moveTraceImage, setCursor, setMarquee],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // finish a marquee: select everything it touched (empty rect => deselect)
      if (marqueeStart.current) {
        const p = activePlan();
        const rect = marqueeRectRef.current;
        if (p && rect) {
          const sel = collectInRect(p, rect);
          setSelectedWalls(sel.wallIds);
          setSelectedOpenings(sel.openingIds);
          setSelectedFurniture(sel.furnitureIds);
        }
        marqueeStart.current = null;
        setMarquee(null);
      }
      panning.current = null;
      nodeDrag.current = null;
      openingDrag.current = null;
      furnitureDrag.current = null;
      traceDrag.current = null;
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [setMarquee, setSelectedWalls, setSelectedOpenings, setSelectedFurniture],
  );

  const onDoubleClick = useCallback(() => {
    const d = useUIStore.getState().draft;
    if (d && d.length >= 2) {
      addWallChain(d, false);
      clearDraft();
    }
  }, [addWallChain, clearDraft]);

  // wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') {
        spaceHeld.current = true;
        return;
      }

      // Cmd/Ctrl + C / X / V — copy, cut, paste the current selection
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === 'c' || k === 'x') {
          const cur = activePlan();
          if (!cur) return;
          const ui = useUIStore.getState();
          const data = buildClipboard(cur, ui.selectedWallIds, ui.selectedFurnitureIds);
          if (!data) return; // nothing copyable — let the browser keep the key
          ui.setClipboard(data);
          if (k === 'x') {
            if (ui.selectedWallIds.length) deleteWalls(ui.selectedWallIds);
            if (ui.selectedFurnitureIds.length) deleteFurniture(ui.selectedFurnitureIds);
            ui.clearSelection();
          }
          e.preventDefault();
          return;
        }
        if (k === 'v') {
          const ui = useUIStore.getState();
          const data = ui.clipboard;
          if (!data) return;
          const tl = clipboardTopLeft(data);
          if (!tl) return;
          // drop the paste so its top-left sits under the mouse (fallback: view centre)
          const scr = pointerScreen.current ?? { x: ui.size.w / 2, y: ui.size.h / 2 };
          let target = screenToWorld(scr, ui.viewport);
          const cur = activePlan(); // paste onto whichever floor is active now (cross-floor OK)
          if (cur?.grid.snap) target = snapToGrid(target, cur.grid.size);
          const res = pasteItems(data, target.x - tl.x, target.y - tl.y);
          ui.setTool('select'); // pasted items land ready to drag (also clears old selection)
          ui.setSelectedWalls(res.wallIds);
          ui.setSelectedOpenings(res.openingIds);
          ui.setSelectedFurniture(res.furnitureIds);
          e.preventDefault();
          return;
        }
        return; // other Cmd/Ctrl combos pass through to the browser
      }

      if (e.key === 'v' || e.key === 'V') {
        useUIStore.getState().setTool('select');
        return;
      }
      if (e.key === 'w' || e.key === 'W') {
        useUIStore.getState().setTool('wall');
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        const selF = useUIStore.getState().selectedFurnitureIds;
        if (selF.length) {
          const cur = activePlan();
          for (const id of selF) {
            const f = cur?.furniture.find((z) => z.id === id);
            if (f) updateFurniture(id, { rotation: f.rotation + (e.shiftKey ? -15 : 15) });
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        clearDraft();
        setSelectedWalls([]);
        setSelectedOpenings([]);
        setSelectedFurniture([]);
      } else if (e.key === 'Enter') {
        const d = useUIStore.getState().draft;
        if (d && d.length >= 2) {
          addWallChain(d, false);
          clearDraft();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = useUIStore.getState().selectedWallIds;
        const selO = useUIStore.getState().selectedOpeningIds;
        const selF = useUIStore.getState().selectedFurnitureIds;
        if (sel.length) {
          deleteWalls(sel);
          setSelectedWalls([]);
        }
        if (selO.length) {
          deleteOpenings(selO);
          setSelectedOpenings([]);
        }
        if (selF.length) {
          deleteFurniture(selF);
          setSelectedFurniture([]);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceHeld.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    clearDraft,
    addWallChain,
    deleteWalls,
    deleteOpenings,
    deleteFurniture,
    updateFurniture,
    pasteItems,
    setSelectedWalls,
    setSelectedOpenings,
    setSelectedFurniture,
  ]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    // only the active floor's nodes, so walls/openings on other floors don't render
    plan?.nodes.forEach((n) => {
      if (n.floor === plan.activeFloor) m.set(n.id, { x: n.x, y: n.y });
    });
    return m;
  }, [plan]);

  const rooms = useMemo(() => (plan ? detectRooms(plan) : []), [plan]);
  const openingGeoms = useMemo(() => (plan ? computeOpenings(plan, nodeMap) : []), [plan, nodeMap]);

  if (!plan) return <div ref={wrapRef} className="canvas-wrap" />;

  const unit = plan.units.displayUnit;
  const selectedSet = new Set(selected);
  const selectedOpeningSet = new Set(selectedOpenings);
  const selectedFurnitureSet = new Set(selectedFurniture);

  // ghost preview for the door / window tools
  let previewGeom: OpeningGeom | null = null;
  if ((tool === 'door' || tool === 'window') && cursor) {
    const hit = nearestWall(cursor, plan, OPENING_WALL_TOL_PX / viewport.scale);
    if (hit) {
      const width = tool === 'door' ? 900 : 1200;
      const fake: Opening =
        tool === 'door'
          ? { id: '__preview', type: 'door', wallId: hit.wall.id, offset: hit.offset, width, swing: 'left-in' }
          : { id: '__preview', type: 'window', wallId: hit.wall.id, offset: hit.offset, width, sill: 900 };
      previewGeom = openingGeom(fake, plan, nodeMap);
    }
  }

  const ptsOf = (arr: Point[]) => arr.map((p) => `${p.x},${p.y}`).join(' ');
  const renderOpening = (g: OpeningGeom, opts: { selected?: boolean; ghost?: boolean }) => {
    const { ghost } = opts;
    const sym = ghost ? '#60a5fa' : opts.selected ? '#2563eb' : g.type === 'window' ? '#0ea5e9' : '#475569';
    const jamb = ghost ? '#93c5fd' : '#334155';
    // the swing arc is always dotted — it shows the leaf's motion, not a solid edge
    const arcDash = ghost ? '5 5' : '2 4';
    return (
      <g key={g.id} opacity={ghost ? 0.85 : 1}>
        {!ghost && <polygon points={ptsOf(g.gap)} fill="#ffffff" />}
        <line
          x1={g.jamb1[0].x}
          y1={g.jamb1[0].y}
          x2={g.jamb1[1].x}
          y2={g.jamb1[1].y}
          stroke={jamb}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={g.jamb2[0].x}
          y1={g.jamb2[0].y}
          x2={g.jamb2[1].x}
          y2={g.jamb2[1].y}
          stroke={jamb}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {g.door && (
          <>
            <path
              d={`M ${g.door.closed.x} ${g.door.closed.y} A ${g.door.r} ${g.door.r} 0 0 ${g.door.sweep} ${g.door.open.x} ${g.door.open.y}`}
              fill="none"
              stroke={sym}
              strokeWidth={1.5}
              strokeDasharray={arcDash}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={g.door.hinge.x}
              y1={g.door.hinge.y}
              x2={g.door.open.x}
              y2={g.door.open.y}
              stroke={sym}
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {g.glass && (
          <line
            x1={g.glass.a.x}
            y1={g.glass.a.y}
            x2={g.glass.b.x}
            y2={g.glass.b.y}
            stroke={sym}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    );
  };

  // visible grid
  const tl = screenToWorld({ x: 0, y: 0 }, viewport);
  const br = screenToWorld({ x: size.w, y: size.h }, viewport);
  let step = plan.grid.size;
  while ((br.x - tl.x) / step > 240) step *= 2;
  const gridLines: React.ReactNode[] = [];
  for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
    gridLines.push(
      <line key={`gx${x}`} x1={x} y1={tl.y} x2={x} y2={br.y} className="grid-line" vectorEffect="non-scaling-stroke" />,
    );
  }
  for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
    gridLines.push(
      <line key={`gy${y}`} x1={tl.x} y1={y} x2={br.x} y2={y} className="grid-line" vectorEffect="non-scaling-stroke" />,
    );
  }

  const nodeR = 5 / viewport.scale;
  const transform = `translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`;

  const wallGeoms = plan.walls
    .map((w) => {
      const a = nodeMap.get(w.a);
      const b = nodeMap.get(w.b);
      return a && b ? { w, a, b } : null;
    })
    .filter((x): x is { w: (typeof plan.walls)[number]; a: Point; b: Point } => x !== null);

  // ghost of the floor immediately below (by elevation) for alignment
  const floorsSorted = [...plan.floors].sort((a, b) => a.elevation - b.elevation);
  const activeIdx = floorsSorted.findIndex((f) => f.id === plan.activeFloor);
  const ghostFloorId = activeIdx > 0 ? floorsSorted[activeIdx - 1].id : null;
  const ghostNodeMap = new Map<string, Point>();
  if (ghostFloorId) {
    plan.nodes.forEach((n) => {
      if (n.floor === ghostFloorId) ghostNodeMap.set(n.id, { x: n.x, y: n.y });
    });
  }
  const ghostWalls = ghostFloorId
    ? plan.walls
        .map((w) => {
          const a = ghostNodeMap.get(w.a);
          const b = ghostNodeMap.get(w.b);
          return a && b ? { id: w.id, a, b } : null;
        })
        .filter((x): x is { id: string; a: Point; b: Point } => x !== null)
    : [];

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className={`canvas ${tool === 'wall' ? 'tool-wall' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={onDoubleClick}
      >
        {/* world layer */}
        <g transform={transform}>
          {/* trace image (bottom layer) */}
          {plan.traceImage && plan.traceImage.floor === plan.activeFloor && (
            <g
              transform={`translate(${plan.traceImage.x} ${plan.traceImage.y}) rotate(${plan.traceImage.rotation})`}
              opacity={plan.traceImage.opacity}
            >
              <image
                href={plan.traceImage.src}
                x={0}
                y={0}
                width={plan.traceImage.naturalW * plan.traceImage.mmPerPixel}
                height={plan.traceImage.naturalH * plan.traceImage.mmPerPixel}
                preserveAspectRatio="none"
              />
            </g>
          )}

          <g className="grid">{gridLines}</g>

          {/* ghost of the floor below */}
          {ghostWalls.map((g) => (
            <line
              key={`ghost-${g.id}`}
              x1={g.a.x}
              y1={g.a.y}
              x2={g.b.x}
              y2={g.b.y}
              stroke="#cbd5e1"
              strokeWidth={2}
              strokeDasharray="12 8"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* room fills */}
          {rooms.map((r) => (
            <polygon
              key={r.signature}
              points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
              className="room-fill"
            />
          ))}

          {/* wall selection highlight (under) */}
          {plan.walls.map((w) => {
            if (!selectedSet.has(w.id)) return null;
            const a = nodeMap.get(w.a);
            const b = nodeMap.get(w.b);
            if (!a || !b) return null;
            return (
              <line
                key={`sel${w.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#3b82f6"
                strokeOpacity={0.35}
                strokeWidth={w.thickness + 160}
                strokeLinecap="round"
              />
            );
          })}

          {/* walls */}
          {wallGeoms.map(({ w, a, b }) => (
            <line
              key={w.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#334155"
              strokeWidth={w.thickness}
              strokeLinecap="butt"
            />
          ))}

          {/* openings (doors / windows) */}
          {openingGeoms.map((g) => renderOpening(g, { selected: selectedOpeningSet.has(g.id) }))}
          {previewGeom && renderOpening(previewGeom, { ghost: true })}

          {/* furniture & fixtures */}
          {plan.furniture
            .filter((f) => f.floor === plan.activeFloor)
            .map((f) => {
              const sel = selectedFurnitureSet.has(f.id);
              return (
                <g key={f.id} transform={`translate(${f.x} ${f.y}) rotate(${f.rotation})`}>
                  <rect
                    x={-f.w / 2}
                    y={-f.h / 2}
                    width={f.w}
                    height={f.h}
                    rx={40}
                    fill={sel ? 'rgba(37,99,235,0.12)' : 'rgba(100,116,139,0.12)'}
                    stroke={sel ? '#2563eb' : '#64748b'}
                    strokeWidth={sel ? 3 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}

          {/* nodes */}
          {plan.nodes
            .filter((n) => n.floor === plan.activeFloor)
            .map((n) => (
              <circle key={n.id} cx={n.x} cy={n.y} r={nodeR} fill="#334155" />
            ))}

          {/* draft preview */}
          {draft && draft.length > 0 && (
            <g>
              <polyline
                points={draft.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#2563eb"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="6 6"
              />
              {cursor && (
                <line
                  x1={draft[draft.length - 1].x}
                  y1={draft[draft.length - 1].y}
                  x2={cursor.x}
                  y2={cursor.y}
                  stroke="#2563eb"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="6 6"
                />
              )}
              {draft.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={nodeR} fill={i === 0 ? '#16a34a' : '#2563eb'} />
              ))}
            </g>
          )}

          {/* cursor crosshair while drawing */}
          {tool === 'wall' && cursor && (
            <circle cx={cursor.x} cy={cursor.y} r={nodeR * 1.4} fill="none" stroke="#2563eb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          )}

          {/* scale-calibration line */}
          {tool === 'scale' && calibStart && (
            <circle cx={calibStart.x} cy={calibStart.y} r={nodeR} fill="#e11d48" />
          )}
          {tool === 'scale' && calibStart && cursor && (
            <line
              x1={calibStart.x}
              y1={calibStart.y}
              x2={cursor.x}
              y2={cursor.y}
              stroke="#e11d48"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* marquee (rubber-band) selection box */}
          {marquee && (
            <rect
              x={marquee.minX}
              y={marquee.minY}
              width={marquee.maxX - marquee.minX}
              height={marquee.maxY - marquee.minY}
              fill="rgba(37,99,235,0.08)"
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>

        {/* screen-space labels */}
        <g className="labels">
          {wallGeoms.map(({ w, a, b }) => {
            const s = worldToScreen(midpoint(a, b), viewport);
            return (
              <text key={w.id} x={s.x} y={s.y} className="len-label" textAnchor="middle">
                {formatLength(dist(a, b), unit)}
              </text>
            );
          })}
          {draft && draft.length > 0 && cursor && (() => {
            const last = draft[draft.length - 1];
            const s = worldToScreen(midpoint(last, cursor), viewport);
            const len = dist(last, cursor);
            if (len < 1) return null;
            return (
              <text x={s.x} y={s.y} className="len-label draft-label" textAnchor="middle">
                {formatLength(len, unit)}
              </text>
            );
          })()}

          {/* room name + area labels (double-click to rename in Select mode) */}
          {rooms.map((r) => {
            const s = worldToScreen(r.centroid, viewport);
            const name = plan.roomNames?.[r.signature] ?? 'Room';
            return (
              <g
                key={r.signature}
                className="room-label"
                style={{ pointerEvents: tool === 'select' ? 'auto' : 'none' }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const n = window.prompt('Room name', name === 'Room' ? '' : name);
                  if (n !== null) setRoomName(r.signature, n);
                }}
              >
                <text x={s.x} y={s.y - 5} textAnchor="middle" className="room-name">
                  {name}
                </text>
                <text x={s.x} y={s.y + 11} textAnchor="middle" className="room-area">
                  {formatArea(r.area, unit)}
                </text>
              </g>
            );
          })}

          {/* furniture labels */}
          {plan.furniture
            .filter((f) => f.floor === plan.activeFloor)
            .map((f) => {
              const sp = worldToScreen({ x: f.x, y: f.y }, viewport);
              const label = catalogueByKind.get(f.kind)?.label ?? f.kind;
              return (
                <text key={f.id} x={sp.x} y={sp.y} textAnchor="middle" className="furniture-label">
                  {label}
                </text>
              );
            })}
        </g>
      </svg>
    </div>
  );
}
