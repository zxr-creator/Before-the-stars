// Shared pictograms for both map tiers and the legend: deposits, site bonuses,
// spice land, natural harbours and epidemics. Every shape is an original SVG path in a
// 20-unit box centred on the origin, so one definition draws on a Canvas 2D context
// (through Path2D), in the 3D tier's badge canvases and as inline SVG in the legend.
import type { Bonus, Deposit } from '../protocol';

export const PICTO_PAPER = '#f7f1e1';
export const PICTO_INK = '#2b2620';

export const DEPOSIT_COLOR: Record<Deposit, string> = {
  copper_ore: '#b9743a',
  iron_ore: '#5d6470',
  coal: '#2a2724',
  crude: '#4a3526',
  tin: '#8f979f',
  salt: '#e4e0d4',
  saltpetre: '#c3b48c',
  precious: '#c9a227',
  gas: '#5a8aa8',
  bauxite: '#a8573a',
  uranium_ore: '#7a9a3a',
  rare_earths: '#6d5ca8',
  lithium: '#8fb3c4',
  cobalt_nickel: '#3f6c95',
  quartz: '#5c9c94',
  volatiles: '#6aa8d0',
  helium3: '#a0b8e0',
};

export interface PictoDef {
  /** Silhouette, filled with the kind's colour (or paper when not verified). */
  d: string;
  /** Optional inner mark, stroked in ink (or the kind's colour when not verified). */
  mark?: string;
  /** Fill rule for the silhouette. */
  evenodd?: boolean;
}

/** Deposit silhouettes: one distinct outline per kind. The first four keep their old shapes. */
export const DEPOSIT_PICTO: Record<Deposit, PictoDef> = {
  copper_ore: { d: 'M10 0A10 10 0 1 1-10 0A10 10 0 1 1 10 0Z' },
  iron_ore: { d: 'M-8.8-8.8H8.8V8.8H-8.8Z' },
  coal: { d: 'M0-11.5 11.5 0 0 11.5-11.5 0Z' },
  crude: { d: 'M0-12.5C15 2 8 11 0 11S-15 2 0-12.5Z' },
  // An ingot with its top face.
  tin: { d: 'M-11.5 6.5-7.5-6H7.5L11.5 6.5Z', mark: 'M-6.2-2.2H6.2' },
  // A cube of rock salt.
  salt: { d: 'M0-11 9.5-5.5V5.5L0 11-9.5 5.5V-5.5Z', mark: 'M-9.5-5.5 0 0 9.5-5.5M0 0V11' },
  // A heap of nitre with crystals on it.
  saltpetre: { d: 'M-11.5 7.5C-9-3-4-8.5 0-8.5S9-3 11.5 7.5Z', mark: 'M-4 2.5h.1M2 -1h.1M4.5 4h.1' },
  // A cut gem: four-pointed star.
  precious: { d: 'M0-12.5 3.4-3.4 12.5 0 3.4 3.4 0 12.5-3.4 3.4-12.5 0-3.4-3.4Z' },
  // A flame.
  gas: { d: 'M0-12.5C6.5-6 10-1 8.8 4A8.8 8.8 0 0 1-8.8 4C-9.8-.5-6-4.5-3.6-7.5C-2.8-3.6-1.2-2.4.4-3.4C1.8-6 1.2-9.4 0-12.5Z' },
  // Two red-earth pebbles.
  bauxite: { d: 'M2.6 1.5A6.8 6.8 0 1 1-11 1.5A6.8 6.8 0 1 1 2.6 1.5ZM11-3A5.6 5.6 0 1 1-.2-3A5.6 5.6 0 1 1 11-3Z' },
  // A pitchblende lump: a triangle with a core.
  uranium_ore: { d: 'M0-11.5 11 8.5H-11Z', mark: 'M0 2.2h.1' },
  // A pentagon of mixed ore.
  rare_earths: { d: 'M0-11.5 11-3.4 6.8 9.6H-6.8L-11-3.4Z' },
  // A cell with its cap (brines yield the battery metal).
  lithium: { d: 'M-6.2-8.6H6.2V11H-6.2ZM-2.8-12H2.8V-8.6H-2.8Z', mark: 'M-3 2.6H3M0-.4V5.6' },
  // A washer: the ring of a hard metal.
  cobalt_nickel: { d: 'M10.5 0A10.5 10.5 0 1 1-10.5 0A10.5 10.5 0 1 1 10.5 0ZM4 0A4 4 0 1 0-4 0A4 4 0 1 0 4 0Z', evenodd: true },
  // A long crystal.
  quartz: { d: 'M0-12.5 5.6-6.2V8L0 12.5-5.6 8V-6.2Z', mark: 'M0-12.5V12.5' },
  // An ice star.
  volatiles: { d: 'M0-12.5 2.6-4.5 10.8-6.2 5.2 0 10.8 6.2 2.6 4.5 0 12.5-2.6 4.5-10.8 6.2-5.2 0-10.8-6.2-2.6-4.5Z' },
  // A crescent: the regolith that holds it.
  helium3: { d: 'M3.5-11.5A11.5 11.5 0 1 0 3.5 11.5A9 9 0 1 1 3.5-11.5Z' },
};

/** Marks of the site bonuses, drawn on a small paper token. */
export const BONUS_PICTO: Record<Bonus | 'spice', { stroke?: string; fill?: string; d: string; color: string }> = {
  floodplain: { d: 'M-7.5-3.5c2-2 3.2 2 5 0s3.2 2 5 0 3 2 5 0M-7.5 1.5c2-2 3.2 2 5 0s3.2 2 5 0 3 2 5 0M-7 6.5H7', stroke: '#2f6f93', color: '#2f6f93' },
  fish_banks: { d: 'M-8.5 0C-4.5-6 2.5-6 5 0C2.5 6-4.5 6-8.5 0ZM5 0 9.5-4.2V4.2Z', fill: '#3f86a8', color: '#2f6f93' },
  wild_herds: { d: 'M0 8.5V-.5M0-.5-4.8-5.5M-4.8-5.5-7.2-9M-4.8-5.5-2.2-9.2M0-.5 4.8-5.5M4.8-5.5 7.2-9M4.8-5.5 2.2-9.2M-3.4 3.2 0 6 3.4 3.2', stroke: '#7a5530', color: '#7a5530' },
  old_growth: { d: 'M0-9.5 6.5 0H3.2L7.5 5.5H-7.5L-3.2 0H-6.5ZM0 5.5V9.5', fill: '#3d6e34', color: '#3d6e34' },
  rich_pasture: { d: 'M-6.5 8C-6.5 2.5-5-1.5-8-5.5M-2.2 8C-2.2 1.5-.4-2.5-1.4-8M2.2 8C3 2.5 4.2-1.5 7.5-5.5M6.5 8C6.5 4.5 7.2 2.5 9 .8', stroke: '#5f7a2a', color: '#5f7a2a' },
  // A spice pod with its seeds.
  spice: { d: 'M-8.5 7.5C-8.5-2.5-2.5-8.5 8.5-8.5C8.5 1.5 2.5 7.5-8.5 7.5ZM-8.5 7.5 3.5-3.5', fill: '#a8562c', color: '#8a3f1c' },
};

export const BONUS_KINDS: Bonus[] = ['floodplain', 'fish_banks', 'wild_herds', 'old_growth', 'rich_pasture'];

/** A ship's anchor, the mark of a natural harbour. */
export const ANCHOR_D = 'M0-8.5A2.2 2.2 0 1 1 0-4.1A2.2 2.2 0 1 1 0-8.5ZM0-4.1V8.5M-4.2-1.4H4.2M-7.5 2.2C-6.5 6.8-3.5 8.5 0 8.5S6.5 6.8 7.5 2.2M-7.5 2.2-9.2 4.2M7.5 2.2 9.2 4.2';
export const HARBOUR_COLOR = '#2c4f63';

/** Epidemic seal: a muted plum disc; the band (1..3) is told by its dots, not by alarm colours. */
export const OUTBREAK_COLOR = '#7b4f78';
export const OUTBREAK_RING = '#e9dcc8';

/** Fallback for a deposit kind this build does not know (older saves: "minerals"). */
const UNKNOWN_PICTO: PictoDef = { d: 'M0-11 9.5-5.5V5.5L0 11-9.5 5.5V-5.5Z' };
const UNKNOWN_COLOR = '#8a7d6a';
export function depositPicto(kind: Deposit): PictoDef {
  return DEPOSIT_PICTO[kind] ?? UNKNOWN_PICTO;
}
export function depositColor(kind: Deposit): string {
  return DEPOSIT_COLOR[kind] ?? UNKNOWN_COLOR;
}

const pathCache = new Map<string, Path2D>();
function path2d(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); pathCache.set(d, p); }
  return p;
}

/**
 * A deposit pictogram of radius ~r at (x, y): filled when verified, hollow with a dotted
 * rim in the kind's colour when reported or estimated.
 */
export function drawDepositPicto(ctx: CanvasRenderingContext2D, kind: Deposit, x: number, y: number, r: number, verified: boolean, halo = true): void {
  const def = depositPicto(kind);
  const col = depositColor(kind);
  const k = r / 10;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const p = path2d(def.d);
  const rule: CanvasFillRule = def.evenodd ? 'evenodd' : 'nonzero';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (verified && halo) {
    ctx.strokeStyle = PICTO_PAPER;
    ctx.lineWidth = 2.6 / k;
    ctx.stroke(p);
  }
  ctx.fillStyle = verified ? col : 'rgba(247,241,225,0.92)';
  ctx.fill(p, rule);
  ctx.strokeStyle = verified ? PICTO_INK : col;
  ctx.lineWidth = (verified ? 1 : 1.6) / k;
  if (!verified) ctx.setLineDash([0.1 / k, 2.7 / k]);
  ctx.stroke(p);
  ctx.setLineDash([]);
  if (def.mark) {
    ctx.strokeStyle = verified ? (kind === 'salt' || kind === 'lithium' || kind === 'helium3' ? alphaInk(0.7) : 'rgba(247,241,225,0.9)') : col;
    ctx.lineWidth = (def.mark.includes('h.1') ? 2.6 : 1.1) / k;
    ctx.stroke(path2d(def.mark));
  }
  ctx.restore();
}

function alphaInk(a: number): string {
  return `rgba(43,38,32,${a})`;
}

/** A bonus token: a small rounded paper square with the bonus's mark. */
export function drawBonusPicto(ctx: CanvasRenderingContext2D, kind: Bonus | 'spice', x: number, y: number, r: number): void {
  const def = BONUS_PICTO[kind];
  const k = r / 10;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.roundRect(-10.5, -10.5, 21, 21, 4.5);
  ctx.fillStyle = PICTO_PAPER;
  ctx.fill();
  ctx.lineWidth = 1.1 / k;
  ctx.strokeStyle = def.color;
  ctx.stroke();
  const p = path2d(def.d);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.scale(0.82, 0.82);
  if (def.fill) {
    ctx.fillStyle = def.fill;
    ctx.fill(p);
    ctx.lineWidth = 0.9 / k;
    ctx.strokeStyle = def.color;
    ctx.stroke(p);
  } else {
    ctx.strokeStyle = def.stroke ?? def.color;
    ctx.lineWidth = 1.5 / k / 0.82;
    ctx.stroke(p);
  }
  ctx.restore();
  ctx.restore();
}

/** Anchor mark for a natural harbour, on a pale disc so it reads on land and sea alike. */
export function drawAnchor(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, faded = false): void {
  const k = r / 10;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(247,241,225,0.92)';
  ctx.fill();
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = faded ? 'rgba(44,79,99,0.5)' : HARBOUR_COLOR;
  ctx.stroke();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6 / k;
  ctx.stroke(path2d(ANCHOR_D));
  ctx.restore();
}

/** Epidemic seal of radius ~r; `band` 1 (mild) to 3 (severe) shows as one to three dots. */
export function drawOutbreakSeal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, band: number, faded = false): void {
  const b = Math.max(1, Math.min(3, Math.round(band)));
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= faded ? 0.7 : 1;
  ctx.beginPath();
  ctx.arc(0, 0, r + 1.6, 0, Math.PI * 2);
  ctx.fillStyle = OUTBREAK_RING;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = OUTBREAK_COLOR;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(43,38,32,0.75)';
  ctx.stroke();
  // A thin inner ring: a seal, not a warning light.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(247,241,225,0.55)';
  ctx.lineWidth = Math.max(0.7, r * 0.09);
  ctx.stroke();
  ctx.fillStyle = OUTBREAK_RING;
  const dot = Math.max(1.1, r * 0.2);
  const pts: [number, number][] = b === 1 ? [[0, 0]] : b === 2 ? [[-r * 0.3, 0], [r * 0.3, 0]] : [[0, -r * 0.3], [-r * 0.32, r * 0.22], [r * 0.32, r * 0.22]];
  for (const [px, py] of pts) {
    ctx.beginPath();
    ctx.arc(px, py, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A raider camp: a tent with a dark pennant, in red-brown so it never reads as a settlement. */
export function drawCampMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, faded = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= faded ? 0.65 : 1;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 1.1, r * 0.7);
  ctx.lineTo(-r * 1.1, r * 0.7);
  ctx.closePath();
  ctx.fillStyle = faded ? '#a58a7c' : '#8d3a26';
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(43,38,32,0.85)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, r * 0.7);
  ctx.lineTo(0, -r * 0.1);
  ctx.strokeStyle = 'rgba(247,241,225,0.75)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(0, -r * 1.7);
  ctx.lineTo(r * 0.7, -r * 1.45);
  ctx.lineTo(0, -r * 1.2);
  ctx.strokeStyle = 'rgba(43,38,32,0.85)';
  ctx.fillStyle = '#2b2620';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Inline SVG markup of a deposit pictogram, for HTML labels and the legend. */
export function depositSvg(kind: Deposit, verified = true, size = 16): string {
  const def = depositPicto(kind);
  const col = depositColor(kind);
  const fill = verified ? col : PICTO_PAPER;
  const stroke = verified ? PICTO_INK : col;
  const dash = verified ? '' : ' stroke-dasharray="0.1 3.4" stroke-linecap="round"';
  const markCol = verified ? (kind === 'salt' || kind === 'lithium' || kind === 'helium3' ? 'rgba(43,38,32,0.7)' : 'rgba(247,241,225,0.9)') : col;
  const mark = def.mark ? `<path d="${def.mark}" fill="none" stroke="${markCol}" stroke-width="${def.mark.includes('h.1') ? 3 : 1.4}" stroke-linecap="round"/>` : '';
  return `<svg viewBox="-13 -13 26 26" width="${size}" height="${size}" aria-hidden="true"><path d="${def.d}" fill="${fill}"${def.evenodd ? ' fill-rule="evenodd"' : ''} stroke="${stroke}" stroke-width="${verified ? 1.3 : 2}" stroke-linejoin="round"${dash}/>${mark}</svg>`;
}

/** Inline SVG markup of a bonus token. */
export function bonusSvg(kind: Bonus | 'spice', size = 16): string {
  const def = BONUS_PICTO[kind];
  const body = def.fill
    ? `<path d="${def.d}" fill="${def.fill}" stroke="${def.color}" stroke-width="1" stroke-linejoin="round" transform="scale(0.82)"/>`
    : `<path d="${def.d}" fill="none" stroke="${def.stroke ?? def.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="scale(0.82)"/>`;
  return `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}" aria-hidden="true"><rect x="-10.5" y="-10.5" width="21" height="21" rx="4.5" fill="${PICTO_PAPER}" stroke="${def.color}" stroke-width="1.2"/>${body}</svg>`;
}

export function anchorSvg(size = 16): string {
  return `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}" aria-hidden="true"><circle r="10.5" fill="${PICTO_PAPER}" stroke="${HARBOUR_COLOR}" stroke-width="1.2"/><path d="${ANCHOR_D}" fill="none" stroke="${HARBOUR_COLOR}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function outbreakSvg(band: number, size = 16): string {
  const b = Math.max(1, Math.min(3, Math.round(band)));
  const r = 8;
  const pts = b === 1 ? [[0, 0]] : b === 2 ? [[-2.4, 0], [2.4, 0]] : [[0, -2.4], [-2.6, 1.8], [2.6, 1.8]];
  const dots = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="${OUTBREAK_RING}"/>`).join('');
  return `<svg viewBox="-11 -11 22 22" width="${size}" height="${size}" aria-hidden="true"><circle r="${r + 1.6}" fill="${OUTBREAK_RING}"/><circle r="${r}" fill="${OUTBREAK_COLOR}" stroke="rgba(43,38,32,0.75)" stroke-width="1"/><circle r="${r * 0.72}" fill="none" stroke="rgba(247,241,225,0.55)" stroke-width="0.8"/>${dots}</svg>`;
}
