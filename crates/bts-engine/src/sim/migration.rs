//! Migration (design chapter 38, section 3, simplified by chapter 41).
//!
//! One rule moves people between regions: each region has an attractiveness, and
//! people move from a region toward better ones within reach, slowly (a few per
//! thousand a year, bounded by the best transport mode at home) and more slowly
//! across borders, where the receiving seat's border policy decides who may come.
//! Regions in distress (famine, war, epidemic) send refugees to better
//! neighbours regardless. All flows of a month are computed from the same state,
//! then applied in (sending region, destination) order, so no seat's flows depend
//! on the order in which seats are processed. Every mover leaves one region's age
//! cells and joins the same cells in another in the same month.

use crate::content::{content, Cap};
use crate::sim::{cities, network};
use crate::state::*;
use bts_protocol::*;

/// Residents a region needs before it sends voluntary migrants.
pub const MIGRATION_MIN_RESIDENTS: u32 = 120_000;
/// Gain threshold inside a civilization and across a border, basis points.
pub const THRESHOLD_INTERNAL: i64 = 1_000;
pub const THRESHOLD_ABROAD: i64 = 3_000;
/// Voluntary out-migration ceilings, basis points of residents a year: across
/// borders, and the intake a region accepts.
pub const ABROAD_CAP_BP: i64 = 50;
pub const INTAKE_CAP_BP: i64 = 500;
/// Selective immigration: at most this share of the receiving seat's people a
/// year, basis points.
pub const SELECTIVE_CAP_BP: i64 = 10;
/// Path loss beyond which a destination is out of reach (friction 6).
pub const REACH_LOSS: i64 = 5_000;
/// Migration weights by age (design 3.2), per 1,000: children follow their parents.
pub fn age_weight(age: usize) -> u64 {
    match age {
        0..=14 => 600,
        15..=19 => 1_000,
        20..=34 => 2_500,
        35..=49 => 1_200,
        50..=64 => 400,
        _ => 150,
    }
}

/// Distress of a region: refugees sent per month, basis points of residents.
pub fn distress_bp(w: &World, ri: usize) -> i64 {
    let r = &w.regions[ri];
    let Some(ctrl) = r.controller else { return 0 };
    let mut bp = 0;
    // famine: the last three months' food below 7,000
    let m = w.month as usize;
    if (1..=3).all(|k| r.food_hist[(m + 12 - k) % 12] < 7_000) {
        bp += 50;
    }
    // war: a hostile formation here this month, or occupation in its first year
    let hostile_here = w.armies.iter().any(|a| a.region as usize == ri && a.count() > 0 && w.at_war(a.owner, ctrl));
    let fresh_occupation = r.owner != r.controller && r.occupied_since.map(|s| w.month < s + 12).unwrap_or(false);
    if hostile_here || fresh_occupation {
        bp += 100;
    }
    if r.outbreak.as_ref().map(|o| o.severity_bp >= 18_000).unwrap_or(false) {
        bp += 30;
    }
    bp
}

/// Attractiveness of a region to migrants (design 3.3), basis points; may be
/// negative. Work, the city's opportunity, food, services, landscape, crowding and
/// safety; the per-civilization standard of living waits for prosperity.
pub fn attractiveness(w: &World, ri: usize) -> i64 {
    attractiveness_with(w, ri, &cities::city_sizes(w))
}

/// [`attractiveness`] with every region's city size already reckoned.
pub fn attractiveness_with(w: &World, ri: usize, sizes: &[u32]) -> i64 {
    let r = &w.regions[ri];
    let pop = r.population() as i64;
    if pop == 0 || r.controller.is_none() {
        return -10_000;
    }
    let l = &r.last.labor;
    let active = (l.food + l.facilities + l.projects + l.household + l.teachers).max(1) as i64;
    let vacant: i64 = r.facilities.iter().map(|f| f.staff_needed.saturating_sub(f.staffed) as i64).sum();
    let work = (6_000 * vacant / active - 6_000 * l.household as i64 / active).clamp(-3_000, 3_000);
    let city = sizes[ri] as i64;
    let class = cities::class_of(city as u32);
    let class_term = crate::sim::productivity::city_factor(class, Sector::Services, 0, 10_000, 0);
    let city_term = (2 * (class_term + cities::access_bonus_with(w, ri, city, sizes) - cities::congestion_bp(r, city) - 10_000)).clamp(-1_000, 5_000);
    let food = (r.food_hist.iter().map(|x| *x as i64).sum::<i64>() / 12 - 10_000).min(0);
    let children = r.children().max(1) as i64;
    let services = 1_000
        * ((r.cap(Cap::Health) * 10_000 / pop).min(10_000)
            + (crate::sim::population::sanitation_capacity(r) * 10_000 / pop).min(10_000)
            + ((r.cap(Cap::SeatsSchool) + r.cap(Cap::SeatsLodge)) * 10_000 / children).min(10_000))
        / 30_000;
    let amenity = cities::site_amenity(r);
    let crowding = -(r.health_bp as i64) / 2 - cities::congestion_bp(r, city);
    let mut safety = 0;
    if let Some(ctrl) = r.controller {
        if w.armies.iter().any(|a| a.region as usize == ri && a.count() > 0 && w.at_war(a.owner, ctrl)) {
            safety -= 3_000;
        }
    }
    if r.outbreak.is_some() {
        safety -= 2_000;
    }
    if r.owner != r.controller {
        safety -= 1_500;
    }
    work + city_term + food + services + amenity + crowding + safety
}

/// Whether people may move between the seats of two regions at all.
fn route_open(w: &World, a: SeatId, b: SeatId) -> bool {
    a == b || (w.civs[a as usize].contacts.get(b as usize).map(|c| c.met).unwrap_or(false) && !w.at_war(a, b) && w.civs[b as usize].status != SeatStatus::Eliminated)
}

/// One month's flows, computed from the month's state and applied in order.
pub fn step(w: &mut World) {
    let n = w.regions.len();
    let sizes = cities::city_sizes(w);
    let attr: Vec<i64> = (0..n).map(|i| attractiveness_with(w, i, &sizes)).collect();
    let distress: Vec<i64> = (0..n).map(|i| distress_bp(w, i)).collect();
    let pops: Vec<i64> = w.regions.iter().map(|r| r.population() as i64).collect();
    let nets: Vec<network::Net> = w.regions.iter().map(network::net).collect();
    let seats = w.civs.len();
    let seat_pop: Vec<i64> = (0..seats).map(|s| w.regions.iter().filter(|r| r.controller == Some(s as SeatId)).map(|r| r.population() as i64).sum()).collect();
    // crowding against water, and the push of land hunger (water crowding, or food
    // workers beyond the land's livelihoods)
    let crowd: Vec<i64> = w.regions.iter().map(|r| r.population() as i64 * 10_000 / crate::sim::population::water_capacity(r).max(1) as i64).collect();
    let push: Vec<i64> = (0..n)
        .map(|i| {
            let r = &w.regions[i];
            let c = content();
            let crew = |key: &str| r.fac_level(key) as i64 * c.facilities[c.f(key)].general as i64;
            let livelihoods = (r.wild * 1000 / 2600 + crew("fields") + crew("pasture") + crew("fishery")).max(1);
            let food_workers = if r.last.food_equiv > 0 { r.last.food_equiv } else { r.last.labor.food } as i64;
            crowd[i].max(if food_workers * 10_000 / livelihoods > 9_500 { 9_000 } else { 0 })
        })
        .collect();
    // (from, to, people, exempt from the intake caps: refugees and land hunger)

    let mut flows: Vec<(usize, usize, i64, bool)> = Vec::new();
    let mut rem: Vec<i64> = w.regions.iter().map(|r| r.migr_rem).collect();
    let mut refugee_flow: Vec<(usize, usize)> = Vec::new();
    for i in 0..n {
        let Some(s) = w.regions[i].controller else { continue };
        if w.civs[s as usize].status == SeatStatus::Eliminated || pops[i] == 0 {
            continue;
        }
        // ---- distress: refugees to the best neighbour that is better and not in the same plight
        if distress[i] > 0 {
            let mut best: Option<usize> = None;
            for (nb, _) in &w.regions[i].neighbors {
                let j = *nb as usize;
                let Some(t) = w.regions[j].controller else { continue };
                if !route_open(w, s, t) || attr[j] <= attr[i] || distress[j] > 0 {
                    continue;
                }
                if best.map(|b| attr[j] > attr[b]).unwrap_or(true) {
                    best = Some(j);
                }
            }
            if let Some(j) = best {
                let t = w.regions[j].controller.unwrap();
                let mut bp = distress[i];
                if t != s && w.civs[t as usize].immigration == Immigration::Closed {
                    bp /= 2;
                }
                let people = pops[i] * bp / 10_000;
                if people > 0 {
                    flows.push((i, j, people, true));
                    refugee_flow.push((i, j));
                }
            }
        }
        if pops[i] < MIGRATION_MIN_RESIDENTS as i64 {
            continue;
        }
        // ---- land hunger: a region whose people outrun its water or its farmland
        // sends 1.2% a month to its least crowded own neighbour (ruleset 2.0's
        // internal settlement, kept as a channel of this step)
        if push[i] >= 8_000 {
            let mut best: Option<(i64, usize)> = None;
            for (nb, _) in &w.regions[i].neighbors {
                let j = *nb as usize;
                if w.regions[j].controller != Some(s) {
                    continue;
                }
                if crowd[j] + 2_500 < push[i] && best.map(|(c, _)| crowd[j] < c).unwrap_or(true) {
                    best = Some((crowd[j], j));
                }
            }
            if let Some((_, j)) = best {
                flows.push((i, j, pops[i] * 12 / 1_000, true));
            }
        }
        // ---- voluntary
        let civ = &w.civs[s as usize];
        let (boats, sail) = (civ.knows_id("T013"), civ.knows_id("T028"));
        let restricted = civ.emigration == Emigration::Restricted;
        // least-loss paths through the seat's own regions; foreign regions are
        // reached across one link from them
        let mut dist = vec![i64::MAX; n];
        let mut done = vec![false; n];
        dist[i] = 0;
        loop {
            let mut best: Option<usize> = None;
            for x in 0..n {
                if !done[x] && dist[x] <= REACH_LOSS && best.map(|b| dist[x] < dist[b]).unwrap_or(true) {
                    best = Some(x);
                }
            }
            let Some(x) = best else { break };
            done[x] = true;
            if w.regions[x].controller != Some(s) {
                continue; // a foreign region ends the path
            }
            for (nb, kind) in &w.regions[x].neighbors {
                let j = *nb as usize;
                if done[j] || w.regions[j].controller.is_none() {
                    continue;
                }
                let foreign = w.regions[j].controller != Some(s);
                let b = if foreign { network::Net::default() } else { nets[j] };
                let (l, _) = network::link(&nets[x], &b, *kind, boats, sail);
                if dist[x] + l < dist[j] {
                    dist[j] = dist[x] + l;
                }
            }
        }
        let mut cands: Vec<(i64, usize, bool)> = Vec::new();
        for j in 0..n {
            if j == i || dist[j] > REACH_LOSS || pops[j] == 0 {
                continue;
            }
            let Some(t) = w.regions[j].controller else { continue };
            let abroad = t != s;
            if abroad && (!route_open(w, s, t) || w.civs[t as usize].immigration == Immigration::Closed) {
                continue;
            }
            let mut threshold = if abroad { THRESHOLD_ABROAD } else { THRESHOLD_INTERNAL };
            if abroad && restricted {
                threshold *= 2;
            }
            let gain = attr[j] - attr[i] - threshold;
            if gain <= 0 {
                continue;
            }
            // friction in thousandths: 1 + path loss / 1,000
            cands.push((gain * 1_000 / (1_000 + dist[j]), j, abroad));
        }
        cands.sort_by_key(|(score, j, _)| (std::cmp::Reverse(*score), *j));
        cands.truncate(3);
        if cands.is_empty() {
            continue;
        }
        let total: i64 = cands.iter().map(|c| c.0).sum();
        let rate = (total / 10).min(network::mobility_cap_bp(&w.regions[i]));
        let abroad_score: i64 = cands.iter().filter(|c| c.2).map(|c| c.0).sum();
        // the share abroad is capped at 50 bp a year of the sending region
        let rate_abroad = (rate * abroad_score / total.max(1)).min(ABROAD_CAP_BP);
        let rate_home = rate * (total - abroad_score) / total.max(1);
        let rate = rate_home + rate_abroad;
        // thousandths of a person this month
        let want = pops[i] * rate * 1_000 / 10_000 / 12 + rem[i];
        let whole = want / 1_000;
        rem[i] = want % 1_000;
        if whole == 0 {
            continue;
        }
        for (score, j, abroad) in &cands {
            let share = if *abroad { whole * rate_abroad / rate.max(1) * score / abroad_score.max(1) } else { whole * rate_home / rate.max(1) * score / (total - abroad_score).max(1) };
            if share > 0 {
                flows.push((i, *j, share, false));
            }
        }
    }
    // intake and selective caps, from the month's state, in (from, to) order
    flows.sort_by_key(|f| (f.0, f.1, f.3));
    let mut intake = vec![0i64; n];
    let mut selective = vec![0i64; seats];
    for (i, j, people, refugee) in flows {
        let (s, t) = (w.regions[i].controller.unwrap(), w.regions[j].controller.unwrap());
        let mut count = people;
        if !refugee {
            let room = pops[j] * INTAKE_CAP_BP / 10_000 / 12 - intake[j];
            count = count.min(room.max(0));
            if s != t && w.civs[t as usize].immigration == Immigration::Selective {
                let room = seat_pop[t as usize] * SELECTIVE_CAP_BP / 10_000 / 12 - selective[t as usize];
                count = count.min(room.max(0));
            }
        }
        if count <= 0 {
            continue;
        }
        let moved = move_migrants(w, i, j, count.min(u32::MAX as i64) as u32) as i64;
        if !refugee {
            intake[j] += moved;
            if s != t {
                selective[t as usize] += moved;
            }
        }
        let m = moved as u32;
        if s == t {
            w.civs[s as usize].flows.moved_internal += m;
        } else {
            w.civs[s as usize].flows.emigrated += m;
            w.civs[s as usize].flows.migration -= moved as i32;
            w.civs[t as usize].flows.immigrated += m;
            w.civs[t as usize].flows.migration += moved as i32;
        }
        if refugee && refugee_flow.contains(&(i, j)) {
            w.civs[s as usize].flows.refugees += m;
        }
    }
    for (r, v) in w.regions.iter_mut().zip(rem) {
        r.migr_rem = v;
    }
}

/// Move `count` people with the migration age profile.
pub fn move_migrants(w: &mut World, from: usize, to: usize, count: u32) -> u32 {
    static WEIGHTS: std::sync::OnceLock<[u64; AGES]> = std::sync::OnceLock::new();
    let weights = WEIGHTS.get_or_init(|| std::array::from_fn(age_weight));
    crate::sim::population::move_people_weighted(w, from, to, count, weights)
}
