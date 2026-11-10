//! The session: owns the match and the native controllers, and drives phases.
//!
//! Native controllers are called with their seat's observation only, exactly as
//! an external agent would be over HTTP.

use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;
use serde::{Deserialize, Serialize};

/// How an LLM agent seat is configured. The seat itself is an ordinary external seat;
/// the worker that plays it lives in the server. The configuration is part of a save
/// (without credentials) so a loaded match can resume with the same seats.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentConfig {
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "one")]
    pub consult_every: u32,
    /// Held in memory only; never written to a save.
    #[serde(skip)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
}

fn one() -> u32 {
    1
}

/// An address as it may be written to a save: scheme, host, port and path. User
/// info (`https://user:secret@host`), the query and the fragment are dropped, since
/// any of them can carry a credential.
pub fn scrub_url(url: &str) -> String {
    let url = url.trim();
    let end = url.find(['?', '#']).unwrap_or(url.len());
    let url = &url[..end];
    let (scheme, rest) = match url.find("://") {
        Some(at) => (&url[..at + 3], &url[at + 3..]),
        None => ("", url),
    };
    let slash = rest.find('/').unwrap_or(rest.len());
    let (authority, path) = rest.split_at(slash);
    let host = authority.rsplit('@').next().unwrap_or(authority);
    format!("{scheme}{host}{path}")
}

impl AgentConfig {
    /// The configuration as a save holds it: no key, no credentials riding in the
    /// address, and no other field that repeats the key.
    pub fn for_save(&self) -> AgentConfig {
        let key = self.api_key.as_deref().map(str::trim).filter(|k| !k.is_empty());
        let clean = |field: &str| match key {
            Some(k) if field.contains(k) => String::new(),
            _ => field.to_string(),
        };
        AgentConfig {
            provider: self.provider.clone(),
            model: clean(&self.model),
            consult_every: self.consult_every,
            api_key: None,
            base_url: self.base_url.as_deref().map(scrub_url).map(|u| clean(&u)).filter(|u| !u.is_empty()),
            effort: self.effort.as_deref().map(clean).filter(|e| !e.is_empty()),
        }
    }
}

/// The save format this build writes and reads.
pub const SAVE_FORMAT: &str = "bts-save/1";

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
    pub agent_cfgs: Vec<Option<AgentConfig>>,
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
    agent_cfgs: Vec<Option<AgentConfig>>,
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
        serde_json::to_string(&SaveFile { format: SAVE_FORMAT.into(), world: self.m.save_json(), ais: self.ais.clone(), tokens: self.tokens.clone(), delegates: self.delegates.clone(), stewards: self.stewards.clone(), agent_cfgs: self.agent_cfgs.iter().map(|c| c.as_ref().map(AgentConfig::for_save)).collect() }).expect("save serializes")
    }

    /// Whether `text` repeats an API key this session holds in memory. A save never
    /// should (`AgentConfig::for_save`); the export routes check anyway and refuse.
    pub fn leaks_credential(&self, text: &str) -> bool {
        self.agent_cfgs.iter().flatten().filter_map(|c| c.api_key.as_deref()).map(str::trim).any(|k| k.len() >= 6 && text.contains(k))
    }

    /// Prove that a save can be played, on a scratch copy: every seat's view is built
    /// and one whole round is resolved (seats nobody in this process plays simply
    /// pass). A save that parses but contradicts itself fails here and never reaches
    /// the match in progress. Where panics unwind (the server) the failure is caught;
    /// where they abort (WebAssembly) the transport rehearses in a separate instance.
    pub fn rehearse(text: &str) -> Result<(), String> {
        let run = || -> Result<(), String> {
            let mut s = Session::load(text)?;
            s.exercise();
            Ok(())
        };
        match std::panic::catch_unwind(run) {
            Ok(result) => result,
            Err(panic) => {
                let why = panic.downcast_ref::<String>().map(String::as_str).or_else(|| panic.downcast_ref::<&str>().copied()).unwrap_or("the rules engine failed on it");
                Err(format!("the save cannot be played: {why}"))
            }
        }
    }

    fn exercise(&mut self) {
        let look = |s: &Session| {
            for seat in 0..s.m.seats() {
                let _ = s.m.observe(seat as SeatId);
            }
            let _ = s.m.spectate();
        };
        look(self);
        let round = self.m.round();
        for _ in 0..32 {
            if self.m.finished() || self.m.round() != round {
                break;
            }
            for seat in self.m.waiting_on() {
                if self.ais[seat as usize].is_none() && self.m.status(seat) != SeatStatus::Forfeited {
                    self.m.set_ready(seat, true);
                }
            }
            if !self.step() {
                break;
            }
        }
        look(self);
    }

    /// Read a save. Everything is parsed and checked before a session exists, so a
    /// caller can refuse a bad save without disturbing the match it already has.
    pub fn load(s: &str) -> Result<Session, String> {
        let f: SaveFile = serde_json::from_str(s).map_err(|e| e.to_string())?;
        if f.format != SAVE_FORMAT {
            return Err(format!("unsupported save format '{}'", f.format.chars().take(40).collect::<String>()));
        }
        let m = Match::load_json(&f.world)?;
        let n = m.seats();
        if n == 0 || f.ais.len() != n || f.tokens.len() != n {
            return Err("the save does not describe every seat of its match".into());
        }
        if (0..n).any(|i| Difficulty::from_controller(m.controller(i as SeatId)).is_some() && f.ais[i].is_none()) {
            return Err("the save is missing a built-in controller for one of its seats".into());
        }
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
