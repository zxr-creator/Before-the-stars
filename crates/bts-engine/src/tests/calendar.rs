//! The historical calendar and standing orders (design chapter 36, slice 1).

use super::*;
use crate::calendar::CalendarId;
use crate::sim::diplomacy;

fn standard(seed: &str) -> MatchConfig {
    MatchConfig { seed: seed.into(), regions: 24, calendar: CalendarId::Standard, ..Default::default() }
}

/// Every seat passes; the round resolves.
fn pass_round(m: &mut Match) {
    run_rounds(m, 1);
}

#[test]
fn observations_carry_the_date_and_the_calendar() {
    let mut m = Match::new(standard("calendar-view"), 1);
    let o = m.observe(0);
    let d = o.date.clone().expect("a date");
    assert_eq!((d.year, d.month, d.label.as_str()), (-5000, 1, "5000 BC"));
    let c = o.calendar.clone().expect("a calendar");
    assert_eq!((c.id.as_str(), c.rounds, c.round_months, c.next_round_months, c.horizon_month), ("standard", 525, 600, 600, 89_988));
    assert_eq!((c.round_start.label.as_str(), c.round_end.label.as_str(), c.horizon.label.as_str(), c.reward_reference.label.as_str()), ("5000 BC", "4950 BC", "AD 2500", "AD 1900"));
    assert_eq!(c.segments.len(), 8);
    assert_eq!(o.months_per_round, 600);
    pass_round(&mut m);
    let o = m.observe(0);
    assert_eq!(o.month, 600);
    assert_eq!(o.date.unwrap().year, -4950);
    assert_eq!(o.calendar.unwrap().last_round_months, 600);
    let v = m.spectate();
    assert_eq!(v.date.unwrap().label, "4950 BC");
    // every seat had an era summary of the round, shown in the recap
    let chron = &m.world.civs[0].chronicle;
    let summary = chron.iter().find(|e| e.title == "From 5000 BC to 4951 BC").expect("an era summary");
    assert!(summary.recap);
    assert!(chron.iter().filter(|e| e.recap && e.month > 0).count() <= crate::sim::chronicle::RECAP_MAX + 1);
}

#[test]
fn the_quick_calendar_has_the_same_dates_in_fewer_rounds() {
    let m = Match::new(MatchConfig { calendar: CalendarId::Quick, ..standard("quick") }, 1);
    let c = m.observe(0).calendar.unwrap();
    assert_eq!((c.rounds, c.round_months, c.horizon_month), (230, 1200, 89_988));
}

#[test]
fn a_save_of_ruleset_2_is_refused_by_name() {
    let m = Match::new(cfg("old-save"), 1);
    let mut v: serde_json::Value = serde_json::from_str(&m.save_json()).unwrap();
    v["versions"][0] = serde_json::json!("bts-rules/2.0.0");
    let err = Match::load_json(&v.to_string()).err().expect("refused");
    assert_eq!(err, format!("this save was written by ruleset bts-rules/2.0.0; this build runs {} and cannot load it: the calendar, the goods and the population rules differ", crate::content::RULESET_VERSION));
}

/// The order a build target places is exactly the order the action places: the same
/// quote, crew, site power and minimum months.
#[test]
fn a_build_target_orders_exactly_what_the_action_orders() {
    let make = || {
        let mut m = Match::new(cfg("directive-same"), 1);
        know_everything(&mut m.world, 0);
        for g in Good::ALL {
            m.world.civs[0].stock[g.index()] = 50_000_000;
        }
        m
    };
    let capital = |m: &Match| m.world.civs[0].capital;
    let mut by_action = make();
    let mut by_order = make();
    let region = capital(&by_action);
    // the action, given now; the standing order, carried out in the first month of the round
    let r = by_action.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region, facility: "granary".into(), levels: 2 }, priority: Some(4) }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    let r = by_order.act(0, vec![Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::BuildTarget { region, facility: "granary".into(), levels: 2, priority: Some(4) }), position: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    by_order.world.month += 1;
    by_order.world.round_start = by_order.world.month - 1;
    crate::sim::directives::step(&mut by_order.world);
    let a = by_action.world.civs[0].projects.last().unwrap().clone();
    let b = by_order.world.civs[0].projects.last().unwrap().clone();
    assert_eq!(a.kind, b.kind);
    assert_eq!((a.work_needed, a.max_per_month, a.min_months, a.power_need, a.priority), (b.work_needed, b.max_per_month, b.min_months, b.power_need, b.priority));
    assert_eq!(a.inputs, b.inputs);
    assert_eq!(a.crew, b.crew);
    let d = &by_order.world.civs[0].directives[0];
    assert_eq!(d.last_status, "acted");
    // a second evaluation finds the target met
    crate::sim::directives::evaluate(&mut by_order.world, 0);
    let d = &by_order.world.civs[0].directives[0];
    assert_eq!(d.last_status, "idle", "{}", d.last_result);
}

/// A standing order that cannot be carried out is refused for the action's reason
/// and says so; one with nothing to do says why.
#[test]
fn a_standing_order_that_cannot_act_reports_why() {
    let mut m = Match::new(cfg("directive-refused"), 1);
    let region = m.world.civs[0].capital;
    // a works the seat cannot build yet is refused as unknown, as the action is
    let r = m.act(0, vec![Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::BuildTarget { region, facility: "steelworks".into(), levels: 2, priority: None }), position: None }]);
    assert_eq!(r[0].status, "rejected");
    let action = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region, facility: "steelworks".into(), levels: 1 }, priority: None }]);
    assert_eq!(r[0].reason, action[0].reason);
    know_everything(&mut m.world, 0);
    // an order whose sending region is not crowded waits, and says so
    let to = (0..m.world.regions.len()).find(|i| m.world.regions[region as usize].neighbors.iter().any(|(n, k)| *n as usize == *i && *k != LinkKind::Sea) && m.world.regions[*i].owner.is_none()).expect("a free neighbour");
    m.world.civs[0].memory[to].seen = true;
    let r = m.act(0, vec![Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::SettleTarget { from: region, to: to as RegionId, people: 30_000, when_crowd_bp: 30_000 }), position: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    // fields beyond what the land allows are refused for the action's reason
    let cap = crate::sim::economy::level_cap(&m.world, 0, region as usize, &content().facilities[content().f("fields")]);
    let built = m.world.regions[region as usize].fac_level("fields");
    m.world.civs[0].stock.iter_mut().for_each(|s| *s = 50_000_000);
    let r = m.act(0, vec![Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::BuildTarget { region, facility: "fields".into(), levels: cap + 10, priority: None }), position: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    m.world.month += 1;
    m.world.round_start = m.world.month - 1;
    crate::sim::directives::step(&mut m.world);
    let ds = m.world.civs[0].directives.clone();
    assert_eq!(ds[0].last_status, "idle");
    assert!(ds[0].last_result.contains("of its water capacity"), "{}", ds[0].last_result);
    if built < cap {
        assert_eq!(ds[1].last_status, "acted", "{}", ds[1].last_result);
    }
    // once the land is used up, the order is refused with the action's own words
    let fields = content().f("fields");
    let _ = fields;
    put_works(&mut m.world.regions[region as usize], "fields", cap);
    m.world.civs[0].projects.clear();
    crate::sim::directives::evaluate(&mut m.world, 0);
    let d = m.world.civs[0].directives[1].clone();
    let action = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region, facility: "fields".into(), levels: 1 }, priority: None }]);
    assert_eq!(d.last_status, "skipped");
    assert_eq!(d.last_result, format!("Not ordered: {}.", action[0].reason));
    // removal and reordering
    let (a, b) = (ds[0].id, ds[1].id);
    assert_eq!(m.act(0, vec![Action::Directive { op: DirectiveOp::Move, id: Some(b), directive: None, position: Some(0) }])[0].status, "accepted");
    assert_eq!(m.world.civs[0].directives[0].id, b);
    assert_eq!(m.act(0, vec![Action::Directive { op: DirectiveOp::Remove, id: Some(a), directive: None, position: None }])[0].status, "accepted");
    assert_eq!(m.world.civs[0].directives.len(), 1);
    // only on 1 January and in a round's first month
    assert!(!crate::sim::directives::due(&{
        let mut w = m.world.clone();
        w.month = 5;
        w.round_start = 0;
        w
    }));
}

/// The research agenda starts investigations only while research capacity is idle.
#[test]
fn the_research_agenda_fills_idle_research_capacity() {
    let mut m = Match::new(cfg("agenda"), 1);
    // two discovered methods, and capacity for both
    let c = content();
    let picks: Vec<usize> = (0..c.techs.len()).filter(|t| c.techs[*t].tier == 0 && m.world.civs[0].tech[*t].state < ST_UNDERSTOOD && c.techs[*t].prereq.eval(&CivCtx { world: &m.world, seat: 0 })).take(2).collect();
    assert_eq!(picks.len(), 2);
    for t in &picks {
        m.world.civs[0].tech[*t].state = ST_DISCOVERED;
    }
    let handles: Vec<String> = picks.iter().map(|t| crate::actions::tech_handle(&m.world, 0, *t)).collect();
    m.world.civs[0].research_cap = vec![0; ResearchClass::COUNT];
    let r = m.act(0, vec![Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::ResearchAgenda { techs: handles.clone() }), position: None }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    // no capacity: nothing starts
    crate::sim::directives::evaluate(&mut m.world, 0);
    assert!(!m.world.civs[0].projects.iter().any(|p| matches!(p.kind, ProjKind::Research { .. })));
    assert_eq!(m.world.civs[0].directives[0].last_status, "idle");
    // capacity: both start
    m.world.civs[0].research_cap[0] = 10_000_000;
    crate::sim::directives::evaluate(&mut m.world, 0);
    let running = m.world.civs[0].projects.iter().filter(|p| matches!(p.kind, ProjKind::Research { .. })).count();
    assert_eq!(running, 2, "{}", m.world.civs[0].directives[0].last_result);
    // an unknown handle is refused as the action refuses it
    let r = m.act(0, vec![Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::ResearchAgenda { techs: vec!["k0000000".into()] }), position: None }]);
    assert_eq!((r[0].status.as_str(), r[0].code.as_deref()), ("rejected", Some("NOT_VISIBLE_OR_UNKNOWN")));
}

#[test]
fn treaty_terms_follow_the_length_of_the_round_and_may_be_open_ended() {
    let mut m = Match::new(standard("terms"), 1);
    for s in 0..2 {
        m.world.civs[s].contacts[1 - s].met = true;
    }
    // a 600-month round: a pact runs at least 600 months
    let e = diplomacy::validate_clauses(&m.world, 0, 1, &[Clause::NonAggression { months: 120 }]).unwrap_err();
    assert_eq!(e, "a non-aggression pact runs for 600 to 1800 months this round, or open-ended (0) until notice");
    assert!(diplomacy::validate_clauses(&m.world, 0, 1, &[Clause::NonAggression { months: 600 }]).is_ok());
    assert!(diplomacy::validate_clauses(&m.world, 0, 1, &[Clause::NonAggression { months: 0 }]).is_ok());
    // an open-ended pact stands until a party gives notice, then ends with the next round
    let id = m.world.id();
    m.world.offers.push(Offer { id, from: 0, to: 1, clauses: vec![Clause::NonAggression { months: 0 }], text: String::new(), created: 0, expires_round: 2, status: "open".into() });
    let tid = diplomacy::activate(&mut m.world, 0).unwrap();
    let ti = m.world.treaties.iter().position(|t| t.id == tid).unwrap();
    assert_eq!(m.world.treaties[ti].ends, None);
    for _ in 0..30 {
        crate::sim::step_month(&mut m.world);
    }
    assert_eq!(m.world.treaties[ti].status, "active");
    let r = m.act(1, vec![Action::BreakTreaty { treaty: tid, notice: true }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    assert!(r[0].reason.starts_with("Notice given. The open-ended clauses end in January 4900 BC"), "{}", r[0].reason);
    let ends = m.world.treaties[ti].ends.unwrap();
    assert_eq!(ends, 1200);
    assert_eq!(m.world.treaties[ti].broken_by, None);
    while m.world.month < ends + 1 {
        crate::sim::step_month(&mut m.world);
    }
    assert_ne!(m.world.treaties[ti].status, "active");
    assert_ne!(m.world.treaties[ti].status, "broken");
}

#[test]
fn an_armistice_ends_a_war_both_sides_accept_once_the_lines_hold() {
    let mut m = Match::new(cfg("armistice"), 1);
    for s in 0..2 {
        m.world.civs[s].contacts[1 - s].met = true;
    }
    crate::sim::military::declare_war(&mut m.world, 0, 1, "test");
    assert!(m.world.at_war(0, 1));
    let start = m.world.month;
    for (s, o) in [(0, 1), (1, 0)] {
        let r = m.act(s, vec![Action::SetPolicy { setting: PolicySetting::WarPolicy { seat: o, accept_white_peace_after_months: Some(if s == 0 { 12 } else { 40 }), accept_cession_max: 0 } }]);
        assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    }
    while m.world.month < start + 39 {
        crate::sim::step_month(&mut m.world);
        assert!(m.world.at_war(0, 1), "month {}", m.world.month);
    }
    crate::sim::step_month(&mut m.world);
    assert!(!m.world.at_war(0, 1));
    assert!(m.world.civs[0].chronicle.iter().any(|e| e.title.starts_with("Armistice with")));
}

#[test]
fn a_war_between_seats_begins_only_in_the_first_month_of_a_round() {
    let mut m = Match::new(cfg("war-start"), 1);
    m.world.round_start = 0;
    m.world.month = 5;
    assert!(!m.world.first_month_of_round());
    m.world.month = 1;
    assert!(m.world.first_month_of_round());
}
