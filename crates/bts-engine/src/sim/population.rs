//! Aggregate population: food and water access, births with a nine-month lag,
//! one combined mortality calculation, annual ageing and migration. People are
//! conserved: every flow moves or removes counts from the same age vectors.

use crate::content::Cap;
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

/// Monthly baseline deaths per 100,000 by age band.
const BANDS: [(usize, usize, i64); 6] = [(0, 0, 900), (1, 4, 180), (5, 14, 50), (15, 49, 55), (50, 64, 160), (65, 80, 620)];

pub fn water_capacity(r: &Region) -> u32 {
    r.water + (r.cap(Cap::Water) / 1000) as u32
}

/// Move `count` people from one region to another, proportionally across blocks,
/// ages and qualifications. Returns the number actually moved.
pub fn move_people(regions: &mut [Region], from: usize, to: usize, count: u32, adults_bias: bool) -> u32 {
    if from == to {
        return 0;
    }
    let pop = regions[from].population();
    if pop == 0 || count == 0 {
        return 0;
    }
    let count = count.min(pop.saturating_sub(10));
    if count == 0 {
        return 0;
    }
    let working_before = regions[from].working();
    let mut moved_total = 0u32;
    let mut moved_working = 0u32;
    let mut carried: Vec<PopBlock> = Vec::new();
    // Eligible pool: everyone, or mostly adults of working age and their children for settlers.
    let pool: u32 = if adults_bias {
        regions[from].blocks.iter().map(|b| b.ages[..50].iter().sum::<u32>()).sum()
    } else {
        pop
    };
    if pool == 0 {
        return 0;
    }
    let count = count.min(pool);
    let mut rem: u64 = 0;
    for b in regions[from].blocks.iter_mut() {
        let mut out = PopBlock::new(b.lineage, b.religion);
        out.birth_hist = b.birth_hist;
        let limit = if adults_bias { 50 } else { AGES };
        for age in 0..limit {
            let have = b.ages[age] as u64;
            if have == 0 {
                continue;
            }
            let x = have * count as u64 + rem;
            let take = (x / pool as u64).min(have) as u32;
            rem = x % pool as u64;
            b.ages[age] -= take;
            out.ages[age] += take;
            moved_total += take;
            if (WORK_MIN_AGE..=WORK_MAX_AGE).contains(&age) {
                moved_working += take;
            }
        }
        if out.total() > 0 {
            carried.push(out);
        }
    }
    // qualifications follow the working-age people who actually moved
    if working_before > 0 && moved_working > 0 {
        for q in 0..NQ {
            let free = regions[from].quals[q].saturating_sub(regions[from].teachers[q]);
            let take = (free as u64 * moved_working as u64 / working_before as u64) as u32;
            regions[from].quals[q] -= take;
            regions[to].quals[q] += take;
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
    moved_total
}

/// Move `count` working adults (aged 20–55) between regions, keeping their lineage and religion.
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

/// Remove `count` working-age adults from a region (recruitment). Returns the number removed.
pub fn draw_adults(r: &mut Region, count: u32) -> u32 {
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
    let pop: u32 = regs.iter().map(|i| w.regions[*i].population()).sum();

    // ---- food ---------------------------------------------------------------
    let need = (pop + soldiers) as i64 * 1000;
    let have = w.civs[si].stock_of(Good::Food).max(0);
    let food_bp = if need == 0 { 10_000 } else { ratio_bp(have, need) };
    w.civs[si].take(Good::Food, need.min(have));
    let shared = w.civs[si].est_id("C004");
    let provision = w.civs[si].est_id("C039");
    // spoilage on what remains
    let storage: i64 = regs.iter().map(|i| w.regions[*i].cap(Cap::Storage) + 400_000).sum::<i64>()
        + if crate::sim::culture::belief_share(w, seat, "grain_oath") > 2000 { 800_000 } else { 0 };
    let left = w.civs[si].stock_of(Good::Food);
    let mut rate_bp = if w.civs[si].knows_id("T007") { 150 } else { 250 };
    if w.civs[si].est_id("C010") {
        rate_bp = rate_bp * 2 / 3;
    }
    let mut spoil = left.min(storage) * rate_bp / 10_000;
    if left > storage {
        spoil += (left - storage) * 12 / 100;
    }
    w.civs[si].take(Good::Food, spoil);

    // armies feel shortages too
    for a in w.armies.iter_mut().filter(|a| a.owner == seat) {
        a.supply_bp = ((a.supply_bp as i64 * 2 + food_bp) / 3) as u16;
    }

    let k = |id: &str| w.civs[si].knows_id(id);
    let mut child_mult: i64 = 10_000;
    let mut adult_mult: i64 = 10_000;
    for (id, c, a) in [("T032", 9300, 9600), ("T033", 9000, 9500), ("T046", 9200, 9500), ("T053", 8500, 9300), ("T069", 8800, 9300), ("T070", 8000, 9000), ("T136", 9000, 8500)] {
        if k(id) {
            child_mult = child_mult * c / 10_000;
            adult_mult = adult_mult * a / 10_000;
        }
    }
    if w.civs[si].est_id("C002") {
        child_mult = child_mult * 95 / 100;
    }
    let medicine = w.civs[si].stock_of(Good::Medicine) > 0;
    let reserve_target_milli = (w.civs[si].food_reserve_months as i64).clamp(2, 12) * 1000;
    let reserve_months_milli = if need > 0 { w.civs[si].stock_of(Good::Food).max(0) * 1000 / need } else { 12_000 };
    let lineage_default = w.civs[si].lineage;

    let mut births_total = 0u32;
    let mut deaths_total = 0u32;
    let mut food_weighted: i64 = 0;
    let mut water_weighted: i64 = 0;

    for &ri in &regs {
        let secret = w.secret;
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
        }
        let wcap = water_capacity(r).max(1);
        let water_bp = ratio_bp(wcap as i64, rpop as i64);
        let food_seen = if provision { food_bp.max(food_bp + (10_000 - food_bp) / 4) } else { food_bp };
        r.food_hist[slot] = food_seen as u16;
        r.water_hist[slot] = water_bp as u16;
        food_weighted += food_seen * rpop as i64;
        water_weighted += water_bp * rpop as i64;

        // health pressure
        let crowd = rpop as i64 * 10_000 / wcap as i64;
        let mut pressure = ((crowd - 8000) * 12 / 10).clamp(0, 8000);
        let debt_pc = r.nutrition_debt / rpop as i64; // milli-months of missed food per person
        let hcap = (r.cap(Cap::Health) / 1000) as i64 + if crate::sim::culture::region_belief(&w.religions, r, "healers_order") { 800 } else { 0 };
        let coverage = ratio_bp(hcap * if medicine { 2 } else { 1 }, rpop as i64);
        pressure = pressure * (10_000 - coverage / 2) / 10_000;
        r.health_bp = pressure as u16;
        let hazard = 10_000 + pressure * 15 / 10 + debt_pc * 40;

        // ---- births --------------------------------------------------------
        let working = r.working().max(1);
        let educated: u32 = [Qual::Literate, Qual::Scribe, Qual::Teacher, Qual::Scholar, Qual::Researcher, Qual::Scientist, Qual::Mechanic, Qual::Technician, Qual::Electrician, Qual::Programmer, Qual::Physician, Qual::AiEngineer, Qual::Orbital, Qual::FtlEngineer]
            .iter()
            .map(|q| r.quals[q.index()])
            .sum::<u32>()
            + r.students;
        let edu_bp = (educated as i64 * 10_000 / working as i64).min(10_000);
        // thin stores make households cautious well before anyone goes hungry
        let secure = (reserve_months_milli * 10_000 / reserve_target_milli).clamp(1200, 10_000);
        let food_factor = if food_bp >= 10_000 { secure } else { ((food_bp - 6000).max(0) * 10_000 / 4000 * 6 / 10 + 2000).min(secure) };
        let crowd_factor = if crowd <= 8500 { 10_000 } else { (10_000 - (crowd - 8500) * 2).max(2500) };
        let dev_factor = (10_000 - edu_bp * 7 / 10).max(2800);
        let intensity = (food_factor * crowd_factor / 10_000 * dev_factor / 10_000).clamp(1500, 10_000) as u16;
        let health_factor = (10_000 - pressure / 4).max(6000);
        let mut region_births = 0u32;
        let mut region_deaths = 0u32;
        let mut working_deaths = 0u32;
        for b in r.blocks.iter_mut() {
            let lagged = b.birth_hist[0] as i64;
            for i in 0..8 {
                b.birth_hist[i] = b.birth_hist[i + 1];
            }
            b.birth_hist[8] = intensity;
            let eq: i64 = b.ages[16..=40].iter().sum::<u32>() as i64 * 500; // milli reproductive equivalents
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
                let rate = base * mult / 10_000 * hazard / 10_000; // per 100k
                let expected = count as i64 * rate / 100; // milli deaths
                let mut deaths = carry_round(expected, &mut b.death_rem[bi]).min(count);
                region_deaths += deaths;
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
                        working_deaths += take;
                    }
                }
                if deaths > 0 {
                    for age in (*lo..=*hi).rev() {
                        let take = deaths.min(b.ages[age]);
                        b.ages[age] -= take;
                        deaths -= take;
                        if (WORK_MIN_AGE..=WORK_MAX_AGE).contains(&age) {
                            working_deaths += take;
                        }
                    }
                }
            }
            b.ages[0] += births;
            region_births += births;
        }
        // qualified people die with everybody else
        if working_deaths > 0 {
            for q in 0..NQ {
                let have = r.quals[q] as u64;
                if have == 0 {
                    continue;
                }
                let x = have * working_deaths as u64 * 1000 / working as u64; // milli
                let whole = (x / 1000) as u32;
                let frac = x % 1000;
                let extra = if draw_range(secret, &[stream("qual-loss"), ri as u64, q as u64, month as u64], 1000) < frac { 1 } else { 0 };
                let loss = (whole + extra).min(r.quals[q].saturating_sub(r.teachers[q]));
                r.quals[q] -= loss;
            }
        }
        births_total += region_births;
        deaths_total += region_deaths;

        // ---- annual ageing ----------------------------------------------------
        if month % 12 == 0 && month > 0 {
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
                }
            }
        }
        r.blocks.retain(|b| b.total() > 0);
        if r.blocks.is_empty() {
            r.blocks.push(PopBlock::new(lineage_default, None));
        }
    }

    // ---- migration within the polity -------------------------------------------
    let mut migrated = 0i32;
    for &ri in &regs {
        let rpop = w.regions[ri].population();
        if rpop < 120 {
            continue;
        }
        let crowd = rpop as i64 * 10_000 / water_capacity(&w.regions[ri]).max(1) as i64;
        // food-limited pressure: more people than local livelihoods
        let foragers_cap = w.regions[ri].wild / 2600;
        let fields = w.regions[ri].fac_level("fields") as i64 * 10 + w.regions[ri].fac_level("pasture") as i64 * 5 + w.regions[ri].fac_level("fishery") as i64 * 8;
        let livelihoods = (foragers_cap + fields).max(1);
        let food_pressure = w.regions[ri].last.labor.food as i64 * 10_000 / livelihoods;
        let push = crowd.max(if food_pressure > 9500 { 9000 } else { 0 });
        if push < 8000 {
            continue;
        }
        let mut best: Option<(i64, usize)> = None;
        for (nb, _) in w.regions[ri].neighbors.clone() {
            let nb = nb as usize;
            if w.regions[nb].controller != Some(seat) {
                continue;
            }
            let npop = w.regions[nb].population() as i64;
            let ncrowd = npop * 10_000 / water_capacity(&w.regions[nb]).max(1) as i64;
            if ncrowd + 2500 < push && best.map(|(c, _)| ncrowd < c).unwrap_or(true) {
                best = Some((ncrowd, nb));
            }
        }
        if let Some((_, nb)) = best {
            let want = rpop as i64 * 12 + w.regions[ri].migr_rem; // 1.2% per month, milli
            let whole = (want / 1000) as u32;
            w.regions[ri].migr_rem = want % 1000;
            let moved = move_people(&mut w.regions, ri, nb, whole, false);
            migrated += moved as i32;
        }
    }

    let civ = &mut w.civs[si];
    civ.flows.births += births_total;
    civ.flows.deaths += deaths_total;
    civ.flows.migration += migrated;
    if pop > 0 {
        civ.food_ful_bp = (food_weighted / pop as i64) as u16;
        civ.water_ful_bp = (water_weighted / pop as i64) as u16;
    }
    civ.pop_peak = civ.pop_peak.max(pop);
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
