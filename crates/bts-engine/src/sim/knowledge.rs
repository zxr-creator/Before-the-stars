//! Dynamic discovery on the fixed graph: evidence from actual practice and
//! contact turns unknown nodes into leads, leads into discovered methods, and
//! funded investigation into reproducible understanding. Also map knowledge.

use crate::content::{content, Req, Tag};
use crate::sim::chronicle::{brief, moment};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

fn observe_region(w: &mut World, seat: SeatId, ri: usize) {
    let month = w.month;
    let owner = w.regions[ri].owner;
    let pop = w.regions[ri].population();
    let c = content();
    let notable: Vec<String> = w.regions[ri]
        .facilities
        .iter()
        .filter(|f| f.level > 0 && c.facilities[f.kind].work >= 100_000)
        .map(|f| c.facilities[f.kind].name.to_string())
        .take(4)
        .collect();
    let mem = &mut w.civs[seat as usize].memory[ri];
    mem.seen = true;
    mem.last_seen = month;
    mem.owner = owner;
    mem.pop_estimate = pop;
    mem.notable = notable;
    if let Some(o) = owner {
        if o != seat {
            meet(w, seat, o);
        }
    }
}

pub fn meet(w: &mut World, a: SeatId, b: SeatId) {
    if a == b || w.civs[a as usize].contacts[b as usize].met {
        return;
    }
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    for (x, y) in [(a, b), (b, a)] {
        let ct = &mut w.civs[x as usize].contacts[y as usize];
        ct.met = true;
        ct.month = month;
        let other = w.civs[y as usize].name.clone();
        let capital = w.civs[x as usize].capital;
        moment(
            w,
            x,
            MomentCategory::Diplomacy,
            format!("First contact with {other}"),
            format!("Parties from both peoples met and exchanged signs. What {other} can make, wants and knows is still mostly rumour."),
            Some(capital),
            "contact",
            true,
            vec![format!("Contact recorded in {when}")],
        );
        brief(w, x, "info", format!("First contact: {other}"), "You can now select them as a counterpart in the contact phase.".into(), None, "diplomacy");
    }
}

/// Own regions are known exactly; neighbours and army surroundings are observed.
pub fn refresh_visibility(w: &mut World, seat: SeatId) {
    let month = w.month;
    let mut seen: Vec<usize> = Vec::new();
    for ri in 0..w.regions.len() {
        let mine = w.regions[ri].controller == Some(seat) || w.regions[ri].owner == Some(seat);
        if mine {
            let mem = &mut w.civs[seat as usize].memory[ri];
            mem.surveyed = true;
            if mem.survey_month == 0 {
                mem.survey_month = month;
            }
            seen.push(ri);
            for (nb, _) in &w.regions[ri].neighbors {
                seen.push(*nb as usize);
            }
        }
    }
    for a in w.armies.iter().filter(|a| a.owner == seat) {
        let ri = a.region as usize;
        seen.push(ri);
        for (nb, _) in &w.regions[ri].neighbors {
            seen.push(*nb as usize);
        }
    }
    // subordinates and overlords share what they see
    seen.sort_unstable();
    seen.dedup();
    for ri in seen {
        observe_region(w, seat, ri);
    }
}

pub fn survey_region(w: &mut World, seat: SeatId, ri: usize) {
    let month = w.month;
    observe_region(w, seat, ri);
    {
        let mem = &mut w.civs[seat as usize].memory[ri];
        mem.surveyed = true;
        mem.survey_month = month;
    }
    let nbs: Vec<usize> = w.regions[ri].neighbors.iter().map(|(n, _)| *n as usize).collect();
    for nb in nbs {
        observe_region(w, seat, nb);
    }
}

fn hint_threshold(w: &World, tech: usize) -> i64 {
    muldiv(content().techs[tech].hint, w.cfg.evidence_pace() as i64, 10_000)
}

/// How a civilization keeps and passes on knowledge (design chapter 36, section
/// 2.7): the channel factor of evidence, in basis points, and research
/// effectiveness, the researcher-months one staffed research post supplies.
/// Each step is the best institution the civilization has: oral tradition, writing
/// understood (T025), archives (C013), printing (T048), the scientific method, a
/// research commons (C044), digital networks (T112).
pub fn channel(civ: &Civ) -> (i64, i64) {
    let mut c = (6_000, 2_000);
    if civ.knows_id("T025") {
        c = (10_000, 3_500);
    }
    if civ.est_id("C013") {
        c = (13_000, 5_000);
    }
    if civ.knows_id("T048") {
        c = (16_000, 6_500);
    }
    if civ.milestones.sci_method.is_some() {
        c = (22_000, 8_500);
    }
    if civ.est_id("C044") {
        c = (26_000, 9_500);
    }
    if civ.knows_id("T112") {
        c = (30_000, 10_000);
    }
    c
}

/// Research effectiveness of a civilization, basis points (at most 10,000).
pub fn research_effectiveness(civ: &Civ) -> i64 {
    channel(civ).1
}

/// The channel factor a civilization's evidence gathers with, basis points: its
/// institutions, raised by literacy (half the literate share of working age) and by
/// open, questioning habits (tendencies O and R, at most a tenth either way).
pub fn channel_factor(w: &World, seat: SeatId) -> i64 {
    let civ = &w.civs[seat as usize];
    let (base, _) = channel(civ);
    let (mut lit, mut working) = (0u64, 0u64);
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        working += r.working() as u64;
        lit += crate::sim::population::literate_share(r) as u64 * r.working() as u64 / 10_000;
    }
    let lit_bp = if working > 0 { (lit * 10_000 / working) as i64 } else { 0 };
    let l = &w.lineages[civ.lineage as usize];
    let habits = (((l.axes[0] + l.axes[1]) as i64 / 2 - 5_000) * 1_000 / 4_500).clamp(-1_000, 1_000);
    base * (10_000 + lit_bp / 2) / 10_000 * (10_000 + habits) / 10_000
}

/// Mark understood prerequisites as reproduced once later work builds on them.
pub fn mark_used(w: &mut World, seat: SeatId, req: &Req) {
    let mut ts = Vec::new();
    req.techs(&mut ts);
    for t in ts {
        let st = &mut w.civs[seat as usize].tech[t];
        if st.state == ST_UNDERSTOOD {
            st.state = ST_PROTOTYPED;
        }
    }
}

/// Result of a bounded exploratory study: evidence for at most two eligible unknown nodes.
/// Evidence one researcher-month of an exploratory study adds to each of the (at
/// most two) nodes it looks into.
pub const STUDY_EVIDENCE_PER_MONTH: i64 = 5;

pub fn study_result(w: &mut World, seat: SeatId, tag: usize, work: i64) -> u32 {
    let c = content();
    let month = w.month;
    let t = Tag::ALL[tag];
    let mut eligible: Vec<usize> = (0..c.techs.len())
        .filter(|i| w.civs[seat as usize].tech[*i].state == ST_UNKNOWN && c.techs[*i].tags.contains(&t) && c.techs[*i].prereq.eval(&CivCtx { world: w, seat }))
        .collect();
    eligible.sort_by_key(|i| (c.techs[*i].hint, *i));
    // a study adds evidence in proportion to the work spent on it: it narrows a
    // domain down, it does not skip an era
    let mut found = 0;
    for i in eligible.into_iter().take(2) {
        let hint = muldiv(c.techs[i].hint, w.cfg.evidence_pace() as i64, 10_000);
        let st = &mut w.civs[seat as usize].tech[i];
        st.evidence += work * STUDY_EVIDENCE_PER_MONTH;
        if st.evidence >= hint {
            st.state = ST_HINTED;
            st.source = format!("Exploratory study of {}", t.name().to_lowercase());
            st.disc_month = month;
            found += 1;
        }
    }
    found
}


/// Operating facility levels and formations (in thousands of soldiers) whose
/// requirement names each technology: the installed base of design chapter 39,
/// section 1.4.
pub fn installed_base(w: &World, seat: SeatId) -> Vec<i64> {
    let c = content();
    let mut n = vec![0i64; c.techs.len()];
    let mut ts = Vec::new();
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        for f in r.facilities.iter().filter(|f| f.operated && f.level > 0) {
            let def = &c.facilities[f.kind];
            ts.clear();
            def.req.techs(&mut ts);
            if let Some(run) = &f.run {
                def.recipes[run.recipe].req.techs(&mut ts);
            }
            for t in &ts {
                n[*t] += f.level as i64;
            }
        }
    }
    for a in w.armies.iter().filter(|a| a.owner == seat) {
        ts.clear();
        c.unit_tiers[a.tier as usize].req.techs(&mut ts);
        for t in &ts {
            n[*t] += (a.count() as i64 / 1000).max(1);
        }
    }
    n
}

/// One rival family as a seat stands in it: the incumbent member and its share of
/// the installed base (basis points; 0 when the seat holds no member).
#[derive(Clone, Copy, Debug, Default)]
pub struct FamilyStand {
    pub incumbent: Option<usize>,
    pub share_bp: i64,
}

/// The locks path dependence puts on a seat's technologies (design chapter 39,
/// section 1.4), basis points: evidence and work multipliers and the discovery cap.
#[derive(Clone, Debug)]
pub struct Locks {
    pub evidence_bp: Vec<i64>,
    pub work_bp: Vec<i64>,
    pub capped: Vec<bool>,
    pub stands: Vec<FamilyStand>,
}

/// Lowest evidence multiplier and highest work multiplier on a victory-critical
/// member, and the share from which a lock caps discovery.
pub const CRITICAL_LOCK_E: i64 = 8_000;
pub const CRITICAL_LOCK_W: i64 = 11_000;
pub const CAP_SHARE_BP: i64 = 7_500;
/// A revisit study lifts the evidence lock and the cap for this long.
pub const REVISIT_MONTHS: Month = 240;

pub fn locks(w: &World, seat: SeatId, installed: &[i64]) -> Locks {
    let c = content();
    let civ = &w.civs[seat as usize];
    let n = c.techs.len();
    let mut l = Locks { evidence_bp: vec![10_000; n], work_bp: vec![10_000; n], capped: vec![false; n], stands: vec![FamilyStand::default(); c.families.len()] };
    for (fi, f) in c.families.iter().enumerate() {
        // adopted members count their installed base, understood-only members one
        let weight = |m: usize| if installed[m] > 0 { installed[m] } else if civ.tech[m].state >= ST_UNDERSTOOD { 1 } else { 0 };
        let total: i64 = f.members.iter().map(|m| weight(*m)).sum();
        if total == 0 {
            continue;
        }
        let inc = *f.members.iter().max_by_key(|m| (weight(**m), std::cmp::Reverse(**m))).unwrap();
        let mut share = weight(inc) * 10_000 / total;
        if installed[inc] == 0 {
            share = share.min(5_000);
        }
        l.stands[fi] = FamilyStand { incumbent: Some(inc), share_bp: share };
        let refuted = f.refuted_by.iter().filter(|r| civ.tech[**r].state >= ST_UNDERSTOOD).count();
        let revisit = civ.revisit_until.get(fi).map(|m| *m > w.month).unwrap_or(false);
        for &r in f.members.iter().filter(|m| **m != inc) {
            let mut e = 10_000 - 6_000 * share / 10_000;
            let mut wk = 10_000 + 5_000 * share / 10_000;
            for _ in 0..refuted {
                e += (10_000 - e) / 2;
                wk -= (wk - 10_000) / 2;
            }
            let mut cap = share >= CAP_SHARE_BP && refuted == 0;
            if c.techs[r].critical {
                e = e.max(CRITICAL_LOCK_E);
                wk = wk.min(CRITICAL_LOCK_W);
                cap = false;
            }
            if revisit {
                e = 10_000;
                cap = false;
            }
            l.evidence_bp[r] = e;
            l.work_bp[r] = wk;
            l.capped[r] = cap;
        }
    }
    l
}

/// Investigations a seat may run at once (design chapter 39, section 1.6):
/// `LINES_BASE + isqrt(research staff / LINES_STAFF)`, at most 24. Four times the
/// staff give twice the extra lines. Calibrated (slice 6b): the design's `2 +
/// isqrt(staff / 50,000)` assumed the research staff of design table 36 §3.1's
/// populations; with the staff these seats build it left a medieval seat with two
/// lines, and printing came seven centuries late.
pub const LINES_BASE: i64 = 4;
pub const LINES_STAFF: i64 = 10_000;
pub const LINES_MAX: i64 = 24;

pub fn investigation_lines(w: &World, seat: SeatId) -> u32 {
    let civ = &w.civs[seat as usize];
    let re = research_effectiveness(civ).max(1);
    let staff = civ.research_cap.iter().sum::<i64>() * 10_000 / re;
    (LINES_BASE + isqrt(staff / LINES_STAFF)).min(LINES_MAX) as u32
}

/// Whether a practice id exists in this content and the seat holds it established.
pub fn est_opt(civ: &Civ, id: &str) -> bool {
    content().prac_ix.get(id).map(|p| civ.established(*p)).unwrap_or(false)
}

/// Months without use after which a fragile node's know-how is lost (section 1.5).
pub const FRAGILE_MONTHS: Month = 1_200;

pub fn step(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let month = w.month;
    let installed = installed_base(w, seat);
    let lk = locks(w, seat, &installed);
    let revealed = w.civs[si].milestones.interstellar.is_some();

    // contact and trade context
    let met: Vec<usize> = (0..w.civs.len()).filter(|o| *o != si && w.civs[si].contacts[*o].met && w.civs[*o].status != SeatStatus::Eliminated).collect();
    let peaceful: Vec<usize> = met.iter().copied().filter(|o| !w.civs[si].contacts[*o].at_war).collect();
    let treaties = w.treaties.iter().filter(|t| t.status == "active" && t.parties.contains(&seat)).count() as i64;
    {
        let civ = &mut w.civs[si];
        civ.tag_activity[Tag::Trade as usize] += isqrt((peaceful.len() as i64 * 4 + treaties * 6) * 10_000);
    }
    // the Sky Terraces keep observations: a tenth more evidence in measurement
    let terraces = crate::sim::culture::belief_share(w, seat, "sky_terraces") > 2000;
    // one researcher-month of capacity is one person in a research post
    let research_staff: i64 = w.civs[si].research_cap.iter().sum::<i64>();
    let trickle = crate::sim::economy::activity_index(research_staff) / 5;
    let cross = w.civs[si].est_id("C030");
    let customs = w.civs[si].est_id("C012");
    let translation = w.civs[si].est_id("C024");
    let chan = channel_factor(w, seat);
    // contact: a peaceful partner that has prototyped a node passes on what it shows,
    // more with customs and translation; the volume of trade joins with the market
    let contact_bp = 5_000 + if customs { 2_500 } else { 0 } + if translation { 2_500 } else { 0 };
    let mut new_leads: Vec<usize> = Vec::new();
    let mut discovered: Vec<usize> = Vec::new();
    for i in 0..c.techs.len() {
        let state = w.civs[si].tech[i].state;
        if state > ST_HINTED {
            continue;
        }
        let tech = &c.techs[i];
        // sealed nodes are absent until the objective is revealed (chapter 39, 1.2)
        if tech.kind == crate::content::TechKind::Sealed && !revealed {
            continue;
        }
        if !tech.prereq.eval(&CivCtx { world: w, seat }) {
            continue;
        }
        let mut gain: i64 = 0;
        let mut best_tag = tech.tags[0];
        let mut best_act = -1;
        for t in &tech.tags {
            let a = w.civs[si].tag(*t);
            gain += a;
            if a > best_act {
                best_act = a;
                best_tag = *t;
            }
        }
        // P: practice in the node's domains
        let practice = gain / tech.tags.len() as i64 / 2;
        let mut channelled = practice * chan / 10_000;
        if terraces && tech.tags.contains(&Tag::Measure) {
            channelled = channelled * 11 / 10;
        }
        // a tradition branch node takes practice evidence only from its tradition's
        // works (slice 13); until traditions exist nobody practises it
        if tech.tradition.is_some() && tech.kind == crate::content::TechKind::Branch {
            channelled = 0;
        }
        gain = channelled + if tech.tradition.is_some() && tech.kind == crate::content::TechKind::Branch { 0 } else { trickle };
        if cross {
            gain = gain * 5 / 4;
        }
        // path dependence: people building on a rival stop asking this question
        gain = gain * lk.evidence_bp[i] / 10_000;
        // X: methods in use among peoples we are in touch with are noticed sooner
        let mut foreign: Option<usize> = None;
        for &o in &peaceful {
            if w.civs[o].tech[i].state >= ST_PROTOTYPED {
                gain += practice.max(100) * chan / 10_000 * contact_bp / 10_000;
                foreign.get_or_insert(o);
            }
        }
        let threshold = hint_threshold(w, i);
        let source = match foreign {
            Some(o) if best_act < 150 => format!("Reports from {}", w.civs[o].name),
            _ => format!("Practice: {}", best_tag.name().to_lowercase()),
        };
        let st = &mut w.civs[si].tech[i];
        st.evidence += gain;
        // the discovery cap: it stays a lead while a rival dominates, unless a
        // peaceful contact shows it in use
        if lk.capped[i] && foreign.is_none() {
            st.evidence = st.evidence.min(threshold * 5 / 2 - 1);
        }
        if st.state == ST_UNKNOWN && st.evidence >= threshold {
            st.state = ST_HINTED;
            st.disc_month = month;
            st.source = source;
            new_leads.push(i);
        } else if st.state == ST_HINTED && st.evidence >= threshold * 5 / 2 {
            st.state = ST_DISCOVERED;
            st.disc_month = month;
            discovered.push(i);
        }
    }
    if !new_leads.is_empty() {
        crate::sim::chronicle::tally(w, seat, "leads", new_leads.len() as u32);
    }
    for i in discovered {
        // a pending lead study on this node has nothing left to find
        w.civs[si].projects.retain(|p| p.kind != ProjKind::LeadStudy { tech: i });
        brief(w, seat, "info", format!("A method takes shape: {}", c.techs[i].name), "Accumulated experience identified a workable question. It can now be investigated.".into(), None, "knowledge");
    }

    // adoption follows actual operation
    let mut adopt: Vec<usize> = Vec::new();
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        for f in r.facilities.iter().filter(|f| f.operated && f.level > 0) {
            let def = &c.facilities[f.kind];
            def.req.techs(&mut adopt);
            if let Some(run) = &f.run {
                def.recipes[run.recipe].req.techs(&mut adopt);
            }
        }
    }
    for a in w.armies.iter().filter(|a| a.owner == seat) {
        c.unit_tiers[a.tier as usize].req.techs(&mut adopt);
    }
    for t in adopt {
        let st = &mut w.civs[si].tech[t];
        st.used_month = month;
        if st.state >= ST_UNDERSTOOD && st.state < ST_ADOPTED {
            st.state = ST_ADOPTED;
        }
    }

    // fragile know-how (design chapter 39, section 1.5): unused for a century
    // without archives or monastic orders, it falls back to a discovered method; the
    // evidence stays and relearning takes half the work
    let keepers = est_opt(&w.civs[si], "C013") || est_opt(&w.civs[si], "C088");
    if !keepers && month % 12 == 0 {
        let mut lost = Vec::new();
        for (i, _) in c.techs.iter().enumerate().filter(|(_, t)| t.fragile && !t.critical) {
            let st = &w.civs[si].tech[i];
            if st.state >= ST_UNDERSTOOD && month >= st.used_month.max(st.und_month) + FRAGILE_MONTHS {
                lost.push(i);
            }
        }
        for i in lost {
            let st = &mut w.civs[si].tech[i];
            st.state = ST_DISCOVERED;
            st.work = 0;
            st.discount_bp = st.discount_bp.max(5_000);
            brief(w, seat, "warning", format!("Know-how lost: {}", c.techs[i].name), "Nobody has practised it for a century and no archive kept the method. It can be relearned for half the work.".into(), None, "knowledge");
        }
    }

    milestones(w, seat);
}

fn milestones(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let capital = w.civs[si].capital;
    if w.civs[si].milestones.sci_method.is_none() && w.civs[si].knows_id("T049") && w.civs[si].est_id("C013") {
        let lab = c.f("laboratory");
        let working = w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(lab).map(|f| f.operated).unwrap_or(false));
        if working {
            w.civs[si].milestones.sci_method = Some(month);
            moment(w, seat, MomentCategory::Knowledge, "The scientific method takes hold".into(),
                "Measurement, kept records, repeatable experiment and independent checking now work together as institutions. Systematic research programmes and research institutes become possible.".into(),
                Some(capital), "measure", true, vec![format!("Laboratory, archive and reproducible methods all functioning in {when}")]);
            brief(w, seat, "good", "Scientific method established".into(), "Research institutes can now be founded and technology becomes an explicit agenda.".into(), None, "knowledge");
        }
    }
    if w.civs[si].milestones.planetary.is_none() && w.civs[si].knows_id("T047") && w.civs[si].knows_id("T104") && w.civs[si].knows_id("T100") {
        w.civs[si].milestones.planetary = Some(month);
        // Astronomy, radio and geodesy give a coarse picture of the whole world.
        for ri in 0..w.regions.len() {
            let owner = w.regions[ri].owner;
            let mem = &mut w.civs[si].memory[ri];
            if !mem.seen {
                mem.seen = true;
                mem.last_seen = month;
                mem.owner = owner;
            }
        }
        for o in 0..w.civs.len() {
            if o != si && w.civs[o].status != SeatStatus::Eliminated {
                crate::sim::knowledge::meet(w, seat, o as SeatId);
            }
        }
        moment(w, seat, MomentCategory::Knowledge, "A planetary perspective".into(),
            "Astronomical models, electrical power and wireless signals let surveyors fix every coast and range. The whole world is now on the map, if only in outline.".into(),
            Some(capital), "globe", true, vec![format!("World outline compiled in {when}")]);
    }
    if w.civs[si].milestones.interstellar.is_none() && w.civs[si].knows_id("T162") {
        w.civs[si].milestones.interstellar = Some(month);
        moment(w, seat, MomentCategory::Endgame, "Interstellar feasibility".into(),
            "A repeatable spacetime anomaly has been reproduced under controlled conditions. An engineering assessment now sets out exactly what a working jump capability, and a world able to sustain it, would require.".into(),
            Some(capital), "jump", true, vec![format!("Anomaly reproduced in {when}"), "Complete acceptance requirements issued".into()]);
        brief(w, seat, "good", "The final objective is revealed".into(), "Open the objectives panel: sustained jump capability for the whole military system, and real governance of the whole inhabited world, are both required.".into(), None, "objectives");
    }
}
