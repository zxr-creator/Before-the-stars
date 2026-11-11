//! A seat's observation as a compact text briefing for a language model.
//!
//! The full observation of a large civilization runs to hundreds of kilobytes; a
//! model is better served by a page that says what matters and points at the rest.
//! Everything here is drawn from that one seat's [`Observation`] and nothing else,
//! so the briefing can never show more than the seat itself may know. Long lists
//! are cut to their most relevant entries with a count of what was left out; the
//! full observation stays available through `get_turn` with `view: "full"`.

use bts_protocol::*;

/// Quantities in base units shown as display units (1,000 base units = one unit).
fn u(v: i64) -> String {
    let x = v as f64 / 1000.0;
    if x.abs() >= 100.0 {
        format!("{x:.0}")
    } else {
        format!("{x:.1}")
    }
}

fn years(months: u32) -> String {
    if months % 12 == 0 {
        let y = months / 12;
        if y == 1 { "1 year".into() } else { format!("{y} years") }
    } else {
        format!("{months} months")
    }
}

/// `items` joined with "; ", cut after `max` entries with a note of how many more there were.
fn capped(items: Vec<String>, max: usize, more: &str) -> String {
    let n = items.len();
    let mut out: Vec<String> = items.into_iter().take(max).collect();
    if n > max {
        out.push(format!("... and {} more {more}", n - max));
    }
    out.join("; ")
}

fn snake<T: serde::Serialize>(v: &T) -> String {
    serde_json::to_value(v).ok().and_then(|x| x.as_str().map(str::to_string)).unwrap_or_default()
}

/// What a standing order stands for, in one line.
pub fn directive_line(d: &Directive) -> String {
    match d {
        Directive::BuildTarget { region, facility, levels, priority } => format!("keep {levels} levels of {facility} in region {region}{}", priority.map(|p| format!(" (priority {p})")).unwrap_or_default()),
        Directive::ResearchAgenda { techs } => format!("research agenda: {}", techs.join(", ")),
        Directive::AutoResearch { on } => format!("automatic research {}", if *on { "on" } else { "off" }),
        Directive::ReformAgenda { practices } => format!("reform agenda: {}", practices.join(", ")),
        Directive::SettleTarget { from, to, people, when_crowd_bp } => format!("settle region {to} from {from} with {people} people once {from} is {}% full", when_crowd_bp / 100),
    }
}

/// Render a seat's observation as a compact briefing. `delegates` are the domains a
/// steward currently runs for the seat.
pub fn briefing(obs: &Observation, delegates: &[String]) -> String {
    let mut s = String::new();
    let own: Vec<&RegionView> = obs.regions.iter().filter(|r| r.own.is_some()).collect();
    let name = |seat: SeatId| obs.others.iter().find(|o| o.seat == seat).map(|o| o.name.clone()).unwrap_or_else(|| if seat == obs.seat { obs.civ.name.clone() } else { format!("seat {seat}") });

    // ---- where we are in time ----------------------------------------------------
    match &obs.calendar {
        Some(c) => {
            s += &format!(
                "{} — round {} of {}, phase {}{}. You are {} (seat {}).\n",
                obs.date.as_ref().map(|d| d.label.clone()).unwrap_or_default(),
                obs.round,
                c.rounds,
                obs.phase.label(),
                if obs.phase == Phase::Negotiate { format!(" window {} of {}", obs.window, NEGOTIATION_WINDOWS) } else { String::new() },
                obs.civ.name,
                obs.seat
            );
            s += &format!(
                "This round resolves {} ({} to {}); the next lasts {}. The match ends without a winner at {}. Orders given now are carried out once; standing orders act every January inside the round.\n",
                years(c.round_months),
                c.round_start.label,
                c.round_end.label,
                years(c.next_round_months),
                c.horizon.label
            );
        }
        None => {
            s += &format!("Year {} (round {}), phase {}. You are {} (seat {}).\n", obs.month / 12 + 1, obs.round, obs.phase.label(), obs.civ.name, obs.seat);
        }
    }
    s += &format!("Steward currently runs: {}\n", if delegates.is_empty() { "nothing".to_string() } else { delegates.join(", ") });

    // ---- the civilization at a glance ----------------------------------------------
    let c = &obs.civ;
    s += &format!(
        "People {} (working age {}; births {} and deaths {} last round), stability {}/100, food {}%, water {}%, callable labour {}%, administration {}/{} regions, military tier {}, would serve now {}.\n",
        c.population,
        c.working_age,
        c.births_last_round,
        c.deaths_last_round,
        c.stability,
        c.food_fulfillment_bp / 100,
        c.water_fulfillment_bp / 100,
        c.mobilization_cap_bp / 100,
        c.admin_load,
        c.admin_capacity,
        c.military_tier,
        c.recruit_room
    );
    let l = &c.labor;
    s += &format!("Labour: food {}, facilities {}, projects {}, without post {}, students {}, teachers {}, soldiers {}.\n", l.food, l.facilities, l.projects, l.household, l.students, l.teachers, l.soldiers);
    let p = &c.policies;
    let weights: Vec<String> = p.labor_weights.iter().map(|(k, w)| format!("{} {w}", snake(k))).collect();
    s += &format!("Policies: food reserve {} months, mobilization {}%, labour weights {}.", p.food_reserve_months, p.mobilization_bp / 100, weights.join(", "));
    for w in &p.war_policies {
        s += &format!(" War policy toward {}: white peace after {} months, cede at most {} regions.", name(w.seat), w.accept_white_peace_after_months.map(|m| m.to_string()).unwrap_or_else(|| "never".into()), w.accept_cession_max);
    }
    s += "\n";
    if c.overlord.is_some() || !c.subordinates.is_empty() {
        s += &format!("Authority: {}{}\n", c.overlord.map(|o| format!("we answer to {}. ", name(o))).unwrap_or_default(), if c.subordinates.is_empty() { String::new() } else { format!("Answering to us: {}.", c.subordinates.iter().map(|x| name(*x)).collect::<Vec<_>>().join(", ")) });
    }

    // ---- goods ------------------------------------------------------------------------
    let span = obs.calendar.as_ref().map(|c| c.last_round_months).unwrap_or(0);
    s += &format!("\nGOODS (stock; made / used over the last round{})\n", if span > 0 { format!(", {}", years(span)) } else { String::new() });
    let mut goods: Vec<&GoodLine> = c.goods.iter().filter(|g| g.stock != 0 || g.produced != 0 || g.consumed != 0).collect();
    goods.sort_by_key(|g| std::cmp::Reverse(g.produced.max(g.consumed).max(g.stock)));
    let lines: Vec<String> = goods
        .iter()
        .map(|g| {
            let short = if g.consumed > g.produced + g.traded_in && g.stock < g.consumed / 4 { " SHORT" } else { "" };
            format!("{} {} ({}/{}){short}", snake(&g.good), u(g.stock), u(g.produced), u(g.consumed))
        })
        .collect();
    s += &format!("  {}\n", capped(lines, 36, "goods"));
    s += &format!("QUALIFIED PEOPLE (employed/total): {}\n", c.quals.iter().filter(|q| q.count > 0).map(|q| format!("{} {}/{}", q.qual.label(), q.employed, q.count)).collect::<Vec<_>>().join("; "));
    s += &format!("RESEARCH (used/capacity per month): {}\n", c.research.iter().map(|r| format!("{} {}/{}", r.class.label(), u(r.used), u(r.capacity))).collect::<Vec<_>>().join("; "));

    // ---- regions ----------------------------------------------------------------------
    let mut regions = own.clone();
    regions.sort_by_key(|r| std::cmp::Reverse(r.own.as_ref().map(|o| o.population).unwrap_or(0)));
    let detail = if regions.len() > 10 { 8 } else { regions.len() };
    s += &format!("\nYOUR REGIONS ({}; capital {})\n", regions.len(), c.capital);
    for (i, r) in regions.iter().enumerate() {
        let o = r.own.as_ref().unwrap();
        let unrest = if o.unrest_bp >= 1000 { format!(", unrest {}%", o.unrest_bp / 100) } else { String::new() };
        if i >= detail {
            let troubled: Vec<String> = o.facilities.iter().filter(|f| f.runs.iter().any(|x| !x.blockers.is_empty())).map(|f| f.kind.clone()).collect();
            s += &format!("  region {} {}: people {}, {} works{}{}\n", r.id, r.name, o.population, o.facilities.len(), unrest, if troubled.is_empty() { String::new() } else { format!(", held back: {}", capped(troubled, 4, "")) });
            continue;
        }
        s += &format!(
            "  region {} {} ({}{}{}): people {}, without post {}, water for {}, food {}%{}\n",
            r.id,
            r.name,
            r.terrain.label(),
            if r.river { ", river" } else { "" },
            if r.coastal { ", coast" } else { "" },
            o.population,
            o.labor.household,
            o.water_capacity,
            o.food_fulfillment_bp / 100,
            unrest
        );
        // works that run well are listed by kind and level; works held back say why
        let mut fine: Vec<String> = Vec::new();
        let mut held: Vec<String> = Vec::new();
        for f in &o.facilities {
            let why: Vec<String> = f.runs.iter().flat_map(|x| x.blockers.clone()).collect();
            if why.is_empty() {
                fine.push(format!("{} L{}", f.kind, f.level));
            } else {
                let mut why = why;
                why.dedup();
                held.push(format!("{} L{} {}% [{}]", f.kind, f.level, f.utilization_bp / 100, why.into_iter().take(2).collect::<Vec<_>>().join("; ")));
            }
        }
        if !fine.is_empty() {
            s += &format!("    works: {}\n", capped(fine, 14, "works"));
        }
        if !held.is_empty() {
            s += &format!("    held back: {}\n", capped(held, 6, "works held back"));
        }
        if !o.productivity.is_empty() {
            s += &format!("    productivity: {}\n", o.productivity.iter().map(|p| format!("{} {}%", snake(&p.sector), p.total_bp / 100)).collect::<Vec<_>>().join(", "));
        }
        if let Some(sv) = &r.survey {
            let dep: Vec<String> = sv.deposits.iter().map(|d| format!("{} {}", snake(&d.kind), u(d.remaining))).collect();
            s += &format!("    land: arable {}, pasture {}, fishery {}, forest {}, hydro {}{}\n", sv.arable, sv.pasture, sv.fishery, sv.forest, sv.hydro, if dep.is_empty() { String::new() } else { format!("; deposits: {}", capped(dep, 6, "")) });
        }
        let nb: Vec<String> = r
            .neighbors
            .iter()
            .filter_map(|n| {
                let t = obs.regions.iter().find(|x| x.id == n.region)?;
                if t.owner == Some(obs.seat) {
                    return None;
                }
                Some(format!("{} {} ({}{})", n.region, t.name, match t.owner { Some(o) => name(o), None => "unclaimed".to_string() }, if t.survey.is_some() { "" } else { ", unsurveyed" }))
            })
            .collect();
        if !nb.is_empty() {
            s += &format!("    beyond our border: {}\n", capped(nb, 6, ""));
        }
    }

    // ---- standing orders ------------------------------------------------------------------
    s += "\nSTANDING ORDERS (act every January inside the round, in this order)\n";
    if obs.directives.is_empty() {
        s += "  none. With rounds of many years, standing orders are how a government keeps building, researching and reforming between its decisions.\n";
    }
    for d in obs.directives.iter().take(24) {
        s += &format!("  #{} {}{}\n", d.id, directive_line(&d.directive), if d.last_result.is_empty() { String::new() } else { format!(" — last: {} ({})", d.last_result, d.last_status) });
    }
    if obs.directives.len() > 24 {
        s += &format!("  ... and {} more standing orders\n", obs.directives.len() - 24);
    }

    // ---- what can be built and taught -----------------------------------------------------
    let built: std::collections::HashSet<&str> = own.iter().flat_map(|r| r.own.as_ref().unwrap().facilities.iter().map(|f| f.kind.as_str())).collect();
    let avail: Vec<&FacilityType> = obs.catalog.facilities.iter().filter(|f| f.available).collect();
    s += &format!("\nWHAT YOU CAN BUILD ({} types; key: name; cost; site)\n", avail.len());
    let mut new_first: Vec<&FacilityType> = avail.clone();
    // types we have never built first: they are the news; the rest by key
    new_first.sort_by_key(|f| (built.contains(f.kind.as_str()), f.kind.clone()));
    for f in new_first.iter().take(40) {
        let cost: Vec<String> = f.cost.iter().take(4).map(|c| format!("{} {}", snake(&c.good), u(c.amount))).collect();
        s += &format!("  {}: {}; {}; work {}; {}\n", f.kind, f.name, if cost.is_empty() { "no goods".to_string() } else { cost.join(", ") }, u(f.work), f.site);
    }
    if new_first.len() > 40 {
        s += &format!("  ... and {} more (all of them, with full costs, under catalog in the full observation)\n", new_first.len() - 40);
    }
    let locked: Vec<String> = obs.catalog.facilities.iter().filter(|f| !f.available).map(|f| format!("{} (needs: {})", f.kind, f.requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.clone()).take(2).collect::<Vec<_>>().join("; "))).collect();
    if !locked.is_empty() {
        s += &format!("  Known but not yet possible: {}\n", capped(locked, 10, "types"));
    }
    s += &format!("COURSES: {}\n", capped(obs.catalog.courses.iter().filter(|c| c.available).map(|c| format!("{} {} -> {} ({} months, venue {})", c.key, c.name, c.output.label(), c.months, c.venue)).collect(), 16, "courses"));
    s += &format!("FORMATIONS: {}\n", obs.catalog.unit_tiers.iter().filter(|t| t.available).map(|t| format!("tier {} {}", t.tier, t.name)).collect::<Vec<_>>().join("; "));

    // ---- knowledge and practices -------------------------------------------------------------
    s += "\nKNOWLEDGE\n";
    let understood = obs.knowledge.techs.iter().filter(|t| t.state >= KnowledgeState::Understood).count();
    s += &format!("  Understood: {} methods.{}\n", understood, if obs.knowledge.scientific_method { " The scientific method is established." } else { "" });
    let mut open: Vec<&TechCard> = obs.knowledge.techs.iter().filter(|t| t.state < KnowledgeState::Understood).collect();
    open.sort_by_key(|t| (!t.can_investigate, t.work_needed - t.work_done));
    for t in open.iter().take(18) {
        let unmet: Vec<String> = t.known_requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.clone()).take(2).collect();
        s += &format!("  question {}: {} [{}; {} work left]{}{}\n", t.handle, t.name, t.class.label(), u(t.work_needed - t.work_done), if t.can_investigate { " — can investigate" } else { "" }, if unmet.is_empty() { String::new() } else { format!(" — missing: {}", unmet.join("; ")) });
    }
    if open.len() > 18 {
        s += &format!("  ... and {} more open questions\n", open.len() - 18);
    }
    for l in obs.knowledge.leads.iter().take(12) {
        s += &format!("  lead {}: {} ({})\n", l.handle, l.title, l.source);
    }
    if obs.knowledge.leads.len() > 12 {
        s += &format!("  ... and {} more leads\n", obs.knowledge.leads.len() - 12);
    }
    if !obs.knowledge.domains.is_empty() {
        s += &format!("  Study domains: {}\n", obs.knowledge.domains.iter().map(|d| d.key.clone()).collect::<Vec<_>>().join(", "));
    }
    s += "\nPRACTICES\n";
    let est: Vec<String> = obs.culture.practices.iter().filter(|p| p.state >= PracticeState::Enacted).map(|p| p.name.clone()).collect();
    s += &format!("  In force ({}): {}\n", est.len(), capped(est, 14, ""));
    let mut pending: Vec<&PracticeCard> = obs.culture.practices.iter().filter(|p| p.state < PracticeState::Enacted).collect();
    pending.sort_by_key(|p| !p.can_reform);
    for p in pending.iter().take(10) {
        let unmet: Vec<String> = p.known_requirements.iter().filter(|r| !r.satisfied).map(|r| r.text.clone()).take(2).collect();
        s += &format!("  practice {}: {}{}{}\n", p.handle, p.name, if p.can_reform { " — can be enacted now" } else { "" }, if unmet.is_empty() { String::new() } else { format!(" — missing: {}", unmet.join("; ")) });
    }
    if pending.len() > 10 {
        s += &format!("  ... and {} more practices not yet in force\n", pending.len() - 10);
    }
    if let Some(m) = &obs.culture.movement {
        s += &format!("  Religious movement in region {}: {} ({} taking part). {}\n", m.region, m.stage, m.participants, m.next_step.clone().unwrap_or_default());
    }

    // ---- what is under way ----------------------------------------------------------------------
    if !obs.projects.is_empty() {
        s += &format!("\nPROJECTS ({})\n", obs.projects.len());
        for p in obs.projects.iter().take(20) {
            s += &format!("  #{} [{}] {}: {}/{}{}{}\n", p.id, p.priority, p.title, u(p.work_done), u(p.work_needed), if p.paused { " (paused)" } else { "" }, if p.blockers.is_empty() { String::new() } else { format!(" — {}", p.blockers.iter().take(2).cloned().collect::<Vec<_>>().join("; ")) });
        }
        if obs.projects.len() > 20 {
            s += &format!("  ... and {} more projects\n", obs.projects.len() - 20);
        }
    }
    if !obs.programs.is_empty() {
        s += &format!(
            "TEACHING: {}\n",
            capped(obs.programs.iter().map(|p| format!("#{} {} in region {}: {}/{} learners, month {}/{}{}{}", p.id, p.course, p.region, p.enrolled, p.seats, p.progress_months, p.months, if p.paused { " (paused)" } else { "" }, if p.blockers.is_empty() { String::new() } else { format!(" [{}]", p.blockers.join("; ")) })).collect(), 10, "programmes")
        );
    }
    if !obs.armies.is_empty() || !obs.foreign_armies.is_empty() {
        s += "\nFORCES\n";
        for a in obs.armies.iter().take(12) {
            s += &format!("  army #{} {} in region {}: {} soldiers, tier {}, order {}{}{}\n", a.id, a.name, a.region, a.soldiers.iter().map(|(_, n)| *n).sum::<u32>(), a.tier, a.order, a.target.map(|t| format!(" -> {t}")).unwrap_or_default(), if a.training_months_left > 0 { format!(", training {} more months", a.training_months_left) } else { String::new() });
        }
        for a in obs.foreign_armies.iter().take(10) {
            s += &format!("  seen: {} force of about {}-{} in region {}\n", name(a.owner), a.strength_low, a.strength_high, a.region);
        }
    }

    // ---- other civilizations and diplomacy --------------------------------------------------------
    s += "\nOTHER CIVILIZATIONS\n";
    if obs.others.is_empty() {
        s += "  None met yet.\n";
    }
    for o in &obs.others {
        s += &format!(
            "  seat {} {}{}: trust {}/100{}{}; about {}-{} people in {} known regions; {}\n",
            o.seat,
            o.name,
            if o.contacted { "" } else { " (not met)" },
            o.trust,
            if o.at_war { ", AT WAR WITH US" } else { "" },
            o.overlord.map(|x| format!(", answers to {}", name(x))).unwrap_or_default(),
            o.population_low,
            o.population_high,
            o.regions_known,
            o.military_estimate
        );
    }
    let d = &obs.diplomacy;
    if !d.channels.is_empty() {
        s += &format!("  Channels: {}\n", d.channels.iter().map(|c| format!("seat {} {} ({} of {} envelopes used{})", c.seat, if c.open { "open" } else { "closed" }, c.envelopes_used, c.envelopes_limit, if c.sent_this_window { ", already sent this window" } else { "" })).collect::<Vec<_>>().join("; "));
    }
    for o in d.offers.iter().filter(|o| o.status == "open") {
        s += &format!("  offer #{} from {} to {}: {}{}\n", o.id, name(o.from), name(o.to), o.summary.join("; "), if o.text.is_empty() { String::new() } else { format!(" — \"{}\"", o.text.chars().take(300).collect::<String>()) });
    }
    let recent: Vec<&MessageView> = d.messages.iter().filter(|m| m.round + 1 >= obs.round).collect();
    for m in recent.iter().skip(recent.len().saturating_sub(8)) {
        s += &format!("  message (round {} window {}) {} -> {}: \"{}\"\n", m.round, m.window, name(m.from), name(m.to), m.text.chars().take(400).collect::<String>());
    }
    for t in d.treaties.iter().filter(|t| t.status == "active") {
        // open-ended standing clauses can be ended with notice instead of a breach
        let open_ended = t.clauses.iter().any(|c| matches!(c, Clause::NonAggression { months: 0 } | Clause::DefensivePact { months: 0 }));
        s += &format!("  treaty #{} with {}: {}{}\n", t.id, name(if t.parties[0] == obs.seat { t.parties[1] } else { t.parties[0] }), t.summary.join("; "), if open_ended { " (open-ended: break_treaty with notice:true ends it next round without a breach)" } else { "" });
    }

    // ---- objectives -------------------------------------------------------------------------------
    s += "\nOBJECTIVES\n";
    for a in &obs.objectives.agendas {
        s += &format!("  {}: {} ({})\n", a.title, a.description, a.progress);
    }
    if let Some(v) = &obs.objectives.victory {
        s += &format!("  FINAL OBJECTIVE: {}\n  Governance months {}/{}, jump capability months {}/{}, qualifying trials {}.\n", v.summary, v.governance_months, v.governance_needed, v.ftl_months, v.ftl_needed, v.trials.len());
        for c in v.governance_checks.iter().chain(v.ftl_checks.iter()).filter(|c| !c.ok).take(8) {
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
        Phase::Contact => "\nThis is the contact phase: choose up to three counterparts with select_contacts.",
        _ => "\nThis is the planning phase: give this round's orders, and set standing orders for the years inside it.",
    };
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use bts_engine::{Match, MatchConfig};

    #[test]
    fn the_briefing_shows_only_what_the_seat_can_see() {
        let m = Match::new(MatchConfig { seed: "brief".into(), regions: 24, ..Default::default() }, 1);
        let text = briefing(&m.observe(0), &[]);
        for part in ["YOUR REGIONS", "WHAT YOU CAN BUILD", "STANDING ORDERS", "This round resolves", "GOODS"] {
            assert!(text.contains(part), "briefing lacks {part}");
        }
        for hidden in ["Programmable computers", "spacetime", "FINAL OBJECTIVE", "T162"] {
            assert!(!text.contains(hidden), "briefing leaks {hidden}");
        }
        assert!(text.len() < 12_000, "an opening briefing should be compact, got {}", text.len());
    }

    /// `BTS_BRIEF_SAVE=path cargo test --release -p bts-host measure_briefing -- --ignored --nocapture`
    /// prints the size of every seat's briefing and full observation in a save.
    #[test]
    #[ignore]
    fn measure_briefing() {
        let path = std::env::var("BTS_BRIEF_SAVE").expect("BTS_BRIEF_SAVE");
        let s = crate::Session::load(&std::fs::read_to_string(path).unwrap()).unwrap();
        for seat in 0..s.m.seats() {
            let obs = s.m.observe(seat as SeatId);
            let text = briefing(&obs, &[]);
            println!("seat {seat}: briefing {} bytes (~{} tokens), observation {} bytes", text.len(), text.len() / 4, serde_json::to_string(&obs).unwrap().len());
            if seat == 1 {
                println!("{text}");
            }
        }
    }
}
