// A tiny flat-shaded, vertex-coloured geometry builder for the map's original
// low-poly models. Everything on the map (buildings, props, markers) is assembled
// from these primitives in code; there are no downloaded assets.
import * as THREE from 'three';
import { clamp, luma, sepia, srgbToLinear, type RGB } from './util';

interface Xf { tx: number; ty: number; tz: number; c: number; s: number; k: number }

export class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private xf: Xf = { tx: 0, ty: 0, tz: 0, c: 1, s: 0, k: 1 };
  private stack: Xf[] = [];
  /** Multiplies every colour (idle facilities look dark). */
  dim = 1;
  /** 0..1 desaturation toward sepia (remembered regions). */
  fade = 0;

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Enter a local frame: translate, rotate about Y, uniform scale. */
  push(x: number, y: number, z: number, rotY = 0, scale = 1): this {
    const p = this.xf;
    this.stack.push(p);
    const [wx, wy, wz] = this.world(x, y, z);
    const c = Math.cos(rotY), s = Math.sin(rotY);
    this.xf = { tx: wx, ty: wy, tz: wz, c: p.c * c - p.s * s, s: p.s * c + p.c * s, k: p.k * scale };
    return this;
  }
  pop(): this {
    const p = this.stack.pop();
    if (p) this.xf = p;
    return this;
  }
  world(x: number, y: number, z: number): [number, number, number] {
    const m = this.xf;
    return [m.tx + m.k * (x * m.c + z * m.s), m.ty + m.k * y, m.tz + m.k * (-x * m.s + z * m.c)];
  }

  private shade(c: RGB): RGB {
    let o: RGB = c;
    if (this.fade > 0) {
      // Map-ink rendition: a warm, light sepia that keeps only the value structure.
      const l = luma(sepia(c, 1));
      const k: RGB = [0.5 + l * 0.42, 0.42 + l * 0.42, 0.28 + l * 0.4];
      o = [c[0] + (k[0] - c[0]) * this.fade, c[1] + (k[1] - c[1]) * this.fade, c[2] + (k[2] - c[2]) * this.fade];
    }
    if (this.dim !== 1) {
      const l = luma(o) * this.dim;
      o = [o[0] * this.dim * 0.6 + l * 0.4, o[1] * this.dim * 0.6 + l * 0.4, o[2] * this.dim * 0.6 + l * 0.4];
    }
    return [srgbToLinear(clamp(o[0], 0, 1)), srgbToLinear(clamp(o[1], 0, 1)), srgbToLinear(clamp(o[2], 0, 1))];
  }

  /** Triangle from local points; wound counter-clockwise seen from outside. */
  tri(a: number[], b: number[], c: number[], color: RGB): this {
    const A = this.world(a[0], a[1], a[2]), B = this.world(b[0], b[1], b[2]), C = this.world(c[0], c[1], c[2]);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const k = this.shade(color);
    this.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.col.push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
    return this;
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: RGB): this {
    return this.tri(a, b, c, color).tri(a, c, d, color);
  }

  /** Box centred on (cx, cz), standing on y0. Optional taper narrows the top. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: RGB, rotY = 0, taper = 1, top?: RGB): this {
    this.push(cx, y0, cz, rotY);
    const x = w / 2, z = d / 2, xt = x * taper, zt = z * taper;
    const p = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-xt, h, -zt], [xt, h, -zt], [xt, h, zt], [-xt, h, zt]];
    this.quad(p[3], p[2], p[6], p[7], color);
    this.quad(p[1], p[0], p[4], p[5], color);
    this.quad(p[2], p[1], p[5], p[6], color);
    this.quad(p[0], p[3], p[7], p[4], color);
    this.quad(p[7], p[6], p[5], p[4], top ?? color);
    return this.pop();
  }

  /** Gabled roof: ridge along local X, eaves at y0, ridge at y0 + h. `over` is the eave overhang. */
  gable(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: RGB, rotY = 0, over = 0.25, gableColor?: RGB): this {
    this.push(cx, y0, cz, rotY);
    const x = w / 2 + over, z = d / 2 + over;
    const a = [-x, 0, z], b = [x, 0, z], c = [x, 0, -z], e = [-x, 0, -z], r0 = [-x, h, 0], r1 = [x, h, 0];
    this.quad(a, b, r1, r0, color);
    this.quad(c, e, r0, r1, color);
    this.tri(e, a, r0, gableColor ?? color);
    this.tri(b, c, r1, gableColor ?? color);
    return this.pop();
  }

  /** Hipped (four-sided) roof. `ridge` is the ridge length as a share of w (0 = pyramid). */
  hip(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: RGB, rotY = 0, ridge = 0, over = 0.25): this {
    this.push(cx, y0, cz, rotY);
    const x = w / 2 + over, z = d / 2 + over, rx = (w / 2) * ridge;
    const a = [-x, 0, z], b = [x, 0, z], c = [x, 0, -z], e = [-x, 0, -z], r0 = [-rx, h, 0], r1 = [rx, h, 0];
    this.quad(a, b, r1, r0, color);
    this.quad(c, e, r0, r1, color);
    this.tri(e, a, r0, color);
    this.tri(b, c, r1, color);
    return this.pop();
  }

  /** Cylinder / cone / frustum standing on y0. */
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, sides: number, color: RGB, top?: RGB, phase = 0): this {
    this.push(cx, y0, cz);
    for (let i = 0; i < sides; i++) {
      const a0 = phase + (i / sides) * Math.PI * 2, a1 = phase + ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const b0 = [c0 * r0, 0, s0 * r0], b1 = [c1 * r0, 0, s1 * r0];
      if (r1 > 0.001) {
        const t0 = [c0 * r1, h, s0 * r1], t1 = [c1 * r1, h, s1 * r1];
        this.quad(b1, b0, t0, t1, color);
        this.tri([0, h, 0], t1, t0, top ?? color);
      } else this.tri(b1, b0, [0, h, 0], color);
    }
    return this.pop();
  }

  /** Flat disc facing up. */
  disc(cx: number, y: number, cz: number, r: number, sides: number, color: RGB, phase = 0): this {
    this.push(cx, y, cz);
    for (let i = 0; i < sides; i++) {
      const a0 = phase + (i / sides) * Math.PI * 2, a1 = phase + ((i + 1) / sides) * Math.PI * 2;
      this.tri([0, 0, 0], [Math.cos(a1) * r, 0, Math.sin(a1) * r], [Math.cos(a0) * r, 0, Math.sin(a0) * r], color);
    }
    return this.pop();
  }

  /** Dome (upper hemisphere, optionally squashed or stretched). */
  dome(cx: number, y0: number, cz: number, r: number, color: RGB, sides = 8, rings = 3, stretch = 1, alt?: RGB): this {
    this.push(cx, y0, cz);
    for (let j = 0; j < rings; j++) {
      const p0 = (j / rings) * (Math.PI / 2), p1 = ((j + 1) / rings) * (Math.PI / 2);
      const r0 = Math.cos(p0) * r, r1 = Math.cos(p1) * r, y0b = Math.sin(p0) * r * stretch, y1 = Math.sin(p1) * r * stretch;
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
        const k = alt && i % 2 ? alt : color;
        const b0 = [Math.cos(a0) * r0, y0b, Math.sin(a0) * r0], b1 = [Math.cos(a1) * r0, y0b, Math.sin(a1) * r0];
        if (j === rings - 1) this.tri(b1, b0, [0, y1, 0], k);
        else this.quad(b1, b0, [Math.cos(a0) * r1, y1, Math.sin(a0) * r1], [Math.cos(a1) * r1, y1, Math.sin(a1) * r1], k);
      }
    }
    return this.pop();
  }

  /** Low-poly ball (two domes). */
  ball(cx: number, cy: number, cz: number, r: number, color: RGB, sides = 6): this {
    this.dome(cx, cy, cz, r, color, sides, 2);
    this.push(cx, cy, cz);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const m = 0.72 * r, y = -0.7 * r;
      const e0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], e1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
      const l0 = [Math.cos(a0) * m, y, Math.sin(a0) * m], l1 = [Math.cos(a1) * m, y, Math.sin(a1) * m];
      this.quad(e0, e1, l1, l0, color);
      this.tri(l0, l1, [0, -r, 0], color);
    }
    return this.pop();
  }

  /** Torus. axis 'y' lies flat on the ground; 'z' stands upright facing local Z. */
  torus(cx: number, cy: number, cz: number, R: number, r: number, color: RGB, seg = 12, tube = 5, axis: 'y' | 'z' = 'y', rotY = 0, alt?: RGB): this {
    this.push(cx, cy, cz, rotY);
    const pt = (i: number, j: number): number[] => {
      const a = (i / seg) * Math.PI * 2, t = (j / tube) * Math.PI * 2;
      const rr = R + Math.cos(t) * r, h = Math.sin(t) * r;
      return axis === 'y' ? [Math.cos(a) * rr, h, Math.sin(a) * rr] : [Math.cos(a) * rr, Math.sin(a) * rr, h];
    };
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < tube; j++) {
        const k = alt && i % 2 ? alt : color;
        if (axis === 'y') this.quad(pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j), k);
        else this.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), k);
      }
    }
    return this.pop();
  }

  /** Thin beam between two local points (square section). */
  beam(a: number[], b: number[], t: number, color: RGB): this {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    // Two perpendiculars.
    let ux = -dz, uy = 0, uz = dx;
    let ul = Math.hypot(ux, uz);
    if (ul < 1e-4) { ux = 1; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    const vx = (dy * uz - dz * uy) / l, vy = (dz * ux - dx * uz) / l, vz = (dx * uy - dy * ux) / l;
    const h = t / 2;
    const c = (p: number[], su: number, sv: number) => [p[0] + (ux * su + vx * sv) * h, p[1] + (uy * su + vy * sv) * h, p[2] + (uz * su + vz * sv) * h];
    const s: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const [s0, t0] = s[i], [s1, t1] = s[(i + 1) % 4];
      const q0 = c(a, s0, t0), q1 = c(a, s1, t1), q2 = c(b, s1, t1), q3 = c(b, s0, t0);
      // Emit both windings' worth of safety by choosing the outward one.
      this.quad(q1, q0, q3, q2, color);
    }
    return this;
  }

  /** A flag: pole plus a pennant in `color`. */
  flag(cx: number, y0: number, cz: number, h: number, color: RGB, rotY = 0, size = 1): this {
    this.push(cx, y0, cz, rotY);
    this.box(0, 0, 0, 0.16 * size, h, 0.16 * size, [0.32, 0.25, 0.2]);
    const w = 1.9 * size, fh = 1.15 * size;
    const a = [0.08, h - 0.1, 0], b = [0.08 + w, h - 0.1 - fh * 0.5, 0], c = [0.08, h - 0.1 - fh, 0];
    this.tri(a, b, c, color).tri(a, c, b, color);
    return this.pop();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    return g;
  }
}
