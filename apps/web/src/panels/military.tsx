// Military: formation types, recruitment, own armies and their orders, and
// foreign forces as they were last observed.
import { useEffect, useState } from 'preact/hooks';
import type { ArmyView, Observation, RegionId, Role, UnitTier } from '../protocol';
import { ROLES, ROLE_LABEL, fmtDate, fmtMonths, int, joinList, lc, pct, peopleNum, range, tcChecks, tn, tx } from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import {
  ActionNote, Badge, Btn, Checklist, Empty, Est, Field, GoodsList, Meter, NumInput, RegionLink, SeatDot, Section,
  Select, Why, cx, toneOfBp,
} from '../ui';
import { act, cancelPick, civColor, civName, consumeIntent, startPick, useApp } from '../store';
import { GEN_ERA, genCode } from '../economy/labels';
import { eraText } from '../economy/Productivity';

/** "G4 · Mechanized formations": a formation type by its equipment generation (ruleset 3.0), else its tier. */
function tierName(ut: UnitTier | undefined, tier: number): string {
  if (!ut) return t('Tier {n}', { n: tier });
  if (ut.generation === undefined) return t('Tier {n} · {name}', { n: ut.tier, name: tc(ut.name) });
  return t('{gen} · {name}', { gen: genCode(ut.generation), name: tc(ut.name) });
}

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
  useLocale();
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
      <p class="panel-lede">{t('Can the force operate, and can the government still govern while it does?')}</p>
      {wars.length ? <p class="note is-bad"><Icon name="warn" size={12} /> {t('At war with {names}.', { names: joinList(wars.map((w) => tc(civName(obs, w)))) })}</p> : null}

      <Section title={t('Armies')} aside={<span class="row"><small class="muted">{t('{n} soldiers under arms', { n: peopleNum(soldiers) })}</small><Btn small kind="primary" icon="plus" testid="recruit-open" onClick={() => { setPresetRegion(s.selectedRegion ?? undefined); setRecruiting(!recruiting); }}>{recruiting ? t('Close') : t('Recruit')}</Btn></span>}>
        {recruiting ? <RecruitForm obs={obs} presetRegion={presetRegion} onDone={() => setRecruiting(false)} /> : null}
        {training.length ? <p class="note"><Icon name="clock" size={12} /> {tn(training.length, '{n} formation is being raised: {titles}.', '{n} formations are being raised: {titles}.', { titles: training.map((p) => tc(p.title)).join(isZh() ? '；' : '; ') })}</p> : null}
        {obs.armies.length === 0 ? <Empty>{t('No formation is under arms.')}</Empty> : (
          <ul class="army-list">{obs.armies.map((a) => <li><ArmyCard obs={obs} a={a} /></li>)}</ul>
        )}
        <ActionNote tag="army" />
      </Section>

      <Section title={t('Foreign forces seen')} aside={<small class="muted">{t('estimates from our own reports')}</small>}>
        {obs.foreign_armies.length === 0 ? <Empty>{t('No foreign formation has been observed.')}</Empty> : (
          <ul class="plain-list foreign-armies">
            {obs.foreign_armies.map((f) => (
              <li class="card">
                <div class="row-between">
                  <span><SeatDot color={civColor(obs, f.owner)} /> {tx('{civ} in {region}', { civ: <b>{tc(civName(obs, f.owner))}</b>, region: <RegionLink id={f.region} /> })}</span>
                  <small class="muted">{t('seen {date}', { date: fmtDate(f.observed_month) })}</small>
                </div>
                <p><Est>{t('{n} soldiers', { n: range(f.strength_low, f.strength_high) })}</Est>{f.tier_estimate !== null ? <> · <Est>{t('equipment about tier {n}', { n: f.tier_estimate })}</Est></> : <span class="muted"> · {t('equipment unknown')}</span>}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('Formation types')} aside={<small class="muted">{t('current standard: {name}', { name: tierName(tiers.find((x) => x.tier === obs.civ.military_tier), obs.civ.military_tier) })}</small>}>
        {tiers.some((x) => x.generation !== undefined) ? (
          <p class="muted small mil-gen-lede">{t('Each formation type carries one equipment generation, G0 to G7, from warbands to orbital-supported forces. Equipment is per thousand soldiers; maneuver formations of some generations also need horses, and some generations accept substitute equipment when the usual is short.')}</p>
        ) : null}
        <ul class="tier-list">{tiers.map((x) => <li><TierCard t={x} current={x.tier === obs.civ.military_tier} /></li>)}</ul>
      </Section>
    </div>
  );
}

function TierCard({ t: ut, current }: { t: UnitTier; current?: boolean }) {
  const gen = ut.generation;
  const extra = ut.maneuver_extra ?? [];
  const alt = ut.alternative ?? [];
  return (
    <div class={cx('card tier', !ut.available && 'is-locked', current && 'is-current')} data-testid="unit-tier" data-generation={gen}>
      <div class="row-between">
        <b class="detail-title">
          {gen !== undefined ? <span class="mil-gen" title={t('Equipment generation {gen}', { gen: genCode(gen) })}>{genCode(gen)}</span> : null}
          {!ut.available ? <Icon name="lock" size={12} title={t('Requirements not met')} /> : null} {gen !== undefined ? tc(ut.name) : t('Tier {n} · {name}', { n: ut.tier, name: tc(ut.name) })}
        </b>
        <span class="row">
          {current ? <Badge tone="gold" icon="star">{t('Current standard')}</Badge> : null}
          {ut.available ? <Badge tone="ok" icon="check">{t('Available')}</Badge> : <Badge tone="muted" icon="lock">{t('Not yet')}</Badge>}
        </span>
      </div>
      {gen !== undefined ? <p class="mil-gen-era">{t('Generation {gen} · {era}', { gen: genCode(gen), era: GEN_ERA[gen] ? eraText(GEN_ERA[gen]) : '' })}</p> : null}
      <ul class="role-names">
        {ut.role_names.map(([role, name]) => <li title={t(ROLE_HINT[role])}><RoleMark role={role} /> <span class="kicker">{t(ROLE_LABEL[role])}</span> {tc(name)}</li>)}
      </ul>
      <dl class="kvs">
        <div class="kv"><dt>{t('Equipment')}</dt><dd><GoodsList items={ut.equipment} per={t('per thousand soldiers')} empty={t('none')} /></dd></div>
        {extra.length ? <div class="kv" data-testid="tier-maneuver-extra"><dt title={t('What a maneuver formation of this generation needs besides the equipment')}><RoleMark role="maneuver" size={11} /> {t('Maneuver also')}</dt><dd><GoodsList items={extra} per={t('per thousand soldiers')} /></dd></div> : null}
        {alt.length ? <div class="kv" data-testid="tier-alternative"><dt title={t('Equipment that may be issued instead when the usual is short')}>{t('Substitute')}</dt><dd><GoodsList items={alt} per={t('per thousand soldiers')} /> <small class="muted">{t('issued instead when the usual equipment is short')}</small></dd></div> : null}
        <div class="kv"><dt>{t('Upkeep')}</dt><dd><GoodsList items={ut.upkeep} per={t('per thousand soldiers each month')} empty={t('none')} /></dd></div>
        <div class="kv"><dt>{t('Training')}</dt><dd>{fmtMonths(ut.training_months)}</dd></div>
      </dl>
      {ut.requirements.length ? <Checklist items={tcChecks(ut.requirements)} /> : null}
    </div>
  );
}

function RecruitForm({ obs, presetRegion, onDone }: { obs: Observation; presetRegion?: RegionId; onDone: () => void }) {
  const s = useApp();
  const regions = obs.regions.filter((r) => r.own && r.owner === obs.seat);
  const available = obs.catalog.unit_tiers.filter((x) => x.available);
  const [region, setRegion] = useState<RegionId | undefined>(presetRegion !== undefined && regions.some((r) => r.id === presetRegion) ? presetRegion : (regions.find((r) => r.id === obs.civ.capital) ?? regions[0])?.id);
  const [role, setRole] = useState<Role>('assault');
  // a formation is real people: 1,000 to 5,000,000 soldiers (Observation.units.limits; units-and-scale §3)
  const smin = obs.units?.limits?.soldiers_min ?? 1_000;
  const smax = obs.units?.limits?.soldiers_max ?? 5_000_000;
  const [soldiers, setSoldiers] = useState(Math.max(smin, Math.min(smax, 10_000)));
  const [tier, setTier] = useState<number>(available.length ? available[available.length - 1].tier : 0);
  if (!regions.length || region === undefined) return <Empty>{t('We govern no region to recruit in.')}</Empty>;
  const ut = obs.catalog.unit_tiers.find((x) => x.tier === tier);
  const room = obs.civ.recruit_room;
  const why = !ut ? t('No formation type is available') : !ut.available ? t('This formation type is not yet available') : soldiers < smin || soldiers > smax ? t('A formation is {min} to {max} soldiers', { min: int(smin), max: int(smax) }) : room !== undefined && soldiers > room ? t('At most {n} more people would currently serve', { n: int(room) }) : null;
  const roleName = (r: Role) => {
    const named = ut?.role_names.find((x) => x[0] === r)?.[1];
    return named ? tc(named) : t(ROLE_LABEL[r]);
  };
  const submit = async () => {
    const rec = await act({ kind: 'start_project', spec: { kind: 'recruit', region, role, soldiers, tier }, priority: null }, 'recruit');
    if (rec.length && rec.every((x) => x.status === 'accepted')) onDone();
  };
  return (
    <div class="card form recruit-form" data-testid="recruit-form">
      <b class="detail-title">{t('Raise a formation')}</b>
      <div class="form-row">
        <Field label={t('Region')}><Select value={region} options={regions.map((r) => ({ value: r.id, label: t('{name} ({n} working age)', { name: r.name, n: peopleNum(r.own!.working_age) }) }))} onChange={(v) => setRegion(v)} label={t('Recruiting region')} testid="recruit-region" /></Field>
        <Field label={t('Type')}><Select value={tier} options={obs.catalog.unit_tiers.map((x) => ({ value: x.tier, label: tierName(x, x.tier), disabled: !x.available }))} onChange={(v) => setTier(v)} label={t('Formation type')} /></Field>
      </div>
      <div class="field">
        <span class="field-label">{t('Role')}</span>
        <div class="segmented" role="radiogroup" aria-label={t('Role')}>
          {ROLES.map((r) => (
            <button type="button" role="radio" aria-checked={role === r} class={cx('seg', role === r && 'is-active')} title={t(ROLE_HINT[r])} data-testid={`role-${r}`} onClick={() => setRole(r)}>
              <RoleMark role={r} /> {roleName(r)}
            </button>
          ))}
        </div>
        <span class="field-hint">{t('{role}: {hint}.', { role: t(ROLE_LABEL[role]), hint: lc(ROLE_HINT[role]) })}</span>
      </div>
      <Field label={t('Soldiers')} hint={room !== undefined ? t('Soldiers leave the workforce while they serve. About {n} more people would currently agree to serve; custom, institutions and danger change that.', { n: peopleNum(room) }) : t('Soldiers leave the workforce while they serve.')}>
        <NumInput value={soldiers} min={smin} max={smax} step={1000} unit={t('soldiers')} label={t('Soldiers')} width={110} onChange={setSoldiers} testid="recruit-soldiers" />
      </Field>
      {ut ? <p class="total-line">{tx('Equipment: {equipment} · upkeep {upkeep} · {months} training', {
        // catalog equipment and upkeep are per thousand soldiers
        equipment: <GoodsList items={[...ut.equipment, ...(role === 'maneuver' ? ut.maneuver_extra ?? [] : [])].map((g) => ({ good: g.good, amount: Math.round((g.amount * soldiers) / 1000) }))} empty={t('none')} />,
        upkeep: <GoodsList items={ut.upkeep.map((g) => ({ good: g.good, amount: Math.round((g.amount * soldiers) / 1000) }))} per={t('each month')} empty={t('none')} />,
        months: fmtMonths(ut.training_months),
      })}</p> : null}
      <div class="form-actions">
        <Btn kind="primary" icon="military" why={why} disabled={s.busy} testid="recruit-submit" onClick={() => void submit()}>{t('Order recruitment')}</Btn>
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
  const tier = obs.catalog.unit_tiers.find((x) => x.tier === a.tier);
  const mergeable = obs.armies.filter((b) => b.id !== a.id && b.region === a.region && b.tier === a.tier);
  const ownIds = obs.regions.filter((r) => r.own && r.id !== a.region).map((r) => r.id);
  const foreignIds = obs.regions.filter((r) => !r.own || (r.controller !== null && r.controller !== obs.seat)).map((r) => r.id);
  const order = (o: Parameters<typeof issue>[0]) => issue(o);
  const roleName = (r: Role) => {
    const named = tier?.role_names.find((x) => x[0] === r)?.[1];
    return named ? tc(named) : t(ROLE_LABEL[r]);
  };
  function issue(o: { kind: 'hold' } | { kind: 'move'; to: RegionId } | { kind: 'attack'; region: RegionId } | { kind: 'disband' } | { kind: 'merge'; into: number }) {
    return act({ kind: 'military_order', army: a.id, order: o }, 'army');
  }
  return (
    <div class={cx('card army', a.in_battle && 'is-battle')} data-testid="army-card">
      <div class="project-top">
        <div>
          <span class="kicker">{tierName(tier, a.tier)} · <RegionLink id={a.region} /></span>
          <b class="project-title">{tc(a.name)}</b>
        </div>
        {a.in_battle ? <Badge tone="bad" icon="warn">{t('In battle')}</Badge> : a.training_months_left > 0 ? <Badge tone="gold" icon="clock">{t('Training · {months} left', { months: fmtMonths(a.training_months_left) })}</Badge> : null}
      </div>
      <ul class="army-roles">
        {a.soldiers.map(([role, n]) => (
          <li class={n === 0 ? 'is-zero' : undefined}><RoleMark role={role} /> <b>{peopleNum(n)}</b> <span>{roleName(role)}</span></li>
        ))}
        <li class="army-total">{tx('{n} soldiers', { n: <b>{peopleNum(total)}</b> })}</li>
      </ul>
      <div class="mini-meters three">
        <div class="mini-meter"><span class="mini-label">{t('Proficiency')}</span><Meter value={a.proficiency_bp} max={10000} tone={toneOfBp(a.proficiency_bp, 7000, 4000)} height={6} label={t('Proficiency {pct}', { pct: pct(a.proficiency_bp) })} /><span class="mini-val">{pct(a.proficiency_bp)}</span></div>
        <div class="mini-meter"><span class="mini-label">{t('Supply')}</span><Meter value={a.supply_bp} max={10000} tone={toneOfBp(a.supply_bp, 8000, 5000)} height={6} label={t('Supply {pct}', { pct: pct(a.supply_bp) })} /><span class="mini-val">{pct(a.supply_bp)}</span></div>
        <div class="mini-meter"><span class="mini-label">{t('Morale')}</span><Meter value={a.morale_bp} max={10000} tone={toneOfBp(a.morale_bp, 7000, 4000)} height={6} label={t('Morale {pct}', { pct: pct(a.morale_bp) })} /><span class="mini-val">{pct(a.morale_bp)}</span></div>
      </div>
      <p class="army-order"><span class="kicker">{t('Order')}</span> {ORDER_LABEL[a.order] ? t(ORDER_LABEL[a.order]) : a.order}{a.target !== null ? <> → <RegionLink id={a.target} /></> : null}</p>
      <div class="order-controls" role="group" aria-label={t('Orders for {name}', { name: tc(a.name) })}>
        <Btn small pressed={a.order === 'hold'} disabled={s.busy} testid="order-hold" onClick={() => void order({ kind: 'hold' })}>{t('Hold')}</Btn>
        <Btn small pressed={a.order === 'move'} disabled={s.busy} why={ownIds.length ? null : t('No other governed region to move to')} testid="order-move"
          onClick={() => startPick({ prompt: t('Move {name}: choose a governed or friendly region', { name: tc(a.name) }), targets: null, onPick: (id) => { cancelPick(); void order({ kind: 'move', to: id }); } })}>{t('Move…')}</Btn>
        <Btn small pressed={a.order === 'attack'} disabled={s.busy} why={foreignIds.length ? null : t('No region outside our control is known')} testid="order-attack"
          onClick={() => startPick({ prompt: t('Attack with {name}: choose a region to enter and contest. Against another civilization this is war.', { name: tc(a.name) }), targets: foreignIds, onPick: (id) => { cancelPick(); void order({ kind: 'attack', region: id }); } })}>{t('Attack…')}</Btn>
        {mergeable.length ? (
          <Select value={0} label={t('Merge into')} options={[{ value: 0, label: t('Merge into…') }, ...mergeable.map((b) => ({ value: b.id, label: tc(b.name) }))]} onChange={(v) => { if (v) void order({ kind: 'merge', into: v }); }} />
        ) : null}
        {confirm ? (
          <>
            <Btn small kind="danger" disabled={s.busy} onClick={() => { setConfirm(false); void order({ kind: 'disband' }); }}>{t('Disband now')}</Btn>
            <Btn small kind="ghost" onClick={() => setConfirm(false)}>{t('Keep')}</Btn>
          </>
        ) : <Btn small kind="ghost" title={t('Soldiers return to civilian life; equipment is not recovered')} onClick={() => setConfirm(true)}>{t('Disband…')}</Btn>}
      </div>
      {!mergeable.length && obs.armies.length > 1 ? <Why>{t('Merging needs another formation of the same tier in the same region.')}</Why> : null}
    </div>
  );
}
