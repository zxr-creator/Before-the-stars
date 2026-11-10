//! Practices, slow cultural drift, stability and fictional religions.
//!
//! The eight tendencies are private. They change participation and adoption
//! speed; they never multiply output, research or combat a second time.

use crate::content::{content, Cap, BELIEFS, BELIEF_SLOTS, RELIGION_SLOTS};
use crate::sim::chronicle::{brief, moment};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

const REL_A: &[&str] = &["Ember", "Tide", "Lantern", "Reed", "Quiet", "Bright", "Ash", "Hollow", "Clear", "Grain", "Stone", "Swift", "Winter", "Open"];
const REL_B: &[&str] = &["Covenant", "Path", "Measure", "Hearth", "Return", "Watch", "Fellowship", "Chorus", "Circle", "Accord", "Vigil", "Radiance"];

/// A local movement can start in a region of this many residents once customs of
/// sharing exist, or of `MOVEMENT_RESIDENTS_ALONE` without them.
const MOVEMENT_RESIDENTS: u32 = 500_000;
const MOVEMENT_RESIDENTS_ALONE: u32 = 900_000;
/// Participants a movement starts with and never falls below.
const MOVEMENT_SEED: u32 = 30_000;
const MOVEMENT_FLOOR: i64 = 10_000;
/// Trained organizers (lorekeepers, scribes, teachers) a recognized founder needs.
const MOVEMENT_ORGANIZERS: u32 = 6_000;
/// Regions smaller than this are not reached by a spreading religion.
const SPREAD_MIN_RESIDENTS: i64 = 20_000;

pub fn region_belief(religions: &[Religion], r: &Region, key: &str) -> bool {
    r.cap(Cap::Sacred) > 0 && religions.iter().any(|rel| rel.holy_region == r.id && rel.beliefs.iter().any(|b| b == key))
}

/// Share (basis points) of a civilization's residents following a religion with the belief.
pub fn belief_share(w: &World, seat: SeatId, key: &str) -> i64 {
    if w.religions.is_empty() {
        return 0;
    }
    let ids: Vec<u16> = w.religions.iter().enumerate().filter(|(_, r)| r.beliefs.iter().any(|b| b == key)).map(|(i, _)| i as u16).collect();
    if ids.is_empty() {
        return 0;
    }
    let mut total = 0i64;
    let mut with = 0i64;
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        for b in &r.blocks {
            let n = b.total() as i64;
            total += n;
            if b.religion.map(|x| ids.contains(&x)).unwrap_or(false) {
                with += n;
            }
        }
    }
    if total == 0 { 0 } else { with * 10_000 / total }
}

pub fn admin_capacity(w: &World, seat: SeatId) -> u16 {
    let civ = &w.civs[seat as usize];
    let mut cap: i64 = 3;
    for (id, add) in [("C011", 1), ("C020", 2), ("C041", 4), ("C042", 3), ("C050", 6), ("C053", 12)] {
        if civ.est_id(id) {
            cap += add;
        }
    }
    cap += w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.cap(Cap::Admin) / 1000).sum::<i64>();
    cap.min(200) as u16
}

pub fn admin_load(w: &World, seat: SeatId) -> u16 {
    w.regions.iter().filter(|r| r.controller == Some(seat) && r.population() > 0).count() as u16
}

fn convert(r: &mut Region, to: u16, count: u32) -> u32 {
    let pool: u32 = r.blocks.iter().filter(|b| b.religion != Some(to)).map(|b| b.total()).sum();
    if pool == 0 || count == 0 {
        return 0;
    }
    let count = count.min(pool);
    let mut moved = 0;
    let mut rem: u64 = 0;
    let mut incoming: Vec<PopBlock> = Vec::new();
    for b in r.blocks.iter_mut().filter(|b| b.religion != Some(to)) {
        let mut out = PopBlock::new(b.lineage, Some(to));
        out.birth_hist = b.birth_hist;
        for age in 0..AGES {
            let have = b.ages[age] as u64;
            let x = have * count as u64 + rem;
            let take = (x / pool as u64).min(have) as u32;
            rem = x % pool as u64;
            b.ages[age] -= take;
            out.ages[age] += take;
            moved += take;
        }
        if out.total() > 0 {
            incoming.push(out);
        }
    }
    for out in incoming {
        if let Some(b) = r.blocks.iter_mut().find(|b| b.lineage == out.lineage && b.religion == Some(to)) {
            for age in 0..AGES {
                b.ages[age] += out.ages[age];
            }
        } else {
            r.blocks.push(out);
        }
    }
    r.blocks.retain(|b| b.total() > 0);
    moved
}

pub fn movement_requirements(stage: u8) -> (i64, &'static str) {
    match stage {
        0 => (150, "Choose a local tradition (one follower practice)"),
        1 => (0, "Build a sacred precinct where the movement gathers"),
        2 => (900, "A recognized founder will emerge once devotion and organizers suffice"),
        3 => (0, "Found the religion: choose one belief of each kind"),
        _ => (0, ""),
    }
}

/// Completion of a `Religion` project: pantheon choice or formal founding.
pub fn advance_movement(w: &mut World, seat: SeatId, beliefs: Vec<String>, name: Option<String>) {
    let si = seat as usize;
    let month = w.month;
    let Some(mv) = w.civs[si].movement.clone() else { return };
    match mv.stage {
        0 => {
            let pick = beliefs.first().cloned().unwrap_or_else(|| "remembrance".into());
            let bname = BELIEFS.iter().find(|b| b.key == pick).map(|b| b.name).unwrap_or("a local tradition");
            let m = w.civs[si].movement.as_mut().unwrap();
            m.stage = 1;
            m.pantheon = Some(pick);
            let rname = w.regions[mv.region as usize].name.clone();
            moment(w, seat, MomentCategory::Religion, format!("A tradition forms at {rname}"),
                format!("Gatherings at {rname} settled on a shared practice: {bname}. It is a local tradition, not yet a founded religion."),
                Some(mv.region), "shrine", false, vec![format!("Recorded in month {month}")]);
        }
        3 => {
            if w.religions.len() as u8 >= RELIGION_SLOTS || w.civs[si].founded_religion {
                brief(w, seat, "warning", "Founding failed".into(), "Every founding opportunity in this world has been taken. The movement remains a local tradition.".into(), Some(mv.region), "culture");
                return;
            }
            let mut chosen: Vec<String> = Vec::new();
            for slot in BELIEF_SLOTS {
                let pick = beliefs
                    .iter()
                    .find(|k| BELIEFS.iter().any(|b| b.key == k.as_str() && b.slot == slot))
                    .cloned()
                    .unwrap_or_else(|| BELIEFS.iter().find(|b| b.slot == slot).unwrap().key.to_string());
                chosen.push(pick);
            }
            let id = w.religions.len() as u16;
            let rname = match name {
                Some(n) if !n.trim().is_empty() => n.trim().chars().take(48).collect::<String>(),
                _ => {
                    let a = REL_A[draw_range(w.secret, &[stream("relname"), seat as u64, 0], REL_A.len() as u64) as usize];
                    let b = REL_B[draw_range(w.secret, &[stream("relname"), seat as u64, 1], REL_B.len() as u64) as usize];
                    format!("The {a} {b}")
                }
            };
            w.religions.push(Religion { name: rname.clone(), founder: seat, founded: month, holy_region: mv.region, beliefs: chosen });
            w.civs[si].founded_religion = true;
            let converts = mv.participants;
            convert(&mut w.regions[mv.region as usize], id, converts);
            let converts = group(converts as i64);
            let m = w.civs[si].movement.as_mut().unwrap();
            m.stage = 4;
            m.religion = Some(id);
            let place = w.regions[mv.region as usize].name.clone();
            moment(w, seat, MomentCategory::Religion, format!("{rname} is founded"),
                format!("At {place} the movement declared its obligations, practices and rites. They are now fixed; its followers and organizations will keep changing."),
                Some(mv.region), "shrine", true, vec![format!("Founded in month {month}"), format!("{converts} founding adherents")]);
            // others who are in contact hear of it
            for o in 0..w.civs.len() {
                if o != si && w.civs[o].contacts[si].met {
                    let who = w.civs[si].name.clone();
                    crate::sim::chronicle::reported(w, o as SeatId, MomentCategory::Religion, format!("{rname} founded among the {who}"),
                        format!("Travellers report that a religion called {rname} has been founded at {place}."), None, "shrine", vec![format!("Reported in month {month}")]);
                }
            }
        }
        _ => {}
    }
}

pub fn step(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let month = w.month;
    let pop = w.civ_population(seat) as i64;
    let lineage = w.civs[si].lineage as usize;
    let axes = w.lineages[lineage].axes;

    // ---- stability ----------------------------------------------------------
    let (food, water, weariness) = (w.civs[si].food_ful_bp as i64, w.civs[si].water_ful_bp as i64, w.civs[si].war_weariness as i64);
    let load = admin_load(w, seat) as i64;
    let cap = admin_capacity(w, seat) as i64;
    let occupied = w.regions.iter().filter(|r| r.controller == Some(seat) && r.owner != Some(seat)).count() as i64;
    let mut target: i64 = 64;
    target += ((food - 9500) / 100).clamp(-30, 5);
    target += ((water - 9500) / 150).clamp(-15, 3);
    target -= weariness / 2;
    target -= occupied * 3;
    target -= (load - cap).max(0) * 4;
    for (id, add) in [("C011", 4), ("C015", 3), ("C020", 3), ("C034", 3), ("C039", 4), ("C040", 5), ("C036", 2)] {
        if w.civs[si].est_id(id) {
            target += add;
        }
    }
    if belief_share(w, seat, "remembrance") > 3000 {
        target += 3;
    }
    if belief_share(w, seat, "open_courts") > 3000 {
        target += 2;
    }
    let target = target.clamp(5, 95);
    {
        let civ = &mut w.civs[si];
        let s = civ.stability as i64;
        civ.stability = (s + (target - s).clamp(-2, 1)) as u8;
        if civ.war_weariness > 0 && month % 3 == 0 {
            civ.war_weariness -= 1;
        }
    }
    let stability = w.civs[si].stability as i64;
    if stability == 30 && target < 30 {
        brief(w, seat, "danger", "Public order is failing".into(), "Cooperation with the government is collapsing. Less labour answers calls and unrest is spreading.".into(), None, "politics");
    }
    for r in w.regions.iter_mut().filter(|r| r.controller == Some(seat)) {
        let u = r.unrest_bp as i64;
        let nu = if r.owner != Some(seat) {
            (u - 40).max(2500)
        } else if stability < 35 {
            (u + 60).min(3500)
        } else {
            (u - 120).max(0)
        };
        r.unrest_bp = nu as u16;
    }

    // ---- practices: recognition and gradual adoption --------------------------
    let peaceful: Vec<usize> = (0..w.civs.len()).filter(|o| *o != si && w.civs[si].contacts[*o].met && !w.civs[si].contacts[*o].at_war).collect();
    let record = w.civs[si].tag(crate::content::Tag::Record);
    let customs = w.civs[si].est_id("C012");
    let mut recognized: Vec<usize> = Vec::new();
    let mut established: Vec<usize> = Vec::new();
    for i in 0..c.practices.len() {
        let p = &c.practices[i];
        let state = w.civs[si].practice[i].state;
        if state == 0 {
            // an organizational idea is worked out by people already living with what it builds on
            if !p.prereq.eval(&PracEnactedCtx { world: w, seat, recognized_only: false }) {
                continue;
            }
            // the index counts thousands of people, so its pace does not depend on the unit of account
            let mut gain = isqrt(pop / 1000) * 7 + record / 3 + 40;
            for &o in &peaceful {
                if w.civs[o].practice[i].state >= 3 {
                    gain += if customs { 220 } else { 110 };
                    break;
                }
            }
            let threshold = muldiv(p.evidence_needed, w.cfg.pace_bp as i64, 10_000);
            let st = &mut w.civs[si].practice[i];
            st.evidence += gain;
            if st.evidence >= threshold {
                st.state = 1;
                st.rec_month = month;
                st.source = "Local experience".into();
                recognized.push(i);
            }
        } else if state == 3 {
            let before = w.civs[si].practice[i].adoption_bp;
            if before < 10_000 {
                let aff = axes[p.affinity] as i64;
                let mut rate = 130 * (5000 + aff) / 10_000;
                rate = rate * stability.clamp(30, 84) / 70;
                let st = &mut w.civs[si].practice[i];
                st.adoption_bp = (before as i64 + rate.max(20)).min(10_000) as u16;
                if before < ESTABLISHED_BP && st.adoption_bp >= ESTABLISHED_BP {
                    established.push(i);
                }
            }
        }
    }
    if !recognized.is_empty() {
        let names: Vec<&str> = recognized.iter().take(3).map(|i| c.practices[*i].name.as_str()).collect();
        brief(w, seat, "info", format!("New practice recognized: {}", names.join(", ")), "People have worked out an organizational idea. A reform can make it an institution once its real requirements are met.".into(), None, "culture");
    }
    for i in established {
        let p = &c.practices[i];
        let capital = w.civs[si].capital;
        moment(w, seat, MomentCategory::Culture, format!("{} takes root", p.name),
            format!("Enough people now take part for this to be an ordinary part of life. {}", if p.effect.is_empty() { p.behavior.clone() } else { p.effect.to_string() }),
            Some(capital), "assembly_hall", p.group_ix >= 2, vec![format!("Participation passed a quarter of the population in month {month}")]);
        brief(w, seat, "good", format!("Established: {}", p.name), p.effect.to_string(), None, "culture");
    }

    // ---- religion: emergence and growth of a local movement ---------------------
    if w.civs[si].movement.is_none() {
        let big = w.regions.iter().filter(|r| r.owner == Some(seat)).max_by_key(|r| (r.population(), r.id));
        if let Some(r) = big {
            let ready = r.population() >= MOVEMENT_RESIDENTS && month >= 60 && (w.civs[si].est_id("C004") || w.civs[si].est_id("C015") || r.population() >= MOVEMENT_RESIDENTS_ALONE);
            if ready && draw_range(w.secret, &[stream("movement"), seat as u64, month as u64], 100) < 2 {
                let (rid, rname) = (r.id, r.name.clone());
                w.civs[si].movement = Some(Movement { region: rid, stage: 0, participants: MOVEMENT_SEED, devotion: 0, pantheon: None, religion: None, started: month });
                moment(w, seat, MomentCategory::Religion, format!("Gatherings at {rname}"),
                    format!("People at {rname} have begun to meet regularly for remembrance and shared rites. Nobody has founded a religion; the government may support the gatherings, leave them alone, or ignore them."),
                    Some(rid), "shrine", false, vec![format!("First recorded in month {month}")]);
                brief(w, seat, "info", format!("A movement is gathering at {rname}"), "See the culture panel. Supporting it is optional; a secular path remains fully viable.".into(), Some(rid), "culture");
            }
        }
    } else {
        let mv = w.civs[si].movement.clone().unwrap();
        let ri = mv.region as usize;
        if w.regions[ri].controller == Some(seat) {
            let rpop = w.regions[ri].population() as i64;
            let m = w.civs[si].movement.as_mut().unwrap();
            if m.stage < 4 {
                let goal = rpop / 4;
                m.participants = (m.participants as i64 + ((goal - m.participants as i64) / 40).max(1000)).clamp(MOVEMENT_FLOOR, goal.max(MOVEMENT_FLOOR)) as u32;
                // devotion grows with every forty thousand participants
                m.devotion = (m.devotion + m.participants as i64 / 40_000 + 1).min(5000);
            }
            if m.stage == 1 && w.regions[ri].cap(Cap::Sacred) > 0 {
                m.stage = 2;
            }
            if m.stage == 2 && m.devotion >= movement_requirements(2).0 {
                let organizers = w.regions[ri].quals[Qual::Lorekeeper.index()] + w.regions[ri].quals[Qual::Scribe.index()] + w.regions[ri].quals[Qual::Teacher.index()];
                if organizers >= MOVEMENT_ORGANIZERS {
                    m.stage = 3;
                    let rname = w.regions[ri].name.clone();
                    brief(w, seat, "info", "A founder is recognized".into(), format!("The movement at {rname} now has a recognized founder and trained organizers. It can be formally founded while a founding opportunity remains."), Some(mv.region), "culture");
                }
            }
        }
    }
    // copy houses: the posts of a staffed precinct copy texts onto writing material.
    // It is production like the scriptorium's, by the people actually at work there
    // this month and from material actually taken from stock.
    if belief_share(w, seat, "copy_houses") > 0 {
        let precinct = c.f("holy_site");
        let mut want: i64 = 0;
        for r in w.regions.iter().filter(|r| r.controller == Some(seat) && region_belief(&w.religions, r, "copy_houses")) {
            if let Some(f) = r.fac(precinct) {
                if f.enabled && f.level > 0 && f.staff_needed > 0 {
                    want += COPY_HOUSE_LOTS * f.staffed.min(f.staff_needed) as i64 / f.staff_needed as i64;
                }
            }
        }
        if want > 0 {
            let material = (want + COPY_HOUSE_LOTS_PER_TONNE - 1) / COPY_HOUSE_LOTS_PER_TONNE;
            let got = w.civs[si].take(Good::Materials, material);
            w.civs[si].add(Good::Media, want * got / material);
        }
    }
}

/// Media lots a fully staffed precinct with copy houses makes in a month, and the
/// lots a tonne of writing material gives (the scriptorium's hand-copying ratio).
pub const COPY_HOUSE_LOTS: i64 = 2000;
pub const COPY_HOUSE_LOTS_PER_TONNE: i64 = 3;

/// World-level cultural processes: religious spread and lineage drift.
pub fn step_world(w: &mut World) {
    let month = w.month;
    // ---- spread of founded religions ----------------------------------------------
    for id in 0..w.religions.len() {
        let beliefs = w.religions[id].beliefs.clone();
        let has = |k: &str| beliefs.iter().any(|b| b == k);
        let local_rate: i64 = if has("hearth_rites") { 70 } else { 35 }; // basis points of non-followers per month
        let neighbor_rate: i64 = if has("wayfarers") { 30 } else { 12 };
        let n = w.regions.len();
        let mut share = vec![0i64; n];
        for (ri, r) in w.regions.iter().enumerate() {
            let pop = r.population() as i64;
            if pop > 0 {
                let f: i64 = r.blocks.iter().filter(|b| b.religion == Some(id as u16)).map(|b| b.total() as i64).sum();
                share[ri] = f * 10_000 / pop;
            }
        }
        for ri in 0..n {
            let pop = w.regions[ri].population() as i64;
            if pop < SPREAD_MIN_RESIDENTS {
                continue;
            }
            let mut rate = 0;
            if share[ri] > 0 && share[ri] < 8500 {
                rate += local_rate;
            }
            if share[ri] < 6000 && w.regions[ri].neighbors.iter().any(|(nb, _)| share[*nb as usize] > 2000) {
                rate += neighbor_rate;
            }
            if rate == 0 {
                continue;
            }
            let x = (pop - pop * share[ri] / 10_000) * rate;
            let count = (x / 10_000) as u32;
            if count > 0 {
                convert(&mut w.regions[ri], id as u16, count);
            } else if draw_range(w.secret, &[stream("convert"), id as u64, ri as u64, month as u64], 10_000) < (x % 10_000) as u64 {
                convert(&mut w.regions[ri], id as u16, 1);
            }
        }
    }

    // ---- slow drift of tendencies ----------------------------------------------------
    for li in 0..w.lineages.len() {
        let home = w.lineages[li].home as usize;
        if w.civs[home].status == SeatStatus::Eliminated {
            continue;
        }
        let seat = home as SeatId;
        let civ = &w.civs[home];
        let working = civ.labor.working_age.max(1) as i64;
        let food_share = civ.labor.food as i64 * 10_000 / working;
        let fac_share = civ.labor.facilities as i64 * 10_000 / working;
        // one researcher-month of capacity is one person in a research post
        let learn_share = (civ.labor.students as i64 + civ.research_cap.iter().sum::<i64>()) * 10_000 / working;
        let soldier_share = civ.labor.soldiers as i64 * 10_000 / working;
        let met = civ.contacts.iter().filter(|c| c.met).count() as i64;
        let at_war = civ.contacts.iter().any(|c| c.at_war);
        let treaties = w.treaties.iter().filter(|t| t.status == "active" && t.parties.contains(&seat)).count() as i64;
        let exploring = civ.projects.iter().any(|p| matches!(p.kind, ProjKind::Survey { .. } | ProjKind::Settle { .. }));
        let regions = w.regions.iter().filter(|r| r.controller == Some(seat)).count() as i64;
        let pop = w.civ_population(seat).max(1) as i64;
        let urban: i64 = w.regions.iter().filter(|r| r.controller == Some(seat) && r.population() >= URBAN_RESIDENTS).map(|r| r.population() as i64).sum();
        let targets: [i64; 8] = [
            (4000 + 700 * met + 500 * treaties.min(4)).min(9000),
            (3500 + learn_share * 3).min(9000),
            (4000 + if exploring { 1500 } else { 0 } + 250 * regions.min(10)).min(8500),
            (3000 + food_share * 6 / 10).min(9000),
            (3000 + fac_share * 12 / 10).min(9000),
            (3000 + urban * 6000 / pop).min(9000),
            (3500 + 800 * treaties.min(5) + 300 * met).min(9000),
            (3500 + soldier_share * 4 + if at_war { 2000 } else { 0 }).min(9000),
        ];
        let crisis = civ.famine_streak > 3 || at_war;
        let (step_cap, year_cap) = if crisis { (40, 500) } else { (12, 150) };
        let l = &mut w.lineages[li];
        if month % 12 == 0 {
            l.drift_year = [0; 8];
        }
        for k in 0..8 {
            let cur = l.axes[k] as i64;
            let mut d = (targets[k] - cur).clamp(-step_cap, step_cap);
            let used = l.drift_year[k] as i64;
            // rolling yearly limit
            if (used + d).abs() > year_cap {
                d = if d > 0 { (year_cap - used).max(0) } else { (-year_cap - used).min(0) };
            }
            l.axes[k] = (cur + d).clamp(500, 9500) as i32;
            l.drift_year[k] = (used + d) as i32;
            // named traits need sustained behaviour
            if l.axes[k] >= 6500 {
                l.trait_streak[k] = l.trait_streak[k].saturating_add(1);
                if l.trait_streak[k] >= 60 && l.trait_since[k].is_none() {
                    l.trait_since[k] = Some(month);
                }
            } else if l.axes[k] < 6000 {
                l.trait_streak[k] = l.trait_streak[k].saturating_sub(1);
                if l.trait_streak[k] == 0 {
                    l.trait_since[k] = None;
                }
            }
        }
    }
}
