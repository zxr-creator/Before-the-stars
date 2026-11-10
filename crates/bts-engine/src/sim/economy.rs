//! Monthly labour allocation, power, production and upkeep.
//!
//! One person works one job. Food comes first; a bounded share of the remaining
//! labour can be called up for public projects; the rest staffs facilities in
//! the order of the government's category weights. Inputs are read from stock at
//! the start of the month and outputs become available next month, so a recipe
//! can never consume something produced later in the same month.
//!
//! Head counts are real people. Yields and other per-person coefficients are
//! stored per thousand people and applied as `people * coefficient / 1000`.

use crate::content::{content, Cap, FacDef, Recipe, Tag, FOOD_PER_PERSON_MONTH};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

/// Food methods a civilization can use. Yields are rations per thousand workers
/// per month; the chemical and fuel draws are tonnes per thousand field workers.
pub struct FoodTech {
    pub forage: i64,
    pub field: i64,
    pub pasture: i64,
    pub fish: i64,
    pub fish_port: i64,
    pub chem_per_worker: i64,
    pub fuel_per_worker: i64,
    pub label: &'static str,
}

pub fn food_tech(civ: &Civ, has_pasture: bool) -> FoodTech {
    let k = |id: &str| civ.knows_id(id);
    let mut field = 3000;
    let mut label = "Hand cultivation";
    if k("T010") {
        field = 3300;
    }
    if k("T020") && has_pasture {
        field = 4600;
        label = "Animal traction";
    }
    if k("T056") {
        field = field * 11 / 10;
    }
    let mut chem = 0;
    let mut fuel = 0;
    if k("T095") && civ.stock_of(Good::Chemicals) > 0 {
        field = 7200;
        chem = 10;
        label = "Manufactured inputs";
    }
    if k("T094") && civ.stock_of(Good::Fuel) > 0 {
        field = if chem > 0 { 14_000 } else { 9_000 };
        fuel = 10;
        label = "Mechanized farming";
    }
    if k("T133") && chem > 0 && fuel > 0 {
        field = 20_000;
        label = "Restorative mechanized farming";
    }
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
    if k("T094") && fuel > 0 {
        fish_port = 7500;
    }
    FoodTech { forage: 2600, field, pasture, fish, fish_port, chem_per_worker: chem, fuel_per_worker: fuel, label }
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
    inputs: bool,
}

struct RegionPlan {
    idx: usize,
    workers: u32,
    opts: Vec<FoodOpt>,
    food_workers: u32,
    food_made: i64,
    max_food_workers: u32,
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

/// Co-located productive buildings share general support posts (stores, hauling,
/// supervision). Only maintained, enabled levels count; qualified posts, machine
/// capacity and all material/energy flows remain unchanged. No extra output.
pub fn scale_saving_bp(def: &FacDef, f: &Facility) -> u16 {
    if !f.enabled || f.condition_bp < 7500 || def.food || def.general == 0 || def.recipes.is_empty()
        || !matches!(def.labor, Some(LaborCategory::Industry | LaborCategory::Extraction)) {
        return 0;
    }
    (f.level.saturating_sub(1) as u32 * 200).min(2000) as u16
}

fn general_posts(def: &FacDef, f: &Facility) -> u32 {
    let base = def.general as u64 * f.level as u64;
    // Round requirements up: many tiny buildings cannot exploit fractional posts.
    ((base * (10_000 - scale_saving_bp(def, f) as u64) + 9999) / 10_000) as u32
}

/// Effective level cap of a facility in a region for a civilization.
pub fn level_cap(w: &World, seat: SeatId, region: usize, def: &FacDef) -> u16 {
    use crate::content::Site;
    let r = &w.regions[region];
    let site_cap: u16 = match def.site {
        Site::Any => def.max_level,
        Site::Arable => r.arable,
        Site::Pasture => r.pasture,
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

pub fn step(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    if w.civs[si].status == SeatStatus::Eliminated {
        return;
    }
    let regs: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].controller == Some(seat)).collect();
    if regs.is_empty() {
        return;
    }
    let pasture_k = c.f("pasture");
    let fields_k = c.f("fields");
    let fishery_k = c.f("fishery");
    // cultivators, herders and fishers one level occupies
    let (field_crew, pasture_crew, fishery_crew) = (c.facilities[fields_k].general, c.facilities[pasture_k].general, c.facilities[fishery_k].general);
    let has_pasture = regs.iter().any(|i| w.regions[*i].fac(pasture_k).map(|f| f.level > 0).unwrap_or(false));
    let ft = food_tech(&w.civs[si], has_pasture);
    let link = link_efficiencies(w, seat);
    let mob_cap = mobilization_cap(w, seat) as i64;
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
        if let Some(f) = r.fac(fields_k) {
            if f.enabled && f.level > 0 {
                // full husbandry needs five hundred agronomists for each level of fields
                let agr = r.quals[Qual::Agronomist.index()] as i64;
                let skill = 8500 + 1500 * (agr * 2).min(f.level as i64 * 1000) / (f.level as i64 * 1000).max(1);
                let tool = if tools_ok { 10_000 } else { 7000 };
                let y = ft.field * skill / 10_000 * tool / 10_000 * f.condition_bp.max(5000) as i64 / 10_000;
                let irrigated = ((r.cap(Cap::Irrigation) / 1000) as u16).min(f.level);
                if irrigated > 0 {
                    opts.push(FoodOpt { yield_k: adj(y * 125 / 100), capacity: irrigated as u32 * field_crew, used: 0, tag: Tag::Farm, inputs: true });
                }
                if f.level > irrigated {
                    opts.push(FoodOpt { yield_k: adj(y), capacity: (f.level - irrigated) as u32 * field_crew, used: 0, tag: Tag::Farm, inputs: true });
                }
            }
        }
        if let Some(f) = r.fac(pasture_k) {
            if f.enabled && f.level > 0 {
                opts.push(FoodOpt { yield_k: adj(ft.pasture), capacity: f.level as u32 * pasture_crew, used: 0, tag: Tag::Farm, inputs: false });
            }
        }
        if let Some(f) = r.fac(fishery_k) {
            if f.enabled && f.level > 0 {
                let port = r.cap(Cap::Port) > 0;
                let y = if port { ft.fish_port } else { ft.fish };
                opts.push(FoodOpt { yield_k: adj(y), capacity: f.level as u32 * fishery_crew, used: 0, tag: Tag::Sea, inputs: false });
            }
        }
        // the land feeds foragers only up to what grows wild
        opts.push(FoodOpt { yield_k: adj(ft.forage), capacity: (r.wild * 1000 / ft.forage).min(u32::MAX as i64) as u32, used: 0, tag: Tag::Forage, inputs: false });
        opts.sort_by(|a, b| b.yield_k.cmp(&a.yield_k));
        plans.push(RegionPlan { idx: ri, workers, opts, food_workers: 0, food_made: 0, max_food_workers: (workers as u64 * 94 / 100) as u32 });
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
    let mut made = vec![0i64; NG];
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
        shaft_bp: i64,
        elec_bp: i64,
        elec_supply: i64,
        elec_demand: i64,
        grid: bool,
        motors: bool,
    }
    let mut powers: Vec<RegionPower> = Vec::new();
    let motors = w.civs[si].knows_id("T101");
    let prev_compute = w.civs[si].compute_supply;

    for p in &plans {
        let ri = p.idx;
        // project labour demand in this region
        let mut demand: i64 = 0;
        for pr in &w.civs[si].projects {
            if pr.paused || pr.region != Some(ri as RegionId) || !crate::sim::projects::uses_labor(&pr.kind) {
                continue;
            }
            demand += (pr.work_needed - pr.work_done).min(pr.max_per_month).max(0);
        }
        let unrest_factor = 10_000 - w.regions[ri].unrest_bp as i64 * 7 / 10;
        let r = &mut w.regions[ri];
        let mut month = RegionMonth { qual_employed: vec![0; NQ], tag_staff: vec![0; Tag::COUNT], ..Default::default() };
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

        // project labour: a called-up worker supplies one worker-month; builders count double
        let cap_workers = (nonfood as i64 * mob / 10_000) as u32;
        let bi = Qual::Builder.index();
        let builders = (avail[bi] as i64).min(cap_workers as i64).min((demand.max(0) + 1) / 2) as u32;
        avail[bi] -= builders;
        month.qual_employed[bi] += builders;
        let mut proj_workers = builders;
        let mut proj_work: i64 = builders as i64 * 2;
        if proj_work < demand && proj_workers < cap_workers {
            let want = (demand - proj_work).min(u32::MAX as i64) as u32;
            let take = want.min(cap_workers - proj_workers).min(unskilled);
            unskilled -= take;
            proj_workers += take;
            proj_work += take as i64;
        }
        month.labor.projects = proj_workers;
        month.project_labor_free = proj_work * unrest_factor / 10_000;

        // staffing, in two passes: qualified people take skilled posts everywhere first,
        // then general posts are filled, so a programmer is never spent on a pit crew
        // while a computing centre stands empty
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
            for (quals, n) in &def.skilled {
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
        let mut open_general: u32 = 0;
        for (fi, skilled_needed, skilled_got) in skilled {
            let f = &mut r.facilities[fi];
            let def = &c.facilities[f.kind];
            let positions = skilled_needed + general_posts(def, f);
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
    for p in &plans {
        let ri = p.idx;
        let mut shaft_supply: i64 = 0;
        let mut elec_supply: i64 = 0;
        let mut shaft_demand: i64 = 0;
        let mut elec_demand: i64 = 0;
        let unrest_factor = 10_000 - w.regions[ri].unrest_bp as i64 * 7 / 10;
        for fi in 0..w.regions[ri].facilities.len() {
            let (kind, level, staff_bp, cond, enabled) = {
                let f = &w.regions[ri].facilities[fi];
                (f.kind, f.level as i64, staff_rate(&c.facilities[f.kind], f), f.condition_bp as i64, f.enabled)
            };
            let def = &c.facilities[kind];
            if !enabled || level == 0 {
                continue;
            }
            if def.power_source {
                let Some(ridx) = pick_recipe(w, seat, def) else { continue };
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
                    w.civs[si].take(*g, amt);
                }
                shaft_supply += rec.out_shaft * level * rate / 10_000;
                elec_supply += rec.out_elec * level * rate / 10_000;
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
            } else if let Some(ridx) = pick_recipe(w, seat, def) {
                let rec = &def.recipes[ridx];
                shaft_demand += rec.shaft * level * staff_bp / 10_000;
                elec_demand += rec.elec * level * staff_bp / 10_000;
                compute_demand_total += rec.compute * level * staff_bp / 10_000;
            }
        }
        // generators convert spare shaft work; motors let electricity drive shafts
        let gen_cap = w.regions[ri].cap(Cap::GenCap);
        if gen_cap > 0 && shaft_supply > shaft_demand {
            let x = gen_cap.min(shaft_supply - shaft_demand);
            shaft_supply -= x;
            elec_supply += x * 9 / 10;
        }
        let grid = w.regions[ri].cap(Cap::GridLink) > 0;
        if grid {
            if elec_supply > elec_demand {
                grid_surplus += elec_supply - elec_demand;
            } else {
                grid_deficit += elec_demand - elec_supply;
            }
        }
        let r = &mut w.regions[ri];
        r.last.shaft_supply = shaft_supply;
        r.last.shaft_demand = shaft_demand;
        r.last.elec_supply = elec_supply;
        r.last.elec_demand = elec_demand;
        powers.push(RegionPower { ri, shaft_bp: 10_000, elec_bp: 10_000, elec_supply, elec_demand, grid, motors });
    }
    let grid_pool = grid_surplus * 92 / 100;
    let grid_ratio = if grid_deficit > 0 { ratio_bp(grid_pool, grid_deficit) } else { 10_000 };
    for pw in powers.iter_mut() {
        let r = &mut w.regions[pw.ri];
        let mut elec_avail = pw.elec_supply;
        if pw.grid && pw.elec_supply < pw.elec_demand {
            elec_avail += (pw.elec_demand - pw.elec_supply) * grid_ratio / 10_000;
        }
        let mut shaft_avail = r.last.shaft_supply;
        let shaft_demand = r.last.shaft_demand;
        if pw.motors && shaft_avail < shaft_demand && elec_avail > pw.elec_demand {
            let spare = elec_avail - pw.elec_demand;
            let add = (shaft_demand - shaft_avail).min(spare * 9 / 10);
            shaft_avail += add;
            elec_avail -= add * 10 / 9;
            r.last.elec_demand += add * 10 / 9;
        }
        pw.shaft_bp = if shaft_demand > 0 { ratio_bp(shaft_avail, shaft_demand) } else { 10_000 };
        pw.elec_bp = if pw.elec_demand > 0 { ratio_bp(elec_avail, pw.elec_demand) } else { 10_000 };
        r.last.elec_supply = elec_avail.max(r.last.elec_supply);
    }
    let compute_bp = if compute_demand_total > 0 { ratio_bp(prev_compute, compute_demand_total) } else { 10_000 };
    let mut compute_made: i64 = 0;

    // household craft: a little building material, only while stores have room for it
    {
        let t = stock_target(&w.civs[si], Good::Materials);
        let have = w.civs[si].stock_of(Good::Materials);
        if have < 2 * t {
            let bp = if have <= t { 10_000 } else { (2 * t - have) * 10_000 / t };
            made[Good::Materials.index()] += household_total * HOUSEHOLD_CRAFT_PER_K * bp / 10_000 / 1000;
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
            let moved = crate::sim::population::move_people(&mut w.regions, *src, sink, with_family, false);
            let workers = (moved as u64 * working as u64 / pop.max(1) as u64) as u32;
            *n -= workers.min(*n);
            open -= workers.min(open);
        }
    }

    // ---- 3. food output and field inputs -------------------------------------
    for p in &plans {
        let mut farm_workers = 0i64;
        for o in &p.opts {
            if o.inputs {
                farm_workers += o.used as i64;
            }
        }
        if ft.chem_per_worker > 0 {
            w.civs[si].take(Good::Chemicals, farm_workers * ft.chem_per_worker / 1000);
        }
        if ft.fuel_per_worker > 0 {
            w.civs[si].take(Good::Fuel, farm_workers * ft.fuel_per_worker / 1000);
        }
        made[Good::Food.index()] += p.food_made;
    }

    // ---- 4. production ---------------------------------------------------------
    let targets: Vec<i64> = Good::ALL.iter().map(|g| stock_target(&w.civs[si], *g)).collect();
    let stock_start: Vec<i64> = w.civs[si].stock.clone();
    for (pi, p) in plans.iter().enumerate() {
        let ri = p.idx;
        let pw = &powers[pi];
        let unrest_factor = 10_000 - w.regions[ri].unrest_bp as i64 * 7 / 10;
        let link_bp = link[ri];
        for &kind in &order {
            let def = &c.facilities[kind];
            let Some(fi) = w.regions[ri].facilities.iter().position(|f| f.kind == kind) else { continue };
            let (level, cond, enabled, staff_bp, skilled_bp, skilled_count) = {
                let f = &w.regions[ri].facilities[fi];
                let sk: u32 = def.skilled.iter().map(|(_, n)| *n * f.level as u32).sum();
                (f.level as i64, f.condition_bp as i64, f.enabled, staff_rate(def, f), f.skilled_bp as i64, sk as i64 * f.skilled_bp as i64 / 10_000)
            };
            if level == 0 {
                continue;
            }
            // upkeep and condition
            if enabled {
                let mut ok = 10_000i64;
                for (g, a) in &def.upkeep {
                    let need = a * level;
                    let got = w.civs[si].take(*g, need);
                    ok = ok.min(ratio_bp(got, need));
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
            let Some(ridx) = pick_recipe(w, seat, def) else {
                w.regions[ri].facilities[fi].run = None;
                continue;
            };
            let rec = &def.recipes[ridx];
            let mut blockers = 0u16;
            let mut missing: Vec<Good> = Vec::new();
            let is_research = rec.research.is_some();
            let mut rate = if is_research { skilled_bp } else { staff_bp };
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
            if rec.shaft > 0 && pw.shaft_bp < rate {
                rate = pw.shaft_bp;
                blockers |= 8;
            }
            if rec.elec > 0 && pw.elec_bp < rate {
                rate = pw.elec_bp;
                blockers |= 16;
            }
            if rec.compute > 0 && compute_bp < rate {
                rate = compute_bp;
                blockers |= 32;
            }
            // storage throttle
            if !rec.outputs.is_empty() {
                let mut throttle = 0i64;
                for (g, _) in &rec.outputs {
                    let t = targets[g.index()];
                    let s = stock_start[g.index()];
                    let th = if s <= t { 10_000 } else if s >= 2 * t { 0 } else { (2 * t - s) * 10_000 / t };
                    throttle = throttle.max(th);
                }
                if throttle < rate {
                    rate = throttle;
                    blockers |= 128;
                }
            }
            // a line with four accepted assemblies on hand keeps its crews but builds no more
            if rec.assembly > 0 && w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).count() >= 4 {
                rate = 0;
                blockers |= 128;
            }
            // deposit
            let mut quality = 10_000i64;
            if let Some(d) = rec.depletes {
                match w.regions[ri].deposits.iter().find(|x| x.kind == d) {
                    Some(dep) if dep.remaining > 0 => {
                        quality = dep.quality_bp as i64;
                        let out: i64 = rec.outputs.iter().map(|(_, a)| a * level).sum::<i64>() * rate / 10_000;
                        if out > dep.remaining {
                            rate = rate * dep.remaining / out.max(1);
                            blockers |= 256;
                        }
                    }
                    _ => {
                        rate = 0;
                        blockers |= 256;
                    }
                }
            }
            // inputs
            for (g, a) in &rec.inputs {
                let need = a * level * rate / 10_000;
                if need > 0 {
                    let have = w.civs[si].stock_of(*g).max(0);
                    if have < need {
                        rate = rate * have / need;
                        blockers |= 4;
                        missing.push(*g);
                    }
                }
            }
            let rate = rate.clamp(0, 10_000);
            for (g, a) in &rec.inputs {
                w.civs[si].take(*g, a * level * rate / 10_000);
            }
            for (g, a) in &rec.outputs {
                let mut out = a * level * rate / 10_000;
                if rec.depletes.is_some() {
                    if let Some(dep) = w.regions[ri].deposits.iter_mut().find(|x| Some(x.kind) == rec.depletes) {
                        // drained deep workings reach ore that shallow pits leave behind
                        let drawn = if rec.key == "deep" { out / 2 } else { out };
                        dep.remaining = (dep.remaining - drawn).max(0);
                    }
                    out = out * (5000 + quality / 2) / 10_000;
                }
                made[g.index()] += out * link_bp / 10_000;
            }
            if let Some((class, pts)) = rec.research {
                // one researcher-month per staffed research post, up to what the installation supports
                let staff_pts = skilled_count.min(pts * level);
                let base = if staff_pts > 0 { staff_pts } else { pts * level * skilled_bp / 10_000 };
                let support = [cond, if rec.elec > 0 { pw.elec_bp } else { 10_000 }, if rec.compute > 0 { compute_bp } else { 10_000 }, unrest_factor]
                    .into_iter()
                    .min()
                    .unwrap();
                let mut inputs_bp = 10_000;
                if !rec.inputs.is_empty() && rate < skilled_bp {
                    inputs_bp = ratio_bp(rate, skilled_bp.max(1));
                }
                research_cap[class.index()] += base * support / 10_000 * inputs_bp / 10_000;
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
    for g in Good::ALL {
        let amt = made[g.index()];
        if amt > 0 {
            civ.add(*g, amt);
        }
    }
    civ.labor = civ_labor;
    civ.qual_employed = qual_employed;
    civ.research_cap = research_cap;
    civ.compute_supply = compute_made;
    civ.compute_demand = compute_demand_total;
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
                vec![format!("Assembly #{id} accepted in month {month}")],
            );
        }
    }
}

/// Evidence index of a head count: one hundred times the square root of the
/// thousands of people engaged (a thousand people give 100, a million 3,162).
pub fn activity_index(people: i64) -> i64 {
    isqrt(people.max(0) * 10)
}

fn staff_rate(def: &FacDef, f: &Facility) -> i64 {
    if f.staff_needed == 0 {
        return 10_000;
    }
    let total = f.staffed as i64 * 10_000 / f.staff_needed as i64;
    if def.skilled.is_empty() {
        total
    } else {
        total * (5000 + f.skilled_bp as i64 / 2) / 10_000
    }
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
