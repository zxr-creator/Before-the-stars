//! Aggregate population: food and water access, births with a nine-month lag,
//! one combined mortality calculation, annual ageing and migration. People are
//! conserved: every flow moves or removes counts from the same age vectors.
//!
//! Qualified people and learners are people too. A region's holders of
//! qualifications and its enrolled learners are always backed by working-age
//! residents (`sum(quals) + students <= working`, `teachers[q] <= quals[q]`).
//! Whenever working-age people leave a region the same share of its free holders
//! leaves with them, and every holder who leaves is written to the controller's
//! qualification ledger (`QualFlows`):
//!
//! - death and ageing: holders die and retire in proportion; learners die in
//!   proportion and drop out of their cohorts;
//! - enlistment (recruits, and militia who fall): the recruits' share of free
//!   holders lapses, and their share of learners leaves the cohorts;
//! - departure (settlement, resettlement, migration, drift to work): free holders
//!   move in proportion and keep their qualification; learners and instructors
//!   stay with their courses.
//!
//! Instructors are replaced from the free holders of their qualification, so the
//! number teaching falls only when no free holder is left. After every such
//! change `reconcile_roles` (or the same rule inside `move_people`) removes
//! whatever rounding or an emptying region left unbacked.

use crate::content::{content, Cap, FOOD_PER_PERSON_MONTH};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

/// Monthly baseline deaths per 100,000 by age band: pre-modern rates, about 27% of
/// infants a year and a life expectancy at birth of 25-28 (design chapter 36,
/// section 3.2).
pub const BANDS: [(usize, usize, i64); 6] = [(0, 0, 2600), (1, 4, 420), (5, 14, 80), (15, 49, 105), (50, 64, 260), (65, 80, 900)];

/// Technologies and practices that lower mortality, with their factor on the death
/// rates of children (bands 0-14) and of everyone older, in basis points; every one
/// understood (or established) multiplies. Calibrated (ruleset 3.0, slice 2): the
/// medieval nodes act mildly, the great fall comes with germ theory, sanitation and
/// vaccination.
pub const MORTALITY_TECH: [(&str, i64, i64); 9] = [
    ("T032", 9_700, 9_850),
    ("T033", 9_200, 9_600),
    ("T046", 9_500, 9_700),
    ("T053", 6_000, 8_000),
    ("T069", 6_000, 8_500),
    ("T070", 5_000, 8_000),
    ("T131", 8_000, 8_500),
    ("T136", 7_000, 7_000),
    ("C002", 9_500, 10_000),
];

/// Customary fertility (`F_custom`) in basis points before doctrines and practices.
/// The design's 5,500 assumed a lower survival to childbearing than these age bands
/// give (with annual ageing a newborn spends half a year on average in the infant
/// band); 3,820 (4,050 with kin mutual aid) holds a pre-modern people with full
/// stores near +0.05% a year, and the doctrine and practice terms are scaled by
/// about 4,150/5,500.
pub const CUSTOMARY_FERTILITY: i64 = 3_850;

/// Causes of death, in the order of `Flows::deaths_cause`.
pub const DEATH_CAUSES: [&str; 5] = ["age_and_illness", "hunger_and_crowding", "town_conditions", "epidemic", "war"];
pub const CAUSE_WAR: usize = 4;

/// Child and adult mortality factors of a civilization (basis points).
pub fn mortality_tech(civ: &Civ) -> (i64, i64) {
    let c = content();
    let mut child: i64 = 10_000;
    let mut adult: i64 = 10_000;
    for (id, ch, ad) in MORTALITY_TECH {
        let on = if id.starts_with('C') { civ.established(c.p(id)) } else { civ.knows(c.t(id)) };
        if on {
            child = child * ch / 10_000;
            adult = adult * ad / 10_000;
        }
    }
    (child, adult)
}

/// Residents a region's sewers and treatment works serve.
pub fn sanitation_capacity(r: &Region) -> i64 {
    let c = content();
    let served = |key: &str, each: i64| r.fac(c.f(key)).filter(|f| f.enabled).map(|f| f.level as i64 * each * (f.condition_bp as i64).max(3000) / 10_000).unwrap_or(0);
    served("sewers", 3_000_000) + served("water_treatment", 12_000_000)
}

/// Share of a region's residents who live in its towns and city, basis points
/// (`sim::cities::urban_share`, design chapter 38, section 2.2).
pub fn urban_share(r: &Region) -> i64 {
    crate::sim::cities::urban_share(r)
}

/// Literate-or-higher holders among a region's working-age residents (basis points),
/// the stand-in for the schooling of young adults.
pub fn literate_share(r: &Region) -> i64 {
    let educated: u64 = [Qual::Literate, Qual::Scribe, Qual::Teacher, Qual::Scholar, Qual::Researcher, Qual::Scientist, Qual::Mechanic, Qual::Technician, Qual::Electrician, Qual::Programmer, Qual::Physician, Qual::AiEngineer, Qual::Orbital, Qual::FtlEngineer]
        .iter()
        .map(|q| r.quals[q.index()] as u64)
        .sum::<u64>()
        + r.students as u64;
    let working = r.working().max(1) as u64;
    (educated * 10_000 / working).min(10_000) as i64
}

/// People the land of a region can feed with what its government knows, at most
/// the residents its water supports: wild food, and fields, pastures and fishing
/// grounds at every level the land and the government's practices allow, worked by
/// the best methods it knows (their inputs assumed supplied).
pub fn carrying_capacity(w: &World, seat: SeatId, ri: usize) -> i64 {
    use crate::sim::economy::{field_method_known, food_tech, level_cap, FIELD_METHODS};
    let c = content();
    let civ = &w.civs[seat as usize];
    let r = &w.regions[ri];
    let cap = |key: &str| level_cap(w, seat, ri, &c.facilities[c.f(key)]) as i64;
    let ft = food_tech(civ, true);
    let field = FIELD_METHODS.iter().enumerate().filter(|(i, _)| field_method_known(civ, *i)).map(|(_, m)| m.rations).max().unwrap_or(0);
    let known = |key: &str| crate::actions::facility_visible(w, seat, c.f(key)) && c.facilities[c.f(key)].req.eval(&CivCtx { world: w, seat });
    // foraging is extensive: the wild feeds settled people at a third of what a
    // month's gathering can bring in
    let mut rations = r.wild / 3;
    if known("fields") {
        // the formula is the land's (design chapter 37, section 8.6): fields the town
        // has taken still count, the region being fed from elsewhere in their stead
        rations += crate::sim::economy::level_cap_land(w, seat, ri, &c.facilities[c.f("fields")], false) as i64 * field;
    }
    // herds and fishing grounds count at half: they feed a people only alongside its fields
    if known("pasture") {
        rations += cap("pasture") * c.facilities[c.f("pasture")].general as i64 * ft.pasture / 2000;
    }
    if known("fishery") {
        rations += cap("fishery") * c.facilities[c.f("fishery")].general as i64 * ft.fish / 2000;
    }
    (rations / FOOD_PER_PERSON_MONTH).min(water_capacity(r) as i64).max(1)
}

/// The land factor of fertility (`F_land`, basis points; ruleset 3.0 calibration):
/// households on open land with room to spare have more children, households on
/// full land fewer. It is the Malthusian brake that keeps a pre-modern people near
/// what its land and knowledge can feed, so that long-run growth follows new land
/// and new methods rather than drifting to an explosion or to extinction.
/// The land factor's neutral point (residents over carrying capacity, basis points;
/// 4,650 in slice 6r, 4,800 since slice 6c),
/// its change over one neutral span, and its bounds (ruleset 3.0 slice 6r: the
/// pre-industrial ceiling sits where households begin to feel the land is full,
/// well short of what the best fields could feed in a good year).
pub const LAND_NEUTRAL_BP: i64 = 6_300;
pub const LAND_SLOPE_BP: i64 = 1_500;
pub const LAND_MIN_BP: i64 = 6_000;
pub const LAND_MAX_BP: i64 = 10_500;
/// Child survival gain (basis points) beyond which the land factor fades, gone
/// 5,000 points later: the medieval remedies keep it, germ theory and clean water
/// end it.
pub const LAND_FADE_FROM_BP: i64 = 2_500;

pub fn land_factor(pop: i64, capacity: i64) -> i64 {
    let ratio = pop * 10_000 / capacity.max(1);
    (10_000 + LAND_SLOPE_BP * (LAND_NEUTRAL_BP - ratio) / LAND_NEUTRAL_BP).clamp(LAND_MIN_BP, LAND_MAX_BP)
}

/// The development factor of fertility (`F_dev`, basis points): schooling of young
/// adults, life away from the land and children who survive make families smaller.
/// Prosperity (design section 5.5) stands in through [`prosperity_bp`] until the
/// consumption slice. Lowest development factor (6,800 in slice 6r, a modern total
/// fertility a little above replacement; 4,500 since job 4b, with prosperity).
pub const DEV_FLOOR_BP: i64 = 4_500;

/// Prosperity of a civilization for the development factor (basis points; job 4b):
/// until the consumption basket exists, the era stands in for it, rising from the
/// Modern era (2,500) to the AI era (10,000), so that families shrink below
/// replacement in the late eras and growth slows again (design chapter 36, table
/// 3.1: 0.5%/yr after 2000, flat after 2200).
pub fn prosperity_bp(civ: &Civ) -> i64 {
    ((civ.era.era as i64 - 4) * 2_500).clamp(0, 10_000)
}

pub fn development_factor(lit_bp: i64, urban_bp: i64, child_gain_bp: i64, prosperity_bp: i64, lifelong: bool) -> i64 {
    let f = (10_000 - lit_bp * 1_500 / 10_000 - urban_bp * 600 / 10_000 - child_gain_bp * 600 / 10_000 - prosperity_bp * 5_000 / 10_000).clamp(DEV_FLOOR_BP, 10_000);
    (f + if lifelong { 500 } else { 0 }).min(10_000)
}

/// Months of food in store that households count as a secure buffer: a season's
/// gap between harvests (ruleset 3.0 slice 6r). Fixed, so that fertility follows
/// the households' food security and not the government's reserve policy.
pub const HOUSEHOLD_BUFFER_MONTHS: i64 = 2;
/// Food security (basis points) of households that ate in full all year but have
/// nothing in store; a full buffer raises it to 10,000.
pub const FOOD_SECURE_BASE: i64 = 7_000;

/// People who always stay behind when a region sends people elsewhere.
const MOVE_FLOOR: u32 = 10_000;
/// Regions smaller than this do not shed people to their neighbours.
/// Residents a precinct of the Menders' Order cares for.
const HEALERS_ORDER_CARE: i64 = 800_000;

/// Residents the natural supply and waterworks of a region support.
pub fn water_capacity(r: &Region) -> u32 {
    (r.water as i64 + r.cap(Cap::Water)).clamp(0, u32::MAX as i64) as u32
}

/// Learners enrolled in the programmes held in a region, whoever runs them.
pub fn enrolled_in(w: &World, ri: usize) -> u32 {
    w.civs.iter().flat_map(|c| c.programs.iter()).filter(|p| p.region as usize == ri).map(|p| p.enrolled).sum()
}

/// Take `count` learners out of the cohorts held in a region, the same share of
/// each. They stop being learners and stay ordinary people; a holder who had
/// enrolled does not get the earlier qualification back. Returns the number shed.
pub fn shed_students(w: &mut World, ri: usize, count: u32) -> u32 {
    let total = enrolled_in(w, ri) as u64;
    let count = (count as u64).min(total);
    if count == 0 {
        return 0;
    }
    let mut rem: u64 = 0;
    let mut shed = 0u32;
    for civ in w.civs.iter_mut() {
        for p in civ.programs.iter_mut().filter(|p| p.region as usize == ri && p.enrolled > 0) {
            let x = p.enrolled as u64 * count + rem;
            let take = (x / total).min(p.enrolled as u64) as u32;
            rem = x % total;
            p.enrolled -= take;
            shed += take;
            if p.enrolled == 0 {
                // the cohort is gone: its instructors go back to other work
                if let Some(q) = p.teacher_qual {
                    let t = &mut w.regions[ri].teachers[q.index()];
                    *t = t.saturating_sub(p.teachers);
                }
                p.teachers = 0;
                p.teacher_qual = None;
                p.entrant = None;
                p.progress = 0;
            }
        }
    }
    let r = &mut w.regions[ri];
    r.students = r.students.saturating_sub(shed);
    shed
}

/// Remove up to `count` holders of qualifications from a region, the same share of
/// each qualification: the free holders, or (`teaching`) the instructors, whose
/// classes then lose them. Returns what was removed of each qualification; the
/// caller books it in the ledger channel that explains it.
fn strip_holders(w: &mut World, ri: usize, count: u32, teaching: bool) -> [u32; NQ] {
    let mut out = [0u32; NQ];
    let pool: Vec<u64> = (0..NQ)
        .map(|q| {
            let r = &w.regions[ri];
            let t = r.teachers[q].min(r.quals[q]);
            if teaching { t as u64 } else { (r.quals[q] - t) as u64 }
        })
        .collect();
    let total: u64 = pool.iter().sum();
    let take = (count as u64).min(total);
    if take == 0 {
        return out;
    }
    let mut rem: u64 = 0;
    for q in 0..NQ {
        let x = pool[q] * take + rem;
        let t = (x / total).min(pool[q]) as u32;
        rem = x % total;
        if t == 0 {
            continue;
        }
        w.regions[ri].quals[q] -= t;
        out[q] = t;
        if teaching {
            w.regions[ri].teachers[q] -= t;
            let mut gone = t;
            for civ in w.civs.iter_mut() {
                for p in civ.programs.iter_mut().filter(|p| p.region as usize == ri && p.teacher_qual.map(|x| x.index()) == Some(q)) {
                    let d = gone.min(p.teachers);
                    p.teachers -= d;
                    gone -= d;
                }
            }
        }
    }
    out
}

/// Learners and holders a region has beyond its working-age residents.
fn unbacked_roles(w: &World, ri: usize) -> u32 {
    let r = &w.regions[ri];
    let roles = r.quals.iter().map(|n| *n as u64).sum::<u64>() + r.students as u64;
    roles.saturating_sub(r.working() as u64) as u32
}

/// Keep a region's learners and holders within its working-age residents after
/// people have left it for the stated reason. Learners drop out first; holders
/// beyond that (free holders, then instructors) leave through the stated ledger
/// channel. With every departure already taking its proportional share this only
/// settles rounding and the last people of a region that is emptying.
pub fn reconcile_roles(w: &mut World, ri: usize, how: QualExit) {
    let mut excess = unbacked_roles(w, ri);
    if excess == 0 {
        return;
    }
    excess -= shed_students(w, ri, excess);
    for teaching in [false, true] {
        if excess == 0 {
            return;
        }
        let gone = strip_holders(w, ri, excess, teaching);
        excess -= gone.iter().sum::<u32>();
        if let Some(ledger) = w.qual_ledger(ri) {
            for q in 0..NQ {
                ledger.exit(how, q, gone[q]);
            }
        }
    }
}

/// `left` of the `working_before` working-age residents of a region have left it
/// for good (death, ageing or enlistment are booked by the caller's `how`): the
/// same share of its free holders and of its learners goes with them.
pub fn roles_leave(w: &mut World, ri: usize, left: u32, working_before: u32, how: QualExit) {
    if left > 0 && working_before > 0 {
        let left = left.min(working_before) as u64;
        let mut gone = [0u32; NQ];
        {
            let r = &mut w.regions[ri];
            for q in 0..NQ {
                let free = r.quals[q].saturating_sub(r.teachers[q]) as u64;
                let t = (free * left / working_before as u64) as u32;
                r.quals[q] -= t;
                gone[q] = t;
            }
        }
        if let Some(ledger) = w.qual_ledger(ri) {
            for q in 0..NQ {
                ledger.exit(how, q, gone[q]);
            }
        }
        let learners = (w.regions[ri].students as u64 * left / working_before as u64) as u32;
        shed_students(w, ri, learners);
    }
    reconcile_roles(w, ri, how);
}

/// Carry holders that moved from one region to another across the two controllers'
/// ledgers. Between regions of one civilization nothing is recorded.
fn book_moved(w: &mut World, from: usize, to: usize, moved: &[u32; NQ]) {
    let (a, b) = (w.regions[from].controller, w.regions[to].controller);
    if a == b {
        return;
    }
    for q in 0..NQ {
        let n = moved[q] as i64;
        if n == 0 {
            continue;
        }
        if let Some(a) = a {
            w.civs[a as usize].qual_flows.moved_out[q] += n;
        }
        if let Some(b) = b {
            w.civs[b as usize].qual_flows.moved_in[q] += n;
        }
    }
}

/// Move `count` people from one region to another, proportionally across blocks,
/// ages and qualifications. Returns the number actually moved.
///
/// The free holders of each qualification move in the proportion of the
/// working-age people who moved. Learners and instructors stay with their
/// courses unless the region empties around them.
pub fn move_people(w: &mut World, from: usize, to: usize, count: u32, adults_bias: bool) -> u32 {
    // settlers: adults of working age and their children; otherwise everyone alike
    let mut weights = [1u64; AGES];
    if adults_bias {
        weights[50..].iter_mut().for_each(|x| *x = 0);
    }
    move_people_weighted(w, from, to, count, &weights, 0)
}

/// [`move_people`] with a weight per age: the people of each age cell are drawn in
/// proportion to their number times the weight (migrants are mostly young adults).
/// Blocks smaller than `min_share_bp` of the region's people send nobody (migrants
/// leave from the region's main communities, which keeps small groups from
/// scattering into every region).
pub fn move_people_weighted(w: &mut World, from: usize, to: usize, count: u32, weight: &[u64; AGES], min_share_bp: u64) -> u32 {
    if from == to {
        return 0;
    }
    let pop = w.regions[from].population();
    if pop == 0 || count == 0 {
        return 0;
    }
    let count = count.min(pop.saturating_sub(MOVE_FLOOR));
    if count == 0 {
        return 0;
    }
    let working_before = w.regions[from].working();
    let mut moved_total = 0u32;
    let mut moved_working = 0u32;
    let mut carried: Vec<PopBlock> = Vec::new();
    // the eligible pool, weighted by age (block totals reckoned once)
    let floor = pop as u64 * min_share_bp / 10_000;
    let eligible: Vec<bool> = w.regions[from].blocks.iter().map(|b| b.total() as u64 >= floor).collect();
    let pool: u64 = w.regions[from].blocks.iter().zip(eligible.iter()).filter(|(_, e)| **e).map(|(b, _)| b.ages.iter().zip(weight.iter()).map(|(n, wt)| *n as u64 * wt).sum::<u64>()).sum();
    if pool == 0 {
        return 0;
    }
    let mut rem: u64 = 0;
    let mut emptied = false;
    for (b, e) in w.regions[from].blocks.iter_mut().zip(eligible.iter()) {
        if !*e {
            continue;
        }
        let mut out = PopBlock::new(b.lineage, b.religion);
        out.birth_hist = b.birth_hist;
        let mut took = 0u32;
        let mut left = 0u32;
        for age in 0..AGES {
            let have = b.ages[age] as u64;
            let wt = weight[age];
            if have == 0 || wt == 0 {
                left += have as u32;
                continue;
            }
            let x = have * wt * count as u64 + rem;
            let take = (x / pool).min(have) as u32;
            rem = x % pool;
            b.ages[age] -= take;
            out.ages[age] += take;
            took += take;
            left += b.ages[age];
            if (WORK_MIN_AGE..=WORK_MAX_AGE).contains(&age) {
                moved_working += take;
            }
        }
        moved_total += took;
        emptied |= left == 0;
        if took > 0 {
            carried.push(out);
        }
    }
    let dest_pop = w.regions[to].population() as u64;
    for out in carried {
        let blocks = &mut w.regions[to].blocks;
        let mut at = blocks.iter().position(|b| b.lineage == out.lineage && b.religion == out.religion);
        // migrants too few to form a community of their own (under 1% of the
        // destination) join its largest community of their faith, or its largest
        if at.is_none() && min_share_bp > 0 && (out.total() as u64) * 100 < dest_pop {
            let largest = |same_faith: bool| blocks.iter().enumerate().filter(|(_, b)| !same_faith || b.religion == out.religion).max_by_key(|(i, b)| (b.total(), std::cmp::Reverse(*i))).map(|(i, _)| i);
            at = largest(true).or_else(|| largest(false));
        }
        match at {
            Some(i) => {
                for age in 0..AGES {
                    blocks[i].ages[age] += out.ages[age];
                }
            }
            None => blocks.push(out),
        }
    }
    if emptied {
        w.regions[from].blocks.retain(|b| b.total() > 0);
    }

    // qualifications follow the working-age people who actually moved
    let mut moved_quals = [0u32; NQ];
    if working_before > 0 && moved_working > 0 {
        for q in 0..NQ {
            let free = w.regions[from].quals[q].saturating_sub(w.regions[from].teachers[q]);
            let take = (free as u64 * moved_working as u64 / working_before as u64) as u32;
            w.regions[from].quals[q] -= take;
            moved_quals[q] = take;
        }
    }
    // Learners and instructors stay with their courses: the people who move are the
    // ones without a place in one. Only when the region can no longer back the
    // roles left in it do more of them go with the movers - free holders first,
    // then learners (who drop out and arrive as ordinary people), then instructors.
    let mut excess = unbacked_roles(w, from);
    if excess > 0 {
        let more = strip_holders(w, from, excess, false);
        for q in 0..NQ {
            moved_quals[q] += more[q];
            excess -= more[q];
        }
    }
    if excess > 0 {
        excess -= shed_students(w, from, excess);
    }
    if excess > 0 {
        let more = strip_holders(w, from, excess, true);
        for q in 0..NQ {
            moved_quals[q] += more[q];
        }
    }
    for q in 0..NQ {
        w.regions[to].quals[q] += moved_quals[q];
    }
    book_moved(w, from, to, &moved_quals);
    moved_total
}

/// Move `count` working adults (aged 20–55) between regions, keeping their lineage and religion.
/// The caller moves their qualification with them, one for one.
pub fn relocate_adults(regions: &mut [Region], from: usize, to: usize, count: u32) -> u32 {
    if from == to || count == 0 {
        return 0;
    }
    let pool: u32 = regions[from].blocks.iter().map(|b| b.ages[20..=55].iter().sum::<u32>()).sum();
    if pool == 0 {
        return 0;
    }
    let count = count.min(pool);
    let mut rem: u64 = 0;
    let mut moved = 0;
    let mut carried: Vec<PopBlock> = Vec::new();
    for b in regions[from].blocks.iter_mut() {
        let mut out = PopBlock::new(b.lineage, b.religion);
        out.birth_hist = b.birth_hist;
        for age in 20..=55 {
            let have = b.ages[age] as u64;
            let x = have * count as u64 + rem;
            let take = (x / pool as u64).min(have) as u32;
            rem = x % pool as u64;
            b.ages[age] -= take;
            out.ages[age] += take;
            moved += take;
        }
        if out.total() > 0 {
            carried.push(out);
        }
    }
    for out in carried {
        if let Some(b) = regions[to].blocks.iter_mut().find(|b| b.lineage == out.lineage && b.religion == out.religion) {
            for age in 0..AGES {
                b.ages[age] += out.ages[age];
            }
        } else {
            regions[to].blocks.push(out);
        }
    }
    regions[from].blocks.retain(|b| b.total() > 0);
    moved
}

/// Holders of a qualification resident in a seat's regions who are not teaching.
pub fn free_holders(w: &World, seat: SeatId, q: Qual) -> u32 {
    w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.quals[q.index()].saturating_sub(r.teachers[q.index()])).sum()
}

/// Adults aged 20-55, the people `relocate_adults` moves, resident in a region.
fn movable_adults(r: &Region) -> u32 {
    r.blocks.iter().map(|b| b.ages[20..=55].iter().sum::<u32>()).sum()
}

/// A seat's regions in the order experts are drawn from them: the region named
/// first (if the seat governs it), then the most free holders of `q`, then the
/// lowest-numbered of equals.
fn expert_sources(w: &World, seat: SeatId, q: Qual, first: Option<usize>) -> Vec<usize> {
    let mut v: Vec<usize> = (0..w.regions.len()).filter(|ri| w.regions[*ri].controller == Some(seat)).collect();
    let free = |ri: usize| w.regions[ri].quals[q.index()].saturating_sub(w.regions[ri].teachers[q.index()]);
    v.sort_by_key(|ri| (Some(*ri) != first, std::cmp::Reverse(free(*ri)), *ri));
    v
}

/// Second up to `count` free holders of `q` from the lender's regions to the
/// region `to` (the borrower's capital): real adults move with their qualification,
/// so they leave the lender's labour pool and live, eat and work where they arrive.
/// Booked as `seconded_out` by the lender and `seconded_in` by the borrower that
/// governs `to`. Returns the people sent and the lender's region that gave the most
/// of them (where the survivors return).
pub fn second_out(w: &mut World, lender: SeatId, q: Qual, count: u32, to: usize) -> (u32, RegionId) {
    let qi = q.index();
    let borrower = w.regions[to].controller;
    let mut left = count;
    let mut home = (w.civs[lender as usize].capital, 0u32);
    for ri in expert_sources(w, lender, q, None) {
        if left == 0 {
            break;
        }
        if ri == to {
            continue;
        }
        let r = &w.regions[ri];
        let n = left.min(r.quals[qi].saturating_sub(r.teachers[qi])).min(movable_adults(r));
        if n == 0 {
            continue;
        }
        let moved = relocate_adults(&mut w.regions, ri, to, n);
        w.regions[ri].quals[qi] -= moved;
        w.regions[to].quals[qi] += moved;
        left -= moved;
        if moved > home.1 {
            home = (ri as RegionId, moved);
        }
    }
    let sent = count - left;
    w.civs[lender as usize].qual_flows.seconded_out[qi] += sent as i64;
    if let Some(b) = borrower {
        w.civs[b as usize].qual_flows.seconded_in[qi] += sent as i64;
    }
    (sent, home.0)
}

/// End a secondment: up to `owed` free holders of `q` leave the borrower's holders
/// (`seconded_back`), never more than its regions still hold. When `breach` (the
/// borrower repudiated, or the parties went to war) a quarter of them stay where they
/// are as ordinary residents without their qualification; the rest go home with it
/// to the lender's region `home` (its capital if it no longer governs `home`).
/// The lender books all of them as `seconded_home` and those who stayed as
/// `seconded_lost`. Returns (came home, stayed behind).
pub fn second_home(w: &mut World, lender: SeatId, borrower: SeatId, q: Qual, owed: u32, home: RegionId, breach: bool) -> (u32, u32) {
    let qi = q.index();
    let dest = if w.regions[home as usize].controller == Some(lender) { home as usize } else { w.civs[lender as usize].capital as usize };
    let to_lender = w.regions[dest].controller == Some(lender);
    let capital = w.civs[borrower as usize].capital as usize;
    let mut left = owed.min(free_holders(w, borrower, q));
    let mut stay_left = if breach { left / 4 } else { 0 };
    let (mut came, mut stayed) = (0u32, 0u32);
    for ri in expert_sources(w, borrower, q, Some(capital)) {
        if left == 0 {
            break;
        }
        let free = w.regions[ri].quals[qi].saturating_sub(w.regions[ri].teachers[qi]);
        let n = left.min(free);
        if n == 0 {
            continue;
        }
        // those kept behind lose the qualification and stay as residents
        let stay = stay_left.min(n);
        w.regions[ri].quals[qi] -= stay;
        stay_left -= stay;
        stayed += stay;
        // the others travel home with it, as far as the region's adults allow
        let go = n - stay;
        let moved = if go > 0 && to_lender && ri != dest { relocate_adults(&mut w.regions, ri, dest, go) } else { 0 };
        w.regions[ri].quals[qi] -= moved;
        w.regions[dest].quals[qi] += moved;
        came += moved;
        left -= stay + moved;
    }
    let released = came + stayed;
    w.civs[borrower as usize].qual_flows.seconded_back[qi] += released as i64;
    let l = &mut w.civs[lender as usize].qual_flows;
    l.seconded_home[qi] += released as i64;
    l.seconded_lost[qi] += stayed as i64;
    (came, stayed)
}

/// Remove `count` adults aged 18-40 from a region for military service (recruits,
/// or militia who fell). Returns the number removed. Their share of the region's
/// qualified people and learners goes with them: a qualification lapses in
/// service (ledger channel `enlisted`), and a discharged soldier comes home an
/// ordinary adult.
pub fn draw_adults(w: &mut World, ri: usize, count: u32) -> u32 {
    let working_before = w.regions[ri].working();
    let r = &mut w.regions[ri];
    let pool: u32 = r.blocks.iter().map(|b| b.ages[18..=40].iter().sum::<u32>()).sum();
    if pool == 0 {
        return 0;
    }
    let count = count.min(pool);
    let mut rem: u64 = 0;
    let mut taken = 0;
    for b in r.blocks.iter_mut() {
        for age in 18..=40 {
            let have = b.ages[age] as u64;
            let x = have * count as u64 + rem;
            let take = (x / pool as u64).min(have) as u32;
            rem = x % pool as u64;
            b.ages[age] -= take;
            taken += take;
        }
    }
    roles_leave(w, ri, taken, working_before, QualExit::Enlisted);
    taken
}

/// Return demobilized or surviving soldiers to a region as ordinary adults.
pub fn return_adults(r: &mut Region, lineage: u16, count: u32) {
    if count == 0 {
        return;
    }
    if r.blocks.is_empty() {
        r.blocks.push(PopBlock::new(lineage, None));
    }
    let b = &mut r.blocks[0];
    let span = 16u32;
    for i in 0..span {
        b.ages[24 + i as usize] += count / span + if i < count % span { 1 } else { 0 };
    }
}

pub fn step(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let regs: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].controller == Some(seat)).collect();
    let month = w.month;
    let slot = (month % 12) as usize;
    let soldiers: u32 = w.armies.iter().filter(|a| a.owner == seat).map(|a| a.count()).sum();
    let pop: u64 = regs.iter().map(|i| w.regions[*i].population() as u64).sum();

    // ---- food ---------------------------------------------------------------
    // a region is fed from the common stock only as far as its own food and its
    // provisioning reach (design chapter 37, section 8.8); the rest go short even
    // when the stores hold food
    let reach: Vec<i64> = regs.iter().map(|ri| (w.regions[*ri].population() as i64).min(crate::sim::cities::feedable(&w.regions[*ri]))).collect();
    let fed: i64 = reach.iter().sum();
    let need = (fed + soldiers as i64) * FOOD_PER_PERSON_MONTH;
    let have = w.civs[si].stock_of(Good::Food).max(0);
    let food_bp = if need == 0 { 10_000 } else { ratio_bp(have, need) };
    w.civs[si].take(Good::Food, need.min(have));
    let shared = w.civs[si].est_id("C004");
    let provision = w.civs[si].est_id("C039");
    // spoilage on what remains: lost, not eaten
    let storage: i64 = regs.iter().map(|i| w.regions[*i].cap(Cap::Storage) + 400_000).sum::<i64>()
        + if crate::sim::culture::belief_share(w, seat, "grain_oath") > 2000 { 800_000 } else { 0 };
    let left = w.civs[si].stock_of(Good::Food);
    let mut rate_bp = if w.civs[si].knows_id("T007") { 150 } else { 250 };
    if w.civs[si].est_id("C010") {
        rate_bp = rate_bp * 2 / 3;
    }
    // salting (design chapter 36, 5.4): stored food spoils three tenths slower while
    // 0.2 t of salt per million rations in store is at hand; the salt is used up
    let salt_need = left.min(storage).max(0) / 5_000;
    if w.civs[si].knows_id("T007") && salt_need > 0 && w.civs[si].stock_of(Good::Salt) >= salt_need {
        w.civs[si].take(Good::Salt, salt_need);
        rate_bp = rate_bp * 7 / 10;
    }
    let mut spoil = left.min(storage) * rate_bp / 10_000;
    if left > storage {
        spoil += (left - storage) * 12 / 100;
    }
    w.civs[si].lose(Good::Food, spoil);

    // armies feel shortages too
    for a in w.armies.iter_mut().filter(|a| a.owner == seat) {
        a.supply_bp = ((a.supply_bp as i64 * 2 + food_bp) / 3) as u16;
    }

    let (child_mult, adult_mult) = mortality_tech(&w.civs[si]);
    let child_gain = 10_000 - child_mult;
    let lifelong = w.civs[si].est_id("C046");
    // customary fertility: practices of the civilization; doctrines per block below
    let custom_civ = CUSTOMARY_FERTILITY + if w.civs[si].est_id("C002") { 230 } else { 0 } - if w.civs[si].est_id("C039") { 150 } else { 0 };
    let custom_civ = custom_civ * crate::sim::eras::custom_bp(&w.civs[si]) / 10_000;
    let dev_add = crate::sim::eras::dev_add(&w.civs[si]);
    let prosperity = prosperity_bp(&w.civs[si]);
    let doctrine: Vec<i64> = w
        .religions
        .iter()
        .map(|rel| rel.beliefs.iter().map(|b| match b.as_str() {
            "fruitful_households" => 600,
            "day_of_rest" => 230,
            _ => 0,
        }).sum())
        .collect();
    let medicine = w.civs[si].stock_of(Good::Medicine) > 0;
    // households judge their own food security (ruleset 3.0 slice 6r): whether they
    // have eaten in full over the past year and whether a season's buffer is in
    // store, never the reserve the government's policy aims for. The buffer is what
    // the stores can hold at most: a people without granaries is not anxious about
    // a reserve it has nowhere to keep.
    let mut buffer_milli = HOUSEHOLD_BUFFER_MONTHS * 1000;
    if need > 0 {
        buffer_milli = buffer_milli.min((storage * 9 / 10 * 1000 / need).max(100));
    }
    let reserve_months_milli = if need > 0 { w.civs[si].stock_of(Good::Food).max(0) * 1000 / need } else { 12_000 };
    let store_term = (reserve_months_milli * 10_000 / buffer_milli.max(1)).clamp(0, 10_000);
    // per-capita supply: fields and works that raised a twentieth more than everyone
    // eats this month make households as secure as a full buffer would
    let made: i64 = regs.iter().map(|i| w.regions[*i].last.food_made).sum();
    let supply_term = if need > 0 { ((made * 10_000 / need - 9_500) * 10).clamp(0, 10_000) } else { 10_000 };
    let store_term = store_term.max(supply_term);
    let (mut diag_food, mut diag_int, mut diag_cap, mut diag_land) = (0i64, 0i64, 0i64, 0i64);
    let lineage_default = w.civs[si].lineage;

    let mut births_total = 0u32;
    let mut deaths_total = 0u32;
    let mut causes = [0u32; 4];
    let mut food_weighted: i64 = 0;
    let mut water_weighted: i64 = 0;

    let capacities: Vec<i64> = regs.iter().map(|ri| carrying_capacity(w, seat, *ri)).collect();
    let sizes = crate::sim::cities::month_sizes(w).into_owned();
    for (k, &ri) in regs.iter().enumerate() {
        // the Malthusian brake fades as children survive: households that expect
        // their children to live plan families by other things than the land
        // (ruleset 3.0 slice 6r)
        let land = 10_000 + (land_factor(w.regions[ri].population() as i64, capacities[k]) - 10_000) * (10_000 - ((child_gain - LAND_FADE_FROM_BP) * 2).clamp(0, 10_000)) / 10_000;
        let secret = w.secret;
        let smoke_bp = crate::sim::eras::urban_mortality_bp(w, seat, ri);
        let town_weight = crate::sim::cities::mortality_weight(crate::sim::cities::class_of(sizes[ri]));
        let rpop0 = w.regions[ri].population() as i64;
        let food_bp = if rpop0 > 0 { food_bp * reach[k] / rpop0 } else { food_bp };
        let mut died = [0u32; NQ];
        let working_deaths;
        let working;
        {
            let r = &mut w.regions[ri];
            let rpop = r.population();
            if rpop == 0 {
                r.food_hist[slot] = 10_000;
                r.water_hist[slot] = 10_000;
                continue;
            }
            // Without shared stores the shortfall lands hardest on low-access households.
            let debt_gain = if food_bp >= 10_000 {
                0
            } else {
                let miss = (10_000 - food_bp) * rpop as i64 / 10;
                if shared { miss } else { miss * 13 / 10 }
            };
            r.nutrition_debt += debt_gain;
            if food_bp >= 10_000 {
                r.nutrition_debt -= (r.nutrition_debt / 8).max(rpop as i64 * 40).min(r.nutrition_debt);
            } else {
                // households recover from a lasting small shortfall as from a famine
                // that has passed: the debt settles where a year of the month's gap
                // would put it, instead of growing without end (job 4b)
                r.nutrition_debt -= (r.nutrition_debt / 12).min(r.nutrition_debt);
            }
            let wcap = water_capacity(r).max(1);
            let water_bp = ratio_bp(wcap as i64, rpop as i64);
            let food_seen = if provision { food_bp.max(food_bp + (10_000 - food_bp) / 4) } else { food_bp };
            r.food_hist[slot] = food_seen as u16;
            r.water_hist[slot] = water_bp as u16;
            food_weighted += food_seen * rpop as i64;
            water_weighted += water_bp * rpop as i64;

            // health pressure from crowding, eased by care
            let crowd = rpop as i64 * 10_000 / wcap as i64;
            let mut pressure = ((crowd - 8000) * 12 / 10).clamp(0, 8000);
            let debt_pc = r.nutrition_debt / rpop as i64; // thousandths of a month of missed food per person
            let healers = if crate::sim::culture::region_belief(&w.religions, r, "healers_order") { HEALERS_ORDER_CARE } else { 0 };
            let med = if medicine { 2 } else { 1 };
            let c = content();
            let care_of = |key: &str, each: i64| r.fac(c.f(key)).filter(|f| f.enabled).map(|f| f.level as i64 * each * (f.condition_bp as i64).max(3000) / 10_000).unwrap_or(0);
            let (clinic_cap, hospital_cap) = (care_of("clinic", 800_000) + healers, care_of("hospital", 4_000_000));
            let coverage = ratio_bp((r.cap(Cap::Health) + healers) * med, rpop as i64);
            pressure = pressure * (10_000 - coverage / 2) / 10_000;
            r.health_bp = pressure as u16;
            // M_hazard: crowding and hunger
            let hazard = 10_000 + pressure * 15 / 10 + debt_pc * 40;
            // M_care: healers' lodges ease every death a little, hospitals more
            let care = 10_000 - (ratio_bp(clinic_cap * med, rpop as i64) * 1_000 / 10_000 + ratio_bp(hospital_cap * med, rpop as i64) * 3_000 / 10_000).min(3_500);
            // M_urban: a town of non-farmers without sewers is a population sink
            let urban = urban_share(r);
            let sanitation = ratio_bp(sanitation_capacity(r), rpop as i64);
            let m_urban = (10_000 + 5_000 * urban * (10_000 - sanitation) / 100_000_000 * town_weight / 10_000) * smoke_bp / 10_000;
            // M_outbreak: an epidemic raises deaths in every band
            let m_outbreak = r.outbreak.as_ref().map(|o| o.severity_bp as i64).unwrap_or(10_000);

            // ---- births --------------------------------------------------------
            working = r.working().max(1);
            // food security: the past year's access in this region (its food history),
            // and the season's buffer in store; a people living from hand to mouth with
            // full meals has most of it, hunger takes it away
            let access = r.food_hist.iter().map(|x| *x as i64).sum::<i64>() / r.food_hist.len().max(1) as i64;
            let secure = (access.min(10_000) * (FOOD_SECURE_BASE + (10_000 - FOOD_SECURE_BASE) * store_term / 10_000) / 10_000).clamp(300, 10_000);
            let food_factor = if food_bp >= 10_000 { secure } else { ((food_bp - 6000).max(0) * 10_000 / 4000 * 6 / 10 + 2000).min(secure) };
            let crowd_factor = if crowd <= 8500 { 10_000 } else { (10_000 - (crowd - 8500) * 2).max(2500) };
            let dev_factor = (development_factor(literate_share(r), urban, child_gain, prosperity, lifelong) + dev_add).min(10_000);
            let health_factor = (10_000 - pressure / 4).max(6000);
            {
                let wgt = rpop as i64;
                diag_food += food_factor * wgt;
                diag_int += (custom_civ * food_factor / 10_000 * crowd_factor / 10_000 * dev_factor / 10_000 * land / 10_000) * wgt;
                diag_cap += rpop as i64 * 10_000 / capacities[k].max(1) * wgt;
                diag_land += land * wgt;
            }
            let mut region_births = 0u32;
            let mut region_deaths = 0u32;
            let mut wdeaths = 0u32;
            for b in r.blocks.iter_mut() {
                let custom = (custom_civ + b.religion.and_then(|x| doctrine.get(x as usize)).copied().unwrap_or(0)).clamp(400, 10_000);
                let intensity = (custom * food_factor / 10_000 * crowd_factor / 10_000 * dev_factor / 10_000 * land / 10_000).clamp(400, 10_000) as u16;
                let lagged = b.birth_hist[0] as i64;
                for i in 0..8 {
                    b.birth_hist[i] = b.birth_hist[i + 1];
                }
                b.birth_hist[8] = intensity;
                let eq: i64 = b.ages[16..=40].iter().map(|n| *n as i64).sum::<i64>() * 500; // thousandths of reproductive equivalents
                // 0.030 births per equivalent per month at full intensity
                let expected = eq * 30 / 1000 * lagged / 10_000 * health_factor / 10_000;
                let births = carry_round(expected, &mut b.birth_rem);

                // ---- combined mortality -----------------------------------------
                for (bi, (lo, hi, base)) in BANDS.iter().enumerate() {
                    let count: u32 = b.ages[*lo..=*hi].iter().sum();
                    if count == 0 {
                        continue;
                    }
                    let mult = if *hi <= 14 { child_mult } else { adult_mult };
                    // per 100,000 a month, in thousandths so that low modern rates keep precision:
                    // base x M_tech x M_care, then x M_hazard, x M_urban, x M_outbreak
                    let r2 = base * 1000 * mult / 10_000 * care / 10_000;
                    let r3 = r2 * hazard / 10_000;
                    let r4 = r3 * m_urban / 10_000;
                    let rate = r4 * m_outbreak / 10_000;
                    let expected = count as i64 * rate / 100_000; // thousandths of deaths
                    let mut deaths = carry_round(expected, &mut b.death_rem[bi]).min(count);
                    region_deaths += deaths;
                    // the deaths by cause: what each factor added, shared out exactly
                    let parts = [r2, r3 - r2, r4 - r3, rate - r4];
                    let total_w: i64 = parts.iter().sum::<i64>().max(1);
                    let mut given = 0u32;
                    for (ci, part) in parts.iter().enumerate() {
                        let share = if ci == 3 { deaths - given } else { (deaths as i64 * part / total_w) as u32 };
                        causes[ci] += share;
                        given += share;
                    }
                    // take proportionally from the band's cells, oldest first for the remainder
                    let mut rem: u64 = 0;
                    let total = count as u64;
                    let want = deaths as u64;
                    for age in (*lo..=*hi).rev() {
                        let have = b.ages[age] as u64;
                        let x = have * want + rem;
                        let take = (x / total).min(have).min(deaths as u64) as u32;
                        rem = x % total;
                        b.ages[age] -= take;
                        deaths -= take;
                        if (WORK_MIN_AGE..=WORK_MAX_AGE).contains(&age) {
                            wdeaths += take;
                        }
                    }
                    if deaths > 0 {
                        for age in (*lo..=*hi).rev() {
                            let take = deaths.min(b.ages[age]);
                            b.ages[age] -= take;
                            deaths -= take;
                            if (WORK_MIN_AGE..=WORK_MAX_AGE).contains(&age) {
                                wdeaths += take;
                            }
                        }
                    }
                }
                b.ages[0] += births;
                region_births += births;
            }
            // qualified people die with everybody else
            if wdeaths > 0 {
                for q in 0..NQ {
                    let have = r.quals[q] as u64;
                    if have == 0 {
                        continue;
                    }
                    let x = have * wdeaths as u64 * 1000 / working as u64; // milli
                    let whole = (x / 1000) as u32;
                    let frac = x % 1000;
                    let extra = if draw_range(secret, &[stream("qual-loss"), ri as u64, q as u64, month as u64], 1000) < frac { 1 } else { 0 };
                    let loss = (whole + extra).min(r.quals[q].saturating_sub(r.teachers[q]));
                    r.quals[q] -= loss;
                    died[q] = loss;
                }
            }
            working_deaths = wdeaths;
            births_total += region_births;
            deaths_total += region_deaths;
        }
        for q in 0..NQ {
            w.civs[si].qual_flows.died[q] += died[q] as i64;
        }
        // and so do learners
        if working_deaths > 0 {
            let learners = (w.regions[ri].students as u64 * working_deaths as u64 / working as u64) as u32;
            shed_students(w, ri, learners);
        }
        reconcile_roles(w, ri, QualExit::Died);

        // ---- annual ageing ----------------------------------------------------
        if month % 12 == 0 && month > 0 {
            let mut retired = [0u32; NQ];
            {
                let r = &mut w.regions[ri];
                let retiring: u32 = r.blocks.iter().map(|b| b.ages[WORK_MAX_AGE]).sum();
                let working_now = r.working().max(1);
                for b in r.blocks.iter_mut() {
                    b.ages[80] += b.ages[79];
                    for age in (1..80).rev() {
                        b.ages[age] = b.ages[age - 1];
                    }
                    b.ages[0] = 0;
                }
                if retiring > 0 {
                    for q in 0..NQ {
                        let have = r.quals[q] as u64;
                        if have == 0 {
                            continue;
                        }
                        let x = have * retiring as u64 * 1000 / working_now as u64;
                        let whole = (x / 1000) as u32;
                        let extra = if draw_range(secret, &[stream("retire"), ri as u64, q as u64, month as u64], 1000) < x % 1000 { 1 } else { 0 };
                        let loss = (whole + extra).min(r.quals[q].saturating_sub(r.teachers[q]));
                        r.quals[q] -= loss;
                        retired[q] = loss;
                    }
                }
            }
            for q in 0..NQ {
                w.civs[si].qual_flows.retired[q] += retired[q] as i64;
            }
            reconcile_roles(w, ri, QualExit::Retired);
        }
        let r = &mut w.regions[ri];
        r.blocks.retain(|b| b.total() > 0);
        if r.blocks.is_empty() {
            r.blocks.push(PopBlock::new(lineage_default, None));
        }
    }

    let civ = &mut w.civs[si];
    civ.flows.births += births_total;
    civ.flows.deaths += deaths_total;
    for (ci, n) in causes.iter().enumerate() {
        civ.flows.deaths_cause[ci] += *n;
    }
    if pop > 0 {
        civ.food_ful_bp = (food_weighted / pop as i64) as u16;
        civ.water_ful_bp = (water_weighted / pop as i64) as u16;
        let p = pop as i64;
        civ.diag = crate::state::CivDiag { fert_food_bp: diag_food / p, fert_intensity_bp: diag_int / p, cap_ratio_bp: diag_cap / p, land_bp: diag_land / p };
    }
    civ.pop_peak = civ.pop_peak.max(pop as u64);
    if food_bp >= 10_000 && civ.stock_of(Good::Food) >= need * 6 {
        civ.surplus_streak += 1;
    } else {
        civ.surplus_streak = 0;
    }
    if food_bp < 8000 {
        civ.famine_streak += 1;
    } else {
        civ.famine_streak = 0;
    }
}
