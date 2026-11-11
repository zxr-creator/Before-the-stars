//! A complete seat-facing decision packet and retry-safe action/advance exchange.
//! Uses the ordinary engine projector; never includes spectator or referee state.
use crate::referee::{AgentSlot, Failure, Host};
use bts_protocol::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::hash::{Hash, Hasher};

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
    /// How much of the updated packet to send back: "full" (the default) or "brief".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view: Option<String>,
    /// With `view: "full"`, only these top-level parts of the observation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sections: Option<Vec<String>>,
    /// The building tree hash the client holds; the packet carries the tree in full
    /// when it differs (protocol 2.3).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub known_tree_hash: Option<String>,
}

/// How much of a decision packet to send.
///
/// The full observation of a large civilization runs to hundreds of kilobytes. A
/// brief packet replaces it with a text briefing of what matters (see
/// [`crate::briefing`]) and the seat's standing orders; any part of the full
/// observation can be asked for by name.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct View {
    pub brief: bool,
    /// Top-level observation fields to keep (with `brief == false`); `None` keeps all.
    pub sections: Option<Vec<String>>,
    /// The building tree hash the client holds (protocol 2.3).
    pub known_tree_hash: Option<String>,
}

/// Top-level observation fields a packet may be cut to.
pub const SECTIONS: [&str; 23] = [
    "civ", "regions", "world", "others", "knowledge", "culture", "catalog", "projects", "programs", "armies", "foreign_armies", "diplomacy", "objectives", "briefing", "chronicle", "receipts", "units",
    "date", "calendar", "directives", "outcome", "status", "ready",
];

impl View {
    pub fn parse(view: Option<&str>, sections: Option<&str>) -> View {
        let brief = view.map(str::trim) == Some("brief");
        let sections = sections.map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect::<Vec<_>>()).filter(|v| !v.is_empty());
        View { brief, sections, known_tree_hash: None }
    }
    fn of(sub: &Submission) -> View {
        View { brief: sub.view.as_deref() == Some("brief"), sections: sub.sections.clone().filter(|v| !v.is_empty()), known_tree_hash: sub.known_tree_hash.clone() }
    }
}

#[derive(Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Advance { #[default] None, Phase, Round }

fn cursor(obs: &Observation) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_vec(obs).unwrap().hash(&mut h);
    format!("{:016x}", h.finish())
}

fn action_reference(obs: &Observation) -> Value {
    let mut examples = vec![
        json!({"kind":"directive","op":"add","directive":{"kind":"build_target","region":0,"facility":"known_catalog_kind","levels":2,"priority":5}}),
        json!({"kind":"directive","op":"add","directive":{"kind":"research_agenda","techs":["known_tech_handle"]}}),
        json!({"kind":"directive","op":"add","directive":{"kind":"auto_research","on":true}}),
        json!({"kind":"directive","op":"add","directive":{"kind":"reform_agenda","practices":["known_practice_handle"]}}),
        json!({"kind":"directive","op":"add","directive":{"kind":"settle_target","from":0,"to":1,"people":30000,"when_crowd_bp":8000}}),
        json!({"kind":"directive","op":"remove","id":0}),
        json!({"kind":"directive","op":"move","id":0,"position":0}),
        json!({"kind":"select_contacts","seats":[]}),
        json!({"kind":"message","to":0,"text":"Your statement or proposal","intent":null}),
        json!({"kind":"propose_treaty","to":0,"clauses":[],"text":null}),
        json!({"kind":"sign_treaty","offer":0}),
        json!({"kind":"decline_offer","offer":0}),
        json!({"kind":"withdraw_offer","offer":0}),
        json!({"kind":"break_treaty","treaty":0,"notice":true}),
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
        json!({"kind":"set_policy","setting":{"kind":"method","region":0,"facility":"known_catalog_kind","method":"known_recipe_key"}}),
        json!({"kind":"set_policy","setting":{"kind":"war_policy","seat":0,"accept_white_peace_after_months":36,"accept_cession_max":0}}),
        json!({"kind":"repeal","practice":"known_practice_handle"}),
        json!({"kind":"military_order","army":0,"order":{"kind":"hold"}}),
        json!({"kind":"demolish","region":0,"facility":"known_catalog_kind","levels":1}),
        json!({"kind":"start_project","spec":{"kind":"upgrade","region":0,"from":"known_catalog_kind","to":"its_upgrades_to_kind","levels":1},"priority":5}),
        json!({"kind":"set_policy","setting":{"kind":"borders","immigration":"selective","emigration":"free"}}),
    ];
    if obs.culture.movement.is_some() {
        examples.push(json!({"kind":"start_project","spec":{"kind":"religion","beliefs":[],"name":null},"priority":5}));
    }
    if obs.objectives.victory.is_some() {
        for kind in ["ftl_trial", "ftl_deployment", "ftl_replacement"] {
            examples.push(json!({"kind":"start_project","spec":{"kind":kind},"priority":5}));
        }
    }
    let clauses = vec![
        json!({"kind":"goods","from":0,"good":"food","amount_per_month":50000,"months":12}),
        json!({"kind":"knowledge","from":0,"tech":"known_tech_handle"}),
        json!({"kind":"practice","from":0,"practice":"known_practice_handle"}),
        json!({"kind":"maps","from":0}),
        json!({"kind":"non_aggression","months":0}),
        json!({"kind":"defensive_pact","months":120}),
        json!({"kind":"peace"}),
        json!({"kind":"secondment","from":0,"qual":"builder","count":200,"months":24}),
        json!({"kind":"joint_programme","host":0,"service":"launch","months":60}),
        json!({"kind":"subordination","from":0,"tribute_bp":1000}),
        json!({"kind":"cede_region","from":0,"region":0}),
    ];
    json!({
        "note": "Templates only: replace sample references with handles/IDs from your observation; availability and costs are authoritative there. Do not submit this entire example list. Rounds last up to fifty years, so an order given now is carried out once while a standing order (kind directive) is re-checked every January inside the round: keep facility levels with build_target, keep research busy with research_agenda/auto_research, queue reforms with reform_agenda, expand with settle_target; op add replaces an order that stands for the same thing. pause/resume/cancel manage projects/programs; role assault/maneuver/denial; priorities 0–9, lower is first. A war policy (set_policy war_policy) lets an armistice happen inside a long round. Treaty clauses (propose_treaty) bind once signed; months 0 on non_aggression makes it open-ended, ended without breach by break_treaty with notice. Message prose binds nobody.",
        "examples": examples,
        "clauses": clauses,
    })
}

/// What to do next, in the words a model reads first.
fn next_text(obs: &Observation) -> String {
    let months = obs.calendar.as_ref().map(|c| c.round_months).unwrap_or(obs.months_per_round);
    let phase = match obs.phase {
        Phase::Plan => "This is the planning phase: your orders now shape the whole round.",
        Phase::Contact => "This is the contact phase: choose up to three counterparts with select_contacts.",
        Phase::Negotiate => "This is a negotiation window: one envelope (message, proposal or signature) per open channel; planning orders are also accepted.",
        Phase::Finished => "The match is over.",
    };
    format!(
        "{phase} This round resolves {months} months in one go. One-off orders are carried out once; standing orders (kind directive) act every January inside the round, so use them for what must keep happening. Submit one batch with this cursor and a unique request_id: advance phase finishes your part of this phase, round also passes the remaining diplomacy, none only applies the orders so you can read the receipts and submit again. Rejected actions prevent the advance; accepted actions stay applied."
    )
}

/// The observation as JSON, cut to the named top-level fields (identity and timing always kept).
fn cut(obs: &Observation, sections: &Option<Vec<String>>) -> Value {
    let full = serde_json::to_value(obs).unwrap();
    let Some(keep) = sections else { return full };
    let mut out = serde_json::Map::new();
    if let Value::Object(map) = full {
        for (k, v) in map {
            if ["protocol_version", "match_id", "seat", "month", "round", "months_per_round", "horizon", "phase", "window"].contains(&k.as_str()) || keep.iter().any(|x| x == &k) {
                out.insert(k, v);
            }
        }
    }
    Value::Object(out)
}

fn packet<A: AgentSlot>(host: &Host<A>, seat: SeatId, receipts: Vec<Receipt>, submitted: bool, advanced: bool, view: &View) -> Value {
    let s = host.session.as_ref().unwrap();
    let obs = s.m.observe(seat);
    // the public building tree: in full when the client's copy differs, or, for a
    // client that names none, in the first round only (protocol 2.3); a brief packet
    // stays brief: it names the hash and carries the tree only for a stale copy
    // (agents read it with the get_building_tree tool)
    let tree = bts_engine::observe::building_tree();
    let inline = match view.known_tree_hash.as_deref() {
        Some(h) => h != tree.hash,
        None => obs.round <= 1 && !view.brief,
    };
    let limits = json!({"actions_per_submission": MAX_ACTIONS_PER_BATCH, "counterparts_per_round": 3,
                       "envelopes_per_pair_per_round": 10, "negotiation_windows": 5});
    if view.brief {
        let delegates = s.delegates.get(seat as usize).cloned().unwrap_or_default();
        let mut v = json!({
            "cursor": cursor(&obs), "view": "brief",
            "seat": seat, "round": obs.round, "phase": obs.phase, "window": obs.window, "date": obs.date,
            "briefing": crate::brief::briefing(&obs, &delegates),
            "standing_orders": obs.directives,
            "receipts": receipts,
            "submitted": submitted, "round_advanced": advanced,
            "waiting_for": s.m.waiting_on(),
            "action_reference": action_reference(&obs),
            "limits": limits,
            "sections": SECTIONS,
            "next": format!("{} For any detail the briefing leaves out, call get_turn with view full and sections naming the parts you need (for example [\"regions\"] or [\"catalog\"]).", next_text(&obs)),
            "building_tree_hash": tree.hash,
        });
        if inline {
            v["building_tree"] = serde_json::to_value(&tree).unwrap();
        }
        return v;
    }
    let observation = cut(&obs, &view.sections);
    let mut v = json!({
        "cursor": cursor(&obs), "action_reference": action_reference(&obs), "observation": observation, "receipts": receipts,
        "submitted": submitted, "round_advanced": advanced,
        "waiting_for": s.m.waiting_on(),
        "limits": limits,
        "next": next_text(&obs),
        "building_tree_hash": tree.hash,
    });
    if inline {
        v["building_tree"] = serde_json::to_value(&tree).unwrap();
    }
    v
}

pub(crate) fn get<A: AgentSlot>(host: &Host<A>, seat: SeatId, token: &str, view: &View) -> Result<Value> {
    host.seat_access(seat, token, false)?;
    Ok(packet(host, seat, vec![], false, false, view))
}

/// Apply one submission. The flag is false when the reply is the stored result of
/// an earlier identical request and nothing was applied again.
pub(crate) fn submit<A: AgentSlot>(host: &mut Host<A>, b: Submission) -> Result<(Value, bool)> {
    host.seat_access(b.seat, &b.token, true)?;
    if b.request_id.is_empty() || b.request_id.len() > 80 || !b.request_id.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c)) {
        return Err((400, "INVALID_SCHEMA", "request_id must contain 1–80 ASCII letters, digits, hyphens or underscores".into()));
    }
    if b.actions.len() > MAX_ACTIONS_PER_BATCH {
        return Err((400, "RATE_LIMITED", "at most 32 actions per submission".into()));
    }
    let view = View::of(&b);
    let s = host.session.as_ref().unwrap();
    let key = (format!("{}:{}", host.generation, s.m.match_id()), b.seat, b.request_id.clone());
    let fingerprint = serde_json::to_string(&b).unwrap();
    if let Some((original, response, _)) = host.turn_cache.entries.get(&key) {
        if original != &fingerprint { return Err((409, "IDEMPOTENCY_CONFLICT", "request_id already used with a different submission".into())); }
        return Ok((response.clone(), false));
    }
    if cursor(&s.m.observe(b.seat)) != b.cursor {
        return Err((409, "STALE_TURN", "the decision packet changed; get_turn before submitting again".into()));
    }
    let s = host.session.as_mut().unwrap();
    let before = s.m.round();
    let receipts = s.m.act(b.seat, b.actions);
    if let Some(slot) = host.agents.get_mut(b.seat as usize).and_then(|a| a.as_mut()) {
        slot.record(&b.token, &receipts);
    }
    let s = host.session.as_mut().unwrap();
    let accepted = receipts.iter().all(|r| matches!(r.status.as_str(), "accepted" | "applied"));
    if accepted && b.advance != Advance::None {
        s.m.set_ready(b.seat, b.advance == Advance::Round);
        s.drive();
        if s.m.try_advance() { s.drive(); }
    }
    let advanced = s.m.round() != before;
    let response = packet(host, b.seat, receipts, true, advanced, &view);
    let bytes = fingerprint.len() + response.to_string().len();
    if bytes <= 16 * 1024 * 1024 {
        let cache = &mut host.turn_cache;
        cache.bytes += bytes;
        cache.order.push_back(key.clone());
        cache.entries.insert(key, (fingerprint, response.clone(), bytes));
        while cache.order.len() > 128 || cache.bytes > 16 * 1024 * 1024 {
            if let Some(old) = cache.order.pop_front() {
                if let Some((_, _, size)) = cache.entries.remove(&old) { cache.bytes -= size; }
            }
        }
    }
    Ok((response, true))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::referee::{Config, NoAgents};
    use crate::session::Session;
    use bts_engine::MatchConfig;
    fn state() -> Host<NoAgents> {
        let cfg = MatchConfig { seed: "turn-packet".into(), regions: 24,
            controllers: vec![ControllerKind::External, ControllerKind::NativeEasy, ControllerKind::NativeEasy, ControllerKind::NativeEasy], ..Default::default() };
        let mut host = Host::new(Config { settle_inline: true, ..Default::default() });
        host.install(Session::new(cfg, 11), vec![None; 4]);
        host
    }
    fn order(st: &Host<NoAgents>, id: &str) -> Submission {
        Submission { seat: 0, token: String::new(), request_id: id.into(), cursor: get(st, 0, "", &View::default()).unwrap()["cursor"].as_str().unwrap().into(),
            actions: vec![Action::SetPolicy { setting: PolicySetting::Rename { name: "New identity".into() } }], advance: Advance::None, view: None, sections: None, known_tree_hash: None }
    }
    #[test]
    fn retry_never_reapplies_and_changed_payload_conflicts() {
        let mut st = state(); let b = order(&st, "retry");
        let text = serde_json::to_string(&b).unwrap();
        let (a, fresh) = submit(&mut st, b).unwrap();
        assert!(fresh);
        let hash = st.session.as_ref().unwrap().m.state_hash();
        let (b, fresh) = submit(&mut st, serde_json::from_str(&text).unwrap()).unwrap();
        assert!(!fresh, "a retry is answered from the stored result");
        assert_eq!(a, b); assert_eq!(hash, st.session.as_ref().unwrap().m.state_hash());
        let mut changed: Submission = serde_json::from_str(&text).unwrap(); changed.advance = Advance::Round;
        assert_eq!(submit(&mut st, changed).unwrap_err().1, "IDEMPOTENCY_CONFLICT");
    }
    #[test]
    fn stale_packet_changes_nothing_and_rejections_do_not_advance() {
        let mut st = state(); let mut b = order(&st, "mixed");
        b.actions.push(Action::StartProject { spec: ProjectSpec::Build { region: 65535, facility: "unknown".into(), levels: 1 }, priority: Some(5) }); b.advance = Advance::Round;
        let before = st.session.as_ref().unwrap().m.round();
        let (response, _) = submit(&mut st, b).unwrap();
        assert_eq!(before, st.session.as_ref().unwrap().m.round());
        assert_eq!(response["receipts"][0]["status"], "accepted");
        assert_eq!(response["receipts"][1]["status"], "rejected");
        let mut stale = order(&st, "stale"); stale.cursor = "outdated".into();
        let hash = st.session.as_ref().unwrap().m.state_hash();
        assert_eq!(submit(&mut st, stale).unwrap_err().1, "STALE_TURN");
        assert_eq!(hash, st.session.as_ref().unwrap().m.state_hash());
    }
    #[test]
    fn the_packet_carries_the_public_tree_only_when_the_client_lacks_it() {
        let st = state();
        let tree = bts_engine::observe::building_tree();
        let with = |h: &str| View { known_tree_hash: Some(h.into()), ..View::default() };
        let fresh = get(&st, 0, "", &with("0")).unwrap();
        assert_eq!(fresh["building_tree_hash"], tree.hash);
        assert_eq!(fresh["building_tree"]["hash"], tree.hash);
        let known = get(&st, 0, "", &with(&tree.hash)).unwrap();
        assert!(known.get("building_tree").is_none());
        assert_eq!(known["observation"]["building_tree_hash"], tree.hash);
        let brief = get(&st, 0, "", &View { brief: true, known_tree_hash: Some("0".into()), sections: None }).unwrap();
        assert_eq!(brief["building_tree"]["hash"], tree.hash, "the brief packet carries the tree too");
    }
    #[test]
    fn packets_enforce_seat_permissions_and_never_include_spectator_state() {
        let mut st = state();
        assert_eq!(get(&st, 255, "", &View::default()).unwrap_err().0, 403);
        assert_eq!(get(&st, 1, "", &View::default()).unwrap_err().0, 403, "a native seat's packet is closed while an external seat plays");
        st.cfg.require_tokens = true;
        assert_eq!(get(&st, 0, "bad-token", &View::default()).unwrap_err().0, 403);
        assert_eq!(get(&st, 1, "", &View::default()).unwrap_err().0, 403);
        let token = st.session.as_ref().unwrap().tokens[0].clone();
        let p = get(&st, 0, &token, &View::default()).unwrap();
        assert_eq!(p["observation"]["seat"], 0);
        assert!(p.get("spectator").is_none());
        assert!(p.get("seed").is_none());
        assert!(!p["action_reference"].to_string().contains("ftl"));
    }
    #[test]
    fn brief_and_sectioned_packets_stay_small_and_teach_standing_orders() {
        let mut st = state();
        let full = get(&st, 0, "", &View::default()).unwrap();
        let brief = get(&st, 0, "", &View::parse(Some("brief"), None)).unwrap();
        assert!(brief.get("observation").is_none());
        assert!(brief["briefing"].as_str().unwrap().contains("STANDING ORDERS"));
        assert!(brief["next"].as_str().unwrap().contains("standing orders"));
        assert!(brief["action_reference"]["examples"].as_array().unwrap().iter().any(|e| e["kind"] == "directive"));
        assert_eq!(brief["cursor"], full["cursor"], "both views describe the same decision point");
        assert!(brief.to_string().len() * 2 < full.to_string().len());
        let part = get(&st, 0, "", &View::parse(Some("full"), Some("regions,directives"))).unwrap();
        let obs = part["observation"].as_object().unwrap();
        assert!(obs.contains_key("regions") && obs.contains_key("directives") && obs.contains_key("round"));
        assert!(!obs.contains_key("catalog") && !obs.contains_key("chronicle"));
        // a brief reply to a submission carries the receipts
        let mut b = order(&st, "brief-reply");
        b.view = Some("brief".into());
        let (reply, _) = submit(&mut st, b).unwrap();
        assert_eq!(reply["view"], "brief");
        assert_eq!(reply["receipts"][0]["status"], "accepted");
    }
    #[test]
    fn one_submission_can_finish_a_round_and_return_the_next_observation() {
        let mut st = state(); let mut b = order(&st, "round");
        let before = st.session.as_ref().unwrap().m.round(); b.advance = Advance::Round;
        let (result, _) = submit(&mut st, b).unwrap();
        assert_eq!(result["observation"]["round"], before + 1);
        assert_eq!(result["round_advanced"], true);
    }
}
