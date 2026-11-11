// The flat atlas tier: a framework-free Canvas 2D renderer for the seat's known
// world. It draws ONLY what is present in the observation. Regions that are not
// in `regions` are blank paper; an edge whose far side is not known is drawn as
// an "edge of knowledge", never as a coastline.
//
// Rendering is on demand: every state change calls invalidate(), which coalesces
// into a single requestAnimationFrame. There is no continuous loop.
import type {
  ArmyView, Bonus, ClimateZone, Deposit, ForeignArmyView, RegionId, RegionView, Role, SettlementKind, Terrain, WorldFrame,
} from '../protocol';
import { hash32, rng } from '../format';
import { DEPOSIT_COLOR, drawAnchor, drawBonusPicto, drawDepositPicto, drawOutbreakSeal } from './pictos';
import { SECTOR_COLOR, SECTORS, landUse, landUseSignature, type Building, type LandUse } from './landuse';
import { BUILD_AMBER, drawChip, drawSite, chipRadius, sectorChips, siteExtent, type SiteKind } from './sites';

export type MapMode = 'political' | 'terrain' | 'resources' | 'population' | 'construction';

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
  /** Facility kind → catalog category, for kinds this build does not know by name. */
  facilityCategories?: Record<string, string>;
  /** Region → building work queued or under way there, as far as the viewer knows. */
  construction?: Record<number, Building>;
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

/**
 * Population classes (people per region) and their wash colours. The breaks follow the
 * settlement classes of docs/units-and-scale.md §3 (camp under 150,000; village to 1
 * million; town to 4 million; city to 12 million; metropolis beyond), with the camp and
 * village classes split once more so the opening (236,000-248,000 a seat) reads.
 */
export const POP_BREAKS = [50_000, 150_000, 500_000, 1_000_000, 4_000_000, 12_000_000];
export const POP_RAMP = ['#efe3c2', '#e7d09f', '#deb87d', '#d09a5d', '#be7a44', '#a45a31', '#803e23'];
export { DEPOSIT_COLOR };
/**
 * Climate washes (Earth-like world): polar ice and tundra, desert, rainforest, temperate
 * (no shift) and the cooler continental interior. Mixed into the terrain tint by `weight`.
 */
export const CLIMATE_TINT: Record<ClimateZone, { color: string; weight: number }> = {
  polar: { color: '#eef2f3', weight: 0.68 },
  arid: { color: '#efd6a2', weight: 0.42 },
  tropical: { color: '#9fcb80', weight: 0.38 },
  temperate: { color: '#d9dea6', weight: 0 },
  continental: { color: '#c3cfb0', weight: 0.34 },
};
/** Terrain tint shifted by the region's climate. */
export function landTint(terrain: Terrain, climate: ClimateZone | null | undefined): string {
  const base = TINT[terrain];
  if (!climate) return base;
  const c = CLIMATE_TINT[climate];
  return c.weight > 0 ? mix(base, c.color, c.weight) : base;
}
export const TERRAIN_TINT = TINT;
const COAST_INK = '#2c4650';
/** Built levels per region (all sectors) and the wash classes of the development view. */
export const BUILT_BREAKS = [10, 30, 60, 100, 160];
export const BUILT_RAMP = ['#eef0df', '#d9e5cc', '#bcd6b8', '#97c2a6', '#6ea894', '#488b80'];
export function builtClass(levels: number): number {
  let i = 0;
  while (i < BUILT_BREAKS.length && levels >= BUILT_BREAKS[i]) i++;
  return i;
}

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
interface FieldPatch { x: number; y: number; w: number; h: number; skew: number; alt: boolean; pasture: boolean; stead: number }
/** A work standing on the land: world position, real size (world half-width) and what it is. */
interface PlacedSite { kind: SiteKind; x: number; y: number; size: number; n: number; active: boolean; color?: string }
/** The built-up ground of a settlement: a blob of blocks whose radius follows the population. */
interface Town { r: number; blocks: number[]; era: number }
interface Layout { town: Town | null; sites: PlacedSite[]; fields: FieldPatch[]; glyphs: Glyph[] }

interface Prep {
  r: RegionView;
  idx: number;
  /** Shared edges; `dx` shifts the edge's stored points into this region's frame (wrapped worlds). */
  edges: { e: Edge; rev: boolean; dx: number }[];
  outline: number[];
  path: Path2D;
  ownerEdges: Path2D | null;
  unknownEdges: Path2D | null;
  bbox: [number, number, number, number];
  cx: number;
  cy: number;
  /** Where the settlement stands: the principal city site, in this region's frame. */
  sx: number;
  sy: number;
  glyphs: Glyph[];
  fields: FieldPatch[];
  ccw: boolean;
  /** Sector totals, for regions whose works the viewer sees. */
  use: LandUse | null;
  town: Town | null;
  sites: PlacedSite[];
  /** Distance from the centre to the nearest border, in world units. */
  inR: number;
}

/** A region drawn at a horizontal offset (one of its copies on a wrapped world). */
interface Inst { p: Prep; ox: number }

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

function tracePolyline(path: Path2D, pts: number[], rev: boolean, move: boolean, dx = 0): void {
  const n = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const i = (rev ? n - 1 - k : k) * 2;
    if (k === 0) {
      if (move) path.moveTo(pts[i] + dx, pts[i + 1]);
      else path.lineTo(pts[i] + dx, pts[i + 1]);
    } else path.lineTo(pts[i] + dx, pts[i + 1]);
  }
}

const GLYPH_SPACING: Record<Terrain, number> = {
  forest: 23, mountains: 35, hills: 29, marsh: 25, desert: 30, steppe: 22, tundra: 21, plains: 40,
};
const SETTLEMENT_RANK: Record<SettlementKind, number> = {
  wilderness: 0, camp: 1, village: 2, town: 3, city: 4, metropolis: 5, megalopolis: 6,
};
/** Atlas zoom from which a principal city's name is shown, by settlement rank. */
const CITY_NAME_ZOOM = [9, 2.6, 1.9, 1.35, 0.95, 0.66, 0.5];

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
  private vignette: CanvasGradient | null = null;
  private vignetteKey = '';
  private baseCache = new Map<string, string>();
  private destroyed = false;

  private wobbleCache = new Map<string, number[]>();
  private glyphCache = new Map<string, Glyph[]>();
  private layoutCache = new Map<string, Layout>();
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
  /** World width when the map wraps east-west, else 0. */
  private wrapW = 0;
  /** West and east extent of the known regions, each in its own frame. */
  private contentX: [number, number] = [0, 0];

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
    const minTy = b.y + keep - d.world.height * this.scale;
    const maxTy = b.y + b.h - keep;
    this.ty = clamp(this.ty, minTy, maxTy);
    if (this.wrapW) {
      // The planet pans without end: keep the offset within one turn of the globe. The
      // picture is the same one width over, so this jump is invisible.
      const span = this.wrapW * this.scale;
      this.tx = ((this.tx % span) + span) % span - span;
      return;
    }
    const minTx = b.x + keep - d.world.width * this.scale;
    const maxTx = b.x + b.w - keep;
    this.tx = clamp(this.tx, minTx, maxTx);
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
    if (this.wrapW) [x0, x1] = this.knownSpanX();
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

  /**
   * West-east extent of the known regions on a wrapped world: the complement of the widest
   * empty stretch of longitude, so a realm astride the date line is framed as one piece.
   */
  private knownSpanX(): [number, number] {
    const W = this.wrapW;
    const iv: [number, number][] = [];
    for (const p of this.preps) {
      const a = ((p.bbox[0] % W) + W) % W;
      iv.push([a, a + (p.bbox[2] - p.bbox[0])]);
    }
    iv.sort((a, b) => a[0] - b[0]);
    // Merge on the circle and find the widest gap between covered stretches.
    let bestGap = -1, gapEnd = 0;
    let reach = iv[0][1];
    for (let i = 1; i < iv.length; i++) {
      if (iv[i][0] > reach && iv[i][0] - reach > bestGap) { bestGap = iv[i][0] - reach; gapEnd = iv[i][0]; }
      reach = Math.max(reach, iv[i][1]);
    }
    const wrapGap = iv[0][0] + W - reach;
    if (wrapGap > bestGap) { bestGap = wrapGap; gapEnd = iv[0][0]; }
    if (bestGap <= 0) return [0, W];
    return [gapEnd, gapEnd + W - bestGap];
  }

  /** The copy of world x nearest the middle of the uncovered box (wrapped worlds). */
  private nearView(x: number): number {
    if (!this.wrapW) return x;
    const b = this.box();
    const mid = (b.x + b.w / 2 - this.tx) / this.scale;
    return x + this.wrapW * Math.round((mid - x) / this.wrapW);
  }

  private goTo(s: number, tx: number, ty: number, animate: boolean): void {
    if (this.animRaf) cancelAnimationFrame(this.animRaf);
    this.animRaf = 0;
    if (this.wrapW) {
      // Travel the short way round the globe.
      const b = this.box();
      const cur = (b.x + b.w / 2 - this.tx) / this.scale;
      let want = (b.x + b.w / 2 - tx) / s;
      want += this.wrapW * Math.round((cur - want) / this.wrapW);
      tx = b.x + b.w / 2 - want * s;
    }
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
    const [x0, y] = this.screenToWorld(sx, sy);
    const W = this.wrapW;
    for (const p of this.preps) {
      if (y < p.bbox[1] || y > p.bbox[3]) continue;
      // On a wrapped world either copy of a region answers.
      const x = W ? x0 + W * Math.round(((p.bbox[0] + p.bbox[2]) / 2 - x0) / W) : x0;
      if (x < p.bbox[0] || x > p.bbox[2]) continue;
      if (pointInPoly(p.outline, x, y)) return p.r.id;
    }
    return null;
  }

  regionCenter(id: RegionId): [number, number] | null {
    const p = this.byId.get(id);
    return p ? this.worldToScreen(this.nearView(p.cx), p.cy) : null;
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
    const wrap = !!d.world.wrap_x;
    this.wrapW = wrap ? W : 0;
    const modW = (x: number) => (wrap ? ((x % W) + W) % W : x);
    // Vertices are snapped in the normalised frame (x modulo the width on a wrapped world), so
    // a border drawn past the date line by one region meets its neighbour's copy of it.
    const snap = new Map<string, [number, number]>();
    const canon = (x: number, y: number): [number, number] => {
      const xn = modW(x);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const hit = snap.get(`${modW(xn + dx)},${y + dy}`);
          if (hit) return hit;
        }
      }
      const v: [number, number] = [xn, y];
      snap.set(`${xn},${y}`, v);
      return v;
    };

    const edges = new Map<string, Edge>();
    const preps: Prep[] = [];
    const present = new Set<number>();
    for (const r of d.regions) present.add(r.id);

    d.regions.forEach((r, idx) => {
      // Canonical vertex, and the same vertex in this region's own frame.
      const verts: { c: [number, number]; x: number; y: number }[] = [];
      for (const pt of r.poly) {
        const x = Math.round(pt[0]), y = Math.round(pt[1]);
        const c = canon(x, y);
        const ax = wrap ? c[0] + W * Math.round((x - c[0]) / W) : c[0];
        if (!verts.length || verts[verts.length - 1].c !== c) verts.push({ c, x: ax, y: c[1] });
      }
      if (verts.length > 1 && verts[0].c === verts[verts.length - 1].c) verts.pop();
      let area2 = 0;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length];
        area2 += a.x * b.y - b.x * a.y;
      }
      const cx = r.center[0], cy = r.center[1];
      let sx = cx, sy = cy;
      if (r.city) {
        sx = wrap ? r.city.at[0] + W * Math.round((cx - r.city.at[0]) / W) : r.city.at[0];
        sy = r.city.at[1];
      }
      const p: Prep = {
        r, idx, edges: [], outline: [], path: new Path2D(), ownerEdges: null, unknownEdges: null,
        bbox: [Infinity, Infinity, -Infinity, -Infinity], cx, cy, sx, sy,
        glyphs: [], fields: [], ccw: area2 < 0, use: null, town: null, sites: [], inR: 40,
      };
      for (let i = 0; i < verts.length; i++) {
        const va = verts[i], vb = verts[(i + 1) % verts.length];
        // Normalise the edge so its western end lies inside the sheet.
        const m = Math.min(va.x, vb.x);
        const shift = wrap ? m - modW(m) : 0;
        const a: [number, number] = [va.x - shift, va.y], b: [number, number] = [vb.x - shift, vb.y];
        const fwd = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
        const p0 = fwd ? a : b, p1 = fwd ? b : a;
        const key = `${p0[0]},${p0[1]}|${p1[0]},${p1[1]}`;
        let e = edges.get(key);
        if (!e) {
          const frame =
            (!wrap && ((p0[0] <= 1 && p1[0] <= 1) || (p0[0] >= W - 1 && p1[0] >= W - 1))) ||
            (p0[1] <= 1 && p1[1] <= 1) || (p0[1] >= H - 1 && p1[1] >= H - 1);
          let pts = this.wobbleCache.get(key);
          if (!pts) {
            const seed = hash32(p0[0] * 4099 + p0[1], p1[0] * 4099 + p1[1]);
            pts = wobble(p0[0], p0[1], p1[0], p1[1], seed, frame ? 0.04 : 0.085);
            if (frame) {
              // The world sheet ends here: bow the shore inward so land does not look cut off.
              const n = pts.length / 2;
              const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
              const inx = !wrap && p0[0] <= 1 && p1[0] <= 1 ? 1 : !wrap && p0[0] >= W - 1 && p1[0] >= W - 1 ? -1 : 0;
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
        p.edges.push({ e, rev: !fwd, dx: shift });
      }
      // Outline: concatenate wobbled edges, skipping the duplicated joint.
      for (const { e, rev, dx } of p.edges) {
        const n = e.pts.length / 2;
        for (let k = 0; k < n - 1; k++) {
          const i = (rev ? n - 1 - k : k) * 2;
          p.outline.push(e.pts[i] + dx, e.pts[i + 1]);
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
    this.contentX = [Infinity, -Infinity];
    for (const p of preps) {
      this.contentX[0] = Math.min(this.contentX[0], p.bbox[0]);
      this.contentX[1] = Math.max(this.contentX[1], p.bbox[2]);
    }

    // Classify edges. Coast only when we can be sure; otherwise an edge of knowledge.
    for (const p of preps) {
      const allLandKnown = p.r.neighbors.every((n) => n.kind === 'sea' || present.has(n.region));
      for (const { e } of p.edges) {
        if (e.regions.length >= 2) e.kind = 'internal';
        else if (e.frame) e.kind = 'coast';
        else e.kind = p.r.coastal && allLandKnown ? 'coast' : 'unknown';
      }
    }

    // Combined line work, in the normalised frame (drawn once per visible copy).
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
    // Per-region (in the region's frame): edges facing a different owner (for the inner
    // coloured border), edges of knowledge, and coast ripples.
    for (const p of preps) {
      if (p.r.owner != null || p.r.controller != null) {
        const path = new Path2D();
        let any = false;
        for (const { e, rev, dx } of p.edges) {
          let other: RegionView | null = null;
          if (e.regions.length >= 2) other = preps[e.regions[0] === p.idx ? e.regions[1] : e.regions[0]].r;
          // Colour the border only where we know what lies beyond: another owner, or the sea.
          if (e.kind === 'coast' || (other && other.owner !== p.r.owner)) {
            tracePolyline(path, e.pts, rev, true, dx);
            any = true;
          }
        }
        p.ownerEdges = any ? path : null;
      }
      {
        const path = new Path2D();
        let any = false;
        for (const { e, rev, dx } of p.edges) {
          if (e.kind === 'unknown') {
            tracePolyline(path, e.pts, rev, true, dx);
            any = true;
          }
        }
        p.unknownEdges = any ? path : null;
      }
      const n = p.edges.length;
      for (let i = 0; i < n; i++) {
        const { e, rev, dx } = p.edges[i];
        if (e.kind !== 'coast') continue;
        const np = e.pts.length / 2;
        const ax = e.pts[rev ? (np - 1) * 2 : 0] + dx, ay = e.pts[rev ? (np - 1) * 2 + 1 : 1];
        const bx = e.pts[rev ? 0 : (np - 1) * 2] + dx, by = e.pts[rev ? 1 : (np - 1) * 2 + 1];
        const l = Math.hypot(bx - ax, by - ay) || 1;
        // Outward normal depends on polygon winding.
        let nx = (by - ay) / l, ny = -(bx - ax) / l;
        if (p.ccw) { nx = -nx; ny = -ny; }
        for (const [path, dist] of [[this.ripple1, 6.5], [this.ripple2, 14]] as [Path2D, number][]) {
          for (let k = 0; k < np; k++) {
            const j = (rev ? np - 1 - k : k) * 2;
            const x = e.pts[j] + dx + nx * dist, y = e.pts[j + 1] + ny * dist;
            if (k === 0) path.moveTo(x, y); else path.lineTo(x, y);
          }
          // Round the corner into the next coast edge of the same region.
          const nxt = p.edges[(i + 1) % n];
          if (nxt.e.kind === 'coast') {
            const mp = nxt.e.pts.length / 2;
            const cx2 = nxt.e.pts[nxt.rev ? 0 : (mp - 1) * 2] + nxt.dx, cy2 = nxt.e.pts[nxt.rev ? 1 : (mp - 1) * 2 + 1];
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

    // Terrain glyphs, and the land use the observation reports: town, works, farmland.
    const live = new Set<string>();
    for (const p of preps) {
      const r = p.r;
      const gkey = `${r.id}:${r.terrain}:${r.climate ?? ''}:${r.center[0]},${r.center[1]}:${p.sx},${p.sy}:${r.poly.length}:${r.poly[0]?.[0]},${r.poly[0]?.[1]}`;
      let glyphs = this.glyphCache.get(gkey);
      if (!glyphs) {
        glyphs = this.makeGlyphs(p);
        this.glyphCache.set(gkey, glyphs);
      }
      p.inR = distToPolyEdge(r.poly, p.cx, p.cy);
      const building = d.construction?.[r.id];
      p.use = landUse(r, d.facilityCategories, building);
      const lkey = `${gkey}|${r.visibility === 'remembered' ? 'm' : ''}|${landUseSignature(r, building)}`;
      live.add(lkey);
      let lay = this.layoutCache.get(lkey);
      if (!lay) {
        lay = this.makeLayout(p, glyphs);
        this.layoutCache.set(lkey, lay);
      }
      p.glyphs = lay.glyphs;
      p.fields = lay.fields;
      p.town = lay.town;
      p.sites = lay.sites;
    }
    if (this.layoutCache.size > 600) for (const k of this.layoutCache.keys()) if (!live.has(k)) this.layoutCache.delete(k);

    // Links: rivers through centres, sea routes as arcs, passes as notches. Each link is laid
    // out in the frame of its first region; the far end is brought to the nearest copy.
    this.rivers = [];
    this.riverPath = new Path2D();
    this.seaLinks = [];
    this.passes = [];
    const near = (x: number, ref: number) => (wrap ? x + W * Math.round((ref - x) / W) : x);
    const seen = new Set<string>();
    const sharedEdge = (a: Prep, b: Prep): { e: Edge; dx: number } | null => {
      let best: { e: Edge; dx: number } | null = null;
      for (const s2 of a.edges) {
        if (s2.e.regions.length >= 2 && s2.e.regions.includes(b.idx) && (!best || s2.e.len > best.e.len)) best = s2;
      }
      return best;
    };
    const coastPoint = (p: Prep, tx: number, ty: number): [number, number] | null => {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (const { e, dx } of p.edges) {
        if (e.kind !== 'coast') continue;
        const dd = Math.hypot(e.mx + dx - tx, e.my - ty) + (e.frame ? 400 : 0);
        if (dd < bd) { bd = dd; best = [e.mx + dx, e.my]; }
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
        const bcx = near(b.cx, a.cx);
        if (n.kind === 'river') {
          const se = sharedEdge(a, b);
          const mx = se ? se.e.mx + se.dx : (a.cx + bcx) / 2, my = se ? se.e.my : (a.cy + b.cy) / 2;
          const s1 = hash32(a.r.id * 131 + 7, b.r.id);
          const pts = wobble(a.cx, a.cy, mx, my, s1, 0.13);
          const pts2 = wobble(mx, my, bcx, b.cy, s1 ^ 0x5bd1e995, 0.13);
          const all = pts.concat(pts2.slice(2));
          this.rivers.push({ a: a.r.id, b: b.r.id, pts: all });
        } else if (n.kind === 'sea') {
          const pa = coastPoint(a, bcx, b.cy) ?? [a.cx, a.cy];
          const pb0 = coastPoint(b, near(a.cx, b.cx), a.cy) ?? [b.cx, b.cy];
          const pb: [number, number] = [near(pb0[0], pa[0]), pb0[1]];
          const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
          const l = Math.hypot(dx, dy) || 1;
          const sign = hash32(a.r.id, b.r.id) & 1 ? 1 : -1;
          const bulge = clamp(l * 0.22, 14, 90) * sign;
          this.seaLinks.push({
            ax: pa[0], ay: pa[1], bx: pb[0], by: pb[1],
            cx: (pa[0] + pb[0]) / 2 + (-dy / l) * bulge, cy: (pa[1] + pb[1]) / 2 + (dx / l) * bulge,
          });
        } else if (n.kind === 'pass') {
          const se = sharedEdge(a, b);
          if (se) {
            const dx = bcx - a.cx, dy = b.cy - a.cy;
            const l = Math.hypot(dx, dy) || 1;
            this.passes.push({ x: se.e.mx + se.dx, y: se.e.my, ux: dx / l, uy: dy / l });
          }
        }
      }
      // River mouth: the lowest reach of a river in a region whose shore we know.
      if (p.r.river && riverLinks >= 1 && lowest) {
        let mouth: { e: Edge; dx: number } | null = null;
        for (const s2 of p.edges) {
          if (s2.e.kind === 'coast' && !s2.e.frame && (!mouth || s2.e.len > mouth.e.len)) mouth = s2;
        }
        if (!mouth) for (const s2 of p.edges) if (s2.e.kind === 'coast' && (!mouth || s2.e.len > mouth.e.len)) mouth = s2;
        if (mouth) {
          const pts = wobble(p.cx, p.cy, mouth.e.mx + mouth.dx, mouth.e.my, hash32(p.r.id, 991), 0.13);
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
        const ex = gx - p.sx, ey = gy - p.sy;
        if (Math.abs(ex) < 24 && ey > -24 && ey < 12) continue;
        if (!pointInPoly(p.outline, gx, gy)) continue;
        if (distToPolyEdge(r.poly, gx, gy) < margin) continue;
        out.push({ x: gx, y: gy, v, rank });
      }
    }
    out.sort((a, b) => a.y - b.y);
    return out;
  }

  /**
   * Where a region's reported works stand. Positions are fixed in the world and
   * deterministic per region; sizes follow the levels really built, so a works
   * of forty levels covers far more ground than one of four.
   */
  private makeLayout(p: Prep, glyphs: Glyph[]): Layout {
    const r = p.r;
    const use = p.use;
    const rand = rng(hash32(r.id * 31 + 5, 0xf1e1d));
    // Everything is laid out round the settlement: the principal city site.
    const ox = p.sx, oy = p.sy;
    const inR = Math.max(6, Math.min(p.inR, distToPolyEdge(r.poly, ox, oy) + 4));
    const flat: number[] = [];
    for (const pt of r.poly) flat.push(pt[0], pt[1]);
    const rank = SETTLEMENT_RANK[r.settlement];

    let town: Town | null = null;
    if (rank > 0) {
      const base = [0, 4, 6.5, 10, 14, 18][rank];
      const pop = r.own ? r.own.population : r.foreign ? (r.foreign.population_low + r.foreign.population_high) / 2 : 0;
      // within its class a town grows with its people: ~30,000 to ~30 million (units-and-scale §3)
      const grow = pop > 0 ? clamp((Math.log10(pop) - 4.5) / 3, 0, 1) : 0.3;
      const rad = Math.min(base * (0.8 + 0.5 * grow), Math.max(3.5, inR * 0.4));
      const cell = 2.3;
      const blocks: number[] = [];
      const n = Math.ceil(rad / cell);
      for (let j = -n; j <= n; j++) {
        for (let i = -n; i <= n; i++) {
          const bx = i * cell + (j & 1 ? cell * 0.3 : 0), by = j * cell * 0.8;
          const dd = Math.hypot(bx, by * 1.25) / rad;
          const v = rand(), w = rand(), h = rand();
          if (dd > 1 || v < dd * dd * 0.75) continue;
          blocks.push(ox + bx, oy + by, cell * (0.6 + w * 0.22), cell * 0.8 * (0.55 + h * 0.2));
        }
      }
      town = { r: rad, blocks, era: use ? use.era : rank >= 3 ? 1 : 0 };
    }

    const sites: PlacedSite[] = [];
    const cityR = town ? town.r : 2;
    const taken: number[] = [ox, oy, cityR + 0.5];
    const free = (x: number, y: number, rad: number): boolean => {
      for (let i = 0; i < taken.length; i += 3) {
        if (Math.hypot(x - taken[i], y - taken[i + 1]) < rad + taken[i + 2] + 1) return false;
      }
      return true;
    };
    const fits = (x: number, y: number, rad: number): boolean =>
      pointInPoly(flat, x, y) && distToPolyEdge(r.poly, x, y) >= rad * 0.8 + 2.5;
    const place = (kind: SiteKind, size: number, n: number, active: boolean, prefDeg: number, minDist = 0, color?: string): boolean => {
      const pref = (prefDeg * Math.PI) / 180 + (rand() - 0.5) * 0.3;
      for (let ring = 0; ring < 9; ring++) {
        const dist = Math.max(minDist, cityR + size + 2) + ring * 3.4;
        for (const da of [0, 0.32, -0.32, 0.64, -0.64, 1, -1, 1.4, -1.4]) {
          const a = pref + da;
          const x = ox + Math.cos(a) * dist * 1.15, y = oy + Math.sin(a) * dist * 0.85;
          // The ground under the settlement is kept for its name.
          if (y > oy + 2 && Math.abs(x - ox) < 32) continue;
          if (!fits(x, y, size) || !free(x, y, size)) continue;
          taken.push(x, y, size);
          sites.push({ kind, x, y, size, n, active, color });
          return true;
        }
      }
      return false;
    };
    if (use) {
      if (use.heavy > 0) {
        const n = clamp(Math.round(use.heavy / 3.5), 1, 16);
        place('industry', clamp(3.7 * Math.sqrt(n), 5, 15), n, use.heavyRunning > 0.05, -165);
      }
      if (use.generation > 0 && use.powerKind) {
        const kind: SiteKind = use.powerKind;
        const n = clamp(Math.ceil(use.generation / 8), 1, 3);
        place(kind, 5.4 + n * 1.7, n, use.active.power, -128);
      }
      if (use.labs > 0) place('lab', 4.8 + Math.min(4, use.labs / 5), 1, use.active.knowledge, -62);
      if (use.schools > 0) place('school', 4.4 + Math.min(3.2, use.schools / 3), 1, use.active.knowledge, -24);
      if (use.craft > 0) {
        const n = clamp(Math.ceil(use.craft / 4), 1, 3);
        place('craft', 3.8 + n * 1.3, n, use.active.industry, 8);
      }
      if (use.jump > 0) place('jump', 6.4 + Math.min(3, use.jump / 3), 1, use.active.space, -78, cityR + 14);
      if (use.launch > 0) place('launch', 5.4 + Math.min(2.6, use.launch / 3), 1, use.active.space, -100, cityR + 12);
      if (use.orbital > 0) place('orbital', 5.6, 1, use.active.space, -45, cityR + 12);
      const MINE_AT = [172, 196, -12, 218, -38, 150];
      use.mines.slice(0, 5).forEach((m, i) => {
        const n = clamp(Math.ceil(m.level / 3), 1, m.well ? 4 : 3);
        const kind: SiteKind = m.well ? 'well' : m.deposit ? 'pit' : 'timber';
        place(kind, 4.6 + n * 1.3, n, m.active, MINE_AT[i] + (hash32(r.id, m.key.length * 7 + m.key.charCodeAt(m.key.length - 1)) % 18) - 9,
          Math.max(cityR + 9, inR * 0.5), m.deposit ? DEPOSIT_COLOR[m.deposit] : undefined);
      });
      if (use.port > 0) {
        // A harbour stands on the shore nearest the settlement.
        let best: Edge | null = null;
        let bd = Infinity;
        for (const { e } of p.edges) {
          if (e.kind !== 'coast') continue;
          const dd = Math.hypot(e.mx - ox, e.my - oy) + (e.frame ? 60 : 0);
          if (dd < bd) { bd = dd; best = e; }
        }
        const n = clamp(Math.ceil(use.port / 2), 1, 3);
        const size = 5.8 + n * 1.3;
        if (best) {
          const dx = ox - best.mx, dy = oy - best.my;
          const l = Math.hypot(dx, dy) || 1;
          for (const back of [size + 3, size + 7, size + 12]) {
            const x = best.mx + (dx / l) * back, y = best.my + (dy / l) * back;
            if (!free(x, y, size * 0.8)) continue;
            taken.push(x, y, size);
            sites.push({ kind: 'port', x, y, size, n, active: use.active.transport });
            break;
          }
        } else place('port', size, n, use.active.transport, 30);
      }
      if (use.building.levels > 0) place('scaffold', 5.6, 1, true, 24);
    }

    // Farmland: tilled plots nearest the settlement, grazing beyond them.
    const fields: FieldPatch[] = [];
    if (use && (use.fields > 0 || use.pasture > 0)) {
      const nf = use.fields > 0 ? clamp(Math.round(use.fields / 3.5), 1, 14) : 0;
      const np = use.pasture > 0 ? clamp(Math.round(use.pasture / 5), 1, 5) : 0;
      const cand: { x: number; y: number; d: number }[] = [];
      const sp = 15;
      const [x0, y0, x1, y1] = p.bbox;
      let row = 0;
      for (let y = y0 + 8; y < y1; y += sp * 0.8, row++) {
        for (let x = x0 + (row & 1 ? sp / 2 : 0) + 6; x < x1; x += sp * 1.25) {
          const gx = x + (rand() - 0.5) * 5, gy = y + (rand() - 0.5) * 4;
          cand.push({ x: gx, y: gy, d: Math.hypot(gx - ox, (gy - oy) * 1.25) });
        }
      }
      cand.sort((a, b) => a.d - b.d);
      for (const c of cand) {
        if (fields.length >= nf + np) break;
        const w = 13 + rand() * 6, h = 8 + rand() * 3.5;
        if (Math.abs(c.x - ox) < 36 && c.y - oy > -3 && c.y - oy < 32) continue;
        const corners = [[c.x - w / 2 - 3, c.y - h / 2], [c.x + w / 2 + 3, c.y - h / 2], [c.x + w / 2 + 3, c.y + h / 2], [c.x - w / 2 - 3, c.y + h / 2]];
        if (!corners.every((q) => pointInPoly(flat, q[0], q[1]) && distToPolyEdge(r.poly, q[0], q[1]) > 4.5)) continue;
        if (!free(c.x, c.y, Math.max(w, h) * 0.5)) continue;
        if (fields.some((o) => Math.abs(o.x - c.x) < (o.w + w) / 2 + 2.5 && Math.abs(o.y - c.y) < (o.h + h) / 2 + 2.5)) continue;
        fields.push({ x: c.x, y: c.y, w, h, skew: (rand() - 0.5) * 5, alt: rand() > 0.5, pasture: false, stead: 0 });
      }
      const graze = nf > 0 ? Math.min(np, Math.max(0, fields.length - 1)) : fields.length;
      for (let i = 0; i < graze; i++) fields[fields.length - 1 - i].pasture = true;
      // Farmsteads: rural settlement beside roughly every third plot.
      let k = 0;
      for (const f of fields) {
        if (f.pasture || k++ % 3 !== 0) continue;
        f.stead = 1 + (k & 1);
        sites.push({ kind: 'hamlet', x: f.x + f.w / 2 + 1.5, y: f.y - f.h / 2 + 1, size: 3.4, n: f.stead, active: true });
      }
    }

    // Terrain glyphs give way to what people have built.
    const kept = glyphs.filter((g) => {
      for (let i = 0; i < taken.length; i += 3) {
        if (Math.hypot(g.x - taken[i], g.y - taken[i + 1]) < taken[i + 2] + 5) return false;
      }
      for (const f of fields) if (Math.abs(g.x - f.x) < f.w / 2 + 6 && Math.abs(g.y - f.y) < f.h / 2 + 6) return false;
      return true;
    });
    return { town, sites, fields, glyphs: kept };
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

  /** Horizontal offsets of the copies of the known world that reach into the view. */
  private copies(vx0: number, vx1: number, pad: number): number[] {
    const W = this.wrapW;
    if (!W) return [0];
    const out: number[] = [];
    const [c0, c1] = this.contentX;
    const k0 = Math.floor((vx0 - pad - c1) / W), k1 = Math.ceil((vx1 + pad - c0) / W);
    for (let k = k0; k <= k1; k++) if (c1 + k * W >= vx0 - pad && c0 + k * W <= vx1 + pad) out.push(k * W);
    return out;
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
    const offs = this.copies(vx0, vx1, 80);
    const visible: Inst[] = [];
    for (const ox of offs) {
      for (const p of this.preps) {
        if (p.bbox[2] + ox < vx0 - 40 || p.bbox[0] + ox > vx1 + 40 || p.bbox[3] < vy0 - 40 || p.bbox[1] > vy1 + 40) continue;
        visible.push({ p, ox });
      }
    }
    const each = (fn: () => void) => {
      for (const ox of offs) {
        if (ox) ctx.translate(ox, 0);
        fn();
        if (ox) ctx.translate(-ox, 0);
      }
    };
    const at = (inst: Inst, fn: () => void) => {
      if (inst.ox) ctx.translate(inst.ox, 0);
      fn();
      if (inst.ox) ctx.translate(-inst.ox, 0);
    };

    // 1. Sheet furniture: faint graticule and a neatline around the world frame. A wrapped
    // world has no east and west edge: only the polar edges are ruled.
    this.toWorld();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = alpha(INK_3, 0.11);
    ctx.lineWidth = 0.6 * px;
    ctx.beginPath();
    if (this.wrapW) {
      const gx0 = Math.floor(vx0 / 200) * 200;
      for (let x = gx0; x < vx1; x += 200) { ctx.moveTo(x, -16); ctx.lineTo(x, d.world.height + 16); }
      for (let y = 200; y < d.world.height; y += 200) { ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); }
    } else {
      for (let x = 200; x < d.world.width; x += 200) { ctx.moveTo(x, -16); ctx.lineTo(x, d.world.height + 16); }
      for (let y = 200; y < d.world.height; y += 200) { ctx.moveTo(-16, y); ctx.lineTo(d.world.width + 16, y); }
    }
    ctx.stroke();
    if (this.wrapW) {
      ctx.beginPath();
      for (const y of [-16, d.world.height + 16]) { ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); }
      ctx.strokeStyle = alpha(INK_2, 0.5);
      ctx.lineWidth = 1.1 * px;
      ctx.stroke();
      ctx.beginPath();
      for (const y of [-22, d.world.height + 22]) { ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); }
      ctx.strokeStyle = alpha(INK_2, 0.28);
      ctx.lineWidth = 0.6 * px;
      ctx.stroke();
    } else {
      ctx.strokeStyle = alpha(INK_2, 0.5);
      ctx.lineWidth = 1.1 * px;
      ctx.strokeRect(-16, -16, d.world.width + 32, d.world.height + 32);
      ctx.strokeStyle = alpha(INK_2, 0.28);
      ctx.lineWidth = 0.6 * px;
      ctx.strokeRect(-22, -22, d.world.width + 44, d.world.height + 44);
    }

    // 2. Coastal wash outside the known shore (land is painted over the inner half).
    each(() => {
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
    });

    // 3. Land.
    for (const v of visible) at(v, () => this.drawRegionBase(v.p, mode, px));

    // 5. Paper grain over paper and tints alike.
    this.toScreen();
    const grain = this.ensureGrain();
    if (grain) {
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, W, H);
    }
    if (!this.vignette || this.vignetteKey !== `${W}x${H}`) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, 'rgba(120,90,40,0)');
      vg.addColorStop(1, 'rgba(120,90,40,0.13)');
      this.vignette = vg;
      this.vignetteKey = `${W}x${H}`;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, W, H);

    // 6. Terrain glyphs and tended fields.
    this.toWorld();
    if (mode !== 'population') {
      const gAlpha = mode === 'terrain' ? 0.9 : mode === 'political' ? 0.5 : mode === 'construction' ? 0.22 : 0.32;
      for (const v of visible) at(v, () => this.drawGlyphs(v.p, px, gAlpha));
      const fAlpha = mode === 'resources' ? 0.5 : 0.95;
      for (const v of visible) at(v, () => this.drawFarmland(v.p, px, fAlpha));
      for (const v of visible) at(v, () => this.drawTown(v.p, px, mode === 'resources' ? 0.55 : 1));
    }

    // 7. Line work.
    // Border hierarchy: region borders are a thin secondary line, borders between
    // realms a continuous heavy one over the coloured bands, the coast a sea-ink line.
    each(() => {
      ctx.setLineDash([]);
      ctx.strokeStyle = alpha(INK_2, mode === 'terrain' ? 0.34 : 0.5);
      ctx.lineWidth = clamp(0.95 * Math.sqrt(s), 0.8, 1.5) * px;
      ctx.stroke(this.internalPath);
      ctx.strokeStyle = alpha(PAPER_LIGHT, mode === 'terrain' ? 0.25 : 0.5);
      ctx.lineWidth = clamp(3.6 * Math.sqrt(s), 3, 5.6) * px;
      ctx.stroke(this.politicalPath);
      ctx.strokeStyle = alpha(INK, mode === 'terrain' ? 0.55 : 0.88);
      ctx.lineWidth = clamp(1.9 * Math.sqrt(s), 1.6, 3.2) * px;
      ctx.stroke(this.politicalPath);
      ctx.strokeStyle = alpha(INK_3, 0.75);
      ctx.lineWidth = 1.1 * px;
      ctx.setLineDash([0.1 * px, 4.2 * px]);
      ctx.stroke(this.unknownPath);
      ctx.setLineDash([]);
      ctx.strokeStyle = alpha(COAST_INK, 0.92);
      ctx.lineWidth = clamp(1.6 * Math.sqrt(s), 1.2, 2.4) * px;
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
        ctx.beginPath();
        for (const l of this.seaLinks) {
          for (const [x, y] of [[l.ax, l.ay], [l.bx, l.by]]) {
            ctx.moveTo(x + 2.2 * px, y);
            ctx.arc(x, y, 2.2 * px, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }

      // Passes: a short notched line crossing the border.
      if (this.passes.length) {
        const L = clamp(11 * px, 7, 22);
        const N = L * 0.42;
        ctx.strokeStyle = alpha(PAPER_LIGHT, 0.9);
        ctx.lineWidth = 3.6 * px;
        ctx.beginPath();
        for (const ps of this.passes) {
          ctx.moveTo(ps.x - ps.ux * L, ps.y - ps.uy * L);
          ctx.lineTo(ps.x + ps.ux * L, ps.y + ps.uy * L);
        }
        ctx.stroke();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4 * px;
        ctx.beginPath();
        for (const ps of this.passes) {
          const nx = -ps.uy, ny = ps.ux;
          ctx.moveTo(ps.x - ps.ux * L, ps.y - ps.uy * L);
          ctx.lineTo(ps.x + ps.ux * L, ps.y + ps.uy * L);
          for (const t of [-0.62, 0, 0.62]) {
            const cx = ps.x + ps.ux * L * t, cy = ps.y + ps.uy * L * t;
            ctx.moveTo(cx - nx * N, cy - ny * N);
            ctx.lineTo(cx + nx * N, cy + ny * N);
          }
        }
        ctx.stroke();
      }
    });

    // 8. Pick mode, hover and selection (every visible copy).
    const ov = this.overlay;
    if (ov.targets !== undefined) {
      const tset = ov.targets ? new Set(ov.targets) : null;
      for (const v of visible) {
        const ok = !tset || tset.has(v.p.r.id);
        if (!ok) at(v, () => {
          ctx.fillStyle = alpha(PAPER, 0.42);
          ctx.fill(v.p.path);
        });
      }
      if (tset) {
        ctx.setLineDash([6 * px, 3.5 * px]);
        ctx.lineWidth = 2.2 * px;
        ctx.strokeStyle = ACCENT;
        for (const v of visible) {
          if (!tset.has(v.p.r.id)) continue;
          at(v, () => {
            ctx.fillStyle = alpha(ACCENT, 0.08);
            ctx.fill(v.p.path);
            ctx.stroke(v.p.path);
          });
        }
        ctx.setLineDash([]);
      }
    }
    for (const v of visible) {
      const id = v.p.r.id;
      if (id === ov.hovered && ov.hovered !== ov.selected) at(v, () => {
        ctx.fillStyle = alpha('#fffbea', 0.24);
        ctx.fill(v.p.path);
        ctx.strokeStyle = alpha(PAPER_LIGHT, 0.9);
        ctx.lineWidth = 4.2 * px;
        ctx.stroke(v.p.path);
        ctx.strokeStyle = alpha(INK, 0.85);
        ctx.lineWidth = 1.8 * px;
        ctx.stroke(v.p.path);
      });
    }
    for (const v of visible) {
      if (v.p.r.id !== ov.selected) continue;
      at(v, () => {
        ctx.fillStyle = alpha('#fffbea', 0.14);
        ctx.fill(v.p.path);
        ctx.strokeStyle = alpha(PAPER_LIGHT, 0.96);
        ctx.lineWidth = 7 * px;
        ctx.stroke(v.p.path);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4.4 * px;
        ctx.stroke(v.p.path);
        ctx.strokeStyle = '#e3b64f';
        ctx.lineWidth = 1.8 * px;
        ctx.stroke(v.p.path);
      });
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
    const bkey = mode + (remembered ? 'r' : '') + (r.climate ?? '') + r.terrain;
    let base = this.baseCache.get(bkey);
    if (!base) {
      const tint = landTint(r.terrain, r.climate);
      if (mode === 'terrain') base = tint;
      else if (mode === 'political') base = mix(LAND_BASE, tint, 0.55);
      else if (mode === 'construction') base = mix(LAND_BASE, tint, 0.12);
      else base = mix(LAND_BASE, tint, 0.22);
      if (remembered) base = mix(base, GREY_PAPER, 0.72);
      this.baseCache.set(bkey, base);
    }
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

    if (mode === 'construction' && p.use) {
      ctx.fillStyle = BUILT_RAMP[builtClass(p.use.total)];
      ctx.globalAlpha = 0.92;
      ctx.fill(p.path);
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

    if (ownerCol && mode !== 'population' && mode !== 'construction') {
      const wash = mode === 'political' ? (remembered ? 0.2 : 0.4) : remembered ? 0.04 : 0.07;
      ctx.fillStyle = alpha(ownerCol, wash);
      ctx.fill(p.path);
    }
    // Remembered land is greyed; a sparse, faint hatch says so without shouting.
    if (remembered) this.hatch(p, px, 10, -1, alpha(INK_2, 0.09), 0.8);
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
      ctx.strokeStyle = alpha(strong ? mix(ownerCol, '#2b2620', 0.12) : ownerCol, (strong ? 0.86 : 0.62) * k);
      ctx.lineWidth = 2 * (strong ? clamp(4.6 * px, 3, 9) : clamp(2.6 * px, 1.6, 5));
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

  /** Tilled plots and grazing, as many as the levels of fields and pasture reported. */
  private drawFarmland(p: Prep, px: number, a: number): void {
    if (!p.fields.length) return;
    const ctx = this.ctx;
    const s = this.scale;
    const fine = s >= 1.25;
    ctx.globalAlpha = a;
    ctx.lineJoin = 'round';
    ctx.lineWidth = clamp(0.8 * px, 0.3, 1.2);
    for (const f of p.fields) {
      const x0 = f.x - f.w / 2, y0 = f.y - f.h / 2;
      if (f.pasture) {
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.w / 2, f.h / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = alpha('#cfdba8', 0.8);
        ctx.fill();
        if (fine) {
          ctx.setLineDash([1.2 * px, 2.6 * px]);
          ctx.strokeStyle = alpha('#5f7436', 0.5);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (fine) {
          ctx.fillStyle = alpha('#5f7436', 0.75);
          for (const [dx, dy] of [[-0.25, -0.1], [0.12, 0.18], [0.28, -0.16], [-0.08, 0.02]]) {
            ctx.beginPath();
            ctx.arc(f.x + dx * f.w, f.y + dy * f.h, clamp(0.9 * px, 0.25, 0.7), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(x0 + f.skew, y0);
      ctx.lineTo(x0 + f.w + f.skew, y0);
      ctx.lineTo(x0 + f.w, y0 + f.h);
      ctx.lineTo(x0, y0 + f.h);
      ctx.closePath();
      ctx.fillStyle = f.alt ? '#dccd7e' : '#c8cf88';
      ctx.fill();
      ctx.strokeStyle = alpha('#6a5a2c', fine ? 0.7 : 0.5);
      ctx.stroke();
      if (fine) {
        ctx.beginPath();
        const rows = 4;
        for (let i = 1; i < rows; i++) {
          const yy = y0 + (f.h * i) / rows;
          const sk = f.skew * (1 - i / rows);
          ctx.moveTo(x0 + sk + 1, yy);
          ctx.lineTo(x0 + f.w + sk - 1, yy);
        }
        ctx.strokeStyle = alpha('#6a5a2c', 0.42);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The built-up ground of a settlement; its radius follows the population. */
  private drawTown(p: Prep, px: number, a: number): void {
    const t = p.town;
    if (!t) return;
    const ctx = this.ctx;
    const s = this.scale;
    const rem = p.r.visibility === 'remembered';
    const modern = t.era >= 3;
    ctx.globalAlpha = a * (rem ? 0.6 : 1);
    ctx.fillStyle = alpha(modern ? '#bdb8ae' : '#d2c3a0', 0.72);
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, t.r * 1.1, t.r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha(INK_2, 0.35);
    ctx.lineWidth = 0.7 * px;
    ctx.stroke();
    if (t.r * s >= 7) {
      const own = p.r.owner != null && !rem ? this.colorOf(p.r.owner) : '#9a9488';
      const roofA = mix(own, modern ? '#8b9097' : '#a8573a', 0.62);
      const roofB = mix(roofA, PAPER_LIGHT, 0.32);
      const outline = 2.3 * s >= 7;
      ctx.lineWidth = 0.6 * px;
      ctx.strokeStyle = alpha(INK, 0.55);
      const b = t.blocks;
      for (let i = 0; i < b.length; i += 4) {
        ctx.fillStyle = (i >> 2) % 3 === 0 ? roofB : roofA;
        ctx.fillRect(b[i] - b[i + 2] / 2, b[i + 1] - b[i + 3] / 2, b[i + 2], b[i + 3]);
        if (outline) ctx.strokeRect(b[i] - b[i + 2] / 2, b[i + 1] - b[i + 3] / 2, b[i + 2], b[i + 3]);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawGlyphs(p: Prep, px: number, modeAlpha: number): void {
    const ctx = this.ctx;
    const r = p.r;
    const remembered = r.visibility === 'remembered';
    const s = this.scale;
    // Grow glyphs a little when zoomed out and thin them so density on screen stays calm.
    // Zoomed in, they grow slower than the land: relief stays a suggestion, not a forest of signs.
    const grow = s < 0.85 ? clamp(0.85 / s, 1, 1.9) : Math.pow(0.85 / s, 0.62);
    const keep = clamp(1 / (grow * grow) + 0.08, 0.2, 1);
    const ink = remembered ? INK_3 : INK_2;
    const a = modeAlpha * (remembered ? 0.5 : 1);
    ctx.globalAlpha = a;
    ctx.lineWidth = clamp(0.9 * px, 0.45, 1.4);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const t = r.terrain;
    const cold = r.climate === 'polar' || r.climate === 'continental';
    const hot = r.climate === 'tropical';

    for (const g of p.glyphs) {
      if (g.rank > keep) continue;
      const x = g.x, y = g.y;
      switch (t) {
        case 'forest': {
          const u = 4.6 * grow;
          if (cold) {
            // Boreal forest: conifers.
            const offs = g.v < 0.3 ? [[-0.65, 0.1], [0.7, 0.2]] : [[0, -0.6], [-1, 0.25], [0.95, 0.3]];
            for (const o of offs) {
              const tx2 = x + o[0] * u, ty2 = y + o[1] * u;
              ctx.beginPath();
              ctx.moveTo(tx2, ty2 - u * 1.25);
              ctx.lineTo(tx2 + u * 0.62, ty2 + u * 0.55);
              ctx.lineTo(tx2 - u * 0.62, ty2 + u * 0.55);
              ctx.closePath();
              ctx.fillStyle = remembered ? '#b6bca8' : g.v > 0.6 ? '#6f9466' : '#7ea374';
              ctx.fill();
              ctx.strokeStyle = alpha(ink, 0.75);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(tx2, ty2 + u * 0.55);
              ctx.lineTo(tx2, ty2 + u * 1.05);
              ctx.stroke();
            }
            break;
          }
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
            ctx.fillStyle = remembered ? '#b9bfa8' : hot ? (g.v > 0.6 ? '#5f9a52' : '#6fa95e') : g.v > 0.6 ? '#86ab6c' : '#93b578';
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
          if (g.v > 0.45 || cold) {
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

  private drawSymbols(visible: Inst[], mode: MapMode): void {
    const ctx = this.ctx;
    const d = this.data;
    if (!d) return;
    const s = this.scale;
    const k = clamp(Math.pow(s / 0.8, 0.6), 0.72, 2);
    const ov = this.overlay;
    const W = this.wrapW;
    const near = (x: number, ref: number) => (W ? x + W * Math.round((ref - x) / W) : x);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Rings: revealed test nodes and externally marked regions.
    for (const { p, ox } of visible) {
      const [x, y] = this.worldToScreen(p.cx + ox, p.cy);
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
      const [x, y] = this.worldToScreen(this.nearView(p.cx), p.cy);
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

    // Army order arrows (under the markers). The development view leaves the armies out.
    const showArmies = mode !== 'construction';
    for (const a of d.armies) {
      if (!showArmies || a.target == null || a.target === a.region) continue;
      const from = this.byId.get(a.region), to = this.byId.get(a.target);
      if (!from || !to) continue;
      const fx = this.nearView(from.cx);
      const [x0, y0] = this.worldToScreen(fx, from.cy);
      const [x1, y1] = this.worldToScreen(near(to.cx, fx), to.cy);
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

    // Works standing on the land: drawn in place at their real size once that size can be
    // read, and summed into the sector chips under the name when it cannot.
    if (mode !== 'population') {
      const drawn: { st: PlacedSite; x: number; y: number; rem: boolean }[] = [];
      for (const { p, ox } of visible) {
        for (const st of p.sites) {
          // Too small to read is not drawn at all: the chips carry it. A large works shows from afar.
          if (st.size * s < (st.kind === 'industry' ? 4.6 : 6.2)) continue;
          const [x, y] = this.worldToScreen(st.x + ox, st.y);
          if (x < -80 || x > this.w + 80 || y < -80 || y > this.h + 80) continue;
          drawn.push({ st, x, y, rem: p.r.visibility === 'remembered' });
        }
      }
      drawn.sort((a, b) => a.y - b.y);
      ctx.globalAlpha = mode === 'resources' ? 0.6 : 1;
      for (const { st, x, y, rem } of drawn) {
        const [ew, eh] = siteExtent(st.kind, st.n);
        const half = clamp(st.size * s, 7, 76);
        const u = half / ew;
        const gy = y + eh * u * 0.4;
        ctx.fillStyle = alpha(PAPER_LIGHT, 0.5);
        ctx.beginPath();
        ctx.ellipse(x, gy, half * 1.12, Math.max(2, half * 0.3), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(x, gy);
        ctx.scale(u, u);
        drawSite(ctx, st.kind, { n: st.n, active: st.active, faded: rem, px: 1 / u, depositColor: st.color, coarse: u < 0.75 });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Settlements (at the principal city site), harbours, epidemics and the capital star.
    interface Row { p: Prep; x: number; y: number; labelY: number; tx: number; ty: number; halfW: number }
    const rows: Row[] = [];
    const showHarbour = mode === 'terrain' ? s >= 0.85 : s >= 1;
    // From afar a crowded late world shows its towns and villages as dots; cities keep their skylines.
    const far = s < 0.8;
    for (const { p, ox } of visible) {
      const [x, y] = this.worldToScreen(p.cx + ox, p.cy);
      const [tx, ty] = this.worldToScreen(p.sx + ox, p.sy);
      if (Math.max(x, tx) < -120 || Math.min(x, tx) > this.w + 120 || Math.max(y, ty) < -80 || Math.min(y, ty) > this.h + 80) continue;
      const r = p.r;
      const remembered = r.visibility === 'remembered';
      // The name goes under the settlement when the city stands near the middle of its
      // region, otherwise at the middle, where it reads as the region's name.
      const apart = Math.hypot(tx - x, ty - y) > 30;
      let labelY = y + 9 * k;
      const rank = SETTLEMENT_RANK[r.settlement];
      const asDot = far && rank > 0 && (rank <= 3 || (rank === 4 && r.visibility !== 'own')) && d.capital !== r.id && r.id !== ov.selected && r.id !== ov.hovered;
      const halfW = r.settlement === 'wilderness' ? 3 : asDot ? 3 : this.settlementHalfWidth(r.settlement) * k;
      if (asDot) {
        ctx.beginPath();
        ctx.arc(tx, ty, 1.6 + rank * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = remembered ? '#9a9488' : mix(r.owner != null ? this.colorOf(r.owner) : '#a8573a', '#3a2a20', 0.25);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = alpha(PAPER_LIGHT, 0.9);
        ctx.stroke();
        if (!apart) labelY = ty + 13;
      } else if (r.settlement !== 'wilderness') {
        const roof = remembered ? '#9a9488' : mix(r.owner != null ? this.colorOf(r.owner) : '#a8573a', '#3a2a20', 0.12);
        const era = p.town?.era ?? 0;
        this.drawSettlement(r.settlement, tx, ty + 4 * k, k, roof, remembered, era);
        if (!apart) labelY = ty + 4 * k + 12 + 2 * k;
        if (d.capital === r.id) this.drawStar(tx, ty + 4 * k - this.settlementHeight(r.settlement) * k - 8 * k, 5.2 * k, this.colorOf(d.mySeat));
      } else if (r.city && s >= 1.6 && mode !== 'population') {
        // An unsettled site: a small ring where a city could stand.
        ctx.beginPath();
        ctx.arc(tx, ty, 2.4 * k, 0, Math.PI * 2);
        ctx.fillStyle = alpha(PAPER_LIGHT, 0.9);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = alpha(INK_2, 0.7);
        ctx.stroke();
      }
      if (r.city?.natural_harbour && mode !== 'population' && (r.settlement !== 'wilderness' ? showHarbour : s >= 1.6)) {
        const ax = r.settlement !== 'wilderness' ? tx - halfW - 7 * k : tx - 8 * k;
        drawAnchor(ctx, ax, ty + 1 * k, 5.6 * clamp(k, 0.85, 1.35), remembered);
      }
      rows.push({ p, x, y, labelY, tx, ty, halfW });
    }
    // Epidemics: a seal by the settlement (after all settlements, so none covers it).
    for (const row of rows) {
      const ob = row.p.r.outbreak;
      if (!ob || mode === 'construction') continue;
      const r = row.p.r;
      const hgt = r.settlement === 'wilderness' || row.halfW <= 3 ? 6 : this.settlementHeight(r.settlement);
      const ex = row.tx + Math.max(row.halfW * 0.7, 9 * k), ey = row.ty + 4 * k - hgt * k * 0.85;
      drawOutbreakSeal(ctx, ex, ey, clamp(5.2 * k, 4.6, 8.5), ob.severity_band, r.visibility === 'remembered');
    }

    // Labels with greedy collision avoidance: the most important name wins the space.
    const labelAlpha = clamp((s - 0.36) / 0.16, 0, 1);
    const placed: [number, number, number, number][] = [];
    const hits = (rect: [number, number, number, number]) => placed.some((q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1]);
    const order = rows.slice().sort((a, b) => this.labelPriority(b.p) - this.labelPriority(a.p));
    const labelled = new Map<Row, number>();
    for (const row of order) {
      const r = row.p.r;
      const forced = r.id === ov.selected || r.id === ov.hovered;
      const al = forced ? 1 : labelAlpha * (r.visibility === 'remembered' ? 0.75 : 1);
      if (al <= 0.02) continue;
      const rank = SETTLEMENT_RANK[r.settlement];
      const size = clamp((rank >= 4 ? 14 : rank >= 2 ? 12.5 : 11.5) * clamp(k, 0.9, 1.3), 10.5, 18);
      const weight = r.visibility === 'own' || rank >= 3 ? 700 : 600;
      ctx.font = `small-caps ${weight} ${size}px ${SERIF}`;
      this.setLetterSpacing('0.7px');
      const text = r.name;
      const tw = this.measure(text, ctx.font);
      const rect: [number, number, number, number] = [row.x - tw / 2 - 4, row.labelY - size * 0.9, row.x + tw / 2 + 4, row.labelY + size * 0.34];
      if (!forced && hits(rect)) continue;
      placed.push(rect);
      labelled.set(row, rect[3]);
      ctx.globalAlpha = al;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = alpha(PAPER_LIGHT, 0.94);
      ctx.lineWidth = 3.6;
      ctx.strokeText(text, row.x, row.labelY);
      ctx.fillStyle = r.visibility === 'remembered' ? INK_2 : INK;
      ctx.fillText(text, row.x, row.labelY);
      ctx.globalAlpha = 1;
    }
    this.setLetterSpacing('0px');

    // City names: a lighter italic beside the settlement, shown by size as the view closes in.
    if (mode !== 'population') {
      for (const row of order) {
        const r = row.p.r;
        if (!r.city || r.settlement === 'wilderness' || r.city.name === r.name) continue;
        const rank = SETTLEMENT_RANK[r.settlement];
        const forced = r.id === ov.selected || r.id === ov.hovered;
        let need = CITY_NAME_ZOOM[rank] ?? 9;
        if (d.capital === r.id || r.visibility === 'own') need *= 0.75;
        if (!forced && s < need) continue;
        const size = clamp((rank >= 5 ? 12.5 : rank >= 4 ? 11.5 : 10.5) * clamp(k, 0.9, 1.25), 10, 15);
        ctx.font = `italic ${rank >= 4 ? 600 : 500} ${size}px ${SERIF}`;
        const text = r.city.name;
        const tw = this.measure(text, ctx.font);
        const lx = row.tx + row.halfW + 4;
        const ly = row.ty - (rank >= 3 ? 3 : 1) * k;
        const rect: [number, number, number, number] = [lx - 2, ly - size * 0.62, lx + tw + 3, ly + size * 0.42];
        if (!forced && hits(rect)) continue;
        placed.push(rect);
        ctx.globalAlpha = r.visibility === 'remembered' ? 0.75 : 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = alpha(PAPER_LIGHT, 0.92);
        ctx.lineWidth = 3;
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = INK_2;
        ctx.fillText(text, lx, ly);
        ctx.globalAlpha = 1;
      }
    }

    // Under the name: what the region holds, sector by sector. A row that would run into
    // another region's name is dropped rather than overprinted.
    const ck = clamp(k, 0.9, 1.3);
    for (const row of order) {
      const r = row.p.r;
      const forced = r.id === ov.selected || r.id === ov.hovered;
      const under = labelled.get(row);
      if (mode === 'resources') {
        this.drawResources(row.p, row.x, row.labelY + (under !== undefined ? 11 : -3), k, placed, forced);
        continue;
      }
      // Top of the row: just clear of the name, or where the name would have been.
      const top = under !== undefined ? under + 2.5 : row.labelY - 8;
      const use = row.p.use;
      if (!use || mode === 'population') continue;
      if (mode === 'construction') {
        const w = 58 * ck, h = 7 * ck;
        const base = top + h / 2 + 2;
        const rect: [number, number, number, number] = [row.x - w / 2 - 3, top, row.x + w / 2 + 26 * ck, base + h / 2 + (use.building.levels > 0 ? 20 * ck : 3)];
        if (!forced && hits(rect)) continue;
        placed.push(rect);
        this.drawSectorBar(use, row.x - w / 2, base - h / 2, w, h, ck);
        if (use.building.levels > 0) {
          drawChip(ctx, { glyph: 'build', color: BUILD_AMBER, magnitude: 4, label: '+' + use.building.levels }, row.x - w / 2 + 8 * ck, base + h / 2 + 11 * ck, ck * 0.82);
        }
        continue;
      }
      const chips = sectorChips(use, s < 1.05 && !forced);
      if (!chips.length) continue;
      const gap = 3 * ck;
      let w = -gap;
      for (const c of chips) w += chipRadius(c.magnitude, ck) * 2 + gap + (c.label ? 16 * ck : 0);
      let rmax = 0;
      for (const c of chips) rmax = Math.max(rmax, chipRadius(c.magnitude, ck));
      const base = top + rmax + 1;
      const rect: [number, number, number, number] = [row.x - w / 2 - 2, top, row.x + w / 2 + 2, base + rmax + 2];
      if (!forced && hits(rect)) continue;
      placed.push(rect);
      let cx = row.x - w / 2;
      for (const c of chips) {
        const rad = chipRadius(c.magnitude, ck);
        const used = drawChip(ctx, c, cx + rad, base, ck);
        cx += Math.max(used, rad * 2 + (c.label ? 16 * ck : 0)) + gap;
      }
    }

    // Armies: own formations by dominant role, foreign sightings as dotted diamonds.
    // At most three markers stand side by side; the rest of a stack is counted ("+N").
    const MAX_MARKERS = 3;
    const perRegion = new Map<number, number>();
    const slot = (region: number): number => {
      const n = perRegion.get(region) ?? 0;
      perRegion.set(region, n + 1);
      return n;
    };
    for (const a of showArmies ? d.armies : []) {
      const p = this.byId.get(a.region);
      if (!p) continue;
      const [x, y] = this.worldToScreen(this.nearView(p.sx), p.sy);
      const i = slot(a.region);
      if (i >= MAX_MARKERS) continue;
      let role: Role = 'assault';
      let best = -1;
      let total = 0;
      for (const [ro, n] of a.soldiers) {
        total += n;
        if (n > best) { best = n; role = ro; }
      }
      // a formation is 1,000 to 5,000,000 soldiers (units-and-scale §3): the marker grows from 1,000 to 1,000,000
      const rad = (6.5 + clamp(Math.log10(Math.max(1000, total)) - 3, 0, 3) * 0.9) * k;
      this.drawArmy(role, x + (20 + i * 17) * k, y - 17 * k, rad, this.colorOf(d.mySeat), {
        training: a.training_months_left > 0, battle: a.in_battle, lowSupply: a.supply_bp < 5000,
      });
    }
    for (const a of showArmies ? d.foreignArmies : []) {
      const p = this.byId.get(a.region);
      if (!p) continue;
      const [x, y] = this.worldToScreen(this.nearView(p.sx), p.sy);
      const i = slot(a.region);
      if (i >= MAX_MARKERS) continue;
      const stale = d.month - a.observed_month > 12;
      this.drawForeignArmy(x + (20 + i * 17) * k, y - 17 * k, 7.5 * k, this.colorOf(a.owner), stale);
    }
    for (const [region, n] of perRegion) {
      if (n <= MAX_MARKERS) continue;
      const p = this.byId.get(region);
      if (!p) continue;
      const [x, y] = this.worldToScreen(this.nearView(p.sx), p.sy);
      const lx = x + (20 + MAX_MARKERS * 17 - 6) * k, ly = y - 17 * k;
      ctx.font = `700 ${Math.round(10.5 * clamp(k, 0.9, 1.3))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = alpha(PAPER_LIGHT, 0.95);
      ctx.strokeText('+' + (n - MAX_MARKERS), lx, ly);
      ctx.fillStyle = INK;
      ctx.fillText('+' + (n - MAX_MARKERS), lx, ly);
    }
  }

  /** Text width with a small cache (labels are measured every frame). */
  private measureCache = new Map<string, number>();
  private measure(text: string, font: string): number {
    const key = font + '|' + text;
    let w = this.measureCache.get(key);
    if (w === undefined) {
      w = this.ctx.measureText(text).width;
      if (this.measureCache.size > 4000) this.measureCache.clear();
      this.measureCache.set(key, w);
    }
    return w;
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
    return kind === 'camp' ? 8 : kind === 'village' ? 9 : kind === 'town' ? 17 : kind === 'city' ? 20 : kind === 'megalopolis' ? 36 : 28;
  }
  private settlementHalfWidth(kind: SettlementKind): number {
    return kind === 'camp' ? 11 : kind === 'village' ? 13 : kind === 'town' ? 16 : kind === 'city' ? 21 : kind === 'megalopolis' ? 31 : 25;
  }

  private drawSettlement(kind0: SettlementKind, x: number, y: number, k0: number, roof: string, faded: boolean, era = 0): void {
    const ctx = this.ctx;
    // An industrial-age city is drawn as a smaller skyline rather than a walled town; a
    // megalopolis as a larger one.
    const kind: SettlementKind = (era >= 3 && kind0 === 'city') || kind0 === 'megalopolis' ? 'metropolis' : kind0;
    const k = kind0 === 'megalopolis' ? k0 * 1.24 : kind !== kind0 ? k0 * 0.8 : k0;
    const modernTown = era >= 3 && kind === 'town';
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
    if (modernTown) {
      // Flat-roofed blocks: a town of the machine age.
      for (const [bx, w, h] of [[-14, 6, 6], [-7.5, 5, 10], [-2, 6.5, 7.5], [5, 5, 12], [10.5, 5.5, 6.5]] as [number, number, number][]) {
        block(bx, 0, w, h, wall);
        ctx.fillStyle = roof;
        ctx.beginPath();
        ctx.rect(bx, -h, w, 1.8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
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

  /** Built levels by sector as one stacked bar, with the total beside it. */
  private drawSectorBar(use: LandUse, x: number, y: number, w: number, h: number, k: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = alpha(PAPER_LIGHT, 0.95);
    ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
    let cx = x;
    if (use.total > 0) {
      for (const sec of SECTORS) {
        const v = use.sectors[sec];
        if (v <= 0) continue;
        const sw = (v / use.total) * w;
        ctx.fillStyle = SECTOR_COLOR[sec];
        ctx.fillRect(cx, y, sw, h);
        // A hairline of paper between segments keeps neighbours apart.
        ctx.fillStyle = PAPER_LIGHT;
        ctx.fillRect(cx + sw - 0.6, y, 0.6, h);
        cx += sw;
      }
    }
    ctx.strokeStyle = alpha(INK, 0.8);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    ctx.font = `700 ${Math.round(10.5 * k)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = alpha(PAPER_LIGHT, 0.95);
    ctx.strokeText(String(use.total), x + w + 5, y + h / 2 + 0.5);
    ctx.fillStyle = INK;
    ctx.fillText(String(use.total), x + w + 5, y + h / 2 + 0.5);
  }

  /** Deposits (from the viewer's own survey), then site bonuses and spice land, then two bars. */
  private drawResources(p: Prep, x: number, y: number, k: number, placed: [number, number, number, number][], forced: boolean): void {
    const ctx = this.ctx;
    const sv = p.r.survey;
    if (!sv) return;
    const kk = clamp(k, 0.85, 1.25);
    const deps = sv.deposits.slice(0, 6);
    const bonus: (Bonus | 'spice')[] = (sv.bonuses ?? []).map((b) => b.kind);
    if ((sv.spice_land ?? 0) > 0) bonus.push('spice');
    const step = 17 * kk;
    const bars = this.scale >= 0.5;
    const rowsH = (deps.length ? 14 * kk : 0) + (bonus.length && this.scale >= 0.62 ? 15 * kk : 0) + (bars ? 10 * kk : 0);
    const wMax = Math.max(deps.length, bonus.length, 2) * step;
    // (The top edge sits just under the region's own name, which it may touch but not cross.)
    const rect: [number, number, number, number] = [x - wMax / 2, y - 3, x + wMax / 2, y - 5 * kk + rowsH];
    if (!forced && placed.some((q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1])) return;
    placed.push(rect);
    let ix = x - ((deps.length - 1) * step) / 2;
    for (const dpz of deps) {
      drawDepositPicto(ctx, dpz.kind, ix, y + 1, 6.2 * kk, dpz.epistemic === 'verified');
      ix += step;
    }
    let by = y + (deps.length ? 14 * kk : 0);
    if (bonus.length && this.scale >= 0.62) {
      let bx = x - ((bonus.length - 1) * step) / 2;
      for (const b of bonus) {
        drawBonusPicto(ctx, b, bx, by + 1, 6.4 * kk);
        bx += step;
      }
      by += 13 * kk;
    }
    if (!bars) return;
    // Arable and water hints as two short bars.
    const bw = 26 * kk;
    const hints: [number, string][] = [[clamp(sv.arable / 60, 0.04, 1), '#6f8f3a'], [clamp(sv.water / 4500, 0.04, 1), RIVER]];
    hints.forEach(([v, col], i) => {
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
  drawDepositPicto(ctx, kind, x, y, r, verified);
}
