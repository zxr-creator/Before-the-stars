// Eras, charters and traditions (design chapter 37, sections 3-4): the top-bar banner and the
// era screen render the referee's `era` field (bts-protocol/2.2). Everything the referee words
// (charter effects, tradition descriptions, conditions) is shown as sent; the client only adds
// the era and tradition names it already carries (trees/tables.ts), keyed by their path.
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import type { EraView, Observation, TraditionOption, TraditionView } from '../protocol';
import { PUNK, isPunkStyle, styleOfEra, styleOfTradition, styleOfTraditions, type PunkLook, type PunkStyle } from '../map/punk';
import { drawPunkBanner } from '../map/punkart';
import { fmtDate, fmtMonths, int, pct, tcChecks } from '../format';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Meter, Why, cx } from '../ui';
import { act, closeOverlay, openOverlay, useApp } from '../store';
import { t, tc, useLocale } from '../i18n';
import { OverlayFrame, StatePlate } from '../theme/overlay';
import { ERA_NAMES, TRADITIONS, traditionByKey } from '../trees/tables';
import './era.css';

export const eraName = (e: number) => t(ERA_NAMES[e] ?? String(e));

/** "Steampunk (Coal and Steam)" for a tradition key, or the key itself when unknown. */
export function traditionLabel(key: string): string {
  const tr = traditionByKey(key);
  return tr ? t('{genre} ({name})', { genre: t(tr.genre), name: t(tr.name) }) : key;
}

/** Whether the observation carries any era data at all. */
export function hasEra(obs: Observation | null | undefined): boolean {
  return !!obs && !!obs.era;
}

const SLOT_LABEL: Record<string, string> = { machine: 'Machine tradition', frontier: 'Frontier tradition' };

/**
 * The name of a seat's own age as its traditions colour it (ruleset 3.1): "Age of Steam" for a
 * Steampunk seat; null where no tradition is held (the plain era name is the title then).
 */
export function ageNameOf(e: EraView | null | undefined): string | null {
  if (!e) return null;
  const style = styleOfEra(e);
  if (e.age_name && e.age_name !== e.name && style) return tc(e.age_name);
  return style ? t(PUNK[style].age) : null;
}

/** The age a met civilization's held traditions name, from their public keys. */
export function ageOfTraditions(keys: readonly string[] | null | undefined): string | null {
  const style = styleOfTraditions(keys);
  return style ? t(PUNK[style].age) : null;
}

/** The style's palette as CSS custom properties, for anything dressed in a path's colours. */
function punkVars(L: PunkLook): JSX.CSSProperties {
  return { '--punk-wall': L.wall, '--punk-roof': L.roof, '--punk-accent': L.accent, '--punk-glow': L.glow, '--punk-metal': L.metal, '--punk-ground': L.ground } as JSX.CSSProperties;
}

/** A style's skyline, drawn by the atlas's own art: the banner of the era screen and the thumbnails of the paths. */
export function PunkBanner({ style, owner, height = 96, class: cls }: { style: PunkStyle; owner: string; height?: number; class?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => drawPunkBanner(c, style, owner, Math.max(60, c.clientWidth), height);
    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [style, owner, height]);
  return <canvas ref={ref} class={cx('punk-banner', cls)} style={{ height: height + 'px' }} aria-hidden="true" data-style={style} />;
}

/** The era chip in the top bar: nothing until the referee sends an era. */
export function EraBanner({ obs }: { obs: Observation }) {
  useLocale();
  const e = obs.era;
  if (!e) return null;
  const held = e.traditions.map((x) => traditionByKey(x.held)).filter((x): x is NonNullable<typeof x> => !!x);
  const age = e.age?.kind;
  const left = e.transition ? Math.max(0, e.transition.end - obs.month) : 0;
  const canCharter = e.charter_slots > 0 && e.charters.some((c) => c.available && !c.held) && e.charters.filter((c) => c.held).length < e.charter_slots;
  // ruleset 3.1: a held tradition names the age and dresses the banner in its colours
  const style = styleOfEra(e);
  const ageName = ageNameOf(e);
  const plain = t('{era} era', { era: eraName(e.era) });
  const state = e.transition ? t('Crossing: stability −{n} · {left} left', { n: e.transition.strain, left: fmtMonths(left) })
    : age === 'golden' ? t('Golden age') : age === 'dark' ? t('Dark age')
    : e.next?.eligible ? t('Ready to enter the {era} era', { era: eraName(e.next.era) })
    : null;
  return (
    <button type="button" class={cx('era-banner', age && 'is-' + age, e.transition && 'is-transition', style && 'is-punk', style && 'punk-' + style)} data-testid="era-banner" data-style={style ?? ''} onClick={() => openOverlay('era')}
      style={style ? punkVars(PUNK[style]) : undefined}
      title={t('{era} era since {date}. Open the era screen.', { era: eraName(e.era), date: fmtDate(e.since) })}>
      <span class="era-banner-mark" aria-hidden="true">{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][e.era] ?? e.era + 1}</span>
      <span class="era-banner-text">
        <b data-testid="era-banner-title">{ageName ?? plain}</b>
        <small>
          {ageName ? <>{plain}{state ? ' · ' + state : ''}</>
            : state ?? (held.length ? held.map((x) => t(x.genre)).join(' · ') : t('since {date}', { date: fmtDate(e.since) }))}
        </small>
      </span>
      {canCharter || e.next?.eligible ? <span class="era-banner-dot" title={e.next?.eligible ? t('The next era can be entered') : t('A charter can be chosen')} /> : null}
    </button>
  );
}

function OptionRow({ o, slot, busy, now, owner }: { o: TraditionOption; slot: TraditionView; busy: boolean; now: number; owner: string }) {
  const tr = traditionByKey(o.key);
  const reforming = slot.reform_to !== null;
  const waitUntil = slot.switch_allowed_from > now ? slot.switch_allowed_from : 0;
  const switching = slot.held !== null;
  const why = reforming ? t('A tradition reform is already under way in this slot')
    : switching && waitUntil ? t('Another switch is allowed from {date}', { date: fmtDate(waitUntil) }) : null;
  const style = isPunkStyle(o.style) ? o.style : styleOfTradition(o.key);
  const L = style ? PUNK[style] : null;
  const effects = o.effects ?? [];
  const ageName = o.age_name ? tc(o.age_name) : L ? t(L.age) : null;
  return (
    <li class={cx('era-path', 'path-' + o.key, o.held && 'is-held', slot.reform_to === o.key && 'is-reform', L && 'is-punk')} data-testid={`tradition-option-${o.key}`} data-style={style ?? ''} style={L ? punkVars(L) : undefined}>
      {style ? <PunkBanner style={style} owner={owner} height={66} class="era-path-art" /> : null}
      <span class="era-path-genre">{ageName ?? (tr ? t(tr.genre) : tc(o.name))}</span>
      <b>{tc(o.name)}</b>
      <span class="era-path-sober">{tc(o.sober_name)}</span>
      {o.held ? <Badge tone="gold" icon="check">{t('Held')}</Badge> : slot.reform_to === o.key ? <Badge tone="warn" icon="clock">{t('Reform under way')}</Badge> : (
        <Btn small kind={switching ? 'default' : 'primary'} disabled={busy} why={why} testid={`choose-tradition-${o.key}`}
          onClick={() => void act({ kind: 'choose_tradition', slot: slot.slot, path: o.key }, 'era')}>{switching ? t('Switch') : t('Choose')}</Btn>
      )}
      <div class="era-path-detail">
        <p>{tc(o.description)}</p>
        {effects.length ? (
          <div class="era-effects" data-testid={`tradition-effects-${o.key}`}>
            <span class="mini-label">{t('At full strength')}</span>
            <ul>{effects.map((x) => <li><Icon name="good" size={11} /> {tc(x)}</li>)}</ul>
          </div>
        ) : null}
        <p class="muted small">{t('Favoured by: {text}', { text: tc(o.favoured_by) })}</p>
        {o.signature_works.length ? <p class="muted small">{t('Signature works: {list}', { list: o.signature_works.map(tc).join(', ') })}</p> : null}
        {o.exclusive_works.length ? <p class="muted small">{t('Exclusive works: {list}', { list: o.exclusive_works.map(tc).join(', ') })}</p> : null}
        {o.unit_variant ? <p class="muted small">{t('Unit variant: {name}', { name: tc(o.unit_variant) })}</p> : null}
        {o.drawbacks.length ? <ul class="era-drawbacks">{o.drawbacks.map((d) => <li class="neg"><Icon name="warn" size={11} /> {tc(d)}</li>)}</ul> : null}
      </div>
    </li>
  );
}

function TraditionSlot({ slot, busy, now, owner }: { slot: TraditionView; busy: boolean; now: number; owner: string }) {
  const held = traditionByKey(slot.held);
  const heldOpt = slot.options.find((o) => o.key === slot.held);
  const strength = slot.strength_bp;
  const branchTotal = slot.branch_total ?? 0;
  const branchKnown = slot.branch_known ?? 0;
  const reform = slot.options.find((o) => o.key === slot.reform_to);
  return (
    <section class="era-slot" data-testid={`tradition-slot-${slot.slot}`}>
      <header>
        <h4>{t(SLOT_LABEL[slot.slot] ?? slot.slot)}</h4>
        {held ? <Badge tone="gold" icon="flag">{t('{genre} ({name})', { genre: t(held.genre), name: t(held.name) })}</Badge> : heldOpt ? <Badge tone="gold" icon="flag">{tc(heldOpt.name)}</Badge> : <Badge tone="muted">{slot.offered ? t('Unaligned') : t('Not yet offered')}</Badge>}
      </header>
      {held || slot.held ? (
        <>
          {strength !== undefined ? (
            <div class="era-strength" data-testid={`tradition-strength-${slot.slot}`}>
              <div class="progress-line">
                <Meter value={strength} max={10000} tone="accent" label={t('Strength {pct}', { pct: pct(strength) })} />
                <span class="progress-num"><b>{pct(strength)}</b> <small>{t('strength')}</small></span>
              </div>
              <p class="muted small">{t('The path’s effects scale with its strength: a quarter for holding it, the rest from mastery and from its branch technologies understood.')}</p>
            </div>
          ) : null}
          <div class="progress-line">
            <Meter value={slot.mastery_bp} max={10000} tone="gold" label={t('Mastery {pct}', { pct: pct(slot.mastery_bp) })} />
            <span class="progress-num"><b>{pct(slot.mastery_bp)}</b> <small>{t('mastery')}</small></span>
          </div>
          {branchTotal > 0 ? (
            <div class="progress-line" data-testid={`tradition-branch-${slot.slot}`}>
              <Meter value={branchKnown} max={branchTotal} tone="ok" label={t('{n} of {m} branch technologies understood', { n: branchKnown, m: branchTotal })} />
              <span class="progress-num"><b>{branchKnown}</b> / {branchTotal} <small>{t('branch technologies')}</small></span>
            </div>
          ) : null}
          <p class="muted small">{t('Mastery grows while at least 5% of filled industry and power posts are in its signature works; now {pct}.', { pct: pct(slot.signature_share_bp) })}</p>
          {heldOpt?.drawbacks.length ? <ul class="era-drawbacks">{heldOpt.drawbacks.map((d) => <li class="neg"><Icon name="warn" size={11} /> {tc(d)}</li>)}</ul> : null}
        </>
      ) : null}
      {reform ? <p class="note is-warn"><Icon name="clock" size={12} /> {t('Reform to {name} under way.', { name: tc(reform.name) })}</p> : null}
      {!slot.offered ? <p class="muted small">{slot.slot === 'machine' ? t('Offered on entering the Industrial era.') : t('Offered on entering the Information era.')}</p> : (
        <ul class="era-paths">{slot.options.map((o) => <OptionRow o={o} slot={slot} busy={busy} now={now} owner={owner} />)}</ul>
      )}
      {slot.held && slot.offered ? <p class="muted small">{t('Switching path is a tradition reform: long, costly and unsettling. A slot may also stay Unaligned for ever.')}</p> : null}
    </section>
  );
}

/** The era screen: where the seat stands on the ladder, its crossing, charters and traditions. */
export function EraScreen() {
  useLocale();
  const s = useApp();
  const obs = s.obs;
  const e = obs?.era;
  if (!obs || !e) {
    return (
      <OverlayFrame icon="hourglass" title={t('Era and traditions')} testid="overlay-era">
        <StatePlate icon="hourglass" title={t('No era information yet')}>{t('Eras, charters and traditions appear here once the referee reports them.')}</StatePlate>
      </OverlayFrame>
    );
  }
  const n = e.next;
  const heldCharters = e.charters.filter((c) => c.held).length;
  const full = heldCharters >= e.charter_slots;
  const tr = e.transition;
  const style = styleOfEra(e);
  const ageName = ageNameOf(e);
  const heldNames = e.traditions.map((x) => x.options.find((o) => o.key === x.held)).filter((x): x is TraditionOption => !!x);
  return (
    <OverlayFrame icon="hourglass" title={t('Era and traditions')} kicker={t('Where {name} stands', { name: tc(obs.civ.name) })} testid="overlay-era" class="era-overlay">
      <div class={cx('era-body', style && 'is-punk')} style={style ? punkVars(PUNK[style]) : undefined}>
        {style ? (
          <header class={cx('era-hero', 'punk-' + style)} data-testid="era-hero" data-style={style}>
            <PunkBanner style={style} owner={obs.civ.color} height={132} />
            <div class="era-hero-text">
              <h3>{ageName}</h3>
              <p>{t('{era} era', { era: eraName(e.era) })}{heldNames.length ? ' · ' + heldNames.map((o) => `${tc(o.name)} (${tc(o.sober_name)})`).join(' · ') : ''}</p>
            </div>
          </header>
        ) : null}
        <section class="era-ladder" data-testid="era-ladder" aria-label={t('Era ladder')}>
          <ol>
            {ERA_NAMES.map((_, i) => (
              i > 8 && e.era < 9 && n?.era !== 9 ? null : (
                <li class={cx(i < e.era && 'is-done', i === e.era && 'is-now', n && i === n.era && 'is-next')}>
                  <span class="era-dot">{i < e.era ? <Icon name="check" size={11} /> : i + 1}</span>
                  <span>{eraName(i)}</span>
                </li>
              )
            ))}
          </ol>
        </section>
        <div class="era-cols">
          <div class="era-col">
            <section class="era-card" data-testid="era-current">
              <h3 data-testid="era-title">{ageName ?? t('{era} era', { era: eraName(e.era) })}</h3>
              {ageName ? <p class="era-sub">{t('{era} era', { era: eraName(e.era) })}</p> : null}
              <p class="muted">{t('Entered {date}', { date: fmtDate(e.since) })}</p>
              {e.age ? (
                <div class={cx('note', e.age.kind === 'golden' ? 'is-ok' : 'is-bad')} data-testid="era-age">
                  <p><Icon name={e.age.kind === 'golden' ? 'sun' : 'warn'} size={12} /> {e.age.kind === 'golden' ? t('A golden age, until {date}.', { date: fmtDate(e.age.until) }) : t('A dark age, until {date}.', { date: fmtDate(e.age.until) })} {t('Crossing score {n} of 100.', { n: int(e.age.score) })}</p>
                  {e.age.effects.length ? <ul>{e.age.effects.map((x) => <li>{tc(x)}</li>)}</ul> : null}
                </div>
              ) : null}
              {tr ? (
                <div class="era-transition" data-testid="era-transition">
                  <p><b>{t('Crossing into the {era} era', { era: eraName(tr.era) })}</b> · {t('{left} left, until {date}', { left: fmtMonths(Math.max(0, tr.end - obs.month)), date: fmtDate(tr.end) })}</p>
                  <p>{t('Strain: stability −{n} in every region while it lasts.', { n: tr.strain })} {t('{pct} of filled posts are in works two or more eras behind.', { pct: pct(tr.obsolete_share_bp) })}</p>
                  <p>{t('Score so far: {n} of 100 (75 or more brings a golden age; under 40 a dark age).', { n: int(tr.score) })}</p>
                  {tr.parts.length ? (
                    <ul class="era-parts">{tr.parts.map((p) => <li title={tc(p.detail)}><span>{tc(p.name)}</span><span class="muted small">{tc(p.detail)}</span><b>{int(p.points)}</b></li>)}</ul>
                  ) : null}
                  {tr.events.length ? <ul class="era-events">{tr.events.map((x) => <li>{tc(x)}</li>)}</ul> : null}
                </div>
              ) : null}
              {e.history.length ? (
                <ul class="era-history" data-testid="era-history">
                  {e.history.map((h) => <li><b>{eraName(h.era)}</b> <span class="muted">{fmtDate(h.month)}</span> {h.outcome ? <Badge tone={h.outcome === 'golden' ? 'gold' : h.outcome === 'dark' ? 'bad' : 'muted'}>{h.outcome === 'golden' ? t('Golden age') : h.outcome === 'dark' ? t('Dark age') : t('Steady')}{h.score !== null ? ` · ${int(h.score)}` : ''}</Badge> : <Badge tone="muted">{t('Crossing')}</Badge>}</li>)}
                </ul>
              ) : null}
            </section>
            {n ? (
              <section class="era-card" data-testid="era-next">
                <h4>{t('Next: the {era} era', { era: eraName(n.era) })}</h4>
                <Checklist items={tcChecks(n.conditions)} />
                <p class="muted small">{t('Entering opens a crossing of {n} months: stability −{strain} in every region while it lasts; {obsolete} of filled posts are in works two or more eras behind, {modern} in the new era’s.', { n: n.transition_months, strain: n.strain_if_entered, obsolete: pct(n.obsolete_share_bp), modern: pct(n.modern_share_bp) })}</p>
                <Btn kind="primary" disabled={s.busy} why={n.eligible ? null : t('Not every condition holds yet')} testid="enter-era" onClick={() => void act({ kind: 'enter_era' }, 'era')}>{t('Enter the {era} era', { era: eraName(n.era) })}</Btn>
              </section>
            ) : null}
          </div>
          {e.charters.length ? (
            <div class="era-col">
              <section class="era-card" data-testid="era-charters">
                <h4>{t('Era charter')}</h4>
                <p class="muted small">{t('{n} of {slots} charter places in use. A bounded advantage with a stated cost.', { n: heldCharters, slots: e.charter_slots })}</p>
                <ul class="era-charters">
                  {e.charters.map((c) => (
                    <li class={cx('era-charter', c.held && 'is-held')}>
                      <b>{tc(c.name)}</b>
                      <p><Icon name="good" size={11} /> {tc(c.effect)}</p>
                      <p class="neg"><Icon name="warn" size={11} /> {tc(c.cost)}</p>
                      {c.held ? <Badge tone="gold" icon="check">{t('In force')}</Badge> : (
                        <Btn small kind="primary" disabled={s.busy} why={c.available ? null : tc(e.charter_note) || t('A charter cannot be chosen now')} testid={`choose-charter-${c.key}`}
                          onClick={() => void act({ kind: 'choose_charter', charter: c.key }, 'era')}>{full ? t('Change to this charter') : t('Adopt charter')}</Btn>
                      )}
                    </li>
                  ))}
                </ul>
                {e.charter_note ? <Why>{tc(e.charter_note)}</Why> : null}
              </section>
            </div>
          ) : null}
          {e.traditions.some((x) => x.offered) || e.traditions.length ? (
            <div class="era-col">
              {e.traditions.map((slot) => <TraditionSlot slot={slot} busy={s.busy} now={obs.month} owner={obs.civ.color} />)}
            </div>
          ) : null}
        </div>
        <ActionNote tag="era" />
        <p class="muted small era-foot">{t('Traditions: {list}.', { list: TRADITIONS.map((x) => traditionLabel(x.key)).join(' · ') })}</p>
        <p class="era-close"><button type="button" class="linklike" onClick={closeOverlay}>{t('Back to the map')}</button></p>
      </div>
    </OverlayFrame>
  );
}
