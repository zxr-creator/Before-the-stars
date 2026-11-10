// Saves: the portable save file, the browser's vault, autosave and restoration, and
// the storage manager. See docs/saves.md.
//
//   types.ts      what a save file and a stored save look like to the client
//   container.ts  reading a file's plain header, file names, downloads
//   vault.ts      the browser build's store: IndexedDB, the budget, eviction, other tabs
//   autosave.ts   autosave after each round, and bringing the match back on load
//   ui.ts         shared wording and whether the manager is open
//   manager.tsx   the "Saves and storage" dialog and the standing autosave warning
import { render } from 'preact';
import './saves.css';
import { api } from '../api';
import { autosaveSettled, autosaveStats, flushAutosave } from './autosave';
import { SavesLayer } from './manager';
import { closeSaveManager, openSaveManager } from './ui';
import { refreshVault, resetVaultSettings, setVaultSettings, vaultDebug, vaultState } from './vault';

export { openSaveManager, closeSaveManager } from './ui';

/** Mount the saves layer beside the app, so it shows over the title screen and the game alike. */
export function mountSaves(): void {
  if (document.getElementById('saves-layer')) return;
  const host = document.createElement('div');
  host.id = 'saves-layer';
  document.body.appendChild(host);
  render(<SavesLayer />, host);
}

// For the browser console and the automated checks (scripts/pages-smoke.mjs). Nothing
// here can do what the interface cannot, except make a write fail on purpose.
if (typeof window !== 'undefined') {
  (window as unknown as { __btsSaves?: unknown }).__btsSaves = {
    state: vaultState,
    refresh: refreshVault,
    settings: setVaultSettings,
    resetSettings: resetVaultSettings,
    /** Wait until nothing is waiting to be autosaved. */
    settled: autosaveSettled,
    flush: flushAutosave,
    stats: autosaveStats,
    open: openSaveManager,
    close: closeSaveManager,
    refuseWrites: vaultDebug.refuseWrites,
    dbName: vaultDebug.dbName,
    mode: api.mode,
  };
}
