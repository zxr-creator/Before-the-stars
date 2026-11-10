//! Calibration survey of freight load in all-native matches (not a gate).
//!
//! Prints, for the eight `eval` worlds that `bts run --seed eval --matches 8` plays,
//! how many levels of industry, extraction and power each governed region carries
//! against the freight capacity of its transport grade, at four dates. It reads
//! only what each seat's own observation states (`OwnRegion.infrastructure`).
//!
//! Run with
//! `cargo test -p bts-ai --release --test freight_survey -- --ignored --nocapture`.
//! The capacities in `sim::economy::FREIGHT_CAPACITY` were set against this output
//! (`docs/units-and-scale.md`, section 7).

use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;

fn mix(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// The match the server's host plays for `bts run`: same world, same policy seeds.
fn table(seed: &str) -> (Match, Vec<NativeAi>) {
    let controllers = vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
    let m = Match::new(MatchConfig { seed: seed.into(), regions: 48, controllers, ..Default::default() }, 7);
    let ais = (0..m.seats()).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), mix(7 ^ (s as u64 + 1) * 0xA5A5_5A5A))).collect();
    (m, ais)
}

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
fn freight_load_of_native_regions() {
    let dates = [60u32, 120, 180, 240];
    // by date: (load, capacity, grade, capital?) of every governed region with any load
    let mut all: Vec<Vec<(u32, u32, u8, bool)>> = vec![Vec::new(); dates.len()];
    for i in 0..8 {
        let seed = format!("eval-{i}");
        let (mut m, mut ais) = table(&seed);
        for (d, round) in dates.iter().enumerate() {
            while !m.finished() && m.round() <= *round {
                if !step(&mut m, &mut ais) {
                    break;
                }
            }
            for seat in 0..m.seats() {
                let obs = m.observe(seat as SeatId);
                let mut line = Vec::new();
                for r in obs.regions.iter().filter(|r| r.owner == Some(obs.seat)) {
                    let Some(o) = &r.own else { continue };
                    let f = &o.infrastructure;
                    if f.freight_load == 0 {
                        continue;
                    }
                    let capital = r.id == obs.civ.capital;
                    all[d].push((f.freight_load, f.freight_capacity, o.transport_level, capital));
                    line.push(format!("{}{}/{}g{}", if capital { "*" } else { "" }, f.freight_load, f.freight_capacity, o.transport_level));
                }
                println!("{seed} round {round} seat {seat}: {}", line.join(" "));
            }
        }
    }
    println!();
    println!("== freight load by date (regions with any load; * marks capitals in the lines above) ==");
    for (d, round) in dates.iter().enumerate() {
        let pct = |v: &mut Vec<u32>, p: usize| -> u32 {
            v.sort();
            if v.is_empty() { 0 } else { v[(v.len() - 1) * p / 100] }
        };
        let mut loads: Vec<u32> = all[d].iter().map(|x| x.0).collect();
        let mut capitals: Vec<u32> = all[d].iter().filter(|x| x.3).map(|x| x.0).collect();
        let over = all[d].iter().filter(|x| x.0 > x.1).count();
        let over_capitals = all[d].iter().filter(|x| x.3 && x.0 > x.1).count();
        let grades: Vec<usize> = (0..4).map(|g| all[d].iter().filter(|x| x.2 == g).count()).collect();
        println!(
            "round {round}: {} regions, load median {} p75 {} p90 {} max {}; capitals ({}) median {} p90 {} max {}; over capacity {} regions, {} capitals; transport grades 0-3: {:?}",
            loads.len(),
            pct(&mut loads, 50),
            pct(&mut loads, 75),
            pct(&mut loads, 90),
            pct(&mut loads, 100),
            capitals.len(),
            pct(&mut capitals, 50),
            pct(&mut capitals, 90),
            pct(&mut capitals, 100),
            over,
            over_capitals,
            grades
        );
    }
}
