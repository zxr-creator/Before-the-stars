// The observer's two standing controls, shared by the world view and by each
// civilization's read-only view: the perspective switch (whose eyes the client
// is looking through) and the playback dock (what time is doing).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { AgentInfo, SeatId } from '../protocol';
import { int, yearOf } from '../format';
import { Icon } from '../icons';
import { cx } from '../ui';
import { getState, observerPlay, observerRun, observerSpeed, useApp, viewAsSeat } from '../store';
import type { AppState } from '../store';
import { t, tc } from '../i18n';
import { Emblem } from '../theme/emblem';
import { recentRate, useHistory } from './history';

export const SPEEDS = [1, 2, 4, 8];
const RUN_CHOICES = [5, 10, 20, 50];
const RUN_KEY = 'bts.observer.runN';

/** Re-render once a second while `active` (elapsed-time read-outs). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds an agent has been thinking: the referee's figure plus the time since it was reported. */
export function useThinkingClock(summary: AppState['summary']): (agent: AgentInfo) => number {
  const stamp = useRef<{ summary: AppState['summary']; at: number }>({ summary, at: Date.now() });
  if (stamp.current.summary !== summary) stamp.current = { summary, at: Date.now() };
  return (agent) => (agent.thinking_seconds ?? 0) + (Date.now() - stamp.current.at) / 1000;
}

function isRunning(s: AppState): boolean {
  const pb = s.playback;
  return pb.playing || pb.busy || pb.queued > 0;
}

/** World view first, then each seat in order; wraps around. */
function cyclePerspective(s: AppState, back: boolean): void {
  const seats = (s.summary?.seats ?? []).map((x) => x.seat);
  const stops: (SeatId | null)[] = s.spectatorSupported ? [null, ...seats] : seats;
  if (stops.length < 2) return;
  const at = stops.indexOf(s.viewAs);
  void viewAsSeat(stops[(at + (back ? -1 : 1) + stops.length) % stops.length]);
}

// --- perspective ------------------------------------------------------------------------

/**
 * The one control that says, and changes, whose view is on screen: the world as
 * the referee records it, or one civilization's own knowledge, read-only.
 */
export function PerspectiveSwitch({ compact }: { compact?: boolean }) {
  const s = useApp();
  if (s.mode !== 'observe') return null;
  const seats = s.summary?.seats ?? [];
  const cur = s.viewAs;
  const viewed = cur !== null ? seats.find((x) => x.seat === cur) : undefined;
  return (
    <div class={cx('persp', compact && 'is-compact')} role="radiogroup" aria-label={t('Perspective')} data-testid="perspective" data-view={cur === null ? 'world' : String(cur)}>
      <span class="persp-label" title={t('Whose view is shown. A civilization’s view is what that seat knows, read-only. (V switches)')}>
        <Icon name="eye" size={13} />
        <span>{cur === null ? t('Perspective') : t('Viewing as')}</span>
      </span>
      {s.spectatorSupported ? (
        <button type="button" role="radio" aria-checked={cur === null} class={cx('persp-opt is-world', cur === null && 'is-active')} data-testid="observer-world"
          title={cur === null ? t('World view: everything the referee records') : t('Back to the world view')} onClick={() => { if (cur !== null) void viewAsSeat(null); }}>
          <Icon name="globe" size={15} /><span class="persp-name">{t('World')}</span>
        </button>
      ) : null}
      {seats.map((x, i) => {
        const on = cur === x.seat;
        return (
          <button type="button" role="radio" aria-checked={on} class={cx('persp-opt', on && 'is-active', x.status !== 'active' && 'is-out', x.agent && 'is-' + x.agent.state)}
            data-testid={`observer-seat-${x.seat}`} style={{ '--civ': x.color }}
            title={on ? t('Showing what {name} knows (read-only)', { name: tc(x.name) }) : `${t('View as {name}', { name: tc(x.name) })}${cur === null && i < 4 ? ` (${i + 1})` : ''}`}
            onClick={() => { if (!on) void viewAsSeat(x.seat); }}>
            <Emblem seat={x.seat} color={x.color} name={x.name} size={compact ? 18 : 20} />
            <span class="persp-name">{tc(x.name)}</span>
            {on ? <span class="persp-lock" data-testid="perspective-readonly" title={t('read-only')}><Icon name="lock" size={11} /></span> : null}
            {x.agent && x.agent.state !== 'idle' ? <i class="persp-dot" aria-hidden="true" /> : null}
          </button>
        );
      })}
      {viewed ? <span class="persp-ro">{t('read-only')}</span> : null}
    </div>
  );
}

// --- playback ---------------------------------------------------------------------------

function loadRunN(): number {
  try {
    const v = Number(localStorage.getItem(RUN_KEY));
    return RUN_CHOICES.includes(v) ? v : 10;
  } catch {
    return 10;
  }
}

/**
 * Keyboard: Space play/pause, "." one round, R run N rounds, [ and ] slower and
 * faster, V next perspective (Shift+V back), 1–4 a civilization's view from the
 * world view. Registered in the capture phase so the focused map does not also
 * take Space as "choose the region under the centre".
 */
function useObserverKeys(runN: number): void {
  const n = useRef(runN);
  n.current = runN;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = getState();
      if (st.mode !== 'observe' || st.screen !== 'game' || st.boot !== 'ready') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (document.querySelector('.menu-scrim, .world-overlay, .overlay, .fs-overlay, [data-tutorial-modal]')) return;
      const running = isRunning(st);
      const finished = !!st.summary?.finished;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let used = true;
      if (key === ' ') {
        if (tag === 'BUTTON') {
          // A button reached with the keyboard keeps its own Space; one merely left focused by a click does not.
          let byKeyboard = true;
          try { byKeyboard = el!.matches(':focus-visible'); } catch { /* older engines: keep the button's own behaviour */ }
          if (byKeyboard) return;
          el!.blur();
        }
        if (running) observerPlay(false); else if (!finished) observerPlay(true);
      } else if (key === '.') {
        if (!running && !finished) observerRun(1);
      } else if (key === 'r') {
        if (!running && !finished) observerRun(n.current);
      } else if (key === ']' || key === '[') {
        const at = SPEEDS.indexOf(st.playback.speed);
        const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (at < 0 ? 0 : at) + (key === ']' ? 1 : -1)))];
        observerSpeed(next);
      } else if (key === 'v') {
        cyclePerspective(st, e.shiftKey);
      } else if (st.viewAs === null && /^[1-4]$/.test(key)) {
        const seat = st.summary?.seats?.[Number(key) - 1];
        if (seat) void viewAsSeat(seat.seat); else used = false;
      } else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

function Shortcuts({ runN }: { runN: number }) {
  const rows: [string, string][] = [
    ['Space', t('play or pause')],
    ['.', t('step one round')],
    ['R', t('run {n} rounds, then pause', { n: runN })],
    ['[  ]', t('slower, faster')],
    ['V', t('next perspective (Shift+V: previous)')],
    ['1–4', t('a civilization’s own view, from the world view')],
  ];
  return (
    <span class="pb-keys">
      <button type="button" class="pb-keys-btn" aria-label={t('Keyboard shortcuts')} aria-describedby="pb-keys-list" data-testid="observer-shortcuts"><Icon name="key" size={14} /></button>
      <span class="pb-keys-pop" role="tooltip" id="pb-keys-list">
        <b>{t('Keyboard shortcuts')}</b>
        {rows.map(([k, what]) => <span class="pb-keys-row"><kbd>{k}</kbd><span>{what}</span></span>)}
      </span>
    </span>
  );
}

/**
 * Playback dock. `docked` is the compact form used over a civilization's own
 * view, where it takes the place of the round dock a player would have.
 */
export function Playback({ state, docked }: { state: AppState; docked?: boolean }) {
  const pb = state.playback;
  const summary = state.summary;
  const sp = state.spectator;
  const obs = state.obs;
  const seats = summary?.seats ?? [];
  const history = useHistory();
  const [runN, setRunN] = useState(loadRunN);
  useObserverKeys(runN);
  const thinkingOf = useThinkingClock(summary);
  const thinking = seats.filter((x) => x.agent && x.agent.state === 'thinking');
  const waitSeats = thinking.length ? thinking : seats.filter((x) => pb.waitingOn.includes(x.seat) && x.agent);
  const running = isRunning(state);
  const now = useNow(running || thinking.length > 0);

  const month = (docked ? obs?.month : sp?.month) ?? sp?.month ?? obs?.month ?? summary?.month ?? 0;
  const round = (docked ? obs?.round : sp?.round) ?? summary?.round ?? 0;
  const horizon = sp?.horizon ?? obs?.horizon ?? summary?.horizon ?? 0;
  const per = sp?.months_per_round ?? obs?.months_per_round ?? summary?.months_per_round ?? 12;
  const rounds = Math.max(1, Math.round(horizon / per));
  const finished = !!summary?.finished || !!sp?.outcome || sp?.phase === 'finished' || obs?.phase === 'finished';
  const year = yearOf(month);
  const elapsed = waitSeats.length
    ? Math.max(...waitSeats.map((x) => (x.agent!.state === 'thinking' ? thinkingOf(x.agent!) : 0)), pb.waitingSince ? (now - pb.waitingSince) / 1000 : 0)
    : 0;
  const rate = running ? recentRate(history, now) : null;
  const viewed = docked && state.viewAs !== null ? seats.find((x) => x.seat === state.viewAs) : undefined;

  let tone = 'idle';
  let icon = 'pause';
  let label: string;
  let detail: ComponentChildren = null;
  if (finished) {
    tone = 'done'; icon = 'flag';
    label = t('Finished');
    detail = t('The match has ended. The record stays open to read.');
  } else if (pb.error) {
    tone = 'error'; icon = 'warn';
    label = t('Stopped');
    detail = <>{t('Playback stopped:')} {pb.error}</>;
  } else if (waitSeats.length) {
    tone = 'thinking'; icon = 'spark';
    label = t('Waiting');
    detail = <>{t('Waiting for {names} to think', { names: waitSeats.map((x) => tc(x.name)).join(', ') })} — <b class="pb-clock" data-testid="observer-elapsed">{clock(elapsed)}</b></>;
  } else if (pb.playing) {
    tone = 'busy'; icon = 'play';
    label = t('Playing {n}×', { n: pb.speed });
    detail = t('One round after another until you pause.');
  } else if (pb.busy || pb.queued > 0) {
    tone = 'busy'; icon = 'hourglass';
    label = pb.queued > 1 ? t('Running') : t('Stepping');
    detail = pb.queued > 1 ? t('{n} rounds to go, then it pauses.', { n: pb.queued }) : t('Resolving year {n}…', { n: year });
  } else {
    label = t('Paused');
    detail = t('Step, play, or run {n} rounds.', { n: runN });
  }
  if (viewed && (tone === 'idle' || tone === 'busy')) {
    detail = <><Icon name="lock" size={11} /> {t('{name}’s own view, read-only. Time is yours to move; its orders are not.', { name: tc(viewed.name) })}</>;
  }
  const mode = pb.playing ? 'playing' : running ? 'running' : finished ? 'finished' : 'paused';

  const pickRun = (v: number) => {
    setRunN(v);
    try { localStorage.setItem(RUN_KEY, String(v)); } catch { /* not remembered */ }
  };
  // A click leaves focus on the button; drop it so Space keeps meaning play/pause.
  const unfocus = (e: MouseEvent) => {
    if (e.detail > 0 && document.activeElement instanceof HTMLElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
  };

  return (
    <div class={cx('playback', 'is-' + tone, docked && 'is-docked')} role="group" aria-label={t('Playback')} data-testid="observer-playback" data-mode={mode} onClick={unfocus}>
      <div class="pb-progress" aria-hidden="true"><i style={{ width: Math.min(100, (round / rounds) * 100).toFixed(2) + '%' }} /></div>
      <div class="pb-status" data-testid="observer-status" data-state={tone}>
        <span class="pb-state" role="status" aria-live="polite"><Icon name={icon} size={13} /><span>{label}</span></span>
        <span class="pb-when">
          <b data-testid="observer-year">{t('Year {n}', { n: year })}</b>
          <small>{t('round {r} of {n}', { r: int(round), n: int(rounds) })}</small>
        </span>
        <span class={cx('pb-rate', rate === null && 'is-none')} data-testid="observer-rate" title={t('Rounds resolved per second, measured over the last few seconds')}>
          {rate !== null ? t('{n} rounds/s', { n: rate >= 10 ? Math.round(rate) : rate.toFixed(1) }) : running ? t('— rounds/s') : t('time stands still')}
        </span>
      </div>
      <div class="pb-controls">
        <button type="button" class="pb-btn" disabled={finished || running} data-testid="observer-step"
          title={t('Step one round (.)')} aria-label={t('Step one round')} onClick={() => observerRun(1)}>
          <Icon name="step" size={17} /><span>{t('Step')}</span>
        </button>
        <button type="button" class={cx('pb-play', pb.playing && 'is-playing')} disabled={finished || (running && !pb.playing)} aria-pressed={pb.playing} data-testid="observer-play"
          title={pb.playing ? t('Pause (Space)') : t('Play (Space)')} aria-label={pb.playing ? t('Pause') : t('Play')} onClick={() => observerPlay(!pb.playing)}>
          <Icon name={pb.playing ? 'pause' : 'play'} size={24} />
        </button>
        <div class="pb-speed" role="radiogroup" aria-label={t('Speed')} title={t('Playing speed ([ slower, ] faster)')}>
          {SPEEDS.map((n) => (
            <button type="button" role="radio" aria-checked={pb.speed === n} class={cx('pb-speed-opt', pb.speed === n && 'is-active')} data-testid={`observer-speed-${n}`} onClick={() => observerSpeed(n)}>{n}×</button>
          ))}
        </div>
        <span class="pb-run">
          <button type="button" class="pb-btn" disabled={finished || running} data-testid="observer-run10" data-rounds={runN}
            title={t('Run {n} rounds, then pause (R)', { n: runN })} onClick={() => observerRun(runN)}>
            <Icon name="fast" size={17} /><span>{t('Run {n}', { n: runN })}</span>
          </button>
          <select class="pb-run-n" aria-label={t('Rounds to run')} title={t('Rounds to run')} value={runN} disabled={running} data-testid="observer-run-n"
            onChange={(e) => pickRun(Number((e.target as HTMLSelectElement).value))}>
            {RUN_CHOICES.map((v) => <option value={v}>{v}</option>)}
          </select>
        </span>
        {running && !pb.playing ? (
          <button type="button" class="pb-btn is-stop" data-testid="observer-stop" title={t('Stop after the round in hand (Space)')} onClick={() => observerPlay(false)}>
            <Icon name="pause" size={15} /><span>{t('Stop')}</span>
          </button>
        ) : null}
        <Shortcuts runN={runN} />
      </div>
      <div class="pb-detail" data-testid="observer-detail">{detail}</div>
    </div>
  );
}
