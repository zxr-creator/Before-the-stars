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

export type Good =
  | 'food' | 'materials' | 'tools' | 'copper_ore' | 'iron_ore' | 'coal' | 'crude' | 'minerals'
  | 'copper' | 'metal' | 'components' | 'conductors' | 'insulation' | 'fuel' | 'chemicals'
  | 'substrate' | 'electronics' | 'hardware' | 'spares' | 'media' | 'instruments' | 'medicine';

export type Qual =
  | 'lorekeeper' | 'artisan' | 'agronomist' | 'tallier' | 'smith' | 'builder' | 'navigator'
  | 'literate' | 'scribe' | 'teacher' | 'scholar' | 'researcher' | 'scientist' | 'mechanic'
  | 'technician' | 'electrician' | 'programmer' | 'physician' | 'ai_engineer' | 'orbital'
  | 'ftl_engineer';

export type Terrain = 'plains' | 'hills' | 'mountains' | 'forest' | 'marsh' | 'steppe' | 'desert' | 'tundra';
export type Deposit = 'copper_ore' | 'iron_ore' | 'coal' | 'crude' | 'minerals';
export type Role = 'assault' | 'maneuver' | 'denial';
export type ResearchClass = 'craft' | 'scholarly' | 'scientific' | 'industrial' | 'advanced' | 'frontier';
export type KnowledgeState = 'hinted' | 'discovered' | 'investigating' | 'understood' | 'prototyped' | 'adopted';
export type PracticeState = 'recognized' | 'reforming' | 'enacted' | 'established';
export type LaborCategory = 'extraction' | 'industry' | 'services' | 'knowledge' | 'construction';
export type Phase = 'contact' | 'negotiate' | 'plan' | 'finished';
export type SeatStatus = 'active' | 'eliminated' | 'forfeited';
export type ControllerKind = 'human' | 'external' | 'native_easy' | 'native_medium' | 'native_hard';
export type Visibility = 'own' | 'visible' | 'remembered';
export type SettlementKind = 'wilderness' | 'camp' | 'village' | 'town' | 'city' | 'metropolis';
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
}

export interface WorldFrame {
  width: number;
  height: number;
  region_count: number;
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
  | { kind: 'ftl_replacement' };

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
  | { kind: 'move_capital'; region: RegionId };

export type Action =
  | { kind: 'select_contacts'; seats: SeatId[] }
  | { kind: 'message'; to: SeatId; text: string; intent: Intent | null }
  | { kind: 'propose_treaty'; to: SeatId; clauses: Clause[]; text: string | null }
  | { kind: 'withdraw_offer'; offer: number }
  | { kind: 'sign_treaty'; offer: number }
  | { kind: 'decline_offer'; offer: number }
  | { kind: 'break_treaty'; treaty: number }
  | { kind: 'set_policy'; setting: PolicySetting }
  | { kind: 'start_project'; spec: ProjectSpec; priority: number | null }
  | { kind: 'manage_project'; project: number; op: ManageOp; priority: number | null; position?: number | null }
  | { kind: 'investigate'; lead: string }
  | { kind: 'propose_reform'; practice: string }
  | { kind: 'start_program'; region: RegionId; course: string; seats: number }
  | { kind: 'manage_program'; program: number; op: ManageOp; seats: number | null }
  | { kind: 'demolish'; region: RegionId; facility: string; levels: number }
  | { kind: 'military_order'; army: number; order: ArmyOrder }
  | { kind: 'forfeit' };

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
  regions?: 24 | 48 | 72;
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
   * coal (1 t for 5 units), then refined fuel (1 t for 10 units). (serde default)
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
