// Standing orders (ruleset 3.0, design chapter 36 section 2.6): instructions the referee
// carries out on its own on 1 January of every year inside a round and in the first month of
// every round, in the order listed, each through exactly the checks of the order it stands
// for. Build targets per region, a research agenda, automatic research, a reform agenda and
// settlement targets. This overlay lists them with what each did last, and adds, reorders and
// removes them; in observer modes it is read-only.
import { useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Action, Directive, DirectiveView, Observation, RegionId, RegionView } from '../protocol';
import { TERRAIN_LABEL, fmtYear, int, pct, people, roundLength, roundSpan } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { act, closeOverlay, isReadOnly, openOverlay, useApp } from '../store';
import { Btn, NumInput, Select, Stepper, cx } from '../ui';
import { OverlayFrame } from '../theme/overlay';
import './orders.css';

type Filter = 'all' | 'build' | 'research' | 'reform' | 'settle';
type AddKind = 'build' | 'research' | 'reform' | 'settle' | 'auto';

const KIND_FILTER: Record<Directive['kind'], Filter> = {
  build_target: 'build', research_agenda: 'research', auto_research: 'research', reform_agenda: 'reform', settle_target: 'settle',
};
const KIND_ICON: Record<Directive['kind'], string> = {
  build_target: 'hammer', research_agenda: 'flask', auto_research: 'spark', reform_agenda: 'civics', settle_target: 'tent',
};
// i18n-table
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All', build: 'Build targets', research: 'Research', reform: 'Reforms', settle: 'Settling',
};
const ADD_LABEL: Record<AddKind, string> = {
  build: 'Build target', research: 'Research agenda', reform: 'Reform agenda', settle: 'Settlement target', auto: 'Automatic research',
};
const STATUS_LABEL: Record<string, string> = {
  acted: 'Acted', idle: 'Nothing to do', skipped: 'Refused', '': 'Not yet run',
};
// i18n-end

/** Parse the overlay argument: 'build', 'build:12', 'research', 'reform', 'settle', 'settle:12'. */
function parseArg(arg: string | null): { filter: Filter; region: RegionId | null } {
  if (!arg) return { filter: 'all', region: null };
  const [k, r] = arg.split(':');
  const filter: Filter = k === 'build' || k === 'research' || k === 'reform' || k === 'settle' ? k : 'all';
  const n = r !== undefined ? Number(r) : NaN;
  return { filter, region: Number.isFinite(n) ? n : null };
}

/** Open the standing orders on a section (from the works view, the knowledge and culture panels…). */
export function openStandingOrders(section?: Filter, region?: RegionId): void {
  openOverlay('orders', section && section !== 'all' ? (region !== undefined ? `${section}:${region}` : section) : null);
}

function regionName(obs: Observation, id: RegionId): string {
  return obs.regions.find((r) => r.id === id)?.name ?? t('Region {n}', { n: id });
}
function facilityName(obs: Observation, kind: string): string {
  const f = obs.catalog.facilities.find((x) => x.kind === kind);
  return f ? tc(f.name) : kind;
}
function techName(obs: Observation, handle: string): string | null {
  const c = obs.knowledge.techs.find((x) => x.handle === handle);
  if (c) return tc(c.name);
  const l = obs.knowledge.leads.find((x) => x.handle === handle);
  return l ? tc(l.title) : null;
}
function practiceName(obs: Observation, handle: string): string | null {
  const p = obs.culture.practices.find((x) => x.handle === handle);
  return p ? tc(p.name) : null;
}

/** One line that says what a standing order does. */
export function describeDirective(obs: Observation, d: Directive): string {
  switch (d.kind) {
    case 'build_target':
      return d.priority !== null && d.priority !== undefined
        ? t('Keep {n} levels of {facility} at {region} (priority {p})', { n: int(d.levels), facility: facilityName(obs, d.facility), region: regionName(obs, d.region), p: d.priority })
        : t('Keep {n} levels of {facility} at {region}', { n: int(d.levels), facility: facilityName(obs, d.facility), region: regionName(obs, d.region) });
    case 'research_agenda':
      return t('Research agenda: {n} items in order', { n: d.techs.length });
    case 'auto_research':
      return d.on ? t('Automatic research: on') : t('Automatic research: off');
    case 'reform_agenda':
      return t('Reform agenda: {n} practices in order', { n: d.practices.length });
    case 'settle_target':
      return t('Settle {to} from {from} with {people} when {from} passes {share} of its water', {
        to: regionName(obs, d.to), from: regionName(obs, d.from), people: people(d.people), share: pct(d.when_crowd_bp),
      });
  }
}

/** Orders from this overlay are quiet: the list itself shows what changed, and refusals still toast. */
function send(directive: Action, tag: string): Promise<unknown> {
  return act(directive, tag, { quiet: true });
}

export function StandingOrders({ obs, arg }: { obs: Observation; arg: string | null }) {
  useLocale();
  const s = useApp();
  const init = parseArg(arg);
  const [filter, setFilter] = useState<Filter>(init.filter);
  const [regionFilter, setRegionFilter] = useState<RegionId | null>(init.region);
  const [adding, setAdding] = useState<AddKind>(init.filter === 'all' ? 'build' : init.filter);
  const readOnly = isReadOnly() || obs.status !== 'active' || obs.phase === 'finished';
  const list = obs.directives ?? [];
  const shown = list
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => (filter === 'all' || KIND_FILTER[d.directive.kind] === filter)
      && (regionFilter === null || (d.directive.kind === 'build_target' && d.directive.region === regionFilter)
        || (d.directive.kind === 'settle_target' && (d.directive.from === regionFilter || d.directive.to === regionFilter))));
  const count = (f: Filter) => (f === 'all' ? list.length : list.filter((d) => KIND_FILTER[d.directive.kind] === f).length);
  const months = obs.calendar?.round_months ?? obs.months_per_round;
  const years = Math.max(1, Math.round(months / 12));

  return (
    <OverlayFrame icon="scroll" title={t('Standing orders')} kicker={`${tc(obs.civ.name)} · ${fmtYear(obs.month, obs.date)}`} testid="overlay-orders"
      tools={readOnly && isReadOnly() ? <span class="so-ro" data-testid="orders-readonly"><Icon name="lock" size={12} /> {t('Read-only: you are observing')}</span> : null}>
      <div class="so">
        <div class="so-main">
          <p class="so-lede" data-testid="orders-explain">
            <Icon name="clock" size={14} />{' '}
            {months > 12
              ? t('This round covers {span} ({length}). The referee runs these orders on 1 January of every year inside it, top to bottom — up to {n} times before you plan again. Each goes through the same checks as the order it stands for; one that is refused is skipped that year and says why.', { span: roundSpan(obs.calendar) ?? '', length: roundLength(months), n: years })
              : t('The referee runs these orders at the start of every round, top to bottom. Each goes through the same checks as the order it stands for; one that is refused is skipped and says why.')}
          </p>
          <div class="so-filters" role="tablist" aria-label={t('Kind of order')}>
            {(['all', 'build', 'research', 'reform', 'settle'] as Filter[]).map((f) => (
              <button type="button" role="tab" aria-selected={filter === f} class={cx('chip', filter === f && 'is-active')} data-testid={`orders-filter-${f}`}
                onClick={() => { setFilter(f); if (f !== 'build' && f !== 'settle') setRegionFilter(null); }}>
                {t(FILTER_LABEL[f])} <small>{count(f)}</small>
              </button>
            ))}
            {regionFilter !== null ? (
              <button type="button" class="chip is-active" data-testid="orders-region-filter" title={t('Show every region')} onClick={() => setRegionFilter(null)}>
                {regionName(obs, regionFilter)} <Icon name="close" size={10} />
              </button>
            ) : null}
          </div>
          {shown.length ? (
            <ol class="so-list" data-testid="orders-list">
              {shown.map(({ d, i }) => (
                <OrderRow obs={obs} view={d} index={i} total={list.length} readOnly={readOnly} busy={s.busy}
                  onEdit={() => setAdding(d.directive.kind === 'research_agenda' ? 'research' : d.directive.kind === 'reform_agenda' ? 'reform' : d.directive.kind === 'auto_research' ? 'auto' : d.directive.kind === 'settle_target' ? 'settle' : 'build')} />
              ))}
            </ol>
          ) : (
            <div class="so-empty" data-testid="orders-empty">
              <Icon name="scroll" size={22} />
              <p>{list.length ? t('No standing order of this kind.') : t('No standing orders yet. Without them, nothing is built, researched or reformed inside a long round except what you order each round.')}</p>
            </div>
          )}
        </div>
        <aside class="so-side">
          <h3>{t('Add a standing order')}</h3>
          <div class="so-kinds" role="radiogroup" aria-label={t('Kind of order')}>
            {(['build', 'research', 'reform', 'settle', 'auto'] as AddKind[]).map((k) => (
              <button type="button" role="radio" aria-checked={adding === k} class={cx('so-kind', adding === k && 'is-active')} data-testid={`orders-add-${k}`} onClick={() => setAdding(k)}>
                <Icon name={k === 'build' ? 'hammer' : k === 'research' ? 'flask' : k === 'reform' ? 'civics' : k === 'settle' ? 'tent' : 'spark'} size={14} />{t(ADD_LABEL[k])}
              </button>
            ))}
          </div>
          {readOnly ? <p class="so-note"><Icon name="lock" size={12} /> {isReadOnly() ? t('Orders cannot be given for a seat you are only watching.') : t('This civilization can no longer give orders.')}</p> : null}
          <fieldset class="so-form" disabled={readOnly || s.busy}>
            {adding === 'build' ? <BuildForm obs={obs} region={regionFilter} /> : null}
            {adding === 'research' ? <ResearchForm obs={obs} /> : null}
            {adding === 'reform' ? <ReformForm obs={obs} /> : null}
            {adding === 'settle' ? <SettleForm obs={obs} region={regionFilter} /> : null}
            {adding === 'auto' ? <AutoForm obs={obs} /> : null}
          </fieldset>
          <div class="so-links">
            <button type="button" class="linklike" onClick={() => openOverlay('works', regionFilter !== null ? String(regionFilter) : null)}><Icon name="hammer" size={12} /> {t('Regional works')}</button>
            <button type="button" class="linklike" onClick={() => { closeOverlay(); }}><Icon name="left" size={12} /> {t('Back to the map')}</button>
          </div>
        </aside>
      </div>
    </OverlayFrame>
  );
}

function OrderRow({ obs, view, index, total, readOnly, busy, onEdit }: {
  obs: Observation; view: DirectiveView; index: number; total: number; readOnly: boolean; busy: boolean; onEdit: () => void;
}) {
  const d = view.directive;
  const status = view.last_status ?? (view.last_result ? 'acted' : '');
  const move = (position: number) => void send({ kind: 'directive', op: 'move', id: view.id, position }, 'orders');
  const items = d.kind === 'research_agenda' ? d.techs.map((h) => techName(obs, h)) : d.kind === 'reform_agenda' ? d.practices.map((h) => practiceName(obs, h)) : null;
  return (
    <li class={cx('so-row', 'is-' + (status || 'new'))} data-testid={`order-${view.id}`} data-kind={d.kind} data-status={status}>
      <span class="so-pos" title={t('Run {n} of {total}', { n: index + 1, total })}>{index + 1}</span>
      <span class="so-icon"><Icon name={KIND_ICON[d.kind]} size={15} /></span>
      <div class="so-body">
        <div class="so-title">
          <b>{describeDirective(obs, d)}</b>
          <span class={cx('so-status', 'is-' + (status || 'new'))}>{t(STATUS_LABEL[status] ?? status)}</span>
        </div>
        {items ? (
          <ol class="so-items">
            {items.slice(0, 8).map((n) => <li class={n ? undefined : 'is-gone'}>{n ?? t('(no longer open)')}</li>)}
            {items.length > 8 ? <li class="is-more">{t('and {n} more', { n: items.length - 8 })}</li> : null}
          </ol>
        ) : null}
        {view.last_result ? (
          <p class="so-result"><Icon name={status === 'skipped' ? 'warn' : status === 'acted' ? 'check' : 'info'} size={11} /> {tc(view.last_result)}
            {view.last_month ? <small class="muted"> · {fmtYear(view.last_month)}</small> : null}</p>
        ) : <p class="so-result muted">{t('Runs for the first time when this round is resolved.')}</p>}
      </div>
      <div class="so-tools">
        <button type="button" class="so-tool" disabled={readOnly || busy || index === 0} aria-label={t('Run earlier')} title={t('Run earlier')} data-testid={`order-${view.id}-up`} onClick={() => move(index - 1)}><Icon name="up" size={13} /></button>
        <button type="button" class="so-tool" disabled={readOnly || busy || index >= total - 1} aria-label={t('Run later')} title={t('Run later')} data-testid={`order-${view.id}-down`} onClick={() => move(index + 1)}><Icon name="down" size={13} /></button>
        {d.kind !== 'build_target' ? <button type="button" class="so-tool" disabled={readOnly || busy} aria-label={t('Edit')} title={t('Edit')} onClick={onEdit}><Icon name="hammer" size={12} /></button> : null}
        <button type="button" class="so-tool is-bad" disabled={readOnly || busy} aria-label={t('Remove')} title={t('Remove')} data-testid={`order-${view.id}-remove`}
          onClick={() => void send({ kind: 'directive', op: 'remove', id: view.id }, 'orders')}><Icon name="trash" size={13} /></button>
      </div>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return <label class="so-field"><span>{label}</span><span class="so-control">{children}</span></label>;
}

function ownRegions(obs: Observation): RegionView[] {
  return obs.regions.filter((r) => r.own).sort((a, b) => a.name.localeCompare(b.name));
}

function BuildForm({ obs, region }: { obs: Observation; region: RegionId | null }) {
  const regions = ownRegions(obs);
  const [rid, setRid] = useState<RegionId | undefined>(region ?? obs.civ.capital ?? regions[0]?.id);
  const r = regions.find((x) => x.id === rid) ?? regions[0];
  const facilities = useMemo(() => obs.catalog.facilities.filter((f) => f.available).sort((a, b) => tc(a.name).localeCompare(tc(b.name))), [obs.catalog.facilities]);
  const [kind, setKind] = useState<string>(facilities[0]?.kind ?? '');
  const fac = facilities.find((f) => f.kind === kind) ?? facilities[0];
  const have = r?.own?.facilities.find((f) => f.kind === fac?.kind)?.level ?? 0;
  const max = fac?.max_level && fac.max_level > 0 ? fac.max_level : 250;
  const [levels, setLevels] = useState(Math.min(max, have + 2));
  const [priority, setPriority] = useState(5);
  const existing = (obs.directives ?? []).find((d) => d.directive.kind === 'build_target' && d.directive.region === r?.id && d.directive.facility === fac?.kind);
  if (!r || !fac) return <p class="so-note">{!r ? t('We govern no region yet.') : t('No works can be built yet.')}</p>;
  return (
    <>
      <p class="so-help">{t('Keeps a number of levels (built plus under construction) of one kind of works in a region. Whenever fewer stand and no order for it is open there, the referee orders the shortfall, at most four levels at a time, at the quoted price.')}</p>
      <Row label={t('Region')}><Select value={r.id} options={regions.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => setRid(v)} label={t('Region')} testid="orders-build-region" /></Row>
      <Row label={t('Works')}><Select value={fac.kind} options={facilities.map((f) => ({ value: f.kind, label: tc(f.name), group: tc(f.category) }))} onChange={(v) => setKind(v)} label={t('Works')} testid="orders-build-facility" /></Row>
      <Row label={t('Levels to keep')}><NumInput value={levels} min={1} max={max} onChange={setLevels} label={t('Levels to keep')} testid="orders-build-levels" /> <small class="muted">{t('{n} standing now', { n: have })}</small></Row>
      <Row label={t('Priority')}><Stepper value={priority} min={0} max={9} label={t('Priority')} onChange={setPriority} testid="orders-build-priority" /> <small class="muted">{t('(0 first)')}</small></Row>
      {existing ? <p class="so-note"><Icon name="info" size={12} /> {t('This replaces the standing order for {facility} at {region}.', { facility: tc(fac.name), region: r.name })}</p> : null}
      <Btn kind="primary" icon="plus" testid="orders-build-add" disabled={levels < 1}
        onClick={() => void send({ kind: 'directive', op: 'add', directive: { kind: 'build_target', region: r.id, facility: fac.kind, levels, priority } }, 'orders')}>
        {existing ? t('Replace the order') : t('Add the order')}
      </Btn>
    </>
  );
}

/** An ordered list editor shared by the research and reform agendas. */
function AgendaEditor({ items, options, nameOf, onSave, onClear, empty, testid }: {
  items: string[]; options: { value: string; label: string; group?: string }[]; nameOf: (h: string) => string | null;
  onSave: (list: string[]) => void; onClear: (() => void) | null; empty: string; testid: string;
}) {
  const [list, setList] = useState<string[]>(items);
  const free = options.filter((o) => !list.includes(o.value));
  const [pick, setPick] = useState<string>(free[0]?.value ?? '');
  const pickNow = free.some((o) => o.value === pick) ? pick : free[0]?.value ?? '';
  const swap = (i: number, j: number) => { const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; setList(n); };
  const changed = list.join('|') !== items.join('|');
  return (
    <>
      {list.length ? (
        <ol class="so-agenda" data-testid={`${testid}-list`}>
          {list.map((h, i) => (
            <li>
              <span class="so-agenda-n">{i + 1}</span>
              <span class={cx('so-agenda-name', !nameOf(h) && 'is-gone')}>{nameOf(h) ?? t('(no longer open)')}</span>
              <button type="button" class="so-tool" disabled={i === 0} aria-label={t('Earlier')} onClick={() => swap(i, i - 1)}><Icon name="up" size={11} /></button>
              <button type="button" class="so-tool" disabled={i === list.length - 1} aria-label={t('Later')} onClick={() => swap(i, i + 1)}><Icon name="down" size={11} /></button>
              <button type="button" class="so-tool is-bad" aria-label={t('Remove')} onClick={() => setList(list.filter((_, j) => j !== i))}><Icon name="close" size={11} /></button>
            </li>
          ))}
        </ol>
      ) : <p class="so-note">{empty}</p>}
      {free.length ? (
        <div class="so-pick">
          <Select value={pickNow} options={free} onChange={(v) => setPick(v)} label={t('Add to the list')} testid={`${testid}-pick`} />
          <Btn small icon="plus" testid={`${testid}-push`} onClick={() => { if (pickNow) setList([...list, pickNow]); }}>{t('Add')}</Btn>
        </div>
      ) : null}
      <div class="so-actions">
        <Btn kind="primary" icon="check" testid={`${testid}-save`} disabled={!list.length || !changed} onClick={() => onSave(list)}>{items.length ? t('Save the agenda') : t('Set the agenda')}</Btn>
        {onClear ? <Btn kind="ghost" icon="trash" testid={`${testid}-clear`} onClick={onClear}>{t('Clear')}</Btn> : null}
      </div>
    </>
  );
}

function ResearchForm({ obs }: { obs: Observation }) {
  const cur = (obs.directives ?? []).find((d) => d.directive.kind === 'research_agenda');
  const items = cur && cur.directive.kind === 'research_agenda' ? cur.directive.techs : [];
  const options = [
    ...obs.knowledge.techs.filter((c) => c.state === 'discovered' || c.state === 'investigating').map((c) => ({ value: c.handle, label: tc(c.name), group: t('Methods to investigate') })),
    ...obs.knowledge.leads.map((l) => ({ value: l.handle, label: tc(l.title), group: t('Leads to follow up') })),
  ];
  return (
    <>
      <p class="so-help">{t('When research capacity is idle, the referee starts the first item on the list that can be started: a discovered method is investigated, a lead is followed up by a small study.')}</p>
      <AgendaEditor key={items.join('|')} items={items} options={options} nameOf={(h) => techName(obs, h)} testid="orders-research"
        empty={t('No agenda yet: add methods or leads in the order you want them.')}
        onSave={(techs) => void send({ kind: 'directive', op: 'add', directive: { kind: 'research_agenda', techs } }, 'orders')}
        onClear={cur ? () => void send({ kind: 'directive', op: 'remove', id: cur.id }, 'orders') : null} />
      <p class="so-help muted">{t('With automatic research on as well, capacity still idle after the agenda goes to the cheapest method with the most evidence.')}</p>
    </>
  );
}

function ReformForm({ obs }: { obs: Observation }) {
  const cur = (obs.directives ?? []).find((d) => d.directive.kind === 'reform_agenda');
  const items = cur && cur.directive.kind === 'reform_agenda' ? cur.directive.practices : [];
  const options = obs.culture.practices.filter((p) => p.state === 'recognized').map((p) => ({ value: p.handle, label: tc(p.name) + (p.can_reform ? '' : ` (${t('not yet possible')})`) }));
  return (
    <>
      <p class="so-help">{t('While fewer than two reforms are under way, the referee proposes the first practice on the list whose reform can begin.')}</p>
      <AgendaEditor key={items.join('|')} items={items} options={options} nameOf={(h) => practiceName(obs, h)} testid="orders-reform"
        empty={t('No agenda yet: add recognized practices in the order you want them enacted.')}
        onSave={(practices) => void send({ kind: 'directive', op: 'add', directive: { kind: 'reform_agenda', practices } }, 'orders')}
        onClear={cur ? () => void send({ kind: 'directive', op: 'remove', id: cur.id }, 'orders') : null} />
    </>
  );
}

function AutoForm({ obs }: { obs: Observation }) {
  const cur = (obs.directives ?? []).find((d) => d.directive.kind === 'auto_research');
  const on = !!cur && cur.directive.kind === 'auto_research' && cur.directive.on;
  return (
    <>
      <p class="so-help">{t('When research capacity is still idle after the agenda, start the discovered method with the lowest tier and the most evidence, then follow up leads alike. Unused capacity is otherwise lost.')}</p>
      <p class="so-state" data-testid="orders-auto-state"><Icon name={on ? 'check' : 'pause'} size={13} /> {on ? t('Automatic research is on.') : t('Automatic research is off.')}</p>
      <Btn kind={on ? 'default' : 'primary'} icon={on ? 'pause' : 'play'} testid="orders-auto-toggle"
        onClick={() => void send({ kind: 'directive', op: 'add', directive: { kind: 'auto_research', on: !on } }, 'orders')}>
        {on ? t('Turn it off') : t('Turn it on')}
      </Btn>
    </>
  );
}

function SettleForm({ obs, region }: { obs: Observation; region: RegionId | null }) {
  const regions = ownRegions(obs);
  const byId = new Map(obs.regions.map((r) => [r.id, r]));
  const targetsOf = (from: RegionView) => from.neighbors
    .map((n) => ({ link: n.kind, r: byId.get(n.region) }))
    .filter((x): x is { link: string; r: RegionView } => !!x.r && x.r.owner === null && !x.r.own);
  const guess = (region !== null && regions.some((r) => r.id === region) ? region : undefined) ?? regions.find((r) => targetsOf(r).length)?.id ?? regions[0]?.id;
  const [from, setFrom] = useState<RegionId | undefined>(guess);
  const [to, setTo] = useState<RegionId | undefined>(undefined);
  const lim = obs.units?.limits;
  const minP = lim?.settlers_min ?? 20000;
  const maxP = lim?.settlers_max ?? 400000;
  const [count, setCount] = useState(Math.max(minP, Math.min(maxP, 40000)));
  const [crowd, setCrowd] = useState(85);
  const fr = regions.find((r) => r.id === from);
  if (!fr) return <p class="so-note">{t('We govern no region to send settlers from.')}</p>;
  const targets = targetsOf(fr);
  const toId = to !== undefined && targets.some((x) => x.r.id === to) ? to : targets[0]?.r.id;
  return (
    <>
      <p class="so-help">{t('Orders the settlement of unclaimed land once the sending region is crowded: when its residents pass a share of its water capacity and our records still show the land unclaimed.')}</p>
      <Row label={t('Sending region')}><Select value={fr.id} options={regions.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => { setFrom(v); setTo(undefined); }} label={t('Sending region')} testid="orders-settle-from" /></Row>
      {toId !== undefined ? (
        <Row label={t('Destination')}><Select value={toId} options={targets.map((x) => ({ value: x.r.id, label: `${x.r.name} — ${t(TERRAIN_LABEL[x.r.terrain])}${x.link === 'sea' ? t(', across water') : ''}` }))} onChange={(v) => setTo(v)} label={t('Destination')} testid="orders-settle-to" /></Row>
      ) : <p class="so-note">{t('No unclaimed land we have seen borders {region}', { region: fr.name })}</p>}
      <Row label={t('Settlers')}><NumInput value={count} min={minP} max={maxP} step={1000} onChange={setCount} label={t('Settlers')} width={100} testid="orders-settle-people" /></Row>
      <Row label={t('When crowded past')}><Stepper value={crowd} min={50} max={100} step={5} unit="%" label={t('When crowded past')} onChange={setCrowd} testid="orders-settle-crowd" /> <small class="muted">{t('of its water capacity')}</small></Row>
      <Btn kind="primary" icon="plus" testid="orders-settle-add" disabled={toId === undefined || count < minP || count > maxP}
        onClick={() => { if (toId !== undefined) void send({ kind: 'directive', op: 'add', directive: { kind: 'settle_target', from: fr.id, to: toId, people: count, when_crowd_bp: crowd * 100 } }, 'orders'); }}>
        {t('Add the order')}
      </Btn>
    </>
  );
}

/** A compact summary for panels: how many standing orders of a kind, what the last one did, and a link. */
export function OrdersLink({ obs, section, region, testid }: { obs: Observation; section: Filter; region?: RegionId; testid?: string }) {
  useLocale();
  const list = (obs.directives ?? []).filter((d) => (section === 'all' || KIND_FILTER[d.directive.kind] === section)
    && (region === undefined || (d.directive.kind === 'build_target' && d.directive.region === region)));
  const refused = list.filter((d) => d.last_status === 'skipped').length;
  const months = obs.calendar?.round_months ?? obs.months_per_round;
  return (
    <button type="button" class="so-link" data-testid={testid ?? `orders-link-${section}`} onClick={() => openStandingOrders(section, region)}
      title={months > 12 ? t('Standing orders act year by year inside a round of {length}.', { length: roundLength(months) }) : t('Standing orders')}>
      <Icon name="scroll" size={13} />
      <span>{list.length ? t('{n} standing orders', { n: list.length }) : t('Standing orders')}</span>
      {refused ? <span class="so-link-bad">{t('{n} refused', { n: refused })}</span> : null}
      <Icon name="right" size={11} />
    </button>
  );
}
