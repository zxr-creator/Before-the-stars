//! Structured treaties: activation, monthly deliveries, expiry and breach.
//!
//! A signature creates obligations; only actual deliveries count as performance.
//! Knowledge that has been handed over is never erased by a later breach.

use crate::content::content;
use crate::sim::chronicle::{brief, moment};
use crate::state::*;
use bts_protocol::*;

pub fn clause_summary(w: &World, c: &Clause) -> String {
    let ct = content();
    let n = |s: SeatId| w.civs[s as usize].name.clone();
    match c {
        Clause::Goods { from, good, amount_per_month, months } => {
            let amt = *amount_per_month as f64 / 1000.0;
            if *months <= 1 {
                format!("{} delivers {:.0} {}", n(*from), amt, good.label().to_lowercase())
            } else {
                format!("{} delivers {:.0} {} each month for {} months", n(*from), amt, good.label().to_lowercase(), months)
            }
        }
        Clause::Knowledge { from, tech } => {
            let name = ct.tech_ix.get(tech).map(|i| ct.techs[*i].name.clone()).unwrap_or_else(|| "a known method".into());
            format!("{} teaches: {}", n(*from), name)
        }
        Clause::Practice { from, practice } => {
            let name = ct.prac_ix.get(practice).map(|i| ct.practices[*i].name.clone()).unwrap_or_else(|| "a known practice".into());
            format!("{} describes its practice: {}", n(*from), name)
        }
        Clause::Maps { from } => format!("{} shares its maps and surveys", n(*from)),
        Clause::NonAggression { months } => format!("Neither party attacks the other for {months} months"),
        Clause::DefensivePact { months } => format!("Each answers attacks on the other for {months} months"),
        Clause::Peace => "The parties end their war".into(),
        Clause::Subordination { from, tribute_bp } => format!("{} accepts the other party as highest authority and remits {:.0}% of output", n(*from), *tribute_bp as f64 / 100.0),
        Clause::CedeRegion { from, region } => format!("{} cedes {}", n(*from), w.regions[*region as usize].name),
        Clause::Secondment { from, qual, count, months } => {
            format!("{} seconds {} {} to the other party for {} months", n(*from), crate::util::group(*count as i64), qual.label().to_lowercase(), months)
        }
        Clause::JointProgramme { host, service, months } => match service {
            ProgrammeService::Undisclosed => format!("{} shares a programme facility service with the other party for {} months", n(*host), months),
            s => format!("{} shares its {} with the other party for {} months", n(*host), s.label().to_lowercase(), months),
        },
    }
}

/// A clause as one seat may read it: a joint programme whose installation the
/// viewer has not discovered is described without naming it.
pub fn clause_summary_for(w: &World, viewer: SeatId, c: &Clause) -> String {
    match c {
        Clause::JointProgramme { .. } => clause_summary(w, &crate::actions::view_clause(w, viewer, c)),
        _ => clause_summary(w, c),
    }
}

/// People one secondment clause may lend, and its term in months.
pub const SECONDMENT_PEOPLE: (u32, u32) = (500, 200_000);
pub const SECONDMENT_MONTHS: (u16, u16) = (6, 240);
/// Term of a joint programme clause in months.
pub const PROGRAMME_MONTHS: (u16, u16) = (12, 240);

/// Bounds on a clause term in months this round (design chapter 36, section 2.5):
/// at least the round's length and the clause's own minimum, at most three rounds
/// or the clause's own maximum, whichever is longer.
pub fn term_bounds(w: &World, own: (u16, u16)) -> (u32, u32) {
    let (lo, hi) = crate::calendar::clause_term_bounds(w.round_months());
    (lo.max(own.0 as u32), hi.max(own.1 as u32))
}

/// Remaining deliveries recorded for an open-ended goods clause until notice is given.
pub const OPEN_ENDED: u16 = u16::MAX;

fn term_error(what: &str, (lo, hi): (u32, u32), open: bool) -> String {
    format!("{what} runs for {lo} to {hi} months this round{}", if open { ", or open-ended (0) until notice" } else { "" })
}

/// Whether a seat has discovered the installation a joint programme service is
/// given by (and so may read, propose and sign the clause).
pub fn service_known(w: &World, seat: SeatId, service: ProgrammeService) -> bool {
    facility_of_service(service).map(|k| crate::actions::facility_visible(w, seat, content().f(k))).unwrap_or(false)
}

/// Experts a lender may still second of a qualification: half of its free holders.
pub fn secondable(w: &World, lender: SeatId, q: Qual) -> u32 {
    crate::sim::population::free_holders(w, lender, q) / 2
}

/// Checks that depend only on facts the proposer can know. Returns a public reason on failure.
pub fn validate_clauses(w: &World, a: SeatId, b: SeatId, clauses: &[Clause]) -> Result<(), String> {
    let ct = content();
    if clauses.is_empty() || clauses.len() > 8 {
        return Err("a treaty needs between one and eight clauses".into());
    }
    let party = |s: SeatId| s == a || s == b;
    let est = |s: SeatId, id: &str| w.civs[s as usize].est_id(id);
    // cooperation clauses are signed in peace, or together with the peace itself
    let at_war = w.at_war(a, b) && !clauses.iter().any(|c| matches!(c, Clause::Peace));
    for c in clauses {
        match c {
            Clause::Goods { from, amount_per_month, months, .. } => {
                if !party(*from) || *amount_per_month <= 0 {
                    return Err("invalid goods clause".into());
                }
                let bounds = term_bounds(w, (6, 240));
                if *months > 1 && ((*months as u32) < bounds.0 || *months as u32 > bounds.1) {
                    return Err(term_error("a recurring delivery", bounds, true));
                }
                if *months != 1 && !(est(a, "C021") || est(b, "C021")) {
                    return Err("recurring deliveries need merchant arbitration and escrow to be established by one party".into());
                }
            }
            Clause::Knowledge { from, tech } => {
                if !party(*from) {
                    return Err("invalid knowledge clause".into());
                }
                // Unknown and nonexistent handles are indistinguishable to the caller.
                let ok = ct.tech_ix.get(tech).map(|i| w.civs[*from as usize].knows(*i)).unwrap_or(false);
                if !ok && *from == a {
                    return Err("that method is not one you understand".into());
                }
            }
            Clause::Practice { from, practice } => {
                if !party(*from) {
                    return Err("invalid practice clause".into());
                }
                let ok = ct.prac_ix.get(practice).map(|i| w.civs[*from as usize].practice[*i].state >= 3).unwrap_or(false);
                if !ok && *from == a {
                    return Err("that practice is not one you have enacted".into());
                }
            }
            Clause::Maps { from } => {
                if !party(*from) {
                    return Err("invalid maps clause".into());
                }
            }
            Clause::NonAggression { months } => {
                let bounds = term_bounds(w, (6, 600));
                if *months != 0 && ((*months as u32) < bounds.0 || *months as u32 > bounds.1) {
                    return Err(term_error("a non-aggression pact", bounds, true));
                }
            }
            Clause::DefensivePact { months } => {
                let bounds = term_bounds(w, (6, 600));
                if *months != 0 && ((*months as u32) < bounds.0 || *months as u32 > bounds.1) {
                    return Err(term_error("a defensive pact", bounds, true));
                }
                if !(est(a, "C043") || est(b, "C043")) {
                    return Err("a defensive pact needs standing inter-polity dispute arrangements".into());
                }
            }
            Clause::Peace => {
                if !w.at_war(a, b) {
                    return Err("the parties are not at war".into());
                }
            }
            Clause::Subordination { from, tribute_bp } => {
                if !party(*from) || *tribute_bp > 5000 {
                    return Err("invalid subordination clause".into());
                }
                let over = if *from == a { b } else { a };
                if !(est(over, "C042") || est(over, "C063") || est(over, "C041")) {
                    return Err("the higher authority lacks institutions able to govern another polity".into());
                }
                if w.civs[*from as usize].overlord.is_some() || w.civs[over as usize].overlord == Some(*from) {
                    return Err("that relationship of authority is not available".into());
                }
            }
            Clause::CedeRegion { from, region } => {
                if !party(*from) || (*region as usize) >= w.regions.len() {
                    return Err("invalid cession".into());
                }
                if *from == a && w.regions[*region as usize].owner != Some(a) {
                    return Err("you do not hold that region".into());
                }
            }
            Clause::Secondment { from, qual, count, months } => {
                let (lo, hi) = term_bounds(w, SECONDMENT_MONTHS);
                if !party(*from) || *count < SECONDMENT_PEOPLE.0 || *count > SECONDMENT_PEOPLE.1 || (*months as u32) < lo || *months as u32 > hi {
                    return Err(format!("a secondment lends {} to {} people for {} to {} months", SECONDMENT_PEOPLE.0, crate::util::group(SECONDMENT_PEOPLE.1 as i64), lo, hi));
                }
                if at_war {
                    return Err("experts are not lent between parties at war".into());
                }
                // the proposer can know only its own people; the other side's are checked at signing
                if *from == a {
                    let asked: u32 = clauses.iter().map(|x| if let Clause::Secondment { from: f, qual: q, count: n, .. } = x { if *f == a && q == qual { *n } else { 0 } } else { 0 }).sum();
                    if asked > secondable(w, a, *qual) {
                        return Err("you cannot spare that many: at most half of your holders of a qualification who are not teaching may be seconded".into());
                    }
                }
            }
            Clause::JointProgramme { host, service, months } => {
                let (lo, hi) = term_bounds(w, PROGRAMME_MONTHS);
                if !party(*host) || (*months as u32) < lo || *months as u32 > hi {
                    return Err(format!("a joint programme runs for {lo} to {hi} months"));
                }
                // never valid when undisclosed or undiscovered; unknown and nonexistent read alike
                if !service_known(w, a, *service) {
                    return Err("that service is not one you know".into());
                }
                if at_war {
                    return Err("installations are not shared between parties at war".into());
                }
                let same = clauses.iter().filter(|x| matches!(x, Clause::JointProgramme { host: h, service: s, .. } if h == host && s == service)).count();
                if same > 1 {
                    return Err("a treaty shares one installation once".into());
                }
                if *host == a {
                    if w.service_site(a, *service).is_none() {
                        return Err("you have no working installation of that kind to share".into());
                    }
                    if w.programme_clients(a, *service) + 1 > crate::sim::economy::HOST_CLIENTS_MAX {
                        return Err("that installation already serves two partners".into());
                    }
                }
            }
        }
    }
    Ok(())
}

/// Turn a signed offer into an active treaty and execute its immediate clauses.
pub fn activate(w: &mut World, offer_ix: usize) -> Result<u32, String> {
    let ct = content();
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let (a, b, clauses) = {
        let o = &w.offers[offer_ix];
        (o.from, o.to, o.clauses.clone())
    };
    // authority and existence are checked again at signing: both sides sign the same version
    for c in &clauses {
        match c {
            Clause::Knowledge { from, tech } => {
                let ok = ct.tech_ix.get(tech).map(|i| w.civs[*from as usize].knows(*i)).unwrap_or(false);
                if !ok {
                    return Err("a promised method is not actually understood by its provider".into());
                }
            }
            Clause::Practice { from, practice } => {
                let ok = ct.prac_ix.get(practice).map(|i| w.civs[*from as usize].practice[*i].state >= 3).unwrap_or(false);
                if !ok {
                    return Err("a promised practice is not actually operated by its provider".into());
                }
            }
            Clause::CedeRegion { from, region } => {
                if w.regions[*region as usize].owner != Some(*from) {
                    return Err("a region in the treaty is no longer held by the ceding party".into());
                }
            }
            Clause::Subordination { from, .. } => {
                if w.civs[*from as usize].overlord.is_some() {
                    return Err("the subordinate party already answers to another authority".into());
                }
            }
            Clause::Peace => {
                if !w.at_war(a, b) {
                    return Err("the parties are not at war".into());
                }
            }
            Clause::Secondment { from, qual, .. } => {
                let asked: u32 = clauses.iter().map(|x| if let Clause::Secondment { from: f, qual: q, count: n, .. } = x { if f == from && q == qual { *n } else { 0 } } else { 0 }).sum();
                if asked > secondable(w, *from, *qual) {
                    return Err("a party cannot spare the experts it would lend".into());
                }
            }
            Clause::JointProgramme { host, service, .. } => {
                // the signer must know what it signs; the host must still have it to share
                if !service_known(w, a, *service) || !service_known(w, b, *service) {
                    return Err("a clause names a service you do not know".into());
                }
                if w.service_site(*host, *service).is_none() || w.programme_clients(*host, *service) + 1 > crate::sim::economy::HOST_CLIENTS_MAX {
                    return Err("the host cannot take on that service".into());
                }
            }
            _ => {}
        }
    }
    let id = w.id();
    let mut secondments: Vec<Secondment> = Vec::new();
    let mut programmes: Vec<Programme> = Vec::new();
    let mut remaining = Vec::new();
    let mut ends: Option<Month> = None;
    let mut standing = false;
    let (an, bn) = (w.civs[a as usize].name.clone(), w.civs[b as usize].name.clone());
    for (ci, c) in clauses.iter().enumerate() {
        let mut rem = 0u16;
        match c {
            Clause::Goods { months, .. } => rem = if *months == 0 { OPEN_ENDED } else { *months },
            Clause::Knowledge { from, tech } => {
                let to = if *from == a { b } else { a };
                let ti = ct.tech_ix[tech];
                let licensed = w.civs[*from as usize].est_id("C031");
                let translated = w.civs[to as usize].est_id("C024");
                let discount = 4000 + if licensed { 2000 } else { 0 } + if translated { 1500 } else { 0 };
                let giver = w.civs[*from as usize].name.clone();
                let st = &mut w.civs[to as usize].tech[ti];
                if st.state < ST_DISCOVERED {
                    st.state = ST_DISCOVERED;
                    st.disc_month = month;
                    st.source = format!("Taught by {giver}");
                }
                if st.state < ST_UNDERSTOOD {
                    st.discount_bp = st.discount_bp.max(discount);
                    // existing investigation benefits from the records
                    for p in w.civs[to as usize].projects.iter_mut() {
                        if p.kind == (ProjKind::Research { tech: ti }) {
                            let full = crate::sim::projects::scaled(ct.techs[ti].work, w.cfg.research_pace());
                            p.work_needed = p.work_needed.min(full * (10_000 - discount as i64) / 10_000).max(p.work_done);
                        }
                    }
                }
            }
            Clause::Practice { from, practice } => {
                let to = if *from == a { b } else { a };
                let pi = ct.prac_ix[practice];
                let giver = w.civs[*from as usize].name.clone();
                let st = &mut w.civs[to as usize].practice[pi];
                if st.state == 0 {
                    st.state = 1;
                    st.rec_month = month;
                    st.source = format!("Described by {giver}");
                }
            }
            Clause::Maps { from } => {
                let to = if *from == a { b } else { a };
                for ri in 0..w.regions.len() {
                    let src = w.civs[*from as usize].memory[ri].clone();
                    let dst = &mut w.civs[to as usize].memory[ri];
                    if src.seen && (!dst.seen || dst.last_seen < src.last_seen) {
                        dst.seen = true;
                        dst.last_seen = src.last_seen;
                        dst.owner = src.owner;
                        dst.pop_estimate = src.pop_estimate;
                        dst.notable = src.notable.clone();
                    }
                    if src.surveyed && !dst.surveyed {
                        dst.surveyed = true;
                        dst.survey_month = src.survey_month;
                    }
                }
                for o in 0..w.civs.len() {
                    if w.civs[*from as usize].contacts[o].met && o != to as usize {
                        crate::sim::knowledge::meet(w, to, o as SeatId);
                    }
                }
            }
            Clause::NonAggression { months } | Clause::DefensivePact { months } => {
                standing = true;
                // an open-ended pact has no end until a party gives notice
                if *months > 0 {
                    let e = month + *months as u32;
                    ends = Some(ends.map(|x: Month| x.max(e)).unwrap_or(e));
                }
            }
            Clause::Peace => {
                crate::sim::military::make_peace(w, a, b);
                let cap_a = w.civs[a as usize].capital;
                let cap_b = w.civs[b as usize].capital;
                moment(w, a, MomentCategory::Diplomacy, format!("Peace with {bn}"), format!("{an} and {bn} signed an end to their war."), Some(cap_a), "treaty", true, vec![format!("Signed in {when}")]);
                moment(w, b, MomentCategory::Diplomacy, format!("Peace with {an}"), format!("{bn} and {an} signed an end to their war."), Some(cap_b), "treaty", true, vec![format!("Signed in {when}")]);
            }
            Clause::Subordination { from, .. } => {
                standing = true;
                let over = if *from == a { b } else { a };
                w.civs[*from as usize].overlord = Some(over);
                if w.at_war(a, b) {
                    crate::sim::military::make_peace(w, a, b);
                }
                let (sn, on) = (w.civs[*from as usize].name.clone(), w.civs[over as usize].name.clone());
                let cap_s = w.civs[*from as usize].capital;
                let cap_o = w.civs[over as usize].capital;
                moment(w, over, MomentCategory::Governance, format!("{sn} accepts our authority"), format!("By charter, {sn} keeps its local government and answers to {on} as highest authority. The arrangement holds only while both actually honour it."), Some(cap_o), "treaty", true, vec![format!("Charter signed in {when}")]);
                moment(w, *from, MomentCategory::Governance, format!("We accept the authority of {on}"), format!("{sn} keeps its local government but answers to {on}. Leaving the charter remains possible, at a price."), Some(cap_s), "treaty", true, vec![format!("Charter signed in {when}")]);
            }
            Clause::Secondment { from, qual, count, months } => {
                standing = true;
                let to = if *from == a { b } else { a };
                let due = month + *months as u32;
                ends = Some(ends.map(|x: Month| x.max(due)).unwrap_or(due));
                // they go to the borrower's capital, or where it governs if the capital is held by another
                let cap = w.civs[to as usize].capital as usize;
                let dest = if w.regions[cap].controller == Some(to) { cap } else { w.regions.iter().filter(|r| r.controller == Some(to)).max_by_key(|r| (r.population(), std::cmp::Reverse(r.id))).map(|r| r.id as usize).unwrap_or(cap) };
                let (sent, home) = if w.regions[dest].controller == Some(to) { crate::sim::population::second_out(w, *from, *qual, *count, dest) } else { (0, w.civs[*from as usize].capital) };
                let exits_seen = w.civs[to as usize].qual_flows.exits(qual.index());
                secondments.push(Secondment { clause: ci as u16, lender: *from, borrower: to, qual: *qual, sent, owed: sent, home, due, returned: 0, lost: 0, exits_seen });
                let (ln, bn2) = (w.civs[*from as usize].name.clone(), w.civs[to as usize].name.clone());
                let (people, what) = (crate::util::group(sent as i64), qual.label().to_lowercase());
                let dest_name = w.regions[dest].name.clone();
                let due_label = crate::util::date_label(&w.cfg, due);
                moment(w, *from, MomentCategory::Diplomacy, format!("Experts seconded to {bn2}"), format!("{people} {what} left our regions for {dest_name} under a treaty with {bn2}. They live and work there until {due_label}; the survivors then come home."), Some(home), "treaty", false, vec![format!("Departed in {when}")]);
                moment(w, to, MomentCategory::Diplomacy, format!("Experts arrive from {ln}"), format!("{people} {what} lent by {ln} arrived at {dest_name}. They live, eat and work among us until {due_label}, when they go home."), Some(dest as RegionId), "treaty", false, vec![format!("Arrived in {when}")]);
            }
            Clause::JointProgramme { host, service, months } => {
                standing = true;
                let client = if *host == a { b } else { a };
                let e = month + *months as u32;
                ends = Some(ends.map(|x: Month| x.max(e)).unwrap_or(e));
                let served = host_ran(w, *host, *service);
                programmes.push(Programme { clause: ci as u16, host: *host, client, service: *service, ends: e, served, shortfalls: 0 });
            }
            Clause::CedeRegion { from, region } => {
                let to = if *from == a { b } else { a };
                let ri = *region as usize;
                w.regions[ri].owner = Some(to);
                // residents and their qualifications change government with the land
                w.set_controller(ri, Some(to));
                w.regions[ri].capture = None;
                w.regions[ri].occupied_since = None;
                w.regions[ri].unrest_bp = w.regions[ri].unrest_bp.max(1500);
                if w.civs[*from as usize].capital as usize == ri {
                    if let Some(nc) = w.regions.iter().filter(|r| r.owner == Some(*from)).max_by_key(|r| (r.population(), r.id)).map(|r| r.id) {
                        w.civs[*from as usize].capital = nc;
                    }
                }
            }
        }
        remaining.push(rem);
    }
    let has_goods = remaining.iter().any(|r| *r > 0);
    let status = if has_goods || standing { "active" } else { "completed" };
    w.treaties.push(Treaty { id, parties: [a, b], clauses, signed: month, remaining, ends, status: status.into(), performance: vec![format!("{when}: signed by both parties")], shortfalls: 0, secondments, programmes, broken_by: None, notice_by: None });
    w.offers[offer_ix].status = "signed".into();
    for (x, y) in [(a, b), (b, a)] {
        let other = w.civs[y as usize].name.clone();
        brief(w, x, "good", format!("Treaty signed with {other}"), "Its terms are recorded in the diplomacy panel.".into(), None, "diplomacy");
    }
    Ok(id)
}

/// Whether the host's installation that serves partners ran at half rate or
/// better last month (its run statistics are still last month's when this is read).
pub fn host_ran(w: &World, host: SeatId, service: ProgrammeService) -> bool {
    let Some(key) = facility_of_service(service) else { return false };
    let kind = content().f(key);
    w.service_site(host, service)
        .and_then(|ri| w.regions[ri].fac(kind))
        .map(|f| f.level > 0 && f.run.as_ref().map(|x| x.rate_bp >= crate::sim::economy::SERVICE_RATE_BP).unwrap_or(false))
        .unwrap_or(false)
}

/// How the cooperation clauses of a treaty come to an end.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ending {
    /// The term ran out: every survivor goes home.
    Term,
    /// A party repudiated the treaty. Experts it lent go home whole; of experts it
    /// borrowed, a quarter of the survivors stay behind without their qualification.
    Repudiated(SeatId),
    /// The parties went to war: a quarter of the survivors of every secondment stay behind.
    War,
    /// A party ceased to govern: nobody can be sent home any more.
    Gone,
}

/// Settle the secondments and joint programmes of a treaty that has ended or is
/// ending. Access to a partner's installation stops at once; seconded experts are
/// released (`sim::population::second_home`). Each secondment is settled once.
pub fn end_cooperation(w: &mut World, ti: usize, how: Ending) {
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let lapse = how != Ending::Term;
    for pi in 0..w.treaties[ti].programmes.len() {
        let p = w.treaties[ti].programmes[pi].clone();
        let live = month < p.ends;
        w.treaties[ti].programmes[pi].served = false;
        w.treaties[ti].programmes[pi].ends = p.ends.min(month);
        if live && lapse {
            let hn = w.civs[p.host as usize].name.clone();
            let t = &mut w.treaties[ti];
            if t.performance.len() < 40 {
                t.performance.push(format!("{when}: the joint programme lapsed with the breach; {hn} no longer serves the other party"));
            }
            brief(w, p.client, "warning", format!("Joint programme with {hn} lapsed"), "The treaty was broken, and with it our access to the partner's installation.".into(), None, "diplomacy");
        }
    }
    for si in 0..w.treaties[ti].secondments.len() {
        let s = w.treaties[ti].secondments[si].clone();
        if s.owed == 0 {
            continue;
        }
        let breach = match how {
            Ending::War => true,
            Ending::Repudiated(by) => by == s.borrower,
            _ => false,
        };
        let (came, stayed) = match how {
            Ending::Gone => (0, 0),
            _ => crate::sim::population::second_home(w, s.lender, s.borrower, s.qual, s.owed, s.home, breach),
        };
        {
            let x = &mut w.treaties[ti].secondments[si];
            x.owed = 0;
            x.returned += came;
            x.lost += stayed;
            x.due = x.due.min(month);
        }
        if how == Ending::Gone {
            continue;
        }
        let (ln, bn) = (w.civs[s.lender as usize].name.clone(), w.civs[s.borrower as usize].name.clone());
        let what = s.qual.label().to_lowercase();
        let (cg, sg) = (crate::util::group(came as i64), crate::util::group(stayed as i64));
        {
            let t = &mut w.treaties[ti];
            if t.performance.len() < 40 {
                t.performance.push(if stayed > 0 { format!("{when}: {cg} seconded {what} went home to {ln}; {sg} stayed behind in {bn} without their qualification") } else { format!("{when}: {cg} seconded {what} went home to {ln}") });
            }
        }
        let home = if w.regions[s.home as usize].controller == Some(s.lender) { s.home } else { w.civs[s.lender as usize].capital };
        if stayed > 0 {
            moment(w, s.lender, MomentCategory::Diplomacy, format!("Experts recalled from {bn}"), format!("The treaty with {bn} ended in breach. {cg} of our seconded {what} came home; {sg} could not leave and stay there as ordinary residents, their qualification lapsed."), Some(home), "treaty", false, vec![format!("Settled in {when}")]);
        } else {
            moment(w, s.lender, MomentCategory::Diplomacy, format!("Experts home from {bn}"), format!("{cg} {what} seconded to {bn} came home and return to work here."), Some(home), "treaty", false, vec![format!("Returned in {when}")]);
        }
        brief(w, s.borrower, "warning", format!("Seconded {what} leave for {ln}"), format!("{} experts lent by {ln} left our posts{}.", crate::util::group((came + stayed) as i64), if stayed > 0 { format!("; {sg} of them stay on as residents without their qualification") } else { String::new() }), None, "diplomacy");
    }
}

/// Give notice on a treaty's open-ended clauses: they end at the close of the next
/// round (one full round of notice) and nothing is breached. Returns the month
/// they end.
pub fn give_notice(w: &mut World, seat: SeatId, treaty_ix: usize) -> Result<Month, String> {
    let open = w.treaties[treaty_ix].clauses.iter().any(|c| matches!(c, Clause::NonAggression { months: 0 } | Clause::DefensivePact { months: 0 } | Clause::Goods { months: 0, .. }));
    if !open {
        return Err("the treaty has no open-ended clause to give notice on".into());
    }
    if w.treaties[treaty_ix].notice_by.is_some() {
        return Err("notice has already been given".into());
    }
    // the end of the round after this one
    let next = w.round + 1;
    let ends = w.cfg.calendar.round_start_month(next + 1).unwrap_or(w.cfg.horizon()).max(w.month + 1);
    let label = crate::util::date_label(&w.cfg, ends);
    let name = w.civs[seat as usize].name.clone();
    let month = w.month;
    let t = &mut w.treaties[treaty_ix];
    t.notice_by = Some(seat);
    t.ends = Some(t.ends.map(|e| e.max(ends)).unwrap_or(ends));
    for (ci, c) in t.clauses.iter().enumerate() {
        if let Clause::Goods { months: 0, .. } = c {
            t.remaining[ci] = (ends.saturating_sub(month)).min(OPEN_ENDED as u32 - 1) as u16;
        }
    }
    t.performance.push(format!("{}: notice given by {name}; the open-ended clauses end in {label}", crate::util::date_label(&w.cfg, month)));
    let other = if t.parties[0] == seat { t.parties[1] } else { t.parties[0] };
    brief(w, other, "info", format!("{name} gave notice on a treaty"), format!("Its open-ended clauses end in {label}. Nothing was breached."), None, "diplomacy");
    Ok(ends)
}

pub fn break_treaty(w: &mut World, seat: SeatId, treaty_ix: usize) {
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let other = {
        let t = &w.treaties[treaty_ix];
        if t.parties[0] == seat { t.parties[1] } else { t.parties[0] }
    };
    let name = w.civs[seat as usize].name.clone();
    let sub = w.treaties[treaty_ix].clauses.iter().find_map(|c| if let Clause::Subordination { from, .. } = c { Some(*from) } else { None });
    {
        let t = &mut w.treaties[treaty_ix];
        t.status = "broken".into();
        t.broken_by = Some(seat);
        t.performance.push(format!("{when}: repudiated by {name}"));
    }
    if let Some(s) = sub {
        w.civs[s as usize].overlord = None;
    }
    // a lender that ends the treaty calls its people home; a borrower that repudiates
    // it keeps a quarter of them, stripped of their standing, and loses the rest
    end_cooperation(w, treaty_ix, Ending::Repudiated(seat));
    {
        let ct = &mut w.civs[other as usize].contacts[seat as usize];
        ct.trust = (ct.trust - 25).max(0);
        ct.notes.push(format!("{when}: repudiated a signed treaty"));
    }
    for o in 0..w.civs.len() {
        if o != seat as usize && o != other as usize && w.civs[o].contacts[seat as usize].met {
            let ct = &mut w.civs[o].contacts[seat as usize];
            ct.trust = (ct.trust - 6).max(0);
        }
    }
    brief(w, other, "warning", format!("{name} has repudiated a treaty"), "Deliveries already made stay where they are; what was taught is not unlearned.".into(), None, "diplomacy");
}

/// The month's turn of a treaty's cooperation clauses, at the start of the month.
/// Seconded experts share the attrition of the borrower's holders and the survivors
/// go home when their term ends; a joint programme serves its client this month only
/// if the host's installation ran at half rate or better last month, and a month
/// below that is a recorded shortfall. Returns whether any of them still runs.
fn cooperation_month(w: &mut World, ti: usize) -> bool {
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let mut standing = false;
    for si in 0..w.treaties[ti].secondments.len() {
        let s = w.treaties[ti].secondments[si].clone();
        if s.owed > 0 {
            // experts abroad die, retire and are enlisted as the holders around them are
            let qi = s.qual.index();
            let exits = w.civs[s.borrower as usize].qual_flows.exits(qi);
            let gone = (exits - s.exits_seen).max(0);
            let holders = w.regions.iter().filter(|r| r.controller == Some(s.borrower)).map(|r| r.quals[qi] as i64).sum::<i64>();
            let x = &mut w.treaties[ti].secondments[si];
            x.exits_seen = exits;
            if gone > 0 {
                let before = holders + gone;
                let lost = ((x.owed as i64 * gone + before / 2) / before.max(1)).min(x.owed as i64);
                x.owed -= lost as u32;
            }
        }
        if month >= s.due {
            if w.treaties[ti].secondments[si].owed > 0 {
                end_secondment(w, ti, si);
            }
        } else {
            standing = true;
        }
    }
    for pi in 0..w.treaties[ti].programmes.len() {
        let p = w.treaties[ti].programmes[pi].clone();
        if month >= p.ends {
            w.treaties[ti].programmes[pi].served = false;
            continue;
        }
        standing = true;
        let served = host_ran(w, p.host, p.service);
        {
            let x = &mut w.treaties[ti].programmes[pi];
            x.served = served;
            if !served {
                x.shortfalls += 1;
            }
        }
        if !served {
            let hn = w.civs[p.host as usize].name.clone();
            let t = &mut w.treaties[ti];
            t.shortfalls += 1;
            if p.served && t.performance.len() < 40 {
                t.performance.push(format!("{when}: {hn}'s installation ran below half rate; the joint programme is not served this month"));
            }
            if p.served {
                brief(w, p.client, "warning", format!("{hn} is not serving the joint programme"), "The partner's installation ran below half rate last month, so it serves nobody this month.".into(), None, "diplomacy");
            }
        }
    }
    standing
}

/// Release the experts of one secondment whose term has ended: every survivor goes home.
fn end_secondment(w: &mut World, ti: usize, si: usize) {
    let s = w.treaties[ti].secondments[si].clone();
    let (came, _) = crate::sim::population::second_home(w, s.lender, s.borrower, s.qual, s.owed, s.home, false);
    {
        let x = &mut w.treaties[ti].secondments[si];
        x.owed = 0;
        x.returned += came;
    }
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let (ln, bn) = (w.civs[s.lender as usize].name.clone(), w.civs[s.borrower as usize].name.clone());
    let what = s.qual.label().to_lowercase();
    let cg = crate::util::group(came as i64);
    {
        let t = &mut w.treaties[ti];
        if t.performance.len() < 40 {
            t.performance.push(format!("{when}: the secondment ended; {cg} {what} went home to {ln}"));
        }
    }
    let home = if w.regions[s.home as usize].controller == Some(s.lender) { s.home } else { w.civs[s.lender as usize].capital };
    moment(w, s.lender, MomentCategory::Diplomacy, format!("Experts home from {bn}"), format!("Their term over, {cg} {what} seconded to {bn} came home and return to work here."), Some(home), "treaty", false, vec![format!("Returned in {when}")]);
    brief(w, s.borrower, "info", format!("Seconded {what} go home to {ln}"), format!("Their term over, {cg} experts lent by {ln} left our posts."), None, "diplomacy");
}

/// Monthly settlement of delivery clauses, tribute and expiry.
pub fn step(w: &mut World) {
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    for ti in 0..w.treaties.len() {
        if w.treaties[ti].status != "active" {
            continue;
        }
        let [a, b] = w.treaties[ti].parties;
        if w.civs[a as usize].status == SeatStatus::Eliminated || w.civs[b as usize].status == SeatStatus::Eliminated {
            end_cooperation(w, ti, Ending::Gone);
            w.treaties[ti].status = "expired".into();
            continue;
        }
        let clauses = w.treaties[ti].clauses.clone();
        let mut open = false;
        let mut standing = cooperation_month(w, ti);
        for (ci, c) in clauses.iter().enumerate() {
            match c {
                Clause::Goods { from, good, amount_per_month, .. } => {
                    if w.treaties[ti].remaining[ci] == 0 {
                        continue;
                    }
                    let to = if *from == a { b } else { a };
                    // what leaves one stock is exactly what enters the other
                    let give = w.transfer(*from, to, *good, *amount_per_month);
                    if w.treaties[ti].remaining[ci] != OPEN_ENDED {
                        w.treaties[ti].remaining[ci] -= 1;
                    }
                    if give < *amount_per_month {
                        let t = &mut w.treaties[ti];
                        t.shortfalls += 1;
                        let nm = w.civs[*from as usize].name.clone();
                        if t.performance.len() < 40 {
                            t.performance.push(format!("{when}: {nm} delivered {:.0} of {:.0} {}", give as f64 / 1000.0, *amount_per_month as f64 / 1000.0, good.label().to_lowercase()));
                        }
                        let ct = &mut w.civs[to as usize].contacts[*from as usize];
                        ct.trust = (ct.trust - 3).max(0);
                        brief(w, to, "warning", format!("Short delivery from {nm}"), format!("{:.0} of {:.0} {} arrived.", give as f64 / 1000.0, *amount_per_month as f64 / 1000.0, good.label().to_lowercase()), None, "diplomacy");
                    }
                    if w.treaties[ti].remaining[ci] > 0 {
                        open = true;
                    }
                }
                Clause::Subordination { from, tribute_bp } => {
                    standing = true;
                    let over = if *from == a { b } else { a };
                    if *tribute_bp > 0 {
                        for g in [Good::Food, Good::Materials, Good::Metal, Good::Components, Good::Electronics] {
                            let monthly = w.per_last_round(w.civs[*from as usize].last_flows.produced[g.index()], 1);
                            let due = monthly * *tribute_bp as i64 / 10_000;
                            let give = due.min(w.civs[*from as usize].stock_of(g).max(0) / 4);
                            if give > 0 {
                                // tribute is paid out of the subordinate's own stock
                                w.transfer(*from, over, g, give);
                            }
                        }
                    }
                }
                Clause::NonAggression { months } | Clause::DefensivePact { months } => {
                    let t = &w.treaties[ti];
                    let open_ended = *months == 0 && t.ends.map(|e| month < e).unwrap_or(true);
                    if open_ended || month < t.signed + *months as u32 {
                        standing = true;
                    }
                }
                _ => {}
            }
        }
        if !open && !standing {
            let t = &mut w.treaties[ti];
            let clean = t.shortfalls == 0;
            t.status = if t.ends.map(|e| month >= e).unwrap_or(false) { "expired".into() } else { "completed".into() };
            t.performance.push(format!("{when}: all obligations settled"));
            if clean {
                for (x, y) in [(a, b), (b, a)] {
                    let ct = &mut w.civs[x as usize].contacts[y as usize];
                    ct.trust = (ct.trust + 5).min(100);
                }
            }
        }
    }
    // trust recovers very slowly in peace
    if month % 24 == 0 {
        for s in 0..w.civs.len() {
            for o in 0..w.civs.len() {
                let ct = &mut w.civs[s].contacts[o];
                if ct.met && !ct.at_war && ct.trust < 50 {
                    ct.trust += 1;
                }
            }
        }
    }
}
