// The flat Solar System chart: a Canvas 2D schematic seen from above the ecliptic, drawn as an
// engraved star chart (navy ground, gilt orbits). It is the fallback when WebGL is unavailable
// and the lighter tier otherwise. Rendering happens only when the controller asks for a frame.
import { BODY, type BodyId } from './astro';
import type { Frame, OrreryRenderer } from './frame';
import { FOV_DEG, radialAU, type Cam, type Vec3 } from './layout';
import { bodyTexture, renderDisc } from './textures';
import { t } from '../i18n';

const GILT = '214,186,120';
const TAN = Math.tan((FOV_DEG * Math.PI) / 360);

function starTile(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d')!;
  let s = 0x51a7;
  const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < 420; k++) {
    const x = R() * 512, y = R() * 512, m = R();
    ctx.fillStyle = `rgba(${m > 0.8 ? '255,236,200' : '210,224,255'},${0.18 + m * 0.55})`;
    const r = m > 0.96 ? 1.3 : m > 0.75 ? 0.9 : 0.55;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

export class Orrery2D implements OrreryRenderer {
  readonly kind = 'flat' as const;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private cx = 0;
  private cy = 0;
  private tx = 0;
  private tz = 0;
  private upp = 1;
  private stars: CanvasPattern | null = null;
  private earthTex: HTMLCanvasElement | null = null;
  private discs = new Map<string, HTMLCanvasElement>();
  lastDrawMs = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  resize(w: number, h: number, cx: number, cy: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
    }
    this.cx = cx; this.cy = cy;
  }

  setEarthTexture(tex: HTMLCanvasElement): void {
    this.earthTex = tex;
    for (const k of [...this.discs.keys()]) if (k.startsWith('earth:')) this.discs.delete(k);
  }

  setCamera(cam: Cam, target: Vec3): void {
    this.tx = target[0];
    this.tz = target[2];
    this.upp = (2 * cam.dist * TAN) / Math.max(1, this.h);
  }

  uppAt(): number {
    return this.upp;
  }

  project(p: Vec3): [number, number, boolean] {
    return [this.cx + (p[0] - this.tx) / this.upp, this.cy + (p[2] - this.tz) / this.upp, true];
  }

  private disc(id: BodyId, px: number, light: number, face: [number, number]): HTMLCanvasElement | null {
    const size = px <= 20 ? 48 : px <= 44 ? 96 : px <= 90 ? 192 : px <= 180 ? 384 : 640;
    const la = Math.round(light / (Math.PI / 12));
    const fk = id === 'earth' ? `${Math.round(face[0] * 20)}:${Math.round(face[1] * 20)}` : '';
    const key = `${id}:${size}:${la}:${fk}`;
    let c = this.discs.get(key);
    if (c) return c;
    const tex = id === 'earth' ? this.earthTex : bodyTexture(id);
    if (!tex) return null;
    const a = la * (Math.PI / 12);
    c = renderDisc(tex, size, id === 'earth' ? face[0] : 0, id === 'earth' ? face[1] : 0.12, [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.78], id === 'earth' ? '#8fc4ff' : id === 'venus' || id === 'titan' ? '#f4dca8' : undefined);
    if (this.discs.size > 90) this.discs.clear();
    this.discs.set(key, c);
    return c;
  }

  draw(f: Frame): void {
    const t0 = performance.now();
    const ctx = this.ctx;
    const W = this.w, H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.65);
    g.addColorStop(0, '#13233a');
    g.addColorStop(1, '#070d18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!this.stars) this.stars = ctx.createPattern(starTile(), 'repeat');
    if (this.stars) {
      ctx.save();
      // A faint drift of the stars with the view, for depth.
      ctx.translate((-this.tx / this.upp) * 0.02 % 512, (-this.tz / this.upp) * 0.02 % 512);
      ctx.fillStyle = this.stars;
      ctx.fillRect(-512, -512, W + 1024, H + 1024);
      ctx.restore();
    }
    const L = f.layout;
    const P = (p: Vec3) => this.project(p);
    const [sunX, sunY] = P([0, 0, 0]);

    // Logarithmic distance scale around the Sun.
    if (f.scaleAlpha > 0.02) {
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.font = '10.5px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
      ctx.textAlign = 'center';
      for (const au of [0.5, 1, 2, 5, 10, 20, 30, 50]) {
        const r = radialAU(au) / this.upp;
        ctx.strokeStyle = `rgba(${GILT},${0.12 * f.scaleAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sunX, sunY, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(${GILT},${0.42 * f.scaleAlpha})`;
        ctx.fillText(t('{n} AU', { n: String(au) }), sunX, sunY - r - 3);
      }
      ctx.restore();
    }

    // Heliocentric orbits.
    if (f.orbitAlpha > 0.01) {
      for (const [id, path] of Object.entries(L.orbits) as [BodyId, Vec3[]][]) {
        const b = BODY[id];
        const vis = f.bodies.find((x) => x.id === id);
        if (!vis || id === 'nea') continue;
        const strong = id === f.focusOrbit || id === 'earth';
        ctx.strokeStyle = strong ? `rgba(${id === 'earth' ? '143,196,255' : GILT},${0.55 * f.orbitAlpha})` : `rgba(${GILT},${(b.kind === 'planet' ? 0.34 : 0.2) * f.orbitAlpha})`;
        ctx.lineWidth = strong ? 1.4 : 1;
        ctx.setLineDash(b.kind === 'planet' ? [] : [3, 4]);
        ctx.beginPath();
        path.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // The Main Belt and the near-Earth cluster.
    if (f.beltAlpha > 0.02) {
      ctx.fillStyle = `rgba(190,172,140,${0.5 * f.beltAlpha})`;
      for (let k = 0; k < L.belt.length; k += 3) {
        const [x, y] = P([L.belt[k], 0, L.belt[k + 2]]);
        if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
      }
    }
    if (f.bodies.some((b) => b.id === 'nea')) {
      ctx.fillStyle = 'rgba(214,196,160,0.75)';
      const sz = Math.max(1.2, Math.min(3, 0.5 / this.upp));
      for (let k = 0; k < L.nea.length; k += 3) {
        const [x, y] = P([L.nea[k], 0, L.nea[k + 2]]);
        ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Moon orbits and the stations' orbits.
    for (const r of f.rings) {
      if (r.alpha < 0.02) continue;
      const [x, y] = P(r.center);
      const rr = r.r / this.upp;
      if (rr < 2) continue;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.alpha;
      ctx.lineWidth = r.dashed ? 1.2 : 1;
      ctx.setLineDash(r.dashed ? [4, 4] : []);
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // Shipments in flight.
    for (const a of f.arcs) {
      const [x0, y0] = P(a.from), [x1, y1] = P(a.to);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const nx = -(y1 - y0) * 0.22, ny = (x1 - x0) * 0.22;
      ctx.strokeStyle = a.color;
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1); ctx.stroke();
      ctx.setLineDash([]);
      const tt = a.progress;
      const qx = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * (mx + nx) + tt * tt * x1;
      const qy = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * (my + ny) + tt * tt * y1;
      ctx.globalAlpha = 1;
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(qx, qy, 3.2, 0, Math.PI * 2); ctx.fill();
    }

    // Bodies, the Sun first.
    for (const b of f.bodies) {
      if (b.alpha < 0.02 || b.id === 'nea') continue;
      const [x, y] = P(b.pos);
      const px = b.px;
      if (x < -px - 40 || y < -px - 40 || x > W + px + 40 || y > H + px + 40) continue;
      ctx.globalAlpha = b.alpha;
      if (b.id === 'sun') {
        const gl = ctx.createRadialGradient(x, y, px * 0.2, x, y, px * 4.2);
        gl.addColorStop(0, 'rgba(255,236,180,0.95)');
        gl.addColorStop(0.25, 'rgba(255,200,110,0.45)');
        gl.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(x, y, px * 4.2, 0, Math.PI * 2); ctx.fill();
        const core = ctx.createRadialGradient(x - px * 0.2, y - px * 0.2, 0, x, y, px);
        core.addColorStop(0, '#fff8e0'); core.addColorStop(0.7, '#ffd986'); core.addColorStop(1, '#f6b354');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(x, y, px, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const light = Math.atan2(sunY - y, sunX - x);
      if (b.id === 'saturn') this.ring(x, y, px, true);
      const img = px >= 2.6 ? this.disc(b.id, px, light, f.earthFace) : null;
      if (img) {
        const s = img.width * ((2 * px) / Number(img.dataset.globe || img.width));
        ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
      } else {
        ctx.fillStyle = BODY[b.id].color;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, px), 0, Math.PI * 2); ctx.fill();
      }
      if (b.id === 'saturn') this.ring(x, y, px, false);
    }
    ctx.globalAlpha = 1;
    this.lastDrawMs = performance.now() - t0;
  }

  /** Saturn's rings as a tilted ellipse, back half before the globe and front half after. */
  private ring(x: number, y: number, px: number, back: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.38);
    ctx.lineCap = 'butt';
    for (const [rr, a, wd] of [[1.55, 0.55, 0.32], [1.95, 0.8, 0.36], [2.25, 0.45, 0.16]] as [number, number, number][]) {
      ctx.strokeStyle = `rgba(232,214,170,${a})`;
      ctx.lineWidth = Math.max(0.8, px * wd);
      ctx.beginPath();
      ctx.ellipse(0, 0, px * rr, px * rr * 0.3, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  destroy(): void {
    this.discs.clear();
  }
}
