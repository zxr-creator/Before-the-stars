//! Validation and application of seat actions.
//!
//! Validation uses only facts the acting seat can know. A rejected action
//! changes nothing and consumes nothing; unknown and nonexistent references
//! return the same error so that failures cannot enumerate hidden content.

use crate::content::{content, Cap, Tag, BELIEFS, RELIGION_SLOTS};
use crate::sim::economy::level_cap;
use crate::sim::projects::{max_per_month, scaled};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

pub fn tech_handle(w: &World, seat: SeatId, i: usize) -> String {
    format!("k{:07x}", draw(w.secret, &[stream("tech-handle"), seat as u64, i as u64]) & 0x0fff_ffff)
}

pub fn prac_handle(w: &World, seat: SeatId, i: usize) -> String {
    format!("p{:07x}", draw(w.secret, &[stream("prac-handle"), seat as u64, i as u64]) & 0x0fff_ffff)
}

pub fn tech_from_handle(w: &World, seat: SeatId, handle: &str) -> Option<usize> {
    let c = content();
    (0..c.techs.len()).find(|i| w.civs[seat as usize].tech[*i].state > ST_UNKNOWN && tech_handle(w, seat, *i) == handle)
}

pub fn prac_from_handle(w: &World, seat: SeatId, handle: &str) -> Option<usize> {
    let c = content();
    (0..c.practices.len()).find(|i| w.civs[seat as usize].practice[*i].state > 0 && prac_handle(w, seat, *i) == handle)
}

/// Whether a facility type appears in a seat's catalog at all.
pub fn facility_visible(w: &World, seat: SeatId, kind: usize) -> bool {
    let c = content();
    let def = &c.facilities[kind];
    let civ = &w.civs[seat as usize];
    let mut ts = Vec::new();
    def.req.techs(&mut ts);
    let mut ps = Vec::new();
    def.req.pracs(&mut ps);
    ts.iter().all(|t| civ.tech[*t].state >= ST_DISCOVERED) && ps.iter().all(|p| civ.practice[*p].state >= 1)
}

pub fn course_visible(w: &World, seat: SeatId, course: usize) -> bool {
    let c = content();
    let civ = &w.civs[seat as usize];
    let mut ts = Vec::new();
    c.courses[course].req.techs(&mut ts);
    let mut ps = Vec::new();
    c.courses[course].req.pracs(&mut ps);
    ts.iter().all(|t| civ.tech[*t].state >= ST_DISCOVERED) && ps.iter().all(|p| civ.practice[*p].state >= 1)
}

/// A settling party, in people, and what the sending region must keep.
pub const SETTLERS_MIN: u32 = 20_000;
pub const SETTLERS_MAX: u32 = 400_000;
const SETTLE_KEEP: u32 = 80_000;
/// Rations a party carries for each settler, and tool lots for each thousand settlers.
const SETTLER_RATIONS: i64 = 4;
const SETTLER_TOOLS_PER_K: i64 = 50;
/// What a region must keep when people are moved out of it by order.
const RESETTLE_KEEP: u32 = 50_000;
/// A formation, in soldiers, and the worker-months to muster a thousand recruits.
pub const FORMATION_MIN: u32 = 1_000;
pub const FORMATION_MAX: u32 = 5_000_000;
const MUSTER_WORK_PER_K: i64 = 150;
/// Places one programme may book.
pub const PROGRAM_SEATS_MAX: u32 = 2_000_000;

struct Fail {
    code: &'static str,
    reason: String,
}

fn fail<T>(code: &'static str, reason: impl Into<String>) -> Result<T, Fail> {
    Err(Fail { code, reason: reason.into() })
}

const UNKNOWN: &str = "NOT_VISIBLE_OR_UNKNOWN";

fn own_region(w: &World, seat: SeatId, r: RegionId) -> Result<usize, Fail> {
    let ri = r as usize;
    if ri >= w.regions.len() || w.regions[ri].controller != Some(seat) {
        return fail(UNKNOWN, "that region is not one you govern");
    }
    Ok(ri)
}

/// Translate a clause written with the actor's handles into canonical content IDs.
fn canon_clause(w: &World, seat: SeatId, c: &Clause) -> Result<Clause, Fail> {
    let ct = content();
    Ok(match c {
        Clause::Knowledge { from, tech } => match tech_from_handle(w, seat, tech) {
            Some(i) => Clause::Knowledge { from: *from, tech: ct.techs[i].id.clone() },
            None => return fail(UNKNOWN, "unknown method"),
        },
        Clause::Practice { from, practice } => match prac_from_handle(w, seat, practice) {
            Some(i) => Clause::Practice { from: *from, practice: ct.practices[i].id.clone() },
            None => return fail(UNKNOWN, "unknown practice"),
        },
        // an undisclosed service and one the seat has not discovered read alike
        Clause::JointProgramme { service, .. } if !crate::sim::diplomacy::service_known(w, seat, *service) => return fail(UNKNOWN, "unknown service"),
        other => other.clone(),
    })
}

/// Show a canonical clause to a viewer using only handles the viewer already holds.
pub fn view_clause(w: &World, viewer: SeatId, c: &Clause) -> Clause {
    let ct = content();
    match c {
        Clause::Knowledge { from, tech } => {
            let h = ct.tech_ix.get(tech).filter(|i| w.civs[viewer as usize].tech[**i].state > ST_UNKNOWN).map(|i| tech_handle(w, viewer, *i)).unwrap_or_default();
            Clause::Knowledge { from: *from, tech: h }
        }
        Clause::Practice { from, practice } => {
            let h = ct.prac_ix.get(practice).filter(|i| w.civs[viewer as usize].practice[**i].state > 0).map(|i| prac_handle(w, viewer, *i)).unwrap_or_default();
            Clause::Practice { from: *from, practice: h }
        }
        Clause::JointProgramme { host, service, months } if !crate::sim::diplomacy::service_known(w, viewer, *service) => Clause::JointProgramme { host: *host, service: ProgrammeService::Undisclosed, months: *months },
        other => other.clone(),
    }
}

pub fn channel_open(w: &World, a: SeatId, b: SeatId) -> bool {
    a != b && w.civs[a as usize].selected.contains(&b) && w.civs[b as usize].selected.contains(&a)
}

fn count_envelope(w: &mut World, from: SeatId, to: SeatId) -> Result<(), Fail> {
    if w.phase != Phase::Negotiate {
        return fail("WRONG_PHASE", "new proposals and messages belong to the negotiation windows");
    }
    if !channel_open(w, from, to) {
        return fail("CHANNEL_NOT_OPEN", "no channel is open with that counterpart this round");
    }
    let pair = w.pair(from, to);
    if w.envelopes[pair] >= PAIR_ENVELOPES {
        return fail("PAIR_LIMIT", "this pair has used its ten envelopes for the round");
    }
    let slot = from as usize * w.n() + to as usize;
    if w.sent_window[slot] {
        return fail("RATE_LIMITED", "one envelope per counterpart per window");
    }
    w.envelopes[pair] += 1;
    w.sent_window[slot] = true;
    Ok(())
}

fn label(a: &Action) -> String {
    match a {
        Action::SelectContacts { .. } => "select_contacts".into(),
        Action::Message { .. } => "message".into(),
        Action::ProposeTreaty { .. } => "propose_treaty".into(),
        Action::WithdrawOffer { .. } => "withdraw_offer".into(),
        Action::SignTreaty { .. } => "sign_treaty".into(),
        Action::DeclineOffer { .. } => "decline_offer".into(),
        Action::BreakTreaty { .. } => "break_treaty".into(),
        Action::SetPolicy { .. } => "set_policy".into(),
        Action::StartProject { spec, .. } => format!(
            "start_project:{}",
            match spec {
                ProjectSpec::Build { .. } => "build",
                ProjectSpec::Research { .. } => "research",
                ProjectSpec::Survey { .. } => "survey",
                ProjectSpec::Settle { .. } => "settle",
                ProjectSpec::Study { .. } => "study",
                ProjectSpec::Resettle { .. } => "resettle",
                ProjectSpec::Recruit { .. } => "recruit",
                ProjectSpec::Religion { .. } => "religion",
                ProjectSpec::FtlTrial => "ftl_trial",
                ProjectSpec::FtlDeployment => "ftl_deployment",
                ProjectSpec::FtlReplacement => "ftl_replacement",
            }
        ),
        Action::ManageProject { .. } => "manage_project".into(),
        Action::Investigate { .. } => "investigate".into(),
        Action::ProposeReform { .. } => "propose_reform".into(),
        Action::StartProgram { .. } => "start_program".into(),
        Action::ManageProgram { .. } => "manage_program".into(),
        Action::Demolish { .. } => "demolish".into(),
        Action::MilitaryOrder { .. } => "military_order".into(),
        Action::Forfeit => "forfeit".into(),
        Action::Directive { .. } => "directive".into(),
    }
}

/// Apply the action a standing order stands for, through exactly the validation of
/// that action, without writing a receipt (the order reports through its own
/// `last_result`). Returns the acceptance text or the refusal.
pub fn apply_for_directive(w: &mut World, seat: SeatId, action: Action) -> Result<(String, Option<u32>), String> {
    if w.outcome.is_some() || w.civs[seat as usize].status == SeatStatus::Eliminated {
        return Err("the match has finished".into());
    }
    apply_inner(w, seat, action).map_err(|f| f.reason)
}

/// Most standing orders a seat may hold.
pub const DIRECTIVES_MAX: usize = 64;

/// Whether two standing orders stand for the same thing (the later replaces the earlier).
fn same_directive(a: &Directive, b: &Directive) -> bool {
    match (a, b) {
        (Directive::BuildTarget { region: r1, facility: f1, .. }, Directive::BuildTarget { region: r2, facility: f2, .. }) => r1 == r2 && f1 == f2,
        (Directive::ResearchAgenda { .. }, Directive::ResearchAgenda { .. }) => true,
        (Directive::AutoResearch { .. }, Directive::AutoResearch { .. }) => true,
        (Directive::ReformAgenda { .. }, Directive::ReformAgenda { .. }) => true,
        (Directive::SettleTarget { to: t1, .. }, Directive::SettleTarget { to: t2, .. }) => t1 == t2,
        _ => false,
    }
}

/// Check a standing order against what the seat can know, as its action would be.
fn validate_directive(w: &World, seat: SeatId, d: &Directive) -> Result<(), Fail> {
    let c = content();
    let si = seat as usize;
    match d {
        Directive::BuildTarget { region, facility, levels, priority } => {
            own_region(w, seat, *region)?;
            let Some(&kind) = c.fac_ix.get(facility) else { return fail(UNKNOWN, "unknown facility") };
            if !facility_visible(w, seat, kind) {
                return fail(UNKNOWN, "unknown facility");
            }
            if *levels == 0 || *levels > 2000 {
                return fail("INVALID_SCHEMA", "a build target is 1 to 2,000 levels");
            }
            if priority.map(|p| p > 9).unwrap_or(false) {
                return fail("INVALID_SCHEMA", "priority is 0 to 9");
            }
        }
        Directive::ResearchAgenda { techs } => {
            if techs.len() > 40 {
                return fail("INVALID_SCHEMA", "an agenda lists at most 40 methods");
            }
            for h in techs {
                if tech_from_handle(w, seat, h).is_none() {
                    return fail(UNKNOWN, "unknown method");
                }
            }
        }
        Directive::AutoResearch { .. } => {}
        Directive::ReformAgenda { practices } => {
            if practices.len() > 64 {
                return fail("INVALID_SCHEMA", "an agenda lists at most 64 practices");
            }
            for h in practices {
                if prac_from_handle(w, seat, h).is_none() {
                    return fail(UNKNOWN, "unknown practice");
                }
            }
        }
        Directive::SettleTarget { from, to, people, when_crowd_bp } => {
            own_region(w, seat, *from)?;
            let ti = *to as usize;
            if ti >= w.regions.len() || !w.civs[si].memory[ti].seen {
                return fail(UNKNOWN, "unknown region");
            }
            if !(SETTLERS_MIN..=SETTLERS_MAX).contains(people) {
                return fail("INVALID_SCHEMA", "a settling party is 20,000 to 400,000 people");
            }
            if *when_crowd_bp > 30_000 {
                return fail("INVALID_SCHEMA", "the crowding threshold is at most 30,000 basis points");
            }
        }
    }
    Ok(())
}

pub fn apply(w: &mut World, seat: SeatId, action: Action) -> Receipt {
    let name = label(&action);
    let (round, month) = (w.round, w.month);
    let result = if w.outcome.is_some() || w.phase == Phase::Finished {
        fail("WRONG_PHASE", "the match has finished")
    } else if (seat as usize) >= w.civs.len() {
        fail("UNAUTHORIZED", "no such seat")
    } else if w.civs[seat as usize].status == SeatStatus::Eliminated {
        fail("UNAUTHORIZED", "this seat no longer governs anything")
    } else {
        apply_inner(w, seat, action)
    };
    let receipt = match result {
        Ok((reason, created)) => Receipt { round, month, action: name, status: "accepted".into(), code: None, reason, created },
        Err(f) => Receipt { round, month, action: name, status: "rejected".into(), code: Some(f.code.to_string()), reason: f.reason, created: None },
    };
    let civ = &mut w.civs[seat as usize];
    if civ.receipts.len() < 200 {
        civ.receipts.push(receipt.clone());
    }
    receipt
}

fn new_project(w: &mut World, seat: SeatId, kind: ProjKind, region: Option<RegionId>, work: i64, inputs: Vec<(Good, i64)>, min_months: i64, priority: Option<u8>) -> u32 {
    let id = w.id();
    let month = w.month;
    w.civs[seat as usize].projects.push(Project {
        id,
        kind,
        region,
        work_needed: work,
        work_done: 0,
        inputs: inputs.into_iter().filter(|(_, a)| *a > 0).map(|(g, a)| (g, a, 0)).collect(),
        priority: priority.unwrap_or(5).min(9),
        paused: false,
        started: month,
        last_progress: 0,
        blockers: vec![],
        max_per_month: max_per_month(work, min_months),
        crew: vec![],
        crew_on_site: vec![],
        crew_capped: false,
        power_need: 0,
        power_bp: 0,
        min_months: 0,
        order_key: 0,
    });
    id
}

/// An order with a stated minimum duration, a qualified site crew and site power:
/// construction, and the preparations of the jump programme. Its work is spread
/// over exactly `months`; nothing lets it finish sooner.
#[allow(clippy::too_many_arguments)]
fn new_site_order(w: &mut World, seat: SeatId, kind: ProjKind, region: RegionId, work: i64, inputs: Vec<(Good, i64)>, months: u16, crew: Vec<(Vec<Qual>, u32)>, power: i64, priority: Option<u8>) -> u32 {
    let id = new_project(w, seat, kind, Some(region), work, inputs, months as i64, priority);
    let p = w.civs[seat as usize].projects.last_mut().expect("the order just placed");
    p.max_per_month = crate::sim::projects::monthly_share(work, months as i64);
    p.min_months = months;
    p.crew_on_site = vec![0; crew.len()];
    p.crew = crew.into_iter().filter(|(_, n)| *n > 0).collect();
    p.crew_on_site.truncate(p.crew.len());
    p.power_need = power.max(0);
    id
}

/// Place a preparation of the jump programme (a trial, the deployment exercise or
/// a replacement) as a site order where its people are (`projects::ftl_site`), at
/// the bill, crew and site power of its kind. Returns the site's name and the order.
fn ftl_order(w: &mut World, seat: SeatId, kind: ProjKind, priority: Option<u8>) -> (String, u32) {
    let site = crate::sim::projects::ftl_site(w, seat, &kind);
    let (crew, power) = crate::sim::projects::ftl_terms(&kind);
    let (work, goods, months) = crate::sim::projects::ftl_bill(&kind);
    let id = new_site_order(w, seat, kind, site, scaled(work, w.cfg.pace_bp), goods, months, crew, power, priority);
    (w.regions[site as usize].name.clone(), id)
}

/// The regions' orders are served by priority, then by place in the queue. Move
/// one order to the 0-based `position` among the orders sited in its region: the
/// region's orders are put in the new order and take over, in that order, the
/// priorities and places they held between them, so nothing changes for the orders
/// of other regions. An order without a site has no queue to move in.
fn move_in_queue(w: &mut World, seat: SeatId, project: u32, position: u16) {
    let civ = &mut w.civs[seat as usize];
    let Some(region) = civ.projects.iter().find(|p| p.id == project).and_then(|p| p.region) else { return };
    let mut queue: Vec<usize> = (0..civ.projects.len()).filter(|i| civ.projects[*i].region == Some(region)).collect();
    queue.sort_by_key(|i| civ.projects[*i].service_key());
    let slots: Vec<(u8, u32)> = queue.iter().map(|i| { let k = civ.projects[*i].service_key(); (k.0, k.1) }).collect();
    let Some(from) = queue.iter().position(|i| civ.projects[*i].id == project) else { return };
    let moved = queue.remove(from);
    queue.insert((position as usize).min(queue.len()), moved);
    for (i, slot) in queue.into_iter().zip(slots) {
        civ.projects[i].priority = slot.0;
        civ.projects[i].order_key = slot.1;
    }
}

fn apply_inner(w: &mut World, seat: SeatId, action: Action) -> Result<(String, Option<u32>), Fail> {
    let c = content();
    let si = seat as usize;
    let pace = w.cfg.pace_bp;
    match action {
        // ------------------------------------------------------------ diplomacy
        Action::SelectContacts { seats } => {
            if w.phase != Phase::Contact {
                return fail("WRONG_PHASE", "counterparts are chosen in the contact phase");
            }
            let mut uniq: Vec<SeatId> = Vec::new();
            for s in seats {
                if s == seat || (s as usize) >= w.civs.len() || !w.civs[si].contacts[s as usize].met || w.civs[s as usize].status == SeatStatus::Eliminated {
                    return fail(UNKNOWN, "unknown counterpart");
                }
                if !uniq.contains(&s) {
                    uniq.push(s);
                }
            }
            if uniq.len() > MAX_CONTACTS {
                return fail("CONTACT_LIMIT", "at most three counterparts per round");
            }
            w.civs[si].selected = uniq;
            Ok(("Counterparts recorded. Channels open only where the choice is mutual.".into(), None))
        }
        Action::Message { to, text, intent } => {
            if (to as usize) >= w.civs.len() || !w.civs[si].contacts[to as usize].met {
                return fail(UNKNOWN, "unknown counterpart");
            }
            if text.chars().count() > MAX_MESSAGE_CHARS {
                return fail("MESSAGE_TOO_LARGE", "a message is limited to 2,000 characters");
            }
            count_envelope(w, seat, to)?;
            let id = w.id();
            let (month, round, window) = (w.month, w.round, w.window);
            w.messages.push(Msg { id, from: seat, to, month, round, window, intent, text });
            Ok(("Envelope delivered at the end of this window.".into(), Some(id)))
        }
        Action::ProposeTreaty { to, clauses, text } => {
            if (to as usize) >= w.civs.len() || to == seat || !w.civs[si].contacts[to as usize].met {
                return fail(UNKNOWN, "unknown counterpart");
            }
            let mut canon = Vec::new();
            for cl in &clauses {
                canon.push(canon_clause(w, seat, cl)?);
            }
            if let Err(e) = crate::sim::diplomacy::validate_clauses(w, seat, to, &canon) {
                return fail("FORMAL_PAYLOAD_REQUIRED", e);
            }
            let text = text.unwrap_or_default();
            if text.chars().count() > MAX_MESSAGE_CHARS {
                return fail("MESSAGE_TOO_LARGE", "a message is limited to 2,000 characters");
            }
            count_envelope(w, seat, to)?;
            let id = w.id();
            let (month, round) = (w.month, w.round);
            w.offers.push(Offer { id, from: seat, to, clauses: canon, text, created: month, expires_round: round + 1, status: "open".into() });
            Ok(("Proposal registered. It binds nobody until the other party signs this exact version.".into(), Some(id)))
        }
        Action::WithdrawOffer { offer } => {
            match w.offers.iter_mut().find(|o| o.id == offer && o.from == seat && o.status == "open") {
                Some(o) => {
                    o.status = "withdrawn".into();
                    Ok(("Offer withdrawn.".into(), None))
                }
                None => fail(UNKNOWN, "no such open offer"),
            }
        }
        Action::DeclineOffer { offer } => {
            match w.offers.iter_mut().find(|o| o.id == offer && o.to == seat && o.status == "open") {
                Some(o) => {
                    o.status = "declined".into();
                    Ok(("Offer declined.".into(), None))
                }
                None => fail(UNKNOWN, "no such open offer"),
            }
        }
        Action::SignTreaty { offer } => {
            let Some(ix) = w.offers.iter().position(|o| o.id == offer && o.to == seat && o.status == "open") else {
                return fail(UNKNOWN, "no such open offer");
            };
            let from = w.offers[ix].from;
            if w.civs[from as usize].status == SeatStatus::Eliminated {
                return fail(UNKNOWN, "no such open offer");
            }
            if w.phase == Phase::Negotiate {
                count_envelope(w, seat, from)?;
            }
            match crate::sim::diplomacy::activate(w, ix) {
                Ok(id) => Ok(("Signed. Obligations begin with next month's settlement.".into(), Some(id))),
                Err(e) => fail("CONFLICTING_ACTIONS", e),
            }
        }
        Action::BreakTreaty { treaty, notice } => {
            let Some(ix) = w.treaties.iter().position(|t| t.id == treaty && t.parties.contains(&seat) && t.status == "active") else {
                return fail(UNKNOWN, "no such active treaty");
            };
            if notice {
                return match crate::sim::diplomacy::give_notice(w, seat, ix) {
                    Ok(ends) => Ok((format!("Notice given. The open-ended clauses end in {}; nothing is breached.", crate::util::date_label(&w.cfg, ends)), None)),
                    Err(e) => fail("CONFLICTING_ACTIONS", e),
                };
            }
            crate::sim::diplomacy::break_treaty(w, seat, ix);
            Ok(("Treaty repudiated. The record of the breach is permanent.".into(), None))
        }
        // --------------------------------------------------------------- policy
        Action::SetPolicy { setting } => {
            match setting {
                PolicySetting::FoodReserveMonths { months } => {
                    if months > 36 {
                        return fail("INVALID_SCHEMA", "reserve target is limited to 36 months");
                    }
                    w.civs[si].food_reserve_months = months;
                }
                PolicySetting::LaborWeight { category, weight } => {
                    w.civs[si].labor_weights[category.index()] = weight.min(10);
                }
                PolicySetting::Mobilization { bp } => {
                    w.civs[si].mobilization_bp = bp.min(10_000);
                }
                PolicySetting::Facility { region, facility, enabled } => {
                    let ri = own_region(w, seat, region)?;
                    let Some(kind) = c.fac_ix.get(&facility) else { return fail(UNKNOWN, "unknown facility") };
                    match w.regions[ri].fac_mut(*kind) {
                        Some(f) => f.enabled = enabled,
                        None => return fail(UNKNOWN, "unknown facility"),
                    }
                }
                PolicySetting::Rename { name } => {
                    let name: String = name.trim().chars().take(32).collect();
                    if name.is_empty() {
                        return fail("INVALID_SCHEMA", "a name is required");
                    }
                    w.civs[si].name = name;
                }
                PolicySetting::MoveCapital { region } => {
                    let ri = own_region(w, seat, region)?;
                    if w.regions[ri].owner != Some(seat) {
                        return fail(UNKNOWN, "that region is not one you govern");
                    }
                    w.civs[si].capital = region;
                }
                PolicySetting::Method { region, facility, method } => {
                    let ri = own_region(w, seat, region)?;
                    // a facility that does not exist, one the region does not have, a
                    // method that does not exist and one the seat cannot yet use are
                    // all refused in the same words: nothing can be probed for
                    const NO: &str = "unknown facility or method";
                    let Some(&kind) = c.fac_ix.get(&facility) else { return fail(UNKNOWN, NO) };
                    if w.regions[ri].fac(kind).is_none() {
                        return fail(UNKNOWN, NO);
                    }
                    if let Some(key) = &method {
                        if !crate::sim::economy::method_choosable(w, seat, kind, key) {
                            return fail(UNKNOWN, NO);
                        }
                    }
                    if let Some(f) = w.regions[ri].fac_mut(kind) {
                        f.method = method;
                    }
                }
                PolicySetting::WarPolicy { seat: other, accept_white_peace_after_months, accept_cession_max } => {
                    let o = other as usize;
                    if other == seat || o >= w.civs.len() || !w.civs[si].contacts[o].met {
                        return fail(UNKNOWN, "unknown counterpart");
                    }
                    if w.civs[si].war_policy.len() < w.civs.len() {
                        let n = w.civs.len();
                        w.civs[si].war_policy.resize(n, None);
                    }
                    w.civs[si].war_policy[o] = accept_white_peace_after_months.map(|m| (m.min(1200), accept_cession_max));
                }
            }
            Ok(("Standing policy updated.".into(), None))
        }
        // -------------------------------------------------------------- projects
        Action::StartProject { spec, priority } => {
            if w.civs[si].projects.len() >= 120 {
                return fail("RATE_LIMITED", "too many open projects");
            }
            match spec {
                ProjectSpec::Build { region, facility, levels } => {
                    let ri = own_region(w, seat, region)?;
                    let Some(&kind) = c.fac_ix.get(&facility) else { return fail(UNKNOWN, "unknown facility") };
                    if !facility_visible(w, seat, kind) {
                        return fail(UNKNOWN, "unknown facility");
                    }
                    let def = &c.facilities[kind];
                    if !def.req.eval(&CivCtx { world: w, seat }) {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", format!("{} cannot be built yet: a known requirement is unmet", def.name));
                    }
                    if levels == 0 || levels > 20 {
                        return fail("INVALID_SCHEMA", "build between 1 and 20 levels at a time");
                    }
                    let existing = w.regions[ri].fac(kind).map(|f| f.level).unwrap_or(0);
                    let pending: u16 = w.civs[si].projects.iter().filter(|p| p.region == Some(region)).map(|p| if let ProjKind::Build { facility: k, levels: l } = p.kind { if k == kind { l } else { 0 } } else { 0 }).sum();
                    let cap = level_cap(w, seat, ri, def);
                    if existing + pending + levels > cap {
                        return fail("CONFLICTING_ACTIONS", if cap == 0 { format!("{} has no suitable site for {}", w.regions[ri].name, def.name.to_lowercase()) } else { format!("{} can support at most {} level(s) of {} at present", w.regions[ri].name, cap, def.name.to_lowercase()) });
                    }
                    // the charge is the quote shown for this site, times the levels ordered:
                    // goods, work, crew and site power; the minimum months do not grow
                    // with the levels (they are built side by side)
                    let quote = crate::sim::projects::build_quote(w, seat, kind);
                    let n = levels as i64;
                    let inputs = quote.cost.iter().map(|(g, a)| (*g, a * n)).collect();
                    let crew = quote.crew.iter().map(|(qs, c)| (qs.clone(), c * levels as u32)).collect();
                    let id = new_site_order(w, seat, ProjKind::Build { facility: kind, levels }, region, quote.work * n, inputs, quote.months, crew, quote.power * n, priority);
                    let mut terms = format!("at least {} months", quote.months);
                    if !quote.crew.is_empty() {
                        terms.push_str(", with its site crew reserved from this region's qualified residents until it is finished, paused or cancelled");
                    }
                    if quote.power > 0 {
                        terms.push_str("; site power comes from the region's shaft supply, then from site engines burning coal, then refined fuel");
                    }
                    Ok((format!("Construction ordered: {terms}{}.", if quote.first { ". As the first of its kind it takes half as much work and time again" } else { "" }), Some(id)))
                }
                ProjectSpec::Research { tech } => {
                    let Some(ti) = tech_from_handle(w, seat, &tech) else { return fail(UNKNOWN, "unknown method") };
                    let st = w.civs[si].tech[ti].state;
                    if st < ST_DISCOVERED {
                        return fail(UNKNOWN, "unknown method");
                    }
                    if st >= ST_UNDERSTOOD {
                        return fail("CONFLICTING_ACTIONS", "this is already understood");
                    }
                    if w.civs[si].projects.iter().any(|p| p.kind == (ProjKind::Research { tech: ti })) {
                        return fail("CONFLICTING_ACTIONS", "this investigation is already under way");
                    }
                    if !c.techs[ti].prereq.eval(&CivCtx { world: w, seat }) {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", "investigators lack knowledge this work depends on");
                    }
                    if !crate::sim::projects::tech_site_ok(w, seat, ti) {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", "this investigation needs a working installation that does not exist yet");
                    }
                    let t = &c.techs[ti];
                    let discount = w.civs[si].tech[ti].discount_bp as i64;
                    let work = scaled(t.work, w.cfg.research_pace()) * (10_000 - discount) / 10_000;
                    let min_months = (t.min_months as i64 * pace as i64 / 10_000).max(2);
                    let id = new_project(w, seat, ProjKind::Research { tech: ti }, None, work.max(1000), vec![], min_months, priority);
                    Ok(("Investigation funded. It advances only with qualified research staff.".into(), Some(id)))
                }
                ProjectSpec::Survey { region } => {
                    let ti = region as usize;
                    if ti >= w.regions.len() {
                        return fail(UNKNOWN, "unknown region");
                    }
                    let known_adjacent = w.civs[si].memory[ti].seen || w.regions[ti].neighbors.iter().any(|(n, _)| w.civs[si].memory[*n as usize].seen);
                    if !known_adjacent {
                        return fail(UNKNOWN, "unknown region");
                    }
                    if w.civs[si].memory[ti].surveyed && w.regions[ti].controller == Some(seat) {
                        return fail("CONFLICTING_ACTIONS", "that region is already fully recorded");
                    }
                    if w.civs[si].projects.iter().any(|p| p.kind == (ProjKind::Survey { region })) {
                        return fail("CONFLICTING_ACTIONS", "a survey party is already assigned there");
                    }
                    // nearest governed region supplies the party
                    let (base, dist) = nearest_own(w, seat, ti).ok_or(Fail { code: UNKNOWN, reason: "no governed region can supply a party".into() })?;
                    let work = scaled((8 + 6 * dist as i64) * 1000, pace);
                    let id = new_project(w, seat, ProjKind::Survey { region }, Some(base as RegionId), work, vec![(Good::Food, 20_000 + 10_000 * dist as i64), (Good::Tools, 1000)], 2, priority);
                    Ok(("Survey party provisioned.".into(), Some(id)))
                }
                ProjectSpec::Settle { from, to, people } => {
                    let fi = own_region(w, seat, from)?;
                    let ti = to as usize;
                    if ti >= w.regions.len() || !w.civs[si].memory[ti].seen {
                        return fail(UNKNOWN, "unknown region");
                    }
                    let Some(kind) = w.link(fi, ti) else { return fail("CONFLICTING_ACTIONS", "settlers need a direct route from the sending region") };
                    if kind == LinkKind::Sea && !w.civs[si].knows_id("T013") {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", "no vessels able to carry settlers across open water");
                    }
                    if w.civs[si].memory[ti].owner.is_some() {
                        return fail("CONFLICTING_ACTIONS", "our records show that land is already held");
                    }
                    if !(SETTLERS_MIN..=SETTLERS_MAX).contains(&people) {
                        return fail("INVALID_SCHEMA", "a settling party is 20,000 to 400,000 people");
                    }
                    if w.regions[fi].population() < people + SETTLE_KEEP {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", "the sending region cannot spare that many people");
                    }
                    if w.civs[si].projects.iter().any(|p| matches!(p.kind, ProjKind::Settle { to: t, .. } if t == to)) {
                        return fail("CONFLICTING_ACTIONS", "a party is already preparing to settle there");
                    }
                    let work = scaled(18_000, pace);
                    // four rations for every settler and fifty tool lots for every thousand
                    let inputs = vec![(Good::Food, people as i64 * SETTLER_RATIONS), (Good::Tools, people as i64 * SETTLER_TOOLS_PER_K / 1000), (Good::Materials, 10_000)];
                    let id = new_project(w, seat, ProjKind::Settle { from, to, people }, Some(from), work, inputs, 3, priority);
                    Ok(("Settling party is being provisioned.".into(), Some(id)))
                }
                ProjectSpec::Study { domain } => {
                    let Some(tag) = Tag::from_key(&domain) else { return fail(UNKNOWN, "unknown domain") };
                    let known = (0..c.techs.len()).any(|i| w.civs[si].knows(i) && c.techs[i].tags.contains(&tag));
                    if !known {
                        return fail(UNKNOWN, "unknown domain");
                    }
                    if w.civs[si].projects.iter().any(|p| p.kind == (ProjKind::Study { tag: tag as usize })) {
                        return fail("CONFLICTING_ACTIONS", "that study is already under way");
                    }
                    let class = crate::sim::projects::study_class(w, seat);
                    let base = match class {
                        ResearchClass::Craft => 30_000,
                        ResearchClass::Scholarly => 70_000,
                        _ => 150_000,
                    };
                    let repeats = w.civs[si].study_done[tag as usize] as i64;
                    let work = scaled(base * (2 + repeats) / 2, pace);
                    let id = new_project(w, seat, ProjKind::Study { tag: tag as usize }, None, work, vec![], 4, priority);
                    Ok(("Exploratory study funded. It may find nothing new.".into(), Some(id)))
                }
                ProjectSpec::Resettle { from, to, people } => {
                    let fi = own_region(w, seat, from)?;
                    let ti = own_region(w, seat, to)?;
                    if fi == ti || people == 0 || (w.regions[fi].population() as u64) < people as u64 + RESETTLE_KEEP as u64 {
                        return fail("INVALID_SCHEMA", "the sending region cannot spare that many people");
                    }
                    let work = scaled(6000, pace);
                    let id = new_project(w, seat, ProjKind::Resettle { from, to, people }, Some(from), work, vec![(Good::Food, people as i64 * crate::content::FOOD_PER_PERSON_MONTH)], 2, priority);
                    Ok(("Resettlement organized.".into(), Some(id)))
                }
                ProjectSpec::Recruit { region, role, soldiers, tier } => {
                    let ri = own_region(w, seat, region)?;
                    if (tier as usize) >= c.unit_tiers.len() || !c.unit_tiers[tier as usize].req.eval(&CivCtx { world: w, seat }) {
                        return fail(UNKNOWN, "unknown formation type");
                    }
                    if w.regions[ri].owner != Some(seat) {
                        return fail("CONFLICTING_ACTIONS", "occupied populations cannot be recruited");
                    }
                    if !(FORMATION_MIN..=FORMATION_MAX).contains(&soldiers) {
                        return fail("INVALID_SCHEMA", "a formation is 1,000 to 5,000,000 soldiers");
                    }
                    let room = crate::sim::military::recruit_room(w, seat);
                    if soldiers > room {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", format!("at most {} more people would currently serve", group(room as i64)));
                    }
                    if tier >= 1 && w.regions[ri].cap(Cap::Barracks) == 0 {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", "this formation needs a barracks in the region");
                    }
                    let def = &c.unit_tiers[tier as usize];
                    // equipment is stated per thousand soldiers; bronze is issued in place
                    // of iron when the stores cannot cover the iron but can cover the bronze,
                    // and mounted formations need their mounts
                    let per_k = |v: &[(Good, i64)]| -> Vec<(Good, i64)> { v.iter().map(|(g, a)| (*g, a * soldiers as i64 / 1000)).collect() };
                    let covered = |v: &[(Good, i64)]| v.iter().all(|(g, a)| w.civs[si].stock_of(*g) >= *a);
                    let main = per_k(&def.equipment);
                    let alt = per_k(&def.alternative);
                    let mut inputs: Vec<(Good, i64)> = if !alt.is_empty() && !covered(&main) && covered(&alt) { alt } else { main };
                    if role == Role::Maneuver {
                        inputs.extend(per_k(&def.maneuver_extra));
                    }
                    let work = scaled(soldiers as i64 * MUSTER_WORK_PER_K / 1000, pace);
                    let id = new_project(w, seat, ProjKind::Recruit { role, soldiers, tier }, Some(region), work, inputs, 2, priority);
                    Ok(("Recruitment and equipment ordered.".into(), Some(id)))
                }
                ProjectSpec::Religion { beliefs, name } => {
                    let Some(mv) = w.civs[si].movement.clone() else { return fail(UNKNOWN, "there is no movement to support") };
                    if w.civs[si].projects.iter().any(|p| matches!(p.kind, ProjKind::Religion { .. })) {
                        return fail("CONFLICTING_ACTIONS", "the movement is already preparing its next step");
                    }
                    own_region(w, seat, mv.region)?;
                    for b in &beliefs {
                        if !BELIEFS.iter().any(|x| x.key == b) {
                            return fail(UNKNOWN, "unknown belief");
                        }
                    }
                    match mv.stage {
                        0 => {
                            if mv.devotion < crate::sim::culture::movement_requirements(0).0 {
                                return fail("INSUFFICIENT_VISIBLE_BUDGET", "the gatherings are not yet committed enough");
                            }
                            if beliefs.len() != 1 || !BELIEFS.iter().any(|x| x.key == beliefs[0] && x.slot == "Follower practice") {
                                return fail("INVALID_SCHEMA", "choose exactly one follower practice as the local tradition");
                            }
                            let id = new_project(w, seat, ProjKind::Religion { beliefs, name: None }, Some(mv.region), scaled(10_000, pace), vec![(Good::Food, 30_000)], 2, priority);
                            Ok(("The gatherings will settle on a shared tradition.".into(), Some(id)))
                        }
                        3 => {
                            if w.religions.len() as u8 >= RELIGION_SLOTS || w.civs[si].founded_religion {
                                return fail("CONFLICTING_ACTIONS", "no founding opportunity remains");
                            }
                            if beliefs.len() != 4 {
                                return fail("INVALID_SCHEMA", "choose one belief of each of the four kinds");
                            }
                            let id = new_project(w, seat, ProjKind::Religion { beliefs, name }, Some(mv.region), scaled(60_000, pace), vec![(Good::Food, 200_000), (Good::Materials, 20_000)], 6, priority);
                            Ok(("The founding is being prepared. Its beliefs will be fixed once it completes.".into(), Some(id)))
                        }
                        1 => fail("CONFLICTING_ACTIONS", "the movement next needs a sacred precinct, built like any other facility"),
                        2 => fail("CONFLICTING_ACTIONS", "the movement is waiting for a recognized founder"),
                        _ => fail("CONFLICTING_ACTIONS", "the religion has already been founded"),
                    }
                }
                ProjectSpec::FtlTrial => {
                    if !w.civs[si].knows_id("T166") {
                        return fail(UNKNOWN, "unknown project");
                    }
                    if w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).count() == 0 {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", "no operational jump assembly exists");
                    }
                    if w.civs[si].projects.iter().any(|p| p.kind == ProjKind::FtlTrial) {
                        return fail("CONFLICTING_ACTIONS", "a trial is already being prepared");
                    }
                    let (site, id) = ftl_order(w, seat, ProjKind::FtlTrial, priority);
                    Ok((format!("Trial preparation begun at {site}, where the programme's people are: jump engineers and orbital crews there are held for it for at least six months, and it draws site power."), Some(id)))
                }
                ProjectSpec::FtlDeployment => {
                    if !w.civs[si].knows_id("T167") {
                        return fail(UNKNOWN, "unknown project");
                    }
                    if w.civs[si].projects.iter().any(|p| p.kind == ProjKind::FtlDeployment) {
                        return fail("CONFLICTING_ACTIONS", "an exercise is already being prepared");
                    }
                    let (site, id) = ftl_order(w, seat, ProjKind::FtlDeployment, priority);
                    Ok((format!("Deployment exercise scheduled at {site}, where the programme's people are; it takes at least six months of work. Jump engineers and orbital crews there are held for it, and it draws site power."), Some(id)))
                }
                ProjectSpec::FtlReplacement => {
                    if !w.civs[si].knows_id("T167") {
                        return fail(UNKNOWN, "unknown project");
                    }
                    if w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).count() < 3 {
                        return fail("INSUFFICIENT_VISIBLE_BUDGET", "a third operational assembly is needed first");
                    }
                    if w.civs[si].projects.iter().any(|p| p.kind == ProjKind::FtlReplacement) {
                        return fail("CONFLICTING_ACTIONS", "a replacement is already being prepared");
                    }
                    let (site, id) = ftl_order(w, seat, ProjKind::FtlReplacement, priority);
                    Ok((format!("Replacement and relief scheduled at {site}, where the programme's people are. Jump engineers and orbital crews there are held for it for at least three months, and it draws site power."), Some(id)))
                }
            }
        }
        Action::ManageProject { project, op, priority, position } => {
            let Some(pos) = w.civs[si].projects.iter().position(|p| p.id == project) else { return fail(UNKNOWN, "no such project") };
            if let Some(p) = priority {
                w.civs[si].projects[pos].priority = p.min(9);
            }
            if let Some(place) = position {
                move_in_queue(w, seat, project, place);
            }
            match op {
                ManageOp::Pause => {
                    // a paused order releases its crew at once
                    let p = &mut w.civs[si].projects[pos];
                    p.paused = true;
                    p.crew_on_site.iter_mut().for_each(|n| *n = 0);
                }
                ManageOp::Resume => w.civs[si].projects[pos].paused = false,
                ManageOp::Cancel => {
                    let p = w.civs[si].projects.remove(pos);
                    match p.kind {
                        ProjKind::Research { tech } => {
                            // evidence gathered so far is kept; the node returns to its discovered state
                            let st = &mut w.civs[si].tech[tech];
                            if st.state == ST_INVESTIGATING {
                                st.state = ST_DISCOVERED;
                            }
                        }
                        ProjKind::Reform { practice } => {
                            w.civs[si].practice[practice].state = 1;
                        }
                        _ => {}
                    }
                    return Ok(("Project cancelled. Inputs already consumed are not refunded.".into(), None));
                }
            }
            Ok(("Project updated.".into(), None))
        }
        Action::Investigate { lead } => {
            let Some(ti) = tech_from_handle(w, seat, &lead) else { return fail(UNKNOWN, "unknown lead") };
            if w.civs[si].tech[ti].state != ST_HINTED {
                return fail(UNKNOWN, "unknown lead");
            }
            if w.civs[si].projects.iter().any(|p| p.kind == (ProjKind::LeadStudy { tech: ti })) {
                return fail("CONFLICTING_ACTIONS", "this lead is already being followed up");
            }
            let t = &c.techs[ti];
            let work = scaled(t.work * 15 / 100, w.cfg.research_pace());
            let id = new_project(w, seat, ProjKind::LeadStudy { tech: ti }, None, work, vec![], 2, Some(4));
            Ok(("A small team will follow up the lead.".into(), Some(id)))
        }
        Action::ProposeReform { practice } => {
            let Some(pi) = prac_from_handle(w, seat, &practice) else { return fail(UNKNOWN, "unknown practice") };
            let st = w.civs[si].practice[pi].state;
            if st != 1 {
                return fail("CONFLICTING_ACTIONS", if st == 2 { "this reform is already under way" } else { "this practice is already enacted" });
            }
            let p = &c.practices[pi];
            if !p.prereq.eval(&PracEnactedCtx { world: w, seat, recognized_only: false }) {
                return fail("INSUFFICIENT_VISIBLE_BUDGET", "the institutions this practice builds on are not yet enacted");
            }
            if !p.hard.eval(&CivCtx { world: w, seat }) {
                return fail("INSUFFICIENT_VISIBLE_BUDGET", "its real requirements are not yet met");
            }
            let capital = w.civs[si].capital;
            let id = new_project(w, seat, ProjKind::Reform { practice: pi }, Some(capital), scaled(p.work, w.cfg.research_pace()), p.cost.clone(), 3, Some(3));
            w.civs[si].practice[pi].state = 2;
            Ok(("Reform proposed. Assemblies and officials at the capital must give it their time.".into(), Some(id)))
        }
        Action::StartProgram { region, course, seats } => {
            let ri = own_region(w, seat, region)?;
            let Some(&ci) = c.course_ix.get(&course) else { return fail(UNKNOWN, "unknown course") };
            if !course_visible(w, seat, ci) {
                return fail(UNKNOWN, "unknown course");
            }
            let def = &c.courses[ci];
            if !def.req.eval(&CivCtx { world: w, seat }) {
                return fail("INSUFFICIENT_VISIBLE_BUDGET", "the content of this course is not yet available");
            }
            if seats == 0 || seats > PROGRAM_SEATS_MAX {
                return fail("INVALID_SCHEMA", "choose between 1 and 2,000,000 places");
            }
            let (cap, reserved) = crate::sim::projects::venue_seats(w, seat, ri, def.venue);
            if reserved + seats as i64 > cap {
                return fail("INSUFFICIENT_VISIBLE_BUDGET", format!("the venue in {} has {} free places", w.regions[ri].name, group((cap - reserved).max(0))));
            }
            if w.civs[si].programs.len() >= 200 {
                return fail("RATE_LIMITED", "too many programmes");
            }
            let id = w.id();
            w.civs[si].programs.push(Program { id, course: ci, region, seats, enrolled: 0, entrant: None, teachers: 0, teacher_qual: None, progress: 0, duration: def.months, graduates: 0, paused: false, blockers: vec![], last_grad: 0 });
            Ok(("Programme opened. Cohorts enrol while learners, teachers and places exist.".into(), Some(id)))
        }
        Action::ManageProgram { program, op, seats } => {
            let Some(pos) = w.civs[si].programs.iter().position(|p| p.id == program) else { return fail(UNKNOWN, "no such programme") };
            if let Some(s) = seats {
                let (course, region, old) = {
                    let p = &w.civs[si].programs[pos];
                    (p.course, p.region as usize, p.seats)
                };
                let (cap, reserved) = crate::sim::projects::venue_seats(w, seat, region, c.courses[course].venue);
                if s == 0 || s > PROGRAM_SEATS_MAX || reserved - old as i64 + s as i64 > cap {
                    return fail("INSUFFICIENT_VISIBLE_BUDGET", "the venue does not have that many places");
                }
                w.civs[si].programs[pos].seats = s;
            }
            match op {
                ManageOp::Pause => w.civs[si].programs[pos].paused = true,
                ManageOp::Resume => w.civs[si].programs[pos].paused = false,
                ManageOp::Cancel => {
                    let p = w.civs[si].programs.remove(pos);
                    crate::sim::projects::release_program(w, &p);
                    return Ok(("Programme closed. Learners return to their previous work; months already taught are lost.".into(), None));
                }
            }
            Ok(("Programme updated.".into(), None))
        }
        Action::Demolish { region, facility, levels } => {
            let ri = own_region(w, seat, region)?;
            let Some(&kind) = c.fac_ix.get(&facility) else { return fail(UNKNOWN, "unknown facility") };
            let Some(f) = w.regions[ri].fac_mut(kind) else { return fail(UNKNOWN, "unknown facility") };
            f.level = f.level.saturating_sub(levels.max(1));
            w.regions[ri].facilities.retain(|f| f.level > 0);
            Ok(("Facility reduced. Nothing is recovered.".into(), None))
        }
        Action::MilitaryOrder { army, order } => {
            let Some(ai) = w.armies.iter().position(|a| a.id == army && a.owner == seat) else { return fail(UNKNOWN, "no such formation") };
            match order {
                ArmyOrder::Hold => w.armies[ai].order = ArmyOrder::Hold,
                ArmyOrder::Move { to } | ArmyOrder::Attack { region: to } => {
                    if (to as usize) >= w.regions.len() || !w.civs[si].memory[to as usize].seen {
                        return fail(UNKNOWN, "unknown region");
                    }
                    if let ArmyOrder::Attack { .. } = order {
                        if let Some(ctrl) = w.regions[to as usize].controller {
                            if crate::sim::military::friendly(w, seat, ctrl) {
                                return fail("CONFLICTING_ACTIONS", "that region answers to the same authority");
                            }
                            if w.civs[si].overlord.is_some() && w.civs[si].overlord != Some(ctrl) && !w.at_war(seat, ctrl) {
                                return fail("UNAUTHORIZED", "a subordinate government cannot open a war on its own authority");
                            }
                        }
                    }
                    w.armies[ai].order = order;
                    w.armies[ai].move_progress = 0;
                }
                ArmyOrder::Disband => {
                    let a = w.armies.remove(ai);
                    let home = if w.regions[a.region as usize].controller == Some(seat) { a.region } else { w.civs[si].capital };
                    let lineage = w.civs[si].lineage;
                    crate::sim::population::return_adults(&mut w.regions[home as usize], lineage, a.count());
                    return Ok(("Formation disbanded; its people return to civilian life. Equipment is not recovered.".into(), None));
                }
                ArmyOrder::Merge { into } => {
                    let Some(bi) = w.armies.iter().position(|a| a.id == into && a.owner == seat) else { return fail(UNKNOWN, "no such formation") };
                    if bi == ai || w.armies[ai].region != w.armies[bi].region || w.armies[ai].tier != w.armies[bi].tier {
                        return fail("CONFLICTING_ACTIONS", "formations must share a region and equipment tier to merge");
                    }
                    let a = w.armies[ai].clone();
                    let b = &mut w.armies[bi];
                    let (na, nb) = (a.count() as i64, b.count() as i64);
                    let tot = (na + nb).max(1);
                    b.proficiency_bp = ((a.proficiency_bp as i64 * na + b.proficiency_bp as i64 * nb) / tot) as u16;
                    b.morale_bp = ((a.morale_bp as i64 * na + b.morale_bp as i64 * nb) / tot) as u16;
                    b.supply_bp = ((a.supply_bp as i64 * na + b.supply_bp as i64 * nb) / tot) as u16;
                    b.training_left = b.training_left.max(a.training_left);
                    b.initial += a.initial;
                    for r in 0..3 {
                        b.soldiers[r] += a.soldiers[r];
                    }
                    w.armies.remove(ai);
                }
            }
            Ok(("Order issued.".into(), None))
        }
        Action::Directive { op, id, directive, position } => match op {
            DirectiveOp::Add => {
                let Some(d) = directive else { return fail("INVALID_SCHEMA", "a standing order to add is required") };
                validate_directive(w, seat, &d)?;
                let civ = &w.civs[si];
                if let Some(i) = civ.directives.iter().position(|x| same_directive(&x.directive, &d)) {
                    let st = &mut w.civs[si].directives[i];
                    st.directive = d;
                    st.last_result.clear();
                    st.last_status.clear();
                    let id = st.id;
                    return Ok(("Standing order replaced. It is evaluated on 1 January of every year and in the first month of every round.".into(), Some(id)));
                }
                if civ.directives.len() >= DIRECTIVES_MAX {
                    return fail("RATE_LIMITED", "at most 64 standing orders");
                }
                let new_id = w.id();
                w.civs[si].directives.push(DirectiveSt { id: new_id, directive: d, last_result: String::new(), last_status: String::new(), last_month: 0 });
                Ok(("Standing order recorded. It is evaluated on 1 January of every year and in the first month of every round.".into(), Some(new_id)))
            }
            DirectiveOp::Remove => {
                let Some(pos) = id.and_then(|id| w.civs[si].directives.iter().position(|d| d.id == id)) else { return fail(UNKNOWN, "no such standing order") };
                w.civs[si].directives.remove(pos);
                Ok(("Standing order withdrawn.".into(), None))
            }
            DirectiveOp::Move => {
                let Some(pos) = id.and_then(|id| w.civs[si].directives.iter().position(|d| d.id == id)) else { return fail(UNKNOWN, "no such standing order") };
                let d = w.civs[si].directives.remove(pos);
                let to = (position.unwrap_or(0) as usize).min(w.civs[si].directives.len());
                w.civs[si].directives.insert(to, d);
                Ok(("Standing order moved.".into(), None))
            }
        },
        Action::Forfeit => {
            w.civs[si].status = SeatStatus::Forfeited;
            w.civs[si].auto_pass = true;
            w.civs[si].ready = true;
            Ok(("Withdrawal recorded. A maintenance controller keeps the society running; this seat scores -1.".into(), None))
        }
    }
}

/// Nearest governed region to a target, by links, with its distance.
pub fn nearest_own(w: &World, seat: SeatId, target: usize) -> Option<(usize, u32)> {
    let n = w.regions.len();
    let mut dist = vec![u32::MAX; n];
    dist[target] = 0;
    let mut queue = vec![target];
    let mut qi = 0;
    while qi < queue.len() {
        let x = queue[qi];
        qi += 1;
        if w.regions[x].controller == Some(seat) {
            return Some((x, dist[x]));
        }
        for (nb, _) in &w.regions[x].neighbors {
            let nb = *nb as usize;
            if dist[nb] == u32::MAX {
                dist[nb] = dist[x] + 1;
                queue.push(nb);
            }
        }
    }
    None
}
