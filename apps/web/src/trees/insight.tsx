// Path dependence, research lines and institutional limits (ruleset 3.0 slices 6b/6c),
// shared by the trees and the knowledge and culture panels. Everything here reads the
// seat's own observation: a family shows only the members the seat has discovered, a
// refuting discovery is named only once it is disclosed, and no count of what exists
// beyond the observation is ever shown.
import type { ComponentChildren } from 'preact';
import type { Observation, PracticeCard, ProjectView, TechCard } from '../protocol';
import { PSTATE_LABEL, RESEARCH_LABEL, int, pct, researchMonths, workMonths } from '../format';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Est, Meter, Why, cx } from '../ui';
import { act } from '../store';
import { t, tc } from '../i18n';
import { exclusiveGroup, familyKind, familyRefuters, fieldTradition } from './tables';
import './insight.css';

// ------------------------------------------------------------------------------------
// Investigation lines (design chapter 39, section 1.6)
// ------------------------------------------------------------------------------------

export interface Lines { lines: number | null; used: number; full: boolean }

/** Investigation lines in use (running, unpaused investigations) against the seat's lines. */
export function investigationLines(obs: Observation): Lines {
  const used = obs.projects.filter((p) => p.kind === 'research' && !p.paused).length;
  const lines = obs.knowledge.investigation_lines ?? null;
  return { lines: lines || null, used, full: !!lines && used >= lines };
}

export function linesWhy(obs: Observation): string | null {
  const l = investigationLines(obs);
  if (!l.full) return null;
  return t('Every investigation line is in use ({used} of {lines}). Pause or finish an investigation first; more research staff gives more lines.', { used: l.used, lines: l.lines ?? 0 });
}

const LINES_HELP = 'How many investigations can run at once. Four lines, and more as research staff grows: four times the staff gives twice the extra lines, up to 24. A paused investigation frees its line.';

/** "Lines 5 / 6" with one pip per line. */
export function LinesMeter({ obs, compact }: { obs: Observation; compact?: boolean }) {
  const l = investigationLines(obs);
  if (l.lines === null) return null;
  const title = t(LINES_HELP) + (l.full ? ' ' + t('All lines are in use: a new investigation will be refused until one finishes or is paused.') : '');
  return (
    <span class={cx('lines-meter', l.full && 'is-full', compact && 'is-compact')} title={title} data-testid="lines-meter" role="img"
      aria-label={t('Investigation lines: {used} of {lines} in use', { used: l.used, lines: l.lines })}>
      <span class="lines-label">{compact ? t('Lines') : t('Investigation lines')}</span>
      <b>{l.used}<small>/{l.lines}</small></b>
      {l.lines <= 24 ? <span class="lines-pips" aria-hidden="true">{Array.from({ length: l.lines }, (_, i) => <i class={i < l.used ? 'on' : undefined} />)}</span> : null}
    </span>
  );
}

/** A sentence for the knowledge panel: lines used and how to get more. */
export function LinesNote({ obs }: { obs: Observation }) {
  const l = investigationLines(obs);
  if (l.lines === null) return null;
  return (
    <p class={cx('note', l.full ? 'is-warn' : 'is-soft')} data-testid="lines-note">
      <Icon name={l.full ? 'warn' : 'flask'} size={13} />{' '}
      {l.full
        ? t('All {lines} investigation lines are in use. A new investigation will be refused until one finishes or is paused; more research staff gives more lines.', { lines: l.lines })
        : t('{used} of {lines} investigation lines in use. More research staff gives more lines (four times the staff, twice the extra lines; at most 24).', { used: l.used, lines: l.lines })}
    </p>
  );
}

// ------------------------------------------------------------------------------------
// Node kinds and tradition branches (design chapter 39, section 1.2)
// ------------------------------------------------------------------------------------

export function kindInfo(card: Pick<TechCard, 'kind' | 'field'>): { icon: string; label: string; help: string; tone: 'info' | 'gold' | 'muted' | 'accent' } | null {
  const trad = fieldTradition(card.field);
  switch (card.kind) {
    case 'branch':
      return { icon: 'flag', tone: 'accent', label: trad ? t('{genre} branch', { genre: t(trad.genre) }) : t('Tradition branch'),
        help: t('A tradition branch ({name}): its evidence comes from that tradition’s own works, from contact with a civilization that holds it, or from study. Knowledge is never locked, only hard to come by.', { name: trad ? t(trad.name) : '' }) };
    case 'entry':
      return { icon: 'flag', tone: 'accent', label: trad ? t('{genre} entry', { genre: t(trad.genre) }) : t('Tradition entry'),
        help: t('The first node of a tradition branch ({name}). Anyone can reach it through ordinary evidence.', { name: trad ? t(trad.name) : '' }) };
    case 'sealed':
      return { icon: 'spark', tone: 'gold', label: t('Revealed with the objective'), help: t('A side line of the objective’s fictional science; it appears only once the objective is revealed.') };
    case 'side':
      return { icon: 'right', tone: 'muted', label: t('Side branch'), help: t('An optional branch with a local payoff.') };
    case 'alt':
      return { icon: 'swap', tone: 'info', label: t('Alternative'), help: t('An alternative solution to a problem that another technology also solves.') };
    case 'dead':
      return { icon: 'cross', tone: 'muted', label: t('Dead end'), help: t('A real payoff, but nothing further is known to build on it.') };
    default:
      return null;
  }
}

export function KindBadge({ card }: { card: Pick<TechCard, 'kind' | 'field'> }) {
  const k = kindInfo(card);
  if (!k) return null;
  return <Badge tone={k.tone} icon={k.icon} title={k.help}>{k.label}</Badge>;
}

// ------------------------------------------------------------------------------------
// Rival families (design chapter 39, section 1.4; interface section 7.2)
// ------------------------------------------------------------------------------------

const factor = (bp: number) => '×' + (bp / 10000).toFixed(2);

/** Whether the installed base weighs on this card (evidence, work or the discovery cap). */
export function isLocked(card: TechCard): boolean {
  const f = card.family_view;
  return !!f && f.incumbent !== card.handle && (f.lock_e_bp < 10000 || f.lock_w_bp > 10000 || f.capped);
}

/** Locked and still to be learned: the lock only matters until a card is understood. */
export function isHeldBack(card: TechCard): boolean {
  return isLocked(card) && (card.state === 'hinted' || card.state === 'discovered' || card.state === 'investigating');
}

export function familyTitle(family: string): string {
  const kind = familyKind(family);
  return kind === 'standard' ? t('Competing standards') : kind === 'doctrine' ? t('Rival doctrines') : t('Rival approaches');
}

/** Short status for a card face: "Incumbent", "Locked ×0.63" or "Rival". */
export function familyMark(card: TechCard): { icon: string; tone: 'gold' | 'bad' | 'info'; label: string; title: string } | null {
  const f = card.family_view;
  if (!f) return null;
  const fam = tc(f.family);
  if (f.incumbent === card.handle) return { icon: 'crown', tone: 'gold', label: t('Incumbent'), title: t('{family}: yours, {pct} of the installed base', { family: fam, pct: pct(f.share_bp) }) };
  if (f.revisit_active) return { icon: 'search', tone: 'info', label: t('Revisited'), title: t('{family}: a revisit study is in force; evidence here is not held back', { family: fam }) };
  if (isHeldBack(card)) return { icon: 'lock', tone: 'bad', label: t('Locked {factor}', { factor: factor(f.lock_e_bp) }), title: t('{family}: evidence here {e}, investigation {w}', { family: fam, e: factor(f.lock_e_bp), w: factor(f.lock_w_bp) }) };
  return { icon: 'swap', tone: 'info', label: t('Rival'), title: t('{family}: a rival is known', { family: fam }) };
}

function revisitProject(obs: Observation, card: TechCard): ProjectView | undefined {
  const members = new Set([card.handle, ...(card.family_view?.rivals_discovered ?? [])]);
  return obs.projects.find((p) => p.kind === 'revisit' && p.target !== null && members.has(p.target));
}

export function revisitWhy(obs: Observation, card: TechCard): string | null {
  const f = card.family_view;
  if (!f) return null;
  if (f.revisit_active) return t('A revisit study is already in force for this question');
  if (revisitProject(obs, card)) return t('A revisit study of this question is already under way');
  if (f.incumbent === card.handle || (f.lock_e_bp >= 10000 && !f.capped)) return t('Nothing holds this question back');
  return null;
}

const REVISIT_MIN_MONTHS = 24;

/** The family block of a card's details: members, incumbent, lock, ways to reopen, revisit. */
export function FamilyBlock({ obs, card, onOpen, tag, Wrap }: {
  obs: Observation; card: TechCard; onOpen: (id: string) => void; tag: string;
  Wrap: (p: { title: string; aside?: ComponentChildren; children: ComponentChildren }) => ComponentChildren;
}) {
  const f = card.family_view;
  if (!f) return null;
  const known = new Map(obs.knowledge.techs.map((c) => [c.handle, c]));
  const members = [card, ...f.rivals_discovered.map((h) => known.get(h)).filter((c): c is TechCard => !!c)];
  const inc = f.incumbent ? known.get(f.incumbent) : undefined;
  const isInc = f.incumbent === card.handle;
  const locked = isLocked(card);
  const open = card.state === 'hinted' || card.state === 'discovered' || card.state === 'investigating';
  const kind = familyKind(f.family);
  const refuters = familyRefuters(f.family).map((n) => obs.knowledge.techs.find((c) => c.name === n)).filter((c): c is TechCard => !!c);
  const running = revisitProject(obs, card);
  const why = revisitWhy(obs, card);
  const cap = obs.civ.research.find((l) => l.class === card.class)?.capacity ?? 0;
  const months = cap > 0 ? Math.max(REVISIT_MIN_MONTHS, Math.ceil(f.revisit_cost / cap)) : null;
  return (
    <>{Wrap({
      title: familyTitle(f.family),
      aside: tc(f.family),
      children: (
        <div class="family" data-testid="family-block">
          <p class="family-lede">{kind === 'doctrine'
            ? t('Rival beliefs about the same question. The one your people hold resists contrary evidence until the evidence is strong enough.')
            : kind === 'standard'
              ? t('Incompatible ways of building the same thing. What your works already use makes the others harder to take up.')
              : t('Different solutions to one problem. The one your works already rely on makes the others harder to take up.')}</p>
          <ul class="family-members">
            {members.map((m) => (
              <li class={cx(m.handle === f.incumbent && 'is-incumbent', m.handle === card.handle && 'is-self')}>
                <span class="family-mark" aria-hidden="true"><Icon name={m.handle === f.incumbent ? 'crown' : 'swap'} size={12} /></span>
                {m.handle === card.handle ? <b>{tc(m.name)}</b> : <button type="button" class="tree-chip" onClick={() => onOpen(m.handle)}>{tc(m.name)}</button>}
                <small>{m.handle === f.incumbent ? t('yours, {pct} of the installed base', { pct: pct(f.share_bp) }) : t(STATE_SHORT[m.state] ?? m.state)}</small>
              </li>
            ))}
          </ul>
          <p class="muted small">{t('Only the alternatives you have discovered are shown.')}</p>
          {isInc ? (
            <p class="note is-soft"><Icon name="crown" size={12} /> {t('This is your incumbent: the works and methods built on it hold back evidence on its rivals and make investigating them dearer.')}</p>
          ) : inc && locked ? (
            open ? (
              <div class="family-lock" data-testid="family-lock">
                <p><Icon name="lock" size={12} /> {t('Held back by {name} ({pct} of your installed base):', { name: tc(inc.name), pct: pct(f.share_bp) })}</p>
                <dl class="family-factors">
                  <div><dt>{t('Evidence here')}</dt><dd class={f.lock_e_bp < 10000 ? 'neg' : ''}>{factor(f.lock_e_bp)}</dd></div>
                  <div><dt>{t('Investigation work')}</dt><dd class={f.lock_w_bp > 10000 ? 'neg' : ''}>{factor(f.lock_w_bp)}</dd></div>
                </dl>
                {f.capped && card.state === 'hinted' ? <p class="small">{t('Nobody here is asking this question: while the incumbent holds three quarters of the installed base, it stays a rumour unless contact or a revisit study reopens it.')}</p> : null}
              </div>
            ) : <p class="note is-soft"><Icon name="info" size={12} /> {t('Your installed base favours {name}; this card is already understood, so the lock no longer holds it back.', { name: tc(inc.name) })}</p>
          ) : f.revisit_active ? null : <p class="note is-soft"><Icon name="info" size={12} /> {t('Nothing holds this card back at present.')}</p>}
          {f.revisit_active ? <p class="note is-ok"><Icon name="search" size={12} /> {t('A revisit study is in force: evidence here is not held back (retooling still costs more).')}</p> : null}
          {locked && open ? (
            <div class="family-reopen">
              <p class="sub-label">{t('How to reopen the question')}</p>
              <ul class="family-ways">
                <li><Icon name="globe" size={12} /> <span>{t('Contact: evidence from peaceful contact is never held back, and contact with a civilization that has prototyped it lifts the cap.')}</span></li>
                {refuters.length ? refuters.map((r) => (
                  <li class={r.understood_month !== null ? 'is-done' : undefined}><Icon name={r.understood_month !== null ? 'check' : 'flask'} size={12} /> <span>{r.understood_month !== null
                    ? t('Contrary evidence: {name} is understood and halves the lock.', { name: tc(r.name) })
                    : t('Contrary evidence: understanding {name} would halve the lock.', { name: tc(r.name) })}</span></li>
                )) : kind === 'doctrine' ? <li><Icon name="flask" size={12} /> <span>{t('Contrary evidence weakens {family}: each discovery that contradicts it, once understood, halves the lock.', { family: tc(f.family) })}</span></li> : null}
                <li><Icon name="search" size={12} /> <span>{t('A revisit study: {cost}, at least {months} months. For twenty years after it completes, evidence here is not held back; retooling still costs more.', { cost: researchMonths(f.revisit_cost), months: REVISIT_MIN_MONTHS })}</span></li>
              </ul>
            </div>
          ) : null}
          {(locked && open) || running ? (
            <div class="family-revisit">
              {running ? (
                <div class="progress-line">
                  <Meter value={running.work_done} max={Math.max(1, running.work_needed)} tone="gold" label={t('Revisit study {pct}', { pct: Math.round((running.work_done / Math.max(1, running.work_needed)) * 100) + '%' })} />
                  <span class="progress-num"><b>{Math.round((running.work_done / Math.max(1, running.work_needed)) * 100)}%</b> <small>{t('revisit study')}</small></span>
                </div>
              ) : null}
              <div class="form-actions">
                {running ? <Badge tone="gold" icon="clock">{t('Revisit study under way')}</Badge> : (
                  <Btn kind="primary" icon="search" why={why} testid="fund-revisit" onClick={() => void act({ kind: 'start_project', spec: { kind: 'revisit', card: card.handle }, priority: null }, tag)}>{t('Fund revisit study')}</Btn>
                )}
                {!running ? (
                  <span class="muted small">{researchMonths(f.revisit_cost)} · {months !== null
                    ? <Est title={t('At the full {label} capacity of {cap} a month; a study runs at least {min} months.', { label: t(RESEARCH_LABEL[card.class]), cap: researchMonths(cap), min: REVISIT_MIN_MONTHS })}>{t('≈ {n} months', { n: int(months) })}</Est>
                    : t('at least {n} months', { n: REVISIT_MIN_MONTHS })}</span>
                ) : null}
              </div>
              {why && !running ? <Why>{why}</Why> : null}
              <ActionNote tag={tag} />
            </div>
          ) : null}
        </div>
      ),
    })}</>
  );
}

const STATE_SHORT: Record<string, string> = {
  hinted: 'a rumour', discovered: 'a question', investigating: 'under investigation', understood: 'understood', prototyped: 'prototyped', adopted: 'in use',
};

// ------------------------------------------------------------------------------------
// Fragile know-how (section 1.5)
// ------------------------------------------------------------------------------------

const FRAGILE_YEARS = 100;

export function fragileLeft(card: TechCard): number | null {
  if (card.fragile_risk === null || card.fragile_risk === undefined) return null;
  return Math.max(0, FRAGILE_YEARS - card.fragile_risk);
}

export function FragileNote({ card }: { card: TechCard }) {
  const left = fragileLeft(card);
  if (left === null) return null;
  return (
    <div class={cx('note', 'fragile-note', left <= 20 ? 'is-bad' : 'is-warn')} data-testid="fragile-note">
      <p><Icon name="hourglass" size={13} /> <b>{t('Fragile know-how')}</b></p>
      <p>{t('Not practised for {n} years: unless works use it again, it is lost in about {left} years.', { n: int(card.fragile_risk ?? 0), left: int(left) })}</p>
      <p class="small">{t('Keeping archives, or monastic orders, preserves it. If it is lost, the evidence stays and relearning takes half the work.')}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Practices: load, slots, exclusive groups, tensions, repeal (sections 2.2-2.3)
// ------------------------------------------------------------------------------------

const LOAD_HELP = 'Each established institution adds load; administrative offices and a few organising institutions provide capacity. Above capacity, stability falls by 1 for every 4 points over and every reform takes half as much work again.';

export function LoadMeter({ obs, compact }: { obs: Observation; compact?: boolean }) {
  const load = obs.culture.load;
  if (!load || !load.capacity) return null;
  const over = load.used - load.capacity;
  const tone = over > 0 ? 'bad' : load.used >= load.capacity - 4 ? 'warn' : 'ok';
  const title = t(LOAD_HELP) + (over > 0 ? ' ' + t('Now {n} over: stability −{s}, reforms ×1.5 work.', { n: over, s: Math.ceil(over / 4) }) : '');
  return (
    <span class={cx('load-meter', 'is-' + tone, compact && 'is-compact')} title={title} data-testid="load-meter" role="img"
      aria-label={t('Institutions {used} of {capacity}', { used: load.used, capacity: load.capacity })}>
      <span class="load-label">{t('Institutions')}</span>
      <b>{load.used}<small> / {load.capacity}</small></b>
      <span class="load-bar" aria-hidden="true"><i style={{ width: Math.min(100, (load.used / load.capacity) * 100).toFixed(1) + '%' }} /></span>
    </span>
  );
}

export function reformsRunning(obs: Observation): number {
  return obs.projects.filter((p) => p.kind === 'reform').length;
}

export function SlotsMeter({ obs }: { obs: Observation }) {
  const slots = obs.culture.reform_slots;
  if (!slots) return null;
  const used = reformsRunning(obs);
  return (
    <span class={cx('lines-meter', used >= slots && 'is-full', 'is-compact')} data-testid="slots-meter" role="img"
      title={t('Reforms that may run at once: one, and one more for each of specialized administration, public-service budgets and algorithmic administration once established (at most 4).')}
      aria-label={t('Reform slots: {used} of {slots} in use', { used, slots })}>
      <span class="lines-label">{t('Reforms')}</span>
      <b>{used}<small>/{slots}</small></b>
      <span class="lines-pips" aria-hidden="true">{Array.from({ length: slots }, (_, i) => <i class={i < used ? 'on' : undefined} />)}</span>
    </span>
  );
}

/** Load the overload note for the culture panel and civics header. */
export function LoadNote({ obs }: { obs: Observation }) {
  const load = obs.culture.load;
  if (!load || !load.capacity) return null;
  const over = load.used - load.capacity;
  if (over > 0) return <p class="note is-bad" data-testid="load-note"><Icon name="warn" size={13} /> {t('Institutions are {n} over capacity: stability −{s}, and every reform takes half as much work again. Build administrative offices, or repeal an institution you can spare.', { n: over, s: Math.ceil(over / 4) })}</p>;
  if (load.used >= load.capacity - 4) return <p class="note is-warn" data-testid="load-note"><Icon name="warn" size={13} /> {t('Institutions are near capacity ({used} of {capacity}). Another established practice may overload the offices that carry them.', { used: load.used, capacity: load.capacity })}</p>;
  return null;
}

const HELD = new Set(['reforming', 'enacted', 'established']);

/** The practice of this card's exclusive group that is held now (reforming or enacted), if any. */
export function exclusiveHolder(obs: Observation, card: PracticeCard): PracticeCard | undefined {
  const known = new Map(obs.culture.practices.map((p) => [p.handle, p]));
  return (card.exclusive_with ?? []).map((h) => known.get(h)).find((p): p is PracticeCard => !!p && HELD.has(p.state));
}

export function repealProject(obs: Observation, card: PracticeCard): ProjectView | undefined {
  return obs.projects.find((p) => p.kind === 'repeal' && p.target === card.handle);
}

/** Why a reform of this recognized practice would be refused, beyond its own requirements. */
export function reformBlock(obs: Observation, card: PracticeCard): string | null {
  if (card.state !== 'recognized') return null;
  const holder = exclusiveHolder(obs, card);
  if (holder) return t('Must repeal {name} first: a polity holds only one of them', { name: tc(holder.name) });
  const slots = obs.culture.reform_slots;
  if (slots && reformsRunning(obs) >= slots) return t('Every reform slot is in use ({n}). Wait for a reform to finish.', { n: slots });
  return null;
}

export function canRepeal(obs: Observation, card: PracticeCard): boolean {
  return (card.state === 'enacted' || card.state === 'established') && !repealProject(obs, card);
}

/** Repeal work is a quarter of the reform's work, and it runs at least two years. */
export function repealCost(card: PracticeCard): string {
  return t('{work}, at least 24 months; stability −2 while it runs', { work: workMonths(Math.max(1000, Math.round(card.reform_work / 4))) });
}

export function RepealButton({ card, tag, small, label }: { card: PracticeCard; tag: string; small?: boolean; label?: string }) {
  return (
    <Btn small={small} kind="danger" icon="cross" testid="repeal" title={repealCost(card)}
      onClick={(e?: MouseEvent) => { e?.stopPropagation(); void act({ kind: 'repeal', practice: card.handle }, tag); }}>{label ?? t('Repeal')}</Btn>
  );
}

/** Exclusive group, tensions and repeal for a practice's details. */
export function PracticeRules({ obs, card, onOpen, tag }: { obs: Observation; card: PracticeCard; onOpen?: (id: string) => void; tag: string }) {
  const known = new Map(obs.culture.practices.map((p) => [p.handle, p]));
  const excl = (card.exclusive_with ?? []).map((h) => known.get(h)).filter((p): p is PracticeCard => !!p);
  const tens = (card.tension_with ?? []).map((h) => known.get(h)).filter((p): p is PracticeCard => !!p);
  const holder = exclusiveHolder(obs, card);
  const group = exclusiveGroup(card.name);
  const repealing = repealProject(obs, card);
  const chip = (p: PracticeCard) => onOpen
    ? <button type="button" class="tree-chip" onClick={() => onOpen(p.handle)}>{tc(p.name)}</button>
    : <b>{tc(p.name)}</b>;
  if (!excl.length && !tens.length && !canRepeal(obs, card) && !repealing) return null;
  return (
    <div class="practice-rules" data-testid="practice-rules">
      {excl.length ? (
        <div class="rule-excl">
          <p class="sub-label"><Icon name="swap" size={12} /> {group ? t('Exclusive group: {name}', { name: tc(group) }) : t('Exclusive group')}</p>
          <p class="small">{t('A polity holds only one of these at a time. Reforming another member first needs a repeal of the one held.')}</p>
          <ul class="rule-list">
            {excl.map((p) => (
              <li class={HELD.has(p.state) ? 'is-held' : undefined}>{chip(p)} <small>{t(PSTATE_LABEL[p.state])}</small>
                {p === holder && card.state === 'recognized' ? (
                  <span class="rule-act">
                    {repealProject(obs, p) ? <Badge tone="gold" icon="clock">{t('Repeal under way')}</Badge> : canRepeal(obs, p) ? <RepealButton small card={p} tag={tag} label={t('Repeal {name}', { name: tc(p.name) })} /> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {holder && card.state === 'recognized' ? <p class="small muted">{t('Repealing {name}: {cost}. It then returns to recognized, and this one can be reformed.', { name: tc(holder.name), cost: repealCost(holder) })}</p> : null}
        </div>
      ) : null}
      {tens.length ? (
        <div class="rule-tension">
          <p class="sub-label"><Icon name="warn" size={12} /> {t('In tension with')}</p>
          <ul class="rule-list">{tens.map((p) => <li>{chip(p)} <small>{t(PSTATE_LABEL[p.state])}</small></li>)}</ul>
          <p class="small">{t('Both may be held, but while both are established: stability −2 and both are taken up at half speed.')}</p>
        </div>
      ) : null}
      {repealing ? (
        <div class="progress-line">
          <Meter value={repealing.work_done} max={Math.max(1, repealing.work_needed)} tone="bad" label={t('Repeal progress')} />
          <span class="progress-num"><b>{Math.round((repealing.work_done / Math.max(1, repealing.work_needed)) * 100)}%</b> <small>{t('Repeal under way')}</small></span>
        </div>
      ) : canRepeal(obs, card) ? (
        <div class="rule-repeal">
          <div class="form-actions">
            <RepealButton card={card} tag={tag} />
            <span class="muted small">{repealCost(card)}</span>
          </div>
          <p class="small muted">{t('A repeal dissolves the institution: adoption falls to nothing at the end and it returns to recognized. It frees institutional load{load}.', { load: card.load ? t(' ({n})', { n: card.load }) : '' })}</p>
        </div>
      ) : null}
      <ActionNote tag={tag} />
    </div>
  );
}

/** Era and load pills for a practice. */
export function PracticePills({ card, eraName }: { card: PracticeCard; eraName: (e: number) => string }) {
  return (
    <span class="pills">
      {card.era !== undefined ? <span class="pill" title={t('Era of the institution: later eras cost more evidence and work and are taken up more slowly')}>{eraName(card.era)}</span> : null}
      {card.load ? <span class="pill is-load" title={t('Institutional load it adds while established')}><Icon name="layers" size={10} /> {card.load}</span> : null}
    </span>
  );
}
