// The 3D strategic map: a three.js scene built entirely from the seat's
// observation. Regions that are not in the observation do not exist in the scene;
// beyond them lies an illustrated parchment sheet. Rendering is on demand, with a
// slow ambient tick for water, smoke, hatching and traffic.
//
// The public surface mirrors the flat Atlas renderer so MapView can drive either.
import * as THREE from 'three';
import type { AtlasData, AtlasOverlay, Insets, MapMode } from '../map/atlas';
import { BUILT_RAMP, POP_RAMP, builtClass, popClass } from '../map/atlas';
import { SECTORS, SECTOR_COLOR, landUse } from '../map/landuse';
import { chipDataUrl, chipRadius, sectorChips } from '../map/sites';
import type { Deposit, RegionId, RegionView, Role } from '../protocol';
import { compact, peopleNum, range, tonnes } from '../format';
import { Builder } from './builder';
import { buildRegionDecor, decorSignature, eraOfFacilities, type DecorContext, type RegionDecor } from './decor';
import { armyStandard, depositBadge, standardKey, YIELD_SVG, type StandardSpec } from './icons';
import { esc, LabelLayer, type LabelSpec } from './labels';
import {
  makeGroundMaterial, makeGroundUniforms, makeModelMaterial, makeNoiseTexture, makeRibbonMaterial, makeRibbonUniforms,
  makeRiverMaterial, makeTableMaterial, type GroundUniforms, type RibbonUniforms, type RiverUniforms, type TableUniforms,
} from './materials';
import { Minimap } from './minimap';
import { settlementRadius } from './models';
import { buildParchmentDecals, disposeParchment, type ParchmentDecals } from './parchment';
import { PropLayer, type Clearings } from './props';
import { arcGeometry, ribbonGeometry, riverGeometry, type RibbonSpec } from './ribbons';
import { buildTerrain, groundAt, heightAt, type Heightfield, type RiverPath } from './terrain';
import { boundaryChains, buildTopology, chaikin, regionChain, regionIndexAt, resample, type Chain, type Topology, type TRegion } from './topology';
import { clamp, hash32, hexRgb, lerp, mixRgb, sepia, smoothstep, type RGB } from './util';

export type Map3DData = AtlasData;

export interface Map3DOptions {
  reducedMotion?: boolean;
  /**
   * 'auto' (default) lowers the cost on software renderers (no multisampling, simpler
   * shadows, one pixel per CSS pixel) without removing any information.
   */
  quality?: 'auto' | 'high' | 'low';
  labels: HTMLElement;
  minimap?: HTMLCanvasElement | null;
}

export interface DepositHit { region: RegionId; index: number }

interface Rig { tx: number; tz: number; dist: number; heading: number }
interface ManagedSprite { sprite: THREE.Sprite; px: number; pxLens: number; aspect: number; minW: number; maxW: number }
interface BadgeRef { sprite: THREE.Sprite; region: RegionId; index: number }

const FOV = 30;
const DIST_MIN = 130;
const ZOOM_REF = 1000;
const UNKNOWN_OWNER = '#6b6257';
const SETTLEMENT_RANK: Record<string, number> = { wilderness: 0, camp: 1, village: 2, town: 3, city: 4, metropolis: 5 };
const INK: RGB = [0.22, 0.16, 0.1];

/** True when WebGL is drawn by the CPU (SwiftShader, llvmpipe and similar). */
function softwareRenderer(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

export class Map3D {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 6, 12000);
  private scratch = new THREE.PerspectiveCamera(FOV, 1, 6, 12000);
  private sun = new THREE.DirectionalLight(0xfff1d6, 2.7);
  private hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8a7a5c, 1.35);
  private w = 0;
  private h = 0;
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private cur: Rig = { tx: 800, tz: 500, dist: 1800, heading: 0 };
  private goal: Rig = { tx: 800, tz: 500, dist: 1800, heading: 0 };
  private distMax = 4000;
  private raf = 0;
  private lastFrame = 0;
  private clock = 0;
  private ambient = 0;
  private reducedMotion: boolean;
  private destroyed = false;
  private dragging = false;
  private wasMoving = false;
  private probeNext = false;
  private ticks = 0;

  private data: Map3DData | null = null;
  private overlay: AtlasOverlay = { mode: 'political', selected: null, hovered: null, targets: undefined, marked: [] };
  private topo: Topology | null = null;
  private hf: Heightfield | null = null;
  private riverPaths: RiverPath[] = [];
  private terrainSig = '';
  private politicalSig = '';
  private armySig = '';
  private badgeSig = '';
  private netSig = '';
  private seatRgb = new Map<number, RGB>();
  private civEra = 0;

  // GPU resources
  private noiseTex = makeNoiseTexture();
  private groundU: GroundUniforms = makeGroundUniforms();
  private groundMat = makeGroundMaterial(this.groundU);
  private modelMat = makeModelMaterial();
  private tableU: TableUniforms;
  private tableMat: THREE.ShaderMaterial;
  private riverU: RiverUniforms;
  private riverMat: THREE.ShaderMaterial;
  private borderU: RibbonUniforms = makeRibbonUniforms(0.13, 0.7);
  private borderMat = makeRibbonMaterial(this.borderU);
  private inkU: RibbonUniforms = makeRibbonUniforms(1.1, 0);
  private inkMat = makeRibbonMaterial(this.inkU);
  private selU: RibbonUniforms = makeRibbonUniforms(0.2, 0.85);
  private selMat = makeRibbonMaterial(this.selU);
  private hoverU: RibbonUniforms = makeRibbonUniforms(0.24, 0.55);
  private hoverMat = makeRibbonMaterial(this.hoverU);
  private pickU: RibbonUniforms = makeRibbonUniforms(0.22, 0.6);
  private pickMat = makeRibbonMaterial(this.pickU);
  private laneU: RibbonUniforms = makeRibbonUniforms(1.1, 0);
  private laneMat = makeRibbonMaterial(this.laneU);
  private moveU: RibbonUniforms = makeRibbonUniforms(0.82, 0.2);
  private moveMat = makeRibbonMaterial(this.moveU);
  private attackU: RibbonUniforms = makeRibbonUniforms(0.82, 0.2);
  private attackMat = makeRibbonMaterial(this.attackU);
  private smokeMat = new THREE.MeshLambertMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.62, depthWrite: false });
  private columnMats: THREE.MeshLambertMaterial[] = [];
  private beaconMat: THREE.ShaderMaterial;
  private washTex: THREE.DataTexture | null = null;
  private hatchTex: THREE.DataTexture | null = null;
  private infoTex: THREE.DataTexture | null = null;
  private seaTex: THREE.DataTexture | null = null;
  private iconTex = new Map<string, THREE.CanvasTexture>();
  private spriteMats = new Map<string, THREE.SpriteMaterial>();

  // scene nodes
  private table: THREE.Mesh;
  private terrainMesh: THREE.Mesh | null = null;
  private riverMesh: THREE.Mesh | null = null;
  private borderMesh: THREE.Mesh | null = null;
  private inkMesh: THREE.Mesh | null = null;
  private laneMesh: THREE.Mesh | null = null;
  private selMesh: THREE.Mesh | null = null;
  private hoverMesh: THREE.Mesh | null = null;
  private pickMesh: THREE.Mesh | null = null;
  private markMesh: THREE.Mesh | null = null;
  private netMesh: THREE.Mesh | null = null;
  private props: PropLayer;
  private decorGroup = new THREE.Group();
  private decor = new Map<number, { sig: string; d: RegionDecor; mesh: THREE.Mesh | null }>();
  private armyGroup = new THREE.Group();
  private badgeGroup = new THREE.Group();
  private beaconGroup = new THREE.Group();
  private columnGroup = new THREE.Group();
  private smokeMesh: THREE.InstancedMesh | null = null;
  private smokeSrc: number[] = [];
  private trafficMesh: THREE.InstancedMesh | null = null;
  private trafficPaths: { pts: number[]; len: number; boat: boolean }[] = [];
  private decals: ParchmentDecals | null = null;
  private sprites: ManagedSprite[] = [];
  private badges: BadgeRef[] = [];
  private armyLabels: LabelSpec[] = [];
  private labels: LabelLayer;
  private minimap: Minimap | null = null;

  private ray = new THREE.Raycaster();
  private v3 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();

  lastDrawMs = 0;
  frames = 0;
  /** True when the reduced-cost path is in use (software rendering or by request). */
  lowQuality = false;
  onViewChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, opts: Map3DOptions) {
    this.canvas = canvas;
    this.reducedMotion = !!opts.reducedMotion;
    const low = opts.quality === 'low' || (opts.quality !== 'high' && softwareRenderer());
    this.lowQuality = low;
    if (low) this.pixelRatio = 1;
    // Throws when WebGL is unavailable; MapView falls back to the flat atlas.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(0x2c1d12, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.labels = new LabelLayer(opts.labels);
    if (opts.minimap) this.minimap = new Minimap(opts.minimap, (x, z) => this.jumpTo(x, z));

    this.groundU.tNoise.value = this.noiseTex;
    this.tableU = {
      tNoise: { value: this.noiseTex }, tSea: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSheet: { value: new THREE.Vector4(800, 500, 1080, 760) }, uFrame: { value: new THREE.Vector4(800, 500, 800, 500) },
      uTime: this.groundU.uTime, uGrid: { value: 100 },
    };
    this.tableMat = makeTableMaterial(this.tableU);
    this.riverU = { tNoise: { value: this.noiseTex }, tInfo: { value: null }, uRect: this.groundU.uRect, uTime: this.groundU.uTime };
    this.riverMat = makeRiverMaterial(this.riverU);
    for (const u of [this.borderU, this.inkU, this.selU, this.hoverU, this.pickU, this.laneU, this.moveU, this.attackU]) u.uTime = this.groundU.uTime;
    this.inkU.uOpacity.value = 0.3;
    this.selU.uPulse.value = 1;
    this.pickU.uDash.value = 7;
    this.laneU.uDash.value = 9;
    this.laneU.uOpacity.value = 0.55;
    this.laneU.uBias.value = 0;
    this.moveU.uDash.value = 6;
    for (const u of [this.inkU, this.laneU, this.moveU, this.attackU]) u.uLip.value = 0;
    this.beaconMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.groundU.uTime },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.5 + 0.12 * sin(uTime * 2.4 + vUv.y * 18.0)); gl_FragColor = vec4(vec3(1.0, 0.78, 0.25) * a, a); }',
    });
    for (let i = 0; i < POP_RAMP.length; i++) {
      this.columnMats.push(new THREE.MeshLambertMaterial({ color: new THREE.Color(POP_RAMP[i]), emissive: new THREE.Color(POP_RAMP[i]), emissiveIntensity: 0.35, transparent: true, opacity: 0.82 }));
    }

    const plane = new THREE.PlaneGeometry(16000, 16000);
    plane.rotateX(-Math.PI / 2);
    this.table = new THREE.Mesh(plane, this.tableMat);
    this.table.renderOrder = -2;
    this.table.position.set(800, 0, 500);
    this.scene.add(this.table);
    this.props = new PropLayer(this.modelMat);
    this.scene.add(this.props.group, this.decorGroup, this.armyGroup, this.badgeGroup, this.beaconGroup, this.columnGroup);
    this.columnGroup.visible = false;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    const maxTex = this.renderer.capabilities.maxTextureSize;
    const sm = maxTex >= 4096 && !low ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0001;
    this.sun.shadow.normalBias = 0.2;
    this.sun.shadow.radius = 2.2;

    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();
    this.startAmbient();
  }

  // --- lifecycle ---------------------------------------------------------------------

  private onVisibility = () => {
    if (document.hidden) this.stopAmbient(); else { this.startAmbient(); this.invalidate(); }
  };
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLostCb?.();
  };
  /** Called when the GL context is lost; MapView falls back to the flat atlas. */
  onContextLostCb: (() => void) | null = null;

  private startAmbient(): void {
    if (this.ambient || this.reducedMotion || this.destroyed || document.hidden) return;
    const tick = () => {
      this.ambient = 0;
      if (this.destroyed || this.reducedMotion || document.hidden) return;
      // Slow down when frames are expensive (weak GPUs, software rendering).
      const period = this.frameCost > 90 ? 420 : this.frameCost > 40 ? 220 : this.frameCost > 20 ? 130 : 80;
      // Now and then draw two frames back to back to re-measure the cost while idle.
      if (this.ticks++ % 40 === 1) this.probeNext = true;
      this.invalidate();
      this.ambient = window.setTimeout(tick, period);
    };
    this.ambient = window.setTimeout(tick, 120);
  }
  private stopAmbient(): void {
    if (this.ambient) window.clearTimeout(this.ambient);
    this.ambient = 0;
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
    if (v) this.stopAmbient(); else this.startAmbient();
    this.invalidate();
  }

  destroy(): void {
    this.destroyed = true;
    this.stopAmbient();
    if (this.raf) cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.labels.dispose();
    this.minimap?.dispose();
    disposeObject(this.scene);
    this.props.dispose();
    if (this.decals) disposeParchment(this.decals);
    for (const t of [this.noiseTex, this.washTex, this.hatchTex, this.infoTex, this.seaTex]) t?.dispose();
    for (const t of this.iconTex.values()) t.dispose();
    for (const m of this.spriteMats.values()) m.dispose();
    for (const m of [this.groundMat, this.modelMat, this.tableMat, this.riverMat, this.borderMat, this.inkMat, this.selMat, this.hoverMat, this.pickMat, this.laneMat, this.moveMat, this.attackMat, this.smokeMat, this.beaconMat, ...this.columnMats]) m.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
  }

  get zoom(): number {
    return ZOOM_REF / this.goal.dist;
  }
  get hasData(): boolean {
    return !!this.topo && this.topo.regions.length > 0;
  }
  get mode(): MapMode {
    return this.overlay.mode;
  }
  get heading(): number {
    return this.cur.heading;
  }
  get stats(): { props: number; triangles: number; calls: number; regions: number } {
    const i = this.renderer.info.render;
    return { props: this.props.count, triangles: i.triangles, calls: i.calls, regions: this.topo?.regions.length ?? 0 };
  }

  // --- view ---------------------------------------------------------------------------

  resize(): boolean {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return false;
    if (w === this.w && h === this.h) return false;
    this.w = w; this.h = h;
    this.pixelRatio = Math.min(this.pixelRatio, 2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.updateLimits();
    this.invalidate();
    return true;
  }

  setInsets(i: Insets): void {
    this.insets = { ...i };
    this.updateLimits();
    this.invalidate();
  }

  private pitchFor(dist: number): number {
    // Lower and more scenic up close, steeper and more map-like from afar.
    return lerp(0.72, 1.04, smoothstep(160, 2600, dist));
  }

  private applyRig(cam: THREE.PerspectiveCamera, s: Rig): void {
    const p = this.pitchFor(s.dist);
    const w = Math.max(1, this.w), h = Math.max(1, this.h);
    cam.aspect = w / h;
    const ox = (this.insets.left - this.insets.right) / 2, oy = (this.insets.top - this.insets.bottom) / 2;
    if (ox || oy) cam.setViewOffset(w, h, -ox, -oy, w, h); else cam.clearViewOffset();
    cam.position.set(s.tx + s.dist * Math.sin(s.heading) * Math.cos(p), s.dist * Math.sin(p), s.tz + s.dist * Math.cos(s.heading) * Math.cos(p));
    cam.up.set(0, 1, 0);
    cam.lookAt(s.tx, 0, s.tz);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  private box(): { x: number; y: number; w: number; h: number } {
    const i = this.insets;
    const w = Math.max(40, this.w - i.left - i.right), h = Math.max(40, this.h - i.top - i.bottom);
    return { x: i.left, y: i.top, w, h };
  }

  private unitsPerPx(dist: number): number {
    return (2 * dist * Math.tan((FOV * Math.PI) / 360)) / Math.max(1, this.h);
  }

  /** Camera state that frames a world rectangle inside the uncovered box. */
  private frameRect(x0: number, z0: number, x1: number, z1: number, heading: number, topY: number): Rig {
    const s: Rig = { tx: (x0 + x1) / 2, tz: (z0 + z1) / 2, dist: 1500, heading };
    const b = this.box();
    const pad = 0.045;
    const bx0 = b.x + b.w * pad, bx1 = b.x + b.w * (1 - pad), by0 = b.y + b.h * (pad + 0.02), by1 = b.y + b.h * (1 - pad) - Math.min(46, b.h * 0.08);
    const corners: [number, number, number][] = [
      [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, topY, z0], [x1, topY, z0],
    ];
    const v = this.v3;
    const extent = (): [number, number, number, number] => {
      this.applyRig(this.scratch, s);
      let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
      for (const c of corners) {
        v.set(c[0], c[1], c[2]).project(this.scratch);
        const sx = (v.x * 0.5 + 0.5) * this.w, sy = (-v.y * 0.5 + 0.5) * this.h;
        if (v.z > 1) return [-1e9, -1e9, 1e9, 1e9];
        mx0 = Math.min(mx0, sx); mx1 = Math.max(mx1, sx); my0 = Math.min(my0, sy); my1 = Math.max(my1, sy);
      }
      return [mx0, my0, mx1, my1];
    };
    for (let pass = 0; pass < 4; pass++) {
      let lo = DIST_MIN, hi = 9000;
      for (let k = 0; k < 20; k++) {
        s.dist = (lo + hi) / 2;
        const e = extent();
        if (e[2] - e[0] <= bx1 - bx0 && e[3] - e[1] <= by1 - by0) hi = s.dist; else lo = s.dist;
      }
      s.dist = hi;
      const e = extent();
      const u = this.unitsPerPx(s.dist);
      const dx = ((e[0] + e[2]) / 2 - (bx0 + bx1) / 2) * u, dy = (((e[1] + e[3]) / 2 - (by0 + by1) / 2) * u) / Math.sin(this.pitchFor(s.dist));
      const ch = Math.cos(heading), sh = Math.sin(heading);
      s.tx += dx * ch + dy * sh;
      s.tz += -dx * sh + dy * ch;
    }
    return s;
  }

  private updateLimits(): void {
    if (this.w <= 0) return;
    const W = this.data?.world.width ?? 1600, H = this.data?.world.height ?? 1000;
    const s = this.frameRect(-90, -90, W + 90, H + 90, 0, 0);
    this.distMax = Math.max(700, s.dist * 1.12);
    this.clampRig(this.goal);
    this.clampRig(this.cur);
  }

  private clampRig(s: Rig): void {
    const W = this.data?.world.width ?? 1600, H = this.data?.world.height ?? 1000;
    s.dist = clamp(s.dist, DIST_MIN, this.distMax);
    s.tx = clamp(s.tx, -60, W + 60);
    s.tz = clamp(s.tz, -60, H + 60);
  }

  private goTo(s: Rig, animate: boolean): void {
    this.clampRig(s);
    this.goal = s;
    if (!animate || this.reducedMotion) this.cur = { ...s };
    this.viewChanged();
  }

  private viewChanged(): void {
    this.invalidate();
    this.onViewChange?.();
  }

  fit(animate = false): void {
    if (!this.topo || this.w <= 0) return;
    const b = this.topo.bbox;
    const m = 46;
    const s = this.frameRect(b[0] - m, b[1] - m, b[2] + m, b[3] + m, 0, Math.min(30, (this.hf?.maxH ?? 0) * 0.5));
    s.dist = Math.max(s.dist, 300);
    this.goTo(s, animate);
  }

  focusRegion(id: RegionId, animate = true): void {
    const p = this.topo?.byId.get(id);
    if (!p) return;
    // Close enough to read the settlement and its districts, never farther than the current view.
    const size = Math.max(p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]);
    const want = clamp(size * 2.6, 300, 620);
    this.goTo({ tx: p.cx, tz: p.cy, dist: Math.min(this.goal.dist, want), heading: this.goal.heading }, animate);
  }

  /** Look at a region from a given distance (dev harness and tests). */
  lookAt(x: number, z: number, dist: number, heading = 0): void {
    this.goTo({ tx: x, tz: z, dist, heading }, false);
  }

  private jumpTo(x: number, z: number): void {
    this.goTo({ ...this.goal, tx: x, tz: z }, true);
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const g = this.goal;
    const nd = clamp(g.dist / factor, DIST_MIN, this.distMax);
    if (nd === g.dist) return;
    // Keep the ground point under the cursor in place.
    this.applyRig(this.scratch, g);
    const hit = this.groundPoint(sx, sy, this.scratch);
    const k = nd / g.dist;
    const s: Rig = { ...g, dist: nd };
    if (hit) { s.tx = hit[0] + (g.tx - hit[0]) * k; s.tz = hit[1] + (g.tz - hit[1]) * k; }
    this.goTo(s, true);
  }

  zoomBy(factor: number): void {
    const b = this.box();
    this.zoomAt(factor, b.x + b.w / 2, b.y + b.h / 2);
  }

  /** Move the picture by (dx, dy) pixels. */
  panBy(dx: number, dy: number, animate = false): void {
    const g = this.goal;
    const u = this.unitsPerPx(g.dist);
    const fx = -dx * u, fz = (-dy * u) / Math.sin(this.pitchFor(g.dist));
    const ch = Math.cos(g.heading), sh = Math.sin(g.heading);
    this.goTo({ ...g, tx: g.tx + fx * ch + fz * sh, tz: g.tz - fx * sh + fz * ch }, animate);
  }

  rotateBy(rad: number, animate = true): void {
    this.goTo({ ...this.goal, heading: this.goal.heading + rad }, animate);
  }

  resetNorth(): void {
    // Take the short way round.
    let h = this.goal.heading % (Math.PI * 2);
    if (h > Math.PI) h -= Math.PI * 2;
    if (h < -Math.PI) h += Math.PI * 2;
    this.cur.heading = h + (this.cur.heading - this.goal.heading);
    this.goTo({ ...this.goal, heading: 0 }, true);
  }

  setDragging(v: boolean): void {
    this.dragging = v;
  }

  // --- projection and picking ------------------------------------------------------------

  private project(x: number, y: number, z: number): [number, number, boolean] {
    const v = this.v3.set(x, y, z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h, v.z > -1 && v.z < 1];
  }

  /** Point where the view ray through a canvas pixel meets the sea-level plane. */
  private groundPoint(sx: number, sy: number, cam: THREE.PerspectiveCamera): [number, number] | null {
    this.ray.setFromCamera(new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1), cam);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (d.y > -1e-4) return null;
    const t = -o.y / d.y;
    return [o.x + d.x * t, o.z + d.z * t];
  }

  /** Ray-march the heightfield: world x,z of the terrain under a canvas pixel. */
  private terrainPoint(sx: number, sy: number): [number, number] | null {
    const hf = this.hf;
    this.ray.setFromCamera(new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1), this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (d.y > -1e-4) return null;
    const tEnd = -o.y / d.y;
    if (!hf) return [o.x + d.x * tEnd, o.z + d.z * tEnd];
    const tStart = Math.max(0, (hf.maxH + 1 - o.y) / d.y);
    const step = 2.2;
    let prev = tStart;
    for (let t = tStart; t <= tEnd + step; t += step) {
      const tt = Math.min(t, tEnd);
      const y = o.y + d.y * tt;
      if (y <= heightAt(hf, o.x + d.x * tt, o.z + d.z * tt)) {
        let lo = prev, hi = tt;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) / 2;
          if (o.y + d.y * mid <= heightAt(hf, o.x + d.x * mid, o.z + d.z * mid)) hi = mid; else lo = mid;
        }
        return [o.x + d.x * hi, o.z + d.z * hi];
      }
      prev = tt;
    }
    return [o.x + d.x * tEnd, o.z + d.z * tEnd];
  }

  regionAt(sx: number, sy: number): RegionId | null {
    if (!this.topo || this.w <= 0) return null;
    const p = this.terrainPoint(sx, sy);
    if (!p) return null;
    const i = regionIndexAt(this.topo.fields, p[0], p[1]);
    return i >= 0 ? this.topo.regions[i].r.id : null;
  }

  /** Canvas position of a region's centre on the ground. */
  regionCenter(id: RegionId): [number, number] | null {
    const p = this.topo?.byId.get(id);
    if (!p || !this.hf) return null;
    const [x, y] = this.project(p.cx, groundAt(this.hf, p.cx, p.cy), p.cy);
    return [x, y];
  }

  /** The resource badge under a canvas pixel, if any. */
  depositAt(sx: number, sy: number): DepositHit | null {
    let best: DepositHit | null = null;
    let bd = Infinity;
    for (const b of this.badges) {
      const s = b.sprite;
      if (!s.visible) continue;
      const hgt = s.scale.y;
      const [x, y, ok] = this.project(s.position.x, s.position.y + hgt * 0.6, s.position.z);
      if (!ok) continue;
      const u = this.unitsPerPx(this.camera.position.distanceTo(s.position));
      const r = (hgt * 0.36) / u + 2;
      const d = Math.hypot(x - sx, y - sy);
      if (d < r && d < bd) { bd = d; best = { region: b.region, index: b.index }; }
    }
    return best;
  }

  // --- data -------------------------------------------------------------------------------

  private colorOf(seat: number | null): string {
    if (seat == null) return UNKNOWN_OWNER;
    return this.data?.seatColors[seat] ?? UNKNOWN_OWNER;
  }
  private rgbOf(seat: number | null): RGB {
    if (seat == null) return [0.74, 0.62, 0.46];
    let c = this.seatRgb.get(seat);
    if (!c) { c = hexRgb(this.colorOf(seat)); this.seatRgb.set(seat, c); }
    return c;
  }

  setData(d: Map3DData): void {
    if (this.destroyed) return;
    this.data = d;
    this.seatRgb.clear();
    let tsig = `${d.world.width}x${d.world.height}`;
    for (const r of d.regions) {
      let known = 0, links = '';
      for (const n of r.neighbors) { if (n.kind === 'river') links += 'r' + n.region; if (n.kind === 'sea') links += 's' + n.region; }
      for (const n of r.neighbors) known += n.region;
      tsig += `|${r.id}:${r.terrain[0]}${r.terrain[1]}:${r.elevation}:${r.river ? 1 : 0}${r.coastal ? 1 : 0}${r.visibility === 'remembered' ? 1 : 0}:${known}${links}`;
    }
    let terrainChanged = false;
    if (tsig !== this.terrainSig) {
      this.terrainSig = tsig;
      this.rebuildTerrain(d);
      terrainChanged = true;
    }
    const topo = this.topo, hf = this.hf;
    if (!topo || !hf) return;
    // The topology holds the previous RegionView objects when only details changed: refresh them.
    for (const r of d.regions) {
      const p = topo.byId.get(r.id);
      if (p) p.r = r;
    }
    let civEra = 0;
    for (const r of d.regions) if (r.own) civEra = Math.max(civEra, eraOfFacilities(r.own.facilities));
    this.civEra = civEra;

    // Region dressing: rebuild only regions whose signature changed.
    const ctx: DecorContext = {
      topo, hf, rivers: this.riverPaths, seatColor: (s) => this.rgbOf(s), capital: d.capital, civEra, categories: d.facilityCategories ?? {},
      building: d.construction,
    };
    let decorChanged = terrainChanged;
    for (const p of topo.regions) {
      const sig = decorSignature(p.r, d.capital, civEra, this.colorOf(p.r.owner), d.construction?.[p.r.id]?.levels ?? 0);
      const have = this.decor.get(p.r.id);
      if (have && have.sig === sig) continue;
      if (have?.mesh) { this.decorGroup.remove(have.mesh); have.mesh.geometry.dispose(); }
      const dec = buildRegionDecor(p, ctx);
      let mesh: THREE.Mesh | null = null;
      if (dec.geometry) {
        mesh = new THREE.Mesh(dec.geometry, this.modelMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.decorGroup.add(mesh);
      }
      this.decor.set(p.r.id, { sig, d: dec, mesh });
      decorChanged = true;
    }
    for (const [id, have] of this.decor) {
      if (topo.byId.has(id)) continue;
      if (have.mesh) { this.decorGroup.remove(have.mesh); have.mesh.geometry.dispose(); }
      this.decor.delete(id);
      decorChanged = true;
    }
    if (decorChanged) {
      const clear: Clearings = new Map();
      for (const [id, have] of this.decor) clear.set(id, have.d.clear);
      this.props.rebuild(topo, hf, clear);
      this.rebuildSmoke();
      this.rebuildBeacons();
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.rebuildNetwork(d, decorChanged);

    let psig = '';
    for (const r of d.regions) {
      psig += `|${r.id}:${r.owner}:${r.controller}:${r.visibility[0]}:${r.survey ? (r.survey.detailed ? 2 : 1) : 0}:${r.own ? popClass(r.own.population) : r.foreign ? popClass((r.foreign.population_low + r.foreign.population_high) / 2) : -1}:${this.colorOf(r.owner)}`;
    }
    if (psig !== this.politicalSig || terrainChanged) {
      this.politicalSig = psig;
      this.paintOverlay();
      this.rebuildBorders();
      this.rebuildColumns();
      this.minimap?.setWorld(topo, (s) => (s == null ? null : this.colorOf(s)));
    } else this.rebuildColumns();
    this.rebuildBadges(decorChanged);
    this.rebuildArmies();
    this.rebuildOutlines();
    this.rebuildLabels();
    this.updateLimits();
    this.invalidate();
  }

  /** Language changed: regenerate label text. `uncharted` captions the blank parchment. */
  refreshText(uncharted?: string): void {
    if (uncharted !== undefined) this.caption = uncharted;
    this.rebuildLabels();
    this.invalidate();
  }
  private caption = '';

  /**
   * Render now and count distinct colours on a coarse grid of the frame buffer.
   * A blank canvas gives 1; used by the screenshot script to catch a dead renderer.
   */
  probe(): number {
    this.drawNow();
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const seen = new Set<number>();
    for (let j = 1; j < 12; j++) {
      for (let i = 1; i < 18; i++) {
        gl.readPixels(Math.floor((w * i) / 18), Math.floor((h * j) / 12), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        seen.add(((px[0] >> 3) << 10) | ((px[1] >> 3) << 5) | (px[2] >> 3));
      }
    }
    return seen.size;
  }

  setOverlay(o: Partial<AtlasOverlay>): void {
    const prev = this.overlay;
    const next = { ...prev, ...o };
    const sameMarks = prev.marked.length === next.marked.length && prev.marked.every((v, i) => v === next.marked[i]);
    if (prev.mode === next.mode && prev.selected === next.selected && prev.hovered === next.hovered && prev.targets === next.targets && sameMarks) return;
    this.overlay = next;
    if (!this.topo) return;
    if (prev.mode !== next.mode || prev.targets !== next.targets) {
      this.paintOverlay();
      this.rebuildColumns();
      this.applyBadgeMode();
    }
    this.rebuildOutlines();
    if (prev.mode !== next.mode || prev.selected !== next.selected || prev.hovered !== next.hovered) this.rebuildLabels();
    this.invalidate();
  }

  // --- terrain ------------------------------------------------------------------------------

  private rebuildTerrain(d: Map3DData): void {
    const t0 = performance.now();
    const topo = buildTopology(d.regions, d.world.width, d.world.height);
    const tb = buildTerrain(topo);
    this.topo = topo;
    this.hf = tb.hf;
    this.riverPaths = tb.rivers;
    for (const m of [this.terrainMesh, this.riverMesh]) {
      if (m) { this.scene.remove(m); m.geometry.dispose(); }
    }
    this.terrainMesh = new THREE.Mesh(tb.geometry, this.groundMat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.terrainMesh.renderOrder = -1;
    this.scene.add(this.terrainMesh);
    this.riverMesh = new THREE.Mesh(riverGeometry(tb.rivers, tb.hf), this.riverMat);
    this.riverMesh.renderOrder = 1;
    this.scene.add(this.riverMesh);

    // Everything that sits on the ground is stale now.
    for (const have of this.decor.values()) if (have.mesh) { this.decorGroup.remove(have.mesh); have.mesh.geometry.dispose(); }
    this.decor.clear();
    this.badgeSig = '';
    this.netSig = '';
    this.armySig = '';

    const f = topo.fields;
    const W = d.world.width, H = d.world.height;
    this.groundU.uRect.value.set(f.x0, f.z0, 1 / (f.nx * f.cell), 1 / (f.nz * f.cell));
    this.tableU.uRect.value.copy(this.groundU.uRect.value);
    this.tableU.uSheet.value.set(W / 2, H / 2, W / 2 + 300, H / 2 + 270);
    this.tableU.uFrame.value.set(W / 2, H / 2, W / 2, H / 2);
    this.table.position.set(W / 2, 0, H / 2);

    // Sea texture: distance to certain coast, and how far the charted water reaches.
    const n = f.nx * f.nz;
    const sea = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const dc = f.dCoast[i], du = f.dUnk[i];
      sea[i * 4] = clamp(Math.round((dc / 160) * 255), 0, 255);
      const k = (1 - smoothstep(60, 150, dc)) * smoothstep(8, 60, du);
      sea[i * 4 + 1] = Math.round(k * 255);
      sea[i * 4 + 3] = 255;
    }
    this.seaTex?.dispose();
    this.seaTex = this.dataTexture(sea, f.nx, f.nz, false);
    this.tableU.tSea.value = this.seaTex;
    for (const t of [this.washTex, this.hatchTex, this.infoTex]) t?.dispose();
    this.washTex = this.dataTexture(new Uint8Array(n * 4), f.nx, f.nz, true);
    this.hatchTex = this.dataTexture(new Uint8Array(n * 4), f.nx, f.nz, true);
    this.infoTex = this.dataTexture(new Uint8Array(n * 4), f.nx, f.nz, false);
    this.groundU.tWash.value = this.washTex;
    this.groundU.tHatch.value = this.hatchTex;
    this.groundU.tInfo.value = this.infoTex;
    this.riverU.tInfo.value = this.infoTex;

    // Sun and its shadow frustum over the known land.
    const b = topo.bbox;
    const cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
    const half = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 40;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx - 0.66 * 1800, 0.66 * 1800, cz - 0.4 * 1800);
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = Math.max(50, 1800 * 1.02 - half - 120); sc.far = 1800 * 1.02 + half + 120;
    sc.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;

    // Parchment illustrations live where nothing is known.
    if (this.decals) { this.scene.remove(this.decals.group); disposeParchment(this.decals); }
    this.decals = buildParchmentDecals(topo, hash32(d.world.region_count, d.world.width));
    this.scene.add(this.decals.group);

    // Internal borders, inked.
    if (this.inkMesh) { this.scene.remove(this.inkMesh); this.inkMesh.geometry.dispose(); }
    const specs: RibbonSpec[] = [];
    for (const e of topo.edges) {
      if (e.kind !== 'internal') continue;
      specs.push({ chain: { key: 0, pts: e.pts, closed: false, side: 1 }, color: INK, width: 1.15, centered: true, lift: 0.4 });
    }
    this.inkMesh = new THREE.Mesh(ribbonGeometry(specs, tb.hf, 3.2), this.inkMat);
    this.inkMesh.renderOrder = 2;
    this.scene.add(this.inkMesh);
    // Sea lanes as dashed arcs on the water.
    if (this.laneMesh) { this.scene.remove(this.laneMesh); this.laneMesh.geometry.dispose(); }
    const lanes: RibbonSpec[] = [];
    for (const l of topo.seaLanes) {
      const pts: number[] = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24, u = 1 - t;
        pts.push(u * u * l.ax + 2 * u * t * l.cx + t * t * l.bx, u * u * l.ay + 2 * u * t * l.cy + t * t * l.by);
      }
      lanes.push({ chain: { key: 0, pts, closed: false, side: 1 }, color: [0.97, 0.99, 1], width: 1.5, centered: true, lift: 0.22, level: true });
    }
    this.laneMesh = new THREE.Mesh(ribbonGeometry(lanes, tb.hf, 4), this.laneMat);
    this.laneMesh.renderOrder = 2;
    this.scene.add(this.laneMesh);
    this.buildMs = performance.now() - t0;
  }
  buildMs = 0;

  private dataTexture(data: Uint8Array<ArrayBuffer>, w: number, h: number, srgb: boolean): THREE.DataTexture {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /** Per-region wash, hatch and state flags, written into the ground's data textures. */
  private paintOverlay(): void {
    const topo = this.topo, d = this.data;
    if (!topo || !d || !this.washTex || !this.hatchTex || !this.infoTex) return;
    const mode = this.overlay.mode;
    const targets = this.overlay.targets;
    const R = topo.regions.length;
    const wash = new Uint8Array(R * 4), hatch = new Uint8Array(R * 4), info = new Uint8Array(R * 3);
    const put = (a: Uint8Array, i: number, c: RGB, alpha: number) => {
      a[i * 4] = Math.round(clamp(c[0], 0, 1) * 255); a[i * 4 + 1] = Math.round(clamp(c[1], 0, 1) * 255);
      a[i * 4 + 2] = Math.round(clamp(c[2], 0, 1) * 255); a[i * 4 + 3] = Math.round(clamp(alpha, 0, 1) * 255);
    };
    for (const p of topo.regions) {
      const r = p.r;
      const i = p.idx;
      const rem = r.visibility === 'remembered';
      info[i * 3] = rem ? 255 : 0;
      let hatchDir = 0;
      if (mode === 'political') {
        if (r.owner != null) {
          const c = this.rgbOf(r.owner);
          put(wash, i, rem ? mixRgb(sepia(c, 0.45), [0.93, 0.88, 0.74], 0.25) : c, rem ? 0.8 : 1);
        }
      } else if (mode === 'construction') {
        // The same classes as the flat tier's development view.
        const use = landUse(r, d.facilityCategories);
        if (use) put(wash, i, hexRgb(BUILT_RAMP[builtClass(use.total)]), 1);
      } else if (mode === 'population') {
        const pop = r.own ? r.own.population : r.foreign ? (r.foreign.population_low + r.foreign.population_high) / 2 : -1;
        if (pop >= 0) put(wash, i, hexRgb(POP_RAMP[popClass(pop)]), rem ? 0.6 : 1);
        if (r.foreign && !r.own) { put(hatch, i, [0.97, 0.95, 0.88], 0.4); hatchDir = 1; }
      } else if (mode === 'resources') {
        if (!r.survey) { put(hatch, i, [0.42, 0.38, 0.33], 0.5); hatchDir = 1; }
        else if (!r.survey.detailed) { put(hatch, i, [0.5, 0.46, 0.4], 0.22); hatchDir = 1; }
      }
      if (r.controller != null && r.controller !== r.owner) {
        put(hatch, i, this.rgbOf(r.controller), mode === 'political' ? 0.9 : 0.45);
        hatchDir = 0;
      }
      info[i * 3 + 1] = targets && !targets.includes(r.id) ? 140 : 0;
      info[i * 3 + 2] = hatchDir ? 255 : 0;
    }
    const f = topo.fields;
    const n = f.nx * f.nz;
    const W = this.washTex.image.data as Uint8Array, Hh = this.hatchTex.image.data as Uint8Array, I = this.infoTex.image.data as Uint8Array;
    for (let c = 0; c < n; c++) {
      const id = f.id[c];
      const o = c * 4;
      I[o] = Math.round(smoothstep(2, 30, f.dUnk[c]) * 255);
      if (id < 0) {
        W[o + 3] = 0; Hh[o + 3] = 0; I[o + 1] = 0; I[o + 2] = 0; I[o + 3] = 0;
        continue;
      }
      const s = id * 4;
      W[o] = wash[s]; W[o + 1] = wash[s + 1]; W[o + 2] = wash[s + 2]; W[o + 3] = wash[s + 3];
      Hh[o] = hatch[s]; Hh[o + 1] = hatch[s + 1]; Hh[o + 2] = hatch[s + 2]; Hh[o + 3] = hatch[s + 3];
      I[o + 1] = info[id * 3]; I[o + 2] = info[id * 3 + 1]; I[o + 3] = info[id * 3 + 2];
    }
    // Remembered state bleeds a little past the shore so the ink look has no hard rim.
    this.washTex.needsUpdate = true;
    this.hatchTex.needsUpdate = true;
    this.infoTex.needsUpdate = true;
    this.groundU.uLens.value = mode === 'population' ? 0.55 : 0;
    this.groundU.uDesat.value = mode === 'resources' ? 0.35 : mode === 'population' ? 0.25 : 0;
    this.groundU.uHatchPeriod.value = 5.2;
    if (this.laneMesh) this.laneMesh.visible = true;
    this.laneU.uOpacity.value = mode === 'terrain' ? 0.85 : 0.4;
  }

  private setMesh(slot: 'borderMesh' | 'selMesh' | 'hoverMesh' | 'pickMesh' | 'markMesh', specs: RibbonSpec[], mat: THREE.Material, order: number): void {
    const old = this[slot];
    if (old) { this.scene.remove(old); old.geometry.dispose(); this[slot] = null; }
    if (!specs.length || !this.hf) return;
    const m = new THREE.Mesh(ribbonGeometry(specs, this.hf), mat);
    m.renderOrder = order;
    m.frustumCulled = false;
    this[slot] = m;
    this.scene.add(m);
  }

  private rebuildBorders(): void {
    const topo = this.topo;
    if (!topo) return;
    const chains = boundaryChains(topo, (p) => p.r.owner);
    const specs: RibbonSpec[] = chains.map((c) => {
      const base = this.rgbOf(c.key);
      // Keep the line vivid even for muted civilisation colours.
      const col = mixRgb(base, [1, 1, 1], 0.06);
      return { chain: c, color: col, width: 16, lift: 0.6 };
    });
    this.setMesh('borderMesh', specs, this.borderMat, 3);
  }

  private rebuildOutlines(): void {
    const topo = this.topo;
    if (!topo) return;
    const ov = this.overlay;
    const sel = ov.selected != null ? topo.byId.get(ov.selected) : undefined;
    this.setMesh('selMesh', sel ? [{ chain: regionChain(sel), color: [1, 0.9, 0.5], width: 8, lift: 0.75 }] : [], this.selMat, 5);
    const hov = ov.hovered != null && ov.hovered !== ov.selected ? topo.byId.get(ov.hovered) : undefined;
    this.setMesh('hoverMesh', hov ? [{ chain: regionChain(hov), color: [1, 1, 1], width: 4.2, lift: 0.7 }] : [], this.hoverMat, 4);
    const picks: RibbonSpec[] = [];
    if (ov.targets) {
      for (const id of ov.targets) {
        const p = topo.byId.get(id);
        if (p) picks.push({ chain: regionChain(p), color: [0.62, 0.95, 0.42], width: 6, lift: 0.65 });
      }
    }
    this.setMesh('pickMesh', picks, this.pickMat, 4);
    const marks: RibbonSpec[] = [];
    for (const id of ov.marked) {
      const p = topo.byId.get(id);
      if (!p) continue;
      const pts: number[] = [];
      const rad = Math.min(24, p.inradius * 0.7) + 4;
      for (let k = 0; k < 40; k++) pts.push(p.cx + Math.cos((k / 40) * Math.PI * 2) * rad, p.cy + Math.sin((k / 40) * Math.PI * 2) * rad);
      marks.push({ chain: { key: id, pts, closed: true, side: 1 }, color: [0.86, 0.26, 0.16], width: 2.6, centered: true, lift: 0.8 });
    }
    this.setMesh('markMesh', marks, this.markMat(), 5);
  }
  private markMaterial: THREE.ShaderMaterial | null = null;
  private markMat(): THREE.ShaderMaterial {
    if (!this.markMaterial) {
      const u = makeRibbonUniforms(1.1, 0);
      u.uTime = this.groundU.uTime;
      u.uLip.value = 0;
      this.markMaterial = makeRibbonMaterial(u);
    }
    return this.markMaterial;
  }

  // --- roads, rail and their traffic ----------------------------------------------------------

  private rebuildNetwork(d: Map3DData, force: boolean): void {
    const topo = this.topo, hf = this.hf;
    if (!topo || !hf) return;
    const has = (r: RegionView, kind: string) => !!r.own?.facilities.some((f) => f.kind === kind && f.level > 0);
    let sig = '';
    const links: { a: TRegion; b: TRegion; rail: boolean }[] = [];
    const sea: { a: TRegion; b: TRegion }[] = [];
    for (const p of topo.regions) {
      if (!p.r.own || p.r.visibility !== 'own') continue;
      for (const n of p.r.neighbors) {
        if (n.region <= p.r.id) continue;
        const q = topo.byId.get(n.region);
        if (!q || !q.r.own || q.r.visibility !== 'own') continue;
        if (n.kind === 'sea') {
          if (has(p.r, 'port') && has(q.r, 'port')) { sea.push({ a: p, b: q }); sig += `|s${p.r.id}-${q.r.id}`; }
          continue;
        }
        const road = has(p.r, 'roads') && has(q.r, 'roads'), rail = has(p.r, 'rail') && has(q.r, 'rail');
        if (!road && !rail) continue;
        links.push({ a: p, b: q, rail });
        sig += `|${p.r.id}-${q.r.id}${rail ? 'R' : 'r'}${p.r.settlement[0]}${q.r.settlement[0]}`;
      }
    }
    if (sig === this.netSig && !force) return;
    this.netSig = sig;
    if (this.netMesh) { this.scene.remove(this.netMesh); this.netMesh.geometry.dispose(); this.netMesh = null; }
    this.trafficPaths = [];
    const b = new Builder();
    const G = (x: number, z: number) => heightAt(hf, x, z);
    for (const l of links) {
      let shared: { mx: number; my: number; len: number } | null = null;
      for (const { e } of l.a.edges) if (e.regions.includes(l.b.idx) && (!shared || e.len > shared.len)) shared = e;
      const mx = shared ? shared.mx : (l.a.cx + l.b.cx) / 2, mz = shared ? shared.my : (l.a.cy + l.b.cy) / 2;
      // Bend through the border crossing; start and end at the edge of each settlement.
      const raw = chaikin([l.a.cx, l.a.cy, (l.a.cx + mx) / 2 + (mz - l.a.cy) * 0.08, (l.a.cy + mz) / 2 - (mx - l.a.cx) * 0.08, mx, mz, (l.b.cx + mx) / 2 + (mz - l.b.cy) * 0.08, (l.b.cy + mz) / 2 - (mx - l.b.cx) * 0.08, l.b.cx, l.b.cy], 3);
      const dense = resample(raw, 2.6);
      const ra = settlementRadius(l.a.r.settlement) * 0.85, rb = settlementRadius(l.b.r.settlement) * 0.85;
      const pts: number[] = [];
      for (let i = 0; i < dense.length; i += 2) {
        const x = dense[i], z = dense[i + 1];
        if (Math.hypot(x - l.a.cx, z - l.a.cy) < ra || Math.hypot(x - l.b.cx, z - l.b.cy) < rb) continue;
        pts.push(x, z);
      }
      if (pts.length < 6) continue;
      const road: RGB = l.rail ? [0.4, 0.36, 0.33] : this.civEra >= 3 ? [0.56, 0.56, 0.58] : [0.86, 0.76, 0.54];
      const hw = l.rail ? 1.0 : 1.05;
      let prev: number[][] | null = null;
      let len = 0;
      const path: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i], z = pts[i + 1];
        const j0 = Math.max(0, i - 2), j1 = Math.min(pts.length - 2, i + 2);
        const dx = pts[j1] - pts[j0], dz = pts[j1 + 1] - pts[j0 + 1];
        const dl = Math.hypot(dx, dz) || 1;
        const nx = dz / dl, nz = -dx / dl;
        const y = Math.max(G(x, z), G(x + nx * hw, z + nz * hw), G(x - nx * hw, z - nz * hw), 0.2) + 0.2;
        const a = [x + nx * hw, y, z + nz * hw], c = [x - nx * hw, y, z - nz * hw];
        if (prev) {
          b.quad(prev[0], a, c, prev[1], road);
          len += Math.hypot(x - pts[i - 2], z - pts[i - 1]);
          if (l.rail) {
            // Sleepers and two pale rails.
            b.quad([prev[0][0], prev[0][1] + 0.05, prev[0][2]], [(prev[0][0] + a[0]) / 2, y + 0.05, (prev[0][2] + a[2]) / 2], [(prev[1][0] + c[0]) / 2, y + 0.05, (prev[1][2] + c[2]) / 2], [prev[1][0], prev[1][1] + 0.05, prev[1][2]], [0.62, 0.5, 0.36]);
          }
        }
        path.push(x, y + 0.5, z);
        prev = [a, c];
      }
      this.trafficPaths.push({ pts: path, len, boat: false });
    }
    for (const s of sea) {
      const lane = topo.seaLanes.find((l) => Math.hypot(l.ax - s.a.cx, l.ay - s.a.cy) < 260 && Math.hypot(l.bx - s.b.cx, l.by - s.b.cy) < 260);
      if (!lane) continue;
      const path: number[] = [];
      let len = 0;
      for (let k = 0; k <= 30; k++) {
        const t = k / 30, u = 1 - t;
        const x = u * u * lane.ax + 2 * u * t * lane.cx + t * t * lane.bx, z = u * u * lane.ay + 2 * u * t * lane.cy + t * t * lane.by;
        if (k > 0) len += Math.hypot(x - path[path.length - 3], z - path[path.length - 1]);
        path.push(x, 0.5, z);
      }
      this.trafficPaths.push({ pts: path, len, boat: true });
    }
    if (b.triangles > 0) {
      this.netMesh = new THREE.Mesh(b.build(), this.modelMat);
      this.netMesh.receiveShadow = true;
      this.scene.add(this.netMesh);
    }
    // Traffic: a few carts (or boats) per link, moved by the ambient tick.
    if (this.trafficMesh) { this.scene.remove(this.trafficMesh); this.trafficMesh.geometry.dispose(); this.trafficMesh = null; }
    const total = Math.min(90, this.trafficPaths.reduce((s, p) => s + Math.max(1, Math.round(p.len / 55)), 0));
    if (total > 0) {
      const tb = new Builder();
      tb.box(0, 0, 0, 1.5, 0.8, 0.9, [0.96, 0.9, 0.7]);
      tb.box(0.2, 0.8, 0, 0.9, 0.5, 0.8, [0.86, 0.36, 0.22]);
      this.trafficMesh = new THREE.InstancedMesh(tb.build(), this.modelMat, total);
      this.trafficMesh.frustumCulled = false;
      this.scene.add(this.trafficMesh);
      this.updateTraffic();
    }
  }

  private updateTraffic(): void {
    const mesh = this.trafficMesh;
    if (!mesh) return;
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (let pi = 0; pi < this.trafficPaths.length && i < mesh.count; pi++) {
      const p = this.trafficPaths[pi];
      const n = Math.max(1, Math.round(p.len / 55));
      const np = p.pts.length / 3;
      for (let k = 0; k < n && i < mesh.count; k++, i++) {
        const dir = k % 2 ? -1 : 1;
        const speed = p.boat ? 3.2 : 4.6;
        let t = ((k + 0.37 * pi) / n + (dir * this.clock * speed) / Math.max(20, p.len)) % 1;
        if (t < 0) t += 1;
        const fidx = t * (np - 1);
        const a = Math.min(np - 2, Math.floor(fidx)), fr = fidx - a;
        const x = lerp(p.pts[a * 3], p.pts[a * 3 + 3], fr), y = lerp(p.pts[a * 3 + 1], p.pts[a * 3 + 4], fr), z = lerp(p.pts[a * 3 + 2], p.pts[a * 3 + 5], fr);
        const ang = Math.atan2(-(p.pts[a * 3 + 5] - p.pts[a * 3 + 2]) * dir, (p.pts[a * 3 + 3] - p.pts[a * 3]) * dir);
        pos.set(x, y - 0.45, z);
        this.q.setFromAxisAngle(up, ang);
        scl.setScalar(p.boat ? 1.5 : 1);
        this.m4.compose(pos, this.q, scl);
        mesh.setMatrixAt(i, this.m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --- smoke, beacons, population columns --------------------------------------------------------

  private rebuildSmoke(): void {
    if (this.smokeMesh) { this.scene.remove(this.smokeMesh); this.smokeMesh.geometry.dispose(); this.smokeMesh = null; }
    const src: number[] = [];
    for (const have of this.decor.values()) for (let i = 0; i < have.d.smoke.length && src.length < 4 * 90; i++) src.push(have.d.smoke[i]);
    this.smokeSrc = src;
    const n = (src.length / 4) * 3;
    if (!n) return;
    const b = new Builder();
    b.ball(0, 0, 0, 1, [1, 1, 1], 5);
    this.smokeMesh = new THREE.InstancedMesh(b.build(), this.smokeMat, n);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 6;
    this.scene.add(this.smokeMesh);
    this.updateSmoke();
  }

  private updateSmoke(): void {
    const mesh = this.smokeMesh;
    if (!mesh) return;
    const src = this.smokeSrc;
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    this.q.identity();
    let i = 0;
    for (let e = 0; e < src.length; e += 4) {
      for (let k = 0; k < 3; k++, i++) {
        const ph = ((hash32(e, k) % 1000) / 1000 + k / 3 + this.clock * 0.085) % 1;
        const size = src[e + 3];
        pos.set(src[e] + ph * 4.2 * (0.6 + size), src[e + 1] + ph * (5 + size * 7), src[e + 2] + ph * 1.6);
        const s = size * (0.55 + ph * 1.9) * (1 - smoothstep(0.72, 1, ph));
        scl.setScalar(Math.max(0.001, s));
        this.m4.compose(pos, this.q, scl);
        mesh.setMatrixAt(i, this.m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private rebuildBeacons(): void {
    for (const c of [...this.beaconGroup.children]) { this.beaconGroup.remove(c); (c as THREE.Mesh).geometry.dispose(); }
    for (const have of this.decor.values()) {
      const at = have.d.beacon;
      if (!at) continue;
      const g = new THREE.CylinderGeometry(0.5, 1.9, 74, 12, 1, true);
      g.translate(0, 37, 0);
      const m = new THREE.Mesh(g, this.beaconMat);
      m.position.set(at[0], at[1] + 0.8, at[2]);
      m.renderOrder = 7;
      this.beaconGroup.add(m);
    }
  }

  private rebuildColumns(): void {
    for (const c of [...this.columnGroup.children]) { this.columnGroup.remove(c); (c as THREE.Mesh).geometry.dispose(); }
    const show = this.overlay.mode === 'population';
    this.columnGroup.visible = show;
    const topo = this.topo, hf = this.hf;
    if (!show || !topo || !hf) return;
    for (const p of topo.regions) {
      const r = p.r;
      const pop = r.own ? r.own.population : r.foreign ? (r.foreign.population_low + r.foreign.population_high) / 2 : -1;
      if (pop < 0) continue;
      // people per region run from tens of thousands to tens of millions (units-and-scale §1, §3)
      const hgt = 5 + 10.5 * clamp(Math.log10(pop + 1) - 3, 0, 5);
      const rad = clamp(p.inradius * 0.2, 5, 9);
      const g = new THREE.CylinderGeometry(rad * 0.9, rad, hgt, 6, 1, false);
      g.translate(0, hgt / 2, 0);
      const m = new THREE.Mesh(g, this.columnMats[popClass(pop)]);
      const off = settlementRadius(r.settlement) + rad + 2;
      m.position.set(p.cx - off, groundAt(hf, p.cx - off, p.cy), p.cy);
      m.userData.h = hgt;
      m.userData.id = r.id;
      m.renderOrder = 6;
      this.columnGroup.add(m);
    }
  }

  // --- sprites: resource badges and army standards -------------------------------------------------

  private spriteMaterial(key: string, make: () => HTMLCanvasElement, opacity = 1): THREE.SpriteMaterial {
    let m = this.spriteMats.get(key);
    if (!m) {
      const tex = new THREE.CanvasTexture(make());
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.iconTex.set(key, tex);
      m = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, opacity });
      this.spriteMats.set(key, m);
    }
    return m;
  }

  private rebuildBadges(force: boolean): void {
    const topo = this.topo;
    if (!topo) return;
    let sig = '';
    for (const p of topo.regions) for (const dp of p.r.survey?.deposits ?? []) sig += `|${p.r.id}${dp.kind}${dp.epistemic === 'verified' ? 'v' : 'e'}${p.r.visibility[0]}`;
    if (sig === this.badgeSig && !force) return;
    this.badgeSig = sig;
    for (const c of [...this.badgeGroup.children]) this.badgeGroup.remove(c);
    this.sprites = this.sprites.filter((s) => s.sprite.userData.kind !== 'badge');
    this.badges = [];
    for (const p of topo.regions) {
      const sv = p.r.survey;
      const dec = this.decor.get(p.r.id)?.d;
      if (!sv || !dec) continue;
      sv.deposits.slice(0, 5).forEach((dp, index) => {
        const site = dec.badges[index];
        if (!site) return;
        const verified = dp.epistemic === 'verified';
        const rem = p.r.visibility === 'remembered';
        const mat = this.spriteMaterial(`dep:${dp.kind}:${verified ? 1 : 0}:${rem ? 1 : 0}`, () => depositBadge(dp.kind as Deposit, verified), rem ? 0.7 : 1);
        const s = new THREE.Sprite(mat);
        s.center.set(0.5, 0.02);
        s.position.set(site.x, site.y, site.z);
        s.renderOrder = 20;
        s.userData.kind = 'badge';
        this.badgeGroup.add(s);
        this.sprites.push({ sprite: s, px: rem ? 28 : 34, pxLens: 44, aspect: 128 / 156, minW: 4, maxW: 34 });
        this.badges.push({ sprite: s, region: p.r.id, index });
      });
    }
  }

  private applyBadgeMode(): void {
    // Sizes are applied per frame in fitSprites(); nothing to rebuild.
  }

  private rebuildArmies(): void {
    const d = this.data, topo = this.topo, hf = this.hf;
    if (!d || !topo || !hf) return;
    let sig = '';
    for (const a of d.armies) sig += `|${a.id}:${a.region}:${a.tier}:${a.order}:${a.target}:${a.in_battle ? 1 : 0}${a.training_months_left > 0 ? 1 : 0}${a.supply_bp < 5000 ? 1 : 0}:${a.soldiers.map((s) => s[1]).join(',')}`;
    for (const a of d.foreignArmies) sig += `|f${a.owner}:${a.region}:${a.strength_low}:${a.strength_high}:${a.tier_estimate}:${a.observed_month}`;
    sig += '#' + d.month + this.colorOf(d.mySeat);
    if (sig === this.armySig) return;
    this.armySig = sig;
    for (const c of [...this.armyGroup.children]) {
      this.armyGroup.remove(c);
      const m = c as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    }
    this.sprites = this.sprites.filter((s) => s.sprite.userData.kind !== 'army');
    this.armyLabels = [];
    const b = new Builder();
    const slots = new Map<number, number>();
    const hidden = new Map<number, number>();
    const MAXP = 6;
    // Remembered regions keep no live sightings; our own formations are always known to us.
    const place = (region: number, own: boolean): [number, number, number, number] | null => {
      const p = topo.byId.get(region);
      if (!p || (!own && p.r.visibility === 'remembered')) return null;
      const i = slots.get(region) ?? 0;
      slots.set(region, i + 1);
      if (i >= MAXP) { hidden.set(region, (hidden.get(region) ?? 0) + 1); return null; }
      const sr = settlementRadius(p.r.settlement);
      const x = p.cx + sr + 6 + (i % 3) * 7.2, z = p.cy + 5 + Math.floor(i / 3) * 7.5 - (i % 3) * 1.2;
      return [x, groundAt(hf, x, z), z, i];
    };
    const standard = (x: number, y: number, z: number, spec: StandardSpec, scale: number) => {
      const mat = this.spriteMaterial('std:' + standardKey(spec), () => armyStandard(spec));
      const s = new THREE.Sprite(mat);
      s.center.set(0.5, 0);
      s.position.set(x, y + 3.2 * scale, z);
      s.renderOrder = 22;
      s.userData.kind = 'army';
      this.armyGroup.add(s);
      this.sprites.push({ sprite: s, px: 44 * scale, pxLens: 44 * scale, aspect: 160 / 208, minW: 7, maxW: 44 });
    };
    const arcs: { pts: number[]; color: RGB; width: number }[] = [], attacks: { pts: number[]; color: RGB; width: number }[] = [];
    const mine = this.rgbOf(d.mySeat);
    for (const a of d.armies) {
      const at = place(a.region, true);
      if (!at) continue;
      let role: Role = 'assault', best = -1, total = 0;
      for (const [ro, n] of a.soldiers) { total += n; if (n > best) { best = n; role = ro; } }
      // a formation is 1,000 to 5,000,000 soldiers (units-and-scale §3): weigh it in thousands
      const scale = 0.85 + 0.12 * clamp(Math.log10(total / 1000 + 1), 0, 3.4);
      const training = a.training_months_left > 0;
      const col = training ? mixRgb(mine, [0.95, 0.92, 0.84], 0.5) : mine;
      const dark = mixRgb(mine, [0.1, 0.07, 0.05], 0.55);
      b.push(at[0], at[1], at[2], 0, scale);
      b.cyl(0, 0, 0, 2.5, 2.3, 0.5, 10, dark, col);
      // Role silhouettes: assault = square block, maneuver = forward wedge, denial = round keep.
      if (role === 'assault') {
        b.box(0, 0.5, 0, 2.4, 2.2, 2.4, col);
        b.hip(0, 2.7, 0, 2.4, 1.1, 2.4, [0.97, 0.93, 0.8], 0, 0, 0);
      } else if (role === 'maneuver') {
        const y0 = 0.5, y1 = 2.3;
        const p0 = [-1.5, y0, -1.5], p1 = [-1.5, y0, 1.5], p2 = [2.1, y0, 0], q0 = [-1.5, y1, -1.5], q1 = [-1.5, y1, 1.5], q2 = [2.1, y0 + 0.5, 0];
        b.tri(q0, q1, q2, [0.97, 0.93, 0.8]).quad(p0, p1, q1, q0, col).quad(p1, p2, q2, q1, col).quad(p2, p0, q0, q2, col);
      } else {
        b.cyl(0, 0.5, 0, 1.6, 1.45, 2.0, 9, col);
        b.cyl(0, 2.5, 0, 1.85, 1.85, 0.6, 9, [0.97, 0.93, 0.8], col);
      }
      b.pop();
      const frac = clamp(Math.log10(total / 1000 + 1) / 3.2, 0.06, 1);
      standard(at[0], at[1], at[2], { color: this.colorOf(d.mySeat), role, tier: a.tier, strength: frac, training, battle: a.in_battle, lowSupply: a.supply_bp < 5000 }, scale);
      if (a.target != null && a.target !== a.region) {
        const to = topo.byId.get(a.target);
        if (to) {
          const attack = a.order === 'attack';
          const tx = to.cx, tz = to.cy;
          const dx = tx - at[0], dz = tz - at[2];
          const l = Math.hypot(dx, dz) || 1;
          const bend = l * 0.14;
          const pts: number[] = [];
          const N = 26;
          for (let k = 0; k <= N; k++) {
            const t = 0.04 + (k / N) * 0.88, u = 1 - t;
            const mx = (at[0] + tx) / 2 - (dz / l) * bend, mz = (at[2] + tz) / 2 + (dx / l) * bend;
            const x = u * u * at[0] + 2 * u * t * mx + t * t * tx, z = u * u * at[2] + 2 * u * t * mz + t * t * tz;
            pts.push(x, groundAt(hf, x, z) + 4 + Math.sin(t * Math.PI) * Math.min(16, l * 0.1), z);
          }
          (attack ? attacks : arcs).push({ pts, color: attack ? [0.92, 0.16, 0.1] : mixRgb(mine, [1, 1, 1], 0.12), width: 4.4 });
        }
      }
    }
    for (const a of d.foreignArmies) {
      const at = place(a.region, false);
      if (!at) continue;
      const base = this.rgbOf(a.owner);
      const stale = d.month - a.observed_month > 12;
      const col = mixRgb(base, [0.95, 0.92, 0.84], stale ? 0.55 : 0.2);
      const mid = (a.strength_low + a.strength_high) / 2;
      const scale = 0.85 + 0.12 * clamp(Math.log10(mid / 1000 + 1), 0, 3.4);
      b.push(at[0], at[1], at[2], 0, scale);
      b.cyl(0, 0, 0, 2.5, 2.3, 0.5, 10, mixRgb(base, [0.1, 0.07, 0.05], 0.55), col);
      // A plain pawn: seen, composition unknown.
      b.cyl(0, 0.5, 0, 1.5, 0.6, 2.1, 8, col);
      b.ball(0, 3.2, 0, 0.95, col, 6);
      b.pop();
      standard(at[0], at[1], at[2], {
        color: this.colorOf(a.owner), role: null, tier: a.tier_estimate,
        strength: clamp(Math.log10(a.strength_low / 1000 + 1) / 3.2, 0.06, 1), strengthHi: clamp(Math.log10(a.strength_high / 1000 + 1) / 3.2, 0.06, 1), stale,
      }, scale);
    }
    for (const [region, n] of hidden) {
      const p = topo.byId.get(region);
      if (!p) continue;
      const sr = settlementRadius(p.r.settlement);
      const x = p.cx + sr + 6 + 3 * 7.2, z = p.cy + 9;
      this.armyLabels.push({ key: 'more:' + region, x, y: groundAt(hf, x, z) + 5, z, html: '+' + n, cls: 'm3-more', priority: 5, minZoom: 0.8, anchor: 'center', free: true });
    }
    if (b.triangles > 0) {
      const m = new THREE.Mesh(b.build(), this.modelMat);
      m.castShadow = false;
      this.armyGroup.add(m);
    }
    if (arcs.length) { const m = new THREE.Mesh(arcGeometry(arcs), this.moveMat); m.renderOrder = 8; m.frustumCulled = false; this.armyGroup.add(m); }
    if (attacks.length) { const m = new THREE.Mesh(arcGeometry(attacks), this.attackMat); m.renderOrder = 8; m.frustumCulled = false; this.armyGroup.add(m); }
  }

  // --- labels ------------------------------------------------------------------------------------

  private rebuildLabels(): void {
    const topo = this.topo, hf = this.hf, d = this.data;
    if (!topo || !hf || !d) return;
    const ov = this.overlay;
    const specs: LabelSpec[] = [...this.armyLabels];
    for (const p of topo.regions) {
      const r = p.r;
      const rank = SETTLEMENT_RANK[r.settlement] ?? 0;
      const own = r.visibility === 'own';
      const rem = r.visibility === 'remembered';
      const forced = r.id === ov.selected || r.id === ov.hovered;
      let priority = rank * 10 + (own ? 60 : r.visibility === 'visible' ? 20 : 0) - r.id * 0.001;
      if (d.capital === r.id) priority += 200;
      let minZoom = rank >= 4 ? 0 : rank === 3 ? 0.5 : rank === 2 ? 0.72 : rank === 1 ? 0.95 : 1.25;
      if (own) minZoom *= 0.58;
      if (d.capital === r.id) minZoom = 0;
      const g = groundAt(hf, p.cx, p.cy);
      const lift = this.decor.get(r.id)?.d.labelLift ?? 4;
      if (rank > 0) {
        const chip = r.owner != null ? `<i class="m3-chip" style="background:${this.colorOf(r.owner)}"></i>` : '';
        const star = d.capital === r.id ? '<b class="m3-star">★</b>' : '';
        const pop = r.own && ov.mode !== 'population' ? `<span class="m3-pop">${esc(compact(r.own.population))}</span>` : '';
        specs.push({
          key: 'r' + r.id, x: p.cx, y: g + lift, z: p.cy,
          html: `${chip}${star}<span class="m3-name">${esc(r.name)}</span>${pop}`,
          cls: 'm3-city m3-rank' + rank + (own ? ' is-own' : '') + (rem ? ' is-rem' : '') + (forced ? ' is-focus' : ''),
          priority, minZoom, anchor: 'above', force: forced,
        });
      } else {
        specs.push({
          key: 'r' + r.id, x: p.cx, y: g + 1.5, z: p.cy, html: `<span class="m3-name">${esc(r.name)}</span>`,
          cls: 'm3-wild' + (rem ? ' is-rem' : '') + (forced ? ' is-focus' : ''), priority, minZoom, anchor: 'center', force: forced,
        });
      }
      // What the region holds: sector discs under the settlement (a stacked bar in the
      // development view). Only for regions whose works this viewer is told.
      const use = ov.mode === 'resources' || ov.mode === 'population' ? null : landUse(r, d.facilityCategories, d.construction?.[r.id]);
      if (use && use.total > 0) {
        let html = '';
        if (ov.mode === 'construction') {
          let segs = '';
          for (const sec of SECTORS) if (use.sectors[sec] > 0) segs += `<i style="flex-grow:${use.sectors[sec]};background:${SECTOR_COLOR[sec]}"></i>`;
          html = `<span class="m3-bar">${segs}</span><b>${use.total}</b>${use.building.levels > 0 ? `<em>+${use.building.levels}</em>` : ''}`;
        } else {
          for (const c of sectorChips(use, true)) {
            const px = Math.ceil(chipRadius(c.magnitude, 1) * 2 + 4);
            html += `<img src="${chipDataUrl(c)}" width="${px}" height="${px}" alt="">${c.label ? `<em>${esc(c.label)}</em>` : ''}`;
          }
        }
        if (html) {
          specs.push({
            key: 'w' + r.id, x: p.cx, y: g, z: p.cy + (rank ? settlementRadius(r.settlement) + 2.5 : 8), html,
            cls: 'm3-works' + (ov.mode === 'construction' ? ' is-dev' : ''), priority: priority - 6, minZoom: Math.max(minZoom, 0.34), anchor: 'below', force: forced,
          });
        }
      }
      if (ov.mode === 'resources' && r.survey) {
        const sv = r.survey;
        const dec = this.decor.get(r.id)?.d;
        sv.deposits.slice(0, 5).forEach((dp, i) => {
          const site = dec?.badges[i];
          if (!site) return;
          const est = dp.epistemic !== 'verified';
          specs.push({
            key: `d${r.id}:${i}`, x: site.x, y: site.y - 0.4, z: site.z,
            html: `<span class="${est ? 'm3-est' : ''}">${est ? '≈ ' : ''}${esc(tonnes(dp.remaining))}</span>`,
            cls: 'm3-amount', priority: 8 - i, minZoom: 0.9, anchor: 'below',
          });
        });
        const parts: string[] = [];
        const add = (k: keyof typeof YIELD_SVG, v: number) => { if (v > 0) parts.push(`<span class="m3-y">${YIELD_SVG[k]}${esc(compact(v))}</span>`); };
        add('arable', sv.arable); add('pasture', sv.pasture); add('fishery', sv.fishery); add('forest', sv.forest); add('hydro', sv.hydro);
        if (parts.length) {
          specs.push({
            key: 'y' + r.id, x: p.cx, y: g, z: p.cy + (rank ? settlementRadius(r.settlement) + 3 : 9), html: parts.join(''),
            cls: 'm3-yield' + (sv.detailed ? '' : ' is-rough'), priority: 12 + (own ? 4 : 0), minZoom: 0.9, anchor: 'below',
          });
        }
      }
    }
    if (this.caption && this.decals) {
      this.decals.captions.forEach((c, i) => {
        specs.push({ key: 'cap' + i, x: c[0], y: 0.2, z: c[1], html: esc(this.caption), cls: 'm3-terra', priority: 1, minZoom: 0.3, anchor: 'center' });
      });
    }
    if (ov.mode === 'population') {
      for (const c of this.columnGroup.children) {
        const id = c.userData.id as number;
        const r = topo.byId.get(id)?.r;
        if (!r) continue;
        const txt = r.own ? peopleNum(r.own.population) : r.foreign ? range(r.foreign.population_low, r.foreign.population_high) : '';
        specs.push({
          key: 'p' + id, x: c.position.x, y: c.position.y + (c.userData.h as number) + 1.5, z: c.position.z,
          html: `<span class="${r.own ? '' : 'm3-est'}">${esc(txt)}</span>`, cls: 'm3-popnum', priority: 40, minZoom: 0.45, anchor: 'above', free: true,
        });
      }
    }
    this.labels.set(specs);
  }

  // --- frame ---------------------------------------------------------------------------------------

  invalidate(): void {
    if (this.destroyed || this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Smoothed cost of a frame in ms, estimated from the pace of back-to-back frames. */
  frameCost = 0;
  private streak = 0;
  private pixelRatio = Math.min(2, window.devicePixelRatio || 1);

  drawNow(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.frame(performance.now());
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.destroyed || this.w <= 0 || this.h <= 0) return;
    const gap = now - this.lastFrame;
    const dt = Math.min(0.1, Math.max(0, gap / 1000));
    this.lastFrame = now;
    // Back-to-back frames (camera in motion) reveal the real frame cost, GPU included.
    if (this.wasMoving && gap < 1000) {
      this.frameCost = this.frameCost ? this.frameCost * 0.8 + gap * 0.2 : gap;
      this.streak++;
      // Sustained slow frames on a dense display: trade resolution for smoothness.
      if (this.streak >= 12 && this.frameCost > 42 && this.pixelRatio > 1) {
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.5);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.w, this.h, false);
        this.streak = 0;
      }
    } else this.streak = 0;
    // Ease the camera toward its goal.
    const c = this.cur, g = this.goal;
    const k = this.reducedMotion || this.dragging ? 1 : 1 - Math.exp(-dt * 11);
    c.tx += (g.tx - c.tx) * k; c.tz += (g.tz - c.tz) * k;
    c.dist *= Math.pow(g.dist / c.dist, k);
    c.heading += (g.heading - c.heading) * k;
    const moving = Math.abs(g.tx - c.tx) + Math.abs(g.tz - c.tz) > 0.05 * this.unitsPerPx(c.dist) * 10 || Math.abs(Math.log(g.dist / c.dist)) > 0.002 || Math.abs(g.heading - c.heading) > 0.002;
    if (!moving) { c.tx = g.tx; c.tz = g.tz; c.dist = g.dist; c.heading = g.heading; }
    if (!this.reducedMotion && !document.hidden) this.clock += dt;
    this.render();
    this.wasMoving = moving || this.probeNext;
    if (this.probeNext) { this.probeNext = false; this.invalidate(); }
    if (moving) { this.invalidate(); this.onViewChange?.(); }
  };

  private render(): void {
    const t0 = performance.now();
    this.applyRig(this.camera, this.cur);
    this.groundU.uTime.value = this.clock;
    // Far away the picture becomes a strategic map: ownership dominates, detail recedes.
    // Ownership reads at every distance: the wash is plain up close and firm from the middle
    // distance outward, where the picture is a strategic map and detail recedes.
    const far = smoothstep(320, 1500, this.cur.dist);
    const mode = this.overlay.mode;
    this.groundU.uWashGain.value = mode === 'political' ? lerp(0.32, 0.68, far) : mode === 'population' || mode === 'construction' ? 0.8 : 0;
    // In the far overview trees, deposit badges and carts are specks: they are left out, and the
    // sector discs under each name say what a region holds.
    const overview = this.unitsPerPx(this.cur.dist) > 0.95;
    this.props.group.visible = mode !== 'construction' && !overview;
    this.badgeGroup.visible = mode === 'resources' || !overview;
    if (this.trafficMesh) this.trafficMesh.visible = !overview;
    // No drifting cloud shadows: they dappled the very washes the map is read by.
    this.groundU.uClouds.value = 0;
    this.borderU.uGlow.value = (mode === 'political' ? 0.78 : 0.45) * lerp(1, 1.2, far);
    this.borderU.uCore.value = lerp(0.2, 0.32, far);
    this.inkU.uOpacity.value = lerp(0.58, 0.5, far);
    if (!this.reducedMotion) { this.updateSmoke(); this.updateTraffic(); }
    this.fitSprites();
    this.renderer.render(this.scene, this.camera);
    // Label thresholds follow the on-screen scale (pixels per world unit), not the raw distance.
    this.labels.layout((x, y, z) => this.project(x, y, z), 1 / (0.7 * this.unitsPerPx(this.cur.dist)), this.w, this.h);
    if (this.minimap) {
      const v: number[] = [];
      const b = this.box();
      for (const [sx, sy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]) {
        const gp = this.groundPoint(sx, sy, this.camera);
        if (gp) v.push(gp[0], gp[1]);
      }
      this.minimap.draw(v.length === 8 ? v : null);
    }
    this.lastDrawMs = performance.now() - t0;
    this.frames++;
  }

  private fitSprites(): void {
    const lens = this.overlay.mode === 'resources';
    const tan = Math.tan((FOV * Math.PI) / 360);
    const cam = this.camera.position;
    // Shrink markers a little in the far overview so they do not smother the land.
    const far = smoothstep(900, 2600, this.cur.dist);
    for (const s of this.sprites) {
      const d = cam.distanceTo(s.sprite.position);
      const u = (2 * d * tan) / Math.max(1, this.h);
      const badge = s.sprite.userData.kind === 'badge';
      const px = (lens && badge ? s.pxLens : s.px) * lerp(1, badge && !lens ? 0.5 : 0.74, far);
      const hgt = clamp(px * u, s.minW, s.maxW * (lens ? 1.5 : 1));
      s.sprite.scale.set(hgt * s.aspect, hgt, 1);
    }
  }
}
