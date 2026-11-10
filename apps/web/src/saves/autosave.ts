// Autosave and restoration for the browser build.
//
// The server-backed game writes `autosave.json` beside the referee and finds it again
// when it starts. In the browser the referee lives in the page and is gone when the
// page is: here the page keeps the autosave, in the vault, and brings the match back
// when it loads.
//
//   * After every resolved round (and when a match is created or loaded) the match is
//     exported as a compressed save file by the referee, in its worker, and stored.
//     Orders given within a round are saved once the player pauses, and when the tab
//     is hidden or closed, as far as the browser allows that.
//   * Only one write is ever in progress. Changes that arrive meanwhile are
//     coalesced: when the write ends, the state as it is then is saved once. While
//     observer playback runs, autosaves are spaced out so that saving never becomes
//     most of what the worker does.
//   * Nothing here blocks the interface: the export happens in the worker and the
//     write is an asynchronous IndexedDB transaction.
import { api, ApiError } from '../api';
import type { MatchSummary } from '../protocol';
import { readHeader } from './container';
import {
  noteAutosave, noteAutosaveOff, noteRestored, openVault, readSave, vaultState, writeSave,
} from './vault';
import type { RestoreFailure, StoredSave } from './vault';

/** Orders within a round are saved once nothing has changed for this long. */
const IDLE_MS = 1500;
/** While playback runs, at most one autosave is started in this long. */
const PLAYBACK_GAP_MS = 2000;

const TAB_KEY = 'bts.saves.tab';
const FAILED_KEY = 'bts.saves.failed';

let started = false;
let dirty = false;
let writing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let due = 0;
let lastStart = 0;
let playbackRunning = false;
/** Raised while this module itself installs a match (a restore): that is not news to save. */
let suspended = 0;
const stats = { written: 0, skipped: 0, unchanged: 0, coalesced: 0, failed: 0, maxExportMs: 0, maxStoreMs: 0, lastBytes: 0, inFlight: 0, maxInFlight: 0 };

function session(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function setSession(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* this tab simply forgets */ }
}

function schedule(delay: number): void {
  const at = Date.now() + delay;
  if (timer !== null && at >= due) return; // one is already set for sooner
  if (timer !== null) clearTimeout(timer);
  due = at;
  timer = setTimeout(() => {
    timer = null;
    void run();
  }, delay);
}

function run(): Promise<void> {
  if (writing) {
    // the state will be saved as it stands when this write ends
    stats.coalesced++;
    return writing;
  }
  if (!dirty) return Promise.resolve();
  const vault = vaultState();
  if (vault.settings.autosaves <= 0) {
    dirty = false;
    return Promise.resolve();
  }
  if (vault.ready && !vault.durable) {
    // nowhere to keep it that would outlive the page: say so once, and do not pretend
    dirty = false;
    stats.skipped++;
    noteAutosaveOff('unavailable', 0, 0);
    return Promise.resolve();
  }
  dirty = false;
  lastStart = Date.now();
  writing = (async () => {
    stats.inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    try {
      const t0 = performance.now();
      const file = await api.exportSave({ kind: 'auto' });
      const t1 = performance.now();
      const header = readHeader(file);
      if (!header) throw new Error('the referee did not send a save file');
      const result = await writeSave({ kind: 'auto', name: '', created: header.created_ms || Date.now(), data: file, header });
      const t2 = performance.now();
      if (result.ok) {
        setSession(TAB_KEY, header.match_id);
        if (result.unchanged) {
          stats.unchanged++;
        } else {
          stats.written++;
          stats.lastBytes = file.byteLength;
          stats.maxExportMs = Math.max(stats.maxExportMs, t1 - t0);
          stats.maxStoreMs = Math.max(stats.maxStoreMs, t2 - t1);
          noteAutosave({ at: Date.now(), round: header.round, bytes: file.byteLength, exportMs: t1 - t0, storeMs: t2 - t1, evicted: result.evicted.length });
        }
      } else {
        stats.skipped++;
        noteAutosaveOff(result.reason, result.needed, result.free);
      }
    } catch (e) {
      // no match to save, or the engine has stopped (the page says so itself): nothing to report
      if (e instanceof ApiError && (e.status === 404 || e.code === 'ENGINE_FAILURE')) return;
      stats.failed++;
      console.warn('autosave failed', e);
      noteAutosaveOff('failed', 0, 0);
    } finally {
      stats.inFlight--;
      writing = null;
      if (dirty) schedule(playbackRunning ? Math.max(0, lastStart + PLAYBACK_GAP_MS - Date.now()) : 0);
    }
  })();
  return writing;
}

/** Begin keeping autosaves. Does nothing in the server-backed game, where the referee keeps its own. */
export function startAutosave(): void {
  if (started || !api.features.local) return;
  started = true;
  void openVault();
  api.onSessionChange((change) => {
    if (suspended) return;
    playbackRunning = change.running;
    dirty = true;
    // a match made or loaded by the player is no longer "the restored autosave"
    if (change.installed && vaultState().restored) noteRestored(null, vaultState().restoreFailures);
    if (change.installed || change.roundResolved) {
      schedule(change.running ? Math.max(0, lastStart + PLAYBACK_GAP_MS - Date.now()) : 0);
    } else {
      schedule(IDLE_MS);
    }
  });
  // when the tab is hidden or closed, save what has not been saved, as far as the browser lets an
  // asynchronous write finish
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAutosave();
  });
  window.addEventListener('pagehide', () => void flushAutosave());
}

/** Save now whatever has changed since the last autosave, and wait for it. */
export async function flushAutosave(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  await run();
  // a change that arrived during that write
  if (dirty && !writing) await run();
}

/** Resolves once nothing is waiting to be saved (for the automated checks). */
export async function autosaveSettled(): Promise<void> {
  for (let i = 0; i < 50 && (timer !== null || writing || dirty); i++) {
    await flushAutosave();
  }
}

export function autosaveStats(): typeof stats & { pending: boolean } {
  return { ...stats, pending: timer !== null || writing !== null || dirty };
}

// --- restoration ----------------------------------------------------------------------------

export interface Restored {
  entry: StoredSave;
  summary: MatchSummary;
  /** Autosaves that were tried first and could not be loaded, newest first. */
  failed: RestoreFailure[];
  /** This tab was playing that match before it was reloaded. */
  sameTab: boolean;
}

function failedIds(): Set<string> {
  try {
    return new Set(JSON.parse(session(FAILED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Bring back the latest autosave: the match this tab was playing if it has one,
 * otherwise the newest of all. An autosave that will not load is passed over for the
 * next one and reported, never deleted, and not tried again in this tab; if none
 * loads, the page simply has no match. Only called when the referee has no match.
 */
export async function restoreAutosave(): Promise<{ restored: Restored | null; failed: RestoreFailure[] }> {
  if (!api.features.local) return { restored: null, failed: [] };
  await openVault();
  const tabMatch = session(TAB_KEY);
  const autos = vaultState().entries.filter((e) => e.kind === 'auto'); // newest first
  const ordered = [...autos.filter((e) => e.matchId === tabMatch), ...autos.filter((e) => e.matchId !== tabMatch)];
  const skip = failedIds();
  const failed: RestoreFailure[] = [];
  let restored: Restored | null = null;
  suspended++;
  try {
    for (const entry of ordered) {
      if (skip.has(entry.id)) continue;
      const file = await readSave(entry.id);
      try {
        if (!file) throw new ApiError('the autosave is listed but its file is missing', 404, 'NOT_FOUND');
        const summary = await api.importSave(file);
        setSession(TAB_KEY, entry.matchId);
        restored = { entry, summary, failed, sameTab: entry.matchId === tabMatch };
        break;
      } catch (e) {
        skip.add(entry.id);
        setSession(FAILED_KEY, JSON.stringify([...skip]));
        failed.push({ entry, reason: e instanceof ApiError ? e.reason ?? e.code : 'ERROR', message: e instanceof Error ? e.message : String(e) });
        // an engine that died on it is replaced by a fresh one for the next candidate
        if (e instanceof ApiError && e.code === 'ENGINE_FAILURE') api.restartEngine();
      }
    }
  } finally {
    suspended--;
  }
  noteRestored(restored?.entry ?? null, failed);
  return { restored, failed };
}
