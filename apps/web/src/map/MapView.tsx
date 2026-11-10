// Preact wrapper around the two map renderers: the 3D strategic map (three.js,
// loaded on demand) and the flat Atlas canvas, a complete lower-cost tier with the
// same information and actions. This component owns pointer and keyboard handling,
// the hover tooltip, the map-mode toggle with legend, zoom controls, the tier toggle
// and the pick banner. Everything shown is derived from the seat's Observation.
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Deposit, DepositView, Observation, RegionId, RegionView, Terrain } from '../protocol';
import {
  DEPOSIT_LABEL, EPISTEMIC_LABEL, SETTLEMENT_LABEL, TERRAIN_LABEL, VIS_LABEL, fmtDate, fmtDateShort, int, peopleNum, pct, range, tonnes,
} from '../format';
import { t, tc, useLocale } from '../i18n';
import {
  Atlas, BUILT_RAMP, DEPOSIT_COLOR, POP_BREAKS, POP_RAMP, TERRAIN_TINT,
  type AtlasOverlay, type Insets, type MapMode,
} from './atlas';
import type { DepositHit, Map3D, Map3DData } from '../map3d';
import { SECTOR_COLOR, type Building, type Sector } from './landuse';
import { BUILD_AMBER, type ChipGlyph } from './sites';
import { ChipSwatch, DevelopmentCard } from './Development';
import './map.css';

type Map3DModule = typeof import('../map3d');
export type MapTier = '3d' | 'flat';

/** What MapView needs from a renderer; the flat Atlas and the 3D map both provide it. */
interface MapEngine {
  onViewChange: (() => void) | null;
  readonly zoom: number;
  readonly hasData: boolean;
  readonly mode: MapMode;
  lastDrawMs: number;
  setData(d: Map3DData): void;
  setOverlay(o: Partial<AtlasOverlay>): void;
  setInsets(i: Insets): void;
  setReducedMotion(v: boolean): void;
  resize(): boolean;
  fit(animate?: boolean): void;
  focusRegion(id: RegionId, animate?: boolean): void;
  zoomAt(factor: number, sx: number, sy: number): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  regionAt(sx: number, sy: number): RegionId | null;
  regionCenter(id: RegionId): [number, number] | null;
  destroy(): void;
}

const TIER_KEY = 'bts.mapTier';
/** Optional override of the 3D map's automatic quality: "high" or "low". */
const QUALITY_KEY = 'bts.mapQuality';
function savedQuality(): 'auto' | 'high' | 'low' {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === 'high' || v === 'low' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
function savedTier(): MapTier {
  try {
    return localStorage.getItem(TIER_KEY) === '3d' ? '3d' : 'flat';
  } catch {
    return 'flat';
  }
}

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
  onBuild?(region: RegionId): void;
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
      /** Which renderer is live. */
      tier?(): MapTier;
    };
    /** The live 3D engine, for the dev harness and screenshot scripts. */
    __map3d?: Map3D;
  }
}

const MODES: { key: MapMode; label: string; hint: string }[] = [
  { key: 'political', label: 'Political', hint: 'Who governs what' },
  { key: 'terrain', label: 'Terrain', hint: 'Landforms, rivers and passes' },
  { key: 'resources', label: 'Resources', hint: 'Deposits and survey coverage' },
  { key: 'population', label: 'Population', hint: 'People per region' },
  { key: 'construction', label: 'Construction', hint: 'Regional development: built and being built' },
];
/** Ground colours of the 3D tier, for the terrain legend. */
const TERRAIN_TINT_3D: Record<Terrain, string> = {
  plains: '#a5bb73', hills: '#afb777', mountains: '#a49982', forest: '#7b9962', marsh: '#8da47b', steppe: '#cdc384',
  desert: '#e4cf98', tundra: '#c9ccaf',
};
const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
const NO_MARKS: RegionId[] = [];
const NO_BUILDING: Record<number, Building> = {};
const NO_CATEGORIES: Record<string, string> = {};

function buildData(obs: Observation): Map3DData {
  const seatColors: Record<number, string> = { [obs.seat]: obs.civ.color };
  for (const o of obs.others) seatColors[o.seat] = o.color;
  const facilityCategories: Record<string, string> = {};
  for (const f of obs.catalog.facilities) facilityCategories[f.kind] = f.category;
  return {
    world: obs.world,
    regions: obs.regions,
    mySeat: obs.seat,
    seatColors,
    capital: obs.civ.capital,
    armies: obs.armies,
    foreignArmies: obs.foreign_armies,
    month: obs.month,
    facilityCategories,
    construction: buildingByRegion(obs),
  };
}

/**
 * Building work per region, from what this viewer is told: its own projects, or (where a view
 * carries no project list, as the observer's world view) the queued levels the region reports.
 */
export function buildingByRegion(obs: Observation): Record<number, Building> {
  const out: Record<number, Building> = {};
  for (const p of obs.projects) {
    if (p.kind !== 'build' || p.region == null) continue;
    const b = out[p.region] ?? (out[p.region] = { levels: 0, projects: 0 });
    b.levels += p.levels ?? 1;
    b.projects += 1;
  }
  for (const r of obs.regions) {
    if (!r.own?.construction_sites || out[r.id]) continue;
    let levels = 0, projects = 0;
    for (const s of r.own.construction_sites) if (s.queued_levels > 0) { levels += s.queued_levels; projects += 1; }
    if (levels > 0) out[r.id] = { levels, projects };
  }
  return out;
}

function seatName(obs: Observation, seat: number | null): string | null {
  if (seat == null) return null;
  if (seat === obs.seat) return tc(obs.civ.name);
  const other = obs.others.find((o) => o.seat === seat);
  return other ? tc(other.name) : t('Unknown polity');
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
      <text y="-33" text-anchor="middle" font-size="9" fill="currentColor">{t('N')}</text>
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

// i18n-fields
const WORKS_KEY: { glyph: ChipGlyph; sector: Sector | null; label: string }[] = [
  { glyph: 'food', sector: 'food', label: 'Farmland' },
  { glyph: 'extraction', sector: 'extraction', label: 'Mines' },
  { glyph: 'industry', sector: 'industry', label: 'Industry' },
  { glyph: 'power', sector: 'power', label: 'Power' },
  { glyph: 'knowledge', sector: 'knowledge', label: 'Learning' },
  { glyph: 'port', sector: 'transport', label: 'Harbour' },
  { glyph: 'space', sector: 'space', label: 'Space' },
  { glyph: 'build', sector: null, label: 'Building' },
];
// i18n-end

/** The sector discs under a region's name: what they stand for and how to read their weight. */
function WorksKey(): JSX.Element {
  return (
    <li class="map-works">
      <div class="map-works-grid">
        {WORKS_KEY.map((w) => (
          <span><ChipSwatch chip={{ glyph: w.glyph, color: w.sector ? SECTOR_COLOR[w.sector] : BUILD_AMBER, magnitude: 3 }} size={18} />{t(w.label)}</span>
        ))}
      </div>
      <div class="map-works-scale" title={t('A disc grows and darkens with the levels built in that sector')}>
        {[1, 2, 3, 4].map((m) => <ChipSwatch chip={{ glyph: 'industry', color: SECTOR_COLOR.industry, magnitude: m }} size={10 + m * 3} />)}
        <span>{t('little … much built')}</span>
      </div>
    </li>
  );
}

function Legend({ obs, mode, tier }: { obs: Observation; mode: MapMode; tier: MapTier }): JSX.Element {
  const rows: JSX.Element[] = [];
  const regions = obs.regions;
  const seesWorks = regions.some((r) => r.own && r.own.facilities.length > 0);
  if (mode === 'political') {
    // The observer's world view has no realm of its own to list.
    if (obs.seat >= 0) {
      rows.push(
        <li><span class="map-chip" style={{ background: obs.civ.color }} />{tc(obs.civ.name)} <em>{t('(you)')}</em></li>,
      );
    }
    for (const o of obs.others) {
      rows.push(<li><span class="map-chip" style={{ background: o.color }} />{tc(o.name)}</li>);
    }
    if (regions.some((r) => r.owner != null && r.owner !== obs.seat && !obs.others.some((o) => o.seat === r.owner))) {
      rows.push(<li><span class="map-chip" style={{ background: '#6b6257' }} />{t('Unknown polity')}</li>);
    }
    if (regions.some((r) => r.controller != null && r.controller !== r.owner)) {
      rows.push(<li title={t("Hatched in the occupier's colour")}><HatchSwatch color="#5a5044" />{t('Occupied')}</li>);
    }
    if (tier === '3d') {
      rows.push(<li title={t('The edge of each realm, glowing inward in its colour')}><LineSwatch color={obs.civ.color} width={3} />{t('Territory border')}</li>);
      if (regions.some((r) => r.visibility === 'remembered')) {
        rows.push(<li title={t('Not currently observed; the tooltip gives the last-seen date')}><span class="map-chip map-chip-sq" style={{ background: '#d9cba6' }} />{t('Remembered: drawn in map ink')}</li>);
      }
      rows.push(<li title={t('What lies beyond has not been seen')}><span class="map-chip map-chip-sq" style={{ background: '#efe3bd' }} />{t('Unexplored: blank parchment')}</li>);
      if (obs.armies.length + obs.foreign_armies.length > 0) {
        rows.push(<li class="map-legend-note">{t('Standards: blades assault, chevrons maneuver, tower denial')}</li>);
      }
    } else {
      if (regions.some((r) => r.visibility === 'remembered')) {
        rows.push(<li title={t('Not currently observed; the tooltip gives the last-seen date')}><HatchSwatch color="#8a7d6a" dir={-1} />{t('Remembered')}</li>);
      }
      rows.push(<li><LineSwatch color="#2b2620" width={2.6} />{t('Border between realms')}</li>);
      rows.push(<li><LineSwatch color="#8a7d6a" width={1} />{t('Region border')}</li>);
      rows.push(<li><LineSwatch color="#2c4650" width={2} />{t('Known coast')}</li>);
      rows.push(<li title={t('What lies beyond has not been seen')}><LineSwatch color="#8a7d6a" dash="0.1 3.6" width={1.6} />{t('Edge of knowledge')}</li>);
    }
    if (seesWorks) rows.push(<WorksKey />);
  } else if (mode === 'terrain') {
    const present = new Set<Terrain>(regions.map((r) => r.terrain));
    for (const tt of Object.keys(TERRAIN_LABEL) as Terrain[]) {
      if (!present.has(tt)) continue;
      rows.push(<li><span class="map-chip map-chip-sq" style={{ background: (tier === '3d' ? TERRAIN_TINT_3D : TERRAIN_TINT)[tt] }} />{t(TERRAIN_LABEL[tt])}</li>);
    }
    const kinds = new Set<string>();
    for (const r of regions) for (const n of r.neighbors) kinds.add(n.kind);
    if (regions.some((r) => r.river)) rows.push(<li><LineSwatch color="#3f7592" width={2.2} />{t('River')}</li>);
    if (kinds.has('sea')) rows.push(<li><LineSwatch color="#2f5d6e" dash="4 3.500" />{t('Sea route')}</li>);
    if (kinds.has('pass') && tier !== '3d') rows.push(<li><LineSwatch color="#2b2620" notched />{t('Mountain pass')}</li>);
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
      if (seen.has(k)) rows.push(<li><DepositSwatch kind={k} />{t(DEPOSIT_LABEL[k])}</li>);
    }
    if (unverified) {
      const first = [...seen][0];
      rows.push(<li><DepositSwatch kind={first} verified={false} />{tier === '3d' ? t('Dashed rim and “?”: reported or estimated') : t('Dotted outline: reported or estimated')}</li>);
    }
    if (!seen.size) rows.push(<li class="map-legend-note">{t('No deposits are known yet.')}</li>);
    if (regions.some((r) => r.survey) && tier === '3d') {
      rows.push(<li class="map-legend-note">{t('Chips: arable, pasture, fishery, forest, hydro potential')}</li>);
    } else if (regions.some((r) => r.survey)) {
      rows.push(
        <li>
          <svg class="map-swatch map-swatch-wide" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">
            <rect x="1" y="2.500" width="20" height="3.500" fill="#f7f1e1" stroke="#5a5044" stroke-width="0.7" /><rect x="1" y="2.500" width="13" height="3.500" fill="#6f8f3a" />
            <rect x="1" y="8" width="20" height="3.500" fill="#f7f1e1" stroke="#5a5044" stroke-width="0.7" /><rect x="1" y="8" width="8" height="3.500" fill="#3f7592" />
          </svg>
          {t('Arable land (green), water (blue)')}
        </li>,
      );
    }
    if (regions.some((r) => !r.survey)) rows.push(<li><HatchSwatch color="#8a7d6a" />{t('Not surveyed')}</li>);
    if (regions.some((r) => r.survey && !r.survey.detailed)) {
      rows.push(<li class="map-legend-note">{t('Wide faint hatch: surface observations only')}</li>);
    }
  } else if (mode === 'construction') {
    const labels = [t('under 10'), '10–29', '30–59', '60–99', '100–159', t('160 or more')];
    rows.push(
      <li class="map-ramp">
        {BUILT_RAMP.map((c, i) => <span style={{ background: c }} title={t('{n} built levels', { n: labels[i] })} />)}
      </li>,
      <li class="map-ramp-ends"><span>{t('under 10')}</span><span>{t('160 or more')}</span></li>,
      <li class="map-legend-note">{t('Built levels per region, all sectors (steps at 10, 30, 60, 100, 160)')}</li>,
      <li><ChipSwatch chip={{ glyph: 'build', color: BUILD_AMBER, magnitude: 4 }} size={18} />{t('+N: levels under construction')}</li>,
      <li class="map-legend-note">{t('The bar under a name splits its built levels by sector. Building in regions you do not govern is not disclosed.')}</li>,
    );
  } else {
    // classes from docs/units-and-scale.md §3 (see POP_BREAKS)
    const b = POP_BREAKS.map((n) => peopleNum(n));
    const labels = [t('under {n}', { n: b[0] }), ...b.slice(1).map((hi, i) => `${b[i]}–${hi}`), t('{n} or more', { n: b[b.length - 1] })];
    rows.push(
      <li class="map-ramp">
        {POP_RAMP.map((c, i) => <span style={{ background: c }} title={t('{n} people', { n: labels[i] })} />)}
      </li>,
      <li class="map-ramp-ends"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></li>,
      <li class="map-legend-note">{t('People per region (steps at {list}). Camp under 150k, village to 1M, town to 4M, city to 12M, metropolis beyond.', { list: b.join(', ') })}</li>,
    );
    if (regions.some((r) => r.foreign)) {
      rows.push(<li><HatchSwatch color="#f7f1e1" bg="#deb87d" dotted />{t('Foreign: estimated range')}</li>);
    }
  }
  return <ul class="map-legend-list">{rows}</ul>;
}

function Tooltip({ obs, region, mode, pick, deposit, building }: { obs: Observation; region: RegionView; mode: MapMode; pick: MapPick | null; deposit: DepositView | null; building: Building | null }): JSX.Element {
  const r = region;
  const owner = seatName(obs, r.owner);
  const occupied = r.controller != null && r.controller !== r.owner;
  const myArmies = obs.armies.filter((a) => a.region === r.id);
  const theirs = obs.foreign_armies.filter((a) => a.region === r.id);
  const sv = r.survey;
  const validTarget = pick ? pick.targets == null || pick.targets.includes(r.id) : true;
  return (
    <div class="map-tip-body">
      {deposit && (
        <div class="map-tip-dep">
          <DepositSwatch kind={deposit.kind} verified={deposit.epistemic === 'verified'} />
          <div>
            <div class="map-tip-dep-name">
              <span class={deposit.epistemic === 'verified' ? '' : 'map-est'}>{t(DEPOSIT_LABEL[deposit.kind])}</span>
              <span class="map-tip-vis">{t(EPISTEMIC_LABEL[deposit.epistemic])}</span>
            </div>
            <div class={deposit.epistemic === 'verified' ? '' : 'map-est'}>
              {t('{amount} remaining', { amount: tonnes(deposit.remaining) })} · {t('quality {pct}', { pct: pct(deposit.quality_bp) })}
            </div>
          </div>
        </div>
      )}
      <div class="map-tip-title">{r.name}</div>
      <div class="map-tip-sub">
        {t(TERRAIN_LABEL[r.terrain])}
        {' · '}{r.settlement !== 'wilderness' ? t(SETTLEMENT_LABEL[r.settlement]) : t('no settlement seen')}
        {r.coastal ? ' · ' + t('coastal') : ''}{r.river ? ' · ' + t('river') : ''}
      </div>
      <div class="map-tip-row">
        {owner ? (
          <span><span class="map-chip" style={{ background: seatColor(obs, r.owner) }} />{owner}</span>
        ) : (
          <span class="map-tip-muted">{t('Unclaimed')}</span>
        )}
        <span class={'map-tip-vis map-tip-vis-' + r.visibility}>{t(VIS_LABEL[r.visibility])}</span>
      </div>
      {occupied && (
        <div class="map-tip-row map-tip-warn">{t('Occupied by {name}', { name: seatName(obs, r.controller) ?? '' })}</div>
      )}
      {r.visibility === 'remembered' && (
        <div class="map-tip-row map-tip-muted">{t('Last seen {date} — may have changed', { date: fmtDate(r.last_seen) })}</div>
      )}
      {r.own && <div class="map-tip-row">{t('{n} people', { n: peopleNum(r.own.population) })}</div>}
      {r.own && mode === 'construction' && (
        <div class="map-tip-row">
          {t('{n} built levels', { n: int(r.own.facilities.reduce((n, f) => n + f.level, 0)) })}
          {building && building.levels > 0 ? ' · ' + t('{n} levels under construction', { n: building.levels }) : ''}
        </div>
      )}
      {mode === 'construction' && !r.own && r.owner != null && <div class="map-tip-row map-tip-muted">{t('What is built here is not disclosed to you.')}</div>}
      {r.foreign && (
        <div class="map-tip-row"><span class="map-est" title={t('Estimated range')}>{t('{n} people', { n: range(r.foreign.population_low, r.foreign.population_high) })}</span></div>
      )}
      {mode === 'resources' && (
        sv ? (
          <div class="map-tip-row map-tip-block">
            <div>{t('Arable {a} plots · water for {w} people', { a: int(sv.arable), w: peopleNum(sv.water) })}</div>
            {sv.deposits.length > 0 ? (
              <div>
                {sv.deposits.map((d, i) => (
                  <span>
                    {i > 0 ? t(', ') : ''}
                    <span class={d.epistemic === 'verified' ? '' : 'map-est'}>
                      {t(DEPOSIT_LABEL[d.kind])}{d.epistemic === 'verified' ? '' : ` (${t(EPISTEMIC_LABEL[d.epistemic]).toLowerCase()})`}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div class="map-tip-muted">{sv.detailed ? t('No deposits found') : t('No deposits found so far')}</div>
            )}
            <div class="map-tip-muted">
              {sv.detailed ? t('Surveyed') : t('Surface observations only')} {fmtDateShort(sv.surveyed_month)}
            </div>
          </div>
        ) : (
          <div class="map-tip-row map-tip-muted">{t('Not surveyed')}</div>
        )
      )}
      {myArmies.length > 0 && (
        <div class="map-tip-row">
          {myArmies.length === 1 ? tc(myArmies[0].name) : t('{n} of our formations', { n: myArmies.length })}
          {myArmies.some((a) => a.in_battle) ? ' · ' + t('in battle') : ''}
        </div>
      )}
      {theirs.map((a) => (
        <div class="map-tip-row">
          <span>
            {t('{name} force,', { name: seatName(obs, a.owner) ?? '' })}{' '}
            <span class="map-est" title={t('Estimated range')}>{t('{n} soldiers', { n: range(a.strength_low, a.strength_high) })}</span>
            <span class="map-tip-muted"> · {t('seen {date}', { date: fmtDateShort(a.observed_month) })}</span>
          </span>
        </div>
      ))}
      {r.test_node && <div class="map-tip-row map-tip-gold">{t('Deployment test node')}</div>}
      {pick && (
        <div class={'map-tip-row ' + (validTarget ? 'map-tip-ok' : 'map-tip-warn')}>
          {validTarget ? t('Click to choose this region') : t('Not a valid choice here')}
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
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const map3dRef = useRef<Map3D | null>(null);
  const fittedKey = useRef<string>('');
  const pendingFit = useRef(true);
  const tryFit = useRef<() => void>(() => {});
  const [ownMode, setOwnMode] = useState<MapMode>('political');
  const mode = props.mode ?? ownMode;
  const [hoverId, setHoverId] = useState<RegionId | null>(null);
  const [hoverDep, setHoverDep] = useState<DepositHit | null>(null);
  // Renderer tier: the flat atlas by default (it reads best at every distance and needs no
  // GPU); the 3D map on request, falling back to the atlas when WebGL fails.
  const [tierPref, setTierPref] = useState<MapTier>(savedTier);
  const [mod3d, setMod3d] = useState<Map3DModule | null>(null);
  const [failed3d, setFailed3d] = useState(false);
  // A lost WebGL context is rebuilt on a fresh canvas; repeated losses fall back to the flat atlas.
  const [gen, setGen] = useState(0);
  const losses = useRef(0);
  const tier: MapTier = failed3d ? 'flat' : tierPref;
  // The legend is open while the uncovered map box is roomy, unless the player
  // has chosen otherwise; it never squats on a narrow strip of map. With the works
  // key it is a tall card, so "roomy" means a box it can share with the whole known world
  // (not the map beside an open drawer or the observer's panels).
  const [legendPref, setLegendPref] = useState<boolean | null>(null);
  const roomy = typeof window === 'undefined'
    ? true
    : window.innerWidth - insets.left - insets.right >= 1000 && window.innerHeight - insets.top - insets.bottom >= 540;
  // In construction mode the development card carries its own key and takes the legend's place.
  const legendOpen = legendPref ?? (roomy && mode !== 'construction');
  const setLegendOpen = (v: boolean) => setLegendPref(v);
  const [, setZoomTick] = useState(0);

  // Latest props for long-lived event handlers.
  // Opening camera target: the viewer's own capital, when the viewer governs anything.
  const capitalRef = useRef<RegionId | null>(null);
  capitalRef.current = props.obs.seat >= 0 && props.obs.regions.some((r) => r.id === props.obs.civ.capital && r.own) ? props.obs.civ.capital : null;
  const live = useRef({ onSelect, pick, insets });
  live.current = { onSelect, pick, insets };

  const data = useMemo(() => buildData(obs), [obs]);
  const byId = useMemo(() => new Map(obs.regions.map((r) => [r.id, r])), [obs]);
  const viewKey = `${obs.match_id}:${obs.seat}`;

  const setMode = (m: MapMode) => {
    if (props.onModeChange) props.onModeChange(m);
    if (props.mode === undefined) setOwnMode(m);
  };
  const chooseTier = (next: MapTier) => {
    try { localStorage.setItem(TIER_KEY, next); } catch { /* storage unavailable */ }
    if (next === '3d') { setFailed3d(false); losses.current = 0; }
    setTierPref(next);
  };

  // Load the 3D chunk (three.js) only when that tier is wanted.
  useEffect(() => {
    if (tier !== '3d' || mod3d) return;
    let alive = true;
    import('../map3d').then(
      (m) => { if (alive) setMod3d(m); },
      (e) => { console.warn('3D map could not be loaded; using the flat atlas.', e); if (alive) setFailed3d(true); },
    );
    return () => { alive = false; };
  }, [tier, mod3d]);

  // Identifies the live renderer; effects that feed it re-run when it changes.
  const engineKey = tier === '3d' ? (mod3d ? '3d:' + gen : 'loading') : 'flat';

  // Mount: renderer, input, resize observer, test hooks.
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || engineKey === 'loading') return;
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let engine: MapEngine;
    let m3: Map3D | null = null;
    if (engineKey.startsWith('3d') && mod3d && labelsRef.current) {
      try {
        m3 = new mod3d.Map3D(canvas, { reducedMotion: !!mq?.matches, labels: labelsRef.current, minimap: miniRef.current, quality: savedQuality() });
        m3.onContextLostCb = () => {
          losses.current++;
          if (losses.current > 2) {
            console.warn('The WebGL context was lost repeatedly; using the flat atlas.');
            setFailed3d(true);
          } else {
            console.warn('The WebGL context was lost; rebuilding the 3D map.');
            setGen((g) => g + 1);
          }
        };
      } catch (e) {
        console.warn('WebGL is unavailable; using the flat atlas.', e);
        setFailed3d(true);
        return;
      }
      engine = m3;
    } else if (engineKey === 'flat') {
      engine = new Atlas(canvas, { reducedMotion: !!mq?.matches });
    } else return;
    engineRef.current = engine;
    map3dRef.current = m3;
    pendingFit.current = true;
    engine.setInsets(live.current.insets);
    const onMq = () => engine.setReducedMotion(!!mq?.matches);
    mq?.addEventListener?.('change', onMq);

    // Frame the known world once per match and seat, as soon as there is a real size.
    tryFit.current = () => {
      if (!pendingFit.current || !engine.hasData) return;
      if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return;
      engine.resize();
      engine.fit();
      // The living map opens on the capital and its hinterland, not on the whole known
      // world from far above; F still frames everything. An observer keeps the overview.
      const home = capitalRef.current;
      if (m3 && home !== null) engine.focusRegion(home, false);
      pendingFit.current = false;
    };
    const ro = new ResizeObserver(() => {
      engine.resize();
      tryFit.current();
    });
    ro.observe(root);

    const pointers = new Map<number, { x: number; y: number }>();
    let downX = 0, downY = 0, moved = false, pinchDist = 0, rotating = false;
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
    const hover = (e: { clientX: number; clientY: number }) => {
      const [x, y] = local(e);
      // A resource badge under the pointer takes precedence and names its own region.
      const dep = m3 ? m3.depositAt(x, y) : null;
      setHoverDep((prev) => (prev?.region === dep?.region && prev?.index === dep?.index ? prev : dep));
      setHoverId(dep ? dep.region : engine.regionAt(x, y));
      placeTip(x, y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button === 2 && m3) {
        // Right-drag turns the 3D camera.
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        rotating = true;
        moved = true;
        return;
      }
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
      if (rotating && m3) {
        m3.rotateBy(-(e.clientX - prev.x) * 0.006, false);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      }
      if (pointers.size === 1) {
        if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) {
          moved = true;
          root.classList.add('is-dragging');
          m3?.setDragging(true);
          setHoverId(null);
          setHoverDep(null);
        }
        if (moved) engine.panBy(e.clientX - prev.x, e.clientY - prev.y);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const [mx, my] = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        if (pinchDist > 0 && dist > 0) engine.zoomAt(dist / pinchDist, mx, my);
        pinchDist = dist;
      }
    };
    const onUp = (e: PointerEvent) => {
      const had = pointers.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!had) return;
      if (rotating) {
        rotating = false;
        return;
      }
      if (pointers.size === 0) {
        root.classList.remove('is-dragging');
        m3?.setDragging(false);
        if (!moved && e.type === 'pointerup') {
          const [x, y] = local(e);
          const dep = m3 ? m3.depositAt(x, y) : null;
          click(dep ? dep.region : engine.regionAt(x, y));
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
    const onLeave = () => { setHoverId(null); setHoverDep(null); };
    const onMenu = (e: Event) => { if (m3) e.preventDefault(); };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 240 : 1;
      const dy = Math.max(-240, Math.min(240, e.deltaY * unit));
      engine.zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0018)), x, y);
      setHoverId(engine.regionAt(x, y));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 160 : 70;
      let used = true;
      switch (e.key) {
        case 'ArrowLeft': engine.panBy(step, 0); break;
        case 'ArrowRight': engine.panBy(-step, 0); break;
        case 'ArrowUp': engine.panBy(0, step); break;
        case 'ArrowDown': engine.panBy(0, -step); break;
        case '+': case '=': engine.zoomBy(1.3); break;
        case '-': case '_': engine.zoomBy(1 / 1.3); break;
        case 'f': case 'F': engine.fit(true); break;
        case 'Enter': case ' ': {
          // Choose the region under the middle of the visible map.
          const i = live.current.insets;
          const cx = i.left + (canvas.clientWidth - i.left - i.right) / 2;
          const cy = i.top + (canvas.clientHeight - i.top - i.bottom) / 2;
          click(engine.regionAt(cx, cy));
          break;
        }
        default: used = false;
      }
      if (!used && m3) {
        // The 3D map also takes WASD to pan and Q / E to turn; N faces north again.
        used = true;
        switch (e.key.toLowerCase()) {
          case 'a': m3.panBy(step, 0, true); break;
          case 'd': m3.panBy(-step, 0, true); break;
          case 'w': m3.panBy(0, step, true); break;
          case 's': m3.panBy(0, -step, true); break;
          case 'q': m3.rotateBy(Math.PI / 8); break;
          case 'e': m3.rotateBy(-Math.PI / 8); break;
          case 'n': m3.resetNorth(); break;
          default: used = false;
        }
      }
      if (used) e.preventDefault();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    engine.onViewChange = () => setZoomTick((n) => (n + 1) % 1000000);

    window.__atlas = {
      regionScreenCenter(id: number) {
        const c = engine.regionCenter(id);
        if (!c) return null;
        const b = canvas.getBoundingClientRect();
        return [b.left + c[0], b.top + c[1]];
      },
      zoom: () => engine.zoom,
      regionAt(clientX: number, clientY: number) {
        const b = canvas.getBoundingClientRect();
        return engine.regionAt(clientX - b.left, clientY - b.top);
      },
      mode: () => engine.mode,
      lastDrawMs: () => engine.lastDrawMs,
      tier: () => (m3 ? '3d' : 'flat'),
    };
    if (m3) window.__map3d = m3; else delete window.__map3d;

    return () => {
      ro.disconnect();
      mq?.removeEventListener?.('change', onMq);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onMenu);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      root.classList.remove('is-dragging');
      engine.destroy();
      engineRef.current = null;
      map3dRef.current = null;
      delete window.__atlas;
      delete window.__map3d;
    };
  }, [engineKey]);

  // Insets first, so fit/focus below use the current uncovered box.
  useEffect(() => {
    engineRef.current?.setInsets(insets);
  }, [insets.left, insets.right, insets.top, insets.bottom, engineKey]);

  // New observation: rebuild what changed; frame the world once per match and seat.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.setData(data);
    } catch (e) {
      if (!map3dRef.current) throw e;
      // The 3D scene could not be built from this observation: keep the game playable.
      console.warn('The 3D map failed; using the flat atlas.', e);
      setFailed3d(true);
      return;
    }
    if (fittedKey.current !== viewKey) {
      fittedKey.current = viewKey;
      pendingFit.current = true;
    }
    tryFit.current();
  }, [data, viewKey, engineKey]);

  useEffect(() => {
    engineRef.current?.setOverlay({
      mode,
      selected,
      hovered: hoverId,
      targets: pick ? pick.targets : undefined,
      marked,
    });
  }, [mode, selected, hoverId, pick, marked, engineKey]);

  useEffect(() => {
    if (props.focus) engineRef.current?.focusRegion(props.focus.region);
  }, [props.focus?.nonce]);

  // Labels inside the 3D scene carry formatted numbers; refresh them when the language changes.
  useEffect(() => {
    map3dRef.current?.refreshText(t('Uncharted'));
  }, [locale, engineKey]);

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
  const hoveredDeposit = hovered && hoverDep && hoverDep.region === hovered.id ? hovered.survey?.deposits[hoverDep.index] ?? null : null;
  const style = {
    '--mi-l': insets.left + 'px',
    '--mi-r': insets.right + 'px',
    '--mi-t': insets.top + 'px',
    '--mi-b': insets.bottom + 'px',
  } as JSX.CSSProperties;
  const engine = engineRef.current;
  const m3 = map3dRef.current;
  const activeMode = MODES.find((m) => m.key === mode) ?? MODES[0];
  const is3d = tier === '3d';
  const heading = m3 ? m3.heading : 0;
  const canvasLabel = is3d
    ? t('3D map of the known world, {mode} view. Arrow keys or W A S D pan, plus and minus zoom, Q and E turn, N faces north, F fits the known world.', { mode: t(activeMode.label).toLowerCase() })
    : t('Atlas of the known world, {mode} view. Arrow keys pan, plus and minus zoom, F fits the known world.', { mode: t(activeMode.label).toLowerCase() });

  return (
    <div
      ref={rootRef}
      class={'map-view' + (is3d ? ' is-3d' : ' is-flat') + (pick ? ' is-picking' : '') + (hovered ? ' has-hover' : '')}
      style={style}
      data-mode={mode}
      data-tier={tier}
    >
      <canvas
        key={tier + gen}
        ref={canvasRef}
        class="map-canvas"
        data-testid="map-canvas"
        tabIndex={0}
        role="application"
        aria-label={canvasLabel}
      />
      {mode === 'construction' && !pick && (
        <DevelopmentCard
          obs={obs}
          selected={selected}
          building={data.construction ?? NO_BUILDING}
          categories={data.facilityCategories ?? NO_CATEGORIES}
          onSelect={onSelect}
          onFocus={(id) => engineRef.current?.focusRegion(id)}
          onBuild={props.onBuild}
          compact={typeof window !== 'undefined' && window.innerWidth - insets.left - insets.right < 640}
        />
      )}
      {is3d && <div ref={labelsRef} class="m3-labels" aria-hidden="true" />}
      {is3d && !mod3d && <div class="map-loading" role="status">{t('Preparing the 3D map…')}</div>}

      {is3d ? (
        <button
          type="button"
          class="map-compass-wrap map-compass-btn"
          data-testid="map-north"
          title={t('Reset north (N)')}
          aria-label={t('Reset north')}
          onClick={() => m3?.resetNorth()}
        >
          <span style={{ display: 'block', transform: `rotate(${(heading * 180) / Math.PI}deg)` }}><Compass /></span>
        </button>
      ) : (
        <div class="map-compass-wrap" aria-hidden="true"><Compass /></div>
      )}

      {pick && (
        <div class="map-pick" role="status">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <circle cx="8" cy="8" r="5.500" fill="none" stroke="currentColor" stroke-width="1.4" />
            <path d="M8 1v4M8 11v4M1 8h4M11 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
          <span class="map-pick-text">{pick.prompt}</span>
          <button type="button" class="map-btn map-pick-cancel" data-testid="map-pick-cancel" onClick={() => pick.onCancel()}>
            {t('Cancel')} <kbd>Esc</kbd>
          </button>
        </div>
      )}

      <div class="map-controls">
        <div class="map-zoom" role="group" aria-label={t('Zoom')}>
          <button type="button" class="map-btn" data-testid="map-zoom-in" title={t('Zoom in (+)')} aria-label={t('Zoom in')} onClick={() => engine?.zoomBy(1.35)}><IconPlus /></button>
          <button type="button" class="map-btn" data-testid="map-zoom-out" title={t('Zoom out (−)')} aria-label={t('Zoom out')} onClick={() => engine?.zoomBy(1 / 1.35)}><IconMinus /></button>
          <button type="button" class="map-btn" data-testid="map-fit" title={t('Fit the known world (F)')} aria-label={t('Fit the known world')} onClick={() => engine?.fit(true)}><IconFit /></button>
        </div>
        <div class="map-modebox">
          {legendOpen && (
            <div class="map-legend" data-testid="map-legend">
              <div class="map-legend-head">{t(activeMode.hint)}</div>
              <Legend obs={obs} mode={mode} tier={tier} />
            </div>
          )}
          <div class="map-moderow">
            <div class="map-modes" role="radiogroup" aria-label={t('Map mode')}>
              {MODES.map((m) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={m.key === mode}
                  class={'map-mode' + (m.key === mode ? ' is-on' : '')}
                  data-testid={`map-mode-${m.key}`}
                  title={t(m.hint)}
                  onClick={() => setMode(m.key)}
                >
                  {t(m.label)}
                </button>
              ))}
              <button
                type="button"
                class={'map-mode map-legend-toggle' + (legendOpen ? ' is-on' : '')}
                aria-pressed={legendOpen}
                title={legendOpen ? t('Hide legend') : t('Show legend')}
                aria-label={legendOpen ? t('Hide legend') : t('Show legend')}
                data-testid="map-legend-toggle"
                onClick={() => setLegendOpen(!legendOpen)}
              >
                <IconLegend />
              </button>
            </div>
            <div class="map-modes map-tiers" role="radiogroup" aria-label={t('Map rendering')}>
              <button
                type="button"
                role="radio"
                aria-checked={is3d}
                class={'map-mode' + (is3d ? ' is-on' : '')}
                data-testid="map-tier-3d"
                title={t('Living 3D map')}
                onClick={() => chooseTier('3d')}
              >
                {t('3D')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!is3d}
                class={'map-mode' + (!is3d ? ' is-on' : '')}
                data-testid="map-tier-flat"
                title={t('Flat atlas: the same information, lighter to draw')}
                onClick={() => chooseTier('flat')}
              >
                {t('Flat')}
              </button>
            </div>
          </div>
          {failed3d && (
            <div class="map-tier-note" role="status" data-testid="map-tier-note">{t('The 3D map is unavailable on this device; showing the flat atlas.')}</div>
          )}
        </div>
      </div>

      {is3d && (
        <div class="map-mini" title={t('Overview: click to move the view')}>
          <canvas ref={miniRef} class="map-mini-canvas" data-testid="map-minimap" aria-label={t('Overview map')} />
        </div>
      )}

      <div ref={tipRef} class={'map-tip' + (hovered ? ' is-on' : '')} role="tooltip" data-testid="map-tooltip">
        {hovered && <Tooltip obs={obs} region={hovered} mode={mode} pick={pick} deposit={hoveredDeposit} building={data.construction?.[hovered.id] ?? null} />}
      </div>
    </div>
  );
}
