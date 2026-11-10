// Client-side history for the observer's comparison charts. The referee's
// spectator view is a snapshot of the present, so the console keeps one sample
// per round it has watched: a few numbers per civilization, bounded in size,
// kept across perspective switches (it lives outside any component) and across
// a page reload (session storage). Nothing here is ever recorded in a match
// with a human seat: samples are only taken from `state.spectator`, which the
// store fills in observer matches alone.
import { useEffect, useState } from 'preact/hooks';
import type { Good, SeatId, SpectatorCiv, SpectatorView } from '../protocol';
import { GOVERNANCE_MONTHS, FTL_MONTHS } from '../protocol';
import { getState, subscribe } from '../store';

export type MetricKey =
  | 'population' | 'regions' | 'techs' | 'stability' | 'food' | 'works' | 'goods' | 'research' | 'soldiers' | 'objective';

/** Order of the values stored for each civilization in a sample. */
export const METRIC_KEYS: MetricKey[] = [
  'population', 'regions', 'techs', 'stability', 'food', 'works', 'goods', 'research', 'soldiers', 'objective',
];

/** Months of food in store are capped for the charts: one hoard must not flatten the rest. */
export const FOOD_CAP_MONTHS = 60;

/** Goods that are grown, gathered or dug rather than made. */
const RAW: Good[] = ['food', 'materials', 'copper_ore', 'iron_ore', 'coal', 'crude', 'minerals'];

export interface Sample {
  round: number;
  month: number;
  /** `Date.now()` when the sample was taken (for the rounds-per-second read-out); 0 when restored from storage. */
  at: number;
  /** values[civ index][metric index], in `History.seats` and `METRIC_KEYS` order. */
  values: number[][];
}

export interface History {
  matchId: string;
  seats: SeatId[];
  samples: Sample[];
}

/** One sample per round fits a standard 240-round match; anything longer is thinned. */
export const MAX_SAMPLES = 320;
const STORE_KEY = 'bts.observer.history';

let history: History = { matchId: '', seats: [], samples: [] };
let version = 0;
const listeners = new Set<() => void>();
let lastSeen: SpectatorView | null = null;
let saveTimer = 0;

/** Share of the road to the final objective, 0–100: three milestones and the two streaks of the victory contract. */
export function objectiveProgress(c: SpectatorCiv): number {
  const steps = (c.sci_method !== null ? 1 : 0) + (c.planetary !== null ? 1 : 0) + (c.interstellar !== null ? 1 : 0)
    + Math.min(1, c.gov_streak / GOVERNANCE_MONTHS) + Math.min(1, c.ftl_streak / FTL_MONTHS);
  return (steps / 5) * 100;
}

/** The numbers kept for one civilization, in `METRIC_KEYS` order. */
export function measure(c: SpectatorCiv, works: number): number[] {
  let made = 0;
  for (const g of c.goods) if (!RAW.includes(g.good)) made += g.amount;
  return [
    c.population,
    c.regions,
    c.understood,
    c.stability,
    Math.min(FOOD_CAP_MONTHS, c.food_months_milli / 1000),
    works,
    made / 1000,
    c.research_capacity / 1000,
    c.soldiers,
    objectiveProgress(c),
  ];
}

/** Built facility levels per owner, from the regions the referee shows a spectator. */
export function worksBySeat(sp: SpectatorView): Map<SeatId, number> {
  const out = new Map<SeatId, number>();
  for (const r of sp.regions) {
    if (!r.own || r.owner === null) continue;
    let n = 0;
    for (const f of r.own.facilities) n += f.level;
    out.set(r.owner, (out.get(r.owner) ?? 0) + n);
  }
  return out;
}

export function sampleOf(sp: SpectatorView, seats: SeatId[], at: number): Sample {
  const works = worksBySeat(sp);
  return {
    round: sp.round,
    month: sp.month,
    at,
    values: seats.map((seat) => {
      const c = sp.civs.find((x) => x.seat === seat);
      return c ? measure(c, works.get(seat) ?? 0) : METRIC_KEYS.map(() => 0);
    }),
  };
}

/** Drop every other sample of the older half, keeping the first one (the start of the record). */
function thin(samples: Sample[]): Sample[] {
  const half = Math.floor(samples.length / 2);
  const out: Sample[] = [];
  for (let i = 0; i < samples.length; i++) if (i >= half || i % 2 === 0) out.push(samples[i]);
  return out;
}

function restore(matchId: string): Sample[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as { matchId?: string; metrics?: string; samples?: [number, number, number[][]][] };
    if (saved.matchId !== matchId || saved.metrics !== METRIC_KEYS.join(',') || !Array.isArray(saved.samples)) return [];
    return saved.samples.map(([round, month, values]) => ({ round, month, at: 0, values }));
  } catch {
    return [];
  }
}

function writeNow(): void {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = 0;
  if (!history.matchId) return;
  try {
    const round2 = (v: number) => Math.round(v * 100) / 100;
    sessionStorage.setItem(STORE_KEY, JSON.stringify({
      matchId: history.matchId,
      metrics: METRIC_KEYS.join(','),
      samples: history.samples.map((s) => [s.round, s.month, s.values.map((row) => row.map(round2))]),
    }));
  } catch {
    /* storage unavailable or full: the record simply lasts for this page */
  }
}

/** Writes are batched: at full speed a round arrives many times a second. */
function persist(): void {
  if (!saveTimer) saveTimer = window.setTimeout(writeNow, 1200);
}

/** Add (or refresh) the sample for the snapshot's round. Exported for tests; the store subscription calls it. */
export function record(sp: SpectatorView, now = Date.now()): void {
  const seats = sp.civs.map((c) => c.seat);
  if (sp.match_id !== history.matchId) {
    const kept = restore(sp.match_id).filter((s) => s.round <= sp.round && s.values.length === seats.length);
    history = { matchId: sp.match_id, seats, samples: kept };
  }
  let samples = history.samples;
  const last = samples[samples.length - 1];
  const next = sampleOf(sp, history.seats, now);
  if (last && last.round === sp.round) {
    next.at = last.at || now;
    samples = [...samples.slice(0, -1), next];
  } else {
    // A loaded earlier save of the same match rewinds the record.
    if (last && last.round > sp.round) samples = samples.filter((s) => s.round < sp.round);
    samples = [...samples, next];
    while (samples.length > MAX_SAMPLES) samples = thin(samples);
  }
  history = { ...history, samples };
  version++;
  persist();
  listeners.forEach((l) => l());
}

export function getHistory(): History {
  return history;
}

/** Rounds per second over the last few seconds of watching, or null when time is not moving. */
export function recentRate(h: History, now = Date.now(), windowMs = 12000): number | null {
  const recent = h.samples.filter((s) => s.at > 0 && now - s.at <= windowMs);
  if (recent.length < 2) return null;
  const a = recent[0], b = recent[recent.length - 1];
  const dt = (b.at - a.at) / 1000;
  if (dt < 0.2 || b.round <= a.round) return null;
  return (b.round - a.round) / dt;
}

export function useHistory(): History {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(version);
    listeners.add(l);
    l();
    return () => { listeners.delete(l); };
  }, []);
  return history;
}

// Nothing waits in memory when the page is left or reloaded.
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (saveTimer) writeNow(); });

// Follow the store: every new spectator snapshot of an observer match is sampled once.
subscribe(() => {
  const s = getState();
  if (s.mode !== 'observe' || !s.spectator || s.spectator === lastSeen) return;
  lastSeen = s.spectator;
  record(s.spectator);
});
