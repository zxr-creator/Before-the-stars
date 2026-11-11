// The conductor: plays pieces on the audio clock. It keeps one piece sounding (and the
// ones fading out behind it), reads each piece's note list with a look-ahead window, and
// when a piece ends leaves a rest and composes the next one. Era and mood changes
// crossfade; stings duck the score. It runs the same on an AudioContext (driven by a
// timer that calls `tick`) and on an OfflineAudioContext (one `tick` over the whole
// render), so the offline renders are exactly what players hear.
import { buildPiece, type Mood, type NoteEv, type Piece } from './arrange';
import { PERCUSSION, Synth, type Inst } from './instruments';
import { makeImpulse } from './reverb';
import { SCORES, type ScoreKey } from './score';
import { degSemis, parseMelody } from './theory';

export interface Target { key: ScoreKey; mood: Mood }
/** A decoded recording chosen for a piece (see tracks.ts). */
export interface Recording { buf: AudioBuffer; gainDb: number; mix: 'replace' | 'layer'; title: string }
export type StingKind = 'moment' | 'victory' | 'defeat';

interface Playing {
  piece: Piece;
  start: number;
  idx: number;
  /** Next note whose plucked-string waveguide may still need rendering. */
  prep: number;
  bus: GainNode;
  wet: GainNode;
  echo: GainNode;
  parts: Map<Inst, AudioNode>;
  /** No notes are scheduled after this time (set when the piece is fading out). */
  cutoff: number;
  /** When the bus can be disconnected. */
  done: number;
}

/** Layers by intensity 0..1: 0.0 -> 1 layer … 0.8+ -> 4 layers. */
export function layersFor(intensity: number): number {
  return intensity >= 0.8 ? 4 : intensity >= 0.55 ? 3 : intensity >= 0.3 ? 2 : 1;
}

export class Conductor {
  readonly ctx: BaseAudioContext;
  readonly synth: Synth;
  /** Score buses meet here; stings duck it. */
  private scoreDry: GainNode;
  private scoreWet: GainNode;
  private stingBus: GainNode;
  private reverb: ConvolverNode;
  private echoIn: GainNode;
  private current: Playing | null = null;
  private fading: Playing[] = [];
  private target: Target | null = null;
  private nextAt = 0;
  private layers = 4;
  private seed: number;
  /** Pieces composed so far (for the stats and the tests). */
  pieces = 0;
  lastForm = '';
  /** Milliseconds the last piece took to compose. */
  composeMs = 0;
  /** Recordings to use instead of (or under) a composed piece; none ship (tracks.ts). */
  recorded: ((key: ScoreKey, mood: Mood, roll: number) => Recording | null) | null = null;

  /**
   * `offline`: the whole graph is built before an OfflineAudioContext renders, so a bus must
   * never be disconnected while building (that would silence it from time zero).
   */
  constructor(ctx: BaseAudioContext, out: AudioNode, seed = Date.now() >>> 0, private offline = false) {
    this.ctx = ctx;
    this.synth = new Synth(ctx);
    this.seed = seed;
    this.scoreDry = ctx.createGain();
    this.scoreWet = ctx.createGain();
    this.stingBus = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.normalize = false;
    this.reverb.buffer = makeImpulse(ctx, 3.4);
    // a soft echo for the modern and space eras, feeding the hall
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.47;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.echoIn.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(this.reverb);
    damp.connect(this.scoreWet);
    // everything leaves through a gentle high-pass: no DC, no subsonic rumble
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 30;
    hp.Q.value = 0.6;
    hp.connect(out);
    this.scoreDry.connect(hp);
    this.scoreWet.connect(this.reverb);
    this.reverb.connect(hp);
    this.stingBus.connect(hp);
    const stingWet = ctx.createGain();
    stingWet.gain.value = 0.5;
    this.stingBus.connect(stingWet).connect(this.reverb);
  }

  get state(): { key: ScoreKey | null; mood: Mood | null; form: string; layers: number; voices: number; nodes: number } {
    const p = this.current?.piece;
    return { key: p?.key ?? null, mood: p?.mood ?? null, form: p?.form ?? '', layers: this.layers, voices: this.synth.active, nodes: this.synth.created - this.synth.released };
  }

  setIntensity(x: number): void {
    this.layers = layersFor(x);
  }

  /** Change what plays. `null` fades the score out. */
  setTarget(next: Target | null, now: number): void {
    const same = (a: Target | null, b: Target | null) => (a && b ? a.key === b.key && a.mood === b.mood : a === b);
    if (same(next, this.target)) return;
    const prev = this.target;
    this.target = next;
    const eraChange = !prev || !next || prev.key !== next.key;
    const fade = eraChange ? 5 : 3;
    if (this.current) {
      this.retire(this.current, now, fade);
      this.current = null;
    }
    // the next piece enters as the old one leaves (its intro is quiet by design)
    this.nextAt = next ? now + (prev ? Math.min(1.5, fade * 0.3) : 0.05) : Infinity;
  }

  private retire(p: Playing, now: number, fade: number): void {
    p.bus.gain.cancelScheduledValues(now);
    p.bus.gain.setValueAtTime(p.bus.gain.value, now);
    p.bus.gain.setTargetAtTime(0, now, fade / 4);
    p.cutoff = Math.min(p.cutoff, now + fade * 0.6);
    p.done = Math.min(p.done, now + fade * 1.8 + 4);
    this.fading.push(p);
  }

  /** Play a given piece at `at` (offline renders of single statements). */
  playPiece(piece: Piece, at: number): void {
    this.target = { key: piece.key, mood: piece.mood };
    this.current = this.attach(piece, at, null);
    this.nextAt = Infinity;
  }

  private begin(t: Target, at: number): Playing {
    const seed = (this.seed + this.pieces * 7919) >>> 0;
    const c0 = performance.now();
    let piece = buildPiece(t.key, t.mood, seed);
    this.composeMs = performance.now() - c0;
    this.pieces++;
    const rec = this.recorded?.(t.key, t.mood, ((seed * 2654435761) >>> 0) / 4294967296) ?? null;
    if (rec?.mix === 'replace') piece = { ...piece, events: [], durSec: rec.buf.duration, form: 'recording: ' + rec.title };
    return this.attach(piece, at, rec);
  }

  private attach(piece: Piece, at: number, rec: Recording | null): Playing {
    this.lastForm = piece.form;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0, at);
    bus.gain.linearRampToValueAtTime(piece.gain, at + 1.2);
    const wet = this.ctx.createGain();
    wet.gain.value = piece.reverb;
    const echo = this.ctx.createGain();
    echo.gain.value = piece.echo;
    bus.connect(this.scoreDry);
    bus.connect(wet).connect(this.scoreWet);
    bus.connect(echo).connect(this.echoIn);
    if (rec) {
      const src = this.ctx.createBufferSource();
      src.buffer = rec.buf;
      const g = this.ctx.createGain();
      g.gain.value = Math.pow(10, rec.gainDb / 20);
      src.connect(g).connect(bus);
      src.start(at);
      src.onended = () => { src.disconnect(); g.disconnect(); };
    }
    return { piece, start: at, idx: 0, prep: 0, bus, wet, echo, parts: new Map(), cutoff: Infinity, done: at + piece.durSec + 8 };
  }

  private part(pl: Playing, inst: Inst): AudioNode {
    let n = pl.parts.get(inst);
    if (!n) {
      const g = this.ctx.createGain();
      g.gain.value = PERCUSSION.has(inst) ? 0.9 : 1;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = pl.piece.pan[inst] ?? 0;
      g.connect(pan).connect(pl.bus);
      pl.parts.set(inst, g);
      n = g;
    }
    return n;
  }

  private schedule(pl: Playing, until: number): void {
    const ev = pl.piece.events;
    const { sec } = pl.piece;
    while (pl.idx < ev.length) {
      const e: NoteEv = ev[pl.idx];
      const at = pl.start + sec(e.t);
      if (at >= until) break;
      pl.idx++;
      if (at >= pl.cutoff) { pl.idx = ev.length; break; }
      if (e.L >= this.layers) continue;
      // keep the audio thread light: drop ornamental layers first when many voices sound
      const busy = this.synth.voicesAt(at);
      if (busy > 72 || (busy > 48 && e.L > 0)) continue;
      const dur = sec(e.t + e.d) - sec(e.t);
      this.synth.play(e.i, e.p, e.v, Math.max(at, this.ctx.currentTime), dur, this.part(pl, e.i), e.x);
    }
  }

  /** Render the waveguides of the coming seconds a few at a time, so no tick is long. */
  private prepareAhead(pl: Playing, until: number, budget: number): void {
    const ev = pl.piece.events;
    let built = 0;
    while (pl.prep < ev.length && built < budget) {
      const e = ev[pl.prep];
      if (pl.start + pl.piece.sec(e.t) >= until) break;
      if (this.synth.prepare(e.i, e.p)) built++;
      pl.prep++;
    }
  }

  /** Schedule everything that starts before `until` (seconds on the context clock). */
  tick(now: number, until: number): void {
    if (this.target && !this.current && until >= this.nextAt) {
      this.current = this.begin(this.target, Math.max(this.nextAt, now));
    }
    const cur = this.current;
    if (cur) {
      this.prepareAhead(cur, until + 6, 2);
      this.schedule(cur, until);
      if (cur.idx >= cur.piece.events.length && this.target) {
        const end = cur.start + cur.piece.durSec;
        // the next piece after a breath of silence
        if (until >= end + cur.piece.rest - 0.5) {
          this.fading.push(cur);
          this.current = null;
          this.nextAt = end + cur.piece.rest;
          if (until >= this.nextAt) this.current = this.begin(this.target, this.nextAt);
        }
      }
    }
    for (const f of this.fading) this.schedule(f, until);
    this.fading = this.fading.filter((f) => {
      if (now < f.done || this.offline) return true;
      f.bus.disconnect();
      f.wet.disconnect();
      f.echo.disconnect();
      for (const n of f.parts.values()) n.disconnect();
      return false;
    });
  }

  /** A short cue built from the leitmotif in the current key; the score ducks under it. */
  sting(kind: StingKind, at: number, level = 1): number {
    const piece = this.current?.piece;
    const key = piece?.key ?? this.target?.key ?? 'title';
    const sc = SCORES[key];
    // in the key and mode of what is playing, so the cue sits inside the music
    const home = piece?.tonic ?? sc.tonic;
    const tonic = home > 66 ? home - 12 : home;
    const playing = piece?.mood === 'war' ? sc.warMode : sc.mode;
    const mode = kind === 'defeat' ? 'aeolian' : kind === 'victory' ? 'ionian' : playing;
    const spb = kind === 'defeat' ? 0.95 : 0.62;
    const out = this.stingBus;
    const play = (inst: Inst, deg: number, beat: number, beats: number, v: number, oct = 0) =>
      this.synth.play(inst, tonic + degSemis(mode, deg) + oct * 12, v * level, at + beat * spb, beats * spb, out);
    let len: number;
    if (kind === 'moment') {
      // the leitmotif's head rising to the octave, over a swelling chord
      [[0, 0], [4, 0.5], [3, 1], [4, 1.5], [7, 2]].forEach(([d, b], k) => play('harp', d, b, 2.5, 0.55 + k * 0.04));
      [0, 2, 4].forEach((d) => play('strings', d, 0, 5, 0.42, -1));
      play('bell', 7, 2, 4, 0.32);
      play('bell', 11, 2.5, 4, 0.22);
      len = 6 * spb;
    } else if (kind === 'victory') {
      // the main theme's opening in major, broadly, to a full cadence: IV - V - I
      const mel = parseMelody("1:2 5:2 | 4 3 4 5 | 1':4", 4).flat();
      mel.forEach((n) => play('horn', n.deg, n.t, n.d, 0.7));
      mel.forEach((n) => play('strings', n.deg, n.t, n.d, 0.4, 1));
      [[3, 0, 4], [4, 4, 4], [0, 8, 6]].forEach(([root, b, d]) => [0, 2, 4].forEach((s) => play('strings', root + s, b, d, 0.42, -1)));
      [0, 2, 4, 6].forEach((b) => play('timp', 0, b + 4, 1, 0.3 + b * 0.04, -2));
      play('timp', 0, 8, 2, 0.55, -2);
      [0, 2, 4, 7].forEach((d, k) => play('bell', d, 8 + k * 0.5, 4, 0.3, 1));
      len = 14 * spb;
    } else {
      // the theme in minor, slow, falling to the tonic and fading on a low drone
      const mel = parseMelody('1:2 5:2 | 4 3 2 1:1 | 1:4', 4).flat();
      mel.forEach((n) => play('bowed', n.deg, n.t, n.d, 0.6));
      play('drone', 0, 0, 12, 0.6, -2);
      [[0, 0], [5, 4], [0, 8]].forEach(([root, b]) => [0, 2, 4].forEach((s) => play('strings', root + s, b, 4, 0.36, -1)));
      play('timp', 0, 0, 2, 0.35, -2);
      len = 13 * spb;
    }
    // duck the score under the cue and bring it back after
    for (const g of [this.scoreDry.gain, this.scoreWet.gain]) {
      g.cancelScheduledValues(at);
      g.setValueAtTime(g.value, at);
      // a quieter cue (observer fast playback) barely dips the score
      const dip = kind === 'moment' ? 0.4 : 0.15;
      g.setTargetAtTime(dip + (1 - dip) * (1 - Math.min(1, level)) * 0.8, at, 0.12);
      g.setTargetAtTime(1, at + len, 1.2);
    }
    return len;
  }

  /** Disconnect everything (the engine is being closed). */
  dispose(): void {
    for (const p of [this.current, ...this.fading]) {
      if (!p) continue;
      p.bus.disconnect();
      for (const n of p.parts.values()) n.disconnect();
    }
    this.current = null;
    this.fading = [];
  }
}
