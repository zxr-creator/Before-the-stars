// Where things are drawn: real directions, compressed distances and exaggerated sizes, shared
// by the flat schematic and the 3D orrery so both tiers show the same picture.
//
// Scene units: the Earth's drawn radius is 1. Scene axes follow three.js: the ecliptic is the
// X–Z plane and +Y points to ecliptic north; seen from above (+Y), screen right is +X and screen
// up is −Z, so the planets turn counter-clockwise as they do in the sky.
//
// Distances from the Sun are logarithmic (R = 100 · ln(1 + r / 0.25 AU)): Mercury sits at 94,
// the Earth at 161, Jupiter at 308 and Neptune at 480. Around a planet its moons and orbits use a
// second logarithmic scale in units of the planet's drawn radius, so the Moon stands ten Earth
// radii out instead of sixty and the Galilean moons fan out from Io to Callisto.
import { BODIES, BODY, MOONS_OF, daysSinceJ2000, heliocentric, moonAngle, type Body, type BodyId } from './astro';
import type { HistoricalDate } from '../protocol';

export type Vec3 = [number, number, number];

const AU_K = 100;
const AU_R0 = 0.25;
const EARTH_KM = 6371;

/** Drawn distance from the Sun for a real one in AU. */
export function radialAU(r: number): number {
  return AU_K * Math.log(1 + r / AU_R0);
}

function toScene(p: [number, number, number]): Vec3 {
  const r = Math.hypot(p[0], p[1], p[2]);
  if (r < 1e-9) return [0, 0, 0];
  const s = radialAU(r) / r;
  return [p[0] * s, p[2] * s, -p[1] * s];
}

/** Drawn radius of a body before any on-screen minimum (scene units). */
export function baseRadius(b: Body): number {
  if (b.kind === 'star') return 9;
  if (b.kind === 'cluster') return 0.3;
  return Math.max(0.14, Math.pow(b.radiusKm / EARTH_KM, 0.45));
}

/** Drawn distance of a moon from its parent's centre. */
export function moonDistance(m: Body): number {
  const p = BODY[m.parent!];
  return baseRadius(p) * (1.8 + 2.0 * Math.log(m.moon!.aKm / p.radiusKm));
}

/** Drawn extent of a planet's moon system (the farthest moon), or its own radius. */
export function systemExtent(id: BodyId): number {
  const ms = MOONS_OF[id];
  if (!ms?.length) return baseRadius(BODY[id]);
  return Math.max(...ms.map((m) => moonDistance(BODY[m])));
}

export interface SceneLayout {
  days: number;
  pos: Record<BodyId, Vec3>;
  /** Distance from the Sun in AU (moons: their parent's). */
  rAU: Record<BodyId, number>;
  /** Sampled heliocentric orbits (closed loops). */
  orbits: Partial<Record<BodyId, Vec3[]>>;
  /** Lagrange points of chapter 39's orbits. */
  lagrange: { eml1: Vec3; eml5: Vec3; sel2: Vec3 };
  /** Main Belt particles (x, y, z triplets). */
  belt: Float32Array;
  /** Near-Earth asteroid cluster particles. */
  nea: Float32Array;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const orbitCache = new Map<string, Vec3[]>();

/** Positions of every body for a match date. Pure and deterministic. */
export function layoutFor(date: HistoricalDate | null | undefined, month: number): SceneLayout {
  const days = daysSinceJ2000(date, month);
  const T = days / 36525;
  const pos = {} as Record<BodyId, Vec3>;
  const rAU = {} as Record<BodyId, number>;
  const orbits: Partial<Record<BodyId, Vec3[]>> = {};
  pos.sun = [0, 0, 0];
  rAU.sun = 0;
  for (const b of BODIES) {
    if (!b.el) continue;
    const p = heliocentric(b.el, T);
    pos[b.id] = toScene(p);
    rAU[b.id] = Math.hypot(p[0], p[1], p[2]);
    // Orbits change slowly: one sampling per body per century is plenty.
    const key = `${b.id}:${Math.round(T)}`;
    let path = orbitCache.get(key);
    if (!path) {
      path = [];
      const n = b.el.e > 0.15 ? 220 : 160;
      for (let k = 0; k < n; k++) path.push(toScene(heliocentric(b.el, Math.round(T), (360 * k) / n)));
      orbitCache.set(key, path);
    }
    orbits[b.id] = path;
  }
  for (const b of BODIES) {
    if (!b.moon) continue;
    const p = pos[b.parent!];
    const a = moonAngle(b, days);
    const d = moonDistance(b);
    // Ecliptic longitude a: scene x = cos a, scene z = −sin a.
    pos[b.id] = [p[0] + d * Math.cos(a), p[1], p[2] - d * Math.sin(a)];
    rAU[b.id] = rAU[b.parent!];
  }
  // Lagrange points: L1 between the Earth and the Moon near the Moon, L5 trailing the Moon by 60°,
  // Sun–Earth L2 beyond the Earth on the far side from the Sun.
  const e = pos.earth, m = pos.moon;
  const dm = moonDistance(BODY.moon);
  const ma = Math.atan2(-(m[2] - e[2]), m[0] - e[0]);
  const l5 = ma - Math.PI / 3;
  const away = Math.hypot(e[0], e[2]) || 1;
  const sel2d = dm * 1.32;
  const lagrange = {
    eml1: [e[0] + (m[0] - e[0]) * 0.8, e[1], e[2] + (m[2] - e[2]) * 0.8] as Vec3,
    eml5: [e[0] + dm * Math.cos(l5), e[1], e[2] - dm * Math.sin(l5)] as Vec3,
    sel2: [e[0] + (e[0] / away) * sel2d, e[1], e[2] + (e[2] / away) * sel2d] as Vec3,
  };
  // The Main Belt: deterministic particles that keep their Keplerian pace from date to date.
  const R = rng(0xbe17);
  const nBelt = 1400;
  const belt = new Float32Array(nBelt * 3);
  for (let k = 0; k < nBelt; k++) {
    const a = 2.15 + Math.pow(R(), 0.8) * 1.2;
    const P = Math.pow(a, 1.5) * 365.25;
    const ang = R() * Math.PI * 2 + (days / P) * Math.PI * 2;
    const rr = radialAU(a * (1 + (R() - 0.5) * 0.12));
    belt[k * 3] = rr * Math.cos(ang);
    belt[k * 3 + 1] = (R() - 0.5) * rr * 0.05;
    belt[k * 3 + 2] = -rr * Math.sin(ang);
  }
  const RN = rng(0x0e5a);
  const nNea = 18;
  const nea = new Float32Array(nNea * 3);
  const ne = BODY.nea.el!;
  for (let k = 0; k < nNea; k++) {
    const p = toScene(heliocentric(ne, T, (RN() - 0.5) * 34));
    const j = 1 + (RN() - 0.5) * 0.08;
    nea[k * 3] = p[0] * j;
    nea[k * 3 + 1] = p[1] + (RN() - 0.5) * 2;
    nea[k * 3 + 2] = p[2] * j;
  }
  return { days, pos, rAU, orbits, lagrange, belt, nea };
}

// --- camera ---------------------------------------------------------------------------------

export interface Cam {
  /** The body the view follows. */
  focus: BodyId;
  /** Offset of the view target from the followed point (scene units, in the ecliptic plane). */
  pan: Vec3;
  /** Distance of the camera from its target. */
  dist: number;
  /** 3D: turn about the vertical (radians). */
  yaw: number;
  /** 3D: added to the automatic pitch, fading out as the view pulls back. */
  pitchOff: number;
}

export const DIST_MIN = 1.7;
export const DIST_MAX = 2600;
export const FOV_DEG = 34;

/** Scale bands for the explicit controls. */
export type Band = 'globe' | 'orbit' | 'inner' | 'system';
export const BAND_DIST: Record<Band, number> = { globe: 4.6, orbit: 46, inner: 620, system: 1500 };

/** The band a camera distance belongs to. */
export function bandOf(dist: number): Band {
  if (dist < 12) return 'globe';
  if (dist < 180) return 'orbit';
  if (dist < 1000) return 'inner';
  return 'system';
}

/** Distance from which the view stops following a body and drifts towards its parent. */
function hold(id: BodyId): number {
  const b = BODY[id];
  if (b.kind === 'star') return Infinity;
  if (b.kind === 'moon') return baseRadius(b) * 26;
  return Math.max(baseRadius(b) * 30, systemExtent(id) * 4.5);
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** The point the camera looks at: the followed body, drifting to its parent and then to the Sun as the view pulls back. */
export function camTarget(cam: Cam, L: SceneLayout): Vec3 {
  const chain: BodyId[] = [];
  for (let id: BodyId | null = cam.focus; id; id = BODY[id].parent) chain.push(id);
  if (chain[chain.length - 1] !== 'sun') chain.push('sun');
  let p: Vec3 = [...L.pos[chain[0]]];
  for (let k = 0; k + 1 < chain.length; k++) {
    const h = hold(chain[k]);
    const w = smooth(Math.log(h), Math.log(h * 7), Math.log(cam.dist));
    const q = L.pos[chain[k + 1]];
    p = [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w];
  }
  return [p[0] + cam.pan[0], p[1] + cam.pan[1], p[2] + cam.pan[2]];
}

/** Pitch above the ecliptic: low and scenic near a body, steeper and map-like far out. */
export function camPitch(cam: Cam): number {
  const t = smooth(Math.log(6), Math.log(1100), Math.log(cam.dist));
  const auto = 0.2 + 0.85 * t;
  const keep = 1 - smooth(Math.log(8), Math.log(90), Math.log(cam.dist));
  return Math.min(1.5, Math.max(-1.25, auto + cam.pitchOff * keep));
}

/** Camera position for a 3D view. */
export function camPosition(cam: Cam, target: Vec3): Vec3 {
  const p = camPitch(cam);
  return [
    target[0] + cam.dist * Math.cos(p) * Math.sin(cam.yaw),
    target[1] + cam.dist * Math.sin(p),
    target[2] + cam.dist * Math.cos(p) * Math.cos(cam.yaw),
  ];
}
