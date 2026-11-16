// The look of a civilization that holds a tradition (ruleset 3.1): one table of ten
// styles, read by both map tiers (the flat atlas and the 3D diorama), by the era banner
// and by the traditions screen. A style is a palette plus the names that go with it; the
// silhouettes each tier adds live with that tier's drawing code (./punkart.ts for the
// atlas, ../map3d/punk3d.ts for the diorama). A seat that holds no path keeps the
// era-based look both tiers had before.
export type PunkStyle =
  | 'steam' | 'diesel' | 'electric' | 'clockwork'
  | 'atomic' | 'neon' | 'organic' | 'chrome' | 'solar' | 'rocket';

export interface PunkLook {
  style: PunkStyle;
  /** The tradition key that carries the style. */
  tradition: string;
  slot: 'machine' | 'frontier';
  /** Display name and the name of the age, as the referee words them (English keys for t()). */
  name: string;
  age: string;
  /** Main and second wall tone. */
  wall: string;
  wall2: string;
  /** Main and second roof tone. */
  roof: string;
  roof2: string;
  /** Trim, signs and small bright parts. */
  accent: string;
  /** Light: lit windows, arcs, lamps, signage. */
  glow: string;
  /** Structural metal: stacks, lattice, pipes. */
  metal: string;
  /** Window bands. */
  glass: string;
  /** Built-up ground under a town. */
  ground: string;
  /** What rises from the chimneys. */
  smoke: string;
  /** Whether the works of this style smoke at all. */
  smokes: boolean;
}

export const PUNK: Record<PunkStyle, PunkLook> = {
  steam: {
    style: 'steam', tradition: 'steam', slot: 'machine', name: 'Steampunk', age: 'Age of Steam',
    wall: '#b0603f', wall2: '#d2a878', roof: '#4a4f58', roof2: '#7a4a32', accent: '#c8923a', glow: '#f2b24a',
    metal: '#b87333', glass: '#3a3028', ground: '#b9a68c', smoke: '#6a625a', smokes: true,
  },
  diesel: {
    style: 'diesel', tradition: 'engine', slot: 'machine', name: 'Dieselpunk', age: 'Diesel Age',
    wall: '#9c9e99', wall2: '#7e847f', roof: '#4c5357', roof2: '#5f6b55', accent: '#c9b23a', glow: '#f6ecae',
    metal: '#5a5f66', glass: '#2d3338', ground: '#a8a59b', smoke: '#56544f', smokes: true,
  },
  electric: {
    style: 'electric', tradition: 'wire', slot: 'machine', name: 'Electropunk', age: 'Electric Age',
    wall: '#e8dec2', wall2: '#cbb78c', roof: '#5fa08a', roof2: '#3f7f73', accent: '#c57a3a', glow: '#8fd8ff',
    metal: '#b87333', glass: '#f3e08a', ground: '#c4bfa9', smoke: '#dfe3e6', smokes: false,
  },
  clockwork: {
    style: 'clockwork', tradition: 'gear', slot: 'machine', name: 'Clockpunk', age: 'Clockwork Age',
    wall: '#e4d4aa', wall2: '#c9a66a', roof: '#6aa58f', roof2: '#8a5a2b', accent: '#c79a2e', glow: '#f0d478',
    metal: '#b08d3c', glass: '#4a3a2a', ground: '#cdbf9a', smoke: '#ebe5d6', smokes: false,
  },
  atomic: {
    style: 'atomic', tradition: 'atom', slot: 'frontier', name: 'Atompunk', age: 'Atomic Age',
    wall: '#f3f1ea', wall2: '#bfe3dc', roof: '#f2a7a0', roof2: '#8ecfd6', accent: '#e2574c', glow: '#7fe6d2',
    metal: '#d5dade', glass: '#7ecbd8', ground: '#d8d7cd', smoke: '#ffffff', smokes: true,
  },
  neon: {
    style: 'neon', tradition: 'network', slot: 'frontier', name: 'Cyberpunk', age: 'Neon Age',
    wall: '#2b2e3c', wall2: '#3c3654', roof: '#1c1e28', roof2: '#3b2f57', accent: '#ff3fa4', glow: '#39e6ff',
    metal: '#4a4f60', glass: '#ff7ad1', ground: '#6d6c7a', smoke: '#8f8aa6', smokes: false,
  },
  organic: {
    style: 'organic', tradition: 'living', slot: 'frontier', name: 'Biopunk', age: 'Age of Living Machines',
    wall: '#dcd9aa', wall2: '#a9c27a', roof: '#4f8f4a', roof2: '#7fae52', accent: '#c96a8a', glow: '#b6f07a',
    metal: '#7a8f5a', glass: '#9fd39a', ground: '#a9b98b', smoke: '#e1eed1', smokes: false,
  },
  chrome: {
    style: 'chrome', tradition: 'synthetic', slot: 'frontier', name: 'AI-punk', age: 'Age of Synthetic Minds',
    wall: '#e9eef3', wall2: '#b4c2d0', roof: '#8fa3b8', roof2: '#f7f9fb', accent: '#3f7fe0', glow: '#7fb6ff',
    metal: '#c7d0da', glass: '#5f8fc9', ground: '#d0d6db', smoke: '#f1f4f7', smokes: false,
  },
  solar: {
    style: 'solar', tradition: 'sun', slot: 'frontier', name: 'Solarpunk', age: 'Solar Age',
    wall: '#f6f3e8', wall2: '#e9e0c4', roof: '#6fae5a', roof2: '#3f6f9a', accent: '#f0b83a', glow: '#ffe07a',
    metal: '#d7dcd6', glass: '#8fd0e0', ground: '#cad7a9', smoke: '#ffffff', smokes: false,
  },
  rocket: {
    style: 'rocket', tradition: 'rocket', slot: 'frontier', name: 'Rocketpunk', age: 'Rocket Age',
    wall: '#f2efe8', wall2: '#d9d5cc', roof: '#e2702a', roof2: '#3a3f48', accent: '#e2702a', glow: '#ffb347',
    metal: '#8a9099', glass: '#7d8fa6', ground: '#c9c2b4', smoke: '#f1ede6', smokes: true,
  },
};

export const PUNK_STYLES = Object.keys(PUNK) as PunkStyle[];

const BY_TRADITION: Record<string, PunkStyle> = {};
for (const s of PUNK_STYLES) BY_TRADITION[PUNK[s].tradition] = s;

export function isPunkStyle(s: string | null | undefined): s is PunkStyle {
  return !!s && Object.prototype.hasOwnProperty.call(PUNK, s);
}

/** The style of one tradition key ("steam" → steam, "engine" → diesel …), if it has one. */
export function styleOfTradition(key: string | null | undefined): PunkStyle | null {
  return key ? BY_TRADITION[key] ?? null : null;
}

/**
 * The style a seat's towns and works take from the tradition keys it holds. A frontier
 * path styles the look when the seat holds both a machine and a frontier path.
 */
export function styleOfTraditions(keys: readonly string[] | null | undefined): PunkStyle | null {
  if (!keys || !keys.length) return null;
  let machine: PunkStyle | null = null;
  for (const k of keys) {
    const s = BY_TRADITION[k];
    if (!s) continue;
    if (PUNK[s].slot === 'frontier') return s;
    machine = machine ?? s;
  }
  return machine;
}

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` mixed toward `b` by `t` (0–1), as a hex colour. */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexRgb(a), y = hexRgb(b);
  const c = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Whether a colour reads as dark (for choosing ink on top of it). */
export function isDark(hex: string): boolean {
  const [r, g, b] = hexRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 < 120;
}

/** What `styleOfEra` reads of a seat's own era view. */
interface EraSlots { traditions: { slot: string; held: string | null; options: { key: string; style?: string }[] }[] }

/**
 * The style of a seat's own held traditions, from its era view: the referee's style key where
 * it sends one, else the table above. The frontier path styles the look when both are held.
 */
export function styleOfEra(era: EraSlots | null | undefined): PunkStyle | null {
  let machine: PunkStyle | null = null;
  for (const slot of era?.traditions ?? []) {
    if (!slot.held) continue;
    const sent = slot.options.find((o) => o.key === slot.held)?.style;
    const st = isPunkStyle(sent) ? sent : styleOfTradition(slot.held);
    if (!st) continue;
    if (slot.slot === 'frontier') return st;
    machine = machine ?? st;
  }
  return machine;
}
