// World <-> screen transforms and small geometry helpers.
// World coordinates are millimetres; screen coordinates are CSS pixels.
import type { Viewport } from '../store/uiStore';

export interface Point {
  x: number;
  y: number;
}

export const worldToScreen = (p: Point, vp: Viewport): Point => ({
  x: p.x * vp.scale + vp.tx,
  y: p.y * vp.scale + vp.ty,
});

export const screenToWorld = (p: Point, vp: Viewport): Point => ({
  x: (p.x - vp.tx) / vp.scale,
  y: (p.y - vp.ty) / vp.scale,
});

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const snapToGrid = (p: Point, size: number): Point => ({
  x: Math.round(p.x / size) * size,
  y: Math.round(p.y / size) * size,
});

/** Shortest distance from point p to segment ab. */
export function distPointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** An axis-aligned rectangle in world coordinates. */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Build the axis-aligned rect spanning two (unordered) corner points. */
export const rectFromPoints = (a: Point, b: Point): Rect => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
});

export const pointInRect = (p: Point, r: Rect): boolean =>
  p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

/** Signed area of triangle abc; its sign says which side of line ab point c is on. */
const ccw = (a: Point, b: Point, c: Point): number =>
  (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);

/** Do segments ab and cd cross? True when c,d straddle line ab AND a,b straddle
 *  line cd — i.e. the orientation signs differ on each side. (Comparing the raw
 *  ccw values instead of their signs matches nearly always, which would make a
 *  marquee select every wall on the canvas.) */
const segmentsCross = (a: Point, b: Point, c: Point, d: Point): boolean =>
  Math.sign(ccw(a, c, d)) !== Math.sign(ccw(b, c, d)) &&
  Math.sign(ccw(a, b, c)) !== Math.sign(ccw(a, b, d));

/** True if segment ab touches rect r (either endpoint inside, or it crosses an edge). */
export function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  const tl = { x: r.minX, y: r.minY };
  const tr = { x: r.maxX, y: r.minY };
  const br = { x: r.maxX, y: r.maxY };
  const bl = { x: r.minX, y: r.maxY };
  return (
    segmentsCross(a, b, tl, tr) ||
    segmentsCross(a, b, tr, br) ||
    segmentsCross(a, b, br, bl) ||
    segmentsCross(a, b, bl, tl)
  );
}

/** Project point p onto segment ab, returning the parameter t (0..1), the
 *  projected point, and the perpendicular distance. */
export function projectPointToSegment(
  p: Point,
  a: Point,
  b: Point,
): { t: number; point: Point; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { t: 0, point: { ...a }, dist: dist(p, a) };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, point, dist: dist(p, point) };
}
