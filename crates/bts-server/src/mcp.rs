//! `bts mcp`: the game's MCP server over stdio, bound to one seat.
//!
//! The same two tools as `tools/mcp.mjs` (both read `tools/mcp-tools.json`), built
//! into the game binary so an agent seat needs nothing but the binary itself: no
//! Node.js, no checkout of the repository. The seat, its token and the referee's
//! address come from the environment (`BTS_URL`, `BTS_SEAT`, `BTS_SEAT_TOKEN`), so
//! the model can neither name another seat nor see the token. `BTS_MAX_CALLS`
//! (optional) caps the tool calls of one run: the cost guard of a consultation.
//!
//! All authority stays with the referee: this process only forwards `get_turn` and
//! `submit_turn` to `/api/turn` and passes the answers back.

use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::time::Duration;

pub const TOOLS_JSON: &str = include_str!("../../../tools/mcp-tools.json");
const PROTOCOLS: [&str; 4] = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
/// The line that separates a brief packet's briefing from its JSON part.
pub const PACKET_MARK: &str = "--- decision packet (JSON) ---";

#[derive(Clone, Debug)]
pub struct Binding {
    pub url: String,
    pub seat: u8,
    pub token: String,
    /// Tool calls allowed in this run; 0 means no limit.
    pub max_calls: u32,
}

impl Binding {
    pub fn from_env() -> Result<Binding, String> {
        let seat: u8 = std::env::var("BTS_SEAT").unwrap_or_else(|_| "0".into()).trim().parse().map_err(|_| "BTS_SEAT must be a seat number, 0 to 9".to_string())?;
        if seat > 9 {
            return Err("BTS_SEAT must be a seat number, 0 to 9".into());
        }
        Ok(Binding {
            url: std::env::var("BTS_URL").unwrap_or_else(|_| "http://127.0.0.1:7878".into()).trim_end_matches('/').to_string(),
            seat,
            token: std::env::var("BTS_SEAT_TOKEN").unwrap_or_default(),
            max_calls: std::env::var("BTS_MAX_CALLS").ok().and_then(|v| v.trim().parse().ok()).unwrap_or(0),
        })
    }
}

/// The tool definitions, parsed once.
pub fn tool_defs() -> Value {
    serde_json::from_str(TOOLS_JSON).expect("tools/mcp-tools.json is valid JSON")
}

/// A packet as the model reads it: a brief packet's briefing as plain text, then the
/// rest as JSON; anything else as JSON.
pub fn render(packet: &Value) -> String {
    if packet["view"] == "brief" {
        let mut rest = packet.clone();
        let text = rest.as_object_mut().and_then(|m| m.remove("briefing")).and_then(|b| b.as_str().map(str::to_string)).unwrap_or_default();
        if let Some(m) = rest.as_object_mut() {
            // the briefing lists the standing orders with their ids already
            m.remove("standing_orders");
        }
        return format!("{text}\n\n{PACKET_MARK}\n{rest}");
    }
    packet.to_string()
}

pub struct Server {
    pub binding: Binding,
    initialized: bool,
    calls: u32,
    tools: Value,
    instructions: String,
    info: Value,
}

impl Server {
    pub fn new(binding: Binding) -> Server {
        let defs = tool_defs();
        Server { binding, initialized: false, calls: 0, tools: defs["tools"].clone(), instructions: defs["instructions"].as_str().unwrap_or("").to_string(), info: defs["server"].clone() }
    }

    fn referee(&self, body: Option<Value>, view: &str, sections: &[String]) -> Value {
        let b = &self.binding;
        let result = match &body {
            None => {
                let mut url = format!("{}/api/turn?seat={}&token={}&view={}", b.url, b.seat, b.token, view);
                if !sections.is_empty() {
                    url += &format!("&sections={}", sections.join(","));
                }
                ureq::get(&url).timeout(Duration::from_secs(60)).call()
            }
            Some(body) => {
                let mut body = body.clone();
                body["seat"] = json!(b.seat);
                body["token"] = json!(b.token);
                ureq::post(&format!("{}/api/turn", b.url)).timeout(Duration::from_secs(180)).send_json(body)
            }
        };
        match result {
            Ok(resp) => match resp.into_json::<Value>() {
                Ok(v) => json!({ "content": [{ "type": "text", "text": render(&v) }] }),
                Err(e) => tool_error(&format!("the referee's answer could not be read: {e}")),
            },
            Err(ureq::Error::Status(code, resp)) => {
                let text = resp.into_string().unwrap_or_default();
                let hint = if code == 409 && text.contains("TURN_OVER") { " Stop now and reply with your note." } else if code == 409 && text.contains("STALE_TURN") { " Call get_turn again and submit with the new cursor." } else { "" };
                tool_error(&format!("The referee refused ({code}): {}{hint}", text.chars().take(1200).collect::<String>()))
            }
            Err(e) => tool_error(&format!("Referee request failed: {e}. If this was a submission, retry it with the same request_id and payload.")),
        }
    }

    /// Answer one JSON-RPC message; `None` for a notification.
    pub fn handle(&mut self, m: &Value) -> Option<Value> {
        let id = m.get("id").cloned();
        let error = |code: i64, message: &str| Some(json!({ "jsonrpc": "2.0", "id": id.clone().unwrap_or(Value::Null), "error": { "code": code, "message": message } }));
        if !m.is_object() || m["jsonrpc"] != "2.0" || !m["method"].is_string() {
            return error(-32600, "Invalid JSON-RPC request");
        }
        id.as_ref()?;
        let reply = |result: Value| Some(json!({ "jsonrpc": "2.0", "id": id.clone(), "result": result }));
        let method = m["method"].as_str().unwrap_or("");
        if method == "initialize" {
            self.initialized = true;
            let asked = m["params"]["protocolVersion"].as_str().unwrap_or("");
            let version = if PROTOCOLS.contains(&asked) { asked } else { "2025-06-18" };
            return reply(json!({ "protocolVersion": version, "capabilities": { "tools": {} }, "serverInfo": self.info, "instructions": self.instructions }));
        }
        if !self.initialized {
            return error(-32002, "Initialize the server first");
        }
        match method {
            "ping" => return reply(json!({})),
            "tools/list" => return reply(json!({ "tools": self.tools })),
            "tools/call" => {}
            _ => return error(-32601, "Method not found"),
        }
        let args = m["params"]["arguments"].clone();
        let args = if args.is_null() { json!({}) } else { args };
        let Some(obj) = args.as_object() else { return error(-32602, "arguments must be an object") };
        let name = m["params"]["name"].as_str().unwrap_or("");
        let view = |obj: &serde_json::Map<String, Value>| -> Result<String, ()> {
            match obj.get("view") {
                None | Some(Value::Null) => Ok("brief".into()),
                Some(Value::String(v)) if v == "brief" || v == "full" => Ok(v.clone()),
                _ => Err(()),
            }
        };
        let budget_spent = self.binding.max_calls > 0 && self.calls >= self.binding.max_calls;
        match name {
            "get_turn" => {
                if obj.keys().any(|k| k != "view" && k != "sections") {
                    return error(-32602, "get_turn takes only view and sections");
                }
                let Ok(v) = view(obj) else { return error(-32602, "view must be \"brief\" or \"full\"") };
                let sections: Vec<String> = match obj.get("sections") {
                    None | Some(Value::Null) => Vec::new(),
                    Some(Value::Array(list)) if list.len() <= 23 && list.iter().all(|x| x.as_str().is_some_and(|s| bts_host::SECTIONS.contains(&s))) => list.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
                    _ => return error(-32602, "sections must name parts of the observation"),
                };
                if budget_spent {
                    return reply(budget_error(self.binding.max_calls));
                }
                self.calls += 1;
                reply(self.referee(None, &v, &sections))
            }
            "submit_turn" => {
                let request_ok = obj.get("request_id").and_then(Value::as_str).is_some_and(|r| !r.is_empty() && r.len() <= 80 && r.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'));
                let actions_ok = obj.get("actions").and_then(Value::as_array).is_some_and(|a| a.len() <= 32 && a.iter().all(|x| x["kind"].is_string()));
                let advance = obj.get("advance").and_then(Value::as_str).unwrap_or("phase");
                if obj.keys().any(|k| !["cursor", "request_id", "actions", "advance", "view"].contains(&k.as_str())) || !obj.get("cursor").is_some_and(Value::is_string) || !request_ok || !actions_ok || !["none", "phase", "round"].contains(&advance) {
                    return error(-32602, "Invalid submission arguments");
                }
                let Ok(v) = view(obj) else { return error(-32602, "view must be \"brief\" or \"full\"") };
                if budget_spent {
                    return reply(budget_error(self.binding.max_calls));
                }
                self.calls += 1;
                let body = json!({ "cursor": obj["cursor"], "request_id": obj["request_id"], "actions": obj["actions"], "advance": advance, "view": v });
                reply(self.referee(Some(body), &v, &[]))
            }
            _ => error(-32602, "Unknown tool"),
        }
    }
}

fn tool_error(text: &str) -> Value {
    json!({ "isError": true, "content": [{ "type": "text", "text": text }] })
}

fn budget_error(max: u32) -> Value {
    tool_error(&format!("The tool-call budget of this consultation ({max} calls) is spent. Make no more calls: reply now with your note. Orders you already submitted stay applied."))
}

/// Run the server on stdin and stdout until stdin closes. Messages are handled one
/// at a time, in order: action order never depends on HTTP timing.
pub fn run() -> Result<(), String> {
    let mut server = Server::new(Binding::from_env()?);
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(m) => server.handle(&m),
            Err(_) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error" } })),
        };
        if let Some(r) = response {
            if writeln!(out, "{r}").and_then(|_| out.flush()).is_err() {
                break;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rpc(s: &mut Server, method: &str, params: Value) -> Value {
        s.handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })).unwrap()
    }

    #[test]
    fn the_server_lists_two_tools_and_validates_before_calling_the_referee() {
        // an address nothing listens on: any request that reached the network would fail loudly
        let mut s = Server::new(Binding { url: "http://127.0.0.1:9".into(), seat: 2, token: "t".into(), max_calls: 2 });
        assert_eq!(rpc(&mut s, "tools/list", json!({}))["error"]["code"], -32002);
        assert_eq!(rpc(&mut s, "initialize", json!({ "protocolVersion": "2025-06-18" }))["result"]["protocolVersion"], "2025-06-18");
        assert!(s.handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none());
        let tools = rpc(&mut s, "tools/list", json!({}));
        let names: Vec<&str> = tools["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["get_turn", "submit_turn"]);
        let bad = |s: &mut Server, args: Value| rpc(s, "tools/call", json!({ "name": "submit_turn", "arguments": args }))["error"]["code"].clone();
        let ok = json!({ "cursor": "c", "request_id": "r1", "actions": [] });
        assert_eq!(bad(&mut s, json!({ "cursor": "c", "request_id": "r1", "actions": [], "seat": 1 })), -32602, "the seat is not the model's to choose");
        assert_eq!(bad(&mut s, json!({ "cursor": "c", "request_id": "r1", "actions": [], "token": "x" })), -32602);
        assert_eq!(bad(&mut s, json!({ "cursor": "c", "request_id": "bad id!", "actions": [] })), -32602);
        assert_eq!(bad(&mut s, json!({ "cursor": "c", "request_id": "r1", "actions": vec![json!({"kind":"x"}); 33] })), -32602);
        assert_eq!(bad(&mut s, json!({ "cursor": "c", "request_id": "r1", "actions": [], "advance": "forever" })), -32602);
        assert_eq!(rpc(&mut s, "tools/call", json!({ "name": "spectate", "arguments": {} }))["error"]["code"], -32602);
        assert_eq!(rpc(&mut s, "tools/call", json!({ "name": "get_turn", "arguments": { "sections": ["spectator"] } }))["error"]["code"], -32602);
        // the call budget: two calls reach the referee (and fail, nothing listens), the third is refused here
        for _ in 0..2 {
            let r = rpc(&mut s, "tools/call", json!({ "name": "submit_turn", "arguments": ok }));
            assert_eq!(r["result"]["isError"], true);
            assert!(r["result"]["content"][0]["text"].as_str().unwrap().contains("Referee request failed"));
        }
        let spent = rpc(&mut s, "tools/call", json!({ "name": "get_turn", "arguments": {} }));
        assert!(spent["result"]["content"][0]["text"].as_str().unwrap().contains("budget"));
    }

    #[test]
    fn a_brief_packet_reads_as_text_first() {
        let p = json!({ "view": "brief", "briefing": "AD 1 — round 3", "cursor": "abc", "standing_orders": [1, 2] });
        let text = render(&p);
        assert!(text.starts_with("AD 1 — round 3"));
        let json: Value = serde_json::from_str(text.split(PACKET_MARK).nth(1).unwrap().trim()).unwrap();
        assert_eq!(json["cursor"], "abc");
        assert!(json.get("standing_orders").is_none() && json.get("briefing").is_none());
    }

    #[test]
    fn the_tool_schema_names_every_section_the_referee_accepts() {
        let defs = tool_defs();
        let listed: Vec<&str> = defs["tools"][0]["inputSchema"]["properties"]["sections"]["items"]["enum"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
        assert_eq!(listed, bts_host::SECTIONS);
    }
}
