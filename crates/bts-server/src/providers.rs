//! Model providers for LLM-driven seats.
//!
//! Each provider turns (system prompt, user message) into one text reply. Claude is
//! called over the Messages API with raw HTTPS (there is no official Rust SDK); the
//! Claude Code and Codex providers run the locally installed CLIs with their own
//! logins, in an empty temporary directory so they cannot read the game's files.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Provider {
    ClaudeApi,
    ClaudeCode,
    Codex,
    OpenAiApi,
    /// Canned replies for tests; not offered in the client.
    Mock,
}

impl Provider {
    pub fn parse(s: &str) -> Option<Provider> {
        Some(match s {
            "claude-api" => Provider::ClaudeApi,
            "claude-code" => Provider::ClaudeCode,
            "codex" => Provider::Codex,
            "openai-api" => Provider::OpenAiApi,
            "mock" => Provider::Mock,
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
        }
    }
    pub fn default_model(&self) -> &'static str {
        match self {
            Provider::ClaudeApi => "claude-opus-5-5",
            _ => "",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Request<'a> {
    pub provider: Provider,
    pub model: &'a str,
    pub api_key: Option<&'a str>,
    pub base_url: Option<&'a str>,
    pub effort: Option<&'a str>,
    pub system: &'a str,
    pub user: &'a str,
}

const TIMEOUT: Duration = Duration::from_secs(900);

pub fn call(req: &Request) -> Result<String, String> {
    match req.provider {
        Provider::ClaudeApi => claude_api(req),
        Provider::OpenAiApi => openai_api(req),
        Provider::ClaudeCode => claude_code(req),
        Provider::Codex => codex(req),
        Provider::Mock => Ok(mock(req)),
    }
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

fn claude_api(req: &Request) -> Result<String, String> {
    let (credential, bearer) = claude_credentials(req.api_key)?;
    let model = if req.model.is_empty() { Provider::ClaudeApi.default_model() } else { req.model };
    let mut body = json!({
        "model": model,
        "max_tokens": 16000,
        // the rules briefing never changes within a match, so it is cached
        "system": [{"type": "text", "text": req.system, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": req.user}],
    });
    if !model.contains("haiku-4-5") {
        body["thinking"] = json!({"type": "adaptive"});
    }
    if let Some(e) = req.effort.filter(|e| !e.is_empty()) {
        body["output_config"] = json!({"effort": e});
    }
    let mut betas: Vec<&str> = Vec::new();
    // on models whose safety classifiers may decline a turn, let the API route to its
    // default fallback inside the same call instead of leaving the seat without orders
    let fallback = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"].contains(&model);
    if fallback {
        body["fallbacks"] = json!("default");
        betas.push("server-side-fallback-2026-07-01");
    }
    if bearer {
        betas.push("oauth-2025-04-20");
    }
    let base = req.base_url.filter(|b| !b.is_empty()).unwrap_or("https://api.anthropic.com");
    let mut request = ureq::post(&format!("{}/v1/messages", base.trim_end_matches('/')))
        .timeout(TIMEOUT)
        .set("content-type", "application/json")
        .set("anthropic-version", "2026-10-21");
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
    Ok(text)
}

fn openai_api(req: &Request) -> Result<String, String> {
    let key = req.api_key.filter(|k| !k.trim().is_empty()).map(|k| k.trim().to_string()).or_else(|| std::env::var("OPENAI_API_KEY").ok().filter(|k| !k.trim().is_empty()));
    if req.model.is_empty() {
        return Err("an OpenAI-compatible seat needs a model name".into());
    }
    let base = req.base_url.filter(|b| !b.is_empty()).unwrap_or("https://api.openai.com/v1");
    let body = json!({
        "model": req.model,
        "messages": [{"role": "system", "content": req.system}, {"role": "user", "content": req.user}],
    });
    let mut request = ureq::post(&format!("{}/chat/completions", base.trim_end_matches('/'))).timeout(TIMEOUT).set("content-type", "application/json");
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
    Ok(text)
}

/// Run a command with input on stdin, in an empty directory, with a hard time limit.
fn run_cli(program: &str, args: &[String], input: &str, dir: &std::path::Path) -> Result<(String, String), String> {
    let mut child = Command::new(program)
        .args(args)
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start `{program}`: {e}. Is it installed and on PATH?"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let data = input.to_string();
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
                if start.elapsed() > TIMEOUT {
                    let _ = child.kill();
                    return Err(format!("`{program}` did not answer within {} minutes", TIMEOUT.as_secs() / 60));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(format!("`{program}` failed: {e}")),
        }
    };
    let out = out_thread.join().unwrap_or_default();
    let err = err_thread.join().unwrap_or_default();
    if !status.success() && out.trim().is_empty() {
        let reason = err.lines().filter(|l| l.trim_start().starts_with("ERROR")).last().map(|l| l.trim().to_string()).unwrap_or_else(|| err.trim().chars().rev().take(400).collect::<String>().chars().rev().collect::<String>());
        return Err(format!("`{program}` exited with {status}: {}", reason.chars().take(400).collect::<String>()));
    }
    Ok((out, err))
}

fn scratch_dir(tag: &str) -> Result<std::path::PathBuf, String> {
    let dir = std::env::temp_dir().join(format!("bts-agent-{tag}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create a working directory: {e}"))?;
    Ok(dir)
}

fn claude_code(req: &Request) -> Result<String, String> {
    let dir = scratch_dir("claude")?;
    // no tools, no project context, no saved session: the model answers from the briefing alone
    let mut args: Vec<String> = vec!["-p".into(), "--output-format".into(), "json".into(), "--system-prompt".into(), req.system.to_string(), "--tools".into(), "".into(), "--no-session-persistence".into(), "--disable-slash-commands".into()];
    if !req.model.is_empty() {
        args.push("--model".into());
        args.push(req.model.to_string());
    }
    if let Some(e) = req.effort.filter(|e| !e.is_empty()) {
        args.push("--effort".into());
        args.push(e.to_string());
    }
    let result = run_cli("claude", &args, req.user, &dir);
    let _ = std::fs::remove_dir_all(&dir);
    let (out, err) = result?;
    let v: Value = serde_json::from_str(out.trim()).map_err(|_| format!("Claude Code returned something unexpected: {}", if out.trim().is_empty() { err.trim().chars().take(300).collect::<String>() } else { out.trim().chars().take(300).collect::<String>() }))?;
    if v["is_error"].as_bool().unwrap_or(false) {
        return Err(format!("Claude Code reported an error: {}", v["result"].as_str().unwrap_or("unknown").chars().take(300).collect::<String>()));
    }
    let text = v["result"].as_str().unwrap_or("").to_string();
    if text.trim().is_empty() {
        return Err("Claude Code returned no text".into());
    }
    Ok(text)
}

fn codex(req: &Request) -> Result<String, String> {
    let dir = scratch_dir("codex")?;
    let out_file = dir.join("last-message.txt");
    let mut args: Vec<String> = vec!["exec".into(), "--skip-git-repo-check".into(), "--ephemeral".into(), "-s".into(), "read-only".into(), "--color".into(), "never".into(), "-C".into(), dir.to_string_lossy().to_string(), "-o".into(), out_file.to_string_lossy().to_string()];
    if !req.model.is_empty() {
        args.push("-m".into());
        args.push(req.model.to_string());
    }
    args.push("-".into());
    // the Codex CLI has no separate system-prompt flag: the briefing leads the prompt
    let prompt = format!("{}\n\n---\n\n{}", req.system, req.user);
    let result = run_cli("codex", &args, &prompt, &dir);
    let text = std::fs::read_to_string(&out_file).unwrap_or_default();
    let _ = std::fs::remove_dir_all(&dir);
    let (out, err) = result?;
    if text.trim().is_empty() {
        // the CLI prints its real complaint on lines starting with ERROR
        let all = format!("{out}\n{err}");
        let reason = all.lines().filter(|l| l.trim_start().starts_with("ERROR")).last().map(|l| l.trim().to_string()).unwrap_or_else(|| all.trim().chars().rev().take(300).collect::<String>().chars().rev().collect::<String>());
        return Err(format!("Codex returned no final message: {}", reason.chars().take(400).collect::<String>()));
    }
    Ok(text)
}

/// A deterministic stand-in for a model: follows up the first lead it is shown and keeps
/// the steward on everything except research. Used to test the agent path offline.
fn mock(req: &Request) -> String {
    let lead = req.user.lines().find_map(|l| l.trim().strip_prefix("lead ").and_then(|rest| rest.split(':').next()).map(|h| h.trim().to_string()));
    let mut actions = vec![json!({"kind": "set_policy", "setting": {"kind": "food_reserve_months", "months": 7}})];
    if let Some(h) = lead {
        actions.push(json!({"kind": "investigate", "lead": h}));
    }
    actions.push(json!({"kind": "start_project", "spec": {"kind": "build", "region": 9999, "facility": "no_such_thing", "levels": 1}}));
    actions.push(json!({"kind": "not_an_action"}));
    format!("Here are my orders.\n```json\n{}\n```", json!({"note": "Keeping a larger food reserve and following the first lead.", "delegate": ["economy", "education", "culture", "expansion", "military"], "actions": actions}))
}
