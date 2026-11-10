// Illustrations on the unexplored parchment: an original set of ink doodles
// (ships, a sea serpent, sketched peaks and woods, a whale, a wind cloud, a sun)
// and a compass rose, drawn on a canvas atlas at run time and laid on the sheet
// only where nothing is known. Exploration covers them with real land and sea.
import * as THREE from 'three';
import { sampleField, type Topology } from './topology';
import { hash32, rng } from './util';

export interface ParchmentDecals {
  group: THREE.Group;
  texture: THREE.Texture;
  material: THREE.Material;
  /** World positions where a "beyond the known" caption may be shown. */
  captions: [number, number][];
}

const CELL = 340;
const COLS = 3;
const INK = 'rgba(96,66,38,0.86)';
const INK_SOFT = 'rgba(96,66,38,0.45)';

type Draw = (g: CanvasRenderingContext2D, rand: () => number) => void;

function wobblyLine(g: CanvasRenderingContext2D, pts: number[], rand: () => number, j = 1.6): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] + (rand() - 0.5) * j, y = pts[i + 1] + (rand() - 0.5) * j;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}
function arc(g: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, a1: number): void {
  g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke();
}
function waves(g: CanvasRenderingContext2D, x: number, y: number, n: number, w = 16): void {
  g.beginPath();
  for (let i = 0; i < n; i++) { g.moveTo(x + i * w, y); g.quadraticCurveTo(x + i * w + w / 4, y - 6, x + i * w + w / 2, y); g.quadraticCurveTo(x + i * w + (w * 3) / 4, y + 5, x + i * w + w, y); }
  g.stroke();
}

const DOODLES: Draw[] = [
  // 0: compass rose with rhumb lines
  (g) => {
    const c = CELL / 2;
    g.lineWidth = 1;
    g.strokeStyle = INK_SOFT;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 60, c + Math.sin(a) * 60); g.lineTo(c + Math.cos(a) * 165, c + Math.sin(a) * 165); g.stroke(); }
    g.strokeStyle = INK; g.fillStyle = INK;
    g.lineWidth = 2.2; arc(g, c, c, 96, 0, Math.PI * 2);
    g.lineWidth = 1.2; arc(g, c, c, 88, 0, Math.PI * 2); arc(g, c, c, 44, 0, Math.PI * 2);
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 88, c + Math.sin(a) * 88); g.lineTo(c + Math.cos(a) * 96, c + Math.sin(a) * 96); g.stroke(); }
    const star = (len: number, wid: number, off: number, fill: boolean) => {
      for (let i = 0; i < 4; i++) {
        const a = off + (i / 4) * Math.PI * 2;
        const tx = c + Math.cos(a) * len, ty = c + Math.sin(a) * len;
        const lx = c + Math.cos(a + Math.PI / 2) * wid, ly = c + Math.sin(a + Math.PI / 2) * wid;
        const rx = c + Math.cos(a - Math.PI / 2) * wid, ry = c + Math.sin(a - Math.PI / 2) * wid;
        g.beginPath(); g.moveTo(c, c); g.lineTo(lx, ly); g.lineTo(tx, ty); g.closePath(); if (fill) g.fill(); g.stroke();
        g.beginPath(); g.moveTo(c, c); g.lineTo(rx, ry); g.lineTo(tx, ty); g.closePath(); g.stroke();
      }
    };
    g.lineWidth = 1.4;
    star(74, 13, Math.PI / 4, false);
    star(128, 17, 0, true);
    // North: a small crowned arrowhead rather than a letter, so it needs no translation.
    g.beginPath(); g.moveTo(c, c - 160); g.lineTo(c - 11, c - 136); g.lineTo(c, c - 142); g.lineTo(c + 11, c - 136); g.closePath(); g.fill();
  },
  // 1: sailing ship
  (g, rand) => {
    g.strokeStyle = INK; g.lineWidth = 2.4; g.fillStyle = 'rgba(96,66,38,0.16)';
    g.beginPath(); g.moveTo(84, 196); g.quadraticCurveTo(170, 238, 262, 190); g.lineTo(246, 222); g.quadraticCurveTo(170, 246, 102, 222); g.closePath(); g.fill(); g.stroke();
    wobblyLine(g, [150, 198, 150, 84], rand); wobblyLine(g, [206, 196, 206, 104], rand);
    g.beginPath(); g.moveTo(152, 92); g.quadraticCurveTo(196, 130, 154, 182); g.quadraticCurveTo(128, 136, 152, 92); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(208, 112); g.quadraticCurveTo(240, 144, 210, 184); g.quadraticCurveTo(192, 146, 208, 112); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(150, 84); g.lineTo(122, 76); g.lineTo(150, 68); g.closePath(); g.fill(); g.stroke();
    wobblyLine(g, [262, 190, 296, 172], rand);
    g.lineWidth = 1.6; waves(g, 60, 250, 6); waves(g, 96, 266, 9); waves(g, 150, 282, 5);
  },
  // 2: sea serpent
  (g) => {
    g.strokeStyle = INK; g.lineWidth = 2.6; g.fillStyle = 'rgba(96,66,38,0.14)';
    for (const [x, r] of [[110, 34], [176, 42], [244, 30]] as [number, number][]) { g.beginPath(); g.arc(x, 214, r, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); g.lineWidth = 1.2; for (let k = 0; k < 4; k++) arc(g, x, 214, r - 7, Math.PI + 0.35 + k * 0.6, Math.PI + 0.6 + k * 0.6); g.lineWidth = 2.6; }
    g.beginPath(); g.moveTo(52, 214); g.quadraticCurveTo(40, 150, 76, 118); g.quadraticCurveTo(110, 108, 108, 134); g.quadraticCurveTo(86, 138, 80, 152); g.quadraticCurveTo(70, 180, 78, 214); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(88, 126, 3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(108, 130); g.lineTo(126, 124); g.moveTo(108, 134); g.lineTo(124, 140); g.stroke();
    g.beginPath(); g.moveTo(278, 214); g.quadraticCurveTo(300, 178, 288, 150); g.quadraticCurveTo(310, 160, 304, 214); g.stroke();
    g.lineWidth = 1.6; waves(g, 36, 226, 17); waves(g, 80, 242, 10);
  },
  // 3: sketched mountain range
  (g, rand) => {
    g.strokeStyle = INK; g.lineWidth = 2.4;
    for (const [x, hgt, w] of [[70, 80, 50], [130, 130, 66], [206, 104, 60], [264, 70, 44]] as [number, number, number][]) {
      wobblyLine(g, [x - w, 236, x - w * 0.3, 236 - hgt * 0.6, x, 236 - hgt, x + w * 0.4, 236 - hgt * 0.5, x + w, 236], rand, 3);
      g.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) { const t = 0.15 + k * 0.13; g.beginPath(); g.moveTo(x + w * t * 0.5, 236 - hgt * (1 - t)); g.lineTo(x + w * t * 0.5 + 10, 236 - hgt * (1 - t) + 24); g.stroke(); }
      g.lineWidth = 2.4;
    }
  },
  // 4: woods
  (g, rand) => {
    g.strokeStyle = INK; g.lineWidth = 2;
    for (let i = 0; i < 11; i++) {
      const x = 62 + (i % 4) * 62 + (Math.floor(i / 4) % 2) * 30 + (rand() - 0.5) * 10, y = 150 + Math.floor(i / 4) * 44;
      arc(g, x, y, 17, Math.PI * 0.85, Math.PI * 2.15);
      arc(g, x - 10, y + 8, 9, Math.PI * 0.6, Math.PI * 1.5);
      arc(g, x + 10, y + 8, 9, Math.PI * 1.5, Math.PI * 2.4);
      g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x, y + 30); g.stroke();
    }
  },
  // 5: whale with spout
  (g) => {
    g.strokeStyle = INK; g.lineWidth = 2.6; g.fillStyle = 'rgba(96,66,38,0.14)';
    g.beginPath(); g.moveTo(70, 200); g.quadraticCurveTo(120, 136, 220, 172); g.quadraticCurveTo(250, 182, 268, 156); g.quadraticCurveTo(272, 186, 292, 184); g.quadraticCurveTo(258, 214, 216, 204); g.quadraticCurveTo(130, 236, 70, 200); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(104, 188, 3, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(132, 156); g.quadraticCurveTo(124, 120, 104, 110); g.moveTo(134, 156); g.quadraticCurveTo(136, 118, 132, 100); g.moveTo(136, 156); g.quadraticCurveTo(150, 124, 164, 112); g.stroke();
    waves(g, 46, 226, 15); waves(g, 90, 242, 8);
  },
  // 6: wind cloud
  (g) => {
    g.strokeStyle = INK; g.lineWidth = 2.4;
    for (const [x, y, r] of [[100, 150, 30], [140, 128, 36], [184, 142, 30], [150, 168, 34]] as [number, number, number][]) arc(g, x, y, r, Math.PI * 0.9, Math.PI * 2.3);
    g.lineWidth = 1.8;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(206, 140 + k * 12); g.quadraticCurveTo(250, 134 + k * 14, 300 - k * 8, 150 + k * 16); g.stroke(); }
    g.beginPath(); g.arc(292, 168, 9, Math.PI * 1.5, Math.PI * 3.2); g.stroke();
  },
  // 7: radiant sun
  (g) => {
    const c = CELL / 2;
    g.strokeStyle = INK; g.lineWidth = 2.4;
    arc(g, c, c, 44, 0, Math.PI * 2);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r0 = 54, r1 = i % 2 ? 78 : 96;
      g.beginPath(); g.moveTo(c + Math.cos(a - 0.08) * r0, c + Math.sin(a - 0.08) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.lineTo(c + Math.cos(a + 0.08) * r0, c + Math.sin(a + 0.08) * r0); g.stroke();
    }
    g.lineWidth = 1.6;
    arc(g, c - 14, c - 8, 5, Math.PI, 0); arc(g, c + 14, c - 8, 5, Math.PI, 0); arc(g, c, c + 6, 18, 0.25, Math.PI - 0.25);
  },
  // 8: small island with a palm and a marker cross
  (g, rand) => {
    g.strokeStyle = INK; g.lineWidth = 2.4; g.fillStyle = 'rgba(96,66,38,0.12)';
    g.beginPath(); g.moveTo(80, 214); g.quadraticCurveTo(170, 150, 262, 214); g.closePath(); g.fill(); g.stroke();
    wobblyLine(g, [176, 186, 182, 150, 174, 116], rand);
    for (let k = 0; k < 5; k++) { const a = -2.6 + k * 0.55; g.beginPath(); g.moveTo(174, 116); g.quadraticCurveTo(174 + Math.cos(a) * 26, 104 + Math.sin(a) * 20, 174 + Math.cos(a) * 46, 124 + Math.sin(a) * 26); g.stroke(); }
    g.lineWidth = 3; g.beginPath(); g.moveTo(118, 188); g.lineTo(134, 204); g.moveTo(134, 188); g.lineTo(118, 204); g.stroke();
    g.lineWidth = 1.6; waves(g, 50, 232, 15);
  },
];

/** Which doodles suit open water, and which suit unknown land. */
const SEA_SET = [1, 2, 5, 6, 8, 7];
const LAND_SET = [3, 4, 3, 4, 7, 6];

function makeAtlas(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL * COLS; c.height = CELL * COLS;
  const g = c.getContext('2d');
  if (g) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    DOODLES.forEach((d, i) => {
      g.save();
      g.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL);
      g.beginPath(); g.rect(4, 4, CELL - 8, CELL - 8); g.clip();
      d(g, rng(seed + i * 101));
      g.restore();
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildParchmentDecals(topo: Topology, seed: number): ParchmentDecals {
  const texture = makeAtlas(seed);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.9 });
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const f = topo.fields;
  const W = topo.width, H = topo.height;
  const captions: [number, number][] = [];
  const quad = (kind: number, x: number, z: number, size: number, rot: number) => {
    const b = pos.length / 3;
    const c = Math.cos(rot), s = Math.sin(rot), hs = size / 2;
    for (const [lx, lz] of [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]]) pos.push(x + lx * c + lz * s, 0.06, z - lx * s + lz * c);
    const u0 = (kind % COLS) / COLS, v0 = 1 - Math.floor(kind / COLS) / COLS, du = 1 / COLS;
    uv.push(u0, v0, u0 + du, v0, u0 + du, v0 - du, u0, v0 - du);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  };
  // How far a spot is from anything charted (land or the painted sea).
  const clear = (x: number, z: number, r: number): boolean => {
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7]]) {
      const px = x + ox, pz = z + oz;
      if (sampleField(f, f.sd, px, pz) > -34) return false;
      if (sampleField(f, f.dCoast, px, pz) < 172) return false;
    }
    return true;
  };
  // Compass roses in the sheet margin, outside the neat-line.
  quad(0, -150, H + 135, 210, 0);
  quad(0, W + 160, -120, 150, 0);
  // Seeded doodles on a jittered grid across the sheet; those overlapped by knowledge are skipped.
  const step = 250;
  for (let gz = -1; gz * step < H + step; gz++) {
    for (let gx = -1; gx * step < W + step; gx++) {
      const hsh = hash32(gx * 73 + seed, gz * 151 + 7);
      const rand = rng(hsh);
      const x = gx * step + 40 + rand() * (step - 80), z = gz * step + 40 + rand() * (step - 80);
      const size = 95 + rand() * 60;
      const pickSea = rand();
      const which = rand();
      const rot = (rand() - 0.5) * 0.4;
      const show = rand();
      if (x < -200 || z < -180 || x > W + 200 || z > H + 180) continue;
      if (show < 0.34) continue;
      if (!clear(x, z, size * 0.5)) continue;
      const inFrame = x > 60 && z > 60 && x < W - 60 && z < H - 60;
      const set = inFrame && pickSea < 0.45 ? LAND_SET : SEA_SET;
      quad(set[Math.floor(which * set.length)], x, z, size, rot);
      if (inFrame && captions.length < 3 && show > 0.8) captions.push([x, z + size * 0.62]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, texture, material, captions };
}

export function disposeParchment(d: ParchmentDecals): void {
  d.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
  d.texture.dispose();
  d.material.dispose();
}
