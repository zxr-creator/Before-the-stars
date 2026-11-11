// What the save screens share: whether the storage manager is open, and how a save,
// a size, a date and a refusal are put into words.
import { useEffect, useState } from 'preact/hooks';
import { ApiError, SaveNotStored } from '../api';
import { getLocale, t, tc } from '../i18n';
import { histYear } from '../format';
import type { SaveDescription, SaveHeader, SaveVersions } from './types';
import { subscribeVault, vaultState } from './vault';
import type { VaultState } from './vault';

// --- the storage manager, open or shut ---------------------------------------------------

interface ManagerState {
  open: boolean;
  /** Why it was opened for the player (a save that did not fit), shown at the top. */
  notice: string | null;
}

let manager: ManagerState = { open: false, notice: null };
const listeners = new Set<() => void>();

function setManager(next: ManagerState): void {
  manager = next;
  for (const l of [...listeners]) l();
}

export function openSaveManager(notice: string | null = null): void {
  setManager({ open: true, notice });
}

export function closeSaveManager(): void {
  if (manager.open) setManager({ open: false, notice: null });
}

export function saveManagerOpen(): boolean {
  return manager.open;
}

export function useSaveManager(): ManagerState {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return manager;
}

export function useVault(): VaultState {
  const [, bump] = useState(0);
  useEffect(() => subscribeVault(() => bump((n) => n + 1)), []);
  return vaultState();
}

// --- words -------------------------------------------------------------------------------

const MIB = 1024 * 1024;

/** A size in binary units, as the budget is counted. */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= MIB) return t('{n} MiB', { n: (n / MIB).toFixed(n >= 100 * MIB ? 0 : n >= 10 * MIB ? 1 : 2) });
  if (n >= 1024) return t('{n} KiB', { n: Math.round(n / 1024) });
  return t('{n} bytes', { n: Math.round(n) });
}

/** A moment on the player's clock, in the interface language. */
export function fmtWhen(ms: number): string {
  if (!ms) return t('date unknown');
  try {
    const date = new Date(ms);
    // the year only when it is not this one, so the line stays short where space is tight
    const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
    return new Intl.DateTimeFormat(getLocale() === 'en' ? 'en' : getLocale() === 'zh-Hant' ? 'zh-Hant' : 'zh-Hans', { year, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  } catch {
    return new Date(ms).toLocaleString();
  }
}

/** "3 minutes ago" for something recent, the date otherwise. */
export function fmtAgo(ms: number): string {
  if (!ms) return t('date unknown');
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return t('just now');
  if (seconds < 3600) return t('{n} min ago', { n: Math.floor(seconds / 60) });
  return fmtWhen(ms);
}

/** The line that says which game a save holds. */
export function saveLabel(header: SaveHeader | null): string {
  if (!header) return t('unreadable save');
  const human = header.seats.find((s) => s.controller === 'human');
  const who = human ? tc(human.name) : t('Observer match');
  if (header.date && Number.isFinite(header.date.year)) {
    const when = histYear(header.date.year);
    return header.finished ? t('{who} · {date} · finished', { who, date: when }) : t('{who} · {date}', { who, date: when });
  }
  return header.finished ? t('{who} · Year {n} · finished', { who, n: header.year }) : t('{who} · Year {n}', { who, n: header.year });
}

/** The versions a file must share with this game to be played, in the order the referee checks them. */
const DECIDING: (keyof SaveVersions)[] = ['ruleset', 'content', 'session'];

/** Why the referee would not load a file, as one sentence for the player. */
export function refusalText(reason: string | null | undefined, header?: SaveHeader | null, build?: SaveVersions | null): string {
  switch (reason) {
    case 'NOT_A_SAVE': return t('This is not a Before the Stars save file.');
    case 'TRUNCATED': return t('The file is incomplete: part of it is missing. It may not have finished downloading or copying.');
    case 'FORMAT_VERSION': return t('The file was written by a newer version of the game than this one.');
    case 'BAD_HEADER': return t('The file’s description cannot be read.');
    case 'INCOMPATIBLE': {
      const differing = header && build ? DECIDING.find((key) => header.versions[key] !== build[key]) : undefined;
      if (differing && header && build) {
        return t('This file was saved by {theirs}; this game runs {ours}.', { theirs: header.versions[differing], ours: build[differing] });
      }
      return t('The file was saved by a different version of the game’s rules and cannot be played by this one.');
    }
    case 'TOO_LARGE': return t('The file is larger than this game accepts.');
    case 'CORRUPT': return t('The file is damaged: its contents do not match its checksum.');
    case 'UNPLAYABLE': return t('The file is intact, but the match inside cannot be played by this version of the game.');
    case 'NEEDS_SERVER': return t('The match has a seat played by a language model, which needs the server-backed game.');
    default: return t('The save could not be loaded.');
  }
}

/** A refusal with the referee's own detail after it. */
export function describeRefusal(d: SaveDescription): string {
  return refusalText(d.reason, d.header, d.build);
}

/** Why a save was not stored in the browser's vault. */
export function notStoredText(e: SaveNotStored): string {
  if (e.why === 'full') {
    return t('This save needs {needed}, but only {free} of the {budget} save budget would be free even with every autosave removed. Nothing was deleted. Delete a manual save, export some to files, or raise the budget.', {
      needed: fmtBytes(e.needed), free: fmtBytes(e.free), budget: fmtBytes(e.budget),
    });
  }
  if (e.why === 'quota') {
    return t('The browser has no room left for this save ({needed}). Nothing was deleted. Free some space, or export the game to a file instead.', { needed: fmtBytes(e.needed) });
  }
  return t('The browser could not store this save. Export the game to a file instead.');
}

/** Any error from a save operation, in the player's language. */
export function describeSaveError(e: unknown): string {
  if (e instanceof SaveNotStored) return notStoredText(e);
  if (e instanceof ApiError && e.reason) return `${refusalText(e.reason)} (${tc(e.message)})`;
  if (e instanceof ApiError) return tc(e.message);
  if (e instanceof Error) return e.message;
  return String(e);
}
