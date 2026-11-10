// A small 2D overview: who governs what, what is merely remembered, and the part
// of the world the 3D camera is looking at. Click or drag to move the camera.
import type { Topology } from './topology';
import { hexRgb, mixRgb, rgbCss, sepia, type RGB } from './util';

const PAPER: RGB = [0.93, 0.88, 0.74];
const TERRAIN_TINT: Record<string, RGB> = {
  plains: [0.66, 0.8, 0.42], hills: [0.72, 0.72, 0.42], mountains: [0.66, 0.62, 0.56], forest: [0.4, 0.64, 0.34],
  marsh: [0.5, 0.7, 0.56], steppe: [0.84, 0.8, 0.46], desert: [0.93, 0.82, 0.56], tundra: [0.84, 0.88, 0.84],
};

export class Minimap {
  private ctx: CanvasRenderingContext2D | null;
  private base: HTMLCanvasElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private world: [number, number] = [1600, 1000];
  private down = false;

  constructor(private canvas: HTMLCanvasElement, private onJump: (x: number, z: number) => void) {
    this.ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
  }

  private jump(e: PointerEvent): void {
    const b = this.canvas.getBoundingClientRect();
    if (b.width <= 0) return;
    this.onJump(((e.clientX - b.left) / b.width) * this.world[0], ((e.clientY - b.top) / b.height) * this.world[1]);
  }
  private onDown = (e: PointerEvent) => {
    this.down = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.jump(e);
    e.preventDefault();
  };
  private onMove = (e: PointerEvent) => { if (this.down) this.jump(e); };
  private onUp = (e: PointerEvent) => {
    this.down = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  };

  /** Repaint the static layer (regions). */
  setWorld(topo: Topology, seatColor: (seat: number | null) => string | null): void {
    const c = this.canvas;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = c.clientWidth || 180;
    this.h = c.clientHeight || 112;
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    this.world = [topo.width, topo.height];
    const base = document.createElement('canvas');
    base.width = c.width; base.height = c.height;
    const g = base.getContext('2d');
    this.base = base;
    if (!g) return;
    const sx = c.width / topo.width, sy = c.height / topo.height;
    g.fillStyle = rgbCss(PAPER);
    g.fillRect(0, 0, c.width, c.height);
    // Known sea: a soft halo round certain coasts.
    g.save();
    g.filter = 'blur(' + Math.round(5 * this.dpr) + 'px)';
    g.strokeStyle = 'rgba(60,150,190,0.9)';
    g.lineWidth = 16 * this.dpr;
    g.lineJoin = 'round';
    for (const e of topo.edges) {
      if (e.kind !== 'coast') continue;
      g.beginPath();
      for (let i = 0; i < e.pts.length; i += 2) { if (i === 0) g.moveTo(e.pts[i] * sx, e.pts[i + 1] * sy); else g.lineTo(e.pts[i] * sx, e.pts[i + 1] * sy); }
      g.stroke();
    }
    g.restore();
    for (const p of topo.regions) {
      const o = p.outline;
      g.beginPath();
      for (let i = 0; i < o.length; i += 2) { if (i === 0) g.moveTo(o[i] * sx, o[i + 1] * sy); else g.lineTo(o[i] * sx, o[i + 1] * sy); }
      g.closePath();
      const own = seatColor(p.r.owner);
      let col: RGB = own ? mixRgb(hexRgb(own), TERRAIN_TINT[p.r.terrain] ?? PAPER, 0.18) : mixRgb(TERRAIN_TINT[p.r.terrain] ?? PAPER, PAPER, 0.25);
      if (p.r.visibility === 'remembered') col = mixRgb(sepia(col, 0.75), PAPER, 0.45);
      g.fillStyle = rgbCss(col);
      g.fill();
      g.strokeStyle = 'rgba(50,35,20,0.35)';
      g.lineWidth = 0.6 * this.dpr;
      g.stroke();
    }
    this.draw(null);
  }

  /** Composite the static layer and the current view quadrilateral (world x,z pairs). */
  draw(view: number[] | null): void {
    const g = this.ctx;
    if (!g || !this.base) return;
    const c = this.canvas;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.base, 0, 0);
    if (view && view.length >= 8) {
      const sx = c.width / this.world[0], sy = c.height / this.world[1];
      g.beginPath();
      for (let i = 0; i < 8; i += 2) { if (i === 0) g.moveTo(view[i] * sx, view[i + 1] * sy); else g.lineTo(view[i] * sx, view[i + 1] * sy); }
      g.closePath();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fill();
      g.lineWidth = 2.6 * this.dpr;
      g.strokeStyle = 'rgba(40,28,16,0.85)';
      g.stroke();
      g.lineWidth = 1.2 * this.dpr;
      g.strokeStyle = '#fff6dc';
      g.stroke();
    }
  }

  dispose(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
  }
}
