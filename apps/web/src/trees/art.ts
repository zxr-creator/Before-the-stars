// Presentation choices derived from a disclosed card's own text: which chronicle
// vignette illustrates it, the accent of its field or group, and a pictogram for
// each thing it enables. Nothing here knows the catalogue; an unfamiliar card
// simply gets the general illustration.
import { hashStr } from '../theme/emblem';

type Rule = [RegExp, string];

const TECH_RULES: Rule[] = [
  [/jump|ftl|faster.than.light|spacetime|relativ/i, 'jump'],
  [/rocket|orbit|launch|spacecraft|satellite/i, 'launch'],
  [/quantum|experiment|chemi|optic|theor|laborator|natural philosophy|scientific|model/i, 'lab'],
  [/electr|circuit|telegraph|radio|comput|algorithm|software|cyber|semiconductor|signal|network/i, 'electric'],
  [/medic|vaccin|pharma|biolog|sanitation|health|ecolog|life support|trauma|water treatment/i, 'bio'],
  [/steam|engine|thermal|boiler|pressure|heat recovery|turbine|governor|diesel|fuel|refin/i, 'power'],
  [/mine|extraction|drainage|ore|coal|mineral/i, 'mine'],
  [/rail|road|transport|wheel|ship|navigat|harbou?r|sail|cart|bridge/i, 'road'],
  [/writ|script|literacy|print|archive|teach|school|text/i, 'school'],
  [/measur|standard|geometry|arithmetic|instrument|survey|map|count|record|calendar|ledger/i, 'measure'],
  [/textile|machin|factory|mill|interchangeable|assembly|polymer|manufactur/i, 'industry'],
  [/kiln|potter|ceramic|furnace|metallurg|smelt|bronze|iron|copper|steel|alloy|fire/i, 'craft'],
  [/tool|woodwork|joint|fiber|rope|weav|net|workshop/i, 'workshop'],
  [/stor|granar|preserv|drying/i, 'granary'],
  [/cultivat|seed|agricult|irrigat|husband|breed|field|crop|soil/i, 'fields'],
  [/hunt|fish|forag|gather/i, 'camp'],
  [/city|urban|construction|building|mason|architect/i, 'town'],
  [/weapon|powder|armou?r|fortif|ballistic/i, 'war'],
];
const TECH_FIELD_RULES: Rule[] = [
  [/ftl|fictional/i, 'jump'], [/comput|cyber/i, 'electric'], [/electric/i, 'electric'], [/biolog|ecolog/i, 'bio'],
  [/diesel|chemistry/i, 'industry'], [/steam|thermal/i, 'power'], [/industrial/i, 'industry'], [/measurement|science/i, 'measure'],
  [/specialized|records/i, 'town'], [/subsistence/i, 'camp'],
];
const PRACTICE_RULES: Rule[] = [
  [/interstellar|orbital|space|fleet|jump/i, 'launch'],
  [/\bai\b|comput|data|algorithm|automat|digital|cyber/i, 'electric'],
  [/assembl|council|vote|represent|parliament|federa|constitution|charter/i, 'assembly_hall'],
  [/relig|ritual|shrine|faith|temple|sacred/i, 'shrine'],
  [/treat|diplom|envoy|alliance/i, 'treaty'],
  [/defen|militia|duty|army|conscript|barrack|command/i, 'war'],
  [/research|science|laborator|peer|review|standard|measure/i, 'lab'],
  [/school|teach|apprentice|educat|literacy|scholar|oral|memory|archive/i, 'school'],
  [/industr|factory|union|wage|corporat|company|labou?r/i, 'industry'],
  [/trade|exchange|market|guild|merchant|credit|bank|currency|money/i, 'contact'],
  [/food|storage|granar|relief|ration/i, 'granary'],
  [/field|land|farm|irrigat|seasonal|calendar|tenure/i, 'fields'],
  [/kin|care|mutual|family|household/i, 'camp'],
  [/city|urban|public works|sanitation|health|welfare|infrastructure/i, 'town'],
  [/law|court|mediat|contract|property|tax|administ|bureau|census|commitment|dispute|leadership/i, 'civic'],
];

function pick(rules: Rule[], text: string): string | null {
  for (const [re, key] of rules) if (re.test(text)) return key;
  return null;
}

/** "key:n" for the Vignette component. */
export function techArt(name: string, field: string, handle: string): string {
  const key = pick(TECH_RULES, name) ?? pick(TECH_FIELD_RULES, field) ?? 'craft';
  return `${key}:${hashStr(handle) % 7}`;
}

export function practiceArt(name: string, group: string, handle: string): string {
  const key = pick(PRACTICE_RULES, name) ?? pick(PRACTICE_RULES, group) ?? 'civic';
  return `${key}:${hashStr(handle) % 7}`;
}

const GROUP_HUES = ['#d0a850', '#6fb0a6', '#cf8259', '#8ea0e4', '#a3c26c', '#dc8fb4', '#7fbbe0', '#d9b96e', '#b49ddc', '#8fc6a4'];

/** Accent for the n-th disclosed field or group (order of first appearance among disclosed cards). */
export function groupHue(index: number): string {
  return GROUP_HUES[((index % GROUP_HUES.length) + GROUP_HUES.length) % GROUP_HUES.length];
}

/** A pictogram for one line of a card's `enables` list. */
export function enableIcon(text: string): string {
  if (/^course\b/i.test(text)) return 'graduate';
  if (/^formations?\b/i.test(text)) return 'sword';
  if (/\(.+\)\s*$/.test(text)) return 'box';
  if (/[.:;]/.test(text) || text.split(' ').length > 6) return 'scroll';
  return 'house';
}
