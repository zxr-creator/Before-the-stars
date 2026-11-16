//! Ruleset 3.1: the standard victory contract and public schooling
//! (`docs/design/42-playable-ruleset-3.1.md`).

use super::*;
use crate::sim::space::{StationSt, MODULES, M_SHIPYARD, M_SOLAR};

fn standard(seed: &str, rounds: u32) -> MatchConfig {
    MatchConfig { seed: seed.into(), regions: 24, calendar: MatchConfig::fixture_calendar(rounds), victory: VictoryRule::Standard, ..Default::default() }
}

fn station(w: &mut World, seat: SeatId, modules: &[(usize, u16)]) {
    let mut m = vec![0u16; MODULES.len()];
    for (k, lv) in modules {
        m[*k] = *lv;
    }
    let id = w.id();
    w.space.stations.push(StationSt { id, owner: seat, orbit: 0, core: 1, modules: m, staffed_bp: 0, power_bp: 0, supplied_bp: 0, rate_bp: 0, aboard: 0, staffed: 0 });
}

fn boost(w: &mut World, seat: usize) {
    w.civs[seat].space.boost += 1_000;
    w.civs[seat].space.made_total += 1_000;
}

#[test]
fn the_objective_is_public_from_the_first_round_and_names_no_hidden_place() {
    let m = Match::new(standard("public", 240), 1);
    let obs = m.observe(0);
    let v = obs.objectives.victory.expect("the standard contract is shown from the start");
    assert_eq!(v.rule, "standard");
    assert_eq!(v.steps.len(), 6);
    assert!(v.steps.iter().all(|c| !c.ok));
    assert_eq!(v.next_step.as_deref(), Some("orbit"));
    assert!(v.test_nodes.is_empty(), "the test nodes stay hidden until discovered");
    assert!(obs.regions.iter().all(|r| !r.test_node));
    assert!(!v.trial_ready);
    // only seats that have met appear in the standings
    assert_eq!(v.standings.len(), 1);
}

#[test]
fn programme_steps_are_reached_in_order_and_never_lost() {
    let mut m = Match::new(standard("steps", 240), 1);
    let w = &mut m.world;
    // a station before any boost was made is not yet a step: the steps come in order
    station(w, 0, &[(M_SOLAR, 1)]);
    victory::step(w);
    assert_eq!(victory::steps_done(w, 0), 0);
    boost(w, 0);
    w.month += 1;
    victory::step(w);
    assert_eq!(victory::steps_done(w, 0), 2, "orbit and the station are recorded together once both hold");
    // the station is lost: the steps stay
    w.space.stations.clear();
    w.month += 1;
    victory::step(w);
    assert_eq!(victory::steps_done(w, 0), 2);
    assert!(w.outcome.is_none());
    let v = m.observe(0).objectives.victory.unwrap();
    assert_eq!(v.next_step.as_deref(), Some("shipyard"));
    assert!(v.steps[0].ok && v.steps[1].ok && !v.steps[2].ok);
}

#[test]
fn two_jump_round_trips_a_year_apart_win_the_match() {
    let mut m = Match::new(standard("jump", 240), 1);
    let w = &mut m.world;
    boost(w, 0);
    station(w, 0, &[(M_SOLAR, 1), (M_SHIPYARD, 1)]);
    let cap = w.civs[0].capital;
    w.civs[0].ftl.assemblies.push(Assembly { id: 1, yard_region: cap, built: 1, retired: false });
    w.month = 100;
    victory::complete_trial(w, 0);
    victory::step(w);
    assert_eq!(victory::steps_done(w, 0), 5);
    // a second flight too soon does not count as the second round trip
    w.month = 105;
    victory::complete_trial(w, 0);
    victory::step(w);
    assert!(w.outcome.is_none());
    assert_eq!(victory::steps_done(w, 0), 5);
    w.month = 112;
    victory::complete_trial(w, 0);
    victory::step(w);
    let o = w.outcome.clone().expect("the programme is complete");
    assert_eq!((o.winner, o.kind.as_str()), (Some(0), "jump"));
    assert!(m.reward(0) >= 1.0 && m.reward(1) == -1.0);
}

#[test]
fn a_trial_needs_an_assembly_and_the_seats_own_shipyard() {
    let mut m = Match::new(standard("trial", 240), 1);
    let t166 = content().t("T166");
    m.world.civs[0].tech[t166].state = ST_UNDERSTOOD;
    let order = || vec![Action::StartProject { spec: ProjectSpec::FtlTrial, priority: None }];
    assert_eq!(m.act(0, order())[0].status, "rejected");
    m.world.civs[0].ftl.assemblies.push(Assembly { id: 1, yard_region: 0, built: 1, retired: false });
    let r = m.act(0, order());
    assert_eq!(r[0].status, "rejected");
    assert!(r[0].reason.contains("shipyard"), "{}", r[0].reason);
    station(&mut m.world, 0, &[(M_SHIPYARD, 1)]);
    let v = m.observe(0).objectives.victory.unwrap();
    assert!(v.trial_ready, "{}", v.trial_blocker);
    assert_eq!(m.act(0, order())[0].status, "accepted");
}

#[test]
fn the_only_sovereign_left_wins() {
    let mut m = Match::new(standard("supremacy", 240), 1);
    let w = &mut m.world;
    for s in 1..w.civs.len() {
        if s == 1 {
            w.civs[s].overlord = Some(0);
        } else {
            w.civs[s].status = SeatStatus::Eliminated;
        }
    }
    victory::step(w);
    let o = w.outcome.clone().expect("one sovereign remains");
    assert_eq!((o.winner, o.kind.as_str()), (Some(0), "supremacy"));
}

#[test]
fn the_horizon_gives_the_match_to_the_highest_standing() {
    let mut m = Match::new(standard("horizon", 2), 1);
    // seat 2 has reached orbit: a programme step outweighs people and knowledge
    boost(&mut m.world, 2);
    run_rounds(&mut m, 2);
    assert!(m.finished());
    let o = m.world.outcome.clone().unwrap();
    assert_eq!((o.winner, o.kind.as_str()), (Some(2), "standing"));
    assert_eq!(m.reward(2), 1.0);
    assert_eq!(m.reward(0), -1.0);
}

#[test]
fn public_schooling_opens_a_course_for_a_vacant_post_where_a_venue_stands() {
    let mut m = Match::new(standard("schooling", 240), 1);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 200_000);
    // an artisans' workshop with nobody qualified to work it, and a lodge to teach in
    let c = content();
    let lodge = c.facilities.iter().position(|f| f.provides.iter().any(|(k, _)| *k == crate::content::Cap::SeatsLodge)).expect("a teaching lodge exists");
    put_works(&mut m.world.regions[home], c.facilities[lodge].key, 2);
    m.world.regions[home].quals[Qual::Artisan.index()] = 0;
    m.world.regions[home].last.vacant = vec![0; NQ];
    m.world.regions[home].last.vacant[Qual::Artisan.index()] = 3_000;
    assert!(m.world.civs[0].schooling, "schooling is on by default");
    m.world.month = 12;
    crate::sim::step_month(&mut m.world);
    let autos: Vec<&Program> = m.world.civs[0].programs.iter().filter(|p| p.auto).collect();
    assert!(autos.iter().any(|p| c.courses[p.course].output == Qual::Artisan), "an artisans' course was opened: {:?}", autos.iter().map(|p| &c.courses[p.course].id).collect::<Vec<_>>());
    // turned off, the referee's programmes pass to the seat and no more are opened
    let r = m.act(0, vec![Action::SetPolicy { setting: PolicySetting::Schooling { enabled: false } }]);
    assert_eq!(r[0].status, "accepted");
    assert!(m.world.civs[0].programs.iter().all(|p| !p.auto));
    assert!(!m.observe(0).civ.policies.schooling);
}
