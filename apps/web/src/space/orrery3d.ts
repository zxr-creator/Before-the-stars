// The 3D Solar System: a three.js orrery lit by the Sun, with the home world as a globe painted
// from the match. It renders only when the controller asks for a frame (no loop), works on
// software WebGL at reduced pixel ratio and without multisampling, and is loaded on demand.
import * as THREE from 'three';
import { BODIES, BODY, type BodyId } from './astro';
import type { Frame, OrreryRenderer } from './frame';
import { FOV_DEG, camPosition, type Cam, type Vec3 } from './layout';
import { bodyTexture, ringTexture } from './textures';

function softwareGL(): boolean {
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

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.22, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ATMO_VS = `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ATMO_FS = `
uniform vec3 uColor; uniform vec3 uSun; uniform float uOpacity;
varying vec3 vN; varying vec3 vV;
void main() {
  float rim = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
  float lit = clamp(dot(vN, uSun) * 0.8 + 0.45, 0.08, 1.0);
  gl_FragColor = vec4(uColor * rim * lit * 0.95, rim * lit * uOpacity);
}`;

export class Orrery3D implements OrreryRenderer {
  readonly kind = '3d' as const;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.01, 50000);
  private w = 1;
  private h = 1;
  private v = new THREE.Vector3();
  private meshes = new Map<BodyId, THREE.Mesh>();
  private sunGlow: THREE.Sprite;
  private atmo: THREE.Mesh;
  private atmoU: { uColor: { value: THREE.Color }; uSun: { value: THREE.Vector3 }; uOpacity: { value: number } };
  private stars: THREE.Points;
  private orbitLines = new Map<BodyId, THREE.LineLoop>();
  private orbitKey = '';
  private belt: THREE.Points;
  private nea: THREE.Points;
  private ringPool: THREE.LineLoop[] = [];
  private dashPool: THREE.LineLoop[] = [];
  private unitCircle: THREE.BufferGeometry;
  private arcs = new THREE.Group();
  private earthTex: THREE.CanvasTexture | null = null;
  private soft: boolean;
  lastDrawMs = 0;
  onContextLost: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.soft = softwareGL();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.soft, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.soft ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#060b15');
    canvas.addEventListener('webglcontextlost', this.lost, false);

    // Light: the Sun at the origin, and a faint fill so night sides keep their shape.
    const sun = new THREE.PointLight(0xfff3dc, 3.2, 0, 0);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x8fa6d8, 0.16));

    const sphere = new THREE.SphereGeometry(1, 48, 32);
    const fine = new THREE.SphereGeometry(1, 96, 64);
    for (const b of BODIES) {
      if (b.kind === 'cluster') continue;
      let mat: THREE.Material;
      if (b.id === 'sun') {
        mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd98a') });
      } else {
        const tex = b.id === 'earth' ? null : bodyTexture(b.id);
        let map: THREE.CanvasTexture | null = null;
        if (tex) {
          map = new THREE.CanvasTexture(tex);
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 4;
        }
        mat = new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : new THREE.Color(b.color) });
      }
      const m = new THREE.Mesh(b.id === 'earth' || b.id === 'jupiter' || b.id === 'saturn' ? fine : sphere, mat);
      m.name = b.id;
      this.scene.add(m);
      this.meshes.set(b.id, m);
    }
    // Saturn's rings, tilted as seen in the sky.
    const ringGeo = new THREE.RingGeometry(1.3, 2.35, 128, 1);
    const pos = ringGeo.attributes.position as THREE.BufferAttribute;
    const uv = ringGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - 1.3) / 1.05, 0.5);
    }
    const rt = new THREE.CanvasTexture(ringTexture());
    rt.colorSpace = THREE.SRGBColorSpace;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshLambertMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2 + 0.47;
    this.meshes.get('saturn')!.add(ring);

    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,244,214,1)', 'rgba(255,190,100,0.45)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.scene.add(this.sunGlow);

    this.atmoU = { uColor: { value: new THREE.Color('#7fb8ff') }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uOpacity: { value: 0.75 } };
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 48), new THREE.ShaderMaterial({
      uniforms: this.atmoU, vertexShader: ATMO_VS, fragmentShader: ATMO_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.meshes.get('earth')!.add(this.atmo);

    // Stars on a sphere that travels with the camera.
    const n = this.soft ? 1500 : 2600;
    const sp = new Float32Array(n * 3), sc = new Float32Array(n * 3);
    let s = 0x1234567;
    const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < n; k++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2;
      // Denser towards a tilted band, a hint of the galaxy.
      const band = R() < 0.45;
      const y = band ? (R() - 0.5) * 0.35 : u;
      const rr = Math.sqrt(1 - y * y);
      const x0 = rr * Math.cos(a), z0 = rr * Math.sin(a);
      sp[k * 3] = x0 * 900; sp[k * 3 + 1] = (y * 0.9 + x0 * 0.42) * 900; sp[k * 3 + 2] = z0 * 900;
      const m = R();
      const warm = R() < 0.25;
      const lum = 0.35 + m * m * 0.65;
      sc[k * 3] = lum * (warm ? 1 : 0.82); sc[k * 3 + 1] = lum * (warm ? 0.9 : 0.88); sc[k * 3 + 2] = lum * (warm ? 0.75 : 1);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: this.soft ? 1.6 : 1.4, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true, opacity: 0.9 }));
    this.stars.renderOrder = -10;
    this.scene.add(this.stars);

    this.belt = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: 0xbfae8c, transparent: true, opacity: 0.55, depthWrite: false }));
    this.nea = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, color: 0xd8c6a0, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.belt, this.nea, this.arcs);

    const cp: number[] = [];
    for (let k = 0; k < 128; k++) { const a = (k / 128) * Math.PI * 2; cp.push(Math.cos(a), 0, Math.sin(a)); }
    this.unitCircle = new THREE.BufferGeometry();
    this.unitCircle.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  }

  private lost = (e: Event) => {
    e.preventDefault();
    this.onContextLost?.();
  };

  resize(w: number, h: number, cx: number, cy: number): void {
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h;
      this.renderer.setSize(w, h, false);
    }
    this.camera.aspect = w / Math.max(1, h);
    const ox = cx - w / 2, oy = cy - h / 2;
    if (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) this.camera.setViewOffset(w, h, -ox, -oy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setEarthTexture(tex: HTMLCanvasElement): void {
    const m = this.meshes.get('earth')!;
    this.earthTex?.dispose();
    this.earthTex = new THREE.CanvasTexture(tex);
    this.earthTex.colorSpace = THREE.SRGBColorSpace;
    this.earthTex.anisotropy = 8;
    const mat = m.material as THREE.MeshLambertMaterial;
    mat.map = this.earthTex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }

  setCamera(cam: Cam, target: Vec3): void {
    const p = camPosition(cam, target);
    this.camera.position.set(p[0], p[1], p[2]);
    this.camera.near = Math.max(0.004, cam.dist * 0.01);
    this.camera.far = cam.dist * 30 + 3000;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target[0], target[1], target[2]);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  uppAt(p: Vec3): number {
    const d = this.camera.position.distanceTo(this.v.set(p[0], p[1], p[2]));
    return (2 * d * Math.tan((FOV_DEG * Math.PI) / 360)) / Math.max(1, this.h);
  }

  project(p: Vec3): [number, number, boolean] {
    const v = this.v.set(p[0], p[1], p[2]).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h, v.z > -1 && v.z < 1];
  }

  private syncOrbits(f: Frame): void {
    const key = Object.keys(f.layout.orbits).map((k) => k + (f.layout.orbits[k as BodyId]?.length ?? 0) + ':' + (f.layout.orbits[k as BodyId]?.[0]?.[0] ?? 0).toFixed(2)).join('|');
    if (key === this.orbitKey) return;
    this.orbitKey = key;
    for (const l of this.orbitLines.values()) { this.scene.remove(l); l.geometry.dispose(); (l.material as THREE.Material).dispose(); }
    this.orbitLines.clear();
    for (const [id, path] of Object.entries(f.layout.orbits) as [BodyId, Vec3[]][]) {
      if (id === 'nea') continue;
      const g = new THREE.BufferGeometry().setFromPoints(path.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      const planet = BODY[id].kind === 'planet';
      const mat = planet
        ? new THREE.LineBasicMaterial({ color: id === 'earth' ? 0x8fc4ff : 0xd6ba78, transparent: true, opacity: 0.35, depthWrite: false })
        : new THREE.LineDashedMaterial({ color: 0xd6ba78, dashSize: 3, gapSize: 4, transparent: true, opacity: 0.22, depthWrite: false });
      const line = new THREE.LineLoop(g, mat);
      if (!planet) line.computeLineDistances();
      line.userData.base = planet ? 0.35 : 0.22;
      this.scene.add(line);
      this.orbitLines.set(id, line);
    }
  }

  private beltKey: Float32Array | null = null;

  draw(f: Frame): void {
    const t0 = performance.now();
    this.syncOrbits(f);
    if (this.beltKey !== f.layout.belt) {
      this.beltKey = f.layout.belt;
      this.belt.geometry.setAttribute('position', new THREE.BufferAttribute(f.layout.belt, 3));
      this.belt.geometry.computeBoundingSphere();
      this.nea.geometry.setAttribute('position', new THREE.BufferAttribute(f.layout.nea, 3));
      this.nea.geometry.computeBoundingSphere();
    }
    (this.belt.material as THREE.PointsMaterial).opacity = 0.55 * f.beltAlpha;
    this.belt.visible = f.beltAlpha > 0.02;
    for (const [id, line] of this.orbitLines) {
      const mat = line.material as THREE.LineBasicMaterial;
      const strong = id === f.focusOrbit;
      mat.opacity = (strong ? 0.6 : line.userData.base) * f.orbitAlpha;
      line.visible = f.orbitAlpha > 0.01 && f.bodies.some((b) => b.id === id);
    }
    const shown = new Set<BodyId>();
    for (const b of f.bodies) {
      if (b.id === 'nea') { this.nea.visible = b.alpha > 0.05; continue; }
      const m = this.meshes.get(b.id);
      if (!m) continue;
      shown.add(b.id);
      m.visible = b.alpha > 0.05;
      m.position.set(b.pos[0], b.pos[1], b.pos[2]);
      m.scale.setScalar(b.r);
      const mat = m.material as THREE.MeshLambertMaterial;
      const fade = b.alpha < 0.98;
      if (mat.transparent !== fade) { mat.transparent = fade; mat.needsUpdate = true; }
      mat.opacity = b.alpha;
      if (b.id === 'earth') m.rotation.y = f.earthSpin;
      if (b.id === 'sun') {
        this.sunGlow.position.copy(m.position);
        this.sunGlow.scale.setScalar(b.r * 9);
      }
    }
    for (const [id, m] of this.meshes) if (!shown.has(id)) m.visible = false;
    if (!f.bodies.some((b) => b.id === 'nea')) this.nea.visible = false;
    // The atmosphere's lit side faces the Sun.
    const e = this.meshes.get('earth')!;
    this.v.set(-e.position.x, -e.position.y, -e.position.z).normalize().transformDirection(this.camera.matrixWorldInverse);
    this.atmoU.uSun.value.copy(this.v);

    // Rings: moon orbits (solid) and stations' orbits (dashed).
    let ri = 0, di = 0;
    for (const r of f.rings) {
      if (r.alpha < 0.02) continue;
      let l: THREE.LineLoop;
      if (r.dashed) {
        l = this.dashPool[di++] ?? this.addRing(true);
      } else {
        l = this.ringPool[ri++] ?? this.addRing(false);
      }
      l.visible = true;
      l.position.set(r.center[0], r.center[1], r.center[2]);
      l.scale.setScalar(r.r);
      const mat = l.material as THREE.LineBasicMaterial;
      mat.color.set(r.color);
      mat.opacity = r.alpha;
    }
    for (let k = ri; k < this.ringPool.length; k++) this.ringPool[k].visible = false;
    for (let k = di; k < this.dashPool.length; k++) this.dashPool[k].visible = false;

    // Shipments in flight.
    for (const c of [...this.arcs.children]) {
      this.arcs.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    for (const a of f.arcs) {
      const A = new THREE.Vector3(...a.from), B = new THREE.Vector3(...a.to);
      const mid = A.clone().add(B).multiplyScalar(0.5);
      const d = A.distanceTo(B);
      mid.y += d * 0.18;
      const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
      const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: a.color, dashSize: d / 40, gapSize: d / 60, transparent: true, opacity: 0.85 }));
      line.computeLineDistances();
      this.arcs.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: a.color }));
      dot.position.copy(curve.getPoint(a.progress));
      dot.scale.setScalar(this.uppAt([dot.position.x, dot.position.y, dot.position.z]) * 3.5);
      this.arcs.add(dot);
    }

    this.stars.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    this.lastDrawMs = performance.now() - t0;
  }

  private addRing(dashed: boolean): THREE.LineLoop {
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: 0x6fc9cf, dashSize: 0.09, gapSize: 0.07, transparent: true, depthWrite: false })
      : new THREE.LineBasicMaterial({ color: 0xd6ba78, transparent: true, depthWrite: false });
    const l = new THREE.LineLoop(this.unitCircle, mat);
    if (dashed) l.computeLineDistances();
    this.scene.add(l);
    (dashed ? this.dashPool : this.ringPool).push(l);
    return l;
  }

  destroy(): void {
    this.canvas.removeEventListener('webglcontextlost', this.lost, false);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.earthTex?.dispose();
    this.renderer.dispose();
  }
}
