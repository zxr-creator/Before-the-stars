// Small elevation drawings of what stands in a region: works, mines, power
// plant, harbour, campus, launch and jump sites, and building work in hand.
// Each is drawn around the origin (ground line at y = 0, up is negative) in
// "drawing units"; the caller scales the context so one unit is as many pixels as
// the site's real size and the zoom call for. All of it is this project's own
// line art in the atlas's ink-and-wash manner.
import type { Deposit } from '../protocol';
import { SECTOR_COLOR, magnitude, type LandUse, type Sector } from './landuse';

export type SiteKind =
  | 'industry' | 'craft' | 'pit' | 'well' | 'timber' | 'mill' | 'thermal' | 'hydro' | 'nuclear' | 'fusion' | 'beamed'
  | 'port' | 'school' | 'lab' | 'launch' | 'orbital' | 'jump' | 'scaffold' | 'hamlet';

export interface SiteStyle {
  /** Units of size: sheds in a works, towers in a plant, berths in a harbour. */
  n: number;
  /** Running: chimneys smoke, towers steam. */
  active: boolean;
  /** Greyed for land that is only remembered. */
  faded?: boolean;
  /** One pixel in drawing units (for hairlines). */
  px: number;
  deposit?: Deposit | null;
  depositColor?: string;
  /** Simplify: no windows, hatching or small parts. */
  coarse?: boolean;
}

const INK = '#2b2620';
const INK_3 = '#8a7d6a';
const WALL = '#f7f1e1';
const SLATE = '#8f959c';
const SLATE_DARK = '#666d76';
const BRICK = '#a8644b';
const OCHRE = '#c9a45c';
const TIMBER = '#8a6a45';
const STEEL = '#b9c0c6';
const TEAL = '#4f8f89';
const VIOLET = '#7d6db3';
const AMBER = '#d39a2f';

type Ctx = CanvasRenderingContext2D;

function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.rect(x, y - h, w, h);
  c.fill();
  c.stroke();
}
function poly(c: Ctx, pts: number[], fill: string | null, close = true): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  if (close) c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.stroke();
}
/** A plume of three puffs leaning east. */
function plume(c: Ctx, x: number, y: number, r: number, tone: string): void {
  c.save();
  c.strokeStyle = 'rgba(43,38,32,0.35)';
  c.fillStyle = tone;
  const puffs = [[0, 0, 1], [1.2, -1.5, 1.35], [3, -2.6, 1.7]];
  for (const [dx, dy, k] of puffs) {
    c.beginPath();
    c.arc(x + dx * r, y + dy * r, r * k, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.restore();
}

/** Half-width and height of a site's drawing, in drawing units, for layout and hit boxes. */
export function siteExtent(kind: SiteKind, n: number): [number, number] {
  switch (kind) {
    case 'industry': { const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n)))); const rows = Math.ceil(n / cols); return [cols * 4.4 + 1, 9 + rows * 3.4 + 9]; }
    case 'craft': return [Math.min(3, n) * 3.6 + 1, 8];
    case 'pit': return [7 + Math.min(3, n) * 1.2, 12];
    case 'well': return [3 + Math.min(4, n) * 3.2, 13];
    case 'timber': return [8, 7];
    case 'mill': return [6, 10];
    case 'thermal': case 'nuclear': return [5 + Math.min(3, n) * 3.6, 14];
    case 'hydro': return [10, 9];
    case 'fusion': return [9, 11];
    case 'beamed': return [9, 12];
    case 'port': return [8 + Math.min(3, n) * 2, 9];
    case 'school': return [8, 10];
    case 'lab': return [8, 11];
    case 'launch': return [7, 20];
    case 'orbital': return [8, 12];
    case 'jump': return [9, 18];
    case 'scaffold': return [7, 13];
    case 'hamlet': return [6, 6];
  }
}

export function drawSite(c: Ctx, kind: SiteKind, st: SiteStyle): void {
  const ink = st.faded ? INK_3 : INK;
  const lw = Math.max(st.px * 0.9, 0.22);
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = ink;
  const tone = (col: string) => (st.faded ? '#d8d2c4' : col);
  const n = Math.max(1, st.n);
  switch (kind) {
    case 'industry': {
      // Rows of saw-toothed sheds with stacks behind; the footprint grows with the levels built.
      const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
      const rows = Math.ceil(n / cols);
      const w = 8.2, h = 4.2, dy = 3.4;
      const x0 = -(cols * w) / 2;
      const stacks = Math.min(5, Math.max(1, Math.round(n / 2.4)));
      const top = -(rows - 1) * dy - h;
      // Stacks stand behind the back row.
      for (let i = 0; i < stacks; i++) {
        const sx = x0 + ((i + 0.5) / stacks) * cols * w + (i % 2 ? 1.2 : -0.8);
        const sh = 8 + (i % 3) * 1.6;
        if (st.active) plume(c, sx + 0.8, top - sh - 1.4, 1.5, 'rgba(236,232,224,0.9)');
        c.strokeStyle = ink;
        poly(c, [sx - 0.9, top + 1, sx - 0.6, top - sh, sx + 0.6, top - sh, sx + 0.9, top + 1], tone(BRICK));
        if (!st.coarse) { c.beginPath(); c.moveTo(sx - 0.7, top - sh + 1.4); c.lineTo(sx + 0.7, top - sh + 1.4); c.stroke(); }
      }
      for (let r = rows - 1; r >= 0; r--) {
        // Front rows are full; the back row holds the remainder.
        const inRow = r < rows - 1 ? cols : n - cols * (rows - 1);
        const y = -r * dy;
        const off = (cols - inRow) * w * 0.5 + (r % 2 ? 0.8 : 0);
        for (let i = 0; i < inRow; i++) {
          const x = x0 + off + i * w;
          const fill = tone((i + r) % 2 ? SLATE : '#a3a9af');
          // Wall with a two-tooth north-light roof.
          poly(c, [x, y, x, y - h, x + w * 0.5, y - h - 2.2, x + w * 0.5, y - h, x + w, y - h - 2.2, x + w, y], fill);
          if (!st.coarse) {
            c.fillStyle = st.faded ? '#bdb7a8' : SLATE_DARK;
            c.fillRect(x + 1, y - h + 1.2, w * 0.5 - 2, 1.1);
            c.fillRect(x + w * 0.5 + 1, y - h + 1.2, w * 0.5 - 2, 1.1);
          }
        }
      }
      break;
    }
    case 'craft': {
      // Hand workshops: low sheds with a forge flue.
      const k = Math.min(3, n);
      const x0 = -(k * 7.2) / 2;
      for (let i = 0; i < k; i++) {
        const x = x0 + i * 7.2;
        box(c, x + 0.6, 0, 6, 3.4, tone(WALL));
        poly(c, [x, -3.4, x + 3.6, -6.2, x + 7.2, -3.4], tone(OCHRE));
        if (i === 0) {
          box(c, x + 4.6, -4.2, 1.2, 3.2, tone(BRICK));
          if (st.active) plume(c, x + 5.4, -8.6, 0.9, 'rgba(236,232,224,0.85)');
        }
      }
      break;
    }
    case 'pit': {
      // Pit head: spoil heap, head frame with its wheel, and an ore tub in the deposit's colour.
      const heap = st.depositColor ?? '#6b6257';
      poly(c, [-8, 0, -4.2, -4.6, -1.6, -2.4, 0.4, 0], tone(heap));
      if (n >= 2) poly(c, [-10.5, 0, -8.2, -2.6, -6, 0], tone(heap));
      c.strokeStyle = ink;
      c.lineWidth = lw * 1.5;
      c.beginPath();
      c.moveTo(1, 0); c.lineTo(3.4, -10); c.lineTo(5.8, 0);
      c.moveTo(3.4, -10); c.lineTo(8.6, -1.2);
      c.moveTo(2, -4.4); c.lineTo(4.8, -4.4);
      c.stroke();
      c.lineWidth = lw;
      c.fillStyle = tone(WALL);
      c.beginPath(); c.arc(3.4, -10, 1.7, 0, Math.PI * 2); c.fill(); c.stroke();
      box(c, 6.4, 0, 3.6, 3, tone(TIMBER));
      if (n >= 3) box(c, -1.4, 0, 2.4, 2, tone(heap));
      break;
    }
    case 'well': {
      // Derricks, one to four.
      const k = Math.min(4, n);
      const x0 = -((k - 1) * 6.4) / 2;
      for (let i = 0; i < k; i++) {
        const x = x0 + i * 6.4;
        const hgt = 11 - (i % 2) * 2;
        c.beginPath();
        c.moveTo(x - 2.6, 0); c.lineTo(x, -hgt); c.lineTo(x + 2.6, 0);
        c.moveTo(x - 1.7, -hgt * 0.34); c.lineTo(x + 1.7, -hgt * 0.34);
        c.moveTo(x - 0.9, -hgt * 0.66); c.lineTo(x + 0.9, -hgt * 0.66);
        if (!st.coarse) { c.moveTo(x - 1.7, -hgt * 0.34); c.lineTo(x + 0.9, -hgt * 0.66); c.moveTo(x - 2.6, 0); c.lineTo(x + 1.7, -hgt * 0.34); }
        c.stroke();
        c.fillStyle = tone(st.depositColor ?? '#4a3526');
        c.beginPath(); c.ellipse(x, 0.2, 3, 0.9, 0, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'timber': {
      // Timber and quarry camp: stacked logs and a cut block.
      c.fillStyle = tone(TIMBER);
      for (const [x, y] of [[-5, -1.3], [-2.4, -1.3], [0.2, -1.3], [-3.7, -3.6], [-1.1, -3.6], [-2.4, -5.9]]) {
        c.beginPath(); c.arc(x, y, 1.3, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      poly(c, [3, 0, 3, -4, 6, -5.4, 8.4, -4, 8.4, 0], tone('#cfc7b4'));
      c.beginPath(); c.moveTo(6, -5.4); c.lineTo(6, -1.6); c.lineTo(8.4, 0); c.moveTo(6, -1.6); c.lineTo(3, 0); c.stroke();
      break;
    }
    case 'mill': {
      // Water wheel beside a mill house.
      box(c, -6, 0, 6, 4.6, tone(WALL));
      poly(c, [-6.8, -4.6, -3, -8, 0.8, -4.6], tone(OCHRE));
      c.fillStyle = tone('#d9c8a0');
      c.beginPath(); c.arc(3, -3.6, 3.6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath();
      for (let i = 0; i < 4; i++) { const a = (Math.PI / 4) * i; c.moveTo(3 - Math.cos(a) * 3.6, -3.6 - Math.sin(a) * 3.6); c.lineTo(3 + Math.cos(a) * 3.6, -3.6 + Math.sin(a) * 3.6); }
      c.stroke();
      break;
    }
    case 'thermal':
    case 'nuclear': {
      // Boiler hall and one to three waisted cooling towers (a domed reactor for fission).
      const k = Math.min(3, n);
      const x0 = -(k * 7.2 + 6) / 2;
      if (kind === 'nuclear') {
        box(c, x0, 0, 5.6, 4, tone(STEEL));
        c.fillStyle = tone(WALL);
        c.beginPath(); c.arc(x0 + 2.8, -4, 2.8, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
      } else {
        box(c, x0, 0, 5.6, 5.2, tone(SLATE));
        box(c, x0 + 3.6, -5.2, 1.2, 5.4, tone(BRICK));
        if (st.active) plume(c, x0 + 4.6, -12, 1.1, 'rgba(210,205,196,0.9)');
      }
      for (let i = 0; i < k; i++) {
        const x = x0 + 7 + i * 7.2;
        c.fillStyle = tone('#e3ddce');
        c.beginPath();
        c.moveTo(x, 0);
        c.quadraticCurveTo(x + 1.9, -5, x + 1, -10);
        c.lineTo(x + 5.2, -10);
        c.quadraticCurveTo(x + 4.3, -5, x + 6.2, 0);
        c.closePath();
        c.fill(); c.stroke();
        if (st.active) plume(c, x + 3.6, -11.6, 1.5, 'rgba(250,250,247,0.95)');
      }
      break;
    }
    case 'hydro': {
      // A dam face across a blue reach.
      c.fillStyle = st.faded ? '#cfd5d2' : '#8fb4c4';
      c.beginPath(); c.moveTo(-10, -5.6); c.lineTo(-2, -5.6); c.lineTo(-3.4, 0); c.lineTo(-10, 0); c.closePath(); c.fill();
      poly(c, [-3.6, 0, -1.6, -7.6, 1.2, -7.6, 3.6, 0], tone('#d9d3c4'));
      c.beginPath();
      for (const x of [-1.2, 0.2, 1.6]) { c.moveTo(x * 0.8, -6); c.lineTo(x * 1.25, -0.6); }
      c.stroke();
      box(c, 4.4, 0, 5, 3.4, tone(SLATE));
      break;
    }
    case 'fusion': {
      // Ring hall: a torus seen in section between two service blocks.
      box(c, -9, 0, 4, 4.4, tone(STEEL));
      box(c, 5, 0, 4, 4.4, tone(STEEL));
      c.fillStyle = tone('#e8edf0');
      c.beginPath(); c.ellipse(0, -5, 6.4, 5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = st.active && !st.faded ? '#f0c463' : tone(WALL);
      c.beginPath(); c.ellipse(0, -5, 2.8, 2.1, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      break;
    }
    case 'beamed': {
      // Receiving field for beamed power: a tilted mesh on masts.
      poly(c, [-9, -3, 0, -9, 9, -3, 0, -0.6], tone('#dfe6e2'));
      c.beginPath();
      c.moveTo(-4.5, -6); c.lineTo(4.5, -1.8); c.moveTo(4.5, -6); c.lineTo(-4.5, -1.8); c.moveTo(0, -9); c.lineTo(0, -0.6);
      c.moveTo(-9, -3); c.lineTo(-9, 0); c.moveTo(9, -3); c.lineTo(9, 0);
      c.stroke();
      break;
    }
    case 'port': {
      // Quay and warehouse with a moored hull; more berths with more levels.
      const k = Math.min(3, n);
      box(c, -8 - k, 0, 7, 3.6, tone(WALL));
      poly(c, [-8.8 - k, -3.6, -4.5 - k, -6.2, -0.2 - k, -3.6], tone('#7f9bb0'));
      c.lineWidth = lw * 1.6;
      c.beginPath(); c.moveTo(-1 - k, 0); c.lineTo(9 + k, 0); c.stroke();
      c.lineWidth = lw;
      c.beginPath();
      for (let i = 0; i < k + 1; i++) { const x = 1 + i * 3.4; c.moveTo(x, 0); c.lineTo(x, 1.8); }
      c.stroke();
      for (let i = 0; i < k; i++) {
        const x = 2.6 + i * 5.2 - k;
        poly(c, [x - 2.4, -1.2, x + 2.6, -1.2, x + 1.8, 0.6, x - 1.6, 0.6], tone('#8a6a45'));
        c.beginPath(); c.moveTo(x, -1.2); c.lineTo(x, -6); c.stroke();
        poly(c, [x, -5.6, x + 2.6, -2.4, x, -2.4], tone(WALL));
      }
      break;
    }
    case 'school': {
      // A porticoed hall under a pediment.
      box(c, -7, 0, 14, 1.2, tone(WALL));
      box(c, -6, -1.2, 12, 4.6, tone(WALL));
      poly(c, [-7.2, -5.8, 0, -9.6, 7.2, -5.8], tone('#b9a7d6'));
      c.beginPath();
      for (let x = -4.5; x <= 4.5; x += 3) { c.moveTo(x, -1.4); c.lineTo(x, -5.6); }
      c.stroke();
      break;
    }
    case 'lab': {
      // An observatory dome beside a laboratory block.
      box(c, -8, 0, 8, 5, tone(WALL));
      if (!st.coarse) { c.fillStyle = st.faded ? '#bdb7a8' : VIOLET; c.fillRect(-6.8, -3.8, 1.4, 1.4); c.fillRect(-4.2, -3.8, 1.4, 1.4); c.fillRect(-1.8, -3.8, 1.4, 1.4); }
      box(c, 1, 0, 6.4, 3.6, tone(WALL));
      c.fillStyle = tone(VIOLET);
      c.beginPath(); c.arc(4.2, -3.6, 3.2, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(4.2, -6.8); c.lineTo(6.6, -10.2); c.stroke();
      break;
    }
    case 'launch': {
      // Gantry and a vehicle on its pad.
      box(c, -7, 0, 14, 1.4, tone('#cfc7b4'));
      c.beginPath();
      c.moveTo(-5.6, -1.4); c.lineTo(-5.6, -17); c.moveTo(-3.2, -1.4); c.lineTo(-3.2, -17); c.moveTo(-5.6, -17); c.lineTo(-3.2, -17);
      for (let y = -4.4; y > -17; y -= 3.1) { c.moveTo(-5.6, y); c.lineTo(-3.2, y - 3.1 > -17 ? y - 3.1 : -17); }
      c.moveTo(-3.2, -12); c.lineTo(0.2, -12);
      c.stroke();
      c.fillStyle = tone(WALL);
      c.beginPath();
      c.moveTo(1.6, -18.5);
      c.quadraticCurveTo(4.2, -15, 3.6, -1.4);
      c.lineTo(-0.4, -1.4);
      c.quadraticCurveTo(-1, -15, 1.6, -18.5);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = tone(TEAL);
      c.beginPath(); c.moveTo(-0.4, -4.6); c.lineTo(-2.2, -1.4); c.lineTo(-0.4, -1.4); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(3.6, -4.6); c.lineTo(5.4, -1.4); c.lineTo(3.6, -1.4); c.closePath(); c.fill(); c.stroke();
      c.fillRect(-0.2, -11, 3.6, 1.2);
      break;
    }
    case 'orbital': {
      // Ground station: a steerable dish and a mast.
      box(c, -8, 0, 6, 3.4, tone(WALL));
      c.beginPath(); c.moveTo(-5, -3.4); c.lineTo(-5, -11); c.moveTo(-6.4, -9); c.lineTo(-3.6, -9); c.stroke();
      c.beginPath(); c.moveTo(3, 0); c.lineTo(3, -4.4); c.stroke();
      c.fillStyle = tone('#e8edf0');
      c.beginPath(); c.arc(3, -7.2, 4.6, 0.35, Math.PI + 0.35); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(3, -7.2); c.lineTo(5.6, -10.6); c.stroke();
      c.fillStyle = tone(TEAL);
      c.beginPath(); c.arc(5.6, -10.6, 0.9, 0, Math.PI * 2); c.fill(); c.stroke();
      break;
    }
    case 'jump': {
      // Jump works: a great standing ring on a cradle.
      c.lineWidth = lw * 2.4;
      c.strokeStyle = st.faded ? INK_3 : '#2f5f5b';
      c.beginPath(); c.ellipse(0, -9.6, 6.2, 8, 0, 0, Math.PI * 2); c.stroke();
      c.lineWidth = lw;
      c.strokeStyle = ink;
      c.beginPath(); c.ellipse(0, -9.6, 7.3, 9.1, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(0, -9.6, 5.1, 6.9, 0, 0, Math.PI * 2); c.stroke();
      if (st.active && !st.faded) {
        c.fillStyle = 'rgba(123,201,190,0.55)';
        c.beginPath(); c.ellipse(0, -9.6, 4.6, 6.4, 0, 0, Math.PI * 2); c.fill();
      }
      poly(c, [-8.6, 0, -5, -2.6, 5, -2.6, 8.6, 0], tone(STEEL));
      break;
    }
    case 'scaffold': {
      // Work in hand: a scaffolded frame and a jib.
      c.strokeStyle = st.faded ? INK_3 : '#8a5a12';
      box(c, -6, 0, 9, 4, 'rgba(247,241,225,0.9)');
      c.beginPath();
      for (const x of [-6, -3, 0, 3]) { c.moveTo(x, 0); c.lineTo(x, -9); }
      for (const y of [-3, -6, -9]) { c.moveTo(-6, y); c.lineTo(3, y); }
      c.moveTo(-6, -6); c.lineTo(-3, -9); c.moveTo(0, -3); c.lineTo(3, -6);
      c.stroke();
      c.lineWidth = lw * 1.5;
      c.beginPath(); c.moveTo(5.4, 0); c.lineTo(5.4, -12.6); c.moveTo(2.4, -12.6); c.lineTo(9.6, -11); c.moveTo(8.4, -11.2); c.lineTo(8.4, -7.4); c.stroke();
      c.lineWidth = lw;
      c.fillStyle = AMBER;
      c.fillRect(7.4, -7.4, 2, 1.6);
      break;
    }
    case 'hamlet': {
      // A farmstead: two roofs and a rick.
      box(c, -5.4, 0, 4.4, 2.6, tone(WALL));
      poly(c, [-6, -2.6, -3.2, -5, -0.4, -2.6], tone('#b9825a'));
      box(c, 0.6, 0, 3.6, 2.2, tone(WALL));
      poly(c, [0.1, -2.2, 2.4, -4.2, 4.7, -2.2], tone('#b9825a'));
      if (n >= 2) { c.fillStyle = tone('#d9c26a'); c.beginPath(); c.arc(-7.4, -1.1, 1.3, Math.PI, 0); c.lineTo(-6.1, 0); c.lineTo(-8.7, 0); c.closePath(); c.fill(); c.stroke(); }
      break;
    }
  }
}

// --- sector chips -------------------------------------------------------------------------

export type ChipGlyph = Sector | 'craft' | 'school' | 'port' | 'jump' | 'build';

/** Sector pictograms in a 12×12 box centred on the origin, drawn in the current stroke and fill. */
export function drawChipGlyph(c: Ctx, g: ChipGlyph, lw: number): void {
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  switch (g) {
    case 'food':
      // An ear of grain.
      c.moveTo(0, 4.6); c.lineTo(0, -4.4);
      for (const y of [-2.6, -0.4, 1.8]) { c.moveTo(0, y + 1.4); c.quadraticCurveTo(-2.9, y + 0.6, -3, y - 1.6); c.moveTo(0, y + 1.4); c.quadraticCurveTo(2.9, y + 0.6, 3, y - 1.6); }
      c.stroke();
      break;
    case 'extraction':
      // Pick: curved head and a handle.
      c.moveTo(-3.8, -1); c.quadraticCurveTo(0, -5.2, 3.8, -1);
      c.moveTo(0, -3.1); c.lineTo(0, 4.4);
      c.stroke();
      break;
    case 'industry':
      // Saw-toothed works with a stack.
      c.moveTo(-4.4, 3.4); c.lineTo(-4.4, -0.6); c.lineTo(-1.6, 1.2); c.lineTo(-1.6, -0.6); c.lineTo(1.2, 1.2);
      c.lineTo(1.2, -4.4); c.lineTo(3.2, -4.4); c.lineTo(4.4, 3.4);
      c.closePath();
      c.fill();
      break;
    case 'craft':
      // Hammer.
      c.moveTo(-2.8, 4); c.lineTo(1.2, -0.8);
      c.stroke();
      c.beginPath();
      c.moveTo(-1.2, -3.6); c.lineTo(3.8, 0.2); c.lineTo(2.3, 2.1); c.lineTo(-2.7, -1.7);
      c.closePath();
      c.fill();
      break;
    case 'power':
      // Bolt.
      c.moveTo(1.5, -4.8); c.lineTo(-2.9, 0.7); c.lineTo(-0.2, 0.7); c.lineTo(-1.5, 4.8); c.lineTo(2.9, -0.9); c.lineTo(0.2, -0.9);
      c.closePath();
      c.fill();
      break;
    case 'transport':
    case 'port':
      // Anchor.
      c.arc(0, -3.4, 1.05, 0, Math.PI * 2);
      c.moveTo(0, -2.3); c.lineTo(0, 4.1);
      c.moveTo(-2.1, -0.6); c.lineTo(2.1, -0.6);
      c.moveTo(-3.8, 1.1); c.quadraticCurveTo(-3.2, 4.1, 0, 4.1); c.quadraticCurveTo(3.2, 4.1, 3.8, 1.1);
      c.stroke();
      break;
    case 'civic':
      // Columned front.
      c.moveTo(-4.2, -1.8); c.lineTo(0, -4.6); c.lineTo(4.2, -1.8); c.closePath();
      c.fill();
      c.beginPath();
      for (const x of [-3, 0, 3]) { c.moveTo(x, -1); c.lineTo(x, 3); }
      c.moveTo(-4.2, 3.9); c.lineTo(4.2, 3.9);
      c.stroke();
      break;
    case 'school':
      // Open book.
      c.moveTo(0, -2.3);
      c.quadraticCurveTo(-2.3, -3.8, -4.4, -2.7);
      c.lineTo(-4.4, 2.8);
      c.quadraticCurveTo(-2.3, 1.7, 0, 3.2);
      c.quadraticCurveTo(2.3, 1.7, 4.4, 2.8);
      c.lineTo(4.4, -2.7);
      c.quadraticCurveTo(2.3, -3.8, 0, -2.3);
      c.lineTo(0, 3.2);
      c.stroke();
      break;
    case 'knowledge':
      // Flask.
      c.moveTo(-1.3, -4.3); c.lineTo(1.3, -4.3);
      c.moveTo(-0.9, -4.3); c.lineTo(-0.9, -1); c.lineTo(-3.6, 3.7); c.lineTo(3.6, 3.7); c.lineTo(0.9, -1); c.lineTo(0.9, -4.3);
      c.stroke();
      c.beginPath();
      c.moveTo(-2.4, 1.6); c.lineTo(2.4, 1.6); c.lineTo(3.6, 3.7); c.lineTo(-3.6, 3.7);
      c.closePath();
      c.fill();
      break;
    case 'space':
      // Rocket.
      c.moveTo(0, -4.9);
      c.quadraticCurveTo(2.3, -2, 1.7, 2.2);
      c.lineTo(-1.7, 2.2);
      c.quadraticCurveTo(-2.3, -2, 0, -4.9);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(-1.7, 0.6); c.lineTo(-3.6, 3.4); c.lineTo(-1.5, 2.6);
      c.moveTo(1.7, 0.6); c.lineTo(3.6, 3.4); c.lineTo(1.5, 2.6);
      c.moveTo(0, 2.8); c.lineTo(0, 4.7);
      c.stroke();
      break;
    case 'jump':
      // Ring with a four-point star.
      c.arc(0, 0, 4.3, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (Math.PI / 4) * i;
        const rr = i % 2 ? 0.95 : 3.1;
        if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      break;
    case 'build':
      // Jib crane.
      c.moveTo(-1.6, 4.4); c.lineTo(-1.6, -4.2); c.moveTo(-4, -4.2); c.lineTo(4.2, -2.8); c.moveTo(3, -3); c.lineTo(3, 0.4);
      c.moveTo(-3.6, 4.4); c.lineTo(0.6, 4.4);
      c.stroke();
      c.beginPath();
      c.rect(1.9, 0.4, 2.2, 1.9);
      c.fill();
      break;
  }
}

export interface ChipSpec { glyph: ChipGlyph; color: string; magnitude: number; label?: string }
export const BUILD_AMBER = '#b3761e';

/** Sector chips for a governed region; `brief` keeps only what weighs (for far zoom). */
export function sectorChips(use: LandUse, brief: boolean): ChipSpec[] {
  const out: ChipSpec[] = [];
  const add = (glyph: ChipGlyph, sector: Sector, levels: number) => {
    const m = magnitude(levels);
    if (m > (brief ? 1 : 0)) out.push({ glyph, color: SECTOR_COLOR[sector], magnitude: m });
  };
  add('food', 'food', use.sectors.food);
  add('extraction', 'extraction', use.sectors.extraction);
  add(use.heavy > 0 ? 'industry' : 'craft', 'industry', use.sectors.industry);
  add('power', 'power', use.sectors.power);
  add(use.labs >= use.schools ? 'knowledge' : 'school', 'knowledge', use.sectors.knowledge);
  if (use.port > 0) add('port', 'transport', use.port * 3);
  if (use.sectors.space > 0) out.push({ glyph: use.jump > 0 ? 'jump' : 'space', color: SECTOR_COLOR.space, magnitude: Math.max(2, magnitude(use.sectors.space)) });
  if (use.building.levels > 0) out.push({ glyph: 'build', color: BUILD_AMBER, magnitude: 2, label: '+' + use.building.levels });
  return out.slice(0, 7);
}

const chipUrls = new Map<string, string>();
/** A chip as an image URL, for HTML labels (the 3D tier); cached per look. */
export function chipDataUrl(chip: ChipSpec): string {
  const key = `${chip.glyph}|${chip.color}|${chip.magnitude}`;
  let url = chipUrls.get(key);
  if (url === undefined) {
    const px = Math.ceil(chipRadius(chip.magnitude, 1) * 2 + 4);
    const c = document.createElement('canvas');
    c.width = c.height = px * 2;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(2, 2);
      drawChip(ctx, { ...chip, label: undefined }, px / 2, px / 2, 1);
    }
    url = ctx ? c.toDataURL('image/png') : '';
    chipUrls.set(key, url);
  }
  return url;
}

/** Radius in CSS pixels of a chip of the given magnitude (1–4) at scale `k`. */
export function chipRadius(magnitude: number, k: number): number {
  return (5.6 + Math.min(4, Math.max(1, magnitude)) * 1.15) * k;
}

/**
 * A sector chip: a disc whose size and weight say how much of the sector the region holds.
 * Light discs are a little or some; ringed discs a lot; a solid disc is a sector that dominates.
 */
export function drawChip(c: Ctx, chip: ChipSpec, x: number, y: number, k: number, faded = false): number {
  const r = chipRadius(chip.magnitude, k);
  const m = chip.magnitude;
  const col = faded ? INK_3 : chip.color;
  c.save();
  c.translate(x, y);
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fillStyle = m >= 4 ? col : WALL;
  c.fill();
  c.lineWidth = m >= 3 ? 1.9 : 1;
  c.strokeStyle = m >= 3 ? col : 'rgba(43,38,32,0.7)';
  c.stroke();
  if (m >= 4) { c.lineWidth = 1; c.strokeStyle = 'rgba(43,38,32,0.85)'; c.beginPath(); c.arc(0, 0, r + 1.1, 0, Math.PI * 2); c.stroke(); }
  const g = (r / 6.6) * 0.92;
  c.scale(g, g);
  c.strokeStyle = c.fillStyle = m >= 4 ? '#fffdf5' : m >= 3 ? col : INK;
  drawChipGlyph(c, chip.glyph, 1.2 / g + 0.25);
  c.restore();
  if (chip.label) {
    c.save();
    c.font = `700 ${Math.round(9.5 * Math.max(1, k))}px ui-sans-serif, system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const tw = c.measureText(chip.label).width;
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(247,241,225,0.95)';
    c.strokeText(chip.label, x + r + 2.5, y + 0.5);
    c.fillStyle = faded ? INK_3 : INK;
    c.fillText(chip.label, x + r + 2.5, y + 0.5);
    c.restore();
    return r * 2 + 2.5 + tw;
  }
  return r * 2;
}
