// Which music fits the moment: the era of the civilization on screen, how far it has come
// within that era, and whether it is at war. Pure functions of the store's state.
//
// Era. A future observation field `era` (a string) wins when present. Otherwise:
//   - the date: the historical year (`date.year`) where the referee keeps a calendar, else
//     the share of the match already played (month / horizon);
//   - the knowledge: the most advanced research class among the technologies the
//     civilization has understood (or prototyped, adopted) — craft, scholarly, scientific,
//     industrial, advanced, frontier map to the six eras in order.
//   The era is the knowledge era, but never more than one era behind the date (a lagging
//   people still lives in its century) and never behind the date at all when nothing is
//   understood yet.
// Intensity (0..1, how many layers of the ensemble play): how many of the current era's
// technologies are understood (against about how many the era has), or, without any, how
// far the date is through the era. A new civilization starts with a single layer; the
// ensemble fills in as the era's knowledge is gathered.
import type { AppState } from '../store';
import type { Observation, ResearchClass, SpectatorView } from '../protocol';
import type { EraKey } from './engine/score';

export const ERA_ORDER: EraKey[] = ['ancient', 'classical', 'earlyModern', 'industrial', 'modern', 'space'];
const CLASS_ERA: Record<ResearchClass, number> = { craft: 0, scholarly: 1, scientific: 2, industrial: 3, advanced: 4, frontier: 5 };
const KNOWN = new Set(['understood', 'prototyped', 'adopted']);
/** About how many technologies each research class holds in the catalogue (engine tiers 0-1, 2, 3, 4-5, 6-7, 8-9). */
const CLASS_SIZE = [32, 12, 7, 33, 30, 16];
/** First year of each era after the first (historical, negative = BC). */
const YEAR_BOUNDS = [-1000, 1500, 1750, 1950, 2150];
/** Without a calendar: the share of the horizon at which each era after the first begins. */
const SHARE_BOUNDS = [0.12, 0.3, 0.45, 0.6, 0.8];

export interface MusicTarget { mood: 'title' | 'peace' | 'war'; key: EraKey | 'title'; intensity: number }

/** An era named by the referee, if it sends one (any spelling of the usual names). */
export function eraFromName(name: unknown): EraKey | null {
  if (typeof name !== 'string') return null;
  const s = name.toLowerCase();
  if (/space|jump|interstellar|stellar|ftl|orbital|future/.test(s)) return 'space';
  if (/modern|information|atomic|digital|contemporary|ai\b/.test(s) && !/early/.test(s)) return 'modern';
  if (/industrial|steam|machine/.test(s)) return 'industrial';
  if (/early.?modern|renaissance|enlightenment|scientific|exploration/.test(s)) return 'earlyModern';
  if (/classical|medieval|middle|iron|antiquity|feudal/.test(s)) return 'classical';
  if (/ancient|bronze|neolithic|stone|prehistor/.test(s)) return 'ancient';
  return null;
}

interface DateInfo { era: number; progress: number }

function dateEra(month: number, horizon: number, year: number | null | undefined): DateInfo {
  if (typeof year === 'number' && Number.isFinite(year)) {
    let i = 0;
    while (i < YEAR_BOUNDS.length && year >= YEAR_BOUNDS[i]) i++;
    const lo = i === 0 ? -5000 : YEAR_BOUNDS[i - 1];
    const hi = i < YEAR_BOUNDS.length ? YEAR_BOUNDS[i] : 2500;
    return { era: i, progress: Math.max(0, Math.min(1, (year - lo) / (hi - lo))) };
  }
  const share = horizon > 0 ? Math.max(0, Math.min(1, month / horizon)) : 0;
  let i = 0;
  while (i < SHARE_BOUNDS.length && share >= SHARE_BOUNDS[i]) i++;
  const lo = i === 0 ? 0 : SHARE_BOUNDS[i - 1];
  const hi = i < SHARE_BOUNDS.length ? SHARE_BOUNDS[i] : 1;
  return { era: i, progress: Math.max(0, Math.min(1, (share - lo) / (hi - lo))) };
}

/** Era and intensity of one civilization's observation. */
export function eraOfObservation(obs: Observation): { key: EraKey; intensity: number } {
  const named = eraFromName((obs as unknown as { era?: unknown }).era);
  const d = dateEra(obs.month, obs.horizon, obs.date?.year);
  const techs = obs.knowledge?.techs ?? [];
  let best = -1;
  for (const c of techs) if (KNOWN.has(c.state)) best = Math.max(best, CLASS_ERA[c.class] ?? 0);
  let era: number;
  if (named) era = ERA_ORDER.indexOf(named);
  else if (best < 0) era = d.era;
  else era = Math.max(best, d.era - 1);
  // intensity: how many of this era's technologies are understood, against about how many
  // the era has (an observation lists only what the civilization knows of, so the total is
  // the catalogue's, approximately)
  const done = techs.filter((c) => (CLASS_ERA[c.class] ?? 0) === era && KNOWN.has(c.state)).length;
  const share = Math.min(1, done / CLASS_SIZE[era]);
  const intensity = done > 0 ? 0.15 + 0.85 * share : d.era === era ? d.progress : 0.2;
  return { key: ERA_ORDER[Math.max(0, Math.min(5, era))], intensity: Math.max(0, Math.min(1, intensity)) };
}

/** The world as an observer sees it: the most advanced civilization sets the era. */
export function eraOfWorld(sp: SpectatorView): { key: EraKey; intensity: number } {
  const named = eraFromName((sp as unknown as { era?: unknown }).era);
  const d = dateEra(sp.month, sp.horizon, sp.date?.year);
  if (named) return { key: named, intensity: d.progress };
  // highest_tier is the engine's tier (0..9) of the most advanced known technology; the
  // engine maps tiers to research classes as 0-1 craft, 2 scholarly, 3 scientific,
  // 4-5 industrial, 6-7 advanced, 8+ frontier
  const tier = Math.max(-1, ...sp.civs.map((c) => (Number.isFinite(c.highest_tier) ? c.highest_tier : -1)));
  const tierEra = tier < 0 ? -1 : tier <= 1 ? 0 : tier === 2 ? 1 : tier === 3 ? 2 : tier <= 5 ? 3 : tier <= 7 ? 4 : 5;
  const era = tierEra >= 0 ? Math.max(tierEra, d.era - 1) : d.era;
  return { key: ERA_ORDER[Math.max(0, Math.min(5, era))], intensity: era === d.era ? d.progress : 0.6 };
}

export function atWar(s: AppState): boolean {
  if (s.mode === 'observe' && s.viewAs === null) return !!s.spectator?.civs.some((c) => c.at_war_with?.length);
  const o = s.obs;
  if (!o) return false;
  return (o.diplomacy?.wars?.length ?? 0) > 0 || (o.others ?? []).some((x) => x.at_war);
}

/** What should play now, or null for silence. */
export function musicTarget(s: AppState, titleMusic: boolean): MusicTarget | null {
  const inMatch = s.boot === 'ready' && s.screen === 'game' && !!s.summary
    && (s.mode === 'observe' && s.viewAs === null ? !!s.spectator : !!s.obs);
  if (!inMatch) return titleMusic && s.boot !== 'closed' ? { mood: 'title', key: 'title', intensity: 1 } : null;
  const e = s.mode === 'observe' && s.viewAs === null ? eraOfWorld(s.spectator!) : eraOfObservation(s.obs!);
  return { mood: atWar(s) ? 'war' : 'peace', key: e.key, intensity: e.intensity };
}
