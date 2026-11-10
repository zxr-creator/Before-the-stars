// Objectives: agendas, milestones reached, and — only once it has been
// revealed to this seat — the victory contract.
import type { Observation, VictoryView } from '../protocol';
import { fmtDate } from '../format';
import { Icon } from '../icons';
import { ActionNote, Btn, Checklist, Empty, Meter, RegionLink, Section } from '../ui';
import { act, showOnMap, useApp } from '../store';

export function ObjectivesPanel() {
  const s = useApp();
  const obs = s.obs!;
  const o = obs.objectives;
  return (
    <div class="panel objectives">
      <p class="panel-lede">What this civilization is working towards, as far as its own people understand it.</p>

      <Section title="Agendas">
        {o.agendas.length === 0 ? <Empty>No agenda has been set.</Empty> : (
          <ul class="agenda-list">
            {o.agendas.map((a) => (
              <li class="card agenda" data-testid="agenda">
                <b class="detail-title">{a.title}</b>
                <p>{a.description}</p>
                <p class="agenda-progress"><Icon name="right" size={11} /> {a.progress}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Milestones reached" aside={<small class="muted">{o.milestones.length}</small>}>
        {o.milestones.length === 0 ? <Empty>None yet.</Empty> : (
          <ol class="milestones">{o.milestones.map((m) => <li><Icon name="check" size={12} /> {m}</li>)}</ol>
        )}
      </Section>

      {o.victory ? <Victory obs={obs} v={o.victory} busy={s.busy} /> : (
        <Section title="Final objective">
          <p class="note"><Icon name="lock" size={12} /> The final objective has not been revealed to us. It becomes known only when our own civilization discovers it.</p>
        </Section>
      )}
    </div>
  );
}

function Victory({ obs, v, busy }: { obs: Observation; v: VictoryView; busy: boolean }) {
  const running = (kind: string) => obs.projects.some((p) => p.kind === kind);
  return (
    <Section title="The victory contract" class="victory">
      <p class="victory-summary" data-testid="victory-summary">{v.summary}</p>

      <div class="card contract">
        <div class="row-between"><b class="detail-title">Governance of the whole world</b><span class="counter"><b>{v.governance_months}</b> / {v.governance_needed} <small>consecutive months</small></span></div>
        <Meter value={v.governance_months} max={Math.max(1, v.governance_needed)} tone="accent" label={`Governance held for ${v.governance_months} of ${v.governance_needed} months`} />
        <Checklist items={v.governance_checks} />
      </div>

      <div class="card contract">
        <div class="row-between"><b class="detail-title">Sustained jump capability</b><span class="counter"><b>{v.ftl_months}</b> / {v.ftl_needed} <small>consecutive months</small></span></div>
        <Meter value={v.ftl_months} max={Math.max(1, v.ftl_needed)} tone="accent" label={`Jump capability sustained for ${v.ftl_months} of ${v.ftl_needed} months`} />
        <Checklist items={v.ftl_checks} />
        <p class="sub-label">Qualifying trials</p>
        {v.trials.length ? <ul class="plain-list">{v.trials.map((m, i) => <li>Trial {i + 1}: {fmtDate(m)}</li>)}</ul> : <p class="muted small">No qualifying trial has been completed.</p>}
      </div>

      <div class="card contract">
        <div class="row-between"><b class="detail-title">Deployment test nodes</b>
          {v.test_nodes.length ? <Btn small kind="ghost" icon="pin" onClick={() => showOnMap(v.test_nodes)}>Show on map</Btn> : null}
        </div>
        {v.test_nodes.length ? <p class="chips">{v.test_nodes.map((id) => <RegionLink id={id} />)}</p> : <p class="muted small">No test nodes have been named.</p>}
      </div>

      <div class="card contract">
        <b class="detail-title">Jump programme orders</b>
        {v.assemblies_operational !== undefined ? (
          <dl class="kvs">
            <div class="kv"><dt>Assemblies</dt><dd><b>{v.assemblies_operational}</b> operational</dd></div>
            <div class="kv"><dt>Exercise</dt><dd>{v.deployment_done ? 'Three-node deployment completed' : <span class="muted">not yet held</span>}</dd></div>
            <div class="kv"><dt>Replacement</dt><dd>{v.replacement_done ? 'Replacement and relief verified' : <span class="muted">not yet verified</span>}</dd></div>
          </dl>
        ) : null}
        <div class="quick-actions">
          <Btn small why={running('ftl_trial') ? 'A trial is already being prepared' : v.assemblies_operational === 0 ? 'No operational jump assembly exists' : null} disabled={busy} testid="ftl-trial" onClick={() => void act({ kind: 'start_project', spec: { kind: 'ftl_trial' }, priority: null }, 'ftl')}>Prepare jump trial</Btn>
          <Btn small why={running('ftl_deployment') ? 'An exercise is already being prepared' : null} disabled={busy} testid="ftl-deployment" onClick={() => void act({ kind: 'start_project', spec: { kind: 'ftl_deployment' }, priority: null }, 'ftl')}>Deployment exercise</Btn>
          <Btn small why={running('ftl_replacement') ? 'A replacement is already being prepared' : v.assemblies_operational !== undefined && v.assemblies_operational < 3 ? 'A third operational assembly is needed first' : null} disabled={busy} testid="ftl-replacement" onClick={() => void act({ kind: 'start_project', spec: { kind: 'ftl_replacement' }, priority: null }, 'ftl')}>Replacement and relief</Btn>
        </div>
        <p class="muted small">A trial is a loaded round trip with an operational assembly; the exercise demonstrates transport, maintenance and recovery at the three test nodes; replacement swaps one assembly and hands over to a relief crew. The referee states what is missing if an order cannot proceed.</p>
        <ActionNote tag="ftl" />
      </div>
    </Section>
  );
}
