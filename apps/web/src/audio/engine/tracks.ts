// Extension point: recorded music. None ships with the game — the score is composed in
// code — but licensed or CC0 recordings can be added later without touching the engine.
//
// To add a recording:
//   1. Put the audio file (ogg, opus, mp3, m4a or wav) in apps/web/src/audio/tracks/.
//   2. Next to it put a JSON manifest with the same base name, for example
//      apps/web/src/audio/tracks/harvest-song.json:
//
//        {
//          "file": "harvest-song.ogg",
//          "title": "Harvest Song",
//          "credit": "Performer or composer, year",
//          "license": "CC0-1.0",            // or the licence you hold; keep the text in docs
//          "source": "https://…",           // where it came from
//          "eras": ["ancient", "classical"],// any of ancient classical earlyModern industrial
//                                           // modern space, or "title"; omit for all
//          "moods": ["peace"],              // "title", "peace", "war"; omit for peace
//          "mix": "replace",                // "replace": played instead of a composed piece
//                                           // "layer": played under the composed piece
//          "weight": 1,                     // how often it is chosen against composed pieces
//          "gainDb": -3                     // level trim
//        }
//
// Vite bundles the files found there; when the folder is empty (as shipped) nothing is
// added to the build. A recording is chosen in place of a composed piece with
// probability weight / (weight + 1); its credit belongs in docs and in the almanac.
import type { Mood } from './arrange';
import type { ScoreKey } from './score';

export interface RecordedTrack {
  url: string;
  title: string;
  credit: string;
  license: string;
  eras: ScoreKey[] | null;
  moods: Mood[];
  mix: 'replace' | 'layer';
  weight: number;
  gainDb: number;
}

interface Manifest {
  file: string; title?: string; credit?: string; license?: string; source?: string;
  eras?: ScoreKey[]; moods?: Mood[]; mix?: 'replace' | 'layer'; weight?: number; gainDb?: number;
}

const manifests = import.meta.glob('../tracks/*.json', { eager: true, import: 'default' }) as Record<string, Manifest>;
const files = import.meta.glob('../tracks/*.{ogg,opus,mp3,m4a,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const RECORDED_TRACKS: RecordedTrack[] = Object.values(manifests).flatMap((m) => {
  const url = files[`../tracks/${m.file}`];
  if (!url || !m.license) return [];
  return [{
    url, title: m.title ?? m.file, credit: m.credit ?? '', license: m.license,
    eras: m.eras?.length ? m.eras : null, moods: m.moods?.length ? m.moods : ['peace'],
    mix: m.mix === 'layer' ? 'layer' : 'replace', weight: m.weight ?? 1, gainDb: m.gainDb ?? 0,
  }];
});

/** A recording for this era and mood, or null to play the composed score. */
export function pickRecording(key: ScoreKey, mood: Mood, roll: number): RecordedTrack | null {
  const fit = RECORDED_TRACKS.filter((x) => (!x.eras || x.eras.includes(key)) && x.moods.includes(mood));
  if (!fit.length) return null;
  const w = fit.reduce((s, x) => s + x.weight, 0);
  if (roll * (w + 1) >= w) return null;
  let acc = 0;
  for (const x of fit) { acc += x.weight; if (roll * (w + 1) < acc) return x; }
  return fit[fit.length - 1];
}
