// The ten tradition styles in the 3D diorama (ruleset 3.1). A seat that holds a path
// builds in that path's manner: the settlement kit of models.ts takes its walls, roofs
// and glass from the style's palette (../map/punk.ts), and the pieces below stand in and
// round the town: stacks, a gasometer and an airship for steam; a tank farm, a hangar
// and searchlights for diesel; and so on. Each style has a first piece (`pieceA`, which
// also marks the seat's heavy works), a second (`pieceB`) and, for some, something in
// the sky. Everything is assembled from Builder primitives, a few hundred triangles a town.
import { PUNK, hexRgb as hex255, type PunkLook, type PunkStyle } from '../map/punk';
import { Builder } from './builder';
import { mixRgb, scaleRgb, type RGB } from './util';

export interface Punk3 {
  style: PunkStyle;
  look: PunkLook;
  walls: RGB[];
  roofs: RGB[];
  glass: RGB;
  trim: RGB;
  accent: RGB;
  glow: RGB;
  metal: RGB;
  ground: RGB;
  /** The era of the building kit the style uses: 2 gabled brick, 3 flat blocks, 4 domed towers. */
  geomEra: number;
  /** How tall the style builds against the common kit. */
  rise: number;
  /** How readily it builds towers among its houses (1: as the era kit does). */
  towers: number;
}

const GEOM: Record<PunkStyle, [number, number, number]> = {
  steam: [2, 1, 1], diesel: [3, 1, 1], electric: [3, 0.95, 0.7], clockwork: [2, 1.05, 1],
  atomic: [4, 0.95, 1], neon: [3, 1.3, 1.4], organic: [4, 0.85, 0.6], chrome: [3, 1.2, 1.1], solar: [3, 0.62, 0.25], rocket: [4, 0.9, 0.7],
};

const rgb = (hex: string): RGB => {
  const [r, g, b] = hex255(hex);
  return [r / 255, g / 255, b / 255];
};

const CACHE = new Map<PunkStyle, Punk3>();
export function punk3(style: PunkStyle): Punk3 {
  let p = CACHE.get(style);
  if (!p) {
    const L = PUNK[style];
    const wall = rgb(L.wall), wall2 = rgb(L.wall2), roof = rgb(L.roof), roof2 = rgb(L.roof2);
    p = {
      style, look: L,
      walls: [wall, wall2, mixRgb(wall, wall2, 0.5)],
      roofs: [roof, roof2],
      glass: rgb(L.glass), trim: rgb(L.metal), accent: rgb(L.accent), glow: rgb(L.glow), metal: rgb(L.metal), ground: rgb(L.ground),
      geomEra: GEOM[style][0], rise: GEOM[style][1], towers: GEOM[style][2],
    };
    CACHE.set(style, p);
  }
  return p;
}

/** The era of the building kit a styled settlement uses. */
export function punkGeomEra(style: PunkStyle): number {
  return GEOM[style][0];
}

const WHITE: RGB = [0.96, 0.97, 0.98];
const SOOT: RGB = [0.2, 0.19, 0.2];
const DARK: RGB = [0.16, 0.17, 0.2];
const RED: RGB = [0.86, 0.22, 0.2];
const CREAM: RGB = [0.98, 0.95, 0.86];

/** Smoke emitter in the builder's current local frame. */
export type Smoke = (lx: number, ly: number, lz: number, size: number) => void;

// The model material is double-sided and flat-shaded, so a thin panel is one quad.
function panel(b: Builder, p0: number[], p1: number[], p2: number[], p3: number[], color: RGB): void {
  b.quad(p0, p1, p2, p3, color);
}
function leaf(b: Builder, p0: number[], p1: number[], p2: number[], color: RGB): void {
  b.tri(p0, p1, p2, color);
}
/** A body of revolution lying along local X, centred on (0, y, 0): an airship hull. */
function spindle(b: Builder, y: number, len: number, r: number, color: RGB, alt: RGB): void {
  const prof = [0, 0.62, 0.94, 1, 0.9, 0.58, 0];
  const sides = 6, n = prof.length - 1;
  const pt = (i: number, k: number): number[] => {
    const a = (k / sides) * Math.PI * 2;
    return [(i / n - 0.5) * len, y + Math.sin(a) * prof[i] * r, Math.cos(a) * prof[i] * r];
  };
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < sides; k++) {
      const col = (i === 2 || i === 3) && k % 2 === 0 ? alt : color;
      if (prof[i] === 0) b.tri(pt(i, k), pt(i + 1, k + 1), pt(i + 1, k), col);
      else if (prof[i + 1] === 0) b.tri(pt(i, k), pt(i, k + 1), pt(i + 1, k), col);
      else b.quad(pt(i, k), pt(i, k + 1), pt(i + 1, k + 1), pt(i + 1, k), col);
    }
  }
}
/** A barrel vault along local X standing on y0: a hangar roof, closed at both ends. */
function vault(b: Builder, y0: number, len: number, r: number, h: number, color: RGB, end: RGB): void {
  const seg = 6;
  const pt = (k: number, x: number): number[] => {
    const a = (k / seg) * Math.PI;
    return [x, y0 + Math.sin(a) * h, Math.cos(a) * r];
  };
  for (let k = 0; k < seg; k++) {
    b.quad(pt(k, -len / 2), pt(k, len / 2), pt(k + 1, len / 2), pt(k + 1, -len / 2), k % 2 ? scaleRgb(color, 0.92) : color);
    b.tri([len / 2, y0, 0], pt(k + 1, len / 2), pt(k, len / 2), end);
    b.tri([-len / 2, y0, 0], pt(k, -len / 2), pt(k + 1, -len / 2), end);
  }
}
/** An upright eight-sided face looking along local +Z and -Z: a clock face, a sign. */
function face(b: Builder, cx: number, cy: number, cz: number, r: number, color: RGB): void {
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    leaf(b, [cx, cy, cz], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz], color);
  }
}
/** A standing toothed wheel facing local Z. */
function gear(b: Builder, cx: number, cy: number, cz: number, R: number, color: RGB, hub: RGB, teeth = 10): void {
  b.torus(cx, cy, cz, R, R * 0.13, color, 12, 4, 'z');
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = R * 0.2;
    b.box(cx + Math.cos(a) * R * 1.14, cy + Math.sin(a) * R * 1.14 - t / 2, cz, t, t, R * 0.24, color);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    b.beam([cx + Math.cos(a) * R, cy + Math.sin(a) * R, cz], [cx - Math.cos(a) * R, cy - Math.sin(a) * R, cz], R * 0.12, color);
  }
  b.box(cx, cy - R * 0.2, cz, R * 0.4, R * 0.4, R * 0.34, hub);
}
/** Three turbine blades in the XY plane about (cx, cy, cz). */
function blades(b: Builder, cx: number, cy: number, cz: number, len: number, phase: number, color: RGB): void {
  for (let i = 0; i < 3; i++) {
    const a = phase + (i * Math.PI * 2) / 3;
    leaf(b, [cx, cy, cz], [cx + Math.cos(a + 0.13) * len * 0.5, cy + Math.sin(a + 0.13) * len * 0.5, cz], [cx + Math.cos(a - 0.03) * len, cy + Math.sin(a - 0.03) * len, cz], color);
  }
}

/**
 * The first piece of a style, in the builder's current frame (origin on the ground, about
 * five units across and up to fourteen tall at scale 1). It also marks the seat's heavy works.
 */
export function pieceA(b: Builder, P: Punk3, active: boolean, smoke: Smoke | null): void {
  switch (P.style) {
    case 'steam': {
      // A boiler house and its great banded stack.
      b.box(-0.9, 0, 0, 2.6, 1.8, 2.2, P.walls[0]);
      b.gable(-0.9, 1.8, 0, 2.6, 0.9, 2.2, P.roofs[0], 0, 0.2, P.walls[0]);
      b.cyl(1.6, 0, 0, 0.8, 0.5, 10, 7, P.roofs[1]);
      b.torus(1.6, 6.4, 0, 0.66, 0.11, P.accent, 7, 3);
      b.torus(1.6, 8.9, 0, 0.58, 0.11, P.accent, 7, 3);
      b.cyl(1.6, 10, 0, 0.6, 0.58, 0.35, 7, SOOT);
      b.cyl(-1.4, 0, 1.5, 0.5, 0.5, 1.5, 7, P.accent, P.metal);
      if (active && smoke) smoke(1.6, 10.6, 0, 1.05);
      break;
    }
    case 'diesel': {
      // A tank farm under a searchlight.
      for (let i = 0; i < 3; i++) {
        const x = -1.5 + (i % 2) * 2.5, z = -1.2 + Math.floor(i / 2) * 2.4 + (i % 2) * 0.4;
        b.cyl(x, 0, z, 1.1, 1.1, 1.9, 8, P.walls[0], P.walls[1]);
        b.torus(x, 1.25, z, 1.12, 0.08, P.accent, 8, 3);
        b.dome(x, 1.9, z, 1.1, P.walls[1], 8, 2, 0.3);
      }
      b.beam([-1.5, 1.4, -1.2], [1, 1.4, -0.8], 0.16, P.metal);
      b.box(2.4, 0, 1.8, 0.8, 1.1, 0.8, P.metal);
      b.cyl(2.4, 1.1, 1.8, 0.4, 0.55, 0.55, 6, P.metal, P.glow);
      if (active) b.beam([2.4, 1.6, 1.8], [5.6, 13.5, 4.4], 0.36, P.glow);
      break;
    }
    case 'electric': {
      // A coil tower: lattice, verdigris rings, a copper ball and, when it runs, arcs.
      for (const [a0, a1] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam([a0 * 1.3, 0, a1 * 1.3], [a0 * 0.3, 7.4, a1 * 0.3], 0.18, P.metal);
      b.box(0, 2.6, 0, 1.9, 0.14, 1.9, P.metal);
      b.box(0, 5.1, 0, 1.2, 0.14, 1.2, P.metal);
      b.torus(0, 7.6, 0, 1.15, 0.2, P.roofs[0], 9, 4);
      b.torus(0, 8.3, 0, 1.45, 0.22, P.roofs[1], 9, 4);
      b.ball(0, 9.8, 0, 1.05, P.accent, 7);
      if (active) {
        const arcs: number[][][] = [
          [[0.9, 10.2, 0.2], [2.3, 11.3, 0.7], [1.9, 9.9, 1.3], [3.5, 10.6, 1.7]],
          [[-0.9, 10.1, -0.3], [-2.4, 10.9, -0.2], [-2, 9.6, -1.2], [-3.6, 9.5, -1.6]],
          [[0.1, 10.8, 0], [-0.7, 12.3, 0.5], [0.6, 12.2, -0.3], [0.1, 13.8, 0.2]],
        ];
        for (const arc of arcs) for (let i = 0; i + 1 < arc.length; i++) b.beam(arc[i], arc[i + 1], 0.12, P.glow);
      }
      break;
    }
    case 'clockwork': {
      // A great brass wheel on its trestle, meshed with a smaller one.
      for (const z of [-0.6, 0.6]) {
        b.beam([-2, 0, z], [0, 4.4, z], 0.22, P.roofs[1]);
        b.beam([2, 0, z], [0, 4.4, z], 0.22, P.roofs[1]);
      }
      b.beam([0, 4.4, -0.8], [0, 4.4, 0.8], 0.26, P.metal);
      gear(b, 0, 4.4, 0, 3, P.accent, P.walls[0], 12);
      gear(b, 3.9, 1.9, 0.3, 1.35, P.metal, P.walls[0], 8);
      break;
    }
    case 'atomic': {
      // A needle with a ball and its orbits, on a flared foot.
      b.cyl(0, 0, 0, 1.7, 0.3, 2.6, 8, P.roofs[1]);
      b.cyl(0, 0, 0, 0.24, 0.04, 12.5, 5, WHITE);
      b.ball(0, 8.4, 0, 0.85, P.accent, 7);
      b.torus(0, 8.4, 0, 2.3, 0.1, P.accent, 12, 3, 'y');
      b.torus(0, 8.4, 0, 2.3, 0.1, P.roofs[0], 12, 3, 'z');
      b.torus(0, 8.4, 0, 2.3, 0.1, P.roofs[1], 12, 3, 'z', Math.PI / 2);
      break;
    }
    case 'neon': {
      // A dark tower hung with signs, a red lamp on its mast.
      b.box(0, 0, 0, 2.3, 10, 2.3, P.walls[0]);
      b.box(0, 10, 0, 1.6, 0.9, 1.6, P.walls[1]);
      b.box(0.4, 10.9, 0.2, 0.12, 3.4, 0.12, P.metal);
      b.box(0.4, 14.3, 0.2, 0.3, 0.3, 0.3, RED);
      b.box(1.3, 3.2, 0.2, 0.22, 4.8, 1.2, P.accent);
      b.box(-1.3, 5.6, -0.2, 0.22, 3, 1, P.glow);
      b.box(0, 6.8, 1.3, 1.5, 1.3, 0.22, P.glow);
      b.box(0, 2, -1.3, 1.6, 0.9, 0.22, P.accent);
      for (let i = 0; i < 4; i++) b.box(0, 1.2 + i * 2.2, 1.17, 1.7, 0.26, 0.06, i % 2 ? P.glass : P.glow);
      break;
    }
    case 'organic': {
      // Culture vats: glass over green liquor, piped together under a planted canopy.
      for (const [x, z, h] of [[-1.2, 0.4, 3.4], [1.3, -0.5, 2.6]]) {
        b.cyl(x, 0, z, 1.12, 1.12, 0.4, 8, P.metal);
        b.cyl(x, 0.4, z, 1.02, 1.02, h * 0.5, 8, P.glow);
        b.cyl(x, 0.4 + h * 0.5, z, 1, 1, h * 0.5, 8, P.glass);
        b.dome(x, 0.4 + h, z, 1, P.glass, 8, 2, 0.8);
      }
      b.beam([-1.2, 2.4, 0.4], [1.3, 2.2, -0.5], 0.18, P.metal);
      b.cyl(0.4, 0, 2, 0.24, 0.16, 3, 5, [0.42, 0.32, 0.2]);
      b.ball(0.4, 3.9, 2, 1.5, P.roofs[0], 6);
      b.ball(-0.5, 4.3, 1.5, 0.9, P.roofs[1], 5);
      b.ball(1.3, 4.6, 2.3, 0.34, P.accent, 5);
      b.ball(0, 5.1, 2.2, 0.3, P.accent, 5);
      break;
    }
    case 'chrome': {
      // A mirrored monolith in its halo, with drones on station.
      b.box(0, 0, 0, 1.9, 11.5, 1.2, P.walls[1], 0.3, 0.84, WHITE);
      b.box(0, 0, 0, 2.2, 0.3, 1.5, WHITE, 0.3);
      b.box(0, 7.8, 0, 1.76, 0.14, 1.12, P.accent, 0.3);
      b.torus(0, 12.2, 0, 1.9, 0.08, P.accent, 12, 3, 'y');
      for (const [x, y, z] of [[-2.8, 8.6, 1], [2.9, 6.2, -1.2], [1.6, 10.6, 2.2]]) {
        b.box(x, y, z, 0.8, 0.14, 0.8, P.metal, 0.6);
        b.box(x, y - 0.24, z, 0.26, 0.24, 0.26, active ? P.glow : P.metal);
      }
      break;
    }
    case 'solar': {
      // A sun flower of glass petals beside a wind turbine.
      b.cyl(-1.4, 0, 0, 0.2, 0.14, 3.4, 5, WHITE);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a), c1 = Math.cos(a + 0.42), s1 = Math.sin(a + 0.42);
        panel(b, [-1.4 + c * 0.4, 3.4, s * 0.4], [-1.4 + c * 2.2, 4.3, s * 2.2], [-1.4 + c1 * 2.2, 4.3, s1 * 2.2], [-1.4 + c1 * 0.4, 3.4, s1 * 0.4], i % 2 ? P.roofs[1] : P.accent);
      }
      b.dome(-1.4, 3.4, 0, 0.5, P.glow, 6, 2);
      b.cyl(2, 0, -0.6, 0.26, 0.12, 9.6, 6, WHITE);
      b.box(2, 9.5, -0.3, 0.4, 0.4, 0.9, WHITE);
      blades(b, 2, 9.7, 0.2, 3.6, 0.5, WHITE);
      break;
    }
    case 'rocket': {
      // A booster on its stand beside the gantry.
      b.cyl(0, 0, 0, 2.7, 2.7, 0.25, 10, P.walls[1]);
      b.cyl(0, 0.6, 0, 0.62, 0.62, 6, 8, WHITE);
      b.cyl(0, 3.2, 0, 0.64, 0.64, 0.5, 8, P.accent);
      b.cyl(0, 4.6, 0, 0.64, 0.64, 0.4, 8, P.roofs[1]);
      b.cyl(0, 6.6, 0, 0.62, 0, 1.6, 8, P.accent);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        leaf(b, [Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6], [Math.cos(a) * 1.4, 0.6, Math.sin(a) * 1.4], [Math.cos(a) * 0.6, 2.2, Math.sin(a) * 0.6], P.accent);
      }
      for (const [a0, a1] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) b.beam([1.8 + a0, 0.25, a1], [1.8 + a0, 7.6, a1], 0.14, P.accent);
      for (let k = 0; k < 4; k++) { b.box(1.8, 1.4 + k * 1.8, 0, 1.1, 0.1, 1.1, P.accent); b.beam([1.3, 1.4 + k * 1.8, 0], [0.6, 1.4 + k * 1.8, 0], 0.09, P.metal); }
      b.box(1.8, 7.6, 0, 1.3, 0.25, 1.3, P.metal);
      break;
    }
  }
}

/** The second piece of a style: the building that completes its skyline. */
export function pieceB(b: Builder, P: Punk3, active: boolean, smoke: Smoke | null, own: RGB): void {
  switch (P.style) {
    case 'steam': {
      // A gasometer in its guide frame.
      b.cyl(0, 0, 0, 2.3, 2.3, 2.7, 10, P.metal);
      b.torus(0, 1.4, 0, 2.32, 0.09, P.accent, 10, 3);
      b.dome(0, 2.7, 0, 2.3, scaleRgb(P.metal, 0.86), 10, 2, 0.32);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.beam([Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6], [Math.cos(a) * 2.6, 5.4, Math.sin(a) * 2.6], 0.14, P.roofs[0]);
      }
      b.torus(0, 5.4, 0, 2.6, 0.08, P.roofs[0], 12, 3);
      b.torus(0, 3.4, 0, 2.6, 0.06, P.roofs[0], 12, 3);
      break;
    }
    case 'diesel': {
      // A ribbed hangar with the seat's stripe over its doors.
      vault(b, 0, 5.6, 2.6, 2.5, P.roofs[1], P.walls[1]);
      for (const x of [-1.9, 0, 1.9]) vault(b, 0, 0.22, 2.68, 2.58, P.metal, P.metal);
      b.box(2.82, 0, 0, 0.1, 1.7, 2.8, DARK);
      b.box(2.84, 1.8, 0, 0.1, 0.3, 3, own);
      b.box(-3.6, 0, 1.6, 0.8, 1, 0.8, P.metal);
      b.cyl(-3.6, 1, 1.6, 0.4, 0.55, 0.5, 6, P.metal, P.glow);
      if (active) b.beam([-3.6, 1.5, 1.6], [-6.5, 12.5, -1.5], 0.34, P.glow);
      break;
    }
    case 'electric': {
      // The domed exchange, and a tram under its wire.
      b.box(0, 0, 0, 4.4, 2.3, 3, P.walls[0]);
      b.box(0, 0.9, 0, 4.46, 0.7, 3.06, P.glass);
      b.cyl(0, 2.3, 0, 1.75, 1.75, 0.6, 9, P.walls[1]);
      b.dome(0, 2.9, 0, 1.75, P.roofs[0], 9, 3, 1.05, P.roofs[1]);
      b.cyl(0, 4.7, 0, 0.26, 0.2, 0.6, 5, P.accent);
      for (const x of [-3.4, 3.4]) b.box(x, 0, 2.7, 0.14, 2.6, 0.14, P.metal);
      b.beam([-3.4, 2.6, 2.7], [3.4, 2.6, 2.7], 0.06, DARK);
      b.box(-0.8, 0.15, 2.7, 2.4, 1.1, 0.9, P.accent);
      b.box(-0.8, 0.75, 2.7, 2.46, 0.36, 0.96, P.glass);
      b.box(-0.8, 1.25, 2.7, 2.5, 0.12, 1, own);
      b.beam([-0.6, 1.3, 2.7], [-0.2, 2.6, 2.7], 0.06, DARK);
      break;
    }
    case 'clockwork': {
      // The clock tower: a face on every side under a verdigris spire.
      b.box(0, 0, 0, 2, 8.4, 2, P.walls[1]);
      b.box(0, 8.4, 0, 2.3, 0.3, 2.3, P.accent);
      for (const [rot] of [[0], [Math.PI / 2]]) {
        b.push(0, 0, 0, rot);
        face(b, 0, 6.6, 1.04, 0.8, CREAM);
        face(b, 0, 6.6, -1.04, 0.8, CREAM);
        b.beam([0, 6.6, 1.08], [0, 7.2, 1.08], 0.07, DARK);
        b.beam([0, 6.6, 1.08], [0.4, 6.4, 1.08], 0.07, DARK);
        b.beam([0, 6.6, -1.08], [0, 7.2, -1.08], 0.07, DARK);
        b.pop();
      }
      b.hip(0, 8.7, 0, 2, 3.8, 2, P.roofs[0], 0, 0, 0.2);
      b.cyl(0, 12.4, 0, 0.16, 0, 0.9, 4, P.accent);
      gear(b, 0, 2.2, 1.12, 0.9, P.accent, P.walls[0], 8);
      break;
    }
    case 'atomic': {
      // A cooling tower under its cloud, and the reactor dome.
      b.cyl(-1.6, 0, 0, 2.5, 1.5, 3.8, 10, WHITE);
      b.cyl(-1.6, 3.8, 0, 1.5, 1.95, 2.6, 10, WHITE, [0.72, 0.74, 0.76]);
      b.torus(-1.6, 3.8, 0, 1.54, 0.1, P.roofs[0], 10, 3);
      if (active && smoke) smoke(-1.6, 7, 0, 1.3);
      b.cyl(2.6, 0, 0.8, 1.9, 1.9, 1.1, 9, P.walls[1]);
      b.dome(2.6, 1.1, 0.8, 1.9, WHITE, 9, 3, 1, P.roofs[1]);
      b.cyl(2.6, 3, 0.8, 0.12, 0, 1.4, 4, P.accent);
      break;
    }
    case 'neon': {
      // The great board over the street, and a block with its rooftop sign.
      b.box(-1.6, 0, 0, 0.26, 5.2, 0.26, P.metal);
      b.box(1.6, 0, 0, 0.26, 5.2, 0.26, P.metal);
      b.box(0, 3, 0, 4.6, 2.5, 0.3, P.glow);
      b.box(0, 4.5, 0.18, 3.4, 0.4, 0.06, P.accent);
      b.box(-0.5, 3.6, 0.18, 2.4, 0.4, 0.06, P.accent);
      b.box(0, 4.5, -0.18, 3.4, 0.4, 0.06, P.accent);
      b.box(-0.5, 3.6, -0.18, 2.4, 0.4, 0.06, P.accent);
      b.box(0.4, 0, -2.6, 3.4, 4.4, 2.2, P.walls[1]);
      b.box(0.4, 4.4, -2.6, 2.6, 1.1, 0.22, P.accent);
      for (let i = 0; i < 3; i++) b.box(0.4, 0.9 + i * 1.2, -1.47, 2.8, 0.24, 0.06, i % 2 ? P.glow : P.glass);
      break;
    }
    case 'organic': {
      // A grown tower: a gourd in bands of green, lit at its pores.
      b.cyl(0, 0, 0, 1.5, 2.4, 3.2, 8, P.roofs[1]);
      b.cyl(0, 3.2, 0, 2.4, 1.9, 2.8, 8, P.roofs[0]);
      b.cyl(0, 6, 0, 1.9, 0.8, 3.2, 8, P.roofs[1]);
      b.dome(0, 9.2, 0, 0.8, P.roofs[0], 8, 2, 1.6);
      b.torus(0, 3.2, 0, 2.5, 0.2, P.walls[0], 8, 3);
      b.torus(0, 6, 0, 2, 0.18, P.walls[0], 8, 3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const y = 1.6 + (i % 3) * 2.2, r = y < 3 ? 2.05 : y < 6 ? 2.2 : 1.5;
        b.box(Math.cos(a) * r, y, Math.sin(a) * r, 0.36, 0.5, 0.36, active ? P.glow : P.walls[0], -a);
      }
      break;
    }
    case 'chrome': {
      // Two slabs of sky-coloured glass over a lit plinth.
      b.box(0, 0, 0, 5, 0.4, 3, WHITE);
      b.box(0, 0.4, 0, 4.4, 0.2, 2.4, active ? P.glow : P.metal);
      b.box(-1, 0.6, 0.2, 1.4, 8.6, 0.5, P.walls[1], 0.25, 0.9, WHITE);
      b.box(1.1, 0.6, -0.3, 1.2, 6.2, 0.5, P.roofs[0], -0.2, 0.9, WHITE);
      b.box(-1, 5.4, 0.2, 1.34, 0.1, 0.5, P.accent, 0.25);
      break;
    }
    case 'solar': {
      // A glasshouse dome, and rows of tilted panels in a garden.
      b.cyl(0, 0, 0, 2.7, 2.7, 0.5, 10, WHITE);
      b.dome(0, 0.5, 0, 2.6, P.glass, 10, 3, 0.9, mixRgb(P.glass, WHITE, 0.45));
      b.cyl(0, 2.8, 0, 0.2, 0, 0.7, 5, P.accent);
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 3; j++) {
          const x = 3.7 + i * 1.9, z = -1.9 + j * 1.9;
          b.box(x, 0, z, 0.12, 0.7, 0.12, P.metal);
          panel(b, [x - 0.8, 0.5, z - 0.8], [x - 0.8, 0.5, z + 0.8], [x + 0.8, 1.3, z + 0.8], [x + 0.8, 1.3, z - 0.8], P.roofs[1]);
        }
      }
      b.ball(-3.4, 1.6, 0.8, 1.1, P.roofs[0], 6);
      b.cyl(-3.4, 0, 0.8, 0.18, 0.14, 1, 5, [0.42, 0.32, 0.2]);
      break;
    }
    case 'rocket': {
      // The tracking dish and a propellant sphere in the programme's colours.
      b.cyl(-1.4, 0, 0, 0.5, 0.36, 2.2, 6, P.walls[1]);
      b.push(-1.4, 2.2, 0, 0.7);
      b.cyl(0, 0, 0, 0.3, 2.2, 1, 10, WHITE, P.walls[1]);
      b.beam([0, 0.2, 0], [0, 2, 0], 0.09, P.metal);
      b.box(0, 2, 0, 0.3, 0.3, 0.3, P.accent);
      b.pop();
      for (const [a0, a1] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) b.beam([2.6 + a0, 0, a1], [2.6 + a0 * 0.6, 1.4, a1 * 0.6], 0.12, P.metal);
      b.ball(2.6, 2.3, 0, 1.3, WHITE, 8);
      b.torus(2.6, 2.3, 0, 1.3, 0.1, P.accent, 8, 3);
      b.box(2.6, 3.5, 0, 0.3, 0.5, 0.3, P.roofs[1]);
      break;
    }
  }
}

export interface PunkTownOpts {
  /** 0 village, 1 town, 2 city, 3 metropolis. */
  rank: number;
  /** Settlement radius, plaza radius and the height of the kit's skyline. */
  R: number;
  plaza: number;
  height: number;
  own: RGB;
  /** Fixed per region: where round the town the pieces stand. */
  angle: number;
  remembered: boolean;
}

/** Where round a settlement the style's pieces stand: angle, radius, scale, which piece. */
export function punkSites(o: PunkTownOpts): { a: number; d: number; s: number; piece: 'a' | 'b' }[] {
  if (o.rank <= 0) return [{ a: o.angle, d: o.R - 2.2, s: 0.5, piece: 'a' }];
  const s = o.rank === 1 ? 0.78 : o.rank === 2 ? 1.05 : 1.3;
  const d = o.R - 2.4 - 2.2 * s;
  const out: { a: number; d: number; s: number; piece: 'a' | 'b' }[] = [
    { a: o.angle, d, s, piece: 'a' },
    { a: o.angle + 2.5, d, s, piece: 'b' },
  ];
  if (o.rank >= 3) out.push({ a: o.angle + 4.4, d: d - 1, s: s * 0.86, piece: 'a' });
  return out;
}

/** The style's pieces round a settlement at (cx, cz), and whatever it keeps in the sky. */
export function punkLandmarks(b: Builder, G: (x: number, z: number) => number, cx: number, cz: number, P: Punk3, o: PunkTownOpts, pushSmoke: (wx: number, wy: number, wz: number, size: number) => void): void {
  const active = !o.remembered;
  for (const site of punkSites(o)) {
    const x = cx + Math.cos(site.a) * site.d, z = cz + Math.sin(site.a) * site.d;
    b.push(x, G(x, z) - 0.08, z, -site.a + Math.PI / 2, site.s);
    const smoke: Smoke = (lx, ly, lz, size) => {
      const [wx, wy, wz] = b.world(lx, ly, lz);
      pushSmoke(wx, wy, wz, size * site.s);
    };
    if (site.piece === 'a') pieceA(b, P, active, active ? smoke : null);
    else pieceB(b, P, active, active ? smoke : null, o.own);
    b.pop();
  }
  if (o.rank <= 0) return;
  const g0 = G(cx, cz);
  const s = o.rank === 1 ? 0.75 : o.rank === 2 ? 1 : 1.25;
  if (P.style === 'steam') {
    // An airship riding over the roofs, in the seat's colours.
    const ax = cx + Math.cos(o.angle + 1.2) * o.R * 0.3, az = cz + Math.sin(o.angle + 1.2) * o.R * 0.3;
    b.push(ax, g0 + o.height + 4.5 * s, az, o.angle, s);
    spindle(b, 0, 7.4, 1.25, P.walls[1], o.own);
    b.box(0.2, -1.75, 0, 1.8, 0.5, 0.7, P.roofs[1]);
    b.beam([-0.5, -1.25, 0], [-0.5, -0.9, 0], 0.07, DARK);
    b.beam([0.9, -1.25, 0], [0.9, -0.9, 0], 0.07, DARK);
    leaf(b, [-3.3, 0, 0], [-4.2, 1.3, 0], [-2.4, 0.5, 0], P.accent);
    leaf(b, [-3.3, 0, 0], [-4.2, -1.1, 0], [-2.4, -0.4, 0], P.accent);
    leaf(b, [-3.3, 0, 0], [-4.2, 0, 1.2], [-2.4, 0, 0.5], P.accent);
    leaf(b, [-3.3, 0, 0], [-4.2, 0, -1.2], [-2.4, 0, -0.5], P.accent);
    b.pop();
  } else if (P.style === 'chrome' && o.rank >= 2) {
    // More drones over a city.
    for (let i = 0; i < 4; i++) {
      const a = o.angle + i * 1.7, d = o.R * (0.25 + (i % 3) * 0.14);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      b.box(x, g0 + o.height * (0.72 + (i % 2) * 0.22), z, 0.9 * s, 0.14 * s, 0.9 * s, P.metal, a);
      b.box(x, g0 + o.height * (0.72 + (i % 2) * 0.22) - 0.26 * s, z, 0.28 * s, 0.26 * s, 0.28 * s, active ? P.glow : P.metal);
    }
  } else if (P.style === 'neon' && o.rank >= 2) {
    // A skyway of light between the towers.
    const a = o.angle + 0.8;
    const y = g0 + o.height * 0.55;
    b.beam([cx + Math.cos(a) * o.plaza * 1.6, y, cz + Math.sin(a) * o.plaza * 1.6], [cx - Math.cos(a) * o.plaza * 1.4, y + 0.6, cz - Math.sin(a) * o.plaza * 1.4], 0.22 * s, active ? P.glow : P.metal);
    b.beam([cx + Math.cos(a + 1.4) * o.plaza * 1.7, y - 1.6, cz + Math.sin(a + 1.4) * o.plaza * 1.7], [cx - Math.cos(a + 1.4) * o.plaza * 1.2, y - 1.2, cz - Math.sin(a + 1.4) * o.plaza * 1.2], 0.2 * s, active ? P.accent : P.metal);
  }
}
