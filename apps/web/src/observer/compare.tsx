// Comparison panels of the observer console: how the four civilizations have
// moved over the rounds watched (one focus chart and a tile per measure), and
// two chosen civilizations side by side. Everything is read from the referee's
// spectator view and the console's own record of it (see history.ts).
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { SeatId, SpectatorCiv, SpectatorView } from '../protocol';
import { FTL_MONTHS, GOVERNANCE_MONTHS } from '../protocol';
import { compact, fmtYear, histYear, int, peopleNum, tonnes } from '../format';
import { Icon } from '../icons';
import { cx } from '../ui';
import { t, tc } from '../i18n';
import { Emblem } from '../theme/emblem';
import { LineChart, SeriesKey, Spark, type ChartSeries } from './chart';
import { FOOD_CAP_MONTHS, METRIC_KEYS, measure, useHistory, worksBySeat, type History, type MetricKey } from './history';

interface MetricDef {
  key: MetricKey;
  icon: string;
  /** Short name for tiles and rows. */
  label: string;
  /** What the y-axis counts. */
  unit: string;
  hint: string;
  fmt: (v: number) => string;
  max?: number;
  whole?: boolean;
}

const whole = (v: number) => (v >= 10000 ? compact(Math.round(v)) : int(Math.round(v)));
const loose = (v: number) => compact(v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
/** Head counts: exact below ten thousand, then 240k / 1.2M (24万 / 1.2亿). */
const heads = (v: number) => peopleNum(v);

function metricDefs(): MetricDef[] {
  return [
    { key: 'population', icon: 'people', label: t('Population'), unit: t('people'), hint: t('Everyone living under each government.'), fmt: heads, whole: true },
    { key: 'regions', icon: 'pin', label: t('Regions'), unit: t('regions held'), hint: t('Regions each civilization governs.'), fmt: whole, whole: true },
    { key: 'techs', icon: 'knowledge', label: t('Technologies'), unit: t('technologies understood'), hint: t('Technologies understood, not merely discovered.'), fmt: whole, whole: true },
    { key: 'stability', icon: 'balance', label: t('Stability'), unit: t('score, 0–100'), hint: t('How far people accept being governed.'), fmt: (v) => String(Math.round(v)), max: 100, whole: true },
    {
      key: 'food', icon: 'grain', label: t('Food security'), unit: t('months of food in store'),
      hint: t('Months of consumption held in store; the chart stops at {n}.', { n: FOOD_CAP_MONTHS }),
      fmt: (v) => (v >= FOOD_CAP_MONTHS ? `${FOOD_CAP_MONTHS}+` : v.toFixed(1)),
    },
    { key: 'works', icon: 'hammer', label: t('Works built'), unit: t('facility levels'), hint: t('Built levels of every facility: farms, mines, workshops, schools, power and the rest.'), fmt: whole, whole: true },
    { key: 'goods', icon: 'box', label: t('Manufactured goods'), unit: t('tonnes in store'), hint: t('Tools, metal, components, electronics, fuel and other made goods held in store, added up by mass (a lot of tools is 0.25 t, of devices 0.05 t).'), fmt: (v) => tonnes(v) },
    { key: 'research', icon: 'flask', label: t('Research'), unit: t('researcher-months per month'), hint: t('Researcher-months a month that staffed research posts can put into investigations.'), fmt: loose },
    { key: 'soldiers', icon: 'military', label: t('Military strength'), unit: t('soldiers under arms'), hint: t('People under arms. Equipment tiers are on the scoreboard.'), fmt: heads, whole: true },
    {
      key: 'objective', icon: 'rocket', label: t('Objective progress'), unit: t('% of the road to the final objective'),
      hint: t('Five equal steps: scientific method, planetary reach, interstellar reach, the governance streak ({g} months) and the jump-service streak ({f} months).', { g: GOVERNANCE_MONTHS, f: FTL_MONTHS }),
      fmt: (v) => Math.round(v) + '%', max: 100,
    },
  ];
}

/** A sample's date: the historical year where the referee keeps a calendar, else the game year. */
function when(s: { month: number; year?: number | null }): string {
  return s.year != null ? histYear(s.year) : fmtYear(s.month);
}

/** The same as a phrase: "5000 BC" or "Year 4". */
function whenLong(s: { month: number; year?: number | null }): string {
  return s.year != null ? histYear(s.year) : fmtYear(s.month);
}

function seriesFor(h: History, civs: SpectatorCiv[], metric: MetricKey, only?: SeatId[]): ChartSeries[] {
  const mi = METRIC_KEYS.indexOf(metric);
  const out: ChartSeries[] = [];
  h.seats.forEach((seat, ci) => {
    if (only && !only.includes(seat)) return;
    const c = civs.find((x) => x.seat === seat);
    if (!c) return;
    out.push({ seat, name: tc(c.name), color: c.color, points: h.samples.map((s) => ({ x: s.month, y: s.values[ci]?.[mi] ?? 0, round: s.round, year: s.year ?? null })) });
  });
  return out;
}

/** What survives a tab switch or a perspective switch: the console remembers what was being compared. */
const memory: { view: 'trends' | 'duel'; metric: MetricKey; a: SeatId | null; b: SeatId | null; table: boolean } = {
  view: 'trends', metric: 'population', a: null, b: null, table: false,
};

function Coverage({ h, sp }: { h: History; sp: SpectatorView }) {
  const first = h.samples[0], last = h.samples[h.samples.length - 1];
  if (!first || !last) return null;
  const partial = first.round > 1;
  const gaps = h.samples.length < last.round - first.round + 1;
  return (
    <p class={cx('cmp-cover', partial && 'is-partial')} data-testid="compare-coverage" data-partial={partial ? '1' : '0'}>
      <Icon name={partial ? 'info' : 'clock'} size={13} />
      <span>
        {partial
          ? t('History covers only the rounds watched here: {a} to {b}. This console began watching in {a}; the referee keeps no earlier record to show.', { a: whenLong(first), b: whenLong(last) })
          : h.samples.length < 2
            ? t('The record starts now. Step or play the match and the lines will grow, one point per round watched.')
            : t('Recorded by this console while watching: {a} to {b}, {n} rounds.', { a: whenLong(first), b: whenLong(last), n: h.samples.length })}
        {gaps && h.samples.length > 1 ? ' ' + t('Some rounds passed between snapshots; lines join the rounds that were sampled.') : ''}
        {sp.round !== last.round ? ' ' + t('Waiting for the next snapshot…') : ''}
      </span>
    </p>
  );
}

function DataTable({ h, series, def }: { h: History; series: ChartSeries[]; def: MetricDef }) {
  const n = h.samples.length;
  const want = Math.min(n, 9);
  const picks: number[] = [];
  for (let i = 0; i < want; i++) picks.push(want === 1 ? n - 1 : Math.round((i * (n - 1)) / (want - 1)));
  const rows = [...new Set(picks)].reverse();
  return (
    <table class="cmp-table" data-testid="compare-table">
      <caption>{def.label} · {def.unit}</caption>
      <thead><tr><th>{t('Year')}</th>{series.map((s) => <th><SeriesKey seat={s.seat} color={s.color} width={18} />{s.name}</th>)}</tr></thead>
      <tbody>
        {rows.map((i) => (
          <tr><th scope="row">{when(h.samples[i])}</th>{series.map((s) => <td>{def.fmt(s.points[i]?.y ?? 0)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function FocusChart({ h, series, def, testid }: { h: History; series: ChartSeries[]; def: MetricDef; testid: string }) {
  const [table, setTable] = useState(memory.table);
  return (
    <section class="cmp-focus" aria-label={def.label}>
      <header class="cmp-focus-head">
        <div>
          <h3><Icon name={def.icon} size={15} /> {def.label}</h3>
          <p>{def.hint}</p>
        </div>
        <button type="button" class={cx('cmp-toggle', table && 'is-active')} aria-pressed={table} data-testid="compare-table-toggle"
          title={t('Show the same figures as a table')} onClick={() => { memory.table = !table; setTable(!table); }}>
          <Icon name="layers" size={12} />{t('Table')}
        </button>
      </header>
      <LineChart series={series} fmt={def.fmt} unit={def.unit} max={def.max} whole={def.whole} label={`${def.label} (${def.unit})`} testid={testid} />
      {table ? <DataTable h={h} series={series} def={def} /> : null}
    </section>
  );
}

function Trends({ h, sp, defs, metric, onMetric }: { h: History; sp: SpectatorView; defs: MetricDef[]; metric: MetricKey; onMetric: (m: MetricKey) => void }) {
  const def = defs.find((d) => d.key === metric) ?? defs[0];
  const last = h.samples[h.samples.length - 1];
  return (
    <>
      <FocusChart h={h} series={seriesFor(h, sp.civs, def.key)} def={def} testid="compare-chart" />
      <div class="cmp-tiles" role="radiogroup" aria-label={t('Measure')}>
        {defs.map((d) => {
          const series = seriesFor(h, sp.civs, d.key);
          const mi = METRIC_KEYS.indexOf(d.key);
          // The leader now, named: a tile is readable without its sparkline.
          let lead: { c: SpectatorCiv; v: number } | null = null;
          let tie = false;
          if (last) {
            h.seats.forEach((seat, ci) => {
              const c = sp.civs.find((x) => x.seat === seat);
              const v = last.values[ci]?.[mi] ?? 0;
              if (!c) return;
              if (!lead || v > lead.v) { lead = { c, v }; tie = false; } else if (v === lead.v) tie = true;
            });
          }
          const top = lead as { c: SpectatorCiv; v: number } | null;
          return (
            <button type="button" role="radio" aria-checked={d.key === metric} class={cx('cmp-tile', d.key === metric && 'is-active')} title={d.hint}
              data-testid={`compare-metric-${d.key}`} onClick={() => onMetric(d.key)}>
              <span class="cmp-tile-name"><Icon name={d.icon} size={12} />{d.label}</span>
              <Spark series={series} max={d.max} />
              <span class="cmp-tile-lead">
                {top && !tie && top.v > 0
                  ? <><Emblem seat={top.c.seat} color={top.c.color} name={top.c.name} size={13} /><b>{d.fmt(top.v)}</b><small>{tc(top.c.name)}</small></>
                  : <small>{top ? t('level at {v}', { v: d.fmt(top.v) }) : '—'}</small>}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function CivPicker({ civs, value, other, label, testid, onPick }: { civs: SpectatorCiv[]; value: SeatId; other: SeatId; label: string; testid: string; onPick: (s: SeatId) => void }) {
  return (
    <div class="duel-pick" role="radiogroup" aria-label={label}>
      {civs.map((c) => (
        <button type="button" role="radio" aria-checked={c.seat === value} disabled={c.seat === other} class={cx('duel-opt', c.seat === value && 'is-active')}
          title={c.seat === other ? t('Already on the other side') : tc(c.name)} data-testid={`${testid}-${c.seat}`} onClick={() => onPick(c.seat)}>
          <Emblem seat={c.seat} color={c.color} name={c.name} size={18} /><span>{tc(c.name)}</span>
        </button>
      ))}
    </div>
  );
}

function Duel({ h, sp, defs, metric, onMetric }: { h: History; sp: SpectatorView; defs: MetricDef[]; metric: MetricKey; onMetric: (m: MetricKey) => void }) {
  const civs = sp.civs;
  const ranked = [...civs].sort((x, y) => y.population - x.population);
  const [a, setA] = useState<SeatId>(() => (memory.a !== null && civs.some((c) => c.seat === memory.a) ? memory.a : ranked[0]?.seat ?? 0));
  const [b, setB] = useState<SeatId>(() => (memory.b !== null && civs.some((c) => c.seat === memory.b) && memory.b !== memory.a ? memory.b : ranked.find((c) => c.seat !== a)?.seat ?? 1));
  const ca = civs.find((c) => c.seat === a), cb = civs.find((c) => c.seat === b);
  if (!ca || !cb) return null;
  const works = worksBySeat(sp);
  const va = measure(ca, works.get(a) ?? 0), vb = measure(cb, works.get(b) ?? 0);
  const def = defs.find((d) => d.key === metric) ?? defs[0];
  const pickA = (s: SeatId) => { memory.a = s; setA(s); };
  const pickB = (s: SeatId) => { memory.b = s; setB(s); };
  const war = ca.at_war_with.includes(b) || cb.at_war_with.includes(a);
  const lord = ca.overlord === b ? [ca, cb] : cb.overlord === a ? [cb, ca] : null;
  const style = { '--a': ca.color, '--b': cb.color } as JSX.CSSProperties;
  return (
    <div class="duel" style={style} data-testid="compare-duel">
      <div class="duel-heads">
        <div class="duel-side">
          <CivPicker civs={civs} value={a} other={b} label={t('First civilization')} testid="duel-a" onPick={pickA} />
        </div>
        <span class="duel-vs" aria-hidden="true">{t('vs')}</span>
        <div class="duel-side is-b">
          <CivPicker civs={civs} value={b} other={a} label={t('Second civilization')} testid="duel-b" onPick={pickB} />
        </div>
      </div>
      <p class={cx('duel-rel', war && 'is-war')}>
        <Icon name={war ? 'sword' : lord ? 'crown' : 'balance'} size={13} />
        {war ? t('{a} and {b} are at war.', { a: tc(ca.name), b: tc(cb.name) })
          : lord ? t('{a} is subordinate to {b}.', { a: tc(lord[0].name), b: tc(lord[1].name) })
          : t('{a} and {b} are at peace.', { a: tc(ca.name), b: tc(cb.name) })}
      </p>
      <table class="duel-table">
        <thead>
          <tr>
            <th class="duel-name is-a" colSpan={2}><Emblem seat={ca.seat} color={ca.color} name={ca.name} size={22} /> {tc(ca.name)}</th>
            <th class="duel-mid">{t('Now')}</th>
            <th class="duel-name is-b" colSpan={2}>{tc(cb.name)} <Emblem seat={cb.seat} color={cb.color} name={cb.name} size={22} /></th>
          </tr>
        </thead>
        <tbody>
          {defs.map((d) => {
            const mi = METRIC_KEYS.indexOf(d.key);
            const x = va[mi], y = vb[mi];
            const top = d.max ?? Math.max(x, y, 1e-9);
            const wa = Math.max(0, Math.min(1, x / top)), wb = Math.max(0, Math.min(1, y / top));
            return (
              <tr class={cx('duel-row', d.key === metric && 'is-active')} data-testid={`duel-row-${d.key}`}>
                <td class={cx('duel-val is-a', x > y && 'is-lead')}>{x > y ? <Icon name="star" size={9} /> : null}{d.fmt(x)}</td>
                <td class="duel-bar is-a"><i style={{ width: (wa * 100).toFixed(1) + '%' }} /></td>
                <th scope="row" class="duel-mid">
                  <button type="button" class="duel-metric" aria-pressed={d.key === metric} title={`${d.hint} ${t('Click to chart it below.')}`} onClick={() => onMetric(d.key)}>
                    <Icon name={d.icon} size={12} />{d.label}
                  </button>
                </th>
                <td class="duel-bar is-b"><i style={{ width: (wb * 100).toFixed(1) + '%' }} /></td>
                <td class={cx('duel-val is-b', y > x && 'is-lead')}>{d.fmt(y)}{y > x ? <Icon name="star" size={9} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="duel-key"><Icon name="star" size={9} /> {t('leads the pair. Bars share one scale per row.')}</p>
      <FocusChart h={h} series={seriesFor(h, civs, def.key, [a, b])} def={def} testid="duel-chart" />
    </div>
  );
}

export function Compare({ sp }: { sp: SpectatorView }) {
  const h = useHistory();
  const [view, setView] = useState(memory.view);
  const [metric, setMetric] = useState<MetricKey>(memory.metric);
  const defs = metricDefs();
  const pickView = (v: 'trends' | 'duel') => { memory.view = v; setView(v); };
  const pickMetric = (m: MetricKey) => { memory.metric = m; setMetric(m); };
  const ready = h.matchId === sp.match_id && h.samples.length > 0;
  return (
    <div class="compare" data-testid="compare">
      <div class="cmp-switch" role="tablist" aria-label={t('Comparison')}>
        <button type="button" role="tab" aria-selected={view === 'trends'} class={cx('cmp-switch-opt', view === 'trends' && 'is-active')} data-testid="compare-trends" onClick={() => pickView('trends')}>
          <Icon name="objectives" size={13} />{t('All over time')}
        </button>
        <button type="button" role="tab" aria-selected={view === 'duel'} class={cx('cmp-switch-opt', view === 'duel' && 'is-active')} data-testid="compare-duel-tab" onClick={() => pickView('duel')}>
          <Icon name="swap" size={13} />{t('Head to head')}
        </button>
      </div>
      {ready ? <Coverage h={h} sp={sp} /> : null}
      {!ready ? <p class="cmp-cover"><Icon name="clock" size={13} /><span>{t('Waiting for the first snapshot…')}</span></p>
        : view === 'trends' ? <Trends h={h} sp={sp} defs={defs} metric={metric} onMetric={pickMetric} />
        : <Duel h={h} sp={sp} defs={defs} metric={metric} onMetric={pickMetric} />}
    </div>
  );
}
