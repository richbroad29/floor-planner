// Left sidebar: the furniture + kitchen/bath catalogue, and (when an item is
// selected) a small panel to resize / rotate / delete it precisely.
import { CATALOGUE, CATEGORIES, catalogueByKind } from '../lib/catalogue';
import { usePlanStore } from '../store/planStore';
import { useUIStore } from '../store/uiStore';
import { dist } from '../lib/geometry';
import { formatLength } from '../lib/units';
import { TracePanel } from './TracePanel';
import type { DoorSwing } from '../types/plan';

export function FurniturePanel() {
  const addFurniture = usePlanStore((s) => s.addFurniture);
  const updateFurniture = usePlanStore((s) => s.updateFurniture);
  const deleteFurniture = usePlanStore((s) => s.deleteFurniture);
  const deleteWalls = usePlanStore((s) => s.deleteWalls);
  const updateWall = usePlanStore((s) => s.updateWall);
  const deleteOpenings = usePlanStore((s) => s.deleteOpenings);
  const updateOpening = usePlanStore((s) => s.updateOpening);
  const plan = usePlanStore((s) => {
    const p = s.project;
    return p.versions.find((v) => v.id === p.activeVersionId)?.plan;
  });
  const furniture = plan?.furniture ?? [];
  const selIds = useUIStore((s) => s.selectedFurnitureIds);
  const setSelectedFurniture = useUIStore((s) => s.setSelectedFurniture);
  const selWallIds = useUIStore((s) => s.selectedWallIds);
  const setSelectedWalls = useUIStore((s) => s.setSelectedWalls);
  const selOpeningIds = useUIStore((s) => s.selectedOpeningIds);
  const setSelectedOpenings = useUIStore((s) => s.setSelectedOpenings);
  const selected = furniture.find((f) => selIds.includes(f.id));

  // the currently selected wall (if any), plus its centreline length for display
  const selWall = plan?.walls.find((w) => selWallIds.includes(w.id));
  const wallA = selWall && plan?.nodes.find((n) => n.id === selWall.a);
  const wallB = selWall && plan?.nodes.find((n) => n.id === selWall.b);
  const wallLen = wallA && wallB ? dist(wallA, wallB) : 0;
  const unit = plan?.units.displayUnit ?? 'm';

  // the currently selected door / window (if any)
  const selOpening = plan?.openings.find((o) => selOpeningIds.includes(o.id));

  const add = (kind: string) => {
    // drop the new item at the centre of the current view
    const { viewport, size } = useUIStore.getState();
    const cx = (size.w / 2 - viewport.tx) / viewport.scale;
    const cy = (size.h / 2 - viewport.ty) / viewport.scale;
    addFurniture(kind, cx, cy);
  };

  return (
    <aside className="sidebar">
      {selWall && (
        <div className="sel-panel">
          <div className="sel-title">Wall</div>
          <label>
            Length
            <span>{formatLength(wallLen, unit)}</span>
          </label>
          <label>
            Thickness (mm)
            <input
              type="number"
              step={10}
              value={Math.round(selWall.thickness)}
              onChange={(e) => updateWall(selWall.id, { thickness: Number(e.target.value) })}
            />
          </label>
          <button
            className="danger"
            onClick={() => {
              deleteWalls([selWall.id]);
              setSelectedWalls([]);
            }}
          >
            Delete wall
          </button>
        </div>
      )}

      {selOpening && (
        <div className="sel-panel">
          <div className="sel-title">{selOpening.type === 'door' ? 'Door' : 'Window'}</div>
          <label>
            Width (mm)
            <input
              type="number"
              step={10}
              value={Math.round(selOpening.width)}
              onChange={(e) => updateOpening(selOpening.id, { width: Number(e.target.value) })}
            />
          </label>
          {selOpening.type === 'door' &&
            (() => {
              const swing: DoorSwing = selOpening.swing ?? 'left-in';
              const side = swing.startsWith('left') ? 'left' : 'right';
              const dir = swing.endsWith('in') ? 'in' : 'out';
              const setSwing = (s: 'left' | 'right', d: 'in' | 'out') =>
                updateOpening(selOpening.id, { swing: `${s}-${d}` as DoorSwing });
              return (
                <>
                  <label>
                    Hinge side
                    <span className="seg">
                      <button className={side === 'left' ? 'on' : ''} onClick={() => setSwing('left', dir)}>
                        Left
                      </button>
                      <button className={side === 'right' ? 'on' : ''} onClick={() => setSwing('right', dir)}>
                        Right
                      </button>
                    </span>
                  </label>
                  <label>
                    Opens
                    <span className="seg">
                      <button className={dir === 'in' ? 'on' : ''} onClick={() => setSwing(side, 'in')}>
                        This side
                      </button>
                      <button className={dir === 'out' ? 'on' : ''} onClick={() => setSwing(side, 'out')}>
                        Other side
                      </button>
                    </span>
                  </label>
                </>
              );
            })()}
          <button
            className="danger"
            onClick={() => {
              deleteOpenings([selOpening.id]);
              setSelectedOpenings([]);
            }}
          >
            Delete {selOpening.type === 'door' ? 'door' : 'window'}
          </button>
        </div>
      )}

      {selected && (
        <div className="sel-panel">
          <div className="sel-title">{catalogueByKind.get(selected.kind)?.label ?? 'Item'}</div>
          <label>
            Width (mm)
            <input
              type="number"
              step={10}
              value={Math.round(selected.w)}
              onChange={(e) => updateFurniture(selected.id, { w: Number(e.target.value) })}
            />
          </label>
          <label>
            Depth (mm)
            <input
              type="number"
              step={10}
              value={Math.round(selected.h)}
              onChange={(e) => updateFurniture(selected.id, { h: Number(e.target.value) })}
            />
          </label>
          <label>
            Rotation (°)
            <input
              type="number"
              step={15}
              value={Math.round(selected.rotation)}
              onChange={(e) => updateFurniture(selected.id, { rotation: Number(e.target.value) })}
            />
          </label>
          <button
            className="danger"
            onClick={() => {
              deleteFurniture([selected.id]);
              setSelectedFurniture([]);
            }}
          >
            Delete item
          </button>
        </div>
      )}

      <div className="catalogue">
        {CATEGORIES.map((cat) => (
          <section key={cat} className="cat">
            <h3>{cat}</h3>
            <div className="cat-items">
              {CATALOGUE.filter((i) => i.category === cat).map((i) => (
                <button
                  key={i.kind}
                  className="cat-item"
                  onClick={() => add(i.kind)}
                  title={`Add ${i.label} (${i.w}×${i.h} mm)`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <TracePanel />
    </aside>
  );
}
