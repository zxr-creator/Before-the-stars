//! LLM-driven seats.
//!
//! An agent seat is an ordinary external seat. A worker thread waits until the
//! referee is waiting on that seat, renders the seat's own observation into a
//! compact briefing, asks the configured model for orders, and submits them as
//! ordinary actions. The model never sees anything but that observation.
//!
//! A built-in steward keeps the civilization running in the domains the model
//! delegates, so a slow, failing or rarely consulted model does not stall it.

use crate::host::Session;
use crate::providers::{self, Provider};
use bts_protocol::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentConfig {
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "one")]
    pub consult_every: u32,
    /// Held in memory only; never written to a save.
    #[serde(skip)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
}

fn one() -> u32 {
    1
}

#[derive(Clone, Debug, Serialize)]
pub struct LogEntry {
    pub round: u32,
    pub month: Month,
    pub phase: Phase,
    pub note: String,
    pub actions: Vec<String>,
    pub accepted: u32,
    pub rejected: u32,
    pub duration_ms: u64,
    pub error: Option<String>,
}

pub struct AgentSeat {
    pub cfg: AgentConfig,
    pub state: String,
    pub last_note: String,
    pub calls: u32,
    pub last_error: Option<String>,
    pub log: Vec<LogEntry>,
    pub errors_in_row: u32,
    /// (round, phase, window) already handled, so one call is made per decision point.
    pub handled: (u32, Phase, u8),
    pub negotiate_calls: (u32, u8),
    pub thinking_since: Option<Instant>,
}

impl AgentSeat {
    pub fn new(cfg: AgentConfig) -> AgentSeat {
        AgentSeat { cfg, state: "idle".into(), last_note: String::new(), calls: 0, last_error: None, log: Vec::new(), errors_in_row: 0, handled: (0, Phase::Finished, 0), negotiate_calls: (0, 0), thinking_since: None }
    }
}

pub struct ServerState {
    pub session: Option<Session>,
    /// Bumped whenever a match is created or loaded; stale workers stop when it changes.
    pub generation: u64,
    pub agents: Vec<Option<AgentSeat>>,
    /// In an observer match nothing advances past this round until the observer asks.
    pub autoplay_until: u32,
    pub app_mode: bool,
    pub saves: PathBuf,
}

pub type Shared = Arc<Mutex<ServerState>>;

impl ServerState {
    pub fn may_run(&self) -> bool {
        match &self.session {
            Some(s) => !s.m.observer_allowed() || s.m.round() < self.autoplay_until,
            None => false,
        }
    }
    pub fn autosave(&self) {
        if let Some(s) = &self.session {
            let _ = std::fs::create_dir_all(&self.saves);
            let _ = std::fs::write(self.saves.join("autosave.json"), s.save());
        }
    }
}

const SYSTEM: &str = r#"You are the government of one civilization in "Before the Stars", a turn-based strategy game. Four civilizations compete; at most one can win. Each round is twelve simulated months. You see only what your own civilization knows.

How the world works
- People eat first. Of the labour left over, only a share can be called up for public projects; institutions raise that share. The rest staffs facilities. One person works one job.
- Facilities turn inputs into outputs each month and report what holds them back (workers, qualified staff, inputs, power, upkeep, storage).
- Qualified people come from courses that take real months, teachers, places and materials. Students do not work.
- Knowledge: practice and contact produce leads; following up a lead identifies a question; investigating it with qualified research staff makes it understood; building and operating makes it real. You only know what your people have discovered.
- Practices (institutions) are recognized by experience, enacted by reform once their real requirements exist, then adopted gradually.
- Other civilizations can be traded with, taught, allied with, fought, or brought under your authority. Messages are claims; only signed treaties bind.
- Goods, work and power are in milli-units in the data (1000 = one unit); shares are basis points (10000 = 100%).

Stewards
A steward can run any of these domains for you by ordinary rules of thumb: economy, research, education, culture, expansion, military. Delegate what you do not want to manage in detail and spend your own orders on judgement: priorities, diplomacy, timing, and correcting what the steward gets wrong. Diplomacy is always yours.

Your reply
Reply with one JSON object and nothing else:
{"note": "one or two sentences: what you are doing this round and why", "delegate": ["economy", "research", "education", "culture", "expansion", "military"], "actions": [ ... ]}
"delegate" lists the domains the steward runs from now on (omit the field to leave it unchanged; [] takes everything back). "actions" may be empty. At most 24 actions. Use only handles, ids, region numbers and keys that appear in the briefing. An invalid action is rejected and changes nothing.

Actions (JSON shapes)
- {"kind":"start_project","spec":{"kind":"build","region":R,"facility":"KEY","levels":1},"priority":5}   priority 0-9, lower is served first
- {"kind":"start_project","spec":{"kind":"research","tech":"HANDLE"}}
- {"kind":"investigate","lead":"HANDLE"}
- {"kind":"start_project","spec":{"kind":"survey","region":R}}
- {"kind":"start_project","spec":{"kind":"settle","from":R,"to":R,"people":60}}   20-400 people, adjacent unclaimed region
- {"kind":"start_project","spec":{"kind":"study","domain":"KEY"}}
- {"kind":"start_project","spec":{"kind":"recruit","region":R,"role":"assault|maneuver|denial","soldiers":100,"tier":T}}
- {"kind":"start_project","spec":{"kind":"religion","beliefs":["KEY"],"name":null}}
- {"kind":"start_project","spec":{"kind":"ftl_trial"}} / {"kind":"ftl_deployment"} / {"kind":"ftl_replacement"}
- {"kind":"manage_project","project":ID,"op":"pause|resume|cancel","priority":null}
- {"kind":"propose_reform","practice":"HANDLE"}
- {"kind":"start_program","region":R,"course":"E002","seats":8}
- {"kind":"manage_program","program":ID,"op":"pause|resume|cancel","seats":null}
- {"kind":"set_policy","setting":{"kind":"food_reserve_months","months":6}}
- {"kind":"set_policy","setting":{"kind":"labor_weight","category":"extraction|industry|services|knowledge|construction","weight":0-10}}
- {"kind":"military_order","army":ID,"order":{"kind":"hold"}} | {"kind":"move","to":R} | {"kind":"attack","region":R} | {"kind":"disband"}
- {"kind":"select_contacts","seats":[S,...]}   contact phase only, up to three
- {"kind":"message","to":S,"text":"...","intent":"inquiry|quotation|counteroffer|claim|need|warning|alliance_proposal"}   negotiation only
- {"kind":"propose_treaty","to":S,"clauses":[CLAUSE,...],"text":"..."}   negotiation only
- {"kind":"sign_treaty","offer":ID} / {"kind":"decline_offer","offer":ID} / {"kind":"withdraw_offer","offer":ID} / {"kind":"break_treaty","treaty":ID}
Clauses: {"kind":"goods","from":S,"good":"food","amount_per_month":50000,"months":1} | {"kind":"knowledge","from":S,"tech":"HANDLE"} | {"kind":"practice","from":S,"practice":"HANDLE"} | {"kind":"maps","from":S} | {"kind":"non_aggression","months":120} | {"kind":"defensive_pact","months":120} | {"kind":"peace"} | {"kind":"subordination","from":S,"tribute_bp":1000} | {"kind":"cede_region","from":S,"region":R}
In a negotiation window you may send one envelope (message, proposal or signature) per counterpart."#;

fn u(v: i64) -> String {
    let x = v as f64 / 1000.0;
    if x.abs() >= 100.0 { format!("{x:.0}") } else { format!("{x:.1}") }
}

/// Render a seat's observation as a compact briefing for a model.
pub fn briefing(obs: &Observation, delegates: &[String]) -> String {
    let mut s = String::new();
    let own: Vec<&RegionView> = obs.regions.iter().filter(|r| r.own.is_some()).collect();
    let name = |seat: SeatId| obs.others.iter().find(|o| o.seat == seat).map(|o| o.name.clone()).unwrap_or_else(|| if seat == obs.seat { obs.civ.name.clone() } else { format!("seat {seat}") });
    s += &format!("YEAR {} (round {} of {}), phase: {}{}. You are {} (seat {}).\n", obs.month / 12 + 1, obs.round, obs.horizon / obs.months_per_round, obs.phase.label(), if obs.phase == Phase::Negotiate { format!(" window {}", obs.window) } else { String::new() }, obs.civ.name, obs.seat);
    s += &format!("Steward currently runs: {}\n", if delegates.is_empty() { "nothing".to_string() } else { delegates.join(", ") });
    s += &format!("People {} (working age {}), stability {}/100, food access {}%, water {}%, callable labour {}%, administration {}/{} regions, military tier {}, people who would serve now {}.\n", obs.civ.population, obs.civ.working_age, obs.civ.stability, obs.civ.food_fulfillment_bp / 100, obs.civ.water_fulfillment_bp / 100, obs.civ.mobilization_cap_bp / 100, obs.civ.admin_load, obs.civ.admin_capacity, obs.civ.military_tier, obs.civ.recruit_room);
    let l = &obs.civ.labor;
    s += &format!("Labour: food {}, facilities {}, projects {}, without post {}, students {}, soldiers {}.\n", l.food, l.facilities, l.projects, l.household, l.students, l.soldiers);
    s += "\nSTOCK (units; last round made / used)\n";
    for g in obs.civ.goods.iter().filter(|g| g.stock != 0 || g.produced != 0 || g.consumed != 0) {
        s += &format!("  {} [{}]: {} ({} / {})\n", g.good.label(), serde_json::to_value(g.good).ok().and_then(|v| v.as_str().map(|x| x.to_string())).unwrap_or_default(), u(g.stock), u(g.produced), u(g.consumed));
    }
    s += "\nQUALIFIED PEOPLE (employed/total): ";
    s += &obs.civ.quals.iter().map(|q| format!("{} {}/{}", q.qual.label(), q.employed, q.count)).collect::<Vec<_>>().join("; ");
    s += "\nRESEARCH CAPACITY (used/capacity per month): ";
    s += &obs.civ.research.iter().map(|r| format!("{} {}/{}", r.class.label(), u(r.used), u(r.capacity))).collect::<Vec<_>>().join("; ");
    s += "\n\nYOUR REGIONS\n";
    for r in &own {
        let o = r.own.as_ref().unwrap();
        s += &format!("  region {} {} ({}{}{}): people {}, without post {}, water for {}, unrest {}%\n", r.id, r.name, r.terrain.label(), if r.river { ", river" } else { "" }, if r.coastal { ", coast" } else { "" }, o.population, o.labor.household, o.water_capacity, o.unrest_bp / 100);
        let facs: Vec<String> = o
            .facilities
            .iter()
            .map(|f| {
                let why: Vec<String> = f.runs.iter().flat_map(|x| x.blockers.clone()).collect();
                format!("{} L{}/{} {}%{}", f.kind, f.level, f.max_level, f.utilization_bp / 100, if why.is_empty() { String::new() } else { format!(" [{}]", why.join("; ")) })
            })
            .collect();
        if !facs.is_empty() {
            s += &format!("    facilities: {}\n", facs.join(", "));
        }
        if let Some(sv) = &r.survey {
            let dep: Vec<String> = sv.deposits.iter().map(|d| format!("{} {}", d.kind.label(), u(d.remaining))).collect();
            s += &format!("    land: arable {}, pasture {}, fishery {}, forest {}, hydro {}{}\n", sv.arable, sv.pasture, sv.fishery, sv.forest, sv.hydro, if dep.is_empty() { String::new() } else { format!("; deposits: {}", dep.join(", ")) });
        }
        let nb: Vec<String> = r.neighbors.iter().map(|n| {
            let t = obs.regions.iter().find(|x| x.id == n.region);
            match t {
                Some(t) => format!("{} {} ({}{})", n.region, t.name, match t.owner { Some(o) if o == obs.seat => "ours".to_string(), Some(o) => name(o), None => "unclaimed".to_string() }, if t.survey.is_some() { "" } else { ", unsurveyed" }),
                None => format!("{} (unknown)", n.region),
            }
        }).collect();
        s += &format!("    neighbours: {}\n", nb.join(", "));
    }
    s += "\nWHAT YOU CAN BUILD (key: name; cost; site)\n";
    for f in obs.catalog.facilities.iter().filter(|f| f.available) {
        let cost: Vec<String> = f.cost.iter().map(|c| format!("{} {}", c.good.label(), u(c.amount))).collect();
        s += &format!("  {}: {}; {}; work {}; {}\n", f.kind, f.name, if cost.is_empty() { "no goods".to_string() } else { cost.join(", ") }, u(f.work), f.site);
    }
    let locked: Vec<String> = obs.catalog.facilities.iter().filter(|f| !f.available).map(|f| format!("{} (needs: {})", f.name, f.requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.clone()).collect::<Vec<_>>().join("; "))).collect();
    if !locked.is_empty() {
        s += &format!("  Known but not yet possible: {}\n", locked.join(" | "));
    }
    s += "\nCOURSES AVAILABLE: ";
    s += &obs.catalog.courses.iter().filter(|c| c.available).map(|c| format!("{} {} -> {} ({} months, venue {})", c.key, c.name, c.output.label(), c.months, c.venue)).collect::<Vec<_>>().join("; ");
    s += "\nFORMATIONS AVAILABLE: ";
    s += &obs.catalog.unit_tiers.iter().filter(|t| t.available).map(|t| format!("tier {} {}", t.tier, t.name)).collect::<Vec<_>>().join("; ");
    s += "\n\nKNOWLEDGE\n";
    let understood = obs.knowledge.techs.iter().filter(|t| t.state >= KnowledgeState::Understood).count();
    s += &format!("  Understood: {} methods.{}\n", understood, if obs.knowledge.scientific_method { " The scientific method is established." } else { "" });
    for t in obs.knowledge.techs.iter().filter(|t| t.state < KnowledgeState::Understood) {
        let unmet: Vec<String> = t.known_requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.clone()).collect();
        s += &format!("  question {}: {} [{}; {} work left]{}{}\n", t.handle, t.name, t.class.label(), u(t.work_needed - t.work_done), if t.can_investigate { " — can investigate" } else { "" }, if unmet.is_empty() { String::new() } else { format!(" — missing: {}", unmet.join("; ")) });
    }
    for l in &obs.knowledge.leads {
        s += &format!("  lead {}: {} ({})\n", l.handle, l.title, l.source);
    }
    if !obs.knowledge.domains.is_empty() {
        s += &format!("  Study domains: {}\n", obs.knowledge.domains.iter().map(|d| d.key.clone()).collect::<Vec<_>>().join(", "));
    }
    s += "\nPRACTICES\n";
    let est: Vec<String> = obs.culture.practices.iter().filter(|p| p.state >= PracticeState::Enacted).map(|p| p.name.clone()).collect();
    s += &format!("  In force: {}\n", est.join("; "));
    for p in obs.culture.practices.iter().filter(|p| p.state < PracticeState::Enacted) {
        let unmet: Vec<String> = p.known_requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.clone()).collect();
        s += &format!("  practice {}: {}{}{}\n", p.handle, p.name, if p.can_reform { " — can be enacted now" } else { "" }, if unmet.is_empty() { String::new() } else { format!(" — missing: {}", unmet.join("; ")) });
    }
    if let Some(m) = &obs.culture.movement {
        s += &format!("  Religious movement in region {}: {} ({} taking part). {}\n", m.region, m.stage, m.participants, m.next_step.clone().unwrap_or_default());
    }
    if !obs.projects.is_empty() {
        s += "\nPROJECTS\n";
        for p in &obs.projects {
            s += &format!("  #{} [{}] {}: {}/{}{}{}\n", p.id, p.priority, p.title, u(p.work_done), u(p.work_needed), if p.paused { " (paused)" } else { "" }, if p.blockers.is_empty() { String::new() } else { format!(" — {}", p.blockers.join("; ")) });
        }
    }
    if !obs.programs.is_empty() {
        s += "\nTEACHING PROGRAMMES: ";
        s += &obs.programs.iter().map(|p| format!("#{} {} in region {}: {}/{} learners, month {}/{}{}{}", p.id, p.course, p.region, p.enrolled, p.seats, p.progress_months, p.months, if p.paused { " (paused)" } else { "" }, if p.blockers.is_empty() { String::new() } else { format!(" [{}]", p.blockers.join("; ")) })).collect::<Vec<_>>().join("; ");
        s += "\n";
    }
    if !obs.armies.is_empty() || !obs.foreign_armies.is_empty() {
        s += "\nFORCES\n";
        for a in &obs.armies {
            s += &format!("  army #{} {} in region {}: {} soldiers, tier {}, order {}{}{}\n", a.id, a.name, a.region, a.soldiers.iter().map(|(_, n)| *n).sum::<u32>(), a.tier, a.order, a.target.map(|t| format!(" -> {t}")).unwrap_or_default(), if a.training_months_left > 0 { format!(", training {} more months", a.training_months_left) } else { String::new() });
        }
        for a in &obs.foreign_armies {
            s += &format!("  seen: {} force of about {}-{} in region {}\n", name(a.owner), a.strength_low, a.strength_high, a.region);
        }
    }
    s += "\nOTHER CIVILIZATIONS\n";
    if obs.others.is_empty() {
        s += "  None met yet.\n";
    }
    for o in &obs.others {
        s += &format!("  seat {} {}: trust {}/100{}{}; about {}-{} people in {} known regions; {}\n", o.seat, o.name, o.trust, if o.at_war { ", AT WAR WITH US" } else { "" }, o.overlord.map(|x| format!(", answers to {}", name(x))).unwrap_or_default(), o.population_low, o.population_high, o.regions_known, o.military_estimate);
    }
    let d = &obs.diplomacy;
    if !d.channels.is_empty() {
        s += &format!("  Channels: {}\n", d.channels.iter().map(|c| format!("seat {} {} ({} of {} envelopes used{})", c.seat, if c.open { "open" } else { "closed" }, c.envelopes_used, c.envelopes_limit, if c.sent_this_window { ", already sent this window" } else { "" })).collect::<Vec<_>>().join("; "));
    }
    for o in d.offers.iter().filter(|o| o.status == "open") {
        s += &format!("  offer #{} from {} to {}: {}{}\n", o.id, name(o.from), name(o.to), o.summary.join("; "), if o.text.is_empty() { String::new() } else { format!(" — \"{}\"", o.text) });
    }
    let recent: Vec<&MessageView> = d.messages.iter().filter(|m| m.round + 1 >= obs.round).collect();
    for m in recent.iter().skip(recent.len().saturating_sub(8)) {
        s += &format!("  message (round {} window {}) {} -> {}: \"{}\"\n", m.round, m.window, name(m.from), name(m.to), m.text);
    }
    for t in d.treaties.iter().filter(|t| t.status == "active") {
        s += &format!("  treaty #{} with {}: {}\n", t.id, name(if t.parties[0] == obs.seat { t.parties[1] } else { t.parties[0] }), t.summary.join("; "));
    }
    s += "\nOBJECTIVES\n";
    for a in &obs.objectives.agendas {
        s += &format!("  {}: {} ({})\n", a.title, a.description, a.progress);
    }
    if let Some(v) = &obs.objectives.victory {
        s += &format!("  FINAL OBJECTIVE: {}\n  Governance months {}/{}, jump capability months {}/{}, qualifying trials {}.\n", v.summary, v.governance_months, v.governance_needed, v.ftl_months, v.ftl_needed, v.trials.len());
        for c in v.governance_checks.iter().chain(v.ftl_checks.iter()).filter(|c| !c.ok) {
            s += &format!("    not yet: {} — {}\n", c.label, c.detail);
        }
    }
    if !obs.briefing.is_empty() {
        s += "\nWHAT HAPPENED LAST ROUND\n";
        for b in obs.briefing.iter().take(14) {
            s += &format!("  [{}] {} — {}\n", b.severity, b.title, b.detail);
        }
    }
    let rejected: Vec<String> = obs.receipts.iter().filter(|r| r.status == "rejected").rev().take(8).map(|r| format!("{}: {}", r.action, r.reason)).collect();
    if !rejected.is_empty() {
        s += &format!("\nYOUR RECENT REJECTED ORDERS: {}\n", rejected.join(" | "));
    }
    s += match obs.phase {
        Phase::Negotiate => "\nThis is a negotiation window: answer offers, send at most one envelope per open channel, or do nothing. Planning orders are also accepted now.",
        _ => "\nThis is the planning phase: give this round's orders.",
    };
    s
}

#[derive(Default)]
pub struct Parsed {
    pub note: String,
    pub delegate: Option<Vec<String>>,
    pub actions: Vec<Action>,
    pub invalid: Vec<String>,
}

/// Extract the JSON object from a model reply. Anything unusable is reported, never guessed.
pub fn parse_reply(text: &str) -> Result<Parsed, String> {
    let start = text.find('{').ok_or("the reply contained no JSON object")?;
    let end = text.rfind('}').ok_or("the reply contained no JSON object")?;
    if end <= start {
        return Err("the reply contained no JSON object".into());
    }
    let v: serde_json::Value = serde_json::from_str(&text[start..=end]).map_err(|e| format!("the reply was not valid JSON: {e}"))?;
    let mut out = Parsed { note: v["note"].as_str().unwrap_or("").chars().take(600).collect(), ..Default::default() };
    if let Some(list) = v["delegate"].as_array() {
        out.delegate = Some(list.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect());
    }
    if let Some(list) = v["actions"].as_array() {
        for a in list.iter().take(24) {
            match serde_json::from_value::<Action>(a.clone()) {
                Ok(Action::Forfeit) => out.invalid.push("forfeit is not accepted from an agent seat".into()),
                Ok(action) => out.actions.push(action),
                Err(e) => out.invalid.push(format!("{}: {e}", a["kind"].as_str().unwrap_or("?"))),
            }
        }
    }
    Ok(out)
}

fn action_label(a: &Action) -> String {
    let v = serde_json::to_value(a).unwrap_or_default();
    let kind = v["kind"].as_str().unwrap_or("?").to_string();
    match v["spec"]["kind"].as_str() {
        Some(k) => format!("{kind}:{k}"),
        None => kind,
    }
}

/// Start a worker for one agent seat. It stops when the match generation changes.
pub fn spawn(shared: Shared, seat: SeatId, generation: u64) {
    std::thread::spawn(move || worker(shared, seat, generation));
}

fn worker(shared: Shared, seat: SeatId, generation: u64) {
    let si = seat as usize;
    let mut nap = true;
    loop {
        // rest only when there was nothing to do; routine phases pass without delay
        if nap {
            std::thread::sleep(Duration::from_millis(150));
        }
        nap = true;
        // ---- decide, under the lock, whether there is something to do ----------
        let job = {
            let mut guard = shared.lock().unwrap();
            let st = &mut *guard;
            if st.generation != generation {
                return;
            }
            let may_run = st.may_run();
            let Some(session) = st.session.as_mut() else { return };
            if session.m.finished() {
                if let Some(a) = st.agents[si].as_mut() {
                    a.state = "idle".into();
                }
                return;
            }
            if !may_run || !session.m.waiting_on().contains(&seat) {
                continue;
            }
            let Some(agent) = st.agents[si].as_mut() else { return };
            let (round, phase, window) = (session.m.round(), session.m.phase(), session.m.window());
            let point = (round, phase, window);
            if agent.handled == point {
                continue;
            }
            agent.handled = point;
            let consult_round = round == 1 || agent.cfg.consult_every <= 1 || round % agent.cfg.consult_every == 0;
            let stopped = agent.state == "stopped";
            let obs = session.m.observe(seat);
            let mut quick: Vec<Action> = Vec::new();
            let consult = match phase {
                Phase::Contact => {
                    // choosing whom to talk to needs no model: open a channel to everyone known
                    let seats: Vec<SeatId> = obs.others.iter().filter(|o| o.contacted && o.status != SeatStatus::Eliminated).map(|o| o.seat).take(MAX_CONTACTS).collect();
                    if !seats.is_empty() {
                        quick.push(Action::SelectContacts { seats });
                    }
                    false
                }
                Phase::Negotiate => {
                    let open = obs.diplomacy.channels.iter().any(|c| c.open);
                    let incoming = obs.diplomacy.offers.iter().any(|o| o.to == seat && o.status == "open") || obs.diplomacy.messages.iter().any(|m| m.to == seat && m.round == round && m.window + 1 == window);
                    if agent.negotiate_calls.0 != round {
                        agent.negotiate_calls = (round, 0);
                    }
                    // at most two consultations per round: the opening window, and once more if something arrives
                    let wanted = open && consult_round && !stopped && ((window == 1) || (incoming && agent.negotiate_calls.1 < 2));
                    if wanted {
                        agent.negotiate_calls.1 += 1;
                    }
                    wanted
                }
                Phase::Plan => consult_round && !stopped,
                Phase::Finished => false,
            };
            if !consult {
                if !quick.is_empty() {
                    session.m.act(seat, quick);
                }
                session.m.set_ready(seat, false);
                session.drive();
                let round_now = session.m.round();
                if round_now != round {
                    st.autosave();
                }
                nap = false;
                continue;
            }
            agent.state = "thinking".into();
            agent.thinking_since = Some(Instant::now());
            let delegates = session.delegates[si].clone();
            Some((obs, delegates, agent.cfg.clone(), point))
        };
        let Some((obs, delegates, cfg, point)) = job else { continue };

        // ---- ask the model, without holding the lock ----------------------------
        let started = Instant::now();
        let user = briefing(&obs, &delegates);
        let provider = Provider::parse(&cfg.provider).unwrap_or(Provider::ClaudeApi);
        let reply = providers::call(&providers::Request { provider, model: &cfg.model, api_key: cfg.api_key.as_deref(), base_url: cfg.base_url.as_deref(), effort: cfg.effort.as_deref(), system: SYSTEM, user: &user });
        let parsed = reply.and_then(|text| parse_reply(&text));

        // ---- apply, if the world is still where we left it -----------------------
        let mut guard = shared.lock().unwrap();
        let st = &mut *guard;
        if st.generation != generation {
            return;
        }
        let Some(session) = st.session.as_mut() else { return };
        let Some(agent) = st.agents[si].as_mut() else { return };
        agent.thinking_since = None;
        agent.calls += 1;
        let still = (session.m.round(), session.m.phase(), session.m.window()) == point && session.m.waiting_on().contains(&seat);
        let mut entry = LogEntry { round: point.0, month: session.m.month(), phase: point.1, note: String::new(), actions: Vec::new(), accepted: 0, rejected: 0, duration_ms: started.elapsed().as_millis() as u64, error: None };
        match parsed {
            Ok(p) => {
                agent.errors_in_row = 0;
                agent.last_error = None;
                agent.state = "idle".into();
                agent.last_note = p.note.clone();
                entry.note = p.note;
                if still {
                    if let Some(d) = p.delegate {
                        session.set_delegates(seat, d);
                    }
                    entry.actions = p.actions.iter().map(action_label).collect();
                    let receipts = session.m.act(seat, p.actions);
                    entry.accepted = receipts.iter().filter(|r| r.status == "accepted").count() as u32;
                    entry.rejected = receipts.iter().filter(|r| r.status != "accepted").count() as u32 + p.invalid.len() as u32;
                    if !p.invalid.is_empty() {
                        entry.error = Some(format!("unusable orders: {}", p.invalid.join("; ")));
                    }
                } else {
                    entry.error = Some("the round moved on before the reply arrived; orders discarded".into());
                }
            }
            Err(e) => {
                agent.errors_in_row += 1;
                agent.last_error = Some(e.clone());
                // after repeated failures the steward carries on alone; nothing is retried forever
                agent.state = if agent.errors_in_row >= 3 { "stopped".into() } else { "error".into() };
                entry.error = Some(e);
                if session.delegates[si].is_empty() {
                    session.set_delegates(seat, bts_ai::NativeAi::steward_domains().iter().map(|d| d.to_string()).collect());
                }
            }
        }
        agent.log.push(entry);
        if agent.log.len() > 400 {
            let cut = agent.log.len() - 400;
            agent.log.drain(0..cut);
        }
        if still {
            let round = session.m.round();
            session.m.set_ready(seat, false);
            session.drive();
            if session.m.round() != round || session.m.finished() {
                st.autosave();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bts_engine::{Match, MatchConfig};

    #[test]
    fn replies_are_parsed_strictly_and_bad_orders_are_reported() {
        let p = parse_reply("Sure.\n```json\n{\"note\":\"n\",\"delegate\":[\"economy\"],\"actions\":[{\"kind\":\"investigate\",\"lead\":\"kabc\"},{\"kind\":\"bogus\"},{\"kind\":\"forfeit\"}]}\n```").unwrap();
        assert_eq!(p.note, "n");
        assert_eq!(p.delegate, Some(vec!["economy".to_string()]));
        assert_eq!(p.actions.len(), 1);
        assert_eq!(p.invalid.len(), 2, "an unknown action and a forfeit are both refused");
        assert!(parse_reply("no json here").is_err());
        assert!(parse_reply("{not json}").is_err());
    }

    #[test]
    fn the_briefing_shows_only_what_the_seat_can_see() {
        let m = Match::new(MatchConfig { seed: "brief".into(), regions: 24, ..Default::default() }, 1);
        let text = briefing(&m.observe(0), &[]);
        assert!(text.contains("YOUR REGIONS"));
        assert!(text.contains("WHAT YOU CAN BUILD"));
        for hidden in ["Programmable computers", "spacetime", "FINAL OBJECTIVE", "T162"] {
            assert!(!text.contains(hidden), "briefing leaks {hidden}");
        }
        assert!(text.len() < 12_000, "an opening briefing should be compact, got {}", text.len());
    }
}
