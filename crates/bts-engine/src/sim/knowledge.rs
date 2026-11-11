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

fn hint_threshold(w: &World, tier: u8) -> i64 {
    muldiv(900 * (tier as i64 + 1), w.cfg.pace_bp as i64, 10_000)
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
pub fn study_result(w: &mut World, seat: SeatId, tag: usize) -> u32 {
    let c = content();
    let month = w.month;
    let t = Tag::ALL[tag];
    let mut eligible: Vec<usize> = (0..c.techs.len())
        .filter(|i| w.civs[seat as usize].tech[*i].state == ST_UNKNOWN && c.techs[*i].tags.contains(&t) && c.techs[*i].prereq.eval(&CivCtx { world: w, seat }))
        .collect();
    eligible.sort_by_key(|i| (c.techs[*i].tier, *i));
    let mut found = 0;
    for i in eligible.into_iter().take(2) {
        let st = &mut w.civs[seat as usize].tech[i];
        st.state = ST_HINTED;
        st.evidence = hint_threshold_static(c.techs[i].tier);
        st.source = format!("Exploratory study of {}", t.name().to_lowercase());
        st.disc_month = month;
        found += 1;
    }
    found
}

fn hint_threshold_static(tier: u8) -> i64 {
    900 * (tier as i64 + 1)
}

pub fn step(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let month = w.month;

    // contact and trade context
    let met: Vec<usize> = (0..w.civs.len()).filter(|o| *o != si && w.civs[si].contacts[*o].met && w.civs[*o].status != SeatStatus::Eliminated).collect();
    let peaceful: Vec<usize> = met.iter().copied().filter(|o| !w.civs[si].contacts[*o].at_war).collect();
    let treaties = w.treaties.iter().filter(|t| t.status == "active" && t.parties.contains(&seat)).count() as i64;
    {
        let civ = &mut w.civs[si];
        civ.tag_activity[Tag::Trade as usize] += isqrt((peaceful.len() as i64 * 4 + treaties * 6) * 10_000);
    }
    if crate::sim::culture::belief_share(w, seat, "sky_terraces") > 2000 {
        w.civs[si].tag_activity[Tag::Measure as usize] += 200;
    }
    // one researcher-month of capacity is one person in a research post
    let research_staff: i64 = w.civs[si].research_cap.iter().sum::<i64>();
    let trickle = crate::sim::economy::activity_index(research_staff) / 5;
    let cross = w.civs[si].est_id("C030");
    let customs = w.civs[si].est_id("C012");
    let translation = w.civs[si].est_id("C024");

    let mut new_leads: Vec<usize> = Vec::new();
    let mut discovered: Vec<usize> = Vec::new();
    for i in 0..c.techs.len() {
        let state = w.civs[si].tech[i].state;
        if state > ST_HINTED {
            continue;
        }
        let tech = &c.techs[i];
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
        gain = gain / tech.tags.len() as i64 / 2 + trickle;
        if cross {
            gain = gain * 5 / 4;
        }
        // methods in use among peoples we are in touch with are noticed sooner
        let mut foreign: Option<usize> = None;
        for &o in &peaceful {
            if w.civs[o].tech[i].state >= ST_PROTOTYPED {
                gain += 110 + if customs { 110 } else { 0 } + if translation { 110 } else { 0 };
                foreign = Some(o);
                break;
            }
        }
        let threshold = hint_threshold(w, tech.tier);
        let source = match foreign {
            Some(o) if best_act < 150 => format!("Reports from {}", w.civs[o].name),
            _ => format!("Practice: {}", best_tag.name().to_lowercase()),
        };
        let st = &mut w.civs[si].tech[i];
        st.evidence += gain;
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
        if st.state >= ST_UNDERSTOOD && st.state < ST_ADOPTED {
            st.state = ST_ADOPTED;
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
