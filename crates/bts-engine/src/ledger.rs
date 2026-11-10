//! Referee-only conservation diagnostics.
//!
//! A [`LedgerSnapshot`] is the whole world's books at one moment: every stock and
//! goods flow, every holder of a qualification and the ledger that accounts for
//! them, every person, every deposit, and each region's service account. It is
//! built from the private world and is never part of a seat's observation.
//!
//! [`violations`] compares two consecutive snapshots and names every way in which
//! something entered or left the world without a recorded source. The conservation
//! tests (here and in `bts-ai`, which can drive the native opponents) call it for
//! every month of long matches; nothing else in the engine depends on it.

use crate::content::content;
use crate::state::*;
use bts_protocol::*;

#[derive(Clone, Debug)]
pub struct CivLedger {
    pub seat: SeatId,
    pub eliminated: bool,
    /// Goods in store, by `Good`.
    pub stock: Vec<i64>,
    /// Goods and people flows since the round's accounts were opened.
    pub flows: Flows,
    /// Holders of each qualification in the regions the seat controls.
    pub holders: Vec<i64>,
    /// The cumulative ledger that must account for them.
    pub qual_flows: QualFlows,
    pub soldiers: u64,
    /// Compute made this month (it serves next month) and drawn this month.
    pub compute_supply: i64,
    pub compute_used: i64,
    /// Researcher-months available and used this month, by class.
    pub research_cap: Vec<i64>,
    pub research_used: Vec<i64>,
    /// People in the posts of research works in the seat's regions.
    pub research_staff: i64,
}

#[derive(Clone, Debug)]
pub struct RegionLedger {
    pub id: RegionId,
    pub controller: Option<SeatId>,
    /// The seat whose economy ran the region's last month (the owner of the service account).
    pub month_seat: Option<SeatId>,
    pub residents: u32,
    pub working: u32,
    /// Learners the region counts, and learners enrolled in the programmes held there.
    pub students: u32,
    pub enrolled: u32,
    pub quals: Vec<u32>,
    pub teachers: Vec<u32>,
    pub power: PowerLedger,
    /// Workers called up for projects last month and the work projects accepted from them.
    pub project_workers: u32,
    pub project_work_done: i64,
}

#[derive(Clone, Debug)]
pub struct DepositLedger {
    pub region: RegionId,
    pub kind: Deposit,
    pub remaining: i64,
    pub drawn: i64,
    pub delivered: i64,
}

#[derive(Clone, Debug)]
pub struct LedgerSnapshot {
    pub month: Month,
    pub round: u32,
    /// Taken after the seats' decisions of a round, before its first month is resolved.
    /// Otherwise the snapshot closes the month it is stamped with.
    pub before_month: bool,
    pub civs: Vec<CivLedger>,
    pub regions: Vec<RegionLedger>,
    pub deposits: Vec<DepositLedger>,
    /// Everyone alive: residents of every region plus soldiers.
    pub people: u64,
}

/// The good a deposit yields.
pub fn deposit_good(d: Deposit) -> Good {
    match d {
        Deposit::CopperOre => Good::CopperOre,
        Deposit::IronOre => Good::IronOre,
        Deposit::Coal => Good::Coal,
        Deposit::Crude => Good::Crude,
        Deposit::Minerals => Good::Minerals,
    }
}

pub fn snapshot(w: &World, before_month: bool) -> LedgerSnapshot {
    let c = content();
    let civs = w
        .civs
        .iter()
        .map(|civ| {
            let mine = || w.regions.iter().filter(|r| r.controller == Some(civ.seat));
            // counted where this seat's economy ran the month, whoever holds the region now
            let research_staff: i64 = w
                .regions
                .iter()
                .filter(|r| r.last.seat == Some(civ.seat))
                .flat_map(|r| r.facilities.iter())
                .filter(|f| c.facilities[f.kind].recipes.iter().any(|r| r.research.is_some()))
                .map(|f| f.staffed as i64)
                .sum();
            CivLedger {
                seat: civ.seat,
                eliminated: civ.status == SeatStatus::Eliminated,
                stock: civ.stock.clone(),
                flows: civ.flows.clone(),
                holders: (0..NQ).map(|q| mine().map(|r| r.quals[q] as i64).sum()).collect(),
                qual_flows: civ.qual_flows.clone(),
                soldiers: w.armies.iter().filter(|a| a.owner == civ.seat).map(|a| a.count() as u64).sum(),
                compute_supply: civ.compute_supply,
                compute_used: civ.compute_used,
                research_cap: civ.research_cap.clone(),
                research_used: civ.research_used.clone(),
                research_staff,
            }
        })
        .collect();
    let regions = w
        .regions
        .iter()
        .enumerate()
        .map(|(ri, r)| RegionLedger {
            id: r.id,
            controller: r.controller,
            month_seat: r.last.seat,
            residents: r.population(),
            working: r.working(),
            students: r.students,
            enrolled: crate::sim::population::enrolled_in(w, ri),
            quals: r.quals.to_vec(),
            teachers: r.teachers.to_vec(),
            power: r.last.power.clone(),
            project_workers: r.last.labor.projects,
            project_work_done: r.last.project_work_done,
        })
        .collect();
    let deposits = w
        .regions
        .iter()
        .flat_map(|r| r.deposits.iter().map(move |d| DepositLedger { region: r.id, kind: d.kind, remaining: d.remaining, drawn: d.drawn, delivered: d.delivered }))
        .collect();
    let people = w.regions.iter().map(|r| r.population() as u64).sum::<u64>() + w.armies.iter().map(|a| a.count() as u64).sum::<u64>();
    LedgerSnapshot { month: w.month, round: w.round, before_month, civs, regions, deposits, people }
}

/// Every conservation rule the books of `cur` break, on their own or against the
/// snapshot `prev` taken immediately before (the previous month's close, or the
/// close of the previous round when `cur` is a round's `before_month` snapshot).
/// An empty list means nothing entered or left the world unrecorded in the step.
pub fn violations(prev: &LedgerSnapshot, cur: &LedgerSnapshot) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let at = format!("month {} (round {}{})", cur.month, cur.round, if cur.before_month { ", after decisions" } else { "" });
    // the round's accounts are reopened at zero between a round's last month and the next round's decisions
    let reopened = cur.round != prev.round;
    let zero = Flows::new();
    let mut traded = vec![0i64; NG];
    let mut made = vec![0i64; NG];
    let (mut births, mut deaths) = (0i64, 0i64);

    // ---- goods: stock change = produced - consumed - lost + traded in - traded out ----
    for (p, c) in prev.civs.iter().zip(cur.civs.iter()) {
        let base = if reopened { &zero } else { &p.flows };
        for g in 0..NG {
            let d = |now: &Vec<i64>, was: &Vec<i64>| now[g] - was[g];
            let (produced, consumed, lost) = (d(&c.flows.produced, &base.produced), d(&c.flows.consumed, &base.consumed), d(&c.flows.lost, &base.lost));
            let (t_in, t_out) = (d(&c.flows.traded_in, &base.traded_in), d(&c.flows.traded_out, &base.traded_out));
            let good = Good::from_index(g);
            if produced < 0 || consumed < 0 || lost < 0 || t_in < 0 || t_out < 0 {
                out.push(format!("{at}: seat {} {good:?}: a flow ran backwards", c.seat));
            }
            let change = c.stock[g] - p.stock[g];
            if change != produced - consumed - lost + t_in - t_out {
                out.push(format!("{at}: seat {} {good:?}: stock changed by {change} but the ledger explains {} (+{produced} made -{consumed} used -{lost} lost +{t_in} in -{t_out} out)", c.seat, produced - consumed - lost + t_in - t_out));
            }
            if c.stock[g] < 0 {
                out.push(format!("{at}: seat {} holds {} of {good:?}", c.seat, c.stock[g]));
            }
            traded[g] += t_in - t_out;
            made[g] += produced;
        }
        births += c.flows.births as i64 - base.births as i64;
        deaths += c.flows.deaths as i64 - base.deaths as i64;
    }
    for g in 0..NG {
        if traded[g] != 0 {
            out.push(format!("{at}: {:?}: {} more was received in trade than was handed over", Good::from_index(g), traded[g]));
        }
    }

    // ---- people: the world changes by births less deaths ----------------------------
    let change = cur.people as i64 - prev.people as i64;
    if change != births - deaths {
        out.push(format!("{at}: the world's people changed by {change} with {births} births and {deaths} deaths recorded"));
    }

    // ---- qualified people: holders are what the ledger accounts for ----------------------
    for (p, c) in prev.civs.iter().zip(cur.civs.iter()) {
        for q in 0..NQ {
            let qual = Qual::from_index(q);
            if c.holders[q] != c.qual_flows.balance(q) {
                out.push(format!("{at}: seat {} has {} {qual:?} but its ledger accounts for {}", c.seat, c.holders[q], c.qual_flows.balance(q)));
            }
            let (a, b) = (&p.qual_flows, &c.qual_flows);
            let channels = [
                (&a.initial, &b.initial),
                (&a.trained, &b.trained),
                (&a.entered, &b.entered),
                (&a.returned, &b.returned),
                (&a.died, &b.died),
                (&a.retired, &b.retired),
                (&a.enlisted, &b.enlisted),
                (&a.moved_in, &b.moved_in),
                (&a.moved_out, &b.moved_out),
                (&a.seconded_out, &b.seconded_out),
                (&a.seconded_in, &b.seconded_in),
                (&a.seconded_lost, &b.seconded_lost),
            ];
            if channels.iter().any(|(was, now)| now[q] < was[q]) {
                out.push(format!("{at}: seat {} {qual:?}: a ledger channel ran backwards", c.seat));
            }
            if b.initial[q] != a.initial[q] {
                out.push(format!("{at}: seat {} {qual:?}: the initial endowment changed", c.seat));
            }
        }
    }
    for q in 0..NQ {
        let qual = Qual::from_index(q);
        let moved: i64 = cur.civs.iter().map(|c| c.qual_flows.moved_in[q] - c.qual_flows.moved_out[q]).sum();
        if moved != 0 {
            out.push(format!("{at}: {qual:?}: {moved} more arrived from other civilizations than left for them"));
        }
        let seconded: i64 = cur.civs.iter().map(|c| c.qual_flows.seconded_in[q] + c.qual_flows.seconded_lost[q] - c.qual_flows.seconded_out[q]).sum();
        if seconded > 0 {
            out.push(format!("{at}: {qual:?}: {seconded} more seconded experts arrived than were sent"));
        }
        let held: i64 = cur.regions.iter().map(|r| r.quals[q] as i64).sum();
        let accounted: i64 = cur.civs.iter().map(|c| c.qual_flows.balance(q)).sum();
        if held != accounted {
            out.push(format!("{at}: the world has {held} {qual:?} but the ledgers account for {accounted}"));
        }
    }

    // ---- regions: roles are backed by people; service and work have a source -------------
    let n = cur.civs.len();
    let mut grid_in = vec![0i64; n];
    let mut grid_out = vec![0i64; n];
    for r in &cur.regions {
        let name = format!("{at}: region {}", r.id);
        if r.controller.is_none() && (r.residents > 0 || r.quals.iter().any(|x| *x > 0) || r.students > 0) {
            out.push(format!("{name}: people live under no government ({} residents)", r.residents));
        }
        let roles: u64 = r.quals.iter().map(|x| *x as u64).sum::<u64>() + r.students as u64;
        if roles > r.working as u64 {
            out.push(format!("{name}: {roles} qualified people and learners but only {} residents of working age", r.working));
        }
        for q in 0..NQ {
            if r.teachers[q] > r.quals[q] {
                out.push(format!("{name}: {} instructors among {} {:?}", r.teachers[q], r.quals[q], Qual::from_index(q)));
            }
        }
        if r.students != r.enrolled {
            out.push(format!("{name}: counts {} learners but its programmes enrol {}", r.students, r.enrolled));
        }
        let p = &r.power;
        if [p.shaft_made, p.shaft_to_generators, p.shaft_from_motors, p.shaft_used, p.elec_made, p.elec_from_generators, p.elec_to_motors, p.grid_out, p.grid_in, p.elec_used].iter().any(|v| *v < 0) {
            out.push(format!("{name}: a negative service flow {p:?}"));
        }
        if p.shaft_used > p.shaft_made - p.shaft_to_generators + p.shaft_from_motors {
            out.push(format!("{name}: shaft work used exceeds supply {p:?}"));
        }
        if p.elec_from_generators > p.shaft_to_generators * 9 / 10 || p.shaft_from_motors * 10 > p.elec_to_motors * 9 {
            out.push(format!("{name}: a conversion returned more than nine tenths {p:?}"));
        }
        if p.elec_used + p.elec_to_motors + p.grid_out > p.elec_made + p.elec_from_generators + p.grid_in {
            out.push(format!("{name}: electricity used exceeds supply {p:?}"));
        }
        if let Some(s) = r.month_seat {
            grid_in[s as usize] += p.grid_in;
            grid_out[s as usize] += p.grid_out;
        } else if *p != PowerLedger::default() {
            out.push(format!("{name}: a service account nobody ran {p:?}"));
        }
        if r.project_work_done > r.project_workers as i64 || r.project_work_done < 0 {
            out.push(format!("{name}: projects accepted {} worker-months from {} called-up workers", r.project_work_done, r.project_workers));
        }
    }
    for s in 0..n {
        if grid_in[s] * 100 > grid_out[s] * 92 {
            out.push(format!("{at}: seat {s}: the grid delivered {} from a surplus of {}", grid_in[s], grid_out[s]));
        }
    }
    for (p, c) in prev.civs.iter().zip(cur.civs.iter()) {
        // compute installed last month serves this month
        if cur.month == prev.month + 1 && c.compute_used > p.compute_supply {
            out.push(format!("{at}: seat {} used {} compute; {} was installed the month before", c.seat, c.compute_used, p.compute_supply));
        }
        for k in 0..c.research_cap.len() {
            if c.research_used[k] > c.research_cap[k] || c.research_used[k] < 0 {
                out.push(format!("{at}: seat {} used {} researcher-months of class {k} with {} available", c.seat, c.research_used[k], c.research_cap[k]));
            }
        }
        let cap: i64 = c.research_cap.iter().sum();
        if cur.month == prev.month + 1 && cap > c.research_staff {
            out.push(format!("{at}: seat {} has {cap} researcher-months from {} people in research posts", c.seat, c.research_staff));
        }
    }

    // ---- deposits: ore delivered was drawn from the ground -------------------------------
    let mut delivered = vec![0i64; NG];
    for (p, c) in prev.deposits.iter().zip(cur.deposits.iter()) {
        let name = format!("{at}: {:?} in region {}", c.kind, c.region);
        if (p.region, p.kind) != (c.region, c.kind) {
            out.push(format!("{name}: the list of deposits changed"));
            continue;
        }
        let (drawn, got) = (c.drawn - p.drawn, c.delivered - p.delivered);
        if c.remaining < 0 || drawn < 0 || got < 0 {
            out.push(format!("{name}: a deposit ran backwards"));
        }
        if p.remaining - c.remaining != drawn {
            out.push(format!("{name}: the deposit fell by {} but {drawn} was drawn", p.remaining - c.remaining));
        }
        if got > drawn {
            out.push(format!("{name}: {got} delivered from {drawn} drawn"));
        }
        delivered[deposit_good(c.kind).index()] += got;
    }
    if prev.deposits.len() != cur.deposits.len() {
        out.push(format!("{at}: the number of deposits changed"));
    }
    for d in Deposit::ALL {
        let g = deposit_good(*d).index();
        if made[g] != delivered[g] {
            out.push(format!("{at}: {:?}: {} was booked as produced but the deposits delivered {}", Good::from_index(g), made[g], delivered[g]));
        }
    }
    out
}
