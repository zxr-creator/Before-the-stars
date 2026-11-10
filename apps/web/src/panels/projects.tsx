// Projects: what is under way, what holds it back, and the flows for starting
// new work. Costs and requirements come from the seat's own catalog.
import { useEffect, useState } from 'preact/hooks';
import type { FacilityType, Observation, ProjectView, RegionId, RegionView } from '../protocol';
import {
  GOOD_SHORT, QUAL_LABEL, RESEARCH_LABEL, TERRAIN_LABEL, fmtDate, int, joinList, lc, milli, tcAll, tcChecks, titleCase, tn, tx,
} from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import {
  ActionNote, Badge, Btn, Checklist, Empty, Est, Field, GoodsList, Meter, NumInput, RegionLink, Section, Select,
  Stepper, Why, cx, work,
} from '../ui';
import { act, consumeIntent, startPick, cancelPick, useApp } from '../store';

type NewKind = 'build' | 'survey' | 'settle' | 'study' | 'resettle';
const NEW_KINDS: { key: NewKind; label: string; hint: string }[] = [
  { key: 'build', label: 'Build', hint: 'Build or extend works in a region' },
  { key: 'survey', label: 'Survey', hint: 'Send a party to record a region' },
  { key: 'settle', label: 'Settle', hint: 'Found a camp in neighbouring unclaimed land' },
  { key: 'study', label: 'Study', hint: 'Bounded exploratory study of a known domain' },
  { key: 'resettle', label: 'Resettle', hint: 'Move people between governed regions' },
];

const KIND_LABEL: Record<string, string> = {
  build: 'Construction', research: 'Investigation', lead: 'Lead follow-up', survey: 'Survey', settle: 'Settlement',
  study: 'Exploratory study', resettle: 'Resettlement', recruit: 'Recruitment', reform: 'Reform', religion: 'Movement',
  ftl_trial: 'Jump trial', ftl_deployment: 'Deployment exercise', ftl_replacement: 'Replacement',
};

/** Display name of a project kind. "Settlement" also names a settled place elsewhere, so Chinese uses its own key. */
function kindLabel(kind: string): string {
  const en = KIND_LABEL[kind];
  if (!en) return titleCase(kind);
  if (kind === 'settle') return isZh() ? t('Settlement (project)') : en;
  return t(en);
}

interface Preset { region?: RegionId; from?: RegionId; to?: RegionId }

export function ProjectsPanel() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const [mode, setMode] = useState<NewKind | null>(null);
  const [preset, setPreset] = useState<Preset>({});

  useEffect(() => {
    const it = s.intent;
    if (!it) return;
    if (it.kind === 'build') { setPreset({ region: it.region }); setMode('build'); consumeIntent(); }
    else if (it.kind === 'survey') { setPreset({ region: it.region }); setMode('survey'); consumeIntent(); }
    else if (it.kind === 'settle') { setPreset({ from: it.from, to: it.to }); setMode('settle'); consumeIntent(); }
    else if (it.kind === 'resettle') { setPreset({ from: it.from }); setMode('resettle'); consumeIntent(); }
    else if (it.kind === 'study') { setPreset({}); setMode('study'); consumeIntent(); }
  }, [s.intent?.nonce]);

  if (mode) {
    const done = () => { setMode(null); cancelPick(); };
    return (
      <div class="panel projects">
        <div class="subnav">
          <button type="button" class="linklike" data-testid="newproject-back" onClick={done}><Icon name="left" size={12} /> {t('All projects')}</button>
          <h3 class="subnav-title">{t('New project')}</h3>
        </div>
        <div class="segmented wrap" role="tablist" aria-label={t('Kind of project')}>
          {NEW_KINDS.map((k) => (
            <button type="button" role="tab" aria-selected={mode === k.key} class={cx('seg', mode === k.key && 'is-active')} title={t(k.hint)}
              data-testid={`newkind-${k.key}`} onClick={() => setMode(k.key)}>{t(k.label)}</button>
          ))}
        </div>
        {mode === 'build' ? <BuildForm obs={obs} preset={preset} onDone={done} /> : null}
        {mode === 'survey' ? <SurveyForm obs={obs} preset={preset} onDone={done} /> : null}
        {mode === 'settle' ? <SettleForm obs={obs} preset={preset} onDone={done} /> : null}
        {mode === 'study' ? <StudyForm obs={obs} onDone={done} /> : null}
        {mode === 'resettle' ? <ResettleForm obs={obs} preset={preset} onDone={done} /> : null}
      </div>
    );
  }

  const sorted = obs.projects.slice().sort((a, b) => a.priority - b.priority || a.id - b.id);
  return (
    <div class="panel projects">
      <p class="panel-lede">{t('Work advances only with real labour and delivered inputs. Projects are supplied in priority order: 0 first, 9 last.')}</p>
      <div class="row-between">
        <span class="muted small">{t('{n} under way', { n: obs.projects.length })}</span>
        <Btn kind="primary" icon="plus" testid="new-project" onClick={() => { setPreset({ region: s.selectedRegion ?? undefined }); setMode('build'); }}>{t('New project')}</Btn>
      </div>
      {sorted.length === 0 ? <Empty>{t('No projects yet. Build works, survey the neighbouring land, or fund an exploratory study.')}</Empty> : null}
      <ul class="project-list">
        {sorted.map((p) => <li><ProjectCard p={p} /></li>)}
      </ul>
      <ActionNote tag="project" />
    </div>
  );
}

export function ProjectCard({ p, compact }: { p: ProjectView; compact?: boolean }) {
  useLocale();
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  const frac = p.work_needed > 0 ? p.work_done / p.work_needed : 0;
  const blocked = p.blockers.length > 0;
  return (
    <div class={cx('card project', p.paused && 'is-paused', blocked && 'is-blocked')} data-testid="project-card" data-kind={p.kind}>
      <div class="project-top">
        <div>
          <span class="kicker">{kindLabel(p.kind)}{p.region !== null ? <> · <RegionLink id={p.region} /></> : null}</span>
          <b class="project-title">{tc(p.title)}</b>
        </div>
        {p.paused ? <Badge tone="muted" icon="pause">{t('Paused')}</Badge> : blocked ? <Badge tone="warn" icon="warn">{t('Held back')}</Badge> : null}
      </div>
      <div class="progress-line">
        <Meter value={frac} tone={p.paused ? 'muted' : blocked ? 'warn' : 'accent'} label={t('{pct}% of the work done', { pct: Math.round(frac * 100) })} />
        <span class="progress-num"><b>{work(p.work_done)}</b> / {work(p.work_needed)} <small>{t('work')}</small></span>
      </div>
      <div class="project-meta">
        <span title={t('Work done in the last month resolved')}>{p.last_progress > 0 ? <>+{work(p.last_progress)} <small>{t('last month')}</small></> : <span class="muted">{t('no progress last month')}</span>}</span>
        <span>
          {p.eta_months_low !== null && p.eta_months_high !== null
            ? <Est kind="forecast" title={t('Forecast from recent progress; not a guarantee')}>{p.eta_months_low === p.eta_months_high ? t('≈ {n} months left', { n: p.eta_months_low }) : t('≈ {lo}–{hi} months left', { lo: p.eta_months_low, hi: p.eta_months_high })}</Est>
            : <span class="muted" title={t('No recent progress to forecast from')}>{t('time left unknown')}</span>}
        </span>
        <span class="muted">{t('since {date}', { date: fmtDate(p.started_month) })}</span>
      </div>
      {p.inputs_needed.length ? (
        <ul class="inputs">
          {p.inputs_needed.map((need) => {
            const got = p.inputs_committed.find((c) => c.good === need.good)?.amount ?? 0;
            const full = got >= need.amount;
            return (
              <li class={full ? 'is-full' : undefined} title={t('{good}: {got} delivered of {need} needed', { good: t(GOOD_SHORT[need.good]), got: milli(got), need: milli(need.amount) })}>
                <span class="input-name">{t(GOOD_SHORT[need.good])}</span>
                <Meter value={got} max={Math.max(1, need.amount)} tone={full ? 'ok' : 'gold'} height={5} />
                <span class="input-num">{milli(got)}/{milli(need.amount)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {blocked ? <ul class="blockers">{p.blockers.map((b) => <li><Icon name="warn" size={11} /> {tc(b)}</li>)}</ul> : null}
      {!compact ? (
        <div class="project-actions">
          <span class="prio" title={t('Lower numbers are supplied with labour and stores first')}>{t('Priority')} <small class="muted">{t('(0 first)')}</small> <Stepper value={p.priority} min={0} max={9} label={t('Priority')} disabled={s.busy} testid={`prio-${p.id}`}
            onChange={(v) => void act({ kind: 'manage_project', project: p.id, op: p.paused ? 'pause' : 'resume', priority: v }, 'project', { quiet: true })} /></span>
          <span class="row">
            <Btn small kind="ghost" icon={p.paused ? 'play' : 'pause'} disabled={s.busy} testid={`proj-pause-${p.id}`} onClick={() => void act({ kind: 'manage_project', project: p.id, op: p.paused ? 'resume' : 'pause', priority: null }, 'project', { quiet: true })}>{p.paused ? t('Resume') : t('Pause')}</Btn>
            {confirm ? (
              <>
                <Btn small kind="danger" disabled={s.busy} testid={`cancel-confirm-${p.id}`} onClick={() => { setConfirm(false); void act({ kind: 'manage_project', project: p.id, op: 'cancel', priority: null }, 'project'); }}>{t('Cancel it')}</Btn>
                <Btn small kind="ghost" onClick={() => setConfirm(false)}>{t('Keep')}</Btn>
              </>
            ) : <Btn small kind="ghost" icon="close" title={t('Inputs already consumed are not refunded')} testid={`proj-cancel-${p.id}`} onClick={() => setConfirm(true)}>{t('Cancel…')}</Btn>}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// --- new project forms ---------------------------------------------------------------

function ownRegions(obs: Observation): RegionView[] {
  return obs.regions.filter((r) => r.own);
}

function regionOptions(regions: RegionView[]) {
  return regions.map((r) => ({ value: r.id, label: r.name }));
}

/** What the survey says this site can carry, from the catalog's structured site rule. `basis` is display text. */
export function siteCapacity(fac: FacilityType, r: RegionView): { levels: number; basis: string } | null {
  const max = fac.max_level && fac.max_level > 0 ? fac.max_level : null;
  const key = fac.site_key;
  if (!key) return null;
  const clamp = (n: number, basis: string) => ({ levels: max !== null ? Math.min(max, n) : n, basis });
  const sv = r.survey;
  if (key === 'any') return max !== null ? { levels: max, basis: '' } : null;
  if (key === 'coast') return r.coastal ? (max !== null ? { levels: max, basis: t('coast') } : null) : { levels: 0, basis: t('no coast') };
  if (key === 'river') return r.river ? (max !== null ? { levels: max, basis: t('river') } : null) : { levels: 0, basis: t('no river') };
  if (!sv) return null;
  if (key === 'arable') return clamp(sv.arable, t('{n} arable sites surveyed', { n: sv.arable }));
  if (key === 'pasture') return clamp(sv.pasture, t('{n} pasture sites surveyed', { n: sv.pasture }));
  if (key === 'fishery') return clamp(sv.fishery, t('{n} fishing grounds surveyed', { n: sv.fishery }));
  if (key === 'forest') return clamp(sv.forest, t('{n} forest stands surveyed', { n: sv.forest }));
  if (key === 'hydro') return clamp(sv.hydro, t('{n} hydro sites surveyed', { n: sv.hydro }));
  if (key.startsWith('deposit:')) {
    const kind = key.slice(8);
    return sv.deposits.some((d) => d.kind === kind) ? (max !== null ? { levels: max, basis: t('deposit known') } : null) : sv.detailed ? { levels: 0, basis: t('no such deposit found') } : null;
  }
  if (key === 'test_node') return r.test_node ? (max !== null ? { levels: max, basis: t('test node') } : null) : { levels: 0, basis: t('not a test node') };
  if (key.startsWith('with:')) {
    const need = key.slice(5);
    return r.own?.facilities.some((f) => f.kind === need && f.level > 0) ? (max !== null ? { levels: max, basis: '' } : null) : { levels: 0, basis: t('needs companion works here') };
  }
  return null;
}

function recipeServices(rc: FacilityType['recipes'][number]): string {
  const parts: string[] = [];
  if (rc.out_shaft) parts.push(t('{n} shaft power', { n: milli(rc.out_shaft) }));
  if (rc.out_elec) parts.push(t('{n} electricity', { n: milli(rc.out_elec) }));
  if (rc.out_compute) parts.push(t('{n} computation', { n: milli(rc.out_compute) }));
  if (rc.research) parts.push(t('{n} {kind} work', { n: milli(rc.research[1]), kind: lc(RESEARCH_LABEL[rc.research[0]]) }));
  return parts.join(' · ');
}

function unmet(reqs: { text: string; satisfied: boolean }[]): string | null {
  const m = reqs.find((r) => !r.satisfied);
  return m ? t('Requires: {req}', { req: tc(m.text) }) : null;
}

function PriorityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Field label={t('Priority')} hint={t('0–9. Lower numbers receive labour and stores first.')}>
      <Stepper value={value} min={0} max={9} label={t('Priority')} onChange={onChange} testid="new-priority" />
    </Field>
  );
}

function accepted(receipts: { status: string }[]): boolean {
  return receipts.length > 0 && receipts.every((r) => r.status === 'accepted' || r.status === 'applied');
}

function BuildForm({ obs, preset, onDone }: { obs: Observation; preset: Preset; onDone: () => void }) {
  useLocale();
  const s = useApp();
  const regions = ownRegions(obs);
  const initialRegion = preset.region !== undefined && regions.some((r) => r.id === preset.region) ? preset.region : (regions.find((r) => r.id === obs.civ.capital) ?? regions[0])?.id;
  const [region, setRegion] = useState<RegionId | undefined>(initialRegion);
  const [kind, setKind] = useState<string | null>(null);
  const [levels, setLevels] = useState(1);
  const [priority, setPriority] = useState(5);
  useEffect(() => {
    if (preset.region !== undefined && regions.some((r) => r.id === preset.region)) setRegion(preset.region);
  }, [preset.region]);

  if (!regions.length || region === undefined) return <Empty>{t('We govern no region to build in.')}</Empty>;
  const r = regions.find((x) => x.id === region) ?? regions[0];
  const cats: { cat: string; items: FacilityType[] }[] = [];
  for (const f of obs.catalog.facilities) {
    const g = cats.find((c) => c.cat === f.category);
    if (g) g.items.push(f);
    else cats.push({ cat: f.category, items: [f] });
  }
  const fac = obs.catalog.facilities.find((f) => f.kind === kind) ?? null;
  const existing = fac ? r.own!.facilities.find((f) => f.kind === fac.kind) : undefined;
  const pending = fac ? obs.projects.filter((p) => p.kind === 'build' && p.region === r.id && p.target === fac.kind).reduce((n, p) => n + (p.levels ?? 1), 0) : 0;
  const site = fac ? siteCapacity(fac, r) : null;
  const cap = r.own!.construction_sites?.find(x => x.kind === fac?.kind)?.max_level ?? (existing ? existing.max_level : site?.levels ?? null);
  const room = cap !== null ? Math.max(0, cap - (existing?.level ?? 0) - pending) : null;
  const why = !fac ? t('Choose what to build') : !fac.available ? (unmet(fac.requirements) ?? t('A known requirement is unmet')) : room === 0 ? (cap === 0 ? t('{region} has no suitable site: {site}', { region: r.name, site: isZh() ? tc(fac.site) : fac.site.toLowerCase() }) : t('{region} cannot carry more levels of this at present', { region: r.name })) : null;
  const maxLevels = Math.max(1, Math.min(20, room ?? 20));
  const lv = Math.min(levels, maxLevels);

  const submit = async () => {
    if (!fac) return;
    const rec = await act({ kind: 'start_project', spec: { kind: 'build', region: r.id, facility: fac.kind, levels: lv }, priority }, 'new-build');
    if (accepted(rec)) onDone();
  };

  return (
    <div class="form">
      <Field label={t('Region')} hint={`${t(TERRAIN_LABEL[r.terrain])}${r.coastal ? t(', coast') : ''}${r.river ? t(', river') : ''} · ${t('{n} people', { n: int(r.own!.population) })}`}>
        <Select value={r.id} options={regionOptions(regions)} onChange={(v) => setRegion(v)} label={t('Region to build in')} testid="build-region" />
      </Field>
      <div class="field">
        <span class="field-label">{t('What to build')}</span>
        <div class="fac-picker" role="listbox" aria-label={t('Facility type')}>
          {cats.map((c) => (
            <div class="fac-group">
              <p class="group-label">{tc(c.cat)}</p>
              {c.items.map((f) => {
                const have = r.own!.facilities.find((x) => x.kind === f.kind);
                return (
                  <button type="button" role="option" aria-selected={kind === f.kind} class={cx('fac-option', kind === f.kind && 'is-active', !f.available && 'is-locked')}
                    data-testid={`fac-${f.kind}`} onClick={() => { setKind(f.kind); setLevels(1); }}>
                    <span class="fac-option-name">{!f.available ? <Icon name="lock" size={12} title={t('Requirements not met')} /> : null}{tc(f.name)}</span>
                    <span class="fac-option-meta">{have ? t('level {n}/{max}', { n: have.level, max: have.max_level }) : siteCapacity(f, r)?.levels === 0 ? t('no site here') : t('not built here')}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {fac ? (
        <div class="card detail" data-testid="build-detail">
          <b class="detail-title">{tc(fac.name)}</b>
          <p class="detail-desc">{tc(fac.description)}</p>
          <dl class="kvs">
            <div class="kv"><dt>{t('Site')}</dt><dd>{tc(fac.site)}{cap !== null ? <small class="muted">{existing
              ? tn(cap, ' · {region} can carry {n} level at present', ' · {region} can carry {n} levels at present', { n: cap, region: r.name })
              : site?.basis
                ? tn(cap, ' · {region} can carry {n} level ({basis})', ' · {region} can carry {n} levels ({basis})', { n: cap, region: r.name, basis: site.basis })
                : tn(cap, ' · {region} can carry {n} level', ' · {region} can carry {n} levels', { n: cap, region: r.name })}</small> : null}</dd></div>
            <div class="kv"><dt>{t('Cost per level')}</dt><dd><GoodsList items={fac.cost} empty={t('no stores')} /></dd></div>
            <div class="kv"><dt>{t('Work per level')}</dt><dd>{tx('{n} work', { n: <b>{work(r.own!.construction_sites?.find(x => x.kind === fac.kind)?.work_per_level ?? fac.work)}</b> })}</dd></div>
            <div class="kv"><dt>{t('Posts per level')}</dt><dd>{fac.jobs.length ? fac.jobs.map((j, i) => <span>{i ? ' · ' : ''}<b>{j.count}</b> {j.qual ? lc(QUAL_LABEL[j.qual]) : t('general labour')}</span>) : <span class="muted">{t('none')}</span>}</dd></div>
            {fac.upkeep.length ? <div class="kv"><dt>{t('Upkeep')}</dt><dd><GoodsList items={fac.upkeep} per={t('per level each month')} empty={t('none')} /></dd></div> : null}
            {fac.provides.length ? <div class="kv"><dt>{t('Provides')}</dt><dd>{tcAll(fac.provides).join(' · ')}</dd></div> : null}
          </dl>
          {fac.recipes.length ? (
            <div class="recipes">
              <p class="sub-label">{t('Processes')}</p>
              {fac.recipes.map((rc) => (
                <div class={cx('recipe', !rc.available && 'is-locked')}>
                  <span class="recipe-name">{!rc.available ? <Icon name="lock" size={11} title={t('Not yet workable')} /> : null}{tc(rc.name)}</span>
                  <span class="recipe-flow"><GoodsList items={rc.inputs} empty={t('labour only')} /> <Icon name="right" size={10} /> {rc.outputs.length || !recipeServices(rc) ? <GoodsList items={rc.outputs} empty={t('services')} /> : null}{recipeServices(rc) ? <span>{rc.outputs.length ? ' · ' : ''}{recipeServices(rc)}</span> : null} <small class="muted">{t('per level each month')}</small></span>
                  {rc.shaft || rc.elec || rc.compute ? <small class="muted">{t('needs {list}', { list: joinList([rc.shaft ? t('{n} shaft power', { n: milli(rc.shaft) }) : '', rc.elec ? t('{n} electricity', { n: milli(rc.elec) }) : '', rc.compute ? t('{n} computation', { n: milli(rc.compute) }) : ''].filter(Boolean)) })}</small> : null}
                  {rc.note ? <small class="muted">{tc(rc.note)}</small> : null}
                </div>
              ))}
            </div>
          ) : null}
          {fac.requirements.length ? (<><p class="sub-label">{t('Requirements')}</p><Checklist items={tcChecks(fac.requirements)} /></>) : null}
          {pending ? <p class="note">{tn(pending, 'Already ordered here: {n} construction project of this kind.', 'Already ordered here: {n} construction projects of this kind.', { n: pending })}</p> : null}
          <div class="form-row">
            <Field label={t('Levels')}><Stepper value={lv} min={1} max={maxLevels} label={t('Levels')} onChange={setLevels} testid="build-levels" /></Field>
            <PriorityField value={priority} onChange={setPriority} />
          </div>
          <p class="total-line">{tx('Total: {goods} · {work} work {note}', {
            goods: <GoodsList items={fac.cost.map((c) => ({ good: c.good, amount: c.amount * lv }))} empty={t('no stores')} />,
            work: <b>{work(fac.work * lv)}</b>,
            note: <small class="muted">{t('(a first-of-its-kind build takes half as long again)')}</small>,
          })}</p>
        </div>
      ) : <p class="muted small">{t('Choose a kind of works to see its cost, posts and requirements.')}</p>}

      <div class="form-actions">
        <Btn kind="primary" icon="hammer" why={why} disabled={s.busy} testid="build-submit" onClick={() => void submit()}>{t('Order construction')}</Btn>
        {fac && why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="new-build" />
    </div>
  );
}

function SurveyForm({ obs, preset, onDone }: { obs: Observation; preset: Preset; onDone: () => void }) {
  useLocale();
  const s = useApp();
  const known = obs.regions.filter((r) => !(r.own && r.survey?.detailed));
  const knownIds = new Set(obs.regions.map((r) => r.id));
  // Neighbour links name land that has never been seen; a survey may be sent there.
  const beyond: { id: RegionId; via: string; sea: boolean }[] = [];
  for (const r of obs.regions) {
    for (const n of r.neighbors) {
      if (!knownIds.has(n.region) && !beyond.some((b) => b.id === n.region)) beyond.push({ id: n.region, via: r.name, sea: n.kind === 'sea' });
    }
  }
  const running = new Set(obs.projects.filter((p) => p.kind === 'survey' && p.region !== null).map((p) => p.region!));
  const options = [
    ...known.map((r) => ({ value: r.id, label: (r.survey ? t('{region} — surface record only', { region: r.name }) : t('{region} — not surveyed', { region: r.name })) + (running.has(r.id) ? t(' (party assigned)') : ''), group: t('Known regions') })),
    ...beyond.map((b) => ({ value: b.id, label: (b.sea ? t('Unmapped land beyond {region} (by sea)', { region: b.via }) : t('Unmapped land beyond {region}', { region: b.via })) + (running.has(b.id) ? t(' (party assigned)') : ''), group: t('Beyond the map') })),
  ];
  const [target, setTarget] = useState<RegionId | undefined>(preset.region !== undefined && options.some((o) => o.value === preset.region) ? preset.region : options[0]?.value);
  const [priority, setPriority] = useState(5);
  if (!options.length || target === undefined) return <Empty>{t('Every region we know of is fully recorded.')}</Empty>;
  const why = running.has(target) ? t('A survey party is already assigned there') : null;
  const submit = async () => {
    const rec = await act({ kind: 'start_project', spec: { kind: 'survey', region: target }, priority }, 'new-survey');
    if (accepted(rec)) onDone();
  };
  return (
    <div class="form">
      <p class="form-intro">{t('A supplied party records land, water and visible deposits. The nearest governed region provisions it with food and tools; farther targets take longer.')}</p>
      <Field label={t('Target')}>
        <span class="row">
          <Select value={target} options={options} onChange={(v) => setTarget(v)} label={t('Region to survey')} testid="survey-target" />
          <Btn small kind="ghost" icon="pin" onClick={() => startPick({ prompt: t('Choose a region to survey'), targets: known.map((r) => r.id), onPick: (id) => { setTarget(id); cancelPick(); } })}>{t('Pick on map')}</Btn>
        </span>
      </Field>
      <PriorityField value={priority} onChange={setPriority} />
      <div class="form-actions">
        <Btn kind="primary" icon="eye" why={why} disabled={s.busy} testid="survey-submit" onClick={() => void submit()}>{t('Send survey party')}</Btn>
        {why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="new-survey" />
    </div>
  );
}

function SettleForm({ obs, preset, onDone }: { obs: Observation; preset: Preset; onDone: () => void }) {
  useLocale();
  const s = useApp();
  const regions = ownRegions(obs);
  const byId = new Map(obs.regions.map((r) => [r.id, r]));
  const targetsOf = (from: RegionView) => from.neighbors
    .map((n) => ({ link: n.kind, r: byId.get(n.region) }))
    .filter((x): x is { link: string; r: RegionView } => !!x.r && x.r.owner === null && !x.r.own);
  // If only the destination is known, start from a governed neighbour of it.
  const fromGuess = preset.from ?? (preset.to !== undefined ? regions.find((r) => r.neighbors.some((n) => n.region === preset.to))?.id : undefined) ?? regions.find((r) => targetsOf(r).length)?.id ?? regions[0]?.id;
  const [from, setFrom] = useState<RegionId | undefined>(fromGuess);
  const [to, setTo] = useState<RegionId | undefined>(preset.to);
  const [people, setPeople] = useState(40);
  const [priority, setPriority] = useState(5);
  useEffect(() => {
    if (preset.from !== undefined) setFrom(preset.from);
    if (preset.to !== undefined) setTo(preset.to);
  }, [preset.from, preset.to]);
  if (!regions.length || from === undefined) return <Empty>{t('We govern no region to send settlers from.')}</Empty>;
  const fr = byId.get(from) ?? regions[0];
  const targets = targetsOf(fr);
  const toId = to !== undefined && targets.some((tg) => tg.r.id === to) ? to : targets[0]?.r.id;
  const spare = Math.max(0, fr.own!.population - 80);
  const why = toId === undefined ? t('No unclaimed land we have seen borders {region}', { region: fr.name }) : people < 20 || people > 400 ? t('A settling party is 20 to 400 people') : people > spare ? t('{region} can spare at most {n} people', { region: fr.name, n: int(spare) }) : null;
  const submit = async () => {
    if (toId === undefined) return;
    const rec = await act({ kind: 'start_project', spec: { kind: 'settle', from: fr.id, to: toId, people }, priority }, 'new-settle');
    if (accepted(rec)) onDone();
  };
  return (
    <div class="form">
      <p class="form-intro">{t('Real settlers leave with real stores and found a camp in unclaimed land that borders the sending region. The party is provisioned with food, tools and materials before it leaves.')}</p>
      <Field label={t('From')} hint={t('{n} people live there; at least 80 must remain.', { n: int(fr.own!.population) })}>
        <Select value={fr.id} options={regionOptions(regions)} onChange={(v) => { setFrom(v); setTo(undefined); }} label={t('Sending region')} testid="settle-from" />
      </Field>
      <Field label={t('To')} hint={targets.length ? undefined : t('Survey or explore the neighbouring land first.')}>
        {targets.length ? (
          <span class="row">
            <Select value={toId!} options={targets.map((tg) => ({ value: tg.r.id, label: `${tg.r.name} — ${t(TERRAIN_LABEL[tg.r.terrain])}${tg.link === 'sea' ? t(', across water') : tg.link === 'pass' ? t(', over a pass') : ''}${tg.r.survey ? '' : t(', not surveyed')}` }))} onChange={(v) => setTo(v)} label={t('Destination')} testid="settle-to" />
            <Btn small kind="ghost" icon="pin" onClick={() => startPick({ prompt: t('Choose unclaimed land next to {region}', { region: fr.name }), targets: targets.map((tg) => tg.r.id), onPick: (id) => { setTo(id); cancelPick(); } })}>{t('Pick on map')}</Btn>
          </span>
        ) : <span class="muted">{t('No unclaimed neighbouring land is known.')}</span>}
      </Field>
      <div class="form-row">
        <Field label={t('Settlers')}><NumInput value={people} min={20} max={400} step={10} unit={t('people')} label={t('Settlers')} onChange={setPeople} testid="settle-people" /></Field>
        <PriorityField value={priority} onChange={setPriority} />
      </div>
      <div class="form-actions">
        <Btn kind="primary" icon="flag" why={why} disabled={s.busy} testid="settle-submit" onClick={() => void submit()}>{t('Provision settlers')}</Btn>
        {why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="new-settle" />
    </div>
  );
}

function ResettleForm({ obs, preset, onDone }: { obs: Observation; preset: Preset; onDone: () => void }) {
  useLocale();
  const s = useApp();
  const regions = ownRegions(obs);
  const [from, setFrom] = useState<RegionId | undefined>(preset.from ?? regions[0]?.id);
  const [to, setTo] = useState<RegionId | undefined>(regions.find((r) => r.id !== (preset.from ?? regions[0]?.id))?.id);
  const [people, setPeople] = useState(20);
  const [priority, setPriority] = useState(5);
  if (regions.length < 2 || from === undefined) return <Empty>{regions.length === 1 ? t('Resettlement moves people between two regions we govern; we govern only one.') : t('Resettlement moves people between two regions we govern; we govern none.')}</Empty>;
  const fr = regions.find((r) => r.id === from) ?? regions[0];
  const others = regions.filter((r) => r.id !== fr.id);
  const toId = to !== undefined && others.some((r) => r.id === to) ? to : others[0].id;
  const spare = Math.max(0, fr.own!.population - 50);
  const why = people < 1 ? t('Choose how many people move') : people > spare ? t('{region} can spare at most {n} people', { region: fr.name, n: int(spare) }) : null;
  const submit = async () => {
    const rec = await act({ kind: 'start_project', spec: { kind: 'resettle', from: fr.id, to: toId, people }, priority }, 'new-resettle');
    if (accepted(rec)) onDone();
  };
  return (
    <div class="form">
      <p class="form-intro">{t('Move households between governed regions. They travel with food for the journey.')}</p>
      <div class="form-row">
        <Field label={t('From')} hint={t('{n} people', { n: int(fr.own!.population) })}><Select value={fr.id} options={regionOptions(regions)} onChange={(v) => setFrom(v)} label={t('From region')} /></Field>
        <Field label={t('To')}><Select value={toId} options={regionOptions(others)} onChange={(v) => setTo(v)} label={t('To region')} /></Field>
      </div>
      <div class="form-row">
        <Field label={isZh() ? t('People (count)') : 'People'}><NumInput value={people} min={1} max={Math.max(1, spare)} step={10} unit={t('people')} label={t('People to move')} onChange={setPeople} /></Field>
        <PriorityField value={priority} onChange={setPriority} />
      </div>
      <div class="form-actions">
        <Btn kind="primary" icon="swap" why={why} disabled={s.busy} onClick={() => void submit()}>{t('Organize resettlement')}</Btn>
        {why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="new-resettle" />
    </div>
  );
}

export function StudyForm({ obs, onDone }: { obs: Observation; onDone?: () => void }) {
  useLocale();
  const s = useApp();
  const running = new Set(obs.projects.filter((p) => p.kind === 'study').map((p) => p.target));
  return (
    <div class="form">
      <p class="form-intro">{t('An exploratory study spends investigators’ time on a domain you already practise. It yields evidence and sometimes a lead; it cannot be aimed at a chosen discovery, and it may find nothing.')}</p>
      {obs.knowledge.domains.length === 0 ? <Empty>{t('No domain is yet well enough known to study.')}</Empty> : null}
      <ul class="domain-list">
        {obs.knowledge.domains.map((d) => (
          <li class="card domain">
            <div>
              <b>{tc(d.name)}</b>
              <p>{tc(d.description)}</p>
            </div>
            <Btn small icon="knowledge" why={running.has(d.key) ? t('This study is already under way') : null} disabled={s.busy} testid={`study-${d.key}`}
              onClick={async () => {
                const rec = await act({ kind: 'start_project', spec: { kind: 'study', domain: d.key }, priority: null }, 'new-study');
                if (accepted(rec) && onDone) onDone();
              }}>{running.has(d.key) ? t('Under way') : t('Fund study')}</Btn>
          </li>
        ))}
      </ul>
      <ActionNote tag="new-study" />
    </div>
  );
}
