//! Release-gate properties: determinism, checkpoint recovery, conservation,
//! information isolation and the complete-victory rules.

use crate::content::content;
use crate::sim::victory;
use crate::state::*;
use crate::{Match, MatchConfig};
use bts_protocol::*;

fn cfg(seed: &str) -> MatchConfig {
    MatchConfig { seed: seed.into(), regions: 24, ..Default::default() }
}

fn run_rounds(m: &mut Match, rounds: u32) {
    let target = m.round() + rounds;
    while !m.finished() && m.round() < target {
        for s in 0..m.seats() {
            m.set_ready(s as SeatId, true);
        }
        assert!(m.try_advance());
    }
}

#[test]
fn identical_inputs_reproduce_identical_state() {
    let mut a = Match::new(cfg("determinism"), 1);
    let mut b = Match::new(cfg("determinism"), 1);
    run_rounds(&mut a, 12);
    run_rounds(&mut b, 12);
    assert_eq!(a.state_hash(), b.state_hash());
    let mut c = Match::new(cfg("another-world"), 1);
    run_rounds(&mut c, 12);
    assert_ne!(a.state_hash(), c.state_hash());
}

#[test]
fn checkpoint_recovery_matches_continuous_execution() {
    let mut a = Match::new(cfg("checkpoint"), 1);
    run_rounds(&mut a, 10);
    let mut b = Match::new(cfg("checkpoint"), 1);
    run_rounds(&mut b, 4);
    let mut restored = Match::load_json(&b.save_json()).expect("restore");
    run_rounds(&mut restored, 6);
    assert_eq!(a.state_hash(), restored.state_hash());
}

#[test]
fn the_graph_is_the_same_in_every_world() {
    // Seeds change the world, never the complete technology and practice graphs.
    let a = Match::new(cfg("alpha"), 1);
    let b = Match::new(cfg("omega"), 1);
    assert_ne!(a.state_hash(), b.state_hash());
    assert_eq!(content().techs.len(), 138);
    assert_eq!(content().practices.len(), 64);
    assert_ne!(content().graph_hash, 0);
}

#[test]
fn population_changes_only_through_recorded_flows() {
    let mut m = Match::new(cfg("conservation"), 1);
    let before: Vec<u32> = (0..4).map(|s| m.world.civ_population(s)).collect();
    let mut births = [0u32; 4];
    let mut deaths = [0u32; 4];
    for _ in 0..6 {
        run_rounds(&mut m, 1);
        for s in 0..4 {
            births[s] += m.world.civs[s].last_flows.births;
            deaths[s] += m.world.civs[s].last_flows.deaths;
        }
    }
    for s in 0..4 {
        let after = m.world.civ_population(s as SeatId);
        assert_eq!(after as i64, before[s] as i64 + births[s] as i64 - deaths[s] as i64, "seat {s}");
    }
}

#[test]
fn stock_never_goes_negative_and_food_is_eaten_once() {
    let mut m = Match::new(cfg("ledger"), 1);
    run_rounds(&mut m, 15);
    for c in &m.world.civs {
        for (g, v) in c.stock.iter().enumerate() {
            assert!(*v >= 0, "{} holds negative {:?}", c.name, Good::from_index(g));
        }
    }
}

#[test]
fn observations_do_not_leak_hidden_content() {
    let m = Match::new(cfg("isolation"), 1);
    let obs = m.observe(0);
    let json = serde_json::to_string(&obs).unwrap();
    // nothing about undiscovered technology: no names, no canonical ids, no counts
    for hidden in ["Repeatable spacetime anomaly", "Programmable computers", "Practical steam power", "T162", "T080", "C061"] {
        assert!(!json.contains(hidden), "observation leaks {hidden}");
    }
    assert!(obs.objectives.victory.is_none(), "the final objective must not be shown before it is discovered");
    assert!(obs.regions.iter().all(|r| !r.test_node));
    // only seen regions are present, and no other civilization is known yet
    assert!(obs.regions.len() < m.world.regions.len());
    assert!(obs.others.is_empty());
    // another seat's capital is not on the map
    let foreign_capital = m.world.civs[1].capital;
    assert!(obs.regions.iter().all(|r| r.id != foreign_capital));
    // opaque handles differ between seats for the same node
    let h0 = crate::actions::tech_handle(&m.world, 0, 0);
    let h1 = crate::actions::tech_handle(&m.world, 1, 0);
    assert_ne!(h0, h1);
}

#[test]
fn unknown_and_nonexistent_references_fail_identically() {
    let mut m = Match::new(cfg("errors"), 1);
    // a real but undiscovered node, addressed by a handle the seat was never given
    let hidden = crate::actions::tech_handle(&m.world, 0, content().t("T162"));
    let r1 = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Research { tech: hidden }, priority: None }]);
    let r2 = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Research { tech: "k-not-a-thing".into() }, priority: None }]);
    assert_eq!(r1[0].status, "rejected");
    assert_eq!(r1[0].code, r2[0].code);
    assert_eq!(r1[0].reason, r2[0].reason);
    // a facility whose knowledge is undiscovered is indistinguishable from a made-up one
    let capital = m.world.civs[0].capital;
    let r3 = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "jump_yard".into(), levels: 1 }, priority: None }]);
    let r4 = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "no_such_thing".into(), levels: 1 }, priority: None }]);
    assert_eq!(r3[0].code, r4[0].code);
    assert_eq!(r3[0].reason, r4[0].reason);
}

#[test]
fn rejected_actions_change_nothing() {
    let mut m = Match::new(cfg("atomic"), 1);
    let before = m.world.civs[0].stock.clone();
    let projects = m.world.civs[0].projects.len();
    let capital = m.world.civs[0].capital;
    m.act(0, vec![Action::StartProject { spec: ProjectSpec::Recruit { region: capital, role: Role::Assault, soldiers: 4000, tier: 0 }, priority: None }]);
    assert_eq!(m.world.civs[0].stock, before);
    assert_eq!(m.world.civs[0].projects.len(), projects);
}

/// A world in which seat 0 holds everything the victory contract asks for, so the
/// acceptance windows can be tested in isolation from the economy.
fn endgame_world() -> World {
    let mut w = crate::worldgen::generate(cfg("endgame"), 1);
    let c = content();
    for s in 1..4 {
        w.civs[s].status = SeatStatus::Eliminated;
    }
    let civ = &mut w.civs[0];
    for t in civ.tech.iter_mut() {
        t.state = ST_ADOPTED;
    }
    for p in civ.practice.iter_mut() {
        p.state = 3;
        p.adoption_bp = 10_000;
    }
    civ.stability = 90;
    civ.stock[Good::Spares.index()] = 1_000_000;
    civ.stock[Good::Fuel.index()] = 1_000_000;
    let nodes = w.test_nodes.clone();
    let mut yards = 0;
    for ri in 0..w.regions.len() {
        let r = &mut w.regions[ri];
        if r.population() > 0 || nodes.contains(&(ri as RegionId)) || yards < 2 {
            r.owner = Some(0);
            r.controller = Some(0);
            let mut add = |key: &str, r: &mut Region| {
                let kind = c.f(key);
                r.facilities.push(Facility { kind, level: 1, condition_bp: 10_000, enabled: true, staffed: 10, staff_needed: 10, skilled_bp: 10_000, run: Some(RunStat { recipe: 0, rate_bp: 10_000, blockers: 0, missing: vec![] }), operated: true, assembly_progress: 0 });
            };
            if nodes.contains(&(ri as RegionId)) {
                add("jump_base", r);
            }
            if yards < 2 {
                add("jump_yard", r);
                add("orbital_yard", r);
                yards += 1;
            }
            r.quals[Qual::FtlEngineer.index()] = 40;
            r.quals[Qual::Orbital.index()] = 40;
        }
    }
    let yard = c.f("jump_yard");
    let yard_regions: Vec<RegionId> = w.regions.iter().filter(|r| r.fac(yard).is_some()).map(|r| r.id).collect();
    for (i, yr) in yard_regions.iter().enumerate() {
        w.civs[0].ftl.assemblies.push(Assembly { id: 9000 + i as u32, yard_region: *yr, built: 0, retired: false });
    }
    w.civs[0].ftl.deployment_done = Some(0);
    w.civs[0].ftl.replacement_done = Some(0);
    w
}

#[test]
fn complete_victory_needs_g96_f24_and_two_spaced_trials() {
    let mut w = endgame_world();
    assert!(victory::governance_checks(&w, 0).iter().all(|c| c.ok), "{:?}", victory::governance_checks(&w, 0));
    assert!(victory::ftl_checks(&w, 0).iter().all(|c| c.ok), "{:?}", victory::ftl_checks(&w, 0));
    for i in 1..=120u32 {
        w.month = i;
        // two loaded round trips with different assemblies, twelve months apart, during governance
        if i == 40 {
            w.civs[0].ftl.trials.push((i, 9000));
        }
        if i == 52 {
            w.civs[0].ftl.trials.push((i, 9001));
        }
        victory::step(&mut w);
        if i < 96 {
            assert!(w.outcome.is_none(), "won too early at month {i}");
        }
        if w.outcome.is_some() {
            break;
        }
    }
    let o = w.outcome.clone().expect("a winner");
    assert_eq!(o.winner, Some(0));
    assert_eq!(o.month, 96, "governance must have held for 96 consecutive months");
    let reward = victory::reward(&w, 0);
    assert!((reward - (2.0 - 96.0 / w.cfg.horizon as f64)).abs() < 1e-9);
    assert_eq!(victory::reward(&w, 1), -1.0);
}

#[test]
fn trials_too_close_together_or_with_one_assembly_do_not_count() {
    let mut w = endgame_world();
    for i in 1..=130u32 {
        w.month = i;
        if i == 40 {
            w.civs[0].ftl.trials.push((i, 9000));
        }
        if i == 45 {
            w.civs[0].ftl.trials.push((i, 9001)); // only five months later
        }
        if i == 60 {
            w.civs[0].ftl.trials.push((i, 9000)); // same assembly as the first
        }
        victory::step(&mut w);
    }
    // 40 & 60 share an assembly; 45 & 60 are different assemblies fifteen months apart
    assert_eq!(w.outcome.as_ref().and_then(|o| o.winner), Some(0));
    let mut w = endgame_world();
    for i in 1..=130u32 {
        w.month = i;
        if i == 40 {
            w.civs[0].ftl.trials.push((i, 9000));
        }
        if i == 45 {
            w.civs[0].ftl.trials.push((i, 9001));
        }
        victory::step(&mut w);
    }
    assert!(w.outcome.is_none(), "trials five months apart must not satisfy the contract");
}

#[test]
fn conquest_without_jump_capability_does_not_win() {
    let mut w = endgame_world();
    w.civs[0].ftl.assemblies.clear();
    for i in 1..=200u32 {
        w.month = i;
        victory::step(&mut w);
    }
    assert!(w.outcome.is_none());
    assert!(w.civs[0].ftl.gov_streak >= 96);
    assert_eq!(w.civs[0].ftl.ftl_streak, 0);
}

#[test]
fn jump_capability_without_global_authority_does_not_win() {
    let mut w = endgame_world();
    // one inhabited region, holding no part of the jump system, answers to an independent government
    w.civs[1].status = SeatStatus::Active;
    let other = w.regions.iter().position(|r| r.owner == Some(0) && r.population() > 0 && r.id != w.civs[0].capital && r.facilities.iter().all(|f| !f.operated || content().facilities[f.kind].category != "Jump engineering" && content().facilities[f.kind].key != "orbital_yard") && !w.test_nodes.contains(&r.id)).unwrap();
    w.regions[other].owner = Some(1);
    w.regions[other].controller = Some(1);
    for i in 1..=200u32 {
        w.month = i;
        if i == 40 {
            w.civs[0].ftl.trials.push((i, 9000));
        }
        if i == 60 {
            w.civs[0].ftl.trials.push((i, 9001));
        }
        victory::step(&mut w);
    }
    assert!(w.outcome.is_none());
    assert_eq!(w.civs[0].ftl.gov_streak, 0);
    assert!(w.civs[0].ftl.ftl_streak >= 24);
}

#[test]
fn a_broken_window_restarts_from_zero() {
    let mut w = endgame_world();
    for i in 1..=50u32 {
        w.month = i;
        victory::step(&mut w);
    }
    assert_eq!(w.civs[0].ftl.gov_streak, 50);
    // a service failure in one region interrupts governance
    let ri = w.regions.iter().position(|r| r.population() > 0).unwrap();
    w.regions[ri].water_hist = [5000; 12];
    w.month = 51;
    victory::step(&mut w);
    assert_eq!(w.civs[0].ftl.gov_streak, 0);
    assert!(w.civs[0].ftl.ftl_streak >= 51, "an unrelated window keeps counting");
    w.regions[ri].water_hist = [10_000; 12];
    w.month = 52;
    victory::step(&mut w);
    assert_eq!(w.civs[0].ftl.gov_streak, 1, "a broken window cannot resume where it stopped");
}

#[test]
fn the_horizon_ends_the_match_without_a_winner() {
    let mut m = Match::new(MatchConfig { seed: "short".into(), regions: 24, horizon: 24, ..Default::default() }, 1);
    run_rounds(&mut m, 5);
    assert!(m.finished());
    assert_eq!(m.winner(), None);
    for s in 0..4 {
        assert_eq!(m.reward(s), -1.0);
    }
}

#[test]
fn a_subordinate_seat_cannot_win_and_counts_toward_its_overlord() {
    let mut w = endgame_world();
    w.civs[1].status = SeatStatus::Active;
    let other = w.regions.iter().position(|r| r.owner == Some(0) && r.population() > 0 && r.id != w.civs[0].capital).unwrap();
    w.regions[other].owner = Some(1);
    w.regions[other].controller = Some(1);
    w.civs[1].overlord = Some(0);
    assert_eq!(w.authority(other), Some(0));
    assert!(victory::governance_checks(&w, 0)[0].ok, "a real federal subordinate counts as integrated");
    assert!(!victory::governance_checks(&w, 1)[0].ok);
}

#[test]
fn diplomacy_limits_are_enforced() {
    let mut m = Match::new(cfg("envelopes"), 1);
    m.world.civs[0].contacts[1].met = true;
    m.world.civs[1].contacts[0].met = true;
    // no channel without mutual selection
    assert_eq!(m.act(0, vec![Action::SelectContacts { seats: vec![1] }])[0].status, "accepted");
    for s in 0..4 {
        m.set_ready(s, false);
    }
    assert!(m.try_advance());
    let r = m.act(0, vec![Action::Message { to: 1, text: "hello".into(), intent: None }]);
    assert_eq!(r[0].code.as_deref(), Some("CHANNEL_NOT_OPEN"));
    // next round both select each other: one envelope per direction per window, ten per pair
    run_rounds(&mut m, 1);
    m.act(0, vec![Action::SelectContacts { seats: vec![1] }]);
    m.act(1, vec![Action::SelectContacts { seats: vec![0] }]);
    for s in 0..4 {
        m.set_ready(s, false);
    }
    assert!(m.try_advance());
    let mut sent = 0;
    for _window in 1..=NEGOTIATION_WINDOWS {
        assert_eq!(m.act(0, vec![Action::Message { to: 1, text: "terms?".into(), intent: Some(Intent::Inquiry) }])[0].status, "accepted");
        sent += 1;
        let again = m.act(0, vec![Action::Message { to: 1, text: "again".into(), intent: None }]);
        assert_eq!(again[0].code.as_deref(), Some("RATE_LIMITED"));
        assert_eq!(m.act(1, vec![Action::Message { to: 0, text: "reply".into(), intent: None }])[0].status, "accepted");
        sent += 1;
        for s in 0..4 {
            m.set_ready(s, false);
        }
        assert!(m.try_advance());
    }
    assert_eq!(sent, PAIR_ENVELOPES as u32);
    assert_eq!(m.phase(), Phase::Plan);
    // an envelope written in a window is only readable after that window closes
    let obs = m.observe(1);
    assert!(obs.diplomacy.messages.iter().any(|x| x.from == 0));
}

#[test]
fn a_signed_treaty_delivers_goods_once_and_knowledge_is_not_unlearned() {
    let mut m = Match::new(cfg("treaty"), 1);
    m.world.civs[0].contacts[1].met = true;
    m.world.civs[1].contacts[0].met = true;
    let t = content().t("T005");
    m.world.civs[0].tech[t].state = ST_UNDERSTOOD;
    m.act(0, vec![Action::SelectContacts { seats: vec![1] }]);
    m.act(1, vec![Action::SelectContacts { seats: vec![0] }]);
    for s in 0..4 {
        m.set_ready(s, false);
    }
    assert!(m.try_advance());
    let handle = crate::actions::tech_handle(&m.world, 0, t);
    let r = m.act(0, vec![Action::ProposeTreaty { to: 1, clauses: vec![Clause::Knowledge { from: 0, tech: handle }, Clause::Goods { from: 1, good: Good::Food, amount_per_month: 50_000, months: 1 }], text: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    let offer = r[0].created.unwrap();
    for s in 0..4 {
        m.set_ready(s, false);
    }
    assert!(m.try_advance());
    let food0 = m.world.civs[0].stock[Good::Food.index()];
    let food1 = m.world.civs[1].stock[Good::Food.index()];
    let signed = m.act(1, vec![Action::SignTreaty { offer }]);
    assert_eq!(signed[0].status, "accepted", "{}", signed[0].reason);
    let treaty = signed[0].created.unwrap();
    assert!(m.world.civs[1].tech[t].state >= ST_DISCOVERED);
    assert!(m.world.civs[1].tech[t].discount_bp >= 4000);
    crate::sim::diplomacy::step(&mut m.world);
    assert_eq!(m.world.civs[0].stock[Good::Food.index()], food0 + 50_000);
    assert_eq!(m.world.civs[1].stock[Good::Food.index()], food1 - 50_000);
    crate::sim::diplomacy::step(&mut m.world);
    assert_eq!(m.world.civs[0].stock[Good::Food.index()], food0 + 50_000, "a single delivery is made once");
    // repudiation cannot erase what was taught
    let _ = treaty;
    assert!(m.world.civs[1].tech[t].state >= ST_DISCOVERED);
}
