// Pure derivations for the economy ledger. No JSX and no i18n here, so the same
// arithmetic can be run headless against a saved observation (see
// scripts/economy-shots.mjs --check).
//
// Two kinds of figure leave this module and the screen keeps them apart:
//   verified  - the referee's own per-round totals (GoodLine) and counts;
//   estimate  - recipe amount x level x last month's rate (x carriage, x ore
//               grade for workings), i.e. what the ledger can reconstruct.
// Wire units (docs/units-and-scale.md §2): goods are integer base units (rations, tonnes,
// standard lots), work is worker-months, service 0.1 MWh; head counts are people; shares
// are basis points. Catalog amounts per person (course materials, army upkeep) are per
// thousand people.
import type {
  FacilityType, FacilityView, Good, GoodLine, Observation, OwnRegion, Qual, RecipeRun, RecipeView, RegionId,
  RegionView, ResearchClass,
} from '../protocol';

export type GoodGroup = 'raw' | 'processed' | 'advanced';
export const GROUPS: { key: GoodGroup; label: string; hint: string }[] = [
  { key: 'raw', label: 'Raw', hint: 'Grown, gathered or dug from the land' },
  { key: 'processed', label: 'Processed', hint: 'Made from raw goods in workshops and works' },
  { key: 'advanced', label: 'Advanced', hint: 'Long chains: precision, electronic and medical goods' },
];
export const GROUP_OF: Record<Good, GoodGroup> = {
  food: 'raw', materials: 'raw', copper_ore: 'raw', iron_ore: 'raw', coal: 'raw', crude: 'raw',
  timber: 'raw', fibres: 'raw', horses: 'raw', salt: 'raw', spices: 'raw', precious: 'raw', tin: 'raw', saltpetre: 'raw',
  gas: 'raw', bauxite: 'raw', uranium_ore: 'raw', rare_earths: 'raw', lithium: 'raw', cobalt_nickel: 'raw', quartz: 'raw',
  helium: 'raw', volatiles: 'raw', aluminium: 'processed', fertilizer: 'processed', munitions: 'processed',
  textiles: 'processed', propellant: 'processed', fine_wares: 'processed', consumer_goods: 'processed',
  magnets: 'advanced', batteries: 'advanced', nuclear_fuel: 'advanced', lattice: 'advanced', helium3: 'raw',
  tools: 'processed', copper: 'processed', metal: 'processed', components: 'processed', conductors: 'processed',
  insulation: 'processed', fuel: 'processed', chemicals: 'processed',
  substrate: 'advanced', electronics: 'advanced', hardware: 'advanced', spares: 'advanced', media: 'advanced',
  instruments: 'advanced', medicine: 'advanced',
};

export type Status = 'shortage' | 'tight' | 'balanced' | 'surplus' | 'full';
export const STATUS_RANK: Record<Status, number> = { shortage: 0, tight: 1, full: 2, balanced: 3, surplus: 4 };

/** Exact blocker sentences the referee sends (crates/bts-engine/src/observe.rs). */
export const B_WORKERS = 'Not enough workers';
export const B_QUALIFIED = 'Qualified staff are missing';
export const B_SHAFT = 'Not enough shaft power';
export const B_ELEC = 'Not enough electricity';
export const B_COMPUTE = 'Not enough compute';
export const B_WORN = 'Worn equipment: upkeep has been missed';
export const B_FULL = 'Stores are full; output throttled';
export const B_DEPOSIT = 'The deposit is nearly exhausted';
export const B_UNREST = 'Unrest is disrupting work';
export const isShortOf = (b: string) => b.startsWith('Short of ');

export interface Qty { good: Good; full: number; now: number; missing: boolean }

export interface FacCard {
  key: string;
  region: RegionView;
  own: OwnRegion;
  f: FacilityView;
  type: FacilityType | null;
  category: string;
  /** Fields, pastures and fishing grounds: staffed by the food plan, no recipe. */
  isFood: boolean;
  /** Has a recipe (goods, power or research) or grows food. */
  productive: boolean;
  run: RecipeRun | null;
  recipe: RecipeView | null;
  rateBp: number;
  inputs: Qty[];
  outputs: Qty[];
  upkeep: { good: Good; perMonth: number }[];
  draw: { shaft: number; elec: number; compute: number };
  deliver: { shaft: number; elec: number; compute: number };
  research: { cls: ResearchClass; full: number } | null;
  jobs: { qual: Qual | null; posts: number }[];
  skilledPosts: number;
  blockers: string[];
  missing: Good[];
  /** Held back by something other than a deliberate storage throttle. */
  troubled: boolean;
  throttled: boolean;
}

export type FlowKind =
  | 'recipe' | 'food' | 'household' | 'treaty' | 'upkeep' | 'teaching' | 'army' | 'people' | 'spoilage' | 'lost' | 'fieldinputs'
  | 'othermake' | 'otheruse' | 'rest';

export interface FlowLine {
  key: string;
  kind: FlowKind;
  /** Base units of the good per month. */
  perMonth: number;
  /** False only for treaty clauses (a signed amount, not a reconstruction). */
  estimate: boolean;
  region?: RegionId;
  regionName?: string;
  facility?: string;
  facilityName?: string;
  recipeName?: string;
  level?: number;
  rateBp?: number;
  /** Students, soldiers, residents, food workers or works, depending on kind. */
  count?: number;
  off?: boolean;
  blocked?: boolean;
  starved?: boolean;
  seat?: number;
  cardKey?: string;
}

export interface Claim { project: number; title: string; region: RegionId | null; needed: number; committed: number; paused: boolean }

export interface GoodRow {
  good: Good;
  group: GoodGroup;
  line: GoodLine;
  supply: number;
  demand: number;
  net: number;
  /** Verified monthly averages over the last round. */
  madePerMonth: number;
  usePerMonth: number;
  /** Months the stock lasts at last round's use; null when nothing was used. */
  cover: number | null;
  /** Months until empty at last round's net; null unless the stock is falling. */
  runway: number | null;
  status: Status;
  why: string;
  makers: FlowLine[];
  users: FlowLine[];
  claims: Claim[];
  makeEst: number;
  useEst: number;
  /** Sums of the lines derived from recipes, upkeep, classes, armies and residents only (no attributed remainders). */
  makeDerived: number;
  useDerived: number;
  starved: FacCard[];
  throttled: FacCard[];
  /** Still to be committed to open projects that are not paused. */
  owed: number;
  active: boolean;
}

export interface RegionSum {
  region: RegionView;
  own: OwnRegion;
  posts: number;
  filled: number;
  vacancies: number;
  household: number;
  works: number;
  troubled: number;
}

export interface QualRow { qual: Qual; count: number; employed: number; idle: number; training: number; posts: number; vacancies: number }

export interface Ledger {
  months: number;
  rows: GoodRow[];
  byGood: Map<Good, GoodRow>;
  cards: FacCard[];
  regions: RegionSum[];
  quals: QualRow[];
  soldiers: number;
  /** People plus soldiers: one unit of food each per month. */
  foodNeed: number;
  foodCover: number | null;
  compute: { supply: number; demand: number };
}

const FOOD_KINDS = new Set(['fields', 'pasture', 'fishery']);

function qualityFactor(type: FacilityType | null, region: RegionView): number {
  const site = type?.site_key ?? '';
  if (!site.startsWith('deposit:')) return 1;
  const dep = region.survey?.deposits.find((d) => d.kind === site.slice(8));
  // the engine keeps half the output regardless of grade and scales the other half
  return dep ? (5000 + dep.quality_bp / 2) / 10000 : 1;
}

export function buildCards(obs: Observation): FacCard[] {
  const types = new Map(obs.catalog.facilities.map((f) => [f.kind, f]));
  const cards: FacCard[] = [];
  for (const region of obs.regions) {
    const own = region.own;
    if (!own) continue;
    const link = own.link_efficiency_bp / 10000;
    for (const f of own.facilities) {
      const type = types.get(f.kind) ?? null;
      const run = f.runs[0] ?? null;
      const recipe = run && type ? type.recipes.find((r) => r.key === run.recipe) ?? null : null;
      const isFood = FOOD_KINDS.has(f.kind);
      const hasRecipes = (type?.recipes.length ?? 0) > 0;
      const rateBp = !f.enabled ? 0 : run ? run.rate_bp : f.utilization_bp;
      const rate = rateBp / 10000;
      const staff = f.staff_needed > 0 ? Math.min(1, f.staffed / f.staff_needed) : 1;
      const q = qualityFactor(type, region);
      const missing = run?.missing ?? [];
      const blockers = run?.blockers ?? [];
      const inputs: Qty[] = (recipe?.inputs ?? []).map((x) => ({ good: x.good, full: x.amount * f.level, now: x.amount * f.level * rate, missing: missing.includes(x.good) }));
      // food is not carried in this model and pays no carriage (units-and-scale §7)
      const outputs: Qty[] = (recipe?.outputs ?? []).map((x) => { const l = x.good === 'food' ? 1 : link; return { good: x.good, full: x.amount * f.level * l * q, now: x.amount * f.level * rate * l * q, missing: false }; });
      // posts of the method that ran (ruleset 2.0 slice D), else the base method's crew
      const jobs = recipe && (recipe.general_posts || recipe.skilled_posts?.length)
        ? [...(recipe.skilled_posts ?? []).map((j) => ({ qual: j.qual, posts: j.count * f.level })), ...(recipe.general_posts ? [{ qual: null, posts: recipe.general_posts * f.level }] : [])]
        : (type?.jobs ?? []).map((j) => ({ qual: j.qual, posts: j.count * f.level }));
      const throttled = blockers.includes(B_FULL);
      const real = blockers.filter((b) => b !== B_FULL);
      cards.push({
        key: `${region.id}:${f.kind}`, region, own, f, type, category: type?.category ?? 'Other', isFood,
        productive: hasRecipes || isFood, run, recipe, rateBp, inputs, outputs,
        // the engine never charges upkeep on fields, pastures or fishing grounds
        upkeep: f.enabled && !isFood ? (type?.upkeep ?? []).map((u) => ({ good: u.good, perMonth: u.amount * f.level })) : [],
        draw: recipe && f.enabled
          ? { shaft: recipe.shaft * f.level * staff, elec: recipe.elec * f.level * staff, compute: recipe.compute * f.level * staff }
          : { shaft: 0, elec: 0, compute: 0 },
        deliver: recipe
          ? { shaft: (recipe.out_shaft ?? 0) * f.level * rate, elec: (recipe.out_elec ?? 0) * f.level * rate, compute: (recipe.out_compute ?? 0) * f.level * rate }
          : { shaft: 0, elec: 0, compute: 0 },
        research: recipe?.research ? { cls: recipe.research[0], full: recipe.research[1] * f.level } : null,
        jobs, skilledPosts: jobs.reduce((a, j) => a + (j.qual ? j.posts : 0), 0),
        blockers, missing, throttled,
        troubled: f.enabled && (real.length > 0 || f.condition_bp < 8000 || (!run && f.staff_needed > 0 && f.staffed < f.staff_needed && !isFood)),
      });
    }
  }
  return cards;
}

/** Collapse many small lines so a breakdown stays readable; the tail becomes one "rest" line. */
function top(lines: FlowLine[], keep = 9): FlowLine[] {
  const order = (l: FlowLine) => (l.kind === 'otheruse' || l.kind === 'othermake' || l.kind === 'spoilage' || l.kind === 'lost' ? 1 : 0);
  const sorted = [...lines].sort((a, b) => order(a) - order(b) || b.perMonth - a.perMonth);
  if (sorted.length <= keep + 1) return sorted;
  const head = sorted.slice(0, keep);
  const tail = sorted.slice(keep);
  head.push({ key: 'rest:' + tail[0].kind, kind: 'rest', perMonth: tail.reduce((a, l) => a + l.perMonth, 0), estimate: true, count: tail.length });
  return head;
}

export function buildLedger(obs: Observation): Ledger {
  const months = Math.max(1, obs.months_per_round);
  const civ = obs.civ;
  const cards = buildCards(obs);
  const ownRegions = obs.regions.filter((r) => r.own);
  const soldiers = obs.armies.reduce((a, x) => a + x.soldiers.reduce((b, [, n]) => b + n, 0), 0);
  // one ration per resident and soldier a month (Observation.units.food_per_person_month)
  const perHead = obs.units?.food_per_person_month ?? 1;
  const foodNeed = (civ.population + soldiers) * perHead;

  const makers = new Map<Good, FlowLine[]>();
  const users = new Map<Good, FlowLine[]>();
  const push = (m: Map<Good, FlowLine[]>, g: Good, l: FlowLine) => { const a = m.get(g); if (a) a.push(l); else m.set(g, [l]); };

  // recipes: outputs and inputs of every facility, at last month's rate
  for (const c of cards) {
    const base = { region: c.region.id, regionName: c.region.name, facility: c.f.kind, facilityName: c.f.name, level: c.f.level, rateBp: c.rateBp, cardKey: c.key };
    if (c.recipe) {
      // fields report the method the land was worked by: their chemicals and fuel are real
      // inputs, but the harvest is shared out from the verified total below, not estimated twice
      if (!c.isFood) for (const o of c.outputs) push(makers, o.good, { ...base, key: 'm:' + c.key, kind: 'recipe', perMonth: o.now, estimate: true, recipeName: c.recipe.name, blocked: c.troubled, off: !c.f.enabled });
      for (const i of c.inputs) push(users, i.good, { ...base, key: 'u:' + c.key, kind: 'recipe', perMonth: i.now, estimate: true, recipeName: c.recipe.name, starved: i.missing, off: !c.f.enabled });
    } else if (!c.f.enabled && c.type) {
      // switched off: no run is reported, so show what its first known recipe would handle
      const r = c.type.recipes.find((x) => x.available);
      for (const o of r?.outputs ?? []) push(makers, o.good, { ...base, key: 'm:' + c.key, kind: 'recipe', perMonth: 0, estimate: true, recipeName: r!.name, off: true });
    }
  }
  // upkeep, one line per region and good
  for (const r of ownRegions) {
    const acc = new Map<Good, { amt: number; n: number }>();
    for (const c of cards) {
      if (c.region.id !== r.id) continue;
      for (const u of c.upkeep) { const a = acc.get(u.good) ?? { amt: 0, n: 0 }; a.amt += u.perMonth; a.n += 1; acc.set(u.good, a); }
    }
    for (const [g, a] of acc) push(users, g, { key: `up:${r.id}`, kind: 'upkeep', perMonth: a.amt, estimate: true, region: r.id, regionName: r.name, count: a.n });
  }
  // teaching materials: per enrolled student per month
  const courses = new Map(obs.catalog.courses.map((c) => [c.key, c]));
  const teach = new Map<string, FlowLine>();
  for (const p of obs.programs) {
    if (p.paused || p.enrolled <= 0) continue;
    for (const m of courses.get(p.course)?.materials ?? []) {
      const k = `${m.good}:${p.region}`;
      const l = teach.get(k) ?? { key: `teach:${p.region}`, kind: 'teaching' as const, perMonth: 0, estimate: true, region: p.region, regionName: obs.regions.find((r) => r.id === p.region)?.name, count: 0 };
      l.perMonth += (m.amount * p.enrolled) / 1000;
      l.count = (l.count ?? 0) + p.enrolled;
      teach.set(k, l);
    }
  }
  for (const [k, l] of teach) push(users, k.split(':')[0] as Good, l);
  // armies: upkeep per soldier per month (food is one unit a head, as for everyone)
  const army = new Map<Good, FlowLine>();
  for (const a of obs.armies) {
    const n = a.soldiers.reduce((b, [, x]) => b + x, 0);
    const tier = obs.catalog.unit_tiers.find((t) => t.tier === a.tier);
    for (const u of tier?.upkeep ?? []) {
      const l = army.get(u.good) ?? { key: 'army', kind: 'army' as const, perMonth: 0, estimate: true, count: 0 };
      l.perMonth += (u.amount * n) / 1000;
      l.count = (l.count ?? 0) + n;
      army.set(u.good, l);
    }
  }
  for (const [g, l] of army) push(users, g, l);
  // people eat one ration a month each
  for (const r of ownRegions) push(users, 'food', { key: `pop:${r.id}`, kind: 'people', perMonth: r.own!.population * perHead, estimate: true, region: r.id, regionName: r.name, count: r.own!.population });
  // treaties: signed monthly deliveries
  for (const tr of obs.diplomacy.treaties) {
    if (tr.status !== 'active') continue;
    const other = tr.parties[0] === obs.seat ? tr.parties[1] : tr.parties[0];
    for (const cl of tr.clauses) {
      if (cl.kind !== 'goods') continue;
      const line: FlowLine = { key: `treaty:${tr.id}:${cl.good}:${cl.from}`, kind: 'treaty', perMonth: cl.amount_per_month, estimate: false, seat: other, count: cl.months };
      push(cl.from === obs.seat ? users : makers, cl.good, line);
    }
  }

  const foodLine = civ.goods.find((g) => g.good === 'food');
  const fieldWorkers = cards.reduce((a, c) => a + (c.f.kind === 'fields' && c.f.enabled ? c.f.staffed : 0), 0);
  const rows: GoodRow[] = civ.goods.map((line) => {
    const g = line.good;
    const supply = line.produced + line.traded_in;
    const demand = line.consumed + line.traded_out;
    // stock change = produced − consumed − lost + traded in − traded out (lost: ruleset 2.0 slice B)
    const lost = line.lost ?? 0;
    const net = supply - demand - lost;
    const madePerMonth = line.produced / months;
    const usePerMonth = demand / months;
    // food cover is measured against what people must eat, not against spoilage
    const cover = g === 'food' ? (foodNeed > 0 ? line.stock / foodNeed : null) : usePerMonth > 0 ? line.stock / usePerMonth : null;
    const runway = net < 0 ? line.stock / (-net / months) : null;
    const mk = makers.get(g) ?? [];
    const us = users.get(g) ?? [];

    if (g === 'food') {
      // the food plan is not a recipe: share the verified harvest out by food workers
      const workers = ownRegions.reduce((a, r) => a + r.own!.labor.food, 0);
      for (const r of ownRegions) {
        const n = r.own!.labor.food;
        if (n > 0 && workers > 0) mk.push({ key: `food:${r.id}`, kind: 'food', perMonth: (madePerMonth * n) / workers, estimate: true, region: r.id, regionName: r.name, count: n });
      }
    }
    const makeDerived = mk.reduce((a, l) => a + (l.kind === 'recipe' ? l.perMonth : 0), 0);
    const useDerived = us.reduce((a, l) => a + (l.kind !== 'treaty' ? l.perMonth : 0), 0);
    const mkSum = mk.reduce((a, l) => a + l.perMonth, 0);
    if (g === 'materials') {
      // people without posts make a little building material while stores have room (0.3 t each at most)
      const household = civ.labor.household;
      const rest = Math.min(household * 0.3, Math.max(0, madePerMonth - mkSum));
      if (rest > 0) mk.push({ key: 'household', kind: 'household', perMonth: rest, estimate: true, count: household });
    }
    let usSum = us.reduce((a, l) => a + l.perMonth, 0);
    const usedPerMonth = line.consumed / months;
    // the referee books what nobody used apart from what was consumed: one verified line
    if (lost > 0) us.push({ key: 'lost', kind: 'lost', perMonth: lost / months, estimate: false });
    if (g === 'food' && line.lost === undefined) {
      // older referees count spoilage as consumption: it is the remainder after what people eat
      const rest = usedPerMonth - usSum;
      if (rest > 0) us.push({ key: 'spoilage', kind: 'spoilage', perMonth: rest, estimate: true });
    } else {
      const fieldsReported = cards.some((c) => c.isFood && c.f.kind === 'fields' && c.recipe);
      if ((g === 'chemicals' || g === 'fuel') && fieldWorkers > 0 && !fieldsReported) {
        // older referees: improved farming draws 0.01 t a month per field worker and the method is not
        // on the wire, so it is recognised only when the unexplained remainder is large enough to be it
        const cap = fieldWorkers * 0.01;
        const rest = usedPerMonth - usSum;
        if (rest >= cap * 0.5) { us.push({ key: 'fieldinputs', kind: 'fieldinputs', perMonth: Math.min(cap, rest), estimate: true, count: fieldWorkers }); usSum += Math.min(cap, rest); }
      }
      const rest = usedPerMonth - usSum;
      if (rest > Math.max(usedPerMonth * 0.05, 20)) us.push({ key: 'otheruse', kind: 'otheruse', perMonth: rest, estimate: true });
    }
    const mkSum2 = mk.reduce((a, l) => a + l.perMonth, 0);
    if (g !== 'food' && madePerMonth - mkSum2 > Math.max(madePerMonth * 0.05, 20)) mk.push({ key: 'othermake', kind: 'othermake', perMonth: madePerMonth - mkSum2, estimate: true });

    const claims: Claim[] = [];
    let owed = 0;
    for (const p of obs.projects) {
      const need = p.inputs_needed.find((x) => x.good === g);
      if (!need) continue;
      const committed = p.inputs_committed.find((x) => x.good === g)?.amount ?? 0;
      if (committed >= need.amount) continue;
      claims.push({ project: p.id, title: p.title, region: p.region, needed: need.amount, committed, paused: p.paused });
      if (!p.paused) owed += need.amount - committed;
    }

    const starved = cards.filter((c) => c.f.enabled && c.missing.includes(g));
    const throttled = cards.filter((c) => c.throttled && c.outputs.some((o) => o.good === g));
    let status: Status = 'balanced';
    let why = 'balanced';
    const foodFull = g === 'food' && line.capacity !== null && line.stock >= line.capacity * 0.97;
    if (starved.length) { status = 'shortage'; why = 'starved'; }
    else if (g === 'food' && civ.food_fulfillment_bp < 10000) { status = 'shortage'; why = 'hunger'; }
    else if (demand > 0 && cover !== null && cover < 2 && !foodFull) { status = 'shortage'; why = 'cover2'; }
    else if (owed > line.stock) { status = 'shortage'; why = 'owed'; }
    else if (throttled.length || foodFull) { status = 'full'; why = 'full'; }
    else if (runway !== null && runway < 12) { status = 'tight'; why = 'runway'; }
    else if (demand > 0 && cover !== null && cover < (g === 'food' ? Math.max(2, civ.policies.food_reserve_months) : 4)) { status = 'tight'; why = 'cover4'; }
    else if (net > 0 && net * 10 >= Math.max(demand, 1) && g !== 'food') { status = 'surplus'; why = 'surplus'; }
    else if (g === 'food' && net > 0 && net * 20 >= demand) { status = 'surplus'; why = 'surplus'; }

    const active = line.stock !== 0 || line.produced !== 0 || line.consumed !== 0 || line.traded_in !== 0 || line.traded_out !== 0;
    return {
      good: g, group: GROUP_OF[g], line, supply, demand, net, madePerMonth, usePerMonth, cover, runway, status, why,
      makers: top(mk), users: top(us), claims, makeEst: mk.reduce((a, l) => a + l.perMonth, 0), useEst: us.reduce((a, l) => a + l.perMonth, 0),
      makeDerived, useDerived, starved, throttled, owed, active,
    };
  });

  // regions
  const regions: RegionSum[] = ownRegions.map((region) => {
    const own = region.own!;
    const mine = cards.filter((c) => c.region.id === region.id);
    const staffedCards = mine.filter((c) => c.f.enabled && !c.isFood);
    const posts = staffedCards.reduce((a, c) => a + c.f.staff_needed, 0);
    const filled = staffedCards.reduce((a, c) => a + Math.min(c.f.staffed, c.f.staff_needed), 0);
    return { region, own, posts, filled, vacancies: posts - filled, household: own.labor.household, works: mine.length, troubled: mine.filter((c) => c.troubled).length };
  });

  // qualifications
  const training = new Map<Qual, number>();
  for (const p of obs.programs) {
    if (p.paused) continue;
    const out = courses.get(p.course)?.output;
    if (out) training.set(out, (training.get(out) ?? 0) + p.enrolled);
  }
  const posts = new Map<Qual, number>();
  for (const c of cards) {
    if (!c.f.enabled) continue;
    for (const j of c.jobs) if (j.qual) posts.set(j.qual, (posts.get(j.qual) ?? 0) + j.posts);
  }
  const seen = new Set<Qual>();
  const quals: QualRow[] = civ.quals.map((q) => {
    seen.add(q.qual);
    const p = posts.get(q.qual) ?? 0;
    return { qual: q.qual, count: q.count, employed: q.employed, idle: Math.max(0, q.count - q.employed), training: training.get(q.qual) ?? 0, posts: p, vacancies: Math.max(0, p - q.employed) };
  });
  for (const [q, p] of posts) if (!seen.has(q)) quals.push({ qual: q, count: 0, employed: 0, idle: 0, training: training.get(q) ?? 0, posts: p, vacancies: p });
  for (const [q, n] of training) if (!seen.has(q) && !posts.has(q)) quals.push({ qual: q, count: 0, employed: 0, idle: 0, training: n, posts: 0, vacancies: 0 });

  const p0 = ownRegions[0]?.own?.power;
  return {
    months, rows, byGood: new Map(rows.map((r) => [r.good, r])), cards, regions, quals, soldiers, foodNeed,
    foodCover: foodLine && foodNeed > 0 ? foodLine.stock / foodNeed : null,
    // computation is pooled nationally: the referee repeats the same figures in every region
    compute: { supply: p0?.compute_supply ?? 0, demand: p0?.compute_demand ?? 0 },
  };
}

// --- supply chain ------------------------------------------------------------------

export interface Stage {
  id: string;
  kind: string;
  name: string;
  recipeName: string;
  works: number;
  levels: number;
  /** Level-weighted share of full output last month, basis points. */
  rateBp: number;
  ins: Map<Good, { now: number; full: number; starved: boolean }>;
  outs: Map<Good, { now: number; full: number }>;
  delivers: 'shaft' | 'elec' | 'compute' | 'research' | 'launch' | null;
  troubled: number;
  starved: boolean;
  cards: FacCard[];
  col: number;
  row: number;
}
export interface ChainGood { good: Good; level: number; col: number; row: number }
export interface ChainEdge { from: string; to: string; good: Good; flow: number; full: number; starved: boolean; kind: 'in' | 'out'; /** Flow in tonnes a month, so goods counted in rations, tonnes and lots compare. */ tonnes: number }

/** Kilograms in one base unit of each good (docs/units-and-scale.md §2: rations 50 kg, bulk 1 t, lots 40-500 kg). */
export const KG_PER_UNIT: Partial<Record<Good, number>> = { food: 50, tools: 250, spares: 250, electronics: 50, hardware: 500, media: 150, instruments: 400, medicine: 40 };
const tonnesOf = (g: Good, n: number) => (n * (KG_PER_UNIT[g] ?? 1000)) / 1000;
export interface Chain { stages: Stage[]; goods: ChainGood[]; edges: ChainEdge[]; cols: number; rows: number; /** Largest edge flow, tonnes a month. */ maxFlow: number }

export function buildChain(cards: FacCard[]): Chain {
  const stages = new Map<string, Stage>();
  for (const c of cards) {
    if (!c.recipe || !c.f.enabled) continue;
    if (!c.inputs.length && !c.outputs.length) continue;
    const id = `${c.f.kind}/${c.recipe.key}`;
    let s = stages.get(id);
    if (!s) {
      const r = c.recipe;
      s = {
        id, kind: c.f.kind, name: c.f.name, recipeName: r.name, works: 0, levels: 0, rateBp: 0, ins: new Map(), outs: new Map(),
        delivers: r.outputs.length ? null : r.out_shaft ? 'shaft' : r.out_elec ? 'elec' : r.out_compute ? 'compute' : r.research ? 'research' : 'launch',
        troubled: 0, starved: false, cards: [], col: 0, row: 0,
      };
      stages.set(id, s);
    }
    s.works += 1;
    s.levels += c.f.level;
    s.rateBp += c.rateBp * c.f.level;
    s.cards.push(c);
    if (c.troubled) s.troubled += 1;
    for (const i of c.inputs) {
      const e = s.ins.get(i.good) ?? { now: 0, full: 0, starved: false };
      e.now += i.now; e.full += i.full; e.starved = e.starved || i.missing;
      s.ins.set(i.good, e);
      if (i.missing) s.starved = true;
    }
    for (const o of c.outputs) {
      const e = s.outs.get(o.good) ?? { now: 0, full: 0 };
      e.now += o.now; e.full += o.full;
      s.outs.set(o.good, e);
    }
  }
  const list = [...stages.values()];
  for (const s of list) s.rateBp = s.levels > 0 ? Math.round(s.rateBp / s.levels) : 0;

  // longest-path layering of goods; bounded so an unexpected cycle cannot hang the page
  const level = new Map<Good, number>();
  for (const s of list) { for (const g of s.ins.keys()) level.set(g, 0); for (const g of s.outs.keys()) level.set(g, 0); }
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (const s of list) {
      if (!s.ins.size) continue;
      const lv = 1 + Math.max(...[...s.ins.keys()].map((g) => level.get(g) ?? 0));
      for (const g of s.outs.keys()) if ((level.get(g) ?? 0) < lv && lv <= 9) { level.set(g, lv); changed = true; }
    }
    if (!changed) break;
  }
  const goods: ChainGood[] = [...level].map(([good, lv]) => ({ good, level: lv, col: 2 * lv + 1, row: 0 }));
  for (const s of list) {
    if (s.ins.size) s.col = 2 * Math.max(...[...s.ins.keys()].map((g) => level.get(g) ?? 0)) + 2;
    else s.col = 2 * Math.min(...[...s.outs.keys()].map((g) => level.get(g) ?? 0));
  }
  const edges: ChainEdge[] = [];
  for (const s of list) {
    for (const [g, e] of s.ins) edges.push({ from: 'g:' + g, to: s.id, good: g, flow: e.now, full: e.full, starved: e.starved, kind: 'in', tonnes: tonnesOf(g, e.now) });
    for (const [g, e] of s.outs) edges.push({ from: s.id, to: 'g:' + g, good: g, flow: e.now, full: e.full, starved: s.starved, kind: 'out', tonnes: tonnesOf(g, e.now) });
  }

  // order within columns by the mean row of neighbours, a few sweeps each way
  type Node = { id: string; col: number; row: number };
  const nodes: Node[] = [...goods.map((g) => ({ id: 'g:' + g.good, col: g.col, row: 0 })), ...list.map((s) => ({ id: s.id, col: s.col, row: 0 }))];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cols = Math.max(0, ...nodes.map((n) => n.col)) + 1;
  const columns: Node[][] = Array.from({ length: cols }, () => []);
  for (const n of nodes) columns[n.col].push(n);
  columns.forEach((c) => c.forEach((n, i) => { n.row = i; }));
  const neigh = new Map<string, string[]>();
  for (const e of edges) { (neigh.get(e.from) ?? neigh.set(e.from, []).get(e.from)!).push(e.to); (neigh.get(e.to) ?? neigh.set(e.to, []).get(e.to)!).push(e.from); }
  const sweep = (order: number[], left: boolean) => {
    for (const ci of order) {
      const col = columns[ci];
      const score = new Map<string, number>();
      for (const n of col) {
        const ns = (neigh.get(n.id) ?? []).map((id) => byId.get(id)!).filter((m) => (left ? m.col < n.col : m.col > n.col));
        score.set(n.id, ns.length ? ns.reduce((a, m) => a + m.row / Math.max(1, columns[m.col].length - 1 || 1), 0) / ns.length : n.row / Math.max(1, col.length - 1 || 1));
      }
      col.sort((a, b) => score.get(a.id)! - score.get(b.id)!);
      col.forEach((n, i) => { n.row = i; });
    }
  };
  const fwd = columns.map((_, i) => i);
  for (let i = 0; i < 4; i++) { sweep(fwd, true); sweep([...fwd].reverse(), false); }
  for (const g of goods) g.row = byId.get('g:' + g.good)!.row;
  for (const s of list) s.row = byId.get(s.id)!.row;
  return { stages: list, goods, edges, cols, rows: Math.max(1, ...columns.map((c) => c.length)), maxFlow: Math.max(1e-6, ...edges.map((e) => e.tonnes)) };
}
