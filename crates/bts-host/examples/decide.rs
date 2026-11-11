//! What a native seat decides in the plan phase, and what the referee answers.
//!
//! ```text
//! cargo run --release -p bts-host --example decide -- SEED|SAVE.json ROUNDS SEAT [quick|standard]
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
    // a save written by `bts run --checkpoints` may stand in for the seed (ROUNDS then
    // counts further rounds from the save)
    let mut s = if cfg.seed.ends_with(".json") {
        Session::load(&std::fs::read_to_string(&cfg.seed).expect("read save")).expect("load save")
    } else {
        Session::new(cfg, 7)
    };
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
    if std::env::var("BTS_DEBUG_VICTORY").is_ok() {
        if let Some(v) = &obs.objectives.victory {
            for c in v.governance_checks.iter().chain(v.ftl_checks.iter()) {
                println!("check {} {} -- {}", if c.ok { "OK  " } else { "FAIL" }, c.label, c.detail);
            }
        }
    }
    if std::env::var("BTS_DEBUG_SPACE").is_ok() {
        if let Some(sv) = &obs.space {
            println!("boost {:?}", sv.boost.as_ref().map(|b| (b.stock, b.cap, b.made_last)));
            for st in &sv.stations {
                println!("station owner {:?} orbit {} core {:?} aboard {:?} power {:?} modules {:?}", st.owner, st.orbit, st.core, st.aboard, st.power_bp, st.modules.iter().map(|m| (m.kind.clone(), m.level)).collect::<Vec<_>>());
            }
            println!("available {:?}", sv.available);
            for t in &sv.transfers {
                println!("transfer {} departed {} {}t", t.purpose, t.departed, t.payload_t);
            }
        }
    }
    if std::env::var("BTS_DEBUG_WORKS").is_ok() {
        let keys = ["high_energy", "launch_complex", "orbital_station", "orbital_yard", "jump_testbed", "jump_yard", "jump_base", "lattice_works"];
        for r in obs.regions.iter().filter(|r| r.own.is_some()) {
            let o = r.own.as_ref().unwrap();
            for f in o.facilities.iter().filter(|f| keys.contains(&f.kind.as_str())) {
                println!("works r{} pop {} {} L{} staff {}/{} cond {} util {} runs {:?} elec {}/{}", r.id, o.population, f.kind, f.level, f.staffed, f.staff_needed, f.condition_bp, f.utilization_bp, f.runs.iter().map(|x| (x.blockers.clone(), x.missing.clone())).collect::<Vec<_>>(), o.power.elec_supply, o.power.elec_demand);
            }
        }
    }
    if std::env::var("BTS_DEBUG_PROGRAMS").is_ok() {
        for g in &obs.programs {
            println!("program {} {} r{} seats {} enrolled {} paused {} blockers {:?}", g.id, g.course, g.region, g.seats, g.enrolled, g.paused, g.blockers);
        }
        for q in &obs.civ.quals {
            println!("qual {:?} {}/{}", q.qual, q.employed, q.count);
        }
    }
    let actions = s.ais[seat as usize].as_mut().expect("a native seat").decide(&obs);
    for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
        for (act, r) in chunk.iter().zip(s.m.act(seat, chunk.to_vec())) {
            println!("{:<9} {:?}\n          {}", r.status, act, r.reason);
        }
    }
}
