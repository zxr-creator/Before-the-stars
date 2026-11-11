// Reads the off-world fields of an observation into what the Solar System layer draws. The
// engine does not send them yet (design chapters 37 and 39, slices 14–15); until it does, every
// site is unclaimed and unsurveyed, there are no stations or shipments and no boost, and nothing
// here is invented.
import type { BoostView, Observation, SeatId, SpaceSiteView, SpaceView, StationView, TransferView, WindowView } from '../protocol';
import type { BodyId } from './astro';
import { ORBIT_BY_KEY, SITES, SITE_BY_KEY, ZONE_BODY, type SiteDef } from './catalog';

export interface SiteState {
  def: SiteDef;
  view: SpaceSiteView | null;
  owner: SeatId | null;
  controller: SeatId | null;
  surveyed: boolean;
}

export interface TransferState {
  view: TransferView;
  from: BodyId;
  to: BodyId;
  /** 0 at departure, 1 on arrival. */
  progress: number;
}

export interface SpaceState {
  /** True when the observation carries any off-world field. */
  live: boolean;
  boost: BoostView | null;
  sites: SiteState[];
  siteByKey: Record<string, SiteState>;
  /** Stations by orbit key. */
  stations: Record<string, StationView[]>;
  transfers: TransferState[];
  windows: Record<string, WindowView>;
  /** Bodies to draw; null = all. */
  known: Set<string> | null;
}

/** The off-world view of an observation. Accepts `space`, or `solar` (chapter 37's draft name). */
export function spaceView(obs: Observation): SpaceView | null {
  const o = obs as Observation & { solar?: SpaceView | null };
  return obs.space ?? o.solar ?? null;
}

function siteDefFor(key: string): SiteDef | null {
  const k = key.trim().toLowerCase();
  if (SITE_BY_KEY[k]) return SITE_BY_KEY[k];
  const n = Number(k);
  if (Number.isInteger(n)) return SITES.find((s) => s.n === n) ?? null;
  return SITES.find((s) => s.name.toLowerCase() === k || s.key.replace(/_/g, ' ') === k) ?? null;
}

export function readSpace(obs: Observation): SpaceState {
  const sv = spaceView(obs);
  const views = new Map<string, SpaceSiteView>();
  for (const v of sv?.sites ?? []) {
    const def = v && typeof v.site === 'string' ? siteDefFor(v.site) : null;
    if (def) views.set(def.key, v);
  }
  const sites: SiteState[] = SITES.map((def) => {
    const v = views.get(def.key) ?? null;
    return { def, view: v, owner: v?.owner ?? null, controller: v?.controller ?? v?.owner ?? null, surveyed: !!v?.surveyed };
  });
  const stations: Record<string, StationView[]> = {};
  for (const st of sv?.stations ?? []) {
    if (!st || !ORBIT_BY_KEY[st.orbit]) continue;
    (stations[st.orbit] ??= []).push(st);
  }
  const transfers: TransferState[] = [];
  for (const tr of sv?.transfers ?? []) {
    const from = ZONE_BODY[tr?.from_zone ?? ''];
    const to = ZONE_BODY[tr?.to_zone ?? ''];
    if (!from || !to || from === to) continue;
    const span = Math.max(1, tr.arrives - tr.departed);
    transfers.push({ view: tr, from, to, progress: Math.min(1, Math.max(0, (obs.month - tr.departed) / span)) });
  }
  const windows: Record<string, WindowView> = {};
  for (const w of sv?.windows ?? []) if (w && typeof w.zone === 'string') windows[w.zone] = w;
  const boost = sv?.boost && Number.isFinite(sv.boost.stock) ? sv.boost : null;
  return {
    live: !!sv,
    boost,
    sites,
    siteByKey: Object.fromEntries(sites.map((s) => [s.def.key, s])),
    stations,
    transfers,
    windows,
    known: Array.isArray(sv?.known_bodies) ? new Set(sv!.known_bodies) : null,
  };
}

/** Whether a body is drawn for this seat (always the Sun, the Earth and its Moon). */
export function bodyKnown(state: SpaceState, id: BodyId): boolean {
  if (!state.known || id === 'sun' || id === 'earth' || id === 'moon') return true;
  return state.known.has(id);
}
