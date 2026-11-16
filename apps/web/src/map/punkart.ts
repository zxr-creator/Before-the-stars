// Line art of the ten tradition styles for the flat atlas (ruleset 3.1): the skyline of
// a town, city or metropolis whose owner holds a path, and a small signature motif that
// stands beside its works. Drawn in the atlas's ink-and-wash manner around the origin
// (ground line at y = 0, up is negative), in the same drawing units as the settlements
// of atlas.ts, so the caller's transform and line width apply unchanged. The same
// functions draw the banner of the era screen.
import { PUNK, hexRgb, mixHex, rgba, type PunkLook, type PunkStyle } from './punk';

type Ctx = CanvasRenderingContext2D;

interface Pen {
  c: Ctx;
  L: PunkLook;
  ink: string;
  lw: number;
  /** Lit and in motion: glows, arcs, plumes. False for land that is only remembered. */
  lit: boolean;
}

const INK = '#2b2620';
const INK_3 = '#8a7d6a';
const PAPER = '#f7f1e1';

const FADED = new Map<PunkStyle, PunkLook>();
/** The look washed out to the greys of remembered land. */
function fadedLook(L: PunkLook): PunkLook {
  let f = FADED.get(L.style);
  if (!f) {
    const wash = (hex: string): string => {
      const [r, g, b] = hexRgb(hex);
      const l = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
      const grey = '#' + l.toString(16).padStart(2, '0').repeat(3);
      return mixHex(grey, '#e6e0d2', 0.62);
    };
    f = { ...L, wall: wash(L.wall), wall2: wash(L.wall2), roof: wash(L.roof), roof2: wash(L.roof2), accent: wash(L.accent), glow: wash(L.glow), metal: wash(L.metal), glass: wash(L.glass), ground: wash(L.ground), smoke: wash(L.smoke) };
    FADED.set(L.style, f);
  }
  return f;
}

function rect(c: Ctx, x: number, y: number, w: number, h: number, fill: string, stroke = true): void {
  c.fillStyle = fill;
  c.beginPath();
  c.rect(x, y - h, w, h);
  c.fill();
  if (stroke) c.stroke();
}
function poly(c: Ctx, pts: number[], fill: string | null, stroke = true): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) c.stroke();
}
function circ(c: Ctx, x: number, y: number, r: number, fill: string | null, stroke = true): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) c.stroke();
}
function line(c: Ctx, pts: number[]): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
}
/** Half disc standing on y. */
function dome(c: Ctx, x: number, y: number, r: number, fill: string, squash = 1): void {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, r, r * squash, 0, Math.PI, 0);
  c.closePath();
  c.fill();
  c.stroke();
}
/** Three puffs leaning east. */
function plume(P: Pen, x: number, y: number, r: number, a = 0.88): void {
  if (!P.lit) return;
  const c = P.c;
  c.save();
  c.strokeStyle = 'rgba(43,38,32,0.3)';
  c.fillStyle = rgba(P.L.smoke, a);
  for (const [dx, dy, k] of [[0, 0, 1], [1.2, -1.5, 1.35], [3, -2.6, 1.7]]) {
    c.beginPath();
    c.arc(x + dx * r, y + dy * r, r * k, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.restore();
}
/** Two columns of small windows up a block. */
function windows(P: Pen, x: number, w: number, h: number, fill: string, y0 = 0): void {
  const c = P.c;
  c.fillStyle = fill;
  for (let wy = y0 - h + 2.6; wy < y0 - 2; wy += 3.3) {
    c.fillRect(x + 1.1, wy, 0.95, 1.3);
    if (w > 4) c.fillRect(x + w - 2.05, wy, 0.95, 1.3);
  }
}
/** A cog: `n` square teeth round a disc. */
function cog(c: Ctx, x: number, y: number, r: number, n: number, fill: string, hub: string, rot = 0): void {
  c.fillStyle = fill;
  c.beginPath();
  const steps = n * 4;
  for (let i = 0; i < steps; i++) {
    const a = rot + (i / steps) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r * 0.8;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
  c.stroke();
  circ(c, x, y, r * 0.32, hub);
}
/** A tapered stack with a band. */
function stack(P: Pen, x: number, y: number, h: number, w: number, fill: string, band: string | null): void {
  const c = P.c;
  poly(c, [x - w, y, x - w * 0.62, y - h, x + w * 0.62, y - h, x + w, y], fill);
  if (band) { c.fillStyle = band; c.fillRect(x - w * 0.7, y - h + 1.2, w * 1.4, 0.9); }
}

// --- signature motifs ----------------------------------------------------------------------
// Each stands on (x, y) and is about 8 units wide and 13 tall at scale 1.

function emblem(P: Pen, x: number, y: number, s: number): void {
  const { c, L } = P;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const lw0 = c.lineWidth;
  c.lineWidth = P.lw / s;
  c.strokeStyle = P.ink;
  switch (L.style) {
    case 'steam': {
      // A tall banded stack under dark smoke, and a gasometer in its guide frame.
      plume(P, -1.6, -14.4, 1.5);
      stack(P, -2.4, 0, 13, 1.25, L.roof2, L.accent);
      rect(c, 0.6, 0, 5.4, 4.2, L.metal);
      c.fillStyle = L.accent;
      c.fillRect(0.6, -2.4, 5.4, 0.7);
      line(c, [0.6, -4.2, 0.6, -7.4, 6, -7.4, 6, -4.2]);
      line(c, [3.3, -4.2, 3.3, -7.4]);
      line(c, [0.6, -7.4, 3.3, -4.2, 6, -7.4]);
      break;
    }
    case 'diesel': {
      // A tank farm and a searchlight sweeping the sky.
      if (P.lit) poly(c, [-2.6, -4.4, -6.5, -15, -1.2, -15.6], rgba(L.glow, 0.42), false);
      rect(c, -3.4, 0, 1.6, 4.4, L.metal);
      circ(c, -2.6, -4.9, 1.05, L.glow);
      for (const tx of [0.2, 3.6]) {
        rect(c, tx, 0, 3, 3.4, L.wall);
        dome(c, tx + 1.5, -3.4, 1.5, L.wall2, 0.45);
        c.fillStyle = L.accent;
        c.fillRect(tx, -1.7, 3, 0.6);
      }
      line(c, [-1.8, -1, 0.2, -1]);
      break;
    }
    case 'electric': {
      // A coil mast: lattice, a copper ball, and arcs when it runs.
      line(c, [-1.8, 0, -0.4, -9.4, 0.4, -9.4, 1.8, 0]);
      line(c, [-1.3, -3.2, 1.3, -3.2, -0.9, -6.2, 0.9, -6.2]);
      for (const yy of [-7.4, -8.4]) { c.fillStyle = L.roof; c.beginPath(); c.ellipse(0, yy, 1.8, 0.5, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
      circ(c, 0, -11, 1.7, L.metal);
      if (P.lit) {
        c.save();
        c.strokeStyle = L.glow;
        c.lineWidth = (P.lw / s) * 1.5;
        line(c, [1.4, -11.8, 3.2, -13.4, 2.6, -11.6, 5, -12.6]);
        line(c, [-1.4, -11.8, -3.4, -12.8, -2.4, -10.6, -4.8, -10.4]);
        line(c, [0.2, -12.7, -0.8, -14.4, 0.8, -14.2, 0.2, -16]);
        c.restore();
      }
      break;
    }
    case 'clockwork': {
      // A great brass wheel meshed with a smaller one on a trestle.
      line(c, [-3.4, 0, -0.6, -6, 2.2, 0]);
      cog(c, -0.6, -7, 4.2, 10, L.accent, L.wall, 0.2);
      cog(c, 3.6, -3, 2.1, 7, L.metal, L.wall, 0.5);
      break;
    }
    case 'atomic': {
      // A needle with a ball and two orbits: the googie sign of the age.
      poly(c, [-0.5, 0, 0, -13.6, 0.5, 0], L.wall);
      poly(c, [-2.4, 0, 0, -3.6, 2.4, 0], L.roof2);
      c.save();
      c.strokeStyle = L.accent;
      c.lineWidth = (P.lw / s) * 1.3;
      for (const rot of [0.5, -0.5]) { c.beginPath(); c.ellipse(0, -9, 4.4, 1.5, rot, 0, Math.PI * 2); c.stroke(); }
      c.restore();
      circ(c, 0, -9, 1.25, L.accent);
      break;
    }
    case 'neon': {
      // A dark slab hung with signs.
      if (P.lit) { c.fillStyle = rgba(L.accent, 0.22); c.beginPath(); c.ellipse(0, -7, 5.4, 7.4, 0, 0, Math.PI * 2); c.fill(); }
      rect(c, -2, 0, 4, 12, L.wall);
      line(c, [0.8, -12, 0.8, -15.4]);
      rect(c, -3.6, -4.2, 1.5, 5.6, L.accent);
      rect(c, 2.1, -6.6, 1.5, 3.6, L.glow);
      c.fillStyle = L.glow;
      c.fillRect(-1.2, -2.4, 2.4, 0.7);
      c.fillStyle = L.glass;
      c.fillRect(-1.2, -10.6, 2.4, 0.7);
      break;
    }
    case 'organic': {
      // Culture vats: glass capsules half full, and a leaf.
      for (const [vx, vh] of [[-2.4, 8.6], [2.2, 6.4]]) {
        c.fillStyle = L.glass;
        c.beginPath();
        c.moveTo(vx - 1.9, 0); c.lineTo(vx - 1.9, -vh + 1.9); c.arc(vx, -vh + 1.9, 1.9, Math.PI, 0); c.lineTo(vx + 1.9, 0);
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = L.glow;
        c.fillRect(vx - 1.5, -vh * 0.5, 3, vh * 0.5 - 0.5);
        c.fillStyle = L.metal;
        c.fillRect(vx - 2.2, -0.9, 4.4, 0.9);
      }
      c.fillStyle = L.roof;
      c.beginPath(); c.moveTo(-2.4, -10.2); c.quadraticCurveTo(0.6, -14.6, 3.6, -11.4); c.quadraticCurveTo(0.4, -10, -2.4, -10.2); c.closePath(); c.fill(); c.stroke();
      break;
    }
    case 'chrome': {
      // A mirrored monolith with its drones.
      poly(c, [-1.9, 0, -1.4, -12.6, 1.4, -12.6, 1.9, 0], L.roof2);
      poly(c, [0, 0, 0, -12.6, 1.4, -12.6, 1.9, 0], L.wall2, false);
      c.save(); c.strokeStyle = L.accent; line(c, [-1.5, -9, 1.6, -9]); c.restore();
      for (const [dx, dy] of [[-4.2, -11.4], [4, -8.2], [3.2, -14.2]]) {
        line(c, [dx - 1, dy, dx + 1, dy]);
        circ(c, dx, dy + 0.5, 0.55, P.lit ? L.glow : L.metal);
      }
      break;
    }
    case 'solar': {
      // A sun flower: petals of glass on a stalk, and a small turbine.
      line(c, [-1.6, 0, -1.6, -6.4]);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI + (i + 0.5) * (Math.PI / 5);
        c.fillStyle = i % 2 ? L.roof2 : L.accent;
        c.beginPath(); c.ellipse(-1.6 + Math.cos(a) * 2.6, -7 + Math.sin(a) * 2.6, 2.3, 0.95, a, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      circ(c, -1.6, -7, 1, L.glow);
      line(c, [3.6, 0, 3.6, -11]);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + 0.35 + (i * Math.PI * 2) / 3;
        poly(c, [3.6, -11, 3.6 + Math.cos(a + 0.16) * 3.6, -11 + Math.sin(a + 0.16) * 3.6, 3.6 + Math.cos(a - 0.1) * 3.9, -11 + Math.sin(a - 0.1) * 3.9], L.wall);
      }
      circ(c, 3.6, -11, 0.5, L.metal);
      break;
    }
    case 'rocket': {
      // A booster on its stand beside the gantry.
      c.save();
      c.strokeStyle = P.lit ? L.accent : P.ink;
      line(c, [-3.6, 0, -3.6, -11.6, -2, -11.6, -2, 0]);
      for (let yy = -2.6; yy > -11; yy -= 2.8) line(c, [-3.6, yy, -2, yy - 1.6]);
      line(c, [-2, -8, 0, -8]);
      c.restore();
      c.fillStyle = L.wall;
      c.beginPath(); c.moveTo(1.2, -13.6); c.quadraticCurveTo(3.4, -10.6, 3, -1); c.lineTo(-0.6, -1); c.quadraticCurveTo(-1, -10.6, 1.2, -13.6); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = L.roof2;
      c.fillRect(-0.7, -7.4, 3.8, 1.3);
      poly(c, [0.1, -13, 1.2, -13.9, 2.3, -13, 2.6, -11.6, -0.2, -11.6], L.accent);
      poly(c, [-0.6, -3.6, -2.2, -1, -0.6, -1], L.accent);
      poly(c, [3, -3.6, 4.6, -1, 3, -1], L.accent);
      rect(c, -4.4, 0, 9.4, 1, L.wall2);
      break;
    }
  }
  c.lineWidth = lw0;
  c.restore();
}

/** The signature motif of a style, for the works of a seat on that path. */
export function drawPunkEmblem(c: Ctx, L: PunkLook, x: number, y: number, s: number, lw: number, faded: boolean): void {
  const P: Pen = { c, L: faded ? fadedLook(L) : L, ink: faded ? INK_3 : INK, lw, lit: !faded };
  emblem(P, x, y, s);
}

// --- skylines ------------------------------------------------------------------------------

/** Blocks of a skyline, by size: x, width, height. */
const ROWS: [number, number, number][][] = [
  [[-14, 6, 6], [-7.5, 5, 10], [-2, 6.5, 7.5], [5, 5, 12], [10.5, 5.5, 6.5]],
  [[-19, 5.5, 7], [-13, 5, 12], [-7.5, 6, 9], [-1, 5.5, 15], [5, 5.5, 10], [11, 5, 13], [16.5, 4.5, 7]],
  [[-24, 5, 9], [-18.5, 5, 15], [-13, 5, 11], [-7.5, 6, 22], [-1, 5.5, 16], [5, 5, 14], [10.5, 5.5, 19], [16.5, 5.5, 10], [22, 3.5, 7]],
];
const HALF_W = [16, 21, 25];
/** How tall the style builds, against the common row. */
const RISE: Record<PunkStyle, number> = {
  steam: 0.9, diesel: 1, electric: 0.95, clockwork: 0.95, atomic: 0.9, neon: 1.18, organic: 0.85, chrome: 1.1, solar: 0.66, rocket: 0.9,
};

function block(P: Pen, x: number, w: number, h: number, i: number, owner: string): void {
  const { c, L } = P;
  const a = i % 2 === 0;
  switch (L.style) {
    case 'steam':
      // Brick under slate gables, a pot on every other roof.
      if (a) rect(c, x + w * 0.62, -h, 1.1, 3.4, L.roof2);
      rect(c, x, 0, w, h, a ? L.wall : L.wall2);
      poly(c, [x - 0.6, -h, x + w / 2, -h - 2.8, x + w + 0.6, -h], L.roof);
      windows(P, x, w, h, P.lit ? L.glow : L.glass);
      break;
    case 'diesel':
      // Concrete set-backs with dark window bands.
      rect(c, x, 0, w, h, a ? L.wall : L.wall2);
      rect(c, x + w * 0.2, -h, w * 0.6, 2.2, a ? L.wall2 : L.wall);
      c.fillStyle = L.glass;
      for (let wy = -h + 2; wy < -2.4; wy += 3) c.fillRect(x + 0.9, wy, w - 1.8, 0.9);
      if (i % 3 === 0) { c.fillStyle = L.accent; c.fillRect(x, -h - 0.1, w, 0.8); }
      break;
    case 'electric':
      // Cream fronts under copper-green caps, every window lit.
      rect(c, x, 0, w, h, a ? L.wall : L.wall2);
      if (a) dome(c, x + w / 2, -h, w * 0.42, L.roof, 0.8);
      else { rect(c, x - 0.4, -h, w + 0.8, 1.1, L.roof2); }
      windows(P, x, w, h, P.lit ? L.glass : L.wall2);
      break;
    case 'clockwork':
      // Narrow timbered houses with steep verdigris gables.
      rect(c, x, 0, w, h, a ? L.wall : L.wall2);
      poly(c, [x - 0.5, -h, x + w / 2, -h - 4.4, x + w + 0.5, -h], a ? L.roof : L.roof2);
      line(c, [x, -h * 0.52, x + w, -h * 0.52]);
      line(c, [x, -h * 0.52, x + w * 0.5, -h + 0.2, x + w, -h * 0.52]);
      break;
    case 'atomic':
      // White drums under pastel domes, between slabs with flying roofs.
      if (a) {
        rect(c, x, 0, w, h - w * 0.3, L.wall);
        dome(c, x + w / 2, -h + w * 0.3, w / 2, L.roof, 0.6);
      } else {
        rect(c, x + 0.5, 0, w - 1, h, L.wall2);
        poly(c, [x - 1.4, -h - 1.8, x + w + 1.6, -h + 0.3, x + w + 1.4, -h + 1.1, x - 1.4, -h - 0.9], L.roof2);
      }
      c.fillStyle = L.glass;
      c.fillRect(x + 1.1, -h * 0.55, w - 2.2, 1);
      break;
    case 'neon':
      // Dark towers, lit from within and hung with signs.
      rect(c, x, 0, w, h, a ? L.wall : L.wall2);
      c.fillStyle = L.roof;
      c.fillRect(x, -h, w, 1.1);
      if (P.lit) {
        c.fillStyle = a ? L.glow : L.glass;
        for (let wy = -h + 2.6; wy < -2; wy += 2.6) { c.fillRect(x + 1, wy, 0.7, 0.7); c.fillRect(x + w - 1.7, wy + 1.2, 0.7, 0.7); }
      }
      if (i % 3 !== 1) {
        const sy = -h * 0.5, sh = Math.min(5.5, h * 0.42);
        if (P.lit) { c.fillStyle = rgba(a ? L.accent : L.glow, 0.28); c.fillRect(x + w - 0.6, sy - sh - 0.8, 2.8, sh + 1.6); }
        rect(c, x + w, sy, 1.5, sh, a ? L.accent : L.glow);
      }
      break;
    case 'organic': {
      // Grown mounds, terraced and planted.
      c.fillStyle = a ? L.wall : L.wall2;
      c.beginPath();
      c.moveTo(x, 0); c.lineTo(x, -h * 0.55); c.quadraticCurveTo(x + w / 2, -h * 1.3, x + w, -h * 0.55); c.lineTo(x + w, 0);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = L.roof;
      c.beginPath(); c.ellipse(x + w / 2, -h * 0.55, w / 2 + 0.5, 0.9, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      if (h > 8) { c.fillStyle = L.roof2; c.beginPath(); c.ellipse(x + w / 2, -h * 0.28, w / 2 + 0.7, 0.8, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
      break;
    }
    case 'chrome':
      // Mirrored slabs: one face in light, one in sky.
      poly(c, [x, 0, x + w * 0.1, -h, x + w * 0.9, -h, x + w, 0], L.wall);
      poly(c, [x + w * 0.52, 0, x + w * 0.52, -h, x + w * 0.9, -h, x + w, 0], L.wall2, false);
      c.save(); c.strokeStyle = L.accent; line(c, [x + w * 0.06, -h * 0.72, x + w * 0.94, -h * 0.72]); c.restore();
      break;
    case 'solar':
      // White low-rise under planted roofs and tilted glass.
      rect(c, x, 0, w, h, a ? L.wall : L.wall2);
      rect(c, x - 0.4, -h, w + 0.8, 1.1, L.roof);
      if (a) poly(c, [x + 0.8, -h - 1.1, x + w - 1.2, -h - 3, x + w - 0.6, -h - 1.1], L.roof2);
      else { circ(c, x + w * 0.3, -h - 1.7, 1.1, L.roof); circ(c, x + w * 0.68, -h - 1.5, 0.9, L.roof); }
      c.fillStyle = L.glass;
      c.fillRect(x + 1, -h * 0.6, w - 2, 0.9);
      break;
    case 'rocket':
      // White halls banded in orange; nose cones on the towers.
      rect(c, x, 0, w, h, a ? L.wall : L.wall2);
      rect(c, x, -h, w, 1.5, L.roof);
      if (!a && h > 9) poly(c, [x + 0.6, -h - 1.5, x + w / 2, -h - 5.6, x + w - 0.6, -h - 1.5], L.accent);
      if (a) { c.fillStyle = L.roof2; for (let k = 0; k < 3; k++) c.fillRect(x + 0.6 + k * (w - 1.2) / 3, -h * 0.5 - (k % 2) * 0.9, (w - 1.2) / 6, 0.9); }
      windows(P, x, w, h * 0.5, L.glass);
      break;
  }
  // A band of the owner's colour under the eaves of every third block keeps the seat readable.
  if (i % 3 === 1 && L.style !== 'organic') { c.fillStyle = owner; c.fillRect(x + 0.3, -h + (L.style === 'chrome' ? 1.4 : 2), w - 0.6, 0.9); }
}

/**
 * The skyline of a settlement whose owner holds a path. `size`: 0 town, 1 city, 2 metropolis.
 * `owner` is the owner's colour; `lw` one hairline in drawing units.
 */
export function drawPunkSkyline(c: Ctx, look: PunkLook, size: 0 | 1 | 2, owner: string, faded: boolean, lw: number): void {
  const L = faded ? fadedLook(look) : look;
  const P: Pen = { c, L, ink: faded ? INK_3 : INK, lw, lit: !faded };
  const W = HALF_W[size];
  const k = RISE[L.style];
  const row = ROWS[size].map(([x, w, h]) => [x, w, Math.max(4.5, h * k)] as [number, number, number]);
  let H = 0, tall = 0;
  row.forEach(([, , h], i) => { if (h > H) { H = h; tall = i; } });
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = P.ink;
  const big = size > 0;

  // --- behind the skyline ---
  switch (L.style) {
    case 'steam': {
      // Stacks over the roofs and an airship riding at its mast.
      const xs = big ? [-W * 0.62, -W * 0.12, W * 0.3] : [-W * 0.5, W * 0.12];
      xs.forEach((sx, i) => {
        const sh = H + 3 + (i % 2) * 2.4;
        plume(P, sx + 0.8, -sh - 1.6, 1.5 + (i % 2) * 0.3);
        stack(P, sx, 0, sh, 1.35, L.roof2, L.accent);
      });
      const ax = W * 0.5, ay = -H - (big ? 7.5 : 6);
      c.fillStyle = L.wall2;
      c.beginPath(); c.ellipse(ax, ay, 6.2, 2.1, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = owner;
      c.fillRect(ax - 1.2, ay - 2, 2.4, 4);
      c.beginPath(); c.ellipse(ax, ay, 6.2, 2.1, 0, 0, Math.PI * 2); c.stroke();
      poly(c, [ax - 6, ay, ax - 8, ay - 1.8, ax - 8, ay + 1.8], L.accent);
      rect(c, ax - 1.4, ay + 3.6, 2.8, 1, L.roof2);
      line(c, [ax - 1.2, ay + 2, ax - 1.2, ay + 2.6]); line(c, [ax + 1.2, ay + 2, ax + 1.2, ay + 2.6]);
      break;
    }
    case 'diesel': {
      // Searchlights crossing over the town.
      if (P.lit) {
        poly(c, [-W * 0.62, -3, -W * 0.05, -H - 13, W * 0.2, -H - 12], rgba(L.glow, 0.36), false);
        poly(c, [W * 0.58, -3, W * 0.02, -H - 12.4, -W * 0.24, -H - 11], rgba(L.glow, 0.3), false);
      }
      break;
    }
    case 'electric':
      emblem(P, W * 0.56, 0, big ? 1.5 : 1.15);
      break;
    case 'clockwork':
      // A great wheel turning behind the roofs.
      cog(c, W * 0.42, -H * 0.62, H * 0.52, 12, L.accent, L.wall, 0.13);
      break;
    case 'atomic': {
      // A cooling tower under its cloud.
      const tx = -W * 0.62, th = H + 2;
      plume(P, tx + 1, -th - 1.8, 1.9, 0.95);
      c.fillStyle = L.wall;
      c.beginPath();
      c.moveTo(tx - 4, 0); c.quadraticCurveTo(tx - 1.6, -th * 0.55, tx - 2.6, -th); c.lineTo(tx + 2.6, -th); c.quadraticCurveTo(tx + 1.6, -th * 0.55, tx + 4, 0);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = L.roof;
      c.fillRect(tx - 2.3, -th + 1.4, 4.6, 1);
      break;
    }
    case 'neon':
      // The glow of the signs on the haze.
      if (P.lit) {
        c.fillStyle = rgba(L.accent, 0.2);
        c.beginPath(); c.ellipse(-W * 0.3, -H * 0.55, W * 0.72, H * 0.72, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = rgba(L.glow, 0.17);
        c.beginPath(); c.ellipse(W * 0.34, -H * 0.5, W * 0.66, H * 0.62, 0, 0, Math.PI * 2); c.fill();
      }
      break;
    case 'organic': {
      // A grown tower: a gourd with lit pores.
      const gx = W * 0.5, gh = H + 6;
      c.fillStyle = L.roof2;
      c.beginPath();
      c.moveTo(gx - 2.2, 0);
      c.bezierCurveTo(gx - 6.4, -gh * 0.42, gx - 3.4, -gh * 0.9, gx, -gh);
      c.bezierCurveTo(gx + 3.4, -gh * 0.9, gx + 6.4, -gh * 0.42, gx + 2.2, 0);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = P.lit ? L.glow : L.wall;
      for (const [dx, dy] of [[-1.4, 0.3], [1.2, 0.42], [-0.4, 0.58], [1, 0.72], [-0.9, 0.8]]) { c.beginPath(); c.arc(gx + dx, -gh * dy, 0.6, 0, Math.PI * 2); c.fill(); }
      break;
    }
    case 'chrome': {
      // The monolith, taller than anything round it.
      const mx = -W * 0.52, mh = H + 7;
      poly(c, [mx - 2.2, 0, mx - 1.6, -mh, mx + 1.6, -mh, mx + 2.2, 0], L.roof2);
      poly(c, [mx, 0, mx, -mh, mx + 1.6, -mh, mx + 2.2, 0], L.roof, false);
      c.save(); c.strokeStyle = L.accent; c.lineWidth = lw * 1.3;
      c.beginPath(); c.ellipse(mx, -mh + 2.4, 4.2, 1.1, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
      break;
    }
    case 'solar': {
      // Turbines standing over the low roofs.
      for (const [tx, th] of (big ? [[-W * 0.66, H + 13], [W * 0.26, H + 10]] : [[-W * 0.6, H + 10]]) as [number, number][]) {
        poly(c, [tx - 0.5, 0, tx - 0.25, -th, tx + 0.25, -th, tx + 0.5, 0], L.wall);
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + 0.5 + tx * 0.07 + (i * Math.PI * 2) / 3;
          poly(c, [tx, -th, tx + Math.cos(a + 0.14) * 5.4, -th + Math.sin(a + 0.14) * 5.4, tx + Math.cos(a - 0.08) * 5.8, -th + Math.sin(a - 0.08) * 5.8], L.wall);
        }
        circ(c, tx, -th, 0.7, L.metal);
      }
      break;
    }
    case 'rocket':
      break;
  }

  // --- the blocks ---
  row.forEach(([x, w, h], i) => block(P, x, w, h, i, faded ? L.roof : owner));

  // --- in front and on top ---
  const [tx0, tw, th0] = row[tall];
  const flagAt = (fx: number, fy: number): void => {
    line(c, [fx, fy, fx, fy - 4.2]);
    poly(c, [fx, fy - 4.2, fx + 3.2, fy - 3.4, fx, fy - 2.5], faded ? L.roof : owner);
  };
  switch (L.style) {
    case 'steam': {
      emblem(P, W - 4.4, 0, 0.72);
      flagAt(tx0 + tw / 2, -th0 - 2.8);
      break;
    }
    case 'diesel': {
      // A ribbed hangar and the tank farm.
      const hx = -W + 7.5;
      dome(c, hx, 0, 6.6, L.roof2, 0.72);
      c.beginPath();
      for (const rr of [4.6, 2.6]) { c.moveTo(hx - rr, 0); c.ellipse(hx, 0, rr, rr * 0.72, 0, Math.PI, 0); }
      c.stroke();
      rect(c, hx - 1.6, 0, 3.2, 2.4, L.glass);
      emblem(P, W - 5, 0, 0.8);
      flagAt(tx0 + tw / 2, -th0 - 2.2);
      break;
    }
    case 'electric': {
      // The domed exchange, and a tram under its wire.
      rect(c, -5.4, 0, 10.8, 4.6, L.wall);
      dome(c, 0, -4.6, 4.4, L.roof, 0.95);
      rect(c, -0.6, -8.7, 1.2, 1.4, L.accent);
      c.fillStyle = P.lit ? L.glass : L.wall2;
      for (const wx of [-3.8, -1.2, 1.4]) c.fillRect(wx, -3.4, 1.4, 1.8);
      line(c, [-W, -3.6, W * 0.4, -3.6]);
      for (const px of [-W + 0.5, -W * 0.45]) line(c, [px, 0, px, -3.6]);
      const cx0 = -W + 3;
      rect(c, cx0, 0, 6, 2.4, L.accent);
      c.fillStyle = P.lit ? L.glass : L.wall;
      c.fillRect(cx0 + 0.7, -1.9, 4.6, 0.9);
      line(c, [cx0 + 3, -2.4, cx0 + 4, -3.6]);
      flagAt(0, -10.1);
      break;
    }
    case 'clockwork': {
      // The clock tower: a face on every side and a needle spire.
      const cx0 = tx0 + tw / 2, ch = th0 + 3.4;
      rect(c, cx0 - 2.6, 0, 5.2, ch, L.wall2);
      circ(c, cx0, -ch + 3, 2, '#fbf6e6');
      line(c, [cx0, -ch + 3, cx0, -ch + 1.5]);
      line(c, [cx0, -ch + 3, cx0 + 1.1, -ch + 3.5]);
      poly(c, [cx0 - 3.1, -ch, cx0, -ch - 6.4, cx0 + 3.1, -ch], L.roof);
      circ(c, cx0, -ch - 6.8, 0.6, L.accent);
      cog(c, cx0 - W * 0.42, -1.9, 1.9, 7, L.metal, L.wall, 0.3);
      break;
    }
    case 'atomic': {
      // The reactor dome and the needle with its orbits.
      dome(c, W - 6.5, 0, 5.4, L.wall, 0.86);
      c.fillStyle = L.roof2;
      c.fillRect(W - 11, -1.3, 9, 0.8);
      emblem(P, tx0 + tw / 2, -th0, big ? 1 : 0.8);
      break;
    }
    case 'neon': {
      // The mast of the tallest tower, a skyway, and the great board over the street.
      line(c, [tx0 + tw * 0.7, -th0, tx0 + tw * 0.7, -th0 - 5]);
      circ(c, tx0 + tw * 0.7, -th0 - 5.3, 0.5, L.accent, false);
      if (row.length > tall + 1) {
        const [nx] = row[tall + 1];
        c.save(); c.strokeStyle = P.lit ? L.glow : P.ink; c.lineWidth = lw * 1.5;
        line(c, [tx0 + tw, -th0 * 0.52, nx, -th0 * 0.52]);
        c.restore();
      }
      const bx = -W * 0.58;
      if (P.lit) { c.fillStyle = rgba(L.glow, 0.25); c.fillRect(bx - 0.8, -6.6, 9.6, 5.2); }
      rect(c, bx, -2, 8, 3.8, L.glow);
      c.fillStyle = L.accent;
      c.fillRect(bx + 0.8, -4.9, 4.4, 0.9);
      c.fillRect(bx + 0.8, -3.5, 6.2, 0.9);
      line(c, [bx + 1.2, -2, bx + 1.2, 0]); line(c, [bx + 6.8, -2, bx + 6.8, 0]);
      break;
    }
    case 'organic': {
      // Vats on the quay side, a grove on the other, blossom on the terraces.
      emblem(P, -W + 5, 0, 0.82);
      for (const [gx, gr] of [[W * 0.12, 2.1], [W * 0.26, 1.6]]) { line(c, [gx, 0, gx, -2.6]); circ(c, gx, -3.6, gr, L.roof); }
      c.fillStyle = L.accent;
      row.forEach(([x, w, h], i) => { if (i % 2) { c.beginPath(); c.arc(x + w * 0.3, -h * 0.55 - 0.6, 0.55, 0, Math.PI * 2); c.arc(x + w * 0.72, -h * 0.55 - 0.4, 0.5, 0, Math.PI * 2); c.fill(); } });
      break;
    }
    case 'chrome': {
      // Drones holding station over the roofs.
      for (const [dx, dy] of [[-W * 0.18, -H - 5.4], [W * 0.32, -H - 2.6], [W * 0.66, -H * 0.72], [-W * 0.8, -H - 3]]) {
        line(c, [dx - 1.2, dy, dx + 1.2, dy]);
        circ(c, dx, dy + 0.55, 0.6, P.lit ? L.glow : L.metal);
      }
      rect(c, -3, 0, 6, 1.4, L.roof2);
      break;
    }
    case 'solar': {
      // A glasshouse dome and the sun flowers.
      const gx = W * 0.56;
      c.fillStyle = rgba(L.glass, 0.82);
      c.beginPath(); c.ellipse(gx, 0, 5.2, 4.6, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
      c.beginPath();
      c.moveTo(gx, 0); c.lineTo(gx, -4.6);
      c.moveTo(gx - 5.2, 0); c.quadraticCurveTo(gx - 2.4, -6.2, gx, -4.6); c.quadraticCurveTo(gx + 2.4, -6.2, gx + 5.2, 0);
      c.moveTo(gx - 4.5, -2.3); c.lineTo(gx + 4.5, -2.3);
      c.stroke();
      emblem(P, -W + 6, 0, 0.72);
      for (const gx2 of [-W * 0.2, W * 0.14]) { line(c, [gx2, 0, gx2, -2]); circ(c, gx2, -2.8, 1.5, L.roof); }
      break;
    }
    case 'rocket': {
      // The pad at one end, the tracking dish at the other.
      emblem(P, W - 5.5, 0, big ? 1.5 : 1.2);
      const dx = -W + 4.5;
      line(c, [dx, 0, dx, -4.2]);
      c.fillStyle = L.wall;
      c.beginPath(); c.arc(dx, -6.8, 4.2, 0.4, Math.PI + 0.4); c.closePath(); c.fill(); c.stroke();
      line(c, [dx, -6.8, dx + 2.4, -10]);
      circ(c, dx + 2.4, -10, 0.8, L.accent);
      break;
    }
  }
  // The street the town stands on.
  rect(c, -W - 0.5, 0, W * 2 + 1, 1.3, L.ground);
}

// --- banner ------------------------------------------------------------------------------

/**
 * A style's skyline on a canvas, for the era banner and the traditions screen. Draws in the
 * canvas's own pixel space; `w` and `h` are CSS pixels.
 */
export function drawPunkBanner(canvas: HTMLCanvasElement, style: PunkStyle, owner: string, w: number, h: number): void {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  if (!c) return;
  const L = PUNK[style];
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  // A wash of sky in the style's light over paper.
  const sky = c.createLinearGradient(0, 0, 0, h);
  const dark = L.style === 'neon';
  sky.addColorStop(0, dark ? '#23233a' : mixHex(PAPER, L.glow, 0.34));
  sky.addColorStop(1, dark ? '#4a3a5e' : mixHex(PAPER, L.ground, 0.4));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  // Skylines side by side fill the width: a metropolis in the middle, cities and towns beside it.
  const base = h - 5;
  const unit = Math.max(0.8, (base - 4) / 37);
  const pitch = 62 * unit;
  const n = Math.max(1, Math.min(7, Math.floor((w - 20 * unit) / pitch) | 1));
  const SIZES: (0 | 1 | 2)[] = [2, 1, 0, 1];
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2;
    c.save();
    c.translate(w / 2 + k * pitch, base);
    c.scale(unit, unit);
    drawPunkSkyline(c, L, SIZES[Math.abs(k) % SIZES.length], owner, false, 1 / unit);
    c.restore();
  }
  c.fillStyle = L.ground;
  c.fillRect(0, base, w, h - base);
}
