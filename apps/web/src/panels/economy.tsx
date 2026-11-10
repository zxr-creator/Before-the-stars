// Economy: stores and flows, how labour is spent, standing policy, works by
// region, power and research capacity.
import { useState } from 'preact/hooks';
import type { LaborSummary, Observation, RegionView } from '../protocol';
import { GOOD_LABEL, GOOD_SHORT, LABOR_LABEL, RESEARCH_LABEL, int, milli, milliSigned, pct } from '../format';
import { Icon } from '../icons';
import { ActionNote, Btn, Empty, Meter, RegionLink, Section, Stepper, cx, toneOfBp } from '../ui';
import { act, openPanel, useApp } from '../store';

export const LABOR_PARTS: { key: keyof LaborSummary; label: string; cls: string }[] = [
  { key: 'food', label: 'Food', cls: 'lab-food' },
  { key: 'facilities', label: 'Works', cls: 'lab-fac' },
  { key: 'projects', label: 'Projects', cls: 'lab-proj' },
  { key: 'household', label: 'Household', cls: 'lab-house' },
  { key: 'students', label: 'Students', cls: 'lab-stud' },
  { key: 'teachers', label: 'Teachers', cls: 'lab-teach' },
  { key: 'soldiers', label: 'Soldiers', cls: 'lab-sold' },
];

export function LaborBar({ labor }: { labor: LaborSummary }) {
  const parts = LABOR_PARTS.map((p) => ({ ...p, n: labor[p.key] as number }));
  const sum = parts.reduce((a, p) => a + p.n, 0);
  const total = Math.max(1, labor.working_age, sum);
  if (sum === 0) return <Empty>Labour is tallied at the end of each round; no record yet.</Empty>;
  return (
    <div class="labor">
      <div class="labor-bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
        {parts.filter((p) => p.n > 0).map((p) => (
          <span class={cx('labor-seg', p.cls)} style={{ width: ((p.n / total) * 100).toFixed(2) + '%' }} title={`${p.label}: ${int(p.n)} people`} />
        ))}
      </div>
      <ul class="labor-legend">
        {parts.map((p) => (
          <li class={p.n === 0 ? 'is-zero' : undefined}><i class={cx('key', p.cls)} /> {p.label} <b>{int(p.n)}</b></li>
        ))}
      </ul>
      <p class="muted small">{int(labor.working_age)} people of working age, as counted last month.</p>
    </div>
  );
}

export function EconomyPanel() {
  const s = useApp();
  const obs = s.obs!;
  const civ = obs.civ;
  const [showIdle, setShowIdle] = useState(false);
  const core = new Set(['food', 'materials', 'tools']);
  const active = civ.goods.filter((g) => core.has(g.good) || g.stock || g.produced || g.consumed || g.traded_in || g.traded_out);
  const idle = civ.goods.filter((g) => !active.includes(g));
  const ownRegions = obs.regions.filter((r) => r.own);
  const power = ownRegions.reduce((a, r) => {
    const p = r.own!.power;
    return {
      shaft_supply: a.shaft_supply + p.shaft_supply, shaft_demand: a.shaft_demand + p.shaft_demand,
      elec_supply: a.elec_supply + p.elec_supply, elec_demand: a.elec_demand + p.elec_demand,
      compute_supply: a.compute_supply + p.compute_supply, compute_demand: a.compute_demand + p.compute_demand,
    };
  }, { shaft_supply: 0, shaft_demand: 0, elec_supply: 0, elec_demand: 0, compute_supply: 0, compute_demand: 0 });
  const powerLines = [
    { label: 'Shaft power', supply: power.shaft_supply, demand: power.shaft_demand },
    { label: 'Electricity', supply: power.elec_supply, demand: power.elec_demand },
    { label: 'Computation', supply: power.compute_supply, demand: power.compute_demand },
  ].filter((l) => l.supply || l.demand);
  const food = civ.goods.find((g) => g.good === 'food');
  const perMonth = food && food.consumed > 0 ? food.consumed / obs.months_per_round : 0;
  const monthsInStore = food && perMonth > 0 ? food.stock / perMonth : null;
  const weights = civ.policies.labor_weights;

  return (
    <div class="panel economy">
      <p class="panel-lede">Which missing input, post or service is holding useful output back?</p>

      <Section title="Stores and flows" aside={<small class="muted">units · totals over last round</small>}>
        <table class="table goods-table" data-testid="goods-table">
          <thead>
            <tr><th>Good</th><th class="num">In store</th><th class="num">Made</th><th class="num">Used</th><th class="num">Traded</th><th class="num">Net</th></tr>
          </thead>
          <tbody>
            {active.map((g) => {
              const traded = g.traded_in - g.traded_out;
              const net = g.produced - g.consumed + traded;
              return (
                <tr>
                  <th scope="row">{GOOD_LABEL[g.good]}{g.capacity !== null ? <small class="muted cap" title="Storage capacity"> cap. {milli(g.capacity)}</small> : null}</th>
                  <td class="num"><b>{milli(g.stock)}</b></td>
                  <td class="num">{milli(g.produced)}</td>
                  <td class="num">{milli(g.consumed)}</td>
                  <td class="num">{traded === 0 ? <span class="muted">–</span> : milliSigned(traded)}</td>
                  <td class={cx('num', net < 0 ? 'neg' : net > 0 ? 'pos' : 'muted')}>{net === 0 ? '0' : <>{net < 0 ? <Icon name="down" size={10} /> : <Icon name="up" size={10} />}{milliSigned(net)}</>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {monthsInStore !== null ? (
          <p class={cx('note', monthsInStore < 2 && 'is-bad', monthsInStore >= 2 && monthsInStore < civ.policies.food_reserve_months && 'is-warn')}>
            Food in store covers about <b>{monthsInStore.toFixed(1)} months</b> at last round’s consumption; the reserve target is {civ.policies.food_reserve_months} months.
          </p>
        ) : null}
        {idle.length ? (
          <button type="button" class="more-btn" aria-expanded={showIdle} onClick={() => setShowIdle(!showIdle)}>
            <Icon name={showIdle ? 'up' : 'down'} size={12} /> {showIdle ? 'Hide' : 'Show'} {idle.length} goods we neither hold nor make
          </button>
        ) : null}
        {showIdle ? <p class="muted small">{idle.map((g) => GOOD_LABEL[g.good]).join(' · ')}</p> : null}
      </Section>

      <Section title="Labour last month">
        <LaborBar labor={civ.labor} />
      </Section>

      <Section title="Standing policy" aside={<small class="muted">applies from the next month resolved</small>}>
        <div class="policy-grid">
          <p class="sub-label">Labour priorities <small class="muted">relative weight 0–10; higher is staffed first</small></p>
          {weights.map(([cat, w]) => (
            <div class="policy-row">
              <span class="policy-name">{LABOR_LABEL[cat]}</span>
              <Meter value={w} max={10} tone="accent" height={6} label={`${LABOR_LABEL[cat]} weight ${w} of 10`} />
              <Stepper value={w} min={0} max={10} label={`${LABOR_LABEL[cat]} weight`} testid={`weight-${cat}`} disabled={s.busy}
                onChange={(v) => void act({ kind: 'set_policy', setting: { kind: 'labor_weight', category: cat, weight: v } }, 'policy', { quiet: true })} />
            </div>
          ))}
          <div class="policy-row">
            <span class="policy-name">Food reserve target <small class="muted">labour stays on food until this many months are stored</small></span>
            <span />
            <Stepper value={civ.policies.food_reserve_months} min={0} max={36} unit="mo" label="Food reserve months" testid="food-reserve" disabled={s.busy}
              onChange={(v) => void act({ kind: 'set_policy', setting: { kind: 'food_reserve_months', months: v } }, 'policy', { quiet: true })} />
          </div>
          <div class="policy-row">
            <span class="policy-name">Call-up for projects <small class="muted">share of what the state may direct; the cap is {pct(civ.mobilization_cap_bp)} of non-food labour</small></span>
            <Meter value={civ.policies.mobilization_bp} max={10000} tone="accent" height={6} label={`Call-up ${pct(civ.policies.mobilization_bp)}`} />
            <Stepper value={Math.round(civ.policies.mobilization_bp / 100)} min={0} max={100} step={10} unit="%" label="Call-up share" testid="mobilization" disabled={s.busy}
              onChange={(v) => void act({ kind: 'set_policy', setting: { kind: 'mobilization', bp: v * 100 } }, 'policy', { quiet: true })} />
          </div>
        </div>
        <ActionNote tag="policy" />
      </Section>

      <Section title="Works by region" aside={<Btn small icon="plus" onClick={() => openPanel('projects', { kind: 'build' })}>Build</Btn>}>
        {ownRegions.length === 0 ? <Empty>We govern no region.</Empty> : ownRegions.map((r) => <RegionWorks r={r} open={ownRegions.length <= 3} />)}
      </Section>

      <Section title="Power">
        {powerLines.length === 0 ? <Empty>No shaft, electric or computing capacity has been installed.</Empty> : (
          <ul class="cap-list">
            {powerLines.map((l) => (
              <li>
                <span class="cap-name">{l.label}</span>
                <Meter value={l.demand} max={Math.max(l.supply, l.demand, 1)} tone={l.demand > l.supply ? 'bad' : 'ok'} mark={l.demand > l.supply ? l.supply / l.demand : undefined} label={`${l.label}: demand ${milli(l.demand)} of supply ${milli(l.supply)}`} />
                <span class={cx('cap-val', l.demand > l.supply && 'neg')}>{milli(l.demand)} <small>demand</small> / {milli(l.supply)} <small>supply</small></span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Research capacity" aside={<small class="muted">work units per month</small>}>
        {civ.research.length === 0 ? <Empty>No one is yet free to investigate. Research staff come from qualified people working in a makers’ circle or institute.</Empty> : (
          <ul class="cap-list">
            {civ.research.map((l) => (
              <li>
                <span class="cap-name">{RESEARCH_LABEL[l.class]}</span>
                <Meter value={l.used} max={Math.max(l.capacity, 1)} tone={l.used === 0 && l.capacity > 0 ? 'warn' : 'accent'} label={`${RESEARCH_LABEL[l.class]}: ${milli(l.used)} used of ${milli(l.capacity)}`} />
                <span class="cap-val">{milli(l.used)} <small>used</small> / {milli(l.capacity)}</span>
              </li>
            ))}
          </ul>
        )}
        {civ.research.some((l) => l.capacity > 0 && l.used === 0) ? <p class="note is-warn">Investigators have spare time. <button type="button" class="linklike" onClick={() => openPanel('knowledge', { kind: 'knowledge-view', view: 'frontier' })}>Open the frontier</button></p> : null}
      </Section>
    </div>
  );
}

function RegionWorks({ r, open }: { r: RegionView; open: boolean }) {
  const [isOpen, setOpen] = useState(open);
  const own = r.own!;
  const blocked = own.facilities.filter((f) => f.enabled && f.runs.some((x) => x.blockers.length)).length;
  return (
    <div class="region-works">
      <div class="rw-head">
        <button type="button" class="rw-toggle" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
          <Icon name={isOpen ? 'down' : 'right'} size={12} /> <b>{r.name}</b>
        </button>
        <span class="muted small">{int(own.population)} people · {own.facilities.length} works{blocked ? <span class="warn-text"> · {blocked} held back</span> : null}</span>
        <RegionLink id={r.id}>map</RegionLink>
      </div>
      {isOpen ? (
        own.facilities.length ? (
          <table class="table works-table">
            <thead><tr><th>Works</th><th class="num">Level</th><th class="num">Staff</th><th>Utilisation</th></tr></thead>
            <tbody>
              {own.facilities.map((f) => {
                const blockers = Array.from(new Set(f.runs.flatMap((x) => x.blockers)));
                const missing = Array.from(new Set(f.runs.flatMap((x) => x.missing ?? [])));
                return (
                  <>
                    <tr class={!f.enabled ? 'is-off' : undefined}>
                      <th scope="row">{f.name}{!f.enabled ? <small class="muted"> (idle)</small> : null}</th>
                      <td class="num">{f.level}<small class="muted">/{f.max_level}</small></td>
                      <td class="num">{f.staff_needed ? <>{int(f.staffed)}<small class="muted">/{int(f.staff_needed)}</small></> : <span class="muted">–</span>}</td>
                      <td class="util-cell"><Meter value={f.utilization_bp} max={10000} tone={f.enabled ? toneOfBp(f.utilization_bp, 8000, 4000) : 'muted'} height={6} label={`Utilisation ${pct(f.utilization_bp)}`} /> <small>{pct(f.utilization_bp)}</small></td>
                    </tr>
                    {blockers.length || missing.length ? <tr class="blocker-row"><td colSpan={4}>{blockers.slice(0, 3).map((b) => <span class="blocker"><Icon name="warn" size={11} /> {b}</span>)}{missing.length ? <span class="blocker">Short of {missing.map((g) => GOOD_SHORT[g].toLowerCase()).join(', ')}</span> : null}</td></tr> : null}
                  </>
                );
              })}
            </tbody>
          </table>
        ) : <p class="empty">Nothing built here yet.</p>
      ) : null}
    </div>
  );
}
