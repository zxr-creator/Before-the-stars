//! What the native policy does about freight and production methods
//! (design chapter 35, slice D).
//!
//! The policy sees an observation and nothing else, so these tests take a real
//! observation out of an all-native match and change what it reports: a congested
//! capital, a starved plant, fuel that works went without. The policy must answer
//! with ordinary actions, and must not undo a choice it did not make.

use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;

/// The hard seat's observation in the plan phase of an all-native match, taken in
/// the first round in which it can build roads, with the controller as it then is.
fn mid_game() -> (Observation, NativeAi) {
    let controllers = vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
    let mut m = Match::new(MatchConfig { seed: "riverland".into(), controllers, ..Default::default() }, 7);
    let mut ais: Vec<NativeAi> = (0..m.seats()).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), 0x5EED_0000 + s as u64 * 7919)).collect();
    while !m.finished() && m.round() < 200 {
        if m.phase() == Phase::Plan {
            let obs = m.observe(0);
            let roads = obs.catalog.facilities.iter().any(|f| f.kind == "roads" && f.available);
            let tools = obs.catalog.facilities.iter().find(|f| f.kind == "workshop").map(|f| f.recipes.iter().filter(|r| r.available).count()).unwrap_or(0);
            if roads && tools >= 2 {
                return (obs, ais[0].clone());
            }
        }
        for seat in m.waiting_on() {
            let obs = m.observe(seat);
            let actions = ais[seat as usize].decide(&obs);
            for chunk in actions.chunks(MAX_ACTIONS_PER_BATCH) {
                m.act(seat, chunk.to_vec());
            }
            m.set_ready(seat, false);
        }
        assert!(m.try_advance());
    }
    panic!("the hard seat never learned to build roads");
}

/// Plenty of everything, and no open orders: nothing but the report under test
/// decides what the policy does.
fn rich_and_idle(obs: &mut Observation) {
    for g in obs.civ.goods.iter_mut() {
        g.stock = 20_000_000;
    }
    obs.projects.clear();
}

fn capital(obs: &mut Observation) -> &mut OwnRegion {
    let id = obs.civ.capital;
    obs.regions.iter_mut().find(|r| r.id == id).unwrap().own.as_mut().unwrap()
}

fn method_actions(actions: &[Action]) -> Vec<(RegionId, String, Option<String>)> {
    actions
        .iter()
        .filter_map(|a| match a {
            Action::SetPolicy { setting: PolicySetting::Method { region, facility, method } } => Some((*region, facility.clone(), method.clone())),
            _ => None,
        })
        .collect()
}

#[test]
fn a_congested_capital_is_given_transport() {
    let (mut obs, ai) = mid_game();
    rich_and_idle(&mut obs);
    let id = obs.civ.capital;
    let transport = ["roads", "port", "rail", "depot"];
    {
        let own = capital(&mut obs);
        own.facilities.retain(|f| !transport.contains(&f.kind.as_str()));
        own.transport_level = 0;
        own.infrastructure = InfraView { freight_capacity: 10, freight_load: 20, infra_bp: 5_000, support_saving_cap_bp: 1_000, congestion_loss_bp: 1_000, ..Default::default() };
    }
    let orders = |obs: &Observation| -> Vec<String> {
        ai.clone()
            .decide(obs)
            .into_iter()
            .filter_map(|a| match a {
                Action::StartProject { spec: ProjectSpec::Build { region, facility, .. }, .. } if region == id && transport.contains(&facility.as_str()) => Some(facility),
                _ => None,
            })
            .collect()
    };
    assert!(!orders(&obs).is_empty(), "a capital that loses output to congested freight orders transport");
    // with room to spare it orders none there
    capital(&mut obs).infrastructure = InfraView { freight_capacity: 10, freight_load: 3, infra_bp: 10_000, support_saving_cap_bp: 2_000, ..Default::default() };
    assert!(orders(&obs).is_empty(), "{:?}", orders(&obs));
    // nor does an observation without the freight figures (an older referee) move it
    capital(&mut obs).infrastructure = InfraView::default();
    assert!(orders(&obs).is_empty());
}

#[test]
fn a_starved_plant_is_switched_to_a_method_it_can_run_and_only_its_own_choices_are_undone() {
    let (mut obs, ai) = mid_game();
    rich_and_idle(&mut obs);
    let id = obs.civ.capital;
    let recipes: Vec<RecipeView> = obs.catalog.facilities.iter().find(|f| f.kind == "workshop").unwrap().recipes.iter().filter(|r| r.available).cloned().collect();
    // the workshops ran their first method and had none of its inputs; every other method has plenty
    let (starved, other) = (recipes[0].clone(), recipes[1].clone());
    for i in &starved.inputs {
        if !other.inputs.iter().any(|x| x.good == i.good) {
            obs.civ.goods.iter_mut().find(|g| g.good == i.good).unwrap().stock = 0;
        }
    }
    let missing: Vec<Good> = starved.inputs.iter().map(|i| i.good).filter(|g| !other.inputs.iter().any(|x| x.good == *g)).collect();
    assert!(!missing.is_empty(), "the two methods take different goods");
    let report = |obs: &mut Observation, method: Option<&str>, active: &RecipeView, missing: &[Good]| {
        let f = capital(obs).facilities.iter_mut().find(|f| f.kind == "workshop").expect("the capital has workshops");
        f.method = method.map(|s| s.to_string());
        f.active_method = Some(active.key.clone());
        f.utilization_bp = 0;
        f.runs = vec![RecipeRun { recipe: active.key.clone(), name: active.name.clone(), rate_bp: 0, blockers: vec!["Short of something".into()], missing: missing.to_vec() }];
    };
    report(&mut obs, None, &starved, &missing);
    let mut a = ai.clone();
    let chosen = method_actions(&a.decide(&obs));
    assert_eq!(chosen, vec![(id, "workshop".to_string(), Some(other.key.clone()))]);
    assert_eq!(a.memory.methods_set, vec![(id, "workshop".to_string())]);

    // next round the method it chose is starved in its turn: it gives the choice back
    report(&mut obs, Some(&other.key), &other, &[other.inputs[0].good]);
    let undone = method_actions(&a.decide(&obs));
    assert_eq!(undone, vec![(id, "workshop".to_string(), None)]);
    assert!(a.memory.methods_set.is_empty());

    // a choice that runs well is kept while the method the works would rather run is
    // still without its inputs, and given back as soon as those are in store again
    let running_well = |obs: &mut Observation| {
        let f = capital(obs).facilities.iter_mut().find(|f| f.kind == "workshop").unwrap();
        f.method = Some(other.key.clone());
        f.active_method = Some(other.key.clone());
        f.utilization_bp = 9_500;
        f.runs = vec![RecipeRun { recipe: other.key.clone(), name: other.name.clone(), rate_bp: 9_500, blockers: vec![], missing: vec![] }];
    };
    report(&mut obs, None, &starved, &missing);
    let mut b = ai.clone();
    assert_eq!(method_actions(&b.decide(&obs)).len(), 1);
    running_well(&mut obs);
    assert!(method_actions(&b.decide(&obs)).is_empty());
    for g in &missing {
        obs.civ.goods.iter_mut().find(|x| x.good == *g).unwrap().stock = 20_000_000;
    }
    assert_eq!(method_actions(&b.decide(&obs)), vec![(id, "workshop".to_string(), None)]);
    for g in &missing {
        obs.civ.goods.iter_mut().find(|x| x.good == *g).unwrap().stock = 0;
    }

    // the same report under a choice the controller did not make is left alone:
    // a steward does not undo what the seat's player chose
    report(&mut obs, Some(&other.key), &other, &[other.inputs[0].good]);
    let mut steward = ai.clone();
    assert!(steward.memory.methods_set.is_empty());
    assert!(method_actions(&steward.advise(&obs, &["economy".to_string()])).is_empty());
    // and a plant that runs well is never touched
    let f = capital(&mut obs).facilities.iter_mut().find(|f| f.kind == "workshop").unwrap();
    f.method = None;
    f.utilization_bp = 9_500;
    f.runs[0].missing.clear();
    assert!(method_actions(&ai.clone().decide(&obs)).is_empty());
}

#[test]
fn fields_are_held_off_fuel_while_works_go_without_it_and_released_when_food_runs_low() {
    let (mut obs, ai) = mid_game();
    rich_and_idle(&mut obs);
    // the seat can work its fields with animals or by machine (burning fuel)
    let view = |key: &str, name: &str, rations: i64, fuel: i64| RecipeView {
        key: key.into(),
        name: name.into(),
        inputs: if fuel > 0 { vec![GoodQty { good: Good::Fuel, amount: fuel }] } else { vec![] },
        outputs: vec![GoodQty { good: Good::Food, amount: rations }],
        shaft: 0,
        elec: 0,
        compute: 0,
        out_shaft: 0,
        out_elec: 0,
        out_compute: 0,
        research: None,
        note: String::new(),
        available: true,
        general_posts: 10_000,
        skilled_posts: vec![],
    };
    obs.catalog.facilities.iter_mut().find(|f| f.kind == "fields").expect("the seat knows fields").recipes =
        vec![view("hand", "Hand cultivation", 30_000, 0), view("traction", "Animal traction", 46_000, 0), view("mechanized", "Mechanized farming", 90_000, 100)];
    let with_fields: Vec<RegionId> = obs.regions.iter().filter(|r| r.owner == Some(obs.seat)).filter(|r| r.own.as_ref().map(|o| o.facilities.iter().any(|f| f.kind == "fields" && f.level > 0)).unwrap_or(false)).map(|r| r.id).collect();
    assert!(!with_fields.is_empty());
    obs.civ.food_fulfillment_bp = 10_000;

    // nothing is short of fuel: the fields are left to their cultivators
    let mut a = ai.clone();
    assert!(method_actions(&a.decide(&obs)).iter().all(|(_, kind, _)| kind != "fields"));

    // a works went without fuel last month while the food store is at its target:
    // every region's fields are held at the best method that burns no fuel
    {
        let f = capital(&mut obs).facilities.iter_mut().find(|f| f.kind == "workshop").expect("the capital has workshops");
        f.utilization_bp = 9_000;
        f.runs = vec![RecipeRun { recipe: "stone_tools".into(), name: "Stone, bone and wood tools".into(), rate_bp: 9_000, blockers: vec!["Short of refined fuel".into()], missing: vec![Good::Fuel] }];
    }
    let mut a = ai.clone();
    let mut held: Vec<(RegionId, String, Option<String>)> = method_actions(&a.decide(&obs)).into_iter().filter(|(_, kind, _)| kind == "fields").collect();
    held.sort();
    let mut expected: Vec<(RegionId, String, Option<String>)> = with_fields.iter().map(|r| (*r, "fields".to_string(), Some("traction".to_string()))).collect();
    expected.sort();
    assert_eq!(held, expected);

    // with the food store below its target it would not have held them at all
    let food = obs.civ.goods.iter().position(|g| g.good == Good::Food).unwrap();
    let full_store = obs.civ.goods[food].stock;
    obs.civ.goods[food].stock = obs.civ.population as i64;
    assert!(method_actions(&ai.clone().decide(&obs)).iter().all(|(_, kind, _)| kind != "fields"));
    obs.civ.goods[food].stock = full_store;

    // the hold is its own to lift: when people go short of food it does so at once
    for r in obs.regions.iter_mut() {
        if let Some(f) = r.own.as_mut().and_then(|o| o.facilities.iter_mut().find(|f| f.kind == "fields")) {
            f.method = Some("traction".into());
        }
    }
    obs.civ.food_fulfillment_bp = 9_000;
    let mut lifted: Vec<(RegionId, String, Option<String>)> = method_actions(&a.decide(&obs)).into_iter().filter(|(_, kind, _)| kind == "fields").collect();
    lifted.sort();
    let mut expected: Vec<(RegionId, String, Option<String>)> = with_fields.iter().map(|r| (*r, "fields".to_string(), None)).collect();
    expected.sort();
    assert_eq!(lifted, expected);
    // a hold the seat's player set is not the steward's to lift
    let mut steward = ai.clone();
    assert!(method_actions(&steward.advise(&obs, &["economy".to_string()])).iter().all(|(_, kind, _)| kind != "fields"));
}
