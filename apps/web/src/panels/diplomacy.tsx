// Diplomacy: counterparts, the round's contact choice, channels and envelope
// budgets, message threads, structured treaty proposals, offers and treaties.
// The phase rules are stated wherever they disable something.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type {
  AnyClause, ChannelView, ForeignCiv, Good, Intent, Observation, OfferView, ProgrammeService, Qual, SeatId, TreatyView,
} from '../protocol';
import { MAX_CONTACTS, MAX_MESSAGE_CHARS, NEGOTIATION_WINDOWS } from '../protocol';
import {
  CONTROLLER_LABEL, GOODS, GOOD_LABEL, GOOD_SHORT, INTENTS, INTENT_LABEL, QUAL_LABEL, STATUS_LABEL, fmtDate, fmtDateShort, fmtMonths, int,
  displayUnit, joinList, lc, pct, people, qty, range, roundLength, titleCase, tn,
} from '../format';
import { isZh, t, tc, useLocale } from '../i18n';
import { Icon } from '../icons';
import {
  ActionNote, Badge, Btn, Empty, Est, Expander, Meter, NumInput, SeatDot, Section, Select, Why, cx,
} from '../ui';
import { act, civColor, civName, consumeIntent, ready, regionName, useApp } from '../store';

/** Every clause a ruleset 3.0 referee accepts, the cooperation clauses of ruleset 2.0 included. */
type Clause = AnyClause;
type ClauseKind = AnyClause['kind'];

// i18n-table
const CLAUSE_LABEL: Record<ClauseKind, string> = {
  goods: 'Deliver goods', knowledge: 'Hand over a method', practice: 'Describe a practice', maps: 'Share maps',
  non_aggression: 'Non-aggression', defensive_pact: 'Defensive pact', peace: 'Peace', subordination: 'Subordination',
  cede_region: 'Cede a region', secondment: 'Second experts', joint_programme: 'Joint programme',
};
const SERVICE_LABEL: Record<ProgrammeService, string> = {
  launch: 'Launch complex', orbital_yard: 'Orbital yard', high_energy: 'High-energy laboratory', undisclosed: 'An installation not known to us',
};
// i18n-end
/** Lowest and highest number of experts one secondment clause may lend (bts-engine SECONDMENT_PEOPLE). */
const SECONDMENT_PEOPLE: [number, number] = [500, 200_000];
/** The clause's own term bounds in months, before the round's length widens them (design chapter 36, section 2.5). */
const OWN_TERM: Partial<Record<ClauseKind, [number, number]>> = {
  goods: [6, 240], non_aggression: [6, 600], defensive_pact: [6, 600], secondment: [6, 240], joint_programme: [12, 240],
};
/** Clauses that may run open-ended (months 0) until a party gives notice. */
const OPEN_ENDED: ClauseKind[] = ['goods', 'non_aggression', 'defensive_pact'];

/** Term bounds this round: at least the round's length, at most three rounds, or the clause's own bounds if wider. */
export function termBounds(obs: Observation, kind: ClauseKind): [number, number] {
  const own = OWN_TERM[kind] ?? [6, 240];
  const rm = obs.calendar?.round_months ?? obs.months_per_round;
  return [Math.max(rm, own[0]), Math.max(3 * rm, own[1])];
}

/** A clause term for reading: "10 years", or "until notice" for an open-ended one. */
function term(months: number): string {
  return months === 0 ? t('until notice') : fmtMonths(months);
}

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
  secondment: 'One party lends qualified people for a term. They live and work with the borrower and go home at the end; pay for them with goods clauses.',
  joint_programme: 'The host’s launch complex, orbital yard or high-energy laboratory also serves the other party for the term, at a higher running cost to the host.',
};

/**
 * Offer and treaty status words. "Open" and "Active" mean other things elsewhere in the
 * interface (a button, a seat still in play), so Chinese looks them up under their own keys.
 */
function statusLabel(status: string, kind: 'offer' | 'treaty'): string {
  if (isZh()) {
    if (kind === 'offer' && status === 'open') return t('Open (offer status)');
    if (kind === 'treaty' && status === 'active') return t('Active (treaty status)');
  }
  return titleCase(status);
}

/**
 * Free text is shown as written. Native AI seats send fixed English sentences, so those
 * (and only those) go through the content dictionary.
 */
function authored(obs: Observation, seat: SeatId, text: string): string {
  const kind = obs.others.find((o) => o.seat === seat)?.controller;
  return kind && kind.startsWith('native') ? tc(text) : text;
}

/** Why an envelope (message, proposal, or a signature during negotiation) cannot be sent now; null when it can. */
function envelopeBlock(obs: Observation, other: ForeignCiv, ch: ChannelView | undefined): string | null {
  if (obs.phase === 'finished') return t('The match has finished');
  if (obs.ready) return t('You have finished this phase; wait for the others');
  if (obs.phase === 'contact') return t('Messages and proposals belong to the negotiation windows, which open after contact selection');
  if (obs.phase === 'plan') return t('The negotiation windows have closed for this round');
  if (!ch || !ch.open) {
    return ch?.selected_by_me
      ? t('{name} did not choose us this round, so no channel is open', { name: tc(other.name) })
      : t('You did not choose {name} in this round’s contact phase', { name: tc(other.name) });
  }
  if (ch.envelopes_used >= ch.envelopes_limit) return t('This pair has used all {n} envelopes for the round', { n: ch.envelopes_limit });
  if (ch.sent_this_window) return t('One envelope per counterpart per window: wait for window {n}', { n: Math.min(NEGOTIATION_WINDOWS, obs.window + 1) });
  return null;
}

export function describeClause(obs: Observation, c: Clause, other: SeatId): string {
  const who = (s: SeatId) => tc(s === obs.seat ? obs.civ.name : civName(obs, s));
  const to = (s: SeatId) => who(s === obs.seat ? other : obs.seat);
  switch (c.kind) {
    case 'goods':
      return c.months === 1
        ? t('{who} delivers {amount} {good} to {to}, once', { who: who(c.from), amount: qty(c.good, c.amount_per_month), good: lc(GOOD_SHORT[c.good]), to: to(c.from) })
        : c.months === 0
          ? t('{who} delivers {amount} {good} to {to} every month until notice', { who: who(c.from), amount: qty(c.good, c.amount_per_month), good: lc(GOOD_SHORT[c.good]), to: to(c.from) })
          : t('{who} delivers {amount} {good} to {to} every month for {term}', { who: who(c.from), amount: qty(c.good, c.amount_per_month), good: lc(GOOD_SHORT[c.good]), to: to(c.from), term: fmtMonths(c.months) });
    case 'knowledge': {
      const tech = obs.knowledge.techs.find((x) => x.handle === c.tech);
      return tech ? t('{who} hands over “{name}”', { who: who(c.from), name: tc(tech.name) }) : t('{who} hands over a method not known to us', { who: who(c.from) });
    }
    case 'practice': {
      const p = obs.culture.practices.find((x) => x.handle === c.practice);
      return p ? t('{who} describes “{name}”', { who: who(c.from), name: tc(p.name) }) : t('{who} describes a practice not known to us', { who: who(c.from) });
    }
    case 'maps': return t('{who} shares maps and survey records', { who: who(c.from) });
    case 'non_aggression': return c.months === 0 ? t('Non-aggression until notice') : t('Non-aggression for {term}', { term: fmtMonths(c.months) });
    case 'defensive_pact': return c.months === 0 ? t('Defensive pact until notice') : t('Defensive pact for {term}', { term: fmtMonths(c.months) });
    case 'peace': return t('Peace between the parties');
    case 'subordination': return t('{who} accepts {to} as highest authority, tribute {pct}', { who: who(c.from), to: to(c.from), pct: pct(c.tribute_bp) });
    case 'cede_region': return t('{who} cedes {region}', { who: who(c.from), region: regionName(obs, c.region) });
    case 'secondment': return t('{who} lends {people} ({qual}) to {to} for {term}', { who: who(c.from), people: people(c.count), qual: t(QUAL_LABEL[c.qual]), to: to(c.from), term: term(c.months) });
    case 'joint_programme': return t('The {service} of {who} also serves {to} for {term}', { service: lc(SERVICE_LABEL[c.service]), who: who(c.host), to: to(c.host), term: term(c.months) });
  }
}

function phaseRule(obs: Observation): { title: string; lines: string[] } {
  if (obs.phase === 'contact') {
    return { title: t('Now: contact selection'), lines: [
      t('Choose up to {n} counterparts for this round. A channel opens only where both sides choose each other.', { n: MAX_CONTACTS }),
      t('Messages and proposals wait for the negotiation windows. Offers already on the table can be declined or withdrawn at any time.'),
    ] };
  }
  if (obs.phase === 'negotiate') {
    return { title: t('Now: negotiation window {n} of {total}', { n: obs.window, total: NEGOTIATION_WINDOWS }), lines: [
      t('All seats act at once. One envelope — a message, a proposal or a signature — per open counterpart in each window, ten per pair per round.'),
      t('Envelopes are delivered when the window closes.'),
    ] };
  }
  if (obs.phase === 'plan') {
    return { title: t('Now: planning'), lines: [
      t('The negotiation windows have closed. You can still sign, decline or withdraw offers and repudiate treaties.'),
      t('New messages and proposals wait for next round.'),
    ] };
  }
  return { title: t('The match has finished'), lines: [t('The diplomatic record is closed.')] };
}

export function DiplomacyPanel() {
  useLocale();
  const s = useApp();
  const obs = s.obs!;
  const [seat, setSeat] = useState<SeatId | null>(null);
  useEffect(() => {
    const it = s.intent;
    if (it?.kind === 'counterpart') { setSeat(it.seat); consumeIntent(); }
  }, [s.intent?.nonce]);

  const other = seat !== null ? obs.others.find((o) => o.seat === seat) : undefined;
  const rule = phaseRule(obs);
  const nextLabel = obs.phase === 'contact' ? t('Open negotiations') : obs.phase === 'negotiate' ? (obs.window < NEGOTIATION_WINDOWS ? t('Next window') : t('To planning')) : t('Finish planning');

  const rules = (
    <div class="phase-card" data-testid="diplomacy-rules">
      <div>
        <b>{rule.title}</b>
        {rule.lines.map((l) => <p>{l}</p>)}
      </div>
      {obs.phase !== 'finished' && !obs.ready ? (
        <div class="phase-card-actions">
          <Btn small disabled={s.advancing || s.busy} testid="diplomacy-next" onClick={() => void ready(false)}>{nextLabel}</Btn>
          <Btn small kind="ghost" disabled={s.advancing || s.busy} onClick={() => void ready(true)}>{t('End round')}</Btn>
        </div>
      ) : obs.ready ? <Badge tone="info" icon="clock">{t('Waiting')}</Badge> : null}
    </div>
  );

  if (other) return <Counterpart obs={obs} other={other} rules={rules} onBack={() => setSeat(null)} />;

  const met = obs.others.filter((o) => o.contacted);
  const unmet = obs.others.filter((o) => !o.contacted);
  const incoming = obs.diplomacy.offers.filter((o) => o.to === obs.seat && o.status === 'open');
  const active = obs.diplomacy.treaties.filter((t) => t.status === 'active');

  return (
    <div class="panel diplomacy">
      <p class="panel-lede">{t('What can I believe, and what can I commit to?')}</p>
      {rules}

      <ContactSelection obs={obs} met={met} />

      {incoming.length ? (
        <Section title={t('Awaiting your answer')} aside={<small class="muted">{t('unsigned proposals lapse')}</small>}>
          <ul class="offer-list">{incoming.map((o) => <li><Offer obs={obs} o={o} /></li>)}</ul>
          <ActionNote tag="offer" />
        </Section>
      ) : null}

      <Section title={t('Counterparts')} aside={<small class="muted">{t('{n} met', { n: met.length })}</small>}>
        {met.length === 0 ? <Empty>{t('No other civilization has been met. Contact comes from exploring: survey and settle towards the edges of the map.')}</Empty> : (
          <ul class="counterpart-list">
            {met.map((o) => {
              const ch = obs.diplomacy.channels.find((c) => c.seat === o.seat);
              const unread = obs.diplomacy.messages.filter((m) => m.from === o.seat && m.round === obs.round).length;
              return (
                <li>
                  <button type="button" class="card card-click counterpart" data-testid={`counterpart-${o.seat}`} onClick={() => setSeat(o.seat)}>
                    <span class="cp-top">
                      <span class="cp-name"><SeatDot color={o.color} size={12} /> <b>{tc(o.name)}</b> <small class="muted">{t(CONTROLLER_LABEL[o.controller])}</small></span>
                      <span class="cp-badges">
                        {o.status !== 'active' ? <Badge tone="muted">{t(STATUS_LABEL[o.status])}</Badge> : null}
                        {o.at_war ? <Badge tone="bad" icon="military">{t('At war')}</Badge> : null}
                        {ch?.open ? <Badge tone="ok" icon="diplomacy">{t('Channel open')}</Badge> : ch?.selected_by_me ? <Badge tone="info">{t('Chosen')}</Badge> : null}
                        {unread ? <Badge tone="gold">{t('{n} this round', { n: unread })}</Badge> : null}
                      </span>
                    </span>
                    <span class="cp-row">
                      <span class="mini-meter"><span class="mini-label">{t('Trust')}</span><Meter value={o.trust} max={100} tone={o.trust >= 60 ? 'ok' : o.trust >= 35 ? 'warn' : 'bad'} height={6} label={t('Trust {n} of 100', { n: o.trust })} /><span class="mini-val">{o.trust}</span></span>
                      <span class="cp-est">{o.population_high > 0 ? <Est>{t('{n} people', { n: range(o.population_low, o.population_high) })}</Est> : <span class="muted">{t('population unknown')}</span>} · {o.regions_known ? tn(o.regions_known, '{n} region known', '{n} regions known') : t('none of their land seen')}</span>
                    </span>
                    {ch ? <span class="cp-env muted small">{t('Envelopes this round: {used} of {limit}', { used: ch.envelopes_used, limit: ch.envelopes_limit })}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {unmet.length ? <p class="muted small">{t('Seen but not yet met: {names}. Contact must be made before they can be chosen.', { names: joinList(unmet.map((o) => tc(o.name))) })}</p> : null}
      </Section>

      <Section title={t('Treaties in force')} aside={<small class="muted">{active.length}</small>}>
        {active.length === 0 ? <Empty>{t('No treaty is in force.')}</Empty> : <ul class="treaty-list">{active.map((tr) => <li><Treaty obs={obs} t={tr} /></li>)}</ul>}
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
  const why = !canChoose ? (obs.phase === 'contact' ? t('You have already finished this phase') : t('Counterparts are chosen in the contact phase at the start of each round')) : picked.length > MAX_CONTACTS ? t('At most {n} counterparts per round', { n: MAX_CONTACTS }) : null;
  return (
    <Section title={t('This round’s counterparts')} aside={<small class="muted">{t('{n} of {max} chosen', { n: picked.length, max: MAX_CONTACTS })}</small>}>
      {eligible.length === 0 ? <Empty>{t('Nobody to choose yet.')}</Empty> : (
        <ul class="contact-list" data-testid="contact-selection">
          {eligible.map((o) => {
            const ch = obs.diplomacy.channels.find((c) => c.seat === o.seat);
            const on = picked.includes(o.seat);
            const full = !on && picked.length >= MAX_CONTACTS;
            return (
              <li>
                <label class={cx('contact', on && 'is-on', (!canChoose || full) && 'is-disabled')} title={full ? t('At most {n} counterparts per round', { n: MAX_CONTACTS }) : undefined}>
                  <input type="checkbox" checked={on} disabled={!canChoose || full} data-testid={`contact-${o.seat}`} onChange={() => toggle(o.seat)} />
                  <SeatDot color={o.color} size={11} /> <b>{tc(o.name)}</b>
                  <span class="contact-state">{obs.phase === 'contact' ? (on ? t('chosen') : '') : ch?.open ? t('channel open') : ch?.selected_by_me ? t('chosen by us only') : t('not chosen')}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {eligible.length ? (
        <div class="form-actions">
          <Btn small kind="primary" why={why} disabled={s.busy || !changed} testid="contacts-submit" onClick={() => void act({ kind: 'select_contacts', seats: picked }, 'contacts')}>{t('Record choices')}</Btn>
          {why ? <Why>{why}</Why> : !changed && canChoose ? <span class="muted small">{t('Choices recorded.')}</span> : null}
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
  const sendWhy = block ?? (!text.trim() ? t('Write a message first') : text.length > MAX_MESSAGE_CHARS ? t('A message is limited to {n} characters', { n: int(MAX_MESSAGE_CHARS) }) : null);
  const otherName = tc(other.name);
  return (
    <div class="panel diplomacy counterpart-view" data-testid="counterpart-view">
      <div class="subnav">
        <button type="button" class="linklike" onClick={onBack}><Icon name="left" size={12} /> {t('All counterparts')}</button>
      </div>
      <header class="detail-head">
        <span class="kicker">{t(CONTROLLER_LABEL[other.controller])}{other.status !== 'active' ? ` · ${lc(STATUS_LABEL[other.status])}` : ''} · {t('met {date}', { date: fmtDate(other.contact_month) })}</span>
        <h3><SeatDot color={other.color} size={13} /> {otherName}</h3>
        <div class="row wrap">
          {other.at_war ? <Badge tone="bad" icon="military">{t('At war with us')}</Badge> : null}
          {other.overlord !== null ? <Badge tone="info">{t('Subordinate to {name}', { name: tc(civName(obs, other.overlord)) })}</Badge> : null}
          {ch?.open ? <Badge tone="ok" icon="diplomacy">{t('Channel open this round')}</Badge> : <Badge tone="muted" icon="lock">{t('No channel this round')}</Badge>}
          {ch ? <Badge tone="muted">{t('Envelopes {used}/{limit}', { used: ch.envelopes_used, limit: ch.envelopes_limit })}</Badge> : null}
          {ch?.sent_this_window ? <Badge tone="gold">{t('Sent this window')}</Badge> : null}
        </div>
      </header>
      {rules}

      <Section title={t('What our records say')} aside={<small class="muted">{t('estimates, not facts')}</small>}>
        <div class="mini-meter"><span class="mini-label">{t('Trust')}</span><Meter value={other.trust} max={100} tone={other.trust >= 60 ? 'ok' : other.trust >= 35 ? 'warn' : 'bad'} height={7} label={t('Trust {n} of 100', { n: other.trust })} /><span class="mini-val">{other.trust}</span></div>
        <dl class="kvs">
          <div class="kv"><dt>{t('Population')}</dt><dd>{other.population_high > 0 ? <Est>{t('{n} people', { n: range(other.population_low, other.population_high) })}</Est> : <span class="muted">{t('no estimate — none of their land has been seen')}</span>}</dd></div>
          <div class="kv"><dt>{t('Regions known')}</dt><dd>{other.regions_known}</dd></div>
          <div class="kv"><dt>{t('Armed strength')}</dt><dd><Est kind="reported">{other.military_estimate ? tc(other.military_estimate) : t('no report')}</Est></dd></div>
          <div class="kv"><dt>{t('Equipment seen')}</dt><dd>{other.observed_tier !== null ? <Est>{t('about tier {n}', { n: other.observed_tier })}</Est> : <span class="muted">{t('never observed')}</span>}</dd></div>
        </dl>
        {other.notes.length ? <ul class="plain-list notes">{other.notes.map((n) => <li>{tc(n)}</li>)}</ul> : null}
      </Section>

      <WarPolicy obs={obs} other={other} />

      <Section title={t('Correspondence')} aside={<small class="muted">{tn(thread.length, '{n} envelope', '{n} envelopes')}</small>}>
        {thread.length === 0 ? <Empty>{t('No messages have passed between us.')}</Empty> : (
          <ol class="thread" data-testid="thread">
            {thread.map((m) => (
              <li class={cx('msg', m.from === obs.seat ? 'is-mine' : 'is-theirs')}>
                <span class="msg-meta">{m.from === obs.seat ? t('We wrote') : t('{name} wrote', { name: otherName })} · {fmtDateShort(m.month)} · {t('round {round}, window {window}', { round: m.round, window: m.window })}{m.intent ? <Badge tone="info">{t(INTENT_LABEL[m.intent])}</Badge> : null}</span>
                <span class="msg-text">{authored(obs, m.from, m.text)}</span>
              </li>
            ))}
          </ol>
        )}
        <div class="composer">
          <textarea class="text" rows={3} maxLength={MAX_MESSAGE_CHARS} placeholder={block ? t('Messages can be written when a channel is open in a negotiation window.') : t('Write to {name}…', { name: otherName })} value={text} disabled={!!block}
            aria-label={t('Message to {name}', { name: otherName })} data-testid="message-text" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
          <div class="composer-row">
            <Select value={intent} label={t('Intent tag')} testid="message-intent" options={[{ value: '' as Intent | '', label: t('No intent tag') }, ...INTENTS.map((i) => ({ value: i as Intent | '', label: t(INTENT_LABEL[i]) }))]} onChange={(v) => setIntent(v)} />
            <span class="muted small">{text.length}/{int(MAX_MESSAGE_CHARS)}</span>
            <Btn kind="primary" small icon="send" why={sendWhy} disabled={s.busy} testid="message-send" onClick={() => void send()}>{t('Send envelope')}</Btn>
          </div>
          {block ? <Why>{block}</Why> : null}
          <ActionNote tag="message" />
        </div>
      </Section>

      <Section title={t('Offers on the table')} aside={<small class="muted">{t('{n} open', { n: open.length })}</small>}>
        {open.length === 0 ? <Empty>{t('No open offer between us.')}</Empty> : <ul class="offer-list">{open.map((o) => <li><Offer obs={obs} o={o} /></li>)}</ul>}
        <ActionNote tag="offer" />
        <TreatyComposer obs={obs} other={other} block={block} />
        {closed.length ? (
          <Expander label={tn(closed.length, '{n} earlier offer', '{n} earlier offers')}>
            <ul class="offer-list">{closed.map((o) => <li><Offer obs={obs} o={o} /></li>)}</ul>
          </Expander>
        ) : null}
      </Section>

      <Section title={t('Treaties')} aside={<small class="muted">{treaties.length}</small>}>
        {treaties.length === 0 ? <Empty>{t('No treaty has been signed with {name}.', { name: otherName })}</Empty> : <ul class="treaty-list">{treaties.map((tr) => <li><Treaty obs={obs} t={tr} /></li>)}</ul>}
        <ActionNote tag="treaty" />
      </Section>
    </div>
  );
}

/** Armistice never comes sooner than this many months without ground changing hands (bts-engine military::armistices). */
const ARMISTICE_MIN_MONTHS = 36;

/**
 * Standing war policy toward one counterpart (design chapter 36, section 2.6): accept a white peace
 * once no region has changed hands between us for a number of months. When both governments hold
 * such a policy, the war ends where the lines stand (an armistice) — inside a long round too.
 */
function WarPolicy({ obs, other }: { obs: Observation; other: ForeignCiv }) {
  const s = useApp();
  const cur = (obs.civ.policies.war_policies ?? []).find((p) => p.seat === other.seat);
  const curMonths = cur?.accept_white_peace_after_months ?? null;
  const [months, setMonths] = useState<number>(curMonths ?? ARMISTICE_MIN_MONTHS);
  useEffect(() => { if (curMonths !== null) setMonths(curMonths); }, [curMonths]);
  const save = (m: number | null) => void act({ kind: 'set_policy', setting: { kind: 'war_policy', seat: other.seat, accept_white_peace_after_months: m, accept_cession_max: cur?.accept_cession_max ?? 0 } }, 'war-policy');
  const otherName = tc(other.name);
  return (
    <Section title={t('War policy')} aside={other.at_war ? <Badge tone="bad" icon="military">{t('At war')}</Badge> : <small class="muted">{t('a standing order for if war comes')}</small>}>
      <p class="muted small">{t('Rounds are long: a war can run for decades before you plan again. A standing policy lets the government accept a white peace on its own — when both sides hold one and no region has changed hands between them for the longer of their two terms (at least {n} months), the war ends where the lines stand.', { n: ARMISTICE_MIN_MONTHS })}</p>
      <div class="war-policy" data-testid="war-policy">
        {curMonths !== null
          ? <p class="small"><Icon name="check" size={12} /> {t('We accept an armistice with {name} after {term} without ground changing hands.', { name: otherName, term: fmtMonths(Math.max(ARMISTICE_MIN_MONTHS, curMonths)) })}</p>
          : <p class="small"><Icon name="info" size={12} /> {t('No standing policy: a war with {name} ends only by a signed peace, conquest or subordination.', { name: otherName })}</p>}
        <div class="form-actions">
          <label class="inline-field"><span>{t('Accept after')}</span><NumInput value={months} min={ARMISTICE_MIN_MONTHS} max={1200} step={12} unit={t('months ({term})', { term: fmtMonths(months) })} label={t('Months without ground changing hands')} width={72} testid="war-policy-months" onChange={(v) => setMonths(Math.round(v))} /></label>
          <Btn small kind="primary" disabled={s.busy || (curMonths !== null && curMonths === months)} testid="war-policy-set" onClick={() => save(months)}>{curMonths !== null ? t('Change the policy') : t('Accept an armistice')}</Btn>
          {curMonths !== null ? <Btn small kind="ghost" disabled={s.busy} testid="war-policy-clear" onClick={() => save(null)}>{t('Withdraw it')}</Btn> : null}
        </div>
      </div>
      <ActionNote tag="war-policy" />
    </Section>
  );
}

function ClauseLines({ obs, clauses, summary, other }: { obs: Observation; clauses: Clause[]; summary: string[]; other: SeatId }) {
  const lines = summary.length ? summary.map((l) => tc(l)) : clauses.map((c) => describeClause(obs, c, other));
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
  const signWhy = !isOpen ? null : obs.phase === 'negotiate' && other ? envelopeBlock(obs, other, ch) : obs.phase === 'finished' ? t('The match has finished') : null;
  return (
    <div class={cx('card offer', 'offer-' + o.status, !mine && isOpen && 'is-incoming')} data-testid="offer-card" data-offer={o.id}>
      <div class="row-between">
        <span class="kicker">{mine ? t('Our proposal to {name}', { name: tc(civName(obs, o.to)) }) : t('Proposal from {name}', { name: tc(civName(obs, o.from)) })} · {fmtDate(o.created_month)}</span>
        <Badge tone={OFFER_TONE[o.status] ?? 'muted'}>{statusLabel(o.status, 'offer')}</Badge>
      </div>
      <ClauseLines obs={obs} clauses={o.clauses} summary={o.summary} other={otherSeat} />
      {o.text ? <p class="offer-text">{t('“{text}”', { text: authored(obs, o.from, o.text) })}</p> : null}
      {isOpen ? (
        <>
          <p class="muted small">{t('Binds nobody until the other party signs this exact version. Lapses after round {n}.', { n: o.expires_round })}</p>
          <div class="form-actions">
            {mine ? (
              <Btn small kind="ghost" disabled={s.busy} testid="offer-withdraw" onClick={() => void act({ kind: 'withdraw_offer', offer: o.id }, 'offer')}>{t('Withdraw')}</Btn>
            ) : (
              <>
                <Btn small kind="primary" icon="seal" why={signWhy} disabled={s.busy} testid="offer-sign" onClick={() => void act({ kind: 'sign_treaty', offer: o.id }, 'offer')}>{t('Sign')}</Btn>
                <Btn small kind="ghost" disabled={s.busy} testid="offer-decline" onClick={() => void act({ kind: 'decline_offer', offer: o.id }, 'offer')}>{t('Decline')}</Btn>
              </>
            )}
            {!mine && signWhy ? <Why>{signWhy}</Why> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Treaty({ obs, t: tr }: { obs: Observation; t: TreatyView }) {
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(false);
  const otherSeat = tr.parties[0] === obs.seat ? tr.parties[1] : tr.parties[0];
  const active = tr.status === 'active';
  // open-ended standing clauses (months 0) can be ended by notice at the close of next round, with nothing breached
  const openEnded = (tr.clauses as Clause[]).some((c) => (c.kind === 'goods' || c.kind === 'non_aggression' || c.kind === 'defensive_pact') && c.months === 0);
  const clauses = tr.clauses as Clause[];
  return (
    <div class={cx('card treaty', 'treaty-' + tr.status)} data-testid="treaty-card">
      <div class="row-between">
        <span class="kicker"><SeatDot color={civColor(obs, otherSeat)} /> {t('With {name}', { name: tc(civName(obs, otherSeat)) })} · {t('signed {date}', { date: fmtDate(tr.signed_month) })}{tr.ends_month !== null ? ` · ${t('ends {date}', { date: fmtDate(tr.ends_month) })}` : ''}</span>
        <Badge tone={active ? 'ok' : tr.status === 'broken' ? 'bad' : 'muted'} icon={active ? 'seal' : undefined}>{statusLabel(tr.status, 'treaty')}</Badge>
      </div>
      <ClauseLines obs={obs} clauses={tr.clauses} summary={tr.summary} other={otherSeat} />
      {openEnded ? <p class="muted small" data-testid="treaty-open-ended"><Icon name="clock" size={11} /> {t('Some clauses run until notice: either party may end them at the close of the next round without breaching the treaty.')}</p> : null}
      {(tr.secondments ?? []).map((sv) => {
        const c = clauses[sv.clause];
        return c && c.kind === 'secondment' ? (
          <p class="small coop-line" data-testid="treaty-secondment"><Icon name="people" size={11} /> {t('Secondment: {sent} sent, {owed} still away, {returned} home, {lost} stayed behind; due home {date}', { sent: int(sv.sent), owed: int(sv.owed), returned: int(sv.returned), lost: int(sv.lost), date: fmtDate(sv.due_month) })}</p>
        ) : null;
      })}
      {(tr.programmes ?? []).map((pv) => {
        const c = clauses[pv.clause];
        return c && c.kind === 'joint_programme' ? (
          <p class="small coop-line" data-testid="treaty-programme"><Icon name="rocket" size={11} /> {pv.served ? t('{service}: serving this month', { service: t(SERVICE_LABEL[c.service]) }) : t('{service}: not serving this month', { service: t(SERVICE_LABEL[c.service]) })}{pv.shortfalls ? ` · ${t('{n} months below half rate', { n: pv.shortfalls })}` : ''}</p>
        ) : null;
      })}
      {tr.performance.length ? (
        <Expander label={t('Performance record ({n})', { n: tr.performance.length })} open={tr.performance.length <= 3}>
          <ul class="plain-list performance">{tr.performance.map((p) => <li>{tc(p)}</li>)}</ul>
        </Expander>
      ) : <p class="muted small">{t('No deliveries or breaches recorded yet.')}</p>}
      {active ? (
        <div class="form-actions">
          {confirmNotice ? (
            <>
              <Btn small kind="primary" disabled={s.busy} testid="treaty-notice-confirm" onClick={() => { setConfirmNotice(false); void act({ kind: 'break_treaty', treaty: tr.id, notice: true }, 'treaty'); }}>{t('Give notice — the open-ended clauses end with the next round')}</Btn>
              <Btn small kind="ghost" onClick={() => setConfirmNotice(false)}>{t('Keep the treaty')}</Btn>
            </>
          ) : confirm ? (
            <>
              <Btn small kind="danger" disabled={s.busy} testid="treaty-break-confirm" onClick={() => { setConfirm(false); void act({ kind: 'break_treaty', treaty: tr.id }, 'treaty'); }}>{t('Repudiate — the breach is recorded permanently')}</Btn>
              <Btn small kind="ghost" onClick={() => setConfirm(false)}>{t('Keep the treaty')}</Btn>
            </>
          ) : (
            <>
              {openEnded ? <Btn small kind="ghost" icon="clock" testid="treaty-notice" title={t('End the open-ended clauses at the close of the next round. Nothing is breached and trust is kept.')} onClick={() => setConfirmNotice(true)}>{t('Give notice…')}</Btn> : null}
              <Btn small kind="ghost" testid="treaty-break" onClick={() => setConfirm(true)}>{t('Repudiate…')}</Btn>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// --- treaty composer --------------------------------------------------------------

function defaultClause(kind: ClauseKind, obs: Observation, other: ForeignCiv): Clause {
  const [lo] = termBounds(obs, kind);
  switch (kind) {
    case 'goods': return { kind, from: obs.seat, good: 'food', amount_per_month: 50_000, months: 1 };
    case 'knowledge': return { kind, from: obs.seat, tech: '' };
    case 'practice': return { kind, from: obs.seat, practice: '' };
    case 'maps': return { kind, from: obs.seat };
    case 'non_aggression': return { kind, months: Math.max(60, lo) };
    case 'defensive_pact': return { kind, months: Math.max(60, lo) };
    case 'peace': return { kind };
    case 'subordination': return { kind, from: other.seat, tribute_bp: 1000 };
    case 'cede_region': return { kind, from: obs.seat, region: obs.regions.find((r) => r.own && r.id !== obs.civ.capital)?.id ?? obs.civ.capital };
    case 'secondment': return { kind, from: obs.seat, qual: (obs.civ.quals.find((q) => q.count >= 1000)?.qual ?? 'scholar') as Qual, count: 1000, months: lo };
    case 'joint_programme': return { kind, host: obs.seat, service: 'launch', months: lo };
  }
}

/** Why a clause term is out of bounds this round, or null. Single deliveries (1) and open-ended terms (0) are allowed where the clause allows them. */
function termProblem(obs: Observation, kind: ClauseKind, months: number): string | null {
  const [lo, hi] = termBounds(obs, kind);
  if (months === 0 && OPEN_ENDED.includes(kind)) return null;
  if (kind === 'goods' && months === 1) return null;
  return months < lo || months > hi ? t('This round a term is {lo} to {hi} months', { lo: int(lo), hi: int(hi) }) : null;
}

function clauseProblem(obs: Observation, other: ForeignCiv, c: Clause): string | null {
  switch (c.kind) {
    case 'goods': return c.amount_per_month <= 0 ? t('Enter an amount') : termProblem(obs, 'goods', c.months);
    case 'knowledge': return c.tech ? null : t('Choose a method');
    case 'practice': return c.practice ? null : t('Choose a practice');
    case 'non_aggression':
    case 'defensive_pact': return termProblem(obs, c.kind, c.months);
    case 'peace': return other.at_war ? null : t('The parties are not at war');
    case 'subordination': return c.tribute_bp > 5000 ? t('Tribute is at most 50%') : null;
    case 'secondment': return other.at_war ? t('Experts are not lent between parties at war') : c.count < SECONDMENT_PEOPLE[0] || c.count > SECONDMENT_PEOPLE[1] ? t('A secondment lends {lo} to {hi} people', { lo: int(SECONDMENT_PEOPLE[0]), hi: int(SECONDMENT_PEOPLE[1]) }) : termProblem(obs, c.kind, c.months);
    case 'joint_programme': return other.at_war ? t('Installations are not shared between parties at war') : c.service === 'undisclosed' ? t('Choose an installation') : termProblem(obs, c.kind, c.months);
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
  const why = block ?? (clauses.length === 0 ? t('Add at least one clause') : clauses.length > 8 ? t('A treaty has at most eight clauses') : problems.find(Boolean) ?? null);
  const otherName = tc(other.name);
  const submit = async () => {
    const rec = await act({ kind: 'propose_treaty', to: other.seat, clauses, text: text.trim() || null }, 'propose');
    if (rec.length && rec[0].status === 'accepted') { setClauses([]); setText(''); setOpen(false); }
  };
  const parties = [{ value: obs.seat, label: t('{name} (us)', { name: tc(obs.civ.name) }) }, { value: other.seat, label: otherName }];
  if (!open) {
    return (
      <div class="form-actions">
        <Btn small icon="plus" testid="compose-open" onClick={() => setOpen(true)}>{t('Draft a proposal')}</Btn>
        {block ? <Why>{block}</Why> : null}
      </div>
    );
  }
  return (
    <div class="card composer-card" data-testid="treaty-composer">
      <div class="row-between"><b class="detail-title">{t('Draft proposal to {name}', { name: otherName })}</b><Btn small kind="ghost" icon="close" title={t('Discard draft')} onClick={() => { setOpen(false); setClauses([]); }} /></div>
      <p class="muted small">{t('A proposal is one envelope. It binds nobody until {name} signs this exact version; it lapses after next round.', { name: otherName })}</p>
      {clauses.length === 0 ? <p class="empty">{t('No clauses yet.')}</p> : null}
      <ol class="clause-editor">
        {clauses.map((c, i) => (
          <li class={cx('clause', problems[i] && 'has-problem')} data-testid={`clause-${c.kind}`}>
            <div class="clause-head"><b>{t(CLAUSE_LABEL[c.kind])}</b><button type="button" class="linklike" aria-label={t('Remove clause')} onClick={() => setClauses(clauses.filter((_, j) => j !== i))}><Icon name="trash" size={13} /> {t('Remove')}</button></div>
            <ClauseFields obs={obs} other={other} c={c} parties={parties} onChange={(n) => update(i, n)} />
            <p class="clause-preview">{describeClause(obs, c, other.seat)}</p>
            {problems[i] ? <Why>{problems[i]}</Why> : null}
          </li>
        ))}
      </ol>
      <div class="add-clause">
        <Select value={adding} label={t('Clause kind')} testid="clause-kind" options={(Object.keys(CLAUSE_LABEL) as ClauseKind[]).map((k) => ({ value: k, label: t(CLAUSE_LABEL[k]) }))} onChange={(v) => setAdding(v)} />
        <Btn small icon="plus" why={clauses.length >= 8 ? t('A treaty has at most eight clauses') : null} testid="clause-add" onClick={() => setClauses([...clauses, defaultClause(adding, obs, other)])}>{t('Add clause')}</Btn>
      </div>
      <p class="muted small">{t(CLAUSE_HINT[adding])}</p>
      <label class="field"><span class="field-label">{t('Covering note (optional)')}</span>
        <textarea class="text" rows={2} maxLength={MAX_MESSAGE_CHARS} value={text} data-testid="proposal-text" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="form-actions">
        <Btn kind="primary" icon="seal" why={why} disabled={s.busy} testid="proposal-send" onClick={() => void submit()}>{t('Send proposal')}</Btn>
        {why ? <Why>{why}</Why> : null}
      </div>
      <ActionNote tag="propose" />
    </div>
  );
}

/** Facility kinds of the installations a joint programme can share (bts-engine facility_of_service). */
const SERVICE_FACILITY: Record<Exclude<ProgrammeService, 'undisclosed'>, string> = { launch: 'launch_complex', orbital_yard: 'orbital_yard', high_energy: 'high_energy' };

/**
 * A clause's term: within this round's bounds (at least one round, at most three, or the clause's
 * own bounds where wider), or open-ended until notice where the clause allows it, or (goods) once.
 */
function TermField({ obs, kind, months, onChange, once }: { obs: Observation; kind: ClauseKind; months: number; onChange: (m: number) => void; once?: boolean }) {
  const [lo, hi] = termBounds(obs, kind);
  const open = OPEN_ENDED.includes(kind);
  const mode = once && months === 1 ? 'once' : months === 0 && open ? 'open' : 'term';
  const step = lo >= 120 ? 12 : 6;
  return (
    <span class="term-field">
      <span class="segmented" role="radiogroup" aria-label={t('Term')}>
        {once ? <button type="button" role="radio" aria-checked={mode === 'once'} class={cx('seg', mode === 'once' && 'is-active')} onClick={() => onChange(1)}>{t('Once')}</button> : null}
        <button type="button" role="radio" aria-checked={mode === 'term'} class={cx('seg', mode === 'term' && 'is-active')} data-testid="clause-term-fixed" onClick={() => onChange(Math.min(hi, Math.max(lo, months > 1 ? months : lo)))}>{once ? t('Every month for a term') : t('For a term')}</button>
        {open ? <button type="button" role="radio" aria-checked={mode === 'open'} class={cx('seg', mode === 'open' && 'is-active')} data-testid="clause-term-open" onClick={() => onChange(0)}>{t('Until notice')}</button> : null}
      </span>
      {mode === 'term' ? <NumInput value={months} min={lo} max={hi} step={step} unit={t('months ({term})', { term: fmtMonths(months) })} label={t('Term in months')} width={72} testid="clause-months" onChange={(v) => onChange(Math.round(v))} /> : null}
      <small class="muted">{mode === 'open' ? t('Runs until either party gives notice; it then ends with the next round and nothing is breached.') : t('This round: {lo} to {hi} months ({length}).', { lo: int(lo), hi: int(hi), length: roundLength(obs.calendar?.round_months ?? obs.months_per_round) })}</small>
    </span>
  );
}

function ClauseFields({ obs, other, c, parties, onChange }: {
  obs: Observation; other: ForeignCiv; c: Clause; parties: { value: SeatId; label: string }[]; onChange: (c: Clause) => void;
}) {
  const fromSel = (from: SeatId, set: (s: SeatId) => void, label = t('Performed by')) => (
    <label class="inline-field"><span>{label}</span><Select value={from} options={parties} onChange={set} label={label} /></label>
  );
  switch (c.kind) {
    case 'goods':
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from }), t('Delivered by'))}
          <label class="inline-field"><span>{t('Good')}</span><Select<Good> value={c.good} options={GOODS.map((g) => ({ value: g, label: t(GOOD_LABEL[g]) }))} onChange={(good) => onChange({ ...c, good })} label={t('Good')} /></label>
          <label class="inline-field"><span>{t('Amount')}</span><NumInput value={c.amount_per_month / 1000} min={1} max={1_000_000} unit={c.months !== 1 ? t('{unit} / month', { unit: displayUnit(c.good) }) : displayUnit(c.good)} width={96} label={t('Amount')} onChange={(v) => onChange({ ...c, amount_per_month: Math.round(v * 1000) })} testid="clause-amount" /></label>
          <div class="inline-field wide"><span>{t('Term')}</span><TermField obs={obs} kind="goods" once months={c.months} onChange={(months) => onChange({ ...c, months })} /></div>
        </div>
      );
    case 'knowledge': {
      // Only handles from our own observation may be named. We can give what we
      // understand; we can ask for what we have heard of but not yet understood.
      const mine = c.from === obs.seat;
      const list = obs.knowledge.techs.filter((x) => (mine ? ['understood', 'prototyped', 'adopted'].includes(x.state) : !['understood', 'prototyped', 'adopted'].includes(x.state)));
      const leads = mine ? [] : obs.knowledge.leads.filter((l) => !list.some((x) => x.handle === l.handle));
      const options = [{ value: '', label: list.length + leads.length ? t('Choose a method…') : mine ? t('Nothing understood yet') : t('No known method we lack') }, ...list.map((x) => ({ value: x.handle, label: tc(x.name) })), ...leads.map((l) => ({ value: l.handle, label: t('Lead: {title}', { title: tc(l.title) }) }))];
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from, tech: '' }), t('Handed over by'))}
          <label class="inline-field wide"><span>{t('Method')}</span><Select value={c.tech} options={options} onChange={(tech) => onChange({ ...c, tech })} label={t('Method')} testid="clause-tech" /></label>
          {!mine ? <small class="muted">{t('You can only ask for methods your own records already name.')}</small> : null}
        </div>
      );
    }
    case 'practice': {
      const mine = c.from === obs.seat;
      const list = obs.culture.practices.filter((p) => (mine ? p.state === 'enacted' || p.state === 'established' : p.state === 'recognized' || p.state === 'reforming'));
      const options = [{ value: '', label: list.length ? t('Choose a practice…') : mine ? t('No enacted practice') : t('No recognised practice we lack') }, ...list.map((p) => ({ value: p.handle, label: tc(p.name) }))];
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from, practice: '' }), t('Described by'))}
          <label class="inline-field wide"><span>{t('Practice')}</span><Select value={c.practice} options={options} onChange={(practice) => onChange({ ...c, practice })} label={t('Practice')} /></label>
          {!mine ? <small class="muted">{t('You can only ask about practices your own records already name.')}</small> : null}
        </div>
      );
    }
    case 'maps':
      return <div class="clause-fields">{fromSel(c.from, (from) => onChange({ ...c, from }), t('Shared by'))}</div>;
    case 'non_aggression':
    case 'defensive_pact':
      return (
        <div class="clause-fields">
          <div class="inline-field wide"><span>{t('Term')}</span><TermField obs={obs} kind={c.kind} months={c.months} onChange={(months) => onChange({ ...c, months })} /></div>
        </div>
      );
    case 'secondment': {
      // we can name only our own counts; what the other side can spare is checked when it signs
      const mine = c.from === obs.seat;
      const quals = (Object.keys(QUAL_LABEL) as Qual[]).filter((q) => q !== 'literate');
      const have = (q: Qual) => obs.civ.quals.find((x) => x.qual === q);
      const options = quals.map((q) => ({ value: q, label: mine && have(q) ? `${t(QUAL_LABEL[q])} (${int(have(q)!.count)})` : t(QUAL_LABEL[q]) }));
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from }), t('Lent by'))}
          <label class="inline-field"><span>{t('Qualification')}</span><Select<Qual> value={c.qual} options={options} onChange={(qual) => onChange({ ...c, qual })} label={t('Qualification')} testid="clause-qual" /></label>
          <label class="inline-field"><span>{t('People')}</span><NumInput value={c.count} min={SECONDMENT_PEOPLE[0]} max={SECONDMENT_PEOPLE[1]} step={100} label={t('People')} width={88} testid="clause-count" onChange={(v) => onChange({ ...c, count: Math.round(v) })} /></label>
          <div class="inline-field wide"><span>{t('Term')}</span><TermField obs={obs} kind="secondment" months={c.months} onChange={(months) => onChange({ ...c, months })} /></div>
          <small class="muted">{mine ? t('At most half of our holders who are not teaching may be lent. They come home at the end of the term; if the borrower repudiates or goes to war, a quarter stay behind.') : t('Ask for experts; {name} checks what it can spare when it signs. Offer goods in return.', { name: tc(other.name) })}</small>
        </div>
      );
    }
    case 'joint_programme': {
      const known = (Object.keys(SERVICE_FACILITY) as Exclude<ProgrammeService, 'undisclosed'>[]).filter((k) => obs.catalog.facilities.some((f) => f.kind === SERVICE_FACILITY[k]));
      const options = known.length ? known.map((k) => ({ value: k as ProgrammeService, label: t(SERVICE_LABEL[k]) })) : [{ value: 'undisclosed' as ProgrammeService, label: t('No shareable installation is known to us') }];
      const value = known.includes(c.service as Exclude<ProgrammeService, 'undisclosed'>) ? c.service : options[0].value;
      if (value !== c.service) queueMicrotask(() => onChange({ ...c, service: value }));
      return (
        <div class="clause-fields">
          {fromSel(c.host, (host) => onChange({ ...c, host }), t('Host'))}
          <label class="inline-field wide"><span>{t('Installation')}</span><Select<ProgrammeService> value={value} options={options} onChange={(service) => onChange({ ...c, service })} label={t('Installation')} testid="clause-service" /></label>
          <div class="inline-field wide"><span>{t('Term')}</span><TermField obs={obs} kind="joint_programme" months={c.months} onChange={(months) => onChange({ ...c, months })} /></div>
          <small class="muted">{t('Serves the partner in every month after the installation ran at half rate or better; each partner raises its inputs, upkeep and power by half. One installation serves at most two partners.')}</small>
        </div>
      );
    }
    case 'peace':
      return <div class="clause-fields"><small class="muted">{t('Ends the war between {a} and {b}.', { a: tc(obs.civ.name), b: tc(other.name) })}</small></div>;
    case 'subordination':
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from }), t('Subordinate'))}
          <label class="inline-field"><span>{t('Tribute')}</span><NumInput value={c.tribute_bp / 100} min={0} max={50} unit={t('% of output')} label={t('Tribute')} width={64} onChange={(v) => onChange({ ...c, tribute_bp: Math.round(v * 100) })} /></label>
        </div>
      );
    case 'cede_region': {
      const mine = c.from === obs.seat;
      const list = obs.regions.filter((r) => (mine ? !!r.own && r.owner === obs.seat : r.owner === other.seat));
      const options = list.length ? list.map((r) => ({ value: r.id, label: r.name })) : [{ value: c.region, label: mine ? t('No region to cede') : t('No region of theirs is known') }];
      const value = list.some((r) => r.id === c.region) ? c.region : options[0].value;
      if (value !== c.region && list.length) queueMicrotask(() => onChange({ ...c, region: value }));
      return (
        <div class="clause-fields">
          {fromSel(c.from, (from) => onChange({ ...c, from }), t('Ceded by'))}
          <label class="inline-field wide"><span>{t('Region')}</span><Select value={value} options={options} onChange={(region) => onChange({ ...c, region })} label={t('Region')} /></label>
        </div>
      );
    }
  }
}
