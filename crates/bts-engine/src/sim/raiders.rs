//! Raider camps in unclaimed land (design chapter 40, section 5; lean scope of
//! chapter 41: no mercenaries, no integration).
//!
//! A camp is real people: population blocks of its own lineage in a region nobody
//! governs. Its warriors fight at 80% of the world's raider generation with arms
//! from a declared outside source that never enters any seat's stock. Camps raid
//! their neighbours by keyed draws, block settlement of their region, bud while the
//! world is young and end when cleared, subjugated or worn down.

use crate::content::{good_mass_kg, GEN_POWER};
use crate::sim::chronicle::brief;
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

/// Share of a camp's people aged 15-44 who fight.
pub const WARRIOR_SHARE_BP: i64 = 3_000;
/// Irregulars fight at this share of their generation's power.
pub const IRREGULAR_BP: i64 = 8_000;
/// A camp above this many people buds.
pub const BUD_PEOPLE: u32 = 40_000;
/// Monthly chance of a raid by a camp with enough warriors, basis points, and the
/// months a band rests at its camp after a raid (calibrated: design 5.4's 800 bp a
/// month with no rest took a fifth of a frontier seat's tools a year).
pub const RAID_BASE_BP: i64 = 800;
pub const RAID_REST_MONTHS: u32 = 24;
const RAID_MIN_WARRIORS: u32 = 1_000;
/// Plunder per raid: at most this share of each good, and this mass in all (kg).
const RAID_SHARE_BP: i64 = 200;
const RAID_MASS_KG: i64 = 50_000_000;
/// No camp buds after this year (astronomical).
pub const LAST_BUDDING_YEAR: i32 = 1700;
/// Goods raiders take.
pub const PLUNDER: [Good; 6] = [Good::Food, Good::Tools, Good::Metal, Good::Munitions, Good::FineWares, Good::Spices];

pub fn initial_count(regions: usize) -> usize {
    (regions / 12).max(1)
}

pub fn camp_cap(regions: usize) -> usize {
    (regions * 2 / 15).max(2)
}

/// Link distance from the nearest of `src` to every region (all link kinds).
fn distances(w: &World, src: &[usize]) -> Vec<u32> {
    let n = w.regions.len();
    let mut d = vec![u32::MAX; n];
    let mut q: Vec<usize> = Vec::new();
    for &s in src {
        if d[s] != 0 {
            d[s] = 0;
            q.push(s);
        }
    }
    let mut qi = 0;
    while qi < q.len() {
        let x = q[qi];
        qi += 1;
        for (nb, _) in &w.regions[x].neighbors {
            let nb = *nb as usize;
            if d[nb] == u32::MAX {
                d[nb] = d[x] + 1;
                q.push(nb);
            }
        }
    }
    d
}

const SYL: [&str; 16] = ["Kar", "Vel", "Dush", "Hol", "Mor", "Tar", "Esk", "Ul", "Rav", "Gor", "Sel", "Bran", "Oth", "Iv", "Zar", "Ked"];
const END: [&str; 8] = ["van", "ari", "ek", "un", "oth", "ess", "im", "ar"];

fn camp_name(w: &World, id: u32) -> String {
    let a = SYL[draw_range(w.secret, &[stream("camp-name"), id as u64, 0], SYL.len() as u64) as usize];
    let b = END[draw_range(w.secret, &[stream("camp-name"), id as u64, 1], END.len() as u64) as usize];
    format!("the {a}{b}")
}

fn new_lineage(w: &mut World, name: &str, region: usize) -> u16 {
    let li = w.lineages.len() as u16;
    let mut axes = [5_000i32; 8];
    // high mobility and martial honour (design 5.7)
    axes[2] = 7_000;
    axes[7] = 7_500;
    w.lineages.push(Lineage {
        name: format!("{} band", &name[4..]),
        origin: format!("A free people of {}", w.regions[region].name),
        home: 0,
        axes,
        drift_year: [0; 8],
        trait_since: [None; 8],
        trait_streak: [0; 8],
    });
    li
}

/// Place the initial camps of a new world (design 5.3): in unclaimed regions two or
/// more links from every start and three or more from each other, rough land first.
pub fn seed_camps(w: &mut World) {
    let starts: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].owner.is_some()).collect();
    if starts.is_empty() {
        return;
    }
    let from_starts = distances(w, &starts);
    let mut cands: Vec<(u64, usize)> = (0..w.regions.len())
        .filter(|i| w.regions[*i].owner.is_none() && from_starts[*i] >= 2 && from_starts[*i] != u32::MAX)
        .map(|i| {
            let rough = matches!(w.regions[i].terrain, Terrain::Hills | Terrain::Forest | Terrain::Marsh | Terrain::Steppe | Terrain::Mountains);
            (draw_range(w.secret, &[stream("camp-site"), i as u64], 1000) + if rough { 0 } else { 2000 }, i)
        })
        .collect();
    cands.sort();
    let want = initial_count(w.regions.len());
    let mut chosen: Vec<usize> = Vec::new();
    for (_, i) in cands {
        if chosen.len() >= want {
            break;
        }
        if !chosen.is_empty() && distances(w, &chosen)[i] < 3 {
            continue;
        }
        chosen.push(i);
    }
    for ri in chosen {
        let people = 6_000 + draw_range(w.secret, &[stream("camp-people"), ri as u64], 9_001) as u32;
        found(w, ri, crate::worldgen::start_pyramid(people), 0);
    }
}

/// Found a camp in `ri` with the given people (already counted as alive elsewhere
/// or newly recorded as initial free peoples by the caller).
pub(crate) fn found(w: &mut World, ri: usize, ages: [u32; AGES], month: Month) -> usize {
    let id = w.id();
    let name = camp_name(w, id);
    let lineage = new_lineage(w, &name, ri);
    let mut block = PopBlock::new(lineage, None);
    block.ages = ages;
    w.regions[ri].blocks.push(block);
    w.camps.push(Camp { id, region: ri as RegionId, name, lineage, plunder: Vec::new(), since: month, last_raid: 0, last_success: month, tribute: Vec::new(), morale_bp: 8_000 });
    w.camps.len() - 1
}

pub fn camp_at(w: &World, ri: usize) -> Option<usize> {
    w.camps.iter().position(|c| c.region as usize == ri)
}

pub fn people(w: &World, ci: usize) -> u32 {
    let c = &w.camps[ci];
    w.regions[c.region as usize].blocks.iter().filter(|b| b.lineage == c.lineage).map(|b| b.total()).sum()
}

pub fn warriors(w: &World, ci: usize) -> u32 {
    let c = &w.camps[ci];
    let fighting: i64 = w.regions[c.region as usize].blocks.iter().filter(|b| b.lineage == c.lineage).map(|b| b.ages[15..45].iter().map(|x| *x as i64).sum::<i64>()).sum();
    (fighting * WARRIOR_SHARE_BP / 10_000) as u32
}

/// Power of a camp's warriors (thousandths per soldier times soldiers, as armies).
pub fn power(w: &World, ci: usize) -> i64 {
    warriors(w, ci) as i64 * GEN_POWER[w.raider_gen as usize] / 1000 * IRREGULAR_BP / 10_000 * w.camps[ci].morale_bp.max(2_000) as i64 / 10_000
}

/// Kill up to `n` warriors of a camp (battle deaths, outside every seat's books).
pub fn kill_warriors(w: &mut World, ci: usize, n: u32) -> u32 {
    let (ri, li) = (w.camps[ci].region as usize, w.camps[ci].lineage);
    let pool: u64 = w.regions[ri].blocks.iter().filter(|b| b.lineage == li).map(|b| b.ages[15..45].iter().map(|x| *x as u64).sum::<u64>()).sum();
    if pool == 0 || n == 0 {
        return 0;
    }
    let n = (n as u64).min(pool);
    let mut rem = 0u64;
    let mut killed = 0u32;
    for b in w.regions[ri].blocks.iter_mut().filter(|b| b.lineage == li) {
        for age in 15..45 {
            let have = b.ages[age] as u64;
            let x = have * n + rem;
            let k = (x / pool).min(have) as u32;
            rem = x % pool;
            b.ages[age] -= k;
            killed += k;
        }
    }
    w.wild.deaths += killed as u64;
    killed
}

fn wild_vec(v: &mut Vec<i64>) -> &mut Vec<i64> {
    if v.len() < NG {
        v.resize(NG, 0);
    }
    v
}

fn store_add(c: &mut Camp, g: Good, a: i64) {
    if a <= 0 {
        return;
    }
    match c.plunder.iter_mut().find(|x| x.0 == g) {
        Some(x) => x.1 += a,
        None => c.plunder.push((g, a)),
    }
}

/// Recompute the raider generation every January (design 5.2): the median of the
/// active seats' best fielded generation, floored at the laggard's and capped one
/// below the leader's; a change takes effect after holding ten years.
pub(crate) fn update_generation(w: &mut World) {
    let mut best: Vec<u8> = (0..w.civs.len())
        .filter(|s| w.civs[*s].status != SeatStatus::Eliminated)
        .map(|s| w.armies.iter().filter(|a| a.owner as usize == s).map(|a| a.tier).max().unwrap_or(0))
        .collect();
    if best.is_empty() {
        return;
    }
    best.sort_unstable();
    let n = best.len();
    let med = (best[(n - 1) / 2] + best[n / 2]) / 2;
    let g = med.max(best[0]).min(best[best.len() - 1].saturating_sub(1));
    if g == w.raider_gen {
        w.raider_gen_next = (g, w.month);
    } else if w.raider_gen_next.0 != g {
        w.raider_gen_next = (g, w.month);
    } else if w.month >= w.raider_gen_next.1 + 120 {
        w.raider_gen = g;
    }
}

/// One year of births, deaths and ageing in a camp's blocks.
fn demography(w: &mut World, ci: usize) {
    let (ri, li) = (w.camps[ci].region as usize, w.camps[ci].lineage);
    let pop = people(w, ci) as i64;
    let food: i64 = w.camps[ci].plunder.iter().filter(|x| x.0 == Good::Food).map(|x| x.1).sum();
    let capacity = w.regions[ri].wild / 10 + w.regions[ri].pasture as i64 * 200 + 5_000 + food / 12;
    let crowded = pop > capacity;
    let mut births = 0u64;
    let mut deaths = 0u64;
    for b in w.regions[ri].blocks.iter_mut().filter(|b| b.lineage == li) {
        let adults: u64 = b.ages[15..45].iter().map(|x| *x as u64).sum();
        let born = adults * if crowded { 200 } else { 650 } / 10_000;
        for age in (0..AGES).rev() {
            let rate: u64 = match age {
                0..=4 => 400,
                5..=49 => 100,
                50..=64 => 500,
                _ => 1_500,
            } + if crowded { 300 } else { 0 };
            let d = if age == AGES - 1 { b.ages[age] as u64 } else { b.ages[age] as u64 * rate / 10_000 };
            b.ages[age] -= d as u32;
            deaths += d;
            if age + 1 < AGES {
                b.ages[age + 1] += b.ages[age];
                b.ages[age] = 0;
            }
        }
        b.ages[0] = born as u32;
        births += born;
    }
    w.wild.births += births;
    w.wild.deaths += deaths;
}

/// Bud a new camp from a crowded one (design 5.3): 40% of its people, all ages, into
/// an adjacent unclaimed region nobody observes this month and two or more links
/// from every governed region.
fn bud(w: &mut World, ci: usize, cap: usize) {
    if w.camps.len() >= cap {
        return;
    }
    let (ri, li) = (w.camps[ci].region as usize, w.camps[ci].lineage);
    let month = w.month;
    let governed: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].controller.is_some()).collect();
    let d = distances(w, &governed);
    let target = w.regions[ri].neighbors.iter().map(|(n, _)| *n as usize).filter(|n| {
        let r = &w.regions[*n];
        r.owner.is_none() && r.controller.is_none() && camp_at(w, *n).is_none() && d[*n] >= 2 && w.civs.iter().all(|c| c.memory[*n].last_seen != month || !c.memory[*n].seen)
    }).min();
    let Some(t) = target else { return };
    let mut ages = [0u32; AGES];
    for b in w.regions[ri].blocks.iter_mut().filter(|b| b.lineage == li) {
        for a in 0..AGES {
            let m = b.ages[a] * 4 / 10;
            b.ages[a] -= m;
            ages[a] += m;
        }
    }
    // the band keeps its people's lineage: `found` starts a new one, so fold it back
    let nc = found(w, t, ages, month);
    let new_li = w.camps[nc].lineage;
    for b in w.regions[t].blocks.iter_mut().filter(|b| b.lineage == new_li) {
        b.lineage = li;
    }
    w.camps[nc].lineage = li;
    w.lineages.pop();
}

/// The governed region nearest to `ri` by links (ties by region id).
fn nearest_governed(w: &World, ri: usize) -> Option<usize> {
    let d = distances(w, &[ri]);
    (0..w.regions.len()).filter(|i| w.regions[*i].controller.is_some() && d[*i] != u32::MAX).min_by_key(|i| (d[*i], *i))
}

/// People leave a camp for a seat's region as immigrants (decline, dispersal).
fn emigrate(w: &mut World, ci: usize, to: usize, count: u32, refugees: bool) -> u32 {
    let (ri, li) = (w.camps[ci].region as usize, w.camps[ci].lineage);
    let pool: u64 = w.regions[ri].blocks.iter().filter(|b| b.lineage == li).map(|b| b.total() as u64).sum();
    if pool == 0 || count == 0 {
        return 0;
    }
    let n = (count as u64).min(pool);
    let mut moved = [0u32; AGES];
    let mut rem = 0u64;
    let mut total = 0u32;
    for b in w.regions[ri].blocks.iter_mut().filter(|b| b.lineage == li) {
        for a in 0..AGES {
            let have = b.ages[a] as u64;
            let x = have * n + rem;
            let k = (x / pool).min(have) as u32;
            rem = x % pool;
            b.ages[a] -= k;
            moved[a] += k;
            total += k;
        }
    }
    let mut block = PopBlock::new(li, None);
    block.ages = moved;
    match w.regions[to].blocks.iter_mut().find(|b| b.lineage == li) {
        Some(b) => {
            for a in 0..AGES {
                b.ages[a] += moved[a];
            }
        }
        None => w.regions[to].blocks.push(block),
    }
    w.wild.migrated_out += total as u64;
    if let Some(s) = w.regions[to].controller {
        // (refugees are counted among a seat's own movers; these come from outside)
        w.civs[s as usize].flows.immigrated += total;
    }
    let _ = refugees;
    total
}

/// End a camp: what is left of its store is abandoned and its people (if any)
/// leave for `to`.
fn end_camp(w: &mut World, ci: usize, to: Option<usize>, recovered_by: Option<SeatId>) {
    let rest = people(w, ci);
    if let Some(t) = to {
        emigrate(w, ci, t, rest, true);
    }
    let store = std::mem::take(&mut w.camps[ci].plunder);
    for (g, a) in store {
        match recovered_by {
            Some(s) => {
                w.civs[s as usize].add(g, a);
                wild_vec(&mut w.wild.recovered)[g.index()] += a;
            }
            None => wild_vec(&mut w.wild.abandoned)[g.index()] += a,
        }
    }
    w.camps.remove(ci);
}

/// A camp broken in battle by `seat` (design 5.6): its plunder is recovered and its
/// survivors either leave as refugees or become the seat's subjects with the land.
pub fn broken(w: &mut World, ci: usize, seat: SeatId) {
    let ri = w.camps[ci].region as usize;
    let name = w.camps[ci].name.clone();
    let rname = w.regions[ri].name.clone();
    if w.civs[seat as usize].subjugate_camps {
        let store = std::mem::take(&mut w.camps[ci].plunder);
        for (g, a) in store {
            w.civs[seat as usize].add(g, a);
            wild_vec(&mut w.wild.recovered)[g.index()] += a;
        }
        let survivors = people(w, ci);
        w.camps.remove(ci);
        // the land comes with its people: they become residents the seat governs
        w.wild.migrated_out += survivors as u64;
        w.civs[seat as usize].flows.immigrated += survivors;
        w.regions[ri].owner = Some(seat);
        w.set_controller(ri, Some(seat));
        w.regions[ri].unrest_bp = 6_000;
        brief(w, seat, "good", format!("{rname} subjugated"), format!("The camp of {name} is broken; its {} survivors are now our subjects and the land is ours to govern.", group(survivors as i64)), Some(ri as RegionId), "military");
    } else {
        // refugees go to the most populous governed neighbour, or to the victor's capital
        let to = w.regions[ri].neighbors.iter().map(|(n, _)| *n as usize).filter(|n| w.regions[*n].controller.is_some()).max_by_key(|n| (w.regions[*n].population(), std::cmp::Reverse(*n))).unwrap_or(w.civs[seat as usize].capital as usize);
        end_camp(w, ci, Some(to), Some(seat));
        brief(w, seat, "good", format!("Raiders scattered at {rname}"), format!("The camp of {name} is broken and its plunder recovered. The land is free to settle."), Some(ri as RegionId), "military");
    }
    for s in 0..w.civs.len() {
        if w.civs[s].memory[ri].camp.is_some() && w.civs[s].memory[ri].last_seen == w.month {
            w.civs[s].memory[ri].camp = None;
        }
    }
}

/// Plunder value of a region to raiders and the power defending it.
fn target_score(w: &World, ri: usize) -> Option<(i64, i64)> {
    let r = &w.regions[ri];
    let seat = r.controller?;
    let civ = &w.civs[seat as usize];
    let pop = w.civ_population(seat).max(1) as i64;
    let share = (r.population() as i64 * 10_000 / pop).min(2_500);
    let value: i64 = PLUNDER.iter().map(|g| civ.stock_of(*g) / 1000 * crate::content::base_price(*g)).sum::<i64>() * share / 10_000;
    let defence = crate::sim::military::region_defence(w, ri, w.raider_gen);
    Some((value, defence))
}

fn raid(w: &mut World, ci: usize) {
    let month = w.month;
    let wpower = power(w, ci);
    let (ri, id) = (w.camps[ci].region as usize, w.camps[ci].id);
    let sea_ok = w.raider_gen >= 2;
    let mut best: Option<(i64, usize, i64)> = None;
    for (nb, kind) in &w.regions[ri].neighbors {
        let nb = *nb as usize;
        if *kind == LinkKind::Sea && !sea_ok {
            continue;
        }
        let Some(ctrl) = w.regions[nb].controller else { continue };
        if w.camps[ci].tribute.iter().any(|(s, until)| *s == ctrl && *until > month) {
            continue;
        }
        let Some((value, defence)) = target_score(w, nb) else { continue };
        let score = value * 1000 / defence.max(1);
        if best.map(|b| score > b.0).unwrap_or(true) {
            best = Some((score, nb, defence));
        }
    }
    let Some((_, target, defence)) = best else { return };
    let food: i64 = w.camps[ci].plunder.iter().filter(|x| x.0 == Good::Food).map(|x| x.1).sum();
    let mut chance = RAID_BASE_BP;
    if food < people(w, ci) as i64 * 6 / 4 {
        chance *= 2;
    }
    if defence > wpower * 2 {
        chance = 0;
    } else if defence > wpower {
        chance /= 2;
    }
    if (draw_range(w.secret, &[stream("raid"), id as u64, month as u64], 10_000) as i64) >= chance {
        return;
    }
    w.camps[ci].last_raid = month;
    let seat = w.regions[target].controller.unwrap();
    let won = crate::sim::military::raid_battle(w, ci, target);
    // the raided seat learns where they came from
    sight(w, seat, ri);
    let (rname, tname) = (w.regions[ri].name.clone(), w.regions[target].name.clone());
    if !won {
        brief(w, seat, "warning", format!("Raid repelled at {tname}"), format!("Raiders from {rname} were driven off."), Some(target as RegionId), "military");
        return;
    }
    w.camps[ci].last_success = month;
    // plunder from the national pool, by the region's share of the people
    let pop = w.civ_population(seat).max(1) as i64;
    let share = (w.regions[target].population() as i64 * 10_000 / pop).min(2_500);
    let mut mass = 0i64;
    for g in PLUNDER {
        let stock = w.civs[seat as usize].stock_of(g);
        let mut take = (stock * share / 10_000).min(stock * RAID_SHARE_BP / 10_000);
        let kg = good_mass_kg(g);
        take = take.min((RAID_MASS_KG - mass) / kg.max(1)).max(0);
        let took = w.civs[seat as usize].lose(g, take);
        mass += took * kg;
        store_add(&mut w.camps[ci], g, took);
        wild_vec(&mut w.wild.plundered)[g.index()] += took;
    }
    // people killed, one works damaged, unrest
    let killed = crate::sim::population::draw_adults(w, target, (w.regions[target].population() / 500).min(2_000));
    let f = &mut w.civs[seat as usize].flows;
    f.deaths += killed;
    f.deaths_cause[crate::sim::population::CAUSE_WAR] += killed;
    let fac: Vec<usize> = (0..w.regions[target].facilities.len()).filter(|i| w.regions[target].facilities[*i].level > 0).collect();
    if !fac.is_empty() {
        let k = fac[draw_range(w.secret, &[stream("raid-damage"), id as u64, month as u64], fac.len() as u64) as usize];
        let f = &mut w.regions[target].facilities[k];
        f.condition_bp = f.condition_bp.saturating_sub(3_000).max(1_000);
    }
    w.regions[target].unrest_bp = (w.regions[target].unrest_bp + 300).min(10_000);
    brief(w, seat, "danger", format!("Raiders struck {tname}"), format!("Raiders from {rname} carried off stores and killed {}. Garrison the region or clear their camp.", group(killed as i64)), Some(target as RegionId), "military");
}

/// Record what a seat sees of a camp in a region it observes this month.
pub fn sight(w: &mut World, seat: SeatId, ri: usize) {
    let month = w.month;
    let seen = camp_at(w, ri).map(|ci| {
        let (p, war) = (people(w, ci), warriors(w, ci));
        // a band from the seat's keyed estimate, never the exact count
        let band = |v: u32, k: u64| -> (u32, u32) {
            let (lo, hi) = crate::observe::estimate(w, seat, 9000 + k * 1000 + w.camps[ci].id as u64, v as u64, 50);
            (lo.min(u32::MAX as u64) as u32, hi.min(u32::MAX as u64) as u32)
        };
        CampMemory { name: w.camps[ci].name.clone(), people: band(p, 0), warriors: band(war, 1), month }
    });
    w.civs[seat as usize].memory[ri].camp = seen;
}

/// Monthly: raids; every January the generation, demography, budding and decline.
pub fn step(w: &mut World) {
    if w.camps.is_empty() {
        return;
    }
    let month = w.month;
    let january = month % 12 == 0;
    if january {
        update_generation(w);
        let cap = camp_cap(w.regions.len());
        let (year, _) = crate::util::date(&w.cfg, month);
        let n = w.camps.len();
        for ci in 0..n {
            demography(w, ci);
            if year < LAST_BUDDING_YEAR && (people(w, ci) > BUD_PEOPLE) {
                bud(w, ci, cap);
            }
        }
        // decline: hemmed in by governed land and without a successful raid for twenty years
        let mut ci = 0;
        while ci < w.camps.len() {
            let ri = w.camps[ci].region as usize;
            let land: Vec<usize> = w.regions[ri].neighbors.iter().filter(|(_, k)| *k != LinkKind::Sea).map(|(n, _)| *n as usize).collect();
            let hemmed = !land.is_empty() && land.iter().all(|n| w.regions[*n].controller.is_some());
            let p = people(w, ci);
            // after the age of budding, a band that has not raided for twenty years is
            // drawn into the settled world wherever it lies (design 5.8, lean scope)
            let late = year >= LAST_BUDDING_YEAR;
            let nearest = if hemmed { land.iter().copied().max_by_key(|n| (w.regions[*n].population(), std::cmp::Reverse(*n))) } else if late { nearest_governed(w, ri) } else { None };
            if (hemmed || late) && month >= w.camps[ci].last_success + 240 && nearest.is_some() {
                let to = nearest.unwrap();
                if p < 1_000 {
                    end_camp(w, ci, Some(to), None);
                    continue;
                }
                emigrate(w, ci, to, if hemmed { p / 20 } else { p / 10 }, false);
            } else if p == 0 {
                end_camp(w, ci, None, None);
                continue;
            }
            ci += 1;
        }
    }
    // camps eat a quarter of their food from the store; other plunder wears out
    for ci in 0..w.camps.len() {
        let need = people(w, ci) as i64 / 4;
        let camp = &mut w.camps[ci];
        for (g, a) in camp.plunder.iter_mut() {
            let used = if *g == Good::Food { need.min(*a) } else { *a / 100 };
            *a -= used;
            let e = wild_vec(&mut w.wild.eaten);
            e[g.index()] += used;
        }
        camp.plunder.retain(|x| x.1 > 0);
        if camp.morale_bp < 8_000 {
            camp.morale_bp += 200;
        }
    }
    for ci in 0..w.camps.len() {
        let rested = w.camps[ci].last_raid == 0 || month >= w.camps[ci].last_raid + RAID_REST_MONTHS;
        if rested && warriors(w, ci) >= RAID_MIN_WARRIORS && !w.armies.iter().any(|a| a.region == w.camps[ci].region) {
            raid(w, ci);
        }
    }
}

/// Validate a tribute: goods move from the seat to the camp's store and stop its
/// raids on the seat for `years`.
pub fn pay_tribute(w: &mut World, seat: SeatId, ci: usize, goods: &[(Good, i64)], years: u8) -> i64 {
    let mut paid = 0;
    for (g, a) in goods {
        let took = w.civs[seat as usize].lose(*g, *a);
        store_add(&mut w.camps[ci], *g, took);
        wild_vec(&mut w.wild.tribute)[g.index()] += took;
        paid += took;
    }
    let until = w.month + years as u32 * 12;
    let c = &mut w.camps[ci];
    c.tribute.retain(|(s, _)| *s != seat);
    c.tribute.push((seat, until));
    paid
}

/// Base units of a good a camp would expect to take from a seat in a year (the
/// tribute that stops its raids): a raid's share at the base monthly chance.
pub fn expected_yearly_of(w: &World, seat: SeatId, g: Good) -> i64 {
    w.civs[seat as usize].stock_of(g) * RAID_SHARE_BP / 10_000 * 12 / RAID_REST_MONTHS as i64
}
