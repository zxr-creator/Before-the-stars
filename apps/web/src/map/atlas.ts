// The flat atlas tier: a framework-free Canvas 2D renderer for the seat's known
// world. It draws ONLY what is present in the observation. Regions that are not
// in `regions` are blank paper; an edge whose far side is not known is drawn as
// an "edge of knowledge", never as a coastline.
//
// Rendering is on demand: every state change calls invalidate(), which coalesces
// into a single requestAnimationFrame. There is no continuous loop.
import type {
  ArmyView, Deposit, ForeignArmyView, RegionId, RegionView, Role, SettlementKind, Terrain, WorldFrame,
} from '../protocol';
import { hash32, rng } from '../format';

export type MapMode = 'political' | 'terrain' | 'resources' | 'population';
export type FacilityIcon = 'mine' | 'workshop' | 'industry' | 'school' | 'lab' | 'power' | 'port' | 'launch' | 'jump';

export interface AtlasData {
  world: WorldFrame;
  regions: RegionView[];
  mySeat: number;
  /** Seat → CSS hex colour for this seat and every known counterpart. */
  seatColors: Record<number, string>;
  capital: RegionId | null;
  armies: ArmyView[];
  foreignArmies: ForeignArmyView[];
  month: number;
  /** Facility kind → map pictogram (derived by the caller from the catalog). */
  facilityIcons: Record<string, FacilityIcon>;
}

export interface AtlasOverlay {
  mode: MapMode;
  selected: RegionId | null;
  hovered: RegionId | null;
  /** Pick mode: `undefined` = off, `null` = any known region, array = only these. */
  targets: RegionId[] | null | undefined;
  marked: RegionId[];
}

export interface Insets { left: number; right: number; top: number; bottom: number }

// --- palette ----------------------------------------------------------------

const PAPER = '#efe6cf';
const PAPER_LIGHT = '#f7f1e1';
const INK = '#2b2620';
const INK_2 = '#5a5044';
const INK_3 = '#8a7d6a';
const SEA = '#6f9aa6';
const RIVER = '#3f7592';
const ACCENT = '#9c3d2a';
const GOLD = '#b08a3a';
const UNKNOWN_OWNER = '#6b6257';
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif';

const TINT: Record<Terrain, string> = {
  plains: '#dcdfa6',
  hills: '#d6bc8a',
  mountains: '#cdc1ad',
  forest: '#b4cd97',
  marsh: '#bdd3ba',
  steppe: '#dcd88c',
  desert: '#f1dab2',
  tundra: '#e3e7e1',
};
const LAND_BASE = '#ece2c4';
const GREY_PAPER = '#e2dccb';

/** Population classes (people per region) and their wash colours. */
export const POP_BREAKS = [100, 500, 2000, 10000, 50000, 250000];
export const POP_RAMP = ['#efe3c2', '#e7d09f', '#deb87d', '#d09a5d', '#be7a44', '#a45a31', '#803e23'];
export const DEPOSIT_COLOR: Record<Deposit, string> = {
  copper_ore: '#b9743a',
  iron_ore: '#5d6470',
  coal: '#2a2724',
  crude: '#4a3526',
  minerals: '#6d5ca8',
};
export const TERRAIN_TINT = TINT;

type RGB = [number, number, number];
function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return [107, 98, 87];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbStr(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
/** Linear mix of two hex colours; returns a hex colour so results can be mixed again. */
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const h = (i: number) => clamp(Math.round(x[i] + (y[i] - x[i]) * t), 0, 255).toString(16).padStart(2, '0');
  return '#' + h(0) + h(1) + h(2);
}
function alpha(hex: string, a: number): string {
  return rgbStr(hexToRgb(hex), a);
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function popClass(people: number): number {
  let i = 0;
  while (i < POP_BREAKS.length && people >= POP_BREAKS[i]) i++;
  return i;
}

// --- prepared geometry --------------------------------------------------------

type EdgeKind = 'internal' | 'coast' | 'unknown';

interface Edge {
  key: string;
  /** Wobbled polyline from the canonical first endpoint to the second, flattened x,y. */
  pts: number[];
  regions: number[];
  frame: boolean;
  kind: EdgeKind;
  mx: number;
  my: number;
  len: number;
}

interface Glyph { x: number; y: number; v: number; rank: number }
interface FieldPatch { x: number; y: number; w: number; h: number; skew: number; alt: boolean }

interface Prep {
  r: RegionView;
  idx: number;
  edges: { e: Edge; rev: boolean }[];
  outline: number[];
  path: Path2D;
  ownerEdges: Path2D | null;
  unknownEdges: Path2D | null;
  bbox: [number, number, number, number];
  cx: number;
  cy: number;
  glyphs: Glyph[];
  fields: FieldPatch[];
  icons: FacilityIcon[];
  ccw: boolean;
}

interface LinkLine { a: number; b: number; pts: number[] }
interface PassMark { x: number; y: number; ux: number; uy: number }

function pointInPoly(pts: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distToPolyEdge(poly: [number, number][], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    d = Math.min(d, distToSeg(x, y, a[0], a[1], b[0], b[1]));
  }
  return d;
}

/** Midpoint-displacement wobble; deterministic for a given seed. Returns flattened points a..b inclusive. */
function wobble(ax: number, ay: number, bx: number, by: number, seed: number, rough: number): number[] {
  const rand = rng(seed);
  let pts: number[] = [ax, ay, bx, by];
  const len = Math.hypot(bx - ax, by - ay);
  const depth = len > 130 ? 4 : len > 56 ? 3 : len > 22 ? 2 : len > 9 ? 1 : 0;
  let amp = rough;
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
      const sl = Math.hypot(x1 - x0, y1 - y0) || 1;
      const off = (rand() - 0.5) * 2 * amp * sl;
      next.push(x0, y0, (x0 + x1) / 2 + (-(y1 - y0) / sl) * off, (y0 + y1) / 2 + ((x1 - x0) / sl) * off);
    }
    next.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = next;
    amp *= 0.92;
  }
  return pts;
}

function tracePolyline(path: Path2D, pts: number[], rev: boolean, move: boolean): void {
  const n = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const i = (rev ? n - 1 - k : k) * 2;
    if (k === 0) {
      if (move) path.moveTo(pts[i], pts[i + 1]);
      else path.lineTo(pts[i], pts[i + 1]);
    } else path.lineTo(pts[i], pts[i + 1]);
  }
}

const GLYPH_SPACING: Record<Terrain, number> = {
  forest: 23, mountains: 35, hills: 29, marsh: 25, desert: 30, steppe: 22, tundra: 21, plains: 40,
};
const SETTLEMENT_RANK: Record<SettlementKind, number> = {
  wilderness: 0, camp: 1, village: 2, town: 3, city: 4, metropolis: 5,
};
const ICON_ORDER: FacilityIcon[] = ['jump', 'launch', 'lab', 'school', 'power', 'industry', 'workshop', 'mine', 'port'];

// --- the renderer -------------------------------------------------------------

export class Atlas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private scale = 0.7;
  private tx = 0;
  private ty = 0;
  private data: AtlasData | null = null;
  private preps: Prep[] = [];
  private byId = new Map<number, Prep>();
  private overlay: AtlasOverlay = { mode: 'political', selected: null, hovered: null, targets: undefined, marked: [] };
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private raf = 0;
  private animRaf = 0;
  private reducedMotion: boolean;
  private grain: CanvasPattern | null = null;
  private destroyed = false;

  private wobbleCache = new Map<string, number[]>();
  private glyphCache = new Map<string, Glyph[]>();
  private coastPath = new Path2D();
  private unknownPath = new Path2D();
  private internalPath = new Path2D();
  private politicalPath = new Path2D();
  private ripple1 = new Path2D();
  private ripple2 = new Path2D();
  private rivers: LinkLine[] = [];
  private riverPath = new Path2D();
  private seaLinks: { ax: number; ay: number; bx: number; by: number; cx: number; cy: number }[] = [];
  private passes: PassMark[] = [];

  /** Milliseconds spent in the most recent draw (for the dev harness). */
  lastDrawMs = 0;
  /** Called after the view transform changes (pan/zoom/fit). */
  onViewChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion?: boolean } = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.reducedMotion = !!opts.reducedMotion;
    this.resize();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.animRaf) cancelAnimationFrame(this.animRaf);
    this.raf = 0;
    this.animRaf = 0;
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  get zoom(): number {
    return this.scale;
  }
  get hasData(): boolean {
    return this.preps.length > 0;
  }
  get mode(): MapMode {
    return this.overlay.mode;
  }

  // --- view -------------------------------------------------------------------

  resize(): boolean {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cw === this.w && ch === this.h && dpr === this.dpr) return false;
    this.w = cw;
    this.h = ch;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cw * dpr));
    this.canvas.height = Math.max(1, Math.round(ch * dpr));
    this.grain = null;
    this.invalidate();
    return true;
  }

  setInsets(i: Insets): void {
    this.insets = { ...i };
  }

  private box(): { x: number; y: number; w: number; h: number } {
    const i = this.insets;
    const w = Math.max(120, this.w - i.left - i.right);
    const h = Math.max(120, this.h - i.top - i.bottom);
    return { x: i.left, y: i.top, w, h };
  }

  private minScale(): number {
    const d = this.data;
    if (!d || !this.w) return 0.2;
    return Math.max(0.12, Math.min(this.w / d.world.width, this.h / d.world.height) * 0.6);
  }
  private maxScale(): number {
    return 5;
  }

  private clampView(): void {
    const d = this.data;
    if (!d) return;
    const b = this.box();
    const keep = 90;
    const minTx = b.x + keep - d.world.width * this.scale;
    const maxTx = b.x + b.w - keep;
    const minTy = b.y + keep - d.world.height * this.scale;
    const maxTy = b.y + b.h - keep;
    this.tx = clamp(this.tx, minTx, maxTx);
    this.ty = clamp(this.ty, minTy, maxTy);
  }

  private viewChanged(): void {
    this.clampView();
    this.invalidate();
    if (this.onViewChange) this.onViewChange();
  }

  /** Fit every known region into the uncovered box. */
  fit(animate = false): void {
    const d = this.data;
    if (!d || !this.preps.length || !this.w) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of this.preps) {
      x0 = Math.min(x0, p.bbox[0]); y0 = Math.min(y0, p.bbox[1]);
      x1 = Math.max(x1, p.bbox[2]); y1 = Math.max(y1, p.bbox[3]);
    }
    const pad = 70;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    // Do not zoom absurdly far into a small known patch.
    const minW = Math.min(d.world.width, 620), minH = Math.min(d.world.height, 420);
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
    const b = this.box();
    // Leave the strip with the map controls clear when there is room for it.
    const strip = b.h > 360 ? 44 : 0;
    const bh = b.h - strip;
    const s = clamp(Math.min(b.w / (x1 - x0), bh / (y1 - y0)), this.minScale(), 2.2);
    const tx = b.x + b.w / 2 - ((x0 + x1) / 2) * s;
    const ty = b.y + bh / 2 - ((y0 + y1) / 2) * s;
    this.goTo(s, tx, ty, animate);
  }

  /** Centre a region in the uncovered box, zooming in a little if the view is far out. */
  focusRegion(id: RegionId, animate = true): void {
    const p = this.byId.get(id);
    if (!p || !this.w) return;
    const b = this.box();
    const bw = p.bbox[2] - p.bbox[0], bh = p.bbox[3] - p.bbox[1];
    const comfortable = clamp(Math.min(b.w / (bw * 3.2), b.h / (bh * 3.2)), this.minScale(), 2.4);
    const s = Math.max(this.scale, comfortable);
    const tx = b.x + b.w / 2 - p.cx * s;
    const ty = b.y + b.h / 2 - p.cy * s;
    this.goTo(s, tx, ty, animate);
  }

  private goTo(s: number, tx: number, ty: number, animate: boolean): void {
    if (this.animRaf) cancelAnimationFrame(this.animRaf);
    this.animRaf = 0;
    if (!animate || this.reducedMotion) {
      this.scale = s; this.tx = tx; this.ty = ty;
      this.viewChanged();
      return;
    }
    // A short, finite tween; it stops by itself and is not a render loop.
    const s0 = this.scale, x0 = this.tx, y0 = this.ty;
    const t0 = performance.now();
    const dur = 260;
    const step = (now: number) => {
      if (this.destroyed) return;
      const t = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      this.scale = s0 + (s - s0) * e;
      this.tx = x0 + (tx - x0) * e;
      this.ty = y0 + (ty - y0) * e;
      this.viewChanged();
      this.animRaf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.animRaf = requestAnimationFrame(step);
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const s = clamp(this.scale * factor, this.minScale(), this.maxScale());
    if (s === this.scale) return;
    const wx = (sx - this.tx) / this.scale;
    const wy = (sy - this.ty) / this.scale;
    this.scale = s;
    this.tx = sx - wx * s;
    this.ty = sy - wy * s;
    this.viewChanged();
  }

  /** Zoom about the centre of the uncovered box (for buttons and keys). */
  zoomBy(factor: number): void {
    const b = this.box();
    this.zoomAt(factor, b.x + b.w / 2, b.y + b.h / 2);
  }

  panBy(dx: number, dy: number): void {
    if (!dx && !dy) return;
    this.tx += dx;
    this.ty += dy;
    this.viewChanged();
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [x * this.scale + this.tx, y * this.scale + this.ty];
  }
  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.tx) / this.scale, (sy - this.ty) / this.scale];
  }

  regionAt(sx: number, sy: number): RegionId | null {
    const [x, y] = this.screenToWorld(sx, sy);
    for (const p of this.preps) {
      if (x < p.bbox[0] || x > p.bbox[2] || y < p.bbox[1] || y > p.bbox[3]) continue;
      if (pointInPoly(p.outline, x, y)) return p.r.id;
    }
    return null;
  }

  regionCenter(id: RegionId): [number, number] | null {
    const p = this.byId.get(id);
    return p ? this.worldToScreen(p.cx, p.cy) : null;
  }

  // --- state --------------------------------------------------------------------

  setOverlay(o: Partial<AtlasOverlay>): void {
    let changed = false;
    const cur = this.overlay as unknown as Record<string, unknown>;
    for (const k of Object.keys(o) as (keyof AtlasOverlay)[]) {
      const v = o[k];
      const before = cur[k];
      const same = Array.isArray(v) && Array.isArray(before)
        ? v.length === before.length && v.every((x, i) => x === before[i])
        : v === before;
      if (!same) {
        cur[k] = v;
        changed = true;
      }
    }
    if (changed) this.invalidate();
  }

  setData(d: AtlasData): void {
    this.data = d;
    this.prepare(d);
    this.invalidate();
  }

  invalidate(): void {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  /** Synchronous draw, for tests. */
  drawNow(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.draw();
  }

  // --- geometry preparation -------------------------------------------------------

  private prepare(d: AtlasData): void {
    const W = d.world.width, H = d.world.height;
    const snap = new Map<string, [number, number]>();
    const canon = (x: number, y: number): [number, number] => {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const hit = snap.get(`${x + dx},${y + dy}`);
          if (hit) return hit;
        }
      }
      const v: [number, number] = [x, y];
      snap.set(`${x},${y}`, v);
      return v;
    };

    const edges = new Map<string, Edge>();
    const preps: Prep[] = [];
    const present = new Set<number>();
    for (const r of d.regions) present.add(r.id);

    d.regions.forEach((r, idx) => {
      const verts: [number, number][] = [];
      for (const pt of r.poly) {
        const v = canon(Math.round(pt[0]), Math.round(pt[1]));
        if (!verts.length || verts[verts.length - 1] !== v) verts.push(v);
      }
      if (verts.length > 1 && verts[0] === verts[verts.length - 1]) verts.pop();
      let area2 = 0;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        area2 += a[0] * b[1] - b[0] * a[1];
      }
      const p: Prep = {
        r, idx, edges: [], outline: [], path: new Path2D(), ownerEdges: null, unknownEdges: null,
        bbox: [Infinity, Infinity, -Infinity, -Infinity], cx: r.center[0], cy: r.center[1],
        glyphs: [], fields: [], icons: [], ccw: area2 < 0,
      };
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        const fwd = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
        const p0 = fwd ? a : b, p1 = fwd ? b : a;
        const key = `${p0[0]},${p0[1]}|${p1[0]},${p1[1]}`;
        let e = edges.get(key);
        if (!e) {
          const frame =
            (p0[0] <= 1 && p1[0] <= 1) || (p0[0] >= W - 1 && p1[0] >= W - 1) ||
            (p0[1] <= 1 && p1[1] <= 1) || (p0[1] >= H - 1 && p1[1] >= H - 1);
          let pts = this.wobbleCache.get(key);
          if (!pts) {
            const seed = hash32(p0[0] * 4099 + p0[1], p1[0] * 4099 + p1[1]);
            pts = wobble(p0[0], p0[1], p1[0], p1[1], seed, frame ? 0.04 : 0.085);
            if (frame) {
              // The world sheet ends here: bow the shore inward so land does not look cut off.
              const n = pts.length / 2;
              const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
              const inx = p0[0] <= 1 && p1[0] <= 1 ? 1 : p0[0] >= W - 1 && p1[0] >= W - 1 ? -1 : 0;
              const iny = inx ? 0 : p0[1] <= 1 && p1[1] <= 1 ? 1 : -1;
              for (let k = 0; k < n; k++) {
                const t = k / (n - 1);
                // Zero at both ends so the joints with neighbouring edges stay put.
                const bow = Math.sin(Math.PI * t) * Math.min(7, len * 0.06);
                if (inx) pts[k * 2] = (inx > 0 ? 0 : W) + inx * (bow + Math.abs(pts[k * 2] - (inx > 0 ? 0 : W)));
                else pts[k * 2 + 1] = (iny > 0 ? 0 : H) + iny * (bow + Math.abs(pts[k * 2 + 1] - (iny > 0 ? 0 : H)));
              }
            }
            this.wobbleCache.set(key, pts);
          }
          e = {
            key, pts, regions: [], frame, kind: 'unknown',
            mx: (p0[0] + p1[0]) / 2, my: (p0[1] + p1[1]) / 2, len: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
          };
          // Use the true (wobbled) midpoint so links cross the drawn border.
          const mid = Math.floor(e.pts.length / 4) * 2;
          e.mx = e.pts[mid]; e.my = e.pts[mid + 1];
          edges.set(key, e);
        }
        e.regions.push(idx);
        p.edges.push({ e, rev: !fwd });
      }
      // Outline: concatenate wobbled edges, skipping the duplicated joint.
      for (const { e, rev } of p.edges) {
        const n = e.pts.length / 2;
        for (let k = 0; k < n - 1; k++) {
          const i = (rev ? n - 1 - k : k) * 2;
          p.outline.push(e.pts[i], e.pts[i + 1]);
        }
      }
      for (let i = 0; i < p.outline.length; i += 2) {
        const x = p.outline[i], y = p.outline[i + 1];
        if (i === 0) p.path.moveTo(x, y); else p.path.lineTo(x, y);
        if (x < p.bbox[0]) p.bbox[0] = x;
        if (y < p.bbox[1]) p.bbox[1] = y;
        if (x > p.bbox[2]) p.bbox[2] = x;
        if (y > p.bbox[3]) p.bbox[3] = y;
      }
      p.path.closePath();
      preps.push(p);
    });

    this.preps = preps;
    this.byId = new Map(preps.map((p) => [p.r.id, p]));

    // Classify edges. Coast only when we can be sure; otherwise an edge of knowledge.
    for (const p of preps) {
      const allLandKnown = p.r.neighbors.every((n) => n.kind === 'sea' || present.has(n.region));
      for (const { e } of p.edges) {
        if (e.regions.length >= 2) e.kind = 'internal';
        else if (e.frame) e.kind = 'coast';
        else e.kind = p.r.coastal && allLandKnown ? 'coast' : 'unknown';
      }
    }

    // Combined line work.
    this.coastPath = new Path2D();
    this.unknownPath = new Path2D();
    this.internalPath = new Path2D();
    this.politicalPath = new Path2D();
    this.ripple1 = new Path2D();
    this.ripple2 = new Path2D();
    for (const e of edges.values()) {
      if (e.kind === 'coast') tracePolyline(this.coastPath, e.pts, false, true);
      else if (e.kind === 'unknown') tracePolyline(this.unknownPath, e.pts, false, true);
      else {
        tracePolyline(this.internalPath, e.pts, false, true);
        const a = preps[e.regions[0]].r, b = preps[e.regions[1]].r;
        if (a.owner !== b.owner) tracePolyline(this.politicalPath, e.pts, false, true);
      }
    }
    // Per-region: edges facing a different owner (for the inner coloured border) and coast ripples.
    for (const p of preps) {
      if (p.r.owner != null || p.r.controller != null) {
        const path = new Path2D();
        let any = false;
        for (const { e, rev } of p.edges) {
          let other: RegionView | null = null;
          if (e.regions.length >= 2) other = preps[e.regions[0] === p.idx ? e.regions[1] : e.regions[0]].r;
          // Colour the border only where we know what lies beyond: another owner, or the sea.
          if (e.kind === 'coast' || (other && other.owner !== p.r.owner)) {
            tracePolyline(path, e.pts, rev, true);
            any = true;
          }
        }
        p.ownerEdges = any ? path : null;
      }
      {
        const path = new Path2D();
        let any = false;
        for (const { e, rev } of p.edges) {
          if (e.kind === 'unknown') {
            tracePolyline(path, e.pts, rev, true);
            any = true;
          }
        }
        p.unknownEdges = any ? path : null;
      }
      const n = p.edges.length;
      for (let i = 0; i < n; i++) {
        const { e, rev } = p.edges[i];
        if (e.kind !== 'coast') continue;
        const np = e.pts.length / 2;
        const ax = e.pts[rev ? (np - 1) * 2 : 0], ay = e.pts[rev ? (np - 1) * 2 + 1 : 1];
        const bx = e.pts[rev ? 0 : (np - 1) * 2], by = e.pts[rev ? 1 : (np - 1) * 2 + 1];
        const l = Math.hypot(bx - ax, by - ay) || 1;
        // Outward normal depends on polygon winding.
        let nx = (by - ay) / l, ny = -(bx - ax) / l;
        if (p.ccw) { nx = -nx; ny = -ny; }
        for (const [path, dist] of [[this.ripple1, 6.5], [this.ripple2, 14]] as [Path2D, number][]) {
          for (let k = 0; k < np; k++) {
            const j = (rev ? np - 1 - k : k) * 2;
            const x = e.pts[j] + nx * dist, y = e.pts[j + 1] + ny * dist;
            if (k === 0) path.moveTo(x, y); else path.lineTo(x, y);
          }
          // Round the corner into the next coast edge of the same region.
          const nxt = p.edges[(i + 1) % n];
          if (nxt.e.kind === 'coast') {
            const mp = nxt.e.pts.length / 2;
            const cx2 = nxt.e.pts[nxt.rev ? 0 : (mp - 1) * 2], cy2 = nxt.e.pts[nxt.rev ? 1 : (mp - 1) * 2 + 1];
            const l2 = Math.hypot(cx2 - bx, cy2 - by) || 1;
            let mx = (cy2 - by) / l2, my = -(cx2 - bx) / l2;
            if (p.ccw) { mx = -mx; my = -my; }
            const cross = nx * my - ny * mx;
            const convex = p.ccw ? cross < 0 : cross > 0;
            if (convex) {
              const a0 = Math.atan2(ny, nx), a1 = Math.atan2(my, mx);
              path.arc(bx, by, dist, a0, a1, p.ccw);
            }
          }
        }
      }
    }

    // Glyphs, field patches, facility pictograms.
    for (const p of preps) {
      const r = p.r;
      const gkey = `${r.id}:${r.terrain}:${r.center[0]},${r.center[1]}:${r.poly.length}:${r.poly[0]?.[0]},${r.poly[0]?.[1]}`;
      let glyphs = this.glyphCache.get(gkey);
      if (!glyphs) {
        glyphs = this.makeGlyphs(p);
        this.glyphCache.set(gkey, glyphs);
      }
      p.glyphs = glyphs;
      p.fields = [];
      p.icons = [];
      if (r.own) {
        const fields = r.own.facilities.find((f) => f.kind === 'fields' && f.level > 0);
        if (fields) p.fields = this.makeFields(p, fields.level);
        const set = new Set<FacilityIcon>();
        for (const f of r.own.facilities) {
          if (f.level <= 0) continue;
          const ic = d.facilityIcons[f.kind];
          if (ic) set.add(ic);
        }
        p.icons = ICON_ORDER.filter((i) => set.has(i));
      }
    }

    // Links: rivers through centres, sea routes as arcs, passes as notches.
    this.rivers = [];
    this.riverPath = new Path2D();
    this.seaLinks = [];
    this.passes = [];
    const seen = new Set<string>();
    const sharedEdge = (a: Prep, b: Prep): Edge | null => {
      let best: Edge | null = null;
      for (const { e } of a.edges) {
        if (e.regions.length >= 2 && e.regions.includes(b.idx) && (!best || e.len > best.len)) best = e;
      }
      return best;
    };
    const coastPoint = (p: Prep, tx: number, ty: number): [number, number] | null => {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (const { e } of p.edges) {
        if (e.kind !== 'coast') continue;
        const dd = Math.hypot(e.mx - tx, e.my - ty) + (e.frame ? 400 : 0);
        if (dd < bd) { bd = dd; best = [e.mx, e.my]; }
      }
      return best;
    };
    for (const p of preps) {
      let riverLinks = 0;
      let lowest = true;
      for (const n of p.r.neighbors) {
        const q = this.byId.get(n.region);
        if (n.kind === 'river') {
          riverLinks++;
          if (q && q.r.elevation < p.r.elevation) lowest = false;
          if (!q) lowest = false;
        }
        if (!q) continue;
        const key = p.r.id < q.r.id ? `${p.r.id}-${q.r.id}-${n.kind}` : `${q.r.id}-${p.r.id}-${n.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = p.r.id < q.r.id ? p : q, b = p.r.id < q.r.id ? q : p;
        if (n.kind === 'river') {
          const e = sharedEdge(a, b);
          const mx = e ? e.mx : (a.cx + b.cx) / 2, my = e ? e.my : (a.cy + b.cy) / 2;
          const s1 = hash32(a.r.id * 131 + 7, b.r.id);
          const pts = wobble(a.cx, a.cy, mx, my, s1, 0.13);
          const pts2 = wobble(mx, my, b.cx, b.cy, s1 ^ 0x5bd1e995, 0.13);
          const all = pts.concat(pts2.slice(2));
          this.rivers.push({ a: a.r.id, b: b.r.id, pts: all });
        } else if (n.kind === 'sea') {
          const pa = coastPoint(a, b.cx, b.cy) ?? [a.cx, a.cy];
          const pb = coastPoint(b, a.cx, a.cy) ?? [b.cx, b.cy];
          const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
          const l = Math.hypot(dx, dy) || 1;
          const sign = hash32(a.r.id, b.r.id) & 1 ? 1 : -1;
          const bulge = clamp(l * 0.22, 14, 90) * sign;
          this.seaLinks.push({
            ax: pa[0], ay: pa[1], bx: pb[0], by: pb[1],
            cx: (pa[0] + pb[0]) / 2 + (-dy / l) * bulge, cy: (pa[1] + pb[1]) / 2 + (dx / l) * bulge,
          });
        } else if (n.kind === 'pass') {
          const e = sharedEdge(a, b);
          if (e) {
            const dx = b.cx - a.cx, dy = b.cy - a.cy;
            const l = Math.hypot(dx, dy) || 1;
            this.passes.push({ x: e.mx, y: e.my, ux: dx / l, uy: dy / l });
          }
        }
      }
      // River mouth: the lowest reach of a river in a region whose shore we know.
      if (p.r.river && riverLinks >= 1 && lowest) {
        let mouth: Edge | null = null;
        for (const { e } of p.edges) {
          if (e.kind === 'coast' && !e.frame && (!mouth || e.len > mouth.len)) mouth = e;
        }
        if (!mouth) for (const { e } of p.edges) if (e.kind === 'coast' && (!mouth || e.len > mouth.len)) mouth = e;
        if (mouth) {
          const pts = wobble(p.cx, p.cy, mouth.mx, mouth.my, hash32(p.r.id, 991), 0.13);
          this.rivers.push({ a: p.r.id, b: -1, pts });
        }
      }
    }
    for (const rv of this.rivers) {
      // Smooth the inked line through segment midpoints.
      const pts = rv.pts;
      this.riverPath.moveTo(pts[0], pts[1]);
      for (let i = 2; i + 3 < pts.length; i += 2) {
        const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2;
        this.riverPath.quadraticCurveTo(pts[i], pts[i + 1], mx, my);
      }
      this.riverPath.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
    }
  }

  private makeGlyphs(p: Prep): Glyph[] {
    const r = p.r;
    const sp = GLYPH_SPACING[r.terrain];
    const rand = rng(hash32(r.id * 7919 + 13, 0x51ed));
    const out: Glyph[] = [];
    const margin = r.terrain === 'mountains' ? 13 : 9;
    const [x0, y0, x1, y1] = p.bbox;
    let row = 0;
    for (let y = y0 + sp * 0.5; y < y1; y += sp * 0.82, row++) {
      for (let x = x0 + (row % 2 ? sp * 0.5 : 0); x < x1; x += sp) {
        const gx = x + (rand() - 0.5) * sp * 0.7;
        const gy = y + (rand() - 0.5) * sp * 0.6;
        const v = rand();
        const rank = rand();
        // Keep the centre clear for the settlement, label and pictograms.
        const dx = gx - p.cx, dy = gy - p.cy;
        if (Math.abs(dx) < 36 && dy > -20 && dy < 30) continue;
        if (!pointInPoly(p.outline, gx, gy)) continue;
        if (distToPolyEdge(r.poly, gx, gy) < margin) continue;
        out.push({ x: gx, y: gy, v, rank });
      }
    }
    out.sort((a, b) => a.y - b.y);
    return out;
  }

  private makeFields(p: Prep, level: number): FieldPatch[] {
    const want = clamp(Math.ceil(level / 3), 1, 4);
    const rand = rng(hash32(p.r.id * 31 + 5, 0xf1e1d));
    const out: FieldPatch[] = [];
    for (let tries = 0; tries < 40 && out.length < want; tries++) {
      const ang = rand() * Math.PI * 2;
      const dist = 30 + rand() * 26;
      const x = p.cx + Math.cos(ang) * dist * 1.25;
      const y = p.cy + Math.sin(ang) * dist * 0.8 - 6;
      const w = 17 + rand() * 7, h = 10 + rand() * 4;
      if (Math.abs(x - p.cx) < 30 && y - p.cy > -12 && y - p.cy < 28) continue;
      const corners = [[x - w / 2 - 3, y - h / 2], [x + w / 2 + 3, y - h / 2], [x + w / 2 + 3, y + h / 2], [x - w / 2 - 3, y + h / 2]];
      if (!corners.every((c) => pointInPoly(p.outline, c[0], c[1]) && distToPolyEdge(p.r.poly, c[0], c[1]) > 4)) continue;
      if (out.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 3 && Math.abs(o.y - y) < (o.h + h) / 2 + 3)) continue;
      out.push({ x, y, w, h, skew: (rand() - 0.5) * 6, alt: rand() > 0.5 });
    }
    return out;
  }

  // --- drawing -----------------------------------------------------------------------

  private colorOf(seat: number | null): string {
    if (seat == null) return UNKNOWN_OWNER;
    return this.data?.seatColors[seat] ?? UNKNOWN_OWNER;
  }

  private ensureGrain(): CanvasPattern | null {
    if (this.grain) return this.grain;
    const size = 240;
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(size * this.dpr);
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(this.dpr, this.dpr);
    const rand = rng(0xa71a5);
    for (let i = 0; i < 2600; i++) {
      const x = rand() * size, y = rand() * size;
      const dark = rand() > 0.42;
      g.fillStyle = dark ? `rgba(80,60,30,${0.025 + rand() * 0.045})` : `rgba(255,252,240,${0.05 + rand() * 0.08})`;
      const s = 0.5 + rand() * 1.1;
      g.fillRect(x, y, s, s);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = rand() * size, y = rand() * size;
      const a = rand() * Math.PI;
      const l = 5 + rand() * 13;
      g.strokeStyle = `rgba(90,70,40,${0.025 + rand() * 0.035})`;
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rand() - 0.5) * 3, y + Math.sin(a) * l * 0.5 + (rand() - 0.5) * 3, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    this.grain = this.ctx.createPattern(c, 'repeat');
    if (this.grain && 'setTransform' in this.grain) {
      this.grain.setTransform(new DOMMatrix().scale(1 / this.dpr, 1 / this.dpr));
    }
    return this.grain;
  }

  private toWorld(): void {
    const k = this.dpr * this.scale;
    this.ctx.setTransform(k, 0, 0, k, this.dpr * this.tx, this.dpr * this.ty);
  }
  private toScreen(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private draw(): void {
    if (this.destroyed) return;
    const t0 = performance.now();
    const ctx = this.ctx;
    const d = this.data;
    const W = this.w, H = this.h;
    this.toScreen();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    if (!d || !W || !H) {
      this.lastDrawMs = performance.now() - t0;
      return;
    }
    const s = this.scale;
    const px = 1 / s; // one CSS pixel in world units
    const mode = this.overlay.mode;
    const vx0 = -this.tx / s, vy0 = -this.ty / s, vx1 = (W - this.tx) / s, vy1 = (H - this.ty) / s;
    const visible = this.preps.filter((p) => !(p.bbox[2] < vx0 - 40 || p.bbox[0] > vx1 + 40 || p.bbox[3] < vy0 - 40 || p.bbox[1] > vy1 + 40));

    // 1. Sheet furniture: faint graticule and a neatline around the world frame.
    this.toWorld();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = alpha(INK_3, 0.11);
    ctx.lineWidth = 0.6 * px;
    ctx.beginPath();
    for (let x = 200; x < d.world.width; x += 200) { ctx.moveTo(x, -16); ctx.lineTo(x, d.world.height + 16); }
    for (let y = 200; y < d.world.height; y += 200) { ctx.moveTo(-16, y); ctx.lineTo(d.world.width + 16, y); }
    ctx.stroke();
    ctx.strokeStyle = alpha(INK_2, 0.5);
    ctx.lineWidth = 1.1 * px;
    ctx.strokeRect(-16, -16, d.world.width + 32, d.world.height + 32);
    ctx.strokeStyle = alpha(INK_2, 0.28);
    ctx.lineWidth = 0.6 * px;
    ctx.strokeRect(-22, -22, d.world.width + 44, d.world.height + 44);

    // 2. Coastal wash outside the known shore (land is painted over the inner half).
    for (const [wd, a] of [[66, 0.07], [42, 0.09], [22, 0.11]] as [number, number][]) {
      ctx.strokeStyle = alpha(SEA, a);
      ctx.lineWidth = wd;
      ctx.stroke(this.coastPath);
    }
    ctx.strokeStyle = alpha(RIVER, 0.3);
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(this.ripple1);
    ctx.strokeStyle = alpha(RIVER, 0.16);
    ctx.lineWidth = 0.7 * px;
    ctx.stroke(this.ripple2);

    // 3. Land.
    for (const p of visible) this.drawRegionBase(p, mode, px);

    // 5. Paper grain over paper and tints alike.
    this.toScreen();
    const grain = this.ensureGrain();
    if (grain) {
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, W, H);
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(120,90,40,0)');
    vg.addColorStop(1, 'rgba(120,90,40,0.13)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // 6. Terrain glyphs and tended fields.
    this.toWorld();
    if (mode !== 'population') {
      const gAlpha = mode === 'terrain' ? 1 : mode === 'political' ? 0.62 : 0.34;
      for (const p of visible) this.drawGlyphs(p, px, gAlpha);
    }

    // 7. Line work.
    ctx.setLineDash([]);
    ctx.strokeStyle = alpha(INK_2, mode === 'terrain' ? 0.3 : 0.4);
    ctx.lineWidth = 0.75 * px;
    ctx.stroke(this.internalPath);
    if (mode !== 'terrain') {
      ctx.strokeStyle = alpha(INK, 0.5);
      ctx.lineWidth = 1.1 * px;
      ctx.setLineDash([5 * px, 2.2 * px, 1.2 * px, 2.2 * px]);
      ctx.stroke(this.politicalPath);
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = alpha(INK_3, 0.75);
    ctx.lineWidth = 1.1 * px;
    ctx.setLineDash([0.1 * px, 4.2 * px]);
    ctx.stroke(this.unknownPath);
    ctx.setLineDash([]);
    ctx.strokeStyle = alpha(INK, 0.9);
    ctx.lineWidth = clamp(1.7 * Math.sqrt(s), 1.2, 2.6) * px;
    ctx.stroke(this.coastPath);

    // Rivers.
    const rw = clamp(2.4 * Math.sqrt(s), 1.6, 4.2) * px;
    ctx.strokeStyle = alpha('#f4f7f4', 0.55);
    ctx.lineWidth = rw + 1.6 * px;
    ctx.stroke(this.riverPath);
    ctx.strokeStyle = RIVER;
    ctx.lineWidth = rw;
    ctx.stroke(this.riverPath);

    // Sea routes.
    if (this.seaLinks.length) {
      ctx.strokeStyle = alpha('#2f5d6e', 0.5);
      ctx.lineWidth = 1.1 * px;
      ctx.setLineDash([5 * px, 4.5 * px]);
      ctx.beginPath();
      for (const l of this.seaLinks) {
        ctx.moveTo(l.ax, l.ay);
        ctx.quadraticCurveTo(l.cx, l.cy, l.bx, l.by);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = alpha('#2f5d6e', 0.75);
      for (const l of this.seaLinks) {
        for (const [x, y] of [[l.ax, l.ay], [l.bx, l.by]]) {
          ctx.beginPath();
          ctx.arc(x, y, 2.2 * px, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Passes: a short notched line crossing the border.
    if (this.passes.length) {
      const L = clamp(11 * px, 7, 22);
      const N = L * 0.42;
      ctx.lineWidth = 1.5 * px;
      for (const ps of this.passes) {
        const nx = -ps.uy, ny = ps.ux;
        ctx.strokeStyle = alpha(PAPER_LIGHT, 0.9);
        ctx.lineWidth = 3.6 * px;
        ctx.beginPath();
        ctx.moveTo(ps.x - ps.ux * L, ps.y - ps.uy * L);
        ctx.lineTo(ps.x + ps.ux * L, ps.y + ps.uy * L);
        ctx.stroke();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4 * px;
        ctx.beginPath();
        ctx.moveTo(ps.x - ps.ux * L, ps.y - ps.uy * L);
        ctx.lineTo(ps.x + ps.ux * L, ps.y + ps.uy * L);
        for (const t of [-0.62, 0, 0.62]) {
          const cx = ps.x + ps.ux * L * t, cy = ps.y + ps.uy * L * t;
          ctx.moveTo(cx - nx * N, cy - ny * N);
          ctx.lineTo(cx + nx * N, cy + ny * N);
        }
        ctx.stroke();
      }
    }

    // 8. Pick mode, hover and selection.
    const ov = this.overlay;
    if (ov.targets !== undefined) {
      const tset = ov.targets ? new Set(ov.targets) : null;
      for (const p of visible) {
        const ok = !tset || tset.has(p.r.id);
        if (!ok) {
          ctx.fillStyle = alpha(PAPER, 0.42);
          ctx.fill(p.path);
        }
      }
      if (tset) {
        ctx.setLineDash([6 * px, 3.5 * px]);
        ctx.lineWidth = 2.2 * px;
        ctx.strokeStyle = ACCENT;
        for (const p of visible) {
          if (!tset.has(p.r.id)) continue;
          ctx.fillStyle = alpha(ACCENT, 0.08);
          ctx.fill(p.path);
          ctx.stroke(p.path);
        }
        ctx.setLineDash([]);
      }
    }
    const hov = ov.hovered != null ? this.byId.get(ov.hovered) : undefined;
    if (hov && ov.hovered !== ov.selected) {
      ctx.fillStyle = alpha('#fffbea', 0.2);
      ctx.fill(hov.path);
      ctx.strokeStyle = alpha(INK, 0.75);
      ctx.lineWidth = 1.6 * px;
      ctx.stroke(hov.path);
    }
    const sel = ov.selected != null ? this.byId.get(ov.selected) : undefined;
    if (sel) {
      ctx.strokeStyle = alpha(PAPER_LIGHT, 0.95);
      ctx.lineWidth = 5.6 * px;
      ctx.stroke(sel.path);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.4 * px;
      ctx.stroke(sel.path);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.2 * px;
      ctx.stroke(sel.path);
    }

    // 9. Symbols and lettering in screen space.
    this.toScreen();
    this.drawSymbols(visible, mode);

    this.lastDrawMs = performance.now() - t0;
  }

  private drawRegionBase(p: Prep, mode: MapMode, px: number): void {
    const ctx = this.ctx;
    const r = p.r;
    const remembered = r.visibility === 'remembered';
    const tint = TINT[r.terrain];
    let base: string;
    if (mode === 'terrain') base = tint;
    else if (mode === 'political') base = mix(LAND_BASE, tint, 0.55);
    else base = mix(LAND_BASE, tint, 0.22);
    if (remembered) base = mix(base, GREY_PAPER, 0.72);
    ctx.fillStyle = base;
    ctx.fill(p.path);
    // Seal hairline gaps between neighbours.
    ctx.strokeStyle = base;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(p.path);

    const owner = r.owner;
    const ownerCol = owner != null ? this.colorOf(owner) : null;
    const occupied = r.controller != null && r.controller !== r.owner;

    ctx.save();
    ctx.clip(p.path);

    // Watercolour pooling toward the edge.
    if (!remembered) {
      const dark = mix(base, '#6b5a3a', 0.5);
      ctx.strokeStyle = dark;
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 20;
      ctx.stroke(p.path);
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 8;
      ctx.stroke(p.path);
      ctx.globalAlpha = 1;
    }

    if (mode === 'population') {
      let people: number | null = null;
      let estimate = false;
      if (r.own) people = r.own.population;
      else if (r.foreign) { people = (r.foreign.population_low + r.foreign.population_high) / 2; estimate = true; }
      if (people != null && people > 0) {
        ctx.fillStyle = POP_RAMP[popClass(people)];
        ctx.globalAlpha = remembered ? 0.5 : 0.9;
        ctx.fill(p.path);
        ctx.globalAlpha = 1;
        if (estimate) {
          this.hatch(p, px, 7, 1, alpha(PAPER_LIGHT, 0.55), 1.4);
          ctx.strokeStyle = alpha(INK, 0.8);
          ctx.lineWidth = 2.6 * px;
          ctx.setLineDash([0.1 * px, 4 * px]);
          ctx.stroke(p.path);
          ctx.setLineDash([]);
        }
      }
    } else if (mode === 'resources') {
      if (!r.survey) this.hatch(p, px, 6, 1, alpha(INK_3, 0.2), 0.8);
      else if (!r.survey.detailed) this.hatch(p, px, 12, 1, alpha(INK_3, 0.12), 0.8);
    }

    if (ownerCol && mode !== 'population') {
      const wash = mode === 'political' ? (remembered ? 0.1 : 0.24) : remembered ? 0.04 : 0.07;
      ctx.fillStyle = alpha(ownerCol, wash);
      ctx.fill(p.path);
    }
    if (remembered) this.hatch(p, px, 7, -1, alpha(INK_2, 0.17), 0.8);
    if (occupied) this.hatch(p, px, 9, 1, alpha(this.colorOf(r.controller), 0.7), 2.4);

    // Inner coloured border along edges that face another owner.
    if (ownerCol && p.ownerEdges) {
      const strong = mode === 'political';
      const k = remembered ? 0.6 : 1;
      if (strong && !remembered) {
        ctx.strokeStyle = alpha(ownerCol, 0.2 * k);
        ctx.lineWidth = 2 * clamp(11 * px, 7, 20);
        ctx.stroke(p.ownerEdges);
      }
      ctx.strokeStyle = alpha(ownerCol, (strong ? 0.72 : 0.6) * k);
      ctx.lineWidth = 2 * (strong ? clamp(4.2 * px, 3, 8) : clamp(2.4 * px, 1.6, 5));
      ctx.stroke(p.ownerEdges);
    }
    // Land fades into paper where knowledge ends (kept inside this region's own outline).
    if (p.unknownEdges) {
      for (const [wd, a] of [[50, 0.3], [30, 0.36], [14, 0.42]] as [number, number][]) {
        ctx.strokeStyle = alpha(PAPER, a);
        ctx.lineWidth = wd;
        ctx.stroke(p.unknownEdges);
      }
    }
    ctx.restore();
  }

  /** Diagonal hatching across a region; assumes the region clip is active. */
  private hatch(p: Prep, px: number, spacingPx: number, dir: 1 | -1, color: string, widthPx: number): void {
    const ctx = this.ctx;
    const sp = clamp(spacingPx * px, 3.2, 30);
    const [x0, y0, x1, y1] = p.bbox;
    const h = y1 - y0;
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx * px;
    ctx.beginPath();
    // Anchor to world coordinates so the pattern does not swim between regions.
    const start = Math.floor((x0 - h) / sp) * sp;
    for (let x = start; x < x1 + h; x += sp) {
      if (dir > 0) { ctx.moveTo(x, y1); ctx.lineTo(x + h, y0); }
      else { ctx.moveTo(x, y0); ctx.lineTo(x + h, y1); }
    }
    ctx.stroke();
  }

  private drawGlyphs(p: Prep, px: number, modeAlpha: number): void {
    const ctx = this.ctx;
    const r = p.r;
    const remembered = r.visibility === 'remembered';
    const s = this.scale;
    // Grow glyphs a little when zoomed out and thin them so density on screen stays calm.
    const grow = clamp(0.85 / s, 1, 1.9);
    const keep = clamp(1 / (grow * grow) + 0.08, 0.2, 1);
    const ink = remembered ? INK_3 : INK_2;
    const a = modeAlpha * (remembered ? 0.5 : 1);
    ctx.globalAlpha = a;
    ctx.lineWidth = clamp(0.9 * px, 0.45, 1.4);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const t = r.terrain;

    // Tended fields first (they sit on the ground).
    if (p.fields.length) {
      for (const f of p.fields) {
        const x0 = f.x - f.w / 2, y0 = f.y - f.h / 2;
        ctx.beginPath();
        ctx.moveTo(x0 + f.skew, y0);
        ctx.lineTo(x0 + f.w + f.skew, y0);
        ctx.lineTo(x0 + f.w, y0 + f.h);
        ctx.lineTo(x0, y0 + f.h);
        ctx.closePath();
        ctx.fillStyle = f.alt ? '#d6c56f' : '#bfcb7c';
        ctx.fill();
        ctx.strokeStyle = alpha('#6a5a2c', 0.85);
        ctx.stroke();
        ctx.beginPath();
        const rows = 4;
        for (let i = 1; i < rows; i++) {
          const yy = y0 + (f.h * i) / rows;
          const sk = f.skew * (1 - i / rows);
          ctx.moveTo(x0 + sk + 1, yy);
          ctx.lineTo(x0 + f.w + sk - 1, yy);
        }
        ctx.strokeStyle = alpha('#6a5a2c', 0.6);
        ctx.stroke();
      }
    }

    for (const g of p.glyphs) {
      if (g.rank > keep) continue;
      const x = g.x, y = g.y;
      switch (t) {
        case 'forest': {
          const u = 4.6 * grow;
          const n = g.v < 0.3 ? 2 : 3;
          const offs = n === 3 ? [[0, -0.85], [-0.95, 0.1], [0.9, 0.2]] : [[-0.6, 0], [0.7, 0.1]];
          for (const o of offs) {
            const tx2 = x + o[0] * u, ty2 = y + o[1] * u;
            ctx.strokeStyle = alpha(ink, 0.8);
            ctx.beginPath();
            ctx.moveTo(tx2, ty2 + u * 0.55);
            ctx.lineTo(tx2, ty2 + u * 1.1);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(tx2, ty2, u * 0.82, 0, Math.PI * 2);
            ctx.fillStyle = remembered ? '#b9bfa8' : g.v > 0.6 ? '#86ab6c' : '#93b578';
            ctx.fill();
            ctx.strokeStyle = alpha(ink, 0.75);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(tx2, ty2, u * 0.45, 0.15, 1.5);
            ctx.strokeStyle = alpha(ink, 0.45);
            ctx.stroke();
          }
          break;
        }
        case 'mountains': {
          const u = (9 + g.v * 5) * grow;
          const ax = x + (g.v - 0.5) * u * 0.5, ay = y - u * 0.95;
          if (g.v > 0.3 && g.v < 0.62) {
            // A lower shoulder behind the main peak.
            const side = g.v > 0.5 ? -1 : 1;
            const bx = x + side * u * 0.85, by = y - u * 0.35;
            ctx.beginPath();
            ctx.moveTo(bx - u * 0.65, y + u * 0.45);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + u * 0.65, y + u * 0.45);
            ctx.closePath();
            ctx.fillStyle = remembered ? '#d4cfc2' : '#d3c8b3';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(bx - u * 0.65, y + u * 0.45);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + u * 0.65, y + u * 0.45);
            ctx.strokeStyle = alpha(ink, 0.7);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(x - u, y + u * 0.45);
          ctx.lineTo(ax, ay);
          ctx.lineTo(x + u * 1.05, y + u * 0.45);
          ctx.closePath();
          ctx.fillStyle = remembered ? '#dfdacd' : '#ebe4d3';
          ctx.fill();
          // Shaded eastern face.
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(x + u * 1.05, y + u * 0.45);
          ctx.lineTo(x + u * 0.22, y + u * 0.45);
          ctx.lineTo(x + u * 0.02, y - u * 0.1);
          ctx.closePath();
          ctx.fillStyle = remembered ? '#c4bfb2' : '#b3a68f';
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x - u, y + u * 0.45);
          ctx.lineTo(ax, ay);
          ctx.lineTo(x + u * 1.05, y + u * 0.45);
          ctx.strokeStyle = alpha(ink, 0.9);
          ctx.stroke();
          if (g.v > 0.45) {
            // Snow cap.
            ctx.beginPath();
            ctx.moveTo(ax - u * 0.3, ay + u * 0.42);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + u * 0.32, ay + u * 0.42);
            ctx.lineTo(ax + u * 0.1, ay + u * 0.3);
            ctx.lineTo(ax - u * 0.08, ay + u * 0.46);
            ctx.closePath();
            ctx.fillStyle = '#fbfaf5';
            ctx.fill();
            ctx.strokeStyle = alpha(ink, 0.5);
            ctx.stroke();
          }
          break;
        }
        case 'hills': {
          const u = (6.5 + g.v * 2.5) * grow;
          ctx.beginPath();
          ctx.moveTo(x - u * 1.2, y + u * 0.3);
          ctx.quadraticCurveTo(x - u * 0.2, y - u * 1.0, x + u * 1.2, y + u * 0.3);
          ctx.fillStyle = remembered ? alpha('#d6d0c0', 0.7) : alpha('#cdb980', 0.7);
          ctx.fill();
          ctx.strokeStyle = alpha(ink, 0.85);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + u * 0.35, y - u * 0.18);
          ctx.lineTo(x + u * 0.6, y + u * 0.22);
          ctx.moveTo(x + u * 0.05, y - u * 0.22);
          ctx.lineTo(x + u * 0.22, y + u * 0.2);
          ctx.strokeStyle = alpha(ink, 0.45);
          ctx.stroke();
          break;
        }
        case 'marsh': {
          const u = 4.6 * grow;
          ctx.strokeStyle = alpha(remembered ? INK_3 : '#3f7068', 0.85);
          ctx.beginPath();
          ctx.moveTo(x - u * 1.3, y);
          ctx.lineTo(x + u * 1.3, y);
          ctx.moveTo(x - u * 0.6, y + u * 0.55);
          ctx.lineTo(x + u * 0.9, y + u * 0.55);
          ctx.moveTo(x - u * 0.55, y - u * 0.15);
          ctx.lineTo(x - u * 0.7, y - u * 1.05);
          ctx.moveTo(x, y - u * 0.15);
          ctx.lineTo(x, y - u * 1.4);
          ctx.moveTo(x + u * 0.55, y - u * 0.15);
          ctx.lineTo(x + u * 0.75, y - u * 1.0);
          ctx.stroke();
          break;
        }
        case 'desert': {
          const u = (7 + g.v * 3) * grow;
          ctx.strokeStyle = alpha(remembered ? INK_3 : '#8f6c3a', 0.8);
          ctx.beginPath();
          ctx.moveTo(x - u * 1.2, y + u * 0.2);
          ctx.quadraticCurveTo(x - u * 0.3, y - u * 0.75, x + u * 0.5, y - u * 0.05);
          ctx.quadraticCurveTo(x + u * 0.85, y + u * 0.2, x + u * 1.3, y + u * 0.15);
          ctx.moveTo(x - u * 0.15, y - u * 0.38);
          ctx.quadraticCurveTo(x + u * 0.1, y, x - u * 0.1, y + u * 0.3);
          ctx.stroke();
          ctx.fillStyle = alpha(remembered ? INK_3 : '#8f6c3a', 0.7);
          for (const o of [[-0.8, 0.7], [0.3, 0.75], [0.95, 0.6]]) {
            ctx.beginPath();
            ctx.arc(x + o[0] * u, y + o[1] * u, 0.55 * grow, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'steppe': {
          const u = 4.2 * grow;
          ctx.strokeStyle = alpha(remembered ? INK_3 : '#6f6c30', 0.8);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - u * 0.6, y - u);
          ctx.moveTo(x, y);
          ctx.lineTo(x, y - u * 1.2);
          ctx.moveTo(x, y);
          ctx.lineTo(x + u * 0.6, y - u);
          ctx.stroke();
          break;
        }
        case 'tundra': {
          const u = 4.4 * grow;
          ctx.fillStyle = '#fcfcf8';
          ctx.strokeStyle = alpha(remembered ? INK_3 : '#7d8e96', 0.7);
          ctx.beginPath();
          ctx.ellipse(x, y, u * 1.1, u * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x, y, u * 1.1, u * 0.5, 0, 0.2, Math.PI - 0.2);
          ctx.stroke();
          ctx.fillStyle = alpha(remembered ? INK_3 : '#7d8e96', 0.8);
          for (const o of [[-1.5, -0.8], [1.4, -0.6], [0.3, -1.2], [-0.4, 1.1]]) {
            ctx.beginPath();
            ctx.arc(x + o[0] * u, y + o[1] * u, 0.6 * grow, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'plains': {
          const u = 3.4 * grow;
          ctx.strokeStyle = alpha(remembered ? INK_3 : '#74783a', 0.6);
          ctx.beginPath();
          ctx.moveTo(x - u * 0.3, y);
          ctx.lineTo(x - u * 0.6, y - u);
          ctx.moveTo(x + u * 0.3, y);
          ctx.lineTo(x + u * 0.5, y - u * 0.9);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- screen-space symbols -------------------------------------------------------------

  private drawSymbols(visible: Prep[], mode: MapMode): void {
    const ctx = this.ctx;
    const d = this.data;
    if (!d) return;
    const s = this.scale;
    const k = clamp(Math.pow(s / 0.8, 0.6), 0.72, 1.75);
    const ov = this.overlay;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Rings: revealed test nodes and externally marked regions.
    for (const p of visible) {
      const [x, y] = this.worldToScreen(p.cx, p.cy);
      if (p.r.test_node) {
        const rad = 21 * k;
        ctx.strokeStyle = alpha(PAPER_LIGHT, 0.9);
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x, y - 3 * k, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 3 * k, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(x, y - 3 * k, rad + 4.5, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i + Math.PI / 4;
          ctx.moveTo(x + Math.cos(a) * (rad - 4), y - 3 * k + Math.sin(a) * (rad - 4));
          ctx.lineTo(x + Math.cos(a) * (rad + 8), y - 3 * k + Math.sin(a) * (rad + 8));
        }
        ctx.stroke();
      }
    }
    for (const id of ov.marked) {
      const p = this.byId.get(id);
      if (!p) continue;
      const [x, y] = this.worldToScreen(p.cx, p.cy);
      const rad = 30 * k;
      ctx.strokeStyle = alpha(PAPER_LIGHT, 0.95);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(x, y - 3 * k, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y - 3 * k, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y - 3 * k, rad + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // Army order arrows (under the markers).
    for (const a of d.armies) {
      if (a.target == null || a.target === a.region) continue;
      const from = this.byId.get(a.region), to = this.byId.get(a.target);
      if (!from || !to) continue;
      const [x0, y0] = this.worldToScreen(from.cx, from.cy);
      const [x1, y1] = this.worldToScreen(to.cx, to.cy);
      const attack = a.order === 'attack';
      const col = attack ? '#a23b2c' : this.colorOf(d.mySeat);
      const dx = x1 - x0, dy = y1 - y0;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l, uy = dy / l;
      const sx = x0 + ux * 16 * k, sy = y0 + uy * 16 * k - 14 * k;
      const ex = x1 - ux * 20 * k, ey = y1 - uy * 20 * k - 6 * k;
      const cxm = (sx + ex) / 2 - uy * l * 0.12, cym = (sy + ey) / 2 + ux * l * 0.12;
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass === 0 ? alpha(PAPER_LIGHT, 0.9) : col;
        ctx.lineWidth = pass === 0 ? 5 : 2.2;
        ctx.setLineDash(pass === 1 && !attack ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cxm, cym, ex, ey);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const ang = Math.atan2(ey - cym, ex - cxm);
      ctx.fillStyle = col;
      ctx.strokeStyle = PAPER_LIGHT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(ang) * 7, ey + Math.sin(ang) * 7);
      ctx.lineTo(ex + Math.cos(ang + 2.5) * 7, ey + Math.sin(ang + 2.5) * 7);
      ctx.lineTo(ex + Math.cos(ang - 2.5) * 7, ey + Math.sin(ang - 2.5) * 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Settlements, capital star, pictogram rows.
    const showIcons = s >= 0.5;
    const rows: { p: Prep; x: number; y: number; labelY: number }[] = [];
    for (const p of visible) {
      const [x, y] = this.worldToScreen(p.cx, p.cy);
      const r = p.r;
      const remembered = r.visibility === 'remembered';
      let labelY = y + 9 * k;
      if (r.settlement !== 'wilderness') {
        const roof = remembered ? '#9a9488' : mix(r.owner != null ? this.colorOf(r.owner) : '#a8573a', '#3a2a20', 0.12);
        this.drawSettlement(r.settlement, x, y + 4 * k, k, roof, remembered);
        labelY = y + 4 * k + 12 + 2 * k;
        if (d.capital === r.id) this.drawStar(x, y + 4 * k - this.settlementHeight(r.settlement) * k - 8 * k, 5.2 * k, this.colorOf(d.mySeat));
      }
      rows.push({ p, x, y, labelY });
    }

    // Labels with greedy collision avoidance.
    const labelAlpha = clamp((s - 0.36) / 0.16, 0, 1);
    const placed: [number, number, number, number][] = [];
    const order = rows.slice().sort((a, b) => this.labelPriority(b.p) - this.labelPriority(a.p));
    const labelled = new Set<number>();
    for (const row of order) {
      const r = row.p.r;
      const forced = r.id === ov.selected || r.id === ov.hovered;
      const al = forced ? 1 : labelAlpha * (r.visibility === 'remembered' ? 0.75 : 1);
      if (al <= 0.02) continue;
      const rank = SETTLEMENT_RANK[r.settlement];
      const size = clamp((rank >= 4 ? 13.5 : rank >= 2 ? 12.5 : 11.5) * clamp(k, 0.9, 1.25), 10.5, 17);
      const weight = r.visibility === 'own' || rank >= 3 ? 700 : 600;
      ctx.font = `small-caps ${weight} ${size}px ${SERIF}`;
      this.setLetterSpacing('0.7px');
      const text = r.name;
      const tw = ctx.measureText(text).width;
      const rect: [number, number, number, number] = [row.x - tw / 2 - 3, row.labelY - size * 0.85, row.x + tw / 2 + 3, row.labelY + size * 0.3];
      if (!forced && placed.some((q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1])) continue;
      placed.push(rect);
      labelled.add(r.id);
      ctx.globalAlpha = al;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = alpha(PAPER_LIGHT, 0.92);
      ctx.lineWidth = 3.4;
      ctx.strokeText(text, row.x, row.labelY);
      ctx.fillStyle = r.visibility === 'remembered' ? INK_2 : INK;
      ctx.fillText(text, row.x, row.labelY);
      ctx.globalAlpha = 1;
    }
    this.setLetterSpacing('0px');

    // Pictogram rows under the label.
    for (const row of rows) {
      const r = row.p.r;
      const base = row.labelY + (labelled.has(r.id) ? 12 : -2) * 1;
      if (mode === 'resources') {
        this.drawResources(row.p, row.x, base + 1, k);
      } else if (showIcons && row.p.icons.length) {
        const icons = row.p.icons.slice(0, 6);
        const step = 15 * clamp(k, 0.85, 1.2);
        let ix = row.x - ((icons.length - 1) * step) / 2;
        for (const ic of icons) {
          this.drawFacilityIcon(ic, ix, base + 1, clamp(k, 0.85, 1.2));
          ix += step;
        }
      }
    }

    // Armies: own formations by dominant role, foreign sightings as dotted diamonds.
    const perRegion = new Map<number, number>();
    const slot = (region: number): number => {
      const n = perRegion.get(region) ?? 0;
      perRegion.set(region, n + 1);
      return n;
    };
    for (const a of d.armies) {
      const p = this.byId.get(a.region);
      if (!p) continue;
      const [x, y] = this.worldToScreen(p.cx, p.cy);
      const i = slot(a.region);
      let role: Role = 'assault';
      let best = -1;
      let total = 0;
      for (const [ro, n] of a.soldiers) {
        total += n;
        if (n > best) { best = n; role = ro; }
      }
      const rad = (6.5 + clamp(Math.log10(Math.max(10, total)) - 1, 0, 3) * 0.9) * k;
      this.drawArmy(role, x + (20 + i * 17) * k, y - 17 * k, rad, this.colorOf(d.mySeat), {
        training: a.training_months_left > 0, battle: a.in_battle, lowSupply: a.supply_bp < 5000,
      });
    }
    for (const a of d.foreignArmies) {
      const p = this.byId.get(a.region);
      if (!p) continue;
      const [x, y] = this.worldToScreen(p.cx, p.cy);
      const i = slot(a.region);
      const stale = d.month - a.observed_month > 12;
      this.drawForeignArmy(x + (20 + i * 17) * k, y - 17 * k, 7.5 * k, this.colorOf(a.owner), stale);
    }
  }

  private setLetterSpacing(v: string): void {
    const c = this.ctx as unknown as { letterSpacing?: string };
    if ('letterSpacing' in c) c.letterSpacing = v;
  }

  private labelPriority(p: Prep): number {
    const r = p.r;
    let v = SETTLEMENT_RANK[r.settlement] * 10;
    if (r.id === this.overlay.selected) v += 1000;
    if (r.id === this.overlay.hovered) v += 500;
    if (this.data && r.id === this.data.capital) v += 200;
    if (r.visibility === 'own') v += 60;
    else if (r.visibility === 'visible') v += 20;
    return v - r.id * 0.001;
  }

  private settlementHeight(kind: SettlementKind): number {
    return kind === 'camp' ? 8 : kind === 'village' ? 9 : kind === 'town' ? 17 : kind === 'city' ? 20 : 28;
  }

  private drawSettlement(kind: SettlementKind, x: number, y: number, k: number, roof: string, faded: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineWidth = 1.05 / k;
    ctx.lineJoin = 'round';
    const ink = faded ? INK_3 : INK;
    const wall = faded ? '#ebe6da' : PAPER_LIGHT;
    ctx.strokeStyle = ink;
    const house = (hx: number, hy: number, w: number, h: number, rh: number) => {
      ctx.fillStyle = wall;
      ctx.beginPath();
      ctx.rect(hx, hy - h, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(hx - 1, hy - h);
      ctx.lineTo(hx + w / 2, hy - h - rh);
      ctx.lineTo(hx + w + 1, hy - h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    const block = (bx: number, by: number, w: number, h: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.rect(bx, by - h, w, h);
      ctx.fill();
      ctx.stroke();
    };
    // Soft ground shadow so silhouettes separate from terrain glyphs.
    const halfW = kind === 'camp' ? 11 : kind === 'village' ? 13 : kind === 'town' ? 16 : kind === 'city' ? 21 : 25;
    ctx.fillStyle = alpha(PAPER_LIGHT, 0.6);
    ctx.beginPath();
    ctx.ellipse(0, -this.settlementHeight(kind) * 0.42, halfW + 3, this.settlementHeight(kind) * 0.62 + 3, 0, 0, Math.PI * 2);
    ctx.fill();
    switch (kind) {
      case 'camp': {
        const tent = (tx: number, w: number, h: number) => {
          ctx.fillStyle = wall;
          ctx.beginPath();
          ctx.moveTo(tx - w, 0);
          ctx.lineTo(tx, -h);
          ctx.lineTo(tx + w, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = roof;
          ctx.beginPath();
          ctx.moveTo(tx - w * 0.3, 0);
          ctx.lineTo(tx, -h * 0.55);
          ctx.lineTo(tx + w * 0.3, 0);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(tx - 1.2, -h - 1.6);
          ctx.lineTo(tx, -h);
          ctx.lineTo(tx + 1.2, -h - 1.6);
          ctx.stroke();
        };
        tent(-4.5, 5.5, 8);
        tent(5.5, 4.2, 6);
        break;
      }
      case 'village':
        house(-12, 0, 6.5, 4, 4);
        house(5, 0, 6, 3.8, 3.6);
        house(-4, 0, 7.5, 5, 4.6);
        break;
      case 'town':
        house(-11, -4.5, 6, 4, 3.4);
        house(4.5, -4.5, 6, 4, 3.4);
        block(-2.2, 0, 4.4, 12.5, wall);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.moveTo(-3.2, -12.5);
        ctx.lineTo(0, -17);
        ctx.lineTo(3.2, -12.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        house(-14.5, 0, 7, 4.6, 3.6);
        house(7.5, 0, 7, 4.6, 3.6);
        house(-6.5, 0, 4, 3.6, 2.8);
        house(2.6, 0, 4, 3.6, 2.8);
        break;
      case 'city': {
        house(-14, -5, 6, 3.4, 3.4);
        house(9, -5, 5.5, 3.4, 3.2);
        // Spire.
        block(-7.5, -5, 3.4, 9, wall);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.moveTo(-8.3, -14);
        ctx.lineTo(-5.8, -20);
        ctx.lineTo(-3.3, -14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Domed hall.
        block(-0.5, -5, 8.5, 4, wall);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.arc(3.75, -9, 4.4, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Wall with end towers and a gate.
        block(-17, 0, 34, 5, wall);
        block(-20, 0, 4.4, 8, wall);
        block(15.6, 0, 4.4, 8, wall);
        ctx.beginPath();
        for (let cx = -13; cx <= 13; cx += 4.3) {
          ctx.moveTo(cx, -5);
          ctx.lineTo(cx, -3.4);
        }
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(-1.6, 0);
        ctx.lineTo(-1.6, -2.4);
        ctx.arc(0, -2.4, 1.6, Math.PI, 0);
        ctx.lineTo(1.6, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'metropolis': {
        const towers: [number, number, number][] = [
          [-23, 5, 9], [-17.5, 5, 15], [-12, 5, 11], [6, 5, 14], [11.5, 5, 19], [17.5, 5.5, 9],
        ];
        for (const [tx, w, h] of towers) block(tx, -3, w, h, wall);
        block(-6.5, -3, 6, 22, wall);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.moveTo(-6.5, -25);
        ctx.lineTo(-3.5, -31);
        ctx.lineTo(-0.5, -25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        block(0, -3, 5.5, 16, wall);
        // Roof bands in the owner colour.
        ctx.fillStyle = roof;
        for (const [tx, w, h] of towers) {
          ctx.beginPath();
          ctx.rect(tx, -3 - h, w, 2.2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.rect(0, -19, 5.5, 2.2);
        ctx.fill();
        ctx.stroke();
        // Windows.
        ctx.fillStyle = alpha(ink, 0.55);
        for (const [tx, w, h] of [...towers, [-6.5, 6, 22] as [number, number, number], [0, 5.5, 16] as [number, number, number]]) {
          for (let wy = -3 - h + 4.2; wy < -4.5; wy += 3.4) {
            ctx.fillRect(tx + 1.2, wy, 0.9, 1.3);
            ctx.fillRect(tx + w - 2.1, wy, 0.9, 1.3);
          }
        }
        block(-25, 0, 50, 3, wall);
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  private drawStar(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.PI / 5) * i;
      const rr = i % 2 ? r * 0.45 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawFacilityIcon(icon: FacilityIcon, x: number, y: number, k: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineWidth = 1 / k;
    ctx.fillStyle = PAPER_LIGHT;
    ctx.strokeStyle = alpha(INK, 0.85);
    ctx.beginPath();
    ctx.arc(0, 0, 6.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawFacilityGlyph(ctx, icon, 1.15 / k);
    ctx.restore();
  }

  private drawResources(p: Prep, x: number, y: number, k: number): void {
    const ctx = this.ctx;
    const sv = p.r.survey;
    if (!sv) return;
    const kk = clamp(k, 0.85, 1.25);
    const deps = sv.deposits.slice(0, 6);
    const step = 17 * kk;
    let ix = x - ((deps.length - 1) * step) / 2;
    for (const dpz of deps) {
      drawDepositGlyph(ctx, dpz.kind, ix, y + 1, 6.2 * kk, dpz.epistemic === 'verified');
      ix += step;
    }
    if (this.scale < 0.5) return;
    // Arable and water hints as two short bars.
    const by = y + (deps.length ? 12 * kk : 0);
    const bw = 26 * kk;
    const bars: [number, string][] = [[clamp(sv.arable / 60, 0.04, 1), '#6f8f3a'], [clamp(sv.water / 4500, 0.04, 1), RIVER]];
    bars.forEach(([v, col], i) => {
      const yy = by + i * 4.5 * kk;
      ctx.fillStyle = alpha(PAPER_LIGHT, 0.9);
      ctx.fillRect(x - bw / 2, yy, bw, 3 * kk);
      ctx.fillStyle = col;
      ctx.fillRect(x - bw / 2, yy, bw * v, 3 * kk);
      ctx.strokeStyle = alpha(INK, 0.6);
      ctx.lineWidth = 0.7;
      ctx.strokeRect(x - bw / 2, yy, bw, 3 * kk);
    });
  }

  private drawArmy(role: Role, x: number, y: number, r: number, color: string, st: { training: boolean; battle: boolean; lowSupply: boolean }): void {
    const ctx = this.ctx;
    if (st.battle) {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI / 8) * i;
        const rr = i % 2 ? r * 1.25 : r * 1.95;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#f3d9a0';
      ctx.fill();
      ctx.strokeStyle = '#a23b2c';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    armyShape(ctx, role, x, y, r);
    ctx.fillStyle = st.training ? mix(color, PAPER_LIGHT, 0.55) : color;
    ctx.fill();
    ctx.strokeStyle = PAPER_LIGHT;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.setLineDash(st.training ? [2.5, 2] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    // Inner mark: a second, colour-independent cue for the role.
    ctx.strokeStyle = PAPER_LIGHT;
    ctx.lineWidth = Math.max(1.3, r * 0.2);
    ctx.beginPath();
    if (role === 'assault') {
      ctx.moveTo(x - r * 0.42, y + r * 0.42);
      ctx.lineTo(x + r * 0.42, y - r * 0.42);
      ctx.moveTo(x - r * 0.42, y - r * 0.42);
      ctx.lineTo(x + r * 0.42, y + r * 0.42);
    } else if (role === 'maneuver') {
      ctx.moveTo(x - r * 0.35, y + r * 0.1);
      ctx.lineTo(x + r * 0.3, y + r * 0.1);
    } else {
      ctx.moveTo(x - r * 0.5, y);
      ctx.lineTo(x + r * 0.5, y);
      ctx.moveTo(x, y - r * 0.5);
      ctx.lineTo(x, y + r * 0.5);
    }
    ctx.stroke();
    if (st.lowSupply) {
      ctx.fillStyle = '#b3761e';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x + r * 0.95, y - r * 0.95, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawForeignArmy(x: number, y: number, r: number, color: string, stale: boolean): void {
    const ctx = this.ctx;
    ctx.globalAlpha = stale ? 0.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r * 1.15, y);
    ctx.lineTo(x, y + r * 1.15);
    ctx.lineTo(x - r * 1.15, y);
    ctx.closePath();
    ctx.fillStyle = mix(color, PAPER_LIGHT, 0.25);
    ctx.fill();
    ctx.strokeStyle = PAPER_LIGHT;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([0.1, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // A pennant mark: "a formation was seen here", role unknown.
    ctx.strokeStyle = PAPER_LIGHT;
    ctx.fillStyle = PAPER_LIGHT;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y + r * 0.55);
    ctx.lineTo(x - r * 0.3, y - r * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y - r * 0.55);
    ctx.lineTo(x + r * 0.5, y - r * 0.25);
    ctx.lineTo(x - r * 0.3, y + r * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// --- shared pictogram paths (also used by the HTML legend through small canvases) ---------

/** Role silhouettes: assault = square, maneuver = forward wedge, denial = disc. */
export function armyShape(ctx: CanvasRenderingContext2D, role: Role, x: number, y: number, r: number): void {
  ctx.beginPath();
  if (role === 'assault') {
    ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  } else if (role === 'maneuver') {
    ctx.moveTo(x - r * 1.05, y + r * 0.95);
    ctx.lineTo(x, y - r * 1.15);
    ctx.lineTo(x + r * 1.05, y + r * 0.95);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r * 1.02, 0, Math.PI * 2);
  }
}

/** Deposit pictograms with a distinct outline per kind; hollow and dotted when not verified. */
export function drawDepositGlyph(ctx: CanvasRenderingContext2D, kind: Deposit, x: number, y: number, r: number, verified: boolean): void {
  ctx.beginPath();
  switch (kind) {
    case 'copper_ore':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'iron_ore':
      ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
      break;
    case 'coal':
      ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.15, y); ctx.lineTo(x, y + r * 1.15); ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
      break;
    case 'crude':
      ctx.moveTo(x, y - r * 1.25);
      ctx.bezierCurveTo(x + r * 1.5, y + r * 0.2, x + r * 0.8, y + r * 1.1, x, y + r * 1.1);
      ctx.bezierCurveTo(x - r * 0.8, y + r * 1.1, x - r * 1.5, y + r * 0.2, x, y - r * 1.25);
      ctx.closePath();
      break;
    case 'minerals':
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (Math.PI / 3) * i;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1);
        else ctx.lineTo(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1);
      }
      ctx.closePath();
      break;
  }
  const col = DEPOSIT_COLOR[kind];
  ctx.fillStyle = verified ? col : alpha(PAPER_LIGHT, 0.92);
  ctx.fill();
  ctx.strokeStyle = PAPER_LIGHT;
  ctx.lineWidth = 2.6;
  if (verified) ctx.stroke();
  ctx.strokeStyle = verified ? INK : col;
  ctx.lineWidth = verified ? 1 : 1.6;
  ctx.setLineDash(verified ? [] : [0.1, 2.7]);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Facility pictograms drawn in a 12×12 box centred on the origin. */
export function drawFacilityGlyph(ctx: CanvasRenderingContext2D, icon: FacilityIcon, lw: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (icon) {
    case 'mine':
      // Pick: curved head and a handle.
      ctx.moveTo(-3.6, -1.2);
      ctx.quadraticCurveTo(0, -5, 3.6, -1.2);
      ctx.moveTo(0, -3.1);
      ctx.lineTo(0, 4);
      ctx.stroke();
      break;
    case 'workshop':
      // Hammer.
      ctx.moveTo(-2.6, 3.8);
      ctx.lineTo(1.2, -0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1.2, -3.4); ctx.lineTo(3.6, 0.2); ctx.lineTo(2.2, 2); ctx.lineTo(-2.6, -1.6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'industry':
      // Sawtooth works with a chimney.
      ctx.moveTo(-4, 3.2); ctx.lineTo(-4, -0.4); ctx.lineTo(-1.4, 1.2); ctx.lineTo(-1.4, -0.4); ctx.lineTo(1.2, 1.2);
      ctx.lineTo(1.2, -4); ctx.lineTo(3.2, -4); ctx.lineTo(4, 3.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'school':
      // Open book.
      ctx.moveTo(0, -2.2);
      ctx.quadraticCurveTo(-2.2, -3.6, -4.2, -2.6);
      ctx.lineTo(-4.2, 2.6);
      ctx.quadraticCurveTo(-2.2, 1.6, 0, 3);
      ctx.quadraticCurveTo(2.2, 1.6, 4.2, 2.6);
      ctx.lineTo(4.2, -2.6);
      ctx.quadraticCurveTo(2.2, -3.6, 0, -2.2);
      ctx.lineTo(0, 3);
      ctx.stroke();
      break;
    case 'lab':
      // Flask.
      ctx.moveTo(-1.2, -4); ctx.lineTo(1.2, -4);
      ctx.moveTo(-0.9, -4); ctx.lineTo(-0.9, -1); ctx.lineTo(-3.4, 3.4); ctx.lineTo(3.4, 3.4); ctx.lineTo(0.9, -1); ctx.lineTo(0.9, -4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2.3, 1.4); ctx.lineTo(2.3, 1.4); ctx.lineTo(3.4, 3.4); ctx.lineTo(-3.4, 3.4);
      ctx.closePath();
      ctx.fill();
      break;
    case 'power':
      // Bolt.
      ctx.moveTo(1.4, -4.4); ctx.lineTo(-2.6, 0.6); ctx.lineTo(-0.2, 0.6); ctx.lineTo(-1.4, 4.4); ctx.lineTo(2.6, -0.8); ctx.lineTo(0.2, -0.8);
      ctx.closePath();
      ctx.fill();
      break;
    case 'port':
      // Anchor.
      ctx.arc(0, -3.2, 1, 0, Math.PI * 2);
      ctx.moveTo(0, -2.2); ctx.lineTo(0, 3.8);
      ctx.moveTo(-2, -0.6); ctx.lineTo(2, -0.6);
      ctx.moveTo(-3.6, 1); ctx.quadraticCurveTo(-3, 3.8, 0, 3.8); ctx.quadraticCurveTo(3, 3.8, 3.6, 1);
      ctx.stroke();
      break;
    case 'launch':
      // Rocket.
      ctx.moveTo(0, -4.6);
      ctx.quadraticCurveTo(2.2, -2, 1.6, 2);
      ctx.lineTo(-1.6, 2);
      ctx.quadraticCurveTo(-2.2, -2, 0, -4.6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1.6, 0.6); ctx.lineTo(-3.4, 3.2); ctx.lineTo(-1.4, 2.4);
      ctx.moveTo(1.6, 0.6); ctx.lineTo(3.4, 3.2); ctx.lineTo(1.4, 2.4);
      ctx.moveTo(0, 2.6); ctx.lineTo(0, 4.4);
      ctx.stroke();
      break;
    case 'jump':
      // Ring with a four-point star.
      ctx.arc(0, 0, 4.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (Math.PI / 4) * i;
        const rr = i % 2 ? 0.9 : 3;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
  }
}
