// Render geometry for doors & windows hosted on walls.
// Each opening is positioned by (wallId, offset); this derives the on-screen
// shapes: a white "gap" that erases the wall, jamb caps, and either a door
// swing arc + leaf or a window pane.
import type { PlanDocument, Opening, OpeningType } from '../types/plan';
import type { Point } from './geometry';
import { dist } from './geometry';

export interface OpeningGeom {
  id: string;
  type: OpeningType;
  center: Point;
  gap: Point[]; // 4-corner polygon that covers (erases) the wall at the opening
  jamb1: [Point, Point];
  jamb2: [Point, Point];
  door?: { hinge: Point; open: Point; closed: Point; r: number; sweep: number };
  glass?: { a: Point; b: Point };
}

export function openingGeom(
  o: Opening,
  plan: PlanDocument,
  nodeMap: Map<string, Point>,
): OpeningGeom | null {
  const w = plan.walls.find((x) => x.id === o.wallId);
  if (!w) return null;
  const a = nodeMap.get(w.a);
  const b = nodeMap.get(w.b);
  if (!a || !b) return null;
  const len = dist(a, b);
  if (len === 0) return null;

  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len; // unit direction
  const nx = -dy;
  const ny = dx; // unit normal
  const c = { x: a.x + dx * o.offset, y: a.y + dy * o.offset };
  const hw = o.width / 2;
  const htErase = w.thickness / 2 + 14; // overhang so the wall is fully cut
  const htExact = w.thickness / 2;

  const pt = (sd: number, sn: number, ht: number): Point => ({
    x: c.x + dx * hw * sd + nx * ht * sn,
    y: c.y + dy * hw * sd + ny * ht * sn,
  });

  const gap = [pt(1, 1, htErase), pt(1, -1, htErase), pt(-1, -1, htErase), pt(-1, 1, htErase)];
  const jamb1: [Point, Point] = [pt(1, 1, htExact), pt(1, -1, htExact)];
  const jamb2: [Point, Point] = [pt(-1, 1, htExact), pt(-1, -1, htExact)];

  if (o.type === 'door') {
    // `swing` picks the hinge end (left/right = which jamb the leaf is fixed to,
    // measured along the wall a->b) and the face the leaf swings across
    // (in/out = which side of the wall's normal).
    const swing = o.swing ?? 'left-in';
    const hingeSign = swing.startsWith('left') ? -1 : 1; // along the wall
    const swingSign = swing.endsWith('in') ? 1 : -1; // across the wall (normal)
    const hinge = { x: c.x + dx * hw * hingeSign, y: c.y + dy * hw * hingeSign };
    const closed = { x: c.x - dx * hw * hingeSign, y: c.y - dy * hw * hingeSign };
    const open = { x: hinge.x + nx * o.width * swingSign, y: hinge.y + ny * o.width * swingSign };
    // Choose the SVG arc sweep so the quarter-circle is centred on the hinge and
    // bulges away from it — i.e. it traces the leaf's true swept outer edge.
    const cross = (closed.x - hinge.x) * (open.y - hinge.y) - (closed.y - hinge.y) * (open.x - hinge.x);
    const sweep = cross > 0 ? 1 : 0;
    return {
      id: o.id,
      type: 'door',
      center: c,
      gap,
      jamb1,
      jamb2,
      door: { hinge, open, closed, r: o.width, sweep },
    };
  }
  const glass = {
    a: { x: c.x - dx * hw, y: c.y - dy * hw },
    b: { x: c.x + dx * hw, y: c.y + dy * hw },
  };
  return { id: o.id, type: 'window', center: c, gap, jamb1, jamb2, glass };
}

export function computeOpenings(plan: PlanDocument, nodeMap: Map<string, Point>): OpeningGeom[] {
  const out: OpeningGeom[] = [];
  for (const o of plan.openings) {
    const g = openingGeom(o, plan, nodeMap);
    if (g) out.push(g);
  }
  return out;
}
