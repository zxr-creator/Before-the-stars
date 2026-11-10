// Knowledge: Frontier, Known graph, Implementation, History. Only disclosed
// cards exist in this client; the layout is computed from them alone, so there
// are no empty slots, counts or silhouettes for anything not yet discovered.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { KnowledgeState, Lead, Observation, TechCard } from '../protocol';
import { KSTATE_LABEL, KSTATE_ORDER, RESEARCH_LABEL, fmtDate, pct, tcAll, tcChecks, tn, tx, yearOf } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Empty, Est, Meter, Section, Tabs, Why, cx, work } from '../ui';
import type { Tone } from '../ui';
import { act, consumeIntent, setWide, useApp } from '../store';
import { StudyForm } from './projects';

type View = 'frontier' | 'graph' | 'implementation' | 'history';

const STATE_TONE: Record<KnowledgeState, Tone> = {
  hinted: 'muted', discovered: 'info', investigating: 'gold', understood: 'ok', prototyped: 'ok', adopted: 'accent',
};
const STATE_HELP: Record<KnowledgeState, string> = {
  hinted: 'A rumour or clue; not yet a workable question',
  discovered: 'A workable question that can be investigated',
  investigating: 'Under investigation',
  understood: 'Reproducible knowledge; not yet put to work',
  prototyped: 'A demonstrated method; first installations exist',
  adopted: 'Functioning capacity in ordinary use',
};

export function StateBadge({ state }: { state: KnowledgeState }) {
  useLocale();
  const step = KSTATE_ORDER.indexOf(state);
  return (
    <span class={cx('state-badge', 'state-' + state)} title={t(STATE_HELP[state])}>
      <span class="state-pips" aria-hidden="true">{KSTATE_ORDER.slice(1).map((_, i) => <i class={i < step ? 'on' : undefined} />)}</span>
      {t(KSTATE_LABEL[state])}
    </span>
  );
}

export function LabelBadge({ label }: { label: string }) {
  useLocale();
  if (label === 'extrapolated') return <Badge tone="info" title={t('Extrapolated from present-day science')}>{t('Extrapolated')}</Badge>;
  if (label === 'fictional') return <Badge tone="gold" title={t('Fictional science invented for this game')}>{t('Fictional')}</Badge>;
  return null;
}

function reasonCannot(card: TechCard, busyHandles: Set<string>): string | null {
  if (card.state === 'investigating' || busyHandles.has(card.handle)) return t('This investigation is already under way');
  if (card.can_investigate) return null;
  const m = card.known_requirements.find((r) => !r.satisfied);
  if (m) return t('Requires: {text}', { text: tc(m.text) });
  if (card.unknown_requirements) return t('Depends on further knowledge not yet identified');
  return t('Investigators lack something this work depends on');
}

export function KnowledgePanel() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const [view, setView] = useState<View>('frontier');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const it = s.intent;
    if (it?.kind === 'knowledge-view') { setView(it.view); setDetail(null); consumeIntent(); }
    else if (it?.kind === 'tech') { setDetail(it.handle); consumeIntent(); }
  }, [s.intent?.nonce]);

  useEffect(() => {
    setWide(view === 'graph' && !detail);
    return () => setWide(false);
  }, [view, detail]);

  const k = obs.knowledge;
  const open = (h: string) => setDetail(h);
  const card = detail ? k.techs.find((x) => x.handle === detail) : null;

  if (card) return <TechDetail obs={obs} t={card} onBack={() => setDetail(null)} onOpen={open} />;

  const questions = k.techs.filter((x) => x.state === 'discovered' || x.state === 'investigating');
  return (
    <div class="panel knowledge">
      <Tabs label={t('Knowledge views')} value={view} onChange={setView} tabs={[
        { key: 'frontier', label: t('Frontier'), count: k.leads.length + questions.length },
        { key: 'graph', label: t('Known graph') },
        { key: 'implementation', label: t('Implementation') },
        { key: 'history', label: t('History') },
      ]} />
      {view === 'frontier' ? <Frontier obs={obs} onOpen={open} /> : null}
      {view === 'graph' ? <Graph techs={k.techs} onOpen={open} /> : null}
      {view === 'implementation' ? <Implementation techs={k.techs} onOpen={open} /> : null}
      {view === 'history' ? <History techs={k.techs} leads={k.leads} onOpen={open} /> : null}
    </div>
  );
}

// --- Frontier ------------------------------------------------------------------

function Frontier({ obs, onOpen }: { obs: Observation; onOpen: (h: string) => void }) {
  const s = useApp();
  const k = obs.knowledge;
  const [showStudy, setShowStudy] = useState(false);
  const followed = new Set(obs.projects.filter((p) => p.kind === 'lead').map((p) => p.target));
  const researching = new Set(obs.projects.filter((p) => p.kind === 'research').map((p) => p.target ?? ''));
  const questions = k.techs.filter((x) => x.state === 'discovered' || x.state === 'investigating')
    .sort((a, b) => Number(b.state === 'investigating') - Number(a.state === 'investigating') || Number(b.can_investigate) - Number(a.can_investigate) || a.discovered_month - b.discovered_month);
  const cap = obs.civ.research;
  return (
    <>
      <p class="panel-lede">{t('Current questions and clues. Nothing here promises a result: a lead may come to little, and a question may need knowledge nobody has named yet.')}</p>
      {cap.length ? (
        <p class="cap-inline">
          {cap.map((l, i) => <span>{i ? ' · ' : ''}{tx('{label}: {used}/{capacity} {unit}', { label: t(RESEARCH_LABEL[l.class]), used: <b>{work(l.used)}</b>, capacity: work(l.capacity), unit: <small>{t('work per month in use')}</small> })}</span>)}
        </p>
      ) : <p class="note is-warn">{t('No research capacity yet: investigations will not advance until qualified people staff a makers’ circle or institute.')}</p>}
      {k.scientific_method ? <p class="note is-ok"><Icon name="good" size={13} /> {t('The scientific method is established: technology can be pursued as an explicit agenda.')}</p> : null}

      <Section title={t('Leads')} aside={<small class="muted">{tn(k.leads.length, '{n} unexplained report', '{n} unexplained reports')}</small>}>
        {k.leads.length === 0 ? <Empty>{t('No open leads. New ones come from practice, contact, instruments and exploratory study.')}</Empty> : (
          <ul class="lead-list">
            {k.leads.map((l) => <li><LeadCard l={l} following={followed.has(l.handle)} busy={s.busy} /></li>)}
          </ul>
        )}
        <ActionNote tag="lead" />
      </Section>

      <Section title={t('Open questions')} aside={<small class="muted">{t('{n} workable', { n: questions.length })}</small>}>
        {questions.length === 0 ? <Empty>{t('No workable question is waiting. Follow up a lead, or keep practising: experience turns problems into questions.')}</Empty> : (
          <ul class="question-list">
            {questions.map((q) => {
              const why = reasonCannot(q, researching);
              const active = q.state === 'investigating' || researching.has(q.handle);
              return (
                <li class={cx('card question', active && 'is-active')} data-testid="question-card">
                  <div class="question-main">
                    <button type="button" class="linklike question-name" onClick={() => onOpen(q.handle)}>{tc(q.name)}</button>
                    <span class="kicker">{tc(q.field)}</span>
                    <p class="question-cap">{tc(q.capability)}</p>
                    <div class="question-meta">
                      <StateBadge state={q.state} /> <LabelBadge label={q.label} />
                      <span class="muted small">{t('{label} · {n} work', { label: t(RESEARCH_LABEL[q.class]), n: work(q.work_needed) })}</span>
                    </div>
                    {q.work_done > 0 || active ? <Meter value={q.work_done} max={Math.max(1, q.work_needed)} tone="gold" height={6} label={t('{done} of {needed} work done', { done: work(q.work_done), needed: work(q.work_needed) })} /> : null}
                  </div>
                  <div class="question-act">
                    {active ? <Badge tone="gold" icon="clock">{t('Under way')}</Badge> : (
                      <Btn small kind="primary" why={why} disabled={s.busy} testid="investigate" onClick={() => void act({ kind: 'start_project', spec: { kind: 'research', tech: q.handle }, priority: null }, 'research')}>{t('Investigate')}</Btn>
                    )}
                    {!active && why ? <Why>{why}</Why> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <ActionNote tag="research" />
      </Section>

      <Section title={t('Exploratory study')} aside={<button type="button" class="linklike" aria-expanded={showStudy} data-testid="toggle-study" onClick={() => setShowStudy(!showStudy)}>{showStudy ? t('Hide') : tn(k.domains.length, '{n} domain', '{n} domains')}</button>}>
        {showStudy ? <StudyForm obs={obs} /> : <p class="muted small">{t('Fund a bounded study of a domain you already practise. It yields evidence, not a chosen discovery.')}</p>}
      </Section>
    </>
  );
}

function LeadCard({ l, following, busy }: { l: Lead; following: boolean; busy: boolean }) {
  return (
    <div class="card lead" data-testid="lead-card">
      <div class="lead-main">
        <b>{tc(l.title)}</b>
        <p>{tc(l.detail)}</p>
        <p class="muted small">{tx('{source} · reported {date} · {confidence} · {label}, {n} work', {
          source: tc(l.source), date: fmtDate(l.month),
          confidence: <Est title={t('How strongly the reports point at something real')}>{t('confidence ≈ {pct}', { pct: pct(l.confidence_bp) })}</Est>,
          label: t(RESEARCH_LABEL[l.class]), n: work(l.study_work),
        })}</p>
      </div>
      {following ? <Badge tone="gold" icon="clock">{t('Being followed')}</Badge> : (
        <Btn small disabled={busy} testid="follow-up" onClick={() => void act({ kind: 'investigate', lead: l.handle }, 'lead')}>{t('Follow up')}</Btn>
      )}
    </div>
  );
}

// --- Known graph -----------------------------------------------------------------

const NODE_W = 178;
const NODE_H = 66;
const COL_GAP = 46;
const ROW_GAP = 12;

interface Placed { t: TechCard; col: number; row: number; x: number; y: number }

/** Layered left-to-right layout over disclosed cards and disclosed links only. */
export function layoutGraph(techs: TechCard[]): { nodes: Placed[]; edges: [Placed, Placed][]; width: number; height: number } {
  const by = new Map(techs.map((t) => [t.handle, t]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (h: string): number => {
    const d = depth.get(h);
    if (d !== undefined) return d;
    if (visiting.has(h)) return 0; // defensive: disclosed links should be acyclic
    visiting.add(h);
    const t = by.get(h)!;
    let best = 0;
    for (const l of t.links) if (by.has(l)) best = Math.max(best, depthOf(l) + 1);
    visiting.delete(h);
    depth.set(h, best);
    return best;
  };
  techs.forEach((t) => depthOf(t.handle));
  const cols: TechCard[][] = [];
  for (const t of techs) {
    const c = depth.get(t.handle)!;
    (cols[c] ??= []).push(t);
  }
  const rowOf = new Map<string, number>();
  const stable = (a: TechCard, b: TechCard) => a.discovered_month - b.discovered_month || a.name.localeCompare(b.name);
  cols.forEach((col, ci) => {
    if (ci === 0) col.sort((a, b) => a.field.localeCompare(b.field) || stable(a, b));
    else {
      const bary = (t: TechCard) => {
        const rows = t.links.filter((l) => rowOf.has(l)).map((l) => rowOf.get(l)!);
        return rows.length ? rows.reduce((x, y) => x + y, 0) / rows.length : 1e6;
      };
      col.sort((a, b) => bary(a) - bary(b) || stable(a, b));
    }
    // Place near parents without overlap: each card takes the first free row at or after its barycentre.
    let next = 0;
    for (const t of col) {
      const rows = t.links.filter((l) => rowOf.has(l)).map((l) => rowOf.get(l)!);
      const want = ci === 0 || !rows.length ? next : Math.round(rows.reduce((x, y) => x + y, 0) / rows.length);
      const row = Math.max(next, want);
      rowOf.set(t.handle, row);
      next = row + 1;
    }
  });
  const nodes: Placed[] = techs.map((t) => {
    const col = depth.get(t.handle)!;
    const row = rowOf.get(t.handle)!;
    return { t, col, row, x: 12 + col * (NODE_W + COL_GAP), y: 12 + row * (NODE_H + ROW_GAP) };
  });
  const placed = new Map(nodes.map((n) => [n.t.handle, n]));
  const edges: [Placed, Placed][] = [];
  for (const n of nodes) for (const l of n.t.links) if (placed.has(l)) edges.push([placed.get(l)!, n]);
  const width = nodes.reduce((m, n) => Math.max(m, n.x + NODE_W), 0) + 12;
  const height = nodes.reduce((m, n) => Math.max(m, n.y + NODE_H), 0) + 12;
  return { nodes, edges, width, height };
}

function Graph({ techs, onOpen }: { techs: TechCard[]; onOpen: (h: string) => void }) {
  useLocale();
  const g = useMemo(() => layoutGraph(techs), [techs]);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  // the search matches the English source and the displayed translation alike
  const match = (c: TechCard) => !q || [c.name, c.field, tc(c.name), tc(c.field)].some((x) => x.toLowerCase().includes(q));
  const related = (n: Placed) => hover === null || n.t.handle === hover || n.t.links.includes(hover) || !!g.nodes.find((x) => x.t.handle === hover)?.t.links.includes(n.t.handle);
  if (!techs.length) return <Empty>{t('Nothing is known yet.')}</Empty>;
  return (
    <>
      <div class="graph-bar">
        <p class="panel-lede">{t('What we know and how it was built. Links appear only once the relationship itself has been learned.')}</p>
        <input type="search" class="text" placeholder={t('Find among known cards')} aria-label={t('Search known cards')} value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </div>
      <div class="graph-scroll" ref={scroller} data-testid="known-graph">
        <div class="graph" style={{ width: g.width + 'px', height: g.height + 'px' }}>
          <svg class="graph-edges" width={g.width} height={g.height} aria-hidden="true">
            {g.edges.map(([a, b]) => {
              const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const hot = hover !== null && (a.t.handle === hover || b.t.handle === hover);
              return <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 5},${y2}`} class={cx('edge', b.col - a.col > 1 && 'is-long', hot && 'is-hot', hover !== null && !hot && 'is-dim')} />;
            })}
            {g.edges.map(([, b]) => {
              const x = b.x, y = b.y + NODE_H / 2;
              return <path d={`M${x - 6},${y - 3.5} L${x},${y} L${x - 6},${y + 3.5}`} class="edge-head" />;
            })}
          </svg>
          {g.nodes.map((n) => (
            <button type="button" class={cx('node', 'node-' + n.t.state, !match(n.t) && 'is-dim', !related(n) && 'is-dim')}
              style={{ left: n.x + 'px', top: n.y + 'px', width: NODE_W + 'px', height: NODE_H + 'px' }}
              data-testid="graph-node" title={t('{name} — {state}', { name: tc(n.t.name), state: t(KSTATE_LABEL[n.t.state]) })}
              onMouseEnter={() => setHover(n.t.handle)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.t.handle)} onBlur={() => setHover(null)}
              onClick={() => onOpen(n.t.handle)}>
              <span class="node-name">{tc(n.t.name)}</span>
              <span class="node-foot">
                <StateBadge state={n.t.state} />
                {n.t.label !== 'established' ? <span class="node-label" title={n.t.label === 'fictional' ? t('Fictional science') : t('Extrapolated science')}>{n.t.label === 'fictional' ? t('fict.') : t('extrap.')}</span> : null}
              </span>
              {n.t.state === 'investigating' || (n.t.state === 'discovered' && n.t.work_done > 0) ? <span class="node-progress"><span style={{ width: Math.min(100, (n.t.work_done / Math.max(1, n.t.work_needed)) * 100) + '%' }} /></span> : null}
            </button>
          ))}
        </div>
      </div>
      <ul class="graph-legend">
        {KSTATE_ORDER.map((st) => <li><StateBadge state={st} /></li>)}
      </ul>
    </>
  );
}

// --- Implementation ----------------------------------------------------------------

function Implementation({ techs, onOpen }: { techs: TechCard[]; onOpen: (h: string) => void }) {
  const groups: { state: KnowledgeState; title: string; hint: string }[] = [
    { state: 'understood', title: t('Understood, not yet put to work'), hint: t('Reproducible knowledge. Build or teach what it enables to turn it into capacity.') },
    { state: 'prototyped', title: t('Prototyped'), hint: t('First installations exist; ordinary use still has to spread.') },
    { state: 'adopted', title: t('In ordinary use'), hint: t('Functioning capacity.') },
  ];
  const any = techs.some((c) => groups.some((g) => g.state === c.state));
  return (
    <>
      <p class="panel-lede">{t('Knowing a method is not the same as having the works, the trained people and the supplies to use it.')}</p>
      {!any ? <Empty>{t('Nothing is understood well enough to implement yet.')}</Empty> : null}
      {groups.map((g) => {
        const list = techs.filter((c) => c.state === g.state).sort((a, b) => (b.understood_month ?? 0) - (a.understood_month ?? 0));
        if (!list.length) return null;
        return (
          <Section title={g.title} aside={<small class="muted">{list.length}</small>}>
            <p class="muted small">{g.hint}</p>
            <ul class="impl-list">
              {list.map((c) => (
                <li class="impl">
                  <button type="button" class="linklike impl-name" onClick={() => onOpen(c.handle)}>{tc(c.name)}</button>
                  <LabelBadge label={c.label} />
                  {c.enables.length ? (
                    <ul class="enables">{tcAll(c.enables).map((e) => <li><Icon name="right" size={10} /> {e}</li>)}</ul>
                  ) : <p class="muted small">{t('No works, courses or formations we know of depend on it directly.')}</p>}
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </>
  );
}

// --- History ---------------------------------------------------------------------

function History({ techs, leads, onOpen }: { techs: TechCard[]; leads: Lead[]; onOpen: (h: string) => void }) {
  type Ev = { month: number; kind: 'discovered' | 'understood' | 'lead'; name: string; handle: string | null; source: string };
  const evs: Ev[] = [];
  for (const c of techs) {
    evs.push({ month: c.discovered_month, kind: 'discovered', name: c.name, handle: c.handle, source: c.source });
    if (c.understood_month !== null) evs.push({ month: c.understood_month, kind: 'understood', name: c.name, handle: c.handle, source: c.source });
  }
  for (const l of leads) evs.push({ month: l.month, kind: 'lead', name: l.title, handle: null, source: l.source });
  evs.sort((a, b) => b.month - a.month || a.name.localeCompare(b.name));
  const years: { year: number; items: Ev[] }[] = [];
  for (const e of evs) {
    const y = yearOf(e.month);
    const g = years[years.length - 1];
    if (g && g.year === y) g.items.push(e);
    else years.push({ year: y, items: [e] });
  }
  return (
    <>
      <p class="panel-lede">{t('How each capability became established, from our own records.')}</p>
      <ol class="history">
        {years.map((y) => (
          <li class="history-year">
            <span class="history-when">{t('Year {y}', { y: y.year })}</span>
            <ul>
              {y.items.map((e) => (
                <li class={cx('history-ev', 'ev-' + e.kind)}>
                  <span class="ev-mark" aria-hidden="true" />
                  <span>
                    <span class="ev-kind">{e.kind === 'understood' ? t('Understood') : e.kind === 'discovered' ? (y.year === 1 && e.source.toLowerCase().includes('inherit') ? t('Inherited') : t('Discovered')) : t('Lead reported')}</span>{' '}
                    {e.handle ? <button type="button" class="linklike" onClick={() => onOpen(e.handle!)}>{tc(e.name)}</button> : <span>{tc(e.name)}</span>}
                    <small class="muted"> · {tc(e.source)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}

// --- Card detail -------------------------------------------------------------------

function TechDetail({ obs, t: card, onBack, onOpen }: { obs: Observation; t: TechCard; onBack: () => void; onOpen: (h: string) => void }) {
  const s = useApp();
  const researching = new Set(obs.projects.filter((p) => p.kind === 'research').map((p) => p.target ?? ''));
  const project = obs.projects.find((p) => p.kind === 'research' && p.target === card.handle);
  const canAct = card.state === 'discovered' || card.state === 'investigating';
  const why = canAct ? reasonCannot(card, researching) : null;
  const built = card.links.map((h) => obs.knowledge.techs.find((x) => x.handle === h)).filter((x): x is TechCard => !!x);
  const leadsTo = obs.knowledge.techs.filter((x) => x.links.includes(card.handle));
  return (
    <div class="panel knowledge tech-detail" data-testid="tech-detail">
      <div class="subnav">
        <button type="button" class="linklike" onClick={onBack}><Icon name="left" size={12} /> {t('Knowledge')}</button>
      </div>
      <header class="detail-head">
        <span class="kicker">{tc(card.field)}</span>
        <h3>{tc(card.name)}</h3>
        <div class="row wrap"><StateBadge state={card.state} /> <LabelBadge label={card.label} /></div>
      </header>
      <Section title={t('What it makes possible')}>
        <p>{tc(card.capability)}</p>
        {card.enables.length ? <ul class="enables">{tcAll(card.enables).map((e) => <li><Icon name="right" size={10} /> {e}</li>)}</ul> : null}
      </Section>
      <Section title={t('What it really takes')}>
        <p>{tc(card.requirements)}</p>
        <p class="sub-label">{t('Known requirements')}</p>
        {card.known_requirements.length || card.unknown_requirements
          ? <Checklist items={tcChecks(card.known_requirements)} unknown={card.unknown_requirements} />
          : <p class="muted small">{t('None beyond the work itself, as far as we know.')}</p>}
      </Section>
      <Section title={t('Investigation')} aside={<small class="muted">{t(RESEARCH_LABEL[card.class])}</small>}>
        <div class="progress-line">
          <Meter value={card.work_done} max={Math.max(1, card.work_needed)} tone={card.state === 'investigating' ? 'gold' : 'ok'} label={t('{done} of {needed} work', { done: work(card.work_done), needed: work(card.work_needed) })} />
          <span class="progress-num"><b>{work(card.work_done)}</b> / {work(card.work_needed)} <small>{t('work')}</small></span>
        </div>
        {project && project.blockers.length ? <ul class="blockers">{tcAll(project.blockers).map((b) => <li><Icon name="warn" size={11} /> {b}</li>)}</ul> : null}
        {canAct ? (
          <div class="form-actions">
            {card.state === 'investigating' || project ? <Badge tone="gold" icon="clock">{t('Investigation under way')}</Badge> : (
              <Btn kind="primary" why={why} disabled={s.busy} testid="detail-investigate" onClick={() => void act({ kind: 'start_project', spec: { kind: 'research', tech: card.handle }, priority: null }, 'research-detail')}>{t('Investigate')}</Btn>
            )}
            {why && !(card.state === 'investigating' || project) ? <Why>{why}</Why> : null}
          </div>
        ) : null}
        <ActionNote tag="research-detail" />
      </Section>
      <Section title={t('Record')}>
        <dl class="kvs">
          <div class="kv"><dt>{t('Source')}</dt><dd>{tc(card.source)}</dd></div>
          <div class="kv"><dt>{t('Discovered')}</dt><dd>{fmtDate(card.discovered_month)}</dd></div>
          <div class="kv"><dt>{t('Understood')}</dt><dd>{card.understood_month !== null ? fmtDate(card.understood_month) : <span class="muted">{t('not yet')}</span>}</dd></div>
        </dl>
        {built.length ? (<><p class="sub-label">{t('Built on')}</p><p class="chips">{built.map((b) => <button type="button" class="chip" onClick={() => onOpen(b.handle)}>{tc(b.name)}</button>)}</p></>) : null}
        {leadsTo.length ? (<><p class="sub-label">{t('Known to build on this')}</p><p class="chips">{leadsTo.map((b) => <button type="button" class="chip" onClick={() => onOpen(b.handle)}>{tc(b.name)}</button>)}</p></>) : null}
      </Section>
    </div>
  );
}
