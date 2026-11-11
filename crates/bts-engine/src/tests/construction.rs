//! Construction that consumes real things, and the regional queues
//! (`docs/units-and-scale.md` section 6; design chapter 35, slice C).
//!
//! An order needs goods, work, a qualified site crew, site power and time. Each
//! test takes one of them away, or checks that what the seat was quoted is what
//! it is charged, with the conservation audit run on every month it resolves.

use super::*;

/// A seat that knows everything, with a capital of three million, full stores, no
/// works and nobody qualified: whatever a test then gives or withholds is the only
/// thing that can hold an order back. Site engines get no coal or fuel unless the
/// test supplies it.
fn site_world(seed: &str) -> (Match, RegionId, usize) {
    let mut m = Match::new(cfg(seed), 1);
    know_everything(&mut m.world, 0);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    settle_fixture(&mut m.world, home, 3_000_000);
    {
        let r = &mut m.world.regions[home];
        r.water = 30_000_000;
        r.wild = 30_000_000;
        r.arable = 40;
        r.forest = 30;
        r.hydro = 40;
        r.river = true;
        r.facilities.clear();
    }
    for q in 0..NQ {
        m.world.civs[0].qual_flows.initial[q] -= m.world.regions[home].quals[q] as i64;
        m.world.regions[home].quals[q] = 0;
    }
    for g in Good::ALL {
        m.world.civs[0].stock[g.index()] = 50_000_000;
    }
    m.world.civs[0].stock[Good::Coal.index()] = 0;
    m.world.civs[0].stock[Good::Fuel.index()] = 0;
    m.world.civs[0].stability = 90;
    (m, capital, home)
}

fn order(m: &mut Match, region: RegionId, facility: &str, levels: u16) -> u32 {
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region, facility: facility.into(), levels }, priority: None }]);
    assert_eq!(r[0].status, "accepted", "{facility}: {}", r[0].reason);
    r[0].created.expect("the order's id")
}

fn project(m: &Match, id: u32) -> &Project {
    m.world.civs[0].projects.iter().find(|p| p.id == id).expect("the order is still open")
}

fn open(m: &Match, id: u32) -> bool {
    m.world.civs[0].projects.iter().any(|p| p.id == id)
}

fn manage(m: &mut Match, project: u32, op: ManageOp, priority: Option<u8>, position: Option<u16>) {
    let r = m.act(0, vec![Action::ManageProject { project, op, priority, position }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
}

/// One month, with the books checked. The fixture's food stores are refilled before
/// the month opens, so that over the years some of these tests run the foragers
/// never have to take the hands the orders are waiting for.
fn audited_month(m: &mut Match) {
    m.world.civs[0].stock[Good::Food.index()] = 50_000_000;
    let before = m.ledger_snapshot();
    crate::sim::step_month(&mut m.world);
    assert_balanced(&before, &m.ledger_snapshot());
}

/// The labour of one month and the orders it serves, without births, deaths or the
/// calendar: for checks that count heads exactly.
fn labour_month(m: &mut Match) {
    let before = m.ledger_snapshot();
    crate::sim::economy::step(&mut m.world, 0);
    crate::sim::projects::step(&mut m.world, 0);
    assert_balanced(&before, &m.ledger_snapshot());
}

fn quote(m: &Match, region: RegionId, facility: &str) -> BuildSiteView {
    m.observe(0).regions.into_iter().find(|r| r.id == region).unwrap().own.unwrap().construction_sites.into_iter().find(|s| s.kind == facility).unwrap_or_else(|| panic!("no quote for {facility}"))
}

fn queue(m: &Match, region: RegionId) -> Vec<QueueEntry> {
    m.observe(0).regions.into_iter().find(|r| r.id == region).unwrap().own.unwrap().construction_queue
}

/// A second governed region, empty of people, holding one idle level of each kind
/// named: the seat then has an installation of the kind, so the next is not the first.
fn already_built(m: &mut Match, home: usize, kinds: &[&str]) -> usize {
    let other = (0..m.world.regions.len()).find(|i| *i != home && m.world.regions[*i].controller.is_none()).expect("a free region");
    m.world.regions[other].owner = Some(0);
    m.world.regions[other].controller = Some(0);
    for kind in kinds {
        put_works(&mut m.world.regions[other], kind, 1);
    }
    for f in m.world.regions[other].facilities.iter_mut() {
        f.enabled = false;
    }
    other
}

#[test]
fn an_order_stalls_without_each_thing_it_needs_and_resumes_when_it_is_supplied() {
    let steel = |m: &mut Match, capital: RegionId, home: usize| -> u32 {
        endow(&mut m.world, home, Qual::Builder, 20_000);
        endow(&mut m.world, home, Qual::Mechanic, 20_000);
        m.world.civs[0].stock[Good::Coal.index()] = 1_000_000;
        order(m, capital, "steelworks", 1)
    };
    let stalled = |m: &Match, id: u32, blocker: &str| {
        let p = project(m, id);
        assert_eq!(p.last_progress, 0, "the order advanced without {blocker:?}: {:?}", p.blockers);
        assert_eq!(p.work_done, 0);
        assert!(p.blockers.iter().any(|b| b.contains(blocker)), "{:?} does not say {blocker:?}", p.blockers);
    };

    // ---- a material ------------------------------------------------------------------
    let (mut m, capital, home) = site_world("stall-goods");
    let id = steel(&mut m, capital, home);
    m.world.civs[0].stock[Good::Metal.index()] = 0;
    for _ in 0..3 {
        audited_month(&mut m);
        stalled(&m, id, "Waiting for iron and steel");
    }
    // the crew stays reserved while the order waits: that is the price of leaving it open
    assert_eq!(project(&m, id).crew_on_site, vec![2_000, 1_000]);
    assert_eq!(queue(&m, capital)[0].waiting_for, vec!["Waiting for iron and steel".to_string()]);
    assert_eq!(queue(&m, capital)[0].goods_bp, 0);
    m.world.civs[0].stock[Good::Metal.index()] = 50_000_000;
    audited_month(&mut m);
    assert!(project(&m, id).last_progress > 0, "{:?}", project(&m, id).blockers);
    assert!(project(&m, id).blockers.is_empty());
    assert_eq!(queue(&m, capital)[0].goods_bp, 10_000);

    // ---- labour ----------------------------------------------------------------------
    let (mut m, capital, home) = site_world("stall-labour");
    let id = steel(&mut m, capital, home);
    let fields = order(&mut m, capital, "fields", 1);
    m.world.civs[0].mobilization_bp = 0;
    for _ in 0..3 {
        audited_month(&mut m);
        // nobody may be called up: the crew cannot be held, and plain work has no hands
        stalled(&m, id, "Site crew short: 0 of 2,000 builders");
        // the builders live here: it is the call-up that is missing, and the order says so
        stalled(&m, id, "Little labour can be called up");
        stalled(&m, fields, "Little labour can be called up");
        assert_eq!(m.world.regions[home].last.labor.projects, 0);
    }
    m.world.civs[0].mobilization_bp = 10_000;
    audited_month(&mut m);
    assert!(project(&m, id).last_progress > 0 && project(&m, fields).last_progress > 0);

    // ---- the qualified crew -----------------------------------------------------------
    let (mut m, capital, home) = site_world("stall-crew");
    m.world.civs[0].stock[Good::Coal.index()] = 1_000_000;
    endow(&mut m.world, home, Qual::Builder, 20_000);
    let id = order(&mut m, capital, "steelworks", 1);
    for _ in 0..3 {
        audited_month(&mut m);
        // the builders are there; nobody who can do the millwrights' work is
        stalled(&m, id, "Site crew short: 0 of 1,000 mechanics");
        assert_eq!(project(&m, id).crew_on_site, vec![2_000, 0]);
    }
    let entry = &queue(&m, capital)[0];
    assert_eq!(entry.crew[1], CrewOnSite { quals: vec![Qual::Mechanic, Qual::Smith, Qual::Artisan], needed: 1_000, on_site: 0 });
    assert!(entry.waiting_for.iter().any(|b| b.contains("Site crew short")));
    // smiths are accepted where mechanics are missing
    endow(&mut m.world, home, Qual::Smith, 5_000);
    audited_month(&mut m);
    assert!(project(&m, id).last_progress > 0, "{:?}", project(&m, id).blockers);
    assert_eq!(project(&m, id).crew_on_site, vec![2_000, 1_000]);

    // ---- site power -------------------------------------------------------------------
    let (mut m, capital, home) = site_world("stall-power");
    let id = steel(&mut m, capital, home);
    m.world.civs[0].stock[Good::Coal.index()] = 0;
    for _ in 0..3 {
        audited_month(&mut m);
        stalled(&m, id, "Site power short: 0% delivered");
        assert_eq!(project(&m, id).power_bp, 0);
    }
    assert_eq!(queue(&m, capital)[0].power_bp, 0);
    m.world.civs[0].stock[Good::Fuel.index()] = 1_000_000;
    audited_month(&mut m);
    assert!(project(&m, id).last_progress > 0, "{:?}", project(&m, id).blockers);
    assert_eq!(project(&m, id).power_bp, 10_000);
    assert!(m.world.regions[home].last.power.site_fuel > 0);
}

#[test]
fn a_partial_shortage_slows_an_order_in_proportion() {
    // everything there: the order takes the month's full share of its work
    let (mut m, capital, home) = site_world("slow-full");
    endow(&mut m.world, home, Qual::Builder, 20_000);
    endow(&mut m.world, home, Qual::Mechanic, 20_000);
    m.world.civs[0].stock[Good::Coal.index()] = 1_000_000;
    let id = order(&mut m, capital, "steelworks", 1);
    audited_month(&mut m);
    let full = project(&m, id).last_progress;
    assert_eq!(full, project(&m, id).max_per_month);

    // half the builders: half the month's work, and the blocker says how many
    let (mut m, capital, home) = site_world("slow-crew");
    endow(&mut m.world, home, Qual::Builder, 1_000);
    endow(&mut m.world, home, Qual::Mechanic, 20_000);
    m.world.civs[0].stock[Good::Coal.index()] = 1_000_000;
    let id = order(&mut m, capital, "steelworks", 1);
    audited_month(&mut m);
    let p = project(&m, id);
    assert_eq!(p.crew_on_site, vec![1_000, 1_000]);
    assert_eq!(p.last_progress, full / 2);
    assert_eq!(p.blockers, vec!["Site crew short: 1,000 of 2,000 builders".to_string()]);
    // a site working at half pace draws half its power
    assert_eq!(m.world.regions[home].last.power.site_from_engines, 5_000);

    // half the coal the month's site power takes: half the work
    let (mut m, capital, home) = site_world("slow-power");
    endow(&mut m.world, home, Qual::Builder, 20_000);
    endow(&mut m.world, home, Qual::Mechanic, 20_000);
    // a steelworks site draws 10 units a month: two thousand tonnes of coal at 5 units a kilotonne
    m.world.civs[0].stock[Good::Coal.index()] = 1_000;
    let id = order(&mut m, capital, "steelworks", 1);
    audited_month(&mut m);
    let p = project(&m, id);
    assert_eq!(p.power_bp, 5_000);
    assert_eq!(p.last_progress, full / 2);
    assert_eq!(p.blockers, vec!["Site power short: 50% delivered".to_string()]);
    assert_eq!(m.world.civs[0].stock[Good::Coal.index()], 0);

    // half of one material: work stops at half of the whole order, however long it waits
    let (mut m, capital, home) = site_world("slow-goods");
    endow(&mut m.world, home, Qual::Builder, 20_000);
    endow(&mut m.world, home, Qual::Mechanic, 20_000);
    m.world.civs[0].stock[Good::Coal.index()] = 10_000_000;
    let id = order(&mut m, capital, "steelworks", 1);
    m.world.civs[0].stock[Good::Metal.index()] = 10_000;
    for _ in 0..20 {
        audited_month(&mut m);
    }
    let p = project(&m, id);
    assert_eq!(p.goods_bp(), 5_000);
    assert_eq!(p.work_done, p.work_needed / 2);
    assert!(m.world.regions[home].fac(content().f("steelworks")).is_none(), "nothing is built on half its materials");
}

#[test]
fn an_order_with_everything_at_hand_takes_exactly_its_minimum_months() {
    let c = content();
    // (facility, already built somewhere?, months at standard pace)
    for (kind, built, months) in [
        ("fields", true, 2u32),
        ("fields", false, 3),
        ("irrigation", true, 4),
        ("irrigation", false, 6),
        ("machine_shop", true, 6),
        ("machine_shop", false, 9),
        ("steelworks", false, 14),
        ("hydro", true, 15),
        ("jump_yard", false, 72),
    ] {
        let (mut m, capital, home) = site_world("minimum-months");
        for q in [Qual::Builder, Qual::Mechanic, Qual::Technician, Qual::Electrician, Qual::FtlEngineer] {
            endow(&mut m.world, home, q, 60_000);
        }
        m.world.civs[0].stock[Good::Coal.index()] = 40_000_000;
        let k = c.f(kind);
        if built {
            already_built(&mut m, home, &[kind]);
        }
        let q = quote(&m, capital, kind);
        assert_eq!(q.first_of_kind, !built, "{kind}");
        assert_eq!(q.min_months as u32, months, "{kind} quoted");
        let levels = if c.facilities[k].max_level == 1 { 1 } else { 3 };
        let id = order(&mut m, capital, kind, levels);
        assert_eq!(project(&m, id).min_months as u32, months);
        for month in 1..months {
            audited_month(&mut m);
            let p = project(&m, id);
            assert!(p.blockers.is_empty(), "{kind} month {month}: {:?} stability {} cap {} labour {:?} unrest {}", p.blockers, m.world.civs[0].stability, crate::sim::economy::mobilization_cap(&m.world, 0), m.world.regions[home].last.labor, m.world.regions[home].unrest_bp);
            assert_eq!(p.last_progress, p.max_per_month, "{kind} month {month}");
            assert!(m.world.regions[home].fac(k).is_none(), "{kind} finished in {month} months, sooner than {months}");
        }
        // the estimate shown for the last month is one month
        assert_eq!(queue(&m, capital)[0].eta_months_low, Some(1), "{kind}");
        audited_month(&mut m);
        assert!(!open(&m, id), "{kind} was not finished after {months} months");
        assert_eq!(m.world.regions[home].fac(k).map(|f| f.level), Some(levels), "{kind}");
    }
}

#[test]
fn the_order_charged_is_the_quote_times_the_levels() {
    let c = content();
    for pace in [10_000u32, 7_300, 12_500] {
        for built in [false, true] {
            let mut m = Match::new(MatchConfig { seed: "quote".into(), regions: 24, pace_bp: pace, ..Default::default() }, 1);
            know_everything(&mut m.world, 0);
            let capital = m.world.civs[0].capital;
            let home = capital as usize;
            {
                let r = &mut m.world.regions[home];
                r.arable = 40;
                r.river = true;
                r.hydro = 40;
                r.facilities.clear();
                r.deposits.retain(|d| d.kind != Deposit::IronOre);
                r.deposits.push(DepositState::new(Deposit::IronOre, 50_000_000, 8000));
            }
            let kinds = ["fields", "irrigation", "workshop", "mine_iron", "machine_shop", "steelworks", "hydro", "fab", "fission", "orbital_yard", "jump_yard"];
            if built {
                already_built(&mut m, home, &kinds);
            }
            // a station stands at the capital so the orbital yard has its site
            put_works(&mut m.world.regions[home], "launch_complex", 1);
            put_works(&mut m.world.regions[home], "orbital_station", 1);
            let catalog = m.observe(0).catalog;
            for kind in kinds {
                let def = &c.facilities[c.f(kind)];
                let q = quote(&m, capital, kind);
                assert_eq!(q.first_of_kind, !built, "{kind}");
                // the quote is the content's bill, with half again on work and time for the first of a kind
                let base_work = crate::sim::projects::scaled(def.work, pace);
                let base_months = (def.build_months as i64 * pace as i64 + 9_999) / 10_000;
                assert_eq!(q.work_per_level, if built { base_work } else { base_work * 3 / 2 }, "{kind}");
                assert_eq!(q.min_months as i64, if built { base_months } else { (base_months * 3 + 1) / 2 }, "{kind}");
                assert_eq!(q.cost_per_level.iter().map(|x| (x.good, x.amount)).collect::<Vec<_>>(), def.cost, "{kind}");
                assert_eq!(q.crew_per_level.iter().map(|x| (x.quals.clone(), x.count)).collect::<Vec<_>>(), def.crew, "{kind}");
                assert_eq!(q.site_power_per_level, def.build_power, "{kind}");
                let ft = catalog.facilities.iter().find(|f| f.kind == kind).unwrap();
                assert_eq!((ft.build_months as i64, ft.build_power, ft.build_crew.len()), (base_months, def.build_power, def.crew.len()), "{kind}");
                let levels_list: &[u16] = if def.max_level == 1 { &[1] } else { &[1, 3, 7] };
                for &n in levels_list {
                    let id = order(&mut m, capital, kind, n);
                    let p = project(&m, id).clone();
                    let n64 = n as i64;
                    assert_eq!(p.work_needed, q.work_per_level * n64, "{kind} x{n}");
                    assert_eq!(p.inputs, q.cost_per_level.iter().map(|x| (x.good, x.amount * n64, 0)).collect::<Vec<_>>(), "{kind} x{n}");
                    assert_eq!(p.crew, q.crew_per_level.iter().map(|x| (x.quals.clone(), x.count * n as u32)).collect::<Vec<_>>(), "{kind} x{n}");
                    assert_eq!(p.power_need, q.site_power_per_level * n64, "{kind} x{n}");
                    assert_eq!(p.min_months, q.min_months, "{kind} x{n}");
                    // the work is spread over exactly the minimum months
                    assert_eq!(p.max_per_month, (p.work_needed + q.min_months as i64 - 1) / q.min_months as i64, "{kind} x{n}");
                    // the flat list states the same order
                    let obs = m.observe(0);
                    let view = obs.projects.iter().find(|x| x.id == id).unwrap();
                    assert_eq!((view.site_power, view.min_months, view.crew.iter().map(|x| x.needed).sum::<u32>()), (p.power_need, p.min_months, p.crew.iter().map(|x| x.1).sum::<u32>()));
                    assert_eq!(view.eta_months_low, Some(q.min_months as u32), "a new order is estimated at its minimum months");
                    // ordering does not change the price of the next level while nothing is finished
                    let again = quote(&m, capital, kind);
                    assert_eq!((again.work_per_level, again.min_months, again.first_of_kind), (q.work_per_level, q.min_months, q.first_of_kind));
                    manage(&mut m, id, ManageOp::Cancel, None, None);
                }
            }
        }
    }
}

#[test]
fn a_site_crew_holds_no_other_post_and_returns_when_the_order_ends() {
    let c = content();
    let (mut m, capital, home) = site_world("crew-posts");
    // two levels of workshops need four thousand artisans, and exactly that many live here
    put_works(&mut m.world.regions[home], "workshop", 2);
    endow(&mut m.world, home, Qual::Artisan, 4_000);
    let shop = c.f("workshop");
    let staffed = |m: &Match| -> (u16, u32, u32) {
        let last = &m.world.regions[home].last;
        (m.world.regions[home].fac(shop).unwrap().skilled_bp, last.qual_employed[Qual::Artisan.index()], last.labor.projects)
    };
    let one_role_each = |m: &Match| {
        let l = &m.world.regions[home].last.labor;
        let workers = (l.working_age as i64 * 92 / 100) as u32 - l.students - l.teachers;
        assert_eq!(l.food + l.facilities + l.projects + l.household, workers, "{l:?}");
    };
    labour_month(&mut m);
    assert_eq!(staffed(&m), (10_000, 4_000, 0));
    one_role_each(&m);

    // waterworks: five hundred builders, or artisans doing a builder's work
    let id = order(&mut m, capital, "waterworks", 1);
    labour_month(&mut m);
    assert_eq!(project(&m, id).crew_on_site, vec![500]);
    let (skilled_bp, employed, called_up) = staffed(&m);
    assert_eq!(skilled_bp, 8_750, "the workshops lost the five hundred artisans the site holds");
    assert_eq!(employed, 4_000, "every artisan has exactly one post");
    assert!(called_up >= 500, "the crew is among the workers called up");
    one_role_each(&m);

    // paused: the crew is released at once and is back at the workshops next month
    manage(&mut m, id, ManageOp::Pause, None, None);
    assert_eq!(project(&m, id).crew_on_site, vec![0]);
    labour_month(&mut m);
    assert_eq!(staffed(&m), (10_000, 4_000, 0));
    assert_eq!(project(&m, id).last_progress, 0);
    let entry = queue(&m, capital).remove(0);
    assert!(entry.paused && entry.crew[0].on_site == 0 && entry.waiting_for.is_empty());
    one_role_each(&m);

    // resumed: reserved again
    manage(&mut m, id, ManageOp::Resume, None, None);
    labour_month(&mut m);
    assert_eq!(project(&m, id).crew_on_site, vec![500]);
    assert_eq!(staffed(&m).0, 8_750);

    // cancelled: back at their posts
    manage(&mut m, id, ManageOp::Cancel, None, None);
    labour_month(&mut m);
    assert_eq!(staffed(&m), (10_000, 4_000, 0));

    // completed: back at their posts, and the works stand
    let id = order(&mut m, capital, "waterworks", 1);
    let mut months = 0;
    while open(&m, id) {
        labour_month(&mut m);
        months += 1;
        assert!(months <= 12, "the waterworks never finished");
        if open(&m, id) {
            assert_eq!(staffed(&m).0, 8_750);
        }
    }
    assert_eq!(months, 6, "four months, and half as long again for the first of its kind");
    assert_eq!(m.world.regions[home].fac_level("waterworks"), 1);
    labour_month(&mut m);
    assert_eq!(staffed(&m).0, 10_000);
    assert_eq!(staffed(&m).2, 0);
    one_role_each(&m);

    // nobody qualified is reserved twice: two orders, and fewer people than two crews
    let (mut m, capital, home) = site_world("crew-twice");
    endow(&mut m.world, home, Qual::Builder, 700);
    let a = order(&mut m, capital, "waterworks", 1);
    let b = order(&mut m, capital, "irrigation", 1);
    labour_month(&mut m);
    assert_eq!((project(&m, a).crew_on_site.clone(), project(&m, b).crew_on_site.clone()), (vec![500], vec![200]));
    assert_eq!(m.world.regions[home].last.qual_employed[Qual::Builder.index()], 700);
    // instructors are not taken from their classes
    m.world.regions[home].teachers[Qual::Builder.index()] = 600;
    crate::sim::economy::step(&mut m.world, 0);
    assert_eq!((project(&m, a).crew_on_site.clone(), project(&m, b).crew_on_site.clone()), (vec![100], vec![0]));
}

#[test]
fn site_engines_burn_real_coal_then_fuel_and_local_power_is_used_first() {
    let (coal, fuel) = (Good::Coal.index(), Good::Fuel.index());
    let prepared = |seed: &str| -> (Match, RegionId, usize, u32) {
        let (mut m, capital, home) = site_world(seed);
        endow(&mut m.world, home, Qual::Builder, 20_000);
        endow(&mut m.world, home, Qual::Mechanic, 20_000);
        // two levels of machine shops: the sites draw 10 units a month between them
        let id = order(&mut m, capital, "machine_shop", 2);
        assert_eq!(project(&m, id).power_need, 10_000);
        (m, capital, home, id)
    };

    // no power in the region: site engines burn coal, a tonne for five units
    let (mut m, _, home, id) = prepared("engines-coal");
    m.world.civs[0].stock[coal] = 5_000;
    m.world.civs[0].stock[fuel] = 5_000;
    let used = m.world.civs[0].flows.consumed[coal];
    audited_month(&mut m);
    let led = m.world.regions[home].last.power.clone();
    assert_eq!((led.site_from_supply, led.site_from_engines, led.site_coal, led.site_fuel), (0, 10_000, 2_000, 0), "{led:?}");
    assert_eq!(m.world.civs[0].stock[coal], 3_000);
    assert_eq!(m.world.civs[0].flows.consumed[coal] - used, 2_000, "the coal is booked as consumed");
    assert_eq!(m.world.civs[0].stock[fuel], 5_000, "coal is burned before fuel");
    assert_eq!(project(&m, id).power_bp, 10_000);
    // the coal runs out during the second month: fuel makes up the rest, a tonne for ten units
    m.world.civs[0].stock[coal] = 1_200;
    audited_month(&mut m);
    let led = m.world.regions[home].last.power.clone();
    assert_eq!((led.site_from_engines, led.site_coal, led.site_fuel), (10_000, 1_200, 400), "{led:?}");
    assert_eq!((m.world.civs[0].stock[coal], m.world.civs[0].stock[fuel]), (0, 4_600));
    assert_eq!(project(&m, id).last_progress, project(&m, id).max_per_month);

    // mills in the region with nothing else to turn: the sites take their power there and burn nothing
    let (mut m, _, home, id) = prepared("engines-local");
    put_works(&mut m.world.regions[home], "waterwheel", 2);
    m.world.civs[0].stock[coal] = 5_000;
    m.world.civs[0].stock[fuel] = 5_000;
    for _ in 0..3 {
        audited_month(&mut m);
        let led = m.world.regions[home].last.power.clone();
        assert_eq!(led.shaft_made, 40_000);
        assert_eq!((led.site_from_supply, led.site_from_engines, led.site_coal, led.site_fuel), (10_000, 0, 0, 0), "{led:?}");
        assert!(led.shaft_used + led.site_from_supply <= led.shaft_made);
        assert_eq!(project(&m, id).power_bp, 10_000);
    }
    assert_eq!((m.world.civs[0].stock[coal], m.world.civs[0].stock[fuel]), (5_000, 5_000));
    assert_eq!(m.world.regions[home].last.shaft_demand, 10_000, "the sites' draw is part of the region's shaft demand");

    // a shortage is shared: one level of mills gives 20, an old machine shop asks for 30
    // and the sites for 10; each gets half, and the sites' engines make up their other half
    let (mut m, _, home, id) = prepared("engines-shared");
    put_works(&mut m.world.regions[home], "waterwheel", 1);
    put_works(&mut m.world.regions[home], "machine_shop", 1);
    m.world.civs[0].stock[coal] = 5_000;
    audited_month(&mut m);
    let led = m.world.regions[home].last.power.clone();
    assert_eq!(m.world.regions[home].last.shaft_demand, 40_000);
    assert_eq!((led.shaft_made, led.site_from_supply, led.site_from_engines, led.site_coal), (20_000, 5_000, 5_000, 1_000), "{led:?}");
    assert!(led.shaft_used <= 15_000 && led.shaft_used + led.site_from_supply <= led.shaft_made, "{led:?}");
    assert_eq!(project(&m, id).power_bp, 10_000);

    // an order waiting for a material burns nothing while it waits
    let (mut m, _, home, id) = prepared("engines-idle");
    m.world.civs[0].stock[coal] = 5_000;
    m.world.civs[0].stock[Good::Metal.index()] = 0;
    audited_month(&mut m);
    assert_eq!(project(&m, id).last_progress, 0);
    assert_eq!(m.world.regions[home].last.power.site_coal, 0);
    assert_eq!(m.world.civs[0].stock[coal], 5_000);
}

#[test]
fn site_engines_never_burn_the_fuel_the_fields_need_in_store() {
    let fuel = Good::Fuel.index();
    let (mut m, capital, home) = site_world("engines-fields");
    endow(&mut m.world, home, Qual::Builder, 20_000);
    endow(&mut m.world, home, Qual::Mechanic, 20_000);
    // ten levels of mechanized fields (fertilizer is not yet understood here): 100 t
    // of fuel a level, a thousand tonnes a month, which must be in store to start
    m.world.civs[0].tech[content().t("T095")].state = ST_DISCOVERED;
    put_works(&mut m.world.regions[home], "fields", 10);
    assert_eq!(crate::sim::economy::fields_fuel_month(&m.world, 0), 1_000);
    let id = order(&mut m, capital, "machine_shop", 2);
    // the sites ask for 10 units a month: a thousand tonnes of fuel, with no coal about
    m.world.civs[0].stock[fuel] = 2_400;
    let used = m.world.civs[0].flows.consumed[fuel];
    audited_month(&mut m);
    // the fields took their thousand first; of the 1,400 left the sites may burn 400
    let led = m.world.regions[home].last.power.clone();
    assert_eq!((led.site_fuel, led.site_from_engines), (400, 4_000), "{led:?}");
    assert_eq!(m.world.civs[0].stock[fuel], 1_000);
    assert_eq!(m.world.civs[0].flows.consumed[fuel] - used, 1_400);
    assert_eq!(project(&m, id).power_bp, 4_000);
    assert_eq!(project(&m, id).blockers, vec!["Site power short: 40% delivered".to_string()]);
    // next month the fields are worked by machine again, and the sites stand still
    let used = m.world.civs[0].flows.consumed[fuel];
    audited_month(&mut m);
    assert_eq!(m.world.civs[0].flows.consumed[fuel] - used, 1_000, "the fields found their fuel");
    assert_eq!(m.world.regions[home].last.power.site_fuel, 0);
    assert_eq!(project(&m, id).last_progress, 0);
    assert_eq!(project(&m, id).blockers, vec!["Site power short: 0% delivered".to_string()]);
    // a seat that does not work its fields by machine keeps nothing back
    let (mut m, capital, home) = site_world("engines-no-tractors");
    m.world.civs[0].tech[content().t("T094")].state = ST_DISCOVERED;
    endow(&mut m.world, home, Qual::Builder, 20_000);
    endow(&mut m.world, home, Qual::Mechanic, 20_000);
    put_works(&mut m.world.regions[home], "fields", 10);
    assert_eq!(crate::sim::economy::fields_fuel_month(&m.world, 0), 0);
    let id = order(&mut m, capital, "machine_shop", 2);
    m.world.civs[0].stock[fuel] = 1_000;
    audited_month(&mut m);
    assert_eq!(m.world.regions[home].last.power.site_fuel, 1_000);
    assert_eq!(project(&m, id).power_bp, 10_000);
}

#[test]
fn a_seat_reorders_the_queue_of_a_region_and_the_first_order_is_served_first() {
    let (mut m, capital, home) = site_world("reorder");
    // five hundred builders: one crew, and two orders that each need it
    endow(&mut m.world, home, Qual::Builder, 500);
    let a = order(&mut m, capital, "waterworks", 1);
    let b = order(&mut m, capital, "irrigation", 1);
    // an order in another region, which nothing below may disturb
    let other = (0..m.world.regions.len()).find(|i| *i != home && m.world.regions[*i].controller.is_none()).unwrap();
    m.world.regions[other].owner = Some(0);
    m.world.regions[other].controller = Some(0);
    m.world.regions[other].arable = 10;
    m.world.regions[other].wild = 5_000_000;
    settle_fixture(&mut m.world, other, 300_000);
    let elsewhere = order(&mut m, other as RegionId, "fields", 1);
    let slot = |m: &Match, id: u32| {
        let k = project(m, id).service_key();
        (k.0, k.1)
    };
    let elsewhere_slot = slot(&m, elsewhere);
    let ids = |m: &Match| queue(m, capital).iter().map(|e| (e.project, e.position)).collect::<Vec<_>>();
    assert_eq!(ids(&m), vec![(a, 0), (b, 1)]);

    audited_month(&mut m);
    assert!(project(&m, a).last_progress > 0);
    assert_eq!(project(&m, b).last_progress, 0);
    let q = queue(&m, capital);
    assert!(q[0].waiting_for.is_empty() && q[0].crew[0].on_site == 500);
    assert_eq!(q[1].waiting_for, vec!["Site crew short: 0 of 500 builders".to_string()]);
    assert_eq!((q[1].eta_months_low, q[1].eta_months_high), (None, None), "an order that stands still has no estimate");
    assert_eq!(q[0].eta_months_low, Some(5), "five of the six months are left");

    // the second order is moved to the head of the region's queue
    let before = (slot(&m, a), slot(&m, b));
    manage(&mut m, b, ManageOp::Resume, None, Some(0));
    assert_eq!(ids(&m), vec![(b, 0), (a, 1)]);
    // the two orders exchanged the places they held; nothing else moved
    assert_eq!((slot(&m, b), slot(&m, a)), before);
    assert_eq!(slot(&m, elsewhere), elsewhere_slot);
    let obs = m.observe(0);
    assert_eq!(obs.projects.iter().find(|p| p.id == b).unwrap().queue_position, Some(0));
    assert_eq!(obs.projects.iter().find(|p| p.id == a).unwrap().queue_position, Some(1));
    assert_eq!(obs.projects.iter().find(|p| p.id == elsewhere).unwrap().queue_position, Some(0));
    let done_a = project(&m, a).work_done;
    audited_month(&mut m);
    assert!(project(&m, b).last_progress > 0, "{:?}", project(&m, b).blockers);
    assert_eq!(project(&m, a).work_done, done_a, "the order moved back got no crew");
    assert_eq!(project(&m, a).blockers, vec!["Site crew short: 0 of 500 builders".to_string()]);
    // the queue shown is the order of service
    let shown: Vec<u32> = queue(&m, capital).iter().map(|e| e.project).collect();
    let mut served: Vec<&Project> = m.world.civs[0].projects.iter().filter(|p| p.region == Some(capital)).collect();
    served.sort_by_key(|p| p.service_key());
    assert_eq!(shown, served.iter().map(|p| p.id).collect::<Vec<_>>());

    // a position past the end is the end; priority still works, and comes before place
    manage(&mut m, b, ManageOp::Resume, None, Some(99));
    assert_eq!(ids(&m), vec![(a, 0), (b, 1)]);
    manage(&mut m, b, ManageOp::Resume, Some(1), None);
    assert_eq!(ids(&m), vec![(b, 0), (a, 1)]);
    assert_eq!(queue(&m, capital)[0].priority, 1);
    audited_month(&mut m);
    assert!(project(&m, b).last_progress > 0 && project(&m, a).last_progress == 0);
    // a project without a site has no queue: the position is ignored
    let handle = m.observe(0).knowledge.techs.iter().find(|t| t.can_investigate).map(|t| t.handle.clone());
    if let Some(h) = handle {
        let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Research { tech: h }, priority: None }]);
        let id = r[0].created.unwrap();
        manage(&mut m, id, ManageOp::Resume, None, Some(0));
        assert_eq!(m.observe(0).projects.iter().find(|p| p.id == id).unwrap().queue_position, None);
    }

    // the same scarcity in plain labour: with hands for one order, the first in the queue gets them
    let (mut m, capital, home) = site_world("reorder-labour");
    let a = order(&mut m, capital, "fields", 4);
    let b = order(&mut m, capital, "camp", 4);
    // a call-up far smaller than either order can use in a month
    m.world.civs[0].mobilization_bp = 100;
    audited_month(&mut m);
    let called = m.world.regions[home].last.labor.projects as i64;
    assert!(called > 0 && called < project(&m, a).max_per_month, "{called}");
    assert!(project(&m, a).last_progress > 0);
    assert_eq!(project(&m, b).last_progress, 0);
    assert!(project(&m, b).blockers.iter().any(|x| x.contains("Little labour can be called up")));
    manage(&mut m, b, ManageOp::Resume, None, Some(0));
    audited_month(&mut m);
    assert!(project(&m, b).last_progress > 0);
    assert_eq!(project(&m, a).last_progress, 0);
}

#[test]
fn jump_preparations_hold_their_crews_and_draw_site_power() {
    let (mut m, capital, home) = site_world("jump-crews");
    m.world.civs[0].ftl.assemblies.push(Assembly { id: 9_000, yard_region: capital, built: 0, retired: false });
    endow(&mut m.world, home, Qual::FtlEngineer, 8_000);
    endow(&mut m.world, home, Qual::Orbital, 4_000);
    m.world.civs[0].stock[Good::Coal.index()] = 10_000_000;
    // the trial's own propellant; the site engines burn coal while there is any
    m.world.civs[0].stock[Good::Fuel.index()] = 1_000_000;
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::FtlTrial, priority: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    let id = r[0].created.unwrap();
    let p = project(&m, id).clone();
    // a loaded round trip: 8,000 jump engineers and 8,000 orbital crew for six months,
    // 3,000 units of site power a month and 400 kt of propellant (design chapter 35, slice E)
    assert_eq!(p.crew, vec![(vec![Qual::FtlEngineer], 8_000), (vec![Qual::Orbital], 8_000)]);
    assert_eq!((p.power_need, p.min_months), (3_000_000, 6));
    assert_eq!(p.work_needed, 600_000);
    assert!(p.inputs.iter().any(|(g, n, _)| *g == Good::Fuel && *n == 400_000), "{:?}", p.inputs);
    audited_month(&mut m);
    let p = project(&m, id).clone();
    assert_eq!(p.crew_on_site, vec![8_000, 4_000]);
    assert_eq!(p.blockers, vec!["Site crew short: 4,000 of 8,000 orbital crews".to_string()]);
    assert_eq!(p.last_progress, p.max_per_month / 2);
    // half the crew, half the power: 1,500 units from 300 kt of coal
    let led = m.world.regions[home].last.power.clone();
    assert_eq!((led.site_from_engines, led.site_coal), (1_500_000, 300_000));
    // with the crews complete the trial is prepared at full pace: five and a half months of work remain
    endow(&mut m.world, home, Qual::Orbital, 4_000);
    let mut months = 1;
    while open(&m, id) {
        audited_month(&mut m);
        months += 1;
        assert!(months < 14, "{:?}", m.world.civs[0].projects.iter().map(|p| (p.work_done, p.work_needed, p.last_progress, p.blockers.clone())).collect::<Vec<_>>());
    }
    assert_eq!(months, 7, "half a month's work was lost in the first month");
    // the other two preparations state their crews the same way
    for (kind, crew) in [(ProjKind::FtlDeployment, 12_000u32), (ProjKind::FtlReplacement, 4_000)] {
        let (c, power) = crate::sim::projects::ftl_terms(&kind);
        assert_eq!(c, vec![(vec![Qual::FtlEngineer], crew), (vec![Qual::Orbital], crew)]);
        assert!(power > 0);
    }
}

/// What a seat can ever reach in a world where one kind of facility is never built:
/// the technologies, practices, facilities, goods and qualifications that follow
/// from one another by the content's own requirements.
struct Reach {
    tech: Vec<bool>,
    prac: Vec<bool>,
    fac: Vec<bool>,
    qual: Vec<bool>,
    good: Vec<bool>,
}

impl crate::content::ReqCtx for Reach {
    fn tech(&self, i: usize) -> bool {
        self.tech[i]
    }
    fn prac(&self, i: usize) -> bool {
        self.prac[i]
    }
    fn fac(&self, i: usize) -> bool {
        self.fac[i]
    }
    fn pop(&self) -> u64 {
        u64::MAX
    }
    fn regions(&self) -> u32 {
        u32::MAX
    }
    fn qual(&self, q: Qual) -> u32 {
        if self.qual[q.index()] { u32::MAX } else { 0 }
    }
    fn contact(&self) -> bool {
        true
    }
    fn religion(&self) -> bool {
        true
    }
    fn sci_method(&self) -> bool {
        // reproducible methods, public archives and a working laboratory
        let c = content();
        self.tech[c.t("T049")] && self.prac[c.p("C013")] && self.fac[c.f("laboratory")]
    }
}

fn reachable_without(banned: Option<usize>) -> Reach {
    use crate::content::Site;
    let c = content();
    let mut r = Reach { tech: vec![false; c.techs.len()], prac: vec![false; c.practices.len()], fac: vec![false; c.facilities.len()], qual: vec![false; NQ], good: vec![false; NG] };
    // the declared endowment: lorekeepers and artisans, and food and building
    // material, which hands alone can get
    r.qual[Qual::Lorekeeper.index()] = true;
    r.qual[Qual::Artisan.index()] = true;
    r.good[Good::Food.index()] = true;
    r.good[Good::Materials.index()] = true;
    loop {
        let mut changed = false;
        for (i, t) in c.techs.iter().enumerate() {
            // an investigation that needs an installation needs it to exist
            if !r.tech[i] && t.prereq.eval(&r) && t.needs_facility.map(|k| r.fac[c.f(k)]).unwrap_or(true) {
                r.tech[i] = true;
                changed = true;
            }
        }
        for (i, p) in c.practices.iter().enumerate() {
            if !r.prac[i] && p.prereq.eval(&r) && p.hard.eval(&r) && p.cost.iter().all(|(g, _)| r.good[g.index()]) {
                r.prac[i] = true;
                changed = true;
            }
        }
        for (k, f) in c.facilities.iter().enumerate() {
            if r.fac[k] || Some(k) == banned {
                continue;
            }
            let site = match f.site {
                Site::With(key) => r.fac[c.f(key)],
                _ => true,
            };
            let goods = f.cost.iter().all(|(g, _)| r.good[g.index()]);
            let crew = f.crew.iter().all(|(qs, _)| qs.iter().any(|q| r.qual[q.index()]));
            if f.req.eval(&r) && site && goods && crew {
                r.fac[k] = true;
                changed = true;
            }
        }
        for (k, f) in c.facilities.iter().enumerate() {
            if !r.fac[k] {
                continue;
            }
            for rec in &f.recipes {
                if rec.req.eval(&r) && rec.inputs.iter().all(|(g, _)| r.good[g.index()]) {
                    for (g, _) in &rec.outputs {
                        if !r.good[g.index()] {
                            r.good[g.index()] = true;
                            changed = true;
                        }
                    }
                }
            }
        }
        for course in &c.courses {
            if r.qual[course.output.index()] {
                continue;
            }
            // a course needs its content, a venue, learners and its materials; without
            // an instructor a founding cohort works it out slowly
            let venue = c.facilities.iter().enumerate().any(|(k, f)| r.fac[k] && f.provides.iter().any(|(cap, _)| *cap == course.venue));
            let learners = course.entrants.iter().any(|e| e.map(|q| r.qual[q.index()]).unwrap_or(true));
            let materials = course.materials.iter().all(|(g, _)| r.good[g.index()]);
            if course.req.eval(&r) && venue && learners && materials {
                r.qual[course.output.index()] = true;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    r
}

#[test]
fn no_site_crew_needs_people_who_cannot_exist_yet() {
    use crate::content::ReqCtx;
    let c = content();
    // with nothing withheld, everything in the content can be reached
    let all = reachable_without(None);
    for (i, t) in c.techs.iter().enumerate() {
        assert!(all.tech[i], "{} can never be understood", t.id);
    }
    for (i, p) in c.practices.iter().enumerate() {
        assert!(all.prac[i], "{} can never be enacted", p.id);
    }
    for (k, f) in c.facilities.iter().enumerate() {
        assert!(all.fac[k], "{} can never be built", f.key);
    }
    for q in Qual::ALL {
        assert!(all.qual[q.index()], "nobody can ever qualify as {q:?}");
    }
    for g in Good::ALL.iter().filter(|g| !crate::content::offworld_good(**g)) {
        assert!(all.good[g.index()], "{g:?} can never be made");
    }
    // every facility can be built for the first time: its own requirement, its bill
    // and every group of its site crew can be met in a world that does not have it
    for (k, f) in c.facilities.iter().enumerate() {
        let w = reachable_without(Some(k));
        assert!(f.req.eval(&w), "{}: its own requirement needs it to exist", f.key);
        for (g, _) in &f.cost {
            assert!(w.good[g.index()], "{}: {g:?} for its construction cannot be made before it exists", f.key);
        }
        for (quals, n) in &f.crew {
            assert!(*n > 0 && !quals.is_empty(), "{}", f.key);
            assert!(quals.iter().any(|q| w.qual[q.index()]), "{}: nobody who could be one of its {} {:?} can qualify before it exists", f.key, n, quals);
        }
    }
    // the chains the rule was written for
    let without = |key: &str| reachable_without(Some(c.f(key)));
    assert!(!without("tech_institute").qual[Qual::Mechanic.index()], "mechanics are trained only at a technical institute");
    assert!(!without("tech_institute").qual[Qual::Electrician.index()]);
    assert!(!without("launch_complex").qual[Qual::Orbital.index()], "life support is investigated at a launch complex");
    assert!(!without("jump_testbed").qual[Qual::FtlEngineer.index()], "jump engineering follows from the testbed");
    assert!(without("jump_yard").qual[Qual::FtlEngineer.index()]);
    assert!(without("orbital_station").qual[Qual::Orbital.index()]);
    assert!(!without("machine_shop").fac[c.f("tech_institute")], "the institute's training shops need components");
    assert!(!without("laboratory").sci_method());
    assert!(c.facilities[c.f("tech_institute")].crew.iter().all(|(qs, _)| !qs.contains(&Qual::Mechanic)));
    assert!(c.facilities[c.f("jump_testbed")].crew.iter().all(|(qs, _)| !qs.contains(&Qual::FtlEngineer)));
    assert!(c.facilities[c.f("launch_complex")].crew.iter().all(|(qs, _)| !qs.contains(&Qual::Orbital)));
    // the same holds for the jump programme's preparations
    for kind in [ProjKind::FtlTrial, ProjKind::FtlDeployment, ProjKind::FtlReplacement] {
        for (quals, _) in crate::sim::projects::ftl_terms(&kind).0 {
            assert!(quals.iter().any(|q| all.qual[q.index()]));
        }
    }
}

#[test]
fn construction_terms_follow_their_classes() {
    let c = content();
    for f in &c.facilities {
        let crew: i64 = f.crew.iter().map(|(_, n)| *n as i64).sum();
        // a crew is never larger than the work its site accepts in a month, so
        // every member's worker-month can be used
        assert!(crew <= f.work / f.build_months as i64, "{}: a crew of {crew} on a site that takes {} worker-months a month", f.key, f.work / f.build_months as i64);
        assert!((2..=48).contains(&f.build_months), "{}", f.key);
        // site power is for industrial-era works, which all have engineers on site
        if f.build_power > 0 {
            assert!(f.crew.len() >= 2 && f.build_months >= 6, "{}", f.key);
            assert!((5_000..=400_000).contains(&f.build_power), "{}", f.key);
        }
        if f.crew.is_empty() {
            assert!(f.build_months <= 3 && f.build_power == 0, "{}", f.key);
        }
        // works that take years are the ones that need the scarcest people
        let top = f.crew.iter().any(|(qs, _)| qs.iter().any(|q| matches!(q, Qual::Scientist | Qual::Orbital | Qual::FtlEngineer)));
        assert_eq!(top, f.build_months >= 24, "{}", f.key);
    }
    let terms = |key: &str| {
        let f = &c.facilities[c.f(key)];
        (f.crew.clone(), f.build_power, f.build_months)
    };
    assert_eq!(terms("fields"), (vec![], 0, 2));
    assert_eq!(terms("irrigation"), (vec![(vec![Qual::Builder, Qual::Artisan], 500)], 0, 4));
    assert_eq!(terms("steelworks"), (vec![(vec![Qual::Builder, Qual::Artisan], 2_000), (vec![Qual::Mechanic, Qual::Smith, Qual::Artisan], 1_000)], 10_000, 9));
    assert_eq!((terms("jump_yard").1, terms("jump_yard").2), (400_000, 48));
    assert_eq!((crate::content::SITE_ENGINE_PER_T_COAL, crate::content::SITE_ENGINE_PER_T_FUEL), (5, 10));
}

#[test]
fn orders_and_views_written_before_site_crews_still_parse() {
    // actions
    let a: Action = serde_json::from_str(r#"{"kind":"manage_project","project":7,"op":"pause","priority":null}"#).unwrap();
    assert_eq!(a, Action::ManageProject { project: 7, op: ManageOp::Pause, priority: None, position: None });
    let a: Action = serde_json::from_str(r#"{"kind":"manage_project","project":7,"op":"resume","priority":3}"#).unwrap();
    assert_eq!(a, Action::ManageProject { project: 7, op: ManageOp::Resume, priority: Some(3), position: None });
    let a: Action = serde_json::from_str(r#"{"kind":"manage_project","project":7,"op":"resume","priority":null,"position":0}"#).unwrap();
    assert_eq!(a, Action::ManageProject { project: 7, op: ManageOp::Resume, priority: None, position: Some(0) });
    let a: Action = serde_json::from_str(r#"{"kind":"start_project","spec":{"kind":"build","region":3,"facility":"fields","levels":2},"priority":null}"#).unwrap();
    assert_eq!(a, Action::StartProject { spec: ProjectSpec::Build { region: 3, facility: "fields".into(), levels: 2 }, priority: None });

    // a save whose projects and service accounts were written without the new fields
    let (mut m, capital, home) = site_world("old-orders");
    endow(&mut m.world, home, Qual::Builder, 5_000);
    let id = order(&mut m, capital, "waterworks", 1);
    audited_month(&mut m);
    let mut v: serde_json::Value = serde_json::from_str(&m.save_json()).unwrap();
    for civ in v["civs"].as_array_mut().unwrap() {
        for p in civ["projects"].as_array_mut().unwrap() {
            let p = p.as_object_mut().unwrap();
            for key in ["crew", "crew_on_site", "crew_capped", "power_need", "power_bp", "min_months", "order_key"] {
                assert!(p.remove(key).is_some(), "{key}");
            }
        }
    }
    for r in v["regions"].as_array_mut().unwrap() {
        let last = r["last"].as_object_mut().unwrap();
        assert!(last.remove("site_power_free").is_some());
        let power = last["power"].as_object_mut().unwrap();
        for key in ["site_from_supply", "site_from_engines", "site_coal", "site_fuel"] {
            assert!(power.remove(key).is_some(), "{key}");
        }
    }
    let mut old = Match::load_json(&v.to_string()).expect("the fields are optional");
    let p = old.world.civs[0].projects.iter().find(|p| p.id == id).unwrap().clone();
    assert!(p.crew.is_empty() && p.power_need == 0 && p.min_months == 0);
    assert_eq!(p.service_key(), (5, id, id), "an order without a place in the queue is served by its id");
    // such an order asks for no crew and is finished by plain labour, as it was ordered
    for _ in 0..12 {
        crate::sim::step_month(&mut old.world);
    }
    assert_eq!(old.world.regions[home].fac_level("waterworks"), 1);

    // an observation written before the new fields existed
    let id = order(&mut m, capital, "irrigation", 1);
    let mut o = serde_json::to_value(m.observe(0)).unwrap();
    for r in o["regions"].as_array_mut().unwrap() {
        if let Some(own) = r["own"].as_object_mut() {
            assert!(own.remove("construction_queue").is_some());
            for s in own["construction_sites"].as_array_mut().unwrap() {
                let s = s.as_object_mut().unwrap();
                for key in ["cost_per_level", "crew_per_level", "site_power_per_level", "first_of_kind"] {
                    assert!(s.remove(key).is_some(), "{key}");
                }
            }
        }
    }
    for p in o["projects"].as_array_mut().unwrap() {
        let p = p.as_object_mut().unwrap();
        for key in ["crew", "site_power", "power_bp", "goods_bp", "min_months", "queue_position"] {
            assert!(p.remove(key).is_some(), "{key}");
        }
    }
    for f in o["catalog"]["facilities"].as_array_mut().unwrap() {
        let f = f.as_object_mut().unwrap();
        for key in ["build_crew", "build_power", "build_months"] {
            assert!(f.remove(key).is_some(), "{key}");
        }
    }
    let parsed: Observation = serde_json::from_value(o).unwrap();
    let own = parsed.regions.iter().find(|r| r.id == capital).unwrap().own.as_ref().unwrap();
    assert!(own.construction_queue.is_empty());
    assert!(own.construction_sites.iter().all(|s| s.crew_per_level.is_empty() && s.cost_per_level.is_empty() && !s.first_of_kind));
    assert!(parsed.projects.iter().any(|p| p.id == id && p.crew.is_empty() && p.queue_position.is_none()));
}

#[test]
fn quotes_and_queues_show_only_what_the_seat_has_discovered_in_its_own_regions() {
    let mut m = Match::new(cfg("quote-boundary"), 1);
    let capital = m.world.civs[0].capital;
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region: capital, facility: "camp".into(), levels: 1 }, priority: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    for seat in 0..4u8 {
        let obs = m.observe(seat);
        let known: Vec<&str> = obs.catalog.facilities.iter().map(|f| f.kind.as_str()).collect();
        for region in &obs.regions {
            match &region.own {
                Some(own) => {
                    assert_eq!(region.controller, Some(seat));
                    // a quote for every facility in the seat's catalog, and for nothing else
                    let quoted: Vec<&str> = own.construction_sites.iter().map(|s| s.kind.as_str()).collect();
                    assert_eq!(quoted, known);
                    assert_eq!(own.construction_queue.len(), if seat == 0 { 1 } else { 0 });
                }
                None => assert_ne!(region.controller, Some(seat)),
            }
        }
        // nothing a seat has not discovered is named anywhere in what it is shown
        let json = serde_json::to_string(&obs).unwrap();
        for hidden in ["Steelworks", "steelworks", "jump_yard", "Jump assembly line", "Orbital construction yard"] {
            assert!(!json.contains(hidden), "seat {seat} is shown {hidden}");
        }
    }
    // another seat's order cannot be managed or moved, and fails like one that does not exist
    let id = m.world.civs[0].projects[0].id;
    let theirs = m.act(1, vec![Action::ManageProject { project: id, op: ManageOp::Resume, priority: None, position: Some(0) }]);
    let none = m.act(1, vec![Action::ManageProject { project: 999_999, op: ManageOp::Resume, priority: None, position: Some(0) }]);
    assert_eq!((theirs[0].status.as_str(), &theirs[0].code, &theirs[0].reason), ("rejected", &none[0].code, &none[0].reason));
    assert_eq!(m.world.civs[0].projects[0].service_key(), (5, id, id));
}
