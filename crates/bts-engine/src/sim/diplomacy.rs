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
    }
}

/// Checks that depend only on facts the proposer can know. Returns a public reason on failure.
pub fn validate_clauses(w: &World, a: SeatId, b: SeatId, clauses: &[Clause]) -> Result<(), String> {
    let ct = content();
    if clauses.is_empty() || clauses.len() > 8 {
        return Err("a treaty needs between one and eight clauses".into());
    }
    let party = |s: SeatId| s == a || s == b;
    let est = |s: SeatId, id: &str| w.civs[s as usize].est_id(id);
    for c in clauses {
        match c {
            Clause::Goods { from, amount_per_month, months, .. } => {
                if !party(*from) || *amount_per_month <= 0 || *months == 0 || *months > 240 {
                    return Err("invalid goods clause".into());
                }
                if *months > 1 && !(est(a, "C021") || est(b, "C021")) {
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
                if *months == 0 || *months > 600 {
                    return Err("invalid duration".into());
                }
            }
            Clause::DefensivePact { months } => {
                if *months == 0 || *months > 600 {
                    return Err("invalid duration".into());
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
        }
    }
    Ok(())
}

/// Turn a signed offer into an active treaty and execute its immediate clauses.
pub fn activate(w: &mut World, offer_ix: usize) -> Result<u32, String> {
    let ct = content();
    let month = w.month;
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
            _ => {}
        }
    }
    let id = w.id();
    let mut remaining = Vec::new();
    let mut ends: Option<Month> = None;
    let mut standing = false;
    let (an, bn) = (w.civs[a as usize].name.clone(), w.civs[b as usize].name.clone());
    for c in &clauses {
        let mut rem = 0u16;
        match c {
            Clause::Goods { months, .. } => rem = *months,
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
                            let full = crate::sim::projects::scaled(ct.techs[ti].work, w.cfg.pace_bp);
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
                let e = month + *months as u32;
                ends = Some(ends.map(|x: Month| x.max(e)).unwrap_or(e));
            }
            Clause::Peace => {
                crate::sim::military::make_peace(w, a, b);
                let cap_a = w.civs[a as usize].capital;
                let cap_b = w.civs[b as usize].capital;
                moment(w, a, MomentCategory::Diplomacy, format!("Peace with {bn}"), format!("{an} and {bn} signed an end to their war."), Some(cap_a), "treaty", true, vec![format!("Signed in month {month}")]);
                moment(w, b, MomentCategory::Diplomacy, format!("Peace with {an}"), format!("{bn} and {an} signed an end to their war."), Some(cap_b), "treaty", true, vec![format!("Signed in month {month}")]);
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
                moment(w, over, MomentCategory::Governance, format!("{sn} accepts our authority"), format!("By charter, {sn} keeps its local government and answers to {on} as highest authority. The arrangement holds only while both actually honour it."), Some(cap_o), "treaty", true, vec![format!("Charter signed in month {month}")]);
                moment(w, *from, MomentCategory::Governance, format!("We accept the authority of {on}"), format!("{sn} keeps its local government but answers to {on}. Leaving the charter remains possible, at a price."), Some(cap_s), "treaty", true, vec![format!("Charter signed in month {month}")]);
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
    w.treaties.push(Treaty { id, parties: [a, b], clauses, signed: month, remaining, ends, status: status.into(), performance: vec![format!("Month {month}: signed by both parties")], shortfalls: 0 });
    w.offers[offer_ix].status = "signed".into();
    for (x, y) in [(a, b), (b, a)] {
        let other = w.civs[y as usize].name.clone();
        brief(w, x, "good", format!("Treaty signed with {other}"), "Its terms are recorded in the diplomacy panel.".into(), None, "diplomacy");
    }
    Ok(id)
}

pub fn break_treaty(w: &mut World, seat: SeatId, treaty_ix: usize) {
    let month = w.month;
    let other = {
        let t = &w.treaties[treaty_ix];
        if t.parties[0] == seat { t.parties[1] } else { t.parties[0] }
    };
    let name = w.civs[seat as usize].name.clone();
    let sub = w.treaties[treaty_ix].clauses.iter().find_map(|c| if let Clause::Subordination { from, .. } = c { Some(*from) } else { None });
    {
        let t = &mut w.treaties[treaty_ix];
        t.status = "broken".into();
        t.performance.push(format!("Month {month}: repudiated by {name}"));
    }
    if let Some(s) = sub {
        w.civs[s as usize].overlord = None;
    }
    {
        let ct = &mut w.civs[other as usize].contacts[seat as usize];
        ct.trust = (ct.trust - 25).max(0);
        ct.notes.push(format!("Month {month}: repudiated a signed treaty"));
    }
    for o in 0..w.civs.len() {
        if o != seat as usize && o != other as usize && w.civs[o].contacts[seat as usize].met {
            let ct = &mut w.civs[o].contacts[seat as usize];
            ct.trust = (ct.trust - 6).max(0);
        }
    }
    brief(w, other, "warning", format!("{name} has repudiated a treaty"), "Deliveries already made stay where they are; what was taught is not unlearned.".into(), None, "diplomacy");
}

/// Monthly settlement of delivery clauses, tribute and expiry.
pub fn step(w: &mut World) {
    let month = w.month;
    for ti in 0..w.treaties.len() {
        if w.treaties[ti].status != "active" {
            continue;
        }
        let [a, b] = w.treaties[ti].parties;
        if w.civs[a as usize].status == SeatStatus::Eliminated || w.civs[b as usize].status == SeatStatus::Eliminated {
            w.treaties[ti].status = "expired".into();
            continue;
        }
        let clauses = w.treaties[ti].clauses.clone();
        let mut open = false;
        let mut standing = false;
        for (ci, c) in clauses.iter().enumerate() {
            match c {
                Clause::Goods { from, good, amount_per_month, .. } => {
                    if w.treaties[ti].remaining[ci] == 0 {
                        continue;
                    }
                    let to = if *from == a { b } else { a };
                    // what leaves one stock is exactly what enters the other
                    let give = w.transfer(*from, to, *good, *amount_per_month);
                    w.treaties[ti].remaining[ci] -= 1;
                    if give < *amount_per_month {
                        let t = &mut w.treaties[ti];
                        t.shortfalls += 1;
                        let nm = w.civs[*from as usize].name.clone();
                        if t.performance.len() < 40 {
                            t.performance.push(format!("Month {month}: {nm} delivered {:.0} of {:.0} {}", give as f64 / 1000.0, *amount_per_month as f64 / 1000.0, good.label().to_lowercase()));
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
                            let monthly = w.civs[*from as usize].last_flows.produced[g.index()] / 12;
                            let due = monthly * *tribute_bp as i64 / 10_000;
                            let give = due.min(w.civs[*from as usize].stock_of(g).max(0) / 4);
                            if give > 0 {
                                // tribute is paid out of the subordinate's own stock
                                w.transfer(*from, over, g, give);
                            }
                        }
                    }
                }
                Clause::NonAggression { .. } | Clause::DefensivePact { .. } => {
                    if w.treaties[ti].ends.map(|e| month < e).unwrap_or(false) {
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
            t.performance.push(format!("Month {month}: all obligations settled"));
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
