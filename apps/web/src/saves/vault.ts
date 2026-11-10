// The vault: where the browser build keeps its saves.
//
// Saves are `.btsave` containers, already compressed by the referee, kept whole in
// IndexedDB (database `bts-saves`): one small record of facts per save in `meta`, the
// file's bytes in `data`. Listing reads only `meta`.
//
// The rules, all enforced inside one read-write transaction per change, so two tabs
// on the site can never both evict for the same space or half-apply a change:
//
//   * The vault keeps to a budget (20 MiB unless changed) counted over what it stores.
//   * Autosaves rotate: writing one keeps it and the newest (N - 1) before it.
//   * Room is made by removing the oldest autosaves first, and only autosaves.
//   * A manual save is never removed to make room. If one does not fit after every
//     autosave is gone, it is refused and nothing is removed.
//   * An autosave that does not fit even alone is skipped and nothing is removed:
//     older autosaves are worth more than none.
//
// When IndexedDB cannot be used (a private window, blocked site data, a database
// written by a newer version of the game) the same rules run over a table in memory,
// and the state says the saves will not outlive the tab.
//
// This module knows nothing about the referee: it stores bytes it is given.
import type { SaveHeader, SaveKind, SaveUsage } from './types';

export interface StoredSave {
  id: string;
  kind: SaveKind;
  /** The player's name for a manual save; empty for an autosave. */
  name: string;
  /** When it was made (ms since the epoch). */
  created: number;
  /** Size of the file. */
  bytes: number;
  /** What it counts against the budget: the file plus this record. */
  cost: number;
  matchId: string;
  round: number;
  month: number;
  sha256: string;
  header: SaveHeader;
}

export interface VaultSettings {
  /** Total bytes the vault may hold. */
  budgetBytes: number;
  /** How many autosaves are kept; 0 turns autosave off. */
  autosaves: number;
}

export interface Incoming {
  kind: SaveKind;
  name: string;
  created: number;
  data: Uint8Array;
  header: SaveHeader;
}

export type WriteFailure = 'full' | 'quota' | 'failed';

export type WriteResult =
  | { ok: true; entry: StoredSave; evicted: StoredSave[]; replaced: StoredSave | null; unchanged: boolean }
  | { ok: false; reason: WriteFailure; needed: number; free: number; budget: number; detail: string };

/** An autosave that was tried at start-up and would not load. It is kept, not deleted. */
export interface RestoreFailure {
  entry: StoredSave;
  /** The referee's reason code (`CORRUPT`, `INCOMPATIBLE`, ...). */
  reason: string;
  message: string;
}

export interface VaultState {
  ready: boolean;
  /** Saves are in IndexedDB and outlive the page. False: they live in this tab's memory. */
  durable: boolean;
  /** Why not durable, or why this tab should be reloaded. */
  problem: null | 'unavailable' | 'newer' | 'stale';
  problemDetail: string;
  /** Newest first. */
  entries: StoredSave[];
  usage: SaveUsage;
  settings: VaultSettings;
  /** Other tabs of this site that are open now. */
  otherTabs: number;
  /** The browser's own figures for this site, when it gives them. */
  estimate: { usage: number; quota: number } | null;
  /** Whether the browser has promised not to clear this site's data; null when it cannot say. */
  persisted: boolean | null;
  /** Autosave is not being written, and why. Cleared by the next autosave that is. */
  autosaveOff: null | { reason: WriteFailure | 'unavailable'; needed: number; free: number; at: number };
  autosaveOffDismissed: boolean;
  /** The last autosave written, with how long it took. */
  lastAutosave: null | { at: number; round: number; bytes: number; exportMs: number; storeMs: number; evicted: number };
  /** The autosave the running match was restored from when the page loaded, until another match replaces it. */
  restored: StoredSave | null;
  /** Autosaves that would not load at start-up. */
  restoreFailures: RestoreFailure[];
}

const MIB = 1024 * 1024;
const env = import.meta.env as Record<string, string | undefined>;
const positive = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
};
/** Build-time defaults: VITE_BTS_SAVE_BUDGET_MIB (20) and VITE_BTS_AUTOSAVES (3). */
export const DEFAULT_SETTINGS: VaultSettings = {
  budgetBytes: Math.round(positive(env.VITE_BTS_SAVE_BUDGET_MIB, 20) * MIB) || 20 * MIB,
  autosaves: Math.round(positive(env.VITE_BTS_AUTOSAVES, 3)),
};
export const MIN_BUDGET = 64 * 1024;
export const MAX_BUDGET = 4096 * MIB;
export const MAX_AUTOSAVES = 20;

const SETTINGS_KEY = 'bts.saves.settings';
const DB_NAME = 'bts-saves';
/** Bump when the stores change, and add a step to `upgrade`. */
const DB_VERSION = 1;

function clampSettings(s: Partial<VaultSettings>): VaultSettings {
  const budget = Number.isFinite(s.budgetBytes) ? Number(s.budgetBytes) : DEFAULT_SETTINGS.budgetBytes;
  const autos = Number.isFinite(s.autosaves) ? Number(s.autosaves) : DEFAULT_SETTINGS.autosaves;
  return { budgetBytes: Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, Math.round(budget))), autosaves: Math.max(0, Math.min(MAX_AUTOSAVES, Math.round(autos))) };
}

function loadSettings(): VaultSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return clampSettings(JSON.parse(raw) as Partial<VaultSettings>);
  } catch {
    /* storage unavailable or unreadable: the defaults stand */
  }
  return clampSettings(DEFAULT_SETTINGS);
}

// --- the rules ---------------------------------------------------------------------

const oldestFirst = (a: StoredSave, b: StoredSave) => a.created - b.created || (a.id < b.id ? -1 : 1);

export function usageOf(entries: StoredSave[], budget: number): SaveUsage {
  let manualBytes = 0;
  let autoBytes = 0;
  for (const e of entries) {
    if (e.kind === 'auto') autoBytes += e.cost;
    else manualBytes += e.cost;
  }
  return { used: manualBytes + autoBytes, budget, manualBytes, autoBytes };
}

export type Plan =
  | { ok: true; unchanged: boolean; replaced: StoredSave | null; evicted: StoredSave[] }
  | { ok: false; needed: number; free: number; budget: number };

/**
 * Decide what writing `incoming` does to the saves that exist. Pure: the same
 * function plans for IndexedDB and for the in-memory fallback, and is what the
 * transaction applies. `ceiling` is what the browser has actually allowed, when it
 * has refused a write that the budget permitted.
 */
export function planWrite(existing: StoredSave[], incoming: StoredSave, settings: VaultSettings, ceiling = Infinity): Plan {
  const budget = Math.min(settings.budgetBytes, ceiling);
  const newestAuto = existing.filter((e) => e.kind === 'auto').sort(oldestFirst).pop() ?? null;
  // the same game is already the newest autosave: nothing to write
  if (incoming.kind === 'auto' && newestAuto && newestAuto.sha256 === incoming.sha256) {
    return { ok: true, unchanged: true, replaced: null, evicted: [] };
  }
  // what this write takes the place of: a save with the same id (a manual save of the
  // same name), or the autosave of the same round of the same match
  let replaced = existing.find((e) => e.id === incoming.id) ?? null;
  if (!replaced && incoming.kind === 'auto' && newestAuto && newestAuto.matchId === incoming.matchId && newestAuto.round === incoming.round) {
    replaced = newestAuto;
  }
  const rest = existing.filter((e) => e !== replaced);
  const autos = rest.filter((e) => e.kind === 'auto').sort(oldestFirst);
  const evicted: StoredSave[] = [];
  if (incoming.kind === 'auto') {
    // rotation: this autosave and the newest (N - 1) before it
    while (autos.length - evicted.length > Math.max(0, settings.autosaves - 1)) evicted.push(autos[evicted.length]);
  }
  let used = rest.reduce((sum, e) => sum + e.cost, 0) - evicted.reduce((sum, e) => sum + e.cost, 0);
  // the budget: oldest autosaves go first, and only autosaves
  for (let i = evicted.length; used + incoming.cost > budget && i < autos.length; i++) {
    evicted.push(autos[i]);
    used -= autos[i].cost;
  }
  if (used + incoming.cost > budget) {
    const kept = rest.filter((e) => e.kind !== 'auto').reduce((sum, e) => sum + e.cost, 0);
    return { ok: false, needed: incoming.cost, free: Math.max(0, budget - kept), budget };
  }
  return { ok: true, unchanged: false, replaced, evicted };
}

// --- two places to keep them -----------------------------------------------------------

interface Change {
  remove: string[];
  put?: { meta: StoredSave; data: Uint8Array };
}

type Outcome<T> = { done: true; value: T } | { done: false; quota: boolean; detail: string };

interface Backend {
  list(): Promise<StoredSave[]>;
  read(id: string): Promise<Uint8Array | null>;
  /** Read every record, decide, apply: all or nothing. `decide` returns the change and the value to hand back. */
  atomically<T>(decide: (existing: StoredSave[]) => { change: Change | null; value: T }): Promise<Outcome<T>>;
  close(): void;
}

function memoryBackend(): Backend {
  const metas = new Map<string, StoredSave>();
  const files = new Map<string, Uint8Array>();
  return {
    list: async () => [...metas.values()],
    read: async (id) => files.get(id) ?? null,
    atomically: async (decide) => {
      const { change, value } = decide([...metas.values()]);
      if (change) {
        for (const id of change.remove) {
          metas.delete(id);
          files.delete(id);
        }
        if (change.put) {
          metas.set(change.put.meta.id, change.put.meta);
          files.set(change.put.meta.id, change.put.data);
        }
      }
      return { done: true, value };
    },
    close: () => undefined,
  };
}

/** Steps from each older layout to the next. Version 1 is the first. */
function upgrade(db: IDBDatabase, from: number): void {
  if (from < 1) {
    db.createObjectStore('meta', { keyPath: 'id' });
    db.createObjectStore('data');
  }
}

class NewerDatabase extends Error {}

function openDatabase(onVersionChange: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
    // another tab still has the older layout open; it is asked to close (onversionchange there)
    // and this request then goes through
    req.onblocked = () => undefined;
    req.onerror = (event) => {
      // handled here: it is not an error of the page's
      event.preventDefault();
      reject(req.error?.name === 'VersionError' ? new NewerDatabase(req.error.message) : req.error ?? new Error('IndexedDB could not be opened'));
    };
    req.onsuccess = () => {
      const db = req.result;
      // a newer version of the game in another tab is upgrading the database: get out of its way
      db.onversionchange = () => {
        db.close();
        onVersionChange();
      };
      resolve(db);
    };
  });
}

function wait<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** For the automated checks: make the next writes fail as the browser would when out of room. */
let debugRefusals = 0;

function idbBackend(db: IDBDatabase): Backend {
  return {
    list: () => wait(db.transaction('meta', 'readonly').objectStore('meta').getAll() as IDBRequest<StoredSave[]>),
    read: async (id) => {
      const got = await wait(db.transaction('data', 'readonly').objectStore('data').get(id) as IDBRequest<ArrayBuffer | Uint8Array | undefined>);
      return got ? new Uint8Array(got instanceof Uint8Array ? got.buffer.slice(got.byteOffset, got.byteOffset + got.byteLength) : got) : null;
    },
    atomically: <T>(decide: (existing: StoredSave[]) => { change: Change | null; value: T }) =>
      new Promise<Outcome<T>>((resolve) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(['meta', 'data'], 'readwrite');
        } catch (e) {
          resolve({ done: false, quota: false, detail: e instanceof Error ? e.message : String(e) });
          return;
        }
        const meta = tx.objectStore('meta');
        const data = tx.objectStore('data');
        let value: T | undefined;
        let decided = false;
        let refused = false;
        const all = meta.getAll() as IDBRequest<StoredSave[]>;
        all.onsuccess = () => {
          try {
            const result = decide(all.result);
            value = result.value;
            decided = true;
            if (!result.change) return;
            if (result.change.put && debugRefusals > 0) {
              debugRefusals--;
              refused = true;
              tx.abort();
              return;
            }
            for (const id of result.change.remove) {
              meta.delete(id);
              data.delete(id);
            }
            if (result.change.put) {
              meta.put(result.change.put.meta);
              // the bytes alone, not a view of a larger buffer
              const bytes = result.change.put.data;
              data.put(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), result.change.put.meta.id);
            }
          } catch (e) {
            try { tx.abort(); } catch { /* already finished */ }
            resolve({ done: false, quota: false, detail: e instanceof Error ? e.message : String(e) });
          }
        };
        tx.oncomplete = () => resolve(decided ? { done: true, value: value as T } : { done: false, quota: false, detail: 'the change was not applied' });
        const failed = () => {
          const name = refused ? 'QuotaExceededError' : tx.error?.name ?? '';
          resolve({ done: false, quota: name === 'QuotaExceededError', detail: refused ? 'QuotaExceededError (simulated)' : tx.error?.message ?? name ?? 'the change was not applied' });
        };
        tx.onabort = failed;
        tx.onerror = () => undefined; // an error aborts the transaction; onabort answers
      }),
    close: () => db.close(),
  };
}

// --- the vault ---------------------------------------------------------------------------

let backend: Backend = memoryBackend();
let opening: Promise<void> | null = null;
/** What the browser has actually let the vault hold, once it has refused a write. */
let ceiling = Infinity;

let state: VaultState = {
  ready: false, durable: false, problem: null, problemDetail: '', entries: [],
  usage: { used: 0, budget: DEFAULT_SETTINGS.budgetBytes, manualBytes: 0, autoBytes: 0 },
  settings: loadSettings(), otherTabs: 0, estimate: null, persisted: null,
  autosaveOff: null, autosaveOffDismissed: false, lastAutosave: null, restored: null, restoreFailures: [],
};
const listeners = new Set<() => void>();

export function vaultState(): VaultState {
  return state;
}

export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function set(patch: Partial<VaultState>): void {
  state = { ...state, ...patch };
  for (const l of [...listeners]) {
    try { l(); } catch (e) { console.error(e); }
  }
}

function setEntries(entries: StoredSave[]): void {
  const sorted = [...entries].sort((a, b) => oldestFirst(b, a));
  set({ entries: sorted, usage: usageOf(sorted, state.settings.budgetBytes) });
}

// one change at a time in this tab; other tabs are kept apart by the transaction itself
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
}

// --- other tabs ---------------------------------------------------------------------------

const TAB_LOCK = 'bts-saves-tab:';
const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let channel: BroadcastChannel | null = null;
/** Tabs heard from, for browsers without the Web Locks API. */
const heard = new Set<string>();

function tell(message: { t: 'hello' | 'here' | 'bye' | 'changed' | 'settings'; from: string }): void {
  try { channel?.postMessage(message); } catch { /* the channel is closed */ }
}

async function countTabs(): Promise<void> {
  let others = heard.size;
  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks?.query) {
      const held = (await locks.query()).held ?? [];
      others = held.filter((l) => l.name?.startsWith(TAB_LOCK) && l.name !== TAB_LOCK + tabId).length;
    }
  } catch {
    /* the count from messages stands */
  }
  if (others !== state.otherTabs) set({ otherTabs: others });
}

function meetOtherTabs(): void {
  try {
    // held for as long as this tab lives, and released by the browser when it goes
    (navigator as Navigator & { locks?: LockManager }).locks
      ?.request(TAB_LOCK + tabId, { mode: 'shared' }, () => new Promise<void>(() => undefined))
      .catch(() => undefined); // refused (an insecure context): presence is by message only
  } catch {
    /* no Web Locks: presence is by message only */
  }
  try {
    channel = new BroadcastChannel('bts-saves');
    channel.onmessage = (event: MessageEvent<{ t: string; from: string }>) => {
      const m = event.data;
      if (!m || m.from === tabId) return;
      if (m.t === 'hello') {
        heard.add(m.from);
        tell({ t: 'here', from: tabId });
        void countTabs();
      } else if (m.t === 'here') {
        heard.add(m.from);
        void countTabs();
      } else if (m.t === 'bye') {
        heard.delete(m.from);
        // its lock is released a moment after it says so
        setTimeout(() => void countTabs(), 300);
      } else if (m.t === 'changed') {
        void refreshVault();
      } else if (m.t === 'settings') {
        const settings = loadSettings();
        set({ settings, usage: usageOf(state.entries, settings.budgetBytes) });
      }
    };
    tell({ t: 'hello', from: tabId });
    window.addEventListener('pagehide', () => tell({ t: 'bye', from: tabId }));
  } catch {
    /* no BroadcastChannel: other tabs are found by their locks when the list is refreshed */
  }
  void countTabs();
}

// --- opening --------------------------------------------------------------------------------

/** Open the vault (once). Never rejects: when IndexedDB cannot be used the state says so. */
export function openVault(): Promise<void> {
  if (opening) return opening;
  opening = (async () => {
    let problem: VaultState['problem'] = null;
    let detail = '';
    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) throw new Error('this browser has no IndexedDB');
      const db = await openDatabase(() => {
        // the database is being replaced under this tab: stop using it, keep nothing in memory, ask for a reload
        backend = memoryBackend();
        set({ durable: false, problem: 'stale', problemDetail: '', entries: [], usage: usageOf([], state.settings.budgetBytes) });
      });
      backend = idbBackend(db);
    } catch (e) {
      problem = e instanceof NewerDatabase ? 'newer' : 'unavailable';
      detail = e instanceof Error ? e.message : String(e);
      backend = memoryBackend();
    }
    let entries: StoredSave[] = [];
    try {
      entries = await backend.list();
    } catch (e) {
      problem = 'unavailable';
      detail = e instanceof Error ? e.message : String(e);
      backend = memoryBackend();
    }
    set({ ready: true, durable: problem === null, problem, problemDetail: detail });
    setEntries(entries);
    meetOtherTabs();
    void refreshEstimate();
  })();
  return opening;
}

export async function refreshVault(): Promise<StoredSave[]> {
  await openVault();
  try {
    setEntries(await backend.list());
  } catch {
    /* the list on screen stands */
  }
  void countTabs();
  return state.entries;
}

export async function refreshEstimate(): Promise<void> {
  try {
    const storage = navigator.storage;
    if (!storage) return;
    const [estimate, persisted] = await Promise.all([
      storage.estimate ? storage.estimate() : Promise.resolve(null),
      storage.persisted ? storage.persisted() : Promise.resolve(null),
    ]);
    set({
      estimate: estimate && typeof estimate.usage === 'number' && typeof estimate.quota === 'number' ? { usage: estimate.usage, quota: estimate.quota } : null,
      persisted,
    });
  } catch {
    /* the browser will not say */
  }
}

/**
 * Ask the browser not to clear this site's data when the device runs short. Browsers
 * decide by their own rules (Chrome by how the site is used, Firefox by asking the
 * person); the answer is shown either way. Asked once the player has made a save of
 * their own, or from the storage manager.
 */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    const granted = await navigator.storage.persist();
    set({ persisted: granted });
    return granted;
  } catch {
    return null;
  }
}

// --- changes ------------------------------------------------------------------------------------

function record(incoming: Incoming, id: string): StoredSave {
  const meta: StoredSave = {
    id, kind: incoming.kind, name: incoming.name, created: incoming.created, bytes: incoming.data.byteLength, cost: 0,
    matchId: incoming.header.match_id, round: incoming.header.round, month: incoming.header.month, sha256: incoming.header.sha256,
    header: incoming.header,
  };
  // the record itself is stored too, and is counted
  meta.cost = meta.bytes + JSON.stringify(meta).length;
  return meta;
}

export const manualId = (name: string) => `m:${name}`;

/** Store a save under the vault's rules. Never throws; a save that was not stored says why. */
export function writeSave(incoming: Incoming): Promise<WriteResult> {
  return serial(async () => {
    await openVault();
    const id = incoming.kind === 'manual' ? manualId(incoming.name) : `a:${incoming.created.toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const meta = record(incoming, id);
    let last: WriteResult = { ok: false, reason: 'failed', needed: meta.cost, free: 0, budget: state.settings.budgetBytes, detail: '' };
    for (let attempt = 0; attempt < 3; attempt++) {
      const settings = state.settings;
      let usedBefore = 0;
      const outcome = await backend.atomically<WriteResult>((existing) => {
        usedBefore = existing.reduce((sum, e) => sum + e.cost, 0);
        const plan = planWrite(existing, meta, settings, ceiling);
        if (!plan.ok) return { change: null, value: { ok: false, reason: ceiling < settings.budgetBytes ? 'quota' : 'full', needed: plan.needed, free: plan.free, budget: plan.budget, detail: '' } };
        if (plan.unchanged) return { change: null, value: { ok: true, entry: existing.filter((e) => e.kind === 'auto').sort(oldestFirst).pop()!, evicted: [], replaced: null, unchanged: true } };
        const remove = plan.evicted.map((e) => e.id);
        if (plan.replaced && plan.replaced.id !== meta.id) remove.push(plan.replaced.id);
        return { change: { remove, put: { meta, data: incoming.data } }, value: { ok: true, entry: meta, evicted: plan.evicted, replaced: plan.replaced, unchanged: false } };
      });
      if (outcome.done) {
        last = outcome.value;
        break;
      }
      last = { ok: false, reason: outcome.quota ? 'quota' : 'failed', needed: meta.cost, free: 0, budget: Math.min(settings.budgetBytes, ceiling), detail: outcome.detail };
      if (!outcome.quota) break;
      // The browser has less room than the budget assumed. What is stored now is all it
      // will hold: plan again within that, which makes room from the oldest autosaves.
      ceiling = Math.min(ceiling, usedBefore);
    }
    await refreshVault();
    if (last.ok && !last.unchanged) tell({ t: 'changed', from: tabId });
    return last;
  });
}

export async function readSave(id: string): Promise<Uint8Array | null> {
  await openVault();
  try {
    return await backend.read(id);
  } catch {
    return null;
  }
}

async function remove(pick: (existing: StoredSave[]) => StoredSave[]): Promise<StoredSave[]> {
  await openVault();
  const outcome = await backend.atomically<StoredSave[]>((existing) => {
    const gone = pick(existing);
    return { change: gone.length ? { remove: gone.map((e) => e.id) } : null, value: gone };
  });
  // room was freed by hand: let the next write find out afresh what the browser allows
  ceiling = Infinity;
  await refreshVault();
  if (outcome.done && outcome.value.length) tell({ t: 'changed', from: tabId });
  return outcome.done ? outcome.value : [];
}

/** Delete one save. The player asked for exactly this one. */
export function deleteSave(id: string): Promise<StoredSave[]> {
  return serial(() => remove((existing) => existing.filter((e) => e.id === id)));
}

export function deleteAutosaves(): Promise<StoredSave[]> {
  return serial(() => remove((existing) => existing.filter((e) => e.kind === 'auto')));
}

/**
 * Put a manual save under another name (the file itself was renamed by the referee,
 * so `data` carries the new name in its header). Refused when the name is taken.
 */
export function renameSave(id: string, incoming: Incoming): Promise<{ ok: true; entry: StoredSave } | { ok: false; reason: 'taken' | 'missing' | 'failed' }> {
  return serial(async () => {
    await openVault();
    const meta = record(incoming, manualId(incoming.name));
    const outcome = await backend.atomically<{ ok: true; entry: StoredSave } | { ok: false; reason: 'taken' | 'missing' | 'failed' }>((existing) => {
      if (!existing.some((e) => e.id === id)) return { change: null, value: { ok: false, reason: 'missing' } };
      if (meta.id !== id && existing.some((e) => e.id === meta.id)) return { change: null, value: { ok: false, reason: 'taken' } };
      return { change: { remove: meta.id === id ? [] : [id], put: { meta, data: incoming.data } }, value: { ok: true, entry: meta } };
    });
    await refreshVault();
    if (outcome.done && outcome.value.ok) tell({ t: 'changed', from: tabId });
    return outcome.done ? outcome.value : { ok: false, reason: 'failed' };
  });
}

export function setVaultSettings(patch: Partial<VaultSettings>): VaultSettings {
  const settings = clampSettings({ ...state.settings, ...patch });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* kept for this page only */
  }
  set({ settings, usage: usageOf(state.entries, settings.budgetBytes) });
  tell({ t: 'settings', from: tabId });
  return settings;
}

export function resetVaultSettings(): VaultSettings {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* nothing was stored */
  }
  const settings = clampSettings(DEFAULT_SETTINGS);
  set({ settings, usage: usageOf(state.entries, settings.budgetBytes) });
  tell({ t: 'settings', from: tabId });
  return settings;
}

// --- what the autosave reports ---------------------------------------------------------------------

export function noteAutosave(done: NonNullable<VaultState['lastAutosave']>): void {
  set({ lastAutosave: done, autosaveOff: null, autosaveOffDismissed: false });
}

export function noteAutosaveOff(reason: WriteFailure | 'unavailable', needed: number, free: number): void {
  // the same trouble again does not bring back a warning the player has dismissed
  const again = state.autosaveOff?.reason === reason;
  set({ autosaveOff: { reason, needed, free, at: Date.now() }, autosaveOffDismissed: again ? state.autosaveOffDismissed : false });
}

export function dismissAutosaveWarning(): void {
  set({ autosaveOffDismissed: true });
}

export function noteRestored(restored: StoredSave | null, failures: RestoreFailure[]): void {
  set({ restored, restoreFailures: failures });
}

/** For the automated checks only. */
export const vaultDebug = {
  /** The next `n` writes are refused as if the browser were out of room. */
  refuseWrites: (n: number) => { debugRefusals = n; },
  tabId,
  dbName: DB_NAME,
  dbVersion: DB_VERSION,
};
