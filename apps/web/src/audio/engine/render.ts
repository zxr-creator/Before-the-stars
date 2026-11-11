// Offline renders and their analysis, for scripts/music-render.mjs (never part of the
// game bundle). The renders go through the same conductor, instruments and master chain
// as the live game, on an OfflineAudioContext.
import { buildPiece, mainThemePiece, type Mood } from './arrange';
import { Conductor, type StingKind } from './conductor';
import { MIX_LEVEL } from './index';
import { SCORES, type ScoreKey } from './score';

export interface RenderSpec {
  name: string;
  kind: 'piece' | 'main' | 'layers' | 'crossfade' | 'sting';
  key: ScoreKey;
  mood: Mood;
  seed?: number;
  intensity?: number;
  /** crossfade: the era to change to, and when (s). */
  to?: ScoreKey;
  toMood?: Mood;
  at?: number;
  sting?: StingKind;
  seconds?: number;
  sr?: number;
}

function chain(ctx: BaseAudioContext): AudioNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.02;
  comp.release.value = 0.35;
  const music = ctx.createGain();
  music.gain.value = MIX_LEVEL;
  music.connect(comp).connect(ctx.destination);
  return music;
}

export async function render(spec: RenderSpec) {
  const sr = spec.sr ?? 44100;
  const seed = spec.seed ?? 11;
  let seconds = spec.seconds ?? 0;
  let form = '';
  let stepAt: number[] = [];
  let finalWin: [number, number] | null = null;
  const fin = (p: { sec: (b: number) => number; beats: number }) => { const s = 0.05 + p.sec(p.beats - 4); finalWin = [s + 0.3, s + 3]; };
  if (spec.kind === 'main') {
    const p = mainThemePiece(spec.key, spec.mood, seed);
    seconds ||= p.durSec + 3;
    form = p.form;
    fin(p);
  } else if (spec.kind === 'layers') {
    const p = layersPiece(spec.key, seed);
    seconds ||= p.durSec + 3;
    form = p.form;
    fin(p);
    const bar = (b: number) => p.sec(b * 4);
    stepAt = [bar(2 + 8), bar(2 + 16), bar(2 + 24)];
  } else if (!seconds) {
    const p = buildPiece(spec.key, spec.mood, seed);
    seconds = p.durSec + 3;
    form = p.form;
    if (spec.kind === 'piece') { const s = p.sec(p.beats - 4); finalWin = [s + 0.3, s + 3]; }
  }
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const out = chain(ctx);
  const c = new Conductor(ctx, out, seed);
  const t0 = performance.now();
  if (spec.kind === 'main') {
    c.setIntensity(spec.intensity ?? 1);
    c.playPiece(mainThemePiece(spec.key, spec.mood, seed), 0.05);
    c.tick(0, seconds);
  } else if (spec.kind === 'layers') {
    // one statement per layer count: the same theme gains voices as the era advances
    c.playPiece(layersPiece(spec.key, seed), 0.05);
    const bounds = [0, ...stepAt, seconds];
    for (let k = 0; k < 4; k++) {
      c.setIntensity([0.1, 0.4, 0.6, 0.9][k]);
      c.tick(bounds[k], bounds[k + 1]);
    }
  } else if (spec.kind === 'crossfade') {
    c.setIntensity(spec.intensity ?? 1);
    c.setTarget({ key: spec.key, mood: spec.mood }, 0);
    const at = spec.at ?? 20;
    for (let t = 0; t < at; t += 0.5) c.tick(t, t + 0.6);
    c.setTarget({ key: spec.to ?? spec.key, mood: spec.toMood ?? spec.mood }, at);
    for (let t = at; t < seconds; t += 0.5) c.tick(t, t + 0.6);
    form = `${spec.key}/${spec.mood} -> ${spec.to ?? spec.key}/${spec.toMood ?? spec.mood} at ${at}s`;
  } else if (spec.kind === 'sting') {
    c.setIntensity(spec.intensity ?? 1);
    c.setTarget({ key: spec.key, mood: spec.mood }, 0);
    const at = spec.at ?? 12;
    for (let t = 0; t < seconds; t += 0.5) {
      if (t <= at && t + 0.5 > at) c.sting(spec.sting ?? 'moment', at);
      c.tick(t, t + 0.6);
    }
    form = `${spec.key}/${spec.mood} + ${spec.sting} at ${at}s`;
  } else {
    c.setIntensity(spec.intensity ?? 1);
    c.setTarget({ key: spec.key, mood: spec.mood }, 0);
    c.tick(0, seconds);
  }
  const schedMs = performance.now() - t0;
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const tonicPc = SCORES[spec.key].tonic % 12;
  return { sr, seconds, form, schedMs, analysis: analyse(L, R, sr, tonicPc, finalWin), wav: wav16(L, R, sr), spectrogram: spectrogram(L, R, sr, spec.name), stepAt };
}

function layersPiece(key: ScoreKey, seed: number) {
  return buildPiece(key, 'peace', seed, {
    sections: [
      { kind: 'intro', theme: '', vary: 0, bars: 2 },
      { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'theme', theme: 'M', vary: 0 },
      { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'theme', theme: 'M', vary: 0 },
      { kind: 'coda', theme: '', vary: 0 },
    ],
  });
}

// --- analysis -------------------------------------------------------------------------------

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Biquad coefficients (RBJ cookbook) for the K-weighting of BS.1770. */
function biquad(type: 'shelf' | 'hp', f: number, sr: number, q: number, gainDb = 0) {
  const w = (2 * Math.PI * f) / sr;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * q);
  if (type === 'hp') {
    const b0 = (1 + cw) / 2, b1 = -(1 + cw), b2 = (1 + cw) / 2, a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  const A = Math.pow(10, gainDb / 40);
  const sq = 2 * Math.sqrt(A) * alpha;
  const b0 = A * ((A + 1) + (A - 1) * cw + sq), b1 = -2 * A * ((A - 1) + (A + 1) * cw), b2 = A * ((A + 1) + (A - 1) * cw - sq);
  const a0 = (A + 1) - (A - 1) * cw + sq, a1 = 2 * ((A - 1) - (A + 1) * cw), a2 = (A + 1) - (A - 1) * cw - sq;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filt(x: Float32Array, c: number[]): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

function lufs(L: Float32Array, R: Float32Array, sr: number): number {
  const sh = biquad('shelf', 1681.97, sr, 0.7072, 3.9998);
  const hp = biquad('hp', 38.13, sr, 0.5003);
  const kl = filt(filt(L, sh), hp);
  const kr = filt(filt(R, sh), hp);
  const blk = Math.floor(0.4 * sr);
  const hop = Math.floor(blk / 4);
  const z: number[] = [];
  for (let s = 0; s + blk <= kl.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + blk; i++) e += kl[i] * kl[i] + kr[i] * kr[i];
    z.push(e / blk);
  }
  const ld = (e: number) => -0.691 + 10 * Math.log10(e + 1e-20);
  const abs = z.filter((e) => ld(e) > -70);
  if (!abs.length) return -Infinity;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter((e) => ld(e) > ld(mean) - 10);
  return ld(rel.reduce((a, b) => a + b, 0) / rel.length);
}

function analyse(L: Float32Array, R: Float32Array, sr: number, tonicPc: number, finalWin: [number, number] | null) {
  const n = L.length;
  let peak = 0, sum = 0, sq = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    const m = a > b ? a : b;
    if (m > peak) peak = m;
    if (m >= 0.999) clipped++;
    sum += L[i] + R[i];
    sq += L[i] * L[i] + R[i] * R[i];
  }
  const rms = Math.sqrt(sq / (2 * n));
  const dc = sum / (2 * n);
  // clicks: frames whose curvature energy jumps far above their surroundings
  const F = 64;
  const nf = Math.floor(n / F);
  const curv = new Float64Array(nf);
  for (let f = 0; f < nf; f++) {
    let e = 0;
    for (let i = f * F + 2; i < (f + 1) * F; i++) {
      const d2 = (L[i] - 2 * L[i - 1] + L[i - 2]) + (R[i] - 2 * R[i - 1] + R[i - 2]);
      e += d2 * d2;
    }
    curv[f] = e / F;
  }
  const clicks: number[] = [];
  const W = 30;
  for (let f = W; f < nf - W; f++) {
    let m = 0;
    for (let k = f - W; k < f + W; k++) if (k !== f) m += curv[k];
    m /= 2 * W - 1;
    if (curv[f] > 40 * m && curv[f] > 1e-7) clicks.push(+(f * F / sr).toFixed(3));
  }
  // silence inside the music (50 ms frames under -60 dBFS), ignoring the final tail
  const S = Math.floor(0.05 * sr);
  let gaps = 0, run = 0, longest = 0, lastLoud = 0, firstLoud = -1;
  const loud: boolean[] = [];
  for (let s = 0; s + S <= n; s += S) {
    let e = 0;
    for (let i = s; i < s + S; i++) e += L[i] * L[i] + R[i] * R[i];
    const db = 10 * Math.log10(e / (2 * S) + 1e-20);
    loud.push(db > -60);
    if (db > -60) { lastLoud = loud.length; if (firstLoud < 0) firstLoud = loud.length - 1; }
  }
  for (let k = Math.max(0, firstLoud); k < lastLoud; k++) {
    if (!loud[k]) { run++; if (run === 1) gaps++; longest = Math.max(longest, run); } else run = 0;
  }
  // spectrum: band energy shares and centroid, over 4096-point frames
  const N = 4096;
  const bands = [0, 150, 600, 2500, 8000, sr / 2];
  const be = new Float64Array(bands.length - 1);
  let cNum = 0, cDen = 0;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const chroma = new Float64Array(12);
  const finalChroma = new Float64Array(12);
  const finalFrom = finalWin ? Math.floor(finalWin[0] * sr) : Math.max(0, (lastLoud * S) - Math.floor(4 * sr));
  const finalTo = finalWin ? Math.floor(finalWin[1] * sr) : n;
  for (let s = 0; s + N <= n; s += N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (L[s + i] + R[s + i]) * 0.5 * win[i];
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N;
      const p = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < be.length; b++) if (f >= bands[b] && f < bands[b + 1]) be[b] += p;
      cNum += f * p; cDen += p;
      if (f > 60 && f < 2000) {
        const pc = (((Math.round(12 * Math.log2(f / 440)) + 9) % 12) + 12) % 12;
        chroma[pc] += p;
        if (s >= finalFrom && s + N <= finalTo + N) finalChroma[pc] += p;
      }
    }
  }
  const tot = be.reduce((a, b) => a + b, 0) || 1;
  const top = (c: Float64Array) => Array.from(c).map((v, i) => [i, v] as const).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => i);
  // the final chord settles on the tonic when the tonic is its strongest or second pitch class
  // (an open fifth or a sung fifth above can outweigh the root in a spectrum)
  const finalTop = top(finalChroma);
  return {
    peakDb: +(20 * Math.log10(peak + 1e-12)).toFixed(2),
    rmsDb: +(20 * Math.log10(rms + 1e-12)).toFixed(2),
    lufs: +lufs(L, R, sr).toFixed(2),
    clippedSamples: clipped,
    dc: +dc.toExponential(2),
    clicks: clicks.length,
    clickTimes: clicks.slice(0, 12),
    silenceGaps: gaps,
    longestGapS: +(longest * 0.05).toFixed(2),
    bands: { sub150: +(be[0] / tot * 100).toFixed(1), low600: +(be[1] / tot * 100).toFixed(1), mid2k5: +(be[2] / tot * 100).toFixed(1), high8k: +(be[3] / tot * 100).toFixed(1), air: +(be[4] / tot * 100).toFixed(1) },
    centroidHz: Math.round(cNum / (cDen || 1)),
    tonicPc,
    finalTopPcs: finalTop,
    resolvesToTonic: finalTop[0] === tonicPc || finalTop[1] === tonicPc,
  };
}

function wav16(L: Float32Array, R: Float32Array, sr: number): string {
  const n = L.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
    v.setInt16(o + 2, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
    o += 4;
  }
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A log-frequency spectrogram (30 Hz – 16 kHz) as a PNG data URL. */
function spectrogram(L: Float32Array, R: Float32Array, sr: number, title: string): string {
  const N = 4096;
  const W = 1400, H = 420, top = 26;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H + top + 18;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const img = g.createImageData(W, H);
  const n = L.length;
  const hop = Math.max(1, Math.floor((n - N) / W));
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const fLo = 30, fHi = 16000;
  for (let x = 0; x < W; x++) {
    const s = x * hop;
    if (s + N > n) break;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (L[s + i] + R[s + i]) * 0.5 * win[i];
    fft(re, im);
    for (let y = 0; y < H; y++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - y / (H - 1));
      const k = Math.min(N / 2 - 1, Math.round((f * N) / sr));
      const db = 10 * Math.log10((re[k] * re[k] + im[k] * im[k]) / (N * N) + 1e-14);
      const u = Math.max(0, Math.min(1, (db + 110) / 80));
      const o = (y * W + x) * 4;
      img.data[o] = Math.round(255 * Math.min(1, u * 1.6));
      img.data[o + 1] = Math.round(255 * Math.max(0, u * 1.4 - 0.4));
      img.data[o + 2] = Math.round(255 * (u < 0.5 ? u * 1.2 : Math.max(0, 1.2 - u * 1.2) + Math.max(0, u - 0.85) * 4));
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, top);
  g.fillStyle = '#ddd'; g.font = '14px sans-serif';
  g.fillText(`${title} — ${(n / sr).toFixed(1)} s, 30 Hz–16 kHz (log)`, 8, 18);
  for (const f of [100, 250, 500, 1000, 2000, 4000, 8000]) {
    const y = top + (1 - Math.log(f / fLo) / Math.log(fHi / fLo)) * (H - 1);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y, 6, 1);
    g.fillStyle = '#aaa'; g.font = '10px sans-serif'; g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 8, y + 3);
  }
  const secs = n / sr;
  for (let s = 0; s < secs; s += 10) {
    const x = (s * sr) / hop;
    g.fillStyle = '#aaa'; g.fillText(s + 's', x + 2, top + H + 13);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, top + H, 1, 5);
  }
  return cv.toDataURL('image/png');
}

export { SCORES, analyse };
