//! What the native policy does off the Earth (design chapters 37 §6 and 39 §4-5):
//! from a real observation whose off-world report is changed, it builds a station in
//! low Earth orbit module by module, then founds an outpost, and orders nothing new
//! while a shipment still waits for its boost.

use bts_ai::{Difficulty, NativeAi};
use bts_engine::{Match, MatchConfig};
use bts_protocol::*;

fn space_obs(available: &[&str], stations: Vec<StationView>, transfers: Vec<TransferView>, cap: i64) -> Observation {
    let m = Match::new(MatchConfig { seed: "orbit".into(), ..Default::default() }, 3);
    let mut obs = m.observe(0);
    obs.phase = Phase::Plan;
    if let Some(e) = obs.era.as_mut() {
        e.era = 7;
    }
    let sites = ["shackleton_rim", "mare_imbrium", "arcadia_planitia"].iter().map(|k| SpaceSiteView { site: k.to_string(), zone: if k.starts_with('a') { "mars" } else { "moon" }.into(), surveyed: true, ..Default::default() }).collect();
    obs.space = Some(SpaceView {
        boost: Some(BoostView { stock: 1_000, cap, made_last: 800, spent_last: 0, by_stage: vec![], streak: 3 }),
        sites,
        stations,
        transfers,
        windows: vec![],
        known_bodies: None,
        stores: vec![],
        available: available.iter().map(|s| s.to_string()).collect(),
        propulsion: vec!["chemical".into()],
    });
    for g in obs.civ.goods.iter_mut() {
        g.stock = 50_000_000;
    }
    obs
}

fn leo(modules: &[(&str, u16)]) -> StationView {
    StationView { id: 1, orbit: "leo".into(), owner: 0, core: Some("K1".into()), modules: modules.iter().map(|(k, l)| StationModuleView { kind: k.to_string(), level: Some(*l) }).collect(), aboard: Some(300), staffed_bp: Some(10_000), power_bp: Some(10_000), supplied_bp: Some(10_000) }
}

fn orders(obs: &Observation) -> Vec<SpaceOrder> {
    let mut ai = NativeAi::new(Difficulty::Hard, 11);
    ai.decide(obs).into_iter().filter_map(|a| if let Action::Space { order } = a { Some(order) } else { None }).collect()
}

#[test]
fn the_policy_places_a_core_then_modules_then_founds_an_outpost() {
    let all = ["k1", "solar", "docking", "habitat", "lab", "outpost"];
    let o = orders(&space_obs(&all, vec![], vec![], 2_400));
    assert!(o.iter().any(|x| matches!(x, SpaceOrder::Place { orbit, part } if orbit == "leo" && part == "k1")), "{o:?}");
    let o = orders(&space_obs(&all, vec![leo(&[("Solar array", 1), ("Docking and depot", 1), ("Habitat", 1)])], vec![], 2_400));
    assert!(o.iter().any(|x| matches!(x, SpaceOrder::Place { part, .. } if part == "docking")), "{o:?}");
    let st = leo(&[("Solar array", 2), ("Docking and depot", 2), ("Habitat", 1), ("Research laboratory", 1)]);
    let o = orders(&space_obs(&all, vec![st.clone()], vec![], 4_800));
    assert!(o.iter().any(|x| matches!(x, SpaceOrder::FoundOutpost { site, .. } if site == "shackleton_rim")), "{o:?}");
    // supplies for the crew go up as lifts
    assert!(o.iter().any(|x| matches!(x, SpaceOrder::Launch { good: Good::Food, .. })), "{o:?}");
    // nothing new while a shipment waits for boost
    let pending = TransferView { id: 9, owner: Some(0), from_zone: "earth".into(), to_zone: "earth_orbit".into(), payload_t: 300, people: 0, propulsion: None, departed: u32::MAX / 2, arrives: u32::MAX / 2, purpose: "module".into(), target: Some("leo".into()) };
    let o = orders(&space_obs(&all, vec![st], vec![pending], 4_800));
    assert!(!o.iter().any(|x| matches!(x, SpaceOrder::Place { .. } | SpaceOrder::FoundOutpost { .. })), "{o:?}");
}

/// A live match in which seat 0 is handed the Space era (every technology and
/// practice, stores, crews and boost, through an edited save): played by the native
/// policies under the monthly audit, it puts a station in low Earth orbit and claims
/// an outpost.
#[test]
fn a_native_seat_given_space_builds_a_station_and_claims_an_outpost() {
    use serde_json::Value;
    let controllers = vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy];
    let m = Match::new(MatchConfig { seed: "orbit".into(), controllers, ..Default::default() }, 3);
    let mut w: Value = serde_json::from_str(&m.save_json()).unwrap();
    let cap = w["civs"][0]["capital"].as_u64().unwrap() as usize;
    {
        let civ = &mut w["civs"][0];
        for t in civ["tech"].as_array_mut().unwrap() {
            t["state"] = 6.into();
        }
        for p in civ["practice"].as_array_mut().unwrap() {
            p["state"] = 3.into();
            p["adoption_bp"] = 10_000.into();
        }
        for g in civ["stock"].as_array_mut().unwrap() {
            *g = 30_000_000.into();
        }
        civ["space"]["boost"] = 300_000.into();
        civ["space"]["made_total"] = 300_000.into();
        for q in [Qual::Orbital, Qual::Technician, Qual::Scientist] {
            let i = q.index();
            let v = civ["qual_flows"]["initial"][i].as_i64().unwrap() + 200_000;
            civ["qual_flows"]["initial"][i] = v.into();
        }
    }
    for q in [Qual::Orbital, Qual::Technician, Qual::Scientist] {
        let i = q.index();
        let v = w["regions"][cap]["quals"][i].as_i64().unwrap() + 200_000;
        w["regions"][cap]["quals"][i] = v.into();
    }
    let mut m = Match::load_json(&w.to_string()).expect("edited save loads");
    let mut ais: Vec<NativeAi> = (0..m.seats()).map(|s| NativeAi::new(Difficulty::from_controller(m.controller(s as SeatId)).unwrap(), 0x5EED + s as u64)).collect();
    m.record_ledgers(true);
    let (mut station, mut outpost) = (false, false);
    for _ in 0..200 {
        if m.finished() || (station && outpost) {
            break;
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
        // the stores of a seat handed the Space era are kept full (its own economy is
        // that of its era); a top-up is booked as made, so the audit still holds
        let low_boost = m.observe(0).space.and_then(|s| s.boost).map(|b| b.stock < 50_000).unwrap_or(false);
        if m.phase() == Phase::Plan && (low_boost || m.observe(0).civ.goods.iter().any(|g| g.stock < 5_000_000)) {
            let trace = m.take_ledger_trace();
            check(&trace);
            let mut w: Value = serde_json::from_str(&m.save_json()).unwrap();
            let civ = &mut w["civs"][0];
            for g in 0..civ["stock"].as_array().unwrap().len() {
                let have = civ["stock"][g].as_i64().unwrap();
                if have < 5_000_000 {
                    civ["stock"][g] = 30_000_000.into();
                    let made = civ["flows"]["produced"][g].as_i64().unwrap() + 30_000_000 - have;
                    civ["flows"]["produced"][g] = made.into();
                }
            }
            let boost = civ["space"]["boost"].as_i64().unwrap();
            if boost < 50_000 {
                civ["space"]["boost"] = 300_000.into();
                let made = civ["space"]["made_total"].as_i64().unwrap() + 300_000 - boost;
                civ["space"]["made_total"] = made.into();
            }
            m = Match::load_json(&w.to_string()).unwrap();
            m.record_ledgers(true);
        }
        let sv = m.observe(0).space.expect("space is shown");
        station |= sv.stations.iter().any(|s| s.owner == 0 && s.orbit == "leo" && s.modules.len() >= 2);
        outpost |= sv.sites.iter().any(|s| s.owner == Some(0) && s.population.unwrap_or(0) > 0);
    }
    check(&m.take_ledger_trace());
    assert!(station, "a station with modules in low Earth orbit");
    let obs = m.observe(0);
    let rs: Vec<String> = obs.receipts.iter().filter(|r| r.action.starts_with("space")).map(|r| format!("{} {} {}", r.action, r.status, r.reason)).collect();
    assert!(outpost, "an inhabited outpost: {:?}\n{:?}", rs, obs.space.map(|s| (s.stations, s.transfers, s.boost)));
}

fn check(trace: &[bts_engine::ledger::LedgerSnapshot]) {
    for pair in trace.windows(2) {
        let broken = bts_engine::ledger::violations(&pair[0], &pair[1]);
        assert!(broken.is_empty(), "{}", broken.iter().take(6).cloned().collect::<Vec<_>>().join("\n"));
    }
}
