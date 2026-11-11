//! Ruleset 3.0 slice 5: resources and goods (design chapter 36, section 5, as changed
//! by chapter 37, section 1.1).

use super::*;
use crate::content::{deposit_good, line_meta, offworld_good, UpgradeKind};
use crate::worldgen::{within_links, world_minimum, HELIUM_RICH_MIN};

fn world(seed: &str, regions: u16) -> Match {
    Match::new(MatchConfig { seed: seed.into(), regions, controllers: vec![ControllerKind::NativeMedium; 4], ..Default::default() }, 1)
}

#[test]
fn the_catalog_has_fifty_goods_and_seventeen_deposits() {
    assert_eq!(Good::COUNT, 50);
    assert_eq!(Deposit::COUNT, 17);
    // every deposit yields a distinct good
    let mut goods: Vec<Good> = Deposit::ALL.iter().map(|d| deposit_good(*d)).collect();
    goods.sort();
    goods.dedup();
    assert_eq!(goods.len(), Deposit::COUNT);
    // lots and masses of the new goods (design chapter 36, table 5.2)
    use crate::content::{good_mass_kg, good_unit};
    for (g, kg, unit) in [(Good::Horses, 500, "head"), (Good::Precious, 1, "lot"), (Good::Munitions, 50, "lot"), (Good::Batteries, 50, "lot"), (Good::NuclearFuel, 1, "lot"), (Good::Textiles, 10, "lot"), (Good::ConsumerGoods, 100, "lot"), (Good::FineWares, 10, "lot"), (Good::Lattice, 10, "lot"), (Good::Helium3, 1, "lot"), (Good::Tin, 1000, "t"), (Good::Helium, 1000, "t")] {
        assert_eq!((good_mass_kg(g), good_unit(g)), (kg, unit), "{g:?}");
    }
}

/// Over a thousand generated worlds the guarantees of design chapter 36, section 5.3
/// hold: copper, iron, coal and salt within three links of every home; the world
/// minimum of every rare kind; helium-rich gas; and no home neighbourhood holding
/// more than half of the regions with a rare kind (in almost every world).
#[test]
fn resource_guarantees_hold_on_a_thousand_worlds() {
    let mut concentrated = 0;
    let n = 1000;
    for i in 0..n {
        let m = Match::new(MatchConfig { seed: format!("guarantee-{i}"), regions: 48, controllers: vec![ControllerKind::NativeMedium; 4], ..Default::default() }, 1);
        let w = &m.world;
        for civ in &w.civs {
            let near = within_links(&w.regions, civ.capital as usize, 3);
            let sum = |d: Deposit| -> i64 { near.iter().filter_map(|(x, _)| w.regions[*x].deposit(d)).map(|x| x.remaining).sum() };
            assert!(sum(Deposit::CopperOre) >= 1_200_000_000, "world {i}");
            assert!(sum(Deposit::IronOre) >= 7_000_000_000, "world {i}");
            assert!(sum(Deposit::Coal) >= 10_000_000_000, "world {i}");
            assert!(near.iter().any(|(x, _)| w.regions[*x].coastal || w.regions[*x].deposit(Deposit::Salt).is_some()), "world {i}: no salt near home");
            assert!(w.regions[civ.capital as usize].bonus(Bonus::Floodplain) > 0, "world {i}: a home without a floodplain");
        }
        for d in Deposit::ALL {
            let holders: Vec<usize> = (0..w.regions.len()).filter(|r| w.regions[*r].deposit(*d).is_some()).collect();
            assert!(holders.len() >= world_minimum(*d), "world {i}: {} regions with {d:?}", holders.len());
            if world_minimum(*d) > 0 {
                let crowded = w.civs.iter().any(|c| {
                    let near: Vec<usize> = within_links(&w.regions, c.capital as usize, 3).into_iter().map(|x| x.0).collect();
                    holders.iter().filter(|h| near.contains(h)).count() * 2 > holders.len()
                });
                concentrated += crowded as usize;
            }
            if offworld_good(deposit_good(*d)) {
                assert!(holders.is_empty(), "no {d:?} on the home world");
            }
        }
        let rich = w.regions.iter().filter_map(|r| r.deposit(Deposit::Gas)).filter(|g| g.helium_bp >= 50).count();
        assert!(rich >= HELIUM_RICH_MIN, "world {i}: {rich} helium-rich gas fields");
    }
    // the redistribution cannot always succeed where home neighbourhoods cover most
    // of a small world (a three-link neighbourhood is 20 of 48 regions at the median);
    // it must hold for at least 94% of the rare kinds (seven a world): 4.5% fail today
    assert!(concentrated * 100 <= n * 7 * 6, "{concentrated} concentrated rare kinds in {n} worlds");
}

#[test]
fn a_deposit_is_unseen_until_its_revealing_knowledge_is_understood() {
    let mut m = world("reveal", 48);
    let c = content();
    // a tin region, surveyed by seat 0
    let ri = (0..m.world.regions.len()).find(|r| m.world.regions[*r].deposit(Deposit::Tin).is_some()).expect("a tin deposit");
    m.world.civs[0].memory[ri].surveyed = true;
    m.world.civs[0].memory[ri].seen = true;
    let tin_seen = |m: &Match| m.observe(0).regions.iter().find(|r| r.id as usize == ri).and_then(|r| r.survey.clone()).map(|s| s.deposits.iter().any(|d| d.kind == Deposit::Tin)).unwrap_or(false);
    let listed = |m: &Match, kind: &str| m.observe(0).catalog.facilities.iter().any(|f| f.kind == kind);
    let good_listed = |m: &Match, g: Good| m.observe(0).civ.goods.iter().any(|l| l.good == g);
    assert!(!tin_seen(&m), "tin is invisible before mineral identification");
    assert!(!listed(&m, "mine_tin"), "the works that would work it is not in the catalog");
    assert!(!good_listed(&m, Good::Tin) && !good_listed(&m, Good::Lattice) && !good_listed(&m, Good::Helium));
    // discovered but not understood: the works is listed (unavailable), the deposit still unseen
    m.world.civs[0].tech[c.t("T014")].state = ST_DISCOVERED;
    assert!(listed(&m, "mine_tin") && !tin_seen(&m));
    m.world.civs[0].tech[c.t("T014")].state = ST_UNDERSTOOD;
    assert!(tin_seen(&m), "understood: the deposit appears");
    assert!(good_listed(&m, Good::Tin));
    // helium content of gas fields only with cryogenics
    if let Some(gi) = (0..m.world.regions.len()).find(|r| m.world.regions[*r].deposit(Deposit::Gas).is_some()) {
        m.world.civs[0].memory[gi].surveyed = true;
        m.world.civs[0].memory[gi].seen = true;
        let he = |m: &Match| m.observe(0).regions.iter().find(|r| r.id as usize == gi).and_then(|r| r.survey.clone()).and_then(|s| s.deposits.iter().find(|d| d.kind == Deposit::Gas).map(|d| d.helium_bp));
        assert_eq!(he(&m), None, "gas is unseen before T090");
        m.world.civs[0].tech[c.t("T090")].state = ST_UNDERSTOOD;
        assert_eq!(he(&m), Some(None), "gas seen, its helium not");
        m.world.civs[0].tech[c.t("T108")].state = ST_UNDERSTOOD;
        assert!(matches!(he(&m), Some(Some(_))));
    }
}

#[test]
fn building_lines_are_valid_metadata() {
    let c = content();
    for f in &c.facilities {
        let (line, stage, era) = line_meta(f.key);
        assert_eq!((f.line, f.stage, f.era), (line, stage, era));
        assert!(!line.is_empty() && stage >= 1 && era <= 9, "{}", f.key);
    }
    // edge endpoints exist, edges join stages of one line in order, and the era never
    // falls along a line
    assert!(!c.upgrades.is_empty());
    for e in &c.upgrades {
        assert!(e.from < c.facilities.len() && e.to < c.facilities.len());
        let (a, b) = (&c.facilities[e.from], &c.facilities[e.to]);
        if e.kind == UpgradeKind::Upgrade {
            assert_eq!(a.line, b.line);
            assert!(b.stage > a.stage, "{} -> {}", a.key, b.key);
        }
        assert!(b.era >= a.era, "{} (era {}) -> {} (era {})", a.key, a.era, b.key, b.era);
    }
    for f in &c.facilities {
        for g in &c.facilities {
            if f.line == g.line && g.stage > f.stage {
                assert!(g.era >= f.era, "{} -> {}: the era falls along line {}", f.key, g.key, f.line);
            }
        }
    }
    // the powder works and the arsenal are stages of the arms works (design chapter 37, 8.4)
    assert_eq!((line_meta("powder_mill"), line_meta("arsenal")), (("arms_works", 2, 3), ("arms_works", 3, 4)));
    // technologies carry their era
    assert_eq!((c.techs[c.t("T023")].era, c.techs[c.t("T080")].era, c.techs[c.t("T142")].era, c.techs[c.t("T167")].era), (1, 4, 7, 9));
}

/// Unit equipment is written per generation (design chapter 37, table 2.1).
#[test]
fn unit_equipment_is_written_per_generation() {
    let c = content();
    let gens: Vec<u8> = c.unit_tiers.iter().map(|t| t.generation).collect();
    assert_eq!(gens, vec![0, 1, 2, 4, 5, 6]);
    let has = |t: usize, g: Good| c.unit_tiers[t].equipment.iter().any(|(x, _)| *x == g);
    assert!(c.unit_tiers[1].alternative.iter().any(|(g, _)| *g == Good::Tin), "bronze levies");
    assert!(c.unit_tiers[1].maneuver_extra.iter().any(|(g, _)| *g == Good::Horses));
    assert!(has(2, Good::Munitions) && has(4, Good::Aluminium) && has(5, Good::Batteries));
}

/// Every late input except the fictional lattice has a costlier substitute method
/// (design chapter 36, section 5.6): a user that takes it has another method without it.
#[test]
fn every_late_input_but_the_lattice_has_a_substitute() {
    let c = content();
    for g in [Good::Tin, Good::Saltpetre, Good::Helium, Good::Quartz, Good::Lithium, Good::CobaltNickel, Good::UraniumOre, Good::RareEarths, Good::Aluminium] {
        for f in &c.facilities {
            let users: Vec<&crate::content::Recipe> = f.recipes.iter().filter(|r| r.inputs.iter().any(|(x, _)| *x == g)).collect();
            if users.is_empty() {
                continue;
            }
            for u in users {
                let outs: Vec<Good> = u.outputs.iter().map(|x| x.0).collect();
                let alt = f.recipes.iter().any(|r| r.key != u.key && !r.inputs.iter().any(|(x, _)| *x == g) && r.outputs.iter().map(|x| x.0).collect::<Vec<_>>() == outs && r.research.is_some() == u.research.is_some() && (r.out_elec > 0) == (u.out_elec > 0));
                // fission is the use of uranium; fusion and orbital power are its substitutes
                // and plants whose whole purpose is the input have another plant as substitute
                // (the arsenal for the powder works, ammonia for nitrate, fusion for fission)
                let other_plant = matches!(f.key, "fission" | "magnet_works" | "aluminium_smelter" | "fuel_plant" | "powder_mill" | "nitrate_works");
                assert!(alt || other_plant, "{} / {} takes {g:?} with no substitute method", f.key, u.key);
            }
        }
    }
}

#[test]
fn natural_harbours_cities_and_ice_links_are_world_data() {
    let (mut coastal, mut harbours) = (0, 0);
    for i in 0..200 {
        let m = world(&format!("harbour-{i}"), 48);
        for r in &m.world.regions {
            assert!(!r.city_name.is_empty());
            if r.coastal {
                coastal += 1;
                harbours += r.natural_harbour as usize;
            } else {
                assert!(!r.natural_harbour);
            }
        }
        let mut names: Vec<&String> = m.world.regions.iter().map(|r| &r.city_name).collect();
        names.sort();
        names.dedup();
        assert_eq!(names.len(), m.world.regions.len(), "city names are distinct");
        for l in &m.world.ice_links {
            assert!(l.a < l.b);
            for x in [l.a, l.b] {
                let r = &m.world.regions[x as usize];
                let lat = (90 - r.center[1] as i64 * 180 / m.world.height as i64).abs();
                assert!(lat > 52 || r.climate == ClimateZone::Polar, "ice at latitude {lat}");
            }
            assert!(m.world.regions[l.a as usize].neighbors.iter().any(|(n, k)| *n == l.b && *k == LinkKind::Sea));
        }
    }
    let share = harbours * 100 / coastal;
    assert!((30..=40).contains(&share), "natural harbours on {share}% of coasts");
}

#[test]
fn bronze_tools_need_tin_and_helium_comes_only_from_rich_gas() {
    let c = content();
    let rec = |fac: &str, key: &str| c.facilities[c.f(fac)].recipes.iter().find(|r| r.key == key).unwrap();
    let bronze = rec("workshop", "bronze_tools");
    assert!(bronze.inputs.iter().any(|(g, _)| *g == Good::Tin));
    let out = |r: &crate::content::Recipe| r.outputs[0].1;
    assert!(out(bronze) > out(rec("workshop", "copper_tools")), "bronze makes more tools than soft copper");
    // a gas well with separation on a poor field makes no helium; on a rich one, its share
    let mut m = world("helium", 24);
    know_everything(&mut m.world, 0);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 1_000_000);
    endow(&mut m.world, home, Qual::Mechanic, 10_000);
    m.world.regions[home].deposits.retain(|d| d.kind != Deposit::Gas);
    let mut gas = DepositState::new(Deposit::Gas, 1_000_000_000, 10_000);
    gas.helium_bp = 100;
    m.world.regions[home].deposits.push(gas);
    m.world.regions[home].facilities.clear();
    put_works(&mut m.world.regions[home], "gas_well", 2);
    put_works(&mut m.world.regions[home], "waterwheel", 10);
    put_works(&mut m.world.regions[home], "generator", 2);
    m.world.regions[home].hydro = 40;
    m.world.civs[0].stock[Good::Food.index()] = 50_000_000;
    m.world.civs[0].stock[Good::Tools.index()] = 1_000_000;
    let before = m.ledger_snapshot();
    crate::sim::economy::step(&mut m.world, 0);
    assert_balanced(&before, &m.ledger_snapshot());
    let (g, he) = (m.world.civs[0].flows.produced[Good::Gas.index()], m.world.civs[0].flows.produced[Good::Helium.index()]);
    assert!(g > 0, "the wells ran");
    // helium is the field's content of the gas raised, never more
    let raised = m.world.regions[home].deposit(Deposit::Gas).unwrap().drawn;
    assert_eq!(he, raised * 100 / 10_000);
    assert!(he <= 2 * 450);
}

#[test]
#[ignore]
fn print_neighbourhood_sizes() {
    let mut sizes = vec![];
    for i in 0..100 {
        let m = world(&format!("guarantee-{i}"), 48);
        for c in &m.world.civs {
            sizes.push((within_links(&m.world.regions, c.capital as usize, 3).len(), within_links(&m.world.regions, c.capital as usize, 2).len()));
        }
    }
    sizes.sort();
    println!("3 links: median {} max {}; 2 links median {}", sizes[sizes.len() / 2].0, sizes.iter().map(|x| x.0).max().unwrap(), { let mut v: Vec<usize> = sizes.iter().map(|x| x.1).collect(); v.sort(); v[v.len() / 2] });
}
