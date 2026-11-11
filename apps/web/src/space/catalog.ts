// The fixed content of the Solar System layer: the nineteen off-world sites of design
// chapter 37 §6.2 and the ten orbits of chapter 39 §5.2, with what each offers and what reaching
// it takes (chapter 37 §6.5 windows, §7.3 transfer months, §7.4 stages of access).
//
// Only public facts are written here. Deposit amounts are not shown until the engine reports a
// survey of the body (chapter 37 §6.1); technologies are never named, only the era-level stage of
// access a seat needs (the hidden-graph rule of chapter 31 §8).
import type { BodyId } from './astro';

export type SiteKind = 'hub' | 'colony' | 'mining' | 'extraction' | 'research';
export type Zone = 'moon' | 'nea' | 'mars' | 'venus' | 'mercury' | 'belt' | 'jupiter' | 'saturn' | 'neptune' | 'earth_orbit';
/** Stage of access (chapter 37 §7.4), named by era only. */
export type Stage = 'first' | 'advanced' | 'late';

export interface Reach {
  /** Months each way with the first orbital rockets (null: out of their reach). */
  first: number | null;
  /** True when the first rockets carry only cargo there (no crews). */
  firstCargoOnly?: boolean;
  /** Months with advanced propulsion (the fastest of the middle stage). */
  advanced: number | null;
  /** Months with the most advanced propulsion of the age. */
  late: number;
  /** Only uncrewed works (chapter 37 §6.2, Io). */
  uncrewed?: boolean;
}

export interface SiteDef {
  /** Stable key the engine is expected to use (`SpaceSiteView.site`). */
  key: string;
  /** Number in chapter 37's table (1–19), also accepted from the engine. */
  n: number;
  name: string;
  body: BodyId;
  zone: Zone;
  kind: SiteKind;
  /** Gravity in g. */
  gravity: number;
  /** Environmental mortality factor in basis points of Earth's (null: uninhabitable). */
  mortalityBp: number | null;
  /** Most residents the site's terrain allows (chapter 37 §6.2 habitat cap). */
  housing: number;
  /** Sunlight relative to the Earth's orbit, basis points. */
  solarBp: number;
  /** Resource prospects, as public knowledge (amounts only after a survey). */
  prospects: string[];
  /** One line on what the place is for. */
  speciality: string;
  /** Environment note. */
  environment: string;
  reach: Reach;
}

// Chapter 37 §6.5 windows: impulsive propulsion departs only inside the window.
export interface WindowDef { synodic: number | null; window: number | null }
export const WINDOWS: Record<Zone, WindowDef> = {
  earth_orbit: { synodic: null, window: null },
  moon: { synodic: null, window: null },
  nea: { synodic: 12, window: 2 },
  venus: { synodic: 19, window: 2 },
  mercury: { synodic: 4, window: 1 },
  mars: { synodic: 26, window: 2 },
  belt: { synodic: 16, window: 3 },
  jupiter: { synodic: 13, window: 2 },
  saturn: { synodic: 12, window: 2 },
  neptune: { synodic: 12, window: 2 },
};

// i18n-fields
export const ZONE_LABEL: Record<Zone, string> = {
  earth_orbit: 'Earth orbit', moon: 'Moon', nea: 'Near-Earth asteroids', mars: 'Mars', venus: 'Venus', mercury: 'Mercury',
  belt: 'Main Belt', jupiter: 'Jupiter', saturn: 'Saturn', neptune: 'Neptune',
};
export const KIND_LABEL: Record<SiteKind, string> = {
  hub: 'Hub and staging base', colony: 'Colony site', mining: 'Mining site', extraction: 'Extraction site', research: 'Research site',
};
// i18n-end

/** The body that stands for a logistics zone on the map (transfers are drawn between these). */
export const ZONE_BODY: Record<string, BodyId> = {
  earth: 'earth', earth_orbit: 'earth', moon: 'moon', nea: 'nea', mars: 'mars', venus: 'venus', mercury: 'mercury',
  belt: 'ceres', main_belt: 'ceres', jupiter: 'jupiter', saturn: 'saturn', neptune: 'neptune',
};

const R = (first: number | null, advanced: number | null, late: number, extra: Partial<Reach> = {}): Reach => ({ first, advanced, late, ...extra });

// i18n-table (names, prospects, specialities and environments reach t())
export const SITES: SiteDef[] = [
  {
    key: 'shackleton_rim', n: 1, name: 'Shackleton Rim', body: 'moon', zone: 'moon', kind: 'extraction', gravity: 0.17, mortalityBp: 10800, housing: 1_000_000, solarBp: 12000,
    prospects: ['Water ice'], speciality: 'The ice and propellant hub of cislunar space; a site for a mass driver', environment: 'Lunar south pole: near-constant sunlight on the ridges, ice in the shadowed craters', reach: R(1, 1, 1),
  },
  {
    key: 'mare_imbrium', n: 2, name: 'Mare Imbrium', body: 'moon', zone: 'moon', kind: 'mining', gravity: 0.17, mortalityBp: 10800, housing: 500_000, solarBp: 10000,
    prospects: ['Helium-3', 'Iron ore (ilmenite)', 'Rare earths'], speciality: 'Helium-3 for fusion, metals from the lava plains; a site for a mass driver', environment: 'Airless lava plain; two-week days and nights', reach: R(1, 1, 1),
  },
  {
    key: 'daedalus', n: 3, name: 'Daedalus', body: 'moon', zone: 'moon', kind: 'research', gravity: 0.17, mortalityBp: 10800, housing: 100_000, solarBp: 10000,
    prospects: [], speciality: 'Radio-quiet far side: the best observatory site near the Earth', environment: 'Lunar far side crater, shielded from the Earth’s radio noise', reach: R(1, 1, 1),
  },
  {
    key: 'amor_cluster', n: 4, name: 'Amor cluster', body: 'nea', zone: 'nea', kind: 'mining', gravity: 0, mortalityBp: 11000, housing: 50_000, solarBp: 10000,
    prospects: ['Native metal', 'Cobalt and nickel', 'Precious metals', 'Water ice'], speciality: 'The cheapest metal and water off the Earth', environment: 'Small bodies with almost no gravity', reach: R(6, 4, 1),
  },
  {
    key: 'arcadia_planitia', n: 5, name: 'Arcadia Planitia', body: 'mars', zone: 'mars', kind: 'colony', gravity: 0.38, mortalityBp: 10500, housing: 5_000_000, solarBp: 4300,
    prospects: ['Water ice'], speciality: 'The main colony site of Mars', environment: 'Thin cold air, dust storms; ice just below the surface', reach: R(8, 5, 1),
  },
  {
    key: 'valles_marineris', n: 6, name: 'Valles Marineris', body: 'mars', zone: 'mars', kind: 'mining', gravity: 0.38, mortalityBp: 10500, housing: 1_500_000, solarBp: 4300,
    prospects: ['Iron ore', 'Salts (sulfates and chlorides)'], speciality: 'Martian industry in the great canyon', environment: 'Canyon floor with denser air and exposed strata', reach: R(8, 5, 1),
  },
  {
    key: 'jezero_delta', n: 7, name: 'Jezero Delta', body: 'mars', zone: 'mars', kind: 'research', gravity: 0.38, mortalityBp: 10500, housing: 500_000, solarBp: 4300,
    prospects: ['Water ice'], speciality: 'Astrobiology station: an ancient river delta to search for life', environment: 'Dry crater lake with layered sediments', reach: R(8, 5, 1),
  },
  {
    key: 'aphrodite_station', n: 8, name: 'Aphrodite cloud station', body: 'venus', zone: 'venus', kind: 'colony', gravity: 0.9, mortalityBp: 10300, housing: 500_000, solarBp: 19000,
    prospects: ['Atmospheric chemicals'], speciality: 'Floating habitats at nearly Earth gravity; births at the full rate, but almost nothing can be exported', environment: 'Fifty kilometres up, where the air is Earth-like in pressure and temperature', reach: R(5, 3, 1),
  },
  {
    key: 'prokofiev', n: 9, name: 'Prokofiev', body: 'mercury', zone: 'mercury', kind: 'extraction', gravity: 0.38, mortalityBp: 11500, housing: 250_000, solarBp: 66000,
    prospects: ['Water ice', 'Iron ore'], speciality: 'Power: the beam station for light sails', environment: 'Mercury’s north pole: ice in permanent shadow beside blazing sunlight', reach: R(null, 4, 2),
  },
  {
    key: 'ceres', n: 10, name: 'Ceres', body: 'ceres', zone: 'belt', kind: 'hub', gravity: 0.03, mortalityBp: 11000, housing: 2_000_000, solarBp: 1300,
    prospects: ['Water ice', 'Ammonia salts'], speciality: 'Hub of the Main Belt; nitrogen for fertilizer', environment: 'Dwarf planet of ice and rock', reach: R(15, 10, 2, { firstCargoOnly: true }),
  },
  {
    key: 'vesta', n: 11, name: 'Vesta', body: 'vesta', zone: 'belt', kind: 'mining', gravity: 0.03, mortalityBp: 11000, housing: 500_000, solarBp: 1300,
    prospects: ['Iron ore'], speciality: 'Metal from a shattered protoplanet', environment: 'Airless rocky world with a giant impact basin', reach: R(null, 10, 2),
  },
  {
    key: 'psyche', n: 12, name: 'Psyche', body: 'psyche', zone: 'belt', kind: 'mining', gravity: 0.01, mortalityBp: 11000, housing: 100_000, solarBp: 1000,
    prospects: ['Native metal', 'Cobalt and nickel', 'Precious metals'], speciality: 'A world of metal: platinum-group metals and superalloy inputs', environment: 'The exposed metal core of a lost world', reach: R(null, 11, 2),
  },
  {
    key: 'callisto', n: 13, name: 'Valhalla', body: 'callisto', zone: 'jupiter', kind: 'hub', gravity: 0.13, mortalityBp: 10800, housing: 1_500_000, solarBp: 370,
    prospects: ['Water ice'], speciality: 'Outside the radiation belts: the Jovian staging base', environment: 'Ancient cratered ice; low radiation', reach: R(null, 24, 4),
  },
  {
    key: 'ganymede', n: 14, name: 'Ganymede', body: 'ganymede', zone: 'jupiter', kind: 'colony', gravity: 0.15, mortalityBp: 11500, housing: 2_000_000, solarBp: 370,
    prospects: ['Water ice'], speciality: 'The largest moon, partly shielded by its own magnetic field', environment: 'Ice and rock under Jupiter’s radiation', reach: R(null, 24, 4),
  },
  {
    key: 'europa', n: 15, name: 'Europa', body: 'europa', zone: 'jupiter', kind: 'research', gravity: 0.13, mortalityBp: 14000, housing: 250_000, solarBp: 370,
    prospects: ['Water ice'], speciality: 'An ocean under the ice: a place to search for life', environment: 'Fierce radiation on the surface; safer under the ice', reach: R(null, 24, 4),
  },
  {
    key: 'io', n: 16, name: 'Io', body: 'io', zone: 'jupiter', kind: 'research', gravity: 0.18, mortalityBp: null, housing: 0, solarBp: 370,
    prospects: ['Sulfur and chemicals'], speciality: 'Plasma-torus science; only uncrewed works can operate here', environment: 'Volcanic and drowned in radiation: uninhabitable', reach: R(null, 24, 4, { uncrewed: true }),
  },
  {
    key: 'titan', n: 17, name: 'Kraken Mare', body: 'titan', zone: 'saturn', kind: 'extraction', gravity: 0.14, mortalityBp: 10300, housing: 4_000_000, solarBp: 110,
    prospects: ['Hydrocarbons', 'Water ice'], speciality: 'A world of fuel under a thick nitrogen sky: no pressure suits, cheap landings', environment: 'Methane seas at −180 °C under dense air', reach: R(73, 40, 6, { firstCargoOnly: true }),
  },
  {
    key: 'enceladus', n: 18, name: 'Enceladus', body: 'enceladus', zone: 'saturn', kind: 'research', gravity: 0.01, mortalityBp: 11000, housing: 100_000, solarBp: 110,
    prospects: ['Water ice'], speciality: 'Water plumes from a hidden ocean: a place to search for life', environment: 'Bright ice with geysers at the south pole', reach: R(null, 40, 6),
  },
  {
    key: 'triton', n: 19, name: 'Triton', body: 'triton', zone: 'neptune', kind: 'research', gravity: 0.08, mortalityBp: 11000, housing: 250_000, solarBp: 11,
    prospects: ['Water ice'], speciality: 'The frontier: the farthest outpost of the system', environment: 'Nitrogen frost and geysers at the edge of the planets', reach: R(null, 96, 12),
  },
];
// i18n-end

export interface OrbitDef {
  key: string;
  name: string;
  short: string;
  /** Body the orbit is drawn around (the Sun–Earth L2 point sits beyond the Earth, away from the Sun). */
  body: BodyId;
  zone: Zone;
  speciality: string;
  /** How a station gets there, phrased without technologies. */
  placement: string;
  /** Drawing: ring radius in display radii of the body, or a Lagrange point. */
  draw: { ring: number } | { point: 'eml1' | 'eml5' | 'sel2' };
}

// i18n-table
export const ORBITS: OrbitDef[] = [
  { key: 'leo', name: 'Low Earth orbit', short: 'LEO', body: 'earth', zone: 'earth_orbit', speciality: 'Cheapest to reach; shipyards and assembly; crowded with debris', placement: 'Directly from launch sites', draw: { ring: 1.22 } },
  { key: 'geo', name: 'Geostationary orbit', short: 'GEO', body: 'earth', zone: 'earth_orbit', speciality: 'Solar power satellites and relays', placement: 'A further push from low orbit (about 1.6 times the mass)', draw: { ring: 5.6 } },
  { key: 'eml1', name: 'Earth–Moon L1', short: 'L1', body: 'earth', zone: 'moon', speciality: 'The cislunar gateway: a depot here refuels every Moon and outer-system transfer', placement: 'A Moon transfer without the landing', draw: { point: 'eml1' } },
  { key: 'eml5', name: 'Earth–Moon L5', short: 'L5', body: 'earth', zone: 'earth_orbit', speciality: 'Rotating habitat rings, tied to a Moon base', placement: 'A further push from low orbit (about 1.5 times the mass)', draw: { point: 'eml5' } },
  { key: 'sel2', name: 'Sun–Earth L2', short: 'SEL2', body: 'earth', zone: 'earth_orbit', speciality: 'Deep, cold and dark: the best place for observatories', placement: 'A further push from low orbit (about 1.4 times the mass)', draw: { point: 'sel2' } },
  { key: 'llo', name: 'Low lunar orbit', short: 'LLO', body: 'moon', zone: 'moon', speciality: 'Staging for the lunar bases', placement: 'A Moon transfer without the landing', draw: { ring: 1.5 } },
  { key: 'mars_orbit', name: 'Mars orbit (with Phobos)', short: 'Mars orbit', body: 'mars', zone: 'mars', speciality: 'Martian gateway and depot', placement: 'A Mars transfer, braking in the Martian air', draw: { ring: 1.6 } },
  { key: 'ceres_orbit', name: 'Ceres orbit', short: 'Ceres orbit', body: 'ceres', zone: 'belt', speciality: 'Depot and yard of the Main Belt', placement: 'A Ceres transfer without the landing', draw: { ring: 1.8 } },
  { key: 'callisto_orbit', name: 'Callisto orbit', short: 'Callisto orbit', body: 'callisto', zone: 'jupiter', speciality: 'Jovian staging outside the radiation belts', placement: 'A Callisto transfer without the landing', draw: { ring: 1.7 } },
  { key: 'titan_orbit', name: 'Titan orbit', short: 'Titan orbit', body: 'titan', zone: 'saturn', speciality: 'Fuel depot of the outer system', placement: 'A Titan transfer without the landing', draw: { ring: 1.7 } },
];
// i18n-end

export const SITE_BY_KEY: Record<string, SiteDef> = Object.fromEntries(SITES.map((s) => [s.key, s]));
export const ORBIT_BY_KEY: Record<string, OrbitDef> = Object.fromEntries(ORBITS.map((o) => [o.key, o]));
export const SITES_ON: Partial<Record<BodyId, SiteDef[]>> = {};
for (const s of SITES) (SITES_ON[s.body] ??= []).push(s);
export const ORBITS_AT: Partial<Record<BodyId, OrbitDef[]>> = {};
for (const o of ORBITS) (ORBITS_AT[o.body] ??= []).push(o);

/** The stage of access that first puts crews on a site. */
export function crewStage(r: Reach): Stage {
  if (r.first !== null && !r.firstCargoOnly) return 'first';
  if (r.advanced !== null) return 'advanced';
  return 'late';
}
