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
    /// The round schedule (design chapter 36, section 2.2); the horizon and the
    /// length of every round derive from it.
    pub calendar: crate::calendar::CalendarId,
    /// Research and construction work multiplier in basis points (10000 = standard).
    pub pace_bp: u32,
    pub controllers: Vec<ControllerKind>,
    /// When true the complete victory contract is shown from the first round.
    pub disclosed_objective: bool,
    /// When true the world secret is derived only from the seed label (replayable public world).
    pub public_seed: bool,
}

impl MatchConfig {
    /// Completed months at which the match ends without a winner.
    pub fn horizon(&self) -> Month {
        self.calendar.horizon()
    }
    /// Months in round `r`.
    pub fn round_months(&self, r: u32) -> u32 {
        self.calendar.round_months(r)
    }
    /// The ruleset 2.0 clock for unit tests: twelve-month rounds from 5000 BC,
    /// `rounds` of them.
    pub fn fixture_calendar(rounds: u32) -> crate::calendar::CalendarId {
        crate::calendar::CalendarId::Fixture { months_per_round: 12, start_astro_year: crate::calendar::START_ASTRO_YEAR, rounds }
    }
}

impl Default for MatchConfig {
    fn default() -> Self {
        MatchConfig {
            seed: "riverland".into(),
            regions: 48,
            calendar: crate::calendar::CalendarId::Standard,
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
    /// Tonnes still in the ground.
    pub remaining: i64,
    pub quality_bp: u16,
    /// Tonnes ever drawn from the ground here: ore delivered plus what the workings
    /// disturbed and left behind as waste. `remaining + drawn` never changes.
    #[serde(default)]
    pub drawn: i64,
    /// Tonnes of ore ever delivered at the pithead from here; never more than `drawn`.
    #[serde(default)]
    pub delivered: i64,
}

impl DepositState {
    pub fn new(kind: Deposit, remaining: i64, quality_bp: u16) -> Self {
        DepositState { kind, remaining, quality_bp, drawn: 0, delivered: 0 }
    }
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
    /// The production method the governing seat chose for this facility here: the
    /// key of one of its recipes, or of one of the field methods for fields. None
    /// leaves the choice to the works (`sim::economy::choose_recipe`). The choice
    /// lapses when the region changes hands.
    #[serde(default)]
    pub method: Option<String>,
    /// For fields: how the land was worked last month. `recipe` indexes
    /// `sim::economy::FIELD_METHODS`, `rate_bp` is the share of the field posts
    /// that were worked, and `missing` names the chemicals or fuel whose absence
    /// kept the land on a lower method than the seat allows.
    #[serde(default)]
    pub field_run: Option<RunStat>,
}

impl Facility {
    /// A new, enabled installation in full repair that has not yet run.
    pub fn new(kind: usize, level: u16) -> Facility {
        Facility { kind, level, condition_bp: 10_000, enabled: true, staffed: 0, staff_needed: 0, skilled_bp: 10_000, run: None, operated: false, assembly_progress: 0, method: None, field_run: None }
    }
}

/// What a region's shared infrastructure did in one month
/// (`docs/units-and-scale.md`, section 7). The vectors are indexed by `Good`, in
/// base units, and cover the recipes of the region's works: food grown and
/// household craft are not in them.
///
/// The identities the conservation tests assert, for every good:
/// `made <= sum over the works of recipe output x level x rate`,
/// `exempt <= used`, `exempt <= made`, `exempt <= delivered <= made`,
/// `maint_bp <= 1,500`, `congestion_bp <= 2,000`; and over the regions of one
/// civilization `sum(made) <= produced` and `sum(made - delivered) <= lost`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct InfraMonth {
    /// The month these figures belong to.
    pub month: Month,
    /// Facility levels the transport grade can serve, and enabled levels of
    /// industry, extraction and power that load it.
    pub capacity: i64,
    pub load: i64,
    /// `min(10,000, capacity x 10,000 / load)`.
    pub infra_bp: u16,
    /// Share of spares and tools upkeep the repair works saved the other works.
    pub maint_bp: u16,
    /// Extra carriage loss on output sent to the common stock.
    pub congestion_bp: u16,
    /// Gross output of the region's recipes.
    pub made: Vec<i64>,
    /// What of it reached the common stock.
    pub delivered: Vec<i64>,
    /// Inputs the region's recipes took from the common stock.
    pub used: Vec<i64>,
    /// Output that paid no carriage loss because as much was used here as input.
    pub exempt: Vec<i64>,
    /// The carriage loss the exemption avoided.
    pub chain_saved: Vec<i64>,
}

/// Where a region's shaft and electric service came from and went in one month, in
/// units of 0.1 MWh. Service is never stored: what is not used in the month is gone.
///
/// The identities the conservation tests assert:
/// `shaft_used + site_from_supply <= shaft_made - shaft_to_generators + shaft_from_motors`,
/// `elec_from_generators <= shaft_to_generators * 9 / 10`,
/// `shaft_from_motors <= elec_to_motors * 9 / 10`,
/// `elec_used + elec_to_motors + grid_out <= elec_made + elec_from_generators + grid_in`,
/// `site_from_engines <= site_coal * 5 + site_fuel * 10`,
/// and, over the regions of one civilization, `sum(grid_in) <= sum(grid_out) * 92 / 100`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PowerLedger {
    /// Shaft work delivered by the region's own power sources.
    pub shaft_made: i64,
    /// Spare shaft work turned by generator halls.
    pub shaft_to_generators: i64,
    /// Shaft work delivered by motors.
    pub shaft_from_motors: i64,
    /// Shaft work the region's recipes actually drew.
    pub shaft_used: i64,
    /// Electricity delivered by the region's own power sources.
    pub elec_made: i64,
    pub elec_from_generators: i64,
    /// Electricity drawn by motors.
    pub elec_to_motors: i64,
    /// Surplus electricity offered to the grid.
    pub grid_out: i64,
    /// Electricity received from the grid, after the line loss.
    pub grid_in: i64,
    /// Electricity the region's recipes actually drew.
    pub elec_used: i64,
    /// Shaft work construction sites drew from the region's own supply.
    #[serde(default)]
    pub site_from_supply: i64,
    /// Service site engines delivered to construction sites, all of it used there.
    #[serde(default)]
    pub site_from_engines: i64,
    /// Tonnes of coal and of refined fuel the site engines burned for it, taken
    /// from the common stock and booked as consumed.
    #[serde(default)]
    pub site_coal: i64,
    #[serde(default)]
    pub site_fuel: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RegionMonth {
    /// Worker-months the region's projects accepted this month; never more than the
    /// workers called up (`labor.projects`).
    #[serde(default)]
    pub project_work_done: i64,
    #[serde(default)]
    pub power: PowerLedger,
    /// The seat whose economy ran this month here.
    #[serde(default)]
    pub seat: Option<SeatId>,
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
    /// Site crews are not in this pool: each works only on its own order.
    pub project_labor_free: i64,
    /// Shaft work set aside from the region's supply for its construction sites
    /// this month and not yet drawn by one. What no site draws is not used at all.
    #[serde(default)]
    pub site_power_free: i64,
    /// Freight, maintenance pooling, integrated chains and congestion this month.
    #[serde(default)]
    pub infra: InfraMonth,
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
    /// An epidemic under way here (design chapter 36, section 3.2).
    #[serde(default)]
    pub outbreak: Option<Outbreak>,
    /// After an epidemic the region has a quarter of the hazard until this month.
    #[serde(default)]
    pub immune_until: Month,
    /// Last month an army stood in the region.
    #[serde(default)]
    pub army_seen: Month,
}

/// An epidemic in a region.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Outbreak {
    pub since: Month,
    /// The month after its last month.
    pub until: Month,
    /// Factor on the death rate of every band, basis points (13,000-25,000).
    pub severity_bp: u16,
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
pub const SETTLEMENT_BOUNDS: [(SettlementKind, u32); 7] = [
    (SettlementKind::Wilderness, 0),
    (SettlementKind::Camp, 1),
    (SettlementKind::Village, 150_000),
    (SettlementKind::Town, 1_000_000),
    (SettlementKind::City, 4_000_000),
    (SettlementKind::Metropolis, 12_000_000),
    (SettlementKind::Megalopolis, 40_000_000),
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
    /// Qualified site crew the whole order needs, in people: acceptable
    /// qualifications in order of preference (per level x levels for a build).
    #[serde(default)]
    pub crew: Vec<(Vec<Qual>, u32)>,
    /// People reserved for the order this month, parallel to `crew`. They hold no
    /// other post, are counted under the region's project labour and each supplies
    /// one worker-month to this order.
    #[serde(default)]
    pub crew_on_site: Vec<u32>,
    /// The region's call-up was used up before this order's crew was complete this
    /// month: the crew is short of callable labour, whoever lives there.
    #[serde(default)]
    pub crew_capped: bool,
    /// Shaft service the site draws in a month of full work, base units.
    #[serde(default)]
    pub power_need: i64,
    /// Share of the site power asked for this month that was delivered, basis points.
    #[serde(default)]
    pub power_bp: u16,
    /// Months the order takes at least (0 where the project kind states none).
    #[serde(default)]
    pub min_months: u16,
    /// Place in the service order among orders of equal priority; 0 stands for the
    /// project's id, so orders are served in the order they were given until moved.
    #[serde(default)]
    pub order_key: u32,
}

impl Project {
    /// The order in which projects are served: priority, place in the queue, id.
    pub fn service_key(&self) -> (u8, u32, u32) {
        (self.priority, if self.order_key == 0 { self.id } else { self.order_key }, self.id)
    }
    /// People the site crew needs and people it has this month.
    pub fn crew_counts(&self) -> (u32, u32) {
        (self.crew.iter().map(|(_, n)| *n).sum(), self.crew_on_site.iter().sum())
    }
    /// The share of the site crew present, basis points: the least over the groups
    /// of the crew, so a group that is missing altogether stops the site.
    pub fn crew_bp(&self) -> i64 {
        let mut bp = 10_000i64;
        for (i, (_, need)) in self.crew.iter().enumerate() {
            if *need > 0 {
                let on = self.crew_on_site.get(i).copied().unwrap_or(0);
                bp = bp.min(on as i64 * 10_000 / *need as i64);
            }
        }
        bp
    }
    /// The share of the goods bill committed, basis points: the least over the goods.
    pub fn goods_bp(&self) -> i64 {
        let mut bp = 10_000i64;
        for (_, needed, committed) in &self.inputs {
            if *needed > 0 {
                bp = bp.min(crate::util::ratio_bp(*committed, *needed));
            }
        }
        bp
    }
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
    /// Month in which the last cohort graduated (0: none has).
    #[serde(default)]
    pub last_grad: Month,
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
    /// The experts lent under the treaty's secondment clauses, one entry a clause.
    #[serde(default)]
    pub secondments: Vec<Secondment>,
    /// The treaty's joint programme clauses, one entry a clause.
    #[serde(default)]
    pub programmes: Vec<Programme>,
    /// The party that repudiated the treaty, if one did. A treaty ended by war has
    /// status "broken" and nobody here.
    #[serde(default)]
    pub broken_by: Option<SeatId>,
    /// The party that gave notice on the treaty's open-ended clauses, if one did;
    /// they end at `ends`.
    #[serde(default)]
    pub notice_by: Option<SeatId>,
}

/// Experts lent under one secondment clause (`Clause::Secondment`).
///
/// `sent` holders of `qual` left the lender for the borrower's capital when the
/// treaty was signed. `owed` of them are still due home; it never exceeds `sent`
/// and is zero once the secondment has been settled, whatever became of them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Secondment {
    /// Index of the clause in the treaty's `clauses`.
    pub clause: u16,
    pub lender: SeatId,
    pub borrower: SeatId,
    pub qual: Qual,
    pub sent: u32,
    pub owed: u32,
    /// The lender's region that gave the most of them: where the survivors return.
    pub home: RegionId,
    /// Month in which the survivors are due home.
    pub due: Month,
    /// People who came home, and people who stayed behind without their
    /// qualification after a breach.
    pub returned: u32,
    pub lost: u32,
    /// The borrower's holders of `qual` who had died, retired or been enlisted when
    /// the secondment was last reviewed. Experts abroad share the attrition of the
    /// holders they live among: each month `owed` falls in the proportion of the
    /// borrower's holders who left that way, and those are never returned.
    #[serde(default)]
    pub exits_seen: i64,
}

/// One joint programme clause (`Clause::JointProgramme`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Programme {
    /// Index of the clause in the treaty's `clauses`.
    pub clause: u16,
    pub host: SeatId,
    pub client: SeatId,
    pub service: ProgrammeService,
    /// Month in which the service ends.
    pub ends: Month,
    /// Whether the client has access this month: decided at the start of every
    /// month from the rate the host's installation ran at the month before.
    pub served: bool,
    /// Months in which the installation ran below half rate.
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
    /// Month in which a region last changed hands between the two (for armistice).
    #[serde(default)]
    pub last_control_change: Month,
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

/// The goods ledger of one civilization over one decision round, in base units and
/// indexed by `Good`, with the people it gained and lost.
///
/// For every good, over any interval:
/// `stock_end - stock_start = produced - consumed - lost + traded_in - traded_out`.
/// `produced` is gross output where it is made; what carriage to the common stock
/// costs is in `lost`, with spoilage and abandoned stores. Stock changes only
/// through [`Civ::add`], [`Civ::take`], [`Civ::lose`], [`Civ::trade_out`] and
/// [`Civ::trade_in`].
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Flows {
    pub produced: Vec<i64>,
    pub consumed: Vec<i64>,
    /// Spoilage, carriage loss and abandoned stores.
    #[serde(default = "zeros_ng")]
    pub lost: Vec<i64>,
    pub traded_in: Vec<i64>,
    pub traded_out: Vec<i64>,
    /// Output the works stood ready to make (staffed, supplied, powered) and did not
    /// make only because the stores of the good were full. A memorandum: it was
    /// never made, is in no stock and is no part of the identity above. The
    /// industrial-base check of the jump programme counts it as output the works
    /// can sustain (`sim::victory`).
    #[serde(default = "zeros_ng")]
    pub withheld: Vec<i64>,
    /// Births, and deaths of residents and soldiers (battle and militia losses included).
    pub births: u32,
    pub deaths: u32,
    pub migration: i32,
    /// The deaths by cause (`sim::population::DEATH_CAUSES`): age and illness,
    /// hunger and crowding, town conditions, epidemic, war. They add up to `deaths`.
    #[serde(default)]
    pub deaths_cause: [u32; 5],
}

fn zeros_ng() -> Vec<i64> {
    vec![0; NG]
}

fn zeros_nq() -> Vec<i64> {
    vec![0; NQ]
}

impl Flows {
    pub fn new() -> Self {
        Flows { produced: vec![0; NG], consumed: vec![0; NG], lost: vec![0; NG], traded_in: vec![0; NG], traded_out: vec![0; NG], withheld: vec![0; NG], births: 0, deaths: 0, migration: 0, deaths_cause: [0; 5] }
    }
}

/// The ledger of qualified people of one civilization, in people and indexed by
/// `Qual`. Unlike [`Flows`] it is cumulative from the start of the match.
///
/// A civilization's holders of a qualification are the `quals` of the regions it
/// controls. At every moment, for every qualification:
/// `holders = initial + trained - entered + returned - died - retired - enlisted
///            + moved_in - moved_out
///            - seconded_out + seconded_home - seconded_lost      (as a lender)
///            + seconded_in - seconded_back`                      (as a borrower).
/// Learners are not holders: a holder who enrols in a further course leaves through
/// `entered` and comes back as a graduate (`trained`, under the new qualification) or
/// when the course is closed (`returned`). Movements between a civilization's own
/// regions net to zero and are not recorded.
///
/// Experts lent under a treaty have channels of their own, so that the audit can
/// tell a loan from migration. A lender books those it sends (`seconded_out`), all
/// who are released from service abroad when the secondment ends
/// (`seconded_home`) and, of those released, the ones who did not come home because
/// a breach kept them abroad without their qualification (`seconded_lost`). A
/// borrower books those it receives (`seconded_in`) and all who leave its holders
/// when the secondment ends (`seconded_back`). Over the world, at every moment:
/// `sum(seconded_in) = sum(seconded_out)`, `sum(seconded_home) = sum(seconded_back)
/// <= sum(seconded_in)` and, for every lender, `seconded_lost <= seconded_home`.
/// An expert who dies, retires or is enlisted abroad leaves through the borrower's
/// ordinary channels and is never returned.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QualFlows {
    /// The declared starting endowment.
    #[serde(default = "zeros_nq")]
    pub initial: Vec<i64>,
    /// Graduates, under the qualification the course gives.
    #[serde(default = "zeros_nq")]
    pub trained: Vec<i64>,
    /// Holders who became learners of a further course.
    #[serde(default = "zeros_nq")]
    pub entered: Vec<i64>,
    /// Learners sent back to their previous qualification when a course closed.
    #[serde(default = "zeros_nq")]
    pub returned: Vec<i64>,
    #[serde(default = "zeros_nq")]
    pub died: Vec<i64>,
    /// Holders who passed working age.
    #[serde(default = "zeros_nq")]
    pub retired: Vec<i64>,
    /// Holders who became soldiers or fell with the militia; a qualification lapses in service.
    #[serde(default = "zeros_nq")]
    pub enlisted: Vec<i64>,
    /// Holders who arrived from, or left for, another civilization: with migrants,
    /// or because the region they live in changed hands.
    #[serde(default = "zeros_nq")]
    pub moved_in: Vec<i64>,
    #[serde(default = "zeros_nq")]
    pub moved_out: Vec<i64>,
    /// Lender: experts sent abroad under a secondment clause.
    #[serde(default = "zeros_nq")]
    pub seconded_out: Vec<i64>,
    /// Borrower: experts received under a secondment clause.
    #[serde(default = "zeros_nq")]
    pub seconded_in: Vec<i64>,
    /// Lender: of the experts released from service abroad (`seconded_home`), those
    /// who stayed there as ordinary residents without their qualification because
    /// the borrower repudiated the treaty or the parties went to war.
    #[serde(default = "zeros_nq")]
    pub seconded_lost: Vec<i64>,
    /// Lender: experts released from service abroad when a secondment ended.
    #[serde(default = "zeros_nq")]
    pub seconded_home: Vec<i64>,
    /// Borrower: foreign experts who left its holders when a secondment ended.
    #[serde(default = "zeros_nq")]
    pub seconded_back: Vec<i64>,
}

impl Default for QualFlows {
    fn default() -> Self {
        let z = || vec![0i64; NQ];
        QualFlows { initial: z(), trained: z(), entered: z(), returned: z(), died: z(), retired: z(), enlisted: z(), moved_in: z(), moved_out: z(), seconded_out: z(), seconded_in: z(), seconded_lost: z(), seconded_home: z(), seconded_back: z() }
    }
}

/// A channel of the qualification ledger through which holders leave for good.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QualExit {
    Died,
    Retired,
    Enlisted,
}

impl QualFlows {
    /// Holders the ledger accounts for.
    pub fn balance(&self, q: usize) -> i64 {
        self.initial[q] + self.trained[q] - self.entered[q] + self.returned[q] - self.died[q] - self.retired[q] - self.enlisted[q] + self.moved_in[q] - self.moved_out[q] - self.seconded_out[q]
            + self.seconded_home[q]
            - self.seconded_lost[q]
            + self.seconded_in[q]
            - self.seconded_back[q]
    }
    pub fn exit(&mut self, how: QualExit, q: usize, n: u32) {
        let v = match how {
            QualExit::Died => &mut self.died,
            QualExit::Retired => &mut self.retired,
            QualExit::Enlisted => &mut self.enlisted,
        };
        v[q] += n as i64;
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
    pub pop_peak: u64,
    /// Cumulative ledger of qualified people (see [`QualFlows`]).
    #[serde(default)]
    pub qual_flows: QualFlows,
    /// Compute the civilization's recipes drew this month; never more than the
    /// `compute_supply` installed the month before.
    #[serde(default)]
    pub compute_used: i64,
    /// Standing orders, in evaluation order (design chapter 36, section 2.6).
    #[serde(default)]
    pub directives: Vec<DirectiveSt>,
    /// Standing war policy toward each seat: (months of unchanged control after
    /// which a white peace is accepted, most regions it would cede).
    #[serde(default)]
    pub war_policy: Vec<Option<(u16, u8)>>,
    /// Counts of frequent events this round, shown as one briefing line each.
    #[serde(default)]
    pub tallies: Vec<(String, u32)>,
    /// People at the start of the round being resolved (for its era summary).
    #[serde(default)]
    pub round_start_pop: u64,
}

/// One standing order and what it did when last evaluated.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DirectiveSt {
    pub id: u32,
    pub directive: Directive,
    pub last_result: String,
    pub last_status: String,
    pub last_month: Month,
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
    /// Put newly made goods in store. Every call site is production by real labour
    /// from real inputs or a real site (`docs/conservation-audit.md`).
    pub fn add(&mut self, g: Good, amount: i64) {
        let amount = amount.max(0);
        self.stock[g.index()] += amount;
        self.flows.produced[g.index()] += amount;
    }
    /// Take up to `amount` for use; returns what was actually taken.
    pub fn take(&mut self, g: Good, amount: i64) -> i64 {
        let have = self.stock[g.index()].max(0);
        let t = amount.min(have).max(0);
        self.stock[g.index()] -= t;
        self.flows.consumed[g.index()] += t;
        t
    }
    /// Remove up to `amount` that nobody used (spoilage, carriage loss, abandoned
    /// stores); returns what was actually lost.
    pub fn lose(&mut self, g: Good, amount: i64) -> i64 {
        let have = self.stock[g.index()].max(0);
        let t = amount.min(have).max(0);
        self.stock[g.index()] -= t;
        self.flows.lost[g.index()] += t;
        t
    }
    /// Hand over up to `amount` to another civilization; returns what left the stock.
    /// The receiver books exactly that with [`Civ::trade_in`] (see [`World::transfer`]).
    pub fn trade_out(&mut self, g: Good, amount: i64) -> i64 {
        let have = self.stock[g.index()].max(0);
        let t = amount.min(have).max(0);
        self.stock[g.index()] -= t;
        self.flows.traded_out[g.index()] += t;
        t
    }
    /// Receive goods another civilization handed over with [`Civ::trade_out`].
    pub fn trade_in(&mut self, g: Good, amount: i64) {
        let amount = amount.max(0);
        self.stock[g.index()] += amount;
        self.flows.traded_in[g.index()] += amount;
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
    /// Completed months when the round being resolved began.
    #[serde(default)]
    pub round_start: Month,
    /// Months the last resolved round lasted: the span of every civilization's
    /// `last_flows` (0 before the first round is resolved).
    #[serde(default)]
    pub last_round_months: u32,
}

impl World {
    /// Months in the round in progress.
    pub fn round_months(&self) -> u32 {
        self.cfg.round_months(self.round)
    }
    /// Scale a total over the last resolved round to `months` months.
    pub fn per_last_round(&self, total: i64, months: i64) -> i64 {
        // before the first round closes there are no round totals; a year is assumed
        let span = if self.last_round_months == 0 { 12 } else { self.last_round_months };
        crate::util::muldiv(total, months, span as i64)
    }
    /// Whether the month being simulated is the first month of its round.
    pub fn first_month_of_round(&self) -> bool {
        self.month == self.round_start + 1
    }
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
    pub fn civ_population(&self, seat: SeatId) -> u64 {
        self.regions.iter().filter(|r| r.owner == Some(seat)).map(|r| r.population() as u64).sum::<u64>()
            + self.armies.iter().filter(|a| a.owner == seat).map(|a| a.count() as u64).sum::<u64>()
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
    /// Move goods from one civilization's stock to another's; returns what moved.
    pub fn transfer(&mut self, from: SeatId, to: SeatId, g: Good, amount: i64) -> i64 {
        if from == to {
            return 0;
        }
        let moved = self.civs[from as usize].trade_out(g, amount);
        self.civs[to as usize].trade_in(g, moved);
        moved
    }
    /// Hand the government of a region to another seat. Its qualified residents
    /// change hands with it: they leave the old controller's ledger through
    /// `moved_out` and enter the new one's through `moved_in`, so the holders of
    /// each civilization always equal what its ledger accounts for.
    pub fn set_controller(&mut self, region: usize, to: Option<SeatId>) {
        let from = self.regions[region].controller;
        if from == to {
            return;
        }
        for q in 0..NQ {
            let n = self.regions[region].quals[q] as i64;
            if n == 0 {
                continue;
            }
            if let Some(f) = from {
                self.civs[f as usize].qual_flows.moved_out[q] += n;
            }
            if let Some(t) = to {
                self.civs[t as usize].qual_flows.moved_in[q] += n;
            }
        }
        self.regions[region].controller = to;
        if let (Some(f), Some(t)) = (from, to) {
            let month = self.month;
            if let Some(c) = self.civs.get_mut(f as usize).and_then(|c| c.contacts.get_mut(t as usize)) {
                c.last_control_change = month;
            }
            if let Some(c) = self.civs.get_mut(t as usize).and_then(|c| c.contacts.get_mut(f as usize)) {
                c.last_control_change = month;
            }
        }
        // a choice of method was the old government's, made with what it knew
        for f in self.regions[region].facilities.iter_mut() {
            f.method = None;
        }
    }
    /// The qualification ledger that answers for a region's holders: its controller's.
    pub fn qual_ledger(&mut self, region: usize) -> Option<&mut QualFlows> {
        let c = self.regions[region].controller?;
        Some(&mut self.civs[c as usize].qual_flows)
    }
    pub fn link(&self, a: usize, b: usize) -> Option<LinkKind> {
        self.regions[a].neighbors.iter().find(|(n, _)| *n as usize == b).map(|(_, k)| *k)
    }
    pub fn state_hash(&self) -> u64 {
        let bytes = serde_json::to_vec(self).unwrap_or_default();
        crate::util::fnv(&bytes)
    }
}

/// The installation a joint programme service is given by, and the service an
/// installation can give. The jump works themselves are never a service.
pub fn facility_of_service(s: ProgrammeService) -> Option<&'static str> {
    match s {
        ProgrammeService::Launch => Some("launch_complex"),
        ProgrammeService::OrbitalYard => Some("orbital_yard"),
        ProgrammeService::HighEnergy => Some("high_energy"),
        ProgrammeService::Undisclosed => None,
    }
}

pub fn service_of_facility(key: &str) -> Option<ProgrammeService> {
    match key {
        "launch_complex" => Some(ProgrammeService::Launch),
        "orbital_yard" => Some(ProgrammeService::OrbitalYard),
        "high_energy" => Some(ProgrammeService::HighEnergy),
        _ => None,
    }
}

impl World {
    /// Whether a partner's installation is serving `seat` this month under an
    /// active joint programme: the treaty is active and the host's installation
    /// ran at half rate or better the month before (`sim::diplomacy::step`).
    pub fn programme_access(&self, seat: SeatId, service: ProgrammeService) -> bool {
        self.treaties.iter().any(|t| t.status == "active" && t.programmes.iter().any(|p| p.client == seat && p.service == service && p.served && self.month < p.ends))
    }
    /// The host's installation that serves its partners: the one at its capital if
    /// it has one there, otherwise the one in its lowest-numbered region; enabled
    /// and of at least one level. Returns the region.
    pub fn service_site(&self, host: SeatId, service: ProgrammeService) -> Option<usize> {
        let kind = content().f(facility_of_service(service)?);
        let has = |ri: usize| self.regions[ri].controller == Some(host) && self.regions[ri].fac(kind).map(|f| f.enabled && f.level > 0).unwrap_or(false);
        let capital = self.civs[host as usize].capital as usize;
        if has(capital) {
            return Some(capital);
        }
        (0..self.regions.len()).find(|ri| has(*ri))
    }
    /// Partners a host's installation of this kind is bound to serve under active treaties.
    pub fn programme_clients(&self, host: SeatId, service: ProgrammeService) -> u32 {
        self.treaties.iter().filter(|t| t.status == "active").flat_map(|t| t.programmes.iter()).filter(|p| p.host == host && p.service == service && self.month < p.ends).count() as u32
    }
}

impl QualFlows {
    /// Holders who left for good through death, retirement or enlistment.
    pub fn exits(&self, q: usize) -> i64 {
        self.died[q] + self.retired[q] + self.enlisted[q]
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
        // an installation of the seat's own, or one a partner is serving it with
        // under a joint programme this month. Access stands in only for "exists
        // somewhere under the seat": same-region rules (`Site::With`) look at the
        // region's own works and never come here.
        self.world.regions.iter().any(|r| r.owner == Some(self.seat) && r.fac(i).map(|f| f.level > 0).unwrap_or(false))
            || service_of_facility(content().facilities[i].key).map(|s| self.world.programme_access(self.seat, s)).unwrap_or(false)
    }
    fn pop(&self) -> u64 {
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
    fn pop(&self) -> u64 {
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
