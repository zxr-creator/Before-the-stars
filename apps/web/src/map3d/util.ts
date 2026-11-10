// Small numeric helpers shared by the 3D map: seeded hashing, value noise, colour
// maths and an exact distance transform. No three.js imports here.

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function hash32(a: number, b = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) + Math.imul(b | 0, 0x85ebca6b) + 0x27d4eb2f;
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

function lattice(ix: number, iy: number, seed: number): number {
  return hash32(ix * 73856093 + seed, iy * 19349663 + seed * 31) / 4294967296;
}

/** Smooth value noise in [0,1]. */
export function vnoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal value noise in [0,1]. */
export function fbm(x: number, y: number, octaves: number, seed = 0): number {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Ridged fractal noise in [0,1]: sharp crests, broad valleys. */
export function ridged(x: number, y: number, octaves: number, seed = 0): number {
  let amp = 0.5, sum = 0, norm = 0, f = 1, prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(vnoise(x * f, y * f, seed + o * 31) * 2 - 1);
    n *= n;
    sum += amp * n * prev;
    norm += amp;
    prev = clamp(n * 1.6, 0, 1);
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

// --- colour ------------------------------------------------------------------------

export type RGB = [number, number, number];

/** "#rrggbb" → sRGB components in 0..1. */
export function hexRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return [0.42, 0.38, 0.34];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function scaleRgb(a: RGB, k: number): RGB {
  return [clamp(a[0] * k, 0, 1), clamp(a[1] * k, 0, 1), clamp(a[2] * k, 0, 1)];
}
export function luma(a: RGB): number {
  return a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11;
}
/** Desaturate toward a warm sepia; `t`=1 is fully sepia. */
export function sepia(a: RGB, t: number): RGB {
  const l = luma(a);
  return mixRgb(a, [clamp(l * 1.06 + 0.04, 0, 1), clamp(l * 0.98 + 0.03, 0, 1), clamp(l * 0.84 + 0.02, 0, 1)], t);
}
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** sRGB triple → linear triple (for vertex colours fed to three.js materials). */
export function toLinear(a: RGB): RGB {
  return [srgbToLinear(a[0]), srgbToLinear(a[1]), srgbToLinear(a[2])];
}
export function rgbCss(a: RGB, alpha = 1): string {
  const r = Math.round(clamp(a[0], 0, 1) * 255), g = Math.round(clamp(a[1], 0, 1) * 255), b = Math.round(clamp(a[2], 0, 1) * 255);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

// --- geometry -----------------------------------------------------------------------

export function pointInPoly(pts: ArrayLike<number>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher). `seed[i]` non-zero
 * marks a source cell. Returns distances in cells.
 */
export function distanceTransform(seed: Uint8Array, nx: number, ny: number): Float32Array {
  const INF = 1e20;
  const out = new Float32Array(nx * ny);
  const n = Math.max(nx, ny);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = 0;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k] && k > 0) k--; else break;
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) f[y] = seed[y * nx + x] ? 0 : INF;
    pass(ny);
    for (let y = 0; y < ny; y++) out[y * nx + x] = d[y];
  }
  for (let y = 0; y < ny; y++) {
    const row = y * nx;
    for (let x = 0; x < nx; x++) f[x] = out[row + x];
    pass(nx);
    for (let x = 0; x < nx; x++) out[row + x] = Math.sqrt(d[x]);
  }
  return out;
}

/** In-place separable box blur, `passes` times, radius in cells. Optional weight mask for normalised blur. */
export function boxBlur(a: Float32Array, nx: number, ny: number, radius: number, passes: number): void {
  const tmp = new Float32Array(Math.max(nx, ny));
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < ny; y++) {
      const row = y * nx;
      let acc = 0;
      for (let x = -radius; x <= radius; x++) acc += a[row + clamp(x, 0, nx - 1)];
      for (let x = 0; x < nx; x++) {
        tmp[x] = acc / (2 * radius + 1);
        acc += a[row + Math.min(nx - 1, x + radius + 1)] - a[row + Math.max(0, x - radius)];
      }
      for (let x = 0; x < nx; x++) a[row + x] = tmp[x];
    }
    for (let x = 0; x < nx; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += a[clamp(y, 0, ny - 1) * nx + x];
      for (let y = 0; y < ny; y++) {
        tmp[y] = acc / (2 * radius + 1);
        acc += a[Math.min(ny - 1, y + radius + 1) * nx + x] - a[Math.max(0, y - radius) * nx + x];
      }
      for (let y = 0; y < ny; y++) a[y * nx + x] = tmp[y];
    }
  }
}
