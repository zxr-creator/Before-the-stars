// Regional works: the place to build and run the economy region by region.
//
//   Overview   the region's people, workforce, shared infrastructure with its caps,
//              what binds output, and the economies of scale as overhead saved
//   Works      every works with its level, staffing, method and limits; choose the
//              production method with the alternatives side by side; expand
//   Build      everything the seat knows how to build here, with the referee's quote
//   Queue      the region's construction orders in the order they are served
//   Productivity  labour productivity by sector with its factors, and the posts of
//              every works at base, after shared support and after productivity
//
// Every price is the referee's quote (`OwnRegion.construction_sites`) times the
// levels; nothing here prices an order itself (see ./works.ts). Read-only while
// observing: every control that could give an order is disabled there.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { FacilityType, FacilityView, GoodQty, Observation, Qual, RegionId, RegionView } from '../protocol';
import {
  GOOD_SHORT, LABOR_LABEL, QUAL_LABEL, SETTLEMENT_LABEL, computeQty, energy, fmtMonths, int, joinList, lc, pct,
  peopleNum, qty, qtySigned, researchMonths, tcAll, tcChecks, tn, tonnes, workMonths, RESEARCH_LABEL,
} from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Empty, GoodsList, Meter, OBSERVING, Stepper, cx, toneOfBp } from '../ui';
import { act, closeOverlay, isReadOnly, openOverlay, selectRegion, useApp } from '../store';
import {
  FREIGHT_BY_GRADE, MAINT_CAP_BP, MAINT_SPAN, SUPPORT_CAP_BP, SITE_ENGINE_PER_T, blocking, bottleneck, checks, goodsDelta,
  upgradeQuote, holders, levelsByCategory, limitsOf, methodsOf, ownRegions, queueOf, quoteFor, supportSavingAt, totalLevels,
  type Check, type MethodRow, type Quote, type QueueRow,
} from './works';
import { ERA_LABEL, eraLabel, lineLabel } from './labels';
import { RegionProductivity, WorksLabour, eraText } from './Productivity';
import { mult, postsChain } from './labour';
import './construction.css';
import './r3.css';
import { UrbanBlock } from './UrbanBlock';
import { useBuildingTree } from './BuildingTree';

type Tab = 'overview' | 'works' | 'build' | 'queue' | 'productivity';
export type WorksTabKey = Tab;

/** The tab the next opening of the view starts on (set by openWorks). */
let pendingTab: Tab | null = null;
const TRANSPORT_KINDS = ['roads', 'port', 'rail', 'depot'];
const REPAIR_KIND = 'parts_works';

/** "builders (artisans accepted)" / "建筑工（可由工匠代替）". */
export function crewQuals(quals: Qual[]): string {
  const [first, ...rest] = quals;
  if (!first) return t('general labour');
  const main = lc(QUAL_LABEL[first]);
  return rest.length ? t('{main} ({others} accepted)', { main, others: joinList(rest.map((q) => lc(QUAL_LABEL[q]))) }) : main;
}

function goodName(g: GoodQty['good']): string {
  return t(GOOD_SHORT[g] ?? g);
}

// --- the overlay ----------------------------------------------------------------------------

export function RegionalWorks({ obs, region: initial, onClose }: { obs: Observation; region: RegionId | null; onClose: () => void }) {
  useLocale();
  const s = useApp();
  const regions = ownRegions(obs);
  const [region, setRegion] = useState<RegionId | null>(initial ?? s.selectedRegion ?? obs.civ.capital);
  const [tab, setTab] = useState<Tab>(() => { const p = pendingTab; pendingTab = null; return p ?? 'overview'; });
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    if (initial !== null && initial !== undefined) setRegion(initial);
    if (pendingTab) { setTab(pendingTab); setPick(null); pendingTab = null; }
  }, [initial]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const r = regions.find((x) => x.id === region) ?? regions[0];
  const readOnly = isReadOnly();
  const choose = (id: RegionId) => { setRegion(id); setPick(null); };
  const queueLen = r?.own?.construction_queue?.length ?? 0;
  const tabs: { key: Tab; label: string; icon: string; n?: number }[] = [
    { key: 'overview', label: t('Overview'), icon: 'layers' },
    { key: 'works', label: t('Works and methods'), icon: 'box' },
    { key: 'build', label: t('Build'), icon: 'hammer' },
    { key: 'queue', label: t('Queue'), icon: 'scroll', n: queueLen },
    { key: 'productivity', label: t('Productivity'), icon: 'labour' },
  ];
  return (
    <section class="works" role="dialog" aria-label={t('Regional works')} data-testid="overlay-works">
      <header class="works-head">
        <span class="works-crest" aria-hidden="true"><Icon name="hammer" size={18} /></span>
        <div class="works-brand">
          <span class="works-kicker">{t('Construction and production')}</span>
          <h2>{t('Regional works')}</h2>
        </div>
        <nav class="works-tabs" role="tablist" aria-label={t('Regional works')}>
          {tabs.map((x) => (
            <button type="button" role="tab" aria-selected={tab === x.key} class={cx('works-tab', tab === x.key && 'is-active')} data-testid={`works-tab-${x.key}`}
              onClick={() => { setTab(x.key); setPick(null); }}>
              <Icon name={x.icon} size={13} /> {x.label}{x.n ? <i class="works-tab-count">{x.n}</i> : null}
            </button>
          ))}
        </nav>
        <span class="r3-orders">
          <button type="button" class="works-tab" data-testid="works-standing-orders" title={t('Standing orders the referee carries out every round: build targets, research and reform agendas, settlement')}
            onClick={() => openOverlay('orders', r ? 'build:' + r.id : null)}><Icon name="scroll" size={13} /> {t('Standing orders')}</button>
        </span>
        {readOnly ? <span class="works-readonly" title={t('Orders cannot be given for a seat you are only watching.')}><Icon name="eye" size={13} /> {t(OBSERVING)}</span> : null}
        <button type="button" class="works-close" aria-label={t('Close (Esc)')} title={t('Close (Esc)')} data-testid="works-close" onClick={onClose}><Icon name="close" size={16} /></button>
      </header>
      <div class="works-body">
        <RegionRail obs={obs} regions={regions} current={r?.id ?? null} onChoose={choose} />
        {r?.own ? (
          <div class="works-main" key={r.id}>
            <RegionHeader obs={obs} r={r} onTab={setTab} />
            <div class="works-pane">
              {tab === 'overview' ? <OverviewTab obs={obs} r={r} onTab={(k, p) => { setTab(k); setPick(p ?? null); }} /> : null}
              {tab === 'works' ? <WorksTab obs={obs} r={r} pick={pick} onPick={setPick} /> : null}
              {tab === 'build' ? <BuildTab obs={obs} r={r} pick={pick} onPick={setPick} /> : null}
              {tab === 'queue' ? <QueueTab obs={obs} r={r} /> : null}
              {tab === 'productivity' ? <RegionProductivity obs={obs} r={r} onWorks={(kind) => { setTab('works'); setPick(kind); }} /> : null}
            </div>
          </div>
        ) : <div class="works-main"><Empty>{t('We govern no region.')}</Empty></div>}
      </div>
    </section>
  );
}

function RegionRail({ obs, regions, current, onChoose }: { obs: Observation; regions: RegionView[]; current: RegionId | null; onChoose: (id: RegionId) => void }) {
  return (
    <nav class="works-rail" aria-label={t('Governed regions')}>
      <p class="works-rail-head">{t('Governed regions')} <small>{regions.length}</small></p>
      <ul>
        {regions.map((r) => {
          const own = r.own!;
          const q = own.construction_queue?.length ?? 0;
          const b = bottleneck(own);
          const warn = b.kind === 'freight_over' || b.kind === 'shaft' || b.kind === 'elec' || (own.construction_queue ?? []).some((e) => e.waiting_for.length && !e.paused);
          return (
            <li>
              <button type="button" class={cx('works-rail-item', r.id === current && 'is-active')} data-testid={`works-region-${r.id}`} onClick={() => onChoose(r.id)}>
                <span class="wr-name">{r.id === obs.civ.capital ? <Icon name="star" size={11} title={t('Capital')} /> : null}{tc(r.name)}</span>
                <span class="wr-meta">{t(SETTLEMENT_LABEL[r.settlement])} · {peopleNum(own.population)}</span>
                <span class="wr-tags">
                  <span title={t('Built levels')}><Icon name="layers" size={10} /> {totalLevels(own)}</span>
                  {q ? <span title={t('Orders in the queue')}><Icon name="hammer" size={10} /> {q}</span> : null}
                  {warn ? <span class="wr-warn" title={t('Something here is held back')}><Icon name="warn" size={10} /></span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RegionHeader({ obs, r, onTab }: { obs: Observation; r: RegionView; onTab: (t: Tab) => void }) {
  const own = r.own!;
  const inf = own.infrastructure;
  const b = bottleneck(own);
  return (
    <div class="works-region">
      <div class="wrh-title">
        <small>{t(SETTLEMENT_LABEL[r.settlement])}{r.id === obs.civ.capital ? ' · ' + t('Capital') : ''}</small>
        <h3 data-testid="works-region-name">{tc(r.name)}</h3>
        <span class="wrh-links">
          <button type="button" class="linklike" onClick={() => { selectRegion(r.id, true); closeOverlay(); }}><Icon name="pin" size={11} /> {t('Show on the map')}</button>
          <button type="button" class="linklike" data-testid="works-build-targets" title={t('Standing build targets for this region: the referee orders levels each round until the target is reached')}
            onClick={() => openOverlay('orders', 'build:' + r.id)}><Icon name="scroll" size={11} /> {t('Build targets')}</button>
        </span>
      </div>
      <dl class="wrh-stats">
        <div><dt>{t('Population')}</dt><dd title={t('{n} people', { n: int(own.population) })}>{peopleNum(own.population)}</dd></div>
        <div><dt>{t('Working age')}</dt><dd title={t('{n} people', { n: int(own.working_age) })}>{peopleNum(own.working_age)}</dd></div>
        <div><dt>{t('Built levels')}</dt><dd>{totalLevels(own)}</dd></div>
        {inf ? <div><dt>{t('Freight')}</dt><dd class={inf.freight_load > inf.freight_capacity ? 'neg' : undefined}>{inf.freight_load}<small> / {inf.freight_capacity}</small></dd></div> : null}
        <div class="wrh-bottleneck"><dt>{t('Binding constraint')}</dt><dd><BottleneckText b={b} onTab={onTab} /></dd></div>
      </dl>
    </div>
  );
}

function BottleneckText({ b, onTab }: { b: ReturnType<typeof bottleneck>; onTab?: (t: Tab) => void }) {
  if (b.kind === 'freight_over') return <span class="neg">{t('Freight over capacity: {load} levels on {cap}', { load: b.load, cap: b.cap })}</span>;
  if (b.kind === 'freight_near') return <span class="warn-text">{t('Freight nearly full: {load} of {cap} levels', { load: b.load, cap: b.cap })}</span>;
  if (b.kind === 'shaft') return <span class="neg">{t('Shaft power short: {demand} asked, {supply} supplied', { demand: energy(b.demand), supply: energy(b.supply) })}</span>;
  if (b.kind === 'elec') return <span class="neg">{t('Electricity short: {demand} asked, {supply} supplied', { demand: energy(b.demand), supply: energy(b.supply) })}</span>;
  if (b.kind === 'queue') return <button type="button" class="linklike warn-text" onClick={() => onTab?.('queue')}>{tn(b.orders, 'Construction waits: {reason}', 'Construction waits ({n} orders): {reason}', { n: b.orders, reason: tc(b.text) })}</button>;
  if (b.kind === 'blocker') return <button type="button" class="linklike warn-text" onClick={() => onTab?.('works')}>{tc(b.text)} <small>({joinList(b.works.slice(0, 2).map(tc))}{b.works.length > 2 ? '…' : ''})</small></button>;
  return <span class="muted">{t('Nothing held output back last month')}</span>;
}

// --- overview ---------------------------------------------------------------------------------

function OverviewTab({ obs, r, onTab }: { obs: Observation; r: RegionView; onTab: (t: Tab, pick?: string) => void }) {
  const own = r.own!;
  const inf = own.infrastructure;
  const p = own.power;
  const lab = own.labor;
  const cats = levelsByCategory(obs, own);
  const total = Math.max(1, cats.reduce((n, c) => n + c.levels, 0));
  const limits = limitsOf(own);
  const grade = Math.max(0, Math.min(3, own.transport_level));
  const repair = own.facilities.find((f) => f.kind === REPAIR_KIND);
  const savers = own.facilities.filter((f) => (f.scale_saving_bp ?? 0) > 0);
  const storage = obs.civ.goods.filter((g) => g.capacity !== null);
  const labParts: [string, number][] = [
    ['Food', lab.food], ['Works', lab.facilities], ['Projects', lab.projects], ['Students', lab.students],
    ['Teachers', lab.teachers], ['Soldiers', lab.soldiers], ['Household', lab.household],
  ];
  const quals = own.quals.filter((q) => q.count > 0).sort((a, b) => b.count - a.count);
  return (
    <div class="works-overview">
      <section class="wo-card wo-wide">
        <h4>{t('Workforce')}</h4>
        <div class="wo-labour">
          {labParts.map(([k, n]) => (
            <div class={n === 0 ? 'is-zero' : undefined}><span>{t(k)}</span><b>{peopleNum(n)}</b><Meter value={n} max={Math.max(1, lab.working_age)} height={4} /></div>
          ))}
        </div>
        <p class="wo-note">{t('{n} people of working age, as counted last month. Household and unassigned people are who construction can call up.', { n: peopleNum(lab.working_age) })}</p>
        {quals.length ? (
          <p class="wo-quals">{quals.map((q, i) => <span>{i ? ' · ' : ''}<b>{peopleNum(q.count)}</b> {lc(QUAL_LABEL[q.qual])} <small class="muted">({t('{n} employed', { n: peopleNum(q.employed) })})</small></span>)}</p>
        ) : <p class="wo-note">{t('No one here holds a qualification yet.')}</p>}
      </section>

      <section class="wo-card" data-testid="works-freight">
        <h4><Icon name="compass" size={13} /> {t('Freight')}</h4>
        {inf ? (
          <>
            <div class="wo-figure"><b class={inf.freight_load > inf.freight_capacity ? 'neg' : undefined}>{inf.freight_load}</b> / {inf.freight_capacity} <small>{t('levels of industry, extraction and power')}</small></div>
            <Meter value={inf.freight_load} max={Math.max(inf.freight_capacity, inf.freight_load, 1)} tone={inf.freight_load > inf.freight_capacity ? 'bad' : inf.freight_capacity - inf.freight_load <= 2 ? 'warn' : 'ok'} mark={inf.freight_load > inf.freight_capacity ? inf.freight_capacity / inf.freight_load : undefined} />
            <p class="wo-note">{t('Transport grade {g} of 3 carries {cap} levels.', { g: grade, cap: FREIGHT_BY_GRADE[grade] })} {grade < 3 ? t('Grade {g} would carry {cap}.', { g: grade + 1, cap: FREIGHT_BY_GRADE[grade + 1] }) : null}</p>
            {inf.infra_bp < 10000 ? <p class="wo-warn"><Icon name="warn" size={11} /> {t('Only {pct} of the load is served: savings shrink in proportion and {loss} more of what the region sends is lost in carriage.', { pct: pct(inf.infra_bp), loss: pct(inf.congestion_loss_bp, 1) })}</p> : null}
            {grade < 3 ? <button type="button" class="linklike" data-testid="works-to-transport" onClick={() => onTab('build', obs.catalog.facilities.find((f) => TRANSPORT_KINDS.includes(f.kind) && f.available)?.kind)}>{t('Transport works (roads, harbour, railway, depot)')} <Icon name="right" size={10} /></button> : null}
          </>
        ) : <p class="wo-note">{t('This referee does not report freight.')}</p>}
      </section>

      <section class="wo-card">
        <h4><Icon name="spark" size={13} /> {t('Power')}</h4>
        {p.shaft_supply || p.shaft_demand || p.elec_supply || p.elec_demand || p.compute_supply || p.compute_demand ? (
          <ul class="wo-lines">
            {p.shaft_supply || p.shaft_demand ? <PowerLine label={t('Shaft power')} supply={p.shaft_supply} demand={p.shaft_demand} fmt={energy} /> : null}
            {p.elec_supply || p.elec_demand ? <PowerLine label={t('Electricity')} supply={p.elec_supply} demand={p.elec_demand} fmt={energy} /> : null}
            {p.compute_supply || p.compute_demand ? <PowerLine label={t('Computation')} supply={p.compute_supply} demand={p.compute_demand} fmt={computeQty} /> : null}
          </ul>
        ) : <p class="wo-note">{t('No shaft, electric or computing capacity here. Industrial sites draw site power from site engines burning coal, then refined fuel.')}</p>}
      </section>

      <section class="wo-card">
        <h4><Icon name="box" size={13} /> {t('Storage')} <small class="muted">{t('national')}</small></h4>
        {storage.length ? (
          <ul class="wo-lines">
            {storage.map((g) => (
              <li><span>{goodName(g.good)}</span><Meter value={g.stock} max={Math.max(1, g.capacity!, g.stock)} tone={g.stock >= g.capacity! ? 'warn' : 'accent'} height={5} /><small>{qty(g.good, g.stock)} / {qty(g.good, g.capacity!)}</small></li>
            ))}
          </ul>
        ) : <p class="wo-note">{t('No storage limit applies.')}</p>}
        <p class="wo-note">{t('Stores are held by the nation, not by region; a full store throttles the works that fill it.')}</p>
      </section>

      <section class="wo-card">
        <h4><Icon name="hammer" size={13} /> {t('Maintenance')}</h4>
        {inf ? (
          <>
            <div class="wo-figure"><b>{pct(inf.maintenance_saving_bp, 1)}</b> <small>{t('of spares and tools upkeep saved, cap {cap}', { cap: pct(MAINT_CAP_BP) })}</small></div>
            <Meter value={inf.maintenance_saving_bp} max={MAINT_CAP_BP} tone="ok" height={5} />
            <p class="wo-note">{repair
              ? t('{n} levels of parts and repair works serve up to {span} levels; the load is {load}. They pool only what they ran last month ({pct}).', { n: repair.level, span: repair.level * MAINT_SPAN, load: inf.freight_load, pct: pct(repair.utilization_bp) })
              : t('No parts and repair works here: each level would serve twelve levels of industry and needs its own qualified crew and inputs.')}</p>
          </>
        ) : null}
      </section>

      <section class="wo-card wo-wide" data-testid="works-scale">
        <h4>{t('Economies of scale')} <small class="muted">{t('overhead saved, never extra output')}</small></h4>
        <table class="table wo-scale">
          <thead><tr><th>{t('Effect')}</th><th>{t('Now')}</th><th>{t('Cap')}</th><th>{t('Limited by')}</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">{t('Shared support posts')}</th>
              <td>{savers.length ? joinList(savers.map((f) => `${tc(f.name)} ${pct(f.scale_saving_bp ?? 0)}`)) : <span class="muted">{t('none yet: a works saves 2% of its general posts for each level beyond the first')}</span>}</td>
              <td>{pct(inf?.support_saving_cap_bp ?? SUPPORT_CAP_BP)}{inf && inf.support_saving_cap_bp < SUPPORT_CAP_BP ? <small class="neg"> ({t('of {cap}', { cap: pct(SUPPORT_CAP_BP) })})</small> : null}</td>
              <td>{inf && inf.infra_bp < 10000 ? <span class="neg">{t('freight: {pct} served', { pct: pct(inf.infra_bp) })}</span> : t('condition of at least 75%; freight capacity')}</td>
            </tr>
            <tr>
              <th scope="row">{t('Maintenance pooling')}</th>
              <td>{pct(inf?.maintenance_saving_bp ?? 0, 1)}</td>
              <td>{pct(MAINT_CAP_BP)}</td>
              <td>{repair ? t('{n} repair levels serve {span}; their own running', { n: repair.level, span: repair.level * MAINT_SPAN }) : t('no parts and repair works')}</td>
            </tr>
            <tr>
              <th scope="row">{t('Integrated chains')}</th>
              <td>{inf && inf.chain_loss_saved.length ? <GoodsList items={inf.chain_loss_saved} per={t('carriage loss avoided last month')} /> : inf && inf.chain_exempt.length ? <span><GoodsList items={inf.chain_exempt} /> <small class="muted">{t('used where made; no loss to avoid')}</small></span> : <span class="muted">{t('nothing made here was used here')}</span>}</td>
              <td>{t('the carriage loss itself')}</td>
              <td>{t('what the region’s own works take as inputs')}</td>
            </tr>
            <tr>
              <th scope="row">{t('Freight congestion')}</th>
              <td class={inf && inf.congestion_loss_bp ? 'neg' : undefined}>{inf && inf.congestion_loss_bp ? t('{pct} more lost', { pct: pct(inf.congestion_loss_bp, 1) }) : t('none')}</td>
              <td>{pct(2000)}</td>
              <td>{t('transport grade')}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="wo-card">
        <h4>{t('Specialisation')} <small class="muted">{t('by built levels')}</small></h4>
        <ul class="wo-lines">
          {cats.map((c) => (
            <li><span>{c.cat === 'food' ? t('Food and land') : t(LABOR_LABEL[c.cat as keyof typeof LABOR_LABEL] ?? c.cat)}</span><Meter value={c.levels} max={total} height={5} /><small>{c.levels} · {pct((c.levels / total) * 10000)}</small></li>
          ))}
        </ul>
      </section>

      <section class="wo-card">
        <h4>{t('What limits output')}</h4>
        {limits.length ? (
          <ul class="wo-limits">
            {limits.slice(0, 6).map((l) => <li><Icon name="warn" size={11} /> <span>{tc(l.text)}</span> <small class="muted">{joinList(l.works.map(tc))}</small></li>)}
          </ul>
        ) : <p class="wo-note">{t('Every works ran without a stated limit last month.')}</p>}
        <button type="button" class="linklike" onClick={() => onTab('works')}>{t('Works and methods')} <Icon name="right" size={10} /></button>
      </section>
      <section class="wo-card wo-wide"><UrbanBlock obs={obs} r={r} /></section>
    </div>
  );
}

function PowerLine({ label, supply, demand, fmt }: { label: string; supply: number; demand: number; fmt: (n: number) => string }) {
  const short = demand > supply;
  return (
    <li><span>{label}</span><Meter value={demand} max={Math.max(supply, demand, 1)} tone={short ? 'bad' : 'ok'} height={5} mark={short ? supply / demand : undefined} /><small class={short ? 'neg' : undefined}>{t('{used} asked of {total}', { used: fmt(demand), total: fmt(supply) })}</small></li>
  );
}

// --- works and methods --------------------------------------------------------------------

function WorksTab({ obs, r, pick, onPick }: { obs: Observation; r: RegionView; pick: string | null; onPick: (k: string | null) => void }) {
  const own = r.own!;
  const sel = own.facilities.find((f) => f.kind === pick) ?? own.facilities.find((f) => (obs.catalog.facilities.find((x) => x.kind === f.kind)?.recipes.filter((rc) => rc.available).length ?? 0) > 1) ?? own.facilities[0];
  const converting = obs.projects.filter((p) => p.kind === 'upgrade' && p.region === r.id);
  if (!own.facilities.length && !converting.length) return <Empty>{t('Nothing has been built here yet.')}</Empty>;
  return (
    <div class="works-split">
      <div class="works-list" role="listbox" aria-label={t('Works')}>
        {converting.length ? (
          <div class="wd-convert" data-testid="converting">
            <b>{t('Converting in place')}</b>
            <ul class="plain-list">{converting.map((p) => <li>{tc(p.title)} · <small class="muted">{t('idle until it reopens · {pct} of the work done', { pct: pct(p.work_needed ? Math.round(10000 * p.work_done / p.work_needed) : 0) })}</small></li>)}</ul>
          </div>
        ) : null}
        <table class="table works-table2">
          <thead><tr><th>{t('Works')}</th><th class="num">{t('Level')}</th><th>{t('Method')}</th><th class="num">{t('Staff')}</th><th class="num" title={t('The productivity this works receives: posts are divided by it')}>{t('Prod.')}</th><th>{t('Output')}</th></tr></thead>
          <tbody>
            {own.facilities.map((f) => {
              const fac = obs.catalog.facilities.find((x) => x.kind === f.kind);
              const methods = methodsOf(fac, f);
              const active = methods.find((m) => m.active);
              const blockers = Array.from(new Set(f.runs.flatMap((x) => x.blockers)));
              const choice = methods.filter((m) => m.recipe.available).length > 1;
              return (
                <tr class={cx('works-row', f.kind === sel?.kind && 'is-selected', !f.enabled && 'is-off')} data-testid={`work-row-${f.kind}`} onClick={() => onPick(f.kind)}>
                  <th scope="row"><span class="wt-name">{tc(f.name)}</span>{f.obsolete ? <small class="wt-obsolete" data-testid={`obsolete-${f.kind}`} title={t('Two or more eras behind, and a successor can be built: it works at a penalty')}><Icon name="warn" size={10} /> {t('obsolete')}</small> : null}{fac ? <LineTag fac={fac} /> : null}{blockers.length ? <small class="wt-block"><Icon name="warn" size={10} /> {tc(blockers[0])}</small> : null}</th>
                  <td class="num"><b>{f.level}</b><small class="muted">/{f.max_level}</small></td>
                  <td>{active ? <span>{tc(active.recipe.name)}</span> : <span class="muted">–</span>}{choice ? <Badge tone={f.method ? 'accent' : 'muted'}>{f.method ? t('chosen') : t('auto')}</Badge> : null}</td>
                  <td class="num">{f.staff_needed ? <>{peopleNum(f.staffed)}<small class="muted">/{peopleNum(f.staff_needed)}</small></> : <span class="muted">–</span>}</td>
                  <td class="num">{f.productivity_bp !== undefined && postsChain(f).base > 0 ? <small class={f.productivity_bp > 10049 ? 'pos' : f.productivity_bp < 9951 ? 'neg' : 'muted'}>{mult(f.productivity_bp)}</small> : <span class="muted">–</span>}</td>
                  <td class="wt-util"><Meter value={f.utilization_bp} max={10000} tone={f.enabled ? toneOfBp(f.utilization_bp, 8000, 4000) : 'muted'} height={5} /><small>{f.enabled ? pct(f.utilization_bp) : t('idle')}</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sel ? <WorkDetail obs={obs} r={r} f={sel} /> : null}
    </div>
  );
}

function WorkDetail({ obs, r, f }: { obs: Observation; r: RegionView; f: FacilityView }) {
  useLocale();
  const s = useApp();
  const fac = obs.catalog.facilities.find((x) => x.kind === f.kind);
  const methods = methodsOf(fac, f);
  const active = methods.find((m) => m.active) ?? methods.find((m) => m.chosen) ?? methods[0];
  const blockers = Array.from(new Set(f.runs.flatMap((x) => x.blockers)));
  const missing = Array.from(new Set(f.runs.flatMap((x) => x.missing ?? [])));
  const qualPosts = active ? active.skilled * f.level : 0;
  const readOnly = isReadOnly();
  const tag = `works-${r.id}`;
  return (
    <div class="works-detail" data-testid={`work-detail-${f.kind}`}>
      <header class="wd-head">
        <div><small>{fac ? tc(fac.category) : ''}</small><h4>{tc(f.name)}</h4>{fac ? <LineTag fac={fac} long /> : null}</div>
        <strong class="wd-level">{f.level}<small> / {f.max_level}</small></strong>
      </header>
      <dl class="wd-facts">
        <div><dt>{t('Output last month')}</dt><dd>{f.enabled ? pct(f.utilization_bp) : t('idle')} <small class="muted">{t('of full output')}</small></dd></div>
        <div><dt>{t('Staff')}</dt><dd>{f.staff_needed ? t('{n} of {total} posts filled', { n: peopleNum(f.staffed), total: peopleNum(f.staff_needed) }) : t('no posts')}{qualPosts ? <small class="muted"> · {t('{n} qualified', { n: peopleNum(qualPosts) })}</small> : null}</dd></div>
        <div><dt>{t('Condition')}</dt><dd class={f.condition_bp < 7500 ? 'neg' : undefined}>{pct(f.condition_bp)}</dd></div>
        {f.scale_saving_bp ? <div><dt>{t('Shared support')}</dt><dd class="pos">{t('{pct} fewer general posts', { pct: pct(f.scale_saving_bp) })}</dd></div> : null}
      </dl>
      {blockers.length || missing.length ? (
        <ul class="wd-limits">
          {blockers.map((b) => <li><Icon name="warn" size={11} /> {tc(b)}</li>)}
          {missing.length ? <li><Icon name="warn" size={11} /> {t('Ran short of {goods} last month.', { goods: joinList(missing.map((g) => lc(GOOD_SHORT[g]))) })}</li> : null}
        </ul>
      ) : <p class="wd-ok"><Icon name="check" size={11} /> {t('Nothing held this works back last month.')}</p>}
      {f.obsolete ? <p class="wd-limits warn-text" data-testid="obsolete-note"><Icon name="warn" size={11} /> {t('Obsolete: two or more eras behind, with a successor you can build. Upgrade it in place, or it keeps working at a penalty.')}</p> : null}
      <div class="wd-actions">
        <Btn small kind="ghost" icon={f.enabled ? 'pause' : 'play'} disabled={s.busy} testid={`works-toggle-${f.kind}`}
          onClick={() => void act({ kind: 'set_policy', setting: { kind: 'facility', region: r.id, facility: f.kind, enabled: !f.enabled } }, tag, { quiet: true })}>{f.enabled ? t('Idle it') : t('Put back to work')}</Btn>
      </div>

      {methods.length ? <MethodCompare obs={obs} r={r} f={f} fac={fac!} methods={methods} readOnly={readOnly} tag={tag} /> : null}

      <WorksLabour r={r} f={f} fac={fac} />

      {fac ? <ExpandBlock obs={obs} r={r} fac={fac} f={f} /> : null}
      {fac ? <UpgradeBlock obs={obs} r={r} fac={fac} f={f} /> : null}
      {fac ? <DemolishBlock fac={fac} r={r} f={f} /> : null}
      <ActionNote tag={tag} />
    </div>
  );
}

function services(rc: MethodRow['recipe'], levels: number): { drawn: string[]; made: string[] } {
  const drawn: string[] = [];
  const made: string[] = [];
  if (rc.shaft) drawn.push(t('{n} shaft', { n: energy(rc.shaft * levels) }));
  if (rc.elec) drawn.push(t('{n} electric', { n: energy(rc.elec * levels) }));
  if (rc.compute) drawn.push(t('{n} compute', { n: computeQty(rc.compute * levels) }));
  if (rc.out_shaft) made.push(t('{n} shaft', { n: energy(rc.out_shaft * levels) }));
  if (rc.out_elec) made.push(t('{n} electric', { n: energy(rc.out_elec * levels) }));
  if (rc.out_compute) made.push(t('{n} compute', { n: computeQty(rc.out_compute * levels) }));
  if (rc.research) made.push(t('{n} of {kind}', { n: researchMonths(rc.research[1] * levels), kind: lc(RESEARCH_LABEL[rc.research[0]]) }));
  return { drawn, made };
}

function MethodCompare({ obs, r, f, fac, methods, readOnly, tag }: { obs: Observation; r: RegionView; f: FacilityView; fac: FacilityType; methods: MethodRow[]; readOnly: boolean; tag: string }) {
  const s = useApp();
  const [perRegion, setPerRegion] = useState(false);
  const lv = perRegion ? Math.max(1, f.level) : 1;
  const running = methods.find((m) => m.active) ?? methods[0];
  const several = methods.length > 1;
  const fields = f.kind === 'fields';
  const setMethod = (key: string | null) => void act({ kind: 'set_policy', setting: { kind: 'method', region: r.id, facility: f.kind, method: key } }, tag);
  return (
    <section class="wd-methods" data-testid={`methods-${f.kind}`}>
      <div class="wd-sub">
        <h5>{several ? t('Production methods') : t('Production method')}</h5>
        <div class="wd-scope" role="radiogroup" aria-label={t('Figures for')}>
          <button type="button" class={cx(!perRegion && 'is-active')} aria-checked={!perRegion} role="radio" onClick={() => setPerRegion(false)}>{t('per level')}</button>
          <button type="button" class={cx(perRegion && 'is-active')} aria-checked={perRegion} role="radio" data-testid={`methods-scope-${f.kind}`} onClick={() => setPerRegion(true)}>{tn(f.level, 'all {n} level', 'all {n} levels', { n: f.level })}</button>
        </div>
      </div>
      {several ? (
        <p class="wd-note">
          {f.method ? t('Chosen: the method runs whether or not its inputs are in store; a works that is short stands still and says what it lacks.') : t('Automatic: the works run the first method whose inputs are in store.')}
          {fields ? ' ' + t('For fields a choice is a ceiling: the land is worked by the best method not above it whose inputs are in store.') : ''}
          {' '}{t('A change takes effect from the next month; it needs no construction.')}
        </p>
      ) : null}
      <div class="wd-method-grid" style={{ gridTemplateColumns: `repeat(${methods.length}, minmax(176px, 1fr))` }}>
        {methods.map((m) => {
          const rc = m.recipe;
          const sv = services(rc, lv);
          const dIn = goodsDelta(running.recipe.inputs, rc.inputs, Math.max(1, f.level));
          const dOut = goodsDelta(running.recipe.outputs, rc.outputs, Math.max(1, f.level));
          const dGen = (m.general - running.general) * f.level;
          const dSk = (m.skilled - running.skilled) * f.level;
          const same = m === running;
          return (
            <article class={cx('wm', m.active && 'is-active', m.chosen && 'is-chosen', !rc.available && 'is-locked')} data-testid={`method-${f.kind}-${rc.key}`}>
              <header>
                <b>{!rc.available ? <Icon name="lock" size={11} title={t('Requirement not met')} /> : null}{tc(rc.name)}</b>
                <span class="wm-badges">
                  {m.active ? <Badge tone="ok">{t('running')}</Badge> : null}
                  {m.chosen ? <Badge tone="accent">{t('chosen')}</Badge> : null}
                </span>
              </header>
              <dl>
                <div><dt>{t('Takes')}</dt><dd><GoodsList items={rc.inputs.map((g) => ({ ...g, amount: g.amount * lv }))} empty={t('nothing')} /></dd></div>
                <div><dt>{t('Makes')}</dt><dd>{rc.outputs.length ? <GoodsList items={rc.outputs.map((g) => ({ ...g, amount: g.amount * lv }))} /> : null}{sv.made.length ? <span>{rc.outputs.length ? ' · ' : ''}{sv.made.join(' · ')}</span> : null}{!rc.outputs.length && !sv.made.length ? <span class="muted">{tc(rc.note) || t('services')}</span> : null}</dd></div>
                <div><dt>{t('Draws')}</dt><dd>{sv.drawn.length ? sv.drawn.join(' · ') : <span class="muted">{t('no power')}</span>}</dd></div>
                <div><dt>{t('General posts')}</dt><dd>{peopleNum(m.general * lv)}</dd></div>
                <div><dt>{t('Qualified posts')}</dt><dd>{(rc.skilled_posts ?? []).length ? (rc.skilled_posts ?? []).map((j, i) => <span>{i ? ' · ' : ''}{peopleNum(j.count * lv)} {j.qual ? lc(QUAL_LABEL[j.qual]) : t('general labour')}</span>) : <span class="muted">{t('none')}</span>}</dd></div>
              </dl>
              {several && !same ? (
                <div class="wm-delta" title={t('Against the method that ran last month, for the region’s {n} levels at full rate', { n: f.level })}>
                  <small>{tn(f.level, 'Switching from {m}, for {n} level:', 'Switching from {m}, for {n} levels:', { m: tc(running.recipe.name), n: f.level })}</small>
                  <DeltaLine label={t('inputs')} items={dIn} invert />
                  <DeltaLine label={t('outputs')} items={dOut} />
                  {dGen || dSk ? <p class={cx('wm-posts', dGen + dSk > 0 ? 'neg' : 'pos')}>{t('posts {general} general, {skilled} qualified', { general: signedInt(dGen), skilled: signedInt(dSk) })}</p> : null}
                </div>
              ) : null}
              {rc.note && rc.outputs.length ? <p class="wm-note">{tc(rc.note)}</p> : null}
              {several ? (
                <Btn small kind={m.chosen ? 'default' : 'primary'} disabled={s.busy || m.chosen || readOnly} why={!rc.available ? t('A known requirement is unmet') : null} testid={`choose-${f.kind}-${rc.key}`} onClick={() => setMethod(rc.key)}>
                  {m.chosen ? t('Chosen') : t('Run this method')}
                </Btn>
              ) : null}
            </article>
          );
        })}
      </div>
      {several ? (
        <div class="wd-auto">
          <Btn small kind="ghost" disabled={s.busy || !f.method} testid={`method-auto-${f.kind}`} onClick={() => setMethod(null)}>{t('Leave it to the works (automatic)')}</Btn>
          {f.method && f.active_method && f.method !== f.active_method ? <small class="warn-text">{t('Chosen {a}; last month ran {b}.', { a: tc(methods.find((m) => m.chosen)?.recipe.name ?? f.method), b: tc(methods.find((m) => m.active)?.recipe.name ?? f.active_method) })}</small> : null}
        </div>
      ) : null}
    </section>
  );
}

function signedInt(n: number): string {
  return n === 0 ? '0' : (n > 0 ? '+' : '−') + peopleNum(Math.abs(n));
}

function DeltaLine({ label, items, invert }: { label: string; items: GoodQty[]; invert?: boolean }) {
  if (!items.length) return <p class="wm-delta-line muted">{t('{label}: no change', { label })}</p>;
  return (
    <p class="wm-delta-line">{label}: {items.map((g, i) => {
      const good = invert ? g.amount < 0 : g.amount > 0;
      return <span class={good ? 'pos' : 'neg'}>{i ? ' · ' : ''}{qtySigned(g.good, g.amount)} {goodName(g.good)}</span>;
    })}</p>
  );
}

// --- the quote --------------------------------------------------------------------------------

/** The referee's price for `levels` levels in a region, with what the order will wait for. */
export function QuoteBlock({ obs, r, fac, q, testid }: { obs: Observation; r: RegionView; fac: FacilityType; q: Quote | null; testid?: string }) {
  useLocale();
  const cs = checks(obs, r, fac, q);
  if (!q) {
    return <div class="quote" data-testid={testid}><CheckLines cs={cs} r={r} fac={fac} /></div>;
  }
  return (
    <div class="quote" data-testid={testid} data-work={q.work} data-power={q.power} data-months={q.months}>
      <dl class="quote-terms">
        <div><dt>{t('Materials')}</dt><dd data-testid={testid ? testid + '-goods' : undefined}><GoodsList items={q.goods} empty={t('labour only')} /></dd></div>
        <div><dt>{t('Work')}</dt><dd><b>{workMonths(q.work)}</b> <small class="muted">{t('at most {n} a month', { n: workMonths(q.monthly) })}</small></dd></div>
        <div><dt>{t('Site crew')}</dt><dd>{q.crew.length ? q.crew.map((c, i) => <span>{i ? ' · ' : ''}<b>{peopleNum(c.count)}</b> {crewQuals(c.quals)}</span>) : <span class="muted">{t('none needed')}</span>}{q.crew.length ? <small class="muted"> · {t('held from this region while the order is open')}</small> : null}</dd></div>
        <div><dt>{t('Site power')}</dt><dd>{q.power ? <><b>{energy(q.power)}</b> <small class="muted">{t('a month of full work')}</small></> : <span class="muted">{t('none')}</span>}</dd></div>
        <div><dt>{t('Time')}</dt><dd><b>{t('at least {m}', { m: fmtMonths(q.months) })}</b>{q.firstOfKind ? <small class="warn-text"> · {t('first of its kind: half as much work and time again, included')}</small> : null}</dd></div>
        <div><dt>{t('Site')}</dt><dd>{t('{built} built, {queued} queued, of {cap}', { built: q.built, queued: q.queued, cap: q.cap })} · <b class={q.room - q.levels < 0 ? 'neg' : undefined}>{t('{n} left after this order', { n: Math.max(0, q.room - q.levels) })}</b></dd></div>
      </dl>
      <CheckLines cs={cs} r={r} fac={fac} />
    </div>
  );
}

function CheckLines({ cs, r, fac }: { cs: Check[]; r: RegionView; fac: FacilityType }) {
  const lines = cs.map((c) => {
    const text = checkText(c, r, fac);
    return text ? <li class={'is-' + c.tone} data-check={c.kind}><Icon name={c.tone === 'ok' ? 'check' : c.tone === 'info' ? 'info' : c.tone === 'block' ? 'lock' : 'warn'} size={11} /> <span>{text}</span></li> : null;
  });
  return <ul class="quote-checks">{lines}</ul>;
}

function checkText(c: Check, r: RegionView, fac: FacilityType): ComponentChildren {
  switch (c.kind) {
    case 'requirement': return c.text ? t('Requires: {req}', { req: tc(c.text) }) : t('A known requirement is unmet');
    case 'noquote': return t('The referee gives no price for this here.');
    case 'site': return c.cap === 0
      ? t('{region} has no suitable site: {site}', { region: tc(r.name), site: isZh() ? tc(fac.site) : fac.site.toLowerCase() })
      : t('No site left: {built} built and {queued} queued of {cap}.', { built: c.built, queued: c.queued, cap: c.cap });
    case 'levels': return t('At most {n} levels in one order.', { n: c.max });
    case 'goods': return c.tone === 'ok'
      ? t('{good}: {stock} in store covers {need}.', { good: goodName(c.good), stock: qty(c.good, c.stock), need: qty(c.good, c.need) })
      : t('{good}: {stock} in store of {need}; the order waits for the rest.', { good: goodName(c.good), stock: qty(c.good, c.stock), need: qty(c.good, c.need) });
    case 'crew': {
      const free = Math.max(0, c.holders - c.reserved);
      return c.tone === 'ok'
        ? t('Crew: {free} {quals} free here for {need}.', { free: peopleNum(free), quals: crewQuals(c.quals), need: peopleNum(c.need) })
        : t('Crew short: {free} {quals} free here of {need} (≈ {res} on other sites). The site stands still without them; qualified people elsewhere move a quarter of the shortfall a month.', { free: peopleNum(free), quals: crewQuals(c.quals), need: peopleNum(c.need), res: peopleNum(c.reserved) });
    }
    case 'power': {
      if (c.need <= c.spare) return t('Site power: {spare} spare shaft power here covers {need} a month.', { spare: energy(c.spare), need: energy(c.need) });
      return c.tone === 'ok'
        ? t('Site power: {spare} spare here; site engines make the rest, burning up to {coal} of coal a month ({stock} in store), then refined fuel.', { spare: energy(c.spare), coal: tonnes(c.coal), stock: tonnes(c.coalStock) })
        : t('Site power short: {spare} spare here and not enough coal ({stock}) or fuel ({fuel}) for site engines ({rate} of coal per {mwh}). The site works only as far as power is delivered.', { spare: energy(c.spare), stock: tonnes(c.coalStock), fuel: tonnes(c.fuelStock), rate: tonnes(1), mwh: energy(SITE_ENGINE_PER_T.coal) });
    }
    case 'labour': return c.tone === 'ok'
      ? t('Labour: up to {n} workers a month, crew included; {free} people here hold no post.', { n: peopleNum(c.monthly), free: peopleNum(c.free) })
      : t('Labour: up to {n} workers a month, crew included; only {free} people here hold no post, so the order will go slower unless the call-up or labour priorities change.', { n: peopleNum(c.monthly), free: peopleNum(c.free) });
    case 'first': return t('The first of its kind anywhere under us: it is also the prototype.');
  }
  return null;
}

function ExpandBlock({ obs, r, fac, f }: { obs: Observation; r: RegionView; fac: FacilityType; f: FacilityView }) {
  const s = useApp();
  const [levels, setLevels] = useState(1);
  const one = quoteFor(r, fac.kind, 1);
  const room = one ? one.room : 0;
  const lv = Math.max(1, Math.min(levels, Math.max(1, Math.min(20, room))));
  const q = quoteFor(r, fac.kind, lv);
  const block = blocking(checks(obs, r, fac, q));
  const tag = `works-${r.id}`;
  return (
    <section class="wd-expand" data-testid={`expand-${f.kind}`}>
      <div class="wd-sub"><h5>{t('Expand')}</h5><Stepper value={lv} min={1} max={Math.max(1, Math.min(20, room))} label={t('Levels')} testid={`expand-levels-${f.kind}`} onChange={setLevels} /></div>
      <QuoteBlock obs={obs} r={r} fac={fac} q={q} testid={`quote-${f.kind}`} />
      <div class="wd-order">
        <Btn kind="primary" icon="hammer" disabled={s.busy} why={block.length ? String(checkText(block[0], r, fac)) : null} testid={`expand-order-${f.kind}`}
          onClick={() => void act({ kind: 'start_project', spec: { kind: 'build', region: r.id, facility: fac.kind, levels: lv }, priority: null }, tag)}>{tn(lv, 'Order +{n} level', 'Order +{n} levels', { n: lv })}</Btn>
      </div>
    </section>
  );
}

// --- upgrade in place and demolish (ruleset 3.0) ---------------------------------------------

/** Upgrade levels in place into the next stage: the referee's quote of the successor at the edge's share. */
function UpgradeBlock({ obs, r, fac, f }: { obs: Observation; r: RegionView; fac: FacilityType; f: FacilityView }) {
  useLocale();
  const s = useApp();
  const { tree } = useBuildingTree(obs.building_tree_hash);
  const targets = (fac.upgrades_to ?? []).map((k) => obs.catalog.facilities.find((x) => x.kind === k)).filter((x): x is FacilityType => !!x);
  const [pickTo, setPickTo] = useState<string | null>(null);
  const [levels, setLevels] = useState(1);
  if (!targets.length) return null;
  const to = targets.find((x) => x.kind === pickTo) ?? targets[0];
  const edge = tree?.edges.find((e) => e.from === fac.kind && e.to === to.kind && e.kind === 'upgrade');
  const bp = edge?.cost_bp ?? 6000;
  const room = quoteFor(r, to.kind, 1)?.room ?? 0;
  const max = Math.max(1, Math.min(20, f.level, room));
  const lv = Math.max(1, Math.min(levels, max));
  const q = upgradeQuote(r, to.kind, lv, bp);
  const block = blocking(checks(obs, r, to, q));
  const tag = `works-${r.id}`;
  return (
    <section class="wd-expand" data-testid={`upgrade-${f.kind}`}>
      <div class="wd-sub"><h5>{t('Upgrade in place')}</h5><Stepper value={lv} min={1} max={max} label={t('Levels')} testid={`upgrade-levels-${f.kind}`} onChange={setLevels} /></div>
      {targets.length > 1 ? (
        <div class="wd-actions">{targets.map((x) => <Btn small kind="ghost" pressed={x.kind === to.kind} onClick={() => setPickTo(x.kind)}>{tc(x.name)}</Btn>)}</div>
      ) : null}
      <p class="muted small">{t('{pct}% of the {name} bill and work. The converting levels stand idle until they reopen as {name}, at least {m}.', { pct: bp / 100, name: lc(tc(to.name)), m: fmtMonths(q?.months ?? 0) })}</p>
      <QuoteBlock obs={obs} r={r} fac={to} q={q} testid={`upgrade-quote-${f.kind}`} />
      <div class="wd-order">
        <Btn kind="primary" icon="hammer" disabled={s.busy} why={block.length ? String(checkText(block[0], r, to)) : null} testid={`upgrade-order-${f.kind}`}
          onClick={() => void act({ kind: 'start_project', spec: { kind: 'upgrade', region: r.id, from: f.kind, to: to.kind, levels: lv }, priority: null }, tag)}>
          {tn(lv, 'Upgrade {n} level to {name}', 'Upgrade {n} levels to {name}', { n: lv, name: tc(to.name) })}
        </Btn>
      </div>
    </section>
  );
}

/** Demolish levels; a quarter of the materials, metal and components of their bill comes back to the stores. */
function DemolishBlock({ fac, r, f }: { fac: FacilityType; r: RegionView; f: FacilityView }) {
  useLocale();
  const s = useApp();
  const [lv, setLv] = useState(1);
  const [sure, setSure] = useState(false);
  const n = Math.max(1, Math.min(lv, f.level));
  const back = fac.cost.filter((g) => g.good === 'materials' || g.good === 'metal' || g.good === 'components').map((g) => ({ good: g.good, amount: Math.floor(g.amount * n * 25 / 100) })).filter((g) => g.amount > 0);
  return (
    <section class="wd-expand" data-testid={`demolish-${f.kind}`}>
      <div class="wd-sub"><h5>{t('Demolish')}</h5><Stepper value={n} min={1} max={f.level} label={t('Levels')} testid={`demolish-levels-${f.kind}`} onChange={(v) => { setLv(v); setSure(false); }} /></div>
      <p class="muted small" data-testid={`salvage-${f.kind}`}>{t('Salvage: a quarter of the materials, metal and components of the bill is recovered')}: <GoodsList items={back} empty={t('nothing to recover')} /></p>
      <div class="wd-order">
        {sure ? (
          <>
            <Btn kind="danger" icon="trash" disabled={s.busy} testid={`demolish-confirm-${f.kind}`} onClick={() => { setSure(false); void act({ kind: 'demolish', region: r.id, facility: f.kind, levels: n }, `works-${r.id}`); }}>{tn(n, 'Demolish {n} level now', 'Demolish {n} levels now', { n })}</Btn>
            <Btn kind="ghost" onClick={() => setSure(false)}>{t('Keep')}</Btn>
          </>
        ) : <Btn kind="ghost" icon="trash" testid={`demolish-${f.kind}-ask`} onClick={() => setSure(true)}>{t('Demolish…')}</Btn>}
      </div>
    </section>
  );
}

// --- build ----------------------------------------------------------------------------------

function BuildTab({ obs, r, pick, onPick }: { obs: Observation; r: RegionView; pick: string | null; onPick: (k: string | null) => void }) {
  const own = r.own!;
  const [filter, setFilter] = useState<'can' | 'all'>('can');
  const [cat, setCat] = useState('all');
  const [era, setEra] = useState('all');
  const cats = useMemo(() => [...new Set(obs.catalog.facilities.map((f) => f.category))], [obs.catalog.facilities]);
  const eras = useMemo(() => [...new Set(obs.catalog.facilities.map((f) => f.era).filter((e): e is number => e !== undefined))].sort((a, b) => a - b), [obs.catalog.facilities]);
  const rows = obs.catalog.facilities.filter((f) => (cat === 'all' || f.category === cat) && (era === 'all' || String(f.era) === era)).map((f) => {
    const q = quoteFor(r, f.kind, 1);
    const block = blocking(checks(obs, r, f, q));
    return { f, q, block, built: own.facilities.find((x) => x.kind === f.kind) };
  }).filter((x) => filter === 'all' || x.block.length === 0 || x.f.kind === pick);
  const sel = obs.catalog.facilities.find((f) => f.kind === pick) ?? rows[0]?.f ?? null;
  return (
    <div class="works-split">
      <div class="works-list">
        <div class="wb-filters">
          <div class="wd-scope" role="radiogroup" aria-label={t('Show')}>
            <button type="button" role="radio" aria-checked={filter === 'can'} class={cx(filter === 'can' && 'is-active')} data-testid="build-filter-can" onClick={() => setFilter('can')}>{t('Can be ordered here')}</button>
            <button type="button" role="radio" aria-checked={filter === 'all'} class={cx(filter === 'all' && 'is-active')} data-testid="build-filter-all" onClick={() => setFilter('all')}>{t('Everything known')}</button>
          </div>
          <select class="select" aria-label={t('Building category')} value={cat} onChange={(e) => setCat(e.currentTarget.value)}>
            <option value="all">{t('All buildings')}</option>
            {cats.map((c) => <option value={c}>{tc(c)}</option>)}
          </select>
          {eras.length > 1 ? (
            <select class="select" aria-label={t('Era')} value={era} data-testid="build-era" onChange={(e) => setEra(e.currentTarget.value)}>
              <option value="all">{t('All eras')}</option>
              {eras.map((e) => <option value={String(e)}>{ERA_LABEL[e] ? eraText(ERA_LABEL[e]) : String(e)}</option>)}
            </select>
          ) : null}
        </div>
        {rows.length ? (
          <ul class="wb-list">
            {rows.map(({ f, q, block, built }) => (
              <li>
                <button type="button" class={cx('wb-item', sel?.kind === f.kind && 'is-selected', block.length > 0 && 'is-blocked')} data-testid={`build-card-${f.kind}`} onClick={() => onPick(f.kind)}>
                  <span class="wb-name">{block.length ? <Icon name="lock" size={11} /> : null}{tc(f.name)}<LineTag fac={f} /></span>
                  <span class="wb-meta">{built ? t('level {n}/{max}', { n: built.level, max: q?.cap ?? built.max_level }) : q && q.cap > 0 ? t('room for {n}', { n: q.room }) : t('no site here')}{q && q.queued ? ' · ' + t('{n} queued', { n: q.queued }) : ''}</span>
                  <span class="wb-cost">{q ? <>{workMonths(q.work)}{q.crew.length ? ' · ' + t('crew {n}', { n: peopleNum(q.crew.reduce((n, c) => n + c.count, 0)) }) : ''}{q.power ? ' · ' + energy(q.power) : ''} · {fmtMonths(q.months)}</> : null}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <Empty>{t('Nothing more can be ordered here now. Show everything known to see why.')}</Empty>}
      </div>
      {sel ? <BuildDetail obs={obs} r={r} fac={sel} /> : null}
    </div>
  );
}

function BuildDetail({ obs, r, fac }: { obs: Observation; r: RegionView; fac: FacilityType }) {
  const s = useApp();
  const [levels, setLevels] = useState(1);
  const [priority, setPriority] = useState(5);
  const built = r.own!.facilities.find((x) => x.kind === fac.kind);
  const one = quoteFor(r, fac.kind, 1);
  const max = Math.max(1, Math.min(20, one?.room ?? 1));
  const lv = Math.min(levels, max);
  const q = quoteFor(r, fac.kind, lv);
  const block = blocking(checks(obs, r, fac, q));
  const tag = `works-${r.id}`;
  const base = fac.recipes.find((x) => x.available) ?? fac.recipes[0];
  return (
    <div class="works-detail" data-testid={`build-detail-${fac.kind}`}>
      <header class="wd-head">
        <div><small>{tc(fac.category)}</small><h4>{tc(fac.name)}</h4><LineTag fac={fac} long /></div>
        <strong class="wd-level">{built?.level ?? 0}<small> / {one?.cap ?? 0}</small></strong>
      </header>
      <p class="wd-desc">{tc(fac.description)}</p>
      <LineLadder obs={obs} fac={fac} r={r} />
      <dl class="wd-facts">
        <div><dt>{t('Site')}</dt><dd>{tc(fac.site)}</dd></div>
        <div><dt>{t('Posts per level')}</dt><dd>{fac.jobs.length ? fac.jobs.map((j, i) => <span>{i ? ' · ' : ''}<b>{peopleNum(j.count)}</b> {j.qual ? lc(QUAL_LABEL[j.qual]) : t('general labour')}</span>) : <span class="muted">{t('none')}</span>}</dd></div>
        {fac.upkeep.length ? <div><dt>{t('Upkeep per level')}</dt><dd><GoodsList items={fac.upkeep} per={t('a month')} /></dd></div> : null}
        {fac.recipes.length > 1 ? <div><dt>{t('Methods')}</dt><dd>{fac.recipes.map((rc, i) => <span class={rc.available ? undefined : 'muted'}>{i ? ' · ' : ''}{!rc.available ? <Icon name="lock" size={9} /> : null}{tc(rc.name)}</span>)} <small class="muted">{t('choose among them once it is built')}</small></dd></div> : null}
        {base ? <div><dt>{fac.recipes.length > 1 ? t('Base method') : t('Method')}</dt><dd>{tc(base.name)}: <GoodsList items={base.inputs} empty={t('nothing')} /> <Icon name="right" size={9} /> {base.outputs.length ? <GoodsList items={base.outputs} /> : <span class="muted">{tc(base.note) || t('services')}</span>} <small class="muted">{t('per level a month')}</small></dd></div> : null}
        {fac.provides.length ? <div><dt>{t('Provides')}</dt><dd>{tcAll(fac.provides).join(' · ')}</dd></div> : null}
      </dl>
      {fac.requirements.length && !fac.available ? <Checklist items={tcChecks(fac.requirements)} /> : null}
      <section class="wd-expand">
        <div class="wd-sub">
          <h5>{built ? t('Expand') : t('Build')}</h5>
          <span class="wd-steppers">
            <label>{t('Levels')} <Stepper value={lv} min={1} max={max} label={t('Levels')} testid={`build-levels-${fac.kind}`} onChange={setLevels} /></label>
            <label title={t('0–9. Lower numbers receive crews, labour and site power first.')}>{t('Priority')} <Stepper value={priority} min={0} max={9} label={t('Priority')} testid={`build-priority-${fac.kind}`} onChange={setPriority} /></label>
          </span>
        </div>
        <QuoteBlock obs={obs} r={r} fac={fac} q={q} testid={`quote-${fac.kind}`} />
        <div class="wd-order">
          <Btn kind="primary" icon="hammer" disabled={s.busy} why={block.length ? String(checkText(block[0], r, fac)) : null} testid={`order-${fac.kind}`}
            onClick={() => void act({ kind: 'start_project', spec: { kind: 'build', region: r.id, facility: fac.kind, levels: lv }, priority }, tag)}>
            {built ? tn(lv, 'Order +{n} level', 'Order +{n} levels', { n: lv }) : tn(lv, 'Order {n} level', 'Order {n} levels', { n: lv })}
          </Btn>
        </div>
        <ActionNote tag={tag} />
      </section>
    </div>
  );
}

// --- queue ---------------------------------------------------------------------------------

function QueueTab({ obs, r }: { obs: Observation; r: RegionView }) {
  const own = r.own!;
  const rows = queueOf(obs, own);
  if (!rows.length) return <div class="works-queue"><Empty>{t('Nothing is queued in this region. Orders are served by priority (0 first), then by place in the queue.')}</Empty></div>;
  return (
    <div class="works-queue" data-testid="works-queue">
      <p class="wq-lede">{t('Crews, labour and site power are given out in this order: by priority (0 first), then by place. Moving an order swaps it with its neighbours here only; other regions’ orders are not affected.')}</p>
      <ol class="wq-list">
        {rows.map((row, i) => <QueueItem obs={obs} r={r} row={row} index={i} count={rows.length} />)}
      </ol>
      <ActionNote tag={`queue-${r.id}`} />
    </div>
  );
}

function QueueItem({ obs, r, row, index, count }: { obs: Observation; r: RegionView; row: QueueRow; index: number; count: number }) {
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  const { entry: e, project: p } = row;
  const tag = `queue-${r.id}`;
  const op = e.paused ? 'pause' as const : 'resume' as const;
  const move = (position: number) => void act({ kind: 'manage_project', project: e.project, op, priority: null, position }, tag, { quiet: true });
  const fac = e.facility ? obs.catalog.facilities.find((f) => f.kind === e.facility) : undefined;
  const waiting = e.waiting_for.length > 0 && !e.paused;
  return (
    <li class={cx('wq-item', e.paused && 'is-paused', waiting && 'is-waiting')} data-testid={`queue-entry-${e.project}`} data-position={e.position}>
      <span class="wq-pos">{e.position + 1}</span>
      <div class="wq-main">
        <div class="wq-top">
          <b>{fac ? tc(fac.name) : tc(e.title)}{e.levels ? <small> +{e.levels}</small> : null}</b>
          {e.paused ? <Badge tone="muted" icon="pause">{t('Paused')}</Badge> : waiting ? <Badge tone="warn" icon="warn">{t('Waiting')}</Badge> : <Badge tone="ok">{t('Working')}</Badge>}
          <span class="wq-eta">{e.eta_months_low !== null && e.eta_months_high !== null
            ? (e.eta_months_low === e.eta_months_high ? t('≈ {n} months left', { n: e.eta_months_low }) : t('≈ {lo}–{hi} months left', { lo: e.eta_months_low, hi: e.eta_months_high }))
            : <span class="muted">{t('time left unknown')}</span>}</span>
        </div>
        <div class="wq-progress">
          <Meter value={e.progress_bp} max={10000} tone={e.paused ? 'muted' : waiting ? 'warn' : 'accent'} height={7} label={t('{pct}% of the work done', { pct: Math.round(e.progress_bp / 100) })} />
          <small>{p ? t('{done} of {need}', { done: workMonths(p.work_done), need: workMonths(p.work_needed) }) : pct(e.progress_bp)}</small>
        </div>
        <ul class="wq-supply">
          <li title={t('Share of the goods bill committed so far')}><span>{t('Goods')}</span><Meter value={e.goods_bp} max={10000} tone={e.goods_bp >= 10000 ? 'ok' : 'gold'} height={4} /><small>{pct(e.goods_bp)}</small></li>
          {e.crew.map((c) => (
            <li title={t('Site crew reserved last month')}><span>{t('Crew')}</span><Meter value={c.on_site} max={Math.max(1, c.needed)} tone={c.on_site >= c.needed ? 'ok' : 'bad'} height={4} /><small>{t('{n} of {need} {quals}', { n: peopleNum(c.on_site), need: peopleNum(c.needed), quals: crewQuals(c.quals) })}</small></li>
          ))}
          {p?.site_power ? <li title={t('Share of the site power asked for last month that was delivered')}><span>{t('Power')}</span><Meter value={e.power_bp} max={10000} tone={e.power_bp >= 10000 ? 'ok' : 'bad'} height={4} /><small>{t('{pct} of {n} a month', { pct: pct(e.power_bp), n: energy(p.site_power) })}</small></li> : null}
        </ul>
        {waiting ? <ul class="wq-waiting" data-testid={`queue-waiting-${e.project}`}>{e.waiting_for.map((w) => <li><Icon name="warn" size={11} /> {tc(w)}</li>)}</ul> : null}
        {p && p.kind === 'build' ? (
          <p class="wq-charged" data-testid={`queue-charged-${e.project}`} title={t('What this order was charged when it was placed: the quote times the levels')}>
            <small>{t('Charged')}:</small> <GoodsList items={p.inputs_needed} empty={t('labour only')} /> · {workMonths(p.work_needed)}
            {(p.crew ?? []).length ? <> · {(p.crew ?? []).map((c) => `${peopleNum(c.needed)} ${crewQuals(c.quals)}`).join(' · ')}</> : null}
            {p.site_power ? <> · {energy(p.site_power)} {t('a month')}</> : null}
            {p.min_months ? <> · {t('at least {m}', { m: fmtMonths(p.min_months) })}</> : null}
          </p>
        ) : null}
      </div>
      <div class="wq-controls">
        <span class="wq-move">
          <Btn small kind="ghost" icon="up" title={t('Serve earlier')} disabled={s.busy || index === 0} testid={`queue-up-${e.project}`} onClick={() => move(index - 1)} />
          <Btn small kind="ghost" icon="down" title={t('Serve later')} disabled={s.busy || index === count - 1} testid={`queue-down-${e.project}`} onClick={() => move(index + 1)} />
        </span>
        <label class="wq-prio" title={t('Lower numbers are supplied with crews, labour and stores first')}>{t('Priority')} <Stepper value={e.priority} min={0} max={9} label={t('Priority')} disabled={s.busy} testid={`queue-prio-${e.project}`}
          onChange={(v) => void act({ kind: 'manage_project', project: e.project, op, priority: v }, tag, { quiet: true })} /></label>
        <Btn small kind="ghost" icon={e.paused ? 'play' : 'pause'} disabled={s.busy} testid={`queue-pause-${e.project}`} title={e.paused ? undefined : t('A paused order releases its crew at once')}
          onClick={() => void act({ kind: 'manage_project', project: e.project, op: e.paused ? 'resume' : 'pause', priority: null }, tag, { quiet: true })}>{e.paused ? t('Resume') : t('Pause')}</Btn>
        {confirm ? (
          <span class="wq-confirm">
            <Btn small kind="danger" disabled={s.busy} testid={`queue-cancel-confirm-${e.project}`} onClick={() => { setConfirm(false); void act({ kind: 'manage_project', project: e.project, op: 'cancel', priority: null }, tag); }}>{t('Cancel it')}</Btn>
            <Btn small kind="ghost" nav onClick={() => setConfirm(false)}>{t('Keep')}</Btn>
          </span>
        ) : <Btn small kind="ghost" icon="close" title={t('Inputs already consumed are not refunded')} disabled={s.busy || isReadOnly()} testid={`queue-cancel-${e.project}`} onClick={() => setConfirm(true)}>{t('Cancel…')}</Btn>}
      </div>
    </li>
  );
}

/** A compact entry point for panels: the region's queue and a button into the view. */
export function WorksLauncher({ obs, region }: { obs: Observation; region?: RegionId | null }) {
  useLocale();
  const regions = ownRegions(obs);
  const queued = regions.reduce((n, r) => n + (r.own!.construction_queue?.length ?? 0), 0);
  const waiting = regions.reduce((n, r) => n + (r.own!.construction_queue ?? []).filter((e) => e.waiting_for.length && !e.paused).length, 0);
  return (
    <div class="works-launch" data-testid="works-launch">
      <Icon name="hammer" size={20} />
      <div>
        <b>{t('Regional works')}</b>
        <p>{t('{r} regions · {n} orders queued', { r: regions.length, n: queued })}{waiting ? <span class="warn-text"> · {t('{n} waiting', { n: waiting })}</span> : null}</p>
      </div>
      <Btn small kind="primary" nav icon="right" testid="open-works" onClick={() => openWorks(region ?? null)}>{t('Open')}</Btn>
    </div>
  );
}

/** Open the regional works view on a region (the overlay's argument is the region id), optionally on a tab. */
export function openWorks(region: RegionId | null, tab?: Tab): void {
  pendingTab = tab ?? null;
  openOverlay('works', region === null ? null : String(region));
}

// --- building lines (ruleset 3.0) -------------------------------------------------------------

/** "Textiles · stage 2 · Industrial": the building line, stage and era a facility type belongs to. */
function LineTag({ fac, long }: { fac: FacilityType; long?: boolean }) {
  const era = eraLabel(fac.era);
  if (!fac.line && !era) return null;
  return (
    <span class="r3-line wt-line" data-testid={long ? `line-${fac.kind}` : undefined}>
      {long && fac.line ? <span>{t('{line} line, stage {n}', { line: t(lineLabel(fac.line)), n: fac.stage ?? 1 })}</span> : null}
      {era ? <span class="r3-era" title={t('Era of this building')}>{eraText(era)}</span> : null}
    </span>
  );
}

/** The other buildings of the same line that the seat knows, in stage order. */
function LineLadder({ obs, fac, r }: { obs: Observation; fac: FacilityType; r: RegionView }) {
  if (!fac.line) return null;
  const same = obs.catalog.facilities.filter((x) => x.line === fac.line);
  const stages = [...new Set(same.map((x) => x.stage ?? 1))];
  if (same.length < 2 || stages.length < 2) return null;
  const sorted = [...same].sort((a, b) => (a.stage ?? 1) - (b.stage ?? 1) || (a.era ?? 0) - (b.era ?? 0));
  return (
    <div class="r3-ladder-wrap">
      <small class="muted">{t('Buildings of this line we know, oldest first:')}</small>
      <ol class="r3-ladder" data-testid={`ladder-${fac.kind}`}>
        {sorted.map((x, i) => {
          const built = r.own?.facilities.find((f) => f.kind === x.kind);
          return (
            <li class={cx(x.kind === fac.kind && 'is-here')}>
              {i ? <Icon name="right" size={9} /> : null}
              <span title={eraLabel(x.era) ? eraText(eraLabel(x.era)!) : undefined}>{tc(x.name)}{built ? ` (${built.level})` : ''}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
