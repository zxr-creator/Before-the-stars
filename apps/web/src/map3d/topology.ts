// Region topology for the 3D map: shared, organically wobbled borders, edge
// classification (certain coast versus edge of knowledge), territory outlines,
// river courses, and raster fields (region ids and distance fields) that the
// heightfield, the shaders and picking all read from.
//
// Only regions present in the observation exist here. An outer edge is "coast"
// only when the observation makes that certain; otherwise it is "unknown" and the
// renderer fades the land into blank parchment there instead of drawing a shore.
import type { RegionView } from '../protocol';
import { clamp, distanceTransform, hash32, pointInPoly, rng } from './util';

export type EdgeKind = 'internal' | 'coast' | 'unknown';

export interface TEdge {
  key: string;
  /** Wobbled polyline from the canonical first endpoint to the second, flattened x,y. */
  pts: number[];
  regions: number[];
  frame: boolean;
  kind: EdgeKind;
  mx: number;
  my: number;
  len: number;
}

export interface TRegion {
  r: RegionView;
  idx: number;
  edges: { e: TEdge; rev: boolean }[];
  /** Closed outline (first point not repeated), flattened x,y. */
  outline: number[];
  bbox: [number, number, number, number];
  cx: number;
  cy: number;
  /** Distance from the centre to the nearest outline point. */
  inradius: number;
  area: number;
  /** River junction point for this region (offset from the centre so towns sit on a bank). */
  rx: number;
  ry: number;
}

export interface RiverCourse {
  /** Region id at the start of `pts`, and at the end (-1 = the sea). */
  a: number;
  b: number;
  pts: number[];
}
export interface SeaLane { ax: number; ay: number; bx: number; by: number; cx: number; cy: number }
export interface PassMark { x: number; y: number; ux: number; uy: number }

export interface Chain {
  key: number;
  pts: number[];
  closed: boolean;
  /** +1 when the territory lies to the left of the direction of travel, -1 when to the right. */
  side: 1 | -1;
}

export interface Fields {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  /** Region index per cell, or -1. */
  id: Int16Array;
  /** Signed distance to the edge of known land in world units; positive inside. */
  sd: Float32Array;
  dCoast: Float32Array;
  dUnk: Float32Array;
}

export interface Topology {
  width: number;
  height: number;
  regions: TRegion[];
  byId: Map<number, TRegion>;
  edges: TEdge[];
  rivers: RiverCourse[];
  seaLanes: SeaLane[];
  passes: PassMark[];
  fields: Fields;
  /** Bounding box of known land. */
  bbox: [number, number, number, number];
}

export const FIELD_CELL = 2;
export const FIELD_MARGIN = 200;

/** Midpoint-displacement wobble; deterministic for a given seed. Returns flattened points a..b inclusive. */
function wobble(ax: number, ay: number, bx: number, by: number, seed: number, rough: number): number[] {
  const rand = rng(seed);
  let pts: number[] = [ax, ay, bx, by];
  const len = Math.hypot(bx - ax, by - ay);
  const depth = len > 130 ? 4 : len > 56 ? 3 : len > 22 ? 2 : len > 9 ? 1 : 0;
  let amp = rough;
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
      const sl = Math.hypot(x1 - x0, y1 - y0) || 1;
      const off = (rand() - 0.5) * 2 * amp * sl;
      next.push(x0, y0, (x0 + x1) / 2 + (-(y1 - y0) / sl) * off, (y0 + y1) / 2 + ((x1 - x0) / sl) * off);
    }
    next.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = next;
    amp *= 0.9;
  }
  return pts;
}

/** Chaikin corner cutting that keeps both end points fixed. */
export function chaikin(pts: number[], passes = 1): number[] {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const n = cur.length / 2;
    if (n < 3) return cur;
    const out: number[] = [cur[0], cur[1]];
    for (let i = 0; i < n - 1; i++) {
      const x0 = cur[i * 2], y0 = cur[i * 2 + 1], x1 = cur[i * 2 + 2], y1 = cur[i * 2 + 3];
      if (i > 0) out.push(x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25);
      if (i < n - 2) out.push(x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75);
    }
    out.push(cur[cur.length - 2], cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/** Resample a polyline at roughly `step` spacing (keeps the end points). */
export function resample(pts: number[], step: number, closed = false): number[] {
  const src = closed ? pts.concat([pts[0], pts[1]]) : pts;
  const out: number[] = [src[0], src[1]];
  let carry = 0;
  for (let i = 0; i + 3 < src.length; i += 2) {
    const x0 = src[i], y0 = src[i + 1], x1 = src[i + 2], y1 = src[i + 3];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l < 1e-6) continue;
    let d = step - carry;
    while (d < l) {
      out.push(x0 + ((x1 - x0) * d) / l, y0 + ((y1 - y0) * d) / l);
      d += step;
    }
    carry = l - (d - step);
  }
  const lx = src[src.length - 2], ly = src[src.length - 1];
  if (closed) {
    // Drop a final point that nearly coincides with the start.
    if (out.length >= 4 && Math.hypot(out[out.length - 2] - out[0], out[out.length - 1] - out[1]) < step * 0.4) out.length -= 2;
  } else if (Math.hypot(out[out.length - 2] - lx, out[out.length - 1] - ly) > step * 0.3) out.push(lx, ly);
  else { out[out.length - 2] = lx; out[out.length - 1] = ly; }
  return out;
}

function rasterizeIds(regions: TRegion[], f: Fields): void {
  const { x0, z0, cell, nx, nz, id } = f;
  id.fill(-1);
  const xs: number[] = [];
  for (const p of regions) {
    const o = p.outline;
    const j0 = clamp(Math.floor((p.bbox[1] - z0) / cell), 0, nz - 1);
    const j1 = clamp(Math.ceil((p.bbox[3] - z0) / cell), 0, nz - 1);
    for (let j = j0; j <= j1; j++) {
      const y = z0 + (j + 0.5) * cell;
      xs.length = 0;
      for (let i = 0, k = o.length - 2; i < o.length; k = i, i += 2) {
        const ya = o[k + 1], yb = o[i + 1];
        if ((ya > y) !== (yb > y)) xs.push(o[k] + ((y - ya) / (yb - ya)) * (o[i] - o[k]));
      }
      xs.sort((a, b) => a - b);
      for (let s = 0; s + 1 < xs.length; s += 2) {
        const i0 = clamp(Math.ceil((xs[s] - x0) / cell - 0.5), 0, nx - 1);
        const i1 = clamp(Math.floor((xs[s + 1] - x0) / cell - 0.5), 0, nx - 1);
        const row = j * nx;
        for (let i = i0; i <= i1; i++) id[row + i] = p.idx;
      }
    }
  }
}

function seedPolyline(seed: Uint8Array, f: Fields, pts: number[]): void {
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (f.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
      const ci = Math.floor((x - f.x0) / f.cell), cj = Math.floor((y - f.z0) / f.cell);
      if (ci >= 0 && cj >= 0 && ci < f.nx && cj < f.nz) seed[cj * f.nx + ci] = 1;
    }
  }
}

function buildFields(regions: TRegion[], edges: TEdge[], W: number, H: number): Fields {
  const cell = FIELD_CELL;
  const nx = Math.ceil((W + FIELD_MARGIN * 2) / cell), nz = Math.ceil((H + FIELD_MARGIN * 2) / cell);
  const f: Fields = {
    x0: -FIELD_MARGIN, z0: -FIELD_MARGIN, cell, nx, nz,
    id: new Int16Array(nx * nz), sd: new Float32Array(nx * nz), dCoast: new Float32Array(0), dUnk: new Float32Array(0),
  };
  rasterizeIds(regions, f);
  const n = nx * nz;
  const land = new Uint8Array(n), sea = new Uint8Array(n);
  let anyLand = false;
  for (let i = 0; i < n; i++) {
    if (f.id[i] >= 0) { land[i] = 1; anyLand = true; } else sea[i] = 1;
  }
  const inside = distanceTransform(sea, nx, nz);
  const outside = anyLand ? distanceTransform(land, nx, nz) : new Float32Array(n).fill(1e6);
  for (let i = 0; i < n; i++) f.sd[i] = (land[i] ? inside[i] - 0.5 : -(outside[i] - 0.5)) * cell;
  const coastSeed = new Uint8Array(n), unkSeed = new Uint8Array(n);
  let anyCoast = false, anyUnk = false;
  for (const e of edges) {
    if (e.kind === 'coast') { seedPolyline(coastSeed, f, e.pts); anyCoast = true; }
    else if (e.kind === 'unknown') { seedPolyline(unkSeed, f, e.pts); anyUnk = true; }
  }
  const far = new Float32Array(n).fill(1e6);
  f.dCoast = anyCoast ? distanceTransform(coastSeed, nx, nz) : far;
  f.dUnk = anyUnk ? distanceTransform(unkSeed, nx, nz) : far.slice();
  if (anyCoast) for (let i = 0; i < n; i++) f.dCoast[i] *= cell;
  if (anyUnk) for (let i = 0; i < n; i++) f.dUnk[i] *= cell;
  return f;
}

/** Bilinear sample of a field array at world (x, z). */
export function sampleField(f: Fields, a: Float32Array, x: number, z: number): number {
  const gx = clamp((x - f.x0) / f.cell - 0.5, 0, f.nx - 1.001), gz = clamp((z - f.z0) / f.cell - 0.5, 0, f.nz - 1.001);
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const i = iz * f.nx + ix;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fz) + (a[i + f.nx] * (1 - fx) + a[i + f.nx + 1] * fx) * fz;
}

/** Region index at world (x, z), or -1. */
export function regionIndexAt(f: Fields, x: number, z: number): number {
  const ix = Math.floor((x - f.x0) / f.cell), iz = Math.floor((z - f.z0) / f.cell);
  if (ix < 0 || iz < 0 || ix >= f.nx || iz >= f.nz) return -1;
  return f.id[iz * f.nx + ix];
}

export function buildTopology(list: RegionView[], W: number, H: number): Topology {
  const snap = new Map<string, [number, number]>();
  const canon = (x: number, y: number): [number, number] => {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const hit = snap.get(`${x + dx},${y + dy}`);
        if (hit) return hit;
      }
    }
    const v: [number, number] = [x, y];
    snap.set(`${x},${y}`, v);
    return v;
  };
  const edgeMap = new Map<string, TEdge>();
  const regions: TRegion[] = [];
  const present = new Set<number>();
  for (const r of list) present.add(r.id);

  list.forEach((r, idx) => {
    const verts: [number, number][] = [];
    for (const pt of r.poly) {
      const v = canon(Math.round(pt[0]), Math.round(pt[1]));
      if (!verts.length || verts[verts.length - 1] !== v) verts.push(v);
    }
    if (verts.length > 1 && verts[0] === verts[verts.length - 1]) verts.pop();
    const p: TRegion = {
      r, idx, edges: [], outline: [], bbox: [Infinity, Infinity, -Infinity, -Infinity],
      cx: r.center[0], cy: r.center[1], inradius: 0, area: 0, rx: r.center[0], ry: r.center[1],
    };
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const fwd = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
      const p0 = fwd ? a : b, p1 = fwd ? b : a;
      const key = `${p0[0]},${p0[1]}|${p1[0]},${p1[1]}`;
      let e = edgeMap.get(key);
      if (!e) {
        const frame =
          (p0[0] <= 1 && p1[0] <= 1) || (p0[0] >= W - 1 && p1[0] >= W - 1) ||
          (p0[1] <= 1 && p1[1] <= 1) || (p0[1] >= H - 1 && p1[1] >= H - 1);
        const seed = hash32(p0[0] * 4099 + p0[1], p1[0] * 4099 + p1[1]);
        let pts = wobble(p0[0], p0[1], p1[0], p1[1], seed, frame ? 0.05 : 0.1);
        if (frame) {
          // The world sheet ends here: fold the shore inward so land does not look cut off.
          const np = pts.length / 2;
          const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          const inx = p0[0] <= 1 && p1[0] <= 1 ? 1 : p0[0] >= W - 1 && p1[0] >= W - 1 ? -1 : 0;
          const iny = inx ? 0 : p0[1] <= 1 && p1[1] <= 1 ? 1 : -1;
          for (let k = 0; k < np; k++) {
            const t = k / (np - 1);
            const bow = Math.sin(Math.PI * t) * Math.min(12, len * 0.09);
            if (inx) pts[k * 2] = (inx > 0 ? 0 : W) + inx * (bow + Math.abs(pts[k * 2] - (inx > 0 ? 0 : W)));
            else pts[k * 2 + 1] = (iny > 0 ? 0 : H) + iny * (bow + Math.abs(pts[k * 2 + 1] - (iny > 0 ? 0 : H)));
          }
        }
        pts = chaikin(pts, 1);
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        const mid = Math.floor(pts.length / 4) * 2;
        e = { key, pts, regions: [], frame, kind: 'unknown', mx: pts[mid], my: pts[mid + 1], len };
        edgeMap.set(key, e);
      }
      e.regions.push(idx);
      p.edges.push({ e, rev: !fwd });
    }
    for (const { e, rev } of p.edges) {
      const np = e.pts.length / 2;
      for (let k = 0; k < np - 1; k++) {
        const i = (rev ? np - 1 - k : k) * 2;
        p.outline.push(e.pts[i], e.pts[i + 1]);
      }
    }
    let a2 = 0;
    let inr = Infinity;
    for (let i = 0; i < p.outline.length; i += 2) {
      const x = p.outline[i], y = p.outline[i + 1];
      const j = (i + 2) % p.outline.length;
      a2 += x * p.outline[j + 1] - p.outline[j] * y;
      if (x < p.bbox[0]) p.bbox[0] = x;
      if (y < p.bbox[1]) p.bbox[1] = y;
      if (x > p.bbox[2]) p.bbox[2] = x;
      if (y > p.bbox[3]) p.bbox[3] = y;
      inr = Math.min(inr, Math.hypot(x - p.cx, y - p.cy));
    }
    p.area = Math.abs(a2) / 2;
    p.inradius = Number.isFinite(inr) ? inr : 0;
    // A centre that the wobble pushed outside its own outline falls back to the vertex mean.
    if (p.outline.length >= 6 && !pointInPoly(p.outline, p.cx, p.cy)) {
      let sx = 0, sy = 0;
      for (let i = 0; i < p.outline.length; i += 2) { sx += p.outline[i]; sy += p.outline[i + 1]; }
      p.cx = sx / (p.outline.length / 2);
      p.cy = sy / (p.outline.length / 2);
    }
    regions.push(p);
  });

  const byId = new Map(regions.map((p) => [p.r.id, p]));
  // Coast only when we can be sure; otherwise an edge of knowledge.
  for (const p of regions) {
    const allLandKnown = p.r.neighbors.every((n) => n.kind === 'sea' || present.has(n.region));
    for (const { e } of p.edges) {
      if (e.regions.length >= 2) e.kind = 'internal';
      else if (e.frame) e.kind = 'coast';
      else e.kind = p.r.coastal && allLandKnown ? 'coast' : 'unknown';
    }
  }
  const edges = [...edgeMap.values()];

  // --- links: rivers, sea lanes, passes --------------------------------------------
  for (const p of regions) {
    const ang = (hash32(p.r.id * 53 + 11, 0x7a11) / 4294967296) * Math.PI * 2;
    const d = Math.min(17, p.inradius * 0.38);
    p.rx = p.cx + Math.cos(ang) * d;
    p.ry = p.cy + Math.sin(ang) * d;
  }
  const rivers: RiverCourse[] = [];
  const seaLanes: SeaLane[] = [];
  const passes: PassMark[] = [];
  const seen = new Set<string>();
  const sharedEdge = (a: TRegion, b: TRegion): TEdge | null => {
    let best: TEdge | null = null;
    for (const { e } of a.edges) {
      if (e.regions.length >= 2 && e.regions.includes(b.idx) && (!best || e.len > best.len)) best = e;
    }
    return best;
  };
  const coastPoint = (p: TRegion, tx: number, ty: number): [number, number] | null => {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const { e } of p.edges) {
      if (e.kind !== 'coast') continue;
      const dd = Math.hypot(e.mx - tx, e.my - ty) + (e.frame ? 400 : 0);
      if (dd < bd) { bd = dd; best = [e.mx, e.my]; }
    }
    return best;
  };
  for (const p of regions) {
    let riverLinks = 0;
    let lowest = true;
    for (const n of p.r.neighbors) {
      const q = byId.get(n.region);
      if (n.kind === 'river') {
        riverLinks++;
        if (q && q.r.elevation < p.r.elevation) lowest = false;
        if (!q) lowest = false;
      }
      if (!q) continue;
      const key = p.r.id < q.r.id ? `${p.r.id}-${q.r.id}-${n.kind}` : `${q.r.id}-${p.r.id}-${n.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = p.r.id < q.r.id ? p : q, b = p.r.id < q.r.id ? q : p;
      if (n.kind === 'river') {
        const e = sharedEdge(a, b);
        const mx = e ? e.mx : (a.cx + b.cx) / 2, my = e ? e.my : (a.cy + b.cy) / 2;
        const s1 = hash32(a.r.id * 131 + 7, b.r.id);
        const p1 = wobble(a.rx, a.ry, mx, my, s1, 0.16);
        const p2 = wobble(mx, my, b.rx, b.ry, s1 ^ 0x5bd1e995, 0.16);
        rivers.push({ a: a.r.id, b: b.r.id, pts: chaikin(p1.concat(p2.slice(2)), 2) });
      } else if (n.kind === 'sea') {
        const pa = coastPoint(a, b.cx, b.cy), pb = coastPoint(b, a.cx, a.cy);
        if (!pa || !pb) continue;
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
        const l = Math.hypot(dx, dy) || 1;
        const sign = hash32(a.r.id, b.r.id) & 1 ? 1 : -1;
        const bulge = clamp(l * 0.22, 14, 90) * sign;
        seaLanes.push({
          ax: pa[0], ay: pa[1], bx: pb[0], by: pb[1],
          cx: (pa[0] + pb[0]) / 2 + (-dy / l) * bulge, cy: (pa[1] + pb[1]) / 2 + (dx / l) * bulge,
        });
      } else if (n.kind === 'pass') {
        const e = sharedEdge(a, b);
        if (e) {
          const dx = b.cx - a.cx, dy = b.cy - a.cy;
          const l = Math.hypot(dx, dy) || 1;
          passes.push({ x: e.mx, y: e.my, ux: dx / l, uy: dy / l });
        }
      }
    }
    // River mouth: the lowest reach of a river in a region whose shore we know.
    if (p.r.river && riverLinks >= 1 && lowest) {
      let mouth: TEdge | null = null;
      for (const { e } of p.edges) if (e.kind === 'coast' && !e.frame && (!mouth || e.len > mouth.len)) mouth = e;
      if (!mouth) for (const { e } of p.edges) if (e.kind === 'coast' && (!mouth || e.len > mouth.len)) mouth = e;
      if (mouth) {
        // Run a little past the shore so the ribbon meets the sea.
        const dx = mouth.mx - p.rx, dy = mouth.my - p.ry;
        const l = Math.hypot(dx, dy) || 1;
        const pts = wobble(p.rx, p.ry, mouth.mx, mouth.my, hash32(p.r.id, 991), 0.16);
        pts.push(mouth.mx + (dx / l) * 7, mouth.my + (dy / l) * 7);
        rivers.push({ a: p.r.id, b: -1, pts: chaikin(pts, 2) });
      }
    }
  }

  const fields = buildFields(regions, edges, W, H);
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of regions) {
    bbox[0] = Math.min(bbox[0], p.bbox[0]); bbox[1] = Math.min(bbox[1], p.bbox[1]);
    bbox[2] = Math.max(bbox[2], p.bbox[2]); bbox[3] = Math.max(bbox[3], p.bbox[3]);
  }
  if (!regions.length) { bbox[0] = 0; bbox[1] = 0; bbox[2] = W; bbox[3] = H; }
  return { width: W, height: H, regions, byId, edges, rivers, seaLanes, passes, fields, bbox };
}

/**
 * Outer boundaries of groups of regions (for example: one civilisation's territory).
 * `groupOf` returns a key, or null for regions that take no part. Only edges whose far
 * side is known — another group, or certain sea — are included.
 */
export function boundaryChains(topo: Topology, groupOf: (p: TRegion) => number | null): Chain[] {
  interface Seg { key: number; pts: number[]; start: string; end: string; src: TRegion; used: boolean }
  const segs: Seg[] = [];
  for (const p of topo.regions) {
    const g = groupOf(p);
    if (g == null) continue;
    for (const { e, rev } of p.edges) {
      if (e.kind === 'unknown') continue;
      if (e.kind === 'internal') {
        const other = topo.regions[e.regions[0] === p.idx ? e.regions[1] : e.regions[0]];
        if (groupOf(other) === g) continue;
      }
      const np = e.pts.length / 2;
      const pts: number[] = [];
      for (let k = 0; k < np; k++) {
        const i = (rev ? np - 1 - k : k) * 2;
        pts.push(e.pts[i], e.pts[i + 1]);
      }
      const [a, b] = e.key.split('|');
      segs.push({ key: g, pts, start: rev ? b : a, end: rev ? a : b, src: p, used: false });
    }
  }
  // Region polygons may wind either way; normalise every segment so its region is on the left.
  for (const s of segs) {
    const o = s.src.outline;
    let a2 = 0;
    for (let i = 0; i < o.length; i += 2) {
      const j = (i + 2) % o.length;
      a2 += o[i] * o[j + 1] - o[j] * o[i + 1];
    }
    // In screen coordinates (y down) positive a2 is clockwise on screen, which puts the
    // interior on the right of travel; flip those.
    if (a2 > 0) {
      const rev: number[] = [];
      for (let i = s.pts.length - 2; i >= 0; i -= 2) rev.push(s.pts[i], s.pts[i + 1]);
      s.pts = rev;
      const t = s.start; s.start = s.end; s.end = t;
    }
  }
  const byStart = new Map<string, Seg[]>();
  const ends = new Set<string>();
  for (const s of segs) {
    const k = s.key + '@' + s.start;
    let l = byStart.get(k);
    if (!l) byStart.set(k, (l = []));
    l.push(s);
    ends.add(s.key + '@' + s.end);
  }
  const chains: Chain[] = [];
  const walk = (first: Seg) => {
    const pts = first.pts.slice();
    first.used = true;
    let cur = first;
    let closed = false;
    for (;;) {
      if (cur.end === first.start) { closed = true; break; }
      const next = (byStart.get(cur.key + '@' + cur.end) ?? []).find((s) => !s.used);
      if (!next) break;
      next.used = true;
      for (let i = 2; i < next.pts.length; i++) pts.push(next.pts[i]);
      cur = next;
    }
    if (closed) pts.length -= 2;
    chains.push({ key: first.key, pts, closed, side: 1 });
  };
  // Open chains first (those that start where no segment of the group ends), then loops.
  for (const s of segs) if (!s.used && !ends.has(s.key + '@' + s.start)) walk(s);
  for (const s of segs) if (!s.used) walk(s);
  return chains;
}

/** The outline of one region as a closed chain with the interior side resolved. */
export function regionChain(p: TRegion): Chain {
  const o = p.outline;
  let a2 = 0;
  for (let i = 0; i < o.length; i += 2) {
    const j = (i + 2) % o.length;
    a2 += o[i] * o[j + 1] - o[j] * o[i + 1];
  }
  return { key: p.r.id, pts: o.slice(), closed: true, side: a2 > 0 ? -1 : 1 };
}
