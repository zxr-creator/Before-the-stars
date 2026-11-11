// The music engine for the live game (loaded lazily after the first click or key press).
//
//   recordings ── rec level ─┐
//   conductor (score + stings) ┴─ music volume ─┐
//   interface sounds ────────────── effects vol ─┼─ glue compressor ─ master ─ speakers
//
// What plays as music follows the player's choice (settings `musicSource`):
//   recorded   public-domain recordings for the era and mood (recordings.ts); the composed
//              score fills in where none fits, while a slow file loads, when one fails,
//              and between two plays of the only recording that fits (the title)
//   generated  the composed score only
//   both       a recording, then a composed piece, in turn
// Stings and interface sounds always come from the synthesizer; stings duck the
// recordings as they duck the score.
//
// A look-ahead clock: a coarse timer wakes every 100 ms and schedules, on the audio
// thread's own timeline, every note that starts in the next 0.6 s. Timer jitter and
// main-thread stalls up to half a second therefore never move a note. When the game is
// muted or the page is hidden the master fades out and the context is suspended (no
// audio-thread work at all); it resumes where it left off.
import { Conductor, type StingKind } from './conductor';
import type { Mood } from './arrange';
import type { ScoreKey } from './score';
import { playSfx, type SfxKind } from './sfx';
import { RecordPlayer } from './recordings';
import type { RecordedTrack } from './tracks';

export interface EngineTarget { key: ScoreKey; mood: Mood; intensity: number }
export interface Volumes { master: number; music: number; effects: number; muted: boolean }
export type MusicSource = 'recorded' | 'generated' | 'both';
export type { StingKind, SfxKind, RecordedTrack };

const TICK_MS = 100;
const LOOKAHEAD = 0.6;
/** Overall level of the mix at full volume, calibrated from the offline renders. */
export const MIX_LEVEL = 0.8;
/**
 * Level of the recordings (each normalised to -18 LUFS integrated) against the composed
 * score in the same chain; see REC_TRIM_DB in tracks/CREDITS.md for how it was measured.
 */
const REC_TRIM_DB = 0;
/** If a recording has not started this long after it was asked for, the score bridges the wait. */
const BRIDGE_MS = 3000;
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
  private rec: RecordPlayer;
  private source: MusicSource = 'recorded';
  /** In "both" (and between plays of a lone recording): whose turn it is. */
  private turn: 'rec' | 'gen' = 'rec';
  private bridgeTimer: ReturnType<typeof setTimeout> | null = null;
  /** What the composed score has been asked to play (null: silent or fading out). */
  private scoreTarget: { key: ScoreKey; mood: Mood } | null = null;
  /** The recording now playing, or null (the composed score, or silence). */
  onNowPlaying: ((t: RecordedTrack | null) => void) | null = null;

  constructor(ctx: AudioContext, pool: HTMLAudioElement[] = []) {
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
    const recLevel = ctx.createGain();
    recLevel.gain.value = Math.pow(10, REC_TRIM_DB / 20);
    recLevel.connect(this.conductor.input);
    this.rec = new RecordPlayer(ctx, recLevel, pool);
    this.rec.onTrack = (t) => {
      if (t) {
        // the recording has begun: the score (bridging the wait, or the piece before) gives way
        this.clearBridge();
        if (this.scoreTarget) this.setScore(null);
      }
      this.onNowPlaying?.(t);
    };
    this.rec.onEnding = () => this.recordingEnding();
    this.rec.onUnavailable = () => this.route(3);
    this.conductor.onPieceEnd = () => this.pieceEnded();
    this.applyVolumes(0.05);
    this.start();
  }

  // --- recordings or the composed score ------------------------------------------------------

  private setScore(t: { key: ScoreKey; mood: Mood } | null): void {
    this.scoreTarget = t;
    this.conductor.setTarget(t, this.ctx.currentTime);
  }

  private clearBridge(): void {
    if (this.bridgeTimer) clearTimeout(this.bridgeTimer);
    this.bridgeTimer = null;
  }

  private wantsRecording(): boolean {
    const t = this.target;
    if (!t || this.source === 'generated') return false;
    if (this.source === 'both' && this.turn === 'gen') return false;
    return this.rec.has(t.key, t.mood);
  }

  /** Decide what plays for the current target; `fade` is how long what leaves takes. */
  private route(fade: number): void {
    const t = this.target;
    this.clearBridge();
    if (!t) {
      this.rec.stop(fade);
      this.setScore(null);
      return;
    }
    if (!this.wantsRecording()) {
      if (this.source !== 'both') this.turn = 'rec';
      this.rec.stop(fade);
      this.setScore({ key: t.key, mood: t.mood });
      return;
    }
    this.turn = 'rec';
    const stale = !!this.scoreTarget && (this.scoreTarget.key !== t.key || this.scoreTarget.mood !== t.mood);
    this.rec.start(t.key, t.mood, fade);
    // nothing playable after all: onUnavailable has already handed over to the score
    if (!this.rec.busy) return;
    if (stale) this.setScore(null);
    // a slow file: the composed score bridges the wait and gives way when the recording begins
    this.bridgeTimer = setTimeout(() => {
      this.bridgeTimer = null;
      const cur = this.target;
      if (cur && this.rec.busy && this.rec.stats().playing === null && !this.scoreTarget) this.setScore({ key: cur.key, mood: cur.mood });
    }, BRIDGE_MS);
  }

  /** A recording is about to end: the next recording, or a composed piece in between. */
  private recordingEnding(): void {
    const t = this.target;
    if (!t) return;
    if (this.source === 'recorded' && this.rec.has(t.key, t.mood, this.rec.current?.id ?? null)) {
      this.rec.start(t.key, t.mood, 6);
      return;
    }
    // "both", or the only recording that fits has just played: a composed piece takes a turn
    this.turn = 'gen';
    this.rec.stop(6);
    this.setScore({ key: t.key, mood: t.mood });
  }

  /** A composed piece has ended (conductor hook): false when a recording follows instead. */
  private pieceEnded(): boolean {
    const t = this.target;
    if (!t || this.source === 'generated' || this.turn !== 'gen' || !this.rec.has(t.key, t.mood)) return true;
    this.turn = 'rec';
    this.scoreTarget = null;
    this.conductor.setTarget(null, this.ctx.currentTime);
    this.rec.start(t.key, t.mood, 2);
    return false;
  }

  setSource(source: MusicSource): void {
    if (source === this.source) return;
    this.source = source;
    this.turn = 'rec';
    if (this.target) this.route(3);
  }

  /** A click or key press: recordings the browser refused to start may start now. */
  gesture(): void {
    if (this.rec.unblock() && this.source !== 'generated' && this.target) this.route(3);
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
    this.rec.tick();
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
        if (this.silent() && this.ctx.state === 'running') { this.stop(); this.rec.pause(); void this.ctx.suspend().catch(() => {}); }
      }, fade * 1000 + 400);
    } else {
      this.resume();
    }
  }

  /** Resume a suspended context (allowed once the page has had a user gesture). */
  resume(): void {
    if (this.silent()) return;
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().then(() => { this.start(); this.rec.resume(); this.applyVolumesQuiet(); }).catch(() => {});
    } else { this.start(); this.rec.resume(); }
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
    const prev = this.target;
    this.target = t;
    if (t) this.conductor.setIntensity(t.intensity);
    if (prev && t && prev.key === t.key && prev.mood === t.mood) return;
    // an era change crossfades over 5 s, a change of mood over 3 s, as the score does
    this.route(!prev || !t || prev.key !== t.key ? 5 : 3);
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
      source: this.source,
      turn: this.turn,
      scoreTarget: this.scoreTarget,
      /** Level of the score and the recordings under a sting (1 = not ducked). */
      duck: this.conductor.duck,
      rec: this.rec.stats(),
    };
  }
}

export function createEngine(ctx: AudioContext, pool: HTMLAudioElement[] = []): MusicEngine {
  return new MusicEngine(ctx, pool);
}
