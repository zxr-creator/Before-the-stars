//! Public schooling (ruleset 3.1, `docs/design/42-playable-ruleset-3.1.md`).
//!
//! A seat no longer has to run twenty-four courses region by region. While its
//! `schooling` policy is on (the default) the referee opens, sizes and closes the
//! seat's courses itself, once a year, from what the works actually ask for:
//!
//! - **Need** per qualification: the holders employed last month, the qualified posts
//!   left empty, the posts of works under construction and the crews of stations,
//!   with a tenth to spare; never less than a small standing share of the working
//!   people, so that the first works of a new kind find somebody to hire.
//! - **Places**: the venues the seat has built (lodges, schools, colleges,
//!   institutes). Schooling fills free places where the vacancies are, then where the
//!   people are. It never builds a venue: that stays the seat's decision, and the
//!   one lever it has to pull. A qualification that is short for want of places is
//!   reported in the briefing.
//! - **Courses** are the ordinary programmes of `sim::projects`: learners leave work,
//!   instructors teach, cohorts graduate after the course's months. Everything the
//!   conservation ledgers count is unchanged; only who places the orders differs.
//!
//! A programme the seat opens itself is never touched.

use crate::content::content;
use crate::sim::chronicle::brief;
use crate::state::*;
use bts_protocol::*;

/// Share of need trained on top of it, percent.
const RESERVE_PCT: u64 = 10;
/// Standing share of the working people kept in each qualification whose course is
/// open to the seat, per ten thousand, and the cap on that floor in people.
const FLOOR_BP: u64 = 30;
const FLOOR_MAX: u64 = 40_000;
/// The literate share general schooling aims for, per ten thousand of working age.
const LITERATE_BP: u64 = 1_000;
/// Programmes the referee keeps for one seat at most.
const AUTO_MAX: usize = 160;
/// The smallest cohort worth opening a programme for.
const MIN_SEATS: u64 = 500;

pub fn step(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    if !w.civs[si].schooling || w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    // once a year, and at the start of every round (long rounds: every January)
    if !(w.month % 12 == 1 || w.first_month_of_round()) {
        return;
    }
    let c = content();
    let regions: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].controller == Some(seat)).collect();
    if regions.is_empty() {
        return;
    }
    let ctx_ok: Vec<bool> = c.courses.iter().map(|course| course.req.eval(&CivCtx { world: w, seat })).collect();
    let working: u64 = regions.iter().map(|i| w.regions[*i].working() as u64).sum();

    // ---- need, holders and learners by qualification -----------------------------
    let mut need = [0u64; NQ];
    let mut have = [0u64; NQ];
    let mut vacant_in: Vec<[u64; NQ]> = vec![[0; NQ]; regions.len()];
    for (k, &ri) in regions.iter().enumerate() {
        let r = &w.regions[ri];
        for q in 0..NQ {
            have[q] += r.quals[q] as u64;
            let employed = r.last.qual_employed.get(q).copied().unwrap_or(0) as u64;
            let vacant = r.last.vacant.get(q).copied().unwrap_or(0) as u64;
            need[q] += employed + vacant + r.teachers[q] as u64;
            vacant_in[k][q] = vacant;
        }
    }
    // works under construction will ask for their posts the month they open
    for p in &w.civs[si].projects {
        let (kind, levels) = match p.kind {
            ProjKind::Build { facility, levels } => (facility, levels),
            ProjKind::Upgrade { to, levels, .. } => (to, levels),
            _ => continue,
        };
        for (quals, n) in &c.facilities[kind].skilled {
            if let Some(q) = quals.first() {
                need[q.index()] += *n as u64 * levels as u64;
            }
        }
    }
    // station crews are reserved before the works are staffed
    for (_, take) in crate::sim::space::crew_reserve(w, seat) {
        for q in 0..NQ {
            need[q] += take[q] as u64;
        }
    }
    let mut training = [0u64; NQ];
    for p in &w.civs[si].programs {
        training[c.courses[p.course].output.index()] += p.enrolled as u64;
    }

    // ---- every year the places are dealt afresh: idle programmes of the referee's are
    // closed, and a running cohort keeps only the places it fills
    {
        let civ = &mut w.civs[si];
        civ.programs.retain(|p| !(p.auto && p.enrolled == 0));
        for p in civ.programs.iter_mut().filter(|p| p.auto) {
            p.seats = p.enrolled;
        }
    }

    // ---- the gap of each qualification the seat can teach: posts first, floors after
    let mut gaps: Vec<(usize, u64, u64, bool)> = Vec::new(); // (qual, gap, target, for posts)
    for q in 0..NQ {
        let qual = Qual::ALL[q];
        if !c.courses.iter().enumerate().any(|(i, course)| course.output == qual && ctx_ok[i]) {
            continue;
        }
        let stock = have[q] + training[q];
        let posts = need[q] * (100 + RESERVE_PCT) / 100;
        let floor = if qual == Qual::Literate { working * LITERATE_BP / 10_000 } else { (working * FLOOR_BP / 10_000).min(FLOOR_MAX) };
        if stock < posts {
            gaps.push((q, posts - stock, posts, true));
        }
        if stock.max(posts) < floor {
            gaps.push((q, floor - stock.max(posts), floor, false));
        }
    }
    // real posts before standing floors; within each, the most depleted first
    gaps.sort_by_key(|(q, gap, target, posts)| (!*posts, std::cmp::Reverse(gap * 1000 / (*target).max(1)), *q));

    // ---- open this year's cohorts in the free places ---------------------------------
    let mut short_places: Vec<Qual> = Vec::new();
    for (q, gap, _, for_posts) in gaps {
        let qual = Qual::ALL[q];
        // the courses that give the qualification, shortest first: a longer course
        // in another kind of venue takes what the shortest cannot seat
        let mut courses: Vec<usize> = (0..c.courses.len()).filter(|i| c.courses[*i].output == qual && ctx_ok[*i]).collect();
        courses.sort_by_key(|i| (c.courses[*i].months, *i));
        let mut left = gap;
        let mut placed = 0u64;
        'courses: for ci in courses {
            let course = &c.courses[ci];
            // where the vacancies are, then where the people are
            let mut order: Vec<usize> = (0..regions.len()).collect();
            order.sort_by_key(|k| (std::cmp::Reverse(vacant_in[*k][q]), std::cmp::Reverse(w.regions[regions[*k]].working()), regions[*k]));
            for k in order {
                if left < MIN_SEATS.min(gap) {
                    break 'courses;
                }
                let ri = regions[k];
                let (cap, reserved) = crate::sim::projects::venue_seats(w, seat, ri, course.venue);
                let places_bp = crate::sim::eras::course_places_bp(&w.civs[si], &course.id);
                let free = ((cap - reserved).max(0) as u64) * places_bp as u64 / 10_000;
                if free < MIN_SEATS.min(gap) {
                    continue;
                }
                if w.civs[si].programs.iter().filter(|p| p.auto).count() >= AUTO_MAX || w.civs[si].programs.len() >= 200 {
                    break 'courses;
                }
                let add = left.min(free).min(crate::actions::PROGRAM_SEATS_MAX as u64);
                let id = w.id();
                w.civs[si].programs.push(Program { id, course: ci, region: ri as RegionId, seats: add as u32, enrolled: 0, entrant: None, teachers: 0, teacher_qual: None, progress: 0, duration: course.months, graduates: 0, paused: false, blockers: vec![], last_grad: 0, auto: true });
                left -= add;
                placed += add;
            }
        }
        if for_posts && placed * 2 < gap && gap >= MIN_SEATS {
            short_places.push(qual);
        }
    }
    if !short_places.is_empty() && w.first_month_of_round() {
        let venues: Vec<String> = {
            let mut v: Vec<String> = short_places
                .iter()
                .filter_map(|q| (0..c.courses.len()).filter(|i| c.courses[*i].output == *q && ctx_ok[*i]).min_by_key(|i| (c.courses[*i].months, *i)))
                .map(|ci| venue_name(c.courses[ci].venue).to_string())
                .collect();
            v.sort();
            v.dedup();
            v
        };
        let names: Vec<String> = short_places.iter().take(6).map(|q| q.label().to_lowercase()).collect();
        brief(
            w,
            seat,
            "warning",
            "Schooling is short of places".into(),
            format!("The works ask for more {} than the venues can train. Build or expand: {}.", names.join(", "), venues.join(", ")),
            None,
            "population",
        );
    }
}

/// The works that give a venue's places, as a seat would look for it.
pub fn venue_name(venue: crate::content::Cap) -> &'static str {
    use crate::content::Cap;
    match venue {
        Cap::SeatsLodge => "teaching lodges",
        Cap::SeatsSchool => "schools",
        Cap::SeatsCollege => "colleges",
        Cap::SeatsInstitute => "technical institutes",
        _ => "venues",
    }
}
