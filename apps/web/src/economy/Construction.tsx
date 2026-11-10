import { useEffect, useState } from 'preact/hooks';
import type { Observation } from '../protocol';
import { act, selectRegion, useApp } from '../store';
import { ActionNote, Btn, GoodsList, Meter } from '../ui';
import { int, milli, pct } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { siteCapacity } from '../panels/projects';
import './construction.css';

/** Every card is an actual regional installation. Queued levels reserve site capacity. */
export function Construction({ obs }: { obs: Observation }) {
  useLocale();
  const s = useApp();
  const regions = obs.regions.filter(r => r.own);
  const [region, setRegion] = useState(s.selectedRegion ?? obs.civ.capital);
  const [category, setCategory] = useState('all');
  const [levels, setLevels] = useState(1);
  useEffect(() => { if (regions.some(r => r.id === s.selectedRegion)) setRegion(s.selectedRegion!); }, [s.selectedRegion]);
  const r = regions.find(r => r.id === region) ?? regions[0];
  if (!r?.own) return null;
  const own = r.own;
  const categories = [...new Set(obs.catalog.facilities.map(f => f.category))];
  const queue = obs.projects.filter(p => p.kind === 'build' && p.region === r.id);
  const readOnly = s.mode === 'observe';
  return <section class="construction" data-testid="construction-browser">
    <header class="construction-head"><Icon name="projects" size={22} /><div><h3>{t('Regional construction')}</h3><p>{t('Build a place in the economy, then expand its capacity.')}</p></div></header>
    <div class="construction-location">
      <select class="select" aria-label={t('Construction region')} data-testid="construction-region" value={r.id} onChange={e => { const id = Number(e.currentTarget.value); setRegion(id); selectRegion(id, true); }}>
        {regions.map(x => <option value={x.id}>{tc(x.name)} · {int(x.own!.population)}</option>)}
      </select>
      <Btn small nav icon="compass" onClick={() => selectRegion(r.id, true)}>{t('Locate')}</Btn>
    </div>
    <div class="construction-stats"><span><b>{int(own.working_age)}</b> {t('working age')}</span><span><b>{own.facilities.reduce((n, f) => n + f.level, 0)}</b> {t('built levels')}</span><span><b>{queue.reduce((n, p) => n + (p.levels ?? 1), 0)}</b> {t('queued levels')}</span></div>
    <div class="construction-filters"><select class="select" aria-label={t('Building category')} value={category} onChange={e => setCategory(e.currentTarget.value)}><option value="all">{t('All buildings')}</option>{categories.map(c => <option value={c}>{tc(c)}</option>)}</select><label>{t('Levels')} <select class="select" value={levels} onChange={e => setLevels(Number(e.currentTarget.value))}>{[1, 2, 5].map(n => <option value={n}>{n}</option>)}</select></label></div>
    <div class="construction-cards">
      {obs.catalog.facilities.filter(f => category === 'all' || f.category === category).map(f => {
        const built = own.facilities.find(x => x.kind === f.kind);
        const site = own.construction_sites?.find(x => x.kind === f.kind);
        const queued = site?.queued_levels ?? queue.filter(p => p.target === f.kind).reduce((n, p) => n + (p.levels ?? 1), 0);
        const cap = site?.max_level ?? built?.max_level ?? siteCapacity(f, r)?.levels ?? f.max_level ?? 0;
        const room = Math.max(0, cap - (built?.level ?? 0) - queued);
        const n = Math.min(levels, room);
        const why = !f.available ? f.requirements.filter(x => !x.satisfied).map(x => tc(x.text)).join(' · ') || t('Requirements not met') : !room ? t('No remaining site capacity') : null;
        const jobs = f.jobs.reduce((n, j) => n + j.count, 0);
        return <article class={'building-card' + (!f.available || !cap ? ' is-unavailable' : '')} data-testid={`building-${f.kind}`}>
          <div class="building-heading"><span class="building-medallion"><Icon name={f.labor_category === 'extraction' ? 'resources' : f.labor_category === 'knowledge' ? 'knowledge' : 'projects'} size={21} /></span><div><small>{tc(f.category)}</small><h4>{tc(f.name)}</h4></div><strong class="building-level">{built?.level ?? 0}<small> / {cap}</small></strong></div>
          <p class="building-description">{tc(f.description)}</p>
          {built ? <><div class="row-between small"><span>{t('Utilization')} {pct(built.utilization_bp)}</span><span>{int(built.staffed)}/{int(built.staff_needed)} {t('staff')}</span></div><Meter value={built.utilization_bp} max={10000} height={5} />{built.runs.flatMap(x => x.blockers).length ? <p class="building-warning">{built.runs.flatMap(x => x.blockers).map(tc).join(' · ')}</p> : null}</> : null}
          <div class="building-cost"><span>{t('Construction')} ×{n || levels}</span><GoodsList items={f.cost.map(x => ({ ...x, amount: x.amount * (n || levels) }))} empty={t('labour only')} /></div>
          <p class="small muted">{t('Work')} {milli((site?.work_per_level ?? f.work) * (n || levels))} · {jobs * (n || levels)} {t('base posts')} · {tc(f.site)}</p>
          {f.upkeep.length ? <div class="building-cost small"><span>{t('Monthly upkeep / level')}</span><GoodsList items={f.upkeep} /></div> : null}
          {f.recipes.filter(x => x.available).slice(0, 2).map(rc => <div class="building-process small"><b>{tc(rc.name)}</b><span><GoodsList items={rc.inputs} empty={t('labour only')} /> → <GoodsList items={rc.outputs} empty={tc(rc.note) || t('services')} /></span></div>)}
          {built?.scale_saving_bp ? <p class="building-scale">{t('Shared support saves {n}% of general posts.', { n: built.scale_saving_bp / 100 })}</p> : null}
          {queued ? <p class="building-queued">{t('{n} levels under construction', { n: queued })}</p> : null}
          <div class="row-between"><small class="building-warning">{why}</small><Btn small kind="primary" disabled={s.busy || readOnly || !!why} testid={`construct-${f.kind}`} onClick={() => void act({ kind: 'start_project', spec: { kind: 'build', region: r.id, facility: f.kind, levels: n }, priority: 5 }, 'construction')}>{built ? t('Expand') : t('Build')} +{n || levels}</Btn></div>
        </article>;
      })}
    </div>
    <p class="construction-note">{t('Factories share support work as maintained levels grow, up to 20%. Skilled posts, inputs, power and upkeep still have to be supplied. Concentration also concentrates supply and war risk.')}</p>
    {queue.length ? <div class="construction-queue"><h4>{t('Construction queue')}</h4>{queue.map(p => <div><span>{tc(p.title)}</span><Meter value={p.work_done} max={Math.max(1, p.work_needed)} height={5} /><small>{p.blockers.map(tc).join(' · ') || t('Priority {n}', { n: p.priority })}</small></div>)}</div> : null}
    <ActionNote tag="construction" />
  </section>;
}
