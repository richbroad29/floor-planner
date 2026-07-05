import { useUIStore } from '../store/uiStore';
import { ExportMenu } from './ExportMenu';

export function Toolbar() {
  const tool = useUIStore((s) => s.tool);
  const setTool = useUIStore((s) => s.setTool);

  return (
    <header className="toolbar">
      <span className="brand">Floor&nbsp;Planner</span>
      <div className="tools">
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select (V)">
          Select
        </button>
        <button className={tool === 'wall' ? 'active' : ''} onClick={() => setTool('wall')} title="Draw walls (W)">
          Wall
        </button>
        <button className={tool === 'door' ? 'active' : ''} onClick={() => setTool('door')} title="Add a door">
          Door
        </button>
        <button className={tool === 'window' ? 'active' : ''} onClick={() => setTool('window')} title="Add a window">
          Window
        </button>
      </div>
      <span className="hint">
        {tool === 'wall'
          ? 'Click to place points · click the green start dot to close the room · Enter to finish · Esc to cancel'
          : tool === 'door'
            ? 'Click on a wall to drop a door — it cuts the opening and slides along the wall'
            : tool === 'window'
              ? 'Click on a wall to drop a window'
              : tool === 'scale'
                ? 'Scale: click the two ends of a known length on the image, then type its real size'
                : 'Click a wall / door / window to select · drag to move · Delete to remove · Space-drag to pan · scroll to zoom'}
      </span>
      <ExportMenu />
    </header>
  );
}
