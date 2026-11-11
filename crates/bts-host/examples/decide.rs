//! What a native seat decides in the plan phase, and what the referee answers.
//!
//! ```text
//! cargo run --release -p bts-host --example decide -- SEED ROUNDS SEAT [quick|standard]
//! ```
//!
//! Runs an all-native match (hard, medium, medium, easy) for ROUNDS rounds, then
//! prints the actions SEAT's controller chooses in the next plan phase and each
//! receipt. A calibration and debugging aid; it reads only that seat's view.

use bts_engine::calendar::CalendarId;
use bts_engine::MatchConfig;
use bts_host::Session;
use bts_protocol::*;

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let seed = a.first().cloned().unwrap_or_else(|| "riverland".into());
    let rounds: u32 = a.get(1).and_then(|x| x.parse().ok()).unwrap_or(1);
    let seat: SeatId = a.get(2).and_then(|x| x.parse().ok()).unwrap_or(0);
    let calendar = if a.get(3).map(|x| x == "quick").unwrap_or(false) { CalendarId::Quick } else { CalendarId::Standard };
    let cfg = MatchConfig { seed, calendar, controllers: vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy], ..Default::default() };
    let mut s = Session::new(cfg, 7);
    s.run_rounds(rounds);
    // bring the match to this round's plan phase with every other seat deciding as usual
    while s.m.phase() != Phase::Plan && !s.m.finished() {
        if !s.step() {
            break;
        }
    }
    let obs = s.m.observe(seat);
    println!("round {} {} phase {:?}", obs.round, obs.date.as_ref().map(|d| d.label.clone()).unwrap_or_default(), obs.phase);
    if std::env::var("BTS_DEBUG_PRODUCTIVITY").is_ok() {
        for r in obs.regions.iter().filter(|r| r.own.is_some()) {
            let o = r.own.as_ref().unwrap();
            println!("region {} pop {} food workers {}", r.id, o.population, o.labor.food);
            for p in &o.productivity {
                println!("  {:?} {}: {}", p.sector, p.total_bp, p.factors.iter().map(|f| format!("{} {}", f.source, f.bp)).collect::<Vec<_>>().join(", "));
            }
        }
    }
    if std::env::var("BTS_DEBUG_COURSES").is_ok() {
        for c in &obs.catalog.courses {
            println!("course {} {} out {:?} venue {} available {} entrants {:?}", c.key, c.name, c.output, c.venue, c.available, c.entrants);
        }
        for r in obs.regions.iter().filter(|r| r.own.is_some()) {
            let o = r.own.as_ref().unwrap();
            println!("region {} pop {} venues {:?} quals {:?}", r.id, o.population, o.venues.iter().map(|v| (v.venue.clone(), v.capacity, v.reserved)).collect::<Vec<_>>(), o.quals.iter().map(|q| (q.qual, q.count)).collect::<Vec<_>>());
        }
    }
    let actions = s.ais[seat as usize].as_mut().expect("a native seat").decide(&obs);
    for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
        for (act, r) in chunk.iter().zip(s.m.act(seat, chunk.to_vec())) {
            println!("{:<9} {:?}\n          {}", r.status, act, r.reason);
        }
    }
}
