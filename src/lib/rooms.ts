// Auto-detect rooms as the minimal enclosed faces of the wall graph.
//
// Treat walls as edges of a planar graph. From each directed half-edge we walk
// the face by always taking, at the arrival node, the neighbour that makes the
// smallest clockwise turn from the edge we came in on. Each such walk traces one
// face; the single unbounded "outer" face has the opposite orientation and is
// discarded by its area sign.
import type { PlanDocument } from '../types/plan';
import type { Point } from './geometry';

export interface DetectedRoom {
  boundary: string[]; // node ids in order
  polygon: Point[];
  area: number; // mm², absolute
  centroid: Point;
  signature: string; // stable key for the node set (for naming)
}

const TWO_PI = Math.PI * 2;

export function detectRooms(plan: PlanDocument): DetectedRoom[] {
  const floor = plan.activeFloor;
  const nodes = new Map<string, Point>();
  for (const n of plan.nodes) if (n.floor === floor) nodes.set(n.id, { x: n.x, y: n.y });

  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const w of plan.walls) {
    if (!nodes.has(w.a) || !nodes.has(w.b) || w.a === w.b) continue;
    link(w.a, w.b);
    link(w.b, w.a);
  }

  const angle = (from: string, to: string): number => {
    const p = nodes.get(from)!;
    const q = nodes.get(to)!;
    return Math.atan2(q.y - p.y, q.x - p.x);
  };

  // From half-edge u->v, the next face edge is the neighbour of v with the
  // smallest clockwise turn measured from the reverse direction (v->u).
  const nextEdge = (u: string, v: string): string | null => {
    const neighbours = adj.get(v);
    if (!neighbours || neighbours.length === 0) return null;
    const base = angle(v, u);
    let best: string | null = null;
    let bestDiff = Infinity;
    for (const w of neighbours) {
      let diff = base - angle(v, w);
      diff = ((diff % TWO_PI) + TWO_PI) % TWO_PI; // (0, 2π]
      if (diff <= 1e-9) diff = TWO_PI; // avoid taking the reverse edge unless forced
      if (diff < bestDiff) {
        bestDiff = diff;
        best = w;
      }
    }
    return best;
  };

  const visited = new Set<string>();
  const key = (a: string, b: string) => `${a}->${b}`;
  const rooms: DetectedRoom[] = [];

  for (const w of plan.walls) {
    if (!nodes.has(w.a) || !nodes.has(w.b)) continue;
    const starts: [string, string][] = [
      [w.a, w.b],
      [w.b, w.a],
    ];
    for (const [su, sv] of starts) {
      if (visited.has(key(su, sv))) continue;
      const boundary: string[] = [];
      let u = su;
      let v = sv;
      let ok = true;
      for (let guard = 0; guard < 10000; guard++) {
        visited.add(key(u, v));
        boundary.push(u);
        const next = nextEdge(u, v);
        if (next == null) {
          ok = false;
          break;
        }
        u = v;
        v = next;
        if (u === su && v === sv) break;
      }
      if (!ok || boundary.length < 3) continue;

      const poly = boundary.map((id) => nodes.get(id)!);
      let cross2 = 0;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const c = p.x * q.y - q.x * p.y;
        cross2 += c;
        cx += (p.x + q.x) * c;
        cy += (p.y + q.y) * c;
      }
      const signed = cross2 / 2;
      // In screen coords (y-down) interior faces come out negative; the outer
      // face is positive — drop it.
      if (signed >= 0) continue;
      const area = Math.abs(signed);
      const centroid: Point =
        cross2 !== 0 ? { x: cx / (3 * cross2), y: cy / (3 * cross2) } : poly[0];
      const signature = [...boundary].sort().join(',');
      rooms.push({ boundary, polygon: poly, area, centroid, signature });
    }
  }

  return rooms;
}
