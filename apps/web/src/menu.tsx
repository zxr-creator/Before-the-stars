// Game menu: language, save, load, records, help, new match, withdraw, quit.
import { useState } from 'preact/hooks';
import { api } from './api';
import { Btn, Section } from './ui';
import { act, canQuit, desktopShell, loadGame, openOverlay, quitGame, saveGame, setMenu, setScreen, toast, useApp } from './store';
import { openSaveManager } from './saves/ui';
import { Icon } from './icons';
import { t, tc, useLocale } from './i18n';
import { LanguageSwitch } from './setup';
import { BrandMark } from './theme/brand';
import { startTutorial } from './tutorial';
import { SoundSettings } from './audio/SoundSettings';

export function GameMenu() {
  const s = useApp();
  useLocale();
  const obs = s.obs;
  const summary = s.summary;
  const month = obs?.month ?? summary?.month ?? 0;
  // a default save name: the calendar year where the referee keeps one ("5000bc"), else the game year
  const date = obs?.date ?? summary?.date ?? null;
  const [name, setName] = useState(date ? `${Math.abs(date.year) || 1}${date.year <= 0 ? 'bc' : 'ad'}` : `year-${Math.floor(month / 12) + 1}`);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const watching = s.mode === 'observe';
  const playing = !!obs && !watching;
  const desktop = desktopShell();
  const [viewer, setViewer] = useState<{ title: string; text: string | null; file: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Exports never open a new tab or window: they download in place, and the
  // text can always be read and copied from an in-app viewer.
  const view = async (format: 'md' | 'json') => {
    if (!obs) return;
    const file = `chronicle-${obs.civ.name}.${format}`;
    const title = format === 'md' ? t('Chronicle (Markdown)') : t('Chronicle (JSON)');
    setCopied(false);
    setViewer({ title, text: null, file });
    try {
      setViewer({ title, text: await api.chronicleText(obs.seat, format), file });
    } catch (e) {
      setViewer({ title, text: '', file, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const copy = async () => {
    if (!viewer?.text) return;
    try {
      await navigator.clipboard.writeText(viewer.text);
      setCopied(true);
    } catch {
      const el = document.querySelector<HTMLTextAreaElement>('.export-text');
      el?.select();
      setCopied(document.execCommand?.('copy') ?? false);
    }
  };
  const download = () => {
    if (!viewer?.text) return;
    const url = URL.createObjectURL(new Blob([viewer.text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = viewer.file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (viewer) {
    return (
      <div class="menu-scrim is-center" onClick={() => setViewer(null)}>
        <div class="export-viewer" role="dialog" aria-label={viewer.title} data-testid="export-viewer" data-esc-layer onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setViewer(null); } }}>
          <header class="drawer-head menu-head">
            <span class="drawer-crest" aria-hidden="true"><Icon name="chronicle" size={18} /></span>
            <h2>{viewer.title}</h2>
            <Btn kind="ghost" small nav icon="close" title={t('Close (Esc)')} onClick={() => setViewer(null)} />
          </header>
          {viewer.error ? <p class="action-note is-bad" role="alert">{viewer.error}</p>
            : viewer.text === null ? <p class="export-wait"><span class="spinner" aria-hidden="true" /> {t('Fetching the record…')}</p>
            : <textarea class="text export-text" readOnly spellcheck={false} value={viewer.text} />}
          <div class="row-end">
            <span class="muted small" role="status">{copied ? t('Copied.') : viewer.file}</span>
            <Btn nav icon="download" disabled={!viewer.text} onClick={download}>{t('Download')}</Btn>
            <Btn kind="primary" nav icon="check" disabled={!viewer.text} testid="export-copy" onClick={() => void copy()}>{t('Copy all')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="menu-scrim" onClick={() => setMenu(false)}>
      <div class="menu" role="dialog" aria-label={t('Game menu')} data-testid="game-menu" onClick={(e) => e.stopPropagation()}>
        <header class="drawer-head menu-head">
          <BrandMark size={30} />
          <h2>{t('Before the Stars')}</h2>
          <Btn kind="ghost" small nav icon="close" title={t('Close (Esc)')} onClick={() => setMenu(false)} />
        </header>
        <div class="menu-body">
          <p class="muted small">
            {t('Match {id} · seed “{seed}” · {n} regions', { id: summary?.match_id ?? '', seed: summary?.seed ?? '', n: summary?.regions ?? 0 })} · {summary?.disclosed_objective ? t('disclosed objective') : t('objective by discovery')}
            {watching ? <> · {t('observer mode')}</> : null}
          </p>
          <Section title={t('Language')}>
            <LanguageSwitch compact />
          </Section>
          <Section title={t('Sound')}>
            <SoundSettings />
          </Section>
          <Section title={t('Save')}>
            <form class="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void saveGame(name.trim()); }}>
              <input class="text" type="text" value={name} maxLength={40} aria-label={t('Save name')} data-testid="save-name" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              <Btn type="submit" nav icon="save" disabled={!name.trim()}>{t('Save')}</Btn>
            </form>
            {api.features.durableSaves ? null : <p class="muted small" data-testid="save-local-note">{t('This browser is not letting the game keep saves: a named save lasts only until this page is closed or reloaded. Export the game to a file to keep it.')}</p>}
            <div class="row wrap">
              <Btn nav icon="layers" testid="menu-saves" onClick={() => openSaveManager()}>{t('Saves and storage…')}</Btn>
            </div>
            <p class="muted small">{t('Export the game to a file, import one, and manage stored saves.')}</p>
          </Section>
          <Section title={t('Load')}>
            {s.saves.length ? (
              <ul class="save-list">
                {s.saves.map((n) => (
                  <li><span class="save-name">{n}</span><Btn small nav onClick={async () => {
                    const err = await loadGame(n);
                    if (err) toast({ tone: 'bad', title: t('Load failed'), detail: err });
                  }}>{t('Load')}</Btn></li>
                ))}
              </ul>
            ) : <p class="empty">{t('No saved matches.')}</p>}
          </Section>
          {obs ? (
            <Section title={t('Records')}>
              {desktop ? (
                <div class="row wrap">
                  <Btn nav icon="chronicle" testid="export-view-md" onClick={() => void view('md')}>{t('Chronicle (Markdown)')}</Btn>
                  <Btn nav icon="chronicle" testid="export-view-json" onClick={() => void view('json')}>{t('Chronicle (JSON)')}</Btn>
                </div>
              ) : (
                <div class="row wrap">
                  <a class="btn btn-default" {...api.chronicleLink(obs.seat, 'md', `chronicle-${obs.civ.name}.md`)}>{t('Chronicle (Markdown)')}</a>
                  <a class="btn btn-default" {...api.chronicleLink(obs.seat, 'json', `chronicle-${obs.civ.name}.json`)}>{t('Chronicle (JSON)')}</a>
                  <Btn kind="ghost" nav icon="eye" testid="export-view-md" onClick={() => void view('md')}>{t('View and copy…')}</Btn>
                </div>
              )}
              {watching ? <p class="muted small">{t('The chronicle of {name}, the civilization you are viewing.', { name: tc(obs.civ.name) })}</p> : null}
            </Section>
          ) : null}
          <Section title={t('Help')}>
            <div class="row wrap">
              <Btn nav icon="almanac" testid="menu-almanac" onClick={() => openOverlay('almanac')}>{t('Almanac')}</Btn>
              {playing ? <Btn nav icon="compass" testid="menu-tutorial" onClick={() => { setMenu(false); startTutorial(); }}>{t('Restart the tutorial')}</Btn> : null}
            </div>
          </Section>
          <Section title={t('Match')}>
            <div class="row wrap">
              <Btn nav icon="flag" testid="menu-new-match" onClick={() => setScreen('setup')}>{t('New match…')}</Btn>
              <Btn nav icon="house" testid="menu-title" onClick={() => setScreen('title')}>{t('Main menu')}</Btn>
              {playing && obs.phase !== 'finished' && obs.status === 'active' ? (
                confirmForfeit ? (
                  <>
                    <Btn kind="danger" onClick={async () => { setConfirmForfeit(false); setMenu(false); await act({ kind: 'forfeit' }, 'forfeit'); }}>{t('Confirm: withdraw for −1')}</Btn>
                    <Btn kind="ghost" nav onClick={() => setConfirmForfeit(false)}>{t('Keep playing')}</Btn>
                  </>
                ) : <Btn kind="ghost" nav onClick={() => setConfirmForfeit(true)}>{t('Withdraw from the match…')}</Btn>
              ) : null}
            </div>
            {confirmForfeit ? <p class="why">{t('Withdrawing is irreversible and scores −1 for this seat.')}</p> : null}
          </Section>
          {desktop || canQuit() ? (
            <Section title={t('Game')}>
              <div class="row wrap">
                {desktop ? <Btn nav icon="zoomfit" testid="menu-fullscreen" onClick={() => desktop.fullscreen()}>{t('Full screen')}</Btn> : null}
                {confirmQuit ? (
                  <>
                    <Btn kind="danger" nav testid="menu-quit-confirm" onClick={() => void quitGame()}>{t('Save and quit')}</Btn>
                    <Btn kind="ghost" nav onClick={() => setConfirmQuit(false)}>{t('Keep playing')}</Btn>
                  </>
                ) : <Btn nav icon="close" testid="menu-quit" onClick={() => setConfirmQuit(true)}>{t('Quit game…')}</Btn>}
              </div>
              {confirmQuit ? <p class="why">{t('The match is saved and the game stops. Start it again to continue.')}</p> : null}
            </Section>
          ) : null}
          <div class="menu-keys">
            <p class="sub-label">{t('Keys')}</p>
            <ul>
              <li><kbd>1</kbd>–<kbd>9</kbd> <kbd>0</kbd> {t('panels')}</li>
              <li><kbd>T</kbd> {t('technology tree')} · <kbd>C</kbd> {t('civics tree')} · <kbd>L</kbd> {t('economy ledger')}</li>
              <li><kbd>H</kbd> {t('chronicle')} · <kbd>?</kbd> {t('almanac')} · <kbd>Esc</kbd> {t('close the top-most sheet')}</li>
              <li><kbd>M</kbd> {t('mute or unmute music and sound')}</li>
            </ul>
          </div>
          <p class="muted small">{(summary?.versions ?? []).join(' · ')}</p>
        </div>
      </div>
    </div>
  );
}
