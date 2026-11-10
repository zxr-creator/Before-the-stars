//! The referee's request router and its permission rules.
//!
//! Requests are shaped like the HTTP API (`docs/agent-api.md`): a method, a path
//! with an optional query, and a body. The reply carries a status, a body and a
//! few [`Effects`] the transport must act on (write an autosave, start agent
//! workers, stop the process).

use crate::session::{AgentConfig, Session};
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
    pub effects: Effects,
}

impl Reply {
    fn json(body: String) -> Reply {
        Reply { status: 200, kind: Body::Json, body, effects: Effects::default() }
    }
    fn of<T: Serialize>(value: &T) -> Reply {
        Reply::json(serde_json::to_string(value).expect("reply serializes"))
    }
    fn error(status: u16, code: &str, message: &str) -> Reply {
        Reply { status, kind: Body::Json, body: serde_json::json!({ "error": code, "message": message }).to_string(), effects: Effects::default() }
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
        _ => return None,
    })
}

#[derive(Deserialize)]
struct NewMatch {
    #[serde(default)]
    seed: Option<String>,
    #[serde(default)]
    regions: Option<u16>,
    #[serde(default)]
    horizon: Option<u32>,
    #[serde(default)]
    pace_bp: Option<u32>,
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
}

/// Agent seats named in a new-match request, by seat.
fn agents_from<A: AgentSlot>(n: &NewMatch) -> Vec<Option<AgentConfig>> {
    let mut out = vec![None; 4];
    if let Some(c) = &n.controllers {
        for (i, name) in c.iter().enumerate().take(4) {
            if let Some(p) = A::provider(name.trim()) {
                let o = n.agent_options.get(&i.to_string()).cloned().unwrap_or_default();
                out[i] = Some(AgentConfig {
                    provider: p.key.to_string(),
                    model: o.model.filter(|m| !m.trim().is_empty()).map(|m| m.trim().to_string()).unwrap_or_else(|| p.default_model.to_string()),
                    consult_every: o.consult_every.unwrap_or(1).clamp(1, 60),
                    api_key: o.api_key.filter(|k| !k.trim().is_empty()),
                    base_url: o.base_url.filter(|k| !k.trim().is_empty()),
                    effort: o.effort.filter(|k| !k.trim().is_empty()),
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
        if ![24, 48, 72].contains(&r) {
            return Err("regions must be 24, 48 or 72".into());
        }
        cfg.regions = r;
    }
    if let Some(h) = n.horizon {
        if !(120..=6000).contains(&h) || h % 12 != 0 {
            return Err("horizon must be a multiple of 12 between 120 and 6000 months".into());
        }
        cfg.horizon = h;
    }
    if let Some(p) = n.pace_bp {
        cfg.pace_bp = p.clamp(1000, 30_000);
    }
    if let Some(c) = n.controllers {
        if c.len() != 4 {
            return Err("exactly four seats are required".into());
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
}

impl<A: AgentSlot> Host<A> {
    pub fn new(cfg: Config) -> Host<A> {
        Host { cfg, session: None, generation: 0, agents: Vec::new(), autoplay_until: u32::MAX, turn_cache: turn::Cache::default(), stepping: None }
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
        if idx >= s.m.seats() || (self.cfg.require_tokens && s.tokens[idx] != token) {
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
            months_per_round: cfg.months_per_round,
            horizon: cfg.horizon,
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
        Session::rehearse(text)?;
        let s = Session::load(text)?;
        if let Some(i) = (0..s.m.seats()).find(|&i| s.agent_cfgs[i].as_ref().is_some_and(|c| A::new(c).is_none())) {
            return Err(format!("seat {} of this save is an LLM agent seat, which needs the server-backed game; this referee has no agent workers", i + 1));
        }
        let cfgs = s.agent_cfgs.clone();
        self.install(s, cfgs);
        Ok(())
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
                turn::get(self, seat, arg("token").unwrap_or("")).map(|v| Reply::json(v.to_string()))
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
                        Reply { status: 200, kind: Body::Markdown, body: chronicle_markdown(&obs), effects: Effects::default() }
                    }
                })
            }
            ("GET", "/api/session/export") => match &self.session {
                Some(s) if self.session_portable() => Ok(Reply::json(s.save())),
                Some(_) => Err((403, "UNAUTHORIZED", "a session can be exported only when no seat is external and tokens are not required".into())),
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
