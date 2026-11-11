// Music theory for the score: modes, scale degrees, chords and a compact notation.
//
// Melody notation: bars separated by `|`, notes by spaces.  `deg[octave][:beats]`
//   deg     1..7 (scale degree of the piece's mode), optionally prefixed by # or b
//           for a chromatic alteration (`#7` is a raised seventh); `r` is a rest
//   octave  ' up an octave, , down an octave (repeatable)
//   beats   duration in beats (default 1)
// e.g. "1:2 5:2 | 4 3 4 5 | 7:2 6 5 | 5:4"
//
// Chord notation: one token per bar, `-` splits a bar into equal parts.
//   deg[.ext...][/bass]   triad on that degree, built from the mode
//   ext: 7 seventh, 9 added ninth, M major third, m minor third, s4 / s2 suspended,
//        q quartal (stacked fourths), 5 open fifth only
//   /bass a pedal: the bass plays this degree instead of the root
// e.g. "1 | 7 | 4 | 5 | 3 | 7 | 4-5.M | 1"

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;
export type ModeName = keyof typeof MODES;

/** Semitones above the tonic of a 0-based scale degree (any integer: negative or above 6 change octave). */
export function degSemis(mode: ModeName, deg: number): number {
  const m = MODES[mode];
  const o = Math.floor(deg / 7);
  return o * 12 + m[((deg % 7) + 7) % 7];
}

export interface MelNote { t: number; d: number; deg: number; acc: number; rest: boolean }
export interface Chord {
  /** 0-based degree of the root. */
  deg: number;
  /** Intervals above the root, in semitones, ascending (root = 0 first). */
  ivs: number[];
  /** Degree the bass plays (the root unless a pedal is written). */
  bassDeg: number;
}
export interface ChordSpan { t: number; d: number; chord: Chord }

export function parseMelody(src: string, beatsPerBar: number): MelNote[][] {
  const bars = src.split('|').map((b) => b.trim()).filter((b) => b.length);
  return bars.map((bar, bi) => {
    let t = 0;
    const out: MelNote[] = [];
    for (const tok of bar.split(/\s+/)) {
      const m = /^(r|[#b]?[1-7])(['",]*)(?::([\d.]+))?$/.exec(tok);
      if (!m) throw new Error(`bad melody token "${tok}" in bar ${bi + 1}`);
      const d = m[3] ? Number(m[3]) : 1;
      if (m[1] === 'r') { out.push({ t, d, deg: 0, acc: 0, rest: true }); t += d; continue; }
      const acc = m[1][0] === '#' ? 1 : m[1][0] === 'b' ? -1 : 0;
      const n = Number(m[1].replace(/[#b]/, '')) - 1;
      let oct = 0;
      for (const c of m[2]) oct += c === ',' ? -1 : 1;
      out.push({ t, d, deg: n + oct * 7, acc, rest: false });
      t += d;
    }
    if (Math.abs(t - beatsPerBar) > 1e-6) throw new Error(`melody bar ${bi + 1} has ${t} beats, expected ${beatsPerBar}: "${bar}"`);
    return out;
  });
}

export function parseChord(tok: string, mode: ModeName): Chord {
  const m = /^([1-7])((?:\.[a-zA-Z0-9]+)*)(?:\/([1-7]))?$/.exec(tok);
  if (!m) throw new Error(`bad chord token "${tok}"`);
  const deg = Number(m[1]) - 1;
  const exts = m[2] ? m[2].split('.').filter(Boolean) : [];
  const above = (n: number) => degSemis(mode, deg + n) - degSemis(mode, deg);
  let third = above(2);
  const fifth = above(4);
  let ivs: number[];
  if (exts.includes('M')) third = 4;
  if (exts.includes('m')) third = 3;
  if (exts.includes('q')) ivs = [0, above(3), above(6) + (above(6) < above(3) ? 12 : 0)];
  else if (exts.includes('5')) ivs = [0, fifth];
  else if (exts.includes('s4')) ivs = [0, above(3), fifth];
  else if (exts.includes('s2')) ivs = [0, above(1), fifth];
  else ivs = [0, third, fifth];
  if (exts.includes('7')) ivs.push(above(6));
  if (exts.includes('9')) ivs.push(above(1) + 12);
  const bassDeg = m[3] ? Number(m[3]) - 1 : deg;
  return { deg, ivs, bassDeg };
}

export function parseChords(src: string, mode: ModeName, beatsPerBar: number): ChordSpan[][] {
  return src.split('|').map((b) => b.trim()).filter((b) => b.length).map((bar) => {
    const parts = bar.split('-');
    const d = beatsPerBar / parts.length;
    return parts.map((p, i) => ({ t: i * d, d, chord: parseChord(p.trim(), mode) }));
  });
}

/** Pitch classes (0..11, relative to the tonic) of a chord. */
export function chordPcs(mode: ModeName, c: Chord): number[] {
  const r = degSemis(mode, c.deg);
  return c.ivs.map((iv) => (((r + iv) % 12) + 12) % 12);
}

/** MIDI of the chord root nearest below or at `ceiling`, at least `floor`. */
export function rootIn(mode: ModeName, tonic: number, deg: number, floor: number): number {
  let p = tonic + degSemis(mode, deg);
  while (p < floor) p += 12;
  while (p - 12 >= floor) p -= 12;
  return p;
}

/** The chord tone nearest to `midi` (ties go down). */
export function snapToChord(midi: number, pcs: number[], tonic: number): number {
  let best = midi;
  let bd = 99;
  for (let d = 0; d <= 6; d++) {
    for (const s of d === 0 ? [0] : [-d, d]) {
      const p = midi + s;
      if (pcs.includes((((p - tonic) % 12) + 12) % 12) && Math.abs(s) < bd) { bd = Math.abs(s); best = p; }
    }
    if (bd < 99) break;
  }
  return best;
}

/** A chord tone 3..9 semitones below `midi`, preferring a sixth or third (sweet), then a fourth or fifth (open). */
export function harmonyBelow(midi: number, pcs: number[], tonic: number, open = false): number | null {
  const pref = open ? [7, 5, 8, 9, 3, 4] : [3, 4, 8, 9, 5, 7];
  for (const iv of pref) {
    const p = midi - iv;
    if (pcs.includes((((p - tonic) % 12) + 12) % 12)) return p;
  }
  return null;
}

/** Voice a chord for `n` voices between lo and hi, moving as little as possible from `prev`. */
export function voiceChord(pcs: number[], tonic: number, n: number, lo: number, hi: number, prev: number[] | null): number[] {
  const cands: number[] = [];
  for (let p = lo; p <= hi; p++) if (pcs.includes((((p - tonic) % 12) + 12) % 12)) cands.push(p);
  if (!cands.length) return [];
  let out: number[];
  if (prev && prev.length === n) {
    const used = new Set<number>();
    out = prev.map((q) => {
      let best = cands[0];
      let bd = 1e9;
      for (const c of cands) {
        const d = Math.abs(c - q) + (used.has(c) ? 7 : 0);
        if (d < bd) { bd = d; best = c; }
      }
      used.add(best);
      return best;
    });
  } else {
    // close position from the bottom of the range, every pitch class first
    out = [];
    const seen = new Set<number>();
    for (const c of cands) {
      const pc = (((c - tonic) % 12) + 12) % 12;
      if (!seen.has(pc)) { seen.add(pc); out.push(c); }
      if (out.length === n) break;
    }
    let i = 0;
    while (out.length < n && i < cands.length) { if (!out.includes(cands[i])) out.push(cands[i]); i++; }
  }
  // every chord pitch class should sound when there are enough voices
  const pcsHeard = new Set(out.map((p) => (((p - tonic) % 12) + 12) % 12));
  if (n >= pcs.length) {
    for (const pc of pcs) {
      if (pcsHeard.has(pc)) continue;
      // replace a doubled voice with the missing tone, nearest octave
      const counts = new Map<number, number>();
      out.forEach((p) => counts.set((((p - tonic) % 12) + 12) % 12, (counts.get((((p - tonic) % 12) + 12) % 12) ?? 0) + 1));
      const k = out.findIndex((p) => (counts.get((((p - tonic) % 12) + 12) % 12) ?? 0) > 1);
      if (k < 0) break;
      const target = out[k];
      let best = target;
      let bd = 1e9;
      for (const c of cands) if ((((c - tonic) % 12) + 12) % 12 === pc && Math.abs(c - target) < bd) { bd = Math.abs(c - target); best = c; }
      out[k] = best;
      pcsHeard.add(pc);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Deterministic pseudo-random numbers (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
