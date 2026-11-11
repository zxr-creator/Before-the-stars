//! Buildings, land, cities, migration and transport (design chapter 37, section 8;
//! chapter 38, sections 2-5; chapter 41's lean scope).

use super::*;
use crate::sim::{cities, migration, network};

fn know(w: &mut World, seat: usize, ids: &[&str]) {
    for id in ids {
        w.civs[seat].tech[content().t(id)].state = ST_UNDERSTOOD;
    }
}

fn home_world(seed: &str, people: u32) -> (Match, usize) {
    let mut m = Match::new(cfg(seed), 1);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, people);
    (m, home)
}

fn upgrade(m: &mut Match, region: usize, from: &str, to: &str, levels: u16) -> Receipt {
    m.act(0, vec![Action::StartProject { spec: ProjectSpec::Upgrade { region: region as RegionId, from: from.into(), to: to.into(), levels }, priority: Some(1) }]).remove(0)
}

#[test]
fn an_upgrade_idles_the_old_levels_charges_sixty_percent_and_cancelling_returns_them() {
    let (mut m, home) = home_world("upgrade", 1_000_000);
    know(&mut m.world, 0, &["T027", "T050"]);
    put_works(&mut m.world.regions[home], "roads", 3);
    let full = crate::sim::projects::build_quote(&m.world, 0, content().f("engineered_roads"));
    let r = upgrade(&mut m, home, "roads", "engineered_roads", 2);
    assert_eq!(r.status, "accepted", "{}", r.reason);
    // two of the three levels stopped work when the order opened
    assert_eq!(m.world.regions[home].fac_level("roads"), 1);
    let p = m.world.civs[0].projects.last().unwrap().clone();
    assert_eq!(p.kind, ProjKind::Upgrade { from: content().f("roads"), to: content().f("engineered_roads"), levels: 2 });
    assert_eq!(p.work_needed, (full.work * 6_000 + 9_999) / 10_000 * 2);
    for ((g, a), (g2, need, _)) in full.cost.iter().zip(p.inputs.iter()) {
        assert_eq!((g, (a * 6_000 + 9_999) / 10_000 * 2), (g2, *need));
    }
    assert_eq!(p.min_months, full.months, "the minimum months are the successor's in full");
    // cancelling returns the levels
    let id = p.id;
    let r = m.act(0, vec![Action::ManageProject { project: id, op: ManageOp::Cancel, priority: None, position: None }]).remove(0);
    assert_eq!(r.status, "accepted");
    assert_eq!(m.world.regions[home].fac_level("roads"), 3);
    // completion moves them to the successor
    upgrade(&mut m, home, "roads", "engineered_roads", 2);
    let p = m.world.civs[0].projects.pop().unwrap();
    crate::sim::projects::complete_for_test(&mut m.world, 0, p);
    assert_eq!((m.world.regions[home].fac_level("roads"), m.world.regions[home].fac_level("engineered_roads")), (1, 2));
    // a conversion along no edge, or of more levels than stand there, is refused
    assert_eq!(upgrade(&mut m, home, "roads", "rail", 1).status, "rejected");
    assert_eq!(upgrade(&mut m, home, "roads", "engineered_roads", 2).status, "rejected");
}

#[test]
fn demolition_recovers_a_quarter_of_materials_metal_and_components() {
    let (mut m, home) = home_world("salvage", 1_000_000);
    put_works(&mut m.world.regions[home], "rail", 2);
    let def = &content().facilities[content().f("rail")];
    let before = m.world.civs[0].stock.clone();
    let r = m.act(0, vec![Action::Demolish { region: home as RegionId, facility: "rail".into(), levels: 1 }]).remove(0);
    assert_eq!(r.status, "accepted");
    assert_eq!(m.world.regions[home].fac_level("rail"), 1);
    for (g, a) in &def.cost {
        let back = m.world.civs[0].stock[g.index()] - before[g.index()];
        let want = if matches!(g, Good::Materials | Good::Metal | Good::Components) { a / 4 } else { 0 };
        assert_eq!(back, want, "{g:?}");
        assert_eq!(m.world.civs[0].flows.salvaged[g.index()], want);
    }
}

#[test]
fn works_two_eras_behind_with_a_buildable_successor_are_obsolete() {
    let (mut m, home) = home_world("obsolete", 1_000_000);
    put_works(&mut m.world.regions[home], "roads", 1);
    put_works(&mut m.world.regions[home], "holy_site", 1);
    let roads = content().f("roads");
    let def = &content().facilities[roads];
    m.world.civs[0].era.era = 3;
    m.world.civs[0].successors = crate::sim::projects::successor_table(&m.world, 0);
    assert!(!crate::sim::projects::is_obsolete(&m.world.civs[0], roads), "no successor known yet");
    know(&mut m.world, 0, &["T027", "T050"]);
    m.world.civs[0].successors = crate::sim::projects::successor_table(&m.world, 0);
    assert!(crate::sim::projects::is_obsolete(&m.world.civs[0], roads));
    assert_eq!(crate::sim::eras::upkeep_bp(&m.world.civs[0], def, Good::Tools, 0), 12_500, "obsolete works cost a quarter more to keep");
    // a line without a successor never becomes obsolete
    assert!(!crate::sim::projects::is_obsolete(&m.world.civs[0], content().f("holy_site")));
    m.world.civs[0].era.era = 2;
    assert!(!crate::sim::projects::is_obsolete(&m.world.civs[0], roads), "one era behind is not obsolete");
}

#[test]
fn the_public_tree_is_static_masked_and_leaves_out_sealed_content() {
    let tree = crate::observe::building_tree();
    let json = crate::observe::building_tree_json();
    let c = content();
    // no technology or practice is named or identified
    for t in &c.techs {
        assert!(!json.contains(&format!("\"{}\"", t.id)), "{} appears", t.id);
    }
    for p in &c.practices {
        assert!(!json.contains(&format!("\"{}\"", p.id)), "{} appears", p.id);
    }
    fn leaves(r: &ReqExpr, out: &mut Vec<ReqExpr>) {
        match r {
            ReqExpr::All { of } | ReqExpr::Any { of } => of.iter().for_each(|x| leaves(x, out)),
            x => out.push(x.clone()),
        }
    }
    let mut all = Vec::new();
    for n in &tree.nodes {
        leaves(&n.requires, &mut all);
    }
    assert!(all.iter().any(|l| matches!(l, ReqExpr::Tech { .. })));
    // sealed content is absent, and so are its edges
    for key in ["jump_testbed", "jump_yard", "jump_base", "lattice_works"] {
        assert!(!tree.nodes.iter().any(|n| n.key == key), "{key} is listed");
        assert!(!tree.edges.iter().any(|e| e.from == key || e.to == key));
    }
    // upgrades are listed at 60%
    let e = tree.edges.iter().find(|e| e.from == "rail" && e.to == "electric_rail").unwrap();
    assert_eq!((e.cost_bp, e.work_bp, e.kind.as_str()), (6_000, 6_000, "upgrade"));
    // identical for every seat and match of the content: the observation names its hash
    let a = Match::new(cfg("tree-a"), 1);
    let b = Match::new(cfg("tree-b"), 2);
    assert_eq!(a.observe(0).building_tree_hash, tree.hash);
    assert_eq!(b.observe(1).building_tree_hash, tree.hash);
    let mut t2 = tree.clone();
    t2.hash = String::new();
    assert_eq!(format!("{:016x}", {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for byte in serde_json::to_string(&t2).unwrap().bytes() {
            h ^= byte as u64;
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
        h
    }), tree.hash);
}

#[test]
fn towns_take_farmland_and_housing_gives_it_back() {
    let (mut m, home) = home_world("land", 8_000_000);
    let r = &mut m.world.regions[home];
    r.arable = 60;
    r.terrain = Terrain::Plains;
    // most of the region away from the land, with a railway and highways
    r.last.labor.food = 100_000;
    put_works(r, "rail", 2);
    put_works(r, "highways", 2);
    put_works(r, "workshop", 100);
    r.facilities.iter_mut().for_each(|f| f.staffed = if content().facilities[f.kind].key == "workshop" { 2_000_000 } else { 0 });
    let land = cities::land_use(&m.world.regions[home]);
    assert!(land.urban > 0 && land.urban_on_arable > 0);
    // a share of the town and works stands on what was arable: arable land left
    // = arable less (urban + industrial) x arable / (arable + rough)
    let rough = cities::rough_land(Terrain::Plains) * 1000;
    assert_eq!(land.urban_on_arable, (land.urban + land.industrial) * 60_000 / (60_000 + rough));
    assert_eq!(land.arable_left() as i64, (60_000 - land.urban_on_arable) / 1000);
    let fields = &content().facilities[content().f("fields")];
    let cap = crate::sim::economy::level_cap(&m.world, 0, home, fields);
    // (below the practices that lift the early four-level cap)
    assert_eq!(cap, land.arable_left().min(4));
    // housing levels take less land than the same people living informally
    put_works(&mut m.world.regions[home], "towers", 2);
    let housed = cities::land_use(&m.world.regions[home]);
    assert!(housed.urban < land.urban && housed.arable_left() >= land.arable_left());
    assert_eq!(housed.housed, 2_000_000.min(housed.housed + housed.informal));
    // fields beyond the land the town leaves give way on 1 January, five levels a year at most
    put_works(&mut m.world.regions[home], "towers", 0);
    m.world.regions[home].facilities.retain(|f| f.level > 0);
    put_works(&mut m.world.regions[home], "fields", 60);
    m.world.month = 12;
    cities::encroach(&mut m.world, 0);
    assert_eq!(m.world.regions[home].fac_level("fields"), 60 - (60 - land.arable_left()).min(cities::ENCROACH_PER_YEAR));
}

#[test]
fn a_region_is_fed_from_the_common_stock_only_as_far_as_its_stores_reach() {
    let fed = |granaries: u16| -> u16 {
        let (mut m, home) = home_world("provision", 3_000_000);
        for r in m.world.regions.iter_mut() {
            r.last.food_made = 0;
            r.facilities.clear();
        }
        if granaries > 0 {
            put_works(&mut m.world.regions[home], "granary", granaries);
        }
        m.world.civs[0].stock[Good::Food.index()] = 100_000_000;
        crate::sim::population::step(&mut m.world, 0);
        m.world.regions[home].food_hist[0]
    };
    let none = fed(0);
    let some = fed(12);
    assert!(none < 2_000, "100,000 of 3 million reach the stores without granaries: {none}");
    assert!(some > none * 5, "{some} with twelve granaries");
    let (m, home) = home_world("provision-cap", 3_000_000);
    let r = &m.world.regions[home];
    assert_eq!(cities::provision_capacity(r), (cities::PROVISION_BASE + r.cap(crate::content::Cap::Provision)) * network::access_bp(r) / 10_000);
}

#[test]
fn the_city_follows_off_land_work_concentration_and_site() {
    let (mut m, home) = home_world("city", 4_000_000);
    let r = &mut m.world.regions[home];
    r.facilities.clear();
    r.last.labor.food = 1_000_000;
    r.last.food_equiv = 1_000_000;
    put_works(r, "workshop", 10);
    r.facilities[0].staffed = 1_000_000;
    let r = &m.world.regions[home];
    // half the work is off the land: urban share = 50% x 3,000 (+500 at the water)
    assert_eq!(cities::off_land_bp(r), 5_000);
    let c = cities::concentration_bp(r);
    assert_eq!(cities::urban_share(r), 5_000 * c / 10_000);
    let pop = r.population() as i64;
    assert_eq!(cities::city_size(&m.world, home) as i64, pop * cities::urban_share(r) / 10_000 * cities::primacy(&m.world, home) / 10_000);
    // primacy: 30% plus three tenths of the site score, +10% at the capital, within 30-50%
    assert_eq!(cities::primacy(&m.world, home), (3_000 + cities::site_score(r) * 3 / 10 + 1_000).clamp(3_000, 5_000));
    // a railway concentrates people in towns
    put_works(&mut m.world.regions[home], "rail", 1);
    assert_eq!(cities::concentration_bp(&m.world.regions[home]), c + 1_000);
    // the classes of the principal city
    assert_eq!(cities::class_of(9_999), SettlementKind::Camp);
    assert_eq!(cities::class_of(50_000), SettlementKind::Town);
    assert_eq!(cities::class_of(5_000_000), SettlementKind::Metropolis);
    assert_eq!(cities::class_of(20_000_000), SettlementKind::Megalopolis);
}

#[test]
fn cities_and_walls_strengthen_defenders_up_to_twice_and_slow_capture() {
    let (mut m, home) = home_world("defence", 1_000_000);
    m.world.regions[home].facilities.clear();
    let bare = cities::defence_bp(&m.world, home, 10_500, 0);
    put_works(&mut m.world.regions[home], "walls", 1);
    assert_eq!(cities::fort_bp(&m.world.regions[home], 1), 3_000);
    assert_eq!(cities::fort_bp(&m.world.regions[home], 2), 1_500);
    assert_eq!(cities::fort_bp(&m.world.regions[home], 3), 0, "walls do not stop later armies");
    assert_eq!(cities::defence_bp(&m.world, home, 10_500, 0), (bare * 10_000 / 10_500 * 10_500 / 10_000).max(bare) + 10_500 * 3_000 / 10_000);
    assert!(cities::defence_bp(&m.world, home, 20_000, 0) <= 20_000);
    assert_eq!(cities::urban_defence_bp(SettlementKind::Metropolis), 2_500);
    assert_eq!((cities::capture_months(SettlementKind::Town), cities::capture_months(SettlementKind::Megalopolis)), (5, 8));
}

#[test]
fn migration_moves_people_without_creating_or_losing_any() {
    let mut m = Match::new(cfg("migration"), 1);
    run_rounds(&mut m, 2);
    let w = &mut m.world;
    // two regions of one seat: a crowded, jobless one and a hiring one with a railway
    let home = w.civs[0].capital as usize;
    let other = w.regions[home].neighbors.iter().map(|(n, _)| *n as usize).find(|n| w.regions[*n].controller.is_none()).unwrap();
    w.set_controller(other, Some(0));
    w.regions[other].owner = Some(0);
    settle_fixture(w, other, 1_000_000);
    settle_fixture(w, home, 3_000_000);
    w.regions[home].last.labor.household = 2_000_000;
    w.regions[other].last.labor.household = 0;
    put_works(&mut w.regions[other], "workshop", 30);
    let k = content().f("workshop");
    w.regions[other].fac_mut(k).unwrap().staff_needed = 600_000;
    for r in [home, other] {
        put_works(&mut w.regions[r], "rail", 1);
    }
    let a0 = (migration::attractiveness(w, home), migration::attractiveness(w, other));
    assert!(a0.1 > a0.0 + migration::THRESHOLD_INTERNAL, "{a0:?}");
    let before: u64 = w.regions.iter().map(|r| r.population() as u64).sum();
    let snap = crate::ledger::snapshot(w, false);
    let pops = (w.regions[home].population(), w.regions[other].population());
    // voluntary moves are decided on 1 January
    assert_eq!(w.month % 12, 0);
    migration::step(w);
    let after: u64 = w.regions.iter().map(|r| r.population() as u64).sum();
    assert_eq!(before, after, "migration neither creates nor loses people");
    assert!(w.regions[home].population() < pops.0 && w.regions[other].population() > pops.1);
    // every mover is booked (the seat may hold further regions whose people move too)
    let moved = w.civs[0].flows.moved_internal as i64;
    let left_home = (pops.0 - w.regions[home].population()) as i64;
    assert!(moved >= left_home, "{moved} booked, {left_home} left the crowded region");
    // at most the railway's mobility cap a year
    assert!(left_home <= pops.0 as i64 * 150 / 10_000 + 1, "{left_home}");
    assert!(crate::ledger::violations(&snap, &crate::ledger::snapshot(w, false)).iter().all(|v| !v.contains("people")));
}

#[test]
fn borders_decide_who_crosses_and_refugees_cross_even_closed_ones_at_half_rate() {
    let mut m = Match::new(cfg("borders"), 1);
    let w = &mut m.world;
    // find two seats with adjacent regions
    let (mut a, mut b) = (usize::MAX, usize::MAX);
    'find: for (i, r) in w.regions.iter().enumerate() {
        for (n, _) in &r.neighbors {
            let j = *n as usize;
            if r.controller.is_none() && w.regions[j].controller.is_none() {
                a = i;
                b = j;
                break 'find;
            }
        }
    }
    w.set_controller(a, Some(0));
    w.set_controller(b, Some(1));
    settle_fixture(w, a, 2_000_000);
    settle_fixture(w, b, 2_000_000);
    w.civs[0].contacts[1].met = true;
    w.civs[1].contacts[0].met = true;
    // a war in region a: refugees go to b
    w.civs[1].immigration = Immigration::Closed;
    w.regions[a].owner = Some(1);
    w.regions[a].occupied_since = Some(w.month);
    assert!(migration::distress_bp(w, a) >= 100);
    let pops = (w.regions[a].population(), w.regions[b].population());
    if migration::attractiveness(w, b) > migration::attractiveness(w, a) {
        migration::step(w);
        let moved = pops.0 - w.regions[a].population();
        assert!(moved > 0 && moved as i64 <= pops.0 as i64 * 50 / 10_000 + 1, "half of 100 bp across a closed border: {moved}");
        assert_eq!(w.civs[0].flows.emigrated, w.civs[1].flows.immigrated);
        assert_eq!(w.civs[0].flows.refugees, moved);
    }
}

#[test]
fn links_carry_the_lower_end_and_the_least_loss() {
    let mut a = Region::clone(&Match::new(cfg("links"), 1).world.regions[0]);
    a.facilities.clear();
    let mut b = a.clone();
    let (na, nb) = (network::net(&a), network::net(&b));
    assert_eq!(network::link(&na, &nb, LinkKind::Land, true, false), (network::TRACK_LOSS, network::TRACK_FREIGHT));
    put_works(&mut a, "rail", 3);
    put_works(&mut b, "rail", 1);
    put_works(&mut b, "roads", 2);
    let (na, nb) = (network::net(&a), network::net(&b));
    // the railway on the link has the lower level count; roads need both ends
    assert_eq!(network::link(&na, &nb, LinkKind::Land, true, false), (150, network::TRACK_FREIGHT + 200));
    // a better stage at one end only carries at the lower stage
    put_works(&mut a, "electric_rail", 1);
    let na = network::net(&a);
    assert_eq!(network::link(&na, &nb, LinkKind::Land, true, false).0, 150);
    // passes take half the capacity and half again the loss
    assert_eq!(network::link(&na, &nb, LinkKind::Pass, true, false), (225, network::TRACK_FREIGHT + 100));
    // sea links need harbours at both ends; ocean sailing lowers the first harbour's loss
    put_works(&mut a, "port", 1);
    put_works(&mut b, "port", 1);
    let (na, nb) = (network::net(&a), network::net(&b));
    assert_eq!(network::link(&na, &nb, LinkKind::Sea, true, false).0, 600);
    assert_eq!(network::link(&na, &nb, LinkKind::Sea, true, true).0, 300);
    // freight capacity is ten plus each level's freight
    assert_eq!(network::freight_capacity(&a), 10 + 3 * 20 + 25 + 6);
}
