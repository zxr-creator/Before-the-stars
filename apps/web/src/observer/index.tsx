// Observer console: what the client shows when no seat is human. The whole
// world on the map, a scoreboard for every civilization, the world's events,
// what each LLM agent said it was doing, and the controls that move time.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import type {
  AgentInfo, AgentLogEntry, Good, MomentCategory, RegionId, SeatId, SeatSummary, SpectatorCiv, SpectatorEvent,
  SpectatorView,
} from '../protocol';
import { NEGOTIATION_WINDOWS } from '../protocol';
import {
  CATEGORY_LABEL, GOOD_SHORT, PHASE_LABEL, SETTLEMENT_LABEL, STATUS_LABEL, TERRAIN_LABEL, compact, fmtNow, fmtYear, int, totalRounds,
  goodTonnes, peopleNum, qty, researchMonths, tonnes,
} from '../format';
import { Icon } from '../icons';
import { Btn, Tick, cx } from '../ui';
import { dismissResult, loadAgentLog, openOverlay, refresh, setMenu, setScreen, toast, useApp, viewAsSeat } from '../store';
import { api } from '../api';
import '../agents/agents.css';
import type { AppState } from '../store';
import { t, tc, useLocale } from '../i18n';
import { MapView } from '../map/MapView';
import { Vignette } from '../art/vignette';
import { actionLabel } from '../panels/briefing';
import { MomentBanner } from '../theme/hud';
import { BrandMark } from '../theme/brand';
import { dateTitle } from '../topbar';
import { Emblem } from '../theme/emblem';
import { GOOD_GROUPS, GoodIcon } from '../theme/goods';
import { StatePlate } from '../theme/overlay';
import { spectatorObservation } from './synthetic';
import { Compare } from './compare';
import { Playback, PerspectiveSwitch, clock, useNow, useThinkingClock } from './controls';
import './history';
import './observer.css';

const SIDE_W = 532;
const SIDE_W_NARROW = 484;
/** Height the playback dock keeps clear at the bottom of the map. */
const DOCK_H = 128;
const GOVERNANCE_MONTHS = 96;
const FTL_MONTHS = 24;

type Tab = 'score' | 'compare' | 'events' | 'agents';

/** The open tab survives a visit to a civilization's own view and back. */
let lastTab: Tab = 'score';

// --- small helpers ------------------------------------------------------------------

const PROVIDER_LABEL: Record<string, string> = {
  'claude-api': 'Claude (API)', claude_api: 'Claude (API)', 'claude-code': 'Claude Code', claude_code: 'Claude Code',
  codex: 'Codex', 'openai-api': 'OpenAI-compatible', openai_api: 'OpenAI-compatible', mock: 'Mock agent', 'mock-agent': 'Mock agent',
};
const NATIVE_LABEL: Record<string, string> = {
  native_easy: 'Built-in AI · Easy', native_medium: 'Built-in AI · Medium', native_hard: 'Built-in AI · Hard',
  human: 'Human', external: 'External agent',
};
const NATIVE_LEVEL: Record<string, string> = { native_easy: 'Easy', native_medium: 'Medium', native_hard: 'Hard' };

function providerName(agent: AgentInfo): string {
  return t(PROVIDER_LABEL[agent.provider] ?? agent.provider);
}

function controllerLine(civ: SpectatorCiv, seat: SeatSummary | undefined): string {
  if (seat?.agent) return providerName(seat.agent);
  return t(NATIVE_LABEL[civ.controller] ?? civ.controller);
}

/** The controller without its level or model, for narrow places. */
function controllerShort(civ: SpectatorCiv, seat: SeatSummary | undefined): string {
  if (seat?.agent) return providerName(seat.agent);
  return NATIVE_LEVEL[civ.controller] ? t('Built-in AI') : t(NATIVE_LABEL[civ.controller] ?? civ.controller);
}

function everyLabel(n: number): string {
  return n <= 1 ? t('consulted every round') : t('consulted every {n} rounds', { n });
}

function AgentChip({ agent, seconds, short }: { agent: AgentInfo; seconds: number; short?: boolean }) {
  const full = agent.state === 'thinking' ? t('Thinking {time}', { time: clock(seconds) })
    : agent.state === 'error' ? t('Error · retrying next round')
    : agent.state === 'stopped' ? t('Stopped · steward carries on alone')
    : t('Idle');
  const label = !short ? full : agent.state === 'thinking' ? clock(seconds) : agent.state === 'error' ? t('Error') : agent.state === 'stopped' ? t('Stopped') : full;
  return (
    <span class={cx('agent-chip', 'is-' + agent.state)} title={short ? full : undefined} data-testid="agent-state" data-state={agent.state}>
      <Icon name={agent.state === 'thinking' ? 'spark' : agent.state === 'idle' ? 'agent' : 'warn'} size={11} />{label}
    </span>
  );
}

// --- the console ------------------------------------------------------------------------

export function ObserverConsole() {
  const s = useApp();
  useLocale();
  const sp = s.spectator;
  const summary = s.summary;
  const [tab, setTabState] = useState<Tab>(lastTab);
  const setTab = (next: Tab) => { lastTab = next; setTabState(next); };
  const [sideOpen, setSideOpen] = useState(true);
  const [selected, setSelected] = useState<RegionId | null>(null);
  const [focus, setFocus] = useState<{ region: RegionId; nonce: number } | null>(null);
  const [vw, setVw] = useState(() => window.innerWidth);
  const thinkingOf = useThinkingClock(summary);
  const seats = summary?.seats ?? [];
  const agentSeats = seats.filter((x) => x.agent);
  const anyThinking = agentSeats.some((x) => x.agent!.state === 'thinking');
  const pb = s.playback;
  useNow(pb.busy || anyThinking);

  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Agent logs follow the round, and are fetched when the panel is opened.
  const round = summary?.round ?? 0;
  const agentKey = agentSeats.map((x) => x.seat).join(',');
  useEffect(() => {
    for (const x of agentSeats) void loadAgentLog(x.seat);
  }, [round, agentKey, tab === 'agents', summary?.match_id]);

  const mapObs = useMemo(() => (sp ? spectatorObservation(sp, t('Observer')) : null), [sp, t('Observer')]);

  if (!sp || !summary || !mapObs) {
    return (
      <div class="observer" data-testid="observer-console">
        <div class="obs-loading"><StatePlate icon="eye" title={t('Opening the world view…')} /></div>
      </div>
    );
  }

  const sideW = sideOpen ? (vw < 1360 ? SIDE_W_NARROW : SIDE_W) : 0;
  const rounds = totalRounds(sp);
  const finished = !!summary.finished || !!sp.outcome || sp.phase === 'finished';
  const seatOf = (seat: SeatId) => seats.find((x) => x.seat === seat);
  const show = (region: RegionId | null) => {
    if (region === null) return;
    setSelected(region);
    setFocus({ region, nonce: Date.now() });
  };
  const errors = agentSeats.filter((x) => x.agent!.last_error);

  return (
    <div class={cx('observer', s.banners.length > 0 && 'has-banner')} data-testid="observer-console" style={{ '--side-w': sideW + 'px' } as JSX.CSSProperties}>
      <header class="topbar obs-topbar">
        <button type="button" class="topbar-menu" aria-label={t('Game menu')} title={t('Game menu')} data-testid="menu-button" onClick={() => setMenu(!s.menuOpen)}>
          <Icon name="menu" size={18} />
        </button>
        <div class="topbar-civ">
          <BrandMark size={34} />
          <div class="civ-text">
            <span class="civ-name">{t('World view')}</span>
            <span class="observing-badge" data-testid="observer-badge"><Icon name="eye" size={12} /> {t('Observer')}</span>
          </div>
        </div>
        <div class="topbar-date" title={dateTitle(sp)} data-round={sp.round}>
          <span class="date-year" data-testid="year">{fmtNow(sp)}</span>
          <span class="date-round" data-testid="observer-round" data-round={sp.round}>{t('Round {r} of {n}', { r: int(sp.round), n: int(rounds) })}</span>
        </div>
        <div class="obs-phase" data-testid="phase" data-phase={sp.phase}>
          <Icon name={finished ? 'flag' : 'hourglass'} size={13} />
          <span>{sp.phase === 'negotiate' ? t('Negotiation · window {n} of {m}', { n: sp.window, m: NEGOTIATION_WINDOWS }) : t(PHASE_LABEL[sp.phase])}</span>
        </div>
        <PerspectiveSwitch />
        <div class="obs-top-tools">
          <button type="button" class="obs-tool" title={`${t('Almanac')} (?)`} aria-label={t('Almanac')} data-testid="observer-almanac" onClick={() => openOverlay('almanac', 'observer')}>
            <Icon name="almanac" size={17} />
          </button>
        </div>
      </header>
      {s.offline ? (
        <div class="offline-bar" role="alert"><Icon name="warn" size={14} /> {t('The local referee is not answering. The console will keep trying.')}</div>
      ) : null}

      <div class="obs-stage">
        <div class="map-host">
          <MapView obs={mapObs} selected={selected} onSelect={setSelected} focus={focus}
            insets={{ left: sideW, right: 0, top: 0, bottom: DOCK_H }} />
        </div>

        <aside class={cx('obs-side', !sideOpen && 'is-closed')} aria-label={t('Observer panels')} data-testid="observer-side">
          <div class="obs-tabs" role="tablist">
            <TabBtn tab="score" now={tab} icon="objectives" label={t('Scoreboard')} onPick={setTab} />
            <TabBtn tab="compare" now={tab} icon="layers" label={t('Compare')} onPick={setTab} />
            <TabBtn tab="events" now={tab} icon="chronicle" label={t('World events')} count={sp.events.length} onPick={setTab} />
            <TabBtn tab="agents" now={tab} icon="agent" label={t('Agents')} count={agentSeats.length || undefined} alert={errors.length > 0} onPick={setTab} />
          </div>
          <div class="obs-side-body" key={tab}>
            {tab === 'score' ? <Scoreboard sp={sp} seats={seats} finished={finished} thinkingOf={thinkingOf} onAgents={() => setTab('agents')} />
              : tab === 'compare' ? <Compare sp={sp} />
              : tab === 'events' ? <Events sp={sp} onShow={show} />
              : <Agents state={s} sp={sp} thinkingOf={thinkingOf} />}
          </div>
        </aside>
        <button type="button" class={cx('obs-side-toggle', !sideOpen && 'is-closed')} aria-expanded={sideOpen} data-testid="observer-side-toggle"
          title={sideOpen ? t('Hide the panels') : t('Show the panels')} onClick={() => setSideOpen(!sideOpen)}>
          <Icon name={sideOpen ? 'left' : 'right'} size={13} />
        </button>

        {selected !== null ? <RegionCard sp={sp} id={selected} onClose={() => setSelected(null)} /> : null}
        <Playback state={s} />
        <MomentBanner state={s} />
      </div>

      {/* The result waits for the world snapshot that carries the outcome, not just the summary's "finished". */}
      {(sp.outcome || sp.phase === 'finished') && !s.resultDismissed ? <Result sp={sp} seats={seats} /> : null}
    </div>
  );
}

function TabBtn({ tab, now, icon, label, count, alert, onPick }: {
  tab: Tab; now: Tab; icon: string; label: string; count?: number; alert?: boolean; onPick: (t: Tab) => void;
}) {
  return (
    <button type="button" role="tab" aria-selected={now === tab} class={cx('obs-tab', now === tab && 'is-active')} data-testid={`obs-tab-${tab}`} onClick={() => onPick(tab)}>
      <Icon name={icon} size={15} /><span>{label}</span>
      {count !== undefined ? <small>{count}</small> : null}
      {alert ? <i class="obs-tab-alert" aria-label={t('An agent reported an error')} /> : null}
    </button>
  );
}

// --- scoreboard ---------------------------------------------------------------------------

interface Row {
  key: string;
  icon: string;
  label: string;
  hint?: string;
  /** Value used to find the leader; null = this row has no leader. */
  rank?: (c: SpectatorCiv) => number;
  cell: (c: SpectatorCiv) => ComponentChildren;
}


function Milestone({ icon, label, month }: { icon: string; label: string; month: number | null }) {
  return (
    <span class={cx('ms', month !== null && 'is-on')} title={month !== null ? `${label} · ${fmtYear(month)}` : t('{what}: not yet', { what: label })}>
      <Icon name={icon} size={12} />{month !== null ? <small>{fmtYear(month)}</small> : null}
    </span>
  );
}

function Streak({ value, max, title }: { value: number; max: number; title: string }) {
  const f = Math.max(0, Math.min(1, value / max));
  return (
    <span class={cx('streak', f >= 1 && 'is-full')} title={title}>
      <span class="streak-bar"><i style={{ width: (f * 100).toFixed(1) + '%' }} /></span>
      <span class="streak-num"><Tick value={value} format={(n) => String(Math.round(n))} /><small>/{max}</small></span>
    </span>
  );
}

function Scoreboard({ sp, seats, finished, thinkingOf, onAgents }: {
  sp: SpectatorView; seats: SeatSummary[]; finished: boolean; thinkingOf: (a: AgentInfo) => number; onAgents: () => void;
}) {
  // with more than six civilizations the columns compact and any row can order them (design chapter 40, section 2.7)
  const [sortBy, setSortBy] = useState<string | null>(null);
  const many = sp.civs.length > 6;
  const seatOf = (seat: SeatId) => seats.find((x) => x.seat === seat);
  const civs0 = sp.civs;
  const civOf = (seat: SeatId) => civs0.find((c) => c.seat === seat);
  const rows: Row[] = [
    { key: 'population', icon: 'people', label: t('Population'), rank: (c) => c.population, cell: (c) => <span title={t('{n} people', { n: int(c.population) })}><Tick value={c.population} format={(n) => peopleNum(n)} /></span> },
    { key: 'regions', icon: 'pin', label: t('Regions'), rank: (c) => c.regions, cell: (c) => <Tick value={c.regions} format={(n) => String(Math.round(n))} /> },
    {
      key: 'techs', icon: 'knowledge', label: t('Technologies'), hint: t('Understood, and how many more are discovered but not yet understood'),
      rank: (c) => c.understood, cell: (c) => <><Tick value={c.understood} format={(n) => String(Math.round(n))} /><small> / {c.discovered}</small></>,
    },
    { key: 'practices', icon: 'culture', label: t('Practices'), rank: (c) => c.practices, cell: (c) => <Tick value={c.practices} format={(n) => String(Math.round(n))} /> },
    {
      key: 'soldiers', icon: 'military', label: t('Soldiers'), hint: t('People under arms, and the highest equipment tier fielded'),
      rank: (c) => c.soldiers, cell: (c) => <><Tick value={c.soldiers} format={(n) => peopleNum(n)} />{c.soldiers || c.highest_tier ? <small> · {t('tier {n}', { n: c.highest_tier })}</small> : null}</>,
    },
    {
      key: 'stability', icon: 'balance', label: t('Stability'), rank: (c) => c.stability,
      cell: (c) => <span class={c.stability < 35 ? 'neg' : c.stability < 60 ? 'warn-text' : ''}><Tick value={c.stability} format={(n) => String(Math.round(n))} /><small> /100</small></span>,
    },
    {
      key: 'food', icon: 'grain', label: t('Food in store'), hint: t('Months of consumption held in store'),
      rank: (c) => c.food_months_milli,
      cell: (c) => <span class={c.food_months_milli < 2000 ? 'neg' : ''}><Tick value={c.food_months_milli / 1000} format={(n) => (n >= 100 ? '99+' : n.toFixed(1))} /><small> {t('mo')}</small></span>,
    },
    {
      key: 'goods', icon: 'box', label: t('Goods by group'), hint: t('Goods in store, added up by mass within each group; the four largest groups are shown'),
      cell: (c) => {
        const groups = GOOD_GROUPS.map((g) => {
          const lines = c.goods.filter((x) => x.amount > 0 && g.goods.includes(x.good));
          const mass = lines.reduce((a, x) => a + goodTonnes(x.good, x.amount), 0);
          const top = lines.sort((a, b) => goodTonnes(b.good, b.amount) - goodTonnes(a.good, a.amount))[0];
          return { g, lines, mass, top };
        }).filter((x) => x.mass > 0).sort((a, b) => b.mass - a.mass).slice(0, 4);
        if (!groups.length) return <span class="muted">—</span>;
        return (
          <span class="sb-goodlist">
            {groups.map(({ g, lines, mass, top }) => (
              <span title={`${t(g.label)}: ${lines.map((x) => `${t(GOOD_SHORT[x.good])} ${qty(x.good, x.amount)}`).join(', ')}`}>
                <GoodIcon good={top!.good} size={13} />{tonnes(mass)}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: 'research', icon: 'flask', label: t('Research capacity'), hint: t('Researcher-months a month that staffed research posts can put into investigations'),
      rank: (c) => c.research_capacity, cell: (c) => <span title={researchMonths(c.research_capacity)}><Tick value={c.research_capacity} format={(n) => compact(Math.round(n))} /></span>,
    },
    {
      key: 'milestones', icon: 'star', label: t('Milestones'), hint: t('Scientific method, planetary reach, interstellar reach'),
      rank: (c) => (c.sci_method !== null ? 1 : 0) + (c.planetary !== null ? 1 : 0) + (c.interstellar !== null ? 1 : 0),
      cell: (c) => (
        <span class="ms-row">
          <Milestone icon="flask" label={t('Scientific method')} month={c.sci_method} />
          <Milestone icon="globe" label={t('Planetary reach')} month={c.planetary} />
          <Milestone icon="rocket" label={t('Interstellar reach')} month={c.interstellar} />
        </span>
      ),
    },
    {
      key: 'gov', icon: 'crown', label: t('Governance'), hint: t('Continuous months as the highest real authority over every inhabited region ({n} needed)', { n: GOVERNANCE_MONTHS }),
      rank: (c) => c.gov_streak, cell: (c) => <Streak value={c.gov_streak} max={GOVERNANCE_MONTHS} title={t('{n} of {m} months', { n: c.gov_streak, m: GOVERNANCE_MONTHS })} />,
    },
    {
      key: 'ftl', icon: 'rocket', label: t('Jump service'), hint: t('Continuous months of fleet-wide jump capability ({n} needed), with assemblies in service and loaded round trips flown', { n: FTL_MONTHS }),
      rank: (c) => c.ftl_streak,
      cell: (c) => (
        <span class="sb-stack">
          <Streak value={c.ftl_streak} max={FTL_MONTHS} title={t('{n} of {m} months', { n: c.ftl_streak, m: FTL_MONTHS })} />
          {c.assemblies || c.trials ? (
            <small class="sb-mini" title={t('{a} assemblies in service · {b} loaded round trips flown', { a: c.assemblies, b: c.trials })}>
              <Icon name="layers" size={10} />{c.assemblies}<Icon name="rocket" size={10} />{c.trials}
            </small>
          ) : null}
        </span>
      ),
    },
    {
      key: 'relations', icon: 'sword', label: t('Wars · overlord'),
      cell: (c) => {
        const wars = c.at_war_with.map(civOf).filter((x): x is SpectatorCiv => !!x);
        const lord = c.overlord !== null ? civOf(c.overlord) : undefined;
        if (!wars.length && !lord) return <span class="muted">{t('At peace')}</span>;
        return (
          <span class="sb-rel">
            {wars.length ? <span class="rel-war" title={t('At war with {names}', { names: wars.map((w) => tc(w.name)).join(', ') })}><Icon name="sword" size={12} />{wars.map((w) => <Emblem seat={w.seat} color={w.color} name={w.name} size={14} />)}</span> : null}
            {lord ? <span class="rel-lord" title={t('Subordinate to {name}', { name: tc(lord.name) })}><Icon name="crown" size={12} /><Emblem seat={lord.seat} color={lord.color} name={lord.name} size={14} /></span> : null}
          </span>
        );
      },
    },
    {
      key: 'status', icon: 'flag', label: finished ? t('Status · reward') : t('Status'),
      cell: (c) => (
        <span class="sb-stack">
          <span class={cx('sb-status', 'is-' + c.status)}>{t(STATUS_LABEL[c.status] ?? c.status)}</span>
          {c.reward !== null ? <b class={cx('sb-reward', c.reward > 0 && 'is-win')}>{c.reward.toFixed(3)}</b> : null}
        </span>
      ),
    },
  ];

  const sortRow = sortBy ? rows.find((r) => r.key === sortBy && r.rank) : undefined;
  const civs = sortRow ? [...sp.civs].sort((a, b) => sortRow.rank!(b) - sortRow.rank!(a) || a.seat - b.seat) : sp.civs;
  const active = civs.filter((c) => c.status === 'active');
  const leadersOf = (row: Row): Set<SeatId> => {
    if (!row.rank) return new Set();
    const pool = active.length ? active : civs;
    const best = Math.max(...pool.map(row.rank));
    if (!(best > 0)) return new Set();
    const lead = pool.filter((c) => row.rank!(c) === best);
    return lead.length === pool.length && pool.length > 1 ? new Set() : new Set(lead.map((c) => c.seat));
  };
  const withErrors = civs.map((c) => ({ c, agent: seatOf(c.seat)?.agent ?? null })).filter((x) => x.agent?.last_error);

  return (
    <div class={cx('scoreboard', many && 'is-many')} data-testid="scoreboard" data-seats={civs.length} style={{ '--n': civs.length } as JSX.CSSProperties}>
      {withErrors.length ? (
        <div class="sb-errors" role="alert" data-testid="scoreboard-errors">
          {withErrors.map(({ c, agent }) => (
            <button type="button" class={cx('sb-error', 'is-' + agent!.state)} onClick={onAgents} title={t('Open the agent panel')}>
              <Emblem seat={c.seat} color={c.color} name={c.name} size={18} />
              <span>
                <b>{tc(c.name)} · {agent!.state === 'stopped' ? t('agent stopped, steward carries on alone') : agent!.state === 'error' ? t('agent error, retrying next round') : t('last agent error')}</b>
                <span class="sb-error-text">{agent!.last_error}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <table class="sb-table">
        <thead>
          <tr>
            <th class="sb-corner"><span>{fmtNow(sp)}</span></th>
            {civs.map((c) => {
              const seat = seatOf(c.seat);
              const agent = seat?.agent ?? null;
              return (
                <th class={cx('sb-civ', c.status !== 'active' && 'is-out')} style={{ '--civ': c.color } as JSX.CSSProperties} data-testid={`score-civ-${c.seat}`}>
                  <span class="sb-civ-band" aria-hidden="true" />
                  <Emblem seat={c.seat} color={c.color} name={c.name} size={many ? 26 : 38} />
                  <b class="sb-civ-name">{tc(c.name)}</b>
                  <span class="sb-civ-ctl" title={controllerLine(c, seat)}>{agent ? <Icon name="agent" size={11} /> : null}{controllerShort(c, seat)}</span>
                  <span class="sb-civ-model" title={agent ? `${agent.model || t('default model')} · ${everyLabel(agent.consult_every)}` : undefined}>
                    {agent ? (agent.model || t('default model')) : NATIVE_LEVEL[c.controller] ? t(NATIVE_LEVEL[c.controller]) : '\u00a0'}
                  </span>
                  <span class="sb-civ-model">{agent ? (agent.consult_every > 1 ? t('every {n} rounds', { n: agent.consult_every }) : t('every round')) : NATIVE_LEVEL[c.controller] ? t('rule-based policy') : '\u00a0'}</span>
                  <span class="sb-civ-chip">{agent ? <AgentChip agent={agent} seconds={thinkingOf(agent)} short /> : null}</span>
                  <Btn small nav icon="eye" testid={`view-as-${c.seat}`} title={t('View as {name}', { name: tc(c.name) })} onClick={() => void viewAsSeat(c.seat)}>{many ? null : t('View as')}</Btn>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const lead = leadersOf(row);
            return (
              <tr class={'sb-row sbr-' + row.key}>
                <th scope="row" title={row.hint} aria-sort={sortBy === row.key ? 'descending' : undefined}>
                  {row.rank ? (
                    <button type="button" class={cx('sb-sort', sortBy === row.key && 'is-on')} data-testid={`score-sort-${row.key}`}
                      title={sortBy === row.key ? t('Back to seat order') : t('Order the civilizations by {what}', { what: row.label })}
                      onClick={() => setSortBy(sortBy === row.key ? null : row.key)}>
                      <Icon name={row.icon} size={13} /><span>{row.label}</span>{sortBy === row.key ? <Icon name="down" size={10} /> : null}
                    </button>
                  ) : <><Icon name={row.icon} size={13} /><span>{row.label}</span></>}
                </th>
                {civs.map((c) => (
                  <td class={cx(lead.has(c.seat) && 'is-lead', c.status !== 'active' && 'is-out')}>{row.cell(c)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="sb-foot"><i class="sb-lead-key" aria-hidden="true" /> {t('Gilded figures lead their row. Everything here is the referee’s own record: an observer sees what no seat can.')}</p>
    </div>
  );
}

// --- world events ---------------------------------------------------------------------------

function Events({ sp, onShow }: { sp: SpectatorView; onShow: (region: RegionId | null) => void }) {
  const [seat, setSeat] = useState<SeatId | null>(null);
  const [cat, setCat] = useState<MomentCategory | null>(null);
  const [majorOnly, setMajorOnly] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(60);
  const strip = useRef<HTMLDivElement>(null);
  const civOf = (id: SeatId) => sp.civs.find((c) => c.seat === id);
  const cats = useMemo(() => {
    const seen: MomentCategory[] = [];
    for (const e of sp.events) if (!seen.includes(e.category)) seen.push(e.category);
    return seen;
  }, [sp.events]);
  const majors = useMemo(() => sp.events.filter((e) => e.major), [sp.events]);
  const list = useMemo(
    () => sp.events.filter((e) => (seat === null || e.seat === seat) && (cat === null || e.category === cat) && (!majorOnly || e.major)).reverse(),
    [sp.events, seat, cat, majorOnly],
  );
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [majors.length]);
  const pick = (e: SpectatorEvent) => {
    setOpen(open === e.id ? null : e.id);
    onShow(e.region);
  };

  if (!sp.events.length) {
    return <div class="obs-empty"><StatePlate icon="chronicle" title={t('Nothing recorded yet')}>{t('Step or play the match: what the civilizations live through is recorded here, round by round.')}</StatePlate></div>;
  }
  return (
    <div class="events" data-testid="events">
      {majors.length ? (
        <div class="ev-strip-wrap">
          <p class="ev-kicker"><Icon name="star" size={11} /> {t('Major moments')}</p>
          <div class="ev-strip" ref={strip} data-testid="events-timeline">
            {majors.map((e) => {
              const c = civOf(e.seat);
              return (
                <button type="button" class="ev-major" style={{ '--civ': c?.color ?? '#8a7d6a' } as JSX.CSSProperties} title={`${fmtYear(e.month)} · ${tc(e.title)}`} data-testid="timeline-moment" onClick={() => pick(e)}>
                  <span class="ev-major-art"><Vignette art={e.art} /></span>
                  <span class="ev-major-year">{fmtYear(e.month)}</span>
                  <span class="ev-major-title">{tc(e.title)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div class="ev-filters">
        <div class="ev-filter-row" role="group" aria-label={t('Filter by civilization')}>
          <button type="button" class={cx('ev-chip', seat === null && 'is-active')} data-testid="events-civ-all" onClick={() => setSeat(null)}>{t('All')}</button>
          {sp.civs.map((c) => (
            <button type="button" class={cx('ev-chip', seat === c.seat && 'is-active')} aria-pressed={seat === c.seat} data-testid={`events-civ-${c.seat}`} onClick={() => setSeat(seat === c.seat ? null : c.seat)}>
              <Emblem seat={c.seat} color={c.color} name={c.name} size={14} />{tc(c.name)}
            </button>
          ))}
        </div>
        <div class="ev-filter-row" role="group" aria-label={t('Filter by category')}>
          <button type="button" class={cx('ev-chip', cat === null && 'is-active')} onClick={() => setCat(null)}>{t('Every kind')}</button>
          {cats.map((k) => (
            <button type="button" class={cx('ev-chip', cat === k && 'is-active')} aria-pressed={cat === k} data-testid={`events-cat-${k}`} onClick={() => setCat(cat === k ? null : k)}>{t(CATEGORY_LABEL[k] ?? k)}</button>
          ))}
          <button type="button" class={cx('ev-chip is-toggle', majorOnly && 'is-active')} aria-pressed={majorOnly} data-testid="events-major" onClick={() => setMajorOnly(!majorOnly)}><Icon name="star" size={11} />{t('Major only')}</button>
        </div>
      </div>
      <p class="ev-count" data-testid="events-count">{list.length === sp.events.length ? t('{n} events, newest first', { n: list.length }) : t('{n} of {m} events, newest first', { n: list.length, m: sp.events.length })}</p>
      {list.length ? (
        <ol class="ev-feed">
          {list.slice(0, limit).map((e) => {
            const c = civOf(e.seat);
            const isOpen = open === e.id;
            return (
              <li>
                <button type="button" class={cx('ev', e.major && 'is-major', isOpen && 'is-open', e.epistemic !== 'verified' && 'is-reported')} style={{ '--civ': c?.color ?? '#8a7d6a' } as JSX.CSSProperties}
                  aria-expanded={isOpen} data-testid="event-item" data-seat={e.seat} data-category={e.category} onClick={() => pick(e)}>
                  <span class="ev-art"><Vignette art={e.art} /></span>
                  <span class="ev-body">
                    <span class="ev-meta">
                      {c ? <Emblem seat={c.seat} color={c.color} name={c.name} size={14} /> : null}
                      <b>{c ? tc(c.name) : t('Seat {n}', { n: e.seat + 1 })}</b>
                      <span>{fmtYear(e.month)}</span>
                      <span class="ev-cat">{t(CATEGORY_LABEL[e.category] ?? e.category)}</span>
                      {e.major ? <span class="ev-star" title={t('Major moment')}><Icon name="star" size={10} /></span> : null}
                      {e.region !== null ? <span class="ev-pin" title={t('Shown on the map')}><Icon name="pin" size={11} /></span> : null}
                    </span>
                    <span class="ev-title">{tc(e.title)}</span>
                    <span class="ev-text">{tc(e.text)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : <p class="empty">{t('No event matches these filters.')}</p>}
      {list.length > limit ? <button type="button" class="more-btn" onClick={() => setLimit(limit + 80)}>{t('Show {n} earlier events', { n: Math.min(80, list.length - limit) })}</button> : null}
    </div>
  );
}

// --- agents ----------------------------------------------------------------------------------

function LogEntry({ e }: { e: AgentLogEntry }) {
  const secs = e.duration_ms / 1000;
  return (
    <li class={cx('log', e.error && 'has-error')} data-testid="agent-log-entry">
      <div class="log-head">
        <b>{fmtYear(e.month)}</b>
        <span>{t('round {n}', { n: e.round })}</span>
        <span class="log-phase">{t(PHASE_LABEL[e.phase as keyof typeof PHASE_LABEL] ?? e.phase)}</span>
        <span class="log-counts">
          <span class="pos" title={t('Orders accepted')}><Icon name="check" size={11} />{e.accepted}</span>
          <span class={e.rejected ? 'neg' : 'muted'} title={t('Orders rejected')}><Icon name="cross" size={11} />{e.rejected}</span>
          <span class="muted" title={t('Time the agent took')}><Icon name="clock" size={11} />{secs >= 10 ? t('{n} s', { n: Math.round(secs) }) : t('{n} s', { n: secs.toFixed(1) })}</span>
        </span>
      </div>
      {e.note ? <p class="log-note">“{e.note}”</p> : <p class="log-note is-none">{t('No note this time.')}</p>}
      {e.actions.length ? <p class="log-actions">{e.actions.map((a) => <span class="log-action">{actionLabel(a)}</span>)}</p> : null}
      {e.tool_calls || e.cost_usd || e.tokens || (e.attempts ?? 1) > 1 ? (
        <p class="log-meta">
          {[
            e.tool_calls ? (e.tool_calls === 1 ? t('1 game tool call') : t('{n} game tool calls', { n: e.tool_calls })) : null,
            (e.attempts ?? 1) > 1 ? t('{n} attempts', { n: e.attempts ?? 1 }) : null,
            e.cost_usd ? t('${n}', { n: e.cost_usd.toFixed(3) }) : null,
            e.tokens ? t('{n} tokens', { n: e.tokens.toLocaleString() }) : null,
          ].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {e.steward_took_over ? <p class="log-steward">{t('The steward played this round')}</p> : null}
      {e.error ? <p class="log-error"><Icon name="warn" size={12} /> <span>{e.error}</span></p> : null}
      {e.hint ? <p class="log-hint"><Icon name="info" size={11} /> <span>{tc(e.hint)}</span></p> : null}
    </li>
  );
}

/** Resume a stopped agent seat, or stop one, then show the new state. */
async function control(seat: SeatId, op: 'resume' | 'stop'): Promise<void> {
  try {
    await api.agentControl(seat, op);
    await refresh();
  } catch (e) {
    toast({ tone: 'bad', title: t('The agent seat could not be changed'), detail: e instanceof Error ? e.message : String(e) });
  }
}

function Agents({ state, sp, thinkingOf }: { state: AppState; sp: SpectatorView; thinkingOf: (a: AgentInfo) => number }) {
  const seats = (state.summary?.seats ?? []).filter((x) => x.agent);
  const [expanded, setExpanded] = useState<SeatId[]>([]);
  if (!seats.length) {
    return (
      <div class="obs-empty" data-testid="agents-empty">
        <StatePlate icon="agent" title={t('Every seat is a built-in AI')}>
          {t('No language model is playing this match, so there are no notes to read. Give a seat to an LLM agent on the setup screen to watch one think.')}
        </StatePlate>
      </div>
    );
  }
  return (
    <div class="agents" data-testid="agents">
      {seats.map((x) => {
        const agent = x.agent!;
        const civ = sp.civs.find((c) => c.seat === x.seat);
        const log = state.agentLogs[x.seat];
        const entries = log ? [...log].reverse() : [];
        const all = expanded.includes(x.seat) || seats.length === 1;
        const shown = all ? entries.slice(0, 60) : entries.slice(0, 3);
        return (
          <section class={cx('agent-card', 'is-' + agent.state)} style={{ '--civ': x.color } as JSX.CSSProperties} data-testid={`agent-card-${x.seat}`}>
            <header class="agent-head">
              <Emblem seat={x.seat} color={x.color} name={x.name} size={34} />
              <div class="agent-id">
                <b>{tc(x.name)}</b>
                <span><Icon name="agent" size={11} /> {providerName(agent)} · {agent.model || t('default model')}</span>
                <span class="muted">{agent.mode === 'agent' ? t('agent with the game’s tools') : agent.mode === 'oneshot' ? t('one reply per consultation') : null}{agent.mode ? ' · ' : ''}{everyLabel(agent.consult_every)} · {agent.calls === 1 ? t('1 call so far') : t('{n} calls so far', { n: agent.calls })}</span>
                {agent.spent_usd || agent.tokens ? <span class="agent-spend">{agent.spent_usd ? t('Spent about ${n}', { n: agent.spent_usd.toFixed(2) }) : ''}{agent.spent_usd && agent.tokens ? ' · ' : ''}{agent.tokens ? t('{n} tokens', { n: agent.tokens.toLocaleString() }) : ''}</span> : null}
              </div>
              <div class="agent-side">
                <AgentChip agent={agent} seconds={thinkingOf(agent)} />
                <div class="agent-controls">
                  {agent.state === 'stopped' || agent.state === 'error'
                    ? <Btn small nav icon="play" testid={`agent-resume-${x.seat}`} onClick={() => void control(x.seat, 'resume')}>{t('Resume')}</Btn>
                    : <Btn small kind="ghost" nav icon="pause" testid={`agent-stop-${x.seat}`} title={t('Stop consulting this agent; the steward carries on alone')} onClick={() => void control(x.seat, 'stop')}>{t('Stop')}</Btn>}
                  <Btn small nav icon="eye" title={t('View as {name}', { name: tc(x.name) })} onClick={() => void viewAsSeat(x.seat)}>{t('View as')}</Btn>
                </div>
              </div>
            </header>
            {agent.last_error ? (
              <div class="agent-error" role="alert" data-testid="agent-error">
                <Icon name="warn" size={15} />
                <div>
                  <b>{agent.state === 'stopped' ? t('The agent has stopped. A steward carries on alone; press Resume to try again.') : agent.state === 'error' ? t('The agent failed this round; the steward played it. It will be tried again next round ({n} of {max} failures in a row).', { n: agent.errors_in_row ?? 1, max: agent.max_failures ?? 3 }) : t('The agent’s last error')}</b>
                  <span>{agent.last_error}</span>
                  {agent.last_hint ? <span class="log-hint"><Icon name="info" size={11} /> {tc(agent.last_hint)}</span> : null}
                </div>
              </div>
            ) : null}
            {agent.last_note ? <p class="agent-note"><span class="agent-note-k">{t('Latest note')}</span>“{agent.last_note}”</p> : null}
            {civ && (x.delegates ?? []).length ? <p class="agent-steward"><Icon name="politics" size={12} /> {t('Steward in charge of: {domains}', { domains: (x.delegates ?? []).map((d) => t(d)).join(', ') })}</p> : null}
            <p class="agent-log-k">{t('Log')} <small>{log ? (entries.length === 1 ? t('1 entry, newest first') : t('{n} entries, newest first', { n: entries.length })) : t('loading…')}</small></p>
            {entries.length ? (
              <ol class="agent-log" data-testid="agent-log">{shown.map((e) => <LogEntry e={e} />)}</ol>
            ) : log ? <p class="empty">{t('This agent has not been consulted yet.')}</p> : null}
            {entries.length > shown.length ? (
              <button type="button" class="more-btn" data-testid={`agent-log-more-${x.seat}`} onClick={() => setExpanded([...expanded, x.seat])}>{t('Show {n} earlier entries', { n: Math.min(60, entries.length) - shown.length })}</button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

// --- region card ------------------------------------------------------------------------------

function RegionCard({ sp, id, onClose }: { sp: SpectatorView; id: RegionId; onClose: () => void }) {
  const r = sp.regions.find((x) => x.id === id);
  if (!r) return null;
  const civOf = (seat: SeatId | null) => (seat === null ? undefined : sp.civs.find((c) => c.seat === seat));
  const owner = civOf(r.owner);
  const holder = r.controller !== r.owner ? civOf(r.controller) : undefined;
  const armies = sp.armies.filter((a) => a.region === id);
  const facilities = r.own?.facilities ?? [];
  return (
    <aside class="region-card" aria-label={tc(r.name)} data-testid="observer-region">
      <header>
        <div>
          <span class="rc-kicker">{t(TERRAIN_LABEL[r.terrain])} · {t(SETTLEMENT_LABEL[r.settlement])}{r.coastal ? ' · ' + t('coast') : ''}{r.river ? ' · ' + t('river') : ''}</span>
          <h3>{tc(r.name)}</h3>
        </div>
        <button type="button" class="rc-close" aria-label={t('Close')} onClick={onClose}><Icon name="close" size={13} /></button>
      </header>
      <div class="rc-body">
        <p class="rc-owner">
          {owner ? <><Emblem seat={owner.seat} color={owner.color} name={owner.name} size={20} /> <b>{tc(owner.name)}</b></> : <span class="muted">{t('Unclaimed land')}</span>}
          {holder ? <span class="rc-held"><Icon name="sword" size={11} /> {t('held by {name}', { name: tc(holder.name) })}</span> : null}
          {owner && owner.capital === r.id ? <span class="rc-tag"><Icon name="star" size={10} /> {t('Capital')}</span> : null}
        </p>
        {r.test_node ? <p class="rc-node"><Icon name="rocket" size={12} /> {t('Deployment test node')}</p> : null}
        {r.own ? (
          <dl class="rc-kvs">
            <div><dt>{t('Population')}</dt><dd title={int(r.own.population)}>{t('{n} people', { n: peopleNum(r.own.population) })}</dd></div>
            <div><dt>{t('Working age')}</dt><dd title={int(r.own.working_age)}>{t('{n} people', { n: peopleNum(r.own.working_age) })}</dd></div>
            <div><dt>{t('Unrest')}</dt><dd class={r.own.unrest_bp > 3000 ? 'neg' : ''}>{Math.round(r.own.unrest_bp / 100)}%</dd></div>
          </dl>
        ) : null}
        {facilities.length ? (
          <>
            <p class="rc-k">{t('Facilities')}</p>
            <ul class="rc-fac">
              {facilities.map((f) => <li class={f.enabled ? '' : 'is-off'}><span>{tc(f.name)}</span><small>{t('level {n}', { n: f.level })}</small></li>)}
            </ul>
          </>
        ) : r.own ? <p class="muted small">{t('Nothing built here yet.')}</p> : null}
        {armies.length ? (
          <>
            <p class="rc-k">{t('Armies present')}</p>
            <ul class="rc-armies">
              {armies.map((a) => {
                const c = civOf(a.owner);
                return (
                  <li class={a.in_battle ? 'is-battle' : ''}>
                    {c ? <Emblem seat={c.seat} color={c.color} name={c.name} size={14} /> : null}
                    <span>{tc(a.name)}</span>
                    <small>{t('{n} soldiers · tier {k}', { n: peopleNum(a.soldiers), k: a.tier })}{a.in_battle ? ' · ' + t('in battle') : ''}</small>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        {owner ? <Btn small nav icon="eye" onClick={() => void viewAsSeat(owner.seat)}>{t('View as {name}', { name: tc(owner.name) })}</Btn> : null}
      </div>
    </aside>
  );
}

// --- result ----------------------------------------------------------------------------------------

function Result({ sp, seats }: { sp: SpectatorView; seats: SeatSummary[] }) {
  const out = sp.outcome;
  const winner = out && out.winner !== null ? sp.civs.find((c) => c.seat === out.winner) : undefined;
  const month = out?.finished_month ?? sp.month;
  const ranked = [...sp.civs].sort((a, b) => (b.reward ?? -9) - (a.reward ?? -9) || a.seat - b.seat);
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={t('Match result')} data-testid="result-screen">
      <div class="overlay-card result-card obs-result">
        <div class="result-crest" aria-hidden="true">
          {winner ? <Emblem seat={winner.seat} color={winner.color} name={winner.name} size={68} /> : <BrandMark size={64} />}
        </div>
        <p class="eyebrow">{t('{year} · the match has ended', { year: fmtYear(month, month === sp.month ? sp.date : null) })}</p>
        <h2>{winner ? t('{name} prevails', { name: tc(winner.name) }) : t('No civilization prevailed')}</h2>
        {out ? <p class="result-reason">{tc(out.reason)}</p> : null}
        <table class="result-table">
          <thead><tr><th>{t('Civilization')}</th><th>{t('Played by')}</th><th>{t('Status')}</th><th class="num">{t('Reward')}</th></tr></thead>
          <tbody>
            {ranked.map((c) => (
              <tr class={winner && c.seat === winner.seat ? 'is-winner' : ''}>
                <th scope="row"><Emblem seat={c.seat} color={c.color} name={c.name} size={18} /> {tc(c.name)}</th>
                <td>{controllerLine(c, seats.find((x) => x.seat === c.seat))}</td>
                <td>{t(STATUS_LABEL[c.status] ?? c.status)}</td>
                <td class="num"><b>{c.reward !== null ? c.reward.toFixed(3) : '—'}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="muted small">{t('The sole winner scores 2 − T/H; every other seat scores −1.')}</p>
        <div class="row-end">
          <Btn kind="ghost" nav testid="result-keep-looking" onClick={dismissResult}>{t('Keep looking')}</Btn>
          {winner ? <Btn nav icon="eye" testid="result-view-winner" onClick={() => { dismissResult(); void viewAsSeat(winner.seat); }}>{t('View as {name}', { name: tc(winner.name) })}</Btn> : null}
          <Btn kind="primary" nav icon="flag" testid="result-new-match" onClick={() => setScreen('setup')}>{t('New match…')}</Btn>
        </div>
      </div>
    </div>
  );
}
