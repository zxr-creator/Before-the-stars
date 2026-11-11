// Heightfield and ground mesh for the known land. Heights come from each region's
// terrain and elevation, blurred across region borders so there are no cliffs, plus
// terrain-specific noise. Rivers are cut as channels that always run downhill.
import * as THREE from 'three';
import type { ClimateZone, Terrain } from '../protocol';
import { regionIndexAt, resample, sampleField, type Fields, type Topology } from './topology';
import { boxBlur, clamp, fbm, lerp, mixRgb, ridged, smoothstep, toLinear, vnoise, type RGB } from './util';

export const MESH_CELL = 4;

interface TerrainParam { base: number; elev: number; amp: number }
const PARAM: Record<Terrain, TerrainParam> = {
  plains: { base: 1.8, elev: 3.5, amp: 2.6 },
  hills: { base: 5.5, elev: 8, amp: 11 },
  mountains: { base: 15, elev: 18, amp: 36 },
  forest: { base: 2.6, elev: 5, amp: 4.2 },
  marsh: { base: 0.5, elev: 0.7, amp: 0.7 },
  steppe: { base: 2.4, elev: 5, amp: 3.4 },
  desert: { base: 2.2, elev: 4, amp: 3.2 },
  tundra: { base: 2.6, elev: 5, amp: 3.6 },
};

/**
 * Ground palette (sRGB): tones per terrain that large noise patches move between. The table
 * holds the full-strength colours; `calm` pulls them toward a pale, warm neutral so the land
 * carries the ownership wash and the works on it instead of competing with them.
 */
function calm(c: RGB): RGB {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const k = 0.42, pale = 0.16;
  const r = c[0] + (l * 1.05 - c[0]) * k, g = c[1] + (l - c[1]) * k, b = c[2] + (l * 0.84 - c[2]) * k;
  return [r + (0.9 - r) * pale, g + (0.86 - g) * pale, b + (0.72 - b) * pale];
}
const FULL_GROUND: Record<Terrain, [RGB, RGB, RGB]> = {
  plains: [[0.54, 0.76, 0.3], [0.68, 0.82, 0.36], [0.44, 0.67, 0.27]],
  hills: [[0.62, 0.72, 0.33], [0.76, 0.7, 0.38], [0.5, 0.62, 0.28]],
  mountains: [[0.6, 0.55, 0.47], [0.7, 0.64, 0.54], [0.48, 0.47, 0.42]],
  forest: [[0.33, 0.6, 0.26], [0.42, 0.67, 0.28], [0.25, 0.5, 0.24]],
  marsh: [[0.42, 0.64, 0.42], [0.52, 0.7, 0.4], [0.3, 0.55, 0.47]],
  steppe: [[0.8, 0.76, 0.38], [0.86, 0.8, 0.46], [0.7, 0.72, 0.36]],
  desert: [[0.93, 0.8, 0.5], [0.96, 0.86, 0.6], [0.88, 0.7, 0.42]],
  tundra: [[0.74, 0.8, 0.7], [0.9, 0.93, 0.92], [0.62, 0.7, 0.58]],
};
const GROUND = Object.fromEntries(
  (Object.keys(FULL_GROUND) as Terrain[]).map((t) => [t, FULL_GROUND[t].map(calm)]),
) as Record<Terrain, [RGB, RGB, RGB]>;
const ROCK: RGB = [0.56, 0.51, 0.45];
const ROCK_DARK: RGB = [0.42, 0.39, 0.36];
const SNOW: RGB = [0.97, 0.98, 1.0];
const SAND: RGB = [0.95, 0.88, 0.66];
const RIVER_BED: RGB = [0.5, 0.68, 0.56];
const TERRAINS: Terrain[] = ['plains', 'hills', 'mountains', 'forest', 'marsh', 'steppe', 'desert', 'tundra'];

/** Width of the band over which a wrapped world's ground is blended into its copy. */
const BAND = 80;

/**
 * Make a per-vertex grid periodic in x with period W (S columns): over the last BAND units
 * before x = W the values fade into those one turn west, and the columns beyond each edge of
 * the sheet repeat the other side. Column i1 (x = W) then equals column i0 (x = 0).
 */
function periodize(a: Float32Array, nx: number, nz: number, S: number, i0: number, i1: number, x0: number, G: number, W: number): void {
  for (let j = 0; j < nz; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * G;
      if (x < W - BAND || i - S < 0 || i > i1) continue;
      const t = smoothstep(W - BAND, W, x);
      a[row + i] += (a[row + i - S] - a[row + i]) * t;
    }
    for (let i = i1 + 1; i < nx; i++) if (i - S >= 0) a[row + i] = a[row + i - S];
    for (let i = i0 - 1; i >= 0; i--) if (i + S < nx) a[row + i] = a[row + i + S];
  }
}

/**
 * Climate shifts of the ground palette (Earth-like world): rainforest greens in the
 * tropics, dry tans in arid lands, cooler sage inland, and ice-pale polar ground.
 */
const CLIMATE_SHIFT: Record<ClimateZone, { c: RGB; k: number }> = {
  tropical: { c: [0.3, 0.58, 0.24], k: 0.34 },
  arid: { c: [0.9, 0.78, 0.52], k: 0.4 },
  temperate: { c: [0.6, 0.7, 0.4], k: 0 },
  continental: { c: [0.52, 0.62, 0.5], k: 0.3 },
  polar: { c: [0.9, 0.93, 0.94], k: 0.6 },
};
const groundCache = new Map<string, [RGB, RGB, RGB]>();
function climateGround(t: Terrain, climate: ClimateZone | null | undefined): [RGB, RGB, RGB] {
  if (!climate || climate === 'temperate') return GROUND[t];
  const key = t + climate;
  let g = groundCache.get(key);
  if (!g) {
    const sh = CLIMATE_SHIFT[climate];
    const c = calm(sh.c);
    g = GROUND[t].map((x) => mixRgb(x, c, sh.k)) as [RGB, RGB, RGB];
    groundCache.set(key, g);
  }
  return g;
}

export interface RiverPath {
  /** Dense centre line, flattened x,z. */
  pts: number[];
  /** Half width per point. */
  hw: number[];
  /** True when the course ends in the sea. */
  mouth: boolean;
}

export interface Heightfield {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  h: Float32Array;
  /** Distance to the nearest river centre line in world units (capped). */
  riverD: Float32Array;
  maxH: number;
}

export function heightAt(hf: Heightfield, x: number, z: number): number {
  const gx = clamp((x - hf.x0) / hf.cell, 0, hf.nx - 1.001), gz = clamp((z - hf.z0) / hf.cell, 0, hf.nz - 1.001);
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const i = iz * hf.nx + ix;
  const h = hf.h;
  return (h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fz) + (h[i + hf.nx] * (1 - fx) + h[i + hf.nx + 1] * fx) * fz;
}
/** Height clamped to the sea surface, for things that must not sink below the table. */
export function groundAt(hf: Heightfield, x: number, z: number): number {
  return Math.max(0, heightAt(hf, x, z));
}
export function riverDistAt(hf: Heightfield, x: number, z: number): number {
  const ix = clamp(Math.round((x - hf.x0) / hf.cell), 0, hf.nx - 1), iz = clamp(Math.round((z - hf.z0) / hf.cell), 0, hf.nz - 1);
  return hf.riverD[iz * hf.nx + ix];
}
export function slopeAt(hf: Heightfield, x: number, z: number): number {
  const e = hf.cell;
  return Math.hypot(heightAt(hf, x + e, z) - heightAt(hf, x - e, z), heightAt(hf, x, z + e) - heightAt(hf, x, z - e)) / (2 * e);
}

export interface TerrainBuild {
  hf: Heightfield;
  /** The ground mesh in column strips. */
  geometries: THREE.BufferGeometry[];
  rivers: RiverPath[];
}

export function buildTerrain(topo: Topology): TerrainBuild {
  const f: Fields = topo.fields;
  const G = MESH_CELL;
  const nx = Math.floor((f.nx * f.cell) / G) + 1, nz = Math.floor((f.nz * f.cell) / G) + 1;
  const n = nx * nz;
  const hf: Heightfield = { x0: f.x0, z0: f.z0, cell: G, nx, nz, h: new Float32Array(n), riverD: new Float32Array(n).fill(99), maxH: 0 };
  const regions = topo.regions;
  // Wrapped world: everything placed by world position is applied at its copies one width
  // east and west too, and the finished heightfield is made periodic (see `periodize`).
  const Wr = topo.wrap;
  const offsets = Wr ? [-Wr, 0, Wr] : [0];
  const S = Wr ? Math.round(Wr / G) : 0;
  const i0 = Wr ? Math.round((0 - f.x0) / G) : 0, i1 = Wr ? Math.round((Wr - f.x0) / G) : nx - 1;

  // --- per-vertex inputs ---------------------------------------------------------
  const sd = new Float32Array(n), dUnk = new Float32Array(n), dCoast = new Float32Array(n);
  const mask = new Float32Array(n), base = new Float32Array(n), amp = new Float32Array(n);
  const wMount = new Float32Array(n), wDune = new Float32Array(n), wRem = new Float32Array(n);
  const rid = new Int16Array(n);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      const x = f.x0 + i * G, z = f.z0 + j * G;
      sd[v] = sampleField(f, f.sd, x, z);
      dUnk[v] = sampleField(f, f.dUnk, x, z);
      dCoast[v] = sampleField(f, f.dCoast, x, z);
      const ri = regionIndexAt(f, x, z);
      rid[v] = ri;
      if (ri >= 0) {
        const r = regions[ri].r;
        const p = PARAM[r.terrain];
        const e = clamp(r.elevation / 255, 0, 1);
        mask[v] = 1;
        base[v] = p.base + p.elev * e;
        amp[v] = p.amp * (0.75 + 0.5 * e);
        wMount[v] = r.terrain === 'mountains' ? 1 : r.terrain === 'hills' ? 0.3 : 0;
        wDune[v] = r.terrain === 'desert' ? 1 : 0;
        wRem[v] = r.visibility === 'remembered' ? 1 : 0;
      }
    }
  }
  const blurN = (a: Float32Array, radius: number, passes: number) => {
    const m = mask.slice();
    boxBlur(a, nx, nz, radius, passes);
    boxBlur(m, nx, nz, radius, passes);
    for (let v = 0; v < n; v++) a[v] = m[v] > 0.02 ? a[v] / m[v] : 0;
  };
  blurN(base, 5, 2);
  blurN(amp, 5, 2);
  blurN(wMount, 4, 2);
  blurN(wDune, 3, 2);
  blurN(wRem, 4, 2);

  // --- raw relief ------------------------------------------------------------------
  const h = hf.h;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      if (sd[v] < -10) { h[v] = -2.2; continue; }
      const x = f.x0 + i * G, z = f.z0 + j * G;
      const rolling = fbm(x / 96, z / 96, 3, 11) * 0.6 + fbm(x / 36, z / 36, 3, 23) * 0.4;
      let N = rolling * 1.3 - 0.3;
      const wm = wMount[v];
      if (wm > 0.01) {
        const rg = Math.pow(ridged(x / 64 + 3.1, z / 64 - 1.7, 5, 37), 1.25);
        N = lerp(N, rg * 1.1 + rolling * 0.1, clamp(wm, 0, 1));
      }
      let hh = base[v] + amp[v] * N;
      if (wDune[v] > 0.01) {
        const warp = fbm(x / 60, z / 60, 2, 51) * 5;
        const d1 = Math.abs(Math.sin((x * 0.82 + z * 0.57) / 13 + warp));
        hh += wDune[v] * (1 - d1) * (1 - d1) * 2.6;
      }
      h[v] = hh;
    }
  }
  // Level the ground around each region's centre so settlements, markers and armies sit well.
  for (const off of offsets) for (const p of regions) {
    // The settlement stands at the principal city site.
    const px = p.sx + off, py = p.sy;
    if (px < f.x0 - 60 || px > f.x0 + nx * G + 60) continue;
    const ci = clamp(Math.round((px - f.x0) / G), 0, nx - 1), cj = clamp(Math.round((py - f.z0) / G), 0, nz - 1);
    const cv = cj * nx + ci;
    const hc = base[cv] + amp[cv] * (p.r.terrain === 'mountains' ? 0.12 : 0.22);
    const R = Math.min(40, Math.max(22, p.inradius * 0.8));
    const r0 = Math.ceil(R / G);
    for (let dj = -r0; dj <= r0; dj++) {
      for (let di = -r0; di <= r0; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const d = Math.hypot(f.x0 + i * G - px, f.z0 + j * G - py);
        const w = smoothstep(R, R * 0.42, d) * 0.9;
        if (w > 0) h[j * nx + i] = lerp(h[j * nx + i], hc, w);
      }
    }
  }
  // Shores, edges of knowledge, and the flatter rendition of remembered land.
  for (let v = 0; v < n; v++) {
    if (sd[v] < -10) continue;
    const s = sd[v];
    if (s <= 0) {
      const t = smoothstep(0, 5, -s);
      h[v] = lerp(0.3, -2.2, t);
      continue;
    }
    let hh = h[v] * lerp(1, 0.4, clamp(wRem[v], 0, 1));
    const shore = smoothstep(0, 1, s / (11 + hh * 0.8));
    const edge = smoothstep(0, 1, dUnk[v] / 30);
    hh = 0.3 + hh * (0.08 + 0.92 * shore) * edge;
    h[v] = hh;
  }

  // --- rivers: monotone water profile, then carve -----------------------------------
  const rivers: RiverPath[] = [];
  const riverLevel = new Float32Array(n), riverHw = new Float32Array(n);
  const nodeLevel = new Map<number, number>();
  const levelOfNode = (id: number): number => {
    let l = nodeLevel.get(id);
    if (l === undefined) {
      const p = topo.byId.get(id);
      l = p ? Math.max(0.5, heightAt(hf, p.rx, p.ry) - 0.5) : 0.5;
      nodeLevel.set(id, l);
    }
    return l;
  };
  for (const rc of topo.rivers) {
    let pts = resample(rc.pts, 2.5);
    let la = levelOfNode(rc.a);
    let lb = rc.b < 0 ? 0.12 : levelOfNode(rc.b);
    let flip = false;
    if (lb > la) {
      const rev: number[] = [];
      for (let i = pts.length - 2; i >= 0; i -= 2) rev.push(pts[i], pts[i + 1]);
      pts = rev;
      const t = la; la = lb; lb = t;
      flip = true;
    }
    const np = pts.length / 2;
    const level: number[] = new Array(np);
    const hw: number[] = new Array(np);
    let cur = la;
    for (let k = 0; k < np; k++) {
      const t = heightAt(hf, pts[k * 2], pts[k * 2 + 1]);
      cur = Math.max(lb, Math.min(cur, t - 0.25));
      level[k] = cur;
      hw[k] = 1.9 + 1.3 * (k / Math.max(1, np - 1)) * (rc.b < 0 || flip ? 1 : 0.6);
    }
    level[np - 1] = lb;
    if (rc.b < 0) hw[np - 1] = 3.8;
    rivers.push({ pts, hw, mouth: rc.b < 0 });
    for (const off of offsets) for (let k = 0; k < np; k++) {
      const x = pts[k * 2] + off, z = pts[k * 2 + 1];
      if (x < f.x0 - 20 || x > f.x0 + nx * G + 20) continue;
      const R = hw[k] + 12;
      const i0 = Math.max(0, Math.floor((x - R - f.x0) / G)), i1 = Math.min(nx - 1, Math.ceil((x + R - f.x0) / G));
      const j0 = Math.max(0, Math.floor((z - R - f.z0) / G)), j1 = Math.min(nz - 1, Math.ceil((z + R - f.z0) / G));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(f.x0 + i * G - x, f.z0 + j * G - z);
          const v = j * nx + i;
          if (d < hf.riverD[v]) { hf.riverD[v] = d; riverLevel[v] = level[k]; riverHw[v] = hw[k]; }
        }
      }
    }
  }
  for (let v = 0; v < n; v++) {
    const d = hf.riverD[v];
    if (d >= 90 || sd[v] <= 0) continue;
    const hw = riverHw[v], lvl = riverLevel[v];
    const flat = hw + 2.6;
    if (d <= flat) h[v] = Math.min(h[v], lvl - 0.75);
    else if (d < flat + 9) h[v] = lerp(lvl + 0.15, h[v], smoothstep(flat, flat + 9, d));
  }
  if (Wr) {
    periodize(h, nx, nz, S, i0, i1, f.x0, G, Wr);
    periodize(hf.riverD, nx, nz, S, i0, i1, f.x0, G, Wr);
  }
  let maxH = 0;
  for (let v = 0; v < n; v++) if (h[v] > maxH) maxH = h[v];
  hf.maxH = maxH;

  // --- mesh --------------------------------------------------------------------------
  const smooth = h.slice();
  boxBlur(smooth, nx, nz, 3, 1);
  const used = new Int32Array(n).fill(-1);
  const index: number[] = [];
  /** Column chunk of each quad (six indices), so the mesh can be split for frustum culling. */
  const quadChunk: number[] = [];
  const CHUNK = 48;
  let count = 0;
  const near = (v: number) => sd[v] > -7;
  // A wrapped world's mesh is exactly one turn of the globe; its copies tile it seamlessly.
  for (let j = 0; j < nz - 1; j++) {
    for (let i = Wr ? i0 : 0; i < (Wr ? i1 : nx - 1); i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (!(near(a) || near(b) || near(c) || near(d))) continue;
      for (const v of [a, b, c, d]) if (used[v] < 0) used[v] = count++;
      // Alternate the diagonal so the facets do not line up into stripes.
      if ((i + j) & 1) index.push(used[a], used[c], used[b], used[b], used[c], used[d]);
      else index.push(used[a], used[c], used[d], used[a], used[d], used[b]);
      quadChunk.push(Math.floor(i / CHUNK));
    }
  }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const tex = new Float32Array(count * 2);
  const colourAt = (terrain: Terrain, climate: ClimateZone | null | undefined, x: number, z: number, hh: number): RGB => {
    const g = climateGround(terrain, climate);
    const a = fbm(x / 70, z / 70, 3, 301 + TERRAINS.indexOf(terrain) * 7);
    const b = fbm(x / 23, z / 23, 2, 401);
    let c = mixRgb(g[0], g[1], smoothstep(0.42, 0.68, a));
    c = mixRgb(c, g[2], smoothstep(0.5, 0.78, b) * 0.75);
    if (terrain === 'mountains') c = mixRgb(c, SNOW, smoothstep(33, 43, hh + (b - 0.5) * 12));
    else if (terrain === 'hills') c = mixRgb(c, GROUND.mountains[1], smoothstep(13, 21, hh) * 0.6);
    else if (terrain === 'tundra') c = mixRgb(c, SNOW, smoothstep(0.52, 0.66, fbm(x / 40, z / 40, 3, 77)) * 0.85);
    else if (terrain === 'marsh') c = mixRgb(c, [0.3, 0.6, 0.62], smoothstep(0.64, 0.72, fbm(x / 11, z / 11, 2, 91)) * 0.75);
    if (climate === 'polar' && terrain !== 'tundra') c = mixRgb(c, SNOW, smoothstep(0.42, 0.62, fbm(x / 40, z / 40, 3, 79)) * 0.7);
    return c;
  };
  /** Linear colour (rgb) and the dune and rock weights of the ground at vertex v, evaluated at x. */
  const out = [0, 0, 0, 0, 0], out2 = [0, 0, 0, 0, 0];
  const shadeVertex = (v: number, x: number, z: number, hh: number, slope: number, o: number[]): void => {
    // Terrain colour, blended across region borders through a noisy multi-tap lookup.
    const wx = (vnoise(x / 26, z / 26, 5) - 0.5) * 22, wz = (vnoise(x / 26 + 9.3, z / 26 - 4.1, 6) - 0.5) * 22;
    let cr = 0, cg = 0, cb = 0, taps = 0, dune = 0;
    for (let t = 0; t < 5; t++) {
      const ox = t === 1 ? 6 : t === 2 ? -6 : 0, oz = t === 3 ? 6 : t === 4 ? -6 : 0;
      let ri = regionIndexAt(f, x + wx + ox, z + wz + oz);
      if (ri < 0) ri = rid[v];
      if (ri < 0) continue;
      const rr = regions[ri].r;
      const c = colourAt(rr.terrain, rr.climate, x, z, hh);
      cr += c[0]; cg += c[1]; cb += c[2]; taps++;
      if (rr.terrain === 'desert') dune++;
    }
    let c: RGB = taps ? [cr / taps, cg / taps, cb / taps] : SAND;
    const rockW = smoothstep(0.55, 1.0, slope);
    if (rockW > 0) c = mixRgb(c, hh > 24 ? ROCK : ROCK_DARK, rockW * 0.85);
    // Beaches along certain coast.
    const beach = smoothstep(7.5, 2.5, Math.min(dCoast[v], Math.max(0, sd[v]) + 0.01)) * (dCoast[v] < 12 ? 1 : 0);
    if (beach > 0) c = mixRgb(c, SAND, beach * 0.92);
    // Lush banks and a pale bed along rivers.
    const rd = hf.riverD[v];
    if (rd < 90 && sd[v] > 0) {
      const hw = riverHw[v];
      c = mixRgb(c, [0.36, 0.63, 0.27], smoothstep(hw + 13, hw + 4, rd) * 0.35);
      c = mixRgb(c, RIVER_BED, smoothstep(hw + 2.2, hw + 0.3, rd) * 0.8);
    }
    // Baked relief shading: valleys a little darker, crests a little lighter.
    const curv = hh - smooth[v];
    const shade = clamp(1 + curv * 0.05, 0.8, 1.14);
    const lin = toLinear([clamp(c[0] * shade, 0, 1), clamp(c[1] * shade, 0, 1), clamp(c[2] * shade, 0, 1)]);
    o[0] = lin[0]; o[1] = lin[1]; o[2] = lin[2];
    o[3] = taps ? dune / taps : 0;
    o[4] = rockW;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      const u = used[v];
      if (u < 0) continue;
      const x = f.x0 + i * G, z = f.z0 + j * G;
      const hh = h[v];
      pos[u * 3] = x; pos[u * 3 + 1] = hh; pos[u * 3 + 2] = z;
      const hl = h[v - (i > 0 ? 1 : 0)], hr = h[v + (i < nx - 1 ? 1 : 0)];
      const hu = h[v - (j > 0 ? nx : 0)], hd = h[v + (j < nz - 1 ? nx : 0)];
      const gx = (hr - hl) / (2 * G), gz = (hd - hu) / (2 * G);
      const il = 1 / Math.hypot(gx, 1, gz);
      nor[u * 3] = -gx * il; nor[u * 3 + 1] = il; nor[u * 3 + 2] = -gz * il;
      const slope = Math.hypot(gx, gz);
      shadeVertex(v, x, z, hh, slope, out);
      // Near the date line the colour fades into its value one turn round, so the copies meet.
      const band = Wr ? smoothstep(Wr - BAND, Wr, x) : 0;
      if (band > 0) {
        shadeVertex(v - S, x - Wr, z, hh, slope, out2);
        for (let q = 0; q < 5; q++) out[q] += (out2[q] - out[q]) * band;
      }
      col[u * 3] = out[0]; col[u * 3 + 1] = out[1]; col[u * 3 + 2] = out[2];
      tex[u * 2] = out[3];
      tex[u * 2 + 1] = out[4];
    }
  }
  // Split into column strips: each is culled on its own, which matters most on a wrapped world
  // where the scene is drawn once per visible copy.
  const geometries: THREE.BufferGeometry[] = [];
  const nChunks = Math.ceil(nx / CHUNK);
  const remap = new Int32Array(count).fill(-1);
  for (let ch = 0; ch < nChunks; ch++) {
    const idx: number[] = [];
    const verts: number[] = [];
    for (let q = 0; q < quadChunk.length; q++) {
      if (quadChunk[q] !== ch) continue;
      for (let k = 0; k < 6; k++) {
        const g = index[q * 6 + k];
        if (remap[g] < 0) { remap[g] = verts.length; verts.push(g); }
        idx.push(remap[g]);
      }
    }
    for (const g of verts) remap[g] = -1;
    if (!idx.length) continue;
    const m = verts.length;
    const p3 = new Float32Array(m * 3), n3 = new Float32Array(m * 3), c3 = new Float32Array(m * 3), t2 = new Float32Array(m * 2);
    verts.forEach((g, l) => {
      for (let k = 0; k < 3; k++) { p3[l * 3 + k] = pos[g * 3 + k]; n3[l * 3 + k] = nor[g * 3 + k]; c3[l * 3 + k] = col[g * 3 + k]; }
      t2[l * 2] = tex[g * 2]; t2[l * 2 + 1] = tex[g * 2 + 1];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(p3, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(n3, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(c3, 3));
    geometry.setAttribute('aTex', new THREE.BufferAttribute(t2, 2));
    geometry.setIndex(m > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometries.push(geometry);
  }
  return { hf, geometries, rivers };
}
