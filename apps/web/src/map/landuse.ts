// What a region's reported facilities amount to, sector by sector. Both map tiers
// and the regional development card read this one summary, so a farming province
// and an industrial heartland are told apart the same way everywhere. Nothing is
// inferred for regions the viewer does not govern: no `own` block, no land use.
import type { Deposit, FacilityView, RegionView } from '../protocol';

export type Sector = 'food' | 'extraction' | 'industry' | 'power' | 'transport' | 'civic' | 'knowledge' | 'space';
export const SECTORS: Sector[] = ['food', 'extraction', 'industry', 'power', 'transport', 'civic', 'knowledge', 'space'];
// i18n-table
export const SECTOR_LABEL: Record<Sector, string> = {
  food: 'Food', extraction: 'Extraction', industry: 'Industry', power: 'Power', transport: 'Transport', civic: 'Civic',
  knowledge: 'Knowledge', space: 'Space',
};
// i18n-end
/** One hue per sector, shared by the map chips, the development card and its legend. */
export const SECTOR_COLOR: Record<Sector, string> = {
  food: '#7d9440', extraction: '#8a6a45', industry: '#59606b', power: '#c0892a', transport: '#3f7592', civic: '#9a6a52',
  knowledge: '#6d5ca8', space: '#2f7f79',
};

const KIND_SECTOR: Record<string, Sector> = {
  fields: 'food', pasture: 'food', fishery: 'food', granary: 'food', irrigation: 'food',
  camp: 'extraction', mine_copper: 'extraction', mine_iron: 'extraction', mine_coal: 'extraction', mine_minerals: 'extraction',
  oilwell: 'extraction',
  workshop: 'industry', kiln: 'industry', copper_smelter: 'industry', bloomery: 'industry', steelworks: 'industry',
  machine_shop: 'industry', parts_works: 'industry', wire_works: 'industry', chem_plant: 'industry', insulation_works: 'industry',
  refinery: 'industry', synfuel: 'industry', purifier: 'industry', fab: 'industry', computer_works: 'industry',
  datacenter: 'industry', press: 'industry', instrument_shop: 'industry', pharma: 'industry',
  waterwheel: 'power', steam: 'power', diesel: 'power', generator: 'power', hydro: 'power', grid: 'power', fission: 'power',
  fusion: 'power', orbital_power: 'power',
  roads: 'transport', port: 'transport', rail: 'transport', depot: 'transport',
  waterworks: 'civic', sewers: 'civic', water_treatment: 'civic', clinic: 'civic', hospital: 'civic', admin: 'civic',
  barracks: 'civic', holy_site: 'civic',
  lodge: 'knowledge', school: 'knowledge', college: 'knowledge', tech_institute: 'knowledge', makers_circle: 'knowledge',
  archive: 'knowledge', laboratory: 'knowledge', institute: 'knowledge', advanced_lab: 'knowledge', auto_lab: 'knowledge',
  high_energy: 'knowledge',
  launch_complex: 'space', orbital_station: 'space', orbital_yard: 'space', interferometer: 'space', jump_testbed: 'space',
  jump_yard: 'space', jump_base: 'space',
};
const CATEGORY_SECTOR: Record<string, Sector> = {
  food: 'food', extraction: 'extraction', industry: 'industry', manufacturing: 'industry', power: 'power', energy: 'power',
  transport: 'transport', civic: 'civic', education: 'knowledge', research: 'knowledge', space: 'space',
  'jump engineering': 'space',
};

/** The catalog's category wins; the table above covers views that carry no catalog (the observer's world view). */
export function sectorOf(kind: string, category?: string): Sector | null {
  const c = category ? CATEGORY_SECTOR[category.toLowerCase()] : undefined;
  return c ?? KIND_SECTOR[kind] ?? null;
}

const CRAFT = new Set(['workshop', 'kiln', 'press', 'instrument_shop']);
const SCHOOLS = new Set(['lodge', 'school', 'college', 'tech_institute']);
const MINE_DEPOSIT: Record<string, Deposit> = {
  mine_copper: 'copper_ore', mine_iron: 'iron_ore', mine_coal: 'coal', mine_minerals: 'minerals', oilwell: 'crude',
};
export type PowerKind = 'mill' | 'thermal' | 'hydro' | 'nuclear' | 'fusion' | 'beamed';
const POWER_KIND: Record<string, PowerKind> = {
  waterwheel: 'mill', steam: 'thermal', diesel: 'thermal', generator: 'thermal', hydro: 'hydro', fission: 'nuclear',
  fusion: 'fusion', orbital_power: 'beamed',
};
const POWER_RANK: PowerKind[] = ['mill', 'thermal', 'hydro', 'nuclear', 'fusion', 'beamed'];

/** Rough technological era implied by a facility that has actually been built. */
const ERA_OF: Record<string, number> = {
  workshop: 1, kiln: 1, copper_smelter: 1, bloomery: 1, school: 1, archive: 1, granary: 1, irrigation: 1, port: 1, roads: 1,
  waterworks: 1, admin: 1, barracks: 1, mine_copper: 1, mine_iron: 1, waterwheel: 1, press: 1, clinic: 1, holy_site: 1,
  steam: 2, steelworks: 2, machine_shop: 2, parts_works: 2, rail: 2, mine_coal: 2, oilwell: 2, laboratory: 2, institute: 2,
  college: 2, sewers: 2, instrument_shop: 2, hospital: 2, mine_minerals: 2,
  generator: 3, grid: 3, hydro: 3, fission: 3, fab: 3, computer_works: 3, datacenter: 3, refinery: 3, chem_plant: 3, diesel: 3,
  depot: 3, purifier: 3, pharma: 3, advanced_lab: 3, auto_lab: 3, high_energy: 3, synfuel: 3, insulation_works: 3, wire_works: 3,
  water_treatment: 3, tech_institute: 3,
  launch_complex: 4, orbital_station: 4, orbital_yard: 4, interferometer: 4, jump_testbed: 4, jump_yard: 4, jump_base: 4,
  fusion: 4, orbital_power: 4,
};

export function eraOfFacilities(facilities: FacilityView[]): number {
  let era = 0;
  let weight = 0;
  for (const f of facilities) {
    if (f.level <= 0) continue;
    const e = ERA_OF[f.kind] ?? 0;
    if (e > era) era = e;
    weight += e;
  }
  // One advanced building does not rebuild a whole town: require some breadth for the top eras.
  if (era >= 3 && weight < era * 3) era -= 1;
  return era;
}

export function facilityActive(f: FacilityView): boolean {
  return f.enabled && f.utilization_bp > 0 && (f.staff_needed <= 0 || f.staffed > 0);
}

export interface MineSite {
  key: string;
  /** What is dug or pumped; `null` for timber and quarry camps. */
  deposit: Deposit | null;
  well: boolean;
  level: number;
  active: boolean;
}

/** Work queued or under way in a region, as the viewer knows it. */
export interface Building { levels: number; projects: number }

export interface LandUse {
  /** Built levels in all sectors. */
  total: number;
  sectors: Record<Sector, number>;
  /** True when at least one facility of the sector is staffed and running. */
  active: Record<Sector, boolean>;
  fields: number;
  pasture: number;
  fishery: number;
  mines: MineSite[];
  /** Industry split: hand workshops against mills, smelters, plants and fabs. */
  craft: number;
  heavy: number;
  /** 0–1: the share of heavy-industry levels that is running. */
  heavyRunning: number;
  /** Generating plant only (not the grid). */
  generation: number;
  powerKind: PowerKind | null;
  grid: number;
  port: number;
  rail: number;
  roads: number;
  schools: number;
  labs: number;
  launch: number;
  orbital: number;
  jump: number;
  building: Building;
  era: number;
}

const NO_BUILDING: Building = { levels: 0, projects: 0 };

/** Sector totals for a governed region; `null` when the viewer does not see its works. */
export function landUse(r: RegionView, categories: Record<string, string> = {}, building: Building = NO_BUILDING): LandUse | null {
  if (!r.own) return null;
  const sectors = {} as Record<Sector, number>;
  const active = {} as Record<Sector, boolean>;
  for (const s of SECTORS) { sectors[s] = 0; active[s] = false; }
  const u: LandUse = {
    total: 0, sectors, active, fields: 0, pasture: 0, fishery: 0, mines: [], craft: 0, heavy: 0, heavyRunning: 0,
    generation: 0, powerKind: null, grid: 0, port: 0, rail: 0, roads: 0, schools: 0, labs: 0, launch: 0, orbital: 0, jump: 0,
    building, era: eraOfFacilities(r.own.facilities),
  };
  let heavyOn = 0;
  for (const f of r.own.facilities) {
    if (f.level <= 0) continue;
    const s = sectorOf(f.kind, categories[f.kind]);
    if (!s) continue;
    const on = facilityActive(f);
    u.total += f.level;
    sectors[s] += f.level;
    if (on) active[s] = true;
    switch (s) {
      case 'food':
        if (f.kind === 'fields') u.fields += f.level;
        else if (f.kind === 'pasture') u.pasture += f.level;
        else if (f.kind === 'fishery') u.fishery += f.level;
        break;
      case 'extraction': {
        const deposit = MINE_DEPOSIT[f.kind] ?? null;
        u.mines.push({ key: f.kind, deposit, well: f.kind === 'oilwell', level: f.level, active: on });
        break;
      }
      case 'industry':
        if (CRAFT.has(f.kind)) u.craft += f.level;
        else {
          u.heavy += f.level;
          if (on) heavyOn += f.level * Math.min(1, f.utilization_bp / 10000);
        }
        break;
      case 'power':
        if (f.kind === 'grid') u.grid += f.level;
        else {
          u.generation += f.level;
          const k = POWER_KIND[f.kind] ?? 'thermal';
          if (!u.powerKind || POWER_RANK.indexOf(k) > POWER_RANK.indexOf(u.powerKind)) u.powerKind = k;
        }
        break;
      case 'transport':
        if (f.kind === 'port') u.port += f.level;
        else if (f.kind === 'rail') u.rail += f.level;
        else if (f.kind === 'roads') u.roads += f.level;
        break;
      case 'knowledge':
        if (SCHOOLS.has(f.kind)) u.schools += f.level; else u.labs += f.level;
        break;
      case 'space':
        if (f.kind.startsWith('jump')) u.jump += f.level;
        else if (f.kind === 'launch_complex') u.launch += f.level;
        else u.orbital += f.level;
        break;
      default:
        break;
    }
  }
  u.heavyRunning = u.heavy > 0 ? Math.min(1, heavyOn / u.heavy) : 0;
  u.mines.sort((a, b) => b.level - a.level || a.key.localeCompare(b.key));
  return u;
}

/** 0–4: how much a sector total weighs on the map (none, a little, some, a lot, dominant). */
export function magnitude(levels: number): number {
  return levels <= 0 ? 0 : levels < 4 ? 1 : levels < 12 ? 2 : levels < 32 ? 3 : 4;
}

/** A signature of everything `landUse` reads, for caches keyed by region. */
export function landUseSignature(r: RegionView, building: Building = NO_BUILDING): string {
  let s = `${r.settlement}|${building.levels}|${building.projects}`;
  if (r.own) {
    s += `|${Math.round(Math.log2(1 + r.own.population) * 4)}`;
    for (const f of r.own.facilities) s += `;${f.kind}:${f.level}:${facilityActive(f) ? 'a' : 'i'}`;
  }
  return s;
}
