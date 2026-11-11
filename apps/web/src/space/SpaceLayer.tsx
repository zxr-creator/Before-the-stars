// The Solar System layer of the map: the planet's globe, Earth orbit and the whole system, on
// the 3D tier (three.js) or the flat chart (Canvas 2D). MapView opens it when the player zooms
// out past the whole planet or uses the scale switch. Everything shown is public astronomy and
// fixed content, plus what the observation's optional `space` fields report (design chapters 37
// and 39); with none of those fields every site is shown unclaimed and unsurveyed.
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Observation } from '../protocol';
import { DEPOSIT_LABEL, fmtNow, int, peopleNum, range, tonnes } from '../format';
import { t, tc, useLocale } from '../i18n';
import { BODIES, BODY, MOONS_OF, periodYears, type BodyId } from './astro';
import { bodyKnown, readSpace, type SiteState } from './adapter';
import {
  KIND_LABEL, ORBITS, ORBIT_BY_KEY, ORBITS_AT, SITES_ON, SITE_BY_KEY, WINDOWS, ZONE_LABEL, crewStage, type OrbitDef, type SiteDef,
} from './catalog';
import { SpaceController, niceDistance, type Insets, type Selection, type SwitchBand } from './controller';
import type { OrreryRenderer } from './frame';
import { SpaceGlyph } from './icons';
import type { Band } from './layout';
import { Orrery2D } from './orrery2d';
import './space.css';

export type { SwitchBand } from './controller';
export interface SpaceEntry {
  band: Band;
  /** Longitude and latitude (radians) of the home-world point the globe should face. */
  lon: number;
  lat: number;
  /** True when arriving from the planet map (the view pulls back from the surface). */
  fromPlanet: boolean;
  nonce: number;
}

declare global {
  interface Window {
    /** The Solar System view, for the dev harness and screenshot scripts. */
    __space?: {
      band(): SwitchBand | null;
      dist(): number;
      focus(id: string, dist?: number): void;
      goBand(b: Band): void;
      select(kind: 'site' | 'orbit' | 'body', key: string): void;
      settle(): void;
      lastDrawMs(): number;
      tier(): string;
    };
  }
}

// i18n-fields
const BODY_KIND: Record<string, string> = {
  star: 'Star', planet: 'Planet', dwarf: 'Dwarf planet', asteroid: 'Asteroid', moon: 'Natural satellite', cluster: 'Asteroid group',
};
// i18n-end

// --- the scale switch (rendered by MapView above both the planet and the space layer) ----------

export type ScaleChoice = 'planet' | SwitchBand;

export function ScaleSwitch({ value, onChoose }: { value: ScaleChoice; onChoose(v: ScaleChoice): void }): JSX.Element {
  const opts: { v: ScaleChoice; label: string; hint: string; glyph: string }[] = [
    { v: 'planet', label: t('Planet'), hint: t('The home world map'), glyph: 'home' },
    { v: 'orbit', label: t('Earth orbit'), hint: t('The globe, the Moon and the near orbits (Page Up / Page Down step between scales)'), glyph: 'orbit' },
    { v: 'system', label: t('Solar System'), hint: t('The Sun, the planets, their moons and the off-world sites'), glyph: 'system' },
  ];
  return (
    <div class="sp-scales" role="radiogroup" aria-label={t('Map scale')} data-testid="map-scale">
      {opts.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.v} class={'sp-scale' + (value === o.v ? ' is-on' : '')}
          data-testid={`map-scale-${o.v}`} title={o.hint} onClick={() => onChoose(o.v)}>
          <SpaceGlyph name={o.glyph} size={15} /><span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// --- cards ---------------------------------------------------------------------------------------

function pctOfEarth(bp: number): string {
  return t('{p}% of the Earth’s', { p: int(Math.round(bp / 100)) });
}

function envLine(s: SiteDef): string {
  if (s.mortalityBp === null) return t('Uninhabitable');
  const extra = Math.round((s.mortalityBp - 10000) / 100);
  return extra > 0 ? t('Deaths {p}% above Earth rates', { p: int(extra) }) : t('Deaths as on the Earth');
}

function monthsText(n: number): string {
  return n === 1 ? t('about a month') : n < 24 ? t('about {n} months', { n: int(n) }) : t('about {n} years', { n: int(Math.round(n / 12)) });
}

function ReachList({ s, windows }: { s: SiteDef; windows: Record<string, { open: boolean; opens_in: number }> }): JSX.Element {
  const r = s.reach;
  const w = WINDOWS[s.zone];
  const live = windows[s.zone];
  const stage = crewStage(r);
  return (
    <ul class="sp-reach">
      <li>{t('Requires orbital launch capability (Space era).')}</li>
      {r.uncrewed ? <li class="sp-warn">{t('Only uncrewed works can operate here.')}</li> : null}
      <li>
        {r.first === null
          ? t('Out of reach of the first orbital rockets.')
          : r.firstCargoOnly
            ? t('First orbital rockets: cargo only, {m} each way, at great cost.', { m: monthsText(r.first) })
            : t('First orbital rockets: {m} each way.', { m: monthsText(r.first) })}
      </li>
      {r.advanced !== null && (r.first === null || r.advanced < r.first || r.firstCargoOnly)
        ? <li>{t('Advanced propulsion (late Space era or after): {m}.', { m: monthsText(r.advanced) })}</li> : null}
      {r.late < (r.advanced ?? Infinity) ? <li>{t('The most advanced propulsion of the age: {m}.', { m: monthsText(r.late) })}</li> : null}
      <li>
        {w.synodic === null
          ? t('Departures: any month.')
          : w.window === 1 ? t('Departure window: one month in every {s} for ordinary rockets.', { s: int(w.synodic) }) : t('Departure window: {w} months in every {s} for ordinary rockets.', { w: int(w.window!), s: int(w.synodic) })}
        {live ? ' ' + (live.open ? t('Open now.') : t('Opens in {n}.', { n: monthsText(live.opens_in) })) : ''}
      </li>
      <li class="sp-muted">{stage === 'first' ? t('Crews can go with the first orbital rockets.') : stage === 'advanced' ? t('Crews need advanced propulsion.') : t('Crews need the most advanced propulsion.')}</li>
    </ul>
  );
}

function Owner({ c, seat, obs }: { c: SpaceController; seat: number | null; obs: Observation }): JSX.Element {
  if (seat == null) return <span class="sp-muted">{t('Unclaimed')}</span>;
  const name = seat === obs.seat ? tc(obs.civ.name) : tc(obs.others.find((o) => o.seat === seat)?.name ?? t('Unknown polity'));
  return <span><i class="sp-chip" style={{ background: c.colorOf(seat) ?? '#8a8070' }} />{name}</span>;
}

function SiteCard({ st, c, obs, live, windows, onClose, onBody }: { st: SiteState; c: SpaceController; obs: Observation; live: boolean; windows: Record<string, { open: boolean; opens_in: number }>; onClose(): void; onBody(id: BodyId): void }): JSX.Element {
  const s = st.def, v = st.view;
  const occupied = st.controller != null && st.controller !== st.owner;
  return (
    <div class="sp-card" role="dialog" aria-label={t(s.name)} data-testid="space-card" data-site={s.key}>
      <div class="sp-card-head">
        <span class={'sp-card-icon kind-' + s.kind}><SpaceGlyph name={s.kind} size={22} /></span>
        <div>
          <div class="sp-card-title">{t(s.name)}</div>
          <div class="sp-card-sub">{t(KIND_LABEL[s.kind])} · <button type="button" class="sp-link" onClick={() => onBody(s.body)}>{t(BODY[s.body].name)}</button></div>
        </div>
        <button type="button" class="sp-close" aria-label={t('Close')} title={t('Close (Esc)')} onClick={onClose}>×</button>
      </div>
      <div class="sp-row"><span>{t('Held by')}</span><b><Owner c={c} seat={st.owner} obs={obs} /></b></div>
      {occupied ? <div class="sp-row sp-warn"><span>{t('Occupied by')}</span><b><Owner c={c} seat={st.controller} obs={obs} /></b></div> : null}
      {v?.population != null ? <div class="sp-row"><span>{t('Residents')}</span><b>{peopleNum(v.population)}{v.housing ? <small> / {peopleNum(v.housing)}</small> : null}</b></div>
        : v?.population_low != null && v.population_high != null ? <div class="sp-row"><span>{t('Residents')}</span><b class="sp-est">{range(v.population_low, v.population_high)}</b></div> : null}
      {v?.works?.length ? <div class="sp-row sp-block"><span>{t('Works')}</span><b>{v.works.map((w) => `${tc(w.kind)} ${w.level}`).join(', ')}</b></div> : null}
      {!live ? <p class="sp-note">{t('No off-world reports yet: nobody has reached this site.')}</p> : null}
      <h4>{t('What it offers')}</h4>
      <p>{t(s.speciality)}</p>
      {st.surveyed && v?.deposits?.length ? (
        <div class="sp-tags">{v.deposits.map((d) => <span class="sp-tag">{(DEPOSIT_LABEL as Record<string, string>)[d.kind] ? t(DEPOSIT_LABEL[d.kind]) : tc(d.kind)} · {tonnes(d.remaining)}</span>)}</div>
      ) : s.prospects.length ? (
        <>
          <div class="sp-tags">{s.prospects.map((p) => <span class="sp-tag">{t(p)}</span>)}</div>
          <p class="sp-muted">{t('Prospects from observation; amounts are known only after a survey mission.')}</p>
        </>
      ) : null}
      <h4>{t('Living there')}</h4>
      <div class="sp-row"><span>{t('Room for')}</span><b>{s.housing > 0 ? t('up to {n} residents', { n: peopleNum(s.housing) }) : t('no residents')}</b></div>
      <div class="sp-row"><span>{t('Gravity')}</span><b>{s.gravity >= 0.01 ? t('{g} g', { g: s.gravity.toFixed(2) }) : t('almost none')}</b></div>
      <div class="sp-row"><span>{t('Health')}</span><b>{envLine(s)}</b></div>
      <div class="sp-row"><span>{t('Sunlight')}</span><b>{pctOfEarth(s.solarBp)}</b></div>
      <p class="sp-muted">{t(s.environment)}</p>
      <h4>{t('Reaching it')}</h4>
      <ReachList s={s} windows={windows} />
    </div>
  );
}

function OrbitCard({ o, c, obs, onClose, onBody }: { o: OrbitDef; c: SpaceController; obs: Observation; onClose(): void; onBody(id: BodyId): void }): JSX.Element {
  const stations = c.state?.stations[o.key] ?? [];
  return (
    <div class="sp-card" role="dialog" aria-label={t(o.name)} data-testid="space-card" data-orbit={o.key}>
      <div class="sp-card-head">
        <span class="sp-card-icon kind-orbit"><SpaceGlyph name="station" size={22} /></span>
        <div>
          <div class="sp-card-title">{t(o.name)}</div>
          <div class="sp-card-sub">{t('Station orbit')} · <button type="button" class="sp-link" onClick={() => onBody(o.body)}>{t(BODY[o.body].name)}</button> · {t(ZONE_LABEL[o.zone])}</div>
        </div>
        <button type="button" class="sp-close" aria-label={t('Close')} title={t('Close (Esc)')} onClick={onClose}>×</button>
      </div>
      <h4>{t('What it offers')}</h4>
      <p>{t(o.speciality)}</p>
      <h4>{t('Reaching it')}</h4>
      <ul class="sp-reach">
        <li>{t('Requires orbital launch capability (Space era).')}</li>
        <li>{t(o.placement)}</li>
        <li class="sp-muted">{t('One station per realm in each orbit; it grows module by module.')}</li>
      </ul>
      <h4>{t('Stations')}</h4>
      {stations.length ? (
        <ul class="sp-stations">
          {stations.map((s) => (
            <li>
              <Owner c={c} seat={s.owner} obs={obs} />
              {s.core ? <em> · {t('core {k}', { k: s.core })}</em> : null}
              {s.aboard != null ? <em> · {t('{n} aboard', { n: peopleNum(s.aboard) })}</em> : null}
              {s.modules?.length ? <div class="sp-muted">{s.modules.map((m) => tc(m.kind) + (m.level ? ` ${m.level}` : '')).join(', ')}</div> : null}
            </li>
          ))}
        </ul>
      ) : <p class="sp-muted">{t('No stations reported here.')}</p>}
    </div>
  );
}

function BodyCard({ id, c, onClose, onSelect }: { id: BodyId; c: SpaceController; onClose(): void; onSelect(s: Selection): void }): JSX.Element {
  const b = BODY[id];
  const rAU = c.rAU(id);
  const yr = periodYears(b);
  const sites = [...(SITES_ON[id] ?? []), ...(MOONS_OF[id] ?? []).flatMap((m) => SITES_ON[m] ?? [])];
  const orbits = [...(ORBITS_AT[id] ?? []), ...(MOONS_OF[id] ?? []).flatMap((m) => ORBITS_AT[m] ?? [])];
  return (
    <div class="sp-card" role="dialog" aria-label={t(b.name)} data-testid="space-card" data-body={id}>
      <div class="sp-card-head">
        <span class="sp-card-dot" style={{ background: b.color }} />
        <div>
          <div class="sp-card-title">{t(b.name)}</div>
          <div class="sp-card-sub">{t(BODY_KIND[b.kind])}{b.parent ? <> · {t('moon of {p}', { p: t(BODY[b.parent].name) })}</> : null}</div>
        </div>
        <button type="button" class="sp-close" aria-label={t('Close')} title={t('Close (Esc)')} onClick={onClose}>×</button>
      </div>
      {id === 'earth' ? <p>{t('The home world. Zoom in, or press Home, to return to its map.')}</p> : null}
      {id !== 'sun' && rAU > 0 ? <div class="sp-row"><span>{t('From the Sun now')}</span><b>{t('{n} AU', { n: rAU.toFixed(2) })}</b></div> : null}
      {yr && id !== 'earth' ? <div class="sp-row"><span>{t('Year')}</span><b>{yr < 2 ? t('{n} days', { n: int(Math.round(yr * 365.25)) }) : t('{n} Earth years', { n: yr.toFixed(1) })}</b></div> : null}
      {b.gravity != null && id !== 'earth' ? <div class="sp-row"><span>{t('Gravity')}</span><b>{t('{g} g', { g: b.gravity.toFixed(2) })}</b></div> : null}
      {id !== 'sun' && rAU > 0 && id !== 'earth' ? <div class="sp-row"><span>{t('Sunlight')}</span><b>{pctOfEarth(10000 / (rAU * rAU))}</b></div> : null}
      {sites.length ? (
        <>
          <h4>{t('Sites')}</h4>
          <ul class="sp-list">
            {sites.map((s) => (
              <li><button type="button" class="sp-link" onClick={() => onSelect({ kind: 'site', key: s.key })}>
                <span class={'sp-mini kind-' + s.kind}><SpaceGlyph name={s.kind} size={13} /></span>{t(s.name)}
              </button><span class="sp-muted"> · {t(KIND_LABEL[s.kind])}</span></li>
            ))}
          </ul>
        </>
      ) : null}
      {orbits.length ? (
        <>
          <h4>{t('Station orbits')}</h4>
          <ul class="sp-list">
            {orbits.map((o) => <li><button type="button" class="sp-link" onClick={() => onSelect({ kind: 'orbit', key: o.key })}>{t(o.name)}</button></li>)}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Legend({ hasStations, hasTransfers }: { hasStations: boolean; hasTransfers: boolean }): JSX.Element {
  return (
    <div class="sp-legend" data-testid="space-legend">
      <div class="sp-legend-head">{t('Off-world sites')}</div>
      <ul>
        {(['hub', 'colony', 'mining', 'extraction', 'research'] as const).map((k) => (
          <li><span class={'sp-mini kind-' + k}><SpaceGlyph name={k} size={13} /></span>{t(KIND_LABEL[k])}</li>
        ))}
        <li><span class="sp-ring-key is-free" />{t('Unclaimed (dashed rim)')}</li>
        <li><span class="sp-ring-key is-held" />{t('Held: rim in the holder’s colour')}</li>
        <li><span class="sp-orbit-key" />{t('Station orbit')}{hasStations ? '' : ' · ' + t('none reported')}</li>
        {hasTransfers ? <li><span class="sp-arc-key" />{t('Shipment in flight')}</li> : null}
      </ul>
      <p class="sp-legend-note">{t('Directions are true for the date; distances are logarithmic and sizes exaggerated so that everything fits.')}</p>
    </div>
  );
}

// --- the layer -----------------------------------------------------------------------------------

export interface SpaceLayerProps {
  obs: Observation;
  tier: '3d' | 'flat';
  entry: SpaceEntry;
  /** Changes when the player asks to go back to the planet. */
  home: number;
  insets: Insets;
  reducedMotion: boolean;
  onExit(face: { lon: number; lat: number; moved: boolean }): void;
  onSwitchBand(b: SwitchBand): void;
  onTier(t: '3d' | 'flat'): void;
}

export function SpaceLayer(props: SpaceLayerProps): JSX.Element {
  const { obs } = props;
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const ctlRef = useRef<SpaceController | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [legend, setLegend] = useState<boolean | null>(null);
  const [failed3d, setFailed3d] = useState(false);
  const [rkind, setRkind] = useState<'3d' | 'flat' | null>(null);
  const live = useRef(props);
  live.current = props;
  const kind: '3d' | 'flat' = props.tier === '3d' && !failed3d ? '3d' : 'flat';
  const space = useMemo(() => readSpace(obs), [obs]);
  const roomy = typeof window === 'undefined' ? true : window.innerWidth - props.insets.left - props.insets.right >= 980;
  const legendOpen = legend ?? (roomy && !sel);

  // The controller lives as long as the layer.
  useLayoutEffect(() => {
    const root = rootRef.current!, overlay = overlayRef.current!;
    const ctl = new SpaceController(root, overlay, {
      onSwitchBand: (b) => live.current.onSwitchBand(b),
      onExit: (f) => live.current.onExit(f),
      onPick: (s) => { ctl.selection = s; setSel(s); },
    });
    ctlRef.current = ctl;
    ctl.setReducedMotion(live.current.reducedMotion);
    ctl.setInsets(live.current.insets);
    ctl.setData(live.current.obs);
    const ro = new ResizeObserver(() => ctl.resize());
    ro.observe(root);
    window.__space = {
      band: () => (ctl.cur.focus === 'earth' || ctl.cur.focus === 'moon') && ctl.cur.dist < 180 ? 'orbit' : 'system',
      dist: () => ctl.cur.dist,
      focus: (id, d) => ctl.focus(id as BodyId, d ?? (id === 'sun' ? undefined : niceDistance(id as BodyId))),
      goBand: (b) => ctl.goBand(b),
      select: (k, key) => {
        const s = (k === 'body' ? { kind: k, id: key as BodyId } : { kind: k, key }) as Selection;
        ctl.selection = s;
        setSel(s);
      },
      settle: () => ctl.drawNow(),
      lastDrawMs: () => ctl.lastFrameMs,
      tier: () => (ctl as unknown as { renderer: OrreryRenderer | null }).renderer?.kind ?? 'none',
    };
    return () => {
      ro.disconnect();
      ctl.destroy();
      ctlRef.current = null;
      delete window.__space;
    };
  }, []);

  // The renderer follows the tier; WebGL failure falls back to the flat chart.
  useEffect(() => {
    const ctl = ctlRef.current, canvas = canvasRef.current;
    if (!ctl || !canvas) return;
    let alive = true;
    let r: OrreryRenderer | null = null;
    let unbind: (() => void) | null = null;
    const attach = (x: OrreryRenderer) => {
      r = x;
      ctl.setRenderer(x);
      unbind = ctl.bind(canvas);
      setRkind(x.kind);
    };
    if (kind === '3d') {
      import('./orrery3d').then((m) => {
        if (!alive) return;
        try {
          const o = new m.Orrery3D(canvas);
          o.onContextLost = () => setFailed3d(true);
          attach(o);
        } catch (e) {
          console.warn('WebGL is unavailable; showing the flat Solar System chart.', e);
          setFailed3d(true);
        }
      }, (e) => { console.warn('The 3D Solar System could not be loaded.', e); if (alive) setFailed3d(true); });
    } else {
      attach(new Orrery2D(canvas));
    }
    return () => {
      alive = false;
      unbind?.();
      ctl.setRenderer(null);
      (r as OrreryRenderer | null)?.destroy();
    };
  }, [kind]);

  // Enter (or re-target) the view whenever MapView asks; a change of renderer keeps the camera.
  const seenNonce = useRef(-1);
  useEffect(() => {
    const ctl = ctlRef.current;
    if (!ctl) return;
    const e = props.entry;
    if (seenNonce.current !== e.nonce) {
      const first = seenNonce.current < 0;
      seenNonce.current = e.nonce;
      if (e.fromPlanet || first) ctl.enter(e.band, e.lon, e.lat, e.fromPlanet);
      else ctl.goBand(e.band);
      rootRef.current?.classList.remove('is-leaving');
    }
    canvasRef.current?.focus({ preventScroll: true });
  }, [props.entry.nonce, rkind]);

  const home0 = useRef(props.home);
  useEffect(() => { if (props.home !== home0.current) ctlRef.current?.goHome(); }, [props.home]);
  useEffect(() => { ctlRef.current?.setData(obs); }, [obs]);
  // An open card on a wide screen shifts the picture left so the followed body stays in view.
  const cardInset = sel && typeof window !== 'undefined' && window.innerWidth - props.insets.left - props.insets.right >= 900 ? 354 : 0;
  useEffect(() => {
    ctlRef.current?.setInsets({ ...props.insets, right: props.insets.right + cardInset });
  }, [props.insets.left, props.insets.right, props.insets.top, props.insets.bottom, cardInset]);
  useEffect(() => { ctlRef.current?.setReducedMotion(props.reducedMotion); }, [props.reducedMotion]);
  useLayoutEffect(() => { ctlRef.current?.collect(); });
  useEffect(() => { ctlRef.current?.remeasure(); }, [locale]);
  useEffect(() => {
    const ctl = ctlRef.current;
    if (ctl) { ctl.selection = sel; ctl.invalidate(); }
  }, [sel]);

  // Esc closes the card (only while one is open, so the game's own Esc keeps working).
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setSel(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sel]);

  const ctl = ctlRef.current;
  const select = (s: Selection) => {
    if (!ctl) return;
    const body = s.kind === 'body' ? s.id : s.kind === 'site' ? SITE_BY_KEY[s.key]?.body : ORBIT_BY_KEY[s.key]?.body;
    if (body && (ctl.goal.focus !== body)) ctl.focus(body, body === 'earth' && s.kind === 'orbit' ? 34 : undefined);
    setSel(s);
  };
  const focusBody = (id: BodyId) => {
    if (!ctl) return;
    ctl.focus(id, id === 'sun' ? undefined : niceDistance(id));
    setSel({ kind: 'body', id });
  };
  const known = (id: BodyId) => bodyKnown(space, id);
  const aggHosts = [...new Set([...Object.keys(SITES_ON), ...Object.keys(MOONS_OF)])] as BodyId[];
  const hasStations = Object.keys(space.stations).length > 0;
  const i = props.insets;
  const style = { '--mi-l': i.left + 'px', '--mi-r': i.right + 'px', '--mi-t': i.top + 'px', '--mi-b': i.bottom + 'px' } as JSX.CSSProperties;

  return (
    <div ref={rootRef} class={'sp-layer' + (props.entry.fromPlanet ? ' is-entering' : '')} style={style} data-tier={kind} data-testid="space-layer" key="space">
      <canvas key={kind} ref={canvasRef} class="sp-canvas" data-testid="space-canvas" tabIndex={0} role="application"
        aria-label={t('Solar System map. Arrow keys pan, plus and minus zoom, Page Up and Page Down change scale, Home returns to the planet.')} />
      <div ref={overlayRef} class="sp-overlay">
        <div class="sp-sel" data-k="sel" aria-hidden="true" />
        {BODIES.filter((b) => known(b.id)).map((b) => (
          <button type="button" class={'sp-label sp-label-' + b.kind + (sel?.kind === 'body' && sel.id === b.id ? ' is-sel' : '')} data-k={'b:' + b.id}
            data-testid={`space-body-${b.id}`} onClick={() => focusBody(b.id)}>{t(b.name)}</button>
        ))}
        {space.sites.filter((s) => known(s.def.body)).map((s) => {
          const col = ctl?.colorOf(s.controller ?? s.owner) ?? null;
          return (
            <button type="button" class={'sp-site kind-' + s.def.kind + (col ? ' is-held' : ' is-free') + (sel?.kind === 'site' && sel.key === s.def.key ? ' is-sel' : '')}
              data-k={'s:' + s.def.key} data-testid={`space-site-${s.def.key}`} style={col ? ({ '--own': col } as JSX.CSSProperties) : undefined}
              title={`${t(s.def.name)} · ${t(KIND_LABEL[s.def.kind])}`} onClick={() => select({ kind: 'site', key: s.def.key })}>
              <span class="sp-site-disc"><SpaceGlyph name={s.def.kind} size={14} /></span>
              <span class="sp-site-name">{t(s.def.name)}</span>
            </button>
          );
        })}
        {aggHosts.filter(known).map((id) => (
          <button type="button" class="sp-agg" data-k={'a:' + id} title={t('Off-world sites here: zoom in to see them')} onClick={() => focusBody(id)}>
            <SpaceGlyph name="hub" size={11} /><b>0</b>
          </button>
        ))}
        {ORBITS.filter((o) => known(o.body)).map((o) => {
          const st = space.stations[o.key] ?? [];
          return (
            <button type="button" class={'sp-orbit' + (st.length ? ' has-stations' : '') + (sel?.kind === 'orbit' && sel.key === o.key ? ' is-sel' : '')} data-k={'o:' + o.key}
              data-testid={`space-orbit-${o.key}`} title={t(o.name)} onClick={() => select({ kind: 'orbit', key: o.key })}>
              <i class="sp-diamond" />
              <span class="sp-orbit-name">{t(o.short)}</span>
              {st.slice(0, 4).map((s) => <i class="sp-station-dot" style={{ background: ctl?.colorOf(s.owner) ?? '#ccc' }} />)}
            </button>
          );
        })}
      </div>

      <div class="sp-caption" data-testid="space-caption">
        {t('Positions for {date}', { date: fmtNow(obs) })}
      </div>

      {sel && ctl ? (
        <div class="sp-card-wrap">
          {sel.kind === 'site' && space.siteByKey[sel.key] ? (
            <SiteCard st={space.siteByKey[sel.key]} c={ctl} obs={obs} live={space.live} windows={space.windows} onClose={() => setSel(null)} onBody={focusBody} />
          ) : sel.kind === 'orbit' && ORBIT_BY_KEY[sel.key] ? (
            <OrbitCard o={ORBIT_BY_KEY[sel.key]} c={ctl} obs={obs} onClose={() => setSel(null)} onBody={focusBody} />
          ) : sel.kind === 'body' ? (
            <BodyCard id={sel.id} c={ctl} onClose={() => setSel(null)} onSelect={select} />
          ) : null}
        </div>
      ) : null}

      <div class="sp-controls">
        <div class="sp-zoom" role="group" aria-label={t('Zoom')}>
          <button type="button" class="sp-btn" data-testid="space-zoom-in" title={t('Zoom in (+)')} aria-label={t('Zoom in')} onClick={() => ctl?.zoomBy(1.5)}>+</button>
          <button type="button" class="sp-btn" data-testid="space-zoom-out" title={t('Zoom out (−)')} aria-label={t('Zoom out')} onClick={() => ctl?.zoomBy(1 / 1.5)}>−</button>
          <button type="button" class="sp-btn" data-testid="space-home" title={t('Back to the home planet (Home)')} aria-label={t('Back to the home planet')} onClick={() => ctl?.goHome()}><SpaceGlyph name="home" size={15} /></button>
        </div>
        <div class="sp-modes">
          <button type="button" class={'sp-mode' + (legendOpen ? ' is-on' : '')} aria-pressed={legendOpen} data-testid="space-legend-toggle" onClick={() => setLegend(!legendOpen)}>{t('Legend')}</button>
          <button type="button" class={'sp-mode' + (kind === '3d' ? ' is-on' : '')} aria-pressed={kind === '3d'} data-testid="space-tier-3d" title={t('Living 3D map')} onClick={() => { setFailed3d(false); props.onTier('3d'); }}>{t('3D')}</button>
          <button type="button" class={'sp-mode' + (kind === 'flat' ? ' is-on' : '')} aria-pressed={kind === 'flat'} data-testid="space-tier-flat" title={t('Flat chart: the same information, lighter to draw')} onClick={() => props.onTier('flat')}>{t('Flat')}</button>
        </div>
        {legendOpen ? <Legend hasStations={hasStations} hasTransfers={space.transfers.length > 0} /> : null}
        {failed3d && props.tier === '3d' ? <div class="sp-note-bar" role="status">{t('The 3D map is unavailable on this device; showing the flat chart.')}</div> : null}
      </div>
    </div>
  );
}

