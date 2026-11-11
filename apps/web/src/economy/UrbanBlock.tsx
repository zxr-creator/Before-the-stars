// A governed region's city, land budget, food provisioning, housing, transport lines and walls
// (OwnRegion.urban, bts-protocol/2.3), for the region inspector and the works overview.
import type { Observation, RegionView, UrbanView } from '../protocol';
import { SETTLEMENT_LABEL, int, pct, peopleNum } from '../format';
import { t, tc, useLocale } from '../i18n';
import { KV, Meter, Section, toneOfBp } from '../ui';
import { lineLabel } from './labels';
import './r3.css';

// i18n-table
export const NETWORK_LABEL: Record<string, string> = {
  roads: 'Roads and highways', canals: 'Canals', harbour: 'Ports', railway: 'Rail and high-speed rail', air: 'Airports',
  urban_transit: 'Metro and urban transit',
};
// i18n-end

const LAND: { key: keyof UrbanView; label: string; color: string }[] = [
  { key: 'land_urban_milli', label: 'Urban', color: '#8c7b6a' },
  { key: 'land_industrial_milli', label: 'Industry', color: '#6f6c78' },
  { key: 'land_farmland_milli', label: 'Fields', color: '#c9b75a' },
  { key: 'land_pasture_milli', label: 'Pasture', color: '#93b578' },
  { key: 'land_forest_milli', label: 'Forest', color: '#4f7f55' },
  { key: 'land_wild_milli', label: 'Rough ground', color: '#bdb6a2' },
];

export function landUnits(milli: number): string {
  return (milli / 1000).toFixed(milli >= 10_000 ? 0 : 1);
}

export function UrbanBlock({ obs, r }: { obs: Observation; r: RegionView }) {
  useLocale();
  const u = r.own?.urban;
  if (!u) return null;
  const total = Math.max(1, u.land_total_milli);
  const city = r.city_size;
  const walls = (r.own?.facilities ?? []).filter((f) => obs.catalog.facilities.find((x) => x.kind === f.kind)?.line === 'fortifications');
  const fed = Math.min(r.own!.population, u.provision_capacity);
  return (
    <Section title={t('City and land')} aside={city ? <b data-testid="city-class">{t(SETTLEMENT_LABEL[city.class])}</b> : null}>
      <div data-testid="urban-block">
        <dl class="kvs">
          {city ? <KV k={t('Principal city')}>{tc(city.name)} · <b>{peopleNum(city.residents)}</b> <small class="muted">{t('residents')}</small></KV> : null}
          <KV k={t('Urban share')} title={t('Share of residents in the towns and city')}>{pct(u.urban_share_bp)}</KV>
          <KV k={t('Housing')} title={t('Residents in built housing, and those in informal shelter on the edges')}>{t('{housed} housed · {informal} informal', { housed: peopleNum(u.housed), informal: peopleNum(u.informal) })}</KV>
          <KV k={t('Fed from the common stock')} title={t('Provisioning buildings let residents be fed from the common stock, up to this many')}>
            {t('up to {n}', { n: peopleNum(u.provision_capacity) })}{u.provision_capacity > 0 ? <small class="muted"> · {t('{n} at present', { n: peopleNum(fed) })}</small> : null}
          </KV>
        </dl>
        <div class="urb-land" role="img" aria-label={t('Land budget')}>
          {LAND.map((l) => { const v = Number(u[l.key]); return v > 0 ? <i style={{ width: (100 * v / total) + '%', background: l.color }} title={`${t(l.label)}: ${landUnits(v)}`} /> : null; })}
        </div>
        <ul class="urb-legend" data-testid="land-budget">
          {LAND.map((l) => <li><i style={{ background: l.color }} />{t(l.label)} <b>{landUnits(Number(u[l.key]))}</b></li>)}
          <li class="muted">{t('{n} arable land left', { n: landUnits(u.arable_left) })}</li>
        </ul>
        <p class="muted small">{t('Land is counted in land units; the whole region holds {n}.', { n: landUnits(u.land_total_milli) })}</p>
        {u.network.length ? (
          <ul class="urb-net" data-testid="transport-lines">
            {u.network.map((n) => <li>{t(NETWORK_LABEL[n.mode] ?? lineLabel(n.mode))} <small class="muted">· {t('stage {n}', { n: n.stage })} · {t('{n} levels', { n: int(n.levels) })}</small></li>)}
          </ul>
        ) : <p class="muted small">{t('No transport lines built yet.')}</p>}
        <dl class="kvs">
          <KV k={t('Access')} title={t('How well people and goods move inside the region')}><Meter value={u.access_bp} max={10000} tone={toneOfBp(u.access_bp, 6000, 3000)} height={5} label={pct(u.access_bp)} /> {pct(u.access_bp)}</KV>
          {u.congestion_bp > 0 ? <KV k={t('Congestion')}>{pct(u.congestion_bp)}</KV> : null}
          <KV k={t('Walls')} title={t('Defenders fight at this share of their strength behind the walls')}>
            {walls.length ? walls.map((f) => `${tc(f.name)} ×${f.level}`).join(' · ') + ' · ' : null}
            {t('defence {pct}', { pct: pct(u.defence_bp) })}
          </KV>
        </dl>
      </div>
    </Section>
  );
}
