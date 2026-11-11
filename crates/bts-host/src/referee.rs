//! The referee's request router and its permission rules.
//!
//! Requests are shaped like the HTTP API (`docs/agent-api.md`): a method, a path
//! with an optional query, and a body. The reply carries a status, a body and a
//! few [`Effects`] the transport must act on (write an autosave, start agent
//! workers, stop the process).

use crate::portable::{self, Reason, Refusal};
use crate::session::{limits, AgentConfig, Session};
use crate::turn;
use bts_engine::MatchConfig;
use bts_protocol::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub(crate) type Failure = (u16, &'static str, String);

/// Controller names that ask for an LLM agent seat. A host that cannot run agent
/// workers (the browser build) refuses them by name instead of calling them unknown.
pub const AGENT_CONTROLLERS: [&str; 4] = ["claude-api", "claude-code", "codex", "openai-api"];

/// A provider of LLM agent seats, as a transport that can run them names it.
pub struct AgentProvider {
    pub key: &'static str,
    pub default_model: &'static str,
}

/// What a token presented for a driven seat means to that seat's agent slot.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentAccess {
    /// Not this slot's credential.
    None,
    /// The private credential of a consultation the slot is running now: the agent
    /// it started may read and command its own seat until the consultation ends.
    Live,
    /// The credential of a consultation that has ended (the phase moved on, or the
    /// slot took the seat back). Nothing is accepted any more.
    Ended,
}

/// What a seat driven by a worker in the transport's own process looks like to the
/// host. The host keeps one slot per agent seat, uses it for the permission rules
/// (a driven seat takes no orders from outside) and for the match summary; the
/// transport owns everything else about it (threads, clocks, credentials in use).
pub trait AgentSlot: Sized {
    /// Resolve a controller name from a new-match request to a provider, if this
    /// transport can run it.
    fn provider(name: &str) -> Option<AgentProvider>;
    /// The slot for a seat with this configuration; `None` when this transport cannot run it.
    fn new(cfg: &AgentConfig) -> Option<Self>;
    fn summary(&self) -> AgentSummary;
    /// The seat's consultation log, as the JSON array served by `GET /api/agent-log`.
    fn log(&self) -> serde_json::Value;
    /// Whether `token` lets the agent this slot started read and command its seat.
    /// A slot whose agent works through the seat API (an agent CLI with the game's
    /// MCP server) answers `Live` for the private token of the consultation it is
    /// running; every other slot never admits anybody.
    fn access(&self, _token: &str) -> AgentAccess {
        AgentAccess::None
    }
    /// A control request from the client (`POST /api/agent/control`), for example
    /// "resume" for a seat that stopped after repeated failures.
    fn control(&mut self, _op: &str) -> Result<(), String> {
        Err("this seat cannot be controlled".into())
    }
    /// The receipts of a submission made with , so a slot can tell what the
    /// agent it started ordered. Called for every accepted exchange on its seat.
    fn record(&mut self, _token: &str, _receipts: &[Receipt]) {}
}

/// The slot type of a host that has no agent workers at all.
pub enum NoAgents {}

impl AgentSlot for NoAgents {
    fn provider(_: &str) -> Option<AgentProvider> {
        None
    }
    fn new(_: &AgentConfig) -> Option<Self> {
        None
    }
    fn summary(&self) -> AgentSummary {
        match *self {}
    }
    fn log(&self) -> serde_json::Value {
        match *self {}
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct AgentSummary {
    pub provider: String,
    pub model: String,
    pub consult_every: u32,
    pub state: String,
    pub last_note: String,
    pub calls: u32,
    pub last_error: Option<String>,
    pub thinking_seconds: Option<u64>,
    /// "agent" (a CLI agent that plays through the seat API) or "oneshot" (one reply per consultation).
    pub mode: String,
    /// Consecutive failed consultations, and how many stop the seat.
    pub errors_in_row: u32,
    pub max_failures: u32,
    /// What the seat's consultations have cost so far, as the providers reported it.
    pub spent_usd: f64,
    pub tokens: u64,
    /// Seconds one consultation may take.
    pub budget_seconds: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Config {
    /// Every seat request must carry that seat's token (`bts serve --require-tokens`).
    pub require_tokens: bool,
    /// The referee runs as a packaged application and may be shut down from the client.
    pub app_mode: bool,
    /// `POST /api/advance` resolves the rounds of an all-native match before it
    /// answers. When false it only records how far to run and the transport calls
    /// [`Host::tick`] until nothing is pending, so it can stay responsive.
    pub settle_inline: bool,
}

pub struct Request<'a> {
    pub method: &'a str,
    /// Path and optional query, for example `/api/observation?seat=0&token=`.
    pub target: &'a str,
    pub body: &'a str,
    /// Fresh entropy from the transport; used only when a match is created.
    pub entropy: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Body {
    Json,
    Markdown,
    /// A save file: the bytes are in [`Reply::data`], and `body` is empty.
    Binary,
}

/// What the transport must do after a request, beyond sending the reply.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Effects {
    /// The session was changed by this request.
    pub changed: bool,
    /// A point at which the referee keeps an autosave.
    pub autosave: bool,
    /// A session was created or loaded: agent slots were rebuilt and their workers must be started.
    pub installed: bool,
    /// The client asked a packaged application to stop.
    pub quit: bool,
}

pub struct Reply {
    pub status: u16,
    pub kind: Body,
    pub body: String,
    /// The reply when `kind` is [`Body::Binary`]; empty otherwise.
    pub data: Vec<u8>,
    pub effects: Effects,
}

impl Reply {
    fn json(body: String) -> Reply {
        Reply { status: 200, kind: Body::Json, body, data: Vec::new(), effects: Effects::default() }
    }
    fn of<T: Serialize>(value: &T) -> Reply {
        Reply::json(serde_json::to_string(value).expect("reply serializes"))
    }
    fn error(status: u16, code: &str, message: &str) -> Reply {
        Reply { status, kind: Body::Json, body: serde_json::json!({ "error": code, "message": message }).to_string(), data: Vec::new(), effects: Effects::default() }
    }
    fn binary(data: Vec<u8>) -> Reply {
        Reply { status: 200, kind: Body::Binary, body: String::new(), data, effects: Effects::default() }
    }
    /// A save file that was not loaded: `INVALID_SAVE` with the specific reason beside it.
    fn refused(refusal: &Refusal) -> Reply {
        let body = serde_json::json!({ "error": "INVALID_SAVE", "reason": refusal.reason.code(), "message": refusal.message }).to_string();
        Reply { status: 400, kind: Body::Json, body, data: Vec::new(), effects: Effects::default() }
    }
    /// The reply as bytes, whatever its kind.
    pub fn into_bytes(self) -> Vec<u8> {
        if self.kind == Body::Binary {
            self.data
        } else {
            self.body.into_bytes()
        }
    }
    fn with(mut self, effects: Effects) -> Reply {
        self.effects = effects;
        self
    }
    pub fn ok(&self) -> bool {
        self.status == 200
    }
}

/// The result of one deferred playback step (see [`Host::tick`]).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Tick {
    /// The match moved.
    pub stepped: bool,
    /// A round was resolved (or the match ended): an autosave point.
    pub round_completed: bool,
    /// More steps are due.
    pub pending: bool,
}

/// Parse a controller name of a native, human or external seat.
pub fn controller(s: &str) -> Option<ControllerKind> {
    Some(match s.trim().to_lowercase().as_str() {
        "human" => ControllerKind::Human,
        "external" | "agent" => ControllerKind::External,
        "easy" | "native_easy" => ControllerKind::NativeEasy,
        "medium" | "native_medium" => ControllerKind::NativeMedium,
        "hard" | "native_hard" => ControllerKind::NativeHard,
        // the Expert test policy (design chapter 39, section 8.3): not offered in setup
        "expert" | "native_expert" => ControllerKind::NativeExpert,
        _ => return None,
    })
}

#[derive(Deserialize)]
struct NewMatch {
    #[serde(default)]
    seed: Option<String>,
    #[serde(default)]
    regions: Option<u16>,
    /// A development clock of twelve-month rounds from 5000 BC ending at this month.
    #[serde(default)]
    horizon: Option<u32>,
    /// "standard" (525 rounds, 5000 BC to AD 2500) or "quick" (230 rounds, same dates).
    #[serde(default)]
    calendar: Option<String>,
    #[serde(default)]
    pace_bp: Option<u32>,
    /// "earth_like" (the default generated planet) or "classic" (the flat map of ruleset 2.0).
    #[serde(default)]
    world: Option<String>,
    #[serde(default)]
    controllers: Option<Vec<String>>,
    #[serde(default)]
    disclosed_objective: Option<bool>,
    #[serde(default)]
    public_seed: Option<bool>,
    /// Per-seat options for LLM agent seats, keyed by seat number.
    #[serde(default)]
    agent_options: HashMap<String, AgentOptions>,
}

#[derive(Deserialize, Default, Clone)]
struct AgentOptions {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    consult_every: Option<u32>,
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    base_url: Option<String>,
    #[serde(default)]
    effort: Option<String>,
    #[serde(default)]
    auth: Option<String>,
    #[serde(default)]
    budget_seconds: Option<u32>,
    #[serde(default)]
    max_calls: Option<u32>,
    #[serde(default)]
    max_usd: Option<f64>,
    #[serde(default)]
    max_tokens: Option<u32>,
    #[serde(default)]
    max_failures: Option<u32>,
}

/// Agent seats named in a new-match request, by seat.
fn agents_from<A: AgentSlot>(n: &NewMatch) -> Vec<Option<AgentConfig>> {
    let seats = n.controllers.as_ref().map_or(4, |c| c.len().clamp(2, 10));
    let mut out = vec![None; seats];
    if let Some(c) = &n.controllers {
        for (i, name) in c.iter().enumerate().take(seats) {
            if let Some(p) = A::provider(name.trim()) {
                let o = n.agent_options.get(&i.to_string()).cloned().unwrap_or_default();
                out[i] = Some(AgentConfig {
                    provider: p.key.to_string(),
                    model: o.model.filter(|m| !m.trim().is_empty()).map(|m| m.trim().to_string()).unwrap_or_else(|| p.default_model.to_string()),
                    consult_every: o.consult_every.unwrap_or(1).clamp(1, 60),
                    api_key: o.api_key.filter(|k| !k.trim().is_empty()),
                    base_url: o.base_url.filter(|k| !k.trim().is_empty()),
                    effort: o.effort.map(|k| k.trim().to_lowercase()).filter(|k| ["low", "medium", "high", "xhigh", "max"].contains(&k.as_str())),
                    auth: o.auth.filter(|a| a == "login" || a == "api_key"),
                    budget_seconds: o.budget_seconds.map(|v| v.clamp(limits::BUDGET_SECONDS.1, limits::BUDGET_SECONDS.2)),
                    max_calls: o.max_calls.map(|v| v.clamp(limits::MAX_CALLS.1, limits::MAX_CALLS.2)),
                    max_usd: o.max_usd.filter(|v| v.is_finite()).map(|v| v.clamp(limits::MAX_USD.1, limits::MAX_USD.2)),
                    max_tokens: o.max_tokens.map(|v| v.clamp(limits::MAX_TOKENS.1, limits::MAX_TOKENS.2)),
                    max_failures: o.max_failures.map(|v| v.clamp(limits::MAX_FAILURES.1, limits::MAX_FAILURES.2)),
                });
            }
        }
    }
    out
}

fn config_from<A: AgentSlot>(n: NewMatch) -> Result<MatchConfig, String> {
    let mut cfg = MatchConfig::default();
    if let Some(s) = n.seed {
        if !s.trim().is_empty() {
            cfg.seed = s.trim().chars().take(64).collect();
        }
    }
    if let Some(r) = n.regions {
        // the map presets (Small 30, Standard 60, Large 120, Huge 200; 90 for tests)
        // and the earlier 24, 48 and 72
        if ![30, 60, 90, 120, 200, 24, 48, 72].contains(&r) {
            return Err("regions must be 30, 60, 90, 120 or 200".into());
        }
        cfg.regions = r;
    }
    if let Some(h) = n.horizon {
        if !(120..=6000).contains(&h) || h % 12 != 0 {
            return Err("horizon must be a multiple of 12 between 120 and 6000 months".into());
        }
        cfg.calendar = MatchConfig::fixture_calendar(h / 12);
    }
    if let Some(c) = n.calendar {
        cfg.calendar = match c.trim() {
            "standard" => bts_engine::calendar::CalendarId::Standard,
            "quick" => bts_engine::calendar::CalendarId::Quick,
            _ => return Err("calendar must be \"standard\" or \"quick\"".into()),
        };
    }
    if let Some(p) = n.pace_bp {
        cfg.pace_bp = p.clamp(1000, 30_000);
    }
    if let Some(k) = n.world {
        cfg.world = match k.trim() {
            "earth_like" => bts_protocol::WorldKind::EarthLike,
            "classic" => bts_protocol::WorldKind::Classic,
            _ => return Err("world must be \"earth_like\" or \"classic\"".into()),
        };
    }
    if let Some(c) = n.controllers {
        // design chapter 40, section 2.2: each map preset takes a range of seats
        let (lo, hi, name) = match cfg.regions {
            30 => (2, 3, "Small"),
            60 => (2, 5, "Standard"),
            120 => (4, 8, "Large"),
            200 => (6, 10, "Huge"),
            _ => (2, 10, ""),
        };
        if c.len() < lo || c.len() > hi {
            return Err(if name.is_empty() { "a match takes 2 to 10 civilizations".to_string() } else { format!("{name} maps take {lo} to {hi} civilizations") });
        }
        let mut kinds = Vec::new();
        for s in &c {
            // an LLM agent seat is an ordinary external seat driven by a worker in the transport's process
            let kind = if A::provider(s.trim()).is_some() { Some(ControllerKind::External) } else { controller(s) };
            match kind {
                Some(k) => kinds.push(k),
                None if AGENT_CONTROLLERS.contains(&s.trim()) => return Err(format!("'{}' is an LLM agent seat, which needs the server-backed game; this referee has no agent workers", s.trim())),
                None => return Err(format!("unknown controller '{s}'")),
            }
        }
        cfg.controllers = kinds;
    }
    if let Some(d) = n.disclosed_objective {
        cfg.disclosed_objective = d;
    }
    if let Some(p) = n.public_seed {
        cfg.public_seed = p;
    }
    Ok(cfg)
}

#[derive(Serialize)]
pub struct SeatSummary {
    pub seat: SeatId,
    pub name: String,
    pub color: String,
    pub controller: ControllerKind,
    pub status: SeatStatus,
    /// Domains this seat has delegated to a steward.
    pub delegates: Vec<String>,
    pub agent: Option<AgentSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Serialize)]
pub struct MatchSummary {
    pub observer_allowed: bool,
    /// Observer matches advance only up to this round until asked for more.
    pub autoplay_until: u32,
    pub app_mode: bool,
    pub exists: bool,
    pub match_id: String,
    pub seed: String,
    pub regions: u16,
    pub round: u32,
    pub month: Month,
    pub months_per_round: u32,
    pub horizon: Month,
    /// The historical date of the month about to be simulated (ruleset 3.0).
    pub date: Option<DateView>,
    /// The round schedule and where this round sits in it.
    pub calendar: Option<CalendarView>,
    pub phase: Phase,
    pub window: u8,
    pub finished: bool,
    pub winner: Option<SeatId>,
    pub disclosed_objective: bool,
    pub waiting_on: Vec<SeatId>,
    pub seats: Vec<SeatSummary>,
    pub versions: Vec<String>,
    pub steward_domains: Vec<String>,
}

/// What a save file is, read without loading it: the answer of `POST /api/savefile/describe`.
#[derive(Clone, Debug, Serialize)]
pub struct Description {
    /// Whether importing this file would succeed on this referee.
    pub loadable: bool,
    /// Why not: a [`Reason`] code. Absent when loadable.
    pub reason: Option<&'static str>,
    pub message: Option<String>,
    /// Bare session text (a save from before the container, or the server's autosave) rather than a container.
    pub legacy: bool,
    /// Size of the file as given.
    pub bytes: usize,
    /// The file's own description, when it could be read (it can be even when the file is not loadable).
    pub header: Option<portable::Header>,
    /// A file name to offer when this save is written out.
    pub file_name: Option<String>,
    /// What this build runs, to show beside the file's versions.
    pub game: &'static str,
    pub build: portable::Versions,
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let hex = |b: Option<&u8>| b.and_then(|b| (*b as char).to_digit(16)).map(|d| d as u8);
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match (bytes[i], hex(bytes.get(i + 1)), hex(bytes.get(i + 2))) {
            (b'%', Some(hi), Some(lo)) => {
                out.push(hi * 16 + lo);
                i += 3;
            }
            (b'+', _, _) => {
                out.push(b' ');
                i += 1;
            }
            (b, _, _) => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query(target: &str) -> (&str, HashMap<String, String>) {
    let (path, q) = target.split_once('?').unwrap_or((target, ""));
    let mut map = HashMap::new();
    for pair in q.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            map.insert(k.to_string(), v.replace("%20", " "));
        }
    }
    (path, map)
}

#[derive(Deserialize)]
struct ReadyBody {
    seat: SeatId,
    #[serde(default)]
    token: String,
    #[serde(default)]
    through_round: bool,
}

#[derive(Deserialize)]
struct DelegateBody {
    seat: SeatId,
    #[serde(default)]
    token: String,
    domains: Vec<String>,
}

fn chronicle_markdown(obs: &Observation) -> String {
    let mut out = format!("# Chronicle of {}\n\nMatch {} — recorded through month {} (year {}).\n\n", obs.civ.name, obs.match_id, obs.month, obs.month / 12 + 1);
    out.push_str("Entries are this seat's own authorized record. Reported items are claims received, not verified facts.\n\n");
    for e in &obs.chronicle {
        out.push_str(&format!("## Year {} — {}\n\n*{}; {}*\n\n{}\n\n", e.month / 12 + 1, e.title, e.category.label(), e.epistemic.label().to_lowercase(), e.text));
        for ev in &e.evidence {
            out.push_str(&format!("- {ev}\n"));
        }
        out.push('\n');
    }
    out
}

fn no_match() -> Failure {
    (404, "NO_MATCH", "no match is running".into())
}

fn not_portable() -> Failure {
    (403, "UNAUTHORIZED", "a session can be exported only when no seat is external and tokens are not required".into())
}

fn leak() -> Failure {
    (500, "INTERNAL", "the save would contain an API key; nothing was exported".into())
}

fn turn_over() -> Failure {
    (409, "TURN_OVER", "this consultation has ended: the phase moved on or the referee took the seat back. Stop now; you will be called again when it is your turn.".into())
}

fn unauthorized() -> Failure {
    (403, "UNAUTHORIZED", "unknown seat or token".into())
}

/// The referee: one match at most, and the rules for who may touch it.
pub struct Host<A: AgentSlot = NoAgents> {
    pub cfg: Config,
    pub session: Option<Session>,
    /// Bumped whenever a match is created or loaded; stale agent workers stop when it changes.
    pub generation: u64,
    /// One slot per seat; `Some` for a seat a worker in this process plays.
    pub agents: Vec<Option<A>>,
    /// In an unattended match nothing advances past this round until the observer asks.
    pub autoplay_until: u32,
    pub(crate) turn_cache: turn::Cache,
    /// The round a deferred playback step has started and will finish.
    stepping: Option<u32>,
    /// How large a save file this referee will read (see [`portable::Limits`]).
    pub limits: portable::Limits,
}

impl<A: AgentSlot> Host<A> {
    pub fn new(cfg: Config) -> Host<A> {
        Host { cfg, session: None, generation: 0, agents: Vec::new(), autoplay_until: u32::MAX, turn_cache: turn::Cache::default(), stepping: None, limits: portable::Limits::default() }
    }

    // ---- who is at the table ------------------------------------------------------

    fn has_agent(&self, seat: usize) -> bool {
        self.agents.get(seat).is_some_and(|a| a.is_some())
    }

    /// A seat that takes its orders from inside this process: a native controller,
    /// or an agent worker. Nobody outside may command it.
    pub fn driven(&self, seat: usize) -> bool {
        self.session.as_ref().is_some_and(|s| s.ais.get(seat).is_some_and(|a| a.is_some())) || self.has_agent(seat)
    }

    /// A seat somebody outside the referee plays: a person, or an external agent
    /// that speaks the API itself. Such a seat competes, so nothing the referee
    /// knows beyond that seat's own observation may be shown while it exists.
    fn outside(&self, s: &Session, seat: usize) -> bool {
        match s.m.controller(seat as SeatId) {
            ControllerKind::Human => true,
            ControllerKind::External => !self.has_agent(seat),
            _ => false,
        }
    }

    /// True when a match exists and no seat is played from outside: it only moves
    /// when an observer asks.
    pub fn unattended(&self) -> bool {
        self.session.as_ref().is_some_and(|s| (0..s.m.seats()).all(|i| !self.outside(s, i)))
    }

    /// THE observer rule. The whole-world view, any seat's own view, agent logs and
    /// playback control are open only when no seat is human or external and seat
    /// tokens are not required. Every transport asks here.
    pub fn observer_open(&self) -> bool {
        self.unattended() && !self.cfg.require_tokens
    }

    /// Whether the whole session may be handed out as text. A save holds the entire
    /// world, so it never leaves a referee that has an external seat or requires tokens.
    fn session_portable(&self) -> bool {
        !self.cfg.require_tokens && self.session.as_ref().is_some_and(|s| (0..s.m.seats()).all(|i| s.m.controller(i as SeatId) != ControllerKind::External || self.has_agent(i)))
    }

    /// The same rule for a session that is not the running one (a named save on disk):
    /// it may leave as a file only if it holds no external seat, other than an LLM
    /// agent seat this referee itself would play.
    fn text_portable(&self, s: &Session) -> bool {
        !self.cfg.require_tokens && (0..s.m.seats()).all(|i| s.m.controller(i as SeatId) != ControllerKind::External || s.agent_cfgs[i].as_ref().is_some_and(|c| A::new(c).is_some()))
    }

    /// Whether agent workers may move the match now.
    pub fn may_run(&self) -> bool {
        match &self.session {
            Some(s) => !self.unattended() || s.m.round() < self.autoplay_until,
            None => false,
        }
    }

    /// The session, if this request may read (or, with `write`, command) the seat.
    pub(crate) fn seat_access(&self, seat: SeatId, token: &str, write: bool) -> Result<&Session, Failure> {
        let s = self.session.as_ref().ok_or_else(no_match)?;
        let idx = seat as usize;
        if idx >= s.m.seats() {
            return Err(unauthorized());
        }
        // the agent an agent slot started plays its own seat with the consultation's private token
        match self.agents.get(idx).and_then(|a| a.as_ref()).map(|a| a.access(token)) {
            Some(AgentAccess::Live) => return Ok(s),
            Some(AgentAccess::Ended) => return Err(turn_over()),
            _ => {}
        }
        if self.cfg.require_tokens && s.tokens[idx] != token {
            return Err(unauthorized());
        }
        // a driven seat takes no orders from outside, and its view is open only to an observer
        if self.driven(idx) && (write || !self.observer_open()) {
            return Err(unauthorized());
        }
        Ok(s)
    }

    // ---- the match ----------------------------------------------------------------

    pub fn summary(&self, with_tokens: bool) -> Option<MatchSummary> {
        let s = self.session.as_ref()?;
        let cfg = s.m.config();
        Some(MatchSummary {
            observer_allowed: self.unattended(),
            autoplay_until: self.autoplay_until,
            app_mode: self.cfg.app_mode,
            exists: true,
            match_id: s.m.match_id().to_string(),
            seed: if cfg.public_seed { cfg.seed.clone() } else { "(sealed)".into() },
            regions: cfg.regions,
            round: s.m.round(),
            month: s.m.month(),
            months_per_round: cfg.round_months(s.m.round()),
            horizon: cfg.horizon(),
            date: Some(bts_engine::observe::date_view(cfg, s.m.month())),
            calendar: Some(s.m.calendar_view()),
            phase: s.m.phase(),
            window: s.m.window(),
            finished: s.m.finished(),
            winner: s.m.winner(),
            disclosed_objective: cfg.disclosed_objective,
            waiting_on: s.m.waiting_on(),
            seats: (0..s.m.seats())
                .map(|i| {
                    let seat = i as SeatId;
                    let obs_name = s.m.observe(seat);
                    let kind = s.m.controller(seat);
                    SeatSummary {
                        seat,
                        name: obs_name.civ.name,
                        color: obs_name.civ.color,
                        controller: kind,
                        status: s.m.status(seat),
                        delegates: s.delegates[i].clone(),
                        agent: self.agents.get(i).and_then(|a| a.as_ref()).map(|a| a.summary()),
                        token: if with_tokens && matches!(kind, ControllerKind::Human | ControllerKind::External) { Some(s.tokens[i].clone()) } else { None },
                    }
                })
                .collect(),
            steward_domains: bts_ai::NativeAi::steward_domains().iter().map(|d| d.to_string()).collect(),
            versions: vec![bts_engine::content::RULESET_VERSION.into(), bts_engine::content::CONTENT_VERSION.into(), bts_engine::content::GENERATOR_VERSION.into(), PROTOCOL_VERSION.into(), bts_ai::POLICY_VERSION.into()],
        })
    }

    fn summary_reply(&self, with_tokens: bool) -> Reply {
        Reply::of(&self.summary(with_tokens).expect("summary needs a match"))
    }

    /// Make `session` the match (new or loaded): rebuild the agent slots and reset
    /// playback. The transport then starts a worker for every slot.
    pub fn install(&mut self, mut session: Session, cfgs: Vec<Option<AgentConfig>>) {
        self.generation += 1;
        let n = session.m.seats();
        self.agents = (0..n).map(|_| None).collect();
        for (i, cfg) in cfgs.into_iter().enumerate().take(n) {
            let Some(cfg) = cfg else { continue };
            if session.m.controller(i as SeatId) != ControllerKind::External {
                continue;
            }
            if let Some(slot) = A::new(&cfg) {
                // the steward runs everything until the model says otherwise
                if session.delegates[i].is_empty() {
                    session.set_delegates(i as SeatId, bts_ai::NativeAi::steward_domains().iter().map(|d| d.to_string()).collect());
                }
                session.agent_cfgs[i] = Some(cfg);
                self.agents[i] = Some(slot);
            }
        }
        self.stepping = None;
        self.session = Some(session);
        // an unattended match waits for the observer; a match somebody plays runs on that seat's clock
        self.autoplay_until = if self.unattended() { self.session.as_ref().map(|s| s.m.round()).unwrap_or(0) } else { u32::MAX };
    }

    /// The whole session as save text, for the transport's own storage (files on
    /// disk, an autosave). Not a request: no permission rule applies.
    pub fn session_text(&self) -> Option<String> {
        self.session.as_ref().map(|s| s.save())
    }

    /// Replace the match with a saved one. The save is read, checked and rehearsed
    /// on a scratch copy first; on any error the current match is left exactly as it was.
    pub fn install_text(&mut self, text: &str) -> Result<(), String> {
        self.install_checked(text).map_err(|r| r.message)
    }

    /// A seat of this session that this referee cannot run, if any.
    fn unrunnable_seat(s: &Session) -> Option<Refusal> {
        let i = (0..s.m.seats()).find(|&i| s.agent_cfgs[i].as_ref().is_some_and(|c| A::new(c).is_none()))?;
        Some(Refusal::new(Reason::NeedsServer, format!("seat {} of this save is an LLM agent seat, which needs the server-backed game; this referee has no agent workers", i + 1)))
    }

    fn install_checked(&mut self, text: &str) -> Result<(), Refusal> {
        Session::rehearse(text).map_err(|e| Refusal::new(Reason::Unplayable, e))?;
        let s = Session::load(text).map_err(|e| Refusal::new(Reason::Unplayable, e))?;
        if let Some(refusal) = Self::unrunnable_seat(&s) {
            return Err(refusal);
        }
        let cfgs = s.agent_cfgs.clone();
        self.install(s, cfgs);
        Ok(())
    }

    // ---- save files -----------------------------------------------------------------

    /// The running match as a save file, for the transport's own storage. Not a
    /// request: no permission rule applies (compare [`Host::session_text`]).
    pub fn container(&self, meta: portable::Meta) -> Option<Vec<u8>> {
        self.session.as_ref().map(|s| portable::pack(s, &s.save(), meta))
    }

    /// The running match as a save file for whoever asked: refused when the session
    /// may not leave this referee (an external seat, or required tokens).
    pub fn export_file(&self, meta: portable::Meta) -> Result<Vec<u8>, Failure> {
        let s = self.session.as_ref().ok_or_else(no_match)?;
        if !self.session_portable() {
            return Err(not_portable());
        }
        let text = s.save();
        if s.leaks_credential(&text) {
            return Err(leak());
        }
        Ok(portable::pack(s, &text, meta))
    }

    /// A stored session (a named save's text) as a save file for whoever asked,
    /// under the same rule as [`Host::export_file`], applied to the stored match.
    pub fn export_text(&self, text: &str, meta: portable::Meta) -> Result<Vec<u8>, Failure> {
        let s = Session::load(text).map_err(|e| (400, "INVALID_SAVE", e))?;
        if !self.text_portable(&s) {
            return Err(not_portable());
        }
        Ok(portable::pack(&s, text, meta))
    }

    /// Whether the session a header describes may leave this referee as a file, by the
    /// rule of [`Host::export_file`]. For save files this referee wrote itself.
    pub fn header_portable(&self, header: &portable::Header) -> bool {
        !self.cfg.require_tokens && header.seats.iter().all(|s| s.controller != ControllerKind::External || s.agent.as_deref().is_some_and(|p| A::provider(p).is_some()))
    }

    /// Read a save file as far as its session text: a container is checked in full
    /// (structure, versions, bounded unpacking, checksum); bare session text, as the
    /// server's older saves are, is accepted within the same size limit. The header
    /// comes back even with a refusal when it could be read.
    #[allow(clippy::type_complexity)]
    fn read_file(&self, bytes: &[u8]) -> Result<(portable::Header, String, bool), (Option<portable::Header>, Refusal)> {
        let not_a_save = || (None, Refusal::new(Reason::NotASave, "this is not a Before the Stars save file"));
        let braces = bytes.iter().find(|b| !b.is_ascii_whitespace()).is_some_and(|b| *b == b'{');
        if portable::is_container(bytes) || !braces {
            let (header, payload) = portable::read_header(bytes, &self.limits).map_err(|r| (None, r))?;
            let checked = portable::compatible(&header).and_then(|()| portable::unpack(&header, payload, &self.limits));
            return match checked {
                Ok(text) => Ok((header, text, false)),
                Err(r) => Err((Some(header), r)),
            };
        }
        let cap = self.limits.max_unpacked.min(self.limits.max_file);
        if bytes.len() > cap {
            return Err((None, Refusal::new(Reason::TooLarge, format!("the file is {} bytes; this game reads saves up to {cap} bytes", bytes.len()))));
        }
        let text = std::str::from_utf8(bytes).map_err(|_| not_a_save())?;
        if !text.trim_start().starts_with("{\"format\":\"bts-save/") {
            return Err(not_a_save());
        }
        let session = Session::load(text).map_err(|e| (None, Refusal::new(Reason::Unplayable, format!("the save text cannot be read: {e}"))))?;
        Ok((portable::describe_text(&session, text), text.to_string(), true))
    }

    /// Say what a save file is without loading it. With `rehearse`, the session is
    /// also played for a round on a scratch copy, exactly as an import would, so
    /// `loadable` is the answer an import would give. The running match is not touched.
    pub fn describe_file(&self, bytes: &[u8], rehearse: bool) -> Description {
        let (header, legacy, refusal) = match self.read_file(bytes) {
            Err((header, refusal)) => (header, false, Some(refusal)),
            Ok((header, text, legacy)) => {
                let refusal = match Session::load(&text) {
                    Err(e) => Some(Refusal::new(Reason::Unplayable, e)),
                    Ok(s) => Self::unrunnable_seat(&s).or_else(|| if rehearse { Session::rehearse(&text).err().map(|e| Refusal::new(Reason::Unplayable, e)) } else { None }),
                };
                (Some(header), legacy, refusal)
            }
        };
        Description {
            loadable: refusal.is_none(),
            reason: refusal.as_ref().map(|r| r.reason.code()),
            message: refusal.map(|r| r.message),
            legacy,
            bytes: bytes.len(),
            file_name: header.as_ref().map(portable::file_name),
            header,
            game: env!("CARGO_PKG_VERSION"),
            build: portable::Versions::current(),
        }
    }

    /// Replace the match with the one in a save file (a container, or bare session
    /// text). Every check of [`portable::open`] runs, then the parse and the
    /// rehearsal; on any refusal the current match is left exactly as it was.
    pub fn install_file(&mut self, bytes: &[u8]) -> Result<portable::Header, Refusal> {
        let (header, text, _) = self.read_file(bytes).map_err(|(_, refusal)| refusal)?;
        self.install_checked(&text)?;
        Ok(header)
    }

    /// The save-file routes, which carry bytes rather than text. `None` for any other request.
    fn save_file_routes(&mut self, method: &str, target: &str, body: &[u8]) -> Option<Reply> {
        let (path, q) = query(target);
        let result = match (method, path) {
            ("GET", "/api/savefile") => {
                let name = q.get("name").map(|n| percent_decode(n)).unwrap_or_default();
                let meta = portable::Meta {
                    kind: q.get("kind").and_then(|k| portable::Kind::parse(k)).unwrap_or(portable::Kind::Manual),
                    name: &name,
                    created_ms: q.get("created").and_then(|c| c.parse().ok()).unwrap_or(0),
                };
                self.export_file(meta).map(Reply::binary)
            }
            ("POST", "/api/savefile/describe") => Ok(Reply::of(&self.describe_file(body, q.get("rehearse").map(String::as_str) != Some("0")))),
            // the same save under another name: a pure rewrite of the header, for stores that keep files
            ("POST", "/api/savefile/rename") => Ok(match portable::rename(body, &q.get("name").map(|n| percent_decode(n)).unwrap_or_default(), &self.limits) {
                Ok(file) => Reply::binary(file),
                Err(refusal) => Reply::refused(&refusal),
            }),
            ("POST", "/api/savefile/import") => Ok(match self.install_file(body) {
                Ok(_) => self.summary_reply(true).with(Effects { changed: true, installed: true, ..Default::default() }),
                Err(refusal) => Reply::refused(&refusal),
            }),
            _ => return None,
        };
        Some(result.unwrap_or_else(|(status, code, message)| Reply::error(status, code, &message)))
    }

    /// Answer one request whose body is bytes. This is what a transport calls: the
    /// save-file routes take and return binary, everything else is text and goes to
    /// [`Host::handle`].
    pub fn handle_bytes(&mut self, method: &str, target: &str, body: &[u8], entropy: u64) -> Reply {
        if let Some(reply) = self.save_file_routes(method, target, body) {
            return reply;
        }
        match std::str::from_utf8(body) {
            Ok(body) => self.handle(&Request { method, target, body, entropy }),
            Err(_) => Reply::error(400, "INVALID_SCHEMA", "the request is not valid UTF-8"),
        }
    }

    // ---- deferred playback ----------------------------------------------------------

    /// Whether [`Host::tick`] has work to do: an unattended all-native match that
    /// was asked to run further, or is part-way through a round.
    pub fn pending(&self) -> bool {
        match &self.session {
            Some(s) if !s.m.finished() && self.unattended() && !self.agents.iter().any(|a| a.is_some()) => self.stepping == Some(s.m.round()) || s.m.round() < self.autoplay_until,
            _ => false,
        }
    }

    /// One host step of deferred playback (`Config::settle_inline == false`). A round
    /// that has been started is always finished, so the match rests between rounds;
    /// the steps are the same ones `POST /api/advance` takes when it settles inline.
    pub fn tick(&mut self) -> Tick {
        if !self.pending() {
            self.stepping = None;
            return Tick::default();
        }
        let s = self.session.as_mut().expect("pending implies a match");
        let round = s.m.round();
        self.stepping = Some(round);
        let stepped = s.step();
        let round_completed = s.m.round() != round || s.m.finished();
        if round_completed || !stepped {
            self.stepping = None;
        }
        Tick { stepped, round_completed, pending: stepped && self.pending() }
    }

    // ---- requests -------------------------------------------------------------------

    /// Answer one request. Unknown paths get 404, so a transport can serve its own
    /// endpoints (static files, named saves on disk) before asking here.
    pub fn handle(&mut self, req: &Request) -> Reply {
        if let Some(reply) = self.save_file_routes(req.method, req.target, req.body.as_bytes()) {
            return reply;
        }
        let (path, q) = query(req.target);
        let arg = |k: &str| q.get(k).map(String::as_str);
        let result = match (req.method, path) {
            ("GET", "/api/health") => Ok(Reply::json("{\"ok\":true}".into())),
            ("GET", "/api/match") => Ok(match &self.session {
                Some(_) => self.summary_reply(!self.cfg.require_tokens),
                None => Reply::json(serde_json::json!({ "exists": false, "app_mode": self.cfg.app_mode }).to_string()),
            }),
            ("POST", "/api/match") => self.new_match(req.body, req.entropy),
            ("GET", "/api/turn") => {
                let seat = arg("seat").and_then(|x| x.parse().ok()).unwrap_or(0);
                let view = turn::View::parse(arg("view"), arg("sections").map(percent_decode).as_deref());
                turn::get(self, seat, &percent_decode(arg("token").unwrap_or("")), &view).map(|v| Reply::json(v.to_string()))
            }
            ("POST", "/api/turn") => match serde_json::from_str::<turn::Submission>(req.body) {
                // every applied exchange is saved, including within-round orders, rather than only ready
                Ok(b) => turn::submit(self, b).map(|(v, fresh)| Reply::json(v.to_string()).with(Effects { changed: fresh, autosave: fresh, ..Default::default() })),
                Err(_) => Err((400, "INVALID_SCHEMA", "invalid request fields or action; use the public action reference".into())),
            },
            ("GET", "/api/observation") => {
                let seat: SeatId = arg("seat").and_then(|v| v.parse().ok()).unwrap_or(0);
                self.seat_access(seat, arg("token").unwrap_or(""), false).map(|s| Reply::of(&s.m.observe(seat)))
            }
            ("GET", "/api/spectator") => match &self.session {
                Some(s) if self.observer_open() => Ok(Reply::of(&s.m.spectate())),
                Some(_) => Err((403, "UNAUTHORIZED", "the whole-world view is only available when no human seat is playing".into())),
                None => Err(no_match()),
            },
            ("POST", "/api/advance") => self.advance(req.body),
            ("GET", "/api/agent-log") => {
                let seat: usize = arg("seat").and_then(|v| v.parse().ok()).unwrap_or(0);
                match self.agents.get(seat).and_then(|a| a.as_ref()) {
                    Some(a) if self.observer_open() => Ok(Reply::json(serde_json::json!({ "entries": a.log() }).to_string())),
                    Some(_) => Err((403, "UNAUTHORIZED", "agent logs are only visible to an observer".into())),
                    None => Ok(Reply::json("{\"entries\":[]}".into())),
                }
            }
            ("POST", "/api/agent/control") => self.agent_control(req.body),
            ("POST", "/api/actions") => self.actions(req.body),
            ("POST", "/api/ready") => self.ready(req.body),
            ("POST", "/api/delegate") => self.delegate(req.body),
            ("GET", "/api/export/chronicle") => {
                let seat: SeatId = arg("seat").and_then(|v| v.parse().ok()).unwrap_or(0);
                self.seat_access(seat, arg("token").unwrap_or(""), false).map(|s| {
                    let obs = s.m.observe(seat);
                    if arg("format") == Some("json") {
                        Reply::of(&obs.chronicle)
                    } else {
                        Reply { status: 200, kind: Body::Markdown, body: chronicle_markdown(&obs), data: Vec::new(), effects: Effects::default() }
                    }
                })
            }
            ("GET", "/api/session/export") => match &self.session {
                Some(s) if self.session_portable() => {
                    let text = s.save();
                    if s.leaks_credential(&text) {
                        Err(leak())
                    } else {
                        Ok(Reply::json(text))
                    }
                }
                Some(_) => Err(not_portable()),
                None => Err(no_match()),
            },
            ("POST", "/api/session/import") => match self.install_text(req.body) {
                Ok(()) => Ok(self.summary_reply(true).with(Effects { changed: true, installed: true, ..Default::default() })),
                Err(e) => Err((400, "INVALID_SAVE", e)),
            },
            ("POST", "/api/shutdown") => {
                if self.cfg.app_mode {
                    Ok(Reply::json("{\"ok\":true}".into()).with(Effects { autosave: true, quit: true, ..Default::default() }))
                } else {
                    Err((403, "UNAUTHORIZED", "this referee was not started as a packaged application".into()))
                }
            }
            _ => Err((404, "NOT_FOUND", "no such endpoint".into())),
        };
        result.unwrap_or_else(|(status, code, message)| Reply::error(status, code, &message))
    }

    fn new_match(&mut self, body: &str, entropy: u64) -> Result<Reply, Failure> {
        let n: NewMatch = serde_json::from_str(if body.trim().is_empty() { "{}" } else { body }).map_err(|e| (400, "INVALID_SCHEMA", e.to_string()))?;
        let cfgs = agents_from::<A>(&n);
        let cfg = config_from::<A>(n).map_err(|e| (400, "INVALID_SCHEMA", e))?;
        self.install(Session::new(cfg, entropy), cfgs);
        if !self.unattended() {
            // somebody plays: the native seats move first, up to the point that seat must act
            self.session.as_mut().expect("just installed").drive();
        }
        Ok(self.summary_reply(true).with(Effects { changed: true, installed: true, ..Default::default() }))
    }

    fn advance(&mut self, body: &str) -> Result<Reply, Failure> {
        let rounds = serde_json::from_str::<serde_json::Value>(body).ok().and_then(|v| v["rounds"].as_u64()).unwrap_or(1).clamp(0, 20) as u32;
        if self.session.is_none() {
            return Err(no_match());
        }
        if !self.observer_open() {
            return Err((403, "UNAUTHORIZED", "only an observer match can be advanced this way".into()));
        }
        let has_agents = self.agents.iter().any(|a| a.is_some());
        let settle = self.cfg.settle_inline && !has_agents;
        let s = self.session.as_mut().expect("checked above");
        let target = s.m.round().saturating_add(rounds);
        self.autoplay_until = if rounds == 0 { s.m.round() } else { target };
        if settle {
            // all-native matches settle at once
            while !s.m.finished() && s.m.round() < target {
                if !s.step() {
                    break;
                }
            }
        }
        Ok(self.summary_reply(false).with(Effects { changed: true, autosave: settle, ..Default::default() }))
    }

    /// Resume (or otherwise control) an agent seat this process runs. Open on a
    /// referee that does not require seat tokens: the person at this machine set the
    /// seat up and may restart it.
    fn agent_control(&mut self, body: &str) -> Result<Reply, Failure> {
        #[derive(Deserialize)]
        struct ControlBody {
            seat: SeatId,
            op: String,
        }
        let b: ControlBody = serde_json::from_str(body).map_err(|e| (400, "INVALID_SCHEMA", e.to_string()))?;
        if self.session.is_none() {
            return Err(no_match());
        }
        if self.cfg.require_tokens {
            return Err((403, "UNAUTHORIZED", "agent seats cannot be controlled on a referee that requires seat tokens".into()));
        }
        let slot = self.agents.get_mut(b.seat as usize).and_then(|a| a.as_mut()).ok_or((404, "NOT_FOUND", "that seat is not an agent seat of this referee".to_string()))?;
        slot.control(b.op.trim()).map_err(|e| (400, "INVALID_SCHEMA", e))?;
        Ok(self.summary_reply(false).with(Effects { changed: true, ..Default::default() }))
    }

    fn actions(&mut self, body: &str) -> Result<Reply, Failure> {
        let batch: ActionBatch = serde_json::from_str(body).map_err(|_| (400, "INVALID_SCHEMA", "invalid request fields or action; use the public action reference".to_string()))?;
        self.seat_access(batch.seat, &batch.token, true)?;
        if batch.actions.len() > MAX_ACTIONS_PER_BATCH {
            return Err((400, "RATE_LIMITED", "at most 32 actions per batch".into()));
        }
        let receipts = self.session.as_mut().expect("checked above").m.act(batch.seat, batch.actions);
        Ok(Reply::json(serde_json::json!({ "receipts": receipts }).to_string()).with(Effects { changed: true, ..Default::default() }))
    }

    fn ready(&mut self, body: &str) -> Result<Reply, Failure> {
        let b: ReadyBody = serde_json::from_str(body).map_err(|e| (400, "INVALID_SCHEMA", e.to_string()))?;
        self.seat_access(b.seat, &b.token, true)?;
        let s = self.session.as_mut().expect("checked above");
        let before = s.m.round();
        s.m.set_ready(b.seat, b.through_round);
        s.drive();
        if s.m.try_advance() {
            s.drive();
        }
        let autosave = s.m.round() != before || s.m.finished();
        Ok(self.summary_reply(false).with(Effects { changed: true, autosave, ..Default::default() }))
    }

    fn delegate(&mut self, body: &str) -> Result<Reply, Failure> {
        let b: DelegateBody = serde_json::from_str(body).map_err(|e| (400, "INVALID_SCHEMA", e.to_string()))?;
        self.seat_access(b.seat, &b.token, true)?;
        self.session.as_mut().expect("checked above").set_delegates(b.seat, b.domains);
        Ok(self.summary_reply(false).with(Effects { changed: true, ..Default::default() }))
    }
}
