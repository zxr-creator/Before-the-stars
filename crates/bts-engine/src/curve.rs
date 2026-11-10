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
    before: Vec<(i64, u32, u32)>,
    last_sample: Option<Month>,
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
        CurveRecorder { rows: Vec::new(), traded: vec![0; n], births: vec![0; n], deaths: vec![0; n], before: vec![(0, 0, 0); n], last_sample: None }
    }

    pub fn before_month(&mut self, w: &World) {
        for (i, civ) in w.civs.iter().enumerate() {
            self.before[i] = (traded_mass(civ), civ.flows.births, civ.flows.deaths);
        }
    }

    pub fn after_month(&mut self, w: &World) {
        for (i, civ) in w.civs.iter().enumerate() {
            let (t, b, d) = self.before[i];
            self.traded[i] += traded_mass(civ) - t;
            self.births[i] += civ.flows.births.saturating_sub(b) as u64;
            self.deaths[i] += civ.flows.deaths.saturating_sub(d) as u64;
        }
        self.sample_if_due(w);
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
            });
        }
    }
}
