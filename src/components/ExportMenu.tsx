// Export controls in the toolbar: PNG / PDF / SVG of the active option.
import { useState } from 'react';
import { usePlanStore } from '../store/planStore';
import { exportPng, exportPdf, exportSvg } from '../lib/exportPlan';

export function ExportMenu() {
  const projectName = usePlanStore((s) => s.project.name);
  const [busy, setBusy] = useState(false);

  const getPlan = () => {
    const p = usePlanStore.getState().project;
    return p.versions.find((v) => v.id === p.activeVersionId)?.plan;
  };
  const base = (projectName.trim() || 'floor-plan').replace(/[^\w-]+/g, '-');

  const run = async (fn: () => void | Promise<void>) => {
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
    <div className="export">
      <span className="export-label">Export</span>
      <button onClick={png} disabled={busy}>PNG</button>
      <button onClick={pdf} disabled={busy}>PDF</button>
      <button onClick={svg} disabled={busy}>SVG</button>
    </div>
  );
}
