// Market: one row per good with stock, cover, last round's supply against demand,
// a status chip and an expandable account of who makes and who uses it.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Good, Observation } from '../protocol';
import { GOOD_LABEL, GOOD_SHORT, int, pct, people, rations } from '../format';
import { t, tc } from '../i18n';
import { Icon } from '../icons';
import { GoodIcon } from '../theme/goods';
import { Select, cx } from '../ui';
import { civName } from '../store';
import { GROUPS, STATUS_RANK, type FlowLine, type GoodRow, type Ledger, type Status } from './model';
import { BalanceBar, E, Glyph, STATUS_LABEL, StatusChip, V, amt, amtSigned, coverText, perMo, tip } from './parts';
import type { Nav } from './Ledger';

type SortKey = 'group' | 'status' | 'cover' | 'net' | 'stock' | 'name';

const RULE = 'Shortage: a works ran short of it, stock covers under 2 months, or open projects need more than is in store. Stores full: makers are holding back because stock is above its working target. Tight: stock would run out within 12 months at last round’s pace, or covers under 4 months. Surplus: supply beat use by more than a tenth. Otherwise balanced.';

function statusTip(row: GoodRow, obs: Observation): string {
  const months = (n: number | null) => coverText(n);
  let first = '';
  switch (row.why) {
    case 'starved': first = t('{n} works ran short of it last month.', { n: row.starved.length }); break;
    case 'hunger': first = t('Food reached only {pct} of what people needed.', { pct: pct(obs.civ.food_fulfillment_bp) }); break;
    case 'cover2': first = t('Stock covers only {n} months of use.', { n: months(row.cover) }); break;
    case 'owed': first = t('Open projects still need {need}; only {have} is in store.', { need: amt(row.good, row.owed), have: amt(row.good, row.line.stock) }); break;
    case 'full': first = row.good === 'food' && !row.throttled.length
      ? t('Stock is at storage capacity; anything above it spoils quickly.')
      : t('Output is held back at {n} works because stock is above its working target.', { n: row.throttled.length });
      break;
    case 'runway': first = t('Use outran supply last round; at that pace the stock lasts about {n} months.', { n: months(row.runway) }); break;
    case 'cover4': first = row.good === 'food'
      ? t('Stock covers {n} months; the reserve target is {target}.', { n: months(row.cover), target: obs.civ.policies.food_reserve_months })
      : t('Stock covers only {n} months of use.', { n: months(row.cover) });
      break;
    case 'surplus': first = t('Supply beat use by {n} last round.', { n: amt(row.good, row.net) }); break;
    default: first = t('Supply and use were close last round and the stock is comfortable.');
  }
  return first + '\n' + t(RULE);
}

function lineText(l: FlowLine, obs: Observation, side: 'make' | 'use', good: Good): { title: string; sub: string; tipText: string } {
  const region = l.regionName ? tc(l.regionName) : '';
  const est = t('Estimate, per month.');
  switch (l.kind) {
    case 'recipe':
      return {
        title: tc(l.facilityName ?? ''),
        sub: l.off ? t('{region} · switched off', { region }) : t('{region} · level {level} at {pct}', { region, level: l.level ?? 0, pct: pct(l.rateBp ?? 0) }),
        tipText: (side === 'make'
          ? t('{recipe}: output per level × level {level} × last month’s rate {pct} × carriage (and ore grade for workings).', { recipe: tc(l.recipeName ?? ''), level: l.level ?? 0, pct: pct(l.rateBp ?? 0) })
          : t('{recipe}: input per level × level {level} × last month’s rate {pct}.', { recipe: tc(l.recipeName ?? ''), level: l.level ?? 0, pct: pct(l.rateBp ?? 0) })) + '\n' + est + ' ' + t('Click to open the works.'),
      };
    case 'food':
      return { title: t('Farms, herds and fishing'), sub: t('{region} · {n} food workers', { region, n: people(l.count ?? 0) }), tipText: t('The harvest is not a recipe. The referee’s verified total is shared out here by each region’s food workers last month.') + '\n' + est };
    case 'household':
      return { title: t('Household craft'), sub: t('{n} people without posts', { n: people(l.count ?? 0) }), tipText: t('People without a post make up to 0.3 t each per month while stores have room. Shown as the part of the verified total that recipes do not explain.') + '\n' + est };
    case 'treaty':
      return {
        title: side === 'make' ? t('Treaty delivery from {civ}', { civ: tc(civName(obs, l.seat ?? null)) }) : t('Treaty delivery to {civ}', { civ: tc(civName(obs, l.seat ?? null)) }),
        sub: t('signed amount, {n} months', { n: l.count ?? 0 }),
        tipText: t('The monthly amount written in the treaty. What was actually carried last round is in the verified totals above.'),
      };
    case 'upkeep':
      return { title: t('Upkeep'), sub: t('{region} · {n} works', { region, n: l.count ?? 0 }), tipText: t('Upkeep per level × level, for every works that is switched on in this region.') + '\n' + est };
    case 'teaching':
      return { title: t('Teaching materials'), sub: t('{region} · {n} students', { region, n: people(l.count ?? 0) }), tipText: t('Course materials per thousand students × students enrolled in running programmes.') + '\n' + est };
    case 'army':
      return { title: t('Army upkeep'), sub: t('{n} soldiers', { n: people(l.count ?? 0) }), tipText: t('Upkeep per thousand soldiers for each formation’s equipment tier × soldiers.') + '\n' + est };
    case 'people':
      return { title: t('Residents'), sub: t('{region} · {n} people', { region, n: people(l.count ?? 0) }), tipText: t('Everyone eats one ration (50 kg grain-equivalent) a month.') + '\n' + est };
    case 'spoilage':
      return { title: t('Spoilage and losses'), sub: t('remainder of the verified total'), tipText: t('Food used beyond what people and soldiers eat: 1.5–2.5% of the store spoils each month, and far more of anything above storage capacity.') + '\n' + est };
    case 'lost':
      return { title: t('Lost: spoiled, in carriage, abandoned'), sub: t('verified by the referee'), tipText: t('What nobody used last round: food that spoiled, goods lost in carriage to the common stock or to congested freight, and abandoned stores. Verified by the referee, shown as a monthly average.') };
    case 'fieldinputs':
      return { title: t('Field inputs'), sub: t('{n} field workers', { n: people(l.count ?? 0) }), tipText: t('Improved farming draws 0.01 t per field worker each month. Recognised from the part of the verified total that recipes and upkeep do not explain.') + '\n' + est };
    case 'otheruse':
      return { title: t('Not itemised'), sub: t('project inputs, equipment, rate changes'), tipText: t('Verified use that this ledger cannot attribute: inputs committed to projects, equipment for recruits, and months when rates differed from last month’s.') };
    case 'othermake':
      return { title: t('Not itemised'), sub: t('months that ran faster than the last'), tipText: t('Verified output above what last month’s rates explain: earlier months of the round ran faster, or a works has since been throttled.') };
    default:
      return { title: t('{n} smaller lines', { n: l.count ?? 0 }), sub: '', tipText: est };
  }
}

function Lines({ lines, side, obs, nav, max, good }: { lines: FlowLine[]; side: 'make' | 'use'; obs: Observation; nav: Nav; max: number; good: Good }) {
  if (!lines.length) return <p class="ledger-none">{side === 'make' ? t('Nothing makes it at present.') : t('Nothing draws on it at present.')}</p>;
  return (
    <ul class="ledger-lines">
      {lines.map((l) => {
        const x = lineText(l, obs, side, good);
        const click = l.cardKey ? () => nav.toCard(l.cardKey!) : l.region !== undefined ? () => nav.toRegion(l.region!) : l.kind === 'army' ? () => nav.open('military') : l.kind === 'treaty' ? () => nav.open('diplomacy') : null;
        const flag = l.starved ? <span class="ledger-flag is-bad">{t('short')}</span> : l.off ? <span class="ledger-flag">{t('off')}</span> : l.blocked ? <span class="ledger-flag is-warn">{t('held back')}</span> : null;
        const body = (
          <>
            <span class="ledger-line-name"><b>{x.title}</b>{flag}{x.sub ? <small>{x.sub}</small> : null}</span>
            <span class="ledger-line-bar"><i class={side === 'make' ? 'is-supply' : 'is-demand'} style={{ width: (max > 0 ? Math.max(l.perMonth > 0 ? 2 : 0, (l.perMonth / max) * 100) : 0).toFixed(1) + '%' }} /></span>
            <span class="ledger-line-num">{l.estimate ? <E>{perMo(l.perMonth, good)}</E> : <V>{perMo(l.perMonth, good)}</V>}</span>
          </>
        );
        return (
          <li class={cx(l.kind === 'otheruse' || l.kind === 'othermake' || l.kind === 'rest' ? 'is-rest' : null)}>
            {click
              ? <button type="button" class="ledger-line is-link" onClick={click} {...tip(x.tipText)}>{body}</button>
              : <div class="ledger-line" {...tip(x.tipText)}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function Breakdown({ row, obs, ledger, nav }: { row: GoodRow; obs: Observation; ledger: Ledger; nav: Nav }) {
  const max = Math.max(1, ...row.makers.map((l) => l.perMonth), ...row.users.map((l) => l.perMonth));
  const usedVerified = (row.line.consumed + (row.line.lost ?? 0)) / ledger.months;
  const period = t('Verified by the referee: total over the last round ({n} months), shown as a monthly average.', { n: ledger.months });
  const estTip = t('Sum of the lines below: this ledger’s estimate from last month’s rates.');
  // last month against the round's average: say so when they are far apart, instead of leaving two figures to puzzle over
  const drift = (est: number, verified: number) => {
    if (Math.max(est, verified) < 500) return null;
    if (est > verified * 1.25) return t('Last month ran faster than the round’s average, so the estimate is above the verified figure.');
    if (est < verified * 0.8) return t('Last month ran slower than the round’s average, so the estimate is below the verified figure.');
    return null;
  };
  const makeDrift = drift(row.makeEst, row.madePerMonth);
  const useDrift = drift(row.useEst, usedVerified);
  return (
    <div class="ledger-breakdown">
      <section>
        <header><h4>{t('Who makes it')}</h4><span class="ledger-recon"><V tipText={period}>{perMo(row.madePerMonth, row.good)}</V> <small>{t('verified')}</small> · <E tipText={estTip}>{perMo(row.makeEst, row.good)}</E></span></header>
        <Lines lines={row.makers} side="make" obs={obs} nav={nav} max={max} good={row.good} />
        {makeDrift ? <p class="ledger-drift">{makeDrift}</p> : null}
      </section>
      <section>
        <header><h4>{t('Who uses it')}</h4><span class="ledger-recon"><V tipText={period}>{perMo(usedVerified, row.good)}</V> <small>{t('verified')}</small> · <E tipText={estTip}>{perMo(row.useEst, row.good)}</E></span></header>
        <Lines lines={row.users} side="use" obs={obs} nav={nav} max={max} good={row.good} />
        {useDrift ? <p class="ledger-drift">{useDrift}</p> : null}
      </section>
      <section class="ledger-claims">
        <header><h4>{t('Claims on the store')}</h4><span class="ledger-recon"><V tipText={t('Inputs open projects still have to take from the store. One-off amounts, not per month. Source: the project list.')}>{amt(row.good, row.claims.reduce((a, c) => a + c.needed - c.committed, 0))}</V> <small>{t('still owed')}</small></span></header>
        {row.claims.length ? (
          <ul class="ledger-lines">
            {row.claims.slice(0, 7).map((c) => (
              <li>
                <button type="button" class="ledger-line is-link is-claim" onClick={() => nav.open('projects')} {...tip(t('Needs {need} in all; {done} already committed. Click to open projects.', { need: amt(row.good, c.needed), done: amt(row.good, c.committed) }))}>
                  <span class="ledger-line-name"><b>{tc(c.title)}</b>{c.paused ? <span class="ledger-flag">{t('paused')}</span> : null}</span>
                  <span class="ledger-line-num"><V>{amt(row.good, c.needed - c.committed)}</V></span>
                </button>
              </li>
            ))}
            {row.claims.length > 7 ? <li class="is-rest"><div class="ledger-line"><span class="ledger-line-name"><b>{t('{n} more projects', { n: row.claims.length - 7 })}</b></span></div></li> : null}
          </ul>
        ) : <p class="ledger-none">{t('No open project is waiting for it.')}</p>}
        {row.starved.length ? (
          <div class="ledger-starved">
            <h4>{t('Running short of it')}</h4>
            <ul class="ledger-lines">
              {row.starved.slice(0, 5).map((c) => (
                <li><button type="button" class="ledger-line is-link" onClick={() => nav.toCard(c.key)}>
                  <span class="ledger-line-name"><b>{tc(c.f.name)}</b><small>{tc(c.region.name)}</small></span>
                  <span class="ledger-line-num"><Icon name="right" size={11} /></span>
                </button></li>
              ))}
            </ul>
          </div>
        ) : null}
        {row.line.capacity !== null ? (
          <p class="ledger-capnote" {...tip(t('Granaries add 2.5M rations of storage a level; every region keeps 400k rations without them. Verified by the referee.'))}>
            {t('Storage capacity')} <V>{amt(row.good, row.line.capacity)}</V> · {t('filled')} <V>{pct(Math.round((row.line.stock / Math.max(1, row.line.capacity)) * 10000))}</V>
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Row({ row, obs, ledger, nav, open, onToggle, flash }: {
  row: GoodRow; obs: Observation; ledger: Ledger; nav: Nav; open: boolean; onToggle: () => void; flash: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (flash) ref.current?.scrollIntoView({ block: 'center' }); }, [flash]);
  const l = row.line;
  const n = ledger.months;
  const roundTip = t('Totals over the last round ({n} months). Verified by the referee.', { n });
  const coverTone = row.status === 'shortage' ? 'is-bad' : row.status === 'tight' ? 'is-warn' : '';
  const coverTip = row.cover === null
    ? t('Nothing was used last round, so there is no cover to measure.')
    : row.good === 'food'
      ? t('Stock ÷ what people and soldiers eat in a month ({use}). Stock is verified; the monthly need is one ration a head.', { use: rations(ledger.foodNeed) })
      : t('Stock ÷ average monthly use last round ({use}/mo). Both verified by the referee.', { use: amt(row.good, row.usePerMonth) });
  return (
    <div class={cx('ledger-row', open && 'is-open', 'is-' + row.status, flash && 'is-flash')} ref={ref} data-good={row.good}>
      <button type="button" class="ledger-row-main" aria-expanded={open} onClick={onToggle} data-testid={`good-${row.good}`}>
        <span class="ledger-cell ledger-cell-name">
          <span class="ledger-good-icon"><GoodIcon good={row.good} size={24} /></span>
          <span class="ledger-good-name"><b>{t(GOOD_SHORT[row.good])}</b>{GOOD_SHORT[row.good] !== GOOD_LABEL[row.good] ? <small>{t(GOOD_LABEL[row.good])}</small> : null}</span>
        </span>
        <span class="ledger-cell ledger-cell-stock">
          <V class="ledger-big" tipText={t('In store now. Verified by the referee.')}>{amt(row.good, l.stock)}</V>
          <small class={coverTone} {...tip(coverTip)}>{row.cover === null ? t('not in use') : t('{n} mo cover', { n: coverText(row.cover) })}</small>
        </span>
        <span class="ledger-cell ledger-cell-bal">
          <span class="ledger-bal-nums">
            <V tipText={t('Made {made} + traded in {inn}.', { made: amt(row.good, l.produced), inn: amt(row.good, l.traded_in) }) + '\n' + roundTip}>{amt(row.good, row.supply)}</V>
            <V tipText={t('Used {used} + traded out {out}.', { used: amt(row.good, l.consumed), out: amt(row.good, l.traded_out) }) + (l.lost ? '\n' + t('Lost besides (spoiled, in carriage, abandoned): {n}.', { n: amt(row.good, l.lost) }) : '') + '\n' + roundTip}>{amt(row.good, row.demand)}</V>
          </span>
          <BalanceBar good={row.good} made={l.produced} tradedIn={l.traded_in} used={l.consumed} tradedOut={l.traded_out}
            tipText={t('Top: supply (made, then traded in). Bottom: demand (used, then traded out). Each row is drawn to its own scale.') + '\n' + roundTip} />
        </span>
        <span class={cx('ledger-cell ledger-cell-net', row.net > 0 ? 'is-up' : row.net < 0 ? 'is-down' : 'is-flat')}
          {...tip(t('Supply − demand − losses over the last round: the change in the store. Verified by the referee.') + (row.runway !== null ? '\n' + t('At this pace the stock lasts about {n} months.', { n: coverText(row.runway) }) : ''))}>
          <Icon name={row.net > 0 ? 'up' : row.net < 0 ? 'down' : 'minus'} size={12} />
          <b>{amtSigned(row.good, row.net)}</b><small>{t('per round')}</small>
        </span>
        <span class="ledger-cell ledger-cell-status"><StatusChip status={row.status} tipText={statusTip(row, obs)} /></span>
        <span class="ledger-cell ledger-cell-more"><Icon name={open ? 'up' : 'down'} size={13} /></span>
      </button>
      {open ? <Breakdown row={row} obs={obs} ledger={ledger} nav={nav} /> : null}
    </div>
  );
}

export function MarketTab({ obs, ledger, nav, focusGood, focusNonce }: { obs: Observation; ledger: Ledger; nav: Nav; focusGood: Good | null; focusNonce: number }) {
  const [sort, setSort] = useState<SortKey>('group');
  const [problems, setProblems] = useState(false);
  const [showIdle, setShowIdle] = useState(false);
  const [open, setOpen] = useState<Set<Good>>(new Set());
  useEffect(() => {
    if (!focusGood) return;
    setOpen((s) => new Set(s).add(focusGood));
    setProblems(false);
    if (!ledger.byGood.get(focusGood)?.active) setShowIdle(true);
  }, [focusGood, focusNonce]);

  const active = ledger.rows.filter((r) => r.active);
  const idle = ledger.rows.filter((r) => !r.active);
  const counts = useMemo(() => {
    const c: Record<Status, number> = { shortage: 0, tight: 0, balanced: 0, surplus: 0, full: 0 };
    for (const r of active) c[r.status] += 1;
    return c;
  }, [ledger]);
  const isProblem = (r: GoodRow) => r.status === 'shortage' || r.status === 'tight';
  let shown = (showIdle ? ledger.rows : active).filter((r) => !problems || isProblem(r));
  const cmp: Record<SortKey, (a: GoodRow, b: GoodRow) => number> = {
    group: () => 0,
    status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.cover ?? 1e9) - (b.cover ?? 1e9),
    cover: (a, b) => (a.cover ?? 1e9) - (b.cover ?? 1e9),
    net: (a, b) => a.net / Math.max(1, a.demand, a.supply) - b.net / Math.max(1, b.demand, b.supply),
    stock: (a, b) => b.line.stock - a.line.stock,
    name: (a, b) => t(GOOD_SHORT[a.good]).localeCompare(t(GOOD_SHORT[b.good])),
  };
  if (sort !== 'group') shown = [...shown].sort(cmp[sort]);
  const groups = sort === 'group'
    ? GROUPS.map((g) => ({ ...g, rows: shown.filter((r) => r.group === g.key) })).filter((g) => g.rows.length)
    : [{ key: 'all', label: '', hint: '', rows: shown }];
  const toggle = (g: Good) => setOpen((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  return (
    <div class="ledger-market" data-testid="ledger-market">
      <div class="ledger-toolbar">
        <div class="ledger-counts">
          {(['shortage', 'tight', 'full', 'balanced', 'surplus'] as Status[]).map((s) => (
            <span class={cx('ledger-count', 'is-' + s, counts[s] === 0 && 'is-zero')} {...tip(t(RULE))}><b>{counts[s]}</b> {t(STATUS_LABEL[s])}</span>
          ))}
        </div>
        <span class="spacer" />
        <label class="ledger-check" {...tip(t('Show only goods in shortage or running tight.'))}>
          <input type="checkbox" checked={problems} data-testid="market-problems" onChange={(e) => setProblems((e.target as HTMLInputElement).checked)} /> {t('Problems only')}
        </label>
        <label class="ledger-sort">{t('Sort')}
          <Select<SortKey> value={sort} label={t('Sort goods')} testid="market-sort" onChange={setSort} options={[
            { value: 'group', label: t('By kind') }, { value: 'status', label: t('Worst first') }, { value: 'cover', label: t('Least cover') },
            { value: 'net', label: t('Net balance') }, { value: 'stock', label: t('Largest stock') }, { value: 'name', label: t('Name') },
          ]} />
        </label>
      </div>
      <div class="ledger-table" role="table" aria-label={t('Goods')}>
        <div class="ledger-thead" role="row">
          <span>{t('Good')}</span>
          <span class="num" {...tip(t('In store now, and how many months that lasts at last round’s use.'))}>{t('In store')}</span>
          <span {...tip(t('Totals over the last round of {n} months, verified by the referee.', { n: ledger.months }))}>
            {t('Supply against demand, last round')}
            <span class="ledger-keys"><i class="ledger-key is-supply" />{t('made')}<i class="ledger-key is-supply is-trade" />{t('traded in')}<i class="ledger-key is-demand" />{t('consumed')}<i class="ledger-key is-demand is-trade" />{t('traded out')}</span>
          </span>
          <span class="num">{t('Net')}</span>
          <span>{t('Standing')}</span>
          <span />
        </div>
        {groups.map((g) => (
          <div class="ledger-group">
            {g.label ? <h3 class="ledger-group-head" {...tip(t(g.hint))}><span>{t(g.label)}</span><small>{t('{n} goods', { n: g.rows.length })}</small></h3> : null}
            {g.rows.map((r) => <Row key={r.good} row={r} obs={obs} ledger={ledger} nav={nav} open={open.has(r.good)} onToggle={() => toggle(r.good)} flash={focusGood === r.good} />)}
          </div>
        ))}
        {shown.length === 0 ? (
          <p class="ledger-empty"><Glyph name="Food" size={18} /> {problems ? t('No good is short or running tight.') : t('Nothing is held or traded yet.')}</p>
        ) : null}
      </div>
      {idle.length && !problems ? (
        <button type="button" class="more-btn ledger-more" aria-expanded={showIdle} onClick={() => setShowIdle(!showIdle)}>
          <Icon name={showIdle ? 'up' : 'down'} size={12} /> {showIdle ? t('Hide {n} goods we neither hold nor make', { n: idle.length }) : t('Show {n} goods we neither hold nor make', { n: idle.length })}
        </button>
      ) : null}
    </div>
  );
}
