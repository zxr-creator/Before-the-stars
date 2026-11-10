// Original low-poly models for settlements, districts and improvements. Every
// structure is assembled in code from Builder primitives. Architecture follows a
// rough era (0 timber and thatch, 1 masonry, 2 industrial brick, 3 electrified,
// 4 orbital age) that the caller derives from facilities that actually exist.
import type { Deposit, SettlementKind } from '../protocol';
import { Builder } from './builder';
import { mixRgb, rng, scaleRgb, type RGB } from './util';

export type Ground = (x: number, z: number) => number;

/** Collects chimney tops for the animated smoke layer: x, y, z, size. */
export interface Fx { smoke: number[] }

const WOOD: RGB = [0.5, 0.36, 0.22];
const WOOD_LIGHT: RGB = [0.72, 0.56, 0.36];
const WOOD_DARK: RGB = [0.34, 0.25, 0.17];
const THATCH: RGB = [0.86, 0.72, 0.38];
const STONE: RGB = [0.74, 0.71, 0.64];
const STONE_DARK: RGB = [0.55, 0.53, 0.5];
const PLASTER: RGB = [0.95, 0.9, 0.78];
const BRICK: RGB = [0.72, 0.4, 0.3];
const SLATE: RGB = [0.36, 0.4, 0.47];
const CONCRETE: RGB = [0.86, 0.86, 0.83];
const GLASS: RGB = [0.45, 0.72, 0.88];
const WHITE: RGB = [0.96, 0.97, 0.98];
const TEAL: RGB = [0.25, 0.78, 0.8];
const GOLD: RGB = [0.95, 0.76, 0.26];
const IRON: RGB = [0.3, 0.32, 0.36];
const DIRT: RGB = [0.72, 0.6, 0.42];
const PAVING: RGB = [0.8, 0.76, 0.66];
const CANVAS: RGB = [0.94, 0.89, 0.76];
const SOOT: RGB = [0.2, 0.19, 0.2];
const WATER: RGB = [0.3, 0.66, 0.8];
const FIRE: RGB = [1.0, 0.6, 0.15];
const RED: RGB = [0.82, 0.25, 0.2];

interface EraStyle { walls: RGB[]; roofs: RGB[]; glass: RGB; trim: RGB }
const ERAS: EraStyle[] = [
  { walls: [WOOD_LIGHT, [0.66, 0.5, 0.32], [0.78, 0.64, 0.44]], roofs: [THATCH, [0.78, 0.62, 0.3]], glass: WOOD_DARK, trim: WOOD },
  { walls: [PLASTER, [0.9, 0.82, 0.68], [0.86, 0.84, 0.76]], roofs: [[0.82, 0.4, 0.24], [0.74, 0.34, 0.2]], glass: [0.3, 0.3, 0.34], trim: STONE },
  { walls: [BRICK, [0.8, 0.5, 0.36], [0.88, 0.8, 0.68]], roofs: [SLATE, [0.44, 0.38, 0.36]], glass: [0.26, 0.3, 0.36], trim: STONE_DARK },
  { walls: [CONCRETE, [0.8, 0.82, 0.84], [0.9, 0.86, 0.78]], roofs: [[0.6, 0.63, 0.66], [0.5, 0.54, 0.58]], glass: GLASS, trim: [0.7, 0.72, 0.74] },
  { walls: [WHITE, [0.88, 0.93, 0.95], [0.94, 0.94, 0.9]], roofs: [TEAL, [0.82, 0.86, 0.9]], glass: [0.4, 0.86, 0.92], trim: WHITE },
];
export const DEPOSIT_RGB: Record<Deposit, RGB> = {
  copper_ore: [0.82, 0.48, 0.22],
  iron_ore: [0.5, 0.54, 0.6],
  coal: [0.16, 0.15, 0.16],
  crude: [0.22, 0.16, 0.14],
  minerals: [0.56, 0.42, 0.82],
};

export function settlementRadius(kind: SettlementKind): number {
  return kind === 'camp' ? 6 : kind === 'village' ? 9.5 : kind === 'town' ? 13 : kind === 'city' ? 18.5 : kind === 'metropolis' ? 25 : 0;
}

/** Fan of triangles that follows the ground: worn earth, plazas, yards. */
export function drapeDisc(b: Builder, G: Ground, cx: number, cz: number, r: number, color: RGB, lift = 0.14, sides = 12, squash = 1, rot = 0): void {
  const c = Math.cos(rot), s = Math.sin(rot);
  const ring = (k: number, rr: number): number[] => {
    const a = (k / sides) * Math.PI * 2;
    const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr * squash;
    const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
    return [x, G(x, z) + lift, z];
  };
  const mid = [cx, G(cx, cz) + lift, cz];
  for (let k = 0; k < sides; k++) {
    const a0 = ring(k, r * 0.55), a1 = ring(k + 1, r * 0.55), b0 = ring(k, r), b1 = ring(k + 1, r);
    b.tri(mid, a1, a0, color);
    b.quad(a0, a1, b1, b0, color);
  }
}

/** Rectangle that follows the ground, optionally striped along its depth (furrows). */
export function drapeRect(b: Builder, G: Ground, cx: number, cz: number, w: number, d: number, rot: number, colors: RGB[], lift = 0.16, rows = 1): void {
  const c = Math.cos(rot), s = Math.sin(rot);
  const nxs = Math.max(2, Math.round(w / 3.2));
  const at = (u: number, v: number): number[] => {
    const lx = (u - 0.5) * w, lz = (v - 0.5) * d;
    const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
    return [x, G(x, z) + lift, z];
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < nxs; i++) {
      const u0 = i / nxs, u1 = (i + 1) / nxs, v0 = j / rows, v1 = (j + 1) / rows;
      b.quad(at(u0, v0), at(u0, v1), at(u1, v1), at(u1, v0), colors[j % colors.length]);
    }
  }
}

// --- single buildings (local frame: origin at ground, +X is the long side) ----------------

function hut(b: Builder, r: number, wall: RGB, roof: RGB): void {
  b.cyl(0, 0, 0, r, r * 0.92, r * 0.9, 7, wall);
  b.cyl(0, r * 0.8, 0, r * 1.3, 0, r * 1.25, 7, roof);
}

function house(b: Builder, w: number, d: number, h: number, wall: RGB, roof: RGB, era: number, chimney = false): void {
  if (era >= 3) {
    b.box(0, 0, 0, w, h, d, wall);
    b.box(0, h * 0.45, 0, w + 0.06, h * 0.22, d + 0.06, ERAS[era].glass);
    b.box(0, h, 0, w + 0.3, 0.25, d + 0.3, roof);
    return;
  }
  b.box(0, 0, 0, w, h, d, wall);
  b.gable(0, h, 0, w, Math.min(w, d) * 0.55 + 0.3, d, roof, 0, 0.28, wall);
  if (chimney) b.box(w * 0.25, h, d * 0.18, 0.5, Math.min(w, d) * 0.55 + 0.8, 0.5, era === 0 ? STONE_DARK : BRICK);
}

function tower(b: Builder, w: number, floors: number, style: EraStyle, cap: RGB, era: number): number {
  let y = 0;
  const fh = 1.7;
  for (let f = 0; f < floors; f++) {
    const k = 1 - (f / floors) * (era >= 4 ? 0.34 : 0.18);
    b.box(0, y, 0, w * k, fh * 0.62, w * k, style.walls[f % 2]);
    b.box(0, y + fh * 0.62, 0, w * k * 0.94, fh * 0.38, w * k * 0.94, style.glass);
    y += fh;
  }
  if (era >= 4) {
    b.dome(0, y, 0, w * 0.36, cap, 6, 2, 1.5);
    b.box(0, y + w * 0.4, 0, 0.14, 3.2, 0.14, WHITE);
  } else if (era >= 3) {
    b.box(0, y, 0, w * 0.7, 0.5, w * 0.7, cap);
    b.box(w * 0.15, y + 0.5, 0, 0.14, 2.4, 0.14, IRON);
  } else {
    b.hip(0, y, 0, w * 0.82, w * 0.9, w * 0.82, cap, 0, 0, 0.3);
  }
  return y;
}

function wallRing(b: Builder, G: Ground, cx: number, cz: number, R: number, n: number, h: number, wall: RGB, cap: RGB, gateAt: number, towers: boolean): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const rr = R * (0.96 + 0.08 * Math.sin(i * 2.3));
    pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
  }
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n];
    if (i !== gateAt) {
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const y = Math.min(G(x0, z0), G(x1, z1), G(mx, mz)) - 0.3;
      b.box(mx, y, mz, len + 0.3, h + 0.3, 0.9, wall, -Math.atan2(z1 - z0, x1 - x0), 1, scaleRgb(wall, 1.08));
    }
    if (towers && (i % 2 === 0 || i === gateAt || i === (gateAt + 1) % n)) {
      const y = G(x0, z0) - 0.3;
      b.cyl(x0, y, z0, 1.25, 1.15, h + 1.6, 6, wall);
      b.cyl(x0, y + h + 1.6, z0, 1.6, 0, 1.6, 6, cap);
    }
  }
}

export interface SettlementOpts {
  kind: SettlementKind;
  era: number;
  /** Owner colour (sRGB), or a neutral tone when nobody is known to govern. */
  color: RGB;
  capital: boolean;
  seed: number;
  /** No fire, smoke or flags in motion: a last-known picture only. */
  remembered: boolean;
}

/** Height of the tallest structure, for label and marker placement. */
export function settlementHeight(kind: SettlementKind, era: number, capital: boolean): number {
  const base = kind === 'camp' ? 4 : kind === 'village' ? 5 : kind === 'town' ? 8.5 : kind === 'city' ? 13 : kind === 'metropolis' ? 20 : 0;
  return base + (kind === 'city' || kind === 'metropolis' ? era * 1.6 : 0) + (capital && (kind === 'city' || kind === 'metropolis') ? 6 : 0);
}

export function buildSettlement(b: Builder, G: Ground, cx: number, cz: number, o: SettlementOpts, fx: Fx): void {
  const rand = rng(o.seed);
  const era = Math.max(0, Math.min(4, o.era));
  const st = ERAS[era];
  const R = settlementRadius(o.kind);
  const own = o.color;
  const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];
  const roofFor = (): RGB => {
    const base = pick(st.roofs);
    const v = rand();
    return v < 0.3 ? mixRgb(own, [0.2, 0.14, 0.1], 0.08) : mixRgb(base, own, era >= 3 ? 0.12 : 0.3);
  };
  const g0 = G(cx, cz);
  if (o.kind === 'wilderness') return;

  if (o.kind === 'camp') {
    drapeDisc(b, G, cx, cz, R * 0.95, DIRT, 0.12, 10);
    const n = 4 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.5;
      const d = 3.3 + rand() * 1.4;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      b.push(x, G(x, z), z, -a + Math.PI / 2);
      b.gable(0, 0, 0, 2.5, 2.1, 2.7, i % 2 ? CANVAS : mixRgb(CANVAS, own, 0.35), 0, 0, mixRgb(own, [0.2, 0.15, 0.1], 0.2));
      b.pop();
    }
    b.push(cx, g0, cz);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.box(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75, 0.4, 0.28, 0.4, STONE_DARK, a);
    }
    if (!o.remembered) {
      b.cyl(0, 0.1, 0, 0.5, 0, 1.1, 5, FIRE);
      fx.smoke.push(cx, g0 + 1.2, cz, 0.55);
    }
    b.pop();
    b.flag(cx + 1.6, G(cx + 1.6, cz - 1.2), cz - 1.2, 4.6, own, 0.4, 0.9);
    return;
  }

  if (o.kind === 'village') {
    drapeDisc(b, G, cx, cz, R * 0.95, DIRT, 0.12, 12);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const ring = i < 3 ? 0 : 1;
      const a = (i / (ring ? 5 : 3)) * Math.PI * 2 + rand() * 0.6 + ring * 0.5;
      const d = ring ? 6.1 + rand() * 0.9 : 2.9 + rand() * 0.6;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      b.push(x, G(x, z) - 0.05, z, -a + (rand() - 0.5) * 0.5);
      if (era === 0) hut(b, 1.15 + rand() * 0.35, pick(st.walls), roofFor());
      else house(b, 2.5 + rand() * 0.8, 2 + rand() * 0.5, 1.5 + rand() * 0.4, pick(st.walls), roofFor(), Math.min(era, 2), rand() < 0.4);
      b.pop();
    }
    // Palisade with a gate gap.
    const posts = 30;
    for (let i = 0; i < posts; i++) {
      if (i % posts < 2) continue;
      const a = (i / posts) * Math.PI * 2;
      const x = cx + Math.cos(a) * (R - 0.6), z = cz + Math.sin(a) * (R - 0.6);
      b.cyl(x, G(x, z) - 0.2, z, 0.28, 0.2, 1.9 + (i % 3) * 0.15, 4, era === 0 ? WOOD : STONE, undefined, a);
    }
    b.push(cx, g0, cz);
    b.cyl(0, 0, 0, 0.7, 0.7, 0.6, 6, STONE_DARK, WATER);
    b.pop();
    b.flag(cx - 1.4, G(cx - 1.4, cz + 1), cz + 1, 5.4, own, 0.3, 1);
    if (!o.remembered) fx.smoke.push(cx + 2.4, g0 + 2.6, cz - 1.8, 0.45);
    return;
  }

  // --- town, city, metropolis ------------------------------------------------------
  const big = o.kind === 'city' || o.kind === 'metropolis';
  const metro = o.kind === 'metropolis';
  drapeDisc(b, G, cx, cz, R * (era <= 2 && big ? 0.98 : 1.02), era >= 3 ? [0.74, 0.74, 0.72] : PAVING, 0.12, 16);
  const plaza = metro ? 5.2 : big ? 4.2 : 3;
  const count = metro ? 58 : big ? 36 : 17;
  const rings = metro ? 5 : big ? 4 : 3;
  const inner = plaza + 1.6;
  const outer = R - (era <= 2 && big ? 3 : 1.6);
  let placed = 0;
  for (let ring = 0; ring < rings; ring++) {
    const rr = inner + ((outer - inner) * ring) / Math.max(1, rings - 1);
    const slots = Math.max(5, Math.round((rr * Math.PI * 2) / (era >= 3 ? 4.6 : 3.9)));
    const off = rand() * Math.PI * 2;
    for (let i = 0; i < slots && placed < count; i++) {
      // Leave four avenues open from the plaza to the edge.
      const a = off + (i / slots) * Math.PI * 2;
      const avenue = Math.abs(Math.sin(a * 2 + 0.6));
      if (avenue < 0.16 && ring > 0) continue;
      const d = rr + (rand() - 0.5) * 0.9;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const core = 1 - ring / rings;
      const tall = (metro ? 1.5 : big ? 1.15 : 0.9) * (0.7 + core * 0.9) * (1 + era * 0.16);
      b.push(x, G(x, z) - 0.08, z, -a + Math.PI / 2 + (rand() - 0.5) * 0.25);
      const w = 2.5 + rand() * 1.1, dd = 2.2 + rand() * 0.7;
      if (era >= 3 && rand() < 0.3 + core * 0.4) {
        tower(b, 2.3 + rand() * 0.6, Math.max(2, Math.round(tall * (2 + rand() * 2.2))), st, rand() < 0.5 ? own : pick(st.roofs), era);
      } else {
        house(b, w, dd, (1.5 + rand() * 0.9) * tall, pick(st.walls), roofFor(), era, era === 2 && rand() < 0.5);
      }
      b.pop();
      placed++;
    }
  }
  // Civic hall on the plaza, in the owner's colour.
  b.push(cx, g0, cz, 0.35);
  if (era <= 2) {
    const hw = metro ? 5.4 : big ? 4.6 : 3.6;
    b.box(0, 0, -plaza * 0.35, hw, big ? 3.2 : 2.5, hw * 0.62, st.walls[0]);
    b.gable(0, big ? 3.2 : 2.5, -plaza * 0.35, hw, hw * 0.34 + 0.5, hw * 0.62, own, 0, 0.35, st.walls[0]);
    b.push(hw * 0.5 + 0.3, 0, -plaza * 0.35);
    b.box(0, 0, 0, 1.5, big ? 6 : 4.4, 1.5, st.walls[1 % st.walls.length]);
    b.hip(0, big ? 6 : 4.4, 0, 1.5, 2.1, 1.5, own, 0, 0, 0.3);
    b.pop();
  } else {
    b.box(0, 0, -plaza * 0.3, 5.2, 2.2, 3.4, st.walls[0]);
    b.box(0, 2.2, -plaza * 0.3, 4.2, 1.6, 2.6, st.glass);
    b.box(0, 3.8, -plaza * 0.3, 4.6, 0.3, 3, own);
  }
  // Market stalls with striped awnings.
  if (era <= 2) {
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const a = 1.2 + i * 0.75;
      const x = Math.cos(a) * plaza * 0.72, z = Math.sin(a) * plaza * 0.72;
      b.push(x, 0, z, -a);
      b.box(0, 0, 0, 1.1, 0.5, 0.7, WOOD_LIGHT);
      b.quad([-0.75, 1.5, -0.55], [0.75, 1.5, -0.55], [0.75, 1.05, 0.6], [-0.75, 1.05, 0.6], i % 2 ? own : CANVAS);
      b.box(-0.65, 0, -0.5, 0.1, 1.5, 0.1, WOOD);
      b.box(0.65, 0, -0.5, 0.1, 1.5, 0.1, WOOD);
      b.pop();
    }
  } else {
    b.cyl(plaza * 0.5, 0, plaza * 0.45, 1.5, 1.5, 0.25, 8, STONE, WATER);
  }
  b.pop();

  if (big) {
    // Skyline: taller landmarks near the centre.
    const spires = (metro ? 6 : 3) + (era >= 3 ? 2 : 0);
    for (let i = 0; i < spires; i++) {
      const a = rand() * Math.PI * 2;
      const d = plaza + 1.5 + rand() * (metro ? 7 : 4);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      b.push(x, G(x, z) - 0.1, z, rand() * 1.5);
      const floors = Math.round((metro ? 4.5 : 3.2) + rand() * 2.5 + era * (metro ? 1.5 : 0.9));
      tower(b, 2 + rand() * 0.9, floors, st, i % 2 ? own : pick(st.roofs), era);
      b.pop();
    }
    if (era <= 2) wallRing(b, G, cx, cz, R - 0.6, metro ? 16 : 12, metro ? 2.9 : 2.5, era === 0 ? WOOD : STONE, own, 3, true);
  } else if (era >= 1) {
    wallRing(b, G, cx, cz, R - 0.4, 12, 1.1, era >= 3 ? [0.4, 0.62, 0.3] : STONE, own, 3, false);
  }

  // Landmark: the seat of government of a capital city, or a metropolis's great work.
  if ((o.capital && big) || metro) {
    const x = cx - plaza * 0.9, z = cz + plaza * 0.75;
    const s = o.capital && metro ? 1.25 : o.capital ? 1.05 : 0.9;
    b.push(x, G(x, z) - 0.1, z, 0.5, s);
    if (era <= 2) {
      // Stepped rotunda with a gilded dome and four slender spires.
      b.cyl(0, 0, 0, 4.6, 4.4, 1.0, 8, STONE);
      b.cyl(0, 1.0, 0, 3.6, 3.4, 3.4, 8, era === 0 ? WOOD_LIGHT : PLASTER);
      b.cyl(0, 4.4, 0, 3.9, 3.7, 0.5, 8, own);
      b.dome(0, 4.9, 0, 3.3, GOLD, 8, 3, 1.15);
      b.cyl(0, 8.5, 0, 0.3, 0, 2.6, 5, GOLD);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        b.cyl(Math.cos(a) * 4.3, 0, Math.sin(a) * 4.3, 0.55, 0.45, 6.6, 6, era === 0 ? WOOD : PLASTER);
        b.cyl(Math.cos(a) * 4.3, 6.6, Math.sin(a) * 4.3, 0.75, 0, 2, 6, own);
      }
    } else {
      // Tiered spire tower with a crown ring.
      let y = 0;
      const tiers = era >= 4 ? 6 : 5;
      for (let t = 0; t < tiers; t++) {
        const w = 5 - t * 0.72;
        b.box(0, y, 0, w, 2.6, w, t % 2 ? st.glass : st.walls[0], t * 0.26, 0.92);
        y += 2.6;
        b.box(0, y, 0, w * 0.98, 0.3, w * 0.98, own, t * 0.26);
        y += 0.3;
      }
      b.torus(0, y + 0.8, 0, 2.2, 0.28, GOLD, 10, 4, 'y');
      b.cyl(0, y, 0, 0.5, 0, 6.5, 5, era >= 4 ? TEAL : WHITE);
    }
    b.pop();
  }
  // Capital standard: a tall pole with a gold star and a long pennant.
  if (o.capital) {
    const hgt = settlementHeight(o.kind, era, false) + 5;
    b.push(cx + plaza * 0.55, g0, cz + plaza * 0.2);
    b.box(0, 0, 0, 0.26, hgt, 0.26, WOOD_DARK);
    b.quad([0.13, hgt - 0.4, 0], [4.2, hgt - 1.1, 0], [4.2, hgt - 1.6, 0], [0.13, hgt - 2.6, 0], own);
    b.cyl(0, hgt, 0, 0.8, 0, 1.0, 4, GOLD);
    b.push(0, hgt, 0); b.cyl(0, 0, 0, 0.8, 0, -1.0, 4, GOLD); b.pop();
    b.pop();
  }
  if (!o.remembered) {
    fx.smoke.push(cx + plaza + 2, g0 + 4.2, cz - 2, 0.5);
    if (big && era === 2) fx.smoke.push(cx - plaza - 3, g0 + 5, cz + 3, 0.7);
  }
}

// --- districts and improvements ---------------------------------------------------------

export type DistrictKind =
  | 'fields' | 'pasture' | 'fishery' | 'granary' | 'timber' | 'mine' | 'oilwell' | 'workshop' | 'industry' | 'chemical'
  | 'hightech' | 'mill' | 'thermal' | 'hydro' | 'grid' | 'nuclear' | 'fusion' | 'rectenna' | 'port' | 'depot' | 'health'
  | 'waterworks' | 'admin' | 'barracks' | 'holy' | 'school' | 'research' | 'collider' | 'launch' | 'dishes' | 'jump';

export interface DistrictOpts {
  kind: DistrictKind;
  /** 1..6, from the facility level (log scale). */
  size: number;
  era: number;
  color: RGB;
  seed: number;
  /** Facing: for shore and river sites, the direction toward the water. */
  rot: number;
  deposit?: Deposit;
  /** The site touches a known river. */
  onRiver?: boolean;
  /** Idle or switched-off facilities: no smoke, dark colours. */
  active: boolean;
}

/** Ground footprint radius the placer reserves for a district. */
export function districtRadius(kind: DistrictKind, size: number): number {
  switch (kind) {
    case 'fields': return 8.5 + size * 1.1;
    case 'pasture': return 6.5 + size * 0.5;
    case 'launch': return 8;
    case 'jump': return 8.5;
    case 'collider': return 8;
    case 'rectenna': return 7;
    case 'industry': case 'chemical': case 'nuclear': case 'fusion': return 6.2 + size * 0.45;
    case 'port': return 6.5;
    case 'grid': return 5;
    case 'granary': case 'health': case 'waterworks': case 'mill': return 4.2;
    default: return 5 + size * 0.35;
  }
}

const FIELD_COLORS: RGB[][] = [
  [[0.86, 0.76, 0.3], [0.78, 0.68, 0.26]],
  [[0.56, 0.74, 0.26], [0.47, 0.66, 0.22]],
  [[0.74, 0.58, 0.36], [0.64, 0.5, 0.3]],
  [[0.9, 0.84, 0.44], [0.8, 0.76, 0.36]],
  [[0.42, 0.62, 0.24], [0.5, 0.7, 0.3]],
];

function stack(b: Builder, x: number, z: number, r: number, h: number, fx: Fx | null, G0: number, wx: number, wz: number, col: RGB = BRICK): void {
  b.cyl(x, 0, z, r, r * 0.72, h, 6, col);
  b.cyl(x, h, z, r * 0.8, r * 0.78, 0.35, 6, SOOT);
  if (fx) fx.smoke.push(wx, G0 + h + 0.5, wz, 0.5 + r * 0.6);
}

export function buildDistrict(b: Builder, G: Ground, x: number, z: number, o: DistrictOpts, fx: Fx): void {
  const rand = rng(o.seed);
  const era = Math.max(0, Math.min(4, o.era));
  const st = ERAS[era];
  const n = Math.max(1, Math.min(6, o.size));
  const g0 = G(x, z);
  const sfx: Fx | null = o.active ? fx : null;
  const prevDim = b.dim;
  if (!o.active) b.dim = 0.5;
  // Local-to-world helper for smoke emitters.
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const W = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const smokeAt = (lx: number, lz: number, h: number, size: number) => {
    if (!sfx) return;
    const [wx, wz] = W(lx, lz);
    sfx.smoke.push(wx, g0 + h, wz, size);
  };
  const chimney = (lx: number, lz: number, r: number, h: number, col: RGB = BRICK) => {
    const [wx, wz] = W(lx, lz);
    stack(b, lx, lz, r, h, sfx, g0, wx, wz, col);
  };
  const wall = st.walls[Math.floor(rand() * st.walls.length)];
  const roof = st.roofs[Math.floor(rand() * st.roofs.length)];

  switch (o.kind) {
    case 'fields': {
      // A patchwork of furrowed plots around a small farmstead.
      const plots = 2 + n;
      const cols = Math.ceil(Math.sqrt(plots));
      const pw = 6.4, pd = 5.2;
      let k = 0;
      for (let j = 0; j < cols && k < plots; j++) {
        for (let i = 0; i < cols && k < plots; i++, k++) {
          const lx = (i - (cols - 1) / 2) * (pw + 0.7) + (j % 2) * 1.6, lz = (j - (cols - 1) / 2) * (pd + 0.7);
          if (Math.hypot(lx, lz) < 2.4) continue;
          const [wx, wz] = W(lx, lz);
          const pal = FIELD_COLORS[Math.floor(rand() * FIELD_COLORS.length)];
          drapeRect(b, G, wx, wz, pw, pd, o.rot + (rand() < 0.3 ? Math.PI / 2 : 0), pal, 0.2, 6);
        }
      }
      b.push(x, g0 - 0.05, z, o.rot + 0.4);
      house(b, 2.4, 1.9, 1.5, era === 0 ? WOOD_LIGHT : wall, era === 0 ? THATCH : roof, Math.min(era, 2));
      if (era >= 2) { b.cyl(2.2, 0, 0.3, 0.75, 0.75, 2.8, 7, [0.8, 0.8, 0.78]); b.dome(2.2, 2.8, 0.3, 0.75, [0.7, 0.72, 0.76], 7, 2); }
      else for (let i = 0; i < 3; i++) b.cyl(2 + (i % 2) * 0.9, 0, -0.6 + i * 0.7, 0.42, 0.1, 0.7, 5, [0.9, 0.78, 0.36]);
      b.pop();
      break;
    }
    case 'pasture': {
      const R = 4.6 + n * 0.5;
      drapeDisc(b, G, x, z, R, [0.6, 0.8, 0.36], 0.14, 10, 0.8, o.rot);
      const posts = 14;
      let prev: number[] | null = null, first: number[] | null = null;
      for (let i = 0; i <= posts; i++) {
        const a = (i / posts) * Math.PI * 2;
        const [wx, wz] = W(Math.cos(a) * R, Math.sin(a) * R * 0.8);
        const p = [wx, G(wx, wz), wz];
        if (i < posts) b.box(wx, p[1] - 0.1, wz, 0.2, 1.0, 0.2, WOOD);
        if (prev && i !== 1) b.beam([prev[0], prev[1] + 0.7, prev[2]], [p[0], p[1] + 0.7, p[2]], 0.12, WOOD_LIGHT);
        prev = p;
        if (!first) first = p;
      }
      for (let i = 0; i < 3 + n; i++) {
        const a = rand() * Math.PI * 2, d = rand() * R * 0.62;
        const [wx, wz] = W(Math.cos(a) * d, Math.sin(a) * d * 0.8);
        const coat: RGB = rand() < 0.5 ? [0.96, 0.95, 0.9] : rand() < 0.5 ? [0.5, 0.36, 0.26] : [0.2, 0.18, 0.18];
        b.push(wx, G(wx, wz), wz, rand() * 6);
        b.box(0, 0.3, 0, 1.0, 0.55, 0.5, coat);
        b.box(0.55, 0.55, 0, 0.36, 0.36, 0.34, coat);
        b.pop();
      }
      b.push(x, g0, z, o.rot);
      b.box(-R * 0.55, 0, R * 0.2, 1.8, 1.1, 1.4, WOOD_LIGHT);
      b.gable(-R * 0.55, 1.1, R * 0.2, 1.8, 0.8, 1.4, era === 0 ? THATCH : roof);
      b.pop();
      break;
    }
    case 'fishery': {
      // Drying racks and a shed on the shore; a jetty and boats toward the water (+Z local).
      b.push(x, g0, z, o.rot);
      b.box(-1.6, 0, -1.5, 2.2, 1.3, 1.7, WOOD_LIGHT);
      b.gable(-1.6, 1.3, -1.5, 2.2, 0.9, 1.7, era === 0 ? THATCH : roof);
      for (let i = 0; i < 2; i++) {
        const rx = 1 + i * 1.4;
        b.beam([rx, 0, -2.2], [rx, 1.3, -1.6], 0.1, WOOD);
        b.beam([rx, 0, -1], [rx, 1.3, -1.6], 0.1, WOOD);
        b.quad([rx - 0.5, 1.2, -1.6], [rx + 0.5, 1.2, -1.6], [rx + 0.5, 0.5, -1.4], [rx - 0.5, 0.5, -1.4], [0.82, 0.86, 0.9]);
      }
      b.pop();
      // The jetty and boats sit at the water line: use world heights clamped to the sea.
      const jl = 6.5;
      for (let i = 0; i < 4; i++) {
        const [wx, wz] = W(0, 1 + (i + 0.5) * (jl / 4));
        const y = Math.max(0.55, G(wx, wz) + 0.2);
        b.box(wx, y, wz, 1.2, 0.18, jl / 4 + 0.1, WOOD_LIGHT, o.rot);
        b.box(wx, y - 1.4, wz, 0.2, 1.4, 0.2, WOOD_DARK, o.rot);
      }
      for (let i = 0; i < Math.min(4, 1 + Math.ceil(n / 2)); i++) {
        const [wx, wz] = W(-3.5 + i * 3 + rand(), jl + 2.5 + rand() * 4);
        if (G(wx, wz) > 0.25) continue;
        boat(b, wx, 0.05, wz, o.rot + rand() * 2, 0.75, o.color, false);
      }
      break;
    }
    case 'granary': {
      b.push(x, g0, z, o.rot);
      const k = Math.min(4, 1 + Math.ceil(n / 2));
      for (let i = 0; i < k; i++) {
        const lx = (i - (k - 1) / 2) * 2.3, lz = (i % 2) * 1.4 - 0.7;
        if (era >= 2) { b.cyl(lx, 0, lz, 1, 1, 3.6, 8, [0.84, 0.84, 0.8]); b.dome(lx, 3.6, lz, 1, [0.66, 0.7, 0.74], 8, 2, 0.7); }
        else { b.cyl(lx, 0, lz, 1.05, 0.95, 2, 7, era === 0 ? WOOD_LIGHT : PLASTER); b.cyl(lx, 1.9, lz, 1.4, 0, 1.5, 7, era === 0 ? THATCH : roof); }
      }
      b.pop();
      break;
    }
    case 'timber': {
      b.push(x, g0, z, o.rot);
      // Stacked logs, a saw shed, stumps and a small quarry cut.
      for (let i = 0; i < 2 + Math.ceil(n / 2); i++) {
        const lx = -2.8 + (i % 2) * 1.5, lz = -1.5 + Math.floor(i / 2) * 1.6;
        for (let k = 0; k < 3; k++) b.box(lx, k * 0.42, lz + (k === 2 ? 0 : (k - 0.5) * 0.5), 2.4, 0.42, 0.44, k % 2 ? WOOD_LIGHT : WOOD);
      }
      b.box(1.6, 0, -1.8, 2.6, 1.5, 1.9, WOOD_LIGHT);
      b.gable(1.6, 1.5, -1.8, 2.6, 0.9, 1.9, era === 0 ? THATCH : roof);
      for (let i = 0; i < 4; i++) b.cyl(-3.4 + rand() * 6.5, 0, 2.6 + rand() * 1.6, 0.34, 0.3, 0.35, 5, WOOD_LIGHT);
      b.box(2.4, 0, 1.6, 3.2, 0.7, 2.6, STONE_DARK);
      b.box(3, 0.7, 1.9, 2, 0.7, 2, STONE);
      for (let i = 0; i < 3; i++) b.box(0.6 + rand() * 1.2, 0, 0.6 + i * 0.8, 0.7, 0.5, 0.6, [0.86, 0.84, 0.78], rand());
      b.pop();
      break;
    }
    case 'mine': {
      const ore = DEPOSIT_RGB[o.deposit ?? 'iron_ore'];
      b.push(x, g0, z, o.rot);
      b.cyl(-2.4, 0, 1.8, 2.2, 0.3, 1.9, 6, ore);
      if (n >= 3) b.cyl(-3.6, 0, -1.4, 1.7, 0.2, 1.4, 6, scaleRgb(ore, 0.85));
      // Headframe: braced tower with a winding wheel.
      const hh = 5 + n * 0.35;
      const frame = era <= 1 ? WOOD : IRON;
      for (const [fx0, fz0] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) b.beam([fx0 * 1.3 + 1, 0, fz0 * 1.3], [fx0 * 0.5 + 1, hh, fz0 * 0.5], 0.24, frame);
      b.box(1, hh * 0.5, 0, 1.9, 0.2, 1.9, frame);
      b.box(1, hh, 0, 1.5, 0.3, 1.5, frame);
      b.torus(1, hh + 1, 0, 0.85, 0.14, o.active ? GOLD : IRON, 8, 3, 'z', Math.PI / 2);
      b.beam([1, hh + 1, 0], [4.2, 0.6, 0], 0.16, frame);
      b.box(4, 0, 0, 2.2, 1.6, 2.4, era >= 2 ? BRICK : WOOD_LIGHT);
      b.gable(4, 1.6, 0, 2.2, 0.9, 2.4, era >= 2 ? SLATE : THATCH);
      // Adit and cart track.
      b.box(1, 0, 0, 1.4, 0.5, 1.4, SOOT);
      b.box(-0.6, 0.05, 1.5, 3.4, 0.12, 0.5, WOOD_DARK, 0.6);
      b.pop();
      if (era >= 2) smokeAt(4, 0, 3, 0.45);
      break;
    }
    case 'oilwell': {
      b.push(x, g0, z, o.rot);
      const k = Math.min(3, 1 + Math.floor(n / 2));
      for (let i = 0; i < k; i++) {
        const lx = -3 + i * 3.2, lz = (i % 2) * 2 - 1;
        const hh = 5.5;
        for (const [a0, a1] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam([lx + a0, 0, lz + a1], [lx + a0 * 0.15, hh, lz + a1 * 0.15], 0.18, IRON);
        b.box(lx, hh * 0.4, lz, 1.3, 0.14, 1.3, IRON);
        b.box(lx, hh * 0.7, lz, 0.8, 0.14, 0.8, IRON);
        b.box(lx, hh, lz, 0.5, 0.5, 0.5, RED);
      }
      b.cyl(2.6, 0, 2.6, 1.3, 1.3, 1.7, 8, [0.84, 0.84, 0.82], [0.7, 0.72, 0.74]);
      b.cyl(-0.4, 0, 3, 1, 1, 1.4, 8, [0.3, 0.3, 0.32]);
      b.pop();
      break;
    }
    case 'workshop': {
      b.push(x, g0, z, o.rot);
      const k = 2 + Math.ceil(n / 2);
      for (let i = 0; i < k; i++) {
        const lx = (i % 3 - 1) * 3.1, lz = Math.floor(i / 3) * 3 - (k > 3 ? 1.5 : 0);
        b.push(lx, 0, lz, (rand() - 0.5) * 0.3);
        house(b, 2.6, 2.1, 1.6, st.walls[i % st.walls.length], i === 0 ? o.color : roof, Math.min(era, 2));
        b.box(1.7, 0, 0.9, 1.1, 0.9, 0.2, WOOD);
        b.pop();
      }
      b.cyl(-0.4, 0, 2.4, 0.9, 0.7, 1.6, 6, era === 0 ? STONE_DARK : BRICK);
      b.pop();
      chimney(-0.4, 2.4, 0.42, 3.4, era === 0 ? STONE_DARK : BRICK);
      break;
    }
    case 'industry': {
      b.push(x, g0, z, o.rot);
      // Sawtooth-roofed halls and tall stacks.
      const halls = Math.min(3, 1 + Math.floor(n / 2));
      const body = era >= 3 ? CONCRETE : BRICK;
      for (let hI = 0; hI < halls; hI++) {
        const lz = (hI - (halls - 1) / 2) * 3.6;
        b.box(0, 0, lz, 7.5, 2.6, 3.2, body);
        for (let t = 0; t < 4; t++) {
          const tx = -2.8 + t * 1.87;
          b.quad([tx - 0.93, 2.6, lz + 1.6], [tx + 0.93, 2.6, lz + 1.6], [tx + 0.93, 3.7, lz + 1.6], [tx - 0.93, 2.6, lz + 1.6], body);
          b.quad([tx - 0.93, 2.6, lz - 1.6], [tx - 0.93, 2.6, lz + 1.6], [tx + 0.93, 3.7, lz + 1.6], [tx + 0.93, 3.7, lz - 1.6], era >= 3 ? [0.56, 0.6, 0.64] : SLATE);
          b.quad([tx + 0.93, 2.6, lz - 1.6], [tx + 0.93, 3.7, lz - 1.6], [tx + 0.93, 3.7, lz + 1.6], [tx + 0.93, 2.6, lz + 1.6], era >= 3 ? GLASS : [0.7, 0.8, 0.86]);
          b.tri([tx - 0.93, 2.6, lz - 1.6], [tx + 0.93, 3.7, lz - 1.6], [tx + 0.93, 2.6, lz - 1.6], body);
        }
      }
      b.box(-4.6, 0, 0, 1.4, 1.2, 4, o.color);
      b.pop();
      chimney(4.6, -1.4, 0.62, 7 + n * 0.5);
      if (n >= 2) chimney(4.9, 1.3, 0.5, 5.8 + n * 0.4);
      if (n >= 5) chimney(-4.4, 2.4, 0.5, 6.4);
      break;
    }
    case 'chemical': {
      b.push(x, g0, z, o.rot);
      const tanks = 2 + Math.ceil(n / 2);
      for (let i = 0; i < tanks; i++) {
        const lx = -3.4 + (i % 3) * 2.7, lz = -2 + Math.floor(i / 3) * 2.8;
        if (i % 3 === 1) { b.cyl(lx, 0, lz, 0.25, 0.25, 0.9, 4, IRON); b.ball(lx, 1.9, lz, 1.15, WHITE, 7); }
        else { b.cyl(lx, 0, lz, 1.1, 1.1, 2.2, 8, [0.86, 0.87, 0.86], [0.72, 0.75, 0.78]); b.torus(lx, 1.5, lz, 1.12, 0.08, o.color, 8, 3); }
      }
      for (let i = 0; i < 2 + Math.floor(n / 3); i++) {
        const lx = 2.8 + (i % 2) * 1.3, lz = 1.6 - i * 1.5;
        b.cyl(lx, 0, lz, 0.42, 0.36, 6 + i * 0.8, 6, [0.78, 0.8, 0.82]);
        b.torus(lx, 3, lz, 0.5, 0.07, IRON, 6, 3);
        b.torus(lx, 4.6, lz, 0.48, 0.07, IRON, 6, 3);
      }
      b.beam([-3.4, 1.2, -2], [2.8, 1.2, 1.6], 0.18, [0.6, 0.62, 0.66]);
      b.beam([-0.7, 1.2, -2], [-0.7, 1.2, 0.8], 0.18, [0.6, 0.62, 0.66]);
      b.cyl(-3.6, 0, 2.6, 0.2, 0.16, 7, 5, IRON);
      if (o.active) b.cyl(-3.6, 7, 2.6, 0.32, 0, 1, 5, FIRE);
      b.pop();
      smokeAt(2.8, 1.6, 6.6, 0.55);
      break;
    }
    case 'hightech': {
      b.push(x, g0, z, o.rot);
      const k = 1 + Math.ceil(n / 2);
      for (let i = 0; i < k; i++) {
        const lx = (i % 2) * 4.4 - 2.2, lz = Math.floor(i / 2) * 3.8 - (k > 2 ? 1.9 : 0);
        b.box(lx, 0, lz, 3.9, 1.9, 3.2, WHITE);
        b.box(lx, 0.7, lz, 3.96, 0.5, 3.26, era >= 4 ? TEAL : GLASS);
        b.box(lx, 1.9, lz, 3.3, 0.25, 2.6, [0.78, 0.82, 0.86]);
        b.box(lx - 0.9, 2.15, lz - 0.5, 0.9, 0.5, 0.9, [0.6, 0.64, 0.68]);
        b.box(lx + 0.8, 2.15, lz + 0.5, 0.9, 0.5, 0.9, [0.6, 0.64, 0.68]);
      }
      b.box(0, 0, -3.4, 1.2, 0.3, 0.6, o.color);
      b.box(3.6, 0, -2.6, 0.14, 4.4, 0.14, IRON);
      b.dome(3.6, 4.4, -2.6, 0.34, WHITE, 5, 2);
      b.pop();
      break;
    }
    case 'mill': {
      b.push(x, g0, z, o.rot);
      if (o.onRiver) {
        // Mill house with an undershot wheel on the river side (+Z local).
        b.box(0, 0, -1, 3, 2.4, 2.6, era === 0 ? WOOD_LIGHT : PLASTER);
        b.gable(0, 2.4, -1, 3, 1.3, 2.6, era === 0 ? THATCH : roof);
        b.torus(0, 1.2, 0.9, 1.7, 0.2, WOOD, 10, 3, 'z', Math.PI / 2 * 0);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI;
          b.beam([Math.cos(a) * 1.7, 1.2 + Math.sin(a) * 1.7, 0.9], [-Math.cos(a) * 1.7, 1.2 - Math.sin(a) * 1.7, 0.9], 0.14, WOOD_DARK);
        }
      } else {
        // Windmill: tapered tower with four sails.
        b.cyl(0, 0, 0, 1.5, 1.0, 4.6, 7, era === 0 ? WOOD_LIGHT : PLASTER);
        b.cyl(0, 4.6, 0, 1.2, 0, 1.3, 7, era === 0 ? THATCH : roof);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const ex = Math.cos(a) * 3.2, ey = 4.3 + Math.sin(a) * 3.2;
          b.beam([0, 4.3, 1.15], [ex, ey, 1.15], 0.12, WOOD_DARK);
          const px = -Math.sin(a) * 0.55, py = Math.cos(a) * 0.55;
          b.quad([ex * 0.3, 4.3 + (ey - 4.3) * 0.3, 1.2], [ex, ey, 1.2], [ex + px, ey + py, 1.2], [ex * 0.3 + px, 4.3 + (ey - 4.3) * 0.3 + py, 1.2], CANVAS);
          b.quad([ex * 0.3, 4.3 + (ey - 4.3) * 0.3, 1.21], [ex * 0.3 + px, 4.3 + (ey - 4.3) * 0.3 + py, 1.21], [ex + px, ey + py, 1.21], [ex, ey, 1.21], CANVAS);
        }
      }
      b.pop();
      break;
    }
    case 'thermal': {
      b.push(x, g0, z, o.rot);
      b.box(0, 0, 0, 5.4, 3.2, 3.6, era >= 3 ? CONCRETE : BRICK);
      b.gable(0, 3.2, 0, 5.4, 1.1, 3.6, era >= 3 ? [0.56, 0.6, 0.64] : SLATE, 0, 0.2);
      b.box(0, 1.2, 1.82, 4.4, 1.3, 0.1, era >= 3 ? GLASS : [0.95, 0.8, 0.4]);
      b.cyl(-3.4, 0, 2.4, 1.8, 0.3, 1.5, 6, SOOT);
      if (era >= 3) for (let i = 0; i < 3; i++) { b.box(3.9, 0, -1.4 + i * 1.4, 1, 1.2, 0.9, [0.6, 0.64, 0.68]); b.cyl(3.9, 1.2, -1.4 + i * 1.4, 0.16, 0.1, 0.7, 4, [0.86, 0.9, 0.92]); }
      b.pop();
      chimney(-1.6, -2.6, 0.7, 8 + n * 0.45, era >= 3 ? [0.82, 0.8, 0.78] : BRICK);
      if (n >= 3) chimney(0.8, -2.6, 0.6, 7 + n * 0.35, era >= 3 ? [0.82, 0.8, 0.78] : BRICK);
      break;
    }
    case 'hydro': {
      // A dam wall across the channel with a powerhouse below it.
      b.push(x, g0 - 1, z, o.rot);
      b.box(0, 0, 0, 9 + n, 4.2, 1.8, CONCRETE, 0, 0.82, [0.92, 0.92, 0.9]);
      for (let i = 0; i < 3; i++) b.box(-2 + i * 2, 0.6, 1.0, 1.1, 2.2, 0.5, WATER);
      b.box(3.6, 0.6, 2.6, 2.8, 2.2, 2.2, WHITE);
      b.box(3.6, 2.8, 2.6, 3, 0.25, 2.4, o.color);
      b.quad([-4.5, 3.9, -0.95], [4.5, 3.9, -0.95], [4.5, 3.9, -6], [-4.5, 3.9, -6], WATER);
      b.pop();
      break;
    }
    case 'grid': {
      b.push(x, g0, z, o.rot);
      b.box(0, 0, 0, 3, 0.2, 3, [0.62, 0.62, 0.6]);
      for (let i = 0; i < 4; i++) { b.box(-0.9 + (i % 2) * 1.8, 0.2, -0.9 + Math.floor(i / 2) * 1.8, 0.9, 1.1, 0.9, [0.62, 0.66, 0.7]); b.cyl(-0.9 + (i % 2) * 1.8, 1.3, -0.9 + Math.floor(i / 2) * 1.8, 0.14, 0.08, 0.7, 4, WHITE); }
      b.pop();
      break;
    }
    case 'nuclear': {
      b.push(x, g0, z, o.rot);
      const towers = Math.min(3, 1 + Math.floor(n / 2));
      for (let i = 0; i < towers; i++) {
        const lx = -3 + i * 3.6, lz = -1.6 + (i % 2) * 1.2;
        b.cyl(lx, 0, lz, 1.9, 1.25, 3.4, 9, [0.9, 0.9, 0.88]);
        b.cyl(lx, 3.4, lz, 1.25, 1.5, 2.2, 9, [0.9, 0.9, 0.88], [0.7, 0.72, 0.74]);
        smokeAt(lx, lz, 6, 1.1);
      }
      b.cyl(1.2, 0, 2.8, 1.5, 1.5, 1.6, 8, WHITE);
      b.dome(1.2, 1.6, 2.8, 1.5, WHITE, 8, 3);
      b.box(-2.4, 0, 2.8, 3, 1.5, 2, CONCRETE);
      b.box(-2.4, 1.5, 2.8, 3.1, 0.2, 2.1, o.color);
      b.pop();
      break;
    }
    case 'fusion': {
      b.push(x, g0, z, o.rot);
      b.cyl(0, 0, 0, 5, 5, 0.5, 10, CONCRETE);
      b.torus(0, 2, 0, 3.3, 1.25, WHITE, 12, 6, 'y', 0, [0.86, 0.92, 0.95]);
      b.torus(0, 2, 0, 3.3, 0.5, o.active ? [0.5, 0.95, 1.0] : IRON, 12, 4, 'y');
      b.cyl(0, 0.5, 0, 1.1, 0.9, 4.4, 8, [0.8, 0.84, 0.88]);
      b.dome(0, 4.9, 0, 0.9, o.active ? TEAL : IRON, 6, 2);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.beam([Math.cos(a) * 4.7, 0.5, Math.sin(a) * 4.7], [Math.cos(a) * 3.4, 3.2, Math.sin(a) * 3.4], 0.22, o.color); }
      b.pop();
      break;
    }
    case 'rectenna': {
      b.push(x, g0, z, o.rot);
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          if (Math.abs(i) + Math.abs(j) > 3 || (i === 0 && j === 0)) continue;
          b.box(i * 2.2, 0, j * 2.2, 0.12, 0.8, 0.12, IRON);
          b.quad([i * 2.2 - 0.85, 0.7, j * 2.2 - 0.85], [i * 2.2 - 0.85, 1.3, j * 2.2 + 0.85], [i * 2.2 + 0.85, 1.3, j * 2.2 + 0.85], [i * 2.2 + 0.85, 0.7, j * 2.2 - 0.85], (i + j) % 2 ? [0.3, 0.42, 0.62] : [0.36, 0.5, 0.7]);
        }
      }
      b.cyl(0, 0, 0, 0.5, 0.36, 2.2, 6, WHITE);
      b.cyl(0, 2.2, 0, 0.2, 2.1, 0.9, 10, WHITE, o.active ? [0.6, 0.95, 1] : [0.8, 0.8, 0.8]);
      b.pop();
      break;
    }
    case 'port': {
      // Quay along the shore, two piers into the water (+Z local), a crane, warehouses, a lighthouse.
      b.push(x, Math.max(0.5, g0), z, o.rot);
      b.box(0, -0.6, 0.4, 10.5, 0.9, 2.6, STONE);
      b.box(-2.8, 0.3, -1.8, 3.4, 1.8, 2.2, era >= 2 ? BRICK : WOOD_LIGHT);
      b.gable(-2.8, 2.1, -1.8, 3.4, 1, 2.2, o.color);
      b.box(1.4, 0.3, -1.8, 3, 1.5, 2, era >= 3 ? CONCRETE : PLASTER);
      b.gable(1.4, 1.8, -1.8, 3, 0.9, 2, roof);
      for (const px of [-3.2, 2.6]) {
        b.box(px, -0.5, 4.6, 1.3, 0.75, 6.4, era >= 2 ? CONCRETE : WOOD_LIGHT);
        for (let i = 0; i < 3; i++) b.box(px, -1.8, 2.4 + i * 2.2, 0.3, 1.4, 0.3, WOOD_DARK);
      }
      // Crane.
      b.box(0.2, 0.3, 0.9, 0.5, 3.4, 0.5, era >= 2 ? IRON : WOOD);
      b.beam([0.2, 3.6, 0.9], [0.2, 4.6, 4.4], 0.22, era >= 2 ? [0.9, 0.7, 0.2] : WOOD);
      b.beam([0.2, 4.6, 4.4], [0.2, 2.2, 4.4], 0.06, SOOT);
      b.box(0.2, 1.7, 4.4, 0.6, 0.5, 0.6, WOOD_LIGHT);
      // Lighthouse.
      b.cyl(5.6, 0.3, 0.2, 0.85, 0.6, 2.2, 7, WHITE);
      b.cyl(5.6, 2.5, 0.2, 0.6, 0.5, 1.6, 7, RED);
      b.cyl(5.6, 4.1, 0.2, 0.5, 0.42, 1.2, 7, WHITE);
      b.cyl(5.6, 5.3, 0.2, 0.5, 0.5, 0.6, 6, [1, 0.92, 0.5]);
      b.cyl(5.6, 5.9, 0.2, 0.62, 0, 0.7, 6, o.color);
      b.pop();
      for (let i = 0; i < Math.min(3, 1 + Math.floor(n / 2)); i++) {
        const [wx, wz] = W(-5.5 + i * 5.5, 7.5 + i * 2.2);
        if (G(wx, wz) > 0.25) continue;
        boat(b, wx, 0.05, wz, o.rot + Math.PI / 2 + (rand() - 0.5), 1.25, o.color, era >= 2);
      }
      break;
    }
    case 'depot': {
      b.push(x, g0, z, o.rot);
      drapeless(b, 9, 7, [0.6, 0.6, 0.58]);
      b.box(0, 0, -1.8, 6.4, 2, 2.6, era >= 3 ? CONCRETE : BRICK);
      b.box(0, 2, -1.8, 6.6, 0.25, 2.8, [0.5, 0.54, 0.58]);
      for (let i = 0; i < 3; i++) b.box(-2.1 + i * 2.1, 0, -0.48, 1.5, 1.5, 0.1, SOOT);
      for (let i = 0; i < 1 + Math.ceil(n / 2); i++) {
        const lx = -3 + i * 2.2;
        b.box(lx, 0.25, 1.6, 0.9, 0.7, 1.9, i % 2 ? o.color : [0.86, 0.72, 0.3]);
        b.box(lx, 0.25, 0.9, 0.9, 1.0, 0.6, [0.85, 0.87, 0.9]);
      }
      b.cyl(3.6, 0, 1.6, 0.7, 0.7, 1.8, 7, [0.84, 0.3, 0.24]);
      b.pop();
      break;
    }
    case 'health': {
      b.push(x, g0, z, o.rot);
      const hw = 3 + n * 0.5;
      b.box(0, 0, 0, hw, 2 + (era >= 3 ? 1.4 : 0), 2.4, WHITE);
      if (era >= 3) { b.box(0, 1.2, 0, hw + 0.06, 0.5, 2.46, GLASS); b.box(0, 3.4, 0, hw + 0.2, 0.2, 2.6, [0.3, 0.7, 0.62]); }
      else b.gable(0, 2, 0, hw, 1, 2.4, [0.3, 0.7, 0.62]);
      b.box(-hw / 2 - 0.6, 0, 0.9, 1.4, 1.5, 1.6, WHITE);
      b.gable(-hw / 2 - 0.6, 1.5, 0.9, 1.4, 0.7, 1.6, [0.3, 0.7, 0.62], Math.PI / 2);
      b.flag(hw / 2 + 0.4, 0, 1.2, 3.6, WHITE, 0, 0.8);
      b.pop();
      break;
    }
    case 'waterworks': {
      b.push(x, g0, z, o.rot);
      if (era >= 2) {
        for (const [a0, a1] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) b.beam([a0 - 1.6, 0, a1], [a0 * 0.8 - 1.6, 3.2, a1 * 0.8], 0.16, IRON);
        b.cyl(-1.6, 3.2, 0, 1.25, 1.25, 1.5, 8, [0.78, 0.86, 0.9]);
        b.cyl(-1.6, 4.7, 0, 1.3, 0, 0.7, 8, o.color);
        b.cyl(1.9, 0, 0.8, 1.5, 1.5, 0.4, 9, CONCRETE, WATER);
        if (n >= 2) b.cyl(1.7, 0, -2.2, 1.3, 1.3, 0.4, 9, CONCRETE, [0.36, 0.6, 0.62]);
      } else {
        b.cyl(0, 0, 0, 1.1, 1.1, 0.8, 8, STONE, WATER);
        b.beam([-1.1, 0.8, 0], [-1.1, 2.3, 0], 0.16, WOOD);
        b.beam([1.1, 0.8, 0], [1.1, 2.3, 0], 0.16, WOOD);
        b.gable(0, 2.2, 0, 2.4, 0.7, 1.2, era === 0 ? THATCH : roof);
      }
      b.pop();
      break;
    }
    case 'admin': {
      b.push(x, g0, z, o.rot);
      b.box(0, 0, 0, 6.4, 0.5, 4.6, STONE);
      b.box(0, 0.5, -0.4, 5, 2.6, 2.8, era >= 3 ? CONCRETE : PLASTER);
      for (let i = 0; i < 5; i++) b.cyl(-2.4 + i * 1.2, 0.5, 1.5, 0.22, 0.2, 2.6, 6, WHITE);
      b.box(0, 3.1, 0.2, 5.6, 0.35, 4, WHITE);
      b.gable(0, 3.45, 0.2, 5.6, 1.2, 4, o.color, 0, 0.1, WHITE);
      b.flag(0, 4.5, 0.2, 2.6, o.color, 0, 0.9);
      b.pop();
      break;
    }
    case 'barracks': {
      b.push(x, g0, z, o.rot);
      drapeless(b, 9.4, 8, [0.78, 0.68, 0.48]);
      const fence = era <= 1 ? WOOD : STONE_DARK;
      for (const [fx0, fz0, fw, fd] of [[0, -4, 9.4, 0.4], [0, 4, 9.4, 0.4], [-4.7, 0, 0.4, 8], [4.7, 0, 0.4, 3]] as number[][]) b.box(fx0, 0, fz0, fw, 1.3, fd, fence);
      for (let i = 0; i < Math.min(3, 1 + Math.ceil(n / 2)); i++) {
        b.box(-2.4, 0, -2.4 + i * 2.4, 3.6, 1.4, 1.6, era >= 2 ? BRICK : WOOD_LIGHT);
        b.gable(-2.4, 1.4, -2.4 + i * 2.4, 3.6, 0.8, 1.6, o.color);
      }
      b.box(3.6, 0, -3, 1.4, 3.6, 1.4, fence);
      b.box(3.6, 3.6, -3, 1.9, 0.3, 1.9, WOOD_DARK);
      b.hip(3.6, 4.6, -3, 1.9, 0.9, 1.9, o.color);
      for (const [cx0, cz0] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) b.box(3.6 + cx0, 3.9, -3 + cz0, 0.14, 0.7, 0.14, WOOD_DARK);
      b.flag(2, 0, 1.6, 4.6, o.color, 0.2, 1.1);
      for (let i = 0; i < 3; i++) b.cyl(0.6 + i * 1.1, 0, 2.6, 0.3, 0.3, 1.1, 5, [0.86, 0.78, 0.5], RED);
      b.pop();
      break;
    }
    case 'holy': {
      // Sacred precinct: terraces, a ring of standing stones and a gilded central pillar.
      b.push(x, g0, z, o.rot);
      b.cyl(0, 0, 0, 4.8, 4.6, 0.45, 10, [0.9, 0.87, 0.78]);
      b.cyl(0, 0.45, 0, 3.4, 3.2, 0.45, 10, [0.95, 0.92, 0.84]);
      b.cyl(0, 0.9, 0, 1.6, 1.4, 0.5, 8, [0.9, 0.87, 0.78]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.box(Math.cos(a) * 4, 0.45, Math.sin(a) * 4, 0.6, 2 + (i % 3) * 0.35, 0.4, STONE, -a, 0.8);
      }
      b.cyl(0, 1.4, 0, 0.5, 0.26, 4.6, 4, WHITE, undefined, Math.PI / 4);
      b.cyl(0, 6, 0, 0.3, 0, 0.9, 4, GOLD, undefined, Math.PI / 4);
      b.torus(0, 4.6, 0, 0.75, 0.12, GOLD, 8, 3, 'z');
      b.flag(3, 0.45, -1, 3.4, o.color, 1, 0.8);
      b.pop();
      break;
    }
    case 'school': {
      b.push(x, g0, z, o.rot);
      const cw = 5 + n * 0.5;
      const body = era >= 3 ? CONCRETE : era === 0 ? WOOD_LIGHT : PLASTER;
      const rf: RGB = [0.24, 0.42, 0.66];
      b.box(0, 0, -1.9, cw, 2, 1.9, body);
      if (era >= 3) b.box(0, 2, -1.9, cw + 0.2, 0.22, 2.1, rf); else b.gable(0, 2, -1.9, cw, 0.95, 1.9, rf);
      if (n >= 2) {
        b.box(-cw / 2 + 0.95, 0, 0.6, 1.9, 1.8, 3.2, body);
        if (era >= 3) b.box(-cw / 2 + 0.95, 1.8, 0.6, 2.1, 0.22, 3.4, rf); else b.gable(-cw / 2 + 0.95, 1.8, 0.6, 3.2, 0.9, 1.9, rf, Math.PI / 2);
      }
      if (n >= 3) {
        b.box(cw / 2 - 0.95, 0, 0.6, 1.9, 1.8, 3.2, body);
        if (era >= 3) b.box(cw / 2 - 0.95, 1.8, 0.6, 2.1, 0.22, 3.4, rf); else b.gable(cw / 2 - 0.95, 1.8, 0.6, 3.2, 0.9, 1.9, rf, Math.PI / 2);
      }
      // Bell tower.
      b.box(0, 0, -1.9, 1.4, 4.6, 1.4, body);
      b.box(0, 3.4, -1.9, 1.46, 0.6, 1.46, WOOD_DARK);
      b.hip(0, 4.6, -1.9, 1.4, 1.6, 1.4, rf, 0, 0, 0.25);
      b.cyl(0, 0, 1, 1.2, 1.2, 0.12, 8, [0.56, 0.76, 0.34]);
      b.pop();
      break;
    }
    case 'research': {
      b.push(x, g0, z, o.rot);
      const body = era >= 3 ? WHITE : era === 0 ? WOOD_LIGHT : PLASTER;
      b.box(-1.3, 0, 0, 4.4, 2.3, 3, body);
      if (era >= 3) { b.box(-1.3, 0.9, 0, 4.46, 0.6, 3.06, GLASS); b.box(-1.3, 2.3, 0, 4.6, 0.22, 3.2, [0.5, 0.36, 0.66]); }
      else b.gable(-1.3, 2.3, 0, 4.4, 1, 3, [0.5, 0.36, 0.66]);
      // Observatory dome with a slit.
      b.cyl(2.5, 0, 0.4, 1.7, 1.7, 2.3, 9, body);
      b.dome(2.5, 2.3, 0.4, 1.75, [0.86, 0.9, 0.94], 9, 3, 1, [0.7, 0.76, 0.84]);
      b.box(2.5, 2.3, 0.4, 0.5, 1.85, 2.2, SOOT, 0.6, 0.3);
      if (n >= 3) { b.box(-2.6, 0, -2.6, 2, 1.6, 1.6, body); b.box(-2.6, 1.6, -2.6, 0.12, 2.6, 0.12, IRON); b.cyl(-2.6, 4.2, -2.6, 0.1, 0.7, 0.4, 6, WHITE); }
      b.pop();
      break;
    }
    case 'collider': {
      b.push(x, g0, z, o.rot);
      b.torus(0, 0.25, 0, 6, 0.75, [0.84, 0.86, 0.88], 16, 4, 'y', 0, [0.72, 0.76, 0.82]);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.3; b.box(Math.cos(a) * 6, 0, Math.sin(a) * 6, 2.2, 1.6, 1.8, WHITE, -a); b.box(Math.cos(a) * 6, 1.6, Math.sin(a) * 6, 2.3, 0.2, 1.9, o.active ? TEAL : IRON, -a); }
      b.box(0, 0, 0, 3, 2, 2.4, WHITE);
      b.box(0, 0.8, 0, 3.06, 0.55, 2.46, GLASS);
      b.pop();
      break;
    }
    case 'launch': {
      b.push(x, g0, z, o.rot);
      b.cyl(0, 0, 0, 6.2, 6.2, 0.3, 12, [0.7, 0.7, 0.68], [0.78, 0.78, 0.76]);
      b.box(0, 0.3, 0, 2.6, 0.5, 2.6, CONCRETE);
      // Rocket.
      b.cyl(0, 0.8, 0, 0.72, 0.72, 6.6, 8, WHITE);
      b.cyl(0, 3.6, 0, 0.74, 0.74, 0.5, 8, o.color);
      b.cyl(0, 7.4, 0, 0.72, 0, 1.7, 8, RED);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b.tri([Math.cos(a) * 0.7, 0.8, Math.sin(a) * 0.7], [Math.cos(a) * 1.5, 0.8, Math.sin(a) * 1.5], [Math.cos(a) * 0.7, 2.6, Math.sin(a) * 0.7], o.color); b.tri([Math.cos(a) * 0.7, 0.8, Math.sin(a) * 0.7], [Math.cos(a) * 0.7, 2.6, Math.sin(a) * 0.7], [Math.cos(a) * 1.5, 0.8, Math.sin(a) * 1.5], o.color); }
      // Gantry.
      for (const [a0, a1] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) b.beam([2 + a0, 0.3, a1], [2 + a0, 8.6, a1], 0.16, [0.82, 0.3, 0.22]);
      for (let k = 0; k < 5; k++) { b.box(2, 1.2 + k * 1.7, 0, 1.3, 0.12, 1.3, [0.82, 0.3, 0.22]); b.beam([1.4, 1.2 + k * 1.7, 0], [0.7, 1.2 + k * 1.7, 0], 0.1, IRON); }
      b.box(2, 8.6, 0, 1.5, 0.3, 1.5, IRON);
      b.ball(-3.8, 1.5, 2.6, 1.2, WHITE, 7);
      b.cyl(-3.8, 0, 2.6, 0.25, 0.25, 0.6, 4, IRON);
      b.box(-3.4, 0.3, -3, 2.6, 1.4, 1.8, CONCRETE);
      b.box(-3.4, 1.7, -3, 2.7, 0.2, 1.9, o.color);
      b.pop();
      break;
    }
    case 'dishes': {
      b.push(x, g0, z, o.rot);
      const k = Math.min(5, 1 + n);
      for (let i = 0; i < k; i++) {
        const lx = (i % 3 - 1) * 3.6, lz = Math.floor(i / 3) * 3.6 - (k > 3 ? 1.8 : 0);
        const r = i === 0 ? 1.9 : 1.3;
        b.cyl(lx, 0, lz, 0.4, 0.3, 1.8, 6, [0.82, 0.84, 0.86]);
        b.push(lx, 1.8, lz, 0.6 + i * 0.4);
        b.cyl(0, 0, 0, 0.3, r, 0.8, 10, WHITE, [0.82, 0.86, 0.9]);
        b.beam([0, 0.2, 0], [0, 1.6, 0], 0.08, IRON);
        b.pop();
      }
      b.box(3.6, 0, 2.6, 2.4, 1.3, 1.6, WHITE);
      b.box(3.6, 1.3, 2.6, 2.5, 0.2, 1.7, o.color);
      b.pop();
      break;
    }
    case 'jump': {
      // Jump works: an upright ring gate on a platform, flanked by pylons.
      b.push(x, g0, z, o.rot);
      b.cyl(0, 0, 0, 6.4, 6.4, 0.4, 12, [0.8, 0.82, 0.84], [0.88, 0.9, 0.92]);
      const R = 3.6 + n * 0.35;
      b.torus(0, R + 1, 0, R, 0.62, WHITE, 16, 5, 'z', 0, [0.8, 0.86, 0.92]);
      b.torus(0, R + 1, 0, R * 0.8, 0.2, o.active ? [0.45, 0.95, 1] : IRON, 16, 3, 'z');
      if (n >= 3) b.torus(0, R + 1, 0, R * 0.55, 0.14, o.active ? [0.75, 0.6, 1] : IRON, 12, 3, 'z');
      b.box(-R, 0.4, 0, 1.4, 1.6, 1.6, [0.7, 0.74, 0.8]);
      b.box(R, 0.4, 0, 1.4, 1.6, 1.6, [0.7, 0.74, 0.8]);
      for (const sx of [-1, 1]) {
        b.cyl(sx * 5.2, 0.4, 3.2, 0.5, 0.2, 5.4, 5, WHITE);
        b.cyl(sx * 5.2, 5.8, 3.2, 0.3, 0, 0.9, 5, o.active ? TEAL : IRON);
        b.cyl(sx * 5.2, 0.4, -3.2, 0.5, 0.2, 5.4, 5, WHITE);
        b.cyl(sx * 5.2, 5.8, -3.2, 0.3, 0, 0.9, 5, o.active ? TEAL : IRON);
      }
      b.box(0, 0.4, -4.4, 3, 1.4, 1.8, WHITE);
      b.box(0, 1.8, -4.4, 3.1, 0.2, 1.9, o.color);
      b.pop();
      break;
    }
  }
  b.dim = prevDim;
}

/** Flat yard slab in the current local frame. */
function drapeless(b: Builder, w: number, d: number, color: RGB): void {
  b.box(0, -0.4, 0, w, 0.52, d, color);
}

/** A small vessel: hull, mast and sail, or a funnel for powered eras. */
export function boat(b: Builder, x: number, y: number, z: number, rot: number, s: number, color: RGB, powered: boolean): void {
  b.push(x, y, z, rot, s);
  const hull: RGB = [0.5, 0.34, 0.22];
  b.box(0, 0, 0, 2.6, 0.55, 1.0, hull, 0, 1.12, [0.78, 0.64, 0.44]);
  b.tri([1.3, 0, -0.5], [1.3, 0, 0.5], [2.3, 0.62, 0], hull).tri([1.3, 0.55, 0.56], [1.3, 0, 0.5], [2.3, 0.62, 0], hull).tri([1.3, 0, -0.5], [1.3, 0.55, -0.56], [2.3, 0.62, 0], hull).tri([1.3, 0.55, -0.56], [1.3, 0.55, 0.56], [2.3, 0.62, 0], [0.78, 0.64, 0.44]);
  if (powered) {
    b.box(-0.2, 0.55, 0, 1.2, 0.6, 0.7, WHITE);
    b.cyl(-0.3, 1.15, 0, 0.2, 0.18, 0.9, 5, color);
  } else {
    b.box(0.1, 0.55, 0, 0.1, 2.3, 0.1, WOOD_DARK);
    b.tri([0.16, 2.8, 0], [0.16, 0.9, 0], [1.4, 0.95, 0.12], CANVAS).tri([0.16, 2.8, 0], [1.4, 0.95, 0.12], [0.16, 0.9, 0], CANVAS);
    b.tri([0.04, 2.6, 0], [-1.0, 1, -0.1], [0.04, 1, 0], mixRgb(CANVAS, color, 0.6)).tri([0.04, 2.6, 0], [0.04, 1, 0], [-1.0, 1, -0.1], mixRgb(CANVAS, color, 0.6));
  }
  b.pop();
}

/** Lattice pylon for power lines. */
export function pylon(b: Builder, x: number, y: number, z: number, rot: number, h = 6): void {
  b.push(x, y - 0.2, z, rot);
  const c: RGB = [0.62, 0.66, 0.7];
  for (const [a0, a1] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam([a0 * 0.8, 0, a1 * 0.8], [a0 * 0.12, h, a1 * 0.12], 0.14, c);
  b.box(0, h * 0.72, 0, 3.2, 0.14, 0.14, c);
  b.box(0, h * 0.9, 0, 2.2, 0.14, 0.14, c);
  b.box(0, h * 0.45, 0, 0.95, 0.1, 0.95, c);
  b.pop();
}
