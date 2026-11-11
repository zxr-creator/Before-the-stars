//! Ruleset 3.0 slice 6: labour productivity (design chapter 36, section 4; chapter
//! 37, section 8.3).

use super::*;
use crate::sim::productivity::{self, civ_tables, era_cap, general_posts_for, ERA_CAPS};

/// A seat that knows everything, with a capital of a million people running a few
/// works on ample stock.
fn works_world(seed: &str) -> (Match, usize) {
    let mut m = Match::new(cfg(seed), 1);
    know_everything(&mut m.world, 0);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 3_000_000);
    endow(&mut m.world, home, Qual::Artisan, 200_000);
    endow(&mut m.world, home, Qual::Smith, 50_000);
    endow(&mut m.world, home, Qual::Literate, 600_000);
    let r = &mut m.world.regions[home];
    r.facilities.clear();
    r.hydro = 40;
    put_works(r, "quarry", 4);
    put_works(r, "workshop", 4);
    put_works(r, "fields", 20);
    r.arable = 40;
    for (g, n) in [(Good::Food, 500_000_000), (Good::Tools, 10_000), (Good::Metal, 1_000_000), (Good::Timber, 1_000_000), (Good::Materials, 0)] {
        m.world.civs[0].stock[g.index()] = n;
    }
    (m, home)
}

#[test]
fn productivity_frees_people_and_never_makes_goods() {
    // the same works, the same month, with every factor at one and with the factors
    // of a seat that knows everything: the same goods, fewer posts
    let run = |neutral: bool| {
        productivity::set_neutral(neutral);
        let (mut m, home) = works_world("productivity-goods");
        let before = m.ledger_snapshot();
        crate::sim::economy::step(&mut m.world, 0);
        assert_balanced(&before, &m.ledger_snapshot());
        // what the works made (household craft by idle adults is not a works)
        let made: Vec<i64> = [Good::Materials, Good::Tools].iter().map(|g| m.world.regions[home].last.infra.made[g.index()]).collect();
        let posts: u32 = m.world.regions[home].facilities.iter().filter(|f| !content().facilities[f.kind].food).map(|f| f.staff_needed).sum();
        let lp = m.world.regions[home].fac(content().f("workshop")).unwrap().lp_bp;
        let rates: Vec<u16> = m.world.regions[home].facilities.iter().filter_map(|f| f.run.as_ref().map(|r| r.rate_bp)).collect();
        productivity::set_neutral(false);
        (made, posts, lp, rates)
    };
    let (made0, posts0, lp0, rates0) = run(true);
    let (made1, posts1, lp1, rates1) = run(false);
    assert_eq!(lp0, 10_000);
    assert!(lp1 > 10_000, "a seat that knows everything works more productively: {lp1}");
    assert!(posts1 < posts0, "{posts1} posts against {posts0}");
    // the works ran at full rate both times and made exactly the same
    assert!(rates0.iter().chain(rates1.iter()).all(|r| *r == 10_000), "{rates0:?} {rates1:?}");
    assert_eq!(made0, made1, "productivity changes who works, not what a level makes");
}

#[test]
fn posts_follow_the_formula_and_the_breakdown_multiplies_to_the_total() {
    let (mut m, home) = works_world("productivity-formula");
    crate::sim::economy::step(&mut m.world, 0);
    let c = content();
    let r = &m.world.regions[home];
    let f = r.fac(c.f("workshop")).unwrap();
    let def = &c.facilities[f.kind];
    let rec = &def.recipes[f.run.as_ref().unwrap().recipe];
    let skilled: u32 = def.skilled.iter().map(|(_, n)| productivity::qualified_posts_for(*n * f.level as u32, f.lpq_bp as i64)).sum();
    let general = general_posts_for(def.general, f.level as u32, rec.general_bp, f.staff_saving_bp, f.lp_bp as i64);
    assert_eq!(f.staff_needed, skilled + general);
    // the breakdown shown to the seat multiplies to its total, which bounds every works
    let obs = m.observe(0);
    let own = obs.regions.iter().find(|x| x.id as usize == home).unwrap().own.clone().unwrap();
    assert_eq!(own.productivity.len(), Sector::COUNT);
    for p in &own.productivity {
        let mut v: i64 = 10_000;
        for fv in p.factors.iter().filter(|x| x.source != "automation") {
            v = v * fv.bp as i64 / 10_000;
        }
        assert_eq!(v.clamp(5_000, 40_000), p.total_bp as i64, "{:?}", p.sector);
        assert!(p.factors.iter().all(|x| !x.detail.is_empty()));
    }
    let industry = own.productivity.iter().find(|p| p.sector == Sector::Industry).unwrap();
    assert!(industry.total_bp as u16 >= f.lp_bp, "a works of an older era gets at most the sector's total");
    let view = own.facilities.iter().find(|x| x.kind == "workshop").unwrap();
    assert!(view.posts_base >= view.posts_after_scale && view.posts_after_scale >= view.posts_after_productivity);
    assert_eq!(view.posts_after_productivity, f.staff_needed);
}

/// A works of era `e` receives no technology factor from technologies of an era
/// later than `e + 1` (design chapter 37, section 8.3).
#[test]
fn old_works_do_not_get_the_productivity_of_new_technology() {
    let m = {
        let mut m = Match::new(cfg("productivity-eras"), 1);
        know_everything(&mut m.world, 0);
        m
    };
    let c = content();
    let t = civ_tables(&m.world.civs[0]);
    for (sector, id, bp) in productivity::TECH_BONUS {
        let era = c.techs[c.t(id)].era as usize;
        for cap in 0..ERA_CAPS {
            let counted: i64 = productivity::TECH_BONUS.iter().filter(|(s, x, _)| s == sector && c.techs[c.t(x)].era as usize <= cap).map(|x| x.2).sum();
            assert_eq!(t.tech[sector.index()][cap], 10_000 + counted);
        }
        assert!(*bp > 0 && era <= 9);
    }
    // stone-age workshops (era 0) count technologies to era 1 only: not interchangeable parts
    let ws = &c.facilities[c.f("workshop")];
    assert_eq!(era_cap(ws, 0), 1);
    assert!(t.tech[Sector::Industry.index()][era_cap(ws, 0)] < t.tech[Sector::Industry.index()][ERA_CAPS - 1]);
    // fields worked by machine are modern farming: their method's era counts
    let fields = &c.facilities[c.f("fields")];
    let mech = crate::sim::economy::field_method_index("intensive").unwrap();
    assert!(era_cap(fields, productivity::field_method_era(mech)) >= 6);
}

#[test]
fn every_factor_is_bounded() {
    use productivity::city_factor;
    for class in SettlementKind::ALL {
        for s in Sector::ALL {
            for (p, wbp, hp) in [(0, 0, 8_000), (10_000, 10_000, 0), (5_000, 3_000, 2_000)] {
                let f = city_factor(*class, *s, p, wbp, hp);
                assert!((8_000..=12_500).contains(&f), "{class:?} {s:?}: {f}");
            }
        }
    }
    // the bounds of the product, whatever the factors
    let f = productivity::RegionFactors { edu: 15_000, cul: [13_000; 6], rel: [11_500; 6], city: [12_500; 6], health: 10_000 };
    assert_eq!(f.lp(Sector::Industry, 20_000), 40_000);
    let f = productivity::RegionFactors { edu: 10_000, cul: [8_500; 6], rel: [9_000; 6], city: [8_000; 6], health: 6_000 };
    assert_eq!(f.lp(Sector::Industry, 10_000), 5_000);
    // the construction factor is at most one and a half
    let (mut m, home) = works_world("productivity-construction");
    crate::sim::economy::step(&mut m.world, 0);
    assert!((10_000..=15_000).contains(&m.world.regions[home].last.construction_bp));
}

/// Fields: fewer cultivators a level with productivity, the same rations a level,
/// never more than twice the method's base.
#[test]
fn field_yield_per_level_is_capped_at_twice_the_method() {
    let (mut m, home) = works_world("productivity-fields");
    m.world.regions[home].wild = 0;
    m.world.civs[0].stock[Good::Food.index()] = 0;
    for g in [Good::Fertilizer, Good::Fuel, Good::Horses, Good::Chemicals] {
        m.world.civs[0].stock[g.index()] = 100_000_000;
    }
    crate::sim::economy::step(&mut m.world, 0);
    let run = m.world.regions[home].fac(content().f("fields")).unwrap().field_run.clone().unwrap();
    let method = &crate::sim::economy::FIELD_METHODS[run.recipe];
    let food = m.world.regions[home].last.food_made;
    let worked_levels = 20 * run.rate_bp as i64 / 10_000;
    assert!(food <= method.rations * 2 * 20, "{food} rations from twenty levels of {}", method.key);
    assert!(worked_levels > 0);
}
