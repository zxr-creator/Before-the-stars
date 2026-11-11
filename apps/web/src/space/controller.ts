// Drives the Solar System view: the camera and its easing, pointer, wheel and keyboard input,
// the per-draw frame for whichever renderer is live, and the placement of the HTML overlay
// (body labels, site and orbit markers) with collision handling. It draws only on demand: a
// change schedules one animation frame, and easing continues frame by frame until it settles.
import type { Observation } from '../protocol';
import { BODIES, BODY, MOONS_OF, type BodyId } from './astro';
import { bodyKnown, readSpace, type SpaceState } from './adapter';
import { ORBITS, SITES_ON } from './catalog';
import type { ArcDraw, BodyDraw, Frame, OrreryRenderer, RingDraw } from './frame';
import { earthSignature, paintEarth } from './globe';
import {
  BAND_DIST, DIST_MAX, DIST_MIN, baseRadius, camPitch, camTarget, layoutFor, moonDistance, systemExtent,
  type Band, type Cam, type SceneLayout, type Vec3,
} from './layout';

export type Selection = { kind: 'body'; id: BodyId } | { kind: 'site'; key: string } | { kind: 'orbit'; key: string };
export type SwitchBand = 'orbit' | 'system';
export interface Insets { left: number; right: number; top: number; bottom: number }

export interface ControllerHooks {
  onSwitchBand(b: SwitchBand): void;
  onExit(face: { lon: number; lat: number; moved: boolean }): void;
  onPick(sel: Selection | null): void;
}

interface OverlayItem { el: HTMLElement; w: number; h: number; on: boolean; nameW: number }
interface Placed { x: number; y: number; px: number; alpha: number; on: boolean }

const MIN_PX: Record<string, number> = { star: 11, planet: 5.5, dwarf: 3.4, asteroid: 2.8, moon: 2.6, cluster: 0 };
const PRIORITY: Partial<Record<BodyId, number>> = { sun: 100, earth: 96, moon: 72, jupiter: 85, saturn: 84, mars: 86, venus: 82, mercury: 80, uranus: 78, neptune: 78 };
const ORBIT_ANGLE: Record<string, number> = { leo: 2.5, geo: 2.05, llo: 2.4, mars_orbit: 2.3, ceres_orbit: 2.3, callisto_orbit: 2.3, titan_orbit: 2.3 };
const TEAL = '#6fc9cf';
const GILT = 'rgba(214,186,120,1)';

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const lsmooth = (a: number, b: number, x: number) => smooth(Math.log(a), Math.log(b), Math.log(Math.max(1e-6, x)));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Comfortable viewing distance for a body (its moons in view, or the body filling a third of the screen). */
export function niceDistance(id: BodyId): number {
  const b = BODY[id];
  if (id === 'sun') return BAND_DIST.inner;
  if (id === 'earth') return BAND_DIST.orbit;
  if (b.kind === 'cluster') return 60;
  const ms = MOONS_OF[id];
  if (ms?.length) return Math.max(baseRadius(b) * 6, systemExtent(id) * 3.4);
  return Math.max(DIST_MIN * 1.4, baseRadius(b) * 7);
}

export class SpaceController {
  private renderer: OrreryRenderer | null = null;
  private obs: Observation | null = null;
  private layout: SceneLayout | null = null;
  private layoutKey = '';
  state: SpaceState | null = null;
  private earthSig = '';
  private earthTex: HTMLCanvasElement | null = null;
  private earthWidth = 0;
  private seatColor = new Map<number, string>();
  cur: Cam = { focus: 'earth', pan: [0, 0, 0], dist: BAND_DIST.globe, yaw: 0, pitchOff: 0 };
  goal: Cam = { ...this.cur, pan: [0, 0, 0] };
  private earthSpin = 0;
  private earthFace: [number, number] = [0, 0.3];
  private entryFace: [number, number] = [0, 0.3];
  private w = 1;
  private h = 1;
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private raf = 0;
  private last = 0;
  private destroyed = false;
  private reducedMotion = false;
  private items = new Map<string, OverlayItem>();
  /** Screen rectangles of the layer's own chrome, kept clear of labels. */
  private obstacles: number[] = [];
  private placed = new Map<BodyId, Placed>();
  private lastBand: SwitchBand | null = null;
  private exitPush = 0;
  private leaving = false;
  selection: Selection | null = null;
  lastFrameMs = 0;

  constructor(private root: HTMLElement, private overlay: HTMLElement, private hooks: ControllerHooks) {}

  // --- wiring -----------------------------------------------------------------------------

  setRenderer(r: OrreryRenderer | null): void {
    this.renderer = r;
    if (r && this.earthTex) r.setEarthTexture(this.earthTex);
    this.resize();
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  setData(obs: Observation): void {
    this.obs = obs;
    const key = `${obs.date?.year ?? 'm'}:${obs.date?.month ?? ''}:${obs.month}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.layout = layoutFor(obs.date, obs.month);
    }
    this.state = readSpace(obs);
    this.seatColor.clear();
    if (obs.seat >= 0) this.seatColor.set(obs.seat, obs.civ.color);
    for (const o of obs.others) this.seatColor.set(o.seat, o.color);
    this.refreshEarth();
    this.invalidate();
  }

  /** Repaint the home globe when what this seat knows of it changed. */
  private refreshEarth(): void {
    const obs = this.obs;
    if (!obs || !this.renderer) return;
    const width = this.renderer.kind === '3d' ? 2048 : 1024;
    const sig = earthSignature(obs);
    if (sig === this.earthSig && width <= this.earthWidth && this.earthTex) return;
    this.earthSig = sig;
    this.earthWidth = width;
    this.earthTex = paintEarth(obs, width);
    this.renderer.setEarthTexture(this.earthTex);
  }

  /** Distance of a body from the Sun on the current date (AU). */
  rAU(id: BodyId): number {
    return this.layout?.rAU[id] ?? 0;
  }

  colorOf(seat: number | null | undefined): string | null {
    if (seat == null) return null;
    return this.seatColor.get(seat) ?? '#8a8070';
  }

  setInsets(i: Insets): void {
    this.insets = { ...i };
    this.resize();
  }

  resize(): void {
    const c = this.root.getBoundingClientRect();
    this.w = Math.max(1, Math.round(c.width));
    this.h = Math.max(1, Math.round(c.height));
    if (this.renderer) {
      this.refreshEarth();
      const i = this.insets;
      const bw = Math.max(120, this.w - i.left - i.right), bh = Math.max(120, this.h - i.top - i.bottom);
      this.renderer.resize(this.w, this.h, i.left + bw / 2, i.top + bh / 2);
    }
    this.measureChrome();
    this.invalidate();
  }

  /** Gather the overlay elements rendered by the component (after each render). */
  collect(): void {
    const seen = new Set<string>();
    for (const el of this.overlay.querySelectorAll<HTMLElement>('[data-k]')) {
      const k = el.dataset.k!;
      seen.add(k);
      const it = this.items.get(k);
      if (!it || it.el !== el) this.items.set(k, { el, w: -1, h: 0, on: true, nameW: 0 });
    }
    for (const k of [...this.items.keys()]) if (!seen.has(k)) this.items.delete(k);
    this.measureChrome();
    this.invalidate();
  }

  private measureChrome(): void {
    const base = this.root.getBoundingClientRect();
    const els = [...this.root.querySelectorAll<HTMLElement>('.sp-caption, .sp-controls > *, .sp-card')];
    const sw = this.root.parentElement?.querySelector<HTMLElement>('.sp-scales');
    if (sw) els.push(sw);
    this.obstacles = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) this.obstacles.push(r.left - base.left - 4, r.top - base.top - 4, r.right - base.left + 4, r.bottom - base.top + 4);
    }
  }

  /** Text changed (language): measure the overlay again. */
  remeasure(): void {
    for (const it of this.items.values()) it.w = -1;
    this.invalidate();
  }

  // --- camera -------------------------------------------------------------------------------

  /** Start the view: from the planet (globe band facing the given point) or straight to a band. */
  enter(band: Band, lon: number, lat: number, fromPlanet: boolean): void {
    const L = this.layout;
    this.entryFace = [lon, clamp(lat, -1.1, 1.2)];
    this.earthFace = [...this.entryFace];
    if (L) {
      // Look at the sunlit side: the camera stands between the Sun and the Earth, a little off the line.
      const e = L.pos.earth;
      const sx = -e[0], sz = -e[2];
      const a = Math.atan2(sx, sz) + 0.55;
      this.cur.yaw = this.goal.yaw = a;
      const cx = Math.sin(a), cz = Math.cos(a);
      const beta = Math.atan2(-cz, cx);
      this.earthSpin = beta - lon;
    }
    const pitchOff = this.entryFace[1] - 0.2;
    const focus: BodyId = band === 'globe' || band === 'orbit' ? 'earth' : 'sun';
    // Start at the surface of the home globe (or near the chosen band) and ease out.
    const start = fromPlanet ? DIST_MIN * 1.08 : BAND_DIST[band] * (band === 'system' ? 0.8 : 1.15);
    this.cur = { focus: fromPlanet ? 'earth' : focus, pan: [0, 0, 0], dist: start, yaw: this.cur.yaw, pitchOff };
    this.goal = { ...this.cur, pan: [0, 0, 0] };
    this.root.classList.remove('is-leaving');
    this.leaving = false;
    this.focus(focus, BAND_DIST[band]);
  }

  goBand(band: Band): void {
    const focus: BodyId = band === 'globe' || band === 'orbit' ? 'earth' : 'sun';
    this.focus(focus, BAND_DIST[band]);
  }

  /** Follow a body, easing the view across without a jump. */
  focus(id: BodyId, dist?: number): void {
    const L = this.layout;
    if (L && id !== this.cur.focus) {
      const before = camTarget(this.cur, L);
      const after = camTarget({ ...this.cur, focus: id, pan: [0, 0, 0] }, L);
      this.cur.pan = [before[0] - after[0], before[1] - after[1], before[2] - after[2]];
      this.cur.focus = id;
    }
    this.goal = { ...this.goal, focus: id, pan: [0, 0, 0], dist: clamp(dist ?? this.goal.dist, DIST_MIN, DIST_MAX) };
    if (this.reducedMotion) this.cur = { ...this.goal, pan: [0, 0, 0] };
    this.invalidate();
  }

  zoomBy(f: number): void {
    const g = this.goal;
    const nd = clamp(g.dist / f, DIST_MIN, DIST_MAX);
    if (f > 1 && nd === g.dist && g.focus === 'earth' && nd <= DIST_MIN * 1.01) {
      this.goHome();
      return;
    }
    g.dist = nd;
    if (this.reducedMotion) this.cur.dist = nd;
    this.invalidate();
  }

  /** Back to the home planet: close in on the globe and hand over to the planet map. */
  goHome(): void {
    if (this.leaving) return;
    this.leaving = true;
    const near = this.cur.focus === 'earth' && this.cur.dist < 14;
    this.focus('earth', DIST_MIN);
    this.root.classList.add('is-leaving');
    const face = this.currentFace();
    window.setTimeout(() => {
      if (this.destroyed) return;
      this.hooks.onExit(face);
    }, this.reducedMotion ? 0 : near ? 320 : 520);
  }

  /** Longitude and latitude of the home globe facing the viewer. */
  private currentFace(): { lon: number; lat: number; moved: boolean } {
    if (this.renderer?.kind !== '3d') return { lon: this.earthFace[0], lat: this.earthFace[1], moved: false };
    const cx = Math.sin(this.cur.yaw), cz = Math.cos(this.cur.yaw);
    let lon = Math.atan2(-cz, cx) - this.earthSpin;
    lon = Math.atan2(Math.sin(lon), Math.cos(lon));
    const lat = camPitch(this.cur);
    const d = Math.abs(Math.atan2(Math.sin(lon - this.entryFace[0]), Math.cos(lon - this.entryFace[0]))) + Math.abs(lat - this.entryFace[1]);
    return { lon, lat, moved: this.cur.focus === 'earth' && d > 0.35 };
  }

  private uppTarget(): number {
    const L = this.layout;
    if (!L || !this.renderer) return 1;
    return this.renderer.uppAt(camTarget(this.cur, L));
  }

  panPx(dx: number, dy: number): void {
    const upp = this.uppTarget();
    const yaw = this.renderer?.kind === '3d' ? this.cur.yaw : 0;
    const pitch = this.renderer?.kind === '3d' ? camPitch(this.cur) : Math.PI / 2;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const k = 1 / Math.max(0.35, Math.sin(Math.abs(pitch)));
    const p = this.goal.pan;
    const nx = p[0] - rx * dx * upp + fx * dy * upp * k;
    const nz = p[2] - rz * dx * upp + fz * dy * upp * k;
    this.goal.pan = [nx, 0, nz];
    this.cur.pan = [this.cur.pan[0] + (nx - p[0]), this.cur.pan[1], this.cur.pan[2] + (nz - p[2])];
    this.invalidate();
  }

  rotate(dyaw: number, dpitch: number): void {
    this.cur.yaw += dyaw;
    this.goal.yaw += dyaw;
    const po = clamp(this.goal.pitchOff + dpitch, -1.4, 1.2);
    this.cur.pitchOff += po - this.goal.pitchOff;
    this.goal.pitchOff = po;
    this.invalidate();
  }

  /** Wheel: zoom about the followed body; closing in near another body follows it instead. */
  wheel(dy: number, x: number, y: number): void {
    if (dy < 0) {
      const hit = this.bodyAt(x, y, 34);
      if (hit && hit !== this.goal.focus && hit !== 'sun') this.focus(hit);
      if (this.goal.focus === 'earth' && this.goal.dist <= DIST_MIN * 1.01) {
        this.exitPush += -dy;
        if (this.exitPush > 220) { this.exitPush = 0; this.goHome(); }
        return;
      }
    }
    this.exitPush = 0;
    this.zoomBy(Math.exp(-dy * 0.0019));
  }

  /** The body drawn under a screen point, if any. */
  bodyAt(x: number, y: number, slack = 8): BodyId | null {
    let best: BodyId | null = null, bd = Infinity;
    for (const [id, p] of this.placed) {
      if (!p.on || p.alpha < 0.4) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      const lim = Math.max(10, p.px + slack);
      if (d <= lim && d - p.px < bd) { bd = d - p.px; best = id; }
    }
    return best;
  }

  // --- drawing --------------------------------------------------------------------------------

  invalidate(): void {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  /** Draw now (tests and screenshots). */
  drawNow(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cur = { ...this.goal, pan: [...this.goal.pan] as Vec3 };
    this.frame(performance.now());
  }

  private frame(now: number): void {
    this.raf = 0;
    if (this.destroyed || !this.renderer || !this.layout) return;
    const t0 = performance.now();
    const dt = this.last ? Math.min(80, now - this.last) : 16;
    this.last = now;
    const moving = this.step(dt);
    this.draw();
    this.lastFrameMs = performance.now() - t0;
    if (moving) this.invalidate(); else this.last = 0;
  }

  private step(dt: number): boolean {
    const c = this.cur, g = this.goal;
    if (this.reducedMotion) {
      this.cur = { ...g, pan: [...g.pan] as Vec3 };
      return false;
    }
    const k = 1 - Math.exp(-dt / 120);
    const ld = Math.log(c.dist) + (Math.log(g.dist) - Math.log(c.dist)) * k;
    c.dist = Math.exp(ld);
    c.yaw += (g.yaw - c.yaw) * k;
    c.pitchOff += (g.pitchOff - c.pitchOff) * k;
    for (let i = 0; i < 3; i++) c.pan[i] += (g.pan[i] - c.pan[i]) * k;
    c.focus = g.focus;
    const panLeft = Math.hypot(g.pan[0] - c.pan[0], g.pan[1] - c.pan[1], g.pan[2] - c.pan[2]);
    const settled = Math.abs(Math.log(g.dist / c.dist)) < 0.002 && Math.abs(g.yaw - c.yaw) < 1e-3 && Math.abs(g.pitchOff - c.pitchOff) < 1e-3 && panLeft < c.dist * 1e-4;
    if (settled) this.cur = { ...g, pan: [...g.pan] as Vec3 };
    return !settled;
  }

  private draw(): void {
    const R = this.renderer!, L = this.layout!, S = this.state;
    const cam = this.cur;
    const target = camTarget(cam, L);
    R.setCamera(cam, target);
    const bodies: BodyDraw[] = [];
    const upps = new Map<BodyId, number>();
    const draws = new Map<BodyId, BodyDraw>();
    for (const b of BODIES) {
      if (S && !bodyKnown(S, b.id)) continue;
      const pos = L.pos[b.id];
      if (!pos) continue;
      const upp = R.uppAt(pos);
      upps.set(b.id, upp);
      const base = baseRadius(b);
      const minPx = b.kind === 'planet' && b.radiusKm > 20000 ? 7 : MIN_PX[b.kind] ?? 2;
      const r = Math.max(base, minPx * upp);
      let alpha = 1;
      if (b.kind === 'moon') {
        const pu = R.uppAt(L.pos[b.parent!]);
        const ext = systemExtent(b.parent!) / pu;
        alpha = smooth(26, 54, ext);
        const parent = draws.get(b.parent!);
        const gap = moonDistance(b) / pu - (parent ? parent.px : 0) - r / upp;
        if (gap < 3) alpha = 0;
      }
      const d: BodyDraw = { id: b.id, pos, r, px: r / upp, alpha };
      bodies.push(d);
      draws.set(b.id, d);
    }
    const rings: RingDraw[] = [];
    for (const d of bodies) {
      const b = BODY[d.id];
      if (b.kind !== 'moon' || d.alpha < 0.02) continue;
      rings.push({ key: 'm:' + d.id, center: L.pos[b.parent!], r: moonDistance(b), alpha: d.alpha * 0.32, color: GILT, dashed: false });
    }
    for (const o of ORBITS) {
      if (!('ring' in o.draw)) continue;
      const host = draws.get(o.body);
      if (!host || host.alpha < 0.3) continue;
      const r = Math.max(baseRadius(BODY[o.body]) * o.draw.ring, host.r * 1.3);
      const px = r / (upps.get(o.body) ?? 1);
      const has = !!S?.stations[o.key]?.length;
      rings.push({ key: 'o:' + o.key, center: host.pos, r, alpha: host.alpha * smooth(16, 36, px) * (has ? 0.95 : 0.6), color: TEAL, dashed: true });
    }
    const arcs: ArcDraw[] = [];
    for (const tr of S?.transfers ?? []) {
      const a = L.pos[tr.from], b = L.pos[tr.to];
      if (!a || !b) continue;
      arcs.push({ key: `${tr.view.id ?? ''}:${tr.from}:${tr.to}`, from: a, to: b, progress: tr.progress, color: this.colorOf(tr.view.owner) ?? '#e9d9a6' });
    }
    const focusB = BODY[cam.focus];
    const frame: Frame = {
      layout: L,
      cam,
      target,
      bodies,
      rings,
      arcs,
      orbitAlpha: lsmooth(9, 40, cam.dist),
      focusOrbit: focusB.kind === 'moon' ? focusB.parent : cam.focus === 'sun' ? null : cam.focus,
      beltAlpha: lsmooth(40, 260, cam.dist),
      scaleAlpha: lsmooth(260, 800, cam.dist),
      earthSpin: this.earthSpin,
      earthFace: this.earthFace,
    };
    R.draw(frame);
    this.placeOverlay(draws);
    const band: SwitchBand = (cam.focus === 'earth' || cam.focus === 'moon') && cam.dist < 180 ? 'orbit' : 'system';
    if (band !== this.lastBand) {
      this.lastBand = band;
      this.hooks.onSwitchBand(band);
    }
  }

  // --- overlay ----------------------------------------------------------------------------------

  private placeOverlay(draws: Map<BodyId, BodyDraw>): void {
    const R = this.renderer!, L = this.layout!, S = this.state;
    const W = this.w, H = this.h;
    // Measure anything new in one pass.
    const fresh = [...this.items.values()].filter((it) => it.w < 0);
    if (fresh.length) {
      for (const it of fresh) { it.el.style.visibility = 'hidden'; it.el.style.display = ''; it.el.classList.add('has-name'); }
      for (const it of fresh) {
        it.w = it.el.offsetWidth; it.h = it.el.offsetHeight;
        const nm = it.el.querySelector<HTMLElement>('.sp-site-name, .sp-orbit-name');
        it.nameW = nm ? nm.offsetWidth + 4 : 0;
      }
      for (const it of fresh) { it.el.style.visibility = ''; it.el.classList.remove('has-name'); it.on = true; }
    }
    this.placed.clear();
    for (const [id, d] of draws) {
      const [x, y, ok] = R.project(d.pos);
      const on = ok && d.alpha > 0.05 && x > -60 && y > -60 && x < W + 60 && y < H + 60;
      this.placed.set(id, { x, y, px: d.px, alpha: d.alpha, on });
    }
    const rects: number[] = [...this.obstacles];
    const free = (x0: number, y0: number, w: number, h: number) => {
      for (let i = 0; i < rects.length; i += 4) {
        if (x0 < rects[i + 2] && x0 + w > rects[i] && y0 < rects[i + 3] && y0 + h > rects[i + 1]) return false;
      }
      return true;
    };
    const take = (x0: number, y0: number, w: number, h: number) => rects.push(x0 - 2, y0 - 1, x0 + w + 2, y0 + h + 1);
    // Bodies are obstacles for labels (their discs), the selected first.
    for (const p of this.placed.values()) if (p.on && p.px > 6) take(p.x - p.px * 0.72, p.y - p.px * 0.72, p.px * 1.44, p.px * 1.44);
    const show = (k: string, x: number, y: number, on: boolean, cls?: [string, boolean]) => {
      const it = this.items.get(k);
      if (!it) return;
      if (on) {
        it.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
        if (!it.on) { it.el.style.display = ''; it.on = true; }
      } else if (it.on) {
        it.el.style.display = 'none';
        it.on = false;
      }
      if (cls) it.el.classList.toggle(cls[0], cls[1]);
    };
    const sel = this.selection;
    const selBody: BodyId | null = sel?.kind === 'body' ? sel.id
      : sel?.kind === 'site' ? (Object.values(SITES_ON).flat().find((s) => s!.key === sel.key)?.body ?? null)
        : sel?.kind === 'orbit' ? (ORBITS.find((o) => o.key === sel.key)?.body ?? null) : null;
    const sp = selBody ? this.placed.get(selBody) : null;
    show('sel', sp ? sp.x - sp.px - 7 : 0, sp ? sp.y - sp.px - 7 : 0, !!sp?.on);
    const selEl = this.items.get('sel')?.el;
    if (selEl && sp) { const s = Math.round(sp.px * 2 + 14); selEl.style.width = s + 'px'; selEl.style.height = s + 'px'; }

    // Body labels by priority: the Sun and the planets before any marker, the small bodies after.
    // Each tries below its body, then above, right and left; a label with no room is left out.
    const prio = (id: BodyId) => PRIORITY[id] ?? (BODY[id].kind === 'dwarf' ? 60 : BODY[id].kind === 'moon' ? 50 : 55);
    const labels = [...draws.values()].sort((a, b) => prio(b.id) - prio(a.id));
    const labelPass = (major: boolean) => {
      for (const d of labels) {
        if ((prio(d.id) >= 78) !== major) continue;
        const k = 'b:' + d.id;
        const it = this.items.get(k);
        const p = this.placed.get(d.id);
        if (!it || !p) continue;
        const forced = selBody === d.id || this.cur.focus === d.id;
        let on = p.on && p.alpha > 0.55;
        const gap = d.id === 'sun' ? 8 : 3;
        const spots: [number, number][] = [
          [p.x - it.w / 2, p.y + p.px + gap],
          [p.x - it.w / 2, p.y - p.px - gap - it.h],
          [p.x + p.px + gap + 2, p.y - it.h / 2],
          [p.x - p.px - gap - 2 - it.w, p.y - it.h / 2],
        ];
        // Keep labels on screen: slide them inside the edges rather than cutting them off.
        for (const s of spots) {
          s[0] = clamp(s[0], 4, W - it.w - 4);
          s[1] = clamp(s[1], 4, H - it.h - 4);
        }
        let at = spots[0];
        if (on && !forced) {
          const ok = spots.find(([x0, y0]) => free(x0, y0, it.w, it.h));
          if (ok) at = ok; else on = false;
        }
        if (on) take(at[0], at[1], it.w, it.h);
        show(k, at[0], at[1], on);
      }
    };
    labelPass(true);

    // Sites: fanned around their body when there is room, else gathered into a count on the body
    // (or on the planet, for a moon whose system is too small to show).
    const holders = (Object.keys(SITES_ON) as BodyId[]).filter((id) => this.placed.get(id)?.on);
    const agg = new Map<BodyId, number>();
    const sunP = this.placed.get('sun');
    for (const id of Object.keys(SITES_ON) as BodyId[]) {
      const list = SITES_ON[id]!;
      const p = this.placed.get(id);
      const b = BODY[id];
      let expanded = !!p?.on && p.alpha > 0.6;
      if (expanded && p) {
        for (const o of holders) {
          if (o === id) continue;
          const q = this.placed.get(o)!;
          if (Math.hypot(q.x - p.x, q.y - p.y) < (b.kind === 'moon' ? 40 : 58) + p.px) { expanded = false; break; }
        }
      }
      if (!expanded) {
        const host = b.parent ?? id;
        agg.set(host, (agg.get(host) ?? 0) + list.length);
        for (const s of list) show('s:' + s.key, 0, 0, false);
        continue;
      }
      const ref = b.parent ? this.placed.get(b.parent) : sunP;
      let dx = 1, dy = 0;
      if (ref && ref.on !== undefined) {
        dx = p!.x - ref.x; dy = p!.y - ref.y;
        const n = Math.hypot(dx, dy);
        if (n < 1) { dx = 1; dy = 0; } else { dx /= n; dy /= n; }
      }
      const base = Math.atan2(dy, dx);
      const near = p!.px > 16 || this.cur.focus === id;
      list.forEach((s, i) => {
        const k = 's:' + s.key;
        const it = this.items.get(k);
        if (!it) return;
        // The marker's own slot, or the nearest free one around the body.
        const a0 = base + (i - (list.length - 1) / 2) * 0.68;
        const rr = p!.px + 15;
        let a = a0;
        for (const dt of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0, 2.7, -2.7, Math.PI]) {
          const tx = p!.x + Math.cos(a0 + dt) * rr, ty = p!.y + Math.sin(a0 + dt) * rr;
          if (free(tx - 11, ty - 11, 22, 22)) { a = a0 + dt; break; }
        }
        const cx = p!.x + Math.cos(a) * rr, cy = p!.y + Math.sin(a) * rr;
        const named = near && b.name !== s.name;
        const left = Math.cos(a) < -0.2;
        const drawNamed = named && free(left ? cx - it.w + 11 : cx - 11, cy - 11, it.w, 22);
        const xx = drawNamed && left ? cx - it.w + 11 : cx - 11;
        take(xx, cy - 11, drawNamed ? it.w : 22, 22);
        show(k, xx, cy - 11, true, ['has-name', drawNamed]);
        it.el.classList.toggle('name-left', drawNamed && left);
      });
    }
    for (const id of Object.keys(SITES_ON).concat(Object.keys(MOONS_OF)) as BodyId[]) {
      const k = 'a:' + id;
      const n = agg.get(id) ?? 0;
      const p = this.placed.get(id);
      const it = this.items.get(k);
      if (!it) continue;
      if (!n || !p?.on) { show(k, 0, 0, false); continue; }
      const cnt = it.el.querySelector('b');
      if (cnt && cnt.textContent !== String(n)) cnt.textContent = String(n);
      const spots: [number, number][] = [
        [p.x + p.px * 0.7 + 2, p.y - p.px * 0.7 - it.h + 4],
        [p.x - p.px * 0.7 - 2 - it.w, p.y - p.px * 0.7 - it.h + 4],
        [p.x + p.px * 0.7 + 2, p.y + p.px * 0.7 - 4],
        [p.x - p.px * 0.7 - 2 - it.w, p.y + p.px * 0.7 - 4],
      ];
      const [x0, y0] = spots.find(([ax, ay]) => free(ax, ay, it.w, it.h)) ?? spots[0];
      take(x0, y0, it.w, it.h);
      show(k, x0, y0, true);
    }

    labelPass(false);

    // Station orbits: a diamond on each ring (and at each Lagrange point) with its short name.
    const earthMoon = draws.get('moon');
    for (const o of ORBITS) {
      const k = 'o:' + o.key;
      const it = this.items.get(k);
      if (!it) continue;
      const host = draws.get(o.body);
      let pt: Vec3 | null = null;
      if (host && host.alpha > 0.3) {
        if ('ring' in o.draw) {
          const r = Math.max(baseRadius(BODY[o.body]) * o.draw.ring, host.r * 1.3);
          const px = r / (R.uppAt(host.pos) || 1);
          if (px > 16) {
            const a = ORBIT_ANGLE[o.key] ?? 2.3;
            pt = [host.pos[0] + r * Math.cos(a), host.pos[1], host.pos[2] - r * Math.sin(a)];
          }
        } else if (earthMoon && earthMoon.alpha > 0.6) {
          pt = L.lagrange[o.draw.point];
        }
      }
      if (!pt) { show(k, 0, 0, false); continue; }
      const [x, y, ok] = R.project(pt);
      const named = selBody === o.body || this.cur.focus === o.body || (S?.stations[o.key]?.length ?? 0) > 0 || this.cur.dist < 60;
      const w = named ? it.w : 16;
      const x0 = x - 8, y0 = y - 8;
      const forced = sel?.kind === 'orbit' && sel.key === o.key;
      let on = ok && x > -20 && y > -20 && x < W + 20 && y < H + 20;
      let nm = named;
      if (on && !forced && !free(x0, y0, w, 16)) {
        nm = false;
        if (!free(x0, y0, 16, 16)) on = false;
      }
      if (on) take(x0, y0, nm ? w : 16, 16);
      show(k, x0, y0, on, ['has-name', nm]);
    }
  }

  // --- input ----------------------------------------------------------------------------------

  /** Attach pointer, wheel and keyboard handling to the canvas. Returns a detach function. */
  bind(canvas: HTMLCanvasElement): () => void {
    const pointers = new Map<number, { x: number; y: number }>();
    let downX = 0, downY = 0, moved = false, mode: 'rotate' | 'pan' = 'pan', pinch = 0;
    const local = (e: { clientX: number; clientY: number }): [number, number] => {
      const b = canvas.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downX = e.clientX; downY = e.clientY; moved = false;
        mode = this.renderer?.kind === '3d' && e.button === 0 && !e.shiftKey ? 'rotate' : 'pan';
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        const [x, y] = local(e);
        this.root.classList.toggle('has-hover', !!this.bodyAt(x, y));
        return;
      }
      if (pointers.size === 1) {
        if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) { moved = true; this.root.classList.add('is-dragging'); }
        if (moved) {
          const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          if (mode === 'rotate') this.rotate(-dx * 0.006, dy * 0.005);
          else this.panPx(dx, dy);
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0) this.zoomBy(d / pinch);
        pinch = d;
      }
    };
    const onUp = (e: PointerEvent) => {
      const had = pointers.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!had || pointers.size) return;
      this.root.classList.remove('is-dragging');
      if (!moved && e.type === 'pointerup' && e.button === 0) {
        const [x, y] = local(e);
        const id = this.bodyAt(x, y);
        if (id) {
          if (id !== this.goal.focus || this.goal.dist > niceDistance(id) * 1.8) this.focus(id, id === 'sun' ? undefined : niceDistance(id));
          this.hooks.onPick({ kind: 'body', id });
        } else {
          this.hooks.onPick(null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 240 : 1;
      const dy = Math.max(-240, Math.min(240, e.deltaY * unit)) * (e.ctrlKey ? 4 : 1);
      const [x, y] = local(e);
      this.wheel(dy, x, y);
    };
    const onMenu = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 160 : 70;
      let used = true;
      switch (e.key) {
        case 'ArrowLeft': this.panPx(step, 0); break;
        case 'ArrowRight': this.panPx(-step, 0); break;
        case 'ArrowUp': this.panPx(0, step); break;
        case 'ArrowDown': this.panPx(0, -step); break;
        case '+': case '=': this.zoomBy(1.35); break;
        case '-': case '_': this.zoomBy(1 / 1.35); break;
        case 'Home': this.goHome(); break;
        case 'PageUp': this.stepBand(1); break;
        case 'PageDown': this.stepBand(-1); break;
        case 'q': case 'Q': if (this.renderer?.kind === '3d') this.rotate(Math.PI / 10, 0); else used = false; break;
        case 'e': case 'E': if (this.renderer?.kind === '3d') this.rotate(-Math.PI / 10, 0); else used = false; break;
        default: used = false;
      }
      if (used) e.preventDefault();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onMenu);
    canvas.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onMenu);
      canvas.removeEventListener('keydown', onKey);
    };
  }

  /** Page Up / Page Down: the next scale band out or in. */
  stepBand(dir: 1 | -1): void {
    const order: Band[] = ['globe', 'orbit', 'inner', 'system'];
    const d = this.goal.dist;
    let i = order.findIndex((b) => BAND_DIST[b] > d * 1.05);
    if (i < 0) i = order.length;
    if (dir > 0) {
      if (i >= order.length) return;
      this.goBand(order[i]);
    } else {
      let j = i - 1;
      while (j >= 0 && BAND_DIST[order[j]] >= d * 0.95) j--;
      if (j < 0) { this.goHome(); return; }
      this.goBand(order[j]);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
