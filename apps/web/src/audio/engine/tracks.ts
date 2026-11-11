// Recorded music: public-domain and CC0 recordings, chosen per era and mood.
//
// The catalogue is apps/web/src/audio/tracks/tracks.json (one entry per recording, with
// its licence as stated on its source page; CREDITS.md beside it is the human-readable
// copy). The audio files sit in the same folder as Opus-in-WebM, loudness-normalised to
// about -18 LUFS. Vite emits them as separate static assets addressed relative to the
// script that loads them (base './'), so they work from any subpath; only their URLs are
// in this chunk, and each file is fetched when it is about to play (see recordings.ts).
//
// To add a recording: put the .webm next to tracks.json and add an entry; an entry whose
// file is missing, or which has no licence, is ignored.
//
//   eras     any of ancient classical earlyModern industrial modern space, or "title"
//   moods    "title", "peace", "war"
//   weight   relative chance against the other recordings that fit (default 1)
//   gainDb   level trim on top of the normalisation (default 0)
import type { Mood } from './arrange';
import type { ScoreKey } from './score';

export interface TrackInfo {
  id: string;
  file: string;
  title: string;
  composer: string;
  performer: string;
  eras: ScoreKey[];
  moods: Mood[];
  weight?: number;
  gainDb?: number;
  duration: number;
  excerpt?: string;
  license: string;
  licenseText: string;
  source: string;
  retrieved: string;
  note: string;
}

export interface RecordedTrack extends TrackInfo {
  url: string;
  weight: number;
  gainDb: number;
}

const catalogue = Object.values(import.meta.glob('../tracks/tracks.json', { eager: true, import: 'default' }))[0] ?? [];
const files = import.meta.glob('../tracks/*.{webm,ogg,opus}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const RECORDED_TRACKS: RecordedTrack[] = (catalogue as TrackInfo[]).flatMap((m) => {
  const url = files[`../tracks/${m.file}`];
  if (!url || !m.license) return [];
  return [{ ...m, url, weight: m.weight ?? 1, gainDb: m.gainDb ?? 0 }];
});

/** The recordings that fit this era and mood. */
export function fitting(key: ScoreKey, mood: Mood, skip?: (t: RecordedTrack) => boolean): RecordedTrack[] {
  return RECORDED_TRACKS.filter((x) => x.eras.includes(key) && x.moods.includes(mood) && !skip?.(x));
}
