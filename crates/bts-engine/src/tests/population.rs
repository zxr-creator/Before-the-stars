//! Historical population (design chapter 36, slice 2).

use super::*;
use crate::sim::{economy, outbreaks, population};

#[test]
fn harvests_are_one_draw_a_year_shared_by_a_climate_zone_and_bounded() {
    let m = Match::new(cfg("harvests"), 1);
    let w = &m.world;
    let mut sum = 0i64;
    let mut n = 0i64;
    let mut w2 = w.clone();
    for year in 0..400u32 {
        for ri in 0..w.regions.len() {
            w2.month = year * 12 + 1;
            let h = economy::harvest_bp(&w2, ri);
            assert!((-1_800..=1_000).contains(&h), "{h}");
            // every month of the year draws the same harvest
            w2.month = year * 12 + 12;
            assert_eq!(economy::harvest_bp(&w2, ri), h);
            sum += h;
            n += 1;
        }
    }
    let mean = sum / n;
    assert!((-300..=-100).contains(&mean), "mean harvest {mean} bp (designed -200)");
    // the same terrain group in the same part of the map shares a year's harvest
    let same: Vec<(usize, usize)> = (0..w.regions.len())
        .flat_map(|a| (a + 1..w.regions.len()).map(move |b| (a, b)))
        .filter(|(a, b)| w.regions[*a].terrain == w.regions[*b].terrain && (w.regions[*a].center[0] - w.regions[*b].center[0]).abs() < 30 && (w.regions[*a].center[1] - w.regions[*b].center[1]).abs() < 30)
        .collect();
    for (a, b) in same.into_iter().take(5) {
        let ca = (w.regions[a].center[0] as i64 * 3 / w.width as i64, w.regions[a].center[1] as i64 * 3 / w.height as i64);
        let cb = (w.regions[b].center[0] as i64 * 3 / w.width as i64, w.regions[b].center[1] as i64 * 3 / w.height as i64);
        if ca == cb {
            assert_eq!(economy::harvest_bp(&w2, a), economy::harvest_bp(&w2, b));
        }
    }
}

/// Epidemics come from addressed draws on the world: the same world gives the same
/// history, a seat's own decisions do not move another region's draw, and nothing
/// depends on the order in which seats are stepped.
#[test]
fn outbreaks_are_reproducible_and_independent_of_seat_order() {
    let make = || {
        let mut m = Match::new(cfg("outbreaks"), 1);
        // dense, crowded homes so that epidemics are frequent enough to compare
        for s in 0..4 {
            let home = m.world.civs[s].capital as usize;
            m.world.regions[home].water = 80_000;
        }
        m
    };
    let history = |m: &mut Match, reverse_seats: bool| -> Vec<(usize, Month, u16)> {
        let mut out = Vec::new();
        for _ in 0..3_000 {
            m.world.month += 1;
            for s in 0..4 {
                m.world.civs[s].stock[Good::Food.index()] = 50_000_000;
            }
            outbreaks::step(&mut m.world);
            // the seats' own monthly steps, in either order: they never touch the draws
            let order: Vec<usize> = if reverse_seats { (0..4).rev().collect() } else { (0..4).collect() };
            for s in order {
                population::step(&mut m.world, s as SeatId);
            }
            for (ri, r) in m.world.regions.iter().enumerate() {
                if let Some(o) = &r.outbreak {
                    if o.since == m.world.month {
                        out.push((ri, o.since, o.severity_bp));
                    }
                }
            }
        }
        out
    };
    let a = history(&mut make(), false);
    let b = history(&mut make(), true);
    assert!(!a.is_empty(), "no epidemic in 250 years of crowded homes");
    assert_eq!(a, b);
    for (_, _, sev) in &a {
        assert!((13_000..=25_000).contains(sev));
    }
}

/// Deaths by cause add up to all deaths, and an epidemic shows as its own cause.
#[test]
fn deaths_by_cause_partition_all_deaths() {
    let mut m = Match::new(cfg("causes"), 1);
    let home = m.world.civs[0].capital as usize;
    m.world.regions[home].outbreak = Some(Outbreak { since: 0, until: 60, severity_bp: 20_000 });
    run_rounds(&mut m, 3);
    for c in &m.world.civs {
        let f = &c.last_flows;
        assert_eq!(f.deaths_cause.iter().sum::<u32>(), f.deaths, "{}", c.name);
    }
    let f = &m.world.civs[0].last_flows;
    assert!(f.deaths_cause[3] > 0, "the epidemic killed people: {:?}", f.deaths_cause);
    let o = m.observe(0);
    assert_eq!(o.civ.deaths_by_cause.iter().map(|d| d.deaths).sum::<u64>(), o.civ.deaths_last_round as u64);
}

/// A city of non-farmers without sewers loses more people than the same city with them.
#[test]
fn a_town_without_sewers_is_a_population_sink() {
    let deaths = |sewers: u16| -> u32 {
        let mut m = Match::new(cfg("urban"), 1);
        let home = m.world.civs[0].capital as usize;
        settle_fixture(&mut m.world, home, 5_000_000);
        m.world.regions[home].water = 30_000_000;
        m.world.regions[home].last.labor.food = 100_000;
        m.world.civs[0].stock[Good::Food.index()] = 50_000_000;
        if sewers > 0 {
            put_works(&mut m.world.regions[home], "sewers", sewers);
        }
        assert!(population::urban_share(&m.world.regions[home]) > 8_000);
        m.world.month += 1;
        population::step(&mut m.world, 0);
        m.world.civs[0].flows.deaths
    };
    let (without, with) = (deaths(0), deaths(2));
    assert!(without > with * 13 / 10, "{without} deaths without sewers, {with} with");
}

/// A world of four billion people: every sum over regions is u64 and nothing wraps.
#[test]
fn a_four_billion_world_is_counted_without_overflow() {
    let mut m = Match::new(cfg("billions"), 1);
    let home = m.world.civs[0].capital as usize;
    let other = (0..m.world.regions.len()).find(|i| *i != home && m.world.regions[*i].owner.is_none()).unwrap();
    m.world.regions[other].owner = Some(0);
    m.world.regions[other].controller = Some(0);
    for ri in [home, other] {
        let r = &mut m.world.regions[ri];
        r.blocks.clear();
        r.blocks.push(PopBlock::new(m.world.civs[0].lineage, None));
        for (age, n) in crate::worldgen::start_pyramid(2_200_000_000).iter().enumerate() {
            r.blocks[0].ages[age] = *n;
        }
        r.water = u32::MAX;
        r.arable = 250;
    }
    m.world.civs[0].stock[Good::Food.index()] = i64::MAX / 4;
    let before = m.world.civ_population(0);
    assert!(before > u32::MAX as u64, "{before}");
    m.world.month += 1;
    population::step(&mut m.world, 0);
    let after = m.world.civ_population(0);
    let f = &m.world.civs[0].flows;
    assert_eq!(after as i64, before as i64 + f.births as i64 - f.deaths as i64);
    assert!(f.deaths > 1_000_000 && f.births > 1_000_000, "{} deaths, {} births", f.deaths, f.births);
    let o = m.observe(0);
    assert!(o.civ.population > u32::MAX as u64);
    assert_eq!(m.world.regions[home].settlement(), SettlementKind::Megalopolis);
    assert!(m.spectate().civs[0].population > u32::MAX as u64);
    assert!(m.diagnostics()[0].population > u32::MAX as u64);
}

/// The field methods of design table 3.3: rations and posts per level.
#[test]
fn field_methods_follow_the_table() {
    let expect = [("hand", 30_000, 10_000), ("traction", 46_000, 8_000), ("rotation", 60_000, 8_000), ("inputs", 120_000, 6_000), ("mechanized", 110_000, 3_000), ("intensive", 250_000, 2_000), ("restorative", 380_000, 1_500)];
    for (key, rations, posts) in expect {
        let m = &economy::FIELD_METHODS[economy::field_method_index(key).unwrap()];
        assert_eq!((m.rations, m.posts), (rations, posts), "{key}");
    }
    // the view states one level's yield and posts
    let mut m = Match::new(cfg("field-view"), 1);
    know_everything(&mut m.world, 0);
    let o = m.observe(0);
    let fields = o.catalog.facilities.iter().find(|f| f.kind == "fields").unwrap();
    let r = fields.recipes.iter().find(|r| r.key == "restorative").unwrap();
    assert_eq!((r.outputs[0].amount, r.general_posts), (380_000, 1_500));
}

/// The mortality and fertility factors at their extremes.
#[test]
fn mortality_falls_with_medicine_and_fertility_with_development() {
    let mut m = Match::new(cfg("factors"), 1);
    for p in m.world.civs[0].practice.iter_mut() {
        p.state = 0;
    }
    let (c0, a0) = population::mortality_tech(&m.world.civs[0]);
    assert_eq!((c0, a0), (10_000, 10_000));
    know_everything(&mut m.world, 0);
    let (c1, a1) = population::mortality_tech(&m.world.civs[0]);
    assert!(c1 < 1_000 && a1 < 3_000, "child {c1}, adult {a1}");
    // pre-modern: no development drag; modern: the floor
    assert_eq!(population::development_factor(0, 0, 0, 0, false), 10_000);
    assert_eq!(population::development_factor(10_000, 10_000, 10_000, 0, false), 7_300);
    assert_eq!(population::development_factor(10_000, 10_000, 10_000, 0, true), 7_800);
    // the floor
    assert_eq!(population::development_factor(10_000, 10_000, 10_000, 10_000, false), population::DEV_FLOOR_BP);
    assert_eq!(population::development_factor(10_000, 10_000, 10_000, 30_000, false), population::DEV_FLOOR_BP);
}

/// Fertility follows the households' own food security, never the government's
/// reserve policy (ruleset 3.0 slice 6r): with a full year's access and a season's
/// buffer in store, the food factor is whole whatever reserve the state aims for;
/// a people living from hand to mouth keeps most of it.
#[test]
fn fertility_follows_household_food_security_not_reserve_policy() {
    let factor = |reserve: u8, months_in_store: i64| {
        let mut m = Match::new(cfg("security"), 1);
        let pop = m.world.civ_population(0) as i64;
        m.world.civs[0].food_reserve_months = reserve;
        for r in m.world.regions.iter_mut() {
            r.last.food_made = 0;
        }
        // the month's need plus what is left in store after eating
        m.world.civs[0].stock[Good::Food.index()] = pop * (1 + months_in_store);
        population::step(&mut m.world, 0);
        m.world.civs[0].diag.fert_food_bp
    };
    assert_eq!(factor(12, 3), 10_000);
    assert_eq!(factor(2, 3), 10_000);
    let lean = factor(8, 0);
    assert!(lean >= population::FOOD_SECURE_BASE - 100 && lean < 10_000, "{lean}");
}
