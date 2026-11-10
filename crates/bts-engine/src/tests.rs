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
    // far more soldiers than a people of a quarter of a million would supply
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Recruit { region: capital, role: Role::Assault, soldiers: 4_000_000, tier: 0 }, priority: None }]);
    assert_eq!(r[0].status, "rejected");
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
            let add = |key: &str, r: &mut Region| {
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
            r.quals[Qual::FtlEngineer.index()] = 40_000;
            r.quals[Qual::Orbital.index()] = 40_000;
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

#[test]
fn construction_quotes_reserve_every_queued_level_and_prevent_prototype_cancellation_discount() {
    let mut m = Match::new(cfg("construction-quotes"), 1);
    let region = m.world.civs[0].capital;
    let k = content().f("camp");
    m.world.regions[region as usize].forest = 30;
    m.world.regions[region as usize].facilities.retain(|f| f.kind != k);
    let quote = m.observe(0).regions.into_iter().find(|r| r.id == region).unwrap().own.unwrap().construction_sites.into_iter().find(|x| x.kind == "camp").unwrap();
    let build = || Action::StartProject { spec: ProjectSpec::Build { region, facility: "camp".into(), levels: 2 }, priority: Some(5) };
    let receipts = m.act(0, vec![build(), build()]);
    assert!(receipts.iter().all(|r| r.status == "accepted"));
    // Parallel unproven installations all pay the first-of-kind work. Cancelling
    // the first order cannot leave a discounted second prototype.
    assert_eq!(m.world.civs[0].projects[0].work_needed, m.world.civs[0].projects[1].work_needed);
    assert_eq!(m.world.civs[0].projects[0].work_needed, quote.work_per_level * 2);
    let obs = m.observe(0);
    let own = obs.regions.iter().find(|r| r.id == region).unwrap().own.as_ref().unwrap();
    assert_eq!(own.construction_sites.iter().find(|s| s.kind == "camp").unwrap().queued_levels, 4);
    assert_eq!(obs.projects.iter().filter(|p| p.target.as_deref() == Some("camp")).map(|p| p.levels.unwrap()).sum::<u16>(), 4);
}

#[test]
fn industrial_scale_reduces_general_posts_but_does_not_multiply_goods() {
    let mut m = Match::new(cfg("industrial-scale"), 1);
    let region = m.world.civs[0].capital as usize;
    let k = content().f("camp");
    for r in m.world.regions.iter_mut().filter(|r| r.controller == Some(0)) { r.facilities.clear(); }
    let r = &mut m.world.regions[region];
    r.facilities.clear();
    r.blocks[0].ages[30] += 1_000_000;
    r.facilities.push(Facility { kind: k, level: 10, condition_bp: 10_000, enabled: true, staffed: 0, staff_needed: 0, skilled_bp: 10_000, run: None, operated: false, assembly_progress: 0 });
    m.world.civs[0].stock[Good::Tools.index()] = 1_000_000;
    m.world.civs[0].stock[Good::Materials.index()] = 0;
    m.world.civs[0].stock[Good::Food.index()] = 1_000_000;
    crate::sim::economy::step(&mut m.world, 0);
    let f = m.world.regions[region].fac(k).unwrap();
    assert!(f.staff_needed < 80_000); // ten camps of eight thousand posts share support
    assert!(f.staff_needed >= 64_000, "shared support never saves more than a fifth of general posts");
    let run = f.run.as_ref().unwrap();
    assert!(run.rate_bp <= 10_000);
    // Ten levels still have ten levels of physical output, not a throughput bonus.
    // idle adults make 0.3 t of building material each at home
    let household = m.world.civs[0].labor.household as i64 * 300 / 1000;
    let output = m.world.civs[0].stock[Good::Materials.index()];
    assert!(output - household <= 160_000);
    let view = m.observe(0);
    let fac = view.regions.iter().find(|r| r.id as usize == region).unwrap().own.as_ref().unwrap().facilities.iter().find(|f| f.kind == "camp").unwrap();
    assert!(fac.scale_saving_bp > 0 && fac.scale_saving_bp <= 2000);
}

// ---------------------------------------------------------------------------
// Scale and units (ruleset 2.0; docs/units-and-scale.md)
// ---------------------------------------------------------------------------

#[test]
fn a_seat_starts_with_real_people_in_real_units() {
    use crate::worldgen::{HOME_WATER_MIN, START_ARTISANS, START_LOREKEEPERS, START_POP_MIN, START_POP_SPREAD};
    let m = Match::new(cfg("scale"), 1);
    for s in 0..4u8 {
        let pop = m.world.civ_population(s);
        assert!((START_POP_MIN..=START_POP_MIN + START_POP_SPREAD).contains(&pop), "seat {s} starts with {pop}");
        let home = &m.world.regions[m.world.civs[s as usize].capital as usize];
        assert_eq!(home.quals[Qual::Lorekeeper.index()], START_LOREKEEPERS);
        assert_eq!(home.quals[Qual::Artisan.index()], START_ARTISANS);
        assert!(home.water >= HOME_WATER_MIN);
        // the observation states people as people: nothing is multiplied on the way out
        let obs = m.observe(s);
        assert_eq!(obs.civ.population, pop);
        assert_eq!(obs.regions.iter().find(|r| r.id == home.id).unwrap().own.as_ref().unwrap().population, home.population());
    }
}

#[test]
fn every_person_eats_one_ration_a_month() {
    let mut m = Match::new(cfg("rations"), 1);
    // nobody works and nothing spoils into the account we check: only eating is left
    for r in m.world.regions.iter_mut() {
        r.wild = 0;
        r.facilities.clear();
    }
    let pop = m.world.civ_population(0) as i64;
    // a month's food and 100,000 rations over, all of it under cover
    m.world.civs[0].stock[Good::Food.index()] = pop + 100_000;
    let before = m.world.civs[0].flows.consumed[Good::Food.index()];
    crate::sim::population::step(&mut m.world, 0);
    let eaten_and_spoiled = m.world.civs[0].flows.consumed[Good::Food.index()] - before;
    assert_eq!(eaten_and_spoiled, pop + 100_000 * 250 / 10_000, "one ration per resident, plus 2.5% spoilage of what remains");
    assert_eq!(m.world.civs[0].food_ful_bp, 10_000);
    // one ration short for every resident in ten: access falls to nine tenths
    let pop = m.world.civ_population(0) as i64;
    m.world.civs[0].stock[Good::Food.index()] = pop * 9 / 10;
    crate::sim::population::step(&mut m.world, 0);
    assert!((8999..=9000).contains(&m.world.civs[0].food_ful_bp), "{}", m.world.civs[0].food_ful_bp);
    assert_eq!(m.world.civs[0].stock[Good::Food.index()], 0);
}

#[test]
fn a_level_employs_thousands_and_yields_per_thousand_workers() {
    let c = content();
    assert_eq!(c.facilities[c.f("fields")].general, 10_000);
    assert_eq!(c.facilities[c.f("lodge")].provides[0].1, 16_000);
    assert_eq!(c.facilities[c.f("waterworks")].provides[0].1, 1_200_000);
    assert_eq!(c.facilities[c.f("barracks")].provides[0].1, 200_000);
    let mut m = Match::new(cfg("yield"), 1);
    let home = m.world.civs[0].capital as usize;
    let before_food = m.world.civs[0].stock[Good::Food.index()];
    crate::sim::economy::step(&mut m.world, 0);
    let labor = m.world.regions[home].last.labor.clone();
    let made = m.world.civs[0].stock[Good::Food.index()] - before_food;
    // foragers bring in 2.6 rations each: enough hands are sent to feed everyone
    assert!(labor.food > 50_000 && labor.food < 200_000, "{} foragers", labor.food);
    let per_worker_milli = made * 1000 / labor.food as i64;
    assert!((2590..=2600).contains(&per_worker_milli), "{per_worker_milli} thousandths of a ration per forager");
    // the makers' circle is staffed by thousands and supplies one researcher-month each
    let circle = m.world.regions[home].fac(c.f("makers_circle")).unwrap();
    assert_eq!(circle.staff_needed, 6_000);
    assert_eq!(circle.staffed, 6_000);
    assert_eq!(m.world.civs[0].research_cap[ResearchClass::Craft.index()], 6_000);
    // called-up labour supplies one worker-month a head
    assert_eq!(labor.projects, 0, "nothing is being built yet");
}

#[test]
fn head_count_indices_keep_their_pace() {
    // evidence is the square root of thousands of people engaged, times one hundred
    assert_eq!(crate::sim::economy::activity_index(1_000), 100);
    assert_eq!(crate::sim::economy::activity_index(6_000), 244);
    assert_eq!(crate::sim::economy::activity_index(1_000_000), 3162);
    assert_eq!(crate::sim::economy::activity_index(0), 0);
}

#[test]
fn settlement_classes_follow_the_units_chapter() {
    for (pop, kind) in [
        (0u32, SettlementKind::Wilderness),
        (1, SettlementKind::Camp),
        (149_999, SettlementKind::Camp),
        (150_000, SettlementKind::Village),
        (999_999, SettlementKind::Village),
        (1_000_000, SettlementKind::Town),
        (3_999_999, SettlementKind::Town),
        (4_000_000, SettlementKind::City),
        (11_999_999, SettlementKind::City),
        (12_000_000, SettlementKind::Metropolis),
        (u32::MAX, SettlementKind::Metropolis),
    ] {
        assert_eq!(settlement_class(pop), kind, "{pop} residents");
    }
}

#[test]
fn the_observation_states_its_units() {
    let m = Match::new(cfg("units"), 1);
    let obs = m.observe(0);
    let u = &obs.units;
    assert_eq!(u.food_per_person_month, 1);
    assert_eq!(u.display_divisor, 1000);
    assert_eq!(u.goods.len(), Good::COUNT);
    let unit = |g: Good| u.goods.iter().find(|x| x.good == g).unwrap();
    assert_eq!((unit(Good::Food).unit.as_str(), unit(Good::Food).tonnes_per_unit_milli), ("ration", 50));
    assert_eq!((unit(Good::Metal).unit.as_str(), unit(Good::Metal).tonnes_per_unit_milli), ("t", 1000));
    assert_eq!((unit(Good::Tools).unit.as_str(), unit(Good::Tools).tonnes_per_unit_milli), ("lot", 250));
    assert_eq!(unit(Good::Hardware).tonnes_per_unit_milli, 500);
    assert_eq!(unit(Good::Medicine).tonnes_per_unit_milli, 40);
    assert_eq!(u.settlement_bounds, SETTLEMENT_BOUNDS.to_vec());
    assert_eq!(u.work_unit, "worker-month");
    assert_eq!(u.limits, PeopleLimits { settlers_min: 20_000, settlers_max: 400_000, soldiers_min: 1_000, soldiers_max: 5_000_000, program_seats_max: 2_000_000, founding_cohort_max: 4_000 });
    // an observation written before the field existed still parses
    let mut v = serde_json::to_value(&obs).unwrap();
    v.as_object_mut().unwrap().remove("units");
    let old: Observation = serde_json::from_value(v).unwrap();
    assert_eq!(old.units, UnitsView::default());
}

#[test]
fn action_json_written_for_earlier_protocols_still_parses() {
    let a: Action = serde_json::from_str(r#"{"kind":"start_program","region":3,"course":"E002","seats":8}"#).unwrap();
    assert_eq!(a, Action::StartProgram { region: 3, course: "E002".into(), seats: 8 });
    let a: Action = serde_json::from_str(r#"{"kind":"manage_program","program":7,"op":"pause","seats":null}"#).unwrap();
    assert_eq!(a, Action::ManageProgram { program: 7, op: ManageOp::Pause, seats: None });
    let a: Action = serde_json::from_str(r#"{"kind":"start_program","region":3,"course":"E002","seats":120000}"#).unwrap();
    assert_eq!(a, Action::StartProgram { region: 3, course: "E002".into(), seats: 120_000 });
}

#[test]
fn person_denominated_orders_are_bounded_in_people() {
    let mut m = Match::new(cfg("bounds"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    let target = m.world.regions[home].neighbors[0].0;
    m.world.civs[0].memory[target as usize].seen = true;
    m.world.civs[0].memory[target as usize].owner = None;
    let settle = |people: u32| Action::StartProject { spec: ProjectSpec::Settle { from: capital, to: target, people }, priority: None };
    assert_eq!(m.act(0, vec![settle(400)])[0].code.as_deref(), Some("INVALID_SCHEMA"), "a few hundred people are no longer a settling party");
    assert_eq!(m.act(0, vec![settle(400_001)])[0].code.as_deref(), Some("INVALID_SCHEMA"));
    // the sending region keeps eighty thousand
    let pop = m.world.regions[home].population();
    assert_eq!(m.act(0, vec![settle(pop - 79_999)])[0].code.as_deref(), Some("INSUFFICIENT_VISIBLE_BUDGET"));
    let r = m.act(0, vec![settle(50_000)]);
    if m.world.link(home, target as usize) != Some(LinkKind::Sea) {
        assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
        let p = m.world.civs[0].projects.last().unwrap();
        // four rations a settler; fifty tool lots a thousand settlers
        assert!(p.inputs.contains(&(Good::Food, 200_000, 0)));
        assert!(p.inputs.contains(&(Good::Tools, 2_500, 0)));
    }
    let recruit = |soldiers: u32| Action::StartProject { spec: ProjectSpec::Recruit { region: capital, role: Role::Denial, soldiers, tier: 0 }, priority: None };
    assert_eq!(m.act(0, vec![recruit(999)])[0].code.as_deref(), Some("INVALID_SCHEMA"));
    assert_eq!(m.act(0, vec![recruit(5_000_001)])[0].code.as_deref(), Some("INVALID_SCHEMA"));
    let r = m.act(0, vec![recruit(2_000)]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    let p = m.world.civs[0].projects.last().unwrap();
    // 150 worker-months and 300 tool lots per thousand recruits
    assert_eq!(p.work_needed, crate::sim::projects::scaled(300, m.world.cfg.pace_bp));
    assert_eq!(p.inputs, vec![(Good::Tools, 600, 0)]);
    // programme places
    let prog = |seats: u32| Action::StartProgram { region: capital, course: "E002".into(), seats };
    assert_eq!(m.act(0, vec![prog(0)])[0].code.as_deref(), Some("INVALID_SCHEMA"));
    assert_eq!(m.act(0, vec![prog(2_000_001)])[0].code.as_deref(), Some("INVALID_SCHEMA"));
}

#[test]
fn a_founding_cohort_is_at_most_four_thousand_and_courses_use_materials_per_thousand() {
    let mut m = Match::new(cfg("cohort"), 1);
    let c = content();
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    // a lodge with room, a course nobody here can teach yet
    m.world.regions[home].facilities.push(Facility { kind: c.f("lodge"), level: 2, condition_bp: 10_000, enabled: true, staffed: 0, staff_needed: 0, skilled_bp: 10_000, run: None, operated: false, assembly_progress: 0 });
    m.world.regions[home].facilities.sort_by_key(|f| f.kind);
    let (cap, reserved) = crate::sim::projects::venue_seats(&m.world, 0, home, crate::content::Cap::SeatsLodge);
    assert_eq!((cap, reserved), (32_000, 0));
    m.world.civs[0].programs.push(Program { id: 900, course: c.course_ix["E002"], region: capital, seats: 20_000, enrolled: 0, entrant: None, teachers: 0, teacher_qual: None, progress: 0, duration: 0, graduates: 0, paused: false, blockers: vec![] });
    m.world.regions[home].quals[Qual::Artisan.index()] = 0;
    crate::sim::projects::step(&mut m.world, 0);
    let p = m.world.civs[0].programs[0].clone();
    assert_eq!(p.enrolled, 4_000, "{:?}", p.blockers);
    assert_eq!(p.teachers, 0);
    assert_eq!(m.world.regions[home].students, 4_000);
    // with instructors the class size is people per instructor, unchanged
    m.world.civs[0].programs[0] = Program { id: 901, course: c.course_ix["E002"], region: capital, seats: 20_000, enrolled: 0, entrant: None, teachers: 0, teacher_qual: None, progress: 0, duration: 0, graduates: 0, paused: false, blockers: vec![] };
    m.world.regions[home].students = 0;
    m.world.regions[home].quals[Qual::Artisan.index()] = 1_000;
    crate::sim::projects::step(&mut m.world, 0);
    let p = m.world.civs[0].programs[0].clone();
    let class = c.courses[c.course_ix["E002"]].class_size as u32;
    assert_eq!(p.enrolled, (1_000 * class).min(20_000), "{:?}", p.blockers);
    assert_eq!(p.teachers, (p.enrolled + class - 1) / class);
    // a month of teaching draws 0.1 t of materials and 0.02 tool lots per learner
    let (mat, tools) = (m.world.civs[0].stock[Good::Materials.index()], m.world.civs[0].stock[Good::Tools.index()]);
    crate::sim::projects::step(&mut m.world, 0);
    assert_eq!(mat - m.world.civs[0].stock[Good::Materials.index()], p.enrolled as i64 * 100 / 1000);
    assert_eq!(tools - m.world.civs[0].stock[Good::Tools.index()], p.enrolled as i64 * 20 / 1000);
}

#[test]
fn a_save_from_another_ruleset_is_refused_by_name() {
    let m = Match::new(cfg("old-save"), 1);
    let json = m.save_json();
    assert!(Match::load_json(&json).is_ok(), "a save of this build loads");
    let mut v: serde_json::Value = serde_json::from_str(&json).unwrap();
    v["versions"][0] = serde_json::Value::String("bts-rules/1.0.1".into());
    let err = match Match::load_json(&v.to_string()) {
        Ok(_) => panic!("a save written by ruleset 1.0.1 must not load"),
        Err(e) => e,
    };
    assert!(err.contains("bts-rules/1.0.1"), "{err}");
    assert!(err.contains(crate::content::RULESET_VERSION), "{err}");
    assert!(err.contains("different units"), "{err}");
    // an old save whose layout no longer matches is refused for the same stated reason
    let old_layout = r#"{"versions":["bts-rules/1.0.1","bts-content/1.0.0"],"civs":[{"programs":[{"seats":"not what this build expects"}]}]}"#;
    let err = match Match::load_json(old_layout) {
        Ok(_) => panic!("must not load"),
        Err(e) => e,
    };
    assert!(err.contains("bts-rules/1.0.1") && err.contains(crate::content::RULESET_VERSION), "{err}");
    // a save that records no ruleset at all is refused too
    v["versions"] = serde_json::json!([]);
    assert!(Match::load_json(&v.to_string()).is_err());
}

#[test]
fn lot_masses_match_the_units_chapter() {
    use crate::content::{good_mass_kg, good_unit};
    for (g, kg) in [(Good::Tools, 250), (Good::Spares, 250), (Good::Electronics, 50), (Good::Hardware, 500), (Good::Media, 150), (Good::Instruments, 400), (Good::Medicine, 40), (Good::Food, 50)] {
        assert_eq!(good_mass_kg(g), kg, "{g:?}");
    }
    for g in Good::ALL {
        let bulk = good_unit(*g) == "t";
        assert_eq!(bulk, good_mass_kg(*g) == 1000, "{g:?}");
    }
}

/// Reference tables for `docs/units-and-scale.md`, printed from the content tables.
/// Run with `cargo test -p bts-engine --release print_unit_tables -- --ignored --nocapture`.
#[test]
#[ignore]
fn print_unit_tables() {
    use crate::content::{good_mass_kg, good_unit, FOOD_PER_PERSON_MONTH};
    use crate::util::group;
    let c = content();
    let disp = |v: i64| -> String {
        if v % 1000 == 0 { group(v / 1000) } else { format!("{}.{:03}", group(v / 1000), v % 1000).trim_end_matches('0').to_string() }
    };
    let goods = |v: &[(Good, i64)]| -> String {
        if v.is_empty() {
            return "-".into();
        }
        v.iter().map(|(g, a)| format!("{} {}", disp(*a), g.label().to_lowercase())).collect::<Vec<_>>().join(", ")
    };
    println!("== Units ==");
    println!("display unit = 1,000 base units; food per person-month = {FOOD_PER_PERSON_MONTH} ration");
    println!("start population per seat = {} to {}", group(crate::worldgen::START_POP_MIN as i64), group((crate::worldgen::START_POP_MIN + crate::worldgen::START_POP_SPREAD) as i64));
    println!("start qualifications = {} lorekeepers, {} artisans; home water at least {} residents", group(crate::worldgen::START_LOREKEEPERS as i64), group(crate::worldgen::START_ARTISANS as i64), group(crate::worldgen::HOME_WATER_MIN as i64));
    println!();
    println!("== Settlement classes (lower bound, residents) ==");
    for (k, lower) in SETTLEMENT_BOUNDS {
        println!("{:<11} {}", k.label(), group(lower as i64));
    }
    println!();
    println!("== Goods (one base unit) ==");
    for g in Good::ALL {
        println!("{:<26} {:<7} {:>5} kg", g.label(), good_unit(*g), good_mass_kg(*g));
    }
    println!();
    println!("== Facilities (per level; goods and services in display units per level-month) ==");
    for f in &c.facilities {
        let skilled: u32 = f.skilled.iter().map(|(_, n)| *n).sum();
        let crew = f.general + skilled;
        let crew_txt = f.skilled.iter().map(|(qs, n)| format!("{} {}", group(*n as i64), qs.iter().map(|q| q.label().to_lowercase()).collect::<Vec<_>>().join("/"))).collect::<Vec<_>>().join(" + ");
        println!("{} [{}] ({})", f.name, f.key, f.category);
        println!("    crew {} = {} general + {} qualified{}", group(crew as i64), group(f.general as i64), group(skilled as i64), if crew_txt.is_empty() { String::new() } else { format!(" ({crew_txt})") });
        println!("    build: {} ; {} worker-months", goods(&f.cost), group(f.work));
        if !f.upkeep.is_empty() {
            println!("    upkeep: {}", goods(&f.upkeep));
        }
        for (cap, v) in &f.provides {
            println!("    provides {:?}: {}", cap, if cap.in_people() { format!("{} people", group(*v)) } else { disp(*v) });
        }
        for r in &f.recipes {
            let mut services = Vec::new();
            for (label, v) in [("shaft in", r.shaft), ("electric in", r.elec), ("compute in", r.compute), ("shaft out", r.out_shaft), ("electric out", r.out_elec), ("compute out", r.out_compute)] {
                if v != 0 {
                    services.push(format!("{label} {}", disp(v)));
                }
            }
            if let Some((class, pts)) = r.research {
                services.push(format!("{} researcher-months of {}", group(pts), class.label().to_lowercase()));
            }
            println!("    recipe {} ({}): in {} -> out {}{}", r.key, r.name, goods(&r.inputs), goods(&r.outputs), if services.is_empty() { String::new() } else { format!(" ; {}", services.join(", ")) });
            for (g, a) in &r.outputs {
                if crew > 0 {
                    // base units per worker-month, to three decimals
                    let per = a * 1000 / crew as i64;
                    let kg = a * good_mass_kg(*g) / crew as i64;
                    println!("        per worker-month: {}.{:03} {} of {} ({} kg)", per / 1000, per % 1000, good_unit(*g), g.label().to_lowercase(), group(kg));
                }
            }
        }
        if f.food {
            let civ_none = crate::sim::economy::FoodTech { forage: 2600, field: 3000, pasture: 3200, fish: 3000, fish_port: 3000, chem_per_worker: 0, fuel_per_worker: 0, label: "Hand cultivation" };
            let y = match f.key {
                "fields" => civ_none.field,
                "pasture" => civ_none.pasture,
                _ => civ_none.fish,
            };
            println!("    food at first methods: {} rations per level-month; {}.{:03} rations per worker-month ({} kg)", group(f.general as i64 * y / 1000), y / 1000, y % 1000, y * good_mass_kg(Good::Food) / 1000);
        }
    }
    println!();
    println!("== Courses ==");
    for k in &c.courses {
        println!("{} {}: {} months, {} learners per instructor, materials per thousand learners per month: {}", k.id, k.name, k.months, k.class_size, goods(&k.materials));
    }
    println!();
    println!("== Formations (per thousand soldiers) ==");
    for t in &c.unit_tiers {
        println!("tier {} {}: equipment {} ; monthly upkeep {}", t.tier, t.name, goods(&t.equipment), goods(&t.upkeep));
    }
    println!();
    println!("== Research work by tier (researcher-months before pace) ==");
    let mut tiers: Vec<(u8, i64)> = c.techs.iter().map(|t| (t.tier, t.work)).collect();
    tiers.sort();
    tiers.dedup();
    for (tier, work) in tiers {
        println!("tier {tier}: {}", group(work));
    }
}
