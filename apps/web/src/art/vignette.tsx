// Chronicle vignettes: original procedural spot illustrations for Historic
// Moment cards. Pure functions of the `art` string ("key:n") — no state, no
// effects, no ids, no external assets. Every scene is flat hand-tinted shapes
// under an ink outline so the set reads as one hand on parchment.
import type { JSX } from 'preact';

const INK = '#2b2620';
const PAPER = '#f3ead2';
const WALL = '#e6d9ba';
const WOOD = '#8b6b45';
const STONE = '#b3ac98';
const HEAD = '#dcc39a';
const LEAF = '#6f9a55';
const SLATE = '#4b4a46';

type O = Record<string, string | number>;
type El = JSX.Element;
const NS: O = { stroke: 'none' };
const THIN: O = { 'stroke-width': 1.2 };

interface Pal {
  sky: string; sky2: string; far: string; ground: string; ground2: string;
  accent: string; accent2: string; light: string; water: string; dark: boolean;
  /** Daylight land tint, kept when a space scene swaps in a dark sky. */
  land?: string;
}
interface Ctx { p: Pal; r: () => number; n: number }
type Scene = (c: Ctx) => El;

// 0 dawn ochre · 1 midday blue-green · 2 dusk rose · 3 night indigo · 4 winter grey · 5 harvest gold · 6 storm slate
const PALETTES: Pal[] = [
  { sky: '#ecd7a4', sky2: '#f5e8c4', far: '#cdb780', ground: '#b89a5c', ground2: '#8e7843', accent: '#b4482f', accent2: '#3f6f7a', light: '#f8e9a8', water: '#8fb0aa', dark: false },
  { sky: '#b7d2ce', sky2: '#dde9d8', far: '#98b7a0', ground: '#93aa6a', ground2: '#6c8750', accent: '#c05a36', accent2: '#34607c', light: '#fbf3d2', water: '#6f9fb0', dark: false },
  { sky: '#d9a594', sky2: '#f0cfa8', far: '#b08482', ground: '#8f716a', ground2: '#6a5157', accent: '#8f2f3a', accent2: '#3d5a78', light: '#f8dc9c', water: '#8a8fa6', dark: false },
  { sky: '#394469', sky2: '#525d86', far: '#465478', ground: '#46555a', ground2: '#2b353f', accent: '#d39a3c', accent2: '#7fa7b5', light: '#f3e7b6', water: '#55708c', dark: true },
  { sky: '#ced3d0', sky2: '#e8e8dc', far: '#a8afac', ground: '#bcc0b2', ground2: '#8e958b', accent: '#7c4636', accent2: '#4a6478', light: '#faf6ea', water: '#9db3bb', dark: false },
  { sky: '#e8cc84', sky2: '#f5e4b0', far: '#d0b266', ground: '#c8a03c', ground2: '#9a782a', accent: '#a23c20', accent2: '#4d6b4a', light: '#fcefb4', water: '#8fae9c', dark: false },
  { sky: '#6e7e87', sky2: '#9ba7a4', far: '#7b898b', ground: '#67745f', ground2: '#4a5647', accent: '#c8703a', accent2: '#d2caa6', light: '#ebe4c6', water: '#58737e', dark: true },
];
const SPACE_SKY = ['#232a45', '#1f2f44', '#33264a', '#1b2038', '#2b3242', '#2f2a3a', '#1c2b36'];
const SPACE_SKY2 = ['#3d4268', '#2f4a5e', '#573c60', '#303a64', '#465060', '#4f4354', '#2f4852'];
const SPACE_GROUND = ['#575040', '#44524a', '#54424c', '#3a4452', '#5a5e56', '#564c3c', '#3e4b4c'];

function spacePal(p: Pal, n: number): Pal {
  return { ...p, sky: SPACE_SKY[n], sky2: SPACE_SKY2[n], far: SPACE_SKY2[n], ground: SPACE_GROUND[n], ground2: '#2a2c30', dark: true, land: PALETTES[n === 3 || n === 6 ? 1 : n].ground };
}

// --- primitives --------------------------------------------------------------

const f = (v: number) => Math.round(v * 10) / 10;
const R = (x: number, y: number, w: number, h: number, fill: string, o?: O): El => <rect x={f(x)} y={f(y)} width={f(w)} height={f(h)} fill={fill} {...o} />;
const C = (x: number, y: number, r: number, fill: string, o?: O): El => <circle cx={f(x)} cy={f(y)} r={f(r)} fill={fill} {...o} />;
const E = (x: number, y: number, rx: number, ry: number, fill: string, o?: O): El => <ellipse cx={f(x)} cy={f(y)} rx={f(rx)} ry={f(ry)} fill={fill} {...o} />;
const D = (d: string, fill: string, o?: O): El => <path d={d} fill={fill} {...o} />;
const S = (d: string, o?: O): El => <path d={d} fill="none" {...o} />;
/** Build a path string from numbers and commands, rounding to 0.1. */
const pth = (...a: (string | number)[]) => a.map((v) => (typeof v === 'number' ? f(v) : v)).join(' ');

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
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

/** Rolling silhouette across the frame, closed at the bottom edge. */
function ridge(r: () => number, y: number, amp: number, steps = 5): string {
  const w = 328 / steps;
  const a: (string | number)[] = ['M', -4, y + (r() - 0.5) * amp];
  for (let i = 0; i < steps; i++) {
    const x0 = -4 + w * i;
    a.push('Q', x0 + w / 2, y - amp * (0.35 + r() * 0.75) * (i % 2 ? 1 : -0.25), x0 + w, y + (r() - 0.5) * amp * 0.5);
  }
  return pth(...a, 'L324 204L-4 204Z');
}

/** Line colour for thin work drawn against the sky: pale under a night sky, ink otherwise. */
const skyLine = (p: Pal): string => (lum(p.sky) < 0.3 ? '#cfc8b2' : INK);
function lum(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}

const spark = (x: number, y: number, s: number, fill: string, o: O = NS): El =>
  D(pth('M', x, y - s, 'Q', x, y, x + s, y, 'Q', x, y, x, y + s, 'Q', x, y, x - s, y, 'Q', x, y, x, y - s, 'Z'), fill, o);

const stars = (r: () => number, count: number, yMax: number, fill: string): El[] =>
  Array.from({ length: count }, (_, i) => {
    const x = r() * 320, y = r() * yMax, s = 0.6 + r() * 1.1;
    return i % 7 === 0 ? spark(x, y, s * 3.2, fill) : C(x, y, s, fill, NS);
  });

function celestial(c: Ctx, x: number, y: number, s = 15): El {
  const { p, r } = c;
  if (p.dark) {
    return <>
      {stars(r, 9, 70, p.light)}
      {C(x, y, s * 0.85, p.light, THIN)}
      {C(x + s * 0.4, y - s * 0.25, s * 0.72, p.sky, NS)}
    </>;
  }
  return <>
    {C(x, y, s * 1.55, p.light, { ...NS, opacity: 0.4 })}
    {C(x, y, s, p.light, THIN)}
  </>;
}

interface BackOpts { sun?: boolean; far?: boolean; hatch?: boolean; sunSize?: number }
/** Sky, horizon glow, sun or moon, distant ridge and ground. */
function backdrop(c: Ctx, hz = 126, o: BackOpts = {}): El {
  const { p, r } = c;
  const sx = r() < 0.5 ? 30 + r() * 62 : 228 + r() * 62, sy = 24 + r() * 26;
  return <>
    {R(-4, -4, 328, hz + 10, p.sky, NS)}
    {R(-4, hz - 42, 328, 48, p.sky2, { ...NS, opacity: 0.75 })}
    {o.sun !== false && celestial(c, sx, sy, o.sunSize)}
    {o.far !== false && D(ridge(r, hz - 8, 24), p.far, THIN)}
    {D(ridge(r, hz, 5, 4), p.ground)}
    {o.hatch !== false && hatch(c, hz)}
  </>;
}

/** A few woodcut ground strokes. */
function hatch(c: Ctx, hz: number, count = 7): El {
  const { r } = c;
  let d = '';
  for (let i = 0; i < count; i++) {
    const x = 8 + r() * 300, y = hz + 12 + r() * (188 - hz);
    d += pth('M', x, y, 'l', 7 + r() * 8, -1, 'M', x + 4, y + 3.5, 'l', 5 + r() * 5, -0.6);
  }
  return S(d, { 'stroke-width': 1, opacity: 0.4 });
}

const tent = (x: number, y: number, w: number, h: number, fill: string): El => <>
  {D(pth('M', x, y, 'L', x + w / 2, y - h, 'L', x + w, y, 'Z'), fill)}
  {D(pth('M', x + w * 0.37, y, 'L', x + w / 2, y - h * 0.62, 'L', x + w * 0.63, y, 'Z'), INK, NS)}
  {S(pth('M', x + w / 2 - 5, y - h - 8, 'L', x + w / 2 + 3, y - h + 5, 'M', x + w / 2 + 5, y - h - 8, 'L', x + w / 2 - 3, y - h + 5), { 'stroke-width': 1.3 })}
</>;

const fire = (x: number, y: number, s: number, p: Pal): El => <>
  {S(pth('M', x - s * 0.9, y + 1, 'L', x + s * 0.9, y - 2, 'M', x - s * 0.9, y - 2, 'L', x + s * 0.9, y + 1), { 'stroke-width': 2.6 })}
  {D(pth('M', x - s * 0.5, y, 'Q', x - s * 0.75, y - s * 0.7, x - s * 0.1, y - s * 1.6, 'Q', x, y - s * 0.9, x + s * 0.32, y - s * 1.15, 'Q', x + s * 0.8, y - s * 0.5, x + s * 0.5, y, 'Z'), p.accent, THIN)}
  {D(pth('M', x - s * 0.22, y, 'Q', x - s * 0.3, y - s * 0.5, x, y - s * 0.85, 'Q', x + s * 0.3, y - s * 0.4, x + s * 0.22, y, 'Z'), p.light, NS)}
</>;

const smoke = (x: number, y: number, s: number, fill = '#ece5d2', lean = 1): El[] =>
  [3, 2, 1, 0].map((i) => C(x + lean * i * s * 0.55 + (i % 2 ? s * 0.2 : 0), y - i * s * 0.95, s * (0.45 + i * 0.2), fill, { 'stroke-width': 1.1, opacity: 0.95 - i * 0.1 }));

const person = (x: number, y: number, s: number, fill: string, arm = 0): El => <>
  {D(pth('M', x - s * 0.24, y, 'L', x - s * 0.15, y - s * 0.6, 'Q', x, y - s * 0.74, x + s * 0.15, y - s * 0.6, 'L', x + s * 0.24, y, 'Z'), fill, { 'stroke-width': 1.3 })}
  {arm !== 0 && S(pth('M', x + arm * s * 0.12, y - s * 0.55, 'L', x + arm * s * 0.44, y - s * 0.8), { 'stroke-width': 1.7 })}
  {C(x, y - s * 0.84, s * 0.13, HEAD, THIN)}
</>;

const seated = (x: number, y: number, s: number, fill: string): El => <>
  {D(pth('M', x - s * 0.34, y, 'Q', x - s * 0.3, y - s * 0.46, x, y - s * 0.5, 'Q', x + s * 0.3, y - s * 0.46, x + s * 0.34, y, 'Z'), fill, { 'stroke-width': 1.3 })}
  {C(x, y - s * 0.63, s * 0.145, HEAD, THIN)}
</>;

const house = (x: number, y: number, w: number, h: number, wall: string, roof: string, rh = h * 0.75): El => <>
  {R(x, y - h, w, h, wall, { 'stroke-width': 1.4 })}
  {D(pth('M', x - 3, y - h, 'L', x + w / 2, y - h - rh, 'L', x + w + 3, y - h, 'Z'), roof, { 'stroke-width': 1.4 })}
  {R(x + w * 0.4, y - h * 0.55, w * 0.2, h * 0.55, INK, NS)}
</>;

const tree = (x: number, y: number, s: number, fill: string): El => <>
  {S(pth('M', x, y, 'L', x, y - s * 0.5), { 'stroke-width': 2.2 })}
  {C(x - s * 0.18, y - s * 0.6, s * 0.25, fill, THIN)}
  {C(x + s * 0.2, y - s * 0.57, s * 0.23, fill, THIN)}
  {C(x, y - s * 0.84, s * 0.27, fill, THIN)}
  {C(x, y - s * 0.66, s * 0.2, fill, NS)}
</>;

const pine = (x: number, y: number, s: number, fill: string): El => <>
  {S(pth('M', x, y, 'L', x, y - s * 0.2), { 'stroke-width': 2 })}
  {D(pth('M', x - s * 0.3, y - s * 0.15, 'L', x, y - s * 0.66, 'L', x + s * 0.3, y - s * 0.15, 'Z'), fill, THIN)}
  {D(pth('M', x - s * 0.22, y - s * 0.46, 'L', x, y - s, 'L', x + s * 0.22, y - s * 0.46, 'Z'), fill, THIN)}
</>;

/** kind 0 pennant · 1 swallowtail · 2 hanging gonfalon. */
const banner = (x: number, y: number, h: number, fill: string, kind = 0, dir = 1): El => <>
  {S(pth('M', x, y, 'L', x, y - h), { 'stroke-width': 1.7 })}
  {D(kind === 0 ? pth('M', x, y - h, 'l', dir * 26, 6, 'l', -dir * 26, 8, 'Z')
    : kind === 1 ? pth('M', x, y - h, 'h', dir * 24, 'l', -dir * 7, 8, 'l', dir * 7, 8, 'h', -dir * 24, 'Z')
      : pth('M', x, y - h, 'h', dir * 18, 'v', 24, 'l', -dir * 9, -6, 'l', -dir * 9, 6, 'Z'), fill, { 'stroke-width': 1.3 })}
</>;

const jar = (x: number, y: number, s: number, fill: string): El => <>
  {D(pth('M', x - s * 0.22, y - s, 'Q', x - s * 0.62, y - s * 0.55, x - s * 0.25, y, 'L', x + s * 0.25, y, 'Q', x + s * 0.62, y - s * 0.55, x + s * 0.22, y - s, 'Z'), fill, { 'stroke-width': 1.4 })}
  {S(pth('M', x - s * 0.28, y - s, 'L', x + s * 0.28, y - s), { 'stroke-width': 2.4 })}
  {S(pth('M', x - s * 0.37, y - s * 0.56, 'Q', x, y - s * 0.44, x + s * 0.37, y - s * 0.56), { 'stroke-width': 1 })}
</>;

const wheel = (x: number, y: number, r: number, fill = 'none', spokes = 4): El => {
  let d = '';
  for (let i = 0; i < spokes; i++) {
    const a = (Math.PI * i) / spokes + 0.3;
    d += pth('M', x - Math.cos(a) * r, y - Math.sin(a) * r, 'L', x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return <>
    {C(x, y, r, fill, { 'stroke-width': Math.max(1.6, r * 0.2) })}
    {S(d, { 'stroke-width': 1.1 })}
    {C(x, y, Math.max(1.4, r * 0.18), INK, NS)}
  </>;
};

const ripples = (x: number, y: number, p: Pal, count = 3): El => {
  let d = '';
  for (let i = 0; i < count; i++) d += pth('M', x + i * 34 - (i % 2) * 12, y + i * 9, 'q', 7, -3, 14, 0, 'q', 7, 3, 14, 0);
  return S(d, { stroke: p.light, 'stroke-width': 1.4, opacity: 0.8 });
};

const tuft = (x: number, y: number, s: number, color: string): El =>
  S(pth('M', x, y, 'l', -s * 0.5, -s, 'M', x, y, 'l', 0, -s * 1.3, 'M', x, y, 'l', s * 0.55, -s * 0.9), { stroke: color, 'stroke-width': 1.6 });

const flask = (x: number, y: number, s: number, liquid: string): El => <>
  {D(pth('M', x - s * 0.14, y - s, 'L', x + s * 0.14, y - s, 'L', x + s * 0.14, y - s * 0.6, 'L', x + s * 0.45, y, 'L', x - s * 0.45, y, 'L', x - s * 0.14, y - s * 0.6, 'Z'), '#e4ede4', { 'stroke-width': 1.4 })}
  {D(pth('M', x - s * 0.27, y - s * 0.34, 'L', x + s * 0.27, y - s * 0.34, 'L', x + s * 0.4, y - s * 0.06, 'L', x - s * 0.4, y - s * 0.06, 'Z'), liquid, NS)}
  {S(pth('M', x - s * 0.2, y - s, 'L', x + s * 0.2, y - s), { 'stroke-width': 2 })}
</>;

// --- scenes ------------------------------------------------------------------

const camp: Scene = (c) => {
  const { p, r } = c;
  const third = r() < 0.6;
  return <>
    {backdrop(c, 118)}
    {pine(20, 124, 38, p.ground2)}
    {pine(40, 122, 28, p.ground2)}
    {pine(298, 122, 34, p.ground2)}
    {D('M-4 156C50 142 110 176 176 166S270 156 324 176L324 204L-4 204Z', p.water)}
    {ripples(60, 178, p)}
    {tent(46, 146, 78, 58, '#d9c79c')}
    {third && tent(226, 142, 52, 38, p.far)}
    {tent(180, 150, 64, 48, WALL)}
    {smoke(152, 116, 9)}
    {fire(150, 154, 13, p)}
    {person(120, 156, 30, p.accent2)}
    {seated(172, 160, 22, p.ground2)}
  </>;
};

const fields: Scene = (c) => {
  const { p, r } = c;
  const vx = 150 + r() * 40;
  const furrows: El[] = [];
  for (let i = 0; i < 9; i++) furrows.push(S(pth('M', vx, 102, 'L', -120 + i * 70, 204), { stroke: p.ground2, 'stroke-width': 3.2 }));
  const sheaf = (x: number, y: number, s: number): El => <>
    {D(pth('M', x - s * 0.34, y, 'L', x - s * 0.1, y - s * 0.52, 'L', x - s * 0.4, y - s, 'L', x + s * 0.4, y - s, 'L', x + s * 0.1, y - s * 0.52, 'L', x + s * 0.34, y, 'Z'), '#e2c56a')}
    {S(pth('M', x - s * 0.14, y - s * 0.52, 'L', x + s * 0.14, y - s * 0.52), { stroke: p.accent, 'stroke-width': 3 })}
    {S(pth('M', x - s * 0.14, y - s * 0.6, 'L', x - s * 0.2, y - s * 0.95, 'M', x, y - s * 0.6, 'L', x, y - s * 0.95, 'M', x + s * 0.14, y - s * 0.6, 'L', x + s * 0.2, y - s * 0.95), { 'stroke-width': 1 })}
  </>;
  return <>
    {backdrop(c, 100, { hatch: false, sunSize: 20 })}
    {D(pth('M', vx, 102, 'L-4 134L-4 204L', vx - 60, 204, 'Z'), '#e2c56a', { ...NS, opacity: 0.75 })}
    {furrows}
    {house(236, 104, 24, 11, WALL, p.accent)}
    {tree(270, 104, 24, p.ground2)}
    {sheaf(64, 182, 46)}
    {sheaf(104, 190, 38)}
    {sheaf(30, 194, 34)}
    {person(238, 178, 40, p.accent2, -1)}
    {S('M214 142Q228 150 222 178', { 'stroke-width': 1.6 })}
  </>;
};

const granary: Scene = (c) => {
  const { p, r } = c;
  const thatch = '#c3a157';
  return <>
    {backdrop(c, 128)}
    {tree(34, 130, 34, p.ground2)}
    {S('M118 132V164M148 132V166M178 132V166M208 132V164', { 'stroke-width': 3.4 })}
    {R(108, 80, 110, 52, WALL)}
    {R(102, 128, 122, 7, WOOD)}
    {R(148, 96, 26, 32, INK, NS)}
    {D('M94 84L163 38L232 84Z', thatch)}
    {S('M128 78L146 58M150 80L163 56M176 80L182 60M200 78L190 62', { 'stroke-width': 1 })}
    {S('M246 166L222 130M256 166L232 130M243 158L253 158M238 150L248 150M233 142L243 142', { 'stroke-width': 1.6 })}
    {D('M224 182Q262 136 304 182Z', '#e8cf7c')}
    {S('M250 170l4 -2M266 172l4 -2M258 160l4 -2M278 176l4 -2M240 178l4 -2', { 'stroke-width': 1.1 })}
    {jar(50, 178, 36, p.accent)}
    {jar(82, 184, 28, p.far)}
    {r() < 0.6 && jar(22, 188, 26, p.ground2)}
    {jar(292, 190, 24, p.accent2)}
  </>;
};

const town: Scene = (c) => {
  const { p, r } = c;
  const roofs = [p.accent, p.ground2, '#9b7a4c'];
  const back: El[] = [];
  let x = 52;
  for (let i = 0; i < 7; i++) {
    const w = 22 + r() * 12, h = 16 + r() * 12;
    back.push(house(x, 132, w, h, i % 3 === 1 ? PAPER : WALL, roofs[i % 3]));
    x += w + 5;
  }
  const front: El[] = [];
  x = 44;
  for (let i = 0; i < 5; i++) {
    const w = 34 + r() * 14, h = 22 + r() * 10;
    front.push(house(x, 150, w, h, i % 2 ? WALL : PAPER, roofs[(i + 1) % 3]));
    x += w + 8;
  }
  return <>
    {backdrop(c, 132)}
    {smoke(92, 88, 7)}
    {smoke(232, 92, 6, '#ece5d2', -1)}
    {back}
    {R(150, 66, 18, 66, WALL)}
    {D('M146 66L159 44L172 66Z', p.accent)}
    {R(156, 76, 6, 9, INK, NS)}
    {front}
    {D('M24 176V148h10v-6h10v6h232v-6h10v6h10V176Z', STONE)}
    {S('M60 148V176M100 148V176M220 148V176M260 148V176M24 162H296', { 'stroke-width': 0.9, opacity: 0.5 })}
    {D('M144 176V160Q160 142 176 160V176Z', INK, NS)}
    {S('M-4 190Q120 182 160 177', { 'stroke-width': 1, opacity: 0.5 })}
  </>;
};

const school: Scene = (c) => {
  const { p } = c;
  const robes = [p.ground2, p.accent2, p.far, WALL, p.ground2];
  return <>
    {backdrop(c, 122)}
    {tree(296, 126, 40, p.ground2)}
    {R(40, 96, 124, 46, WALL)}
    {S('M52 96V142M152 96V142', { 'stroke-width': 3 })}
    {D('M86 142V116Q102 102 118 116V142Z', INK, NS)}
    {D('M26 100L102 54L178 100Z', '#c3a157')}
    {S('M70 92L84 74M102 96V70M134 92L120 74', { 'stroke-width': 1 })}
    {S('M206 150L214 96M246 150L238 96', { 'stroke-width': 2 })}
    {R(200, 88, 52, 36, SLATE)}
    {S('M210 100h12M210 108h20M228 98l8 8M228 106l8 -8M210 116h8', { stroke: PAPER, 'stroke-width': 1.5 })}
    {person(270, 152, 44, p.accent, -1)}
    {[0, 1, 2, 3, 4].map((i) => seated(112 + i * 36, 180 - Math.abs(i - 2) * 5, 34, robes[i]))}
  </>;
};

const lab: Scene = (c) => {
  const { p, r } = c;
  const bottles: El[] = [];
  const cols = [p.accent, p.accent2, p.water, p.ground2, PAPER];
  for (let i = 0; i < 6; i++) {
    const h = 12 + r() * 12;
    bottles.push(R(34 + i * 19, 60 - h, 11, h, cols[i % 5], THIN));
  }
  return <>
    {R(-4, -4, 328, 208, p.sky2, NS)}
    {R(-4, 152, 328, 56, p.ground2)}
    {R(222, 22, 70, 62, p.sky)}
    {C(270, 44, 9, p.light, NS)}
    {S('M257 22V84M222 53H292', { 'stroke-width': 1.6 })}
    {bottles}
    {S('M26 60H152', { 'stroke-width': 3 })}
    {S('M44 138V190M276 138V190', { 'stroke-width': 4 })}
    {R(22, 128, 276, 11, WOOD)}
    {S('M160 128V70M144 128H176', { 'stroke-width': 2.6 })}
    {S('M124 82L196 72', { 'stroke-width': 2.2 })}
    {S('M124 82L112 104M124 82L136 104M196 72L184 96M196 72L208 96', { 'stroke-width': 1 })}
    {D('M108 104Q124 116 140 104Z', '#c9a24a', THIN)}
    {D('M180 96Q196 108 212 96Z', '#c9a24a', THIN)}
    {C(160, 70, 3.5, p.accent, THIN)}
    {C(70, 108, 18, '#e4ede4')}
    {D('M53 112Q70 132 87 112Z', p.accent, NS)}
    {R(65, 76, 10, 16, '#e4ede4', { 'stroke-width': 1.4 })}
    {S('M62 76H78', { 'stroke-width': 2 })}
    {flask(248, 128, 34, p.accent2)}
    {S('M250 94Q262 70 282 92V112', { 'stroke-width': 1.6 })}
    {R(274, 112, 16, 16, '#e4ede4', THIN)}
  </>;
};

const craft: Scene = (c) => {
  const { p } = c;
  const warp: string[] = [];
  for (let i = 0; i < 8; i++) warp.push(pth('M', 62 + i * 9, 68, 'V', 118));
  return <>
    {backdrop(c, 128)}
    {house(246, 132, 46, 26, WALL, '#c3a157')}
    {S(warp.join(''), { 'stroke-width': 0.9 })}
    {R(56, 116, 76, 34, p.accent)}
    {S('M56 126H132M56 138H132', { stroke: p.light, 'stroke-width': 2.4 })}
    {S('M52 164V60M136 164V60M44 66H144M48 152H140', { 'stroke-width': 3.2 })}
    {person(158, 166, 46, p.accent2, -1)}
    {seated(254, 170, 46, p.ground2)}
    {E(218, 166, 28, 6, WOOD)}
    {S('M218 172V186M204 186H232', { 'stroke-width': 2.4 })}
    {jar(218, 164, 30, '#c58a5a')}
    {S('M240 150L228 146', { 'stroke-width': 1.7 })}
    {jar(92, 190, 20, '#c58a5a')}
    {jar(116, 192, 15, p.far)}
    {D('M282 190Q296 172 310 190Z', '#c58a5a', THIN)}
    {S('M20 186L46 176M22 176l8 12', { 'stroke-width': 2.2 })}
  </>;
};

const measure: Scene = (c) => {
  const { p } = c;
  const ticks: string[] = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.08 + i * 0.105);
    ticks.push(pth('M', 104 - Math.cos(a) * 54, 150 - Math.sin(a) * 15, 'L', 104 - Math.cos(a) * 44, 150 - Math.sin(a) * 12));
  }
  return <>
    {backdrop(c, 130)}
    {E(104, 152, 62, 19, STONE)}
    {S(ticks.join(''), { 'stroke-width': 1.3 })}
    {D('M100 152L156 138L166 150Z', INK, { ...NS, opacity: 0.5 })}
    {D('M92 152L108 92L116 152Z', p.accent)}
    {D('M222 164Q216 82 246 78Q276 82 270 164Z', STONE)}
    {S('M232 96V114M239 96V114M246 96V114M253 96V114M228 112L258 98M232 126V144M239 126V144M246 126V144', { 'stroke-width': 1.8 })}
    {S('M28 190L196 174', { 'stroke-width': 8 })}
    {S('M28 190L196 174', { stroke: p.light, 'stroke-width': 5 })}
    {S('M28 190L196 174', { stroke: p.accent, 'stroke-width': 5, 'stroke-dasharray': '12 12', 'stroke-linecap': 'butt' })}
    {S('M200 190q12 -10 24 0t24 0t24 0t24 0', { 'stroke-width': 1.8 })}
    {[212, 236, 260, 284].map((x, i) => C(x, i % 2 ? 195 : 185, 3, WOOD, THIN))}
    {person(296, 164, 42, p.accent2, -1)}
  </>;
};

const industry: Scene = (c) => {
  const { p, r } = c;
  const lean = r() < 0.5 ? 1 : -1;
  const chimney = (x: number, h: number): El => <>
    {D(pth('M', x - 7, 150, 'L', x - 4.5, 150 - h, 'L', x + 4.5, 150 - h, 'L', x + 7, 150, 'Z'), p.accent)}
    {S(pth('M', x - 6, 156 - h, 'H', x + 6), { 'stroke-width': 3 })}
  </>;
  const teeth: El[] = [];
  for (let i = 0; i < 5; i++) teeth.push(D(pth('M', 46 + i * 40, 116, 'V', 94, 'L', 86 + i * 40, 116, 'Z'), p.ground2));
  return <>
    {backdrop(c, 138, { hatch: false })}
    {smoke(76, 58, 8, '#cfc8b8', lean)}
    {smoke(118, 46, 9, '#cfc8b8', lean)}
    {smoke(212, 66, 7.5, '#cfc8b8', lean)}
    {chimney(76, 80)}
    {chimney(118, 92)}
    {chimney(212, 72)}
    {teeth}
    {R(46, 116, 200, 40, '#d6cab0')}
    {[0, 1, 2, 3, 4, 5].map((i) => R(58 + i * 32, 126, 16, 12, p.light, THIN))}
    {R(140, 138, 22, 18, INK, NS)}
    {R(258, 104, 44, 52, STONE)}
    {E(280, 104, 22, 6, STONE)}
    {S('M258 122H302M258 140H302', { 'stroke-width': 1 })}
    {S('M-4 176H324M-4 184H324', { 'stroke-width': 1.4 })}
    {S('M20 174v12M60 174v12M100 174v12M140 174v12M180 174v12M220 174v12M260 174v12M300 174v12', { 'stroke-width': 2 })}
  </>;
};

const workshop: Scene = (c) => {
  const { p } = c;
  return <>
    {backdrop(c, 130)}
    {D('M-4 168Q40 160 70 176T110 204L-4 204Z', p.water)}
    {smoke(214, 34, 8)}
    {R(206, 46, 16, 30, p.accent)}
    {R(104, 86, 150, 68, WALL)}
    {D('M94 88L179 44L264 88Z', p.accent)}
    {D('M168 154V118Q192 96 216 118V154Z', INK, NS)}
    {C(192, 140, 13, p.accent, NS)}
    {C(192, 142, 7, p.light, NS)}
    {R(124, 104, 20, 18, SLATE, THIN)}
    {C(84, 132, 38, 'none', { 'stroke-width': 7 })}
    {C(84, 132, 38, 'none', { stroke: WOOD, 'stroke-width': 4 })}
    {wheel(84, 132, 33, 'none', 4)}
    {S('M84 90v8M84 166v8M42 132h8M118 132h8M54 102l6 6M108 156l6 6M114 102l-6 6M54 162l6 -6', { 'stroke-width': 4 })}
    {D('M236 190h34v-7h-9q-3 -9 9 -12v-7h-46q5 9 14 9q5 5 -2 10Z', SLATE)}
    {S('M262 148L290 132', { 'stroke-width': 2.4 })}
    {R(284, 122, 14, 10, SLATE, { 'stroke-width': 1.2, transform: 'rotate(-30 291 127)' })}
    {person(150, 172, 42, p.accent2, 1)}
  </>;
};

const mine: Scene = (c) => {
  const { p } = c;
  return <>
    {backdrop(c, 124, { far: false })}
    {D('M30 204Q110 22 226 86Q286 118 324 104L324 204Z', p.ground2)}
    {S('M96 120l14 -10M130 78l16 -6M190 96l14 4M70 160l12 -8', { 'stroke-width': 1, opacity: 0.5 })}
    {S('M232 112L250 44L272 120M238 90L266 94M243 70L259 72M238 90L259 72M266 94L243 70', { stroke: skyLine(p), 'stroke-width': 2.4 })}
    {wheel(250, 42, 10, WALL)}
    {S('M250 52V110', { 'stroke-width': 1 })}
    {house(256, 122, 26, 12, WALL, p.accent, 7)}
    {D('M122 172V138Q148 114 174 138V172Z', INK, NS)}
    {S('M120 174V136M176 174V136M114 136H182', { stroke: WOOD, 'stroke-width': 5 })}
    {S('M120 174V136M176 174V136M114 136H182', { 'stroke-width': 1 })}
    {S('M140 174L226 204M160 172L262 204', { 'stroke-width': 1.6 })}
    {S('M158 180l14 -3M180 188l16 -4M204 196l18 -4', { 'stroke-width': 1.4 })}
    {C(214, 160, 6, p.accent, THIN)}
    {C(226, 158, 7, '#b98a4a', THIN)}
    {C(238, 161, 5.5, p.accent, THIN)}
    {D('M198 162H254L246 184H206Z', SLATE)}
    {wheel(214, 188, 6, WALL, 2)}
    {wheel(240, 188, 6, WALL, 2)}
    {D('M20 190Q52 150 92 190Z', p.far)}
    {S('M44 180l4 -2M58 172l4 -2M68 184l4 -2', { 'stroke-width': 1.2 })}
    {person(98, 178, 34, p.accent2, 1)}
    {S('M112 152l10 -10M116 138q8 0 12 8', { 'stroke-width': 1.8 })}
  </>;
};

const road: Scene = (c) => {
  const { p } = c;
  const paving = '#d8c9a4';
  return <>
    {backdrop(c, 108)}
    {house(168, 110, 14, 7, WALL, p.accent)}
    {house(186, 110, 10, 6, WALL, p.ground2)}
    {D('M-4 128Q90 120 180 132T324 126L324 152Q240 160 170 154T-4 156Z', p.water)}
    {D('M178 108L186 108L262 204L84 204Z', paving)}
    {S('M181 116L168 204M183 132L196 204', { 'stroke-width': 0.9, opacity: 0.45 })}
    {D('M150 126L160 126L138 158L122 158Z', STONE)}
    {D('M198 126L208 126L244 158L228 158Z', STONE)}
    {D('M122 158h-12q4 -14 18 -14Z', INK, { ...NS, opacity: 0.55 })}
    {D('M244 158h12q-4 -14 -18 -14Z', INK, { ...NS, opacity: 0.55 })}
    {[[270, 190, 12], [244, 160, 8], [222, 134, 5]].map(([x, y, s]) => D(pth('M', x - s * 0.5, y, 'V', y - s, 'Q', x, y - s * 1.6, x + s * 0.5, y - s, 'V', y, 'Z'), STONE, THIN))}
    {S('M132 174L112 150', { 'stroke-width': 2 })}
    {D('M128 160Q150 146 176 160Z', PAPER, THIN)}
    {R(124, 160, 56, 16, WOOD)}
    {wheel(138, 180, 11, WALL)}
    {wheel(168, 180, 11, WALL)}
    {person(96, 170, 34, p.accent2)}
    {tree(30, 120, 34, p.ground2)}
    {pine(300, 118, 30, p.ground2)}
  </>;
};

const power: Scene = (c) => {
  const { p } = c;
  const face = '#d3ccb6';
  return <>
    {R(-4, -4, 328, 120, p.sky, NS)}
    {celestial(c, 60 + c.r() * 200, 30)}
    {D(ridge(c.r, 78, 18), p.far, THIN)}
    {R(40, 84, 240, 20, p.water)}
    {D('M-4 54Q64 60 104 204L-4 204Z', p.ground2)}
    {D('M324 46Q252 66 222 204L324 204Z', p.ground2)}
    {D('M66 100H256L230 182H96Z', face)}
    {S('M96 100L116 182M128 100L140 182M160 100V182M192 100L182 182M224 100L206 182', { 'stroke-width': 1.2 })}
    {D('M140 100h12l2 82h-16Z', p.light, NS)}
    {D('M172 100h12l-4 82h-12Z', p.light, NS)}
    {R(60, 94, 202, 8, STONE)}
    {D('M84 204Q100 176 162 180T246 204Z', p.water)}
    {ripples(130, 190, p, 2)}
    {house(236, 186, 50, 30, WALL, p.accent, 14)}
    {C(222, 170, 15, 'none', { 'stroke-width': 5 })}
    {wheel(222, 170, 13, WALL, 3)}
    {S('M292 160V128M285 128H299M285 128Q300 112 324 108M299 128Q312 118 324 116', { 'stroke-width': 1.3 })}
    {pine(22, 96, 30, p.ground)}
    {pine(302, 86, 28, p.ground)}
  </>;
};

const electric: Scene = (c) => {
  const { p, r } = c;
  const pylon = (x: number, y: number, s: number): El =>
    S(pth('M', x - s * 0.17, y, 'L', x - s * 0.04, y - s, 'L', x + s * 0.04, y - s, 'L', x + s * 0.17, y,
      'M', x - s * 0.3, y - s * 0.8, 'L', x + s * 0.3, y - s * 0.8, 'M', x - s * 0.22, y - s * 0.6, 'L', x + s * 0.22, y - s * 0.6,
      'M', x - s * 0.17, y, 'L', x + s * 0.1, y - s * 0.4, 'L', x - s * 0.08, y - s * 0.6, 'M', x + s * 0.17, y, 'L', x - s * 0.1, y - s * 0.4, 'L', x + s * 0.08, y - s * 0.6,
      'M', x - s * 0.3, y - s * 0.8, 'L', x, y - s, 'L', x + s * 0.3, y - s * 0.8), { stroke: skyLine(p), 'stroke-width': Math.max(1.1, s * 0.022) });
  const block = p.dark ? '#22262f' : '#56524a';
  const blocks: El[] = [];
  let x = 16;
  for (let i = 0; i < 6; i++) {
    const w = 18 + r() * 12, h = 16 + r() * 30;
    blocks.push(R(x, 140 - h, w, h, block, THIN));
    for (let k = 0; k < Math.floor(h / 11); k++) blocks.push(R(x + 4 + (k % 2) * (w - 13), 134 - k * 10 - 4, 5, 5, p.light, NS));
    x += w + 2;
  }
  const P = [[250, 180, 132], [158, 150, 80], [96, 138, 48]];
  const wire = (i: number, side: number, lvl: number): string => {
    const [x0, y0, s0] = P[i], [x1, y1, s1] = P[i + 1];
    const ax = x0 + side * s0 * (lvl ? 0.22 : 0.3), ay = y0 - s0 * (lvl ? 0.6 : 0.8);
    const bx = x1 + side * s1 * (lvl ? 0.22 : 0.3), by = y1 - s1 * (lvl ? 0.6 : 0.8);
    return pth('M', ax, ay, 'Q', (ax + bx) / 2, (ay + by) / 2 + s0 * 0.14, bx, by);
  };
  return <>
    {backdrop(c, 136)}
    {blocks}
    {S(wire(0, -1, 0) + wire(0, 1, 0) + wire(1, -1, 0) + wire(1, 1, 0) + wire(0, -1, 1) + wire(0, 1, 1) + 'M82 100Q40 112 -4 96M110 100Q60 120 -4 110M290 74Q310 96 324 92', { stroke: skyLine(p), 'stroke-width': 1 })}
    {pylon(96, 138, 48)}
    {pylon(158, 150, 80)}
    {pylon(250, 180, 132)}
    {S('M24 176V156', { 'stroke-width': 1.8 })}
    {C(24, 153, 5, p.light, THIN)}
  </>;
};

const bio: Scene = (c) => {
  const { p, r } = c;
  const glass = '#dbe9df';
  return <>
    {backdrop(c, 132)}
    {[96, 124, 152, 180, 208].map((x) => C(x, 132 - r() * 10, 13 + r() * 5, LEAF, THIN))}
    {D('M70 152V104Q152 22 234 104V152Z', glass, { opacity: 0.62 })}
    {S('M70 104H234M111 152V70M152 152V62M193 152V70M88 86Q152 56 216 86', { 'stroke-width': 1.3 })}
    {R(64, 150, 176, 10, STONE)}
    {D('M138 150V124h28V150Z', glass, { 'stroke-width': 1.4, opacity: 0.9 })}
    {flask(266, 188, 44, LEAF)}
    {flask(296, 192, 30, p.accent)}
    {S('M266 144V128M266 128q-10 -2 -10 -12q10 0 10 12M266 132q10 -2 10 -12q-10 0 -10 12', { stroke: INK, 'stroke-width': 1.3 })}
    {D('M14 198Q10 128 78 112Q84 178 14 198Z', LEAF)}
    {S('M14 198Q44 150 78 112M30 172l18 2M26 158l-2 -16M46 150l18 0M42 138l0 -14', { 'stroke-width': 1.1 })}
    {D('M40 202Q70 160 116 172Q96 204 40 202Z', '#8fb56c')}
    {S('M40 202Q80 182 116 172', { 'stroke-width': 1.1 })}
  </>;
};

const launch: Scene = (c) => {
  const { p, r } = c;
  const brace: string[] = [];
  for (let y = 154; y > 52; y -= 17) brace.push(pth('M', 196, y, 'L', 218, y - 17, 'M', 196, y - 17, 'H', 218));
  const steel = skyLine(p);
  const puffs: El[] = [];
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    puffs.push(C(160 + side * (10 + i * 7 + r() * 6), 160 - r() * 8, 9 + r() * 7, PAPER, { 'stroke-width': 1.1 }));
  }
  return <>
    {R(-4, -4, 328, 170, p.sky, NS)}
    {R(-4, 112, 328, 54, p.sky2, { ...NS, opacity: 0.8 })}
    {p.dark ? stars(r, 26, 110, p.light) : celestial(c, 60, 40)}
    {D(ridge(r, 150, 12), p.far, THIN)}
    {R(-4, 162, 328, 46, p.ground)}
    {S('M196 162V44M218 162V44' + brace.join(''), { stroke: steel, 'stroke-width': 1.6 })}
    {S('M196 78H170M196 122H174', { stroke: steel, 'stroke-width': 3 })}
    {S('M207 44V26', { stroke: steel, 'stroke-width': 1.4 })}
    {C(207, 24, 2.8, p.accent, NS)}
    {D('M145 152L128 163L145 120Z', p.accent)}
    {D('M175 152L192 163L175 120Z', p.accent)}
    {D('M145 152V66Q160 22 175 66V152Z', PAPER)}
    {R(145, 90, 30, 10, p.accent, THIN)}
    {C(160, 68, 5.5, p.accent2, THIN)}
    {D('M152 152h16l4 8h-24Z', SLATE, THIN)}
    {puffs}
    {R(96, 164, 128, 9, STONE)}
    {S('M40 162V136M280 162V144', { stroke: steel, 'stroke-width': 1.6 })}
    {C(40, 134, 2.5, p.accent, NS)}
    {house(262, 164, 30, 12, WALL, p.ground2, 6)}
    {hatch(c, 164, 4)}
  </>;
};

const jump: Scene = (c) => {
  const { p, r } = c;
  const rot = -16 - r() * 8;
  const t: O = { transform: `rotate(${f(rot)} 166 92)` };
  return <>
    {R(-4, -4, 328, 208, p.sky, NS)}
    {C(70, 40, 60, p.sky2, { ...NS, opacity: 0.5 })}
    {stars(r, 34, 200, p.light)}
    {C(140, 440, 276, p.accent2)}
    {S('M-4 196Q140 150 324 202', { stroke: p.light, 'stroke-width': 1.4, opacity: 0.7 })}
    {D('M40 192Q80 170 130 176Q110 190 60 198Z', p.land ?? p.ground, { ...NS, opacity: 0.8 })}
    {E(166, 92, 36, 58, p.accent, { ...NS, ...t, opacity: 0.3 })}
    {E(166, 92, 22, 40, p.light, { ...NS, ...t, opacity: 0.45 })}
    {S('M176 86L262 40', { stroke: p.light, 'stroke-width': 2.4, opacity: 0.85 })}
    {E(166, 92, 42, 64, 'none', { ...t, 'stroke-width': 12 })}
    {E(166, 92, 42, 64, 'none', { ...t, stroke: '#c4bda8', 'stroke-width': 8.4 })}
    {E(166, 92, 42, 64, 'none', { ...t, 'stroke-width': 8.4, 'stroke-dasharray': '1.6 19', 'stroke-linecap': 'butt' })}
    {<g {...t}>
      {S('M118 92H96M214 92H236', { 'stroke-width': 2 })}
      {R(78, 82, 18, 20, p.accent2, THIN)}
      {R(236, 82, 18, 20, p.accent2, THIN)}
      {S('M84 82V102M90 82V102M242 82V102M248 82V102', { 'stroke-width': 0.8 })}
    </g>}
    {D('M282 30L256 34L262 42L254 50Z', PAPER, { 'stroke-width': 1.4 })}
    {D('M262 42l-12 5l2 -9Z', p.accent, NS)}
  </>;
};

const assembly: Scene = (c) => {
  const { p } = c;
  const robes = [p.ground2, p.accent2, WALL, p.far, p.accent2, p.ground2, WALL];
  return <>
    {backdrop(c, 120)}
    {tree(26, 126, 48, p.ground2)}
    {tree(294, 124, 42, p.ground2)}
    {[68, 96, 222, 250].map((x, i) => person(x, 140 - (i === 0 || i === 3 ? 0 : 5), 24, robes[i + 1]))}
    {[118, 204].map((x, i) => person(x, 132, 22, robes[i]))}
    {D('M136 156L142 138H182L190 156Z', STONE)}
    {S('M150 146h10M166 150h12', { 'stroke-width': 1, opacity: 0.5 })}
    {person(162, 140, 44, p.accent, 1)}
    {[0, 1, 2, 3, 4, 5, 6].map((i) => seated(46 + i * 38, 186 - Math.abs(i - 3) * 6, 36, robes[i]))}
  </>;
};

const civic: Scene = (c) => {
  const { p } = c;
  const cols: El[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 72 + i * 33.2;
    cols.push(R(x, 92, 10, 58, PAPER, { 'stroke-width': 1.3 }));
    cols.push(S(pth('M', x - 2, 94, 'h', 14, 'M', x - 2, 148, 'h', 14), { 'stroke-width': 2 }));
  }
  return <>
    {backdrop(c, 142)}
    {R(68, 90, 184, 60, p.ground2)}
    {D('M148 150V118Q160 106 172 118V150Z', INK, NS)}
    {cols}
    {R(60, 80, 200, 12, WALL)}
    {D('M52 80L160 40L268 80Z', WALL)}
    {D('M112 74L160 54L208 74Z', p.accent, THIN)}
    {C(160, 67, 4, p.light, THIN)}
    {R(58, 150, 204, 8, STONE)}
    {R(48, 158, 224, 8, STONE)}
    {R(38, 166, 244, 9, STONE)}
    {banner(26, 178, 108, p.accent, 2, 1)}
    {banner(294, 178, 108, p.accent2, 2, -1)}
    {person(120, 166, 20, p.accent2)}
    {person(134, 166, 18, p.far)}
    {person(206, 175, 22, p.accent)}
  </>;
};

const assemblyHall: Scene = (c) => {
  const { p } = c;
  const heads: El[] = [];
  const tiers: [number, number, number][] = [[176, 86, 11], [136, 64, 9], [96, 42, 6]];
  tiers.forEach(([rx, ry, count], t) => {
    for (let i = 0; i < count; i++) {
      const a = Math.PI * (1.1 + (0.8 * i) / (count - 1));
      heads.push(C(160 + Math.cos(a) * rx, 212 + Math.sin(a) * ry, 4.6 - t * 0.5, [HEAD, p.accent2, p.light, p.accent][(i + t) % 4], THIN));
    }
  });
  return <>
    {R(-4, -4, 328, 208, p.sky2, NS)}
    {[52, 140, 228].map((x) => D(pth('M', x, 108, 'V', 46, 'Q', x + 20, 18, x + 40, 46, 'V', 108, 'Z'), p.sky))}
    {S('M72 30V108M160 30V108M248 30V108', { 'stroke-width': 1 })}
    {banner(116, 96, 78, p.accent, 2, 1)}
    {banner(204, 96, 78, p.accent2, 2, 1)}
    {S('M-4 110H324', { 'stroke-width': 2 })}
    {E(160, 212, 196, 100, p.ground2)}
    {E(160, 212, 156, 78, p.ground)}
    {E(160, 212, 116, 56, p.ground2)}
    {E(160, 212, 76, 34, WALL)}
    {heads}
    {R(146, 186, 28, 18, p.accent)}
    {person(160, 190, 38, p.accent2, 1)}
  </>;
};

const shrine: Scene = (c) => {
  const { p } = c;
  const stone = (x: number, y: number, w: number, h: number): El =>
    D(pth('M', x, y, 'L', x + w * 0.14, y - h, 'L', x + w * 0.82, y - h * 1.06, 'L', x + w, y, 'Z'), STONE);
  const sign = (x: number, y: number): El => <>
    {C(x, y, 6, 'none', { 'stroke-width': 1.3 })}
    {C(x, y, 2, INK, NS)}
    {S(pth('M', x - 7, y + 13, 'h', 14, 'M', x - 5, y + 19, 'h', 10, 'M', x - 3, y + 25, 'h', 6), { 'stroke-width': 1.4 })}
  </>;
  const flags: El[] = [];
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6, x = 118 + 88 * t, y = 60 + 76 * t * (1 - t) - 4 * t;
    flags.push(D(pth('M', x - 4, y, 'h', 8, 'l', -4, 8, 'Z'), i % 2 ? p.accent : p.accent2, { 'stroke-width': 1 }));
  }
  return <>
    {backdrop(c, 128)}
    {D('M30 204Q160 104 290 204Z', p.ground2, THIN)}
    {stone(148, 138, 22, 50)}
    {stone(52, 168, 26, 62)}
    {stone(242, 168, 26, 58)}
    {S('M118 60Q160 96 206 56', { 'stroke-width': 1 })}
    {flags}
    {stone(96, 160, 32, 100)}
    {stone(192, 160, 32, 106)}
    {sign(112, 92)}
    {sign(208, 86)}
    {smoke(160, 138, 5)}
    {S('M160 172V186M150 188H170', { 'stroke-width': 2.4 })}
    {D('M142 160Q160 182 178 160Z', p.accent2)}
    {fire(160, 160, 9, p)}
    {seated(110, 190, 28, p.far)}
    {seated(212, 190, 28, WALL)}
  </>;
};

const contact: Scene = (c) => {
  const { p } = c;
  return <>
    {backdrop(c, 118)}
    {tent(18, 136, 50, 36, '#d9c79c')}
    {pine(292, 126, 40, p.ground2)}
    {pine(270, 124, 28, p.ground2)}
    {D('M152 118Q138 152 112 204L214 204Q184 152 170 118Z', p.water)}
    {ripples(136, 176, p, 2)}
    {banner(38, 178, 104, p.accent, 0, 1)}
    {person(60, 172, 44, p.ground2)}
    {person(84, 180, 46, WALL)}
    {person(112, 176, 50, p.accent, 1)}
    {banner(286, 178, 104, p.accent2, 1, -1)}
    {person(262, 172, 44, p.far)}
    {person(240, 180, 46, PAPER)}
    {person(214, 176, 50, p.accent2, -1)}
    {D('M188 196q14 9 34 -1l-3 -5h-28Z', WOOD, THIN)}
  </>;
};

const treaty: Scene = (c) => {
  const { p } = c;
  const hang = (x: number, fill: string): El => <>
    {D(pth('M', x, 14, 'h', 34, 'v', 62, 'l', -17, -12, 'l', -17, 12, 'Z'), fill)}
    {C(x + 17, 38, 6, 'none', { stroke: p.light, 'stroke-width': 1.6 })}
  </>;
  const seal = (x: number, fill: string): El => <>
    {D(pth('M', x - 4, 172, 'l', -5, 20, 'l', 6, -4, 'l', 3, 6, 'l', 2, -20, 'Z'), fill, { 'stroke-width': 1 })}
    {C(x, 166, 10, fill, { 'stroke-width': 1.4 })}
    {C(x, 166, 5, 'none', { 'stroke-width': 1 })}
  </>;
  return <>
    {R(-4, -4, 328, 208, p.sky2, NS)}
    {S('M-4 92H324', { 'stroke-width': 1.4 })}
    {hang(52, p.accent)}
    {hang(234, p.accent2)}
    {R(148, 30, 24, 40, p.sky)}
    {S('M160 30V70M148 50H172', { 'stroke-width': 1.2 })}
    {seated(96, 116, 62, p.accent)}
    {seated(224, 116, 62, p.accent2)}
    {D('M22 204L62 112H258L298 204Z', '#a98a5e')}
    {S('M62 112H258', { 'stroke-width': 3 })}
    {D('M96 196L114 126H206L224 196Z', PAPER)}
    {S('M122 138q10 -4 20 0t20 0t20 0M120 148q10 -4 20 0t20 0t16 0M117 158q10 -4 20 0t20 0', { 'stroke-width': 1.1, opacity: 0.7 })}
    {seal(136, p.accent)}
    {seal(184, p.accent2)}
    {S('M78 168L62 128', { 'stroke-width': 1.4 })}
    {D('M62 128q-10 6 -8 22q10 -6 12 -14Z', PAPER, THIN)}
    {S('M242 168L258 128', { 'stroke-width': 1.4 })}
    {D('M258 128q10 6 8 22q-10 -6 -12 -14Z', PAPER, THIN)}
    {R(262, 166, 14, 12, SLATE, THIN)}
  </>;
};

const war: Scene = (c) => {
  const { p } = c;
  const left: El[] = [], right: El[] = [];
  for (let i = 4; i >= 0; i--) {
    const x = 24 + i * 27, y = 186 - (i % 2) * 9;
    left.push(<>
      {S(pth('M', x - 8, y, 'L', x + 36, y - 84), { 'stroke-width': 1.7 })}
      {person(x, y, 52, p.ground2)}
      {C(x + 10, y - 22, 13, p.accent, { 'stroke-width': 1.4 })}
      {C(x + 10, y - 22, 3.6, p.light, NS)}
    </>);
    const xr = 296 - i * 27;
    right.push(<>
      {S(pth('M', xr + 8, y, 'L', xr - 36, y - 84), { 'stroke-width': 1.7 })}
      {person(xr, y, 52, p.far)}
      {D(pth('M', xr - 20, y - 38, 'h', 20, 'v', 20, 'l', -10, 12, 'l', -10, -12, 'Z'), p.accent2, { 'stroke-width': 1.4 })}
      {S(pth('M', xr - 10, y - 38, 'v', 30), { 'stroke-width': 1 })}
    </>);
  }
  return <>
    {backdrop(c, 124, { sun: false })}
    {smoke(86, 84, 12, '#7a746a')}
    {smoke(226, 90, 11, '#7a746a', -1)}
    {smoke(160, 108, 8, '#8d877c')}
    {banner(40, 150, 124, p.accent, 0, 1)}
    {banner(280, 150, 124, p.accent2, 1, -1)}
    {left}
    {right}
    {S('M152 194l5 -22M166 198l-3 -20M174 192l7 -18M150 172l5 2M160 178l6 -1M178 174l6 3', { 'stroke-width': 1.4 })}
  </>;
};

const famine: Scene = (c) => {
  const { p, r } = c;
  const stalks: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = 196 + i * 17 + r() * 6;
    stalks.push(pth('M', x, 144, 'q', -1, -12, 2, -18, 'q', 4, -5, 8, 3));
  }
  return <>
    {backdrop(c, 126, { hatch: false, sunSize: 24 })}
    {S(stalks.join(''), { stroke: skyLine(p), 'stroke-width': 1.3 })}
    {S('M-4 160L40 152L66 170L120 162L150 182L210 170L252 186L324 172M40 152L52 132M66 170L50 204M120 162L132 140L170 134M150 182L140 204M210 170L224 148L270 140M252 186L262 204M132 140L118 130M224 148L214 132M20 186L50 204M280 160L300 176', { 'stroke-width': 1.3 })}
    {S('M96 156V96', { stroke: skyLine(p), 'stroke-width': 5 })}
    {S('M96 126L70 94M96 110L124 80M96 98L92 64', { stroke: skyLine(p), 'stroke-width': 3 })}
    {S('M70 94L54 88M70 94L72 72M124 80L142 78M124 80L122 58M92 64L80 52M92 64L102 48M82 109L64 112', { stroke: skyLine(p), 'stroke-width': 1.7 })}
    {seated(150, 172, 44, p.ground2)}
    {jar(222, 186, 36, p.far)}
    {S('M214 156l6 10l-4 8', { 'stroke-width': 1.1 })}
    {<g transform="rotate(78 272 182)">{jar(272, 190, 30, p.accent)}</g>}
    {D('M30 192q10 -8 22 -2q-8 8 -22 2Z', PAPER, THIN)}
  </>;
};

const ruin: Scene = (c) => {
  const { p } = c;
  const crow = (x: number, y: number, s: number): El => D(pth('M', x, y, 'q', 5 * s, -9 * s, 14 * s, -5 * s, 'l', 7 * s, -2 * s, 'l', -4 * s, 5 * s, 'q', -2 * s, 8 * s, -13 * s, 7 * s, 'l', -8 * s, 3 * s, 'Z'), INK, NS);
  return <>
    {backdrop(c, 130)}
    {D('M34 166V92L52 102L62 78L82 90L90 122L112 128V166Z', STONE)}
    {S('M34 112H56M44 130H92M34 148H112M58 96V112M70 112V130M52 130V148M84 130V148', { 'stroke-width': 0.9, opacity: 0.55 })}
    {R(146, 78, 20, 88, STONE)}
    {D('M146 80Q174 40 208 56L200 70Q180 62 166 86Z', STONE)}
    {S('M166 62l6 10M184 56l2 11M146 108h20M146 136h20', { 'stroke-width': 0.9, opacity: 0.55 })}
    {D('M226 166V112L238 102L250 118V166Z', STONE)}
    {D('M186 176l22 -4l6 12l-24 4Z', STONE, THIN)}
    {D('M266 172l18 2l-2 12l-18 -2Z', STONE, THIN)}
    {E(120, 186, 16, 7, STONE, THIN)}
    {tuft(40, 168, 9, LEAF)}
    {tuft(116, 168, 8, LEAF)}
    {tuft(172, 168, 10, LEAF)}
    {tuft(222, 168, 7, LEAF)}
    {tuft(298, 180, 9, LEAF)}
    {S('M90 122q10 -16 4 -30M94 104l8 -4', { stroke: LEAF, 'stroke-width': 1.8 })}
    {crow(60, 78, 1)}
    {crow(150, 76, 0.85)}
    {S('M236 44q6 -6 10 0q4 -6 10 0M270 60q5 -5 8 0q3 -5 8 0M214 66q4 -4 7 0q3 -4 7 0', { stroke: skyLine(p), 'stroke-width': 1.5 })}
  </>;
};

const globe: Scene = (c) => {
  const { p, r } = c;
  const cx = 150, cy = 102;
  const land = p.land ?? p.ground;
  return <>
    {R(-4, -4, 328, 208, p.sky, NS)}
    {C(cx, cy, 96, p.sky2, { ...NS, opacity: 0.45 })}
    {stars(r, 26, 200, p.light)}
    {S('M58.700 131.700A96 26 -18 0 1 241.300 72.300', { stroke: p.light, 'stroke-width': 1.3, opacity: 0.8 })}
    {C(cx, cy, 66, p.water, { 'stroke-width': 2 })}
    {D('M104 78q12 -20 34 -18q14 4 8 18q-10 6 -8 20q-10 14 -24 6q-14 -10 -10 -26Z', land, THIN)}
    {D('M160 104q16 -8 30 2q8 14 -4 28q-12 12 -24 2q-10 -14 -2 -32Z', land, THIN)}
    {D('M168 58q14 -6 24 6q-4 10 -16 8q-8 -4 -8 -14Z', land, THIN)}
    {D('M112 136q10 -4 18 6q-6 10 -16 6Z', land, THIN)}
    {E(cx, cy, 28, 66, 'none', { 'stroke-width': 0.8, opacity: 0.35 })}
    {E(cx, cy, 66, 20, 'none', { 'stroke-width': 0.8, opacity: 0.35 })}
    {D('M150 36A66 66 0 0 1 150 168A92 92 0 0 0 150 36Z', INK, { ...NS, opacity: 0.16 })}
    {S('M120 84Q150 60 180 66M120 84Q134 110 172 122M180 66Q196 92 172 122M172 122Q150 146 120 144', { stroke: p.light, 'stroke-width': 1.6, 'stroke-dasharray': '4 3.5' })}
    {[[120, 84], [180, 66], [172, 122], [120, 144]].map(([x, y]) => C(x, y, 3.6, p.accent, THIN))}
    {S('M58.700 131.700A96 26 -18 0 0 241.300 72.300', { stroke: p.light, 'stroke-width': 1.6 })}
    {C(214, 118, 4.5, PAPER, THIN)}
    {C(270, 156, 22, 'none', { stroke: p.light, 'stroke-width': 1.2 })}
    {spark(270, 156, 28, p.light)}
    {<g transform="rotate(45 270 156)">{spark(270, 156, 13, p.accent)}</g>}
    {C(270, 156, 2.5, INK, NS)}
  </>;
};

const victory: Scene = (c) => {
  const { p, r } = c;
  const rays: string[] = [];
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (0.93 + 0.114 * i);
    rays.push(pth('M', 160 + Math.cos(a) * 62, 96 + Math.sin(a) * 62, 'L', 160 + Math.cos(a) * (78 + (i % 2) * 14), 96 + Math.sin(a) * (78 + (i % 2) * 14)));
  }
  const ship = (x: number, y: number, s: number): El => <>
    {D(pth('M', x - s * 0.22, y + s * 0.5, 'L', x, y + s * 2.2, 'L', x + s * 0.22, y + s * 0.5, 'Z'), p.accent, { ...NS, opacity: 0.85 })}
    {D(pth('M', x, y - s, 'L', x + s * 0.7, y + s * 0.7, 'L', x, y + s * 0.25, 'L', x - s * 0.7, y + s * 0.7, 'Z'), PAPER, { 'stroke-width': 1.3 })}
  </>;
  return <>
    {R(-4, -4, 328, 208, p.sky, NS)}
    {C(160, 96, 104, p.sky2, { ...NS, opacity: 0.5 })}
    {stars(r, 32, 150, p.light)}
    {S(rays.join(''), { stroke: p.light, 'stroke-width': 1.8, opacity: 0.75 })}
    {C(160, 96, 44, p.accent, { ...NS, opacity: 0.35 })}
    {C(160, 96, 30, p.light, { ...NS, opacity: 0.5 })}
    {C(160, 96, 48, 'none', { 'stroke-width': 12 })}
    {C(160, 96, 48, 'none', { stroke: '#c4bda8', 'stroke-width': 8.4 })}
    {C(160, 96, 48, 'none', { 'stroke-width': 8.4, 'stroke-dasharray': '1.6 17.200', 'stroke-linecap': 'butt' })}
    {spark(160, 96, 22, p.light, THIN)}
    {C(160, 96, 4, p.accent, THIN)}
    {ship(160, 22, 13)}
    {ship(112, 36, 11)}
    {ship(208, 36, 11)}
    {ship(70, 62, 9)}
    {ship(250, 62, 9)}
    {C(160, 470, 300, p.accent2)}
    {S('M-4 190Q160 150 324 190', { stroke: p.light, 'stroke-width': 1.5, opacity: 0.8 })}
    {D('M70 186Q120 168 170 172Q140 186 96 192Z', p.land ?? p.ground, { ...NS, opacity: 0.8 })}
    {banner(30, 204, 70, p.accent, 0, 1)}
    {banner(290, 204, 70, p.accent, 0, -1)}
  </>;
};

const fallback: Scene = (c) => {
  const { p } = c;
  return <>
    {backdrop(c, 126, { sunSize: 20 })}
    {D('M120 204Q150 160 176 142Q186 134 196 130L204 131Q192 140 186 150Q170 176 190 204Z', '#d8c9a4', THIN)}
    {tree(70, 150, 60, p.ground2)}
    {pine(250, 138, 44, p.ground2)}
    {pine(274, 142, 32, p.ground2)}
    {house(204, 130, 18, 9, WALL, p.accent)}
  </>;
};

const SCENES: Record<string, Scene> = {
  camp, fields, granary, town, school, lab, craft, measure, industry, workshop, mine, road, power, electric, bio,
  launch, jump, assembly, civic, assembly_hall: assemblyHall, shrine, contact, treaty, war, famine, ruin, globe, victory,
};
/** Scenes whose composition reads the same mirrored (variation by flipping). */
const MIRRORABLE = new Set(['camp', 'fields', 'granary', 'school', 'lab', 'craft', 'measure', 'industry', 'workshop', 'mine', 'road', 'power', 'electric', 'bio', 'launch', 'famine', 'ruin', 'jump']);
const ALWAYS_DARK = new Set(['jump', 'globe', 'victory']);

export const VIGNETTE_KEYS: readonly string[] = Object.keys(SCENES);

/** "fields:3" → { key: 'fields', n: 3 }. Missing or invalid n becomes 0; n wraps into 0–6. */
export function parseArt(art: string): { key: string; n: number } {
  const [rawKey, rawN] = String(art ?? '').trim().toLowerCase().split(':');
  const v = Number.parseInt(rawN ?? '', 10);
  const n = Number.isFinite(v) ? ((v % 7) + 7) % 7 : 0;
  return { key: rawKey ?? '', n };
}

export function Vignette(props: { art: string; class?: string; title?: string }): JSX.Element {
  const { key, n } = parseArt(props.art);
  const scene = SCENES[key] ?? fallback;
  const base = PALETTES[n];
  // Space scenes keep a dark sky; a launch may also happen by day (dawn, midday).
  const p = ALWAYS_DARK.has(key) || (key === 'launch' && n > 1) ? spacePal(base, n) : base;
  const r = rng(hashStr(key) + n * 7919);
  const flip = MIRRORABLE.has(key) && r() < 0.5;
  return (
    <svg
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      class={props.class}
      aria-label={props.title}
      aria-hidden={props.title ? undefined : true}
      style="display:block;width:100%;height:100%"
    >
      {props.title && <title>{props.title}</title>}
      <g stroke={INK} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" transform={flip ? 'translate(320 0) scale(-1 1)' : undefined}>
        {scene({ p, r, n })}
      </g>
    </svg>
  );
}
