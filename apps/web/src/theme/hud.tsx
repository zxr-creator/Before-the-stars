// Heads-up display over the map: the end-of-round dock (phase ring, year,
// things needing attention), the column of round notifications, and the banner
// that announces a major chronicle moment.
import { useEffect, useState } from 'preact/hooks';
import { NEGOTIATION_WINDOWS } from '../protocol';
import type { BriefingItem, Observation } from '../protocol';
import { CATEGORY_LABEL, PHASE_LABEL, RESEARCH_LABEL, yearOf } from '../format';
import { Icon } from '../icons';
import { Btn, cx } from '../ui';
import {
  dismissBanner, observerRun, openOverlay, openPanel, ready, seatName, selectRegion, useApp,
} from '../store';
import type { AppState, PanelKey } from '../store';
import { t, tc } from '../i18n';
import { Vignette } from '../art/vignette';
import { Emblem } from './emblem';

const PANEL_ALIAS: Record<string, PanelKey> = {
  briefing: 'briefing', economy: 'economy', projects: 'projects', population: 'people', people: 'people',
  education: 'people', knowledge: 'knowledge', culture: 'culture', politics: 'politics', diplomacy: 'diplomacy',
  military: 'military', objectives: 'objectives', chronicle: 'chronicle',
};
const SEVERITY_TONE: Record<string, 'bad' | 'warn' | 'ok' | 'info'> = { danger: 'bad', warning: 'warn', good: 'ok', info: 'info' };
// i18n-table
const SEVERITY_LABEL: Record<string, string> = { danger: 'Urgent', warning: 'Needs a decision', good: 'Good news', info: 'Report' };
// i18n-end

function openBriefingItem(item: BriefingItem): void {
  const target = PANEL_ALIAS[item.panel];
  if (item.region !== null) selectRegion(item.region, true);
  if (target) openPanel(target);
}

function itemIcon(item: BriefingItem): string {
  return PANEL_ALIAS[item.panel] ?? (item.region !== null ? 'pin' : 'briefing');
}

// --- things needing attention ------------------------------------------------------

export interface Attention {
  key: string;
  tone: 'bad' | 'warn' | 'info';
  icon: string;
  text: string;
  run: () => void;
}

export function attentionItems(obs: Observation): Attention[] {
  const out: Attention[] = [];
  obs.briefing.forEach((b, i) => {
    if (b.severity !== 'danger' && b.severity !== 'warning') return;
    out.push({ key: 'b' + i, tone: b.severity === 'danger' ? 'bad' : 'warn', icon: itemIcon(b), text: tc(b.title), run: () => openBriefingItem(b) });
  });
  const offers = obs.diplomacy.offers.filter((o) => o.to === obs.seat && o.status === 'open').length;
  if (offers) {
    out.push({ key: 'offers', tone: 'warn', icon: 'diplomacy', text: offers === 1 ? t('An offer is waiting for your answer') : t('{n} offers are waiting for your answer', { n: offers }), run: () => openPanel('diplomacy') });
  }
  const idle = obs.civ.research.filter((l) => l.capacity > 0 && l.used === 0);
  const open = obs.knowledge.techs.some((c) => c.can_investigate && c.state !== 'investigating');
  if (idle.length && (open || obs.knowledge.leads.length)) {
    out.push({ key: 'idle', tone: 'warn', icon: 'flask', text: t('Research capacity is idle: {what}', { what: idle.map((l) => t(RESEARCH_LABEL[l.class])).join(', ') }), run: () => openOverlay('tech') });
  }
  if (obs.knowledge.leads.length) {
    const n = obs.knowledge.leads.length;
    out.push({ key: 'leads', tone: 'info', icon: 'knowledge', text: n === 1 ? t('A lead has not been followed up') : t('{n} leads have not been followed up', { n }), run: () => openOverlay('tech') });
  }
  return out;
}

// --- the end-of-round dock -----------------------------------------------------------

function nextLabel(obs: Observation): { label: string; hint: string } {
  if (obs.phase === 'contact') return { label: t('Open negotiations'), hint: t('Finish contact selection and open the first negotiation window') };
  if (obs.phase === 'negotiate') {
    return obs.window < NEGOTIATION_WINDOWS
      ? { label: t('Next window'), hint: t('Close window {a} and open window {b}', { a: obs.window, b: obs.window + 1 }) }
      : { label: t('To planning'), hint: t('Close the last negotiation window and move to planning') };
  }
  return { label: t('Finish planning'), hint: t('Finish planning; the referee then resolves twelve months') };
}

const STEPS = 2 + NEGOTIATION_WINDOWS;

function arc(i: number, r: number): string {
  const span = (Math.PI * 2) / STEPS;
  const gap = 0.075;
  const a0 = -Math.PI / 2 + i * span + gap;
  const a1 = -Math.PI / 2 + (i + 1) * span - gap;
  const p = (a: number) => `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}`;
}

function stepIndex(obs: Observation): number {
  if (obs.phase === 'contact') return 0;
  if (obs.phase === 'negotiate') return Math.max(1, Math.min(NEGOTIATION_WINDOWS, obs.window));
  if (obs.phase === 'plan') return STEPS - 1;
  return STEPS;
}

function stepTitle(i: number): string {
  if (i === 0) return t('Contact selection: choose up to three counterparts for this round');
  if (i === STEPS - 1) return t('Planning: orders are settled, then twelve months are resolved');
  return t('Negotiation window {n} of {m}: one envelope per counterpart', { n: i, m: NEGOTIATION_WINDOWS });
}

export function RoundDock({ state, compact }: { state: AppState; compact: boolean }) {
  const s = state;
  const obs = s.obs!;
  const summary = s.summary!;
  const watching = s.mode === 'observe';
  const finished = obs.phase === 'finished';
  const now = stepIndex(obs);
  const next = nextLabel(obs);
  const waitingOthers = (summary.waiting_on ?? []).filter((x) => x !== obs.seat);
  const attention = finished || watching ? [] : attentionItems(obs);
  const urgent = attention.filter((a) => a.tone !== 'info').length;
  const pb = s.playback;
  const thinking = pb.waitingOn.map(seatName).join(', ');
  const phaseText = obs.phase === 'negotiate'
    ? t('Negotiation · window {n} of {m}', { n: obs.window, m: NEGOTIATION_WINDOWS })
    : t(PHASE_LABEL[obs.phase]);

  const ring = (
    <svg class="orb-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48.500" class="orb-rim" />
      {Array.from({ length: STEPS }, (_, i) => (
        <path d={arc(i, 43.500)} class={cx('orb-seg', i < now && 'is-done', i === now && 'is-now')} />
      ))}
      <circle cx="50" cy="50" r="37" class="orb-face" />
      <circle cx="50" cy="50" r="37" class="orb-face-rim" />
    </svg>
  );
  const face = (label: string, icon?: string) => (
    <span class="orb-text">
      <span class="orb-kicker">{t('Year')}</span>
      <span class="orb-year">{yearOf(obs.month)}</span>
      <span class="orb-label">{icon ? <Icon name={icon} size={11} /> : null}{label}</span>
    </span>
  );

  let orb;
  if (finished) {
    orb = <div class="orb is-finished" data-testid="orb-finished">{ring}{face(t('Finished'), 'flag')}</div>;
  } else if (watching) {
    const busy = pb.busy || pb.playing;
    orb = (
      <button type="button" class={cx('orb', busy && 'is-busy')} disabled={busy} data-testid="observer-step"
        title={busy ? t('The referee is resolving the round') : t('Advance the match by one round')} onClick={() => observerRun(1)}>
        {ring}{face(busy ? (pb.waitingOn.length ? t('Thinking…') : t('Resolving…')) : t('Next round'), busy ? 'clock' : 'step')}
      </button>
    );
  } else if (obs.ready) {
    orb = <div class="orb is-waiting">{ring}{face(t('Waiting'), 'clock')}</div>;
  } else {
    orb = (
      <button type="button" class={cx('orb', s.advancing && 'is-busy', urgent > 0 && 'has-attention')} disabled={s.advancing || s.busy} data-testid="end-round"
        aria-label={t('End round')} title={attention.length ? undefined : t('Pass every remaining phase and resolve twelve months')} onClick={() => void ready(true)}>
        {ring}{face(s.advancing ? t('Resolving…') : t('End round'), 'hourglass')}
      </button>
    );
  }

  return (
    <div class={cx('dock', compact && 'is-compact')} data-tut="dock">
      <div class="dock-plaque">
        <div class="phase" role="group" data-testid="phase" data-phase={obs.phase} data-window={obs.window}
          aria-label={t('Phase: {phase}', { phase: phaseText })}>
          <span class="phase-name">{phaseText}</span>
          <span class="phase-pips" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <i class={cx('phase-pip', i === 0 && 'is-contact', i === STEPS - 1 && 'is-plan', i < now && 'is-done', i === now && 'is-now')} title={stepTitle(i)}>
                {i > 0 && i < STEPS - 1 ? i : ''}
              </i>
            ))}
          </span>
        </div>
        {finished ? (
          <span class="waiting"><Icon name="flag" size={13} /> {t('Match finished')}</span>
        ) : watching ? (
          <span class="waiting" data-testid="observer-wait">
            <Icon name="eye" size={13} /> {pb.busy && thinking ? t('Waiting for {names} to think', { names: thinking }) : t('You are observing')}
          </span>
        ) : obs.ready ? (
          <span class="waiting" data-testid="waiting"><Icon name="clock" size={13} /> {t('Waiting for {names}', { names: waitingOthers.length ? waitingOthers.map(seatName).join(', ') : t('the referee') })}</span>
        ) : (
          <Btn kind="default" small title={next.hint} disabled={s.advancing || s.busy} testid="next-phase" onClick={() => void ready(false)}>{next.label}</Btn>
        )}
      </div>
      <div class="orb-wrap">
        {orb}
        {attention.length ? (
          <>
            <span class={cx('orb-count', urgent ? 'is-urgent' : 'is-info')} data-testid="attention-count" aria-label={t('{n} things need attention', { n: attention.length })}>{attention.length}</span>
            <div class="dock-pop" role="group" aria-label={t('Needs attention')} data-testid="attention-list">
              <p class="pop-title">{t('Before you end the round')}</p>
              <ul>
                {attention.map((a) => (
                  <li><button type="button" class={cx('pop-item', 'is-' + a.tone)} onClick={a.run}>
                    <span class="pop-icon"><Icon name={a.icon} size={14} /></span><span>{a.text}</span>
                  </button></li>
                ))}
              </ul>
              <p class="pop-foot">{t('None of these stop you. Ending the round resolves twelve months.')}</p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// --- notification column -----------------------------------------------------------------

export function NotifyColumn({ state, max }: { state: AppState; max: number }) {
  const obs = state.obs!;
  const [hidden, setHidden] = useState<{ round: number; keys: string[] }>({ round: obs.round, keys: [] });
  const gone = hidden.round === obs.round ? hidden.keys : [];
  const order: Record<string, number> = { danger: 0, warning: 1, good: 2, info: 3 };
  const items = obs.briefing
    .map((b, i) => ({ b, key: i + ':' + b.title }))
    .filter((x) => !gone.includes(x.key))
    .sort((a, b) => (order[a.b.severity] ?? 3) - (order[b.b.severity] ?? 3));
  if (!items.length) return null;
  const shown = items.slice(0, Math.max(1, items.length > max ? max - 1 : max));
  const more = items.length - shown.length;
  return (
    <aside class="notify" aria-label={t('This round')} data-tut="notifications" data-testid="notify-column">
      {shown.map(({ b, key }) => {
        const tone = SEVERITY_TONE[b.severity] ?? 'info';
        return (
          <div class={cx('medal', 'medal-' + tone)}>
            <button type="button" class="medal-btn" aria-label={tc(b.title)} data-testid="notify-item" onClick={() => openBriefingItem(b)}>
              <Icon name={itemIcon(b)} size={18} />
            </button>
            <div class="medal-card" role="tooltip">
              <span class="medal-kicker">{t(SEVERITY_LABEL[b.severity] ?? 'Report')}</span>
              <b>{tc(b.title)}</b>
              <span class="medal-detail">{tc(b.detail)}</span>
              <span class="medal-actions">
                <button type="button" class="linklike" onClick={() => openBriefingItem(b)}>{PANEL_ALIAS[b.panel] ? t('Open') : t('Show on the map')} <Icon name="right" size={10} /></button>
                <button type="button" class="linklike is-quiet" onClick={() => setHidden({ round: obs.round, keys: [...gone, key] })}>{t('Dismiss')}</button>
              </span>
            </div>
          </div>
        );
      })}
      {more > 0 ? (
        <div class="medal medal-more">
          <button type="button" class="medal-btn" title={t('{n} more in the briefing', { n: more })} onClick={() => openPanel('briefing')}>+{more}</button>
        </div>
      ) : null}
    </aside>
  );
}

// --- major-moment banner --------------------------------------------------------------------

export function MomentBanner({ state }: { state: AppState }) {
  const b = state.banners[0];
  const id = b?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => dismissBanner(id), 10000);
    return () => clearTimeout(timer);
  }, [id]);
  if (!b) return null;
  const civ = b.seat !== undefined ? state.summary?.seats?.find((x) => x.seat === b.seat) : undefined;
  const line = tc(b.text).split(/(?<=[.!?。！？])\s*/)[0] ?? '';
  const canOpen = !!state.obs;
  return (
    <div class="banner" role="status" aria-live="polite" data-testid="moment-banner" key={b.id}>
      <span class="banner-flourish is-left" aria-hidden="true" />
      <div class="banner-art"><Vignette art={b.art} /></div>
      <div class="banner-text">
        <span class="banner-kicker">
          <Icon name="star" size={11} /> {t('Historic moment')} · {t('Year {n}', { n: yearOf(b.month) })} · {t(CATEGORY_LABEL[b.category] ?? 'Chronicle')}
          {civ ? <span class="banner-civ"><Emblem seat={civ.seat} color={civ.color} name={civ.name} size={13} /> {tc(civ.name)}</span> : null}
        </span>
        <b class="banner-title">{tc(b.title)}</b>
        <span class="banner-line">{line}</span>
      </div>
      <div class="banner-actions">
        {canOpen ? <Btn small nav kind="primary" icon="chronicle" testid="banner-view" onClick={() => { dismissBanner(b.id); openPanel('chronicle', { kind: 'moment', id: b.id }); }}>{t('View')}</Btn> : null}
        <button type="button" class="banner-x" aria-label={t('Dismiss')} data-testid="banner-dismiss" onClick={() => dismissBanner(b.id)}><Icon name="close" size={13} /></button>
      </div>
      <span class="banner-flourish is-right" aria-hidden="true" />
      <span class="banner-timer" aria-hidden="true" />
    </div>
  );
}
