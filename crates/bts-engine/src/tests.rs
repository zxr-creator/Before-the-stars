//! Release-gate properties: determinism, checkpoint recovery, conservation,
//! information isolation and the complete-victory rules.

use crate::content::content;
use crate::sim::victory;
use crate::state::*;
use crate::{Match, MatchConfig};
use bts_protocol::*;

mod calendar;
mod construction;
mod cooperation;
mod knowledge;
mod methods;
mod population;
mod worldgen;
mod goods;
mod productivity;
mod graph39;
mod eras;
mod cities;
mod job3;
mod space;

/// Ruleset-2.0-style unit tests run on the fixture clock: twelve-month rounds from
/// 5000 BC (design chapter 36, section 2.2).
fn cfg(seed: &str) -> MatchConfig {
    MatchConfig { seed: seed.into(), regions: 24, calendar: MatchConfig::fixture_calendar(240), ..Default::default() }
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
    assert_eq!(content().techs.len(), 300);
    assert!(content().practices.len() >= 64);
    assert_ne!(content().graph_hash, 0);
}

#[test]
fn population_changes_only_through_recorded_flows() {
    let mut m = Match::new(cfg("conservation"), 1);
    let before: Vec<u64> = (0..4).map(|s| m.world.civ_population(s)).collect();
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
    // the logistical base: a year of the programme's fuel and spares in store
    civ.stock[Good::Spares.index()] = 2_000_000;
    civ.stock[Good::Fuel.index()] = 3_000_000;
    // the industrial base: a year's output of flight hardware
    for g in victory::HARDWARE_GOODS {
        civ.last_flows.produced[g.index()] = 10_000_000;
    }
    // the scientific base: staffed frontier research posts
    civ.research_cap[ResearchClass::Frontier.index()] = 60_000;
    let nodes = w.test_nodes.clone();
    let mut yards = 0;
    for ri in 0..w.regions.len() {
        let r = &mut w.regions[ri];
        if r.population() > 0 || nodes.contains(&(ri as RegionId)) || yards < 2 {
            r.owner = Some(0);
            r.controller = Some(0);
            let add = |key: &str, r: &mut Region| {
                let kind = c.f(key);
                r.facilities.push(Facility { staffed: 10, staff_needed: 10, run: Some(RunStat { recipe: 0, rate_bp: 10_000, blockers: 0, missing: vec![] }), operated: true, ..Facility::new(kind, 1) });
            };
            if nodes.contains(&(ri as RegionId)) {
                add("jump_base", r);
            }
            if yards < 2 {
                add("jump_yard", r);
                add("orbital_yard", r);
                if yards == 0 {
                    // launch, the station the yard stands on, the laboratory and the institute
                    for key in ["launch_complex", "orbital_station", "high_energy", "tech_institute"] {
                        add(key, r);
                    }
                }
                yards += 1;
            }
            // freight links at every programme site
            if nodes.contains(&(ri as RegionId)) || r.facilities.iter().any(|f| c.facilities[f.kind].key == "jump_yard") {
                add("rail", r);
            }
            r.quals[Qual::FtlEngineer.index()] = 40_000;
            r.quals[Qual::Orbital.index()] = 40_000;
        }
    }
    // the educational base: running courses for both qualifications
    let campus = w.regions.iter().position(|r| r.fac(c.f("tech_institute")).is_some()).unwrap() as RegionId;
    for (i, course) in ["E023", "E024"].iter().enumerate() {
        w.civs[0].programs.push(Program { id: 9100 + i as u32, course: c.course_ix[*course], region: campus, seats: 10_000, enrolled: 10_000, entrant: None, teachers: 0, teacher_qual: None, progress: 0, duration: 24, graduates: 0, paused: false, blockers: vec![], last_grad: 0 });
    }
    let yard = c.f("jump_yard");
    let yard_regions: Vec<RegionId> = w.regions.iter().filter(|r| r.fac(yard).is_some()).map(|r| r.id).collect();
    for (i, yr) in yard_regions.iter().enumerate() {
        w.civs[0].ftl.assemblies.push(Assembly { id: 9000 + i as u32, yard_region: *yr, built: 0, retired: false });
    }
    w.civs[0].ftl.deployment_done = Some(0);
    w.civs[0].ftl.replacement_done = Some(0);
    // check 13 (design chapter 39, 4.6): boost made every month, and a station in low
    // Earth orbit with a shipyard module operating
    w.civs[0].space.streak = 1_000;
    let mut modules = vec![0u16; crate::sim::space::MODULES.len()];
    modules[crate::sim::space::M_SHIPYARD] = 1;
    w.space.stations.push(crate::sim::space::StationSt { id: 8000, owner: 0, orbit: 0, core: 2, modules, staffed_bp: 10_000, power_bp: 10_000, supplied_bp: 10_000, rate_bp: 10_000, aboard: 0, staffed: 0 });
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
    assert!((reward - (2.0 - 96.0 / w.cfg.horizon() as f64)).abs() < 1e-9);
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
    let mut m = Match::new(MatchConfig { seed: "short".into(), regions: 24, calendar: MatchConfig::fixture_calendar(2), ..Default::default() }, 1);
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
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let mut m = Match::new(cfg("industrial-scale"), 1);
    let region = m.world.civs[0].capital as usize;
    let k = content().f("camp");
    for r in m.world.regions.iter_mut().filter(|r| r.controller == Some(0)) { r.facilities.clear(); }
    let r = &mut m.world.regions[region];
    r.facilities.clear();
    r.blocks[0].ages[30] += 1_000_000;
    r.facilities.push(Facility::new(k, 10));
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
        let pop = m.world.civ_population(s) as u32;
        assert!((START_POP_MIN..=START_POP_MIN + START_POP_SPREAD).contains(&pop), "seat {s} starts with {pop}");
        let home = &m.world.regions[m.world.civs[s as usize].capital as usize];
        assert_eq!(home.quals[Qual::Lorekeeper.index()], START_LOREKEEPERS);
        assert_eq!(home.quals[Qual::Artisan.index()], START_ARTISANS);
        assert!(home.water >= HOME_WATER_MIN);
        // the observation states people as people: nothing is multiplied on the way out
        let obs = m.observe(s);
        assert_eq!(obs.civ.population, pop as u64);
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
        // every resident within reach of the stores (provisioning is tested on its own)
        r.last.food_made = r.population() as i64;
    }
    let pop = m.world.civ_population(0) as i64;
    // a month's food and 100,000 rations over, all of it under cover
    m.world.civs[0].stock[Good::Food.index()] = pop + 100_000;
    let before = m.world.civs[0].flows.consumed[Good::Food.index()];
    let lost_before = m.world.civs[0].flows.lost[Good::Food.index()];
    crate::sim::population::step(&mut m.world, 0);
    let eaten = m.world.civs[0].flows.consumed[Good::Food.index()] - before;
    let spoiled = m.world.civs[0].flows.lost[Good::Food.index()] - lost_before;
    assert_eq!(eaten, pop, "one ration per resident, and nothing else counts as eaten");
    assert_eq!(spoiled, 100_000 * 250 / 10_000, "2.5% of what remains spoils, and is booked as lost");
    assert_eq!(m.world.civs[0].stock[Good::Food.index()], 100_000 - spoiled);
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
    // the makers' circle is staffed by thousands; under oral tradition a post supplies
    // two tenths of a researcher-month (research effectiveness, ruleset 3.0)
    let circle = m.world.regions[home].fac(c.f("makers_circle")).unwrap();
    assert_eq!(circle.staff_needed, 6_000);
    assert_eq!(circle.staffed, 6_000);
    assert_eq!(m.world.civs[0].research_cap[ResearchClass::Craft.index()], 1_200);
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
        (39_999_999, SettlementKind::Metropolis),
        (40_000_000, SettlementKind::Megalopolis),
        (u32::MAX, SettlementKind::Megalopolis),
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
    m.world.regions[home].facilities.push(Facility::new(c.f("lodge"), 2));
    m.world.regions[home].facilities.sort_by_key(|f| f.kind);
    let (cap, reserved) = crate::sim::projects::venue_seats(&m.world, 0, home, crate::content::Cap::SeatsLodge);
    assert_eq!((cap, reserved), (32_000, 0));
    m.world.civs[0].programs.push(Program { id: 900, course: c.course_ix["E002"], region: capital, seats: 20_000, enrolled: 0, entrant: None, teachers: 0, teacher_qual: None, progress: 0, duration: 0, graduates: 0, paused: false, blockers: vec![], last_grad: 0 });
    m.world.regions[home].quals[Qual::Artisan.index()] = 0;
    crate::sim::projects::step(&mut m.world, 0);
    let p = m.world.civs[0].programs[0].clone();
    assert_eq!(p.enrolled, 4_000, "{:?}", p.blockers);
    assert_eq!(p.teachers, 0);
    assert_eq!(m.world.regions[home].students, 4_000);
    // with instructors the class size is people per instructor, unchanged
    m.world.civs[0].programs[0] = Program { id: 901, course: c.course_ix["E002"], region: capital, seats: 20_000, enrolled: 0, entrant: None, teachers: 0, teacher_qual: None, progress: 0, duration: 0, graduates: 0, paused: false, blockers: vec![], last_grad: 0 };
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
fn a_damaged_save_is_refused_not_run() {
    // job 4b: a save whose raider camp lies outside the world stopped the WebAssembly
    // build with an index out of range; it is refused with a stated reason instead
    let m = Match::new(cfg("damaged-save"), 1);
    let mut v: serde_json::Value = serde_json::from_str(&m.save_json()).unwrap();
    assert!(v["camps"].as_array().map(|c| !c.is_empty()).unwrap_or(false), "the fixture world has camps");
    v["camps"][0]["region"] = serde_json::json!(60_000);
    let err = Match::load_json(&v.to_string()).err().expect("a damaged save must not load");
    assert!(err.contains("damaged") && err.contains("camp"), "{err}");
    // and a pre-release ruleset 3.0 save is refused by name
    let mut v: serde_json::Value = serde_json::from_str(&m.save_json()).unwrap();
    v["versions"][0] = serde_json::Value::String("bts-rules/3.0.0-j4".into());
    let err = Match::load_json(&v.to_string()).err().expect("refused");
    assert!(err.contains("bts-rules/3.0.0-j4") && err.contains("before its release"), "{err}");
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
        let site_crew = f.crew.iter().map(|(qs, n)| format!("{} {}", group(*n as i64), qs.iter().map(|q| q.label().to_lowercase()).collect::<Vec<_>>().join("/"))).collect::<Vec<_>>().join(" + ");
        println!("    site: crew {} ; power {} a month ; at least {} months", if site_crew.is_empty() { "none".to_string() } else { site_crew }, disp(f.build_power), f.build_months);
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
            // a method may need fewer general posts and further qualified ones
            let extra: u32 = r.extra_skilled.iter().map(|(_, n)| *n).sum();
            let crew = f.general_under(r.general_bp, 1) + skilled + extra;
            if r.general_bp != 10_000 || extra > 0 {
                let extra_txt = r.extra_skilled.iter().map(|(qs, n)| format!("{} {}", group(*n as i64), qs.iter().map(|q| q.label().to_lowercase()).collect::<Vec<_>>().join("/"))).collect::<Vec<_>>().join(" + ");
                println!("        crew under this method {} = {} general + {} qualified{}", group(crew as i64), group(f.general_under(r.general_bp, 1) as i64), group((skilled + extra) as i64), if extra_txt.is_empty() { String::new() } else { format!(" (adds {extra_txt})") });
            }
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
            use crate::sim::economy::{field_yield, food_tech, FIELD_METHODS};
            // a people that knows nothing yet, and one that knows everything
            let first = Match::new(cfg("unit-tables"), 1);
            let mut last = Match::new(cfg("unit-tables"), 1);
            know_everything(&mut last.world, 0);
            let line = |what: &str, y: i64| println!("    {what}: {} rations per level-month; {}.{:03} rations per worker-month ({} kg)", group(f.general as i64 * y / 1000), y / 1000, y % 1000, y * good_mass_kg(Good::Food) / 1000);
            match f.key {
                "fields" => {
                    for (i, m) in FIELD_METHODS.iter().enumerate() {
                        let (lo, hi) = (field_yield(&first.world.civs[0], i), field_yield(&last.world.civs[0], i));
                        line(&format!("method {} ({}), needs {}", m.key, m.name, if m.techs.is_empty() { "nothing".to_string() } else { m.techs.join(" & ") }), lo);
                        if hi != lo {
                            line("        with selection and soil science", hi);
                        }
                        println!("        {} posts a level; draws {} horses, {} fertilizer, {} chemicals and {} fuel per level-month", group(m.posts as i64), m.inputs[0], disp(m.inputs[1]), disp(m.inputs[2]), disp(m.inputs[3]));
                    }
                }
                "pasture" => {
                    line("food at first methods", food_tech(&first.world.civs[0], false).pasture);
                    line("food at last methods", food_tech(&last.world.civs[0], true).pasture);
                }
                _ => {
                    line("food at first methods", food_tech(&first.world.civs[0], false).fish);
                    line("food at last methods, from a harbour with motor boats", food_tech(&last.world.civs[0], true).fish_port);
                }
            }
        }
    }
    println!();
    println!("== Economies of scale ==");
    {
        use crate::sim::economy::*;
        println!("freight capacity: 10 plus each network level's freight (roads 6/10/20, harbour 6/15/30, railway 20/25/25, canal 10/20)");
        println!("shared support posts: {} bp of general posts per level beyond the first, at most {} bp", SUPPORT_SAVING_PER_LEVEL_BP, SUPPORT_SAVING_CAP_BP);
        println!("maintenance pooling: at most {} bp of spares and tools upkeep; one level of repair works serves {} levels", MAINT_SAVING_CAP_BP, REPAIR_WORKS_SERVE);
        println!("congestion: at most {} bp more lost in carriage", CONGESTION_LOSS_CAP_BP);
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

// ---------------------------------------------------------------------------
// Ledgers and conservation (docs/conservation-audit.md)
//
// Nothing enters the world from nothing. The all-AI matches that prove it over
// whole campaigns live in `crates/bts-ai/tests/conservation.rs` (this crate cannot
// depend on the policy); the tests here are scripted and cover each source and
// each ledger channel on its own, plus a 360-month scripted match under the same
// monthly audit.
// ---------------------------------------------------------------------------

use crate::ledger::{self, LedgerSnapshot};

fn works(kind: &str, level: u16) -> Facility {
    Facility::new(content().f(kind), level)
}

fn put_works(r: &mut Region, kind: &str, level: u16) {
    let k = content().f(kind);
    r.facilities.retain(|f| f.kind != k);
    r.facilities.push(works(kind, level));
    r.facilities.sort_by_key(|f| f.kind);
}

/// Qualified residents given to a seat as part of a fixture's declared endowment.
fn endow(w: &mut World, region: usize, q: Qual, n: u32) {
    let seat = w.regions[region].controller.expect("a governed region") as usize;
    w.regions[region].quals[q.index()] += n;
    w.civs[seat].qual_flows.initial[q.index()] += n as i64;
}

fn settle_fixture(w: &mut World, region: usize, people: u32) {
    let extra = crate::worldgen::start_pyramid(people);
    let lineage = w.regions[region].controller.map(|s| w.civs[s as usize].lineage).unwrap_or(0);
    if w.regions[region].blocks.is_empty() {
        w.regions[region].blocks.push(PopBlock::new(lineage, None));
    }
    for (age, n) in extra.iter().enumerate() {
        w.regions[region].blocks[0].ages[age] += n;
    }
}

fn know_everything(w: &mut World, seat: usize) {
    for t in w.civs[seat].tech.iter_mut() {
        t.state = ST_ADOPTED;
    }
    for p in w.civs[seat].practice.iter_mut() {
        p.state = 3;
        p.adoption_bp = 10_000;
    }
}

/// An unowned land neighbour of a region.
fn free_neighbour(w: &World, region: usize, not: &[usize]) -> Option<usize> {
    w.regions[region].neighbors.iter().filter(|(n, k)| *k != LinkKind::Sea && w.regions[*n as usize].owner.is_none() && !not.contains(&(*n as usize))).map(|(n, _)| *n as usize).next()
}

/// The first violation list that is not empty fails the test with its first lines.
fn assert_balanced(prev: &LedgerSnapshot, cur: &LedgerSnapshot) {
    let broken = ledger::violations(prev, cur);
    assert!(broken.is_empty(), "{} conservation violations, first:\n{}", broken.len(), broken.iter().take(12).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn the_starting_pyramid_is_smooth() {
    use crate::worldgen::{start_pyramid, START_POP_MIN, START_POP_SPREAD};
    for total in [START_POP_MIN, START_POP_MIN + 1, START_POP_MIN + 777, START_POP_MIN + START_POP_SPREAD] {
        let ages = start_pyramid(total);
        assert_eq!(ages.iter().sum::<u32>(), total, "every founder is placed");
        // no age stands out: each cell is its neighbour's size or smaller, give or take
        // the one person the remainder adds
        for age in 0..AGES - 1 {
            assert!(ages[age] + 1 >= ages[age + 1], "age {age}: {} then {}", ages[age], ages[age + 1]);
        }
        // in particular there is no spike of young adults at twenty
        assert!(ages[20] <= ages[19] + 1 && ages[20] + ages[20] / 50 + 2 >= ages[19], "{} at 19, {} at 20", ages[19], ages[20]);
        assert_eq!(ages[75..].iter().sum::<u32>(), 0);
    }
    // the world is generated with it
    let m = Match::new(cfg("pyramid"), 1);
    for s in 0..4usize {
        let home = &m.world.regions[m.world.civs[s].capital as usize];
        assert_eq!(home.blocks[0].ages, start_pyramid(home.population()));
    }
}

#[test]
fn starting_stocks_and_qualifications_are_the_declared_endowment() {
    use crate::worldgen::{START_ARTISANS, START_LOREKEEPERS};
    let m = Match::new(cfg("endowment"), 1);
    let snap = m.ledger_snapshot();
    for c in &snap.civs {
        // every qualified person at the start is in the ledger's `initial` column
        assert_eq!(c.qual_flows.initial[Qual::Lorekeeper.index()], START_LOREKEEPERS as i64);
        assert_eq!(c.qual_flows.initial[Qual::Artisan.index()], START_ARTISANS as i64);
        assert_eq!(c.qual_flows.initial.iter().sum::<i64>(), (START_LOREKEEPERS + START_ARTISANS) as i64);
        for q in 0..NQ {
            assert_eq!(c.holders[q], c.qual_flows.balance(q));
        }
        // and the only goods in the world are the declared starting stores
        let stocked: Vec<Good> = Good::ALL.iter().copied().filter(|g| c.stock[g.index()] != 0).collect();
        assert_eq!(stocked, vec![Good::Food, Good::Materials, Good::Tools]);
        assert_eq!((c.stock[Good::Food.index()], c.stock[Good::Materials.index()], c.stock[Good::Tools.index()]), (900_000, 90_000, 45_000));
    }
    // nobody lives outside the four home regions and the raider camps, and nobody is under arms
    assert_eq!(snap.people, snap.regions.iter().filter(|r| r.controller.is_some() || r.camp).map(|r| r.residents as u64).sum::<u64>());
    assert_eq!(snap.regions.iter().filter(|r| r.residents > 0).count(), 4 + m.world.camps.len());
    assert!(!m.world.camps.is_empty(), "the world has its free peoples");
}

#[test]
fn no_recipe_puts_out_more_mass_than_it_takes_in() {
    use crate::content::{good_mass_kg, mass_kg, Site};
    let c = content();
    let mut extractive: Vec<&str> = Vec::new();
    for f in &c.facilities {
        if f.extractive {
            extractive.push(f.key);
        }
        for r in &f.recipes {
            let name = format!("{} / {}", f.key, r.key);
            if let Some(d) = r.depletes {
                // ore comes out of a deposit the works sit on, and never more than is drawn
                assert_eq!(f.site, Site::Deposit(d), "{name}");
                assert!(f.extractive, "{name}");
                assert!(r.disturb_bp >= 10_000, "{name} delivers more than it draws");
                assert!(r.inputs.is_empty(), "{name}");
            }
            if r.service_only() {
                // shaft, electricity, compute, research or assembly progress: no goods out
                continue;
            }
            if r.inputs.is_empty() {
                // goods from no goods: only works that take their material out of the site
                assert!(f.extractive, "{name} makes goods from nothing");
                continue;
            }
            let (m_in, m_out) = (mass_kg(&r.inputs), mass_kg(&r.outputs));
            if ATMOSPHERIC.contains(&r.key) {
                // a declared atmospheric-input recipe takes carbon or nitrogen from the
                // air: its ceiling is three times the mass it takes from stock
                assert!(m_out <= 3 * m_in, "{name}: {m_out} kg out of {m_in} kg in");
                continue;
            }
            assert!(m_out <= m_in, "{name}: {m_out} kg out of {m_in} kg in");
        }
        // food is grown on the site by its cultivators: those works carry no recipe at all
        if f.food {
            assert!(f.recipes.is_empty(), "{}", f.key);
        }
    }
    // the exception is explicit and narrow: mines, wells, the timber and quarry camps,
    // kilns digging their own clay, and water and air drawn for crews in space
    assert_eq!(extractive, vec!["camp", "quarry", "salt_works", "salt_pans", "fibre_farm", "spice_farm", "horse_farm", "mine_copper", "mine_iron", "mine_coal", "mine_tin", "mine_precious", "mine_bauxite", "mine_uranium", "mine_rare_earths", "mine_cobalt_nickel", "mine_quartz", "nitre_works", "brine_works", "gas_well", "oilwell", "kiln", "life_support_plant"]);
    // the recipes that used to fail
    let rec = |fac: &str, key: &str| c.facilities[c.f(fac)].recipes.iter().find(|r| r.key == key).unwrap();
    assert!(mass_kg(&rec("insulation_works", "polymer").outputs) <= mass_kg(&rec("insulation_works", "polymer").inputs));
    assert!(mass_kg(&rec("instrument_shop", "precision").outputs) <= mass_kg(&rec("instrument_shop", "precision").inputs));
    assert_eq!(rec("mine_iron", "shallow").disturb_bp, 20_000);
    assert_eq!(rec("mine_iron", "deep").disturb_bp, 10_000);
    // copy houses turn writing material into media at the scriptorium's ratio
    use crate::sim::culture::{COPY_HOUSE_LOTS, COPY_HOUSE_LOTS_PER_TONNE};
    assert!(COPY_HOUSE_LOTS * good_mass_kg(Good::Media) <= (COPY_HOUSE_LOTS + COPY_HOUSE_LOTS_PER_TONNE - 1) / COPY_HOUSE_LOTS_PER_TONNE * good_mass_kg(Good::Materials));
    // settlers, soldiers and courses are issued goods, never given any
    for t in &c.unit_tiers {
        assert!(t.equipment.iter().chain(t.upkeep.iter()).all(|(_, a)| *a >= 0));
    }
}

/// A seat whose capital holds one mine on a known deposit and nothing else that makes goods.
fn mining_world(recipe_deep: bool, remaining: i64, quality_bp: u16) -> (Match, usize) {
    let mut m = Match::new(cfg("mining"), 1);
    let c = content();
    let home = m.world.civs[0].capital as usize;
    m.world.civs[0].tech[c.t("T014")].state = ST_ADOPTED;
    if recipe_deep {
        m.world.civs[0].tech[c.t("T063")].state = ST_ADOPTED;
        m.world.civs[0].tech[c.t("T029")].state = ST_ADOPTED;
    }
    let r = &mut m.world.regions[home];
    r.facilities.clear();
    r.deposits.retain(|d| d.kind != Deposit::IronOre);
    r.deposits.push(DepositState::new(Deposit::IronOre, remaining, quality_bp));
    r.hydro = 8;
    put_works(r, "mine_iron", 2);
    if recipe_deep {
        put_works(r, "waterwheel", 2);
    }
    m.world.civs[0].stock[Good::Food.index()] = 5_000_000;
    (m, home)
}

#[test]
fn extraction_draws_from_the_deposit_at_least_what_it_delivers() {
    let ore = Good::IronOre.index();
    // shallow workings: 18 kt a level raised, twice that drawn, 85% of it worth carrying at quality 0.7
    let (mut m, home) = mining_world(false, 10_000_000, 7000);
    let before = m.ledger_snapshot();
    crate::sim::step_month(&mut m.world);
    let dep = m.world.regions[home].deposit(Deposit::IronOre).unwrap().clone();
    let run = m.world.regions[home].fac(content().f("mine_iron")).unwrap().run.clone().unwrap();
    assert_eq!(content().facilities[content().f("mine_iron")].recipes[run.recipe].key, "shallow");
    let raised = 18_000 * 2 * run.rate_bp as i64 / 10_000;
    assert!(raised > 0);
    assert_eq!(dep.drawn, raised * 2, "shallow workings disturb twice what they raise");
    assert_eq!(dep.remaining, 10_000_000 - raised * 2);
    assert_eq!(dep.delivered, raised * 8500 / 10_000);
    assert_eq!(m.world.civs[0].flows.produced[ore], dep.delivered);
    assert_eq!(m.world.civs[0].stock[ore], dep.delivered, "the capital pays no carriage");
    assert_balanced(&before, &m.ledger_snapshot());

    // drained deep workings: 36 kt a level raised, exactly that drawn
    let (mut m, home) = mining_world(true, 10_000_000, 10_000);
    crate::sim::step_month(&mut m.world);
    let dep = m.world.regions[home].deposit(Deposit::IronOre).unwrap().clone();
    let run = m.world.regions[home].fac(content().f("mine_iron")).unwrap().run.clone().unwrap();
    assert_eq!(content().facilities[content().f("mine_iron")].recipes[run.recipe].key, "deep");
    let raised = 36_000 * 2 * run.rate_bp as i64 / 10_000;
    assert!(raised > 0, "{run:?}");
    assert_eq!(dep.drawn, raised, "deep workings draw what they raise and no less");
    assert_eq!(dep.delivered, raised, "at full quality all of it is delivered");
    assert!(dep.delivered <= dep.drawn);

    // a deposit that is nearly gone gives up only what is left of it
    let (mut m, home) = mining_world(false, 5_001, 10_000);
    let before = m.ledger_snapshot();
    crate::sim::step_month(&mut m.world);
    let dep = m.world.regions[home].deposit(Deposit::IronOre).unwrap().clone();
    assert_eq!((dep.remaining, dep.drawn), (0, 5_001), "the last of the deposit comes out whole: {dep:?}");
    assert!(dep.delivered * 2 <= dep.drawn, "{dep:?}");
    assert_eq!(m.world.civs[0].flows.produced[ore], dep.delivered);
    assert_balanced(&before, &m.ledger_snapshot());
    for _ in 0..3 {
        crate::sim::step_month(&mut m.world);
    }
    let dep = m.world.regions[home].deposit(Deposit::IronOre).unwrap().clone();
    assert!(dep.remaining >= 0 && dep.remaining + dep.drawn == 5_001 && dep.delivered <= dep.drawn, "{dep:?}");
}

#[test]
fn carriage_loss_and_spoilage_are_booked_as_lost() {
    let mut m = Match::new(cfg("carriage"), 1);
    let home = m.world.civs[0].capital as usize;
    let far = free_neighbour(&m.world, home, &[]).expect("a free land neighbour");
    // a second region two hundred thousand strong, with a timber camp and no road
    m.world.regions[far].owner = Some(0);
    m.world.regions[far].controller = Some(0);
    settle_fixture(&mut m.world, far, 200_000);
    m.world.regions[far].forest = 10;
    m.world.regions[far].wild = 2_000_000;
    put_works(&mut m.world.regions[far], "quarry", 2);
    m.world.regions[home].facilities.clear();
    m.world.civs[0].stock[Good::Materials.index()] = 0;
    let link = crate::sim::economy::link_efficiencies(&m.world, 0)[far];
    assert!(link < 10_000, "an outlying region without roads loses some of what it sends");
    let before = m.ledger_snapshot();
    crate::sim::economy::step(&mut m.world, 0);
    let run = m.world.regions[far].fac(content().f("quarry")).unwrap().run.clone().unwrap();
    let gross = 16_000 * 2 * run.rate_bp as i64 / 10_000;
    assert!(gross > 0);
    // idle adults also make 0.3 t each at home; that reaches the stock whole
    let household = m.world.civs[0].labor.household as i64 * 300 / 1000;
    let civ = &m.world.civs[0];
    let mat = Good::Materials.index();
    assert_eq!(civ.flows.produced[mat], gross + household, "output is booked gross, where it is made");
    assert_eq!(civ.flows.lost[mat], gross - gross * link / 10_000, "what carriage costs is booked as lost");
    assert_eq!(civ.stock[mat], civ.flows.produced[mat] - civ.flows.lost[mat]);
    assert_balanced(&before, &m.ledger_snapshot());
}

#[test]
fn household_craft_is_bounded_by_idle_adults() {
    let mut m = Match::new(cfg("household"), 1);
    for r in m.world.regions.iter_mut() {
        r.facilities.clear();
    }
    let mat = Good::Materials.index();
    m.world.civs[0].stock[mat] = 0;
    crate::sim::economy::step(&mut m.world, 0);
    let civ = &m.world.civs[0];
    assert!(civ.labor.household > 0);
    // nothing else makes materials here: exactly 0.3 t for each adult without a post
    assert_eq!(civ.flows.produced[mat], civ.labor.household as i64 * 300 / 1000);
    assert_eq!(civ.labor.household + civ.labor.food + civ.labor.facilities + civ.labor.projects, {
        let r = &m.world.regions[civ.capital as usize];
        (r.working() as i64 * 92 / 100) as u32 - r.students - r.teachers.iter().sum::<u32>()
    });
    // with stores at twice their target nobody makes more
    m.world.civs[0].stock[mat] = 100_000_000;
    let made = m.world.civs[0].flows.produced[mat];
    crate::sim::economy::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].flows.produced[mat], made);
}

/// Recipes declared to take part of their mass from the air (design chapter 36,
/// section 5.4): ammonia fertilizer (resources slice) and food synthesis.
const ATMOSPHERIC: &[&str] = &["food_synthesis", "ammonia", "ammonia_coal"];

#[test]
fn field_methods_are_used_only_when_their_inputs_are_delivered() {
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let c = content();
    let mut m = Match::new(cfg("field-inputs"), 1);
    let home = m.world.civs[0].capital as usize;
    for id in ["T005", "T095"] {
        m.world.civs[0].tech[c.t(id)].state = ST_ADOPTED;
    }
    m.world.regions[home].wild = 0;
    m.world.regions[home].arable = 40;
    m.world.regions[home].facilities.clear();
    put_works(&mut m.world.regions[home], "fields", 30);
    let chem = Good::Fertilizer.index();
    let food = Good::Food.index();
    // a full month for one level of fertilized fields is 150 t: with 149 t in store
    // no level is fertilized and nothing is drawn
    m.world.civs[0].stock[chem] = 149;
    m.world.civs[0].stock[food] = 0;
    crate::sim::economy::step(&mut m.world, 0);
    let plain = m.world.civs[0].stock[food];
    let workers_plain = m.world.civs[0].labor.food;
    assert_eq!(m.world.civs[0].stock[chem], 149, "a store that cannot cover a level's month is not drawn on");
    assert_eq!(m.world.civs[0].flows.consumed[chem], 0);
    let run = |m: &Match| m.world.regions[home].fac(c.f("fields")).unwrap().field_run.clone().unwrap();
    assert_eq!(run(&m).missing, vec![Good::Fertilizer]);
    // with ten levels' month in store, ten levels are fertilized and the rest hand-worked;
    // what is drawn is what those levels' cultivators at work need, never more than is there
    m.world.civs[0].stock[chem] = 1_500;
    m.world.civs[0].stock[food] = 0;
    crate::sim::economy::step(&mut m.world, 0);
    let used = m.world.civs[0].flows.consumed[chem];
    assert!(used > 0 && used <= 1_500, "{used}");
    assert_eq!(m.world.civs[0].stock[chem], 1_500 - used);
    assert_eq!(run(&m).missing, vec![Good::Fertilizer], "the other twenty levels are short");
    // with the whole month in store every level is fertilized, and the inputs are really taken
    m.world.civs[0].stock[chem] = 4_500;
    m.world.civs[0].stock[food] = 0;
    let before = m.world.civs[0].flows.consumed[chem];
    crate::sim::economy::step(&mut m.world, 0);
    let workers = m.world.civs[0].labor.food as i64;
    let used = m.world.civs[0].flows.consumed[chem] - before;
    // 150 t a level of 6,000 cultivators: 25 t for every thousand at work
    assert_eq!(used, workers * 25 / 1000, "twenty-five tonnes for every thousand cultivators at work");
    assert!(used > 0 && used <= 4_500);
    assert!(run(&m).missing.is_empty());
    // the better yield feeds the same people with fewer hands
    assert!(m.world.civs[0].stock[food] * workers_plain as i64 > plain * workers, "{} rations from {workers} hands against {plain} from {workers_plain}", m.world.civs[0].stock[food]);
}

/// A seat with one powered workshop region: mills, machine shops and stock to run them.
fn powered_world(mills: u16, shops: u16, mechanics: u32) -> (Match, usize) {
    let mut m = Match::new(cfg("power"), 1);
    know_everything(&mut m.world, 0);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 1_000_000);
    let r = &mut m.world.regions[home];
    r.facilities.clear();
    r.hydro = 40;
    put_works(r, "waterwheel", mills);
    put_works(r, "machine_shop", shops);
    // only mechanics can take the shops' qualified posts in this fixture
    for q in 0..NQ {
        m.world.civs[0].qual_flows.initial[q] -= m.world.regions[home].quals[q] as i64;
        m.world.regions[home].quals[q] = 0;
    }
    endow(&mut m.world, home, Qual::Mechanic, mechanics);
    for (g, n) in [(Good::Food, 50_000_000), (Good::Tools, 5_000_000), (Good::Metal, 5_000_000), (Good::Spares, 1_000_000)] {
        m.world.civs[0].stock[g.index()] = n;
    }
    m.world.civs[0].stock[Good::Components.index()] = 0;
    (m, home)
}

#[test]
fn shaft_service_delivered_never_exceeds_supply() {
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let shop = content().f("machine_shop");
    // one level of mills gives 20; three machine shops fully crewed ask for 90
    let (mut m, home) = powered_world(1, 3, 12_000);
    let before = m.ledger_snapshot();
    crate::sim::economy::step(&mut m.world, 0);
    let p = m.world.regions[home].last.power.clone();
    assert_eq!(p.shaft_made, 20_000);
    assert!(p.shaft_used <= p.shaft_made, "{p:?}");
    assert!(p.shaft_used >= 19_900, "all of what there is gets used: {p:?}");
    let run = m.world.regions[home].fac(shop).unwrap().run.clone().unwrap();
    assert!(run.rate_bp <= 2_223, "the shops run at the two ninths the mills can turn: {run:?}");
    assert_balanced(&before, &m.ledger_snapshot());

    // half the qualified posts filled, and power for half of what those posts ask:
    // the shops get half of their half, not the half of everything that is not there
    let (mut m, home) = powered_world(1, 2, 4_000);
    crate::sim::economy::step(&mut m.world, 0);
    let p = m.world.regions[home].last.power.clone();
    let f = m.world.regions[home].fac(shop).unwrap().clone();
    assert_eq!(f.skilled_bp, 5_000);
    assert!(m.world.regions[home].last.shaft_demand > p.shaft_made, "the shops ask for more than the mills give");
    assert!(p.shaft_used <= p.shaft_made, "{p:?}");
    let run = f.run.unwrap();
    assert_eq!(run.rate_bp as i64 * 60_000 / 10_000, p.shaft_used, "what the shops draw is what their rate takes");
    // components out are what that rate makes, no more
    assert_eq!(m.world.civs[0].flows.produced[Good::Components.index()], 10_000 * 2 * run.rate_bp as i64 / 10_000);
}

#[test]
fn electricity_is_conserved_through_generators_motors_and_the_grid() {
    let mut m = Match::new(cfg("grid"), 1);
    know_everything(&mut m.world, 0);
    let home = m.world.civs[0].capital as usize;
    let far = free_neighbour(&m.world, home, &[]).expect("a free land neighbour");
    m.world.regions[far].owner = Some(0);
    m.world.regions[far].controller = Some(0);
    for ri in [home, far] {
        settle_fixture(&mut m.world, ri, 1_500_000);
        m.world.regions[ri].water = 20_000_000;
        m.world.regions[ri].wild = 20_000_000;
        m.world.regions[ri].facilities.clear();
        m.world.regions[ri].hydro = 40;
        for (q, n) in [(Qual::Electrician, 40_000), (Qual::Mechanic, 40_000), (Qual::Technician, 40_000), (Qual::Smith, 20_000), (Qual::Artisan, 20_000)] {
            endow(&mut m.world, ri, q, n);
        }
    }
    // the outlying region makes electricity it cannot use (its mills have no shaft users
    // either, so a generator hall turns their work); the capital has users and too little
    for (k, lv) in [("hydro", 4), ("waterwheel", 4), ("generator", 1), ("grid", 1)] {
        put_works(&mut m.world.regions[far], k, lv);
    }
    for (k, lv) in [("waterwheel", 6), ("generator", 1), ("grid", 1), ("wire_works", 4), ("machine_shop", 8), ("fab", 2)] {
        put_works(&mut m.world.regions[home], k, lv);
    }
    for g in Good::ALL {
        m.world.civs[0].stock[g.index()] = 20_000_000;
    }
    m.world.civs[0].stock[Good::Components.index()] = 0;
    m.world.civs[0].stock[Good::Electronics.index()] = 0;
    let mut prev = m.ledger_snapshot();
    let mut shared = 0i64;
    for _ in 0..6 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        let (a, b) = (&m.world.regions[far].last.power, &m.world.regions[home].last.power);
        // four levels of mills give 80; one generator hall turns 60 of it into 54 of electricity
        assert_eq!((a.shaft_made, a.shaft_to_generators, a.elec_from_generators), (80_000, 60_000, 54_000), "{a:?}");
        // the surplus region keeps what it uses and offers the rest; the grid loses 8%
        assert!(a.elec_used + a.grid_out <= a.elec_made + a.elec_from_generators, "{a:?}");
        assert!(a.grid_out > 0 && b.grid_in * 100 <= a.grid_out * 92, "{a:?} -> {b:?}");
        assert!(b.elec_used + b.elec_to_motors <= b.elec_made + b.elec_from_generators + b.grid_in, "{b:?}");
        assert!(b.shaft_used <= b.shaft_made - b.shaft_to_generators + b.shaft_from_motors, "{b:?}");
        shared += b.grid_in;
        prev = cur;
    }
    assert!(shared > 0, "electricity crossed the grid");

    // motors: a region with electricity to spare and shafts to turn, and no mill
    let (mut m, home) = powered_world(0, 2, 8_000);
    endow(&mut m.world, home, Qual::Electrician, 20_000);
    m.world.regions[home].facilities.retain(|f| f.kind != content().f("waterwheel"));
    put_works(&mut m.world.regions[home], "hydro", 2);
    let before = m.ledger_snapshot();
    crate::sim::economy::step(&mut m.world, 0);
    let p = m.world.regions[home].last.power.clone();
    assert_eq!(p.elec_made, 180_000, "{p:?}");
    // two machine shops ask for 60 of shaft work: the motors deliver it and draw ten ninths
    assert_eq!((p.shaft_made, p.shaft_from_motors, p.elec_to_motors), (0, 60_000, 66_667), "{p:?}");
    assert!(p.shaft_from_motors * 10 <= p.elec_to_motors * 9);
    assert!(p.shaft_used > 0 && p.shaft_used <= p.shaft_from_motors, "{p:?}");
    assert_balanced(&before, &m.ledger_snapshot());
}

#[test]
fn compute_used_never_exceeds_what_was_installed_the_month_before() {
    let mut m = Match::new(cfg("compute"), 1);
    know_everything(&mut m.world, 0);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 2_000_000);
    let r = &mut m.world.regions[home];
    r.water = 20_000_000;
    r.wild = 20_000_000;
    r.hydro = 40;
    r.facilities.clear();
    for (k, lv) in [("hydro", 10), ("datacenter", 1), ("advanced_lab", 3), ("auto_lab", 2)] {
        put_works(r, k, lv);
    }
    for (q, n) in [(Qual::Electrician, 60_000), (Qual::Mechanic, 60_000), (Qual::Technician, 80_000), (Qual::Programmer, 80_000), (Qual::Scientist, 120_000), (Qual::AiEngineer, 20_000)] {
        endow(&mut m.world, home, q, n);
    }
    for g in Good::ALL {
        m.world.civs[0].stock[g.index()] = 20_000_000;
    }
    let mut prev = m.ledger_snapshot();
    let mut used_total = 0;
    for month in 1..=6 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        let civ = &m.world.civs[0];
        assert!(civ.compute_used <= prev.civs[0].compute_supply, "month {month}: used {} of {}", civ.compute_used, prev.civs[0].compute_supply);
        if month == 1 {
            assert_eq!(civ.compute_used, 0, "nothing was installed before the first month");
            assert!(civ.compute_supply > 0);
        }
        // the labs ask for far more compute than one centre gives: every unit is used
        if month > 1 {
            assert!(civ.compute_demand > prev.civs[0].compute_supply);
            assert!(civ.compute_used * 100 >= prev.civs[0].compute_supply * 99, "month {month}: used {} of {}", civ.compute_used, prev.civs[0].compute_supply);
        }
        // research comes from the people in research posts and from nowhere else
        let staff: i64 = m.world.regions[home].facilities.iter().filter(|f| content().facilities[f.kind].recipes.iter().any(|r| r.research.is_some())).map(|f| f.staffed as i64).sum();
        assert!(civ.research_cap.iter().sum::<i64>() <= staff);
        used_total += civ.compute_used;
        prev = cur;
    }
    assert!(used_total > 0);
}

#[test]
fn project_work_comes_only_from_called_up_workers_and_research_only_from_staffed_posts() {
    let c = content();
    let mut m = Match::new(cfg("work"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    // builders are called up first, as the site crews of the orders that need them;
    // each of them supplies one worker-month like anyone else
    endow(&mut m.world, home, Qual::Builder, 30_000);
    m.world.regions[home].forest = 30;
    m.world.civs[0].tech[c.t("T021")].state = ST_ADOPTED;
    let r = m.act(0, vec![
        Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "camp".into(), levels: 8 }, priority: None },
        Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "waterworks".into(), levels: 4 }, priority: None },
    ]);
    assert!(r.iter().all(|x| x.status == "accepted"), "{:?}", r);
    let work_needed: i64 = m.world.civs[0].projects.iter().map(|p| p.work_needed).sum();
    let mut prev = m.ledger_snapshot();
    let mut done_total = 0;
    for _ in 0..4 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        let last = &m.world.regions[home].last;
        // a called-up worker supplies at most the month's construction factor (design 36, 4.2)
        assert!((10_000..=15_000).contains(&last.construction_bp), "{}", last.construction_bp);
        assert!(last.project_work_done <= last.labor.projects as i64 * last.construction_bp as i64 / 10_000, "{} worker-months from {} workers", last.project_work_done, last.labor.projects);
        // the waterworks hold two thousand builders; the camps hold none, and no
        // builder is called up beyond the crews
        let crew: u32 = m.world.civs[0].projects.iter().map(|p| p.crew_counts().1).sum();
        assert_eq!(crew, 2_000);
        assert!(crew <= last.labor.projects);
        assert!(last.qual_employed[Qual::Builder.index()] >= crew);
        // nobody's month is counted twice: what the open orders accepted is in the
        // region's account, which is at most one worker-month for each crew member
        // and each other worker called up
        let accepted: i64 = m.world.civs[0].projects.iter().map(|p| p.last_progress).sum();
        assert!(accepted > 0 && accepted <= last.project_work_done);
        done_total += last.project_work_done;
        prev = cur;
    }
    assert!(done_total > 0 && done_total <= work_needed);
    // research: each person in a research post supplies at most one researcher-month,
    // times the research effectiveness of the seat's institutions
    let civ = &m.world.civs[0];
    let circle = m.world.regions[home].fac(c.f("makers_circle")).unwrap();
    assert_eq!(civ.research_cap.iter().sum::<i64>(), circle.staffed as i64 * crate::sim::knowledge::research_effectiveness(civ) / 10_000);
    // an unstaffed circle supplies nothing, whatever the installation could support
    for q in 0..NQ {
        let n = m.world.regions[home].quals[q];
        m.world.regions[home].quals[q] = 0;
        m.world.civs[0].qual_flows.initial[q] -= n as i64;
    }
    crate::sim::economy::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].research_cap.iter().sum::<i64>(), 0);
    // a government that controls no region has no researchers at all
    m.world.regions[home].controller = Some(1);
    crate::sim::economy::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].research_cap.iter().sum::<i64>(), 0);
    assert_eq!(m.world.civs[0].compute_supply, 0);
}

#[test]
fn recruits_and_fallen_militia_take_their_qualifications_with_them() {
    let mut m = Match::new(cfg("enlist"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    let working = m.world.regions[home].working();
    let (lore, art) = (m.world.regions[home].quals[Qual::Lorekeeper.index()], m.world.regions[home].quals[Qual::Artisan.index()]);
    let people = m.ledger_snapshot().people;
    let taken = crate::sim::population::draw_adults(&mut m.world, home, 12_000);
    assert_eq!(taken, 12_000);
    let r = &m.world.regions[home];
    assert_eq!(r.working(), working - 12_000);
    // the recruits' share of every qualification lapses, and is written to the ledger
    let lost_lore = (lore as u64 * 12_000 / working as u64) as u32;
    let lost_art = (art as u64 * 12_000 / working as u64) as u32;
    assert!(lost_lore > 0 && lost_art > 0);
    assert_eq!(r.quals[Qual::Lorekeeper.index()], lore - lost_lore);
    assert_eq!(r.quals[Qual::Artisan.index()], art - lost_art);
    let ledger = &m.world.civs[0].qual_flows;
    assert_eq!(ledger.enlisted[Qual::Lorekeeper.index()], lost_lore as i64);
    assert_eq!(ledger.enlisted[Qual::Artisan.index()], lost_art as i64);
    let snap = m.ledger_snapshot();
    for q in 0..NQ {
        assert_eq!(snap.civs[0].holders[q], snap.civs[0].qual_flows.balance(q));
    }
    // (the drawn adults are not in a formation in this fixture: they are simply gone from the count)
    assert_eq!(snap.people, people - 12_000);
    // discharged soldiers come home as ordinary adults: nobody regains a qualification
    crate::sim::population::return_adults(&mut m.world.regions[home], 0, 12_000);
    assert_eq!(m.world.regions[home].quals[Qual::Artisan.index()], art - lost_art);
    assert_eq!(m.ledger_snapshot().people, people);

    // through the real order: a formation is raised, and the world loses nobody
    // (a world whose capital can call up the muster: in some worlds of ruleset
    // 3.0.0-s6c and -s10 the last worker-month waits on call-up for a long time)
    let mut m = Match::new(cfg("enlist-f"), 1);
    let capital = m.world.civs[0].capital;
    let before = m.ledger_snapshot();
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Recruit { region: capital, role: Role::Denial, soldiers: 8_000, tier: 0 }, priority: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    let mut prev = before;
    for _ in 0..6 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        prev = cur;
    }
    assert_eq!(m.world.armies.iter().filter(|a| a.owner == 0).map(|a| a.count()).sum::<u32>(), 8_000);
    assert!(m.world.civs[0].qual_flows.enlisted.iter().sum::<i64>() > 0);
}

#[test]
fn learners_and_instructors_never_outnumber_the_people_who_exist() {
    let mut m = Match::new(cfg("roles"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    let far = free_neighbour(&m.world, home, &[]).expect("a free land neighbour");
    m.world.regions[far].owner = Some(0);
    m.world.regions[far].controller = Some(0);
    settle_fixture(&mut m.world, far, 60_000);
    put_works(&mut m.world.regions[home], "lodge", 4);
    // a cohort of artisans' apprentices with real instructors
    let r = m.act(0, vec![Action::StartProgram { region: capital, course: "E002".into(), seats: 12_000 }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    crate::sim::step_month(&mut m.world);
    let (students, teachers) = (m.world.regions[home].students, m.world.regions[home].teachers[Qual::Artisan.index()]);
    assert!(students > 0 && teachers > 0, "{:?}", m.world.civs[0].programs[0].blockers);
    assert_eq!(students, crate::sim::population::enrolled_in(&m.world, home));
    // nearly everyone is ordered away: learners and instructors stay with the course
    // while there are people to back them, and what cannot be backed leaves with the movers
    let before = m.ledger_snapshot();
    let pop = m.world.regions[home].population();
    let moved = crate::sim::population::move_people(&mut m.world, home, far, pop, false);
    assert_eq!(moved, pop - 10_000, "ten thousand always stay");
    let snap = m.ledger_snapshot();
    assert_balanced(&before, &snap);
    let r = &m.world.regions[home];
    let roles: u32 = r.quals.iter().sum::<u32>() + r.students;
    assert!(roles <= r.working(), "{roles} roles, {} of working age", r.working());
    assert!(r.students < students, "most learners went with their families");
    assert_eq!(r.students, crate::sim::population::enrolled_in(&m.world, home));
    for q in 0..NQ {
        assert!(r.teachers[q] <= r.quals[q]);
    }
    // the holders went with the people: none was lost, none was made
    let held: u32 = m.world.regions.iter().map(|r| r.quals.iter().sum::<u32>()).sum();
    let held_before: i64 = before.regions.iter().map(|r| r.quals.iter().map(|x| *x as i64).sum::<i64>()).sum();
    assert_eq!(held as i64, held_before);
    // a calamity takes nine in ten of the working-age people who stayed: the cohort
    // shrinks to those who are left, then the holders, and every holder lost is booked
    let before = m.ledger_snapshot();
    let mut dead = 0u32;
    for b in m.world.regions[home].blocks.iter_mut() {
        for age in WORK_MIN_AGE..=WORK_MAX_AGE {
            let d = b.ages[age] - b.ages[age] / 10;
            b.ages[age] -= d;
            dead += d;
        }
    }
    m.world.civs[0].flows.deaths += dead;
    let (learners, holders) = (m.world.regions[home].students, m.world.regions[home].quals.iter().sum::<u32>());
    assert!(learners + holders > m.world.regions[home].working(), "the fixture leaves roles unbacked");
    crate::sim::population::reconcile_roles(&mut m.world, home, QualExit::Died);
    let r = &m.world.regions[home];
    assert!(r.quals.iter().sum::<u32>() + r.students <= r.working());
    assert_eq!(r.students, crate::sim::population::enrolled_in(&m.world, home));
    assert!(r.students < learners || learners == 0, "learners dropped out first");
    for q in 0..NQ {
        assert!(r.teachers[q] <= r.quals[q]);
    }
    let after = m.ledger_snapshot();
    assert_balanced(&before, &after);
    let lost = holders - r.quals.iter().sum::<u32>();
    assert_eq!(after.civs[0].qual_flows.died.iter().sum::<i64>() - before.civs[0].qual_flows.died.iter().sum::<i64>(), lost as i64);
    // and ordinary deaths cannot leave more learners than people either
    for _ in 0..6 {
        let prev = m.ledger_snapshot();
        crate::sim::step_month(&mut m.world);
        assert_balanced(&prev, &m.ledger_snapshot());
    }
}

#[test]
fn learners_die_with_everybody_else() {
    let mut m = Match::new(cfg("learner-deaths"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    put_works(&mut m.world.regions[home], "lodge", 4);
    let r = m.act(0, vec![Action::StartProgram { region: capital, course: "E002".into(), seats: 12_000 }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    crate::sim::step_month(&mut m.world);
    let enrolled = m.world.civs[0].programs[0].enrolled;
    assert!(enrolled >= 8_000, "{:?}", m.world.civs[0].programs[0].blockers);
    // six ordinary months of a twelve-month course: nobody graduates, a few learners die
    let mut expected = enrolled;
    for _ in 0..6 {
        let working = m.world.regions[home].working();
        let deaths_before = m.world.civs[0].flows.deaths;
        let before: u32 = m.world.regions[home].blocks.iter().map(|b| b.working()).sum();
        crate::sim::step_month(&mut m.world);
        assert!(m.world.civs[0].flows.deaths > deaths_before);
        // the cohort loses the share of itself that the working-age population lost to death
        // (ageing happens once a year and is not in these six months)
        let after: u32 = m.world.regions[home].blocks.iter().map(|b| b.working()).sum();
        let working_deaths = before - after;
        expected -= (expected as u64 * working_deaths as u64 / working as u64) as u32;
    }
    let p = &m.world.civs[0].programs[0];
    assert_eq!(p.graduates, 0);
    assert!(p.enrolled < enrolled, "learners are not immune to death");
    assert_eq!(p.enrolled, expected);
    assert_eq!(m.world.regions[home].students, p.enrolled);
}

#[test]
fn copy_houses_make_media_only_from_a_staffed_precinct_and_real_material() {
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let c = content();
    let mut m = Match::new(cfg("copy-houses"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    m.world.religions.push(Religion { name: "The Reed Measure".into(), founder: 0, founded: 1, holy_region: capital, beliefs: vec!["grain_oath".into(), "remembrance".into(), "copy_houses".into(), "hearth_rites".into()] });
    for b in m.world.regions[home].blocks.iter_mut() {
        b.religion = Some(0);
    }
    put_works(&mut m.world.regions[home], "holy_site", 1);
    let (media, mat) = (Good::Media.index(), Good::Materials.index());
    let precinct = c.f("holy_site");
    // staffed by the economy this month: 4,000 posts, all filled
    crate::sim::economy::step(&mut m.world, 0);
    assert_eq!(m.world.regions[home].fac(precinct).unwrap().staffed, 4_000);
    let (mat0, used0) = (m.world.civs[0].stock[mat], m.world.civs[0].flows.consumed[mat]);
    crate::sim::culture::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].stock[media], 2_000);
    assert_eq!(m.world.civs[0].flows.produced[media], 2_000, "it is production, on the ledger");
    assert_eq!(mat0 - m.world.civs[0].stock[mat], 667, "a tonne of writing material for every three lots");
    assert_eq!(m.world.civs[0].flows.consumed[mat] - used0, 667);
    // half the posts filled: half the copies
    m.world.regions[home].fac_mut(precinct).unwrap().staffed = 2_000;
    crate::sim::culture::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].stock[media], 3_000);
    // nobody at the desks: nothing
    m.world.regions[home].fac_mut(precinct).unwrap().staffed = 0;
    crate::sim::culture::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].stock[media], 3_000);
    // desks full but no material: nothing
    m.world.regions[home].fac_mut(precinct).unwrap().staffed = 4_000;
    m.world.civs[0].stock[mat] = 0;
    crate::sim::culture::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].stock[media], 3_000);
    // a third of the material: a third of the copies
    m.world.civs[0].stock[mat] = 222;
    crate::sim::culture::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].stock[media], 3_000 + 2_000 * 222 / 667);
    assert_eq!(m.world.civs[0].stock[mat], 0);
}

#[test]
fn treaty_goods_and_tribute_leave_one_stock_and_enter_another() {
    let mut m = Match::new(cfg("tribute"), 1);
    know_everything(&mut m.world, 0);
    know_everything(&mut m.world, 1);
    let id = m.world.id();
    m.world.offers.push(Offer { id, from: 0, to: 1, clauses: vec![Clause::Goods { from: 0, good: Good::Food, amount_per_month: 40_000, months: 6 }, Clause::Goods { from: 1, good: Good::Tools, amount_per_month: 1_000_000, months: 2 }, Clause::Subordination { from: 1, tribute_bp: 2000 }], text: String::new(), created: 0, expires_round: 9, status: "open".into() });
    let ix = m.world.offers.len() - 1;
    crate::sim::diplomacy::activate(&mut m.world, ix).expect("the treaty activates");
    m.world.civs[1].last_flows.produced[Good::Food.index()] = 1_200_000;
    let mut prev = m.ledger_snapshot();
    for month in 1..=8 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        if month == 1 {
            let (a, b) = (&m.world.civs[0].flows, &m.world.civs[1].flows);
            // the food clause is met in full; the tool clause delivers the 45,000 lots there are
            assert_eq!(a.traded_out[Good::Food.index()], 40_000);
            assert_eq!(a.traded_in[Good::Tools.index()], 45_000);
            assert_eq!(b.traded_out[Good::Tools.index()], 45_000);
            // tribute: a fifth of last round's monthly food output, out of the subordinate's own stock
            assert_eq!(a.traded_in[Good::Food.index()], 1_200_000 / 12 * 2000 / 10_000);
            assert_eq!(b.traded_out[Good::Food.index()], 1_200_000 / 12 * 2000 / 10_000);
        }
        prev = cur;
    }
}

#[test]
fn an_eliminated_polity_loses_its_stores_and_nobody_vanishes() {
    let mut m = Match::new(cfg("elimination"), 1);
    let c = content();
    let capital = m.world.civs[3].capital;
    let home = capital as usize;
    put_works(&mut m.world.regions[home], "lodge", 2);
    endow(&mut m.world, home, Qual::Tallier, 9_000);
    for id in ["T025", "T026"] {
        m.world.civs[3].tech[c.t(id)].state = ST_ADOPTED;
    }
    // a founding cohort of talliers learning to keep records, and a formation in the field
    assert_eq!(m.act(3, vec![Action::StartProgram { region: capital, course: "E006".into(), seats: 3_000 }])[0].status, "accepted");
    m.world.civs[3].programs[0].paused = false;
    assert_eq!(m.act(3, vec![Action::StartProject { spec: ProjectSpec::Recruit { region: capital, role: Role::Assault, soldiers: 5_000, tier: 0 }, priority: None }])[0].status, "accepted");
    let mut prev = m.ledger_snapshot();
    for _ in 0..6 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        prev = cur;
    }
    assert_eq!(m.world.armies.iter().filter(|a| a.owner == 3).map(|a| a.count()).sum::<u32>(), 5_000);
    let learners = m.world.regions[home].students;
    // it cedes its only region to seat 2 and ceases to govern
    let id = m.world.id();
    m.world.offers.push(Offer { id, from: 3, to: 2, clauses: vec![Clause::CedeRegion { from: 3, region: capital }], text: String::new(), created: 0, expires_round: 99, status: "open".into() });
    let ix = m.world.offers.len() - 1;
    crate::sim::diplomacy::activate(&mut m.world, ix).expect("the cession takes effect");
    let ceded = m.ledger_snapshot();
    // the residents' qualifications changed ledgers with the land
    assert!(ceded.civs[2].qual_flows.moved_in.iter().sum::<i64>() > 0);
    assert_eq!(ceded.civs[2].qual_flows.moved_in, ceded.civs[3].qual_flows.moved_out);
    assert!(ledger::violations(&prev, &ceded).is_empty(), "{:?}", ledger::violations(&prev, &ceded));
    let food_before = m.world.civs[3].stock[Good::Food.index()];
    let lost_before = m.world.civs[3].flows.lost[Good::Food.index()];
    crate::sim::step_month(&mut m.world);
    let after = m.ledger_snapshot();
    assert_balanced(&ceded, &after);
    assert_eq!(m.world.civs[3].status, SeatStatus::Eliminated);
    // its soldiers live on as residents; its stores are booked as lost; its course is closed
    assert_eq!(after.civs[3].soldiers, 0);
    assert!(m.world.civs[3].stock.iter().all(|v| *v == 0));
    assert!(food_before > 0 && m.world.civs[3].flows.lost[Good::Food.index()] - lost_before > 0);
    assert!(m.world.civs[3].programs.is_empty());
    assert_eq!(m.world.regions[home].students, 0, "{learners} learners went back to what they were");
    if learners > 0 {
        assert_eq!(after.civs[2].qual_flows.returned[Qual::Tallier.index()], learners as i64);
    }
    for _ in 0..12 {
        let prev = m.ledger_snapshot();
        crate::sim::step_month(&mut m.world);
        assert_balanced(&prev, &m.ledger_snapshot());
    }
}

#[test]
fn the_audit_notices_goods_people_and_qualifications_from_nothing() {
    // the audit is only worth something if it fails when the books are cooked
    let mut m = Match::new(cfg("audit"), 1);
    let home = m.world.civs[0].capital as usize;
    let clean = m.ledger_snapshot();
    assert!(ledger::violations(&clean, &clean).is_empty());
    let cooked = |f: &dyn Fn(&mut World)| -> Vec<String> {
        let mut w = m.world.clone();
        f(&mut w);
        ledger::violations(&clean, &ledger::snapshot(&w, false))
    };
    let has = |v: &Vec<String>, what: &str| v.iter().any(|s| s.contains(what));
    let v = cooked(&|w| w.civs[0].stock[Good::Metal.index()] += 1);
    assert!(has(&v, "stock changed by 1"), "{v:?}");
    let v = cooked(&|w| w.civs[0].flows.traded_in[Good::Food.index()] += 5);
    assert!(has(&v, "more was received in trade"), "{v:?}");
    let v = cooked(&|w| w.regions[home].quals[Qual::Scientist.index()] += 1);
    assert!(has(&v, "its ledger accounts for 0"), "{v:?}");
    let v = cooked(&|w| w.civs[0].qual_flows.trained[Qual::Smith.index()] += 1);
    assert!(has(&v, "Smith"), "{v:?}");
    let v = cooked(&|w| w.regions[home].blocks[0].ages[30] += 1);
    assert!(has(&v, "people changed by 1"), "{v:?}");
    let v = cooked(&|w| w.regions[home].students = w.regions[home].working());
    assert!(has(&v, "residents of working age") && has(&v, "programmes enrol"), "{v:?}");
    let v = cooked(&|w| w.regions[home].teachers[Qual::Artisan.index()] = 1_000_000);
    assert!(has(&v, "instructors"), "{v:?}");
    let v = cooked(&|w| {
        w.regions[home].last.seat = Some(0);
        w.regions[home].last.power.shaft_used = 1;
    });
    assert!(has(&v, "shaft work used exceeds supply"), "{v:?}");
    let v = cooked(&|w| {
        w.regions[home].last.seat = Some(0);
        w.regions[home].last.power.grid_in = 93;
        w.regions[home].last.power.grid_out = 100;
        w.regions[home].last.power.elec_made = 100;
    });
    assert!(has(&v, "the grid delivered"), "{v:?}");
    let v = cooked(&|w| w.regions[home].last.project_work_done = w.regions[home].last.labor.projects as i64 + 1);
    assert!(has(&v, "worker-months"), "{v:?}");
    // construction sites: power from nowhere, engines that burned nothing, crews nobody called up
    let v = cooked(&|w| {
        w.regions[home].last.seat = Some(0);
        w.regions[home].last.power.site_from_supply = 1;
    });
    assert!(has(&v, "shaft work used exceeds supply"), "{v:?}");
    let v = cooked(&|w| {
        w.regions[home].last.seat = Some(0);
        w.regions[home].last.power.site_coal = 3;
        w.regions[home].last.power.site_from_engines = 16;
    });
    assert!(has(&v, "site engines delivered more than their fuel gives"), "{v:?}");
    let v = cooked(&|w| {
        w.regions[home].last.seat = Some(0);
        let capital = w.civs[0].capital;
        w.civs[0].projects.push(Project {
            id: 77,
            kind: ProjKind::FtlTrial,
            region: Some(capital),
            work_needed: 1000,
            work_done: 0,
            inputs: vec![],
            priority: 5,
            paused: false,
            started: 0,
            last_progress: 0,
            blockers: vec![],
            max_per_month: 1000,
            crew: vec![(vec![Qual::Builder], 10)],
            crew_on_site: vec![w.regions[home].last.labor.projects + 1],
            crew_capped: false,
            power_need: 0,
            power_bp: 0,
            min_months: 1,
            order_key: 0,
        });
    });
    assert!(has(&v, "site crews of"), "{v:?}");
    let v = cooked(&|w| w.regions[home].last.labor.facilities = w.regions[home].last.labor.working_age + 1);
    assert!(has(&v, "roles were given to"), "{v:?}");
    let v = cooked(&|w| w.civs[0].research_used[0] = w.civs[0].research_cap[0] + 1);
    assert!(has(&v, "researcher-months"), "{v:?}");
    let v = cooked(&|w| w.civs[0].flows.produced[Good::Coal.index()] += 7);
    assert!(has(&v, "the deposits delivered 0"), "{v:?}");
    let with_deposit = m.world.regions.iter().position(|r| !r.deposits.is_empty()).expect("a deposit somewhere");
    let v = cooked(&|w| w.regions[with_deposit].deposits[0].delivered += 3);
    assert!(has(&v, "delivered from 0 drawn"), "{v:?}");
    let v = cooked(&|w| w.regions[with_deposit].deposits[0].remaining += 3);
    assert!(has(&v, "the deposit fell by -3"), "{v:?}");
    // compute: used this month against what was installed the month before
    m.world.civs[0].compute_supply = 10;
    let before = m.ledger_snapshot();
    crate::sim::step_month(&mut m.world);
    m.world.civs[0].compute_used = 11;
    let v = ledger::violations(&before, &m.ledger_snapshot());
    assert!(has(&v, "used 11 compute; 10 was installed"), "{v:?}");
}

#[test]
fn ledger_fields_default_when_a_save_does_not_have_them() {
    let mut m = Match::new(cfg("ledger-defaults"), 1);
    run_rounds(&mut m, 2);
    let mut v: serde_json::Value = serde_json::from_str(&m.save_json()).unwrap();
    for civ in v["civs"].as_array_mut().unwrap() {
        let civ = civ.as_object_mut().unwrap();
        civ.remove("qual_flows");
        civ.remove("compute_used");
        civ["flows"].as_object_mut().unwrap().remove("lost");
        civ["last_flows"].as_object_mut().unwrap().remove("lost");
    }
    for r in v["regions"].as_array_mut().unwrap() {
        let last = r["last"].as_object_mut().unwrap();
        last.remove("power");
        last.remove("project_work_done");
        last.remove("seat");
        for d in r["deposits"].as_array_mut().unwrap() {
            d.as_object_mut().unwrap().remove("drawn");
            d.as_object_mut().unwrap().remove("delivered");
        }
    }
    let mut old = Match::load_json(&v.to_string()).expect("the fields are optional");
    assert_eq!(old.world.civs[0].flows.lost.len(), NG);
    assert_eq!(old.world.civs[0].qual_flows, QualFlows::default());
    // and such a world still runs, and still shows the ledger line in the observation
    run_rounds(&mut old, 1);
    let line = old.observe(0).civ.goods.into_iter().find(|g| g.good == Good::Food).unwrap();
    assert!(line.lost > 0, "food spoiled last round and the observation says so");
    // an observation written before `lost` existed still parses
    let mut o = serde_json::to_value(old.observe(0)).unwrap();
    for g in o["civ"]["goods"].as_array_mut().unwrap() {
        g.as_object_mut().unwrap().remove("lost");
    }
    let parsed: Observation = serde_json::from_value(o).unwrap();
    assert!(parsed.civ.goods.iter().all(|g| g.lost == 0));
}

/// A world in which every seat has an industrial region, a second region, schools,
/// mines, power and stores: enough for every ledger channel to move without waiting
/// for a policy to build it.
fn industrial_world(seed: &str) -> (Match, Vec<usize>, Vec<Option<usize>>) {
    let mut m = Match::new(cfg(seed), 1);
    let capitals: Vec<usize> = m.world.civs.iter().map(|c| c.capital as usize).collect();
    let mut taken: Vec<usize> = capitals.clone();
    let mut seconds: Vec<Option<usize>> = Vec::new();
    for s in 0..4usize {
        know_everything(&mut m.world, s);
        let home = capitals[s];
        settle_fixture(&mut m.world, home, 3_000_000);
        {
            let r = &mut m.world.regions[home];
            r.water = 30_000_000;
            r.arable = 40;
            r.forest = 30;
            r.hydro = 40;
            for (kind, amount) in [(Deposit::CopperOre, 5_000_000), (Deposit::IronOre, 5_000_000), (Deposit::Coal, 8_000_000), (Deposit::Crude, 5_000_000), (Deposit::UraniumOre, 30_000)] {
                r.deposits.retain(|d| d.kind != kind);
                r.deposits.push(DepositState::new(kind, amount, 8000));
            }
            r.facilities.clear();
            for (k, lv) in [
                ("fields", 20), ("granary", 2), ("camp", 2), ("mine_copper", 2), ("mine_iron", 2), ("mine_coal", 3), ("quarry", 1), ("oilwell", 1), ("workshop", 2), ("kiln", 1),
                ("copper_smelter", 1), ("bloomery", 1), ("steelworks", 1), ("machine_shop", 1), ("parts_works", 1), ("wire_works", 1), ("chem_plant", 1), ("insulation_works", 1), ("refinery", 1),
                ("press", 1), ("instrument_shop", 1), ("waterwheel", 3), ("steam", 2), ("generator", 1), ("hydro", 2), ("grid", 1), ("fab", 1), ("computer_works", 1), ("datacenter", 1),
                ("lodge", 4), ("school", 2), ("college", 1), ("tech_institute", 1), ("makers_circle", 1), ("archive", 1), ("laboratory", 1), ("advanced_lab", 1), ("clinic", 1), ("barracks", 1), ("roads", 1),
            ] {
                put_works(r, k, lv);
            }
        }
        for (q, n) in [
            (Qual::Artisan, 60_000), (Qual::Smith, 20_000), (Qual::Mechanic, 30_000), (Qual::Technician, 40_000), (Qual::Electrician, 15_000), (Qual::Scribe, 20_000), (Qual::Literate, 30_000),
            (Qual::Scholar, 20_000), (Qual::Researcher, 20_000), (Qual::Scientist, 30_000), (Qual::Programmer, 15_000), (Qual::Teacher, 10_000), (Qual::Physician, 5_000), (Qual::Builder, 20_000), (Qual::Agronomist, 10_000),
        ] {
            endow(&mut m.world, home, q, n);
        }
        for (g, n) in [
            (Good::Food, 30_000_000), (Good::Materials, 2_000_000), (Good::Tools, 500_000), (Good::Metal, 300_000), (Good::Components, 100_000), (Good::Spares, 100_000), (Good::Conductors, 50_000),
            (Good::Insulation, 20_000), (Good::Electronics, 100_000), (Good::Hardware, 20_000), (Good::Media, 100_000), (Good::Instruments, 50_000), (Good::Chemicals, 50_000), (Good::Fuel, 50_000), (Good::Medicine, 10_000),
        ] {
            m.world.civs[s].stock[g.index()] = n;
        }
        // seats 0 and 1 also hold an outlying region with its own power, a camp, a mine and a lodge
        let second = if s < 2 { free_neighbour(&m.world, home, &taken) } else { None };
        if let Some(far) = second {
            taken.push(far);
            m.world.regions[far].owner = Some(s as SeatId);
            m.world.regions[far].controller = Some(s as SeatId);
            settle_fixture(&mut m.world, far, 400_000);
            let r = &mut m.world.regions[far];
            r.water = 10_000_000;
            r.wild = 3_000_000;
            r.forest = 20;
            r.hydro = 20;
            r.deposits.retain(|d| d.kind != Deposit::IronOre);
            r.deposits.push(DepositState::new(Deposit::IronOre, 3_000_000, 6000));
            for (k, lv) in [("camp", 2), ("mine_iron", 1), ("hydro", 2), ("grid", 1), ("lodge", 2), ("machine_shop", 1)] {
                put_works(r, k, lv);
            }
            for (q, n) in [(Qual::Electrician, 6_000), (Qual::Literate, 20_000), (Qual::Artisan, 4_000)] {
                endow(&mut m.world, far, q, n);
            }
        }
        seconds.push(second);
    }
    (m, capitals, seconds)
}

/// Thirty scripted rounds (360 months) with no policy at all: courses, recruitment,
/// settlement, resettlement, a war with militia losses, a captured region, a broken
/// formation, a treaty with deliveries and tribute, a cession and an elimination.
/// The books are checked after the decisions of every round and at the close of
/// every month, exactly as in the all-AI audit.
#[test]
fn a_scripted_match_balances_every_month_for_thirty_years() {
    let c = content();
    let (mut m, capitals, seconds) = industrial_world("ledgers");
    let (far0, far1) = (seconds[0].expect("seat 0 has a second region"), seconds[1].expect("seat 1 has a second region"));
    let accept = |r: Vec<Receipt>| {
        for x in &r {
            assert_eq!(x.status, "accepted", "{}: {}", x.action, x.reason);
        }
    };
    // ---- round 1: every seat opens courses, raises a formation and orders works --------
    for s in 0..4u8 {
        let capital = capitals[s as usize] as RegionId;
        accept(m.act(
            s,
            vec![
                Action::StartProgram { region: capital, course: "E002".into(), seats: 8_000 },
                Action::StartProgram { region: capital, course: "E006".into(), seats: 4_000 },
                Action::StartProgram { region: capital, course: "E010".into(), seats: 4_000 },
                Action::StartProgram { region: capital, course: "E015".into(), seats: 4_000 },
                Action::StartProgram { region: capital, course: "E019".into(), seats: 3_000 },
                // seat 0 raises enough to overwhelm an outlying region's militia three to one
                Action::StartProject { spec: ProjectSpec::Recruit { region: capital, role: Role::Assault, soldiers: if s == 0 { 60_000 } else { 20_000 }, tier: 0 }, priority: None },
                Action::StartProject { spec: ProjectSpec::Recruit { region: capital, role: Role::Denial, soldiers: 6_000, tier: 0 }, priority: None },
                Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "camp".into(), levels: 2 }, priority: None },
                // works with site crews and site power: the capital's mills and engines turn for them
                Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "steelworks".into(), levels: 1 }, priority: None },
                Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "waterworks".into(), levels: 2 }, priority: None },
            ],
        ));
    }
    // seats 0 and 1 also build where there is no shaft power at all: site engines burn fuel
    for (s, far) in [(0u8, far0), (1u8, far1)] {
        accept(m.act(s, vec![Action::StartProject { spec: ProjectSpec::Build { region: far as RegionId, facility: "parts_works".into(), levels: 1 }, priority: None }]));
    }
    // seat 1 teaches letters in its outlying region, with nobody there able to teach yet
    accept(m.act(1, vec![Action::StartProgram { region: far1 as RegionId, course: "E006".into(), seats: 4_000 }]));
    // seat 0 settles new land and moves people to its outlying region
    let new_land = free_neighbour(&m.world, capitals[0], &[far0, far1]).or_else(|| free_neighbour(&m.world, far0, &[far1]));
    if let Some(land) = new_land {
        m.world.civs[0].memory[land].seen = true;
        m.world.civs[0].memory[land].owner = None;
        let from = if m.world.link(capitals[0], land).is_some() { capitals[0] } else { far0 };
        accept(m.act(0, vec![Action::StartProject { spec: ProjectSpec::Settle { from: from as RegionId, to: land as RegionId, people: 40_000 }, priority: None }]));
    }
    accept(m.act(0, vec![Action::StartProject { spec: ProjectSpec::Resettle { from: capitals[0] as RegionId, to: far0 as RegionId, people: 100_000 }, priority: None }]));

    m.record_ledgers(true);
    let mut prev = m.ledger_snapshot();
    let mut seen_lost = vec![0i64; NG];
    let mut seen_traded = 0i64;
    let mut seen_grid = 0i64;
    let mut seen_work = 0i64;
    let (mut seen_crew, mut seen_site_supply, mut seen_site_engines) = (0i64, 0i64, 0i64);
    let mut months = 0;
    for round in 1..=30u32 {
        match round {
            3 => {
                // war: seat 0's assault formation stands in seat 1's outlying region
                crate::sim::military::declare_war(&mut m.world, 0, 1, "Scripted.");
                let army = m.world.armies.iter_mut().find(|a| a.owner == 0 && a.soldiers[Role::Assault.index()] > 0).expect("seat 0 raised its formation");
                assert_eq!(army.training_left, 0);
                army.region = far1 as RegionId;
                // with the newest arms: the militia of a civilization that knows
                // everything fights two generations below its best (design chapter 37, 2.4)
                army.tier = 7;
            }
            4 => {
                // seat 1's formation marches into seat 0's capital, where the militia breaks it
                let army = m.world.armies.iter_mut().find(|a| a.owner == 1 && a.soldiers[Role::Assault.index()] > 0).expect("seat 1 raised its formation");
                army.region = capitals[0] as RegionId;
            }
            5 => {
                // seat 0 closes a course in mid-term and disbands its second formation
                let p = m.world.civs[0].programs.iter().find(|p| p.course == c.course_ix["E015"]).expect("the mechanics' course").id;
                let a = m.world.armies.iter().find(|a| a.owner == 0 && a.soldiers[Role::Denial.index()] > 0).expect("the second formation").id;
                accept(m.act(0, vec![Action::ManageProgram { program: p, op: ManageOp::Cancel, seats: None }, Action::MilitaryOrder { army: a, order: ArmyOrder::Disband }]));
            }
            6 => {
                // seats 2 and 3 sign deliveries and a charter with tribute
                let id = m.world.id();
                m.world.offers.push(Offer {
                    id,
                    from: 2,
                    to: 3,
                    clauses: vec![Clause::Goods { from: 2, good: Good::Food, amount_per_month: 100_000, months: 24 }, Clause::Goods { from: 3, good: Good::Materials, amount_per_month: 50_000, months: 1 }, Clause::Subordination { from: 3, tribute_bp: 1000 }],
                    text: String::new(),
                    created: m.world.month,
                    expires_round: 99,
                    status: "open".into(),
                });
                let ix = m.world.offers.len() - 1;
                crate::sim::diplomacy::activate(&mut m.world, ix).expect("the treaty activates");
            }
            12 => {
                // seat 3 cedes its only region to seat 2 and ceases to govern
                let id = m.world.id();
                m.world.offers.push(Offer { id, from: 3, to: 2, clauses: vec![Clause::CedeRegion { from: 3, region: capitals[3] as RegionId }], text: String::new(), created: m.world.month, expires_round: 99, status: "open".into() });
                let ix = m.world.offers.len() - 1;
                crate::sim::diplomacy::activate(&mut m.world, ix).expect("the cession takes effect");
            }
            _ => {}
        }
        run_rounds(&mut m, 1);
        for cur in m.take_ledger_trace() {
            assert_balanced(&prev, &cur);
            if !cur.before_month {
                months += 1;
                seen_grid += cur.regions.iter().map(|r| r.power.grid_in).sum::<i64>();
                seen_work += cur.regions.iter().map(|r| r.project_work_done).sum::<i64>();
                seen_crew += cur.regions.iter().map(|r| r.site_crew as i64).sum::<i64>();
                seen_site_supply += cur.regions.iter().map(|r| r.power.site_from_supply).sum::<i64>();
                seen_site_engines += cur.regions.iter().map(|r| r.power.site_from_engines).sum::<i64>();
                if cur.month % 12 == 0 {
                    for civ in &cur.civs {
                        for g in 0..NG {
                            seen_lost[g] += civ.flows.lost[g];
                        }
                        seen_traded += civ.flows.traded_in.iter().sum::<i64>();
                    }
                }
            }
            prev = cur;
        }
    }
    assert_eq!(months, 360);
    // the script did what it says: every channel of both ledgers moved
    let sum = |f: &dyn Fn(&QualFlows) -> &Vec<i64>| -> i64 { prev.civs.iter().map(|c| f(&c.qual_flows).iter().sum::<i64>()).sum() };
    assert!(sum(&|q| &q.trained) > 0, "nobody graduated");
    assert!(sum(&|q| &q.entered) > 0, "no holder enrolled in a further course");
    assert!(sum(&|q| &q.returned) > 0, "no closed course returned its learners");
    assert!(sum(&|q| &q.died) > 0 && sum(&|q| &q.retired) > 0);
    assert!(sum(&|q| &q.enlisted) > 0, "recruits and militia took no qualifications with them");
    assert!(sum(&|q| &q.moved_in) > 0 && sum(&|q| &q.moved_in) == sum(&|q| &q.moved_out), "no region changed hands");
    assert_eq!(m.world.regions[far1].controller, Some(0), "the outlying region was captured");
    assert_eq!(m.world.regions[capitals[3]].controller, Some(2), "the ceded region changed hands");
    assert_eq!(m.world.civs[3].status, SeatStatus::Eliminated);
    // the formation was broken: it lost most of its soldiers and holds nothing of seat 0's
    assert!(!m.world.armies.iter().any(|a| a.owner == 1 && a.soldiers[Role::Assault.index()] > 10_000 || a.owner == 1 && a.region as usize == capitals[0]), "the broken formation is gone or routed, and its dead were counted");
    assert!(seen_lost[Good::Food.index()] > 0, "food spoiled");
    assert!(seen_lost[Good::Materials.index()] > 0 && seen_lost[Good::IronOre.index()] > 0, "carriage from the outlying regions cost something");
    assert!(seen_traded > 0 && seen_grid > 0 && seen_work > 0);
    assert!(seen_crew > 0, "no order held a site crew");
    assert!(seen_site_supply > 0, "no site drew on a region's shaft work");
    assert!(seen_site_engines > 0, "no site engine ran");
    for s in 0..3usize {
        assert!(m.world.regions[capitals[s]].fac_level("steelworks") >= 2, "seat {s}'s steelworks was never finished");
    }
    let deposits = &prev.deposits;
    assert!(deposits.iter().any(|d| d.remaining == 0 && d.drawn > 0), "a deposit was worked out");
    assert!(deposits.iter().map(|d| d.drawn - d.delivered).sum::<i64>() > 0, "shallow workings left ore in the ground");
    assert!(deposits.iter().all(|d| d.delivered <= d.drawn));
    if let Some(land) = new_land {
        assert_eq!(m.world.regions[land].controller, Some(0), "the settlers arrived");
        assert!(m.world.regions[land].population() > 0);
    }
}

