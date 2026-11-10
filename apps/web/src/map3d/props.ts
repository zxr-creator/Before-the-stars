// Vegetation and landform props: instanced low-poly trees, rocks, crags, reeds,
// cacti, steppe tufts and ice. Placement is seeded per region so it never shifts
// between observations, and the total instance count is bounded.
import * as THREE from 'three';
import type { Terrain } from '../protocol';
import { Builder } from './builder';
import { heightAt, riverDistAt, slopeAt, type Heightfield } from './terrain';
import { regionIndexAt, sampleField, type Topology, type TRegion } from './topology';
import { fbm, hash32, rng, type RGB } from './util';

type PropKind = 'conifer' | 'broadleaf' | 'bush' | 'rock' | 'crag' | 'reed' | 'cactus' | 'tuft' | 'ice' | 'palm';
const KINDS: PropKind[] = ['conifer', 'broadleaf', 'bush', 'rock', 'crag', 'reed', 'cactus', 'tuft', 'ice', 'palm'];
/** Kinds that also exist in the flat "map ink" palette for remembered land. */
const INK_KINDS: PropKind[] = ['conifer', 'broadleaf', 'rock', 'crag'];

export const MAX_PROPS = 15000;

function model(kind: PropKind, ink: boolean): THREE.BufferGeometry {
  const b = new Builder();
  if (ink) b.fade = 1;
  const trunk: RGB = [0.42, 0.3, 0.2];
  switch (kind) {
    case 'conifer': {
      b.cyl(0, 0, 0, 0.3, 0.22, 1.3, 5, trunk);
      b.cyl(0, 1.0, 0, 1.75, 0.5, 2.0, 6, [0.16, 0.44, 0.24]);
      b.cyl(0, 2.5, 0, 1.3, 0.3, 1.8, 6, [0.2, 0.5, 0.27], undefined, 0.5);
      b.cyl(0, 3.9, 0, 0.85, 0, 1.9, 6, [0.25, 0.56, 0.3], undefined, 1);
      break;
    }
    case 'broadleaf': {
      b.cyl(0, 0, 0, 0.34, 0.24, 1.8, 5, trunk);
      b.ball(0, 3.0, 0, 1.75, [0.3, 0.62, 0.22], 6);
      b.ball(0.9, 2.5, 0.5, 1.15, [0.38, 0.7, 0.26], 5);
      b.ball(-0.8, 2.4, -0.5, 1.2, [0.25, 0.55, 0.2], 5);
      b.ball(0.1, 4.0, -0.2, 1.1, [0.42, 0.74, 0.28], 5);
      break;
    }
    case 'bush': {
      b.ball(0, 0.55, 0, 0.9, [0.36, 0.64, 0.24], 5);
      b.ball(0.7, 0.4, 0.3, 0.6, [0.44, 0.7, 0.28], 5);
      break;
    }
    case 'rock': {
      b.cyl(0, -0.2, 0, 1.3, 0.75, 1.3, 5, [0.6, 0.57, 0.52], [0.7, 0.67, 0.61], 0.3);
      b.cyl(0.9, -0.2, 0.5, 0.75, 0.4, 0.8, 4, [0.52, 0.5, 0.47], [0.64, 0.61, 0.56]);
      break;
    }
    case 'crag': {
      // A jagged summit with a snow cap; the heightfield carries the mountain mass.
      const rock: RGB = [0.52, 0.47, 0.42], rock2: RGB = [0.62, 0.56, 0.5], snow: RGB = [0.97, 0.98, 1];
      b.cyl(0, -1, 0, 4.4, 2.3, 5, 6, rock, undefined, 0.2);
      b.cyl(0.2, 4, 0.1, 2.3, 1.1, 2.6, 6, rock2, undefined, 0.7);
      b.cyl(0.25, 6.6, 0.1, 1.1, 0, 2.4, 6, snow, undefined, 0.2);
      b.cyl(-2.2, -1, 1.6, 2.4, 0.9, 3.6, 5, rock2, undefined, 1.1);
      b.cyl(-2.2, 2.6, 1.6, 0.9, 0, 1.5, 5, snow, undefined, 1.1);
      b.cyl(2.5, -1, -1.3, 2.0, 0, 4.4, 5, rock, undefined, 0.4);
      break;
    }
    case 'reed': {
      const g: RGB = [0.56, 0.72, 0.3], g2: RGB = [0.44, 0.62, 0.26], head: RGB = [0.45, 0.3, 0.18];
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05, r = 0.25 + (i % 3) * 0.22, hgt = 1.5 + (i % 4) * 0.35;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        b.tri([x - 0.1, 0, z], [x + 0.1, 0, z], [x + Math.cos(a) * 0.3, hgt, z + Math.sin(a) * 0.3], i % 2 ? g : g2);
        b.tri([x, 0, z - 0.1], [x, 0, z + 0.1], [x + Math.cos(a) * 0.3, hgt, z + Math.sin(a) * 0.3], i % 2 ? g2 : g);
        if (i % 2 === 0) b.box(x + Math.cos(a) * 0.3, hgt - 0.1, z + Math.sin(a) * 0.3, 0.16, 0.5, 0.16, head);
      }
      break;
    }
    case 'cactus': {
      const g: RGB = [0.34, 0.6, 0.32];
      b.cyl(0, 0, 0, 0.36, 0.3, 2.6, 6, g);
      b.dome(0, 2.6, 0, 0.3, g, 6, 2);
      b.box(0.62, 1.0, 0, 0.9, 0.3, 0.3, g);
      b.cyl(0.95, 1.0, 0, 0.22, 0.18, 1.1, 5, g);
      b.box(-0.55, 1.5, 0, 0.7, 0.28, 0.28, g);
      b.cyl(-0.8, 1.5, 0, 0.2, 0.16, 0.8, 5, g);
      break;
    }
    case 'tuft': {
      const g: RGB = [0.78, 0.7, 0.32], g2: RGB = [0.66, 0.66, 0.3];
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        b.tri([Math.cos(a) * 0.35 - 0.12, 0, Math.sin(a) * 0.35], [Math.cos(a) * 0.35 + 0.12, 0, Math.sin(a) * 0.35], [Math.cos(a) * 0.75, 0.9 + (i % 2) * 0.3, Math.sin(a) * 0.75], i % 2 ? g : g2);
        b.tri([Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35 - 0.12], [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35 + 0.12], [Math.cos(a) * 0.75, 0.9 + (i % 2) * 0.3, Math.sin(a) * 0.75], i % 2 ? g2 : g);
      }
      break;
    }
    case 'ice': {
      b.cyl(0, -0.15, 0, 1.7, 1.2, 0.55, 5, [0.82, 0.92, 0.98], [0.95, 0.98, 1], 0.4);
      b.cyl(1.1, -0.15, 0.9, 0.9, 0.5, 0.9, 4, [0.76, 0.88, 0.96], [0.93, 0.97, 1]);
      break;
    }
    case 'palm': {
      b.cyl(0, 0, 0, 0.24, 0.16, 3.2, 5, [0.56, 0.42, 0.26]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.tri([0, 3.3, 0], [Math.cos(a - 0.3) * 1.2, 3.1, Math.sin(a - 0.3) * 1.2], [Math.cos(a) * 2.1, 2.4, Math.sin(a) * 2.1], [0.32, 0.62, 0.24]);
        b.tri([0, 3.3, 0], [Math.cos(a) * 2.1, 2.4, Math.sin(a) * 2.1], [Math.cos(a + 0.3) * 1.2, 3.1, Math.sin(a + 0.3) * 1.2], [0.4, 0.7, 0.28]);
      }
      break;
    }
  }
  return b.build();
}

interface Recipe { kind: PropKind; per1000: number; scale: [number, number]; clump?: number; maxSlope?: number; high?: boolean }
const RECIPES: Record<Terrain, Recipe[]> = {
  forest: [
    { kind: 'broadleaf', per1000: 6.2, scale: [0.85, 1.35], clump: 0.36, maxSlope: 0.8 },
    { kind: 'conifer', per1000: 3.6, scale: [0.9, 1.4], clump: 0.42, maxSlope: 0.9 },
    { kind: 'bush', per1000: 1.2, scale: [0.8, 1.3] },
  ],
  plains: [
    { kind: 'broadleaf', per1000: 0.75, scale: [0.8, 1.2], clump: 0.52, maxSlope: 0.6 },
    { kind: 'bush', per1000: 0.9, scale: [0.7, 1.2] },
  ],
  hills: [
    { kind: 'rock', per1000: 0.9, scale: [0.8, 1.7] },
    { kind: 'conifer', per1000: 0.8, scale: [0.8, 1.2], clump: 0.5, maxSlope: 0.8 },
    { kind: 'broadleaf', per1000: 0.5, scale: [0.75, 1.1], clump: 0.5, maxSlope: 0.6 },
    { kind: 'bush', per1000: 0.6, scale: [0.7, 1.1] },
  ],
  mountains: [
    { kind: 'crag', per1000: 0.5, scale: [0.9, 1.7], high: true },
    { kind: 'rock', per1000: 1.2, scale: [1, 2.2] },
    { kind: 'conifer', per1000: 0.9, scale: [0.75, 1.1], clump: 0.5, maxSlope: 0.9 },
  ],
  marsh: [
    { kind: 'reed', per1000: 4.2, scale: [0.9, 1.6], clump: 0.4 },
    { kind: 'bush', per1000: 0.7, scale: [0.7, 1.1] },
    { kind: 'broadleaf', per1000: 0.3, scale: [0.7, 1] },
  ],
  steppe: [
    { kind: 'tuft', per1000: 3.4, scale: [0.9, 1.7] },
    { kind: 'bush', per1000: 0.35, scale: [0.6, 1] },
    { kind: 'broadleaf', per1000: 0.12, scale: [0.7, 1] },
    { kind: 'rock', per1000: 0.2, scale: [0.6, 1.1] },
  ],
  desert: [
    { kind: 'cactus', per1000: 0.7, scale: [0.8, 1.5] },
    { kind: 'rock', per1000: 0.5, scale: [0.7, 1.6] },
    { kind: 'palm', per1000: 0.25, scale: [0.9, 1.3], clump: 0.6 },
    { kind: 'tuft', per1000: 0.5, scale: [0.7, 1.1] },
  ],
  tundra: [
    { kind: 'ice', per1000: 0.75, scale: [0.9, 2] },
    { kind: 'conifer', per1000: 0.7, scale: [0.6, 0.95], clump: 0.52 },
    { kind: 'rock', per1000: 0.5, scale: [0.7, 1.4] },
    { kind: 'tuft', per1000: 0.6, scale: [0.7, 1.1] },
  ],
};

/** Circles (x, z, r) where nothing may grow: settlements, districts, markers. */
export type Clearings = Map<number, number[]>;

export class PropLayer {
  readonly group = new THREE.Group();
  private geos = new Map<string, THREE.BufferGeometry>();
  private meshes: THREE.InstancedMesh[] = [];
  count = 0;

  constructor(private material: THREE.Material) {
    for (const k of KINDS) this.geos.set(k, model(k, false));
    for (const k of INK_KINDS) this.geos.set(k + ':ink', model(k, true));
  }

  rebuild(topo: Topology, hf: Heightfield, clear: Clearings): void {
    for (const m of this.meshes) { this.group.remove(m); m.dispose(); }
    this.meshes = [];
    const lists = new Map<string, number[]>();
    const push = (key: string, x: number, y: number, z: number, rot: number, s: number, sy: number, tint: number) => {
      let l = lists.get(key);
      if (!l) lists.set(key, (l = []));
      l.push(x, y, z, rot, s, sy, tint);
    };
    let landArea = 0;
    for (const p of topo.regions) landArea += p.area;
    // Scale densities down on very large worlds so the instance budget holds.
    let expected = 0;
    for (const p of topo.regions) for (const rc of RECIPES[p.r.terrain]) expected += (p.area / 1000) * rc.per1000 * (p.r.visibility === 'remembered' ? 0.5 : 1);
    const budget = Math.min(1, MAX_PROPS / Math.max(1, expected));
    const f = topo.fields;
    for (const p of topo.regions) this.scatter(p, topo, hf, clear.get(p.r.id) ?? [], budget, push, f);
    let total = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const col = new THREE.Color();
    for (const [key, l] of lists) {
      const geo = this.geos.get(key);
      if (!geo) continue;
      const n = l.length / 7;
      const mesh = new THREE.InstancedMesh(geo, this.material, n);
      for (let i = 0; i < n; i++) {
        const o = i * 7;
        pos.set(l[o], l[o + 1], l[o + 2]);
        q.setFromAxisAngle(up, l[o + 3]);
        scl.set(l[o + 4], l[o + 5], l[o + 4]);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);
        const t = l[o + 6];
        col.setRGB(0.84 + t * 0.3, 0.9 + t * 0.18, 0.84 + t * 0.2);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = !key.endsWith(':ink') && key !== 'tuft' && key !== 'reed';
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
      total += n;
    }
    this.count = total;
  }

  private scatter(
    p: TRegion, topo: Topology, hf: Heightfield, clear: number[], budget: number,
    push: (key: string, x: number, y: number, z: number, rot: number, s: number, sy: number, tint: number) => void,
    f: Topology['fields'],
  ): void {
    const remembered = p.r.visibility === 'remembered';
    const rand = rng(hash32(p.r.id * 7919 + 13, 0x51ed));
    const [x0, z0, x1, z1] = p.bbox;
    const high = p.r.elevation > 150;
    for (const rc of RECIPES[p.r.terrain]) {
      let kind = rc.kind;
      // Cold or high forests are coniferous.
      if (p.r.terrain === 'forest' && high && kind === 'broadleaf') kind = 'conifer';
      if (remembered && !INK_KINDS.includes(kind)) continue;
      const key = remembered ? kind + ':ink' : kind;
      const want = Math.round((p.area / 1000) * rc.per1000 * budget * (remembered ? 0.35 : 1));
      let got = 0;
      for (let tries = 0; tries < want * 7 && got < want; tries++) {
        let x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
        const sv = rand(), rot = rand() * Math.PI * 2, tint = rand() - 0.5;
        if (regionIndexAt(f, x, z) !== p.idx) continue;
        if (rc.clump !== undefined && fbm(x / 34, z / 34, 2, 811 + KINDS.indexOf(kind) * 13) < rc.clump) continue;
        if (rc.high) {
          // Summits belong on the ridges: of three nearby candidates keep the highest.
          let bh = heightAt(hf, x, z);
          for (let k = 0; k < 3; k++) {
            const cx = x + (rand() - 0.5) * 22, cz = z + (rand() - 0.5) * 22;
            const ch = heightAt(hf, cx, cz);
            if (ch > bh && regionIndexAt(f, cx, cz) === p.idx) { bh = ch; x = cx; z = cz; }
          }
          if (bh < 16) continue;
        }
        const sd = sampleField(f, f.sd, x, z);
        if (sd < (kind === 'crag' ? 16 : 3.5)) continue;
        if (sampleField(f, f.dUnk, x, z) < 16) continue;
        const y = heightAt(hf, x, z);
        if (y < 0.7) continue;
        if (riverDistAt(hf, x, z) < (kind === 'reed' ? 4.5 : 7.5)) continue;
        if (rc.maxSlope !== undefined && slopeAt(hf, x, z) > rc.maxSlope) continue;
        let blocked = false;
        for (let c = 0; c < clear.length; c += 3) {
          const dx = x - clear[c], dz = z - clear[c + 1], r = clear[c + 2] + (kind === 'crag' ? 6 : 1.2);
          if (dx * dx + dz * dz < r * r) { blocked = true; break; }
        }
        if (blocked) continue;
        const s = (rc.scale[0] + sv * (rc.scale[1] - rc.scale[0])) * (remembered ? 0.85 : 1);
        push(key, x, y - 0.12, z, rot, s, s * (remembered ? 0.6 : 0.9 + rand() * 0.25), tint);
        got++;
      }
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const g of this.geos.values()) g.dispose();
    this.meshes = [];
  }
}
