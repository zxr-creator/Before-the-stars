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
        recap: false,
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
        recap: false,
    });
}

/// The kind of a briefing line: the part of the title before a colon ("Completed:
/// Fields at Ashford" is of the kind "Completed"), or the whole title.
pub fn brief_kind(title: &str) -> &str {
    title.split_once(": ").map(|(k, _)| k).unwrap_or(title)
}

pub fn brief(w: &mut World, seat: SeatId, severity: &str, title: String, detail: String, region: Option<RegionId>, panel: &str) {
    let civ = &mut w.civs[seat as usize];
    if civ.briefing.iter().any(|b| b.title == title) {
        return;
    }
    // a long round brings many reports of one kind: the first is kept and the rest
    // are counted ("Completed: Fields at Ashford (and 13 more)")
    let kind = brief_kind(&title);
    if kind != title && civ.briefing.iter().any(|b| b.panel == panel && brief_kind(&b.title) == kind) {
        tally_civ(civ, &format!("brief:{kind}"), 1);
        return;
    }
    if civ.briefing.len() >= 60 {
        return;
    }
    civ.briefing.push(BriefingItem { severity: severity.to_string(), title, detail, region, panel: panel.to_string() });
}

/// Count `n` more events of a kind this round (shown as one briefing line).
pub fn tally(w: &mut World, seat: SeatId, key: &str, n: u32) {
    tally_civ(&mut w.civs[seat as usize], key, n);
}

fn tally_civ(civ: &mut Civ, key: &str, n: u32) {
    match civ.tallies.iter_mut().find(|(k, _)| k == key) {
        Some((_, c)) => *c += n,
        None => civ.tallies.push((key.to_string(), n)),
    }
}

/// The briefing as a seat reads it: counted kinds carry their count.
pub fn briefing_view(civ: &Civ) -> Vec<BriefingItem> {
    let mut out: Vec<BriefingItem> = civ
        .briefing
        .iter()
        .map(|b| {
            let kind = brief_kind(&b.title);
            let more = civ.tallies.iter().find(|(k, _)| k.strip_prefix("brief:") == Some(kind)).map(|(_, n)| *n).unwrap_or(0);
            let mut b = b.clone();
            if more > 0 && kind != b.title {
                b.title = format!("{} (and {} more)", b.title, crate::util::group(more as i64));
            }
            b
        })
        .collect();
    if let Some((_, n)) = civ.tallies.iter().find(|(k, _)| k == "leads") {
        let n = *n;
        out.insert(0, BriefingItem { severity: "info".into(), title: format!("{} new lead{}", crate::util::group(n as i64), if n == 1 { "" } else { "s" }), detail: "Practitioners report problems that current methods do not explain. Follow them up from the frontier view.".into(), region: None, panel: "knowledge".into() });
    }
    out
}

/// Most chronicle entries kept per seat; era summaries are dropped last.
pub const CHRONICLE_MAX: usize = 2000;
/// Most moments of one round the round recap shows per seat (era summaries aside).
pub const RECAP_MAX: usize = 12;

fn significance(e: &ChronicleEntry) -> (bool, u8) {
    let rank = match e.category {
        MomentCategory::Endgame | MomentCategory::War | MomentCategory::Crisis => 0,
        MomentCategory::Governance | MomentCategory::Diplomacy | MomentCategory::Religion => 1,
        MomentCategory::Knowledge | MomentCategory::Space => 2,
        _ => 3,
    };
    (!e.major, rank)
}

/// Close a round's history: mark the moments the round recap shows, add the era
/// summary of the round (historical calendars only) and keep the archive bounded.
pub fn close_round(w: &mut World) {
    let start = w.round_start;
    let end = w.month;
    let historical = !matches!(w.cfg.calendar, crate::calendar::CalendarId::Fixture { .. });
    let (from, to) = (crate::util::year_label(&w.cfg, start), crate::util::year_label(&w.cfg, end.saturating_sub(1)));
    let c = crate::content::content();
    for s in 0..w.civs.len() {
        let seat = s as SeatId;
        {
            let civ = &mut w.civs[s];
            let mut this: Vec<usize> = (0..civ.chronicle.len()).filter(|i| civ.chronicle[*i].month > start).collect();
            this.sort_by_key(|i| (significance(&civ.chronicle[*i]), civ.chronicle[*i].month, *i));
            for (k, i) in this.into_iter().enumerate() {
                civ.chronicle[i].recap = k < RECAP_MAX;
            }
        }
        if historical && w.civs[s].status != SeatStatus::Eliminated {
            let pop0 = w.civs[s].round_start_pop;
            let pop1 = w.civ_population(seat) as u64;
            let civ = &w.civs[s];
            let mut techs: Vec<&str> = (0..c.techs.len()).filter(|t| civ.tech[*t].state >= ST_UNDERSTOOD && civ.tech[*t].und_month > start).map(|t| c.techs[t].name.as_str()).collect();
            let n_techs = techs.len();
            techs.truncate(3);
            let wars = civ.chronicle.iter().filter(|e| e.month > start && e.category == MomentCategory::War && e.title.starts_with("War against")).count();
            let faiths: Vec<String> = w.religions.iter().filter(|r| r.founded > start).map(|r| r.name.clone()).collect();
            let change = if pop0 > 0 { (pop1 as i128 - pop0 as i128) * 1000 / pop0 as i128 } else { 0 };
            let mut text = format!(
                "{} people at the end of the period, {} {}.{}% from {} at its start.",
                crate::util::group(pop1 as i64),
                if change >= 0 { "up" } else { "down" },
                change.abs() / 10,
                change.abs() % 10,
                crate::util::group(pop0 as i64)
            );
            if n_techs > 0 {
                text.push_str(&format!(" {} method{} understood: {}{}.", n_techs, if n_techs == 1 { "" } else { "s" }, techs.join(", "), if n_techs > 3 { ", and others" } else { "" }));
            }
            if wars > 0 {
                text.push_str(&format!(" {} war{} begun.", wars, if wars == 1 { "" } else { "s" }));
            }
            if !faiths.is_empty() {
                text.push_str(&format!(" Faiths founded in the world: {}.", faiths.join(", ")));
            }
            let id = w.id();
            let capital = w.civs[s].capital;
            w.civs[s].chronicle.push(ChronicleEntry {
                id,
                month: end,
                end_month: None,
                category: MomentCategory::Settlement,
                title: format!("From {from} to {to}"),
                text,
                region: Some(capital),
                epistemic: Epistemic::Verified,
                evidence: vec![format!("Round {} of {}", w.round, w.cfg.calendar.rounds())],
                art: format!("town:{}", id % 7),
                major: false,
                recap: true,
            });
        }
        let civ = &mut w.civs[s];
        if civ.chronicle.len() > CHRONICLE_MAX {
            // minor moments go first, then major ones; era summaries stay longest
            let summary = |e: &ChronicleEntry| e.title.starts_with("From ") && e.evidence.first().map(|x| x.starts_with("Round ")).unwrap_or(false);
            for pass in 0..3 {
                let mut over = civ.chronicle.len().saturating_sub(CHRONICLE_MAX);
                if over == 0 {
                    break;
                }
                civ.chronicle.retain(|e| {
                    let drop = over > 0 && match pass {
                        0 => !e.major && !summary(e),
                        1 => !summary(e),
                        _ => true,
                    };
                    if drop {
                        over -= 1;
                    }
                    !drop
                });
            }
        }
    }
}

pub fn year_label(w: &World, month: Month) -> String {
    crate::util::year_label(&w.cfg, month.saturating_sub(1))
}

/// Process-level moments derived from sustained conditions.
pub fn monthly(w: &mut World) {
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
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
                Some(capital), "granary", true, vec![format!("Stores above six months since {}", crate::util::event_label(&w.cfg, month - 24))]);
        }
        if famine == 4 {
            moment(w, seat, MomentCategory::Crisis, format!("Hunger in {}", year_label(w, month)),
                format!("Deliveries have fallen short of need for four months. Health and work are suffering across {name}."),
                Some(capital), "famine", true, vec![format!("Food access below 80% since {}", crate::util::event_label(&w.cfg, month - 4))]);
            brief(w, seat, "danger", "Hunger is spreading".into(), "Food access has been below 80% for four months. Free labour for food, open new land or reduce other commitments.".into(), Some(capital), "economy");
        }
        for (threshold, label) in [(1_000_000u32, "a million"), (5_000_000, "five million"), (20_000_000, "twenty million"), (100_000_000, "a hundred million")] {
            let flag = format!("pop{threshold}");
            if pop >= threshold && !w.civs[s].milestones.flags.contains(&flag) {
                w.civs[s].milestones.flags.push(flag);
                moment(w, seat, MomentCategory::Settlement, format!("{name} numbers {label}"),
                    format!("Counts across every governed region now exceed {label} people. More hands, and more mouths, housing and care to answer for."),
                    Some(capital), "town", threshold >= 5_000_000, vec![format!("Counted population {} in {when}", crate::util::group(pop as i64))]);
            }
        }
    }
}
