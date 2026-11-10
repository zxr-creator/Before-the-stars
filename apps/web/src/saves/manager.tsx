// Saves and storage: every stored save, what the store holds against its budget,
// and the way in and out for save files.
//
// It is one dialog over whatever screen is showing (title or game), mounted once
// beside the app (see ./index.tsx). The browser build shows the vault (IndexedDB)
// with its budget and cleanup; the server-backed game shows the saves folder and the
// exports folder. Import always goes through a preview: the referee says what the
// file is and whether it would load, and only a confirmed, loadable file replaces
// the match. A refused file changes nothing.
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { desktopShell, hasLiveMatch, installMatch, loadSaveEntry, refreshSaves, saveGame, useApp } from '../store';
import { cx } from '../ui';
import { downloadBytes, fileNameFor, readHeader } from './container';
import type { ExportedFile, SaveDescription, SaveEntry, SaveListing } from './types';
import { SAVE_EXTENSION, SAVE_MIME } from './types';
import {
  closeSaveManager, describeRefusal, describeSaveError, fmtAgo, fmtBytes, fmtWhen, openSaveManager, refusalText, saveLabel, saveManagerOpen, useSaveManager,
  useVault,
} from './ui';
import {
  DEFAULT_SETTINGS, MAX_AUTOSAVES, deleteAutosaves, dismissAutosaveWarning, refreshEstimate, refreshVault, requestPersistence, resetVaultSettings,
  setVaultSettings,
} from './vault';
import type { VaultState } from './vault';

const MIB = 1024 * 1024;
/** Nothing larger is even sent to the referee, which has the same limit of its own. */
const MAX_FILE = 64 * MIB;

interface Preview {
  /** Where the file came from: picked or dropped (its bytes), or a file in the server's exports folder. */
  source: { bytes: Uint8Array } | { exported: string };
  fileName: string;
  description: SaveDescription | null;
  /** The file could not even be read or described. */
  error: string | null;
  /** The import was confirmed and then refused. */
  refused: string | null;
  working: boolean;
}

/** A dropped or picked file, on its way to the preview. */
let offered: File | null = null;
const offerListeners = new Set<() => void>();
function offer(file: File): void {
  offered = file;
  openSaveManager();
  for (const l of [...offerListeners]) l();
}

function controllerLabel(controller: string, agent?: string): string {
  if (agent) return t('language model');
  switch (controller) {
    case 'human': return t('player');
    case 'external': return t('external agent');
    case 'native_easy': return t('AI, easy');
    case 'native_medium': return t('AI, medium');
    case 'native_hard': return t('AI, hard');
    default: return controller;
  }
}

function Button({ children, onClick, kind, disabled, testid, icon, title }: {
  children?: preact.ComponentChildren; onClick: () => void; kind?: 'primary' | 'danger' | 'quiet'; disabled?: boolean; testid?: string; icon?: string; title?: string;
}) {
  return (
    <button type="button" class={cx('sv-btn', kind && 'is-' + kind)} disabled={disabled} data-testid={testid} title={title} onClick={onClick}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

function UsageBar({ vault }: { vault: VaultState }) {
  const { used, budget, manualBytes, autoBytes } = vault.usage;
  const pct = (n: number) => `${Math.min(100, (n / Math.max(1, budget)) * 100).toFixed(2)}%`;
  const over = used > budget;
  return (
    <div class="sv-usage" data-testid="saves-usage" data-used={used} data-budget={budget}>
      <div class={cx('sv-bar', over && 'is-over')} role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={used} aria-label={t('Save storage used')}>
        <span class="sv-bar-manual" style={{ width: pct(manualBytes) }} />
        <span class="sv-bar-auto" style={{ width: pct(autoBytes) }} />
      </div>
      <p class="sv-usage-text" data-testid="saves-usage-text">
        <b>{t('{used} of {budget} used', { used: fmtBytes(used), budget: fmtBytes(budget) })}</b>
        <span><i class="sv-key is-manual" />{t('Your saves {n}', { n: fmtBytes(manualBytes) })}</span>
        <span><i class="sv-key is-auto" />{t('Autosaves {n}', { n: fmtBytes(autoBytes) })}</span>
      </p>
      {over ? <p class="sv-note is-warn">{t('More is stored than the budget allows. Nothing is deleted for that, but no autosave will be written until there is room.')}</p> : null}
      {vault.estimate ? (
        <p class="sv-fine" data-testid="saves-estimate">
          {t('The browser reports {usage} used by this site (the game’s own files included) of about {quota} it would allow.', { usage: fmtBytes(vault.estimate.usage), quota: fmtBytes(vault.estimate.quota) })}
        </p>
      ) : null}
    </div>
  );
}

function Row({ entry, local, busy, onLoad, onExport, onRename, onDelete }: {
  entry: SaveEntry; local: boolean; busy: boolean;
  onLoad: () => void; onExport: () => void; onRename: (name: string) => Promise<string | null>; onDelete: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle');
  const [name, setName] = useState(entry.name);
  const [error, setError] = useState<string | null>(null);
  const manual = entry.kind === 'manual';
  const title = manual ? entry.name : t('Autosave');
  const h = entry.header;
  return (
    <li class="sv-row" data-testid={`saves-row-${entry.id}`} data-kind={entry.kind} data-round={h?.round ?? ''} data-match={h?.match_id ?? ''}>
      <div class="sv-row-main">
        <span class="sv-row-icon"><Icon name={manual ? 'save' : 'clock'} size={15} /></span>
        <div class="sv-row-text">
          {mode === 'rename' ? (
            <form class="sv-inline" onSubmit={async (e) => {
              e.preventDefault();
              const failed = await onRename(name.trim());
              if (failed) setError(failed);
              else setMode('idle');
            }}>
              <input class="sv-input" type="text" value={name} maxLength={40} aria-label={t('New name')} data-testid={`saves-rename-input-${entry.id}`}
                onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              <button type="submit" class="sv-btn is-primary" disabled={!name.trim() || busy} data-testid={`saves-rename-confirm-${entry.id}`}><span>{t('Rename')}</span></button>
              <Button kind="quiet" onClick={() => { setMode('idle'); setError(null); setName(entry.name); }}>{t('Cancel')}</Button>
            </form>
          ) : <b class="sv-row-name">{title}</b>}
          <span class="sv-row-what">
            {h ? saveLabel(h) : t('No description (an older save)')}
            {h ? <> · {t('match {id}', { id: h.match_id })} · {t('round {n}', { n: h.round })}</> : null}
          </span>
          <span class="sv-row-meta">{fmtBytes(entry.bytes)} · {fmtWhen(entry.created)}{entry.legacy ? <> · {t('older format')}</> : null}</span>
          {error ? <span class="sv-row-error" role="alert">{error}</span> : null}
        </div>
      </div>
      {mode === 'delete' ? (
        <div class="sv-row-actions" role="alertdialog" aria-label={t('Delete this save?')}>
          <span class="sv-ask">{t('Delete “{name}”? This cannot be undone.', { name: title })}</span>
          <Button kind="danger" disabled={busy} testid={`saves-delete-confirm-${entry.id}`} onClick={() => { setMode('idle'); onDelete(); }}>{t('Delete')}</Button>
          <Button kind="quiet" onClick={() => setMode('idle')}>{t('Keep')}</Button>
        </div>
      ) : mode === 'idle' ? (
        <div class="sv-row-actions">
          <Button kind="primary" disabled={busy} testid={`saves-load-${entry.id}`} onClick={onLoad}>{t('Load')}</Button>
          <Button disabled={busy} icon="download" testid={`saves-export-${entry.id}`} title={t('Export this save to a file')} onClick={onExport}>{t('Export')}</Button>
          {manual ? <Button disabled={busy} testid={`saves-rename-${entry.id}`} onClick={() => { setName(entry.name); setError(null); setMode('rename'); }}>{t('Rename')}</Button> : null}
          {/* a save the player made is only deleted after a second, explicit yes; an autosave is the game's own */}
          <Button disabled={busy} icon="trash" testid={`saves-delete-${entry.id}`} title={t('Delete')} onClick={() => (manual || !local ? setMode('delete') : onDelete())} />
        </div>
      ) : null}
    </li>
  );
}

function PreviewPane({ preview, live, onConfirm, onCancel }: { preview: Preview; live: boolean; onConfirm: () => void; onCancel: () => void }) {
  const d = preview.description;
  const h = d?.header ?? null;
  const build = d?.build ?? null;
  const versions: { label: string; theirs: string; ours: string | undefined }[] = h ? [
    { label: t('Game'), theirs: h.game, ours: d?.game },
    { label: t('Rules'), theirs: h.versions.ruleset, ours: build?.ruleset },
    { label: t('Content'), theirs: h.versions.content, ours: build?.content },
    { label: t('World generator'), theirs: h.versions.generator, ours: build?.generator },
    { label: t('AI policy'), theirs: h.versions.policy, ours: build?.policy },
  ] : [];
  return (
    <section class="sv-preview" data-testid="saves-preview" data-loadable={d ? String(d.loadable) : 'false'} data-reason={d?.reason ?? (preview.error ? 'ERROR' : '')}>
      <h3>{t('Import a save file')}</h3>
      <p class="sv-file"><Icon name="save" size={14} /> <b>{preview.fileName}</b>{d ? <> · {fmtBytes(d.bytes)}</> : null}</p>
      {!d && !preview.error ? <p class="sv-wait"><span class="spinner" aria-hidden="true" /> {t('Checking the file…')}</p> : null}
      {preview.error ? <p class="sv-note is-bad" role="alert" data-testid="saves-preview-reason"><Icon name="warn" size={14} /> {preview.error}</p> : null}
      {h ? (
        <dl class="sv-facts">
          <div><dt>{t('Match')}</dt><dd>{saveLabel(h)} <small>{h.match_id}</small></dd></div>
          <div><dt>{t('Reached')}</dt><dd>{t('Year {n}', { n: h.year })} · {t('round {n}', { n: h.round })} · {t('{n} regions', { n: h.regions })}{h.seed !== undefined ? <> · {t('seed “{seed}”', { seed: h.seed })}</> : null}</dd></div>
          <div><dt>{t('Saved')}</dt><dd>{fmtWhen(h.created_ms)} · {h.kind === 'auto' ? t('autosave') : h.name ? t('saved as “{name}”', { name: h.name }) : t('manual save')}</dd></div>
          <div><dt>{t('Seats')}</dt><dd>
            <ul class="sv-seats">
              {h.seats.map((s) => <li><b>{tc(s.name)}</b> <span>{controllerLabel(s.controller, s.agent)}{s.status === 'eliminated' ? <> · {t('eliminated')}</> : s.status === 'forfeited' ? <> · {t('withdrawn')}</> : null}</span></li>)}
            </ul>
          </dd></div>
          <div><dt>{t('Size')}</dt><dd>{d?.legacy ? fmtBytes(h.length) : t('{stored} in the file, {length} unpacked', { stored: fmtBytes(h.stored), length: fmtBytes(h.length) })}</dd></div>
          <div><dt>{t('Versions')}</dt><dd>
            <table class="sv-versions">
              <thead><tr><th /><th>{t('This file')}</th><th>{t('This game')}</th></tr></thead>
              <tbody>
                {versions.map((v) => (
                  <tr class={cx(v.ours !== undefined && v.ours !== v.theirs && 'is-different')}><th>{v.label}</th><td>{v.theirs}</td><td>{v.ours ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </dd></div>
        </dl>
      ) : null}
      {d && !d.loadable ? (
        <p class="sv-note is-bad" role="alert" data-testid="saves-preview-reason">
          <Icon name="warn" size={14} /> <span><b>{t('This file cannot be loaded.')}</b> {describeRefusal(d)}
            {/* the referee's own words, unless the sentence above already says exactly that */}
            {d.message && d.reason !== 'INCOMPATIBLE' ? <small> {tc(d.message)}</small> : null}</span>
        </p>
      ) : null}
      {d?.loadable ? (
        <p class="sv-note is-ok" data-testid="saves-preview-ok"><Icon name="check" size={14} /> {d.legacy ? t('This is a save in the older text format. It has been checked and can be loaded.') : t('The file is intact and can be loaded.')}</p>
      ) : null}
      {preview.refused ? <p class="sv-note is-bad" role="alert" data-testid="saves-preview-refused"><Icon name="warn" size={14} /> {preview.refused} {t('The game in progress was not changed.')}</p> : null}
      {d?.loadable && live ? <p class="sv-fine">{t('Loading it replaces the game in progress. Save or export that game first if you want to keep it.')}</p> : null}
      <div class="sv-actions">
        <Button kind="quiet" testid="saves-preview-cancel" onClick={onCancel}>{d?.loadable ? t('Cancel') : t('Close')}</Button>
        {d?.loadable ? (
          <Button kind={live ? 'danger' : 'primary'} disabled={preview.working} testid="saves-preview-confirm" onClick={onConfirm}>
            {live ? t('Replace the current game') : t('Load this save')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function SaveManager({ notice }: { notice: string | null }) {
  const app = useApp();
  useLocale();
  const vault = useVault();
  const local = api.features.local;
  const desktop = desktopShell();
  const live = hasLiveMatch();
  const [listing, setListing] = useState<SaveListing | null>(null);
  const [exported, setExported] = useState<{ dir: string; files: ExportedFile[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string; path?: string; file?: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saveName, setSaveName] = useState(() => `year-${Math.floor((app.obs?.month ?? app.summary?.month ?? 0) / 12) + 1}`);
  const [budgetText, setBudgetText] = useState(() => String(Math.round((vault.settings.budgetBytes / MIB) * 100) / 100));
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      if (local) await refreshVault();
      else {
        setListing(await api.saveList());
        setExported(await api.exportsFolder.list().catch(() => null));
      }
    } catch (e) {
      setMessage({ tone: 'bad', text: describeSaveError(e) });
    }
    void refreshSaves();
  };
  useEffect(() => {
    void reload();
    if (local) void refreshEstimate();
  }, []);

  // the vault is live in the browser build; the server's folder is read when asked
  const entries: SaveEntry[] = local
    ? vault.entries.map((e) => ({ id: e.id, name: e.name, kind: e.kind, bytes: e.cost, created: e.created, header: e.header }))
    : listing?.entries ?? [];
  const manual = entries.filter((e) => e.kind === 'manual');
  const autos = entries.filter((e) => e.kind === 'auto');

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      setMessage({ tone: 'bad', text: describeSaveError(e) });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  /** A save file leaves: as a download, or (in the desktop window, which cannot download) written by the referee. */
  const deliver = (get: () => Promise<Uint8Array>, name: string | undefined, header: SaveEntry['header']) => run(async () => {
    if (desktop && !local) {
      const written = await api.exportsFolder.write(name);
      setMessage({ tone: 'ok', text: t('Exported to {path}', { path: written.path }), path: written.path, file: written.file });
      return;
    }
    const file = await get();
    const fileName = fileNameFor(header ?? readHeader(file));
    downloadBytes(file, fileName, SAVE_MIME);
    setMessage({ tone: 'ok', text: t('Exported as {file} ({size}). Your browser has put it with your downloads.', { file: fileName, size: fmtBytes(file.byteLength) }) });
  });

  const describe = async (source: Preview['source'], fileName: string) => {
    const base: Preview = { source, fileName, description: null, error: null, refused: null, working: false };
    setPreview(base);
    try {
      const description = 'bytes' in source ? await api.describeSave(source.bytes) : await api.exportsFolder.describe(source.exported);
      setPreview({ ...base, description });
    } catch (e) {
      setPreview({ ...base, error: describeSaveError(e) });
    }
  };

  const take = async (file: File) => {
    setMessage(null);
    if (file.size > MAX_FILE) {
      setPreview({ source: { bytes: new Uint8Array() }, fileName: file.name, description: null, error: `${refusalText('TOO_LARGE')} (${fmtBytes(file.size)})`, refused: null, working: false });
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (e) {
      setPreview({ source: { bytes: new Uint8Array() }, fileName: file.name, description: null, error: t('The file could not be read: {why}', { why: e instanceof Error ? e.message : String(e) }), refused: null, working: false });
      return;
    }
    await describe({ bytes }, file.name);
  };

  // a file dropped anywhere, or handed over by the layer that opened this dialog
  useEffect(() => {
    const pending = () => {
      if (!offered) return;
      const file = offered;
      offered = null;
      void take(file);
    };
    offerListeners.add(pending);
    pending();
    return () => { offerListeners.delete(pending); };
  }, []);

  const confirmImport = async () => {
    if (!preview?.description?.loadable) return;
    const source = preview.source;
    setPreview({ ...preview, working: true, refused: null });
    const failed = await installMatch(() => ('bytes' in source ? api.importSave(source.bytes) : api.exportsFolder.import(source.exported)));
    if (failed === null) {
      setPreview(null);
      closeSaveManager();
    } else {
      setPreview({ ...preview, working: false, refused: describeSaveError(failed) });
    }
  };

  const applyBudget = (text: string) => {
    setBudgetText(text);
    const mib = Number(text);
    if (text.trim() !== '' && Number.isFinite(mib) && mib > 0) setVaultSettings({ budgetBytes: Math.round(mib * MIB) });
  };

  const problem = vault.problem === 'unavailable'
    ? t('This browser is not letting the game keep saves (a private window, or storage blocked for this site). Saves made now last only until this tab is closed, and nothing is restored after a reload. Export a game to a file to keep it.')
    : vault.problem === 'newer'
      ? t('The saves stored for this site were written by a newer version of the game, and this version will not touch them. Reload the page to get the current version. Until then, saves last only until this tab is closed.')
      : vault.problem === 'stale'
        ? t('The game was updated in another tab, and the stored saves now belong to the newer version. Reload this page before saving anything.')
        : null;

  return (
    <div class="sv-scrim" onClick={closeSaveManager}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer?.files?.[0]; if (f) void take(f); }}>
      <div class={cx('sv-dialog', dragging && 'is-dragging')} role="dialog" aria-modal="true" aria-label={t('Saves and storage')} data-testid="saves-manager" data-mode={local ? 'local' : 'http'}
        data-durable={String(!local || vault.durable)} onClick={(e) => e.stopPropagation()}>
        <header class="sv-head">
          <span class="sv-crest" aria-hidden="true"><Icon name="save" size={18} /></span>
          <h2>{t('Saves and storage')}</h2>
          <button type="button" class="sv-x" aria-label={t('Close')} data-testid="saves-close" onClick={closeSaveManager}><Icon name="close" size={15} /></button>
        </header>

        {preview ? (
          <div class="sv-body"><PreviewPane preview={preview} live={live} onConfirm={() => void confirmImport()} onCancel={() => setPreview(null)} /></div>
        ) : (
          <div class="sv-body">
            {notice ? <p class="sv-note is-bad" role="alert" data-testid="saves-notice"><Icon name="warn" size={14} /> {notice}</p> : null}
            {local && problem ? <p class="sv-note is-bad" role="alert" data-testid="saves-problem" data-problem={vault.problem ?? ''}><Icon name="warn" size={14} /> {problem}</p> : null}
            {local && vault.otherTabs > 0 ? (
              <p class="sv-note is-warn" data-testid="saves-tabs-warning"><Icon name="warn" size={14} /> {t('The game is open in {n} other tab(s). All tabs share these saves and the same autosave slots, so one tab’s autosaves push out another’s. Play in one tab, or make a named save in each.', { n: vault.otherTabs })}</p>
            ) : null}
            {local && vault.autosaveOff ? (
              <p class="sv-note is-warn" data-testid="saves-autosave-off"><Icon name="warn" size={14} /> {autosaveOffText(vault)}</p>
            ) : null}
            {local && vault.restoreFailures.length ? (
              <p class="sv-note is-warn" data-testid="saves-restore-failures"><Icon name="warn" size={14} /> {t('{n} autosave(s) could not be loaded when the page opened and were passed over. They are still listed below; export one to look at it elsewhere, or delete it.', { n: vault.restoreFailures.length })}
                {vault.restoreFailures.map((f) => <small> {fmtWhen(f.entry.created)}: {refusalText(f.reason)}</small>)}
              </p>
            ) : null}
            {message ? (
              <p class={cx('sv-note', message.tone === 'ok' ? 'is-ok' : 'is-bad')} role={message.tone === 'bad' ? 'alert' : 'status'} data-testid="saves-message" data-tone={message.tone}>
                <Icon name={message.tone === 'ok' ? 'check' : 'warn'} size={14} /> <span>{message.text}</span>
                {message.file ? <Button kind="quiet" testid="saves-reveal" onClick={() => void api.exportsFolder.reveal(message.file).catch(() => undefined)}>{t('Show in folder')}</Button> : null}
              </p>
            ) : null}

            {local ? <UsageBar vault={vault} /> : listing ? (
              <p class="sv-fine" data-testid="saves-folder">{t('Saves are files in {dir} ({size} in all).', { dir: listing.dir ?? '', size: fmtBytes(listing.totalBytes) })}</p>
            ) : null}

            <section class="sv-section">
              <h3>{t('This game')}</h3>
              {live ? (
                <div class="sv-tools">
                  <form class="sv-inline" onSubmit={(e) => { e.preventDefault(); if (saveName.trim()) void run(async () => { if (await saveGame(saveName.trim())) setMessage({ tone: 'ok', text: t('Saved as “{name}”.', { name: saveName.trim() }) }); }); }}>
                    <input class="sv-input" type="text" value={saveName} maxLength={40} aria-label={t('Save name')} data-testid="saves-name" onInput={(e) => setSaveName((e.target as HTMLInputElement).value)} />
                    <button type="submit" class="sv-btn is-primary" disabled={busy || !saveName.trim()} data-testid="saves-save"><Icon name="save" size={14} /><span>{t('Save')}</span></button>
                  </form>
                  <Button icon="download" disabled={busy} testid="saves-export-current" onClick={() => void deliver(() => api.exportSave({ kind: 'manual' }), undefined, null)}>{t('Export to a file…')}</Button>
                </div>
              ) : <p class="sv-fine">{t('No match is in progress.')}</p>}
              <div class="sv-tools">
                <Button icon="up" disabled={busy} testid="saves-import" onClick={() => picker.current?.click()}>{t('Import a save file…')}</Button>
                <span class="sv-fine">{t('or drop a .{ext} file on this window', { ext: SAVE_EXTENSION })}</span>
                <input ref={picker} type="file" accept={`.${SAVE_EXTENSION},.json,${SAVE_MIME}`} class="sv-file-input" data-testid="saves-import-input"
                  onChange={(e) => { const input = e.target as HTMLInputElement; const f = input.files?.[0]; input.value = ''; if (f) void take(f); }} />
              </div>
            </section>

            <section class="sv-section">
              <h3>{t('Your saves')} <small>{manual.length}</small></h3>
              {manual.length ? (
                <ul class="sv-list" data-testid="saves-manual">
                  {manual.map((e) => (
                    <Row key={e.id} entry={e} local={local} busy={busy || app.busy}
                      onLoad={() => void run(async () => { const failed = await loadSaveEntry(e.id); if (failed) throw new Error(failed); closeSaveManager(); })}
                      onExport={() => void deliver(() => api.saveFile(e.id), e.name, e.header)}
                      onRename={async (name) => { try { await api.renameSave(e.id, name); await reload(); return null; } catch (err) { return describeSaveError(err); } }}
                      onDelete={() => void run(async () => { await api.deleteSave(e.id); })} />
                  ))}
                </ul>
              ) : <p class="sv-empty">{t('No saves of your own yet. Name one above, or use Save in the game menu.')}</p>}
            </section>

            <section class="sv-section">
              <h3>{t('Autosaves')} <small>{autos.length}</small>
                {local && autos.length ? <Button kind="quiet" icon="trash" disabled={busy} testid="saves-delete-autos" onClick={() => void run(async () => { await deleteAutosaves(); })}>{t('Delete all autosaves')}</Button> : null}
              </h3>
              {autos.length ? (
                <ul class="sv-list" data-testid="saves-autos">
                  {autos.map((e) => (
                    <Row key={e.id} entry={e} local={local} busy={busy || app.busy}
                      onLoad={() => void run(async () => { const failed = await loadSaveEntry(e.id); if (failed) throw new Error(failed); closeSaveManager(); })}
                      onExport={() => void deliver(() => api.saveFile(e.id), e.name, e.header)}
                      onRename={async () => null}
                      onDelete={() => void run(async () => { await api.deleteSave(e.id); })} />
                  ))}
                </ul>
              ) : <p class="sv-empty">{local ? t('No autosave yet. One is written after every round, and the newest {n} are kept.', { n: vault.settings.autosaves }) : t('No autosave yet. The referee writes one after every round.')}</p>}
              {local && vault.lastAutosave ? <p class="sv-fine" data-testid="saves-last-autosave">{t('Last autosave {when}: round {round}, {size}.', { when: fmtAgo(vault.lastAutosave.at), round: vault.lastAutosave.round, size: fmtBytes(vault.lastAutosave.bytes) })}</p> : null}
            </section>

            {local ? (
              <section class="sv-section">
                <h3>{t('Storage settings')}</h3>
                <div class="sv-settings">
                  <label>
                    <span>{t('Save budget (MiB)')}</span>
                    <input class="sv-input is-num" type="number" min={1} max={4096} step={1} value={budgetText} data-testid="saves-budget" onInput={(e) => applyBudget((e.target as HTMLInputElement).value)} />
                  </label>
                  <label>
                    <span>{t('Autosaves kept')}</span>
                    <input class="sv-input is-num" type="number" min={0} max={MAX_AUTOSAVES} step={1} value={vault.settings.autosaves} data-testid="saves-autocount"
                      onInput={(e) => { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n)) setVaultSettings({ autosaves: n }); }} />
                  </label>
                  <Button kind="quiet" testid="saves-settings-reset" onClick={() => { const s = resetVaultSettings(); setBudgetText(String(Math.round((s.budgetBytes / MIB) * 100) / 100)); }}>
                    {t('Defaults ({mib} MiB, {n} autosaves)', { mib: Math.round((DEFAULT_SETTINGS.budgetBytes / MIB) * 100) / 100, n: DEFAULT_SETTINGS.autosaves })}
                  </Button>
                </div>
                <p class="sv-fine">{t('When room is needed the oldest autosaves are removed first. A save you made yourself is never removed automatically: if one does not fit, it is refused and you decide what to delete. Setting autosaves to 0 turns autosave off.')}</p>
                <div class="sv-tools" data-testid="saves-persist" data-persisted={String(vault.persisted)}>
                  <span class="sv-fine">
                    {vault.persisted === true ? t('The browser has agreed to keep this site’s data: it will not clear these saves to free space.')
                      : vault.persisted === false ? t('The browser may clear this site’s data if the device runs short of space. You can ask it not to.')
                      : t('This browser does not say whether it may clear this site’s data.')}
                  </span>
                  {vault.persisted === false ? <Button kind="quiet" testid="saves-persist-ask" onClick={() => void requestPersistence()}>{t('Ask the browser to keep these saves')}</Button> : null}
                </div>
              </section>
            ) : (
              <section class="sv-section" data-testid="saves-exports">
                <h3>{t('Exports folder')}
                  <Button kind="quiet" testid="saves-reveal-folder" onClick={() => void api.exportsFolder.reveal().catch(() => undefined)}>{t('Show in folder')}</Button>
                </h3>
                <p class="sv-fine">{desktop
                  ? t('Exported files are written to {dir}. To import a file, pick it with “Import a save file…”, or put it in that folder and choose it below.', { dir: exported?.dir ?? listing?.exportsDir ?? '' })
                  : t('Files in {dir} on the machine that runs the game can be imported from here.', { dir: exported?.dir ?? listing?.exportsDir ?? '' })}</p>
                {exported?.files.length ? (
                  <ul class="sv-list">
                    {exported.files.map((f) => (
                      <li class="sv-row" data-testid={`saves-exported-${f.file}`}>
                        <div class="sv-row-main">
                          <span class="sv-row-icon"><Icon name="download" size={15} /></span>
                          <div class="sv-row-text">
                            <b class="sv-row-name">{f.file}</b>
                            <span class="sv-row-what">{f.header ? saveLabel(f.header) : f.reason ? refusalText(f.reason) : t('No description (an older save)')}</span>
                            <span class="sv-row-meta">{fmtBytes(f.bytes)} · {fmtWhen(f.modified_ms)}</span>
                          </div>
                        </div>
                        <div class="sv-row-actions">
                          <Button disabled={busy} testid={`saves-exported-import-${f.file}`} onClick={() => void describe({ exported: f.file }, f.file)}>{t('Import…')}</Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p class="sv-empty">{t('The folder holds no save files.')}</p>}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function autosaveOffText(vault: VaultState): string {
  const off = vault.autosaveOff;
  if (!off) return '';
  if (off.reason === 'unavailable') return t('Autosave is off: this browser is not letting the game keep saves. Export the game to a file to keep it.');
  if (off.reason === 'full') {
    return t('Autosave is off until space is freed: an autosave needs {needed}, and only {free} of the save budget is not taken by your own saves. Delete or export a save, or raise the budget.', { needed: fmtBytes(off.needed), free: fmtBytes(off.free) });
  }
  if (off.reason === 'quota') return t('Autosave is off until space is freed: the browser has no room left for this site.');
  return t('Autosave is off: the last autosave could not be written.');
}

/** The standing warning that autosave is not being written. It stays until space is freed or it is dismissed. */
function AutosaveWarning({ vault }: { vault: VaultState }) {
  if (!api.features.local || !vault.autosaveOff || vault.autosaveOffDismissed) return null;
  return (
    <div class="sv-warning" role="alert" data-testid="saves-warning-autosave" data-reason={vault.autosaveOff.reason}>
      <Icon name="warn" size={15} />
      <span>{autosaveOffText(vault)}</span>
      <button type="button" class="sv-btn is-quiet" data-testid="saves-warning-manage" onClick={() => openSaveManager()}><span>{t('Saves and storage')}</span></button>
      <button type="button" class="sv-x" aria-label={t('Dismiss')} data-testid="saves-warning-dismiss" onClick={dismissAutosaveWarning}><Icon name="close" size={13} /></button>
    </div>
  );
}

/**
 * Mounted once beside the app: the storage manager when it is open, the standing
 * autosave warning, and a drop target so a save file dragged onto the game opens the
 * import preview.
 */
export function SavesLayer() {
  useLocale();
  const manager = useSaveManager();
  const vault = useVault();
  useEffect(() => {
    const files = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files');
    const over = (e: DragEvent) => { if (files(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!files(e) || e.defaultPrevented) return;
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) offer(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);
  useEffect(() => {
    if (!manager.open) return undefined;
    // Esc closes this dialog and nothing beneath it
    const key = (e: KeyboardEvent) => {
      // (the listener can outlive the dialog by a frame: only an open dialog takes the key)
      if (e.key !== 'Escape' || !saveManagerOpen()) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeSaveManager();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [manager.open]);
  return (
    <>
      <AutosaveWarning vault={vault} />
      {manager.open ? <SaveManager notice={manager.notice} /> : null}
    </>
  );
}
