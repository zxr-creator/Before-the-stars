// Synthetic Observation for the map dev harness. It imitates the world generator
// (jittered-grid Voronoi cells, the highest cells become land) and then hides part
// of the land so fog, remembered regions and edges of knowledge can be exercised.
// Dev-only: never imported by the application.
import type {
  ArmyView, FacilityType, FacilityView, ForeignArmyView, ForeignCiv, NeighborLink, Observation, OwnRegion, RegionView,
  SettlementKind, Terrain,
} from '../src/protocol';
import { rng } from '../src/format';

const W = 1600, H = 1000;

interface Cell { x: number; y: number; poly: [number, number][]; edges: number[]; elev: number; land: boolean }

function clip(poly: [number, number][], edges: number[], sx: number, sy: number, ox: number, oy: number, oid: number): [[number, number][], number[]] {
  const mx = (sx + ox) / 2, my = (sy + oy) / 2;
  const nx = ox - sx, ny = oy - sy;
  const side = (p: [number, number]) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out: [number, number][] = [];
  const oe: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = side(a), db = side(b);
    const x = (): [number, number] => {
      const t = da / (da - db);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    if (da <= 0 && db <= 0) {
      out.push(a); oe.push(edges[i]);
    } else if (da <= 0) {
      out.push(a); oe.push(edges[i]);
      out.push(x()); oe.push(oid); // the cut runs along the bisector with `oid`
    } else if (db <= 0) {
      out.push(x()); oe.push(edges[i]);
    }
  }
  return [out, oe];
}

function emptyLabor() {
  return { working_age: 0, food: 0, facilities: 0, projects: 0, household: 0, students: 0, teachers: 0, soldiers: 0 };
}
function fac(kind: string, name: string, level: number): FacilityView {
  return { kind, name, level, max_level: 12, staffed: level * 8, staff_needed: level * 10, condition_bp: 9000, utilization_bp: 8000, runs: [], enabled: true };
}
function facType(kind: string, name: string, category: string): FacilityType {
  return {
    kind, name, category, description: '', cost: [], work: 1000, jobs: [], recipes: [], provides: [], site: 'Anywhere', upkeep: [],
    requirements: [], available: true, labor_category: null,
  };
}

export function makeFixture(seed = 11, want = 48): Observation {
  const rand = rng(seed * 2654435761);
  const total = Math.floor((want * 9) / 5);
  const cols = Math.max(4, Math.floor(Math.sqrt(total * 1.6)));
  const rows = Math.ceil(total / cols);
  const cw = W / cols, ch = H / rows;
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: (c + 0.18 + rand() * 0.64) * cw, y: (r + 0.18 + rand() * 0.64) * ch, poly: [], edges: [], elev: 0, land: false });
    }
  }
  const n = cells.length;
  for (let i = 0; i < n; i++) {
    let poly: [number, number][] = [[0, 0], [W, 0], [W, H], [0, H]];
    let edges = [-1, -1, -1, -1];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      [poly, edges] = clip(poly, edges, cells[i].x, cells[i].y, cells[j].x, cells[j].y, j);
    }
    cells[i].poly = poly;
    cells[i].edges = edges;
  }
  const ph = [rand() * 6, rand() * 6, rand() * 6, rand() * 6, rand() * 6, rand() * 6];
  const noise = (x: number, y: number, k: number) =>
    0.5 + 0.25 * Math.sin(x / (130 + k * 17) + ph[k % 6]) * Math.cos(y / (110 + k * 13) + ph[(k + 1) % 6]) +
    0.25 * Math.sin((x + y) / (210 + k * 29) + ph[(k + 2) % 6]);
  for (const c of cells) {
    const dx = (c.x - W / 2) / (W / 2), dy = (c.y - H / 2) / (H / 2);
    c.elev = noise(c.x, c.y, 0) * 0.75 + (1 - (dx * dx * 0.55 + dy * dy * 0.75)) * 0.35;
  }
  const order = cells.map((_, i) => i).sort((a, b) => cells[b].elev - cells[a].elev || a - b);
  for (const i of order.slice(0, want)) cells[i].land = true;
  const land = cells.map((_, i) => i).filter((i) => cells[i].land);
  const idOf = new Map(land.map((ci, rid) => [ci, rid]));
  const emin = Math.min(...land.map((i) => cells[i].elev)), emax = Math.max(...land.map((i) => cells[i].elev));

  interface R { id: number; cell: Cell; terrain: Terrain; coastal: boolean; river: boolean; elevation: number; nb: NeighborLink[]; name: string }
  const A = ['Or', 'Ul', 'Tor', 'Ar', 'Bel', 'Cas', 'Dun', 'El', 'Fen', 'Gal', 'Hal', 'Ist', 'Kor', 'Lun', 'Mar', 'Nor', 'Os', 'Pel', 'Quen', 'Ros', 'Sel', 'Tam', 'Var', 'Wen', 'Yor', 'Zan'];
  const B = ['a', 'e', 'i', 'o', 'u', 'ae', 'el', 'en', 'ar', 'or'];
  const C = ['fell', 'holm', 'mark', 'rest', 'wick', 'dale', 'ford', 'mere', 'stead', 'haven', 'moor', 'reach', 'strand', 'gate'];
  const used = new Set<string>();
  const regs: R[] = land.map((ci, rid) => {
    const c = cells[ci];
    const e01 = (c.elev - emin) / (emax - emin || 1);
    const height = Math.min(1, e01 * 0.55 + noise(c.x, c.y, 2) * 0.6);
    const moist = noise(c.x, c.y, 4);
    const lat = Math.abs(c.y - H / 2) / (H / 2);
    const coastal = c.edges.some((e) => e < 0 || !cells[e].land);
    let terrain: Terrain;
    if (height > 0.74) terrain = 'mountains';
    else if (lat > 0.84) terrain = 'tundra';
    else if (height > 0.6) terrain = 'hills';
    else if (moist < 0.36) terrain = lat < 0.45 ? 'desert' : 'steppe';
    else if (moist > 0.6) terrain = height < 0.42 && coastal ? 'marsh' : 'forest';
    else if (moist < 0.44) terrain = 'steppe';
    else terrain = 'plains';
    const nb: NeighborLink[] = [];
    for (const e of c.edges) {
      const o = e >= 0 ? idOf.get(e) : undefined;
      if (o !== undefined && !nb.some((x) => x.region === o)) nb.push({ region: o, kind: 'land' });
    }
    let name = '';
    for (let t = 0; t < 30 && (!name || used.has(name)); t++) {
      name = A[Math.floor(rand() * A.length)] + (rand() < 0.66 ? B[Math.floor(rand() * B.length)] : '') + C[Math.floor(rand() * C.length)];
    }
    used.add(name);
    return { id: rid, cell: c, terrain, coastal, river: false, elevation: Math.floor(height * 255), nb, name };
  });
  // Make sure every terrain appears at least once.
  const all: Terrain[] = ['plains', 'hills', 'mountains', 'forest', 'marsh', 'steppe', 'desert', 'tundra'];
  all.forEach((t, i) => {
    if (!regs.some((r) => r.terrain === t)) regs[(i * 5 + 3) % regs.length].terrain = t;
  });
  const setKind = (a: R, b: number, kind: string) => {
    for (const l of a.nb) if (l.region === b) l.kind = kind;
    for (const l of regs[b].nb) if (l.region === a.id) l.kind = kind;
  };
  // Rivers downhill from the highest regions to the coast.
  const sources = regs.filter((r) => r.terrain === 'mountains' || r.terrain === 'hills').sort((a, b) => b.elevation - a.elevation).slice(0, Math.max(3, Math.floor(regs.length / 7)));
  for (const src of sources) {
    let cur = src;
    for (let steps = 0; steps < 12; steps++) {
      cur.river = true;
      if (cur.coastal && steps > 0) break;
      let next: R | null = null;
      let best = cur.elevation + 6;
      for (const l of cur.nb) {
        const q = regs[l.region];
        const e = q.elevation - Math.floor(rand() * 12);
        if (e < best && !(q.river && steps > 0 && q.elevation >= cur.elevation)) { best = e; next = q; }
      }
      if (!next) break;
      setKind(cur, next.id, 'river');
      if (next.river) break;
      cur = next;
    }
  }
  // Mountain links are passes.
  for (const r of regs) {
    if (r.terrain !== 'mountains') continue;
    for (const l of r.nb) if (l.kind === 'land') setKind(r, l.region, 'pass');
  }
  // A few sea routes between coastal regions that are not adjacent.
  let sea = 0;
  for (const a of regs) {
    if (!a.coastal || sea >= 7) continue;
    for (const b of regs) {
      if (b.id <= a.id || !b.coastal || a.nb.some((l) => l.region === b.id)) continue;
      const d = Math.hypot(a.cell.x - b.cell.x, a.cell.y - b.cell.y);
      if (d > 230 && d < 420 && rand() < 0.16) {
        a.nb.push({ region: b.id, kind: 'sea' });
        b.nb.push({ region: a.id, kind: 'sea' });
        sea++;
        break;
      }
    }
  }

  // --- politics and knowledge --------------------------------------------------
  const nearest = (x: number, y: number, skip: Set<number>) =>
    regs.filter((r) => !skip.has(r.id)).sort((a, b) => Math.hypot(a.cell.x - x, a.cell.y - y) - Math.hypot(b.cell.x - x, b.cell.y - y))[0];
  const owner = new Map<number, number>();
  const claim = (seat: number, x: number, y: number, count: number): R => {
    const cap = nearest(x, y, new Set(owner.keys()));
    const q = [cap];
    owner.set(cap.id, seat);
    let got = 1;
    while (q.length && got < count) {
      const cur = q.shift()!;
      for (const l of cur.nb) {
        if (l.kind === 'sea' || owner.has(l.region) || got >= count) continue;
        owner.set(l.region, seat);
        q.push(regs[l.region]);
        got++;
      }
    }
    return cap;
  };
  const cap0 = claim(0, W * 0.36, H * 0.5, 7);
  const cap1 = claim(1, W * 0.7, H * 0.38, 6);
  const cap2 = claim(2, W * 0.5, H * 0.82, 4);
  // Graph distance from our land decides what we have seen.
  const dist = new Map<number, number>();
  const q: R[] = regs.filter((r) => owner.get(r.id) === 0);
  for (const r of q) dist.set(r.id, 0);
  while (q.length) {
    const cur = q.shift()!;
    for (const l of cur.nb) {
      if (dist.has(l.region)) continue;
      dist.set(l.region, dist.get(cur.id)! + 1);
      q.push(regs[l.region]);
    }
  }
  const month = 412;
  const settlements: SettlementKind[] = ['camp', 'village', 'town', 'city', 'metropolis'];
  const lineage = 'River folk';
  const mine = regs.filter((r) => owner.get(r.id) === 0);
  const theirs1 = regs.filter((r) => owner.get(r.id) === 1);
  const occupiedByUs = theirs1.find((r) => r.id !== cap1.id && (dist.get(r.id) ?? 9) <= 2) ?? theirs1[1];
  const occupiedByThem = mine.find((r) => r.id !== cap0.id && r.nb.some((l) => owner.get(l.region) === 1)) ?? mine[mine.length - 1];

  const regions: RegionView[] = [];
  let testNodes = 0;
  for (const r of regs) {
    const d = dist.get(r.id) ?? 99;
    const own = owner.get(r.id);
    let visibility: RegionView['visibility'] | null = null;
    if (own === 0) visibility = 'own';
    else if (d <= 2) visibility = 'visible';
    else if (d === 3) visibility = rand() < 0.75 ? 'remembered' : 'visible';
    else if (d === 4 && rand() < 0.45) visibility = 'remembered';
    else if (own === 1 && rand() < 0.6) visibility = 'remembered';
    if (!visibility) continue;
    const idx = mine.indexOf(r);
    let settlement: SettlementKind = 'wilderness';
    let ownData: OwnRegion | null = null;
    if (own === 0) {
      settlement = r.id === cap0.id ? 'city' : settlements[idx % 4];
      const pop = r.id === cap0.id ? 18400 : [240, 1300, 5200, 800, 90, 2600, 420][idx % 7];
      const facs: FacilityView[] = [fac('fields', 'Fields', 2 + ((idx * 5) % 11)), fac('camp', 'Timber and quarry camps', 2)];
      const extra: [string, string][] = [
        ['workshop', 'Craft workshops'], ['mine_iron', 'Iron mines'], ['school', 'School'], ['laboratory', 'Laboratory'],
        ['waterwheel', 'Water and wind mills'], ['port', 'Harbour'], ['launch_complex', 'Launch complex'], ['jump_base', 'Jump deployment node'],
        ['steelworks', 'Steelworks'],
      ];
      if (r.id === cap0.id) for (const [k, nm] of extra.slice(0, 6)) facs.push(fac(k, nm, 3));
      else {
        const e1 = extra[(idx * 3) % extra.length], e2 = extra[(idx * 3 + 4) % extra.length];
        facs.push(fac(e1[0], e1[1], 2));
        if (idx % 2 === 0) facs.push(fac(e2[0], e2[1], 1));
        if (idx === 2) { facs.push(fac('launch_complex', 'Launch complex', 1)); facs.push(fac('jump_base', 'Jump deployment node', 1)); }
      }
      ownData = {
        population: pop, children: Math.floor(pop * 0.28), working_age: Math.floor(pop * 0.62), elders: Math.floor(pop * 0.1),
        blocks: [{ lineage, religion: null, count: pop }], quals: [], labor: emptyLabor(), facilities: facs,
        food_fulfillment_bp: 9800, water_fulfillment_bp: 10000, water_capacity: 3000, health_pressure_bp: 300, unrest_bp: 200,
        transport_level: 1, link_efficiency_bp: 9000,
        power: { shaft_supply: 0, shaft_demand: 0, elec_supply: 0, elec_demand: 0, compute_supply: 0, compute_demand: 0 },
        occupied_since: null,
      };
    } else if (own != null) {
      const cap = own === 1 ? cap1 : cap2;
      settlement = r.id === cap.id ? (own === 1 ? 'metropolis' : 'city') : settlements[(r.id * 7) % 4];
    }
    const surveyed = own === 0 || (d <= 2 && r.id % 3 !== 0);
    const deposits = [] as NonNullable<RegionView['survey']>['deposits'];
    if (surveyed) {
      const kinds = ['copper_ore', 'iron_ore', 'coal', 'crude', 'minerals'] as const;
      if (r.id % 2 === 0) deposits.push({ kind: kinds[r.id % 5], remaining: 4_000_000, quality_bp: 7000, epistemic: own === 0 ? 'verified' : 'estimated' });
      if (r.id % 5 === 1) deposits.push({ kind: kinds[(r.id + 2) % 5], remaining: 900_000, quality_bp: 5200, epistemic: r.id % 2 ? 'reported' : 'verified' });
      if (r.id % 7 === 3) deposits.push({ kind: kinds[(r.id + 3) % 5], remaining: 2_000_000, quality_bp: 6100, epistemic: 'verified' });
    }
    const isTest = testNodes < 3 && visibility !== 'remembered' && r.id !== cap0.id && r.id % 4 === 1;
    if (isTest) testNodes++;
    let controller: number | null = own ?? null;
    if (r.id === occupiedByUs.id) controller = 0;
    if (r.id === occupiedByThem.id) controller = 1;
    const pop = own != null && own !== 0 ? 600 + ((r.id * 7919) % 9000) : 0;
    regions.push({
      id: r.id, name: r.name,
      poly: r.cell.poly.map((p) => [Math.round(p[0]), Math.round(p[1])] as [number, number]),
      center: [Math.round(r.cell.x), Math.round(r.cell.y)],
      neighbors: r.nb, terrain: r.terrain, coastal: r.coastal, river: r.river, elevation: r.elevation,
      visibility, last_seen: visibility === 'remembered' ? month - 30 - ((r.id * 37) % 200) : month,
      owner: own ?? null, controller, settlement,
      survey: surveyed
        ? { arable: 4 + ((r.id * 11) % 52), pasture: 10 + (r.id % 30), wild_food: 400, fishery: r.coastal ? 10 : 0, forest: 12, water: 600 + ((r.id * 613) % 3600), hydro: 3, deposits, surveyed_month: month - (r.id % 40), detailed: r.id % 4 !== 1 }
        : null,
      own: ownData,
      foreign: own != null && own !== 0 ? { population_low: Math.floor(pop * 0.7), population_high: Math.floor(pop * 1.4), notable: [] } : null,
      test_node: isTest,
    });
  }
  // The capital of seat 1 is very large; exercise the top population class with one region.
  const bigCap = regions.find((r) => r.id === cap1.id);
  if (bigCap?.foreign) { bigCap.foreign.population_low = 180000; bigCap.foreign.population_high = 320000; }

  const known = new Set(regions.map((r) => r.id));
  const border = mine.find((r) => r.id !== cap0.id) ?? cap0;
  const enemyNear = regs.find((r) => owner.get(r.id) === 1 && known.has(r.id) && r.id !== occupiedByUs.id) ?? cap1;
  const army = (id: number, name: string, region: number, s: [number, number, number], over: Partial<ArmyView> = {}): ArmyView => ({
    id, name, region, soldiers: [['assault', s[0]], ['maneuver', s[1]], ['denial', s[2]]], tier: 1, proficiency_bp: 6000, supply_bp: 8000,
    morale_bp: 7000, order: 'hold', target: null, training_months_left: 0, in_battle: false, ...over,
  });
  const armies: ArmyView[] = [
    army(1, 'First Shield', cap0.id, [40, 60, 900]),
    army(2, 'River Riders', cap0.id, [80, 700, 40], { order: 'move', target: border.id }),
    army(3, 'Hammer Column', occupiedByUs.id, [1200, 200, 100], { order: 'attack', target: enemyNear.id, in_battle: true, supply_bp: 3900 }),
    army(4, 'New Levy', border.id, [200, 0, 0], { training_months_left: 2 }),
  ];
  const foreign_armies: ForeignArmyView[] = [
    { owner: 1, region: enemyNear.id, strength_low: 800, strength_high: 1500, tier_estimate: 1, observed_month: month },
    { owner: 1, region: occupiedByThem.id, strength_low: 300, strength_high: 700, tier_estimate: null, observed_month: month - 3 },
    { owner: 2, region: (regions.find((r) => r.owner === 2) ?? regions[0]).id, strength_low: 200, strength_high: 900, tier_estimate: null, observed_month: month - 40 },
  ];
  const other = (seat: number, name: string, color: string): ForeignCiv => ({
    seat, name, adjective: name, color, controller: 'native_medium', status: 'active', contacted: true, contact_month: 40,
    at_war: seat === 1, overlord: null, population_low: 20000, population_high: 60000, regions_known: 4,
    military_estimate: 'Comparable', observed_tier: 1, trust: 50, notes: [],
  });
  const facilities: FacilityType[] = [
    facType('fields', 'Fields', 'Food'), facType('camp', 'Timber and quarry camps', 'Extraction'), facType('workshop', 'Craft workshops', 'Industry'),
    facType('mine_iron', 'Iron mines', 'Extraction'), facType('school', 'School', 'Education'), facType('laboratory', 'Laboratory', 'Research'),
    facType('waterwheel', 'Water and wind mills', 'Power'), facType('port', 'Harbour', 'Transport'), facType('launch_complex', 'Launch complex', 'Space'),
    facType('jump_base', 'Jump deployment node', 'Jump engineering'), facType('steelworks', 'Steelworks', 'Industry'),
  ];
  return {
    protocol_version: 'bts-protocol/1.0', match_id: 'fixture-' + seed, seat: 0, month, round: Math.floor(month / 12) + 1, months_per_round: 12,
    horizon: 2880, phase: 'plan', window: 0, ready: false, status: 'active', outcome: null,
    civ: {
      name: 'Longstrand', adjective: 'Longstrander', color: '#c1503a', capital: cap0.id, population: 30000, children: 8000, working_age: 19000,
      elders: 3000, births_last_round: 0, deaths_last_round: 0, migration_last_round: 0, goods: [], quals: [], labor: emptyLabor(), research: [],
      policies: { food_reserve_months: 4, labor_weights: [], mobilization_bp: 10000 }, factions: [], mobilization_cap_bp: 2200, stability: 70,
      admin_capacity: 9, admin_load: 7, food_fulfillment_bp: 10000, water_fulfillment_bp: 10000, military_tier: 1, overlord: null, subordinates: [],
    },
    regions, world: { width: W, height: H, region_count: want },
    others: [other(1, 'Riverland', '#2f73a0'), other(2, 'Clearbay', '#5c8a36')],
    knowledge: { techs: [], leads: [], domains: [], scientific_method: false },
    culture: { practices: [], lineages: [], religions: [], movement: null },
    catalog: { facilities, courses: [], unit_tiers: [] },
    projects: [], programs: [], armies, foreign_armies,
    diplomacy: { channels: [], messages: [], offers: [], treaties: [], wars: [1] },
    objectives: { agendas: [], milestones: [], victory: null },
    briefing: [], chronicle: [], receipts: [],
  };
}
