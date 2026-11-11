//! Model providers for LLM-driven seats.
//!
//! Two kinds of seat:
//!
//! * **Agent seats** (`claude-code`, `codex`): the locally installed CLI runs as an
//!   agent with the game's MCP server (`bts mcp`) bound to the seat. It calls
//!   `get_turn`, reasons, and `submit_turn`s its orders itself, possibly several
//!   times within one decision point. Its own file, shell and web tools are off, it
//!   runs in an empty temporary directory, and the seat token it uses is private to
//!   one consultation.
//! * **One-shot seats** (`claude-api`, `openai-api`): one request per decision point
//!   with the text briefing; the reply is a JSON object of orders. The low-cost
//!   option.
//!
//! Claude is called over the Messages API with raw HTTPS (there is no official Rust
//! SDK). Nothing here writes a key anywhere: a typed key reaches only the request
//! header or the CLI's environment, and error text is scrubbed of it.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    ClaudeApi,
    ClaudeCode,
    Codex,
    OpenAiApi,
    /// Canned one-shot replies for tests; not offered in the client.
    Mock,
    /// A scripted agent that plays through the real MCP server; for tests, not offered in the client.
    MockAgent,
}

impl Provider {
    pub fn parse(s: &str) -> Option<Provider> {
        Some(match s {
            "claude-api" => Provider::ClaudeApi,
            "claude-code" => Provider::ClaudeCode,
            "codex" => Provider::Codex,
            "openai-api" => Provider::OpenAiApi,
            "mock" => Provider::Mock,
            "mock-agent" => Provider::MockAgent,
            _ => return None,
        })
    }
    pub fn key(&self) -> &'static str {
        match self {
            Provider::ClaudeApi => "claude-api",
            Provider::ClaudeCode => "claude-code",
            Provider::Codex => "codex",
            Provider::OpenAiApi => "openai-api",
            Provider::Mock => "mock",
            Provider::MockAgent => "mock-agent",
        }
    }
    pub fn default_model(&self) -> &'static str {
        match self {
            Provider::ClaudeApi => "claude-opus-5-5",
            _ => "",
        }
    }
    /// Plays through the seat API as an agent, rather than with one reply per consultation.
    pub fn is_agent(&self) -> bool {
        matches!(self, Provider::ClaudeCode | Provider::Codex | Provider::MockAgent)
    }
}

/// What a consultation produced, whatever the provider.
#[derive(Clone, Debug, Default)]
pub struct Reply {
    /// One-shot: the JSON object of orders. Agent: its closing note.
    pub text: String,
    pub cost_usd: Option<f64>,
    pub tokens: u64,
    pub turns: u32,
}

/// Remove every occurrence of a held key from text that may be shown or logged.
pub fn redact(text: &str, key: Option<&str>) -> String {
    match key.map(str::trim).filter(|k| k.len() >= 6) {
        Some(k) => text.replace(k, "[key]"),
        None => text.to_string(),
    }
}

/// A short fix for a provider error the player can act on, if one is known.
pub fn hint(provider: Provider, error: &str) -> Option<String> {
    let e = error.to_lowercase();
    let claude = matches!(provider, Provider::ClaudeCode);
    if e.contains("could not start") || e.contains("no such file") {
        return Some(match provider {
            Provider::ClaudeCode => "Install Claude Code (https://claude.com/claude-code), then reopen setup.".into(),
            Provider::Codex => "Install the Codex CLI (npm install -g @openai/codex, or brew install codex), then reopen setup.".into(),
            _ => "The program could not be started.".into(),
        });
    }
    if e.contains("is not supported when using codex with a chatgpt account") || (e.contains("model") && e.contains("not supported")) {
        return Some("Your Codex sign-in does not include that model. Pick another model for this seat (the list shows the models your Codex offers), or leave it on the default.".into());
    }
    if claude && (e.contains("oauth") || e.contains("failed to authenticate") || e.contains("not logged in") || e.contains("please run /login") || e.contains("invalid api key") || e.contains("authentication")) {
        return Some("Sign Claude Code in again: in a terminal run `claude`, then type /login (or run `claude auth login`). Or switch this seat to an Anthropic API key.".into());
    }
    if matches!(provider, Provider::Codex) && (e.contains("not logged in") || e.contains("401") || e.contains("unauthorized") || e.contains("login")) {
        return Some("Sign Codex in: in a terminal run `codex login`. Or switch this seat to an OpenAI API key.".into());
    }
    if e.contains("credit balance") || e.contains("billing") || e.contains("quota") {
        return Some("The account behind this seat has no usage left. Add credit or use another sign-in.".into());
    }
    if e.contains("rate limit") || e.contains("429") || e.contains("usage limit") {
        return Some("The provider is rate-limiting this account. Consult less often (every 2 or 5 rounds) or wait and resume.".into());
    }
    if e.contains("did not finish within") {
        return Some("Raise the time budget for this seat, lower the effort, or pick a faster model.".into());
    }
    if e.contains("no claude api credential") || e.contains("no api key") || e.contains("rejected the credential") {
        return Some("Enter an API key for this seat, or set the environment variable before starting the game.".into());
    }
    None
}

// ---- one-shot requests ------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct Request<'a> {
    pub provider: Provider,
    pub model: &'a str,
    pub api_key: Option<&'a str>,
    pub base_url: Option<&'a str>,
    pub effort: Option<&'a str>,
    pub max_tokens: u32,
    pub timeout: Duration,
    pub system: &'a str,
    pub user: &'a str,
}

pub fn call(req: &Request) -> Result<Reply, String> {
    let out = match req.provider {
        Provider::ClaudeApi => claude_api(req),
        Provider::OpenAiApi => openai_api(req),
        Provider::Mock => Ok(Reply { text: mock(req), ..Default::default() }),
        p => Err(format!("{} is an agent seat, not a one-shot provider", p.key())),
    };
    out.map_err(|e| redact(&e, req.api_key))
}

fn http_json(request: ureq::Request, body: &Value) -> Result<Value, (u16, String)> {
    let mut delay = 2u64;
    for attempt in 0..3 {
        match request.clone().send_json(body.clone()) {
            Ok(resp) => return resp.into_json::<Value>().map_err(|e| (0, format!("unreadable response: {e}"))),
            Err(ureq::Error::Status(code, resp)) => {
                let retry_after = resp.header("retry-after").and_then(|v| v.parse::<u64>().ok());
                let text = resp.into_string().unwrap_or_default();
                let message = serde_json::from_str::<Value>(&text).ok().and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string())).unwrap_or_else(|| text.chars().take(300).collect());
                // rate limits and server faults are worth another try; bad requests are not
                let retryable = code == 408 || code == 409 || code == 429 || code >= 500;
                if !retryable || attempt == 2 {
                    return Err((code, message));
                }
                std::thread::sleep(Duration::from_secs(retry_after.unwrap_or(delay).min(60)));
                delay *= 3;
            }
            Err(ureq::Error::Transport(t)) => {
                if attempt == 2 {
                    return Err((0, format!("network error: {t}")));
                }
                std::thread::sleep(Duration::from_secs(delay));
                delay *= 3;
            }
        }
    }
    Err((0, "request failed".into()))
}

/// Credentials for the Claude API: an explicit key, then the environment, then a
/// profile from `ant auth login` if the Anthropic CLI is installed.
fn claude_credentials(explicit: Option<&str>) -> Result<(String, bool), String> {
    if let Some(k) = explicit.filter(|k| !k.trim().is_empty()) {
        return Ok((k.trim().to_string(), false));
    }
    if let Ok(k) = std::env::var("ANTHROPIC_API_KEY") {
        if !k.trim().is_empty() {
            return Ok((k.trim().to_string(), false));
        }
    }
    if let Ok(k) = std::env::var("ANTHROPIC_AUTH_TOKEN") {
        if !k.trim().is_empty() {
            return Ok((k.trim().to_string(), true));
        }
    }
    if let Ok(out) = Command::new("ant").args(["auth", "print-credentials", "--access-token"]).stderr(Stdio::null()).output() {
        let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if out.status.success() && !token.is_empty() {
            return Ok((token, true));
        }
    }
    Err("no Claude API credential: set ANTHROPIC_API_KEY (or run `ant auth login`), or enter a key when creating the match".into())
}

/// The Messages API request body for one consultation.
pub fn claude_body(model: &str, effort: Option<&str>, max_tokens: u32, system: &str, user: &str) -> (Value, Vec<&'static str>) {
    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        // the rules never change within a match, so the system prompt is cached
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": user}],
    });
    if !model.contains("haiku-4-5") {
        body["thinking"] = json!({"type": "adaptive"});
    }
    if let Some(e) = effort.filter(|e| !e.is_empty()) {
        body["output_config"] = json!({"effort": e});
    }
    let mut betas = Vec::new();
    // on models whose safety classifiers may decline a turn, let the API route to its
    // default fallback inside the same call instead of leaving the seat without orders
    if ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"].contains(&model) {
        body["fallbacks"] = json!("default");
        betas.push("server-side-fallback-2026-07-01");
    }
    (body, betas)
}

fn claude_api(req: &Request) -> Result<Reply, String> {
    let (credential, bearer) = claude_credentials(req.api_key)?;
    let model = if req.model.is_empty() { Provider::ClaudeApi.default_model() } else { req.model };
    let (body, mut betas) = claude_body(model, req.effort, req.max_tokens, req.system, req.user);
    if bearer {
        betas.push("oauth-2025-04-20");
    }
    let base = req.base_url.filter(|b| !b.is_empty()).unwrap_or("https://api.anthropic.com");
    let mut request = ureq::post(&format!("{}/v1/messages", base.trim_end_matches('/'))).timeout(req.timeout).set("content-type", "application/json").set("anthropic-version", "2026-10-21");
    request = if bearer { request.set("authorization", &format!("Bearer {credential}")) } else { request.set("x-api-key", &credential) };
    if !betas.is_empty() {
        request = request.set("anthropic-beta", &betas.join(","));
    }
    let v = http_json(request, &body).map_err(|(code, msg)| match code {
        401 | 403 => format!("the Claude API rejected the credential ({code}): {msg}"),
        404 => format!("the Claude API does not know model '{model}': {msg}"),
        429 => format!("the Claude API rate limit was hit repeatedly: {msg}"),
        0 => msg,
        _ => format!("Claude API error {code}: {msg}"),
    })?;
    // a declined turn is a normal response, not an HTTP error: check before reading content
    if v["stop_reason"] == "refusal" {
        let category = v["stop_details"]["category"].as_str().unwrap_or("unspecified");
        return Err(format!("the model declined this turn (category: {category})"));
    }
    let text: String = v["content"].as_array().map(|blocks| blocks.iter().filter(|b| b["type"] == "text").filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n")).unwrap_or_default();
    if text.trim().is_empty() {
        return Err(format!("the model returned no text (stop reason: {})", v["stop_reason"].as_str().unwrap_or("unknown")));
    }
    let u = &v["usage"];
    let tokens = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].iter().map(|k| u[k].as_u64().unwrap_or(0)).sum();
    Ok(Reply { text, tokens, turns: 1, cost_usd: None })
}

fn openai_api(req: &Request) -> Result<Reply, String> {
    let key = req.api_key.filter(|k| !k.trim().is_empty()).map(|k| k.trim().to_string()).or_else(|| std::env::var("OPENAI_API_KEY").ok().filter(|k| !k.trim().is_empty()));
    if req.model.is_empty() {
        return Err("an OpenAI-compatible seat needs a model name".into());
    }
    let base = req.base_url.filter(|b| !b.is_empty()).unwrap_or("https://api.openai.com/v1");
    let body = json!({
        "model": req.model,
        "max_completion_tokens": req.max_tokens,
        "messages": [{"role": "system", "content": req.system}, {"role": "user", "content": req.user}],
    });
    let mut request = ureq::post(&format!("{}/chat/completions", base.trim_end_matches('/'))).timeout(req.timeout).set("content-type", "application/json");
    if let Some(k) = &key {
        request = request.set("authorization", &format!("Bearer {k}"));
    } else if base.contains("api.openai.com") {
        return Err("no API key: set OPENAI_API_KEY or enter a key when creating the match".into());
    }
    let v = http_json(request, &body).map_err(|(code, msg)| if code == 0 { msg } else { format!("API error {code}: {msg}") })?;
    let text = v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
    if text.trim().is_empty() {
        return Err("the model returned no text".into());
    }
    Ok(Reply { text, tokens: v["usage"]["total_tokens"].as_u64().unwrap_or(0), turns: 1, cost_usd: None })
}

/// A deterministic stand-in for a model: follows up the first lead it is shown and keeps
/// the steward on everything except research. Used to test the agent path offline.
fn mock(req: &Request) -> String {
    let lead = req.user.lines().find_map(|l| l.trim().strip_prefix("lead ").and_then(|rest| rest.split(':').next()).map(|h| h.trim().to_string()));
    let mut actions = vec![json!({"kind": "set_policy", "setting": {"kind": "food_reserve_months", "months": 7}})];
    if let Some(h) = lead {
        actions.push(json!({"kind": "investigate", "lead": h}));
    }
    actions.push(json!({"kind": "directive", "op": "add", "directive": {"kind": "auto_research", "on": true}}));
    actions.push(json!({"kind": "start_project", "spec": {"kind": "build", "region": 9999, "facility": "no_such_thing", "levels": 1}}));
    actions.push(json!({"kind": "not_an_action"}));
    format!("Here are my orders.\n```json\n{}\n```", json!({"note": "Keeping a larger food reserve and following the first lead.", "delegate": ["economy", "education", "culture", "expansion", "military"], "actions": actions}))
}

// ---- agent seats ---------------------------------------------------------------------

/// Where an agent's MCP server finds the referee, as which seat, and with which
/// private token. The token is valid for one consultation only.
#[derive(Clone, Debug)]
pub struct Binding {
    pub url: String,
    pub seat: u8,
    pub token: String,
    pub max_calls: u32,
    /// The program that serves MCP (`bts`), run with the argument `mcp`.
    pub exe: PathBuf,
}

/// One agent consultation's settings.
#[derive(Clone, Debug)]
pub struct AgentJob<'a> {
    pub provider: Provider,
    pub model: &'a str,
    pub effort: Option<&'a str>,
    /// A key for the CLI's environment (the "API key" sign-in), never on its command line.
    pub api_key: Option<&'a str>,
    pub max_turns: u32,
    pub max_usd: f64,
    pub timeout: Duration,
    pub system: &'a str,
    pub prompt: &'a str,
}

/// A command to run: program, arguments, environment, input, and files to write
/// into its working directory first. Building it is pure, so it can be tested.
#[derive(Clone, Debug, Default)]
pub struct CliPlan {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub env_remove: Vec<String>,
    pub stdin: String,
    /// (file name in the working directory, contents) written with owner-only permissions.
    pub files: Vec<(String, String)>,
}

pub const MCP_SERVER_NAME: &str = "bts";
pub const MCP_TOOLS: [&str; 2] = ["get_turn", "submit_turn"];

/// The MCP server entry an agent CLI starts for the seat. The token rides in the
/// environment of that process only.
pub fn mcp_server_json(b: &Binding) -> Value {
    json!({
        "type": "stdio",
        "command": b.exe.to_string_lossy(),
        "args": ["mcp"],
        "env": { "BTS_URL": b.url, "BTS_SEAT": b.seat.to_string(), "BTS_SEAT_TOKEN": b.token, "BTS_MAX_CALLS": b.max_calls.to_string() },
    })
}

/// Settings every Claude Code run gets: no project memory files, no auto-memory, no
/// background traffic, and room for a sectioned packet in one tool result.
const CLAUDE_ENV: [(&str, &str); 6] = [
    ("CLAUDE_CODE_DISABLE_CLAUDE_MDS", "1"),
    ("CLAUDE_CODE_DISABLE_AUTO_MEMORY", "1"),
    ("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"),
    ("DISABLE_AUTOUPDATER", "1"),
    ("MAX_MCP_OUTPUT_TOKENS", "40000"),
    ("MCP_TOOL_TIMEOUT", "200000"),
];

/// `claude -p` as an agent: the game's MCP server is its only source of tools.
pub fn claude_code_plan(job: &AgentJob, b: &Binding, stream: bool) -> CliPlan {
    let config = json!({ "mcpServers": { MCP_SERVER_NAME: mcp_server_json(b) } });
    let allowed: Vec<String> = MCP_TOOLS.iter().map(|t| format!("mcp__{MCP_SERVER_NAME}__{t}")).collect();
    let mut args: Vec<String> = vec!["-p".into(), "--output-format".into(), if stream { "stream-json".into() } else { "json".into() }];
    if stream {
        args.push("--verbose".into());
    }
    args.extend([
        "--system-prompt".into(),
        job.system.to_string(),
        "--mcp-config".into(),
        "mcp.json".into(),
        "--strict-mcp-config".into(),
        // no built-in tools at all: no files, no shell, no web
        "--tools".into(),
        String::new(),
        "--allowedTools".into(),
        allowed.join(","),
        "--no-session-persistence".into(),
        "--disable-slash-commands".into(),
        "--max-turns".into(),
        job.max_turns.to_string(),
        "--max-budget-usd".into(),
        format!("{:.2}", job.max_usd),
    ]);
    if !job.model.is_empty() {
        args.extend(["--model".into(), job.model.to_string()]);
    }
    if let Some(e) = job.effort.filter(|e| !e.is_empty()) {
        args.extend(["--effort".into(), e.to_string()]);
    }
    let mut plan = CliPlan { program: "claude".into(), stdin: job.prompt.to_string(), files: vec![("mcp.json".into(), config.to_string())], ..Default::default() };
    plan.env = CLAUDE_ENV.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    match job.api_key.map(str::trim).filter(|k| !k.is_empty()) {
        Some(key) => {
            // bare mode signs in strictly with ANTHROPIC_API_KEY and skips hooks, plugins and keychain
            args.push("--bare".into());
            plan.env.push(("ANTHROPIC_API_KEY".into(), key.to_string()));
            plan.env_remove.push("ANTHROPIC_AUTH_TOKEN".into());
        }
        None => {
            // the person's own Claude Code sign-in: a key in the server's environment must not take over
            plan.env_remove.extend(["ANTHROPIC_API_KEY".into(), "ANTHROPIC_AUTH_TOKEN".into()]);
        }
    }
    plan.args = args;
    plan
}

fn toml_str(s: &str) -> String {
    // a JSON string literal is a valid TOML basic string for everything we pass
    serde_json::to_string(s).unwrap()
}

/// Codex features switched off for a game seat: everything that could touch the
/// machine or the web. The game's MCP server is the only way to act.
pub const CODEX_DISABLED: [&str; 8] = ["shell_tool", "unified_exec", "apps", "plugins", "browser_use", "computer_use", "image_generation", "multi_agent"];

/// `codex exec` as an agent, with the game's MCP server configured for this run only
/// (`-c` overrides; the person's `~/.codex/config.toml` is neither read nor changed).
pub fn codex_plan(job: &AgentJob, b: &Binding, dir: &Path) -> CliPlan {
    let mut args: Vec<String> = ["exec", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "-s", "read-only", "--color", "never", "--json"].iter().map(|s| s.to_string()).collect();
    args.extend(["-C".into(), dir.to_string_lossy().to_string(), "-o".into(), dir.join("last-message.txt").to_string_lossy().to_string()]);
    if !job.model.is_empty() {
        args.extend(["-m".into(), job.model.to_string()]);
    }
    if let Some(e) = job.effort.filter(|e| !e.is_empty()) {
        args.extend(["-c".into(), format!("model_reasoning_effort={}", toml_str(e))]);
    }
    for f in CODEX_DISABLED {
        args.extend(["--disable".into(), f.into()]);
    }
    args.extend(["-c".into(), "web_search=\"disabled\"".into()]);
    let s = format!("mcp_servers.{MCP_SERVER_NAME}");
    let env = format!("{{BTS_URL={},BTS_SEAT={},BTS_MAX_CALLS={}}}", toml_str(&b.url), toml_str(&b.seat.to_string()), toml_str(&b.max_calls.to_string()));
    for c in [
        format!("{s}.command={}", toml_str(&b.exe.to_string_lossy())),
        format!("{s}.args=[\"mcp\"]"),
        format!("{s}.env={env}"),
        // the token is forwarded from Codex's own environment: it never appears on a command line
        format!("{s}.env_vars=[\"BTS_SEAT_TOKEN\"]"),
        format!("{s}.enabled_tools=[\"get_turn\",\"submit_turn\"]"),
        format!("{s}.default_tools_approval_mode=\"approve\""),
        format!("{s}.startup_timeout_sec=30"),
        format!("{s}.tool_timeout_sec=200"),
    ] {
        args.extend(["-c".into(), c]);
    }
    args.push("-".into());
    let mut plan = CliPlan { program: "codex".into(), args, stdin: format!("{}\n\n---\n\n{}", job.system, job.prompt), ..Default::default() };
    plan.env.push(("BTS_SEAT_TOKEN".into(), b.token.clone()));
    match job.api_key.map(str::trim).filter(|k| !k.is_empty()) {
        Some(key) => plan.env.push(("CODEX_API_KEY".into(), key.to_string())),
        None => plan.env_remove.push("CODEX_API_KEY".into()),
    }
    plan
}

/// Run a plan in `dir` with a hard time limit. Returns (stdout, stderr, success).
pub fn run_plan(plan: &CliPlan, dir: &Path, timeout: Duration) -> Result<(String, String, bool), String> {
    for (name, contents) in &plan.files {
        let path = dir.join(name);
        std::fs::write(&path, contents).map_err(|e| format!("could not write {name}: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
    }
    let mut cmd = Command::new(&plan.program);
    cmd.args(&plan.args).current_dir(dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    for k in &plan.env_remove {
        cmd.env_remove(k);
    }
    for (k, v) in &plan.env {
        cmd.env(k, v);
    }
    let mut child = cmd.spawn().map_err(|e| format!("could not start `{}`: {e}. Is it installed and on PATH?", plan.program))?;
    if let Some(mut stdin) = child.stdin.take() {
        let data = plan.stdin.clone();
        std::thread::spawn(move || {
            let _ = stdin.write_all(data.as_bytes());
        });
    }
    let mut stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");
    let out_thread = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stdout.read_to_string(&mut s);
        s
    });
    let err_thread = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("`{}` did not finish within {} seconds", plan.program, timeout.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(format!("`{}` failed: {e}", plan.program)),
        }
    };
    Ok((out_thread.join().unwrap_or_default(), err_thread.join().unwrap_or_default(), status.success()))
}

pub fn scratch_dir(tag: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!("bts-agent-{tag}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create a working directory: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    Ok(dir)
}

fn tail(text: &str, n: usize) -> String {
    let t = text.trim();
    let skip = t.chars().count().saturating_sub(n);
    t.chars().skip(skip).collect()
}

/// Read `claude -p --output-format json` (one result object) or `stream-json` (one
/// object per line, the result last).
pub fn claude_result(stdout: &str, stderr: &str) -> Result<Reply, String> {
    let result = stdout.lines().rev().filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok()).find(|v| v["type"] == "result").or_else(|| serde_json::from_str::<Value>(stdout.trim()).ok());
    let Some(v) = result else {
        let why = if stdout.trim().is_empty() { tail(stderr, 400) } else { tail(stdout, 400) };
        return Err(format!("Claude Code returned something unexpected: {why}"));
    };
    let u = &v["usage"];
    let tokens = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].iter().map(|k| u[k].as_u64().unwrap_or(0)).sum();
    let reply = Reply { text: v["result"].as_str().unwrap_or("").to_string(), cost_usd: v["total_cost_usd"].as_f64(), tokens, turns: v["num_turns"].as_u64().unwrap_or(0) as u32 };
    let subtype = v["subtype"].as_str().unwrap_or("");
    if v["is_error"].as_bool().unwrap_or(false) || subtype.starts_with("error") {
        let what = match subtype {
            "error_max_turns" => "it reached its turn limit for this consultation".to_string(),
            "error_max_budget_usd" => "it reached its spending limit for this consultation".to_string(),
            _ => v["result"].as_str().filter(|s| !s.is_empty()).unwrap_or(subtype).chars().take(400).collect(),
        };
        // a limit reached after orders were submitted is not a failure of the seat
        if subtype == "error_max_turns" || subtype == "error_max_budget_usd" {
            return Ok(Reply { text: format!("(stopped: {what})"), ..reply });
        }
        return Err(format!("Claude Code reported an error: {what}"));
    }
    Ok(reply)
}

/// Read `codex exec --json` events and the last message it wrote.
pub fn codex_result(stdout: &str, stderr: &str, last_message: &str) -> Result<Reply, String> {
    let mut tokens = 0u64;
    let mut turns = 0u32;
    let mut errors: Vec<String> = Vec::new();
    for line in stdout.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line.trim()) else { continue };
        let kind = v["type"].as_str().unwrap_or("");
        if kind == "turn.completed" {
            turns += 1;
            let u = &v["usage"];
            tokens += ["input_tokens", "output_tokens"].iter().map(|k| u[k].as_u64().unwrap_or(0)).sum::<u64>();
        }
        if kind == "error" || kind == "turn.failed" {
            let m = v["message"].as_str().or_else(|| v["error"]["message"].as_str()).unwrap_or("").to_string();
            if !m.is_empty() {
                errors.push(m);
            }
        }
    }
    if last_message.trim().is_empty() {
        let reason = errors.last().cloned().unwrap_or_else(|| {
            let all = format!("{stdout}\n{stderr}");
            all.lines().filter(|l| l.contains("ERROR") || l.contains("error")).last().map(|l| l.trim().to_string()).unwrap_or_else(|| tail(&all, 300))
        });
        // the CLI sometimes wraps the API's error JSON in its message
        let reason = serde_json::from_str::<Value>(&reason).ok().and_then(|v| v["error"]["message"].as_str().or_else(|| v["detail"].as_str()).map(str::to_string)).unwrap_or(reason);
        return Err(format!("Codex returned no final message: {}", reason.chars().take(400).collect::<String>()));
    }
    Ok(Reply { text: last_message.trim().to_string(), tokens, turns, cost_usd: None })
}

/// Run one agent consultation to its end (or its time limit).
pub fn run_agent(job: &AgentJob, b: &Binding) -> Result<Reply, String> {
    let out = match job.provider {
        Provider::ClaudeCode => {
            let dir = scratch_dir("claude")?;
            let plan = claude_code_plan(job, b, false);
            let r = run_plan(&plan, &dir, job.timeout);
            let _ = std::fs::remove_dir_all(&dir);
            let (out, err, _) = r?;
            claude_result(&out, &err)
        }
        Provider::Codex => {
            let dir = scratch_dir("codex")?;
            let plan = codex_plan(job, b, &dir);
            let r = run_plan(&plan, &dir, job.timeout);
            let last = std::fs::read_to_string(dir.join("last-message.txt")).unwrap_or_default();
            let _ = std::fs::remove_dir_all(&dir);
            let (out, err, _) = r?;
            codex_result(&out, &err, &last)
        }
        Provider::MockAgent => mock_agent(b, job.timeout),
        p => Err(format!("{} is not an agent provider", p.key())),
    };
    out.map_err(|e| redact(&e, job.api_key))
}

/// A scripted agent that plays one decision point through the real MCP server
/// process, exactly as a CLI agent would: initialize, list the tools, read the brief
/// packet, submit orders without advancing, read the receipts, resubmit the ones
/// that were accepted with advance "phase", and close with a note.
pub fn mock_agent(b: &Binding, timeout: Duration) -> Result<Reply, String> {
    let mut child = Command::new(&b.exe)
        .arg("mcp")
        .env("BTS_URL", &b.url)
        .env("BTS_SEAT", b.seat.to_string())
        .env("BTS_SEAT_TOKEN", &b.token)
        .env("BTS_MAX_CALLS", b.max_calls.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("could not start the MCP server `{} mcp`: {e}", b.exe.display()))?;
    let start = Instant::now();
    let mut stdin = child.stdin.take().expect("piped stdin");
    let mut lines = BufReader::new(child.stdout.take().expect("piped stdout")).lines();
    let mut id = 0;
    let mut rpc = |method: &str, params: Value| -> Result<Value, String> {
        if start.elapsed() > timeout {
            return Err(format!("the mock agent did not finish within {} seconds", timeout.as_secs()));
        }
        id += 1;
        writeln!(stdin, "{}", json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })).map_err(|e| e.to_string())?;
        let line = lines.next().ok_or("the MCP server closed")?.map_err(|e| e.to_string())?;
        let v: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if v.get("error").is_some() {
            return Err(format!("MCP error: {}", v["error"]));
        }
        Ok(v["result"].clone())
    };
    let text_of = |r: &Value| r["content"][0]["text"].as_str().unwrap_or("").to_string();
    let packet_of = |text: &str| -> Result<Value, String> { serde_json::from_str(text.split(crate::mcp::PACKET_MARK).nth(1).ok_or_else(|| format!("not a brief packet: {}", text.chars().take(300).collect::<String>()))?.trim()).map_err(|e| e.to_string()) };
    let result = (|| -> Result<Reply, String> {
        rpc("initialize", json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "bts-mock-agent", "version": "1" } }))?;
        let tools = rpc("tools/list", json!({}))?;
        let names: Vec<&str> = tools["tools"].as_array().map(|t| t.iter().filter_map(|x| x["name"].as_str()).collect()).unwrap_or_default();
        if names != MCP_TOOLS {
            return Err(format!("unexpected tools: {names:?}"));
        }
        let got = rpc("tools/call", json!({ "name": "get_turn", "arguments": {} }))?;
        if got["isError"] == true {
            return Err(text_of(&got));
        }
        let text = text_of(&got);
        let packet = packet_of(&text)?;
        let cursor = packet["cursor"].as_str().unwrap_or("").to_string();
        let lead = text.lines().find_map(|l| l.trim().strip_prefix("lead ").and_then(|r| r.split(':').next()).map(|h| h.trim().to_string()));
        let mut actions = vec![json!({"kind": "set_policy", "setting": {"kind": "food_reserve_months", "months": 7}}), json!({"kind": "directive", "op": "add", "directive": {"kind": "auto_research", "on": true}})];
        if let Some(h) = lead {
            actions.push(json!({"kind": "investigate", "lead": h}));
        }
        actions.push(json!({"kind": "start_project", "spec": {"kind": "build", "region": 9999, "facility": "no_such_thing", "levels": 1}}));
        let first = rpc("tools/call", json!({ "name": "submit_turn", "arguments": { "cursor": cursor, "request_id": format!("mock-{}-a", packet["round"]), "actions": actions, "advance": "none" } }))?;
        if first["isError"] == true {
            return Err(text_of(&first));
        }
        let after = packet_of(&text_of(&first))?;
        let rejected = after["receipts"].as_array().map(|r| r.iter().filter(|x| x["status"] == "rejected").count()).unwrap_or(0);
        // the accepted orders stay applied; finish the phase with nothing more to add
        let done = rpc("tools/call", json!({ "name": "submit_turn", "arguments": { "cursor": after["cursor"], "request_id": format!("mock-{}-b", packet["round"]), "actions": [], "advance": "phase" } }))?;
        if done["isError"] == true {
            return Err(text_of(&done));
        }
        Ok(Reply { text: json!({ "note": format!("Mock agent: food reserve 7 months and automatic research; {rejected} order(s) were refused and dropped."), "delegate": ["economy", "education", "culture", "expansion", "military"] }).to_string(), turns: 4, ..Default::default() })
    })();
    let _ = child.kill();
    let _ = child.wait();
    result
}

// ---- detection and the test button ----------------------------------------------------

/// Run a short command with a time limit; `None` if it could not run or took too long.
fn quick(program: &str, args: &[&str], secs: u64) -> Option<(String, bool)> {
    let plan = CliPlan { program: program.into(), args: args.iter().map(|s| s.to_string()).collect(), ..Default::default() };
    let dir = std::env::temp_dir();
    run_plan(&plan, &dir, Duration::from_secs(secs)).ok().map(|(out, err, ok)| (if out.trim().is_empty() { err } else { out }, ok))
}

/// What this machine offers for agent seats. Cheap status checks only: versions,
/// sign-in status and the model list the CLI caches; no model is called. Nothing
/// personal (account e-mail, organization) is passed on.
pub fn detect(exe: &Path) -> Value {
    let claude_version = quick("claude", &["--version"], 8).filter(|(_, ok)| *ok).map(|(o, _)| o.trim().to_string());
    let claude = match &claude_version {
        None => json!({ "installed": false, "hint": hint(Provider::ClaudeCode, "could not start") }),
        Some(v) => {
            let status = quick("claude", &["auth", "status", "--json"], 8).and_then(|(o, _)| serde_json::from_str::<Value>(o.trim()).ok()).unwrap_or(Value::Null);
            let logged_in = status["loggedIn"].as_bool();
            json!({
                "installed": true, "version": v,
                "logged_in": logged_in,
                "auth_method": status["authMethod"].as_str(),
                "hint": if logged_in == Some(false) { hint(Provider::ClaudeCode, "not logged in") } else { None },
            })
        }
    };
    let codex_version = quick("codex", &["--version"], 8).filter(|(_, ok)| *ok).map(|(o, _)| o.trim().to_string());
    let codex = match &codex_version {
        None => json!({ "installed": false, "hint": hint(Provider::Codex, "could not start") }),
        Some(v) => {
            let status = quick("codex", &["login", "status"], 8).map(|(o, _)| o.trim().to_string()).unwrap_or_default();
            let logged_in = if status.to_lowercase().contains("not logged in") { Some(false) } else if status.to_lowercase().contains("logged in") { Some(true) } else { None };
            let login = if status.contains("ChatGPT") { Some("chatgpt") } else if status.to_lowercase().contains("api key") { Some("api_key") } else { None };
            let models: Vec<Value> = quick("codex", &["debug", "models"], 8)
                .and_then(|(o, _)| serde_json::from_str::<Value>(o.trim()).ok())
                .and_then(|v| v["models"].as_array().cloned())
                .unwrap_or_default()
                .into_iter()
                .filter(|m| m["visibility"] == "list")
                .map(|m| json!({ "id": m["slug"], "name": m["display_name"], "description": m["description"], "efforts": m["supported_reasoning_levels"].as_array().map(|l| l.iter().filter_map(|x| x["effort"].as_str().map(str::to_string)).collect::<Vec<_>>()).unwrap_or_default() }))
                .collect();
            json!({ "installed": true, "version": v, "logged_in": logged_in, "login": login, "models": models, "hint": if logged_in == Some(false) { hint(Provider::Codex, "not logged in") } else { None } })
        }
    };
    let set = |k: &str| std::env::var(k).map(|v| !v.trim().is_empty()).unwrap_or(false);
    json!({
        "claude_code": claude,
        "codex": codex,
        "env": { "ANTHROPIC_API_KEY": set("ANTHROPIC_API_KEY"), "OPENAI_API_KEY": set("OPENAI_API_KEY"), "CODEX_API_KEY": set("CODEX_API_KEY") },
        "mcp_command": [exe.to_string_lossy(), "mcp"],
    })
}

/// The settings a Test button sends.
#[derive(serde::Deserialize, Default)]
pub struct TestRequest {
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub auth: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
}

const TEST_PROMPT: &str = "This is a connection test. Do not call any tool. Reply with exactly: OK";

/// One tiny real call with the seat's settings. For the agent CLIs the run also
/// starts the game's MCP server (bound to no live consultation) so a broken MCP
/// set-up shows here rather than in the first round.
pub fn test(req: &TestRequest, exe: &Path, url: &str) -> Value {
    let started = Instant::now();
    let Some(provider) = Provider::parse(req.provider.trim()) else {
        return json!({ "ok": false, "error": format!("unknown provider '{}'", req.provider) });
    };
    let key = req.api_key.as_deref().filter(|_| req.auth.as_deref() != Some("login") || !provider.is_agent()).filter(|k| !k.trim().is_empty());
    let effort = req.effort.as_deref().filter(|e| !e.is_empty());
    let mut mcp: Option<&str> = None;
    let result: Result<Reply, String> = match provider {
        Provider::ClaudeApi | Provider::OpenAiApi | Provider::Mock => call(&Request {
            provider,
            model: req.model.trim(),
            api_key: key,
            base_url: req.base_url.as_deref(),
            effort: Some(effort.unwrap_or("low")),
            max_tokens: 2048,
            timeout: Duration::from_secs(90),
            system: "You are checking that a connection works.",
            user: TEST_PROMPT,
        }),
        Provider::ClaudeCode | Provider::Codex | Provider::MockAgent => {
            let b = Binding { url: url.to_string(), seat: 0, token: "connection-test".into(), max_calls: 1, exe: exe.to_path_buf() };
            let job = AgentJob { provider, model: req.model.trim(), effort, api_key: if req.auth.as_deref() == Some("api_key") { key } else { None }, max_turns: 2, max_usd: 0.10, timeout: Duration::from_secs(120), system: "You are checking that a connection works.", prompt: TEST_PROMPT };
            match provider {
                Provider::ClaudeCode => (|| {
                    let dir = scratch_dir("claude-test")?;
                    let r = run_plan(&claude_code_plan(&job, &b, true), &dir, job.timeout);
                    let _ = std::fs::remove_dir_all(&dir);
                    let (out, err, _) = r?;
                    // the init event says whether the game's MCP server came up and which tools it offers
                    if let Some(init) = out.lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()).find(|v| v["type"] == "system" && v["subtype"] == "init") {
                        let up = init["mcp_servers"].as_array().is_some_and(|s| s.iter().any(|x| x["name"] == MCP_SERVER_NAME && x["status"] == "connected"));
                        mcp = Some(if up { "connected" } else { "failed" });
                    }
                    claude_result(&out, &err)
                })(),
                _ => run_agent(&job, &b),
            }
        }
    };
    let seconds = started.elapsed().as_secs_f64();
    match result {
        Ok(r) => {
            let ok = r.text.trim().trim_end_matches('.').eq_ignore_ascii_case("ok") || provider == Provider::Mock || provider == Provider::MockAgent;
            json!({ "ok": true, "reply": r.text.chars().take(200).collect::<String>(), "exact": ok, "seconds": seconds, "cost_usd": r.cost_usd, "tokens": r.tokens, "mcp": mcp })
        }
        Err(e) => {
            let e = redact(&e, key);
            json!({ "ok": false, "error": e, "hint": hint(provider, &e), "seconds": seconds, "mcp": mcp })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn binding() -> Binding {
        Binding { url: "http://127.0.0.1:7991".into(), seat: 3, token: "0123456789abcdef0123456789abcdef".into(), max_calls: 12, exe: PathBuf::from("/opt/Before the Stars/bts") }
    }
    fn job(provider: Provider, key: Option<&'static str>) -> AgentJob<'static> {
        AgentJob { provider, model: "claude-sonnet-5-5", effort: Some("medium"), api_key: key, max_turns: 16, max_usd: 0.5, timeout: Duration::from_secs(300), system: "SYSTEM", prompt: "PROMPT" }
    }
    const KEY: &str = "sk-ant-api03-SECRET-KEY-0123456789";

    #[test]
    fn claude_code_runs_as_an_agent_with_only_the_game_tools() {
        let plan = claude_code_plan(&job(Provider::ClaudeCode, None), &binding(), false);
        let a = &plan.args;
        let after = |flag: &str| a.iter().position(|x| x == flag).map(|i| a[i + 1].clone());
        assert_eq!(plan.program, "claude");
        assert_eq!(after("--tools").as_deref(), Some(""), "every built-in tool is off");
        assert_eq!(after("--allowedTools").as_deref(), Some("mcp__bts__get_turn,mcp__bts__submit_turn"));
        assert_eq!(after("--mcp-config").as_deref(), Some("mcp.json"));
        assert!(a.contains(&"--strict-mcp-config".to_string()) && a.contains(&"--no-session-persistence".to_string()));
        assert_eq!(after("--max-turns").as_deref(), Some("16"));
        assert_eq!(after("--max-budget-usd").as_deref(), Some("0.50"));
        assert_eq!(after("--model").as_deref(), Some("claude-sonnet-5-5"));
        assert_eq!(after("--effort").as_deref(), Some("medium"));
        assert!(!a.contains(&"--bare".to_string()), "the person's sign-in needs the keychain");
        // the seat token is in the MCP config file, never on the command line
        assert!(!a.iter().any(|x| x.contains(&binding().token)));
        let (name, config) = &plan.files[0];
        assert_eq!(name, "mcp.json");
        let config: Value = serde_json::from_str(config).unwrap();
        let server = &config["mcpServers"]["bts"];
        assert_eq!(server["command"], "/opt/Before the Stars/bts");
        assert_eq!(server["args"], json!(["mcp"]));
        assert_eq!(server["env"], json!({ "BTS_URL": "http://127.0.0.1:7991", "BTS_SEAT": "3", "BTS_SEAT_TOKEN": binding().token, "BTS_MAX_CALLS": "12" }));
        // a key in the server's own environment must not silently replace the person's sign-in
        assert!(plan.env_remove.contains(&"ANTHROPIC_API_KEY".to_string()));
        assert!(plan.env.iter().any(|(k, v)| k == "CLAUDE_CODE_DISABLE_CLAUDE_MDS" && v == "1"));
    }

    #[test]
    fn an_api_key_reaches_only_the_cli_environment() {
        let plan = claude_code_plan(&job(Provider::ClaudeCode, Some(KEY)), &binding(), false);
        assert!(plan.args.contains(&"--bare".to_string()));
        assert!(plan.env.contains(&("ANTHROPIC_API_KEY".to_string(), KEY.to_string())));
        assert!(!plan.args.iter().any(|x| x.contains(KEY)) && !plan.files.iter().any(|(_, c)| c.contains(KEY)) && !plan.stdin.contains(KEY));
        let dir = PathBuf::from("/tmp/x");
        let codex = codex_plan(&job(Provider::Codex, Some(KEY)), &binding(), &dir);
        assert!(codex.env.contains(&("CODEX_API_KEY".to_string(), KEY.to_string())));
        assert!(!codex.args.iter().any(|x| x.contains(KEY)) && !codex.stdin.contains(KEY));
        // and error text that repeats it is scrubbed before anyone sees it
        assert_eq!(redact(&format!("bad key {KEY} rejected"), Some(KEY)), "bad key [key] rejected");
    }

    #[test]
    fn codex_gets_the_game_server_for_one_run_without_touching_its_config() {
        let dir = PathBuf::from("/tmp/bts-agent-codex-1");
        let plan = codex_plan(&job(Provider::Codex, None), &binding(), &dir);
        let a = plan.args.join(" ");
        for must in ["exec", "--ephemeral", "--ignore-user-config", "-s read-only", "--json", "-m claude-sonnet-5-5", "model_reasoning_effort=\"medium\"", "web_search=\"disabled\"", "--disable shell_tool", "--disable unified_exec", "--disable computer_use"] {
            assert!(a.contains(must), "codex args lack {must}: {a}");
        }
        assert!(plan.args.contains(&"mcp_servers.bts.command=\"/opt/Before the Stars/bts\"".to_string()));
        assert!(plan.args.contains(&"mcp_servers.bts.env={BTS_URL=\"http://127.0.0.1:7991\",BTS_SEAT=\"3\",BTS_MAX_CALLS=\"12\"}".to_string()));
        assert!(plan.args.contains(&"mcp_servers.bts.env_vars=[\"BTS_SEAT_TOKEN\"]".to_string()));
        assert!(plan.args.contains(&"mcp_servers.bts.enabled_tools=[\"get_turn\",\"submit_turn\"]".to_string()));
        assert_eq!(plan.args.last().map(String::as_str), Some("-"), "the prompt comes on stdin");
        assert!(!plan.args.iter().any(|x| x.contains(&binding().token)), "the token stays off the command line");
        assert!(plan.env.contains(&("BTS_SEAT_TOKEN".to_string(), binding().token)));
        assert!(plan.env_remove.contains(&"CODEX_API_KEY".to_string()));
    }

    #[test]
    fn cli_results_and_their_errors_are_read() {
        let ok = r#"{"type":"result","subtype":"success","is_error":false,"result":"{\"note\":\"n\"}","total_cost_usd":0.12,"num_turns":5,"usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":1000}}"#;
        let r = claude_result(ok, "").unwrap();
        assert_eq!((r.cost_usd, r.tokens, r.turns), (Some(0.12), 1120, 5));
        let expired = r#"{"type":"result","subtype":"success","is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed"}"#;
        let e = claude_result(expired, "").unwrap_err();
        assert!(e.contains("OAuth session expired"));
        assert!(hint(Provider::ClaudeCode, &e).unwrap().contains("/login"));
        let capped = r#"{"type":"result","subtype":"error_max_budget_usd","is_error":true,"total_cost_usd":0.5}"#;
        assert!(claude_result(capped, "").unwrap().text.contains("spending limit"), "a spent budget ends the consultation, it does not fail the seat");
        let codex_err = "{\"type\":\"error\",\"message\":\"{\\\"detail\\\":\\\"The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.\\\"}\"}\n";
        let e = codex_result(codex_err, "", "").unwrap_err();
        assert!(e.contains("not supported when using Codex with a ChatGPT account"), "{e}");
        assert!(hint(Provider::Codex, &e).unwrap().contains("Pick another model"));
        let done = "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":900,\"cached_input_tokens\":0,\"output_tokens\":100}}\n";
        let r = codex_result(done, "", "{\"note\":\"x\"}").unwrap();
        assert_eq!((r.tokens, r.turns), (1000, 1));
    }

    #[test]
    fn the_claude_api_request_uses_adaptive_thinking_effort_and_caching() {
        let (body, betas) = claude_body("claude-opus-5-5", Some("high"), 16000, "rules", "briefing");
        assert_eq!(body["thinking"], json!({"type": "adaptive"}));
        assert_eq!(body["output_config"], json!({"effort": "high"}));
        assert_eq!(body["system"][0]["cache_control"], json!({"type": "ephemeral"}));
        assert_eq!(body["max_tokens"], 16000);
        assert!(body.get("temperature").is_none());
        assert_eq!(body["fallbacks"], "default");
        assert_eq!(betas, ["server-side-fallback-2026-07-01"]);
        let (haiku, betas) = claude_body("claude-haiku-5-5", None, 4000, "r", "b");
        assert!(haiku.get("fallbacks").is_none() && betas.is_empty() && haiku.get("output_config").is_none());
    }
}
