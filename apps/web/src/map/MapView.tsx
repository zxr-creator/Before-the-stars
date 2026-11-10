// Preact wrapper around the Atlas canvas renderer: pointer and keyboard handling,
// hover tooltip, map-mode toggle with legend, zoom controls and the pick banner.
// Everything shown is derived from the seat's Observation and nothing else.
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Deposit, Observation, RegionId, RegionView, Terrain } from '../protocol';
import {
  DEPOSIT_LABEL, EPISTEMIC_LABEL, SETTLEMENT_LABEL, TERRAIN_LABEL, VIS_LABEL, fmtDate, fmtDateShort, int, range,
} from '../format';
import {
  Atlas, DEPOSIT_COLOR, POP_RAMP, TERRAIN_TINT,
  type AtlasData, type FacilityIcon, type Insets, type MapMode,
} from './atlas';
import './map.css';

export type { MapMode } from './atlas';

export interface MapPick {
  prompt: string;
  /** Valid targets; `null` = any known region. */
  targets: RegionId[] | null;
  onPick(id: RegionId): void;
  onCancel(): void;
}

export interface MapViewProps {
  obs: Observation;
  selected: RegionId | null;
  /** Click on a region, or `null` when blank paper is clicked. */
  onSelect(id: RegionId | null): void;
  pick?: MapPick | null;
  marked?: RegionId[];
  /** Centre on a region whenever `nonce` changes. */
  focus?: { region: RegionId; nonce: number } | null;
  /** Pixels of the canvas covered by UI chrome on each side. */
  insets?: Insets;
  /** Optional controlled map mode. Uncontrolled (internal state) when omitted. */
  mode?: MapMode;
  onModeChange?(mode: MapMode): void;
}

declare global {
  interface Window {
    __atlas?: {
      /** Viewport (client) coordinates of a known region's centre, or null. */
      regionScreenCenter(id: number): [number, number] | null;
      zoom(): number;
      /** Known region under a viewport point, or null. */
      regionAt(clientX: number, clientY: number): number | null;
      mode(): MapMode;
      lastDrawMs(): number;
    };
  }
}

const MODES: { key: MapMode; label: string; hint: string }[] = [
  { key: 'political', label: 'Political', hint: 'Who governs what' },
  { key: 'terrain', label: 'Terrain', hint: 'Landforms, rivers and passes' },
  { key: 'resources', label: 'Resources', hint: 'Deposits and survey coverage' },
  { key: 'population', label: 'Population', hint: 'People per region' },
];
const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
const NO_MARKS: RegionId[] = [];

/** Tolerant mapping from a facility to a map pictogram. */
export function facilityIcon(kind: string, category?: string, name?: string): FacilityIcon | null {
  const k = kind.toLowerCase();
  const c = (category ?? '').toLowerCase();
  const n = (name ?? '').toLowerCase();
  if (k.startsWith('jump') || c.includes('jump') || k.includes('ftl')) return 'jump';
  if (c.includes('space') || k.includes('launch') || k.includes('orbital')) return 'launch';
  if (k === 'port' || k.includes('harbo') || n.includes('harbour') || n.includes('harbor') || k.includes('dock')) return 'port';
  if (c.includes('power') || c.includes('energy')) return 'power';
  if (c.includes('research') || k.includes('lab') || k.includes('institute') && !k.includes('tech_')) return 'lab';
  if (c.includes('education') || k.includes('school') || k.includes('college') || k.includes('lodge')) return 'school';
  if (k.startsWith('mine') || k.includes('well') && c.includes('extract') || k.includes('pit')) return 'mine';
  if (c.includes('industry') || c.includes('manufact')) {
    return /workshop|kiln|press|instrument/.test(k) ? 'workshop' : 'industry';
  }
  return null;
}

function buildData(obs: Observation): AtlasData {
  const seatColors: Record<number, string> = { [obs.seat]: obs.civ.color };
  for (const o of obs.others) seatColors[o.seat] = o.color;
  const facilityIcons: Record<string, FacilityIcon> = {};
  const cat = new Map(obs.catalog.facilities.map((f) => [f.kind, f]));
  for (const r of obs.regions) {
    if (!r.own) continue;
    for (const f of r.own.facilities) {
      if (f.kind in facilityIcons) continue;
      const t = cat.get(f.kind);
      const ic = facilityIcon(f.kind, t?.category, t?.name ?? f.name);
      if (ic) facilityIcons[f.kind] = ic;
    }
  }
  return {
    world: obs.world,
    regions: obs.regions,
    mySeat: obs.seat,
    seatColors,
    capital: obs.civ.capital,
    armies: obs.armies,
    foreignArmies: obs.foreign_armies,
    month: obs.month,
    facilityIcons,
  };
}

function seatName(obs: Observation, seat: number | null): string | null {
  if (seat == null) return null;
  if (seat === obs.seat) return obs.civ.name;
  return obs.others.find((o) => o.seat === seat)?.name ?? 'Unknown polity';
}
function seatColor(obs: Observation, seat: number | null): string {
  if (seat == null) return '#6b6257';
  if (seat === obs.seat) return obs.civ.color;
  return obs.others.find((o) => o.seat === seat)?.color ?? '#6b6257';
}

// --- small inline icons ----------------------------------------------------------

const IconPlus = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
);
const IconMinus = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
);
const IconFit = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.500 6V2.500H6M10 2.500h3.500V6M13.500 10v3.500H10M6 13.500H2.500V10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
);
const IconLegend = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4h2M3 8h2M3 12h2M7.500 4H13M7.500 8H13M7.500 12H13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
);

function Compass(): JSX.Element {
  return (
    <svg class="map-compass" viewBox="-40 -44 80 88" width="64" height="70" aria-hidden="true">
      <circle r="27" fill="none" stroke="currentColor" stroke-width="0.8" />
      <circle r="23" fill="none" stroke="currentColor" stroke-width="0.4" stroke-dasharray="1 3" />
      <path d="M0-30 5 0 0 30-5 0Z" fill="none" stroke="currentColor" stroke-width="0.9" />
      <path d="M0-30 5 0H-5Z" fill="currentColor" />
      <path d="M-30 0 0-5 30 0 0 5Z" fill="none" stroke="currentColor" stroke-width="0.7" />
      <path d="M-15-15 0-3.500 15-15 3.500 0 15 15 0 3.500-15 15-3.500 0Z" fill="none" stroke="currentColor" stroke-width="0.4" />
      <text y="-33" text-anchor="middle" font-size="9" fill="currentColor">N</text>
    </svg>
  );
}

function DepositSwatch({ kind, verified = true }: { kind: Deposit; verified?: boolean }): JSX.Element {
  const c = DEPOSIT_COLOR[kind];
  const common = verified
    ? { fill: c, stroke: '#2b2620', 'stroke-width': 1 }
    : { fill: '#f7f1e1', stroke: c, 'stroke-width': 1.6, 'stroke-dasharray': '0.1 2.6', 'stroke-linecap': 'round' as const };
  let shape: JSX.Element;
  switch (kind) {
    case 'copper_ore': shape = <circle cx="8" cy="8" r="5" {...common} />; break;
    case 'iron_ore': shape = <rect x="3.500" y="3.500" width="9" height="9" {...common} />; break;
    case 'coal': shape = <path d="M8 2.200 13.800 8 8 13.800 2.200 8Z" {...common} />; break;
    case 'crude': shape = <path d="M8 1.800C15 9 12 13.500 8 13.500S1 9 8 1.800Z" {...common} />; break;
    default: shape = <path d="M8 2.500 12.800 5.250V10.750L8 13.500 3.200 10.750V5.250Z" {...common} />; break;
  }
  return <svg class="map-swatch" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">{shape}</svg>;
}

function HatchSwatch({ color, dir = 1, bg = '#e4dccb', dotted = false }: { color: string; dir?: 1 | -1; bg?: string; dotted?: boolean }): JSX.Element {
  const lines = [];
  for (let i = -16; i < 32; i += 4.5) {
    lines.push(dir > 0 ? <path d={`M${i} 14 L${i + 14} 0`} /> : <path d={`M${i} 0 L${i + 14} 14`} />);
  }
  return (
    <svg class="map-swatch map-swatch-wide" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">
      <rect width="22" height="14" fill={bg} />
      <g stroke={color} stroke-width="1.1">{lines}</g>
      <rect x="0.500" y="0.500" width="21" height="13" fill="none" stroke="#5a5044" stroke-width="1" stroke-dasharray={dotted ? '0.1 2.6' : undefined} stroke-linecap="round" />
    </svg>
  );
}

function LineSwatch({ color, dash, width = 1.6, notched = false }: { color: string; dash?: string; width?: number; notched?: boolean }): JSX.Element {
  return (
    <svg class="map-swatch map-swatch-wide" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">
      <path d="M1 7H21" fill="none" stroke={color} stroke-width={width} stroke-dasharray={dash} stroke-linecap="round" />
      {notched && <path d="M6 4v6M11 4v6M16 4v6" stroke={color} stroke-width="1.3" />}
    </svg>
  );
}

function Legend({ obs, mode }: { obs: Observation; mode: MapMode }): JSX.Element {
  const rows: JSX.Element[] = [];
  const regions = obs.regions;
  if (mode === 'political') {
    rows.push(
      <li><span class="map-chip" style={{ background: obs.civ.color }} />{obs.civ.name} <em>(you)</em></li>,
    );
    for (const o of obs.others) {
      rows.push(<li><span class="map-chip" style={{ background: o.color }} />{o.name}</li>);
    }
    if (regions.some((r) => r.owner != null && r.owner !== obs.seat && !obs.others.some((o) => o.seat === r.owner))) {
      rows.push(<li><span class="map-chip" style={{ background: '#6b6257' }} />Unknown polity</li>);
    }
    if (regions.some((r) => r.controller != null && r.controller !== r.owner)) {
      rows.push(<li title="Hatched in the occupier's colour"><HatchSwatch color="#5a5044" />Occupied</li>);
    }
    if (regions.some((r) => r.visibility === 'remembered')) {
      rows.push(<li title="Not currently observed; the tooltip gives the last-seen date"><HatchSwatch color="#8a7d6a" dir={-1} />Remembered</li>);
    }
    rows.push(<li><LineSwatch color="#2b2620" width={2} />Known coast</li>);
    rows.push(<li title="What lies beyond has not been seen"><LineSwatch color="#8a7d6a" dash="0.1 3.6" width={1.6} />Edge of knowledge</li>);
  } else if (mode === 'terrain') {
    const present = new Set<Terrain>(regions.map((r) => r.terrain));
    for (const t of Object.keys(TERRAIN_LABEL) as Terrain[]) {
      if (!present.has(t)) continue;
      rows.push(<li><span class="map-chip map-chip-sq" style={{ background: TERRAIN_TINT[t] }} />{TERRAIN_LABEL[t]}</li>);
    }
    const kinds = new Set<string>();
    for (const r of regions) for (const n of r.neighbors) kinds.add(n.kind);
    if (regions.some((r) => r.river)) rows.push(<li><LineSwatch color="#3f7592" width={2.2} />River</li>);
    if (kinds.has('sea')) rows.push(<li><LineSwatch color="#2f5d6e" dash="4 3.500" />Sea route</li>);
    if (kinds.has('pass')) rows.push(<li><LineSwatch color="#2b2620" notched />Mountain pass</li>);
  } else if (mode === 'resources') {
    const seen = new Set<Deposit>();
    let unverified = false;
    for (const r of regions) {
      for (const d of r.survey?.deposits ?? []) {
        seen.add(d.kind);
        if (d.epistemic !== 'verified') unverified = true;
      }
    }
    for (const k of Object.keys(DEPOSIT_LABEL) as Deposit[]) {
      if (seen.has(k)) rows.push(<li><DepositSwatch kind={k} />{DEPOSIT_LABEL[k]}</li>);
    }
    if (unverified) {
      const first = [...seen][0];
      rows.push(<li><DepositSwatch kind={first} verified={false} />Dotted outline: reported or estimated</li>);
    }
    if (!seen.size) rows.push(<li class="map-legend-note">No deposits are known yet.</li>);
    if (regions.some((r) => r.survey)) {
      rows.push(
        <li>
          <svg class="map-swatch map-swatch-wide" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">
            <rect x="1" y="2.500" width="20" height="3.500" fill="#f7f1e1" stroke="#5a5044" stroke-width="0.7" /><rect x="1" y="2.500" width="13" height="3.500" fill="#6f8f3a" />
            <rect x="1" y="8" width="20" height="3.500" fill="#f7f1e1" stroke="#5a5044" stroke-width="0.7" /><rect x="1" y="8" width="8" height="3.500" fill="#3f7592" />
          </svg>
          Arable land (green), water (blue)
        </li>,
      );
    }
    if (regions.some((r) => !r.survey)) rows.push(<li><HatchSwatch color="#8a7d6a" />Not surveyed</li>);
    if (regions.some((r) => r.survey && !r.survey.detailed)) {
      rows.push(<li class="map-legend-note">Wide faint hatch: surface observations only</li>);
    }
  } else {
    const labels = ['under 100', '100–500', '500–2,000', '2,000–10,000', '10,000–50,000', '50,000–250,000', 'over 250,000'];
    rows.push(
      <li class="map-ramp">
        {POP_RAMP.map((c, i) => <span style={{ background: c }} title={labels[i] + ' people'} />)}
      </li>,
      <li class="map-ramp-ends"><span>under 100</span><span>over 250,000</span></li>,
      <li class="map-legend-note">People per region (steps at 100, 500, 2k, 10k, 50k, 250k)</li>,
    );
    if (regions.some((r) => r.foreign)) {
      rows.push(<li><HatchSwatch color="#f7f1e1" bg="#deb87d" dotted />Foreign: estimated range</li>);
    }
  }
  return <ul class="map-legend-list">{rows}</ul>;
}

function Tooltip({ obs, region, mode, pick }: { obs: Observation; region: RegionView; mode: MapMode; pick: MapPick | null }): JSX.Element {
  const r = region;
  const owner = seatName(obs, r.owner);
  const occupied = r.controller != null && r.controller !== r.owner;
  const myArmies = obs.armies.filter((a) => a.region === r.id);
  const theirs = obs.foreign_armies.filter((a) => a.region === r.id);
  const sv = r.survey;
  const validTarget = pick ? pick.targets == null || pick.targets.includes(r.id) : true;
  return (
    <div class="map-tip-body">
      <div class="map-tip-title">{r.name}</div>
      <div class="map-tip-sub">
        {TERRAIN_LABEL[r.terrain]}
        {r.settlement !== 'wilderness' ? ` · ${SETTLEMENT_LABEL[r.settlement]}` : ' · no settlement seen'}
        {r.coastal ? ' · coastal' : ''}{r.river ? ' · river' : ''}
      </div>
      <div class="map-tip-row">
        {owner ? (
          <span><span class="map-chip" style={{ background: seatColor(obs, r.owner) }} />{owner}</span>
        ) : (
          <span class="map-tip-muted">Unclaimed</span>
        )}
        <span class={'map-tip-vis map-tip-vis-' + r.visibility}>{VIS_LABEL[r.visibility]}</span>
      </div>
      {occupied && (
        <div class="map-tip-row map-tip-warn">Occupied by {seatName(obs, r.controller)}</div>
      )}
      {r.visibility === 'remembered' && (
        <div class="map-tip-row map-tip-muted">Last seen {fmtDate(r.last_seen)} — may have changed</div>
      )}
      {r.own && <div class="map-tip-row">{int(r.own.population)} people</div>}
      {r.foreign && (
        <div class="map-tip-row"><span class="map-est" title="Estimated range">{range(r.foreign.population_low, r.foreign.population_high)} people</span></div>
      )}
      {mode === 'resources' && (
        sv ? (
          <div class="map-tip-row map-tip-block">
            <div>Arable {int(sv.arable)} plots · water for {int(sv.water)} people</div>
            {sv.deposits.length > 0 ? (
              <div>
                {sv.deposits.map((d, i) => (
                  <span>
                    {i > 0 ? ', ' : ''}
                    <span class={d.epistemic === 'verified' ? '' : 'map-est'}>
                      {DEPOSIT_LABEL[d.kind]}{d.epistemic === 'verified' ? '' : ` (${EPISTEMIC_LABEL[d.epistemic].toLowerCase()})`}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div class="map-tip-muted">No deposits found{sv.detailed ? '' : ' so far'}</div>
            )}
            <div class="map-tip-muted">
              {sv.detailed ? 'Surveyed' : 'Surface observations only'} {fmtDateShort(sv.surveyed_month)}
            </div>
          </div>
        ) : (
          <div class="map-tip-row map-tip-muted">Not surveyed</div>
        )
      )}
      {myArmies.length > 0 && (
        <div class="map-tip-row">
          {myArmies.length === 1 ? myArmies[0].name : `${myArmies.length} of our formations`}
          {myArmies.some((a) => a.in_battle) ? ' · in battle' : ''}
        </div>
      )}
      {theirs.map((a) => (
        <div class="map-tip-row">
          {seatName(obs, a.owner)} force,{' '}
          <span class="map-est" title="Estimated range">{range(a.strength_low, a.strength_high)} soldiers</span>
          <span class="map-tip-muted"> · seen {fmtDateShort(a.observed_month)}</span>
        </div>
      ))}
      {r.test_node && <div class="map-tip-row map-tip-gold">Deployment test node</div>}
      {pick && (
        <div class={'map-tip-row ' + (validTarget ? 'map-tip-ok' : 'map-tip-warn')}>
          {validTarget ? 'Click to choose this region' : 'Not a valid choice here'}
        </div>
      )}
    </div>
  );
}

export function MapView(props: MapViewProps): JSX.Element {
  const { obs, selected, onSelect } = props;
  const pick = props.pick ?? null;
  const marked = props.marked ?? NO_MARKS;
  const insets = props.insets ?? NO_INSETS;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const atlasRef = useRef<Atlas | null>(null);
  const fittedKey = useRef<string>('');
  const pendingFit = useRef(true);
  const tryFit = useRef<() => void>(() => {});
  const [ownMode, setOwnMode] = useState<MapMode>('political');
  const mode = props.mode ?? ownMode;
  const [hoverId, setHoverId] = useState<RegionId | null>(null);
  // The legend is open while the uncovered map box is roomy, unless the player
  // has chosen otherwise; it never squats on a narrow strip of map.
  const [legendPref, setLegendPref] = useState<boolean | null>(null);
  const roomy = typeof window === 'undefined'
    ? true
    : window.innerWidth - insets.left - insets.right >= 720 && window.innerHeight - insets.top - insets.bottom >= 470;
  const legendOpen = legendPref ?? roomy;
  const setLegendOpen = (v: boolean) => setLegendPref(v);
  const [, setZoomTick] = useState(0);

  // Latest props for long-lived event handlers.
  const live = useRef({ onSelect, pick, insets });
  live.current = { onSelect, pick, insets };

  const data = useMemo(() => buildData(obs), [obs]);
  const byId = useMemo(() => new Map(obs.regions.map((r) => [r.id, r])), [obs]);
  const viewKey = `${obs.match_id}:${obs.seat}`;

  const setMode = (m: MapMode) => {
    if (props.onModeChange) props.onModeChange(m);
    if (props.mode === undefined) setOwnMode(m);
  };

  // Mount: renderer, input, resize observer, test hooks.
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const atlas = new Atlas(canvas, { reducedMotion: !!mq?.matches });
    atlasRef.current = atlas;
    atlas.setInsets(live.current.insets);
    const onMq = () => atlas.setReducedMotion(!!mq?.matches);
    mq?.addEventListener?.('change', onMq);

    // Frame the known world once per match and seat, as soon as there is a real size.
    tryFit.current = () => {
      if (!pendingFit.current || !atlas.hasData) return;
      if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return;
      atlas.resize();
      atlas.fit();
      pendingFit.current = false;
    };
    const ro = new ResizeObserver(() => {
      atlas.resize();
      tryFit.current();
    });
    ro.observe(root);

    const pointers = new Map<number, { x: number; y: number }>();
    let downX = 0, downY = 0, moved = false, pinchDist = 0;
    const local = (e: { clientX: number; clientY: number }): [number, number] => {
      const b = canvas.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    const placeTip = (x: number, y: number) => {
      const tip = tipRef.current;
      if (!tip) return;
      const w = tip.offsetWidth || 220, h = tip.offsetHeight || 80;
      let tx = x + 16, ty = y + 18;
      if (tx + w > canvas.clientWidth - 8) tx = x - w - 14;
      if (ty + h > canvas.clientHeight - 8) ty = y - h - 12;
      tip.style.transform = `translate(${Math.max(6, tx)}px, ${Math.max(6, ty)}px)`;
    };
    const hover = (e: PointerEvent) => {
      const [x, y] = local(e);
      const id = atlas.regionAt(x, y);
      setHoverId(id);
      placeTip(x, y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downX = e.clientX; downY = e.clientY; moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        hover(e);
        return;
      }
      if (pointers.size === 1) {
        if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) {
          moved = true;
          root.classList.add('is-dragging');
          setHoverId(null);
        }
        if (moved) atlas.panBy(e.clientX - prev.x, e.clientY - prev.y);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const [mx, my] = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        if (pinchDist > 0 && dist > 0) atlas.zoomAt(dist / pinchDist, mx, my);
        pinchDist = dist;
      }
    };
    const onUp = (e: PointerEvent) => {
      const had = pointers.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!had) return;
      if (pointers.size === 0) {
        root.classList.remove('is-dragging');
        if (!moved && e.type === 'pointerup') {
          const [x, y] = local(e);
          click(atlas.regionAt(x, y));
        }
        if (e.pointerType === 'mouse') hover(e);
      }
    };
    const click = (id: RegionId | null) => {
      const p = live.current.pick;
      if (p) {
        if (id != null && (p.targets == null || p.targets.includes(id))) p.onPick(id);
        return;
      }
      live.current.onSelect(id);
    };
    const onLeave = () => setHoverId(null);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 240 : 1;
      const dy = Math.max(-240, Math.min(240, e.deltaY * unit));
      atlas.zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0018)), x, y);
      setHoverId(atlas.regionAt(x, y));
    };
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 160 : 70;
      let used = true;
      switch (e.key) {
        case 'ArrowLeft': atlas.panBy(step, 0); break;
        case 'ArrowRight': atlas.panBy(-step, 0); break;
        case 'ArrowUp': atlas.panBy(0, step); break;
        case 'ArrowDown': atlas.panBy(0, -step); break;
        case '+': case '=': atlas.zoomBy(1.3); break;
        case '-': case '_': atlas.zoomBy(1 / 1.3); break;
        case 'f': case 'F': atlas.fit(true); break;
        case 'Enter': case ' ': {
          // Choose the region under the middle of the visible map.
          const i = live.current.insets;
          const cx = i.left + (canvas.clientWidth - i.left - i.right) / 2;
          const cy = i.top + (canvas.clientHeight - i.top - i.bottom) / 2;
          click(atlas.regionAt(cx, cy));
          break;
        }
        default: used = false;
      }
      if (used) e.preventDefault();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    atlas.onViewChange = () => setZoomTick((n) => (n + 1) % 1000000);

    window.__atlas = {
      regionScreenCenter(id: number) {
        const c = atlas.regionCenter(id);
        if (!c) return null;
        const b = canvas.getBoundingClientRect();
        return [b.left + c[0], b.top + c[1]];
      },
      zoom: () => atlas.zoom,
      regionAt(clientX: number, clientY: number) {
        const b = canvas.getBoundingClientRect();
        return atlas.regionAt(clientX - b.left, clientY - b.top);
      },
      mode: () => atlas.mode,
      lastDrawMs: () => atlas.lastDrawMs,
    };

    return () => {
      ro.disconnect();
      mq?.removeEventListener?.('change', onMq);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      atlas.destroy();
      atlasRef.current = null;
      delete window.__atlas;
    };
  }, []);

  // Insets first, so fit/focus below use the current uncovered box.
  useEffect(() => {
    atlasRef.current?.setInsets(insets);
  }, [insets.left, insets.right, insets.top, insets.bottom]);

  // New observation: rebuild geometry; frame the world once per match and seat.
  useEffect(() => {
    const atlas = atlasRef.current;
    if (!atlas) return;
    atlas.setData(data);
    if (fittedKey.current !== viewKey) {
      fittedKey.current = viewKey;
      pendingFit.current = true;
    }
    tryFit.current();
  }, [data, viewKey]);

  useEffect(() => {
    atlasRef.current?.setOverlay({
      mode,
      selected,
      hovered: hoverId,
      targets: pick ? pick.targets : undefined,
      marked,
    });
  }, [mode, selected, hoverId, pick, marked]);

  useEffect(() => {
    if (props.focus) atlasRef.current?.focusRegion(props.focus.region);
  }, [props.focus?.nonce]);

  // Esc leaves pick mode.
  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pick.onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pick]);

  const hovered = hoverId != null ? byId.get(hoverId) ?? null : null;
  const style = {
    '--mi-l': insets.left + 'px',
    '--mi-r': insets.right + 'px',
    '--mi-t': insets.top + 'px',
    '--mi-b': insets.bottom + 'px',
  } as JSX.CSSProperties;
  const atlas = atlasRef.current;
  const activeMode = MODES.find((m) => m.key === mode) ?? MODES[0];

  return (
    <div
      ref={rootRef}
      class={'map-view' + (pick ? ' is-picking' : '') + (hovered ? ' has-hover' : '')}
      style={style}
      data-mode={mode}
    >
      <canvas
        ref={canvasRef}
        class="map-canvas"
        data-testid="map-canvas"
        tabIndex={0}
        role="application"
        aria-label={`Atlas of the known world, ${activeMode.label.toLowerCase()} view. Arrow keys pan, plus and minus zoom, F fits the known world.`}
      />

      <div class="map-compass-wrap" aria-hidden="true"><Compass /></div>

      {pick && (
        <div class="map-pick" role="status">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <circle cx="8" cy="8" r="5.500" fill="none" stroke="currentColor" stroke-width="1.4" />
            <path d="M8 1v4M8 11v4M1 8h4M11 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
          <span class="map-pick-text">{pick.prompt}</span>
          <button type="button" class="map-btn map-pick-cancel" data-testid="map-pick-cancel" onClick={() => pick.onCancel()}>
            Cancel <kbd>Esc</kbd>
          </button>
        </div>
      )}

      <div class="map-controls">
        <div class="map-zoom" role="group" aria-label="Zoom">
          <button type="button" class="map-btn" data-testid="map-zoom-in" title="Zoom in (+)" aria-label="Zoom in" onClick={() => atlas?.zoomBy(1.35)}><IconPlus /></button>
          <button type="button" class="map-btn" data-testid="map-zoom-out" title="Zoom out (−)" aria-label="Zoom out" onClick={() => atlas?.zoomBy(1 / 1.35)}><IconMinus /></button>
          <button type="button" class="map-btn" data-testid="map-fit" title="Fit the known world (F)" aria-label="Fit the known world" onClick={() => atlas?.fit(true)}><IconFit /></button>
        </div>
        <div class="map-modebox">
          {legendOpen && (
            <div class="map-legend" data-testid="map-legend">
              <div class="map-legend-head">{activeMode.hint}</div>
              <Legend obs={obs} mode={mode} />
            </div>
          )}
          <div class="map-modes" role="radiogroup" aria-label="Map mode">
            {MODES.map((m) => (
              <button
                type="button"
                role="radio"
                aria-checked={m.key === mode}
                class={'map-mode' + (m.key === mode ? ' is-on' : '')}
                data-testid={`map-mode-${m.key}`}
                title={m.hint}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              class={'map-mode map-legend-toggle' + (legendOpen ? ' is-on' : '')}
              aria-pressed={legendOpen}
              title={legendOpen ? 'Hide legend' : 'Show legend'}
              aria-label={legendOpen ? 'Hide legend' : 'Show legend'}
              data-testid="map-legend-toggle"
              onClick={() => setLegendOpen(!legendOpen)}
            >
              <IconLegend />
            </button>
          </div>
        </div>
      </div>

      <div ref={tipRef} class={'map-tip' + (hovered ? ' is-on' : '')} role="tooltip" data-testid="map-tooltip">
        {hovered && <Tooltip obs={obs} region={hovered} mode={mode} pick={pick} />}
      </div>
    </div>
  );
}
