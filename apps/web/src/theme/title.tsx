// The title screen: backdrop, wordmark and the main menu.
import { useState } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from '../ui';
import { canQuit, desktopShell, hasLiveMatch, loadGame, openOverlay, quitGame, setScreen, useApp } from '../store';
import { t, tc, useLocale } from '../i18n';
import { yearOf } from '../format';
import { LanguageSwitch } from '../setup';
import { Almanac } from '../tutorial/almanac';
import { TitleBackdrop } from './backdrop';
import { BrandMark } from './brand';

/** The designed wordmark; the English name stays as a subtitle in other languages. */
export function Wordmark({ small }: { small?: boolean }) {
  const name = t('Before the Stars');
  return (
    <div class={cx('wordmark', small && 'is-small')}>
      <span class="wordmark-rule" aria-hidden="true" />
      <h1>{name}</h1>
      {name !== 'Before the Stars' ? <span class="wordmark-latin" lang="en">Before the Stars</span> : null}
      <span class="wordmark-rule is-lower" aria-hidden="true" />
    </div>
  );
}

function Item({ icon, label, sub, onClick, testid, disabled, active }: {
  icon: string; label: string; sub?: string | null; onClick: () => void; testid: string; disabled?: boolean; active?: boolean;
}) {
  return (
    <button type="button" class={cx('title-item', active && 'is-active')} disabled={disabled} data-testid={testid} onClick={onClick}>
      <span class="title-item-icon"><Icon name={icon} size={18} /></span>
      <span class="title-item-text">
        <b>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </button>
  );
}

export function Title() {
  const s = useApp();
  useLocale();
  const [pane, setPane] = useState<'none' | 'load' | 'quit'>('none');
  const [error, setError] = useState<string | null>(null);
  const live = hasLiveMatch();
  const desktop = desktopShell();
  const summary = s.summary;
  const year = yearOf(s.obs?.month ?? s.spectator?.month ?? summary?.month ?? 0);
  const resume = !live ? t('No match in progress')
    : s.mode === 'observe' ? t('Observer match · Year {n}', { n: year })
    : t('{name} · Year {n}', { name: s.obs ? tc(s.obs.civ.name) : '', n: year });

  const load = async (name: string) => {
    setError(null);
    const err = await loadGame(name);
    if (err) setError(err);
  };

  return (
    <div class="title" data-testid="title-screen">
      <TitleBackdrop />
      <div class="title-shade" aria-hidden="true" />
      <div class="title-col">
        <header class="title-head">
          <BrandMark size={64} />
          <Wordmark />
          <p class="tagline">{t('Four peoples under one sky. Feed them, teach them, govern them — and find the road beyond it.')}</p>
        </header>
        <nav class="title-menu" aria-label={t('Main menu')}>
          <Item icon="play" label={t('Continue')} sub={resume} testid="title-continue" disabled={!live} onClick={() => setScreen('game')} />
          <Item icon="flag" label={t('New game')} sub={t('Choose seats, world and objective')} testid="title-new" onClick={() => setScreen('setup')} />
          <Item icon="eye" label={t('Observer mode')} sub={t('Watch four AI civilizations; pause, step and compare')} testid="title-observer" onClick={() => setScreen('setup', 'observer')} />
          <Item icon="save" label={t('Load game')} sub={s.saves.length ? t('{n} saved matches', { n: s.saves.length }) : t('No saved matches yet')} testid="title-load"
            active={pane === 'load'} onClick={() => setPane(pane === 'load' ? 'none' : 'load')} />
          <Item icon="compass" label={t('Tutorial')} sub={t('A guided first match')} testid="title-tutorial" onClick={() => setScreen('setup', 'tutorial')} />
          <Item icon="almanac" label={t('Almanac')} sub={t('How the game works')} testid="title-almanac" onClick={() => openOverlay('almanac')} />
          {desktop ? <Item icon="zoomfit" label={t('Full screen')} sub={t('Toggle full-screen display')} testid="title-fullscreen" onClick={() => desktop.fullscreen()} /> : null}
          {canQuit() ? <Item icon="close" label={t('Quit')} sub={t('Save and close the game')} testid="title-quit" active={pane === 'quit'} onClick={() => setPane(pane === 'quit' ? 'none' : 'quit')} /> : null}
        </nav>
        <div class="title-lang">
          <span class="title-lang-label">{t('Language')}</span>
          <LanguageSwitch />
        </div>
      </div>

      {pane === 'load' ? (
        <aside class="title-pane" aria-label={t('Load game')} data-testid="title-saves">
          <header><h2>{t('Load game')}</h2><button type="button" class="banner-x" aria-label={t('Close')} onClick={() => setPane('none')}><Icon name="close" size={13} /></button></header>
          {s.saves.length ? (
            <ul class="title-saves">
              {s.saves.map((name) => (
                <li>
                  <button type="button" class="title-save" disabled={s.busy} data-testid={`title-load-${name}`} onClick={() => void load(name)}>
                    <Icon name="save" size={15} /><span>{name}</span><Icon name="right" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p class="title-empty">{t('No saved matches yet. The referee keeps an autosave once a round has been resolved.')}</p>}
          {error ? <p class="title-error" role="alert"><Icon name="warn" size={13} /> {error}</p> : null}
        </aside>
      ) : null}
      {pane === 'quit' ? (
        <aside class="title-pane is-small" role="alertdialog" aria-label={t('Quit')} data-testid="title-quit-pane">
          <header><h2>{t('Quit the game?')}</h2></header>
          <p class="title-empty">{live ? t('The match is saved first. Start the game again to continue.') : t('The game will close.')}</p>
          <div class="title-pane-actions">
            <button type="button" class="title-btn is-primary" data-testid="title-quit-confirm" onClick={() => void quitGame()}>{t('Save and quit')}</button>
            <button type="button" class="title-btn" onClick={() => setPane('none')}>{t('Stay')}</button>
          </div>
        </aside>
      ) : null}

      <footer class="title-foot">
        <span>{(summary?.versions ?? []).slice(0, 2).join(' · ') || 'bts 1.0'}</span>
        <span>{t('An original strategy game for people and AI agents. All artwork is drawn by the game itself.')}</span>
      </footer>
      {s.overlay === 'almanac' ? <div class="world-overlay"><Almanac /></div> : null}
    </div>
  );
}
