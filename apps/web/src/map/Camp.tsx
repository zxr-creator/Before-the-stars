// Raider camps and scouts on the region card (bts-protocol/2.4). A camp is shown only where this
// seat has sighted it, as bands never counts, and as last seen.
import { useState } from 'preact/hooks';
import type { CampView, Good, Observation, RegionView } from '../protocol';
import { GOOD_SHORT, fmtYear, lc, range } from '../format';
import { t, tc, useLocale } from '../i18n';
import { ActionNote, Badge, Btn, Est, Field, NumInput, Section, Select } from '../ui';
import { act, useApp } from '../store';

const TAG = 'camp';

export function CampCard({ obs, r, camp }: { obs: Observation; r: RegionView; camp: CampView }) {
  useLocale();
  const s = useApp();
  const [paying, setPaying] = useState(false);
  const mine = obs.armies.filter((a) => a.training_months_left === 0 && !a.in_battle);
  const stocked = obs.civ.goods.filter((g) => g.stock > 0);
  const [good, setGood] = useState<Good>(stocked.find((g) => g.good === 'food')?.good ?? stocked[0]?.good ?? 'food');
  const [amount, setAmount] = useState(10);
  const [years, setYears] = useState(5);
  const until = camp.tribute_until ?? null;
  const send = (army: number) => void act({ kind: 'military_order', army, order: { kind: 'attack', region: r.id } }, TAG);
  return (
    <Section title={t('Raider camp')} aside={<small class="muted">{t('seen in {year}', { year: fmtYear(camp.seen) })}</small>}>
      <div data-testid="camp-card">
        <p><b>{tc(camp.name)}</b></p>
        <dl class="kvs">
          <div class="kv"><dt>{t('People')}</dt><dd><Est>{range(camp.people_low, camp.people_high)}</Est></dd></div>
          <div class="kv"><dt>{t('Warriors')}</dt><dd><Est>{range(camp.warriors_low, camp.warriors_high)}</Est></dd></div>
          {until !== null ? <div class="kv"><dt>{t('Tribute')}</dt><dd><Badge tone="ok" icon="check">{t('paid until {year}', { year: fmtYear(until) })}</Badge></dd></div> : null}
        </dl>
        <p class="muted small">{t('Estimates from our own sightings, in bands; the camp may have changed since.')}</p>
        <div class="quick-actions">
          <Btn small icon="sword" testid="camp-clear" why={!mine.length ? t('No formation is ready to send') : mine.length > 1 ? t('Choose the formation to send below') : null} onClick={() => send(mine[0].id)}>{t('Clear the camp')}</Btn>
          <Btn small icon="seal" testid="camp-tribute" pressed={paying} onClick={() => setPaying(!paying)}>{t('Pay tribute')}</Btn>
        </div>
        {mine.length > 1 ? (
          <Field label={t('Send formation')}>
            <Select value={0} label={t('Send formation')} testid="camp-army" options={[{ value: 0, label: t('Choose…') }, ...mine.map((a) => ({ value: a.id, label: tc(a.name) }))]} onChange={(v) => { if (v) send(v); }} />
          </Field>
        ) : null}
        <div class="quick-actions">
          <span class="muted small">{t('Survivors of a camp we break:')}</span>
          <Btn small kind="ghost" testid="camp-subjects" onClick={() => void act({ kind: 'set_policy', setting: { kind: 'camp_policy', subjugate: true } }, TAG)}>{t('become subjects')}</Btn>
          <Btn small kind="ghost" testid="camp-refugees" onClick={() => void act({ kind: 'set_policy', setting: { kind: 'camp_policy', subjugate: false } }, TAG)}>{t('become refugees')}</Btn>
        </div>
        {paying ? (
          <div class="card form" data-testid="camp-tribute-form">
            <div class="form-row">
              <Field label={t('Goods')}><Select value={good} label={t('Goods')} options={stocked.map((g) => ({ value: g.good, label: GOOD_SHORT[g.good] ? t(GOOD_SHORT[g.good]) : g.good }))} onChange={setGood} /></Field>
              <Field label={t('Amount (thousand base units)')}><NumInput value={amount} min={1} max={1_000_000} label={t('Amount')} onChange={setAmount} /></Field>
              <Field label={t('Years')}><NumInput value={years} min={1} max={20} label={t('Years')} width={60} onChange={setYears} /></Field>
            </div>
            <Btn kind="primary" disabled={s.busy || !stocked.length} testid="camp-tribute-send"
              onClick={() => void act({ kind: 'set_policy', setting: { kind: 'tribute', region: r.id, goods: [{ good, amount: amount * 1000 }], years } }, TAG)}>
              {t('Pay {name} for {n} years', { name: lc(GOOD_SHORT[good] ? t(GOOD_SHORT[good]) : good), n: years })}
            </Btn>
          </div>
        ) : null}
        <ActionNote tag={TAG} />
      </div>
    </Section>
  );
}

/** Send a scout party (300 people) to chart this region and its neighbours. */
export function ScoutButton({ obs, r }: { obs: Observation; r: RegionView }) {
  useLocale();
  const busy = obs.projects.some((p) => p.kind === 'scout' && p.region === r.id);
  return (
    <>
      <Btn small icon="compass" testid="qa-scout" why={busy ? t('A scout party is already on its way here') : null}
        title={t('A party of 300 people charts this region and its neighbours')}
        onClick={() => void act({ kind: 'start_project', spec: { kind: 'scout', region: r.id }, priority: null }, 'inspector')}>
        {t('Send scouts')}
      </Btn>
    </>
  );
}
