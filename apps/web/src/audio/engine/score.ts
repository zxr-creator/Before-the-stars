// The written score: one main theme for the whole game and, for every era, its own
// harmonization of that theme plus two era themes. All melodies are original.
//
// The main theme ("Before the Stars") is a rising fifth that reaches up and settles —
// people looking up at the sky. Its first two bars (1 5 | 4 3 4 5) are the leitmotif:
// the era themes quote it, every coda closes on it, and the stings are built from it.
// Every era plays the same degrees in its own mode, register, tempo and orchestration,
// so a player hears one melody grow up with their civilization. War keeps the theme but
// moves it to a darker mode on the same tonic, lower and faster, over percussion.
//
// Notation: see theory.ts. All themes are eight bars of 4/4.
import type { ModeName } from './theory';

export type EraKey = 'ancient' | 'classical' | 'earlyModern' | 'industrial' | 'modern' | 'space';
export type ScoreKey = EraKey | 'title';
export const ERAS: EraKey[] = ['ancient', 'classical', 'earlyModern', 'industrial', 'modern', 'space'];

export interface Theme { chords: string; melody: string }

export interface EraScore {
  /** MIDI note of scale degree 1 in the melody's octave. */
  tonic: number;
  mode: ModeName;
  /** The same tonic, darker: the mode of the war arrangement. */
  warMode: ModeName;
  bpm: number;
  warBpm: number;
  /** The main theme in this era: its harmonization (and, rarely, a melodic variant). */
  main: Theme;
  themes: [Theme, Theme];
  /** Chords under the closing leitmotif "1:2 5:2 | 4 3 2:2 | 1:4". */
  coda: string;
  /** Seconds of rest between pieces [min, max]. */
  rest: [number, number];
  /** Reverb send and echo send of the whole piece. */
  reverb: number;
  echo: number;
  /** Loudness trims (linear) for peace and war, calibrated from the offline renders
   *  (scripts/music-render.mjs) so every era and mood sits near the same loudness. */
  gain: number;
  warGain: number;
}

export const MAIN_MELODY = "1:2 5:2 | 4 3 4 5 | 7:2 6 5 | 5:4 | 5:1.5 6:0.5 7:2 | 2':1.5 1':0.5 7:2 | 6 4 5:1.5 7,:0.5 | 1:4";
export const CODA_MELODY = '1:2 5:2 | 4 3 2:2 | 1:4';

export const SCORES: Record<ScoreKey, EraScore> = {
  // Title: the main theme in its home mode, D Dorian, with every colour of the game at once.
  title: {
    tonic: 74, mode: 'dorian', warMode: 'aeolian', bpm: 64, warBpm: 64,
    main: { chords: '1 | 7 | 4 | 5 | 3 | 7 | 4-5 | 1', melody: MAIN_MELODY },
    themes: [
      { chords: '3 | 7 | 4 | 1 | 3 | 7 | 4-5 | 1', melody: "5 7 3':2 | 2':2 7 4 | 6:2 1' 6 | 5:4 | 3':1.5 2':0.5 1' 7 | 7:2 4:2 | 6 5 5 7 | 1':4" },
      { chords: '3 | 7 | 4 | 1 | 3 | 7 | 4-5 | 1', melody: "5 7 3':2 | 2':2 7 4 | 6:2 1' 6 | 5:4 | 3':1.5 2':0.5 1' 7 | 7:2 4:2 | 6 5 5 7 | 1':4" },
    ],
    coda: '1 | 7-5 | 1', rest: [6, 9], reverb: 0.5, echo: 0.12, gain: 0.877, warGain: 1,
  },
  // Antiquity: D Dorian over a drone; the harmony barely moves (open fifths).
  ancient: {
    tonic: 62, mode: 'dorian', warMode: 'phrygian', bpm: 62, warBpm: 74,
    main: { chords: '1.5 | 1.5 | 1.5 | 5.5 | 1.5 | 7.5 | 1.5 | 1.5', melody: MAIN_MELODY },
    themes: [
      {
        chords: '1.5 | 1.5 | 1.5 | 1.5 | 1.5 | 7.5 | 1.5 | 1.5',
        melody: '5:1.5 4:0.5 5 6 | 5 4:0.5 3:0.5 4:2 | 3 2 3 4 | 2 1:3 | 1 3 5:1.5 6:0.5 | 7:2 6 5 | 4 5:0.5 4:0.5 3 2 | 1:4',
      },
      {
        chords: '7.5 | 7.5 | 7.5 | 7.5 | 1.5 | 1.5 | 1.5 | 1.5',
        melody: '7,:1 2 4:2 | 3:1.5 2:0.5 7,:2 | 2 4 5 4:0.5 3:0.5 | 2:4 | 1:2 5:2 | 4 3 4 5 | 3 2 1 7, | 1:4',
      },
    ],
    coda: '1.5 | 1.5 | 1.5', rest: [7, 12], reverb: 0.42, echo: 0, gain: 0.924, warGain: 1.38,
  },
  // Classical antiquity to the high middle ages: A Dorian, chant with organum, harp, vielle.
  classical: {
    tonic: 57, mode: 'dorian', warMode: 'phrygian', bpm: 66, warBpm: 76,
    main: { chords: '1 | 7 | 4 | 5 | 3 | 7 | 4-5 | 1', melody: MAIN_MELODY },
    themes: [
      { chords: '1 | 7 | 1 | 5 | 1 | 4 | 7 | 1', melody: '1:2 3:2 | 2:2 7,:2 | 1 2 3:2 | 2:4 | 5:2 3:2 | 4:2 6:2 | 4 3 2:2 | 1:4' },
      { chords: '3 | 7 | 4 | 1 | 1 | 7 | 5 | 1', melody: "5:2 3 5 | 7:2 6 5 | 6:2 4:2 | 5:4 | 1:2 5:2 | 4 3 4 5 | 2' 1' 7:2 | 1':4" },
    ],
    coda: '1 | 7-5 | 1', rest: [6, 11], reverb: 0.5, echo: 0, gain: 1.057, warGain: 1.2,
  },
  // Early modern: G major, continuo and counterpoint (harpsichord, cello, a duet of winds and strings).
  earlyModern: {
    tonic: 67, mode: 'ionian', warMode: 'aeolian', bpm: 80, warBpm: 92,
    main: { chords: '1 | 4 | 3 | 5 | 3 | 5 | 4-5 | 1', melody: MAIN_MELODY },
    themes: [
      { chords: '1 | 6 | 4 | 5 | 1 | 6 | 2-5 | 1', melody: "3:1.5 2:0.5 1 5 | 6:1.5 5:0.5 3:2 | 4 6 1':2 | 7:1.5 6:0.5 5:2 | 3 4:0.5 5:0.5 1':2 | 6 7:0.5 1':0.5 6:2 | 4 2 7, 2 | 1:4" },
      { chords: '6 | 3 | 4 | 1 | 2 | 5 | 1 | 5.7', melody: "3':1.5 2':0.5 1':2 | 7:1.5 6:0.5 5:2 | 6 1':2 6 | 5:1.5 4:0.5 3:2 | 4 6 2':2 | 1':2 7 5 | 1:2 5:2 | 4 3 4 5" },
    ],
    coda: '1 | 4-5 | 1', rest: [5, 9], reverb: 0.36, echo: 0, gain: 0.924, warGain: 1.38,
  },
  // Industrial: C minor, romantic orchestra — piano, strings, horns, timpani.
  industrial: {
    tonic: 60, mode: 'aeolian', warMode: 'phrygian', bpm: 70, warBpm: 84,
    main: { chords: '1 | 4 | 3 | 5.M | 3 | 7 | 4-5.M | 1', melody: "1:2 5:2 | 4 3 4 5 | 7:2 6 5 | 5:4 | 5:1.5 6:0.5 7:2 | 2':1.5 1':0.5 7:2 | 6 4 5:1.5 #7,:0.5 | 1:4" },
    themes: [
      { chords: '1 | 6 | 4 | 5.M | 1 | 6 | 4-5.M | 1', melody: "1 3 5:2 | 6:2 5 3 | 4:1.5 3:0.5 4 6 | 5:2 2 #7, | 1 3 5 1' | 3':2 2' 1' | 6 4 2 #7, | 1:4" },
      { chords: '3 | 7 | 4 | 5.M | 6.7 | 4 | 2 | 5.M', melody: '5 3 5 7 | 4:2 2:2 | 3 4 6:2 | 5:4 | 1:2 5:2 | 4 3 4 5 | 6:2 4:2 | 5:2 #7,:2' },
    ],
    coda: '1 | 4-5.M | 1', rest: [6, 10], reverb: 0.4, echo: 0, gain: 1.392, warGain: 1.2,
  },
  // Modern and information age: F major with sevenths and ninths; electric piano, pulses, strings.
  modern: {
    tonic: 65, mode: 'ionian', warMode: 'aeolian', bpm: 92, warBpm: 104,
    main: { chords: '1.7 | 4.7 | 3.7 | 6.7 | 1.7 | 3.7 | 4.7-5 | 1.9', melody: MAIN_MELODY },
    themes: [
      { chords: '1.7 | 6.7 | 4.7 | 5 | 1.9 | 3.7 | 4.7 | 5.s4', melody: "3:1.5 5:1.5 7 | 6:1.5 5:1.5 3 | 4:1.5 6:1.5 1' | 7:2 r 5 | 3:1.5 5:1.5 2' | 2':1.5 7:1.5 5 | 6:1.5 4:1.5 3 | 2:2 1:2" },
      { chords: '6.7 | 4.7 | 1.9 | 4.9 | 2.7 | 5 | 1.7 | 1.9', melody: "5:2 6 1' | 1':2 6:2 | 1:2 5:2 | 4 3 4 5 | 2':2 1' 6 | 7:2 5:2 | 3 5 7 2' | 1':4" },
    ],
    coda: '1.9 | 4.7-5 | 1.9', rest: [5, 9], reverb: 0.38, echo: 0.22, gain: 1.085, warGain: 1.15,
  },
  // Space and the jump: E Lydian, slow, luminous; glass pads, bells, a voice of pure tone.
  space: {
    tonic: 64, mode: 'lydian', warMode: 'aeolian', bpm: 56, warBpm: 64,
    main: { chords: '1.7 | 2/1 | 3 | 6.7 | 1.7 | 5 | 2-5 | 1.9', melody: MAIN_MELODY },
    themes: [
      { chords: '1.7 | 2/1 | 3 | 2 | 6.7 | 3 | 5 | 1.9', melody: "5:3 3 | 4:2 6:2 | 5:2 7:2 | 6:4 | 6:2 1':2 | 7:3 5 | 2':2 7 5 | 1':4" },
      { chords: '6.7 | 2 | 1.7 | 5.s4 | 6.9 | 3 | 2/1 | 1.9', melody: '1:2 5:2 | 4 3 4 5 | 3:4 | 2:2 5,:2 | 6:2 5:2 | 7:2 5:2 | 6:2 4:2 | 5:4' },
    ],
    coda: '1.9 | 2-5 | 1.9', rest: [8, 13], reverb: 0.62, echo: 0.3, gain: 0.82, warGain: 0.716,
  },
};
