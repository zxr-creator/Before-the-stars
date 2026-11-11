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
