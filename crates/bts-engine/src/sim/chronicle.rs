//! Historic Moments and round briefings.
//!
//! Entries are written per seat from facts that seat has actually observed.
//! They grant nothing: no score, currency or bonus is attached to a card.

use crate::state::*;
use bts_protocol::*;

#[allow(clippy::too_many_arguments)]
pub fn moment(
    w: &mut World,
    seat: SeatId,
    category: MomentCategory,
    title: String,
    text: String,
    region: Option<RegionId>,
    art: &str,
    major: bool,
    evidence: Vec<String>,
) {
    let id = w.id();
    let month = w.month;
    let civ = &mut w.civs[seat as usize];
    // Repetition suppression: the same title is one process, not many moments.
    if civ.chronicle.iter().rev().take(40).any(|e| e.title == title) {
        return;
    }
    civ.chronicle.push(ChronicleEntry {
        id,
        month,
        end_month: None,
        category,
        title,
        text,
        region,
        epistemic: Epistemic::Verified,
        evidence,
        art: format!("{art}:{}", id % 7),
        major,
    });
}

/// A moment recorded from a report about someone else; shown as reported, not verified.
pub fn reported(w: &mut World, seat: SeatId, category: MomentCategory, title: String, text: String, region: Option<RegionId>, art: &str, evidence: Vec<String>) {
    let id = w.id();
    let month = w.month;
    let civ = &mut w.civs[seat as usize];
    if civ.chronicle.iter().rev().take(40).any(|e| e.title == title) {
        return;
    }
    civ.chronicle.push(ChronicleEntry {
        id,
        month,
        end_month: None,
        category,
        title,
        text,
        region,
        epistemic: Epistemic::Reported,
        evidence,
        art: format!("{art}:{}", id % 7),
        major: false,
    });
}

pub fn brief(w: &mut World, seat: SeatId, severity: &str, title: String, detail: String, region: Option<RegionId>, panel: &str) {
    let civ = &mut w.civs[seat as usize];
    if civ.briefing.len() >= 60 || civ.briefing.iter().any(|b| b.title == title) {
        return;
    }
    civ.briefing.push(BriefingItem { severity: severity.to_string(), title, detail, region, panel: panel.to_string() });
}

pub fn year_label(month: Month) -> String {
    format!("Year {}", month / 12 + 1)
}

/// Process-level moments derived from sustained conditions.
pub fn monthly(w: &mut World) {
    let month = w.month;
    for s in 0..w.civs.len() {
        let seat = s as SeatId;
        if w.civs[s].status == SeatStatus::Eliminated {
            continue;
        }
        let pop = w.civ_population(seat);
        let (surplus, famine, name, capital) = {
            let c = &w.civs[s];
            (c.surplus_streak, c.famine_streak, c.name.clone(), c.capital)
        };
        if surplus == 24 && !w.civs[s].milestones.flags.iter().any(|f| f == "surplus") {
            w.civs[s].milestones.flags.push("surplus".into());
            moment(w, seat, MomentCategory::Subsistence, "A sustained food surplus".into(),
                format!("For two full years {name} has eaten well and kept more than six months of food in store. People can be spared from subsistence for craft, records and teaching."),
                Some(capital), "granary", true, vec![format!("Stores above six months since month {}", month - 24)]);
        }
        if famine == 4 {
            moment(w, seat, MomentCategory::Crisis, format!("Hunger in {}", year_label(month)),
                format!("Deliveries have fallen short of need for four months. Health and work are suffering across {name}."),
                Some(capital), "famine", true, vec![format!("Food access below 80% since month {}", month - 4)]);
            brief(w, seat, "danger", "Hunger is spreading".into(), "Food access has been below 80% for four months. Free labour for food, open new land or reduce other commitments.".into(), Some(capital), "economy");
        }
        for (threshold, label) in [(1_000_000u32, "a million"), (5_000_000, "five million"), (20_000_000, "twenty million"), (100_000_000, "a hundred million")] {
            let flag = format!("pop{threshold}");
            if pop >= threshold && !w.civs[s].milestones.flags.contains(&flag) {
                w.civs[s].milestones.flags.push(flag);
                moment(w, seat, MomentCategory::Settlement, format!("{name} numbers {label}"),
                    format!("Counts across every governed region now exceed {label} people. More hands, and more mouths, housing and care to answer for."),
                    Some(capital), "town", threshold >= 5_000_000, vec![format!("Counted population {} in month {month}", crate::util::group(pop as i64))]);
            }
        }
    }
}
