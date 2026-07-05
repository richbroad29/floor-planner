// Floor Planner — core data model.
//
// A plan is a SHARED-NODE GRAPH: walls reference corner-node ids, so moving a
// node moves every wall attached to it. Openings (doors/windows) HOST on a wall
// via an offset, so they slide with the wall. Rooms are DERIVED from closed wall
// loops. All lengths are stored in millimetres and converted only for display.

export type Id = string;

export type UnitSystem = 'metric' | 'imperial';
export type MetricUnit = 'mm' | 'cm' | 'm';
export type ImperialUnit = 'in' | 'ft';
export type DisplayUnit = MetricUnit | ImperialUnit;

export interface Units {
  system: UnitSystem;
  displayUnit: DisplayUnit;
}

export interface Grid {
  /** grid spacing in mm */
  size: number;
  snap: boolean;
}

/** A storey of the building. Every node/wall/etc. belongs to exactly one floor. */
export interface Floor {
  id: Id;
  name: string;
  /** height of this floor's base above ground datum, in mm */
  elevation: number;
}

export type LayerId = 'walls' | 'openings' | 'furniture' | 'trace';

export interface Layer {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1, used mainly for the trace layer */
  opacity?: number;
}

/** A corner point shared by one or more walls. */
export interface Node {
  id: Id;
  floor: Id;
  x: number; // mm
  y: number; // mm
}

/** A wall drawn as a centreline between two nodes; thickness is rendered as an offset. */
export interface Wall {
  id: Id;
  a: Id; // node id
  b: Id; // node id
  thickness: number; // mm
}

export type OpeningType = 'door' | 'window';
export type DoorSwing = 'left-in' | 'left-out' | 'right-in' | 'right-out';

/** A door or window hosted on a wall, positioned by distance along the wall. */
export interface Opening {
  id: Id;
  type: OpeningType;
  wallId: Id;
  /** distance from wall's node "a" to the opening's centre, in mm */
  offset: number;
  width: number; // mm
  /** doors only */
  swing?: DoorSwing;
  /** windows only: sill height in mm */
  sill?: number;
}

export type RoomType =
  | 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'dining'
  | 'hall' | 'utility' | 'office' | 'other';

/** A room derived from a closed loop of nodes; keeps a user name/type across edits. */
export interface Room {
  id: Id;
  name: string;
  type: RoomType;
  /** ordered node ids forming the boundary loop */
  boundary: Id[];
  /** true if auto-detected (vs manually drawn) */
  auto: boolean;
}

/** A free-standing furniture item with a footprint. */
export interface FurnitureItem {
  id: Id;
  floor: Id;
  kind: string; // catalogue key, e.g. "sofa"
  x: number; // mm, centre
  y: number; // mm, centre
  w: number; // mm
  h: number; // mm
  rotation: number; // degrees
}

/** A kitchen/bathroom fixture (sink, bath, cabinet, …). Shares furniture semantics. */
export interface FixtureItem extends FurnitureItem {
  /** whether it snaps its back edge to a wall */
  wallMounted?: boolean;
}

/** Background image (upload / image URL / Rightmove) traced over on the trace layer. */
export interface TraceImage {
  src: string;
  floor: Id;
  x: number; // mm, top-left in world coords
  y: number; // mm
  rotation: number; // degrees
  /** real-world mm per source pixel, set during scale calibration */
  mmPerPixel: number;
  /** natural pixel dimensions of the source image */
  naturalW: number;
  naturalH: number;
  /** 0..1 */
  opacity: number;
  /** where this came from, for UI/debugging */
  source?: 'upload' | 'url' | 'rightmove';
}

/** ONE saved layout. This is what gets serialised to a plan_version row / localStorage. */
export interface PlanDocument {
  schemaVersion: 1;
  units: Units;
  grid: Grid;
  activeFloor: Id;
  floors: Floor[];
  layers: Layer[];
  nodes: Node[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: FurnitureItem[];
  fixtures: FixtureItem[];
  traceImage: TraceImage | null;
  /** custom names for auto-detected rooms, keyed by a signature of their node set */
  roomNames?: Record<string, string>;
}

// ---- Project / version wrappers (Rich's "save different options" feature) ----

/** A named layout option within a project (e.g. "Keep the wall" vs "Open-plan"). */
export interface PlanVersion {
  id: Id;
  name: string;
  plan: PlanDocument;
  /** data-URL thumbnail for the picker, optional */
  thumbnail?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** A project = one property, holding many layout options. */
export interface Project {
  id: Id;
  /** Supabase auth uid once signed in; undefined while purely local */
  owner?: string;
  name: string;
  versions: PlanVersion[];
  /** id of the version currently open in the editor */
  activeVersionId: Id;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
