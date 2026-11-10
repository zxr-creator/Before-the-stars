// Game menu: save, load, new match, export, withdraw.
import { useState } from 'preact/hooks';
import { api } from './api';
import { Btn, Section } from './ui';
import { act, loadGame, saveGame, setMenu, setScreen, toast, useApp } from './store';

export function GameMenu() {
  const s = useApp();
  const obs = s.obs!;
  const [name, setName] = useState(`year-${Math.floor(obs.month / 12) + 1}`);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  return (
    <div class="menu-scrim" onClick={() => setMenu(false)}>
      <div class="menu" role="dialog" aria-label="Game menu" data-testid="game-menu" onClick={(e) => e.stopPropagation()}>
        <header class="drawer-head">
          <h2>Before the Stars</h2>
          <Btn kind="ghost" small icon="close" title="Close (Esc)" onClick={() => setMenu(false)} />
        </header>
        <div class="menu-body">
          <p class="muted small">Match {obs.match_id} · seed “{s.summary?.seed}” · {s.summary?.regions} regions · {s.summary?.disclosed_objective ? 'disclosed objective' : 'objective by discovery'}</p>
          <Section title="Save">
            <form class="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void saveGame(name.trim()); }}>
              <input class="text" type="text" value={name} maxLength={40} aria-label="Save name" data-testid="save-name" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              <Btn type="submit" icon="save" disabled={!name.trim()}>Save</Btn>
            </form>
          </Section>
          <Section title="Load">
            {s.saves.length ? (
              <ul class="save-list">
                {s.saves.map((n) => (
                  <li><span class="save-name">{n}</span><Btn small onClick={async () => {
                    const err = await loadGame(n);
                    if (err) toast({ tone: 'bad', title: 'Load failed', detail: err });
                  }}>Load</Btn></li>
                ))}
              </ul>
            ) : <p class="empty">No saved matches.</p>}
          </Section>
          <Section title="Records">
            <div class="row wrap">
              <a class="btn btn-default" href={api.chronicleUrl(obs.seat, 'md')} download={`chronicle-${obs.civ.name}.md`}>Chronicle (Markdown)</a>
              <a class="btn btn-default" href={api.chronicleUrl(obs.seat, 'json')} download={`chronicle-${obs.civ.name}.json`}>Chronicle (JSON)</a>
            </div>
          </Section>
          <Section title="Match">
            <div class="row wrap">
              <Btn icon="flag" testid="menu-new-match" onClick={() => setScreen('setup')}>New match…</Btn>
              {obs.phase !== 'finished' && obs.status === 'active' ? (
                confirmForfeit ? (
                  <>
                    <Btn kind="danger" onClick={async () => { setConfirmForfeit(false); setMenu(false); await act({ kind: 'forfeit' }, 'forfeit'); }}>Confirm: withdraw for −1</Btn>
                    <Btn kind="ghost" onClick={() => setConfirmForfeit(false)}>Keep playing</Btn>
                  </>
                ) : <Btn kind="ghost" onClick={() => setConfirmForfeit(true)}>Withdraw from the match…</Btn>
              ) : null}
            </div>
            {confirmForfeit ? <p class="why">Withdrawing is irreversible and scores −1 for this seat.</p> : null}
          </Section>
          <p class="muted small">Keys: 1–9 and 0 open panels, C opens the chronicle, Esc closes the top-most sheet.</p>
          <p class="muted small">{(s.summary?.versions ?? []).join(' · ')}</p>
        </div>
      </div>
    </div>
  );
}
