// The regional development card of the construction map mode: built levels by
// sector for the regions this viewer governs, what is under construction, and the
// way into planning. It reads the same land-use summary the map draws from, and
// nothing about regions whose works the viewer is not told.
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Observation, RegionId, RegionView } from '../protocol';
import { SETTLEMENT_LABEL, int } from '../format';
import { t, tc } from '../i18n';
import { SECTORS, SECTOR_COLOR, SECTOR_LABEL, landUse, type Building, type LandUse } from './landuse';
import { drawChip, type ChipSpec } from './sites';
import { BUILT_RAMP } from './atlas';

/** A map chip as a legend swatch, drawn by the same code that draws it on the map. */
export function ChipSwatch({ chip, size = 20 }: { chip: ChipSpec; size?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawChip(ctx, { ...chip, label: undefined }, size / 2, size / 2, (size / 2 - 1.6) / (5.6 + Math.min(4, Math.max(1, chip.magnitude)) * 1.15));
  }, [chip.glyph, chip.color, chip.magnitude, size]);
  return <canvas ref={ref} class="map-swatch" style={{ width: size + 'px', height: size + 'px' }} aria-hidden="true" />;
}

/** Which colour is which sector, for the list (the detail view names them row by row). */
function SectorKey(): JSX.Element {
  return (
    <div class="dev-keys">
      {SECTORS.map((s) => <span><i class="dev-key" style={{ background: SECTOR_COLOR[s] }} />{t(SECTOR_LABEL[s])}</span>)}
    </div>
  );
}

function SectorBar({ use }: { use: LandUse }): JSX.Element {
  return (
    <span class="dev-bar" aria-hidden="true">
      {SECTORS.map((s) => (use.sectors[s] > 0 ? <i style={{ flexGrow: use.sectors[s], background: SECTOR_COLOR[s] }} /> : null))}
    </span>
  );
}

interface Row { r: RegionView; use: LandUse }

export interface DevelopmentProps {
  obs: Observation;
  selected: RegionId | null;
  building: Record<number, Building>;
  categories: Record<string, string>;
  onSelect(id: RegionId | null): void;
  onFocus(id: RegionId): void;
  onBuild?(id: RegionId): void;
}

export function DevelopmentCard({ obs, selected, building, categories, onSelect, onFocus, onBuild }: DevelopmentProps): JSX.Element {
  const rows: Row[] = [];
  for (const r of obs.regions) {
    const use = landUse(r, categories, building[r.id]);
    if (use) rows.push({ r, use });
  }
  rows.sort((a, b) => b.use.total - a.use.total || a.r.id - b.r.id);
  const sel = selected !== null ? obs.regions.find((r) => r.id === selected) ?? null : null;
  const row = sel ? rows.find((x) => x.r.id === sel.id) ?? null : null;
  const colorOf = (seat: number | null): string =>
    seat === obs.seat ? obs.civ.color : obs.others.find((o) => o.seat === seat)?.color ?? '#6b6257';
  const several = new Set(rows.map((x) => x.r.owner)).size > 1;

  if (sel && !row) {
    return (
      <aside class="map-province-plan" data-testid="province-plan">
        <small>{t('Regional development')}</small>
        <h3>{tc(sel.name)}</h3>
        <p class="dev-note">{t('What is built here is not disclosed to you.')}</p>
        {rows.length ? <button type="button" class="dev-link" onClick={() => onSelect(null)}>{t('All governed regions')}</button> : null}
      </aside>
    );
  }

  if (row) {
    const { r, use } = row;
    const max = Math.max(1, ...SECTORS.map((s) => use.sectors[s]));
    const projects = obs.projects.filter((p) => p.kind === 'build' && p.region === r.id);
    const queued = projects.length ? [] : (r.own?.construction_sites ?? []).filter((s) => s.queued_levels > 0);
    const nameOf = (kind: string): string =>
      tc(obs.catalog.facilities.find((f) => f.kind === kind)?.name ?? r.own?.facilities.find((f) => f.kind === kind)?.name ?? kind.replace(/_/g, ' '));
    return (
      <aside class="map-province-plan" data-testid="province-plan">
        <small>{t('Regional development')}</small>
        <h3>{tc(r.name)}</h3>
        <p>{t(SETTLEMENT_LABEL[r.settlement])} · {t('{n} people', { n: int(r.own?.population ?? 0) })} · {t('{n} built levels', { n: int(use.total) })}</p>
        <SectorBar use={use} />
        <ul class="dev-sectors" data-testid="province-sectors">
          {SECTORS.map((s) => (
            <li class={use.sectors[s] > 0 ? '' : 'is-none'}>
              <span class="dev-key" style={{ background: SECTOR_COLOR[s] }} />
              <span class="dev-name">{t(SECTOR_LABEL[s])}</span>
              <span class="dev-meter"><i style={{ width: ((use.sectors[s] / max) * 100).toFixed(1) + '%', background: SECTOR_COLOR[s] }} /></span>
              <b>{use.sectors[s]}</b>
            </li>
          ))}
        </ul>
        <div class="dev-queue">
          <span class="dev-queue-head">{t('Under construction')}</span>
          {projects.length ? (
            <ul>
              {projects.slice(0, 5).map((p) => (
                <li>
                  <span>{p.target ? nameOf(p.target) : tc(p.title)} <b>+{p.levels ?? 1}</b></span>
                  <em>{p.paused ? t('paused') : p.work_needed > 0 ? Math.floor((p.work_done / p.work_needed) * 100) + '%' : ''}</em>
                </li>
              ))}
              {projects.length > 5 ? <li class="dev-more">{t('and {n} more', { n: projects.length - 5 })}</li> : null}
            </ul>
          ) : queued.length ? (
            <ul>{queued.slice(0, 5).map((q) => <li><span>{nameOf(q.kind)} <b>+{q.queued_levels}</b></span></li>)}</ul>
          ) : <p class="dev-note">{t('Nothing is being built here.')}</p>}
        </div>
        {onBuild ? <button type="button" class="btn btn-primary" data-testid="province-build" onClick={() => onBuild(r.id)}>{t('Plan buildings')}</button> : null}
        {rows.length > 1 ? <button type="button" class="dev-link" data-testid="province-all" onClick={() => onSelect(null)}>{t('All governed regions')}</button> : null}
      </aside>
    );
  }

  return (
    <aside class="map-province-plan is-list" data-testid="province-plan">
      <small>{t('Regional development')}</small>
      {rows.length ? (
        <>
          <p class="dev-note">{onBuild ? t('Built levels by sector. Choose a region to see its works and plan buildings.') : t('Built levels by sector. Choose a region to see its works.')}</p>
          <ol class="dev-list" data-testid="province-list">
            {rows.map(({ r, use }) => (
              <li>
                <button type="button" onClick={() => { onSelect(r.id); onFocus(r.id); }}>
                  {several ? <span class="map-chip" style={{ background: colorOf(r.owner) }} /> : null}
                  <span class="dev-list-name">{tc(r.name)}</span>
                  <SectorBar use={use} />
                  <b>{use.total}</b>
                  <em>{use.building.levels > 0 ? '+' + use.building.levels : ''}</em>
                </button>
              </li>
            ))}
          </ol>
          <SectorKey />
          <div class="dev-ramp" title={t('Built levels per region, all sectors (steps at 10, 30, 60, 100, 160)')}>
            <span>{t('under 10')}</span>
            <span>{BUILT_RAMP.map((c) => <i style={{ background: c }} />)}</span>
            <span>{t('160 or more')}</span>
          </div>
        </>
      ) : <p class="dev-note">{t('You govern no regions whose works could be shown.')}</p>}
    </aside>
  );
}
