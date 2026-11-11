//! Monthly settlement. Every seat shares the same absolute clock; a decision
//! round advances it by a fixed number of months for everyone.

pub mod chronicle;
pub mod culture;
pub mod diplomacy;
pub mod directives;
pub mod economy;
pub mod eras;
pub mod knowledge;
pub mod military;
pub mod network;
pub mod cities;
pub mod migration;
pub mod outbreaks;
pub mod population;
pub mod productivity;
pub mod projects;
pub mod victory;

use crate::state::*;
use bts_protocol::*;

pub fn step_month(w: &mut World) {
    if w.outcome.is_some() {
        return;
    }
    w.month += 1;
    let n = w.civs.len();
    let before: Vec<Vec<i64>> = w.civs.iter().map(|c| c.flows.consumed.clone()).collect();

    // 0. standing orders, on 1 January and in the first month of a round
    directives::step(w);
    // 1. contractual deliveries settle from month-start stock
    diplomacy::step(w);
    // 2. labour, power and production
    for s in 0..n {
        economy::step(w, s as SeatId);
    }
    // 3. projects and education draw on this month's labour and research
    for s in 0..n {
        projects::step(w, s as SeatId);
    }
    // 4. epidemics, then food, water, births, deaths, ageing, migration
    outbreaks::step(w);
    for s in 0..n {
        population::step(w, s as SeatId);
    }
    // migration between regions and across borders, from one state for every seat
    migration::step(w);
    // on 1 January, fields give way to the towns and works on their land
    for s in 0..n {
        cities::encroach(w, s as SeatId);
    }
    // 5. conflict
    military::step(w);
    // 6. knowledge, institutions, culture
    for s in 0..n {
        knowledge::step(w, s as SeatId);
        culture::step(w, s as SeatId);
        eras::step(w, s as SeatId);
    }
    culture::step_world(w);
    // 7. observation memory
    for s in 0..n {
        if w.civs[s].status != SeatStatus::Eliminated {
            knowledge::refresh_visibility(w, s as SeatId);
        }
    }
    // 8. acceptance windows and process-level history
    victory::step(w);
    chronicle::monthly(w);

    for s in 0..n {
        let civ = &mut w.civs[s];
        for g in 0..NG {
            let used = civ.flows.consumed[g] - before[s][g];
            civ.use_ema[g] = (civ.use_ema[g] * 11 + used) / 12;
        }
    }
}

/// Close the accounts of a decision round.
pub fn close_round(w: &mut World) {
    w.last_round_months = w.month - w.round_start;
    chronicle::close_round(w);
    for civ in w.civs.iter_mut() {
        civ.last_flows = std::mem::replace(&mut civ.flows, Flows::new());
    }
}
