// Label tables of ruleset 3.0 for the works, productivity and military views. English
// source strings (translate with t() where shown); no JSX and no i18n here.
import type { Sector } from '../protocol';

// i18n-table
/** The ten eras (design chapter 37, section 3.2), by `FacilityType.era`. */
export const ERA_LABEL: string[] = [
  'Ancient', 'Classical', 'Medieval', 'Early Modern', 'Industrial', 'Modern', 'Information', 'Space', 'AI', 'Interstellar',
];

/** The economic sectors of labour productivity. */
export const SECTOR_LABEL: Record<Sector, string> = {
  food: 'Food and land', extraction: 'Extraction', industry: 'Industry', services: 'Services and care',
  knowledge: 'Research and teaching', construction: 'Construction',
};

/** Building lines (`FacilityType.line`; design chapter 37, section 8.2). */
export const LINE_LABEL: Record<string, string> = {
  administration: 'Administration', aluminium: 'Aluminium', arms_works: 'Arms works', batteries: 'Batteries',
  building_materials: 'Building materials', chemicals: 'Chemicals', colleges: 'Colleges', computer_works: 'Computer works',
  computing: 'Computing', consumer_goods: 'Consumer goods', conversion: 'Power conversion', copper: 'Copper smelting',
  diesel_power: 'Diesel power', electronics: 'Electronics', fertilizer: 'Fertilizer', fibre_plantations: 'Fibre plantations',
  fields: 'Fields', fine_wares: 'Fine wares', fishing: 'Fishing', forestry: 'Forestry', fuel: 'Fuel refining', fusion: 'Fusion power',
  grid: 'Grid', harbour: 'Harbours', health: 'Health care', high_energy: 'High-energy physics', horse_breeding: 'Horse breeding',
  instruments: 'Instruments', insulation: 'Insulation', interferometer: 'Interferometry', iron_steel: 'Iron and steel',
  irrigation: 'Irrigation', jump: 'Jump engineering', lattice: 'Interface lattice', launch: 'Launch', machine_shops: 'Machine shops',
  magnets: 'Magnets', medicine: 'Medicine', military: 'Military', mills_hydro: 'Mills and hydro power', mines: 'Mines and workings',
  motor_transport: 'Motor transport', nuclear_fuel: 'Nuclear fuel', nuclear: 'Nuclear power', orbital_power: 'Orbital power',
  orbital: 'Orbital works', parts: 'Parts and repair', pastures: 'Pastures', railway: 'Railways', records: 'Records and printing',
  religion: 'Religion', research: 'Research', roads: 'Roads', salt_pans: 'Salt pans', salt_works: 'Salt works',
  sanitation: 'Sanitation', schools: 'Schools', semiconductor_materials: 'Semiconductor materials', spice_plantations: 'Spice plantations',
  steam_power: 'Steam power', storage: 'Storage', synthetic_fuel: 'Synthetic fuel', technical_education: 'Technical education',
  textiles: 'Textiles', toolmaking: 'Toolmaking', urban_food: 'Urban food', water: 'Water supply', wells: 'Wells', wire: 'Wire and conductors',
};

/** Equipment generations G0-G7 (design chapter 37, section 2.1): the era each belongs to. */
export const GEN_ERA: string[] = [
  'Ancient', 'Classical and Medieval', 'Early Modern', 'Industrial', 'Modern', 'Information', 'AI', 'Space',
];
// i18n-end

/** "G4". */
export function genCode(gen: number): string {
  return 'G' + gen;
}

/** The display name of a building line: the table, else the key in words. */
export function lineLabel(line: string): string {
  return LINE_LABEL[line] ?? line.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** The era name of an era index, or null when the index is outside the ladder. */
export function eraLabel(era: number | undefined | null): string | null {
  return era === undefined || era === null ? null : ERA_LABEL[era] ?? null;
}
