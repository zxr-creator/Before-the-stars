//! Authoritative rules engine for Before the Stars.
//!
//! [`Match`] owns the private world. Seats interact only through
//! [`Match::observe`] and [`Match::act`]; nothing else leaves this crate.

pub mod actions;
pub mod content;
pub mod observe;
pub mod sim;
pub mod state;
pub mod util;
pub mod worldgen;

#[cfg(test)]
mod tests;

use bts_protocol::*;
use state::*;

pub use state::MatchConfig;

pub struct Match {
    world: World,
}

impl Match {
    pub fn new(cfg: MatchConfig, entropy: u64) -> Match {
        Match { world: worldgen::generate(cfg, entropy) }
    }

    pub fn config(&self) -> &MatchConfig {
        &self.world.cfg
    }
    pub fn match_id(&self) -> &str {
        &self.world.match_id
    }
    pub fn seats(&self) -> usize {
        self.world.civs.len()
    }
    pub fn month(&self) -> Month {
        self.world.month
    }
    pub fn round(&self) -> u32 {
        self.world.round
    }
    pub fn phase(&self) -> Phase {
        self.world.phase
    }
    pub fn window(&self) -> u8 {
        self.world.window
    }
    pub fn finished(&self) -> bool {
        self.world.outcome.is_some()
    }
    pub fn controller(&self, seat: SeatId) -> ControllerKind {
        self.world.civs[seat as usize].controller
    }
    pub fn status(&self, seat: SeatId) -> SeatStatus {
        self.world.civs[seat as usize].status
    }
    pub fn winner(&self) -> Option<SeatId> {
        self.world.outcome.as_ref().and_then(|o| o.winner)
    }
    pub fn reward(&self, seat: SeatId) -> f64 {
        sim::victory::reward(&self.world, seat)
    }
    pub fn state_hash(&self) -> u64 {
        self.world.state_hash()
    }

    /// The permission-filtered observation for one seat.
    pub fn observe(&self, seat: SeatId) -> Observation {
        observe::observe(&self.world, seat)
    }

    /// Whole-world view for an observer. Referee-level disclosure: callers must only
    /// serve it when no human seat is playing.
    pub fn spectate(&self) -> SpectatorView {
        observe::spectate(&self.world)
    }

    /// True when no seat is controlled by a human at the keyboard.
    pub fn observer_allowed(&self) -> bool {
        !self.world.civs.iter().any(|c| c.controller == ControllerKind::Human)
    }

    /// Validate and apply a batch of actions for a seat. Planning never advances time.
    pub fn act(&mut self, seat: SeatId, actions: Vec<Action>) -> Vec<Receipt> {
        actions.into_iter().take(MAX_ACTIONS_PER_BATCH).map(|a| actions::apply(&mut self.world, seat, a)).collect()
    }

    /// Mark a seat as finished with the current phase. With `through_round` the seat
    /// also passes every remaining phase of this round.
    pub fn set_ready(&mut self, seat: SeatId, through_round: bool) {
        if let Some(c) = self.world.civs.get_mut(seat as usize) {
            c.ready = true;
            if through_round {
                c.auto_pass = true;
            }
        }
    }

    /// Seats that still have to act in the current phase.
    pub fn waiting_on(&self) -> Vec<SeatId> {
        if self.finished() {
            return vec![];
        }
        self.world.civs.iter().filter(|c| c.status != SeatStatus::Eliminated && !(c.ready || c.auto_pass)).map(|c| c.seat).collect()
    }

    /// Advance one phase step if every seat is ready. Returns true if anything advanced.
    pub fn try_advance(&mut self) -> bool {
        if self.finished() || !self.waiting_on().is_empty() {
            return false;
        }
        let w = &mut self.world;
        match w.phase {
            Phase::Contact => {
                w.phase = Phase::Negotiate;
                w.window = 1;
                w.sent_window.iter_mut().for_each(|x| *x = false);
            }
            Phase::Negotiate => {
                if w.window >= NEGOTIATION_WINDOWS {
                    w.phase = Phase::Plan;
                    w.window = 0;
                } else {
                    w.window += 1;
                }
                w.sent_window.iter_mut().for_each(|x| *x = false);
            }
            Phase::Plan => {
                // receipts of the round being resolved stay readable through the next round,
                // so orders given late (including a steward's) can still be reviewed
                let round = w.round;
                for c in w.civs.iter_mut() {
                    c.briefing.clear();
                    c.receipts.retain(|r| r.round >= round);
                }
                for _ in 0..w.cfg.months_per_round {
                    sim::step_month(w);
                    if w.outcome.is_some() {
                        break;
                    }
                }
                sim::close_round(w);
                if w.outcome.is_none() {
                    w.round += 1;
                    w.phase = Phase::Contact;
                    w.window = 0;
                    w.envelopes.iter_mut().for_each(|x| *x = 0);
                    let round = w.round;
                    for o in w.offers.iter_mut() {
                        if o.status == "open" && o.expires_round < round {
                            o.status = "expired".into();
                        }
                    }
                    if w.offers.len() > 400 {
                        let cut = w.offers.len() - 400;
                        w.offers.drain(0..cut);
                    }
                    if w.messages.len() > 600 {
                        let cut = w.messages.len() - 600;
                        w.messages.drain(0..cut);
                    }
                    for c in w.civs.iter_mut() {
                        c.selected.clear();
                        if c.status == SeatStatus::Active {
                            c.auto_pass = false;
                        }
                    }
                }
            }
            Phase::Finished => return false,
        }
        for c in self.world.civs.iter_mut() {
            c.ready = false;
        }
        true
    }

    pub fn save_json(&self) -> String {
        serde_json::to_string(&self.world).expect("world serializes")
    }

    /// Restore a saved match. A save written by another ruleset is refused: people,
    /// posts and goods are counted in different units and cannot be migrated exactly.
    pub fn load_json(s: &str) -> Result<Match, String> {
        // read the recorded versions first, so an old save is refused by name even
        // when its layout no longer deserializes
        #[derive(serde::Deserialize)]
        struct Versions {
            #[serde(default)]
            versions: Vec<String>,
        }
        let head: Versions = serde_json::from_str(s).map_err(|e| e.to_string())?;
        let running = content::RULESET_VERSION;
        match head.versions.first() {
            Some(v) if v == running => {}
            Some(v) => return Err(format!("this save was written by ruleset {v}; this build runs {running} and cannot load it: people, posts and goods are counted in different units")),
            None => return Err(format!("this save does not record the ruleset that wrote it; this build runs {running} and cannot load it")),
        }
        let world: World = serde_json::from_str(s).map_err(|e| e.to_string())?;
        Ok(Match { world })
    }

    /// Referee-side diagnostics for headless evaluation. Never exposed to seats.
    pub fn diagnostics(&self) -> Vec<SeatDiagnostics> {
        let c = content::content();
        self.world
            .civs
            .iter()
            .map(|civ| SeatDiagnostics {
                seat: civ.seat,
                name: civ.name.clone(),
                status: civ.status,
                population: self.world.civ_population(civ.seat),
                regions: self.world.owned(civ.seat).len(),
                understood: civ.tech.iter().filter(|t| t.state >= ST_UNDERSTOOD).count(),
                highest_tier: (0..c.techs.len()).filter(|i| civ.knows(*i)).map(|i| c.techs[i].tier).max().unwrap_or(0),
                practices: civ.practice.iter().filter(|p| p.state >= 3).count(),
                soldiers: self.world.armies.iter().filter(|a| a.owner == civ.seat).map(|a| a.count()).sum(),
                gov_streak: civ.ftl.gov_streak,
                ftl_streak: civ.ftl.ftl_streak,
                assemblies: civ.ftl.assemblies.len(),
                trials: civ.ftl.trials.len(),
                sci_method: civ.milestones.sci_method,
                interstellar: civ.milestones.interstellar,
                stability: civ.stability,
                overlord: civ.overlord,
                food_bp: civ.food_ful_bp,
            })
            .collect()
    }
}

#[derive(Clone, Debug)]
pub struct SeatDiagnostics {
    pub seat: SeatId,
    pub name: String,
    pub status: SeatStatus,
    pub population: u32,
    pub regions: usize,
    pub understood: usize,
    pub highest_tier: u8,
    pub practices: usize,
    pub soldiers: u32,
    pub gov_streak: u32,
    pub ftl_streak: u32,
    pub assemblies: usize,
    pub trials: usize,
    pub sci_method: Option<Month>,
    pub interstellar: Option<Month>,
    pub stability: u8,
    pub overlord: Option<SeatId>,
    pub food_bp: u16,
}
