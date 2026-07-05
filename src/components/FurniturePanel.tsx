// Left sidebar: the furniture + kitchen/bath catalogue, and (when an item is
// selected) a small panel to resize / rotate / delete it precisely.
import { CATALOGUE, CATEGORIES, catalogueByKind } from '../lib/catalogue';
import { usePlanStore } from '../store/planStore';
import { useUIStore } from '../store/uiStore';
import { TracePanel } from './TracePanel';

export function FurniturePanel() {
  const addFurniture = usePlanStore((s) => s.addFurniture);
  const updateFurniture = usePlanStore((s) => s.updateFurniture);
  const deleteFurniture = usePlanStore((s) => s.deleteFurniture);
  const furniture = usePlanStore((s) => {
    const p = s.project;
    return p.versions.find((v) => v.id === p.activeVersionId)?.plan.furniture ?? [];
  });
  const selIds = useUIStore((s) => s.selectedFurnitureIds);
  const setSelectedFurniture = useUIStore((s) => s.setSelectedFurniture);
  const selected = furniture.find((f) => selIds.includes(f.id));

  const add = (kind: string) => {
    // drop the new item at the centre of the current view
    const { viewport, size } = useUIStore.getState();
    const cx = (size.w / 2 - viewport.tx) / viewport.scale;
    const cy = (size.h / 2 - viewport.ty) / viewport.scale;
    addFurniture(kind, cx, cy);
  };

  return (
    <aside className="sidebar">
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
