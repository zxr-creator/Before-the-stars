//! Seat-facing protocol for Before the Stars.
//!
//! Everything a seat can know or do passes through the types in this crate.
//! Humans (web client), the native non-LLM AI and external agents (HTTP/CLI)
//! all consume the same [`Observation`] and submit the same [`Action`]s. The
//! authoritative world state lives in `bts-engine` and is never serialized to
//! a seat.

use serde::{Deserialize, Serialize};

/// 1.2: head counts are real people (`JobSpec.count`, programme places and
/// `start_program`/`manage_program` seats widen to `u32`), quantities are base units,
/// and `Observation.units` states the unit system.
/// 1.3 (ruleset 3.0, additions only): the historical calendar (`date`, `calendar`),
/// standing orders (`directives`, `Action::Directive`), war policies, notice on
/// open-ended treaties and the round recap flag of chronicle entries.
/// 1.4 (additions only): the Earth-like world (`WorldFrame.wrap_x`, `WorldFrame.kind`,
/// `RegionView.climate`).
/// 2.0 (breaking): fifty goods and seventeen deposits (`Good::Minerals` and
/// `Deposit::Minerals` retired), site bonuses and spice land in surveys, helium on gas
/// fields, unit generations, building lines on facility types, goods shown only once
/// known (ruleset 3.0 slice 5), productivity breakdowns (slice 6).
pub const PROTOCOL_VERSION: &str = "bts-protocol/2.1";

pub type SeatId = u8;
pub type RegionId = u16;
pub type Month = u32;

// ---------------------------------------------------------------------------
// Public enumerations
// ---------------------------------------------------------------------------

macro_rules! public_enum {
    ($(#[$meta:meta])* $name:ident { $($variant:ident => $label:expr),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name { $($variant),+ }
        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$variant),+];
            pub const COUNT: usize = Self::ALL.len();
            pub fn label(self) -> &'static str { match self { $($name::$variant => $label),+ } }
            pub fn index(self) -> usize { self as usize }
            pub fn from_index(i: usize) -> $name { Self::ALL[i] }
        }
    };
}

public_enum!(
    /// Storable goods (ruleset 3.0: fifty, design chapter 36 section 5.2 and
    /// chapter 37 section 1.1). Quantities on the wire are integer base units: one
    /// ration for food (one person's food for one month, 50 kg grain-equivalent),
    /// one head for horses, one tonne for bulk goods and one standard lot for
    /// manufactures. 1,000 base units make one display unit (see [`UnitsView`] for
    /// the unit and mass of each good). The enum is public schema; a seat is shown
    /// a good only once it knows a source or a use of it.
    Good {
    Food => "Food",
    Materials => "Building materials",
    Tools => "Tools",
    CopperOre => "Copper ore",
    IronOre => "Iron ore",
    Coal => "Coal",
    Crude => "Crude oil",
    Copper => "Copper",
    Metal => "Iron and steel",
    Components => "Mechanical components",
    Conductors => "Conductors",
    Insulation => "Rubber, plastics and insulation",
    Fuel => "Refined fuel",
    Chemicals => "Chemicals",
    Substrate => "Semiconductor materials",
    Electronics => "Electronic devices",
    Hardware => "Computing hardware",
    Spares => "Spare parts",
    Media => "Record media",
    Instruments => "Instruments",
    Medicine => "Medicine and bioproducts",
    Timber => "Timber",
    Fibres => "Fibres",
    Horses => "Horses",
    Salt => "Salt",
    Spices => "Spices and stimulants",
    Precious => "Precious metals",
    Tin => "Tin",
    Saltpetre => "Saltpetre",
    Gas => "Natural gas",
    Bauxite => "Bauxite",
    UraniumOre => "Uranium ore",
    RareEarths => "Rare-earth ore",
    Lithium => "Lithium",
    CobaltNickel => "Cobalt and nickel",
    Quartz => "High-purity quartz",
    Helium => "Helium",
    Aluminium => "Aluminium",
    Fertilizer => "Fertilizer",
    Munitions => "Munitions",
    Magnets => "Magnets and superconductors",
    Batteries => "Batteries",
    NuclearFuel => "Nuclear fuel",
    Textiles => "Textiles",
    ConsumerGoods => "Consumer goods",
    FineWares => "Fine wares",
    Lattice => "Interface lattice",
    Volatiles => "Volatiles (water and ices)",
    Propellant => "Propellant",
    Helium3 => "Helium-3",
});

public_enum!(
    /// Principal maintained qualification of a group of people.
    Qual {
    Lorekeeper => "Lorekeepers",
    Artisan => "Artisans",
    Agronomist => "Agronomists",
    Tallier => "Talliers",
    Smith => "Smiths",
    Builder => "Builders",
    Navigator => "Navigators",
    Literate => "Literate adults",
    Scribe => "Scribes",
    Teacher => "Teachers",
    Scholar => "Scholars",
    Researcher => "Researchers",
    Scientist => "Scientists",
    Mechanic => "Mechanics",
    Technician => "Technicians",
    Electrician => "Electricians",
    Programmer => "Programmers",
    Physician => "Physicians",
    AiEngineer => "Model engineers",
    Orbital => "Orbital crews",
    FtlEngineer => "Jump engineers",
});

public_enum!(Terrain {
    Plains => "Plains",
    Hills => "Hills",
    Mountains => "Mountains",
    Forest => "Forest",
    Marsh => "Wetland",
    Steppe => "Steppe",
    Desert => "Desert",
    Tundra => "Tundra",
});

public_enum!(
    /// Climate zone of a region (ruleset 3.0, generator 2.0): drives the shared
    /// harvest draws and the map's colours. Terrain stays the eight kinds above.
    ClimateZone {
    Tropical => "Tropical",
    Arid => "Arid",
    Temperate => "Temperate",
    Continental => "Continental",
    Polar => "Polar",
});

public_enum!(
    /// Kind of home world a match is generated on (design chapter 37, section 5).
    /// `Classic` is the flat generator of ruleset 2.0, kept for fixtures.
    WorldKind {
    EarthLike => "Earth-like world",
    Classic => "Classic map",
});

impl Default for WorldKind {
    fn default() -> Self {
        WorldKind::EarthLike
    }
}

public_enum!(
    /// Finite deposits in the ground (ruleset 3.0: seventeen). A seat sees a deposit
    /// only once it understands what reveals it.
    Deposit {
    CopperOre => "Copper ore",
    IronOre => "Iron ore",
    Coal => "Coal",
    Crude => "Crude oil",
    Tin => "Tin",
    Salt => "Salt",
    Saltpetre => "Saltpetre",
    Precious => "Precious metals",
    Gas => "Natural gas",
    Bauxite => "Bauxite",
    UraniumOre => "Uranium ore",
    RareEarths => "Rare-earth ore",
    Lithium => "Lithium brine",
    CobaltNickel => "Cobalt and nickel",
    Quartz => "High-purity quartz",
    Volatiles => "Volatiles (water and ices)",
    Helium3 => "Helium-3",
});

public_enum!(
    /// Site bonuses of a region (design chapter 36, section 5.3), at most two.
    Bonus {
    Floodplain => "Fertile floodplain",
    FishBanks => "Fish banks",
    WildHerds => "Wild herds",
    OldGrowth => "Old-growth forest",
    RichPasture => "Rich pasture",
});

public_enum!(
    /// The three mutually countering military roles.
    Role {
    Assault => "Assault",
    Maneuver => "Maneuver",
    Denial => "Denial",
});

public_enum!(
    /// Research work classes. A higher class can substitute for a lower one.
    ResearchClass {
    Craft => "Craft inquiry",
    Scholarly => "Scholarly study",
    Scientific => "Experimental science",
    Industrial => "Industrial research",
    Advanced => "Advanced research",
    Frontier => "Frontier science",
});

public_enum!(
    /// A service a host's installation gives a partner under a joint programme
    /// clause (`Clause::JointProgramme`). `Undisclosed` is what a seat that has not
    /// discovered the installation is shown in its place; it is never valid in a
    /// proposal.
    ProgrammeService {
    Launch => "Launch services",
    OrbitalYard => "Orbital construction services",
    HighEnergy => "High-energy laboratory time",
    Undisclosed => "A programme facility service",
});

public_enum!(
    /// Knowledge state of a technology for one civilization.
    KnowledgeState {
    Hinted => "Hinted",
    Discovered => "Discovered",
    Investigating => "Investigating",
    Understood => "Understood",
    Prototyped => "Prototyped",
    Adopted => "Adopted",
});

public_enum!(PracticeState {
    Recognized => "Recognized",
    Reforming => "Reform under way",
    Enacted => "Enacted",
    Established => "Established",
});

public_enum!(
    /// Economic sectors of productivity (design chapter 36, section 4.2).
    Sector {
    Food => "Food",
    Extraction => "Extraction",
    Industry => "Industry",
    Services => "Services",
    Knowledge => "Knowledge",
    Construction => "Construction",
});

public_enum!(
    /// Labour categories whose relative priority a government can set.
    LaborCategory {
    Extraction => "Extraction",
    Industry => "Industry",
    Services => "Services and care",
    Knowledge => "Research and teaching",
    Construction => "Construction and projects",
});

public_enum!(Phase {
    Contact => "Contact selection",
    Negotiate => "Negotiation",
    Plan => "Planning",
    Finished => "Match finished",
});

public_enum!(SeatStatus {
    Active => "Active",
    Eliminated => "Eliminated",
    Forfeited => "Forfeited",
});

public_enum!(ControllerKind {
    Human => "Human",
    External => "External agent",
    NativeEasy => "Native AI (Easy)",
    NativeMedium => "Native AI (Medium)",
    NativeHard => "Native AI (Hard)",
    NativeExpert => "Native AI (Expert test policy)",
});

public_enum!(Visibility {
    Own => "Governed",
    Visible => "Observed",
    Remembered => "Remembered",
});

public_enum!(SettlementKind {
    Wilderness => "Wilderness",
    Camp => "Camp",
    Village => "Village",
    Town => "Town",
    City => "City",
    Metropolis => "Metropolis",
    Megalopolis => "Megalopolis",
});

public_enum!(Intent {
    Inquiry => "Inquiry",
    Quotation => "Quotation",
    Counteroffer => "Counteroffer",
    Claim => "Claim",
    Need => "Need",
    Warning => "Warning",
    AllianceProposal => "Alliance proposal",
});

public_enum!(Epistemic {
    Verified => "Verified",
    Reported => "Reported",
    Estimated => "Estimated",
    Forecast => "Forecast",
    Unknown => "Unknown",
});

public_enum!(MomentCategory {
    Settlement => "Settlement",
    Subsistence => "Subsistence",
    Knowledge => "Knowledge",
    Industry => "Industry",
    Culture => "Culture",
    Religion => "Religion",
    Education => "Education",
    Diplomacy => "Diplomacy",
    War => "War",
    Crisis => "Crisis",
    Governance => "Governance",
    Space => "Space",
    Endgame => "Endgame",
});

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Observation {
    pub protocol_version: String,
    pub match_id: String,
    pub seat: SeatId,
    pub month: Month,
    pub round: u32,
    pub months_per_round: u32,
    pub horizon: Month,
    pub phase: Phase,
    /// Negotiation window 1..=5 during `Phase::Negotiate`, otherwise 0.
    pub window: u8,
    pub ready: bool,
    pub status: SeatStatus,
    pub outcome: Option<MatchOutcome>,
    pub civ: OwnCiv,
    pub regions: Vec<RegionView>,
    pub world: WorldFrame,
    pub others: Vec<ForeignCiv>,
    pub knowledge: KnowledgeView,
    pub culture: CultureView,
    pub catalog: CatalogView,
    pub projects: Vec<ProjectView>,
    pub programs: Vec<ProgramView>,
    pub armies: Vec<ArmyView>,
    pub foreign_armies: Vec<ForeignArmyView>,
    pub diplomacy: DiplomacyView,
    pub objectives: ObjectivesView,
    pub briefing: Vec<BriefingItem>,
    pub chronicle: Vec<ChronicleEntry>,
    pub receipts: Vec<Receipt>,
    /// What one integer step of each quantity means under the running ruleset, so a
    /// client need not hard-code scale. Absent in observations older than protocol 1.2.
    #[serde(default)]
    pub units: UnitsView,
    /// The date of the month about to be simulated (ruleset 3.0).
    #[serde(default)]
    pub date: Option<DateView>,
    /// The round schedule and where this round sits in it (ruleset 3.0).
    #[serde(default)]
    pub calendar: Option<CalendarView>,
    /// This seat's standing orders, in the order they are evaluated.
    #[serde(default)]
    pub directives: Vec<DirectiveView>,
}

/// A date of the historical calendar.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DateView {
    /// Historical year, signed, with no year zero: -5000 is 5000 BC, 1 is AD 1.
    pub year: i32,
    /// Month of the year, 1 (January) to 12.
    pub month: u8,
    /// "5000 BC", "AD 1066".
    pub label: String,
}

/// One segment of the round schedule: rounds `first_round..=last_round` last
/// `years_per_round` years each (the round that starts in AD 1 one year less).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct CalendarSegment {
    pub first_round: u32,
    pub last_round: u32,
    pub years_per_round: u32,
    /// Historical years at the segment's start and end.
    pub from: i32,
    pub to: i32,
}

/// The calendar of the match (design chapter 36, section 2.2).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct CalendarView {
    /// "standard", "quick" or "fixture".
    pub id: String,
    pub start: DateView,
    /// The date at which the match ends without a winner, and that month.
    pub horizon: DateView,
    pub horizon_month: Month,
    /// Wins are scored from this date: reward `2 - (T - R) / (H - R)`, clamped to [1, 2].
    pub reward_reference: DateView,
    pub reward_reference_month: Month,
    /// The last round of the schedule.
    pub rounds: u32,
    /// Months this round resolves, and the dates it runs from and to.
    pub round_months: u32,
    pub round_start: DateView,
    pub round_end: DateView,
    pub next_round_months: u32,
    /// Months the last resolved round lasted (the span of `GoodLine` round totals and
    /// of the `*_last_round` counts); 0 before the first round is resolved.
    pub last_round_months: u32,
    pub segments: Vec<CalendarSegment>,
}

/// A standing order (design chapter 36, section 2.6). Evaluated by the referee on
/// 1 January of every year inside a round and in the first month of every round,
/// in the seat's order, each through exactly the validation of the action it
/// stands for. One that fails is skipped that year and reports why.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Directive {
    /// Keep `levels` levels (built plus under construction) of a facility in a
    /// region: when fewer and no order for it is open there, order the shortfall
    /// (at most four levels) at the quoted price.
    BuildTarget {
        region: RegionId,
        facility: String,
        levels: u16,
        #[serde(default)]
        priority: Option<u8>,
    },
    /// When research capacity is idle, start the first item of the list that can be
    /// started (technology handles as in `KnowledgeView`): a discovered method is
    /// investigated, a lead is followed up by a small study.
    ResearchAgenda { techs: Vec<String> },
    /// When research capacity is still idle after the agenda, start the discovered
    /// method with the lowest tier and most evidence, then follow up leads alike.
    AutoResearch { on: bool },
    /// While fewer than two reforms are under way, propose the first practice of the
    /// list whose reform can begin (practice handles as in `CultureView`).
    ReformAgenda { practices: Vec<String> },
    /// Order the settlement of `to` from `from` with `people` settlers once the
    /// sending region's residents exceed `when_crowd_bp` of its water capacity and
    /// our records show the land unclaimed.
    SettleTarget { from: RegionId, to: RegionId, people: u32, when_crowd_bp: u16 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectiveOp {
    /// Add a standing order. One that stands for the same thing (the same region
    /// and facility, the same settlement target, the agenda, automatic research)
    /// is replaced in place.
    Add,
    Remove,
    /// Move the order `id` to the 0-based `position`.
    Move,
}

/// A standing order and what it did when last evaluated.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DirectiveView {
    pub id: u32,
    pub directive: Directive,
    /// What happened the last time it was evaluated (empty before then).
    pub last_result: String,
    /// "acted", "idle" (nothing to do), "skipped" (an order was refused) or "" (not yet evaluated).
    #[serde(default)]
    pub last_status: String,
    /// Completed months when it was last evaluated.
    #[serde(default)]
    pub last_month: Month,
}

/// Unit and mass of one base unit of a good.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GoodUnit {
    pub good: Good,
    /// "t" (tonne), "ration" or "lot".
    pub unit: String,
    /// Mass of one base unit in kilograms, i.e. thousandths of a tonne:
    /// 1000 for bulk goods, 50 for a ration, the lot mass for manufactures.
    pub tonnes_per_unit_milli: i64,
}

/// The unit system of the running ruleset. Head counts everywhere in the protocol
/// are real people; nothing is multiplied on the way out of the engine.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct UnitsView {
    /// Food base units (rations) one resident or soldier eats in a month.
    pub food_per_person_month: i64,
    /// Base units per display unit for goods, work, research and services (1000).
    pub display_divisor: i64,
    pub goods: Vec<GoodUnit>,
    /// What one base unit of project work is ("worker-month").
    pub work_unit: String,
    /// What one base unit of research work is ("researcher-month").
    pub research_unit: String,
    /// What one base unit of shaft or electric service is ("0.1 MWh delivered in the month").
    pub service_unit: String,
    /// Lower bound, in residents, of each settlement class in ascending order.
    pub settlement_bounds: Vec<(SettlementKind, u32)>,
    /// Bounds on orders that name a number of people.
    #[serde(default)]
    pub limits: PeopleLimits,
}

/// Bounds, in people, on the orders that name a head count.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PeopleLimits {
    /// A settling party (`settle`).
    pub settlers_min: u32,
    pub settlers_max: u32,
    /// A formation (`recruit`).
    pub soldiers_min: u32,
    pub soldiers_max: u32,
    /// Places one programme may book (`start_program`, `manage_program`).
    pub program_seats_max: u32,
    /// Learners a founding cohort can hold while nobody qualified can teach it.
    pub founding_cohort_max: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorldFrame {
    pub width: i32,
    pub height: i32,
    /// Total number of regions is public scenario information.
    pub region_count: u16,
    /// The map wraps east-west (generator 2.0 Earth-like worlds): a region polygon
    /// may extend past either edge and is drawn again one width over.
    #[serde(default)]
    pub wrap_x: bool,
    /// The kind of home world (absent from older referees: the classic map).
    #[serde(default)]
    pub kind: Option<WorldKind>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MatchOutcome {
    pub finished_month: Month,
    pub winner: Option<SeatId>,
    pub reason: String,
    /// Formal reward for this seat: `2 - T/H` for the unique winner, otherwise -1.
    pub reward: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GoodLine {
    pub good: Good,
    /// All quantities are base units of the good (rations, tonnes or lots).
    pub stock: i64,
    /// Totals over the last resolved round. `produced` is gross output where it was
    /// made; `consumed` is what was used (eaten, burned, built in, issued).
    pub produced: i64,
    pub consumed: i64,
    pub traded_in: i64,
    pub traded_out: i64,
    pub capacity: Option<i64>,
    /// What nobody used: spoilage, loss in carriage to the common stock and
    /// abandoned stores. Over the round,
    /// `stock change = produced - consumed - lost + traded_in - traded_out`.
    #[serde(default)]
    pub lost: i64,
    /// Output the works stood ready to make last round (staffed, supplied and
    /// powered) but did not make because the stores of the good were full. It was
    /// never made and is in no stock; it counts only where a rule asks what the
    /// works can sustain (the industrial base of the jump programme).
    #[serde(default)]
    pub withheld: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QualCount {
    pub qual: Qual,
    pub count: u32,
    pub employed: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LaborSummary {
    pub working_age: u32,
    pub food: u32,
    pub facilities: u32,
    pub projects: u32,
    pub household: u32,
    pub students: u32,
    pub teachers: u32,
    pub soldiers: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResearchLine {
    pub class: ResearchClass,
    /// Researcher-months available per month: one per staffed research post.
    pub capacity: i64,
    pub used: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Policies {
    pub food_reserve_months: u8,
    /// Relative weights 0..=10 per labour category.
    pub labor_weights: Vec<(LaborCategory, u8)>,
    /// Share of project labour capacity the government actually calls up, basis points.
    pub mobilization_bp: u16,
    /// Standing war policies, one per seat they name.
    #[serde(default)]
    pub war_policies: Vec<WarPolicyView>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct WarPolicyView {
    pub seat: SeatId,
    pub accept_white_peace_after_months: Option<u16>,
    pub accept_cession_max: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FactionView {
    pub key: String,
    pub name: String,
    pub description: String,
    /// Share of organized adults, basis points.
    pub weight_bp: u16,
    /// Observed cooperation 0..=100.
    pub support: u8,
    pub demand: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OwnCiv {
    pub name: String,
    pub adjective: String,
    pub color: String,
    pub capital: RegionId,
    /// Sums over regions are `u64` since ruleset 3.0 (a world of billions).
    pub population: u64,
    pub children: u64,
    pub working_age: u64,
    pub elders: u64,
    pub births_last_round: u32,
    pub deaths_last_round: u32,
    /// The deaths of the last round by cause; they add up to `deaths_last_round`.
    #[serde(default)]
    pub deaths_by_cause: Vec<DeathCount>,
    pub migration_last_round: i32,
    pub goods: Vec<GoodLine>,
    pub quals: Vec<QualCount>,
    pub labor: LaborSummary,
    pub research: Vec<ResearchLine>,
    pub policies: Policies,
    pub factions: Vec<FactionView>,
    /// Maximum share of non-food labour the state can direct to projects.
    pub mobilization_cap_bp: u16,
    pub stability: u8,
    pub admin_capacity: u16,
    pub admin_load: u16,
    /// Rolling twelve-month person-weighted fulfilment, basis points.
    pub food_fulfillment_bp: u16,
    pub water_fulfillment_bp: u16,
    pub military_tier: u8,
    /// How many more people would currently agree to serve as soldiers.
    #[serde(default)]
    pub recruit_room: u32,
    pub overlord: Option<SeatId>,
    pub subordinates: Vec<SeatId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NeighborLink {
    pub region: RegionId,
    /// "land", "river", "pass" or "sea".
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DepositView {
    pub kind: Deposit,
    /// Tonnes left in the ground.
    pub remaining: i64,
    pub quality_bp: u16,
    pub epistemic: Epistemic,
    /// Helium recoverable per 10,000 t of natural gas (gas fields only, and only to a
    /// seat that understands cryogenics).
    #[serde(default)]
    pub helium_bp: Option<u16>,
}

/// A site bonus of a region (design chapter 36, section 5.3).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BonusView {
    pub kind: Bonus,
    /// What it adds to the yield it modifies, basis points.
    pub bp: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SurveyView {
    pub arable: u16,
    pub pasture: u16,
    /// Wild food the land yields per month at most, in thousands of rations.
    pub wild_food: u32,
    pub fishery: u16,
    pub forest: u16,
    /// Residents the natural water supply supports.
    pub water: u32,
    pub hydro: u16,
    pub deposits: Vec<DepositView>,
    /// Levels of warm, wet land fit for spice plantations (ruleset 3.0).
    #[serde(default)]
    pub spice_land: u16,
    /// Site bonuses (ruleset 3.0).
    #[serde(default)]
    pub bonuses: Vec<BonusView>,
    pub surveyed_month: Month,
    /// False while only surface observations exist; deposits may be missing.
    pub detailed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecipeRun {
    pub recipe: String,
    pub name: String,
    /// Achieved share of full output last month, basis points.
    pub rate_bp: u16,
    pub blockers: Vec<String>,
    /// Goods the recipe ran short of last month.
    #[serde(default)]
    pub missing: Vec<Good>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FacilityView {
    /// General-post saving from shared support, basis points, as it applies in the
    /// coming month (it shrinks when the region's freight is congested); not a
    /// goods/output multiplier.
    #[serde(default)]
    pub scale_saving_bp: u16,
    pub kind: String,
    pub name: String,
    pub level: u16,
    pub max_level: u16,
    pub staffed: u32,
    pub staff_needed: u32,
    pub condition_bp: u16,
    pub utilization_bp: u16,
    pub runs: Vec<RecipeRun>,
    pub enabled: bool,
    /// The production method the seat chose for this facility in this region: the
    /// key of one of the facility type's recipes ([`RecipeView::key`]), set with
    /// `set_policy` / `method`. Absent while the choice is left to the works
    /// (automatic: the first known method whose inputs are in store).
    #[serde(default)]
    pub method: Option<String>,
    /// The method the works actually ran last month, chosen or automatic. For
    /// fields it is the method the land was worked by, which is lower than the
    /// one chosen when the chosen one's chemicals or fuel were not in store.
    #[serde(default)]
    pub active_method: Option<String>,
    /// General and qualified posts the works' levels need under the method it ran:
    /// at the method's base, after shared support, and after productivity
    /// (ruleset 3.0 slice 5; design chapter 36, section 4.3).
    #[serde(default)]
    pub posts_base: u32,
    #[serde(default)]
    pub posts_after_scale: u32,
    #[serde(default)]
    pub posts_after_productivity: u32,
    /// Labour productivity applied to the works last month, basis points.
    #[serde(default)]
    pub productivity_bp: u32,
    /// Land works: what one level grows in a month, base units, and the factors of
    /// that yield.
    #[serde(default)]
    pub yield_per_level: i64,
    #[serde(default)]
    pub yield_factors: Vec<FactorView>,
}

/// One factor of productivity (design chapter 36, section 4.3), named by its source.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FactorView {
    /// "education", "culture", "religion", "technology", "city", "health",
    /// "resources", "buildings" or "land".
    pub source: String,
    /// Multiplier in basis points (10,000 = no effect).
    pub bp: u32,
    /// What it rests on, in words: "Literate share 42%", "Practice: Craft guilds".
    pub detail: String,
}

/// Labour productivity of one economic sector in a region.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProductivityView {
    pub sector: Sector,
    /// The product of the factors, bounded to 5,000-40,000 basis points: a works
    /// needs `10,000 / total` of its method's general posts. Works of an older era
    /// receive less of the technology factor (shown per works in `FacilityView`).
    pub total_bp: u32,
    pub factors: Vec<FactorView>,
    /// General posts the region's works of the sector did without last month.
    pub posts_saved: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BlockView {
    pub lineage: String,
    pub religion: Option<String>,
    pub count: u32,
}

/// Services delivered and demanded last month. Shaft and electric figures are base
/// units of 0.1 MWh delivered in the month (1,000 = 100 MWh); compute is an index
/// (1,000 = one standard machine-hall-month). None of them can be stored.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PowerView {
    pub shaft_supply: i64,
    pub shaft_demand: i64,
    pub elec_supply: i64,
    pub elec_demand: i64,
    pub compute_supply: i64,
    pub compute_demand: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VenueSeats {
    /// Facility kind that provides the places ("lodge", "school", "college", "tech_institute").
    pub venue: String,
    /// Places offered and places booked, in people.
    pub capacity: u32,
    pub reserved: u32,
}

/// One group of a qualified site crew: `count` people who hold any of `quals`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CrewSpec {
    /// Acceptable qualifications, most preferred first.
    pub quals: Vec<Qual>,
    /// People.
    pub count: u32,
}

/// One group of a site crew as it stood last month.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CrewOnSite {
    /// Acceptable qualifications, most preferred first.
    pub quals: Vec<Qual>,
    /// People the order needs in this group, and people reserved for it last month.
    pub needed: u32,
    pub on_site: u32,
}

/// The true price of one level of a facility in one region, as it would be charged
/// if ordered now. An order of `n` levels is charged exactly `n` times the goods,
/// work, crew and site power stated here and takes the same minimum months.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BuildSiteView {
    /// Worker-months per level, including the first-of-kind surcharge where it applies.
    pub work_per_level: i64,
    /// Months the order takes at least, whatever is supplied, including the
    /// first-of-kind surcharge where it applies. The same for any number of levels.
    pub min_months: u16,
    pub kind: String,
    pub max_level: u16,
    pub queued_levels: u16,
    /// Goods per level, base units (rations, tonnes or lots); committed from stock
    /// as available and never refunded.
    #[serde(default)]
    pub cost_per_level: Vec<GoodQty>,
    /// Qualified site crew per level, in people: reserved from the region's
    /// qualified residents while the order is active (they hold no other post) and
    /// returned when it completes, is paused or is cancelled.
    #[serde(default)]
    pub crew_per_level: Vec<CrewSpec>,
    /// Shaft service the site draws per level in a month of full work, base units
    /// of 0.1 MWh (1,000 = 100 MWh). Taken from the region's shaft supply; what the
    /// region cannot give is made by site engines burning coal (1 t for 5 units),
    /// then refined fuel (1 t for 10 units), from the common stock, but never the
    /// month of fuel that mechanized fields and motor boats must find in store.
    #[serde(default)]
    pub site_power_per_level: i64,
    /// True when the seat has no installation of this kind anywhere: the work and
    /// the minimum months above are then half as much again.
    #[serde(default)]
    pub first_of_kind: bool,
}

/// One order in a region's construction queue (builds and the other labour
/// projects sited in the region), in the order in which they are served.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QueueEntry {
    /// Project id, as in [`ProjectView::id`] and `manage_project`.
    pub project: u32,
    /// 0-based place in the region's service order; `manage_project` with
    /// `position` moves an order to another place.
    pub position: u16,
    /// Project kind, as in [`ProjectView::kind`].
    pub kind: String,
    pub title: String,
    /// Facility kind for a build order.
    pub facility: Option<String>,
    /// Levels a build order adds.
    pub levels: Option<u16>,
    pub priority: u8,
    pub paused: bool,
    /// Share of the work done, basis points.
    pub progress_bp: u16,
    /// The qualified site crew: needed and reserved last month, in people.
    pub crew: Vec<CrewOnSite>,
    /// Share of the site power asked for last month that was delivered, basis
    /// points (10,000 when the site needs none or asked for none).
    pub power_bp: u16,
    /// Share of the goods bill committed so far, basis points (the least over the goods).
    pub goods_bp: u16,
    /// What the order was short of last month, in words; empty when nothing held it back.
    pub waiting_for: Vec<String>,
    pub eta_months_low: Option<u32>,
    pub eta_months_high: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OwnRegion {
    #[serde(default)]
    pub construction_sites: Vec<BuildSiteView>,
    /// Every project sited in this region, in the order in which crews, labour
    /// and site power are given out: by priority, then by place in the queue.
    #[serde(default)]
    pub construction_queue: Vec<QueueEntry>,
    pub population: u32,
    pub children: u32,
    pub working_age: u32,
    pub elders: u32,
    pub blocks: Vec<BlockView>,
    pub quals: Vec<QualCount>,
    pub labor: LaborSummary,
    pub facilities: Vec<FacilityView>,
    pub food_fulfillment_bp: u16,
    pub water_fulfillment_bp: u16,
    /// Residents the natural supply and waterworks together support.
    pub water_capacity: u32,
    pub health_pressure_bp: u16,
    pub unrest_bp: u16,
    pub transport_level: u8,
    pub link_efficiency_bp: u16,
    pub power: PowerView,
    pub occupied_since: Option<Month>,
    /// Teaching places by venue and how many are booked by programmes.
    #[serde(default)]
    pub venues: Vec<VenueSeats>,
    /// The region's shared infrastructure and what it saves or costs the works
    /// that stand together here.
    #[serde(default)]
    pub infrastructure: InfraView,
    /// Labour productivity by sector with its factors (ruleset 3.0 slice 6).
    #[serde(default)]
    pub productivity: Vec<ProductivityView>,
}

/// A region's shared infrastructure and the economies of scale it carries
/// (`docs/units-and-scale.md`, section 7). Every figure is a saving of overhead or
/// a loss in carriage; none raises what a recipe puts out. Capacity, load and the
/// rates are those that apply in the coming month with the works as they stand;
/// the quantities are last month's.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct InfraView {
    /// Facility levels of industry, extraction and power that the region's
    /// transport grade can serve ([`OwnRegion::transport_level`]).
    pub freight_capacity: u32,
    /// Enabled facility levels of industry, extraction and power in the region.
    pub freight_load: u32,
    /// Share of the load the transport can serve, basis points: 10,000 while the
    /// load is within capacity, `capacity / load` beyond it. The savings below
    /// shrink in this proportion.
    pub infra_bp: u16,
    /// The most that shared support can save of a works' general posts here,
    /// basis points: 2,000 scaled by `infra_bp`.
    pub support_saving_cap_bp: u16,
    /// Share of the spares and tools upkeep of the region's other industrial,
    /// extractive and power works that its repair works save, basis points; at
    /// most 1,500, scaled by `infra_bp` and by the rate the repair works ran at
    /// last month.
    pub maintenance_saving_bp: u16,
    /// Further share of the output the region sends to the common stock that is
    /// lost in carriage because its freight is congested, basis points; at most
    /// 2,000, the capital included.
    pub congestion_loss_bp: u16,
    /// Output of last month that paid no carriage loss because the works of the
    /// same region took as much of that good as inputs: base units by good.
    pub chain_exempt: Vec<GoodQty>,
    /// The carriage loss that exemption avoided last month, base units by good.
    pub chain_loss_saved: Vec<GoodQty>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ForeignRegion {
    pub population_low: u32,
    pub population_high: u32,
    pub notable: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RegionView {
    pub id: RegionId,
    pub name: String,
    pub poly: Vec<[i32; 2]>,
    pub center: [i32; 2],
    pub neighbors: Vec<NeighborLink>,
    pub terrain: Terrain,
    pub coastal: bool,
    pub river: bool,
    pub elevation: u8,
    pub visibility: Visibility,
    pub last_seen: Month,
    pub owner: Option<SeatId>,
    pub controller: Option<SeatId>,
    pub settlement: SettlementKind,
    pub survey: Option<SurveyView>,
    pub own: Option<OwnRegion>,
    pub foreign: Option<ForeignRegion>,
    /// One of the three revealed deployment test nodes (only after the victory contract is revealed).
    pub test_node: bool,
    /// An epidemic in the region, seen by its government and by seats observing it (ruleset 3.0).
    #[serde(default)]
    pub outbreak: Option<OutbreakView>,
    /// Climate zone (generator 2.0; public geography like terrain).
    #[serde(default)]
    pub climate: Option<ClimateZone>,
    /// The region's principal city site and harbour (design chapter 38, section 2;
    /// public geography like terrain). Absent where the generator named none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub city: Option<CitySiteView>,
}

/// Where a region's principal city stands (design chapter 38, section 2.1).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CitySiteView {
    pub name: String,
    /// Map position, in the same frame as `RegionView.center`.
    pub at: [i32; 2],
    /// A sheltered bay, estuary or fjord (section 2.3).
    pub natural_harbour: bool,
}

/// An epidemic in a region (design chapter 36, section 3.2).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OutbreakView {
    /// Completed months when it broke out.
    pub since: Month,
    /// 1 (mild) to 3 (severe): how much it raises deaths in every age band.
    pub severity_band: u8,
}

/// Deaths of one cause over the last resolved round.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DeathCount {
    /// "age_and_illness", "hunger_and_crowding", "town_conditions", "epidemic" or "war".
    pub cause: String,
    pub deaths: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ForeignCiv {
    pub seat: SeatId,
    pub name: String,
    pub adjective: String,
    pub color: String,
    pub controller: ControllerKind,
    pub status: SeatStatus,
    pub contacted: bool,
    pub contact_month: Month,
    pub at_war: bool,
    pub overlord: Option<SeatId>,
    /// Rough estimates derived from this seat's own reports.
    pub population_low: u64,
    pub population_high: u64,
    pub regions_known: u16,
    pub military_estimate: String,
    pub observed_tier: Option<u8>,
    /// How this seat's records describe the counterpart's past performance, 0..=100.
    pub trust: u8,
    pub notes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KnownRequirement {
    pub text: String,
    pub satisfied: bool,
    /// Handle of a known technology or practice this requirement refers to.
    pub handle: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TechCard {
    pub handle: String,
    pub name: String,
    pub field: String,
    /// "established", "extrapolated" or "fictional".
    pub label: String,
    pub state: KnowledgeState,
    pub capability: String,
    pub requirements: String,
    pub known_requirements: Vec<KnownRequirement>,
    /// True when the investigators know further knowledge is missing but cannot name it yet.
    pub unknown_requirements: bool,
    pub class: ResearchClass,
    /// Researcher-months.
    pub work_needed: i64,
    pub work_done: i64,
    pub source: String,
    pub discovered_month: Month,
    pub understood_month: Option<Month>,
    pub can_investigate: bool,
    pub enables: Vec<String>,
    /// Handles of known technologies this one was built on (only disclosed links).
    pub links: Vec<String>,
    /// Kind of node (design chapter 39, section 1.2): "" for the original atlas and
    /// doc 37 nodes, otherwise "side", "alt", "dead", "sealed", "entry" or "branch".
    #[serde(default)]
    pub kind: String,
    /// The rival family this card belongs to, shown only once at least two of its
    /// members are discovered; never names an undiscovered member.
    #[serde(default)]
    pub family_view: Option<FamilyView>,
    /// Fragile know-how (section 1.5): years since works last used it, while it is
    /// understood and the seat keeps no archive that would preserve it.
    #[serde(default)]
    pub fragile_risk: Option<u32>,
}

/// Path dependence on a family member's card (design chapter 39, section 7.2).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FamilyView {
    /// Family name (public content).
    pub family: String,
    /// Handles of the other discovered members.
    pub rivals_discovered: Vec<String>,
    /// Handle of the member that dominates the seat's installed base, if any.
    pub incumbent: Option<String>,
    /// The incumbent's share of the installed base, basis points.
    pub share_bp: u16,
    /// Multipliers on this card's evidence and investigation work, basis points.
    pub lock_e_bp: u16,
    pub lock_w_bp: u16,
    /// Whether its lead is held back from becoming a discovery.
    pub capped: bool,
    /// Researcher-months of a revisit study, and whether one is in force now.
    pub revisit_cost: i64,
    pub revisit_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lead {
    pub handle: String,
    pub title: String,
    pub detail: String,
    pub source: String,
    pub month: Month,
    pub confidence_bp: u16,
    pub study_work: i64,
    pub class: ResearchClass,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StudyDomain {
    pub key: String,
    pub name: String,
    pub description: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KnowledgeView {
    pub techs: Vec<TechCard>,
    pub leads: Vec<Lead>,
    pub domains: Vec<StudyDomain>,
    pub scientific_method: bool,
    /// Investigations the seat may run at once (design chapter 39, section 1.6).
    #[serde(default)]
    pub investigation_lines: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PracticeCard {
    pub handle: String,
    pub name: String,
    pub group: String,
    pub state: PracticeState,
    pub behavior: String,
    pub requirements: String,
    pub known_requirements: Vec<KnownRequirement>,
    pub adoption_bp: u16,
    pub can_reform: bool,
    pub reform_work: i64,
    pub enables: Vec<String>,
    pub links: Vec<String>,
    pub source: String,
    pub recognized_month: Month,
    /// Era 0-8 of the institution (design chapter 39, section 2.3).
    #[serde(default)]
    pub era: u8,
    /// Institutional load it adds while established.
    #[serde(default)]
    pub load: u8,
    /// Handles of the recognized practices of its exclusive group: a seat holds at
    /// most one of them and repeals the held one first (section 2.2).
    #[serde(default)]
    pub exclusive_with: Vec<String>,
    /// Handles of recognized practices it is in tension with (section 2.2).
    #[serde(default)]
    pub tension_with: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TraitView {
    pub name: String,
    pub description: String,
    pub since: Month,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LineageView {
    pub key: String,
    pub name: String,
    pub population: u64,
    pub traits: Vec<TraitView>,
    pub origin: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BeliefOption {
    pub key: String,
    pub slot: String,
    pub name: String,
    pub description: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReligionView {
    pub key: String,
    pub name: String,
    pub founder: Option<SeatId>,
    pub founded_month: Month,
    pub holy_region: Option<RegionId>,
    pub beliefs: Vec<BeliefOption>,
    pub followers_known: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MovementView {
    pub region: RegionId,
    pub stage: String,
    pub participants: u32,
    pub devotion: i64,
    pub devotion_needed: i64,
    pub next_step: Option<String>,
    pub belief_options: Vec<BeliefOption>,
    pub slots_remaining: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CultureView {
    pub practices: Vec<PracticeCard>,
    pub lineages: Vec<LineageView>,
    pub religions: Vec<ReligionView>,
    pub movement: Option<MovementView>,
    /// Institutional load of the established practices and the capacity of the
    /// offices that carry it (design chapter 39, section 2.3).
    #[serde(default)]
    pub load: InstitutionLoad,
    /// Reforms that may run at once (1-4).
    #[serde(default)]
    pub reform_slots: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct InstitutionLoad {
    pub used: u32,
    pub capacity: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GoodQty {
    pub good: Good,
    /// Base units of the good (rations, tonnes or lots).
    pub amount: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JobSpec {
    pub qual: Option<Qual>,
    /// People per facility level.
    pub count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RecipeView {
    pub key: String,
    pub name: String,
    pub inputs: Vec<GoodQty>,
    pub outputs: Vec<GoodQty>,
    /// Services drawn per level per month at full rate: base units of 0.1 MWh for
    /// shaft and electricity, an index for compute. Inputs and outputs are base
    /// units of goods per level per month.
    pub shaft: i64,
    pub elec: i64,
    pub compute: i64,
    /// Services delivered per level per month at full rate, in the same units.
    #[serde(default)]
    pub out_shaft: i64,
    #[serde(default)]
    pub out_elec: i64,
    #[serde(default)]
    pub out_compute: i64,
    /// Research work delivered per level per month at full staffing (researcher-months), if any.
    #[serde(default)]
    pub research: Option<(ResearchClass, i64)>,
    pub note: String,
    /// Whether the seat meets the method's requirement, so that it can run and can
    /// be chosen with `set_policy` / `method`.
    pub available: bool,
    /// General posts one level needs under this method, in people, before the
    /// saving from shared support ([`FacilityView::scale_saving_bp`]).
    #[serde(default)]
    pub general_posts: u32,
    /// Qualified posts one level needs under this method, in people: the
    /// facility's own and those the method adds. `qual` is the qualification
    /// asked for first.
    #[serde(default)]
    pub skilled_posts: Vec<JobSpec>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FacilityType {
    pub kind: String,
    pub name: String,
    pub category: String,
    pub description: String,
    /// Goods per level, base units.
    pub cost: Vec<GoodQty>,
    /// Worker-months per level before any first-of-kind surcharge.
    pub work: i64,
    /// Posts per level, in people, under the facility's base method: the one that
    /// needs every general post and no added specialists. A method may need fewer
    /// general posts or further qualified ones; each entry of `recipes` states its
    /// own `general_posts` and `skilled_posts`.
    pub jobs: Vec<JobSpec>,
    /// The production methods of the facility that the seat has at least
    /// discovered. Where there are several, `set_policy` / `method` chooses one
    /// per region. For fields these are the ways of working the land, with the
    /// rations one level yields in a month as outputs and the chemicals and fuel
    /// it draws as inputs.
    pub recipes: Vec<RecipeView>,
    pub provides: Vec<String>,
    pub site: String,
    /// Structured site rule: "any", "arable", "pasture", "fishery", "forest", "river", "coast",
    /// "hydro", "deposit:<kind>", "test_node" or "with:<facility>".
    #[serde(default)]
    pub site_key: String,
    /// Highest level any region can hold regardless of site.
    #[serde(default)]
    pub max_level: u16,
    /// Goods per level per month, base units.
    pub upkeep: Vec<GoodQty>,
    pub requirements: Vec<KnownRequirement>,
    pub available: bool,
    pub labor_category: Option<LaborCategory>,
    /// Qualified site crew per level under construction, in people (see
    /// [`BuildSiteView`] for the price as charged in a particular region).
    #[serde(default)]
    pub build_crew: Vec<CrewSpec>,
    /// Shaft service a site draws per level in a month of full work, base units of
    /// 0.1 MWh (1,000 = 100 MWh).
    #[serde(default)]
    pub build_power: i64,
    /// Minimum months of construction before any first-of-kind surcharge.
    #[serde(default)]
    pub build_months: u16,
    /// Building line, stage in it and era of the stage (design chapter 37, section
    /// 8.2; ruleset 3.0 slice 5). Static content, the same for every seat.
    #[serde(default)]
    pub line: String,
    #[serde(default)]
    pub stage: u8,
    #[serde(default)]
    pub era: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CourseType {
    pub key: String,
    pub name: String,
    pub description: String,
    pub months: u16,
    /// Learners per instructor.
    pub class_size: u16,
    pub entrants: Vec<Option<Qual>>,
    pub teachers: Vec<Qual>,
    pub output: Qual,
    pub venue: String,
    pub venue_name: String,
    /// Goods used each month per thousand enrolled learners, base units.
    pub materials: Vec<GoodQty>,
    pub requirements: Vec<KnownRequirement>,
    pub available: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnitTier {
    pub tier: u8,
    pub name: String,
    pub role_names: Vec<(Role, String)>,
    /// Goods to equip a thousand soldiers, base units.
    pub equipment: Vec<GoodQty>,
    /// Goods a thousand soldiers use each month, base units (food is one ration each).
    pub upkeep: Vec<GoodQty>,
    pub training_months: u16,
    pub requirements: Vec<KnownRequirement>,
    pub available: bool,
    /// Equipment generation of design chapter 37, section 2.1 (G0-G7; the six tiers
    /// are G0, G1, G2, G4, G5 and G6).
    #[serde(default)]
    pub generation: u8,
    /// What a maneuver formation needs beside the equipment, per thousand soldiers.
    #[serde(default)]
    pub maneuver_extra: Vec<GoodQty>,
    /// Equipment issued instead when the stores cannot cover `equipment` (bronze for
    /// iron), per thousand soldiers.
    #[serde(default)]
    pub alternative: Vec<GoodQty>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CatalogView {
    pub facilities: Vec<FacilityType>,
    pub courses: Vec<CourseType>,
    pub unit_tiers: Vec<UnitTier>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectView {
    #[serde(default)]
    pub levels: Option<u16>,
    pub id: u32,
    pub kind: String,
    pub title: String,
    pub region: Option<RegionId>,
    pub target: Option<String>,
    /// Work is in worker-months for labour projects and researcher-months for
    /// research, leads and studies; inputs are base units of goods.
    pub work_needed: i64,
    pub work_done: i64,
    pub inputs_needed: Vec<GoodQty>,
    pub inputs_committed: Vec<GoodQty>,
    pub priority: u8,
    pub paused: bool,
    pub started_month: Month,
    pub last_progress: i64,
    pub blockers: Vec<String>,
    pub eta_months_low: Option<u32>,
    pub eta_months_high: Option<u32>,
    /// The qualified site crew the order needs and had reserved last month, in
    /// people. Empty for projects that need none.
    #[serde(default)]
    pub crew: Vec<CrewOnSite>,
    /// Shaft service the site draws in a month of full work, base units of 0.1 MWh.
    #[serde(default)]
    pub site_power: i64,
    /// Share of the site power asked for last month that was delivered, basis points.
    #[serde(default)]
    pub power_bp: u16,
    /// Share of the goods bill committed so far, basis points (the least over the goods).
    #[serde(default)]
    pub goods_bp: u16,
    /// Months the project takes at least (0 where no minimum is recorded).
    #[serde(default)]
    pub min_months: u16,
    /// 0-based place in the construction queue of the region the project is sited
    /// in; absent for projects without a site.
    #[serde(default)]
    pub queue_position: Option<u16>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProgramView {
    pub id: u32,
    pub course: String,
    pub course_name: String,
    pub region: RegionId,
    /// Places booked, learners enrolled and instructors occupied, in people.
    pub seats: u32,
    pub enrolled: u32,
    pub teachers: u32,
    pub progress_months: u16,
    pub months: u16,
    pub graduates_total: u32,
    pub paused: bool,
    pub blockers: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ArmyView {
    pub id: u32,
    pub name: String,
    pub region: RegionId,
    pub soldiers: Vec<(Role, u32)>,
    pub tier: u8,
    pub proficiency_bp: u16,
    pub supply_bp: u16,
    pub morale_bp: u16,
    pub order: String,
    pub target: Option<RegionId>,
    pub training_months_left: u16,
    pub in_battle: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ForeignArmyView {
    pub owner: SeatId,
    pub region: RegionId,
    pub strength_low: u32,
    pub strength_high: u32,
    pub tier_estimate: Option<u8>,
    pub observed_month: Month,
}

/// One clause of a structured treaty. `from` performs, `to` benefits.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Clause {
    /// Deliver goods. `months` = 1 for a single delivery. `amount_per_month` is base units.
    Goods { from: SeatId, good: Good, amount_per_month: i64, months: u16 },
    /// Hand over records and demonstrations of an understood technology.
    Knowledge { from: SeatId, tech: String },
    /// Describe an established practice so the recipient can recognize it.
    Practice { from: SeatId, practice: String },
    /// Share maps and survey records.
    Maps { from: SeatId },
    /// Neither side attacks the other for the duration.
    NonAggression { months: u16 },
    /// Each side answers attacks on the other.
    DefensivePact { months: u16 },
    /// Ends a war between the parties.
    Peace,
    /// `from` accepts the other party as highest authority (federal subordination).
    Subordination { from: SeatId, tribute_bp: u16 },
    /// Transfer sovereignty over a region.
    CedeRegion { from: SeatId, region: RegionId },
    /// `from` lends `count` holders of `qual` (people) to the other party for
    /// `months` months (6 to 240). They leave the lender's regions and labour pool,
    /// live, eat and work in the borrower's regions, and the survivors go home when
    /// the term ends or the lender ends the treaty. If the borrower repudiates the
    /// treaty or the parties go to war, a quarter of the survivors stay behind
    /// without their qualification. Payment is by goods clauses of the same treaty.
    Secondment { from: SeatId, qual: Qual, count: u32, months: u16 },
    /// For `months` months (12 to 240) the `host`'s installation of this kind also
    /// serves the other party: while the treaty is active and the installation ran
    /// at half rate or better the month before, the other party counts as having
    /// access to it. Each party served raises the installation's operating inputs,
    /// upkeep and electric draw by half; an installation serves at most two.
    JointProgramme { host: SeatId, service: ProgrammeService, months: u16 },
}

/// What has become of the experts of one secondment clause.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SecondmentView {
    /// Index of the clause in the treaty's `clauses`.
    pub clause: u16,
    /// People who actually left the lender when the treaty was signed.
    pub sent: u32,
    /// People still owed home (never more than were sent; 0 once it is settled).
    pub owed: u32,
    /// People who came home, and people who stayed behind without their
    /// qualification after a breach.
    pub returned: u32,
    pub lost: u32,
    /// Month in which the survivors are due home.
    pub due_month: Month,
}

/// The state of one joint programme clause.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct JointProgrammeView {
    /// Index of the clause in the treaty's `clauses`.
    pub clause: u16,
    /// Whether the service is being given this month: the treaty is active and the
    /// host's installation ran at half rate or better the month before.
    pub served: bool,
    /// Months in which the host's installation ran below half rate.
    pub shortfalls: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OfferView {
    pub id: u32,
    pub from: SeatId,
    pub to: SeatId,
    pub clauses: Vec<Clause>,
    pub summary: Vec<String>,
    pub text: String,
    pub created_month: Month,
    pub expires_round: u32,
    pub status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TreatyView {
    pub id: u32,
    pub parties: [SeatId; 2],
    pub clauses: Vec<Clause>,
    pub summary: Vec<String>,
    pub signed_month: Month,
    pub ends_month: Option<Month>,
    pub status: String,
    pub performance: Vec<String>,
    /// One entry for each secondment clause of the treaty.
    #[serde(default)]
    pub secondments: Vec<SecondmentView>,
    /// One entry for each joint programme clause of the treaty.
    #[serde(default)]
    pub programmes: Vec<JointProgrammeView>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessageView {
    pub id: u32,
    pub from: SeatId,
    pub to: SeatId,
    pub month: Month,
    pub round: u32,
    pub window: u8,
    pub intent: Option<Intent>,
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChannelView {
    pub seat: SeatId,
    pub selected_by_me: bool,
    pub open: bool,
    pub envelopes_used: u8,
    pub envelopes_limit: u8,
    pub sent_this_window: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiplomacyView {
    pub channels: Vec<ChannelView>,
    pub messages: Vec<MessageView>,
    pub offers: Vec<OfferView>,
    pub treaties: Vec<TreatyView>,
    pub wars: Vec<SeatId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Agenda {
    pub key: String,
    pub title: String,
    pub description: String,
    pub progress: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Check {
    pub label: String,
    pub detail: String,
    pub ok: bool,
    /// For the checks of the jump programme, the base the check belongs to:
    /// "industrial", "scientific", "educational", "logistical" or "service".
    /// Empty for governance checks and on referees older than ruleset 2.0 slice E.
    #[serde(default)]
    pub category: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VictoryView {
    pub governance_months: u32,
    pub governance_needed: u32,
    pub ftl_months: u32,
    pub ftl_needed: u32,
    pub trials: Vec<Month>,
    pub governance_checks: Vec<Check>,
    pub ftl_checks: Vec<Check>,
    pub test_nodes: Vec<RegionId>,
    pub summary: String,
    #[serde(default)]
    pub assemblies_operational: u32,
    #[serde(default)]
    pub deployment_done: bool,
    #[serde(default)]
    pub replacement_done: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ObjectivesView {
    pub agendas: Vec<Agenda>,
    /// Milestones this civilization has actually reached, in order.
    pub milestones: Vec<String>,
    /// Present only once the final objective has been revealed to this seat.
    pub victory: Option<VictoryView>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BriefingItem {
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub region: Option<RegionId>,
    pub panel: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChronicleEntry {
    pub id: u32,
    pub month: Month,
    pub end_month: Option<Month>,
    pub category: MomentCategory,
    pub title: String,
    pub text: String,
    pub region: Option<RegionId>,
    pub epistemic: Epistemic,
    pub evidence: Vec<String>,
    /// Vignette template key and palette seed for the illustrated card.
    pub art: String,
    pub major: bool,
    /// Whether the round recap shows it: at most twelve moments of a round per seat,
    /// by significance; the rest stay in the archive. Era summaries always show.
    #[serde(default)]
    pub recap: bool,
}

// ---------------------------------------------------------------------------
// Spectator view (referee-level disclosure; only for matches with no human seat)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpectatorOutcome {
    pub finished_month: Month,
    pub winner: Option<SeatId>,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpectatorCiv {
    pub seat: SeatId,
    pub name: String,
    pub adjective: String,
    pub color: String,
    pub controller: ControllerKind,
    pub status: SeatStatus,
    pub capital: RegionId,
    pub population: u64,
    pub regions: u16,
    pub understood: u16,
    pub discovered: u16,
    pub practices: u16,
    pub highest_tier: u8,
    pub soldiers: u32,
    pub stability: u8,
    /// Months of food in store at the present population, in thousandths of a month.
    pub food_months_milli: i64,
    pub sci_method: Option<Month>,
    pub planetary: Option<Month>,
    pub interstellar: Option<Month>,
    pub gov_streak: u32,
    pub ftl_streak: u32,
    pub assemblies: u32,
    pub trials: u32,
    pub overlord: Option<SeatId>,
    pub at_war_with: Vec<SeatId>,
    pub goods: Vec<GoodQty>,
    pub research_capacity: i64,
    pub reward: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpectatorArmy {
    pub id: u32,
    pub owner: SeatId,
    pub name: String,
    pub region: RegionId,
    pub soldiers: u32,
    pub roles: Vec<(Role, u32)>,
    pub tier: u8,
    pub in_battle: bool,
    pub target: Option<RegionId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpectatorEvent {
    pub id: u32,
    pub month: Month,
    pub seat: SeatId,
    pub category: MomentCategory,
    pub title: String,
    pub text: String,
    pub region: Option<RegionId>,
    pub art: String,
    pub major: bool,
    pub epistemic: Epistemic,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpectatorView {
    pub match_id: String,
    pub month: Month,
    pub round: u32,
    pub months_per_round: u32,
    pub horizon: Month,
    pub phase: Phase,
    pub window: u8,
    pub outcome: Option<SpectatorOutcome>,
    pub world: WorldFrame,
    pub regions: Vec<RegionView>,
    pub civs: Vec<SpectatorCiv>,
    pub armies: Vec<SpectatorArmy>,
    pub events: Vec<SpectatorEvent>,
    pub test_nodes: Vec<RegionId>,
    #[serde(default)]
    pub date: Option<DateView>,
    #[serde(default)]
    pub calendar: Option<CalendarView>,
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProjectSpec {
    /// Build (or extend by `levels`) a facility.
    Build { region: RegionId, facility: String, levels: u16 },
    /// Investigate a discovered technology until it is understood.
    Research { tech: String },
    /// Send a supplied survey party into a region adjacent to known land.
    Survey { region: RegionId },
    /// Found a camp in a neighbouring unclaimed region with real settlers and stores
    /// (20,000 to 400,000 people).
    Settle { from: RegionId, to: RegionId, people: u32 },
    /// Bounded exploratory study of a known domain; yields evidence, not a chosen node.
    Study { domain: String },
    /// Move people between two governed regions.
    Resettle { from: RegionId, to: RegionId, people: u32 },
    /// Raise and train a formation of 1,000 to 5,000,000 soldiers.
    Recruit { region: RegionId, role: Role, soldiers: u32, tier: u8 },
    /// Advance the local religious movement to its next stage.
    Religion { beliefs: Vec<String>, name: Option<String> },
    /// Conduct a loaded jump round trip with an operational assembly.
    FtlTrial,
    /// Demonstrate transport, maintenance and recovery at the three test nodes.
    FtlDeployment,
    /// Replace one assembly and hand over to a relief crew.
    FtlReplacement,
    /// Revisit study of a rival family's question (design chapter 39, section 1.4):
    /// names a known member of the family by its handle; for 240 months after it
    /// completes, the seat's evidence on that family is no longer held back.
    Revisit { card: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ManageOp {
    Pause,
    Resume,
    Cancel,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ArmyOrder {
    Hold,
    /// Move through governed or friendly territory.
    Move { to: RegionId },
    /// Enter and contest a region; against another civilization this is war.
    Attack { region: RegionId },
    Disband,
    /// Merge into another own army in the same region.
    Merge { into: u32 },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PolicySetting {
    FoodReserveMonths { months: u8 },
    LaborWeight { category: LaborCategory, weight: u8 },
    Mobilization { bp: u16 },
    /// Enable or idle a facility.
    Facility { region: RegionId, facility: String, enabled: bool },
    /// Rename the civilization (cosmetic; history keeps event-time names).
    Rename { name: String },
    MoveCapital { region: RegionId },
    /// Choose the production method of a facility in a region. `method` is the
    /// key of one of the facility type's recipes whose requirement the seat meets
    /// ([`RecipeView::key`] with `available`). A chosen method runs even when its
    /// inputs are short, and reports the shortage. For fields the choice is a
    /// ceiling: the land is worked by the best method not above it whose chemicals
    /// and fuel are in store, and never draws an input the chosen method does not
    /// use. `method: null`, or leaving it out, returns the choice to the works
    /// (automatic). A facility the region does not have, a method that does not
    /// exist and a method the seat cannot yet use are refused alike.
    Method {
        region: RegionId,
        facility: String,
        #[serde(default)]
        method: Option<String>,
    },
    /// Standing war policy toward one seat (design chapter 36, section 2.6). When
    /// both sides of a war have `accept_white_peace_after_months` set, an armistice
    /// (white peace) comes into force once neither side has gained or lost a region
    /// to the other for the longer of the two and of 36 months. `None` withdraws it.
    WarPolicy {
        seat: SeatId,
        #[serde(default)]
        accept_white_peace_after_months: Option<u16>,
        #[serde(default)]
        accept_cession_max: u8,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    SelectContacts { seats: Vec<SeatId> },
    Message { to: SeatId, text: String, intent: Option<Intent> },
    ProposeTreaty { to: SeatId, clauses: Vec<Clause>, text: Option<String> },
    WithdrawOffer { offer: u32 },
    SignTreaty { offer: u32 },
    DeclineOffer { offer: u32 },
    /// Repudiate a treaty. With `notice` on a treaty whose standing clauses are
    /// open-ended (`months: 0`), give notice instead: those clauses end at the close
    /// of the next round and nothing is breached.
    BreakTreaty {
        treaty: u32,
        #[serde(default)]
        notice: bool,
    },
    SetPolicy { setting: PolicySetting },
    /// `priority` is 0..=9 and lower numbers are served first (default 5).
    StartProject { spec: ProjectSpec, priority: Option<u8> },
    /// Pause, resume or cancel a project, and optionally set its `priority` or move
    /// it to `position`, the 0-based place in the construction queue of the region it
    /// is sited in (see [`OwnRegion::construction_queue`]). Moving an order re-sorts
    /// that region's orders only: they exchange priorities and places among
    /// themselves, so orders in other regions are served as before. A project
    /// without a site ignores `position`. To change only the priority or the place
    /// of a running order, send `op: resume`. Pausing an order releases its site crew.
    ManageProject {
        project: u32,
        op: ManageOp,
        priority: Option<u8>,
        #[serde(default)]
        position: Option<u16>,
    },
    Investigate { lead: String },
    ProposeReform { practice: String },
    /// Repeal an enacted practice (design chapter 39, section 2.2): 24 months, then it
    /// returns to recognized. Needed before reforming another member of its
    /// exclusive group.
    Repeal { practice: String },
    /// `seats` are places for learners, in people (1 to 2,000,000).
    StartProgram { region: RegionId, course: String, seats: u32 },
    ManageProgram { program: u32, op: ManageOp, seats: Option<u32> },
    Demolish { region: RegionId, facility: String, levels: u16 },
    MilitaryOrder { army: u32, order: ArmyOrder },
    /// Formally withdraw from the match. Irreversible; the seat scores -1.
    Forfeit,
    /// Add, remove or reorder a standing order (see [`Directive`]).
    Directive {
        op: DirectiveOp,
        #[serde(default)]
        id: Option<u32>,
        #[serde(default)]
        directive: Option<Directive>,
        #[serde(default)]
        position: Option<u16>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Receipt {
    pub round: u32,
    pub month: Month,
    pub action: String,
    /// "accepted", "rejected", "applied", "failed_condition" or "interrupted".
    pub status: String,
    pub code: Option<String>,
    pub reason: String,
    pub created: Option<u32>,
}

/// Envelope used by the HTTP and CLI interfaces.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActionBatch {
    pub seat: SeatId,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub idempotency_key: Option<String>,
    pub actions: Vec<Action>,
}

/// Limits fixed by the diplomacy rules (design chapter 29).
pub const MAX_CONTACTS: usize = 3;
pub const NEGOTIATION_WINDOWS: u8 = 5;
pub const PAIR_ENVELOPES: u8 = 10;
pub const MAX_MESSAGE_CHARS: usize = 2000;
pub const MAX_ACTIONS_PER_BATCH: usize = 32;

/// Victory windows (design chapter 15).
pub const GOVERNANCE_MONTHS: u32 = 96;
pub const FTL_MONTHS: u32 = 24;
pub const TRIAL_WINDOW: u32 = 96;
pub const TRIAL_SPACING: u32 = 12;
