// Synthesized instruments. Every voice is built from a handful of Web Audio nodes,
// scheduled on the audio clock, and disconnected when it ends (no node outlives its
// note). Envelopes always start from silence and decay to (near) silence before the
// sources stop, so note boundaries never click.
//
//   plucked strings   Karplus-Strong waveguides, rendered once per pitch into a buffer
//   bowed strings     sawtooth through a body filter, delayed vibrato
//   winds             a soft periodic wave with breath noise and a pitch scoop
//   voices            sawtooth pairs through three vowel formants
//   bells, mallets,   two-operator FM
//   electric piano
//   piano             a custom harmonic spectrum, inharmonic doubling, a closing filter
//   drums             pitched sine bodies with noise skins
import { mtof, rng } from './theory';

export type Inst =
  | 'flute' | 'pluck' | 'harp' | 'harpsi' | 'drone' | 'bowed' | 'cello' | 'strings' | 'choir' | 'pad'
  | 'glass' | 'bell' | 'vibes' | 'epiano' | 'piano' | 'horn' | 'bass' | 'sub' | 'arp' | 'lead'
  | 'frame' | 'tek' | 'timp' | 'taiko' | 'shaker';

export const PERCUSSION: ReadonlySet<Inst> = new Set<Inst>(['frame', 'tek', 'timp', 'taiko', 'shaker']);

type Ctx = BaseAudioContext;

interface KsEntry { buf: AudioBuffer; f0: number }

export class Synth {
  readonly ctx: Ctx;
  private noise: AudioBuffer;
  private waves = new Map<string, PeriodicWave>();
  private ks = new Map<string, KsEntry>();
  /** Voices whose nodes are still alive (scheduled or sounding). */
  active = 0;
  /** End times of the voices scheduled so far, to count how many overlap a moment. */
  private ends: number[] = [];
  /** Every node ever created (for the memory check: created minus released stays bounded). */
  created = 0;
  released = 0;

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, sr * 2, sr);
    const d = this.noise.getChannelData(0);
    const r = rng(7);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }

  // --- helpers ---------------------------------------------------------------------------

  private wave(name: string, imag: number[]): PeriodicWave {
    let w = this.waves.get(name);
    if (!w) {
      const im = new Float32Array([0, ...imag]);
      w = this.ctx.createPeriodicWave(new Float32Array(im.length), im);
      this.waves.set(name, w);
    }
    return w;
  }

  private osc(type: OscillatorType | PeriodicWave, f: number, t: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type as OscillatorType; else o.setPeriodicWave(type as PeriodicWave);
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    return o;
  }

  private noiseSrc(t: number): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.start(t, (t * 7.31) % 1.9);
    return n;
  }

  private gain(v = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.707): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  /** Tie the voice's lifetime to `last`: when it ends, every node is disconnected. */
  private finish(nodes: AudioNode[], sources: AudioScheduledSourceNode[], stop: number): void {
    this.active++;
    this.ends.push(stop);
    this.created += nodes.length;
    for (const s of sources) s.stop(stop);
    sources[0].onended = () => {
      for (const n of nodes) n.disconnect();
      this.active--;
      this.released += nodes.length;
    };
  }

  /** Attack-sustain-release on a gain param; returns the time the voice is silent. */
  private asr(g: AudioParam, t: number, a: number, peak: number, hold: number, rel: number): number {
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    const end = t + Math.max(a, hold);
    g.setValueAtTime(peak, end);
    g.setTargetAtTime(0, end, rel / 4);
    return end + rel * 1.8;
  }

  /** Strike then exponential decay; damped at `damp` if that comes first. */
  private strike(g: AudioParam, t: number, a: number, peak: number, tau: number, damp?: number, dampTau = 0.08): number {
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.setTargetAtTime(0, t + a, tau);
    let end = t + a + tau * 7;
    if (damp !== undefined && damp < end - dampTau * 7) {
      g.setTargetAtTime(0, damp, dampTau);
      end = damp + dampTau * 7;
    }
    return end;
  }

  private vibrato(target: AudioParam, f: number, t: number, rate: number, depth: number, delay: number, stopAt: number, nodes: AudioNode[], srcs: AudioScheduledSourceNode[]): void {
    const l = this.osc('sine', rate, t);
    const lg = this.gain(0);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(0, t + delay);
    lg.gain.linearRampToValueAtTime(f * depth, t + delay + 0.6);
    l.connect(lg).connect(target);
    nodes.push(l, lg);
    srcs.push(l);
    void stopAt;
  }

  // --- Karplus-Strong ---------------------------------------------------------------------

  private ksBuffer(kind: 'harp' | 'pluck' | 'harpsi', midi: number): KsEntry {
    const key = kind + midi;
    const hit = this.ks.get(key);
    if (hit) {
      // most recently used last (a Map keeps insertion order)
      this.ks.delete(key);
      this.ks.set(key, hit);
      return hit;
    }
    // a bounded cache: the least recently used string is forgotten (at most about 14 MB)
    if (this.ks.size >= 32) this.ks.delete(this.ks.keys().next().value as string);
    const sr = this.ctx.sampleRate;
    const f = mtof(midi);
    const P = kind === 'harp' ? { t60: 4.2 - (midi - 48) * 0.05, bright: 0.45, pos: 0.21, s: 0.5, dur: 3.2 }
      : kind === 'pluck' ? { t60: 2.6 - (midi - 48) * 0.03, bright: 0.62, pos: 0.13, s: 0.45, dur: 2.6 }
      : { t60: 3.0 - (midi - 48) * 0.035, bright: 0.92, pos: 0.07, s: 0.25, dur: 2.8 };
    const t60 = Math.max(0.6, P.t60);
    // the loop delay is N + s samples (the loss filter adds s); playbackRate corrects the rest
    const N = Math.max(4, Math.floor(sr / f - P.s));
    const f0 = sr / (N + P.s);
    // long enough for the string to fall about 40 dB; short high notes keep memory low
    const len = Math.floor(Math.min(P.dur, 0.4 + t60 * 0.7) * sr);
    const buf = this.ctx.createBuffer(1, len, sr);
    const y = buf.getChannelData(0);
    const r = rng(midi * 131 + kind.length);
    const exc = new Float32Array(N);
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) { lp += P.bright * ((r() * 2 - 1) - lp); exc[i] = lp; mean += lp; }
    mean /= N;
    const pp = Math.max(1, Math.round(P.pos * N));
    for (let i = 0; i < N; i++) y[i] = (exc[i] - mean) - (i >= pp ? exc[i - pp] - mean : 0);
    const rho = Math.pow(0.001, 1 / (f0 * t60));
    for (let n = N; n < len; n++) y[n] = rho * ((1 - P.s) * y[n - N] + P.s * y[n - N - 1 >= 0 ? n - N - 1 : 0]);
    // DC block, fade the tail, normalize
    let px = 0;
    let py = 0;
    let peak = 1e-9;
    for (let n = 0; n < len; n++) {
      const x = y[n];
      py = x - px + 0.995 * py;
      px = x;
      y[n] = py;
      if (Math.abs(py) > peak) peak = Math.abs(py);
    }
    const fade = Math.floor(0.08 * sr);
    for (let n = 0; n < len; n++) {
      let k = 0.9 / peak;
      if (n > len - fade) k *= (len - n) / fade;
      if (n < 16) k *= n / 16;
      y[n] *= k;
    }
    const e = { buf, f0 };
    this.ks.set(key, e);
    return e;
  }

  /** How many voices will be sounding at time `t` (on the context clock). */
  voicesAt(t: number): number {
    if (this.ends.length > 48) this.ends = this.ends.filter((e) => e > t);
    let n = 0;
    for (const e of this.ends) if (e > t) n++;
    return n;
  }

  /** Render the waveguides a piece will need ahead of time (a few ms, once per pitch). */
  prepare(kind: Inst, midi: number): boolean {
    if (kind !== 'harp' && kind !== 'pluck' && kind !== 'harpsi') return false;
    if (this.ks.has(kind + midi)) return false;
    this.ksBuffer(kind, midi);
    return true;
  }

  // --- the instruments ------------------------------------------------------------------

  /** Play one note. `t` and `dur` in seconds on the context's clock; `x` is a per-instrument colour. */
  play(inst: Inst, midi: number, vel: number, t: number, dur: number, out: AudioNode, x = 0): void {
    const f = mtof(midi);
    const v = Math.max(0, Math.min(1.2, vel));
    switch (inst) {
      case 'flute': return this.flute(f, v, t, dur, out, x);
      case 'harp': case 'pluck': case 'harpsi': return this.plucked(inst, midi, f, v, t, dur, out);
      case 'drone': return this.drone(f, v, t, dur, out);
      case 'bowed': case 'cello': return this.bowed(f, v, t, dur, out, inst === 'cello', x);
      case 'strings': return this.strings(f, v, t, dur, out, x);
      case 'choir': return this.choir(f, v, t, dur, out, x);
      case 'pad': return this.pad(f, v, t, dur, out);
      case 'glass': return this.glass(f, v, t, dur, out);
      case 'bell': return this.fm(f, v, t, dur, out, 3.5, 2.6, 1.4, 0.15);
      case 'vibes': return this.fm(f, v, t, dur, out, 4, 1.4, 0.9, 0.2);
      case 'epiano': return this.epiano(f, v, t, dur, out);
      case 'piano': return this.piano(midi, f, v, t, dur, out);
      case 'horn': return this.horn(f, v, t, dur, out);
      case 'bass': return this.bass(f, v, t, dur, out);
      case 'sub': return this.sub(f, v, t, dur, out);
      case 'arp': return this.arp(f, v, t, dur, out);
      case 'lead': return this.lead(f, v, t, dur, out);
      case 'frame': return this.frame(f, v, t, out);
      case 'tek': return this.tek(v, t, out);
      case 'timp': return this.timp(f, v, t, dur, out);
      case 'taiko': return this.taiko(v, t, out);
      case 'shaker': return this.shaker(v, t, out);
    }
  }

  private flute(f: number, v: number, t: number, d: number, out: AudioNode, breath: number): void {
    const b = breath || 1;
    const o = this.osc(this.wave('flute', [1, 0.32, 0.1, 0.035, 0.012]), f, t);
    o.frequency.setValueAtTime(f * 0.988, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const lp = this.filter('lowpass', 2600 + v * 2400);
    const g = this.gain();
    const end = this.asr(g.gain, t, 0.07, v * 0.3, d, 0.22);
    o.connect(lp).connect(g).connect(out);
    const n = this.noiseSrc(t);
    const bp = this.filter('bandpass', Math.min(9000, f * 2.2), 1.1);
    const ng = this.gain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(v * 0.05 * b, t + 0.025);
    ng.gain.setTargetAtTime(v * 0.014 * b, t + 0.03, 0.08);
    ng.gain.setValueAtTime(v * 0.014 * b, t + Math.max(0.1, d));
    ng.gain.setTargetAtTime(0, t + Math.max(0.1, d), 0.05);
    n.connect(bp).connect(ng).connect(out);
    const nodes: AudioNode[] = [o, lp, g, n, bp, ng];
    const srcs: AudioScheduledSourceNode[] = [o, n];
    if (d > 0.45) this.vibrato(o.frequency, f, t, 5.1, 0.0055, 0.3, end, nodes, srcs);
    this.finish(nodes, srcs, end);
  }

  private plucked(kind: 'harp' | 'pluck' | 'harpsi', midi: number, f: number, v: number, t: number, d: number, out: AudioNode): void {
    const e = this.ksBuffer(kind, midi);
    const s = this.ctx.createBufferSource();
    s.buffer = e.buf;
    s.playbackRate.value = f / e.f0;
    const g = this.gain();
    const ring = kind === 'harpsi' ? Math.max(d, 0.25) + 0.15 : Math.max(d * 1.6, 1.4);
    const bufEnd = t + e.buf.duration / (f / e.f0);
    g.gain.setValueAtTime(v * (kind === 'harpsi' ? 0.16 : 0.24), t);
    let end = bufEnd;
    if (t + ring < bufEnd - 0.4) {
      g.gain.setValueAtTime(v * (kind === 'harpsi' ? 0.16 : 0.24), t + ring);
      g.gain.setTargetAtTime(0, t + ring, kind === 'harpsi' ? 0.05 : 0.18);
      end = t + ring + (kind === 'harpsi' ? 0.35 : 1.3);
    }
    const lp = this.filter('lowpass', kind === 'harp' ? 3600 : kind === 'pluck' ? 4200 : 7000);
    s.connect(lp).connect(g).connect(out);
    s.start(t);
    this.finish([s, lp, g], [s], Math.min(end, bufEnd));
  }

  private drone(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const a = this.osc('sawtooth', f, t);
    const b = this.osc('sawtooth', f * 1.0018, t);
    const bg = this.gain(0.45);
    const c = this.osc('triangle', f * 2, t);
    const cg = this.gain(0.3);
    const lp = this.filter('lowpass', 380 + v * 420, 1.2);
    const l = this.osc('sine', 0.07, t);
    const lg = this.gain(140);
    l.connect(lg).connect(lp.frequency);
    const g = this.gain();
    const att = Math.min(3, Math.max(0.6, d / 3));
    const end = this.asr(g.gain, t, att, v * 0.11, d, 3);
    a.connect(lp); b.connect(bg).connect(lp); c.connect(cg).connect(lp);
    lp.connect(g).connect(out);
    this.finish([a, b, bg, c, cg, lp, l, lg, g], [a, b, c, l], end);
  }

  private bowed(f: number, v: number, t: number, d: number, out: AudioNode, cello: boolean, short: number): void {
    const o = this.osc('sawtooth', f, t);
    const lp = this.filter('lowpass', Math.min(7000, f * (cello ? 5 : 6) + v * 1600), 0.6);
    const body = this.filter('peaking', cello ? 260 : 520, 1.4);
    body.gain.value = 5;
    const g = this.gain();
    const att = short ? 0.025 : cello ? 0.16 : 0.12;
    const end = this.asr(g.gain, t, att, v * (cello ? 0.15 : 0.12), d, short ? 0.08 : 0.3);
    o.connect(lp).connect(body).connect(g).connect(out);
    const nodes: AudioNode[] = [o, lp, body, g];
    const srcs: AudioScheduledSourceNode[] = [o];
    if (d > 0.5 && !short) this.vibrato(o.frequency, f, t, cello ? 5.2 : 5.6, 0.0045, 0.22, end, nodes, srcs);
    this.finish(nodes, srcs, end);
  }

  private strings(f: number, v: number, t: number, d: number, out: AudioNode, short: number): void {
    const lp = this.filter('lowpass', Math.min(6000, 1300 + v * 1700 + f * 0.8), 0.5);
    const hp = this.filter('highpass', 90);
    const g = this.gain();
    const nodes: AudioNode[] = [lp, hp, g];
    const srcs: AudioScheduledSourceNode[] = [];
    for (const c of [-9, 0, 8]) {
      const o = this.osc('sawtooth', f * Math.pow(2, c / 1200), t);
      o.connect(lp);
      nodes.push(o);
      srcs.push(o);
    }
    const end = this.asr(g.gain, t, short ? 0.05 : 0.55, v * 0.05, d, short ? 0.12 : 0.9);
    lp.connect(hp).connect(g).connect(out);
    this.finish(nodes, srcs, end);
  }

  private choir(f: number, v: number, t: number, d: number, out: AudioNode, vowel: number): void {
    const F = vowel === 2 ? [320, 800, 2300] : vowel === 1 ? [520, 860, 2450] : [700, 1100, 2550];
    const a = this.osc('sawtooth', f, t);
    const b = this.osc('sawtooth', f * 1.0045, t);
    const mix = this.gain(1);
    a.connect(mix); b.connect(mix);
    const g = this.gain();
    const nodes: AudioNode[] = [a, b, mix, g];
    const srcs: AudioScheduledSourceNode[] = [a, b];
    F.forEach((ff, i) => {
      const bp = this.filter('bandpass', ff, [6, 9, 14][i]);
      const fg = this.gain([1, 0.55, 0.3][i]);
      mix.connect(bp).connect(fg).connect(g);
      nodes.push(bp, fg);
    });
    const end = this.asr(g.gain, t, 0.38, v * 0.55, d, 0.7);
    g.connect(out);
    if (d > 0.6) {
      this.vibrato(a.frequency, f, t, 4.8, 0.004, 0.35, end, nodes, srcs);
    }
    this.finish(nodes, srcs, end);
  }

  private pad(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const lp = this.filter('lowpass', 700 + v * 900, 0.9);
    const l = this.osc('sine', 0.13, t);
    const lg = this.gain(180);
    l.connect(lg).connect(lp.frequency);
    const g = this.gain();
    const nodes: AudioNode[] = [lp, l, lg, g];
    const srcs: AudioScheduledSourceNode[] = [l];
    for (const [type, mul, c, k] of [['sawtooth', 1, -7, 1], ['sawtooth', 1, 7, 1], ['triangle', 0.5, 0, 0.8]] as const) {
      const o = this.osc(type, f * mul * Math.pow(2, c / 1200), t);
      const og = this.gain(k);
      o.connect(og).connect(lp);
      nodes.push(o, og);
      srcs.push(o);
    }
    const end = this.asr(g.gain, t, 0.9, v * 0.05, d, 1.5);
    lp.connect(g).connect(out);
    this.finish(nodes, srcs, end);
  }

  private glass(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const lp = this.filter('lowpass', 4200);
    const g = this.gain();
    const nodes: AudioNode[] = [lp, g];
    const srcs: AudioScheduledSourceNode[] = [];
    for (const [type, mul, c, k] of [['triangle', 1, -5, 1], ['triangle', 1, 5, 1], ['sine', 2, 0, 0.32], ['sine', 3, 3, 0.1]] as const) {
      const o = this.osc(type, f * mul * Math.pow(2, c / 1200), t);
      const og = this.gain(k);
      o.connect(og).connect(lp);
      nodes.push(o, og);
      srcs.push(o);
    }
    // a slow shimmer in the level
    const l = this.osc('sine', 0.23 + (f % 7) * 0.02, t);
    const lg = this.gain(0.12);
    const trem = this.gain(1);
    l.connect(lg).connect(trem.gain);
    nodes.push(l, lg, trem);
    srcs.push(l);
    const end = this.asr(g.gain, t, 1.8, v * 0.07, d, 3.2);
    lp.connect(trem).connect(g).connect(out);
    this.finish(nodes, srcs, end);
  }

  /** Two-operator FM: bells (ratio 3.5), mallets (ratio 4). */
  private fm(f: number, v: number, t: number, d: number, out: AudioNode, ratio: number, index: number, tau: number, peak: number): void {
    const c = this.osc('sine', f, t);
    const m = this.osc('sine', f * ratio, t);
    const mg = this.gain();
    mg.gain.setValueAtTime(f * index * (0.5 + v), t);
    mg.gain.setTargetAtTime(f * index * 0.08, t, tau * 0.45);
    m.connect(mg).connect(c.frequency);
    const g = this.gain();
    const end = this.strike(g.gain, t, 0.004, v * peak, tau);
    c.connect(g).connect(out);
    void d;
    this.finish([c, m, mg, g], [c, m], end);
  }

  private epiano(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const c = this.osc('sine', f, t);
    const m = this.osc('sine', f, t);
    const mg = this.gain();
    mg.gain.setValueAtTime(f * (0.6 + 1.6 * v), t);
    mg.gain.setTargetAtTime(f * 0.25, t, 0.35);
    m.connect(mg).connect(c.frequency);
    const g = this.gain();
    const end = this.strike(g.gain, t, 0.004, v * 0.16, 1.6, t + Math.max(d, 0.2), 0.12);
    c.connect(g).connect(out);
    this.finish([c, m, mg, g], [c, m], end);
  }

  private piano(midi: number, f: number, v: number, t: number, d: number, out: AudioNode): void {
    const w = this.wave('piano', [1, 0.55, 0.32, 0.22, 0.14, 0.09, 0.025, 0.05, 0.035, 0.022, 0.014, 0.009]);
    const a = this.osc(w, f, t);
    const b = this.osc(w, f * 1.0012, t);
    const bg = this.gain(0.65);
    const lp = this.filter('lowpass', 1000, 0.5);
    const bright = Math.min(11000, f * (4 + 9 * v));
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.setTargetAtTime(Math.max(f * 2.2, 400), t + 0.01, 0.55);
    const g = this.gain();
    const tau = Math.max(0.5, 2.4 - (midi - 48) * 0.045);
    const end = this.strike(g.gain, t, 0.003, v * 0.15, tau, t + Math.max(d, 0.15), 0.14);
    a.connect(lp); b.connect(bg).connect(lp);
    lp.connect(g).connect(out);
    this.finish([a, b, bg, lp, g], [a, b], end);
  }

  private horn(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const o = this.osc('sawtooth', f, t);
    const lp = this.filter('lowpass', f, 1.1);
    lp.frequency.setValueAtTime(f * 1.1, t);
    lp.frequency.linearRampToValueAtTime(Math.min(6000, f * (2.4 + 3 * v)), t + 0.11);
    lp.frequency.setTargetAtTime(Math.min(5000, f * (1.8 + 1.8 * v)), t + 0.11, 0.35);
    const g = this.gain();
    const end = this.asr(g.gain, t, 0.08, v * 0.17, d, 0.32);
    o.connect(lp).connect(g).connect(out);
    const nodes: AudioNode[] = [o, lp, g];
    const srcs: AudioScheduledSourceNode[] = [o];
    if (d > 0.8) this.vibrato(o.frequency, f, t, 4.9, 0.003, 0.5, end, nodes, srcs);
    this.finish(nodes, srcs, end);
  }

  private bass(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const a = this.osc('triangle', f, t);
    const b = this.osc('sine', f, t);
    const lp = this.filter('lowpass', 520 + v * 300);
    const g = this.gain();
    const end = this.strike(g.gain, t, 0.008, v * 0.17, 0.9, t + Math.max(d, 0.12), 0.07);
    a.connect(lp); b.connect(lp);
    lp.connect(g).connect(out);
    this.finish([a, b, lp, g], [a, b], end);
  }

  private sub(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const o = this.osc('sine', f, t);
    const g = this.gain();
    const end = this.asr(g.gain, t, 0.06, v * 0.24, d, 0.35);
    o.connect(g).connect(out);
    this.finish([o, g], [o], end);
  }

  private arp(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const o = this.osc('triangle', f, t);
    const lp = this.filter('lowpass', f * 4);
    lp.frequency.setValueAtTime(Math.min(9000, f * 5), t);
    lp.frequency.setTargetAtTime(f * 1.6, t, 0.12);
    const g = this.gain();
    const end = this.strike(g.gain, t, 0.004, v * 0.15, 0.32, t + Math.max(d, 0.1) + 0.1, 0.08);
    o.connect(lp).connect(g).connect(out);
    this.finish([o, lp, g], [o], end);
  }

  private lead(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const a = this.osc('sine', f, t);
    const b = this.osc('triangle', f, t);
    const bg = this.gain(0.22);
    const g = this.gain();
    const end = this.asr(g.gain, t, 0.22, v * 0.22, d, 0.6);
    a.connect(g); b.connect(bg).connect(g);
    g.connect(out);
    const nodes: AudioNode[] = [a, b, bg, g];
    const srcs: AudioScheduledSourceNode[] = [a, b];
    if (d > 0.6) {
      this.vibrato(a.frequency, f, t, 4.6, 0.0045, 0.4, end, nodes, srcs);
    }
    this.finish(nodes, srcs, end);
  }

  // --- drums ----------------------------------------------------------------------------

  private frame(f: number, v: number, t: number, out: AudioNode): void {
    const o = this.osc('sine', f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const g = this.gain();
    const end = this.strike(g.gain, t, 0.002, v * 0.55, 0.17);
    o.connect(g).connect(out);
    const n = this.noiseSrc(t);
    const lp = this.filter('lowpass', 900);
    const ng = this.gain();
    this.strike(ng.gain, t, 0.001, v * 0.22, 0.03);
    n.connect(lp).connect(ng).connect(out);
    this.finish([o, g, n, lp, ng], [o, n], end);
  }

  private tek(v: number, t: number, out: AudioNode): void {
    const n = this.noiseSrc(t);
    const bp = this.filter('bandpass', 2900, 1.4);
    const g = this.gain();
    const end = this.strike(g.gain, t, 0.001, v * 0.42, 0.026);
    n.connect(bp).connect(g).connect(out);
    const o = this.osc('sine', 680, t);
    const og = this.gain();
    this.strike(og.gain, t, 0.001, v * 0.1, 0.02);
    o.connect(og).connect(out);
    this.finish([n, bp, g, o, og], [n, o], end);
  }

  private timp(f: number, v: number, t: number, d: number, out: AudioNode): void {
    const nodes: AudioNode[] = [];
    const srcs: AudioScheduledSourceNode[] = [];
    const len = Math.min(1.6, 0.5 + d);
    let end = t;
    ([[1, 1, 1], [1.505, 0.5, 0.68], [1.993, 0.32, 0.5], [2.44, 0.18, 0.34]] as const).forEach(([mul, amp, tk]) => {
      const o = this.osc('sine', f * mul * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.07);
      const g = this.gain();
      end = Math.max(end, this.strike(g.gain, t, 0.003, v * 0.3 * amp, len * tk * 0.6));
      o.connect(g).connect(out);
      nodes.push(o, g);
      srcs.push(o);
    });
    const n = this.noiseSrc(t);
    const lp = this.filter('lowpass', 1400);
    const ng = this.gain();
    this.strike(ng.gain, t, 0.001, v * 0.2, 0.025);
    n.connect(lp).connect(ng).connect(out);
    nodes.push(n, lp, ng);
    srcs.push(n);
    this.finish(nodes, srcs, end);
  }

  private taiko(v: number, t: number, out: AudioNode): void {
    const o = this.osc('sine', 82, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    const g = this.gain();
    const end = this.strike(g.gain, t, 0.003, v * 0.48, 0.28);
    o.connect(g).connect(out);
    const n = this.noiseSrc(t);
    const lp = this.filter('lowpass', 320);
    const ng = this.gain();
    this.strike(ng.gain, t, 0.002, v * 0.5, 0.05);
    n.connect(lp).connect(ng).connect(out);
    this.finish([o, g, n, lp, ng], [o, n], end);
  }

  private shaker(v: number, t: number, out: AudioNode): void {
    const n = this.noiseSrc(t);
    const hp = this.filter('highpass', 6000);
    const g = this.gain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.1, t + 0.012);
    g.gain.setTargetAtTime(0, t + 0.012, 0.03);
    n.connect(hp).connect(g).connect(out);
    this.finish([n, hp, g], [n], t + 0.25);
  }
}
