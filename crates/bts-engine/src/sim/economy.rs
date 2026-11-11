//! Monthly labour allocation, power, production and upkeep.
//!
//! One person works one job. Food comes first; a bounded share of the remaining
//! labour can be called up for public projects, the qualified site crews of open
//! orders before anyone else; the rest staffs facilities in the order of the
//! government's category weights. A site crew is reserved from the region's
//! qualified residents for as long as its order is open and holds no other post.
//! Construction sites ask for shaft work with the region's works and are rationed
//! with them (`docs/units-and-scale.md`, section 6). Inputs are read from stock at
//! the start of the month and outputs become available next month, so a recipe
//! can never consume something produced later in the same month.
//!
//! Head counts are real people. Yields and other per-person coefficients are
//! stored per thousand people and applied as `people * coefficient / 1000`.
//!
//! Nothing here comes from nothing (`docs/conservation-audit.md`). Goods are made
//! only by filled posts from inputs taken out of stock or from the site, and are
//! booked gross where they are made, with the loss in carriage booked as lost.
//! Shaft, electric and compute service is rationed: a works asks for the service
//! of the posts it has filled and receives the same share of that as every other
//! works, and the account of what is left bounds each rate exactly, so a region
//! never uses more than it has (`PowerLedger`). Ore is drawn from the deposit at
//! least tonne for tonne. A called-up worker supplies one worker-month and a
//! person in a research post one researcher-month.
//!
//! Production methods (`docs/units-and-scale.md`, section 4). A works with several
//! recipes runs the one its seat chose for it in that region, or, left alone, the
//! first it knows whose inputs are in store. The method of every works is fixed
//! once, at the start of the month, before anything is taken from stock: the
//! posts it fills, the service it asks for and the goods it takes and makes all
//! belong to that method. Fields have methods of their own (`FIELD_METHODS`), which
//! a seat may cap by region.
//!
//! Economies of scale (section 7 of the same chapter) save overhead or loss and
//! make nothing: shared support posts, maintenance pooled by repair works, output
//! used where it is made spared its carriage, all bounded by caps and by the
//! region's freight capacity, and a congestion loss when that capacity is
//! exceeded. `Region.last.infra` records what each did, for the audit.

use crate::content::{content, Cap, FacDef, Recipe, Tag, FOOD_PER_PERSON_MONTH};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

/// Food methods a civilization uses away from its fields. Yields are rations per
/// thousand workers per month. Pasture and fishing improve with knowledge alone
/// and are not chosen by region; only motor boats draw an input.
pub struct FoodTech {
    pub forage: i64,
    pub pasture: i64,
    pub fish: i64,
    pub fish_port: i64,
    /// Tonnes of fuel a thousand fishers working motor boats from a harbour burn
    /// in a month; zero while boats are not motorized or the fuel is not in store.
    pub boat_fuel_per_worker: i64,
}

/// Tonnes of fuel a thousand motor-boat fishers burn in a month.
pub const FIELD_FUEL_PER_K: i64 = 10;

/// The goods field methods draw, in the order of `FieldMethod::inputs`: draught
/// horses (heads replaced each month), fertilizer, chemicals and refined fuel
/// (tonnes). Ruleset 3.0 slice 5 replaced the stand-ins (herds on pasture for
/// horses, chemicals for fertilizer) with the real goods.
pub const FIELD_INPUTS: [Good; 4] = [Good::Horses, Good::Fertilizer, Good::Chemicals, Good::Fuel];

/// One way of working fields (design chapter 36, section 3.3, "field methods v3").
/// The methods are listed from the least to the most productive; a seat may hold
/// a region's fields at any one it knows (`Facility::method`), and the land is then
/// worked by the best method that is not above the chosen one, draws no input the
/// chosen one does not draw, is known, and has its month of inputs in store.
pub struct FieldMethod {
    pub key: &'static str,
    pub name: &'static str,
    /// Technologies that must all be understood.
    pub techs: &'static [&'static str],
    /// Practices that must all be established.
    pub practices: &'static [&'static str],
    /// Rations one level yields in a month, before irrigation, harvest, husbandry,
    /// tools, condition and unrest.
    pub rations: i64,
    /// General posts one level needs.
    pub posts: u32,
    /// What one level draws in a month, in the order of [`FIELD_INPUTS`]: horses
    /// (heads), fertilizer, chemicals and fuel (tonnes).
    pub inputs: [i64; 4],
}

impl FieldMethod {
    /// Whether the method draws input `k` of [`FIELD_INPUTS`].
    pub fn draws(&self, k: usize) -> bool {
        self.inputs[k] > 0
    }
    pub fn fuel(&self) -> bool {
        self.draws(3)
    }
}

pub const FIELD_METHODS: [FieldMethod; 7] = [
    FieldMethod { key: "hand", name: "Hand cultivation", techs: &[], practices: &[], rations: 30_000, posts: 10_000, inputs: [0, 0, 0, 0] },
    FieldMethod { key: "traction", name: "Animal traction", techs: &["T020"], practices: &[], rations: 46_000, posts: 8_000, inputs: [30, 0, 0, 0] },
    FieldMethod { key: "rotation", name: "Rotation and manuring", techs: &["T020", "T011"], practices: &["C017"], rations: 60_000, posts: 8_000, inputs: [30, 0, 0, 0] },
    FieldMethod { key: "inputs", name: "Fertilized fields", techs: &["T095"], practices: &[], rations: 120_000, posts: 6_000, inputs: [0, 150, 0, 0] },
    FieldMethod { key: "mechanized", name: "Mechanized farming", techs: &["T094"], practices: &[], rations: 110_000, posts: 3_000, inputs: [0, 0, 0, 100] },
    FieldMethod { key: "intensive", name: "Mechanized farming with fertilizer", techs: &["T094", "T095"], practices: &[], rations: 250_000, posts: 2_000, inputs: [0, 300, 0, 150] },
    FieldMethod { key: "restorative", name: "Restorative mechanized farming", techs: &["T133", "T094", "T095"], practices: &[], rations: 380_000, posts: 1_500, inputs: [0, 200, 50, 150] },
];

pub fn field_method_index(key: &str) -> Option<usize> {
    FIELD_METHODS.iter().position(|m| m.key == key)
}

/// Whether the seat understands everything a field method rests on.
pub fn field_method_known(civ: &Civ, i: usize) -> bool {
    FIELD_METHODS[i].techs.iter().all(|t| civ.knows_id(t)) && FIELD_METHODS[i].practices.iter().all(|p| civ.est_id(p))
}

/// Rations a thousand cultivators raise in a month by a field method, before
/// harvest, husbandry, tools, irrigation, condition and unrest.
pub fn field_yield(_civ: &Civ, i: usize) -> i64 {
    let m = &FIELD_METHODS[i];
    m.rations * 1000 / m.posts as i64
}

/// Whether fields held at `ceiling` (none: left to the cultivators) may be worked
/// by method `i`: it is not above the ceiling and draws no manufactured input
/// (fertilizer, chemicals, fuel) the ceiling does not. Draught horses are always
/// allowed below the ceiling: fields held at machine work fall back to animals.
pub fn field_method_allowed(i: usize, ceiling: Option<usize>) -> bool {
    match ceiling {
        None => true,
        Some(c) => i <= c && (1..FIELD_INPUTS.len()).all(|k| !FIELD_METHODS[i].draws(k) || FIELD_METHODS[c].draws(k)),
    }
}

/// The ceiling a seat set for a region's fields, if it names a method the seat knows.
pub fn field_ceiling(civ: &Civ, f: &Facility) -> Option<usize> {
    f.method.as_deref().and_then(field_method_index).filter(|i| field_method_known(civ, *i))
}

/// The method a region's fields are worked by this month, and the inputs whose
/// absence keeps them below the best method the seat allows there. `ok[k]` says
/// whether the stores hold a full month of input `k` of [`FIELD_INPUTS`] for every
/// field (and motor boat) that may draw it: a method that needs an input is used
/// only when the whole month's draw is there to be taken, so no yield is ever
/// credited to an input that was not delivered.
pub fn field_method_for(civ: &Civ, ceiling: Option<usize>, ok: &[bool; 4]) -> (usize, Vec<Good>) {
    let mut used = 0;
    let mut best = 0;
    for (i, m) in FIELD_METHODS.iter().enumerate() {
        if !field_method_known(civ, i) || !field_method_allowed(i, ceiling) {
            continue;
        }
        best = i;
        if (0..FIELD_INPUTS.len()).all(|k| !m.draws(k) || ok[k]) {
            used = i;
        }
    }
    let mut missing = Vec::new();
    if best > used {
        for (k, g) in FIELD_INPUTS.iter().enumerate() {
            if FIELD_METHODS[best].draws(k) && !ok[k] {
                missing.push(*g);
            }
        }
    }
    (used, missing)
}

/// The harvest of a year in a region, basis points added to field yields
/// (design chapter 36, section 3.2): one draw a year from the secret stream
/// `("harvest", climate zone, year)`, shared by the regions of one climate zone
/// (generator 2.0's `Region.climate`) in one part of the map, triangular in [-1,800, +1,000] with mode
/// +200 (mean -200).
pub fn harvest_bp(w: &World, ri: usize) -> i64 {
    let r = &w.regions[ri];
    let zone = r.climate.index() as u64;
    // thirds of the map east-west and north-south (on a wrapped map the thirds of
    // longitude simply repeat round the globe)
    let x = r.center[0].rem_euclid(w.width.max(1)) as i64;
    let cell = ((x * 3 / w.width.max(1) as i64).min(2) * 3 + (r.center[1].max(0) as i64 * 3 / w.height.max(1) as i64).min(2)) as u64;
    let year = (w.month.saturating_sub(1) / 12) as u64;
    let u = draw_range(w.secret, &[stream("harvest"), zone, cell, year], 1_000_000) as i64;
    // triangular(a = -1,800, b = +1,000, c = +200) by inverse transform, in integers
    let (a, b, c) = (-1_800i64, 1_000i64, 200i64);
    let split = (c - a) * 1_000_000 / (b - a);
    if u < split {
        a + isqrt(u * (b - a) * (c - a) / 1_000_000)
    } else {
        b - isqrt((1_000_000 - u) * (b - a) * (b - c) / 1_000_000)
    }
}

/// Yields of forage, pasture and fishing. `fuel_ok` says whether the stores hold
/// the month of fuel that the motor boats (and the fields that may burn fuel) need.
pub fn food_tech(civ: &Civ, fuel_ok: bool) -> FoodTech {
    let k = |id: &str| civ.knows_id(id);
    let mut pasture = 3200;
    if k("T020") {
        pasture = 3700;
    }
    if k("T095") {
        pasture = 4600;
    }
    if k("T094") {
        pasture = 6200;
    }
    let mut fish = 3000;
    let mut fish_port = 3000;
    if k("T013") {
        fish = 3300;
        fish_port = 4200;
    }
    if k("T028") {
        fish_port = 5200;
    }
    let mut boat_fuel = 0;
    if k("T094") && fuel_ok {
        fish_port = 7500;
        boat_fuel = FIELD_FUEL_PER_K;
    }
    FoodTech { forage: 2600, pasture, fish, fish_port, boat_fuel_per_worker: boat_fuel }
}

/// Maximum share of non-food labour that can be called up, basis points.
pub fn mobilization_cap(w: &World, seat: SeatId) -> u16 {
    let civ = &w.civs[seat as usize];
    let mut cap: i64 = 0;
    for (id, add) in [("C003", 2200), ("C006", 500), ("C016", 300), ("C019", 500), ("C026", 1000), ("C036", 1000), ("C041", 500)] {
        if civ.est_id(id) {
            cap += add;
        }
    }
    if crate::sim::culture::belief_share(w, seat, "shared_days") > 3000 {
        cap += 300;
    }
    cap = cap.max(1200);
    let st = civ.stability as i64;
    if st < 60 {
        cap = cap * st.max(20) / 60;
    }
    cap.min(6500) as u16
}

/// Residents of natural water above which a region without a river can still
/// carry two levels of river-site works.
pub const AMPLE_WATER: u32 = 2_500_000;
/// Idle adults in a region above which they start drifting to regions that hire.
const JOBLESS_DRIFT_MIN: u32 = 40_000;
/// Tonnes of building material a thousand idle adults make at home in a month.
const HOUSEHOLD_CRAFT_PER_K: i64 = 300;

pub fn transport_level(r: &Region) -> u8 {
    (r.cap(Cap::Transport) / 1000).clamp(0, 3) as u8
}

/// Share of non-food output that survives carriage to the common stock.
pub fn link_efficiencies(w: &World, seat: SeatId) -> Vec<i64> {
    let n = w.regions.len();
    let mut eff = vec![0i64; n];
    let capital = w.civs[seat as usize].capital as usize;
    let mut dist = vec![u32::MAX; n];
    if w.regions[capital].controller == Some(seat) {
        dist[capital] = 0;
        let mut queue = vec![capital];
        let mut qi = 0;
        while qi < queue.len() {
            let x = queue[qi];
            qi += 1;
            for (nb, _) in &w.regions[x].neighbors {
                let nb = *nb as usize;
                if dist[nb] == u32::MAX && w.regions[nb].controller == Some(seat) {
                    dist[nb] = dist[x] + 1;
                    queue.push(nb);
                }
            }
        }
    }
    for i in 0..n {
        if w.regions[i].controller != Some(seat) {
            continue;
        }
        if dist[i] == u32::MAX {
            eff[i] = if i == capital { 10_000 } else { 5500 };
            continue;
        }
        let d = dist[i] as i64;
        let (base, per, floor) = match transport_level(&w.regions[i]) {
            0 => (9000, 500, 6000),
            1 => (9600, 300, 7800),
            2 => (9900, 150, 8800),
            _ => (10_000, 80, 9300),
        };
        eff[i] = if d == 0 { 10_000 } else { (base - per * (d - 1)).max(floor) };
    }
    eff
}

struct FoodOpt {
    /// Rations per thousand workers per month.
    yield_k: i64,
    /// Workers the land or works can occupy.
    capacity: u32,
    used: u32,
    tag: Tag,
    /// What `per` of its workers draw in a month, by input of [`FIELD_INPUTS`] (a
    /// level of fields: its posts; motor boats: a thousand fishers).
    inp: [i64; 4],
    per: i64,
    /// Fields, as against pasture, fishing grounds and the wild.
    field: bool,
}

struct RegionPlan {
    idx: usize,
    workers: u32,
    opts: Vec<FoodOpt>,
    food_workers: u32,
    food_made: i64,
    max_food_workers: u32,
    /// How the region's fields are worked this month, if it has any enabled.
    field_run: Option<RunStat>,
}

impl RegionPlan {
    fn add_food(&mut self, mut want: i64) -> i64 {
        let mut made = 0;
        for o in self.opts.iter_mut() {
            if want <= 0 || self.food_workers >= self.max_food_workers {
                break;
            }
            let free = (o.capacity - o.used).min(self.max_food_workers - self.food_workers);
            if free == 0 || o.yield_k <= 0 {
                continue;
            }
            let need = ((want * 1000 + o.yield_k - 1) / o.yield_k).min(u32::MAX as i64) as u32;
            let take = need.min(free);
            o.used += take;
            self.food_workers += take;
            let m = take as i64 * o.yield_k / 1000;
            made += m;
            want -= m;
        }
        self.food_made += made;
        made
    }
    fn best_free_yield(&self) -> i64 {
        if self.food_workers >= self.max_food_workers {
            return 0;
        }
        self.opts.iter().filter(|o| o.used < o.capacity).map(|o| o.yield_k).max().unwrap_or(0)
    }
}

fn recipe_ok(w: &World, seat: SeatId, r: &Recipe) -> bool {
    r.req.eval(&CivCtx { world: w, seat })
}

// ---------------------------------------------------------------------------
// Economies of scale (`docs/units-and-scale.md`, section 7)
//
// Works that stand together share infrastructure. Each effect below is a saving
// of overhead (posts, upkeep) or of loss in carriage, bounded by a stated cap and
// by a real bottleneck: the region's freight capacity, the repair works' own
// running, or what the region itself uses. None of them touches what a recipe
// puts out for its inputs, level and rate.
// ---------------------------------------------------------------------------

/// Facility levels of industry, extraction and power that a region's transport
/// can serve, by transport grade 0-3 (none; roads or a harbour; two of them or a
/// railway; a railway with roads, or a motor depot).
///
/// Calibrated against all-native campaigns (`bts-ai/tests/freight_survey.rs`): a
/// capital carries about 10 levels by year 60, 50 by year 120 and 115-125 by years
/// 180-240, with the largest tenth at 135-175. The top grade therefore serves the
/// usual late capital, and only the most concentrated regions stay congested once
/// every transport work is built; below it, each grade is outgrown and the next
/// relieves it.
pub const FREIGHT_CAPACITY: [i64; 4] = [10, 24, 60, 150];
/// Shared support posts: saving per level beyond the first, and its cap, in basis
/// points of a works' general posts.
pub const SUPPORT_SAVING_PER_LEVEL_BP: i64 = 200;
pub const SUPPORT_SAVING_CAP_BP: i64 = 2000;
/// Maintenance pooling: the most the repair works save of the spares and tools
/// upkeep of the other works, and the facility levels one level of them serves.
pub const MAINT_SAVING_CAP_BP: i64 = 1500;
pub const REPAIR_WORKS_SERVE: i64 = 12;
pub const REPAIR_WORKS: &str = "parts_works";
/// The most that congested freight adds to the loss in carriage, basis points.
pub const CONGESTION_LOSS_CAP_BP: i64 = 2000;

/// Joint programmes (design chapter 35, slice E): partners one installation
/// serves at most, the share of its operating inputs, upkeep and electric draw
/// each of them adds, and the rate below which the service lapses for the month.
pub const HOST_CLIENTS_MAX: u32 = 2;
pub const HOST_LOAD_PER_CLIENT_BP: i64 = 5000;
pub const SERVICE_RATE_BP: u16 = 5000;

/// Whether a facility's levels load the region's freight: industry, extraction
/// and power. Food, civic, education, research and transport works do not.
pub fn loads_freight(def: &FacDef) -> bool {
    !def.food && (def.power_source || matches!(def.labor, Some(LaborCategory::Industry | LaborCategory::Extraction)))
}

/// Whether a works' spares and tools upkeep is pooled by the region's repair works.
pub fn pools_upkeep(def: &FacDef) -> bool {
    loads_freight(def) && def.key != REPAIR_WORKS
}

/// A region's shared infrastructure as it applies to the coming month.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Infra {
    pub capacity: i64,
    pub load: i64,
    /// Share of the load the transport can serve: `min(10,000, capacity x 10,000 / load)`.
    pub infra_bp: i64,
    /// Share of the pooled spares and tools upkeep that is saved.
    pub maint_bp: i64,
    /// Extra carriage loss on output sent to the common stock.
    pub congestion_bp: i64,
}

/// Freight capacity and load of a region, and what follows from them. The repair
/// works pool maintenance only as far as they themselves ran last month (their
/// `run` must still be last month's when this is called), so a shop that is not
/// staffed or supplied saves nothing.
pub fn region_infra(r: &Region) -> Infra {
    let c = content();
    let capacity = FREIGHT_CAPACITY[transport_level(r) as usize];
    let mut load: i64 = 0;
    let mut shops: i64 = 0;
    let mut shop_rate: i64 = 0;
    for f in r.facilities.iter().filter(|f| f.enabled && f.level > 0) {
        let def = &c.facilities[f.kind];
        if loads_freight(def) {
            load += f.level as i64;
        }
        if def.key == REPAIR_WORKS {
            shops = f.level as i64;
            shop_rate = f.run.as_ref().map(|x| x.rate_bp as i64).unwrap_or(0).min(10_000);
        }
    }
    let infra_bp = if load <= capacity { 10_000 } else { capacity * 10_000 / load };
    let maint_bp = if shops > 0 && load > 0 {
        (MAINT_SAVING_CAP_BP * shops * REPAIR_WORKS_SERVE / load).min(MAINT_SAVING_CAP_BP) * infra_bp / 10_000 * shop_rate / 10_000
    } else {
        0
    };
    let congestion_bp = (10_000 - infra_bp) * CONGESTION_LOSS_CAP_BP / 10_000;
    Infra { capacity, load, infra_bp, maint_bp, congestion_bp }
}

/// Co-located productive buildings share general support posts (stores, hauling,
/// supervision): 2% of a works' general posts for every level beyond the first,
/// at most 20%, and only as far as the region's freight can serve its works
/// (`infra_bp`). Only maintained, enabled levels count; qualified posts, machine
/// capacity and all material/energy flows remain unchanged. No extra output.
pub fn scale_saving_bp(def: &FacDef, f: &Facility, infra_bp: i64) -> u16 {
    if !f.enabled || f.condition_bp < 7500 || def.food || def.general == 0 || def.recipes.is_empty()
        || !matches!(def.labor, Some(LaborCategory::Industry | LaborCategory::Extraction)) {
        return 0;
    }
    let full = (f.level.saturating_sub(1) as i64 * SUPPORT_SAVING_PER_LEVEL_BP).min(SUPPORT_SAVING_CAP_BP);
    (full * infra_bp.clamp(0, 10_000) / 10_000) as u16
}

/// General posts of a works this month: the facility's, less what the method it
/// runs does without, less the shared support saving.
fn general_posts(def: &FacDef, f: &Facility, rec: Option<&Recipe>, infra_bp: i64) -> u32 {
    let base = def.general as u64 * f.level as u64 * rec.map(|r| r.general_bp).unwrap_or(10_000) as u64;
    // Round requirements up: many tiny buildings cannot exploit fractional posts.
    ((base * (10_000 - scale_saving_bp(def, f, infra_bp) as u64) + 99_999_999) / 100_000_000) as u32
}

/// Effective level cap of a facility in a region for a civilization.
pub fn level_cap(w: &World, seat: SeatId, region: usize, def: &FacDef) -> u16 {
    use crate::content::Site;
    let r = &w.regions[region];
    // arable land and pasture are shared: fibre plantations take field land, horse
    // breeding takes pasture
    let shared = |site: Site| -> u16 {
        let c = content();
        r.facilities.iter().filter(|f| c.facilities[f.kind].site == site && c.facilities[f.kind].key != def.key).map(|f| f.level).sum()
    };
    let site_cap: u16 = match def.site {
        Site::Any => def.max_level,
        Site::Arable => r.arable.saturating_sub(shared(Site::Arable)),
        Site::Pasture => r.pasture.saturating_sub(shared(Site::Pasture)),
        Site::SpiceLand => r.spice_land,
        Site::Fishery => r.fishery,
        Site::Forest => r.forest,
        Site::River => {
            if r.river { def.max_level } else if r.water >= AMPLE_WATER { 2 } else { 0 }
        }
        Site::Coast => {
            if r.coastal { def.max_level } else { 0 }
        }
        Site::Hydro => {
            if def.key == "hydro" { r.hydro / 2 } else { r.hydro }
        }
        Site::Deposit(d) => match r.deposit(d) {
            Some(dep) if dep.remaining > 0 => def.max_level.min(12),
            _ => 0,
        },
        Site::TestNode => {
            if w.test_nodes.contains(&(region as RegionId)) { def.max_level } else { 0 }
        }
        Site::With(key) => {
            if r.fac_level(key) > 0 { def.max_level } else { 0 }
        }
    };
    let mut cap = site_cap.min(def.max_level);
    let ctx = CivCtx { world: w, seat };
    for (limit, req, _) in &def.scale {
        if !req.eval(&ctx) {
            cap = cap.min(*limit);
        }
    }
    cap
}

pub fn stock_target(civ: &Civ, g: Good) -> i64 {
    let mut need: i64 = 0;
    for p in &civ.projects {
        if p.paused {
            continue;
        }
        for (pg, needed, committed) in &p.inputs {
            if *pg == g {
                need += (needed - committed).max(0);
            }
        }
    }
    250_000 + civ.use_ema[g.index()] * 18 + need * 3 / 2
}

/// What the seat's fields may draw in a month, by input of [`FIELD_INPUTS`] (at
/// the hungriest method each region may use: one the seat knows and allows
/// there), and the posts of the fishers who work from a harbour (motor boats burn
/// fuel). Fields the seat holds below an input, and fields of a seat that knows no
/// method drawing it, are not counted for it.
pub fn field_input_needs(w: &World, seat: SeatId) -> ([i64; 4], i64) {
    let c = content();
    let civ = &w.civs[seat as usize];
    let (fields_k, fishery_k) = (c.f("fields"), c.f("fishery"));
    let fishery_crew = c.facilities[fishery_k].general as i64;
    let mut need = [0i64; 4];
    let mut boat_posts = 0i64;
    for r in w.regions.iter().filter(|r| r.controller == Some(seat)) {
        if let Some(f) = r.fac(fields_k) {
            if f.enabled {
                let ceiling = field_ceiling(civ, f);
                for k in 0..FIELD_INPUTS.len() {
                    let most = FIELD_METHODS.iter().enumerate().filter(|(i, _)| field_method_known(civ, *i) && field_method_allowed(*i, ceiling)).map(|(_, m)| m.inputs[k]).max().unwrap_or(0);
                    need[k] += f.level as i64 * most;
                }
            }
        }
        if let Some(f) = r.fac(fishery_k) {
            if f.enabled && r.cap(Cap::Port) > 0 {
                boat_posts += f.level as i64 * fishery_crew;
            }
        }
    }
    (need, boat_posts)
}

/// Tonnes of fuel that must be in store at the start of a month for the seat's
/// fields and motor boats to be worked by machine (see [`field_method_for`]);
/// nothing before mechanized work is understood. Site engines never burn into it.
pub fn fields_fuel_month(w: &World, seat: SeatId) -> i64 {
    if !w.civs[seat as usize].knows_id("T094") {
        return 0;
    }
    let (need, boat_posts) = field_input_needs(w, seat);
    need[3] + boat_posts * FIELD_FUEL_PER_K / 1000
}

/// The method a works runs this month: the one the seat chose for it, if the seat
/// still meets its requirement, and otherwise the first known method whose inputs
/// are in store, falling back to the first known one so that what it is short of
/// is reported. A chosen method runs even when its inputs are short.
///
/// `step` calls this once for every works before anything is taken from stock, so
/// that the posts filled, the service asked for and the goods made in a month
/// all belong to the same method.
pub fn choose_recipe(w: &World, seat: SeatId, def: &FacDef, f: &Facility) -> Option<usize> {
    if let Some(key) = &f.method {
        if let Some(i) = def.recipes.iter().position(|r| r.key == key) {
            if recipe_ok(w, seat, &def.recipes[i]) {
                return Some(i);
            }
        }
    }
    pick_recipe(w, seat, def)
}

/// Whether a seat may set `key` as the method of a facility type: one of its
/// recipes (for fields, one of the field methods) whose knowledge requirement the
/// seat meets.
pub fn method_choosable(w: &World, seat: SeatId, kind: usize, key: &str) -> bool {
    let def = &content().facilities[kind];
    if def.key == "fields" {
        return field_method_index(key).map(|i| field_method_known(&w.civs[seat as usize], i)).unwrap_or(false);
    }
    def.recipes.iter().any(|r| r.key == key && recipe_ok(w, seat, r))
}

pub fn step(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    let regs: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].controller == Some(seat)).collect();
    // site crews are reserved afresh every month: an order that is paused, or whose
    // site we no longer govern, holds nobody
    for pr in w.civs[si].projects.iter_mut() {
        pr.crew_on_site = vec![0; pr.crew.len()];
        pr.crew_capped = false;
    }
    if w.civs[si].status == SeatStatus::Eliminated || regs.is_empty() {
        // a government that runs no region has no labour, no researchers and no
        // service this month: nothing carries over from the month it last had some
        let civ = &mut w.civs[si];
        civ.research_cap = vec![0; ResearchClass::COUNT];
        civ.compute_supply = 0;
        civ.compute_demand = 0;
        civ.compute_used = 0;
        civ.qual_employed = vec![0; NQ];
        civ.labor = LaborSummary { soldiers: civ.labor.soldiers, ..Default::default() };
        return;
    }
    let pasture_k = c.f("pasture");
    let fields_k = c.f("fields");
    let fishery_k = c.f("fishery");
    // cultivators, herders and fishers one level occupies
    let (pasture_crew, fishery_crew) = (c.facilities[pasture_k].general, c.facilities[fishery_k].general);
    // a method that needs horses, fertilizer, chemicals or fuel is used only when a
    // full month's draw for every field and motor boat that may draw it is in
    // store; the draw is taken before anything else this month, so the yield is
    // never credited without its inputs
    let (field_need, boat_posts) = field_input_needs(w, seat);
    let mut input_ok = [false; 4];
    for (k, g) in FIELD_INPUTS.iter().enumerate() {
        let need = field_need[k] + if *g == Good::Fuel { boat_posts * FIELD_FUEL_PER_K / 1000 } else { 0 };
        input_ok[k] = w.civs[si].stock_of(*g) > 0 && w.civs[si].stock_of(*g) >= need;
    }
    let fuel_ok = input_ok[3];
    let ft = food_tech(&w.civs[si], fuel_ok);
    let link = link_efficiencies(w, seat);
    // the region's shared infrastructure, from the works as they stand and the
    // repair works' running last month
    let infras: Vec<Infra> = regs.iter().map(|ri| region_infra(&w.regions[*ri])).collect();
    // one decision per works per month: the method each runs is fixed here, from
    // the stock the month opens with, so that its posts, the service it asks for
    // and what it makes all belong to the same method
    let methods: Vec<Vec<Option<usize>>> = regs
        .iter()
        .map(|ri| {
            w.regions[*ri]
                .facilities
                .iter()
                .map(|f| {
                    let def = &c.facilities[f.kind];
                    if def.food || !f.enabled || f.level == 0 { None } else { choose_recipe(w, seat, def, f) }
                })
                .collect()
        })
        .collect();
    // joint programmes: an installation that serves partners takes half as much
    // again of its operating inputs, upkeep and electricity for each of them (two
    // at most). `(region, facility kind, load in basis points)`.
    let hosting: Vec<(usize, usize, i64)> = [ProgrammeService::Launch, ProgrammeService::OrbitalYard, ProgrammeService::HighEnergy]
        .into_iter()
        .filter_map(|s| {
            let clients = w.programme_clients(seat, s).min(HOST_CLIENTS_MAX) as i64;
            if clients == 0 {
                return None;
            }
            let site = w.service_site(seat, s)?;
            Some((site, c.f(facility_of_service(s)?), 10_000 + HOST_LOAD_PER_CLIENT_BP * clients))
        })
        .collect();
    let load_of = |ri: usize, kind: usize| -> i64 { hosting.iter().find(|h| h.0 == ri && h.1 == kind).map(|h| h.2).unwrap_or(10_000) };
    let mob_cap = mobilization_cap(w, seat) as i64;
    // researcher-months one staffed research post supplies (design chapter 36, 2.7)
    let research_eff = crate::sim::knowledge::research_effectiveness(&w.civs[si]);
    let mob = mob_cap * w.civs[si].mobilization_bp as i64 / 10_000;
    let tools_ok = w.civs[si].stock_of(Good::Tools) > 0;

    // ---- 1. food plan ------------------------------------------------------
    let soldiers: u32 = w.armies.iter().filter(|a| a.owner == seat).map(|a| a.count()).sum();
    let mut plans: Vec<RegionPlan> = Vec::new();
    let mut need_total: i64 = soldiers as i64 * FOOD_PER_PERSON_MONTH;
    for &ri in &regs {
        let r = &w.regions[ri];
        let pop = r.population();
        need_total += pop as i64 * FOOD_PER_PERSON_MONTH;
        let working = r.working();
        let busy = r.students + r.teachers.iter().sum::<u32>();
        let workers = (working as i64 * 92 / 100 - busy as i64).max(0) as u32;
        let mut opts: Vec<FoodOpt> = Vec::new();
        let unrest_factor = 10_000 - r.unrest_bp as i64 * 6 / 10;
        let adj = |y: i64| y * unrest_factor / 10_000;
        let mut field_run: Option<RunStat> = None;
        if let Some(f) = r.fac(fields_k) {
            if f.enabled && f.level > 0 {
                // the method this region's fields are worked by: the best the seat
                // knows and allows here whose month of inputs is in store
                let (method, missing) = field_method_for(&w.civs[si], field_ceiling(&w.civs[si], f), &input_ok);
                let m = &FIELD_METHODS[method];
                let field_crew = m.posts;
                // inputs per level (`per` cultivators) of this method
                let (inp, per) = (m.inputs, m.posts as i64);
                field_run = Some(RunStat { recipe: method, rate_bp: 0, blockers: if missing.is_empty() { 0 } else { 4 }, missing });
                // full husbandry needs five hundred agronomists for each level of fields
                let agr = r.quals[Qual::Agronomist.index()] as i64;
                let skill = 8500 + 1500 * (agr * 2).min(f.level as i64 * 1000) / (f.level as i64 * 1000).max(1);
                let tool = if tools_ok { 10_000 } else { 7000 };
                let irrigated = ((r.cap(Cap::Irrigation) / 1000) as u16).min(f.level);
                // the year's harvest, damped by irrigation and by machines
                let mut harvest = harvest_bp(w, ri);
                harvest = harvest * (10_000 - 5_000 * irrigated as i64 / f.level.max(1) as i64) / 10_000;
                if m.fuel() {
                    harvest = harvest * 3 / 10;
                }
                let base = field_yield(&w.civs[si], method);
                // a fertile floodplain (design chapter 36, 5.3) adds to every level
                let flood = r.bonus(Bonus::Floodplain);
                let y = base * (10_000 + harvest + flood) / 10_000 * skill / 10_000 * tool / 10_000 * f.condition_bp.max(5000) as i64 / 10_000;
                // a level never yields more than twice its method's base
                let cap = base * 2;
                if irrigated > 0 {
                    opts.push(FoodOpt { yield_k: adj((y * 125 / 100).min(cap)), capacity: irrigated as u32 * field_crew, used: 0, tag: Tag::Farm, inp, per, field: true });
                }
                if f.level > irrigated {
                    opts.push(FoodOpt { yield_k: adj(y.min(cap)), capacity: (f.level - irrigated) as u32 * field_crew, used: 0, tag: Tag::Farm, inp, per, field: true });
                }
            }
        }
        if let Some(f) = r.fac(pasture_k) {
            if f.enabled && f.level > 0 {
                // rich pasture feeds the herds better
                let y = ft.pasture * (10_000 + r.bonus(Bonus::RichPasture)) / 10_000;
                opts.push(FoodOpt { yield_k: adj(y), capacity: f.level as u32 * pasture_crew, used: 0, tag: Tag::Farm, inp: [0; 4], per: 1000, field: false });
            }
        }
        if let Some(f) = r.fac(fishery_k) {
            if f.enabled && f.level > 0 {
                let port = r.cap(Cap::Port) > 0;
                // fish banks: the catch is half again as large for the same boats
                let y = if port { ft.fish_port } else { ft.fish } * (10_000 + r.bonus(Bonus::FishBanks)) / 10_000;
                // motor boats working from a harbour burn fuel like field machinery
                opts.push(FoodOpt { yield_k: adj(y), capacity: f.level as u32 * fishery_crew, used: 0, tag: Tag::Sea, inp: [0, 0, 0, if port { ft.boat_fuel_per_worker } else { 0 }], per: 1000, field: false });
            }
        }
        // the land feeds foragers only up to what grows wild
        opts.push(FoodOpt { yield_k: adj(ft.forage), capacity: (r.wild * 1000 / ft.forage).min(u32::MAX as i64) as u32, used: 0, tag: Tag::Forage, inp: [0; 4], per: 1000, field: false });
        opts.sort_by(|a, b| b.yield_k.cmp(&a.yield_k));
        plans.push(RegionPlan { idx: ri, workers, opts, food_workers: 0, food_made: 0, max_food_workers: (workers as u64 * 94 / 100) as u32, field_run });
    }
    let food_stock = w.civs[si].stock_of(Good::Food);
    let reserve = need_total * w.civs[si].food_reserve_months as i64;
    let storage: i64 = regs.iter().map(|i| w.regions[*i].cap(Cap::Storage) + 400_000).sum();
    let factor: i64 = if food_stock < reserve / 2 {
        135
    } else if food_stock < reserve {
        118
    } else if food_stock >= storage || food_stock > reserve * 2 {
        88
    } else {
        100
    };
    let mut made_total = 0;
    for p in plans.iter_mut() {
        let need = w.regions[p.idx].population() as i64 * FOOD_PER_PERSON_MONTH;
        made_total += p.add_food(need * factor / 100);
    }
    let mut short = need_total * factor / 100 - made_total;
    while short > 0 {
        let mut best: Option<usize> = None;
        let mut by = 0;
        for (i, p) in plans.iter().enumerate() {
            let y = p.best_free_yield();
            if y > by {
                by = y;
                best = Some(i);
            }
        }
        match best {
            Some(i) => {
                // at most twenty thousand workers' worth at a time, so regions share the shortfall
                let chunk = short.min(by * 20);
                let made = plans[i].add_food(chunk);
                if made <= 0 {
                    break;
                }
                short -= made;
            }
            None => break,
        }
    }
    // field horses, fertilizer, chemicals and fuel are drawn now, from the
    // month-start stock that was checked to cover them, before any other user can take them
    {
        let mut drawn = [0i64; 4];
        for p in &plans {
            for o in &p.opts {
                for k in 0..FIELD_INPUTS.len() {
                    drawn[k] += o.used as i64 * o.inp[k] / o.per;
                }
            }
        }
        for (k, g) in FIELD_INPUTS.iter().enumerate() {
            w.civs[si].take(*g, drawn[k]);
        }
    }
    // how each region's fields were worked, for the seat to read
    for p in plans.iter_mut() {
        let (used, capacity) = p.opts.iter().filter(|o| o.field).fold((0u64, 0u64), |a, o| (a.0 + o.used as u64, a.1 + o.capacity as u64));
        let run = p.field_run.take().map(|mut run| {
            run.rate_bp = if capacity > 0 { (used * 10_000 / capacity) as u16 } else { 0 };
            run
        });
        if let Some(f) = w.regions[p.idx].fac_mut(fields_k) {
            f.field_run = run;
        }
    }

    // ---- 2. labour, staffing and power per region ---------------------------
    let weights = w.civs[si].labor_weights;
    let mut order: Vec<usize> = (0..c.facilities.len()).filter(|k| !c.facilities[*k].food).collect();
    order.sort_by_key(|k| {
        let wgt = c.facilities[*k].labor.map(|l| weights[l.index()]).unwrap_or(5);
        (std::cmp::Reverse(wgt), *k)
    });

    let mut civ_labor = LaborSummary::default();
    let mut qual_employed = vec![0u32; NQ];
    let mut tag_activity = vec![0i64; Tag::COUNT];
    let mut research_cap = vec![0i64; ResearchClass::COUNT];
    // gross output where it is made, and what of it reaches the common stock
    let mut made = vec![0i64; NG];
    let mut made_net = vec![0i64; NG];
    // output the works stood ready to make but for full stores (never made)
    let mut withheld = vec![0i64; NG];
    let mut compute_demand_total: i64 = 0;
    let mut grid_surplus: i64 = 0;
    let mut grid_deficit: i64 = 0;
    let mut household_total: i64 = 0;
    // qualified people left without a post, and skilled posts left empty, by region
    let mut spare: Vec<(usize, usize, u32)> = Vec::new();
    let mut vacant: Vec<(usize, Vec<Qual>, u32)> = Vec::new();
    // regions with open general posts, and regions with people who have no post
    let mut hiring: Vec<(usize, u32)> = Vec::new();
    let mut jobless: Vec<(usize, u32)> = Vec::new();
    struct RegionPower {
        ri: usize,
        /// Share of the shaft and electric service the region's recipes asked for that exists.
        shaft_bp: i64,
        elec_bp: i64,
        /// Service not yet drawn by a recipe this month.
        shaft_left: i64,
        elec_left: i64,
        /// Electricity the recipes asked for, and what is short of it before the grid helps.
        elec_demand: i64,
        elec_short: i64,
        grid: bool,
    }
    let mut powers: Vec<RegionPower> = Vec::new();
    let motors = w.civs[si].knows_id("T101");
    let prev_compute = w.civs[si].compute_supply;
    let month_now = w.month;

    for (pi, p) in plans.iter().enumerate() {
        let ri = p.idx;
        let infra = infras[pi];
        // the region's active orders, in the order in which they are served
        let mut queue: Vec<usize> = (0..w.civs[si].projects.len())
            .filter(|i| {
                let pr = &w.civs[si].projects[*i];
                !pr.paused && pr.region == Some(ri as RegionId) && crate::sim::projects::uses_labor(&pr.kind)
            })
            .collect();
        queue.sort_by_key(|i| w.civs[si].projects[*i].service_key());
        let unrest_factor = 10_000 - w.regions[ri].unrest_bp as i64 * 7 / 10;
        let r = &mut w.regions[ri];
        let mut month = RegionMonth { seat: Some(seat), qual_employed: vec![0; NQ], tag_staff: vec![0; Tag::COUNT], ..Default::default() };
        month.infra = InfraMonth {
            month: month_now,
            capacity: infra.capacity,
            load: infra.load,
            infra_bp: infra.infra_bp as u16,
            maint_bp: infra.maint_bp as u16,
            congestion_bp: infra.congestion_bp as u16,
            made: vec![0; NG],
            delivered: vec![0; NG],
            used: vec![0; NG],
            exempt: vec![0; NG],
            chain_saved: vec![0; NG],
        };
        month.labor.working_age = r.working();
        month.labor.students = r.students;
        month.labor.teachers = r.teachers.iter().sum();
        month.labor.food = p.food_workers;
        month.food_made = p.food_made;
        for o in &p.opts {
            month.tag_staff[o.tag as usize] += o.used;
        }

        let nonfood = p.workers - p.food_workers;
        let mut avail = [0u32; NQ];
        let mut qsum: u32 = 0;
        for q in 0..NQ {
            avail[q] = r.quals[q].saturating_sub(r.teachers[q]);
            qsum += avail[q];
        }
        if qsum > nonfood {
            // Food work had to draw on qualified people: scale every bundle down.
            let mut left = nonfood;
            for q in 0..NQ {
                let v = (avail[q] as u64 * nonfood as u64 / qsum.max(1) as u64) as u32;
                avail[q] = v.min(left);
                left -= avail[q];
            }
            qsum = avail.iter().sum();
        }
        let mut unskilled = nonfood - qsum;

        // project labour: every called-up worker supplies one worker-month and no more,
        // and the call-up is bounded by the mobilization the practices allow.
        // Site crews are called up first, order by order: qualified residents who are
        // not teaching, each group in its order of preference. They hold no other
        // post this month and work only on their own order. An order keeps its crew
        // for as long as it is open, whether or not its goods have arrived.
        let cap_workers = (nonfood as i64 * mob / 10_000) as u32;
        let mut crew_workers = 0u32;
        let mut demand: i64 = 0;
        for &pi in &queue {
            let pr = &mut w.civs[si].projects[pi];
            let mut on_site = vec![0u32; pr.crew.len()];
            let mut capped = false;
            for (e, (quals, need)) in pr.crew.iter().enumerate() {
                let mut left = *need;
                for q in quals {
                    let take = left.min(avail[q.index()]).min(cap_workers - crew_workers);
                    avail[q.index()] -= take;
                    month.qual_employed[q.index()] += take;
                    crew_workers += take;
                    left -= take;
                    if left == 0 {
                        break;
                    }
                }
                on_site[e] = *need - left;
                if left > 0 && crew_workers < cap_workers {
                    // qualified people without a post elsewhere will move to the site
                    vacant.push((ri, quals.clone(), left));
                } else if left > 0 {
                    capped = true;
                }
            }
            let own: i64 = on_site.iter().map(|n| *n as i64).sum();
            pr.crew_on_site = on_site;
            pr.crew_capped = capped;
            // the other labour the order can use this month beside its own crew
            let want = (pr.work_needed - pr.work_done).min(muldiv(pr.max_per_month, pr.crew_bp(), 10_000)).max(0);
            demand += (want - own * unrest_factor / 10_000).max(0);
        }

        // staffing, in two passes: qualified people take skilled posts everywhere first,
        // then general posts are filled, so a programmer is never spent on a pit crew
        // while a computing centre stands empty. Between the two the orders' other
        // labour is called up (below).
        let mut fac_workers = 0u32;
        let mut skilled: Vec<(usize, u32, u32)> = Vec::new(); // (facility index, needed, got)
        for &kind in &order {
            let def = &c.facilities[kind];
            let Some(fi) = r.facilities.iter().position(|f| f.kind == kind) else { continue };
            let f = &mut r.facilities[fi];
            f.run = None;
            f.staffed = 0;
            f.staff_needed = 0;
            if !f.enabled || f.level == 0 {
                continue;
            }
            let lv = f.level as u32;
            let mut skilled_needed = 0u32;
            let mut skilled_got = 0u32;
            // the facility's own qualified posts and those its method adds
            let rec = methods[pi][fi].map(|i| &def.recipes[i]);
            for (quals, n) in def.skilled.iter().chain(rec.iter().flat_map(|r| r.extra_skilled.iter())) {
                let need = *n * lv;
                skilled_needed += need;
                let mut left = need;
                for q in quals {
                    let take = left.min(avail[q.index()]);
                    avail[q.index()] -= take;
                    month.qual_employed[q.index()] += take;
                    left -= take;
                    if left == 0 {
                        break;
                    }
                }
                skilled_got += need - left;
                if left > 0 {
                    vacant.push((ri, quals.clone(), left));
                }
            }
            skilled.push((fi, skilled_needed, skilled_got));
        }
        // ordinary labour for what the orders can still use, within what is left of
        // the call-up: people without a qualification first, then qualified people
        // whom no qualified post took this month (builders before the others). It is
        // called up before the general posts of the works are filled.
        let mut wanted = demand.min((cap_workers - crew_workers) as i64).max(0) as u32;
        let mut called = wanted.min(unskilled);
        unskilled -= called;
        wanted -= called;
        let builder = Qual::Builder.index();
        for q in std::iter::once(builder).chain((0..NQ).filter(|q| *q != builder)) {
            if wanted == 0 {
                break;
            }
            let take = wanted.min(avail[q]);
            avail[q] -= take;
            called += take;
            wanted -= take;
        }
        month.labor.projects = crew_workers + called;
        month.project_labor_free = called as i64 * unrest_factor / 10_000;
        let mut open_general: u32 = 0;
        for (fi, skilled_needed, skilled_got) in skilled {
            let f = &mut r.facilities[fi];
            let def = &c.facilities[f.kind];
            let positions = skilled_needed + general_posts(def, f, methods[pi][fi].map(|i| &def.recipes[i]), infra.infra_bp);
            let mut filled = skilled_got;
            let is_research = def.recipes.iter().any(|r| r.research.is_some());
            if !is_research {
                let want = positions - filled;
                let take = want.min(unskilled);
                unskilled -= take;
                filled += take;
                if filled < positions {
                    // remaining qualified people can still do general work
                    for q in 0..NQ {
                        if filled >= positions {
                            break;
                        }
                        let take = (positions - filled).min(avail[q]);
                        avail[q] -= take;
                        filled += take;
                    }
                }
                open_general += positions - filled;
            }
            f.staffed = filled;
            f.staff_needed = positions;
            f.skilled_bp = if skilled_needed == 0 { 10_000 } else { (skilled_got as u64 * 10_000 / skilled_needed as u64) as u16 };
            fac_workers += filled;
            for t in &def.tags {
                month.tag_staff[*t as usize] += filled;
            }
        }
        month.labor.facilities = fac_workers;
        let leftover: u32 = unskilled + avail.iter().sum::<u32>();
        month.labor.household = leftover;
        household_total += leftover as i64;
        if open_general > 0 {
            hiring.push((ri, open_general));
        } else if leftover > JOBLESS_DRIFT_MIN {
            jobless.push((ri, leftover));
        }
        for q in 0..NQ {
            if avail[q] > 0 {
                spare.push((ri, q, avail[q]));
            }
        }
        r.last = month;
    }

    // power sources run first (they read month-start stock), then demands are known
    for (pi, p) in plans.iter().enumerate() {
        let ri = p.idx;
        let mut led = PowerLedger::default();
        let mut shaft_demand: i64 = 0;
        let mut elec_demand: i64 = 0;
        let unrest_factor = 10_000 - w.regions[ri].unrest_bp as i64 * 7 / 10;
        for fi in 0..w.regions[ri].facilities.len() {
            let (kind, level, staff_bp, skilled_bp, cond, enabled) = {
                let f = &w.regions[ri].facilities[fi];
                (f.kind, f.level as i64, staff_rate(&c.facilities[f.kind], f), f.skilled_bp as i64, f.condition_bp as i64, f.enabled)
            };
            let def = &c.facilities[kind];
            if !enabled || level == 0 {
                continue;
            }
            if def.power_source {
                let Some(ridx) = methods[pi][fi] else { continue };
                let rec = &def.recipes[ridx];
                let mut rate = staff_bp.min(cond).min(unrest_factor);
                let mut missing = Vec::new();
                for (g, a) in &rec.inputs {
                    let need = a * level * rate / 10_000;
                    if need > 0 {
                        let have = w.civs[si].stock_of(*g);
                        if have < need {
                            rate = rate * have.max(0) / need;
                            missing.push(*g);
                        }
                    }
                }
                for (g, a) in &rec.inputs {
                    let amt = a * level * rate / 10_000;
                    let took = w.civs[si].take(*g, amt);
                    // fuel burned where it is mined or refined never left the region
                    w.regions[ri].last.infra.used[g.index()] += took;
                }
                led.shaft_made += rec.out_shaft * level * rate / 10_000;
                led.elec_made += rec.out_elec * level * rate / 10_000;
                let mut blockers = 0u16;
                if staff_bp < 9000 {
                    blockers |= 1;
                }
                if !missing.is_empty() {
                    blockers |= 4;
                }
                let f = &mut w.regions[ri].facilities[fi];
                f.run = Some(RunStat { recipe: ridx, rate_bp: rate as u16, blockers, missing });
                if rate >= 5000 {
                    f.operated = true;
                }
            } else if let Some(ridx) = methods[pi][fi] {
                // a works asks for the service of the posts it has filled
                let rec = &def.recipes[ridx];
                let base = if rec.research.is_some() { skilled_bp } else { staff_bp };
                shaft_demand += rec.shaft * level * base / 10_000;
                // an installation serving partners asks for their share as well
                elec_demand += rec.elec * level * base / 10_000 * load_of(ri, kind) / 10_000;
                compute_demand_total += rec.compute * level * base / 10_000;
            }
        }
        // construction sites ask for shaft work alongside the region's works: each
        // open order that has crew on site and goods to work with asks for the share
        // of its draw that its crew can use
        let mut site_ask: i64 = 0;
        for pr in &w.civs[si].projects {
            if pr.paused || pr.region != Some(ri as RegionId) || pr.power_need <= 0 || pr.work_done >= pr.work_needed {
                continue;
            }
            if crate::sim::projects::goods_allow_work(&w.civs[si], pr) {
                site_ask += pr.power_need * pr.crew_bp() / 10_000;
            }
        }
        shaft_demand += site_ask;
        let mut shaft = led.shaft_made;
        let mut elec = led.elec_made;
        // generator halls turn spare shaft work into electricity at nine tenths
        let gen_cap = w.regions[ri].cap(Cap::GenCap);
        if gen_cap > 0 && shaft > shaft_demand {
            let x = gen_cap.min(shaft - shaft_demand);
            led.shaft_to_generators = x;
            led.elec_from_generators = x * 9 / 10;
            shaft -= x;
            elec += x * 9 / 10;
        }
        // motors turn the region's own spare electricity into shaft work at nine tenths
        if motors && shaft < shaft_demand && elec > elec_demand {
            let add = (shaft_demand - shaft).min((elec - elec_demand) * 9 / 10);
            let drawn = (add * 10 + 8) / 9;
            led.shaft_from_motors = add;
            led.elec_to_motors = drawn;
            shaft += add;
            elec -= drawn;
        }
        // what is still spare after the region's own users is offered to the grid
        let grid = w.regions[ri].cap(Cap::GridLink) > 0;
        let mut elec_short = 0;
        if grid {
            if elec > elec_demand {
                led.grid_out = elec - elec_demand;
                grid_surplus += led.grid_out;
                elec = elec_demand;
            } else {
                elec_short = elec_demand - elec;
                grid_deficit += elec_short;
            }
        }
        // the sites' share of the region's shaft work is set aside for them: under a
        // shortage they are rationed like every works, and no works can draw their part
        let shaft_bp = ratio_bp(shaft, shaft_demand);
        let site_share = (site_ask * shaft_bp / 10_000).min(shaft.max(0));
        let r = &mut w.regions[ri];
        r.last.shaft_supply = shaft;
        r.last.shaft_demand = shaft_demand;
        r.last.elec_supply = led.elec_made + led.elec_from_generators;
        r.last.elec_demand = elec_demand + led.elec_to_motors;
        r.last.power = led;
        r.last.site_power_free = site_share;
        powers.push(RegionPower { ri, shaft_bp, elec_bp: 10_000, shaft_left: shaft - site_share, elec_left: elec, elec_demand, elec_short, grid });
    }
    // the grid shares the surplus among linked regions in deficit; 8% is lost on the way
    let grid_pool = grid_surplus * 92 / 100;
    let grid_ratio = if grid_deficit > 0 { ratio_bp(grid_pool, grid_deficit) } else { 10_000 };
    for pw in powers.iter_mut() {
        if pw.grid && pw.elec_short > 0 {
            let got = pw.elec_short * grid_ratio / 10_000;
            pw.elec_left += got;
            let r = &mut w.regions[pw.ri];
            r.last.power.grid_in = got;
            r.last.elec_supply += got;
        }
        pw.elec_bp = ratio_bp(pw.elec_left, pw.elec_demand);
    }
    // compute installed last month serves this month
    let compute_bp = if compute_demand_total > 0 { ratio_bp(prev_compute, compute_demand_total) } else { 10_000 };
    let mut compute_left: i64 = prev_compute.max(0);
    let mut compute_used: i64 = 0;
    let mut compute_made: i64 = 0;

    // household craft: adults with no post make a little building material at home,
    // never more than 0.3 t each, and only while stores have room for it
    {
        let t = stock_target(&w.civs[si], Good::Materials);
        let have = w.civs[si].stock_of(Good::Materials);
        if have < 2 * t {
            let bp = if have <= t { 10_000 } else { (2 * t - have) * 10_000 / t };
            let craft = household_total * HOUSEHOLD_CRAFT_PER_K * bp / 10_000 / 1000;
            made[Good::Materials.index()] += craft;
            made_net[Good::Materials.index()] += craft;
        }
    }
    // specialists move to where their posts are: a few each month, as real people
    for (sink, quals, mut left) in vacant {
        let mut quota = (left / 4).max(1);
        for (src, q, n) in spare.iter_mut() {
            if left == 0 || quota == 0 {
                break;
            }
            if *src == sink || *n == 0 || !quals.iter().any(|x| x.index() == *q) {
                continue;
            }
            let take = (*n).min(left).min(quota).min(w.regions[*src].quals[*q].saturating_sub(w.regions[*src].teachers[*q]));
            if take == 0 {
                continue;
            }
            // both regions are ours, so the qualification ledger does not change
            let moved = crate::sim::population::relocate_adults(&mut w.regions, *src, sink, take);
            w.regions[*src].quals[*q] -= moved;
            w.regions[sink].quals[*q] += moved;
            *n -= moved;
            left -= moved;
            quota -= moved.min(quota);
        }
    }

    // people without posts drift toward regions that are hiring, a few percent a month
    jobless.sort_by_key(|(ri, n)| (std::cmp::Reverse(*n), *ri));
    for (sink, mut open) in hiring {
        for (src, n) in jobless.iter_mut() {
            if open == 0 {
                break;
            }
            let go = (*n / 25).max(1).min(open).min(*n);
            if go == 0 || *src == sink {
                continue;
            }
            // workers bring dependants in proportion
            let pop = w.regions[*src].population();
            let working = w.regions[*src].working().max(1);
            let with_family = (go as u64 * pop as u64 / working as u64) as u32;
            let moved = crate::sim::population::move_people(w, *src, sink, with_family, false);
            let workers = (moved as u64 * working as u64 / pop.max(1) as u64) as u32;
            *n -= workers.min(*n);
            open -= workers.min(open);
        }
    }

    // ---- 3. food output (its chemicals and fuel were drawn with the plan) -------
    for p in &plans {
        made[Good::Food.index()] += p.food_made;
        made_net[Good::Food.index()] += p.food_made;
    }

    // ---- 4. production ---------------------------------------------------------
    let targets: Vec<i64> = Good::ALL.iter().map(|g| stock_target(&w.civs[si], *g)).collect();
    let motor_age = w.civs[si].knows_id("T094");
    let stock_start: Vec<i64> = w.civs[si].stock.clone();
    for (pi, p) in plans.iter().enumerate() {
        let ri = p.idx;
        let pw = &mut powers[pi];
        debug_assert_eq!(pw.ri, ri);
        let unrest_factor = 10_000 - w.regions[ri].unrest_bp as i64 * 7 / 10;
        let link_bp = link[ri];
        let infra = infras[pi];
        // gross output of the region's recipes this month, by good
        let mut region_out = vec![0i64; NG];
        for &kind in &order {
            let def = &c.facilities[kind];
            let Some(fi) = w.regions[ri].facilities.iter().position(|f| f.kind == kind) else { continue };
            let method = methods[pi][fi];
            let (level, cond, enabled, staff_bp, skilled_bp, skilled_count) = {
                let f = &w.regions[ri].facilities[fi];
                let extra = method.iter().flat_map(|i| def.recipes[*i].extra_skilled.iter());
                let sk: u32 = def.skilled.iter().chain(extra).map(|(_, n)| *n * f.level as u32).sum();
                (f.level as i64, f.condition_bp as i64, f.enabled, staff_rate(def, f), f.skilled_bp as i64, sk as i64 * f.skilled_bp as i64 / 10_000)
            };
            if level == 0 {
                continue;
            }
            // what serving partners adds to this installation's inputs, upkeep and electricity
            let load = load_of(ri, kind);
            // upkeep and condition
            if enabled {
                let mut ok = 10_000i64;
                // the region's repair works keep the other works' machines running on
                // fewer spares and tools: less is taken, nothing is made
                let pooled = pools_upkeep(def) && infra.maint_bp > 0;
                for (g, a) in &def.upkeep {
                    // motor vehicles (T094) retire the draught horses of roads and carts
                    if *g == Good::Horses && motor_age {
                        continue;
                    }
                    let mut need = a * level * load / 10_000;
                    if pooled && matches!(g, Good::Spares | Good::Tools) {
                        need = (need * (10_000 - infra.maint_bp) + 9_999) / 10_000;
                    }
                    let got = w.civs[si].take(*g, need);
                    // where horses are short, porters carry instead (design chapter 36,
                    // 5.6): the works keep their condition
                    if *g != Good::Horses {
                        ok = ok.min(ratio_bp(got, need));
                    }
                }
                let f = &mut w.regions[ri].facilities[fi];
                if ok >= 9900 {
                    f.condition_bp = (f.condition_bp + 300).min(10_000);
                } else {
                    let drop = (10_000 - ok) * 250 / 10_000;
                    f.condition_bp = (f.condition_bp as i64 - drop).max(3000) as u16;
                }
            } else {
                let f = &mut w.regions[ri].facilities[fi];
                f.condition_bp = (f.condition_bp as i64 - 40).max(5000) as u16;
                continue;
            }
            if def.power_source || def.recipes.is_empty() {
                if def.recipes.is_empty() && staff_bp >= 5000 {
                    w.regions[ri].facilities[fi].operated = true;
                }
                continue;
            }
            let Some(ridx) = method else {
                w.regions[ri].facilities[fi].run = None;
                continue;
            };
            let rec = &def.recipes[ridx];
            let mut blockers = 0u16;
            let mut missing: Vec<Good> = Vec::new();
            let is_research = rec.research.is_some();
            // the rate the filled posts allow; it is also what the works asked service for
            let base = if is_research { skilled_bp } else { staff_bp };
            let mut rate = base;
            if rate < 9000 {
                blockers |= if is_research || skilled_bp < 9000 { 2 } else { 1 };
            }
            if cond < rate {
                rate = cond;
                blockers |= 64;
            }
            if unrest_factor < rate {
                rate = unrest_factor;
                blockers |= 512;
            }
            // service is rationed: each works gets the same share of what it asked for,
            // so the works of a region never draw more than the region has
            if rec.shaft > 0 && base * pw.shaft_bp / 10_000 < rate {
                rate = base * pw.shaft_bp / 10_000;
                blockers |= 8;
            }
            if rec.elec > 0 && base * pw.elec_bp / 10_000 < rate {
                rate = base * pw.elec_bp / 10_000;
                blockers |= 16;
            }
            if rec.compute > 0 && base * compute_bp / 10_000 < rate {
                rate = base * compute_bp / 10_000;
                blockers |= 32;
            }
            // storage throttle
            let mut unthrottled: Option<i64> = None;
            if !rec.outputs.is_empty() {
                let mut throttle = 0i64;
                for (g, _) in &rec.outputs {
                    let t = targets[g.index()];
                    let s = stock_start[g.index()];
                    let th = if s <= t { 10_000 } else if s >= 2 * t { 0 } else { (2 * t - s) * 10_000 / t };
                    throttle = throttle.max(th);
                }
                if throttle < rate {
                    unthrottled = Some(rate);
                    rate = throttle;
                    blockers |= 128;
                }
            }
            // a line with four accepted assemblies on hand keeps its crews but builds no more
            if rec.assembly > 0 && w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).count() >= 4 {
                rate = 0;
                blockers |= 128;
            }
            // deposit: every tonne raised is drawn from the ground, and wasteful
            // workings disturb more than they raise
            let mut quality = 10_000i64;
            // the rate at which the workings take the last of a deposit, if they do this month
            let mut last_rate: Option<i64> = None;
            if let Some(d) = rec.depletes {
                match w.regions[ri].deposits.iter().find(|x| x.kind == d) {
                    Some(dep) if dep.remaining > 0 => {
                        quality = dep.quality_bp as i64;
                        let raised: i64 = rec.outputs.iter().filter(|(g, _)| !(rec.helium && *g == Good::Helium)).map(|(_, a)| a * level).sum::<i64>() * rate / 10_000;
                        let drawn = raised * rec.disturb_bp / 10_000;
                        if drawn > dep.remaining {
                            // rounded up, so the crews and the service for the last tonnes are really engaged
                            rate = (rate * dep.remaining + drawn - 1) / drawn.max(1);
                            last_rate = Some(rate);
                            blockers |= 256;
                        }
                    }
                    _ => {
                        rate = 0;
                        blockers |= 256;
                    }
                }
            }
            // inputs (an installation serving partners takes their share as well; if
            // it cannot be supplied the rate falls for everyone it serves)
            let before_inputs = rate;
            for (g, a) in &rec.inputs {
                let need = a * level * rate / 10_000 * load / 10_000;
                if need > 0 {
                    let have = w.civs[si].stock_of(*g).max(0);
                    if have < need {
                        rate = rate * have / need;
                        blockers |= 4;
                        missing.push(*g);
                    }
                }
            }
            let inputs_bp = if rate < before_inputs { ratio_bp(rate, before_inputs) } else { 10_000 };
            let mut rate = rate.clamp(0, 10_000);
            // no works draws service that is not there: what is left in the region's
            // (and for compute the nation's) account bounds the rate exactly
            let elec_full = rec.elec * level * load / 10_000;
            for (per_full, left, flag) in [(rec.shaft * level, pw.shaft_left, 8u16), (elec_full, pw.elec_left, 16), (rec.compute * level, compute_left, 32)] {
                let fitted = fit_rate(rate, per_full, left);
                if fitted < rate {
                    rate = fitted;
                    blockers |= flag;
                }
            }
            // what the works stood ready to make this month and did not make only
            // because the stores were full: the rate their posts, inputs in store and
            // service would have carried, less the rate they ran at. A memorandum
            // (`Flows::withheld`): nothing is made and no input is taken for it.
            if let (Some(free), None) = (unthrottled, rec.depletes) {
                let mut ready = free;
                for (g, a) in &rec.inputs {
                    let need = a * level * ready / 10_000 * load / 10_000;
                    if need > 0 {
                        let have = w.civs[si].stock_of(*g).max(0);
                        if have < need {
                            ready = ready * have / need;
                        }
                    }
                }
                let mut ready = ready.clamp(0, 10_000);
                for (per_full, left) in [(rec.shaft * level, pw.shaft_left), (elec_full, pw.elec_left), (rec.compute * level, compute_left)] {
                    ready = fit_rate(ready, per_full, left);
                }
                if ready > rate {
                    for (g, a) in &rec.outputs {
                        withheld[g.index()] += a * level * (ready - rate) / 10_000;
                    }
                }
            }
            let (shaft_used, elec_used, comp_used) = (rec.shaft * level * rate / 10_000, elec_full * rate / 10_000, rec.compute * level * rate / 10_000);
            pw.shaft_left -= shaft_used;
            pw.elec_left -= elec_used;
            compute_left -= comp_used;
            compute_used += comp_used;
            w.regions[ri].last.power.shaft_used += shaft_used;
            w.regions[ri].last.power.elec_used += elec_used;
            for (g, a) in &rec.inputs {
                let took = w.civs[si].take(*g, a * level * rate / 10_000 * load / 10_000);
                w.regions[ri].last.infra.used[g.index()] += took;
            }
            // land works: the site's bonus raises what the land grows, at most to
            // twice the recipe (design chapter 36, section 4.1, channel 2)
            let land_bp = if def.land { land_yield_bp(&w.regions[ri], def) } else { 10_000 };
            let mut gas_out = 0i64;
            for (g, a) in &rec.outputs {
                // the hard ceiling of every works: its recipe, its levels and its rate
                // (for land works, times the land's yield, at most twice)
                let ceiling = a * level * rate / 10_000 * land_bp / 10_000;
                let mut out = ceiling;
                if rec.helium && *g == Good::Helium {
                    // separated from the gas raised this month, at the field's content
                    let bp = w.regions[ri].deposits.iter().find(|x| Some(x.kind) == rec.depletes).map(|x| x.helium_bp as i64).unwrap_or(0);
                    out = (gas_out * bp / 10_000).min(ceiling);
                    region_out[g.index()] += out;
                    continue;
                }
                if rec.depletes.is_some() {
                    match w.regions[ri].deposits.iter_mut().find(|x| Some(x.kind) == rec.depletes) {
                        Some(dep) => {
                            // the ground gives up at least what is raised; of what is raised,
                            // the ore's quality decides how much is worth carrying away
                            let mut raised = out;
                            let mut drawn = raised * rec.disturb_bp / 10_000;
                            // the last of a deposit comes out whole, so a worked-out
                            // deposit really reaches zero instead of a few tonnes
                            let last = last_rate == Some(rate) && rec.outputs.len() == 1;
                            if drawn > dep.remaining || last {
                                drawn = dep.remaining.max(0);
                                // never more than the workings raise at this rate
                                raised = raised.min(drawn * 10_000 / rec.disturb_bp);
                            }
                            out = raised * (5000 + quality / 2) / 10_000;
                            if *g == Good::Gas {
                                gas_out = raised;
                            }
                            dep.remaining -= drawn;
                            dep.drawn += drawn;
                            dep.delivered += out;
                        }
                        None => out = 0,
                    }
                }
                debug_assert!(out >= 0 && out <= ceiling && ceiling <= a * level * 2, "{} makes {out} of {g:?} above its ceiling {ceiling}", def.key);
                region_out[g.index()] += out.min(ceiling);
            }
            if let Some((class, pts)) = rec.research {
                // one researcher-month per staffed research post, up to what the
                // installation supports; a post nobody holds supplies nothing
                let staff_pts = skilled_count.min(pts * level);
                let support = [cond, if rec.elec > 0 { pw.elec_bp } else { 10_000 }, if rec.compute > 0 { compute_bp } else { 10_000 }, unrest_factor]
                    .into_iter()
                    .min()
                    .unwrap();
                research_cap[class.index()] += staff_pts * support / 10_000 * inputs_bp / 10_000 * research_eff / 10_000;
            }
            compute_made += rec.out_compute * level * rate / 10_000;
            let f = &mut w.regions[ri].facilities[fi];
            if rec.assembly > 0 {
                f.assembly_progress += rec.assembly * rate / 10_000;
            }
            if rate >= 5000 {
                f.operated = true;
            }
            f.run = Some(RunStat { recipe: ridx, rate_bp: rate as u16, blockers, missing });
        }
        // carriage to the common stock. Output up to what the region's own recipes
        // took of the same good this month never leaves the region and pays nothing
        // (an integrated chain); the rest pays the region's link loss and, when the
        // region's freight is congested, the congestion loss on top - the capital
        // included. Nothing here can deliver more than was made.
        let keep_bp = (link_bp - infra.congestion_bp).clamp(0, 10_000);
        let month = &mut w.regions[ri].last.infra;
        for g in 0..NG {
            let out = region_out[g];
            if out <= 0 {
                continue;
            }
            let exempt = out.min(month.used[g]).max(0);
            let delivered = exempt + (out - exempt) * keep_bp / 10_000;
            debug_assert!(delivered <= out && exempt <= delivered);
            month.made[g] = out;
            month.delivered[g] = delivered;
            month.exempt[g] = exempt;
            // what the same output would have lost had all of it been carried
            month.chain_saved[g] = delivered - out * keep_bp / 10_000;
            made[g] += out;
            made_net[g] += delivered;
        }
    }

    // ---- 5. commit -----------------------------------------------------------
    for &ri in &regs {
        let r = &w.regions[ri];
        let l = &r.last.labor;
        civ_labor.working_age += l.working_age;
        civ_labor.food += l.food;
        civ_labor.facilities += l.facilities;
        civ_labor.projects += l.projects;
        civ_labor.household += l.household;
        civ_labor.students += l.students;
        civ_labor.teachers += l.teachers;
        for q in 0..NQ {
            qual_employed[q] += r.last.qual_employed[q] + r.teachers[q];
        }
        for t in 0..Tag::COUNT {
            tag_activity[t] += r.last.tag_staff[t] as i64;
        }
    }
    civ_labor.soldiers = soldiers;
    let civ = &mut w.civs[si];
    // everything made is booked as production where it was made; what carriage to
    // the common stock cost is booked as lost
    for g in Good::ALL {
        let (gross, net) = (made[g.index()], made_net[g.index()].min(made[g.index()]));
        if gross > 0 {
            civ.add(*g, gross);
            civ.lose(*g, gross - net);
        }
    }
    if civ.flows.withheld.len() < NG {
        civ.flows.withheld.resize(NG, 0);
    }
    for g in 0..NG {
        civ.flows.withheld[g] += withheld[g];
    }
    civ.labor = civ_labor;
    civ.qual_employed = qual_employed;
    civ.research_cap = research_cap;
    civ.compute_supply = compute_made;
    civ.compute_demand = compute_demand_total;
    civ.compute_used = compute_used;
    // activities feed the evidence model; square-root so scale helps but saturates
    for t in 0..Tag::COUNT {
        civ.tag_activity[t] = activity_index(tag_activity[t]);
    }
    civ.tag_activity[Tag::War as usize] = activity_index(soldiers as i64);
    civ.tag_activity[Tag::Teach as usize] += activity_index(civ.labor.students as i64);

    // jump assemblies leaving the lines
    let yard = c.f("jump_yard");
    for &ri in &regs {
        let done = {
            let Some(f) = w.regions[ri].fac_mut(yard) else { continue };
            if f.assembly_progress >= 1000 {
                f.assembly_progress -= 1000;
                true
            } else {
                false
            }
        };
        if done {
            let id = w.id();
            let month = w.month;
            let when = crate::util::event_label(&w.cfg, month);
            let name = w.regions[ri].name.clone();
            w.civs[si].ftl.assemblies.push(Assembly { id, yard_region: ri as RegionId, built: month, retired: false });
            let count = w.civs[si].ftl.assemblies.len();
            crate::sim::chronicle::moment(
                w,
                seat,
                MomentCategory::Endgame,
                format!("Jump assembly {} accepted", count),
                format!("The line at {} delivered a standard jump assembly after two years of continuous work.", name),
                Some(ri as RegionId),
                "assembly",
                true,
                vec![format!("Assembly #{id} accepted in {when}")],
            );
        }
    }
}

/// What a land works' site makes of its recipe, basis points (10,000 = the recipe):
/// old-growth forest for forestry, wild herds for horse breeding, a floodplain
/// for fibre crops; never more than twice the recipe.
pub fn land_yield_bp(r: &Region, def: &FacDef) -> i64 {
    let bonus = match def.key {
        "camp" => r.bonus(Bonus::OldGrowth),
        "horse_farm" => r.bonus(Bonus::WildHerds),
        "fibre_farm" => r.bonus(Bonus::Floodplain),
        _ => 0,
    };
    (10_000 + bonus).clamp(0, 20_000)
}

/// Evidence index of a head count: one hundred times the square root of the
/// thousands of people engaged (a thousand people give 100, a million 3,162).
pub fn activity_index(people: i64) -> i64 {
    isqrt(people.max(0) * 10)
}

/// The highest rate not above `rate` at which a works drawing `per_full` of a
/// service at full rate takes no more than the `left` that exists.
fn fit_rate(rate: i64, per_full: i64, left: i64) -> i64 {
    if per_full <= 0 || per_full * rate / 10_000 <= left {
        return rate;
    }
    ((left.max(0) as i128 * 10_000 / per_full as i128) as i64).min(rate)
}

/// The rate the filled posts of a works allow. A works whose qualified posts
/// (its own and those its method adds) are part empty runs slower than its head
/// count alone says; one that needs no qualified people has `skilled_bp` at 10,000.
fn staff_rate(_def: &FacDef, f: &Facility) -> i64 {
    if f.staff_needed == 0 {
        return 10_000;
    }
    let total = f.staffed as i64 * 10_000 / f.staff_needed as i64;
    total * (5000 + f.skilled_bp as i64 / 2) / 10_000
}

/// First recipe whose knowledge requirement holds and whose inputs are in stock;
/// falls back to the first known recipe so the blocker can be reported.
fn pick_recipe(w: &World, seat: SeatId, def: &FacDef) -> Option<usize> {
    let civ = &w.civs[seat as usize];
    let mut first: Option<usize> = None;
    for (i, r) in def.recipes.iter().enumerate() {
        if !recipe_ok(w, seat, r) {
            continue;
        }
        if first.is_none() {
            first = Some(i);
        }
        if r.inputs.iter().all(|(g, a)| civ.stock_of(*g) * 20 >= *a) {
            return Some(i);
        }
    }
    first
}
