// A small hand-written store: one state object, explicit actions, and a hook.
// All game data comes from the server's permission-filtered Observation; the
// store only adds interface state (open panel, selection, toasts).
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError, rememberTokens, SaveNotStored } from './api';
import { restoreAutosave, startAutosave } from './saves/autosave';
import type { SaveEntry } from './saves/types';
import { describeSaveError, fmtWhen, openSaveManager } from './saves/ui';
import { requestPersistence, vaultState } from './saves/vault';
import type {
  Action, AgentLogEntry, MatchSummary, MomentCategory, NewMatchRequest, Observation, Receipt, RegionId, SeatId,
  SpectatorView,
} from './protocol';
import { fmtYear, setCalendar, setUnits, yearOf, type HistDate } from './format';
import { t, tc } from './i18n';

export type PanelKey =
  | 'briefing' | 'economy' | 'projects' | 'people' | 'knowledge' | 'culture' | 'politics'
  | 'diplomacy' | 'military' | 'objectives' | 'space' | 'chronicle';

export const PANEL_ORDER: PanelKey[] = [
  'briefing', 'economy', 'projects', 'people', 'knowledge', 'culture', 'politics', 'diplomacy', 'military',
  'objectives', 'space', 'chronicle',
];
// i18n-table
export const PANEL_TITLE: Record<PanelKey, string> = {
  briefing: 'Briefing', economy: 'Economy', projects: 'Projects', people: 'People & education',
  knowledge: 'Knowledge', culture: 'Culture', politics: 'Politics', diplomacy: 'Diplomacy', military: 'Military',
  objectives: 'Objectives', space: 'Space operations', chronicle: 'Chronicle',
};
// i18n-end

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

/**
 * Full-screen overlays above the map: the two trees, the almanac, the economy ledger, the
 * regional works and the standing orders. The standing orders take an optional argument naming
 * what to open on: 'build' or 'build:<region id>', 'research', 'reform', 'settle' or 'settle:<region id>'.
 */
export type OverlayKey = 'tech' | 'civics' | 'almanac' | 'ledger' | 'works' | 'orders' | 'era' | 'buildings' | 'market';

/** A major moment announced across the top of the map (never modal). */
export interface BannerItem {
  id: number;
  title: string;
  text: string;
  art: string;
  month: number;
  category: MomentCategory;
  /** Observer world view: whose moment it is. */
  seat?: SeatId;
}

/** Observer playback: stepping an unattended match forward and waiting on LLM seats. */
export interface Playback {
  playing: boolean;
  /** 1, 2, 4 or 8 (8 = as fast as the referee resolves). */
  speed: number;
  /** Rounds still to run from a "run N rounds" request. */
  queued: number;
  /** A step is in flight (the referee is resolving, or agents are thinking). */
  busy: boolean;
  /** Seats the referee is waiting on while `busy`. */
  waitingOn: SeatId[];
  /** `Date.now()` when the current wait began. */
  waitingSince: number | null;
  error: string | null;
}

export interface ActionResult {
  tag: string;
  at: number;
  receipts: Receipt[];
  error: string | null;
}

export interface AppState {
  /** 'closed' = the local referee was shut down from the menu (app mode). */
  boot: 'loading' | 'ready' | 'unreachable' | 'closed';
  bootError: string | null;
  summary: MatchSummary | null;
  obs: Observation | null;
  seat: SeatId;
  screen: 'title' | 'setup' | 'game';
  /** How the setup screen was opened: 'tutorial' pre-fills a gentle first match and starts the guided tour. */
  setupPreset: 'tutorial' | 'observer' | null;
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
  /** Every stored save with what it holds, newest first (the names above are the ones loadable by name). */
  saveEntries: SaveEntry[];
  /** The drawer is widened (knowledge graph, long tables). */
  wide: boolean;
  overlay: OverlayKey | null;
  /** What the overlay should focus: a card handle, or an almanac topic key. */
  overlayArg: string | null;
  /** 'observe' when the match has no human seat: the client is a spectator console. */
  mode: 'play' | 'observe';
  spectator: SpectatorView | null;
  /** False when the referee predates GET /api/spectator (one seat is then watched read-only). */
  spectatorSupported: boolean;
  /** Observer: the seat whose own interface is shown read-only, or null for the world view. */
  viewAs: SeatId | null;
  playback: Playback;
  agentLogs: Record<number, AgentLogEntry[]>;
  /** Major moments waiting to be announced; the first is on screen. */
  banners: BannerItem[];
}

const initial: AppState = {
  boot: 'loading',
  bootError: null,
  summary: null,
  obs: null,
  seat: 0,
  screen: 'title',
  setupPreset: null,
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
  saveEntries: [],
  wide: false,
  overlay: null,
  overlayArg: null,
  mode: 'play',
  spectator: null,
  spectatorSupported: true,
  viewAs: null,
  playback: { playing: false, speed: 1, queued: 0, busy: false, waitingOn: [], waitingSince: null, error: null },
  agentLogs: {},
  banners: [],
};

let state: AppState = initial;
const listeners = new Set<() => void>();
let nonce = 1;
let toastId = 1;

export function getState(): AppState {
  return state;
}

function set(patch: Partial<AppState>): void {
  if (patch.obs?.units) setUnits(patch.obs.units);
  // the match's calendar turns every month the referee mentions into a historical year
  const cal = patch.obs?.calendar ?? patch.spectator?.calendar ?? patch.summary?.calendar;
  if (cal) setCalendar(cal);
  else if ('summary' in patch && patch.summary && !patch.summary.exists) setCalendar(null);
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Subscribe to every store change (for modules that keep their own derived state). */
export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
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
  // a save that was refused or not stored says why in the player's own language
  if (e instanceof SaveNotStored || (e instanceof ApiError && e.reason)) return describeSaveError(e);
  if (e instanceof ApiError) return tc(e.message);
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

/** The packaged desktop app exposes a small bridge on `window`. */
export interface DesktopBridge { fullscreen(): void; quit(): void }
export function desktopShell(): DesktopBridge | null {
  const w = window as unknown as { __btsDesktop?: Partial<DesktopBridge> };
  const d = w.__btsDesktop;
  return d && typeof d.quit === 'function' && typeof d.fullscreen === 'function' ? (d as DesktopBridge) : null;
}

/** Whether "Quit" can do anything: inside the desktop shell, or when the referee runs in app mode. */
export function canQuit(): boolean {
  return !!desktopShell() || !!state.summary?.app_mode;
}

/**
 * Whether a launch opens on the title screen when a match is already running.
 * The packaged app always does (Continue resumes it). A plain browser page goes
 * straight back into a live match, which is also what automated scripts expect;
 * `?title` and `?notitle` force either way.
 */
function opensOnTitle(summary: MatchSummary): boolean {
  let query = '';
  try { query = window.location.search; } catch { /* no location */ }
  if (/[?&]notitle\b/.test(query)) return false;
  if (/[?&]title\b/.test(query)) return true;
  return !!desktopShell() || !!summary.app_mode;
}

// The in-browser referee has no connection to lose, but its engine can fail. That
// ends the match it held: say so on the boot screen, where "Try again" starts a new one.
api.onEngineFailure((message) => {
  stopPlayback();
  set({ boot: 'unreachable', bootError: t('The game engine stopped: {message}', { message }), menuOpen: false, overlay: null, busy: false, advancing: false });
});

// Browser build: the page keeps the autosave (the referee in it has no disk).
startAutosave();

/**
 * Browser build, at start-up: the referee in the page begins with no match, so the
 * latest autosave is brought back. A reload of a tab that was playing returns to the
 * game; a fresh visit opens on the title screen with Continue ready. An autosave that
 * will not load is passed over for the one before it, and the player is told.
 */
async function restoreAtBoot(): Promise<boolean> {
  const { restored, failed } = await restoreAutosave();
  if (!restored) return false;
  rememberTokens(restored.summary);
  await enterMatch(await api.match(), null);
  let query = '';
  try { query = window.location.search; } catch { /* no location */ }
  const toGame = /[?&]notitle\b/.test(query) || (restored.sameTab && !/[?&]title\b/.test(query));
  set({ boot: 'ready', offline: false, screen: toGame ? 'game' : 'title' });
  const when = fmtWhen(restored.entry.created);
  if (failed.length) {
    toast({
      tone: 'bad', title: t('An earlier autosave was restored'),
      detail: t('The latest autosave could not be loaded, so the one from {when} (year {n}) was restored instead. The damaged one is kept: see Saves and storage.', { when, n: restored.entry.header.year }),
      action: { label: t('Saves and storage'), run: () => openSaveManager() }, sticky: true,
    });
  } else {
    toast({ tone: 'ok', title: t('Match restored'), detail: t('Continuing from the autosave of {when} (year {n}).', { when, n: restored.entry.header.year }) }, 7000);
  }
  return true;
}

export async function boot(): Promise<void> {
  set({ boot: 'loading', bootError: null });
  api.restartEngine();
  try {
    const summary = await api.match();
    void refreshSaves();
    if (!summary.exists) {
      if (await restoreAtBoot()) return;
      set({ boot: 'ready', summary, obs: null, spectator: null, screen: 'title', offline: false });
      return;
    }
    await enterMatch(summary, null);
    set({ boot: 'ready', offline: false, screen: opensOnTitle(summary) ? 'title' : 'game' });
  } catch (e) {
    set({ boot: 'unreachable', bootError: describeError(e) });
  }
}

/** No seat is human: nobody plays, the user watches. */
export function isObserverMatch(summary: MatchSummary | null): boolean {
  if (!summary?.exists) return false;
  // Never with a human seat, whatever the referee says; and never when the referee says no.
  return humanSeats(summary).length === 0 && summary.observer_allowed !== false;
}

const RESET_VIEW: Partial<AppState> = {
  selectedRegion: null, pick: null, marked: [], intent: null, lastResult: null, resultDismissed: false, handover: null,
  menuOpen: false, overlay: null, overlayArg: null, banners: [], freshMoments: [],
};

async function enterMatch(summary: MatchSummary, preferred: SeatId | null): Promise<void> {
  rememberTokens(summary);
  if (isObserverMatch(summary)) {
    await enterObserver(summary);
    return;
  }
  stopPlayback();
  set({ mode: 'play', spectator: null, viewAs: null, agentLogs: {} });
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
    resultDismissed: false, handover: null, menuOpen: false, overlay: null, overlayArg: null, banners: [],
    focus: { region: obs.civ.capital, nonce: nonce++ },
  });
}

// --- observer mode ---------------------------------------------------------------

async function enterObserver(summary: MatchSummary): Promise<void> {
  const sameMatch = state.mode === 'observe' && state.summary?.match_id === summary.match_id;
  if (!sameMatch) stopPlayback();
  let spectator: SpectatorView | null = null;
  let supported = true;
  try {
    spectator = await api.spectator();
  } catch (e) {
    if (spectatorRefused(e)) supported = false;
    else throw e;
  }
  if (!supported) {
    // An older referee: there is no world view, so one seat is watched read-only.
    const seat = summary.seats?.[0]?.seat ?? 0;
    let obs: Observation;
    try {
      obs = await api.observation(seat);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) throw e;
      // The referee keeps this match's seats private: nothing may be shown, so nothing is.
      stopPlayback();
      set({ ...RESET_VIEW, summary, obs: null, mode: 'play', spectator: null, viewAs: null, screen: 'title' });
      toast({ tone: 'info', title: t('This match cannot be watched from here'), detail: t('The referee keeps its seats private.') });
      return;
    }
    set({
      ...RESET_VIEW, summary, obs, seat, mode: 'observe', spectator: null, spectatorSupported: false, viewAs: seat,
      screen: 'game', panel: 'briefing', chronicleSeen: obs.chronicle.reduce((m, c) => Math.max(m, c.id), -1),
      focus: { region: obs.civ.capital, nonce: nonce++ }, agentLogs: sameMatch ? state.agentLogs : {},
    });
    return;
  }
  set({
    ...RESET_VIEW, summary, obs: null, mode: 'observe', spectator, spectatorSupported: true, viewAs: null,
    screen: 'game', panel: null, agentLogs: sameMatch ? state.agentLogs : {},
  });
  // The referee may already be running rounds (the page was reloaded mid-run): follow it.
  if (!sameMatch && !summary.finished && (summary.autoplay_until ?? 0) > (summary.round ?? 0)) void pump(null);
}

/** The referee has no spectator view for this match (older build: 404/405) or refuses it (403). */
function spectatorRefused(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 403 || e.status === 404 || e.status === 405);
}

/** True while the interface shows a seat it may not command. */
export function isReadOnly(): boolean {
  return state.mode === 'observe';
}

/** Observer: show one civilization's own interface read-only, or return to the world view with `null`. */
export async function viewAsSeat(seat: SeatId | null): Promise<void> {
  if (state.mode !== 'observe') return;
  if (seat === null) {
    if (!state.spectatorSupported) return;
    set({ ...RESET_VIEW, viewAs: null, obs: null, panel: null });
    void refresh().catch(() => undefined);
    return;
  }
  try {
    const obs = await api.observation(seat);
    set({
      ...RESET_VIEW, obs, seat, viewAs: seat, panel: 'briefing',
      chronicleSeen: obs.chronicle.reduce((m, c) => Math.max(m, c.id), -1),
      focus: { region: obs.civ.capital, nonce: nonce++ },
    });
  } catch (e) {
    noteNetwork(e);
    toast({ tone: 'bad', title: t('Could not open that seat'), detail: describeError(e) });
  }
}

function setPlayback(patch: Partial<Playback>): void {
  set({ playback: { ...state.playback, ...patch } });
}

/** Cancels whichever playback loop is running; a newer loop owns the token. */
let playToken = 0;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function stopPlayback(): void {
  playToken++;
  if (state.playback.playing || state.playback.queued || state.playback.busy || state.playback.error) {
    setPlayback({ playing: false, queued: 0, busy: false, waitingOn: [], waitingSince: null, error: null });
  }
}

/**
 * The in-page referee says when playback resolves a round, so the loop below need not
 * wait out its polling delay (a server-backed referee says nothing: the delay stands).
 */
let playbackNews = 0;
let wakePoll: (() => void) | null = null;
api.onSessionChange((change) => {
  if (change.cause !== 'playback') return;
  playbackNews++;
  wakePoll?.();
});

/** Wait `ms`, or less when the referee has reported a round since `heard`. */
function untilNews(ms: number, heard: number): Promise<void> {
  if (playbackNews !== heard) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      if (wakePoll === done) wakePoll = null;
      resolve();
    };
    const timer = setTimeout(done, ms);
    wakePoll = done;
  });
}

function agentsThinking(summary: MatchSummary): SeatId[] {
  return (summary.seats ?? []).filter((x) => x.agent && x.agent.state === 'thinking').map((x) => x.seat);
}

/**
 * Ask the referee to run `rounds` more rounds (or, with `null`, follow a run it
 * already has in hand) and follow it to the end. POST /api/advance answers at
 * once; the match then moves as fast as its seats answer, so the summary is
 * polled and the world refetched whenever the round changes.
 */
async function follow(token: number, rounds: number | null, owed = 0): Promise<boolean> {
  const before = state.summary?.round ?? 0;
  setPlayback({ busy: true, error: null, waitingOn: [], waitingSince: Date.now() });
  try {
    let heard = playbackNews;
    let summary = rounds === null ? await api.match() : await api.advance(rounds);
    const target = summary.autoplay_until ?? before + (rounds ?? 0);
    let seen = before;
    let ended = !!state.summary?.finished;
    let wait = 90;
    let stalled = 0;
    for (;;) {
      if (token !== playToken) return false;
      const round = summary.round ?? 0;
      set({ summary, playback: { ...state.playback, waitingOn: agentsThinking(summary), queued: Math.max(0, target - round) + owed } });
      // The last round can end the match without the round number moving: fetch the world for that too.
      if (round !== seen || (!!summary.finished && !ended)) {
        seen = round;
        ended = !!summary.finished;
        wait = 90;
        stalled = 0;
        await refresh();
        if (token !== playToken) return false;
        setPlayback({ waitingSince: Date.now() });
      }
      if (summary.finished || round >= target) break;
      // A referee that is not running anything (older build, or paused elsewhere) must not spin for ever.
      if (summary.autoplay_until !== undefined && summary.autoplay_until <= round) break;
      if (summary.autoplay_until === undefined && ++stalled > 40) throw new Error(t('The referee did not advance the match.'));
      await untilNews(wait, heard);
      heard = playbackNews;
      wait = Math.min(1000, Math.round(wait * 1.7));
      summary = await api.match();
    }
    if (state.offline) set({ offline: false });
    setPlayback({ busy: false, waitingOn: [], waitingSince: null, queued: summary.finished ? 0 : owed });
    return !summary.finished;
  } catch (e) {
    noteNetwork(e);
    if (token === playToken) setPlayback({ busy: false, playing: false, queued: 0, waitingOn: [], waitingSince: null, error: describeError(e) });
    return false;
  }
}

/**
 * Rounds are asked for one at a time, however many are wanted: the world is then
 * fetched after every round (so the comparison history has no gaps), a pause
 * takes hold at once, and a round that waits on an LLM seat costs nothing extra.
 */
async function pump(first: number | null): Promise<void> {
  const token = ++playToken;
  // Rounds a "run N" request still wants after the one in hand.
  let owed = Math.max(0, (first ?? 0) - 1);
  let rounds: number | null = first === null ? null : 1;
  for (;;) {
    const ok = await follow(token, rounds, state.playback.playing ? 0 : owed);
    if (token !== playToken) return;
    if (!ok) break;
    if (state.playback.playing) {
      const speed = state.playback.speed;
      const rest = speed >= 8 ? 0 : speed >= 4 ? 220 : speed >= 2 ? 800 : 1700;
      if (rest) await sleep(rest);
      if (token !== playToken) return;
      if (!state.playback.playing) break;
      owed = 0;
    } else {
      if (owed <= 0) break;
      owed -= 1;
    }
    rounds = 1;
  }
  if (token === playToken && (state.playback.playing || state.playback.queued)) setPlayback({ playing: false, queued: 0 });
}

/** Observer: run `rounds` more rounds (1 = a single step) and then stop. */
export function observerRun(rounds: number): void {
  if (state.mode !== 'observe' || state.summary?.finished) return;
  const n = Math.max(1, Math.min(240, Math.round(rounds)));
  setPlayback({ playing: false, queued: n, error: null });
  void pump(n);
}

/** Observer: play continuously (one round at a time, paced by the speed), or pause. */
export function observerPlay(playing: boolean): void {
  if (state.mode !== 'observe') return;
  if (playing) {
    if (state.summary?.finished) return;
    setPlayback({ playing: true, queued: 0, error: null });
    void pump(1);
    return;
  }
  playToken++;
  setPlayback({ playing: false, queued: 0, busy: false, waitingOn: [], waitingSince: null });
  // rounds: 0 tells the referee to stop after the round in hand.
  void api.advance(0).then((summary) => set({ summary })).then(() => refresh()).catch(() => undefined);
}

export function observerSpeed(speed: number): void {
  if (speed !== state.playback.speed) setPlayback({ speed });
}

export async function loadAgentLog(seat: SeatId): Promise<void> {
  try {
    const { entries } = await api.agentLog(seat);
    set({ agentLogs: { ...state.agentLogs, [seat]: entries ?? [] } });
  } catch {
    /* the log is a convenience; an older referee has none */
  }
}

/** Observer: keep the round and the agents' states fresh while no playback loop is polling. */
export async function observerTick(): Promise<void> {
  if (state.mode !== 'observe' || state.screen !== 'game' || state.playback.busy || !state.summary) return;
  try {
    const summary = await api.match();
    if (!summary.exists || summary.match_id !== state.summary.match_id || summary.round !== state.summary.round || !!summary.finished !== !!state.summary.finished) await refresh();
    else set({ summary, offline: false });
  } catch (e) {
    noteNetwork(e);
  }
}

/** Refetch match summary and observation for the current seat. */
export async function refresh(): Promise<void> {
  try {
    const summary = await api.match();
    if (!summary.exists) {
      set({ summary, obs: null, spectator: null, screen: 'title', offline: false });
      return;
    }
    rememberTokens(summary);
    if (state.mode === 'observe') {
      if (summary.match_id !== state.summary?.match_id) {
        await enterMatch(summary, null);
        return;
      }
      const [spectator, obs] = await Promise.all([
        state.spectatorSupported
          ? api.spectator().catch((e: unknown) => { if (spectatorRefused(e)) return null; throw e; })
          : Promise.resolve(null),
        state.viewAs !== null ? api.observation(state.viewAs) : Promise.resolve(null),
      ]);
      if (state.spectatorSupported && !spectator) {
        // The referee stopped offering the world view: quietly watch one seat read-only instead.
        set({ spectatorSupported: false, spectator: null });
        if (state.viewAs === null) {
          await enterObserver(summary);
          return;
        }
      }
      const prev = state.spectator;
      const patch: Partial<AppState> = { summary, spectator, offline: false };
      if (obs) patch.obs = obs;
      if (spectator && prev && state.viewAs === null && spectator.round !== prev.round) {
        const lastId = prev.events.reduce((m, e) => Math.max(m, e.id), -1);
        const major = spectator.events.filter((e) => e.id > lastId && e.major).slice(-2);
        patch.banners = [...state.banners, ...major.map((e) => ({ id: e.id, title: e.title, text: e.text, art: e.art, month: e.month, category: e.category, seat: e.seat }))].slice(-3);
      }
      set(patch);
      return;
    }
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
    // Major moments are announced by a banner across the map; the rest arrive as quiet toasts.
    const major = fresh.filter((c) => c.major).slice(-2);
    const minor = fresh.filter((c) => !major.includes(c));
    patch.banners = major.map((c) => ({ id: c.id, title: c.title, text: c.text, art: c.art, month: c.month, category: c.category }));
    set(patch);
    // an epidemic newly reported in a region we govern (ruleset 3.0 outbreaks)
    const before = new Set(prev.regions.filter((r) => r.outbreak).map((r) => r.id));
    const struck = obs.regions.filter((r) => r.own && r.outbreak && !before.has(r.id));
    if (struck.length) {
      const worst = Math.max(...struck.map((r) => r.outbreak!.severity_band));
      toast({
        tone: worst >= 2 ? 'bad' : 'info',
        title: struck.length === 1 ? t('Epidemic in {region}', { region: struck[0].name }) : t('Epidemics in {n} regions', { n: struck.length }),
        detail: t('An outbreak raises deaths and spreads to neighbours. Care, medicine and sanitation soften it.'),
        action: { label: t('People'), run: () => openPanel('people') },
      }, 9000);
    }
    const quiet = major.length ? 2 : 3;
    for (const c of minor.slice(-quiet)) {
      toast({
        tone: 'moment',
        title: tc(c.title),
        detail: t('{year} · added to the chronicle', { year: fmtYear(c.month, (c as { date?: HistDate | null }).date ?? (c.month === obs.month ? obs.date : null)) }),
        action: { label: t('View'), run: () => openPanel('chronicle', { kind: 'moment', id: c.id }) },
      }, 9000);
    }
    if (minor.length > quiet) {
      const n = minor.length - quiet;
      toast({ tone: 'moment', title: n === 1 ? t('One more moment recorded') : t('{n} more moments recorded', { n }), action: { label: t('Chronicle'), run: () => openPanel('chronicle') } }, 9000);
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
  if (isReadOnly()) {
    toast({ tone: 'info', title: t('You are observing'), detail: t('Orders cannot be given for a seat you are only watching.') });
    return [];
  }
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
  if (error) toast({ tone: 'bad', title: t('Order not sent'), detail: error }, 8000);
  for (const r of rejected) toast({ tone: 'bad', title: t('Not accepted'), detail: capitalize(tc(r.reason)) }, 8000);
  if (!opts.quiet && accepted.length && !rejected.length && !error) {
    const last = accepted[accepted.length - 1];
    toast({ tone: 'ok', title: accepted.length > 1 ? t('{n} orders accepted', { n: accepted.length }) : t('Accepted'), detail: tc(last.reason) }, 3600);
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
  if (isReadOnly()) {
    toast({ tone: 'info', title: t('You are observing'), detail: t('Use the playback controls to move the match forward.') });
    return;
  }
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
      else toast({ tone: 'info', title: t('Waiting for other seats'), detail: t('{names} have not finished this phase yet.', { names: waiting.map((s) => seatName(s)).join(', ') }) });
    } else if (!summary.finished && advanced && humans.length > 1) {
      // Everyone was ready and time moved on; the next human to act takes over.
      const nextHuman = (summary.waiting_on ?? []).find((s) => humans.includes(s));
      if (nextHuman !== undefined && nextHuman !== state.seat) set({ handover: nextHuman });
    }
  } catch (e) {
    noteNetwork(e);
    toast({ tone: 'bad', title: t('Could not advance'), detail: describeError(e) }, 8000);
  }
  set({ advancing: false });
}

export function seatName(seat: SeatId): string {
  const s = state.summary?.seats?.find((x) => x.seat === seat);
  return s?.name ? tc(s.name) : t('Seat {n}', { n: seat + 1 });
}

/** Poll while this seat is waiting on others, so external seats can move the match. */
export async function pollWhileWaiting(): Promise<void> {
  const { obs, summary, advancing, busy, screen } = state;
  if (state.mode === 'observe') return;
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
    toast({ tone: 'bad', title: t('Could not switch seat'), detail: describeError(e) });
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
  if (isReadOnly()) {
    toast({ tone: 'info', title: t('You are observing'), detail: t('Orders cannot be given for a seat you are only watching.') });
    return;
  }
  try {
    await api.delegate(state.seat, domains);
    await refresh();
    toast({ tone: 'ok', title: domains.length ? t('Stewards appointed') : t('Stewards dismissed'), detail: domains.length ? t('A steward now handles: {domains}.', { domains: domains.map((d) => t(d)).join(', ') }) : t('Every domain is back in your hands.') });
  } catch (e) {
    noteNetwork(e);
    toast({ tone: 'bad', title: t('Could not change stewards'), detail: describeError(e) }, 8000);
  }
}

export async function refreshSaves(): Promise<void> {
  try {
    const { entries } = await api.saveList();
    // loadable by name: the player's own saves, and in the server-backed game the autosave file too
    const named = entries.filter((e) => !api.features.local || e.kind === 'manual').map((e) => e.name).sort();
    set({ saves: named, saveEntries: entries });
  } catch {
    /* the list is a convenience */
  }
}

let askedToPersist = false;

/** Save under a name. Returns whether the save was made. */
export async function saveGame(name: string): Promise<boolean> {
  try {
    const res = await api.save(name);
    toast({ tone: 'ok', title: t('Match saved'), detail: t('Saved as “{name}”.', { name: res.saved }) });
    await refreshSaves();
    // The player has now made something worth keeping: ask the browser, once, not to
    // clear this site's data when the device runs short of space.
    if (api.features.local && !askedToPersist && vaultState().persisted === false) {
      askedToPersist = true;
      void requestPersistence();
    }
    return true;
  } catch (e) {
    noteNetwork(e);
    const detail = describeError(e);
    toast({ tone: 'bad', title: t('Save failed'), detail }, e instanceof SaveNotStored ? 12000 : undefined);
    // no room: nothing was deleted to make some. The storage manager is where room is made.
    if (e instanceof SaveNotStored) openSaveManager(detail);
    return false;
  }
}

/**
 * Replace the match with a saved one, however it is fetched (a named save, a stored
 * save, a file). The referee checks it first; when it refuses, the match in progress
 * and everything on screen stay as they were. Returns what went wrong, or null.
 */
export async function installMatch(fetch: () => Promise<MatchSummary>): Promise<unknown | null> {
  set({ busy: true });
  try {
    rememberTokens(await fetch());
    const summary = await api.match();
    if (!summary.exists) throw new Error(t('The save did not contain a match.'));
    await enterMatch(summary, null);
    set({ busy: false, offline: false });
    void refreshSaves();
    return null;
  } catch (e) {
    noteNetwork(e);
    set({ busy: false });
    return e ?? new Error('failed');
  }
}

export async function loadGame(name: string): Promise<string | null> {
  const failed = await installMatch(() => api.load(name));
  return failed === null ? null : describeError(failed);
}

/** Load a stored save by its handle (see `saveEntries`). */
export async function loadSaveEntry(id: string): Promise<string | null> {
  const failed = await installMatch(() => api.loadSave(id));
  return failed === null ? null : describeError(failed);
}

// --- interface state -------------------------------------------------------------

export function openPanel(panel: PanelKey | null, intent?: Intent): void {
  const patch: Partial<AppState> = { panel, intent: intent ? { ...intent, nonce: nonce++ } : null, menuOpen: false };
  if (panel) { patch.overlay = null; patch.overlayArg = null; }
  set(patch);
}

export function togglePanel(panel: PanelKey): void {
  set({ panel: state.panel === panel ? null : panel, menuOpen: false, overlay: null, overlayArg: null });
}

export function openOverlay(overlay: OverlayKey, arg: string | null = null): void {
  set({ overlay, overlayArg: arg, menuOpen: false, pick: null });
}

export function toggleOverlay(overlay: OverlayKey): void {
  if (state.overlay === overlay) closeOverlay();
  else openOverlay(overlay);
}

export function closeOverlay(): void {
  if (state.overlay) set({ overlay: null, overlayArg: null });
}

export function dismissBanner(id?: number): void {
  if (!state.banners.length) return;
  set({ banners: id === undefined ? state.banners.slice(1) : state.banners.filter((b) => b.id !== id) });
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

export function setScreen(screen: 'title' | 'setup' | 'game', preset: 'tutorial' | 'observer' | null = null): void {
  set({ screen, setupPreset: screen === 'setup' ? preset : null, menuOpen: false, overlay: null, overlayArg: null });
  if (screen !== 'game') void refreshSaves();
}

/** True when a match is loaded and can be resumed from the title screen. */
export function hasLiveMatch(): boolean {
  return !!state.summary?.exists && (!!state.obs || !!state.spectator);
}

export function setWide(wide: boolean): void {
  if (state.wide !== wide) set({ wide });
}

export function setMenu(open: boolean): void {
  set({ menuOpen: open });
}

/** App mode only: save, stop the local referee, and show the closing screen. */
export async function quitGame(): Promise<void> {
  stopPlayback();
  const desktop = desktopShell();
  if (desktop) {
    // The desktop shell saves and closes the window itself.
    desktop.quit();
    return;
  }
  try {
    await api.shutdown();
  } catch (e) {
    // The referee may close the connection before it answers; that is still a quit.
    if (!(e instanceof ApiError && e.network)) {
      toast({ tone: 'bad', title: t('Could not quit'), detail: describeError(e) }, 8000);
      return;
    }
  }
  set({ boot: 'closed', menuOpen: false, overlay: null });
}

export function dismissResult(): void {
  set({ resultDismissed: true });
}

// --- derived helpers -------------------------------------------------------------

export function regionName(obs: Observation, id: RegionId): string {
  const name = obs.regions.find((r) => r.id === id)?.name;
  return name ? tc(name) : t('Unmapped land');
}

export function civName(obs: Observation, seat: SeatId | null): string {
  if (seat === null) return t('No one');
  if (seat === obs.seat) return tc(obs.civ.name);
  const name = obs.others.find((o) => o.seat === seat)?.name;
  return name ? tc(name) : t('Unknown polity');
}

export function civColor(obs: Observation, seat: SeatId | null): string {
  if (seat === null) return '#8a7d6a';
  if (seat === obs.seat) return obs.civ.color;
  return obs.others.find((o) => o.seat === seat)?.color ?? '#8a7d6a';
}

export function humanSeatList(): SeatId[] {
  return humanSeats(state.summary);
}
