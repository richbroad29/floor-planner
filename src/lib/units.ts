// Length formatting. Internal unit is always millimetres.
import type { DisplayUnit } from '../types/plan';

/** Format an area given in mm² using the display unit's system (m² or ft²). */
export function formatArea(mm2: number, unit: DisplayUnit): string {
  const imperial = unit === 'in' || unit === 'ft';
  if (imperial) {
    const ft2 = mm2 / 92903.04; // mm² per ft²
    return `${ft2.toFixed(1)} ft²`;
  }
  const m2 = mm2 / 1_000_000;
  return `${m2.toFixed(2)} m²`;
}

export function formatLength(mm: number, unit: DisplayUnit): string {
  switch (unit) {
    case 'mm':
      return `${Math.round(mm)} mm`;
    case 'cm':
      return `${(mm / 10).toFixed(1)} cm`;
    case 'm':
      return `${(mm / 1000).toFixed(2)} m`;
    case 'in':
      return `${(mm / 25.4).toFixed(1)}″`;
    case 'ft': {
      const totalIn = mm / 25.4;
      const ft = Math.floor(totalIn / 12);
      const inch = Math.round(totalIn - ft * 12);
      return inch === 12 ? `${ft + 1}′ 0″` : `${ft}′ ${inch}″`;
    }
  }
}
