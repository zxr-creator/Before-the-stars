// A packaged Windows copy is a windowed program: no console appears behind the game.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
//! `bts` — the game and its local referee.
//!
//! ```text
//! bts                                   start the game in its own window (packaged use)
//! bts serve   [--port 7878] [--web apps/web/dist] [--require-tokens]
//! bts run     [--seed S] [--rounds N] [--ai hard,medium,medium,easy] [--regions 48] [--horizon 2880] [--every 20] [--matches M]
//! bts verify  [--seed S] [--rounds N]
//! bts observe --seat N [--url http://127.0.0.1:7878] [--token T]
//! bts act     --seat N --file actions.json [--url ...] [--token T]
//! bts ready   --seat N [--round] [--url ...] [--token T]
//! ```

mod agents;
#[cfg(feature = "desktop")]
mod desktop;
mod host;
mod providers;

use bts_engine::MatchConfig;
use bts_protocol::*;
use host::Session;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

fn entropy() -> u64 {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
    t ^ ((std::process::id() as u64) << 32)
}

struct Args {
    flags: HashMap<String, String>,
}

impl Args {
    fn parse(args: &[String]) -> Args {
        let mut flags = HashMap::new();
        let mut i = 0;
        while i < args.len() {
            if let Some(k) = args[i].strip_prefix("--") {
                if i + 1 < args.len() && !args[i + 1].starts_with("--") {
                    flags.insert(k.to_string(), args[i + 1].clone());
                    i += 2;
                } else {
                    flags.insert(k.to_string(), "true".to_string());
                    i += 1;
                }
            } else {
                i += 1;
            }
        }
        Args { flags }
    }
    fn get(&self, k: &str, default: &str) -> String {
        self.flags.get(k).cloned().unwrap_or_else(|| default.to_string())
    }
    fn num<T: std::str::FromStr>(&self, k: &str, default: T) -> T {
        self.flags.get(k).and_then(|v| v.parse().ok()).unwrap_or(default)
    }
    fn has(&self, k: &str) -> bool {
        self.flags.contains_key(k)
    }
}

fn controller(s: &str) -> Option<ControllerKind> {
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
fn agents_from(n: &NewMatch) -> Vec<Option<agents::AgentConfig>> {
    let mut out = vec![None; 4];
    if let Some(c) = &n.controllers {
        for (i, name) in c.iter().enumerate().take(4) {
            if let Some(p) = providers::Provider::parse(name.trim()) {
                let o = n.agent_options.get(&i.to_string()).cloned().unwrap_or_default();
                out[i] = Some(agents::AgentConfig {
                    provider: p.key().to_string(),
                    model: o.model.filter(|m| !m.trim().is_empty()).map(|m| m.trim().to_string()).unwrap_or_else(|| p.default_model().to_string()),
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

fn config_from(n: NewMatch) -> Result<MatchConfig, String> {
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
            // an LLM agent seat is an ordinary external seat driven by a worker in this process
            let kind = if providers::Provider::parse(s.trim()).is_some() { Some(ControllerKind::External) } else { controller(s) };
            kinds.push(kind.ok_or_else(|| format!("unknown controller '{s}'"))?);
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
struct SeatSummary {
    seat: SeatId,
    name: String,
    color: String,
    controller: ControllerKind,
    status: SeatStatus,
    /// Domains this seat has delegated to a steward.
    delegates: Vec<String>,
    agent: Option<AgentSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token: Option<String>,
}

#[derive(Serialize)]
struct AgentSummary {
    provider: String,
    model: String,
    consult_every: u32,
    state: String,
    last_note: String,
    calls: u32,
    last_error: Option<String>,
    thinking_seconds: Option<u64>,
}

#[derive(Serialize)]
struct MatchSummary {
    observer_allowed: bool,
    /// Observer matches advance only up to this round until asked for more.
    autoplay_until: u32,
    app_mode: bool,
    exists: bool,
    match_id: String,
    seed: String,
    regions: u16,
    round: u32,
    month: Month,
    months_per_round: u32,
    horizon: Month,
    phase: Phase,
    window: u8,
    finished: bool,
    winner: Option<SeatId>,
    disclosed_objective: bool,
    waiting_on: Vec<SeatId>,
    seats: Vec<SeatSummary>,
    versions: Vec<String>,
    steward_domains: Vec<String>,
}

fn summary(st: &agents::ServerState, with_tokens: bool) -> MatchSummary {
    let s = st.session.as_ref().expect("summary needs a match");
    let cfg = s.m.config();
    MatchSummary {
        observer_allowed: s.m.observer_allowed(),
        autoplay_until: st.autoplay_until,
        app_mode: st.app_mode,
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
                    agent: st.agents.get(i).and_then(|a| a.as_ref()).map(|a| AgentSummary {
                        provider: a.cfg.provider.clone(),
                        model: a.cfg.model.clone(),
                        consult_every: a.cfg.consult_every,
                        state: a.state.clone(),
                        last_note: a.last_note.clone(),
                        calls: a.calls,
                        last_error: a.last_error.clone(),
                        thinking_seconds: a.thinking_since.map(|t| t.elapsed().as_secs()),
                    }),
                    token: if with_tokens && matches!(kind, ControllerKind::Human | ControllerKind::External) { Some(s.tokens[i].clone()) } else { None },
                }
            })
            .collect(),
        steward_domains: bts_ai::NativeAi::steward_domains().iter().map(|d| d.to_string()).collect(),
        versions: vec![bts_engine::content::RULESET_VERSION.into(), bts_engine::content::CONTENT_VERSION.into(), bts_engine::content::GENERATOR_VERSION.into(), PROTOCOL_VERSION.into(), bts_ai::POLICY_VERSION.into()],
    }
}

fn json_response(status: u16, body: String) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap())
        .with_header(tiny_http::Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).unwrap())
}

fn err(status: u16, code: &str, msg: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    json_response(status, serde_json::json!({ "error": code, "message": msg }).to_string())
}

fn query(url: &str) -> (String, HashMap<String, String>) {
    let (path, q) = url.split_once('?').unwrap_or((url, ""));
    let mut map = HashMap::new();
    for pair in q.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            map.insert(k.to_string(), v.replace("%20", " "));
        }
    }
    (path.to_string(), map)
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn safe_name(s: &str) -> String {
    let n: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(40).collect();
    if n.is_empty() { "save".into() } else { n }
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

#[derive(Deserialize)]
struct SaveBody {
    name: String,
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

static WEB: include_dir::Dir<'_> = include_dir::include_dir!("$CARGO_MANIFEST_DIR/../../apps/web/dist");

/// Where a packaged copy keeps its saves: the per-user application data directory.
fn user_saves_dir() -> PathBuf {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_else(|_| ".".into());
    if cfg!(target_os = "macos") {
        PathBuf::from(home).join("Library/Application Support/Before the Stars/saves")
    } else if cfg!(target_os = "windows") {
        PathBuf::from(std::env::var("APPDATA").unwrap_or(home)).join("Before the Stars").join("saves")
    } else {
        PathBuf::from(std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| format!("{home}/.local/share"))).join("before-the-stars/saves")
    }
}

fn open_browser(url: &str) {
    // packaging checks start the app without wanting a browser tab
    if std::env::var("BTS_NO_BROWSER").is_ok() {
        return;
    }
    let result = if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(url).spawn()
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn()
    } else {
        std::process::Command::new("xdg-open").arg(url).spawn()
    };
    if result.is_err() {
        println!("  open {url} in a browser to play");
    }
}

/// Install agent workers for a session (new or loaded) and reset playback.
fn install(shared: &agents::Shared, st: &mut agents::ServerState, mut session: Session, cfgs: Vec<Option<agents::AgentConfig>>) {
    st.generation += 1;
    let n = session.m.seats();
    st.agents = (0..n).map(|_| None).collect();
    for (i, cfg) in cfgs.into_iter().enumerate().take(n) {
        if let Some(cfg) = cfg {
            if session.m.controller(i as SeatId) == ControllerKind::External {
                // the steward runs everything until the model says otherwise
                if session.delegates[i].is_empty() {
                    session.set_delegates(i as SeatId, bts_ai::NativeAi::steward_domains().iter().map(|d| d.to_string()).collect());
                }
                session.agent_cfgs[i] = Some(cfg.clone());
                st.agents[i] = Some(agents::AgentSeat::new(cfg));
                agents::spawn(shared.clone(), i as SeatId, st.generation);
            }
        }
    }
    // an observer match waits for the observer; a match with a human runs on the human's clock
    st.autoplay_until = if session.m.observer_allowed() { session.m.round() } else { u32::MAX };
    st.session = Some(session);
}

/// Sent once the referee is listening: the port, and the shared state when this process owns it.
type Ready = std::sync::mpsc::Sender<(u16, Option<agents::Shared>)>;

fn serve(args: &Args, app_mode: bool, ready: Option<Ready>) {
    let mut port: u16 = args.num("port", 7878);
    let web = PathBuf::from(args.get("web", "apps/web/dist"));
    let require_tokens = args.has("require-tokens");
    let saves = match args.flags.get("saves") {
        Some(p) => PathBuf::from(p),
        None if app_mode => user_saves_dir(),
        None => PathBuf::from("saves"),
    };
    let mut server = None;
    for attempt in 0..10u16 {
        match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(s) => {
                server = Some(s);
                break;
            }
            Err(e) => {
                if app_mode {
                    // already running? then just show it
                    if http(&format!("http://127.0.0.1:{port}"), "GET", "/api/health", None).map(|b| b.contains("\"ok\"")).unwrap_or(false) {
                        match &ready {
                            Some(tx) => {
                                let _ = tx.send((port, None));
                            }
                            None => open_browser(&format!("http://127.0.0.1:{port}/")),
                        }
                        return;
                    }
                    port += 1;
                    let _ = attempt;
                    continue;
                }
                eprintln!("could not listen on 127.0.0.1:{port}: {e}");
                std::process::exit(1);
            }
        }
    }
    let Some(server) = server else {
        eprintln!("no free port near {port}");
        std::process::exit(1);
    };
    let embedded = WEB.get_file("index.html").is_some();
    let from_disk = web.join("index.html").exists() && !app_mode;
    println!("Before the Stars — local referee");
    println!("  game:   http://127.0.0.1:{port}/");
    println!("  agents: http://127.0.0.1:{port}/api  (see docs/agent-api.md)");
    println!("  saves:  {}", saves.display());
    if !embedded && !from_disk {
        println!("  note: web client not built ({}); run scripts/build.sh", web.display());
    }
    if app_mode && ready.is_none() {
        println!("  close this window, or choose Quit in the game menu, to stop the game");
    }
    let shared: agents::Shared = std::sync::Arc::new(std::sync::Mutex::new(agents::ServerState { session: None, generation: 0, agents: Vec::new(), autoplay_until: u32::MAX, app_mode, saves: saves.clone() }));
    let autosave = saves.join("autosave.json");
    if autosave.exists() && !args.has("fresh") {
        if let Ok(text) = std::fs::read_to_string(&autosave) {
            match Session::load(&text) {
                Ok(s) => {
                    println!("  resumed autosave: {} at round {}", s.m.match_id(), s.m.round());
                    let cfgs = s.agent_cfgs.clone();
                    let mut st = shared.lock().unwrap();
                    install(&shared, &mut st, s, cfgs);
                }
                Err(e) => println!("  autosave could not be loaded: {e}"),
            }
        }
    }
    match &ready {
        // the game window is opened by the main thread
        Some(tx) => {
            let _ = tx.send((port, Some(shared.clone())));
        }
        None => {
            if app_mode || args.has("open") {
                open_browser(&format!("http://127.0.0.1:{port}/"));
            }
        }
    }

    let log_requests = std::env::var("BTS_LOG_REQUESTS").is_ok();
    for mut req in server.incoming_requests() {
        let (path, q) = query(req.url());
        let method = req.method().clone();
        let mut body = String::new();
        let _ = req.as_reader().read_to_string(&mut body);
        if log_requests {
            println!("  {} {}", method, path);
        }
        let mut guard = shared.lock().unwrap();
        let st = &mut *guard;
        let auth = |s: &Session, seat: SeatId, token: &str| -> bool { (seat as usize) < s.m.seats() && (!require_tokens || s.tokens[seat as usize] == token) };
        // a seat driven by a native controller or by an agent worker takes no orders from outside
        let driven = |st: &agents::ServerState, seat: SeatId| -> bool {
            st.session.as_ref().map(|s| s.ais[seat as usize].is_some()).unwrap_or(false) || st.agents.get(seat as usize).map(|a| a.is_some()).unwrap_or(false)
        };
        let mut quit = false;
        let response = match (method.as_str(), path.as_str()) {
            ("GET", "/api/health") => json_response(200, "{\"ok\":true}".into()),
            ("GET", "/api/match") => match &st.session {
                Some(_) => json_response(200, serde_json::to_string(&summary(st, !require_tokens)).unwrap()),
                None => json_response(200, serde_json::json!({ "exists": false, "app_mode": st.app_mode }).to_string()),
            },
            ("POST", "/api/match") => match serde_json::from_str::<NewMatch>(if body.trim().is_empty() { "{}" } else { &body }) {
                Ok(n) => {
                    let cfgs = agents_from(&n);
                    match config_from(n) {
                        Ok(cfg) => {
                            let mut s = Session::new(cfg, entropy());
                            let observer = s.m.observer_allowed();
                            if !observer {
                                s.drive();
                            }
                            install(&shared, st, s, cfgs);
                            json_response(200, serde_json::to_string(&summary(st, true)).unwrap())
                        }
                        Err(e) => err(400, "INVALID_SCHEMA", &e),
                    }
                }
                Err(e) => err(400, "INVALID_SCHEMA", &e.to_string()),
            },
            ("GET", "/api/observation") => match &st.session {
                Some(s) => {
                    let seat: SeatId = q.get("seat").and_then(|v| v.parse().ok()).unwrap_or(0);
                    if !auth(s, seat, q.get("token").map(|x| x.as_str()).unwrap_or("")) {
                        err(403, "UNAUTHORIZED", "unknown seat or token")
                    } else if driven(st, seat) && (require_tokens || !s.m.observer_allowed()) {
                        // another seat's view is open only to an observer of a match with no human in it
                        err(403, "UNAUTHORIZED", "unknown seat or token")
                    } else {
                        json_response(200, serde_json::to_string(&s.m.observe(seat)).unwrap())
                    }
                }
                None => err(404, "NO_MATCH", "no match is running"),
            },
            ("GET", "/api/spectator") => match &st.session {
                Some(s) if s.m.observer_allowed() && !require_tokens => json_response(200, serde_json::to_string(&s.m.spectate()).unwrap()),
                Some(_) => err(403, "UNAUTHORIZED", "the whole-world view is only available when no human seat is playing"),
                None => err(404, "NO_MATCH", "no match is running"),
            },
            ("POST", "/api/advance") => {
                let rounds = serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|v| v["rounds"].as_u64()).unwrap_or(1).clamp(0, 20) as u32;
                match &mut st.session {
                    Some(s) if s.m.observer_allowed() => {
                        let has_agents = st.agents.iter().any(|a| a.is_some());
                        let target = s.m.round().saturating_add(rounds);
                        st.autoplay_until = if rounds == 0 { s.m.round() } else { target };
                        if !has_agents {
                            // all-native matches settle at once
                            while !s.m.finished() && s.m.round() < target {
                                if !s.step() {
                                    break;
                                }
                            }
                            st.autosave();
                        }
                        json_response(200, serde_json::to_string(&summary(st, false)).unwrap())
                    }
                    Some(_) => err(403, "UNAUTHORIZED", "only an observer match can be advanced this way"),
                    None => err(404, "NO_MATCH", "no match is running"),
                }
            }
            ("GET", "/api/agent-log") => {
                let seat: usize = q.get("seat").and_then(|v| v.parse().ok()).unwrap_or(0);
                let visible = st.session.as_ref().map(|s| s.m.observer_allowed() && !require_tokens).unwrap_or(false);
                match st.agents.get(seat).and_then(|a| a.as_ref()) {
                    Some(a) if visible => json_response(200, serde_json::json!({ "entries": a.log }).to_string()),
                    Some(_) => err(403, "UNAUTHORIZED", "agent logs are only visible to an observer"),
                    None => json_response(200, "{\"entries\":[]}".into()),
                }
            }
            ("POST", "/api/actions") => match serde_json::from_str::<ActionBatch>(&body) {
                Ok(batch) => match &st.session {
                    None => err(404, "NO_MATCH", "no match is running"),
                    Some(s) if !auth(s, batch.seat, &batch.token) || driven(st, batch.seat) => err(403, "UNAUTHORIZED", "unknown seat or token"),
                    Some(_) if batch.actions.len() > MAX_ACTIONS_PER_BATCH => err(400, "RATE_LIMITED", "at most 32 actions per batch"),
                    Some(_) => {
                        let receipts = st.session.as_mut().unwrap().m.act(batch.seat, batch.actions);
                        json_response(200, serde_json::json!({ "receipts": receipts }).to_string())
                    }
                },
                Err(e) => err(400, "INVALID_SCHEMA", &e.to_string()),
            },
            ("POST", "/api/ready") => match serde_json::from_str::<ReadyBody>(&body) {
                Ok(b) => match &st.session {
                    None => err(404, "NO_MATCH", "no match is running"),
                    Some(s) if !auth(s, b.seat, &b.token) || driven(st, b.seat) => err(403, "UNAUTHORIZED", "unknown seat or token"),
                    Some(_) => {
                        let s = st.session.as_mut().unwrap();
                        let before = s.m.round();
                        s.m.set_ready(b.seat, b.through_round);
                        s.drive();
                        if s.m.try_advance() {
                            s.drive();
                        }
                        if s.m.round() != before || s.m.finished() {
                            st.autosave();
                        }
                        json_response(200, serde_json::to_string(&summary(st, false)).unwrap())
                    }
                },
                Err(e) => err(400, "INVALID_SCHEMA", &e.to_string()),
            },
            ("POST", "/api/delegate") => match serde_json::from_str::<DelegateBody>(&body) {
                Ok(b) => match &st.session {
                    None => err(404, "NO_MATCH", "no match is running"),
                    Some(s) if !auth(s, b.seat, &b.token) || driven(st, b.seat) => err(403, "UNAUTHORIZED", "unknown seat or token"),
                    Some(_) => {
                        st.session.as_mut().unwrap().set_delegates(b.seat, b.domains);
                        json_response(200, serde_json::to_string(&summary(st, false)).unwrap())
                    }
                },
                Err(e) => err(400, "INVALID_SCHEMA", &e.to_string()),
            },
            ("GET", "/api/saves") => {
                let mut names: Vec<String> = std::fs::read_dir(&saves)
                    .map(|d| d.filter_map(|e| e.ok()).filter_map(|e| e.file_name().to_str().and_then(|n| n.strip_suffix(".json")).map(|n| n.to_string())).collect())
                    .unwrap_or_default();
                names.sort();
                json_response(200, serde_json::json!({ "saves": names }).to_string())
            }
            ("POST", "/api/save") => match (&st.session, serde_json::from_str::<SaveBody>(&body)) {
                (Some(s), Ok(b)) => {
                    let _ = std::fs::create_dir_all(&saves);
                    let name = safe_name(&b.name);
                    match std::fs::write(saves.join(format!("{name}.json")), s.save()) {
                        Ok(_) => json_response(200, serde_json::json!({ "saved": name }).to_string()),
                        Err(e) => err(500, "IO", &e.to_string()),
                    }
                }
                (None, _) => err(404, "NO_MATCH", "no match is running"),
                (_, Err(e)) => err(400, "INVALID_SCHEMA", &e.to_string()),
            },
            ("POST", "/api/load") => match serde_json::from_str::<SaveBody>(&body) {
                Ok(b) => match std::fs::read_to_string(saves.join(format!("{}.json", safe_name(&b.name)))).map_err(|e| e.to_string()).and_then(|t| Session::load(&t)) {
                    Ok(s) => {
                        let cfgs = s.agent_cfgs.clone();
                        install(&shared, st, s, cfgs);
                        json_response(200, serde_json::to_string(&summary(st, true)).unwrap())
                    }
                    Err(e) => err(404, "NOT_FOUND", &e),
                },
                Err(e) => err(400, "INVALID_SCHEMA", &e.to_string()),
            },
            ("GET", "/api/export/chronicle") => match &st.session {
                Some(s) => {
                    let seat: SeatId = q.get("seat").and_then(|v| v.parse().ok()).unwrap_or(0);
                    if !auth(s, seat, q.get("token").map(|x| x.as_str()).unwrap_or("")) || (driven(st, seat) && !s.m.observer_allowed()) {
                        err(403, "UNAUTHORIZED", "unknown seat or token")
                    } else {
                        let obs = s.m.observe(seat);
                        if q.get("format").map(|f| f == "json").unwrap_or(false) {
                            json_response(200, serde_json::to_string(&obs.chronicle).unwrap())
                        } else {
                            tiny_http::Response::from_string(chronicle_markdown(&obs)).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/markdown; charset=utf-8"[..]).unwrap())
                        }
                    }
                }
                None => err(404, "NO_MATCH", "no match is running"),
            },
            ("POST", "/api/shutdown") => {
                if st.app_mode {
                    st.autosave();
                    quit = true;
                    json_response(200, "{\"ok\":true}".into())
                } else {
                    err(403, "UNAUTHORIZED", "this referee was not started as a packaged application")
                }
            }
            ("GET", p) if !p.starts_with("/api/") => {
                let rel = p.trim_start_matches('/');
                let rel = if rel.is_empty() || rel.contains("..") { "index.html" } else { rel };
                // a client built on disk wins during development; a packaged copy serves its embedded client
                let disk = web.join(rel);
                if !app_mode && disk.is_file() {
                    match std::fs::read(&disk) {
                        Ok(bytes) => tiny_http::Response::from_data(bytes).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], content_type(&disk).as_bytes()).unwrap()),
                        Err(_) => err(500, "IO", "could not read the web client"),
                    }
                } else if let Some(file) = WEB.get_file(rel).or_else(|| WEB.get_file("index.html")) {
                    tiny_http::Response::from_data(file.contents().to_vec()).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], content_type(file.path()).as_bytes()).unwrap())
                } else if web.join("index.html").is_file() {
                    tiny_http::Response::from_data(std::fs::read(web.join("index.html")).unwrap_or_default()).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap())
                } else {
                    tiny_http::Response::from_string("The web client has not been built. Run scripts/build.sh, or use the HTTP API under /api.").with_status_code(404).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap())
                }
            }
            _ => err(404, "NOT_FOUND", "no such endpoint"),
        };
        drop(guard);
        let _ = req.respond(response);
        if quit {
            std::process::exit(0);
        }
    }
}

fn print_table(s: &Session) {
    println!("round {:>3}  month {:>4}  phase {:?}", s.m.round(), s.m.month(), s.m.phase());
    for d in s.m.diagnostics() {
        println!(
            "  seat {} {:<11} {:<10} pop {:>7} reg {:>2} tech {:>3} (tier {}) prac {:>2} army {:>5} stab {:>2} food {:>3}% sci {:<5} gov {:>2} ftl {:>2}{}",
            d.seat,
            d.name,
            format!("{:?}", d.status),
            d.population,
            d.regions,
            d.understood,
            d.highest_tier,
            d.practices,
            d.soldiers,
            d.stability,
            d.food_bp / 100,
            d.sci_method.map(|m| format!("y{}", m / 12)).unwrap_or_else(|| "-".into()),
            d.gov_streak,
            d.ftl_streak,
            d.overlord.map(|o| format!(" under {o}")).unwrap_or_default()
        );
    }
}

fn run_config(args: &Args) -> MatchConfig {
    let mut cfg = MatchConfig { seed: args.get("seed", "riverland"), regions: args.num("regions", 48), horizon: args.num("horizon", 2880), pace_bp: args.num("pace", 10_000), ..Default::default() };
    let ai = args.get("ai", "hard,medium,medium,easy");
    let kinds: Vec<ControllerKind> = ai.split(',').filter_map(controller).collect();
    cfg.controllers = if kinds.len() == 4 { kinds } else { vec![ControllerKind::NativeMedium; 4] };
    cfg.disclosed_objective = args.has("disclosed");
    cfg
}

fn run(args: &Args) {
    let matches: u32 = args.num("matches", 1);
    let rounds: u32 = args.num("rounds", 240);
    let every: u32 = args.num("every", 20);
    if matches <= 1 {
        let mut s = Session::new(run_config(args), 7);
        let start = std::time::Instant::now();
        while !s.m.finished() && s.m.round() <= rounds {
            s.run_rounds(every.max(1));
            if !args.has("quiet") {
                print_table(&s);
            }
        }
        print_table(&s);
        println!("finished: {}  winner: {:?}  elapsed {:.1}s  state hash {:016x}", s.m.finished(), s.m.winner(), start.elapsed().as_secs_f64(), s.m.state_hash());
        if let Some(path) = args.flags.get("save") {
            std::fs::write(path, s.save()).expect("write save");
        }
        return;
    }
    // Independent matches run in parallel across CPU cores; each match is itself deterministic.
    let base = args.get("seed", "eval");
    let handles: Vec<_> = (0..matches)
        .map(|i| {
            let mut cfg = run_config(args);
            cfg.seed = format!("{base}-{i}");
            std::thread::spawn(move || {
                let mut s = Session::new(cfg, 7);
                s.run_rounds(rounds);
                (i, s.m.winner(), s.m.month(), s.m.diagnostics())
            })
        })
        .collect();
    for h in handles {
        let (i, winner, month, diag) = h.join().expect("match thread");
        let line: Vec<String> = diag.iter().map(|d| format!("{}:{}p/{}r/{}t", d.seat, d.population, d.regions, d.understood)).collect();
        println!("match {i:>2}  winner {:?}  month {month:>4}  {}", winner, line.join("  "));
    }
}

/// Print a compact report of one seat's own observation after an all-native run.
/// Used for tuning: everything shown here is what that seat itself can see.
fn inspect(args: &Args) {
    let rounds: u32 = args.num("rounds", 60);
    let seat: SeatId = args.num("seat", 0);
    let mut s = Session::new(run_config(args), 7);
    s.run_rounds(rounds);
    let o = s.m.observe(seat);
    let u = |v: i64| v as f64 / 1000.0;
    println!("== {} seat {} year {} pop {} stability {} admin {}/{} mob cap {}bp", o.civ.name, seat, o.month / 12, o.civ.population, o.civ.stability, o.civ.admin_load, o.civ.admin_capacity, o.civ.mobilization_cap_bp);
    println!("labor: {:?}", o.civ.labor);
    print!("goods:");
    for g in &o.civ.goods {
        if g.stock != 0 || g.produced != 0 || g.consumed != 0 {
            print!(" {}={:.0}(+{:.0}/-{:.0})", g.good.label(), u(g.stock), u(g.produced), u(g.consumed));
        }
    }
    println!();
    print!("quals:");
    for q in &o.civ.quals {
        print!(" {}={}/{}", q.qual.label(), q.employed, q.count);
    }
    println!();
    print!("research:");
    for r in &o.civ.research {
        print!(" {}={:.0}/{:.0}", r.class.label(), u(r.used), u(r.capacity));
    }
    println!("  sci_method={}", o.knowledge.scientific_method);
    println!("-- techs understood: {}  leads: {}", o.knowledge.techs.iter().filter(|t| t.state >= KnowledgeState::Understood).count(), o.knowledge.leads.len());
    for t in o.knowledge.techs.iter().filter(|t| t.state < KnowledgeState::Understood) {
        let unmet: Vec<&str> = t.known_requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.as_str()).collect();
        println!("   {:?} {} [{}] {:.0}/{:.0} can={} unmet={:?}{}", t.state, t.name, t.class.label(), u(t.work_done), u(t.work_needed), t.can_investigate, unmet, if t.unknown_requirements { " +unknown" } else { "" });
    }
    println!("-- practices enacted: {}", o.culture.practices.iter().filter(|p| p.state >= PracticeState::Enacted).count());
    for p in o.culture.practices.iter().filter(|p| p.state < PracticeState::Enacted) {
        let unmet: Vec<&str> = p.known_requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.as_str()).collect();
        println!("   {:?} {} can={} unmet={:?}", p.state, p.name, p.can_reform, unmet);
    }
    println!("-- catalog not available:");
    for f in o.catalog.facilities.iter().filter(|f| !f.available) {
        let unmet: Vec<&str> = f.requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.as_str()).collect();
        println!("   {} unmet={:?}", f.name, unmet);
    }
    for c in o.catalog.courses.iter().filter(|c| !c.available) {
        let unmet: Vec<&str> = c.requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.as_str()).collect();
        println!("   course {} unmet={:?}", c.name, unmet);
    }
    let built: std::collections::HashSet<String> = o.regions.iter().filter_map(|r| r.own.as_ref()).flat_map(|w| w.facilities.iter().map(|f| f.kind.clone())).collect();
    println!("-- available but never built: {:?}", o.catalog.facilities.iter().filter(|f| f.available && !built.contains(&f.kind)).map(|f| f.kind.clone()).collect::<Vec<_>>());
    println!("-- regions:");
    for r in o.regions.iter().filter(|r| r.own.is_some()) {
        let w = r.own.as_ref().unwrap();
        println!(" {} [{}] {:?} pop {} labor f{} fac{} proj{} idle{} stu{} water {} food {}% link {} unrest {}", r.name, r.id, r.terrain, w.population, w.labor.food, w.labor.facilities, w.labor.projects, w.labor.household, w.labor.students, w.water_capacity, w.food_fulfillment_bp / 100, w.link_efficiency_bp, w.unrest_bp);
        for f in &w.facilities {
            let b: Vec<String> = f.runs.iter().flat_map(|x| x.blockers.clone()).collect();
            println!("    {} L{}/{} staff {}/{} util {}% {:?}", f.name, f.level, f.max_level, f.staffed, f.staff_needed, f.utilization_bp / 100, b);
        }
        if let Some(sv) = &r.survey {
            let d: Vec<String> = sv.deposits.iter().map(|d| format!("{}:{:.0}", d.kind.label(), u(d.remaining))).collect();
            println!("    survey arable {} pasture {} wild {} forest {} hydro {} deposits {:?}", sv.arable, sv.pasture, sv.wild_food, sv.forest, sv.hydro, d);
        }
    }
    println!("-- projects:");
    for p in &o.projects {
        println!("   [{}] {} {:.0}/{:.0} last {:.1} {:?}", p.priority, p.title, u(p.work_done), u(p.work_needed), u(p.last_progress), p.blockers);
    }
    println!("-- programmes:");
    for p in &o.programs {
        println!("   {} @{} seats {} enrolled {} {}/{} grads {} paused {} {:?}", p.course_name, p.region, p.seats, p.enrolled, p.progress_months, p.months, p.graduates_total, p.paused, p.blockers);
    }
    println!("-- others: {:?}", o.others.iter().map(|x| (x.name.clone(), x.at_war, x.trust)).collect::<Vec<_>>());
    println!("-- armies: {:?}", o.armies.iter().map(|a| (a.name.clone(), a.tier, a.soldiers.clone(), a.order.clone())).collect::<Vec<_>>());
    println!("-- treaties: {}", o.diplomacy.treaties.len());
    println!("-- chronicle ({}):", o.chronicle.len());
    for e in o.chronicle.iter().rev().take(args.num("chron", 12)).rev() {
        println!("   y{} {}", e.month / 12 + 1, e.title);
    }
    if let Some(v) = &o.objectives.victory {
        println!("-- victory: gov {}/{} ftl {}/{} trials {:?} assemblies {} deployment {} replacement {} nodes {:?}", v.governance_months, v.governance_needed, v.ftl_months, v.ftl_needed, v.trials, v.assemblies_operational, v.deployment_done, v.replacement_done, v.test_nodes);
        for c in v.governance_checks.iter().chain(v.ftl_checks.iter()) {
            println!("   [{}] {} — {}", if c.ok { "x" } else { " " }, c.label, c.detail);
        }
    }
    println!("-- briefing:");
    for b in o.briefing.iter().take(12) {
        println!("   [{}] {} — {}", b.severity, b.title, b.detail);
    }
    println!("-- rejected this round: {:?}", o.receipts.iter().filter(|r| r.status == "rejected").map(|r| format!("{}: {}", r.action, r.reason)).collect::<Vec<_>>());
}

/// Determinism and recovery checks: identical inputs give identical hashes, and a
/// checkpoint restore matches continuous execution.
fn verify(args: &Args) {
    let rounds: u32 = args.num("rounds", 30);
    let mut a = Session::new(run_config(args), 7);
    let mut b = Session::new(run_config(args), 7);
    a.run_rounds(rounds);
    b.run_rounds(rounds / 2);
    let mut restored = Session::load(&b.save()).expect("restore");
    restored.run_rounds(rounds - rounds / 2);
    let mut c = Session::new(run_config(args), 7);
    c.run_rounds(rounds);
    let (ha, hr, hc) = (a.m.state_hash(), restored.m.state_hash(), c.m.state_hash());
    println!("continuous      {ha:016x}");
    println!("repeat          {hc:016x}");
    println!("checkpointed    {hr:016x}");
    if ha == hc && ha == hr {
        println!("OK: repeated inputs and checkpoint recovery reproduce the same state");
    } else {
        println!("MISMATCH");
        std::process::exit(1);
    }
}

fn http(url: &str, method: &str, path: &str, body: Option<&str>) -> Result<String, String> {
    let rest = url.trim_start_matches("http://");
    let host = rest.split('/').next().unwrap_or("127.0.0.1:7878");
    let mut stream = std::net::TcpStream::connect(host).map_err(|e| format!("cannot reach {host}: {e}"))?;
    let body = body.unwrap_or("");
    let req = format!("{method} {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut out = String::new();
    stream.read_to_string(&mut out).map_err(|e| e.to_string())?;
    Ok(out.split_once("\r\n\r\n").map(|(_, b)| b.to_string()).unwrap_or(out))
}

#[cfg(feature = "desktop")]
fn run_app(args: Args) {
    if args.has("browser") || std::env::var("BTS_NO_WINDOW").is_ok() {
        return serve(&args, true, None);
    }
    let (tx, rx) = std::sync::mpsc::channel();
    // the window owns the main thread; the referee runs beside it
    std::thread::spawn(move || serve(&args, true, Some(tx)));
    match rx.recv() {
        Ok((port, shared)) => desktop::run(port, shared),
        Err(_) => std::process::exit(1),
    }
}

#[cfg(not(feature = "desktop"))]
fn run_app(args: Args) {
    serve(&args, true, None);
}

/// On Windows a windowed program has no console; when a command is given from a terminal,
/// attach to that terminal so the command-line tools still print there.
#[cfg(windows)]
fn attach_parent_console() {
    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
    }
    const ATTACH_PARENT_PROCESS: u32 = 0xFFFF_FFFF;
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

#[cfg(not(windows))]
fn attach_parent_console() {}

fn main() {
    let argv: Vec<String> = std::env::args().collect();
    if argv.len() > 1 {
        attach_parent_console();
    }
    let cmd = argv.get(1).map(|s| s.as_str()).filter(|s| !s.starts_with("--")).unwrap_or("app");
    let explicit = argv.get(1).map(|s| !s.starts_with("--")).unwrap_or(false);
    let args = Args::parse(&argv[argv.len().min(if explicit { 2 } else { 1 })..]);
    let url = args.get("url", "http://127.0.0.1:7878");
    let seat: SeatId = args.num("seat", 0);
    let token = args.get("token", "");
    let result = match cmd {
        "serve" => {
            serve(&args, args.has("app"), None);
            Ok(String::new())
        }
        // started with no command (for example by double-click): the game in its own window
        "app" => {
            run_app(args);
            Ok(String::new())
        }
        "run" => {
            run(&args);
            Ok(String::new())
        }
        "inspect" => {
            inspect(&args);
            Ok(String::new())
        }
        "verify" => {
            verify(&args);
            Ok(String::new())
        }
        "observe" => http(&url, "GET", &format!("/api/observation?seat={seat}&token={token}"), None),
        "match" => http(&url, "GET", "/api/match", None),
        "act" => {
            let actions = match args.flags.get("file") {
                Some(f) => std::fs::read_to_string(f).unwrap_or_else(|e| {
                    eprintln!("cannot read {f}: {e}");
                    std::process::exit(2)
                }),
                None => {
                    let mut s = String::new();
                    let _ = std::io::stdin().read_to_string(&mut s);
                    s
                }
            };
            let parsed: Result<Vec<Action>, _> = serde_json::from_str(&actions);
            match parsed {
                Ok(list) => http(&url, "POST", "/api/actions", Some(&serde_json::to_string(&ActionBatch { seat, token: token.clone(), idempotency_key: None, actions: list }).unwrap())),
                Err(e) => Err(format!("actions must be a JSON array of action objects: {e}")),
            }
        }
        "ready" => http(&url, "POST", "/api/ready", Some(&serde_json::json!({ "seat": seat, "token": token, "through_round": args.has("round") }).to_string())),
        _ => Err("usage: bts serve | run | verify | match | observe | act | ready  (see README.md)".into()),
    };
    match result {
        Ok(s) => {
            if !s.is_empty() {
                println!("{s}");
            }
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    }
}
