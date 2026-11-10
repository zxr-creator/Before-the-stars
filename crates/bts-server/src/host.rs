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
    /// Domains each external seat has delegated to a steward (the native policy,
    /// restricted to those domains and to that seat's own observation).
    pub delegates: Vec<Vec<String>>,
    pub stewards: Vec<NativeAi>,
    pub advised_round: Vec<u32>,
    /// LLM agent configuration per seat (without credentials), kept so a loaded match can resume.
    pub agent_cfgs: Vec<Option<crate::agents::AgentConfig>>,
}

#[derive(Serialize, Deserialize)]
struct SaveFile {
    format: String,
    world: String,
    ais: Vec<Option<NativeAi>>,
    tokens: Vec<String>,
    #[serde(default)]
    delegates: Vec<Vec<String>>,
    #[serde(default)]
    stewards: Vec<NativeAi>,
    #[serde(default)]
    agent_cfgs: Vec<Option<crate::agents::AgentConfig>>,
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
        let n = m.seats();
        let stewards = (0..n).map(|s| NativeAi::new(Difficulty::Medium, mix(entropy ^ 0x57E7 ^ s as u64))).collect();
        Session { m, ais, tokens, delegates: vec![Vec::new(); n], stewards, advised_round: vec![0; n], agent_cfgs: vec![None; n] }
    }

    pub fn set_delegates(&mut self, seat: SeatId, domains: Vec<String>) {
        let allowed = NativeAi::steward_domains();
        self.delegates[seat as usize] = domains.into_iter().filter(|d| allowed.contains(&d.as_str())).collect();
    }

    /// Stewards act once per round, at the end of the plan phase, for seats that asked for them.
    fn run_stewards(&mut self) {
        if self.m.phase() != Phase::Plan {
            return;
        }
        let round = self.m.round();
        for s in 0..self.m.seats() {
            if self.ais[s].is_some() || self.delegates[s].is_empty() || self.advised_round[s] == round || self.m.status(s as SeatId) != SeatStatus::Active {
                continue;
            }
            self.advised_round[s] = round;
            let obs = self.m.observe(s as SeatId);
            let domains = self.delegates[s].clone();
            let actions = self.stewards[s].advise(&obs, &domains);
            for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
                self.m.act(s as SeatId, chunk.to_vec());
            }
        }
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
        if blocked {
            return false;
        }
        self.run_stewards();
        self.m.try_advance()
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
        serde_json::to_string(&SaveFile { format: "bts-save/1".into(), world: self.m.save_json(), ais: self.ais.clone(), tokens: self.tokens.clone(), delegates: self.delegates.clone(), stewards: self.stewards.clone(), agent_cfgs: self.agent_cfgs.clone() }).expect("save serializes")
    }

    pub fn load(s: &str) -> Result<Session, String> {
        let f: SaveFile = serde_json::from_str(s).map_err(|e| e.to_string())?;
        let m = Match::load_json(&f.world)?;
        let n = m.seats();
        let mut delegates = f.delegates;
        delegates.resize(n, Vec::new());
        let mut stewards = f.stewards;
        while stewards.len() < n {
            stewards.push(NativeAi::new(Difficulty::Medium, mix(0x57E7 ^ stewards.len() as u64)));
        }
        let mut agent_cfgs = f.agent_cfgs;
        agent_cfgs.resize(n, None);
        Ok(Session { m, ais: f.ais, tokens: f.tokens, delegates, stewards, advised_round: vec![0; n], agent_cfgs })
    }
}
