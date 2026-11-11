// Fixed tables of the off-world orders, mirrored from the referee's rules (design chapters 37 and 39,
// crates/bts-engine/src/sim/space.rs) so the Space operations panel can show what an order will take.
// The numbers here are estimates for planning; the referee's receipt gives the exact bill.
import type { Good } from '../protocol';

/** Propulsion families, in the engine's order: key, name, tonnes a berth level sends a month, carries people, window kind. */
export const PROPS: { key: string; name: string; payload: number; crew: boolean; window: 'impulsive' | 'low thrust' | 'none' }[] = [
  { key: 'chemical', name: 'Chemical stages', payload: 2000, crew: true, window: 'impulsive' },
  { key: 'nuclear_thermal', name: 'Nuclear thermal', payload: 3000, crew: true, window: 'impulsive' },
  { key: 'electric', name: 'Electric (ion and Hall)', payload: 4000, crew: false, window: 'low thrust' },
  { key: 'nuclear_electric', name: 'Nuclear electric', payload: 5000, crew: false, window: 'low thrust' },
  { key: 'fusion', name: 'Fusion ship', payload: 10000, crew: true, window: 'none' },
];

/** Station cores (mass in tonnes, module slots) and modules (mass). */
export const CORE_DEF: Record<string, { name: string; mass: number; slots: number }> = {
  k1: { name: 'K1 truss core', mass: 400, slots: 4 },
  k2: { name: 'K2 frame core', mass: 2000, slots: 8 },
  k3: { name: 'K3 orbital complex', mass: 8000, slots: 14 },
  k4: { name: 'K4 orbital city spine', mass: 30000, slots: 20 },
};
export const MODULE_DEF: Record<string, { name: string; mass: number }> = {
  habitat: { name: 'Habitat', mass: 300 },
  life_support: { name: 'Life support', mass: 200 },
  solar: { name: 'Solar array', mass: 150 },
  reactor: { name: 'Reactor', mass: 600 },
  docking: { name: 'Docking and depot', mass: 500 },
  shipyard: { name: 'Shipyard', mass: 6000 },
  lab: { name: 'Research laboratory', mass: 300 },
  refinery: { name: 'Propellant refinery', mass: 400 },
};
export const CORE_KEYS = Object.keys(CORE_DEF);
export const MODULE_KEYS = Object.keys(MODULE_DEF);

/** The bill of a station part of the given mass (base units). */
export function partBill(mass: number): { good: Good; amount: number }[] {
  return [
    { good: 'metal', amount: Math.floor(mass / 2) },
    { good: 'components', amount: Math.floor((mass * 3) / 10) },
    { good: 'insulation', amount: Math.floor((mass * 15) / 100) },
    { good: 'electronics', amount: mass },
  ];
}

/** Works at a site: bill (base units), posts. */
export const WORK_DEF: Record<string, { name: string; bill: [Good, number][]; posts: number }> = {
  outpost: { name: 'Pressurized outpost', bill: [['metal', 300], ['components', 100], ['insulation', 50], ['electronics', 10]], posts: 300 },
  habitat: { name: 'Shielded habitat', bill: [['materials', 20000], ['metal', 2000], ['components', 500], ['insulation', 300], ['electronics', 50]], posts: 500 },
  life_support: { name: 'Life support works', bill: [['metal', 500], ['components', 300], ['electronics', 50]], posts: 200 },
  ice_works: { name: 'Ice works', bill: [['metal', 1000], ['components', 500]], posts: 400 },
  habitat_farm: { name: 'Habitat farm', bill: [['materials', 3000], ['metal', 500], ['insulation', 300], ['conductors', 200]], posts: 500 },
  solar_array: { name: 'Solar array field', bill: [['conductors', 500], ['substrate', 200], ['metal', 500], ['electronics', 100]], posts: 50 },
  fission_plant: { name: 'Off-world fission plant', bill: [['metal', 16000], ['components', 8000], ['electronics', 4000], ['conductors', 4000], ['insulation', 2000]], posts: 1200 },
  research_station: { name: 'Research station', bill: [['metal', 1000], ['components', 500], ['instruments', 500], ['electronics', 100]], posts: 1500 },
  mining_station: { name: 'Mining station', bill: [['metal', 2000], ['components', 1000], ['electronics', 50]], posts: 600 },
  helium3_extractor: { name: 'Helium-3 extractor', bill: [['metal', 6000], ['components', 3000], ['electronics', 200]], posts: 1500 },
};
export const WORK_KEYS = Object.keys(WORK_DEF).filter((k) => k !== 'outpost');
/** Founding party: people, and the outpost bill plus six months of food and volatiles. */
export const OUTPOST_PARTY = 1000;
export const OUTPOST_EXTRA: [Good, number][] = [['food', OUTPOST_PARTY * 6], ['volatiles', Math.floor((OUTPOST_PARTY * 13 * 6) / 1000)]];
export const PERSON_T = 3;
/** Months a works takes to build off the Earth. */
export const SITE_BUILD_MONTHS = 8;

export const SITE_ROUTE: Record<string, [number[], number[]]> = {
  shackleton_rim: [[42000, 29000, 24000, 27000, 28000], [1, 1, 3, 2, 1]],
  mare_imbrium: [[42000, 29000, 24000, 27000, 28000], [1, 1, 3, 2, 1]],
  daedalus: [[42000, 29000, 24000, 27000, 28000], [1, 1, 3, 2, 1]],
  amor_cluster: [[30000, 19000, 15000, 17000, 18000], [6, 4, 8, 6, 1]],
  arcadia_planitia: [[30000, 19000, 15000, 17000, 18000], [8, 5, 11, 8, 1]],
  valles_marineris: [[30000, 19000, 15000, 17000, 18000], [8, 5, 11, 8, 1]],
  jezero_delta: [[30000, 19000, 15000, 17000, 18000], [8, 5, 11, 8, 1]],
  aphrodite_station: [[27000, 18000, 15000, 17000, 18000], [5, 3, 7, 5, 1]],
  prokofiev: [[0, 96000, 41000, 41000, 40000], [0, 4, 10, 8, 2]],
  ceres: [[97000, 36000, 20000, 21000, 21000], [15, 10, 16, 12, 2]],
  vesta: [[0, 41000, 21000, 21000, 21000], [0, 10, 16, 12, 2]],
  psyche: [[0, 40000, 19000, 20000, 20000], [0, 11, 17, 13, 2]],
  callisto: [[0, 58000, 0, 30000, 30000], [0, 24, 0, 24, 4]],
  ganymede: [[0, 66000, 0, 31000, 31000], [0, 24, 0, 24, 4]],
  europa: [[0, 69000, 0, 29000, 28000], [0, 24, 0, 24, 4]],
  io: [[0, 81000, 0, 31000, 30000], [0, 24, 0, 24, 4]],
  titan: [[74000, 31000, 0, 20000, 20000], [73, 48, 0, 40, 6]],
  enceladus: [[0, 45000, 0, 21000, 20000], [0, 48, 0, 40, 6]],
  triton: [[0, 57000, 0, 28000, 28000], [0, 150, 0, 96, 12]],
};
export const ORBIT_ROUTE: Record<string, [number[], number[]]> = {
  leo: [[10000, 10000, 10000, 10000, 10000], [0, 0, 0, 0, 0]],
  geo: [[16000, 16000, 13800, 16000, 18000], [1, 1, 3, 2, 1]],
  eml1: [[26600, 18300, 15100, 16900, 18100], [1, 1, 3, 2, 1]],
  eml5: [[15000, 15000, 13800, 16000, 18000], [1, 1, 3, 2, 1]],
  sel2: [[14000, 14000, 13800, 16000, 18000], [1, 1, 3, 2, 1]],
  llo: [[26600, 18300, 15100, 16900, 18100], [1, 1, 3, 2, 1]],
  mars_orbit: [[30000, 19000, 15000, 17000, 18000], [8, 5, 11, 8, 1]],
  ceres_orbit: [[84000, 31000, 17300, 18200, 18200], [15, 10, 16, 12, 2]],
  callisto_orbit: [[0, 36000, 0, 18700, 18700], [0, 24, 0, 24, 4]],
  titan_orbit: [[67000, 28000, 0, 18200, 18200], [73, 48, 0, 40, 6]],
};

/**
 * The cheapest route to a destination among the propulsion families the seat flies: ratio of departure mass
 * to payload (basis points), months, and the family's index; null when none reaches it.
 */
export function bestRoute(route: [number[], number[]] | undefined, flies: string[], crew: boolean): { prop: number; ratio: number; months: number } | null {
  if (!route) return null;
  let best: { prop: number; ratio: number; months: number } | null = null;
  PROPS.forEach((p, i) => {
    if (!flies.includes(p.key) || (crew && !p.crew) || route[0][i] <= 0 || route[0][i] > 120000) return;
    if (crew && route[1][i] > 36) return;
    if (!best || route[0][i] < best.ratio || (route[0][i] === best.ratio && route[1][i] < best.months)) best = { prop: i, ratio: route[0][i], months: route[1][i] };
  });
  return best;
}

// i18n-fields
export const ZONE_NAME: Record<string, string> = {
  earth_orbit: 'Earth orbit', moon: 'Moon', nea: 'Near-Earth asteroids', mars: 'Mars', venus: 'Venus', mercury: 'Mercury',
  belt: 'Main Belt', jupiter: 'Jupiter', saturn: 'Saturn', neptune: 'Neptune',
};
// i18n-end
