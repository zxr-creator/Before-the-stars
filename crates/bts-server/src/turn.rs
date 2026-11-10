//! A complete seat-facing decision packet and retry-safe action/advance exchange.
//! Uses the ordinary engine projector; never includes spectator or referee state.
use crate::agents::ServerState;
use bts_protocol::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::hash::{Hash, Hasher};

type Failure = (u16, &'static str, String);
type Result<T> = std::result::Result<T, Failure>;

#[derive(Default)]
pub struct Cache {
    entries: HashMap<(String, SeatId, String), (String, Value, usize)>,
    order: VecDeque<(String, SeatId, String)>,
    bytes: usize,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Submission {
    pub seat: SeatId,
    #[serde(default)]
    pub token: String,
    pub request_id: String,
    pub cursor: String,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default)]
    pub advance: Advance,
}

#[derive(Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Advance { #[default] None, Phase, Round }

fn allowed(st: &ServerState, seat: SeatId, token: &str, require_tokens: bool, write: bool) -> Result<()> {
    let s = st.session.as_ref().ok_or((404, "NO_MATCH", "no match is running".into()))?;
    let idx = seat as usize;
    if idx >= s.m.seats() || (require_tokens && s.tokens[idx] != token) {
        return Err((403, "UNAUTHORIZED", "unknown seat or token".into()));
    }
    let driven = s.ais[idx].is_some() || st.agents.get(idx).is_some_and(|a| a.is_some());
    if driven && (write || require_tokens || !s.m.observer_allowed()) {
        return Err((403, "UNAUTHORIZED", "unknown seat or token".into()));
    }
    Ok(())
}

fn cursor(obs: &Observation) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_vec(obs).unwrap().hash(&mut h);
    format!("{:016x}", h.finish())
}

fn action_reference(obs: &Observation) -> Value {
    let mut examples = vec![
        json!({"kind":"select_contacts","seats":[]}),
        json!({"kind":"message","to":0,"text":"Your statement or proposal","intent":null}),
        json!({"kind":"propose_treaty","to":0,"clauses":[],"text":null}),
        json!({"kind":"sign_treaty","offer":0}),
        json!({"kind":"decline_offer","offer":0}),
        json!({"kind":"withdraw_offer","offer":0}),
        json!({"kind":"break_treaty","treaty":0}),
        json!({"kind":"start_project","spec":{"kind":"build","region":0,"facility":"known_catalog_kind","levels":1},"priority":5}),
        json!({"kind":"start_project","spec":{"kind":"research","tech":"known_tech_handle"},"priority":5}),
        json!({"kind":"start_project","spec":{"kind":"survey","region":0},"priority":5}),
        json!({"kind":"start_project","spec":{"kind":"settle","from":0,"to":1,"people":30},"priority":5}),
        json!({"kind":"start_project","spec":{"kind":"study","domain":"known_domain"},"priority":5}),
        json!({"kind":"start_project","spec":{"kind":"resettle","from":0,"to":1,"people":10},"priority":5}),
        json!({"kind":"start_project","spec":{"kind":"recruit","region":0,"role":"assault","soldiers":10,"tier":0},"priority":5}),
        json!({"kind":"manage_project","project":0,"op":"pause","priority":5}),
        json!({"kind":"investigate","lead":"known_lead_handle"}),
        json!({"kind":"propose_reform","practice":"known_practice_handle"}),
        json!({"kind":"start_program","region":0,"course":"known_course_key","seats":4}),
        json!({"kind":"manage_program","program":0,"op":"pause","seats":null}),
        json!({"kind":"set_policy","setting":{"kind":"labor_weight","category":"industry","weight":6}}),
        json!({"kind":"set_policy","setting":{"kind":"mobilization","bp":5000}}),
        json!({"kind":"set_policy","setting":{"kind":"food_reserve_months","months":6}}),
        json!({"kind":"set_policy","setting":{"kind":"facility","region":0,"facility":"known_catalog_kind","enabled":true}}),
        json!({"kind":"military_order","army":0,"order":{"kind":"hold"}}),
        json!({"kind":"demolish","region":0,"facility":"known_catalog_kind","levels":1}),
    ];
    if obs.culture.movement.is_some() {
        examples.push(json!({"kind":"start_project","spec":{"kind":"religion","beliefs":[],"name":null},"priority":5}));
    }
    if obs.objectives.victory.is_some() {
        for kind in ["ftl_trial", "ftl_deployment", "ftl_replacement"] {
            examples.push(json!({"kind":"start_project","spec":{"kind":kind},"priority":5}));
        }
    }
    json!({"note":"Templates only: replace sample references with handles/IDs from your observation; availability and costs are authoritative there. Do not submit this entire example list. pause/resume/cancel manage projects/programs; role assault/maneuver/denial; priorities 0–9; lower is first. Signed treaty clauses are binding, message prose is not.", "examples":examples})
}

fn packet(st: &ServerState, seat: SeatId, receipts: Vec<Receipt>, submitted: bool, advanced: bool) -> Value {
    let s = st.session.as_ref().unwrap();
    let obs = s.m.observe(seat);
    json!({
        "cursor": cursor(&obs), "action_reference": action_reference(&obs), "observation": obs, "receipts": receipts,
        "submitted": submitted, "round_advanced": advanced,
        "waiting_for": s.m.waiting_on(),
        "limits": {"actions_per_submission": MAX_ACTIONS_PER_BATCH, "counterparts_per_round": 3,
                   "envelopes_per_pair_per_round": 10, "negotiation_windows": 5},
        "next": "Submit a batch with this cursor and a unique request_id. Use phase to hear replies; round passes all remaining diplomacy. Rejected actions prevent automatic advance; accepted actions remain applied."
    })
}

pub fn get(st: &ServerState, seat: SeatId, token: &str, require_tokens: bool) -> Result<Value> {
    allowed(st, seat, token, require_tokens, false)?;
    Ok(packet(st, seat, vec![], false, false))
}

pub fn submit(st: &mut ServerState, cache: &mut Cache, b: Submission, require_tokens: bool) -> Result<Value> {
    allowed(st, b.seat, &b.token, require_tokens, true)?;
    if b.request_id.is_empty() || b.request_id.len() > 80 || !b.request_id.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c)) {
        return Err((400, "INVALID_SCHEMA", "request_id must contain 1–80 ASCII letters, digits, hyphens or underscores".into()));
    }
    if b.actions.len() > MAX_ACTIONS_PER_BATCH {
        return Err((400, "RATE_LIMITED", "at most 32 actions per submission".into()));
    }
    let s = st.session.as_ref().unwrap();
    let key = (format!("{}:{}", st.generation, s.m.match_id()), b.seat, b.request_id.clone());
    let fingerprint = serde_json::to_string(&b).unwrap();
    if let Some((original, response, _)) = cache.entries.get(&key) {
        if original != &fingerprint { return Err((409, "IDEMPOTENCY_CONFLICT", "request_id already used with a different submission".into())); }
        return Ok(response.clone());
    }
    if cursor(&s.m.observe(b.seat)) != b.cursor {
        return Err((409, "STALE_TURN", "the decision packet changed; get_turn before submitting again".into()));
    }
    let s = st.session.as_mut().unwrap();
    let before = s.m.round();
    let receipts = s.m.act(b.seat, b.actions);
    let accepted = receipts.iter().all(|r| matches!(r.status.as_str(), "accepted" | "applied"));
    if accepted && b.advance != Advance::None {
        s.m.set_ready(b.seat, b.advance == Advance::Round);
        s.drive();
        if s.m.try_advance() { s.drive(); }
    }
    let advanced = s.m.round() != before;
    // Save every exchange, including within-round orders, rather than only ready.
    st.autosave();
    let response = packet(st, b.seat, receipts, true, advanced);
    let bytes = fingerprint.len() + response.to_string().len();
    if bytes <= 16 * 1024 * 1024 {
        cache.bytes += bytes;
        cache.order.push_back(key.clone());
        cache.entries.insert(key, (fingerprint, response.clone(), bytes));
        while cache.order.len() > 128 || cache.bytes > 16 * 1024 * 1024 {
            if let Some(old) = cache.order.pop_front() {
                if let Some((_, _, size)) = cache.entries.remove(&old) { cache.bytes -= size; }
            }
        }
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::Session;
    use bts_engine::MatchConfig;
    fn state() -> ServerState {
        let cfg = MatchConfig { seed: "turn-packet".into(), regions: 24,
            controllers: vec![ControllerKind::External, ControllerKind::NativeEasy, ControllerKind::NativeEasy, ControllerKind::NativeEasy], ..Default::default() };
        ServerState { session: Some(Session::new(cfg, 11)), generation: 0, agents: vec![], autoplay_until: 0, app_mode: false,
            saves: std::env::temp_dir().join(format!("bts-turn-tests-{}", std::process::id())) }
    }
    fn order(st: &ServerState, id: &str) -> Submission {
        Submission { seat: 0, token: String::new(), request_id: id.into(), cursor: get(st, 0, "", false).unwrap()["cursor"].as_str().unwrap().into(),
            actions: vec![Action::SetPolicy { setting: PolicySetting::Rename { name: "New identity".into() } }], advance: Advance::None }
    }
    #[test]
    fn retry_never_reapplies_and_changed_payload_conflicts() {
        let mut st = state(); let mut cache = Cache::default(); let b = order(&st, "retry");
        let text = serde_json::to_string(&b).unwrap();
        let a = submit(&mut st, &mut cache, b, false).unwrap();
        let hash = st.session.as_ref().unwrap().m.state_hash();
        let b = submit(&mut st, &mut cache, serde_json::from_str(&text).unwrap(), false).unwrap();
        assert_eq!(a, b); assert_eq!(hash, st.session.as_ref().unwrap().m.state_hash());
        let mut changed: Submission = serde_json::from_str(&text).unwrap(); changed.advance = Advance::Round;
        assert_eq!(submit(&mut st, &mut cache, changed, false).unwrap_err().1, "IDEMPOTENCY_CONFLICT");
    }
    #[test]
    fn stale_packet_changes_nothing_and_rejections_do_not_advance() {
        let mut st = state(); let mut cache = Cache::default(); let mut b = order(&st, "mixed");
        b.actions.push(Action::StartProject { spec: ProjectSpec::Build { region: 65535, facility: "unknown".into(), levels: 1 }, priority: Some(5) }); b.advance = Advance::Round;
        let before = st.session.as_ref().unwrap().m.round();
        let response = submit(&mut st, &mut cache, b, false).unwrap();
        assert_eq!(before, st.session.as_ref().unwrap().m.round());
        assert_eq!(response["receipts"][0]["status"], "accepted");
        assert_eq!(response["receipts"][1]["status"], "rejected");
        let mut stale = order(&st, "stale"); stale.cursor = "outdated".into();
        let hash = st.session.as_ref().unwrap().m.state_hash();
        assert_eq!(submit(&mut st, &mut cache, stale, false).unwrap_err().1, "STALE_TURN");
        assert_eq!(hash, st.session.as_ref().unwrap().m.state_hash());
    }
    #[test]
    fn packets_enforce_seat_permissions_and_never_include_spectator_state() {
        let st = state();
        assert_eq!(get(&st, 0, "bad-token", true).unwrap_err().0, 403);
        assert_eq!(get(&st, 1, "", true).unwrap_err().0, 403);
        assert_eq!(get(&st, 255, "", false).unwrap_err().0, 403);
        let token = &st.session.as_ref().unwrap().tokens[0];
        let p = get(&st, 0, token, true).unwrap();
        assert_eq!(p["observation"]["seat"], 0);
        assert!(p.get("spectator").is_none());
        assert!(p.get("seed").is_none());
        assert!(!p["action_reference"].to_string().contains("ftl"));
    }
    #[test]
    fn one_submission_can_finish_a_round_and_return_the_next_observation() {
        let mut st = state(); let mut cache = Cache::default(); let mut b = order(&st, "round");
        let before = st.session.as_ref().unwrap().m.round(); b.advance = Advance::Round;
        let result = submit(&mut st, &mut cache, b, false).unwrap();
        assert_eq!(result["observation"]["round"], before + 1);
        assert_eq!(result["round_advanced"], true);
    }
}
