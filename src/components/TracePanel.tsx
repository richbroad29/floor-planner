// Sidebar section: bring in a floorplan to trace over — by file upload, image
// URL, or a Rightmove listing URL — plus opacity / rotation / scale controls.
import { useState } from 'react';
import { usePlanStore } from '../store/planStore';
import { useUIStore } from '../store/uiStore';
import { fetchRightmoveFloorplan } from '../lib/rightmove';
import type { TraceImage } from '../types/plan';

// Load an image src, measure it, and build a TraceImage centred in the view.
function buildTrace(src: string, source: TraceImage['source']): Promise<TraceImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1000;
      const h = img.naturalHeight || 1000;
      const { viewport, size } = useUIStore.getState();
      const cx = (size.w / 2 - viewport.tx) / viewport.scale;
      const cy = (size.h / 2 - viewport.ty) / viewport.scale;
      const mmPerPixel = 8000 / w; // assume ~8m wide until calibrated
      const project = usePlanStore.getState().project;
      const floor = project.versions.find((v) => v.id === project.activeVersionId)!.plan.activeFloor;
      resolve({
        src,
        floor,
        x: cx - (w * mmPerPixel) / 2,
        y: cy - (h * mmPerPixel) / 2,
        rotation: 0,
        mmPerPixel,
        naturalW: w,
        naturalH: h,
        opacity: 0.6,
        source,
      });
    };
    img.onerror = () => reject(new Error('Could not load that image.'));
    img.src = src;
  });
}

export function TracePanel() {
  const trace = usePlanStore((s) => {
    const p = s.project;
    return p.versions.find((v) => v.id === p.activeVersionId)?.plan.traceImage ?? null;
  });
  const setTraceImage = usePlanStore((s) => s.setTraceImage);
  const removeTraceImage = usePlanStore((s) => s.removeTraceImage);
  const setTraceOpacity = usePlanStore((s) => s.setTraceOpacity);
  const setTraceRotation = usePlanStore((s) => s.setTraceRotation);
  const setTool = useUIStore((s) => s.setTool);

  const [url, setUrl] = useState('');
  const [rm, setRm] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setTraceImage(await buildTrace(String(reader.result), 'upload'));
      } catch {
        window.alert('Could not load that image file.');
      }
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const load = async (fn: () => Promise<string>, source: TraceImage['source']) => {
    setBusy(true);
    try {
      const src = await fn();
      setTraceImage(await buildTrace(src, source));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not load that image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cat trace-panel">
      <h3>Trace a floorplan</h3>
      <label className="trace-upload">
        Upload floorplan
        <input type="file" accept="image/*" onChange={onFile} />
      </label>
      <div className="trace-row">
        <input placeholder="Image URL…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button disabled={busy || !url.trim()} onClick={() => load(async () => url.trim(), 'url')}>
          Load
        </button>
      </div>
      <div className="trace-row">
        <input placeholder="Rightmove URL…" value={rm} onChange={(e) => setRm(e.target.value)} />
        <button disabled={busy || !rm.trim()} onClick={() => load(() => fetchRightmoveFloorplan(rm.trim()), 'rightmove')}>
          Import
        </button>
      </div>

      {trace && (
        <div className="trace-controls">
          <label>
            Opacity
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(trace.opacity * 100)}
              onChange={(e) => setTraceOpacity(Number(e.target.value) / 100)}
            />
          </label>
          <label>
            Rotation (°)
            <input
              type="number"
              step={15}
              value={Math.round(trace.rotation)}
              onChange={(e) => setTraceRotation(Number(e.target.value))}
            />
          </label>
          <button onClick={() => setTool('scale')}>Set scale</button>
          <button className="danger" onClick={removeTraceImage}>Remove image</button>
          <p className="trace-hint">
            Drag the image on the canvas to position it. Use <b>Set scale</b>, draw a line over a known
            length, then type its real size to calibrate.
          </p>
        </div>
      )}
    </section>
  );
}
