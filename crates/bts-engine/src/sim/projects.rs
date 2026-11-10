//! Projects (construction, research, surveys, settlement, reform, recruitment,
//! jump trials) and education programmes. Work comes from real labour or real
//! research staff; inputs are committed from stock and never refunded.

use crate::content::{content, Cap, Tag};
use crate::sim::chronicle::{brief, moment};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

/// Learners a founding cohort can hold when nobody qualified can teach it.
pub const FOUNDING_COHORT_MAX: i64 = 4_000;
/// Teaching places a precinct of the Teaching Order hosts.
const TEACHING_ORDER_PLACES: i64 = 16_000;

pub fn uses_labor(kind: &ProjKind) -> bool {
    !matches!(kind, ProjKind::Research { .. } | ProjKind::LeadStudy { .. } | ProjKind::Study { .. })
}

pub fn project_class(w: &World, seat: SeatId, kind: &ProjKind) -> Option<ResearchClass> {
    let c = content();
    match kind {
        ProjKind::Research { tech } | ProjKind::LeadStudy { tech } => Some(c.techs[*tech].class),
        ProjKind::Study { .. } => Some(study_class(w, seat)),
        _ => None,
    }
}

pub fn study_class(w: &World, seat: SeatId) -> ResearchClass {
    let civ = &w.civs[seat as usize];
    if civ.milestones.sci_method.is_some() {
        ResearchClass::Scientific
    } else if civ.knows_id("T045") {
        ResearchClass::Scholarly
    } else {
        ResearchClass::Craft
    }
}

pub fn project_title(w: &World, kind: &ProjKind, region: Option<RegionId>) -> String {
    let c = content();
    let rn = |r: RegionId| w.regions[r as usize].name.clone();
    match kind {
        ProjKind::Build { facility, levels } => {
            let place = region.map(rn).unwrap_or_default();
            if *levels > 1 {
                format!("Build {} ×{} in {}", c.facilities[*facility].name, levels, place)
            } else {
                format!("Build {} in {}", c.facilities[*facility].name, place)
            }
        }
        ProjKind::Research { tech } => format!("Investigate: {}", c.techs[*tech].name),
        ProjKind::LeadStudy { .. } => "Follow up a lead".to_string(),
        ProjKind::Survey { region } => format!("Survey {}", rn(*region)),
        ProjKind::Settle { to, people, .. } => format!("Settle {} with {} people", rn(*to), group(*people as i64)),
        ProjKind::Study { tag } => format!("Exploratory study: {}", Tag::ALL[*tag].name()),
        ProjKind::Resettle { from, to, people } => format!("Move {} people from {} to {}", group(*people as i64), rn(*from), rn(*to)),
        ProjKind::Recruit { role, soldiers, tier } => format!("Raise {} {} ({})", group(*soldiers as i64), c.unit_tiers[*tier as usize].roles[role.index()], region.map(rn).unwrap_or_default()),
        ProjKind::Reform { practice } => format!("Reform: {}", c.practices[*practice].name),
        ProjKind::Religion { .. } => "Advance the local movement".to_string(),
        ProjKind::FtlTrial => "Loaded jump round trip".to_string(),
        ProjKind::FtlDeployment => "Three-node deployment exercise".to_string(),
        ProjKind::FtlReplacement => "Assembly replacement and crew relief".to_string(),
    }
}

pub fn step(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let c = content();
    let mut order: Vec<usize> = (0..w.civs[si].projects.len()).collect();
    order.sort_by_key(|i| (w.civs[si].projects[*i].priority, w.civs[si].projects[*i].id));
    let mut pools = w.civs[si].research_cap.clone();
    let mut used = vec![0i64; ResearchClass::COUNT];
    let mut done: Vec<u32> = Vec::new();
    let mut failed: Vec<(u32, String)> = Vec::new();

    for i in order {
        let (kind, region, paused) = {
            let p = &w.civs[si].projects[i];
            (p.kind.clone(), p.region, p.paused)
        };
        if paused {
            w.civs[si].projects[i].last_progress = 0;
            continue;
        }
        let mut blockers: Vec<String> = Vec::new();
        // The site must still be governed.
        if let Some(r) = region {
            if w.regions[r as usize].controller != Some(seat) {
                failed.push((w.civs[si].projects[i].id, "the site is no longer under our control".into()));
                continue;
            }
        }
        // Knowledge prerequisites must hold while work continues.
        if let ProjKind::Research { tech } = &kind {
            let site_ok = tech_site_ok(w, seat, *tech);
            if !c.techs[*tech].prereq.eval(&CivCtx { world: w, seat }) || !site_ok {
                blockers.push(if site_ok { "Investigators lack knowledge this work depends on".into() } else { format!("Needs a working {}", c.facilities[c.f(c.techs[*tech].needs_facility.unwrap())].name.to_lowercase()) });
                let p = &mut w.civs[si].projects[i];
                p.blockers = blockers;
                p.last_progress = 0;
                continue;
            }
        }
        // Commit inputs from stock.
        let mut frac_bp: i64 = 10_000;
        {
            let civ = &mut w.civs[si];
            let mut inputs = std::mem::take(&mut civ.projects[i].inputs);
            for (g, needed, committed) in inputs.iter_mut() {
                if *committed < *needed {
                    let got = civ.take(*g, *needed - *committed);
                    *committed += got;
                }
                if *needed > 0 {
                    let f = ratio_bp(*committed, *needed);
                    if f < 10_000 {
                        blockers.push(format!("Waiting for {}", g.label().to_lowercase()));
                    }
                    frac_bp = frac_bp.min(f);
                }
            }
            civ.projects[i].inputs = inputs;
        }
        let (work_needed, work_done, max_pm) = {
            let p = &w.civs[si].projects[i];
            (p.work_needed, p.work_done, p.max_per_month)
        };
        let allowed = (work_needed * frac_bp / 10_000 - work_done).max(0);
        let want = (work_needed - work_done).min(max_pm).max(0);
        let mut progress = want.min(allowed);
        if let Some(class) = project_class(w, seat, &kind) {
            let mut got = 0;
            for k in class.index()..ResearchClass::COUNT {
                let take = (progress - got).min(pools[k]);
                pools[k] -= take;
                used[k] += take;
                got += take;
                if got >= progress {
                    break;
                }
            }
            if got < progress {
                blockers.push(format!("Not enough {} capacity", class.label().to_lowercase()));
            }
            progress = got;
        } else if let Some(r) = region {
            // work is done only by the workers called up in the project's region this month
            let free = w.regions[r as usize].last.project_labor_free.max(0);
            if free < progress {
                blockers.push(format!("Little labour can be called up in {}", w.regions[r as usize].name));
            }
            progress = progress.min(free);
            w.regions[r as usize].last.project_labor_free -= progress;
            w.regions[r as usize].last.project_work_done += progress;
        } else {
            // work without a place to do it has nobody to do it
            progress = 0;
        }
        let p = &mut w.civs[si].projects[i];
        p.work_done += progress;
        p.last_progress = progress;
        p.blockers = blockers;
        if let ProjKind::Research { tech } = &kind {
            let done_now = w.civs[si].projects[i].work_done;
            let t = &mut w.civs[si].tech[*tech];
            if t.state == ST_DISCOVERED && progress > 0 {
                t.state = ST_INVESTIGATING;
            }
            t.work = done_now;
        }
        let p = &w.civs[si].projects[i];
        if p.work_done >= p.work_needed && frac_bp >= 10_000 {
            done.push(p.id);
        }
    }
    w.civs[si].research_used = used;

    for (id, why) in failed {
        if let Some(pos) = w.civs[si].projects.iter().position(|p| p.id == id) {
            let p = w.civs[si].projects.remove(pos);
            let title = project_title(w, &p.kind, p.region);
            brief(w, seat, "warning", format!("Abandoned: {title}"), format!("Work stopped because {why}. Inputs already used are not recovered."), p.region, "projects");
        }
    }
    for id in done {
        if let Some(pos) = w.civs[si].projects.iter().position(|p| p.id == id) {
            let p = w.civs[si].projects.remove(pos);
            complete(w, seat, p);
        }
    }
    step_programs(w, seat);
}

fn add_facility(w: &mut World, region: usize, kind: usize, levels: u16) {
    let r = &mut w.regions[region];
    if let Some(f) = r.fac_mut(kind) {
        f.level += levels;
    } else {
        r.facilities.push(Facility {
            kind,
            level: levels,
            condition_bp: 10_000,
            enabled: true,
            staffed: 0,
            staff_needed: 0,
            skilled_bp: 10_000,
            run: None,
            operated: false,
            assembly_progress: 0,
        });
        r.facilities.sort_by_key(|f| f.kind);
    }
}

/// Whether the installation a technology's investigation depends on is operating.
pub fn tech_site_ok(w: &World, seat: SeatId, tech: usize) -> bool {
    let c = content();
    match c.techs[tech].needs_facility {
        None => true,
        Some(key) => {
            let k = c.f(key);
            // the installation must actually be running, not merely exist
            w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(k).map(|f| f.level > 0 && f.run.as_ref().map(|x| x.rate_bp >= 2500).unwrap_or(false)).unwrap_or(false))
        }
    }
}

pub fn civ_has_facility(w: &World, seat: SeatId, kind: usize) -> bool {
    w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(kind).map(|f| f.level > 0).unwrap_or(false))
}

fn complete(w: &mut World, seat: SeatId, p: Project) {
    let c = content();
    let si = seat as usize;
    let month = w.month;
    let title = project_title(w, &p.kind, p.region);
    match p.kind {
        ProjKind::Build { facility, levels } => {
            let ri = p.region.unwrap() as usize;
            let first = !civ_has_facility(w, seat, facility);
            add_facility(w, ri, facility, levels);
            let def = &c.facilities[facility];
            let mut techs = Vec::new();
            def.req.techs(&mut techs);
            for t in techs {
                let st = &mut w.civs[si].tech[t];
                if st.state == ST_UNDERSTOOD {
                    st.state = ST_PROTOTYPED;
                }
            }
            let rname = w.regions[ri].name.clone();
            if first {
                let (cat, art) = match def.category {
                    "Food" => (MomentCategory::Subsistence, "fields"),
                    "Education" => (MomentCategory::Education, "school"),
                    "Research" => (MomentCategory::Knowledge, "lab"),
                    "Power" => (MomentCategory::Industry, "power"),
                    "Space" => (MomentCategory::Space, "launch"),
                    "Jump engineering" => (MomentCategory::Endgame, "jump"),
                    "Civic" => (MomentCategory::Governance, "civic"),
                    "Transport" => (MomentCategory::Industry, "road"),
                    "Extraction" => (MomentCategory::Industry, "mine"),
                    _ => (MomentCategory::Industry, "workshop"),
                };
                moment(
                    w,
                    seat,
                    cat,
                    format!("First {}", def.name.to_lowercase()),
                    format!("{} completed its first {} at {}. {}", w.civs[si].name, def.name.to_lowercase(), rname, def.desc),
                    Some(ri as RegionId),
                    art,
                    def.work >= 100_000,
                    vec![format!("Construction accepted in month {month}"), format!("Site: {rname}")],
                );
            }
            brief(w, seat, "good", format!("Completed: {title}"), format!("{} is ready for staff.", def.name), Some(ri as RegionId), "economy");
        }
        ProjKind::Research { tech } => {
            {
                let st = &mut w.civs[si].tech[tech];
                st.state = ST_UNDERSTOOD;
                st.und_month = month;
                st.work = p.work_needed;
            }
            let t = &c.techs[tech];
            let label_note = match t.label.as_str() {
                "fictional" => " This rests on the anomaly this world actually exhibits, not on established physics.",
                "extrapolated" => " It remains an engineering extrapolation with declared limits.",
                _ => "",
            };
            moment(
                w,
                seat,
                MomentCategory::Knowledge,
                format!("Understood: {}", t.name),
                format!("Investigators can now reproduce the method. {}.{}", t.capability, label_note),
                None,
                match t.group.as_str() {
                    "A" | "B" => "craft",
                    "C" => "measure",
                    "D" | "E" | "F" => "industry",
                    "G" | "H" => "electric",
                    "I" => "bio",
                    "J" => "launch",
                    _ => "jump",
                },
                t.tier >= 3 || matches!(t.id.as_str(), "T005" | "T025" | "T023" | "T049"),
                vec![format!("Work completed in month {month}"), format!("Field: {}", t.group_title)],
            );
            brief(w, seat, "good", format!("Understood: {}", t.name), t.capability.clone(), None, "knowledge");
            crate::sim::knowledge::mark_used(w, seat, &t.prereq.clone());
        }
        ProjKind::LeadStudy { tech } => {
            let st = &mut w.civs[si].tech[tech];
            if st.state == ST_HINTED {
                st.state = ST_DISCOVERED;
                st.disc_month = month;
            }
            let name = c.techs[tech].name.clone();
            brief(w, seat, "info", format!("Lead resolved: {name}"), "The study identified a method that investigators can now pursue.".into(), None, "knowledge");
        }
        ProjKind::Survey { region } => {
            let ri = region as usize;
            crate::sim::knowledge::survey_region(w, seat, ri);
            let name = w.regions[ri].name.clone();
            brief(w, seat, "info", format!("Survey returned from {name}"), "Terrain, water and visible resources are now recorded.".into(), Some(region), "map");
        }
        ProjKind::Settle { from, to, people } => {
            let (fi, ti) = (from as usize, to as usize);
            if w.regions[ti].owner.is_some() {
                brief(w, seat, "warning", format!("Settlers turned back from {}", w.regions[ti].name), "Another authority holds the land. The party returned; stores were consumed.".into(), Some(to), "map");
            } else {
                // the land is taken into government first, so the settlers and their
                // qualifications move between two of our own regions
                w.regions[ti].owner = Some(seat);
                w.set_controller(ti, Some(seat));
                let moved = crate::sim::population::move_people(w, fi, ti, people, true);
                crate::sim::knowledge::refresh_visibility(w, seat);
                let name = w.regions[ti].name.clone();
                let count = w.owned(seat).len();
                moment(
                    w,
                    seat,
                    MomentCategory::Settlement,
                    format!("Settlement at {name}"),
                    format!("{} people from {} established a lasting camp at {name}. The polity now holds {count} regions.", group(moved as i64), w.regions[fi].name),
                    Some(to),
                    "camp",
                    count == 2,
                    vec![format!("Arrival recorded in month {month}"), format!("{} settlers", group(moved as i64))],
                );
                brief(w, seat, "good", format!("Settled {name}"), format!("{} people arrived with their stores.", group(moved as i64)), Some(to), "map");
            }
        }
        ProjKind::Study { tag } => {
            let found = crate::sim::knowledge::study_result(w, seat, tag);
            w.civs[si].study_done[tag] += 1;
            let dname = Tag::ALL[tag].name();
            if found > 0 {
                brief(w, seat, "info", format!("Study of {} produced {found} lead(s)", dname.to_lowercase()), "New questions were recorded. They can be followed up from the frontier view.".into(), None, "knowledge");
            } else {
                brief(w, seat, "info", format!("Study of {} found nothing new", dname.to_lowercase()), "The team recorded what it observed. Repeating the same study unchanged will not help; new evidence needs new practice, contact or instruments.".into(), None, "knowledge");
            }
        }
        ProjKind::Resettle { from, to, people } => {
            let moved = crate::sim::population::move_people(w, from as usize, to as usize, people, false);
            brief(w, seat, "info", format!("{} people resettled", group(moved as i64)), format!("They arrived in {}.", w.regions[to as usize].name), Some(to), "population");
        }
        ProjKind::Recruit { role, soldiers, tier } => {
            let ri = p.region.unwrap() as usize;
            // recruits take their share of the region's qualified people and learners with them
            let got = crate::sim::population::draw_adults(w, ri, soldiers);
            if got == 0 {
                brief(w, seat, "warning", "Recruitment failed".into(), "No eligible adults remained to serve.".into(), p.region, "military");
                return;
            }
            let id = w.id();
            w.civs[si].army_counter += 1;
            let n = w.civs[si].army_counter;
            let mut s = [0u32; 3];
            s[role.index()] = got;
            let def = &c.unit_tiers[tier as usize];
            let name = format!("{} {} {}", ordinal(n), w.civs[si].adjective, def.roles[role.index()]);
            w.armies.push(Army {
                id,
                owner: seat,
                name: name.clone(),
                region: ri as RegionId,
                soldiers: s,
                tier,
                proficiency_bp: 3000,
                supply_bp: 10_000,
                morale_bp: 8000,
                order: ArmyOrder::Hold,
                training_left: def.training_months,
                in_battle: false,
                move_progress: 0,
                initial: got,
            });
            brief(w, seat, "info", format!("Raised: {name}"), format!("{} recruits begin {} months of training.", group(got as i64), def.training_months), p.region, "military");
        }
        ProjKind::Reform { practice } => {
            {
                let st = &mut w.civs[si].practice[practice];
                st.state = 3;
                st.adoption_bp = st.adoption_bp.max(600);
            }
            let pr = &c.practices[practice];
            brief(w, seat, "good", format!("Enacted: {}", pr.name), "The institution now exists. Participation will spread gradually; its effects begin once it is established.".into(), None, "culture");
        }
        ProjKind::Religion { beliefs, name } => {
            crate::sim::culture::advance_movement(w, seat, beliefs, name);
        }
        ProjKind::FtlTrial => crate::sim::victory::complete_trial(w, seat),
        ProjKind::FtlDeployment => crate::sim::victory::complete_deployment(w, seat),
        ProjKind::FtlReplacement => crate::sim::victory::complete_replacement(w, seat),
    }
}

fn ordinal(n: u32) -> String {
    let suffix = match (n % 10, n % 100) {
        (1, 11) | (2, 12) | (3, 13) => "th",
        (1, _) => "st",
        (2, _) => "nd",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{n}{suffix}")
}

/// Places a venue offers in a region and the places already reserved by programmes, in people.
pub fn venue_seats(w: &World, seat: SeatId, region: usize, venue: Cap) -> (i64, i64) {
    let c = content();
    let mut cap = w.regions[region].cap(venue);
    if venue == Cap::SeatsLodge && crate::sim::culture::region_belief(&w.religions, &w.regions[region], "teaching_order") {
        cap += TEACHING_ORDER_PLACES;
    }
    let reserved: i64 = w.civs[seat as usize]
        .programs
        .iter()
        .filter(|p| p.region as usize == region && c.courses[p.course].venue == venue)
        .map(|p| p.seats as i64)
        .sum();
    (cap, reserved)
}

fn step_programs(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    let month = w.month;
    let n = w.civs[si].programs.len();
    let mut lost: Vec<usize> = Vec::new();
    for i in 0..n {
        let (course_ix, ri, paused, enrolled) = {
            let p = &w.civs[si].programs[i];
            (p.course, p.region as usize, p.paused, p.enrolled)
        };
        if w.regions[ri].controller != Some(seat) {
            lost.push(i);
            continue;
        }
        let course = &c.courses[course_ix];
        let mut blockers: Vec<String> = Vec::new();
        if enrolled == 0 {
            if paused {
                continue;
            }
            // --- enrol a new cohort ---------------------------------------------
            if !course.req.eval(&CivCtx { world: w, seat }) {
                w.civs[si].programs[i].blockers = vec!["The content of this course is not yet available".into()];
                continue;
            }
            let (cap, reserved) = venue_seats(w, seat, ri, course.venue);
            let mut seats = w.civs[si].programs[i].seats as i64;
            if reserved > cap {
                seats = (seats * cap / reserved.max(1)).max(0);
                blockers.push("The venue has fewer places than the programmes booked into it".into());
            }
            let r = &w.regions[ri];
            let working = r.working();
            let lineage = r.blocks.first().map(|b| b.lineage as usize).unwrap_or(0);
            let revis = w.lineages.get(lineage).map(|l| l.axes[1]).unwrap_or(5000) as i64;
            let student_cap = working as i64 * (800 + 900 * revis / 10_000) / 10_000;
            let room = (student_cap - r.students as i64).max(0);
            if room < seats {
                blockers.push("Households cannot spare more learners from work".into());
            }
            let mut class_size = course.class_size as i64;
            if (course.id == "E002" && w.civs[si].est_id("C018")) || (course.id == "E012" && w.civs[si].est_id("C032")) {
                class_size *= 2;
            }
            // teachers
            let mut teacher_qual: Option<Qual> = None;
            let mut teacher_avail: i64 = 0;
            for q in &course.teachers {
                let a = r.quals[q.index()].saturating_sub(r.teachers[q.index()]) as i64;
                if a > teacher_avail {
                    teacher_avail = a;
                    teacher_qual = Some(*q);
                }
            }
            let bootstrap = teacher_avail == 0;
            let teach_limit = if bootstrap { FOUNDING_COHORT_MAX } else { teacher_avail * class_size };
            // entrants
            let qsum: u32 = r.quals.iter().sum();
            let unskilled = (working as i64 * 92 / 100 - qsum as i64 - r.students as i64).max(0);
            let mut entrant: Option<Qual> = None;
            let mut entrant_avail: i64 = 0;
            for e in &course.entrants {
                let a = match e {
                    None => unskilled,
                    Some(q) => {
                        // keep the bundle's teachers and a working core in place
                        let free = r.quals[q.index()].saturating_sub(r.teachers[q.index()]) as i64;
                        if *q == course.output { 0 } else { free * 2 / 3 }
                    }
                };
                if a > entrant_avail {
                    entrant_avail = a;
                    entrant = *e;
                }
            }
            if entrant_avail == 0 {
                blockers.push("No eligible learners here".into());
            }
            let enrol = seats.min(room).min(teach_limit).min(entrant_avail);
            if enrol < 1 {
                if bootstrap && blockers.is_empty() {
                    blockers.push("No one here can teach this yet".into());
                }
                w.civs[si].programs[i].blockers = blockers;
                continue;
            }
            let teachers_needed = if bootstrap { 0 } else { ((enrol + class_size - 1) / class_size).max(1) };
            let mut duration = course.months as i64;
            if bootstrap {
                duration *= 2;
                blockers.push("No qualified instructor: a founding cohort is working it out slowly".into());
            }
            if w.civs[si].est_id("C046") && entrant.is_some() {
                duration = duration * 8 / 10;
            }
            if let Some(q) = entrant {
                // a holder who enrols is a learner, not a holder, until the course ends
                w.civs[si].qual_flows.entered[q.index()] += enrol;
            }
            let r = &mut w.regions[ri];
            if let Some(q) = entrant {
                r.quals[q.index()] -= enrol as u32;
            }
            r.students += enrol as u32;
            if let Some(q) = teacher_qual {
                if !bootstrap {
                    r.teachers[q.index()] += teachers_needed as u32;
                }
            }
            let p = &mut w.civs[si].programs[i];
            p.enrolled = enrol as u32;
            p.entrant = entrant;
            p.teachers = teachers_needed as u32;
            p.teacher_qual = if bootstrap { None } else { teacher_qual };
            p.progress = 0;
            p.duration = duration as u16;
            p.blockers = blockers;
        } else {
            // --- a month of teaching ------------------------------------------------
            let mut ok = true;
            for (g, a) in &course.materials {
                // course materials are stated per thousand learners
                let need = a * enrolled as i64 / 1000;
                let got = w.civs[si].take(*g, need);
                if got * 2 < need {
                    ok = false;
                    blockers.push(format!("Classes stalled for lack of {}", g.label().to_lowercase()));
                }
            }
            if w.regions[ri].cap(course.venue) == 0 && !(course.venue == Cap::SeatsLodge && crate::sim::culture::region_belief(&w.religions, &w.regions[ri], "teaching_order")) {
                ok = false;
                blockers.push("The venue is closed".into());
            }
            let p = &mut w.civs[si].programs[i];
            if p.teacher_qual.is_none() {
                blockers.push("Founding cohort without a qualified instructor".into());
            }
            if ok {
                p.progress += 1;
            }
            p.blockers = blockers;
            if p.progress >= p.duration {
                let grads = p.enrolled;
                let tq = p.teacher_qual;
                let tn = p.teachers;
                p.graduates += grads;
                let first = p.graduates == grads;
                p.enrolled = 0;
                p.teachers = 0;
                p.progress = 0;
                // the only way a qualified person comes into being: a learner who was
                // enrolled here for the whole course
                w.civs[si].qual_flows.trained[course.output.index()] += grads as i64;
                let r = &mut w.regions[ri];
                r.students = r.students.saturating_sub(grads);
                if let Some(q) = tq {
                    r.teachers[q.index()] = r.teachers[q.index()].saturating_sub(tn);
                }
                r.quals[course.output.index()] += grads;
                let rname = r.name.clone();
                let mut techs = Vec::new();
                course.req.techs(&mut techs);
                for t in techs {
                    let st = &mut w.civs[si].tech[t];
                    if st.state == ST_UNDERSTOOD || st.state == ST_PROTOTYPED {
                        st.state = ST_ADOPTED;
                    }
                }
                let civ_first = first && w.civs[si].programs.iter().filter(|q| q.course == course_ix && q.graduates > 0).count() == 1;
                if civ_first {
                    moment(
                        w,
                        seat,
                        MomentCategory::Education,
                        format!("First graduates: {}", course.name),
                        format!("{} learners at {rname} completed {} and qualified as {}. Their skills are usable from next month.", group(grads as i64), course.name.to_lowercase(), course.output.label().to_lowercase()),
                        Some(ri as RegionId),
                        "school",
                        course.months >= 36,
                        vec![format!("Cohort verified in month {month}"), format!("{} graduates", group(grads as i64))],
                    );
                }
                brief(w, seat, "good", format!("{} new {}", group(grads as i64), course.output.label().to_lowercase()), format!("A cohort of {} graduated at {rname}.", course.name.to_lowercase()), Some(ri as RegionId), "population");
            }
        }
    }
    for i in lost.into_iter().rev() {
        let p = w.civs[si].programs.remove(i);
        release_program(w, &p);
    }
}

/// Return learners and instructors of a cancelled programme to their previous roles.
/// Learners who had enrolled as holders of a qualification hold it again; they are
/// booked as `returned` in the ledger of whoever controls the region now.
pub fn release_program(w: &mut World, p: &Program) {
    let ri = p.region as usize;
    let r = &mut w.regions[ri];
    let back = p.enrolled.min(r.students);
    r.students -= back;
    if let Some(q) = p.entrant {
        r.quals[q.index()] += back;
    }
    if let Some(q) = p.teacher_qual {
        r.teachers[q.index()] = r.teachers[q.index()].saturating_sub(p.teachers);
    }
    if let Some(q) = p.entrant {
        if let Some(ledger) = w.qual_ledger(ri) {
            ledger.returned[q.index()] += back as i64;
        }
    }
}

/// Monthly cap on useful work (worker- or researcher-months) for a project of the given size.
pub fn max_per_month(work: i64, min_months: i64) -> i64 {
    (work / min_months.max(1)).max(4000)
}

pub fn scaled(work: i64, pace_bp: u32) -> i64 {
    muldiv(work, pace_bp as i64, 10_000).max(1000)
}
