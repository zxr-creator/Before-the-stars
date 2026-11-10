//! Per-round and per-month cost from a save (design chapter 36, section 10, slice 0).
//!
//! ```text
//! cargo run --release -p bts-host --example bench -- SAVE.json [--rounds 10] [--policy]
//! ```
//!
//! Loads a save written by `bts run --save` or `--checkpoints`, then resolves
//! `--rounds` rounds. Without `--policy` no seat acts (pure simulation cost);
//! with it the native controllers decide every phase as in a real match. Prints
//! p50, p95 and maximum milliseconds per round and the mean per simulated month.

use bts_host::Session;
use bts_protocol::*;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let path = args.iter().find(|a| !a.starts_with("--")).expect("usage: bench SAVE.json [--rounds N] [--policy]");
    let flag = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let rounds: u32 = flag("--rounds").and_then(|v| v.parse().ok()).unwrap_or(10);
    let policy = args.iter().any(|a| a == "--policy");
    let text = std::fs::read_to_string(path).expect("read save");
    let mut s = Session::load(&text).expect("load save");
    println!("save {path}: round {} month {}", s.m.round(), s.m.month());
    let mut per_round: Vec<f64> = Vec::new();
    let mut months = 0u32;
    let total = Instant::now();
    for _ in 0..rounds {
        if s.m.finished() {
            break;
        }
        let (round, month) = (s.m.round(), s.m.month());
        let t = Instant::now();
        if policy {
            s.run_rounds(1);
        } else {
            while !s.m.finished() && s.m.round() == round {
                for seat in s.m.waiting_on() {
                    s.m.set_ready(seat, true);
                }
                if !s.m.try_advance() {
                    break;
                }
            }
        }
        per_round.push(t.elapsed().as_secs_f64() * 1000.0);
        months += s.m.month() - month;
    }
    let elapsed = total.elapsed().as_secs_f64() * 1000.0;
    let mut sorted = per_round.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| if sorted.is_empty() { 0.0 } else { sorted[((sorted.len() as f64 - 1.0) * p).round() as usize] };
    println!(
        "{} rounds, {} months, {}: total {:.1} ms, per round p50 {:.2} ms p95 {:.2} ms max {:.2} ms, per month {:.3} ms",
        per_round.len(),
        months,
        if policy { "with native policy" } else { "no seat actions" },
        elapsed,
        pct(0.5),
        pct(0.95),
        pct(1.0),
        if months > 0 { elapsed / months as f64 } else { 0.0 }
    );
    let _ = SeatStatus::Active;
}
