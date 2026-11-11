//! The host's rules, exercised through `Host::handle` exactly as a transport would.
//!
//! The observer rule is the important one: the whole-world view, another seat's own
//! view and playback control exist only for a match nobody outside the referee plays.

use crate::referee::*;
use crate::session::AgentConfig;
use serde_json::{json, Value};

/// A transport that can run agent seats, reduced to what the host sees of it.
struct StubAgent;

impl AgentSlot for StubAgent {
    fn provider(name: &str) -> Option<AgentProvider> {
        (name == "claude-api").then_some(AgentProvider { key: "claude-api", default_model: "stub-model" })
    }
    fn new(_: &AgentConfig) -> Option<StubAgent> {
        Some(StubAgent)
    }
    fn summary(&self) -> AgentSummary {
        AgentSummary { provider: "claude-api".into(), model: "stub-model".into(), consult_every: 1, state: "idle".into(), last_note: String::new(), calls: 0, last_error: None, thinking_seconds: None }
    }
    fn log(&self) -> Value {
        json!([{ "note": "what this seat privately intends" }])
    }
}

struct Out {
    status: u16,
    body: Value,
    text: String,
    effects: Effects,
}

fn call<A: AgentSlot>(h: &mut Host<A>, method: &str, target: &str, body: Value) -> Out {
    let text = if body.is_null() { String::new() } else { body.to_string() };
    let r = h.handle(&Request { method, target, body: &text, entropy: 7 });
    Out { status: r.status, body: serde_json::from_str(&r.body).unwrap_or(Value::Null), text: r.body, effects: r.effects }
}

fn get<A: AgentSlot>(h: &mut Host<A>, target: &str) -> Out {
    call(h, "GET", target, Value::Null)
}

fn post<A: AgentSlot>(h: &mut Host<A>, target: &str, body: Value) -> Out {
    call(h, "POST", target, body)
}

const SERVER: Config = Config { require_tokens: false, app_mode: false, settle_inline: true };
const BROWSER: Config = Config { require_tokens: false, app_mode: false, settle_inline: false };

fn new_match<A: AgentSlot>(cfg: Config, controllers: [&str; 4]) -> Host<A> {
    let mut h = Host::new(cfg);
    let out = post(&mut h, "/api/match", json!({ "seed": "host-rules", "regions": 24, "controllers": controllers }));
    assert_eq!(out.status, 200, "{}", out.text);
    assert!(out.effects.installed && out.effects.changed);
    h
}

fn hash<A: AgentSlot>(h: &Host<A>) -> u64 {
    h.session.as_ref().unwrap().m.state_hash()
}

/// Keys that exist only in the referee-level spectator view.
const SPECTATOR_ONLY: [&str; 4] = ["civs", "events", "test_nodes", "spectator"];

/// Everything observer-only is refused, for every seat number, and nothing moved.
fn assert_observer_closed<A: AgentSlot>(h: &mut Host<A>, native_seats: &[u8]) {
    let before = hash(h);
    let round = h.session.as_ref().unwrap().m.round();
    assert!(!h.observer_open());
    let s = get(h, "/api/spectator");
    assert_eq!((s.status, s.body["error"].as_str()), (403, Some("UNAUTHORIZED")));
    assert!(s.body.get("regions").is_none() && s.body.get("civs").is_none());
    for rounds in [0, 1, 20] {
        let a = post(h, "/api/advance", json!({ "rounds": rounds }));
        assert_eq!(a.status, 403, "advance {rounds} must be refused");
        assert_eq!(a.effects, Effects::default());
    }
    for &seat in native_seats {
        for target in [format!("/api/observation?seat={seat}"), format!("/api/turn?seat={seat}"), format!("/api/export/chronicle?seat={seat}&format=json"), format!("/api/export/chronicle?seat={seat}")] {
            let o = get(h, &target);
            assert_eq!(o.status, 403, "{target} must be refused");
            assert!(!o.text.contains("\"civ\""), "{target} leaked an observation");
        }
    }
    assert_eq!(hash(h), before);
    assert_eq!(h.session.as_ref().unwrap().m.round(), round);
    assert_eq!(h.autoplay_until, u32::MAX, "a match somebody plays never waits for an observer");
}

#[test]
fn a_match_with_a_human_seat_refuses_every_observer_privilege() {
    for cfg in [SERVER, BROWSER] {
        let mut h: Host = new_match(cfg, ["human", "easy", "medium", "hard"]);
        assert_eq!(get(&mut h, "/api/match").body["observer_allowed"], false);
        assert_observer_closed(&mut h, &[1, 2, 3]);
        // the human's own seat stays readable and playable
        assert_eq!(get(&mut h, "/api/observation?seat=0").status, 200);
        assert_eq!(get(&mut h, "/api/turn?seat=0").status, 200);
    }
}

#[test]
fn a_match_with_an_external_seat_refuses_every_observer_privilege() {
    for cfg in [SERVER, BROWSER] {
        let mut h: Host = new_match(cfg, ["external", "easy", "medium", "hard"]);
        assert_eq!(get(&mut h, "/api/match").body["observer_allowed"], false);
        assert_observer_closed(&mut h, &[1, 2, 3]);
        assert_eq!(get(&mut h, "/api/turn?seat=0").status, 200);
    }
    // two outside seats may not read each other through the observer door either
    let mut h: Host = new_match(SERVER, ["external", "human", "medium", "hard"]);
    assert_observer_closed(&mut h, &[2, 3]);
}

#[test]
fn a_seat_view_and_its_turn_packet_never_contain_spectator_fields() {
    let mut h: Host = new_match(SERVER, ["human", "easy", "medium", "hard"]);
    // play a few rounds so there is something to leak
    for _ in 0..3 {
        assert_eq!(post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true })).status, 200);
    }
    // what the referee knows (taken directly, not through any request)
    let whole = serde_json::to_value(h.session.as_ref().unwrap().m.spectate()).unwrap();
    let all_regions = whole["regions"].as_array().unwrap().len();
    assert!(whole["civs"].as_array().unwrap().len() == 4 && all_regions == 24);

    let obs = get(&mut h, "/api/observation?seat=0");
    assert_eq!(obs.status, 200);
    let packet = get(&mut h, "/api/turn?seat=0");
    assert_eq!(packet.status, 200);
    let o = obs.body.as_object().unwrap();
    for key in SPECTATOR_ONLY {
        assert!(!o.contains_key(key), "observation has spectator field {key}");
        assert!(!packet.body.as_object().unwrap().contains_key(key), "turn packet has spectator field {key}");
    }
    assert_eq!(obs.body["seat"], 0);
    let seen = obs.body["regions"].as_array().unwrap();
    assert!(seen.len() < all_regions, "fog of war: the seat sees {} of {} regions", seen.len(), all_regions);
    for r in seen {
        if r["owner"] != json!(0) {
            assert!(r["own"].is_null(), "region {} carries another owner's ledger", r["id"]);
        }
    }
    // the packet is the same permission-filtered observation plus bookkeeping, nothing more
    let mut keys: Vec<&str> = packet.body.as_object().unwrap().keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["action_reference", "cursor", "limits", "next", "observation", "receipts", "round_advanced", "submitted", "waiting_for"]);
    assert_eq!(packet.body["observation"], obs.body);
    // a submission's reply is held to the same shape
    let cursor = packet.body["cursor"].as_str().unwrap();
    let reply = post(&mut h, "/api/turn", json!({ "seat": 0, "request_id": "r1", "cursor": cursor, "actions": [], "advance": "round" }));
    assert_eq!(reply.status, 200, "{}", reply.text);
    let mut keys: Vec<&str> = reply.body.as_object().unwrap().keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["action_reference", "cursor", "limits", "next", "observation", "receipts", "round_advanced", "submitted", "waiting_for"]);
    assert_eq!(reply.body["observation"]["seat"], 0);
    // and the match summary names no seed secret and no token of a native seat
    let m = get(&mut h, "/api/match");
    for seat in 1..4 {
        assert!(m.body["seats"][seat].get("token").is_none());
    }
}

#[test]
fn an_all_native_match_opens_the_observer_view() {
    let mut h: Host = new_match(SERVER, ["easy", "medium", "medium", "hard"]);
    assert!(h.unattended() && h.observer_open());
    let m = get(&mut h, "/api/match");
    assert_eq!(m.body["observer_allowed"], true);
    assert_eq!(m.body["autoplay_until"], 1, "nothing advances until asked");
    let s = get(&mut h, "/api/spectator");
    assert_eq!(s.status, 200);
    assert_eq!(s.body["civs"].as_array().unwrap().len(), 4);
    assert_eq!(s.body["regions"].as_array().unwrap().len(), 24);
    for seat in 0..4 {
        let o = get(&mut h, &format!("/api/observation?seat={seat}"));
        assert_eq!((o.status, &o.body["seat"]), (200, &json!(seat)));
        assert_eq!(get(&mut h, &format!("/api/turn?seat={seat}")).status, 200);
        assert_eq!(get(&mut h, &format!("/api/export/chronicle?seat={seat}&format=json")).status, 200);
    }
    let a = post(&mut h, "/api/advance", json!({ "rounds": 2 }));
    assert_eq!(a.status, 200);
    assert_eq!(a.body["round"], 3);
    assert!(a.effects.autosave && a.effects.changed);
    // watching is not playing: a driven seat takes no orders, whoever asks
    for seat in 0..4 {
        assert_eq!(post(&mut h, "/api/actions", json!({ "seat": seat, "actions": [] })).status, 403);
        assert_eq!(post(&mut h, "/api/ready", json!({ "seat": seat, "through_round": true })).status, 403);
        assert_eq!(post(&mut h, "/api/delegate", json!({ "seat": seat, "domains": [] })).status, 403);
        assert_eq!(post(&mut h, "/api/turn", json!({ "seat": seat, "request_id": "x", "cursor": "c", "actions": [] })).status, 403);
    }
}

#[test]
fn requiring_tokens_closes_the_observer_view_even_with_no_outside_seat() {
    let mut h: Host = new_match(Config { require_tokens: true, ..SERVER }, ["easy", "medium", "medium", "hard"]);
    assert!(h.unattended() && !h.observer_open());
    assert_eq!(get(&mut h, "/api/spectator").status, 403);
    assert_eq!(post(&mut h, "/api/advance", json!({ "rounds": 1 })).status, 403);
    let token = h.session.as_ref().unwrap().tokens[1].clone();
    for target in [format!("/api/observation?seat=1&token={token}"), format!("/api/turn?seat=1&token={token}"), format!("/api/export/chronicle?seat=1&token={token}")] {
        assert_eq!(get(&mut h, &target).status, 403, "{target}");
    }
    assert_eq!(get(&mut h, "/api/session/export").status, 403);
}

#[test]
fn tokens_guard_outside_seats_when_required() {
    let mut h: Host = Host::new(Config { require_tokens: true, ..SERVER });
    let created = post(&mut h, "/api/match", json!({ "regions": 24, "controllers": ["human", "external", "easy", "easy"] }));
    let t0 = created.body["seats"][0]["token"].as_str().unwrap().to_string();
    let t1 = created.body["seats"][1]["token"].as_str().unwrap().to_string();
    assert!(created.body["seats"][2].get("token").is_none());
    // later summaries do not repeat the tokens
    assert!(get(&mut h, "/api/match").body["seats"][0].get("token").is_none());
    assert_eq!(get(&mut h, "/api/observation?seat=0").status, 403);
    assert_eq!(get(&mut h, &format!("/api/observation?seat=0&token={t1}")).status, 403, "another seat's token opens nothing");
    assert_eq!(get(&mut h, &format!("/api/observation?seat=0&token={t0}")).status, 200);
    assert_eq!(post(&mut h, "/api/actions", json!({ "seat": 1, "token": t0, "actions": [] })).status, 403);
    assert_eq!(post(&mut h, "/api/actions", json!({ "seat": 1, "token": t1, "actions": [] })).status, 200);
    assert_eq!(get(&mut h, "/api/observation?seat=9").status, 403);
}

#[test]
fn agent_seats_keep_the_observer_view_open_but_never_beside_an_outside_seat() {
    // every seat is played inside the referee's process: an AI-only match
    let mut h: Host<StubAgent> = new_match(SERVER, ["claude-api", "claude-api", "medium", "hard"]);
    assert!(h.observer_open());
    let m = get(&mut h, "/api/match");
    assert_eq!(m.body["seats"][0]["controller"], "external");
    assert_eq!(m.body["seats"][0]["agent"]["model"], "stub-model");
    assert_eq!(m.body["seats"][0]["delegates"].as_array().unwrap().len(), 6, "the steward starts with every domain");
    assert_eq!(get(&mut h, "/api/spectator").status, 200);
    assert_eq!(get(&mut h, "/api/observation?seat=0").status, 200);
    assert_eq!(get(&mut h, "/api/agent-log?seat=0").body["entries"][0]["note"], "what this seat privately intends");
    // the worker plays the seat; nobody else may
    assert_eq!(post(&mut h, "/api/actions", json!({ "seat": 0, "actions": [] })).status, 403);
    assert_eq!(post(&mut h, "/api/turn", json!({ "seat": 0, "request_id": "x", "cursor": "c", "actions": [] })).status, 403);
    // with model seats the match moves as they answer: advance only records how far
    let a = post(&mut h, "/api/advance", json!({ "rounds": 3 }));
    assert_eq!((a.status, &a.body["round"], &a.body["autoplay_until"]), (200, &json!(1), &json!(4)));
    assert!(!a.effects.autosave);
    assert!(h.may_run());
    assert!(!h.pending(), "deferred playback never steps a match that waits on agent workers");
    assert_eq!(post(&mut h, "/api/advance", json!({ "rounds": 0 })).body["autoplay_until"], 1);
    assert!(!h.may_run());

    // a person joins: the agent's log and view close with everything else
    let mut h: Host<StubAgent> = new_match(SERVER, ["human", "claude-api", "medium", "hard"]);
    assert_observer_closed(&mut h, &[1, 2, 3]);
    let log = get(&mut h, "/api/agent-log?seat=1");
    assert_eq!(log.status, 403);
    assert!(!log.text.contains("privately"));
    assert!(h.may_run());
    // so does an external seat that speaks the API itself
    let mut h: Host<StubAgent> = new_match(SERVER, ["external", "claude-api", "medium", "hard"]);
    assert_observer_closed(&mut h, &[1, 2, 3]);
    assert_eq!(get(&mut h, "/api/agent-log?seat=1").status, 403);
}

#[test]
fn a_host_without_agent_workers_refuses_agent_seats_by_name() {
    let mut h: Host = Host::new(BROWSER);
    for name in AGENT_CONTROLLERS {
        let out = post(&mut h, "/api/match", json!({ "controllers": ["human", name, "easy", "easy"] }));
        assert_eq!((out.status, out.body["error"].as_str()), (400, Some("INVALID_SCHEMA")));
        assert!(out.body["message"].as_str().unwrap().contains("server-backed"), "{}", out.text);
        assert!(h.session.is_none());
    }
    assert_eq!(post(&mut h, "/api/match", json!({ "controllers": ["human", "wizard", "easy", "easy"] })).body["message"], "unknown controller 'wizard'");
    assert_eq!(get(&mut h, "/api/agent-log?seat=1").text, "{\"entries\":[]}");
    assert_eq!(post(&mut h, "/api/shutdown", json!({})).status, 403);
    // a save made by a server with an agent seat cannot be resumed here, and says why
    let mut server: Host<StubAgent> = new_match(SERVER, ["human", "claude-api", "medium", "hard"]);
    let save = get(&mut server, "/api/session/export");
    assert_eq!(save.status, 200);
    let refused = h.handle(&Request { method: "POST", target: "/api/session/import", body: &save.text, entropy: 1 });
    assert_eq!(refused.status, 400);
    assert!(refused.body.contains("LLM agent seat"));
    assert!(h.session.is_none());
}

#[test]
fn new_match_requests_are_validated() {
    let mut h: Host = Host::new(SERVER);
    assert_eq!(get(&mut h, "/api/match").body, json!({ "exists": false, "app_mode": false }));
    assert_eq!(get(&mut h, "/api/observation?seat=0").status, 404);
    assert_eq!(get(&mut h, "/api/spectator").status, 404);
    assert_eq!(post(&mut h, "/api/advance", json!({})).status, 404);
    assert_eq!(get(&mut h, "/api/session/export").status, 404);
    for (body, needle) in [
        (json!({ "regions": 31 }), "regions must be"),
        (json!({ "horizon": 100 }), "horizon must be"),
        (json!({ "controllers": ["human"] }), "take 2 to 5 civilizations"),
        (json!({ "regions": 200, "controllers": ["human", "easy", "easy"] }), "Huge maps take 6 to 10"),
        (json!({ "regions": 30, "controllers": ["human", "easy", "easy", "easy"] }), "Small maps take 2 to 3"),
        (json!({ "regions": "many" }), "invalid type"),
    ] {
        let out = post(&mut h, "/api/match", body);
        assert_eq!(out.status, 400);
        assert!(out.body["message"].as_str().unwrap().contains(needle), "{}", out.text);
    }
    assert!(h.session.is_none());
    assert_eq!(get(&mut h, "/api/nothing").status, 404);
    assert_eq!(get(&mut h, "/api/health").text, "{\"ok\":true}");
    // an empty body is the default match
    let r = h.handle(&Request { method: "POST", target: "/api/match", body: "", entropy: 3 });
    assert_eq!(r.status, 200);
    // two to ten seats within the preset's range (design chapter 40, section 2.2)
    let ten = post(&mut h, "/api/match", json!({ "regions": 200, "controllers": ["human", "easy", "easy", "easy", "easy", "medium", "medium", "medium", "hard", "hard"] }));
    assert_eq!(ten.status, 200, "{}", ten.text);
    assert_eq!(ten.body["seats"].as_array().unwrap().len(), 10);
    let two = post(&mut h, "/api/match", json!({ "regions": 30, "controllers": ["human", "hard"] }));
    assert_eq!(two.status, 200, "{}", two.text);
    assert_eq!(two.body["seats"].as_array().unwrap().len(), 2);
}

#[test]
fn a_human_round_reports_where_the_referee_autosaves() {
    let mut h: Host = new_match(BROWSER, ["human", "easy", "medium", "hard"]);
    let obs = get(&mut h, "/api/observation?seat=0");
    let capital = obs.body["civ"]["capital"].clone();
    let acted = post(&mut h, "/api/actions", json!({ "seat": 0, "actions": [{ "kind": "start_project", "spec": { "kind": "survey", "region": capital }, "priority": 5 }] }));
    assert_eq!(acted.status, 200, "{}", acted.text);
    assert_eq!(acted.effects, Effects { changed: true, ..Default::default() });
    let too_many: Vec<Value> = (0..33).map(|_| json!({ "kind": "forfeit" })).collect();
    assert_eq!(post(&mut h, "/api/actions", json!({ "seat": 0, "actions": too_many })).body["error"], "RATE_LIMITED");
    assert_eq!(post(&mut h, "/api/actions", json!({ "seat": 0, "actions": [{ "kind": "no_such_action" }] })).status, 400);
    let phase = post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": false }));
    assert_eq!((phase.status, &phase.body["round"]), (200, &json!(1)));
    assert!(phase.effects.changed && !phase.effects.autosave, "a phase inside the round is not an autosave point");
    let round = post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true }));
    assert_eq!(round.body["round"], 2);
    assert!(round.effects.autosave);
    assert_eq!(round.body["waiting_on"], json!([0]), "the native seats have moved; the referee waits for the person");
    let d = post(&mut h, "/api/delegate", json!({ "seat": 0, "domains": ["economy", "not-a-domain"] }));
    assert_eq!(d.body["seats"][0]["delegates"], json!(["economy"]));
    let md = h.handle(&Request { method: "GET", target: "/api/export/chronicle?seat=0", body: "", entropy: 0 });
    assert_eq!(md.kind, Body::Markdown);
    assert!(md.body.starts_with("# Chronicle of "));
}

#[test]
fn deferred_playback_takes_the_same_steps_as_settling_inline() {
    let mut inline: Host = new_match(SERVER, ["easy", "medium", "medium", "hard"]);
    let mut deferred: Host = new_match(BROWSER, ["easy", "medium", "medium", "hard"]);
    assert_eq!(hash(&inline), hash(&deferred));
    assert_eq!(post(&mut inline, "/api/advance", json!({ "rounds": 5 })).body["round"], 6);

    assert!(!deferred.pending());
    let a = post(&mut deferred, "/api/advance", json!({ "rounds": 5 }));
    assert_eq!((&a.body["round"], &a.body["autoplay_until"]), (&json!(1), &json!(6)), "the request answers before anything is resolved");
    assert!(!a.effects.autosave);
    let (mut steps, mut rounds) = (0, 0);
    while deferred.pending() {
        let t = deferred.tick();
        assert!(t.stepped);
        steps += 1;
        rounds += t.round_completed as u32;
        assert!(steps < 1000);
    }
    assert_eq!(rounds, 5);
    assert!(steps > rounds, "a round is several host steps, so a transport can breathe between them");
    assert_eq!(get(&mut deferred, "/api/match").body["round"], 6);
    assert_eq!(hash(&inline), hash(&deferred), "both ways of running reach the same world");
    assert_eq!(deferred.tick(), Tick::default());
}

#[test]
fn pausing_deferred_playback_finishes_the_round_in_hand_and_stops() {
    let mut h: Host = new_match(BROWSER, ["easy", "medium", "medium", "hard"]);
    post(&mut h, "/api/advance", json!({ "rounds": 20 }));
    // run into the middle of round 3
    while h.session.as_ref().unwrap().m.round() < 3 {
        h.tick();
    }
    assert!(h.tick().stepped);
    assert_ne!(get(&mut h, "/api/match").body["phase"], "contact", "the pause arrives mid-round");
    let paused = post(&mut h, "/api/advance", json!({ "rounds": 0 }));
    assert_eq!(paused.body["autoplay_until"], 3);
    while h.pending() {
        h.tick();
    }
    let m = get(&mut h, "/api/match");
    assert_eq!((&m.body["round"], &m.body["phase"]), (&json!(4), &json!("contact")), "the match rests at the start of a round");
    assert_eq!(h.tick(), Tick::default());
    // one step is exactly one round
    post(&mut h, "/api/advance", json!({ "rounds": 1 }));
    while h.pending() {
        h.tick();
    }
    assert_eq!(get(&mut h, "/api/match").body["round"], 5);
}

#[test]
fn a_session_round_trips_as_text_and_a_bad_import_changes_nothing() {
    let mut h: Host = new_match(BROWSER, ["human", "easy", "medium", "hard"]);
    for _ in 0..2 {
        post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true }));
    }
    let exported = get(&mut h, "/api/session/export");
    assert_eq!(exported.status, 200);
    assert_eq!(exported.body["format"], crate::SAVE_FORMAT);
    assert_eq!(exported.effects, Effects::default());
    let (before, generation, id) = (hash(&h), h.generation, h.session.as_ref().unwrap().m.match_id().to_string());

    // every kind of bad save is refused before the running match is touched
    let mut wrong_format = exported.body.clone();
    wrong_format["format"] = json!("bts-save/999");
    let mut no_world = exported.body.clone();
    no_world["world"] = json!("{\"not\":\"a world\"}");
    let mut short = exported.body.clone();
    short["ais"] = json!([null]);
    let mut headless = exported.body.clone();
    headless["ais"] = json!([null, null, null, null]);
    // a world that parses but contradicts itself: most of its regions are gone
    let mut world: Value = serde_json::from_str(exported.body["world"].as_str().unwrap()).unwrap();
    let regions = world.as_object_mut().unwrap().values_mut().find(|v| v.as_array().is_some_and(|a| a.len() == 24)).expect("the world lists its 24 regions");
    regions.as_array_mut().unwrap().truncate(3);
    let mut unplayable = exported.body.clone();
    unplayable["world"] = json!(world.to_string());
    let unplayable = unplayable.to_string();
    let r = h.handle(&Request { method: "POST", target: "/api/session/import", body: &unplayable, entropy: 9 });
    assert!(r.body.contains("cannot be played"), "{}", r.body);
    for bad in [String::new(), "not json".into(), "{}".into(), exported.text[..exported.text.len() / 2].to_string(), wrong_format.to_string(), no_world.to_string(), short.to_string(), headless.to_string(), unplayable] {
        let r = h.handle(&Request { method: "POST", target: "/api/session/import", body: &bad, entropy: 9 });
        assert_eq!(r.status, 400, "accepted a bad save: {:.60}", bad);
        assert!(r.body.contains("INVALID_SAVE"));
        assert_eq!(r.effects, Effects::default());
        assert_eq!((hash(&h), h.generation), (before, generation), "the match changed after a refused import");
        assert_eq!(h.session.as_ref().unwrap().m.match_id(), id);
    }

    // a good one replaces the match, in this host or a fresh one, and plays on identically
    post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true }));
    let later = hash(&h);
    let mut other: Host = Host::new(BROWSER);
    for host in [&mut h, &mut other] {
        let r = host.handle(&Request { method: "POST", target: "/api/session/import", body: &exported.text, entropy: 9 });
        assert_eq!(r.status, 200, "{}", r.body);
        assert!(r.effects.installed && r.effects.changed);
        let summary: Value = serde_json::from_str(&r.body).unwrap();
        assert_eq!((&summary["match_id"], &summary["round"]), (&json!(id), &json!(3)));
        assert_eq!(hash(host), before);
        // the human seat is still a human seat: importing opens no observer door
        assert_eq!(get(host, "/api/spectator").status, 403);
        post(host, "/api/ready", json!({ "seat": 0, "through_round": true }));
        assert_eq!(hash(host), later, "a restored match continues exactly as the original did");
    }
    assert_eq!(h.generation, generation + 1);
}

#[test]
fn a_session_never_leaves_a_referee_with_an_external_seat() {
    let mut h: Host = new_match(SERVER, ["external", "easy", "medium", "hard"]);
    let out = get(&mut h, "/api/session/export");
    assert_eq!(out.status, 403);
    assert!(!out.text.contains("world"));
    let mut observed: Host = new_match(SERVER, ["easy", "easy", "medium", "hard"]);
    assert_eq!(get(&mut observed, "/api/session/export").status, 200);
}

// ---- save files ---------------------------------------------------------------------

use crate::portable::{self, Kind, Limits, Meta, PREFIX};

struct Bin {
    status: u16,
    kind: Body,
    data: Vec<u8>,
    body: Value,
    effects: Effects,
}

fn bytes_call<A: AgentSlot>(h: &mut Host<A>, method: &str, target: &str, body: &[u8]) -> Bin {
    let r = h.handle_bytes(method, target, body, 7);
    Bin { status: r.status, kind: r.kind, body: serde_json::from_str(&r.body).unwrap_or(Value::Null), data: r.data, effects: r.effects }
}

/// Everything about a host's match that an import could disturb.
fn fingerprint<A: AgentSlot>(h: &Host<A>) -> (u64, u64, String, u32, String) {
    let s = h.session.as_ref().unwrap();
    (s.m.state_hash(), h.generation, s.m.match_id().to_string(), s.m.round(), portable::sha256_hex(s.save().as_bytes()))
}

/// Rebuild a save file around an edited header (lengths and CRC made right again).
fn reheader(file: &[u8], edit: impl FnOnce(&mut Value)) -> Vec<u8> {
    let head_len = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;
    let mut header: Value = serde_json::from_slice(&file[PREFIX..PREFIX + head_len]).unwrap();
    edit(&mut header);
    let head = serde_json::to_vec(&header).unwrap();
    let mut out = file[..12].to_vec();
    out.extend_from_slice(&(head.len() as u32).to_le_bytes());
    out.extend_from_slice(&portable::crc32(&head).to_le_bytes());
    out.extend_from_slice(&head);
    out.extend_from_slice(&file[PREFIX + head_len..]);
    out
}

/// A session text that parses but cannot be played: most of its regions are gone.
fn unplayable(text: &str) -> String {
    let mut save: Value = serde_json::from_str(text).unwrap();
    let mut world: Value = serde_json::from_str(save["world"].as_str().unwrap()).unwrap();
    let regions = world.as_object_mut().unwrap().values_mut().find(|v| v.as_array().is_some_and(|a| a.len() == 24)).expect("the world lists its 24 regions");
    regions.as_array_mut().unwrap().truncate(3);
    save["world"] = json!(world.to_string());
    save.to_string()
}

#[test]
fn a_save_file_round_trips_through_the_routes_in_either_kind_of_host() {
    let mut h: Host = new_match(BROWSER, ["human", "easy", "medium", "hard"]);
    for _ in 0..2 {
        post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true }));
    }
    let text = get(&mut h, "/api/session/export").text;
    let file = bytes_call(&mut h, "GET", "/api/savefile?kind=manual&name=Before%20the%20flood%20%E2%9C%93&created=1700000000123", b"");
    assert_eq!((file.status, file.kind), (200, Body::Binary));
    assert_eq!(file.effects, Effects::default(), "exporting changes nothing");
    let (header, inside) = portable::open(&file.data, &Limits::default()).unwrap();
    assert_eq!(inside, text, "the container holds exactly the session export");
    assert_eq!((header.kind, header.name.as_str(), header.created_ms, header.round), (Kind::Manual, "Before the flood ✓", 1_700_000_000_123, 3));
    assert_eq!(header.seats[0].controller, bts_protocol::ControllerKind::Human);
    assert_eq!(header.seed.as_deref(), Some("host-rules"), "this match discloses its seed");
    let mut sealed: Host = Host::new(BROWSER);
    post(&mut sealed, "/api/match", json!({ "seed": "kept-to-the-referee", "regions": 24, "public_seed": false }));
    let sealed_file = bytes_call(&mut sealed, "GET", "/api/savefile", b"").data;
    let head_len = u32::from_le_bytes(sealed_file[12..16].try_into().unwrap()) as usize;
    assert!(!String::from_utf8_lossy(&sealed_file[..PREFIX + head_len]).contains("kept-to-the-referee"), "a sealed seed is not in the plain header");
    // the text route and the plain handle() entry point reach the same routes
    let auto = h.handle(&Request { method: "GET", target: "/api/savefile?kind=auto", body: "", entropy: 0 });
    assert_eq!(portable::open(&auto.data, &Limits::default()).unwrap().0.kind, Kind::Auto);

    // describing it loads nothing
    let before = fingerprint(&h);
    let d = bytes_call(&mut h, "POST", "/api/savefile/describe", &file.data);
    assert_eq!((d.status, &d.body["loadable"], &d.body["legacy"], &d.body["reason"]), (200, &json!(true), &json!(false), &Value::Null));
    assert_eq!(d.body["header"]["match_id"], json!(before.2));
    assert_eq!(d.body["header"]["year"], json!(header.year));
    assert_eq!(d.body["bytes"], json!(file.data.len()));
    assert_eq!(d.body["build"]["ruleset"], bts_engine::content::RULESET_VERSION);
    assert!(d.body["file_name"].as_str().unwrap().ends_with(".btsave"));
    assert_eq!(d.effects, Effects::default());
    assert_eq!(fingerprint(&h), before);

    // it loads in the host that wrote it, in a fresh browser-style host and in a server-style one
    post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true }));
    let later = hash(&h);
    let mut browser: Host = Host::new(BROWSER);
    let mut server: Host<StubAgent> = Host::new(SERVER);
    let r = bytes_call(&mut h, "POST", "/api/savefile/import", &file.data);
    assert_eq!((r.status, &r.body["round"], r.effects.installed, r.effects.changed), (200, &json!(3), true, true));
    assert_eq!(hash(&h), before.0);
    post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true }));
    assert_eq!(hash(&h), later);
    let r = bytes_call(&mut browser, "POST", "/api/savefile/import", &file.data);
    assert_eq!((r.status, &r.body["match_id"]), (200, &json!(before.2)));
    assert_eq!(get(&mut browser, "/api/session/export").text, text, "byte-identical after the trip");
    post(&mut browser, "/api/ready", json!({ "seat": 0, "through_round": true }));
    assert_eq!(hash(&browser), later, "a restored match continues exactly as the original did");
    let r = bytes_call(&mut server, "POST", "/api/savefile/import", &file.data);
    assert_eq!(r.status, 200);
    assert_eq!(get(&mut server, "/api/session/export").text, text);
    assert_eq!(get(&mut server, "/api/spectator").status, 403, "importing opens no observer door");
}

#[test]
fn every_refused_save_file_leaves_the_match_exactly_as_it_was() {
    let mut donor: Host = new_match(BROWSER, ["human", "easy", "medium", "hard"]);
    post(&mut donor, "/api/ready", json!({ "seat": 0, "through_round": true }));
    let text = get(&mut donor, "/api/session/export").text;
    let file = bytes_call(&mut donor, "GET", "/api/savefile", b"").data;
    let head_len = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;

    let mut flipped_payload = file.clone();
    flipped_payload[PREFIX + head_len + 100] ^= 0x04;
    let mut flipped_header = file.clone();
    flipped_header[PREFIX + 10] ^= 0x01;
    let mut wrong_magic = file.clone();
    wrong_magic[1] = b'X';
    let mut future = file.clone();
    future[8..10].copy_from_slice(&7u16.to_le_bytes());
    let other_rules = reheader(&file, |h| h["versions"]["ruleset"] = "bts-rules/0.1.0".into());
    let oversized = reheader(&file, |h| h["length"] = (1u64 << 36).into());
    let zeros = vec![0u8; 40 << 20];
    let packed_zeros = miniz_oxide::deflate::compress_to_vec(&zeros, 6);
    let mut bomb = file[..PREFIX + head_len].to_vec();
    bomb.extend_from_slice(&packed_zeros);
    let bomb = reheader(&bomb, |h| {
        h["stored"] = (packed_zeros.len() as u64).into();
        h["stored_crc32"] = portable::crc32(&packed_zeros).into();
    });
    let session = donor.session.as_ref().unwrap();
    let broken = portable::pack(session, &unplayable(&text), Meta { kind: Kind::Manual, name: "", created_ms: 0 });
    let not_a_session = portable::pack(session, "{\"format\":\"bts-save/1\"}", Meta { kind: Kind::Manual, name: "", created_ms: 0 });
    let cases: Vec<(&str, Vec<u8>, &str)> = vec![
        ("empty", Vec::new(), "NOT_A_SAVE"),
        ("truncated in the payload", file[..file.len() - 40].to_vec(), "TRUNCATED"),
        ("truncated in the header", file[..PREFIX + 9].to_vec(), "TRUNCATED"),
        ("truncated in the preamble", file[..11].to_vec(), "TRUNCATED"),
        ("a flipped bit in the payload", flipped_payload, "CORRUPT"),
        ("a flipped bit in the header", flipped_header, "CORRUPT"),
        ("trailing bytes", [&file[..], b"extra"].concat(), "CORRUPT"),
        ("wrong magic", wrong_magic, "NOT_A_SAVE"),
        ("some other file", b"%PDF-1.7 not a save at all".to_vec(), "NOT_A_SAVE"),
        ("some other JSON", b"{\"hello\":\"world\"}".to_vec(), "NOT_A_SAVE"),
        ("a future container format", future, "FORMAT_VERSION"),
        ("a different ruleset", other_rules, "INCOMPATIBLE"),
        ("an oversized declared length", oversized, "TOO_LARGE"),
        ("a deflate bomb", bomb, "CORRUPT"),
        ("a sound container around an unplayable session", broken, "UNPLAYABLE"),
        ("a sound container around something that is not a session", not_a_session, "UNPLAYABLE"),
        ("truncated legacy text", text.as_bytes()[..text.len() / 2].to_vec(), "UNPLAYABLE"),
    ];

    // the match that must survive all of it is a different one, three rounds in
    let mut h: Host = Host::new(BROWSER);
    assert_eq!(post(&mut h, "/api/match", json!({ "seed": "the-survivor", "regions": 24, "controllers": ["human", "hard", "hard", "easy"] })).status, 200);
    for _ in 0..3 {
        post(&mut h, "/api/ready", json!({ "seat": 0, "through_round": true }));
    }
    let before = fingerprint(&h);
    for (what, bad, reason) in &cases {
        let d = bytes_call(&mut h, "POST", "/api/savefile/describe", bad);
        assert_eq!((d.status, &d.body["loadable"], &d.body["reason"]), (200, &json!(false), &json!(reason)), "describe: {what}: {}", d.body);
        assert!(d.body["message"].as_str().is_some_and(|m| m.len() > 10), "describe gives a reason for {what}");
        let r = bytes_call(&mut h, "POST", "/api/savefile/import", bad);
        assert_eq!((r.status, &r.body["error"], &r.body["reason"]), (400, &json!("INVALID_SAVE"), &json!(reason)), "import: {what}: {}", r.body);
        assert!(r.body["message"].as_str().is_some_and(|m| m.len() > 10), "import gives a reason for {what}");
        assert_eq!(r.effects, Effects::default(), "{what}");
        assert_eq!(fingerprint(&h), before, "the match changed after refusing {what}");
    }
    // the messages a player will actually meet say what is wrong
    let message = |h: &mut Host, bad: &[u8]| bytes_call(h, "POST", "/api/savefile/import", bad).body["message"].as_str().unwrap().to_string();
    assert_eq!(message(&mut h, &cases[11].1), format!("this file was saved by rules bts-rules/0.1.0; this build runs rules {}", bts_engine::content::RULESET_VERSION));
    assert!(message(&mut h, &cases[10].1).contains("save-file format 7"));
    assert!(message(&mut h, &cases[14].1).contains("cannot be played"));
    // a header can be shown even when the file cannot be loaded
    let d = bytes_call(&mut h, "POST", "/api/savefile/describe", &cases[11].1);
    assert_eq!(d.body["header"]["versions"]["ruleset"], "bts-rules/0.1.0");
    assert_eq!(d.body["header"]["match_id"], json!(donor.session.as_ref().unwrap().m.match_id()));

    // the size limit is the host's to set
    h.limits = Limits { max_file: 64 << 20, max_unpacked: 1000 };
    let r = bytes_call(&mut h, "POST", "/api/savefile/import", &file);
    assert_eq!((r.status, &r.body["reason"]), (400, &json!("TOO_LARGE")));
    let r = bytes_call(&mut h, "POST", "/api/savefile/import", text.as_bytes());
    assert_eq!((r.status, &r.body["reason"]), (400, &json!("TOO_LARGE")), "bare text is held to the same limit");
    h.limits = Limits { max_file: 1000, max_unpacked: 64 << 20 };
    assert_eq!(bytes_call(&mut h, "POST", "/api/savefile/import", &file).body["reason"], "TOO_LARGE");
    assert_eq!(fingerprint(&h), before);

    // and after all that, the good file still loads
    h.limits = Limits::default();
    let r = bytes_call(&mut h, "POST", "/api/savefile/import", &file);
    assert_eq!(r.status, 200, "{}", r.body);
    assert_eq!(hash(&h), hash(&donor));
    assert_eq!(h.generation, before.1 + 1);
}

#[test]
fn bare_session_text_is_still_a_save_file() {
    // the server's saves from before the container, and its autosave, are session text
    let mut old: Host = new_match(SERVER, ["human", "easy", "medium", "hard"]);
    post(&mut old, "/api/ready", json!({ "seat": 0, "through_round": true }));
    let text = get(&mut old, "/api/session/export").text;
    let mut h: Host = Host::new(BROWSER);
    let d = bytes_call(&mut h, "POST", "/api/savefile/describe", text.as_bytes());
    assert_eq!((&d.body["loadable"], &d.body["legacy"], &d.body["header"]["round"]), (&json!(true), &json!(true), &json!(2)));
    assert!(h.session.is_none());
    let r = bytes_call(&mut h, "POST", "/api/savefile/import", format!("  \n{text}").as_bytes());
    assert_eq!(r.status, 200, "{}", r.body);
    assert_eq!(hash(&h), hash(&old));
    // and the text routes are untouched
    assert_eq!(post(&mut h, "/api/session/import", serde_json::from_str(&text).unwrap()).status, 200);
    // a request that is not text is refused by the text routes, not misread
    let r = bytes_call(&mut h, "POST", "/api/ready", &[0xff, 0xfe, 0x00]);
    assert_eq!((r.status, &r.body["error"]), (400, &json!("INVALID_SCHEMA")));
}

#[test]
fn a_save_file_never_leaves_a_referee_with_an_external_seat() {
    let mut h: Host = new_match(SERVER, ["external", "easy", "medium", "hard"]);
    let out = bytes_call(&mut h, "GET", "/api/savefile", b"");
    assert_eq!((out.status, out.kind, out.data.len()), (403, Body::Json, 0));
    // nor does a stored save of such a match, through the route a transport offers for named saves
    let stored = h.session_text().unwrap();
    assert_eq!(h.export_text(&stored, Meta { kind: Kind::Manual, name: "x", created_ms: 0 }).unwrap_err().0, 403);
    // the transport's own storage is not a request and is not refused
    let own = h.container(Meta { kind: Kind::Manual, name: "x", created_ms: 0 }).unwrap();
    let header = portable::open(&own, &Limits::default()).unwrap().0;
    assert!(!h.header_portable(&header), "and its header says it may not be handed out");

    let mut tokens: Host = new_match(Config { require_tokens: true, ..SERVER }, ["easy", "easy", "medium", "hard"]);
    assert_eq!(bytes_call(&mut tokens, "GET", "/api/savefile", b"").status, 403);
    let stored = tokens.session_text().unwrap();
    assert_eq!(tokens.export_text(&stored, Meta { kind: Kind::Manual, name: "", created_ms: 0 }).unwrap_err().0, 403);

    let mut observed: Host = new_match(SERVER, ["easy", "easy", "medium", "hard"]);
    let out = bytes_call(&mut observed, "GET", "/api/savefile", b"");
    assert_eq!(out.status, 200);
    let header = portable::open(&out.data, &Limits::default()).unwrap().0;
    assert!(observed.header_portable(&header));
    let stored = observed.session_text().unwrap();
    assert!(observed.export_text(&stored, Meta { kind: Kind::Auto, name: "", created_ms: 5 }).is_ok());
    assert_eq!(bytes_call(&mut Host::<NoAgents>::new(SERVER), "GET", "/api/savefile", b"").status, 404);
}

#[test]
fn a_save_never_contains_an_api_key() {
    const KEY: &str = "sk-ant-api03-THIS-IS-THE-SECRET-0123456789abcdef";
    const OTHER: &str = "sk-proj-ANOTHER-SECRET-zyxwvu9876543210";
    let mut h: Host<StubAgent> = Host::new(SERVER);
    let made = post(
        &mut h,
        "/api/match",
        json!({
            "seed": "keys", "regions": 24, "controllers": ["claude-api", "claude-api", "medium", "hard"],
            "agent_options": {
                "0": { "model": "some-model", "api_key": KEY, "base_url": format!("https://gateway-user:{KEY}@proxy.example:8443/v1/messages?api_key={KEY}&x=1#frag-{KEY}"), "effort": "high" },
                "1": { "model": format!("model-{OTHER}"), "api_key": format!("  {OTHER}  "), "base_url": format!("proxy.example/{OTHER}/v1"), "effort": OTHER },
            },
        }),
    );
    assert_eq!(made.status, 200, "{}", made.text);
    assert!(!made.text.contains(KEY) && !made.text.contains(OTHER), "the match summary does not repeat a key");
    // the keys are held, in memory, where the agent workers read them
    let held = h.session.as_ref().unwrap().agent_cfgs[0].as_ref().unwrap();
    assert_eq!(held.api_key.as_deref(), Some(KEY));
    assert!(held.base_url.as_deref().unwrap().contains(KEY), "the address is used as given while the match runs");
    post(&mut h, "/api/advance", json!({ "rounds": 1 }));

    let leaks = |what: &str, bytes: &[u8]| {
        for key in [KEY, OTHER] {
            assert!(!bytes.windows(key.len()).any(|w| w == key.as_bytes()), "{what} contains an API key");
            // not in part either: no long run of the key survives
            let tail = &key.as_bytes()[key.len() - 12..];
            assert!(!bytes.windows(tail.len()).any(|w| w == tail), "{what} contains part of an API key");
        }
    };
    let text = h.session_text().unwrap();
    leaks("the session save text", text.as_bytes());
    let exported = get(&mut h, "/api/session/export");
    assert_eq!(exported.status, 200);
    leaks("the session export", exported.text.as_bytes());
    let file = bytes_call(&mut h, "GET", "/api/savefile?name=keys", b"");
    assert_eq!(file.status, 200);
    leaks("the save file as stored", &file.data);
    let (header, inside) = portable::open(&file.data, &Limits::default()).unwrap();
    leaks("the save file's contents", inside.as_bytes());
    leaks("the save file's header", serde_json::to_string(&header).unwrap().as_bytes());
    leaks("the transport's own container", &h.container(Meta { kind: Kind::Auto, name: "", created_ms: 1 }).unwrap());
    assert_eq!(header.seats[0].agent.as_deref(), Some("claude-api"));

    // what a save does keep of the seat: provider, model, pace, and the address without its credentials
    let saved: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(saved["agent_cfgs"][0], json!({ "provider": "claude-api", "model": "some-model", "consult_every": 1, "base_url": "https://proxy.example:8443/v1/messages", "effort": "high" }));
    assert_eq!(saved["agent_cfgs"][1], json!({ "provider": "claude-api", "model": "", "consult_every": 1, "base_url": null, "effort": null }));
    assert!(saved["agent_cfgs"][0].get("api_key").is_none());

    // the tripwire behind all of that: text that does repeat a held key is recognised
    assert!(h.session.as_ref().unwrap().leaks_credential(&format!("..{KEY}..")));
    assert!(!h.session.as_ref().unwrap().leaks_credential(&text));

    // a save with an agent seat resumes on a referee that can run one, and is refused by name where none can
    let mut again: Host<StubAgent> = Host::new(SERVER);
    assert_eq!(bytes_call(&mut again, "POST", "/api/savefile/import", &file.data).status, 200);
    assert!(again.session.as_ref().unwrap().agent_cfgs[0].as_ref().unwrap().api_key.is_none());
    let mut browser: Host = new_match(BROWSER, ["human", "easy", "medium", "hard"]);
    let before = fingerprint(&browser);
    let r = bytes_call(&mut browser, "POST", "/api/savefile/import", &file.data);
    assert_eq!((r.status, &r.body["reason"]), (400, &json!("NEEDS_SERVER")));
    let d = bytes_call(&mut browser, "POST", "/api/savefile/describe", &file.data);
    assert_eq!((&d.body["loadable"], &d.body["reason"], &d.body["header"]["seats"][0]["agent"]), (&json!(false), &json!("NEEDS_SERVER"), &json!("claude-api")));
    assert_eq!(fingerprint(&browser), before);
}

#[test]
fn addresses_are_scrubbed_of_credentials() {
    use crate::scrub_url;
    assert_eq!(scrub_url("https://api.example.com/v1"), "https://api.example.com/v1");
    assert_eq!(scrub_url("https://user:pass@api.example.com:8443/v1?key=abc#x"), "https://api.example.com:8443/v1");
    assert_eq!(scrub_url("http://token@localhost:1234"), "http://localhost:1234");
    assert_eq!(scrub_url("  https://a@b@host/p@th  "), "https://host/p@th");
    assert_eq!(scrub_url("user:pw@host.example/v1?k=v"), "host.example/v1");
    assert_eq!(scrub_url("https://host/?token=abc"), "https://host/");
    assert_eq!(scrub_url(""), "");
}
