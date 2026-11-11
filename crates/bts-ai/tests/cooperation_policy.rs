//! What the native policy does with secondments and joint programmes
//! (design chapter 35, slice E).
//!
//! The policy sees an observation and nothing else. These tests take a real
//! observation from the negotiation phase of an all-native match, put an offer or
//! a shortfall of the jump programme's base into it, and check the answer: it weighs
//! incoming clauses on its own facts, and what it proposes is accepted by the
//! referee as it stands.

use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;

/// The first moment, in an all-native match, at which seat 0 is in the first
/// negotiation window with an open channel to a seat it is at peace with.
fn negotiating() -> (Match, Observation, NativeAi, SeatId) {
    let controllers = vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
    let mut m = Match::new(MatchConfig { seed: "riverland".into(), controllers, ..Default::default() }, 7);
    let mut ais: Vec<NativeAi> = (0..m.seats()).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), 0x5EED_0000 + s as u64 * 7919)).collect();
    while !m.finished() && m.round() < 400 {
        if m.phase() == Phase::Negotiate && m.window() == 1 {
            let obs = m.observe(0);
            let peer = obs.diplomacy.channels.iter().find(|c| c.open && !c.sent_this_window && c.envelopes_used < c.envelopes_limit && !obs.diplomacy.wars.contains(&c.seat)).map(|c| c.seat);
            if let Some(s) = peer {
                if obs.others.iter().any(|o| o.seat == s && o.trust >= 40) {
                    return (m, obs, ais[0].clone(), s);
                }
            }
        }
        for seat in m.waiting_on() {
            let obs = m.observe(seat);
            let actions = ais[seat as usize].decide(&obs);
            for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
                m.act(seat, chunk.to_vec());
            }
            m.set_ready(seat, false);
        }
        assert!(m.try_advance());
    }
    panic!("seat 0 never negotiated with a seat it trusts");
}

fn offer(obs: &Observation, from: SeatId, clauses: Vec<Clause>) -> OfferView {
    OfferView { id: 999_001, from, to: obs.seat, summary: vec![String::new(); clauses.len()], clauses, text: String::new(), created_month: obs.month, expires_round: obs.round + 1, status: "open".into() }
}

/// Whether the controller signs (Some(true)) or declines (Some(false)) the offer.
fn answer(obs: &Observation, ai: &NativeAi, o: OfferView) -> Option<bool> {
    let mut obs = obs.clone();
    obs.diplomacy.offers = vec![o];
    let mut ai = ai.clone();
    ai.decide(&obs).iter().find_map(|a| match a {
        Action::SignTreaty { offer: 999_001 } => Some(true),
        Action::DeclineOffer { offer: 999_001 } => Some(false),
        _ => None,
    })
}

#[test]
fn incoming_cooperation_is_weighed_on_the_seats_own_facts() {
    let (_m, obs, ai, s) = negotiating();
    let me = obs.seat;
    let gift = |amount: i64| Clause::Goods { from: s, good: Good::Food, amount_per_month: amount, months: 1 };
    // a service it cannot read is never signed, whatever is offered with it
    assert_eq!(answer(&obs, &ai, offer(&obs, s, vec![Clause::JointProgramme { host: s, service: ProgrammeService::Undisclosed, months: 24 }, gift(5_000_000)])), Some(false));
    // it does not lend people it does not have, nor more than half of them
    let have = obs.civ.quals.iter().map(|q| (q.qual, q.count)).max_by_key(|x| x.1).unwrap();
    assert_eq!(answer(&obs, &ai, offer(&obs, s, vec![Clause::Secondment { from: me, qual: have.0, count: have.1, months: 24 }, gift(5_000_000)])), Some(false));
    // it does not promise an installation it does not run
    assert_eq!(answer(&obs, &ai, offer(&obs, s, vec![Clause::JointProgramme { host: me, service: ProgrammeService::Launch, months: 24 }, gift(5_000_000)])), Some(false));
    // experts lent to it at no cost are welcome
    assert_eq!(answer(&obs, &ai, offer(&obs, s, vec![Clause::Secondment { from: s, qual: Qual::Builder, count: 2_000, months: 12 }, gift(100_000)])), Some(true));
}

#[test]
fn a_programme_short_of_crews_asks_a_partner_with_terms_the_referee_accepts() {
    let (mut m, mut obs, mut ai, s) = negotiating();
    // the jump programme is in view and its educational base falls short
    let mut yard = obs.catalog.facilities[0].clone();
    yard.kind = "jump_yard".into();
    obs.catalog.facilities.push(yard);
    obs.objectives.victory = Some(VictoryView {
        governance_months: 0,
        governance_needed: 96,
        ftl_months: 0,
        ftl_needed: 24,
        trials: vec![],
        governance_checks: vec![],
        ftl_checks: vec![Check { label: "Educational base: qualified crews for every post, with reliefs".into(), detail: String::new(), ok: false, category: "educational".into() }],
        test_nodes: vec![],
        summary: String::new(),
        assemblies_operational: 0,
        deployment_done: false,
        replacement_done: false,
    });
    for o in obs.others.iter_mut() {
        o.trust = o.trust.max(60);
    }
    for g in obs.civ.goods.iter_mut() {
        g.stock = g.stock.max(5_000_000);
    }
    ai.memory.last_offer_round = vec![0; m.seats()];
    // asks are spaced by rounds; with fifty-year rounds the first talks come early
    obs.round = obs.round.max(10);
    let actions = ai.decide(&obs);
    let asks: Vec<Action> = actions.into_iter().filter(|a| matches!(a, Action::ProposeTreaty { clauses, .. } if clauses.iter().any(|c| matches!(c, Clause::Secondment { .. })))).collect();
    assert!(!asks.is_empty(), "the controller asked nobody for crews");
    for a in &asks {
        let Action::ProposeTreaty { to, clauses, .. } = a else { unreachable!() };
        // it asks the other party to lend, and pays with goods of its own
        assert!(clauses.iter().any(|c| matches!(c, Clause::Secondment { from, qual: Qual::FtlEngineer | Qual::Orbital, .. } if from == to)));
        assert!(clauses.iter().any(|c| matches!(c, Clause::Goods { from, .. } if *from == obs.seat)));
    }
    let receipts = m.act(obs.seat, asks.into_iter().take(1).collect());
    assert_eq!(receipts[0].status, "accepted", "{}", receipts[0].reason);
    let _ = s;
}

/// How often native seats agree to cooperation clauses over whole campaigns.
/// `cargo test -p bts-ai --release --test cooperation_policy -- --ignored --nocapture`
#[test]
#[ignore]
fn cooperation_survey() {
    let mut handles = Vec::new();
    for i in 0..8 {
        handles.push(std::thread::spawn(move || {
            let controllers = vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
            let mut m = Match::new(MatchConfig { seed: format!("eval-{i}"), controllers, ..Default::default() }, 7);
            let mut ais: Vec<NativeAi> = (0..m.seats()).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), 0x5EED_0000 + s as u64 * 7919)).collect();
            let (mut asked, mut accepted) = (0, 0);
            while !m.finished() && m.round() < 240 {
                for seat in m.waiting_on() {
                    let obs = m.observe(seat);
                    let actions = ais[seat as usize].decide(&obs);
                    for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
                        let coop = |a: &Action| matches!(a, Action::ProposeTreaty { clauses, .. } if clauses.iter().any(|c| matches!(c, Clause::Secondment { .. } | Clause::JointProgramme { .. })));
                        let n = chunk.iter().filter(|a| coop(a)).count();
                        let r = m.act(seat, chunk.to_vec());
                        asked += n;
                        accepted += chunk.iter().zip(r.iter()).filter(|(a, r)| coop(a) && r.status == "accepted").count();
                    }
                    m.set_ready(seat, false);
                }
                assert!(m.try_advance());
            }
            let obs = (0..4).map(|s| m.observe(s)).collect::<Vec<_>>();
            let mut ids = std::collections::HashSet::new();
            let (mut sec, mut prog) = (0, 0);
            for o in &obs {
                for t in &o.diplomacy.treaties {
                    if ids.insert(t.id) {
                        sec += t.secondments.len();
                        prog += t.programmes.len();
                    }
                }
            }
            (i, asked, accepted, sec, prog)
        }));
    }
    for h in handles {
        let (i, asked, accepted, sec, prog) = h.join().unwrap();
        println!("eval-{i}: cooperation proposals {asked} (accepted by the referee {accepted}); signed secondments {sec}, joint programmes {prog}");
        assert_eq!(asked, accepted, "a native seat proposed a clause the referee refused");
    }
}
