// Factories for blank plans, versions and projects.
import type { PlanDocument, Project, PlanVersion, Floor, Layer } from '../types/plan';
import { newId, nowIso } from './id';

export function createBlankPlan(): PlanDocument {
  const floorId = newId();
  const floor: Floor = { id: floorId, name: 'Ground floor', elevation: 0 };
  const layers: Layer[] = [
    { id: 'walls', name: 'Walls', visible: true, locked: false },
    { id: 'openings', name: 'Openings', visible: true, locked: false },
    { id: 'furniture', name: 'Furniture', visible: true, locked: false },
    { id: 'trace', name: 'Trace', visible: true, locked: true, opacity: 0.5 },
  ];
  return {
    schemaVersion: 1,
    units: { system: 'metric', displayUnit: 'm' },
    grid: { size: 100, snap: true },
    activeFloor: floorId,
    floors: [floor],
    layers,
    nodes: [],
    walls: [],
    openings: [],
    rooms: [],
    furniture: [],
    fixtures: [],
    traceImage: null,
    roomNames: {},
  };
}

export function createVersion(name: string, plan?: PlanDocument): PlanVersion {
  const ts = nowIso();
  return {
    id: newId(),
    name,
    plan: plan ?? createBlankPlan(),
    createdAt: ts,
    updatedAt: ts,
  };
}

export function createProject(name = 'Untitled project'): Project {
  const ts = nowIso();
  const first = createVersion('Option 1');
  return {
    id: newId(),
    name,
    versions: [first],
    activeVersionId: first.id,
    createdAt: ts,
    updatedAt: ts,
  };
}
