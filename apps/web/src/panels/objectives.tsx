// Objectives: how the match is won, agendas and milestones reached. Under the standard
// contract (ruleset 3.1) the victory view is present from the first round: the six steps
// of the jump programme, the standings and the three ways to win. The classic contract
// keeps its counters and is shown only once it has been revealed to this seat.
import type { Check, Observation, StandingView, VictoryView } from '../protocol';
import { fmtDate, int, tcChecks, tx } from '../format';
import { t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import { ActionNote, Badge, Btn, Checklist, Empty, Meter, RegionLink, SeatDot, Section, cx } from '../ui';
import { act, openPanel, showOnMap, useApp } from '../store';
import { OUTCOME_LABEL, PROGRAMME_STEPS } from '../victory';

export function ObjectivesPanel() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const o = obs.objectives;
  const standard = !!o.victory && o.victory.rule === 'standard';
  return (
    <div class="panel objectives">
      <p class="panel-lede">{t('What this civilization is working towards, as far as its own people understand it.')}</p>

      {standard ? <StandardVictory obs={obs} v={o.victory!} busy={s.busy} /> : null}

      <Section title={t('Agendas')}>
        {o.agendas.length === 0 ? <Empty>{t('No agenda has been set.')}</Empty> : (
          <ul class="agenda-list">
            {o.agendas.map((a) => (
              <li class="card agenda" data-testid="agenda">
                <b class="detail-title">{tc(a.title)}</b>
                <p>{tc(a.description)}</p>
                <p class="agenda-progress"><Icon name="right" size={11} /> {tc(a.progress)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('Milestones reached')} aside={<small class="muted">{o.milestones.length}</small>}>
        {o.milestones.length === 0 ? <Empty>{t('None yet.')}</Empty> : (
          <ol class="milestones">{o.milestones.map((m) => <li><Icon name="check" size={12} /> {tc(m)}</li>)}</ol>
        )}
      </Section>

      {standard ? null : o.victory ? <Victory obs={obs} v={o.victory} busy={s.busy} /> : (
        <Section title={t('Final objective')}>
          <p class="note"><Icon name="lock" size={12} /> {t('The final objective has not been revealed to us. It becomes known only when our own civilization discovers it.')}</p>
        </Section>
      )}
    </div>
  );
}

function Victory({ obs, v, busy }: { obs: Observation; v: VictoryView; busy: boolean }) {
  const running = (kind: string) => obs.projects.some((p) => p.kind === kind);
  return (
    <Section title={t('The victory contract')} class="victory">
      <p class="victory-summary" data-testid="victory-summary">{tc(v.summary)}</p>

      <div class="card contract">
        <div class="row-between"><b class="detail-title">{t('Governance of the whole world')}</b><span class="counter"><b>{v.governance_months}</b> / {v.governance_needed} <small>{t('consecutive months')}</small></span></div>
        <Meter value={v.governance_months} max={Math.max(1, v.governance_needed)} tone="accent" label={t('Governance held for {n} of {needed} months', { n: v.governance_months, needed: v.governance_needed })} />
        <Checklist items={tcChecks(v.governance_checks)} />
      </div>

      <div class="card contract">
        <div class="row-between"><b class="detail-title">{t('Sustained jump capability')}</b><span class="counter"><b>{v.ftl_months}</b> / {v.ftl_needed} <small>{t('consecutive months')}</small></span></div>
        <Meter value={v.ftl_months} max={Math.max(1, v.ftl_needed)} tone="accent" label={t('Jump capability sustained for {n} of {needed} months', { n: v.ftl_months, needed: v.ftl_needed })} />
        <Checklist items={tcChecks(v.ftl_checks)} />
        <p class="sub-label">{t('Qualifying trials')}</p>
        {v.trials.length ? <ul class="plain-list">{v.trials.map((m, i) => <li>{t('Trial {n}: {date}', { n: i + 1, date: fmtDate(m) })}</li>)}</ul> : <p class="muted small">{t('No qualifying trial has been completed.')}</p>}
      </div>

      <div class="card contract">
        <div class="row-between"><b class="detail-title">{t('Deployment test nodes')}</b>
          {v.test_nodes.length ? <Btn small kind="ghost" icon="pin" onClick={() => showOnMap(v.test_nodes)}>{t('Show on map')}</Btn> : null}
        </div>
        {v.test_nodes.length ? <p class="chips">{v.test_nodes.map((id) => <RegionLink id={id} />)}</p> : <p class="muted small">{t('No test nodes have been named.')}</p>}
      </div>

      <div class="card contract">
        <b class="detail-title">{t('Jump programme orders')}</b>
        {v.assemblies_operational !== undefined ? (
          <dl class="kvs">
            <div class="kv"><dt>{t('Assemblies')}</dt><dd>{tx('{n} operational', { n: <b>{v.assemblies_operational}</b> })}</dd></div>
            <div class="kv"><dt>{t('Exercise')}</dt><dd>{v.deployment_done ? t('Three-node deployment completed') : <span class="muted">{t('not yet held')}</span>}</dd></div>
            <div class="kv"><dt>{t('Replacement')}</dt><dd>{v.replacement_done ? t('Replacement and relief verified') : <span class="muted">{t('not yet verified')}</span>}</dd></div>
          </dl>
        ) : null}
        <div class="quick-actions">
          <Btn small why={running('ftl_trial') ? t('A trial is already being prepared') : v.assemblies_operational === 0 ? t('No operational jump assembly exists') : null} disabled={busy} testid="ftl-trial" onClick={() => void act({ kind: 'start_project', spec: { kind: 'ftl_trial' }, priority: null }, 'ftl')}>{t('Prepare jump trial')}</Btn>
          <Btn small why={running('ftl_deployment') ? t('An exercise is already being prepared') : null} disabled={busy} testid="ftl-deployment" onClick={() => void act({ kind: 'start_project', spec: { kind: 'ftl_deployment' }, priority: null }, 'ftl')}>{t('Deployment exercise')}</Btn>
          <Btn small why={running('ftl_replacement') ? t('A replacement is already being prepared') : v.assemblies_operational !== undefined && v.assemblies_operational < 3 ? t('A third operational assembly is needed first') : null} disabled={busy} testid="ftl-replacement" onClick={() => void act({ kind: 'start_project', spec: { kind: 'ftl_replacement' }, priority: null }, 'ftl')}>{t('Replacement and relief')}</Btn>
        </div>
        <p class="muted small">{t('A trial is a loaded round trip with an operational assembly; the exercise demonstrates transport, maintenance and recovery at the three test nodes; replacement swaps one assembly and hands over to a relief crew. The referee states what is missing if an order cannot proceed.')}</p>
        <ActionNote tag="ftl" />
      </div>
    </Section>
  );
}

// --- the standard contract (ruleset 3.1) ----------------------------------------------------

/** Where a step of the programme is worked on, for the button beside the next step. */
const STEP_PANEL: Record<string, 'space' | null> = { orbit: 'space', station: 'space', shipyard: 'space', assembly: 'space', first_jump: null, second_jump: null };

function StandardVictory({ obs, v, busy }: { obs: Observation; v: VictoryView; busy: boolean }) {
  const steps: Check[] = v.steps ?? [];
  const done = steps.filter((x) => x.ok).length;
  const total = steps.length || PROGRAMME_STEPS.length;
  const next = v.next_step ?? null;
  const standings: StandingView[] = v.standings ?? [];
  const mine = standings.find((x) => x.seat === obs.seat);
  const place = mine ? standings.indexOf(mine) + 1 : 0;
  const rivals = standings.filter((x) => x.seat !== obs.seat && x.sovereign).length;
  const colorOf = (seat: number) => (seat === obs.seat ? obs.civ.color : obs.others.find((c) => c.seat === seat)?.color ?? '#8a7d6a');
  const trialRunning = obs.projects.some((p) => p.kind === 'ftl_trial');
  const hasAssembly = steps.find((x) => x.category === 'assembly')?.ok ?? false;
  const complete = steps.length > 0 && done === steps.length;
  const trials = v.trials ?? [];
  const order = () => void act({ kind: 'start_project', spec: { kind: 'ftl_trial' }, priority: null }, 'ftl');
  return (
    <Section title={t('How this match is won')} class="victory victory-standard" aside={<Badge tone="gold">{t('Standard contract')}</Badge>}>
      <div class="card contract programme-card">
        <div class="row-between">
          <b class="detail-title">{t('The jump programme')}</b>
          <span class="counter"><b>{done}</b> / {total} <small>{t('steps')}</small></span>
        </div>
        <Meter value={done} max={Math.max(1, total)} tone="accent" label={t('{n} of {m} steps reached', { n: done, m: total })} />
        <ol class="programme" data-testid="programme-steps">
          {steps.map((st, i) => {
            const isNext = !st.ok && (next ? st.category === next : steps.findIndex((x) => !x.ok) === i);
            const panel = STEP_PANEL[st.category ?? ''] ?? null;
            return (
              <li class={cx('programme-step', st.ok && 'is-done', isNext && 'is-next')} data-testid={`programme-step-${st.category}`} data-state={st.ok ? 'done' : isNext ? 'next' : 'later'}>
                <span class="programme-mark" aria-hidden="true">{st.ok ? <Icon name="check" size={13} /> : i + 1}</span>
                <div class="programme-text">
                  <b>{tc(st.label)}</b>
                  {isNext ? <Badge tone="accent">{t('Next step')}</Badge> : st.ok ? <span class="sr-only">{t('Reached')}</span> : null}
                  {st.detail ? <p class={st.ok ? 'muted small' : isNext ? 'programme-how' : 'muted small'}>{isNext ? <b>{t('How')}: </b> : null}{tc(st.detail)}</p> : null}
                  {isNext && panel ? <Btn small nav icon="rocket" testid="programme-open-space" onClick={() => openPanel(panel)}>{t('Open the space sheet')}</Btn> : null}
                </div>
              </li>
            );
          })}
        </ol>
        <p class="muted small">{t('A step once reached is never lost, whatever happens to the works that reached it.')}</p>
      </div>

      {hasAssembly || v.trial_ready || trials.length > 0 ? (
        <div class="card contract trial-card" data-testid="trial-card">
          <b class="detail-title">{t('Jump trials')}</b>
          {trials.length ? <ul class="plain-list">{trials.map((m, i) => <li><Icon name="check" size={12} /> {t('Trial {n}: {date}', { n: i + 1, date: fmtDate(m) })}</li>)}</ul> : <p class="muted small">{t('No loaded round trip has been flown yet.')}</p>}
          {v.second_trial_from != null && !complete ? <p class="small">{t('A second round trip counts from {date}: the two must be at least twelve months apart.', { date: fmtDate(v.second_trial_from) })}</p> : null}
          {complete ? null : trialRunning ? (
            <p class="note"><Icon name="hourglass" size={12} /> {t('A trial is being prepared; its progress is on the projects sheet.')}</p>
          ) : v.trial_ready ? (
            <div class="quick-actions">
              <Btn kind="primary" icon="rocket" disabled={busy} testid="ftl-trial" onClick={order}>{t('Order a jump trial')}</Btn>
            </div>
          ) : v.trial_blocker ? (
            <p class="note trial-blocker" data-testid="trial-blocker"><Icon name="lock" size={12} /> {tc(v.trial_blocker)}</p>
          ) : null}
          <p class="muted small">{t('A trial is a loaded jump round trip flown from your own orbital shipyard with an operational assembly. There is no deployment exercise and no replacement step under the standard contract.')}</p>
          <ActionNote tag="ftl" />
        </div>
      ) : null}

      <div class="card contract standings-card">
        <b class="detail-title">{t('Standings')}</b>
        {standings.length ? (
          <table class="standings-table" data-testid="standings">
            <thead><tr><th class="num">#</th><th>{t('Civilization')}</th><th class="num">{t('Points')}</th><th class="num">{t('Steps')}</th><th /></tr></thead>
            <tbody>
              {standings.map((row, i) => (
                <tr class={cx(row.seat === obs.seat && 'is-self', !row.sovereign && 'is-out')}>
                  <td class="num">{i + 1}</td>
                  <th scope="row"><SeatDot color={colorOf(row.seat)} /> {tc(row.name)}{row.seat === obs.seat ? <small class="muted"> {t('(you)')}</small> : null}</th>
                  <td class="num"><b>{int(row.points)}</b></td>
                  <td class="num">{row.steps} / {total}</td>
                  <td>{row.sovereign ? null : <Badge tone="muted" title={t('A civilization that is eliminated or a subordinate cannot win')}>{t('not sovereign')}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p class="muted small">{t('No standings are known yet.')}</p>}
        <p class="muted small">{t('Standings list this civilization and those it has met. Only a sovereign power can win.')}</p>
      </div>

      <p class="sub-label">{t('Three ways to win')}</p>
      <ol class="ways" data-testid="victory-ways">
        <li class="card way">
          <span class="way-n" aria-hidden="true">1</span>
          <div>
            <b class="detail-title">{t(OUTCOME_LABEL.jump)}</b>
            <p>{t('Be the first to complete the jump programme: six steps, ending in two loaded jump round trips at least twelve months apart.')}</p>
            <p class="way-now"><Icon name="rocket" size={12} /> {t('{n} of {m} steps reached', { n: done, m: total })}</p>
          </div>
        </li>
        <li class="card way">
          <span class="way-n" aria-hidden="true">2</span>
          <div>
            <b class="detail-title">{t(OUTCOME_LABEL.supremacy)}</b>
            <p>{t('Be the only sovereign power left: every other civilization eliminated or your subordinate.')}</p>
            <p class="way-now"><Icon name="crown" size={12} /> {rivals === 0 ? t('No other sovereign power is known to us') : rivals === 1 ? t('1 other sovereign power is known to us') : t('{n} other sovereign powers are known to us', { n: rivals })}</p>
          </div>
        </li>
        <li class="card way">
          <span class="way-n" aria-hidden="true">3</span>
          <div>
            <b class="detail-title">{t(OUTCOME_LABEL.standing)}</b>
            <p>{t('If neither happens by the last round, the highest standing wins: 1,000 points for each programme step, 1 for each thousandth of the world’s people under your authority, 1 for each technology understood.')}</p>
            <p class="way-now"><Icon name="star" size={12} /> {place > 0 ? t('{points} points · place {n} of {m} known', { points: int(v.standing ?? mine?.points ?? 0), n: place, m: standings.length }) : t('{points} points', { points: int(v.standing ?? 0) })}</p>
          </div>
        </li>
      </ol>

      <details class="victory-wording">
        <summary>{t('The referee’s wording')}</summary>
        <p class="victory-summary" data-testid="victory-summary">{tc(v.summary)}</p>
      </details>
    </Section>
  );
}
