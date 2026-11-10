//! Match host: owns the referee and the native controllers, and drives phases.
//!
//! Native controllers are called with their seat's observation only, exactly as
//! an external agent would be over HTTP.

use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;
use serde::{Deserialize, Serialize};

pub struct Session {
    pub m: Match,
    pub ais: Vec<Option<NativeAi>>,
    pub tokens: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct SaveFile {
    format: String,
    world: String,
    ais: Vec<Option<NativeAi>>,
    tokens: Vec<String>,
}

fn mix(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

impl Session {
    pub fn new(cfg: MatchConfig, entropy: u64) -> Session {
        let m = Match::new(cfg, entropy);
        let mut ais = Vec::new();
        let mut tokens = Vec::new();
        for s in 0..m.seats() {
            let kind = m.controller(s as SeatId);
            // The policy seed is separate from the world's private random key.
            ais.push(Difficulty::from_controller(kind).map(|d| NativeAi::new(d, mix(entropy ^ (s as u64 + 1) * 0xA5A5_5A5A))));
            tokens.push(format!("{:016x}", mix(entropy.wrapping_mul(31).wrapping_add(s as u64 * 7919 + 13))));
        }
        Session { m, ais, tokens }
    }

    /// One host step: native controllers that are due act on their own observation,
    /// then the phase advances if every seat is ready. Returns false when an external
    /// seat must act first or the match has ended.
    pub fn step(&mut self) -> bool {
        if self.m.finished() {
            return false;
        }
        let mut blocked = false;
        for seat in self.m.waiting_on() {
            let forfeited = self.m.status(seat) == SeatStatus::Forfeited;
            if self.ais[seat as usize].is_none() && forfeited {
                // predeclared maintenance controller for a withdrawn seat
                self.ais[seat as usize] = Some(NativeAi::new(Difficulty::Easy, mix(seat as u64 + 99)));
            }
            match self.ais[seat as usize].as_mut() {
                Some(ai) => {
                    let obs = self.m.observe(seat);
                    let actions = ai.decide(&obs);
                    for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
                        self.m.act(seat, chunk.to_vec());
                    }
                    self.m.set_ready(seat, false);
                }
                None => blocked = true,
            }
        }
        !blocked && self.m.try_advance()
    }

    /// Advance until an external seat must act or the match ends.
    pub fn drive(&mut self) -> bool {
        let mut advanced = false;
        for _ in 0..16 {
            if !self.step() {
                break;
            }
            advanced = true;
        }
        advanced
    }

    /// Run an all-native match for the given number of rounds (or to its end).
    pub fn run_rounds(&mut self, rounds: u32) {
        let target = self.m.round() + rounds;
        while !self.m.finished() && self.m.round() < target {
            if !self.step() {
                break;
            }
        }
    }

    pub fn save(&self) -> String {
        serde_json::to_string(&SaveFile { format: "bts-save/1".into(), world: self.m.save_json(), ais: self.ais.clone(), tokens: self.tokens.clone() }).expect("save serializes")
    }

    pub fn load(s: &str) -> Result<Session, String> {
        let f: SaveFile = serde_json::from_str(s).map_err(|e| e.to_string())?;
        Ok(Session { m: Match::load_json(&f.world)?, ais: f.ais, tokens: f.tokens })
    }
}
