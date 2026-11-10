// Balance sheet: one page for the round. Food security, the largest surpluses
// and deficits, goods tied up in projects, trade by partner, research capacity
// and a ranked list of findings.
import type { ComponentChildren } from 'preact';
import type { Good, Observation, SeatId } from '../protocol';
import { GOOD_SHORT, RESEARCH_LABEL, computeQty, pct, rations, researchMonths } from '../format';
import { t, tc } from '../i18n';
import { Icon } from '../icons';
import { GoodIcon } from '../theme/goods';
import { cx } from '../ui';
import { civName } from '../store';
import type { GoodRow, Ledger } from './model';
import type { Finding } from './findings';
import { Bar, E, Glyph, StatusChip, V, amt, amtSigned, coverText, perMo, tip } from './parts';
import type { Nav } from './Ledger';

function Panel({ title, aside, children, class: cls }: { title: string; aside?: ComponentChildren; children?: ComponentChildren; class?: string }) {
  return (
    <section class={cx('ledger-panel', cls)}>
      <header class="ledger-panel-head"><h3>{title}</h3>{aside ? <span class="ledger-panel-aside">{aside}</span> : null}</header>
      {children}
    </section>
  );
}

function NetRow({ r, max, nav }: { r: GoodRow; max: number; nav: Nav }) {
  const share = Math.abs(r.net) / Math.max(1, max);
  return (
    <li>
      <button type="button" class="ledger-net-row" onClick={() => nav.toGood(r.good)}
        {...tip(t('Supply {s}, demand {d} over the last round. Verified by the referee.', { s: amt(r.good, r.supply), d: amt(r.good, r.demand) }) + (r.runway !== null ? '\n' + t('At this pace the stock lasts about {n} months.', { n: coverText(r.runway) }) : ''))}>
        <span class="ledger-net-name"><GoodIcon good={r.good} size={16} />{t(GOOD_SHORT[r.good])}</span>
        <span class="ledger-net-bar"><i class={r.net < 0 ? 'is-neg' : 'is-pos'} style={{ width: Math.max(2, share * 100).toFixed(1) + '%' }} /></span>
        <span class={cx('ledger-net-num', r.net < 0 ? 'neg' : 'pos')}>{amtSigned(r.good, r.net)}</span>
        <span class="ledger-net-cover">{r.net < 0 && r.runway !== null ? t('{n} mo left', { n: coverText(r.runway) }) : r.cover !== null ? t('{n} mo cover', { n: coverText(r.cover) }) : ''}</span>
      </button>
    </li>
  );
}

export function BalanceTab({ obs, ledger, nav, findings }: { obs: Observation; ledger: Ledger; nav: Nav; findings: Finding[] }) {
  const civ = obs.civ;
  const n = ledger.months;
  const food = ledger.byGood.get('food');
  const active = ledger.rows.filter((r) => r.active && r.good !== 'food');
  // rank by the size of the gap relative to the good's own turnover, so bulky goods do not drown the rest
  const rel = (r: GoodRow) => r.net / Math.max(1, r.supply, r.demand);
  const surpluses = active.filter((r) => r.net >= 1000).sort((a, b) => rel(b) - rel(a)).slice(0, 5);
  const deficits = active.filter((r) => r.net <= -1000).sort((a, b) => (a.runway ?? 1e9) - (b.runway ?? 1e9)).slice(0, 5);

  // goods in projects
  const tied = new Map<Good, { committed: number; owed: number }>();
  for (const p of obs.projects) {
    for (const need of p.inputs_needed) {
      const c = p.inputs_committed.find((x) => x.good === need.good)?.amount ?? 0;
      const e = tied.get(need.good) ?? { committed: 0, owed: 0 };
      e.committed += Math.min(c, need.amount);
      e.owed += Math.max(0, need.amount - c);
      tied.set(need.good, e);
    }
  }
  const tiedRows = [...tied].sort((a, b) => b[1].committed + b[1].owed - (a[1].committed + a[1].owed));
  const tiedMax = Math.max(1, ...tiedRows.map(([, e]) => e.committed + e.owed));

  // trade by partner
  const partners = new Map<SeatId, { in: { good: Good; amt: number }[]; out: { good: Good; amt: number }[] }>();
  for (const tr of obs.diplomacy.treaties) {
    if (tr.status !== 'active') continue;
    const other = tr.parties[0] === obs.seat ? tr.parties[1] : tr.parties[0];
    for (const cl of tr.clauses) {
      if (cl.kind !== 'goods') continue;
      const e = partners.get(other) ?? { in: [], out: [] };
      (cl.from === obs.seat ? e.out : e.in).push({ good: cl.good, amt: cl.amount_per_month });
      partners.set(other, e);
    }
  }
  const tradedIn = ledger.rows.filter((r) => r.line.traded_in > 0);
  const tradedOut = ledger.rows.filter((r) => r.line.traded_out > 0);

  const foodFill = food && food.line.capacity ? food.line.stock / food.line.capacity : null;
  const target = civ.policies.food_reserve_months;
  const cover = ledger.foodCover;
  const roundTip = t('Total over the last round ({n} months). Verified by the referee.', { n });

  return (
    <div class="ledger-balance" data-testid="ledger-balance">
      <div class="ledger-bs-col">
      <Panel title={t('Food security')} class="ledger-bs-food" aside={food ? <StatusChip status={food.status} /> : null}>
        {food ? (
          <>
            <div class="ledger-kpis">
              <div class="ledger-kpi" {...tip(t('Food in store now, in rations. One ration (50 kg grain-equivalent) feeds one person for a month. Verified by the referee.'))}>
                <small>{t('In store')}</small><b>{rations(food.line.stock)}</b>
              </div>
              <div class={cx('ledger-kpi', cover !== null && cover < 2 && 'is-bad', cover !== null && cover >= 2 && cover < target && 'is-warn')}
                {...tip(t('Stock ÷ what people and soldiers eat in a month ({use}). The reserve target is {target} months.', { use: rations(ledger.foodNeed), target }))}>
                <small>{t('Months of cover')}</small><b>{coverText(cover)}</b>
              </div>
              <div class={cx('ledger-kpi', civ.food_fulfillment_bp < 10000 && 'is-bad')} {...tip(t('Share of last month’s food need that was actually met. Verified by the referee.'))}>
                <small>{t('Food access')}</small><b>{pct(civ.food_fulfillment_bp)}</b>
              </div>
              <div class="ledger-kpi" {...tip(t('Harvest minus food eaten, spoiled and lost.') + '\n' + roundTip)}>
                <small>{t('Net last round')}</small><b class={food.net < 0 ? 'neg' : 'pos'}>{amtSigned('food', food.net)}</b>
              </div>
            </div>
            {food.line.capacity !== null ? (
              <div class="ledger-store" {...tip(t('Storage holds {cap}; anything above it spoils at 12% a month. The tick marks the {target}-month reserve target ({need}).', { cap: rations(food.line.capacity), target, need: rations(ledger.foodNeed * target) }) + '\n' + t('Verified by the referee.'))}>
                <span class="ledger-store-label">{t('Storage')}</span>
                <Bar parts={[{ value: Math.min(food.line.stock, food.line.capacity), cls: (foodFill ?? 0) >= 0.97 ? 'is-warn' : 'is-ok' }]} max={Math.max(food.line.capacity, 1)}
                  mark={ledger.foodNeed * target <= food.line.capacity ? ledger.foodNeed * target : undefined} height={10} />
                <span class="ledger-store-num"><b>{rations(food.line.stock)}</b> / {rations(food.line.capacity)}</span>
              </div>
            ) : null}
            <p class="ledger-bs-note">
              {food.line.lost !== undefined
                ? t('Made {made}, eaten {used} and lost {lost} (spoiled, abandoned) last round.', { made: rations(food.line.produced), used: rations(food.line.consumed), lost: rations(food.line.lost) })
                : t('Made {made}, eaten and spoiled {used} last round.', { made: rations(food.line.produced), used: rations(food.line.consumed) })}{' '}
              {ledger.foodNeed * target > (food.line.capacity ?? Infinity) ? <span class="warn-text">{t('The {target}-month reserve ({need}) is more than storage can hold.', { target, need: rations(ledger.foodNeed * target) })}</span> : null}
            </p>
          </>
        ) : null}
      </Panel>

      <Panel title={t('Largest surpluses')} class="ledger-bs-net" aside={<small {...tip(roundTip)}>{t('net, last round')}</small>}>
        {surpluses.length ? <ul class="ledger-net">{surpluses.map((r) => <NetRow r={r} max={Math.max(r.supply, r.demand)} nav={nav} />)}</ul> : <p class="ledger-none">{t('Nothing was made faster than it was used.')}</p>}
        <p class="ledger-bs-note">{t('Bars show the gap as a share of each good’s own turnover.')}</p>
      </Panel>
      <Panel title={t('Largest shortfalls')} class="ledger-bs-net" aside={<small {...tip(roundTip)}>{t('net, last round')}</small>}>
        {deficits.length ? <ul class="ledger-net">{deficits.map((r) => <NetRow r={r} max={Math.max(r.supply, r.demand)} nav={nav} />)}</ul> : <p class="ledger-none">{t('Nothing was used faster than it was made.')}</p>}
        <p class="ledger-bs-note">{t('Most urgent first: the stock that would run out soonest.')}</p>
      </Panel>

      </div>
      <div class="ledger-bs-col">
      <Panel title={t('Findings')} class="ledger-bs-findings" aside={<small>{t('ranked by severity')}</small>}>
        <ol class="ledger-findings">
          {findings.map((f) => (
            <li class={'is-' + f.sev}>
              <span class="ledger-finding-mark"><Icon name={f.sev === 'bad' ? 'danger' : f.sev === 'warn' ? 'warn' : f.sev === 'ok' ? 'good' : 'info'} size={13} /></span>
              <span class="ledger-finding-text">{f.text}</span>
              {f.go ? <button type="button" class="ledger-step" onClick={f.go}>{f.label} <Icon name="right" size={9} /></button> : null}
            </li>
          ))}
        </ol>
      </Panel>

      <div class="ledger-bs-pair">
      <Panel title={t('Tied up in open projects')} class="ledger-bs-tied" aside={<small>{t('{n} projects', { n: obs.projects.length })}</small>}>
        {tiedRows.length ? (
          <ul class="ledger-tied">
            {tiedRows.slice(0, 8).map(([g, e]) => (
              <li {...tip(t('{good}: {done} already taken from the store for projects, {owed} still to be supplied. One-off amounts from the project list.', { good: t(GOOD_SHORT[g]), done: amt(g, e.committed), owed: amt(g, e.owed) }))}>
                <span class="ledger-net-name"><GoodIcon good={g} size={16} />{t(GOOD_SHORT[g])}</span>
                <Bar parts={[{ value: e.committed, cls: 'is-supply' }, { value: e.owed, cls: 'is-owed' }]} max={tiedMax} height={8} />
                <span class="ledger-tied-num"><b>{amt(g, e.committed)}</b>{e.owed > 0 ? <span class="neg"> +{amt(g, e.owed)}</span> : null}</span>
              </li>
            ))}
          </ul>
        ) : <p class="ledger-none">{t('No open project holds or awaits goods.')}</p>}
        {tiedRows.length ? <p class="ledger-bs-note"><i class="ledger-key is-supply" />{t('committed')} <i class="ledger-key is-owed" />{t('still owed')}</p> : null}
      </Panel>

      <Panel title={t('Research capacity')} class="ledger-bs-research" aside={<small>{t('researcher-months per month')}</small>}>
        {civ.research.length ? (
          <ul class="ledger-research">
            {civ.research.map((l) => (
              <li {...tip(t('{cls}: {used} of {cap} a month was spent on investigations. Verified by the referee.', { cls: t(RESEARCH_LABEL[l.class]), used: researchMonths(l.used), cap: researchMonths(l.capacity) }))}>
                <span class="ledger-research-name">{t(RESEARCH_LABEL[l.class])}</span>
                <Bar parts={[{ value: l.used, cls: 'is-supply' }]} max={Math.max(1, l.capacity)} height={8} />
                <span class="ledger-tied-num"><b>{researchMonths(l.used)}</b> / {researchMonths(l.capacity)}</span>
                {l.capacity > 0 && l.used === 0 ? <span class="ledger-flag is-warn">{t('unused')}</span> : <span />}
              </li>
            ))}
          </ul>
        ) : <p class="ledger-none">{t('No one is yet free to investigate.')}</p>}
        {ledger.compute.supply || ledger.compute.demand ? (
          <p class="ledger-bs-note" {...tip(t('Computing is pooled across the realm. Verified by the referee.'))}>
            <Glyph name="compute" size={13} /> {t('Computing: {d} called for, {s} delivered.', { d: computeQty(ledger.compute.demand), s: computeQty(ledger.compute.supply) })}
          </p>
        ) : null}
      </Panel>

      </div>
      <Panel title={t('Trade by partner')} class="ledger-bs-trade" aside={<small {...tip(roundTip)}>{t('carried last round')}: <V>{t('{n} goods', { n: tradedIn.length })}</V> {t('in')} · <V>{t('{n} goods', { n: tradedOut.length })}</V> {t('out')}</small>}>
        {partners.size ? (
          <ul class="ledger-partners">
            {[...partners].map(([seat, e]) => (
              <li>
                <button type="button" class="linklike" onClick={() => nav.open('diplomacy', { kind: 'counterpart', seat })}>{tc(civName(obs, seat))}</button>
                <span class="ledger-partner-flows" {...tip(t('Monthly amounts written in treaties now in force.'))}>
                  <small class="muted">{t('signed')}</small>
                  {e.in.map((x) => <span class="ledger-qty is-in"><Icon name="down" size={10} /><GoodIcon good={x.good} size={14} /><b>{perMo(x.amt, x.good)}</b></span>)}
                  {e.out.map((x) => <span class="ledger-qty is-outflow"><Icon name="up" size={10} /><GoodIcon good={x.good} size={14} /><b>{perMo(x.amt, x.good)}</b></span>)}
                </span>
              </li>
            ))}
          </ul>
        ) : <p class="ledger-none">{t('No treaty in force carries goods.')}</p>}
        {tradedIn.length || tradedOut.length ? (
          <p class="ledger-bs-note ledger-carried" {...tip(roundTip)}>
            <span>{t('Carried last round')}</span>
            {tradedIn.map((r) => <span class="ledger-qty is-in"><Icon name="down" size={10} /><GoodIcon good={r.good} size={14} /><b>{amt(r.good, r.line.traded_in)}</b></span>)}
            {tradedOut.map((r) => <span class="ledger-qty is-outflow"><Icon name="up" size={10} /><GoodIcon good={r.good} size={14} /><b>{amt(r.good, r.line.traded_out)}</b></span>)}
          </p>
        ) : null}
      </Panel>

      </div>

      <p class="ledger-footnote ledger-bs-foot">
        <V>{t('Plain figures')}</V> {t('are the referee’s verified totals for the last round of {n} months.', { n })}{' '}
        <E>{t('dotted figures')}</E> {t('are this ledger’s estimates from recipes × level × last month’s rate.')}
      </p>
    </div>
  );
}
