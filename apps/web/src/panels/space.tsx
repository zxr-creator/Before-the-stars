// Space operations: boost, lifts to Earth orbit, stations, outposts, shipments and site works
// (bts-protocol/2.5 `Action::Space`). The referee's receipts and refusals appear under each form.
import { useEffect, useState } from 'preact/hooks';
import type { GoodQty, Good, Observation, SpaceOrder, SpaceSiteView, StationView } from '../protocol';
import { GOOD_LABEL, GOODS, goodTonnes, int, peopleNum, qty, tonnes } from '../format';
import { t, tc, useLocale } from '../i18n';
import { ActionNote, Badge, Btn, Empty, Meter, NumInput, Section, Tabs, Why, cx } from '../ui';
import { act, useApp } from '../store';
import { openPanel } from '../store';
import { readSpace, spaceView, type SiteState } from '../space/adapter';
import { ORBITS, SITES, ZONE_LABEL, type Zone } from '../space/catalog';
import {
  CORE_DEF, CORE_KEYS, MODULE_DEF, MODULE_KEYS, ORBIT_ROUTE, OUTPOST_EXTRA, OUTPOST_PARTY, PERSON_T, PROPS, SITE_BUILD_MONTHS,
  SITE_ROUTE, WORK_DEF, WORK_KEYS, ZONE_NAME, bestRoute, partBill,
} from '../space/ops-data';

type View = 'overview' | 'stations' | 'sites';
type Focus = { view: View; site?: string; orbit?: string } | null;

// A card on the Solar System view can send the player here with a site or an orbit in hand.
let focus: Focus = null;
const listeners = new Set<() => void>();
export function openSpaceOps(f: { site?: string; orbit?: string } = {}): void {
  focus = { view: f.site ? 'sites' : f.orbit ? 'stations' : 'overview', ...f };
  listeners.forEach((l) => l());
  openPanel('space');
}

const zoneName = (z: string) => t(ZONE_NAME[z] ?? ZONE_LABEL[z as Zone] ?? z);
const goodName = (g: Good) => tc(GOOD_LABEL[g] ?? g);
const PROP_NAME: Record<string, string> = Object.fromEntries(PROPS.map((p) => [p.key, p.name]));

function stockOf(obs: Observation, good: Good): number {
  return obs.civ.goods.find((g) => g.good === good)?.stock ?? 0;
}
function storeOf(obs: Observation, zone: string, good: Good): number {
  if (zone === 'earth_orbit') return spaceView(obs)?.stores?.find((s) => s.zone === zone)?.goods.find((g) => g.good === good)?.amount ?? 0;
  return spaceView(obs)?.stores?.find((s) => s.zone === zone)?.goods.find((g) => g.good === good)?.amount ?? 0;
}
const isDock = (k: string) => k === 'docking' || k === 'Docking and depot';

/** Tonnes a month the seat can send from a zone with one propulsion family (docking levels, or an outpost pad off the Earth). */
function berthT(obs: Observation, zone: string, prop: number): number {
  const sp = spaceView(obs);
  let levels = 0;
  for (const st of sp?.stations ?? []) {
    if (st.owner !== obs.seat) continue;
    const o = ORBITS.find((x) => x.key === st.orbit);
    if (o?.zone !== zone) continue;
    levels += (st.modules ?? []).filter((m) => isDock(m.kind)).reduce((a, m) => a + (m.level ?? 1), 0);
  }
  const pad = zone !== 'earth_orbit' && (sp?.sites ?? []).some((s) => s.owner === obs.seat && s.zone === zone && (s.works ?? []).some((w) => (w.kind === 'outpost' || w.kind === 'Pressurized outpost') && w.level > 0)) ? 1 : 0;
  return (levels + pad) * PROPS[prop].payload;
}

function BillLine({ obs, zone, bill }: { obs: Observation; zone: string; bill: { good: Good; amount: number }[] }) {
  return (
    <ul class="sx-bill">
      {bill.map((b) => {
        const have = zone === 'earth_orbit' ? stockOf(obs, b.good) : storeOf(obs, zone, b.good);
        return <li class={cx(have < b.amount && 'is-short')}>{qty(b.good, b.amount)} <small>{t('({n} held)', { n: int(have) })}</small></li>;
      })}
    </ul>
  );
}

export function SpacePanel() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const sp = spaceView(obs);
  const [view, setView] = useState<View>(focus?.view ?? 'overview');
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => { if (focus) setView(focus.view); bump((n) => n + 1); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const state = readSpace(obs);
  const eraNow = obs.era?.era ?? 0;
  if (!sp || (!sp.boost && !sp.sites?.length && eraNow < 7)) {
    return (
      <div class="panel space-ops" data-testid="space-panel">
        <Empty>{t('Space opens with the Space era. Until a launch stage makes boost, nothing here can be ordered.')}</Empty>
      </div>
    );
  }
  const owned = state.sites.filter((x) => x.owner === obs.seat);
  const flies = sp.propulsion ?? [];
  return (
    <div class="panel space-ops" data-testid="space-panel">
      <Tabs label={t('Space views')} value={view} onChange={setView} tabs={[
        { key: 'overview', label: t('Boost and goods'), count: state.transfers.length || undefined },
        { key: 'stations', label: t('Stations'), count: (sp.stations ?? []).filter((x) => x.owner === obs.seat).length || undefined },
        { key: 'sites', label: t('Sites'), count: owned.length || undefined },
      ]} />
      {view === 'overview' ? <Overview obs={obs} /> : null}
      {view === 'stations' ? <Stations obs={obs} flies={flies} /> : null}
      {view === 'sites' ? <Sites obs={obs} flies={flies} owned={owned} /> : null}
    </div>
  );
}

function order(o: SpaceOrder, tag: string) {
  return act({ kind: 'space', order: o }, tag);
}

function Overview({ obs }: { obs: Observation }) {
  const s = useApp();
  const sp = spaceView(obs)!;
  const b = sp.boost;
  const state = readSpace(obs);
  const withStock = obs.civ.goods.filter((g) => g.stock > 0).map((g) => g.good);
  const [good, setGood] = useState<Good>(withStock.includes('metal') ? 'metal' : withStock[0] ?? 'metal');
  const [amount, setAmount] = useState(1000);
  const eo = sp.stores?.find((x) => x.zone === 'earth_orbit')?.goods ?? [];
  const [down, setDown] = useState<Good>(eo[0]?.good ?? 'metal');
  const [downAmount, setDownAmount] = useState(1000);
  const lift = goodTonnes(good, amount);
  const noBoost = !b || (b.stock <= 0 && b.made_last <= 0 && !(b.by_stage?.length));
  const liftWhy = amount <= 0 ? t('Enter an amount') : stockOf(obs, good) < amount ? t('The stores hold only {n}', { n: qty(good, stockOf(obs, good)) }) : null;
  const landHeld = storeOf(obs, 'earth_orbit', down);
  const landWhy = downAmount <= 0 ? t('Enter an amount') : landHeld < downAmount ? t('The Earth-orbit store holds only {n}', { n: qty(down, landHeld) }) : null;
  return (
    <>
      <Section title={t('Boost')} aside={b ? <Badge tone={b.cap > 0 && b.stock >= b.cap ? 'warn' : 'info'}>{t('{n} months running', { n: b.streak ?? 0 })}</Badge> : null}>
        {b ? (
          <>
            <Meter value={b.stock} max={Math.max(1, b.cap)} tone={b.cap > 0 && b.stock >= b.cap ? 'gold' : 'accent'} height={8} label={t('Boost {a} of {b}', { a: tonnes(b.stock), b: tonnes(b.cap) })} />
            <dl class="kvs kvs-2">
              <div class="kv"><dt>{t('In stock')}</dt><dd><b data-testid="space-boost-stock">{tonnes(b.stock)}</b></dd></div>
              <div class="kv"><dt>{t('Cap')}</dt><dd>{tonnes(b.cap)}</dd></div>
              <div class="kv"><dt>{t('Made last month')}</dt><dd>{tonnes(b.made_last)}</dd></div>
              <div class="kv"><dt>{t('Spent last month')}</dt><dd>{tonnes(b.spent_last)}</dd></div>
            </dl>
            {b.by_stage?.length ? (
              <ul class="sx-stages">
                {b.by_stage.map((st) => (
                  <li><span>{tc(st.stage)} <small>×{st.levels}</small></span><b>{tonnes(st.made)}</b>{st.standing_down ? <Badge tone="warn">{t('Standing down at the cap')}</Badge> : null}</li>
                ))}
              </ul>
            ) : null}
            <p class="note">{t('Boost does not decay. Every lift, part and shipment is paid from the stock month by month; a load waits on the pad until its boost is paid.')}</p>
          </>
        ) : <p class="note">{t('No launch stage has made boost yet.')}</p>}
      </Section>

      <Section title={t('Lift goods to Earth orbit')}>
        <div class="sx-form">
          <label class="inline-field"><span class="field-label">{t('Good')}</span>
            <select class="select" value={good} data-testid="space-lift-good" onChange={(e) => setGood((e.target as HTMLSelectElement).value as Good)}>
              {GOODS.filter((g) => stockOf(obs, g) > 0 || g === good).map((g) => <option value={g}>{goodName(g)} ({int(stockOf(obs, g))})</option>)}
            </select></label>
          <label class="inline-field"><span class="field-label">{t('Amount')}</span><NumInput value={amount} min={0} max={Math.max(1, stockOf(obs, good))} step={100} onChange={setAmount} label={t('Amount')} width={96} testid="space-lift-amount" /></label>
        </div>
        <p class="note">{t('About {n} of boost, paid from the stock as it comes.', { n: tonnes(lift) })}</p>
        <div class="form-actions">
          <Btn kind="primary" icon="up" disabled={s.busy || noBoost} why={noBoost ? t('No launch stage has made boost yet') : liftWhy} testid="space-lift" onClick={() => void order({ op: 'launch', good, amount }, 'space-lift')}>{t('Lift to Earth orbit')}</Btn>
          {noBoost ? <Why>{t('No launch stage has made boost yet')}</Why> : liftWhy ? <Why>{liftWhy}</Why> : null}
        </div>
        <ActionNote tag="space-lift" />
      </Section>

      <Section title={t('Bring goods down')}>
        {eo.length ? (
          <>
            <div class="sx-form">
              <label class="inline-field"><span class="field-label">{t('Good')}</span>
                <select class="select" value={down} onChange={(e) => setDown((e.target as HTMLSelectElement).value as Good)}>
                  {eo.map((g) => <option value={g.good}>{goodName(g.good)} ({int(g.amount)})</option>)}
                </select></label>
              <label class="inline-field"><span class="field-label">{t('Amount')}</span><NumInput value={downAmount} min={0} max={Math.max(1, landHeld)} step={100} onChange={setDownAmount} label={t('Amount')} width={96} /></label>
            </div>
            <div class="form-actions">
              <Btn small icon="down" disabled={s.busy} why={landWhy} testid="space-land" onClick={() => void order({ op: 'land', good: down, amount: downAmount }, 'space-land')}>{t('Land to the national stores')}</Btn>
              {landWhy ? <Why>{landWhy}</Why> : null}
            </div>
          </>
        ) : <p class="note">{t('The Earth-orbit store is empty. Landing costs no boost.')}</p>}
        <ActionNote tag="space-land" />
      </Section>

      <Section title={t('Zone stores')}>
        {sp.stores?.length ? (
          <ul class="sx-stores">
            {sp.stores.map((z) => (
              <li><b>{zoneName(z.zone)}</b>
                <span>{z.goods.map((g: GoodQty) => qty(g.good, g.amount)).join(' · ') || t('Empty')}</span></li>
            ))}
          </ul>
        ) : <p class="note">{t('Nothing is held outside the national stores.')}</p>}
      </Section>

      <Section title={t('Departure windows')}>
        {sp.windows?.length ? (
          <ul class="sx-windows">
            {sp.windows.map((w) => (
              <li><span>{zoneName(w.zone)}</span>{w.open ? <Badge tone="ok">{t('Open now')}</Badge> : <Badge tone="muted">{t('Opens in {n} months', { n: w.opens_in })}</Badge>}</li>
            ))}
          </ul>
        ) : <p class="note">{t('No windows reported.')}</p>}
        <p class="note">{t('Chemical and nuclear-thermal craft depart only inside a window; electric craft in the first half of the cycle; fusion ships at any time.')}</p>
      </Section>

      <Section title={t('In flight')} aside={state.transfers.length ? <Badge tone="info">{state.transfers.length}</Badge> : null}>
        {sp.transfers?.length ? (
          <ul class="sx-flights">
            {sp.transfers.map((tr) => (
              <li data-testid="space-flight">
                <b>{tc(PURPOSE[tr.purpose ?? ''] ?? tr.purpose ?? 'Cargo')}</b>
                <span>{zoneName(tr.from_zone)} → {zoneName(tr.to_zone)}{tr.target ? ` · ${tc(siteName(tr.target))}` : ''}</span>
                <small>{tonnes(tr.payload_t ?? 0)}{tr.people ? ` · ${t('{n} people', { n: peopleNum(tr.people) })}` : ''}{tr.propulsion ? ` · ${tc(tr.propulsion)}` : ''} · {tr.departed > obs.month ? t('waiting for its window or its boost') : t('arrives in {n} months', { n: Math.max(0, tr.arrives - obs.month) })}</small>
              </li>
            ))}
          </ul>
        ) : <p class="note">{t('No shipments are under way.')}</p>}
      </Section>
    </>
  );
}

// i18n-table
const PURPOSE: Record<string, string> = {
  lift: 'Lift to Earth orbit', cargo: 'Cargo', outpost: 'Founding party', settlers: 'Settlers', core: 'Station core', module: 'Station module',
};
// i18n-end

function siteName(key: string): string {
  const d = SITES.find((x) => x.key === key);
  return d ? d.name : ORBITS.find((o) => o.key === key)?.name ?? key;
}

function Stations({ obs, flies }: { obs: Observation; flies: string[] }) {
  const sp = spaceView(obs)!;
  const avail = new Set(sp.available ?? []);
  return (
    <>
      <p class="note">{t('One station per realm in each orbit. A core carries the modules; a better core upgrades the old one for 60% of its mass. Parts are built from the national stores and lifted with boost.')}</p>
      {ORBITS.map((o) => {
        const st = (sp.stations ?? []).find((x) => x.owner === obs.seat && x.orbit === o.key);
        return <OrbitRow obs={obs} orbit={o.key} st={st} avail={avail} flies={flies} />;
      })}
    </>
  );
}

function OrbitRow({ obs, orbit, st, avail, flies }: { obs: Observation; orbit: string; st: StationView | undefined; avail: Set<string>; flies: string[] }) {
  const s = useApp();
  const o = ORBITS.find((x) => x.key === orbit)!;
  const parts = [...CORE_KEYS, ...MODULE_KEYS].filter((k) => avail.has(k));
  const [part, setPart] = useState('');
  useEffect(() => { if (focus?.orbit === orbit) setOpen(true); }, [focus?.orbit]);
  const [open, setOpen] = useState(focus?.orbit === orbit || !!st);
  const sel = part && parts.includes(part) ? part : parts[0] ?? '';
  const isCore = CORE_DEF[sel] != null;
  const coreNow = st?.core ? Number(String(st.core).replace(/\D/g, '')) || 0 : 0;
  const def = isCore ? CORE_DEF[sel] : MODULE_DEF[sel];
  const mass = def ? (isCore && st ? Math.floor((def.mass * 6) / 10) : def.mass) : 0;
  const route = ORBIT_ROUTE[orbit];
  const best = orbit === 'leo' ? { prop: 0, ratio: 10000, months: 0 } : bestRoute(route, flies, false);
  const boostT = best ? Math.ceil((mass * best.ratio) / 10000) : 0;
  const slotsMax = st?.core ? CORE_DEF[String(st.core).toLowerCase().match(/k\d/)?.[0] ?? 'k1']?.slots ?? 0 : 0;
  const used = (st?.modules ?? []).reduce((a, m) => a + (m.level ?? 1), 0);
  let why: string | null = null;
  if (!sel) why = t('No station part can be built yet');
  else if (!isCore && !st) why = t('Place a core in that orbit first');
  else if (isCore && st && Number(sel.slice(1)) <= coreNow) why = t('The station already has that core or a later one');
  else if (!isCore && st && used >= slotsMax) why = t('Every module slot of the core is taken');
  else if (!best) why = t('No propulsion family this seat flies reaches that destination with this load');
  const tag = 'space-place-' + orbit;
  return (
    <section class={cx('sx-orbit', st && 'has-station')} data-testid={'space-orbit-' + orbit}>
      <button type="button" class="sx-orbit-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{t(o.name)}</b>
        <span>{st ? <>{st.core ? t('core {k}', { k: st.core }) : t('no core')} · {t('{a} of {b} slots', { a: used, b: slotsMax })}</> : <em>{t('no station')}</em>}</span>
      </button>
      {open ? (
        <div class="sx-orbit-body">
          {st ? (
            <>
              <dl class="kvs kvs-2">
                {st.aboard != null ? <div class="kv"><dt>{t('Aboard')}</dt><dd>{peopleNum(st.aboard)}</dd></div> : null}
                {st.staffed_bp != null ? <div class="kv"><dt>{t('Staffed')}</dt><dd>{(st.staffed_bp / 100).toFixed(0)}%</dd></div> : null}
                {st.power_bp != null ? <div class="kv"><dt>{t('Power')}</dt><dd>{(st.power_bp / 100).toFixed(0)}%</dd></div> : null}
                {st.supplied_bp != null ? <div class="kv"><dt>{t('Supplied')}</dt><dd>{(st.supplied_bp / 100).toFixed(0)}%</dd></div> : null}
              </dl>
              {st.modules?.length ? <p class="note">{st.modules.map((m) => tc(m.kind) + (m.level ? ` ${m.level}` : '')).join(', ')}</p> : <p class="note">{t('No modules yet.')}</p>}
            </>
          ) : null}
          {parts.length ? (
            <>
              <div class="sx-form">
                <label class="inline-field"><span class="field-label">{t('Part')}</span>
                  <select class="select" value={sel} data-testid={'space-part-' + orbit} onChange={(e) => setPart((e.target as HTMLSelectElement).value)}>
                    {parts.map((k) => <option value={k}>{tc((CORE_DEF[k] ?? MODULE_DEF[k]).name)}{CORE_DEF[k] ? ` (${t('{n} slots', { n: CORE_DEF[k].slots })})` : ''}</option>)}
                  </select></label>
              </div>
              {def ? (
                <>
                  <p class="note">{t('{m} t to place. About {b} of boost with the propellant for the leg{mo}.', { m: int(mass), b: tonnes(boostT), mo: best && best.months ? `, ${t('{n} months in flight', { n: best.months })}` : '' })}</p>
                  <BillLine obs={obs} zone="earth_orbit" bill={partBill(mass)} />
                </>
              ) : null}
              <div class="form-actions">
                <Btn small kind="primary" icon="plus" disabled={s.busy} why={why} testid={'space-place-' + orbit} onClick={() => void order({ op: 'place', orbit, part: sel }, tag)}>{isCore ? (st ? t('Upgrade the core') : t('Place the core')) : t('Place the module')}</Btn>
                {why ? <Why>{why}</Why> : null}
              </div>
            </>
          ) : <p class="note">{t('No station part can be built yet.')}</p>}
          <ActionNote tag={tag} />
        </div>
      ) : null}
    </section>
  );
}

function Sites({ obs, flies, owned }: { obs: Observation; flies: string[]; owned: SiteState[] }) {
  const state = readSpace(obs);
  const mine = new Set(owned.map((x) => x.def.key));
  const [which, setWhich] = useState<string>(focus?.site ?? '');
  useEffect(() => { if (focus?.site) setWhich(focus.site); }, [focus?.site]);
  const cur = state.siteByKey[which] ?? null;
  return (
    <>
      <Section title={t('Sites')}>
        <ul class="sx-sites">
          {state.sites.map((x) => (
            <li>
              <button type="button" class={cx('sx-site', which === x.def.key && 'is-active', mine.has(x.def.key) && 'is-own')} data-testid={'space-site-' + x.def.key} onClick={() => setWhich(which === x.def.key ? '' : x.def.key)}>
                <b>{t(x.def.name)}</b>
                <small>{mine.has(x.def.key) ? t('yours · {n} residents', { n: peopleNum(x.view?.population ?? 0) }) : x.owner != null ? t('held by another') : t('unclaimed')}</small>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {cur ? <SiteOps obs={obs} st={cur} flies={flies} own={mine.has(cur.def.key)} /> : <p class="note">{t('Choose a site to found an outpost, build works or ship goods and settlers.')}</p>}
      <ShipForm obs={obs} flies={flies} own={owned} />
    </>
  );
}

function RouteNote({ obs, def, flies, crew, prop }: { obs: Observation; def: { key: string; zone: string }; flies: string[]; crew: boolean; prop?: string | null }) {
  const route = SITE_ROUTE[def.key];
  const fl = prop ? flies.filter((k) => k === prop) : flies;
  const best = bestRoute(route, fl, crew);
  const w = spaceView(obs)?.windows?.find((x) => x.zone === def.zone);
  if (!best) return <p class="note is-warn">{t('No propulsion family this seat flies reaches that destination with this load')}</p>;
  const p = PROPS[best.prop];
  const berth = berthT(obs, 'earth_orbit', best.prop);
  return (
    <ul class="sx-route">
      <li>{t('Flown by {p}: {n} months each way.', { p: tc(p.name), n: best.months })}</li>
      <li>{p.window === 'none' ? t('No departure window.') : w ? (w.open ? t('Window open now.') : t('Window opens in {n} months.', { n: w.opens_in })) : t('Departs inside its window.')}</li>
      <li class={cx(berth <= 0 && 'is-short')}>{berth > 0 ? t('Berths in Earth orbit send {n} t a month.', { n: int(berth) }) : t('No berth in Earth orbit: place a docking module on a station in low Earth orbit first.')}</li>
    </ul>
  );
}

function SiteOps({ obs, st, flies, own }: { obs: Observation; st: SiteState; flies: string[]; own: boolean }) {
  const s = useApp();
  const sp = spaceView(obs)!;
  const def = st.def;
  const v: SpaceSiteView | null = st.view;
  const avail = new Set(sp.available ?? []);
  const [prop, setProp] = useState('');
  const [work, setWork] = useState('');
  const works = WORK_KEYS.filter((k) => avail.has(k));
  const selWork = work && works.includes(work) ? work : works[0] ?? '';
  const hasOutpostTech = avail.has('outpost');
  const outpostBill = [...WORK_DEF.outpost.bill, ...OUTPOST_EXTRA].reduce<{ good: Good; amount: number }[]>((a, [g, n]) => {
    const e = a.find((x) => x.good === g);
    if (e) e.amount += n; else a.push({ good: g, amount: n });
    return a;
  }, []);
  const route = SITE_ROUTE[def.key];
  const best = bestRoute(route, prop ? flies.filter((k) => k === prop) : flies, true);
  const payloadT = outpostBill.reduce((a, b) => a + goodTonnes(b.good, b.amount), 0) + OUTPOST_PARTY * PERSON_T;
  const boostT = best ? Math.ceil((payloadT * best.ratio) / 10000) : 0;
  let foundWhy: string | null = null;
  if (def.mortalityBp === null) foundWhy = t('Nobody can live at {name}', { name: t(def.name) });
  else if (st.owner != null) foundWhy = t('{name} is already claimed', { name: t(def.name) });
  else if (!hasOutpostTech) foundWhy = t('Spaceflight life support is not understood');
  else if (!best) foundWhy = t('No propulsion family this seat flies reaches that destination with this load');
  else if (sp.transfers?.some((x) => x.purpose === 'outpost' && x.target === def.key)) foundWhy = t('An outpost party is already on its way there');
  const zoneHeld = (g: Good) => storeOf(obs, def.zone, g);
  const wk = selWork ? WORK_DEF[selWork] : null;
  const wbill = wk ? wk.bill.map(([good, amount]) => ({ good, amount })) : [];
  const wWhy = !selWork ? t('No works can be built yet') : wbill.some((b) => zoneHeld(b.good) < b.amount) ? t('The {zone} store lacks the goods of the bill', { zone: zoneName(def.zone) }) : null;
  return (
    <Section title={t(def.name)} aside={<Badge tone={own ? 'ok' : st.owner != null ? 'warn' : 'muted'}>{own ? t('Yours') : st.owner != null ? t('Held by another') : t('Unclaimed')}</Badge>}>
      <p class="note">{t(def.speciality)}</p>
      {own ? (
        <>
          <dl class="kvs kvs-2">
            <div class="kv"><dt>{t('Residents')}</dt><dd>{peopleNum(v?.population ?? 0)}{v?.housing ? <small> / {peopleNum(v.housing)}</small> : null}</dd></div>
            {v?.served_bp != null ? <div class="kv"><dt>{t('Served')}</dt><dd>{(v.served_bp / 100).toFixed(0)}%</dd></div> : null}
            {v?.births_last != null ? <div class="kv"><dt>{t('Births last month')}</dt><dd>{int(v.births_last)}</dd></div> : null}
            {v?.deaths_last != null ? <div class="kv"><dt>{t('Deaths last month')}</dt><dd>{int(v.deaths_last)}</dd></div> : null}
          </dl>
          {v?.works?.length ? <p class="note">{v.works.map((w) => `${tc(w.kind)} ${w.level}${w.ready != null && w.ready > obs.month ? ' (' + t('ready in {n} months', { n: w.ready - obs.month }) + ')' : ''}`).join(', ')}</p> : null}
          <h4 class="sx-h">{t('Build works')}</h4>
          {works.length ? (
            <>
              <div class="sx-form">
                <label class="inline-field"><span class="field-label">{t('Works')}</span>
                  <select class="select" value={selWork} data-testid="space-work" onChange={(e) => setWork((e.target as HTMLSelectElement).value)}>
                    {works.map((k) => <option value={k}>{tc(WORK_DEF[k].name)}</option>)}
                  </select></label>
              </div>
              <p class="note">{t('One level from the {zone} store; {n} months to build; {p} posts.', { zone: zoneName(def.zone), n: SITE_BUILD_MONTHS, p: int(wk?.posts ?? 0) })}</p>
              <BillLine obs={obs} zone={def.zone} bill={wbill} />
              <div class="form-actions">
                <Btn small kind="primary" icon="hammer" disabled={s.busy} why={wWhy} testid="space-site-build" onClick={() => void order({ op: 'site_build', site: def.key, works: selWork }, 'space-build')}>{t('Build one level')}</Btn>
                {wWhy ? <Why>{wWhy}</Why> : null}
              </div>
            </>
          ) : <p class="note">{t('No works can be built yet.')}</p>}
          <ActionNote tag="space-build" />
          <p class="note">{t('Ship goods and settlers here with the shipment form below.')}</p>
        </>
      ) : st.owner == null ? (
        <>
          <h4 class="sx-h">{t('Found an outpost')}</h4>
          <p class="note">{t('A founding party of {n} people with the outpost bill and six months of food and volatiles; the first party to arrive claims the site.', { n: int(OUTPOST_PARTY) })}</p>
          <BillLine obs={obs} zone="earth_orbit" bill={outpostBill} />
          <div class="sx-form">
            <label class="inline-field"><span class="field-label">{t('Propulsion')}</span>
              <select class="select" value={prop} data-testid="space-found-prop" onChange={(e) => setProp((e.target as HTMLSelectElement).value)}>
                <option value="">{t('Best available')}</option>
                {flies.map((k) => <option value={k}>{tc(PROP_NAME[k] ?? k)}</option>)}
              </select></label>
          </div>
          <RouteNote obs={obs} def={def} flies={flies} crew prop={prop || null} />
          {best ? <p class="note">{t('About {n} of boost for the party and its cargo.', { n: tonnes(boostT) })}</p> : null}
          <div class="form-actions">
            <Btn small kind="primary" icon="pin" disabled={s.busy} why={foundWhy} testid="space-found" onClick={() => void order({ op: 'found_outpost', site: def.key, propulsion: prop || null }, 'space-found')}>{t('Found the outpost')}</Btn>
            {foundWhy ? <Why>{foundWhy}</Why> : null}
          </div>
          <ActionNote tag="space-found" />
        </>
      ) : <p class="note">{t('Another realm holds this site; nothing can be ordered there.')}</p>}
    </Section>
  );
}

function ShipForm({ obs, flies, own }: { obs: Observation; flies: string[]; own: SiteState[] }) {
  const s = useApp();
  const sp = spaceView(obs)!;
  const zones = Object.keys(ZONE_NAME);
  const [from, setFrom] = useState('earth_orbit');
  const [to, setTo] = useState('moon');
  const [site, setSite] = useState('');
  const [prop, setProp] = useState('');
  const [rows, setRows] = useState<{ good: Good; amount: number }[]>([{ good: 'food', amount: 1000 }]);
  const [people, setPeople] = useState(0);
  const sitesHere = own.filter((x) => x.def.zone === to);
  const siteSel = site && sitesHere.some((x) => x.def.key === site) ? site : '';
  const held = (g: Good) => (from === 'earth_orbit' ? stockOf(obs, g) + storeOf(obs, 'earth_orbit', g) : storeOf(obs, from, g));
  const goods = rows.filter((r) => r.amount > 0);
  const payload = goods.reduce((a, r) => a + goodTonnes(r.good, r.amount), 0) + people * PERSON_T;
  const dest = siteSel ? SITE_ROUTE[siteSel] : undefined;
  const zoneRoute = dest ?? Object.entries(SITE_ROUTE).filter(([k]) => SITES.find((d) => d.key === k)?.zone === to).map(([, r]) => r).sort((a, b) => Math.min(...a[0].filter((x) => x > 0)) - Math.min(...b[0].filter((x) => x > 0)))[0];
  const best = from === 'earth_orbit' ? bestRoute(zoneRoute, prop ? flies.filter((k) => k === prop) : flies, people > 0) : null;
  const boostT = best ? Math.ceil((payload * best.ratio) / 10000) : 0;
  let why: string | null = null;
  if (from === to && people === 0) why = t('Departure and destination are the same zone');
  else if (!goods.length && people === 0) why = t('Nothing to ship');
  else if (people > 0 && !siteSel) why = t('Settlers need a destination site');
  else if (people > 0 && from !== 'earth_orbit') why = t('Settlers leave from the Earth');
  else if (goods.some((r) => held(r.good) < r.amount)) why = t('The store holds less than the load');
  const setRow = (i: number, p: Partial<{ good: Good; amount: number }>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <Section title={t('Ship goods and people')}>
      <div class="sx-form">
        <label class="inline-field"><span class="field-label">{t('From')}</span>
          <select class="select" value={from} data-testid="space-ship-from" onChange={(e) => setFrom((e.target as HTMLSelectElement).value)}>
            {zones.filter((z) => z === 'earth_orbit' || sp.stores?.some((x) => x.zone === z)).map((z) => <option value={z}>{from === z && z === 'earth_orbit' ? t('Earth (stores and orbit)') : zoneName(z)}</option>)}
          </select></label>
        <label class="inline-field"><span class="field-label">{t('To')}</span>
          <select class="select" value={to} data-testid="space-ship-to" onChange={(e) => setTo((e.target as HTMLSelectElement).value)}>
            {zones.map((z) => <option value={z}>{zoneName(z)}</option>)}
          </select></label>
        <label class="inline-field"><span class="field-label">{t('Site')}</span>
          <select class="select" value={siteSel} onChange={(e) => setSite((e.target as HTMLSelectElement).value)}>
            <option value="">{t('The zone store')}</option>
            {sitesHere.map((x) => <option value={x.def.key}>{t(x.def.name)}</option>)}
          </select></label>
        <label class="inline-field"><span class="field-label">{t('Propulsion')}</span>
          <select class="select" value={prop} onChange={(e) => setProp((e.target as HTMLSelectElement).value)}>
            <option value="">{t('Best available')}</option>
            {flies.map((k) => <option value={k}>{tc(PROP_NAME[k] ?? k)}</option>)}
          </select></label>
      </div>
      {rows.map((r, i) => (
        <div class="sx-form">
          <label class="inline-field"><span class="field-label">{t('Good')}</span>
            <select class="select" value={r.good} onChange={(e) => setRow(i, { good: (e.target as HTMLSelectElement).value as Good })}>
              {GOODS.filter((g) => held(g) > 0 || g === r.good).map((g) => <option value={g}>{goodName(g)} ({int(held(g))})</option>)}
            </select></label>
          <label class="inline-field"><span class="field-label">{t('Amount')}</span><NumInput value={r.amount} min={0} max={Math.max(1, held(r.good))} step={100} onChange={(v) => setRow(i, { amount: v })} label={t('Amount')} width={96} /></label>
          {rows.length > 1 ? <Btn small icon="minus" onClick={() => setRows(rows.filter((_, k) => k !== i))} title={t('Remove this line')} /> : null}
        </div>
      ))}
      <div class="form-actions">
        <Btn small icon="plus" onClick={() => setRows([...rows, { good: 'metal', amount: 1000 }])}>{t('Add a good')}</Btn>
        <label class="inline-field"><span class="field-label">{t('Settlers')}</span><NumInput value={people} min={0} max={100000} step={100} onChange={setPeople} label={t('Settlers')} width={84} /></label>
      </div>
      <p class="note">{t('Load: {n}.', { n: tonnes(payload) })}{from === 'earth_orbit' ? ' ' + (best ? t('About {n} of boost, {m} months in flight.', { n: tonnes(boostT), m: best.months }) : t('No propulsion family this seat flies reaches that destination with this load')) : ''}</p>
      <div class="form-actions">
        <Btn kind="primary" icon="right" disabled={s.busy} why={why} testid="space-ship" onClick={() => void order({ op: 'ship', from_zone: from === 'earth_orbit' ? null : from, to_zone: to, goods, people, site: siteSel || null, propulsion: prop || null }, 'space-ship')}>{t('Order the shipment')}</Btn>
        {why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="space-ship" />
    </Section>
  );
}
