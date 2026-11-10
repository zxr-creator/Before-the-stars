// Chronicle: a horizontally browsable illustrated timeline of Historic Moments.
// Reported entries are claims received, and are drawn differently from verified
// records. The sheet sits over the lower part of the map; the map stays visible.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ChronicleEntry, MomentCategory } from '../protocol';
import { api } from '../api';
import { CATEGORY_LABEL, EPISTEMIC_LABEL, fmtDate, fmtYear, tn, yearOf } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { Badge, Btn, Empty, RegionLink, cx } from '../ui';
import { clearFreshMoments, consumeIntent, markChronicleSeen, openPanel, showOnMap, useApp } from '../store';
import { Vignette } from '../art/vignette';

function when(e: ChronicleEntry): string {
  if (e.end_month !== null && yearOf(e.end_month) !== yearOf(e.month)) return t('Years {a}–{b}', { a: yearOf(e.month), b: yearOf(e.end_month) });
  return fmtYear(e.month);
}

export function ChronicleTab() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const n = obs.chronicle.length;
  const latest = n ? obs.chronicle.reduce((a, b) => (b.id > a.id ? b : a)) : null;
  const fresh = s.freshMoments.length;
  return (
    <button type="button" class={cx('chron-tab', fresh > 0 && 'has-fresh')} data-testid="chronicle-tab" title={t('Open the chronicle (H)')} onClick={() => openPanel('chronicle')}>
      <Icon name="chronicle" size={14} />
      <span class="chron-tab-title">{t('Chronicle')}</span>
      <span class="chron-tab-count">{tn(n, '{n} moment', '{n} moments')}</span>
      {latest ? <span class="chron-tab-latest">{when(latest)} · {tc(latest.title)}</span> : <span class="chron-tab-latest muted">{t('Nothing recorded yet')}</span>}
      {fresh ? <span class="chron-tab-new">{t('{n} new', { n: fresh })}</span> : null}
      <Icon name="up" size={12} />
    </button>
  );
}

export function ChronicleSheet() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const [selected, setSelected] = useState<number | null>(null);
  const [filter, setFilter] = useState<MomentCategory | 'all'>('all');
  const scroller = useRef<HTMLDivElement>(null);
  const freshAtOpen = useRef<Set<number>>(new Set(s.freshMoments));

  const entries = useMemo(() => obs.chronicle.slice().sort((a, b) => a.month - b.month || a.id - b.id), [obs.chronicle]);
  const cats = useMemo(() => Array.from(new Set(entries.map((e) => e.category))), [entries]);
  const shown = filter === 'all' ? entries : entries.filter((e) => e.category === filter);
  const detail = selected !== null ? entries.find((e) => e.id === selected) ?? null : null;

  useEffect(() => {
    markChronicleSeen();
    return () => clearFreshMoments();
  }, []);

  // Start at the most recent moments; jump to a requested one.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const it = s.intent;
    if (it?.kind === 'moment') {
      setSelected(it.id);
      setFilter('all');
      consumeIntent();
      requestAnimationFrame(() => el.querySelector(`[data-moment="${it.id}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }));
    } else {
      el.scrollLeft = el.scrollWidth;
    }
  }, [s.intent?.nonce, obs.round]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected !== null) {
        setSelected(null);
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selected]);

  const scrollBy = (dir: number) => scroller.current?.scrollBy({ left: dir * Math.max(320, (scroller.current.clientWidth * 2) / 3), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const onWheel = (e: WheelEvent) => {
    const el = scroller.current;
    if (!el || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };
  const step = (dir: number) => {
    if (!detail) return;
    const i = shown.findIndex((e) => e.id === detail.id);
    const n = shown[i + dir];
    if (n) {
      setSelected(n.id);
      scroller.current?.querySelector(`[data-moment="${n.id}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  };

  return (
    <section class={cx('chron-sheet', detail && 'has-detail')} aria-label={t('Chronicle')} data-testid="panel-chronicle">
      <header class="chron-head">
        <h2><Icon name="chronicle" size={16} /> {t('Chronicle of {name}', { name: tc(obs.civ.name) })}</h2>
        <div class="chron-filters" role="group" aria-label={t('Filter by category')}>
          <button type="button" class={cx('chip', filter === 'all' && 'is-active')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('All')} <small>{entries.length}</small></button>
          {cats.map((c) => (
            <button type="button" class={cx('chip', filter === c && 'is-active')} aria-pressed={filter === c} onClick={() => setFilter(c)}>{t(CATEGORY_LABEL[c])}</button>
          ))}
        </div>
        <div class="chron-tools">
          <a class="btn btn-ghost btn-sm" href={api.chronicleUrl(obs.seat, 'md')} download={`chronicle-${obs.civ.name}.md`} data-testid="export-md"><Icon name="download" size={13} /><span>Markdown</span></a>
          <a class="btn btn-ghost btn-sm" href={api.chronicleUrl(obs.seat, 'json')} download={`chronicle-${obs.civ.name}.json`} data-testid="export-json"><Icon name="download" size={13} /><span>JSON</span></a>
          <Btn kind="ghost" small icon="left" title={t('Earlier')} onClick={() => scrollBy(-1)} />
          <Btn kind="ghost" small icon="right" title={t('Later')} onClick={() => scrollBy(1)} />
          <Btn kind="ghost" small icon="close" title={t('Close (Esc)')} testid="chronicle-close" onClick={() => openPanel(null)} />
        </div>
      </header>
      <div class="chron-body">
        <div class="timeline" ref={scroller} onWheel={onWheel} tabIndex={0} aria-label={t('Timeline of historic moments')} data-testid="timeline">
          {shown.length === 0 ? (
            <div class="timeline-empty"><Empty>{entries.length ? t('No moments in this category.') : t('History has not yet been written. The first moments appear once a year has been lived.')}</Empty></div>
          ) : (
            <ol class="timeline-track">
              {shown.map((e, i) => {
                const prev = shown[i - 1];
                const newYear = !prev || yearOf(prev.month) !== yearOf(e.month);
                const reported = e.epistemic !== 'verified';
                return (
                  <li class={cx('moment-slot', e.major && 'is-major')} data-moment={e.id}>
                    <span class={cx('moment-year', !newYear && 'is-repeat')}>{newYear ? when(e) : ' '}</span>
                    <button type="button" class={cx('moment', e.major && 'is-major', reported && 'is-reported', selected === e.id && 'is-selected', freshAtOpen.current.has(e.id) && 'is-fresh')}
                      aria-pressed={selected === e.id} data-testid="moment-card" data-epistemic={e.epistemic}
                      onClick={() => setSelected(selected === e.id ? null : e.id)}>
                      <span class="moment-art"><Vignette art={e.art} title={tc(e.title)} />
                        {reported ? <span class="moment-stamp" title={t('A claim received, not a verified fact')}><Icon name="question" size={11} /> {t(EPISTEMIC_LABEL[e.epistemic])}</span> : null}
                        {e.major ? <span class="moment-major" title={t('A major moment')}><Icon name="star" size={11} /></span> : null}
                        {freshAtOpen.current.has(e.id) ? <span class="moment-new">{t('New')}</span> : null}
                      </span>
                      <span class="moment-text">
                        <span class="moment-cat">{t(CATEGORY_LABEL[e.category])}{e.end_month !== null ? ` · ${when(e)}` : ''}</span>
                        <b class="moment-title">{tc(e.title)}</b>
                        <span class="moment-body">{reported ? t('Reported: {text}', { text: tc(e.text) }) : tc(e.text)}</span>
                      </span>
                    </button>
                    <span class="moment-node" aria-hidden="true" />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {detail ? (
          <aside class={cx('moment-detail', detail.epistemic !== 'verified' && 'is-reported')} data-esc-layer aria-label={t('Moment: {title}', { title: tc(detail.title) })} data-testid="moment-detail">
            <header>
              <div>
                <span class="kicker">{t(CATEGORY_LABEL[detail.category])} · {detail.end_month !== null ? `${fmtDate(detail.month)} – ${fmtDate(detail.end_month)}` : fmtDate(detail.month)}</span>
                <h3>{tc(detail.title)}</h3>
              </div>
              <Btn kind="ghost" small icon="close" title={t('Close detail (Esc)')} onClick={() => setSelected(null)} />
            </header>
            <div class="moment-detail-body">
              <div class="row wrap">
                {detail.major ? <Badge tone="gold" icon="star">{t('Major moment')}</Badge> : null}
                {detail.epistemic === 'verified'
                  ? <Badge tone="ok" icon="check">{t('From our own records')}</Badge>
                  : <Badge tone="warn" icon="question">{t('{kind} — a claim, not an established fact', { kind: t(EPISTEMIC_LABEL[detail.epistemic]) })}</Badge>}
              </div>
              <p class="moment-full">{tc(detail.text)}</p>
              <p class="sub-label">{t('Evidence')}</p>
              {detail.evidence.length ? <ul class="evidence">{detail.evidence.map((ev) => <li>{tc(ev)}</li>)}</ul> : <p class="muted small">{t('No supporting records are attached to this entry.')}</p>}
              <div class="form-actions">
                {detail.region !== null && obs.regions.some((r) => r.id === detail.region) ? (
                  <Btn small icon="pin" testid="moment-show-map" onClick={() => showOnMap([detail.region!])}>{t('Show on map')}</Btn>
                ) : <span class="muted small">{t('No map location is recorded.')}</span>}
                {detail.region !== null && obs.regions.some((r) => r.id === detail.region) ? <RegionLink id={detail.region} /> : null}
                <span class="spacer" />
                <Btn small kind="ghost" icon="left" title={t('Previous moment')} onClick={() => step(-1)} />
                <Btn small kind="ghost" icon="right" title={t('Next moment')} onClick={() => step(1)} />
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
