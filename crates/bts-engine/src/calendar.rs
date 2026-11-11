//! The historical calendar (design chapter 36, sections 2.1-2.3).
//!
//! The authoritative clock is still the simulated month, `World.month`, counting
//! completed months since the start. A calendar fixes the start year and the
//! length of every decision round, by round number, from a table of segments.
//! Years are kept in astronomical numbering inside the engine (1 BC = 0,
//! 5000 BC = -4999) and are shown historically, signed, with no year zero
//! (5000 BC = -5000, AD 1 = 1).

use serde::{Deserialize, Serialize};

/// Which round schedule a match follows.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CalendarId {
    /// 5000 BC to AD 2500 in 525 rounds (design table 2.2).
    Standard,
    /// The same dates and rules in 230 rounds.
    Quick,
    /// Tests and calibration only: `rounds` rounds of `months_per_round` months from
    /// 1 January of `start_astro_year`. The reward reference is the start, so the
    /// reward is `2 - T/H` as under ruleset 2.0.
    Fixture { months_per_round: u32, start_astro_year: i32, rounds: u32 },
}

impl Default for CalendarId {
    fn default() -> Self {
        CalendarId::Standard
    }
}

/// One segment of a round schedule: rounds `first..=last` last `years` years each,
/// except that a round starting on 1 January AD 1 is one year shorter (there is no
/// year zero between 1 BC and AD 1 in the historical count the segments are
/// written in).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Segment {
    pub first_round: u32,
    pub last_round: u32,
    pub years_per_round: u32,
    /// Historical years (signed, no year zero) at the segment's start and end.
    pub from: i32,
    pub to: i32,
}

/// Astronomical year of 1 January 5000 BC.
pub const START_ASTRO_YEAR: i32 = -4999;
/// Astronomical year in which the standard and quick calendars end (AD 2500).
pub const HORIZON_ASTRO_YEAR: i32 = 2500;
/// Astronomical year of the reward reference (AD 1900).
pub const REWARD_ASTRO_YEAR: i32 = 1900;

const STANDARD: [Segment; 8] = [
    Segment { first_round: 1, last_round: 60, years_per_round: 50, from: -5000, to: -2000 },
    Segment { first_round: 61, last_round: 110, years_per_round: 40, from: -2000, to: 1 },
    Segment { first_round: 111, last_round: 150, years_per_round: 25, from: 1, to: 1000 },
    Segment { first_round: 151, last_round: 175, years_per_round: 20, from: 1000, to: 1500 },
    Segment { first_round: 176, last_round: 195, years_per_round: 10, from: 1500, to: 1700 },
    Segment { first_round: 196, last_round: 225, years_per_round: 5, from: 1700, to: 1850 },
    Segment { first_round: 226, last_round: 250, years_per_round: 4, from: 1850, to: 1950 },
    Segment { first_round: 251, last_round: 525, years_per_round: 2, from: 1950, to: 2500 },
];

const QUICK: [Segment; 8] = [
    Segment { first_round: 1, last_round: 30, years_per_round: 100, from: -5000, to: -2000 },
    Segment { first_round: 31, last_round: 55, years_per_round: 80, from: -2000, to: 1 },
    Segment { first_round: 56, last_round: 75, years_per_round: 50, from: 1, to: 1000 },
    Segment { first_round: 76, last_round: 85, years_per_round: 50, from: 1000, to: 1500 },
    Segment { first_round: 86, last_round: 95, years_per_round: 20, from: 1500, to: 1700 },
    Segment { first_round: 96, last_round: 110, years_per_round: 10, from: 1700, to: 1850 },
    Segment { first_round: 111, last_round: 120, years_per_round: 10, from: 1850, to: 1950 },
    Segment { first_round: 121, last_round: 230, years_per_round: 5, from: 1950, to: 2500 },
];

/// Historical year (signed, no year zero) of an astronomical year.
pub fn historical(astro: i32) -> i32 {
    if astro >= 1 {
        astro
    } else {
        astro - 1
    }
}

/// Astronomical year of a historical year.
pub fn astronomical(year: i32) -> i32 {
    if year >= 1 {
        year
    } else {
        year + 1
    }
}

/// "5000 BC", "AD 1066".
pub fn year_label(year: i32) -> String {
    if year < 0 {
        format!("{} BC", -year)
    } else {
        format!("AD {year}")
    }
}

pub const MONTH_NAMES: [&str; 12] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

impl CalendarId {
    /// The schedule's segments; a fixture has one.
    pub fn segments(&self) -> Vec<Segment> {
        match self {
            CalendarId::Standard => STANDARD.to_vec(),
            CalendarId::Quick => QUICK.to_vec(),
            CalendarId::Fixture { months_per_round, start_astro_year, rounds } => {
                let from = historical(*start_astro_year);
                let years = (*months_per_round * *rounds / 12) as i32;
                vec![Segment { first_round: 1, last_round: *rounds, years_per_round: (*months_per_round / 12).max(1), from, to: historical(start_astro_year + years) }]
            }
        }
    }

    pub fn key(&self) -> &'static str {
        match self {
            CalendarId::Standard => "standard",
            CalendarId::Quick => "quick",
            CalendarId::Fixture { .. } => "fixture",
        }
    }

    pub fn start_astro_year(&self) -> i32 {
        match self {
            CalendarId::Fixture { start_astro_year, .. } => *start_astro_year,
            _ => START_ASTRO_YEAR,
        }
    }

    /// The last round of the schedule.
    pub fn rounds(&self) -> u32 {
        match self {
            CalendarId::Fixture { rounds, .. } => *rounds,
            _ => self.segments().last().map(|s| s.last_round).unwrap_or(0),
        }
    }

    /// Months in round `r` (1-based). Rounds past the schedule last as long as its
    /// last round.
    pub fn round_months(&self, r: u32) -> u32 {
        if let CalendarId::Fixture { months_per_round, .. } = self {
            return *months_per_round;
        }
        let segs = self.segments();
        let r = r.clamp(1, self.rounds());
        let seg = segs.iter().find(|s| r >= s.first_round && r <= s.last_round).expect("the schedule covers every round");
        let mut months = seg.years_per_round * 12;
        // the round that starts on 1 January AD 1 loses the year that does not exist
        if seg.from == 1 && r == seg.first_round {
            months -= 12;
        }
        months
    }

    /// Completed months at the start of round `r` (round 1 starts at month 0).
    pub fn round_start_month(&self, r: u32) -> Option<u32> {
        if let CalendarId::Fixture { months_per_round, .. } = self {
            return Some(months_per_round * r.saturating_sub(1));
        }
        let mut m = 0u32;
        for seg in self.segments() {
            let short = if seg.from == 1 { 12 } else { 0 };
            if r >= seg.first_round && r <= seg.last_round {
                let before = (r - seg.first_round) * seg.years_per_round * 12;
                return Some(m + before - if r > seg.first_round { short } else { 0 });
            }
            m += (seg.last_round - seg.first_round + 1) * seg.years_per_round * 12 - short;
        }
        if r == self.rounds() + 1 {
            return Some(m);
        }
        None
    }

    /// The horizon: completed months when the schedule ends.
    pub fn horizon(&self) -> u32 {
        match self {
            CalendarId::Fixture { months_per_round, rounds, .. } => months_per_round * rounds,
            _ => ((HORIZON_ASTRO_YEAR - START_ASTRO_YEAR) * 12) as u32,
        }
    }

    /// The month from which wins are scored (`R` of design section 2.3).
    pub fn reward_reference(&self) -> u32 {
        match self {
            CalendarId::Fixture { .. } => 0,
            _ => ((REWARD_ASTRO_YEAR - START_ASTRO_YEAR) * 12) as u32,
        }
    }

    /// Historical year and month of the year (1-12) of the month about to be
    /// simulated after `month` completed months.
    pub fn date(&self, month: u32) -> (i32, u8) {
        (historical(self.start_astro_year() + (month / 12) as i32), (month % 12 + 1) as u8)
    }

    /// The round in progress (or about to be resolved) at `month` completed months.
    pub fn round_at(&self, month: u32) -> u32 {
        let (mut lo, mut hi) = (1u32, self.rounds());
        while lo < hi {
            let mid = (lo + hi + 1) / 2;
            if self.round_start_month(mid).map(|m| m <= month).unwrap_or(false) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        lo
    }
}

/// Reward of the unique winner who won at month `t`: `2 - (t - R) / (H - R)`,
/// clamped to [1, 2].
pub fn winner_reward(cal: &CalendarId, t: u32) -> f64 {
    let (h, r) = (cal.horizon() as f64, cal.reward_reference() as f64);
    (2.0 - (t as f64 - r) / (h - r).max(1.0)).clamp(1.0, 2.0)
}

/// Bounds on a treaty clause term in months while rounds last `round_months`
/// (design section 2.5): at least `max(6, round)`, at most `max(240, 3 x round)`.
pub fn clause_term_bounds(round_months: u32) -> (u32, u32) {
    (6.max(round_months), 240.max(3 * round_months))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_schedule_sums_to_525_rounds_and_89988_months() {
        let c = CalendarId::Standard;
        assert_eq!(c.rounds(), 525);
        let total: u32 = (1..=525).map(|r| c.round_months(r)).sum();
        assert_eq!(total, 89_988);
        assert_eq!(c.horizon(), 89_988);
        assert_eq!(c.round_start_month(526), Some(89_988));
        assert_eq!(c.round_months(1), 600);
        assert_eq!(c.round_months(110), 480);
        assert_eq!(c.round_months(111), 288, "the round from AD 1 lacks the year zero");
        assert_eq!(c.round_months(112), 300);
        assert_eq!(c.round_months(251), 24);
        assert_eq!(c.round_months(525), 24);
        assert_eq!(c.reward_reference(), 82_788);
        // segment boundaries fall on round dates
        for seg in c.segments() {
            let m = c.round_start_month(seg.first_round).unwrap();
            assert_eq!(c.date(m), (seg.from, 1), "segment from round {}", seg.first_round);
        }
        assert_eq!(c.date(c.round_start_month(416).unwrap()).0, 2280);
    }

    #[test]
    fn quick_schedule_sums_to_230_rounds_on_the_same_dates() {
        let c = CalendarId::Quick;
        assert_eq!(c.rounds(), 230);
        let total: u32 = (1..=230).map(|r| c.round_months(r)).sum();
        assert_eq!(total, 89_988);
        assert_eq!(c.round_months(56), 588);
        for seg in c.segments() {
            let m = c.round_start_month(seg.first_round).unwrap();
            assert_eq!(c.date(m), (seg.from, 1));
        }
    }

    #[test]
    fn dates_have_no_year_zero() {
        let c = CalendarId::Standard;
        assert_eq!(c.date(0), (-5000, 1));
        assert_eq!(year_label(c.date(0).0), "5000 BC");
        // the last month of 1 BC and the first of AD 1
        let ad1 = c.round_start_month(111).unwrap();
        assert_eq!(c.date(ad1 - 1), (-1, 12));
        assert_eq!(c.date(ad1), (1, 1));
        assert_eq!(year_label(1), "AD 1");
        assert_eq!(year_label(-1), "1 BC");
        // inside round 111, which is 24 years long
        assert_eq!(c.date(ad1 + 12 * 23 + 11), (24, 12));
        assert_eq!(c.date(c.round_start_month(112).unwrap()), (25, 1));
        assert_eq!(historical(0), -1);
        assert_eq!(astronomical(-1), 0);
        assert_eq!(astronomical(historical(-4999)), -4999);
        assert_eq!(c.date(c.horizon()), (2500, 1));
        assert_eq!(c.round_at(0), 1);
        assert_eq!(c.round_at(599), 1);
        assert_eq!(c.round_at(600), 2);
        assert_eq!(c.round_at(ad1), 111);
    }

    #[test]
    fn reward_counts_from_ad_1900() {
        let c = CalendarId::Standard;
        let at = |year: i32| ((astronomical(year) - START_ASTRO_YEAR) * 12) as u32;
        assert!((winner_reward(&c, at(2280)) - 1.3667).abs() < 0.001);
        assert!((winner_reward(&c, at(2150)) - 1.5833).abs() < 0.001);
        assert_eq!(winner_reward(&c, at(1500)), 2.0);
        assert_eq!(winner_reward(&c, c.horizon()), 1.0);
        let f = CalendarId::Fixture { months_per_round: 12, start_astro_year: START_ASTRO_YEAR, rounds: 240 };
        assert!((winner_reward(&f, 96) - (2.0 - 96.0 / 2880.0)).abs() < 1e-12);
    }
}
