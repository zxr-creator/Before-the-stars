//! Production methods chosen by region, and economies of scale
//! (`docs/units-and-scale.md` sections 4 and 7; design chapter 35, slice D).
//!
//! A method changes what a works really takes, makes, draws and employs. An
//! economy of scale saves overhead or loss, up to a stated cap and only as far as
//! its bottleneck allows; it never makes anything. Every month these tests
//! resolve is put through the conservation audit.

use super::*;
use crate::sim::economy::{self, region_infra, scale_saving_bp, FIELD_METHODS};

/// A seat that knows everything, with a capital of two million, full stores, no
/// works and nobody qualified. A test puts in the works and the people it is about
/// and empties the stock of whatever those works make, so that nothing but the
/// thing under test limits them.
fn plant_world(seed: &str) -> (Match, RegionId, usize) {
    let mut m = Match::new(cfg(seed), 1);
    know_everything(&mut m.world, 0);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    settle_fixture(&mut m.world, home, 2_000_000);
    {
        let r = &mut m.world.regions[home];
        r.water = 30_000_000;
        r.wild = 30_000_000;
        r.arable = 40;
        r.forest = 30;
        r.hydro = 40;
        r.river = true;
        r.facilities.clear();
    }
    for q in 0..NQ {
        m.world.civs[0].qual_flows.initial[q] -= m.world.regions[home].quals[q] as i64;
        m.world.regions[home].quals[q] = 0;
    }
    for g in Good::ALL {
        m.world.civs[0].stock[g.index()] = 50_000_000;
    }
    m.world.civs[0].stability = 90;
    (m, capital, home)
}

/// One month of the whole simulation, with the books checked.
fn month(m: &mut Match) {
    let before = m.ledger_snapshot();
    crate::sim::step_month(&mut m.world);
    assert_balanced(&before, &m.ledger_snapshot());
}

fn set_method(m: &mut Match, region: RegionId, facility: &str, method: Option<&str>) -> Receipt {
    m.act(0, vec![Action::SetPolicy { setting: PolicySetting::Method { region, facility: facility.into(), method: method.map(|s| s.to_string()) } }]).remove(0)
}

fn run_of(m: &Match, region: usize, kind: &str) -> (String, RunStat) {
    let k = content().f(kind);
    let run = m.world.regions[region].fac(k).unwrap().run.clone().unwrap_or_else(|| panic!("{kind} did not run"));
    (content().facilities[k].recipes[run.recipe].key.to_string(), run)
}

fn own_view(m: &Match, region: RegionId) -> OwnRegion {
    m.observe(0).regions.into_iter().find(|r| r.id == region).unwrap().own.unwrap()
}

/// Two levels of steelworks with the ore, coal, shaft work, electricity and people
/// for either method.
fn steel_world(method: Option<&str>) -> (Match, RegionId, usize) {
    let (mut m, capital, home) = plant_world("steel-methods");
    {
        let r = &mut m.world.regions[home];
        put_works(r, "steelworks", 2);
        put_works(r, "waterwheel", 1);
        put_works(r, "hydro", 4);
    }
    endow(&mut m.world, home, Qual::Smith, 8_000);
    endow(&mut m.world, home, Qual::Electrician, 20_000);
    m.world.civs[0].stock[Good::Metal.index()] = 0;
    if let Some(key) = method {
        let r = set_method(&mut m, capital, "steelworks", Some(key));
        assert_eq!(r.status, "accepted", "{}", r.reason);
    }
    (m, capital, home)
}

#[test]
fn choosing_a_method_changes_the_inputs_outputs_service_and_posts_of_a_works() {
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let steel = content().f("steelworks");
    let (ore, coal, metal) = (Good::IronOre.index(), Good::Coal.index(), Good::Metal.index());

    // left to the works: coke steel, on coal and the mills' shaft work
    let (mut a, capital, home) = steel_world(None);
    month(&mut a);
    let (key, run) = run_of(&a, home, "steelworks");
    assert_eq!((key.as_str(), run.rate_bp), ("steel", 10_000), "{run:?}");
    let f = a.world.regions[home].fac(steel).unwrap().clone();
    // 12,000 general posts a level less the 2% two levels share, and 4,000 smiths a level
    assert_eq!(f.staff_needed, 23_520 + 8_000);
    let (flows, power) = (a.world.civs[0].flows.clone(), a.world.regions[home].last.power.clone());
    assert_eq!((flows.consumed[ore], flows.consumed[coal], flows.produced[metal]), (80_000, 40_000, 60_000));
    assert_eq!((power.shaft_used, power.elec_used), (20_000, 0));

    // the same works, the same month, held at electric steelmaking
    let (mut b, _, _) = steel_world(Some("electric"));
    month(&mut b);
    let (key, run) = run_of(&b, home, "steelworks");
    assert_eq!((key.as_str(), run.rate_bp), ("electric", 10_000), "{run:?}");
    let f = b.world.regions[home].fac(steel).unwrap().clone();
    // seven tenths of the general posts, the smiths, and a thousand electricians a level
    assert_eq!(f.staff_needed, 16_464 + 8_000 + 2_000);
    assert_eq!(f.staffed, f.staff_needed);
    let (flows, power) = (b.world.civs[0].flows.clone(), b.world.regions[home].last.power.clone());
    // the same ore gives the same steel; a fifth of the coal; electricity for the rest
    assert_eq!((flows.consumed[ore], flows.consumed[coal], flows.produced[metal]), (80_000, 8_000, 60_000));
    assert_eq!((power.shaft_used, power.elec_used), (0, 300_000));
    // the electricians are really in the posts the method added
    let electricians = |m: &Match| m.world.regions[home].last.qual_employed[Qual::Electrician.index()];
    assert_eq!(electricians(&b), electricians(&a) + 2_000);

    // the seat reads its choice, what ran, and the true terms of each method
    let own = own_view(&b, capital);
    let view = own.facilities.iter().find(|f| f.kind == "steelworks").unwrap();
    assert_eq!((view.method.as_deref(), view.active_method.as_deref()), (Some("electric"), Some("electric")));
    let own_a = own_view(&a, capital);
    let view_a = own_a.facilities.iter().find(|f| f.kind == "steelworks").unwrap();
    assert_eq!((view_a.method.as_deref(), view_a.active_method.as_deref()), (None, Some("steel")));
    let obs = b.observe(0);
    let ft = obs.catalog.facilities.iter().find(|f| f.kind == "steelworks").unwrap();
    let posts = |key: &str| {
        let r = ft.recipes.iter().find(|r| r.key == key).unwrap();
        (r.general_posts, r.skilled_posts.iter().map(|j| (j.qual.unwrap(), j.count)).collect::<Vec<_>>(), r.elec, r.shaft, r.available)
    };
    assert_eq!(posts("steel"), (12_000, vec![(Qual::Smith, 4_000)], 0, 10_000, true));
    assert_eq!(posts("electric"), (8_400, vec![(Qual::Smith, 4_000), (Qual::Electrician, 1_000)], 150_000, 0, true));
    // the facility's own job list stays that of its base method
    assert_eq!(ft.jobs.iter().map(|j| (j.qual, j.count)).collect::<Vec<_>>(), vec![(Some(Qual::Smith), 4_000), (None, 12_000)]);
}

#[test]
fn the_new_methods_trade_one_real_thing_for_another() {
    let c = content();
    let rec = |fac: &str, key: &str| c.facilities[c.f(fac)].recipes.iter().find(|r| r.key == key).unwrap_or_else(|| panic!("{fac}/{key}"));
    // electric steel: no more metal from the ore, less coal, electricity instead, fewer hands
    let (coke, electric) = (rec("steelworks", "steel"), rec("steelworks", "electric"));
    assert_eq!(electric.outputs, coke.outputs);
    let amount = |r: &crate::content::Recipe, g: Good| r.inputs.iter().find(|(x, _)| *x == g).map(|(_, a)| *a).unwrap_or(0);
    assert_eq!(amount(electric, Good::IronOre), amount(coke, Good::IronOre));
    assert!(amount(electric, Good::Coal) < amount(coke, Good::Coal) && electric.elec > 0 && electric.general_bp < 10_000 && !electric.extra_skilled.is_empty());
    // made from coal in turbines and generator halls, that electricity costs at
    // least the coal it saves: the method is no source of energy
    let turbine = rec("steam", "turbine");
    let coal_for_elec = electric.elec * amount(turbine, Good::Coal) * 10 / (turbine.out_shaft * 9);
    assert!(coal_for_elec >= amount(coke, Good::Coal) - amount(electric, Good::Coal), "{coal_for_elec}");
    // programmed machining: the same components from the same metal
    let (hand, nc) = (rec("machine_shop", "components"), rec("machine_shop", "nc"));
    assert_eq!(nc.outputs, hand.outputs);
    assert_eq!(amount(nc, Good::Metal), amount(hand, Good::Metal));
    assert!(amount(nc, Good::Tools) < amount(hand, Good::Tools) && nc.elec > 0 && nc.compute > 0 && nc.general_bp < 10_000);
    assert!(nc.extra_skilled.iter().any(|(qs, _)| qs[0] == Qual::Programmer));
    // mechanized workings raise what deep workings raise and draw as much from the deposit
    for mine in ["mine_copper", "mine_iron", "mine_coal", "mine_tin", "mine_bauxite", "mine_quartz"] {
        let (deep, mech) = (rec(mine, "deep"), rec(mine, "mechanized"));
        assert_eq!(mech.outputs, deep.outputs, "{mine}");
        assert_eq!((mech.depletes, mech.disturb_bp), (deep.depletes, 10_000), "{mine}");
        assert!(mech.shaft > deep.shaft && mech.general_bp < 10_000 && mech.inputs.is_empty(), "{mine}");
        // left alone, a mine never switches to it: it is listed after the plain methods
        let recipes = &c.facilities[c.f(mine)].recipes;
        assert_eq!(recipes.last().unwrap().key, "mechanized");
    }
    // (a tradition's methods, chosen only by a holder, may follow them)
    for (fac, key) in [("steelworks", "electric"), ("machine_shop", "nc")] {
        assert_eq!(c.facilities[c.f(fac)].recipes.iter().filter(|r| !r.req_src.contains("TRAD:")).last().unwrap().key, key);
    }
}

#[test]
fn a_chosen_method_with_short_inputs_reports_the_shortage_instead_of_switching() {
    let (mut m, capital, home) = plant_world("method-shortage");
    put_works(&mut m.world.regions[home], "workshop", 2);
    endow(&mut m.world, home, Qual::Artisan, 4_000);
    let (metal, copper, tools, materials) = (Good::Metal.index(), Good::Copper.index(), Good::Tools.index(), Good::Materials.index());
    for g in [metal, copper, tools] {
        m.world.civs[0].stock[g] = 0;
    }
    // left to the workshops, they use what there is: stone, bone and wood
    month(&mut m);
    assert_eq!(run_of(&m, home, "workshop").0, "stone_tools");
    let made = m.world.civs[0].flows.produced[tools];
    assert!(made > 0);

    // held at iron tools with no metal in store, they stand and say why
    assert_eq!(set_method(&mut m, capital, "workshop", Some("iron_tools")).status, "accepted");
    month(&mut m);
    let (key, run) = run_of(&m, home, "workshop");
    assert_eq!((key.as_str(), run.rate_bp), ("iron_tools", 0));
    assert!(run.blockers & 4 != 0 && run.missing == vec![Good::Metal], "{run:?}");
    assert_eq!(m.world.civs[0].flows.produced[tools], made, "nothing was made by another method on the quiet");
    assert_eq!(m.world.regions[home].last.infra.used[materials], 0, "and nothing was taken for one");
    let own = own_view(&m, capital);
    let view = own.facilities.iter().find(|f| f.kind == "workshop").unwrap();
    assert_eq!((view.method.as_deref(), view.active_method.as_deref()), (Some("iron_tools"), Some("iron_tools")));
    assert_eq!(view.runs[0].missing, vec![Good::Metal]);
    assert!(view.runs[0].blockers.iter().any(|b| b.starts_with("Short of")), "{:?}", view.runs[0].blockers);

    // returned to the works, they go back to what they can make
    assert_eq!(set_method(&mut m, capital, "workshop", None).status, "accepted");
    assert!(m.world.regions[home].fac(content().f("workshop")).unwrap().method.is_none());
    month(&mut m);
    assert_eq!(run_of(&m, home, "workshop").0, "stone_tools");
    assert!(m.world.civs[0].flows.produced[tools] > made);
}

#[test]
fn unknown_and_undiscovered_methods_fail_like_nonexistent_ones_and_change_nothing() {
    let c = content();
    let mut m = Match::new(cfg("method-errors"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    put_works(&mut m.world.regions[home], "fields", 2);
    // cultivation is understood, and animal traction too (it draws horses, which the
    // works report missing when there are none: the method itself may be chosen)
    m.world.civs[0].tech[c.t("T005")].state = ST_ADOPTED;
    m.world.civs[0].tech[c.t("T020")].state = ST_ADOPTED;
    let before = serde_json::to_string(&m.world.regions[home].facilities).unwrap();
    let keys = |m: &Match, kind: &str| -> Vec<(String, bool)> {
        m.observe(0).catalog.facilities.iter().find(|f| f.kind == kind).map(|f| f.recipes.iter().map(|r| (r.key.clone(), r.available)).collect()).unwrap_or_default()
    };
    // the catalog names only what the seat has discovered
    assert_eq!(keys(&m, "workshop"), vec![("stone_tools".to_string(), true)]);
    assert_eq!(keys(&m, "fields"), vec![("hand".to_string(), true), ("traction".to_string(), true)]);
    assert!(keys(&m, "steelworks").is_empty());

    let attempts: Vec<(&str, Option<&str>)> = vec![
        ("no_such_facility", Some("steel")),   // no such facility
        ("steelworks", Some("steel")),         // a real facility the region does not have (and the seat has never heard of)
        ("steelworks", None),                  // even to clear it
        ("workshop", Some("no_such_method")),  // no such method
        ("workshop", Some("iron_tools")),      // a real method whose knowledge is undiscovered
        ("fields", Some("restorative")),       // the same for fields
        ("fields", Some("nonsense")),
    ];
    let receipts: Vec<Receipt> = attempts.iter().map(|(fac, method)| set_method(&mut m, capital, fac, *method)).collect();
    for (r, attempt) in receipts.iter().zip(attempts.iter()) {
        assert_eq!(r.status, "rejected", "{attempt:?}");
        assert_eq!(r.code.as_deref(), Some("NOT_VISIBLE_OR_UNKNOWN"), "{attempt:?}");
        assert_eq!(r.reason, receipts[0].reason, "{attempt:?} must read like a facility that does not exist");
    }
    // a method that is discovered but not yet understood is listed as unavailable, and refused alike
    m.world.civs[0].tech[c.t("T023")].state = ST_DISCOVERED;
    assert_eq!(keys(&m, "workshop"), vec![("iron_tools".to_string(), false), ("stone_tools".to_string(), true)]);
    let r = set_method(&mut m, capital, "workshop", Some("iron_tools"));
    assert_eq!((r.status.as_str(), r.code.as_deref(), r.reason.as_str()), ("rejected", Some("NOT_VISIBLE_OR_UNKNOWN"), receipts[0].reason.as_str()));
    // nothing changed
    assert_eq!(serde_json::to_string(&m.world.regions[home].facilities).unwrap(), before);
    assert!(own_view(&m, capital).facilities.iter().all(|f| f.method.is_none()));

    // a method the seat can use is accepted, and shown
    assert_eq!(set_method(&mut m, capital, "workshop", Some("stone_tools")).status, "accepted");
    assert_eq!(set_method(&mut m, capital, "fields", Some("hand")).status, "accepted");
    let own = own_view(&m, capital);
    let chosen = |kind: &str| own.facilities.iter().find(|f| f.kind == kind).unwrap().method.clone();
    assert_eq!((chosen("workshop").as_deref(), chosen("fields").as_deref()), (Some("stone_tools"), Some("hand")));
    // a region that changes hands forgets the choice its old government made
    m.world.set_controller(home, Some(1));
    assert!(m.world.regions[home].facilities.iter().all(|f| f.method.is_none()));
}

#[test]
fn a_method_is_named_with_its_facility_only_to_a_seat_that_knows_of_both() {
    let c = content();
    let mut m = Match::new(cfg("method-names"), 1);
    // electrochemistry understood, steelmaking not even discovered
    m.world.civs[0].tech[c.t("T103")].state = ST_UNDERSTOOD;
    let enables = |m: &Match| -> Vec<String> { m.observe(0).knowledge.techs.into_iter().flat_map(|t| t.enables).collect() };
    let named = |m: &Match, what: &str| enables(m).iter().any(|e| e.contains(what));
    assert!(!enables(&m).is_empty(), "the card says what the technology enables");
    assert!(!named(&m, "Steelworks") && !named(&m, "Electric steelmaking"), "{:?}", enables(&m));
    assert!(!serde_json::to_string(&m.observe(0)).unwrap().contains("Steelworks"));
    // once steelmaking is discovered the method is listed under the technology that unlocks it
    m.world.civs[0].tech[c.t("T060")].state = ST_DISCOVERED;
    assert!(named(&m, "Electric steelmaking (Steelworks)"), "{:?}", enables(&m));
}

/// A seat that can work fields by hand, with animals, with manufactured inputs
/// and by machine, with fields in its capital and in a second region.
fn field_world() -> (Match, RegionId, usize, RegionId, usize) {
    let c = content();
    let mut m = Match::new(cfg("field-methods"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    for id in ["T005", "T006", "T020", "T094", "T095"] {
        m.world.civs[0].tech[c.t(id)].state = ST_ADOPTED;
    }
    let far = free_neighbour(&m.world, home, &[]).expect("a free land neighbour");
    m.world.regions[far].owner = Some(0);
    m.world.regions[far].controller = Some(0);
    settle_fixture(&mut m.world, far, 300_000);
    for (ri, levels) in [(home, 30), (far, 10)] {
        let r = &mut m.world.regions[ri];
        r.wild = 0;
        r.arable = 40;
        r.pasture = 5;
        r.facilities.clear();
        put_works(r, "fields", levels);
    }
    put_works(&mut m.world.regions[home], "pasture", 1);
    for (g, n) in [(Good::Food, 5_000_000), (Good::Fertilizer, 100_000), (Good::Fuel, 100_000), (Good::Horses, 100_000)] {
        m.world.civs[0].stock[g.index()] = n;
    }
    (m, capital, home, far as RegionId, far)
}

#[test]
fn field_methods_are_held_by_region_and_a_region_on_traction_burns_no_fuel() {
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let fields = content().f("fields");
    let (chem, fuel) = (Good::Fertilizer.index(), Good::Fuel.index());
    let (mut m, capital, home, far_id, far) = field_world();
    let method = |m: &Match, ri: usize| {
        let run = m.world.regions[ri].fac(fields).unwrap().field_run.clone().expect("the fields were worked");
        (FIELD_METHODS[run.recipe].key, run.missing)
    };
    let used = |m: &Match| (m.world.civs[0].flows.consumed[chem], m.world.civs[0].flows.consumed[fuel]);

    // left alone, every field is worked by the best method whose inputs are in store
    month(&mut m);
    assert_eq!((method(&m, home), method(&m, far)), (("intensive", vec![]), ("intensive", vec![])));
    let (c1, f1) = used(&m);
    // intensive fields: 300 t of chemicals and 150 t of fuel a level of 2,000 cultivators
    // (each irrigated and unirrigated stretch rounds down on its own)
    assert!(c1 > 0 && (c1 - 2 * f1).abs() <= 4, "150 t of chemicals and 75 t of fuel for every thousand cultivators: {c1} {f1}");

    // the capital's fields held at animal traction: only the other region draws
    assert_eq!(set_method(&mut m, capital, "fields", Some("traction")).status, "accepted");
    month(&mut m);
    assert_eq!((method(&m, home), method(&m, far)), (("traction", vec![]), ("intensive", vec![])));
    let (c2, f2) = used(&m);
    let far_hands = m.world.regions[far].last.labor.food as i64;
    assert!(far_hands > 0);
    let (dc, df) = (c2 - c1, f2 - f1);
    assert!((dc - far_hands * 150 / 1000).abs() <= 2 && (df - far_hands * 75 / 1000).abs() <= 2, "only the cultivators of the other region drew anything: {dc} {df} for {far_hands}");

    // both held: nothing is drawn although the stores are full
    assert_eq!(set_method(&mut m, far_id, "fields", Some("traction")).status, "accepted");
    month(&mut m);
    assert_eq!((method(&m, home), method(&m, far)), (("traction", vec![]), ("traction", vec![])));
    assert_eq!(used(&m), (c2, f2), "fields held on animal traction burn no fuel and spread no chemicals");
    assert!(m.world.civs[0].stock[fuel] > 90_000 && m.world.civs[0].stock[chem] > 90_000);
    let own = own_view(&m, capital);
    let view = own.facilities.iter().find(|f| f.kind == "fields").unwrap();
    assert_eq!((view.method.as_deref(), view.active_method.as_deref()), (Some("traction"), Some("traction")));
    assert_eq!(view.runs[0].name, "Animal traction");

    // a ceiling is also a list of what may be drawn: fields held at machine work
    // without fuel fall back to animals, not to the chemicals the seat ruled out
    assert_eq!(set_method(&mut m, capital, "fields", Some("mechanized")).status, "accepted");
    m.world.civs[0].stock[fuel] = 0;
    month(&mut m);
    assert_eq!(method(&m, home), ("traction", vec![Good::Fuel]));
    assert_eq!(used(&m), (c2, f2));
    let own = own_view(&m, capital);
    let view = own.facilities.iter().find(|f| f.kind == "fields").unwrap();
    assert_eq!(view.active_method.as_deref(), Some("traction"));
    assert_eq!(view.runs[0].missing, vec![Good::Fuel]);

    // returned to the cultivators, with chemicals but no fuel: manufactured inputs
    assert_eq!(set_method(&mut m, capital, "fields", None).status, "accepted");
    month(&mut m);
    assert_eq!(method(&m, home), ("inputs", vec![Good::Fuel]));
    let (c5, f5) = used(&m);
    assert!(c5 > c2 && f5 == f2);

    // the catalog states each method's true yield and draw for one level of ten thousand
    let obs = m.observe(0);
    let ft = obs.catalog.facilities.iter().find(|f| f.kind == "fields").unwrap();
    let line = |key: &str| {
        let r = ft.recipes.iter().find(|r| r.key == key).unwrap_or_else(|| panic!("{key}"));
        let input = |g: Good| r.inputs.iter().find(|i| i.good == g).map(|i| i.amount).unwrap_or(0);
        (r.outputs[0].good, r.outputs[0].amount, input(Good::Fertilizer), input(Good::Fuel), r.general_posts, r.available)
    };
    // design chapter 36, table 3.3: one level's rations, inputs and posts
    assert_eq!(line("hand"), (Good::Food, 30_000, 0, 0, 10_000, true));
    assert_eq!(line("traction"), (Good::Food, 46_000, 0, 0, 8_000, true));
    assert_eq!(ft.recipes.iter().find(|r| r.key == "traction").unwrap().inputs.iter().map(|i| (i.good, i.amount)).collect::<Vec<_>>(), vec![(Good::Horses, 30)]);
    assert_eq!(line("inputs"), (Good::Food, 120_000, 150, 0, 6_000, true));
    assert_eq!(line("mechanized"), (Good::Food, 110_000, 0, 100, 3_000, true));
    assert_eq!(line("intensive"), (Good::Food, 250_000, 300, 150, 2_000, true));
    assert!(ft.recipes.iter().all(|r| r.key != "restorative"), "a method resting on undiscovered knowledge is not named");
}

#[test]
fn saves_observations_and_actions_without_the_new_fields_still_parse() {
    // actions: the new policy with and without a method, and the old ones as they were
    let a: Action = serde_json::from_str(r#"{"kind":"set_policy","setting":{"kind":"method","region":3,"facility":"steelworks","method":"electric"}}"#).unwrap();
    assert_eq!(a, Action::SetPolicy { setting: PolicySetting::Method { region: 3, facility: "steelworks".into(), method: Some("electric".into()) } });
    let a: Action = serde_json::from_str(r#"{"kind":"set_policy","setting":{"kind":"method","region":3,"facility":"steelworks"}}"#).unwrap();
    assert_eq!(a, Action::SetPolicy { setting: PolicySetting::Method { region: 3, facility: "steelworks".into(), method: None } });
    let a: Action = serde_json::from_str(r#"{"kind":"set_policy","setting":{"kind":"method","region":3,"facility":"steelworks","method":null}}"#).unwrap();
    assert_eq!(a, Action::SetPolicy { setting: PolicySetting::Method { region: 3, facility: "steelworks".into(), method: None } });
    let a: Action = serde_json::from_str(r#"{"kind":"set_policy","setting":{"kind":"facility","region":3,"facility":"camp","enabled":false}}"#).unwrap();
    assert_eq!(a, Action::SetPolicy { setting: PolicySetting::Facility { region: 3, facility: "camp".into(), enabled: false } });

    // a save written before methods and infrastructure existed
    let mut m = Match::new(cfg("method-defaults"), 1);
    run_rounds(&mut m, 2);
    let mut v: serde_json::Value = serde_json::from_str(&m.save_json()).unwrap();
    for r in v["regions"].as_array_mut().unwrap() {
        r["last"].as_object_mut().unwrap().remove("infra");
        for f in r["facilities"].as_array_mut().unwrap() {
            let f = f.as_object_mut().unwrap();
            f.remove("method");
            f.remove("field_run");
        }
    }
    let mut old = Match::load_json(&v.to_string()).expect("the fields are optional");
    let home = old.world.civs[0].capital as usize;
    assert!(old.world.regions[home].facilities.iter().all(|f| f.method.is_none() && f.field_run.is_none()));
    assert_eq!(old.world.regions[home].last.infra, InfraMonth::default());
    // such a world still runs, audited, and reports its infrastructure
    let before = old.ledger_snapshot();
    crate::sim::step_month(&mut old.world);
    assert_balanced(&before, &old.ledger_snapshot());
    let capital = old.world.civs[0].capital;
    let own = old.observe(0).regions.into_iter().find(|r| r.id == capital).unwrap().own.unwrap();
    assert!(own.infrastructure.freight_capacity > 0 && own.infrastructure.infra_bp == 10_000);

    // an observation written before them still parses
    let mut o = serde_json::to_value(old.observe(0)).unwrap();
    for r in o["regions"].as_array_mut().unwrap() {
        if let Some(own) = r.get_mut("own").and_then(|x| x.as_object_mut()) {
            own.remove("infrastructure");
            for f in own["facilities"].as_array_mut().unwrap() {
                f.as_object_mut().unwrap().remove("method");
                f.as_object_mut().unwrap().remove("active_method");
            }
        }
    }
    for f in o["catalog"]["facilities"].as_array_mut().unwrap() {
        for r in f["recipes"].as_array_mut().unwrap() {
            r.as_object_mut().unwrap().remove("general_posts");
            r.as_object_mut().unwrap().remove("skilled_posts");
        }
    }
    let parsed: Observation = serde_json::from_value(o).unwrap();
    let own = parsed.regions.iter().find(|r| r.id == capital).unwrap().own.as_ref().unwrap();
    assert_eq!((own.infrastructure.freight_capacity, own.infrastructure.infra_bp), (0, 0));
    assert!(own.facilities.iter().all(|f| f.method.is_none() && f.active_method.is_none()));
    assert!(parsed.catalog.facilities.iter().flat_map(|f| f.recipes.iter()).all(|r| r.general_posts == 0 && r.skilled_posts.is_empty()));
}

// ---------------------------------------------------------------------------
// Economies of scale
// ---------------------------------------------------------------------------

/// A capital with ten levels of timber camps and three million more adults, and
/// optionally ninety levels of repair works that nobody can run (their method is
/// not understood, no mechanic exists): they load the region's freight and do
/// nothing else.
fn camps_world(idle_works: u16) -> (Match, RegionId, usize) {
    let mut m = Match::new(cfg("support-posts"), 1);
    let capital = m.world.civs[0].capital;
    let home = capital as usize;
    for r in m.world.regions.iter_mut().filter(|r| r.controller == Some(0)) {
        r.facilities.clear();
    }
    let r = &mut m.world.regions[home];
    r.blocks[0].ages[30] += 3_000_000;
    r.forest = 30;
    put_works(r, "quarry", 10);
    if idle_works > 0 {
        put_works(r, "parts_works", idle_works);
    }
    for (g, n) in [(Good::Tools, 1_000_000), (Good::Materials, 0), (Good::Food, 50_000_000)] {
        m.world.civs[0].stock[g.index()] = n;
    }
    (m, capital, home)
}

#[test]
fn shared_support_saves_posts_only_and_shrinks_when_freight_is_congested() {
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let camp = content().f("quarry");
    let (mat, tools) = (Good::Materials.index(), Good::Tools.index());
    let def = &content().facilities[camp];

    // ten levels within the freight capacity of a region without roads (ten levels)
    let (mut a, capital, home) = camps_world(0);
    month(&mut a);
    let fa = a.world.regions[home].fac(camp).unwrap().clone();
    assert_eq!(fa.staff_needed, 65_600, "nine levels beyond the first save 18% of 80,000 general posts");
    assert_eq!((fa.staffed, fa.run.as_ref().unwrap().rate_bp), (65_600, 10_000));

    // the same camps beside ninety levels of idle works: a load of a hundred on a capacity of ten
    let (mut b, _, _) = camps_world(90);
    month(&mut b);
    let fb = b.world.regions[home].fac(camp).unwrap().clone();
    let infra = b.world.regions[home].last.infra.clone();
    assert_eq!((infra.capacity, infra.load, infra.infra_bp, infra.congestion_bp), (10, 100, 1_000, 1_800));
    assert_eq!(fb.staff_needed, 78_560, "a tenth of the freight served leaves a tenth of the saving: 1.8%");
    assert_eq!((fb.staffed, fb.run.as_ref().unwrap().rate_bp), (78_560, 10_000));

    // with or without the saving, the camps take and make exactly the same
    let (ia, ib) = (&a.world.regions[home].last.infra, &b.world.regions[home].last.infra);
    assert_eq!((ia.made[mat], ib.made[mat]), (160_000, 160_000), "ten levels make ten levels' output, whatever the posts");
    assert_eq!(ia.used, ib.used);
    assert_eq!(a.world.civs[0].flows.consumed[tools], b.world.civs[0].flows.consumed[tools]);
    assert_eq!(a.world.civs[0].flows.consumed[tools], 2_500, "the camps' upkeep and nothing else");

    // what differs is carriage: a congested capital loses 18% of what it sends, and it is booked as lost
    assert_eq!((ia.delivered[mat], a.world.civs[0].flows.lost[mat]), (160_000, 0));
    assert_eq!((ib.delivered[mat], b.world.civs[0].flows.lost[mat]), (131_200, 28_800), "the capital is not exempt from congestion");

    // the cap: 20% of general posts however many levels, scaled by the freight served
    for (level, infra_bp, saving) in [(1u16, 10_000i64, 0u16), (2, 10_000, 200), (11, 10_000, 2_000), (40, 10_000, 2_000), (40, 5_000, 1_000), (40, 1, 0), (40, 0, 0)] {
        assert_eq!(scale_saving_bp(def, &Facility::new(camp, level), infra_bp), saving, "level {level} at {infra_bp} bp");
    }
    // worn works share nothing
    assert_eq!(scale_saving_bp(def, &Facility { condition_bp: 7_000, ..Facility::new(camp, 40) }, 10_000), 0);
    // the seat is told: the saving as it applies, and the cap after congestion
    let own = own_view(&b, capital);
    assert_eq!(own.facilities.iter().find(|f| f.kind == "quarry").unwrap().scale_saving_bp, 180);
    let i = &own.infrastructure;
    assert_eq!((i.freight_capacity, i.freight_load, i.infra_bp, i.support_saving_cap_bp, i.congestion_loss_bp), (10, 100, 1_000, 200, 1_800));
    let i = own_view(&a, capital).infrastructure;
    assert_eq!((i.freight_capacity, i.freight_load, i.infra_bp, i.support_saving_cap_bp, i.congestion_loss_bp), (10, 10, 10_000, 2_000, 0));
}

/// Ten levels of camps, a mill and one level of repair works with its mechanics,
/// components and shaft work, on roads: a load of twelve on a capacity of twenty-four.
fn pooling_world() -> (Match, RegionId, usize) {
    let (mut m, capital, home) = plant_world("pooling");
    {
        let r = &mut m.world.regions[home];
        put_works(r, "quarry", 10);
        put_works(r, "waterwheel", 1);
        put_works(r, "parts_works", 1);
        put_works(r, "roads", 1);
    }
    // a few more mechanics than the posts, so that a month's deaths leave none empty
    endow(&mut m.world, home, Qual::Mechanic, 2_500);
    m.world.civs[0].stock[Good::Spares.index()] = 0;
    m.world.civs[0].stock[Good::Materials.index()] = 0;
    (m, capital, home)
}

#[test]
fn maintenance_pooling_cuts_upkeep_by_at_most_fifteen_percent_and_only_while_the_shop_runs() {
    let tools = Good::Tools.index();
    let (mut m, capital, home) = pooling_world();
    let taken = |m: &mut Match| {
        let before = m.world.civs[0].flows.consumed[tools];
        month(m);
        m.world.civs[0].flows.consumed[tools] - before
    };
    // the first month the repair works have not yet run: every works pays its upkeep in full.
    // camps 10 x 250, the mill 300, the roads 400, and the 500 lots the repair works' own method takes
    assert_eq!(taken(&mut m), 2_500 + 300 + 400 + 500);
    assert_eq!(m.world.regions[home].last.infra.maint_bp, 0);
    assert_eq!(run_of(&m, home, "parts_works").1.rate_bp, 10_000);
    // from then on one level of repair works serves the twelve levels beside it:
    // 15% off the spares and tools upkeep of the camps and the mill, not of the roads
    assert_eq!(own_view(&m, capital).infrastructure.maintenance_saving_bp, 1_500);
    assert_eq!(taken(&mut m), 2_125 + 255 + 400 + 500);
    assert_eq!(m.world.regions[home].last.infra.maint_bp, 1_500);
    // exactly that share: never below 85% of the upkeep, to the lot
    assert_eq!((2_500 * 8_500 / 10_000, 300 * 8_500 / 10_000), (2_125, 255));
    // nothing is made by it: the works' condition holds because their (smaller) upkeep was met
    assert!(m.world.regions[home].facilities.iter().all(|f| f.condition_bp == 10_000));

    // a shop without components stops, and a month later pools nothing
    m.world.civs[0].stock[Good::Components.index()] = 0;
    assert_eq!(taken(&mut m), 2_125 + 255 + 400, "last month's running still counts this month");
    assert_eq!(run_of(&m, home, "parts_works").1.rate_bp, 0);
    assert_eq!(taken(&mut m), 2_500 + 300 + 400, "a shop that is not supplied pools nothing");
    assert_eq!(m.world.regions[home].last.infra.maint_bp, 0);

    // the cap and the bottlenecks, on the rule itself
    let shop = content().f("parts_works");
    let saving = |r: &Region| region_infra(r).maint_bp;
    let mut r = m.world.regions[home].clone();
    let run = |r: &mut Region, rate: u16| r.fac_mut(shop).unwrap().run = Some(RunStat { recipe: 0, rate_bp: rate, blockers: 0, missing: vec![] });
    run(&mut r, 10_000);
    assert_eq!(saving(&r), 1_500);
    // half a shop's work, half the saving
    run(&mut r, 5_000);
    assert_eq!(saving(&r), 750);
    // thirty levels of shops on the best transport still save 15% and no more
    put_works(&mut r, "parts_works", 30);
    let roads = content().f("roads");
    r.facilities.retain(|f| f.kind != roads);
    put_works(&mut r, "highways", 7);
    run(&mut r, 10_000);
    assert_eq!((region_infra(&r).capacity, region_infra(&r).load, saving(&r)), (150, 41, 1_500));
    // one shop among many works serves twelve levels' worth: 12 of 111 here
    put_works(&mut r, "parts_works", 1);
    put_works(&mut r, "quarry", 109);
    run(&mut r, 10_000);
    assert_eq!((region_infra(&r).load, saving(&r)), (111, 1_500 * 12 / 111));
    // without the transport to carry the parts about, the saving shrinks with the freight served
    let highways = content().f("highways");
    r.facilities.retain(|f| f.kind != roads && f.kind != highways);
    let i = region_infra(&r);
    assert_eq!((i.capacity, i.infra_bp, i.maint_bp), (10, 10 * 10_000 / 111, 1_500 * 12 / 111 * (10 * 10_000 / 111) / 10_000));
    assert!(i.maint_bp < 15);
    // a shop that is idled pools nothing whatever it did last month
    r.fac_mut(shop).unwrap().enabled = false;
    assert_eq!(saving(&r), 0);
}

/// An outlying region without roads holding timber camps, and optionally
/// workshops that take some of the camps' material on the spot.
fn chain_world(camps: u16, workshops: u16) -> (Match, RegionId, usize) {
    let mut m = Match::new(cfg("chains"), 1);
    let home = m.world.civs[0].capital as usize;
    let far = free_neighbour(&m.world, home, &[]).expect("a free land neighbour");
    m.world.regions[far].owner = Some(0);
    m.world.regions[far].controller = Some(0);
    settle_fixture(&mut m.world, far, 600_000);
    m.world.regions[far].forest = 20;
    m.world.regions[far].wild = 5_000_000;
    put_works(&mut m.world.regions[far], "quarry", camps);
    if workshops > 0 {
        put_works(&mut m.world.regions[far], "workshop", workshops);
        endow(&mut m.world, far, Qual::Artisan, 2_000 * workshops as u32);
    }
    m.world.regions[home].facilities.clear();
    m.world.civs[0].stock[Good::Food.index()] = 20_000_000;
    (m, far as RegionId, far)
}

#[test]
fn output_used_in_the_same_region_pays_no_carriage_and_nothing_else_is_spared() {
    let (mat, tools) = (Good::Materials.index(), Good::Tools.index());
    // two levels of camps and two of workshops making stone tools from the camps' material
    let (mut m, far_id, far) = chain_world(2, 2);
    let link = economy::link_efficiencies(&m.world, 0)[far];
    assert_eq!(link, 8_800, "one track link from the capital, no road");
    month(&mut m);
    let i = m.world.regions[far].last.infra.clone();
    let (camp_rate, shop_rate) = (run_of(&m, far, "quarry").1.rate_bp as i64, run_of(&m, far, "workshop").1.rate_bp as i64);
    assert_eq!(run_of(&m, far, "workshop").0, "stone_tools");
    assert!(camp_rate > 0 && shop_rate > 0);
    assert_eq!((i.made[mat], i.used[mat]), (16_000 * 2 * camp_rate / 10_000, 4_000 * 2 * shop_rate / 10_000));
    // exempt: what was used here, and no more than was made
    assert_eq!(i.exempt[mat], i.used[mat].min(i.made[mat]));
    assert!(i.exempt[mat] > 0 && i.exempt[mat] < i.made[mat]);
    // only the remainder pays the link
    let exported = i.made[mat] - i.exempt[mat];
    assert_eq!(i.delivered[mat], i.exempt[mat] + exported * link / 10_000);
    assert!(i.delivered[mat] <= i.made[mat]);
    assert_eq!(m.world.civs[0].flows.lost[mat], i.made[mat] - i.delivered[mat], "what carriage cost is booked as lost");
    // the saving is the carriage loss on the exempt part, nothing beyond it
    assert_eq!(i.chain_saved[mat], i.delivered[mat] - i.made[mat] * link / 10_000);
    assert!(i.chain_saved[mat] > 0 && i.chain_saved[mat] <= i.exempt[mat] - i.exempt[mat] * link / 10_000 + 1);
    // the tools go to the common stock: nobody here takes tools as an input, so all of them pay
    assert_eq!((i.made[tools], i.exempt[tools]), (5_000 * 2 * shop_rate / 10_000, 0));
    assert_eq!(i.delivered[tools], i.made[tools] * link / 10_000);
    // the seat is told what was spared
    let infra = own_view(&m, far_id).infrastructure;
    assert_eq!(infra.chain_exempt.iter().map(|g| (g.good, g.amount)).collect::<Vec<_>>(), vec![(Good::Materials, i.exempt[mat])]);
    assert_eq!(infra.chain_loss_saved.iter().map(|g| (g.good, g.amount)).collect::<Vec<_>>(), vec![(Good::Materials, i.chain_saved[mat])]);

    // the same camps with nothing beside them that uses their output: nothing is exempt
    let (mut m, far_id, far) = chain_world(2, 0);
    month(&mut m);
    let i = m.world.regions[far].last.infra.clone();
    assert!(i.made[mat] > 0);
    assert_eq!((i.used[mat], i.exempt[mat], i.chain_saved[mat]), (0, 0, 0));
    assert_eq!(i.delivered[mat], i.made[mat] * link / 10_000);
    assert!(own_view(&m, far_id).infrastructure.chain_exempt.is_empty());
}

#[test]
fn a_congested_region_loses_more_in_carriage_until_transport_is_added() {
    // post counts and yields of the plain recipes: productivity is tested on its own
    crate::sim::productivity::set_neutral(true);
    let mat = Good::Materials.index();
    let camp = content().f("quarry");
    // twelve levels on the freight capacity of a region without roads (ten)
    let (mut m, far_id, far) = chain_world(12, 0);
    month(&mut m);
    let i = m.world.regions[far].last.infra.clone();
    assert_eq!((i.capacity, i.load, i.infra_bp, i.congestion_bp), (10, 12, 8_333, 333));
    // the track link keeps 88%; congestion takes another 3.33 points
    assert!(i.made[mat] > 0);
    assert_eq!(i.delivered[mat], i.made[mat] * (8_800 - 333) / 10_000);
    assert_eq!(m.world.civs[0].flows.lost[mat], i.made[mat] - i.delivered[mat]);
    // and the camps share less support: 20% of 96,000 general posts, scaled by 8,333
    assert_eq!(m.world.regions[far].fac(camp).unwrap().staff_needed, 80_007);
    let infra = own_view(&m, far_id).infrastructure;
    assert_eq!((infra.freight_capacity, infra.freight_load, infra.infra_bp, infra.congestion_loss_bp, infra.support_saving_cap_bp), (10, 12, 8_333, 333, 1_666));

    // a level of roads raises the capacity to sixteen: no congestion; with roads at
    // the capital too, the link loses 5% instead of 12%
    put_works(&mut m.world.regions[far], "roads", 1);
    let home = m.world.civs[0].capital as usize;
    put_works(&mut m.world.regions[home], "roads", 1);
    let lost_before = m.world.civs[0].flows.lost[mat];
    month(&mut m);
    let j = m.world.regions[far].last.infra.clone();
    assert_eq!((j.capacity, j.load, j.infra_bp, j.congestion_bp), (16, 12, 10_000, 0));
    assert_eq!(economy::link_efficiencies(&m.world, 0)[far], 9_500);
    assert_eq!(j.delivered[mat], j.made[mat] * 9_500 / 10_000);
    assert_eq!(m.world.civs[0].flows.lost[mat] - lost_before, j.made[mat] - j.delivered[mat]);
    assert_eq!(m.world.regions[far].fac(camp).unwrap().staff_needed, 76_800);

    // the penalty is capped at twenty points however far the load outruns the capacity
    let mut r = m.world.regions[far].clone();
    put_works(&mut r, "quarry", 10_000);
    let i = region_infra(&r);
    assert_eq!((i.infra_bp, i.congestion_bp), (16, 1_996));
    assert!(i.congestion_bp <= economy::CONGESTION_LOSS_CAP_BP);
    // freight capacity: ten for tracks and each network level's freight
    let mut r = m.world.regions[far].clone();
    r.facilities.clear();
    assert_eq!(crate::sim::network::freight_capacity(&r), 10);
    put_works(&mut r, "roads", 2);
    put_works(&mut r, "rail", 1);
    assert_eq!(crate::sim::network::freight_capacity(&r), 10 + 12 + 20);
    // food, civic, teaching, research and transport works do not load freight
    let loads: Vec<&str> = content().facilities.iter().filter(|f| economy::loads_freight(f)).map(|f| f.key).collect();
    for key in ["fields", "pasture", "fishery", "granary", "irrigation", "roads", "port", "rail", "highways", "waterworks", "hospital", "admin", "school", "laboratory", "institute"] {
        assert!(!loads.contains(&key), "{key} loads freight");
    }
    for key in ["quarry", "mine_iron", "oilwell", "workshop", "steelworks", "parts_works", "waterwheel", "steam", "generator", "grid", "fission"] {
        assert!(loads.contains(&key), "{key} does not load freight");
    }
}

#[test]
fn the_audit_notices_savings_that_make_or_deliver_more_than_the_works_did() {
    let mat = Good::Materials.index();
    let (mut m, _, far) = chain_world(2, 2);
    let before = m.ledger_snapshot();
    crate::sim::step_month(&mut m.world);
    let clean = m.ledger_snapshot();
    assert!(ledger::violations(&before, &clean).is_empty());
    let cooked = |f: &dyn Fn(&mut InfraMonth)| -> Vec<String> {
        let mut w = m.world.clone();
        f(&mut w.regions[far].last.infra);
        ledger::violations(&before, &ledger::snapshot(&w, false))
    };
    let has = |v: &Vec<String>, what: &str| v.iter().any(|s| s.contains(what));
    // more made than the works' methods, levels and rates allow
    let v = cooked(&|i| i.made[mat] += 1);
    assert!(has(&v, "where their methods, levels and rates allow"), "{v:?}");
    // more delivered than made
    let v = cooked(&|i| i.delivered[mat] = i.made[mat] + 1);
    assert!(has(&v, "delivered of"), "{v:?}");
    // more exempt from carriage than was used on the spot
    let v = cooked(&|i| i.exempt[mat] = i.used[mat] + 1);
    assert!(has(&v, "exempt from carriage"), "{v:?}");
    // a saving beyond its cap
    let v = cooked(&|i| i.maint_bp = 1_501);
    assert!(has(&v, "beyond its cap"), "{v:?}");
    let v = cooked(&|i| i.congestion_bp = 2_001);
    assert!(has(&v, "beyond its cap"), "{v:?}");
    // a region's account that claims more output, or more loss, than the civilization booked
    let v = cooked(&|i| {
        i.made[Good::Metal.index()] = 5;
        i.delivered[Good::Metal.index()] = 5;
    });
    assert!(has(&v, "was booked as produced"), "{v:?}");
    let v = cooked(&|i| i.delivered[mat] = i.exempt[mat]);
    assert!(has(&v, "was booked as lost"), "{v:?}");
}
