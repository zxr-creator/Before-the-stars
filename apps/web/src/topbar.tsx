// Top bar: whose seat this is, the year, and a ribbon of the stocks and
// capacities that matter every round. Each chip carries a tooltip that says
// what the number is, what moved it last round, and what is at risk.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Good, GoodLine, Observation } from './protocol';
import { GOOD_LABEL, GOOD_SHORT, RESEARCH_LABEL, compact, goodTonnes, goodUnit, int, pct, people, peopleNum, qty, qtySigned, researchMonths, tonnes, fmtNow, histYear, roundLength, roundSpan, totalRounds } from './format';
import { Icon } from './icons';
import { SeatDot, Tick, cx } from './ui';
import { humanSeatList, openOverlay, openPanel, seatName, setMenu, switchSeat, useApp } from './store';
import type { PanelKey } from './store';
import { getLocale, t, tc } from './i18n';
import { Emblem } from './theme/emblem';
import { GoodIcon } from './theme/goods';
import { PerspectiveSwitch } from './observer/controls';
import { BoostYield } from './space/BoostYield';
import { EraBanner } from './era';

const BASIC: Good[] = ['food', 'materials', 'tools'];
const ADVANCED: Good[] = ['metal', 'components', 'electronics', 'fuel'];

// i18n-table
const GOOD_BLURB: Partial<Record<Good, string>> = {
  food: 'Everyone eats before anything else happens. What is left above the reserve feeds projects, programmes and trade.',
  materials: 'Timber, stone and clay. Almost every building and repair draws on this store.',
  tools: 'Worn down by work everywhere. Without tools, facilities and projects slow.',
  metal: 'Structural metal for machines, rail, hulls and heavy building.',
  components: 'Machined parts that industry, vehicles and equipment are assembled from.',
  electronics: 'Devices for control, communication and computing.',
  fuel: 'Refined fuel for engines, transport and launches.',
};
// i18n-end

function netOf(g: GoodLine): number {
  return g.produced - g.consumed - (g.lost ?? 0) + g.traded_in - g.traded_out;
}

interface YieldProps {
  id: string;
  icon: ComponentChildren;
  label: string;
  value: ComponentChildren;
  sub?: ComponentChildren;
  tone?: 'ok' | 'warn' | 'bad';
  panel?: PanelKey;
  onClick?: () => void;
  right?: boolean;
  testid?: string;
  children: ComponentChildren;
}

function Yield({ id, icon, label, value, sub, tone, panel, onClick, right, testid, children }: YieldProps) {
  return (
    <div class={cx('yield', 'yield-' + id, tone && 'is-' + tone, right && 'tip-right')}>
      <button type="button" class="yield-btn" aria-label={label} aria-describedby={`tip-${id}`} data-testid={testid ?? `yield-${id}`}
        onClick={onClick ?? (() => panel && openPanel(panel))}>
        <span class="yield-icon">{icon}</span>
        <span class="yield-text">
          <span class="yield-val">{value}</span>
          <span class="yield-sub">{sub ?? label}</span>
        </span>
      </button>
      <div class="yield-tip" role="tooltip" id={`tip-${id}`}>
        <div class="tip-head"><span class="tip-icon">{icon}</span><b>{label}</b></div>
        {children}
      </div>
    </div>
  );
}

function Flow({ good, label, value, sign }: { good: Good; label: string; value: number; sign: 1 | -1 }) {
  if (!value) return null;
  return <div class="tip-row"><span>{label}</span><b class={sign > 0 ? 'pos' : 'neg'}>{qtySigned(good, sign * value)}</b></div>;
}

function GoodYield({ g, obs, right }: { g: GoodLine; obs: Observation; right?: boolean }) {
  const net = netOf(g);
  const perMonth = g.consumed > 0 ? g.consumed / obs.months_per_round : 0;
  const months = g.good === 'food' && perMonth > 0 ? g.stock / perMonth : null;
  const low = g.good === 'food' && months !== null && months < 2;
  const falling = net < 0 && g.stock + net * 2 <= 0;
  const full = g.capacity !== null && g.capacity > 0 && g.stock >= g.capacity;
  const tone = low || (falling && g.stock > 0) ? 'bad' : net < 0 ? 'warn' : undefined;
  const delta = net === 0 ? null : <em class={net < 0 ? 'neg' : 'pos'}>{qtySigned(g.good, net)}</em>;
  return (
    <Yield id={g.good} icon={<GoodIcon good={g.good} size={21} />} label={t(GOOD_SHORT[g.good])} panel="economy" tone={tone} right={right}
      value={<><Tick value={g.stock} format={(n) => qty(g.good, Math.round(n / 100) * 100)} />{delta}</>}
      sub={g.good === 'food' && months !== null ? t('{n} mo in store', { n: months >= 100 ? '99+' : months.toFixed(1) }) : undefined}>
      <p class="tip-lede">{t(GOOD_BLURB[g.good] ?? '')}</p>
      <div class="tip-rows">
        <div class="tip-row"><span>{t('In store')}</span><b>{qty(g.good, g.stock)}{g.capacity !== null ? <small> / {qty(g.good, g.capacity)}</small> : null}</b></div>
        {goodUnit(g.good) !== 't' && g.stock > 0 ? <div class="tip-row"><span>{t('Mass')}</span><b>{tonnes(goodTonnes(g.good, g.stock))}</b></div> : null}
        {months !== null ? <div class="tip-row"><span>{t('Lasts about')}</span><b>{t('{n} months', { n: months.toFixed(1) })}</b></div> : null}
      </div>
      <p class="tip-kicker">{t('Last round')}</p>
      <div class="tip-rows">
        <Flow good={g.good} label={t('Produced')} value={g.produced} sign={1} />
        <Flow good={g.good} label={t('Consumed')} value={g.consumed} sign={-1} />
        <Flow good={g.good} label={t('Lost (spoiled, carriage, abandoned)')} value={g.lost ?? 0} sign={-1} />
        <Flow good={g.good} label={t('Received in trade')} value={g.traded_in} sign={1} />
        <Flow good={g.good} label={t('Sent in trade')} value={g.traded_out} sign={-1} />
        {!g.produced && !g.consumed && !g.traded_in && !g.traded_out ? <div class="tip-row"><span class="muted">{t('Nothing moved yet.')}</span></div> : null}
        <div class="tip-row is-total"><span>{t('Net')}</span><b class={net < 0 ? 'neg' : net > 0 ? 'pos' : ''}>{qtySigned(g.good, net)}</b></div>
      </div>
      {low ? <p class="tip-risk"><Icon name="warn" size={12} /> {t('Less than two months of food in store. Hunger costs lives and stability.')}</p>
        : falling && g.stock > 0 ? <p class="tip-risk"><Icon name="warn" size={12} /> {t('At this rate the store runs out within two rounds.')}</p>
        : full ? <p class="tip-risk is-soft"><Icon name="info" size={12} /> {t('The store is full: anything more is lost until storage grows.')}</p>
        : net < 0 ? <p class="tip-risk is-soft"><Icon name="info" size={12} /> {t('The store is being drawn down.')}</p> : null}
      <p class="tip-foot">{t(GOOD_LABEL[g.good])} · {t('Click to open the economy')}</p>
    </Yield>
  );
}

/** The date plate's tooltip: the round's span and length, and where the calendar ends. */
export function dateTitle(x: { month: number; horizon: number; months_per_round: number; calendar?: Observation['calendar'] }): string {
  const cal = x.calendar;
  if (!cal) return t('Month {m} of {h}', { m: x.month, h: x.horizon });
  return t('This round: {span} ({length}). The match runs from {start} to {end}.', {
    span: roundSpan(cal) ?? '', length: roundLength(cal.round_months), start: histYear(cal.start.year), end: histYear(cal.horizon.year),
  });
}

export function TopBar() {
  const s = useApp();
  const obs = s.obs!;
  const summary = s.summary!;
  const civ = obs.civ;
  const watching = s.mode === 'observe';
  const humans = humanSeatList();
  const line = (good: Good) => civ.goods.find((g) => g.good === good);
  const basics = BASIC.map(line).filter((g): g is GoodLine => !!g);
  const advanced = ADVANCED.map(line).filter((g): g is GoodLine => !!g && (g.stock > 0 || g.produced > 0 || g.consumed > 0));
  const stabTone = civ.stability >= 60 ? undefined : civ.stability >= 35 ? 'warn' : 'bad';
  const research = civ.research.filter((l) => l.capacity > 0 || l.used > 0);
  const resCap = research.reduce((a, l) => a + l.capacity, 0);
  const resUsed = research.reduce((a, l) => a + l.used, 0);
  const idle = research.some((l) => l.capacity > 0 && l.used === 0);
  const lab = civ.labor;
  const free = Math.max(0, lab.working_age - lab.food - lab.students - lab.teachers - lab.soldiers);
  const callable = Math.round((free * civ.mobilization_cap_bp * civ.policies.mobilization_bp) / 1e8);
  const growth = civ.births_last_round - civ.deaths_last_round + civ.migration_last_round;

  // The ribbon gives way before the civilization's name does: when the bar is too
  // narrow, advanced goods leave first (last one first), then labour, then tools.
  const bar = useRef<HTMLElement>(null);
  const [drop, setDrop] = useState(0);
  const [width, setWidth] = useState(window.innerWidth);
  const maxDrop = advanced.length + 2;
  const fitKey = `${obs.match_id}:${obs.seat}:${obs.round}:${advanced.length}:${width}:${getLocale()}:${watching}`;
  const lastKey = useRef(fitKey);
  useEffect(() => {
    const on = () => setWidth(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    if (lastKey.current !== fitKey) {
      lastKey.current = fitKey;
      if (drop !== 0) { setDrop(0); return; }
    }
    if (el.scrollWidth > el.clientWidth + 1 && drop < maxDrop) setDrop(drop + 1);
  });
  const shownAdvanced = advanced.slice(0, Math.max(0, advanced.length - drop));
  const spare = Math.max(0, drop - advanced.length);
  const shownBasics = spare >= 2 ? basics.filter((g) => g.good !== 'tools') : basics;

  return (
    <header class="topbar" ref={bar}>
      <button type="button" class="topbar-menu" aria-label={t('Game menu')} title={t('Game menu')} data-testid="menu-button" onClick={() => setMenu(!s.menuOpen)}>
        <Icon name="menu" size={18} />
      </button>
      <div class="topbar-civ">
        <Emblem seat={obs.seat} color={civ.color} name={civ.name} size={32} />
        <div class="civ-text">
          <span class="civ-name" data-testid="civ-name">{tc(civ.name)}</span>
          {watching ? (
            <span class="observing-badge" data-testid="observing-badge"><Icon name="eye" size={12} /> {t('Observing')}</span>
          ) : humans.length > 1 ? (
            <span class="seat-switch">
              {humans.map((h) => (
                <button type="button" class={cx('seat-chip', h === obs.seat && 'is-active')} disabled={h === obs.seat}
                  title={h === obs.seat ? t('You are playing this seat') : t('Switch to {name}', { name: seatName(h) })} data-testid={`seat-${h}`}
                  onClick={() => void switchSeat(h)}>
                  <SeatDot color={summary.seats?.find((x) => x.seat === h)?.color ?? '#888'} size={8} />{seatName(h)}
                </button>
              ))}
            </span>
          ) : (
            <span class="civ-sub">{obs.status === 'active' ? t('Your civilization') : t(obs.status === 'eliminated' ? 'Eliminated' : 'Forfeited')}</span>
          )}
        </div>
      </div>

      <div class="topbar-date" title={dateTitle(obs)} data-round={obs.round}>
        <span class="date-year" data-testid="year">{fmtNow(obs)}</span>
        <span class="date-round">{t('Round {r} of {n}', { r: int(obs.round), n: int(totalRounds(obs)) })}</span>
      </div>

      <EraBanner obs={obs} />

      {watching ? <PerspectiveSwitch compact /> : null}

      <div class="yields" data-tut="yields" role="group" aria-label={t('Stocks and capacities')}>
        {shownBasics.map((g) => <GoodYield g={g} obs={obs} />)}
        {shownAdvanced.map((g) => <GoodYield g={g} obs={obs} />)}
        <BoostYield obs={obs} />
        <span class="yield-sep" aria-hidden="true" />
        <Yield id="population" icon={<Icon name="people" size={20} />} label={t('Population')} panel="people" right
          value={<><span data-testid="population" data-exact={civ.population}><Tick value={civ.population} format={(n) => peopleNum(n)} /></span>{growth ? <em class={growth < 0 ? 'neg' : 'pos'}>{(growth > 0 ? '+' : '−') + peopleNum(Math.abs(growth))}</em> : null}</>}>
          <p class="tip-lede">{t('Everyone your government answers for. Only people of working age can work, study, teach or serve.')}</p>
          <div class="tip-rows">
            <div class="tip-row is-total"><span>{t('Residents')}</span><b>{t('{n} people', { n: int(civ.population) })}</b></div>
            <div class="tip-row"><span>{t('Children')}</span><b>{people(civ.children)}</b></div>
            <div class="tip-row"><span>{t('Working age')}</span><b>{people(civ.working_age)}</b></div>
            <div class="tip-row"><span>{t('Elders')}</span><b>{people(civ.elders)}</b></div>
          </div>
          <p class="tip-kicker">{t('Last round')}</p>
          <div class="tip-rows">
            <div class="tip-row"><span>{t('Births')}</span><b class="pos">+{peopleNum(civ.births_last_round)}</b></div>
            <div class="tip-row"><span>{t('Deaths')}</span><b class="neg">−{peopleNum(civ.deaths_last_round)}</b></div>
            {civ.migration_last_round ? <div class="tip-row"><span>{t('Migration')}</span><b class={civ.migration_last_round < 0 ? 'neg' : 'pos'}>{(civ.migration_last_round > 0 ? '+' : '−') + peopleNum(Math.abs(civ.migration_last_round))}</b></div> : null}
          </div>
          {civ.food_fulfillment_bp < 9500 ? <p class="tip-risk"><Icon name="warn" size={12} /> {t('Only {p} of food needs were met. People are going hungry.', { p: pct(civ.food_fulfillment_bp) })}</p> : null}
          {civ.water_fulfillment_bp < 9500 ? <p class="tip-risk"><Icon name="warn" size={12} /> {t('Only {p} of water needs were met.', { p: pct(civ.water_fulfillment_bp) })}</p> : null}
          <p class="tip-foot">{t('Click to open people and education')}</p>
        </Yield>
        <Yield id="stability" icon={<Icon name="balance" size={20} />} label={t('Stability')} panel="politics" tone={stabTone} right
          value={<><Tick value={civ.stability} format={(n) => String(Math.round(n))} /><small> /100</small></>}>
          <p class="tip-lede">{t('How far people accept being governed. Hunger, unmet demands and occupation wear it down; kept promises restore it.')}</p>
          <div class="tip-rows">
            <div class="tip-row"><span>{t('Administrative load')}</span><b class={civ.admin_load > civ.admin_capacity ? 'neg' : ''}>{compact(civ.admin_load)} / {compact(civ.admin_capacity)}</b></div>
            <div class="tip-row"><span>{t('Food needs met')}</span><b>{pct(civ.food_fulfillment_bp)}</b></div>
            <div class="tip-row"><span>{t('Water needs met')}</span><b>{pct(civ.water_fulfillment_bp)}</b></div>
          </div>
          {stabTone ? <p class="tip-risk"><Icon name="warn" size={12} /> {t(stabTone === 'bad' ? 'Stability is dangerously low: expect unrest, refusals and flight.' : 'Stability is slipping. Look at what the factions are asking for.')}</p> : null}
          <p class="tip-foot">{t('Click to open politics')}</p>
        </Yield>
        <Yield id="research" icon={<Icon name="flask" size={20} />} label={t('Research')} tone={idle ? 'warn' : undefined} right onClick={() => openOverlay('tech')}
          value={resCap > 0 ? <>{compact(resUsed)}<small> / {compact(resCap)}</small></> : <span class="yield-none">—</span>}
          sub={resCap > 0 ? t('researcher-months in use') : undefined}>
          <p class="tip-lede">{t('Work per month that qualified people can put into investigations. It is not a currency: unused capacity is simply lost.')}</p>
          {research.length ? (
            <div class="tip-rows">
              {research.map((l) => <div class="tip-row"><span>{t(RESEARCH_LABEL[l.class])}</span><b class={l.capacity > 0 && l.used === 0 ? 'warn-text' : ''}>{compact(l.used)} / {researchMonths(l.capacity)}</b></div>)}
            </div>
          ) : <p class="tip-risk is-soft"><Icon name="info" size={12} /> {t('No research capacity yet. Qualified people staffing a makers’ circle or an institute provide it.')}</p>}
          {idle ? <p class="tip-risk"><Icon name="warn" size={12} /> {t('Some capacity is idle. Start an investigation or follow up a lead.')}</p> : null}
          <p class="tip-foot">{t('Click to open the technology tree')}</p>
        </Yield>
        {spare >= 1 ? null : <Yield id="labour" icon={<Icon name="labour" size={20} />} label={t('Callable labour')} panel="economy" right
          value={<><Tick value={lab.projects} format={(n) => peopleNum(n)} /><small> / {peopleNum(Math.max(callable, lab.projects))}</small></>}
          sub={t('people on projects')}>
          <p class="tip-lede">{t('Food comes first. Of the labour left over, custom lets the government call up only a share for public projects; the rest staffs facilities.')}</p>
          <div class="tip-rows">
            <div class="tip-row"><span>{t('Growing and gathering food')}</span><b>{people(lab.food)}</b></div>
            <div class="tip-row"><span>{t('Staffing facilities')}</span><b>{people(lab.facilities)}</b></div>
            <div class="tip-row"><span>{t('On public projects')}</span><b>{people(lab.projects)}</b></div>
            <div class="tip-row"><span>{t('Students and teachers')}</span><b>{people(lab.students + lab.teachers)}</b></div>
            <div class="tip-row"><span>{t('Soldiers')}</span><b>{people(lab.soldiers)}</b></div>
            <div class="tip-row"><span>{t('Household and unassigned')}</span><b>{people(lab.household)}</b></div>
            <div class="tip-row is-total"><span>{t('Call-up cap by custom')}</span><b>{pct(civ.mobilization_cap_bp)}</b></div>
            <div class="tip-row"><span>{t('Callable now (estimate)')}</span><b>≈ {people(callable)}</b></div>
          </div>
          <p class="tip-foot">{t('Click to open the economy')}</p>
        </Yield>}
      </div>
    </header>
  );
}
