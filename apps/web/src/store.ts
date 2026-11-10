// A small hand-written store: one state object, explicit actions, and a hook.
// All game data comes from the server's permission-filtered Observation; the
// store only adds interface state (open panel, selection, toasts).
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError, rememberTokens } from './api';
import type {
  Action, MatchSummary, NewMatchRequest, Observation, Receipt, RegionId, SeatId,
} from './protocol';
import { fmtYear } from './format';

export type PanelKey =
  | 'briefing' | 'economy' | 'projects' | 'people' | 'knowledge' | 'culture' | 'politics'
  | 'diplomacy' | 'military' | 'objectives' | 'chronicle';

export const PANEL_ORDER: PanelKey[] = [
  'briefing', 'economy', 'projects', 'people', 'knowledge', 'culture', 'politics', 'diplomacy', 'military',
  'objectives', 'chronicle',
];
export const PANEL_TITLE: Record<PanelKey, string> = {
  briefing: 'Briefing', economy: 'Economy', projects: 'Projects', people: 'People & education',
  knowledge: 'Knowledge', culture: 'Culture', politics: 'Politics', diplomacy: 'Diplomacy', military: 'Military',
  objectives: 'Objectives', chronicle: 'Chronicle',
};

export interface Toast {
  id: number;
  tone: 'ok' | 'bad' | 'info' | 'moment';
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
  sticky?: boolean;
}

export interface MapPickState {
  prompt: string;
  targets: RegionId[] | null;
  onPick: (id: RegionId) => void;
}

/** A request from one part of the interface to open a flow in a panel. */
export type Intent =
  | { kind: 'build'; region?: RegionId }
  | { kind: 'survey'; region?: RegionId }
  | { kind: 'settle'; from?: RegionId; to?: RegionId }
  | { kind: 'resettle'; from?: RegionId }
  | { kind: 'study' }
  | { kind: 'recruit'; region?: RegionId }
  | { kind: 'program'; region?: RegionId }
  | { kind: 'tech'; handle: string }
  | { kind: 'knowledge-view'; view: 'frontier' | 'graph' | 'implementation' | 'history' }
  | { kind: 'counterpart'; seat: SeatId }
  | { kind: 'moment'; id: number };

export interface ActionResult {
  tag: string;
  at: number;
  receipts: Receipt[];
  error: string | null;
}

export interface AppState {
  boot: 'loading' | 'ready' | 'unreachable';
  bootError: string | null;
  summary: MatchSummary | null;
  obs: Observation | null;
  seat: SeatId;
  screen: 'setup' | 'game';
  panel: PanelKey | null;
  intent: (Intent & { nonce: number }) | null;
  selectedRegion: RegionId | null;
  pick: MapPickState | null;
  marked: RegionId[];
  focus: { region: RegionId; nonce: number } | null;
  busy: boolean;
  advancing: boolean;
  offline: boolean;
  toasts: Toast[];
  lastResult: ActionResult | null;
  /** Highest chronicle entry id the player has already been shown. */
  chronicleSeen: number;
  /** Chronicle ids that arrived with the latest round (badge on the strip). */
  freshMoments: number[];
  resultDismissed: boolean;
  /** Hot-seat: the seat that should take the device next. */
  handover: SeatId | null;
  menuOpen: boolean;
  saves: string[];
  /** The drawer is widened (knowledge graph, long tables). */
  wide: boolean;
}

const initial: AppState = {
  boot: 'loading',
  bootError: null,
  summary: null,
  obs: null,
  seat: 0,
  screen: 'setup',
  panel: 'briefing',
  intent: null,
  selectedRegion: null,
  pick: null,
  marked: [],
  focus: null,
  busy: false,
  advancing: false,
  offline: false,
  toasts: [],
  lastResult: null,
  chronicleSeen: -1,
  freshMoments: [],
  resultDismissed: false,
  handover: null,
  menuOpen: false,
  saves: [],
  wide: false,
};

let state: AppState = initial;
const listeners = new Set<() => void>();
let nonce = 1;
let toastId = 1;

export function getState(): AppState {
  return state;
}

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useApp(): AppState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => (n + 1) | 0);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}

// --- toasts ------------------------------------------------------------------

const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function toast(t: Omit<Toast, 'id'>, ms = 5200): number {
  const id = toastId++;
  // Keep the stack short: newest five.
  set({ toasts: [...state.toasts.slice(-4), { ...t, id }] });
  if (!t.sticky) setTimeout(() => dismissToast(id), reducedMotion ? ms + 2000 : ms);
  return id;
}

export function dismissToast(id: number): void {
  if (state.toasts.some((t) => t.id === id)) set({ toasts: state.toasts.filter((t) => t.id !== id) });
}

function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function noteNetwork(e: unknown): void {
  const offline = e instanceof ApiError && e.network;
  if (offline !== state.offline) set({ offline });
}

// --- boot and refresh ----------------------------------------------------------

function humanSeats(summary: MatchSummary | null): SeatId[] {
  return (summary?.seats ?? []).filter((s) => s.controller === 'human').map((s) => s.seat);
}

function pickSeat(summary: MatchSummary, preferred: SeatId | null): SeatId {
  const humans = humanSeats(summary);
  if (preferred !== null && humans.includes(preferred)) return preferred;
  const waiting = (summary.waiting_on ?? []).find((s) => humans.includes(s));
  if (waiting !== undefined) return waiting;
  return humans[0] ?? summary.seats?.[0]?.seat ?? 0;
}

const SEEN_KEY = (matchId: string, seat: SeatId) => `bts.seen.${matchId}.${seat}`;

function loadSeen(matchId: string, seat: SeatId): number {
  try {
    const v = sessionStorage.getItem(SEEN_KEY(matchId, seat));
    return v === null ? -1 : Number(v);
  } catch {
    return -1;
  }
}

function storeSeen(matchId: string, seat: SeatId, id: number): void {
  try {
    sessionStorage.setItem(SEEN_KEY(matchId, seat), String(id));
  } catch {
    /* storage unavailable: the badge simply reappears */
  }
}

export async function boot(): Promise<void> {
  set({ boot: 'loading', bootError: null });
  try {
    const summary = await api.match();
    void refreshSaves();
    if (!summary.exists) {
      set({ boot: 'ready', summary, obs: null, screen: 'setup', offline: false });
      return;
    }
    await enterMatch(summary, null);
    set({ boot: 'ready', offline: false });
  } catch (e) {
    set({ boot: 'unreachable', bootError: describeError(e) });
  }
}

async function enterMatch(summary: MatchSummary, preferred: SeatId | null): Promise<void> {
  rememberTokens(summary);
  const seat = pickSeat(summary, preferred);
  const obs = await api.observation(seat);
  const seenStored = loadSeen(obs.match_id, seat);
  const maxId = obs.chronicle.reduce((m, c) => Math.max(m, c.id), -1);
  // First time we meet this match in this browser session: nothing is "new".
  const seen = seenStored < 0 ? maxId : seenStored;
  storeSeen(obs.match_id, seat, seen);
  set({
    summary, obs, seat, screen: 'game', panel: 'briefing', selectedRegion: null, pick: null, marked: [],
    intent: null, lastResult: null, chronicleSeen: seen,
    freshMoments: obs.chronicle.filter((c) => c.id > seen).map((c) => c.id),
    resultDismissed: false, handover: null, menuOpen: false,
    focus: { region: obs.civ.capital, nonce: nonce++ },
  });
}

/** Refetch match summary and observation for the current seat. */
export async function refresh(): Promise<void> {
  try {
    const summary = await api.match();
    if (!summary.exists) {
      set({ summary, obs: null, screen: 'setup', offline: false });
      return;
    }
    rememberTokens(summary);
    const obs = await api.observation(state.seat);
    applyObservation(summary, obs);
    if (state.offline) set({ offline: false });
  } catch (e) {
    noteNetwork(e);
    throw e;
  }
}

function applyObservation(summary: MatchSummary, obs: Observation): void {
  const prev = state.obs;
  const sameMatch = prev && prev.match_id === obs.match_id && prev.seat === obs.seat;
  const patch: Partial<AppState> = { summary, obs };
  if (sameMatch && obs.round !== prev.round) {
    // A round resolved: default back to the briefing and announce new moments quietly.
    const fresh = obs.chronicle.filter((c) => c.id > state.chronicleSeen);
    patch.freshMoments = fresh.map((c) => c.id);
    patch.panel = state.panel === 'chronicle' ? 'chronicle' : 'briefing';
    patch.pick = null;
    patch.lastResult = null;
    set(patch);
    for (const c of fresh.slice(-3)) {
      toast({
        tone: 'moment',
        title: c.title,
        detail: `${fmtYear(c.month)} · added to the chronicle`,
        action: { label: 'View', run: () => openPanel('chronicle', { kind: 'moment', id: c.id }) },
      }, 9000);
    }
    if (fresh.length > 3) {
      toast({ tone: 'moment', title: `${fresh.length - 3} more moments recorded`, action: { label: 'Chronicle', run: () => openPanel('chronicle') } }, 9000);
    }
    return;
  }
  set(patch);
}

export function markChronicleSeen(): void {
  const obs = state.obs;
  if (!obs) return;
  const maxId = obs.chronicle.reduce((m, c) => Math.max(m, c.id), -1);
  if (maxId > state.chronicleSeen) {
    storeSeen(obs.match_id, obs.seat, maxId);
    set({ chronicleSeen: maxId });
  }
}

export function clearFreshMoments(): void {
  if (state.freshMoments.length) set({ freshMoments: [] });
}

// --- game actions --------------------------------------------------------------

/**
 * Submit actions for the current seat. Rejections are always surfaced: as a
 * toast, and through `lastResult` so the originating control can show the
 * reason inline (see <ActionNote tag>).
 */
export async function act(actions: Action | Action[], tag = 'general', opts: { quiet?: boolean } = {}): Promise<Receipt[]> {
  const list = Array.isArray(actions) ? actions : [actions];
  if (!list.length || state.busy) return [];
  set({ busy: true });
  let receipts: Receipt[] = [];
  let error: string | null = null;
  try {
    const res = await api.actions(state.seat, list);
    receipts = res.receipts;
    if (state.offline) set({ offline: false });
  } catch (e) {
    noteNetwork(e);
    error = describeError(e);
  }
  const rejected = receipts.filter((r) => r.status !== 'accepted' && r.status !== 'applied');
  const accepted = receipts.filter((r) => r.status === 'accepted' || r.status === 'applied');
  if (error) toast({ tone: 'bad', title: 'Order not sent', detail: error }, 8000);
  for (const r of rejected) toast({ tone: 'bad', title: 'Not accepted', detail: capitalize(r.reason) }, 8000);
  if (!opts.quiet && accepted.length && !rejected.length && !error) {
    const last = accepted[accepted.length - 1];
    toast({ tone: 'ok', title: accepted.length > 1 ? `${accepted.length} orders accepted` : 'Accepted', detail: last.reason }, 3600);
  }
  set({ lastResult: { tag, at: Date.now(), receipts, error } });
  try {
    await refresh();
  } catch (e) {
    /* refresh failure is shown through the offline banner */
  }
  set({ busy: false });
  return receipts;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Mark this seat done with the phase (`through=false`) or the whole round. */
export async function ready(through: boolean): Promise<void> {
  if (state.advancing || state.busy) return;
  set({ advancing: true });
  try {
    const before = state.summary;
    const summary = await api.ready(state.seat, through);
    rememberTokens(summary);
    const obs = await api.observation(state.seat);
    applyObservation(summary, obs);
    if (state.offline) set({ offline: false });
    const humans = humanSeats(summary);
    const waiting = (summary.waiting_on ?? []).filter((s) => s !== state.seat);
    const advanced = before && (before.round !== summary.round || before.phase !== summary.phase || before.window !== summary.window);
    if (!summary.finished && !advanced && waiting.length) {
      const nextHuman = waiting.find((s) => humans.includes(s));
      if (nextHuman !== undefined && humans.length > 1) set({ handover: nextHuman });
      else toast({ tone: 'info', title: 'Waiting for other seats', detail: waiting.map((s) => seatName(s)).join(', ') + ' have not finished this phase yet.' });
    } else if (!summary.finished && advanced && humans.length > 1) {
      // Everyone was ready and time moved on; the next human to act takes over.
      const nextHuman = (summary.waiting_on ?? []).find((s) => humans.includes(s));
      if (nextHuman !== undefined && nextHuman !== state.seat) set({ handover: nextHuman });
    }
  } catch (e) {
    noteNetwork(e);
    toast({ tone: 'bad', title: 'Could not advance', detail: describeError(e) }, 8000);
  }
  set({ advancing: false });
}

export function seatName(seat: SeatId): string {
  const s = state.summary?.seats?.find((x) => x.seat === seat);
  return s?.name ?? `Seat ${seat + 1}`;
}

/** Poll while this seat is waiting on others, so external seats can move the match. */
export async function pollWhileWaiting(): Promise<void> {
  const { obs, summary, advancing, busy, screen } = state;
  if (screen !== 'game' || !obs || !summary || advancing || busy || !obs.ready || obs.phase === 'finished') {
    if (state.offline && !advancing && !busy) {
      try {
        await refresh();
      } catch {
        /* still offline */
      }
    }
    return;
  }
  try {
    const s = await api.match();
    if (s.exists && (s.round !== summary.round || s.phase !== summary.phase || s.window !== summary.window || s.match_id !== summary.match_id)) {
      await refresh();
    } else if (state.offline) set({ offline: false });
  } catch (e) {
    noteNetwork(e);
  }
}

export async function switchSeat(seat: SeatId): Promise<void> {
  const summary = state.summary;
  if (!summary) return;
  try {
    await enterMatch(summary, seat);
    await refresh();
  } catch (e) {
    noteNetwork(e);
    toast({ tone: 'bad', title: 'Could not switch seat', detail: describeError(e) });
  }
}

export function dismissHandover(): void {
  set({ handover: null });
}

// --- match lifecycle -------------------------------------------------------------

export async function newMatch(req: NewMatchRequest): Promise<string | null> {
  set({ busy: true });
  try {
    const summary = await api.newMatch(req);
    await enterMatch(summary, null);
    set({ busy: false, offline: false });
    return null;
  } catch (e) {
    noteNetwork(e);
    set({ busy: false });
    return describeError(e);
  }
}

/** Hand the listed domains of this seat to a steward (an empty list ends the delegation). */
export async function setDelegates(domains: string[]): Promise<void> {
  try {
    await api.delegate(state.seat, domains);
    await refresh();
    toast({ tone: 'ok', title: domains.length ? 'Stewards appointed' : 'Stewards dismissed', detail: domains.length ? `A steward now handles: ${domains.join(', ')}.` : 'Every domain is back in your hands.' });
  } catch (e) {
    noteNetwork(e);
    toast({ tone: 'bad', title: 'Could not change stewards', detail: describeError(e) }, 8000);
  }
}

export async function refreshSaves(): Promise<void> {
  try {
    const { saves } = await api.saves();
    set({ saves });
  } catch {
    /* the list is a convenience */
  }
}

export async function saveGame(name: string): Promise<void> {
  try {
    const res = await api.save(name);
    toast({ tone: 'ok', title: 'Match saved', detail: `Saved as “${res.saved}”.` });
    await refreshSaves();
  } catch (e) {
    noteNetwork(e);
    toast({ tone: 'bad', title: 'Save failed', detail: describeError(e) });
  }
}

export async function loadGame(name: string): Promise<string | null> {
  set({ busy: true });
  try {
    rememberTokens(await api.load(name));
    const summary = await api.match();
    if (!summary.exists) throw new Error('The save did not contain a match.');
    await enterMatch(summary, null);
    set({ busy: false, offline: false });
    return null;
  } catch (e) {
    noteNetwork(e);
    set({ busy: false });
    return describeError(e);
  }
}

// --- interface state -------------------------------------------------------------

export function openPanel(panel: PanelKey | null, intent?: Intent): void {
  set({ panel, intent: intent ? { ...intent, nonce: nonce++ } : null, menuOpen: false });
}

export function togglePanel(panel: PanelKey): void {
  set({ panel: state.panel === panel ? null : panel, menuOpen: false });
}

export function consumeIntent(): void {
  if (state.intent) set({ intent: null });
}

export function selectRegion(id: RegionId | null, focus = false): void {
  const patch: Partial<AppState> = { selectedRegion: id };
  if (id !== null && focus) patch.focus = { region: id, nonce: nonce++ };
  set(patch);
}

export function showOnMap(ids: RegionId[]): void {
  if (!ids.length) return;
  set({ marked: ids, selectedRegion: ids[0], focus: { region: ids[0], nonce: nonce++ } });
}

export function setMarked(ids: RegionId[]): void {
  set({ marked: ids });
}

export function startPick(pick: MapPickState): void {
  set({ pick });
}

export function cancelPick(): void {
  if (state.pick) set({ pick: null });
}

export function setScreen(screen: 'setup' | 'game'): void {
  set({ screen, menuOpen: false });
  if (screen === 'setup') void refreshSaves();
}

export function setWide(wide: boolean): void {
  if (state.wide !== wide) set({ wide });
}

export function setMenu(open: boolean): void {
  set({ menuOpen: open });
}

export function dismissResult(): void {
  set({ resultDismissed: true });
}

// --- derived helpers -------------------------------------------------------------

export function regionName(obs: Observation, id: RegionId): string {
  return obs.regions.find((r) => r.id === id)?.name ?? 'Unmapped land';
}

export function civName(obs: Observation, seat: SeatId | null): string {
  if (seat === null) return 'No one';
  if (seat === obs.seat) return obs.civ.name;
  return obs.others.find((o) => o.seat === seat)?.name ?? 'Unknown polity';
}

export function civColor(obs: Observation, seat: SeatId | null): string {
  if (seat === null) return '#8a7d6a';
  if (seat === obs.seat) return obs.civ.color;
  return obs.others.find((o) => o.seat === seat)?.color ?? '#8a7d6a';
}

export function humanSeatList(): SeatId[] {
  return humanSeats(state.summary);
}
