//! The space and jump base, and cooperation (design chapter 35, slice E;
//! `docs/units-and-scale.md` section 8).
//!
//! Each base requirement of the jump programme is checked separately and each
//! consumes real things; none of them is a head count of the population. A small
//! civilization can stand in for parts of the base with contracted imports,
//! seconded experts and a partner's installation, each paid for and each ending
//! with the treaty. Every movement of people is audited like any other.

use super::*;
use crate::content::ReqCtx;
use crate::sim::diplomacy::{self, Ending};

/// Two seats that know everything and have met, with full stores. Seat 0 holds
/// `experts` jump engineers in its capital (part of its declared endowment).
fn coop_world(seed: &str, experts: u32) -> Match {
    let mut m = Match::new(cfg(seed), 1);
    for s in 0..2 {
        know_everything(&mut m.world, s);
        m.world.civs[s].stability = 90;
        for g in Good::ALL {
            m.world.civs[s].stock[g.index()] = 20_000_000;
        }
    }
    m.world.civs[0].contacts[1].met = true;
    m.world.civs[1].contacts[0].met = true;
    let capital = m.world.civs[0].capital as usize;
    endow(&mut m.world, capital, Qual::FtlEngineer, experts);
    m
}

fn held(w: &World, seat: SeatId, q: Qual) -> u32 {
    w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.quals[q.index()]).sum()
}

fn people(w: &World, seat: SeatId) -> u32 {
    w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.population()).sum()
}

/// Propose (as seat `from`) and sign (as the other seat) a treaty between seats 0
/// and 1 directly; the negotiation windows are tested elsewhere.
fn sign_from(m: &mut Match, from: SeatId, clauses: Vec<Clause>) -> Result<usize, String> {
    let to = 1 - from;
    diplomacy::validate_clauses(&m.world, from, to, &clauses)?;
    let id = m.world.id();
    m.world.offers.push(Offer { id, from, to, clauses, text: String::new(), created: m.world.month, expires_round: m.world.round + 1, status: "open".into() });
    let ix = m.world.offers.len() - 1;
    let tid = diplomacy::activate(&mut m.world, ix)?;
    Ok(m.world.treaties.iter().position(|t| t.id == tid).unwrap())
}

fn sign(m: &mut Match, clauses: Vec<Clause>) -> Result<usize, String> {
    sign_from(m, 0, clauses)
}

fn audited(m: &mut Match) {
    for s in 0..2 {
        m.world.civs[s].stock[Good::Food.index()] = 20_000_000;
    }
    let before = m.ledger_snapshot();
    crate::sim::step_month(&mut m.world);
    assert_balanced(&before, &m.ledger_snapshot());
}

const LEND: u32 = 8_000;

fn secondment(months: u16) -> Vec<Clause> {
    vec![Clause::Secondment { from: 0, qual: Qual::FtlEngineer, count: LEND, months }, Clause::Goods { from: 1, good: Good::Metal, amount_per_month: 50_000, months: 1 }]
}

#[test]
fn seconded_experts_leave_the_lender_work_abroad_and_come_home_at_term() {
    let mut m = coop_world("secondment", 20_000);
    let q = Qual::FtlEngineer;
    // the borrower has posts for them
    let bcap = m.world.civs[1].capital as usize;
    put_works(&mut m.world.regions[bcap], "jump_yard", 1);
    let (l0, b0) = (held(&m.world, 0, q), held(&m.world, 1, q));
    let (lp, bp) = (people(&m.world, 0), people(&m.world, 1));
    let before = m.ledger_snapshot();
    // the shortest term twelve-month rounds allow (design chapter 36, section 2.5)
    let ti = sign(&mut m, secondment(12)).expect("the secondment is signed");
    assert_balanced(&before, &m.ledger_snapshot());
    // real people left the lender's regions and labour pool with their qualification
    assert_eq!(held(&m.world, 0, q), l0 - LEND);
    assert_eq!(held(&m.world, 1, q), b0 + LEND);
    assert_eq!(people(&m.world, 0), lp - LEND);
    assert_eq!(people(&m.world, 1), bp + LEND);
    assert_eq!(m.world.civs[0].qual_flows.seconded_out[q.index()], LEND as i64);
    assert_eq!(m.world.civs[1].qual_flows.seconded_in[q.index()], LEND as i64);
    assert_eq!(m.world.regions[bcap].quals[q.index()], b0 + LEND, "they arrive at the borrower's capital");
    let s = m.world.treaties[ti].secondments[0].clone();
    assert_eq!((s.sent, s.owed, s.lender, s.borrower), (LEND, LEND, 0, 1));
    assert_eq!(m.world.treaties[ti].status, "active");
    // the borrower's view states them
    let obs = m.observe(1);
    let tv = obs.diplomacy.treaties.iter().find(|t| t.id == m.world.treaties[ti].id).unwrap();
    assert_eq!(tv.secondments[0].sent, LEND);
    assert!(tv.summary[0].contains("seconds 8,000 jump engineers"), "{:?}", tv.summary);
    // they staff the borrower's posts
    audited(&mut m);
    assert!(m.world.civs[1].qual_employed[q.index()] > 0, "the borrower's assembly line employs the seconded engineers");
    for _ in 1..12 {
        assert_eq!(m.world.treaties[ti].status, "active");
        audited(&mut m);
    }
    // the term is over: the survivors are home, never more than were sent
    let s = m.world.treaties[ti].secondments[0].clone();
    assert_eq!((s.owed, s.lost), (0, 0));
    assert!(s.returned > LEND * 9 / 10 && s.returned <= LEND, "{s:?}");
    let (f0, f1) = (&m.world.civs[0].qual_flows, &m.world.civs[1].qual_flows);
    assert_eq!(f0.seconded_home[q.index()], s.returned as i64);
    assert_eq!(f1.seconded_back[q.index()], s.returned as i64);
    assert_eq!(f0.seconded_lost[q.index()], 0);
    assert!(held(&m.world, 0, q) + LEND >= l0 + s.returned - LEND / 10, "the lender has its people back");
    assert_ne!(m.world.treaties[ti].status, "active", "the treaty has run its course");
}

#[test]
fn a_quarter_of_the_experts_stay_behind_when_the_borrower_repudiates_or_war_comes() {
    for how in ["borrower", "war", "lender"] {
        let mut m = coop_world("secondment-breach", 20_000);
        let q = Qual::FtlEngineer;
        let ti = sign(&mut m, secondment(60)).expect("the secondment is signed");
        audited(&mut m);
        let owed = m.world.treaties[ti].secondments[0].owed;
        let (bp, lp) = (people(&m.world, 1), people(&m.world, 0));
        let before = m.ledger_snapshot();
        match how {
            "borrower" => diplomacy::break_treaty(&mut m.world, 1, ti),
            "lender" => diplomacy::break_treaty(&mut m.world, 0, ti),
            _ => crate::sim::military::declare_war(&mut m.world, 0, 1, "A test of the rules."),
        }
        assert_balanced(&before, &m.ledger_snapshot());
        let s = m.world.treaties[ti].secondments[0].clone();
        assert_eq!(m.world.treaties[ti].status, "broken");
        assert_eq!(s.owed, 0, "{how}: the secondment is settled once");
        // never more than are still owed; the month's deaths among them are not returned
        let released = s.returned + s.lost;
        assert!(released <= owed && released + owed / 100 >= owed, "{how}: {s:?} of {owed}");
        let lost = if how == "lender" { 0 } else { released / 4 };
        assert_eq!((s.returned, s.lost), (released - lost, lost), "{how}");
        // those kept behind are ordinary residents of the borrower now
        assert_eq!(people(&m.world, 1), bp - s.returned, "{how}");
        assert_eq!(people(&m.world, 0), lp + s.returned, "{how}");
        assert_eq!(m.world.civs[0].qual_flows.seconded_lost[q.index()], lost as i64);
        assert_eq!(m.world.civs[0].qual_flows.seconded_home[q.index()], released as i64);
        assert_eq!(m.world.civs[1].qual_flows.seconded_back[q.index()], released as i64);
        assert_eq!(m.world.treaties[ti].broken_by, match how { "borrower" => Some(1), "lender" => Some(0), _ => None });
        // and the books keep balancing afterwards
        audited(&mut m);
    }
}

#[test]
fn a_lender_cannot_second_more_than_half_of_its_free_holders() {
    let mut m = coop_world("secondment-bounds", 10_000);
    let too_many = vec![Clause::Secondment { from: 0, qual: Qual::FtlEngineer, count: 6_000, months: 24 }];
    assert!(diplomacy::validate_clauses(&m.world, 0, 1, &too_many).is_err());
    // a borrower may ask, but the lender's people are counted again at signing
    assert!(diplomacy::validate_clauses(&m.world, 1, 0, &too_many).is_ok());
    let err = sign_from(&mut m, 1, too_many).unwrap_err();
    assert!(err.contains("cannot spare"), "{err}");
    for bad in [
        Clause::Secondment { from: 0, qual: Qual::FtlEngineer, count: 100, months: 24 },
        Clause::Secondment { from: 0, qual: Qual::FtlEngineer, count: 1_000, months: 3 },
        Clause::Secondment { from: 0, qual: Qual::FtlEngineer, count: 1_000, months: 241 },
        Clause::Secondment { from: 2, qual: Qual::FtlEngineer, count: 1_000, months: 24 },
    ] {
        assert!(diplomacy::validate_clauses(&m.world, 0, 1, &[bad.clone()]).is_err(), "{bad:?}");
    }
    assert!(sign(&mut m, vec![Clause::Secondment { from: 0, qual: Qual::FtlEngineer, count: 5_000, months: 24 }]).is_ok());
}

#[test]
fn the_audit_notices_experts_who_were_never_sent() {
    let m = coop_world("secondment-audit", 10_000);
    let before = m.ledger_snapshot();
    let mut w = m.world.clone();
    let cap = w.civs[1].capital as usize;
    w.regions[cap].quals[Qual::FtlEngineer.index()] += 500;
    w.civs[1].qual_flows.seconded_in[Qual::FtlEngineer.index()] += 500;
    let after = crate::ledger::snapshot(&w, false);
    let v = ledger::violations(&before, &after);
    assert!(v.iter().any(|x| x.contains("seconded experts arrived")), "{v:?}");
}

// ---- joint programmes ---------------------------------------------------------------

/// Seat 0 hosts a high-energy laboratory in its capital that ran at full rate last
/// month; nothing else stands there, so its upkeep is all the capital's works take.
fn host_world(seed: &str) -> Match {
    let mut m = coop_world(seed, 0);
    let cap = m.world.civs[0].capital as usize;
    let r = &mut m.world.regions[cap];
    r.facilities.clear();
    put_works(r, "high_energy", 1);
    ran(&mut m, 10_000);
    m
}

fn ran(m: &mut Match, rate_bp: u16) {
    let cap = m.world.civs[0].capital as usize;
    let k = content().f("high_energy");
    let f = m.world.regions[cap].fac_mut(k).unwrap();
    f.run = Some(RunStat { recipe: 0, rate_bp, blockers: 0, missing: vec![] });
}

fn lab(months: u16) -> Clause {
    Clause::JointProgramme { host: 0, service: ProgrammeService::HighEnergy, months }
}

#[test]
fn a_joint_programme_serves_only_while_the_host_runs_and_the_treaty_holds() {
    let mut m = host_world("programme");
    let k = content().f("high_energy");
    assert!(!crate::state::CivCtx { world: &m.world, seat: 1 }.fac(k));
    let ti = sign(&mut m, vec![lab(48), Clause::Goods { from: 1, good: Good::Electronics, amount_per_month: 20_000, months: 1 }]).expect("signed");
    assert!(m.world.programme_access(1, ProgrammeService::HighEnergy));
    // the client counts as having the installation, for requirements and investigations
    assert!(crate::state::CivCtx { world: &m.world, seat: 1 }.fac(k));
    assert!(!m.world.programme_access(0, ProgrammeService::HighEnergy), "the host is not its own client");
    // a month below half rate: no service, and a recorded shortfall
    ran(&mut m, 4_000);
    diplomacy::step(&mut m.world);
    assert!(!m.world.programme_access(1, ProgrammeService::HighEnergy));
    assert!(!crate::state::CivCtx { world: &m.world, seat: 1 }.fac(k));
    assert_eq!(m.world.treaties[ti].programmes[0].shortfalls, 1);
    ran(&mut m, 9_000);
    diplomacy::step(&mut m.world);
    assert!(m.world.programme_access(1, ProgrammeService::HighEnergy));
    let obs = m.observe(1);
    let tv = obs.diplomacy.treaties.iter().find(|t| t.id == m.world.treaties[ti].id).unwrap();
    assert!(tv.programmes[0].served && tv.programmes[0].shortfalls == 1);
    // a breach ends it at once and is recorded
    diplomacy::break_treaty(&mut m.world, 0, ti);
    assert!(!m.world.programme_access(1, ProgrammeService::HighEnergy));
    assert!(m.world.treaties[ti].performance.iter().any(|p| p.contains("lapsed with the breach")), "{:?}", m.world.treaties[ti].performance);
    ran(&mut m, 10_000);
    diplomacy::step(&mut m.world);
    assert!(!m.world.programme_access(1, ProgrammeService::HighEnergy));
    assert_eq!(m.world.programme_clients(0, ProgrammeService::HighEnergy), 0);
}

#[test]
fn a_joint_programme_lapses_when_war_comes_and_at_its_term() {
    let mut m = host_world("programme-war");
    let ti = sign(&mut m, vec![lab(12)]).expect("signed");
    crate::sim::military::declare_war(&mut m.world, 1, 0, "A test of the rules.");
    assert!(!m.world.programme_access(1, ProgrammeService::HighEnergy));
    assert_eq!(m.world.treaties[ti].status, "broken");
    let mut m = host_world("programme-term");
    let ti = sign(&mut m, vec![lab(12)]).expect("signed");
    for _ in 0..12 {
        ran(&mut m, 10_000);
        m.world.month += 1;
        diplomacy::step(&mut m.world);
    }
    assert!(!m.world.programme_access(1, ProgrammeService::HighEnergy));
    assert_ne!(m.world.treaties[ti].status, "active");
}

#[test]
fn an_installation_serves_at_most_two_partners() {
    let mut m = host_world("programme-two");
    m.world.civs[0].contacts[2].met = true;
    m.world.civs[2].contacts[0].met = true;
    m.world.civs[0].contacts[3].met = true;
    know_everything(&mut m.world, 2);
    know_everything(&mut m.world, 3);
    let mut signed = 0;
    for client in [1u32, 2, 3] {
        let ok = diplomacy::validate_clauses(&m.world, 0, client as SeatId, &[lab(24)]);
        if signed < 2 {
            assert!(ok.is_ok(), "{ok:?}");
            let id = m.world.id();
            m.world.offers.push(Offer { id, from: 0, to: client as SeatId, clauses: vec![lab(24)], text: String::new(), created: 0, expires_round: 9, status: "open".into() });
            let ix = m.world.offers.len() - 1;
            diplomacy::activate(&mut m.world, ix).expect("signed");
            signed += 1;
        } else {
            assert!(ok.unwrap_err().contains("two partners"));
            // asked by the third partner instead, the host cannot take it on at signing
            let id = m.world.id();
            m.world.offers.push(Offer { id, from: client as SeatId, to: 0, clauses: vec![lab(24)], text: String::new(), created: 0, expires_round: 9, status: "open".into() });
            let ix = m.world.offers.len() - 1;
            assert!(diplomacy::activate(&mut m.world, ix).is_err());
        }
    }
    assert_eq!(m.world.programme_clients(0, ProgrammeService::HighEnergy), 2);
}

#[test]
fn serving_partners_raises_the_hosts_upkeep_by_half_for_each() {
    let upkeep = |clients: u32| -> i64 {
        let mut m = host_world("programme-load");
        for c in 0..clients {
            let client = 1 + c as SeatId;
            m.world.civs[0].contacts[client as usize].met = true;
            know_everything(&mut m.world, client as usize);
            let id = m.world.id();
            m.world.offers.push(Offer { id, from: 0, to: client, clauses: vec![lab(24)], text: String::new(), created: 0, expires_round: 9, status: "open".into() });
            let ix = m.world.offers.len() - 1;
            diplomacy::activate(&mut m.world, ix).expect("signed");
        }
        let before = m.world.civs[0].flows.consumed[Good::Instruments.index()];
        crate::sim::economy::step(&mut m.world, 0);
        m.world.civs[0].flows.consumed[Good::Instruments.index()] - before
    };
    let (alone, one, two) = (upkeep(0), upkeep(1), upkeep(2));
    assert!(alone > 0);
    assert_eq!(one, alone * 3 / 2);
    assert_eq!(two, alone * 2);
}

#[test]
fn a_programme_is_hidden_from_a_seat_that_has_not_discovered_the_installation() {
    let mut m = host_world("programme-hidden");
    // seat 1 forgets everything: the laboratory is not in its catalog
    for t in m.world.civs[1].tech.iter_mut() {
        *t = TechSt::default();
    }
    let id = m.world.id();
    m.world.offers.push(Offer { id, from: 0, to: 1, clauses: vec![lab(24)], text: String::new(), created: 0, expires_round: 9, status: "open".into() });
    let obs = m.observe(1);
    let o = obs.diplomacy.offers.iter().find(|o| o.id == id).unwrap();
    assert_eq!(o.clauses[0], Clause::JointProgramme { host: 0, service: ProgrammeService::Undisclosed, months: 24 });
    assert!(o.summary[0].contains("a programme facility service"), "{:?}", o.summary);
    let json = serde_json::to_string(&obs.diplomacy).unwrap();
    for word in ["High-energy", "high_energy", "high-energy"] {
        if let Some(i) = json.find(word) {
            panic!("the observation names the installation: ...{}...", &json[i.saturating_sub(300)..(i + 100).min(json.len())]);
        }
    }
    // such a seat cannot sign it, nor propose one: undisclosed and undiscovered read alike
    let ix = m.world.offers.len() - 1;
    assert!(diplomacy::activate(&mut m.world, ix).is_err());
    let a = diplomacy::validate_clauses(&m.world, 1, 0, &[lab(24)]).unwrap_err();
    let b = diplomacy::validate_clauses(&m.world, 1, 0, &[Clause::JointProgramme { host: 0, service: ProgrammeService::Undisclosed, months: 24 }]).unwrap_err();
    assert_eq!(a, b);
    // the seat that knows reads it plainly
    let obs = m.observe(0);
    let o = obs.diplomacy.offers.iter().find(|o| o.id == id).unwrap();
    assert!(o.summary[0].contains("high-energy laboratory time"), "{:?}", o.summary);
}

// ---- the base checks ----------------------------------------------------------------

fn failing(w: &World) -> Vec<String> {
    victory::ftl_checks(w, 0).into_iter().filter(|c| !c.ok).map(|c| c.label).collect()
}

fn only_fails(w: &World, prefix: &str) {
    let f = failing(w);
    assert!(f.len() == 1 && f[0].starts_with(prefix), "expected only {prefix:?} to fail, got {f:?}\n{:#?}", victory::ftl_checks(w, 0));
}

fn remove(w: &mut World, key: &str) {
    let k = content().f(key);
    for r in w.regions.iter_mut() {
        r.facilities.retain(|f| f.kind != k);
    }
}

#[test]
fn each_base_requirement_is_separately_necessary() {
    let w = endgame_world();
    assert!(failing(&w).is_empty(), "{:#?}", victory::ftl_checks(&w, 0));
    for c in victory::ftl_checks(&w, 0) {
        assert!(["industrial", "scientific", "educational", "logistical", "service"].contains(&c.category.as_str()), "{c:?}");
    }
    // educational: crews for every post, with reliefs
    let mut x = w.clone();
    for r in x.regions.iter_mut() {
        r.quals[Qual::Orbital.index()] = r.quals[Qual::Orbital.index()].min(2_000);
    }
    only_fails(&x, "Educational base: qualified crews");
    // educational: training that replaces them
    let mut x = w.clone();
    x.civs[0].programs.retain(|p| content().courses[p.course].output != Qual::FtlEngineer);
    only_fails(&x, "Educational base: training");
    // ...a course without a venue does not count
    let mut x = w.clone();
    remove(&mut x, "tech_institute");
    only_fails(&x, "Educational base: training");
    // scientific: frontier research capacity, and the laboratory
    let mut x = w.clone();
    x.civs[0].research_cap[ResearchClass::Frontier.index()] = 29_000;
    only_fails(&x, "Scientific base");
    let mut x = w.clone();
    remove(&mut x, "high_energy");
    only_fails(&x, "Scientific base");
    // industrial: a year of flight hardware
    for g in victory::HARDWARE_GOODS {
        let mut x = w.clone();
        x.civs[0].last_flows.produced[g.index()] = 0;
        only_fails(&x, "Industrial base");
    }
    // logistical: stores
    let mut x = w.clone();
    x.civs[0].stock[Good::Fuel.index()] = 1_000_000;
    only_fails(&x, "Logistical base: a year of fuel");
    // logistical: links and power at every site
    let mut x = w.clone();
    let node = x.test_nodes[0] as usize;
    let rail = content().f("rail");
    x.regions[node].facilities.retain(|f| f.kind != rail);
    only_fails(&x, "Logistical base: freight links");
    let mut x = w.clone();
    x.regions[node].last.elec_demand = 100_000;
    x.regions[node].last.elec_supply = 80_000;
    only_fails(&x, "Logistical base: freight links");
    // launch and recovery
    let mut x = w.clone();
    remove(&mut x, "launch_complex");
    only_fails(&x, "Launch and recovery");
}

#[test]
fn the_base_is_not_a_population_threshold() {
    let w = endgame_world();
    // a hundredth of the people with the same base passes the same checks
    let mut small = w.clone();
    for r in small.regions.iter_mut() {
        for b in r.blocks.iter_mut() {
            for a in b.ages.iter_mut() {
                *a /= 100;
            }
        }
    }
    assert!(failing(&small).is_empty(), "{:#?}", victory::ftl_checks(&small, 0));
    // ten times the people without the industrial, scientific and logistical base fails
    let mut big = w.clone();
    for r in big.regions.iter_mut() {
        for b in r.blocks.iter_mut() {
            for a in b.ages.iter_mut() {
                *a *= 10;
            }
        }
    }
    big.civs[0].last_flows.produced = vec![0; NG];
    big.civs[0].research_cap = vec![0; ResearchClass::COUNT];
    big.civs[0].stock[Good::Spares.index()] = 0;
    let f = failing(&big);
    for prefix in ["Industrial base", "Scientific base", "Logistical base: a year"] {
        assert!(f.iter().any(|l| l.starts_with(prefix)), "{f:?}");
    }
}

#[test]
fn a_small_civilization_can_import_hardware_borrow_crews_and_share_a_partners_installations() {
    let mut w = endgame_world();
    let c = content();
    // seat 0 is small: no launch complex, station, orbital yard or laboratory of its
    // own, no hardware industry, no courses for its crews
    for key in ["launch_complex", "orbital_station", "orbital_yard", "high_energy"] {
        remove(&mut w, key);
    }
    w.civs[0].last_flows.produced = vec![0; NG];
    w.civs[0].programs.clear();
    let f = failing(&w);
    for prefix in ["Educational base: training", "Scientific base", "Industrial base", "Launch and recovery"] {
        assert!(f.iter().any(|l| l.starts_with(prefix)), "{f:?}");
    }
    // seat 1 is the partner: its own region with the installations, running
    w.civs[1].status = SeatStatus::Active;
    let ri = w.regions.iter().position(|r| r.owner.is_none() && r.population() == 0 && !w.test_nodes.contains(&r.id)).expect("an empty region");
    w.regions[ri].owner = Some(1);
    w.regions[ri].controller = Some(1);
    w.civs[1].capital = ri as RegionId;
    for key in ["launch_complex", "orbital_station", "orbital_yard", "high_energy"] {
        w.regions[ri].facilities.push(Facility { run: Some(RunStat { recipe: 0, rate_bp: 10_000, blockers: 0, missing: vec![] }), operated: true, ..Facility::new(c.f(key), 1) });
    }
    let month = w.month;
    // contracted hardware, seconded crews and shared installations, in two treaties
    let hardware: Vec<Clause> = victory::HARDWARE_GOODS.iter().map(|g| Clause::Goods { from: 1, good: *g, amount_per_month: 1_000_000, months: 24 }).collect();
    let mut first = hardware.clone();
    first.push(Clause::Goods { from: 0, good: Good::Food, amount_per_month: 1_000_000, months: 24 });
    let services = [ProgrammeService::Launch, ProgrammeService::OrbitalYard, ProgrammeService::HighEnergy];
    let mut second: Vec<Clause> = services.iter().map(|s| Clause::JointProgramme { host: 1, service: *s, months: 120 }).collect();
    second.push(Clause::Secondment { from: 1, qual: Qual::FtlEngineer, count: 10_000, months: 120 });
    second.push(Clause::Secondment { from: 1, qual: Qual::Orbital, count: 10_000, months: 120 });
    let n1 = first.len();
    w.treaties.push(Treaty { id: 7001, parties: [0, 1], clauses: first, signed: month, remaining: vec![24; n1], ends: Some(month + 24), status: "active".into(), performance: vec![], shortfalls: 0, secondments: vec![], programmes: vec![], broken_by: None, notice_by: None });
    let programmes = services.iter().enumerate().map(|(i, s)| Programme { clause: i as u16, host: 1, client: 0, service: *s, ends: month + 120, served: true, shortfalls: 0 }).collect();
    let secondments = [Qual::FtlEngineer, Qual::Orbital].iter().enumerate().map(|(i, q)| Secondment { clause: 3 + i as u16, lender: 1, borrower: 0, qual: *q, sent: 10_000, owed: 10_000, home: ri as RegionId, due: month + 120, returned: 0, lost: 0, exits_seen: 0 }).collect();
    w.treaties.push(Treaty { id: 7002, parties: [0, 1], clauses: second, signed: month, remaining: vec![0; 5], ends: Some(month + 120), status: "active".into(), performance: vec![], shortfalls: 0, secondments, programmes, broken_by: None, notice_by: None });
    assert!(failing(&w).is_empty(), "{:#?}", victory::ftl_checks(&w, 0));
    // every substitute ends with its treaty
    let mut x = w.clone();
    x.treaties[1].status = "broken".into();
    let f = failing(&x);
    for prefix in ["Educational base: training", "Scientific base", "Launch and recovery"] {
        assert!(f.iter().any(|l| l.starts_with(prefix)), "{f:?}");
    }
    let mut x = w.clone();
    x.treaties[0].status = "broken".into();
    only_fails(&x, "Industrial base");
    // what the partner serves never stands in for the jump works themselves
    let mut x = w.clone();
    remove(&mut x, "jump_base");
    assert!(failing(&x).iter().any(|l| l.starts_with("Three deployment nodes")));
    let _ = Ending::Term;
}

#[test]
fn the_base_checks_do_not_name_installations_the_seat_has_not_discovered() {
    let mut w = endgame_world();
    for key in ["launch_complex", "orbital_station", "orbital_yard", "high_energy", "jump_yard", "jump_base"] {
        remove(&mut w, key);
    }
    let named = |w: &World| -> Vec<String> {
        victory::ftl_checks(w, 0).into_iter().filter(|c| c.category != "" && !c.label.contains("assembl") && !c.label.contains("node")).map(|c| c.detail).filter(|d| ["launch complex", "orbital construction yard", "high-energy", "jump assembly line", "jump deployment node"].iter().any(|n| d.to_lowercase().contains(n))).collect()
    };
    assert!(!named(&w).is_empty(), "a seat that knows them is told what is missing");
    for t in w.civs[0].tech.iter_mut() {
        *t = TechSt::default();
    }
    assert!(named(&w).is_empty(), "{:?}", named(&w));
}
