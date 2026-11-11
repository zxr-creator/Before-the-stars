// The music engine for the live game (loaded lazily after the first click or key press).
//
//   conductor (score + stings) ─ music volume ─┐
//   interface sounds ──────────── effects vol ─┼─ glue compressor ─ master ─ speakers
//
// A look-ahead clock: a coarse timer wakes every 100 ms and schedules, on the audio
// thread's own timeline, every note that starts in the next 0.6 s. Timer jitter and
// main-thread stalls up to half a second therefore never move a note. When the game is
// muted or the page is hidden the master fades out and the context is suspended (no
// audio-thread work at all); it resumes where it left off.
import { Conductor, type Recording, type StingKind } from './conductor';
import type { Mood } from './arrange';
import type { ScoreKey } from './score';
import { playSfx, type SfxKind } from './sfx';
import { pickRecording, RECORDED_TRACKS } from './tracks';

export interface EngineTarget { key: ScoreKey; mood: Mood; intensity: number }
export interface Volumes { master: number; music: number; effects: number; muted: boolean }
export type { StingKind, SfxKind };

const TICK_MS = 100;
const LOOKAHEAD = 0.6;
/** Overall level of the mix at full volume, calibrated from the offline renders. */
export const MIX_LEVEL = 0.8;
const curve = (v: number) => Math.max(0, Math.min(1, v)) ** 2;

export class MusicEngine {
  readonly ctx: AudioContext;
  private conductor: Conductor;
  private musicVol: GainNode;
  private sfxVol: GainNode;
  private master: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private vols: Volumes = { master: 0.8, music: 0.7, effects: 0.6, muted: false };
  private hidden = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSfx = new Map<SfxKind, number>();
  private target: EngineTarget | null = null;
  // main-thread cost of scheduling, over a sliding window
  private busyMs = 0;
  private windowStart = performance.now();
  private lastRate = 0;
  private ticks = 0;
  private maxTickMs = 0;
  private decoded = new Map<string, AudioBuffer>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.02;
    comp.release.value = 0.35;
    this.musicVol = ctx.createGain();
    this.sfxVol = ctx.createGain();
    this.musicVol.connect(comp);
    this.sfxVol.connect(comp);
    comp.connect(this.master).connect(ctx.destination);
    this.conductor = new Conductor(ctx, this.musicVol);
    if (RECORDED_TRACKS.length) this.loadRecordings();
    this.applyVolumes(0.05);
    this.start();
  }

  private loadRecordings(): void {
    for (const tr of RECORDED_TRACKS) {
      fetch(tr.url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => this.decoded.set(tr.url, buf)).catch(() => { /* the composed score plays instead */ });
    }
    this.conductor.recorded = (key, mood, roll): Recording | null => {
      const tr = pickRecording(key, mood, roll);
      const buf = tr ? this.decoded.get(tr.url) : undefined;
      return tr && buf ? { buf, gainDb: tr.gainDb, mix: tr.mix, title: tr.title } : null;
    };
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.ctx.state !== 'running') return;
    const t0 = performance.now();
    const now = this.ctx.currentTime;
    this.conductor.tick(now, now + LOOKAHEAD);
    const t1 = performance.now();
    const dt = t1 - t0;
    this.busyMs += dt;
    this.ticks++;
    if (dt > this.maxTickMs) this.maxTickMs = dt;
    if (t1 - this.windowStart >= 10000) {
      this.lastRate = (this.busyMs / (t1 - this.windowStart)) * 1000;
      this.busyMs = 0;
      this.windowStart = t1;
    }
  }

  private silent(): boolean {
    return this.vols.muted || this.hidden;
  }

  private applyVolumes(fade = 0.25): void {
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.setTargetAtTime(v, now, fade / 3); };
    set(this.musicVol.gain, curve(this.vols.music) * MIX_LEVEL);
    set(this.sfxVol.gain, curve(this.vols.effects) * MIX_LEVEL);
    set(this.master.gain, this.silent() ? 0 : curve(this.vols.master));
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null; }
    if (this.silent()) {
      // after the fade, stop the audio thread entirely
      this.suspendTimer = setTimeout(() => {
        if (this.silent() && this.ctx.state === 'running') { this.stop(); void this.ctx.suspend().catch(() => {}); }
      }, fade * 1000 + 400);
    } else {
      this.resume();
    }
  }

  /** Resume a suspended context (allowed once the page has had a user gesture). */
  resume(): void {
    if (this.silent()) return;
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().then(() => { this.start(); this.applyVolumesQuiet(); }).catch(() => {});
    } else this.start();
  }

  private applyVolumesQuiet(): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.setTargetAtTime(this.silent() ? 0 : curve(this.vols.master), now, 0.1);
  }

  setVolumes(v: Volumes): void {
    this.vols = { ...v };
    this.applyVolumes();
  }

  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.applyVolumes(hidden ? 0.4 : 0.8);
  }

  setTarget(t: EngineTarget | null): void {
    this.target = t;
    const now = this.ctx.currentTime;
    if (t) this.conductor.setIntensity(t.intensity);
    this.conductor.setTarget(t ? { key: t.key, mood: t.mood } : null, now);
  }

  /** `level` scales the cue (1 = full); observer fast playback uses a softer one. */
  sting(kind: StingKind, level = 1): void {
    if (this.ctx.state !== 'running') return;
    this.conductor.sting(kind, this.ctx.currentTime + 0.05, level);
  }

  sfx(kind: SfxKind): void {
    if (this.ctx.state !== 'running' || this.vols.effects <= 0) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastSfx.get(kind) ?? -1) < 0.25) return;
    this.lastSfx.set(kind, now);
    playSfx(this.conductor.synth, kind, now + 0.01, this.sfxVol);
  }

  stats() {
    const st = this.conductor.state;
    const el = performance.now() - this.windowStart;
    return {
      ctx: this.ctx.state,
      key: st.key, mood: st.mood, form: st.form, layers: st.layers,
      voices: st.voices, liveNodes: st.nodes, pieces: this.conductor.pieces,
      target: this.target,
      /** Main-thread milliseconds per second spent scheduling (last full 10 s window, else so far). */
      schedMsPerSec: this.lastRate || (el > 500 ? (this.busyMs / el) * 1000 : 0),
      maxTickMs: this.maxTickMs,
      composeMs: this.conductor.composeMs,
      ticks: this.ticks,
      master: this.master.gain.value,
      music: this.musicVol.gain.value,
      hidden: this.hidden,
    };
  }
}

export function createEngine(ctx: AudioContext): MusicEngine {
  return new MusicEngine(ctx);
}
