// Export the active plan to a clean, watermark-free SVG / PNG / PDF.
// We re-render the plan as a standalone SVG fit to its bounding box (no grid,
// selection or UI chrome), then rasterise for PNG or embed as vectors for PDF.
import type { PlanDocument } from '../types/plan';
import { detectRooms } from './rooms';
import { computeOpenings } from './openings';
import { catalogueByKind } from './catalogue';
import { formatArea, formatLength } from './units';
import { dist, midpoint, type Point } from './geometry';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => Math.round(n * 100) / 100;

export interface ExportOptions {
  withDimensions?: boolean;
  withFurniture?: boolean;
}

function bounds(plan: PlanDocument, floor: string) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const acc = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  plan.nodes.filter((n) => n.floor === floor).forEach((n) => acc(n.x, n.y));
  plan.furniture
    .filter((f) => f.floor === floor)
    .forEach((f) => {
      const r = Math.hypot(f.w, f.h) / 2; // circumscribed radius covers any rotation
      acc(f.x - r, f.y - r);
      acc(f.x + r, f.y + r);
    });
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  return { minX, minY, maxX, maxY };
}

export function planToSvgString(plan: PlanDocument, opts: ExportOptions = {}): string {
  const withDimensions = opts.withDimensions ?? true;
  const withFurniture = opts.withFurniture ?? true;
  const floor = plan.activeFloor;
  const unit = plan.units.displayUnit;
  const pad = 700; // mm margin around the drawing

  const b = bounds(plan, floor);
  const minX = b.minX - pad;
  const minY = b.minY - pad;
  const W = b.maxX - b.minX + pad * 2;
  const H = b.maxY - b.minY + pad * 2;

  const nodeMap = new Map<string, Point>(
    plan.nodes.filter((n) => n.floor === floor).map((n) => [n.id, { x: n.x, y: n.y }]),
  );
  const rooms = detectRooms(plan);
  const openings = computeOpenings(plan, nodeMap);
  const parts: string[] = [];

  // room fills
  for (const r of rooms) {
    parts.push(
      `<polygon points="${r.polygon.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')}" fill="#2563eb" fill-opacity="0.06"/>`,
    );
  }

  // walls
  for (const w of plan.walls) {
    const a = nodeMap.get(w.a);
    const c = nodeMap.get(w.b);
    if (!a || !c) continue;
    parts.push(
      `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(c.x)}" y2="${fmt(c.y)}" stroke="#334155" stroke-width="${w.thickness}" stroke-linecap="butt"/>`,
    );
  }

  // openings
  for (const g of openings) {
    parts.push(`<polygon points="${g.gap.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')}" fill="#ffffff"/>`);
    parts.push(
      `<line x1="${fmt(g.jamb1[0].x)}" y1="${fmt(g.jamb1[0].y)}" x2="${fmt(g.jamb1[1].x)}" y2="${fmt(g.jamb1[1].y)}" stroke="#334155" stroke-width="40"/>`,
    );
    parts.push(
      `<line x1="${fmt(g.jamb2[0].x)}" y1="${fmt(g.jamb2[0].y)}" x2="${fmt(g.jamb2[1].x)}" y2="${fmt(g.jamb2[1].y)}" stroke="#334155" stroke-width="40"/>`,
    );
    if (g.door) {
      parts.push(
        `<path d="M ${fmt(g.door.closed.x)} ${fmt(g.door.closed.y)} A ${fmt(g.door.r)} ${fmt(g.door.r)} 0 0 0 ${fmt(g.door.open.x)} ${fmt(g.door.open.y)}" fill="none" stroke="#475569" stroke-width="30"/>`,
      );
      parts.push(
        `<line x1="${fmt(g.door.hinge.x)}" y1="${fmt(g.door.hinge.y)}" x2="${fmt(g.door.open.x)}" y2="${fmt(g.door.open.y)}" stroke="#475569" stroke-width="50"/>`,
      );
    }
    if (g.glass) {
      parts.push(
        `<line x1="${fmt(g.glass.a.x)}" y1="${fmt(g.glass.a.y)}" x2="${fmt(g.glass.b.x)}" y2="${fmt(g.glass.b.y)}" stroke="#0ea5e9" stroke-width="60"/>`,
      );
    }
  }

  // furniture
  if (withFurniture) {
    for (const f of plan.furniture.filter((f) => f.floor === floor)) {
      parts.push(
        `<g transform="translate(${fmt(f.x)} ${fmt(f.y)}) rotate(${fmt(f.rotation)})"><rect x="${fmt(-f.w / 2)}" y="${fmt(-f.h / 2)}" width="${fmt(f.w)}" height="${fmt(f.h)}" rx="40" fill="#94a3b8" fill-opacity="0.15" stroke="#64748b" stroke-width="30"/></g>`,
      );
      const label = catalogueByKind.get(f.kind)?.label ?? f.kind;
      parts.push(
        `<text x="${fmt(f.x)}" y="${fmt(f.y)}" font-size="220" text-anchor="middle" fill="#475569" font-family="sans-serif">${esc(label)}</text>`,
      );
    }
  }

  // room labels
  for (const r of rooms) {
    const name = plan.roomNames?.[r.signature] ?? 'Room';
    parts.push(
      `<text x="${fmt(r.centroid.x)}" y="${fmt(r.centroid.y - 120)}" font-size="320" font-weight="600" text-anchor="middle" fill="#1e293b" font-family="sans-serif">${esc(name)}</text>`,
    );
    parts.push(
      `<text x="${fmt(r.centroid.x)}" y="${fmt(r.centroid.y + 240)}" font-size="240" text-anchor="middle" fill="#64748b" font-family="sans-serif">${esc(formatArea(r.area, unit))}</text>`,
    );
  }

  // wall dimensions
  if (withDimensions) {
    for (const w of plan.walls) {
      const a = nodeMap.get(w.a);
      const c = nodeMap.get(w.b);
      if (!a || !c) continue;
      const m = midpoint(a, c);
      parts.push(
        `<text x="${fmt(m.x)}" y="${fmt(m.y - 60)}" font-size="230" text-anchor="middle" fill="#475569" font-family="sans-serif">${esc(formatLength(dist(a, c), unit))}</text>`,
      );
    }
  }

  const pxScale = 0.22; // px per mm hint for rasterisation
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * pxScale)}" height="${Math.round(H * pxScale)}" viewBox="${fmt(minX)} ${fmt(minY)} ${fmt(W)} ${fmt(H)}"><rect x="${fmt(minX)}" y="${fmt(minY)}" width="${fmt(W)}" height="${fmt(H)}" fill="#ffffff"/>${parts.join('')}</svg>`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(plan: PlanDocument, filename: string, opts?: ExportOptions) {
  downloadBlob(new Blob([planToSvgString(plan, opts)], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export function exportPng(plan: PlanDocument, filename: string, scale = 2, opts?: ExportOptions): Promise<void> {
  const svg = planToSvgString(plan, opts);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, img.width * scale);
      canvas.height = Math.max(1, img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('no 2d context'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, filename);
          resolve();
        } else reject(new Error('toBlob failed'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svg image load failed'));
    };
    img.src = url;
  });
}

export async function exportPdf(plan: PlanDocument, filename: string, opts?: ExportOptions): Promise<void> {
  const svg = planToSvgString(plan, opts);
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js'); // augments jsPDF instances with .svg()

  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = parsed.documentElement as unknown as SVGSVGElement;
  const vb = (el.getAttribute('viewBox') ?? '0 0 1000 1000').split(/\s+/).map(Number);
  const vbW = vb[2] || 1000;
  const vbH = vb[3] || 1000;
  const landscape = vbW >= vbH;

  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageW = landscape ? 297 : 210;
  const pageH = landscape ? 210 : 297;
  const margin = 12;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const s = Math.min(availW / vbW, availH / vbH);
  const w = vbW * s;
  const h = vbH * s;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;

  el.style.position = 'absolute';
  el.style.left = '-99999px';
  el.style.top = '0';
  document.body.appendChild(el);
  try {
    // svg2pdf augments the instance; the type isn't in jsPDF's declarations
    await (pdf as unknown as { svg: (e: Element, o: object) => Promise<unknown> }).svg(el, { x, y, width: w, height: h });
    pdf.save(filename);
  } finally {
    el.remove();
  }
}
