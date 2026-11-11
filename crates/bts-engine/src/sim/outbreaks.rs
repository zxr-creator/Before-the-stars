//! Epidemics (design chapter 36, section 3.2).
//!
//! Each populated region may break out in an epidemic in any month, from the
//! secret stream `("outbreak", region, month)`. The monthly hazard is
//! `1/2,400 x density x connectivity x protection`: denser regions, regions armies
//! move through and (from the trade slice) regions on trade routes catch more;
//! germ theory, vaccination and care protect. An outbreak lasts 6-24 months and
//! raises the death rate of every age band by 30-150% (`M_outbreak`, applied in
//! `sim::population`); each month it may spread to every neighbouring region with
//! probability 30% (times that region's protection). Afterwards the region has a
//! quarter of the hazard for 600 months and cannot catch a spreading epidemic.
//!
//! Everything here is a function of the world and the secret, evaluated once per
//! month for all regions in region order: no seat's order of play changes a draw.

use crate::content::content;
use crate::sim::chronicle::{brief, moment};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

/// Monthly hazard of a populated region at density, connectivity and protection
/// 1, in parts per million (1 / 2,400).
pub const HAZARD_PPM: i64 = 417;
/// Chance per month that an epidemic spreads to a neighbouring region (bp).
pub const SPREAD_BP: i64 = 3_000;
/// Months after an epidemic during which the region has a quarter of the hazard.
pub const IMMUNE_MONTHS: u32 = 600;

/// Protection of a region's people (basis points, 10,000 = none): germ theory
/// halves the hazard, vaccination cuts it to three tenths again, care by up to half.
pub fn protection_bp(w: &World, ri: usize) -> i64 {
    let r = &w.regions[ri];
    let Some(seat) = r.controller else { return 10_000 };
    let civ = &w.civs[seat as usize];
    let mut p = 10_000i64;
    if civ.knows_id("T053") {
        p = p * 5 / 10;
    }
    if civ.knows_id("T070") {
        p = p * 3 / 10;
    }
    let pop = r.population() as i64;
    let coverage = ratio_bp(r.cap(crate::content::Cap::Health), pop);
    p * (10_000 - coverage / 2) / 10_000
}

/// Monthly hazard of a region in parts per million.
pub fn hazard_ppm(w: &World, ri: usize) -> i64 {
    let r = &w.regions[ri];
    let pop = r.population() as i64;
    if pop == 0 {
        return 0;
    }
    let wcap = crate::sim::population::water_capacity(r).max(1) as i64;
    let crowd = pop * 10_000 / wcap;
    let density = (crowd * 10_000 / 8_000).clamp(5_000, 30_000);
    // trade routes join this with the market (design section 6); until then only armies
    let armies = if w.month < r.army_seen + 12 && r.army_seen > 0 { 5_000 } else { 0 };
    let connectivity = 10_000 + armies;
    let mut h = HAZARD_PPM * density / 10_000 * connectivity / 10_000 * protection_bp(w, ri) / 10_000 * crate::sim::eras::outbreak_bp(w, ri) / 10_000;
    if w.month < r.immune_until {
        h /= 4;
    }
    h
}

fn start(w: &mut World, ri: usize, from: Option<usize>) {
    let month = w.month;
    let d = draw(w.secret, &[stream("outbreak-course"), ri as u64, month as u64]);
    let months = 6 + (d % 19) as u32;
    let severity = 13_000 + ((d >> 20) % 12_001) as u16;
    w.regions[ri].outbreak = Some(Outbreak { since: month, until: month + months, severity_bp: severity });
    let name = w.regions[ri].name.clone();
    let when = crate::util::event_label(&w.cfg, month);
    let detail = match from {
        Some(f) => format!("Sickness came from {}. Deaths will run high for months; crowded and poorly cared-for places suffer most.", w.regions[f].name),
        None => "A sickness is spreading among the residents. Deaths will run high for months; crowded and poorly cared-for places suffer most.".to_string(),
    };
    // the region's government is told, and so is anyone who governs a neighbour
    let mut told: Vec<SeatId> = Vec::new();
    if let Some(s) = w.regions[ri].controller {
        told.push(s);
        let severe = severity >= 20_000;
        moment(w, s, MomentCategory::Crisis, format!("Epidemic in {name}"), detail.clone(), Some(ri as RegionId), "famine", severe, vec![format!("First deaths recorded in {when}")]);
    }
    let nbs: Vec<usize> = w.regions[ri].neighbors.iter().map(|(n, _)| *n as usize).collect();
    for nb in nbs {
        if let Some(s) = w.regions[nb].controller {
            if !told.contains(&s) {
                told.push(s);
            }
        }
    }
    for s in told {
        if w.civs[s as usize].status != SeatStatus::Eliminated {
            brief(w, s, "warning", format!("Outbreak in {name}"), detail.clone(), Some(ri as RegionId), "population");
        }
    }
}

pub fn step(w: &mut World) {
    let month = w.month;
    let n = w.regions.len();
    for a in 0..w.armies.len() {
        let ri = w.armies[a].region as usize;
        w.regions[ri].army_seen = month;
    }
    // epidemics that ran their course leave the region resistant for a time
    for r in w.regions.iter_mut() {
        if let Some(o) = &r.outbreak {
            if month >= o.until || r.population() == 0 {
                r.outbreak = None;
                r.immune_until = month + IMMUNE_MONTHS;
            }
        }
    }
    // spread, from the regions sick at the start of the month
    let sick: Vec<usize> = (0..n).filter(|i| w.regions[*i].outbreak.is_some()).collect();
    for &ri in &sick {
        let nbs: Vec<usize> = w.regions[ri].neighbors.iter().map(|(x, _)| *x as usize).collect();
        for nb in nbs {
            let r = &w.regions[nb];
            if r.outbreak.is_some() || month < r.immune_until || r.population() == 0 {
                continue;
            }
            let p = SPREAD_BP * protection_bp(w, nb) / 10_000;
            if (draw_range(w.secret, &[stream("outbreak-spread"), ri as u64, nb as u64, month as u64], 10_000) as i64) < p {
                start(w, nb, Some(ri));
            }
        }
    }
    // new outbreaks
    for ri in 0..n {
        if w.regions[ri].outbreak.is_some() {
            continue;
        }
        let h = hazard_ppm(w, ri);
        if h > 0 && (draw_range(w.secret, &[stream("outbreak"), ri as u64, month as u64], 1_000_000) as i64) < h {
            start(w, ri, None);
        }
    }
    let _ = content();
}
