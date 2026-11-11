//! Performance budget of ruleset 3.0 (design chapter 36, sections 2.4 and 10).
//!
//! Ignored by default (it plays a whole standard campaign). Run with
//! `cargo test --release -p bts-ai --test perf -- --ignored --nocapture`.
//! Budgets: p95 per round, three native seats deciding, at most 150 ms native; a
//! full standard all-AI match at most 60 s native. The WebAssembly figures are
//! measured with the web build's node harness and recorded in the calibration notes.

use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;
use std::time::Instant;

fn step(m: &mut Match, ais: &mut [NativeAi]) -> bool {
    if m.finished() {
        return false;
    }
    for seat in m.waiting_on() {
        let obs = m.observe(seat);
        let actions = ais[seat as usize].decide(&obs);
        for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
            m.act(seat, chunk.to_vec());
        }
        m.set_ready(seat, false);
    }
    m.try_advance()
}

#[test]
#[ignore]
fn perf_round_budget() {
    let controllers = vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
    let mut m = Match::new(MatchConfig { seed: "riverland".into(), controllers, ..Default::default() }, 7);
    let mut ais: Vec<NativeAi> = (0..4).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), 0x5EED + s as u64)).collect();
    let start = Instant::now();
    let mut per_round: Vec<(u32, u32, f64)> = Vec::new();
    while !m.finished() {
        let (round, month) = (m.round(), m.month());
        let t = Instant::now();
        while !m.finished() && m.round() == round {
            assert!(step(&mut m, &mut ais), "stalled in round {round}");
        }
        per_round.push((round, m.month() - month, t.elapsed().as_secs_f64() * 1000.0));
    }
    let total = start.elapsed().as_secs_f64();
    let mut ms: Vec<f64> = per_round.iter().map(|r| r.2).collect();
    ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| ms[((ms.len() as f64 - 1.0) * p).round() as usize];
    let long: Vec<f64> = per_round.iter().filter(|r| r.1 >= 480).map(|r| r.2).collect();
    let late: Vec<f64> = per_round.iter().filter(|r| r.1 <= 24).map(|r| r.2).collect();
    let mean = |v: &[f64]| v.iter().sum::<f64>() / v.len().max(1) as f64;
    eprintln!(
        "{} rounds, {} months, {:.1} s; per round p50 {:.1} ms, p95 {:.1} ms, max {:.1} ms; rounds of 40-50 years mean {:.1} ms; 2-year rounds mean {:.1} ms",
        per_round.len(),
        m.month(),
        total,
        pct(0.5),
        pct(0.95),
        pct(1.0),
        mean(&long),
        mean(&late)
    );
    assert!(pct(0.95) <= 150.0, "p95 per round {:.1} ms is over the 150 ms budget", pct(0.95));
    assert!(total <= 60.0, "a full standard match took {total:.1} s, over the 60 s budget");
}
