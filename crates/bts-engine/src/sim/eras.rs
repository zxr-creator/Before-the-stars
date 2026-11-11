//! Eras, charters, golden and dark ages, and traditions (design chapter 37,
//! sections 3 and 4; ruleset 3.0 slices 10 and 13).
//!
//! A civilization climbs a ladder of eras. It may enter the next era once it has
//! understood that era's defining knowledge and built what proves it (table
//! [`ENTRY_KNOWLEDGE`], [`proof_met`]); entering is its own decision
//! (`Action::EnterEra`). The crossing strains the old order for `T_e` months
//! ([`TRANSITION_MONTHS`]): stability falls by `2 + 6 x` the share of filled posts
//! in works two or more eras behind. At its end a score of four parts (food,
//! order, modernization, integrity) decides a golden age, a steady time or a dark
//! age. Each era offers three charters, of which one is held (two in a golden age);
//! each charter's effect and cost act through mechanisms that already exist
//! (productivity, stability, research, recruitment, construction, upkeep).
//!
//! Two tradition slots open on entering the Industrial and the Information era.
//! A held path gives the right to build its exclusive works and methods, equips
//! formations raised while it is held as its unit variant, opens the evidence of
//! its branch of the technology graph (doc 39 section 1.5), and brings its
//! drawbacks as bounded, seeded, deterministic hazards. Mastery grows 200 bp a
//! year while its signature works hold 5% of industry and power posts. Switching
//! is a reform of ten years and two million worker-months, with a 50-year cooldown.
//!
//! Seams for later slices: the works' era (`works_era`) reads the facility's
//! line stage and method, which the building lifecycle (slice 7) deepens;
//! [`expected_basket`] is the consumption hook of slice 11; space charters act on
//! the space works that exist until the Solar System (slice 15) gives them sites.

use crate::content::{content, Cap, FacDef, Req};
use crate::sim::chronicle::{brief, moment, reported};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

pub const ERA_COUNT: usize = 10;
pub const INTERSTELLAR: u8 = 9;
pub const ERA_NAMES: [&str; ERA_COUNT] = ["Ancient", "Classical", "Medieval", "Early Modern", "Industrial", "Modern", "Information", "Space", "AI", "Interstellar"];
/// Months a crossing lasts (design chapter 37, section 3.3).
pub const TRANSITION_MONTHS: [u32; ERA_COUNT] = [0, 600, 600, 360, 240, 180, 120, 120, 120, 120];
/// Knowledge (and, for the Medieval era, the established practice) of each era.
pub const ENTRY_KNOWLEDGE: [&str; ERA_COUNT] = [
    "",
    "T023 & T025 & (T024 | T027)",
    "T029 & T030 & (T034 | T031) & C013",
    "T048 & T037 & T028",
    "T060 & T061 & (T080 | T062)",
    "T100 & T102 & (T091 | T101)",
    "T106 & T111 & T112",
    "T142 & T144",
    "T117 & T122",
    "T164 | T165",
];
/// The built proof of each era, as shown to the seat.
pub const PROOF_TEXT: [&str; ERA_COUNT] = [
    "",
    "A governed region of at least 750,000 residents (a large town)",
    "An archive and house of study, or a sacred precinct, operating",
    "A harbour (or roads and waystations in three governed regions), and powder works or an arsenal operating",
    "At least 10 levels of machine shops, textile mills and steelworks operating",
    "At least 300 units (30 GWh) of electricity made last month",
    "A computing centre operating",
    "A launch complex that ran at half rate or better in each of the last 12 months, and an orbital station operating",
    "At least 1,000 units of compute made last month, and 20 levels of AI-era works (automated experiment halls, fusion plants, food synthesis, or computing centres on accelerator clusters) operating",
    "A jump testbed operating",
];

/// Residents of the large town that proves the Classical era.
pub const CLASSICAL_TOWN: u32 = 750_000;
/// The score parts' bounds (design chapter 37, section 3.3, calibrated in slice 10):
/// food access and average stability at which a part gives 25 points and 0.
/// Stability here runs higher than the design's scale assumed (established
/// practices alone add up to 24 points, and seats sit near 90), and food access
/// near 100%: with the design's bounds every crossing scored full marks on both
/// (32-seed batch, slice 10), so the parts ask for 90 and 99% and the ages for 85
/// and 50 points. Modernization stays as designed and decides most crossings.
pub const FOOD_FULL_BP: i64 = 9_900;
pub const FOOD_NONE_BP: i64 = 9_000;
pub const ORDER_FULL: i64 = 90;
pub const ORDER_NONE: i64 = 65;
pub const MODERN_FULL_BP: i64 = 6_000;
pub const MODERN_NONE_BP: i64 = 2_000;
pub const GOLDEN_SCORE: i64 = 85;
pub const DARK_SCORE: i64 = 50;
/// The strain of a crossing: stability points `STRAIN_BASE + STRAIN_PER_OBSOLETE x`
/// the obsolete share (design: 2 + 6x; 2 + 10x on this implementation's stability scale).
pub const STRAIN_BASE: i64 = 2;
pub const STRAIN_PER_OBSOLETE: i64 = 10;

/// Stability points a held charter change costs, and for how long.
pub const CHARTER_CHANGE_STABILITY: i64 = 3;
pub const CHARTER_CHANGE_MONTHS: Month = 60;
pub const CHARTER_LOCK_MONTHS: Month = 240;

// ---------------------------------------------------------------------------
// Charters
// ---------------------------------------------------------------------------

pub struct CharterDef {
    pub key: &'static str,
    pub era: u8,
    pub name: &'static str,
    pub effect: &'static str,
    pub cost: &'static str,
}

const fn ch(key: &'static str, era: u8, name: &'static str, effect: &'static str, cost: &'static str) -> CharterDef {
    CharterDef { key, era, name, effect, cost }
}

/// The 24 charters, three per era from the Classical to the AI era. Where doc 37's
/// effect needs a mechanism of a later slice, the text names the stand-in.
pub const CHARTERS: [CharterDef; 24] = [
    ch("citizen_levy", 1, "Citizen Levy", "Recruit room +25%; levies (generation 1) train a month faster.", "Stability -2 in years of peace."),
    ch("road_and_law", 1, "Road and Law", "Administrative capacity +1 region per office level; roads take 30% less work.", "Offices draw half as much media upkeep again."),
    ch("academies", 1, "Academies", "Scholarly research +15% (never above one researcher-month a post); evidence gathers 5% faster.", "500 researcher-months a month go to teaching in the academies."),
    ch("feudal_estates", 2, "Feudal Estates", "Militia x1.5; unrest -10 points in regions occupied for ten years.", "Callable labour -10%."),
    ch("guild_charters", 2, "Guild Charters", "Industry productivity +5%; artisan and smith courses take 20% more learners per place.", "Construction productivity -5% (guild rules)."),
    ch("monastic_learning", 2, "Monastic Learning", "Archives research 25% more (never above one researcher-month a post); their media upkeep -30%.", "Customary fertility -2% (celibate orders)."),
    ch("chartered_companies", 3, "Chartered Companies", "Harbour regions lose 20% less in carriage; contact evidence +10%.", "Stability -2 (company abuses)."),
    ch("standing_army", 3, "Standing Army", "Powder and rifle formations (generations 2-3) reach 10 points more proficiency.", "Army upkeep +10%."),
    ch("republic_of_letters", 3, "Republic of Letters", "Evidence gathers 10% faster; contact evidence +25%.", "Seats in contact gather 25% more contact evidence from you too."),
    ch("laissez_faire", 4, "Laissez-faire Works", "Industry productivity +5%.", "Stability -2; town mortality +5%."),
    ch("factory_acts", 4, "Factory Acts", "Stability +3; health factor +3%; ends coal-smoke mortality.", "Industry productivity -3%."),
    ch("national_railways", 4, "National Railways", "Railways take 30% less work and goods to build; railway regions carry 25% more freight.", "Railways burn a quarter more coal."),
    ch("mass_mobilization", 5, "Mass Mobilization", "Recruit room +50%; mustering takes 20% less work.", "Stability -2 (households held to rations; slice 11 caps consumption at 90%)."),
    ch("welfare_state", 5, "Welfare State", "Stability +4; smaller families slow growth less (development factor +3%).", "Public services draw medicine and media for every resident (slice 11: basket expected +15%)."),
    ch("planned_electrification", 5, "Planned Electrification", "Generator halls, grids and hydroelectric works take 30% less work.", "Services productivity -3%."),
    ch("open_networks", 6, "Open Networks", "Evidence gathers 10% faster; contact evidence +25%.", "Network incidents twice as likely (and possible without the Network tradition)."),
    ch("surveillance_state", 6, "Surveillance State", "Stability +5; unrest -15 points in occupied regions.", "Evidence gathers 5% slower; openness drifts down."),
    ch("automation_drive", 6, "Automation Drive", "Automation of qualified posts may reach 10% further.", "Stability -1 for every tenth of general posts automated away."),
    ch("frontier_charter", 7, "Frontier Charter", "Space works take 20% less work and goods to build; orbital crew courses take 50% more learners per place.", "Space works draw a quarter more upkeep (slice 15: site exports capped at 75%)."),
    ch("lunar_industry", 7, "Lunar Industry", "Space works take 25% less work to build; orbital operations draw 15% less fuel.", "Space-domain evidence -25% (slice 15: no life search)."),
    ch("planetary_protection", 7, "Planetary Protection", "Frontier research +25% at orbital stations and interferometers (never above one researcher-month a post).", "Space works take 15% more work to build (slice 15: off-world mining -25%)."),
    ch("machine_stewardship", 8, "Machine Stewardship", "Administrative capacity +50%.", "Stability -3 where Sanctified Labour or Day of Rest is the faith."),
    ch("human_primacy", 8, "Human Primacy", "Stability +5.", "Automation of qualified posts capped at 25%; no autonomous swarms."),
    ch("compute_commons", 8, "Compute Commons", "Advanced and frontier research +10% (never above one researcher-month a post).", "A tenth of the compute made is withheld for the commons."),
];

pub fn charter_index(key: &str) -> Option<usize> {
    CHARTERS.iter().position(|c| c.key == key)
}

// ---------------------------------------------------------------------------
// Traditions
// ---------------------------------------------------------------------------

pub const SLOT_NAMES: [&str; 2] = ["machine", "frontier"];
/// The era that offers each slot.
pub const SLOT_ERA: [u8; 2] = [4, 6];
/// Mastery gained a year while the signature works hold their share, and lost otherwise.
pub const MASTERY_GAIN: i64 = 200;
pub const MASTERY_LOSS: i64 = 100;
pub const SIGNATURE_SHARE_BP: i64 = 500;
/// A tradition reform: worker-months, media lots (base units), minimum months.
pub const REFORM_WORK: i64 = 2_000_000;
pub const REFORM_MEDIA: i64 = 500_000;
pub const REFORM_MONTHS: i64 = 120;
pub const SWITCH_COOLDOWN: Month = 600;
/// A tradition switched away from still counts as held for its institutions for a century.
pub const FORMER_MONTHS: Month = 1_200;

pub struct TraditionDef {
    pub key: &'static str,
    pub slot: u8,
    pub name: &'static str,
    pub sober: &'static str,
    pub desc: &'static str,
    pub favoured: &'static str,
    /// Facility keys whose posts grow mastery and feed the branch's evidence.
    pub signature: &'static [&'static str],
    /// Exclusive facilities (keys) and methods ("facility:method").
    pub exclusive: &'static [&'static str],
    pub variant: &'static str,
    /// Unit tiers (indices of `content::unit_tiers`) the variant applies to.
    pub variant_tiers: &'static [u8],
    pub drawbacks: &'static [&'static str],
    /// Cultural tendencies the tradition pulls while held.
    pub pulls: &'static [usize],
}

pub const TRADITIONS: [TraditionDef; 7] = [
    TraditionDef {
        key: "steam",
        slot: 0,
        name: "Steampunk",
        sober: "Coal and Steam",
        desc: "Coal, iron and pressure: steam hammers, coke works that recover tar, ironclads and armoured trains.",
        favoured: "coal and iron",
        signature: &["steam", "steelworks", "rail", "steam_hammer"],
        exclusive: &["steam_hammer", "steelworks:tar_recovery"],
        variant: "Ironclad and rail: coal instead of fuel (twice the tonnage); line formations +10% by mastery, maneuver -10%",
        variant_tiers: &[3],
        drawbacks: &["Coal smoke: town mortality +10% in regions with 10 or more steam station levels, until smoke abatement is understood or the Factory Acts are granted", "Coal hunger: the works and the variant burn coal"],
        pulls: &[4],
    },
    TraditionDef {
        key: "engine",
        slot: 0,
        name: "Dieselpunk",
        sober: "Oil and Engine",
        desc: "Crude, cracking and the motor: refineries that make more fuel, motor works, heavy armour.",
        favoured: "crude oil and gas",
        signature: &["refinery", "diesel", "highways", "motor_works"],
        exclusive: &["refinery:cracking", "motor_works"],
        variant: "Heavy armour: fuel x1.3; shock formations +10% by mastery",
        variant_tiers: &[3, 4],
        drawbacks: &["Oil dependence: stability -3 while fuel in store covers less than two months of use", "Blockade exposure: at war, the shortfall bites twice as hard"],
        pulls: &[6],
    },
    TraditionDef {
        key: "wire",
        slot: 0,
        name: "Electropunk",
        sober: "Current and Wire",
        desc: "Falling water, copper and current: trams and metros, electric-arc steel one technology early, electric drive.",
        favoured: "rivers with hydro sites, and copper",
        signature: &["generator", "hydro", "grid", "tramways"],
        exclusive: &["tramways", "steelworks:arc_early"],
        variant: "Electric drive: batteries instead of fuel; maneuver formations +5% by mastery",
        variant_tiers: &[3, 4, 5],
        drawbacks: &["Conductor hunger: generator halls, grids, hydroelectric works and tramways need 10% more conductors to build", "Grid faults: a region that draws more than 95% of its electricity for three months loses a tenth of its electric works' rate the next month"],
        pulls: &[5, 1],
    },
    TraditionDef {
        key: "atom",
        slot: 1,
        name: "Atompunk",
        sober: "Atom",
        desc: "Uranium and the reactor: compact reactors, isotope works, atomic-powered formations.",
        favoured: "uranium",
        signature: &["fission", "compact_reactor", "isotope_works"],
        exclusive: &["compact_reactor", "isotope_works"],
        variant: "Atomic-powered: nuclear fuel (2 lots per thousand soldiers) instead of fuel",
        variant_tiers: &[4, 5],
        drawbacks: &["Reactor incidents: 1 in 2,000 a year for each reactor level; 2% of the region resettled, stability -10 there for five years", "Stewardship of the Land: stability -3 where it is the faith"],
        pulls: &[1],
    },
    TraditionDef {
        key: "network",
        slot: 1,
        name: "Cyberpunk",
        sober: "Network",
        desc: "Quartz, rare earths and the net: network operations centres, implant clinics, cyber-augmented soldiers.",
        favoured: "quartz and rare earths",
        signature: &["datacenter", "fab", "noc", "implant_clinic"],
        exclusive: &["noc", "implant_clinic"],
        variant: "Cyber-augmented: electronics upkeep x1.5; 10 points more proficiency",
        variant_tiers: &[4, 5],
        drawbacks: &["Network incidents: 1 in 40 a year while compute exceeds 500 units; compute and electronics output -30% for six months (operations centres halve the hazard)", "Electronics and compute upkeep of its works"],
        pulls: &[0],
    },
    TraditionDef {
        key: "living",
        slot: 1,
        name: "Biopunk",
        sober: "Living Systems",
        desc: "Fertile land and engineered life: biofoundries that turn food and fibre into chemicals and fuel, augmented soldiers.",
        favoured: "arable land and fibres",
        signature: &["pharma", "biofoundry"],
        exclusive: &["biofoundry"],
        variant: "Augmented soldiers: medicine upkeep (20 lots per thousand); losses -20% by mastery",
        variant_tiers: &[4, 5],
        drawbacks: &["Long validation: biological works take half as many months again to build", "Contamination: epidemic hazard +20% in regions with biofoundries"],
        pulls: &[3],
    },
    TraditionDef {
        key: "synthetic",
        slot: 1,
        name: "AI-punk",
        sober: "Synthetic Minds",
        desc: "Compute and cheap power: lights-out factories, machine governance, autonomous swarms.",
        favoured: "compute and cheap power",
        signature: &["datacenter", "auto_lab", "food_synthesis", "fusion", "machine_governance"],
        exclusive: &["machine_shop:lights_out", "consumer_works:lights_out", "machine_governance"],
        variant: "Autonomous swarms: equipment x1.6 and compute upkeep; power per soldier x2",
        variant_tiers: &[5],
        drawbacks: &["Compute and power hunger of the lights-out works", "Labour displacement: stability -2 for every tenth of general posts automated away"],
        pulls: &[1],
    },
];

pub fn tradition_index(key: &str) -> Option<usize> {
    TRADITIONS.iter().position(|t| t.key == key)
}

/// The expected household basket of an era, per thousand residents per month,
/// base units (design chapter 37, section 3.5): textiles and consumer goods. The
/// consumption rules of ruleset 3.0 slice 11 read it; nothing consumes it yet.
pub fn expected_basket(era: u8) -> [(Good, i64); 2] {
    let (t, c) = match era {
        0..=2 => (150, 0),
        3 => (250, 0),
        4 => (400, 200),
        5 => (1_000, 1_000),
        6 => (1_000, 2_500),
        _ => (1_000, 3_000),
    };
    [(Good::Textiles, t), (Good::ConsumerGoods, c)]
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// A crossing into an era.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TransitionSt {
    pub era: u8,
    pub start: Month,
    pub end: Month,
    /// Sums over the months of the crossing of food access and stability.
    pub food_sum: i64,
    pub order_sum: i64,
    pub months: i64,
    /// Integrity events so far, as text.
    pub events: Vec<String>,
    /// Regions governed last month (to notice one lost to another seat).
    pub governed: Vec<RegionId>,
    /// Treaties this seat had repudiated when the crossing began.
    pub broken_start: u32,
    /// Deaths from epidemics and famine in the current twelve-month window.
    pub crisis_deaths: u64,
    pub crisis_window_start: Month,
    /// Last month's cumulative epidemic and famine deaths of the round.
    pub last_crisis: u64,
}

/// A golden or dark age.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AgeSt {
    pub golden: bool,
    pub era: u8,
    pub until: Month,
    pub score: u8,
}

/// A reactor incident: the region and the month its stability cost ends.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Incident {
    pub region: RegionId,
    pub until: Month,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EraState {
    pub era: u8,
    pub since: Month,
    pub transition: Option<TransitionSt>,
    pub age: Option<AgeSt>,
    /// Indices into [`CHARTERS`].
    pub charters: Vec<u8>,
    /// Last month a held charter was replaced.
    pub charter_changed: Option<Month>,
    /// Eras entered: (era, month, outcome 0 pending / 1 golden / 2 steady / 3 dark, score).
    pub history: Vec<(u8, Month, u8, u8)>,
    /// Consecutive months the launch complex ran at half rate or better.
    pub launch_months: u16,
    /// Whether the seat was told it may enter the next era.
    pub told_eligible: u8,
    /// Held path per slot (indices into [`TRADITIONS`]).
    pub traditions: [Option<u8>; 2],
    pub mastery: [u16; 2],
    /// Month the last switch in each slot completed.
    pub switched: [Option<Month>; 2],
    /// Paths switched away from, and the month they stopped being held.
    pub former: Vec<(u8, Month)>,
    /// A network incident lasts until this month.
    pub network_until: Month,
    pub reactor: Vec<Incident>,
    /// Months each governed region has drawn more than 95% of its electricity,
    /// and the month its grid fault ends: (region, months, fault_until).
    pub grid: Vec<(RegionId, u8, Month)>,
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

pub fn charter_held(civ: &Civ, key: &str) -> bool {
    charter_index(key).map(|i| civ.era.charters.contains(&(i as u8))).unwrap_or(false)
}

pub fn golden(civ: &Civ, month: Month) -> bool {
    civ.era.age.as_ref().map(|a| a.golden && month < a.until).unwrap_or(false)
}

pub fn dark(civ: &Civ, month: Month) -> bool {
    civ.era.age.as_ref().map(|a| !a.golden && month < a.until).unwrap_or(false)
}

pub fn held(civ: &Civ, key: &str) -> bool {
    tradition_index(key).map(|i| civ.era.traditions.iter().any(|t| *t == Some(i as u8))).unwrap_or(false)
}

/// Mastery of a held path, basis points (0 when not held).
pub fn mastery(civ: &Civ, key: &str) -> i64 {
    let Some(i) = tradition_index(key) else { return 0 };
    for s in 0..2 {
        if civ.era.traditions[s] == Some(i as u8) {
            return civ.era.mastery[s] as i64;
        }
    }
    0
}

/// Held now, or switched away from within a century.
pub fn held_recently(civ: &Civ, key: &str, month: Month) -> bool {
    held(civ, key) || tradition_index(key).map(|i| civ.era.former.iter().any(|(p, until)| *p == i as u8 && month < until + FORMER_MONTHS)).unwrap_or(false)
}

/// The tradition a facility or method is exclusive to, if any.
pub fn exclusive_of(facility: &str, method: Option<&str>) -> Option<usize> {
    TRADITIONS.iter().position(|t| {
        t.exclusive.iter().any(|x| match x.split_once(':') {
            Some((f, m)) => f == facility && method == Some(m),
            None => *x == facility,
        })
    })
}

/// Whether a facility is one of the signature or exclusive works of a tradition.
pub fn signature_of(t: &TraditionDef, def: &FacDef, f: &Facility) -> bool {
    if t.signature.contains(&def.key) {
        return true;
    }
    let method = f.run.as_ref().and_then(|r| def.recipes.get(r.recipe)).map(|r| r.key);
    t.exclusive.iter().any(|x| match x.split_once(':') {
        Some((fk, m)) => fk == def.key && method == Some(m),
        None => *x == def.key,
    })
}

/// Whether a works is operating: enabled, and it ran at half rate or better last
/// month or was staffed to half or better (a works that stands idle only for want
/// of inputs still shows the knowledge applied; the era proofs read this).
pub fn running(def: &FacDef, f: &Facility) -> bool {
    if !f.enabled || f.level == 0 {
        return false;
    }
    let _ = def;
    f.run.as_ref().map(|r| r.rate_bp >= 5_000).unwrap_or(false) || (f.staff_needed > 0 && f.staffed * 2 >= f.staff_needed) || f.staff_needed == 0 && f.run.is_none() && def.recipes.is_empty()
}

/// The era of a works: its line stage's era, or its method's if later. Fields take
/// the era of the method they were worked by.
pub fn works_era(def: &FacDef, f: &Facility) -> u8 {
    if def.key == "fields" {
        return f.field_run.as_ref().map(|r| crate::sim::productivity::field_method_era(r.recipe)).unwrap_or(0);
    }
    let m = f.run.as_ref().and_then(|r| def.recipes.get(r.recipe)).map(|r| r.era).unwrap_or(0);
    def.era.max(m)
}

/// Shares of filled posts, for an era `e`: in works two or more eras behind it
/// (obsolete) and in works of era `e - 1` or later (modern; for the Classical era,
/// works of the Classical era, since every works is of era 0 or later), basis
/// points. Farm posts count from the Modern era on, when the first field methods
/// newer than the Classical era exist; before then every farm would be obsolete by
/// construction.
pub fn post_shares(w: &World, seat: SeatId, e: u8) -> (i64, i64) {
    let c = content();
    let (mut total, mut old, mut modern) = (0i64, 0i64, 0i64);
    let fields = c.f("fields");
    let succ = if w.civs[seat as usize].successors.is_empty() { crate::sim::projects::successor_table(w, seat) } else { w.civs[seat as usize].successors.clone() };
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        for f in &r.facilities {
            let def = &c.facilities[f.kind];
            if def.food {
                continue;
            }
            let posts = f.staffed as i64;
            if posts == 0 {
                continue;
            }
            let era = works_era(def, f);
            total += posts;
            // obsolete: two or more eras behind, with a successor the seat can build
            if era as i64 + 2 <= e as i64 && succ.get(f.kind).copied().unwrap_or(false) {
                old += posts;
            }
            if era as i64 + 1 >= e as i64 && era >= 1 {
                modern += posts;
            }
        }
        if e >= 5 {
            let farm = r.last.labor.food as i64;
            if farm > 0 {
                let era = r.fac(fields).map(|f| works_era(&c.facilities[fields], f)).unwrap_or(0);
                total += farm;
                if era as i64 + 2 <= e as i64 {
                    old += farm;
                }
                if era as i64 + 1 >= e as i64 && era >= 1 {
                    modern += farm;
                }
            }
        }
    }
    if total == 0 {
        return (0, 0);
    }
    (old * 10_000 / total, modern * 10_000 / total)
}

/// Stability points the old order takes off each month of a crossing into `e`.
pub fn strain(obsolete_bp: i64) -> i64 {
    STRAIN_BASE + STRAIN_PER_OBSOLETE * obsolete_bp / 10_000
}

fn knowledge_reqs() -> &'static Vec<Req> {
    static R: OnceLock<Vec<Req>> = OnceLock::new();
    R.get_or_init(|| ENTRY_KNOWLEDGE.iter().map(|s| content().parse(s)).collect())
}

/// The highest era a seat may ever enter: the AI era, or Interstellar once its
/// objective is revealed.
pub fn top_era(civ: &Civ) -> u8 {
    if civ.milestones.interstellar.is_some() { INTERSTELLAR } else { INTERSTELLAR - 1 }
}

/// Levels of AI-era works running (the AI era's proof): works whose line stage or
/// method belongs to the AI era, and computing centres running accelerator
/// clusters (the stand-in for the automated stages of the building lifecycle).
pub fn ai_era_levels(w: &World, seat: SeatId) -> i64 {
    let c = content();
    let mut n = 0i64;
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        for f in &r.facilities {
            let def = &c.facilities[f.kind];
            if def.food || !running(def, f) {
                continue;
            }
            let cluster = def.key == "datacenter" && f.run.as_ref().map(|x| def.recipes[x.recipe].key == "cluster").unwrap_or(false);
            if works_era(def, f) >= 8 || cluster {
                n += f.level as i64;
            }
        }
    }
    n
}

/// Whether the seat's built proof for era `e` stands.
pub fn proof_met(w: &World, seat: SeatId, e: u8) -> bool {
    let c = content();
    let governed = || w.regions.iter().filter(move |r| r.controller == Some(seat));
    let runs = |key: &str| {
        let k = c.f(key);
        governed().any(|r| r.fac(k).map(|f| running(&c.facilities[k], f)).unwrap_or(false))
    };
    match e {
        0 => true,
        // doc 37 asks a town of 1,000,000; the 60-region map spreads a people over
        // more regions than its table assumed, so a large town of 750,000 stands in
        1 => governed().any(|r| r.population() >= CLASSICAL_TOWN),
        2 => runs("archive") || runs("holy_site"),
        // a seat without a coast proves its reach by road (adapted from doc 37's harbour)
        3 => {
            let port = governed().any(|r| r.fac(c.f("port")).map(|f| f.enabled && f.level > 0).unwrap_or(false));
            let roads = governed().filter(|r| r.fac(c.f("roads")).map(|f| f.enabled && f.level > 0).unwrap_or(false)).count() >= 3;
            (port || roads) && (runs("powder_mill") || runs("arsenal"))
        }
        4 => {
            let keys = [c.f("machine_shop"), c.f("textile_mill"), c.f("steelworks")];
            let levels: i64 = governed().flat_map(|r| r.facilities.iter()).filter(|f| keys.contains(&f.kind) && running(&c.facilities[f.kind], f)).map(|f| f.level as i64).sum();
            levels >= 10
        }
        5 => governed().map(|r| r.last.power.elec_made + r.last.power.elec_from_generators).sum::<i64>() >= 300_000,
        6 => runs("datacenter"),
        7 => w.civs[seat as usize].era.launch_months >= 12 && runs("orbital_station"),
        8 => w.civs[seat as usize].compute_supply >= 1_000_000 && ai_era_levels(w, seat) >= 20,
        9 => runs("jump_testbed"),
        _ => false,
    }
}

/// Whether the seat may enter its next era now (and why not).
pub fn eligibility(w: &World, seat: SeatId) -> Result<u8, String> {
    let civ = &w.civs[seat as usize];
    let next = civ.era.era + 1;
    if next > top_era(civ) {
        return Err("there is no further era to enter".into());
    }
    if let Some(t) = &civ.era.transition {
        return Err(format!("the crossing into the {} era must end first ({})", ERA_NAMES[t.era as usize], event_label(&w.cfg, t.end)));
    }
    if !knowledge_reqs()[next as usize].eval(&CivCtx { world: w, seat }) {
        return Err(format!("the knowledge of the {} era is not yet understood", ERA_NAMES[next as usize]));
    }
    if !proof_met(w, seat, next) {
        return Err(format!("the built proof of the {} era is missing: {}", ERA_NAMES[next as usize], PROOF_TEXT[next as usize].to_lowercase()));
    }
    Ok(next)
}

/// The conditions of era `e` as the seat may see them: technologies it has not
/// discovered are named only by era and domain.
pub fn conditions_view(w: &World, seat: SeatId, e: u8) -> Vec<KnownRequirement> {
    let c = content();
    let civ = &w.civs[seat as usize];
    let ctx = CivCtx { world: w, seat };
    fn atom(w: &World, seat: SeatId, r: &Req) -> Option<(String, bool, Option<String>)> {
        let c = content();
        let civ = &w.civs[seat as usize];
        match r {
            Req::Tech(i) => {
                let t = &c.techs[*i];
                if civ.tech[*i].state >= ST_DISCOVERED {
                    Some((format!("Understand: {}", t.name), civ.knows(*i), Some(crate::actions::tech_handle(w, seat, *i))))
                } else {
                    Some((format!("An undiscovered technology of the {} era ({})", ERA_NAMES[(t.era as usize).min(ERA_COUNT - 1)], t.tags.first().map(|g| g.name().to_lowercase()).unwrap_or_default()), false, None))
                }
            }
            Req::Prac(i) => {
                let p = &c.practices[*i];
                if civ.practice[*i].state >= 1 {
                    Some((format!("Established: {}", p.name), civ.established(*i), Some(crate::actions::prac_handle(w, seat, *i))))
                } else {
                    Some(("An unrecognized practice of record-keeping".into(), false, None))
                }
            }
            _ => None,
        }
    }
    let mut out = Vec::new();
    let req = &knowledge_reqs()[e as usize];
    for r in req.conjuncts() {
        match r {
            Req::Any(alts) => {
                let parts: Vec<_> = alts.iter().filter_map(|a| atom(w, seat, a)).collect();
                let ok = r.eval(&ctx);
                out.push(KnownRequirement { text: parts.iter().map(|p| p.0.clone()).collect::<Vec<_>>().join(" — or — "), satisfied: ok, handle: None });
            }
            other => {
                if let Some((text, satisfied, handle)) = atom(w, seat, other) {
                    out.push(KnownRequirement { text, satisfied, handle });
                }
            }
        }
    }
    let _ = (c, civ);
    out.push(KnownRequirement { text: PROOF_TEXT[e as usize].to_string(), satisfied: proof_met(w, seat, e), handle: None });
    if let Some(t) = &w.civs[seat as usize].era.transition {
        out.push(KnownRequirement { text: format!("The crossing into the {} era has ended", ERA_NAMES[t.era as usize]), satisfied: false, handle: None });
    }
    out
}

/// Charters a seat may hold at once now.
pub fn charter_slots(civ: &Civ, month: Month) -> usize {
    if civ.era.era == 0 {
        0
    } else if golden(civ, month) {
        2
    } else {
        1
    }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/// `Action::EnterEra`.
pub fn enter(w: &mut World, seat: SeatId) -> Result<String, String> {
    let next = eligibility(w, seat)?;
    let si = seat as usize;
    let month = w.month;
    let when = event_label(&w.cfg, month + 1);
    let (obsolete, _) = post_shares(w, seat, next);
    let governed: Vec<RegionId> = w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.id).collect();
    let broken = w.treaties.iter().filter(|t| t.broken_by == Some(seat)).count() as u32;
    let months = TRANSITION_MONTHS[next as usize];
    {
        let e = &mut w.civs[si].era;
        e.era = next;
        e.since = month;
        // the previous era's charters lapse
        e.charters.clear();
        e.charter_changed = None;
        e.told_eligible = 0;
        e.history.push((next, month, 0, 0));
        e.transition = Some(TransitionSt { era: next, start: month, end: month + months, governed, broken_start: broken, crisis_window_start: month, ..Default::default() });
    }
    let name = ERA_NAMES[next as usize];
    let capital = w.civs[si].capital;
    let strain_pts = strain(obsolete);
    moment(w, seat, MomentCategory::Governance, format!("The {name} era begins"), format!("The government declared the {name} era. For {} years the old order will resist: stability -{strain_pts} a month while {}% of posts are in works two or more eras behind. How the crossing is managed decides whether a golden or a dark age follows.", months / 12, obsolete / 100), Some(capital), "assembly_hall", true, vec![format!("Declared in {when}")]);
    let civ_name = w.civs[si].name.clone();
    for o in 0..w.civs.len() {
        if o != si && w.civs[o].contacts[si].met && w.civs[o].status != SeatStatus::Eliminated {
            reported(w, o as SeatId, MomentCategory::Governance, format!("The {civ_name} enter the {name} era"), format!("Travellers report that the {civ_name} now build and govern as a people of the {name} era."), None, "assembly_hall", vec![format!("Reported in {when}")]);
        }
    }
    let offer = SLOT_ERA.iter().position(|e| *e == next);
    let mut text = format!("The {name} era begins. Choose one of its three charters.");
    if let Some(s) = offer {
        text.push_str(&format!(" The {} tradition slot is open.", SLOT_NAMES[s]));
        brief(w, seat, "info", format!("A {} tradition may be chosen", SLOT_NAMES[s]), "Commit the slot to one path, or leave it unaligned. Only the held path's exclusive works can be built; knowledge is never locked.".into(), None, "culture");
    }
    brief(w, seat, "good", format!("The {name} era begins"), "Choose a charter. The crossing strains stability; food, order, modern works and integrity decide the age that follows.".into(), None, "culture");
    Ok(text)
}

/// `Action::ChooseCharter`.
pub fn choose_charter(w: &mut World, seat: SeatId, key: &str) -> Result<String, (&'static str, String)> {
    let si = seat as usize;
    let month = w.month;
    let Some(ci) = charter_index(key) else { return Err(("NOT_VISIBLE_OR_UNKNOWN", "unknown charter".into())) };
    let def = &CHARTERS[ci];
    let civ = &w.civs[si];
    if def.era != civ.era.era {
        return Err(("CONFLICTING_ACTIONS", format!("{} is a charter of the {} era; this civilization is in the {} era", def.name, ERA_NAMES[def.era as usize], ERA_NAMES[civ.era.era as usize])));
    }
    if civ.era.charters.contains(&(ci as u8)) {
        return Err(("CONFLICTING_ACTIONS", format!("{} is already held", def.name)));
    }
    let slots = charter_slots(civ, month);
    if civ.era.charters.len() < slots {
        w.civs[si].era.charters.push(ci as u8);
        brief(w, seat, "good", format!("Charter granted: {}", def.name), format!("{} Cost: {}", def.effect, def.cost), None, "culture");
        return Ok(format!("{} granted. {} Cost: {}", def.name, def.effect, def.cost));
    }
    // a change of charter within the era
    let free = dark(civ, month);
    if let Some(changed) = civ.era.charter_changed.filter(|c| !free && month < c + CHARTER_LOCK_MONTHS) {
        return Err(("CONFLICTING_ACTIONS", format!("the charter was changed recently; another change is allowed from {}", event_label(&w.cfg, changed + CHARTER_LOCK_MONTHS))));
    }
    let e = &mut w.civs[si].era;
    let old = e.charters.pop().map(|i| CHARTERS[i as usize].name).unwrap_or("");
    e.charters.push(ci as u8);
    if !free {
        e.charter_changed = Some(month);
    }
    brief(w, seat, "info", format!("Charter changed: {} replaces {old}", def.name), if free { "In a dark age the change costs nothing.".into() } else { "Stability -3 for five years; no further change for twenty years.".to_string() }, None, "culture");
    Ok(format!("{} replaces {old}.{}", def.name, if free { " In a dark age the change costs nothing." } else { " Stability -3 for five years; no further change for twenty years." }))
}

/// `Action::ChooseTradition`. Returns the text and, for a reform, the project.
pub fn choose_tradition(w: &mut World, seat: SeatId, slot: &str, path: &str) -> Result<(String, Option<u32>), (&'static str, String)> {
    let si = seat as usize;
    let month = w.month;
    let Some(s) = SLOT_NAMES.iter().position(|x| *x == slot) else { return Err(("INVALID_SCHEMA", "the slot is \"machine\" or \"frontier\"".into())) };
    let Some(p) = tradition_index(path) else { return Err(("NOT_VISIBLE_OR_UNKNOWN", "unknown tradition".into())) };
    let t = &TRADITIONS[p];
    if t.slot as usize != s {
        return Err(("INVALID_SCHEMA", format!("{} ({}) belongs to the {} slot", t.name, t.sober, SLOT_NAMES[t.slot as usize])));
    }
    let civ = &w.civs[si];
    if civ.era.era < SLOT_ERA[s] {
        return Err(("INSUFFICIENT_VISIBLE_BUDGET", format!("the {} slot opens with the {} era", SLOT_NAMES[s], ERA_NAMES[SLOT_ERA[s] as usize])));
    }
    if civ.projects.iter().any(|x| matches!(x.kind, ProjKind::TraditionReform { slot: rs, .. } if rs as usize == s)) {
        return Err(("CONFLICTING_ACTIONS", "a tradition reform is already under way in this slot".into()));
    }
    match civ.era.traditions[s] {
        None => {
            w.civs[si].era.traditions[s] = Some(p as u8);
            w.civs[si].era.mastery[s] = 0;
            let when = event_label(&w.cfg, month + 1);
            let capital = w.civs[si].capital;
            moment(w, seat, MomentCategory::Industry, format!("{} — {}", t.name, t.sober), format!("The government committed the {} slot to {} ({}). {}", SLOT_NAMES[s], t.name, t.sober, t.desc), Some(capital), "workshop", true, vec![format!("Committed in {when}")]);
            Ok((format!("{} ({}) held. Its exclusive works can now be built; mastery grows while its signature works run.", t.name, t.sober), None))
        }
        Some(cur) if cur as usize == p => Err(("CONFLICTING_ACTIONS", format!("{} is already held", t.name))),
        Some(_) => {
            if let Some(last) = civ.era.switched[s].filter(|l| month < l + SWITCH_COOLDOWN) {
                return Err(("CONFLICTING_ACTIONS", format!("this slot was switched recently; another switch is allowed from {}", event_label(&w.cfg, last + SWITCH_COOLDOWN))));
            }
            let half = dark(civ, month);
            let (work, months) = if half { (REFORM_WORK / 2, REFORM_MONTHS / 2) } else { (REFORM_WORK, REFORM_MONTHS) };
            let work = crate::sim::projects::scaled(work, w.cfg.pace_bp);
            let capital = civ.capital;
            let id = w.id();
            let max = crate::sim::projects::monthly_share(work, months);
            w.civs[si].projects.push(Project {
                id,
                kind: ProjKind::TraditionReform { slot: s as u8, path: p as u8 },
                region: Some(capital),
                work_needed: work,
                work_done: 0,
                inputs: vec![(Good::Media, REFORM_MEDIA, 0)],
                priority: 3,
                paused: false,
                started: month,
                last_progress: 0,
                blockers: vec![],
                max_per_month: max,
                crew: vec![],
                crew_on_site: vec![],
                crew_capped: false,
                power_need: 0,
                power_bp: 0,
                min_months: months as u16,
                order_key: 0,
            });
            Ok((format!("Tradition reform begun: at least {} years, {} worker-months and 500 lots of media; stability -5 while it runs. On completion {} is held with a quarter of the present mastery.", months / 12, group(work), t.name), Some(id)))
        }
    }
}

/// Completion of a tradition reform.
pub fn complete_reform(w: &mut World, seat: SeatId, slot: u8, path: u8) {
    let si = seat as usize;
    let month = w.month;
    let s = slot as usize;
    let old = w.civs[si].era.traditions[s];
    {
        let e = &mut w.civs[si].era;
        if let Some(o) = old {
            e.former.retain(|(p, _)| *p != o);
            e.former.push((o, month));
        }
        e.traditions[s] = Some(path);
        e.mastery[s] /= 4;
        e.switched[s] = Some(month);
    }
    let t = &TRADITIONS[path as usize];
    let when = event_label(&w.cfg, month);
    let capital = w.civs[si].capital;
    let from = old.map(|o| TRADITIONS[o as usize].name).unwrap_or("unaligned");
    moment(w, seat, MomentCategory::Industry, format!("From {from} to {}", t.name), format!("The tradition reform is complete: the {} slot now holds {} ({}). The works of the old path keep running without their bonuses and cannot be extended.", SLOT_NAMES[s], t.name, t.sober), Some(capital), "workshop", true, vec![format!("Completed in {when}")]);
}

// ---------------------------------------------------------------------------
// Monthly step
// ---------------------------------------------------------------------------

/// Score parts of a crossing: food, order, modernization, integrity (25 each).
pub fn score_parts(w: &World, seat: SeatId, t: &TransitionSt) -> [i64; 4] {
    let civ = &w.civs[seat as usize];
    let months = t.months.max(1);
    let food = if t.months == 0 { civ.food_ful_bp as i64 } else { t.food_sum / months };
    let order = if t.months == 0 { civ.stability as i64 * 100 } else { t.order_sum * 100 / months };
    let (_, modern) = post_shares(w, seat, t.era);
    [part(food, FOOD_NONE_BP, FOOD_FULL_BP), part(order, ORDER_NONE * 100, ORDER_FULL * 100), part(modern, MODERN_NONE_BP, MODERN_FULL_BP), (25 - 10 * t.events.len() as i64).max(0)]
}

/// One score part: 25 points at `hi` or above, none at `lo` or below, linear between.
pub fn part(v: i64, lo: i64, hi: i64) -> i64 {
    ((v - lo).clamp(0, hi - lo) * 25 / (hi - lo)).clamp(0, 25)
}

pub fn step(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let c = content();
    let month = w.month;
    // the launch complex's record for the Space era's proof
    {
        let lc = c.f("launch_complex");
        let ran = w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(lc).map(|f| f.enabled && f.run.as_ref().map(|x| x.rate_bp >= 5_000).unwrap_or(false)).unwrap_or(false));
        let e = &mut w.civs[si].era;
        e.launch_months = if ran { e.launch_months.saturating_add(1) } else { 0 };
    }
    step_transition(w, seat);
    // an age ends
    if let Some(a) = w.civs[si].era.age.clone() {
        if month >= a.until {
            w.civs[si].era.age = None;
            if a.golden {
                // the second charter of a golden age lapses with it
                w.civs[si].era.charters.truncate(1);
            }
            brief(w, seat, "info", format!("The {} age has ended", if a.golden { "golden" } else { "dark" }), "Its effects no longer apply.".into(), None, "culture");
        }
    }
    // tell the seat once when it may cross
    if w.civs[si].era.told_eligible == 0 && month % 12 == 0 {
        if let Ok(next) = eligibility(w, seat) {
            w.civs[si].era.told_eligible = 1;
            brief(w, seat, "good", format!("The {} era may be entered", ERA_NAMES[next as usize]), "Its knowledge is understood and its proof is built. Entering opens its charters; the crossing strains the old order.".into(), None, "culture");
        }
    }
    step_traditions(w, seat);
    step_hazards(w, seat);
}

fn crisis_now(civ: &Civ) -> u64 {
    // epidemic deaths, and hunger deaths in months of famine
    civ.flows.deaths_cause[3] as u64 + if civ.food_ful_bp < 9_000 { civ.flows.deaths_cause[1] as u64 } else { 0 }
}

fn step_transition(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    let month = w.month;
    let Some(mut t) = w.civs[si].era.transition.clone() else { return };
    let civ = &w.civs[si];
    t.food_sum += civ.food_ful_bp as i64;
    t.order_sum += civ.stability as i64;
    t.months += 1;
    let when = event_label(&w.cfg, month);
    // a governed region lost to another seat
    let now: Vec<RegionId> = w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.id).collect();
    for r in &t.governed {
        if !now.contains(r) {
            if let Some(o) = w.regions[*r as usize].controller {
                if o != seat {
                    t.events.push(format!("{}: {} lost to the {}", when, w.regions[*r as usize].name, w.civs[o as usize].name));
                }
            }
        }
    }
    t.governed = now;
    // a repudiated treaty
    let broken = w.treaties.iter().filter(|x| x.broken_by == Some(seat)).count() as u32;
    if broken > t.broken_start {
        for _ in t.broken_start..broken {
            t.events.push(format!("{when}: a treaty repudiated"));
        }
        t.broken_start = broken;
    }
    // epidemics and famine killing more than 2% of the people within a year
    let cur = crisis_now(civ);
    let delta = if cur >= t.last_crisis { cur - t.last_crisis } else { cur };
    t.last_crisis = cur;
    t.crisis_deaths += delta;
    let pop = w.civ_population(seat).max(1);
    if t.crisis_deaths * 50 > pop {
        t.events.push(format!("{when}: epidemic or famine killed more than 2% of the people"));
        t.crisis_deaths = 0;
        t.crisis_window_start = month;
    } else if month >= t.crisis_window_start + 12 {
        t.crisis_deaths = 0;
        t.crisis_window_start = month;
    }
    if month < t.end {
        w.civs[si].era.transition = Some(t);
        return;
    }
    // the crossing ends: the score decides the age
    let parts = score_parts(w, seat, &t);
    let score = parts.iter().sum::<i64>().clamp(0, 100) as u8;
    let e = t.era;
    let tm = TRANSITION_MONTHS[e as usize];
    let (outcome, age) = if score as i64 >= GOLDEN_SCORE {
        (1u8, Some(AgeSt { golden: true, era: e, until: month + 2 * tm, score }))
    } else if (score as i64) < DARK_SCORE {
        (3u8, Some(AgeSt { golden: false, era: e, until: month + tm, score }))
    } else {
        (2u8, None)
    };
    {
        let es = &mut w.civs[si].era;
        es.transition = None;
        if let Some(h) = es.history.iter_mut().rev().find(|h| h.0 == e) {
            h.2 = outcome;
            h.3 = score;
        }
        if age.is_some() {
            es.age = age.clone();
        }
    }
    let name = ERA_NAMES[e as usize];
    let capital = w.civs[si].capital;
    let detail = format!("Food {} · order {} · modernization {} · integrity {} = {score}", parts[0], parts[1], parts[2], parts[3]);
    if std::env::var_os("BTS_ERA_TRACE").is_some() {
        let (ob, md) = post_shares(w, seat, e);
        eprintln!("ERA_TRACE crossing seat={} ctrl={:?} era={} year={} food={} order={} modern={} integrity={} score={} foodavg={} stabavg={} obsolete={} modern_bp={} charters={:?}", seat, w.civs[si].controller, e, crate::util::date(&w.cfg, month).0, parts[0], parts[1], parts[2], parts[3], score, t.food_sum / t.months.max(1), t.order_sum / t.months.max(1), ob, md, w.civs[si].era.charters.iter().map(|c| CHARTERS[*c as usize].key).collect::<Vec<_>>());
    }
    match outcome {
        1 => {
            moment(w, seat, MomentCategory::Culture, format!("A golden age of the {name} era begins"), format!("The crossing into the {name} era was well managed. For {} years stability is higher, evidence gathers faster, building goes quicker and a second charter of the era may be held.", 2 * tm / 12), Some(capital), "assembly_hall", true, vec![detail]);
            brief(w, seat, "good", format!("A golden age of the {name} era"), "A second charter of this era may be chosen.".into(), None, "culture");
        }
        3 => {
            moment(w, seat, MomentCategory::Crisis, format!("A dark age of the {name} era begins"), format!("The crossing into the {name} era went badly. For {} years stability is lower and research weaker; reforms and tradition switches cost half, charters change freely and more people answer the call to arms.", tm / 12), Some(capital), "assembly_hall", true, vec![detail]);
            brief(w, seat, "danger", format!("A dark age of the {name} era"), "Reforms and tradition switches cost half and take half the time while it lasts.".into(), None, "culture");
        }
        _ => {
            brief(w, seat, "info", format!("The crossing into the {name} era is complete"), format!("A steady time follows. {detail}."), None, "culture");
        }
    }
}

/// Industry and power posts in works of the slot's era or later, and the posts of a
/// tradition's signature and exclusive works. (Doc 37 measures the signature share
/// against all industry and power posts; with the craft and textile works of every
/// earlier era counted, no frontier path reached 5% in the slice-10 batches, so the
/// share is taken among the works of the era that offers the slot.)
pub fn signature_posts(w: &World, seat: SeatId, t: &TraditionDef) -> (i64, i64) {
    let c = content();
    let (mut base, mut sig) = (0i64, 0i64);
    let from = SLOT_ERA[t.slot as usize];
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        for f in &r.facilities {
            let def = &c.facilities[f.kind];
            if def.food {
                continue;
            }
            if def.labor == Some(LaborCategory::Industry) && works_era(def, f) >= from {
                base += f.staffed as i64;
            }
            if signature_of(t, def, f) {
                sig += f.staffed as i64;
            }
        }
    }
    (base, sig)
}

/// The activity index of a held tradition's works: the practice evidence of its
/// branch nodes (design chapter 39, section 1.5). Zero when not held.
pub fn tradition_activity(w: &World, seat: SeatId, key: &str) -> i64 {
    let civ = &w.civs[seat as usize];
    if !held(civ, key) {
        return 0;
    }
    let Some(i) = tradition_index(key) else { return 0 };
    let (_, sig) = signature_posts(w, seat, &TRADITIONS[i]);
    crate::sim::economy::activity_index(sig)
}

fn step_traditions(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    let month = w.month;
    // mastery once a year, in January
    if crate::util::date(&w.cfg, month).1 != 1 {
        return;
    }
    for s in 0..2 {
        let Some(p) = w.civs[si].era.traditions[s] else { continue };
        let t = &TRADITIONS[p as usize];
        let (base, sig) = signature_posts(w, seat, t);
        let share = if base > 0 { sig * 10_000 / base } else { 0 };
        let lineage = w.civs[si].lineage as usize;
        let fast = t.pulls.iter().any(|k| w.lineages[lineage].axes[*k] > 6_000);
        let m = w.civs[si].era.mastery[s] as i64;
        let next = if share >= SIGNATURE_SHARE_BP { m + if fast { MASTERY_GAIN * 3 / 2 } else { MASTERY_GAIN } } else { m - MASTERY_LOSS };
        w.civs[si].era.mastery[s] = next.clamp(0, 10_000) as u16;
    }
    // compatible standards: seats sharing a path come to trust each other, a point a decade
    if crate::util::decade_start(&w.cfg, month) {
        let mine: Vec<u8> = w.civs[si].era.traditions.iter().flatten().copied().collect();
        if mine.is_empty() {
            return;
        }
        for o in 0..w.civs.len() {
            if o == si || !w.civs[si].contacts[o].met || w.civs[o].status == SeatStatus::Eliminated {
                continue;
            }
            if w.civs[o].era.traditions.iter().flatten().any(|p| mine.contains(p)) {
                let ct = &mut w.civs[si].contacts[o];
                if ct.trust < 90 {
                    ct.trust += 1;
                }
            }
        }
    }
}

fn step_hazards(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    let c = content();
    let month = w.month;
    let when = event_label(&w.cfg, month);
    let civ = &w.civs[si];
    // ---- network incidents (Network tradition, Open Networks charter) --------
    let network = held(civ, "network");
    let open = charter_held(civ, "open_networks");
    if (network || open) && month >= civ.era.network_until && civ.compute_supply > 500_000 {
        // 1 in 40 a year, twice with Open Networks; operations centres halve it
        let mut per_year_ppm: i64 = 25_000;
        if open {
            per_year_ppm *= 2;
        }
        let noc = c.f("noc");
        if w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(noc).map(|f| running(&c.facilities[noc], f)).unwrap_or(false)) {
            per_year_ppm /= 2;
        }
        if (draw_range(w.secret, &[stream("network-incident"), seat as u64, month as u64], 12_000_000) as i64) < per_year_ppm {
            w.civs[si].era.network_until = month + 6;
            brief(w, seat, "danger", "Network incident".into(), "A correlated failure spread through the networks: compute and electronics output -30% for six months.".into(), None, "economy");
            moment(w, seat, MomentCategory::Crisis, "A network incident".into(), "Systems that depended on each other failed together. Compute and electronics output fell by almost a third for six months.".into(), None, "workshop", false, vec![format!("Began in {when}")]);
        }
    }
    // ---- reactor incidents (Atom): 1 in 2,000 per reactor level a year -------
    if held(&w.civs[si], "atom") {
        let keys = [c.f("fission"), c.f("compact_reactor")];
        let regs: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].controller == Some(seat)).collect();
        for ri in regs {
            let levels: i64 = w.regions[ri].facilities.iter().filter(|f| keys.contains(&f.kind) && f.enabled).map(|f| f.level as i64).sum();
            if levels == 0 {
                continue;
            }
            // per level per year 1 in 2,000 = 500 ppm a year
            if (draw_range(w.secret, &[stream("reactor-incident"), seat as u64, ri as u64, month as u64], 12_000_000) as i64) < 500 * levels {
                let pop = w.regions[ri].population();
                let out = pop / 50;
                let to = w.regions[ri].neighbors.iter().map(|(n, _)| *n as usize).find(|n| w.regions[*n].controller == Some(seat));
                let moved = match to {
                    Some(n) => crate::sim::population::move_people(w, ri, n, out, false),
                    None => 0,
                };
                w.civs[si].era.reactor.push(Incident { region: ri as RegionId, until: month + 60 });
                let name = w.regions[ri].name.clone();
                moment(w, seat, MomentCategory::Crisis, format!("Reactor incident at {name}"), format!("A reactor at {name} released radioactivity. {} people were resettled; the region's confidence will take years to return.", group(moved as i64)), Some(ri as RegionId), "workshop", true, vec![format!("{when}")]);
                for o in 0..w.civs.len() {
                    if o != si && w.civs[o].memory[ri].seen && w.civs[o].status != SeatStatus::Eliminated {
                        reported(w, o as SeatId, MomentCategory::Crisis, format!("Reactor incident at {name}"), format!("Reports tell of a reactor incident at {name}."), Some(ri as RegionId), "workshop", vec![format!("Reported in {when}")]);
                    }
                }
            }
        }
    }
    w.civs[si].era.reactor.retain(|x| month < x.until);
    // ---- grid faults (Current and Wire) -----------------------------------------
    if held(&w.civs[si], "wire") {
        let mut grid = std::mem::take(&mut w.civs[si].era.grid);
        for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
            let (supply, demand) = (r.last.elec_supply, r.last.elec_demand);
            let strained = supply > 0 && demand * 100 > supply * 95;
            let entry = match grid.iter_mut().find(|g| g.0 == r.id) {
                Some(e) => e,
                None => {
                    grid.push((r.id, 0, 0));
                    grid.last_mut().unwrap()
                }
            };
            if strained {
                entry.1 = entry.1.saturating_add(1);
                if entry.1 >= 3 {
                    entry.2 = month + 1;
                    entry.1 = 0;
                }
            } else {
                entry.1 = 0;
            }
        }
        grid.retain(|g| g.1 > 0 || g.2 > month);
        w.civs[si].era.grid = grid;
    } else {
        w.civs[si].era.grid.clear();
    }
}

// ---------------------------------------------------------------------------
// Effects read by the other mechanisms
// ---------------------------------------------------------------------------

/// The era terms of a civilization's stability target (culture::step).
pub fn stability_delta(w: &World, seat: SeatId) -> i64 {
    let civ = &w.civs[seat as usize];
    let month = w.month;
    let mut d = 0i64;
    if let Some(t) = &civ.era.transition {
        let (obsolete, _) = post_shares(w, seat, t.era);
        d -= strain(obsolete);
    }
    if golden(civ, month) {
        d += 5;
    }
    if dark(civ, month) {
        d -= 5;
    }
    if civ.era.charter_changed.map(|c| month < c + CHARTER_CHANGE_MONTHS).unwrap_or(false) {
        d -= CHARTER_CHANGE_STABILITY;
    }
    let at_war = civ.contacts.iter().any(|x| x.at_war);
    let h = |k: &str| charter_held(civ, k);
    if h("citizen_levy") && !at_war {
        d -= 2;
    }
    if h("chartered_companies") {
        d -= 2;
    }
    if h("laissez_faire") {
        d -= 2;
    }
    if h("factory_acts") {
        d += 3;
    }
    if h("mass_mobilization") {
        d -= 2;
    }
    if h("welfare_state") {
        d += 4;
    }
    if h("surveillance_state") {
        d += 5;
    }
    if h("human_primacy") {
        d += 5;
    }
    if h("machine_stewardship") && (crate::sim::culture::belief_share(w, seat, "sanctified_labour") > 3_000 || crate::sim::culture::belief_share(w, seat, "day_of_rest") > 3_000) {
        d -= 3;
    }
    // general posts automated away (Automation Drive, Synthetic Minds)
    let synthetic = held(civ, "synthetic");
    if h("automation_drive") || synthetic {
        let (saved, total) = automated_share(w, seat);
        let tenths = if total > 0 { saved * 10 / total } else { 0 };
        if h("automation_drive") {
            d -= tenths;
        }
        if synthetic {
            d -= 2 * tenths;
        }
    }
    // a tradition reform under way
    if civ.projects.iter().any(|p| matches!(p.kind, ProjKind::TraditionReform { .. })) {
        d -= 5;
    }
    // oil dependence
    if held(civ, "engine") {
        let fuel = civ.stock_of(Good::Fuel);
        let use_m = civ.use_ema[Good::Fuel.index()].max(1);
        if fuel < use_m * 2 {
            d -= if at_war { 6 } else { 3 };
        }
    }
    // Atom against the Stewardship of the Land
    if held(civ, "atom") && crate::sim::culture::belief_share(w, seat, "stewardship") > 3_000 {
        d -= 3;
    }
    // reactor incidents: -10 in the region, weighed by its share of the people
    if !civ.era.reactor.is_empty() {
        let pop = w.civ_population(seat).max(1) as i64;
        let worst = civ.era.reactor.iter().map(|x| (10 * w.regions[x.region as usize].population() as i64 / pop).max(2)).max().unwrap_or(0);
        d -= worst.min(10);
    }
    d
}

/// General posts saved by productivity, and the posts that remain, over the seat's works.
pub fn automated_share(w: &World, seat: SeatId) -> (i64, i64) {
    let (mut saved, mut held_posts) = (0i64, 0i64);
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        saved += r.last.posts_saved.iter().map(|x| *x as i64).sum::<i64>();
        held_posts += r.last.labor.facilities as i64;
    }
    (saved, saved + held_posts)
}

/// Factor on the discovery channel (basis points).
pub fn channel_bp(civ: &Civ, month: Month) -> i64 {
    let mut f = 10_000i64;
    if golden(civ, month) {
        f = f * 11_000 / 10_000;
    }
    for (k, bp) in [("academies", 10_500), ("republic_of_letters", 11_000), ("open_networks", 11_000), ("surveillance_state", 9_500)] {
        if charter_held(civ, k) {
            f = f * bp / 10_000;
        }
    }
    f
}

/// Factor on contact evidence a seat gathers from a partner (basis points).
pub fn contact_bp(w: &World, seat: SeatId, partner: SeatId) -> i64 {
    let civ = &w.civs[seat as usize];
    let mut f = 10_000i64;
    for (k, bp) in [("republic_of_letters", 12_500), ("open_networks", 12_500), ("chartered_companies", 11_000)] {
        if charter_held(civ, k) {
            f = f * bp / 10_000;
        }
    }
    // a Republic of Letters spreads what it shows
    if charter_held(&w.civs[partner as usize], "republic_of_letters") {
        f = f * 12_500 / 10_000;
    }
    f
}

/// Research capacity by class after the era terms: factor (bp) and a fixed deduction.
pub fn research_terms(civ: &Civ, class: ResearchClass, month: Month) -> (i64, i64) {
    let mut f = 10_000i64;
    let mut minus = 0i64;
    if dark(civ, month) {
        f = f * 9_000 / 10_000;
    }
    if class == ResearchClass::Scholarly && charter_held(civ, "academies") {
        f = f * 11_500 / 10_000;
        minus += 500;
    }
    if matches!(class, ResearchClass::Advanced | ResearchClass::Frontier) && charter_held(civ, "compute_commons") {
        f = f * 11_000 / 10_000;
    }
    (f, minus)
}

/// Factor on the research a works gives (Monastic Learning, Planetary Protection).
pub fn works_research_bp(civ: &Civ, def: &FacDef) -> i64 {
    match def.key {
        "archive" if charter_held(civ, "monastic_learning") => 12_500,
        "orbital_station" | "interferometer" if charter_held(civ, "planetary_protection") => 12_500,
        _ => 10_000,
    }
}

/// Factor on recruit room (basis points).
pub fn recruit_bp(civ: &Civ, month: Month) -> i64 {
    let mut f = 10_000;
    if charter_held(civ, "citizen_levy") {
        f = f * 12_500 / 10_000;
    }
    if charter_held(civ, "mass_mobilization") {
        f = f * 15_000 / 10_000;
    }
    if dark(civ, month) {
        f = f * 11_000 / 10_000;
    }
    f
}

pub fn militia_bp(civ: &Civ) -> i64 {
    if charter_held(civ, "feudal_estates") { 15_000 } else { 10_000 }
}

pub fn mobilization_bp(civ: &Civ) -> i64 {
    if charter_held(civ, "feudal_estates") { 9_000 } else { 10_000 }
}

/// Administrative capacity added by charters: Road and Law (one region per office
/// level) and Machine Stewardship (half again).
pub fn admin_terms(w: &World, seat: SeatId, base: i64) -> i64 {
    let civ = &w.civs[seat as usize];
    let mut cap = base;
    if charter_held(civ, "road_and_law") {
        let admin = content().f("admin");
        cap += w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.fac(admin).filter(|f| f.enabled).map(|f| f.level as i64).unwrap_or(0)).sum::<i64>();
    }
    if charter_held(civ, "machine_stewardship") {
        cap = cap * 3 / 2;
    }
    cap
}

/// What charters and ages add to a sector's productivity (the culture factor), bp.
pub fn sector_lp_add(civ: &Civ, sector: Sector, month: Month) -> i64 {
    let mut d = 0;
    let h = |k: &str| charter_held(civ, k);
    match sector {
        Sector::Industry => {
            if h("guild_charters") {
                d += 500;
            }
            if h("laissez_faire") {
                d += 500;
            }
            if h("factory_acts") {
                d -= 300;
            }
        }
        Sector::Construction => {
            if h("guild_charters") {
                d -= 500;
            }
            if golden(civ, month) {
                d += 1_000;
            }
        }
        Sector::Services => {
            if h("planned_electrification") {
                d -= 300;
            }
        }
        _ => {}
    }
    d
}

/// Names of what bears on a sector, for the productivity breakdown.
pub fn sector_lp_notes(civ: &Civ, sector: Sector, month: Month) -> Vec<String> {
    let mut out = Vec::new();
    let pairs: &[(&str, Sector)] = &[("guild_charters", Sector::Industry), ("laissez_faire", Sector::Industry), ("factory_acts", Sector::Industry), ("guild_charters", Sector::Construction), ("planned_electrification", Sector::Services)];
    for (k, s) in pairs {
        if *s == sector && charter_held(civ, k) {
            out.push(format!("Charter: {}", CHARTERS[charter_index(k).unwrap()].name));
        }
    }
    if sector == Sector::Construction && golden(civ, month) {
        out.push("A golden age".into());
    }
    out
}

pub fn health_add(civ: &Civ) -> i64 {
    if charter_held(civ, "factory_acts") { 300 } else { 0 }
}

/// The ceiling of automation of qualified posts for a seat.
pub fn auto_cap(civ: &Civ) -> i64 {
    if charter_held(civ, "human_primacy") {
        12_500
    } else if charter_held(civ, "automation_drive") {
        16_000
    } else {
        15_000
    }
}

/// Factor on the labour productivity of a works from its tradition (basis points):
/// the steam hammer works need up to 15% fewer general posts with mastery.
pub fn works_lp_bp(civ: &Civ, def: &FacDef) -> i64 {
    match def.key {
        "steam_hammer" if held(civ, "steam") => 10_000 * 10_000 / (10_000 - 1_500 * mastery(civ, "steam") / 10_000),
        _ => 10_000,
    }
}

/// Automation added in a region by its implant clinics (Network): +10% by mastery
/// while one runs there.
pub fn region_auto_add(w: &World, seat: SeatId, ri: usize) -> i64 {
    let civ = &w.civs[seat as usize];
    if !held(civ, "network") {
        return 0;
    }
    let c = content();
    let k = c.f("implant_clinic");
    if w.regions[ri].fac(k).map(|f| f.enabled && f.level > 0 && f.staffed > 0).unwrap_or(false) {
        1_000 * mastery(civ, "network") / 10_000
    } else {
        0
    }
}

/// What trams and metros (Current and Wire) add to a region's city factor for
/// industry, services and knowledge: up to 500 bp with mastery, while they run.
pub fn tram_city_add(w: &World, seat: SeatId, ri: usize) -> i64 {
    let civ = &w.civs[seat as usize];
    if !held(civ, "wire") {
        return 0;
    }
    let k = content().f("tramways");
    match w.regions[ri].fac(k) {
        Some(f) if f.enabled && f.level > 0 && f.staffed > 0 => 500 * mastery(civ, "wire") / 10_000,
        _ => 0,
    }
}

/// Construction terms of a facility for a seat: factors (bp) on work, goods and
/// minimum months, and on the conductors of the bill.
pub fn build_terms(civ: &Civ, key: &str) -> (i64, i64, i64, i64) {
    let (mut work, mut goods, mut months, mut cond) = (10_000i64, 10_000i64, 10_000i64, 10_000i64);
    let h = |k: &str| charter_held(civ, k);
    let space = matches!(key, "launch_complex" | "orbital_station" | "orbital_yard" | "orbital_power" | "interferometer");
    if key == "roads" && h("road_and_law") {
        work = work * 7 / 10;
    }
    if key == "rail" && h("national_railways") {
        work = work * 7 / 10;
        goods = goods * 7 / 10;
    }
    if matches!(key, "generator" | "grid" | "hydro") && h("planned_electrification") {
        work = work * 7 / 10;
    }
    if space && h("frontier_charter") {
        work = work * 8 / 10;
        goods = goods * 8 / 10;
    }
    if space && h("lunar_industry") {
        work = work * 3 / 4;
    }
    if space && h("planetary_protection") {
        work = work * 115 / 100;
    }
    if held(civ, "wire") && matches!(key, "generator" | "grid" | "hydro" | "tramways") {
        cond = 11_000;
    }
    if held(civ, "living") && matches!(key, "biofoundry" | "pharma") {
        months = 15_000;
    }
    (work, goods, months, cond)
}

/// Factor on a works' upkeep of one good (basis points).
pub fn upkeep_bp(civ: &Civ, def: &FacDef, g: Good, month: Month) -> i64 {
    let h = |k: &str| charter_held(civ, k);
    let mut f = 10_000i64;
    if def.key == "admin" && g == Good::Media && h("road_and_law") {
        f = f * 15_000 / 10_000;
    }
    if def.key == "archive" && g == Good::Media && h("monastic_learning") {
        f = f * 7_000 / 10_000;
    }
    if def.key == "rail" && g == Good::Coal && h("national_railways") {
        f = f * 12_500 / 10_000;
    }
    if matches!(def.key, "launch_complex" | "orbital_station" | "orbital_yard" | "orbital_power" | "interferometer") && h("frontier_charter") {
        f = f * 12_500 / 10_000;
    }
    // obsolete works cost a quarter more to keep (design chapter 37, section 8.3)
    if let Some(&k) = content().fac_ix.get(def.key) {
        if crate::sim::projects::is_obsolete(civ, k) {
            f = f * 12_500 / 10_000;
        }
    }
    // exclusive works of a path switched away from count as obsolete for upkeep
    if let Some(t) = exclusive_of(def.key, None) {
        if !held(civ, TRADITIONS[t].key) && civ.era.former.iter().any(|(p, _)| *p as usize == t) {
            f = f * 15_000 / 10_000;
        }
    }
    let _ = month;
    f
}

/// Factor on a region's town mortality (`M_urban`), basis points: coal smoke where a
/// Coal and Steam seat runs ten or more steam station levels (until T085 or the
/// Factory Acts), and Laissez-faire Works.
pub fn urban_mortality_bp(w: &World, seat: SeatId, ri: usize) -> i64 {
    let civ = &w.civs[seat as usize];
    let mut f = 10_000;
    if held(civ, "steam") && !civ.knows_id("T085") && !charter_held(civ, "factory_acts") {
        let steam = content().f("steam");
        if w.regions[ri].fac(steam).map(|x| x.enabled && x.level >= 10).unwrap_or(false) {
            f = f * 11_000 / 10_000;
        }
    }
    if charter_held(civ, "laissez_faire") {
        f = f * 10_500 / 10_000;
    }
    f
}

/// Factor on customary fertility (bp): Monastic Learning's celibate orders, doc 37's
/// "F_custom -200" read as 200 bp of the factor (x0.98).
pub fn custom_bp(civ: &Civ) -> i64 {
    if charter_held(civ, "monastic_learning") { 9_800 } else { 10_000 }
}

/// Development factor added (bp): the Welfare State.
pub fn dev_add(civ: &Civ) -> i64 {
    if charter_held(civ, "welfare_state") { 300 } else { 0 }
}

/// Unrest relief in an occupied region (bp): Feudal Estates after ten years, the
/// Surveillance State always.
pub fn occupied_relief(terms: (bool, bool), occupied_since: Option<Month>, month: Month) -> i64 {
    let mut d = 0;
    if terms.0 && occupied_since.map(|s| month >= s + 120).unwrap_or(false) {
        d += 1_000;
    }
    if terms.1 {
        d += 1_500;
    }
    d
}

/// (Feudal Estates, Surveillance State) for [`occupied_relief`].
pub fn occupied_relief_terms(civ: &Civ) -> (bool, bool) {
    (charter_held(civ, "feudal_estates"), charter_held(civ, "surveillance_state"))
}

/// Factor on the compute a seat's works make (basis points): operations centres
/// (Network, +5% by mastery), the commons' tenth, a network incident.
pub fn compute_bp(w: &World, seat: SeatId) -> i64 {
    let civ = &w.civs[seat as usize];
    let mut f = 10_000i64;
    if held(civ, "network") {
        let c = content();
        let noc = c.f("noc");
        if w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(noc).map(|x| x.enabled && x.level > 0 && x.staffed > 0).unwrap_or(false)) {
            f = f * (10_000 + 500 * mastery(civ, "network") / 10_000) / 10_000;
        }
    }
    if charter_held(civ, "compute_commons") {
        f = f * 9_000 / 10_000;
    }
    if w.month < civ.era.network_until {
        f = f * 7_000 / 10_000;
    }
    f
}

/// Factor on a seat's electronics output during a network incident.
pub fn electronics_bp(civ: &Civ, month: Month) -> i64 {
    if month < civ.era.network_until { 7_000 } else { 10_000 }
}

/// Factor on the rate of a region's electric works during a grid fault.
pub fn grid_fault_bp(civ: &Civ, region: RegionId, month: Month) -> i64 {
    if civ.era.grid.iter().any(|g| g.0 == region && g.2 > month) { 9_000 } else { 10_000 }
}

/// Factor on a region's epidemic hazard: biofoundry contamination (Living Systems).
pub fn outbreak_bp(w: &World, ri: usize) -> i64 {
    let r = &w.regions[ri];
    let Some(seat) = r.controller else { return 10_000 };
    if !held(&w.civs[seat as usize], "living") {
        return 10_000;
    }
    let k = content().f("biofoundry");
    if r.fac(k).map(|f| f.enabled && f.level > 0).unwrap_or(false) { 12_000 } else { 10_000 }
}

/// Proficiency a formation of a tier may reach beyond the usual (thousandths of bp).
pub fn proficiency_add(civ: &Civ, tier: u8, variant: Option<u8>) -> i64 {
    let gen = content().unit_tiers.get(tier as usize).map(|t| t.generation).unwrap_or(0);
    let mut d = 0;
    if charter_held(civ, "standing_army") && (2..=3).contains(&gen) {
        d += 1_000;
    }
    if variant.and_then(|v| TRADITIONS.get(v as usize)).map(|t| t.key == "network").unwrap_or(false) {
        d += 1_000;
    }
    d
}

pub fn army_upkeep_bp(civ: &Civ) -> i64 {
    if charter_held(civ, "standing_army") { 11_000 } else { 10_000 }
}

/// Factor on the work of mustering a formation (Mass Mobilization).
pub fn muster_bp(civ: &Civ) -> i64 {
    if charter_held(civ, "mass_mobilization") { 8_000 } else { 10_000 }
}

/// Months a formation of a tier trains (Citizen Levy: levies a month faster).
pub fn training_months(civ: &Civ, tier: u8) -> u16 {
    let def = &content().unit_tiers[tier as usize];
    if charter_held(civ, "citizen_levy") && def.generation == 1 {
        def.training_months.saturating_sub(1).max(1)
    } else {
        def.training_months
    }
}

/// Factor on the places of a course's venue (Guild Charters, Frontier Charter).
pub fn course_places_bp(civ: &Civ, course: &str) -> i64 {
    match course {
        "E002" | "E007" if charter_held(civ, "guild_charters") => 12_000,
        "E023" if charter_held(civ, "frontier_charter") => 15_000,
        _ => 10_000,
    }
}

/// Factor on the carriage loss of a region (Chartered Companies: harbour regions).
pub fn carriage_loss_bp(civ: &Civ, r: &Region) -> i64 {
    if charter_held(civ, "chartered_companies") && r.cap(Cap::Port) > 0 { 8_000 } else { 10_000 }
}

/// Factor on a region's freight capacity (National Railways: railway regions).
pub fn freight_bp(civ: &Civ, r: &Region) -> i64 {
    if charter_held(civ, "national_railways") && r.fac(content().f("rail")).map(|f| f.level > 0).unwrap_or(false) { 12_500 } else { 10_000 }
}

/// Factor on space-domain evidence (Lunar Industry).
pub fn space_evidence_bp(civ: &Civ) -> i64 {
    if charter_held(civ, "lunar_industry") { 7_500 } else { 10_000 }
}

/// Factor on the fuel orbital operations draw (Lunar Industry).
pub fn orbital_fuel_bp(civ: &Civ, key: &str) -> i64 {
    if charter_held(civ, "lunar_industry") && matches!(key, "orbital_station" | "orbital_yard") { 8_500 } else { 10_000 }
}

/// Public services of the Welfare State: medicine and media per thousand residents a month.
pub const WELFARE_MEDICINE_PER_K: i64 = 2;
pub const WELFARE_MEDIA_PER_K: i64 = 1;

/// Monthly draws of charters that consume goods directly (the Welfare State's
/// public services). Called once a month from the economy's commit.
pub fn monthly_draws(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    if charter_held(&w.civs[si], "welfare_state") {
        let pop = w.civ_population(seat) as i64;
        let med = pop * WELFARE_MEDICINE_PER_K / 1000;
        let media = pop * WELFARE_MEDIA_PER_K / 1000;
        w.civs[si].take(Good::Medicine, med);
        w.civs[si].take(Good::Media, media);
    }
}

/// Joint programme hosting load for a client sharing a path with the host
/// ("compatible standards": a third instead of a half of the inputs).
pub fn shares_path(a: &Civ, b: &Civ) -> bool {
    a.era.traditions.iter().flatten().any(|p| b.era.traditions.iter().flatten().any(|q| q == p))
}

/// The load an installation serving partners under joint programmes carries, basis
/// points (10,000 = its own use): half as much again for each client (two at
/// most), a third for a client that holds one of the host's traditions
/// ("compatible standards", design chapter 37, section 4.2).
pub fn hosting_load(w: &World, host: SeatId, service: ProgrammeService) -> i64 {
    let mut clients: Vec<SeatId> = w
        .treaties
        .iter()
        .filter(|t| t.status == "active")
        .flat_map(|t| t.programmes.iter())
        .filter(|p| p.host == host && p.service == service && w.month < p.ends)
        .map(|p| p.client)
        .collect();
    clients.truncate(crate::sim::economy::HOST_CLIENTS_MAX as usize);
    10_000
        + clients
            .iter()
            .map(|c| if shares_path(&w.civs[host as usize], &w.civs[*c as usize]) { crate::sim::economy::HOST_LOAD_PER_CLIENT_BP * 2 / 3 } else { crate::sim::economy::HOST_LOAD_PER_CLIENT_BP })
            .sum::<i64>()
}

/// The variant a formation recruited now would carry, if a held tradition has one for its tier.
pub fn variant_for(civ: &Civ, tier: u8) -> Option<u8> {
    for t in civ.era.traditions.iter().flatten() {
        if TRADITIONS[*t as usize].variant_tiers.contains(&tier) {
            // Human Primacy forbids autonomous swarms
            if TRADITIONS[*t as usize].key == "synthetic" && charter_held(civ, "human_primacy") {
                continue;
            }
            return Some(*t);
        }
    }
    None
}

/// The goods a variant puts in place of a tier's equipment or upkeep, per thousand
/// soldiers (`upkeep`: monthly).
pub fn variant_goods(variant: Option<u8>, goods: &[(Good, i64)], upkeep: bool) -> Vec<(Good, i64)> {
    let Some(v) = variant.and_then(|v| TRADITIONS.get(v as usize)) else { return goods.to_vec() };
    let mut out: Vec<(Good, i64)> = Vec::new();
    let push = |out: &mut Vec<(Good, i64)>, g: Good, a: i64| match out.iter_mut().find(|x| x.0 == g) {
        Some(x) => x.1 += a,
        None => out.push((g, a)),
    };
    for (g, a) in goods {
        match (v.key, g) {
            ("steam", Good::Fuel) => push(&mut out, Good::Coal, a * 2),
            ("engine", Good::Fuel) => push(&mut out, Good::Fuel, a * 13 / 10),
            ("wire", Good::Fuel) if upkeep => push(&mut out, Good::Batteries, 50),
            ("wire", Good::Fuel) => push(&mut out, Good::Batteries, a / 2),
            ("atom", Good::Fuel) if upkeep => push(&mut out, Good::NuclearFuel, 2),
            ("network", Good::Electronics) if upkeep => push(&mut out, Good::Electronics, a * 3 / 2),
            ("synthetic", _) if !upkeep => push(&mut out, *g, a * 16 / 10),
            _ => push(&mut out, *g, *a),
        }
    }
    if upkeep && v.key == "living" {
        push(&mut out, Good::Medicine, 20);
    }
    out
}

/// Compute a thousand soldiers of the autonomous-swarm variant draw a month (base units).
pub const SWARM_COMPUTE_PER_K: i64 = 1_000;

/// Factors (bp) on a formation's power by role [shock, maneuver, line].
pub fn variant_power(civ: &Civ, variant: Option<u8>) -> [i64; 3] {
    let Some(v) = variant.and_then(|v| TRADITIONS.get(v as usize)) else { return [10_000; 3] };
    let m = mastery(civ, v.key);
    match v.key {
        "steam" => [10_000, 9_000, 10_000 + 1_000 * m / 10_000],
        "engine" => [10_000 + 1_000 * m / 10_000, 10_000, 10_000],
        "wire" => [10_000, 10_000 + 500 * m / 10_000, 10_000],
        "synthetic" => [20_000; 3],
        _ => [10_000; 3],
    }
}

/// Factor on a formation's own losses (Living Systems: -20% by mastery).
pub fn variant_losses_bp(civ: &Civ, variant: Option<u8>) -> i64 {
    match variant.and_then(|v| TRADITIONS.get(v as usize)) {
        Some(t) if t.key == "living" => 10_000 - 2_000 * mastery(civ, "living") / 10_000,
        _ => 10_000,
    }
}

/// Shift of cultural tendency targets from held traditions and charters (bp).
pub fn tendency_pull(civ: &Civ, axis: usize) -> i64 {
    let mut d = 0;
    for t in civ.era.traditions.iter().flatten() {
        if TRADITIONS[*t as usize].pulls.contains(&axis) {
            d += 1_000;
        }
    }
    if axis == 0 && charter_held(civ, "surveillance_state") {
        d -= 1_000;
    }
    d
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

fn outcome_key(o: u8) -> Option<String> {
    match o {
        1 => Some("golden".into()),
        2 => Some("steady".into()),
        3 => Some("dark".into()),
        _ => None,
    }
}

/// The seat's own era view.
pub fn view(w: &World, seat: SeatId) -> EraView {
    let civ = &w.civs[seat as usize];
    let month = w.month;
    let e = civ.era.era;
    let transition = civ.era.transition.as_ref().map(|t| {
        let (obsolete, modern) = post_shares(w, seat, t.era);
        let parts = score_parts(w, seat, t);
        let names = ["Food", "Order", "Modernization", "Integrity"];
        let details = [
            format!("Average food access {}% (25 points at {}%, none at {}%)", (if t.months > 0 { t.food_sum / t.months } else { civ.food_ful_bp as i64 }) / 100, FOOD_FULL_BP / 100, FOOD_NONE_BP / 100),
            format!("Average stability {} (25 points at {ORDER_FULL}, none at {ORDER_NONE})", if t.months > 0 { t.order_sum / t.months } else { civ.stability as i64 }),
            format!("{}% of filled posts in works of the {} era or the one before (25 points at 60%, none at 20%)", modern / 100, ERA_NAMES[t.era as usize]),
            format!("{} event(s): -10 each", t.events.len()),
        ];
        TransitionView {
            era: t.era,
            start: t.start,
            end: t.end,
            strain: strain(obsolete) as u8,
            obsolete_share_bp: obsolete as u16,
            score: parts.iter().sum::<i64>().clamp(0, 100) as u8,
            parts: (0..4).map(|i| ScorePart { name: names[i].into(), points: parts[i] as u8, detail: details[i].clone() }).collect(),
            events: t.events.clone(),
        }
    });
    let age = civ.era.age.as_ref().filter(|a| month < a.until).map(|a| AgeView {
        kind: if a.golden { "golden".into() } else { "dark".into() },
        era: a.era,
        until: a.until,
        score: a.score,
        effects: if a.golden {
            vec!["Stability +5".into(), "Evidence gathers 10% faster".into(), "Construction productivity +10%".into(), "A second charter of the era may be held".into()]
        } else {
            vec!["Stability -5".into(), "Research capacity -10%".into(), "Practice reforms and tradition switches cost half and take half the time".into(), "Charters change without cost".into(), "Recruit room +10%".into()]
        },
    });
    let slots = charter_slots(civ, month);
    let lock = civ.era.charter_changed.map(|c| month < c + CHARTER_LOCK_MONTHS).unwrap_or(false) && !dark(civ, month);
    let charters = CHARTERS
        .iter()
        .enumerate()
        .filter(|(_, d)| d.era == e && e > 0)
        .map(|(i, d)| {
            let is_held = civ.era.charters.contains(&(i as u8));
            CharterView { key: d.key.into(), era: d.era, name: d.name.into(), effect: d.effect.into(), cost: d.cost.into(), held: is_held, available: !is_held && (civ.era.charters.len() < slots || !lock) }
        })
        .collect();
    let charter_note = if e == 0 {
        "The Ancient era has no charters.".into()
    } else if civ.era.charters.len() < slots {
        format!("{} charter place(s) free.", slots - civ.era.charters.len())
    } else if dark(civ, month) {
        "In a dark age a charter may be changed without cost.".into()
    } else if lock {
        format!("A change is allowed from {}.", event_label(&w.cfg, civ.era.charter_changed.unwrap_or(0) + CHARTER_LOCK_MONTHS))
    } else {
        "Changing the charter costs stability -3 for five years, and no further change for twenty years.".into()
    };
    let next = (e + 1 <= top_era(civ)).then(|| {
        let n = e + 1;
        let (obsolete, modern) = post_shares(w, seat, n);
        NextEraView {
            era: n,
            name: ERA_NAMES[n as usize].into(),
            conditions: conditions_view(w, seat, n),
            eligible: eligibility(w, seat).is_ok(),
            transition_months: TRANSITION_MONTHS[n as usize],
            strain_if_entered: strain(obsolete) as u8,
            obsolete_share_bp: obsolete as u16,
            modern_share_bp: modern as u16,
        }
    });
    let traditions = (0..2)
        .map(|s| {
            let held_p = civ.era.traditions[s];
            let reform = civ.projects.iter().find_map(|p| if let ProjKind::TraditionReform { slot, path } = p.kind { (slot as usize == s).then_some((path, p.id)) } else { None });
            let share = held_p.map(|p| {
                let (b, sg) = signature_posts(w, seat, &TRADITIONS[p as usize]);
                if b > 0 { (sg * 10_000 / b).min(10_000) } else { 0 }
            });
            let last = civ.era.switched[s];
            let allowed = last.map(|l| l + SWITCH_COOLDOWN).filter(|a| month < *a).unwrap_or(0);
            TraditionView {
                slot: SLOT_NAMES[s].into(),
                offered: e >= SLOT_ERA[s],
                held: held_p.map(|p| TRADITIONS[p as usize].key.to_string()),
                mastery_bp: held_p.map(|_| civ.era.mastery[s]).unwrap_or(0),
                signature_share_bp: share.unwrap_or(0) as u16,
                reform_to: reform.map(|r| TRADITIONS[r.0 as usize].key.to_string()),
                reform_project: reform.map(|r| r.1),
                switch_allowed_from: allowed,
                // the paths are shown once the slot is offered
                options: if e >= SLOT_ERA[s] { TRADITIONS.iter().enumerate().filter(|(_, t)| t.slot as usize == s).map(|(i, t)| tradition_option(w, seat, t, held_p == Some(i as u8))).collect() } else { Vec::new() },
            }
        })
        .collect();
    EraView {
        era: e,
        name: ERA_NAMES[e as usize].into(),
        since: civ.era.since,
        transition,
        age,
        charters,
        charter_slots: slots as u8,
        charter_note,
        next,
        expected_basket: expected_basket(e).iter().filter(|(_, a)| *a > 0).map(|(g, a)| GoodQty { good: *g, amount: *a }).collect(),
        traditions,
        history: civ.era.history.iter().map(|(era, m, o, s)| EraEntryView { era: *era, month: *m, outcome: outcome_key(*o), score: (*o > 0).then_some(*s) }).collect(),
    }
}

/// A path as a seat may see it: works it has not discovered are not named.
pub fn tradition_option(w: &World, seat: SeatId, t: &TraditionDef, is_held: bool) -> TraditionOption {
    let c = content();
    let civ = &w.civs[seat as usize];
    let name_of = |x: &str| -> String {
        let (f, m) = match x.split_once(':') {
            Some((f, m)) => (f, Some(m)),
            None => (x, None),
        };
        let kind = c.f(f);
        let def = &c.facilities[kind];
        if !crate::actions::facility_visible(w, seat, kind) {
            return "Works not yet discovered".into();
        }
        match m {
            Some(m) => match def.recipes.iter().find(|r| r.key == m) {
                Some(r) => {
                    let mut ts = Vec::new();
                    r.req.techs(&mut ts);
                    if ts.iter().all(|t| civ.tech[*t].state >= ST_DISCOVERED) { format!("{} ({})", r.name, def.name) } else { format!("A method of the {} not yet discovered", def.name.to_lowercase()) }
                }
                None => def.name.to_string(),
            },
            None => def.name.to_string(),
        }
    };
    TraditionOption {
        key: t.key.into(),
        name: t.name.into(),
        sober_name: t.sober.into(),
        description: t.desc.into(),
        favoured_by: t.favoured.into(),
        signature_works: t.signature.iter().map(|x| name_of(x)).collect(),
        exclusive_works: t.exclusive.iter().map(|x| name_of(x)).collect(),
        unit_variant: t.variant.into(),
        drawbacks: t.drawbacks.iter().map(|x| x.to_string()).collect(),
        held: is_held,
    }
}

/// Held tradition keys, for other seats' views.
pub fn tradition_keys(civ: &Civ) -> Vec<String> {
    civ.era.traditions.iter().flatten().map(|p| TRADITIONS[*p as usize].key.to_string()).collect()
}
