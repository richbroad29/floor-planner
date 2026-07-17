// Export control in the toolbar: one button that opens a dropdown to pick the
// file type (PNG / PDF / SVG) for the active plan.
import { useEffect, useRef, useState } from 'react';
import { usePlanStore } from '../store/planStore';
import { exportPng, exportPdf, exportSvg } from '../lib/exportPlan';

export function ExportMenu() {
  const projectName = usePlanStore((s) => s.project.name);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // close the dropdown on an outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const getPlan = () => {
    const p = usePlanStore.getState().project;
    return p.versions.find((v) => v.id === p.activeVersionId)?.plan;
  };
  const base = (projectName.trim() || 'floor-plan').replace(/[^\w-]+/g, '-');

  const run = async (fn: () => void | Promise<void>) => {
    setOpen(false);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('Export failed', err);
      window.alert('Sorry — export failed. See the console for details.');
    } finally {
      setBusy(false);
    }
  };

  const png = () => run(() => { const p = getPlan(); if (p) return exportPng(p, `${base}.png`); });
  const pdf = () => run(() => { const p = getPlan(); if (p) return exportPdf(p, `${base}.pdf`); });
  const svg = () => run(() => { const p = getPlan(); if (p) exportSvg(p, `${base}.svg`); });

  return (
    <div className="export" ref={wrapRef}>
      <button
        className="export-toggle"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? 'Exporting…' : 'Export ▾'}
      </button>
      {open && (
        <div className="export-menu" role="menu">
          <button role="menuitem" onClick={png}>PNG image</button>
          <button role="menuitem" onClick={pdf}>PDF document</button>
          <button role="menuitem" onClick={svg}>SVG vector</button>
        </div>
      )}
    </div>
  );
}
