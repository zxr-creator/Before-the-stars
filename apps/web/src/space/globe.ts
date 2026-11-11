// The home world as seen from space, painted from the match's own generated world: the regions
// this seat knows in their terrain and climate colours, realms in their owners' colours, the sea
// around known coasts, ice caps beyond 72°, and everything this seat has not charted hidden under
// cloud (the same rule as the atlas: what is not in the observation is not drawn).
import type { ClimateZone, Observation, RegionView, Terrain } from '../protocol';

const LAND: Record<Terrain, string> = {
  plains: '#86a056', hills: '#8f8d58', mountains: '#8c806c', forest: '#4f7b3e', marsh: '#62805a', steppe: '#adaa62',
  desert: '#d4b97f', tundra: '#a3a993',
};
const CLIMATE: Record<ClimateZone, [string, number]> = {
  tropical: ['#3e7b33', 0.35], arid: ['#d1b06f', 0.4], temperate: ['#86a056', 0], continental: ['#6f805b', 0.25], polar: ['#e6ecee', 0.6],
};
const SEA_DEEP = '#0f3350';
const SEA = '#1d4f73';
const SHELF = '#3a86a3';
const UNKNOWN_OWNER = '#6b6257';
const SETTLE_R: Record<string, number> = { town: 1, city: 1.5, metropolis: 2, megalopolis: 2.5 };

/** What the painted globe depends on; repaint only when it changes. */
export function earthSignature(obs: Observation): string {
  let s = `${obs.match_id}:${obs.seat}:${obs.world.width}x${obs.world.height}:`;
  for (const r of obs.regions) s += `${r.id}${r.visibility[0]}${r.owner ?? '-'}${r.controller ?? '-'}${r.settlement[0]},`;
  return s;
}

function seatColor(obs: Observation, seat: number | null): string | null {
  if (seat == null) return null;
  if (seat === obs.seat) return obs.civ.color;
  return obs.others.find((o) => o.seat === seat)?.color ?? UNKNOWN_OWNER;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function landColor(r: RegionView): string {
  let c = LAND[r.terrain] ?? LAND.plains;
  if (r.climate) {
    const [cc, w] = CLIMATE[r.climate];
    if (w > 0) c = mixHex(c, cc, w);
  }
  // A small per-region variation so neighbouring regions of one kind do not merge into a slab.
  const j = ((r.id * 2654435761) >>> 0) / 4294967296;
  c = mixHex(c, j > 0.5 ? '#ffffff' : '#000000', Math.abs(j - 0.5) * 0.12);
  if (r.visibility === 'remembered') c = mixHex(c, '#9a958a', 0.3);
  return c;
}

/** A tileable value-noise field (period = size), summed over octaves, values 0..1. */
function noiseTile(size: number, seed: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const step = size / cells;
    const lat = new Float32Array(cells * cells);
    for (let k = 0; k < lat.length; k++) {
      let h = (k * 374761393 + (seed + o * 7919) * 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      lat[k] = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    for (let y = 0; y < size; y++) {
      const gy = y / step, y0 = Math.floor(gy) % cells, y1 = (y0 + 1) % cells, fy = gy - Math.floor(gy);
      const v = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / step, x0 = Math.floor(gx) % cells, x1 = (x0 + 1) % cells, fx = gx - Math.floor(gx);
        const u = fx * fx * (3 - 2 * fx);
        const a = lat[y0 * cells + x0] + (lat[y0 * cells + x1] - lat[y0 * cells + x0]) * u;
        const b = lat[y1 * cells + x0] + (lat[y1 * cells + x1] - lat[y1 * cells + x0]) * u;
        out[y * size + x] += (a + (b - a) * v) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let k = 0; k < out.length; k++) out[k] /= norm;
  return out;
}

const TILE = 256;
let tiles: { land: Float32Array; cloud: Float32Array; wisp: Float32Array } | null = null;

function rgbOf(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Blurred coverage of some shapes: drawn small, then scaled up smoothly (red channel, 0–255). */
function coverage(w: number, h: number, down: number, draw: (ctx: CanvasRenderingContext2D, k: number) => void): Uint8ClampedArray {
  const sw = Math.max(8, Math.round(w / down)), sh = Math.max(4, Math.round(h / down));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sc = small.getContext('2d')!;
  sc.fillStyle = '#000';
  sc.fillRect(0, 0, sw, sh);
  draw(sc, sw / w);
  const big = document.createElement('canvas');
  big.width = w; big.height = h;
  const bc = big.getContext('2d')!;
  bc.imageSmoothingEnabled = true;
  bc.imageSmoothingQuality = 'high';
  bc.drawImage(small, 0, 0, w, h);
  return bc.getImageData(0, 0, w, h).data;
}

/**
 * Paint the equirectangular globe map (width = 2 × height). Coordinates follow the world frame:
 * x across the full width is longitude −180°…180°, y from 0 (north) to height (south). Region
 * cells are coarse polygons, so the coast is roughened with noise, the land mottled, and borders
 * are drawn only where two known regions meet.
 */
export function paintEarth(obs: Observation, w: number): HTMLCanvasElement {
  const h = Math.round(w / 2);
  const W = obs.world.width || 2000, H = obs.world.height || 1000;
  const sx = w / W, sy = h / H;
  const allKnown = obs.seat < 0;
  tiles ??= { land: noiseTile(TILE, 11, 5), cloud: noiseTile(TILE, 23, 5), wisp: noiseTile(TILE, 37, 4) };
  const regions = obs.regions.filter((r) => r.poly.length >= 3);
  const wrap = obs.world.wrap_x !== false;
  const offsets = wrap ? [-W, 0, W] : [0];
  const pathAt = (r: RegionView, ox: number, k: number): Path2D => {
    const p = new Path2D();
    r.poly.forEach(([x, y], i) => (i ? p.lineTo((x + ox) * sx * k, y * sy * k) : p.moveTo((x + ox) * sx * k, y * sy * k)));
    p.closePath();
    return p;
  };
  const shapes = (g: CanvasRenderingContext2D, k: number, grow = 0) => {
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineJoin = 'round';
    g.lineWidth = grow * sx * k;
    for (const r of regions) for (const ox of offsets) {
      const p = pathAt(r, ox, k);
      g.fill(p);
      if (grow) g.stroke(p);
    }
  };

  // 1. Each region's colour (land tinted by its owner), spread a little beyond its cell so the
  //    roughened coast always finds a colour.
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#8b9560';
  ctx.fillRect(0, 0, w, h);
  const colorOf = (r: RegionView) => {
    let col = landColor(r);
    const own = seatColor(obs, r.owner);
    if (own) col = mixHex(col, own, r.visibility === 'remembered' ? 0.18 : 0.32);
    return col;
  };
  ctx.lineJoin = 'round';
  ctx.lineWidth = 22 * sx;
  for (const r of regions) {
    ctx.strokeStyle = colorOf(r);
    for (const ox of offsets) ctx.stroke(pathAt(r, ox, 1));
  }
  for (const r of regions) {
    ctx.fillStyle = colorOf(r);
    for (const ox of offsets) ctx.fill(pathAt(r, ox, 1));
  }
  // Soften the cell edges: neighbouring terrains blend over a few pixels, as they would from orbit.
  const soft = document.createElement('canvas');
  soft.width = Math.round(w / 5); soft.height = Math.round(h / 5);
  const sctx = soft.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(c, 0, 0, soft.width, soft.height);
  ctx.globalAlpha = 0.72;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, w, h);
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // 2. Coverages: the land (lightly blurred, for the coast), the shelf, and the charted world.
  const land = coverage(w, h, 6, (g, k) => shapes(g, k));
  const shelf = coverage(w, h, 28, (g, k) => shapes(g, k, 10));
  const charted = allKnown ? null : coverage(w, h, 48, (g, k) => shapes(g, k, 70));

  // 3. One pass per pixel: sea or land, ice, clouds.
  const T = tiles;
  const deep = rgbOf(SEA_DEEP), sea = rgbOf(SEA), shelfC = rgbOf(SHELF);
  const ice = [238, 244, 247];
  const k1 = (TILE * 6) / w, k2 = (TILE * 2) / w, kc = (TILE * 3) / w, kw = (TILE * 8) / w;
  const seedOff = (obs.match_id.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0) % TILE;
  for (let y = 0; y < h; y++) {
    const alat = Math.abs(90 - ((y + 0.5) / h) * 180);
    const ty1 = (Math.floor(y * k1) % TILE) * TILE, ty2 = (Math.floor(y * k2) % TILE) * TILE;
    const tyc = ((Math.floor(y * kc * 1.6) + seedOff) % TILE) * TILE, tyw = ((Math.floor(y * kw * 1.8) + seedOff) % TILE) * TILE;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const n1 = T.land[ty1 + (Math.floor(x * k1) % TILE)];
      const n2 = T.land[ty2 + (Math.floor(x * k2) % TILE)];
      const m = land[o] / 255 + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.35;
      let r: number, g: number, b: number;
      if (m > 0.5) {
        const shade = 0.84 + n1 * 0.2 + (n2 - 0.5) * 0.16;
        r = px[o] * shade; g = px[o + 1] * shade; b = px[o + 2] * shade;
      } else {
        const near = Math.min(1, (shelf[o] / 255) * 1.7);
        const tw = near * near * 0.85;
        const d = 0.4 + n2 * 0.6;
        r = deep[0] + (sea[0] - deep[0]) * d; g = deep[1] + (sea[1] - deep[1]) * d; b = deep[2] + (sea[2] - deep[2]) * d;
        r += (shelfC[0] - r) * tw; g += (shelfC[1] - g) * tw; b += (shelfC[2] - b) * tw;
      }
      // Ice beyond 72°, with a ragged edge.
      const edge = 72 + (n1 - 0.5) * 5;
      if (alat > edge - 2) {
        const t = Math.min(1, (alat - (edge - 2)) / 3);
        r += (ice[0] - r) * t; g += (ice[1] - g) * t; b += (ice[2] - b) * t;
      }
      // Clouds: a heavy deck over the uncharted world, light weather over the rest.
      const cn = T.cloud[tyc + ((Math.floor(x * kc) + seedOff) % TILE)];
      const wn = T.wisp[tyw + ((Math.floor(x * kw) + seedOff) % TILE)];
      let ca = Math.max(0, (cn * 0.75 + wn * 0.25 - 0.55) * 2.2) * 0.75;
      if (charted) {
        const deck = Math.min(1, (1 - charted[o] / 255) * 1.6);
        ca = Math.max(ca, deck * (0.8 + (cn - 0.5) * 0.5 + (wn - 0.5) * 0.25));
      }
      if (ca > 0) {
        const a = Math.min(0.97, ca);
        const cv = 214 + cn * 36 + wn * 8;
        r += (cv - r) * a; g += (cv + 2 - g) * a; b += (cv + 8 - b) * a;
      }
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 4. Borders only where two known regions meet: faint between regions, darker between realms.
  const edges = new Map<string, { a: RegionView; b: RegionView | null; x0: number; y0: number; x1: number; y1: number }>();
  const q = (v: number) => Math.round(v * 2);
  for (const r of regions) {
    const n = r.poly.length;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = r.poly[i], [x1, y1] = r.poly[(i + 1) % n];
      const wx0 = wrap ? ((x0 % W) + W) % W : x0, wx1 = wrap ? ((x1 % W) + W) % W : x1;
      const ka = `${q(wx0)},${q(y0)}`, kb = `${q(wx1)},${q(y1)}`;
      const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const e = edges.get(key);
      if (e) { if (e.a !== r) e.b = r; } else edges.set(key, { a: r, b: null, x0, y0, x1, y1 });
    }
  }
  const inner = new Path2D(), realm = new Path2D();
  for (const e of edges.values()) {
    if (!e.b) continue;
    const target = e.a.owner !== e.b.owner ? realm : inner;
    for (const ox of offsets) {
      target.moveTo((e.x0 + ox) * sx, e.y0 * sy);
      target.lineTo((e.x1 + ox) * sx, e.y1 * sy);
    }
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(40,34,24,0.16)';
  ctx.lineWidth = Math.max(0.6, 0.9 * sx);
  ctx.stroke(inner);
  ctx.strokeStyle = 'rgba(30,22,14,0.55)';
  ctx.lineWidth = Math.max(1, 1.8 * sx);
  ctx.stroke(realm);

  // 5. Towns and cities as points of pale stone.
  ctx.fillStyle = 'rgba(250,244,226,0.9)';
  for (const r of regions) {
    const k = SETTLE_R[r.settlement];
    if (!k) continue;
    const [x, y] = r.city?.at ?? r.center;
    for (const ox of offsets) {
      ctx.beginPath();
      ctx.arc((x + ox) * sx, y * sy, Math.max(1, k * 1.8 * sx), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

/** Longitude and latitude (radians) of a world-frame point. */
export function worldToLonLat(obs: Observation, x: number, y: number): [number, number] {
  const W = obs.world.width || 2000, H = obs.world.height || 1000;
  let u = (x / W) % 1;
  if (u < 0) u += 1;
  return [u * Math.PI * 2 - Math.PI, Math.PI / 2 - (y / H) * Math.PI];
}

/** The world-frame point of a longitude and latitude (radians). */
export function lonLatToWorld(obs: Observation, lon: number, lat: number): [number, number] {
  const W = obs.world.width || 2000, H = obs.world.height || 1000;
  let u = (lon + Math.PI) / (Math.PI * 2);
  u -= Math.floor(u);
  return [u * W, ((Math.PI / 2 - lat) / Math.PI) * H];
}
