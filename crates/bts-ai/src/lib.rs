//! Native non-LLM opponents.
//!
//! This crate depends only on `bts-protocol`. A controller receives the same
//! seat-filtered [`Observation`] a human or external agent receives and returns
//! ordinary [`Action`]s. It has no access to the referee's world state, hidden
//! graph, other seats' ledgers or future random draws.

mod policy;
pub mod tables;

use bts_protocol::*;
use serde::{Deserialize, Serialize};

pub const POLICY_VERSION: &str = "bts-native/1.4.0";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    /// The Expert test policy (design chapter 39, section 8.3): the Hard policy that
    /// plays the critical path, using only its own observation and the public
    /// tables. A verification tool, not offered in the setup.
    Expert,
}

impl Difficulty {
    pub fn from_controller(c: ControllerKind) -> Option<Difficulty> {
        match c {
            ControllerKind::NativeEasy => Some(Difficulty::Easy),
            ControllerKind::NativeMedium => Some(Difficulty::Medium),
            ControllerKind::NativeHard => Some(Difficulty::Hard),
            ControllerKind::NativeExpert => Some(Difficulty::Expert),
            _ => None,
        }
    }
    /// Candidate actions considered per round (design chapter 33).
    pub fn candidates(self) -> usize {
        match self {
            Difficulty::Easy => 12,
            Difficulty::Medium => 24,
            Difficulty::Hard | Difficulty::Expert => 48,
        }
    }
    /// Planning lookahead in decision rounds.
    pub fn lookahead(self) -> u32 {
        match self {
            Difficulty::Easy => 2,
            Difficulty::Medium => 6,
            Difficulty::Hard | Difficulty::Expert => 12,
        }
    }
}

/// The controller's own legal memory. Persisted with a match so recovery continues
/// the same policy without re-rolling plans.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Memory {
    pub rounds_seen: u32,
    /// Counterpart performance as recorded from this seat's own receipts and reports.
    pub grievances: Vec<i32>,
    pub last_offer_round: Vec<u32>,
    pub evaluated: u64,
    pub notes: Vec<String>,
    pub war_target: Option<SeatId>,
    pub last_settle_round: u32,
    pub last_survey_round: u32,
    /// Goods this seat wants but has no way to make at present; asked for in negotiation.
    #[serde(default)]
    pub imports: Vec<Good>,
    /// Facilities (region, kind) whose production method this controller chose
    /// itself. It returns only these to the works: a method the seat's player set
    /// is never undone by a steward.
    #[serde(default)]
    pub methods_set: Vec<(RegionId, String)>,
    /// Month in which the seat first saw that it could enter its next era, and the
    /// era (design chapter 37, section 3; the AI waits for a prepared crossing).
    #[serde(default)]
    pub era_eligible: Option<(u8, Month)>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NativeAi {
    pub policy_version: String,
    pub difficulty: Difficulty,
    pub policy_seed: u64,
    pub memory: Memory,
}

impl NativeAi {
    pub fn new(difficulty: Difficulty, policy_seed: u64) -> NativeAi {
        NativeAi { policy_version: POLICY_VERSION.to_string(), difficulty, policy_seed, memory: Memory::default() }
    }

    /// Advice for a human seat that has delegated some domains to a steward.
    /// Uses the same policy and the same observation; nothing else.
    pub fn advise(&mut self, obs: &Observation, domains: &[String]) -> Vec<Action> {
        if obs.phase != Phase::Plan || obs.status == SeatStatus::Eliminated || obs.outcome.is_some() || domains.is_empty() {
            return Vec::new();
        }
        self.memory.rounds_seen += 1;
        let scaled = policy::per_year(obs);
        policy::plan_domains(self, scaled.as_ref().unwrap_or(obs), Some(domains))
    }

    pub fn steward_domains() -> &'static [&'static str] {
        &policy::DOMAINS
    }

    /// Decide this phase's actions from the observation alone.
    pub fn decide(&mut self, obs: &Observation) -> Vec<Action> {
        policy::decide(self, obs)
    }
}
