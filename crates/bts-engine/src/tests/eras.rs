//! Ruleset 3.0 slices 10 and 13: eras, charters, golden and dark ages, traditions
//! (design chapter 37, sections 3 and 4; chapter 39, section 1.5).

use super::*;
use crate::sim::eras::{self, *};

fn know(w: &mut World, seat: usize, ids: &[&str]) {
    for id in ids {
        if id.starts_with('T') {
            w.civs[seat].tech[content().t(id)].state = ST_UNDERSTOOD;
        } else {
            let p = &mut w.civs[seat].practice[content().p(id)];
            p.state = 3;
            p.adoption_bp = 10_000;
        }
    }
}

/// A seat in era `era` with nothing in its way: knowledge of the next era, and its
/// capital large enough to be a town.
fn era_world(seed: &str) -> (Match, usize) {
    let mut m = Match::new(cfg(seed), 1);
    let home = m.world.civs[0].capital as usize;
    settle_fixture(&mut m.world, home, 2_000_000);
    (m, home)
}

fn set_era(w: &mut World, seat: usize, e: u8) {
    w.civs[seat].era.era = e;
    w.civs[seat].era.transition = None;
}

fn staffed(r: &mut Region, kind: &str, level: u16) {
    put_works(r, kind, level);
    let k = content().f(kind);
    let f = r.fac_mut(k).unwrap();
    f.staff_needed = 1_000;
    f.staffed = 1_000;
}

#[test]
fn an_era_is_entered_with_its_knowledge_and_its_proof_one_at_a_time() {
    let (mut m, home) = era_world("era-entry");
    // nothing understood yet: refused, and the refusal says why without naming nodes
    let r = m.act(0, vec![Action::EnterEra]);
    assert_eq!(r[0].status, "rejected");
    assert!(r[0].reason.contains("knowledge"), "{}", r[0].reason);
    know(&mut m.world, 0, &["T023", "T025", "T027"]);
    // the town proof: two million at the capital
    assert!(proof_met(&m.world, 0, 1));
    let r = m.act(0, vec![Action::EnterEra]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    let e = &m.world.civs[0].era;
    assert_eq!(e.era, 1);
    let t = e.transition.as_ref().unwrap();
    assert_eq!(t.end - t.start, TRANSITION_MONTHS[1]);
    assert_eq!(e.history, vec![(1, m.world.month, 0, 0)]);
    // during the crossing the next era is refused even with its knowledge and proof
    know(&mut m.world, 0, &["T029", "T030", "T031", "C013"]);
    staffed(&mut m.world.regions[home], "archive", 1);
    assert!(proof_met(&m.world, 0, 2));
    let r = m.act(0, vec![Action::EnterEra]);
    assert_eq!(r[0].status, "rejected");
    assert!(r[0].reason.contains("crossing"), "{}", r[0].reason);
    // after it, one era at a time
    m.world.civs[0].era.transition = None;
    assert_eq!(m.act(0, vec![Action::EnterEra])[0].status, "accepted");
    assert_eq!(m.world.civs[0].era.era, 2);
    // a town too small fails the Classical proof
    let (mut m2, home2) = era_world("era-small");
    let pop = m2.world.regions[home2].population();
    assert!(pop >= CLASSICAL_TOWN);
    m2.world.regions[home2].blocks.iter_mut().for_each(|b| b.ages.iter_mut().for_each(|a| *a /= 10));
    assert!(m2.world.regions[home2].population() < CLASSICAL_TOWN);
    assert!(!proof_met(&m2.world, 0, 1));
}

#[test]
fn the_interstellar_era_is_sealed_until_the_objective_is_revealed() {
    let (mut m, _) = era_world("era-sealed");
    set_era(&mut m.world, 0, 8);
    assert_eq!(top_era(&m.world.civs[0]), 8);
    assert!(eligibility(&m.world, 0).unwrap_err().contains("no further era"));
    let v = eras::view(&m.world, 0);
    assert!(v.next.is_none());
    let json = serde_json::to_string(&m.observe(0)).unwrap();
    assert!(!json.contains("Interstellar"), "the ladder must not disclose the final objective");
    m.world.civs[0].milestones.interstellar = Some(1);
    assert_eq!(top_era(&m.world.civs[0]), 9);
}

#[test]
fn transition_score_parts_have_the_stated_bounds() {
    assert_eq!(part(FOOD_FULL_BP, FOOD_NONE_BP, FOOD_FULL_BP), 25);
    assert_eq!(part(10_000, FOOD_NONE_BP, FOOD_FULL_BP), 25);
    assert_eq!(part(FOOD_NONE_BP, FOOD_NONE_BP, FOOD_FULL_BP), 0);
    assert_eq!(part(7_000, FOOD_NONE_BP, FOOD_FULL_BP), 0);
    assert_eq!(part((FOOD_NONE_BP + FOOD_FULL_BP) / 2, FOOD_NONE_BP, FOOD_FULL_BP), 12);
    assert_eq!(part(6_000, MODERN_NONE_BP, MODERN_FULL_BP), 25);
    assert_eq!(part(4_000, MODERN_NONE_BP, MODERN_FULL_BP), 12);
    // the four parts, and the age each total gives
    let (mut m, _) = era_world("era-score");
    set_era(&mut m.world, 0, 1);
    let t = TransitionSt { era: 1, start: 0, end: 10, food_sum: 10_000 * 10, order_sum: ORDER_FULL * 10, months: 10, ..Default::default() };
    let parts = score_parts(&m.world, 0, &t);
    assert_eq!(parts[0], 25);
    assert_eq!(parts[1], 25);
    assert_eq!(parts[3], 25);
    // integrity: -10 an event, never below 0
    let mut t2 = t.clone();
    t2.events = vec!["a".into(), "b".into(), "c".into()];
    assert_eq!(score_parts(&m.world, 0, &t2)[3], 0);
    t2.events.truncate(1);
    assert_eq!(score_parts(&m.world, 0, &t2)[3], 15);
}

/// End a crossing whose sums give the stated food and order, and return the age.
fn end_crossing(food: i64, order: i64, events: usize) -> (Option<AgeSt>, u8, Match) {
    let (mut m, home) = era_world("era-ages");
    set_era(&mut m.world, 0, 1);
    // every filled post in a works of the Classical era: modernization full
    m.world.regions[home].facilities.clear();
    staffed(&mut m.world.regions[home], "bloomery", 2);
    let month = m.world.month;
    m.world.civs[0].era.history.push((1, month, 0, 0));
    m.world.civs[0].era.transition = Some(TransitionSt { era: 1, start: month, end: month + 1, food_sum: food * 600, order_sum: order * 600, months: 600, events: vec!["x".into(); events], governed: m.world.regions.iter().filter(|r| r.controller == Some(0)).map(|r| r.id).collect(), crisis_window_start: month, ..Default::default() });
    m.world.civs[0].food_ful_bp = food as u16;
    m.world.civs[0].stability = order as u8;
    m.world.month += 1;
    eras::step(&mut m.world, 0);
    let age = m.world.civs[0].era.age.clone();
    let outcome = m.world.civs[0].era.history.last().unwrap().2;
    (age, outcome, m)
}

#[test]
fn a_good_crossing_brings_a_golden_age_and_a_bad_one_a_dark_age_with_bounded_effects() {
    // modernization full (Classical works), food and order full: a golden age
    let (age, outcome, m) = end_crossing(10_000, ORDER_FULL, 0);
    let age = age.expect("a golden age");
    assert!(age.golden && outcome == 1);
    assert_eq!(age.until - m.world.month, 2 * TRANSITION_MONTHS[1]);
    let civ = &m.world.civs[0];
    assert!(golden(civ, m.world.month));
    assert_eq!(charter_slots(civ, m.world.month), 2);
    assert_eq!(channel_bp(civ, m.world.month), 11_000);
    assert_eq!(sector_lp_add(civ, Sector::Construction, m.world.month), 1_000);
    assert_eq!(stability_delta(&m.world, 0), 5);
    // a famine, unrest and three events: a dark age of one crossing's length
    let (age, outcome, m) = end_crossing(8_000, 40, 3);
    let age = age.expect("a dark age");
    assert!(!age.golden && outcome == 3);
    assert_eq!(age.until - m.world.month, TRANSITION_MONTHS[1]);
    let civ = &m.world.civs[0];
    assert!(dark(civ, m.world.month));
    assert_eq!(stability_delta(&m.world, 0), -5);
    assert_eq!(research_terms(civ, ResearchClass::Craft, m.world.month), (9_000, 0));
    assert_eq!(recruit_bp(civ, m.world.month), 11_000);
    // in between: steady, no age
    let (age, outcome, _) = end_crossing(9_500, 80, 1);
    assert!(age.is_none() && outcome == 2, "{age:?} {outcome}");
    // an age ends on time, and a golden age's second charter lapses with it
    let (_, _, mut m) = end_crossing(10_000, ORDER_FULL, 0);
    m.world.civs[0].era.charters = vec![0, 1];
    m.world.month = m.world.civs[0].era.age.as_ref().unwrap().until;
    eras::step(&mut m.world, 0);
    assert!(m.world.civs[0].era.age.is_none());
    assert_eq!(m.world.civs[0].era.charters, vec![0]);
}

#[test]
fn charters_belong_to_their_era_one_at_a_time_and_changes_cost() {
    let (mut m, _) = era_world("era-charters");
    // the Ancient era has none
    assert_eq!(m.act(0, vec![Action::ChooseCharter { charter: "academies".into() }])[0].status, "rejected");
    set_era(&mut m.world, 0, 1);
    // another era's charter, and an unknown one, are refused
    assert_eq!(m.act(0, vec![Action::ChooseCharter { charter: "factory_acts".into() }])[0].status, "rejected");
    assert_eq!(m.act(0, vec![Action::ChooseCharter { charter: "no_such_charter".into() }])[0].code.as_deref(), Some("NOT_VISIBLE_OR_UNKNOWN"));
    assert_eq!(m.act(0, vec![Action::ChooseCharter { charter: "academies".into() }])[0].status, "accepted");
    assert!(charter_held(&m.world.civs[0], "academies"));
    // a second one replaces it at a price: stability -3 for 60 months, locked for 240
    let before = stability_delta(&m.world, 0);
    assert_eq!(m.act(0, vec![Action::ChooseCharter { charter: "road_and_law".into() }])[0].status, "accepted");
    assert!(!charter_held(&m.world.civs[0], "academies") && charter_held(&m.world.civs[0], "road_and_law"));
    assert_eq!(m.world.civs[0].era.charters.len(), 1, "one charter outside a golden age");
    assert_eq!(stability_delta(&m.world, 0), before - CHARTER_CHANGE_STABILITY);
    assert_eq!(m.act(0, vec![Action::ChooseCharter { charter: "citizen_levy".into() }])[0].status, "rejected");
    // in a dark age the change is free
    let month = m.world.month;
    m.world.civs[0].era.age = Some(AgeSt { golden: false, era: 1, until: month + 100, score: 20 });
    assert_eq!(m.act(0, vec![Action::ChooseCharter { charter: "citizen_levy".into() }])[0].status, "accepted");
    // entering the next era lets the old charter lapse
    m.world.civs[0].era.age = None;
    m.world.civs[0].era.transition = None;
    know(&mut m.world, 0, &["T029", "T030", "T031", "C013"]);
    let home = m.world.civs[0].capital as usize;
    staffed(&mut m.world.regions[home], "archive", 1);
    assert_eq!(m.act(0, vec![Action::EnterEra])[0].status, "accepted");
    assert!(m.world.civs[0].era.charters.is_empty());
}

#[test]
fn charter_effects_act_through_existing_mechanisms_and_stay_bounded() {
    let (mut m, _) = era_world("era-effects");
    set_era(&mut m.world, 0, 4);
    let base_admin = crate::sim::culture::admin_capacity(&m.world, 0);
    m.world.civs[0].era.charters = vec![charter_index("laissez_faire").unwrap() as u8];
    let civ = &m.world.civs[0];
    assert_eq!(sector_lp_add(civ, Sector::Industry, 0), 500);
    assert!(urban_mortality_bp(&m.world, 0, civ.capital as usize) == 10_500);
    assert_eq!(stability_delta(&m.world, 0), -2);
    m.world.civs[0].era.charters = vec![charter_index("factory_acts").unwrap() as u8];
    assert_eq!(sector_lp_add(&m.world.civs[0], Sector::Industry, 0), -300);
    assert_eq!(health_add(&m.world.civs[0]), 300);
    m.world.civs[0].era.era = 8;
    m.world.civs[0].era.charters = vec![charter_index("machine_stewardship").unwrap() as u8];
    assert_eq!(crate::sim::culture::admin_capacity(&m.world, 0) as i64, (base_admin as i64 * 3 / 2).min(200));
    m.world.civs[0].era.charters = vec![charter_index("human_primacy").unwrap() as u8];
    assert_eq!(auto_cap(&m.world.civs[0]), 12_500);
    // every charter's factor stays within its stated bound for every sector
    for (i, _) in CHARTERS.iter().enumerate() {
        m.world.civs[0].era.charters = vec![i as u8];
        for s in Sector::ALL {
            assert!(sector_lp_add(&m.world.civs[0], *s, 0).abs() <= 1_000);
        }
        assert!((9_000..=11_000).contains(&channel_bp(&m.world.civs[0], 0)));
        assert!(stability_delta(&m.world, 0).abs() <= 5 + 3);
    }
}

#[test]
fn tradition_slots_open_with_their_eras_and_hold_one_path() {
    let (mut m, _) = era_world("trad-slots");
    set_era(&mut m.world, 0, 3);
    let r = m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "steam".into() }]);
    assert_eq!(r[0].status, "rejected");
    assert!(r[0].reason.contains("Industrial"));
    set_era(&mut m.world, 0, 4);
    // a frontier path in the machine slot, and the frontier slot before its era
    assert_eq!(m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "atom".into() }])[0].code.as_deref(), Some("INVALID_SCHEMA"));
    assert_eq!(m.act(0, vec![Action::ChooseTradition { slot: "frontier".into(), path: "atom".into() }])[0].status, "rejected");
    assert_eq!(m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "steam".into() }])[0].status, "accepted");
    assert!(held(&m.world.civs[0], "steam"));
    assert_eq!(m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "steam".into() }])[0].status, "rejected");
    // switching starts a reform of ten years; only one at a time in a slot
    let r = m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "engine".into() }]);
    assert_eq!(r[0].status, "accepted", "{}", r[0].reason);
    let id = r[0].created.unwrap();
    let p = m.world.civs[0].projects.iter().find(|p| p.id == id).unwrap();
    assert!(matches!(p.kind, ProjKind::TraditionReform { slot: 0, .. }));
    assert_eq!(p.work_needed, crate::sim::projects::scaled(REFORM_WORK, m.world.cfg.pace_bp));
    assert!(p.max_per_month * REFORM_MONTHS >= p.work_needed && p.max_per_month * (REFORM_MONTHS - 1) < p.work_needed, "at least 120 months");
    assert_eq!(p.inputs[0].0, Good::Media);
    assert_eq!(stability_delta(&m.world, 0), -5, "stability -5 while it runs");
    assert_eq!(m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "wire".into() }])[0].status, "rejected");
    // completion: a quarter of the mastery, the old path remembered, a 50-year cooldown
    m.world.civs[0].era.mastery[0] = 8_000;
    m.world.civs[0].projects.clear();
    m.world.month += 1;
    complete_reform(&mut m.world, 0, 0, tradition_index("engine").unwrap() as u8);
    assert!(held(&m.world.civs[0], "engine") && !held(&m.world.civs[0], "steam"));
    assert_eq!(m.world.civs[0].era.mastery[0], 2_000);
    assert!(held_recently(&m.world.civs[0], "steam", m.world.month));
    let r = m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "wire".into() }]);
    assert_eq!(r[0].status, "rejected");
    assert!(r[0].reason.contains("switched recently"));
    m.world.month += SWITCH_COOLDOWN;
    assert_eq!(m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "wire".into() }])[0].status, "accepted");
    // a dark age halves the reform
    let (mut d, _) = era_world("trad-dark");
    set_era(&mut d.world, 0, 4);
    d.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "steam".into() }]);
    let month = d.world.month;
    d.world.civs[0].era.age = Some(AgeSt { golden: false, era: 4, until: month + 100, score: 10 });
    let id = d.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "wire".into() }])[0].created.unwrap();
    let p = d.world.civs[0].projects.iter().find(|p| p.id == id).unwrap();
    assert_eq!(p.work_needed, crate::sim::projects::scaled(REFORM_WORK / 2, d.world.cfg.pace_bp));
}

#[test]
fn exclusive_works_need_the_tradition_and_its_knowledge() {
    let (mut m, home) = era_world("trad-works");
    know(&mut m.world, 0, &["T080", "T061", "T270"]);
    let civ_ctx = |m: &Match| crate::content::content().facilities[content().f("steam_hammer")].req.eval(&CivCtx { world: &m.world, seat: 0 });
    assert!(!civ_ctx(&m), "knowledge alone does not build a tradition's works");
    set_era(&mut m.world, 0, 4);
    m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "steam".into() }]);
    assert!(civ_ctx(&m));
    let r = m.act(0, vec![Action::StartProject { spec: ProjectSpec::Build { region: home as RegionId, facility: "steam_hammer".into(), levels: 1 }, priority: None }]);
    assert!(r[0].status == "accepted" || r[0].reason.contains("site") || r[0].reason.contains("level"), "{}", r[0].reason);
    // after a switch the old path's works can no longer be built
    m.world.civs[0].projects.clear();
    complete_reform(&mut m.world, 0, 0, tradition_index("wire").unwrap() as u8);
    assert!(!civ_ctx(&m));
    // and they draw half as much upkeep again, as obsolete works
    let def = &content().facilities[content().f("steam_hammer")];
    assert_eq!(upkeep_bp(&m.world.civs[0], def, Good::Tools, m.world.month), 15_000);
}

#[test]
fn mastery_grows_while_signature_works_run_and_falls_otherwise() {
    let (mut m, home) = era_world("trad-mastery");
    set_era(&mut m.world, 0, 4);
    m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "steam".into() }]);
    let r = &mut m.world.regions[home];
    r.facilities.clear();
    staffed(r, "steam", 2);
    staffed(r, "workshop", 2);
    // January of a year: steam stations hold half the industry posts
    let jan = (0..24).map(|k| m.world.month + k).find(|mo| crate::util::date(&m.world.cfg, *mo).1 == 1).unwrap();
    m.world.month = jan;
    eras::step(&mut m.world, 0);
    let first = m.world.civs[0].era.mastery[0] as i64;
    assert!(first == MASTERY_GAIN || first == MASTERY_GAIN * 3 / 2, "{first}");
    // without them it falls
    let k = content().f("steam");
    m.world.regions[home].fac_mut(k).unwrap().staffed = 0;
    m.world.month += 12;
    eras::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].era.mastery[0] as i64, first - MASTERY_LOSS);
    // mastery scales the bonuses, never the right to build
    let civ = &mut m.world.civs[0];
    civ.era.mastery[0] = 10_000;
    let def = &content().facilities[content().f("steam_hammer")];
    let full = works_lp_bp(civ, def);
    civ.era.mastery[0] = 0;
    assert_eq!(works_lp_bp(civ, def), 10_000);
    assert!(full > 11_700 && full <= 11_765, "{full}");
}

#[test]
fn drawbacks_are_seeded_bounded_and_deterministic() {
    let run = || {
        let (mut m, home) = era_world("trad-hazards");
        set_era(&mut m.world, 0, 6);
        m.world.civs[0].era.traditions = [None, Some(tradition_index("network").unwrap() as u8)];
        m.world.civs[0].compute_supply = 2_000_000;
        let mut incidents = Vec::new();
        for _ in 0..2_400 {
            m.world.month += 1;
            let before = m.world.civs[0].era.network_until;
            eras::step(&mut m.world, 0);
            if m.world.civs[0].era.network_until != before {
                incidents.push(m.world.month);
            }
        }
        let _ = home;
        incidents
    };
    let a = run();
    let b = run();
    assert_eq!(a, b, "the same world draws the same incidents");
    // 1 in 40 a year over 200 years: a handful, never constant
    assert!(!a.is_empty() && a.len() < 20, "{a:?}");
    // during an incident compute and electronics fall by 30%, no more
    let (mut m, _) = era_world("trad-hazards-2");
    m.world.civs[0].era.traditions = [None, Some(tradition_index("network").unwrap() as u8)];
    m.world.civs[0].era.network_until = m.world.month + 3;
    assert_eq!(compute_bp(&m.world, 0), 7_000);
    assert_eq!(electronics_bp(&m.world.civs[0], m.world.month), 7_000);
    // coal smoke: only for a Coal and Steam seat with ten steam levels in the region
    let home = m.world.civs[0].capital as usize;
    m.world.civs[0].era.traditions = [Some(0), None];
    put_works(&mut m.world.regions[home], "steam", 9);
    assert_eq!(urban_mortality_bp(&m.world, 0, home), 10_000);
    put_works(&mut m.world.regions[home], "steam", 10);
    assert_eq!(urban_mortality_bp(&m.world, 0, home), 11_000);
    m.world.civs[0].tech[content().t("T085")].state = ST_UNDERSTOOD;
    assert_eq!(urban_mortality_bp(&m.world, 0, home), 10_000);
    // biofoundry contamination: +20% epidemic hazard where one stands
    m.world.civs[0].era.traditions = [None, Some(tradition_index("living").unwrap() as u8)];
    assert_eq!(outbreak_bp(&m.world, home), 10_000);
    put_works(&mut m.world.regions[home], "biofoundry", 1);
    assert_eq!(outbreak_bp(&m.world, home), 12_000);
}

#[test]
fn branch_nodes_gather_practice_evidence_only_from_a_held_traditions_works() {
    let c = content();
    let (mut m, home) = era_world("trad-branch");
    // every prerequisite of the difference-engine node, a steam economy running
    know(&mut m.world, 0, &["T080", "T061", "T270", "T044", "T082", "T066"]);
    let r = &mut m.world.regions[home];
    r.facilities.clear();
    staffed(r, "steam", 10);
    staffed(r, "machine_shop", 10);
    for f in r.facilities.iter_mut() {
        f.staffed = 200_000;
        f.staff_needed = 200_000;
    }
    m.world.civs[0].tag_activity = vec![50_000; crate::content::Tag::COUNT];
    let node = c.t("T271");
    assert_eq!(c.techs[node].kind, crate::content::TechKind::Branch);
    m.world.month += 1;
    crate::sim::knowledge::step(&mut m.world, 0);
    assert_eq!(m.world.civs[0].tech[node].evidence, 0, "no tradition, no practice evidence on its branch");
    // an ordinary node with the same prerequisites gathers evidence meanwhile
    set_era(&mut m.world, 0, 4);
    m.act(0, vec![Action::ChooseTradition { slot: "machine".into(), path: "steam".into() }]);
    m.world.month += 1;
    crate::sim::knowledge::step(&mut m.world, 0);
    let ev = m.world.civs[0].tech[node].evidence;
    assert!(ev > 0, "the held tradition's works teach its branch");
    // the evidence comes from the tradition's works, not from general activity
    assert_eq!(tradition_activity(&m.world, 0, "steam"), crate::sim::economy::activity_index(200_000));
    assert_eq!(tradition_activity(&m.world, 0, "engine"), 0);
}

#[test]
fn era_and_tradition_views_respect_the_information_boundary() {
    let (mut m, _) = era_world("era-isolation");
    // a seat that has not met another sees nothing of it
    let obs = m.observe(0);
    assert!(obs.others.is_empty());
    let v = obs.era.as_ref().unwrap();
    assert_eq!(v.era, 0);
    // the next era's conditions name no undiscovered technology
    let next = v.next.as_ref().unwrap();
    let json = serde_json::to_string(next).unwrap();
    for hidden in ["Iron", "Writing", "T023", "T025"] {
        assert!(!json.contains(hidden), "{hidden} leaks: {json}");
    }
    assert!(next.conditions.iter().any(|c| c.text.starts_with("An undiscovered technology of the")));
    // tradition paths are not listed before the slot opens
    assert!(v.traditions.iter().all(|t| t.options.is_empty()));
    // met seats see each other's era and traditions, and nothing finer
    m.world.civs[0].contacts[1].met = true;
    m.world.civs[1].era.era = 4;
    m.world.civs[1].era.traditions = [Some(0), None];
    m.world.civs[1].era.mastery = [7_000, 0];
    m.world.civs[1].era.charters = vec![charter_index("factory_acts").unwrap() as u8];
    let obs = m.observe(0);
    let o = obs.others.iter().find(|o| o.seat == 1).unwrap();
    assert_eq!(o.era, Some(4));
    assert_eq!(o.traditions, vec!["steam".to_string()]);
    let json = serde_json::to_string(o).unwrap();
    assert!(!json.contains("Factory") && !json.contains("7000"), "charters and mastery are private: {json}");
    // an unmet seat's era stays unknown
    let obs2 = m.observe(2);
    assert!(obs2.others.iter().all(|o| o.seat != 1 || o.era.is_none() || m.world.civs[2].contacts[1].met));
    // offered paths name only the works the seat has discovered
    set_era(&mut m.world, 0, 4);
    let v = m.observe(0).era.unwrap();
    let machine = &v.traditions[0];
    assert_eq!(machine.options.len(), 3);
    let json = serde_json::to_string(machine).unwrap();
    for hidden in ["Refinery", "Hydroelectric", "Diesel machinery"] {
        assert!(!json.contains(hidden), "{hidden} leaks before it is discovered");
    }
}

#[test]
fn saves_carry_the_era_state() {
    let (mut m, _) = era_world("era-save");
    know(&mut m.world, 0, &["T023", "T025", "T027"]);
    assert_eq!(m.act(0, vec![Action::EnterEra])[0].status, "accepted");
    m.act(0, vec![Action::ChooseCharter { charter: "academies".into() }]);
    let restored = Match::load_json(&m.save_json()).expect("restore");
    assert_eq!(restored.world.civs[0].era.era, 1);
    assert!(charter_held(&restored.world.civs[0], "academies"));
    assert_eq!(restored.state_hash(), m.state_hash());
}
