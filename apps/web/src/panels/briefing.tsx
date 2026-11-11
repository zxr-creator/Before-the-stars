// Round briefing: what changed, and what needs a decision.
import { useState } from 'preact/hooks';
import type { BriefingItem, Observation, Receipt } from '../protocol';
import { NEGOTIATION_WINDOWS } from '../protocol';
import { fmtNow, roundSpan, titleCase, tn } from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
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
  return item.region !== null ? t('Map') : '';
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
  directive: 'Standing order', repeal: 'Repeal',
};

export function actionLabel(action: string): string {
  // "Withdraw" also labels withdrawing an offer; leaving the match needs its own Chinese wording.
  if (action === 'forfeit' && isZh()) return t('Withdraw (forfeit the match)');
  const label = ACTION_LABEL[action];
  return label ? t(label) : titleCase(action.replace(/[:_]/g, ' '));
}

function phaseAdvice(obs: Observation): { title: string; text: string; panel?: PanelKey } {
  const contacted = obs.others.filter((o) => o.contacted && o.status === 'active');
  if (obs.phase === 'finished') return { title: t('The match has ended'), text: t('The record is closed. The chronicle keeps the whole history.'), panel: 'chronicle' };
  if (obs.phase === 'contact') {
    return contacted.length
      ? { title: t('Contact selection'), text: tn(contacted.length, 'Choose up to three of {n} known counterpart for this round. A channel opens only where the choice is mutual.', 'Choose up to three of {n} known counterparts for this round. A channel opens only where the choice is mutual.'), panel: 'diplomacy' }
      : { title: t('Contact selection'), text: t('No other civilization has been met yet, so there is nobody to choose. Orders for the year can be given at any time.') };
  }
  if (obs.phase === 'negotiate') {
    const open = obs.diplomacy.channels.filter((c) => c.open).length;
    return { title: t('Negotiation window {n} of {total}', { n: obs.window, total: NEGOTIATION_WINDOWS }), text: open ? tn(open, '{n} channel is open. One envelope per counterpart in each window.', '{n} channels are open. One envelope per counterpart in each window.') : t('No channel is open this round. You can go straight to planning.'), panel: open ? 'diplomacy' : undefined };
  }
  return { title: t('Planning'), text: obs.months_per_round > 12
    ? t('Settle projects, labour, orders and standing orders. Ending the round resolves {span}; standing orders act year by year inside it.', { span: roundSpan(obs.calendar) ?? fmtNow(obs) })
    : t('Settle projects, labour and orders. Ending the round resolves twelve months.') };
}

export function BriefingPanel() {
  useLocale();
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
      <p class="panel-lede">{t('{year} · what changed, and what needs a decision.', { year: fmtNow(obs) })}</p>

      <div class="phase-card">
        <div>
          <b>{advice.title}</b>
          <p>{advice.text}</p>
        </div>
        {advice.panel ? <Btn small onClick={() => openPanel(advice.panel!)}>{t('Open')}</Btn> : null}
      </div>

      <Section title={t('Developments')} aside={items.length ? <small class="muted">{t('{n} in all', { n: items.length })}</small> : null}>
        {items.length === 0 ? <Empty>{obs.round === 1 ? t('Nothing new was reported this round. Give your first orders: a study, a workshop, a teaching programme.') : t('Nothing new was reported this round.')}</Empty> : null}
        <ul class="brief-list">
          {lead.map((it) => <BriefRow item={it} />)}
          {more ? rest.map((it) => <BriefRow item={it} />) : null}
        </ul>
        {rest.length ? (
          <button type="button" class="more-btn" aria-expanded={more} data-testid="briefing-more" onClick={() => setMore(!more)}>
            <Icon name={more ? 'up' : 'down'} size={12} /> {more ? t('Show fewer') : tn(rest.length, '{n} more report', '{n} more reports')}
          </button>
        ) : null}
      </Section>

      <Section title={t('Under way')}>
        <div class="underway">
          <button type="button" class="underway-item" onClick={() => openPanel('projects')}>
            <b>{obs.projects.length}</b><span>{tn(obs.projects.length, 'project', 'projects')}{stalled ? <em> · {t('{n} blocked', { n: stalled })}</em> : running !== obs.projects.length ? <em> · {t('{n} paused', { n: obs.projects.length - running })}</em> : null}</span>
          </button>
          <button type="button" class="underway-item" onClick={() => openPanel('people')}>
            <b>{obs.programs.length}</b><span>{tn(obs.programs.length, 'teaching programme', 'teaching programmes')}</span>
          </button>
          <button type="button" class="underway-item" onClick={() => openPanel('knowledge', { kind: 'knowledge-view', view: 'frontier' })}>
            <b>{obs.knowledge.leads.length}</b><span>{tn(obs.knowledge.leads.length, 'lead to follow', 'leads to follow')}</span>
          </button>
        </div>
      </Section>

      <ReceiptSection title={t('Orders this round')} empty={t('No orders given yet this round.')} receipts={obs.receipts.filter((r) => r.round >= obs.round)} testid="receipts" />
      {obs.receipts.some((r) => r.round < obs.round) ? (
        <ReceiptSection title={t('Orders last round')} empty="" receipts={obs.receipts.filter((r) => r.round < obs.round)} testid="receipts-last" note={t('Includes anything a steward ordered on your behalf at the end of planning.')} />
      ) : null}
    </div>
  );
}

function ReceiptSection({ title, empty, receipts, testid, note }: { title: string; empty: string; receipts: Receipt[]; testid: string; note?: string }) {
  return (
    <Section title={title} aside={<small class="muted">{tn(receipts.length, '{n} receipt', '{n} receipts')}</small>}>
      {note ? <p class="muted">{note}</p> : null}
      {receipts.length === 0 ? <Empty>{empty}</Empty> : (
        <ul class="receipt-list" data-testid={testid}>
          {receipts.slice().reverse().map((r) => {
            const ok = r.status === 'accepted' || r.status === 'applied';
            return (
              <li class={cx('receipt', ok ? 'is-ok' : 'is-bad')}>
                <span class="receipt-mark"><Icon name={ok ? 'check' : 'cross'} size={12} /></span>
                <span class="receipt-body"><b>{actionLabel(r.action)}</b> <Badge tone={ok ? 'ok' : 'bad'}>{titleCase(r.status)}</Badge><br /><span class="receipt-reason">{tc(r.reason)}</span></span>
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
        <span class="brief-icon" title={t(sev.label)}><Icon name={sev.icon} size={16} /></span>
        <span class="brief-body">
          <span class="brief-kicker">{t(sev.label)}</span>
          <b class="brief-title">{tc(item.title)}</b>
          <span class="brief-detail">{tc(item.detail)}</span>
        </span>
        {where ? <span class="brief-go">{where} <Icon name="right" size={11} /></span> : null}
      </button>
    </li>
  );
}
