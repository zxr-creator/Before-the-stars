// TypeScript mirror of crates/bts-protocol/src/lib.rs (bts-protocol/1.0).
// Keep this file in lockstep with the Rust source: it is the only place the
// client learns wire shapes from. Nothing here may assume hidden data exists.
//
// Fields the Rust side marks `#[serde(default)]` were added after the first
// 1.0 referee builds. They are typed optional here so the client also works
// against a referee that does not send them yet.

export type SeatId = number;
export type RegionId = number;
export type Month = number;

/** bts-protocol/2.0 (ruleset 3.0): fifty goods; 'minerals' retired. */
export type Good =
  | 'food' | 'materials' | 'tools' | 'copper_ore' | 'iron_ore' | 'coal' | 'crude'
  | 'copper' | 'metal' | 'components' | 'conductors' | 'insulation' | 'fuel' | 'chemicals'
  | 'substrate' | 'electronics' | 'hardware' | 'spares' | 'media' | 'instruments' | 'medicine'
  | 'timber' | 'fibres' | 'horses' | 'salt' | 'spices' | 'precious' | 'tin' | 'saltpetre' | 'gas'
  | 'bauxite' | 'uranium_ore' | 'rare_earths' | 'lithium' | 'cobalt_nickel' | 'quartz' | 'helium'
  | 'aluminium' | 'fertilizer' | 'munitions' | 'magnets' | 'batteries' | 'nuclear_fuel'
  | 'textiles' | 'consumer_goods' | 'fine_wares' | 'lattice' | 'volatiles' | 'propellant' | 'helium3';

export type Qual =
  | 'lorekeeper' | 'artisan' | 'agronomist' | 'tallier' | 'smith' | 'builder' | 'navigator'
  | 'literate' | 'scribe' | 'teacher' | 'scholar' | 'researcher' | 'scientist' | 'mechanic'
  | 'technician' | 'electrician' | 'programmer' | 'physician' | 'ai_engineer' | 'orbital'
  | 'ftl_engineer';

export type Terrain = 'plains' | 'hills' | 'mountains' | 'forest' | 'marsh' | 'steppe' | 'desert' | 'tundra';
/** Climate zone of a region (generator 2.0). */
export type ClimateZone = 'tropical' | 'arid' | 'temperate' | 'continental' | 'polar';
/** Kind of home world (design chapter 37, section 5). */
export type WorldKind = 'earth_like' | 'classic';
/** bts-protocol/2.0: seventeen deposits; 'minerals' retired. */
export type Deposit =
  | 'copper_ore' | 'iron_ore' | 'coal' | 'crude' | 'tin' | 'salt' | 'saltpetre' | 'precious' | 'gas'
  | 'bauxite' | 'uranium_ore' | 'rare_earths' | 'lithium' | 'cobalt_nickel' | 'quartz' | 'volatiles' | 'helium3';
/** Site bonuses of a region (bts-protocol/2.0). */
export type Bonus = 'floodplain' | 'fish_banks' | 'wild_herds' | 'old_growth' | 'rich_pasture';
export type Role = 'assault' | 'maneuver' | 'denial';
export type ResearchClass = 'craft' | 'scholarly' | 'scientific' | 'industrial' | 'advanced' | 'frontier';
export type KnowledgeState = 'hinted' | 'discovered' | 'investigating' | 'understood' | 'prototyped' | 'adopted';
export type PracticeState = 'recognized' | 'reforming' | 'enacted' | 'established';
export type LaborCategory = 'extraction' | 'industry' | 'services' | 'knowledge' | 'construction';
/** Economic sectors of labour productivity (bts-protocol/2.0, ruleset 3.0 slice 6). */
export type Sector = 'food' | 'extraction' | 'industry' | 'services' | 'knowledge' | 'construction';

/** One factor of productivity, named by its source (bts-protocol/2.0). */
export interface FactorView {
  /** "education", "culture", "religion", "technology", "city", "health", "automation" or "land". */
  source: string;
  bp: number;
  detail: string;
}

/** Labour productivity of one sector in a region (bts-protocol/2.0). */
export interface ProductivityView {
  sector: Sector;
  /** Product of the factors (automation excluded), 5,000-40,000 bp. */
  total_bp: number;
  factors: FactorView[];
  posts_saved: number;
}
export type Phase = 'contact' | 'negotiate' | 'plan' | 'finished';
export type SeatStatus = 'active' | 'eliminated' | 'forfeited';
// The referee also knows 'native_expert' (bts-protocol/2.1): the Expert test policy of
// design chapter 39, section 8.3, used by headless calibration only and never offered
// in setup or seen by the client, so it is left out of this union.
export type ControllerKind = 'human' | 'external' | 'native_easy' | 'native_medium' | 'native_hard';
export type Visibility = 'own' | 'visible' | 'remembered';
export type SettlementKind = 'wilderness' | 'camp' | 'village' | 'town' | 'city' | 'metropolis' | 'megalopolis';
export type Intent = 'inquiry' | 'quotation' | 'counteroffer' | 'claim' | 'need' | 'warning' | 'alliance_proposal';
export type Epistemic = 'verified' | 'reported' | 'estimated' | 'forecast' | 'unknown';
export type MomentCategory =
  | 'settlement' | 'subsistence' | 'knowledge' | 'industry' | 'culture' | 'religion' | 'education'
  | 'diplomacy' | 'war' | 'crisis' | 'governance' | 'space' | 'endgame';

// --- Observation -----------------------------------------------------------

export interface Observation {
  protocol_version: string;
  match_id: string;
  seat: SeatId;
  month: Month;
  round: number;
  months_per_round: number;
  horizon: Month;
  phase: Phase;
  /** Negotiation window 1..=5 during `negotiate`, otherwise 0. */
  window: number;
  ready: boolean;
  status: SeatStatus;
  outcome: MatchOutcome | null;
  civ: OwnCiv;
  regions: RegionView[];
  world: WorldFrame;
  others: ForeignCiv[];
  knowledge: KnowledgeView;
  culture: CultureView;
  catalog: CatalogView;
  projects: ProjectView[];
  programs: ProgramView[];
  armies: ArmyView[];
  foreign_armies: ForeignArmyView[];
  diplomacy: DiplomacyView;
  objectives: ObjectivesView;
  briefing: BriefingItem[];
  chronicle: ChronicleEntry[];
  receipts: Receipt[];
  /** bts-protocol/1.2: what one integer step of each quantity means. */
  units?: UnitsView;
  /** Historical date of the current month, from a referee with a calendar (signed year; negative = BC). */
  date?: HistoricalDate | null;
  /** Ruleset 3.0 (bts-protocol/1.3): the round schedule and where this round sits in it. */
  calendar?: CalendarView | null;
  /** Ruleset 3.0: this seat's standing orders, in the order they are evaluated. */
  directives?: DirectiveView[];
  /**
   * The off-world layer (design chapters 37 §6 and 39 §4–5). Not sent yet: the engine will supply
   * it with the space slices (14–15). Until then the client draws static astronomy and shows every
   * site as unclaimed and unsurveyed. Every field is optional.
   */
  space?: SpaceView | null;
}

// --- Off-world layer (supplied by the engine in a later slice) --------------------------------

/** What this seat knows of the Solar System beyond its own planet. */
export interface SpaceView {
  /** The seat's boost (运载力): tonnes its launch system can put into low Earth orbit. */
  boost?: BoostView | null;
  /** Off-world sites as this seat sees them (own, foreign as seen, unclaimed). */
  sites?: SpaceSiteView[];
  /** Stations this seat owns or can see. */
  stations?: StationView[];
  /** Shipments in flight that this seat can see. */
  transfers?: TransferView[];
  /** Next departure windows by logistics zone, when reported. */
  windows?: WindowView[];
  /** Bodies this seat has observed (chapter 37 §6.1); absent = all are drawn. */
  known_bodies?: string[];
}

/** Boost (chapter 39 §4.7): a national stock that does not decay; launch sites stand down at the cap. */
export interface BoostView {
  /** Tonnes in stock. */
  stock: number;
  /** Tonnes the stock may hold. */
  cap: number;
  /** Tonnes made last month. */
  made_last: number;
  /** Tonnes spent last month. */
  spent_last: number;
  by_stage?: BoostStageView[];
  /** Launch failure risk per 1,000 t spent, basis points. */
  failure_rate_bp?: number;
}

export interface BoostStageView {
  /** Launch-chain stage, as a display name. */
  stage: string;
  levels: number;
  made: number;
  standing_down: boolean;
}

/** One of chapter 37's nineteen sites, as this seat sees it. */
export interface SpaceSiteView {
  /** Site key, for example "shackleton_rim" or "arcadia_planitia" (or its number 1–19 as text). */
  site: string;
  /** The site's region id, once sites are regions. */
  region?: RegionId | null;
  owner: SeatId | null;
  controller?: SeatId | null;
  /** True once this seat has surveyed the body. */
  surveyed?: boolean;
  /** Residents (own sites exactly; foreign as estimated). */
  population?: number | null;
  population_low?: number | null;
  population_high?: number | null;
  /** Housing built (residents the habitats hold). */
  housing?: number | null;
  /** Works at the site (facility kind and levels), where visible. */
  works?: { kind: string; level: number }[];
  /** Deposits, after a survey. */
  deposits?: DepositView[];
  /** Autonomy pressure, 0–10,000 (own sites). */
  autonomy_bp?: number | null;
}

/** A station in one of chapter 39's ten orbits. */
export interface StationView {
  id: number;
  /** Orbit key: leo, geo, eml1, eml5, sel2, llo, mars_orbit, ceres_orbit, callisto_orbit, titan_orbit. */
  orbit: string;
  owner: SeatId;
  /** Core stage K1–K4. */
  core?: string | null;
  /** Modules (kind, as a display name), where visible. */
  modules?: { kind: string; level?: number }[];
  /** Crew aboard. */
  aboard?: number | null;
}

/** A shipment between logistics zones (chapter 37 §6.5). */
export interface TransferView {
  id?: number;
  owner?: SeatId | null;
  /** Zone keys: earth_orbit, moon, nea, mars, venus, mercury, belt, jupiter, saturn, neptune. */
  from_zone: string;
  to_zone: string;
  payload_t?: number;
  people?: number;
  /** Propulsion, as a display name. */
  propulsion?: string | null;
  departed: Month;
  arrives: Month;
}

export interface WindowView {
  zone: string;
  open: boolean;
  /** Months until the window opens (0 while open). */
  opens_in: number;
}

/** A historical year: negative is BC, positive AD; there is no year zero. */
export interface HistoricalDate {
  year: number;
  /** Month of the year, 1 (January) to 12 (bts-protocol/1.3). */
  month?: number;
  /** "5000 BC", "AD 1066" (bts-protocol/1.3). */
  label?: string;
}

/** One segment of the round schedule (bts-protocol/1.3). */
export interface CalendarSegment {
  first_round: number;
  last_round: number;
  years_per_round: number;
  /** Historical years (signed, no year zero) at the segment's start and end. */
  from: number;
  to: number;
}

/** The calendar of the match (design chapter 36, section 2.2; bts-protocol/1.3). */
export interface CalendarView {
  /** "standard", "quick" or "fixture". */
  id: string;
  start: HistoricalDate;
  horizon: HistoricalDate;
  horizon_month: Month;
  /** Wins are scored from this date: reward 2 - (T - R)/(H - R), clamped to [1, 2]. */
  reward_reference: HistoricalDate;
  reward_reference_month: Month;
  rounds: number;
  round_months: number;
  round_start: HistoricalDate;
  round_end: HistoricalDate;
  next_round_months: number;
  /** Months the last resolved round lasted: the span of the round totals; 0 before the first. */
  last_round_months: number;
  segments: CalendarSegment[];
}

/** A standing order (design chapter 36, section 2.6; bts-protocol/1.3). */
export type Directive =
  | { kind: 'build_target'; region: RegionId; facility: string; levels: number; priority?: number | null }
  | { kind: 'research_agenda'; techs: string[] }
  | { kind: 'auto_research'; on: boolean }
  | { kind: 'reform_agenda'; practices: string[] }
  | { kind: 'settle_target'; from: RegionId; to: RegionId; people: number; when_crowd_bp: number };

export type DirectiveOp = 'add' | 'remove' | 'move';

export interface DirectiveView {
  id: number;
  directive: Directive;
  /** What happened the last time it was evaluated (empty before then). */
  last_result: string;
  /** "acted", "idle", "skipped" or "" (not yet evaluated). */
  last_status?: string;
  last_month?: Month;
}

/** An epidemic in a region (bts-protocol/1.3). */
export interface OutbreakView {
  since: Month;
  /** 1 (mild) to 3 (severe). */
  severity_band: number;
}

/** Deaths of one cause over the last round (bts-protocol/1.3). */
export interface DeathCount {
  /** "age_and_illness", "hunger_and_crowding", "town_conditions", "epidemic" or "war". */
  cause: string;
  deaths: number;
}

/** A standing war policy toward one seat (bts-protocol/1.3). */
export interface WarPolicyView {
  seat: SeatId;
  accept_white_peace_after_months: number | null;
  accept_cession_max: number;
}

export interface WorldFrame {
  width: number;
  height: number;
  region_count: number;
  /** The map wraps east-west: a polygon may extend past an edge and is drawn again one width over. */
  wrap_x?: boolean;
  kind?: WorldKind | null;
}

export interface MatchOutcome {
  finished_month: Month;
  winner: SeatId | null;
  reason: string;
  reward: number;
}

export interface GoodLine {
  good: Good;
  stock: number;
  produced: number;
  consumed: number;
  traded_in: number;
  traded_out: number;
  capacity: number | null;
  /**
   * What nobody used last round: spoilage, loss in carriage to the common stock and
   * abandoned stores. `produced` is gross output where it was made, so over a round
   * stock change = produced - consumed - lost + traded_in - traded_out.
   * Absent on referees older than ruleset 2.0 slice B.
   */
  lost?: number;
  /**
   * Output the works stood ready to make last round (staffed, supplied and powered)
   * but did not make because the stores of the good were full. Never made and in no
   * stock; it counts only where a rule asks what the works can sustain (the
   * industrial base of the jump programme). Absent before ruleset 2.0 slice E.
   */
  withheld?: number;
}

export interface QualCount {
  qual: Qual;
  count: number;
  employed: number;
}

export interface LaborSummary {
  working_age: number;
  food: number;
  facilities: number;
  projects: number;
  household: number;
  students: number;
  teachers: number;
  soldiers: number;
}

export interface ResearchLine {
  class: ResearchClass;
  capacity: number;
  used: number;
}

export interface Policies {
  food_reserve_months: number;
  labor_weights: [LaborCategory, number][];
  mobilization_bp: number;
  /** bts-protocol/1.3: standing war policies, one per seat they name. */
  war_policies?: WarPolicyView[];
}

export interface FactionView {
  key: string;
  name: string;
  description: string;
  weight_bp: number;
  support: number;
  demand: string;
}

export interface OwnCiv {
  name: string;
  adjective: string;
  color: string;
  capital: RegionId;
  population: number;
  children: number;
  working_age: number;
  elders: number;
  births_last_round: number;
  deaths_last_round: number;
  /** bts-protocol/1.3: the last round's deaths by cause; they add up to `deaths_last_round`. */
  deaths_by_cause?: DeathCount[];
  migration_last_round: number;
  goods: GoodLine[];
  quals: QualCount[];
  labor: LaborSummary;
  research: ResearchLine[];
  policies: Policies;
  factions: FactionView[];
  mobilization_cap_bp: number;
  stability: number;
  admin_capacity: number;
  admin_load: number;
  food_fulfillment_bp: number;
  water_fulfillment_bp: number;
  military_tier: number;
  /** How many more people would currently agree to serve (absent on older referees). */
  recruit_room?: number;
  overlord: SeatId | null;
  subordinates: SeatId[];
}

export interface NeighborLink {
  region: RegionId;
  /** "land", "river", "pass" or "sea". */
  kind: string;
}

export interface DepositView {
  kind: Deposit;
  remaining: number;
  quality_bp: number;
  epistemic: Epistemic;
  /** Gas fields: helium per 10,000 t of gas, to a seat that understands cryogenics. */
  helium_bp?: number | null;
}

export interface BonusView {
  kind: Bonus;
  bp: number;
}

export interface SurveyView {
  arable: number;
  pasture: number;
  wild_food: number;
  fishery: number;
  forest: number;
  water: number;
  hydro: number;
  deposits: DepositView[];
  /** Levels of land fit for spice plantations (bts-protocol/2.0). */
  spice_land?: number;
  bonuses?: BonusView[];
  surveyed_month: Month;
  detailed: boolean;
}

export interface RecipeRun {
  recipe: string;
  name: string;
  /** Achieved share of full output last month, basis points. */
  rate_bp: number;
  blockers: string[];
  /** Goods the recipe ran short of last month. (serde default: absent from older referees) */
  missing?: Good[];
}

export interface FacilityView {
  scale_saving_bp?: number;
  kind: string;
  name: string;
  level: number;
  max_level: number;
  staffed: number;
  staff_needed: number;
  condition_bp: number;
  utilization_bp: number;
  runs: RecipeRun[];
  enabled: boolean;
  /**
   * The production method the seat chose for this facility in this region: the key of one of
   * the facility type's recipes (`RecipeView.key`), set with `set_policy` / `method`. Absent or
   * null while the choice is left to the works. (serde default)
   */
  method?: string | null;
  /**
   * The method the works actually ran last month, chosen or automatic; for fields, the method
   * the land was worked by. (serde default)
   */
  active_method?: string | null;
  /** Posts at the method's base, after shared support, after productivity (bts-protocol/2.0). */
  posts_base?: number;
  posts_after_scale?: number;
  posts_after_productivity?: number;
  productivity_bp?: number;
  /** Land works: one level's yield and its factors. */
  yield_per_level?: number;
  yield_factors?: FactorView[];
}

export interface BlockView {
  lineage: string;
  religion: string | null;
  count: number;
}

export interface PowerView {
  shaft_supply: number;
  shaft_demand: number;
  elec_supply: number;
  elec_demand: number;
  compute_supply: number;
  compute_demand: number;
}

export interface VenueSeats {
  /** Facility kind that provides the places ("lodge", "school", "college", "tech_institute"). */
  venue: string;
  capacity: number;
  reserved: number;
}

export interface OwnRegion {
  construction_sites?: { work_per_level: number; min_months: number; kind: string; max_level: number; queued_levels: number; cost_per_level?: GoodQty[]; crew_per_level?: CrewSpec[]; site_power_per_level?: number; first_of_kind?: boolean }[];
  /** Every project sited in this region, in the order in which it is served. (serde default) */
  construction_queue?: QueueEntry[];
  population: number;
  children: number;
  working_age: number;
  elders: number;
  blocks: BlockView[];
  quals: QualCount[];
  labor: LaborSummary;
  facilities: FacilityView[];
  food_fulfillment_bp: number;
  water_fulfillment_bp: number;
  water_capacity: number;
  health_pressure_bp: number;
  unrest_bp: number;
  transport_level: number;
  link_efficiency_bp: number;
  power: PowerView;
  occupied_since: Month | null;
  /** Teaching places by venue and how many are booked by programmes. (serde default) */
  venues?: VenueSeats[];
  /** The region's shared infrastructure and what it saves or costs its works. (serde default) */
  infrastructure?: InfraView;
  /** Labour productivity by sector (bts-protocol/2.0, ruleset 3.0 slice 6). */
  productivity?: ProductivityView[];
}

export interface ForeignRegion {
  population_low: number;
  population_high: number;
  notable: string[];
}

export interface RegionView {
  id: RegionId;
  name: string;
  poly: [number, number][];
  center: [number, number];
  neighbors: NeighborLink[];
  terrain: Terrain;
  coastal: boolean;
  river: boolean;
  elevation: number;
  visibility: Visibility;
  last_seen: Month;
  owner: SeatId | null;
  controller: SeatId | null;
  settlement: SettlementKind;
  survey: SurveyView | null;
  own: OwnRegion | null;
  foreign: ForeignRegion | null;
  test_node: boolean;
  /** bts-protocol/1.3: an epidemic, seen by the region's government and by seats observing it. */
  outbreak?: OutbreakView | null;
  /** Climate zone (generator 2.0). */
  climate?: ClimateZone | null;
  /** The principal city site and natural harbour (design chapter 38, section 2; public geography). */
  city?: CitySiteView | null;
}

/** Where a region's principal city stands (design chapter 38, section 2.1). */
export interface CitySiteView {
  name: string;
  /** Map position, in the frame of `RegionView.center` (may lie past an edge on a wrapped map). */
  at: [number, number];
  natural_harbour: boolean;
}

export interface ForeignCiv {
  seat: SeatId;
  name: string;
  adjective: string;
  color: string;
  controller: ControllerKind;
  status: SeatStatus;
  contacted: boolean;
  contact_month: Month;
  at_war: boolean;
  overlord: SeatId | null;
  population_low: number;
  population_high: number;
  regions_known: number;
  military_estimate: string;
  observed_tier: number | null;
  trust: number;
  notes: string[];
}

export interface KnownRequirement {
  text: string;
  satisfied: boolean;
  handle: string | null;
}

export interface TechCard {
  handle: string;
  name: string;
  field: string;
  /** "established", "extrapolated" or "fictional". */
  label: string;
  state: KnowledgeState;
  capability: string;
  requirements: string;
  known_requirements: KnownRequirement[];
  unknown_requirements: boolean;
  class: ResearchClass;
  work_needed: number;
  work_done: number;
  source: string;
  discovered_month: Month;
  understood_month: Month | null;
  can_investigate: boolean;
  enables: string[];
  links: string[];
  /** Kind of node: '' for the atlas and doc 37 nodes, else 'side', 'alt', 'dead', 'sealed', 'entry' or 'branch' (bts-protocol/2.1; design chapter 39). */
  kind?: string;
  /** The rival family, only once two of its members are discovered (bts-protocol/2.1). */
  family_view?: FamilyView | null;
  /** Fragile know-how: years since works last used it, while at risk (bts-protocol/2.1). */
  fragile_risk?: number | null;
}

/** Path dependence on a family member's card (bts-protocol/2.1; design chapter 39, 7.2). */
export interface FamilyView {
  family: string;
  /** Handles of the other discovered members. */
  rivals_discovered: string[];
  /** Handle of the member that dominates the installed base, if discovered. */
  incumbent: string | null;
  share_bp: number;
  lock_e_bp: number;
  lock_w_bp: number;
  capped: boolean;
  revisit_cost: number;
  revisit_active: boolean;
}

export interface Lead {
  handle: string;
  title: string;
  detail: string;
  source: string;
  month: Month;
  confidence_bp: number;
  study_work: number;
  class: ResearchClass;
}

export interface StudyDomain {
  key: string;
  name: string;
  description: string;
}

export interface KnowledgeView {
  techs: TechCard[];
  leads: Lead[];
  domains: StudyDomain[];
  scientific_method: boolean;
  /** Investigations the seat may run at once (bts-protocol/2.1). */
  investigation_lines?: number;
}

export interface PracticeCard {
  handle: string;
  name: string;
  group: string;
  state: PracticeState;
  behavior: string;
  requirements: string;
  known_requirements: KnownRequirement[];
  adoption_bp: number;
  can_reform: boolean;
  reform_work: number;
  enables: string[];
  links: string[];
  source: string;
  recognized_month: Month;
  /** Era 0-8, institutional load, exclusive group and tensions (bts-protocol/2.1; design chapter 39, 2.2-2.3). */
  era?: number;
  load?: number;
  exclusive_with?: string[];
  tension_with?: string[];
}

export interface TraitView {
  name: string;
  description: string;
  since: Month;
}

export interface LineageView {
  key: string;
  name: string;
  population: number;
  traits: TraitView[];
  origin: string;
}

export interface BeliefOption {
  key: string;
  slot: string;
  name: string;
  description: string;
}

export interface ReligionView {
  key: string;
  name: string;
  founder: SeatId | null;
  founded_month: Month;
  holy_region: RegionId | null;
  beliefs: BeliefOption[];
  followers_known: number;
}

export interface MovementView {
  region: RegionId;
  stage: string;
  participants: number;
  devotion: number;
  devotion_needed: number;
  next_step: string | null;
  belief_options: BeliefOption[];
  slots_remaining: number;
}

export interface CultureView {
  practices: PracticeCard[];
  lineages: LineageView[];
  religions: ReligionView[];
  movement: MovementView | null;
  /** Institutional load and capacity; reforms that may run at once (bts-protocol/2.1). */
  load?: InstitutionLoad;
  reform_slots?: number;
}

export interface InstitutionLoad {
  used: number;
  capacity: number;
}

export interface GoodQty {
  good: Good;
  amount: number;
}

export interface JobSpec {
  /** null = general labour. */
  qual: Qual | null;
  count: number;
}

export interface RecipeView {
  key: string;
  name: string;
  inputs: GoodQty[];
  outputs: GoodQty[];
  shaft: number;
  elec: number;
  compute: number;
  /** Services delivered per level per month at full rate (milli). (serde default) */
  out_shaft?: number;
  out_elec?: number;
  out_compute?: number;
  /** Research work delivered per level per month at full staffing (milli), if any. (serde default) */
  research?: [ResearchClass, number] | null;
  note: string;
  available: boolean;
  /**
   * General posts one level needs under this method, in people, before the saving from shared
   * support. (serde default)
   */
  general_posts?: number;
  /**
   * Qualified posts one level needs under this method, in people: the facility's own and those
   * the method adds; `qual` is the qualification asked for first. (serde default)
   */
  skilled_posts?: JobSpec[];
}

export interface FacilityType {
  kind: string;
  name: string;
  category: string;
  description: string;
  cost: GoodQty[];
  work: number;
  jobs: JobSpec[];
  recipes: RecipeView[];
  provides: string[];
  site: string;
  /**
   * Structured site rule: "any", "arable", "pasture", "fishery", "forest", "river", "coast",
   * "hydro", "deposit:<kind>", "test_node" or "with:<facility>". (serde default)
   */
  site_key?: string;
  /** Highest level any region can hold regardless of site. (serde default) */
  max_level?: number;
  upkeep: GoodQty[];
  requirements: KnownRequirement[];
  available: boolean;
  labor_category: LaborCategory | null;
  /** Qualified site crew per level under construction, in people. (serde default) */
  build_crew?: CrewSpec[];
  /** Shaft service a site draws per level in a month of full work, base units of 0.1 MWh. (serde default) */
  build_power?: number;
  /** Minimum months of construction before any first-of-kind surcharge. (serde default) */
  build_months?: number;
  /** Building line, stage and era (bts-protocol/2.0; design chapter 37, section 8.2). */
  line?: string;
  stage?: number;
  era?: number;
}

export interface CourseType {
  key: string;
  name: string;
  description: string;
  months: number;
  class_size: number;
  /** null entry = any adult. */
  entrants: (Qual | null)[];
  teachers: Qual[];
  output: Qual;
  venue: string;
  venue_name: string;
  materials: GoodQty[];
  requirements: KnownRequirement[];
  available: boolean;
}

export interface UnitTier {
  tier: number;
  name: string;
  role_names: [Role, string][];
  equipment: GoodQty[];
  upkeep: GoodQty[];
  training_months: number;
  requirements: KnownRequirement[];
  available: boolean;
  /** Equipment generation G0-G7 (bts-protocol/2.0). */
  generation?: number;
  maneuver_extra?: GoodQty[];
  alternative?: GoodQty[];
}

export interface CatalogView {
  facilities: FacilityType[];
  courses: CourseType[];
  unit_tiers: UnitTier[];
}

export interface ProjectView {
  levels?: number | null;
  id: number;
  kind: string;
  title: string;
  region: RegionId | null;
  target: string | null;
  work_needed: number;
  work_done: number;
  inputs_needed: GoodQty[];
  inputs_committed: GoodQty[];
  priority: number;
  paused: boolean;
  started_month: Month;
  last_progress: number;
  blockers: string[];
  eta_months_low: number | null;
  eta_months_high: number | null;
  /** The qualified site crew the order needs and had reserved last month, in people. (serde default) */
  crew?: CrewOnSite[];
  /** Shaft service the site draws in a month of full work, base units of 0.1 MWh. (serde default) */
  site_power?: number;
  /** Share of the site power asked for last month that was delivered, basis points. (serde default) */
  power_bp?: number;
  /** Share of the goods bill committed so far, basis points. (serde default) */
  goods_bp?: number;
  /** Months the project takes at least; 0 where no minimum is recorded. (serde default) */
  min_months?: number;
  /** 0-based place in the construction queue of the region the project is sited in. (serde default) */
  queue_position?: number | null;
}

export interface ProgramView {
  id: number;
  course: string;
  course_name: string;
  region: RegionId;
  seats: number;
  enrolled: number;
  teachers: number;
  progress_months: number;
  months: number;
  graduates_total: number;
  paused: boolean;
  blockers: string[];
}

export interface ArmyView {
  id: number;
  name: string;
  region: RegionId;
  soldiers: [Role, number][];
  tier: number;
  proficiency_bp: number;
  supply_bp: number;
  morale_bp: number;
  order: string;
  target: RegionId | null;
  training_months_left: number;
  in_battle: boolean;
}

export interface ForeignArmyView {
  owner: SeatId;
  region: RegionId;
  strength_low: number;
  strength_high: number;
  tier_estimate: number | null;
  observed_month: Month;
}

/** One clause of a structured treaty. `from` performs, the other party benefits. */
export type Clause =
  | { kind: 'goods'; from: SeatId; good: Good; amount_per_month: number; months: number }
  | { kind: 'knowledge'; from: SeatId; tech: string }
  | { kind: 'practice'; from: SeatId; practice: string }
  | { kind: 'maps'; from: SeatId }
  | { kind: 'non_aggression'; months: number }
  | { kind: 'defensive_pact'; months: number }
  | { kind: 'peace' }
  | { kind: 'subordination'; from: SeatId; tribute_bp: number }
  | { kind: 'cede_region'; from: SeatId; region: RegionId };

export type ClauseKind = Clause['kind'];

/**
 * Cooperation clauses (ruleset 2.0 slice E). They travel in the same `clauses` arrays
 * as `Clause` (same `kind` tag) and are kept as a separate type only so that the
 * panels' exhaustive tables keep compiling until they handle them; a client that
 * reads treaties should accept `AnyClause`.
 */
export type CooperationClause =
  /**
   * `from` lends `count` holders of `qual` (people) for `months` (6-240). They leave
   * the lender's regions, live and work in the borrower's, and the survivors go home
   * at term or when the lender ends the treaty; on the borrower's repudiation or war a
   * quarter stay behind without their qualification. Payment is by goods clauses.
   */
  | { kind: 'secondment'; from: SeatId; qual: Qual; count: number; months: number }
  /**
   * For `months` (12-240) the host's installation also serves the other party while the
   * treaty is active and it ran at half rate or better the month before. Each partner
   * served raises its inputs, upkeep and electric draw by half; at most two partners.
   * `undisclosed` is shown to a seat that has not discovered the installation and is
   * never valid in a proposal.
   */
  | { kind: 'joint_programme'; host: SeatId; service: ProgrammeService; months: number };

/** Every clause a referee of ruleset 2.0 slice E or later may send or accept. */
export type AnyClause = Clause | CooperationClause;

/** A service a host's installation gives a partner under a joint programme clause. */
export type ProgrammeService = 'launch' | 'orbital_yard' | 'high_energy' | 'undisclosed';

/** What has become of the experts of one secondment clause (people). */
export interface SecondmentView {
  /** Index of the clause in the treaty's `clauses`. */
  clause: number;
  /** People who left the lender when the treaty was signed. */
  sent: number;
  /** People still owed home (0 once settled). */
  owed: number;
  /** People who came home, and people who stayed behind without their qualification. */
  returned: number;
  lost: number;
  due_month: Month;
}

/** The state of one joint programme clause. */
export interface JointProgrammeView {
  /** Index of the clause in the treaty's `clauses`. */
  clause: number;
  /** Whether the host serves the other party this month. */
  served: boolean;
  /** Months in which the host's installation ran below half rate. */
  shortfalls: number;
}

export interface OfferView {
  id: number;
  from: SeatId;
  to: SeatId;
  clauses: Clause[];
  summary: string[];
  text: string;
  created_month: Month;
  expires_round: number;
  status: string;
}

export interface TreatyView {
  id: number;
  parties: [SeatId, SeatId];
  clauses: Clause[];
  summary: string[];
  signed_month: Month;
  ends_month: Month | null;
  status: string;
  performance: string[];
  /** One entry for each secondment clause. Absent before ruleset 2.0 slice E. */
  secondments?: SecondmentView[];
  /** One entry for each joint programme clause. Absent before ruleset 2.0 slice E. */
  programmes?: JointProgrammeView[];
}

export interface MessageView {
  id: number;
  from: SeatId;
  to: SeatId;
  month: Month;
  round: number;
  window: number;
  intent: Intent | null;
  text: string;
}

export interface ChannelView {
  seat: SeatId;
  selected_by_me: boolean;
  open: boolean;
  envelopes_used: number;
  envelopes_limit: number;
  sent_this_window: boolean;
}

export interface DiplomacyView {
  channels: ChannelView[];
  messages: MessageView[];
  offers: OfferView[];
  treaties: TreatyView[];
  wars: SeatId[];
}

export interface Agenda {
  key: string;
  title: string;
  description: string;
  progress: string;
}

export interface Check {
  label: string;
  detail: string;
  ok: boolean;
  /**
   * For the checks of the jump programme, the base the check belongs to: 'industrial',
   * 'scientific', 'educational', 'logistical' or 'service'. Empty for governance
   * checks; absent before ruleset 2.0 slice E.
   */
  category?: string;
}

export interface VictoryView {
  governance_months: number;
  governance_needed: number;
  ftl_months: number;
  ftl_needed: number;
  trials: Month[];
  governance_checks: Check[];
  ftl_checks: Check[];
  test_nodes: RegionId[];
  summary: string;
  /** (serde default: absent from older referees) */
  assemblies_operational?: number;
  deployment_done?: boolean;
  replacement_done?: boolean;
}

export interface ObjectivesView {
  agendas: Agenda[];
  milestones: string[];
  /** Present only once the final objective has been revealed to this seat. */
  victory: VictoryView | null;
}

export interface BriefingItem {
  severity: string;
  title: string;
  detail: string;
  region: RegionId | null;
  panel: string;
}

export interface ChronicleEntry {
  id: number;
  month: Month;
  end_month: Month | null;
  category: MomentCategory;
  title: string;
  text: string;
  region: RegionId | null;
  epistemic: Epistemic;
  evidence: string[];
  /** Vignette template key and palette seed, "key:n". */
  art: string;
  major: boolean;
  /** bts-protocol/1.3: shown in the round recap (at most twelve moments a round, plus the era summary). */
  recap?: boolean;
}

// --- Actions ---------------------------------------------------------------

export type ProjectSpec =
  | { kind: 'build'; region: RegionId; facility: string; levels: number }
  | { kind: 'research'; tech: string }
  | { kind: 'survey'; region: RegionId }
  | { kind: 'settle'; from: RegionId; to: RegionId; people: number }
  | { kind: 'study'; domain: string }
  | { kind: 'resettle'; from: RegionId; to: RegionId; people: number }
  | { kind: 'recruit'; region: RegionId; role: Role; soldiers: number; tier: number }
  | { kind: 'religion'; beliefs: string[]; name: string | null }
  | { kind: 'ftl_trial' }
  | { kind: 'ftl_deployment' }
  | { kind: 'ftl_replacement' }
  /** Revisit study of a rival family's question (bts-protocol/2.1). */
  | { kind: 'revisit'; card: string };

export type ManageOp = 'pause' | 'resume' | 'cancel';

export type ArmyOrder =
  | { kind: 'hold' }
  | { kind: 'move'; to: RegionId }
  | { kind: 'attack'; region: RegionId }
  | { kind: 'disband' }
  | { kind: 'merge'; into: number };

export type PolicySetting =
  | { kind: 'food_reserve_months'; months: number }
  | { kind: 'labor_weight'; category: LaborCategory; weight: number }
  | { kind: 'mobilization'; bp: number }
  | { kind: 'facility'; region: RegionId; facility: string; enabled: boolean }
  | { kind: 'rename'; name: string }
  | { kind: 'move_capital'; region: RegionId }
  /**
   * Choose the production method of a facility in a region: the key of one of the facility
   * type's recipes that is `available`. For fields the choice is a ceiling. `method` null or
   * absent returns the choice to the works.
   */
  | { kind: 'method'; region: RegionId; facility: string; method?: string | null }
  /** bts-protocol/1.3: accept a white peace with `seat` after this many months of unchanged lines (null withdraws). */
  | { kind: 'war_policy'; seat: SeatId; accept_white_peace_after_months?: number | null; accept_cession_max?: number };

export type Action =
  | { kind: 'select_contacts'; seats: SeatId[] }
  | { kind: 'message'; to: SeatId; text: string; intent: Intent | null }
  | { kind: 'propose_treaty'; to: SeatId; clauses: AnyClause[]; text: string | null }
  | { kind: 'withdraw_offer'; offer: number }
  | { kind: 'sign_treaty'; offer: number }
  | { kind: 'decline_offer'; offer: number }
  /** With `notice` (bts-protocol/1.3) on a treaty with open-ended clauses: they end with the next round, nothing breached. */
  | { kind: 'break_treaty'; treaty: number; notice?: boolean }
  | { kind: 'set_policy'; setting: PolicySetting }
  | { kind: 'start_project'; spec: ProjectSpec; priority: number | null }
  | { kind: 'manage_project'; project: number; op: ManageOp; priority: number | null; position?: number | null }
  | { kind: 'investigate'; lead: string }
  | { kind: 'propose_reform'; practice: string }
  /** Repeal an enacted practice (bts-protocol/2.1). */
  | { kind: 'repeal'; practice: string }
  | { kind: 'start_program'; region: RegionId; course: string; seats: number }
  | { kind: 'manage_program'; program: number; op: ManageOp; seats: number | null }
  | { kind: 'demolish'; region: RegionId; facility: string; levels: number }
  | { kind: 'military_order'; army: number; order: ArmyOrder }
  | { kind: 'forfeit' }
  /** bts-protocol/1.3: add, remove or reorder a standing order. */
  | { kind: 'directive'; op: DirectiveOp; id?: number | null; directive?: Directive | null; position?: number | null };

export interface Receipt {
  round: number;
  month: Month;
  action: string;
  /** "accepted", "rejected", "applied", "failed_condition" or "interrupted". */
  status: string;
  code: string | null;
  reason: string;
  created: number | null;
}

export interface ActionBatch {
  seat: SeatId;
  token: string;
  idempotency_key?: string | null;
  actions: Action[];
}

// --- Limits fixed by the rules ------------------------------------------------

export const MAX_CONTACTS = 3;
export const NEGOTIATION_WINDOWS = 5;
export const PAIR_ENVELOPES = 10;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_ACTIONS_PER_BATCH = 32;
export const GOVERNANCE_MONTHS = 96;
export const FTL_MONTHS = 24;

// --- Server envelope types (crates/bts-server; not part of bts-protocol) -------

export interface SeatSummary {
  seat: SeatId;
  name: string;
  color: string;
  controller: ControllerKind;
  status: SeatStatus;
  /** Domains this seat has delegated to a steward. */
  delegates?: string[];
  token?: string;
  /** Present (non-null) when an LLM agent plays this seat. (newer referees) */
  agent?: AgentInfo | null;
}

export type AgentState = 'idle' | 'thinking' | 'error' | 'stopped';

export interface AgentInfo {
  provider: string;
  model: string;
  consult_every: number;
  state: AgentState;
  last_note: string;
  calls: number;
  /** "error" = the agent failed and will be tried again next round; "stopped" = the steward carries on alone. */
  last_error: string | null;
  /** Seconds the agent has been thinking, while `state` is "thinking". */
  thinking_seconds?: number | null;
}

export interface MatchSummary {
  /** Historical date of the current month, from a referee with a calendar (signed year; negative = BC). */
  date?: HistoricalDate | null;
  /** bts-protocol/1.3: the round schedule. */
  calendar?: CalendarView | null;
  exists: boolean;
  match_id?: string;
  seed?: string;
  regions?: number;
  round?: number;
  month?: Month;
  months_per_round?: number;
  horizon?: Month;
  phase?: Phase;
  window?: number;
  finished?: boolean;
  winner?: SeatId | null;
  disclosed_objective?: boolean;
  waiting_on?: SeatId[];
  seats?: SeatSummary[];
  versions?: string[];
  /** Domains a human or external seat may hand to a steward (POST /api/delegate). */
  steward_domains?: string[];
  /** True when no seat is human: the client is a spectator console. (newer referees) */
  observer_allowed?: boolean;
  /** Observer matches: the referee keeps resolving rounds until this round is reached. */
  autoplay_until?: number;
  /** True when the referee runs as a desktop-style app and may be shut down from the menu. */
  app_mode?: boolean;
}

export type AgentProvider = 'claude-api' | 'claude-code' | 'codex' | 'openai-api';
export type SetupController = 'human' | 'external' | 'easy' | 'medium' | 'hard' | AgentProvider;

export interface AgentOptions {
  model?: string;
  /** The agent is consulted every N rounds; a built-in steward runs the seat in between. */
  consult_every?: number;
  /** Kept in server memory only. Never stored by the client. */
  api_key?: string;
  base_url?: string;
  effort?: string;
}

export interface NewMatchRequest {
  seed?: string;
  /** Map preset (design chapter 40): Small 30, Standard 60, Large 120, Huge 200; 90 is a test size; 24/48/72 earlier sizes. */
  regions?: 30 | 60 | 90 | 120 | 200 | 24 | 48 | 72;
  /** "earth_like" (the default generated planet) or "classic" (the flat map of ruleset 2.0). */
  world?: WorldKind;
  /** "standard" (525 rounds, 5000 BC to AD 2500) or "quick" (230 rounds on the same dates). */
  calendar?: 'standard' | 'quick';
  /** A fixture clock of twelve-month rounds ending at this month (tests); overrides `calendar`. */
  horizon?: number;
  pace_bp?: number;
  controllers?: SetupController[];
  disclosed_objective?: boolean;
  /** Per-seat LLM agent settings, keyed by seat index as a string. */
  agent_options?: Record<string, AgentOptions>;
}

// --- Observer (spectator) mode: GET /api/spectator, POST /api/advance, GET /api/agent-log ---

export interface SpectatorCiv {
  seat: SeatId;
  name: string;
  adjective: string;
  color: string;
  /** Controller kind as the referee names it; LLM agent seats are identified by `MatchSummary.seats[].agent`. */
  controller: string;
  status: SeatStatus;
  capital: RegionId;
  population: number;
  regions: number;
  understood: number;
  discovered: number;
  practices: number;
  highest_tier: number;
  soldiers: number;
  stability: number;
  food_months_milli: number;
  sci_method: Month | null;
  planetary: Month | null;
  interstellar: Month | null;
  gov_streak: number;
  ftl_streak: number;
  assemblies: number;
  trials: number;
  overlord: SeatId | null;
  at_war_with: SeatId[];
  goods: GoodQty[];
  research_capacity: number;
  reward: number | null;
}

export interface SpectatorArmy {
  id: number;
  owner: SeatId;
  name: string;
  region: RegionId;
  soldiers: number;
  tier: number;
  in_battle: boolean;
  target: RegionId | null;
}

export interface SpectatorEvent {
  id: number;
  month: Month;
  seat: SeatId;
  category: MomentCategory;
  title: string;
  text: string;
  region: RegionId | null;
  art: string;
  major: boolean;
  epistemic: Epistemic;
}

export interface SpectatorOutcome {
  finished_month: Month;
  winner: SeatId | null;
  reason: string;
}

export interface SpectatorView {
  /** Historical date of the current month, from a referee with a calendar (signed year; negative = BC). */
  date?: HistoricalDate | null;
  /** bts-protocol/1.3: the round schedule. */
  calendar?: CalendarView | null;
  match_id: string;
  month: Month;
  round: number;
  months_per_round: number;
  horizon: Month;
  phase: Phase;
  window: number;
  outcome: SpectatorOutcome | null;
  world: WorldFrame;
  /** Every region, fully visible, with the true owner; `own` is filled for every controlled region. */
  regions: RegionView[];
  civs: SpectatorCiv[];
  armies: SpectatorArmy[];
  /** Newest last, up to about 300. */
  events: SpectatorEvent[];
  test_nodes: RegionId[];
}

export interface AgentLogEntry {
  round: number;
  month: Month;
  phase: string;
  note: string;
  actions: string[];
  accepted: number;
  rejected: number;
  duration_ms: number;
  error: string | null;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// bts-protocol/1.2 (ruleset bts-rules/2.0.0): scale and units
// ---------------------------------------------------------------------------
//
// Head counts everywhere in the protocol are real people: populations, labour,
// qualification holders, `JobSpec.count`, soldiers, and programme `seats`,
// `enrolled` and `teachers` (these were small integers before 1.2 and are now
// in the thousands and millions). Goods, work, research and services are
// integer base units; 1,000 base units make one display unit. Catalog amounts
// stated per person (`CourseType.materials`, `UnitTier.equipment` and
// `UnitTier.upkeep`) are per thousand people.

/** Unit and mass of one base unit of a good. */
export interface GoodUnit {
  good: Good;
  /** "t" (tonne), "ration" or "lot". */
  unit: string;
  /** Mass of one base unit in kilograms, i.e. thousandths of a tonne. */
  tonnes_per_unit_milli: number;
}

/** The unit system of the running ruleset, so a client need not hard-code scale. */
export interface UnitsView {
  /** Food base units (rations) one resident or soldier eats in a month. */
  food_per_person_month: number;
  /** Base units per display unit for goods, work, research and services. */
  display_divisor: number;
  goods: GoodUnit[];
  /** What one base unit of project work is ("worker-month"). */
  work_unit: string;
  /** What one base unit of research work is ("researcher-month"). */
  research_unit: string;
  /** What one base unit of shaft or electric service is. */
  service_unit: string;
  /** Lower bound, in residents, of each settlement class in ascending order. */
  settlement_bounds: [SettlementKind, number][];
  /** Bounds on orders that name a number of people. */
  limits?: PeopleLimits;
}

/** Bounds, in people, on the orders that name a head count. */
export interface PeopleLimits {
  /** A settling party (`settle`). */
  settlers_min: number;
  settlers_max: number;
  /** A formation (`recruit`). */
  soldiers_min: number;
  soldiers_max: number;
  /** Places one programme may book (`start_program`, `manage_program`). */
  program_seats_max: number;
  /** Learners a founding cohort can hold while nobody qualified can teach it. */
  founding_cohort_max: number;
}

// ---------------------------------------------------------------------------
// Construction quotes and regional queues (ruleset 2.0, slice C)
// ---------------------------------------------------------------------------

/** One group of a qualified site crew: `count` people who hold any of `quals`. */
export interface CrewSpec {
  /** Acceptable qualifications, most preferred first. */
  quals: Qual[];
  /** People. */
  count: number;
}

/** One group of a site crew as it stood last month. */
export interface CrewOnSite {
  /** Acceptable qualifications, most preferred first. */
  quals: Qual[];
  /** People the order needs in this group, and people reserved for it last month. */
  needed: number;
  on_site: number;
}

/**
 * The true price of one level of a facility in one region, as charged if ordered
 * now (the element type of `OwnRegion.construction_sites`). An order of `n` levels
 * is charged exactly `n` times the goods, work, crew and site power and takes the
 * same minimum months.
 */
export interface BuildSiteView {
  /** Worker-months per level, including the first-of-kind surcharge where it applies. */
  work_per_level: number;
  /** Months the order takes at least, including the first-of-kind surcharge. */
  min_months: number;
  kind: string;
  max_level: number;
  queued_levels: number;
  /** Goods per level, base units (rations, tonnes or lots). (serde default) */
  cost_per_level?: GoodQty[];
  /** Qualified site crew per level, in people; reserved while the order is active. (serde default) */
  crew_per_level?: CrewSpec[];
  /**
   * Shaft service the site draws per level in a month of full work, base units of
   * 0.1 MWh. Taken from the region's shaft supply, then from site engines burning
   * coal (1 t for 5 units), then refined fuel (1 t for 10 units), but never the month
   * of fuel that mechanized fields and motor boats must find in store. (serde default)
   */
  site_power_per_level?: number;
  /** True when the seat has no installation of this kind: work and months are half as much again. (serde default) */
  first_of_kind?: boolean;
}

/** One order in a region's construction queue, in the order of service. */
export interface QueueEntry {
  /** Project id, as in `ProjectView.id` and `manage_project`. */
  project: number;
  /** 0-based place in the region's service order; `manage_project` with `position` moves it. */
  position: number;
  /** Project kind, as in `ProjectView.kind`. */
  kind: string;
  title: string;
  /** Facility kind for a build order. */
  facility: string | null;
  /** Levels a build order adds. */
  levels: number | null;
  priority: number;
  paused: boolean;
  /** Share of the work done, basis points. */
  progress_bp: number;
  /** The qualified site crew: needed and reserved last month, in people. */
  crew: CrewOnSite[];
  /** Share of the site power asked for last month that was delivered, basis points. */
  power_bp: number;
  /** Share of the goods bill committed so far, basis points. */
  goods_bp: number;
  /** What the order was short of last month, in words; empty when nothing held it back. */
  waiting_for: string[];
  eta_months_low: number | null;
  eta_months_high: number | null;
}

/**
 * A region's shared infrastructure and the economies of scale it carries (ruleset 2.0 slice D;
 * docs/units-and-scale.md section 7). Every figure is a saving of overhead or a loss in
 * carriage; none raises what a recipe puts out. Capacity, load and the rates are those that
 * apply in the coming month with the works as they stand; the quantities are last month's.
 */
export interface InfraView {
  /** Facility levels of industry, extraction and power the region's transport grade can serve. */
  freight_capacity: number;
  /** Enabled facility levels of industry, extraction and power in the region. */
  freight_load: number;
  /** Share of the load the transport can serve, basis points (10,000 within capacity). */
  infra_bp: number;
  /** The most shared support can save of a works' general posts here, basis points (2,000 scaled by `infra_bp`). */
  support_saving_cap_bp: number;
  /** Share of the spares and tools upkeep of the region's other industrial, extractive and power works that its repair works save, basis points (at most 1,500). */
  maintenance_saving_bp: number;
  /** Further share of the output sent to the common stock that congested freight loses, basis points (at most 2,000; the capital included). */
  congestion_loss_bp: number;
  /** Output of last month that paid no carriage loss because works of the same region took as much of that good as inputs: base units by good. */
  chain_exempt: GoodQty[];
  /** The carriage loss that exemption avoided last month, base units by good. */
  chain_loss_saved: GoodQty[];
}
