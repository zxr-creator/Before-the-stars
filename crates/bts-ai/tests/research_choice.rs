//! How the native policy chooses what to investigate and reform (design chapter
//! 39, sections 3.2-3.5). The policy sees an observation and nothing else, so these
//! fixtures take a real observation out of an all-native match and change what it
//! reports: which cards are investigable, which rival of a family is in view.

use bts_ai::tables::tables;
use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;

/// The hard seat's observation in an early plan phase, with the controller.
fn early_plan(rounds: u32) -> (Observation, NativeAi) {
    let controllers = vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
    let mut m = Match::new(MatchConfig { seed: "research-choice".into(), controllers, ..Default::default() }, 7);
    let mut ais: Vec<NativeAi> = (0..m.seats()).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), 0x5EED + s as u64)).collect();
    while m.round() < rounds {
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
    while m.phase() != Phase::Plan {
        for seat in m.waiting_on() {
            m.set_ready(seat, false);
        }
        assert!(m.try_advance());
    }
    (m.observe(0), ais[0].clone())
}

/// A discovered, investigable card with the given public name.
fn card(name: &str, handle: &str, work: i64) -> TechCard {
    TechCard {
        handle: handle.into(),
        name: name.into(),
        field: String::new(),
        label: "established".into(),
        state: KnowledgeState::Discovered,
        capability: String::new(),
        requirements: String::new(),
        known_requirements: vec![],
        unknown_requirements: false,
        class: ResearchClass::Craft,
        work_needed: work,
        work_done: 0,
        source: String::new(),
        discovered_month: 0,
        understood_month: None,
        can_investigate: true,
        enables: vec![],
        links: vec![],
        kind: String::new(),
        family_view: None,
        fragile_risk: None,
    }
}

fn name_of(id: &str) -> String {
    tables().techs.iter().find(|(_, i)| i.id == id).map(|(n, _)| n.clone()).unwrap()
}

/// The research the policy starts, by card handle, in order.
fn started(actions: &[Action]) -> Vec<String> {
    actions.iter().filter_map(|a| if let Action::StartProject { spec: ProjectSpec::Research { tech }, .. } = a { Some(tech.clone()) } else { None }).collect()
}

/// A fixture: only the given cards are investigable, nothing is running, the
/// research staff exists in every class, and the seat has `lines` lines.
fn fixture(obs: &mut Observation, cards: Vec<TechCard>, lines: u32) {
    obs.knowledge.techs.retain(|t| t.state >= KnowledgeState::Understood);
    obs.knowledge.techs.extend(cards);
    obs.knowledge.leads.clear();
    obs.knowledge.investigation_lines = lines;
    obs.projects.retain(|p| p.kind != "research");
    for r in obs.civ.research.iter_mut() {
        r.capacity = r.capacity.max(10_000);
    }
}

/// `critical_first`: with a critical card investigable and one line, Hard starts
/// the critical card even when a side card is cheaper.
#[test]
fn hard_starts_the_critical_card_first() {
    let (mut obs, mut ai) = early_plan(6);
    let crit = card(&name_of("T025"), "k-crit", 300_000);
    let side = card(&name_of("T183"), "k-side", 50_000);
    fixture(&mut obs, vec![side, crit], 1);
    let s = started(&ai.decide(&obs));
    assert_eq!(s.first().map(|h| h.as_str()), Some("k-crit"), "{s:?}");
    // the naive Easy baseline takes the cheapest
    let mut easy = NativeAi::new(Difficulty::Easy, 1);
    easy.memory = ai.memory.clone();
    let s = started(&easy.decide(&obs));
    assert_eq!(s.first().map(|h| h.as_str()), Some("k-side"), "{s:?}");
}

/// `family_choice` and the self-block rule: with a rival of a family visible and
/// something waiting on it, Hard does not adopt the other member first, even
/// though it is cheaper (symbolic expert systems against statistical learning).
#[test]
fn hard_does_not_lock_out_a_rival_it_needs() {
    let (mut obs, mut ai) = early_plan(6);
    let expert = card(&name_of("T243"), "k-expert", 10_000);
    let mut statistical = card(&name_of("T116"), "k-stat", 400_000);
    statistical.can_investigate = false;
    // a known requirement waits on statistical learning ("planned")
    let mut waiting = card(&name_of("T175"), "k-deep", 900_000);
    waiting.can_investigate = false;
    waiting.state = KnowledgeState::Discovered;
    waiting.known_requirements = vec![KnownRequirement { text: "statistical learning".into(), satisfied: false, handle: Some("k-stat".into()) }];
    fixture(&mut obs, vec![expert, statistical, waiting], 3);
    let s = started(&ai.decide(&obs));
    assert!(!s.contains(&"k-expert".to_string()), "{s:?}");
}

/// The budget split: with several lines and both kinds of card, at least 60% of
/// Hard's new lines go to critical cards.
#[test]
fn hard_gives_most_lines_to_the_critical_set() {
    let (mut obs, mut ai) = early_plan(6);
    let mut cards = Vec::new();
    for (i, id) in ["T025", "T026", "T024", "T021", "T029"].iter().enumerate() {
        cards.push(card(&name_of(id), &format!("k-c{i}"), 300_000));
    }
    for (i, id) in ["T183", "T184", "T185", "T186", "T187"].iter().enumerate() {
        cards.push(card(&name_of(id), &format!("k-s{i}"), 20_000));
    }
    fixture(&mut obs, cards, 5);
    let s = started(&ai.decide(&obs));
    let crit = s.iter().filter(|h| h.starts_with("k-c")).count();
    assert!(s.len() == 5 && crit >= 3, "{s:?}");
}

/// Determinism: identical observations give identical actions.
#[test]
fn identical_observations_give_identical_actions() {
    let (obs, ai) = early_plan(4);
    let (mut a, mut b) = (ai.clone(), ai);
    assert_eq!(serde_json::to_string(&a.decide(&obs)).unwrap(), serde_json::to_string(&b.decide(&obs)).unwrap());
}

/// The Expert test policy (section 8.3) plays a match from its own observations
/// alone: the controller is built from a seat's `Observation` and nothing else (the
/// type admits nothing else), and its seat keeps up with the Hard seats.
#[test]
fn expert_policy_plays_from_observations() {
    let controllers = vec![ControllerKind::NativeExpert, ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
    let mut m = Match::new(MatchConfig { seed: "expert".into(), controllers, ..Default::default() }, 7);
    let mut ais: Vec<NativeAi> = (0..m.seats()).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), 0xE0 + s as u64)).collect();
    assert_eq!(ais[0].difficulty, Difficulty::Expert);
    while m.round() < 40 {
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
    let o = m.observe(0);
    assert!(o.knowledge.techs.iter().filter(|t| t.state >= KnowledgeState::Understood).count() >= 10);
}
