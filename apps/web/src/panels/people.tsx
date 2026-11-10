// People & education: who can work, learn, teach or needs support.
import { useEffect, useState } from 'preact/hooks';
import type { CourseType, Observation, ProgramView, RegionId } from '../protocol';
import { QUAL_LABEL, fmtMonths, int, pct } from '../format';
import { Icon } from '../icons';
import {
  ActionNote, Badge, Btn, Checklist, Empty, Field, GoodsList, Meter, NumInput, RegionLink, Section, Select, Stat, Why,
  cx, toneOfBp,
} from '../ui';
import { act, consumeIntent, useApp } from '../store';
import { AgeBar } from '../inspector';
import { LaborBar } from './economy';

export function PeoplePanel() {
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
      <p class="panel-lede">Who can work, learn, serve, or needs support?</p>

      <Section title="Population" aside={<b>{int(civ.population)} <small class="muted">people</small></b>}>
        <AgeBar children={civ.children} working={civ.working_age} elders={civ.elders} />
        <div class="stat-row">
          <Stat label="Births" value={'+' + int(civ.births_last_round)} sub="last round" />
          <Stat label="Deaths" value={'−' + int(civ.deaths_last_round)} sub="last round" />
          <Stat label="Migration" value={(civ.migration_last_round > 0 ? '+' : civ.migration_last_round < 0 ? '−' : '') + int(Math.abs(civ.migration_last_round))} sub="net, last round" />
          <Stat label="Natural change" value={(natural >= 0 ? '+' : '−') + int(Math.abs(natural))} tone={natural < 0 ? 'bad' : undefined} sub="births − deaths" />
        </div>
        <div class="mini-meters">
          <div class="mini-meter"><span class="mini-label">Food access</span><Meter value={civ.food_fulfillment_bp} max={10000} tone={toneOfBp(civ.food_fulfillment_bp)} height={6} label={`Food access ${pct(civ.food_fulfillment_bp)}`} /><span class="mini-val">{pct(civ.food_fulfillment_bp)}</span></div>
          <div class="mini-meter"><span class="mini-label">Water access</span><Meter value={civ.water_fulfillment_bp} max={10000} tone={toneOfBp(civ.water_fulfillment_bp)} height={6} label={`Water access ${pct(civ.water_fulfillment_bp)}`} /><span class="mini-val">{pct(civ.water_fulfillment_bp)}</span></div>
        </div>
        <p class="muted small">Access is the person-weighted share of need met over the last twelve months.</p>
      </Section>

      <Section title="How working-age people spent last month">
        <LaborBar labor={civ.labor} />
      </Section>

      <Section title="Qualifications" aside={<small class="muted">people holding a maintained qualification</small>}>
        {quals.length === 0 ? <Empty>No one holds a recognised qualification yet.</Empty> : (
          <table class="table">
            <thead><tr><th>Qualification</th><th class="num">People</th><th class="num">In posts</th><th>Employed</th></tr></thead>
            <tbody>
              {quals.map((q) => (
                <tr>
                  <th scope="row">{QUAL_LABEL[q.qual]}</th>
                  <td class="num"><b>{int(q.count)}</b></td>
                  <td class="num">{int(q.employed)}</td>
                  <td class="util-cell"><Meter value={q.employed} max={Math.max(1, q.count)} tone="accent" height={6} label={`${int(q.employed)} of ${int(q.count)} in posts`} /></td>
                </tr>
              ))}
              <tr class="is-total"><th scope="row">No qualification</th><td class="num">{int(unqualified)}</td><td class="num muted">–</td><td class="muted small">general labour</td></tr>
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Teaching programmes" aside={<Btn small kind="primary" icon="plus" testid="open-programme" onClick={() => { setPresetRegion(s.selectedRegion ?? undefined); setOpening(true); }}>Open programme</Btn>}>
        {obs.programs.length === 0 ? <Empty>No programme is running. Skills are kept alive only by people who teach them.</Empty> : (
          <ul class="program-list">{obs.programs.map((p) => <li><ProgramCard p={p} /></li>)}</ul>
        )}
        <ActionNote tag="program" />
      </Section>
    </div>
  );
}

function ProgramCard({ p }: { p: ProgramView }) {
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  const blocked = p.blockers.length > 0;
  return (
    <div class={cx('card program', p.paused && 'is-paused', blocked && 'is-blocked')} data-testid="program-card">
      <div class="project-top">
        <div>
          <span class="kicker">Programme · <RegionLink id={p.region} /></span>
          <b class="project-title">{p.course_name}</b>
        </div>
        {p.paused ? <Badge tone="muted" icon="pause">Paused</Badge> : blocked ? <Badge tone="warn" icon="warn">Held back</Badge> : null}
      </div>
      <div class="program-grid">
        <div><span class="mini-label">Enrolled</span><b>{p.enrolled}</b><small> of {p.seats} places</small></div>
        <div><span class="mini-label">Teachers</span><b>{p.teachers}</b></div>
        <div><span class="mini-label">Graduates</span><b>{int(p.graduates_total)}</b><small> so far</small></div>
      </div>
      <div class="progress-line">
        <Meter value={p.progress_months} max={Math.max(1, p.months)} tone={p.paused ? 'muted' : blocked ? 'warn' : 'accent'} label={`Month ${p.progress_months} of ${p.months} for the current cohort`} />
        <span class="progress-num">month <b>{p.progress_months}</b> / {p.months}</span>
      </div>
      {blocked ? <ul class="blockers">{p.blockers.map((b) => <li><Icon name="warn" size={11} /> {b}</li>)}</ul> : null}
      <div class="project-actions">
        <span />
        <span class="row">
          <Btn small kind="ghost" icon={p.paused ? 'play' : 'pause'} disabled={s.busy} testid={`prog-pause-${p.id}`} onClick={() => void act({ kind: 'manage_program', program: p.id, op: p.paused ? 'resume' : 'pause', seats: null }, 'program', { quiet: true })}>{p.paused ? 'Resume' : 'Pause'}</Btn>
          {confirm ? (
            <>
              <Btn small kind="danger" disabled={s.busy} onClick={() => { setConfirm(false); void act({ kind: 'manage_program', program: p.id, op: 'cancel', seats: null }, 'program'); }}>Close it</Btn>
              <Btn small kind="ghost" onClick={() => setConfirm(false)}>Keep</Btn>
            </>
          ) : <Btn small kind="ghost" icon="close" onClick={() => setConfirm(true)}>Close…</Btn>}
        </span>
      </div>
    </div>
  );
}

function entrantsText(c: CourseType): string {
  if (!c.entrants.length) return 'Any adult';
  return c.entrants.map((e) => (e === null ? 'Any adult' : QUAL_LABEL[e])).join(' or ');
}

function OpenProgramme({ obs, presetRegion, onDone }: { obs: Observation; presetRegion?: RegionId; onDone: () => void }) {
  const s = useApp();
  const regions = obs.regions.filter((r) => r.own);
  const [region, setRegion] = useState<RegionId | undefined>(presetRegion !== undefined && regions.some((r) => r.id === presetRegion) ? presetRegion : (regions.find((r) => r.id === obs.civ.capital) ?? regions[0])?.id);
  const [key, setKey] = useState<string | null>(null);
  const [seats, setSeats] = useState(0);
  const course = obs.catalog.courses.find((c) => c.key === key) ?? null;
  const r = regions.find((x) => x.id === region) ?? regions[0];
  if (!r) return <div class="panel"><Empty>We govern no region to teach in.</Empty></div>;
  const places = seats || course?.class_size || 1;
  const teachersHere = course ? course.teachers.map((q) => ({ q, n: r.own!.quals.find((x) => x.qual === q)?.count ?? 0 })) : [];
  const unmetReq = course?.requirements.find((x) => !x.satisfied);
  // Teaching places in this region's venue, when the referee reports them.
  const venue = course ? r.own!.venues?.find((v) => v.venue === course.venue) : undefined;
  const venuesKnown = r.own!.venues !== undefined;
  const free = venue ? Math.max(0, venue.capacity - venue.reserved) : venuesKnown ? 0 : null;
  const why = !course ? 'Choose a course'
    : !course.available ? (unmetReq ? `Requires: ${unmetReq.text}` : 'A known requirement is unmet')
    : free === 0 ? `${r.name} has no free places in a ${course.venue_name.toLowerCase()}; build or extend one first`
    : free !== null && places > free ? `Only ${free} place${free === 1 ? ' is' : 's are'} free in the ${course.venue_name.toLowerCase()} at ${r.name}`
    : null;
  const running = (k: string) => obs.programs.filter((p) => p.course === k && p.region === r.id).length;

  const submit = async () => {
    if (!course) return;
    const rec = await act({ kind: 'start_program', region: r.id, course: course.key, seats: places }, 'new-program');
    if (rec.length && rec.every((x) => x.status === 'accepted' || x.status === 'applied')) onDone();
  };

  return (
    <div class="panel people">
      <div class="subnav">
        <button type="button" class="linklike" onClick={onDone}><Icon name="left" size={12} /> People &amp; education</button>
        <h3 class="subnav-title">Open a programme</h3>
      </div>
      <div class="form">
        <Field label="Region" hint={`${int(r.own!.population)} people · ${int(r.own!.working_age)} of working age`}>
          <Select value={r.id} options={regions.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => setRegion(v)} label="Region to teach in" testid="program-region" />
        </Field>
        <div class="field">
          <span class="field-label">Course</span>
          <div class="course-picker" role="listbox" aria-label="Course">
            {obs.catalog.courses.map((c) => (
              <button type="button" role="option" aria-selected={key === c.key} class={cx('fac-option', key === c.key && 'is-active', !c.available && 'is-locked')}
                data-testid={`course-${c.key}`} onClick={() => { setKey(c.key); setSeats(c.class_size); }}>
                <span class="fac-option-name">{!c.available ? <Icon name="lock" size={12} title="Requirements not met" /> : null}{c.name}</span>
                <span class="fac-option-meta">→ {QUAL_LABEL[c.output]} · {fmtMonths(c.months)}{running(c.key) ? ` · ${running(c.key)} running here` : ''}</span>
              </button>
            ))}
          </div>
        </div>
        {course ? (
          <div class="card detail" data-testid="course-detail">
            <b class="detail-title">{course.name}</b>
            <p class="detail-desc">{course.description}</p>
            <dl class="kvs">
              <div class="kv"><dt>Produces</dt><dd><b>{QUAL_LABEL[course.output]}</b></dd></div>
              <div class="kv"><dt>Entrants</dt><dd>{entrantsText(course)}</dd></div>
              <div class="kv"><dt>Taught by</dt><dd>{course.teachers.length ? teachersHere.map((t, i) => <span>{i ? ' or ' : ''}{QUAL_LABEL[t.q]} <small class={t.n ? 'muted' : 'warn-text'}>({int(t.n)} in {r.name})</small></span>) : <span class="muted">no special teacher</span>}</dd></div>
              <div class="kv"><dt>Length</dt><dd>{fmtMonths(course.months)} per cohort</dd></div>
              <div class="kv"><dt>Class size</dt><dd>{course.class_size} learners per teacher</dd></div>
              <div class="kv"><dt>Venue</dt><dd>{course.venue_name}{free !== null ? <small class={free ? 'muted' : 'warn-text'}> · {free} of {venue?.capacity ?? 0} places free in {r.name}</small> : <small class="muted"> · needed in {r.name}</small>}</dd></div>
              <div class="kv"><dt>Materials</dt><dd><GoodsList items={course.materials} per="per learner each month" empty="none" /></dd></div>
            </dl>
            {course.requirements.length ? (<><p class="sub-label">Requirements</p><Checklist items={course.requirements} /></>) : null}
            <Field label="Places" hint={`Learners study instead of working. ${Math.ceil(places / Math.max(1, course.class_size))} teacher${Math.ceil(places / Math.max(1, course.class_size)) === 1 ? '' : 's'} needed at this size.`}>
              <NumInput value={places} min={1} max={2000} step={course.class_size} unit="places" label="Places" onChange={setSeats} testid="program-seats" />
            </Field>
          </div>
        ) : <p class="muted small">Choose a course to see who may enter, who teaches it and what it needs.</p>}
        <div class="form-actions">
          <Btn kind="primary" icon="people" why={why} disabled={s.busy} testid="program-submit" onClick={() => void submit()}>Open programme</Btn>
          {course && why ? <Why>{why}</Why> : null}
        </div>
        <ActionNote tag="new-program" />
      </div>
    </div>
  );
}
