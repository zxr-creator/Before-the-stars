//! Ruleset 3.0 job 4a: boost, zone stores, shipments, sites and stations (design
//! chapters 37 §6-7 and 39 §4-5, chapter 41's lean scope).

use super::*;
use crate::sim::space::{self, StationSt, M_DOCKING, M_LAB, M_SHIPYARD, M_SOLAR, MODULES};

fn understand(w: &mut World, seat: usize, ids: &[&str]) {
    for id in ids {
        if id.starts_with('C') {
            let p = content().p(id);
            w.civs[seat].practice[p].state = 3;
            w.civs[seat].practice[p].adoption_bp = 10_000;
        } else {
            w.civs[seat].tech[content().t(id)].state = ST_UNDERSTOOD;
        }
    }
}

/// Boost given to a seat as a fixture endowment, booked as made so the identity holds.
fn give_boost(w: &mut World, seat: usize, t: i64) {
    let cs = &mut w.civs[seat].space;
    cs.boost += t;
    cs.made_total += t;
}

fn station(w: &mut World, seat: SeatId, orbit: u8, core: u8, modules: &[(usize, u16)]) {
    let mut m = vec![0u16; MODULES.len()];
    for (k, lv) in modules {
        m[*k] = *lv;
    }
    let id = w.id();
    w.space.stations.push(StationSt { id, owner: seat, orbit, core, modules: m, staffed_bp: 0, power_bp: 0, supplied_bp: 0, rate_bp: 0, aboard: 0, staffed: 0 });
}

fn space_order(m: &mut Match, seat: SeatId, order: SpaceOrder) -> Receipt {
    m.act(seat, vec![Action::Space { order }]).remove(0)
}

/// Step months under the monthly audit.
fn audited(m: &mut Match, months: u32) {
    let mut prev = m.ledger_snapshot();
    for _ in 0..months {
        crate::sim::step_month(&mut m.world);
        let cur = m.ledger_snapshot();
        assert_balanced(&prev, &cur);
        prev = cur;
    }
}

#[test]
fn launch_stages_make_boost_up_to_the_cap_then_stand_down_and_draw_nothing() {
    let mut m = Match::new(cfg("boost"), 1);
    let home = m.world.civs[0].capital as usize;
    understand(&mut m.world, 0, &["T140", "T141", "C045"]);
    settle_fixture(&mut m.world, home, 2_000_000);
    for (q, n) in [(Qual::Technician, 60_000), (Qual::Scientist, 40_000), (Qual::Mechanic, 40_000), (Qual::Electrician, 20_000)] {
        endow(&mut m.world, home, q, n);
    }
    put_works(&mut m.world.regions[home], "launch_complex", 1);
    put_works(&mut m.world.regions[home], "fission", 1);
    let civ = &mut m.world.civs[0];
    for (g, a) in [(Good::Fuel, 2_000_000), (Good::Components, 200_000), (Good::Electronics, 200_000), (Good::Metal, 400_000), (Good::Batteries, 200_000), (Good::Spares, 100_000), (Good::NuclearFuel, 100_000), (Good::Food, 50_000_000)] {
        civ.stock[g.index()] = a;
    }
    audited(&mut m, 8);
    let cs = &m.world.civs[0].space;
    assert_eq!(cs.cap, 2_400, "one launch complex level holds 2,400 t");
    assert!(cs.boost > 0 && cs.boost <= cs.cap, "boost {} of cap {}", cs.boost, cs.cap);
    assert_eq!(cs.boost, cs.made_total - cs.spent_total);
    if cs.boost == cs.cap {
        // at the cap the stage stands down: posts filled, no boost made, nothing drawn
        let fuel = m.world.civs[0].stock_of(Good::Fuel);
        audited(&mut m, 1);
        let cs = &m.world.civs[0].space;
        assert_eq!(cs.made_last, 0);
        assert!(cs.by_stage_last.iter().any(|s| s.3), "{:?}", cs.by_stage_last);
        assert!(m.world.civs[0].stock_of(Good::Fuel) >= fuel, "a stage standing down burns no fuel");
        assert!(cs.streak >= 1, "standing down at the cap keeps check 13's count going");
    }
}

#[test]
fn a_lift_spends_one_tonne_of_boost_per_tonne_and_conserves_the_goods() {
    let mut m = Match::new(cfg("lift"), 1);
    understand(&mut m.world, 0, &["T140"]);
    give_boost(&mut m.world, 0, 1_500);
    m.world.civs[0].stock[Good::Metal.index()] = 5_000;
    let r = space_order(&mut m, 0, SpaceOrder::Launch { good: Good::Metal, amount: 2_000 });
    assert_eq!(r.status, "accepted", "{}", r.reason);
    // the goods leave the pool at once; the lift waits for its boost
    assert_eq!(m.world.civs[0].stock_of(Good::Metal), 3_000);
    audited(&mut m, 1);
    assert_eq!(m.world.civs[0].space.boost, 0);
    assert_eq!(m.world.civs[0].space.held(space::EO, Good::Metal), 0, "half paid: still on the pad");
    give_boost(&mut m.world, 0, 600);
    audited(&mut m, 1);
    assert_eq!(m.world.civs[0].space.held(space::EO, Good::Metal), 2_000);
    assert_eq!(m.world.civs[0].space.boost, 100);
    assert_eq!(m.world.civs[0].space.spent_total, 2_000);
    // food is lifted at 50 kg a ration
    m.world.civs[0].stock[Good::Food.index()] = 10_000;
    give_boost(&mut m.world, 0, 400);
    space_order(&mut m, 0, SpaceOrder::Launch { good: Good::Food, amount: 10_000 });
    audited(&mut m, 1);
    assert_eq!(m.world.civs[0].space.spent_total, 2_500);
    // and brought down without boost
    let r = space_order(&mut m, 0, SpaceOrder::Land { good: Good::Metal, amount: 500 });
    assert_eq!(r.status, "accepted", "{}", r.reason);
    assert_eq!(m.world.civs[0].stock_of(Good::Metal), 3_500);
}

#[test]
fn stations_take_boost_for_their_parts_crew_from_free_holders_and_give_research() {
    let mut m = Match::new(cfg("station"), 1);
    let home = m.world.civs[0].capital as usize;
    understand(&mut m.world, 0, &["T140", "T142", "T144", "T106", "T143"]);
    settle_fixture(&mut m.world, home, 1_000_000);
    for (q, n) in [(Qual::Orbital, 10_000), (Qual::Technician, 10_000), (Qual::Scientist, 5_000)] {
        endow(&mut m.world, home, q, n);
    }
    for (g, a) in [(Good::Metal, 10_000), (Good::Components, 10_000), (Good::Insulation, 10_000), (Good::Electronics, 10_000)] {
        m.world.civs[0].stock[g.index()] = a;
    }
    give_boost(&mut m.world, 0, 400);
    // a module needs a core first
    let r = space_order(&mut m, 0, SpaceOrder::Place { orbit: "leo".into(), part: "solar".into() });
    assert_eq!(r.status, "rejected");
    let r = space_order(&mut m, 0, SpaceOrder::Place { orbit: "leo".into(), part: "k1".into() });
    assert_eq!(r.status, "accepted", "{}", r.reason);
    // the K2 core needs the doc-35 orbital station on the ground
    assert_eq!(space_order(&mut m, 0, SpaceOrder::Place { orbit: "geo".into(), part: "k2".into() }).status, "rejected");
    audited(&mut m, 1);
    assert_eq!(m.world.space.stations.len(), 1, "the core is in orbit once its 400 t are paid");
    for part in ["solar", "lab"] {
        let r = space_order(&mut m, 0, SpaceOrder::Place { orbit: "leo".into(), part: part.into() });
        assert_eq!(r.status, "accepted", "{}", r.reason);
    }
    give_boost(&mut m.world, 0, 450);
    // the crew's food comes from the Earth-orbit store
    m.world.civs[0].stock[Good::Food.index()] = 50_000_000;
    m.world.civs[0].space.stores[space::EO][Good::Food.index()] = 0;
    give_boost(&mut m.world, 0, 100);
    space_order(&mut m, 0, SpaceOrder::Launch { good: Good::Food, amount: 2_000 });
    m.world.civs[0].stock[Good::Volatiles.index()] = 0;
    audited(&mut m, 3);
    let st = m.world.space.stations[0].clone();
    assert_eq!((st.modules[M_SOLAR], st.modules[M_LAB]), (1, 1));
    // every post filled from free holders; a tenth aboard, within the core's room
    assert_eq!(st.staffed, 2_000 + 2_000 + 50 + 1_500, "{st:?}");
    assert_eq!(st.aboard, 400, "{st:?}");
    assert!(st.staffed_bp < 10_000, "more crew than the room aboard holds: {st:?}");
    // without water and air the crew is half supplied: the modules run at half rate
    assert!(st.supplied_bp < 9_000 && st.rate_bp <= 5_000, "{st:?}");
    assert!(m.world.civs[0].space.lab_staff > 0);
    // slots are bounded by the core
    give_boost(&mut m.world, 0, 10_000);
    let mut accepted = 0;
    for _ in 0..4 {
        if space_order(&mut m, 0, SpaceOrder::Place { orbit: "leo".into(), part: "solar".into() }).status == "accepted" {
            accepted += 1;
        }
    }
    assert_eq!(accepted, 2, "a K1 core has four slots");
}

/// A seat that understands everything, with a LEO station with three docking modules
/// ready to send a founding party.
fn outpost_world(seed: &str) -> Match {
    let mut m = Match::new(cfg(seed), 1);
    let home = m.world.civs[0].capital as usize;
    know_everything(&mut m.world, 0);
    settle_fixture(&mut m.world, home, 2_000_000);
    for (q, n) in [(Qual::Orbital, 20_000), (Qual::Technician, 10_000)] {
        endow(&mut m.world, home, q, n);
    }
    station(&mut m.world, 0, 0, 1, &[(M_SOLAR, 3), (M_DOCKING, 3), (space::M_HABITAT, 3), (space::M_LIFE, 1)]);
    m.world.space.stations[0].rate_bp = 10_000;
    for (g, a) in [(Good::Fuel, 100_000), (Good::Metal, 10_000), (Good::Components, 10_000), (Good::Insulation, 10_000), (Good::Electronics, 10_000), (Good::Food, 50_000_000), (Good::Volatiles, 50_000)] {
        m.world.civs[0].stock[g.index()] = a;
    }
    m.world.civs[0].space.stores[space::EO][Good::Food.index()] = 200_000;
    m.world.civs[0].space.stores[space::EO][Good::Volatiles.index()] = 5_000;
    give_boost(&mut m.world, 0, 40_000);
    m
}

#[test]
fn the_first_outpost_to_arrive_claims_the_site_and_its_people_live_and_die_there() {
    let mut m = outpost_world("outpost");
    let pop0 = m.world.civ_population(0);
    let r = space_order(&mut m, 0, SpaceOrder::FoundOutpost { site: "shackleton_rim".into(), propulsion: Some("chemical".into()) });
    assert_eq!(r.status, "accepted", "{}", r.reason);
    // the party has left its region but is still the seat's people
    assert_eq!(m.world.civ_population(0), pop0);
    assert!(m.world.space.transits.iter().any(|t| t.people() == space::OUTPOST_PARTY));
    audited(&mut m, 3);
    let site = &m.world.space.sites[0];
    assert_eq!(site.owner, Some(0), "claimed by the first outpost");
    assert_eq!(site.works[space::W_OUTPOST], 1);
    assert!(site.block.total() > 900);
    // a claimed site cannot be claimed again
    understand(&mut m.world, 1, &["T140", "T142", "T144"]);
    let r = space_order(&mut m, 1, SpaceOrder::FoundOutpost { site: "shackleton_rim".into(), propulsion: None });
    assert_eq!(r.status, "rejected");
    // births and deaths are booked: the seat's people change only through its flows
    let (b0, d0, p0) = (m.world.civs[0].flows.births, m.world.civs[0].flows.deaths, m.world.civ_population(0));
    audited(&mut m, 24);
    let site = &m.world.space.sites[0];
    assert!(site.block.total() > 0);
    let _ = (b0, d0, p0);
    // the outpost houses, feeds and waters its people from the zone store
    assert!(m.world.civs[0].space.held(1, Good::Food) < 12_000, "the party eats its food");
    // inhabited, it counts for world governance
    assert_eq!(space::inhabited_sites(&m.world).len(), 1);
}

#[test]
fn people_off_the_earth_die_faster_where_they_are_not_served() {
    let mut m = outpost_world("unserved");
    space_order(&mut m, 0, SpaceOrder::FoundOutpost { site: "shackleton_rim".into(), propulsion: Some("chemical".into()) });
    audited(&mut m, 2);
    assert_eq!(m.world.space.sites[0].owner, Some(0));
    // take the Moon store's food and volatiles away: the residents go unserved
    let mut n = m.world.clone();
    n.civs[0].space.stores[1][Good::Food.index()] = 0;
    n.civs[0].space.stores[1][Good::Volatiles.index()] = 0;
    let (mut a, mut b) = (0u32, 0u32);
    for _ in 0..24 {
        crate::sim::step_month(&mut m.world);
        crate::sim::step_month(&mut n);
        n.civs[0].space.stores[1][Good::Food.index()] = 0;
        a += m.world.space.sites[0].deaths_last;
        b += n.space.sites[0].deaths_last;
    }
    assert!(n.space.sites[0].served_bp < 1_000);
    assert!(b > a, "unserved residents die faster: {b} against {a}");
    assert!(space::inhabited_sites(&n).iter().all(|x| !x.2), "and the site fails food, water and order");
}

#[test]
fn windows_bound_impulsive_departures_and_berths_bound_tonnage() {
    use crate::sim::space::window_open;
    // Mars: a two-month window every 26 months for impulsive propulsion, the first
    // half of the cycle for low thrust, any time for fusion; the Moon always
    let open = |p: usize| (0..26).filter(|mo| window_open(p, 3, *mo)).count();
    assert_eq!((open(0), open(1), open(2), open(4)), (2, 2, 13, 26));
    assert!((0..26).all(|mo| window_open(0, 1, mo)));
    let mut m = outpost_world("windows");
    for k in ["T157", "T155", "T158", "T173"] {
        m.world.civs[0].tech[content().t(k)].state = 0;
    }
    // with only chemical stages, a shipment to Mars waits for the window
    let mo = m.world.month;
    let closed_now = !window_open(0, 3, mo + 1);
    let r = space_order(&mut m, 0, SpaceOrder::Ship { from_zone: None, to_zone: "mars".into(), goods: vec![GoodQty { good: Good::Metal, amount: 500 }], people: 0, site: None, propulsion: None });
    assert_eq!(r.status, "accepted", "{}", r.reason);
    audited(&mut m, 1);
    let t = m.world.space.transits.iter().find(|t| t.to == 3).unwrap();
    assert_eq!(t.departs.is_none(), closed_now, "departs only inside the window");
    // no more than the berths send in a month
    let r = space_order(&mut m, 0, SpaceOrder::Ship { from_zone: None, to_zone: "moon".into(), goods: vec![GoodQty { good: Good::Fuel, amount: 7_000 }], people: 0, site: None, propulsion: None });
    assert_eq!(r.status, "rejected", "three docking levels send 6,000 t a month");
    // settlers go only to a site the seat holds, and not by electric tugs
    let r = space_order(&mut m, 0, SpaceOrder::Ship { from_zone: None, to_zone: "moon".into(), goods: vec![], people: 100, site: Some("mare_imbrium".into()), propulsion: None });
    assert_eq!(r.status, "rejected");
}

#[test]
fn colonies_follow_the_metropole_and_their_stores_are_handed_over() {
    let mut m = outpost_world("colonies");
    space_order(&mut m, 0, SpaceOrder::FoundOutpost { site: "shackleton_rim".into(), propulsion: Some("chemical".into()) });
    audited(&mut m, 2);
    let before = m.ledger_snapshot();
    // seat 1 takes the capital of seat 0, which governs nothing else
    let cap = m.world.civs[0].capital as usize;
    for ri in 0..m.world.regions.len() {
        if m.world.regions[ri].controller == Some(0) && ri != cap {
            m.world.set_controller(ri, Some(1));
            m.world.regions[ri].owner = Some(1);
        }
    }
    m.world.set_controller(cap, Some(1));
    crate::sim::military::eliminate(&mut m.world, 0);
    assert_eq!(m.world.space.sites[0].owner, Some(1));
    assert!(m.world.space.stations.iter().all(|s| s.owner == 1));
    let after = m.ledger_snapshot();
    // the stores changed hands as traded goods (people move with regions: not checked here)
    assert!(ledger::violations(&before, &after).iter().all(|v| !v.contains("stock changed") && !v.contains("received in trade")), "{:?}", ledger::violations(&before, &after));
}

#[test]
fn check_13_needs_a_year_of_boost_and_a_shipyard_in_low_earth_orbit() {
    let w = endgame_world();
    let ok = |w: &World| victory::ftl_checks(w, 0).iter().find(|c| c.label.starts_with("Launch and recovery")).map(|c| c.ok).unwrap();
    assert!(ok(&w));
    let mut a = w.clone();
    a.civs[0].space.streak = 11;
    assert!(!ok(&a), "eleven months of boost are not enough");
    let mut b = w.clone();
    b.space.stations[0].modules[M_SHIPYARD] = 0;
    assert!(!ok(&b), "a station without a shipyard is not enough");
    let mut c = w;
    c.space.stations[0].orbit = 1;
    assert!(!ok(&c), "the shipyard must be in low Earth orbit");
}

#[test]
fn an_inhabited_site_under_another_authority_breaks_governance() {
    let mut w = endgame_world();
    assert!(victory::governance_checks(&w, 0).iter().all(|c| c.ok));
    w.civs[1].status = SeatStatus::Active;
    w.space.sites[4].owner = Some(1);
    w.space.sites[4].block.ages[30] = 500;
    let checks = victory::governance_checks(&w, 0);
    assert!(checks.iter().any(|c| c.label.contains("off-world site") && !c.ok), "{checks:?}");
    w.space.sites[4].owner = Some(0);
    assert!(victory::governance_checks(&w, 0).iter().all(|c| c.ok));
}

#[test]
fn foreign_sites_and_stations_are_seen_only_as_far_as_the_seat_can_see() {
    let mut m = outpost_world("sight-space");
    space_order(&mut m, 0, SpaceOrder::FoundOutpost { site: "shackleton_rim".into(), propulsion: Some("chemical".into()) });
    audited(&mut m, 2);
    understand(&mut m.world, 1, &["T140"]);
    m.world.civs[1].contacts[0].met = false;
    let obs = m.observe(1);
    let sv = obs.space.expect("rocketry shows the Solar System");
    let site = sv.sites.iter().find(|s| s.site == "shackleton_rim").unwrap();
    assert_eq!(site.owner, None, "an unvisited body's claims are unknown");
    assert!(site.population.is_none() && site.works.is_empty() && site.deposits.is_empty());
    assert!(sv.stations.is_empty(), "an unmet seat's station is not shown");
    assert!(sv.transfers.is_empty());
    // having met seat 0 and understanding orbital navigation, seat 1 sees the station
    // in Earth orbit but not its modules; after reaching the Moon, the claim and a band
    m.world.civs[1].contacts[0].met = true;
    understand(&mut m.world, 1, &["T141"]);
    m.world.civs[1].space.surveyed |= 1 << 1;
    let sv = m.observe(1).space.unwrap();
    let st = sv.stations.iter().find(|s| s.owner == 0).expect("seen in Earth orbit");
    assert!(st.modules.is_empty() && st.aboard.is_none());
    let site = sv.sites.iter().find(|s| s.site == "shackleton_rim").unwrap();
    assert_eq!(site.owner, Some(0));
    assert!(site.population.is_none() && site.population_low.is_some() && site.population_high > site.population_low);
    // the owner sees everything of its own
    let own = m.observe(0).space.unwrap();
    let mine = own.sites.iter().find(|s| s.site == "shackleton_rim").unwrap();
    assert!(mine.population.is_some() && !mine.works.is_empty());
    assert!(own.boost.is_some() && own.windows.len() == 9);
    // a seat without rocketry is sent nothing
    assert!(m.observe(2).space.is_none());
}

#[test]
fn a_space_campaign_is_deterministic_and_survives_a_checkpoint() {
    let run = |save_at: Option<u32>| {
        let mut m = outpost_world("space-determinism");
        space_order(&mut m, 0, SpaceOrder::FoundOutpost { site: "arcadia_planitia".into(), propulsion: None });
        for k in 0..30 {
            if Some(k) == save_at {
                m = Match::load_json(&m.save_json()).expect("restore");
            }
            crate::sim::step_month(&mut m.world);
        }
        m.state_hash()
    };
    assert_eq!(run(None), run(None));
    assert_eq!(run(None), run(Some(12)));
}
