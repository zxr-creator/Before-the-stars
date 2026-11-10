// Ribbons draped over the heightfield: territory borders with an inward glow,
// region outlines for hover / selection / pick targets, inked internal borders,
// sea lanes and order arrows.
import * as THREE from 'three';
import { groundAt, type Heightfield } from './terrain';
import { resample, type Chain } from './topology';
import type { RGB } from './util';

export interface RibbonSpec {
  chain: Chain;
  color: RGB;
  /** Width in world units, measured inward from the chain. */
  width: number;
  /** Centre the ribbon on the chain instead of running it inward. */
  centered?: boolean;
  lift?: number;
  /** Lie at a fixed height (sea lanes) instead of following the ground. */
  level?: boolean;
}

export function ribbonGeometry(specs: RibbonSpec[], hf: Heightfield, step = 2.6): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], across: number[] = [], along: number[] = [], idx: number[] = [];
  const ROWS = 3;
  for (const sp of specs) {
    const pts = resample(sp.chain.pts, step, sp.chain.closed);
    const n = pts.length / 2;
    if (n < 2) continue;
    const lift = sp.lift ?? 0.55;
    const base = pos.length / 3;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const closed = sp.chain.closed;
      const ip = closed ? (i - 1 + n) % n : Math.max(0, i - 1), inx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      const x = pts[i * 2], z = pts[i * 2 + 1];
      let d0x = x - pts[ip * 2], d0z = z - pts[ip * 2 + 1], d1x = pts[inx * 2] - x, d1z = pts[inx * 2 + 1] - z;
      let l0 = Math.hypot(d0x, d0z), l1 = Math.hypot(d1x, d1z);
      if (l0 < 1e-6) { d0x = d1x; d0z = d1z; l0 = l1; }
      if (l1 < 1e-6) { d1x = d0x; d1z = d0z; l1 = l0; }
      if (l0 < 1e-6) { d0x = 1; d0z = 0; l0 = 1; d1x = 1; d1z = 0; l1 = 1; }
      // Left normals of both segments (x right, z toward the viewer): left of (dx, dz) is (dz, -dx).
      let nx = d0z / l0 + d1z / l1, nz = -d0x / l0 - d1x / l1;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
      const cosHalf = Math.max(0.45, (nx * d0z) / l0 + (nz * -d0x) / l0);
      const w = (sp.width / cosHalf) * sp.chain.side;
      if (i > 0) dist += Math.hypot(x - pts[i * 2 - 2], z - pts[i * 2 - 1]);
      for (let r = 0; r < ROWS; r++) {
        const t = r / (ROWS - 1);
        const o = sp.centered ? t - 0.5 : t;
        const px = x + nx * w * o, pz = z + nz * w * o;
        pos.push(px, (sp.level ? 0 : groundAt(hf, px, pz)) + lift, pz);
        col.push(sp.color[0], sp.color[1], sp.color[2]);
        across.push(sp.centered ? Math.abs(t - 0.5) * 2 : t);
        along.push(dist);
      }
    }
    const segs = sp.chain.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = base + i * ROWS, b = base + ((i + 1) % n) * ROWS;
      for (let r = 0; r < ROWS - 1; r++) idx.push(a + r, b + r, a + r + 1, a + r + 1, b + r, b + r + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  return g;
}

/** A free ribbon through explicit 3D points (order arrows): flat, with an arrow head. */
export function arcGeometry(arcs: { pts: number[]; color: RGB; width: number }[]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], across: number[] = [], along: number[] = [], idx: number[] = [];
  for (const a of arcs) {
    const n = a.pts.length / 3;
    if (n < 2) continue;
    const base = pos.length / 3;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const x = a.pts[i * 3], y = a.pts[i * 3 + 1], z = a.pts[i * 3 + 2];
      const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1);
      const dx = a.pts[j1 * 3] - a.pts[j0 * 3], dz = a.pts[j1 * 3 + 2] - a.pts[j0 * 3 + 2];
      const l = Math.hypot(dx, dz) || 1;
      const nx = dz / l, nz = -dx / l;
      if (i > 0) dist += Math.hypot(x - a.pts[i * 3 - 3], z - a.pts[i * 3 - 1]);
      // Taper into the head over the last points, then flare for the head itself.
      const head = i >= n - 4;
      const k = head ? ((n - 1 - i) / 3) * 2.6 : 1;
      const w = (a.width / 2) * k;
      pos.push(x + nx * w, y, z + nz * w, x, y, z, x - nx * w, y, z - nz * w);
      for (let r = 0; r < 3; r++) { col.push(a.color[0], a.color[1], a.color[2]); along.push(head ? -1 : dist); }
      across.push(1, 0, 1);
    }
    for (let i = 0; i < n - 1; i++) {
      const p = base + i * 3, q = p + 3;
      idx.push(p, q, p + 1, p + 1, q, q + 1, p + 1, q + 1, p + 2, p + 2, q + 1, q + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  return g;
}

/** River water: a ribbon that hugs the carved bed. `aUv` = (distance along, -1..1 across). */
export function riverGeometry(paths: { pts: number[]; hw: number[] }[], hf: Heightfield): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const rv of paths) {
    const n = rv.pts.length / 2;
    if (n < 2) continue;
    const base = pos.length / 3;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const x = rv.pts[i * 2], z = rv.pts[i * 2 + 1];
      const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1);
      const dx = rv.pts[j1 * 2] - rv.pts[j0 * 2], dz = rv.pts[j1 * 2 + 1] - rv.pts[j0 * 2 + 1];
      const l = Math.hypot(dx, dz) || 1;
      const nx = dz / l, nz = -dx / l;
      if (i > 0) dist += Math.hypot(x - rv.pts[i * 2 - 2], z - rv.pts[i * 2 - 1]);
      const w = rv.hw[i] * (i === 0 ? 0.55 : 1) * 1.12;
      // One level across: the highest of the bed samples, so the sheet never tilts into a bank.
      const y = Math.max(groundAt(hf, x, z), groundAt(hf, x + nx * w * 0.6, z + nz * w * 0.6), groundAt(hf, x - nx * w * 0.6, z - nz * w * 0.6)) + 0.42;
      for (let r = -1; r <= 1; r++) {
        pos.push(x + nx * w * r, y, z + nz * w * r);
        uv.push(dist, r);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const p = base + i * 3, q = p + 3;
      idx.push(p, q, p + 1, p + 1, q, q + 1, p + 1, q + 1, p + 2, p + 2, q + 1, q + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
