// Military: formation types, recruitment, own armies and their orders, and
// foreign forces as they were last observed.
import { useEffect, useState } from 'preact/hooks';
import type { ArmyView, Observation, RegionId, Role, UnitTier } from '../protocol';
import { ROLES, ROLE_LABEL, fmtDate, fmtMonths, int, pct, range } from '../format';
import { Icon } from '../icons';
import {
  ActionNote, Badge, Btn, Checklist, Empty, Est, Field, GoodsList, Meter, NumInput, RegionLink, SeatDot, Section,
  Select, Why, cx, toneOfBp,
} from '../ui';
import { act, cancelPick, civColor, civName, consumeIntent, startPick, useApp } from '../store';

/** Three role marks that differ by shape, not only colour. */
export function RoleMark({ role, size = 14 }: { role: Role; size?: number }) {
  return (
    <svg class={cx('role-mark', 'role-' + role)} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {role === 'assault' ? <path d="M8 1.500 14.500 14H1.500z" /> : role === 'maneuver' ? <path d="M1.500 8 8 1.500 14.500 8 8 14.500z" /> : <rect x="2.500" y="2.500" width="11" height="11" />}
    </svg>
  );
}

const ROLE_HINT: Record<Role, string> = {
  assault: 'Breaks positions; countered by denial',
  maneuver: 'Outflanks assault; countered by assault in close ground',
  denial: 'Holds ground and blunts assault; outpaced by maneuver',
};

export function MilitaryPanel() {
  const s = useApp();
  const obs = s.obs!;
  const [recruiting, setRecruiting] = useState(false);
  const [presetRegion, setPresetRegion] = useState<RegionId | undefined>(undefined);
  useEffect(() => {
    const it = s.intent;
    if (it?.kind === 'recruit') { setPresetRegion(it.region); setRecruiting(true); consumeIntent(); }
  }, [s.intent?.nonce]);

  const tiers = obs.catalog.unit_tiers;
  const soldiers = obs.armies.reduce((a, x) => a + x.soldiers.reduce((n, y) => n + y[1], 0), 0);
  const training = obs.projects.filter((p) => p.kind === 'recruit');
  const wars = obs.diplomacy.wars;

  return (
    <div class="panel military">
      <p class="panel-lede">Can the force operate, and can the government still govern while it does?</p>
      {wars.length ? <p class="note is-bad"><Icon name="warn" size={12} /> At war with {wars.map((w) => civName(obs, w)).join(', ')}.</p> : null}

      <Section title="Armies" aside={<span class="row"><small class="muted">{int(soldiers)} soldiers under arms</small><Btn small kind="primary" icon="plus" testid="recruit-open" onClick={() => { setPresetRegion(s.selectedRegion ?? undefined); setRecruiting(!recruiting); }}>{recruiting ? 'Close' : 'Recruit'}</Btn></span>}>
        {recruiting ? <RecruitForm obs={obs} presetRegion={presetRegion} onDone={() => setRecruiting(false)} /> : null}
        {training.length ? <p class="note"><Icon name="clock" size={12} /> {training.length} formation{training.length === 1 ? ' is' : 's are'} being raised: {training.map((p) => p.title).join('; ')}.</p> : null}
        {obs.armies.length === 0 ? <Empty>No formation is under arms.</Empty> : (
          <ul class="army-list">{obs.armies.map((a) => <li><ArmyCard obs={obs} a={a} /></li>)}</ul>
        )}
        <ActionNote tag="army" />
      </Section>

      <Section title="Foreign forces seen" aside={<small class="muted">estimates from our own reports</small>}>
        {obs.foreign_armies.length === 0 ? <Empty>No foreign formation has been observed.</Empty> : (
          <ul class="plain-list foreign-armies">
            {obs.foreign_armies.map((f) => (
              <li class="card">
                <div class="row-between">
                  <span><SeatDot color={civColor(obs, f.owner)} /> <b>{civName(obs, f.owner)}</b> in <RegionLink id={f.region} /></span>
                  <small class="muted">seen {fmtDate(f.observed_month)}</small>
                </div>
                <p><Est>{range(f.strength_low, f.strength_high)} soldiers</Est>{f.tier_estimate !== null ? <> · <Est>equipment about tier {f.tier_estimate}</Est></> : <span class="muted"> · equipment unknown</span>}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Formation types" aside={<small class="muted">current standard: tier {obs.civ.military_tier}</small>}>
        <ul class="tier-list">{tiers.map((t) => <li><TierCard t={t} /></li>)}</ul>
      </Section>
    </div>
  );
}

function TierCard({ t }: { t: UnitTier }) {
  return (
    <div class={cx('card tier', !t.available && 'is-locked')} data-testid="unit-tier">
      <div class="row-between">
        <b class="detail-title">{!t.available ? <Icon name="lock" size={12} title="Requirements not met" /> : null} Tier {t.tier} · {t.name}</b>
        {t.available ? <Badge tone="ok" icon="check">Available</Badge> : <Badge tone="muted" icon="lock">Not yet</Badge>}
      </div>
      <ul class="role-names">
        {t.role_names.map(([role, name]) => <li title={ROLE_HINT[role]}><RoleMark role={role} /> <span class="kicker">{ROLE_LABEL[role]}</span> {name}</li>)}
      </ul>
      <dl class="kvs">
        <div class="kv"><dt>Equipment</dt><dd><GoodsList items={t.equipment} per="per soldier" empty="none" /></dd></div>
        <div class="kv"><dt>Upkeep</dt><dd><GoodsList items={t.upkeep} per="per soldier each month" empty="none" /></dd></div>
        <div class="kv"><dt>Training</dt><dd>{fmtMonths(t.training_months)}</dd></div>
      </dl>
      {t.requirements.length ? <Checklist items={t.requirements} /> : null}
    </div>
  );
}

function RecruitForm({ obs, presetRegion, onDone }: { obs: Observation; presetRegion?: RegionId; onDone: () => void }) {
  const s = useApp();
  const regions = obs.regions.filter((r) => r.own && r.owner === obs.seat);
  const available = obs.catalog.unit_tiers.filter((t) => t.available);
  const [region, setRegion] = useState<RegionId | undefined>(presetRegion !== undefined && regions.some((r) => r.id === presetRegion) ? presetRegion : (regions.find((r) => r.id === obs.civ.capital) ?? regions[0])?.id);
  const [role, setRole] = useState<Role>('assault');
  const [soldiers, setSoldiers] = useState(20);
  const [tier, setTier] = useState<number>(available.length ? available[available.length - 1].tier : 0);
  if (!regions.length || region === undefined) return <Empty>We govern no region to recruit in.</Empty>;
  const t = obs.catalog.unit_tiers.find((x) => x.tier === tier);
  const room = obs.civ.recruit_room;
  const why = !t ? 'No formation type is available' : !t.available ? 'This formation type is not yet available' : soldiers < 10 || soldiers > 5000 ? 'A formation is 10 to 5,000 soldiers' : room !== undefined && soldiers > room ? `At most ${int(room)} more people would currently serve` : null;
  const submit = async () => {
    const rec = await act({ kind: 'start_project', spec: { kind: 'recruit', region, role, soldiers, tier }, priority: null }, 'recruit');
    if (rec.length && rec.every((x) => x.status === 'accepted')) onDone();
  };
  return (
    <div class="card form recruit-form" data-testid="recruit-form">
      <b class="detail-title">Raise a formation</b>
      <div class="form-row">
        <Field label="Region"><Select value={region} options={regions.map((r) => ({ value: r.id, label: `${r.name} (${int(r.own!.working_age)} working age)` }))} onChange={(v) => setRegion(v)} label="Recruiting region" testid="recruit-region" /></Field>
        <Field label="Type"><Select value={tier} options={obs.catalog.unit_tiers.map((x) => ({ value: x.tier, label: `Tier ${x.tier} · ${x.name}`, disabled: !x.available }))} onChange={(v) => setTier(v)} label="Formation type" /></Field>
      </div>
      <div class="field">
        <span class="field-label">Role</span>
        <div class="segmented" role="radiogroup" aria-label="Role">
          {ROLES.map((r) => (
            <button type="button" role="radio" aria-checked={role === r} class={cx('seg', role === r && 'is-active')} title={ROLE_HINT[r]} data-testid={`role-${r}`} onClick={() => setRole(r)}>
              <RoleMark role={r} /> {t?.role_names.find((x) => x[0] === r)?.[1] ?? ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <span class="field-hint">{ROLE_LABEL[role]}: {ROLE_HINT[role].toLowerCase()}.</span>
      </div>
      <Field label="Soldiers" hint={room !== undefined ? `Soldiers leave the workforce while they serve. About ${int(room)} more people would currently agree to serve; custom, institutions and danger change that.` : 'Soldiers leave the workforce while they serve.'}>
        <NumInput value={soldiers} min={10} max={5000} step={10} unit="soldiers" label="Soldiers" onChange={setSoldiers} testid="recruit-soldiers" />
      </Field>
      {t ? <p class="total-line">Equipment: <GoodsList items={t.equipment.map((g) => ({ good: g.good, amount: g.amount * soldiers }))} empty="none" /> · upkeep <GoodsList items={t.upkeep.map((g) => ({ good: g.good, amount: g.amount * soldiers }))} per="each month" empty="none" /> · {fmtMonths(t.training_months)} training</p> : null}
      <div class="form-actions">
        <Btn kind="primary" icon="military" why={why} disabled={s.busy} testid="recruit-submit" onClick={() => void submit()}>Order recruitment</Btn>
        {why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="recruit" />
    </div>
  );
}

const ORDER_LABEL: Record<string, string> = { hold: 'Holding position', move: 'Moving', attack: 'Attacking' };

function ArmyCard({ obs, a }: { obs: Observation; a: ArmyView }) {
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  const total = a.soldiers.reduce((n, x) => n + x[1], 0);
  const tier = obs.catalog.unit_tiers.find((t) => t.tier === a.tier);
  const mergeable = obs.armies.filter((b) => b.id !== a.id && b.region === a.region && b.tier === a.tier);
  const ownIds = obs.regions.filter((r) => r.own && r.id !== a.region).map((r) => r.id);
  const foreignIds = obs.regions.filter((r) => !r.own || (r.controller !== null && r.controller !== obs.seat)).map((r) => r.id);
  const order = (o: Parameters<typeof issue>[0]) => issue(o);
  function issue(o: { kind: 'hold' } | { kind: 'move'; to: RegionId } | { kind: 'attack'; region: RegionId } | { kind: 'disband' } | { kind: 'merge'; into: number }) {
    return act({ kind: 'military_order', army: a.id, order: o }, 'army');
  }
  return (
    <div class={cx('card army', a.in_battle && 'is-battle')} data-testid="army-card">
      <div class="project-top">
        <div>
          <span class="kicker">Tier {a.tier}{tier ? ` · ${tier.name}` : ''} · <RegionLink id={a.region} /></span>
          <b class="project-title">{a.name}</b>
        </div>
        {a.in_battle ? <Badge tone="bad" icon="warn">In battle</Badge> : a.training_months_left > 0 ? <Badge tone="gold" icon="clock">Training · {fmtMonths(a.training_months_left)} left</Badge> : null}
      </div>
      <ul class="army-roles">
        {a.soldiers.map(([role, n]) => (
          <li class={n === 0 ? 'is-zero' : undefined}><RoleMark role={role} /> <b>{int(n)}</b> <span>{tier?.role_names.find((x) => x[0] === role)?.[1] ?? ROLE_LABEL[role]}</span></li>
        ))}
        <li class="army-total"><b>{int(total)}</b> soldiers</li>
      </ul>
      <div class="mini-meters three">
        <div class="mini-meter"><span class="mini-label">Proficiency</span><Meter value={a.proficiency_bp} max={10000} tone={toneOfBp(a.proficiency_bp, 7000, 4000)} height={6} label={`Proficiency ${pct(a.proficiency_bp)}`} /><span class="mini-val">{pct(a.proficiency_bp)}</span></div>
        <div class="mini-meter"><span class="mini-label">Supply</span><Meter value={a.supply_bp} max={10000} tone={toneOfBp(a.supply_bp, 8000, 5000)} height={6} label={`Supply ${pct(a.supply_bp)}`} /><span class="mini-val">{pct(a.supply_bp)}</span></div>
        <div class="mini-meter"><span class="mini-label">Morale</span><Meter value={a.morale_bp} max={10000} tone={toneOfBp(a.morale_bp, 7000, 4000)} height={6} label={`Morale ${pct(a.morale_bp)}`} /><span class="mini-val">{pct(a.morale_bp)}</span></div>
      </div>
      <p class="army-order"><span class="kicker">Order</span> {ORDER_LABEL[a.order] ?? a.order}{a.target !== null ? <> → <RegionLink id={a.target} /></> : null}</p>
      <div class="order-controls" role="group" aria-label={`Orders for ${a.name}`}>
        <Btn small pressed={a.order === 'hold'} disabled={s.busy} testid="order-hold" onClick={() => void order({ kind: 'hold' })}>Hold</Btn>
        <Btn small pressed={a.order === 'move'} disabled={s.busy} why={ownIds.length ? null : 'No other governed region to move to'} testid="order-move"
          onClick={() => startPick({ prompt: `Move ${a.name}: choose a governed or friendly region`, targets: null, onPick: (id) => { cancelPick(); void order({ kind: 'move', to: id }); } })}>Move…</Btn>
        <Btn small pressed={a.order === 'attack'} disabled={s.busy} why={foreignIds.length ? null : 'No region outside our control is known'} testid="order-attack"
          onClick={() => startPick({ prompt: `Attack with ${a.name}: choose a region to enter and contest. Against another civilization this is war.`, targets: foreignIds, onPick: (id) => { cancelPick(); void order({ kind: 'attack', region: id }); } })}>Attack…</Btn>
        {mergeable.length ? (
          <Select value={0} label="Merge into" options={[{ value: 0, label: 'Merge into…' }, ...mergeable.map((b) => ({ value: b.id, label: b.name }))]} onChange={(v) => { if (v) void order({ kind: 'merge', into: v }); }} />
        ) : null}
        {confirm ? (
          <>
            <Btn small kind="danger" disabled={s.busy} onClick={() => { setConfirm(false); void order({ kind: 'disband' }); }}>Disband now</Btn>
            <Btn small kind="ghost" onClick={() => setConfirm(false)}>Keep</Btn>
          </>
        ) : <Btn small kind="ghost" title="Soldiers return to civilian life; equipment is not recovered" onClick={() => setConfirm(true)}>Disband…</Btn>}
      </div>
      {!mergeable.length && obs.armies.length > 1 ? <Why>Merging needs another formation of the same tier in the same region.</Why> : null}
    </div>
  );
}
