// Bottom bar: the project name + its saved layout options/versions.
// This is Rich's "save different options to play around with" feature.
import { usePlanStore } from '../store/planStore';

export function OptionsBar() {
  const project = usePlanStore((s) => s.project);
  const switchVersion = usePlanStore((s) => s.switchVersion);
  const addVersion = usePlanStore((s) => s.addVersion);
  const duplicateActiveVersion = usePlanStore((s) => s.duplicateActiveVersion);
  const renameVersion = usePlanStore((s) => s.renameVersion);
  const deleteVersion = usePlanStore((s) => s.deleteVersion);
  const renameProject = usePlanStore((s) => s.renameProject);

  return (
    <footer className="options-bar">
      <input
        className="project-name"
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        aria-label="Project name"
      />
      <div className="options">
        {project.versions.map((v) => (
          <button
            key={v.id}
            className={v.id === project.activeVersionId ? 'opt active' : 'opt'}
            onClick={() => switchVersion(v.id)}
            onDoubleClick={() => {
              const name = window.prompt('Rename option', v.name);
              if (name) renameVersion(v.id, name);
            }}
            title="Click to switch · double-click to rename"
          >
            {v.name}
          </button>
        ))}
      </div>
      <div className="opt-actions">
        <button onClick={() => duplicateActiveVersion()} title="Duplicate the current option">
          Duplicate
        </button>
        <button onClick={() => addVersion()} title="Add a new blank option">
          + New option
        </button>
        <button
          onClick={() => deleteVersion(project.activeVersionId)}
          disabled={project.versions.length <= 1}
          title="Delete the current option"
        >
          Delete
        </button>
      </div>
    </footer>
  );
}
