// Technology tree and civics tree: two full-screen charts of illustrated cards
// joined by drawn links. They show the seat's own Observation and nothing else:
// only disclosed cards, only disclosed links, no totals and no empty places for
// what has not been discovered.
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Lead, Observation, PracticeCard, ProjectView, TechCard } from '../protocol';
import { KSTATE_LABEL, KSTATE_ORDER, PSTATE_LABEL, RESEARCH_LABEL, fmtDate, pct, researchMonths, tcAll, tcChecks, workMonths } from '../format';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Est, Meter, Why, cx, work } from '../ui';
import { act, openOverlay, useApp } from '../store';
import { t, tc, useLocale } from '../i18n';
import { OverlayFrame, StatePlate } from '../theme/overlay';
import { layoutTree } from './layout';
import type { LNode, Placed, TreeLayout } from './layout';
import { layoutMatrix } from './matrix';
import type { MatrixCell, MatrixLayout, MNode } from './matrix';
import { ERA_NAMES, exclusiveGroup, fieldTradition, laneOrder, practiceBand, techBand, techLane, traditionByKey } from './tables';
import { FamilyBlock, FragileNote, KindBadge, LinesMeter, LoadMeter, LoadNote, PracticePills, PracticeRules, SlotsMeter, canRepeal, exclusiveHolder, familyMark, fragileLeft, isHeldBack, kindInfo, linesWhy, reformBlock, repealProject } from './insight';
import { Art, TreeChart } from './TreeView';
import type { ChartApi } from './TreeView';
import { enableIcon, groupHue, practiceArt, techArt } from './art';
import { LorePassage } from '../lore';
import './trees.css';

const CARD_W = 264;
const CARD_H = 120;
const LEAD_H = 138;
const leadId = (handle: string) => 'lead-' + handle;

const KSTATE_ICON: Record<string, string> = {
  hinted: 'question', discovered: 'eye', investigating: 'flask', understood: 'check', prototyped: 'hammer', adopted: 'star',
};
const KSTATE_HELP: Record<string, string> = {
  hinted: 'A rumour: not yet a workable question',
  discovered: 'A workable question that has not been investigated',
  investigating: 'Being investigated now',
  understood: 'Reproducible knowledge, not yet put to work',
  prototyped: 'Demonstrated in practice, not yet in ordinary use',
  adopted: 'Functioning capacity in ordinary use',
};
const PSTATE_ICON: Record<string, string> = { recognized: 'eye', reforming: 'scroll', enacted: 'seal', established: 'star' };
const PSTATE_HELP: Record<string, string> = {
  recognized: 'People know of it; it is not yet how things are done',
  reforming: 'A reform to enact it is being prepared',
  enacted: 'Enacted; people are taking it up gradually',
  established: 'An ordinary part of life',
};

function Tabs({ active }: { active: 'tech' | 'civics' }) {
  return (
    <>
      <button type="button" class={cx('fs-tab', active === 'tech' && 'is-active')} aria-pressed={active === 'tech'} data-testid="tree-tab-tech" onClick={() => openOverlay('tech')}>
        <Icon name="techtree" size={14} /> {t('Technology')} <kbd class="tree-kbd">T</kbd>
      </button>
      <button type="button" class={cx('fs-tab', active === 'civics' && 'is-active')} aria-pressed={active === 'civics'} data-testid="tree-tab-civics" onClick={() => openOverlay('civics')}>
        <Icon name="civics" size={14} /> {t('Civics')} <kbd class="tree-kbd">C</kbd>
      </button>
    </>
  );
}

function Search({ value, onChange, onEnter, count, label }: { value: string; onChange: (v: string) => void; onEnter: () => void; count: number | null; label: string }) {
  return (
    <>
      {count !== null ? <span class="tree-count" aria-live="polite">{count === 0 ? t('No card matches') : count === 1 ? t('1 card matches') : t('{n} cards match', { n: count })}</span> : null}
      <input type="search" class="fs-search" value={value} placeholder={label} aria-label={label} data-testid="tree-search" spellcheck={false} autocomplete="off"
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onEnter(); e.preventDefault(); }
          else if (e.key === 'Escape' && value) { onChange(''); e.stopPropagation(); e.preventDefault(); }
        }} />
    </>
  );
}

function matcher(query: string): ((...fields: (string | null | undefined)[]) => boolean) | null {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return (...fields) => {
    const hay = fields.filter(Boolean).join(' \n ').toLowerCase();
    return words.every((w) => hay.includes(w));
  };
}

function EnableIcons({ list, max = 5 }: { list: string[]; max?: number }) {
  if (!list.length) return null;
  const shown = list.slice(0, list.length > max ? max - 1 : max);
  return (
    <span class="tcard-enables" aria-label={t('Enables: {list}', { list: tcAll(list).join('; ') })}>
      {shown.map((e) => <span class="tcard-enable" title={tc(e)}><Icon name={enableIcon(e)} size={13} /></span>)}
      {list.length > shown.length ? <span class="tcard-enable is-more" title={tcAll(list.slice(shown.length)).join('\n')}>+{list.length - shown.length}</span> : null}
    </span>
  );
}

function useEscClosesDrawer(open: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

function cardKeys(open: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };
}

function Drawer({ art, kicker, title, badges, onClose, children, label }: {
  art: string; kicker: string; title: string; badges: ComponentChildren; onClose: () => void; children: ComponentChildren; label: string;
}) {
  return (
    <aside class="tree-drawer" data-esc-layer aria-label={label} data-testid="tree-detail">
      <header class="tree-drawer-head">
        <div class="tree-drawer-art"><Art art={art} /></div>
        <button type="button" class="tree-drawer-x" aria-label={t('Close detail (Esc)')} title={t('Close detail (Esc)')} data-testid="tree-detail-close" onClick={onClose}><Icon name="close" size={14} /></button>
        <div class="tree-drawer-title">
          <span class="tree-drawer-kicker">{kicker}</span>
          <h3>{title}</h3>
          <div class="tree-drawer-badges">{badges}</div>
        </div>
      </header>
      <div class="tree-drawer-body">{children}</div>
    </aside>
  );
}

function Block({ title, aside, children }: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="tree-block">
      <header><h4>{title}</h4>{aside ? <span class="tree-block-aside">{aside}</span> : null}</header>
      {children}
    </section>
  );
}

function EnableList({ list }: { list: string[] }) {
  if (!list.length) return null;
  return <ul class="tree-enable-list">{list.map((e) => <li><span class="tcard-enable"><Icon name={enableIcon(e)} size={13} /></span><span>{tc(e)}</span></li>)}</ul>;
}

function Connections({ before, after, onOpen }: { before: { id: string; name: string }[]; after: { id: string; name: string }[]; onOpen: (id: string) => void }) {
  if (!before.length && !after.length) return <p class="muted small">{t('No known connection to another card yet.')}</p>;
  const row = (label: string, items: { id: string; name: string }[]) => (items.length ? (
    <div class="tree-conn">
      <span class="tree-conn-label">{label}</span>
      <span class="tree-conn-chips">{items.map((c) => <button type="button" class="tree-chip" onClick={() => onOpen(c.id)}>{tc(c.name)}</button>)}</span>
    </div>
  ) : null);
  return <>{row(t('Builds on'), before)}{row(t('Leads to'), after)}</>;
}

// ====================================================================================
// Technology
// ====================================================================================

interface Estimate { text: string; title: string; warn?: boolean }

function roundsText(lo: number, hi: number): string {
  if (lo === hi) return lo === 1 ? t('≈ 1 round') : t('≈ {n} rounds', { n: lo });
  return t('≈ {lo}–{hi} rounds', { lo, hi });
}

function techEstimate(obs: Observation, card: TechCard, project: ProjectView | undefined): Estimate | null {
  const mpr = Math.max(1, obs.months_per_round);
  const label = t(RESEARCH_LABEL[card.class]);
  if (project) {
    if (project.eta_months_low !== null && project.eta_months_high !== null) {
      const lo = Math.max(1, Math.ceil(project.eta_months_low / mpr));
      const hi = Math.max(lo, Math.ceil(project.eta_months_high / mpr));
      return { text: roundsText(lo, hi), title: t('Estimate from the pace of recent months: about {a}–{b} more months.', { a: project.eta_months_low, b: project.eta_months_high }) };
    }
    if (project.paused) return { text: t('Paused'), title: t('This investigation is paused.'), warn: true };
    if (project.blockers.length) return { text: t('Stalled'), title: tcAll(project.blockers).join('; '), warn: true };
    // Just funded: nothing has been measured yet, so fall back to the capacity estimate.
  } else if (card.state !== 'discovered' && card.state !== 'hinted' && card.state !== 'investigating') return null;
  const cap = obs.civ.research.find((l) => l.class === card.class)?.capacity ?? 0;
  const left = Math.max(0, card.work_needed - card.work_done);
  if (cap <= 0) return { text: t('No capacity yet'), title: t('There is no {label} capacity yet, so this would not advance. Qualified people staffing a place of inquiry provide it.', { label }), warn: true };
  const rounds = Math.max(1, Math.ceil(left / cap / mpr));
  return { text: roundsText(rounds, rounds), title: t('Estimate: {n} left at the full {label} capacity of {cap} a month. Sharing that capacity, or shortages, make it slower.', { n: researchMonths(left), label, cap: researchMonths(cap) }) };
}

function techWhy(obs: Observation, card: TechCard, under: boolean): string | null {
  if (under) return t('This investigation is already under way');
  if (card.can_investigate) return linesWhy(obs);
  const m = card.known_requirements.find((r) => !r.satisfied);
  if (m) return t('Requires: {text}', { text: tc(m.text) });
  if (card.unknown_requirements) return t('Depends on further knowledge not yet identified');
  return t('Investigators lack something this work depends on');
}

function LabelBadge({ label }: { label: string }) {
  if (label === 'extrapolated') return <Badge tone="info" title={t('Extrapolated from established science: plausible, not demonstrated in our world')}>{t('Extrapolated')}</Badge>;
  if (label === 'fictional') return <Badge tone="gold" icon="spark" title={t('Part of this game’s science-fiction premise')}>{t('Fictional')}</Badge>;
  return null;
}

function investigate(handle: string, tag: string) {
  return (e?: MouseEvent) => {
    e?.stopPropagation();
    void act({ kind: 'start_project', spec: { kind: 'research', tech: handle }, priority: null }, tag);
  };
}

type StateFilter = 'all' | 'questions' | 'investigating' | 'held' | 'used';
interface TechFilter { state: StateFilter; field: string; era: number; trad: string; rival: boolean; fragile: boolean }
const NO_FILTER: TechFilter = { state: 'all', field: '', era: -1, trad: '', rival: false, fragile: false };
const STATE_FILTERS: [StateFilter, string][] = [['all', 'All'], ['questions', 'Questions'], ['investigating', 'Under way'], ['held', 'Understood'], ['used', 'In use']];
const MM_STATE: Record<string, string> = {
  hinted: '#5b6690', discovered: '#7a86b8', investigating: '#f1da98', understood: '#7fae67', prototyped: '#5e9fb3', adopted: '#d9b765',
};

/** Accent of a lane: a stable hue per catalogue letter, gold for the tradition lane. */
function laneHue(lane: string): string {
  if (lane === 'T') return '#e0b25a';
  const c = lane.charCodeAt(0) - 65;
  return groupHue(c >= 0 && c < 26 ? c : 0);
}

function FilterBar({ filter, setFilter, fields, eras, trads, hasRival, hasFragile, count, total, onJump, jumpCount }: {
  filter: TechFilter; setFilter: (f: TechFilter) => void; fields: string[]; eras: number[]; trads: string[];
  hasRival: boolean; hasFragile: boolean; count: number | null; total: number; onJump: () => void; jumpCount: number;
}) {
  const active = JSON.stringify(filter) !== JSON.stringify(NO_FILTER);
  return (
    <div class="tree-filterbar" role="group" aria-label={t('Filter cards')} data-testid="tree-filters">
      <span class="tree-seg" role="group" aria-label={t('State')}>
        {STATE_FILTERS.map(([k, label]) => (
          <button type="button" class={cx('tree-segbtn', filter.state === k && 'is-on')} aria-pressed={filter.state === k} data-testid={`tree-filter-${k}`} onClick={() => setFilter({ ...filter, state: k })}>{t(label)}</button>
        ))}
      </span>
      <select class="tree-select" aria-label={t('Field')} value={filter.field} data-testid="tree-filter-field" onChange={(e) => setFilter({ ...filter, field: (e.target as HTMLSelectElement).value })}>
        <option value="">{t('Every field')}</option>
        {fields.map((f) => <option value={f}>{tc(f)}</option>)}
      </select>
      <select class="tree-select" aria-label={t('Era')} value={String(filter.era)} data-testid="tree-filter-era" onChange={(e) => setFilter({ ...filter, era: Number((e.target as HTMLSelectElement).value) })}>
        <option value="-1">{t('Every era')}</option>
        {eras.map((e) => <option value={String(e)}>{t(ERA_NAMES[e] ?? String(e))}</option>)}
      </select>
      {trads.length ? (
        <select class="tree-select" aria-label={t('Tradition')} value={filter.trad} data-testid="tree-filter-trad" onChange={(e) => setFilter({ ...filter, trad: (e.target as HTMLSelectElement).value })}>
          <option value="">{t('Every tradition')}</option>
          {trads.map((k) => { const tr = traditionByKey(k)!; return <option value={k}>{t('{genre} ({name})', { genre: t(tr.genre), name: t(tr.name) })}</option>; })}
        </select>
      ) : null}
      {hasRival ? <button type="button" class={cx('tree-segbtn', 'is-solo', filter.rival && 'is-on')} aria-pressed={filter.rival} data-testid="tree-filter-rival" title={t('Cards in a family of rival technologies')} onClick={() => setFilter({ ...filter, rival: !filter.rival })}><Icon name="swap" size={11} /> {t('Rival standards')}</button> : null}
      {hasFragile ? <button type="button" class={cx('tree-segbtn', 'is-solo', filter.fragile && 'is-on')} aria-pressed={filter.fragile} data-testid="tree-filter-fragile" title={t('Know-how that may be lost')} onClick={() => setFilter({ ...filter, fragile: !filter.fragile })}><Icon name="hourglass" size={11} /> {t('Fragile')}</button> : null}
      {active ? <button type="button" class="linklike tree-clear" data-testid="tree-filter-clear" onClick={() => setFilter(NO_FILTER)}>{t('Clear filters')}</button> : null}
      <span class="tree-filter-gap" />
      {count !== null ? <span class="tree-count" aria-live="polite">{t('{n} of {total} shown', { n: count, total })}</span> : null}
      <button type="button" class="tree-jump" disabled={!jumpCount} data-testid="tree-jump" title={jumpCount ? t('Centre the chart on the next investigation under way') : t('No investigation is under way.')} onClick={onJump}>
        <Icon name="flask" size={12} /> {t('Jump to investigating')}{jumpCount ? <b>{jumpCount}</b> : null}
      </button>
    </div>
  );
}

export function TechTree() {
  useLocale();
  const s = useApp();
  const obs = s.obs;
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TechFilter>(NO_FILTER);
  const jumpAt = useRef(0);
  const chart = useRef<ChartApi | null>(null);
  const techs = obs?.knowledge.techs ?? [];
  const leads = obs?.knowledge.leads ?? [];

  const sig = techs.map((c) => c.handle + ':' + c.links.join(',')).join('|') + '#' + leads.map((l) => l.handle).join(',');
  const layout: MatrixLayout = useMemo(() => {
    const nodes: MNode[] = techs.map((c, i) => ({ id: c.handle, links: c.links, band: techBand(c), lane: techLane(c.field), sort: '', key: c.discovered_month * 1000 + i }));
    return layoutMatrix(nodes, { cardW: CARD_W, cardH: CARD_H, gapX: 28, gapY: 16, laneOrder, maxSub: 5, rowsTarget: 3, frontier: leads.map((l) => ({ id: leadId(l.handle), h: LEAD_H })) });
  }, [sig]);

  // A card named by whoever opened the overlay is selected and centred.
  const arg = s.overlay === 'tech' ? s.overlayArg : null;
  useEffect(() => {
    if (arg && layout.placed.has(arg)) {
      setSelected(arg);
      chart.current?.centerOn(arg);
    }
  }, [arg]);
  useEffect(() => {
    if (selected && !layout.placed.has(selected)) setSelected(null);
  }, [layout]);
  useEscClosesDrawer(!!selected, () => setSelected(null));

  if (!obs) {
    return (
      <OverlayFrame icon="techtree" title={t('Technology tree')} testid="overlay-tech">
        <StatePlate icon="techtree" title={t('No civilization in view')}>{t('The technology tree shows what one civilization has discovered. Open it while playing or viewing a seat.')}</StatePlate>
      </OverlayFrame>
    );
  }

  const projects = new Map(obs.projects.filter((p) => p.kind === 'research' && p.target).map((p) => [p.target as string, p]));
  const following = new Set(obs.projects.filter((p) => p.kind === 'lead').map((p) => p.target));
  const byHandle = new Map(techs.map((c) => [c.handle, c]));
  const lineBlock = linesWhy(obs);
  const underOf = (c: TechCard) => c.state === 'investigating' || projects.has(c.handle);
  const match = matcher(query);
  const searchHit = (c: TechCard) => !match || match(c.name, tc(c.name), c.field, tc(c.field), c.capability, tc(c.capability), ...c.enables, ...tcAll(c.enables), t(KSTATE_LABEL[c.state]), c.family_view ? tc(c.family_view.family) : '');
  const stateHit = (c: TechCard) => {
    const under = underOf(c);
    switch (filter.state) {
      case 'questions': return !under && (c.state === 'hinted' || c.state === 'discovered');
      case 'investigating': return under;
      case 'held': return c.state === 'understood' || c.state === 'prototyped';
      case 'used': return c.state === 'adopted';
      default: return true;
    }
  };
  const filtering = JSON.stringify(filter) !== JSON.stringify(NO_FILTER);
  const techHit = (c: TechCard) => searchHit(c) && stateHit(c)
    && (!filter.field || c.field === filter.field) && (filter.era < 0 || techBand(c) === filter.era)
    && (!filter.trad || fieldTradition(c.field)?.key === filter.trad) && (!filter.rival || !!c.family_view) && (!filter.fragile || fragileLeft(c) !== null);
  const leadFiltered = filtering && !(filter.state === 'questions' && !filter.field && filter.era < 0 && !filter.trad && !filter.rival && !filter.fragile);
  const leadHit = (l: Lead) => !leadFiltered && (!match || match(l.title, tc(l.title), l.detail, tc(l.detail), l.source, tc(l.source)));
  const narrowing = !!match || filtering;
  const hits = narrowing ? [...techs.filter(techHit).map((c) => c.handle), ...leads.filter(leadHit).map((l) => leadId(l.handle))] : null;
  const firstHit = () => {
    if (!hits?.length) return;
    const q = query.trim().toLowerCase();
    const exact = techs.find((c) => hits.includes(c.handle) && (c.name.toLowerCase() === q || tc(c.name).toLowerCase() === q));
    const best = exact ? layout.placed.get(exact.handle) : hits.map((id) => layout.placed.get(id)!).filter(Boolean).sort((a, b) => a.col - b.col || a.row - b.row)[0];
    if (best) { setSelected(best.id); chart.current?.centerOn(best.id); chart.current?.focusCard(best.id); }
  };

  const target = (arg && layout.placed.has(arg) ? arg : null)
    ?? techs.find((c) => underOf(c))?.handle
    ?? techs.find((c) => c.can_investigate && c.state === 'discovered')?.handle
    ?? (leads.length ? leadId(leads[0].handle) : null)
    ?? techs[techs.length - 1]?.handle ?? null;

  const selCard = selected ? byHandle.get(selected) : undefined;
  const selLead = selected && !selCard ? leads.find((l) => leadId(l.handle) === selected) : undefined;
  const open = (id: string) => setSelected(id);
  const jump = (id: string) => { setSelected(id); chart.current?.centerOn(id); };
  const underway = techs.filter(underOf).sort((a, b) => (layout.placed.get(a.handle)?.col ?? 0) - (layout.placed.get(b.handle)?.col ?? 0));
  const jumpNext = () => {
    if (!underway.length) return;
    const c = underway[jumpAt.current % underway.length];
    jumpAt.current += 1;
    jump(c.handle);
    chart.current?.focusCard(c.handle);
  };

  const fields = [...new Set(techs.map((c) => c.field))].sort((a, b) => laneOrder(techLane(a), techLane(b)) || a.localeCompare(b));
  const eras = [...new Set(techs.map((c) => techBand(c)))].sort((a, b) => a - b);
  const trads = [...new Set(techs.map((c) => fieldTradition(c.field)?.key).filter((k): k is string => !!k))];
  const laneTitle = (lane: string) => {
    if (lane === 'T') return t('Tradition branches');
    const f = techs.find((c) => techLane(c.field) === lane);
    return f ? tc(f.field) : lane;
  };

  const renderCard = (id: string) => {
    const c = byHandle.get(id);
    const pc = layout.placed.get(id);
    if (c && pc) return <TechFace c={c} p={pc} obs={obs} project={projects.get(c.handle)} selected={selected === c.handle} dim={narrowing && !techHit(c)} busy={s.busy} lineBlock={lineBlock} onOpen={open} />;
    const l = leads.find((x) => leadId(x.handle) === id);
    if (!l) return null;
    const p = layout.placed.get(id)!;
    return (
      <div class={cx('tcard', 'tcard-lead', selected === id && 'is-selected', narrowing && !leadHit(l) && 'is-dim')} role="button" tabIndex={0}
        data-testid="tree-lead" data-handle={id} aria-label={tc(l.title)} aria-pressed={selected === id}
        style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' }}
        onClick={() => open(id)} onKeyDown={cardKeys(() => open(id))}>
        <span class="tcard-art is-mystery"><span class="tcard-mystery">?</span></span>
        <span class="tcard-main">
          <span class="tcard-kicker">{tc(l.source)}</span>
          <span class="tcard-name">{tc(l.title)}</span>
          <span class="tcard-state">
            <span class="tcard-state-label"><Est title={t('How strongly the reports point at something real')}>{t('confidence ≈ {pct}', { pct: pct(l.confidence_bp) })}</Est></span>
            <span class="tcard-class">{researchMonths(l.study_work)}</span>
          </span>
          <span class="tcard-foot">
            {following.has(l.handle) ? <Badge tone="gold" icon="clock">{t('Being followed')}</Badge> : (
              <Btn small kind="primary" icon="search" disabled={s.busy} testid="tree-follow-up" onClick={(e) => { e.stopPropagation(); void act({ kind: 'investigate', lead: l.handle }, 'tree-lead'); }}>{t('Follow up')}</Btn>
            )}
            <span class="tcard-est">{t(RESEARCH_LABEL[l.class])}</span>
          </span>
        </span>
      </div>
    );
  };

  const cellSummary = (cell: MatrixCell) => {
    const cards = cell.ids.map((h) => byHandle.get(h)).filter((c): c is TechCard => !!c);
    const shown = narrowing ? cards.filter(techHit).length : cards.length;
    const under = cards.filter(underOf).length;
    const parts = KSTATE_ORDER.map((st) => [st, cards.filter((c) => c.state === st).length] as const).filter(([, n]) => n > 0);
    return (
      <>
        <b class={cx(narrowing && !shown && 'is-none')}>{narrowing ? t('{n} of {total}', { n: shown, total: cards.length }) : cards.length}</b>
        <span class="tree-cellbar">{parts.map(([st, n]) => <i style={{ flex: n, background: MM_STATE[st] }} title={`${t(KSTATE_LABEL[st])}: ${n}`} />)}</span>
        {under ? <small><Icon name="flask" size={11} /> {t('{n} under way', { n: under })}</small> : null}
      </>
    );
  };

  return (
    <OverlayFrame icon="techtree" title={t('Technology tree')} kicker={t('What {name} has discovered', { name: tc(obs.civ.name) })} testid="overlay-tech" class="tree-overlay"
      tabs={<Tabs active="tech" />}
      tools={<Search value={query} onChange={setQuery} onEnter={firstHit} count={match && !filtering ? hits!.length : null} label={t('Search discovered cards')} />}>
      <div class="tree-main">
        <ResearchQueue obs={obs} techs={techs} onOpen={jump} />
        {techs.length ? <FilterBar filter={filter} setFilter={setFilter} fields={fields} eras={eras} trads={trads} hasRival={techs.some((c) => c.family_view)} hasFragile={techs.some((c) => fragileLeft(c) !== null)}
          count={hits ? hits.length : null} total={techs.length + leads.length} onJump={jumpNext} jumpCount={underway.length} /> : null}
        {techs.length + leads.length === 0 ? (
          <StatePlate icon="techtree" title={t('Nothing has been discovered yet')}>{t('Cards appear here as your people meet problems, follow leads and learn from others.')}</StatePlate>
        ) : (
          <TreeChart layout={layout} viewKey={`${obs.match_id}:${obs.seat}:tech`} target={target} selected={selected} quiet={narrowing} api={chart}
            label={t('Technology tree')} groupColor={laneHue} laneColor={laneHue} frontierLabel={t('Frontier')} frontierHint={t('Unexplained reports. A short study may turn one into a question.')}
            renderCard={renderCard} bandLabel={(b) => t(ERA_NAMES[b] ?? String(b))} laneLabel={laneTitle} cellSummary={cellSummary}
            minimapColor={(id) => {
              const c = byHandle.get(id);
              if (!c) return narrowing && !leads.some((l) => leadId(l.handle) === id && leadHit(l)) ? null : '#f1da98';
              if (narrowing && !techHit(c)) return null;
              return MM_STATE[underOf(c) ? 'investigating' : c.state];
            }} />
        )}
      </div>
      {selCard ? <TechDrawer obs={obs} card={selCard} project={projects.get(selCard.handle)} busy={s.busy} onClose={() => setSelected(null)} onOpen={jump} /> : null}
      {selLead ? <LeadDrawer lead={selLead} following={following.has(selLead.handle)} busy={s.busy} onClose={() => setSelected(null)} /> : null}
    </OverlayFrame>
  );
}

/** One technology card on the chart. */
function TechFace({ c, p, obs, project, selected, dim, busy, lineBlock, onOpen }: {
  c: TechCard; p: Placed; obs: Observation; project: ProjectView | undefined; selected: boolean; dim: boolean; busy: boolean; lineBlock: string | null; onOpen: (id: string) => void;
}) {
  const under = c.state === 'investigating' || !!project;
  const est = techEstimate(obs, c, project);
  const why = c.state === 'discovered' || c.state === 'hinted' ? techWhy(obs, c, under) : null;
  const done = c.work_needed > 0 ? Math.min(1, c.work_done / c.work_needed) : 0;
  const vis = under ? 'investigating' : c.state;
  const fam = familyMark(c);
  const kind = kindInfo(c);
  const left = fragileLeft(c);
  const canStart = !under && c.can_investigate && c.state === 'discovered';
  return (
    <div class={cx('tcard', 'tcard-' + vis, selected && 'is-selected', dim && 'is-dim', canStart && !lineBlock && 'can-act', isHeldBack(c) && 'is-locked', (c.kind === 'branch' || c.kind === 'entry') && 'is-branch')}
      role="button" tabIndex={0} data-testid="tree-card" data-handle={c.handle} data-state={c.state} data-kind={c.kind || undefined}
      aria-label={`${tc(c.name)} — ${t(KSTATE_LABEL[c.state])}`} aria-pressed={selected}
      style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', '--g': laneHue(techLane(c.field)) } as JSX.CSSProperties}
      onClick={() => onOpen(c.handle)} onKeyDown={cardKeys(() => onOpen(c.handle))}>
      <span class="tcard-art"><Art art={techArt(c.name, c.field, c.handle)} /><span class="tcard-glyph" title={t(KSTATE_HELP[c.state] ?? '')}><Icon name={KSTATE_ICON[c.state] ?? 'info'} size={13} /></span>
        {fam || kind || left !== null ? (
          <span class="tcard-marks">
            {fam ? <span class={cx('tcard-mark', 'is-' + fam.tone)} title={fam.title} data-testid="card-family-mark"><Icon name={fam.icon} size={11} /></span> : null}
            {left !== null ? <span class={cx('tcard-mark', left <= 20 ? 'is-bad' : 'is-warn')} title={t('Fragile know-how: lost in about {n} years unless works use it', { n: left })} data-testid="card-fragile-mark"><Icon name="hourglass" size={11} /></span> : null}
            {kind && (c.kind === 'branch' || c.kind === 'entry' || c.kind === 'sealed' || c.kind === 'dead') ? <span class={cx('tcard-mark', 'is-' + kind.tone)} title={`${kind.label}: ${kind.help}`}><Icon name={kind.icon} size={11} /></span> : null}
          </span>
        ) : null}
      </span>
      <span class="tcard-main">
        <span class="tcard-kicker" title={tc(c.field)}>{kind && (c.kind === 'branch' || c.kind === 'entry') ? kind.label : tc(c.field)}</span>
        <span class="tcard-name">{tc(c.name)}</span>
        <span class="tcard-state">
          <span class="tcard-state-label">{t(KSTATE_LABEL[c.state])}</span>
          {fam && fam.tone !== 'info' ? <span class={cx('tcard-fam', 'is-' + fam.tone)} title={fam.title}>{fam.label}</span> : c.label !== 'established' ? <LabelBadge label={c.label} /> : null}
          <span class="tcard-class" title={t(RESEARCH_LABEL[c.class])}>{t(RESEARCH_LABEL[c.class])}</span>
        </span>
        <span class="tcard-foot">
          {under ? (
            <span class="tcard-progress-text"><b>{Math.round(done * 100)}%</b>{est ? <Est title={est.title}>{est.text}</Est> : null}</span>
          ) : c.state === 'discovered' || c.state === 'hinted' ? (
            c.can_investigate ? (
              <>
                <Btn small kind="primary" icon="flask" disabled={busy} why={lineBlock} testid="tree-investigate" onClick={investigate(c.handle, 'tree-research')}>{t('Investigate')}</Btn>
                {est ? <span class={cx('tcard-est', est.warn && 'is-warn')}><Est title={est.title}>{est.text}</Est></span> : null}
              </>
            ) : <span class="tcard-lock" title={why ?? undefined}><Icon name="lock" size={11} /><span>{why}</span></span>
          ) : (
            <>
              <span class="tcard-since">{c.understood_month !== null ? t('since {date}', { date: fmtDate(c.understood_month) }) : ''}</span>
              <EnableIcons list={c.enables} />
            </>
          )}
        </span>
      </span>
      {under ? <span class="tcard-bar" aria-hidden="true"><i style={{ width: (done * 100).toFixed(1) + '%' }} /></span> : null}
    </div>
  );
}

function ResearchQueue({ obs, techs, onOpen }: { obs: Observation; techs: TechCard[]; onOpen: (id: string) => void }) {
  const running = obs.projects.filter((p) => p.kind === 'research');
  const lines = obs.civ.research.filter((l) => l.capacity > 0 || l.used > 0);
  return (
    <div class="tree-queue" data-testid="tree-queue">
      <span class="tree-queue-title"><Icon name="flask" size={14} /> {t('Investigations')}</span>
      <div class="tree-queue-items">
        {running.length === 0 ? <span class="tree-queue-empty">{t('No investigation is under way.')}</span> : running.map((p) => {
          const card = techs.find((c) => c.handle === p.target);
          const done = p.work_needed > 0 ? Math.min(1, p.work_done / p.work_needed) : 0;
          const blocked = p.blockers.length > 0 || p.paused;
          const est = card ? techEstimate(obs, card, p) : null;
          return (
            <button type="button" class={cx('tree-q', blocked && 'is-blocked')} disabled={!card} data-testid="tree-queue-item"
              title={blocked ? (p.paused ? t('Paused') : tcAll(p.blockers).join('; ')) : t('Show this card')} onClick={() => card && onOpen(card.handle)}>
              <span class="tree-q-name">{blocked ? <Icon name="warn" size={11} /> : null}{card ? tc(card.name) : tc(p.title)}</span>
              <span class="tree-q-row"><span class="tree-q-bar"><i style={{ width: (done * 100).toFixed(1) + '%' }} /></span><b>{Math.round(done * 100)}%</b>{est ? <Est title={est.title}>{est.text}</Est> : null}</span>
            </button>
          );
        })}
      </div>
      <LinesMeter obs={obs} compact />
      <div class="tree-queue-cap" role="group" aria-label={t('Research capacity in use, in work per month')}>
        {lines.length === 0 ? <span class="tree-cap is-idle"><Icon name="warn" size={11} /> {t('No research capacity yet')}</span> : lines.map((l) => {
          const full = t(RESEARCH_LABEL[l.class]);
          const idle = l.capacity > 0 && l.used === 0;
          return (
            <span class={cx('tree-cap', idle && 'is-idle')} title={t('{label}: {used} of {capacity} a month in use', { label: full, used: work(l.used), capacity: researchMonths(l.capacity) }) + (idle ? ' — ' + t('none of it is in use') : '')}>
              <span>{full.split(' ')[0]}</span><b>{work(l.used)}<small>/{work(l.capacity)}</small></b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TechDrawer({ obs, card, project, busy, onClose, onOpen }: {
  obs: Observation; card: TechCard; project: ProjectView | undefined; busy: boolean; onClose: () => void; onOpen: (id: string) => void;
}) {
  const under = card.state === 'investigating' || !!project;
  const canAct = card.state === 'discovered' || card.state === 'hinted' || under;
  const why = canAct ? techWhy(obs, card, under) : null;
  const famBlock = (p: { title: string; aside?: ComponentChildren; children: ComponentChildren }) => <Block title={p.title} aside={p.aside}>{p.children}</Block>;
  const est = techEstimate(obs, card, project);
  const before = card.links.map((h) => obs.knowledge.techs.find((x) => x.handle === h)).filter((x): x is TechCard => !!x).map((x) => ({ id: x.handle, name: x.name }));
  const after = obs.knowledge.techs.filter((x) => x.links.includes(card.handle)).map((x) => ({ id: x.handle, name: x.name }));
  return (
    <Drawer art={techArt(card.name, card.field, card.handle)} kicker={tc(card.field)} title={tc(card.name)} onClose={onClose} label={t('Card: {name}', { name: tc(card.name) })}
      badges={<><span class={cx('tree-state', 'is-' + card.state)} title={t(KSTATE_HELP[card.state] ?? '')}><Icon name={KSTATE_ICON[card.state] ?? 'info'} size={12} /> {t(KSTATE_LABEL[card.state])}</span><LabelBadge label={card.label} /><KindBadge card={card} /></>}>
      <p class="tree-state-help">{t(KSTATE_HELP[card.state] ?? '')}</p>
      <FragileNote card={card} />
      <LorePassage kind="tech" name={card.name} />
      <FamilyBlock obs={obs} card={card} onOpen={onOpen} tag="tree-revisit" Wrap={famBlock} />
      <Block title={t('What it makes possible')}>
        <p>{tc(card.capability)}</p>
        <EnableList list={card.enables} />
      </Block>
      <Block title={t('What it really takes')}>
        <p>{tc(card.requirements)}</p>
        <p class="sub-label">{t('Known requirements')}</p>
        {card.known_requirements.length || card.unknown_requirements
          ? <Checklist items={tcChecks(card.known_requirements)} unknown={card.unknown_requirements} />
          : <p class="muted small">{t('None beyond the work itself, as far as we know.')}</p>}
      </Block>
      <Block title={t('Investigation')} aside={t(RESEARCH_LABEL[card.class])}>
        <div class="progress-line">
          <Meter value={card.work_done} max={Math.max(1, card.work_needed)} tone={under ? 'gold' : 'ok'} label={t('{done} of {needed} done', { done: work(card.work_done), needed: researchMonths(card.work_needed) })} />
          <span class="progress-num"><b>{work(card.work_done)}</b> / {work(card.work_needed)} <small>{t('researcher-months')}</small></span>
        </div>
        {est && canAct ? <p class={cx('tree-est-line', est.warn && 'is-warn')}><Icon name={est.warn ? 'warn' : 'clock'} size={12} /> <Est title={est.title}>{est.text}</Est> <span class="muted">· {t('an estimate, not a promise')}</span></p> : null}
        {project && project.blockers.length ? <ul class="blockers">{tcAll(project.blockers).map((b) => <li><Icon name="warn" size={11} /> {b}</li>)}</ul> : null}
        {canAct ? (
          <div class="form-actions">
            {under ? <Badge tone="gold" icon="clock">{t('Investigation under way')}</Badge> : (
              <Btn kind="primary" icon="flask" why={why} disabled={busy} testid="tree-detail-investigate" onClick={investigate(card.handle, 'tree-research')}>{t('Investigate')}</Btn>
            )}
            {why && !under ? <Why>{why}</Why> : null}
          </div>
        ) : null}
        <ActionNote tag="tree-research" />
      </Block>
      <Block title={t('Connections')}><Connections before={before} after={after} onOpen={onOpen} /></Block>
      <Block title={t('Record')}>
        <dl class="kvs">
          <div class="kv"><dt>{t('Source')}</dt><dd>{tc(card.source)}</dd></div>
          <div class="kv"><dt>{t('Era')}</dt><dd>{t(ERA_NAMES[techBand(card)] ?? '')}</dd></div>
          <div class="kv"><dt>{t('Discovered')}</dt><dd>{fmtDate(card.discovered_month)}</dd></div>
          {card.understood_month !== null ? <div class="kv"><dt>{t('Understood')}</dt><dd>{fmtDate(card.understood_month)}</dd></div> : null}
        </dl>
      </Block>
    </Drawer>
  );
}

function LeadDrawer({ lead, following, busy, onClose }: { lead: Lead; following: boolean; busy: boolean; onClose: () => void }) {
  return (
    <Drawer art="measure:3" kicker={tc(lead.source)} title={tc(lead.title)} onClose={onClose} label={t('Lead: {name}', { name: tc(lead.title) })}
      badges={<span class="tree-state is-hinted"><Icon name="spark" size={12} /> {t('Lead')}</span>}>
      <p class="tree-state-help">{t('A lead is an unexplained report, not yet a question. Following it up is a short study; it may identify a line of investigation, or find little.')}</p>
      <Block title={t('What was reported')}><p>{tc(lead.detail)}</p></Block>
      <Block title={t('Following it up')} aside={t(RESEARCH_LABEL[lead.class])}>
        <dl class="kvs">
          <div class="kv"><dt>{t('First reported')}</dt><dd>{fmtDate(lead.month)}</dd></div>
          <div class="kv"><dt>{t('Confidence')}</dt><dd><Est title={t('How strongly the reports point at something real')}>≈ {pct(lead.confidence_bp)}</Est></dd></div>
          <div class="kv"><dt>{t('Study')}</dt><dd>{researchMonths(lead.study_work)}</dd></div>
        </dl>
        <div class="form-actions">
          {following ? <Badge tone="gold" icon="clock">{t('Being followed')}</Badge> : (
            <Btn kind="primary" icon="search" disabled={busy} testid="tree-detail-follow-up" onClick={() => void act({ kind: 'investigate', lead: lead.handle }, 'tree-lead')}>{t('Follow up')}</Btn>
          )}
        </div>
        <ActionNote tag="tree-lead" />
      </Block>
    </Drawer>
  );
}

// ====================================================================================
// Civics
// ====================================================================================

function practiceWhy(obs: Observation, p: PracticeCard): string | null {
  if (p.state !== 'recognized') return null;
  if (!p.can_reform) {
    const unmet = p.known_requirements.find((r) => !r.satisfied);
    return unmet ? t('Requires: {text}', { text: tc(unmet.text) }) : t('Its real requirements are not yet met');
  }
  return reformBlock(obs, p);
}

function proposeReform(handle: string) {
  return (e?: MouseEvent) => {
    e?.stopPropagation();
    void act({ kind: 'propose_reform', practice: handle }, 'tree-reform');
  };
}

const PRACTICE_LANE = 'P';

export function CivicsTree() {
  useLocale();
  const s = useApp();
  const obs = s.obs;
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const chart = useRef<ChartApi | null>(null);
  const practices = obs?.culture.practices ?? [];
  // Referees before bts-protocol/2.1 send no era: fall back to the layered chart.
  const byEra = practices.some((c) => c.era !== undefined);

  const sig = practices.map((c) => c.handle + ':' + c.group + ':' + c.links.join(',')).join('|') + (byEra ? '#e' : '');
  const layout: TreeLayout | MatrixLayout = useMemo(() => {
    if (byEra) {
      const order = new Map<string, number>();
      for (const c of [...practices].sort((a, b) => a.recognized_month - b.recognized_month)) if (!order.has(c.group)) order.set(c.group, order.size);
      const nodes: MNode[] = practices.map((c, i) => ({
        id: c.handle, links: c.links, band: practiceBand(c), lane: PRACTICE_LANE,
        sort: String(order.get(c.group) ?? 0).padStart(3, '0') + (exclusiveGroup(c.name) ?? '~'), key: c.recognized_month * 1000 + i,
      }));
      return layoutMatrix(nodes, { cardW: CARD_W, cardH: CARD_H, gapX: 28, gapY: 18, laneOrder, maxSub: 4, rowsTarget: 6 });
    }
    const nodes: LNode[] = practices.map((c, i) => ({ id: c.handle, links: c.links, group: c.group, key: c.recognized_month * 1000 + i }));
    return layoutTree(nodes, { cardW: CARD_W, cardH: CARD_H, gapX: 76, gapY: 20, groupSort: true });
  }, [sig]);

  const arg = s.overlay === 'civics' ? s.overlayArg : null;
  useEffect(() => {
    if (arg && layout.placed.has(arg)) {
      setSelected(arg);
      chart.current?.centerOn(arg);
    }
  }, [arg]);
  useEffect(() => {
    if (selected && !layout.placed.has(selected)) setSelected(null);
  }, [layout]);
  useEscClosesDrawer(!!selected, () => setSelected(null));

  if (!obs) {
    return (
      <OverlayFrame icon="civics" title={t('Civics tree')} testid="overlay-civics">
        <StatePlate icon="civics" title={t('No civilization in view')}>{t('The civics tree shows the practices one civilization has recognized. Open it while playing or viewing a seat.')}</StatePlate>
      </OverlayFrame>
    );
  }

  const reforms = new Map(obs.projects.filter((p) => p.kind === 'reform' && p.target).map((p) => [p.target as string, p]));
  const byHandle = new Map(practices.map((c) => [c.handle, c]));
  const groupOrder: string[] = [];
  for (const c of [...practices].sort((a, b) => a.recognized_month - b.recognized_month)) if (!groupOrder.includes(c.group)) groupOrder.push(c.group);
  const hue = (group: string) => groupHue(Math.max(0, groupOrder.indexOf(group)));
  const match = matcher(query);
  const hit = (c: PracticeCard) => !match || match(c.name, tc(c.name), c.group, tc(c.group), c.behavior, tc(c.behavior), ...c.enables, ...tcAll(c.enables), t(PSTATE_LABEL[c.state]), exclusiveGroup(c.name) ? tc(exclusiveGroup(c.name)!) : '');
  const hits = match ? practices.filter(hit).map((c) => c.handle) : null;
  const firstHit = () => {
    if (!hits?.length) return;
    const q = query.trim().toLowerCase();
    const exact = practices.find((c) => hits.includes(c.handle) && (c.name.toLowerCase() === q || tc(c.name).toLowerCase() === q));
    const best = exact ? layout.placed.get(exact.handle) : hits.map((id) => layout.placed.get(id)!).filter(Boolean).sort((a, b) => a.col - b.col || a.row - b.row)[0];
    if (best) { setSelected(best.id); chart.current?.centerOn(best.id); chart.current?.focusCard(best.id); }
  };
  const target = (arg && layout.placed.has(arg) ? arg : null)
    ?? practices.find((c) => c.state === 'reforming' || reforms.has(c.handle))?.handle
    ?? practices.find((c) => c.state === 'recognized' && c.can_reform)?.handle
    ?? practices.find((c) => c.state === 'recognized')?.handle
    ?? practices[practices.length - 1]?.handle ?? null;
  const sel = selected ? byHandle.get(selected) : undefined;
  const open = (id: string) => setSelected(id);
  const jump = (id: string) => { setSelected(id); chart.current?.centerOn(id); };

  // Exclusive pairs and tensions between recognized practices, drawn between their cards.
  const pairs: { a: string; b: string; kind: 'excl' | 'tension' }[] = [];
  const seen = new Set<string>();
  for (const c of practices) {
    for (const [list, kind] of [[c.exclusive_with ?? [], 'excl'], [c.tension_with ?? [], 'tension']] as const) {
      for (const h of list) {
        const k = [c.handle, h].sort().join('|') + kind;
        if (seen.has(k) || !layout.placed.has(h)) continue;
        seen.add(k);
        pairs.push({ a: c.handle, b: h, kind });
      }
    }
  }
  const centre = (id: string) => { const p = layout.placed.get(id)!; return [p.x + p.w / 2, p.y + p.h / 2] as const; };
  const underlay = pairs.length ? (
    <>
      <svg class="tree-rel" width={layout.width} height={layout.height} aria-hidden="true">
        {pairs.map((r) => {
          const [x1, y1] = centre(r.a);
          const [x2, y2] = centre(r.b);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} class={cx('tree-rel-line', 'is-' + r.kind)} data-a={r.a} data-b={r.b} />;
        })}
      </svg>
      {pairs.map((r) => {
        const pa = layout.placed.get(r.a)!;
        const pb = layout.placed.get(r.b)!;
        // a tag only between stacked neighbours, where it sits in the gap; farther pairs keep
        // the dashed line and the mark on each card, so no tag ever covers a card
        if (Math.abs(pa.x - pb.x) >= 1 || Math.abs(pa.y - pb.y) > pa.h + 40) return null;
        const top = pa.y < pb.y ? pa : pb;
        const y = top.y + top.h + (Math.abs(pa.y - pb.y) - top.h) / 2;
        const x = top.x + top.w / 2;
        return (
          <span class={cx('tree-rel-tag', 'is-' + r.kind)} style={{ left: x + 'px', top: y + 'px' }} data-testid={r.kind === 'excl' ? 'exclusive-marker' : 'tension-marker'}
            title={r.kind === 'excl' ? t('Exclusive: a polity holds only one of these') : t('In tension: both may be held, at a cost to stability')}>
            <Icon name={r.kind === 'excl' ? 'swap' : 'warn'} size={10} /> {r.kind === 'excl' ? t('one of') : t('tension')}
          </span>
        );
      })}
    </>
  ) : null;

  const renderCard = (id: string) => {
    const c = byHandle.get(id);
    const p = layout.placed.get(id);
    if (!c || !p) return null;
    const project = reforms.get(c.handle);
    const under = c.state === 'reforming' || !!project;
    const why = practiceWhy(obs, c);
    const holder = c.state === 'recognized' ? exclusiveHolder(obs, c) : undefined;
    const repealing = repealProject(obs, c);
    const done = project && project.work_needed > 0 ? Math.min(1, project.work_done / project.work_needed) : 0;
    const vis = under ? 'reforming' : c.state;
    return (
      <div class={cx('tcard', 'pcard', 'pcard-' + vis, selected === c.handle && 'is-selected', match && !hit(c) && 'is-dim', c.state === 'recognized' && c.can_reform && !why && !under && 'can-act', repealing && 'is-repealing')}
        role="button" tabIndex={0} data-testid="tree-card" data-handle={c.handle} data-state={c.state}
        aria-label={`${tc(c.name)} — ${t(PSTATE_LABEL[c.state])}`} aria-pressed={selected === c.handle}
        style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', '--g': hue(c.group) } as JSX.CSSProperties}
        onClick={() => open(c.handle)} onKeyDown={cardKeys(() => open(c.handle))}>
        <span class="tcard-art"><Art art={practiceArt(c.name, c.group, c.handle)} /><span class="tcard-glyph" title={t(PSTATE_HELP[c.state] ?? '')}><Icon name={PSTATE_ICON[c.state] ?? 'info'} size={13} /></span>
          {c.exclusive_with?.length || c.tension_with?.length ? (
            <span class="tcard-marks">
              {c.exclusive_with?.length ? <span class={cx('tcard-mark', holder ? 'is-bad' : 'is-info')} title={exclusiveGroup(c.name) ? t('Exclusive group: {name}', { name: tc(exclusiveGroup(c.name)!) }) : t('Exclusive group')}><Icon name="swap" size={11} /></span> : null}
              {c.tension_with?.length ? <span class="tcard-mark is-warn" title={t('In tension with another practice')}><Icon name="warn" size={11} /></span> : null}
            </span>
          ) : null}
        </span>
        <span class="tcard-main">
          <span class="tcard-kicker" title={tc(c.group)}>{tc(c.group)}</span>
          <span class="tcard-name">{tc(c.name)}</span>
          <span class="tcard-state">
            <span class="tcard-state-label">{repealing ? t('Repeal under way') : t(PSTATE_LABEL[c.state])}</span>
            {c.state !== 'recognized' || c.adoption_bp > 0 ? (
              <span class="pcard-adopt" title={t('Share of people who actually take part')}><span class="pcard-meter"><i style={{ width: (Math.min(10000, c.adoption_bp) / 100).toFixed(1) + '%' }} /></span><b>{pct(c.adoption_bp)}</b></span>
            ) : <span class="tcard-class">{c.load ? t('load {n}', { n: c.load }) : ''}</span>}
          </span>
          <span class="tcard-foot">
            {under ? (
              <span class="tcard-progress-text"><b>{project ? Math.round(done * 100) + '%' : ''}</b><span>{t('Reform under way')}</span></span>
            ) : c.state === 'recognized' ? (
              c.can_reform && !why ? (
                <>
                  <Btn small kind="primary" icon="scroll" disabled={s.busy} testid="tree-reform" onClick={proposeReform(c.handle)}>{t('Propose reform')}</Btn>
                  <span class="tcard-est">{workMonths(c.reform_work)}</span>
                </>
              ) : <span class="tcard-lock" title={why ?? undefined}><Icon name={holder ? 'swap' : 'lock'} size={11} /><span>{holder ? t('Repeal {name} first', { name: tc(holder.name) }) : why}</span></span>
            ) : (
              <>
                <span class="tcard-since">{c.load ? t('load {n}', { n: c.load }) : t('take part')}</span>
                <EnableIcons list={c.enables} />
              </>
            )}
          </span>
        </span>
        {under && project ? <span class="tcard-bar" aria-hidden="true"><i style={{ width: (done * 100).toFixed(1) + '%' }} /></span> : null}
      </div>
    );
  };

  const cellSummary = (cell: MatrixCell) => {
    const cards = cell.ids.map((h) => byHandle.get(h)).filter((c): c is PracticeCard => !!c);
    const order: PracticeCard['state'][] = ['recognized', 'reforming', 'enacted', 'established'];
    const col: Record<string, string> = { recognized: '#7a86b8', reforming: '#f1da98', enacted: '#7fae67', established: '#d9b765' };
    const shown = match ? cards.filter(hit).length : cards.length;
    return (
      <>
        <b>{match ? t('{n} of {total}', { n: shown, total: cards.length }) : cards.length}</b>
        <span class="tree-cellbar">{order.map((st) => { const n = cards.filter((c) => c.state === st).length; return n ? <i style={{ flex: n, background: col[st] }} title={`${t(PSTATE_LABEL[st])}: ${n}`} /> : null; })}</span>
        <small>{t('load {n}', { n: cards.filter((c) => c.state === 'established').reduce((a, c) => a + (c.load ?? 0), 0) })}</small>
      </>
    );
  };

  return (
    <OverlayFrame icon="civics" title={t('Civics tree')} kicker={t('The practices {name} lives by', { name: tc(obs.civ.name) })} testid="overlay-civics" class="tree-overlay"
      tabs={<Tabs active="civics" />}
      tools={<Search value={query} onChange={setQuery} onEnter={firstHit} count={hits ? hits.length : null} label={t('Search recognized practices')} />}>
      <div class="tree-main">
        <ReformQueue obs={obs} practices={practices} onOpen={jump} />
        <LoadNote obs={obs} />
        {practices.length === 0 ? (
          <StatePlate icon="civics" title={t('No practice has been recognized yet')}>{t('Practices are recognized by people living with what they build on.')}</StatePlate>
        ) : (
          <TreeChart layout={layout} viewKey={`${obs.match_id}:${obs.seat}:civics`} target={target} selected={selected} quiet={!!match} api={chart}
            label={t('Civics tree')} groupColor={hue} renderCard={renderCard} underlay={underlay}
            bandLabel={(b) => t(ERA_NAMES[b] ?? String(b))} laneLabel={() => t('Practices')} cellSummary={cellSummary}
            minimapColor={(id) => {
              const c = byHandle.get(id);
              if (!c || (match && !hit(c))) return null;
              return { recognized: '#7a86b8', reforming: '#f1da98', enacted: '#7fae67', established: '#d9b765' }[c.state];
            }} />
        )}
      </div>
      {sel ? <PracticeDrawer obs={obs} card={sel} project={reforms.get(sel.handle)} busy={s.busy} onClose={() => setSelected(null)} onOpen={jump} /> : null}
    </OverlayFrame>
  );
}

function ReformQueue({ obs, practices, onOpen }: { obs: Observation; practices: PracticeCard[]; onOpen: (id: string) => void }) {
  const running = obs.projects.filter((p) => p.kind === 'reform' || p.kind === 'repeal');
  const taking = practices.filter((p) => p.state === 'enacted');
  const mpr = Math.max(1, obs.months_per_round);
  return (
    <div class="tree-queue" data-testid="tree-queue">
      <span class="tree-queue-title"><Icon name="scroll" size={14} /> {t('Reforms')}</span>
      <div class="tree-queue-items">
        {running.length === 0 && taking.length === 0 ? <span class="tree-queue-empty">{t('No reform is under way.')}</span> : null}
        {running.map((p) => {
          const card = practices.find((c) => c.handle === p.target);
          const done = p.work_needed > 0 ? Math.min(1, p.work_done / p.work_needed) : 0;
          const blocked = p.blockers.length > 0 || p.paused;
          const eta = p.eta_months_low !== null && p.eta_months_high !== null
            ? roundsText(Math.max(1, Math.ceil(p.eta_months_low / mpr)), Math.max(1, Math.ceil(p.eta_months_high / mpr)))
            : p.paused ? t('Paused') : t('Stalled');
          return (
            <button type="button" class={cx('tree-q', blocked && 'is-blocked', p.kind === 'repeal' && 'is-repeal')} disabled={!card} data-testid="tree-queue-item"
              title={blocked ? (p.paused ? t('Paused') : tcAll(p.blockers).join('; ')) : t('Show this card')} onClick={() => card && onOpen(card.handle)}>
              <span class="tree-q-name">{blocked ? <Icon name="warn" size={11} /> : p.kind === 'repeal' ? <Icon name="cross" size={11} /> : null}{p.kind === 'repeal' && card ? t('Repeal: {name}', { name: tc(card.name) }) : card ? tc(card.name) : tc(p.title)}</span>
              <span class="tree-q-row"><span class="tree-q-bar"><i style={{ width: (done * 100).toFixed(1) + '%' }} /></span><b>{Math.round(done * 100)}%</b><Est title={t('An estimate from the pace of recent months')}>{eta}</Est></span>
            </button>
          );
        })}
        {taking.map((c) => (
          <button type="button" class="tree-q is-adopting" data-testid="tree-queue-item" title={t('Enacted; people are taking it up gradually')} onClick={() => onOpen(c.handle)}>
            <span class="tree-q-name">{tc(c.name)}</span>
            <span class="tree-q-row"><span class="tree-q-bar"><i style={{ width: (Math.min(10000, c.adoption_bp) / 100).toFixed(1) + '%' }} /></span><b>{pct(c.adoption_bp)}</b><span>{t('take part')}</span></span>
          </button>
        ))}
      </div>
      <span class="tree-queue-meters"><SlotsMeter obs={obs} /><LoadMeter obs={obs} compact /></span>
    </div>
  );
}

function PracticeDrawer({ obs, card, project, busy, onClose, onOpen }: {
  obs: Observation; card: PracticeCard; project: ProjectView | undefined; busy: boolean; onClose: () => void; onOpen: (id: string) => void;
}) {
  const why = practiceWhy(obs, card);
  const under = card.state === 'reforming' || !!project;
  const before = card.links.map((h) => obs.culture.practices.find((x) => x.handle === h)).filter((x): x is PracticeCard => !!x).map((x) => ({ id: x.handle, name: x.name }));
  const after = obs.culture.practices.filter((x) => x.links.includes(card.handle)).map((x) => ({ id: x.handle, name: x.name }));
  const hasRules = !!(card.exclusive_with?.length || card.tension_with?.length || canRepeal(obs, card) || repealProject(obs, card));
  return (
    <Drawer art={practiceArt(card.name, card.group, card.handle)} kicker={tc(card.group)} title={tc(card.name)} onClose={onClose} label={t('Card: {name}', { name: tc(card.name) })}
      badges={<><span class={cx('tree-state', 'is-' + card.state)} title={t(PSTATE_HELP[card.state] ?? '')}><Icon name={PSTATE_ICON[card.state] ?? 'info'} size={12} /> {t(PSTATE_LABEL[card.state])}</span><PracticePills card={card} eraName={(e) => t(ERA_NAMES[e] ?? String(e))} /></>}>
      <p class="tree-state-help">{t(PSTATE_HELP[card.state] ?? '')}</p>
      <LorePassage kind="practice" name={card.name} />
      <Block title={t('How people behave')}>
        <p>{tc(card.behavior)}</p>
        <EnableList list={card.enables} />
      </Block>
      <Block title={t('Adoption')} aside={pct(card.adoption_bp)}>
        <div class="progress-line">
          <Meter value={card.adoption_bp} max={10000} tone={card.state === 'established' ? 'gold' : card.state === 'enacted' ? 'ok' : 'muted'} label={t('Adoption {pct}', { pct: pct(card.adoption_bp) })} />
          <span class="progress-num"><b>{pct(card.adoption_bp)}</b> <small>{t('take part')}</small></span>
        </div>
        <p class="muted small">{t('The share of people who actually take part. It moves gradually; nothing adopts a practice at once.')}</p>
        {card.load ? <p class="muted small">{t('While established it adds {n} to institutional load ({used} of {capacity} now).', { n: card.load, used: obs.culture.load?.used ?? 0, capacity: obs.culture.load?.capacity ?? 0 })}</p> : null}
      </Block>
      <Block title={t('What it really takes')}>
        <p>{tc(card.requirements)}</p>
        <p class="sub-label">{t('Known requirements')}</p>
        {card.known_requirements.length
          ? <Checklist items={tcChecks(card.known_requirements)} />
          : <p class="muted small">{t('None that we know of.')}</p>}
      </Block>
      {hasRules ? <Block title={t('Rules of holding')}><PracticeRules obs={obs} card={card} onOpen={onOpen} tag="tree-repeal" /></Block> : null}
      {card.state === 'recognized' || under ? (
        <Block title={t('Reform')} aside={t('{n} at the capital', { n: workMonths(card.reform_work) })}>
          {project ? (
            <div class="progress-line">
              <Meter value={project.work_done} max={Math.max(1, project.work_needed)} tone="gold" label={t('{done} of {needed} done', { done: work(project.work_done), needed: workMonths(project.work_needed) })} />
              <span class="progress-num"><b>{work(project.work_done)}</b> / {work(project.work_needed)} <small>{t('worker-months')}</small></span>
            </div>
          ) : null}
          {project && project.blockers.length ? <ul class="blockers">{tcAll(project.blockers).map((b) => <li><Icon name="warn" size={11} /> {b}</li>)}</ul> : null}
          {obs.culture.load && obs.culture.load.used > obs.culture.load.capacity && !under ? <p class="note is-warn small"><Icon name="warn" size={12} /> {t('Institutions are over capacity: this reform would take half as much work again.')}</p> : null}
          <div class="form-actions">
            {under ? <Badge tone="gold" icon="clock">{t('Reform under way')}</Badge> : (
              <Btn kind="primary" icon="scroll" why={why} disabled={busy} testid="tree-detail-reform" onClick={proposeReform(card.handle)}>{t('Propose reform')}</Btn>
            )}
            {why && !under ? <Why>{why}</Why> : null}
          </div>
          <ActionNote tag="tree-reform" />
        </Block>
      ) : null}
      <Block title={t('Connections')}><Connections before={before} after={after} onOpen={onOpen} /></Block>
      <Block title={t('Record')}>
        <dl class="kvs">
          <div class="kv"><dt>{t('Source')}</dt><dd>{tc(card.source)}</dd></div>
          <div class="kv"><dt>{t('Recognized')}</dt><dd>{fmtDate(card.recognized_month)}</dd></div>
        </dl>
      </Block>
    </Drawer>
  );
}
