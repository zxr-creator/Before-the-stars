// Context inspector for the selected region. Everything shown comes from the
// seat's own RegionView; what has not been observed is stated as missing.
import { useState } from 'preact/hooks';
import type { FacilityView, Observation, OwnRegion, RegionView, SurveyView } from './protocol';
import {
  DEPOSIT_LABEL, GOOD_SHORT, QUAL_LABEL, SETTLEMENT_LABEL, TERRAIN_LABEL, VIS_LABEL, fmtDate, int, milli, pct, range,
} from './format';
import { Icon } from './icons';
import { ActionNote, Badge, Btn, EpistemicTag, Est, KV, Meter, SeatDot, Section, cx, toneOfBp } from './ui';
import { act, civColor, civName, openPanel, selectRegion, useApp } from './store';

export function Inspector() {
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
    <aside class="inspector" aria-label={`Region: ${r.name}`} data-testid="inspector">
      <header class="inspector-head">
        <div>
          <p class="eyebrow">{TERRAIN_LABEL[r.terrain]}{r.coastal ? ' · coast' : ''}{r.river ? ' · river' : ''}</p>
          <h2 data-testid="inspector-name">{r.name}</h2>
        </div>
        <Btn kind="ghost" small icon="close" title="Close (Esc)" onClick={() => selectRegion(null)} />
      </header>
      <div class="inspector-body">
        <dl class="kvs">
          <KV k="Settlement">{SETTLEMENT_LABEL[r.settlement]}{obs.civ.capital === r.id ? ' ' : null}{obs.civ.capital === r.id ? <Badge tone="gold" icon="star">Capital</Badge> : null}</KV>
          <KV k="Held by">
            {r.owner === null ? <span class="muted">No one, as far as we know</span> : <><SeatDot color={civColor(obs, r.owner)} /> {civName(obs, r.owner)}</>}
          </KV>
          {occupied ? <KV k="Occupied by"><SeatDot color={civColor(obs, r.controller)} /> {civName(obs, r.controller)} {' '}<Badge tone="bad" icon="warn">Contested</Badge></KV> : null}
          <KV k="Our knowledge">
            {r.visibility === 'remembered'
              ? <Est kind="reported" title="This is a remembered record, not a current observation">Remembered · last seen {fmtDate(r.last_seen)}</Est>
              : <>{VIS_LABEL[r.visibility]} <small class="muted">as of {fmtDate(r.last_seen)}</small></>}
          </KV>
          {r.test_node ? <KV k="Deployment"><Badge tone="accent" icon="objectives">Jump test node</Badge></KV> : null}
        </dl>

        {mine ? <OwnDetails obs={obs} r={r} own={r.own!} /> : <ForeignDetails obs={obs} r={r} />}

        {armiesHere.length || foreignHere.length ? (
          <Section title="Forces here">
            <ul class="plain-list">
              {armiesHere.map((a) => (
                <li><button type="button" class="linklike" onClick={() => openPanel('military')}>{a.name}</button> — {int(a.soldiers.reduce((n, x) => n + x[1], 0))} soldiers, order: {a.order}</li>
              ))}
              {foreignHere.map((a) => (
                <li><SeatDot color={civColor(obs, a.owner)} /> {civName(obs, a.owner)} force, <Est>{range(a.strength_low, a.strength_high)} soldiers</Est> <small class="muted">seen {fmtDate(a.observed_month)}</small></li>
              ))}
            </ul>
          </Section>
        ) : null}

        <SurveyBlock survey={r.survey} />

        <Section title="Orders">
          <div class="quick-actions">
            {mine ? (
              <>
                <Btn small icon="hammer" testid="qa-build" onClick={() => openPanel('projects', { kind: 'build', region: r.id })}>Build here</Btn>
                <Btn small icon="people" testid="qa-program" onClick={() => openPanel('people', { kind: 'program', region: r.id })}>Open programme</Btn>
                <Btn small icon="flag" testid="qa-settle-from" onClick={() => openPanel('projects', { kind: 'settle', from: r.id })}>Settle from here</Btn>
                <Btn small icon="military" testid="qa-recruit" onClick={() => openPanel('military', { kind: 'recruit', region: r.id })}>Recruit here</Btn>
              </>
            ) : null}
            {!(r.survey?.detailed && mine) ? (
              <Btn small icon="eye" testid="qa-survey" why={surveyRunning ? 'A survey party is already assigned here' : null}
                onClick={() => void act({ kind: 'start_project', spec: { kind: 'survey', region: r.id }, priority: null }, 'inspector')}>
                {r.survey?.detailed ? 'Survey again' : r.survey ? 'Survey in detail' : 'Survey'}
              </Btn>
            ) : null}
            {!mine && r.owner === null ? (
              <Btn small icon="flag" testid="qa-settle-to" why={adjacentOwn ? null : 'Settlers need a direct route from a region we govern'}
                onClick={() => openPanel('projects', { kind: 'settle', to: r.id })}>Settle here</Btn>
            ) : null}
            {mine && obs.civ.capital !== r.id ? (
              <Btn small kind="ghost" icon="star" onClick={() => void act({ kind: 'set_policy', setting: { kind: 'move_capital', region: r.id } }, 'inspector')}>Make capital</Btn>
            ) : null}
          </div>
          {!mine && r.owner === null && !adjacentOwn ? <p class="why"><Icon name="lock" size={12} /> Settling needs a direct route from a governed region.</p> : null}
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
      <Section title="People" aside={<b>{int(own.population)} <small class="muted">people</small></b>}>
        <AgeBar children={own.children} working={own.working_age} elders={own.elders} />
        {own.occupied_since !== null ? <p class="note is-warn"><Icon name="warn" size={12} /> Under occupation since {fmtDate(own.occupied_since)}.</p> : null}
        <div class="mini-meters">
          <MiniMeter label="Food access" bp={own.food_fulfillment_bp} />
          <MiniMeter label="Water access" bp={own.water_fulfillment_bp} sub={`capacity ${int(own.water_capacity)} people`} />
          <MiniMeter label="Health pressure" bp={own.health_pressure_bp} invert />
          <MiniMeter label="Unrest" bp={own.unrest_bp} invert />
        </div>
        {own.blocks.length ? (
          <ul class="blocks">
            {own.blocks.map((b) => (
              <li>
                <span class="block-bar" style={{ width: Math.max(4, (b.count / total) * 100) + '%' }} />
                <span class="block-text">{b.lineage}{b.religion ? <small class="muted"> · {b.religion}</small> : <small class="muted"> · no religion</small>}</span>
                <span class="num">{int(b.count)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {own.quals.length ? (
          <p class="quals-line">
            {own.quals.filter((q) => q.count > 0).map((q, i) => (
              <span>{i ? ' · ' : ''}<b>{int(q.count)}</b> {QUAL_LABEL[q.qual].toLowerCase()}</span>
            ))}
          </p>
        ) : null}
      </Section>

      <Section title="Works" aside={<small class="muted">{own.facilities.length} kinds</small>}>
        {own.facilities.length ? (
          <ul class="fac-list">
            {own.facilities.map((f) => <FacilityRow regionId={r.id} f={f} />)}
          </ul>
        ) : <p class="empty">Nothing has been built here yet.</p>}
        <ActionNote tag={`fac-${r.id}`} />
      </Section>

      {own.venues && own.venues.length ? (
        <Section title="Teaching places">
          <ul class="cap-list">
            {own.venues.map((v) => (
              <li>
                <span class="cap-name">{obs.catalog.facilities.find((f) => f.kind === v.venue)?.name ?? v.venue}</span>
                <Meter value={v.reserved} max={Math.max(1, v.capacity)} tone="accent" height={6} label={`${v.reserved} of ${v.capacity} places booked`} />
                <span class="cap-val">{int(v.reserved)} <small>booked</small> / {int(v.capacity)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Links and power">
        <dl class="kvs">
          <KV k="Transport">Level {own.transport_level}</KV>
          <KV k="Link efficiency" title="Share of goods that arrive when moved to or from the capital network">{pct(own.link_efficiency_bp)}</KV>
          {anyPower ? (
            <>
              {power.shaft_supply || power.shaft_demand ? <KV k="Shaft power">{milli(power.shaft_demand)} used of {milli(power.shaft_supply)} units</KV> : null}
              {power.elec_supply || power.elec_demand ? <KV k="Electricity">{milli(power.elec_demand)} used of {milli(power.elec_supply)} units</KV> : null}
              {power.compute_supply || power.compute_demand ? <KV k="Computation">{milli(power.compute_demand)} used of {milli(power.compute_supply)} units</KV> : null}
            </>
          ) : <KV k="Power"><span class="muted">None installed</span></KV>}
        </dl>
      </Section>
    </>
  );
}

function FacilityRow({ regionId, f }: { regionId: number; f: FacilityView }) {
  const [confirm, setConfirm] = useState(false);
  const blockers = f.runs.flatMap((x) => x.blockers);
  const missing = Array.from(new Set(f.runs.flatMap((x) => x.missing ?? [])));
  const tag = `fac-${regionId}`;
  return (
    <li class={cx('fac', !f.enabled && 'is-off')}>
      <div class="fac-top">
        <span class="fac-name">{f.name}</span>
        <span class="fac-level" title="Built levels of the most this site can carry at present">level <b>{f.level}</b><small> / {f.max_level}</small></span>
      </div>
      <div class="fac-meta">
        <span title="Posts filled of posts needed">{f.staff_needed ? <>staff <b>{int(f.staffed)}</b>/{int(f.staff_needed)}</> : <span class="muted">no posts</span>}</span>
        <span class="fac-util" title="Achieved share of full output last month">
          <Meter value={f.utilization_bp} max={10000} tone={f.enabled ? toneOfBp(f.utilization_bp, 8000, 4000) : 'muted'} label={`Utilisation ${pct(f.utilization_bp)}`} height={6} />
          <small>{f.enabled ? pct(f.utilization_bp) : 'idle'}</small>
        </span>
        {f.condition_bp < 9000 ? <span class="warn-text" title="Condition">cond. {pct(f.condition_bp)}</span> : null}
      </div>
      {blockers.length ? <ul class="blockers">{Array.from(new Set(blockers)).slice(0, 3).map((b) => <li><Icon name="warn" size={11} /> {b}</li>)}</ul> : null}
      {missing.length ? <p class="short-of">Ran short of {missing.map((g) => GOOD_SHORT[g].toLowerCase()).join(', ')} last month.</p> : null}
      <div class="fac-actions">
        <button type="button" class="linklike" data-testid={`fac-toggle-${f.kind}`} onClick={() => void act({ kind: 'set_policy', setting: { kind: 'facility', region: regionId, facility: f.kind, enabled: !f.enabled } }, tag, { quiet: true })}>
          {f.enabled ? 'Idle it' : 'Put back to work'}
        </button>
        {confirm ? (
          <>
            <button type="button" class="linklike is-danger" data-testid={`fac-demolish-confirm-${f.kind}`} onClick={() => { setConfirm(false); void act({ kind: 'demolish', region: regionId, facility: f.kind, levels: 1 }, tag); }}>Confirm: remove 1 level</button>
            <button type="button" class="linklike" onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : <button type="button" class="linklike" data-testid={`fac-demolish-${f.kind}`} onClick={() => setConfirm(true)}>Demolish…</button>}
      </div>
    </li>
  );
}

function ForeignDetails({ obs, r }: { obs: Observation; r: RegionView }) {
  if (!r.foreign) {
    return r.owner === null
      ? <p class="note">{r.settlement === 'wilderness' ? 'Unsettled land. A survey would record what it can support.' : 'A settlement with no known government.'}</p>
      : <p class="note">We hold no population records for this region.</p>;
  }
  return (
    <Section title="What we have seen">
      <dl class="kvs">
        <KV k="Population"><Est>{range(r.foreign.population_low, r.foreign.population_high)} people</Est></KV>
        <KV k="As of">{fmtDate(r.last_seen)}</KV>
      </dl>
      {r.foreign.notable.length ? (
        <>
          <p class="sub-label">Notable works</p>
          <ul class="plain-list">{r.foreign.notable.map((n) => <li>{n}</li>)}</ul>
        </>
      ) : <p class="muted small">No notable works recorded.</p>}
    </Section>
  );
}

export function SurveyBlock({ survey }: { survey: SurveyView | null }) {
  if (!survey) {
    return (
      <Section title="Survey">
        <p class="empty">Not surveyed. Land, water and deposits here are unknown to us.</p>
      </Section>
    );
  }
  return (
    <Section title="Survey" aside={<small class="muted">{survey.detailed ? 'Detailed' : 'Surface only'} · {fmtDate(survey.surveyed_month)}</small>}>
      <dl class="kvs kvs-2">
        <KV k="Arable land">{int(survey.arable)} <small>sites</small></KV>
        <KV k="Pasture">{int(survey.pasture)} <small>sites</small></KV>
        <KV k="Wild food">{int(survey.wild_food)} <small>/month</small></KV>
        <KV k="Fishery">{int(survey.fishery)} <small>grounds</small></KV>
        <KV k="Forest">{int(survey.forest)} <small>stands</small></KV>
        <KV k="Water">{int(survey.water)} <small>people served</small></KV>
        <KV k="Hydro sites">{int(survey.hydro)}</KV>
      </dl>
      <p class="sub-label">Deposits</p>
      {survey.deposits.length ? (
        <ul class="deposit-list">
          {survey.deposits.map((d) => (
            <li>
              <span class="dep-name">{DEPOSIT_LABEL[d.kind]}</span>
              <span class={cx('dep-val', d.epistemic !== 'verified' && 'est')}>{d.epistemic !== 'verified' ? '≈ ' : ''}{milli(d.remaining)} <small>units left</small> · quality {pct(d.quality_bp)}</span>
              <EpistemicTag kind={d.epistemic} />
            </li>
          ))}
        </ul>
      ) : <p class="muted small">{survey.detailed ? 'None found by the detailed survey.' : 'None seen from the surface; a detailed survey may find more.'}</p>}
    </Section>
  );
}

export function AgeBar({ children, working, elders }: { children: number; working: number; elders: number }) {
  const total = Math.max(1, children + working + elders);
  const seg = (n: number) => ((n / total) * 100).toFixed(1) + '%';
  return (
    <div class="agebar-wrap">
      <div class="agebar" role="img" aria-label={`${children} children, ${working} of working age, ${elders} elders`}>
        <span class="age-children" style={{ width: seg(children) }} />
        <span class="age-working" style={{ width: seg(working) }} />
        <span class="age-elders" style={{ width: seg(elders) }} />
      </div>
      <div class="agebar-legend">
        <span><i class="key age-children" /> {int(children)} children</span>
        <span><i class="key age-working" /> {int(working)} working age</span>
        <span><i class="key age-elders" /> {int(elders)} elders</span>
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
