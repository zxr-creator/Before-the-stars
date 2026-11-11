//! Authoritative rules engine for Before the Stars.
//!
//! [`Match`] owns the private world. Seats interact only through
//! [`Match::observe`] and [`Match::act`]; nothing else leaves this crate.

pub mod actions;
pub mod calendar;
pub mod content;
pub mod curve;
pub mod ledger;
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
    /// Referee-side books kept while a conservation audit is running; never saved
    /// and never shown to a seat.
    ledger_trace: Option<Vec<ledger::LedgerSnapshot>>,
    /// Calibration curve kept while recording (`curve::CurveRecorder`); never saved
    /// and never shown to a seat.
    curve: Option<curve::CurveRecorder>,
}

impl Match {
    pub fn new(cfg: MatchConfig, entropy: u64) -> Match {
        Match { world: worldgen::generate(cfg, entropy), ledger_trace: None, curve: None }
    }

    /// The whole world's books at this moment. Referee-level disclosure for
    /// conservation audits and tests: it covers every seat and must never be
    /// served to one.
    pub fn ledger_snapshot(&self) -> ledger::LedgerSnapshot {
        ledger::snapshot(&self.world, false)
    }

    /// Start (or stop) keeping the books of every month resolved from now on: one
    /// snapshot after the seats' decisions of each round, before its first month,
    /// and one at the close of every month. Recording changes nothing in the world.
    pub fn record_ledgers(&mut self, on: bool) {
        self.ledger_trace = if on { Some(self.ledger_trace.take().unwrap_or_default()) } else { None };
    }

    /// The snapshots recorded since the last call, oldest first.
    pub fn take_ledger_trace(&mut self) -> Vec<ledger::LedgerSnapshot> {
        match self.ledger_trace.as_mut() {
            Some(t) => std::mem::take(t),
            None => Vec::new(),
        }
    }

    /// Start (or stop) recording the calibration curve: one row per seat at the
    /// start of every decade resolved from now on (and now, if this is one).
    /// Referee-level disclosure for calibration only.
    pub fn record_curve(&mut self, on: bool) {
        self.curve = if on {
            let mut rec = self.curve.take().unwrap_or_else(|| curve::CurveRecorder::new(&self.world));
            rec.sample_if_due(&self.world);
            Some(rec)
        } else {
            None
        };
    }

    /// Record node timings as well as the curve (starts the curve if needed).
    pub fn record_node_months(&mut self) {
        if self.curve.is_none() {
            self.record_curve(true);
        }
        if let Some(c) = self.curve.as_mut() {
            c.track_nodes(&self.world);
        }
    }

    /// First months each seat's technologies became ready, leads, discovered and
    /// understood, while the curve is recorded (referee-side; `bts critical-path`).
    pub fn node_months(&self) -> Option<&Vec<Vec<[Month; 4]>>> {
        self.curve.as_ref().map(|c| &c.nodes)
    }

    /// The curve rows recorded since the last call, oldest first.
    pub fn take_curve(&mut self) -> Vec<curve::CurveRow> {
        match self.curve.as_mut() {
            Some(c) => std::mem::take(&mut c.rows),
            None => Vec::new(),
        }
    }

    /// The calendar as every seat sees it (public scenario information).
    pub fn calendar_view(&self) -> CalendarView {
        observe::calendar_view(&self.world)
    }

    /// The historical date of the month about to be simulated.
    pub fn date(&self) -> DateView {
        observe::date_view(&self.world.cfg, self.world.month)
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
                for s in 0..w.civs.len() {
                    let pop = w.civ_population(s as SeatId) as u64;
                    let c = &mut w.civs[s];
                    c.briefing.clear();
                    c.tallies.clear();
                    c.round_start_pop = pop;
                    c.receipts.retain(|r| r.round >= round);
                }
                if let Some(trace) = self.ledger_trace.as_mut() {
                    trace.push(ledger::snapshot(w, true));
                }
                let months = w.cfg.round_months(w.round);
                w.round_start = w.month;
                for _ in 0..months {
                    if let Some(c) = self.curve.as_mut() {
                        c.before_month(w);
                    }
                    sim::step_month(w);
                    if let Some(trace) = self.ledger_trace.as_mut() {
                        trace.push(ledger::snapshot(w, false));
                    }
                    if let Some(c) = self.curve.as_mut() {
                        c.after_month(w);
                    }
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
            Some(v) if v.starts_with("bts-rules/3.") => return Err(format!("this save was written by ruleset {v}, an earlier development build of ruleset 3.0; this build runs {running} and cannot load it: the world, the goods and productivity differ")),
            Some(v) if v.starts_with("bts-rules/2.") => return Err(format!("this save was written by ruleset {v}; this build runs {running} and cannot load it: the calendar, the goods and the population rules differ")),
            Some(v) => return Err(format!("this save was written by ruleset {v}; this build runs {running} and cannot load it: people, posts and goods are counted in different units")),
            None => return Err(format!("this save does not record the ruleset that wrote it; this build runs {running} and cannot load it")),
        }
        let world: World = serde_json::from_str(s).map_err(|e| e.to_string())?;
        Ok(Match { world, ledger_trace: None, curve: None })
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
    pub population: u64,
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
