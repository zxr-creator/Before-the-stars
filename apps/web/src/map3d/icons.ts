// Original icon set for the 3D map, drawn on canvases at run time: round resource
// badges, round army standards with a role emblem and strength bar, and the small
// inline glyphs used by the HTML yield chips. Estimated values never look like
// verified ones: they get a dashed rim, a paler face and a query mark.
import type { Deposit, Role } from '../protocol';
import { hexRgb, mixRgb, rgbCss, type RGB } from './util';

const INK = '#2f2419';
const CREAM = '#fbf3dc';

const BADGE: Record<Deposit, { face: string; rim: string }> = {
  copper_ore: { face: '#f7c690', rim: '#8a4718' },
  iron_ore: { face: '#cdd8e4', rim: '#3d4a5c' },
  coal: { face: '#e6d7b4', rim: '#2a2622' },
  crude: { face: '#f3d568', rim: '#3a2a14' },
  minerals: { face: '#decff7', rim: '#4d3a8a' },
};

function glyph(ctx: CanvasRenderingContext2D, kind: Deposit): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  const poly = (pts: number[], fill: string) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) { if (i === 0) ctx.moveTo(pts[i], pts[i + 1]); else ctx.lineTo(pts[i], pts[i + 1]); }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  switch (kind) {
    case 'copper_ore': {
      // A faceted nugget.
      poly([-26, 6, -14, -20, 12, -26, 28, -6, 20, 20, -8, 24], '#c9682c');
      poly([-14, -20, 12, -26, 4, -4, -12, 0], '#e8904a');
      poly([4, -4, 28, -6, 20, 20, 2, 12], '#a9521f');
      ctx.fillStyle = '#ffe2bd';
      ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(0, -17); ctx.lineTo(-1, -9); ctx.closePath(); ctx.fill();
      break;
    }
    case 'iron_ore': {
      // Three stacked bars.
      const bar = (x: number, y: number, c1: string, c2: string) => {
        poly([x - 16, y + 8, x - 11, y - 6, x + 15, y - 6, x + 20, y + 8], c1);
        poly([x - 11, y - 6, x - 6, y - 12, x + 20, y - 12, x + 15, y - 6], c2);
      };
      bar(-13, 14, '#6b7888', '#93a1b2');
      bar(13, 14, '#5f6c7c', '#8997a8');
      bar(0, -6, '#74828f', '#a3b0be');
      break;
    }
    case 'coal': {
      poly([-26, 16, -18, -4, -2, -8, 6, 14, -8, 22], '#2b2826');
      poly([0, 18, 6, -6, 22, -10, 28, 10, 18, 22], '#1f1d1c');
      poly([-12, -4, -6, -24, 12, -26, 16, -8, 2, -2], '#3a3633');
      ctx.fillStyle = '#7c746c';
      ctx.beginPath(); ctx.moveTo(-3, -20); ctx.lineTo(7, -22); ctx.lineTo(2, -13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8622a';
      ctx.beginPath(); ctx.arc(13, 13, 3.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'crude': {
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.bezierCurveTo(26, 2, 22, 26, 0, 26);
      ctx.bezierCurveTo(-22, 26, -26, 2, 0, -30);
      ctx.closePath();
      ctx.fillStyle = '#1d1712';
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#b9a98c';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 6, 12, Math.PI * 0.62, Math.PI * 0.98); ctx.stroke();
      break;
    }
    default: {
      // A cluster of three crystals.
      poly([-6, 24, -12, -8, -2, -28, 8, -8, 4, 24], '#8d6fd8');
      poly([-2, -28, 8, -8, 4, 24, -1, 24], '#6c50b8');
      poly([-24, 24, -27, 4, -19, -8, -11, 4, -10, 24], '#a58ae6');
      poly([10, 24, 12, 2, 20, -10, 27, 4, 24, 24], '#7a5ecb');
      break;
    }
  }
}

/** Badge canvas for a deposit: 128 × 156 with the pointer at the bottom centre. */
export function depositBadge(kind: Deposit, verified: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 156;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const pal = BADGE[kind];
  const face = verified ? pal.face : rgbCss(mixRgb(hexRgb(pal.face), [0.97, 0.94, 0.86], 0.6));
  const cx = 64, cy = 62, R = 52;
  // Drop shadow, pointer, disc.
  ctx.fillStyle = 'rgba(40,25,10,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, 150, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 17, cy + R - 10); ctx.lineTo(cx, 149); ctx.lineTo(cx + 17, cy + R - 10); ctx.closePath();
  ctx.fillStyle = pal.rim; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = face; ctx.fill();
  const grad = ctx.createRadialGradient(cx - 16, cy - 20, 6, cx, cy, R);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(60,30,0,0.16)');
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = pal.rim;
  if (!verified) ctx.setLineDash([11, 9]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(cx, cy, R - 7, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy + 1);
  ctx.scale(1.12, 1.12);
  if (!verified) ctx.globalAlpha = 0.72;
  glyph(ctx, kind);
  ctx.restore();
  if (!verified) {
    ctx.beginPath(); ctx.arc(cx + 38, cy - 38, 15, 0, Math.PI * 2);
    ctx.fillStyle = CREAM; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = pal.rim; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = INK;
    ctx.font = 'bold 22px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx + 38, cy - 37);
  }
  return c;
}

export interface StandardSpec {
  color: string;
  /** null = a sighted foreign formation whose composition is not known. */
  role: Role | null;
  tier: number | null;
  /** 0..1 fill of the strength bar; `hi` extends it as an estimate. */
  strength: number;
  strengthHi?: number;
  training?: boolean;
  battle?: boolean;
  lowSupply?: boolean;
  stale?: boolean;
  count?: number;
}

export function standardKey(s: StandardSpec): string {
  return [s.color, s.role, s.tier, Math.round(s.strength * 20), Math.round((s.strengthHi ?? 0) * 20), s.training ? 1 : 0, s.battle ? 1 : 0, s.lowSupply ? 1 : 0, s.stale ? 1 : 0, s.count ?? 1].join('|');
}

/** Round army standard: 160 × 208, anchored at the bottom centre. */
export function armyStandard(s: StandardSpec): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 208;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const cx = 80, cy = 76, R = 56;
  const base: RGB = hexRgb(s.color);
  const face = s.role === null ? mixRgb(base, [0.97, 0.94, 0.86], 0.28) : s.training ? mixRgb(base, [0.97, 0.94, 0.86], 0.5) : base;
  const dark = rgbCss(mixRgb(base, [0.1, 0.07, 0.05], 0.62));
  if (s.stale) ctx.globalAlpha = 0.66;
  if (s.battle) {
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (Math.PI / 10) * i, rr = i % 2 ? R + 6 : R + 20;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd36a'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#c0321f'; ctx.stroke();
  }
  // Pole stub and the hanging tab that carries the tier.
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 3, cy + R - 4, 6, 76);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = rgbCss(face); ctx.fill();
  const grad = ctx.createRadialGradient(cx - 18, cy - 22, 6, cx, cy, R);
  grad.addColorStop(0, 'rgba(255,255,255,0.4)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = dark;
  if (s.training || s.role === null) ctx.setLineDash(s.role === null ? [4, 8] : [12, 8]);
  ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,248,225,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, R - 8, 0, Math.PI * 2); ctx.stroke();
  // Emblem.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = CREAM; ctx.fillStyle = CREAM;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.role === 'assault') {
    // Two crossed blades.
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-24, 24); ctx.lineTo(24, -24); ctx.moveTo(24, 24); ctx.lineTo(-24, -24); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-28, 10); ctx.lineTo(-10, 28); ctx.moveTo(28, 10); ctx.lineTo(10, 28); ctx.stroke();
  } else if (s.role === 'maneuver') {
    // A forward double chevron.
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(0, 0); ctx.lineTo(-24, 24); ctx.moveTo(2, -24); ctx.lineTo(26, 0); ctx.lineTo(2, 24); ctx.stroke();
  } else if (s.role === 'denial') {
    // A crenellated tower.
    ctx.beginPath();
    ctx.moveTo(-22, 28); ctx.lineTo(-22, -10); ctx.lineTo(-28, -10); ctx.lineTo(-28, -28); ctx.lineTo(-14, -28); ctx.lineTo(-14, -18);
    ctx.lineTo(-7, -18); ctx.lineTo(-7, -28); ctx.lineTo(7, -28); ctx.lineTo(7, -18); ctx.lineTo(14, -18); ctx.lineTo(14, -28);
    ctx.lineTo(28, -28); ctx.lineTo(28, -10); ctx.lineTo(22, -10); ctx.lineTo(22, 28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgbCss(face);
    ctx.beginPath(); ctx.moveTo(-8, 28); ctx.lineTo(-8, 10); ctx.arc(0, 10, 8, Math.PI, 0); ctx.lineTo(8, 28); ctx.closePath(); ctx.fill();
  } else {
    // A pennant: a formation was seen here, composition unknown.
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-14, 30); ctx.lineTo(-14, -30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(28, -15); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Tier tab.
  if (s.tier != null) {
    ctx.beginPath();
    ctx.moveTo(cx - 19, cy + R - 12); ctx.lineTo(cx + 19, cy + R - 12); ctx.lineTo(cx + 19, cy + R + 22); ctx.lineTo(cx, cy + R + 31); ctx.lineTo(cx - 19, cy + R + 22);
    ctx.closePath();
    ctx.fillStyle = CREAM; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = dark; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = 'bold 27px Georgia, "Iowan Old Style", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(s.tier), cx, cy + R + 7);
  }
  // Strength bar.
  const bw = 112, bh = 15, bx = cx - bw / 2, by = 182;
  ctx.fillStyle = 'rgba(30,20,10,0.85)';
  ctx.beginPath(); ctx.roundRect(bx - 3, by - 3, bw + 6, bh + 6, 6); ctx.fill();
  ctx.fillStyle = '#5a4c3a';
  ctx.fillRect(bx, by, bw, bh);
  const lo = Math.max(0.05, Math.min(1, s.strength));
  if (s.strengthHi !== undefined && s.strengthHi > s.strength) {
    const hi = Math.min(1, s.strengthHi);
    ctx.fillStyle = '#b9c79a';
    ctx.fillRect(bx, by, bw * hi, bh);
    ctx.save();
    ctx.beginPath(); ctx.rect(bx + bw * lo, by, bw * (hi - lo), bh); ctx.clip();
    ctx.strokeStyle = '#5a4c3a'; ctx.lineWidth = 3;
    for (let x = bx - 20; x < bx + bw + 20; x += 8) { ctx.beginPath(); ctx.moveTo(x, by + bh + 2); ctx.lineTo(x + 14, by - 2); ctx.stroke(); }
    ctx.restore();
  }
  ctx.fillStyle = s.role === null ? '#d9e5b5' : '#8fd15a';
  ctx.fillRect(bx, by, bw * lo, bh);
  if (s.lowSupply) {
    ctx.beginPath(); ctx.arc(cx + R - 6, cy - R + 8, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#e8a020'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK; ctx.font = 'bold 20px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', cx + R - 6, cy - R + 9);
  }
  if ((s.count ?? 1) > 1) {
    ctx.beginPath(); ctx.arc(cx - R + 6, cy - R + 8, 15, 0, Math.PI * 2);
    ctx.fillStyle = CREAM; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = dark; ctx.stroke();
    ctx.fillStyle = INK; ctx.font = 'bold 19px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('×' + s.count, cx - R + 6, cy - R + 9);
  }
  return c;
}

/** Inline SVG glyphs for the yield chips (currentColor strokes, 14 px box). */
export const YIELD_SVG: Record<'arable' | 'pasture' | 'fishery' | 'forest' | 'hydro' | 'water', string> = {
  arable: '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M7 13V4M7 6.500 4.200 4.500M7 6.500 9.800 4.500M7 9 4.200 7M7 9 9.800 7M7 4 5.500 1.800M7 4 8.500 1.800" fill="none" stroke="#7a8c1e" stroke-width="1.5" stroke-linecap="round"/></svg>',
  pasture: '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M1.500 5.500h11M1.500 9.500h11M3.500 3v9M7 3v9M10.500 3v9" fill="none" stroke="#8a6a36" stroke-width="1.5" stroke-linecap="round"/></svg>',
  fishery: '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M1.500 7c2-3 5.500-3.200 7.500 0-2 3.200-5.500 3-7.500 0ZM9 7l3.500-2.500v5Z" fill="#3f86a8" stroke="#1f5873" stroke-width="1"/></svg>',
  forest: '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M7 1.200 11 6.500H8.800l3 4H2.200l3-4H3ZM7 10.500V13" fill="#3f8a3a" stroke="#255a24" stroke-width="1" stroke-linejoin="round"/></svg>',
  hydro: '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M1 5c2-2 3 2 5 0s3 2 5 0 1.500 0.500 2 0M1 9.500c2-2 3 2 5 0s3 2 5 0 1.500 0.500 2 0" fill="none" stroke="#2f7fb0" stroke-width="1.6" stroke-linecap="round"/></svg>',
  water: '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M7 1.500C10.500 6 11 8 11 9a4 4 0 0 1-8 0c0-1 0.500-3 4-7.500Z" fill="#4fa3cf" stroke="#1f6a94" stroke-width="1"/></svg>',
};
