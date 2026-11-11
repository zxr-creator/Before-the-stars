// Eras, charters and traditions (design chapter 37, sections 3-4), prepared ahead of the
// engine: the top-bar banner and the era screen render from the optional `era` and
// `traditions` fields of the observation and render nothing while the referee does not
// send them. Names and effects of charters come from the referee; the seven traditions'
// names are the client's (trees/tables.ts), keyed by their path.
import type { Observation, TraditionSlotView } from '../protocol';
import { fmtDate, int, pct, tcChecks } from '../format';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Meter, Why, cx } from '../ui';
import { act, closeOverlay, openOverlay, useApp } from '../store';
import { t, tc, useLocale } from '../i18n';
import { OverlayFrame, StatePlate } from '../theme/overlay';
import { ERA_NAMES, TRADITIONS, traditionByKey } from '../trees/tables';
import './era.css';

export const eraName = (e: number) => t(ERA_NAMES[e] ?? String(e));

/** Whether the observation carries any era data at all. */
export function hasEra(obs: Observation | null | undefined): boolean {
  return !!obs && (!!obs.era || !!obs.traditions?.length);
}

const SLOT_LABEL: Record<string, string> = { machine: 'Machine tradition', frontier: 'Frontier tradition' };

/** The era chip in the top bar: nothing until the referee sends an era. */
export function EraBanner({ obs }: { obs: Observation }) {
  useLocale();
  const e = obs.era;
  if (!e) return null;
  const held = (obs.traditions ?? []).map((s) => traditionByKey(s.path)).filter((x): x is NonNullable<typeof x> => !!x);
  const age = e.age?.kind;
  return (
    <button type="button" class={cx('era-banner', age && 'is-' + age, e.transition && 'is-transition')} data-testid="era-banner" onClick={() => openOverlay('era')}
      title={t('{era} era since {date}. Open the era screen.', { era: eraName(e.era), date: fmtDate(e.since) })}>
      <span class="era-banner-mark" aria-hidden="true">{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][e.era] ?? e.era + 1}</span>
      <span class="era-banner-text">
        <b>{t('{era} era', { era: eraName(e.era) })}</b>
        <small>
          {age === 'golden' ? t('Golden age') : age === 'dark' ? t('Dark age') : e.transition ? t('Transition: stability −{n}', { n: e.transition.strain }) : held.length ? held.map((x) => t(x.genre)).join(' · ') : t('since {date}', { date: fmtDate(e.since) })}
        </small>
      </span>
      {e.can_choose_charter ? <span class="era-banner-dot" title={t('A charter can be chosen')} /> : null}
    </button>
  );
}

function TraditionSlot({ slot, busy }: { slot: TraditionSlotView; busy: boolean }) {
  const held = traditionByKey(slot.path);
  const switching = slot.switching ? traditionByKey(slot.switching.path) : undefined;
  return (
    <section class="era-slot" data-testid={`tradition-slot-${slot.slot}`}>
      <header>
        <h4>{t(SLOT_LABEL[slot.slot] ?? slot.slot)}</h4>
        {held ? <Badge tone="gold" icon="flag">{t('{genre} ({name})', { genre: t(held.genre), name: t(held.name) })}</Badge> : <Badge tone="muted">{slot.offered ? t('Unaligned') : t('Not yet offered')}</Badge>}
      </header>
      {held ? (
        <div class="progress-line">
          <Meter value={slot.mastery_bp} max={10000} tone="gold" label={t('Mastery {pct}', { pct: pct(slot.mastery_bp) })} />
          <span class="progress-num"><b>{pct(slot.mastery_bp)}</b> <small>{t('mastery')}</small></span>
        </div>
      ) : null}
      {switching ? <p class="note is-warn"><Icon name="clock" size={12} /> {t('Switching to {name}{until}.', { name: t(switching.name), until: slot.switching?.until ? ' ' + t('until {date}', { date: fmtDate(slot.switching.until) }) : '' })}</p> : null}
      {!slot.offered ? <p class="muted small">{slot.slot === 'machine' ? t('Offered on entering the Industrial era.') : t('Offered on entering the Information era.')}</p> : (
        <ul class="era-paths">
          {slot.options.map((o) => {
            const tr = traditionByKey(o.path);
            if (!tr) return null;
            const isHeld = o.path === slot.path;
            return (
              <li class={cx('era-path', 'path-' + tr.key, isHeld && 'is-held', !o.available && 'is-off')}>
                <span class="era-path-genre">{t(tr.genre)}</span>
                <b>{t(tr.name)}</b>
                {isHeld ? <Badge tone="gold" icon="check">{t('Held')}</Badge> : (
                  <Btn small kind={slot.path ? 'default' : 'primary'} disabled={busy} why={!o.available ? tc(o.reason ?? '') || t('Not available now') : null} testid={`choose-tradition-${tr.key}`}
                    onClick={() => void act({ kind: 'choose_tradition', slot: slot.slot, path: o.path }, 'era')}>{slot.path ? t('Switch') : t('Choose')}</Btn>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {slot.path && slot.offered ? <p class="muted small">{t('Switching path is a tradition reform: long, costly and unsettling. A slot may also stay Unaligned for ever.')}</p> : null}
    </section>
  );
}

/** The era screen: where the seat stands on the ladder, its charter and its traditions. */
export function EraScreen() {
  useLocale();
  const s = useApp();
  const obs = s.obs;
  if (!obs || !hasEra(obs)) {
    return (
      <OverlayFrame icon="hourglass" title={t('Era and traditions')} testid="overlay-era">
        <StatePlate icon="hourglass" title={t('No era information yet')}>{t('Eras, charters and traditions appear here once the referee reports them.')}</StatePlate>
      </OverlayFrame>
    );
  }
  const e = obs.era;
  return (
    <OverlayFrame icon="hourglass" title={t('Era and traditions')} kicker={t('Where {name} stands', { name: tc(obs.civ.name) })} testid="overlay-era" class="era-overlay">
      <div class="era-body">
        {e ? (
          <section class="era-ladder" data-testid="era-ladder" aria-label={t('Era ladder')}>
            <ol>
              {ERA_NAMES.slice(0, Math.max(e.era + 2, e.next ? e.next.era + 1 : 0)).map((_, i) => (
                i > 8 && e.era < 9 && e.next?.era !== 9 ? null : (
                  <li class={cx(i < e.era && 'is-done', i === e.era && 'is-now', e.next && i === e.next.era && 'is-next')}>
                    <span class="era-dot">{i < e.era ? <Icon name="check" size={11} /> : i + 1}</span>
                    <span>{eraName(i)}</span>
                  </li>
                )
              ))}
            </ol>
          </section>
        ) : null}
        <div class="era-cols">
          {e ? (
            <div class="era-col">
              <section class="era-card">
                <h3>{t('{era} era', { era: eraName(e.era) })}</h3>
                <p class="muted">{t('Entered {date}', { date: fmtDate(e.since) })}</p>
                {e.age ? <p class={cx('note', e.age.kind === 'golden' ? 'is-ok' : 'is-bad')}><Icon name={e.age.kind === 'golden' ? 'sun' : 'warn'} size={12} /> {e.age.kind === 'golden' ? t('A golden age, until {date}.', { date: fmtDate(e.age.until) }) : t('A dark age, until {date}. Reforms and tradition switches cost half.', { date: fmtDate(e.age.until) })}</p> : null}
                {e.transition ? (
                  <div class="era-transition" data-testid="era-transition">
                    <p><b>{t('Transition')}</b> · {t('until {date}', { date: fmtDate(e.transition.until) })} · {t('stability −{n} in every region', { n: e.transition.strain })}</p>
                    {e.transition.score !== null && e.transition.score !== undefined ? <p>{t('Score so far: {n} of 100 (75 or more brings a golden age; under 40 a dark age).', { n: int(e.transition.score) })}</p> : null}
                    {e.transition.parts?.length ? (
                      <ul class="era-parts">{e.transition.parts.map((p) => <li><span>{tc(p.label)}</span><Meter value={p.points} max={Math.max(1, p.max)} tone="gold" height={6} /><b>{p.points}/{p.max}</b></li>)}</ul>
                    ) : null}
                  </div>
                ) : null}
              </section>
              {e.next ? (
                <section class="era-card">
                  <h4>{t('Next: the {era} era', { era: eraName(e.next.era) })}</h4>
                  <Checklist items={tcChecks(e.next.conditions)} />
                </section>
              ) : null}
            </div>
          ) : null}
          {e?.charters?.length ? (
            <div class="era-col">
              <section class="era-card" data-testid="era-charters">
                <h4>{t('Era charter')}</h4>
                <p class="muted small">{t('One charter per era (two in a golden age): a bounded advantage with a stated cost. Changing it within the era unsettles the polity.')}</p>
                <ul class="era-charters">
                  {e.charters.map((c) => (
                    <li class={cx('era-charter', c.held && 'is-held')}>
                      <b>{tc(c.name)}</b>
                      <p><Icon name="good" size={11} /> {tc(c.effect)}</p>
                      <p class="neg"><Icon name="warn" size={11} /> {tc(c.cost)}</p>
                      {c.held ? <Badge tone="gold" icon="check">{t('In force')}</Badge> : (
                        <Btn small kind="primary" disabled={s.busy} why={e.can_choose_charter ? null : tc(e.charter_note ?? '') || t('A charter cannot be chosen now')} testid={`choose-charter-${c.key}`}
                          onClick={() => void act({ kind: 'choose_charter', charter: c.key }, 'era')}>{t('Adopt charter')}</Btn>
                      )}
                    </li>
                  ))}
                </ul>
                {e.charter_note && e.can_choose_charter ? <Why>{tc(e.charter_note)}</Why> : null}
              </section>
            </div>
          ) : null}
          {obs.traditions?.length ? (
            <div class="era-col">
              {obs.traditions.map((slot) => <TraditionSlot slot={slot} busy={s.busy} />)}
            </div>
          ) : null}
        </div>
        <ActionNote tag="era" />
        <p class="muted small era-foot">{t('Traditions: {list}.', { list: TRADITIONS.map((x) => t('{genre} ({name})', { genre: t(x.genre), name: t(x.name) })).join(' · ') })}</p>
        <p class="era-close"><button type="button" class="linklike" onClick={closeOverlay}>{t('Back to the map')}</button></p>
      </div>
    </OverlayFrame>
  );
}
