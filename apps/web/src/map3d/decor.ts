// Per-region dressing: the settlement, the districts and improvements that the
// observation actually reports for the region, local tracks and power lines, and
// the sites where resource badges and beacons stand. Nothing here is invented:
// a region with no reported facilities gets its settlement and nothing else.
import type { Deposit, RegionView, SettlementKind } from '../protocol';
import { eraOfFacilities, facilityActive, type Building } from '../map/landuse';
import { Builder } from './builder';
import {
  buildDistrict, buildSettlement, districtRadius, pylon, settlementHeight, settlementRadius,
  type DistrictKind, type Fx, type Ground,
} from './models';
import { heightAt, riverDistAt, slopeAt, type Heightfield, type RiverPath } from './terrain';
import { regionIndexAt, sampleField, type Topology, type TRegion } from './topology';
import { clamp, hash32, rng, type RGB } from './util';
import type * as THREE from 'three';

const KIND_MAP: Record<string, DistrictKind> = {
  fields: 'fields', irrigation: 'fields', pasture: 'pasture', fishery: 'fishery', granary: 'granary', camp: 'timber',
  mine_copper: 'mine', mine_iron: 'mine', mine_coal: 'mine', mine_tin: 'mine', mine_precious: 'mine', mine_bauxite: 'mine', mine_uranium: 'mine', mine_rare_earths: 'mine', mine_cobalt_nickel: 'mine', mine_quartz: 'mine', nitre_works: 'mine', salt_works: 'mine', oilwell: 'oilwell', gas_well: 'oilwell',
  workshop: 'workshop', kiln: 'workshop', press: 'workshop', instrument_shop: 'workshop',
  copper_smelter: 'industry', bloomery: 'industry', steelworks: 'industry', machine_shop: 'industry', parts_works: 'industry',
  wire_works: 'industry', insulation_works: 'industry',
  chem_plant: 'chemical', refinery: 'chemical', synfuel: 'chemical', pharma: 'chemical',
  purifier: 'hightech', fab: 'hightech', computer_works: 'hightech', datacenter: 'hightech',
  waterwheel: 'mill', steam: 'thermal', diesel: 'thermal', generator: 'thermal', hydro: 'hydro', grid: 'grid',
  fission: 'nuclear', fusion: 'fusion', orbital_power: 'rectenna',
  port: 'port', depot: 'depot', waterworks: 'waterworks', sewers: 'waterworks', water_treatment: 'waterworks',
  clinic: 'health', hospital: 'health', admin: 'admin', barracks: 'barracks', holy_site: 'holy',
  lodge: 'school', school: 'school', college: 'school', tech_institute: 'school',
  makers_circle: 'research', archive: 'research', laboratory: 'research', institute: 'research', advanced_lab: 'research',
  auto_lab: 'research', high_energy: 'collider',
  launch_complex: 'launch', orbital_station: 'dishes', orbital_yard: 'dishes', interferometer: 'dishes',
  jump_testbed: 'jump', jump_yard: 'jump', jump_base: 'jump',
};
const CATEGORY_MAP: Record<string, DistrictKind> = {
  food: 'fields', extraction: 'timber', industry: 'workshop', power: 'thermal', transport: 'depot', civic: 'admin',
  education: 'school', research: 'research', space: 'dishes', 'jump engineering': 'jump',
};
const MINE_DEPOSIT: Record<string, Deposit> = {
  mine_copper: 'copper_ore', mine_iron: 'iron_ore', mine_coal: 'coal', oilwell: 'crude', mine_tin: 'tin', mine_precious: 'precious', mine_bauxite: 'bauxite', mine_uranium: 'uranium_ore',
  mine_rare_earths: 'rare_earths', mine_cobalt_nickel: 'cobalt_nickel', mine_quartz: 'quartz', nitre_works: 'saltpetre',
  salt_works: 'salt', brine_works: 'lithium', gas_well: 'gas',
};
export { eraOfFacilities };

interface Want {
  key: string;
  kind: DistrictKind;
  level: number;
  active: boolean;
  deposit?: Deposit;
}

const ORDER: DistrictKind[] = [
  'port', 'fishery', 'hydro', 'mill', 'mine', 'oilwell', 'admin', 'holy', 'school', 'research', 'health', 'granary', 'workshop',
  'barracks', 'industry', 'thermal', 'chemical', 'hightech', 'depot', 'waterworks', 'timber', 'grid', 'nuclear', 'fusion',
  'launch', 'jump', 'collider', 'dishes', 'rectenna', 'pasture', 'fields',
];
const NEAR = new Set<DistrictKind>(['admin', 'holy', 'school', 'research', 'health', 'granary', 'workshop', 'waterworks']);
const FAR = new Set<DistrictKind>(['mine', 'oilwell', 'timber', 'launch', 'jump', 'collider', 'rectenna', 'nuclear', 'fusion', 'dishes']);

export interface BadgeSite { kind: Deposit; x: number; y: number; z: number }

export interface RegionDecor {
  id: number;
  geometry: THREE.BufferGeometry | null;
  /** Circles x, z, r that vegetation must keep clear. */
  clear: number[];
  /** Smoke emitters x, y, z, size. */
  smoke: number[];
  badges: BadgeSite[];
  /** Height above the ground at the centre where the label hangs. */
  labelLift: number;
  beacon: [number, number, number] | null;
  /** District centres (for pylons and the supply traffic layer). */
  hubs: { kind: DistrictKind; x: number; z: number }[];
  placed: number;
  wanted: number;
}

export interface DecorContext {
  topo: Topology;
  hf: Heightfield;
  rivers: RiverPath[];
  seatColor(seat: number | null): RGB;
  capital: number | null;
  civEra: number;
  categories: Record<string, string>;
  /** Region → building work in hand, as the viewer knows it. */
  building?: Record<number, Building>;
}

/** Work in hand: a scaffolded shell and a jib crane, larger with more levels queued. */
function scaffold(b: Builder, x: number, y: number, z: number, k: number, rot: number): void {
  const wood: RGB = [0.74, 0.58, 0.32], amber: RGB = [0.88, 0.62, 0.16];
  b.push(x, y, z, rot, k);
  b.box(0, 0, 0, 3.4, 1.5, 2.6, [0.91, 0.88, 0.79]);
  for (const [px, pz] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) b.beam([px, 0, pz], [px, 4.8, pz], 0.16, wood);
  for (const yy of [1.7, 3.2, 4.8]) {
    b.beam([-2, yy, -1.6], [2, yy, -1.6], 0.12, wood);
    b.beam([-2, yy, 1.6], [2, yy, 1.6], 0.12, wood);
    b.beam([-2, yy, -1.6], [-2, yy, 1.6], 0.12, wood);
    b.beam([2, yy, -1.6], [2, yy, 1.6], 0.12, wood);
  }
  b.beam([3.4, 0, 0], [3.4, 7.4, 0], 0.24, amber);
  b.beam([1.2, 7, 0], [6.6, 7.4, 0], 0.2, amber);
  b.beam([5.9, 7.3, 0], [5.9, 5, 0], 0.07, [0.2, 0.2, 0.22]);
  b.box(5.9, 4.3, 0, 0.9, 0.7, 0.9, amber);
  b.pop();
}

export function settlementEra(r: RegionView, civEra: number): number {
  if (r.own) return Math.max(eraOfFacilities(r.own.facilities), civEra - 2, 0);
  // Foreign and unclaimed settlements: a neutral style by size; their buildings are not known.
  return r.settlement === 'camp' || r.settlement === 'village' ? 0 : 1;
}

export function buildRegionDecor(p: TRegion, ctx: DecorContext): RegionDecor {
  const { topo, hf } = ctx;
  const f = topo.fields;
  const r = p.r;
  const G: Ground = (x, z) => heightAt(hf, x, z);
  const b = new Builder();
  const remembered = r.visibility === 'remembered';
  if (remembered) b.fade = 0.82;
  const fx: Fx = { smoke: [] };
  const out: RegionDecor = {
    id: r.id, geometry: null, clear: [], smoke: fx.smoke, badges: [], labelLift: 4, beacon: null, hubs: [], placed: 0, wanted: 0,
  };
  // A megalopolis is modelled as the largest skyline the kit has.
  const kind: SettlementKind = r.settlement === 'megalopolis' ? 'metropolis' : r.settlement;
  const era = settlementEra(r, ctx.civEra);
  const color = ctx.seatColor(r.owner);
  const settR = settlementRadius(kind);
  const isCapital = ctx.capital === r.id;
  if (kind !== 'wilderness') {
    buildSettlement(b, G, p.sx, p.sy, { kind, era, color, capital: isCapital, seed: hash32(r.id * 97 + 3, 0xc17), remembered }, fx);
    out.clear.push(p.sx, p.sy, settR + 2);
    out.labelLift = settlementHeight(kind, era, isCapital) + 4;
  }

  // --- candidate sites ----------------------------------------------------------------
  interface Site { x: number; z: number; d: number; sd: number; dCoast: number; river: number; slope: number; ang: number }
  const sites: Site[] = [];
  const maxR = Math.min(95, Math.hypot(p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]) / 2);
  const rand = rng(hash32(r.id * 211 + 17, 0xd15));
  for (let rr = settR + 3.5; rr <= maxR; rr += 4.2) {
    const n = Math.max(8, Math.round((rr * Math.PI * 2) / 4.6));
    const off = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const x = p.sx + Math.cos(a) * rr, z = p.sy + Math.sin(a) * rr;
      if (regionIndexAt(f, x, z) !== p.idx) continue;
      const sd = sampleField(f, f.sd, x, z);
      if (sd < 2.5) continue;
      if (sampleField(f, f.dUnk, x, z) < 18) continue;
      sites.push({ x, z, d: rr, sd, dCoast: sampleField(f, f.dCoast, x, z), river: riverDistAt(hf, x, z), slope: slopeAt(hf, x, z), ang: a });
    }
  }
  const taken: number[] = [p.sx, p.sy, settR + 1.2];
  const free = (x: number, z: number, rad: number): boolean => {
    for (let i = 0; i < taken.length; i += 3) {
      const dx = x - taken[i], dz = z - taken[i + 1], rr = rad + taken[i + 2] + 0.6;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  };
  const inRegion = (x: number, z: number, rad: number): boolean => {
    const k = rad * 0.85;
    return regionIndexAt(f, x + k, z) === p.idx && regionIndexAt(f, x - k, z) === p.idx &&
      regionIndexAt(f, x, z + k) === p.idx && regionIndexAt(f, x, z - k) === p.idx;
  };
  const angDist = (a: number, b2: number): number => {
    let d = Math.abs(a - b2) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  };
  type Mode = 'land' | 'coast' | 'bank';
  const choose = (key: string, rad: number, prefDist: number, mode: Mode, maxSlope: number): Site | null => {
    const prefAng = (hash32(r.id * 131 + 5, hash32(key.length * 7 + key.charCodeAt(0) * 31 + key.charCodeAt(key.length - 1), 0x5eed)) / 4294967296) * Math.PI * 2;
    let best: Site | null = null;
    let bc = Infinity;
    for (const s of sites) {
      let cost = Math.abs(s.d - prefDist) + angDist(s.ang, prefAng) * 6;
      if (mode === 'coast') {
        if (s.dCoast > 13 || s.sd > 11 || s.sd < 3.2) continue;
        cost = s.d * 0.25 + Math.abs(s.sd - 5) * 2 + angDist(s.ang, prefAng) * 2;
      } else if (mode === 'bank') {
        if (s.river > 11 || s.river < 6.6) continue;
        cost = s.d * 0.3 + angDist(s.ang, prefAng) * 2;
      } else {
        if (s.sd < rad * 0.75 + 1.5) continue;
        if (s.river < rad + 6.5) continue;
      }
      if (s.slope > maxSlope) continue;
      if (cost >= bc) continue;
      if (!free(s.x, s.z, rad) || (mode === 'land' && !inRegion(s.x, s.z, rad))) continue;
      best = s; bc = cost;
    }
    return best;
  };
  const seaward = (x: number, z: number): number => {
    const e = 3;
    const gx = sampleField(f, f.sd, x + e, z) - sampleField(f, f.sd, x - e, z);
    const gz = sampleField(f, f.sd, x, z + e) - sampleField(f, f.sd, x, z - e);
    return Math.atan2(-gx, -gz);
  };
  const toRiver = (x: number, z: number): number => {
    let bx = 0, bz = 0, bd = Infinity;
    for (const rv of ctx.rivers) {
      for (let i = 0; i < rv.pts.length; i += 2) {
        const d = (rv.pts[i] - x) ** 2 + (rv.pts[i + 1] - z) ** 2;
        if (d < bd) { bd = d; bx = rv.pts[i]; bz = rv.pts[i + 1]; }
      }
    }
    return Math.atan2(bx - x, bz - z);
  };

  // --- districts from the reported facilities ------------------------------------------
  const wants = new Map<string, Want>();
  let hasRoads = false;
  if (r.own && !remembered) {
    for (const fac of r.own.facilities) {
      if (fac.level <= 0) continue;
      if (fac.kind === 'roads' || fac.kind === 'rail') { hasRoads = true; continue; }
      const dk = KIND_MAP[fac.kind] ?? CATEGORY_MAP[(ctx.categories[fac.kind] ?? '').toLowerCase()];
      if (!dk) continue;
      const dep = MINE_DEPOSIT[fac.kind];
      const key = dk === 'mine' ? 'mine:' + dep : dk;
      const w = wants.get(key);
      const act = facilityActive(fac);
      if (w) { w.level += fac.level; w.active = w.active || act; }
      else wants.set(key, { key, kind: dk, level: fac.level, active: act, deposit: dep });
    }
  }
  const list = [...wants.values()].sort((a, b2) => ORDER.indexOf(a.kind) - ORDER.indexOf(b2.kind) || a.key.localeCompare(b2.key));
  const mineAt = new Map<Deposit, [number, number]>();
  const tracks: number[][] = [];
  const hasCoast = sites.some((s) => s.dCoast < 13 && s.sd < 11);
  const hasRiver = sites.some((s) => s.river < 11);
  for (const w of list) {
    const size = clamp(1 + Math.floor(Math.log2(1 + w.level)), 1, 6);
    const clusters = w.kind === 'fields' ? (w.level > 18 ? 3 : w.level > 6 ? 2 : 1) : w.kind === 'pasture' && w.level > 20 ? 2 : 1;
    for (let c = 0; c < clusters; c++) {
      out.wanted++;
      const dsize = w.kind === 'fields' ? clamp(size - c, 1, 5) : size;
      const rad = districtRadius(w.kind, dsize);
      let mode: Mode = 'land';
      if ((w.kind === 'port' || w.kind === 'fishery') && hasCoast) mode = 'coast';
      else if ((w.kind === 'mill' || w.kind === 'fishery') && hasRiver) mode = 'bank';
      const pref = NEAR.has(w.kind) ? settR + rad + 1.5 : FAR.has(w.kind) ? settR + 26 : w.kind === 'fields' || w.kind === 'pasture' ? settR + 15 + c * 9 : settR + 13;
      const key = w.key + ':' + c;
      let site: Site | null = null;
      let rot = (hash32(r.id * 17 + c, key.length * 13 + key.charCodeAt(0)) / 4294967296) * Math.PI * 2;
      let onRiver = false;
      if (w.kind === 'hydro') {
        // A dam belongs on the channel itself: pick a river point inside this region.
        let bx = 0, bz = 0, bdx = 0, bdz = 1, found = false, bestD = Infinity;
        for (const rv of ctx.rivers) {
          for (let i = 8; i + 9 < rv.pts.length; i += 2) {
            const x = rv.pts[i], z = rv.pts[i + 1];
            if (regionIndexAt(f, x, z) !== p.idx) continue;
            const d = Math.abs(Math.hypot(x - p.sx, z - p.sy) - (settR + 16));
            if (d < bestD && free(x, z, 5) && sampleField(f, f.sd, x, z) > 10) {
              bestD = d; bx = x; bz = z; bdx = rv.pts[i + 2] - rv.pts[i - 2]; bdz = rv.pts[i + 3] - rv.pts[i - 1]; found = true;
            }
          }
        }
        if (found) {
          site = { x: bx, z: bz, d: 0, sd: 20, dCoast: 99, river: 0, slope: 0, ang: 0 };
          rot = Math.atan2(bdx, bdz);
          onRiver = true;
        } else site = choose(key, rad, pref, 'land', 0.5);
      } else {
        site = choose(key, rad, pref, mode, w.kind === 'mine' || w.kind === 'timber' ? 0.85 : mode === 'land' ? 0.42 : 0.9);
        if (!site && mode !== 'land') { mode = 'land'; site = choose(key, rad, pref, 'land', 0.42); }
        if (!site && rad > 5.5) site = choose(key, rad * 0.8, pref, mode, 0.6);
      }
      if (!site) continue;
      if (mode === 'coast') rot = seaward(site.x, site.z);
      else if (mode === 'bank') { rot = toRiver(site.x, site.z); onRiver = true; }
      taken.push(site.x, site.z, rad);
      out.clear.push(site.x, site.z, rad + (w.kind === 'fields' ? 1.5 : 0.5));
      out.hubs.push({ kind: w.kind, x: site.x, z: site.z });
      out.placed++;
      if (w.kind === 'mine' || w.kind === 'oilwell') if (w.deposit) mineAt.set(w.deposit, [site.x, site.z]);
      buildDistrict(b, G, site.x, site.z, {
        kind: w.kind, size: dsize, era: Math.max(era, w.kind === 'fields' || w.kind === 'pasture' ? 0 : 0), color, seed: hash32(r.id * 59 + c, key.length + key.charCodeAt(0) * 7),
        rot, deposit: w.deposit, onRiver, active: w.active,
      }, fx);
      if (hasRoads && w.kind !== 'hydro') tracks.push([site.x, site.z, rad]);
    }
  }

  // --- building work in hand ------------------------------------------------------------
  const work = ctx.building?.[r.id];
  if (work && work.levels > 0 && !remembered) {
    const site = choose('scaffold', 3.6, settR + 5, 'land', 0.6);
    if (site) {
      taken.push(site.x, site.z, 3.6);
      out.clear.push(site.x, site.z, 4);
      scaffold(b, site.x, G(site.x, site.z), site.z, clamp(1 + work.levels / 5, 1, 2), (hash32(r.id, 77) / 4294967296) * Math.PI * 2);
    }
  }

  // --- local tracks to each district (only where roads have been built) -----------------
  if (tracks.length) {
    const dirt: RGB = era >= 3 ? [0.5, 0.5, 0.5] : [0.8, 0.7, 0.5];
    for (const [tx, tz, rad] of tracks) {
      const dx = tx - p.sx, dz = tz - p.sy;
      const l = Math.hypot(dx, dz) || 1;
      const x0 = p.sx + (dx / l) * (settR * 0.9), z0 = p.sy + (dz / l) * (settR * 0.9);
      const x1 = tx - (dx / l) * rad * 0.7, z1 = tz - (dz / l) * rad * 0.7;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 2) continue;
      const steps = Math.max(1, Math.round(len / 3));
      const nx = -dz / l, nz = dx / l;
      const bend = Math.sin((hash32(r.id, Math.round(tx * 7 + tz)) / 4294967296) * 6.28) * Math.min(4, len * 0.12);
      let prev: number[][] | null = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const off = Math.sin(t * Math.PI) * bend;
        const x = x0 + (x1 - x0) * t + nx * off, z = z0 + (z1 - z0) * t + nz * off;
        const a = [x + nx * 0.55, G(x + nx * 0.55, z + nz * 0.55) + 0.17, z + nz * 0.55];
        const c = [x - nx * 0.55, G(x - nx * 0.55, z - nz * 0.55) + 0.17, z - nz * 0.55];
        if (prev) b.quad(prev[0], a, c, prev[1], dirt);
        prev = [a, c];
      }
    }
  }
  // --- power lines from generating sites to the settlement (only where a grid exists) ----
  if (wants.has('grid')) {
    const gridHub = out.hubs.find((h) => h.kind === 'grid');
    const sources = out.hubs.filter((h) => h.kind === 'thermal' || h.kind === 'hydro' || h.kind === 'nuclear' || h.kind === 'fusion' || h.kind === 'rectenna');
    if (gridHub) {
      const lines: [number, number, number, number][] = [[gridHub.x, gridHub.z, p.sx, p.sy]];
      for (const s of sources.slice(0, 4)) lines.push([s.x, s.z, gridHub.x, gridHub.z]);
      for (const [ax, az, bx, bz] of lines) {
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.floor(len / 10);
        const rot = Math.atan2(-(bz - az), bx - ax) + Math.PI / 2;
        let prev: number[] | null = null;
        for (let i = 1; i <= n; i++) {
          const t = i / (n + 1);
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (!free(x, z, 0.5)) { prev = null; continue; }
          const y = G(x, z);
          pylon(b, x, y, z, rot, 5.6);
          if (prev) {
            b.beam([prev[0], prev[1] + 3.9, prev[2]], [x, y + 3.9, z], 0.07, [0.25, 0.26, 0.3]);
          }
          prev = [x, y, z];
          out.clear.push(x, z, 1.6);
        }
      }
    }
  }

  // --- resource badge sites ------------------------------------------------------------------
  if (r.survey) {
    let i = 0;
    for (const d of r.survey.deposits.slice(0, 5)) {
      const at = mineAt.get(d.kind);
      if (at) {
        out.badges.push({ kind: d.kind, x: at[0], y: G(at[0], at[1]) + 9.5, z: at[1] });
      } else {
        const s = choose('dep:' + d.kind, 6, settR + 17 + i * 5, 'land', 2) ?? choose('dep:' + d.kind, 3.2, settR + 12 + i * 4, 'land', 2);
        const x = s ? s.x : p.sx + (i - 1) * 8, z = s ? s.z : p.sy + settR + 6;
        if (s) taken.push(s.x, s.z, 6);
        out.clear.push(x, z, 2.6);
        out.badges.push({ kind: d.kind, x, y: G(x, z) + 1.2, z });
      }
      i++;
    }
  }
  if (r.test_node) {
    const s = choose('beacon', 5, settR + 14, 'land', 1.2);
    const x = s ? s.x : p.sx + settR + 6, z = s ? s.z : p.sy - settR - 6;
    if (s) taken.push(s.x, s.z, 5);
    out.clear.push(x, z, 5);
    out.beacon = [x, Math.max(0.3, G(x, z)), z];
    // Beacon base: a low dais with four leaning pylons.
    const gold: RGB = [0.95, 0.76, 0.26];
    b.push(x, out.beacon[1], z);
    b.cyl(0, 0, 0, 3.6, 3.3, 0.5, 8, [0.9, 0.88, 0.8]);
    b.cyl(0, 0.5, 0, 2.2, 2.0, 0.4, 8, gold);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.beam([Math.cos(a) * 3.1, 0.4, Math.sin(a) * 3.1], [Math.cos(a) * 1.5, 5.4, Math.sin(a) * 1.5], 0.3, [0.96, 0.96, 0.98]);
      b.cyl(Math.cos(a) * 1.5, 5.3, Math.sin(a) * 1.5, 0.3, 0, 0.8, 4, gold);
    }
    b.pop();
  }
  if (b.triangles > 0) out.geometry = b.build();
  return out;
}

/** A cheap signature of everything `buildRegionDecor` reads from a region. */
export function decorSignature(r: RegionView, capital: number | null, civEra: number, colour: string, building = 0): string {
  let s = `${r.settlement}|${r.owner}|${r.visibility}|${capital === r.id ? 1 : 0}|${civEra}|${colour}|${r.test_node ? 1 : 0}|${Math.min(6, Math.ceil(building / 2))}`;
  if (r.own) for (const f of r.own.facilities) s += `;${f.kind}:${f.level}:${f.enabled ? (f.utilization_bp > 0 && (f.staff_needed <= 0 || f.staffed > 0) ? 'a' : 'i') : 'x'}`;
  if (r.survey) for (const d of r.survey.deposits) s += `;d${d.kind}`;
  return s;
}
