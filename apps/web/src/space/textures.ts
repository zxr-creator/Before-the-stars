// Procedural surface maps for the bodies (equirectangular canvases), and an orthographic disc
// renderer that turns any of them into a lit globe for the flat schematic. All original art:
// seeded noise and palettes, generated once per session on first use.
import type { BodyId } from './astro';

// --- seamless 3D value noise sampled on the sphere --------------------------------------------

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

export function fbm(x: number, y: number, z: number, seed: number, oct: number): number {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let k = 0; k < oct; k++) {
    s += a * vnoise(x * f, y * f, z * f, seed + k * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const band = (stops: RGB[], t: number): RGB => {
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
};

/** Paint an equirectangular map from a function of (unit vector, latitude). */
export function paintSphere(w: number, h: number, fn: (x: number, y: number, z: number, lat: number, lon: number) => RGB): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2 - Math.PI;
      const col = fn(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, lon);
      const o = (j * w + i) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function rocky(base: string, dark: string, light: string, seed: number, freq: number, opts: { maria?: number; caps?: string; capLat?: number; speck?: number } = {}) {
  const B = hex(base), D = hex(dark), Lt = hex(light);
  const cap = opts.caps ? hex(opts.caps) : null;
  return (x: number, y: number, z: number, lat: number): RGB => {
    const n = fbm(x * freq + 7, y * freq, z * freq, seed, 4);
    let c = n < 0.5 ? mix(D, B, n * 2) : mix(B, Lt, (n - 0.5) * 2);
    if (opts.maria) {
      const m = fbm(x * 1.6 + 3, y * 1.6, z * 1.6, seed + 99, 3);
      if (m > 1 - opts.maria) c = mix(c, D, clamp01((m - (1 - opts.maria)) * 9) * 0.75);
    }
    if (opts.speck) {
      const s = vnoise(x * 40, y * 40, z * 40, seed + 5);
      if (s > 1 - opts.speck) c = mix(c, Lt, 0.6);
    }
    if (cap && Math.abs(lat) > (opts.capLat ?? 1.3)) c = mix(c, cap, clamp01((Math.abs(lat) - (opts.capLat ?? 1.3)) * 8));
    return c;
  };
}

function banded(stops: string[], seed: number, turb: number, bands: number, spot?: { lat: number; lon: number; r: number; color: string }) {
  const S = stops.map(hex);
  const SP = spot ? hex(spot.color) : null;
  return (x: number, y: number, z: number, lat: number, lon: number): RGB => {
    const n = fbm(x * 3 + 11, y * 9, z * 3, seed, 3);
    const t = 0.5 + 0.5 * Math.sin(lat * bands + (n - 0.5) * turb * 6);
    let c = band(S, t * 0.85 + n * 0.15);
    if (spot && SP) {
      const dl = lon - spot.lon, dp = lat - spot.lat;
      const r = Math.hypot(dl * 0.55, dp * 1.1);
      if (r < spot.r) c = mix(c, SP, clamp01((spot.r - r) / spot.r * 2.2) * 0.85);
    }
    return c;
  };
}

const PAINTERS: Partial<Record<BodyId, () => HTMLCanvasElement>> = {
  mercury: () => paintSphere(256, 128, rocky('#8d867c', '#5f5953', '#b9b2a6', 11, 5, { speck: 0.03 })),
  venus: () => paintSphere(256, 128, banded(['#d9b979', '#ead39c', '#f3e3bb', '#dcc08a'], 21, 1.6, 7)),
  moon: () => paintSphere(256, 128, rocky('#a8a49c', '#615e5a', '#d0ccc4', 31, 6, { maria: 0.32, speck: 0.02 })),
  mars: () => paintSphere(256, 128, rocky('#bb6a42', '#6f3826', '#d99566', 41, 3.2, { maria: 0.25, caps: '#f3eee6', capLat: 1.28 })),
  ceres: () => paintSphere(192, 96, rocky('#86827b', '#56534f', '#aaa59c', 51, 5, { speck: 0.012 })),
  vesta: () => paintSphere(192, 96, rocky('#9c917e', '#665d50', '#c4b9a3', 61, 4)),
  psyche: () => paintSphere(192, 96, rocky('#9d9890', '#5f5c58', '#cfcac0', 71, 6)),
  jupiter: () => paintSphere(512, 256, banded(['#b98a62', '#e7d6bb', '#a8724f', '#f2e9d8', '#c9a27c', '#ece0c8'], 81, 1.1, 11, { lat: -0.38, lon: 0.6, r: 0.16, color: '#b5523a' })),
  io: () => paintSphere(192, 96, rocky('#dcbb54', '#8a5a2a', '#f3e6a6', 91, 5, { maria: 0.18, speck: 0.03 })),
  europa: () => paintSphere(192, 96, (x, y, z) => {
    const n = fbm(x * 4, y * 4, z * 4, 101, 3);
    const r = Math.abs(fbm(x * 7 + 3, y * 7, z * 7, 103, 3) - 0.5);
    const c = mix(hex('#cbbfa8'), hex('#eee8dc'), n);
    return r < 0.03 ? mix(c, hex('#8d5b3e'), 0.7) : c;
  }),
  ganymede: () => paintSphere(192, 96, rocky('#a39887', '#6b6255', '#cfc7b8', 111, 3.5, { maria: 0.4 })),
  callisto: () => paintSphere(192, 96, rocky('#5f574d', '#3e3832', '#8c8274', 121, 4, { speck: 0.05 })),
  saturn: () => paintSphere(512, 256, banded(['#d8bf88', '#efe0b8', '#cdb07a', '#f4e9cb', '#dcc596'], 131, 0.6, 9)),
  titan: () => paintSphere(192, 96, banded(['#c98a3e', '#dba35a', '#d39548'], 141, 0.5, 4)),
  enceladus: () => paintSphere(192, 96, (x, y, z, lat) => {
    const n = fbm(x * 5, y * 5, z * 5, 151, 3);
    const c = mix(hex('#dfe6ea'), hex('#ffffff'), n);
    return lat < -1.0 && Math.abs(Math.sin(x * 9 + z * 5)) < 0.12 ? mix(c, hex('#7fb4d6'), 0.6) : c;
  }),
  uranus: () => paintSphere(256, 128, banded(['#9fd3d8', '#b3e1e4', '#a6d8dc'], 161, 0.3, 6)),
  neptune: () => paintSphere(256, 128, banded(['#3557ad', '#4a72cc', '#3a62bb', '#5b84d8'], 171, 0.7, 8, { lat: -0.35, lon: -1.2, r: 0.13, color: '#1e3474' })),
  triton: () => paintSphere(192, 96, rocky('#cdb6ad', '#9a8079', '#efe2dc', 181, 4, { caps: '#f6eeea', capLat: -10 })),
};

const cache = new Map<BodyId, HTMLCanvasElement>();

/** The surface map of a body (the Earth's comes from the match, see globe.ts). */
export function bodyTexture(id: BodyId): HTMLCanvasElement | null {
  let c = cache.get(id);
  if (c) return c;
  const p = PAINTERS[id];
  if (!p) return null;
  c = p();
  cache.set(id, c);
  return c;
}

/** Saturn's rings as a radial strip (inner → outer, with alpha). */
export function ringTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 4;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(256, 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const gap = t > 0.62 && t < 0.67 ? 0.08 : 1; // the Cassini division
    const a = (0.35 + 0.55 * fbm(t * 40, 1, 1, 7, 3)) * gap * (t < 0.06 ? t / 0.06 : 1) * (t > 0.96 ? (1 - t) / 0.04 : 1);
    const col = mix(hex('#b9a27a'), hex('#efe2c2'), fbm(t * 25, 2, 2, 9, 2));
    for (let j = 0; j < 4; j++) {
      const o = (j * 256 + i) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(a * 235);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * A lit globe as seen from the side: `lon0`/`lat0` face the viewer, `light` is the direction to
 * the Sun in disc space (x right, y down, z towards the viewer). Optional atmosphere rim.
 */
export function renderDisc(tex: HTMLCanvasElement, size: number, lon0: number, lat0: number, light: [number, number, number], atmo?: string): HTMLCanvasElement {
  const src = tex.getContext('2d')!.getImageData(0, 0, tex.width, tex.height);
  const tw = tex.width, th = tex.height, sd = src.data;
  const pad = atmo ? Math.ceil(size * 0.06) : 1;
  const S = size + pad * 2;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  c.dataset.globe = String(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const r = size / 2, cx = S / 2, cy = S / 2;
  const ll = Math.hypot(light[0], light[1], light[2]) || 1;
  const lx = light[0] / ll, ly = light[1] / ll, lz = light[2] / ll;
  const cp = Math.cos(lat0), sp = Math.sin(lat0);
  const A = atmo ? hex(atmo) : null;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const nx = (i + 0.5 - cx) / r, ny = (j + 0.5 - cy) / r;
      const rr = nx * nx + ny * ny;
      const o = (j * S + i) * 4;
      if (rr > 1) {
        if (A) {
          const dd = Math.sqrt(rr) - 1;
          const rim = Math.max(0, 1 - dd / 0.11);
          if (rim > 0) {
            const lit = clamp01(0.35 + 0.65 * ((nx * lx + ny * ly) / Math.sqrt(rr) + 0.6));
            d[o] = A[0]; d[o + 1] = A[1]; d[o + 2] = A[2]; d[o + 3] = Math.round(rim * rim * 150 * lit);
          }
        }
        continue;
      }
      const nz = Math.sqrt(1 - rr);
      // Rotate the view vector back to the body frame: tilt by lat0 about x, then longitude.
      const by = -ny * cp + nz * sp;
      const bz = ny * sp + nz * cp;
      const lat = Math.asin(Math.max(-1, Math.min(1, by)));
      const lon = Math.atan2(nx, bz) + lon0;
      let u = ((lon + Math.PI) / (2 * Math.PI)) % 1;
      if (u < 0) u += 1;
      const v = (Math.PI / 2 - lat) / Math.PI;
      const si = (Math.min(th - 1, Math.floor(v * th)) * tw + Math.min(tw - 1, Math.floor(u * tw))) * 4;
      const ndl = nx * lx + ny * ly + nz * lz;
      const shade = 0.13 + 0.87 * clamp01(ndl * 1.15 + 0.12);
      const limb = 0.82 + 0.18 * nz;
      let R = sd[si] * shade * limb, G = sd[si + 1] * shade * limb, Bc = sd[si + 2] * shade * limb;
      if (A) {
        const f = Math.pow(1 - nz, 2.2) * 0.55 * clamp01(ndl + 0.5);
        R += (A[0] - R) * f; G += (A[1] - G) * f; Bc += (A[2] - Bc) * f;
      }
      const edge = clamp01((1 - Math.sqrt(rr)) * r * 1.2);
      d[o] = R; d[o + 1] = G; d[o + 2] = Bc; d[o + 3] = Math.round(255 * edge);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
