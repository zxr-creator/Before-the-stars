// Original two-tone pictograms for the fifty goods of ruleset 3.0 (20×20 grid). The
// outline follows `currentColor`, so the same drawing reads on dark chrome and on
// paper; the fill is the good's own tint. Every good has a drawing of its own; they
// are kept to a few bold shapes so they stay legible at 14–16 px.
//
// `GOOD_GROUPS` is the one grouping of goods the interface uses (economy panel, the
// ledger's market, observer charts). Labels and hints are English source strings:
// translate them with t() where they are shown.
import type { JSX } from 'preact';
import type { Good } from '../protocol';

export const GOOD_TINT: Record<Good, string> = {
  food: '#e0b84c', materials: '#b98958', tools: '#a8b9c4', copper_ore: '#c97f55', iron_ore: '#a8705f',
  coal: '#77747c', crude: '#7d6c96', copper: '#dd8f58', metal: '#9fb2c8',
  components: '#cfa650', conductors: '#e3a25e', insulation: '#bcae8e', fuel: '#d8763e', chemicals: '#86b565',
  substrate: '#93bbdc', electronics: '#71c29c', hardware: '#819fe2', spares: '#b3a78c', media: '#c8a8dc',
  instruments: '#e5c678', medicine: '#dc6f6f',
  timber: '#9a7246', fibres: '#e8dcb0', horses: '#b07a4e', salt: '#e8e6e0', spices: '#c4572e', precious: '#e8c547',
  tin: '#b8bcc2', saltpetre: '#d9d2c0', gas: '#9ec4d8', bauxite: '#c7704a', uranium_ore: '#a9c45a', rare_earths: '#8f7fb8',
  lithium: '#d8e4ea', cobalt_nickel: '#6f8fb0', quartz: '#7fbcb2', helium: '#c9e3f2', aluminium: '#c5ccd4',
  fertilizer: '#9cb85a', munitions: '#8a7a5a', magnets: '#c0504d', batteries: '#7ab87a', nuclear_fuel: '#b6d84a',
  textiles: '#d89ab8', consumer_goods: '#e0a070', fine_wares: '#d4a4e0', lattice: '#a0e0f0', volatiles: '#a8d8f0',
  propellant: '#f0a060', helium3: '#e0f0ff',
};

// --- groups ---------------------------------------------------------------------------------

export type GoodGroupKey =
  | 'land' | 'building' | 'ores' | 'metals' | 'energy' | 'chemicals' | 'machinery' | 'electrical' | 'household'
  | 'military' | 'advanced';

export interface GoodGroupDef {
  key: GoodGroupKey;
  /** English source string; translate with t(). */
  label: string;
  /** English source string; translate with t(). */
  hint: string;
  goods: Good[];
}

/** Every good in exactly one group, in the order the interface lists them. */
export const GOOD_GROUPS: GoodGroupDef[] = [
  { key: 'land', label: 'Food and land', hint: 'Grown on fields, pastures, plantations and fishing grounds', goods: ['food', 'fibres', 'horses', 'spices'] },
  { key: 'building', label: 'Timber and building materials', hint: 'Cut in forests, quarried and dug for building', goods: ['timber', 'materials'] },
  { key: 'ores', label: 'Ores and minerals', hint: 'Dug from deposits: finite tonnes in the ground', goods: ['copper_ore', 'tin', 'iron_ore', 'salt', 'saltpetre', 'bauxite', 'rare_earths', 'quartz', 'lithium', 'cobalt_nickel', 'uranium_ore'] },
  { key: 'metals', label: 'Metals', hint: 'Smelted and refined from ores', goods: ['copper', 'metal', 'aluminium', 'precious'] },
  { key: 'energy', label: 'Fuels and energy', hint: 'Burned or split for heat, motion and electricity', goods: ['coal', 'crude', 'gas', 'fuel', 'helium', 'nuclear_fuel'] },
  { key: 'chemicals', label: 'Chemicals and fertilizer', hint: 'Made in chemical works for fields, plastics and industry', goods: ['chemicals', 'fertilizer', 'insulation'] },
  { key: 'machinery', label: 'Tools and machinery', hint: 'Tools, machine parts and instruments: the upkeep of every works', goods: ['tools', 'components', 'spares', 'instruments'] },
  { key: 'electrical', label: 'Electrical and electronic', hint: 'Wire, magnets, cells, chips and computers', goods: ['conductors', 'magnets', 'batteries', 'substrate', 'electronics', 'hardware'] },
  { key: 'household', label: 'Household and luxury', hint: 'What people use and live with: cloth, wares, records, medicine and luxuries', goods: ['textiles', 'consumer_goods', 'fine_wares', 'media', 'medicine'] },
  { key: 'military', label: 'Military', hint: 'Consumed by armies in training and in battle', goods: ['munitions'] },
  { key: 'advanced', label: 'Advanced and off-world', hint: 'The jump programme and works beyond the Earth', goods: ['lattice', 'propellant', 'volatiles', 'helium3'] },
];

const GROUP_BY_GOOD = new Map<Good, GoodGroupDef>();
for (const g of GOOD_GROUPS) for (const good of g.goods) GROUP_BY_GOOD.set(good, g);

/** The group a good belongs to (an unknown key falls into the last group rather than vanishing). */
export function goodGroupOf(good: Good): GoodGroupDef {
  return GROUP_BY_GOOD.get(good) ?? GOOD_GROUPS[GOOD_GROUPS.length - 1];
}

/** Position of a good in the grouped order, for sorting lists the way the groups list them. */
export function goodOrder(good: Good): number {
  let i = 0;
  for (const g of GOOD_GROUPS) {
    const j = g.goods.indexOf(good);
    if (j >= 0) return i + j;
    i += g.goods.length;
  }
  return i;
}

// --- pictograms -----------------------------------------------------------------------------

type Draw = (f: string) => JSX.Element;

const DRAW: Record<Good, Draw> = {
  food: (f) => <>
    <path d="M10 18V8" />
    <path d="M10 8.500c-2.400-.8-3.200-2.800-2.800-5 2 .4 3.200 2.200 2.800 5zM10 8.500c2.400-.8 3.200-2.800 2.800-5-2 .4-3.200 2.200-2.800 5z" fill={f} />
    <path d="M10 13c-2.600-.3-4-2-4-4.300 2.200 0 4 1.400 4 4.300zM10 13c2.600-.3 4-2 4-4.300-2.200 0-4 1.400-4 4.300z" fill={f} />
  </>,
  materials: (f) => <>
    <circle cx="6.300" cy="13.200" r="3.300" fill={f} /><circle cx="13.700" cy="13.200" r="3.300" fill={f} /><circle cx="10" cy="6.900" r="3.300" fill={f} />
    <circle cx="6.300" cy="13.200" r="1.100" /><circle cx="13.700" cy="13.200" r="1.100" /><circle cx="10" cy="6.900" r="1.100" />
  </>,
  tools: (f) => <>
    <path d="M3.500 16.500 10 10" />
    <path d="M8.500 5.500 11.500 3l5.500 5.500-2.500 3z" fill={f} />
    <path d="M16.500 16.500 12 12" /><path d="m15 18 3-3" />
  </>,
  copper_ore: (f) => <>
    <path d="M2.500 15 5.500 7l5-3 5.500 3.500 1.500 7.500z" fill={f} />
    <circle cx="8" cy="10" r="1.100" /><circle cx="12.500" cy="12" r="1.100" /><circle cx="11" cy="7.500" r=".8" />
  </>,
  iron_ore: (f) => <>
    <path d="M2.500 15 5 8l4.500-4 6 3.500 2 7.500z" fill={f} />
    <path d="M9.500 4 8 10l-3 5M8 10l5.500 1.500 2-4M13.500 11.500 15 15" />
  </>,
  coal: (f) => <>
    <path d="M3 13.500 5 7.500l5-3.500 5 2.500 2 6-3.500 4h-7z" fill={f} />
    <path d="m10 4-1 5 4.500 2.500M9 9l-3.500 3.500 1.500 4M13.500 11.500 17 12.500" />
  </>,
  crude: (f) => <>
    <path d="M10 2.500c3.200 4 5.200 6.600 5.200 9.300a5.200 5.200 0 0 1-10.400 0c0-2.700 2-5.300 5.200-9.300z" fill={f} />
    <path d="M7.500 12a2.600 2.600 0 0 0 2 2.800" />
  </>,
  quartz: (f) => <>
    <path d="M10 2.500 15 8l-5 9.500L5 8z" fill={f} />
    <path d="M5 8h10M10 2.500 8 8l2 9.500L12 8z" />
  </>,
  copper: (f) => <>
    <path d="M3 16 5 11h10l2 5z" fill={f} />
    <path d="M6.500 11 8 7h4l1.500 4" fill={f} />
    <path d="M7 13.500h6" />
  </>,
  metal: (f) => <>
    <path d="M4.500 3.500h11v3H12v7h3.500v3h-11v-3H8v-7H4.500z" fill={f} />
  </>,
  components: (f) => <>
    <path d="M10 2.500 11.200 5l2.600-1 .4 2.800 2.800.4-1 2.600 2.500 1.200-2.500 1.200 1 2.600-2.800.4-.4 2.800-2.600-1L10 19.500 8.800 17l-2.600 1-.4-2.800-2.800-.4 1-2.600L1.500 11 4 9.800l-1-2.600 2.800-.4.4-2.800 2.600 1z" fill={f} transform="translate(1.150 .9) scale(.885)" />
    <circle cx="10" cy="10.600" r="2.300" />
  </>,
  conductors: (f) => <>
    <rect x="5" y="5" width="10" height="10" rx="5" fill={f} />
    <path d="M2 10h3M15 10h3" />
    <path d="M7 8c.8-1.600 1.500-1.600 2.300 0s1.500 1.600 2.300 0 1.500-1.600 2.300 0M7 12c.8-1.600 1.500-1.600 2.300 0s1.500 1.600 2.300 0 1.500-1.600 2.300 0" transform="translate(-.45 0)" />
  </>,
  insulation: (f) => <>
    <circle cx="10" cy="10" r="7.300" fill={f} />
    <circle cx="10" cy="10" r="3.300" fill="none" />
    <path d="m4.900 7.200 2 1.300M15.100 7.200l-2 1.300M10 15.300v2M4.900 12.800l2-1.300M15.100 12.800l-2-1.300M10 2.700v2" />
  </>,
  fuel: (f) => <>
    <path d="M5 7h7.500l2.500 2.500V17H5z" fill={f} />
    <path d="M7.500 7V4h4v3" /><path d="m7.500 10.500 5 4M12.500 10.500l-5 4" />
  </>,
  chemicals: (f) => <>
    <path d="M8.500 3v4.800L4.200 15.300A1.400 1.400 0 0 0 5.400 17.500h9.200a1.400 1.400 0 0 0 1.200-2.200L11.500 7.800V3" />
    <path d="M6.300 12h7.400l2.100 3.300a1.400 1.400 0 0 1-1.200 2.200H5.400a1.400 1.400 0 0 1-1.200-2.200z" fill={f} />
    <path d="M7.500 3h5" />
  </>,
  substrate: (f) => <>
    <path d="M5.200 15.500a7.300 7.300 0 1 1 9.600 0z" fill={f} />
    <path d="M4.500 7h11M3.200 11h13.600M7.500 3.500v12M12.500 3.500v12" />
  </>,
  electronics: (f) => <>
    <rect x="5.500" y="5.500" width="9" height="9" rx="1" fill={f} />
    <path d="M8 5.500v-3M12 5.500v-3M8 17.500v-3M12 17.500v-3M5.500 8h-3M5.500 12h-3M17.500 8h-3M17.500 12h-3" />
    <rect x="8.200" y="8.200" width="3.600" height="3.600" rx=".4" />
  </>,
  hardware: (f) => <>
    <rect x="3.500" y="3.500" width="13" height="5.500" rx="1" fill={f} /><rect x="3.500" y="11" width="13" height="5.500" rx="1" fill={f} />
    <path d="M6 6.250h.2M6 13.750h.2M9 6.250h5M9 13.750h5" />
  </>,
  spares: (f) => <>
    <path d="M10 2.500 16.500 6.250v7.500L10 17.500 3.500 13.750v-7.500z" fill={f} />
    <circle cx="10" cy="10" r="2.800" />
  </>,
  media: (f) => <>
    <circle cx="10" cy="10" r="7.300" fill={f} />
    <circle cx="10" cy="10" r="1.300" />
    <circle cx="10" cy="5.800" r="1.200" /><circle cx="6.400" cy="12.100" r="1.200" /><circle cx="13.600" cy="12.100" r="1.200" />
  </>,
  instruments: (f) => <>
    <path d="M3 14a7 7 0 0 1 14 0z" fill={f} />
    <path d="M10 14 13 8.500" /><path d="M5.500 14v-.2M10 9v-.2M14.500 14v-.2M6.800 10.600l-.1-.1" />
    <path d="M3 16.500h14" />
  </>,
  medicine: (f) => <>
    <path d="M6 7.500h8V17H6z" fill={f} />
    <path d="M7.500 7.500V4h5v3.500" /><path d="M10 10v4.500M7.800 12.250h4.400" />
  </>,

  // --- ruleset 3.0 -------------------------------------------------------------------------
  // two stacked logs with their end grain
  timber: (f) => <>
    <path d="M4.500 3.800h9.500v5H4.500a2.500 2.500 0 0 1 0-5z" fill={f} />
    <circle cx="14" cy="6.300" r="2.500" fill={f} /><circle cx="14" cy="6.300" r=".7" />
    <path d="M3 11.200h9.500v5H3a2.500 2.500 0 0 1 0-5z" fill={f} transform="translate(2.500 0)" />
    <circle cx="15" cy="13.700" r="2.500" fill={f} /><circle cx="15" cy="13.700" r=".7" />
  </>,
  // a cotton boll on its stem
  fibres: (f) => <>
    <path d="M10 18v-5.500M10 15.500l-2.500-1.500M10 14.500l2.500-1.500" />
    <circle cx="7" cy="9.300" r="3" fill={f} /><circle cx="13" cy="9.300" r="3" fill={f} /><circle cx="10" cy="5.600" r="3.100" fill={f} />
  </>,
  // a horse's head
  horses: (f) => <>
    <path d="M12.200 2.500 9.500 5.200 3.800 10.800a1.600 1.600 0 0 0 .4 2.500l.7.4a1.800 1.800 0 0 0 2-.2L8.800 12l1.200 5.500h6.500c.3-4.500-.3-8.500-2.700-11.800L13.600 3.300z" fill={f} />
    <circle cx="10.300" cy="7.400" r=".55" />
    <path d="M14 6.400c1.300 2.600 1.700 6.200 1.500 11.100" />
  </>,
  // a cube of rock salt
  salt: (f) => <>
    <path d="M10 2.800 16.300 6.400v7.200L10 17.200 3.700 13.600V6.400z" fill={f} />
    <path d="M3.700 6.400 10 10l6.300-3.600M10 10v7.200" />
  </>,
  // a chili pod
  spices: (f) => <>
    <path d="M4.200 16.300c6-.4 10.500-4.300 11.100-10.300.9-.2 1.700.5 1.700 1.500-.5 6.500-6.100 11-12.800 10.200z" fill={f} />
    <path d="M15.300 6c.2-1.500.9-2.600 2-3.200M13.500 6.800c.6-.8 1.400-1 2.200-.8" />
  </>,
  // a ring set with a stone
  precious: (f) => <>
    <path fill-rule="evenodd" d="M10 6.800a5.200 5.200 0 1 1 0 10.400 5.200 5.200 0 0 1 0-10.400zm0 2.300a2.900 2.900 0 1 0 0 5.800 2.900 2.900 0 0 0 0-5.800z" fill={f} />
    <path d="M7.800 4.300 9 2.700h2l1.200 1.600L10 6.800z" fill={f} />
  </>,
  // a lump of tinstone with its dark crystals
  tin: (f) => <>
    <path d="M2.500 14.500 4.500 8 9 5l5.500 1.500 3 6.500-3 3.500h-8z" fill={f} />
    <path d="m7 10.500 1.600-1.600 1.600 1.600-1.600 1.600zM11.400 13l1.300-1.300 1.300 1.300-1.300 1.300z" fill="currentColor" />
  </>,
  // a heap with needle crystals
  saltpetre: (f) => <>
    <path d="M2.500 16.500c1.500-4 4-6 7.500-6s6 2 7.500 6z" fill={f} />
    <path d="M6.800 10.800 5.800 5.500M10 10.500V3.500M13.200 10.800l1-5.300M8.300 10.500 7.900 7.500M11.700 10.500l.4-3" />
  </>,
  // a gas flame
  gas: (f) => <>
    <path d="M10 2.500c1 3 4.800 4.600 4.800 9.300a4.800 4.800 0 0 1-9.600 0c0-2.100 1-3.400 2.100-4.200.2 1.500.9 2.400 1.700 2.700C8.800 8 9.200 5 10 2.500z" fill={f} />
    <path d="M10 17c-1.300 0-2-1-2-2.100 0-1.100.9-1.900 2-3.400 1.100 1.500 2 2.300 2 3.400 0 1.100-.7 2.100-2 2.100z" />
  </>,
  // a layered lump of bauxite
  bauxite: (f) => <>
    <path d="M2.800 14.500 4.300 8.300 9 5.200l5.300 1 3 5.300-2.300 5H5.300z" fill={f} />
    <path d="M4.300 10.800c2-1 4 1 6 0s3.700-1 5.400 0M3.500 13.800c2-1 4 1 6 0s4-1 6.200 0" />
  </>,
  // ore with a radiation mark
  uranium_ore: (f) => <>
    <path d="M2.500 15 5 7.500l5-3.500 5.500 2.500 2 8.500z" fill={f} />
    <circle cx="10" cy="11" r=".9" fill="currentColor" />
    <path d="M10 9V7.200M11.700 12l1.600.9M8.300 12l-1.600.9" stroke-width="2.200" stroke-linecap="butt" />
  </>,
  // a cluster of crystal prisms
  rare_earths: (f) => <>
    <path d="M5 16.500V9.300l1.500-2 1.500 2v7.200zM8.800 16.500V6.300l1.600-2.600L12 6.300v10.200zM12.800 16.500v-5.800l1.600-1.700 1.600 1.700v5.800z" fill={f} />
    <path d="M3 16.500h14" />
  </>,
  // a crystal over the brine pan
  lithium: (f) => <>
    <path d="M10 2.500 14 4.800v4.400L10 11.500 6 9.200V4.800z" fill={f} />
    <path d="M6 4.800 10 7l4-2.200M10 7v4.500" />
    <path d="M2.500 14.300c1.200-1 2.400-1 3.700 0s2.400 1 3.700 0 2.400-1 3.700 0 2.400 1 3.700 0M2.500 17.300c1.200-1 2.400-1 3.700 0s2.400 1 3.700 0 2.400-1 3.700 0 2.400 1 3.700 0" />
  </>,
  // two metal pellets
  cobalt_nickel: (f) => <>
    <path d="M2.800 6.800v6c0 1.100 1.500 2 3.400 2s3.400-.9 3.400-2v-6" fill={f} />
    <ellipse cx="6.200" cy="6.800" rx="3.400" ry="1.900" fill={f} />
    <path d="M10.400 10.200v5.300c0 1.100 1.500 2 3.400 2s3.400-.9 3.400-2v-5.300" fill={f} />
    <ellipse cx="13.800" cy="10.200" rx="3.400" ry="1.900" fill={f} />
  </>,
  // a balloon
  helium: (f) => <>
    <path d="M10 2.500a5.200 5.200 0 0 1 5.200 5.200c0 3.100-2.500 5.600-5.200 6.600-2.700-1-5.200-3.500-5.200-6.600A5.200 5.200 0 0 1 10 2.500z" fill={f} />
    <path d="m10 14.300-.9 1.300.9 1.200-.5 1.700" />
    <path d="M7.700 6.200a2.600 2.600 0 0 1 1.600-1.400" />
  </>,
  // a coil of sheet with its strip
  aluminium: (f) => <>
    <path d="M8 12.700h9.500v3.300H8z" fill={f} />
    <circle cx="8" cy="10" r="5.700" fill={f} />
    <path d="M9.200 10a1.200 1.200 0 0 0-2.400 0 1.800 1.800 0 0 0 3.600 0 2.400 2.400 0 0 0-4.800 0" />
  </>,
  // a sack with a sprout
  fertilizer: (f) => <>
    <path d="M5.300 7.300h9.400l1.100 10.200H4.200z" fill={f} />
    <path d="M7 7.300 8 4.500h4l1 2.800M7.500 4.500h5" />
    <path d="M10 15.500v-3.700M10 13c-1.500 0-2.300-1-2.300-2.100 1.500 0 2.300 1 2.300 2.100zM10 12c1.500 0 2.300-1 2.300-2.100-1.500 0-2.300 1-2.300 2.100z" />
  </>,
  // a cartridge
  munitions: (f) => <>
    <path d="M7.300 8.300c0-3 1.200-4.900 2.700-5.800 1.500.9 2.700 2.800 2.700 5.800z" fill={f} />
    <path d="M7.300 8.300h5.400v8.200H7.300z" fill={f} />
    <path d="M6.500 16.500h7M7.300 10.500h5.400" />
  </>,
  // a horseshoe magnet with its poles
  magnets: (f) => <>
    <path d="M3.800 3.200h4.200v7.300a2 2 0 0 0 4 0V3.200h4.200v7.300a6.200 6.200 0 0 1-12.400 0z" fill={f} />
    <path d="M3.800 6.300H8M12 6.300h4.200" />
  </>,
  // a battery cell
  batteries: (f) => <>
    <rect x="5.800" y="4.500" width="8.400" height="13" rx="1.300" fill={f} />
    <path d="M8.500 4.500V3h3v1.500" />
    <path d="M10 7.800v3M8.500 9.300h3M8.500 14.300h3" />
  </>,
  // an atom
  nuclear_fuel: (f) => <>
    <ellipse cx="10" cy="10" rx="7.600" ry="2.900" />
    <ellipse cx="10" cy="10" rx="7.600" ry="2.900" transform="rotate(60 10 10)" />
    <ellipse cx="10" cy="10" rx="7.600" ry="2.900" transform="rotate(-60 10 10)" />
    <circle cx="10" cy="10" r="2.300" fill={f} />
  </>,
  // a spool of thread
  textiles: (f) => <>
    <path d="M6.500 5.300h7v9.400h-7z" fill={f} />
    <path d="M4.500 3.300h11v2h-11zM4.500 14.700h11v2h-11z" fill={f} />
    <path d="M6.500 8.300l7-1.200M6.500 11.300l7-1.200M6.500 14.300l7-1.200" />
  </>,
  // a shopping bag
  consumer_goods: (f) => <>
    <path d="M4.300 7.300h11.400l-1 10.200H5.300z" fill={f} />
    <path d="M7.400 9.500V6a2.600 2.600 0 0 1 5.200 0v3.500" />
  </>,
  // a decorated vase
  fine_wares: (f) => <>
    <path d="M8.300 3h3.400v2.600C14 7 15 9.400 15 12c0 3-2.200 5.300-5 5.300S5 15 5 12c0-2.600 1-5 3.300-6.400z" fill={f} />
    <path d="M7.500 3h5M5.600 10.300h8.800M5.400 13h9.200" />
  </>,
  // a crystal lattice cell
  lattice: (f) => <>
    <path d="M10 2.500 16.500 6.250v7.500L10 17.500 3.500 13.750v-7.500z" fill={f} />
    <path d="M10 10v7.500M10 10 3.500 6.250M10 10l6.500-3.750" />
    <circle cx="10" cy="10" r="1.200" fill="currentColor" />
  </>,
  // a snowflake over a drop of water
  volatiles: (f) => <>
    <circle cx="10" cy="10" r="4.200" fill={f} />
    <path d="M10 2.500v15M3.500 6.250l13 7.500M3.500 13.750l13-7.500" />
    <path d="M8.500 3.800 10 5.200l1.500-1.400M8.500 16.200 10 14.800l1.500 1.400" />
  </>,
  // a propellant tank with its flame
  propellant: (f) => <>
    <rect x="6.300" y="2.500" width="7.400" height="11.500" rx="3.700" fill={f} />
    <path d="M8.400 15.500 10 18.500l1.600-3" />
    <path d="M6.300 8.200h7.400" />
  </>,
  // the Moon and helium-3
  helium3: (f) => <>
    <path d="M12.500 3.200a7 7 0 1 0 4.300 10.700A5.600 5.600 0 0 1 12.500 3.200z" fill={f} />
    <circle cx="14.700" cy="5.600" r=".9" fill="currentColor" /><circle cx="16.600" cy="8.600" r=".9" fill="currentColor" />
  </>,
};

export function GoodIcon({ good, size = 16, class: cls, title }: { good: Good; size?: number; class?: string; title?: string }) {
  const draw = DRAW[good] ?? DRAW.materials;
  return (
    <svg class={'icon good-icon' + (cls ? ' ' + cls : '')} width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" stroke-width="1.350" stroke-linecap="round" stroke-linejoin="round"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title ? <title>{title}</title> : null}
      {draw(GOOD_TINT[good] ?? '#999')}
    </svg>
  );
}
