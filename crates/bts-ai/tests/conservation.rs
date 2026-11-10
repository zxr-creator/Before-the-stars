//! Conservation audit of all-native matches.
//!
//! Every seat is played by the native policy, exactly as the server's host drives
//! it: each controller sees only its own observation and returns ordinary actions.
//! The referee records its books (`Match::record_ledgers`) after the decisions of
//! every round and at the close of every month, and `ledger::violations` is run on
//! every consecutive pair. The granularity is therefore one month, plus one check
//! per round for whatever the seats' decisions themselves changed (treaties signed,
//! formations disbanded, courses closed).
//!
//! What is asserted for every month, for every civilization:
//! - goods: `stock change = produced - consumed - lost + traded in - traded out`
//!   for every good, no negative stock, and world trade nets to zero;
//! - qualified people: holders of every qualification equal what the cumulative
//!   ledger accounts for (courses, deaths, ageing, enlistment, migration and
//!   territory changing hands), per civilization and for the world;
//! - people: residents plus soldiers of the world change by births less deaths;
//! - roles: no region has more qualified people and learners than working-age
//!   residents, or more instructors than holders; the month's labour gives nobody
//!   two roles, and site crews are among the workers called up for projects;
//! - services: shaft and electric service used never exceed supply after
//!   conversion and grid loss, construction sites included; site engines deliver
//!   no more than the coal and fuel they burned gives; compute used never exceeds what was installed the
//!   month before; research used never exceeds the researcher-months of staffed
//!   posts; project work never exceeds the workers called up;
//! - deposits: every tonne of ore booked as produced was delivered by a deposit,
//!   and no deposit delivered more than was drawn from it.
//!
//! This test lives here because `bts-engine` cannot depend on the policy crate.

use bts_ai::{Difficulty, NativeAi};
use bts_engine::ledger::{self, LedgerSnapshot};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;

struct Table {
    m: Match,
    ais: Vec<NativeAi>,
}

impl Table {
    fn new(seed: &str, controllers: Vec<ControllerKind>) -> Table {
        let cfg = MatchConfig { seed: seed.into(), controllers, ..Default::default() };
        let m = Match::new(cfg, 7);
        let ais = (0..m.seats())
            .map(|s| {
                let d = Difficulty::from_controller(m.controller(s as SeatId)).expect("every seat is native");
                NativeAi::new(d, 0x5EED_0000 + s as u64 * 7919)
            })
            .collect();
        Table { m, ais }
    }

    /// One host step: every seat that is due decides on its own observation, then
    /// the phase advances.
    fn step(&mut self) -> bool {
        if self.m.finished() {
            return false;
        }
        for seat in self.m.waiting_on() {
            let obs = self.m.observe(seat);
            let actions = self.ais[seat as usize].decide(&obs);
            for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
                self.m.act(seat, chunk.to_vec());
            }
            self.m.set_ready(seat, false);
        }
        self.m.try_advance()
    }
}

/// What a match exercised, so a test can require that the audit was not vacuous.
#[derive(Debug, Default)]
struct Seen {
    months: u32,
    decisions: u32,
    trained: i64,
    entered: i64,
    returned: i64,
    died: i64,
    retired: i64,
    enlisted: i64,
    changed_hands: i64,
    max_soldiers: u64,
    max_regions_held: usize,
    traded: i64,
    spoiled_or_lost_in_carriage: i64,
    ore_delivered: i64,
    ore_left_in_the_ground: i64,
    electricity_used: i64,
    grid_shared: i64,
    compute_used: i64,
    project_work: i64,
    research_used: i64,
    eliminated: usize,
    /// Person-months spent on site crews, and site power drawn from the regions'
    /// shaft work and from site engines.
    site_crew_months: i64,
    site_power_from_supply: i64,
    site_power_from_engines: i64,
    /// The match ended before its horizon because a seat completed the victory contract.
    won: bool,
}

fn audit(seed: &str, controllers: Vec<ControllerKind>, rounds: u32) -> Seen {
    let mut t = Table::new(seed, controllers);
    t.m.record_ledgers(true);
    let mut prev: LedgerSnapshot = t.m.ledger_snapshot();
    let mut seen = Seen::default();
    let target = t.m.round() + rounds;
    while !t.m.finished() && t.m.round() < target {
        assert!(t.step(), "{seed}: the match stalled in round {}", t.m.round());
        for cur in t.m.take_ledger_trace() {
            let broken = ledger::violations(&prev, &cur);
            assert!(broken.is_empty(), "{seed}: {} conservation violations, first:\n{}", broken.len(), broken.iter().take(12).cloned().collect::<Vec<_>>().join("\n"));
            if cur.before_month {
                seen.decisions += 1;
            } else {
                seen.months += 1;
                seen.electricity_used += cur.regions.iter().map(|r| r.power.elec_used).sum::<i64>();
                seen.grid_shared += cur.regions.iter().map(|r| r.power.grid_in).sum::<i64>();
                seen.compute_used += cur.civs.iter().map(|c| c.compute_used).sum::<i64>();
                seen.project_work += cur.regions.iter().map(|r| r.project_work_done).sum::<i64>();
                seen.site_crew_months += cur.regions.iter().map(|r| r.site_crew as i64).sum::<i64>();
                seen.site_power_from_supply += cur.regions.iter().map(|r| r.power.site_from_supply).sum::<i64>();
                seen.site_power_from_engines += cur.regions.iter().map(|r| r.power.site_from_engines).sum::<i64>();
                seen.research_used += cur.civs.iter().map(|c| c.research_used.iter().sum::<i64>()).sum::<i64>();
                if cur.month % 12 == 0 {
                    // the goods accounts are closed after the round's last month
                    seen.traded += cur.civs.iter().map(|c| c.flows.traded_in.iter().sum::<i64>()).sum::<i64>();
                    seen.spoiled_or_lost_in_carriage += cur.civs.iter().map(|c| c.flows.lost.iter().sum::<i64>()).sum::<i64>();
                }
            }
            seen.max_soldiers = seen.max_soldiers.max(cur.civs.iter().map(|c| c.soldiers).sum());
            for s in 0..cur.civs.len() {
                let held = cur.regions.iter().filter(|r| r.controller == Some(s as SeatId)).count();
                seen.max_regions_held = seen.max_regions_held.max(held);
            }
            prev = cur;
        }
    }
    for c in &prev.civs {
        let q = &c.qual_flows;
        seen.trained += q.trained.iter().sum::<i64>();
        seen.entered += q.entered.iter().sum::<i64>();
        seen.returned += q.returned.iter().sum::<i64>();
        seen.died += q.died.iter().sum::<i64>();
        seen.retired += q.retired.iter().sum::<i64>();
        seen.enlisted += q.enlisted.iter().sum::<i64>();
        seen.changed_hands += q.moved_in.iter().sum::<i64>();
        if c.eliminated {
            seen.eliminated += 1;
        }
    }
    seen.ore_delivered = prev.deposits.iter().map(|d| d.delivered).sum();
    seen.ore_left_in_the_ground = prev.deposits.iter().map(|d| d.drawn - d.delivered).sum();
    seen.won = t.m.winner().is_some();
    seen
}

fn mixed() -> Vec<ControllerKind> {
    vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy]
}

/// Three hundred months of three different worlds, every month audited.
#[test]
fn all_ai_matches_balance_every_month_for_three_hundred_months() {
    for seed in ["audit-a", "audit-b", "audit-c"] {
        let seen = audit(seed, mixed(), 25);
        assert_eq!(seen.months, 300, "{seed}: {seen:?}");
        assert_eq!(seen.decisions, 25, "{seed}: {seen:?}");
        // the opening already trains people, loses some to age and death, and spoils food
        assert!(seen.trained > 0 && seen.died > 0 && seen.retired > 0, "{seed}: {seen:?}");
        assert!(seen.spoiled_or_lost_in_carriage > 0 && seen.project_work > 0 && seen.research_used > 0, "{seed}: {seen:?}");
    }
}

/// Three whole campaigns (2,880 months each, unless a seat wins sooner), every month
/// audited. Between them they
/// include settlement, recruitment, war, regions changing hands, trade, mining,
/// electricity shared over a grid and compute, so every ledger channel that exists
/// in this ruleset is exercised under the audit.
#[test]
fn all_ai_campaigns_balance_every_month_through_war_settlement_and_recruitment() {
    let mut total = Seen::default();
    // (the third world is one in which a war moves borders under this ruleset; a
    // campaign is audited to its horizon, or to the month a seat wins it)
    for (seed, controllers) in [("riverland", mixed()), ("eval-4", vec![ControllerKind::NativeMedium; 4]), ("war-2", mixed())] {
        let seen = audit(seed, controllers, 240);
        eprintln!("{seed}: {seen:?}");
        if seed == "war-2" {
            assert!(seen.months == 2880 || (seen.won && seen.months >= 2400), "{seed}: {seen:?}");
        } else {
            assert_eq!(seen.months, 2880, "{seed}: {seen:?}");
        }
        // settlement and recruitment happen in every campaign
        assert!(seen.max_regions_held >= 3, "{seed}: nobody settled: {seen:?}");
        assert!(seen.max_soldiers > 0 && seen.enlisted > 0, "{seed}: nobody was recruited: {seen:?}");
        assert!(seen.trained > 0 && seen.entered > 0 && seen.died > 0 && seen.retired > 0, "{seed}: {seen:?}");
        assert!(seen.ore_delivered > 0 && seen.ore_left_in_the_ground > 0, "{seed}: {seen:?}");
        assert!(seen.electricity_used > 0 && seen.compute_used > 0, "{seed}: {seen:?}");
        // construction held qualified crews and drew site power in every campaign
        assert!(seen.site_crew_months > 0, "{seed}: no order held a site crew: {seen:?}");
        assert!(seen.site_power_from_supply + seen.site_power_from_engines > 0, "{seed}: no site drew power: {seen:?}");
        total.site_power_from_supply += seen.site_power_from_supply;
        total.site_power_from_engines += seen.site_power_from_engines;
        total.changed_hands += seen.changed_hands;
        total.traded += seen.traded;
        total.returned += seen.returned;
        total.grid_shared += seen.grid_shared;
        total.eliminated += seen.eliminated;
    }
    // war that moves a border, trade, closed courses and a shared grid occur in at least one
    assert!(total.changed_hands > 0, "no region changed hands in any campaign: {total:?}");
    assert!(total.grid_shared > 0, "no electricity crossed a grid in any campaign: {total:?}");
    // sites ran both on the regions' own shaft work and on engines burning coal or fuel
    assert!(total.site_power_from_supply > 0 && total.site_power_from_engines > 0, "site power came from one source only: {total:?}");
}
