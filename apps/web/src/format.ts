// Display helpers: units, dates and enum labels. Wire quantities of goods, work,
// power and research are integer milli-units; shares are basis points.
import type {
  ControllerKind, Deposit, Epistemic, Good, Intent, KnowledgeState, LaborCategory, MomentCategory,
  Month, Phase, PracticeState, Qual, ResearchClass, Role, SeatStatus, SettlementKind, Terrain, Visibility,
} from './protocol';
import type { ComponentChildren } from 'preact';
import { isZh, t, tc } from './i18n';

export const GOOD_LABEL: Record<Good, string> = {
  food: 'Food', materials: 'Timber, stone and clay', tools: 'Tools', copper_ore: 'Copper ore', iron_ore: 'Iron ore',
  coal: 'Coal', crude: 'Crude oil', minerals: 'Rare minerals', copper: 'Copper', metal: 'Structural metal',
  components: 'Mechanical components', conductors: 'Conductors', insulation: 'Insulation and seals',
  fuel: 'Refined fuel', chemicals: 'Chemicals', substrate: 'High-purity substrate', electronics: 'Electronic devices',
  hardware: 'Computing hardware', spares: 'Spare parts', media: 'Record media', instruments: 'Instruments',
  medicine: 'Medicine and bioproducts',
};
export const GOOD_SHORT: Record<Good, string> = {
  food: 'Food', materials: 'Materials', tools: 'Tools', copper_ore: 'Copper ore', iron_ore: 'Iron ore', coal: 'Coal',
  crude: 'Crude', minerals: 'Minerals', copper: 'Copper', metal: 'Metal', components: 'Components',
  conductors: 'Conductors', insulation: 'Insulation', fuel: 'Fuel', chemicals: 'Chemicals', substrate: 'Substrate',
  electronics: 'Electronics', hardware: 'Hardware', spares: 'Spares', media: 'Media', instruments: 'Instruments',
  medicine: 'Medicine',
};
export const GOODS: Good[] = Object.keys(GOOD_LABEL) as Good[];

export const QUAL_LABEL: Record<Qual, string> = {
  lorekeeper: 'Lorekeepers', artisan: 'Artisans', agronomist: 'Agronomists', tallier: 'Talliers', smith: 'Smiths',
  builder: 'Builders', navigator: 'Navigators', literate: 'Literate adults', scribe: 'Scribes', teacher: 'Teachers',
  scholar: 'Scholars', researcher: 'Researchers', scientist: 'Scientists', mechanic: 'Mechanics',
  technician: 'Technicians', electrician: 'Electricians', programmer: 'Programmers', physician: 'Physicians',
  ai_engineer: 'Model engineers', orbital: 'Orbital crews', ftl_engineer: 'Jump engineers',
};
export const TERRAIN_LABEL: Record<Terrain, string> = {
  plains: 'Plains', hills: 'Hills', mountains: 'Mountains', forest: 'Forest', marsh: 'Wetland', steppe: 'Steppe',
  desert: 'Desert', tundra: 'Tundra',
};
export const DEPOSIT_LABEL: Record<Deposit, string> = {
  copper_ore: 'Copper ore', iron_ore: 'Iron ore', coal: 'Coal', crude: 'Crude oil', minerals: 'Rare minerals',
};
export const ROLE_LABEL: Record<Role, string> = { assault: 'Assault', maneuver: 'Maneuver', denial: 'Denial' };
export const ROLES: Role[] = ['assault', 'maneuver', 'denial'];
export const RESEARCH_LABEL: Record<ResearchClass, string> = {
  craft: 'Craft inquiry', scholarly: 'Scholarly study', scientific: 'Experimental science',
  industrial: 'Industrial research', advanced: 'Advanced research', frontier: 'Frontier science',
};
export const KSTATE_LABEL: Record<KnowledgeState, string> = {
  hinted: 'Hinted', discovered: 'Discovered', investigating: 'Investigating', understood: 'Understood',
  prototyped: 'Prototyped', adopted: 'Adopted',
};
export const KSTATE_ORDER: KnowledgeState[] = ['hinted', 'discovered', 'investigating', 'understood', 'prototyped', 'adopted'];
export const PSTATE_LABEL: Record<PracticeState, string> = {
  recognized: 'Recognized', reforming: 'Reform under way', enacted: 'Enacted', established: 'Established',
};
export const LABOR_LABEL: Record<LaborCategory, string> = {
  extraction: 'Extraction', industry: 'Industry', services: 'Services and care', knowledge: 'Research and teaching',
  construction: 'Construction and projects',
};
export const PHASE_LABEL: Record<Phase, string> = {
  contact: 'Contact selection', negotiate: 'Negotiation', plan: 'Planning', finished: 'Match finished',
};
export const STATUS_LABEL: Record<SeatStatus, string> = { active: 'Active', eliminated: 'Eliminated', forfeited: 'Forfeited' };
export const CONTROLLER_LABEL: Record<ControllerKind, string> = {
  human: 'Human', external: 'External agent', native_easy: 'Native AI (Easy)', native_medium: 'Native AI (Medium)',
  native_hard: 'Native AI (Hard)',
};
export const VIS_LABEL: Record<Visibility, string> = { own: 'Governed', visible: 'Observed', remembered: 'Remembered' };
export const SETTLEMENT_LABEL: Record<SettlementKind, string> = {
  wilderness: 'Wilderness', camp: 'Camp', village: 'Village', town: 'Town', city: 'City', metropolis: 'Metropolis',
};
export const INTENT_LABEL: Record<Intent, string> = {
  inquiry: 'Inquiry', quotation: 'Quotation', counteroffer: 'Counteroffer', claim: 'Claim', need: 'Need',
  warning: 'Warning', alliance_proposal: 'Alliance proposal',
};
export const INTENTS: Intent[] = Object.keys(INTENT_LABEL) as Intent[];
export const EPISTEMIC_LABEL: Record<Epistemic, string> = {
  verified: 'Verified', reported: 'Reported', estimated: 'Estimated', forecast: 'Forecast', unknown: 'Unknown',
};
export const CATEGORY_LABEL: Record<MomentCategory, string> = {
  settlement: 'Settlement', subsistence: 'Subsistence', knowledge: 'Knowledge', industry: 'Industry',
  culture: 'Culture', religion: 'Religion', education: 'Education', diplomacy: 'Diplomacy', war: 'War',
  crisis: 'Crisis', governance: 'Governance', space: 'Space', endgame: 'Endgame',
};

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

// --- localization helpers ---------------------------------------------------------
// English source strings are the dictionary keys; see ./i18n. The helpers below keep
// the English output byte-for-byte as before and add natural Chinese forms.

/** A label used mid-sentence: lower-cased in English, simply translated in Chinese. */
export function lc(label: string): string {
  return isZh() ? t(label) : label.toLowerCase();
}

/**
 * Counted phrase with whole-string keys: tn(n, '{n} receipt', '{n} receipts').
 * English picks by number; Chinese has no plural and always uses the `many` key.
 * `{n}` is filled with the grouped number unless `vars.n` is given.
 */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  const v = { n: int(n), ...(vars ?? {}) };
  return t(isZh() || n !== 1 ? many : one, v);
}

/**
 * Translate a sentence whose placeholders are elements (links, bold numbers):
 * tx('{n} of {total} regions', { n: <b>3</b>, total: 9 }) → an array of children.
 */
export function tx(text: string, vars: Record<string, ComponentChildren>): ComponentChildren[] {
  const src = t(text);
  const out: ComponentChildren[] = [];
  const rx = /\{#?([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    out.push(m[1] in vars ? vars[m[1]] : m[0]);
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

/** Join a short list for display: "a, b, c" / "甲、乙、丙". */
export function joinList(parts: string[]): string {
  return parts.join(isZh() ? '、' : ', ');
}

/** Translate a list of server-supplied strings (blockers, summaries, evidence). */
export function tcAll(items: readonly string[] | null | undefined): string[] {
  return (items ?? []).map((x) => tc(x));
}

/**
 * A server term whose English word is ambiguous ("Civic" the lineage trait and "Civic" the
 * facility category): looks up "Civic (trait)" first, then the plain word.
 */
export function tcAs(text: string, kind: string): string {
  if (!isZh()) return text;
  const key = `${text} (${kind})`;
  const hit = tc(key);
  return hit === key ? tc(text) : hit;
}

/** Translate the server text inside requirement and check lists (for <Checklist>). */
export function tcChecks<T extends { text?: string; label?: string; detail?: string }>(items: readonly T[] | null | undefined): T[] {
  return (items ?? []).map((it) => {
    const out = { ...it };
    if (typeof it.text === 'string') out.text = tc(it.text);
    if (typeof it.label === 'string') out.label = tc(it.label);
    if (typeof it.detail === 'string') out.detail = tc(it.detail);
    return out;
  });
}

/** Plain integer with thousands separators. */
export function int(n: number): string {
  return nf0.format(n);
}

/** Compact number: 1,240 / 12.4k / 3.1M — in Chinese 1,240 / 1.24万 / 310万 / 1.2亿. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (isZh()) {
    if (a >= 1e8) return t('{n} yi', { n: nf2.format(n / 1e8) });
    if (a >= 1e7) return t('{n} wan', { n: nf0.format(n / 1e4) });
    if (a >= 1e5) return t('{n} wan', { n: nf1.format(n / 1e4) });
    if (a >= 1e4) return t('{n} wan', { n: nf2.format(n / 1e4) });
  } else {
    if (a >= 1e9) return nf1.format(n / 1e9) + 'B';
    if (a >= 1e6) return nf1.format(n / 1e6) + 'M';
    if (a >= 1e4) return nf1.format(n / 1e3) + 'k';
  }
  if (a >= 100 || Number.isInteger(n)) return nf0.format(n);
  if (a >= 10) return nf1.format(n);
  return nf2.format(n);
}

/** Milli-units → display units (900000 → "900"). */
export function milli(n: number): string {
  return compact(n / 1000);
}

/** Signed milli-units ("+12.5", "−3"). */
export function milliSigned(n: number): string {
  if (n === 0) return '0';
  return (n > 0 ? '+' : '−') + compact(Math.abs(n) / 1000);
}

/** Basis points → percentage string ("72%"). */
export function pct(bp: number, digits = 0): string {
  const v = bp / 100;
  return (digits ? v.toFixed(digits) : String(Math.round(v))) + '%';
}

export function yearOf(month: Month): number {
  return Math.floor(month / 12) + 1;
}

/** "Year 4" / "第4年" */
export function fmtYear(month: Month): string {
  return t('Year {y}', { y: yearOf(month) });
}

/** "Year 4, month 7" / "第4年7月" */
export function fmtDate(month: Month): string {
  return t('Year {y}, month {m}', { y: yearOf(month), m: (month % 12) + 1 });
}

/** "Y4·m7" for tight spaces / "4年7月". */
export function fmtDateShort(month: Month): string {
  return t('Y{y}·m{m}', { y: yearOf(month), m: (month % 12) + 1 });
}

/** Duration in months as "8 months" / "2 years 3 months"; "8个月" / "2年3个月". */
export function fmtMonths(m: number): string {
  if (m < 24) return tn(m, '{n} month', '{n} months', { n: m });
  const y = Math.floor(m / 12);
  const r = m % 12;
  return r ? t('{y} years {m} months', { y, m: r }) : t('{y} years', { y });
}

/** An honest range: "≈ 1,200–1,800" / "约 1,200–1,800". Collapses when both ends match. */
export function range(lo: number, hi: number): string {
  if (lo === hi) return t('≈ {n}', { n: compact(lo) });
  return t('≈ {lo}–{hi}', { lo: compact(lo), hi: compact(hi) });
}

/** "per month" suffix for a rate: "12/month" / "每月 12". */
export function perMonth(value: string | number): string {
  return t('{n}/month', { n: value });
}

/** Enum-like wire keys for display: "alliance_proposal" → "Alliance proposal" (then translated). */
export function titleCase(s: string): string {
  const x = s.replace(/_/g, ' ');
  const titled = x.charAt(0).toUpperCase() + x.slice(1);
  return isZh() ? t(titled) : titled;
}

/** "3 regions" — Chinese looks up the whole phrase ("{n} regions") and ignores number. */
export function plural(n: number, one: string, many?: string): string {
  const word = many ?? one + 's';
  if (isZh()) return t(`{n} ${word}`, { n: int(n) });
  return `${int(n)} ${n === 1 ? one : word}`;
}

/** Deterministic 32-bit hash for stable procedural detail. */
export function hash32(a: number, b = 0): number {
  let h = (a | 0) * 0x9e3779b1 + (b | 0) * 0x85ebca6b + 0x27d4eb2f;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) returning floats in [0,1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
