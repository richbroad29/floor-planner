// The starter catalogue of furniture and kitchen/bathroom fixtures.
// Each entry carries a sensible default footprint in millimetres. Items are
// placed into the plan's `furniture` array keyed by `kind`; the catalogue is
// the lookup for label, category and default size.

export type Category = 'Furniture' | 'Kitchen' | 'Bathroom';

export interface CatalogueItem {
  kind: string;
  label: string;
  category: Category;
  /** default footprint (mm) */
  w: number;
  h: number;
}

export const CATALOGUE: CatalogueItem[] = [
  // Furniture
  { kind: 'sofa', label: 'Sofa', category: 'Furniture', w: 2000, h: 900 },
  { kind: 'armchair', label: 'Armchair', category: 'Furniture', w: 900, h: 850 },
  { kind: 'coffee-table', label: 'Coffee table', category: 'Furniture', w: 1100, h: 600 },
  { kind: 'dining-table', label: 'Dining table', category: 'Furniture', w: 1600, h: 900 },
  { kind: 'chair', label: 'Chair', category: 'Furniture', w: 450, h: 450 },
  { kind: 'double-bed', label: 'Double bed', category: 'Furniture', w: 1500, h: 2000 },
  { kind: 'single-bed', label: 'Single bed', category: 'Furniture', w: 900, h: 1900 },
  { kind: 'wardrobe', label: 'Wardrobe', category: 'Furniture', w: 1000, h: 600 },
  { kind: 'desk', label: 'Desk', category: 'Furniture', w: 1200, h: 600 },
  { kind: 'tv-unit', label: 'TV unit', category: 'Furniture', w: 1500, h: 400 },

  // Kitchen
  { kind: 'base-cabinet', label: 'Base cabinet', category: 'Kitchen', w: 600, h: 600 },
  { kind: 'wall-cabinet', label: 'Wall cabinet', category: 'Kitchen', w: 600, h: 350 },
  { kind: 'worktop', label: 'Worktop run', category: 'Kitchen', w: 1200, h: 600 },
  { kind: 'sink', label: 'Sink', category: 'Kitchen', w: 600, h: 500 },
  { kind: 'hob', label: 'Hob', category: 'Kitchen', w: 600, h: 520 },
  { kind: 'oven', label: 'Oven', category: 'Kitchen', w: 600, h: 600 },
  { kind: 'fridge', label: 'Fridge / freezer', category: 'Kitchen', w: 600, h: 650 },
  { kind: 'dishwasher', label: 'Dishwasher', category: 'Kitchen', w: 600, h: 600 },

  // Bathroom
  { kind: 'bath', label: 'Bath', category: 'Bathroom', w: 1700, h: 700 },
  { kind: 'shower', label: 'Shower', category: 'Bathroom', w: 900, h: 900 },
  { kind: 'toilet', label: 'Toilet', category: 'Bathroom', w: 400, h: 650 },
  { kind: 'basin', label: 'Basin', category: 'Bathroom', w: 600, h: 450 },
  { kind: 'vanity', label: 'Vanity unit', category: 'Bathroom', w: 800, h: 500 },
];

export const catalogueByKind = new Map<string, CatalogueItem>(
  CATALOGUE.map((i) => [i.kind, i]),
);

export const CATEGORIES: Category[] = ['Furniture', 'Kitchen', 'Bathroom'];
