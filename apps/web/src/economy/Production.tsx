// Production: every works as a building card (staff, utilisation, inputs to
// outputs at the current rate, power, upkeep, what holds it back and the next
// useful step), a summary strip per region, and the supply-chain diagram.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Good, Observation, Qual } from '../protocol';
import { GOOD_LABEL, GOOD_SHORT, QUAL_LABEL, RESEARCH_LABEL, int, joinList, lc, pct, researchMonths } from '../format';
import { t, tc } from '../i18n';
import { Icon } from '../icons';
import { GoodIcon } from '../theme/goods';
import { ActionNote, cx } from '../ui';
import { act, isReadOnly, useApp } from '../store';
import {
  B_COMPUTE, B_DEPOSIT, B_ELEC, B_FULL, B_QUALIFIED, B_SHAFT, B_UNREST, B_WORKERS, B_WORN, isShortOf,
  type FacCard, type Ledger, type RegionSum,
} from './model';
import { Bar, CATEGORY_ORDER, lcs, qualCount, E, Glyph, GoodQtyChip, Ring, Seg, V, amt, people, perMo, svc, tip } from './parts';
import { ChainView } from './Chain';
import type { Nav } from './Ledger';

type View = 'works' | 'chain';
type GroupBy = 'kind' | 'region';
type Filter = 'all' | 'held' | 'off';

export const CATEGORY_LABEL: Record<string, string> = {
  Food: 'Food', Extraction: 'Extraction', Industry: 'Industry', Power: 'Power', Transport: 'Transport', Civic: 'Civic',
  Education: 'Education', Research: 'Research', Space: 'Space', 'Jump engineering': 'Jump engineering', Other: 'Other',
};

interface Advice { tone: 'bad' | 'warn' | 'info'; text: string; action?: { label: string; run: () => void } }

function adviseShort(c: FacCard, g: Good, ledger: Ledger, obs: Observation, nav: Nav): Advice {
  const name = lc(GOOD_SHORT[g]);
  const makers = ledger.cards.filter((x) => x.key !== c.key && (x.outputs.some((o) => o.good === g) || (!x.f.enabled && x.type?.recipes.some((r) => r.available && r.outputs.some((o) => o.good === g)))));
  const weak = makers.filter((x) => !x.f.enabled || x.rateBp < 5000).sort((a, b) => a.rateBp - b.rateBp)[0];
  if (weak) {
    return {
      tone: 'bad',
      text: weak.f.enabled
        ? t('Short of {good}: our {works} in {region} are running at {pct}.', { good: name, works: lcs(tc(weak.f.name)), region: tc(weak.region.name), pct: pct(weak.rateBp) })
        : t('Short of {good}: our {works} in {region} are switched off.', { good: name, works: lcs(tc(weak.f.name)), region: tc(weak.region.name) }),
      action: { label: t('See what holds them'), run: () => nav.toCard(weak.key) },
    };
  }
  const types = obs.catalog.facilities.filter((f) => f.recipes.some((r) => r.outputs.some((o) => o.good === g)));
  const known = types.find((f) => f.available && f.recipes.some((r) => r.available && r.outputs.some((o) => o.good === g)));
  if (known) {
    return {
      tone: 'bad',
      text: makers.length
        ? t('Short of {good}: the {works} we have cannot keep up.', { good: name, works: lcs(tc(known.name)) })
        : t('Short of {good}: nothing of ours makes it.', { good: name }),
      action: { label: makers.length ? t('Build more {works}', { works: lcs(tc(known.name)) }) : t('Build {works}', { works: lcs(tc(known.name)) }), run: () => nav.build() },
    };
  }
  if (types.length) return { tone: 'bad', text: t('Short of {good}: {works} would make it, but we do not yet know how to build them.', { good: name, works: lcs(tc(types[0].name)) }), action: { label: t('See the good'), run: () => nav.toGood(g) } };
  return { tone: 'bad', text: t('Short of {good}: nothing we know of makes it. It would have to be traded for.', { good: name }), action: { label: t('Open diplomacy'), run: () => nav.open('diplomacy') } };
}

function advise(c: FacCard, ledger: Ledger, obs: Observation, nav: Nav): Advice[] {
  const out: Advice[] = [];
  const region = tc(c.region.name);
  const p = c.own.power;
  for (const b of c.blockers) {
    if (isShortOf(b)) {
      for (const g of c.missing) out.push(adviseShort(c, g, ledger, obs, nav));
      if (!c.missing.length) out.push({ tone: 'bad', text: tc(b) });
    } else if (b === B_WORKERS) {
      out.push({
        tone: 'warn',
        text: t('Not enough workers: {have} of {need} posts filled. {region} has no one free; people without posts elsewhere drift in slowly.', { have: people(c.f.staffed), need: people(c.f.staff_needed), region }),
        action: { label: t('Labour priorities'), run: () => nav.toTab('workforce') },
      });
    } else if (b === B_QUALIFIED) {
      const quals = c.jobs.filter((j) => j.qual).map((j) => qualCount(lc(QUAL_LABEL[j.qual as Qual]), j.posts));
      out.push({ tone: 'warn', text: t('Qualified staff are missing: the posts call for {quals}.', { quals: joinList(quals) }), action: { label: t('Start a course'), run: () => nav.train(c.region.id) } });
    } else if (b === B_SHAFT) {
      out.push({ tone: 'warn', text: t('Not enough shaft power: {region} supplies {s} of the {d} its works call for.', { region, s: svc('shaft', p.shaft_supply), d: svc('shaft', p.shaft_demand) }), action: { label: t('Add power here'), run: () => nav.build(c.region.id) } });
    } else if (b === B_ELEC) {
      out.push({ tone: 'warn', text: t('Not enough electricity: {region} supplies {s} of the {d} its works call for.', { region, s: svc('elec', p.elec_supply), d: svc('elec', p.elec_demand) }), action: { label: t('Add power here'), run: () => nav.build(c.region.id) } });
    } else if (b === B_COMPUTE) {
      out.push({ tone: 'warn', text: t('Not enough computing: the realm supplies {s} of {d}.', { s: svc('compute', ledger.compute.supply), d: svc('compute', ledger.compute.demand) }), action: { label: t('Build a computing centre'), run: () => nav.build() } });
    } else if (b === B_WORN) {
      const goods = c.upkeep.map((u) => lc(GOOD_SHORT[u.good]));
      out.push({ tone: 'warn', text: goods.length ? t('Worn equipment: upkeep ({goods}) was missed. Condition recovers 3% a month once it is supplied.', { goods: joinList(goods) }) : t('Worn equipment: condition is {pct} and caps output. It recovers 3% a month.', { pct: pct(c.f.condition_bp) }), action: c.upkeep[0] ? { label: t('See the good'), run: () => nav.toGood(c.upkeep[0].good) } : undefined });
    } else if (b === B_FULL) {
      const goods = c.outputs.map((o) => lc(GOOD_SHORT[o.good]));
      out.push({ tone: 'info', text: t('Held back on purpose: the store of {goods} is above its working target. Nothing to fix.', { goods: joinList(goods) }) });
    } else if (b === B_DEPOSIT) {
      out.push({ tone: 'bad', text: t('The deposit is nearly exhausted. Another will have to be found.'), action: { label: t('Plan a survey'), run: () => nav.open('projects', { kind: 'survey' }) } });
    } else if (b === B_UNREST) {
      out.push({ tone: 'warn', text: t('Unrest in {region} is disrupting work.', { region }), action: { label: t('Open people'), run: () => nav.open('people') } });
    } else {
      out.push({ tone: 'warn', text: tc(b) });
    }
  }
  if (!c.blockers.length && c.f.enabled && !c.isFood && c.f.staff_needed > 0 && c.f.staffed < c.f.staff_needed) {
    out.push({ tone: 'warn', text: t('Not enough workers: {have} of {need} posts filled.', { have: people(c.f.staffed), need: people(c.f.staff_needed) }), action: { label: t('Labour priorities'), run: () => nav.toTab('workforce') } });
  }
  if (!c.blockers.includes(B_WORN) && c.f.enabled && c.f.condition_bp < 8000) {
    out.push({ tone: 'warn', text: t('Condition is {pct}. It recovers while upkeep is fully supplied.', { pct: pct(c.f.condition_bp) }) });
  }
  return out;
}

function PowerChip({ kind, amount, out, tipText }: { kind: 'shaft' | 'elec' | 'compute'; amount: number; out?: boolean; tipText: string }) {
  return <span class={cx('ledger-qty is-power', out && 'is-out')} {...tip(tipText)}><Glyph name={kind} size={14} /><b><i class="ledger-approx">≈</i>{svc(kind, amount)}</b></span>;
}

const POWER_NAME = { shaft: 'shaft power', elec: 'electricity', compute: 'computing' } as const;

function FacilityCard({ c, ledger, obs, nav, flash, busy }: { c: FacCard; ledger: Ledger; obs: Observation; nav: Nav; flash: boolean; busy: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (flash) ref.current?.scrollIntoView({ block: 'center' }); }, [flash]);
  const f = c.f;
  const off = !f.enabled;
  const watching = isReadOnly();
  const tone = off ? 'muted' : c.throttled && !c.troubled ? 'muted' : c.rateBp >= 8000 ? 'ok' : c.rateBp >= 4000 ? 'warn' : 'bad';
  const advice = off ? [] : advise(c, ledger, obs, nav);
  const general = Math.max(0, f.staff_needed - c.skilledPosts);
  const quals = c.jobs.filter((j) => j.qual);
  const rateTip = c.run
    ? t('{recipe}: {pct} of full output last month. Verified by the referee.', { recipe: tc(c.run.name), pct: pct(c.rateBp) })
    : t('Staffed share of posts last month: {pct}. Verified by the referee.', { pct: pct(f.utilization_bp) });
  const flowNote = t('Per month at last month’s rate of {pct}; at full rate {full}.', { pct: pct(c.rateBp), full: '{full}' });
  const hasFlow = c.inputs.length > 0 || c.outputs.length > 0 || c.research || c.deliver.shaft + c.deliver.elec + c.deliver.compute > 0 || c.isFood
    || (c.recipe && (c.recipe.out_shaft || c.recipe.out_elec || c.recipe.out_compute));
  const drawn = (['shaft', 'elec', 'compute'] as const).filter((k) => c.draw[k] > 0);
  const out = (['shaft', 'elec', 'compute'] as const).filter((k) => (c.recipe ? (k === 'shaft' ? c.recipe.out_shaft : k === 'elec' ? c.recipe.out_elec : c.recipe.out_compute) ?? 0 : 0) > 0);
  const toggle = () => void act({ kind: 'set_policy', setting: { kind: 'facility', region: c.region.id, facility: f.kind, enabled: !f.enabled } }, 'facility:' + c.key, { quiet: true });

  return (
    <article class={cx('ledger-card', off && 'is-off', c.troubled && !off && 'is-troubled', advice.some((a) => a.tone === 'bad') && 'is-starved', flash && 'is-flash')} ref={ref} data-card={c.key}>
      <header class="ledger-card-head">
        <span class="ledger-card-crest" {...tip(t(CATEGORY_LABEL[c.category] ?? c.category))}><Glyph name={c.category} size={18} /></span>
        <div class="ledger-card-title">
          <b>{tc(f.name)}</b>
          <button type="button" class="ledger-card-region" onClick={() => nav.showOnMap(c.region.id)} {...tip(t('Close the ledger and show {region} on the map.', { region: tc(c.region.name) }))}>
            <Icon name="pin" size={10} />{tc(c.region.name)}
          </button>
        </div>
        <span class="ledger-card-level" {...tip(t('Level {level} of the {max} this site allows. Recipe amounts scale with level.', { level: f.level, max: f.max_level }))}>
          <small>{t('Lv')}</small><b>{f.level}</b><small>/{f.max_level}</small>
        </span>
        <button type="button" role="switch" aria-checked={f.enabled} class={cx('ledger-switch', f.enabled && 'is-on')} disabled={busy || watching}
          data-testid={`toggle-${c.key}`} onClick={toggle}
          {...tip(watching ? t('You are observing') : f.enabled ? t('Running. Switch off to free its staff and stop its upkeep; condition then decays slowly.') : t('Switched off. Switch on to staff it again from next month.'))}>
          <i /><span class="sr-only">{f.enabled ? t('Running') : t('Switched off')}</span>
        </button>
      </header>

      <div class="ledger-card-vitals">
        <Ring bp={c.rateBp} tone={tone} off={off} tipText={rateTip} />
        <div class="ledger-card-meters">
          <div class="ledger-meter-row" {...tip(c.isFood
            ? t('Food workers on this land last month, of the posts it offers. Set by the food plan, not by labour weights. Verified by the referee.')
            : t('Posts filled last month. Verified by the referee.') + (quals.length ? '\n' + t('Posts by kind: {quals}; {n} general.', { quals: joinList(quals.map((j) => qualCount(lc(QUAL_LABEL[j.qual as Qual]), j.posts))), n: people(general) }) : ''))}>
            <span class="ledger-meter-label">{t('Staff')}</span>
            <Bar parts={[{ value: f.staffed, cls: f.staffed >= f.staff_needed ? 'is-ok' : 'is-warn' }]} max={Math.max(1, f.staff_needed)} mark={quals.length && f.staff_needed ? c.skilledPosts : undefined} height={7} />
            <span class="ledger-meter-val">{f.staff_needed ? <><b>{people(f.staffed)}</b>/{people(f.staff_needed)}</> : <span class="muted">–</span>}</span>
          </div>
          {quals.length ? (
            <div class={cx('ledger-quals', c.blockers.includes(B_QUALIFIED) && 'is-missing')}
              {...tip(t('Qualified posts at this level, from the catalogue. The share actually filled by qualified people is not reported; the referee only says when they are missing.'))}>
              {quals.map((j) => <span>{qualCount(lc(QUAL_LABEL[j.qual as Qual]), j.posts)}</span>)}
              {c.blockers.includes(B_QUALIFIED) ? <Icon name="warn" size={10} /> : null}
            </div>
          ) : null}
          <div class="ledger-meter-row" {...tip(t('Condition of the plant. It falls when upkeep is missed and caps output. Verified by the referee.'))}>
            <span class="ledger-meter-label">{t('Condition')}</span>
            <Bar parts={[{ value: f.condition_bp, cls: f.condition_bp >= 9000 ? 'is-ok' : f.condition_bp >= 6000 ? 'is-warn' : 'is-bad' }]} max={10000} height={7} />
            <span class="ledger-meter-val"><b>{pct(f.condition_bp)}</b></span>
          </div>
        </div>
      </div>

      {hasFlow ? (
        <div class="ledger-flow" data-rate={c.rateBp}>
          <span class="ledger-flow-side">
            {c.inputs.map((i) => <GoodQtyChip good={i.good} amount={i.now} est missing={i.missing}
              tipText={t(GOOD_LABEL[i.good]) + (i.missing ? ' — ' + t('ran short last month') : '') + '\n' + flowNote.replace('{full}', amt(i.good, i.full)) + ' ' + t('Estimate.')} />)}
            {drawn.map((k) => <PowerChip kind={k} amount={c.draw[k]} tipText={t('Draws about {n} {power} a month at its present staffing. Estimate from the recipe.', { n: svc(k, c.draw[k]), power: t(POWER_NAME[k]) })} />)}
            {!c.inputs.length && !drawn.length ? <span class="ledger-flow-none">{c.isFood ? t('land and labour') : t('labour only')}</span> : null}
          </span>
          <span class="ledger-flow-arrow" aria-hidden="true"><svg width="26" height="12" viewBox="0 0 26 12"><path d="M1 6h22M18 1.500 23.500 6 18 10.500" fill="none" stroke="currentColor" stroke-width="1.600" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          <span class="ledger-flow-side is-out">
            {c.outputs.filter(() => !c.isFood).map((o) => <GoodQtyChip good={o.good} amount={o.now} est
              tipText={t(GOOD_LABEL[o.good]) + '\n' + flowNote.replace('{full}', amt(o.good, o.full)) + ' ' + t('After carriage to the common store ({pct}). Estimate.', { pct: pct(c.own.link_efficiency_bp) })} />)}
            {out.map((k) => <PowerChip kind={k} out amount={c.deliver[k]} tipText={t('Delivers about {n} {power} a month at last month’s rate. Estimate from the recipe.', { n: svc(k, c.deliver[k]), power: t(POWER_NAME[k]) })} />)}
            {c.research ? (
              <span class="ledger-qty is-research" {...tip(t('Up to {n} of {cls} a month at full staffing. What the realm actually had is on the balance sheet.', { n: researchMonths(c.research.full), cls: lc(RESEARCH_LABEL[c.research.cls]) }))}>
                <Glyph name="Research" size={14} /><b>{researchMonths(c.research.full)}</b><small>{t('max')}</small>
              </span>
            ) : null}
            {c.isFood ? <span class="ledger-qty" {...tip(t('Food grown here is part of the realm’s harvest; the referee reports it only as a national total (see the market).'))}><GoodIcon good="food" size={16} /><b>{t('harvest')}</b></span> : null}
            {!c.outputs.length && !out.length && !c.research && !c.isFood ? <span class="ledger-flow-none">{t('services')}</span> : null}
          </span>
          <small class="ledger-flow-per">{t('/mo')}</small>
        </div>
      ) : (
        <p class="ledger-card-provides">{c.type?.provides.length ? c.type.provides.map((x) => tc(x)).join(' · ') : c.type ? tc(c.type.description).split('. ')[0] : ''}</p>
      )}

      <footer class="ledger-card-foot">
        <span class="ledger-upkeep" {...tip(t('Upkeep per month while switched on: catalogue amount per level × level. Missing it wears the plant down.'))}>
          <Glyph name="upkeep" size={13} />
          {c.upkeep.length ? c.upkeep.map((u) => <span class="ledger-upkeep-item"><GoodIcon good={u.good} size={13} />{amt(u.good, u.perMonth)}</span>) : <span class="muted">{off ? t('none while off') : t('no upkeep')}</span>}
        </span>
        {c.run ? <span class="ledger-recipe" {...tip(f.method ? t('The production method this works ran last month. It was chosen for this region; change it in the regional works view.') : t('The production method this works ran last month, left to the works: the first known one whose inputs are in stock.'))}>{tc(c.run.name)}</span> : null}
      </footer>

      {advice.length || off ? (
        <ul class="ledger-advice">
          {off ? <li class="is-info"><Icon name="pause" size={11} /><span>{t('Switched off: no staff, no upkeep, no output.')}</span></li> : null}
          {advice.map((a) => (
            <li class={'is-' + a.tone}>
              <Icon name={a.tone === 'info' ? 'info' : a.tone === 'bad' ? 'danger' : 'warn'} size={11} />
              <span>{a.text}</span>
              {a.action ? <button type="button" class="ledger-step" onClick={a.action.run}>{a.action.label} <Icon name="right" size={9} /></button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ActionNote tag={'facility:' + c.key} />
    </article>
  );
}

function PowerLine({ kind, supply, demand }: { kind: 'shaft' | 'elec' | 'compute'; supply: number; demand: number }) {
  if (!supply && !demand) return null;
  const short = demand > supply;
  return (
    <span class={cx('ledger-power', short && 'is-short')}
      {...tip(t('{power}: works called for {d}, {s} was delivered last month. Verified by the referee.', { power: t(POWER_NAME[kind]), d: svc(kind, demand), s: svc(kind, supply) }) + (kind === 'compute' ? '\n' + t('Computing is pooled across the realm; every region shows the same figures.') : ''))}>
      <Glyph name={kind} size={13} />
      <Bar parts={[{ value: demand, cls: short ? 'is-bad' : 'is-supply' }]} max={Math.max(supply, demand, 1)} mark={short ? supply : undefined} height={6} />
      <span class="ledger-power-num">{t('{d} of {s}', { d: svc(kind, demand), s: svc(kind, supply) })}</span>
    </span>
  );
}

function RegionTile({ r, onClick, active }: { r: RegionSum; onClick?: () => void; active?: boolean }) {
  const p = r.own.power;
  const none = !p.shaft_supply && !p.shaft_demand && !p.elec_supply && !p.elec_demand;
  const body: ComponentChildren = (
    <>
      <span class="ledger-region-name"><b>{tc(r.region.name)}</b>{r.troubled ? <span class="ledger-flag is-warn" {...tip(t('{n} works held back in this region.', { n: r.troubled }))}>{r.troubled}</span> : null}</span>
      <span class="ledger-region-power">
        {none ? <small class="muted">{t('no power plant')}</small> : null}
        <PowerLine kind="shaft" supply={p.shaft_supply} demand={p.shaft_demand} />
        <PowerLine kind="elec" supply={p.elec_supply} demand={p.elec_demand} />
      </span>
      <span class="ledger-region-facts">
        <span class={cx(r.own.link_efficiency_bp < 8000 && 'is-warn')} {...tip(t('Carriage: {pct} of what this region makes (other than food) reaches the common store. Transport grade {grade}. Verified by the referee.', { pct: pct(r.own.link_efficiency_bp), grade: r.own.transport_level }))}>
          <Glyph name="carriage" size={13} /><b>{pct(r.own.link_efficiency_bp)}</b>
        </span>
        <span {...tip(t('People of working age without a post last month. Verified by the referee.'))}><Glyph name="idle" size={13} /><b>{people(r.household)}</b></span>
        <span class={cx(r.vacancies > 0 && 'is-warn')} {...tip(t('Open posts: {n} of {posts} posts in works that are switched on stood empty last month. Verified by the referee.', { n: people(r.vacancies), posts: people(r.posts) }))}><Icon name="labour" size={12} /><b>{people(r.vacancies)}</b></span>
      </span>
    </>
  );
  return onClick
    ? <button type="button" class={cx('ledger-region', active && 'is-active')} onClick={onClick}>{body}</button>
    : <div class="ledger-region is-static">{body}</div>;
}

export function ProductionTab({ obs, ledger, nav, focusCard, focusRegion, focusNonce }: {
  obs: Observation; ledger: Ledger; nav: Nav; focusCard: string | null; focusRegion: number | null; focusNonce: number;
}) {
  const { busy } = useApp();
  const [view, setView] = useState<View>('works');
  const [groupBy, setGroupBy] = useState<GroupBy>('kind');
  const [filter, setFilter] = useState<Filter>('all');
  const [services, setServices] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const regionRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (focusCard) {
      setView('works'); setFilter('all');
      const card = ledger.cards.find((c) => c.key === focusCard);
      if (card && !card.productive) setServices(true);
      setClosed(new Set());
    } else if (focusRegion !== null) {
      setView('works'); setGroupBy('region'); setFilter('all'); setClosed(new Set());
      requestAnimationFrame(() => regionRefs.current.get(focusRegion)?.scrollIntoView({ block: 'start' }));
    }
  }, [focusCard, focusRegion, focusNonce]);

  const pool = ledger.cards.filter((c) => services || c.productive);
  // regions with trouble first, then the busiest: farm-only regions sink to the end
  const busyIn = (id: number) => ledger.cards.filter((c) => c.region.id === id && c.productive && !c.isFood).length;
  const regions = [...ledger.regions].sort((a, b) => b.troubled - a.troubled || busyIn(b.region.id) - busyIn(a.region.id));
  const held = pool.filter((c) => c.troubled);
  const offs = pool.filter((c) => !c.f.enabled);
  const shown = filter === 'held' ? held : filter === 'off' ? offs : pool;
  const hiddenServices = ledger.cards.length - ledger.cards.filter((c) => c.productive).length;

  const groups: { key: string; title: ComponentChildren; cards: FacCard[]; region?: RegionSum; glyph?: string }[] = groupBy === 'kind'
    // categories the order does not list (ruleset 3.0 adds some) follow it rather than vanish
    ? [...CATEGORY_ORDER, ...new Set(shown.map((c) => c.category).filter((c) => !CATEGORY_ORDER.includes(c)))].map((cat) => ({ key: cat, title: CATEGORY_LABEL[cat] ? t(CATEGORY_LABEL[cat]) : tc(cat), glyph: cat, cards: shown.filter((c) => c.category === cat) })).filter((g) => g.cards.length)
    : regions.map((r) => ({ key: 'r' + r.region.id, title: tc(r.region.name), region: r, cards: shown.filter((c) => c.region.id === r.region.id) })).filter((g) => g.cards.length || filter === 'all');
  const toggleGroup = (k: string) => setClosed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toRegion = (id: number) => { setGroupBy('region'); setFilter('all'); setClosed(new Set()); requestAnimationFrame(() => regionRefs.current.get(id)?.scrollIntoView({ block: 'start' })); };

  return (
    <div class="ledger-production" data-testid="ledger-production">
      <div class="ledger-toolbar">
        <Seg<View> value={view} label={t('Production view')} testid="prod-view" onChange={setView} options={[
          { value: 'works', label: t('Works'), count: pool.length }, { value: 'chain', label: t('Supply chain') },
        ]} />
        {view === 'works' ? (
          <>
            <Seg<GroupBy> value={groupBy} label={t('Group by')} testid="prod-group" onChange={setGroupBy} options={[{ value: 'kind', label: t('By kind') }, { value: 'region', label: t('By region') }]} />
            <Seg<Filter> value={filter} label={t('Filter')} testid="prod-filter" onChange={setFilter} options={[
              { value: 'all', label: t('All') },
              { value: 'held', label: t('Held back'), count: held.length, tipText: t('Works short of staff, inputs, power or upkeep. A deliberate storage hold does not count.') },
              { value: 'off', label: t('Switched off'), count: offs.length },
            ]} />
            <span class="spacer" />
            <label class="ledger-check" {...tip(t('Also show works that make nothing countable: stores, roads, water, clinics, schools ({n}).', { n: hiddenServices }))}>
              <input type="checkbox" checked={services} data-testid="prod-services" onChange={(e) => setServices((e.target as HTMLInputElement).checked)} /> {t('Include services')} <small class="muted">{hiddenServices}</small>
            </label>
            <button type="button" class="btn btn-sm" onClick={() => nav.build()} data-testid="prod-build"><Icon name="plus" size={13} /><span>{t('Build')}</span></button>
          </>
        ) : null}
      </div>

      {view === 'chain' ? <ChainView ledger={ledger} nav={nav} /> : (
        <>
          {groupBy === 'kind' ? (
            <div class="ledger-regions" aria-label={t('Regions')}>
              {regions.map((r) => <RegionTile r={r} onClick={() => toRegion(r.region.id)} />)}
            </div>
          ) : null}
          {groups.map((g) => (
            <section class="ledger-cardgroup" ref={(el) => { if (g.region && el) regionRefs.current.set(g.region.region.id, el as HTMLElement); }}>
              <header class="ledger-cardgroup-head">
                <button type="button" class="ledger-cardgroup-toggle" aria-expanded={!closed.has(g.key)} onClick={() => toggleGroup(g.key)}>
                  <Icon name={closed.has(g.key) ? 'right' : 'down'} size={12} />
                  {g.glyph ? <Glyph name={g.glyph} size={16} /> : null}
                  <h3>{g.title}</h3>
                  <small>{t('{n} works', { n: g.cards.length })}{g.cards.some((c) => c.troubled) ? <span class="warn-text"> · {t('{n} held back', { n: g.cards.filter((c) => c.troubled).length })}</span> : null}</small>
                </button>
                {g.region ? <RegionTile r={g.region} /> : null}
              </header>
              {!closed.has(g.key) ? (
                g.cards.length ? (
                  <div class="ledger-cards">
                    {g.cards.map((c) => <FacilityCard key={c.key} c={c} ledger={ledger} obs={obs} nav={nav} flash={focusCard === c.key} busy={busy} />)}
                  </div>
                ) : <p class="ledger-none">{t('Nothing built here yet.')}</p>
              ) : null}
            </section>
          ))}
          {shown.length === 0 && groupBy === 'kind' ? (
            <p class="ledger-empty"><Glyph name="Industry" size={18} /> {filter === 'held' ? t('No works are held back.') : filter === 'off' ? t('No works are switched off.') : t('Nothing has been built yet.')}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
