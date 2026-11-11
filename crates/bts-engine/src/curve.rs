//! Calibration curves (design chapter 36, section 10, slice 0).
//!
//! A [`CurveRecorder`] samples every seat at the start of each decade while a
//! match runs: population, regions, technologies understood by tier, research
//! capacity, trade, births and deaths over the decade, and the first decade in
//! which each era milestone of table 2.7 was understood. It reads the whole
//! world, so it is referee-level disclosure: calibration tooling only, never
//! served to a seat and never saved.

use crate::content::content;
use crate::state::*;
use bts_protocol::*;

/// The era milestones of design table 2.7 recorded per seat, by node id. `SCI`
/// stands for the scientific-method milestone.
pub const MILESTONES: [&str; 25] = [
    "T007", "T008", "T010", "T011", "T015", "T025", "T022", "T023", "T024", "T027", "T028", "T029", "T030", "T036", "T048", "SCI", "T080", "T060", "T061", "T100", "T111", "T142", "T147", "T162", "T167",
];

/// Goods whose production over each decade the curve records (ruleset 3.0 slice 5:
/// when the chains of design chapter 36, section 5.4 come into use).
pub const TRACKED_GOODS: [Good; 14] = [Good::Timber, Good::Tin, Good::Horses, Good::Salt, Good::Saltpetre, Good::Munitions, Good::Fertilizer, Good::Gas, Good::Helium, Good::Aluminium, Good::Magnets, Good::Batteries, Good::NuclearFuel, Good::Lattice];

/// One seat at the start of one decade.
#[derive(Clone, Debug)]
pub struct CurveRow {
    /// Completed months at the sample.
    pub month: Month,
    /// Historical year of the month about to be simulated (signed, no year zero).
    pub year: i32,
    pub seat: SeatId,
    pub name: String,
    pub controller: ControllerKind,
    pub status: SeatStatus,
    pub population: u64,
    pub regions: u32,
    pub understood: u32,
    /// Technologies understood, by tier 0-9.
    pub tiers: [u16; 10],
    pub highest_tier: u8,
    /// Researcher-months available and used in the last month.
    pub research_cap: i64,
    pub research_used: i64,
    /// Tonnes of goods received and sent (by mass) over the decade before the sample.
    pub traded_t: i64,
    pub births: u64,
    pub deaths: u64,
    pub food_bp: u16,
    pub soldiers: u32,
    /// Milestones of [`MILESTONES`] reached by the sample.
    pub milestones: [bool; 25],
    /// Gross production of each of [`TRACKED_GOODS`] over the decade before the sample.
    pub made: [i64; 14],
    /// Share of the working-age people working for food in the last month, and the
    /// rations they made per worker (design chapter 36, section 4.2 targets).
    pub food_share_bp: u16,
    pub food_per_worker: i64,
    /// Practices established (adoption complete) at the sample.
    pub established: u32,
    /// Last month's population-weighted fertility diagnostics (`CivDiag`).
    pub fert_food_bp: i64,
    pub fert_intensity_bp: i64,
    pub cap_ratio_bp: i64,
    pub land_bp: i64,
}

impl CurveRow {
    pub fn csv_header() -> String {
        let mut h = String::from("month,year,seat,name,controller,status,population,regions,understood");
        for t in 0..10 {
            h += &format!(",tier{t}");
        }
        h += ",highest_tier,research_cap,research_used,traded_t,births,deaths,food_bp,soldiers";
        for m in MILESTONES {
            h += &format!(",m_{m}");
        }
        for g in TRACKED_GOODS {
            h += &format!(",made_{}", serde_json::to_value(g).ok().and_then(|v| v.as_str().map(|x| x.to_string())).unwrap_or_default());
        }
        h += ",food_share_bp,food_per_worker,established,fert_food_bp,fert_intensity_bp,cap_ratio_bp,land_bp";
        h
    }
    pub fn csv(&self) -> String {
        let mut s = format!(
            "{},{},{},{},{:?},{:?},{},{},{}",
            self.month, self.year, self.seat, self.name.replace(',', " "), self.controller, self.status, self.population, self.regions, self.understood
        );
        for t in self.tiers {
            s += &format!(",{t}");
        }
        s += &format!(",{},{},{},{},{},{},{},{}", self.highest_tier, self.research_cap, self.research_used, self.traded_t, self.births, self.deaths, self.food_bp, self.soldiers);
        for m in self.milestones {
            s += if m { ",1" } else { ",0" };
        }
        for v in self.made {
            s += &format!(",{v}");
        }
        s += &format!(",{},{},{},{},{},{},{}", self.food_share_bp, self.food_per_worker, self.established, self.fert_food_bp, self.fert_intensity_bp, self.cap_ratio_bp, self.land_bp);
        s
    }
}

/// Accumulates decade flows between samples.
#[derive(Clone, Debug, Default)]
pub struct CurveRecorder {
    pub rows: Vec<CurveRow>,
    traded: Vec<i64>,
    births: Vec<u64>,
    deaths: Vec<u64>,
    made: Vec<[i64; 14]>,
    before_made: Vec<[i64; 14]>,
    before: Vec<(i64, u32, u32)>,
    last_sample: Option<Month>,
    /// For each seat and technology, the first month at which its prerequisites were
    /// all understood, it became a lead, it was discovered and it was understood
    /// (0 = not yet). Read by `bts critical-path` (design chapter 39, section 8.3).
    pub nodes: Vec<Vec<[Month; 4]>>,
}

fn traded_mass(civ: &Civ) -> i64 {
    Good::ALL
        .iter()
        .map(|g| (civ.flows.traded_in[g.index()] + civ.flows.traded_out[g.index()]) * crate::content::good_mass_kg(*g) / 1000)
        .sum()
}

impl CurveRecorder {
    pub fn new(w: &World) -> CurveRecorder {
        let n = w.civs.len();
        CurveRecorder { rows: Vec::new(), traded: vec![0; n], births: vec![0; n], deaths: vec![0; n], made: vec![[0; 14]; n], before_made: vec![[0; 14]; n], before: vec![(0, 0, 0); n], last_sample: None, nodes: Vec::new() }
    }

    pub fn before_month(&mut self, w: &World) {
        for (i, civ) in w.civs.iter().enumerate() {
            self.before[i] = (traded_mass(civ), civ.flows.births, civ.flows.deaths);
            for (k, g) in TRACKED_GOODS.iter().enumerate() {
                self.before_made[i][k] = civ.flows.produced[g.index()];
            }
        }
    }

    pub fn after_month(&mut self, w: &World) {
        for (i, civ) in w.civs.iter().enumerate() {
            let (t, b, d) = self.before[i];
            self.traded[i] += traded_mass(civ) - t;
            self.births[i] += civ.flows.births.saturating_sub(b) as u64;
            self.deaths[i] += civ.flows.deaths.saturating_sub(d) as u64;
            for (k, g) in TRACKED_GOODS.iter().enumerate() {
                // flows restart at round boundaries: a fall means a fresh round
                let now = civ.flows.produced[g.index()];
                self.made[i][k] += if now >= self.before_made[i][k] { now - self.before_made[i][k] } else { now };
            }
        }
        let c = content();
        let tracking = !self.nodes.is_empty();
        for (i, civ) in w.civs.iter().enumerate().filter(|_| tracking) {
            for (t, st) in civ.tech.iter().enumerate() {
                let rec = &mut self.nodes[i][t];
                if rec[3] != 0 {
                    continue;
                }
                if rec[0] == 0 && c.techs[t].prereq.eval(&CivCtx { world: w, seat: civ.seat }) {
                    rec[0] = w.month;
                }
                if rec[1] == 0 && st.state >= ST_HINTED {
                    rec[1] = w.month;
                }
                if rec[2] == 0 && st.state >= ST_DISCOVERED {
                    rec[2] = w.month;
                }
                if st.state >= ST_UNDERSTOOD {
                    rec[3] = w.month;
                }
            }
        }
        self.sample_if_due(w);
    }

    /// Also record, every month, when each technology became ready, a lead,
    /// discovered and understood for every seat (`bts critical-path`).
    pub fn track_nodes(&mut self, w: &World) {
        if self.nodes.is_empty() {
            self.nodes = vec![vec![[0; 4]; content().techs.len()]; w.civs.len()];
        }
    }

    /// Record a row per seat if the month about to be simulated opens a decade.
    pub fn sample_if_due(&mut self, w: &World) {
        if self.last_sample == Some(w.month) || !crate::util::decade_start(&w.cfg, w.month) {
            return;
        }
        self.last_sample = Some(w.month);
        let c = content();
        let year = crate::util::date(&w.cfg, w.month).0;
        for (i, civ) in w.civs.iter().enumerate() {
            let mut tiers = [0u16; 10];
            for (t, st) in civ.tech.iter().enumerate() {
                if st.state >= ST_UNDERSTOOD {
                    tiers[c.techs[t].tier as usize] += 1;
                }
            }
            let mut milestones = [false; 25];
            for (k, id) in MILESTONES.iter().enumerate() {
                milestones[k] = if *id == "SCI" { civ.milestones.sci_method.is_some() } else { civ.knows_id(id) };
            }
            self.rows.push(CurveRow {
                month: w.month,
                year,
                seat: civ.seat,
                name: civ.name.clone(),
                controller: civ.controller,
                status: civ.status,
                population: w.civ_population(civ.seat) as u64,
                regions: w.owned(civ.seat).len() as u32,
                understood: tiers.iter().map(|n| *n as u32).sum(),
                tiers,
                highest_tier: (0..10).rev().find(|t| tiers[*t] > 0).unwrap_or(0) as u8,
                research_cap: civ.research_cap.iter().sum(),
                research_used: civ.research_used.iter().sum(),
                traded_t: std::mem::take(&mut self.traded[i]),
                births: std::mem::take(&mut self.births[i]),
                deaths: std::mem::take(&mut self.deaths[i]),
                food_bp: civ.food_ful_bp,
                soldiers: w.armies.iter().filter(|a| a.owner == civ.seat).map(|a| a.count()).sum(),
                milestones,
                made: std::mem::take(&mut self.made[i]),
                food_share_bp: (civ.labor.food as u64 * 10_000 / civ.labor.working_age.max(1) as u64).min(10_000) as u16,
                food_per_worker: {
                    let made: i64 = w.regions.iter().filter(|r| r.controller == Some(civ.seat)).map(|r| r.last.food_made).sum();
                    made / civ.labor.food.max(1) as i64
                },
                established: (0..civ.practice.len()).filter(|p| civ.established(*p)).count() as u32,
                fert_food_bp: civ.diag.fert_food_bp,
                fert_intensity_bp: civ.diag.fert_intensity_bp,
                cap_ratio_bp: civ.diag.cap_ratio_bp,
                land_bp: civ.diag.land_bp,
            });
        }
    }
}
