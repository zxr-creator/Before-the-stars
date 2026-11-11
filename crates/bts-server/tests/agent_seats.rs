//! Agent seats end to end, through the real binary: a referee on a free port, an
//! agent seat played by the scripted mock agent through `bts mcp` (the same MCP
//! server process a Claude Code or Codex seat starts), and a one-shot mock seat.
//! No model is called.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

struct Referee {
    child: Child,
    url: String,
    _dir: std::path::PathBuf,
}

impl Drop for Referee {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self._dir);
    }
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

fn start() -> Referee {
    let port = free_port();
    let dir = std::env::temp_dir().join(format!("bts-agent-e2e-{}-{port}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let child = Command::new(env!("CARGO_BIN_EXE_bts"))
        .args(["serve", "--port", &port.to_string(), "--fresh", "--saves"])
        .arg(&dir)
        .env("BTS_NO_BROWSER", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let url = format!("http://127.0.0.1:{port}");
    let started = Instant::now();
    while ureq::get(&format!("{url}/api/health")).call().is_err() {
        assert!(started.elapsed() < Duration::from_secs(20), "the referee did not start");
        std::thread::sleep(Duration::from_millis(100));
    }
    Referee { child, url, _dir: dir }
}

fn get(r: &Referee, path: &str) -> Value {
    match ureq::get(&format!("{}{path}", r.url)).call() {
        Ok(resp) => resp.into_json().unwrap(),
        Err(ureq::Error::Status(_, resp)) => resp.into_json().unwrap(),
        Err(e) => panic!("{e}"),
    }
}

fn post(r: &Referee, path: &str, body: Value) -> (u16, Value) {
    match ureq::post(&format!("{}{path}", r.url)).send_json(body) {
        Ok(resp) => (resp.status(), resp.into_json().unwrap()),
        Err(ureq::Error::Status(code, resp)) => (code, resp.into_json().unwrap_or(Value::Null)),
        Err(e) => panic!("{e}"),
    }
}

#[test]
fn a_mock_agent_plays_through_the_mcp_server_and_a_mock_api_seat_by_briefing() {
    let r = start();
    let (code, made) = post(&r, "/api/match", json!({ "seed": "agent-e2e", "regions": 30, "calendar": "quick", "controllers": ["mock-agent", "mock", "medium"], "agent_options": { "0": { "max_calls": 6, "budget_seconds": 60 } } }));
    assert_eq!(code, 200, "{made}");
    assert_eq!(made["seats"][0]["agent"]["mode"], "agent");
    assert_eq!(made["seats"][1]["agent"]["mode"], "oneshot");
    // nobody outside plays: the observer moves the match
    post(&r, "/api/advance", json!({ "rounds": 3 }));
    let started = Instant::now();
    let summary = loop {
        let m = get(&r, "/api/match");
        // an agent's last submission resolves the round before its worker records the call
        if m["round"].as_u64().unwrap_or(0) >= 4 && (0..2).all(|s| m["seats"][s]["agent"]["state"] == "idle") {
            break m;
        }
        assert!(started.elapsed() < Duration::from_secs(120), "the agent seats did not play three rounds: {m}");
        std::thread::sleep(Duration::from_millis(200));
    };
    for seat in [0, 1] {
        let agent = &summary["seats"][seat]["agent"];
        assert_eq!(agent["errors_in_row"], 0, "{agent}");
        assert!(agent["calls"].as_u64().unwrap() >= 3, "{agent}");
        // both delegated everything but research to the steward
        assert_eq!(summary["seats"][seat]["delegates"], json!(["economy", "education", "culture", "expansion", "military"]));
    }
    let log = get(&r, "/api/agent-log?seat=0");
    let first = &log["entries"][0];
    assert_eq!(first["phase"], "plan");
    assert_eq!(first["error"], Value::Null, "{first}");
    assert_eq!(first["tool_calls"], 3, "get_turn and two submissions: {first}");
    // the agent's own orders, as the referee recorded them: two accepted, the impossible build refused
    assert_eq!(first["rejected"], 1, "{first}");
    assert!(first["accepted"].as_u64().unwrap() >= 2, "{first}");
    assert!(first["actions"].as_array().unwrap().iter().any(|a| a == "directive"));
    assert!(first["note"].as_str().unwrap().starts_with("Mock agent"));
}

#[test]
fn the_mcp_server_refuses_a_driven_seat_without_its_live_token_and_reaches_an_external_seat_with_its_own() {
    let r = start();
    let (_, made) = post(&r, "/api/match", json!({ "seed": "mcp-e2e", "regions": 30, "calendar": "quick", "controllers": ["external", "mock-agent", "medium"] }));
    let token = made["seats"][0]["token"].as_str().unwrap().to_string();
    let mcp = |seat: &str, token: &str, calls: &[Value]| -> Vec<Value> {
        let mut child = Command::new(env!("CARGO_BIN_EXE_bts")).arg("mcp").env("BTS_URL", &r.url).env("BTS_SEAT", seat).env("BTS_SEAT_TOKEN", token).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        let mut stdin = child.stdin.take().unwrap();
        let mut out = BufReader::new(child.stdout.take().unwrap()).lines();
        let mut replies = Vec::new();
        for (i, c) in std::iter::once(json!({ "method": "initialize", "params": { "protocolVersion": "2025-06-18" } })).chain(calls.iter().cloned()).enumerate() {
            let mut m = c.clone();
            m["jsonrpc"] = json!("2.0");
            m["id"] = json!(i + 1);
            writeln!(stdin, "{m}").unwrap();
            replies.push(serde_json::from_str::<Value>(&out.next().unwrap().unwrap()).unwrap());
        }
        drop(stdin);
        let _ = child.wait();
        replies
    };
    let get_turn = json!({ "method": "tools/call", "params": { "name": "get_turn", "arguments": {} } });
    // the external seat (an agent you run yourself) plays with its seat token
    let own = mcp("0", &token, &[get_turn.clone()]);
    let text = own[1]["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("STANDING ORDERS") && text.contains("--- decision packet (JSON) ---"), "{text}");
    // the seat the referee's own agent plays is closed to anyone else, whatever token they try
    for guess in [token.as_str(), "", "0000000000000000"] {
        let other = mcp("1", guess, &[get_turn.clone()]);
        assert_eq!(other[1]["result"]["isError"], true);
        assert!(other[1]["result"]["content"][0]["text"].as_str().unwrap().contains("403"));
    }
    // a section of the full observation is available by name
    let part = mcp("0", &token, &[json!({ "method": "tools/call", "params": { "name": "get_turn", "arguments": { "view": "full", "sections": ["directives"] } } })]);
    let packet: Value = serde_json::from_str(part[1]["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert!(packet["observation"].get("directives").is_some() && packet["observation"].get("regions").is_none());
}
