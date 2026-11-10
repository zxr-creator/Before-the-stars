//! Authoritative world state. Nothing in this module is ever sent to a seat;
//! `observe.rs` projects it into seat-specific observations.

use crate::content::{content, Cap, ReqCtx, Tag};
use bts_protocol::*;
use serde::{Deserialize, Serialize};

pub const NG: usize = Good::COUNT;
pub const NQ: usize = Qual::COUNT;
pub const AGES: usize = 81;
pub const WORK_MIN_AGE: usize = 15;
pub const WORK_MAX_AGE: usize = 64;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MatchConfig {
    pub seed: String,
    pub regions: u16,
    pub horizon: Month,
    pub months_per_round: u32,
    /// Research and construction work multiplier in basis points (10000 = standard).
    pub pace_bp: u32,
    pub controllers: Vec<ControllerKind>,
    /// When true the complete victory contract is shown from the first round.
    pub disclosed_objective: bool,
    /// When true the world secret is derived only from the seed label (replayable public world).
    pub public_seed: bool,
}

impl Default for MatchConfig {
    fn default() -> Self {
        MatchConfig {
            seed: "riverland".into(),
            regions: 48,
            horizon: 2880,
            months_per_round: 12,
            pace_bp: 10_000,
            controllers: vec![
                ControllerKind::Human,
                ControllerKind::NativeMedium,
                ControllerKind::NativeMedium,
                ControllerKind::NativeMedium,
            ],
            disclosed_objective: false,
            public_seed: true,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum LinkKind {
    Land,
    River,
    Pass,
    Sea,
}

impl LinkKind {
    pub fn key(self) -> &'static str {
        match self {
            LinkKind::Land => "land",
            LinkKind::River => "river",
            LinkKind::Pass => "pass",
            LinkKind::Sea => "sea",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DepositState {
    pub kind: Deposit,
    pub remaining: i64,
    pub quality_bp: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PopBlock {
    pub lineage: u16,
    pub religion: Option<u16>,
    #[serde(with = "ages_serde")]
    pub ages: [u32; AGES],
    /// Family-formation intensity (basis points) for the last nine months; index 0 is oldest.
    pub birth_hist: [u16; 9],
    pub birth_rem: i64,
    pub death_rem: [i64; 6],
}

mod ages_serde {
    use super::AGES;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    pub fn serialize<S: Serializer>(v: &[u32; AGES], s: S) -> Result<S::Ok, S::Error> {
        v.to_vec().serialize(s)
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u32; AGES], D::Error> {
        let v = Vec::<u32>::deserialize(d)?;
        let mut out = [0u32; AGES];
        for (i, x) in v.into_iter().take(AGES).enumerate() {
            out[i] = x;
        }
        Ok(out)
    }
}

impl PopBlock {
    pub fn new(lineage: u16, religion: Option<u16>) -> Self {
        PopBlock { lineage, religion, ages: [0; AGES], birth_hist: [7000; 9], birth_rem: 0, death_rem: [0; 6] }
    }
    pub fn total(&self) -> u32 {
        self.ages.iter().sum()
    }
    pub fn working(&self) -> u32 {
        self.ages[WORK_MIN_AGE..=WORK_MAX_AGE].iter().sum()
    }
    pub fn children(&self) -> u32 {
        self.ages[..WORK_MIN_AGE].iter().sum()
    }
    pub fn elders(&self) -> u32 {
        self.ages[WORK_MAX_AGE + 1..].iter().sum()
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RunStat {
    pub recipe: usize,
    pub rate_bp: u16,
    /// Bit flags: 1 staff, 2 skills, 4 inputs, 8 shaft, 16 electricity, 32 compute, 64 condition, 128 storage full, 256 deposit, 512 unrest.
    pub blockers: u16,
    pub missing: Vec<Good>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Facility {
    pub kind: usize,
    pub level: u16,
    pub condition_bp: u16,
    pub enabled: bool,
    /// Posts filled and posts required last month, in people.
    pub staffed: u32,
    pub staff_needed: u32,
    pub skilled_bp: u16,
    pub run: Option<RunStat>,
    pub operated: bool,
    /// Progress toward the next jump assembly, in thousandths, for assembly lines.
    pub assembly_progress: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RegionMonth {
    pub labor: LaborSummary,
    pub shaft_supply: i64,
    pub shaft_demand: i64,
    pub elec_supply: i64,
    pub elec_demand: i64,
    pub compute_supply: i64,
    pub compute_demand: i64,
    /// Rations.
    pub food_made: i64,
    pub qual_employed: Vec<u32>,
    pub tag_staff: Vec<u32>,
    /// Worker-months of called-up labour not yet assigned to a project this month.
    pub project_labor_free: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Region {
    pub id: RegionId,
    pub name: String,
    pub poly: Vec<[i32; 2]>,
    pub center: [i32; 2],
    pub neighbors: Vec<(RegionId, LinkKind)>,
    pub terrain: Terrain,
    pub coastal: bool,
    pub river: bool,
    pub elevation: u8,
    pub arable: u16,
    pub pasture: u16,
    /// Wild food the land yields per month at most, in rations.
    pub wild: i64,
    pub fishery: u16,
    pub forest: u16,
    /// Residents the natural water supply supports.
    pub water: u32,
    pub hydro: u16,
    pub deposits: Vec<DepositState>,
    pub owner: Option<SeatId>,
    pub controller: Option<SeatId>,
    pub blocks: Vec<PopBlock>,
    /// Holders of each qualification resident here, in people.
    pub quals: [u32; NQ],
    pub facilities: Vec<Facility>,
    pub nutrition_debt: i64,
    pub health_bp: u16,
    pub unrest_bp: u16,
    pub food_hist: [u16; 12],
    pub water_hist: [u16; 12],
    pub capture: Option<(SeatId, u8)>,
    pub occupied_since: Option<Month>,
    pub last: RegionMonth,
    pub students: u32,
    pub teachers: [u32; NQ],
    pub migr_rem: i64,
}

impl Region {
    pub fn population(&self) -> u32 {
        self.blocks.iter().map(|b| b.total()).sum()
    }
    pub fn working(&self) -> u32 {
        self.blocks.iter().map(|b| b.working()).sum()
    }
    pub fn children(&self) -> u32 {
        self.blocks.iter().map(|b| b.children()).sum()
    }
    pub fn elders(&self) -> u32 {
        self.blocks.iter().map(|b| b.elders()).sum()
    }
    pub fn fac(&self, kind: usize) -> Option<&Facility> {
        self.facilities.iter().find(|f| f.kind == kind)
    }
    pub fn fac_mut(&mut self, kind: usize) -> Option<&mut Facility> {
        self.facilities.iter_mut().find(|f| f.kind == kind)
    }
    pub fn fac_level(&self, key: &str) -> u16 {
        let k = content().f(key);
        self.fac(k).map(|f| f.level).unwrap_or(0)
    }
    /// Capacity provided by enabled facilities in adequate condition.
    pub fn cap(&self, cap: Cap) -> i64 {
        let c = content();
        let mut total = 0;
        for f in &self.facilities {
            if !f.enabled {
                continue;
            }
            for (k, v) in &c.facilities[f.kind].provides {
                if *k == cap {
                    total += v * f.level as i64 * (f.condition_bp as i64).max(3000) / 10_000;
                }
            }
        }
        total
    }
    pub fn deposit(&self, d: Deposit) -> Option<&DepositState> {
        self.deposits.iter().find(|x| x.kind == d)
    }
    pub fn settlement(&self) -> SettlementKind {
        settlement_class(self.population())
    }
    pub fn avg_bp(hist: &[u16; 12]) -> u16 {
        (hist.iter().map(|v| *v as u32).sum::<u32>() / 12) as u16
    }
}

/// Lower bound, in residents, of each settlement class (units chapter, section 3).
/// The classes are descriptive: no rule keys on them.
pub const SETTLEMENT_BOUNDS: [(SettlementKind, u32); 6] = [
    (SettlementKind::Wilderness, 0),
    (SettlementKind::Camp, 1),
    (SettlementKind::Village, 150_000),
    (SettlementKind::Town, 1_000_000),
    (SettlementKind::City, 4_000_000),
    (SettlementKind::Metropolis, 12_000_000),
];

/// Residents at which a region counts as urban for cultural drift.
pub const URBAN_RESIDENTS: u32 = 2_000_000;

pub fn settlement_class(residents: u32) -> SettlementKind {
    let mut kind = SettlementKind::Wilderness;
    for (k, lower) in SETTLEMENT_BOUNDS {
        if residents >= lower {
            kind = k;
        }
    }
    kind
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TechSt {
    /// 0 unknown, then `KnowledgeState` index + 1.
    pub state: u8,
    pub evidence: i64,
    pub work: i64,
    pub discount_bp: u16,
    pub source: String,
    pub disc_month: Month,
    pub und_month: Month,
}

pub const ST_UNKNOWN: u8 = 0;
pub const ST_HINTED: u8 = 1;
pub const ST_DISCOVERED: u8 = 2;
pub const ST_INVESTIGATING: u8 = 3;
pub const ST_UNDERSTOOD: u8 = 4;
pub const ST_PROTOTYPED: u8 = 5;
pub const ST_ADOPTED: u8 = 6;

pub fn knowledge_state(s: u8) -> Option<KnowledgeState> {
    if s == 0 {
        None
    } else {
        Some(KnowledgeState::from_index((s - 1) as usize))
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PracSt {
    /// 0 unknown, 1 recognized, 2 reforming, 3 enacted.
    pub state: u8,
    pub evidence: i64,
    pub adoption_bp: u16,
    pub source: String,
    pub rec_month: Month,
}

pub const ESTABLISHED_BP: u16 = 2500;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum ProjKind {
    Build { facility: usize, levels: u16 },
    Research { tech: usize },
    LeadStudy { tech: usize },
    Survey { region: RegionId },
    Settle { from: RegionId, to: RegionId, people: u32 },
    Study { tag: usize },
    Resettle { from: RegionId, to: RegionId, people: u32 },
    Recruit { role: Role, soldiers: u32, tier: u8 },
    Reform { practice: usize },
    Religion { beliefs: Vec<String>, name: Option<String> },
    FtlTrial,
    FtlDeployment,
    FtlReplacement,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: u32,
    pub kind: ProjKind,
    pub region: Option<RegionId>,
    /// Worker-months, or researcher-months for research, leads and studies.
    pub work_needed: i64,
    pub work_done: i64,
    /// `(good, needed, committed)` in base units.
    pub inputs: Vec<(Good, i64, i64)>,
    pub priority: u8,
    pub paused: bool,
    pub started: Month,
    pub last_progress: i64,
    pub blockers: Vec<String>,
    pub max_per_month: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Program {
    pub id: u32,
    pub course: usize,
    pub region: RegionId,
    /// Places booked, learners enrolled and instructors occupied, in people.
    pub seats: u32,
    pub enrolled: u32,
    pub entrant: Option<Qual>,
    pub teachers: u32,
    pub teacher_qual: Option<Qual>,
    pub progress: u16,
    pub duration: u16,
    pub graduates: u32,
    pub paused: bool,
    pub blockers: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Army {
    pub id: u32,
    pub owner: SeatId,
    pub name: String,
    pub region: RegionId,
    pub soldiers: [u32; 3],
    pub tier: u8,
    pub proficiency_bp: u16,
    pub supply_bp: u16,
    pub morale_bp: u16,
    pub order: ArmyOrder,
    pub training_left: u16,
    pub in_battle: bool,
    pub move_progress: u8,
    pub initial: u32,
}

impl Army {
    pub fn count(&self) -> u32 {
        self.soldiers.iter().sum()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Offer {
    pub id: u32,
    pub from: SeatId,
    pub to: SeatId,
    pub clauses: Vec<Clause>,
    pub text: String,
    pub created: Month,
    pub expires_round: u32,
    /// "open", "signed", "declined", "withdrawn", "expired"
    pub status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Treaty {
    pub id: u32,
    pub parties: [SeatId; 2],
    pub clauses: Vec<Clause>,
    pub signed: Month,
    /// Remaining deliveries per goods clause, parallel to `clauses` (0 for other kinds).
    pub remaining: Vec<u16>,
    pub ends: Option<Month>,
    /// "active", "completed", "broken", "expired"
    pub status: String,
    pub performance: Vec<String>,
    pub shortfalls: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Msg {
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
pub struct Lineage {
    pub name: String,
    pub origin: String,
    pub home: SeatId,
    /// Private tendencies O, R, X, A, I, U, E, M in basis points.
    pub axes: [i32; 8],
    pub drift_year: [i32; 8],
    pub trait_since: [Option<Month>; 8],
    pub trait_streak: [u16; 8],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Religion {
    pub name: String,
    pub founder: SeatId,
    pub founded: Month,
    pub holy_region: RegionId,
    pub beliefs: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Movement {
    pub region: RegionId,
    /// 0 local movement, 1 pantheon, 2 precinct built, 3 prophet recognized, 4 founded.
    pub stage: u8,
    pub participants: u32,
    pub devotion: i64,
    pub pantheon: Option<String>,
    pub religion: Option<u16>,
    pub started: Month,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RegionMemory {
    pub seen: bool,
    pub last_seen: Month,
    pub surveyed: bool,
    pub survey_month: Month,
    pub owner: Option<SeatId>,
    pub pop_estimate: u32,
    pub notable: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Contact {
    pub met: bool,
    pub month: Month,
    pub at_war: bool,
    pub war_since: Month,
    pub trust: i32,
    pub notes: Vec<String>,
    pub last_peace: Month,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Assembly {
    pub id: u32,
    pub yard_region: RegionId,
    pub built: Month,
    pub retired: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct FtlState {
    pub assemblies: Vec<Assembly>,
    pub trials: Vec<(Month, u32)>,
    pub deployment_done: Option<Month>,
    pub replacement_done: Option<Month>,
    pub ftl_streak: u32,
    pub gov_streak: u32,
    pub gov_checks: Vec<Check>,
    pub ftl_checks: Vec<Check>,
    pub first_capability: Option<Month>,
    pub integration_month: Option<Month>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Flows {
    pub produced: Vec<i64>,
    pub consumed: Vec<i64>,
    pub traded_in: Vec<i64>,
    pub traded_out: Vec<i64>,
    pub births: u32,
    pub deaths: u32,
    pub migration: i32,
}

impl Flows {
    pub fn new() -> Self {
        Flows { produced: vec![0; NG], consumed: vec![0; NG], traded_in: vec![0; NG], traded_out: vec![0; NG], births: 0, deaths: 0, migration: 0 }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Milestones {
    pub sci_method: Option<Month>,
    pub planetary: Option<Month>,
    pub interstellar: Option<Month>,
    pub flags: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Civ {
    pub seat: SeatId,
    pub name: String,
    pub adjective: String,
    pub color: String,
    pub controller: ControllerKind,
    pub status: SeatStatus,
    pub capital: RegionId,
    pub lineage: u16,
    /// Goods in store, base units (rations, tonnes, lots), indexed by `Good`.
    pub stock: Vec<i64>,
    pub flows: Flows,
    pub last_flows: Flows,
    /// Smoothed monthly consumption per good (base units), used for stock targets.
    pub use_ema: Vec<i64>,
    pub tech: Vec<TechSt>,
    pub practice: Vec<PracSt>,
    pub projects: Vec<Project>,
    pub programs: Vec<Program>,
    pub food_reserve_months: u8,
    pub labor_weights: [u8; LaborCategory::COUNT],
    pub mobilization_bp: u16,
    pub memory: Vec<RegionMemory>,
    pub contacts: Vec<Contact>,
    pub selected: Vec<SeatId>,
    pub ready: bool,
    pub auto_pass: bool,
    pub chronicle: Vec<ChronicleEntry>,
    pub briefing: Vec<BriefingItem>,
    pub receipts: Vec<Receipt>,
    pub milestones: Milestones,
    pub movement: Option<Movement>,
    pub founded_religion: bool,
    pub ftl: FtlState,
    pub stability: u8,
    pub overlord: Option<SeatId>,
    pub tag_activity: Vec<i64>,
    /// Researcher-months available this month by class: one per staffed research post.
    pub research_cap: Vec<i64>,
    pub research_used: Vec<i64>,
    pub compute_supply: i64,
    pub compute_demand: i64,
    pub labor: LaborSummary,
    pub qual_employed: Vec<u32>,
    pub food_ful_bp: u16,
    pub water_ful_bp: u16,
    pub surplus_streak: u16,
    pub famine_streak: u16,
    pub war_weariness: i32,
    pub study_done: Vec<u32>,
    pub eliminated_month: Option<Month>,
    pub army_counter: u32,
    pub pop_peak: u32,
}

impl Civ {
    pub fn knows(&self, t: usize) -> bool {
        self.tech[t].state >= ST_UNDERSTOOD
    }
    pub fn knows_id(&self, id: &str) -> bool {
        self.knows(content().t(id))
    }
    pub fn established(&self, p: usize) -> bool {
        self.practice[p].state >= 3 && self.practice[p].adoption_bp >= ESTABLISHED_BP
    }
    pub fn est_id(&self, id: &str) -> bool {
        self.established(content().p(id))
    }
    pub fn stock_of(&self, g: Good) -> i64 {
        self.stock[g.index()]
    }
    pub fn add(&mut self, g: Good, amount: i64) {
        self.stock[g.index()] += amount;
        if amount > 0 {
            self.flows.produced[g.index()] += amount;
        }
    }
    /// Take up to `amount`; returns what was actually taken.
    pub fn take(&mut self, g: Good, amount: i64) -> i64 {
        let have = self.stock[g.index()].max(0);
        let t = amount.min(have).max(0);
        self.stock[g.index()] -= t;
        self.flows.consumed[g.index()] += t;
        t
    }
    pub fn is_native(&self) -> bool {
        matches!(self.controller, ControllerKind::NativeEasy | ControllerKind::NativeMedium | ControllerKind::NativeHard)
    }
    pub fn tag(&self, t: Tag) -> i64 {
        self.tag_activity[t as usize]
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Outcome {
    pub month: Month,
    pub winner: Option<SeatId>,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct World {
    pub cfg: MatchConfig,
    pub match_id: String,
    pub secret: u64,
    pub month: Month,
    pub round: u32,
    pub phase: Phase,
    pub window: u8,
    pub width: i32,
    pub height: i32,
    pub regions: Vec<Region>,
    pub civs: Vec<Civ>,
    pub armies: Vec<Army>,
    pub offers: Vec<Offer>,
    pub treaties: Vec<Treaty>,
    pub messages: Vec<Msg>,
    pub lineages: Vec<Lineage>,
    pub religions: Vec<Religion>,
    pub test_nodes: Vec<RegionId>,
    pub outcome: Option<Outcome>,
    pub next_id: u32,
    /// Envelopes used this round per unordered pair, indexed `a * n + b` with a < b.
    pub envelopes: Vec<u8>,
    /// Envelope sent this window, indexed `from * n + to`.
    pub sent_window: Vec<bool>,
    pub versions: Vec<String>,
}

impl World {
    pub fn id(&mut self) -> u32 {
        self.next_id += 1;
        self.next_id
    }
    pub fn n(&self) -> usize {
        self.civs.len()
    }
    pub fn pair(&self, a: SeatId, b: SeatId) -> usize {
        let (lo, hi) = if a < b { (a, b) } else { (b, a) };
        lo as usize * self.n() + hi as usize
    }
    pub fn at_war(&self, a: SeatId, b: SeatId) -> bool {
        a != b && self.civs[a as usize].contacts[b as usize].at_war
    }
    pub fn owned(&self, seat: SeatId) -> Vec<usize> {
        self.regions.iter().enumerate().filter(|(_, r)| r.owner == Some(seat)).map(|(i, _)| i).collect()
    }
    pub fn civ_population(&self, seat: SeatId) -> u32 {
        self.regions.iter().filter(|r| r.owner == Some(seat)).map(|r| r.population()).sum::<u32>()
            + self.armies.iter().filter(|a| a.owner == seat).map(|a| a.count()).sum::<u32>()
    }
    /// The seat whose highest authority a region ultimately answers to.
    pub fn authority(&self, region: usize) -> Option<SeatId> {
        let r = &self.regions[region];
        let owner = r.owner?;
        let mut top = owner;
        let mut guard = 0;
        while let Some(o) = self.civs[top as usize].overlord {
            top = o;
            guard += 1;
            if guard > 4 {
                break;
            }
        }
        Some(top)
    }
    pub fn top_authority(&self, seat: SeatId) -> SeatId {
        let mut top = seat;
        let mut guard = 0;
        while let Some(o) = self.civs[top as usize].overlord {
            top = o;
            guard += 1;
            if guard > 4 {
                break;
            }
        }
        top
    }
    pub fn link(&self, a: usize, b: usize) -> Option<LinkKind> {
        self.regions[a].neighbors.iter().find(|(n, _)| *n as usize == b).map(|(_, k)| *k)
    }
    pub fn state_hash(&self) -> u64 {
        let bytes = serde_json::to_vec(self).unwrap_or_default();
        crate::util::fnv(&bytes)
    }
}

/// Requirement context for one civilization.
pub struct CivCtx<'a> {
    pub world: &'a World,
    pub seat: SeatId,
}

impl ReqCtx for CivCtx<'_> {
    fn tech(&self, i: usize) -> bool {
        self.world.civs[self.seat as usize].knows(i)
    }
    fn prac(&self, i: usize) -> bool {
        self.world.civs[self.seat as usize].established(i)
    }
    fn fac(&self, i: usize) -> bool {
        self.world.regions.iter().any(|r| r.owner == Some(self.seat) && r.fac(i).map(|f| f.level > 0).unwrap_or(false))
    }
    fn pop(&self) -> u32 {
        self.world.civ_population(self.seat)
    }
    fn regions(&self) -> u32 {
        self.world.regions.iter().filter(|r| r.owner == Some(self.seat)).count() as u32
    }
    fn qual(&self, q: Qual) -> u32 {
        self.world.regions.iter().filter(|r| r.owner == Some(self.seat)).map(|r| r.quals[q.index()]).sum()
    }
    fn contact(&self) -> bool {
        self.world.civs[self.seat as usize].contacts.iter().any(|c| c.met)
    }
    fn religion(&self) -> bool {
        let c = &self.world.civs[self.seat as usize];
        c.movement.as_ref().map(|m| m.stage >= 1).unwrap_or(false)
    }
    fn sci_method(&self) -> bool {
        self.world.civs[self.seat as usize].milestones.sci_method.is_some()
    }
}

/// Prerequisite context for recognizing or reforming practices: prerequisites count once enacted.
pub struct PracEnactedCtx<'a> {
    pub world: &'a World,
    pub seat: SeatId,
    pub recognized_only: bool,
}

impl ReqCtx for PracEnactedCtx<'_> {
    fn tech(&self, i: usize) -> bool {
        self.world.civs[self.seat as usize].knows(i)
    }
    fn prac(&self, i: usize) -> bool {
        let p = &self.world.civs[self.seat as usize].practice[i];
        if self.recognized_only {
            p.state >= 1
        } else {
            p.state >= 3
        }
    }
    fn fac(&self, i: usize) -> bool {
        CivCtx { world: self.world, seat: self.seat }.fac(i)
    }
    fn pop(&self) -> u32 {
        self.world.civ_population(self.seat)
    }
    fn regions(&self) -> u32 {
        CivCtx { world: self.world, seat: self.seat }.regions()
    }
    fn qual(&self, q: Qual) -> u32 {
        CivCtx { world: self.world, seat: self.seat }.qual(q)
    }
    fn contact(&self) -> bool {
        CivCtx { world: self.world, seat: self.seat }.contact()
    }
    fn religion(&self) -> bool {
        CivCtx { world: self.world, seat: self.seat }.religion()
    }
    fn sci_method(&self) -> bool {
        self.world.civs[self.seat as usize].milestones.sci_method.is_some()
    }
}
