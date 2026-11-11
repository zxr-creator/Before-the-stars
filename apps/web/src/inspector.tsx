// Context inspector for the selected region. Everything shown comes from the
// seat's own RegionView; what has not been observed is stated as missing.
import { useState } from 'preact/hooks';
import type { FacilityView, Observation, OwnRegion, RegionView, SurveyView } from './protocol';
import {
  BONUS_LABEL, CLIMATE_LABEL, DEPOSIT_LABEL, GOOD_SHORT, QUAL_LABEL, SETTLEMENT_LABEL, TERRAIN_LABEL, VIS_LABEL, computeQty, energy, fmtDate, int, joinList,
  lc, pct, people, peopleNum, range, rations, tcAll, tonnes, tx,
} from './format';
import type { DepositView, Good, OutbreakView } from './protocol';
import { GoodIcon } from './theme/goods';
import { ProductivityMini } from './economy/Productivity';
import { t, tc, useLocale } from './i18n';
import { Icon } from './icons';
import { ActionNote, Badge, Btn, EpistemicTag, Est, KV, Meter, SeatDot, Section, cx, toneOfBp } from './ui';
import { act, civColor, civName, openPanel, selectRegion, useApp } from './store';
import { openWorks } from './economy/Construction';

/** Standing order of a formation, as sent on the wire. */
const ORDER_LABEL: Record<string, string> = { hold: 'hold', move: 'move', attack: 'attack' };

export function Inspector() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const r = obs.regions.find((x) => x.id === s.selectedRegion);
  if (!r) return null;
  const mine = r.own !== null;
  const occupied = r.controller !== null && r.owner !== null && r.controller !== r.owner;
  const armiesHere = obs.armies.filter((a) => a.region === r.id);
  const foreignHere = obs.foreign_armies.filter((a) => a.region === r.id);
  const surveyRunning = obs.projects.some((p) => p.kind === 'survey' && p.region === r.id);
  const adjacentOwn = r.neighbors.some((n) => obs.regions.find((x) => x.id === n.region)?.own);

  return (
    <aside class="inspector" aria-label={t('Region: {name}', { name: r.name })} data-testid="inspector">
      <header class="inspector-head">
        <div>
          <p class="eyebrow">{t(TERRAIN_LABEL[r.terrain])}{r.climate ? ' · ' + t(CLIMATE_LABEL[r.climate]) : ''}{r.coastal ? t(' · coast') : ''}{r.river ? t(' · river') : ''}</p>
          <h2 data-testid="inspector-name">{r.name}</h2>
        </div>
        <Btn kind="ghost" small icon="close" title={t('Close (Esc)')} onClick={() => selectRegion(null)} />
      </header>
      <div class="inspector-body">
        <dl class="kvs">
          <KV k={t('Settlement')}>{t(SETTLEMENT_LABEL[r.settlement])}{obs.civ.capital === r.id ? ' ' : null}{obs.civ.capital === r.id ? <Badge tone="gold" icon="star">{t('Capital')}</Badge> : null}</KV>
          {r.city ? (
            <KV k={t('Principal city')} title={t('Where the region’s principal city stands; a natural harbour makes a port cheaper to work.')}>
              <span data-testid="inspector-city">{tc(r.city.name)}</span>
              {r.city.natural_harbour ? <>{' '}<Badge tone="muted" icon="compass" title={t('A sheltered anchorage on the coast')}>{t('Natural harbour')}</Badge></> : null}
            </KV>
          ) : null}
          <KV k={t('Held by')}>
            {r.owner === null ? <span class="muted">{t('No one, as far as we know')}</span> : <><SeatDot color={civColor(obs, r.owner)} /> {tc(civName(obs, r.owner))}</>}
          </KV>
          {occupied ? <KV k={t('Occupied by')}><SeatDot color={civColor(obs, r.controller)} /> {tc(civName(obs, r.controller))} {' '}<Badge tone="bad" icon="warn">{t('Contested')}</Badge></KV> : null}
          <KV k={t('Our knowledge')}>
            {r.visibility === 'remembered'
              ? <Est kind="reported" title={t('This is a remembered record, not a current observation')}>{t('Remembered · last seen {date}', { date: fmtDate(r.last_seen) })}</Est>
              : <>{t(VIS_LABEL[r.visibility])} <small class="muted">{t('as of {date}', { date: fmtDate(r.last_seen) })}</small></>}
          </KV>
          {r.test_node ? <KV k={t('Deployment')}><Badge tone="accent" icon="objectives">{t('Jump test node')}</Badge></KV> : null}
        </dl>

        {r.outbreak ? <OutbreakNote o={r.outbreak} /> : null}

        {mine ? <OwnDetails obs={obs} r={r} own={r.own!} /> : <ForeignDetails obs={obs} r={r} />}

        {armiesHere.length || foreignHere.length ? (
          <Section title={t('Forces here')}>
            <ul class="plain-list">
              {armiesHere.map((a) => (
                <li>{tx('{name} — {n} soldiers, order: {order}', {
                  name: <button type="button" class="linklike" onClick={() => openPanel('military')}>{tc(a.name)}</button>,
                  n: peopleNum(a.soldiers.reduce((n, x) => n + x[1], 0)),
                  order: a.order in ORDER_LABEL ? t(ORDER_LABEL[a.order]) : a.order,
                })}</li>
              ))}
              {foreignHere.map((a) => (
                <li><SeatDot color={civColor(obs, a.owner)} /> {tx('{civ} force, {strength} {seen}', {
                  civ: tc(civName(obs, a.owner)),
                  strength: <Est>{t('{range} soldiers', { range: range(a.strength_low, a.strength_high) })}</Est>,
                  seen: <small class="muted">{t('seen {date}', { date: fmtDate(a.observed_month) })}</small>,
                })}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        <SurveyBlock survey={r.survey} />

        <Section title={t('Orders')}>
          <div class="quick-actions">
            {mine ? (
              <>
                <Btn small icon="hammer" testid="qa-build" onClick={() => openPanel('projects', { kind: 'build', region: r.id })}>{t('Build here')}</Btn>
                <Btn small nav icon="layers" testid="qa-works" onClick={() => openWorks(r.id)}>{t('Regional works')}</Btn>
                <Btn small icon="people" testid="qa-program" onClick={() => openPanel('people', { kind: 'program', region: r.id })}>{t('Open programme')}</Btn>
                <Btn small icon="flag" testid="qa-settle-from" onClick={() => openPanel('projects', { kind: 'settle', from: r.id })}>{t('Settle from here')}</Btn>
                <Btn small icon="military" testid="qa-recruit" onClick={() => openPanel('military', { kind: 'recruit', region: r.id })}>{t('Recruit here')}</Btn>
              </>
            ) : null}
            {!(r.survey?.detailed && mine) ? (
              <Btn small icon="eye" testid="qa-survey" why={surveyRunning ? t('A survey party is already assigned here') : null}
                onClick={() => void act({ kind: 'start_project', spec: { kind: 'survey', region: r.id }, priority: null }, 'inspector')}>
                {r.survey?.detailed ? t('Survey again') : r.survey ? t('Survey in detail') : t('Survey')}
              </Btn>
            ) : null}
            {!mine && r.owner === null ? (
              <Btn small icon="flag" testid="qa-settle-to" why={adjacentOwn ? null : t('Settlers need a direct route from a region we govern')}
                onClick={() => openPanel('projects', { kind: 'settle', to: r.id })}>{t('Settle here')}</Btn>
            ) : null}
            {mine && obs.civ.capital !== r.id ? (
              <Btn small kind="ghost" icon="star" onClick={() => void act({ kind: 'set_policy', setting: { kind: 'move_capital', region: r.id } }, 'inspector')}>{t('Make capital')}</Btn>
            ) : null}
          </div>
          {!mine && r.owner === null && !adjacentOwn ? <p class="why"><Icon name="lock" size={12} /> {t('Settling needs a direct route from a governed region.')}</p> : null}
          <ActionNote tag="inspector" />
        </Section>
      </div>
    </aside>
  );
}

function OwnDetails({ obs, r, own }: { obs: Observation; r: RegionView; own: OwnRegion }) {
  const total = Math.max(1, own.population);
  const power = own.power;
  const anyPower = power.shaft_supply || power.shaft_demand || power.elec_supply || power.elec_demand || power.compute_supply || power.compute_demand;
  return (
    <>
      <Section title={t('People')} aside={<b title={t('{n} people', { n: int(own.population) })}>{peopleNum(own.population)} <small class="muted">{t('people')}</small></b>}>
        <AgeBar children={own.children} working={own.working_age} elders={own.elders} />
        {own.occupied_since !== null ? <p class="note is-warn"><Icon name="warn" size={12} /> {t('Under occupation since {date}.', { date: fmtDate(own.occupied_since) })}</p> : null}
        <div class="mini-meters">
          <MiniMeter label={t('Food access')} bp={own.food_fulfillment_bp} />
          <MiniMeter label={t('Water access')} bp={own.water_fulfillment_bp} sub={t('capacity {n} people', { n: peopleNum(own.water_capacity) })} />
          <MiniMeter label={t('Health pressure')} bp={own.health_pressure_bp} invert />
          <MiniMeter label={t('Unrest')} bp={own.unrest_bp} invert />
        </div>
        {own.blocks.length ? (
          <ul class="blocks">
            {own.blocks.map((b) => (
              <li>
                <span class="block-bar" style={{ width: Math.max(4, (b.count / total) * 100) + '%' }} />
                <span class="block-text">{tc(b.lineage)}{b.religion ? <small class="muted"> · {tc(b.religion)}</small> : <small class="muted"> · {t('no religion')}</small>}</span>
                <span class="num">{peopleNum(b.count)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {own.quals.length ? (
          <p class="quals-line">
            {own.quals.filter((q) => q.count > 0).map((q, i) => (
              <span>{i ? ' · ' : ''}<b>{peopleNum(q.count)}</b> {lc(QUAL_LABEL[q.qual])}</span>
            ))}
          </p>
        ) : null}
      </Section>

      {own.productivity?.length ? (
        <Section title={t('Labour productivity')}>
          <ProductivityMini r={r} onOpen={() => openWorks(r.id, 'productivity')} />
        </Section>
      ) : null}

      <Section title={t('Works')} aside={<button type="button" class="linklike" data-testid="inspector-works" onClick={() => openWorks(r.id)}>{t('{n} kinds', { n: own.facilities.length })} · {t('manage')} <Icon name="right" size={10} /></button>}>
        {own.facilities.length ? (
          <ul class="fac-list">
            {own.facilities.map((f) => <FacilityRow regionId={r.id} f={f} />)}
          </ul>
        ) : <p class="empty">{t('Nothing has been built here yet.')}</p>}
        <ActionNote tag={`fac-${r.id}`} />
      </Section>

      {own.venues && own.venues.length ? (
        <Section title={t('Teaching places')}>
          <ul class="cap-list">
            {own.venues.map((v) => {
              const venueName = obs.catalog.facilities.find((f) => f.kind === v.venue)?.name;
              return (
                <li>
                  <span class="cap-name">{venueName ? tc(venueName) : v.venue}</span>
                  <Meter value={v.reserved} max={Math.max(1, v.capacity)} tone="accent" height={6} label={t('{n} of {total} places booked', { n: peopleNum(v.reserved), total: peopleNum(v.capacity) })} />
                  <span class="cap-val">{peopleNum(v.reserved)} <small>{t('booked')}</small> / {peopleNum(v.capacity)}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title={t('Links and power')}>
        <dl class="kvs">
          <KV k={t('Transport')} title={t('Transport grade 0–3 sets how many levels of industry, extraction and power the region’s freight can serve')}>{t('Grade {n} of 3', { n: own.transport_level })}{own.infrastructure ? <small class={own.infrastructure.freight_load > own.infrastructure.freight_capacity ? 'neg' : 'muted'}> · {t('freight {load} of {cap} levels', { load: own.infrastructure.freight_load, cap: own.infrastructure.freight_capacity })}</small> : null}</KV>
          <KV k={t('Link efficiency')} title={t('Share of goods that arrive when moved to or from the capital network')}>{pct(own.link_efficiency_bp)}</KV>
          {anyPower ? (
            <>
              {power.shaft_supply || power.shaft_demand ? <KV k={t('Shaft power')}>{t('{used} asked of {total}', { used: energy(power.shaft_demand), total: energy(power.shaft_supply) })}</KV> : null}
              {power.elec_supply || power.elec_demand ? <KV k={t('Electricity')}>{t('{used} asked of {total}', { used: energy(power.elec_demand), total: energy(power.elec_supply) })}</KV> : null}
              {power.compute_supply || power.compute_demand ? <KV k={t('Computation')}>{t('{used} asked of {total}', { used: computeQty(power.compute_demand), total: computeQty(power.compute_supply) })}</KV> : null}
            </>
          ) : <KV k={t('Power')}><span class="muted">{t('None installed')}</span></KV>}
        </dl>
      </Section>
    </>
  );
}

function FacilityRow({ regionId, f }: { regionId: number; f: FacilityView }) {
  useLocale();
  const readOnly = useApp().mode === 'observe';
  const [confirm, setConfirm] = useState(false);
  const blockers = f.runs.flatMap((x) => x.blockers);
  const missing = Array.from(new Set(f.runs.flatMap((x) => x.missing ?? [])));
  const tag = `fac-${regionId}`;
  return (
    <li class={cx('fac', !f.enabled && 'is-off')}>
      <div class="fac-top">
        <span class="fac-name">{tc(f.name)}</span>
        <span class="fac-level" title={t('Built levels of the most this site can carry at present')}>{tx('level {n}{max}', { n: <b>{f.level}</b>, max: <small> / {f.max_level}</small> })}</span>
      </div>
      <div class="fac-meta">
        <span title={t('Posts filled of posts needed')}>{f.staff_needed ? <>{tx('staff {n}/{total}', { n: <b>{peopleNum(f.staffed)}</b>, total: peopleNum(f.staff_needed) })}</> : <span class="muted">{t('no posts')}</span>}</span>
        <span class="fac-util" title={t('Achieved share of full output last month')}>
          <Meter value={f.utilization_bp} max={10000} tone={f.enabled ? toneOfBp(f.utilization_bp, 8000, 4000) : 'muted'} label={t('Utilisation {pct}', { pct: pct(f.utilization_bp) })} height={6} />
          <small>{f.enabled ? pct(f.utilization_bp) : t('idle')}</small>
        </span>
        {f.condition_bp < 9000 ? <span class="warn-text" title={t('Condition')}>{t('cond. {pct}', { pct: pct(f.condition_bp) })}</span> : null}
      </div>
      {blockers.length ? <ul class="blockers">{Array.from(new Set(blockers)).slice(0, 3).map((b) => <li><Icon name="warn" size={11} /> {tc(b)}</li>)}</ul> : null}
      {missing.length ? <p class="short-of">{t('Ran short of {goods} last month.', { goods: joinList(missing.map((g) => lc(GOOD_SHORT[g]))) })}</p> : null}
      <div class="fac-actions">
        <button type="button" class="linklike" disabled={readOnly} data-testid={`fac-toggle-${f.kind}`} onClick={() => void act({ kind: 'set_policy', setting: { kind: 'facility', region: regionId, facility: f.kind, enabled: !f.enabled } }, tag, { quiet: true })}>
          {f.enabled ? t('Idle it') : t('Put back to work')}
        </button>
        {confirm ? (
          <>
            <button type="button" class="linklike is-danger" disabled={readOnly} data-testid={`fac-demolish-confirm-${f.kind}`} onClick={() => { setConfirm(false); void act({ kind: 'demolish', region: regionId, facility: f.kind, levels: 1 }, tag); }}>{t('Confirm: remove 1 level')}</button>
            <button type="button" class="linklike" onClick={() => setConfirm(false)}>{t('Keep')}</button>
          </>
        ) : <button type="button" class="linklike" disabled={readOnly} data-testid={`fac-demolish-${f.kind}`} onClick={() => setConfirm(true)}>{t('Demolish…')}</button>}
      </div>
    </li>
  );
}

function ForeignDetails({ obs, r }: { obs: Observation; r: RegionView }) {
  if (!r.foreign) {
    return r.owner === null
      ? <p class="note">{r.settlement === 'wilderness' ? t('Unsettled land. A survey would record what it can support.') : t('A settlement with no known government.')}</p>
      : <p class="note">{t('We hold no population records for this region.')}</p>;
  }
  return (
    <Section title={t('What we have seen')}>
      <dl class="kvs">
        <KV k={t('Population')}><Est>{t('{range} people', { range: range(r.foreign.population_low, r.foreign.population_high) })}</Est></KV>
        <KV k={t('As of')}>{fmtDate(r.last_seen)}</KV>
      </dl>
      {r.foreign.notable.length ? (
        <>
          <p class="sub-label">{t('Notable works')}</p>
          <ul class="plain-list">{tcAll(r.foreign.notable).map((n) => <li>{n}</li>)}</ul>
        </>
      ) : <p class="muted small">{t('No notable works recorded.')}</p>}
    </Section>
  );
}

export function SurveyBlock({ survey }: { survey: SurveyView | null }) {
  useLocale();
  if (!survey) {
    return (
      <Section title={t('Survey')}>
        <p class="empty">{t('Not surveyed. Land, water and deposits here are unknown to us.')}</p>
      </Section>
    );
  }
  return (
    <Section title={t('Survey')} aside={<small class="muted">{survey.detailed ? t('Detailed') : t('Surface only')} · {fmtDate(survey.surveyed_month)}</small>}>
      <dl class="kvs kvs-2">
        <KV k={t('Arable land')}>{int(survey.arable)} <small>{t('sites')}</small></KV>
        <KV k={t('Pasture')}>{int(survey.pasture)} <small>{t('sites')}</small></KV>
        <KV k={t('Wild food')}>{rations(survey.wild_food * 1000)} <small>{t('/month')}</small></KV>
        <KV k={t('Fishery')}>{int(survey.fishery)} <small>{t('grounds')}</small></KV>
        <KV k={t('Forest')}>{int(survey.forest)} <small>{t('stands')}</small></KV>
        <KV k={t('Water')}>{peopleNum(survey.water)} <small>{t('people served')}</small></KV>
        <KV k={t('Hydro sites')}>{int(survey.hydro)}</KV>
      </dl>
      {survey.bonuses?.length || survey.spice_land ? (
        <dl class="kvs">
          {survey.bonuses?.length ? (
            <KV k={t('Site bonuses')} title={t('Region attributes that raise the yield of land works built to use them')}>
              <span class="r3-bonus-list" data-testid="inspector-bonuses">{survey.bonuses.map((b) => <span title={t(BONUS_HINT[b.kind])}>{t(BONUS_LABEL[b.kind])} <small class="pos">+{pct(b.bp)}</small></span>)}</span>
            </KV>
          ) : null}
          {survey.spice_land ? <KV k={t('Spice land')} title={t('Levels of warm, wet land fit for spice plantations')}>{t('{n} levels', { n: int(survey.spice_land) })}</KV> : null}
        </dl>
      ) : null}
      <p class="sub-label">{t('Deposits')}</p>
      {survey.deposits.length ? (
        <ul class="deposit-list" data-testid="inspector-deposits">
          {survey.deposits.map((d) => (
            <li>
              <span class="dep-name"><GoodIcon good={d.kind as Good} size={14} />{t(DEPOSIT_LABEL[d.kind] ?? d.kind)}</span>
              <span class={cx('dep-val', d.epistemic !== 'verified' && 'est')}>{d.epistemic !== 'verified' ? t('≈ {n}', { n: depositQty(d) }) : depositQty(d)} <small>{t('in the ground')}</small> · {t('quality {pct}', { pct: pct(d.quality_bp) })}{heliumNote(d)}</span>
              <EpistemicTag kind={d.epistemic} />
            </li>
          ))}
        </ul>
      ) : <p class="muted small">{survey.detailed ? t('None found by the detailed survey.') : t('None seen from the surface; a detailed survey may find more.')}</p>}
      <p class="muted small">{t('Only deposits of kinds we understand are shown; others may lie here unrecognised.')}</p>
    </Section>
  );
}

export function AgeBar({ children, working, elders }: { children: number; working: number; elders: number }) {
  useLocale();
  const total = Math.max(1, children + working + elders);
  const seg = (n: number) => ((n / total) * 100).toFixed(1) + '%';
  return (
    <div class="agebar-wrap">
      <div class="agebar" role="img" aria-label={t('{children} children, {working} of working age, {elders} elders', { children: peopleNum(children), working: peopleNum(working), elders: peopleNum(elders) })}>
        <span class="age-children" style={{ width: seg(children) }} />
        <span class="age-working" style={{ width: seg(working) }} />
        <span class="age-elders" style={{ width: seg(elders) }} />
      </div>
      <div class="agebar-legend">
        <span><i class="key age-children" /> {t('{n} children', { n: peopleNum(children) })}</span>
        <span><i class="key age-working" /> {t('{n} working age', { n: peopleNum(working) })}</span>
        <span><i class="key age-elders" /> {t('{n} elders', { n: peopleNum(elders) })}</span>
      </div>
    </div>
  );
}

function MiniMeter({ label, bp, invert, sub }: { label: string; bp: number; invert?: boolean; sub?: string }) {
  const tone = invert ? (bp <= 1500 ? 'ok' : bp <= 4000 ? 'warn' : 'bad') : toneOfBp(bp);
  return (
    <div class="mini-meter" title={sub}>
      <span class="mini-label">{label}</span>
      <Meter value={bp} max={10000} tone={tone} label={`${label} ${pct(bp)}`} height={6} />
      <span class="mini-val">{pct(bp)}</span>
    </div>
  );
}

// i18n-table
const BONUS_HINT: Record<string, string> = {
  floodplain: 'River lowland: fields here yield more.',
  fish_banks: 'Rich fishing grounds: fishing yields more.',
  wild_herds: 'Wild horses: horse breeding yields more.',
  old_growth: 'Ancient forest: forestry camps cut more timber.',
  rich_pasture: 'Good grazing: pastures and wool herds yield more.',
};
const SEVERITY: string[] = ['', 'mild', 'serious', 'severe'];
// i18n-end

/** What remains in a deposit: tonnes in the ground, for every kind (precious metals too, though the mined good counts in kilogram lots). */
function depositQty(d: DepositView): string {
  return tonnes(d.remaining);
}

/** Gas fields: the helium recoverable with separation, for a seat that understands cryogenics. */
function heliumNote(d: DepositView) {
  if (d.helium_bp === undefined || d.helium_bp === null) return null;
  return <> · <span title={t('Helium recoverable per 10,000 t of gas with separation at the wells')}>{t('helium {n} per 10,000 t', { n: int(d.helium_bp) })}</span></>;
}

/** An epidemic in the region, with its severity (1 mild to 3 severe). */
function OutbreakNote({ o }: { o: OutbreakView }) {
  const band = Math.max(1, Math.min(3, o.severity_band));
  return (
    <p class={cx('note r3-outbreak', band >= 2 ? 'is-bad' : 'is-warn')} data-testid="inspector-outbreak">
      <Icon name="danger" size={13} />
      <span>
        <b>{t('Epidemic: {severity}', { severity: t(SEVERITY[band]) })}</b>{' '}
        <span class="r3-sev" aria-hidden="true">{[1, 2, 3].map((i) => <i class={i <= band ? 'on' : undefined} />)}</span>{' '}
        <small>{t('since {date}', { date: fmtDate(o.since) })} · {t('people die and work less until it passes; healers, hospitals, drains and clean water shorten it')}</small>
      </span>
    </p>
  );
}
