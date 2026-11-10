// Shaders and procedural textures for the 3D map: the lit ground (terrain colour,
// ownership wash, hatching, the map-ink rendition of remembered land and the fade
// into parchment), the table (parchment sheet, graticule, sea), rivers and the
// draped ribbons used for borders and outlines.
import * as THREE from 'three';
import { hash32 } from './util';

/** 256² RGBA tiling value-noise texture; each channel is an independent fractal. */
export function makeNoiseTexture(): THREE.DataTexture {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const lat = (ix: number, iy: number, period: number, seed: number) =>
    hash32(((ix % period) + period) % period + seed * 131, ((iy % period) + period) % period + seed * 977) / 4294967296;
  const vn = (x: number, y: number, period: number, seed: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = lat(ix, iy, period, seed), b = lat(ix + 1, iy, period, seed), c = lat(ix, iy + 1, period, seed), d = lat(ix + 1, iy + 1, period, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let ch = 0; ch < 4; ch++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let sum = 0, amp = 0.5, norm = 0, period = 4;
        for (let o = 0; o < 5; o++) {
          sum += amp * vn((x / N) * period, (y / N) * period, period, ch * 7 + o);
          norm += amp;
          amp *= 0.55;
          period *= 2;
        }
        // Stretch the contrast: fractal sums crowd the middle.
        const v = Math.min(1, Math.max(0, (sum / norm - 0.5) * 1.9 + 0.5));
        data[(y * N + x) * 4 + ch] = Math.round(v * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Shared GLSL: parchment colour in display space, and the display→linear helper. */
const PAPER_GLSL = /* glsl */`
uniform sampler2D tNoise;
uniform float uTime;
vec3 toLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 paperColor(vec2 p) {
  float n = texture2D(tNoise, p / 330.0).r;
  float f = texture2D(tNoise, p / 27.0).g;
  float g = texture2D(tNoise, p / 4.5).b;
  vec3 c = mix(vec3(0.945, 0.890, 0.735), vec3(0.885, 0.805, 0.625), n);
  c *= 0.95 + 0.07 * f + 0.035 * g;
  // Foxing: a few faint brown blooms.
  float fox = smoothstep(0.78, 0.92, texture2D(tNoise, p / 150.0 + 0.37).a);
  return mix(c, vec3(0.78, 0.66, 0.48), fox * 0.22);
}
`;

export interface GroundUniforms {
  tNoise: { value: THREE.Texture | null };
  tWash: { value: THREE.Texture | null };
  tHatch: { value: THREE.Texture | null };
  tInfo: { value: THREE.Texture | null };
  uRect: { value: THREE.Vector4 };
  uTime: { value: number };
  uWashGain: { value: number };
  uDesat: { value: number };
  uClouds: { value: number };
  uHatchPeriod: { value: number };
  uLens: { value: number };
}

export function makeGroundUniforms(): GroundUniforms {
  return {
    tNoise: { value: null }, tWash: { value: null }, tHatch: { value: null }, tInfo: { value: null },
    uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uTime: { value: 0 }, uWashGain: { value: 0.4 }, uDesat: { value: 0 },
    uClouds: { value: 1 }, uHatchPeriod: { value: 7 }, uLens: { value: 0 },
  };
}

/** The lit ground: Lambert with vertex colours, patched with the map layers. */
export function makeGroundMaterial(u: GroundUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aTex;\nvarying vec3 vWorld;\nvarying vec2 vTex;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTex = aTex;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
${PAPER_GLSL}
uniform sampler2D tWash;
uniform sampler2D tHatch;
uniform sampler2D tInfo;
uniform vec4 uRect;
uniform float uWashGain;
uniform float uDesat;
uniform float uClouds;
uniform float uHatchPeriod;
uniform float uLens;
varying vec3 vWorld;
varying vec2 vTex;`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
  vec2 wuv = (vWorld.xz - uRect.xy) * uRect.zw;
  vec4 wash = texture2D(tWash, wuv);
  vec4 hatch = texture2D(tHatch, wuv);
  vec4 info = texture2D(tInfo, wuv);
  float n1 = texture2D(tNoise, vWorld.xz / 43.0).r;
  float n2 = texture2D(tNoise, vWorld.xz / 8.3).g;
  float n3 = texture2D(tNoise, vWorld.xz / 2.3).b;
  vec3 base = diffuseColor.rgb;
  // Painterly mottling at three scales.
  base *= 0.9 + 0.1 * n1 + 0.07 * n2 + 0.04 * n3;
  // Wind ripples on dunes, strata on bare rock.
  base *= 1.0 + vTex.x * 0.09 * sin((vWorld.x * 0.8 + vWorld.z * 0.6) * 1.6 + n1 * 7.0);
  base *= 1.0 - vTex.y * 0.09 * step(0.55, fract(vWorld.y * 0.42 + n2 * 1.3));
  float lum = dot(base, vec3(0.3, 0.59, 0.11));
  base = mix(base, vec3(lum) * vec3(1.04, 1.0, 0.9), uDesat);
  // Remembered land: a flat map-ink rendition (tinted paper and contour lines), built
  // alongside the living colour and swapped in after lighting.
  float rem = smoothstep(0.3, 0.7, info.g + (n2 - 0.5) * 0.3);
  vec3 paperL = toLin(paperColor(vWorld.xz));
  vec3 inkFlat = mix(paperL, mix(base, vec3(lum) * vec3(1.1, 1.0, 0.8), 0.25), 0.34);
  float cy = vWorld.y / 1.6;
  float contour = 1.0 - smoothstep(0.0, 1.5, abs(fract(cy) - 0.5) / max(fwidth(cy), 1e-4));
  inkFlat = mix(inkFlat, toLin(vec3(0.47, 0.36, 0.24)), contour * 0.4);
  // Ownership or lens wash.
  float wa = clamp(wash.a * uWashGain, 0.0, 1.0);
  vec3 tinted = mix(wash.rgb * (0.55 + 1.5 * lum), wash.rgb, uLens);
  base = mix(base, tinted, wa);
  inkFlat = mix(inkFlat, mix(paperL, wash.rgb, 0.78), wash.a * max(uWashGain, 0.36));
  // Hatching: occupation (animated, the occupier's colour) or survey gaps.
  if (hatch.a > 0.02) {
    float dir = info.a > 0.5 ? -1.0 : 1.0;
    float hc = (vWorld.x + dir * vWorld.z) / uHatchPeriod + (dir > 0.0 ? uTime * 0.22 : 0.0);
    float hd = abs(fract(hc) - 0.5);
    float aa = fwidth(hc);
    float w = dir > 0.0 ? 0.13 : 0.07;
    float line = 1.0 - smoothstep(w - aa, w + aa, hd);
    base = mix(base, hatch.rgb, line * hatch.a);
    inkFlat = mix(inkFlat, mix(hatch.rgb, paperL, 0.25), line * hatch.a * 0.8);
  }
  base *= 1.0 - 0.5 * info.b;
  diffuseColor.rgb = base;`)
      .replace('#include <opaque_fragment>', /* glsl */`#include <opaque_fragment>
  // Drifting cloud shadows, then the fade into blank parchment at the edge of knowledge.
  float cl = texture2D(tNoise, (vWorld.xz + uTime * vec2(5.0, 2.2)) / 620.0).a;
  gl_FragColor.rgb *= 1.0 - 0.2 * smoothstep(0.55, 0.8, cl) * uClouds;
  float relief = clamp(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)) / max(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), 1e-3), 0.6, 1.2);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, inkFlat * (1.0 - 0.5 * info.b) * mix(1.0, relief, 0.45), rem);
  float know = smoothstep(0.22, 0.78, info.r + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.22);
  gl_FragColor.rgb = mix(paperL, gl_FragColor.rgb, know);`);
  };
  return mat;
}

/** Buildings, props and markers: flat-shaded vertex colours, winding-agnostic. */
export function makeModelMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -6 });
}

export interface TableUniforms {
  tNoise: { value: THREE.Texture | null };
  tSea: { value: THREE.Texture | null };
  uRect: { value: THREE.Vector4 };
  uSheet: { value: THREE.Vector4 };
  uFrame: { value: THREE.Vector4 };
  uTime: { value: number };
  uGrid: { value: number };
}

/** The table: desk, parchment sheet with graticule and neat-line, and the known sea. */
export function makeTableMaterial(u: TableUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: /* glsl */`
${PAPER_GLSL}
uniform sampler2D tSea;
uniform vec4 uRect;
uniform vec4 uSheet;
uniform vec4 uFrame;
uniform float uGrid;
varying vec3 vWorld;
float lineAA(float d, float w) { return 1.0 - smoothstep(w, w + max(fwidth(d), 1e-4) * 1.2, d); }
void main() {
  vec2 p = vWorld.xz;
  vec3 col = paperColor(p);
  float nA = texture2D(tNoise, p / 67.0 + uTime * vec2(0.004, 0.002)).r;
  float nB = texture2D(tNoise, p / 21.0 - uTime * vec2(0.006, 0.003)).g;
  // The sheet and the desk it lies on.
  vec2 q = abs(p - uSheet.xy) - uSheet.zw;
  float sdS = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float deckle = (texture2D(tNoise, p / 95.0).b - 0.5) * 30.0 + (texture2D(tNoise, p / 15.0).r - 0.5) * 6.0;
  float sd = sdS + deckle;
  float sheet = 1.0 - smoothstep(-1.2, 1.2, sd);
  col *= 1.0 - 0.3 * smoothstep(-220.0, 10.0, sd);
  // Graticule, finer ticks, and a double neat-line round the charted world.
  vec3 inkc = vec3(0.45, 0.34, 0.22);
  vec2 g = abs(fract(p / uGrid - 0.5) - 0.5) * uGrid;
  float grat = max(lineAA(g.x, 0.32), lineAA(g.y, 0.32));
  vec2 g2 = abs(fract(p / (uGrid * 0.2) - 0.5) - 0.5) * uGrid * 0.2;
  float fine = max(lineAA(g2.x, 0.12), lineAA(g2.y, 0.12));
  vec2 fq = abs(p - uFrame.xy) - uFrame.zw;
  float sdF = length(max(fq, 0.0)) + min(max(fq.x, fq.y), 0.0);
  float neat = max(lineAA(abs(sdF - 26.0), 1.1), lineAA(abs(sdF - 33.0), 0.35));
  float tick = lineAA(abs(sdF - 29.5), 3.5) * step(0.5, fract((fq.x > fq.y ? p.y : p.x) / 50.0));
  float inside = 1.0 - smoothstep(26.0, 27.0, sdF);
  float inkA = max(grat * 0.1 * inside, max(neat * 0.55, tick * 0.28));
  col = mix(col, inkc, inkA * (0.75 + 0.5 * nB));
  // Known sea: a living wash that thins out toward what has not been charted.
  vec4 s = texture2D(tSea, (p - uRect.xy) * uRect.zw);
  float d = s.r * 160.0;
  float kk = smoothstep(0.32, 0.6, s.g + (nA - 0.5) * 0.3 + (nB - 0.5) * 0.12);
  if (kk > 0.001) {
    // A calm, greyed sea: it frames the land and never outshines it.
    vec3 shallow = vec3(0.66, 0.82, 0.80), mid = vec3(0.47, 0.68, 0.73), deep = vec3(0.38, 0.58, 0.67);
    float t1 = smoothstep(1.0, 26.0, d + (nA - 0.5) * 12.0);
    float t2 = smoothstep(18.0, 105.0, d + (nB - 0.5) * 34.0);
    vec3 sea = mix(mix(shallow, mid, t1), deep, t2);
    sea *= 0.93 + 0.1 * nB + 0.04 * texture2D(tNoise, p / 5.0).b;
    float w1 = texture2D(tNoise, vec2(p.x / 41.0 + uTime * 0.013, p.y / 12.0 - uTime * 0.021)).b;
    float w2 = texture2D(tNoise, vec2(p.x / 27.0 - uTime * 0.011, p.y / 14.0 + uTime * 0.016)).r;
    sea += smoothstep(0.64, 0.72, w1) * smoothstep(0.56, 0.7, w2) * 0.035;
    sea = mix(sea, sea * vec3(0.94, 0.97, 1.0), smoothstep(0.45, 0.6, w2) * 0.07);
    // Foam: a solid lip at the shore, then two rolling swash lines.
    float lip = 1.0 - smoothstep(0.9, 2.7, d + (nB - 0.5) * 1.6);
    float ph = fract(d / 7.5 - uTime * 0.1 + nA * 1.4);
    float roll = smoothstep(0.4, 0.5, ph) * (1.0 - smoothstep(0.5, 0.62, ph)) * (1.0 - smoothstep(3.0, 21.0, d));
    sea = mix(sea, vec3(0.97, 1.0, 1.0), max(lip * 0.7, roll * 0.16));
    // Pigment pools darker where the wash stops.
    float rim = kk * (1.0 - kk) * 4.0;
    col = mix(col, sea * (1.0 - 0.18 * rim), kk * 0.96);
    // A faint graticule shows through the water too.
    col = mix(col, vec3(0.05, 0.25, 0.42), grat * 0.1 * kk * inside);
  }
  // Desk.
  float grain = texture2D(tNoise, vec2(p.x / 900.0, p.y / 46.0)).r;
  vec3 desk = mix(vec3(0.20, 0.125, 0.08), vec3(0.29, 0.185, 0.115), grain);
  desk *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 70.0, sd));
  col = mix(desk, col, sheet);
  gl_FragColor = vec4(toLin(col), 1.0);
  #include <colorspace_fragment>
}`,
  });
}

export interface RiverUniforms {
  tNoise: { value: THREE.Texture | null };
  tInfo: { value: THREE.Texture | null };
  uRect: { value: THREE.Vector4 };
  uTime: { value: number };
}

export function makeRiverMaterial(u: RiverUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
attribute vec2 aUv;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = aUv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  gl_Position.z -= 0.00025 * gl_Position.w;
}`,
    fragmentShader: /* glsl */`
${PAPER_GLSL}
uniform sampler2D tInfo;
uniform vec4 uRect;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 info = texture2D(tInfo, (vWorld.xz - uRect.xy) * uRect.zw);
  float n = texture2D(tNoise, vec2(vUv.x / 30.0 - uTime * 0.045, vUv.y * 0.3)).r;
  vec3 c = mix(vec3(0.33, 0.58, 0.72), vec3(0.46, 0.70, 0.80), n);
  float glint = smoothstep(0.66, 0.76, texture2D(tNoise, vec2(vUv.x / 11.0 - uTime * 0.1, vUv.y * 0.7 + 0.3)).g);
  c += glint * 0.05;
  float av = abs(vUv.y);
  c = mix(c, vec3(0.93, 0.99, 1.0), smoothstep(0.74, 0.94, av) * 0.4);
  // Remembered reaches are drawn in map ink.
  c = mix(c, vec3(0.50, 0.64, 0.70), smoothstep(0.3, 0.7, info.g) * 0.85);
  float a = (1.0 - smoothstep(0.86, 1.0, av)) * smoothstep(0.25, 0.7, info.r);
  gl_FragColor = vec4(toLin(c), a);
  #include <colorspace_fragment>
}`,
  });
}

export interface RibbonUniforms {
  uTime: { value: number };
  /** Share of the ribbon width taken by the crisp core line. */
  uCore: { value: number };
  uGlow: { value: number };
  uOpacity: { value: number };
  /** Dash length in world units; 0 = solid. */
  uDash: { value: number };
  uPulse: { value: number };
  /** 1 = dark lip on the outer edge (borders); 0 = plain (arrows, lanes). */
  uLip: { value: number };
  /** Clip-space pull toward the camera so draped ribbons do not sink into the ground mesh. */
  uBias: { value: number };
}

export function makeRibbonUniforms(core: number, glow: number): RibbonUniforms {
  return { uTime: { value: 0 }, uCore: { value: core }, uGlow: { value: glow }, uOpacity: { value: 1 }, uDash: { value: 0 }, uPulse: { value: 0 }, uLip: { value: 1 }, uBias: { value: 0.0006 } };
}

/**
 * Draped ribbon: a crisp coloured line on the outer edge with an inward gradient glow.
 * Geometry carries `color` (display space), `aAcross` (0 outer → 1 inner) and `aAlong`.
 */
export function makeRibbonMaterial(u: RibbonUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
attribute vec3 color;
attribute float aAcross;
attribute float aAlong;
uniform float uBias;
varying vec3 vColor;
varying float vAcross;
varying float vAlong;
void main() {
  vColor = color;
  vAcross = aAcross;
  vAlong = aAlong;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z -= uBias * gl_Position.w;
}`,
    fragmentShader: /* glsl */`
uniform float uTime;
uniform float uCore;
uniform float uGlow;
uniform float uOpacity;
uniform float uDash;
uniform float uPulse;
uniform float uLip;
varying vec3 vColor;
varying float vAcross;
varying float vAlong;
void main() {
  float fw = max(fwidth(vAcross), 1e-4);
  float core = 1.0 - smoothstep(uCore - fw, uCore + fw, vAcross);
  float glow = pow(1.0 - vAcross, 2.0) * uGlow;
  float lipW = uCore * 0.22;
  float lip = 1.0 - smoothstep(lipW - fw, lipW + fw, vAcross);
  vec3 c = mix(vColor, vec3(1.0), core * 0.22);
  c = mix(c, vColor * 0.35, lip * 0.85 * uLip);
  float a = max(core * 0.96, glow);
  if (uDash > 0.0 && vAlong >= 0.0) a *= mix(0.25, 1.0, step(0.45, fract(vAlong / uDash - uTime * 0.5)));
  a *= uOpacity * (1.0 - uPulse * (0.5 + 0.5 * sin(uTime * 3.2)) * 0.45);
  gl_FragColor = vec4(pow(c, vec3(2.2)), a);
  #include <colorspace_fragment>
}`,
  });
}
