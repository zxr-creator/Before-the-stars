// Pure derivations for the regional works view (Construction.tsx) and the build form
// (panels/projects.tsx). No JSX and no i18n here.
//
// One source of truth for prices: `OwnRegion.construction_sites`, the referee's quote
// of one more level in that region. An order of n levels is charged exactly n times
// the goods, work, crew and site power, and takes the same minimum months
// (docs/units-and-scale.md §6). This module multiplies by n and nothing else; it never
// prices anything itself. What it adds are comparisons with what the region holds
// (stock, qualified residents, spare shaft power), labelled as such by the caller.
import type {
  BuildSiteView, CrewSpec, FacilityType, FacilityView, GoodQty, InfraView, Observation, OwnRegion, ProjectView, QueueEntry,
  Qual, RecipeView, RegionView,
} from '../protocol';

/** Freight capacity in facility levels by transport grade 0-3 (doc §7). */
export const FREIGHT_BY_GRADE = [10, 24, 60, 150];
/** Coal and refined fuel that site engines burn: shaft base units (0.1 MWh) per tonne (doc §5). */
export const SITE_ENGINE_PER_T = { coal: 5, fuel: 10 };
/** The most shared support can save of a works' general posts, and per level beyond the first (doc §7). */
export const SUPPORT_CAP_BP = 2000;
export const SUPPORT_STEP_BP = 200;
export const MAINT_CAP_BP = 1500;
/** Facility levels one level of parts and repair works serves (doc §7). */
export const MAINT_SPAN = 12;

export interface Quote {
  kind: string;
  levels: number;
  /** The referee's quote for one level, as sent. */
  site: BuildSiteView;
  goods: GoodQty[];
  /** Worker-months. */
  work: number;
  crew: CrewSpec[];
  /** Shaft base units a month of full work. */
  power: number;
  months: number;
  firstOfKind: boolean;
  /** Worker-months the order accepts in a month: ceil(work / months). */
  monthly: number;
  built: number;
  queued: number;
  cap: number;
  /** Site capacity left after the levels built and queued. */
  room: number;
}

export function siteOf(own: OwnRegion | null | undefined, kind: string): BuildSiteView | null {
  return own?.construction_sites?.find((s) => s.kind === kind) ?? null;
}

/** The charge for `levels` levels of `kind` in a region: the referee's quote times the levels. */
export function quoteFor(r: RegionView, kind: string, levels: number): Quote | null {
  const own = r.own;
  const site = siteOf(own, kind);
  if (!own || !site) return null;
  const n = Math.max(1, levels);
  const built = own.facilities.find((f) => f.kind === kind)?.level ?? 0;
  const work = site.work_per_level * n;
  const months = Math.max(1, site.min_months);
  return {
    kind, levels: n, site,
    goods: (site.cost_per_level ?? []).map((g) => ({ good: g.good, amount: g.amount * n })),
    work,
    crew: (site.crew_per_level ?? []).map((c) => ({ quals: c.quals, count: c.count * n })),
    power: (site.site_power_per_level ?? 0) * n,
    months: site.min_months,
    firstOfKind: !!site.first_of_kind,
    monthly: Math.ceil(work / months),
    built,
    queued: site.queued_levels,
    cap: site.max_level,
    room: Math.max(0, site.max_level - built - site.queued_levels),
  };
}

/** Qualified residents of a region who hold any of the qualifications. */
export function holders(own: OwnRegion, quals: Qual[]): number {
  return own.quals.filter((q) => quals.includes(q.qual)).reduce((n, q) => n + q.count, 0);
}

/** People of the region reserved last month for other orders' crews that accept any of `quals`. */
export function reservedElsewhere(own: OwnRegion, quals: Qual[]): number {
  let n = 0;
  for (const e of own.construction_queue ?? []) {
    if (e.paused) continue;
    for (const c of e.crew) if (c.quals.some((q) => quals.includes(q))) n += c.on_site;
  }
  return n;
}

export type CheckTone = 'ok' | 'warn' | 'block' | 'info';

/** A plain fact about whether an order can proceed, for the caller to put into words. */
export type Check =
  | { tone: CheckTone; kind: 'requirement'; text: string }
  | { tone: CheckTone; kind: 'site'; cap: number; built: number; queued: number }
  | { tone: CheckTone; kind: 'levels'; max: number }
  | { tone: CheckTone; kind: 'goods'; good: GoodQty['good']; need: number; stock: number }
  | { tone: CheckTone; kind: 'crew'; quals: Qual[]; need: number; holders: number; reserved: number }
  | { tone: CheckTone; kind: 'power'; need: number; spare: number; coal: number; coalStock: number; fuelStock: number }
  | { tone: CheckTone; kind: 'labour'; monthly: number; free: number }
  | { tone: CheckTone; kind: 'first' }
  | { tone: CheckTone; kind: 'noquote' };

/**
 * What stands between an order and its completion, in the order a player would ask:
 * can it be ordered at all (requirement, site, levels), and then what it will wait for
 * (goods in store, crew in the region, site power, labour). Only the first group blocks
 * the order; the second is what the referee will report as "waiting for" if unmet.
 */
export function checks(obs: Observation, r: RegionView, fac: FacilityType, q: Quote | null): Check[] {
  const out: Check[] = [];
  const own = r.own!;
  if (!fac.available) {
    const unmet = fac.requirements.find((x) => !x.satisfied);
    out.push({ tone: 'block', kind: 'requirement', text: unmet?.text ?? '' });
  }
  if (!q) {
    out.push({ tone: 'block', kind: 'noquote' });
    return out;
  }
  if (q.room < q.levels) out.push({ tone: 'block', kind: 'site', cap: q.cap, built: q.built, queued: q.queued });
  if (q.levels > 20) out.push({ tone: 'block', kind: 'levels', max: 20 });
  for (const g of q.goods) {
    const stock = obs.civ.goods.find((x) => x.good === g.good)?.stock ?? 0;
    out.push({ tone: stock >= g.amount ? 'ok' : 'warn', kind: 'goods', good: g.good, need: g.amount, stock });
  }
  for (const c of q.crew) {
    const have = holders(own, c.quals);
    const reserved = reservedElsewhere(own, c.quals);
    out.push({ tone: have - reserved >= c.count ? 'ok' : 'warn', kind: 'crew', quals: c.quals, need: c.count, holders: have, reserved });
  }
  if (q.power > 0) {
    const spare = Math.max(0, own.power.shaft_supply - own.power.shaft_demand);
    const short = Math.max(0, q.power - spare);
    const coal = Math.ceil(short / SITE_ENGINE_PER_T.coal);
    const coalStock = obs.civ.goods.find((x) => x.good === 'coal')?.stock ?? 0;
    const fuelStock = obs.civ.goods.find((x) => x.good === 'fuel')?.stock ?? 0;
    const covered = short === 0 || coalStock * SITE_ENGINE_PER_T.coal + fuelStock * SITE_ENGINE_PER_T.fuel >= short;
    out.push({ tone: covered ? 'ok' : 'warn', kind: 'power', need: q.power, spare, coal, coalStock, fuelStock });
  }
  const free = own.labor.household + own.labor.projects;
  out.push({ tone: free >= q.monthly ? 'ok' : 'warn', kind: 'labour', monthly: q.monthly, free });
  if (q.firstOfKind) out.push({ tone: 'info', kind: 'first' });
  return out;
}

export function blocking(cs: Check[]): Check[] {
  return cs.filter((c) => c.tone === 'block');
}

// --- production methods -----------------------------------------------------------------

export interface MethodRow {
  recipe: RecipeView;
  chosen: boolean;
  active: boolean;
  /** Per level: general posts before shared-support saving, and qualified posts. */
  general: number;
  skilled: number;
}

export function methodsOf(fac: FacilityType | undefined, f: FacilityView): MethodRow[] {
  if (!fac) return [];
  return fac.recipes.map((rc) => ({
    recipe: rc,
    chosen: f.method === rc.key,
    active: (f.active_method ?? f.runs[0]?.recipe ?? null) === rc.key,
    general: rc.general_posts ?? (fac.jobs.find((j) => j.qual === null)?.count ?? 0),
    skilled: (rc.skilled_posts ?? fac.jobs.filter((j) => j.qual !== null)).reduce((n, j) => n + j.count, 0),
  }));
}

/** Goods by kind, `b - a`, for the region's levels: what a switch from method a to b changes. */
export function goodsDelta(a: GoodQty[], b: GoodQty[], levels: number): GoodQty[] {
  const m = new Map<GoodQty['good'], number>();
  for (const g of a) m.set(g.good, (m.get(g.good) ?? 0) - g.amount * levels);
  for (const g of b) m.set(g.good, (m.get(g.good) ?? 0) + g.amount * levels);
  return [...m.entries()].filter(([, v]) => v !== 0).map(([good, amount]) => ({ good, amount }));
}

// --- the region at a glance ----------------------------------------------------------------

export interface Limit {
  /** A blocker as the referee words it (translated by the caller), and the works it holds back. */
  text: string;
  works: string[];
}

/** Blockers of the region's works last month, most common first. */
export function limitsOf(own: OwnRegion): Limit[] {
  const m = new Map<string, string[]>();
  for (const f of own.facilities) {
    if (!f.enabled) continue;
    for (const b of new Set(f.runs.flatMap((x) => x.blockers))) {
      const list = m.get(b) ?? [];
      list.push(f.name);
      m.set(b, list);
    }
  }
  return [...m.entries()].map(([text, works]) => ({ text, works })).sort((a, b) => b.works.length - a.works.length);
}

export type Bottleneck =
  | { kind: 'freight_over'; load: number; cap: number; infraBp: number; lossBp: number }
  | { kind: 'freight_near'; load: number; cap: number }
  | { kind: 'queue'; text: string; orders: number }
  | { kind: 'shaft'; supply: number; demand: number }
  | { kind: 'elec'; supply: number; demand: number }
  | { kind: 'blocker'; text: string; works: string[] }
  | { kind: 'none' };

/** The binding constraint of the region, as far as the observation tells it. */
export function bottleneck(own: OwnRegion): Bottleneck {
  const inf = own.infrastructure;
  if (inf && inf.freight_load > inf.freight_capacity) {
    return { kind: 'freight_over', load: inf.freight_load, cap: inf.freight_capacity, infraBp: inf.infra_bp, lossBp: inf.congestion_loss_bp };
  }
  const p = own.power;
  if (p.shaft_demand > p.shaft_supply && p.shaft_demand > 0) return { kind: 'shaft', supply: p.shaft_supply, demand: p.shaft_demand };
  if (p.elec_demand > p.elec_supply && p.elec_demand > 0) return { kind: 'elec', supply: p.elec_supply, demand: p.elec_demand };
  const top = limitsOf(own)[0];
  if (top) return { kind: 'blocker', text: top.text, works: top.works };
  if (inf && inf.freight_capacity - inf.freight_load <= 2 && inf.freight_load > 0) return { kind: 'freight_near', load: inf.freight_load, cap: inf.freight_capacity };
  const waiting = (own.construction_queue ?? []).filter((e) => !e.paused && e.waiting_for.length);
  if (waiting.length) return { kind: 'queue', text: waiting[0].waiting_for[0], orders: waiting.length };
  return { kind: 'none' };
}

/** Levels by labour category, for the region's specialisation (food works have none). */
export function levelsByCategory(obs: Observation, own: OwnRegion): { cat: string; levels: number }[] {
  const m = new Map<string, number>();
  for (const f of own.facilities) {
    const cat = obs.catalog.facilities.find((x) => x.kind === f.kind)?.labor_category ?? 'food';
    m.set(cat, (m.get(cat) ?? 0) + f.level);
  }
  return [...m.entries()].map(([cat, levels]) => ({ cat, levels })).sort((a, b) => b.levels - a.levels);
}

export function totalLevels(own: OwnRegion): number {
  return own.facilities.reduce((n, f) => n + f.level, 0);
}

/** Does this works load the region's freight (industry, extraction or a power source)? */
export function loadsFreight(fac: FacilityType | undefined): boolean {
  if (!fac) return false;
  if (fac.labor_category === 'industry' || fac.labor_category === 'extraction') return true;
  return fac.recipes.some((r) => (r.out_shaft ?? 0) > 0 || (r.out_elec ?? 0) > 0);
}

/** The support saving a works of this many levels would have with freight served in full (doc §7). */
export function supportSavingAt(levels: number, infraBp: number): number {
  return Math.floor((Math.min(SUPPORT_CAP_BP, SUPPORT_STEP_BP * Math.max(0, levels - 1)) * infraBp) / 10000);
}

export function infraOf(own: OwnRegion): InfraView | null {
  return own.infrastructure ?? null;
}

// --- the queue ----------------------------------------------------------------------------

export interface QueueRow { entry: QueueEntry; project: ProjectView | null }

export function queueOf(obs: Observation, own: OwnRegion): QueueRow[] {
  return (own.construction_queue ?? []).slice().sort((a, b) => a.position - b.position)
    .map((entry) => ({ entry, project: obs.projects.find((p) => p.id === entry.project) ?? null }));
}

/** Governed regions, capital first, then by population. */
export function ownRegions(obs: Observation): RegionView[] {
  return obs.regions.filter((r) => r.own).sort((a, b) => (a.id === obs.civ.capital ? -1 : b.id === obs.civ.capital ? 1 : b.own!.population - a.own!.population));
}
