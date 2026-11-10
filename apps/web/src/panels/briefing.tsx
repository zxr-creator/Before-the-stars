// Round briefing: what changed, and what needs a decision.
import { useState } from 'preact/hooks';
import type { BriefingItem, Observation, Receipt } from '../protocol';
import { NEGOTIATION_WINDOWS } from '../protocol';
import { fmtYear, titleCase } from '../format';
import { Icon } from '../icons';
import { Badge, Btn, Empty, Section, cx } from '../ui';
import { openPanel, selectRegion, useApp } from '../store';
import type { PanelKey } from '../store';

const SEVERITY: Record<string, { label: string; icon: string; tone: 'bad' | 'warn' | 'ok' | 'info' }> = {
  danger: { label: 'Urgent', icon: 'danger', tone: 'bad' },
  warning: { label: 'Needs a decision', icon: 'warn', tone: 'warn' },
  good: { label: 'Good news', icon: 'good', tone: 'ok' },
  info: { label: 'Report', icon: 'info', tone: 'info' },
};

const PANEL_ALIAS: Record<string, PanelKey> = {
  briefing: 'briefing', economy: 'economy', projects: 'projects', population: 'people', people: 'people',
  education: 'people', knowledge: 'knowledge', culture: 'culture', politics: 'politics', diplomacy: 'diplomacy',
  military: 'military', objectives: 'objectives', chronicle: 'chronicle',
};

function openItem(item: BriefingItem): void {
  const target = PANEL_ALIAS[item.panel];
  if (item.region !== null) selectRegion(item.region, true);
  if (target) openPanel(target);
}

function whereLabel(item: BriefingItem): string {
  const target = PANEL_ALIAS[item.panel];
  if (target) return titleCase(target === 'people' ? 'people & education' : target);
  return item.region !== null ? 'Map' : '';
}

const ACTION_LABEL: Record<string, string> = {
  select_contacts: 'Choose counterparts', message: 'Message', propose_treaty: 'Treaty proposal', withdraw_offer: 'Withdraw offer',
  sign_treaty: 'Sign treaty', decline_offer: 'Decline offer', break_treaty: 'Repudiate treaty', set_policy: 'Standing policy',
  'start_project:build': 'Build', 'start_project:research': 'Investigation', 'start_project:survey': 'Survey',
  'start_project:settle': 'Settle', 'start_project:study': 'Exploratory study', 'start_project:resettle': 'Resettle',
  'start_project:recruit': 'Recruit', 'start_project:religion': 'Support movement', 'start_project:ftl_trial': 'Jump trial',
  'start_project:ftl_deployment': 'Deployment exercise', 'start_project:ftl_replacement': 'Replacement and relief',
  manage_project: 'Manage project', investigate: 'Follow up lead', propose_reform: 'Propose reform', start_program: 'Open programme',
  manage_program: 'Manage programme', demolish: 'Demolish', military_order: 'Military order', forfeit: 'Withdraw',
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? titleCase(action.replace(/[:_]/g, ' '));
}

function phaseAdvice(obs: Observation): { title: string; text: string; panel?: PanelKey } {
  const contacted = obs.others.filter((o) => o.contacted && o.status === 'active');
  if (obs.phase === 'finished') return { title: 'The match has ended', text: 'The record is closed. The chronicle keeps the whole history.', panel: 'chronicle' };
  if (obs.phase === 'contact') {
    return contacted.length
      ? { title: 'Contact selection', text: `Choose up to three of ${contacted.length} known counterpart${contacted.length === 1 ? '' : 's'} for this round. A channel opens only where the choice is mutual.`, panel: 'diplomacy' }
      : { title: 'Contact selection', text: 'No other civilization has been met yet, so there is nobody to choose. Orders for the year can be given at any time.' };
  }
  if (obs.phase === 'negotiate') {
    const open = obs.diplomacy.channels.filter((c) => c.open).length;
    return { title: `Negotiation window ${obs.window} of ${NEGOTIATION_WINDOWS}`, text: open ? `${open} channel${open === 1 ? ' is' : 's are'} open. One envelope per counterpart in each window.` : 'No channel is open this round. You can go straight to planning.', panel: open ? 'diplomacy' : undefined };
  }
  return { title: 'Planning', text: 'Settle projects, labour and orders. Ending the round resolves twelve months.' };
}

export function BriefingPanel() {
  const s = useApp();
  const obs = s.obs!;
  const [more, setMore] = useState(false);
  const items = obs.briefing;
  const lead = items.slice(0, 5);
  const rest = items.slice(5);
  const advice = phaseAdvice(obs);
  const running = obs.projects.filter((p) => !p.paused).length;
  const stalled = obs.projects.filter((p) => p.blockers.length > 0 && !p.paused).length;

  return (
    <div class="panel briefing">
      <p class="panel-lede">{fmtYear(obs.month)} · what changed, and what needs a decision.</p>

      <div class="phase-card">
        <div>
          <b>{advice.title}</b>
          <p>{advice.text}</p>
        </div>
        {advice.panel ? <Btn small onClick={() => openPanel(advice.panel!)}>Open</Btn> : null}
      </div>

      <Section title="Developments" aside={items.length ? <small class="muted">{items.length} in all</small> : null}>
        {items.length === 0 ? <Empty>Nothing new was reported this round. {obs.round === 1 ? 'Give your first orders: a study, a workshop, a teaching programme.' : ''}</Empty> : null}
        <ul class="brief-list">
          {lead.map((it) => <BriefRow item={it} />)}
          {more ? rest.map((it) => <BriefRow item={it} />) : null}
        </ul>
        {rest.length ? (
          <button type="button" class="more-btn" aria-expanded={more} data-testid="briefing-more" onClick={() => setMore(!more)}>
            <Icon name={more ? 'up' : 'down'} size={12} /> {more ? 'Show fewer' : `${rest.length} more report${rest.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </Section>

      <Section title="Under way">
        <div class="underway">
          <button type="button" class="underway-item" onClick={() => openPanel('projects')}>
            <b>{obs.projects.length}</b><span>project{obs.projects.length === 1 ? '' : 's'}{stalled ? <em> · {stalled} blocked</em> : running !== obs.projects.length ? <em> · {obs.projects.length - running} paused</em> : null}</span>
          </button>
          <button type="button" class="underway-item" onClick={() => openPanel('people')}>
            <b>{obs.programs.length}</b><span>teaching programme{obs.programs.length === 1 ? '' : 's'}</span>
          </button>
          <button type="button" class="underway-item" onClick={() => openPanel('knowledge', { kind: 'knowledge-view', view: 'frontier' })}>
            <b>{obs.knowledge.leads.length}</b><span>lead{obs.knowledge.leads.length === 1 ? '' : 's'} to follow</span>
          </button>
        </div>
      </Section>

      <ReceiptSection title="Orders this round" empty="No orders given yet this round." receipts={obs.receipts.filter((r) => r.round >= obs.round)} testid="receipts" />
      {obs.receipts.some((r) => r.round < obs.round) ? (
        <ReceiptSection title="Orders last round" empty="" receipts={obs.receipts.filter((r) => r.round < obs.round)} testid="receipts-last" note="Includes anything a steward ordered on your behalf at the end of planning." />
      ) : null}
    </div>
  );
}

function ReceiptSection({ title, empty, receipts, testid, note }: { title: string; empty: string; receipts: Receipt[]; testid: string; note?: string }) {
  return (
    <Section title={title} aside={<small class="muted">{receipts.length} receipt{receipts.length === 1 ? '' : 's'}</small>}>
      {note ? <p class="muted">{note}</p> : null}
      {receipts.length === 0 ? <Empty>{empty}</Empty> : (
        <ul class="receipt-list" data-testid={testid}>
          {receipts.slice().reverse().map((r) => {
            const ok = r.status === 'accepted' || r.status === 'applied';
            return (
              <li class={cx('receipt', ok ? 'is-ok' : 'is-bad')}>
                <span class="receipt-mark"><Icon name={ok ? 'check' : 'cross'} size={12} /></span>
                <span class="receipt-body"><b>{actionLabel(r.action)}</b> <Badge tone={ok ? 'ok' : 'bad'}>{titleCase(r.status)}</Badge><br /><span class="receipt-reason">{r.reason}</span></span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function BriefRow({ item }: { item: BriefingItem }) {
  const sev = SEVERITY[item.severity] ?? SEVERITY.info;
  const where = whereLabel(item);
  return (
    <li>
      <button type="button" class={cx('brief', 'brief-' + sev.tone)} onClick={() => openItem(item)} data-testid="briefing-item">
        <span class="brief-icon" title={sev.label}><Icon name={sev.icon} size={16} /></span>
        <span class="brief-body">
          <span class="brief-kicker">{sev.label}</span>
          <b class="brief-title">{item.title}</b>
          <span class="brief-detail">{item.detail}</span>
        </span>
        {where ? <span class="brief-go">{where} <Icon name="right" size={11} /></span> : null}
      </button>
    </li>
  );
}
