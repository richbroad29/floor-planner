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
