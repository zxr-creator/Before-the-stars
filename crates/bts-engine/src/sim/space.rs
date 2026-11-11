//! The off-world layer, core only (design chapters 37 §6-7 and 39 §4-5, in the lean
//! scope of chapter 41).
//!
//! - **Boost** (39 §4): a national stock of tonnes the launch chain can put into low
//!   Earth orbit. Launch-chain recipes carry `boost` and `boost_cap`; the economy
//!   makes boost and stands the stages down at the cap (`sim::economy`). Boost never
//!   decays. Every use of boost is paid from the stock month by month: a shipment
//!   waits on the pad until its boost is paid in full.
//! - **Zone stores** (37 §6.5): per seat and logistics zone; the Earth pool is the
//!   national stock. Moving goods between the pool, the zone stores and shipments in
//!   flight creates and destroys nothing; the ledger counts all three as the seat's.
//! - **Shipments** ([`Transit`]): lifts to Earth orbit, station parts, outposts,
//!   settlers and cargo. Propellant and hardware are drawn at the order from the
//!   departure store (propellant, else refined fuel); ratios and months are integer
//!   tables precomputed from appendix A. Impulsive propulsion departs only inside its
//!   window, low thrust in the first half of the cycle, fusion at any time; berths
//!   (docking modules, or an outpost's pad off the Earth) bound the tonnes departing
//!   from a zone each month.
//! - **Sites** ([`SiteSt`]): the nineteen sites as region-like objects with one
//!   population block, works, deposits and a zone store. Claimed by the first outpost
//!   to arrive; residents are born and die with the environment's multipliers, need
//!   housing, food, water and air, and power; residents beyond what is served die at
//!   three times the rate. Inhabited sites count for world governance.
//! - **Stations** ([`StationSt`]): a core and modules in one of ten orbits, crewed
//!   from qualified people the seat's works do not employ (a tenth of them aboard,
//!   counted where they live), powered by their own arrays and reactors.

use crate::content::{content, good_mass_kg};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;
use serde::{Deserialize, Serialize};

pub const NZ: usize = 10;
pub const ZONES: [&str; NZ] = ["earth_orbit", "moon", "nea", "mars", "venus", "mercury", "belt", "jupiter", "saturn", "neptune"];
pub const EO: usize = 0;
const MOON: usize = 1;
/// (synodic period, window, offset) in months; a zero period is always open (37 §6.5).
const WINDOWS: [(u32, u32, u32); NZ] = [(0, 0, 0), (0, 0, 0), (12, 2, 3), (26, 2, 11), (19, 2, 7), (4, 1, 1), (16, 3, 5), (13, 2, 9), (12, 2, 4), (12, 2, 8)];
/// Electricity a thousand residents draw by zone, units (37 §6.4: 40; Mars x1.2; outer x1.5).
const ZONE_POWER: [i64; NZ] = [40, 40, 40, 48, 40, 40, 40, 60, 60, 60];
/// Sunlight by zone, basis points of the Earth's orbit (for station arrays).
const ZONE_SOLAR: [i64; NZ] = [10_000, 10_000, 10_000, 4_300, 19_000, 66_000, 1_300, 370, 110, 11];
/// Mass of one person in a shipment and in boost, tonnes (39 §4.3).
pub const PERSON_T: i64 = 3;
/// People an outpost's founding party brings (37 §6.6).
pub const OUTPOST_PARTY: u32 = 1_000;
/// Propellant of a leg that starts off the Earth's orbit (or refuels at a depot
/// beyond it), as a share of the Earth-orbit figure: the stand-in for appendix A's
/// 3.0 km/s less.
const OFFWORLD_PROP_BP: i64 = 6_000;
/// Months a site works takes to build (37 §6.3: x1.25 off the Earth).
const SITE_BUILD_MONTHS: u32 = 8;

/// A propulsion family (37 §7.3): key, name, requirement, hardware share `d` (bp of
/// the payload), tonnes departing per berth level-month, carries people, windows
/// (0 impulsive, 1 low thrust, 2 none).
pub struct PropDef {
    pub key: &'static str,
    pub name: &'static str,
    pub req: &'static str,
    pub d_bp: i64,
    pub payload: i64,
    pub crew: bool,
    pub window: u8,
}

pub const PROPS: [PropDef; 5] = [
    PropDef { key: "chemical", name: "Chemical stages", req: "T142", d_bp: 300, payload: 2_000, crew: true, window: 0 },
    PropDef { key: "nuclear_thermal", name: "Nuclear thermal", req: "T157", d_bp: 2_000, payload: 3_000, crew: true, window: 0 },
    PropDef { key: "electric", name: "Electric (ion and Hall)", req: "T155", d_bp: 3_500, payload: 4_000, crew: false, window: 1 },
    PropDef { key: "nuclear_electric", name: "Nuclear electric", req: "T158", d_bp: 6_000, payload: 5_000, crew: false, window: 1 },
    PropDef { key: "fusion", name: "Fusion ship", req: "T173", d_bp: 8_000, payload: 10_000, crew: true, window: 2 },
];

/// One of the nineteen sites (37 §6.2, ratios and months of table 7.3 from Earth
/// orbit in the order of [`PROPS`]; 0 = not offered).
pub struct SiteDef {
    pub key: &'static str,
    pub name: &'static str,
    pub zone: usize,
    /// Surface gravity, hundredths of a g.
    pub gravity_cg: i64,
    /// Environmental mortality factor, bp (0 = uninhabitable).
    pub m_env: i64,
    pub housing_cap: i64,
    pub solar_bp: i64,
    /// Deposits: kind, amount in base units of its good, quality.
    pub deposits: &'static [(Deposit, i64, u16)],
    pub ratio: [i64; 5],
    pub months: [u32; 5],
}

const MT: i64 = 1_000_000;
const MOON_R: [i64; 5] = [42_000, 29_000, 24_000, 27_000, 28_000];
const MOON_M: [u32; 5] = [1, 1, 3, 2, 1];
const MARS_R: [i64; 5] = [30_000, 19_000, 15_000, 17_000, 18_000];

pub const SITES: [SiteDef; 19] = [
    SiteDef { key: "shackleton_rim", name: "Shackleton Rim", zone: 1, gravity_cg: 17, m_env: 10_800, housing_cap: 1_000_000, solar_bp: 12_000, deposits: &[(Deposit::Volatiles, 300 * MT, 10_000)], ratio: MOON_R, months: MOON_M },
    SiteDef { key: "mare_imbrium", name: "Mare Imbrium", zone: 1, gravity_cg: 17, m_env: 10_800, housing_cap: 500_000, solar_bp: 10_000, deposits: &[(Deposit::Helium3, 50_000, 10_000), (Deposit::IronOre, 2_000 * MT, 6_000), (Deposit::RareEarths, 50 * MT, 8_000)], ratio: MOON_R, months: MOON_M },
    SiteDef { key: "daedalus", name: "Daedalus", zone: 1, gravity_cg: 17, m_env: 10_800, housing_cap: 100_000, solar_bp: 10_000, deposits: &[], ratio: MOON_R, months: MOON_M },
    SiteDef { key: "amor_cluster", name: "Amor cluster", zone: 2, gravity_cg: 0, m_env: 11_000, housing_cap: 50_000, solar_bp: 10_000, deposits: &[(Deposit::IronOre, 500 * MT, 9_500), (Deposit::CobaltNickel, 50 * MT, 8_000), (Deposit::Precious, 50_000 * 1_000, 8_000), (Deposit::Volatiles, 100 * MT, 10_000)], ratio: MARS_R, months: [6, 4, 8, 6, 1] },
    SiteDef { key: "arcadia_planitia", name: "Arcadia Planitia", zone: 3, gravity_cg: 38, m_env: 10_500, housing_cap: 5_000_000, solar_bp: 4_300, deposits: &[(Deposit::Volatiles, 2_000 * MT, 10_000)], ratio: MARS_R, months: [8, 5, 11, 8, 1] },
    SiteDef { key: "valles_marineris", name: "Valles Marineris", zone: 3, gravity_cg: 38, m_env: 10_500, housing_cap: 1_500_000, solar_bp: 4_300, deposits: &[(Deposit::IronOre, 3_000 * MT, 8_000), (Deposit::Salt, 500 * MT, 8_000)], ratio: MARS_R, months: [8, 5, 11, 8, 1] },
    SiteDef { key: "jezero_delta", name: "Jezero Delta", zone: 3, gravity_cg: 38, m_env: 10_500, housing_cap: 500_000, solar_bp: 4_300, deposits: &[(Deposit::Volatiles, 200 * MT, 10_000)], ratio: MARS_R, months: [8, 5, 11, 8, 1] },
    SiteDef { key: "aphrodite_station", name: "Aphrodite cloud station", zone: 4, gravity_cg: 90, m_env: 10_300, housing_cap: 500_000, solar_bp: 19_000, deposits: &[], ratio: [27_000, 18_000, 15_000, 17_000, 18_000], months: [5, 3, 7, 5, 1] },
    SiteDef { key: "prokofiev", name: "Prokofiev", zone: 5, gravity_cg: 38, m_env: 11_500, housing_cap: 250_000, solar_bp: 66_000, deposits: &[(Deposit::Volatiles, 50 * MT, 10_000), (Deposit::IronOre, 2_000 * MT, 8_000)], ratio: [0, 96_000, 41_000, 41_000, 40_000], months: [0, 4, 10, 8, 2] },
    SiteDef { key: "ceres", name: "Ceres", zone: 6, gravity_cg: 3, m_env: 11_000, housing_cap: 2_000_000, solar_bp: 1_300, deposits: &[(Deposit::Volatiles, 5_000 * MT, 10_000), (Deposit::Saltpetre, 200 * MT, 8_000)], ratio: [97_000, 36_000, 20_000, 21_000, 21_000], months: [15, 10, 16, 12, 2] },
    SiteDef { key: "vesta", name: "Vesta", zone: 6, gravity_cg: 3, m_env: 11_000, housing_cap: 500_000, solar_bp: 1_300, deposits: &[(Deposit::IronOre, 3_000 * MT, 8_000)], ratio: [0, 41_000, 21_000, 21_000, 21_000], months: [0, 10, 16, 12, 2] },
    SiteDef { key: "psyche", name: "Psyche", zone: 6, gravity_cg: 1, m_env: 11_000, housing_cap: 100_000, solar_bp: 1_000, deposits: &[(Deposit::IronOre, 20_000 * MT, 9_800), (Deposit::CobaltNickel, 500 * MT, 9_000), (Deposit::Precious, MT * 1_000, 9_000)], ratio: [0, 40_000, 19_000, 20_000, 20_000], months: [0, 11, 17, 13, 2] },
    SiteDef { key: "callisto", name: "Valhalla", zone: 7, gravity_cg: 13, m_env: 10_800, housing_cap: 1_500_000, solar_bp: 370, deposits: &[(Deposit::Volatiles, 10_000 * MT, 10_000)], ratio: [0, 58_000, 0, 30_000, 30_000], months: [0, 24, 0, 24, 4] },
    SiteDef { key: "ganymede", name: "Ganymede", zone: 7, gravity_cg: 15, m_env: 11_500, housing_cap: 2_000_000, solar_bp: 370, deposits: &[(Deposit::Volatiles, 10_000 * MT, 10_000)], ratio: [0, 66_000, 0, 31_000, 31_000], months: [0, 24, 0, 24, 4] },
    SiteDef { key: "europa", name: "Europa", zone: 7, gravity_cg: 13, m_env: 14_000, housing_cap: 250_000, solar_bp: 370, deposits: &[(Deposit::Volatiles, 1_000 * MT, 10_000)], ratio: [0, 69_000, 0, 29_000, 28_000], months: [0, 24, 0, 24, 4] },
    SiteDef { key: "io", name: "Io", zone: 7, gravity_cg: 18, m_env: 0, housing_cap: 0, solar_bp: 370, deposits: &[], ratio: [0, 81_000, 0, 31_000, 30_000], months: [0, 24, 0, 24, 4] },
    SiteDef { key: "titan", name: "Kraken Mare", zone: 8, gravity_cg: 14, m_env: 10_300, housing_cap: 4_000_000, solar_bp: 110, deposits: &[(Deposit::Crude, 50_000 * MT, 8_000), (Deposit::Volatiles, 1_000 * MT, 10_000)], ratio: [74_000, 31_000, 0, 20_000, 20_000], months: [73, 48, 0, 40, 6] },
    SiteDef { key: "enceladus", name: "Enceladus", zone: 8, gravity_cg: 1, m_env: 11_000, housing_cap: 100_000, solar_bp: 110, deposits: &[(Deposit::Volatiles, 500 * MT, 10_000)], ratio: [0, 45_000, 0, 21_000, 20_000], months: [0, 48, 0, 40, 6] },
    SiteDef { key: "triton", name: "Triton", zone: 9, gravity_cg: 8, m_env: 11_000, housing_cap: 250_000, solar_bp: 11, deposits: &[(Deposit::Volatiles, 500 * MT, 10_000)], ratio: [0, 57_000, 0, 28_000, 28_000], months: [0, 150, 0, 96, 12] },
];

/// Crews spend at most this long in flight (37 §6.5).
const CREW_MONTHS: u32 = 36;

/// One of the ten station orbits (39 §5.2): placement ratios from low Earth orbit
/// without the landing leg (appendix A), months, zone.
pub struct OrbitDef {
    pub key: &'static str,
    pub name: &'static str,
    pub zone: usize,
    pub ratio: [i64; 5],
    pub months: [u32; 5],
}

const HOP: [u32; 5] = [1, 1, 3, 2, 1];
pub const ORBITS: [OrbitDef; 10] = [
    OrbitDef { key: "leo", name: "Low Earth orbit", zone: 0, ratio: [10_000; 5], months: [0; 5] },
    OrbitDef { key: "geo", name: "Geostationary orbit", zone: 0, ratio: [16_000, 16_000, 13_800, 16_000, 18_000], months: HOP },
    OrbitDef { key: "eml1", name: "Earth-Moon L1", zone: 1, ratio: [26_600, 18_300, 15_100, 16_900, 18_100], months: HOP },
    OrbitDef { key: "eml5", name: "Earth-Moon L5", zone: 0, ratio: [15_000, 15_000, 13_800, 16_000, 18_000], months: HOP },
    OrbitDef { key: "sel2", name: "Sun-Earth L2", zone: 0, ratio: [14_000, 14_000, 13_800, 16_000, 18_000], months: HOP },
    OrbitDef { key: "llo", name: "Low lunar orbit", zone: 1, ratio: [26_600, 18_300, 15_100, 16_900, 18_100], months: HOP },
    OrbitDef { key: "mars_orbit", name: "Mars orbit", zone: 3, ratio: MARS_R, months: [8, 5, 11, 8, 1] },
    OrbitDef { key: "ceres_orbit", name: "Ceres orbit", zone: 6, ratio: [84_000, 31_000, 17_300, 18_200, 18_200], months: [15, 10, 16, 12, 2] },
    OrbitDef { key: "callisto_orbit", name: "Callisto orbit", zone: 7, ratio: [0, 36_000, 0, 18_700, 18_700], months: [0, 24, 0, 24, 4] },
    OrbitDef { key: "titan_orbit", name: "Titan orbit", zone: 8, ratio: [67_000, 28_000, 0, 18_200, 18_200], months: [73, 48, 0, 40, 6] },
];

/// A station core stage (39 §5.3).
pub struct CoreDef {
    pub key: &'static str,
    pub name: &'static str,
    pub req: &'static str,
    pub mass: i64,
    pub slots: u16,
    /// Posts aboard and in the ground segment filled from qualified people (K2's are
    /// the doc-35 orbital station's, on the ground).
    pub posts: &'static [(Qual, u32)],
    pub power: i64,
    pub aboard_cap: u32,
}

pub const CORES: [CoreDef; 4] = [
    CoreDef { key: "k1", name: "K1 truss core", req: "T142 & T144", mass: 400, slots: 4, posts: &[(Qual::Orbital, 2_000), (Qual::Technician, 2_000)], power: -20, aboard_cap: 400 },
    CoreDef { key: "k2", name: "K2 frame core", req: "T142 & T144 & T145 & F:orbital_station", mass: 2_000, slots: 8, posts: &[], power: -200, aboard_cap: 2_200 },
    CoreDef { key: "k3", name: "K3 orbital complex", req: "T153", mass: 8_000, slots: 14, posts: &[(Qual::Orbital, 40_000)], power: -400, aboard_cap: 4_000 },
    CoreDef { key: "k4", name: "K4 orbital city spine", req: "T177", mass: 30_000, slots: 20, posts: &[(Qual::Orbital, 60_000)], power: -800, aboard_cap: 6_000 },
];

/// A station module (39 §5.3): the core set of the lean scope.
pub struct ModDef {
    pub key: &'static str,
    pub name: &'static str,
    pub req: &'static str,
    pub mass: i64,
    pub posts: &'static [(Qual, u32)],
    /// Electricity drawn (negative) or given (positive) per level, units.
    pub power: i64,
}

pub const M_HABITAT: usize = 0;
pub const M_LIFE: usize = 1;
pub const M_SOLAR: usize = 2;
pub const M_REACTOR: usize = 3;
pub const M_DOCKING: usize = 4;
pub const M_SHIPYARD: usize = 5;
pub const M_LAB: usize = 6;
pub const M_REFINERY: usize = 7;
pub const MODULES: [ModDef; 8] = [
    ModDef { key: "habitat", name: "Habitat", req: "T144", mass: 300, posts: &[(Qual::Orbital, 500)], power: -10 },
    ModDef { key: "life_support", name: "Life support", req: "T144", mass: 200, posts: &[(Qual::Technician, 200)], power: -30 },
    ModDef { key: "solar", name: "Solar array", req: "T106 & T143", mass: 150, posts: &[(Qual::Technician, 50)], power: 100 },
    ModDef { key: "reactor", name: "Reactor", req: "T147", mass: 600, posts: &[(Qual::Technician, 1_000)], power: 400 },
    ModDef { key: "docking", name: "Docking and depot", req: "T142", mass: 500, posts: &[(Qual::Orbital, 1_500)], power: -20 },
    // the doc-35 orbital yard is its ground segment: posts and inputs stay there
    ModDef { key: "shipyard", name: "Shipyard", req: "T145 & C058 & F:orbital_yard", mass: 6_000, posts: &[], power: -600 },
    ModDef { key: "lab", name: "Research laboratory", req: "T143", mass: 300, posts: &[(Qual::Scientist, 1_000), (Qual::Technician, 500)], power: -40 },
    ModDef { key: "refinery", name: "Propellant refinery", req: "T159", mass: 400, posts: &[(Qual::Technician, 300)], power: -100 },
];

/// A works at a site (37 appendix B, the lean set): bill (base units), posts,
/// electricity drawn (negative) or given per level.
pub struct WorkDef {
    pub key: &'static str,
    pub name: &'static str,
    pub req: &'static str,
    pub bill: &'static [(Good, i64)],
    pub posts: u32,
    pub power: i64,
}

pub const W_OUTPOST: usize = 0;
pub const W_HABITAT: usize = 1;
pub const W_LIFE: usize = 2;
pub const W_ICE: usize = 3;
pub const W_FARM: usize = 4;
pub const W_SOLAR: usize = 5;
pub const W_REACTOR: usize = 6;
pub const W_RESEARCH: usize = 7;
pub const W_MINE: usize = 8;
pub const W_HE3: usize = 9;
pub const WORKS: [WorkDef; 10] = [
    WorkDef { key: "outpost", name: "Pressurized outpost", req: "T144", bill: &[(Good::Metal, 300), (Good::Components, 100), (Good::Insulation, 50), (Good::Electronics, 10)], posts: 300, power: 100 },
    WorkDef { key: "habitat", name: "Shielded habitat", req: "T170", bill: &[(Good::Materials, 20_000), (Good::Metal, 2_000), (Good::Components, 500), (Good::Insulation, 300), (Good::Electronics, 50)], posts: 500, power: -20 },
    WorkDef { key: "life_support", name: "Life support works", req: "T144", bill: &[(Good::Metal, 500), (Good::Components, 300), (Good::Electronics, 50)], posts: 200, power: -30 },
    WorkDef { key: "ice_works", name: "Ice works", req: "T159", bill: &[(Good::Metal, 1_000), (Good::Components, 500)], posts: 400, power: -50 },
    WorkDef { key: "habitat_farm", name: "Habitat farm", req: "T135 | T093 & T144", bill: &[(Good::Materials, 3_000), (Good::Metal, 500), (Good::Insulation, 300), (Good::Conductors, 200)], posts: 500, power: -150 },
    WorkDef { key: "solar_array", name: "Solar array field", req: "T106 & T143", bill: &[(Good::Conductors, 500), (Good::Substrate, 200), (Good::Metal, 500), (Good::Electronics, 100)], posts: 50, power: 100 },
    WorkDef { key: "fission_plant", name: "Off-world fission plant", req: "T147", bill: &[(Good::Metal, 16_000), (Good::Components, 8_000), (Good::Electronics, 4_000), (Good::Conductors, 4_000), (Good::Insulation, 2_000)], posts: 1_200, power: 400 },
    WorkDef { key: "research_station", name: "Research station", req: "T143", bill: &[(Good::Metal, 1_000), (Good::Components, 500), (Good::Instruments, 500), (Good::Electronics, 100)], posts: 1_500, power: -40 },
    WorkDef { key: "mining_station", name: "Mining station", req: "T172", bill: &[(Good::Metal, 2_000), (Good::Components, 1_000), (Good::Electronics, 50)], posts: 600, power: -100 },
    WorkDef { key: "helium3_extractor", name: "Helium-3 extractor", req: "T172 & T149", bill: &[(Good::Metal, 6_000), (Good::Components, 3_000), (Good::Electronics, 200)], posts: 1_500, power: -300 },
];

/// Researcher-months a fully staffed research station or laboratory module level gives.
const LAB_RESEARCH: i64 = 1_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// A seat's off-world accounts.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CivSpace {
    /// Boost in stock and the cap of the launch stages (tonnes).
    pub boost: i64,
    pub cap: i64,
    /// Cumulative boost made and spent: `boost = made_total - spent_total`.
    pub made_total: i64,
    pub spent_total: i64,
    pub made_month: i64,
    pub spent_month: i64,
    pub made_last: i64,
    pub spent_last: i64,
    /// This month a launch complex made boost or stood down at the cap, and the
    /// consecutive months it has (doc 35 check 13 as revised by 39 §4.6).
    pub lc_ok: bool,
    pub streak: u32,
    /// Stages this month: (method name, levels, made, standing down).
    pub by_stage: Vec<(String, u16, i64, bool)>,
    pub by_stage_last: Vec<(String, u16, i64, bool)>,
    /// Zone stores, `[zone][good]` in base units (the Earth pool is `Civ::stock`).
    pub stores: Vec<Vec<i64>>,
    /// Zones this seat has reached or holds a site in (bit per zone).
    pub surveyed: u16,
    /// People in the research posts of its stations and sites last month (ledger).
    pub lab_staff: i64,
}

impl CivSpace {
    pub fn new() -> CivSpace {
        CivSpace { stores: vec![vec![0; NG]; NZ], surveyed: 1, ..Default::default() }
    }
    fn store(&mut self, z: usize) -> &mut Vec<i64> {
        if self.stores.len() < NZ {
            self.stores.resize(NZ, vec![0; NG]);
        }
        &mut self.stores[z]
    }
    pub fn held(&self, z: usize, g: Good) -> i64 {
        self.stores.get(z).map(|s| s[g.index()]).unwrap_or(0)
    }
}

/// One of the nineteen sites.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SiteSt {
    pub owner: Option<SeatId>,
    pub founded: Month,
    pub block: PopBlock,
    /// Levels by [`WORKS`] index.
    pub works: Vec<u16>,
    /// Levels under construction: works and the month they complete.
    pub building: Vec<(u8, Month)>,
    pub deposits: Vec<DepositState>,
    pub served_hist: [u16; 12],
    pub served_bp: u16,
    pub rate_bp: u16,
    pub births_last: u32,
    pub deaths_last: u32,
}

/// A station.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StationSt {
    pub id: u32,
    pub owner: SeatId,
    pub orbit: u8,
    /// Core stage 1-4.
    pub core: u8,
    /// Levels by [`MODULES`] index.
    pub modules: Vec<u16>,
    pub staffed_bp: u16,
    pub power_bp: u16,
    pub supplied_bp: u16,
    pub rate_bp: u16,
    pub aboard: u32,
    /// Posts filled last month, people.
    pub staffed: u32,
}

/// What a shipment is for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    /// Goods lifted from the Earth pool to the Earth-orbit store.
    Lift,
    Cargo,
    Outpost,
    Settlers,
    /// A core stage (1-4) for the orbit.
    Core(u8),
    /// A module ([`MODULES`] index) for the seat's station in the orbit.
    Module(u8),
}

/// A shipment: waiting for its boost, waiting for a window or berth, or in flight.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transit {
    pub id: u32,
    pub owner: SeatId,
    pub from: u8,
    pub to: u8,
    pub prop: u8,
    pub purpose: Purpose,
    pub site: Option<u8>,
    pub orbit: Option<u8>,
    pub ordered: Month,
    /// Boost still to pay before departure, tonnes.
    pub due: i64,
    pub departs: Option<Month>,
    pub arrives: Month,
    pub months: u32,
    /// Goods carried, base units; payload tonnes (goods, people and station parts).
    pub goods: Vec<(Good, i64)>,
    pub payload_t: i64,
    /// People aboard by age (empty = none), and their lineage.
    pub ages: Vec<u32>,
    pub lineage: u16,
}

impl Transit {
    pub fn people(&self) -> u32 {
        self.ages.iter().sum()
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SpaceWorld {
    pub sites: Vec<SiteSt>,
    pub stations: Vec<StationSt>,
    pub transits: Vec<Transit>,
}

impl SpaceWorld {
    pub fn new() -> SpaceWorld {
        let sites = SITES
            .iter()
            .map(|d| SiteSt {
                owner: None,
                founded: 0,
                block: PopBlock::new(0, None),
                works: vec![0; WORKS.len()],
                building: Vec::new(),
                deposits: d.deposits.iter().map(|(k, a, q)| DepositState::new(*k, *a, *q)).collect(),
                served_hist: [10_000; 12],
                served_bp: 10_000,
                rate_bp: 0,
                births_last: 0,
                deaths_last: 0,
            })
            .collect();
        SpaceWorld { sites, stations: Vec::new(), transits: Vec::new() }
    }
    /// Residents of a seat's sites and people of its shipments.
    pub fn people_of(&self, seat: SeatId) -> u64 {
        self.sites.iter().filter(|s| s.owner == Some(seat)).map(|s| s.block.total() as u64).sum::<u64>() + self.transits.iter().filter(|t| t.owner == seat).map(|t| t.people() as u64).sum::<u64>()
    }
    pub fn people(&self) -> u64 {
        self.sites.iter().map(|s| s.block.total() as u64).sum::<u64>() + self.transits.iter().map(|t| t.people() as u64).sum::<u64>()
    }
}

/// The region id a site's deposits are booked under in the ledger.
pub fn site_region_id(i: usize) -> RegionId {
    60_000 + i as RegionId
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Whether every term of an `&`-joined requirement (with `|` alternatives) holds:
/// technologies understood, practices established, `F:key` a works the seat governs.
fn req_met(w: &World, seat: SeatId, req: &str) -> bool {
    let civ = &w.civs[seat as usize];
    req.split('|').any(|alt| {
        alt.split('&').all(|t| {
            let t = t.trim();
            if let Some(k) = t.strip_prefix("F:") {
                w.regions.iter().any(|r| r.controller == Some(seat) && r.fac_level(k) > 0)
            } else if t.starts_with('C') {
                civ.est_id(t)
            } else {
                civ.knows_id(t)
            }
        })
    })
}

fn mass_t(g: Good, amount: i64) -> i64 {
    (amount * good_mass_kg(g) + 999) / 1000
}

/// Spend boost: never more than the stock.
fn spend(cs: &mut CivSpace, t: i64) -> i64 {
    let t = t.min(cs.boost).max(0);
    cs.boost -= t;
    cs.spent_total += t;
    cs.spent_month += t;
    t
}

/// Move goods between the Earth pool and a zone store (no flow: the seat holds both).
fn pool_to_zone(civ: &mut Civ, z: usize, g: Good, amount: i64) -> i64 {
    let t = amount.min(civ.stock[g.index()]).max(0);
    civ.stock[g.index()] -= t;
    civ.space.store(z)[g.index()] += t;
    t
}

fn zone_take(civ: &mut Civ, z: usize, g: Good, amount: i64) -> i64 {
    let s = civ.space.store(z);
    let t = amount.min(s[g.index()]).max(0);
    s[g.index()] -= t;
    civ.flows.consumed[g.index()] += t;
    t
}

fn zone_add(civ: &mut Civ, z: usize, g: Good, amount: i64) {
    let amount = amount.max(0);
    civ.space.store(z)[g.index()] += amount;
    civ.flows.produced[g.index()] += amount;
}

pub fn window_open(prop: usize, zone: usize, month: Month) -> bool {
    let (syn, win, off) = WINDOWS[zone];
    if syn == 0 {
        return true;
    }
    match PROPS[prop].window {
        0 => (month + off) % syn < win,
        1 => (month + off) % syn < syn / 2,
        _ => true,
    }
}

fn opens_in(prop: usize, zone: usize, month: Month) -> u32 {
    (0..200).find(|k| window_open(prop, zone, month + k)).unwrap_or(0)
}

pub fn props_known(w: &World, seat: SeatId) -> Vec<usize> {
    (0..PROPS.len()).filter(|p| req_met(w, seat, PROPS[*p].req)).collect()
}

/// Whether the seat has an operating depot (a docking module on a station of rate
/// at least half) in a zone.
fn depot_in(w: &World, seat: SeatId, z: usize) -> bool {
    w.space.stations.iter().any(|s| s.owner == seat && ORBITS[s.orbit as usize].zone == z && s.modules[M_DOCKING] > 0 && s.rate_bp >= 5_000)
}

/// Tonnes a seat may send from a zone each month by a propulsion family: docking
/// modules of operating stations there, or one berth at an outpost off the Earth.
fn berth_capacity(w: &World, seat: SeatId, z: usize, prop: usize) -> i64 {
    let docks: i64 = w.space.stations.iter().filter(|s| s.owner == seat && ORBITS[s.orbit as usize].zone == z && s.rate_bp >= 5_000).map(|s| s.modules[M_DOCKING] as i64).sum();
    let pads = if z != EO && w.space.sites.iter().enumerate().any(|(i, s)| s.owner == Some(seat) && SITES[i].zone == z && s.works[W_OUTPOST] > 0) { 1 } else { 0 };
    (docks + pads) * PROPS[prop].payload
}

/// Ratio (bp) and months of a leg to a destination by a propulsion family; None
/// when it is not offered. `dest` is a site, an orbit, or a zone store (the
/// cheapest site of the zone).
#[derive(Clone, Copy)]
enum Dest {
    Site(usize),
    Orbit(usize),
    Zone(usize),
}

fn dest_zone(d: Dest) -> usize {
    match d {
        Dest::Site(i) => SITES[i].zone,
        Dest::Orbit(o) => ORBITS[o].zone,
        Dest::Zone(z) => z,
    }
}

fn leg(from: usize, d: Dest, prop: usize) -> Option<(i64, u32)> {
    let table = |z: usize| -> Option<(i64, u32)> {
        if z == EO {
            return Some((10_000, 0));
        }
        SITES.iter().filter(|s| s.zone == z && s.ratio[prop] > 0).map(|s| (s.ratio[prop], s.months[prop])).min()
    };
    let base = match d {
        Dest::Site(i) => (SITES[i].ratio[prop] > 0).then(|| (SITES[i].ratio[prop], SITES[i].months[prop])),
        Dest::Orbit(o) => (ORBITS[o].ratio[prop] > 0).then(|| (ORBITS[o].ratio[prop], ORBITS[o].months[prop])),
        Dest::Zone(z) => table(z),
    };
    let to = dest_zone(d);
    if from == EO {
        return base;
    }
    // off the Earth's orbit: the leg to Earth orbit mirrors the outbound one, legs
    // between other zones use the destination's figures; both start from a zone
    // without the climb out of Earth orbit (propellant cut at the order)
    if to == EO {
        return table(from);
    }
    if from == to {
        return Some((10_000, 1));
    }
    base
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

pub type Refusal = (&'static str, String);

fn refuse<T>(code: &'static str, reason: impl Into<String>) -> Result<T, Refusal> {
    Err((code, reason.into()))
}

fn zone_index(key: &str) -> Option<usize> {
    let k = if key == "main_belt" { "belt" } else { key };
    ZONES.iter().position(|z| *z == k)
}
pub fn site_index(key: &str) -> Option<usize> {
    SITES.iter().position(|s| s.key == key).or_else(|| key.parse::<usize>().ok().filter(|n| (1..=19).contains(n)).map(|n| n - 1))
}
fn orbit_index(key: &str) -> Option<usize> {
    ORBITS.iter().position(|o| o.key == key)
}
fn prop_index(key: &str) -> Option<usize> {
    PROPS.iter().position(|p| p.key == key)
}

/// The region settlers leave from: the seat's most populous governed region.
fn home_region(w: &World, seat: SeatId) -> Option<usize> {
    (0..w.regions.len()).filter(|i| w.regions[*i].controller == Some(seat)).max_by_key(|i| (w.regions[*i].population(), std::cmp::Reverse(*i)))
}

/// Take `count` adults aged 20-45 from a region for a shipment (their
/// qualifications lapse in space service, ledger channel `enlisted`).
fn draw_settlers(w: &mut World, ri: usize, count: u32) -> Vec<u32> {
    let working_before = w.regions[ri].working();
    let r = &mut w.regions[ri];
    let pool: u32 = r.blocks.iter().map(|b| b.ages[20..=45].iter().sum::<u32>()).sum();
    let mut ages = vec![0u32; AGES];
    if pool < count {
        return ages;
    }
    let mut rem: u64 = 0;
    let mut taken = 0u32;
    for b in r.blocks.iter_mut() {
        for age in 20..=45 {
            let have = b.ages[age] as u64;
            let x = have * count as u64 + rem;
            let take = ((x / pool as u64).min(have) as u32).min(count - taken);
            rem = x % pool as u64;
            b.ages[age] -= take;
            ages[age] += take;
            taken += take;
        }
    }
    // rounding: the rest from the oldest cells that still hold people
    'outer: for b in r.blocks.iter_mut() {
        for age in (20..=45).rev() {
            if taken >= count {
                break 'outer;
            }
            let take = (count - taken).min(b.ages[age]);
            b.ages[age] -= take;
            ages[age] += take;
            taken += take;
        }
    }
    crate::sim::population::roles_leave(w, ri, taken, working_before, QualExit::Enlisted);
    ages
}

/// Return people from a shipment to the seat's capital (or most populous region)
/// as ordinary adults.
fn return_home(w: &mut World, seat: SeatId, ages: &[u32]) {
    let n: u32 = ages.iter().sum();
    if n == 0 {
        return;
    }
    let cap = w.civs[seat as usize].capital as usize;
    let ri = if w.regions[cap].controller == Some(seat) { Some(cap) } else { home_region(w, seat) };
    let lineage = w.civs[seat as usize].lineage;
    let ri = ri.or_else(|| (0..w.regions.len()).find(|i| w.regions[*i].controller.is_some())).unwrap_or(cap);
    let r = &mut w.regions[ri];
    if r.blocks.is_empty() {
        r.blocks.push(PopBlock::new(lineage, None));
    }
    for (a, k) in ages.iter().enumerate() {
        r.blocks[0].ages[a] += *k;
    }
}

/// Goods for a leg from zone `from`: what the departure store holds is used first;
/// from Earth orbit, what is short is lifted from the Earth pool and paid in boost.
/// Returns the boost the lift adds, or the shortfall.
fn stage_goods(civ: &mut Civ, from: usize, needs: &[(Good, i64)], dry_run: bool) -> Result<i64, String> {
    let mut lift = 0i64;
    let mut short = Vec::new();
    for (g, a) in needs {
        let in_store = civ.space.held(from, *g);
        let rest = (*a - in_store).max(0);
        if rest > 0 {
            if from == EO && civ.stock_of(*g) >= rest {
                lift += mass_t(*g, rest);
            } else {
                short.push(format!("{} of {:?}", group(rest), g));
            }
        }
    }
    if !short.is_empty() {
        return Err(short.join(", "));
    }
    if !dry_run {
        for (g, a) in needs {
            let in_store = civ.space.held(from, *g);
            let rest = (*a - in_store).max(0);
            if rest > 0 {
                pool_to_zone(civ, from, *g, rest);
            }
            let s = civ.space.store(from);
            s[g.index()] -= *a;
        }
    }
    Ok(lift)
}

/// Propellant for a leg: propellant in the store first, then refined fuel.
fn propellant_split(civ: &Civ, from: usize, need: i64) -> Vec<(Good, i64)> {
    let have = civ.space.held(from, Good::Propellant) + if from == EO { civ.stock_of(Good::Propellant) } else { 0 };
    let p = need.min(have);
    let mut v = vec![(Good::Propellant, p)];
    if need > p {
        v.push((Good::Fuel, need - p));
    }
    v.retain(|x| x.1 > 0);
    v
}

/// Book a leg: draw its propellant and hardware (burned: booked as consumed at
/// departure, here at the order) and return (prop, ratio, months, boost of lifts).
fn plan_leg(w: &World, seat: SeatId, from: usize, d: Dest, payload_t: i64, people: bool, want: Option<usize>) -> Result<(usize, i64, u32, Vec<(Good, i64)>), Refusal> {
    let known = props_known(w, seat);
    if known.is_empty() {
        return refuse("no_propulsion", "No propulsion family is understood (chemical rocket propulsion and repeatable orbital transport)");
    }
    let mut best: Option<(i64, u32, usize)> = None;
    for &p in &known {
        if want.map(|x| x != p).unwrap_or(false) {
            continue;
        }
        let crew_ok = PROPS[p].crew || (p == 3 && w.civs[seat as usize].knows_id("T137"));
        if people && !crew_ok {
            continue;
        }
        if let Some((r, m)) = leg(from, d, p) {
            if people && m > CREW_MONTHS {
                continue;
            }
            if r > 120_000 {
                continue;
            }
            if best.map(|b| (r, m) < (b.0, b.1)).unwrap_or(true) {
                best = Some((r, m, p));
            }
        }
    }
    let Some((ratio, months, prop)) = best else {
        return refuse("no_route", "No propulsion family this seat flies reaches that destination with this load");
    };
    let mut prop_t = payload_t * (ratio - 10_000 - PROPS[prop].d_bp).max(0) / 10_000;
    let to = dest_zone(d);
    if from != EO || (to != EO && to != MOON && depot_in(w, seat, MOON)) {
        prop_t = prop_t * OFFWORLD_PROP_BP / 10_000;
    }
    let hardware = payload_t * PROPS[prop].d_bp / 10_000;
    let mut needs = propellant_split(&w.civs[seat as usize], from, prop_t);
    if hardware > 0 {
        needs.push((Good::Components, hardware));
    }
    Ok((prop, ratio, months, needs))
}

fn new_transit(w: &mut World, seat: SeatId, from: usize, to: usize, prop: usize, purpose: Purpose, due: i64, months: u32, goods: Vec<(Good, i64)>, payload_t: i64, ages: Vec<u32>) -> u32 {
    let id = w.id();
    let lineage = w.civs[seat as usize].lineage;
    w.space.transits.push(Transit { id, owner: seat, from: from as u8, to: to as u8, prop: prop as u8, purpose, site: None, orbit: None, ordered: w.month, due, departs: None, arrives: 0, months, goods, payload_t, ages, lineage });
    id
}

fn merge(goods: &mut Vec<(Good, i64)>, g: Good, a: i64) {
    if a <= 0 {
        return;
    }
    if let Some(x) = goods.iter_mut().find(|x| x.0 == g) {
        x.1 += a;
    } else {
        goods.push((g, a));
    }
}

/// Apply an order of the off-world layer.
pub fn apply(w: &mut World, seat: SeatId, order: SpaceOrder) -> Result<(String, Option<u32>), Refusal> {
    let si = seat as usize;
    if !w.civs[si].knows_id("T140") {
        return refuse("no_rocketry", "Rocket propulsion is not understood");
    }
    match order {
        SpaceOrder::Launch { good, amount } => {
            if amount <= 0 || w.civs[si].stock_of(good) < amount {
                return refuse("stock", format!("The stores hold {} of {:?}", group(w.civs[si].stock_of(good)), good));
            }
            if w.civs[si].space.made_total == 0 {
                return refuse("no_boost", "No launch stage has made boost");
            }
            let t = mass_t(good, amount);
            let civ = &mut w.civs[si];
            civ.stock[good.index()] -= amount;
            let id = new_transit(w, seat, EO, EO, 0, Purpose::Lift, t, 0, vec![(good, amount)], t, Vec::new());
            Ok((format!("Lift of {} t ordered: it reaches the Earth-orbit store as boost is paid", group(t)), Some(id)))
        }
        SpaceOrder::Land { good, amount } => {
            let have = w.civs[si].space.held(EO, good);
            if amount <= 0 || have < amount {
                return refuse("stock", format!("The Earth-orbit store holds {} of {:?}", group(have), good));
            }
            let civ = &mut w.civs[si];
            civ.space.store(EO)[good.index()] -= amount;
            civ.stock[good.index()] += amount;
            Ok(("Goods brought down to the national stores".into(), None))
        }
        SpaceOrder::Place { orbit, part } => place(w, seat, &orbit, &part),
        SpaceOrder::FoundOutpost { site, propulsion } => {
            let Some(i) = site_index(&site) else { return refuse("unknown_site", "No such site") };
            if !req_met(w, seat, WORKS[W_OUTPOST].req) {
                return refuse("locked", "Spaceflight life support is not understood");
            }
            if w.space.sites[i].owner.is_some() {
                return refuse("claimed", format!("{} is already claimed", SITES[i].name));
            }
            if SITES[i].m_env == 0 {
                return refuse("uninhabitable", format!("Nobody can live at {}", SITES[i].name));
            }
            if w.space.transits.iter().any(|t| t.owner == seat && t.purpose == Purpose::Outpost && t.site == Some(i as u8)) {
                return refuse("duplicate", "An outpost party is already on its way there");
            }
            let mut goods: Vec<(Good, i64)> = WORKS[W_OUTPOST].bill.to_vec();
            // a year of food and of water and air for the party
            merge(&mut goods, Good::Food, OUTPOST_PARTY as i64 * 12);
            merge(&mut goods, Good::Volatiles, OUTPOST_PARTY as i64 * 13 * 12 / 1000);
            ship(w, seat, EO, Dest::Site(i), goods, OUTPOST_PARTY, Purpose::Outpost, propulsion.as_deref())
        }
        SpaceOrder::Ship { from_zone, to_zone, goods, people, site, propulsion } => {
            let from = match from_zone.as_deref() {
                None => EO,
                Some(k) => zone_index(k).ok_or_else(|| ("unknown_zone", "No such zone".to_string()))?,
            };
            let Some(to) = zone_index(&to_zone) else { return refuse("unknown_zone", "No such zone") };
            let dest = match site.as_deref() {
                Some(k) => {
                    let Some(i) = site_index(k) else { return refuse("unknown_site", "No such site") };
                    if SITES[i].zone != to {
                        return refuse("zone", "The site is not in that zone");
                    }
                    Dest::Site(i)
                }
                None => Dest::Zone(to),
            };
            if people > 0 {
                let Dest::Site(i) = dest else { return refuse("site", "Settlers need a destination site") };
                if w.space.sites[i].owner != Some(seat) {
                    return refuse("site", "Settlers may go only to a site this seat holds");
                }
                if from != EO {
                    return refuse("settlers", "Settlers leave from the Earth");
                }
            }
            if from == to && people == 0 {
                return refuse("same_zone", "Departure and destination are the same zone");
            }
            let goods: Vec<(Good, i64)> = goods.into_iter().filter(|g| g.amount > 0).map(|g| (g.good, g.amount)).collect();
            if goods.is_empty() && people == 0 {
                return refuse("empty", "Nothing to ship");
            }
            ship(w, seat, from, dest, goods, people, if people > 0 { Purpose::Settlers } else { Purpose::Cargo }, propulsion.as_deref())
        }
        SpaceOrder::SiteBuild { site, works } => {
            let Some(i) = site_index(&site) else { return refuse("unknown_site", "No such site") };
            let Some(k) = WORKS.iter().position(|x| x.key == works) else { return refuse("unknown_works", "No such works") };
            if w.space.sites[i].owner != Some(seat) {
                return refuse("site", "This seat does not hold that site");
            }
            if k == W_OUTPOST {
                return refuse("outpost", "An outpost is founded by a founding party");
            }
            if !req_met(w, seat, WORKS[k].req) {
                return refuse("locked", format!("{} cannot be built yet", WORKS[k].name));
            }
            let dep = |d: Deposit| w.space.sites[i].deposits.iter().any(|x| x.kind == d && x.remaining > 0);
            let ok_site = match k {
                W_ICE => dep(Deposit::Volatiles),
                W_HE3 => dep(Deposit::Helium3),
                W_MINE => [Deposit::IronOre, Deposit::CobaltNickel, Deposit::Precious, Deposit::RareEarths].iter().any(|d| dep(*d)),
                W_HABITAT | W_FARM => SITES[i].m_env > 0,
                W_SOLAR => SITES[i].solar_bp >= 1_000,
                _ => true,
            };
            if !ok_site {
                return refuse("site", format!("{} cannot be built at {}", WORKS[k].name, SITES[i].name));
            }
            let z = SITES[i].zone;
            let civ = &mut w.civs[si];
            let short: Vec<String> = WORKS[k].bill.iter().filter(|(g, a)| civ.space.held(z, *g) < *a).map(|(g, a)| format!("{} of {:?}", group(*a - civ.space.held(z, *g)), g)).collect();
            if !short.is_empty() {
                return refuse("bill", format!("The {} store lacks {}", ZONES[z], short.join(", ")));
            }
            for (g, a) in WORKS[k].bill {
                zone_take(civ, z, *g, *a);
            }
            let ready = w.month + SITE_BUILD_MONTHS;
            w.space.sites[i].building.push((k as u8, ready));
            Ok((format!("{} under construction at {}", WORKS[k].name, SITES[i].name), None))
        }
    }
}

/// A shipment of goods (and people) from a zone to a destination.
fn ship(w: &mut World, seat: SeatId, from: usize, dest: Dest, goods: Vec<(Good, i64)>, people: u32, purpose: Purpose, want: Option<&str>) -> Result<(String, Option<u32>), Refusal> {
    let si = seat as usize;
    let want = match want {
        Some(k) => Some(prop_index(k).ok_or_else(|| ("unknown_propulsion", "No such propulsion family".to_string()))?),
        None => None,
    };
    let payload: i64 = goods.iter().map(|(g, a)| mass_t(*g, *a)).sum::<i64>() + people as i64 * PERSON_T;
    let (prop, _ratio, months, mut needs) = plan_leg(w, seat, from, dest, payload, people > 0, want)?;
    let to = dest_zone(dest);
    if berth_capacity(w, seat, from, prop) < payload.min(PROPS[prop].payload) {
        return refuse("no_berth", format!("No berth for {} departures in the {} zone (a docking module on an operating station, or an outpost off the Earth)", PROPS[prop].name, ZONES[from]));
    }
    if payload > berth_capacity(w, seat, from, prop) {
        return refuse("berth", format!("The berths of the {} zone send {} t a month", ZONES[from], group(berth_capacity(w, seat, from, prop))));
    }
    for (g, a) in &goods {
        merge(&mut needs, *g, *a);
    }
    let ri = if people > 0 { Some(home_region(w, seat).ok_or_else(|| ("people", "No governed region to leave from".to_string()))?) } else { None };
    if let Some(ri) = ri {
        let pool: u32 = w.regions[ri].blocks.iter().map(|b| b.ages[20..=45].iter().sum::<u32>()).sum();
        if pool < people * 2 {
            return refuse("people", "Too few adults in the departure region");
        }
    }
    let lift = stage_goods(&mut w.civs[si], from, &needs, true).map_err(|s| ("goods", format!("Short of {s}")))?;
    let lift = stage_goods(&mut w.civs[si], from, &needs, false).map(|_| lift).unwrap_or(lift);
    // propellant and hardware burn on the way: booked as used now
    let carried: Vec<(Good, i64)> = goods.clone();
    for (g, a) in &needs {
        let in_goods = carried.iter().find(|x| x.0 == *g).map(|x| x.1).unwrap_or(0);
        let burned = (*a - in_goods).max(0);
        w.civs[si].flows.consumed[g.index()] += burned;
    }
    let ages = match ri {
        Some(ri) => draw_settlers(w, ri, people),
        None => Vec::new(),
    };
    let due = lift + people as i64 * PERSON_T * (from == EO) as i64;
    let id = new_transit(w, seat, from, to, prop, purpose, due, months, carried, payload, ages);
    if let Some(t) = w.space.transits.last_mut() {
        if let Dest::Site(i) = dest {
            t.site = Some(i as u8);
        }
    }
    let target = match dest {
        Dest::Site(i) => SITES[i].name.to_string(),
        _ => ZONES[to].replace('_', " "),
    };
    Ok((format!("Shipment to {target} by {} ordered: {} t, {} months in flight, {} t of boost to pay", PROPS[prop].name.to_lowercase(), group(payload), months, group(due)), Some(id)))
}

fn part_index(part: &str) -> Option<Purpose> {
    if let Some(k) = CORES.iter().position(|c| c.key == part) {
        return Some(Purpose::Core(k as u8 + 1));
    }
    MODULES.iter().position(|m| m.key == part).map(|k| Purpose::Module(k as u8))
}

/// The bill of a station part of `mass` tonnes from the Earth pool (half metal,
/// three tenths components, insulation, and a lot of electronics per tonne).
fn part_bill(mass: i64) -> Vec<(Good, i64)> {
    vec![(Good::Metal, mass / 2), (Good::Components, mass * 3 / 10), (Good::Insulation, mass * 15 / 100), (Good::Electronics, mass)]
}

fn slots_used(w: &World, st: &StationSt) -> u16 {
    st.modules.iter().sum::<u16>() + w.space.transits.iter().filter(|t| t.owner == st.owner && t.orbit == Some(st.orbit) && matches!(t.purpose, Purpose::Module(_))).count() as u16
}

fn place(w: &mut World, seat: SeatId, orbit: &str, part: &str) -> Result<(String, Option<u32>), Refusal> {
    let si = seat as usize;
    let Some(o) = orbit_index(orbit) else { return refuse("unknown_orbit", "No such orbit") };
    let Some(purpose) = part_index(part) else { return refuse("unknown_part", "No such core or module") };
    let have = w.space.stations.iter().position(|s| s.owner == seat && s.orbit as usize == o);
    let pending_core = w.space.transits.iter().any(|t| t.owner == seat && t.orbit == Some(o as u8) && matches!(t.purpose, Purpose::Core(_)));
    let (mass, name) = match purpose {
        Purpose::Core(k) => {
            let def = &CORES[k as usize - 1];
            if !req_met(w, seat, def.req) {
                return refuse("locked", format!("{} cannot be built yet", def.name));
            }
            if pending_core {
                return refuse("pending", "A core for that orbit is already on order");
            }
            match have {
                Some(i) => {
                    let cur = w.space.stations[i].core;
                    if k <= cur {
                        return refuse("core", "The station already has that core or a later one");
                    }
                    (def.mass * 6 / 10, def.name)
                }
                None => (def.mass, def.name),
            }
        }
        Purpose::Module(k) => {
            let def = &MODULES[k as usize];
            if !req_met(w, seat, def.req) {
                return refuse("locked", format!("{} cannot be built yet", def.name));
            }
            let Some(i) = have else { return refuse("no_station", "Place a core in that orbit first") };
            let st = &w.space.stations[i];
            if slots_used(w, st) >= CORES[st.core as usize - 1].slots {
                return refuse("slots", "Every module slot of the core is taken");
            }
            (def.mass, def.name)
        }
        _ => unreachable!(),
    };
    let bill = part_bill(mass);
    let short: Vec<String> = bill.iter().filter(|(g, a)| w.civs[si].stock_of(*g) < *a).map(|(g, a)| format!("{} of {:?}", group(*a - w.civs[si].stock_of(*g)), g)).collect();
    if !short.is_empty() {
        return refuse("bill", format!("Short of {}", short.join(", ")));
    }
    if w.civs[si].space.made_total == 0 {
        return refuse("no_boost", "No launch stage has made boost");
    }
    // beyond low Earth orbit: a placement leg from the Earth-orbit store
    let (prop, months, needs) = if o == 0 {
        (0usize, 0u32, Vec::new())
    } else {
        let (p, _r, m, needs) = plan_leg(w, seat, EO, Dest::Orbit(o), mass, false, None)?;
        if berth_capacity(w, seat, EO, p) < mass.min(PROPS[p].payload) {
            return refuse("no_berth", "No berth in Earth orbit: place a docking module in low Earth orbit first");
        }
        (p, m, needs)
    };
    let lift = stage_goods(&mut w.civs[si], EO, &needs, true).map_err(|s| ("goods", format!("Short of {s}")))?;
    stage_goods(&mut w.civs[si], EO, &needs, false).ok();
    for (g, a) in &needs {
        w.civs[si].flows.consumed[g.index()] += a;
    }
    for (g, a) in &bill {
        w.civs[si].take(*g, *a);
    }
    let id = new_transit(w, seat, EO, ORBITS[o].zone, prop, purpose, mass + lift, months, Vec::new(), mass, Vec::new());
    if let Some(t) = w.space.transits.last_mut() {
        t.orbit = Some(o as u8);
    }
    Ok((format!("{name} ordered for {}: {} t of boost to pay", ORBITS[o].name, group(mass + lift)), Some(id)))
}

// ---------------------------------------------------------------------------
// Monthly steps
// ---------------------------------------------------------------------------

/// After the economy, before projects: stations and sites crew their posts, power
/// themselves, feed their crews and give research (from the sites' rate last month).
pub fn stations_step(w: &mut World) {
    let n = w.civs.len();
    let month = w.month;
    for s in 0..n {
        let seat = s as SeatId;
        w.civs[s].space.lab_staff = 0;
        if w.civs[s].status == SeatStatus::Eliminated {
            continue;
        }
        let mine: Vec<usize> = (0..w.space.stations.len()).filter(|i| w.space.stations[*i].owner == seat).collect();
        let mut research = 0i64;
        let mut lab_staff = 0i64;
        if !mine.is_empty() {
            let mut free = [0i64; NQ];
            for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
                for q in 0..NQ {
                    free[q] += r.quals[q].saturating_sub(r.teachers[q]) as i64;
                }
            }
            for q in 0..NQ {
                free[q] = (free[q] - w.civs[s].qual_employed.get(q).copied().unwrap_or(0) as i64).max(0);
            }
            let yard_running = w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(content().f("orbital_yard")).map(|f| f.level > 0 && f.operated).unwrap_or(false));
            let t135 = w.civs[s].knows_id("T135");
            for &i in &mine {
                let (core, modules, orbit) = {
                    let st = &w.space.stations[i];
                    (st.core as usize - 1, st.modules.clone(), st.orbit as usize)
                };
                let z = ORBITS[orbit].zone;
                // posts by qualification, filled from the free pool in station order
                let mut need = [0i64; NQ];
                for (q, k) in CORES[core].posts {
                    need[q.index()] += *k as i64;
                }
                for (m, lv) in modules.iter().enumerate() {
                    for (q, k) in MODULES[m].posts {
                        need[q.index()] += *k as i64 * *lv as i64;
                    }
                }
                let total: i64 = need.iter().sum();
                let mut filled = 0i64;
                let mut staff_bp = 10_000i64;
                for q in 0..NQ {
                    if need[q] > 0 {
                        let got = need[q].min(free[q]);
                        free[q] -= got;
                        filled += got;
                        staff_bp = staff_bp.min(ratio_bp(got, need[q]));
                    }
                }
                // power
                let mut supply = modules[M_SOLAR] as i64 * MODULES[M_SOLAR].power * ZONE_SOLAR[z] / 10_000;
                let fuel_need = modules[M_REACTOR] as i64 * 600;
                if fuel_need > 0 {
                    let got = zone_take(&mut w.civs[s], z, Good::NuclearFuel, fuel_need);
                    supply += modules[M_REACTOR] as i64 * MODULES[M_REACTOR].power * ratio_bp(got, fuel_need) / 10_000;
                }
                let demand = -CORES[core].power - modules.iter().enumerate().filter(|(m, _)| MODULES[*m].power < 0).map(|(m, lv)| MODULES[m].power * *lv as i64).sum::<i64>();
                let power_bp = ratio_bp(supply, demand);
                // a tenth of the crew is aboard, within the core's and habitats' room
                // (the rest of the rotation works the station from the ground)
                let room = CORES[core].aboard_cap as i64 + modules[M_HABITAT] as i64 * 1_000;
                let aboard = (filled / 10).min(room);
                // their food, water and air from the zone store
                let vol_per_k = if modules[M_LIFE] > 0 { if t135 { 3 } else { 13 } } else { 130 };
                let (food_need, vol_need) = (aboard, aboard * vol_per_k / 1000);
                let food = zone_take(&mut w.civs[s], z, Good::Food, food_need);
                let vol = zone_take(&mut w.civs[s], z, Good::Volatiles, vol_need);
                let supplied = ratio_bp(food, food_need).min(ratio_bp(vol, vol_need));
                let mut rate = staff_bp * power_bp / 10_000;
                if supplied < 9_000 {
                    rate /= 2;
                }
                if total == 0 && power_bp >= 10_000 && supplied >= 9_000 {
                    rate = 10_000;
                }
                // research laboratories (39 §5.3)
                if modules[M_LAB] > 0 {
                    research += modules[M_LAB] as i64 * LAB_RESEARCH * rate / 10_000;
                    lab_staff += modules[M_LAB] as i64 * 1_500 * staff_bp / 10_000;
                }
                // propellant refineries: 1.2 t of volatiles to 1 t of propellant
                if modules[M_REFINERY] > 0 {
                    let want = modules[M_REFINERY] as i64 * 1_200 * rate / 10_000;
                    let got = zone_take(&mut w.civs[s], z, Good::Volatiles, want);
                    zone_add(&mut w.civs[s], z, Good::Propellant, got * 10 / 12);
                }
                let st = &mut w.space.stations[i];
                st.staffed_bp = staff_bp as u16;
                st.power_bp = power_bp as u16;
                st.supplied_bp = supplied as u16;
                st.aboard = aboard as u32;
                st.staffed = filled as u32;
                // the shipyard runs on its ground segment, the doc-35 orbital yard
                st.rate_bp = rate as u16;
                if modules[M_SHIPYARD] > 0 && !yard_running {
                    st.rate_bp = st.rate_bp.min(4_999);
                }
            }
        }
        // research stations at sites, at last month's rate
        for (i, site) in w.space.sites.iter().enumerate() {
            let _ = i;
            if site.owner == Some(seat) && site.works[W_RESEARCH] > 0 {
                research += site.works[W_RESEARCH] as i64 * LAB_RESEARCH * site.rate_bp as i64 / 10_000;
                lab_staff += site.works[W_RESEARCH] as i64 * WORKS[W_RESEARCH].posts as i64 * site.rate_bp as i64 / 10_000;
            }
        }
        let civ = &mut w.civs[s];
        let research = research.min(lab_staff);
        if research > 0 {
            let k = ResearchClass::Frontier.index();
            if civ.research_cap.len() > k {
                civ.research_cap[k] += research;
            }
        }
        civ.space.lab_staff = lab_staff;
        let _ = month;
    }
}

/// Whether the seat's low Earth orbit station has a shipyard module operating
/// (doc 35 check 13 as revised by 39 §4.6).
pub fn shipyard_operating(w: &World, seat: SeatId) -> bool {
    w.space.stations.iter().any(|s| s.owner == seat && s.orbit == 0 && s.modules[M_SHIPYARD] > 0 && s.rate_bp >= 5_000)
}

/// After conflict: colonies follow the metropole, shipments are paid, depart and
/// arrive, sites build, produce, feed and house their people, and the month's boost
/// accounts close.
pub fn step(w: &mut World) {
    let month = w.month;
    let n = w.civs.len();
    pay_and_move(w);
    for i in 0..w.space.sites.len() {
        site_month(w, i);
    }
    for s in 0..n {
        let cs = &mut w.civs[s].space;
        cs.streak = if cs.lc_ok { cs.streak + 1 } else { 0 };
        cs.lc_ok = false;
        cs.made_last = cs.made_month;
        cs.spent_last = cs.spent_month;
        cs.made_month = 0;
        cs.spent_month = 0;
        cs.by_stage_last = std::mem::take(&mut cs.by_stage);
    }
    let _ = month;
}

/// A seat that governs no home-world region: its sites, stations, shipments and
/// zone stores pass to whoever governs its former capital (37 §6.6).
pub fn pass_colonies(w: &mut World, seat: SeatId) {
    let cap = w.civs[seat as usize].capital as usize;
    let Some(to) = w.regions.get(cap).and_then(|r| r.controller).filter(|x| *x != seat) else { return };
    for site in w.space.sites.iter_mut().filter(|x| x.owner == Some(seat)) {
        site.owner = Some(to);
    }
    for st in w.space.stations.iter_mut().filter(|x| x.owner == seat) {
        st.owner = to;
    }
    let (a, b) = (seat as usize, to as usize);
    for t in w.space.transits.iter_mut().filter(|x| x.owner == seat) {
        t.owner = to;
        for (g, amt) in &t.goods {
            w.civs[a].flows.traded_out[g.index()] += amt;
            w.civs[b].flows.traded_in[g.index()] += amt;
        }
    }
    for z in 0..NZ {
        for g in 0..NG {
            let amt = w.civs[a].space.held(z, Good::from_index(g));
            if amt > 0 {
                w.civs[a].space.store(z)[g] -= amt;
                w.civs[a].flows.traded_out[g] += amt;
                w.civs[b].space.store(z)[g] += amt;
                w.civs[b].flows.traded_in[g] += amt;
            }
        }
    }
    let boost = w.civs[a].space.surveyed;
    w.civs[b].space.surveyed |= boost;
}

fn pay_and_move(w: &mut World) {
    let month = w.month;
    // departures already booked from each zone this month, by seat
    let mut used: Vec<(SeatId, u8, u8, i64)> = w.space.transits.iter().filter(|t| t.departs == Some(month)).map(|t| (t.owner, t.from, t.prop, t.payload_t)).collect();
    let mut arrived: Vec<usize> = Vec::new();
    for k in 0..w.space.transits.len() {
        let owner = w.space.transits[k].owner as usize;
        if w.civs[owner].status == SeatStatus::Eliminated {
            continue;
        }
        if w.space.transits[k].due > 0 {
            let due = w.space.transits[k].due;
            let paid = spend(&mut w.civs[owner].space, due);
            w.space.transits[k].due -= paid;
            if w.space.transits[k].due > 0 {
                continue;
            }
        }
        let t = &w.space.transits[k];
        if t.departs.is_none() {
            let (from, to, prop) = (t.from as usize, t.to as usize, t.prop as usize);
            let open = t.months == 0 || window_open(prop, if from == EO { to } else { from }, month);
            let cap = if t.months == 0 { i64::MAX } else { berth_capacity(w, t.owner, from, prop) };
            let busy: i64 = used.iter().filter(|u| u.0 == t.owner && u.1 == t.from && u.2 == t.prop).map(|u| u.3).sum();
            if open && (busy + t.payload_t <= cap || busy == 0 && cap > 0) {
                used.push((t.owner, t.from, t.prop, t.payload_t));
                let tm = &mut w.space.transits[k];
                tm.departs = Some(month);
                tm.arrives = month + tm.months;
            }
        }
        let t = &w.space.transits[k];
        if t.departs.is_some() && t.arrives <= month {
            arrived.push(k);
        }
    }
    for k in arrived.iter().rev() {
        let t = w.space.transits.remove(*k);
        arrive(w, t);
    }
}

fn arrive(w: &mut World, t: Transit) {
    let month = w.month;
    let seat = t.owner;
    let si = seat as usize;
    let z = t.to as usize;
    w.civs[si].space.surveyed |= 1 << z;
    match t.purpose {
        Purpose::Core(k) => {
            let o = t.orbit.unwrap_or(0);
            if let Some(st) = w.space.stations.iter_mut().find(|s| s.owner == seat && s.orbit == o) {
                st.core = st.core.max(k);
            } else {
                let id = w.id();
                w.space.stations.push(StationSt { id, owner: seat, orbit: o, core: k, modules: vec![0; MODULES.len()], staffed_bp: 0, power_bp: 0, supplied_bp: 0, rate_bp: 0, aboard: 0, staffed: 0 });
                if o == 0 && !w.space.stations.iter().any(|s| s.owner == seat && s.id != id) {
                    let name = w.civs[si].name.clone();
                    let when = event_label(&w.cfg, month);
                    let capital = w.civs[si].capital;
                    crate::sim::chronicle::moment(w, seat, MomentCategory::Space, format!("First station in orbit, {when}"), format!("The first station core of {name} is in low Earth orbit."), Some(capital), "space", true, vec![]);
                }
            }
        }
        Purpose::Module(m) => {
            let o = t.orbit.unwrap_or(0);
            if let Some(st) = w.space.stations.iter_mut().find(|s| s.owner == seat && s.orbit == o) {
                st.modules[m as usize] += 1;
            }
        }
        Purpose::Lift | Purpose::Cargo => {
            for (g, a) in &t.goods {
                w.civs[si].space.store(z)[g.index()] += a;
            }
        }
        Purpose::Outpost | Purpose::Settlers => {
            for (g, a) in &t.goods {
                w.civs[si].space.store(z)[g.index()] += a;
            }
            let i = t.site.unwrap_or(0) as usize;
            let claim = t.purpose == Purpose::Outpost && w.space.sites[i].owner.is_none();
            if claim {
                // the first outpost to arrive claims the site: its bill becomes the works
                for (g, a) in WORKS[W_OUTPOST].bill {
                    zone_take(&mut w.civs[si], z, *g, *a);
                }
                let lineage = t.lineage;
                let site = &mut w.space.sites[i];
                site.owner = Some(seat);
                site.founded = month;
                site.works[W_OUTPOST] = 1;
                site.block = PopBlock::new(lineage, None);
                site.served_hist = [10_000; 12];
                let name = w.civs[si].name.clone();
                let when = event_label(&w.cfg, month);
                let capital = w.civs[si].capital;
                crate::sim::chronicle::moment(w, seat, MomentCategory::Space, format!("Outpost at {}, {when}", SITES[i].name), format!("A founding party of {name} completed a pressurized outpost at {} and claimed the site.", SITES[i].name), Some(capital), "space", true, vec![]);
            }
            if w.space.sites[i].owner == Some(seat) {
                for (a, k) in t.ages.iter().enumerate() {
                    w.space.sites[i].block.ages[a] += *k;
                }
            } else {
                // the site was claimed first by another seat: the party comes home
                return_home(w, seat, &t.ages);
                crate::sim::chronicle::brief(w, seat, "warning", format!("{} was claimed first", SITES[i].name), "The founding party found the site already held and returned; its cargo is in the zone store.".into(), None, "space");
            }
        }
    }
}

/// One site's month: construction, works, life support, births, deaths, ageing.
fn site_month(w: &mut World, i: usize) {
    let month = w.month;
    let Some(seat) = w.space.sites[i].owner else { return };
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let def = &SITES[i];
    let z = def.zone;
    w.civs[si].space.surveyed |= 1 << z;
    // works completed
    let done: Vec<u8> = w.space.sites[i].building.iter().filter(|b| b.1 <= month).map(|b| b.0).collect();
    w.space.sites[i].building.retain(|b| b.1 > month);
    for k in done {
        w.space.sites[i].works[k as usize] += 1;
    }
    let levels = w.space.sites[i].works.clone();
    let lv = |k: usize| levels[k] as i64;
    let residents = w.space.sites[i].block.total() as i64;
    let working = w.space.sites[i].block.working() as i64;
    // power
    let mut supply = lv(W_OUTPOST) * WORKS[W_OUTPOST].power + lv(W_SOLAR) * WORKS[W_SOLAR].power * def.solar_bp / 10_000;
    let fuel_need = lv(W_REACTOR) * 600;
    if fuel_need > 0 {
        let got = zone_take(&mut w.civs[si], z, Good::NuclearFuel, fuel_need);
        supply += lv(W_REACTOR) * WORKS[W_REACTOR].power * ratio_bp(got, fuel_need) / 10_000;
    }
    let works_draw: i64 = (0..WORKS.len()).filter(|k| WORKS[*k].power < 0).map(|k| -WORKS[k].power * lv(k)).sum();
    let demand = residents * ZONE_POWER[z] / 1000 + works_draw;
    let power_bp = ratio_bp(supply, demand);
    // posts
    let posts: i64 = (0..WORKS.len()).map(|k| WORKS[k].posts as i64 * lv(k)).sum();
    let staff_bp = ratio_bp(working, posts);
    let rate = staff_bp.min(power_bp);
    // production into the zone store, from the site's deposits
    let extract = |w: &mut World, d: Deposit, raise: i64| {
        let site = &mut w.space.sites[i];
        if let Some(dep) = site.deposits.iter_mut().find(|x| x.kind == d && x.remaining > 0) {
            let got = raise.min(dep.remaining);
            dep.remaining -= got;
            dep.drawn += got;
            dep.delivered += got;
            zone_add(&mut w.civs[si], z, crate::content::deposit_good(d), got);
            got
        } else {
            0
        }
    };
    if lv(W_ICE) > 0 {
        extract(w, Deposit::Volatiles, lv(W_ICE) * 2_000 * rate / 10_000);
    }
    if lv(W_HE3) > 0 {
        extract(w, Deposit::Helium3, lv(W_HE3) * 200 * rate / 10_000);
    }
    if lv(W_MINE) > 0 {
        for (d, per) in [(Deposit::IronOre, 4_000), (Deposit::CobaltNickel, 400), (Deposit::Precious, 4_000), (Deposit::RareEarths, 300)] {
            if extract(w, d, lv(W_MINE) * per * rate / 10_000) > 0 {
                break;
            }
        }
    }
    if lv(W_FARM) > 0 {
        let want = lv(W_FARM) * rate;
        let vol = zone_take(&mut w.civs[si], z, Good::Volatiles, want * 50 / 10_000);
        let chem = zone_take(&mut w.civs[si], z, Good::Chemicals, want * 10 / 10_000);
        let share = ratio_bp(vol, want * 50 / 10_000).min(ratio_bp(chem, want * 10 / 10_000));
        zone_add(&mut w.civs[si], z, Good::Food, lv(W_FARM) * 25_000 * rate / 10_000 * share / 10_000);
    }
    if lv(W_RESEARCH) > 0 {
        zone_take(&mut w.civs[si], z, Good::Instruments, lv(W_RESEARCH) * 20);
    }
    // life support: food, water and air for the residents, housing and power
    let housing = (lv(W_OUTPOST) * 2_000 + lv(W_HABITAT) * 25_000).min(def.housing_cap);
    let covered = residents.min(lv(W_OUTPOST) * 2_000 + lv(W_LIFE) * 20_000);
    let per_k = if w.civs[si].knows_id("T135") { 3 } else { 13 };
    let vol_need = covered * per_k / 1000 + (residents - covered) * 130 / 1000;
    let food = zone_take(&mut w.civs[si], z, Good::Food, residents);
    let vol = zone_take(&mut w.civs[si], z, Good::Volatiles, vol_need);
    let served = ratio_bp(food, residents).min(ratio_bp(vol, vol_need)).min(power_bp).min(ratio_bp(housing, residents));
    // births and deaths with the environment's multipliers (37 §6.4)
    let civ = &w.civs[si];
    let (child_mult, adult_mult) = crate::sim::population::mortality_tech(civ);
    let mut m_env = def.m_env;
    for t in ["T170", "T171"] {
        if civ.knows_id(t) {
            m_env -= (m_env - 10_000).max(0) / 5;
        }
    }
    let unserved_mult = 10_000 + 20_000 * (10_000 - served) / 10_000;
    let mut f_env = if def.gravity_cg < 20 { 6_000 } else if def.gravity_cg < 50 { 8_000 } else { 10_000 };
    if civ.knows_id("T171") {
        f_env = (f_env + 1_500).min(10_000);
    }
    let intensity = if civ.diag.fert_intensity_bp > 0 { civ.diag.fert_intensity_bp } else { 4_000 };
    let site = &mut w.space.sites[i];
    let b = &mut site.block;
    let mut deaths = 0u32;
    for (bi, (lo, hi, base)) in crate::sim::population::BANDS.iter().enumerate() {
        let count: u32 = b.ages[*lo..=*hi].iter().sum();
        if count == 0 {
            continue;
        }
        let mult = if *hi <= 14 { child_mult } else { adult_mult };
        let rate = base * 1000 * mult / 10_000 * m_env / 10_000 * unserved_mult / 10_000;
        let mut d = carry_round(count as i64 * rate / 100_000, &mut b.death_rem[bi]).min(count);
        deaths += d;
        for age in (*lo..=*hi).rev() {
            let take = d.min(b.ages[age]);
            b.ages[age] -= take;
            d -= take;
        }
    }
    let eq: i64 = b.ages[16..=40].iter().map(|n| *n as i64).sum::<i64>() * 500;
    let births = carry_round(eq * 30 / 1000 * intensity / 10_000 * f_env / 10_000 * served.max(5_000) / 10_000, &mut b.birth_rem);
    b.ages[0] += births;
    if month % 12 == 0 && month > 0 {
        b.ages[80] += b.ages[79];
        for age in (1..80).rev() {
            b.ages[age] = b.ages[age - 1];
        }
        b.ages[0] = 0;
    }
    let slot = (month % 12) as usize;
    site.served_hist[slot] = served as u16;
    site.served_bp = served as u16;
    site.rate_bp = rate as u16;
    site.births_last = births;
    site.deaths_last = deaths;
    let civ = &mut w.civs[si];
    civ.flows.births += births;
    civ.flows.deaths += deaths;
    civ.flows.deaths_cause[0] += deaths;
}

/// Inhabited sites, for world governance (37 §6.9): (index, owner, food-water-order ok).
pub fn inhabited_sites(w: &World) -> Vec<(usize, Option<SeatId>, bool)> {
    let slot = (w.month % 12) as usize;
    w.space
        .sites
        .iter()
        .enumerate()
        .filter(|(_, s)| s.block.total() > 0)
        .map(|(i, s)| (i, s.owner, Region::avg_bp(&s.served_hist) >= 9_500 && s.served_hist[slot] >= 8_000))
        .collect()
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

/// Keys of the parts and works the seat may place or build now.
fn available(w: &World, seat: SeatId) -> Vec<String> {
    let mut v = Vec::new();
    for c in &CORES {
        if req_met(w, seat, c.req) {
            v.push(c.key.to_string());
        }
    }
    for m in &MODULES {
        if req_met(w, seat, m.req) {
            v.push(m.key.to_string());
        }
    }
    for k in &WORKS {
        if req_met(w, seat, k.req) {
            v.push(k.key.to_string());
        }
    }
    v.sort();
    v.dedup();
    v
}

fn band(n: u64, seat: SeatId, i: usize) -> (u64, u64) {
    let _ = (seat, i);
    let lo = n * 3 / 4 / 100 * 100;
    let hi = (n * 5 / 4 + 99) / 100 * 100;
    (lo, hi)
}

pub fn view(w: &World, seat: SeatId) -> Option<SpaceView> {
    let si = seat as usize;
    let civ = &w.civs[si];
    let holds = w.space.sites.iter().any(|s| s.owner == Some(seat)) || w.space.stations.iter().any(|s| s.owner == seat) || w.space.transits.iter().any(|t| t.owner == seat);
    if !civ.knows_id("T140") && !holds {
        return None;
    }
    let cs = &civ.space;
    let surveyed = |z: usize| cs.surveyed & (1 << z) != 0;
    let boost = Some(BoostView {
        stock: cs.boost,
        cap: cs.cap,
        made_last: cs.made_last,
        spent_last: cs.spent_last,
        by_stage: cs.by_stage_last.iter().map(|(n, l, m, s)| BoostStageView { stage: n.clone(), levels: *l, made: *m, standing_down: *s }).collect(),
        streak: cs.streak,
    });
    let t141 = civ.knows_id("T141");
    let met = |o: SeatId| o == seat || civ.contacts.get(o as usize).map(|c| c.met).unwrap_or(false);
    let sites = w
        .space
        .sites
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let d = &SITES[i];
            let own = s.owner == Some(seat);
            let seen = own || surveyed(d.zone);
            let owner = if seen { s.owner } else { None };
            let pop = s.block.total() as u64;
            let (lo, hi) = band(pop, seat, i);
            SpaceSiteView {
                site: d.key.into(),
                name: d.name.into(),
                zone: ZONES[d.zone].into(),
                owner,
                controller: owner,
                surveyed: seen,
                population: if own { Some(pop) } else { None },
                population_low: if !own && seen && owner.is_some() { Some(lo) } else { None },
                population_high: if !own && seen && owner.is_some() { Some(hi) } else { None },
                housing: if own { Some((s.works[W_OUTPOST] as i64 * 2_000 + s.works[W_HABITAT] as i64 * 25_000).min(d.housing_cap)) } else { None },
                works: if own {
                    let mut v: Vec<SiteWorkView> = (0..WORKS.len()).filter(|k| s.works[*k] > 0).map(|k| SiteWorkView { kind: WORKS[k].key.into(), level: s.works[k], ready: None }).collect();
                    v.extend(s.building.iter().map(|b| SiteWorkView { kind: WORKS[b.0 as usize].key.into(), level: 0, ready: Some(b.1) }));
                    v
                } else {
                    Vec::new()
                },
                deposits: if seen { s.deposits.iter().map(|x| DepositView { kind: x.kind, remaining: x.remaining, quality_bp: x.quality_bp, epistemic: Epistemic::Verified, helium_bp: None }).collect() } else { Vec::new() },
                served_bp: own.then_some(s.served_bp),
                births_last: own.then_some(s.births_last),
                deaths_last: own.then_some(s.deaths_last),
            }
        })
        .collect();
    let my_zones: Vec<usize> = w.space.stations.iter().filter(|s| s.owner == seat).map(|s| ORBITS[s.orbit as usize].zone).collect();
    let stations = w
        .space
        .stations
        .iter()
        .filter(|s| {
            let z = ORBITS[s.orbit as usize].zone;
            s.owner == seat || (met(s.owner) && ((z == EO && t141) || surveyed(z)))
        })
        .map(|s| {
            let own = s.owner == seat;
            let z = ORBITS[s.orbit as usize].zone;
            let modules_seen = own || my_zones.contains(&z);
            StationView {
                id: s.id,
                orbit: ORBITS[s.orbit as usize].key.into(),
                owner: s.owner,
                core: Some(CORES[s.core as usize - 1].key.to_uppercase()),
                modules: if modules_seen { (0..MODULES.len()).filter(|m| s.modules[*m] > 0).map(|m| StationModuleView { kind: MODULES[m].name.into(), level: Some(s.modules[m]) }).collect() } else { Vec::new() },
                aboard: own.then_some(s.aboard),
                staffed_bp: own.then_some(s.staffed_bp),
                power_bp: own.then_some(s.power_bp),
                supplied_bp: own.then_some(s.supplied_bp),
            }
        })
        .collect();
    let transfers = w
        .space
        .transits
        .iter()
        .filter(|t| t.owner == seat)
        .map(|t| {
            let (purpose, target) = match t.purpose {
                Purpose::Lift => ("lift", None),
                Purpose::Cargo => ("cargo", t.site.map(|i| SITES[i as usize].key.to_string())),
                Purpose::Outpost => ("outpost", t.site.map(|i| SITES[i as usize].key.to_string())),
                Purpose::Settlers => ("settlers", t.site.map(|i| SITES[i as usize].key.to_string())),
                Purpose::Core(_) => ("core", t.orbit.map(|o| ORBITS[o as usize].key.to_string())),
                Purpose::Module(_) => ("module", t.orbit.map(|o| ORBITS[o as usize].key.to_string())),
            };
            let departed = t.departs.unwrap_or(w.month + 1);
            TransferView {
                id: t.id,
                owner: Some(t.owner),
                from_zone: if t.purpose == Purpose::Lift || (t.months == 0 && t.from as usize == EO) { "earth".into() } else { ZONES[t.from as usize].into() },
                to_zone: ZONES[t.to as usize].into(),
                payload_t: t.payload_t,
                people: t.people(),
                propulsion: (t.months > 0).then(|| PROPS[t.prop as usize].name.to_string()),
                departed,
                arrives: if t.departs.is_some() { t.arrives } else { departed + t.months },
                purpose: purpose.into(),
                target,
            }
        })
        .collect();
    let best_prop = props_known(w, seat).first().copied().unwrap_or(0);
    let windows = (1..NZ)
        .map(|z| {
            let k = opens_in(best_prop, z, w.month + 1);
            WindowView { zone: ZONES[z].into(), open: k == 0, opens_in: k }
        })
        .collect();
    let stores = (0..NZ)
        .filter_map(|z| {
            let goods: Vec<GoodQty> = (0..NG).filter(|g| cs.held(z, Good::from_index(*g)) > 0).map(|g| GoodQty { good: Good::from_index(g), amount: cs.held(z, Good::from_index(g)) }).collect();
            (!goods.is_empty()).then(|| ZoneStoreView { zone: ZONES[z].into(), goods })
        })
        .collect();
    Some(SpaceView {
        boost,
        sites,
        stations,
        transfers,
        windows,
        known_bodies: None,
        stores,
        available: available(w, seat),
        propulsion: props_known(w, seat).iter().map(|p| PROPS[*p].key.to_string()).collect(),
    })
}
