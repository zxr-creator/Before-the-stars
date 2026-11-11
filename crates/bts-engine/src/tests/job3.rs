//! Ruleset 3.0 job 3: military generations and refits, raiders, sight and scouts,
//! and the market (design chapters 36 §6, 37 §2, 40 §§3-5; chapter 41's lean scope).

use super::*;
use crate::sim::{market, military, raiders};
#[allow(unused_imports)]
use crate::sim::knowledge;

fn order(good: Good, sell: bool, per_month: i64) -> MarketOrderSt {
    MarketOrderSt { good, sell, per_month, limit: None, keep: 0 }
}

/// Two (or more) seats joined by a direct route of the given loss.
fn trading_world(seed: &str, loss_bp: i64) -> Match {
    let mut m = Match::new(cfg(seed), 1);
    let n = m.world.civs.len();
    for a in 0..n {
        for b in 0..n {
            m.world.civs[a].contacts[b].met = a != b;
        }
    }
    m.world.routes = vec![Route { a: 0, b: 1, loss_bp, cap_t: 1_000_000, length: 3, sea: false }, Route { a: 1, b: 2, loss_bp, cap_t: 1_000_000, length: 3, sea: false }];
    m.world.market_of = vec![0, 0, 0, 3];
    m.world.routes_dirty = false;
    m
}

fn clear(m: &mut Match) {
    market::clear_market(&mut m.world, &[0, 1, 2]);
}

#[test]
fn the_market_clears_one_price_conserves_goods_and_credit_and_carriage_loses_cargo() {
    let mut m = trading_world("market", 1_000);
    for s in 0..3 {
        m.world.civs[s].stock[Good::Metal.index()] = 200_000;
        m.world.civs[s].stock[Good::Tin.index()] = 200_000;
    }
    m.world.civs[0].orders = vec![order(Good::Tin, false, 10_000), order(Good::Metal, true, 40_000)];
    m.world.civs[1].orders = vec![order(Good::Tin, true, 30_000), order(Good::Metal, false, 20_000)];
    m.world.civs[2].orders = vec![order(Good::Metal, false, 10_000), order(Good::Tin, true, 10_000)];
    let before = m.ledger_snapshot();
    clear(&mut m);
    let after = m.ledger_snapshot();
    assert_balanced(&before, &after);
    let f = |s: usize, g: Good| m.world.civs[s].fills.iter().find(|x| x.0 == g).copied();
    let (metal0, tin1) = (f(0, Good::Metal).expect("seat 0 sold metal"), f(1, Good::Tin).expect("seat 1 sold tin"));
    assert!(metal0.3 > 0 && tin1.3 > 0, "both goods traded: {:?}", m.world.civs.iter().map(|c| c.fills.clone()).collect::<Vec<_>>());
    // every buyer of a good paid the same price
    let line = &m.world.market_lines[0][Good::Metal.index()];
    assert!(line.volume > 0);
    for s in 1..3 {
        if let Some(x) = f(s, Good::Metal) {
            // (within the rounding the settlement leaves to the sellers)
            assert!(x.4 <= x.1 * line.price && x.4 * 100 >= x.1 * line.price * 99, "{} for {} at {}", x.4, x.1, line.price);
            // cargo is lost on the way and booked to the buyer
            assert!(x.2 < x.1, "carriage loses cargo");
        }
    }
    let credit: i64 = m.world.civs.iter().map(|c| c.credit).sum();
    assert_eq!(credit, 0);
    assert!(m.world.civs.iter().all(|c| c.credit >= 0 && c.credit == c.credit_earned - c.credit_spent));
}

/// Credit is never created: a seat with nothing anybody buys gets nothing, while a
/// cycle of four seats' wants clears (design chapter 36, 6.1 and 6.10).
#[test]
fn a_seat_pays_only_with_what_it_sells_and_a_cycle_of_wants_clears() {
    let mut m = trading_world("market", 1_000);
    m.world.routes.push(Route { a: 2, b: 3, loss_bp: 1000, cap_t: 2000, length: 3, sea: true });
    m.world.market_of = vec![0, 0, 0, 0];
    for s in 0..4 {
        for g in Good::ALL {
            m.world.civs[s].stock[g.index()] = 2_000_000;
        }
    }
    use Good::*;
    m.world.civs[0].orders = vec![order(Materials, true, 498691), order(Coal, false, 8305), order(Components, true, 37516), order(Saltpetre, false, 50313), order(Fertilizer, false, 25567)];
    m.world.civs[1].orders = vec![order(Materials, true, 118835), order(CopperOre, false, 5000), order(Metal, false, 5000), order(Components, true, 10372), order(Instruments, false, 5000), order(Saltpetre, true, 39968)];
    m.world.civs[2].orders = vec![order(CopperOre, false, 5000), order(Metal, true, 53686), order(Components, true, 26663), order(Instruments, true, 31314), order(Saltpetre, false, 5000)];
    m.world.civs[3].orders = vec![order(Tools, false, 21172), order(Metal, true, 39611), order(Instruments, true, 15653), order(Saltpetre, false, 5000)];
    for o in m.world.civs.iter_mut().flat_map(|c| c.orders.iter_mut()) {
        o.keep = 0;
    }
    let before = m.ledger_snapshot();
    market::clear_market(&mut m.world, &[0, 1, 2, 3]);
    assert_balanced(&before, &m.ledger_snapshot());
    assert!(m.world.civs[0].fills.is_empty(), "seat 0 sells nothing anybody wants, so it buys nothing");
    let sold = |s: usize, g: Good| m.world.civs[s].fills.iter().find(|x| x.0 == g).map(|x| x.3).unwrap_or(0);
    let bought = |s: usize, g: Good| m.world.civs[s].fills.iter().find(|x| x.0 == g).map(|x| x.1).unwrap_or(0);
    assert!(sold(1, Saltpetre) > 0 && bought(1, Metal) > 0 && bought(2, Saltpetre) > 0 && sold(2, Instruments) > 0);
    assert!(m.world.civs.iter().all(|c| c.credit == 0), "with no credit to start with, every seat paid exactly what it earned");
}

// ---- military generations ------------------------------------------------------------

fn army(w: &mut World, owner: SeatId, region: usize, tier: u8, n: u32) -> u32 {
    let id = w.id();
    w.armies.push(Army {
        id,
        owner,
        name: format!("Test {id}"),
        region: region as RegionId,
        soldiers: [0, 0, n],
        tier,
        proficiency_bp: 7_500,
        supply_bp: 10_000,
        morale_bp: 8_000,
        order: ArmyOrder::Hold,
        training_left: 0,
        in_battle: false,
        move_progress: 0,
        initial: n,
        variant: None,
        refit_to: None,
        refit_bp: 0,
        crit_low: 0,
        crit_vlow: 0,
        degraded: 0,
    });
    id
}

#[test]
fn power_grows_two_and_a_half_times_a_generation_and_counters_lapse_at_a_gap_of_two() {
    use crate::content::GEN_POWER;
    for g in 1..8 {
        assert!((GEN_POWER[g] * 1000 / GEN_POWER[g - 1] - 2500).abs() <= 1);
    }
    let (shock, line) = ([1000, 0, 0], [0, 0, 1000]);
    // same generation: shock against line formations is favoured (the matrix)
    assert_eq!(military::counter_bp(shock, 2000, line, 2000), crate::content::COUNTER[0][2]);
    assert_eq!(military::counter_bp(shock, 2000, line, 3900), crate::content::COUNTER[0][2]);
    // two generations apart: the older side gets a flat 8,000, the newer 10,000
    assert_eq!(military::counter_bp(shock, 2000, line, 4000), 8_000);
    assert_eq!(military::counter_bp(line, 4000, shock, 2000), 10_000);
}

#[test]
fn a_refit_converts_in_place_for_its_bill_and_months_with_blended_power() {
    let mut m = Match::new(cfg("refit"), 1);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 2_000_000);
    know_everything(&mut m.world, 0);
    put_works(&mut m.world.regions[home], "barracks", 1);
    for g in [Good::Metal, Good::Components, Good::Tools, Good::Munitions, Good::Horses, Good::Coal, Good::Spares] {
        m.world.civs[0].stock[g.index()] = 1_000_000;
    }
    let a = army(&mut m.world, 0, home, 2, 20_000);
    let refit = |m: &mut Match, generation: u8| m.act(0, vec![Action::StartProject { spec: ProjectSpec::Refit { army: a, generation }, priority: Some(1) }]).remove(0);
    assert_eq!(refit(&mut m, 2).status, "rejected", "not above its own generation");
    let r = refit(&mut m, 3);
    assert_eq!(r.status, "accepted", "{}", r.reason);
    let p = m.world.civs[0].projects.iter().find(|p| matches!(p.kind, ProjKind::Refit { .. })).unwrap().clone();
    // the whole new bill, nothing credited for the old kit
    let def = &content().unit_tiers[3];
    for (g, q) in &def.equipment {
        assert_eq!(p.inputs.iter().find(|x| x.0 == *g).map(|x| x.1), Some(q * 20), "{g:?}");
    }
    assert_eq!(p.max_per_month, (p.work_needed + 3) / 4, "half of eight training months");
    let before = m.ledger_snapshot();
    let mut prev = before;
    let mut seen_partial = false;
    for _ in 0..12 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        prev = cur;
        let x = m.world.armies.iter().find(|x| x.id == a).unwrap();
        if x.refit_to.is_some() && x.refit_bp > 0 {
            seen_partial = true;
            let (per, gen) = military::unit_power(x);
            assert!(per > crate::content::GEN_POWER[2] && per < crate::content::GEN_POWER[3], "a blend while converting");
            assert!(gen > 2000 && gen < 3000);
            assert!(x.proficiency_bp as i64 <= 6_000 + 3_000 * x.refit_bp as i64 / 10_000, "the retraining dip");
        }
    }
    let x = m.world.armies.iter().find(|x| x.id == a).unwrap();
    assert!(seen_partial);
    assert_eq!((x.tier, x.refit_to), (3, None), "the refit completed");
    assert_eq!(m.world.civs[0].kit[2], 20_000, "the old kit went to the store");
}

#[test]
fn a_formation_short_of_critical_goods_degrades_and_one_good_month_restores_it() {
    let mut m = Match::new(cfg("degrade"), 1);
    let home = m.world.civs[0].capital as usize;
    let a = army(&mut m.world, 0, home, 4, 10_000);
    for _ in 0..3 {
        crate::sim::step_month(&mut m.world);
    }
    assert_eq!(m.world.armies.iter().find(|x| x.id == a).unwrap().degraded, 2, "no fuel or munitions at all for three months");
    assert_eq!(m.world.armies.iter().find(|x| x.id == a).unwrap().fighting_gen(), 2);
    for g in [Good::Fuel, Good::Munitions, Good::Spares] {
        m.world.civs[0].stock[g.index()] = 1_000_000;
    }
    crate::sim::step_month(&mut m.world);
    assert_eq!(m.world.armies.iter().find(|x| x.id == a).unwrap().degraded, 0);
}

#[test]
fn militia_fight_two_generations_below_the_best_raised_by_the_kit_store() {
    let mut m = Match::new(cfg("militia"), 1);
    know_everything(&mut m.world, 0);
    assert_eq!(military::military_tier(&m.world, 0), 7);
    assert_eq!(military::militia_gen(&m.world, 0, 5_000), 5);
    m.world.civs[0].kit[6] = 5_000;
    assert_eq!(military::militia_gen(&m.world, 0, 5_000), 6);
    assert_eq!(military::militia_gen(&m.world, 0, 6_000), 5, "not enough sets for every militiaman");
    // a powder-age seat's militia carry pikes, a start's warbands nothing better
    assert_eq!(military::militia_gen(&m.world, 1, 5_000), 0);
}

#[test]
fn no_spears_for_a_seat_that_can_fit_out_a_newer_generation() {
    let mut m = Match::new(cfg("floor"), 1);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 3_000_000);
    know_everything(&mut m.world, 0);
    put_works(&mut m.world.regions[home], "barracks", 1);
    let recruit = |m: &mut Match, tier: u8| m.act(0, vec![Action::StartProject { spec: ProjectSpec::Recruit { region: home as RegionId, role: Role::Denial, soldiers: 2_000, tier }, priority: None }]).remove(0);
    // nothing in store to fit out generation 6: the old patterns are allowed
    assert_eq!(recruit(&mut m, 0).status, "accepted");
    for g in Good::ALL {
        m.world.civs[0].stock[g.index()] = 10_000_000;
    }
    let r = recruit(&mut m, 0);
    assert_eq!(r.status, "rejected");
    assert!(r.reason.contains("obsolete"), "{}", r.reason);
    // two behind from the kit store is allowed
    m.world.civs[0].kit[5] = 2_000;
    assert_eq!(recruit(&mut m, 5).status, "accepted");
    assert_eq!(m.world.civs[0].kit[5], 0);
}

// ---- raiders -----------------------------------------------------------------------------

/// A camp of `people` in a free land neighbour of seat 0's capital.
fn camp_next_door(m: &mut Match, people: u32) -> (usize, usize) {
    let home = m.world.civs[0].capital as usize;
    let ri = free_neighbour(&m.world, home, &[]).expect("a free neighbour");
    if let Some(ci) = raiders::camp_at(&m.world, ri) {
        return (ci, ri);
    }
    let ci = raiders::found(&mut m.world, ri, crate::worldgen::start_pyramid(people), 0);
    m.world.wild.births += people as u64; // recorded here as an arrival for the books
    (ci, ri)
}

#[test]
fn a_new_world_has_camps_of_real_people_that_block_settlement() {
    let mut m = Match::new(cfg("camps"), 1);
    assert!(!m.world.camps.is_empty());
    for (ci, c) in m.world.camps.clone().iter().enumerate() {
        assert!(m.world.regions[c.region as usize].owner.is_none());
        assert!(raiders::people(&m.world, ci) >= 6_000);
    }
    let (ci, ri) = camp_next_door(&mut m, 12_000);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 500_000);
    m.world.civs[0].memory[ri].seen = true;
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Settle { from: home as RegionId, to: ri as RegionId, people: 30_000 }, priority: None }]).remove(0);
    assert_eq!(r.status, "rejected");
    assert!(r.reason.contains(&m.world.camps[ci].name), "{}", r.reason);
}

#[test]
fn raids_take_capped_goods_kill_and_damage_and_the_books_balance() {
    let run = || {
        let mut m = Match::new(cfg("raids"), 1);
        let home = m.world.civs[0].capital as usize;
        settle_fixture(&mut m.world, home, 400_000);
        let (ci, _) = camp_next_door(&mut m, 100_000);
        let id = m.world.camps[ci].id;
        for g in raiders::PLUNDER {
            m.world.civs[0].stock[g.index()] = 2_000_000;
        }
        let mut prev = m.ledger_snapshot();
        let mut raided = 0;
        for _ in 0..120 {
            let (stock, lost) = (m.world.civs[0].stock_of(Good::Tools), m.world.civs[0].flows.lost[Good::Tools.index()]);
            crate::sim::step_month(&mut m.world);
            let cur = m.ledger_snapshot();
            assert_balanced(&prev, &cur);
            prev = cur;
            let took = m.world.civs[0].flows.lost[Good::Tools.index()] - lost;
            assert!(took <= stock * 2 / 100 + 1, "at most 2% of a good per raid");
            if let Some(c) = m.world.camps.iter().find(|c| c.id == id) {
                if c.last_success == m.world.month {
                    raided += 1;
                }
            }
        }
        assert!(raided > 0, "the camp raided its neighbour");
        assert!(m.world.civs[0].memory.iter().any(|x| x.camp.is_some()), "the raided seat saw where they came from");
        m.state_hash()
    };
    assert_eq!(run(), run(), "raids are keyed draws");
}

#[test]
fn a_strong_army_breaks_a_camp_recovers_its_plunder_and_opens_the_land() {
    for subjugate in [false, true] {
        let mut m = Match::new(cfg("clear"), 1);
        let (ci, ri) = camp_next_door(&mut m, 10_000);
        m.world.camps[ci].plunder = vec![(Good::Tools, 5_000)];
        m.world.wild.plundered = vec![0; NG];
        m.world.wild.plundered[Good::Tools.index()] += 5_000;
        m.world.civs[0].subjugate_camps = subjugate;
        army(&mut m.world, 0, ri, 3, 30_000);
        let tools = m.world.civs[0].stock_of(Good::Tools);
        let mut prev = m.ledger_snapshot();
        for _ in 0..6 {
            crate::sim::step_month(&mut m.world);
            let cur = m.ledger_snapshot();
            assert_balanced(&prev, &cur);
            prev = cur;
        }
        assert!(raiders::camp_at(&m.world, ri).is_none(), "the camp broke");
        assert!(m.world.civs[0].stock_of(Good::Tools) >= tools + 5_000 - 1_000, "the plunder was recovered");
        assert_eq!(m.world.regions[ri].owner == Some(0), subjugate, "subjects come with the land; refugees leave it");
        if !subjugate {
            assert_eq!(m.world.regions[ri].population(), 0);
        }
    }
}

#[test]
fn the_raider_generation_follows_the_median_one_below_the_leader_after_ten_years() {
    let mut m = Match::new(cfg("rgen"), 1);
    let homes: Vec<usize> = m.world.civs.iter().map(|c| c.capital as usize).collect();
    for (s, t) in [(0u8, 5u8), (1, 4), (2, 2), (3, 1)] {
        army(&mut m.world, s, homes[s as usize], t, 1_000);
    }
    raiders::update_generation(&mut m.world);
    assert_eq!(m.world.raider_gen, 0, "not before the new generation has held ten years");
    m.world.month += 120;
    raiders::update_generation(&mut m.world);
    assert_eq!(m.world.raider_gen, 3, "the median of 1, 2, 4, 5 (rounded down), capped at 4");
    army(&mut m.world, 2, homes[2], 5, 1_000);
    army(&mut m.world, 3, homes[3], 5, 1_000);
    m.world.month += 120;
    raiders::update_generation(&mut m.world);
    m.world.month += 120;
    raiders::update_generation(&mut m.world);
    assert_eq!(m.world.raider_gen, 4, "never above the leader less one");
}

#[test]
fn camps_are_seen_only_where_sighted() {
    let mut m = Match::new(cfg("sight"), 1);
    let (ci, ri) = camp_next_door(&mut m, 9_000);
    crate::sim::knowledge::refresh_visibility(&mut m.world, 0);
    let obs = m.observe(0);
    let r = obs.regions.iter().find(|r| r.id as usize == ri).expect("a neighbour is observed");
    let c = r.camp.as_ref().expect("a camp next door is sighted");
    assert!(c.people_low < c.people_high);
    let text = serde_json::to_string(&obs).unwrap();
    for (k, other) in m.world.camps.iter().enumerate() {
        if k != ci && !m.world.civs[0].memory[other.region as usize].seen {
            assert!(!text.contains(&other.name), "an unsighted camp is absent");
        }
    }
    assert!(!text.contains("raider_gen"));
}

// ---- sight and scouts ------------------------------------------------------------------

#[test]
fn a_scout_party_charts_a_region_and_its_neighbours() {
    let mut m = Match::new(cfg("scout"), 1);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 500_000);
    m.world.civs[0].stock[Good::Food.index()] = 5_000_000;
    let seen_before = m.world.civs[0].memory.iter().filter(|x| x.seen).count();
    // a region at the edge of what is known
    let target = (0..m.world.regions.len()).find(|r| !m.world.civs[0].memory[*r].seen && m.world.regions[*r].neighbors.iter().any(|(n, _)| m.world.civs[0].memory[*n as usize].seen)).expect("an unknown region next to known land");
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Scout { region: target as RegionId }, priority: Some(1) }]).remove(0);
    assert_eq!(r.status, "accepted", "{}", r.reason);
    let mut prev = m.ledger_snapshot();
    for _ in 0..12 {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        prev = cur;
    }
    assert!(!m.world.civs[0].projects.iter().any(|p| matches!(p.kind, ProjKind::Scout { .. })), "the party came back (or was lost)");
    let lost = m.world.civs[0].briefing.iter().any(|b| b.title.starts_with("Scouts lost"));
    if !lost {
        assert!(m.world.civs[0].memory[target].seen);
        assert!(m.world.civs[0].memory.iter().filter(|x| x.seen).count() > seen_before);
    }
}

#[test]
fn estimates_miss_about_one_time_in_ten_and_do_not_converge_over_the_years() {
    let m = Match::new(cfg("estimate"), 1);
    let truth = 2_000_000u64;
    let (mut inside, mut total, mut biased) = (0, 0, 0);
    for key in 0..200u64 {
        let mut w = m.world.clone();
        let mut mids = 0i64;
        for year in 0..30u32 {
            w.month = year * 12;
            let (lo, hi) = crate::observe::estimate(&w, 0, key, truth, 50);
            total += 1;
            if lo <= truth && truth <= hi {
                inside += 1;
            }
            mids += (lo + hi) as i64 / 2;
        }
        // the mean of thirty years of reports keeps a bias of its own
        if (mids / 30 - truth as i64).abs() * 100 > truth as i64 * 3 {
            biased += 1;
        }
    }
    let share = inside * 100 / total;
    assert!((75..=97).contains(&share), "{share}% of bands contained the truth");
    assert!(biased >= 60, "only {biased} of 200 subjects kept a bias after thirty years");
}

// ---- market routes ---------------------------------------------------------------------

#[test]
fn routes_need_contact_and_peace_and_an_embargo_closes_them() {
    let mut m = Match::new(cfg("routes"), 1);
    let cap1 = m.world.civs[1].capital as usize;
    for r in 0..m.world.regions.len() {
        if r != cap1 && m.world.regions[r].controller != Some(1) {
            m.world.regions[r].controller = Some(0);
            m.world.regions[r].owner = Some(0);
        }
    }
    m.world.camps.clear();
    market::recompute_routes(&mut m.world);
    assert!(m.world.routes.is_empty(), "strangers have no route");
    for a in 0..4 {
        for b in 0..4 {
            m.world.civs[a].contacts[b].met = a != b;
        }
    }
    market::recompute_routes(&mut m.world);
    let r = m.world.routes.first().expect("a route by land").clone();
    let (a, b) = (r.a, r.b);
    assert!(r.loss_bp > 0 && r.cap_t > 0);
    assert_eq!(m.world.market_of[b as usize], m.world.market_of[a as usize]);
    military::declare_war(&mut m.world, a, b, "Test.");
    market::recompute_routes(&mut m.world);
    assert!(!m.world.routes.iter().any(|r| r.a == a && r.b == b), "war cuts the route");
    military::make_peace(&mut m.world, a, b);
    market::recompute_routes(&mut m.world);
    assert!(m.world.routes.iter().any(|r| r.a == a && r.b == b), "peace restores it");
    m.world.civs[b as usize].embargo = vec![a];
    market::recompute_routes(&mut m.world);
    assert!(!m.world.routes.iter().any(|r| r.a == a && r.b == b), "an embargo cuts it");
}

#[test]
fn members_see_aggregates_for_goods_they_know_and_never_another_seats_orders() {
    let mut m = trading_world("boundary", 500);
    for s in 0..3 {
        m.world.civs[s].stock[Good::Metal.index()] = 100_000;
    }
    m.world.civs[1].stock[Good::Lattice.index()] = 100_000;
    m.world.civs[0].orders = vec![order(Good::Metal, true, 10_000)];
    m.world.civs[1].orders = vec![order(Good::Metal, false, 7_777), order(Good::Lattice, true, 3_333)];
    clear(&mut m);
    assert!(!crate::observe::known_goods(&m.world, 0)[Good::Lattice.index()]);
    let v = market::view(&m.world, 0).expect("a member sees its market");
    assert!(v.lines.iter().all(|l| l.good != Good::Lattice), "an unknown good is absent");
    assert!(v.orders.iter().all(|o| o.good == Good::Metal && o.side == MarketSide::Sell));
    let text = serde_json::to_string(&v).unwrap();
    assert!(!text.contains("3333"), "another seat's order is never shown");
    assert_eq!(v.members, vec![0, 1, 2]);
    // a seat outside the market sees nothing of it
    assert!(market::view(&m.world, 3).is_none());
}

#[test]
fn a_save_taken_mid_refit_and_mid_market_loads_and_continues_identically() {
    let mut m = trading_world("save", 500);
    let home = m.world.civs[0].capital as usize;
    know_everything(&mut m.world, 0);
    put_works(&mut m.world.regions[home], "barracks", 1);
    for g in Good::ALL {
        m.world.civs[0].stock[g.index()] = 2_000_000;
    }
    let a = army(&mut m.world, 0, home, 2, 10_000);
    assert_eq!(m.act(0, vec![Action::StartProject { spec: ProjectSpec::Refit { army: a, generation: 4 }, priority: Some(1) }])[0].status, "accepted");
    crate::sim::step_month(&mut m.world);
    let saved = m.save_json();
    let mut b = Match::load_json(&saved).expect("the save loads");
    for _ in 0..6 {
        crate::sim::step_month(&mut m.world);
        crate::sim::step_month(&mut b.world);
    }
    assert_eq!(m.state_hash(), b.state_hash());
}

