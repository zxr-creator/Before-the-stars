// The arranger: turns the written score into a piece — a form (intro, statements of the
// main theme and the era themes, a coda on the leitmotif), and for each bar the parts of
// that era's ensemble. Every note carries a layer (0..3): layer 0 always plays, the
// others join as the civilization advances within the era (see Conductor.setIntensity).
//
// A piece is a plain list of timed notes, built once (about a millisecond) and then
// read by the conductor's look-ahead clock; the same piece renders offline unchanged.
import type { Inst } from './instruments';
import { CODA_MELODY, SCORES, type EraScore, type ScoreKey } from './score';
import {
  chordPcs, degSemis, harmonyBelow, parseChords, parseMelody, rng, rootIn, voiceChord,
  type ChordSpan, type MelNote, type ModeName,
} from './theory';

export type Mood = 'title' | 'peace' | 'war';

export interface NoteEv {
  /** Start and length in beats. */
  t: number;
  d: number;
  /** MIDI pitch. */
  p: number;
  /** Velocity 0..1. */
  v: number;
  i: Inst;
  /** Layer: played when the conductor's layer count is above it. */
  L: number;
  x?: number;
}

export interface Piece {
  key: ScoreKey;
  mood: Mood;
  bpm: number;
  beats: number;
  events: NoteEv[];
  /** Beat -> seconds from the start of the piece (with the closing ritardando). */
  sec: (beat: number) => number;
  durSec: number;
  rest: number;
  reverb: number;
  echo: number;
  gain: number;
  form: string;
  /** Stereo position of each instrument in this ensemble (-1..1). */
  pan: Partial<Record<Inst, number>>;
}

interface MNote { t: number; d: number; p: number }
type SectionKind = 'intro' | 'theme' | 'coda';
interface Bar {
  t0: number;
  chords: ChordSpan[];
  mel: MNote[];
  kind: SectionKind;
  theme: 'M' | 'E1' | 'E2' | '';
  /** Bar within its section, and the section's length. */
  pb: number;
  nb: number;
  /** Index of the section among the theme statements (0, 1, 2 …). */
  stmt: number;
  /** 0 plain, 1 ornamented, 2 re-scored. */
  vary: number;
  final: boolean;
  dyn: number;
}

interface Section { kind: SectionKind; theme: 'M' | 'E1' | 'E2' | ''; vary: number; bars?: number }

const BEATS = 4;

// --- the emitter: humanized notes, tied sustains ------------------------------------------

class Out {
  ev: NoteEv[] = [];
  private open = new Map<string, NoteEv>();
  constructor(private r: () => number) {}
  n(i: Inst, t: number, d: number, p: number, v: number, L: number, x?: number): void {
    if (v <= 0.01 || d <= 0) return;
    const jitter = i === 'frame' || i === 'tek' || i === 'shaker' || i === 'taiko' || i === 'timp' ? 0.006 : 0.014;
    this.ev.push({ t: Math.max(0, t + (this.r() - 0.5) * jitter * 2), d, p, v: Math.min(1, v * (0.93 + this.r() * 0.14)), i, L, x });
  }
  /** A sustained note that ties into the previous one of the same pitch, part and layer. */
  hold(i: Inst, t: number, d: number, p: number, v: number, L: number, x?: number): void {
    const k = `${i}:${L}:${p}:${x ?? 0}`;
    const prev = this.open.get(k);
    if (prev && Math.abs(prev.t + prev.d - t) < 0.05) { prev.d = t + d - prev.t; return; }
    const e: NoteEv = { t, d, p, v, i, L, x };
    this.ev.push(e);
    this.open.set(k, e);
  }
}

// --- helpers shared by the ensembles ------------------------------------------------------

interface A {
  sc: EraScore;
  mode: ModeName;
  tonic: number;
  war: boolean;
  r: () => number;
  o: Out;
  /** Voice-leading memory per part. */
  vl: Map<string, number[]>;
}

const chordAt = (b: Bar, t: number): ChordSpan => b.chords.find((c) => t >= c.t - 1e-6 && t < c.t + c.d - 1e-6) ?? b.chords[b.chords.length - 1];
const pcsOf = (a: A, c: ChordSpan) => chordPcs(a.mode, c.chord);

function melody(a: A, b: Bar, inst: Inst, oct: number, v: number, L: number, opt: { orn?: boolean; x?: number; tremolo?: boolean } = {}): void {
  b.mel.forEach((n, k) => {
    const p = n.p + oct * 12;
    const vv = v * b.dyn * (n.t === 0 ? 1.05 : 1);
    if (opt.orn && n.d >= 1.5 && k > 0 && a.r() < 0.6) {
      // a grace note from the step above, as singers and wind players do
      const up = p + (a.r() < 0.5 ? 2 : 1);
      a.o.n(inst, b.t0 + n.t - 0.14, 0.16, up, vv * 0.6, L, opt.x);
    }
    if (opt.tremolo && n.d >= 1.5) {
      for (let s = 0; s < n.d - 0.01; s += 0.5) a.o.n(inst, b.t0 + n.t + s, 0.5, p, vv * (s === 0 ? 1 : 0.55 - s * 0.04), L, opt.x);
    } else {
      a.o.n(inst, b.t0 + n.t, n.d * 0.97, p, vv, L, opt.x);
    }
  });
}

/** The melody again, simplified and slightly late: heterophony. */
function heterophony(a: A, b: Bar, inst: Inst, oct: number, v: number, L: number, minDur = 0.75, x?: number): void {
  for (const n of b.mel) {
    if (n.d < minDur) continue;
    a.o.n(inst, b.t0 + n.t + 0.06, n.d * 0.95, n.p + oct * 12, v * b.dyn, L, x);
    if (n.d >= 2 && (inst === 'pluck' || inst === 'harp')) a.o.n(inst, b.t0 + n.t + 1.06, n.d - 1, n.p + oct * 12, v * 0.6 * b.dyn, L, x);
  }
}

/** Call and response: while the melody holds a long note, another voice answers with the bar's opening notes. */
function response(a: A, b: Bar, inst: Inst, oct: number, v: number, L: number, x?: number): void {
  if (!b.mel.length || b.final) return;
  const last = b.mel[b.mel.length - 1];
  if (last.d < 2 || b.mel.length < 2) return;
  const start = last.t + 0.5;
  const motif = b.mel.slice(0, Math.min(3, b.mel.length - 1));
  let t = start;
  for (const n of motif) {
    const d = Math.min(n.d, 1);
    if (t + d > BEATS) break;
    a.o.n(inst, b.t0 + t, d * 0.95, n.p + oct * 12, v * b.dyn, L, x);
    t += d;
  }
}

/** A second voice a third or sixth (or, open, a fourth or fifth) below the melody's long notes. */
function harmony(a: A, b: Bar, inst: Inst, oct: number, v: number, L: number, open: boolean, x?: number): void {
  for (const n of b.mel) {
    if (n.d < 1) continue;
    const h = harmonyBelow(n.p, pcsOf(a, chordAt(b, n.t)), a.tonic, open);
    if (h !== null) a.o.n(inst, b.t0 + n.t, n.d * 0.97, h + oct * 12, v * b.dyn, L, x);
  }
}

function voiced(a: A, part: string, c: ChordSpan, n: number, lo: number, hi: number): number[] {
  const prev = a.vl.get(part) ?? null;
  const v = voiceChord(pcsOf(a, c), a.tonic, n, lo, hi, prev);
  a.vl.set(part, v);
  return v;
}

/** Sustained chords, voice-led, tied across bars when a tone stays. */
function pad(a: A, b: Bar, inst: Inst, n: number, lo: number, hi: number, v: number, L: number, x?: number): void {
  for (const c of b.chords) {
    const ps = voiced(a, inst + L, c, n, lo, hi);
    const d = b.final ? c.d + 3 : c.d;
    for (const p of ps) a.o.hold(inst, b.t0 + c.t, d, p, v * (0.85 + 0.15 * b.dyn), L, x);
  }
}

/** Short repeated chords (strings, electric piano): `hits` are [beat, length] pairs within the bar. */
function comp(a: A, b: Bar, inst: Inst, n: number, lo: number, hi: number, v: number, L: number, hits: [number, number][], x?: number): void {
  if (b.final) { pad(a, b, inst, n, lo, hi, v, L, x); return; }
  for (const [t, d] of hits) {
    const c = chordAt(b, t);
    for (const p of voiced(a, inst + L, c, n, lo, hi)) a.o.n(inst, b.t0 + t, d, p, v * b.dyn * (t === 0 ? 1 : 0.85), L, x);
  }
}

/** Chord tones ascending from the root at or above `lo`. */
function ladder(a: A, c: ChordSpan, lo: number, count: number): number[] {
  const root = rootIn(a.mode, a.tonic, c.chord.deg, lo);
  const out: number[] = [];
  for (let o = 0; out.length < count && o < 6; o++) for (const iv of c.chord.ivs) if (out.length < count) out.push(root + iv + 12 * o);
  return out.sort((x, y) => x - y).slice(0, count);
}

/** Broken chords: `pattern` indexes the ladder; one step every `step` beats. */
function arpeggio(a: A, b: Bar, inst: Inst, lo: number, pattern: number[], step: number, v: number, L: number, len = 0, x?: number): void {
  if (b.final) {
    // the last bar: one rolled chord that rings
    const c = b.chords[0];
    ladder(a, c, lo, 4).forEach((p, k) => a.o.n(inst, b.t0 + k * 0.12, 3.5, p, v * 0.8, L, x));
    return;
  }
  let k = 0;
  for (let t = 0; t < BEATS - 1e-6; t += step, k++) {
    const c = chordAt(b, t);
    const lad = ladder(a, c, lo, Math.max(...pattern) + 1);
    const p = lad[pattern[k % pattern.length]];
    const accent = Math.abs(t - Math.round(t)) < 1e-6 ? (t === 0 ? 1.1 : 1) : 0.82;
    a.o.n(inst, b.t0 + t, len || step * 1.6, p, v * b.dyn * accent, L, x);
  }
}

/** Roots (and fifths) in the bass: `rhythm` lists [beat, length, 'r' | '5' | 'o'] within the bar. */
function bassline(a: A, b: Bar, inst: Inst, lo: number, v: number, L: number, rhythm: [number, number, string][], x?: number): void {
  if (b.final) {
    const c = b.chords[0];
    a.o.n(inst, b.t0, 4, rootIn(a.mode, a.tonic, c.chord.bassDeg, lo), v, L, x);
    return;
  }
  for (const [t, d, w] of rhythm) {
    const c = chordAt(b, t);
    const root = rootIn(a.mode, a.tonic, c.chord.bassDeg, lo);
    const p = w === '5' ? root + (c.chord.ivs[2] ?? c.chord.ivs[1] ?? 7) : w === 'o' ? root + 12 : root;
    a.o.n(inst, b.t0 + t, d, p, v * b.dyn * (t === 0 ? 1 : 0.85), L, x);
  }
}

/** Drums: `hits` are [beat, velocity, instrument, pitch?]. */
function drums(a: A, b: Bar, L: number, hits: [number, number, Inst, number?][]): void {
  const soft = b.kind === 'intro' ? 0.6 : b.kind === 'coda' ? 0.75 : 1;
  for (const [t, v, inst, p] of hits) {
    if (b.final && t > 0) continue;
    a.o.n(inst, b.t0 + t, 0.5, p ?? 50, v * soft * (0.9 + 0.1 * b.dyn), L);
  }
}

/** Long tones on the root and fifth of each chord, tied while the root stays. */
function drone(a: A, b: Bar, inst: Inst, lo: number, v: number, L: number, fifth = true): void {
  for (const c of b.chords) {
    const root = rootIn(a.mode, a.tonic, c.chord.bassDeg, lo);
    const d = b.final ? c.d + 4 : c.d;
    a.o.hold(inst, b.t0 + c.t, d, root, v, L);
    if (fifth) a.o.hold(inst, b.t0 + c.t, d, root + 7, v * 0.7, L);
  }
}

/** A few bell tones from the chord, placed freely (seeded): stars. */
function sparkle(a: A, b: Bar, inst: Inst, lo: number, hi: number, v: number, L: number, count: number): void {
  if (b.final) return;
  const slots = [0, 0.5, 1.5, 2, 2.5, 3];
  for (let k = 0; k < count; k++) {
    if (a.r() < 0.35) continue;
    const t = slots[Math.floor(a.r() * slots.length)];
    const pcs = pcsOf(a, chordAt(b, t));
    const cands: number[] = [];
    for (let p = lo; p <= hi; p++) if (pcs.includes((((p - a.tonic) % 12) + 12) % 12)) cands.push(p);
    if (cands.length) a.o.n(inst, b.t0 + t, 2, cands[Math.floor(a.r() * cands.length)], v, L);
  }
}

// --- the ensembles ---------------------------------------------------------------------------

type Ensemble = (a: A, b: Bar) => void;

const ENSEMBLES: Record<ScoreKey, Ensemble> = {
  // Drone, a reed flute and a lyre in heterophony, frame drums; call and response on a bowed fiddle.
  ancient(a, b) {
    const t = a.tonic;
    if (!a.war) {
      drone(a, b, 'drone', t - 26, 0.55, 0);
      const lyreLeads = b.theme === 'E2';
      if (lyreLeads) {
        melody(a, b, 'pluck', 0, 0.8, 0, { tremolo: true });
        heterophony(a, b, 'flute', 0, 0.45, 1, 1);
      } else {
        melody(a, b, 'flute', 0, 0.78, 0, { orn: true });
        heterophony(a, b, 'pluck', -1, 0.55, 1);
      }
      drums(a, b, 2, [[0, 0.5, 'frame', 45], [1.5, 0.2, 'tek'], [2, 0.36, 'frame', 45], [3, 0.24, 'tek'], [3.5, 0.14, 'tek']]);
      response(a, b, 'bowed', -1, 0.5, 3);
      if (b.kind === 'intro' || b.final) a.o.n('pluck', b.t0, 2, t - 12, 0.4, 1);
    } else {
      drone(a, b, 'drone', t - 26, 0.62, 0);
      melody(a, b, 'bowed', 0, 0.8, 0, { orn: true });
      drums(a, b, 0, [[0, 0.62, 'frame', 43], [0.5, 0.2, 'tek'], [1, 0.42, 'frame', 43], [1.5, 0.22, 'tek'], [2, 0.5, 'frame', 43], [2.5, 0.38, 'frame', 43], [3, 0.45, 'frame', 43], [3.5, 0.26, 'tek']]);
      drums(a, b, 1, [[0, 0.55, 'taiko'], [2.5, 0.4, 'taiko']]);
      if (!b.final) for (let k = 0; k < 8; k++) a.o.n('pluck', b.t0 + k * 0.5, 0.45, t - (k % 2 ? 0 : 12), 0.32, 2);
      response(a, b, 'flute', 0, 0.45, 3);
    }
  },

  // Chant with organum, harp, a vielle drone, bells; in war, drums and an ostinato harp.
  classical(a, b) {
    const t = a.tonic;
    if (!a.war) {
      const fluteLeads = b.theme === 'E1';
      if (fluteLeads) {
        melody(a, b, 'flute', 1, 0.7, 0, { orn: true, x: 0.6 });
        pad(a, b, 'choir', 3, t - 5, t + 9, 0.45, 1, 2);
      } else {
        melody(a, b, 'choir', 0, 0.85, 0);
        harmony(a, b, 'choir', 0, 0.62, 1, true, 1);
      }
      arpeggio(a, b, 'harp', t - 12, [0, 1, 2, 3, 4, 3, 2, 1], 0.5, 0.48, 0);
      drone(a, b, 'bowed', t - 24, 0.32, 2);
      if (b.pb === 0 && b.kind === 'theme') a.o.n('bell', b.t0, 4, t + 12, 0.28, 3);
      response(a, b, 'flute', 1, 0.45, 3, 0.6);
    } else {
      melody(a, b, 'choir', 0, 0.85, 0, { x: 1 });
      harmony(a, b, 'choir', 0, 0.7, 0, true, 1);
      drone(a, b, 'bowed', t - 24, 0.45, 0);
      drums(a, b, 1, [[0, 0.5, 'timp', t - 24], [1, 0.3, 'frame', 45], [1.5, 0.2, 'frame', 45], [2, 0.4, 'timp', t - 17], [3, 0.3, 'frame', 45], [3.5, 0.25, 'tek']]);
      arpeggio(a, b, 'harp', t - 24, [0, 1, 0, 2, 0, 1, 0, 2], 0.5, 0.45, 2);
      heterophony(a, b, 'bowed', -1, 0.45, 3);
    }
  },

  // Continuo (harpsichord and cello), a wind or violin melody, a duet in thirds, strings.
  earlyModern(a, b) {
    const t = a.tonic;
    if (!a.war) {
      const violinLeads = b.theme === 'E1';
      if (violinLeads) {
        melody(a, b, 'bowed', 0, 0.78, 0);
        harmony(a, b, 'flute', 0, 0.42, 3, false, 0.5);
      } else {
        melody(a, b, 'flute', 0, 0.78, 0, { orn: b.vary === 1, x: 0.5 });
        harmony(a, b, 'bowed', 0, 0.42, 3, false);
      }
      arpeggio(a, b, 'harpsi', t - 17, [0, 2, 1, 2, 0, 2, 1, 2], 0.5, 0.5, 0, 0.45);
      bassline(a, b, 'cello', t - 31, 0.55, 1, [[0, 1.9, 'r'], [2, 1.9, '5']]);
      pad(a, b, 'strings', 3, t - 12, t + 5, 0.42, 2);
    } else {
      melody(a, b, 'horn', -1, 0.82, 0);
      comp(a, b, 'strings', 3, t - 17, t, 0.5, 0, [[0, 0.4], [0.5, 0.4], [1, 0.4], [1.5, 0.4], [2, 0.4], [2.5, 0.4], [3, 0.4], [3.5, 0.4]], 1);
      bassline(a, b, 'timp', t - 31, 0.6, 0, [[0, 1, 'r'], [2, 1, '5'], [3.5, 0.5, 'r']]);
      bassline(a, b, 'cello', t - 31, 0.5, 1, [[0, 0.45, 'r'], [0.5, 0.45, 'r'], [1, 0.45, 'o'], [1.5, 0.45, 'r'], [2, 0.45, 'r'], [2.5, 0.45, 'r'], [3, 0.45, 'o'], [3.5, 0.45, 'r']], 1);
      arpeggio(a, b, 'harpsi', t - 17, [0, 2, 1, 2, 0, 2, 1, 2], 0.5, 0.42, 2, 0.4);
      melody(a, b, 'bowed', 0, 0.5, 3);
    }
  },

  // Romantic orchestra: piano, a solo voice that passes between horn, violin and cello, strings, timpani.
  industrial(a, b) {
    const t = a.tonic;
    if (!a.war) {
      const lead: [Inst, number] = b.theme === 'E1' ? ['bowed', 1] : b.theme === 'E2' ? ['cello', -1] : b.vary === 2 ? ['piano', 1] : ['horn', 0];
      melody(a, b, lead[0], lead[1], lead[0] === 'piano' ? 0.75 : 0.8, 0);
      arpeggio(a, b, 'piano', t - 17, [0, 2, 3, 4, 5, 4, 3, 2], 0.5, 0.38, 0, 1.1);
      pad(a, b, 'strings', 4, t - 12, t + 10, 0.42, 1);
      harmony(a, b, lead[0] === 'cello' ? 'horn' : 'cello', lead[0] === 'cello' ? 0 : -1, 0.45, 2, false);
      bassline(a, b, 'bass', t - 24, 0.3, 2, [[0, 1.8, 'r'], [2, 1.8, 'r']]);
      if (lead[0] !== 'piano') melody(a, b, 'strings', lead[1] + 1, 0.32, 3);
      if ((b.pb === 3 || b.pb === 7) && b.kind === 'theme') a.o.n('timp', b.t0, 1, t - 24 + 7, 0.32, 3);
    } else {
      melody(a, b, 'horn', 0, 0.85, 0);
      harmony(a, b, 'horn', 0, 0.55, 1, true);
      bassline(a, b, 'cello', t - 24, 0.55, 0, [[0, 0.45, 'r'], [0.5, 0.45, 'r'], [1, 0.45, 'r'], [1.5, 0.45, 'o'], [2, 0.45, 'r'], [2.5, 0.45, 'r'], [3, 0.45, 'r'], [3.5, 0.45, 'o']], 1);
      bassline(a, b, 'timp', t - 24, 0.6, 0, [[0, 1, 'r'], [1.5, 0.5, 'r'], [2, 1, '5']]);
      drums(a, b, 1, [[0, 0.5, 'taiko'], [2, 0.42, 'taiko']]);
      pad(a, b, 'strings', 4, t - 12, t + 7, 0.42, 2);
      bassline(a, b, 'piano', t - 36, 0.5, 3, [[0, 1.5, 'r'], [2, 1.5, 'r']]);
    }
  },

  // Electric piano, pulses and a sub bass, a melody that passes from mallets to a pure lead to violin.
  modern(a, b) {
    const t = a.tonic;
    if (!a.war) {
      const lead: [Inst, number] = b.theme === 'E1' ? ['lead', 0] : b.vary === 2 ? ['bowed', 0] : ['vibes', 0];
      melody(a, b, lead[0], lead[1], 0.75, 0);
      comp(a, b, 'epiano', 4, t - 12, t + 7, 0.42, 0, [[0, 1.4], [1.5, 2.3]]);
      bassline(a, b, 'sub', t - 29, 0.32, 0, [[0, 1.9, 'r'], [2, 1.9, 'r']]);
      arpeggio(a, b, 'arp', t, [0, 2, 4, 2, 1, 3, 4, 3], 0.5, 0.32, 1, 0.6);
      pad(a, b, 'strings', 3, t - 5, t + 12, 0.38, 2);
      drums(a, b, 3, [[0, 0.22, 'shaker'], [0.5, 0.32, 'shaker'], [1, 0.2, 'shaker'], [1.5, 0.32, 'shaker'], [2, 0.22, 'shaker'], [2.5, 0.32, 'shaker'], [3, 0.2, 'shaker'], [3.5, 0.32, 'shaker']]);
      harmony(a, b, 'cello', -1, 0.38, 3, false);
    } else {
      melody(a, b, 'horn', -1, 0.82, 0);
      pad(a, b, 'pad', 3, t - 12, t + 5, 0.55, 0);
      bassline(a, b, 'bass', t - 29, 0.5, 0, [[0, 0.4, 'r'], [0.5, 0.4, 'r'], [1, 0.4, 'r'], [1.5, 0.4, 'o'], [2, 0.4, 'r'], [2.5, 0.4, 'r'], [3, 0.4, 'r'], [3.5, 0.4, 'o']]);
      drums(a, b, 0, [[0, 0.5, 'taiko'], [2.5, 0.38, 'taiko']]);
      arpeggio(a, b, 'arp', t - 5, [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 3], 0.25, 0.24, 1, 0.3);
      pad(a, b, 'strings', 3, t, t + 14, 0.32, 2);
      drums(a, b, 3, [[0.5, 0.3, 'shaker'], [1.5, 0.3, 'shaker'], [2.5, 0.3, 'shaker'], [3.5, 0.3, 'shaker'], [1, 0.22, 'tek'], [3, 0.22, 'tek']]);
    }
  },

  // Glass pads, a sub drone, a pure-tone voice, bells like stars, a slow shimmer, a distant choir.
  space(a, b) {
    const t = a.tonic;
    if (!a.war) {
      const lead: [Inst, number] = b.theme === 'E1' ? ['lead', 1] : b.vary === 2 ? ['strings', 0] : ['lead', 0];
      melody(a, b, lead[0], lead[1], lead[0] === 'strings' ? 0.7 : 0.78, 0);
      pad(a, b, 'glass', 4, t - 12, t + 12, 0.55, 0);
      drone(a, b, 'sub', t - 24, 0.2, 0, false);
      sparkle(a, b, 'bell', t + 12, t + 31, 0.26, 1, 2);
      arpeggio(a, b, 'arp', t + 12, [0, 1, 2, 3, 4, 3, 2, 1], 0.5, 0.16, 2, 1.2);
      pad(a, b, 'choir', 3, t, t + 15, 0.32, 3, 2);
      harmony(a, b, 'strings', lead[1], 0.3, 3, false);
    } else {
      melody(a, b, 'lead', -1, 0.8, 0);
      pad(a, b, 'pad', 3, t - 16, t + 3, 0.55, 0);
      bassline(a, b, 'sub', t - 24, 0.5, 0, [[0, 0.4, 'r'], [0.5, 0.4, 'r'], [1, 0.4, 'r'], [1.5, 0.4, 'r'], [2, 0.4, 'r'], [2.5, 0.4, 'r'], [3, 0.4, 'r'], [3.5, 0.4, 'r']]);
      drums(a, b, 0, [[0, 0.5, 'taiko']]);
      drums(a, b, 1, [[2.5, 0.38, 'taiko']]);
      sparkle(a, b, 'bell', t - 12, t, 0.3, 1, 1);
      pad(a, b, 'strings', 3, t + 2, t + 16, 0.3, 2);
      drums(a, b, 3, [[1, 0.22, 'tek'], [3, 0.22, 'tek'], [0.5, 0.25, 'shaker'], [1.5, 0.25, 'shaker'], [2.5, 0.25, 'shaker'], [3.5, 0.25, 'shaker']]);
    }
  },

  // The title: strings, harp, cello, the flute with the theme, a violin answer, bells at the close.
  title(a, b) {
    const t = a.tonic;
    const lead: [Inst, number] = b.theme === 'E1' ? ['bowed', -1] : ['flute', 0];
    melody(a, b, lead[0], lead[1], 0.75, 0, { orn: lead[0] === 'flute' && b.vary === 1, x: 0.6 });
    if (b.vary === 2) melody(a, b, 'horn', -1, 0.42, 0);
    pad(a, b, 'strings', 4, t - 24, t - 3, 0.42, 0);
    arpeggio(a, b, 'harp', t - 24, [0, 1, 2, 3, 4, 5, 4, 3], 0.5, 0.4, 0, 1.4);
    bassline(a, b, 'cello', t - 38, 0.48, 0, [[0, 3.9, 'r']]);
    if (b.pb === 0 && b.kind === 'theme') a.o.n('bell', b.t0, 4, t, 0.25, 0);
    if (b.kind === 'coda' && b.pb === b.nb - 2) {
      [0, 7, 12, 14, 19].forEach((iv, k) => a.o.n('bell', b.t0 + 2 + k * 0.5, 3, t + iv, 0.24, 0));
    }
    response(a, b, 'harp', 0, 0.42, 0);
  },
};

const PAN: Partial<Record<Inst, number>> = {
  flute: 0.12, pluck: -0.32, harp: -0.38, harpsi: -0.3, drone: 0, bowed: 0.22, cello: 0.3, strings: -0.12, choir: 0.05,
  pad: 0, glass: 0, bell: 0.35, vibes: -0.15, epiano: -0.22, piano: -0.18, horn: 0.18, bass: 0, sub: 0, arp: 0.3,
  lead: 0.05, frame: -0.15, tek: 0.2, timp: -0.1, taiko: 0, shaker: 0.38,
};

// --- the form ------------------------------------------------------------------------------

const PEACE_FORMS: Section[][] = [
  [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'theme', theme: 'E1', vary: 0 }, { kind: 'theme', theme: 'M', vary: 1 }, { kind: 'coda', theme: '', vary: 0 }],
  [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'E1', vary: 0 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'theme', theme: 'E2', vary: 0 }, { kind: 'coda', theme: '', vary: 0 }],
  [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'theme', theme: 'E2', vary: 0 }, { kind: 'theme', theme: 'E1', vary: 1 }, { kind: 'theme', theme: 'M', vary: 2 }, { kind: 'coda', theme: '', vary: 0 }],
  [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'E2', vary: 0 }, { kind: 'theme', theme: 'M', vary: 2 }, { kind: 'coda', theme: '', vary: 0 }],
  [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'E1', vary: 0 }, { kind: 'theme', theme: 'E2', vary: 1 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'coda', theme: '', vary: 0 }],
];
const WAR_FORMS: Section[][] = [
  [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'theme', theme: 'E1', vary: 0 }, { kind: 'theme', theme: 'M', vary: 1 }, { kind: 'coda', theme: '', vary: 0 }],
  [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'E1', vary: 0 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'coda', theme: '', vary: 0 }],
];
const TITLE_FORM: Section[] = [
  { kind: 'intro', theme: '', vary: 0, bars: 4 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'theme', theme: 'E1', vary: 0 },
  { kind: 'theme', theme: 'M', vary: 2 }, { kind: 'coda', theme: '', vary: 0 },
];

/** Ornament a melody in the degree domain: passing tones fill the thirds. */
function ornament(bars: MelNote[][]): MelNote[][] {
  return bars.map((bar, bi) => {
    const out: MelNote[] = [];
    bar.forEach((n, k) => {
      const next = bar[k + 1] ?? bars[bi + 1]?.[0];
      if (!n.rest && next && !next.rest && n.d >= 1 && Math.abs(next.deg - n.deg) === 2 && n.acc === 0) {
        out.push({ ...n, d: n.d - 0.5 });
        out.push({ t: n.t + n.d - 0.5, d: 0.5, deg: (n.deg + next.deg) / 2, acc: 0, rest: false });
      } else out.push(n);
    });
    return out;
  });
}

export interface PieceOptions {
  /** A form index; random (seeded) when omitted. */
  form?: number;
  /** A fixed list of sections (renders of a single statement). */
  sections?: Section[];
}

export function buildPiece(key: ScoreKey, mood: Mood, seed: number, opts: PieceOptions = {}): Piece {
  const sc = SCORES[key];
  const r = rng(seed);
  const war = mood === 'war';
  const mode = war ? sc.warMode : sc.mode;
  const tonic = sc.tonic;
  const bpm = (war ? sc.warBpm : sc.bpm) * (0.97 + r() * 0.06);
  const forms = key === 'title' ? [TITLE_FORM] : war ? WAR_FORMS : PEACE_FORMS;
  const fi = opts.form ?? Math.floor(r() * forms.length);
  const plan = opts.sections ?? forms[fi % forms.length];

  const theme = (k: 'M' | 'E1' | 'E2') => (k === 'M' ? sc.main : k === 'E1' ? sc.themes[0] : sc.themes[1]);
  const bars: Bar[] = [];
  let t0 = 0;
  let stmt = 0;
  plan.forEach((s, si) => {
    let chordBars: ChordSpan[][];
    let mel: MelNote[][];
    if (s.kind === 'theme') {
      const th = theme(s.theme as 'M' | 'E1' | 'E2');
      chordBars = parseChords(th.chords, mode, BEATS);
      mel = parseMelody(th.melody, BEATS);
      if (s.vary === 1) mel = ornament(mel);
    } else if (s.kind === 'coda') {
      chordBars = parseChords(sc.coda, mode, BEATS);
      mel = parseMelody(CODA_MELODY, BEATS);
    } else {
      // the intro sits on the chord the next section starts with
      const next = plan[si + 1];
      const src = next?.kind === 'theme' ? theme(next.theme as 'M' | 'E1' | 'E2').chords : sc.main.chords;
      const first = parseChords(src, mode, BEATS)[0];
      chordBars = Array.from({ length: s.bars ?? 2 }, () => first);
      mel = chordBars.map(() => []);
    }
    const nb = chordBars.length;
    for (let k = 0; k < nb; k++) {
      const notes = (mel[k] ?? []).filter((n) => !n.rest).map((n) => ({ t: n.t, d: n.d, p: tonic + degSemis(mode, n.deg) + n.acc }));
      const arc = s.kind === 'intro' ? 0.72 : s.kind === 'coda' ? 0.86 - 0.08 * k : 0.84 + 0.16 * Math.sin(Math.PI * (k + 0.5) / nb);
      bars.push({ t0, chords: chordBars[k], mel: notes, kind: s.kind, theme: s.theme, pb: k, nb, stmt, vary: s.vary, final: false, dyn: arc });
      t0 += BEATS;
    }
    if (s.kind === 'theme') stmt++;
  });
  bars[bars.length - 1].final = true;

  const o = new Out(r);
  const a: A = { sc, mode, tonic, war, r, o, vl: new Map() };
  const ens = ENSEMBLES[key];
  for (const b of bars) ens(a, b);

  const beats = t0;
  const spb = 60 / bpm;
  // a ritardando over the last two bars, up to 25% slower
  const rs = Math.max(0, beats - 2 * BEATS);
  const L = beats - rs;
  const sec = (b: number) => (b <= rs ? b * spb : rs * spb + spb * ((b - rs) + (0.25 * (b - rs) * (b - rs)) / (2 * L)));
  const events = o.ev.sort((x, y) => x.t - y.t);
  const tail = Math.max(...events.map((e) => sec(e.t + e.d)));
  return {
    key, mood, bpm, beats, events, sec, durSec: Math.max(sec(beats), tail),
    rest: sc.rest[0] + r() * (sc.rest[1] - sc.rest[0]),
    reverb: sc.reverb, echo: sc.echo, gain: war ? sc.warGain : sc.gain,
    form: plan.map((s) => (s.kind === 'theme' ? s.theme + (s.vary ? `~${s.vary}` : '') : s.kind)).join(' '),
    pan: PAN,
  };
}

/** One statement of the main theme, framed by a short intro and the coda (used by the renders). */
export function mainThemePiece(key: ScoreKey, mood: Mood, seed: number): Piece {
  return buildPiece(key, mood, seed, {
    sections: [{ kind: 'intro', theme: '', vary: 0, bars: 2 }, { kind: 'theme', theme: 'M', vary: 0 }, { kind: 'coda', theme: '', vary: 0 }],
  });
}
