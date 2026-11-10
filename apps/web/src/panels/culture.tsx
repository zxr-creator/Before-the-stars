// Culture: practices and reforms, peoples, religions and the local movement.
import { useState } from 'preact/hooks';
import type { BeliefOption, MovementView, Observation, PracticeCard, PracticeState } from '../protocol';
import { PSTATE_LABEL, fmtDate, int, pct } from '../format';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Empty, Est, Meter, RegionLink, SeatDot, Section, Tabs, Why, cx, work } from '../ui';
import type { Tone } from '../ui';
import { act, civColor, civName, openPanel, useApp } from '../store';

type View = 'practices' | 'peoples' | 'religion';
const PTONE: Record<PracticeState, Tone> = { recognized: 'info', reforming: 'gold', enacted: 'ok', established: 'accent' };
const PHELP: Record<PracticeState, string> = {
  recognized: 'An observed idea; not yet an institution',
  reforming: 'A reform is turning it into an institution',
  enacted: 'Permitted and supported; participation is still spreading',
  established: 'Durably adopted',
};
const STAGES = ['Local gatherings', 'Shared tradition', 'Sacred precinct', 'Recognized founder', 'Founded religion'];

export function CulturePanel() {
  const s = useApp();
  const obs = s.obs!;
  const [view, setView] = useState<View>('practices');
  const c = obs.culture;
  return (
    <div class="panel culture">
      <Tabs label="Culture views" value={view} onChange={setView} tabs={[
        { key: 'practices', label: 'Practices', count: c.practices.length },
        { key: 'peoples', label: 'Peoples', count: c.lineages.length },
        { key: 'religion', label: 'Religion', count: c.religions.length + (c.movement ? 1 : 0) || undefined },
      ]} />
      {view === 'practices' ? <Practices obs={obs} /> : null}
      {view === 'peoples' ? <Peoples obs={obs} /> : null}
      {view === 'religion' ? <Religion obs={obs} /> : null}
    </div>
  );
}

function Practices({ obs }: { obs: Observation }) {
  const groups: { group: string; items: PracticeCard[] }[] = [];
  for (const p of obs.culture.practices) {
    const g = groups.find((x) => x.group === p.group);
    if (g) g.items.push(p);
    else groups.push({ group: p.group, items: [p] });
  }
  const order: PracticeState[] = ['reforming', 'recognized', 'enacted', 'established'];
  return (
    <>
      <p class="panel-lede">Practices are how people actually organise themselves. A reform makes a recognised idea an institution; adoption then spreads through real participation, not by decree.</p>
      {groups.map((g) => (
        <Section title={g.group} aside={<small class="muted">{g.items.length}</small>}>
          <ul class="practice-list">
            {g.items.slice().sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.recognized_month - b.recognized_month).map((p) => <li><Practice obs={obs} p={p} /></li>)}
          </ul>
        </Section>
      ))}
      <ActionNote tag="reform" />
    </>
  );
}

function Practice({ obs, p }: { obs: Observation; p: PracticeCard }) {
  const s = useApp();
  const [open, setOpen] = useState(p.state === 'recognized' || p.state === 'reforming');
  const project = obs.projects.find((x) => x.kind === 'reform' && x.target === p.handle);
  const unmet = p.known_requirements.find((r) => !r.satisfied);
  const why = p.state !== 'recognized' ? null : p.can_reform ? null : unmet ? `Requires: ${unmet.text}` : 'Its real requirements are not yet met';
  const builtOn = p.links.map((h) => obs.culture.practices.find((x) => x.handle === h)?.name).filter(Boolean);
  return (
    <div class={cx('card practice', 'practice-' + p.state)} data-testid="practice-card">
      <button type="button" class="practice-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="practice-name"><Icon name={open ? 'down' : 'right'} size={11} /> {p.name}</span>
        <Badge tone={PTONE[p.state]} title={PHELP[p.state]}>{PSTATE_LABEL[p.state]}</Badge>
      </button>
      <div class="adoption" title="Share of people who actually take part">
        <Meter value={p.adoption_bp} max={10000} tone={PTONE[p.state]} height={6} label={`Adoption ${pct(p.adoption_bp)}`} />
        <span class="adoption-num">{pct(p.adoption_bp)} <small>take part</small></span>
      </div>
      {open ? (
        <div class="practice-body">
          <p>{p.behavior}</p>
          <p class="muted small"><b>Needs:</b> {p.requirements}</p>
          {p.known_requirements.length ? <Checklist items={p.known_requirements} /> : null}
          {p.enables.length ? <ul class="enables">{p.enables.map((e) => <li><Icon name="right" size={10} /> {e}</li>)}</ul> : null}
          <p class="muted small">{p.source} · recognised {fmtDate(p.recognized_month)}{builtOn.length ? ` · builds on ${builtOn.join(', ')}` : ''}</p>
          {p.state === 'recognized' ? (
            <div class="form-actions">
              <Btn small kind="primary" why={why} disabled={s.busy} testid="propose-reform" onClick={() => void act({ kind: 'propose_reform', practice: p.handle }, 'reform')}>Propose reform</Btn>
              <span class="muted small">{work(p.reform_work)} work at the capital</span>
              {why ? <Why>{why}</Why> : null}
            </div>
          ) : null}
          {p.state === 'reforming' ? (
            project ? (
              <div class="progress-line">
                <Meter value={project.work_done} max={Math.max(1, project.work_needed)} tone="gold" label="Reform progress" />
                <span class="progress-num"><b>{work(project.work_done)}</b> / {work(project.work_needed)} <small>work</small> · <button type="button" class="linklike" onClick={() => openPanel('projects')}>project</button></span>
              </div>
            ) : <p class="muted small">The reform is being carried through.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Peoples({ obs }: { obs: Observation }) {
  const total = Math.max(1, obs.culture.lineages.reduce((a, l) => a + l.population, 0));
  return (
    <>
      <p class="panel-lede">Lineages carry habits formed by what their people have actually lived through. Traits are observations, not hidden bonuses.</p>
      {obs.culture.lineages.length === 0 ? <Empty>No lineage is recorded.</Empty> : null}
      <ul class="lineage-list">
        {obs.culture.lineages.map((l) => (
          <li class="card lineage">
            <div class="row-between"><b class="detail-title">{l.name}</b><span><b>{int(l.population)}</b> <small class="muted">people · {Math.round((l.population / total) * 100)}%</small></span></div>
            <Meter value={l.population} max={total} tone="accent" height={5} />
            <p class="muted small">{l.origin}</p>
            {l.traits.length ? (
              <ul class="trait-list">
                {l.traits.map((t) => <li><b>{t.name}</b> <small class="muted">since {fmtDate(t.since)}</small><br />{t.description}</li>)}
              </ul>
            ) : <p class="muted small">No distinctive traits have been observed yet.</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Religion({ obs }: { obs: Observation }) {
  const c = obs.culture;
  return (
    <>
      <p class="panel-lede">Religions here are invented traditions that grow out of local gatherings. They are founded by people, places and time, never by a button alone.</p>
      <Section title="Local movement">
        {c.movement ? <Movement obs={obs} m={c.movement} /> : <Empty>No religious movement has formed among our people.</Empty>}
      </Section>
      <Section title="Known religions" aside={<small class="muted">{c.religions.length}</small>}>
        {c.religions.length === 0 ? <Empty>We know of no founded religion.</Empty> : (
          <ul class="religion-list">
            {c.religions.map((r) => (
              <li class="card religion">
                <div class="row-between"><b class="detail-title">{r.name}</b><Est title="Followers we know of; the true number may differ">≈ {int(r.followers_known)} known followers</Est></div>
                <p class="muted small">
                  Founded {fmtDate(r.founded_month)}
                  {r.founder !== null ? <> by <SeatDot color={civColor(obs, r.founder)} /> {civName(obs, r.founder)}</> : null}
                  {r.holy_region !== null ? <> · holy place <RegionLink id={r.holy_region} /></> : null}
                </p>
                {r.beliefs.length ? <ul class="belief-list">{r.beliefs.map((b) => <li><span class="kicker">{b.slot}</span><b>{b.name}</b><span>{b.description}</span></li>)}</ul> : <p class="muted small">Its beliefs are not known to us.</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Movement({ obs, m }: { obs: Observation; m: MovementView }) {
  const s = useApp();
  const stageIx = STAGES.indexOf(m.stage);
  const slots: { slot: string; options: BeliefOption[] }[] = [];
  for (const b of m.belief_options) {
    const g = slots.find((x) => x.slot === b.slot);
    if (g) g.options.push(b);
    else slots.push({ slot: b.slot, options: [b] });
  }
  const founding = slots.length > 1;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const pending = obs.projects.find((p) => p.kind === 'religion');
  const complete = slots.every((g) => choice[g.slot]);
  const devotionShort = m.devotion < m.devotion_needed;
  const why = pending ? 'The movement is already preparing its next step' : !complete ? (founding ? 'Choose one belief of each kind' : 'Choose one follower practice') : devotionShort && !founding ? 'The gatherings are not yet committed enough' : null;
  const submit = () => void act({ kind: 'start_project', spec: { kind: 'religion', beliefs: slots.map((g) => choice[g.slot]), name: founding && name.trim() ? name.trim() : null }, priority: null }, 'religion');
  return (
    <div class="movement" data-testid="movement">
      <ol class="stage-track" aria-label={`Stage: ${m.stage}`}>
        {STAGES.map((st, i) => (
          <li class={cx(i < stageIx && 'is-done', i === stageIx && 'is-now')}><span class="stage-dot" aria-hidden="true">{i < stageIx ? <Icon name="check" size={10} /> : i + 1}</span><span>{st}</span></li>
        ))}
      </ol>
      {stageIx < 0 ? <p><b>{m.stage}</b></p> : null}
      <dl class="kvs">
        <div class="kv"><dt>Where</dt><dd><RegionLink id={m.region} /></dd></div>
        <div class="kv"><dt>Participants</dt><dd><b>{int(m.participants)}</b> people</dd></div>
        <div class="kv"><dt>Devotion</dt><dd class="util-cell"><Meter value={m.devotion} max={Math.max(1, m.devotion_needed)} tone={devotionShort ? 'gold' : 'ok'} height={6} label={`Devotion ${work(m.devotion)} of ${work(m.devotion_needed)}`} /> <small>{work(m.devotion)} / {work(m.devotion_needed)}</small></dd></div>
        <div class="kv"><dt>Founding places</dt><dd>{m.slots_remaining} left in the world</dd></div>
      </dl>
      {m.next_step ? <p class="note"><b>Next:</b> {m.next_step}</p> : null}
      {pending ? <p class="note is-ok"><Icon name="clock" size={12} /> “{pending.title}” is under way. <button type="button" class="linklike" onClick={() => openPanel('projects')}>See project</button></p> : null}
      {slots.length ? (
        <div class="belief-picker">
          <p class="sub-label">{founding ? 'Choose the founding beliefs — one of each kind' : 'Choose the local tradition — one follower practice'}</p>
          {slots.map((g) => (
            <fieldset class="belief-slot">
              <legend>{g.slot}</legend>
              {g.options.map((b) => (
                <label class={cx('belief-option', choice[g.slot] === b.key && 'is-active')}>
                  <input type="radio" name={`belief-${g.slot}`} checked={choice[g.slot] === b.key} onChange={() => setChoice({ ...choice, [g.slot]: b.key })} data-testid={`belief-${b.key}`} />
                  <span><b>{b.name}</b><br /><small>{b.description}</small></span>
                </label>
              ))}
            </fieldset>
          ))}
          {founding ? (
            <label class="field"><span class="field-label">Name (optional)</span>
              <input type="text" class="text" maxLength={40} value={name} placeholder="Leave empty to let the founders name it" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            </label>
          ) : null}
          <div class="form-actions">
            <Btn kind="primary" why={why} disabled={s.busy} testid="religion-submit" onClick={submit}>{founding ? 'Prepare the founding' : 'Settle the tradition'}</Btn>
            {why ? <Why>{why}</Why> : null}
          </div>
        </div>
      ) : null}
      <ActionNote tag="religion" />
    </div>
  );
}
