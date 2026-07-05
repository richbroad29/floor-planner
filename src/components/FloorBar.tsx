// Secondary bar above the canvas: switch / add / duplicate / rename / delete
// storeys within the current option. The floor below is ghosted on the canvas.
import { usePlanStore } from '../store/planStore';
import { useUIStore } from '../store/uiStore';

export function FloorBar() {
  const floors = usePlanStore((s) => {
    const p = s.project;
    return p.versions.find((v) => v.id === p.activeVersionId)?.plan.floors ?? [];
  });
  const activeFloor = usePlanStore((s) => {
    const p = s.project;
    return p.versions.find((v) => v.id === p.activeVersionId)?.plan.activeFloor;
  });
  const switchFloor = usePlanStore((s) => s.switchFloor);
  const addFloor = usePlanStore((s) => s.addFloor);
  const duplicateFloor = usePlanStore((s) => s.duplicateFloor);
  const renameFloor = usePlanStore((s) => s.renameFloor);
  const deleteFloor = usePlanStore((s) => s.deleteFloor);
  const clearSelection = useUIStore((s) => s.clearSelection);

  return (
    <div className="floor-bar">
      <span className="fb-label">Floors</span>
      <div className="fb-floors">
        {floors.map((f) => (
          <button
            key={f.id}
            className={f.id === activeFloor ? 'floor active' : 'floor'}
            onClick={() => {
              switchFloor(f.id);
              clearSelection();
            }}
            onDoubleClick={() => {
              const n = window.prompt('Rename floor', f.name);
              if (n) renameFloor(f.id, n);
            }}
            title="Click to switch · double-click to rename"
          >
            {f.name}
          </button>
        ))}
      </div>
      <div className="fb-actions">
        <button onClick={() => { addFloor(); clearSelection(); }}>+ Add floor</button>
        <button onClick={() => { duplicateFloor(); clearSelection(); }}>Duplicate</button>
        <button
          onClick={() => { if (activeFloor) deleteFloor(activeFloor); clearSelection(); }}
          disabled={floors.length <= 1}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
