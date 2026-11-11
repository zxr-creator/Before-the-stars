// Public astronomy for the Solar System layer: the bodies, their physical facts and where
// they stand on a given match date. Everything here is fixed content computed on the client;
// nothing is fetched and nothing depends on the engine.
//
// Planet positions: mean Keplerian elements and their rates per Julian century from
//   E. M. Standish, "Keplerian Elements for Approximate Positions of the Major Planets",
//   JPL Solar System Dynamics, Table 1 (epoch J2000, fitted for 1800–2050 AD;
//   https://ssd.jpl.nasa.gov/planets/approx_pos.html).
// The game spans millennia, so outside 1800–2050 the same linear rates are extrapolated: the
// error grows to a few degrees over thousands of years, which a schematic map does not show.
// Ceres, Vesta, Psyche and the representative near-Earth orbit use osculating elements rounded
// from the JPL Small-Body Database; their mean longitudes at J2000 are approximate (display only).
// The Moon's mean longitude is Meeus, "Astronomical Algorithms" (2nd ed.), ch. 47; the other
// moons move at their sidereal periods from a fixed (approximate) phase at J2000.
// Physical radii, gravities and periods are rounded NASA planetary fact-sheet values.
import type { HistoricalDate } from '../protocol';

export type BodyId =
  | 'sun' | 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'nea' | 'ceres' | 'vesta' | 'psyche'
  | 'jupiter' | 'io' | 'europa' | 'ganymede' | 'callisto' | 'saturn' | 'titan' | 'enceladus'
  | 'uranus' | 'neptune' | 'triton';

export type BodyKind = 'star' | 'planet' | 'dwarf' | 'asteroid' | 'moon' | 'cluster';

/** Mean elements at J2000 and their rates per Julian century (degrees, AU). */
export interface Elements {
  a: number; e: number; i: number; L: number; peri: number; node: number;
  da: number; de: number; di: number; dL: number; dperi: number; dnode: number;
}

export interface Body {
  id: BodyId;
  /** English name; also the i18n key. */
  name: string;
  kind: BodyKind;
  parent: BodyId | null;
  radiusKm: number;
  /** Surface gravity in Earth gravities (null for the Sun and the asteroid cluster). */
  gravity: number | null;
  /** Heliocentric elements (planets, dwarfs, asteroids). */
  el?: Elements;
  /** Moons: mean distance from the parent (km), sidereal period (days, negative = retrograde), phase at J2000 (deg). */
  moon?: { aKm: number; periodDays: number; phase0: number };
  /** Colour of the body's marker and fallback disc. */
  color: string;
}

const K = (a: number, e: number, i: number, L: number, peri: number, node: number, da: number, de: number, di: number, dL: number, dperi: number, dnode: number): Elements =>
  ({ a, e, i, L, peri, node, da, de, di, dL, dperi, dnode });

// i18n-fields (body names reach t() through BODY_NAME below)
export const BODIES: Body[] = [
  { id: 'sun', name: 'Sun', kind: 'star', parent: null, radiusKm: 695700, gravity: null, color: '#ffd27a' },
  {
    id: 'mercury', name: 'Mercury', kind: 'planet', parent: null, radiusKm: 2440, gravity: 0.38, color: '#a39b8f',
    el: K(0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081),
  },
  {
    id: 'venus', name: 'Venus', kind: 'planet', parent: null, radiusKm: 6052, gravity: 0.9, color: '#e8d3a2',
    el: K(0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418),
  },
  {
    id: 'earth', name: 'Earth', kind: 'planet', parent: null, radiusKm: 6371, gravity: 1, color: '#4f8fc0',
    // The Earth–Moon barycentre.
    el: K(1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0),
  },
  { id: 'moon', name: 'Moon', kind: 'moon', parent: 'earth', radiusKm: 1737, gravity: 0.165, color: '#c9c5bc', moon: { aKm: 384400, periodDays: 27.321661, phase0: 218.3165 } },
  {
    id: 'mars', name: 'Mars', kind: 'planet', parent: null, radiusKm: 3390, gravity: 0.38, color: '#c8714a',
    el: K(1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343),
  },
  {
    // A representative Amor-group orbit (433 Eros, rounded) for the near-Earth asteroid cluster.
    id: 'nea', name: 'Near-Earth asteroids', kind: 'cluster', parent: null, radiusKm: 17, gravity: null, color: '#b7a58a',
    el: K(1.458, 0.223, 10.83, 240, 123.2, 304.3, 0, 0, 0, 36000 / 1.761, 0, 0),
  },
  {
    id: 'ceres', name: 'Ceres', kind: 'dwarf', parent: null, radiusKm: 470, gravity: 0.029, color: '#a9a49b',
    el: K(2.7675, 0.0785, 10.59, 153, 153.8, 80.3, 0, 0, 0, 36000 / 4.604, 0, 0),
  },
  {
    id: 'vesta', name: 'Vesta', kind: 'asteroid', parent: null, radiusKm: 263, gravity: 0.025, color: '#bdb39f',
    el: K(2.3615, 0.0887, 7.14, 205, 255.0, 103.85, 0, 0, 0, 36000 / 3.629, 0, 0),
  },
  {
    id: 'psyche', name: 'Psyche', kind: 'asteroid', parent: null, radiusKm: 111, gravity: 0.01, color: '#b9b2a6',
    el: K(2.924, 0.134, 3.1, 330, 19.0, 150.0, 0, 0, 0, 36000 / 5.0, 0, 0),
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'planet', parent: null, radiusKm: 69911, gravity: 2.53, color: '#d6b38a',
    el: K(5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106),
  },
  { id: 'io', name: 'Io', kind: 'moon', parent: 'jupiter', radiusKm: 1822, gravity: 0.183, color: '#e2c35a', moon: { aKm: 421700, periodDays: 1.769138, phase0: 163.8 } },
  { id: 'europa', name: 'Europa', kind: 'moon', parent: 'jupiter', radiusKm: 1561, gravity: 0.134, color: '#d9cdb4', moon: { aKm: 671034, periodDays: 3.551181, phase0: 358.4 } },
  { id: 'ganymede', name: 'Ganymede', kind: 'moon', parent: 'jupiter', radiusKm: 2634, gravity: 0.146, color: '#a8a092', moon: { aKm: 1070412, periodDays: 7.154553, phase0: 5.7 } },
  { id: 'callisto', name: 'Callisto', kind: 'moon', parent: 'jupiter', radiusKm: 2410, gravity: 0.126, color: '#7f776c', moon: { aKm: 1882709, periodDays: 16.689018, phase0: 224.8 } },
  {
    id: 'saturn', name: 'Saturn', kind: 'planet', parent: null, radiusKm: 58232, gravity: 1.07, color: '#e3cf9a',
    el: K(9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794),
  },
  { id: 'titan', name: 'Titan', kind: 'moon', parent: 'saturn', radiusKm: 2575, gravity: 0.138, color: '#d9a55a', moon: { aKm: 1221870, periodDays: 15.945421, phase0: 120 } },
  { id: 'enceladus', name: 'Enceladus', kind: 'moon', parent: 'saturn', radiusKm: 252, gravity: 0.0113, color: '#f2f4f5', moon: { aKm: 237948, periodDays: 1.370218, phase0: 40 } },
  {
    id: 'uranus', name: 'Uranus', kind: 'planet', parent: null, radiusKm: 25362, gravity: 0.9, color: '#a9d8dc',
    el: K(19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589),
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'planet', parent: null, radiusKm: 24622, gravity: 1.14, color: '#4f74c8',
    el: K(30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664),
  },
  { id: 'triton', name: 'Triton', kind: 'moon', parent: 'neptune', radiusKm: 1353, gravity: 0.08, color: '#d8c3bd', moon: { aKm: 354759, periodDays: -5.876854, phase0: 300 } },
];
// i18n-end

export const BODY: Record<BodyId, Body> = Object.fromEntries(BODIES.map((b) => [b.id, b])) as Record<BodyId, Body>;
export const MOONS_OF: Partial<Record<BodyId, BodyId[]>> = {};
for (const b of BODIES) if (b.parent) (MOONS_OF[b.parent] ??= []).push(b.id);

const DEG = Math.PI / 180;
const J2000_YEAR = 2000;

/**
 * Days since J2000.0 (2000-01-01 12:00 TT) for the middle of a match month. A signed historical
 * year (no year zero) becomes an astronomical year; without a calendar the month counter is
 * read as months after J2000 so the picture is still deterministic.
 */
export function daysSinceJ2000(date: HistoricalDate | null | undefined, month: number): number {
  if (date && Number.isFinite(date.year)) {
    const astroYear = date.year < 0 ? date.year + 1 : date.year;
    const m = Math.min(12, Math.max(1, date.month ?? 7));
    return (astroYear - J2000_YEAR) * 365.25 + (m - 1) * 30.436875 + 14.5;
  }
  return month * 30.436875;
}

function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  return E;
}

/** Heliocentric ecliptic position (AU, J2000 frame) of a body with elements, `T` Julian centuries after J2000. */
export function heliocentric(el: Elements, T: number, meanAnomalyShift = 0): [number, number, number] {
  const a = el.a + el.da * T;
  const e = Math.min(0.95, Math.max(0, el.e + el.de * T));
  const I = (el.i + el.di * T) * DEG;
  const L = el.L + el.dL * T;
  const peri = el.peri + el.dperi * T;
  const node = el.node + el.dnode * T;
  const w = (peri - node) * DEG;
  let M = ((L - peri + meanAnomalyShift) % 360) * DEG;
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node * DEG), sO = Math.sin(node * DEG), cI = Math.cos(I), sI = Math.sin(I);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = sw * sI * xp + cw * sI * yp;
  return [x, y, z];
}

/** Angle (radians, ecliptic longitude) of a moon around its parent, `days` after J2000. */
export function moonAngle(b: Body, days: number): number {
  const m = b.moon!;
  if (b.id === 'moon') return ((218.3165 + 13.17639648 * days) % 360) * DEG;
  return ((m.phase0 + (360 / m.periodDays) * days) % 360) * DEG;
}

/** Sidereal period of a heliocentric body in Earth years. */
export function periodYears(b: Body): number | null {
  if (!b.el) return null;
  return 36000 / b.el.dL;
}

/** Synodic period with the Earth, in months (how often the same alignment returns). */
export function synodicMonths(b: Body): number | null {
  const p = periodYears(b);
  if (!p || b.id === 'earth') return null;
  return 12 / Math.abs(1 - 1 / p);
}
