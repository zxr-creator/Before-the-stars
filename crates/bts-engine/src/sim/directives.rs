//! Standing orders (design chapter 36, section 2.6).
//!
//! A round can last fifty years. Nobody acts inside a round except through
//! standing orders, which every seat has alike: on 1 January of every year and in
//! the first month of every round the referee evaluates each seat's orders in the
//! seat's order. Each order that has something to do issues the action it stands
//! for through exactly that action's validation (`actions::apply_for_directive`),
//! at the price quoted at that moment; an order that is refused is skipped that
//! year and records why. Nothing here bypasses a cost or creates anything.

use crate::content::content;
use crate::sim::population::water_capacity;
use crate::state::*;
use bts_protocol::*;

/// Most levels one evaluation of a build target orders.
pub const BUILD_STEP_MAX: u16 = 4;
/// Most investigations the research orders start in one evaluation.
pub const RESEARCH_STARTS_MAX: usize = 6;
/// Reforms the reform agenda keeps under way at once.
pub const REFORMS_AT_ONCE: usize = 2;

/// Whether standing orders are evaluated in the month now being simulated.
pub fn due(w: &World) -> bool {
    (w.month.saturating_sub(1)) % 12 == 0 || w.first_month_of_round()
}

pub fn step(w: &mut World) {
    if !due(w) {
        return;
    }
    for s in 0..w.civs.len() {
        if w.civs[s].status == SeatStatus::Eliminated || w.civs[s].directives.is_empty() {
            continue;
        }
        evaluate(w, s as SeatId);
    }
}

fn record(w: &mut World, seat: SeatId, id: u32, status: &str, result: String) {
    let month = w.month;
    if let Some(d) = w.civs[seat as usize].directives.iter_mut().find(|d| d.id == id) {
        d.last_status = status.to_string();
        d.last_result = result;
        d.last_month = month;
    }
}

/// Evaluate one seat's standing orders, in its order.
pub fn evaluate(w: &mut World, seat: SeatId) {
    let orders: Vec<(u32, Directive)> = w.civs[seat as usize].directives.iter().map(|d| (d.id, d.directive.clone())).collect();
    // research capacity left idle by the investigations already running
    let mut pools = research_pools(w, seat);
    let mut started = 0usize;
    for (id, d) in orders {
        let (status, result) = match d {
            Directive::BuildTarget { region, facility, levels, priority } => build_target(w, seat, region, &facility, levels, priority),
            Directive::ResearchAgenda { techs } => {
                let mut ixs = Vec::new();
                for h in &techs {
                    if let Some(i) = crate::actions::tech_from_handle(w, seat, h) {
                        ixs.push(i);
                    }
                }
                research(w, seat, ixs, &mut pools, &mut started, false)
            }
            Directive::AutoResearch { on } => {
                if !on {
                    ("idle".into(), "Automatic research is off.".into())
                } else {
                    research(w, seat, Vec::new(), &mut pools, &mut started, true)
                }
            }
            Directive::SettleTarget { from, to, people, when_crowd_bp } => settle_target(w, seat, from, to, people, when_crowd_bp),
            Directive::ReformAgenda { practices } => reform_agenda(w, seat, &practices),
        };
        record(w, seat, id, &status, result);
    }
}

fn build_target(w: &mut World, seat: SeatId, region: RegionId, facility: &str, levels: u16, priority: Option<u8>) -> (String, String) {
    let c = content();
    let si = seat as usize;
    let ri = region as usize;
    if ri >= w.regions.len() || w.regions[ri].controller != Some(seat) {
        return ("skipped".into(), "That region is not one you govern.".into());
    }
    let Some(&kind) = c.fac_ix.get(facility) else { return ("skipped".into(), "Unknown facility.".into()) };
    let name = c.facilities[kind].name;
    let rname = w.regions[ri].name.clone();
    let built = w.regions[ri].fac(kind).map(|f| f.level).unwrap_or(0);
    let orders: Vec<u16> = w.civs[si].projects.iter().filter(|p| p.region == Some(region)).filter_map(|p| if let ProjKind::Build { facility: k, levels: l } = p.kind { (k == kind).then_some(l) } else { None }).collect();
    let pending: u16 = orders.iter().sum();
    if built + pending >= levels {
        return ("idle".into(), format!("Target met: {} of {} level(s) of {} at {} built or under construction.", built + pending, levels, name.to_lowercase(), rname));
    }
    if !orders.is_empty() {
        return ("idle".into(), format!("An order for {} at {} is still open.", name.to_lowercase(), rname));
    }
    let mut want = (levels - built - pending).min(BUILD_STEP_MAX);
    if crate::actions::facility_visible(w, seat, kind) && c.facilities[kind].req.eval(&CivCtx { world: w, seat }) {
        let cap = crate::sim::economy::level_cap(w, seat, ri, &c.facilities[kind]);
        want = want.min(cap.saturating_sub(built + pending)).max(1);
    }
    let action = Action::StartProject { spec: ProjectSpec::Build { region, facility: facility.to_string(), levels: want }, priority };
    match crate::actions::apply_for_directive(w, seat, action) {
        Ok(_) => ("acted".into(), format!("Ordered {want} level(s) of {} at {}.", name.to_lowercase(), rname)),
        Err(e) => ("skipped".into(), format!("Not ordered: {e}.")),
    }
}

/// Researcher-months each class pool still has once the running investigations
/// have drawn what they can use this month, in the order the projects are served.
fn research_pools(w: &World, seat: SeatId) -> Vec<i64> {
    let civ = &w.civs[seat as usize];
    let mut pools = civ.research_cap.clone();
    pools.resize(ResearchClass::COUNT, 0);
    let mut order: Vec<&Project> = civ.projects.iter().filter(|p| !p.paused && matches!(p.kind, ProjKind::Research { .. } | ProjKind::LeadStudy { .. } | ProjKind::Study { .. })).collect();
    order.sort_by_key(|p| p.service_key());
    for p in order {
        let Some(class) = crate::sim::projects::project_class(w, seat, &p.kind) else { continue };
        draw(&mut pools, class, (p.work_needed - p.work_done).min(p.max_per_month).max(0));
    }
    pools
}

fn draw(pools: &mut [i64], class: ResearchClass, mut want: i64) {
    for pool in pools.iter_mut().skip(class.index()) {
        let take = want.min(*pool).max(0);
        *pool -= take;
        want -= take;
        if want <= 0 {
            break;
        }
    }
}

fn spare(pools: &[i64], class: ResearchClass) -> i64 {
    pools.iter().skip(class.index()).sum()
}

/// Start investigations while research capacity is idle: the agenda's items in its
/// order, or (`auto`) the discovered methods with the lowest tier and most evidence.
fn research(w: &mut World, seat: SeatId, list: Vec<usize>, pools: &mut Vec<i64>, started: &mut usize, auto: bool) -> (String, String) {
    let c = content();
    let si = seat as usize;
    let running = |w: &World, t: usize| w.civs[si].projects.iter().any(|p| p.kind == ProjKind::Research { tech: t });
    let candidates: Vec<usize> = if auto {
        // discovered methods first, then leads, each by tier and evidence
        let mut v: Vec<usize> = (0..c.techs.len()).filter(|t| matches!(w.civs[si].tech[*t].state, ST_DISCOVERED | ST_HINTED)).collect();
        v.sort_by_key(|t| (w.civs[si].tech[*t].state == ST_HINTED, c.techs[*t].tier, std::cmp::Reverse(w.civs[si].tech[*t].evidence), *t));
        v
    } else {
        list
    };
    let mut names: Vec<String> = Vec::new();
    let mut refused: Option<String> = None;
    let mut waiting = 0;
    for t in candidates {
        if *started >= RESEARCH_STARTS_MAX {
            break;
        }
        let st = w.civs[si].tech[t].state;
        let lead = st == ST_HINTED;
        if lead {
            // a lead is followed up by a small study, if none is under way
            if w.civs[si].projects.iter().any(|p| p.kind == ProjKind::LeadStudy { tech: t }) {
                continue;
            }
            let class = crate::sim::projects::project_class(w, seat, &ProjKind::LeadStudy { tech: t }).unwrap_or(ResearchClass::Craft);
            if spare(pools, class) <= 0 {
                break;
            }
            let handle = crate::actions::tech_handle(w, seat, t);
            match crate::actions::apply_for_directive(w, seat, Action::Investigate { lead: handle }) {
                Ok((_, Some(id))) => {
                    let per_month = w.civs[si].projects.iter().find(|p| p.id == id).map(|p| p.max_per_month).unwrap_or(0);
                    draw(pools, class, per_month);
                    names.push(format!("a lead ({})", c.techs[t].tags.first().map(|g| g.name().to_lowercase()).unwrap_or_default()));
                    *started += 1;
                }
                Ok(_) => {}
                Err(e) => {
                    refused.get_or_insert(e);
                }
            }
            continue;
        }
        if st < ST_DISCOVERED || st >= ST_UNDERSTOOD || running(w, t) {
            continue;
        }
        if !c.techs[t].prereq.eval(&CivCtx { world: w, seat }) || !crate::sim::projects::tech_site_ok(w, seat, t) {
            waiting += 1;
            continue;
        }
        if spare(pools, c.techs[t].class) <= 0 {
            break;
        }
        let handle = crate::actions::tech_handle(w, seat, t);
        match crate::actions::apply_for_directive(w, seat, Action::StartProject { spec: ProjectSpec::Research { tech: handle }, priority: None }) {
            Ok((_, Some(id))) => {
                let per_month = w.civs[si].projects.iter().find(|p| p.id == id).map(|p| p.max_per_month).unwrap_or(0);
                draw(pools, c.techs[t].class, per_month);
                names.push(c.techs[t].name.clone());
                *started += 1;
            }
            Ok(_) => {}
            Err(e) => {
                refused.get_or_insert(e);
            }
        }
    }
    if !names.is_empty() {
        ("acted".into(), format!("Investigation begun: {}.", names.join(", ")))
    } else if let Some(e) = refused {
        ("skipped".into(), format!("Not begun: {e}."))
    } else if waiting > 0 {
        ("idle".into(), "Research is fully occupied, or the listed methods wait for knowledge or an installation.".into())
    } else {
        ("idle".into(), "Research is fully occupied or nothing listed is left to investigate.".into())
    }
}

fn reform_agenda(w: &mut World, seat: SeatId, list: &[String]) -> (String, String) {
    let c = content();
    let si = seat as usize;
    let mut running = w.civs[si].projects.iter().filter(|p| matches!(p.kind, ProjKind::Reform { .. })).count();
    if running >= REFORMS_AT_ONCE {
        return ("idle".into(), "Two reforms are already under way.".into());
    }
    let mut names = Vec::new();
    let mut refused: Option<String> = None;
    for h in list {
        if running >= REFORMS_AT_ONCE {
            break;
        }
        let Some(pi) = crate::actions::prac_from_handle(w, seat, h) else { continue };
        let p = &c.practices[pi];
        if w.civs[si].practice[pi].state != 1 || !p.prereq.eval(&PracEnactedCtx { world: w, seat, recognized_only: false }) || !p.hard.eval(&CivCtx { world: w, seat }) {
            continue;
        }
        match crate::actions::apply_for_directive(w, seat, Action::ProposeReform { practice: h.clone() }) {
            Ok(_) => {
                names.push(p.name.to_string());
                running += 1;
            }
            Err(e) => {
                refused.get_or_insert(e);
            }
        }
    }
    if !names.is_empty() {
        ("acted".into(), format!("Reform proposed: {}.", names.join(", ")))
    } else if let Some(e) = refused {
        ("skipped".into(), format!("Not proposed: {e}."))
    } else {
        ("idle".into(), "No listed practice can be reformed yet.".into())
    }
}

fn settle_target(w: &mut World, seat: SeatId, from: RegionId, to: RegionId, people: u32, when_crowd_bp: u16) -> (String, String) {
    let si = seat as usize;
    let (fi, ti) = (from as usize, to as usize);
    if fi >= w.regions.len() || w.regions[fi].controller != Some(seat) {
        return ("skipped".into(), "That region is not one you govern.".into());
    }
    if ti >= w.regions.len() || !w.civs[si].memory[ti].seen {
        return ("skipped".into(), "Unknown region.".into());
    }
    let tname = w.regions[ti].name.clone();
    if w.civs[si].memory[ti].owner == Some(seat) {
        return ("idle".into(), format!("{tname} is already ours."));
    }
    if w.civs[si].memory[ti].owner.is_some() {
        return ("idle".into(), format!("Our records show {tname} held by another authority."));
    }
    if w.civs[si].projects.iter().any(|p| matches!(p.kind, ProjKind::Settle { to: t, .. } if t == to)) {
        return ("idle".into(), format!("A party is already preparing to settle {tname}."));
    }
    let r = &w.regions[fi];
    let crowd = r.population() as i64 * 10_000 / water_capacity(r).max(1) as i64;
    if crowd < when_crowd_bp as i64 {
        return ("idle".into(), format!("{} is at {}% of its water capacity; settlers leave from {}%.", r.name, crowd / 100, when_crowd_bp / 100));
    }
    match crate::actions::apply_for_directive(w, seat, Action::StartProject { spec: ProjectSpec::Settle { from, to, people }, priority: None }) {
        Ok(_) => ("acted".into(), format!("A party of {} is being provisioned to settle {tname}.", crate::util::group(people as i64))),
        Err(e) => ("skipped".into(), format!("Not ordered: {e}.")),
    }
}
