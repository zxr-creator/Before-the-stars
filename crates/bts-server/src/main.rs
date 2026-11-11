// A packaged Windows copy is a windowed program: no console appears behind the game.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
//! `bts` — the game and its local referee.
//!
//! ```text
//! bts                                   start the game in its own window (packaged use)
//! bts serve   [--port 7878] [--web apps/web/dist] [--require-tokens]
//! bts run     [--seed S] [--rounds N] [--ai hard,medium,medium,easy] [--regions 48] [--horizon 2880] [--every 20] [--matches M]
//!             [--calendar standard|quick] [--curve out.csv] [--checkpoints DIR [--at m1,m2,... | --at-years -1000,1000,...]]
//!             [--save out.json] [--first K] [--threads T]   (--horizon M: development clock of 12-month rounds)
//! bts verify  [--seed S] [--rounds N]
//! bts observe --seat N [--url http://127.0.0.1:7878] [--token T]
//! bts act     --seat N --file actions.json [--url ...] [--token T]
//! bts ready   --seat N [--round] [--url ...] [--token T]
//! ```

mod agents;
#[cfg(feature = "desktop")]
mod desktop;
mod providers;
mod saves;

use bts_engine::MatchConfig;
use bts_host::{controller, Session};
use bts_protocol::*;
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

fn json_response(status: u16, body: String) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap())
        .with_header(tiny_http::Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).unwrap())
}

fn err(status: u16, code: &str, msg: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    json_response(status, serde_json::json!({ "error": code, "message": msg }).to_string())
}

/// Turn the shared host's reply into an HTTP response.
fn respond(reply: bts_host::Reply) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    match reply.kind {
        bts_host::Body::Json => json_response(reply.status, reply.body),
        bts_host::Body::Binary => saves::file_response(reply.data).with_status_code(reply.status),
        bts_host::Body::Markdown => tiny_http::Response::from_string(reply.body).with_status_code(reply.status).with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/markdown; charset=utf-8"[..]).unwrap()),
    }
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

/// Start a worker for every agent seat of the match the host has just installed.
fn start_agents(shared: &agents::Shared, st: &agents::ServerState) {
    for (i, a) in st.host.agents.iter().enumerate() {
        if a.is_some() {
            agents::spawn(shared.clone(), i as SeatId, st.host.generation);
        }
    }
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
    // files the player exports, or puts there to import (the desktop window cannot download)
    // (as full paths: the client shows the player where a file went)
    let full = |p: PathBuf| std::env::current_dir().map(|here| here.join(&p)).unwrap_or(p);
    let dirs = saves::Dirs { exports: full(args.flags.get("exports").map(PathBuf::from).unwrap_or_else(|| saves.join("exports"))), saves: full(saves.clone()) };
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
    println!("  exports: {}", dirs.exports.display());
    if !embedded && !from_disk {
        println!("  note: web client not built ({}); run scripts/build.sh", web.display());
    }
    if app_mode && ready.is_none() {
        println!("  close this window, or choose Quit in the game menu, to stop the game");
    }
    // every request below is answered by the shared host (bts-host), the same code the browser build runs
    let mut host = bts_host::Host::new(bts_host::Config { require_tokens, app_mode, settle_inline: true });
    // how large a save file this referee reads, packed or unpacked (default 64 MiB)
    if let Some(mib) = args.flags.get("save-max-mb").and_then(|v| v.parse::<usize>().ok()).filter(|m| (1..=1024).contains(m)) {
        host.limits = bts_host::portable::Limits { max_file: mib << 20, max_unpacked: mib << 20 };
    }
    let body_cap = host.limits.max_file;
    let shared: agents::Shared = std::sync::Arc::new(std::sync::Mutex::new(agents::ServerState { host, saves: saves.clone() }));
    let autosave = saves.join("autosave.json");
    if autosave.exists() && !args.has("fresh") {
        if let Ok(text) = std::fs::read_to_string(&autosave) {
            let mut st = shared.lock().unwrap();
            match st.host.install_text(&text) {
                Ok(()) => {
                    if let Some(s) = &st.host.session {
                        println!("  resumed autosave: {} at round {}", s.m.match_id(), s.m.round());
                    }
                    start_agents(&shared, &st);
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
        let target = req.url().to_string();
        let path = target.split_once('?').map(|(p, _)| p).unwrap_or(&target);
        let method = req.method().clone();
        // bodies are bytes: a save file is binary. Nothing larger than a save file is ever sent.
        let mut body = Vec::new();
        let _ = req.as_reader().take(body_cap as u64 + 1).read_to_end(&mut body);
        if body.len() > body_cap {
            let _ = req.respond(err(413, "TOO_LARGE", &format!("the request is larger than the {body_cap} bytes this referee reads")));
            continue;
        }
        if log_requests {
            println!("  {} {}", method, path);
        }
        let mut guard = shared.lock().unwrap();
        let st = &mut *guard;
        let mut quit = false;
        // Saves on this machine (named saves, the exports folder) are answered by saves.rs.
        if let Some(outcome) = saves::handle(st, &dirs, method.as_str(), path, target.split_once('?').map(|(_, q)| q).unwrap_or(""), &body) {
            if outcome.installed {
                start_agents(&shared, st);
            }
            drop(guard);
            let _ = req.respond(outcome.response);
            continue;
        }
        // The client's files are served here. Everything else is the referee's, in the shared host.
        let response = match (method.as_str(), path) {
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
            _ => {
                let reply = st.host.handle_bytes(method.as_str(), &target, &body, entropy());
                if reply.effects.installed {
                    start_agents(&shared, st);
                }
                if reply.effects.autosave {
                    st.autosave();
                }
                quit = reply.effects.quit;
                respond(reply)
            }
        };
        drop(guard);
        let _ = req.respond(response);
        if quit {
            std::process::exit(0);
        }
    }
}

fn print_table(s: &Session) {
    println!("round {:>3}  month {:>5}  {}  phase {:?}", s.m.round(), s.m.month(), s.m.date().label, s.m.phase());
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
            d.sci_method.map(|m| bts_engine::calendar::year_label(s.m.config().calendar.date(m).0)).unwrap_or_else(|| "-".into()),
            d.gov_streak,
            d.ftl_streak,
            d.overlord.map(|o| format!(" under {o}")).unwrap_or_default()
        );
    }
}

fn run_config(args: &Args) -> MatchConfig {
    let mut cfg = MatchConfig { seed: args.get("seed", "riverland"), regions: args.num("regions", 48), pace_bp: args.num("pace", 10_000), ..Default::default() };
    cfg.calendar = match args.get("calendar", "standard").as_str() {
        "quick" => bts_engine::calendar::CalendarId::Quick,
        _ => bts_engine::calendar::CalendarId::Standard,
    };
    if args.has("horizon") {
        // a development clock: twelve-month rounds from 5000 BC
        cfg.calendar = MatchConfig::fixture_calendar(args.num("horizon", 2880u32) / 12);
    }
    let ai = args.get("ai", "hard,medium,medium,easy");
    let kinds: Vec<ControllerKind> = ai.split(',').filter_map(controller).collect();
    cfg.controllers = if kinds.len() == 4 { kinds } else { vec![ControllerKind::NativeMedium; 4] };
    cfg.disclosed_objective = args.has("disclosed");
    cfg
}

/// Calibration checkpoints requested with `--checkpoints DIR --at m1,m2,...`: the
/// match is saved at the first round boundary at or after each month.
fn checkpoint_months(args: &Args, cfg: &MatchConfig) -> Vec<u32> {
    let mut v: Vec<u32> = args.get("at", "").split(',').filter_map(|x| x.trim().parse().ok()).collect();
    // historical years (negative = BC); by default the era checkpoints of design section 10
    let years = if v.is_empty() { args.get("at-years", "-1000,1000,1700,1900,2100") } else { args.get("at-years", "") };
    for y in years.split(',').filter_map(|x| x.trim().parse::<i32>().ok()) {
        let astro = bts_engine::calendar::astronomical(y);
        let m = (astro - cfg.calendar.start_astro_year()) * 12;
        if m >= 0 {
            v.push(m as u32);
        }
    }
    v.sort_unstable();
    v
}

/// Run one match to its end or the round limit, recording the curve and writing
/// checkpoints when asked. Returns the session and its curve rows.
fn run_one(cfg: MatchConfig, args: &Args, rounds: u32, every: u32, print: bool) -> (Session, Vec<bts_engine::curve::CurveRow>) {
    let mut pending = checkpoint_months(args, &cfg);
    let mut s = Session::new(cfg, 7);
    let want_curve = args.has("curve");
    if want_curve {
        s.m.record_curve(true);
    }
    let dir = args.flags.get("checkpoints").cloned();
    let mut rows = Vec::new();
    let mut since = 0;
    while !s.m.finished() && s.m.round() <= rounds {
        let before = s.m.round();
        s.run_rounds(1);
        if s.m.round() == before && !s.m.finished() {
            break;
        }
        since += 1;
        if let Some(d) = &dir {
            while let Some(&at) = pending.first() {
                if s.m.month() < at {
                    break;
                }
                pending.remove(0);
                let year = s.m.date().year;
                let path = Path::new(d).join(format!("{}-{}{}.json", s.m.config().seed, year.abs(), if year < 0 { "bc" } else { "ad" }));
                std::fs::create_dir_all(d).expect("checkpoint directory");
                std::fs::write(&path, s.save()).expect("write checkpoint");
            }
        }
        if want_curve {
            rows.extend(s.m.take_curve());
        }
        if print && since >= every.max(1) {
            since = 0;
            print_table(&s);
        }
    }
    if want_curve {
        rows.extend(s.m.take_curve());
    }
    (s, rows)
}

fn write_curve(path: &str, rows: &[(String, bts_engine::curve::CurveRow)]) {
    let mut out = format!("seed,{}\n", bts_engine::curve::CurveRow::csv_header());
    for (seed, r) in rows {
        out += &format!("{seed},{}\n", r.csv());
    }
    std::fs::write(path, out).expect("write curve");
}

fn run(args: &Args) {
    let matches: u32 = args.num("matches", 1);
    let rounds: u32 = args.num("rounds", 100_000);
    let every: u32 = args.num("every", 20);
    if matches <= 1 {
        let start = std::time::Instant::now();
        let cfg = run_config(args);
        let seed = cfg.seed.clone();
        let (s, rows) = run_one(cfg, args, rounds, every, !args.has("quiet"));
        print_table(&s);
        println!("finished: {}  winner: {:?}  {}  elapsed {:.1}s  state hash {:016x}", s.m.finished(), s.m.winner(), s.m.date().label, start.elapsed().as_secs_f64(), s.m.state_hash());
        if let Some(path) = args.flags.get("save") {
            std::fs::write(path, s.save()).expect("write save");
        }
        if let Some(path) = args.flags.get("curve") {
            write_curve(path, &rows.into_iter().map(|r| (seed.clone(), r)).collect::<Vec<_>>());
        }
        return;
    }
    // Independent matches run in parallel across CPU cores; each match is itself deterministic.
    let base = args.get("seed", "eval");
    let first: u32 = args.num("first", 0);
    let threads: usize = args.num("threads", std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4));
    let queue = std::sync::Arc::new(std::sync::Mutex::new((first..first + matches).collect::<Vec<u32>>()));
    let results = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let flags = args.flags.clone();
    let workers: Vec<_> = (0..threads.max(1))
        .map(|_| {
            let queue = queue.clone();
            let results = results.clone();
            let flags = flags.clone();
            let base = base.clone();
            std::thread::spawn(move || {
                let args = Args { flags };
                loop {
                    let Some(i) = queue.lock().unwrap().pop() else { break };
                    let mut cfg = run_config(&args);
                    cfg.seed = format!("{base}-{i}");
                    let seed = cfg.seed.clone();
                    let start = std::time::Instant::now();
                    let (s, rows) = run_one(cfg, &args, rounds, u32::MAX, false);
                    let secs = start.elapsed().as_secs_f64();
                    results.lock().unwrap().push((i, seed, s.m.winner(), s.m.month(), s.m.diagnostics(), rows, secs));
                }
            })
        })
        .collect();
    for w in workers {
        w.join().expect("match thread");
    }
    let mut results = std::mem::take(&mut *results.lock().unwrap());
    results.sort_by_key(|r| r.0);
    let mut all_rows = Vec::new();
    for (i, seed, winner, month, diag, rows, secs) in results {
        let line: Vec<String> = diag.iter().map(|d| format!("{}:{}p/{}r/{}t", d.seat, d.population, d.regions, d.understood)).collect();
        let date = bts_engine::calendar::year_label(run_config(args).calendar.date(month).0);
        println!("match {i:>2}  winner {:?}  month {month:>5} ({date})  {:.1}s  {}", winner, secs, line.join("  "));
        all_rows.extend(rows.into_iter().map(|r| (seed.clone(), r)));
    }
    if let Some(path) = args.flags.get("curve") {
        write_curve(path, &all_rows);
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
    const USAGE: &str = "Before the Stars\n\n  bts                    the game in its own window\n  bts serve [--port N]   referee and web client for a browser or external agents\n  bts run | verify | inspect      headless matches, determinism check, one seat's view\n  bts match | observe | act | ready   talk to a running referee\n\nSee README.md and docs/agent-api.md.";
    if matches!(argv.get(1).map(|s| s.as_str()), Some("--help" | "-h" | "help")) {
        println!("{USAGE}");
        return;
    }
    if matches!(argv.get(1).map(|s| s.as_str()), Some("--version" | "-V")) {
        println!("bts {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let cmd = argv.get(1).map(|s| s.as_str()).filter(|s| !s.starts_with('-')).unwrap_or("app");
    let explicit = argv.get(1).map(|s| !s.starts_with('-')).unwrap_or(false);
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
        other => Err(format!("unknown command '{other}'\n\n{USAGE}")),
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
