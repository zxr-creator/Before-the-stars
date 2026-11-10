// People & education: who can work, learn, teach or needs support.
import { useEffect, useState } from 'preact/hooks';
import type { CourseType, Observation, ProgramView, RegionId } from '../protocol';
import { QUAL_LABEL, fmtMonths, int, pct, peopleNum, tcChecks, tn, tx } from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import {
  ActionNote, Badge, Btn, Checklist, Empty, Field, GoodsList, Meter, NumInput, RegionLink, Section, Select, Stat, Why,
  cx, toneOfBp,
} from '../ui';
import { act, consumeIntent, useApp } from '../store';
import { AgeBar } from '../inspector';
import { LaborBar } from './economy';

export function PeoplePanel() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const civ = obs.civ;
  const [opening, setOpening] = useState(false);
  const [presetRegion, setPresetRegion] = useState<RegionId | undefined>(undefined);

  useEffect(() => {
    const it = s.intent;
    if (it?.kind === 'program') {
      setPresetRegion(it.region);
      setOpening(true);
      consumeIntent();
    }
  }, [s.intent?.nonce]);

  if (opening) return <OpenProgramme obs={obs} presetRegion={presetRegion} onDone={() => setOpening(false)} />;

  const natural = civ.births_last_round - civ.deaths_last_round;
  const quals = civ.quals.filter((q) => q.count > 0);
  const unqualified = Math.max(0, civ.working_age - civ.quals.reduce((a, q) => a + q.count, 0));

  return (
    <div class="panel people">
      <p class="panel-lede">{t('Who can work, learn, serve, or needs support?')}</p>

      <Section title={t('Population')} aside={<b title={int(civ.population)}>{peopleNum(civ.population)} <small class="muted">{t('people')}</small></b>}>
        <AgeBar children={civ.children} working={civ.working_age} elders={civ.elders} />
        <div class="stat-row">
          <Stat label={t('Births')} value={'+' + peopleNum(civ.births_last_round)} sub={t('last round')} />
          <Stat label={t('Deaths')} value={'−' + peopleNum(civ.deaths_last_round)} sub={t('last round')} />
          <Stat label={t('Migration')} value={(civ.migration_last_round > 0 ? '+' : civ.migration_last_round < 0 ? '−' : '') + peopleNum(Math.abs(civ.migration_last_round))} sub={t('net, last round')} />
          <Stat label={t('Natural change')} value={(natural >= 0 ? '+' : '−') + peopleNum(Math.abs(natural))} tone={natural < 0 ? 'bad' : undefined} sub={t('births − deaths')} />
        </div>
        <div class="mini-meters">
          <div class="mini-meter"><span class="mini-label">{t('Food access')}</span><Meter value={civ.food_fulfillment_bp} max={10000} tone={toneOfBp(civ.food_fulfillment_bp)} height={6} label={`${t('Food access')} ${pct(civ.food_fulfillment_bp)}`} /><span class="mini-val">{pct(civ.food_fulfillment_bp)}</span></div>
          <div class="mini-meter"><span class="mini-label">{t('Water access')}</span><Meter value={civ.water_fulfillment_bp} max={10000} tone={toneOfBp(civ.water_fulfillment_bp)} height={6} label={`${t('Water access')} ${pct(civ.water_fulfillment_bp)}`} /><span class="mini-val">{pct(civ.water_fulfillment_bp)}</span></div>
        </div>
        <p class="muted small">{t('Access is the person-weighted share of need met over the last twelve months.')}</p>
      </Section>

      <Section title={t('How working-age people spent last month')}>
        <LaborBar labor={civ.labor} />
      </Section>

      <Section title={t('Qualifications')} aside={<small class="muted">{t('people holding a maintained qualification')}</small>}>
        {quals.length === 0 ? <Empty>{t('No one holds a recognised qualification yet.')}</Empty> : (
          <table class="table">
            <thead><tr><th>{t('Qualification')}</th><th class="num">{isZh() ? t('People (count)') : 'People'}</th><th class="num">{t('In posts')}</th><th>{t('Employed')}</th></tr></thead>
            <tbody>
              {quals.map((q) => (
                <tr>
                  <th scope="row">{t(QUAL_LABEL[q.qual])}</th>
                  <td class="num"><b>{peopleNum(q.count)}</b></td>
                  <td class="num">{peopleNum(q.employed)}</td>
                  <td class="util-cell"><Meter value={q.employed} max={Math.max(1, q.count)} tone="accent" height={6} label={t('{n} of {total} in posts', { n: peopleNum(q.employed), total: peopleNum(q.count) })} /></td>
                </tr>
              ))}
              <tr class="is-total"><th scope="row">{t('No qualification')}</th><td class="num">{peopleNum(unqualified)}</td><td class="num muted">–</td><td class="muted small">{t('general labour')}</td></tr>
            </tbody>
          </table>
        )}
      </Section>

      <Section title={t('Teaching programmes')} aside={<Btn small kind="primary" icon="plus" testid="open-programme" onClick={() => { setPresetRegion(s.selectedRegion ?? undefined); setOpening(true); }}>{t('Open programme')}</Btn>}>
        {obs.programs.length === 0 ? <Empty>{t('No programme is running. Skills are kept alive only by people who teach them.')}</Empty> : (
          <ul class="program-list">{obs.programs.map((p) => <li><ProgramCard p={p} /></li>)}</ul>
        )}
        <ActionNote tag="program" />
      </Section>
    </div>
  );
}

function ProgramCard({ p }: { p: ProgramView }) {
  useLocale();
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  const blocked = p.blockers.length > 0;
  return (
    <div class={cx('card program', p.paused && 'is-paused', blocked && 'is-blocked')} data-testid="program-card">
      <div class="project-top">
        <div>
          <span class="kicker">{tx('Programme · {region}', { region: <RegionLink id={p.region} /> })}</span>
          <b class="project-title">{tc(p.course_name)}</b>
        </div>
        {p.paused ? <Badge tone="muted" icon="pause">{t('Paused')}</Badge> : blocked ? <Badge tone="warn" icon="warn">{t('Held back')}</Badge> : null}
      </div>
      <div class="program-grid">
        <div><span class="mini-label">{t('Enrolled')}</span><b>{peopleNum(p.enrolled)}</b><small>{t(' of {n} places', { n: peopleNum(p.seats) })}</small></div>
        <div><span class="mini-label">{t('Teachers')}</span><b>{peopleNum(p.teachers)}</b></div>
        <div><span class="mini-label">{t('Graduates')}</span><b>{peopleNum(p.graduates_total)}</b><small>{t(' so far')}</small></div>
      </div>
      <div class="progress-line">
        <Meter value={p.progress_months} max={Math.max(1, p.months)} tone={p.paused ? 'muted' : blocked ? 'warn' : 'accent'} label={t('Month {n} of {total} for the current cohort', { n: p.progress_months, total: p.months })} />
        <span class="progress-num">{tx('month {n} / {total}', { n: <b>{p.progress_months}</b>, total: p.months })}</span>
      </div>
      {blocked ? <ul class="blockers">{p.blockers.map((b) => <li><Icon name="warn" size={11} /> {tc(b)}</li>)}</ul> : null}
      <div class="project-actions">
        <span />
        <span class="row">
          <Btn small kind="ghost" icon={p.paused ? 'play' : 'pause'} disabled={s.busy} testid={`prog-pause-${p.id}`} onClick={() => void act({ kind: 'manage_program', program: p.id, op: p.paused ? 'resume' : 'pause', seats: null }, 'program', { quiet: true })}>{p.paused ? t('Resume') : t('Pause')}</Btn>
          {confirm ? (
            <>
              <Btn small kind="danger" disabled={s.busy} onClick={() => { setConfirm(false); void act({ kind: 'manage_program', program: p.id, op: 'cancel', seats: null }, 'program'); }}>{t('Close it')}</Btn>
              <Btn small kind="ghost" onClick={() => setConfirm(false)}>{t('Keep')}</Btn>
            </>
          ) : <Btn small kind="ghost" icon="close" onClick={() => setConfirm(true)}>{t('Close…')}</Btn>}
        </span>
      </div>
    </div>
  );
}

function entrantsText(c: CourseType): string {
  if (!c.entrants.length) return t('Any adult');
  return c.entrants.map((e) => (e === null ? t('Any adult') : t(QUAL_LABEL[e]))).join(t(' or '));
}

function OpenProgramme({ obs, presetRegion, onDone }: { obs: Observation; presetRegion?: RegionId; onDone: () => void }) {
  useLocale();
  const s = useApp();
  const regions = obs.regions.filter((r) => r.own);
  const [region, setRegion] = useState<RegionId | undefined>(presetRegion !== undefined && regions.some((r) => r.id === presetRegion) ? presetRegion : (regions.find((r) => r.id === obs.civ.capital) ?? regions[0])?.id);
  const [key, setKey] = useState<string | null>(null);
  const [seats, setSeats] = useState(0);
  // places are real learners (units-and-scale §3-4): a venue level offers thousands, a programme at most
  // `limits.program_seats_max`, and a cohort with nobody qualified to teach it at most `founding_cohort_max`
  const limits = obs.units?.limits;
  const seatsMax = limits?.program_seats_max ?? 2_000_000;
  const founding = limits?.founding_cohort_max ?? 4_000;
  const course = obs.catalog.courses.find((c) => c.key === key) ?? null;
  const r = regions.find((x) => x.id === region) ?? regions[0];
  if (!r) return <div class="panel"><Empty>{t('We govern no region to teach in.')}</Empty></div>;
  const teachersHere = course ? course.teachers.map((q) => ({ q, n: r.own!.quals.find((x) => x.qual === q)?.count ?? 0 })) : [];
  const unmetReq = course?.requirements.find((x) => !x.satisfied);
  // Teaching places in this region's venue, when the referee reports them.
  const venue = course ? r.own!.venues?.find((v) => v.venue === course.venue) : undefined;
  const venuesKnown = r.own!.venues !== undefined;
  const free = venue ? Math.max(0, venue.capacity - venue.reserved) : venuesKnown ? 0 : null;
  const places = seats || Math.max(course?.class_size ?? 1, Math.min(founding, free ?? founding)) || 1;
  // The venue name comes from the referee; English lower-cases it mid-sentence.
  const venueWord = course ? (isZh() ? tc(course.venue_name) : course.venue_name.toLowerCase()) : '';
  const why = !course ? t('Choose a course')
    : !course.available ? (unmetReq ? t('Requires: {req}', { req: tc(unmetReq.text) }) : t('A known requirement is unmet'))
    : free === 0 ? t('{region} has no free places in a {venue}; build or extend one first', { region: r.name, venue: venueWord })
    : free !== null && places > free ? tn(free, 'Only {n} place is free in the {venue} at {region}', 'Only {n} places are free in the {venue} at {region}', { n: free, venue: venueWord, region: r.name })
    : null;
  const teachersNeeded = Math.ceil(places / Math.max(1, course?.class_size ?? 1));
  const running = (k: string) => obs.programs.filter((p) => p.course === k && p.region === r.id).length;

  const submit = async () => {
    if (!course) return;
    const rec = await act({ kind: 'start_program', region: r.id, course: course.key, seats: places }, 'new-program');
    if (rec.length && rec.every((x) => x.status === 'accepted' || x.status === 'applied')) onDone();
  };

  return (
    <div class="panel people">
      <div class="subnav">
        <button type="button" class="linklike" onClick={onDone}><Icon name="left" size={12} /> {t('People & education')}</button>
        <h3 class="subnav-title">{t('Open a programme')}</h3>
      </div>
      <div class="form">
        <Field label={t('Region')} hint={t('{n} people · {working} of working age', { n: peopleNum(r.own!.population), working: peopleNum(r.own!.working_age) })}>
          <Select value={r.id} options={regions.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => setRegion(v)} label={t('Region to teach in')} testid="program-region" />
        </Field>
        <div class="field">
          <span class="field-label">{t('Course')}</span>
          <div class="course-picker" role="listbox" aria-label={t('Course')}>
            {obs.catalog.courses.map((c) => (
              <button type="button" role="option" aria-selected={key === c.key} class={cx('fac-option', key === c.key && 'is-active', !c.available && 'is-locked')}
                data-testid={`course-${c.key}`} onClick={() => { setKey(c.key); setSeats(0); }}>
                <span class="fac-option-name">{!c.available ? <Icon name="lock" size={12} title={t('Requirements not met')} /> : null}{tc(c.name)}</span>
                <span class="fac-option-meta">→ {t(QUAL_LABEL[c.output])} · {fmtMonths(c.months)}{running(c.key) ? t(' · {n} running here', { n: running(c.key) }) : ''}</span>
              </button>
            ))}
          </div>
        </div>
        {course ? (
          <div class="card detail" data-testid="course-detail">
            <b class="detail-title">{tc(course.name)}</b>
            <p class="detail-desc">{tc(course.description)}</p>
            <dl class="kvs">
              <div class="kv"><dt>{t('Produces')}</dt><dd><b>{t(QUAL_LABEL[course.output])}</b></dd></div>
              <div class="kv"><dt>{t('Entrants')}</dt><dd>{entrantsText(course)}</dd></div>
              <div class="kv"><dt>{t('Taught by')}</dt><dd>{course.teachers.length ? teachersHere.map((th, i) => <span>{i ? t(' or ') : ''}{t(QUAL_LABEL[th.q])} <small class={th.n ? 'muted' : 'warn-text'}>{t('({n} in {region})', { n: peopleNum(th.n), region: r.name })}</small></span>) : <span class="muted">{t('no special teacher')}</span>}</dd></div>
              <div class="kv"><dt>{t('Length')}</dt><dd>{t('{duration} per cohort', { duration: fmtMonths(course.months) })}</dd></div>
              <div class="kv"><dt>{t('Class size')}</dt><dd>{t('{n} learners per teacher', { n: course.class_size })}</dd></div>
              <div class="kv"><dt>{t('Venue')}</dt><dd>{tc(course.venue_name)}{free !== null ? <small class={free ? 'muted' : 'warn-text'}>{t(' · {n} of {total} places free in {region}', { n: peopleNum(free), total: peopleNum(venue?.capacity ?? 0), region: r.name })}</small> : <small class="muted">{t(' · needed in {region}', { region: r.name })}</small>}</dd></div>
              <div class="kv"><dt>{isZh() ? t('Materials (course)') : 'Materials'}</dt><dd><GoodsList items={course.materials} per={t('per thousand learners each month')} empty={t('none')} /></dd></div>
            </dl>
            {course.requirements.length ? (<><p class="sub-label">{t('Requirements')}</p><Checklist items={tcChecks(course.requirements)} /></>) : null}
            <Field label={t('Places')} hint={tn(teachersNeeded, 'Learners study instead of working. {n} teacher needed at this size.', 'Learners study instead of working. {n} teachers needed at this size.', { n: teachersNeeded })}>
              <NumInput value={places} min={1} max={Math.max(1, Math.min(seatsMax, free ?? seatsMax))} step={1000} unit={t('places')} label={t('Places')} width={110} onChange={setSeats} testid="program-seats" />
            </Field>
          </div>
        ) : <p class="muted small">{t('Choose a course to see who may enter, who teaches it and what it needs.')}</p>}
        <div class="form-actions">
          <Btn kind="primary" icon="people" why={why} disabled={s.busy} testid="program-submit" onClick={() => void submit()}>{t('Open programme')}</Btn>
          {course && why ? <Why>{why}</Why> : null}
        </div>
        <ActionNote tag="new-program" />
      </div>
    </div>
  );
}
