//! Bounded, deterministic decision policy for the native opponents.
//!
//! Each round the controller: protects essentials (food, water), follows up
//! known bottlenecks visible in its own reports, trains people for posts that
//! actually exist, extends what is fully used, explores and settles within its
//! administrative reach, and negotiates over structured terms. It plans only
//! over what its observation contains: no future node IDs, no foreign ledgers.
//! Difficulty changes how many candidate actions it may take, how far ahead it
//! prepares and how carefully it weighs offers — never resources or information.
//!
//! Construction needs a qualified site crew, site power and time besides goods and
//! labour. The controller reads the price of every order from the quote its
//! observation carries (`OwnRegion.construction_sites`) and orders only what the
//! region's qualified residents, its call-up and its power (or coal and fuel in
//! store) can serve; it trains the people its orders are short of, and pauses an
//! order that holds part of a crew while the rest cannot be found.
//!
//! Head counts in an observation are real people; goods are base units (rations,
//! tonnes, lots) with 1,000 to the display unit. Thresholds below are written in
//! those units, and anything per person is stated per thousand people.

use crate::{Difficulty, NativeAi};
use bts_protocol::*;
use std::collections::{HashMap, HashSet};

const TIER_POWER: [i64; 6] = [1000, 2500, 6250, 15625, 39063, 97656];

/// One thousand people: the grain in which the policy reasons about head counts.
const K: i64 = 1000;

/// What last round took out of the stock of a good. Food that spoils has to be
/// replaced like food that is eaten. Other goods are lost in carriage, before they
/// reach the stock, which is no use of it.
fn used_in_year(l: &GoodLine) -> i64 {
    if l.good == Good::Food {
        l.consumed + l.lost
    } else {
        l.consumed
    }
}

/// What last round's production added to the stock of a good: the ledger states
/// output where it was made, so what carriage cost is taken off.
fn made_in_year(l: &GoodLine) -> i64 {
    if l.good == Good::Food {
        l.produced
    } else {
        (l.produced - l.lost).max(0)
    }
}

fn base_price(g: Good) -> i64 {
    match g {
        Good::Food => 4,
        Good::Materials => 5,
        Good::Tools => 12,
        Good::CopperOre | Good::IronOre | Good::Coal | Good::Crude => 7,
        Good::Minerals => 20,
        Good::Copper => 25,
        Good::Metal => 30,
        Good::Components => 60,
        Good::Conductors => 60,
        Good::Insulation => 40,
        Good::Fuel => 30,
        Good::Chemicals => 30,
        Good::Substrate => 200,
        Good::Electronics => 30,
        Good::Hardware => 400,
        Good::Spares => 20,
        Good::Media => 15,
        Good::Instruments => 80,
        Good::Medicine => 30,
    }
}

struct Plan<'a> {
    obs: &'a Observation,
    diff: Difficulty,
    actions: Vec<Action>,
    budget: usize,
    /// Stock not yet spoken for by open projects or by actions chosen this round (base units).
    avail: HashMap<Good, i64>,
    wanted: HashSet<Good>,
    builds: HashMap<RegionId, usize>,
    planned: HashSet<(RegionId, String)>,
    idle: HashMap<RegionId, i64>,
    /// Qualified residents of each governed region who can still be put on a site
    /// crew this round: those without a post, and a quarter of those in one (a crew
    /// outranks a post, but thinning the works has a cost).
    crew_pool: HashMap<(RegionId, Qual), i64>,
    /// Qualified people without a post anywhere under this seat: they move to a
    /// site that is short of them, a few each month.
    crew_spare: HashMap<Qual, i64>,
    /// People this seat's orders are short of, by the qualification asked for first.
    crew_wanted: HashMap<Qual, i64>,
    /// Shaft work each region has to spare for sites (base units a month).
    shaft_spare: HashMap<RegionId, i64>,
    /// People each region can still put on site crews within the call-up its
    /// practices allow, leaving a quarter of the call-up for plain labour.
    callup_room: HashMap<RegionId, i64>,
    /// Open orders that stand still for want of their site crew.
    crew_stalled: usize,
    /// Rounds longer than a year: plans are also written as standing orders, which
    /// the referee carries out every 1 January until the next round.
    long: bool,
    /// Years the round lasts.
    years: i64,
    /// Standing orders chosen this round. They do not count against the round's
    /// candidate actions: they restate what the plan already chose, for the years
    /// in which nobody decides.
    directives: Vec<Action>,
}

/// Months a clause may run this round: the wanted term clamped to the bounds the
/// referee states for the round's length (design chapter 36, section 2.5).
fn term(obs: &Observation, want: u16, own: (u16, u16)) -> u16 {
    let rm = obs.calendar.as_ref().map(|c| c.round_months).unwrap_or(12);
    let lo = (own.0 as u32).max(6).max(rm);
    let hi = (own.1 as u32).max(240).max(3 * rm);
    (want as u32).clamp(lo, hi).min(u16::MAX as u32 - 1) as u16
}

/// Facilities whose need grows with the population they serve.
fn grows_with_people(kind: &str) -> bool {
    matches!(kind, "fields" | "pasture" | "fishery" | "irrigation" | "waterworks" | "wells" | "sewers" | "water_treatment" | "clinic" | "hospital" | "granary" | "housing")
}

/// Whether an open order has stood still because part of its site crew is missing.
fn crew_stalled(p: &ProjectView) -> bool {
    !p.paused && p.last_progress == 0 && p.crew.iter().any(|c| c.on_site < c.needed)
}

impl<'a> Plan<'a> {
    fn new(obs: &'a Observation, diff: Difficulty) -> Plan<'a> {
        let mut avail = HashMap::new();
        for g in &obs.civ.goods {
            avail.insert(g.good, g.stock);
        }
        let mut builds = HashMap::new();
        let mut crew_stalled_count = 0;
        for p in &obs.projects {
            for (need, have) in p.inputs_needed.iter().zip(p.inputs_committed.iter()) {
                *avail.entry(need.good).or_insert(0) -= (need.amount - have.amount).max(0);
            }
            if crew_stalled(p) {
                crew_stalled_count += 1;
            }
            // an order that is paused, or waiting for people who do not exist yet, is
            // not using the region's builders: it does not count against new orders
            if p.kind == "build" && !p.paused && !crew_stalled(p) {
                if let Some(r) = p.region {
                    *builds.entry(r).or_insert(0) += 1;
                }
            }
        }
        let mut idle = HashMap::new();
        let mut crew_pool = HashMap::new();
        let mut crew_spare: HashMap<Qual, i64> = HashMap::new();
        let mut shaft_spare = HashMap::new();
        let mut callup_room = HashMap::new();
        for r in &obs.regions {
            if let Some(o) = &r.own {
                idle.insert(r.id, o.labor.household as i64);
                for q in &o.quals {
                    let free = (q.count as i64 - q.employed as i64).max(0);
                    crew_pool.insert((r.id, q.qual), free + q.employed.min(q.count) as i64 / 4);
                    *crew_spare.entry(q.qual).or_insert(0) += free;
                }
                shaft_spare.insert(r.id, (o.power.shaft_supply - o.power.shaft_demand).max(0));
                // the share of the people not needed for food that may be called up,
                // less the crews the region's open orders already ask for
                let l = &o.labor;
                let nonfood = (l.working_age as i64 * 92 / 100 - l.students as i64 - l.teachers as i64 - l.food as i64).max(0);
                let cap = nonfood * obs.civ.mobilization_cap_bp as i64 / 10_000 * obs.civ.policies.mobilization_bp as i64 / 10_000;
                let asked: i64 = obs.projects.iter().filter(|p| !p.paused && p.region == Some(r.id)).flat_map(|p| p.crew.iter()).map(|c| c.needed as i64).sum();
                callup_room.insert(r.id, cap * 3 / 4 - asked);
            }
        }
        let rm = obs.calendar.as_ref().map(|c| c.round_months).unwrap_or(12) as i64;
        // a long round is many years of government: up to four times the candidate
        // actions of a one-year round (two years each), never more
        let scale = (rm / 24).clamp(1, 4) as usize;
        Plan {
            obs,
            diff,
            actions: Vec::new(),
            budget: diff.candidates() * scale,
            avail,
            wanted: HashSet::new(),
            builds,
            planned: HashSet::new(),
            idle,
            crew_pool,
            crew_spare,
            crew_wanted: HashMap::new(),
            shaft_spare,
            callup_room,
            crew_stalled: crew_stalled_count,
            long: rm > 12,
            years: (rm / 12).max(1),
            directives: Vec::new(),
        }
    }
    /// The price of one more level of a facility in a region, as the seat is quoted it.
    fn quote(&self, region: &RegionView, kind: &str) -> Option<&'a BuildSiteView> {
        let obs: &'a Observation = self.obs;
        obs.regions.iter().find(|r| r.id == region.id).and_then(|r| r.own.as_ref()).and_then(|o| o.construction_sites.iter().find(|s| s.kind == kind))
    }
    /// How a site crew could be drawn from a pool of people by qualification: for
    /// each group, the people taken from each acceptable qualification in order of
    /// preference. `Err` names, for each group that cannot be filled, the
    /// qualification asked for first and how many are missing.
    fn draw_crew(pool: &dyn Fn(Qual) -> i64, crew: &[(Vec<Qual>, i64)]) -> Result<Vec<(Qual, i64)>, Vec<(Qual, i64)>> {
        let mut taken: Vec<(Qual, i64)> = Vec::new();
        let mut short: Vec<(Qual, i64)> = Vec::new();
        for (quals, need) in crew {
            let mut left = *need;
            for q in quals {
                let already: i64 = taken.iter().filter(|(x, _)| x == q).map(|(_, n)| *n).sum();
                let take = left.min((pool(*q) - already).max(0));
                if take > 0 {
                    taken.push((*q, take));
                    left -= take;
                }
                if left == 0 {
                    break;
                }
            }
            if left > 0 {
                if let Some(q) = quals.first() {
                    short.push((*q, left));
                }
            }
        }
        if short.is_empty() { Ok(taken) } else { Err(short) }
    }
    /// Reserve a site crew for an order in a region: from the region's own people,
    /// or failing that from qualified people without a post elsewhere, who will move
    /// to the site (only while no other order is already waiting for such a move).
    /// When neither can crew it, the missing people are noted so they get trained.
    fn reserve_crew(&mut self, region: RegionId, crew: &[(Vec<Qual>, i64)], may_move: bool) -> bool {
        if crew.is_empty() {
            return true;
        }
        // a region whose call-up cannot hold the crew cannot build it, whoever lives there
        let heads: i64 = crew.iter().map(|c| c.1).sum();
        if heads > *self.callup_room.get(&region).unwrap_or(&0) {
            return false;
        }
        let local = Self::draw_crew(&|q| *self.crew_pool.get(&(region, q)).unwrap_or(&0), crew);
        match local {
            Ok(taken) => {
                for (q, n) in taken {
                    *self.crew_pool.entry((region, q)).or_insert(0) -= n;
                    *self.crew_spare.entry(q).or_insert(0) -= n;
                }
                *self.callup_room.entry(region).or_insert(0) -= heads;
                true
            }
            Err(short) => {
                if may_move && self.crew_stalled == 0 {
                    if let Ok(taken) = Self::draw_crew(&|q| *self.crew_spare.get(&q).unwrap_or(&0), crew) {
                        for (q, n) in taken {
                            *self.crew_spare.entry(q).or_insert(0) -= n;
                            *self.crew_pool.entry((region, q)).or_insert(0) -= n;
                        }
                        self.crew_stalled += 1;
                        *self.callup_room.entry(region).or_insert(0) -= heads;
                        return true;
                    }
                }
                for (q, n) in short {
                    let w = self.crew_wanted.entry(q).or_insert(0);
                    *w = (*w).max(n);
                }
                false
            }
        }
    }
    /// Whether a region can crew one level of a facility now, without reserving anyone.
    fn can_crew(&self, region: &RegionView, kind: &str) -> bool {
        match self.quote(region, kind) {
            Some(q) => {
                let crew: Vec<(Vec<Qual>, i64)> = q.crew_per_level.iter().map(|c| (c.quals.clone(), c.count as i64)).collect();
                let heads: i64 = crew.iter().map(|c| c.1).sum();
                (heads == 0 || heads <= *self.callup_room.get(&region.id).unwrap_or(&0)) && Self::draw_crew(&|x| *self.crew_pool.get(&(region.id, x)).unwrap_or(&0), &crew).is_ok()
            }
            None => true,
        }
    }
    /// Site power for an order: the region's spare shaft work, or coal or fuel in
    /// store for the site engines for as long as the order takes at least. Returns
    /// false, and notes what is missing, when the site would stand without power.
    fn reserve_site_power(&mut self, region: &RegionView, per_month: i64, months: i64) -> bool {
        if per_month <= 0 {
            return true;
        }
        let spare = *self.shaft_spare.get(&region.id).unwrap_or(&0);
        if spare >= per_month {
            *self.shaft_spare.entry(region.id).or_insert(0) -= per_month;
            return true;
        }
        // site engines: a tonne of coal for 5 units, a tonne of fuel for 10
        let short = per_month - spare;
        for (g, per_tonne) in [(Good::Coal, 5), (Good::Fuel, 10)] {
            let tonnes = (short * months + per_tonne - 1) / per_tonne;
            // fuel the fields and everything else use in two months is not for the sites
            let kept = if g == Good::Fuel { self.line(g).map(|l| used_in_year(l) / 6).unwrap_or(0) } else { 0 };
            let have = *self.avail.get(&g).unwrap_or(&0) - kept;
            let yearly = self.line(g).map(|l| made_in_year(l) - used_in_year(l)).unwrap_or(0);
            if have >= tonnes || (have >= tonnes / 4 && yearly * months >= tonnes * 12) {
                *self.avail.entry(g).or_insert(0) -= tonnes;
                self.shaft_spare.insert(region.id, 0);
                return true;
            }
        }
        self.wanted.insert(Good::Coal);
        false
    }
    fn full(&self) -> bool {
        self.actions.len() >= self.budget
    }
    fn push(&mut self, a: Action) -> bool {
        if self.full() {
            return false;
        }
        self.actions.push(a);
        true
    }
    fn stock(&self, g: Good) -> i64 {
        self.obs.civ.goods.iter().find(|x| x.good == g).map(|x| x.stock).unwrap_or(0)
    }
    fn line(&self, g: Good) -> Option<&GoodLine> {
        self.obs.civ.goods.iter().find(|x| x.good == g)
    }
    fn fac_type(&self, kind: &str) -> Option<&'a FacilityType> {
        self.obs.catalog.facilities.iter().find(|f| f.kind == kind)
    }
    fn own_regions(&self) -> Vec<&'a RegionView> {
        let mut v: Vec<&RegionView> = self.obs.regions.iter().filter(|r| r.own.is_some() && r.owner == Some(self.obs.seat)).collect();
        v.sort_by_key(|r| (std::cmp::Reverse(r.own.as_ref().map(|o| o.population).unwrap_or(0)), r.id));
        v
    }
    fn level(&self, r: &RegionView, kind: &str) -> u16 {
        r.own.as_ref().and_then(|o| o.facilities.iter().find(|f| f.kind == kind)).map(|f| f.level).unwrap_or(0)
    }
    fn pending(&self, region: RegionId, kind: &str) -> bool {
        self.planned.contains(&(region, kind.to_string())) || self.obs.projects.iter().any(|p| p.kind == "build" && p.region == Some(region) && p.target.as_deref() == Some(kind))
    }
    fn civ_has(&self, kind: &str) -> bool {
        self.own_regions().iter().any(|r| self.level(r, kind) > 0)
    }
    fn civ_pending(&self, kind: &str) -> bool {
        self.planned.iter().any(|(_, k)| k == kind) || self.obs.projects.iter().any(|p| p.kind == "build" && p.target.as_deref() == Some(kind))
    }
    /// Level cap a region offers a facility type, from the seat's own survey records.
    fn site_cap(&self, ft: &FacilityType, r: &RegionView) -> u16 {
        if let Some(f) = r.own.as_ref().and_then(|o| o.facilities.iter().find(|f| f.kind == ft.kind)) {
            return f.max_level;
        }
        let Some(s) = &r.survey else { return 0 };
        let cap = match ft.site_key.as_str() {
            "any" => ft.max_level,
            "arable" => s.arable,
            "pasture" => s.pasture,
            "fishery" => s.fishery,
            "forest" => s.forest,
            "river" => {
                if r.river { ft.max_level } else if s.water as i64 >= 2500 * K { 2 } else { 0 }
            }
            "coast" => {
                if r.coastal { ft.max_level } else { 0 }
            }
            "hydro" => {
                if ft.kind == "hydro" { s.hydro / 2 } else { s.hydro }
            }
            "test_node" => {
                if r.test_node { ft.max_level } else { 0 }
            }
            key => {
                if let Some(d) = key.strip_prefix("deposit:") {
                    if s.deposits.iter().any(|x| format!("{:?}", x.kind).to_lowercase() == d.replace('_', "") && x.remaining > 0) { 12 } else { 0 }
                } else if let Some(k) = key.strip_prefix("with:") {
                    if self.level(r, k) > 0 { ft.max_level } else { 0 }
                } else {
                    0
                }
            }
        };
        cap.min(ft.max_level.max(1))
    }
    fn produces(&self, g: Good) -> bool {
        self.line(g).map(|l| l.produced > 0).unwrap_or(false)
    }
    /// Can the cost be met from unreserved stock or steady production? Marks shortfalls as wanted.
    fn affordable(&mut self, cost: &[GoodQty], levels: i64) -> bool {
        let mut ok = true;
        for c in cost {
            let need = c.amount * levels;
            let have = *self.avail.get(&c.good).unwrap_or(&0);
            let yearly = self.line(c.good).map(made_in_year).unwrap_or(0);
            if have < need * 6 / 10 && !(have >= need / 5 && yearly * 2 >= need) {
                self.wanted.insert(c.good);
                ok = false;
            }
        }
        ok
    }
    fn try_build(&mut self, region: &RegionView, kind: &str, levels: u16, priority: u8) -> bool {
        if self.full() {
            return false;
        }
        let Some(ft) = self.fac_type(kind) else { return false };
        if !ft.available || self.pending(region.id, kind) {
            return false;
        }
        let per_region = match self.diff {
            Difficulty::Easy => 2,
            Difficulty::Medium => 3,
            Difficulty::Hard => 5,
        };
        if *self.builds.get(&region.id).unwrap_or(&0) >= per_region && priority > 2 {
            return false;
        }
        let existing = self.level(region, kind);
        let cap = self.site_cap(ft, region);
        if existing >= cap {
            return false;
        }
        let levels = levels.min(cap - existing).max(1);
        // an order needs its goods, its site crew and its site power: all three are
        // looked at, so that whatever is missing is noted and gets made or trained
        let goods_ok = self.affordable(&ft.cost, levels as i64);
        let mut site_ok = true;
        if let Some(q) = self.quote(region, kind) {
            let crew: Vec<(Vec<Qual>, i64)> = q.crew_per_level.iter().map(|c| (c.quals.clone(), c.count as i64 * levels as i64)).collect();
            let saved = (self.crew_pool.clone(), self.crew_spare.clone(), self.crew_stalled, self.callup_room.clone());
            let crew_ok = self.reserve_crew(region.id, &crew, true);
            let power = q.site_power_per_level * levels as i64;
            let power_ok = !goods_ok || !crew_ok || self.reserve_site_power(region, power, q.min_months as i64);
            site_ok = crew_ok && power_ok;
            if !(goods_ok && site_ok) {
                (self.crew_pool, self.crew_spare, self.crew_stalled, self.callup_room) = saved;
            }
            if goods_ok && crew_ok && !power_ok && kind != "waterwheel" {
                // no power for the site and nothing to burn: a mill here would turn for it
                self.try_build(region, "waterwheel", 1, priority.min(3));
            }
        }
        if !goods_ok || !site_ok {
            return false;
        }
        for c in &ft.cost {
            *self.avail.entry(c.good).or_insert(0) -= c.amount * levels as i64;
        }
        *self.builds.entry(region.id).or_insert(0) += 1;
        self.planned.insert((region.id, kind.to_string()));
        let jobs: i64 = ft.jobs.iter().map(|j| j.count as i64).sum::<i64>() * levels as i64;
        *self.idle.entry(region.id).or_insert(0) -= jobs;
        let pushed = self.push(Action::StartProject { spec: ProjectSpec::Build { region: region.id, facility: kind.to_string(), levels }, priority: Some(priority) });
        if pushed && self.long {
            // keep what was ordered through the round, and for works that serve
            // people the growth the round's years will bring (0.3% a year)
            let target = existing + levels;
            let extra = if grows_with_people(kind) { ((target as i64 * self.years * 3 + 999) / 1000) as u16 } else { 0 };
            self.target(region.id, kind, (target + extra).min(cap), priority);
        }
        pushed
    }
    /// A standing build target for the years of this round.
    fn target(&mut self, region: RegionId, kind: &str, levels: u16, priority: u8) {
        if levels == 0 {
            return;
        }
        self.directives.push(Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::BuildTarget { region, facility: kind.to_string(), levels, priority: Some(priority) }), position: None });
    }
    /// Region best suited to host a new workplace that has no site constraint.
    fn workplace_region(&self, ft: &FacilityType) -> Option<&'a RegionView> {
        let jobs: i64 = ft.jobs.iter().map(|j| j.count as i64).sum();
        let mut best: Option<(i64, &RegionView)> = None;
        for r in self.own_regions() {
            if self.site_cap(ft, r) <= self.level(r, &ft.kind) || self.pending(r.id, &ft.kind) {
                continue;
            }
            let idle = *self.idle.get(&r.id).unwrap_or(&0);
            let link = r.own.as_ref().map(|o| o.link_efficiency_bp as i64).unwrap_or(0);
            // a hundred points for every thousand idle adults the workplace could take on
            let mut score = idle.min(jobs * 3) * 100 / K + link / 10;
            if r.id == self.obs.civ.capital {
                score += 300;
            }
            // works that load freight go where the transport still has room for them
            if loads_freight(ft) {
                if let Some(f) = r.own.as_ref().map(|o| &o.infrastructure).filter(|f| f.freight_capacity > 0) {
                    if f.freight_load >= f.freight_capacity {
                        score -= 600;
                    }
                }
            }
            // a region that has the people for the site crew comes before any that has not
            if self.can_crew(r, &ft.kind) {
                score += 1_000_000;
            }
            if best.map(|(s, _)| score > s).unwrap_or(true) {
                best = Some((score, r));
            }
        }
        best.map(|(_, r)| r)
    }
}

fn mix(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// The observation with last round's goods flows restated per year, so the policy
/// reads every round the same way whatever its length (rounds last 2 to 50 years).
/// It changes nothing the seat may know, only the unit of the totals.
pub fn per_year(obs: &Observation) -> Option<Observation> {
    let months = obs.calendar.as_ref().map(|c| c.last_round_months).unwrap_or(0) as i64;
    if months == 0 || months == 12 {
        return None;
    }
    let mut o = obs.clone();
    let y = |v: i64| (v as i128 * 12 / months as i128) as i64;
    for l in o.civ.goods.iter_mut() {
        l.produced = y(l.produced);
        l.consumed = y(l.consumed);
        l.traded_in = y(l.traded_in);
        l.traded_out = y(l.traded_out);
        l.lost = y(l.lost);
        l.withheld = y(l.withheld);
    }
    Some(o)
}

pub fn decide(ai: &mut NativeAi, obs: &Observation) -> Vec<Action> {
    if obs.status == SeatStatus::Eliminated || obs.outcome.is_some() {
        return Vec::new();
    }
    let scaled = if matches!(obs.phase, Phase::Plan | Phase::Negotiate) { per_year(obs) } else { None };
    let obs = scaled.as_ref().unwrap_or(obs);
    let n = obs.others.iter().map(|o| o.seat as usize + 1).max().unwrap_or(0).max(obs.seat as usize + 1).max(4);
    if ai.memory.grievances.len() < n {
        ai.memory.grievances.resize(n, 0);
        ai.memory.last_offer_round.resize(n, 0);
    }
    match obs.phase {
        Phase::Contact => contact(obs),
        Phase::Negotiate => negotiate(ai, obs),
        Phase::Plan => {
            ai.memory.rounds_seen += 1;
            plan(ai, obs)
        }
        Phase::Finished => Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// diplomacy
// ---------------------------------------------------------------------------

fn contact(obs: &Observation) -> Vec<Action> {
    let mut seats: Vec<SeatId> = obs.others.iter().filter(|o| o.contacted && o.status != SeatStatus::Eliminated).map(|o| o.seat).collect();
    // counterparts we are fighting or trading with first
    seats.sort_by_key(|s| {
        let o = obs.others.iter().find(|o| o.seat == *s).unwrap();
        (if o.at_war { 0 } else { 1 }, std::cmp::Reverse(o.trust), *s)
    });
    seats.truncate(MAX_CONTACTS);
    if seats.is_empty() {
        Vec::new()
    } else {
        vec![Action::SelectContacts { seats }]
    }
}

fn own_power(obs: &Observation) -> i64 {
    obs.armies.iter().map(|a| a.soldiers.iter().map(|(_, n)| *n as i64).sum::<i64>() * TIER_POWER[a.tier as usize] / 1000).sum()
}

fn their_power(obs: &Observation, seat: SeatId) -> i64 {
    let tier = obs.others.iter().find(|o| o.seat == seat).and_then(|o| o.observed_tier).unwrap_or(obs.civ.military_tier) as usize;
    obs.foreign_armies.iter().filter(|a| a.owner == seat).map(|a| (a.strength_low as i64 + a.strength_high as i64) / 2 * TIER_POWER[a.tier_estimate.map(|t| t as usize).unwrap_or(tier).min(5)] / 1000).sum()
}

fn their_population(obs: &Observation, seat: SeatId) -> i64 {
    obs.others.iter().find(|o| o.seat == seat).map(|o| (o.population_low as i64 + o.population_high as i64) / 2).unwrap_or(0)
}

fn borders(obs: &Observation, seat: SeatId) -> bool {
    obs.regions.iter().filter(|r| r.owner == Some(obs.seat)).any(|r| r.neighbors.iter().any(|n| obs.regions.iter().any(|x| x.id == n.region && x.owner == Some(seat))))
}

fn goods_value(obs: &Observation, g: Good, amount: i64, receiving: bool) -> i64 {
    let line = obs.civ.goods.iter().find(|x| x.good == g);
    let stock = line.map(|l| l.stock).unwrap_or(0);
    let yearly_use = line.map(used_in_year).unwrap_or(0);
    let mut price = base_price(g) * 100;
    // what we are short of is worth more to receive and more to keep
    if stock < yearly_use / 4 {
        price = price * 2;
    } else if stock > yearly_use * 2 + 400_000 {
        price /= 2;
    }
    if !receiving && stock < amount {
        price *= 3;
    }
    amount / 1000 * price / 100
}

/// Value of an offer to this seat in rough labour-months. Positive is good for us.
fn offer_value(ai: &NativeAi, obs: &Observation, offer: &OfferView) -> i64 {
    let me = obs.seat;
    let other = if offer.from == me { offer.to } else { offer.from };
    let trust = obs.others.iter().find(|o| o.seat == other).map(|o| o.trust as i64).unwrap_or(50);
    let at_war = obs.diplomacy.wars.contains(&other);
    let mine = own_power(obs);
    let theirs = their_power(obs, other);
    let mut v: i64 = 0;
    for c in &offer.clauses {
        match c {
            Clause::Goods { from, good, amount_per_month, months } => {
                let total = amount_per_month * *months as i64;
                if *from == me {
                    v -= goods_value(obs, *good, total, false);
                } else {
                    // promises from a party with a poor record are discounted
                    let credit = if *months > 1 { (trust + 30).min(100) } else { 100 };
                    v += goods_value(obs, *good, total, true) * credit / 100;
                }
            }
            Clause::Knowledge { from, tech } => {
                if *from == me {
                    let work = obs.knowledge.techs.iter().find(|t| &t.handle == tech).map(|t| t.work_needed).unwrap_or(200_000);
                    let rival = their_population(obs, other) > obs.civ.population as i64;
                    v -= work / 1000 / if rival && ai.difficulty == Difficulty::Hard { 3 } else { 6 };
                } else {
                    v += match obs.knowledge.techs.iter().find(|t| &t.handle == tech) {
                        Some(t) if t.state >= KnowledgeState::Understood => 0,
                        Some(t) => (t.work_needed - t.work_done).max(0) / 1000 / 2,
                        // a method we have never heard of: worth something, by an unknown amount
                        None => 80,
                    };
                }
            }
            Clause::Practice { from, .. } => v += if *from == me { -5 } else { 15 },
            Clause::Maps { from } => v += if *from == me { -10 } else { 15 },
            Clause::NonAggression { .. } => {
                // once the final objective is known, the stronger side has no use for a long truce
                let ambitious = obs.objectives.victory.is_some() && ai.difficulty != Difficulty::Easy && mine > theirs;
                v += if ai.memory.war_target == Some(other) || ambitious { -200 } else if theirs > mine { 60 } else { 25 };
            }
            Clause::DefensivePact { .. } => v += if trust >= 60 { 30 } else { -20 },
            Clause::Peace => {
                let losing = obs.regions.iter().any(|r| r.owner == Some(me) && r.controller == Some(other)) || theirs > mine * 3 / 2;
                let winning = obs.regions.iter().any(|r| r.owner == Some(other) && r.controller == Some(me)) || mine > theirs * 3;
                v += if losing { 400 } else if winning && ai.difficulty != Difficulty::Easy { -150 } else { 120 };
            }
            Clause::Subordination { from, tribute_bp } => {
                if *from == me {
                    let lost = obs.regions.iter().filter(|r| r.owner == Some(me) && r.controller == Some(other)).count();
                    let held = obs.regions.iter().filter(|r| r.owner == Some(me)).count().max(1);
                    let hopeless = at_war && (lost * 2 >= held || (theirs > mine * 4 && theirs > 0 && borders(obs, other)));
                    v += if hopeless && *tribute_bp <= 2500 { 300 } else { -100_000 };
                } else {
                    v += 600;
                }
            }
            Clause::CedeRegion { from, .. } => v += if *from == me { -400 } else { 200 },
            Clause::Secondment { from, qual, count, months } => {
                if *from == me {
                    v -= lending_cost(obs, *qual, *count, *months, trust);
                } else {
                    // people who may be kept from us if things go badly are worth less
                    v += expert_value(obs, *qual, *count, *months) * (trust + 40).min(100) / 100;
                }
            }
            Clause::JointProgramme { host, service, months } => {
                if *host == me {
                    v -= hosting_cost(obs, *service, *months);
                } else {
                    v += service_value(obs, *service, *months) * (trust + 30).min(100) / 100;
                }
            }
        }
    }
    v
}

/// Whether this seat has merchant arbitration and escrow established, which recurring
/// deliveries need (by one party; this seat can see only its own).
fn has_escrow(obs: &Observation) -> bool {
    obs.culture.practices.iter().any(|p| p.name == "Merchant arbitration and escrow" && p.state == PracticeState::Established)
}

/// A good this seat holds in plenty and makes steadily, to pay with.
fn payment_good(obs: &Observation, monthly: bool) -> Option<Good> {
    [Good::Metal, Good::Food, Good::Materials, Good::Tools, Good::Copper, Good::Components, Good::Electronics].into_iter().find(|g| {
        obs.civ.goods.iter().find(|l| l.good == *g).map(|l| if monthly { made_in_year(l) > used_in_year(l) + 120_000 } else { l.stock > used_in_year(l) / 2 + 200_000 }).unwrap_or(false)
    })
}

/// A proposal for experts or for a partner's installation, when the jump programme's
/// educational base or launch, recovery and laboratory services fall short. Only
/// terms the engine accepts from this seat's own facts: the counterpart is at peace
/// with it, the installation is in this seat's catalog, a recurring payment only with
/// escrow established here, and a single payment only from stock in hand.
fn cooperation_ask(ai: &NativeAi, obs: &Observation, o: &ForeignCiv) -> Option<Action> {
    if ai.difficulty == Difficulty::Easy || obs.objectives.victory.is_none() || o.at_war || o.trust < 40 {
        return None;
    }
    // only once the jump works themselves are in view: before that, nobody has posts for these people
    if !obs.catalog.facilities.iter().any(|f| f.kind == "jump_yard") {
        return None;
    }
    let me = obs.seat;
    let s = o.seat;
    let escrow = has_escrow(obs);
    if base_short(obs, "Educational base: qualified crews") {
        let (eng, _) = holders(obs, Qual::FtlEngineer);
        let (orb, _) = holders(obs, Qual::Orbital);
        let (q, gap) = if 75 * K - eng >= 120 * K - orb { (Qual::FtlEngineer, 75 * K - eng) } else { (Qual::Orbital, 120 * K - orb) };
        let count = (gap.clamp(5 * K, 30 * K) / K * K) as u32;
        let months: u16 = term(obs, 120, (6, 240));
        let worth = count as i64 * months as i64 / 2_000 * 13 / 10;
        if let Some(pg) = payment_good(obs, escrow) {
            let total = worth * 1000 / base_price(pg);
            let pay = if escrow {
                Clause::Goods { from: me, good: pg, amount_per_month: (total / months as i64).max(1000), months }
            } else {
                let have = obs.civ.goods.iter().find(|l| l.good == pg).map(|l| l.stock).unwrap_or(0);
                if have < total * 2 {
                    return None;
                }
                Clause::Goods { from: me, good: pg, amount_per_month: total.max(1000), months: 1 }
            };
            return Some(Action::ProposeTreaty { to: s, clauses: vec![Clause::Secondment { from: s, qual: q, count, months }, pay], text: Some(format!("We ask you to lend us {} {} for {} months, and pay for their work.", count, q.label().to_lowercase(), months)) });
        }
    }
    if escrow && (base_short(obs, "Launch and recovery") || base_short(obs, "Scientific base")) {
        let have = |kind: &str| obs.regions.iter().filter_map(|r| r.own.as_ref()).any(|x| x.facilities.iter().any(|f| f.kind == kind && f.level > 0));
        let asking = obs.diplomacy.treaties.iter().filter(|t| t.status == "active" && t.parties.contains(&s)).flat_map(|t| t.clauses.iter()).any(|c| matches!(c, Clause::JointProgramme { .. }));
        let pick = [ProgrammeService::Launch, ProgrammeService::OrbitalYard, ProgrammeService::HighEnergy].into_iter().find(|sv| {
            let kind = service_facility(*sv).unwrap();
            obs.catalog.facilities.iter().any(|f| f.kind == kind) && !have(kind)
        });
        if let (Some(sv), false) = (pick, asking) {
            let ft = obs.catalog.facilities.iter().find(|f| Some(f.kind.as_str()) == service_facility(sv))?;
            let monthly: i64 = ft.recipes.first().map(|r| r.inputs.iter().map(|i| goods_value(obs, i.good, i.amount, false)).sum::<i64>()).unwrap_or(0) + ft.upkeep.iter().map(|u| goods_value(obs, u.good, u.amount, false)).sum::<i64>();
            let months: u16 = term(obs, 120, (12, 240));
            let pg = payment_good(obs, true)?;
            let per_month = (monthly / 2 * 13 / 10 + 1) * 1000 / base_price(pg);
            let made = obs.civ.goods.iter().find(|l| l.good == pg).map(made_in_year).unwrap_or(0);
            if per_month * 12 * 3 > made {
                return None;
            }
            return Some(Action::ProposeTreaty {
                to: s,
                clauses: vec![Clause::JointProgramme { host: s, service: sv, months }, Clause::Goods { from: me, good: pg, amount_per_month: per_month.max(1000), months }],
                text: Some(format!("We ask to share your {} for {} months, and pay for what it costs you.", sv.label().to_lowercase(), months)),
            });
        }
    }
    None
}

/// Qualified people of one qualification: (holders, holders in a post).
fn holders(obs: &Observation, q: Qual) -> (i64, i64) {
    obs.civ.quals.iter().find(|x| x.qual == q).map(|x| (x.count as i64, x.employed as i64)).unwrap_or((0, 0))
}

/// The installation a joint programme service is given by.
fn service_facility(s: ProgrammeService) -> Option<&'static str> {
    match s {
        ProgrammeService::Launch => Some("launch_complex"),
        ProgrammeService::OrbitalYard => Some("orbital_yard"),
        ProgrammeService::HighEnergy => Some("high_energy"),
        ProgrammeService::Undisclosed => None,
    }
}

/// What lending experts costs this seat, in the units of `goods_value`: their work
/// for the term, more if they would leave posts empty, and the quarter that a
/// partner of poor record may keep. Never more than the engine allows: half of the
/// holders, from those without a post.
fn lending_cost(obs: &Observation, q: Qual, count: u32, months: u16, trust: i64) -> i64 {
    let (have, employed) = holders(obs, q);
    let count = count as i64;
    if count * 2 > have || count > (have - employed).max(0) {
        return 100_000;
    }
    let base = count * months as i64 / 2_000;
    let risk = if trust < 50 { base / 2 } else { 0 };
    // the jump programme's own crews are not lent while this seat is building one
    let own_need = obs.objectives.victory.is_some() && matches!(q, Qual::FtlEngineer | Qual::Orbital) && employed * 10 >= have * 6;
    base + risk + if own_need { base * 3 } else { 0 }
}

/// What borrowed experts are worth to this seat: their work for the term when it is
/// short of them, little otherwise.
fn expert_value(obs: &Observation, q: Qual, count: u32, months: u16) -> i64 {
    let (have, employed) = holders(obs, q);
    let base = count as i64 * months as i64 / 2_000;
    let short = employed * 10 >= have * 9 || (obs.objectives.victory.is_some() && matches!(q, Qual::FtlEngineer | Qual::Orbital) && base_short(obs, "Educational base"));
    if short { base * 2 } else { base / 5 }
}

/// Whether one of the jump programme's base checks fails.
fn base_short(obs: &Observation, prefix: &str) -> bool {
    obs.objectives.victory.as_ref().map(|v| v.ftl_checks.iter().any(|c| c.label.starts_with(prefix) && !c.ok)).unwrap_or(false)
}

/// What serving a partner costs the host: half again of the installation's operating
/// inputs and upkeep for the term. Refused outright when this seat has no such
/// installation or it already serves two partners.
fn hosting_cost(obs: &Observation, s: ProgrammeService, months: u16) -> i64 {
    let Some(kind) = service_facility(s) else { return 100_000 };
    let mine = obs.regions.iter().filter_map(|r| r.own.as_ref()).any(|o| o.facilities.iter().any(|f| f.kind == kind && f.level > 0 && f.utilization_bp >= 6000));
    let serving = obs.diplomacy.treaties.iter().filter(|t| t.status == "active").flat_map(|t| t.clauses.iter()).filter(|c| matches!(c, Clause::JointProgramme { host, service, .. } if *host == obs.seat && *service == s)).count();
    if !mine || serving >= 2 {
        return 100_000;
    }
    let Some(ft) = obs.catalog.facilities.iter().find(|f| f.kind == kind) else { return 100_000 };
    let monthly: i64 = ft.recipes.first().map(|r| r.inputs.iter().map(|i| goods_value(obs, i.good, i.amount, false)).sum::<i64>()).unwrap_or(0) + ft.upkeep.iter().map(|u| goods_value(obs, u.good, u.amount, false)).sum::<i64>();
    monthly * months as i64 / 2 + 20
}

/// What a partner's service is worth: much while this seat's jump programme lacks
/// the installation, something for the investigations it opens otherwise.
fn service_value(obs: &Observation, s: ProgrammeService, months: u16) -> i64 {
    let Some(kind) = service_facility(s) else { return -100_000 };
    let have = obs.regions.iter().filter_map(|r| r.own.as_ref()).any(|o| o.facilities.iter().any(|f| f.kind == kind && f.level > 0));
    if have {
        return 0;
    }
    let wanted = obs.objectives.victory.is_some() && (base_short(obs, "Launch and recovery") || base_short(obs, "Scientific base"));
    if !wanted {
        return months as i64 * 2;
    }
    // what running one of our own would cost for the term, and building it
    let Some(ft) = obs.catalog.facilities.iter().find(|f| f.kind == kind) else { return months as i64 * 2 };
    let monthly: i64 = ft.recipes.first().map(|r| r.inputs.iter().map(|i| goods_value(obs, i.good, i.amount, true)).sum::<i64>()).unwrap_or(0) + ft.upkeep.iter().map(|u| goods_value(obs, u.good, u.amount, true)).sum::<i64>();
    let build: i64 = ft.cost.iter().map(|c| goods_value(obs, c.good, c.amount, true)).sum();
    monthly * months as i64 * 3 / 4 + build
}

/// How much better than break-even an offer must look before this controller signs.
fn offer_margin(ai: &NativeAi, obs: &Observation, offer: &OfferView) -> i64 {
    let me = obs.seat;
    let given: i64 = offer.clauses.iter().map(|c| if let Clause::Goods { from, good, amount_per_month, months } = c { if *from == me { goods_value(obs, *good, amount_per_month * *months as i64, false) } else { 0 } } else { 0 }).sum();
    match ai.difficulty {
        Difficulty::Easy => -5,
        Difficulty::Medium => 5 + given / 20,
        Difficulty::Hard => 10 + given / 8,
    }
}

fn negotiate(ai: &mut NativeAi, obs: &Observation) -> Vec<Action> {
    let mut out = Vec::new();
    let me = obs.seat;
    let mut used: HashSet<SeatId> = HashSet::new();
    let open: Vec<SeatId> = obs.diplomacy.channels.iter().filter(|c| c.open && !c.sent_this_window && c.envelopes_used < c.envelopes_limit).map(|c| c.seat).collect();

    // answer what has been put to us; exact terms only
    for offer in obs.diplomacy.offers.iter().filter(|o| o.to == me && o.status == "open") {
        let v = offer_value(ai, obs, offer);
        ai.memory.evaluated += 1;
        let margin = offer_margin(ai, obs, offer);
        if v >= margin {
            if open.contains(&offer.from) && !used.contains(&offer.from) {
                used.insert(offer.from);
                out.push(Action::SignTreaty { offer: offer.id });
            }
        } else {
            out.push(Action::DeclineOffer { offer: offer.id });
        }
    }

    // free text is acknowledged but never treated as an agreement
    for m in obs.diplomacy.messages.iter().filter(|m| m.to == me && m.round == obs.round && m.window + 1 == obs.window) {
        if open.contains(&m.from) && !used.contains(&m.from) && obs.window <= 2 {
            used.insert(m.from);
            let reply = match m.intent {
                Some(Intent::Inquiry) | Some(Intent::Need) => "We read your message. Put quantities, dates and what you offer in a formal proposal and we will answer it.",
                Some(Intent::Warning) => "Noted. Our commitments stand as signed; nothing else binds us.",
                Some(Intent::AllianceProposal) => "An alliance needs written terms. Propose a pact and we will weigh it.",
                _ => "Understood only in part. Please state price, deadline and deliverables as a formal proposal.",
            };
            out.push(Action::Message { to: m.from, text: reply.to_string(), intent: Some(Intent::Inquiry) });
        }
    }

    // our own proposals: at most one per counterpart, early in the round, not every round
    if obs.window == 1 {
        for o in obs.others.iter().filter(|o| open.contains(&o.seat) && !used.contains(&o.seat)) {
            let s = o.seat;
            let last = ai.memory.last_offer_round[s as usize];
            let already = obs.diplomacy.offers.iter().any(|x| x.from == me && x.to == s && x.status == "open");
            if already {
                continue;
            }
            let mine = own_power(obs);
            let theirs = their_power(obs, s);
            if o.at_war {
                let losing = obs.regions.iter().any(|r| r.owner == Some(me) && r.controller == Some(s)) || (theirs > mine * 2 && theirs > 0);
                let winning = obs.regions.iter().any(|r| r.owner == Some(s) && r.controller == Some(me));
                if losing && obs.round >= last + 2 {
                    ai.memory.last_offer_round[s as usize] = obs.round;
                    out.push(Action::ProposeTreaty { to: s, clauses: vec![Clause::Peace, Clause::NonAggression { months: term(obs, 120, (6, 600)) }], text: Some("We propose an end to this war.".into()) });
                } else if winning && obs.round >= last + 3 && obs.objectives.victory.is_some() {
                    ai.memory.last_offer_round[s as usize] = obs.round;
                    out.push(Action::ProposeTreaty { to: s, clauses: vec![Clause::Peace, Clause::Subordination { from: s, tribute_bp: 1000 }], text: Some("Keep your local government under our authority and the fighting stops.".into()) });
                }
                continue;
            }
            if obs.round < last + if ai.difficulty == Difficulty::Easy { 6 } else { 4 } {
                continue;
            }
            // a pact with a stronger neighbour is worth asking for
            let pact = obs.diplomacy.treaties.iter().any(|t| t.status == "active" && t.parties.contains(&s) && t.clauses.iter().any(|c| matches!(c, Clause::NonAggression { .. })));
            let ambitious = obs.objectives.victory.is_some() && ai.difficulty != Difficulty::Easy;
            if !pact && !ambitious && borders(obs, s) && ai.memory.war_target != Some(s) && (theirs >= mine || ai.difficulty == Difficulty::Easy) {
                ai.memory.last_offer_round[s as usize] = obs.round;
                out.push(Action::ProposeTreaty { to: s, clauses: vec![Clause::NonAggression { months: term(obs, 120, (6, 600)) }], text: Some("Neither of us gains from fighting over this border.".into()) });
                continue;
            }
            // buy what we cannot make, paying with what we hold in plenty
            if let Some(g) = ai.memory.imports.first().copied() {
                let pay: Option<Good> = [Good::Food, Good::Materials, Good::Tools, Good::Copper, Good::Media]
                    .into_iter()
                    .filter(|x| *x != g)
                    .find(|x| obs.civ.goods.iter().find(|l| l.good == *x).map(|l| l.stock > used_in_year(l) / 2 + 200_000).unwrap_or(false));
                if let Some(pg) = pay {
                    let want: i64 = 60_000;
                    let give = (want / 1000 * base_price(g) * 13 / 10 / base_price(pg)).clamp(20, 600) * 1000;
                    let have = obs.civ.goods.iter().find(|l| l.good == pg).map(|l| l.stock).unwrap_or(0);
                    if have > give * 2 {
                        ai.memory.last_offer_round[s as usize] = obs.round;
                        out.push(Action::ProposeTreaty {
                            to: s,
                            clauses: vec![Clause::Goods { from: s, good: g, amount_per_month: want, months: 1 }, Clause::Goods { from: me, good: pg, amount_per_month: give, months: 1 }],
                            text: Some(format!("We need {} and can pay in {}.", g.label().to_lowercase(), pg.label().to_lowercase())),
                        });
                        continue;
                    }
                }
            }
            // sell understanding we have for something we are short of
            let short: Vec<Good> = [Good::Food, Good::Tools, Good::Metal, Good::Copper, Good::Materials, Good::Components]
                .into_iter()
                .filter(|g| {
                    let l = obs.civ.goods.iter().find(|x| x.good == *g);
                    l.map(|l| l.stock < used_in_year(l) / 6 && used_in_year(l) > 0).unwrap_or(false)
                })
                .collect();
            let teachable: Vec<&TechCard> = obs.knowledge.techs.iter().filter(|t| t.state >= KnowledgeState::Understood && t.work_needed >= 50_000).collect();
            if let (Some(g), false) = (short.first(), teachable.is_empty()) {
                let pick = teachable[(mix(ai.policy_seed ^ obs.round as u64 ^ (s as u64) << 8) % teachable.len() as u64) as usize];
                let amount = (pick.work_needed / 1000 * 100 / (base_price(*g) * 6)).clamp(10, 400) * 1000;
                ai.memory.last_offer_round[s as usize] = obs.round;
                out.push(Action::ProposeTreaty {
                    to: s,
                    clauses: vec![Clause::Knowledge { from: me, tech: pick.handle.clone() }, Clause::Goods { from: s, good: *g, amount_per_month: amount, months: 1 }],
                    text: Some(format!("We will teach what we know of {} for a single delivery.", pick.name.to_lowercase())),
                });
                continue;
            }
            // a jump programme short of crews or of a launch, orbital or laboratory
            // service asks a partner it trusts, and pays for it (after trade and teaching, which
            // the partner may need more)
            if let Some(a) = cooperation_ask(ai, obs, o) {
                ai.memory.last_offer_round[s as usize] = obs.round;
                out.push(a);
                continue;
            }
            // ask for teaching on a question we have identified but not solved
            if ai.difficulty != Difficulty::Easy {
                let stuck: Vec<&TechCard> = obs.knowledge.techs.iter().filter(|t| t.state < KnowledgeState::Understood && t.work_needed >= 100_000).collect();
                let surplus: Vec<Good> = [Good::Food, Good::Materials, Good::Tools, Good::Metal]
                    .into_iter()
                    .filter(|g| obs.civ.goods.iter().find(|x| x.good == *g).map(|l| l.stock > used_in_year(l) + 300_000).unwrap_or(false))
                    .collect();
                if let (Some(t), Some(g)) = (stuck.first(), surplus.first()) {
                    let amount = (t.work_needed / 1000 * 100 / (base_price(*g) * 5)).clamp(20, 600) * 1000;
                    ai.memory.last_offer_round[s as usize] = obs.round;
                    out.push(Action::ProposeTreaty {
                        to: s,
                        clauses: vec![Clause::Knowledge { from: s, tech: t.handle.clone() }, Clause::Goods { from: me, good: *g, amount_per_month: amount, months: 1 }],
                        text: Some(format!("If you understand {}, we will pay for instruction.", t.name.to_lowercase())),
                    });
                }
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// planning
// ---------------------------------------------------------------------------

fn plan(ai: &mut NativeAi, obs: &Observation) -> Vec<Action> {
    plan_domains(ai, obs, None)
}

/// Domains a human seat can hand to a steward. The steward is this same policy,
/// restricted to the named areas and working from the seat's own observation.
pub const DOMAINS: [&str; 6] = ["economy", "research", "education", "culture", "expansion", "military"];

pub fn plan_domains(ai: &mut NativeAi, obs: &Observation, only: Option<&[String]>) -> Vec<Action> {
    let on = |d: &str| only.map(|list| list.iter().any(|x| x == d)).unwrap_or(true);
    let full = only.is_none();
    let mut p = Plan::new(obs, ai.difficulty);
    let regions = p.own_regions();
    if regions.is_empty() {
        return Vec::new();
    }
    let capital = regions.iter().copied().find(|r| r.id == obs.civ.capital).unwrap_or(regions[0]);
    let pop = obs.civ.population.max(1) as i64;
    let working = obs.civ.working_age.max(1) as i64;

    // standing policy, once
    if full && ai.memory.rounds_seen <= 1 {
        let reserve = match ai.difficulty {
            Difficulty::Easy => 4,
            Difficulty::Medium => 6,
            Difficulty::Hard => 8,
        };
        p.push(Action::SetPolicy { setting: PolicySetting::FoodReserveMonths { months: reserve } });
        p.push(Action::SetPolicy { setting: PolicySetting::LaborWeight { category: LaborCategory::Knowledge, weight: 8 } });
        p.push(Action::SetPolicy { setting: PolicySetting::LaborWeight { category: LaborCategory::Extraction, weight: 6 } });
        p.push(Action::SetPolicy { setting: PolicySetting::LaborWeight { category: LaborCategory::Industry, weight: 6 } });
    }

    // proposals still unanswered when the windows close are settled in the plan phase
    for offer in obs.diplomacy.offers.iter().filter(|o| full && o.to == obs.seat && o.status == "open") {
        let v = offer_value(ai, obs, offer);
        if v >= offer_margin(ai, obs, offer) {
            p.push(Action::SignTreaty { offer: offer.id });
        } else {
            p.push(Action::DeclineOffer { offer: offer.id });
        }
    }

    // ---- what are we short of? -------------------------------------------------
    for pr in &obs.projects {
        if pr.paused {
            continue;
        }
        for (need, have) in pr.inputs_needed.iter().zip(pr.inputs_committed.iter()) {
            if have.amount < need.amount && p.stock(need.good) < need.amount - have.amount {
                p.wanted.insert(need.good);
            }
        }
    }
    for r in &regions {
        for f in &r.own.as_ref().unwrap().facilities {
            for run in &f.runs {
                for g in &run.missing {
                    p.wanted.insert(*g);
                }
            }
        }
    }
    for l in &obs.civ.goods {
        if l.good == Good::Food {
            continue;
        }
        let monthly = l.consumed / 12;
        if (l.consumed > 0 && l.stock < monthly * 4) || (l.consumed > made_in_year(l) + l.traded_in && l.stock < monthly * 12) {
            p.wanted.insert(l.good);
        }
    }
    // the jump programme's base: a year of flight hardware, and of fuel and spares in store
    if base_short(obs, "Industrial base") {
        for g in [Good::Components, Good::Electronics, Good::Hardware, Good::Conductors, Good::Metal] {
            p.wanted.insert(g);
        }
    }
    if base_short(obs, "Logistical base: a year of fuel") {
        p.wanted.insert(Good::Fuel);
        p.wanted.insert(Good::Spares);
    }
    // thirty tool lots and sixty tonnes of materials in hand for every thousand people
    if p.stock(Good::Tools) < 12_000 + pop * 30 / K {
        p.wanted.insert(Good::Tools);
    }
    if p.stock(Good::Materials) < 50_000 + pop * 60 / K {
        p.wanted.insert(Good::Materials);
    }

    // stale projects that never got their inputs free up what they reserved
    for pr in &obs.projects {
        if full && pr.kind == "build" && obs.month > pr.started_month + 180 && pr.work_done * 10 < pr.work_needed {
            p.push(Action::ManageProject { project: pr.id, op: ManageOp::Cancel, priority: None, position: None });
        }
    }
    site_orders(&mut p, on("economy"));

    if on("economy") {
        food_and_water(&mut p, &regions);
        methods(&mut p, &regions, &mut ai.memory.methods_set);
    }
    if on("research") {
        research(ai, &mut p);
    }
    if on("culture") {
        culture(&mut p, capital);
    }
    if on("economy") {
        production(&mut p, &regions, capital);
        power(&mut p, &regions);
        new_capabilities(&mut p, &regions, capital);
    }
    if on("education") {
        education(&mut p, &regions, working);
    }
    if on("expansion") {
        expansion(ai, &mut p, &regions);
    }
    if on("military") {
        military(ai, &mut p, &regions, capital, pop);
    }
    if on("economy") {
        endgame(&mut p, &regions);
    }
    // what we want but cannot make at home is worth asking neighbours for
    let mut imports: Vec<Good> = p
        .wanted
        .iter()
        .copied()
        .filter(|g| *g != Good::Food && p.stock(*g) < 20_000)
        .filter(|g| {
            let makers = producers(&p, *g);
            makers.is_empty() || makers.iter().all(|ft| ft.site_key != "any" && !regions.iter().any(|r| p.site_cap(ft, r) > 0))
        })
        .collect();
    imports.sort();
    ai.memory.imports = imports;
    if full || on("economy") || on("research") || on("expansion") {
        standing_orders(&mut p);
    }
    let mut out = p.actions;
    out.append(&mut p.directives);
    out
}

/// Keep the seat's standing orders current: drop build targets for regions it no
/// longer governs, and make room when the referee's limit is near by withdrawing
/// the oldest targets that are already met.
fn standing_orders(p: &mut Plan) {
    let obs = p.obs;
    let own: HashSet<RegionId> = p.own_regions().iter().map(|r| r.id).collect();
    let mut count = obs.directives.len();
    let restated: HashSet<(RegionId, String)> = p
        .directives
        .iter()
        .filter_map(|a| if let Action::Directive { directive: Some(Directive::BuildTarget { region, facility, .. }), .. } = a { Some((*region, facility.clone())) } else { None })
        .collect();
    let mut removals = Vec::new();
    for d in &obs.directives {
        if let Directive::BuildTarget { region, .. } = &d.directive {
            if !own.contains(region) {
                removals.push(d.id);
                count -= 1;
            }
        }
    }
    let new_targets = restated.iter().filter(|k| !obs.directives.iter().any(|d| matches!(&d.directive, Directive::BuildTarget { region, facility, .. } if (*region, facility.clone()) == **k))).count();
    for d in &obs.directives {
        if count + new_targets <= 56 {
            break;
        }
        if let Directive::BuildTarget { region, facility, .. } = &d.directive {
            if own.contains(region) && d.last_status == "idle" && !restated.contains(&(*region, facility.clone())) {
                removals.push(d.id);
                count -= 1;
            }
        }
    }
    let mut out: Vec<Action> = removals.into_iter().map(|id| Action::Directive { op: DirectiveOp::Remove, id: Some(id), directive: None, position: None }).collect();
    out.append(&mut p.directives);
    p.directives = out;
}

/// Open orders that stand still for want of a site crew or site power. The people
/// missing are noted so that courses are opened for them; an order that holds part
/// of a crew while another part is missing altogether is paused, which sends the
/// people it holds back to their posts, and resumed once the region can crew it;
/// a site without power makes coal a want.
fn site_orders(p: &mut Plan, manage: bool) {
    let obs = p.obs;
    for pr in &obs.projects {
        if pr.crew.is_empty() {
            continue;
        }
        let Some(region) = pr.region else { continue };
        if pr.paused {
            // only orders this policy paused for their crew are taken up again
            if pr.kind != "build" {
                continue;
            }
            let crew: Vec<(Vec<Qual>, i64)> = pr.crew.iter().map(|c| (c.quals.clone(), c.needed as i64)).collect();
            // resumed only when the region itself can crew it: waiting for people
            // to move in is what it was paused for
            if p.reserve_crew(region, &crew, false) && manage {
                p.push(Action::ManageProject { project: pr.id, op: ManageOp::Resume, priority: None, position: None });
            }
            continue;
        }
        for c in pr.crew.iter().filter(|c| c.on_site < c.needed) {
            if let Some(q) = c.quals.first() {
                let w = p.crew_wanted.entry(*q).or_insert(0);
                *w = (*w).max((c.needed - c.on_site) as i64);
            }
        }
        if pr.blockers.iter().any(|b| b.starts_with("Site power short")) {
            p.wanted.insert(Good::Coal);
        }
        let held: u32 = pr.crew.iter().map(|c| c.on_site).sum();
        let missing = pr.crew.iter().any(|c| c.needed > 0 && c.on_site == 0);
        if manage && pr.kind == "build" && pr.last_progress == 0 && missing && held > 0 {
            p.push(Action::ManageProject { project: pr.id, op: ManageOp::Pause, priority: None, position: None });
        }
    }
}

fn food_and_water(p: &mut Plan, regions: &[&RegionView]) {
    let obs = p.obs;
    let pop = obs.civ.population.max(1) as i64;
    let food_each = obs.units.food_per_person_month.max(1);
    let months = p.stock(Good::Food) / (pop * food_each);
    let hungry = obs.civ.food_fulfillment_bp < 10_000 || months < 3;
    let step: u16 = match p.diff {
        Difficulty::Easy => 1,
        Difficulty::Medium => 2,
        Difficulty::Hard => 3,
    };
    let ahead = 100 + 5 * p.diff.lookahead() as i64; // prepare for growth
    for r in regions {
        let o = r.own.as_ref().unwrap();
        let rp = o.population as i64;
        let crew = |kind: &str| p.level(r, kind) as i64 * p.fac_type(kind).map(|ft| ft.jobs.iter().map(|j| j.count as i64).sum::<i64>()).unwrap_or(0);
        let farm_jobs = crew("fields") + crew("pasture") + crew("fishery");
        // jobs needed if every mouth is fed from improved land at early yields
        let need_jobs = rp * 125 / 100 * ahead / 100 * 10 / 36;
        let relying_on_wild = o.labor.food as i64 > farm_jobs;
        if (relying_on_wild && farm_jobs < need_jobs) || (hungry && farm_jobs < need_jobs * 13 / 10) {
            let prio = if hungry { 1 } else { 2 };
            let built = p.try_build(r, "fields", step, prio) || p.try_build(r, "fishery", step, prio) || p.try_build(r, "pasture", step, prio);
            let _ = built;
        }
        // traction needs herds somewhere
        if p.level(r, "fields") >= 3 && !p.civ_has("pasture") && !p.civ_pending("pasture") {
            p.try_build(r, "pasture", 1, 3);
        }
        let fields = p.level(r, "fields");
        if r.river && fields >= 5 && p.level(r, "irrigation") < fields / 5 {
            p.try_build(r, "irrigation", 1, 3);
        }
        // water and sanitation before crowding becomes sickness
        if rp * 100 > o.water_capacity as i64 * (88 - 2 * p.diff.lookahead() as i64) {
            let _ = p.try_build(r, "water_treatment", 1, 2) || p.try_build(r, "sewers", 1, 2) || p.try_build(r, "waterworks", 1, 2);
        }
        if o.health_pressure_bp > 1500 || rp > 600 * K {
            let covered = (p.level(r, "clinic") as i64) * 800 * K + (p.level(r, "hospital") as i64) * 4000 * K;
            if covered < rp {
                let _ = p.try_build(r, "hospital", 1, 4) || p.try_build(r, "clinic", 1, 4);
            }
        }
    }
    if let Some(l) = p.line(Good::Food) {
        if let Some(cap) = l.capacity {
            if l.stock * 10 >= cap * 7 {
                if let Some(r) = regions.first() {
                    p.try_build(r, "granary", 1, 3);
                }
            }
        }
    }
}

fn research(ai: &NativeAi, p: &mut Plan) {
    let obs = p.obs;
    let capacity: i64 = obs.civ.research.iter().map(|r| r.capacity).sum();
    let slots = match p.diff {
        Difficulty::Easy => 2,
        Difficulty::Medium => 3,
        Difficulty::Hard => 5,
    } + (capacity / 25_000) as usize;
    // handles that known requirements are waiting on
    let mut needed: HashSet<&str> = HashSet::new();
    for f in &obs.catalog.facilities {
        for r in f.requirements.iter().filter(|r| !r.satisfied) {
            if let Some(h) = &r.handle {
                needed.insert(h.as_str());
            }
        }
    }
    for c in &obs.catalog.courses {
        for r in c.requirements.iter().filter(|r| !r.satisfied) {
            if let Some(h) = &r.handle {
                needed.insert(h.as_str());
            }
        }
    }
    for t in &obs.knowledge.techs {
        for r in t.known_requirements.iter().filter(|r| !r.satisfied) {
            if let Some(h) = &r.handle {
                needed.insert(h.as_str());
            }
        }
    }
    for pr in &obs.culture.practices {
        for r in pr.known_requirements.iter().filter(|r| !r.satisfied) {
            if let Some(h) = &r.handle {
                needed.insert(h.as_str());
            }
        }
    }
    let cap_for = |class: ResearchClass| -> i64 { obs.civ.research.iter().filter(|l| l.class >= class).map(|l| l.capacity).sum() };
    let class_of = |handle: &Option<String>| -> Option<ResearchClass> { handle.as_ref().and_then(|h| obs.knowledge.techs.iter().find(|t| &t.handle == h)).map(|t| t.class) };
    let active = obs.projects.iter().filter(|x| x.kind == "research" && class_of(&x.target).map(|k| cap_for(k) > 0).unwrap_or(true)).count();
    let _ = active;
    let mut cands: Vec<&TechCard> = obs.knowledge.techs.iter().filter(|t| t.can_investigate && cap_for(t.class) > 0).collect();
    cands.sort_by_key(|t| {
        let remaining = (t.work_needed - t.work_done).max(1);
        let bonus = if needed.contains(t.handle.as_str()) { 3 } else { 1 };
        (remaining / bonus, t.handle.clone())
    });
    // investigations nobody can staff do not hold a slot; drop them so the reports stay honest
    for x in obs.projects.iter().filter(|x| x.kind == "research" && x.work_done == 0 && class_of(&x.target).map(|k| cap_for(k) == 0).unwrap_or(false)) {
        p.push(Action::ManageProject { project: x.id, op: ManageOp::Cancel, priority: None, position: None });
    }
    if p.long {
        // in a long round the agenda keeps research going after these finish, and
        // automatic research picks up what is discovered in the meantime
        let mut agenda: Vec<String> = cands.iter().take(32).map(|t| t.handle.clone()).collect();
        agenda.extend(obs.knowledge.leads.iter().take(8).map(|l| l.handle.clone()));
        if !agenda.is_empty() {
            p.directives.push(Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::ResearchAgenda { techs: agenda }), position: None });
        }
        if !obs.directives.iter().any(|d| matches!(d.directive, Directive::AutoResearch { on: true })) {
            p.directives.push(Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::AutoResearch { on: true }), position: None });
        }
    }
    for t in cands.into_iter().take(slots.saturating_sub(active)) {
        let prio = if needed.contains(t.handle.as_str()) { 3 } else { 5 };
        p.push(Action::StartProject { spec: ProjectSpec::Research { tech: t.handle.clone() }, priority: Some(prio) });
    }
    let lead_studies = obs.projects.iter().filter(|x| x.kind == "lead").count();
    for l in obs.knowledge.leads.iter().take(3usize.saturating_sub(lead_studies)) {
        p.push(Action::Investigate { lead: l.handle.clone() });
    }
    // with nothing to investigate, pay for new evidence instead of waiting
    let nothing = obs.knowledge.leads.is_empty() && !obs.knowledge.techs.iter().any(|t| t.state < KnowledgeState::Understood);
    let studying = obs.projects.iter().any(|x| x.kind == "study");
    if nothing && !studying && capacity > 0 && p.diff != Difficulty::Easy && !obs.knowledge.domains.is_empty() {
        let d = &obs.knowledge.domains[(mix(ai.policy_seed ^ obs.round as u64) % obs.knowledge.domains.len() as u64) as usize];
        p.push(Action::StartProject { spec: ProjectSpec::Study { domain: d.key.clone() }, priority: Some(6) });
    }
}

fn culture(p: &mut Plan, capital: &RegionView) {
    let obs = p.obs;
    let reforming = obs.projects.iter().filter(|x| x.kind == "reform").count();
    let limit = if p.diff == Difficulty::Easy { 1 } else { 2 };
    let mut started = 0;
    for pr in obs.culture.practices.iter().filter(|c| c.can_reform) {
        if reforming + started >= limit {
            break;
        }
        p.push(Action::ProposeReform { practice: pr.handle.clone() });
        started += 1;
    }
    if p.long {
        // every recognized practice, in the order the catalog lists them: reforms
        // that become possible during the round begin when one finishes
        let agenda: Vec<String> = obs.culture.practices.iter().filter(|c| c.state == PracticeState::Recognized).map(|c| c.handle.clone()).take(64).collect();
        if !agenda.is_empty() && limit >= 2 {
            p.directives.push(Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::ReformAgenda { practices: agenda }), position: None });
        }
    }
    if let Some(m) = &obs.culture.movement {
        let busy = obs.projects.iter().any(|x| x.kind == "religion");
        match m.stage.as_str() {
            "Local gatherings" if !busy && m.devotion >= m.devotion_needed => {
                if let Some(b) = m.belief_options.first() {
                    p.push(Action::StartProject { spec: ProjectSpec::Religion { beliefs: vec![b.key.clone()], name: None }, priority: Some(6) });
                }
            }
            "Shared tradition" => {
                if let Some(r) = obs.regions.iter().find(|r| r.id == m.region && r.own.is_some()) {
                    p.try_build(r, "holy_site", 1, 6);
                }
            }
            "Recognized founder" if !busy && m.slots_remaining > 0 => {
                let mut picks = Vec::new();
                let mut seen: HashSet<&str> = HashSet::new();
                for (i, b) in m.belief_options.iter().enumerate() {
                    if !seen.contains(b.slot.as_str()) && (i as u64 + obs.seat as u64) % 2 == 0 {
                        seen.insert(b.slot.as_str());
                        picks.push(b.key.clone());
                    }
                }
                for b in &m.belief_options {
                    if !seen.contains(b.slot.as_str()) {
                        seen.insert(b.slot.as_str());
                        picks.push(b.key.clone());
                    }
                }
                if picks.len() == 4 {
                    p.push(Action::StartProject { spec: ProjectSpec::Religion { beliefs: picks, name: None }, priority: Some(6) });
                }
            }
            _ => {}
        }
    }
    let _ = capital;
}

fn education(p: &mut Plan, regions: &[&RegionView], working: i64) {
    let obs = p.obs;
    // posts that exist, by the qualification they call for
    let mut demand: HashMap<Qual, i64> = HashMap::new();
    for r in regions {
        for f in &r.own.as_ref().unwrap().facilities {
            if let Some(ft) = p.fac_type(&f.kind) {
                for j in &ft.jobs {
                    if let Some(q) = j.qual {
                        *demand.entry(q).or_insert(0) += j.count as i64 * f.level as i64;
                    }
                }
            }
        }
    }
    let have = |q: Qual| obs.civ.quals.iter().find(|x| x.qual == q).map(|x| x.count as i64).unwrap_or(0);
    let prep = 100 + 4 * p.diff.lookahead() as i64;
    // a share of working adults, and never fewer than `min` thousand people
    let share = |bp: i64, min: i64| (working * bp / 10_000).max(min * K) * prep / 100;
    let coastal = regions.iter().any(|r| r.coastal);
    let fields: i64 = regions.iter().map(|r| p.level(r, "fields") as i64).sum();
    let schools = p.civ_has("school");
    let targets: Vec<(Qual, i64)> = vec![
        (Qual::Artisan, share(250, 14)),
        (Qual::Lorekeeper, share(60, 10)),
        (Qual::Agronomist, ((fields * K) / 2 + 2 * K).min(share(200, 4))),
        (Qual::Tallier, share(50, 6)),
        (Qual::Builder, share(150, 6)),
        (Qual::Smith, share(50, 4)),
        (Qual::Navigator, if coastal { 4 * K } else { 0 }),
        (Qual::Literate, if schools { share(600, 30) } else { share(200, 12) }),
        (Qual::Scribe, share(150, 16)),
        (Qual::Teacher, share(50, 12)),
        (Qual::Scholar, share(150, 10)),
        (Qual::Researcher, share(200, 10)),
        (Qual::Scientist, share(300, 16)),
        (Qual::Mechanic, share(150, 12)),
        (Qual::Technician, share(200, 12)),
        (Qual::Electrician, share(100, 8)),
        (Qual::Programmer, share(100, 8)),
        (Qual::Physician, share(40, 4)),
        (Qual::AiEngineer, share(30, 8)),
        // an independent jump programme needs its crews for every post with reliefs
        // (two lines, three nodes, the orbital works: 50,000 and 70,000 posts)
        (Qual::Orbital, 110 * K),
        (Qual::FtlEngineer, 80 * K),
    ];
    let jump_crews = |q: Qual| obs.objectives.victory.is_some() && matches!(q, Qual::Orbital | Qual::FtlEngineer);
    // 1. work out who is short and who is in surplus; stop feeding surpluses first
    struct Need<'c> {
        courses: Vec<&'c CourseType>,
        deficit: i64,
        ratio: i64,
        /// An order is waiting for people of this qualification on its site.
        crew: bool,
    }
    let mut needs: Vec<Need> = Vec::new();
    for (q, base) in &targets {
        let courses: Vec<&CourseType> = obs.catalog.courses.iter().filter(|c| c.output == *q && c.available).collect();
        if courses.is_empty() {
            continue;
        }
        // people an order's site crew is short of come on top of those who already
        // hold posts: twice the shortfall, so the works are not stripped for the site
        let crew_short = p.crew_wanted.get(q).copied().unwrap_or(0);
        let posts = demand.get(q).copied().unwrap_or(0);
        let relief = if jump_crews(*q) { posts * 3 / 2 } else { posts * 12 / 10 };
        let target = (*base).max(relief + 2 * K).max(if crew_short > 0 { posts + crew_short * 2 + 2 * K } else { 0 }).max(1);
        let training: i64 = obs.programs.iter().filter(|g| courses.iter().any(|c| c.key == g.course)).map(|g| g.enrolled as i64).sum();
        let deficit = target - have(*q) - training;
        if deficit <= 0 {
            // the jump programme keeps one course of each running: the base needs its
            // crews replaced, not a surplus of them
            let keep = if jump_crews(*q) { obs.programs.iter().filter(|g| !g.paused && courses.iter().any(|c| c.key == g.course)).max_by_key(|g| (g.seats, std::cmp::Reverse(g.id))).map(|g| g.id) } else { None };
            for g in obs.programs.iter().filter(|g| !g.paused && courses.iter().any(|c| c.key == g.course) && Some(g.id) != keep) {
                p.push(Action::ManageProgram { program: g.id, op: ManageOp::Pause, seats: None });
            }
        } else {
            // a qualification an order is waiting for goes to the head of the list
            let ratio = if crew_short > 0 { -1 } else { (have(*q) + training) * 100 / target };
            needs.push(Need { courses, deficit, ratio, crew: crew_short > 0 });
        }
    }
    // 2. the most depleted qualifications get attention first
    needs.sort_by_key(|n| n.ratio);
    let mut venue_builds: HashSet<String> = HashSet::new();
    let mut opened = 0;
    let max_open = match p.diff {
        Difficulty::Easy => 2,
        Difficulty::Medium => 4,
        Difficulty::Hard => 6,
    };
    let unqualified = |r: &RegionView| -> i64 {
        let o = r.own.as_ref().unwrap();
        o.working_age as i64 * 9 / 10 - o.quals.iter().map(|q| q.count as i64).sum::<i64>() - o.labor.students as i64
    };
    for n in needs {
        if p.full() {
            break;
        }
        let mine: Vec<&ProgramView> = obs.programs.iter().filter(|g| n.courses.iter().any(|c| c.key == g.course)).collect();
        let mut resumed = false;
        for g in mine.iter().filter(|g| g.paused) {
            p.push(Action::ManageProgram { program: g.id, op: ManageOp::Resume, seats: None });
            resumed = true;
        }
        // places already open but unfilled and able to fill: more programmes would not train anyone sooner
        let open_places: i64 = mine.iter().filter(|g| g.blockers.is_empty() || g.enrolled > 0).map(|g| (g.seats as i64 - g.enrolled as i64).max(0)).sum();
        if resumed || open_places >= n.deficit.min(8 * K) || opened >= max_open {
            continue;
        }
        // a course needs places and eligible learners in the same region
        let mut ranked = n.courses.clone();
        ranked.sort_by_key(|c| (if c.entrants.contains(&None) { 0 } else { 1 }, c.months, c.key.clone()));
        let mut placed = false;
        let mut want_venue: Option<(RegionId, String)> = None;
        'course: for course in &ranked {
            for r in regions {
                let o = r.own.as_ref().unwrap();
                if mine.iter().any(|g| g.region == r.id && g.course == course.key) {
                    continue;
                }
                let learners: i64 = course
                    .entrants
                    .iter()
                    .map(|e| match e {
                        None => unqualified(r),
                        Some(q) if *q == course.output => 0,
                        Some(q) => o.quals.iter().find(|x| x.qual == *q).map(|x| x.count as i64 * 2 / 3).unwrap_or(0),
                    })
                    .max()
                    .unwrap_or(0);
                if learners < 4 * K {
                    continue;
                }
                let mut free = o.venues.iter().find(|v| v.venue == course.venue).map(|v| v.capacity as i64 - v.reserved as i64).unwrap_or(0);
                if free < 4 * K {
                    // paused programmes keep their places booked: close the ones in
                    // surplus here to make room for a qualification that is short
                    let venue_of = |key: &str| obs.catalog.courses.iter().find(|c| c.key == key).map(|c| c.venue.clone());
                    let idle: Vec<&ProgramView> = obs.programs.iter().filter(|g| g.region == r.id && g.paused && g.enrolled == 0 && venue_of(&g.course).as_deref() == Some(course.venue.as_str())).collect();
                    let room: i64 = idle.iter().map(|g| g.seats as i64).sum();
                    if free + room >= 4 * K {
                        for g in idle {
                            p.push(Action::ManageProgram { program: g.id, op: ManageOp::Cancel, seats: None });
                        }
                        free += room;
                    }
                }
                if free >= 4 * K {
                    // at most three thousand instructors' worth of learners in one programme
                    let seats = free.min(n.deficit.max(4 * K)).min(learners).min(course.class_size as i64 * 3 * K).clamp(4 * K, 2_000 * K) as u32;
                    p.push(Action::StartProgram { region: r.id, course: course.key.clone(), seats });
                    opened += 1;
                    placed = true;
                    break 'course;
                } else if want_venue.is_none() {
                    want_venue = Some((r.id, course.venue.clone()));
                }
            }
        }
        if !placed {
            if let Some((rid, venue)) = want_venue {
                if !venue_builds.contains(&venue) && p.fac_type(&venue).map(|f| f.available).unwrap_or(false) {
                    if let Some(r) = regions.iter().find(|r| r.id == rid) {
                        // a venue an order's crew depends on is not held up by the region's other building
                        if p.level(r, &venue) < 10 && p.try_build(r, &venue, 1, if n.crew { 2 } else { 3 }) {
                            venue_builds.insert(venue);
                        }
                    }
                }
            }
        }
    }
}

/// Facility types that can make a good with what this seat currently knows.
fn producers<'a>(p: &Plan<'a>, g: Good) -> Vec<&'a FacilityType> {
    p.obs.catalog.facilities.iter().filter(|f| f.available && f.category != "Food").filter(|f| f.recipes.iter().any(|r| r.available && r.outputs.iter().any(|o| o.good == g))).collect()
}

fn producer<'a>(p: &Plan<'a>, g: Good) -> Option<&'a FacilityType> {
    producers(p, g).into_iter().next()
}

fn production(p: &mut Plan, regions: &[&RegionView], capital: &RegionView) {
    let obs = p.obs;
    let mut wanted: Vec<Good> = p.wanted.iter().copied().collect();
    wanted.sort();
    for g in wanted {
        if p.full() {
            break;
        }
        // tools, instruments and records keep everything else running
        let prio = if matches!(g, Good::Tools | Good::Instruments | Good::Media | Good::Spares | Good::Fuel) { 2 } else { 4 };
        // try each way of making it; a plant starved of its own inputs is no reason to stop looking
        'types: for ft in producers(p, g) {
            let mut exists = false;
            let mut starved = false;
            for r in regions {
                let o = r.own.as_ref().unwrap();
                if let Some(f) = o.facilities.iter().find(|f| f.kind == ft.kind) {
                    exists = true;
                    let running = f.utilization_bp >= 8000;
                    let staffed = f.staffed * 10 >= f.staff_needed * 8;
                    let short_inputs = f.runs.iter().any(|x| !x.missing.is_empty() || x.blockers.iter().any(|b| b.contains("deposit")));
                    if short_inputs {
                        starved = true;
                        continue;
                    }
                    if !(running && staffed) {
                        // held back by people or power: adding levels will not help yet
                        break 'types;
                    }
                    let idle = *p.idle.get(&r.id).unwrap_or(&0);
                    let jobs: i64 = ft.jobs.iter().map(|j| j.count as i64).sum();
                    if idle >= jobs / 2 && p.try_build(r, &ft.kind, 1, prio) {
                        break 'types;
                    }
                }
            }
            let site_bound = ft.site_key != "any";
            if exists && starved && !site_bound {
                continue; // look for another process
            }
            if exists && !starved {
                break;
            }
            let built = if ft.site_key == "any" {
                p.workplace_region(ft).map(|r| p.try_build(r, &ft.kind, 1, prio)).unwrap_or(false)
            } else {
                regions.iter().copied().filter(|r| p.level(r, &ft.kind) == 0 && p.site_cap(ft, r) > 0).max_by_key(|r| (p.can_crew(r, &ft.kind), *p.idle.get(&r.id).unwrap_or(&0), std::cmp::Reverse(r.id))).map(|r| p.try_build(r, &ft.kind, 2, prio)).unwrap_or(false)
            };
            if built {
                break;
            }
        }
    }
    // roads tie outlying regions to the common stock
    for r in regions {
        let o = r.own.as_ref().unwrap();
        if r.id != capital.id && o.population as i64 >= 250 * K && o.transport_level == 0 {
            let _ = p.try_build(r, "roads", 1, 5) || (r.coastal && p.try_build(r, "port", 1, 5));
        }
    }
    // freight: a region whose works load its transport to the limit, the capital
    // included, gets the next grade of transport before more is lost in carriage.
    // Roads and a harbour first, then the railway, then the motor depot; a region
    // at the top grade can only be relieved by building elsewhere.
    for r in regions {
        if p.full() {
            break;
        }
        let o = r.own.as_ref().unwrap();
        let f = &o.infrastructure;
        // an observation without the freight figures (an older referee) says nothing
        if f.freight_capacity == 0 || o.transport_level >= 3 {
            continue;
        }
        // levels already ordered here will load it too
        let coming: u32 = obs.projects.iter().filter(|x| x.kind == "build" && !x.paused && x.region == Some(r.id)).filter(|x| x.target.as_deref().and_then(|k| p.fac_type(k)).map(loads_freight).unwrap_or(false)).map(|x| x.levels.unwrap_or(1) as u32).sum();
        if f.infra_bp < 10_000 || f.freight_load + coming + 2 > f.freight_capacity {
            let prio = if f.infra_bp < 10_000 { 3 } else { 4 };
            let _ = p.try_build(r, "roads", 1, prio) || (r.coastal && p.try_build(r, "port", 1, prio)) || p.try_build(r, "rail", 1, prio) || p.try_build(r, "depot", 1, prio);
        }
    }
}

/// Whether a facility type's levels load a region's freight: industry, extraction
/// and power (`docs/units-and-scale.md`, section 7).
fn loads_freight(ft: &FacilityType) -> bool {
    ft.category != "Food" && (ft.category == "Power" || matches!(ft.labor_category, Some(LaborCategory::Industry | LaborCategory::Extraction)))
}

/// Production methods are left to the works, with two exceptions that the seat's
/// own reports make plain.
///
/// A plant that stands nearly still for want of an input, while another method it
/// knows makes the same thing from goods and service that are there, is switched
/// to that method; a method chosen this way goes back to the works when it is
/// starved in its turn, or when a method the works would rather run (one listed
/// before it) has three months of its inputs in store again.
///
/// Fields burn fuel before anything else in the month. When works or open orders
/// went without fuel while the food store stands at the seat's reserve target,
/// the fields are held at the best method that burns none; the hold is lifted
/// when fuel is no longer short and a year of the fields' burning is in store, or
/// at once when the food store falls more than a month below the target.
///
/// `mine` lists the choices this controller made itself. Only those are ever
/// returned to the works, so a steward does not undo what the seat's player chose.
fn methods(p: &mut Plan, regions: &[&RegionView], mine: &mut Vec<(RegionId, String)>) {
    let obs = p.obs;
    let set = |region: RegionId, facility: &str, method: Option<String>| Action::SetPolicy { setting: PolicySetting::Method { region, facility: facility.to_string(), method } };
    // a choice that is no longer in force (the region changed hands, the works are gone) is forgotten
    mine.retain(|(region, kind)| regions.iter().any(|r| r.id == *region && r.own.as_ref().unwrap().facilities.iter().any(|f| &f.kind == kind && f.method.is_some())));
    let is_mine = |mine: &Vec<(RegionId, String)>, region: RegionId, kind: &str| mine.iter().any(|(r, k)| *r == region && k == kind);
    // ---- plants ----------------------------------------------------------------
    for r in regions {
        let o = r.own.as_ref().unwrap();
        for f in o.facilities.iter().filter(|f| f.kind != "fields" && f.enabled && f.level > 0) {
            let Some(ft) = p.fac_type(&f.kind) else { continue };
            if ft.recipes.len() < 2 {
                continue;
            }
            let starved = f.utilization_bp < 5000 && f.runs.iter().any(|x| !x.missing.is_empty());
            let level = f.level as i64;
            let stocked = |x: &RecipeView| x.inputs.iter().all(|i| *p.avail.get(&i.good).unwrap_or(&0) >= i.amount * level * 3);
            if let Some(chosen) = &f.method {
                // its own choice goes back to the works when the method is starved in its
                // turn, or when a method the works would rather run has its inputs again
                let preferred = ft.recipes.iter().take_while(|x| &x.key != chosen).any(|x| x.available && stocked(x));
                if (starved || preferred) && is_mine(mine, r.id, &f.kind) && p.push(set(r.id, &f.kind, None)) {
                    mine.retain(|(region, kind)| !(*region == r.id && kind == &f.kind));
                }
                continue;
            }
            let Some(active) = ft.recipes.iter().find(|x| Some(&x.key) == f.active_method.as_ref()) else { continue };
            if !starved || active.outputs.is_empty() {
                continue;
            }
            let pw = &o.power;
            let spare = |supply: i64, demand: i64, now: i64, then: i64| then <= now || supply - demand >= (then - now) * level;
            let alt = ft.recipes.iter().find(|x| {
                x.available
                    && x.key != active.key
                    && x.outputs.first().map(|g| g.good) == active.outputs.first().map(|g| g.good)
                    && stocked(x)
                    && spare(pw.shaft_supply, pw.shaft_demand, active.shaft, x.shaft)
                    && spare(pw.elec_supply, pw.elec_demand, active.elec, x.elec)
                    && spare(pw.compute_supply, pw.compute_demand, active.compute, x.compute)
            });
            if let Some(x) = alt {
                if p.push(set(r.id, &f.kind, Some(x.key.clone()))) {
                    mine.push((r.id, f.kind.clone()));
                }
            }
        }
    }
    // ---- fields ------------------------------------------------------------------
    let Some(fields) = p.fac_type("fields") else { return };
    let burns = |key: &str| fields.recipes.iter().find(|x| x.key == key).map(|x| x.inputs.iter().any(|i| i.good == Good::Fuel)).unwrap_or(false);
    let pop = obs.civ.population.max(1) as i64;
    let months = p.stock(Good::Food) / (pop * obs.units.food_per_person_month.max(1));
    // held only while the food store stands at the seat's own reserve target, and
    // let go as soon as it falls more than a month below it: lower yields must never
    // thin the stores that the people's growth depends on
    let reserve = (obs.civ.policies.food_reserve_months as i64).max(3);
    let eating = obs.civ.food_fulfillment_bp >= 10_000;
    let (fed, hungry) = (eating && months >= reserve, !eating || months < reserve - 1);
    // fuel that works or open orders went without (the fields' own report is not a reason)
    let fuel_short = regions.iter().any(|r| r.own.as_ref().unwrap().facilities.iter().filter(|f| f.kind != "fields").any(|f| f.runs.iter().any(|x| x.missing.contains(&Good::Fuel))))
        || obs.projects.iter().filter(|x| !x.paused).any(|x| x.inputs_needed.iter().zip(x.inputs_committed.iter()).any(|(need, have)| need.good == Good::Fuel && have.amount < need.amount && p.stock(Good::Fuel) < need.amount - have.amount));
    // the seat can work its fields by machine, and the best method it can use that burns no fuel
    let motorized = fields.recipes.iter().any(|x| x.available && burns(&x.key));
    let frugal = fields.recipes.iter().filter(|x| x.available && !burns(&x.key)).last().map(|x| x.key.clone());
    let total_levels: i64 = regions.iter().map(|r| p.level(r, "fields") as i64).sum();
    for r in regions {
        let o = r.own.as_ref().unwrap();
        let Some(f) = o.facilities.iter().find(|f| f.kind == "fields" && f.level > 0) else { continue };
        match &f.method {
            Some(_) => {
                // lifted only when a year of the fields' own burning is in store beside
                // what everything else used, so that the hold does not come and go
                let field_fuel: i64 = fields.recipes.iter().flat_map(|x| x.inputs.iter()).filter(|i| i.good == Good::Fuel).map(|i| i.amount).max().unwrap_or(0) * total_levels * 12;
                let plenty = p.stock(Good::Fuel) >= p.line(Good::Fuel).map(used_in_year).unwrap_or(0) + field_fuel;
                if (hungry || (!fuel_short && plenty)) && is_mine(mine, r.id, "fields") && p.push(set(r.id, "fields", None)) {
                    mine.retain(|(region, kind)| !(*region == r.id && kind == "fields"));
                }
            }
            None => {
                if fed && fuel_short && motorized {
                    if let Some(key) = &frugal {
                        if p.push(set(r.id, "fields", Some(key.clone()))) {
                            mine.push((r.id, "fields".to_string()));
                        }
                    }
                }
            }
        }
    }
}

fn power(p: &mut Plan, regions: &[&RegionView]) {
    // compute is a national service: add capacity where a centre already runs
    if let Some(first) = regions.first() {
        let pw = &first.own.as_ref().unwrap().power;
        if pw.compute_demand > pw.compute_supply {
            let host = regions.iter().copied().find(|r| p.level(r, "datacenter") > 0).unwrap_or(first);
            if !p.try_build(host, "datacenter", 1, 2) {
                p.wanted.insert(Good::Hardware);
            }
        }
    }
    for r in regions {
        if p.full() {
            break;
        }
        let o = r.own.as_ref().unwrap();
        let pw = &o.power;
        if pw.shaft_demand > pw.shaft_supply {
            let coal = p.stock(Good::Coal) > 30_000 || p.produces(Good::Coal);
            let fuel = p.stock(Good::Fuel) > 20_000 || p.produces(Good::Fuel);
            let _ = p.try_build(r, "waterwheel", 1, 3) || (coal && p.try_build(r, "steam", 1, 3)) || (fuel && p.try_build(r, "diesel", 1, 3));
            if !coal && p.fac_type("steam").map(|f| f.available).unwrap_or(false) {
                p.wanted.insert(Good::Coal);
            }
        }
        if pw.elec_demand > pw.elec_supply {
            // a station is worth building only where its fuel is: plants of a kind that
            // already stand idle for want of it are not added to, and the stations that
            // burn nothing come first
            let starved = |kind: &str| regions.iter().any(|x| x.own.as_ref().unwrap().facilities.iter().any(|f| f.kind == kind && f.runs.iter().any(|run| !run.missing.is_empty())));
            let fed = |g: Good| p.stock(g) > 200_000 || p.produces(g);
            let fusion = fed(Good::Chemicals) && !starved("fusion");
            let fission = fed(Good::Minerals) && !starved("fission");
            if starved("fission") {
                p.wanted.insert(Good::Minerals);
            }
            let built = p.try_build(r, "hydro", 1, 3) || p.try_build(r, "orbital_power", 1, 3) || (fusion && p.try_build(r, "fusion", 1, 3)) || (fission && p.try_build(r, "fission", 1, 3));
            if !built {
                // electricity from shaft work: a generator hall plus an engine behind it
                if (p.level(r, "generator") as i64) * 60_000 < pw.elec_demand && p.try_build(r, "generator", 1, 3) {
                    continue;
                }
                let coal = p.stock(Good::Coal) > 30_000 || p.produces(Good::Coal);
                let fuel = p.stock(Good::Fuel) > 20_000 || p.produces(Good::Fuel);
                let _ = (coal && p.try_build(r, "steam", 1, 3)) || (fuel && p.try_build(r, "diesel", 1, 3)) || p.try_build(r, "waterwheel", 1, 3);
            }
            if regions.len() > 1 {
                p.try_build(r, "grid", 1, 4);
            }
        }
    }
}

/// Found the first installation of things the seat can now build but never has.
fn new_capabilities(p: &mut Plan, regions: &[&RegionView], capital: &RegionView) {
    let obs = p.obs;
    let limit = match p.diff {
        Difficulty::Easy => 1,
        Difficulty::Medium => 2,
        Difficulty::Hard => 3,
    };
    let mut cands: Vec<&FacilityType> = obs
        .catalog
        .facilities
        .iter()
        .filter(|f| f.available && f.category != "Food" && !p.civ_has(&f.kind) && !p.civ_pending(&f.kind))
        .filter(|f| !matches!(f.kind.as_str(), "holy_site" | "barracks" | "jump_base" | "grid" | "generator" | "granary" | "roads" | "port" | "waterworks" | "sewers" | "water_treatment" | "clinic" | "hospital"))
        .collect();
    cands.sort_by_key(|f| (f.work, f.kind.clone()));
    let mut started = 0;
    for ft in cands {
        if started >= limit || p.full() {
            break;
        }
        // fuel-burning plant is pointless without its fuel
        let fed = ft.recipes.iter().filter(|r| r.available).any(|r| r.inputs.iter().all(|i| p.stock(i.good) > 0 || p.produces(i.good) || producer(p, i.good).is_some()));
        if !ft.recipes.is_empty() && !fed {
            for r in ft.recipes.iter().filter(|r| r.available) {
                for i in &r.inputs {
                    p.wanted.insert(i.good);
                }
            }
            continue;
        }
        let target = if ft.site_key == "any" {
            // institutions belong at the capital, unless only another region has the site crew
            if ft.category == "Research" || ft.category == "Education" || ft.category == "Civic" {
                if p.can_crew(capital, &ft.kind) { Some(capital) } else { p.workplace_region(ft).filter(|r| p.can_crew(r, &ft.kind)).or(Some(capital)) }
            } else {
                p.workplace_region(ft).or(Some(capital))
            }
        } else {
            regions.iter().copied().filter(|r| p.site_cap(ft, r) > 0).max_by_key(|r| (p.can_crew(r, &ft.kind), *p.idle.get(&r.id).unwrap_or(&0), std::cmp::Reverse(r.id)))
        };
        if let Some(r) = target {
            if p.try_build(r, &ft.kind, 1, 4) {
                started += 1;
            }
        }
    }
    // qualified people without posts: give research and craft somewhere to work
    for kind in ["jump_testbed", "high_energy", "auto_lab", "advanced_lab", "institute", "laboratory", "archive", "makers_circle"] {
        if p.full() {
            break;
        }
        let Some(ft) = p.fac_type(kind) else { continue };
        if !ft.available || !p.civ_has(kind) || p.civ_pending(kind) {
            continue;
        }
        let idle_staff: i64 = ft
            .jobs
            .iter()
            .filter_map(|j| j.qual)
            .map(|q| obs.civ.quals.iter().find(|x| x.qual == q).map(|x| x.count as i64 - x.employed as i64).unwrap_or(0))
            .sum();
        let posts: i64 = ft.jobs.iter().filter(|j| j.qual.is_some()).map(|j| j.count as i64).sum();
        // only when the work this kind of staff does is actually backed up
        let class = ft.recipes.iter().find_map(|r| r.research.map(|x| x.0));
        let saturated = class
            .map(|k| obs.civ.research.iter().filter(|l| l.class >= k).all(|l| l.used * 100 >= l.capacity * 85) && obs.projects.iter().any(|x| x.kind == "research" || x.kind == "lead" || x.kind == "study"))
            .unwrap_or(false);
        // every existing level must be staffed and running before another is worth its upkeep
        let healthy = regions.iter().all(|r| {
            r.own.as_ref().unwrap().facilities.iter().filter(|f| f.kind == kind).all(|f| f.staffed * 10 >= f.staff_needed * 9 && f.utilization_bp >= 7000)
        });
        if saturated && healthy && idle_staff >= posts.max(1) {
            if let Some(r) = regions.iter().copied().filter(|r| p.level(r, kind) > 0).min_by_key(|r| (p.level(r, kind), r.id)) {
                p.try_build(r, kind, 1, 4);
            }
        }
    }
}

fn expansion(ai: &mut NativeAi, p: &mut Plan, regions: &[&RegionView]) {
    let obs = p.obs;
    let seat = obs.seat;
    // survey the frontier
    let surveying = obs.projects.iter().filter(|x| x.kind == "survey").count();
    let max_surveys = if p.diff == Difficulty::Hard { 2 } else { 1 };
    if surveying < max_surveys && p.stock(Good::Food) > 150_000 {
        let mut frontier: Vec<&RegionView> = obs
            .regions
            .iter()
            .filter(|r| r.survey.is_none() && r.owner != Some(seat))
            .filter(|r| !obs.projects.iter().any(|x| x.kind == "survey" && x.region == Some(r.id)))
            .collect();
        let near = |r: &RegionView| regions.iter().any(|o| o.neighbors.iter().any(|n| n.region == r.id));
        frontier.sort_by_key(|r| (if near(r) { 0 } else { 1 }, r.id));
        for r in frontier.into_iter().take(max_surveys - surveying) {
            p.push(Action::StartProject { spec: ProjectSpec::Survey { region: r.id }, priority: Some(6) });
        }
    }
    // settle within administrative reach
    let settling = obs.projects.iter().any(|x| x.kind == "settle");
    let gap = match p.diff {
        Difficulty::Easy => 5,
        Difficulty::Medium => 3,
        Difficulty::Hard => 2,
    };
    let slack = if p.diff == Difficulty::Hard { 1 } else { 0 };
    let pop = obs.civ.population.max(1) as i64;
    if settling || obs.round < ai.memory.last_settle_round + gap || (obs.civ.admin_load as i64) >= obs.civ.admin_capacity as i64 + slack || p.stock(Good::Food) < pop * 3 * obs.units.food_per_person_month.max(1) {
        return;
    }
    let sea_ok = p.fac_type("port").map(|f| f.available).unwrap_or(false);
    let mut best: Option<(i64, RegionId, RegionId)> = None;
    let mut second: Option<(i64, RegionId, RegionId)> = None;
    for from in regions {
        let fo = from.own.as_ref().unwrap();
        if (fo.population as i64) < 260 * K {
            continue;
        }
        for n in &from.neighbors {
            if n.kind == "sea" && !sea_ok {
                continue;
            }
            let Some(t) = obs.regions.iter().find(|r| r.id == n.region) else { continue };
            if t.owner.is_some() || t.settlement != SettlementKind::Wilderness || obs.foreign_armies.iter().any(|a| a.region == t.id) {
                continue;
            }
            let mut score: i64 = match t.terrain {
                Terrain::Plains => 500,
                Terrain::Forest | Terrain::Marsh => 400,
                Terrain::Hills | Terrain::Steppe => 300,
                _ => 120,
            };
            if t.river {
                score += 150;
            }
            if let Some(s) = &t.survey {
                score = s.arable as i64 * 12 + s.wild_food as i64 + s.water as i64 / (20 * K) + s.forest as i64 * 5;
                for d in &s.deposits {
                    let g = match d.kind {
                        Deposit::CopperOre => Good::CopperOre,
                        Deposit::IronOre => Good::IronOre,
                        Deposit::Coal => Good::Coal,
                        Deposit::Crude => Good::Crude,
                        Deposit::Minerals => Good::Minerals,
                    };
                    let known_elsewhere = regions.iter().any(|r| r.survey.as_ref().map(|x| x.deposits.iter().any(|y| y.kind == d.kind)).unwrap_or(false));
                    score += if p.wanted.contains(&g) || !known_elsewhere { 700 } else { 150 };
                }
            }
            if best.map(|(s, _, _)| score > s).unwrap_or(true) {
                if best.map(|b| b.2 != t.id).unwrap_or(false) {
                    second = best;
                }
                best = Some((score, from.id, t.id));
            } else if second.map(|(s, _, _)| score > s).unwrap_or(true) && best.map(|b| b.2 != t.id).unwrap_or(true) {
                second = Some((score, from.id, t.id));
            }
        }
    }
    // in a long round, the runner-up is settled later, once the sending region is crowded
    if let (true, Some((score, from, to))) = (p.long && (obs.civ.admin_load as i64) + 2 <= obs.civ.admin_capacity as i64 + slack, second) {
        if score >= 250 {
            let fp = regions.iter().find(|r| r.id == from).and_then(|r| r.own.as_ref()).map(|o| o.population).unwrap_or(0);
            let people = (fp / 5).clamp(30_000, 120_000);
            p.directives.push(Action::Directive { op: DirectiveOp::Add, id: None, directive: Some(Directive::SettleTarget { from, to, people, when_crowd_bp: 8500 }), position: None });
        }
    }
    if let Some((score, from, to)) = best {
        if score >= 250 {
            let fp = regions.iter().find(|r| r.id == from).and_then(|r| r.own.as_ref()).map(|o| o.population).unwrap_or(0);
            let people = (fp / 5).clamp(30_000, 120_000);
            if p.push(Action::StartProject { spec: ProjectSpec::Settle { from, to, people }, priority: Some(3) }) {
                ai.memory.last_settle_round = obs.round;
            }
        }
    }
}

fn military(ai: &mut NativeAi, p: &mut Plan, regions: &[&RegionView], capital: &RegionView, pop: i64) {
    let obs = p.obs;
    let seat = obs.seat;
    let soldiers: i64 = obs.armies.iter().map(|a| a.soldiers.iter().map(|(_, n)| *n as i64).sum::<i64>()).sum();
    let at_war = !obs.diplomacy.wars.is_empty();
    let neighbours: Vec<&ForeignCiv> = obs.others.iter().filter(|o| o.status != SeatStatus::Eliminated && borders(obs, o.seat)).collect();
    let mine = own_power(obs);
    let threatened = obs.foreign_armies.iter().any(|a| regions.iter().any(|r| r.id == a.region || r.neighbors.iter().any(|n| n.region == a.region)) && !obs.civ.subordinates.contains(&a.owner) && obs.civ.overlord != Some(a.owner));

    // choose whether to press a war: only the stronger settings start one, and only with a clear edge
    if ai.memory.war_target.map(|t| obs.others.iter().find(|o| o.seat == t).map(|o| o.status == SeatStatus::Eliminated || o.overlord == Some(seat)).unwrap_or(true)).unwrap_or(false) {
        ai.memory.war_target = None;
    }
    let revealed = obs.objectives.victory.is_some();
    if ai.memory.war_target.is_none() && !at_war && p.diff != Difficulty::Easy && obs.civ.overlord.is_none() && soldiers >= 150 * K {
        let pacts: Vec<SeatId> = obs.diplomacy.treaties.iter().filter(|t| t.status == "active" && t.clauses.iter().any(|c| matches!(c, Clause::NonAggression { .. } | Clause::DefensivePact { .. }))).flat_map(|t| t.parties.iter().copied()).collect();
        let edge = if p.diff == Difficulty::Hard { 2 } else { 3 };
        let mut best: Option<(i64, SeatId)> = None;
        for o in &neighbours {
            if obs.civ.subordinates.contains(&o.seat) || pacts.contains(&o.seat) {
                continue;
            }
            let theirs = their_power(obs, o.seat) + their_population(obs, o.seat) * 4 * TIER_POWER[o.observed_tier.unwrap_or(0).min(1) as usize] / 1000 / 100;
            let worthwhile = revealed || (p.diff == Difficulty::Hard && their_population(obs, o.seat) * 2 < pop && o.trust < 45);
            if worthwhile && mine > theirs * edge && best.map(|(t, _)| theirs < t).unwrap_or(true) {
                best = Some((theirs, o.seat));
            }
        }
        ai.memory.war_target = best.map(|b| b.1);
    }

    // force size: a share of the population, larger under threat
    let room_bp: i64 = if at_war { 500 } else if ai.memory.war_target.is_some() || revealed { 350 } else if threatened { 250 } else if !neighbours.is_empty() { match p.diff { Difficulty::Easy => 60, Difficulty::Medium => 120, Difficulty::Hard => 180 } } else { 0 };
    let target = pop * room_bp / 10_000;
    let recruiting: Vec<&ProjectView> = obs.projects.iter().filter(|x| x.kind == "recruit").collect();
    if soldiers + (recruiting.len() as i64) * 200 * K < target && recruiting.len() < 2 && obs.civ.food_fulfillment_bp >= 9500 {
        let tier = obs.catalog.unit_tiers.iter().filter(|t| t.available).map(|t| t.tier).max().unwrap_or(0);
        let home = regions.iter().copied().find(|r| r.own.as_ref().unwrap().facilities.iter().any(|f| f.kind == "barracks")).unwrap_or(capital);
        if tier >= 1 && p.level(home, "barracks") == 0 {
            p.try_build(home, "barracks", 1, 3);
        }
        // the best equipment we can actually supply, falling back a tier at a time
        let size = (target - soldiers).clamp(40 * K, if at_war || revealed { 800 * K } else { 300 * K });
        let mut chosen: Option<u8> = None;
        for t in (0..=tier).rev() {
            if t >= 1 && p.level(home, "barracks") == 0 {
                continue;
            }
            if let Some(def) = obs.catalog.unit_tiers.iter().find(|x| x.tier == t && x.available) {
                // equipment is listed per thousand soldiers
                if def.equipment.iter().all(|e| *p.avail.get(&e.good).unwrap_or(&0) >= e.amount * size / K) {
                    chosen = Some(t);
                    break;
                }
                if t == tier {
                    for e in &def.equipment {
                        p.wanted.insert(e.good);
                    }
                }
            }
        }
        if let Some(t) = chosen {
            let def = obs.catalog.unit_tiers.iter().find(|x| x.tier == t).unwrap();
            let role = Role::ALL[(mix(ai.policy_seed ^ obs.round as u64) % 3) as usize];
            for e in &def.equipment {
                *p.avail.entry(e.good).or_insert(0) -= e.amount * size / K;
            }
            p.push(Action::StartProject { spec: ProjectSpec::Recruit { region: home.id, role, soldiers: size as u32, tier: t }, priority: Some(if at_war { 1 } else { 4 }) });
        }
    }

    // small formations of the same kind standing together become one
    let mut merged: HashSet<u32> = HashSet::new();
    for a in obs.armies.iter().filter(|a| a.training_months_left == 0 && !a.in_battle) {
        if merged.contains(&a.id) {
            continue;
        }
        let size: i64 = a.soldiers.iter().map(|(_, n)| *n as i64).sum();
        if size >= 300 * K {
            continue;
        }
        if let Some(b) = obs.armies.iter().find(|b| b.id != a.id && b.region == a.region && b.tier == a.tier && b.training_months_left == 0 && !merged.contains(&b.id)) {
            merged.insert(a.id);
            merged.insert(b.id);
            p.push(Action::MilitaryOrder { army: a.id, order: ArmyOrder::Merge { into: b.id } });
        }
    }

    // orders
    let region = |id: RegionId| obs.regions.iter().find(|r| r.id == id);
    let enemy: Option<SeatId> = obs.diplomacy.wars.first().copied().or(if mine > 0 && soldiers >= 150 * K { ai.memory.war_target } else { None });
    // one objective for the whole field force: the enemy region nearest our capital
    let objective: Option<RegionId> = enemy.and_then(|e| {
        let mut dist: HashMap<RegionId, u32> = HashMap::new();
        dist.insert(capital.id, 0);
        let mut queue = vec![capital.id];
        let mut qi = 0;
        while qi < queue.len() {
            let x = queue[qi];
            qi += 1;
            let Some(r) = region(x) else { continue };
            if r.controller == Some(e) || (r.owner == Some(e) && r.controller != Some(seat)) {
                return Some(x);
            }
            for n in &r.neighbors {
                if !dist.contains_key(&n.region) {
                    dist.insert(n.region, dist[&x] + 1);
                    queue.push(n.region);
                }
            }
        }
        None
    });
    let field_strength: i64 = obs.armies.iter().filter(|a| a.training_months_left == 0).map(|a| a.soldiers.iter().map(|(_, n)| *n as i64).sum::<i64>()).sum();
    let mut defending: i64 = 0;
    for a in obs.armies.iter().filter(|a| a.training_months_left == 0 && !merged.contains(&a.id)) {
        if p.full() {
            break;
        }
        // defend: go where our land is entered, but only with as much as the threat calls for
        let invaded = regions.iter().copied().find(|r| obs.foreign_armies.iter().any(|f| f.region == r.id && obs.diplomacy.wars.contains(&f.owner)) || r.controller != Some(seat));
        if let Some(r) = invaded {
            let threat: i64 = obs.foreign_armies.iter().filter(|f| f.region == r.id).map(|f| f.strength_high as i64).sum();
            if defending < threat * 3 + 100 * K || r.controller != Some(seat) {
                defending += a.soldiers.iter().map(|(_, n)| *n as i64).sum::<i64>();
                if a.region != r.id && a.target != Some(r.id) {
                    p.push(Action::MilitaryOrder { army: a.id, order: if r.controller == Some(seat) { ArmyOrder::Move { to: r.id } } else { ArmyOrder::Attack { region: r.id } } });
                }
                continue;
            }
        }
        let Some(goal) = objective else {
            if a.order != "hold" && !at_war {
                p.push(Action::MilitaryOrder { army: a.id, order: ArmyOrder::Hold });
            }
            continue;
        };
        if a.order == "attack" && a.target == Some(goal) {
            continue;
        }
        // march only with enough to take and hold something
        if field_strength < 150 * K || a.morale_bp < 4500 {
            continue;
        }
        p.push(Action::MilitaryOrder { army: a.id, order: ArmyOrder::Attack { region: goal } });
    }
}

fn endgame(p: &mut Plan, regions: &[&RegionView]) {
    let obs = p.obs;
    let Some(v) = &obs.objectives.victory else { return };
    // two independent assembly lines in two regions
    if let Some(ft) = p.fac_type("jump_yard") {
        if ft.available {
            let have = regions.iter().filter(|r| p.level(r, "jump_yard") > 0 || p.pending(r.id, "jump_yard")).count();
            if have < 2 {
                if let Some(r) = regions.iter().copied().find(|r| p.level(r, "jump_yard") == 0 && !p.pending(r.id, "jump_yard")) {
                    p.try_build(r, "jump_yard", 1, 2);
                }
            }
        }
    }
    for r in regions.iter().filter(|r| r.test_node) {
        if p.level(r, "jump_base") == 0 {
            p.try_build(r, "jump_base", 1, 2);
        }
    }
    // every line and node needs freight links of grade two: a railway, or roads and a harbour
    let sites: Vec<&RegionView> = regions.iter().copied().filter(|r| ["jump_yard", "jump_base"].iter().any(|k| p.level(r, k) > 0 || p.pending(r.id, k))).collect();
    for r in sites {
        let grade = p.level(r, "roads") as i64 + p.level(r, "port") as i64 + 2 * p.level(r, "rail") as i64 + 3 * p.level(r, "depot") as i64;
        if grade >= 2 || ["rail", "roads", "port", "depot"].iter().any(|k| p.pending(r.id, k)) {
            continue;
        }
        for k in ["rail", "depot", "roads", "port"] {
            if p.level(r, k) == 0 && p.fac_type(k).map(|f| f.available).unwrap_or(false) && p.site_cap(p.fac_type(k).unwrap(), r) > 0 && p.try_build(r, k, 1, 2) {
                break;
            }
        }
    }
    let busy = |k: &str| obs.projects.iter().any(|x| x.kind == k);
    if v.assemblies_operational >= 1 && !busy("ftl_trial") {
        let last = v.trials.iter().copied().max();
        let due = match last {
            None => true,
            Some(m) => obs.month >= m + TRIAL_SPACING,
        };
        let flown = obs.chronicle.iter().any(|e| e.title.starts_with("Loaded jump round trip"));
        if (v.governance_months > 0 && due && v.trials.len() < 2) || !flown {
            p.push(Action::StartProject { spec: ProjectSpec::FtlTrial, priority: Some(2) });
        }
    }
    let nodes_ok = v.ftl_checks.iter().any(|c| c.label.starts_with("Three deployment nodes") && c.ok);
    if nodes_ok && !v.deployment_done && !busy("ftl_deployment") {
        p.push(Action::StartProject { spec: ProjectSpec::FtlDeployment, priority: Some(2) });
    }
    if v.assemblies_operational >= 3 && !v.replacement_done && !busy("ftl_replacement") {
        p.push(Action::StartProject { spec: ProjectSpec::FtlReplacement, priority: Some(2) });
    }
}
