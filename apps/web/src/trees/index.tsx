// Technology tree and civics tree: two full-screen charts of illustrated cards
// joined by drawn links. They show the seat's own Observation and nothing else:
// only disclosed cards, only disclosed links, no totals and no empty places for
// what has not been discovered.
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Lead, Observation, PracticeCard, ProjectView, TechCard } from '../protocol';
import { KSTATE_LABEL, PSTATE_LABEL, RESEARCH_LABEL, fmtDate, pct, tcAll, tcChecks } from '../format';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Est, Meter, Why, cx, work } from '../ui';
import { act, openOverlay, useApp } from '../store';
import { t, tc, useLocale } from '../i18n';
import { OverlayFrame, StatePlate } from '../theme/overlay';
import { layoutTree } from './layout';
import type { LNode, TreeLayout } from './layout';
import { Art, TreeChart } from './TreeView';
import type { ChartApi } from './TreeView';
import { enableIcon, groupHue, practiceArt, techArt } from './art';
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
  return { text: roundsText(rounds, rounds), title: t('Estimate: {n} work left at the full {label} capacity of {cap} work per month. Sharing that capacity, or shortages, make it slower.', { n: work(left), label, cap: work(cap) }) };
}

function techWhy(card: TechCard, under: boolean): string | null {
  if (under) return t('This investigation is already under way');
  if (card.can_investigate) return null;
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

export function TechTree() {
  useLocale();
  const s = useApp();
  const obs = s.obs;
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const chart = useRef<ChartApi | null>(null);
  const techs = obs?.knowledge.techs ?? [];
  const leads = obs?.knowledge.leads ?? [];

  const sig = techs.map((c) => c.handle + ':' + c.links.join(',')).join('|') + '#' + leads.map((l) => l.handle).join(',');
  const layout: TreeLayout = useMemo(() => {
    const nodes: LNode[] = techs.map((c, i) => ({ id: c.handle, links: c.links, group: c.field, key: c.discovered_month * 1000 + i }));
    return layoutTree(nodes, { cardW: CARD_W, cardH: CARD_H, gapX: 76, gapY: 20, groupSort: false, frontier: leads.map((l) => ({ id: leadId(l.handle), h: LEAD_H })) });
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
  const fieldIdx = new Map(layout.groups.map((g, i) => [g, i]));
  const hue = (field: string) => groupHue(fieldIdx.get(field) ?? 0);
  const match = matcher(query);
  const techHit = (c: TechCard) => !match || match(c.name, tc(c.name), c.field, tc(c.field), c.capability, tc(c.capability), ...c.enables, ...tcAll(c.enables), t(KSTATE_LABEL[c.state]));
  const leadHit = (l: Lead) => !match || match(l.title, tc(l.title), l.detail, tc(l.detail), l.source, tc(l.source));
  const hits = match ? [...techs.filter(techHit).map((c) => c.handle), ...leads.filter(leadHit).map((l) => leadId(l.handle))] : null;
  const firstHit = () => {
    if (!hits?.length) return;
    const best = hits.map((id) => layout.placed.get(id)!).filter(Boolean).sort((a, b) => a.col - b.col || a.row - b.row)[0];
    if (best) { setSelected(best.id); chart.current?.centerOn(best.id); chart.current?.focusCard(best.id); }
  };

  const target = (arg && layout.placed.has(arg) ? arg : null)
    ?? techs.find((c) => c.state === 'investigating' || projects.has(c.handle))?.handle
    ?? techs.find((c) => c.can_investigate && c.state === 'discovered')?.handle
    ?? (leads.length ? leadId(leads[0].handle) : null)
    ?? techs[techs.length - 1]?.handle ?? null;

  const selCard = selected ? techs.find((c) => c.handle === selected) : undefined;
  const selLead = selected && !selCard ? leads.find((l) => leadId(l.handle) === selected) : undefined;
  const open = (id: string) => setSelected(id);
  const jump = (id: string) => { setSelected(id); chart.current?.centerOn(id); };

  return (
    <OverlayFrame icon="techtree" title={t('Technology tree')} kicker={t('What {name} has discovered', { name: tc(obs.civ.name) })} testid="overlay-tech" class="tree-overlay"
      tabs={<Tabs active="tech" />}
      tools={<Search value={query} onChange={setQuery} onEnter={firstHit} count={hits ? hits.length : null} label={t('Search discovered cards')} />}>
      <div class="tree-main">
        <ResearchQueue obs={obs} techs={techs} onOpen={jump} />
        {techs.length + leads.length === 0 ? (
          <StatePlate icon="techtree" title={t('Nothing has been discovered yet')}>{t('Cards appear here as your people meet problems, follow leads and learn from others.')}</StatePlate>
        ) : (
          <TreeChart layout={layout} viewKey={`${obs.match_id}:${obs.seat}:tech`} target={target} selected={selected} quiet={!!match} api={chart}
            label={t('Technology tree')} groupColor={hue} frontierLabel={t('Frontier')} frontierHint={t('Unexplained reports. A short study may turn one into a question.')}>
            {techs.map((c) => {
              const p = layout.placed.get(c.handle);
              if (!p) return null;
              const project = projects.get(c.handle);
              const under = c.state === 'investigating' || !!project;
              const est = techEstimate(obs, c, project);
              const why = c.state === 'discovered' || c.state === 'hinted' ? techWhy(c, under) : null;
              const done = c.work_needed > 0 ? Math.min(1, c.work_done / c.work_needed) : 0;
              const vis = under ? 'investigating' : c.state;
              return (
                <div class={cx('tcard', 'tcard-' + vis, selected === c.handle && 'is-selected', match && !techHit(c) && 'is-dim', !under && c.can_investigate && c.state === 'discovered' && 'can-act')}
                  role="button" tabIndex={0} data-testid="tree-card" data-handle={c.handle} data-state={c.state}
                  aria-label={`${tc(c.name)} — ${t(KSTATE_LABEL[c.state])}`} aria-pressed={selected === c.handle}
                  style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', '--g': hue(c.field) } as JSX.CSSProperties}
                  onClick={() => open(c.handle)} onKeyDown={cardKeys(() => open(c.handle))}>
                  <span class="tcard-art"><Art art={techArt(c.name, c.field, c.handle)} /><span class="tcard-glyph" title={t(KSTATE_HELP[c.state] ?? '')}><Icon name={KSTATE_ICON[c.state] ?? 'info'} size={13} /></span></span>
                  <span class="tcard-main">
                    <span class="tcard-kicker" title={tc(c.field)}>{tc(c.field)}</span>
                    <span class="tcard-name">{tc(c.name)}</span>
                    <span class="tcard-state">
                      <span class="tcard-state-label">{t(KSTATE_LABEL[c.state])}</span>
                      {c.label !== 'established' ? <LabelBadge label={c.label} /> : null}
                      <span class="tcard-class" title={t(RESEARCH_LABEL[c.class])}>{t(RESEARCH_LABEL[c.class])}</span>
                    </span>
                    <span class="tcard-foot">
                      {under ? (
                        <span class="tcard-progress-text"><b>{Math.round(done * 100)}%</b>{est ? <Est title={est.title}>{est.text}</Est> : null}</span>
                      ) : c.state === 'discovered' || c.state === 'hinted' ? (
                        c.can_investigate ? (
                          <>
                            <Btn small kind="primary" icon="flask" disabled={s.busy} testid="tree-investigate" onClick={investigate(c.handle, 'tree-research')}>{t('Investigate')}</Btn>
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
            })}
            {leads.map((l) => {
              const id = leadId(l.handle);
              const p = layout.placed.get(id);
              if (!p) return null;
              return (
                <div class={cx('tcard', 'tcard-lead', selected === id && 'is-selected', match && !leadHit(l) && 'is-dim')} role="button" tabIndex={0}
                  data-testid="tree-lead" data-handle={id} aria-label={tc(l.title)} aria-pressed={selected === id}
                  style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' }}
                  onClick={() => open(id)} onKeyDown={cardKeys(() => open(id))}>
                  <span class="tcard-art is-mystery"><span class="tcard-mystery">?</span></span>
                  <span class="tcard-main">
                    <span class="tcard-kicker">{tc(l.source)}</span>
                    <span class="tcard-name">{tc(l.title)}</span>
                    <span class="tcard-state">
                      <span class="tcard-state-label"><Est title={t('How strongly the reports point at something real')}>{t('confidence ≈ {pct}', { pct: pct(l.confidence_bp) })}</Est></span>
                      <span class="tcard-class">{t('{n} work', { n: work(l.study_work) })}</span>
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
            })}
          </TreeChart>
        )}
      </div>
      {selCard ? <TechDrawer obs={obs} card={selCard} project={projects.get(selCard.handle)} busy={s.busy} onClose={() => setSelected(null)} onOpen={jump} /> : null}
      {selLead ? <LeadDrawer lead={selLead} following={following.has(selLead.handle)} busy={s.busy} onClose={() => setSelected(null)} /> : null}
    </OverlayFrame>
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
      <div class="tree-queue-cap" role="group" aria-label={t('Research capacity in use, in work per month')}>
        {lines.length === 0 ? <span class="tree-cap is-idle"><Icon name="warn" size={11} /> {t('No research capacity yet')}</span> : lines.map((l) => {
          const full = t(RESEARCH_LABEL[l.class]);
          const idle = l.capacity > 0 && l.used === 0;
          return (
            <span class={cx('tree-cap', idle && 'is-idle')} title={t('{label}: {used} of {capacity} work per month in use', { label: full, used: work(l.used), capacity: work(l.capacity) }) + (idle ? ' — ' + t('none of it is in use') : '')}>
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
  const why = canAct ? techWhy(card, under) : null;
  const est = techEstimate(obs, card, project);
  const before = card.links.map((h) => obs.knowledge.techs.find((x) => x.handle === h)).filter((x): x is TechCard => !!x).map((x) => ({ id: x.handle, name: x.name }));
  const after = obs.knowledge.techs.filter((x) => x.links.includes(card.handle)).map((x) => ({ id: x.handle, name: x.name }));
  return (
    <Drawer art={techArt(card.name, card.field, card.handle)} kicker={tc(card.field)} title={tc(card.name)} onClose={onClose} label={t('Card: {name}', { name: tc(card.name) })}
      badges={<><span class={cx('tree-state', 'is-' + card.state)} title={t(KSTATE_HELP[card.state] ?? '')}><Icon name={KSTATE_ICON[card.state] ?? 'info'} size={12} /> {t(KSTATE_LABEL[card.state])}</span><LabelBadge label={card.label} /></>}>
      <p class="tree-state-help">{t(KSTATE_HELP[card.state] ?? '')}</p>
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
          <Meter value={card.work_done} max={Math.max(1, card.work_needed)} tone={under ? 'gold' : 'ok'} label={t('{done} of {needed} work', { done: work(card.work_done), needed: work(card.work_needed) })} />
          <span class="progress-num"><b>{work(card.work_done)}</b> / {work(card.work_needed)} <small>{t('work')}</small></span>
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
          <div class="kv"><dt>{t('Study')}</dt><dd>{t('{n} work', { n: work(lead.study_work) })}</dd></div>
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

function practiceWhy(p: PracticeCard): string | null {
  if (p.state !== 'recognized' || p.can_reform) return null;
  const unmet = p.known_requirements.find((r) => !r.satisfied);
  return unmet ? t('Requires: {text}', { text: tc(unmet.text) }) : t('Its real requirements are not yet met');
}

function proposeReform(handle: string) {
  return (e?: MouseEvent) => {
    e?.stopPropagation();
    void act({ kind: 'propose_reform', practice: handle }, 'tree-reform');
  };
}

export function CivicsTree() {
  useLocale();
  const s = useApp();
  const obs = s.obs;
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const chart = useRef<ChartApi | null>(null);
  const practices = obs?.culture.practices ?? [];

  const sig = practices.map((c) => c.handle + ':' + c.group + ':' + c.links.join(',')).join('|');
  const layout: TreeLayout = useMemo(() => {
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
  const groupIdx = new Map(layout.groups.map((g, i) => [g, i]));
  const hue = (group: string) => groupHue(groupIdx.get(group) ?? 0);
  const match = matcher(query);
  const hit = (c: PracticeCard) => !match || match(c.name, tc(c.name), c.group, tc(c.group), c.behavior, tc(c.behavior), ...c.enables, ...tcAll(c.enables), t(PSTATE_LABEL[c.state]));
  const hits = match ? practices.filter(hit).map((c) => c.handle) : null;
  const firstHit = () => {
    if (!hits?.length) return;
    const best = hits.map((id) => layout.placed.get(id)!).filter(Boolean).sort((a, b) => a.col - b.col || a.row - b.row)[0];
    if (best) { setSelected(best.id); chart.current?.centerOn(best.id); chart.current?.focusCard(best.id); }
  };
  const target = (arg && layout.placed.has(arg) ? arg : null)
    ?? practices.find((c) => c.state === 'reforming' || reforms.has(c.handle))?.handle
    ?? practices.find((c) => c.state === 'recognized' && c.can_reform)?.handle
    ?? practices.find((c) => c.state === 'recognized')?.handle
    ?? practices[practices.length - 1]?.handle ?? null;
  const sel = selected ? practices.find((c) => c.handle === selected) : undefined;
  const open = (id: string) => setSelected(id);
  const jump = (id: string) => { setSelected(id); chart.current?.centerOn(id); };

  return (
    <OverlayFrame icon="civics" title={t('Civics tree')} kicker={t('The practices {name} lives by', { name: tc(obs.civ.name) })} testid="overlay-civics" class="tree-overlay"
      tabs={<Tabs active="civics" />}
      tools={<Search value={query} onChange={setQuery} onEnter={firstHit} count={hits ? hits.length : null} label={t('Search recognized practices')} />}>
      <div class="tree-main">
        <ReformQueue obs={obs} practices={practices} onOpen={jump} />
        {practices.length === 0 ? (
          <StatePlate icon="civics" title={t('No practice has been recognized yet')}>{t('Practices are recognized by people living with what they build on.')}</StatePlate>
        ) : (
          <TreeChart layout={layout} viewKey={`${obs.match_id}:${obs.seat}:civics`} target={target} selected={selected} quiet={!!match} api={chart}
            label={t('Civics tree')} groupColor={hue}>
            {practices.map((c) => {
              const p = layout.placed.get(c.handle);
              if (!p) return null;
              const project = reforms.get(c.handle);
              const under = c.state === 'reforming' || !!project;
              const why = practiceWhy(c);
              const done = project && project.work_needed > 0 ? Math.min(1, project.work_done / project.work_needed) : 0;
              const vis = under ? 'reforming' : c.state;
              return (
                <div class={cx('tcard', 'pcard', 'pcard-' + vis, selected === c.handle && 'is-selected', match && !hit(c) && 'is-dim', c.state === 'recognized' && c.can_reform && !under && 'can-act')}
                  role="button" tabIndex={0} data-testid="tree-card" data-handle={c.handle} data-state={c.state}
                  aria-label={`${tc(c.name)} — ${t(PSTATE_LABEL[c.state])}`} aria-pressed={selected === c.handle}
                  style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', '--g': hue(c.group) } as JSX.CSSProperties}
                  onClick={() => open(c.handle)} onKeyDown={cardKeys(() => open(c.handle))}>
                  <span class="tcard-art"><Art art={practiceArt(c.name, c.group, c.handle)} /><span class="tcard-glyph" title={t(PSTATE_HELP[c.state] ?? '')}><Icon name={PSTATE_ICON[c.state] ?? 'info'} size={13} /></span></span>
                  <span class="tcard-main">
                    <span class="tcard-name is-tall">{tc(c.name)}</span>
                    <span class="tcard-state">
                      <span class="tcard-state-label">{t(PSTATE_LABEL[c.state])}</span>
                      {c.state !== 'recognized' || c.adoption_bp > 0 ? (
                        <span class="pcard-adopt" title={t('Share of people who actually take part')}><span class="pcard-meter"><i style={{ width: (Math.min(10000, c.adoption_bp) / 100).toFixed(1) + '%' }} /></span><b>{pct(c.adoption_bp)}</b></span>
                      ) : null}
                    </span>
                    <span class="tcard-foot">
                      {under ? (
                        <span class="tcard-progress-text"><b>{project ? Math.round(done * 100) + '%' : ''}</b><span>{t('Reform under way')}</span></span>
                      ) : c.state === 'recognized' ? (
                        c.can_reform ? (
                          <>
                            <Btn small kind="primary" icon="scroll" disabled={s.busy} testid="tree-reform" onClick={proposeReform(c.handle)}>{t('Propose reform')}</Btn>
                            <span class="tcard-est">{t('{n} work', { n: work(c.reform_work) })}</span>
                          </>
                        ) : <span class="tcard-lock" title={why ?? undefined}><Icon name="lock" size={11} /><span>{why}</span></span>
                      ) : (
                        <>
                          <span class="tcard-since">{t('take part')}</span>
                          <EnableIcons list={c.enables} />
                        </>
                      )}
                    </span>
                  </span>
                  {under && project ? <span class="tcard-bar" aria-hidden="true"><i style={{ width: (done * 100).toFixed(1) + '%' }} /></span> : null}
                </div>
              );
            })}
          </TreeChart>
        )}
      </div>
      {sel ? <PracticeDrawer obs={obs} card={sel} project={reforms.get(sel.handle)} busy={s.busy} onClose={() => setSelected(null)} onOpen={jump} /> : null}
    </OverlayFrame>
  );
}

function ReformQueue({ obs, practices, onOpen }: { obs: Observation; practices: PracticeCard[]; onOpen: (id: string) => void }) {
  const running = obs.projects.filter((p) => p.kind === 'reform');
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
            <button type="button" class={cx('tree-q', blocked && 'is-blocked')} disabled={!card} data-testid="tree-queue-item"
              title={blocked ? (p.paused ? t('Paused') : tcAll(p.blockers).join('; ')) : t('Show this card')} onClick={() => card && onOpen(card.handle)}>
              <span class="tree-q-name">{blocked ? <Icon name="warn" size={11} /> : null}{card ? tc(card.name) : tc(p.title)}</span>
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
    </div>
  );
}

function PracticeDrawer({ obs, card, project, busy, onClose, onOpen }: {
  obs: Observation; card: PracticeCard; project: ProjectView | undefined; busy: boolean; onClose: () => void; onOpen: (id: string) => void;
}) {
  const why = practiceWhy(card);
  const under = card.state === 'reforming' || !!project;
  const before = card.links.map((h) => obs.culture.practices.find((x) => x.handle === h)).filter((x): x is PracticeCard => !!x).map((x) => ({ id: x.handle, name: x.name }));
  const after = obs.culture.practices.filter((x) => x.links.includes(card.handle)).map((x) => ({ id: x.handle, name: x.name }));
  return (
    <Drawer art={practiceArt(card.name, card.group, card.handle)} kicker={tc(card.group)} title={tc(card.name)} onClose={onClose} label={t('Card: {name}', { name: tc(card.name) })}
      badges={<span class={cx('tree-state', 'is-' + card.state)} title={t(PSTATE_HELP[card.state] ?? '')}><Icon name={PSTATE_ICON[card.state] ?? 'info'} size={12} /> {t(PSTATE_LABEL[card.state])}</span>}>
      <p class="tree-state-help">{t(PSTATE_HELP[card.state] ?? '')}</p>
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
      </Block>
      <Block title={t('What it really takes')}>
        <p>{tc(card.requirements)}</p>
        <p class="sub-label">{t('Known requirements')}</p>
        {card.known_requirements.length
          ? <Checklist items={tcChecks(card.known_requirements)} />
          : <p class="muted small">{t('None that we know of.')}</p>}
      </Block>
      {card.state === 'recognized' || under ? (
        <Block title={t('Reform')} aside={t('{n} work at the capital', { n: work(card.reform_work) })}>
          {project ? (
            <div class="progress-line">
              <Meter value={project.work_done} max={Math.max(1, project.work_needed)} tone="gold" label={t('{done} of {needed} work', { done: work(project.work_done), needed: work(project.work_needed) })} />
              <span class="progress-num"><b>{work(project.work_done)}</b> / {work(project.work_needed)} <small>{t('work')}</small></span>
            </div>
          ) : null}
          {project && project.blockers.length ? <ul class="blockers">{tcAll(project.blockers).map((b) => <li><Icon name="warn" size={11} /> {b}</li>)}</ul> : null}
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
