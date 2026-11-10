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
pub const PROTOCOL_VERSION: &str = "bts-protocol/1.2";

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
    /// Storable goods. Quantities on the wire are integer base units: one ration for
    /// food (one person's food for one month, 50 kg grain-equivalent), one tonne for
    /// bulk goods and one standard lot for manufactures. 1,000 base units make one
    /// display unit (see [`UnitsView`] for the unit and mass of each good).
    Good {
    Food => "Food",
    Materials => "Timber, stone and clay",
    Tools => "Tools",
    CopperOre => "Copper ore",
    IronOre => "Iron ore",
    Coal => "Coal",
    Crude => "Crude oil",
    Minerals => "Rare minerals",
    Copper => "Copper",
    Metal => "Structural metal",
    Components => "Mechanical components",
    Conductors => "Conductors",
    Insulation => "Insulation and seals",
    Fuel => "Refined fuel",
    Chemicals => "Chemicals",
    Substrate => "High-purity substrate",
    Electronics => "Electronic devices",
    Hardware => "Computing hardware",
    Spares => "Spare parts",
    Media => "Record media",
    Instruments => "Instruments",
    Medicine => "Medicine and bioproducts",
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

public_enum!(Deposit {
    CopperOre => "Copper ore",
    IronOre => "Iron ore",
    Coal => "Coal",
    Crude => "Crude oil",
    Minerals => "Rare minerals",
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
    pub population: u32,
    pub children: u32,
    pub working_age: u32,
    pub elders: u32,
    pub births_last_round: u32,
    pub deaths_last_round: u32,
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
    /// General-post saving from shared support; not a goods/output multiplier.
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BuildSiteView {
    /// Worker-months per level, including the first-of-kind surcharge where it applies.
    pub work_per_level: i64,
    pub min_months: u16,
    pub kind: String,
    pub max_level: u16,
    pub queued_levels: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OwnRegion {
    #[serde(default)]
    pub construction_sites: Vec<BuildSiteView>,
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
    pub population_low: u32,
    pub population_high: u32,
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
    pub population: u32,
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
    pub followers_known: u32,
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
    pub available: bool,
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
    /// Posts per level, in people.
    pub jobs: Vec<JobSpec>,
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
    pub population: u32,
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
    BreakTreaty { treaty: u32 },
    SetPolicy { setting: PolicySetting },
    /// `priority` is 0..=9 and lower numbers are served first (default 5).
    StartProject { spec: ProjectSpec, priority: Option<u8> },
    ManageProject { project: u32, op: ManageOp, priority: Option<u8> },
    Investigate { lead: String },
    ProposeReform { practice: String },
    /// `seats` are places for learners, in people (1 to 2,000,000).
    StartProgram { region: RegionId, course: String, seats: u32 },
    ManageProgram { program: u32, op: ManageOp, seats: Option<u32> },
    Demolish { region: RegionId, facility: String, levels: u16 },
    MilitaryOrder { army: u32, order: ArmyOrder },
    /// Formally withdraw from the match. Irreversible; the seat scores -1.
    Forfeit,
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
