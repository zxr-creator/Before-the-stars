// Workforce: where the working-age population spent last month, how much labour
// the state may call up, qualifications against posts, the regions, and the
// standing policies that steer all of it.
import type { LaborSummary, Observation } from '../protocol';
import { LABOR_LABEL, QUAL_LABEL, int, pct } from '../format';
import { t, tc } from '../i18n';
import { ActionNote, Meter, Stepper, cx } from '../ui';
import { act, useApp } from '../store';
import type { Ledger } from './model';
import { Bar, E, Glyph, V, people, tip } from './parts';
import type { Nav } from './Ledger';

interface Part { key: string; label: string; cls: string; n: number; hint: string }

function parts(labor: LaborSummary, soldiers: number): Part[] {
  const counted = labor.food + labor.facilities + labor.projects + labor.household + labor.students + labor.teachers;
  const out: Part[] = [
    { key: 'food', label: 'Food', cls: 'is-food', n: labor.food, hint: 'Growing, herding, fishing and gathering. Food is staffed before anything else.' },
    { key: 'facilities', label: 'Works', cls: 'is-works', n: labor.facilities, hint: 'Posts filled in works other than farms.' },
    { key: 'projects', label: 'Projects', cls: 'is-projects', n: labor.projects, hint: 'Called up for building, surveys and other public projects.' },
    { key: 'students', label: 'Students', cls: 'is-students', n: labor.students, hint: 'Enrolled in courses. Students do not work.' },
    { key: 'teachers', label: 'Teachers', cls: 'is-teachers', n: labor.teachers, hint: 'Qualified people teaching a course.' },
    { key: 'soldiers', label: 'Soldiers', cls: 'is-soldiers', n: soldiers, hint: 'Under arms. Counted apart from the regions they came from.' },
    { key: 'household', label: 'Without post', cls: 'is-idle', n: labor.household, hint: 'Able to work but with no post. They make a little building material while stores have room.' },
    { key: 'out', label: 'Not available', cls: 'is-out', n: Math.max(0, labor.working_age - counted), hint: 'Working-age people who cannot be counted on: about one in twelve, to care and infirmity.' },
  ];
  return out;
}

function LaborStack({ list, height = 26, labels }: { list: Part[]; height?: number; labels?: boolean }) {
  const total = Math.max(1, list.reduce((a, p) => a + p.n, 0));
  return (
    <span class="ledger-stack" style={{ height: height + 'px' }} role="img" aria-label={list.filter((p) => p.n > 0).map((p) => `${t(p.label)} ${p.n}`).join(', ')}>
      {list.filter((p) => p.n > 0).map((p) => (
        <i class={cx('ledger-stack-seg', p.cls)} style={{ width: ((p.n / total) * 100).toFixed(2) + '%' }}
          {...tip(t('{label}: {n} people, {pct} of the total.', { label: t(p.label), n: people(p.n), pct: ((p.n / total) * 100).toFixed(1) + '%' }) + '\n' + t(p.hint) + '\n' + t('As counted last month. Verified by the referee.'))}>
          {labels && p.n / total > 0.07 ? <b>{people(p.n)}</b> : null}
        </i>
      ))}
    </span>
  );
}

export function WorkforceTab({ obs, ledger, nav }: { obs: Observation; ledger: Ledger; nav: Nav }) {
  const s = useApp();
  const civ = obs.civ;
  const labor = civ.labor;
  const list = parts(labor, ledger.soldiers);
  const total = list.reduce((a, p) => a + p.n, 0);
  const nonFood = labor.facilities + labor.projects + labor.household;
  const capBp = civ.mobilization_cap_bp;
  const limitBp = Math.round((capBp * civ.policies.mobilization_bp) / 10000);
  const usedBp = nonFood > 0 ? Math.round((labor.projects / nonFood) * 10000) : 0;
  const vacancies = ledger.regions.reduce((a, r) => a + r.vacancies, 0);
  const posts = ledger.regions.reduce((a, r) => a + r.posts, 0);
  const quals = [...ledger.quals].sort((a, b) => b.vacancies - a.vacancies || b.count - a.count);
  const weights = civ.policies.labor_weights;
  const tallied = total > 0 && labor.working_age > 0;
  const qualified = ledger.quals.reduce((a, q) => a + q.count, 0);
  const qualifiedInPost = ledger.quals.reduce((a, q) => a + Math.min(q.count, q.employed), 0);
  const running = obs.programs.filter((p) => !p.paused && p.enrolled > 0).length;

  return (
    <div class="ledger-workforce" data-testid="ledger-workforce">
      <div class="ledger-wf-top">
        <section class="ledger-panel ledger-wf-stack">
          <header class="ledger-panel-head">
            <h3>{t('Working-age people last month')}</h3>
            <span class="ledger-panel-aside"><V tipText={t('People of working age across our regions, plus soldiers. Verified by the referee.')}>{people(total)}</V> {t('people')}</span>
          </header>
          {tallied ? (
            <>
              <LaborStack list={list} labels />
              <ul class="ledger-legend">
                {list.map((p) => (
                  <li class={p.n === 0 ? 'is-zero' : undefined} {...tip(t(p.hint))}>
                    <i class={cx('ledger-key', p.cls)} /><span>{t(p.label)}</span><b>{people(p.n)}</b><small>{total ? ((p.n / total) * 100).toFixed(p.n / total < 0.1 ? 1 : 0) + '%' : ''}</small>
                  </li>
                ))}
              </ul>
            </>
          ) : <p class="ledger-none">{t('Labour is tallied at the end of each round; no record yet.')}</p>}

          <div class="ledger-callup">
            <div class="ledger-callup-head">
              <h4>{t('Callable labour')}</h4>
              <span>
                <V tipText={t('Share of non-food labour that projects actually took last month: {n} of {total} people. Verified by the referee.', { n: people(labor.projects), total: people(nonFood) })}>{pct(usedBp, usedBp < 100 && usedBp > 0 ? 1 : 0)}</V> {t('called up')} ·{' '}
                <V tipText={t('Policy: the state uses {pct} of what custom allows.', { pct: pct(civ.policies.mobilization_bp) })}>{pct(limitBp)}</V> {t('allowed by policy')} ·{' '}
                <V tipText={t('The most that custom and institutions let the state direct, as a share of labour left after food. Verified by the referee.')}>{pct(capBp)}</V> {t('cap')}
              </span>
            </div>
            <span class="ledger-callup-bar" role="img" aria-label={t('Called up {used} of non-food labour; policy allows {limit}; the cap is {cap}.', { used: pct(usedBp), limit: pct(limitBp), cap: pct(capBp) })}
              {...tip(t('The whole bar is all labour left after food. Hatched: what custom lets the state call up. Solid frame: what policy allows. Fill: what projects took last month.'))}>
              <i class="ledger-callup-cap" style={{ width: capBp / 100 + '%' }} />
              <i class="ledger-callup-limit" style={{ width: limitBp / 100 + '%' }} />
              <i class="ledger-callup-used" style={{ width: Math.min(100, usedBp / 100) + '%' }} />
            </span>
            <p class="ledger-callup-note">{t('Institutions raise the cap; the rest of the labour staffs works in the order of the weights on the right.')}</p>
          </div>
          <div class="ledger-kpis ledger-wf-kpis">
            <div class={cx('ledger-kpi', vacancies > 0 && 'is-warn')} {...tip(t('Posts filled of posts offered in works that are switched on, farms aside. Verified by the referee.'))}>
              <small>{t('Posts filled')}</small><b>{people(posts - vacancies)}<small> / {people(posts)}</small></b>
              <span>{vacancies > 0 ? t('{n} standing empty', { n: people(vacancies) }) : t('none standing empty')}</span>
            </div>
            <div class="ledger-kpi" {...tip(t('People holding a qualification, and how many of them were in a qualified post or teaching last month. Verified by the referee.'))}>
              <small>{t('Qualified people')}</small><b>{people(qualified)}</b>
              <span>{t('{n} in post', { n: people(qualifiedInPost) })}</span>
            </div>
            <div class="ledger-kpi" {...tip(t('Students enrolled in running programmes, and the teachers they occupy. From the programme list and the labour tally.'))}>
              <small>{t('In training')}</small><b>{people(labor.students)}</b>
              <span>{t('{n} courses running, {teachers} teachers', { n: running, teachers: people(labor.teachers) })}</span>
            </div>
          </div>
        </section>

        <section class="ledger-panel ledger-wf-policy">
          <header class="ledger-panel-head"><h3>{t('Standing policy')}</h3><span class="ledger-panel-aside">{t('applies from the next month resolved')}</span></header>
          <p class="sub-label">{t('Labour priorities')} <small class="muted">{t('relative weight 0–10; higher is staffed first')}</small></p>
          <div class="ledger-policy">
            {weights.map(([cat, w]) => (
              <div class="ledger-policy-row" {...tip(t('Works of this kind are staffed before kinds with a lower weight.'))}>
                <span class="ledger-policy-name">{t(LABOR_LABEL[cat])}</span>
                <Meter value={w} max={10} tone="accent" height={6} label={t('{label} weight {w} of 10', { label: t(LABOR_LABEL[cat]), w })} />
                <Stepper value={w} min={0} max={10} label={t('{label} weight', { label: t(LABOR_LABEL[cat]) })} testid={`ledger-weight-${cat}`} disabled={s.busy}
                  onChange={(v) => void act({ kind: 'set_policy', setting: { kind: 'labor_weight', category: cat, weight: v } }, 'policy', { quiet: true })} />
              </div>
            ))}
            <div class="ledger-policy-row is-sep" {...tip(t('Labour stays on food until this many months of food are in store.'))}>
              <span class="ledger-policy-name">{t('Food reserve target')}<small>{ledger.foodCover !== null ? t('{n} months in store now', { n: ledger.foodCover.toFixed(1) }) : ''}</small></span>
              <Meter value={ledger.foodCover ?? 0} max={Math.max(1, civ.policies.food_reserve_months)} tone={(ledger.foodCover ?? 0) >= civ.policies.food_reserve_months ? 'ok' : 'warn'} height={6}
                label={t('Food in store against the reserve target')} />
              <Stepper value={civ.policies.food_reserve_months} min={0} max={36} unit={t('mo')} label={t('Food reserve months')} testid="ledger-food-reserve" disabled={s.busy}
                onChange={(v) => void act({ kind: 'set_policy', setting: { kind: 'food_reserve_months', months: v } }, 'policy', { quiet: true })} />
            </div>
            <div class="ledger-policy-row" {...tip(t('Share of the callable labour the state actually uses for projects. The cap is {pct} of non-food labour.', { pct: pct(capBp) }))}>
              <span class="ledger-policy-name">{t('Call-up for projects')}<small>{t('share of the {pct} cap', { pct: pct(capBp) })}</small></span>
              <Meter value={civ.policies.mobilization_bp} max={10000} tone="accent" height={6} label={t('Call-up {pct}', { pct: pct(civ.policies.mobilization_bp) })} />
              <Stepper value={Math.round(civ.policies.mobilization_bp / 100)} min={0} max={100} step={10} unit="%" label={t('Call-up share')} testid="ledger-mobilization" disabled={s.busy}
                onChange={(v) => void act({ kind: 'set_policy', setting: { kind: 'mobilization', bp: v * 100 } }, 'policy', { quiet: true })} />
            </div>
          </div>
          <ActionNote tag="policy" />
        </section>
      </div>

      <div class="ledger-wf-tables">
        <section class="ledger-panel">
          <header class="ledger-panel-head">
            <h3>{t('Qualifications')}</h3>
            <span class="ledger-panel-aside"><button type="button" class="linklike" onClick={() => nav.train()}>{t('Start a course')}</button></span>
          </header>
          {quals.length ? (
            <table class="table ledger-tbl">
              <thead>
                <tr>
                  <th>{t('Qualification')}</th>
                  <th class="num" {...tip(t('People holding it. Verified by the referee.'))}>{t('Holders')}</th>
                  <th class="num" {...tip(t('In a qualified post or teaching last month. Verified by the referee.'))}>{t('In post')}</th>
                  <th class="num" {...tip(t('People minus employed: free for general work, or without a post.'))}>{t('Idle')}</th>
                  <th class="num" {...tip(t('Students enrolled in running courses that grant it. From the programme list.'))}>{t('In training')}</th>
                  <th class="num" {...tip(t('Estimate: posts for it in works that are switched on (catalogue posts per level × level).'))}>{t('Posts')}</th>
                  <th class="num" {...tip(t('Estimate: posts minus employed. Teachers count as employed, so this can read low.'))}>{t('Vacancies')}</th>
                  <th>{t('In post and idle')}</th>
                </tr>
              </thead>
              <tbody>
                {quals.map((q) => (
                  <tr>
                    <th scope="row">{t(QUAL_LABEL[q.qual])}</th>
                    <td class="num"><V>{people(q.count)}</V></td>
                    <td class="num"><V>{people(q.employed)}</V></td>
                    <td class="num">{q.idle ? people(q.idle) : <span class="muted">–</span>}</td>
                    <td class="num">{q.training ? people(q.training) : <span class="muted">–</span>}</td>
                    <td class="num">{q.posts ? <E>{people(q.posts)}</E> : <span class="muted">–</span>}</td>
                    <td class={cx('num', q.vacancies > 0 && 'neg')}>{q.vacancies ? <E>{people(q.vacancies)}</E> : <span class="muted">–</span>}</td>
                    <td class="ledger-tbl-bar"><Bar parts={[{ value: q.employed, cls: 'is-works' }, { value: q.idle, cls: 'is-idle' }]} max={Math.max(1, q.count, q.posts)} mark={q.posts > 0 ? q.posts : undefined} height={7}
                      tipText={t('Employed (solid) and idle (dotted) against posts (tick).')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p class="ledger-none">{t('No one holds a qualification yet. Courses are started from the people panel.')}</p>}
        </section>

        <section class="ledger-panel">
          <header class="ledger-panel-head">
            <h3>{t('Regions')}</h3>
            <span class="ledger-panel-aside"><E tipText={t('Posts standing empty in works that are switched on, of all such posts. From the referee’s staffing counts.')}>{people(vacancies)}</E> {t('open posts of {n}', { n: people(posts) })}</span>
          </header>
          <table class="table ledger-tbl">
            <thead>
              <tr>
                <th>{t('Region')}</th>
                <th class="num" {...tip(t('Residents. Verified by the referee.'))}>{t('People')}</th>
                <th class="num" {...tip(t('People of working age. Verified by the referee.'))}>{t('Working age')}</th>
                <th class="num" {...tip(t('Posts filled of posts offered in works that are switched on, farms aside. Verified by the referee.'))}>{t('Posts')}</th>
                <th class="num" {...tip(t('Posts offered minus posts filled.'))}>{t('Open posts')}</th>
                <th class="num" {...tip(t('Working-age people with no post last month. Verified by the referee.'))}>{t('Without post')}</th>
                <th {...tip(t('How this region’s working-age people spent last month, in the colours of the bar above.'))}>{t('Labour')}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.regions.map((r) => (
                <tr>
                  <th scope="row"><button type="button" class="linklike" onClick={() => nav.toRegion(r.region.id)} {...tip(t('Open this region’s works.'))}>{tc(r.region.name)}</button></th>
                  <td class="num"><V>{people(r.own.population)}</V></td>
                  <td class="num"><V>{people(r.own.working_age)}</V></td>
                  <td class="num"><V>{people(r.filled)}</V><small class="muted">/{people(r.posts)}</small></td>
                  <td class={cx('num', r.vacancies > 0 && 'neg')}>{r.vacancies ? people(r.vacancies) : <span class="muted">–</span>}</td>
                  <td class="num"><V>{people(r.household)}</V></td>
                  <td class="ledger-tbl-bar is-wide"><LaborStack list={parts(r.own.labor, 0)} height={10} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.regions.length === 0 ? <p class="ledger-none">{t('We govern no region.')}</p> : null}
        </section>
      </div>
      <p class="ledger-footnote"><Glyph name="idle" size={13} /> {t('One person works one job. Food is staffed first, then projects up to the call-up limit, then works in the order of the weights. People without posts drift slowly toward regions that are hiring.')}</p>
    </div>
  );
}
