// Domestic politics: stability, administrative reach, factions and authority.
import { useState } from 'preact/hooks';
import { int, pct, tn } from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { ActionNote, Btn, Empty, Meter, SeatDot, Section, Select, Stat, cx } from '../ui';
import { act, civColor, civName, regionName, setDelegates, useApp } from '../store';
import { titleCase } from '../format';

export function PoliticsPanel() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const civ = obs.civ;
  const [name, setName] = useState(civ.name);
  const over = civ.admin_load > civ.admin_capacity;
  const stabTone = civ.stability >= 60 ? 'ok' : civ.stability >= 35 ? 'warn' : 'bad';
  const stabWord = civ.stability >= 75 ? t('Settled') : civ.stability >= 60 ? t('Steady') : civ.stability >= 35 ? t('Strained') : t('Close to breaking');
  const own = obs.regions.filter((r) => r.own);
  const factions = civ.factions.slice().sort((a, b) => b.weight_bp - a.weight_bp);
  return (
    <div class="panel politics">
      <p class="panel-lede">{t('Who can help or obstruct this plan?')}</p>

      <Section title={t('State of the polity')}>
        <div class="stat-row">
          <Stat label={t('Stability')} value={civ.stability} unit="/ 100" tone={stabTone} sub={stabWord} />
          <Stat label={t('Administration')} value={`${civ.admin_load} / ${civ.admin_capacity}`} unit={t('regions')} tone={over ? 'bad' : undefined} sub={over ? t('over-stretched') : t('load / capacity')} title={t('Regions governed against the number the administration can carry')} />
          <Stat label={t('Call-up cap')} value={pct(civ.mobilization_cap_bp)} sub={t('of non-food labour')} />
        </div>
        <div class="politics-meters">
          <div class="mini-meter"><span class="mini-label">{t('Stability')}</span><Meter value={civ.stability} max={100} tone={stabTone} height={8} label={t('Stability {n} of 100', { n: civ.stability })} /><span class="mini-val">{civ.stability}</span></div>
          <div class="mini-meter"><span class="mini-label">{t('Admin load')}</span><Meter value={civ.admin_load} max={Math.max(civ.admin_capacity, civ.admin_load, 1)} tone={over ? 'bad' : 'accent'} mark={over ? civ.admin_capacity / civ.admin_load : undefined} height={8} label={t('Administrative load {n} of {total}', { n: civ.admin_load, total: civ.admin_capacity })} /><span class="mini-val">{civ.admin_load}/{civ.admin_capacity}</span></div>
        </div>
        {over ? <p class="note is-bad"><Icon name="warn" size={12} /> {t('The administration governs more regions than it can carry. Expect unrest and lost output until capacity grows or territory is shed.')}</p> : null}
      </Section>

      <Section title={t('Factions')} aside={<small class="muted">{t('share of organised adults · cooperation 0–100')}</small>}>
        {factions.length === 0 ? <Empty>{t('No organised interests are recorded.')}</Empty> : (
          <ul class="faction-list">
            {factions.map((f) => {
              const tone = f.support >= 60 ? 'ok' : f.support >= 35 ? 'warn' : 'bad';
              return (
                <li class="card faction" data-testid="faction">
                  <div class="row-between"><b class="detail-title">{tc(f.name)}</b><span class="faction-weight"><b>{pct(f.weight_bp)}</b> <small class="muted">{t('of organised adults')}</small></span></div>
                  <p class="muted small">{tc(f.description)}</p>
                  <div class="mini-meter"><span class="mini-label">{t('Cooperation')}</span><Meter value={f.support} max={100} tone={tone} height={7} label={t('Cooperation {n} of 100', { n: f.support })} /><span class={cx('mini-val', tone === 'bad' && 'neg')}>{f.support}</span></div>
                  <p class="faction-demand"><span class="kicker">{t('Asks for')}</span> {tc(f.demand)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t('Authority')}>
        <dl class="kvs">
          <div class="kv"><dt>{t('Overlord')}</dt><dd>{civ.overlord === null ? <span class="muted">{t('None — we answer to no higher authority')}</span> : <><SeatDot color={civColor(obs, civ.overlord)} /> {tc(civName(obs, civ.overlord))}</>}</dd></div>
          <div class="kv"><dt>{t('Subordinates')}</dt><dd>{civ.subordinates.length ? civ.subordinates.map((x, i) => <span>{i ? (isZh() ? '、' : ', ') : ''}<SeatDot color={civColor(obs, x)} /> {tc(civName(obs, x))}</span>) : <span class="muted">{t('None')}</span>}</dd></div>
          <div class="kv"><dt>{t('Regions governed')}</dt><dd>{int(own.length)}</dd></div>
        </dl>
      </Section>

      {(s.summary?.steward_domains ?? []).length ? <Stewards /> : null}

      <Section title={t('Government')}>
        <div class="form">
          <label class="field"><span class="field-label">{t('Name of the civilization')}</span>
            <span class="row">
              <input class="text" type="text" maxLength={32} value={name} data-testid="rename-input" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              <Btn small disabled={s.busy || !name.trim() || name.trim() === civ.name} testid="rename-submit" onClick={() => void act({ kind: 'set_policy', setting: { kind: 'rename', name: name.trim() } }, 'government')}>{t('Rename')}</Btn>
            </span>
            <span class="field-hint">{t('Cosmetic. History keeps the names used at the time.')}</span>
          </label>
          <label class="field"><span class="field-label">{t('Capital')}</span>
            <Select value={civ.capital} label={t('Capital')} options={own.map((r) => ({ value: r.id, label: r.name }))}
              onChange={(v) => { if (v !== civ.capital) void act({ kind: 'set_policy', setting: { kind: 'move_capital', region: v } }, 'government'); }} />
            <span class="field-hint">{t('Currently {region}. Reforms and central projects are carried out at the capital.', { region: regionName(obs, civ.capital) })}</span>
          </label>
          <ActionNote tag="government" />
        </div>
      </Section>
    </div>
  );
}

/** Delegation of whole domains to a steward (the native Medium policy acting on this seat's own observation). */
function Stewards() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const domains = s.summary?.steward_domains ?? [];
  const current = s.summary?.seats?.find((x) => x.seat === obs.seat)?.delegates ?? [];
  const [picked, setPicked] = useState<string[]>(current);
  const changed = picked.slice().sort().join(',') !== current.slice().sort().join(',');
  const toggle = (d: string) => setPicked(picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d]);
  return (
    <Section title={t('Stewards')} aside={<small class="muted">{current.length ? tn(current.length, '{n} domain delegated', '{n} domains delegated', { n: current.length }) : t('none appointed')}</small>}>
      <p class="muted small">{t('A steward runs a whole domain for you with the same information and the same actions you have. It acts once a round, at the end of planning, and its orders appear among your receipts. Diplomacy is never delegated.')}</p>
      <ul class="contact-list" data-testid="stewards">
        {domains.map((d) => (
          <li>
            <label class={cx('contact', picked.includes(d) && 'is-on')}>
              <input type="checkbox" checked={picked.includes(d)} data-testid={`steward-${d}`} onChange={() => toggle(d)} />
              <b>{titleCase(d)}</b>
              <span class="contact-state">{current.includes(d) ? t('steward in charge') : t('you decide')}</span>
            </label>
          </li>
        ))}
      </ul>
      <div class="form-actions">
        <Btn small kind="primary" disabled={!changed || s.busy || obs.phase === 'finished'} testid="stewards-apply" onClick={() => void setDelegates(picked)}>{t('Apply')}</Btn>
        {current.length ? <Btn small kind="ghost" disabled={s.busy} onClick={() => { setPicked([]); void setDelegates([]); }}>{t('Dismiss all')}</Btn> : null}
      </div>
    </Section>
  );
}
