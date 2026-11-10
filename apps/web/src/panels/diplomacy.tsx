// Diplomacy: counterparts, the round's contact choice, channels and envelope
// budgets, message threads, structured treaty proposals, offers and treaties.
// The phase rules are stated wherever they disable something.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type {
  ChannelView, Clause, ClauseKind, ForeignCiv, Good, Intent, Observation, OfferView, SeatId, TreatyView,
} from '../protocol';
import { MAX_CONTACTS, MAX_MESSAGE_CHARS, NEGOTIATION_WINDOWS } from '../protocol';
import {
  CONTROLLER_LABEL, GOODS, GOOD_LABEL, GOOD_SHORT, INTENTS, INTENT_LABEL, fmtDate, fmtDateShort, fmtMonths, int,
  milli, pct, range, titleCase,
} from '../format';
import { Icon } from '../icons';
import {
  ActionNote, Badge, Btn, Empty, Est, Expander, Meter, NumInput, SeatDot, Section, Select, Why, cx,
} from '../ui';
import { act, civColor, civName, consumeIntent, ready, regionName, useApp } from '../store';

const CLAUSE_LABEL: Record<ClauseKind, string> = {
  goods: 'Deliver goods', knowledge: 'Hand over a method', practice: 'Describe a practice', maps: 'Share maps',
  non_aggression: 'Non-aggression', defensive_pact: 'Defensive pact', peace: 'Peace', subordination: 'Subordination',
  cede_region: 'Cede a region',
};
const CLAUSE_HINT: Record<ClauseKind, string> = {
  goods: 'One party delivers goods, once or every month for a term. Recurring deliveries need merchant arbitration on one side.',
  knowledge: 'Records and demonstrations of a method the giver understands.',
  practice: 'A description of an enacted practice, so the recipient can recognise it.',
  maps: 'Maps and survey records.',
  non_aggression: 'Neither side attacks the other for the term.',
  defensive_pact: 'Each side answers attacks on the other. Needs standing dispute arrangements.',
  peace: 'Ends a war between the parties.',
  subordination: 'One party accepts the other as its highest authority and pays tribute.',
  cede_region: 'Transfers sovereignty over a region.',
};

/** Why an envelope (message, proposal, or a signature during negotiation) cannot be sent now; null when it can. */
function envelopeBlock(obs: Observation, other: ForeignCiv, ch: ChannelView | undefined): string | null {
  if (obs.phase === 'finished') return 'The match has finished';
  if (obs.ready) return 'You have finished this phase; wait for the others';
  if (obs.phase === 'contact') return 'Messages and proposals belong to the negotiation windows, which open after contact selection';
  if (obs.phase === 'plan') return 'The negotiation windows have closed for this round';
  if (!ch || !ch.open) {
    return ch?.selected_by_me
      ? `${other.name} did not choose us this round, so no channel is open`
      : `You did not choose ${other.name} in this round’s contact phase`;
  }
  if (ch.envelopes_used >= ch.envelopes_limit) return `This pair has used all ${ch.envelopes_limit} envelopes for the round`;
  if (ch.sent_this_window) return `One envelope per counterpart per window: wait for window ${Math.min(NEGOTIATION_WINDOWS, obs.window + 1)}`;
  return null;
}

export function describeClause(obs: Observation, c: Clause, other: SeatId): string {
  const who = (s: SeatId) => (s === obs.seat ? obs.civ.name : civName(obs, s));
  const to = (s: SeatId) => who(s === obs.seat ? other : obs.seat);
  switch (c.kind) {
    case 'goods':
      return c.months <= 1
        ? `${who(c.from)} delivers ${milli(c.amount_per_month)} ${GOOD_SHORT[c.good].toLowerCase()} to ${to(c.from)}, once`
        : `${who(c.from)} delivers ${milli(c.amount_per_month)} ${GOOD_SHORT[c.good].toLowerCase()} to ${to(c.from)} every month for ${fmtMonths(c.months)}`;
    case 'knowledge': {
      const t = obs.knowledge.techs.find((x) => x.handle === c.tech);
      return `${who(c.from)} hands over ${t ? `“${t.name}”` : 'a method not known to us'}`;
    }
    case 'practice': {
      const p = obs.culture.practices.find((x) => x.handle === c.practice);
      return `${who(c.from)} describes ${p ? `“${p.name}”` : 'a practice not known to us'}`;
    }
    case 'maps': return `${who(c.from)} shares maps and survey records`;
    case 'non_aggression': return `Non-aggression for ${fmtMonths(c.months)}`;
    case 'defensive_pact': return `Defensive pact for ${fmtMonths(c.months)}`;
    case 'peace': return 'Peace between the parties';
    case 'subordination': return `${who(c.from)} accepts ${to(c.from)} as highest authority, tribute ${pct(c.tribute_bp)}`;
    case 'cede_region': return `${who(c.from)} cedes ${regionName(obs, c.region)}`;
  }
}

function phaseRule(obs: Observation): { title: string; lines: string[] } {
  if (obs.phase === 'contact') {
    return { title: 'Now: contact selection', lines: [
      `Choose up to ${MAX_CONTACTS} counterparts for this round. A channel opens only where both sides choose each other.`,
      'Messages and proposals wait for the negotiation windows. Offers already on the table can be declined or withdrawn at any time.',
    ] };
  }
  if (obs.phase === 'negotiate') {
    return { title: `Now: negotiation window ${obs.window} of ${NEGOTIATION_WINDOWS}`, lines: [
      'All seats act at once. One envelope — a message, a proposal or a signature — per open counterpart in each window, ten per pair per round.',
      'Envelopes are delivered when the window closes.',
    ] };
  }
  if (obs.phase === 'plan') {
    return { title: 'Now: planning', lines: [
      'The negotiation windows have closed. You can still sign, decline or withdraw offers and repudiate treaties.',
      'New messages and proposals wait for next round.',
    ] };
  }
  return { title: 'The match has finished', lines: ['The diplomatic record is closed.'] };
}

export function DiplomacyPanel() {
  const s = useApp();
  const obs = s.obs!;
  const [seat, setSeat] = useState<SeatId | null>(null);
  useEffect(() => {
    const it = s.intent;
    if (it?.kind === 'counterpart') { setSeat(it.seat); consumeIntent(); }
  }, [s.intent?.nonce]);

  const other = seat !== null ? obs.others.find((o) => o.seat === seat) : undefined;
  const rule = phaseRule(obs);
  const nextLabel = obs.phase === 'contact' ? 'Open negotiations' : obs.phase === 'negotiate' ? (obs.window < NEGOTIATION_WINDOWS ? 'Next window' : 'To planning') : 'Finish planning';

  const rules = (
    <div class="phase-card" data-testid="diplomacy-rules">
      <div>
        <b>{rule.title}</b>
        {rule.lines.map((l) => <p>{l}</p>)}
      </div>
      {obs.phase !== 'finished' && !obs.ready ? (
        <div class="phase-card-actions">
          <Btn small disabled={s.advancing || s.busy} testid="diplomacy-next" onClick={() => void ready(false)}>{nextLabel}</Btn>
          <Btn small kind="ghost" disabled={s.advancing || s.busy} onClick={() => void ready(true)}>End round</Btn>
        </div>
      ) : obs.ready ? <Badge tone="info" icon="clock">Waiting</Badge> : null}
    </div>
  );

  if (other) return <Counterpart obs={obs} other={other} rules={rules} onBack={() => setSeat(null)} />;

  const met = obs.others.filter((o) => o.contacted);
  const unmet = obs.others.filter((o) => !o.contacted);
  const incoming = obs.diplomacy.offers.filter((o) => o.to === obs.seat && o.status === 'open');
  const active = obs.diplomacy.treaties.filter((t) => t.status === 'active');

  return (
    <div class="panel diplomacy">
      <p class="panel-lede">What can I believe, and what can I commit to?</p>
      {rules}

      <ContactSelection obs={obs} met={met} />

      {incoming.length ? (
        <Section title="Awaiting your answer" aside={<small class="muted">unsigned proposals lapse</small>}>
          <ul class="offer-list">{incoming.map((o) => <li><Offer obs={obs} o={o} /></li>)}</ul>
          <ActionNote tag="offer" />
        </Section>
      ) : null}

      <Section title="Counterparts" aside={<small class="muted">{met.length} met</small>}>
        {met.length === 0 ? <Empty>No other civilization has been met. Contact comes from exploring: survey and settle towards the edges of the map.</Empty> : (
          <ul class="counterpart-list">
            {met.map((o) => {
              const ch = obs.diplomacy.channels.find((c) => c.seat === o.seat);
              const unread = obs.diplomacy.messages.filter((m) => m.from === o.seat && m.round === obs.round).length;
              return (
                <li>
                  <button type="button" class="card card-click counterpart" data-testid={`counterpart-${o.seat}`} onClick={() => setSeat(o.seat)}>
                    <span class="cp-top">
                      <span class="cp-name"><SeatDot color={o.color} size={12} /> <b>{o.name}</b> <small class="muted">{CONTROLLER_LABEL[o.controller]}</small></span>
                      <span class="cp-badges">
                        {o.status !== 'active' ? <Badge tone="muted">{titleCase(o.status)}</Badge> : null}
                        {o.at_war ? <Badge tone="bad" icon="military">At war</Badge> : null}
                        {ch?.open ? <Badge tone="ok" icon="diplomacy">Channel open</Badge> : ch?.selected_by_me ? <Badge tone="info">Chosen</Badge> : null}
                        {unread ? <Badge tone="gold">{unread} this round</Badge> : null}
                      </span>
                    </span>
                    <span class="cp-row">
                      <span class="mini-meter"><span class="mini-label">Trust</span><Meter value={o.trust} max={100} tone={o.trust >= 60 ? 'ok' : o.trust >= 35 ? 'warn' : 'bad'} height={6} label={`Trust ${o.trust} of 100`} /><span class="mini-val">{o.trust}</span></span>
                      <span class="cp-est">{o.population_high > 0 ? <Est>{range(o.population_low, o.population_high)} people</Est> : <span class="muted">population unknown</span>} · {o.regions_known ? `${o.regions_known} region${o.regions_known === 1 ? '' : 's'} known` : 'none of their land seen'}</span>
                    </span>
                    {ch ? <span class="cp-env muted small">Envelopes this round: {ch.envelopes_used} of {ch.envelopes_limit}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {unmet.length ? <p class="muted small">Seen but not yet met: {unmet.map((o) => o.name).join(', ')}. Contact must be made before they can be chosen.</p> : null}
      </Section>

      <Section title="Treaties in force" aside={<small class="muted">{active.length}</small>}>
        {active.length === 0 ? <Empty>No treaty is in force.</Empty> : <ul class="treaty-list">{active.map((t) => <li><Treaty obs={obs} t={t} /></li>)}</ul>}
        <ActionNote tag="treaty" />
      </Section>
    </div>
  );
}

function ContactSelection({ obs, met }: { obs: Observation; met: ForeignCiv[] }) {
  const s = useApp();
  const current = obs.diplomacy.channels.filter((c) => c.selected_by_me).map((c) => c.seat);
  const [picked, setPicked] = useState<SeatId[]>(current);
  useEffect(() => { setPicked(current); }, [obs.round, current.join(',')]);
  const canChoose = obs.phase === 'contact' && !obs.ready;
  const eligible = met.filter((o) => o.status !== 'eliminated');
  const changed = picked.slice().sort().join(',') !== current.slice().sort().join(',');
  const toggle = (seat: SeatId) => setPicked(picked.includes(seat) ? picked.filter((x) => x !== seat) : [...picked, seat]);
  const why = !canChoose ? (obs.phase === 'contact' ? 'You have already finished this phase' : 'Counterparts are chosen in the contact phase at the start of each round') : picked.length > MAX_CONTACTS ? `At most ${MAX_CONTACTS} counterparts per round` : null;
  return (
    <Section title="This round’s counterparts" aside={<small class="muted">{picked.length} of {MAX_CONTACTS} chosen</small>}>
      {eligible.length === 0 ? <Empty>Nobody to choose yet.</Empty> : (
        <ul class="contact-list" data-testid="contact-selection">
          {eligible.map((o) => {
            const ch = obs.diplomacy.channels.find((c) => c.seat === o.seat);
            const on = picked.includes(o.seat);
            const full = !on && picked.length >= MAX_CONTACTS;
            return (
              <li>
                <label class={cx('contact', on && 'is-on', (!canChoose || full) && 'is-disabled')} title={full ? `At most ${MAX_CONTACTS} counterparts per round` : undefined}>
                  <input type="checkbox" checked={on} disabled={!canChoose || full} data-testid={`contact-${o.seat}`} onChange={() => toggle(o.seat)} />
                  <SeatDot color={o.color} size={11} /> <b>{o.name}</b>
                  <span class="contact-state">{obs.phase === 'contact' ? (on ? 'chosen' : '') : ch?.open ? 'channel open' : ch?.selected_by_me ? 'chosen by us only' : 'not chosen'}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {eligible.length ? (
        <div class="form-actions">
          <Btn small kind="primary" why={why} disabled={s.busy || !changed} testid="contacts-submit" onClick={() => void act({ kind: 'select_contacts', seats: picked }, 'contacts')}>Record choices</Btn>
          {why ? <Why>{why}</Why> : !changed && canChoose ? <span class="muted small">Choices recorded.</span> : null}
        </div>
      ) : null}
      <ActionNote tag="contacts" />
    </Section>
  );
}

function Counterpart({ obs, other, rules, onBack }: { obs: Observation; other: ForeignCiv; rules: JSX.Element; onBack: () => void }) {
  const s = useApp();
  const ch = obs.diplomacy.channels.find((c) => c.seat === other.seat);
  const block = envelopeBlock(obs, other, ch);
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<Intent | ''>('');
  const thread = obs.diplomacy.messages.filter((m) => (m.from === other.seat && m.to === obs.seat) || (m.to === other.seat && m.from === obs.seat)).sort((a, b) => a.id - b.id);
  const offers = obs.diplomacy.offers.filter((o) => (o.from === other.seat && o.to === obs.seat) || (o.to === other.seat && o.from === obs.seat)).sort((a, b) => b.id - a.id);
  const open = offers.filter((o) => o.status === 'open');
  const closed = offers.filter((o) => o.status !== 'open');
  const treaties = obs.diplomacy.treaties.filter((t) => t.parties.includes(other.seat)).sort((a, b) => b.id - a.id);
  const send = async () => {
    const rec = await act({ kind: 'message', to: other.seat, text: text.trim(), intent: intent || null }, 'message');
    if (rec.length && rec[0].status === 'accepted') setText('');
  };
  const sendWhy = block ?? (!text.trim() ? 'Write a message first' : text.length > MAX_MESSAGE_CHARS ? `A message is limited to ${int(MAX_MESSAGE_CHARS)} characters` : null);
  return (
    <div class="panel diplomacy counterpart-view" data-testid="counterpart-view">
      <div class="subnav">
        <button type="button" class="linklike" onClick={onBack}><Icon name="left" size={12} /> All counterparts</button>
      </div>
      <header class="detail-head">
        <span class="kicker">{CONTROLLER_LABEL[other.controller]}{other.status !== 'active' ? ` · ${other.status}` : ''} · met {fmtDate(other.contact_month)}</span>
        <h3><SeatDot color={other.color} size={13} /> {other.name}</h3>
        <div class="row wrap">
          {other.at_war ? <Badge tone="bad" icon="military">At war with us</Badge> : null}
          {other.overlord !== null ? <Badge tone="info">Subordinate to {civName(obs, other.overlord)}</Badge> : null}
          {ch?.open ? <Badge tone="ok" icon="diplomacy">Channel open this round</Badge> : <Badge tone="muted" icon="lock">No channel this round</Badge>}
          {ch ? <Badge tone="muted">Envelopes {ch.envelopes_used}/{ch.envelopes_limit}</Badge> : null}
          {ch?.sent_this_window ? <Badge tone="gold">Sent this window</Badge> : null}
        </div>
      </header>
      {rules}

      <Section title="What our records say" aside={<small class="muted">estimates, not facts</small>}>
        <div class="mini-meter"><span class="mini-label">Trust</span><Meter value={other.trust} max={100} tone={other.trust >= 60 ? 'ok' : other.trust >= 35 ? 'warn' : 'bad'} height={7} label={`Trust ${other.trust} of 100`} /><span class="mini-val">{other.trust}</span></div>
        <dl class="kvs">
          <div class="kv"><dt>Population</dt><dd>{other.population_high > 0 ? <Est>{range(other.population_low, other.population_high)} people</Est> : <span class="muted">no estimate — none of their land has been seen</span>}</dd></div>
          <div class="kv"><dt>Regions known</dt><dd>{other.regions_known}</dd></div>
          <div class="kv"><dt>Armed strength</dt><dd><Est kind="reported">{other.military_estimate || 'no report'}</Est></dd></div>
          <div class="kv"><dt>Equipment seen</dt><dd>{other.observed_tier !== null ? <Est>about tier {other.observed_tier}</Est> : <span class="muted">never observed</span>}</dd></div>
        </dl>
        {other.notes.length ? <ul class="plain-list notes">{other.notes.map((n) => <li>{n}</li>)}</ul> : null}
      </Section>

      <Section title="Correspondence" aside={<small class="muted">{thread.length} envelope{thread.length === 1 ? '' : 's'}</small>}>
        {thread.length === 0 ? <Empty>No messages have passed between us.</Empty> : (
          <ol class="thread" data-testid="thread">
            {thread.map((m) => (
              <li class={cx('msg', m.from === obs.seat ? 'is-mine' : 'is-theirs')}>
                <span class="msg-meta">{m.from === obs.seat ? 'We wrote' : `${other.name} wrote`} · {fmtDateShort(m.month)} · round {m.round}, window {m.window}{m.intent ? <Badge tone="info">{INTENT_LABEL[m.intent]}</Badge> : null}</span>
                <span class="msg-text">{m.text}</span>
              </li>
            ))}
          </ol>
        )}
        <div class="composer">
          <textarea class="text" rows={3} maxLength={MAX_MESSAGE_CHARS} placeholder={block ? 'Messages can be written when a channel is open in a negotiation window.' : `Write to ${other.name}…`} value={text} disabled={!!block}
            aria-label={`Message to ${other.name}`} data-testid="message-text" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
          <div class="composer-row">
            <Select value={intent} label="Intent tag" testid="message-intent" options={[{ value: '' as Intent | '', label: 'No intent tag' }, ...INTENTS.map((i) => ({ value: i as Intent | '', label: INTENT_LABEL[i] }))]} onChange={(v) => setIntent(v)} />
            <span class="muted small">{text.length}/{int(MAX_MESSAGE_CHARS)}</span>
            <Btn kind="primary" small icon="send" why={sendWhy} disabled={s.busy} testid="message-send" onClick={() => void send()}>Send envelope</Btn>
          </div>
          {block ? <Why>{block}</Why> : null}
          <ActionNote tag="message" />
        </div>
      </Section>

      <Section title="Offers on the table" aside={<small class="muted">{open.length} open</small>}>
        {open.length === 0 ? <Empty>No open offer between us.</Empty> : <ul class="offer-list">{open.map((o) => <li><Offer obs={obs} o={o} /></li>)}</ul>}
        <ActionNote tag="offer" />
        <TreatyComposer obs={obs} other={other} block={block} />
        {closed.length ? (
          <Expander label={`${closed.length} earlier offer${closed.length === 1 ? '' : 's'}`}>
            <ul class="offer-list">{closed.map((o) => <li><Offer obs={obs} o={o} /></li>)}</ul>
          </Expander>
        ) : null}
      </Section>

      <Section title="Treaties" aside={<small class="muted">{treaties.length}</small>}>
        {treaties.length === 0 ? <Empty>No treaty has been signed with {other.name}.</Empty> : <ul class="treaty-list">{treaties.map((t) => <li><Treaty obs={obs} t={t} /></li>)}</ul>}
        <ActionNote tag="treaty" />
      </Section>
    </div>
  );
}

function ClauseLines({ obs, clauses, summary, other }: { obs: Observation; clauses: Clause[]; summary: string[]; other: SeatId }) {
  const lines = summary.length ? summary : clauses.map((c) => describeClause(obs, c, other));
  return <ol class="clause-lines">{lines.map((l) => <li>{l}</li>)}</ol>;
}

const OFFER_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted' | 'info'> = { open: 'info', signed: 'ok', declined: 'bad', withdrawn: 'muted', expired: 'muted' };

function Offer({ obs, o }: { obs: Observation; o: OfferView }) {
  const s = useApp();
  const mine = o.from === obs.seat;
  const otherSeat = mine ? o.to : o.from;
  const other = obs.others.find((x) => x.seat === otherSeat);
  const ch = obs.diplomacy.channels.find((c) => c.seat === otherSeat);
  const isOpen = o.status === 'open';
  // Signing during negotiation spends an envelope; in other phases it is free.
  const signWhy = !isOpen ? null : obs.phase === 'negotiate' && other ? envelopeBlock(obs, other, ch) : obs.phase === 'finished' ? 'The match has finished' : null;
  return (
    <div class={cx('card offer', 'offer-' + o.status, !mine && isOpen && 'is-incoming')} data-testid="offer-card" data-offer={o.id}>
      <div class="row-between">
        <span class="kicker">{mine ? `Our proposal to ${civName(obs, o.to)}` : `Proposal from ${civName(obs, o.from)}`} · {fmtDate(o.created_month)}</span>
        <Badge tone={OFFER_TONE[o.status] ?? 'muted'}>{titleCase(o.status)}</Badge>
      </div>
      <ClauseLines obs={obs} clauses={o.clauses} summary={o.summary} other={otherSeat} />
      {o.text ? <p class="offer-text">“{o.text}”</p> : null}
      {isOpen ? (
        <>
          <p class="muted small">Binds nobody until the other party signs this exact version. Lapses after round {o.expires_round}.</p>
          <div class="form-actions">
            {mine ? (
              <Btn small kind="ghost" disabled={s.busy} testid="offer-withdraw" onClick={() => void act({ kind: 'withdraw_offer', offer: o.id }, 'offer')}>Withdraw</Btn>
            ) : (
              <>
                <Btn small kind="primary" icon="seal" why={signWhy} disabled={s.busy} testid="offer-sign" onClick={() => void act({ kind: 'sign_treaty', offer: o.id }, 'offer')}>Sign</Btn>
                <Btn small kind="ghost" disabled={s.busy} testid="offer-decline" onClick={() => void act({ kind: 'decline_offer', offer: o.id }, 'offer')}>Decline</Btn>
              </>
            )}
            {!mine && signWhy ? <Why>{signWhy}</Why> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Treaty({ obs, t }: { obs: Observation; t: TreatyView }) {
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  const otherSeat = t.parties[0] === obs.seat ? t.parties[1] : t.parties[0];
  const active = t.status === 'active';
  return (
    <div class={cx('card treaty', 'treaty-' + t.status)} data-testid="treaty-card">
      <div class="row-between">
        <span class="kicker"><SeatDot color={civColor(obs, otherSeat)} /> With {civName(obs, otherSeat)} · signed {fmtDate(t.signed_month)}{t.ends_month !== null ? ` · ends ${fmtDate(t.ends_month)}` : ''}</span>
        <Badge tone={active ? 'ok' : t.status === 'broken' ? 'bad' : 'muted'} icon={active ? 'seal' : undefined}>{titleCase(t.status)}</Badge>
      </div>
      <ClauseLines obs={obs} clauses={t.clauses} summary={t.summary} other={otherSeat} />
      {t.performance.length ? (
        <Expander label={`Performance record (${t.performance.length})`} open={t.performance.length <= 3}>
          <ul class="plain-list performance">{t.performance.map((p) => <li>{p}</li>)}</ul>
        </Expander>
      ) : <p class="muted small">No deliveries or breaches recorded yet.</p>}
      {active ? (
        <div class="form-actions">
          {confirm ? (
            <>
              <Btn small kind="danger" disabled={s.busy} testid="treaty-break-confirm" onClick={() => { setConfirm(false); void act({ kind: 'break_treaty', treaty: t.id }, 'treaty'); }}>Repudiate — the breach is recorded permanently</Btn>
              <Btn small kind="ghost" onClick={() => setConfirm(false)}>Keep the treaty</Btn>
            </>
          ) : <Btn small kind="ghost" testid="treaty-break" onClick={() => setConfirm(true)}>Repudiate…</Btn>}
        </div>
      ) : null}
    </div>
  );
}

// --- treaty composer --------------------------------------------------------------

function defaultClause(kind: ClauseKind, obs: Observation, other: ForeignCiv): Clause {
  switch (kind) {
    case 'goods': return { kind, from: obs.seat, good: 'food', amount_per_month: 50_000, months: 1 };
    case 'knowledge': return { kind, from: obs.seat, tech: '' };
    case 'practice': return { kind, from: obs.seat, practice: '' };
    case 'maps': return { kind, from: obs.seat };
    case 'non_aggression': return { kind, months: 60 };
    case 'defensive_pact': return { kind, months: 60 };
    case 'peace': return { kind };
    case 'subordination': return { kind, from: other.seat, tribute_bp: 1000 };
    case 'cede_region': return { kind, from: obs.seat, region: obs.regions.find((r) => r.own && r.id !== obs.civ.capital)?.id ?? obs.civ.capital };
  }
}

function clauseProblem(obs: Observation, other: ForeignCiv, c: Clause): string | null {
  switch (c.kind) {
    case 'goods': return c.amount_per_month <= 0 ? 'Enter an amount' : c.months < 1 || c.months > 240 ? 'Term is 1 to 240 months' : null;
    case 'knowledge': return c.tech ? null : 'Choose a method';
    case 'practice': return c.practice ? null : 'Choose a practice';
    case 'non_aggression':
    case 'defensive_pact': return c.months < 1 || c.months > 600 ? 'Term is 1 to 600 months' : null;
    case 'peace': return other.at_war ? null : 'The parties are not at war';
    case 'subordination': return c.tribute_bp > 5000 ? 'Tribute is at most 50%' : null;
    default: return null;
  }
}

function TreatyComposer({ obs, other, block }: { obs: Observation; other: ForeignCiv; block: string | null }) {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState<ClauseKind>('goods');
  const update = (i: number, c: Clause) => setClauses(clauses.map((x, j) => (j === i ? c : x)));
  const problems = clauses.map((c) => clauseProblem(obs, other, c));
  const why = block ?? (clauses.length === 0 ? 'Add at least one clause' : clauses.length > 8 ? 'A treaty has at most eight clauses' : problems.find(Boolean) ?? null);
  const submit = async () => {
    const rec = await act({ kind: 'propose_treaty', to: other.seat, clauses, text: text.trim() || null }, 'propose');
    if (rec.length && rec[0].status === 'accepted') { setClauses([]); setText(''); setOpen(false); }
  };
  const parties = [{ value: obs.seat, label: `${obs.civ.name} (us)` }, { value: other.seat, label: other.name }];
  if (!open) {
    return (
      <div class="form-actions">
        <Btn small icon="plus" testid="compose-open" onClick={() => setOpen(true)}>Draft a proposal</Btn>
        {block ? <Why>{block}</Why> : null}
      </div>
    );
  }
  return (
    <div class="card composer-card" data-testid="treaty-composer">
      <div class="row-between"><b class="detail-title">Draft proposal to {other.name}</b><Btn small kind="ghost" icon="close" title="Discard draft" onClick={() => { setOpen(false); setClauses([]); }} /></div>
      <p class="muted small">A proposal is one envelope. It binds nobody until {other.name} signs this exact version; it lapses after next round.</p>
      {clauses.length === 0 ? <p class="empty">No clauses yet.</p> : null}
      <ol class="clause-editor">
        {clauses.map((c, i) => (
          <li class={cx('clause', problems[i] && 'has-problem')} data-testid={`clause-${c.kind}`}>
            <div class="clause-head"><b>{CLAUSE_LABEL[c.kind]}</b><button type="button" class="linklike" aria-label="Remove clause" onClick={() => setClauses(clauses.filter((_, j) => j !== i))}><Icon name="trash" size={13} /> Remove</button></div>
            <ClauseFields obs={obs} other={other} c={c} parties={parties} onChange={(n) => update(i, n)} />
            <p class="clause-preview">{describeClause(obs, c, other.seat)}</p>
            {problems[i] ? <Why>{problems[i]}</Why> : null}
          </li>
        ))}
      </ol>
      <div class="add-clause">
        <Select value={adding} label="Clause kind" testid="clause-kind" options={(Object.keys(CLAUSE_LABEL) as ClauseKind[]).map((k) => ({ value: k, label: CLAUSE_LABEL[k] }))} onChange={(v) => setAdding(v)} />
        <Btn small icon="plus" why={clauses.length >= 8 ? 'A treaty has at most eight clauses' : null} testid="clause-add" onClick={() => setClauses([...clauses, defaultClause(adding, obs, other)])}>Add clause</Btn>
      </div>
      <p class="muted small">{CLAUSE_HINT[adding]}</p>
      <label class="field"><span class="field-label">Covering note (optional)</span>
        <textarea class="text" rows={2} maxLength={MAX_MESSAGE_CHARS} value={text} data-testid="proposal-text" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="form-actions">
        <Btn kind="primary" icon="seal" why={why} disabled={s.busy} testid="proposal-send" onClick={() => void submit()}>Send proposal</Btn>
        {why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="propose" />
    </div>
  );
}

function ClauseFields({ obs, other, c, parties, onChange }: {
  obs: Observation; other: ForeignCiv; c: Clause; parties: { value: SeatId; label: string }[]; onChange: (c: Clause) => void;
}) {
  const fromSel = (from: SeatId, set: (s: SeatId) => void, label = 'Performed by') => (
    <label class="inline-field"><span>{label}</span><Select value={from} options={parties} onChange={set} label={label} /></label>
  );
  switch (c.kind) {
    case 'goods':
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from }), 'Delivered by')}
          <label class="inline-field"><span>Good</span><Select<Good> value={c.good} options={GOODS.map((g) => ({ value: g, label: GOOD_LABEL[g] }))} onChange={(good) => onChange({ ...c, good })} label="Good" /></label>
          <label class="inline-field"><span>Amount</span><NumInput value={c.amount_per_month / 1000} min={1} max={1_000_000} unit={c.months > 1 ? 'units / month' : 'units'} label="Amount" onChange={(v) => onChange({ ...c, amount_per_month: Math.round(v * 1000) })} testid="clause-amount" /></label>
          <label class="inline-field"><span>Months</span><NumInput value={c.months} min={1} max={240} unit={c.months > 1 ? 'months' : 'single delivery'} label="Months" width={64} onChange={(v) => onChange({ ...c, months: Math.round(v) })} /></label>
        </div>
      );
    case 'knowledge': {
      // Only handles from our own observation may be named. We can give what we
      // understand; we can ask for what we have heard of but not yet understood.
      const mine = c.from === obs.seat;
      const list = obs.knowledge.techs.filter((t) => (mine ? ['understood', 'prototyped', 'adopted'].includes(t.state) : !['understood', 'prototyped', 'adopted'].includes(t.state)));
      const leads = mine ? [] : obs.knowledge.leads.filter((l) => !list.some((t) => t.handle === l.handle));
      const options = [{ value: '', label: list.length + leads.length ? 'Choose a method…' : mine ? 'Nothing understood yet' : 'No known method we lack' }, ...list.map((t) => ({ value: t.handle, label: t.name })), ...leads.map((l) => ({ value: l.handle, label: `Lead: ${l.title}` }))];
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from, tech: '' }), 'Handed over by')}
          <label class="inline-field wide"><span>Method</span><Select value={c.tech} options={options} onChange={(tech) => onChange({ ...c, tech })} label="Method" testid="clause-tech" /></label>
          {!mine ? <small class="muted">You can only ask for methods your own records already name.</small> : null}
        </div>
      );
    }
    case 'practice': {
      const mine = c.from === obs.seat;
      const list = obs.culture.practices.filter((p) => (mine ? p.state === 'enacted' || p.state === 'established' : p.state === 'recognized' || p.state === 'reforming'));
      const options = [{ value: '', label: list.length ? 'Choose a practice…' : mine ? 'No enacted practice' : 'No recognised practice we lack' }, ...list.map((p) => ({ value: p.handle, label: p.name }))];
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from, practice: '' }), 'Described by')}
          <label class="inline-field wide"><span>Practice</span><Select value={c.practice} options={options} onChange={(practice) => onChange({ ...c, practice })} label="Practice" /></label>
          {!mine ? <small class="muted">You can only ask about practices your own records already name.</small> : null}
        </div>
      );
    }
    case 'maps':
      return <div class="clause-fields">{fromSel(c.from, (from) => onChange({ ...c, from }), 'Shared by')}</div>;
    case 'non_aggression':
    case 'defensive_pact':
      return (
        <div class="clause-fields">
          <label class="inline-field"><span>Term</span><NumInput value={c.months} min={1} max={600} step={12} unit={`months (${fmtMonths(c.months)})`} label="Term in months" onChange={(v) => onChange({ ...c, months: Math.round(v) })} /></label>
        </div>
      );
    case 'peace':
      return <div class="clause-fields"><small class="muted">Ends the war between {obs.civ.name} and {other.name}.</small></div>;
    case 'subordination':
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from }), 'Subordinate')}
          <label class="inline-field"><span>Tribute</span><NumInput value={c.tribute_bp / 100} min={0} max={50} unit="% of output" label="Tribute" width={64} onChange={(v) => onChange({ ...c, tribute_bp: Math.round(v * 100) })} /></label>
        </div>
      );
    case 'cede_region': {
      const mine = c.from === obs.seat;
      const list = obs.regions.filter((r) => (mine ? !!r.own && r.owner === obs.seat : r.owner === other.seat));
      const options = list.length ? list.map((r) => ({ value: r.id, label: r.name })) : [{ value: c.region, label: mine ? 'No region to cede' : 'No region of theirs is known' }];
      const value = list.some((r) => r.id === c.region) ? c.region : options[0].value;
      if (value !== c.region && list.length) queueMicrotask(() => onChange({ ...c, region: value }));
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from }), 'Ceded by')}
          <label class="inline-field wide"><span>Region</span><Select value={value} options={options} onChange={(region) => onChange({ ...c, region })} label="Region" /></label>
        </div>
      );
    }
  }
}
