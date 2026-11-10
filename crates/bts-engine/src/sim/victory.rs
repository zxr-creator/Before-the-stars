//! Complete victory: G96 AND F24 AND Trials96, checked every month-end.
//!
//! Conquest never waives jump capability and jump capability never waives real
//! governance of every inhabited region. A broken window clears only its own
//! consecutive counter.

use crate::content::{content, Cap};
use crate::sim::chronicle::{brief, moment, reported};
use crate::state::*;
use bts_protocol::*;

fn check(label: &str, ok: bool, detail: String) -> Check {
    Check { label: label.to_string(), detail, ok }
}

pub fn governance_checks(w: &World, seat: SeatId) -> Vec<Check> {
    let civ = &w.civs[seat as usize];
    let mut out = Vec::new();
    let inhabited: Vec<usize> = (0..w.regions.len()).filter(|i| w.regions[*i].population() > 0).collect();
    let outside = inhabited.iter().filter(|i| w.authority(**i) != Some(seat)).count();
    out.push(check(
        "Highest authority over every inhabited region",
        outside == 0 && civ.overlord.is_none(),
        if outside == 0 { format!("All {} inhabited regions answer to this government", inhabited.len()) } else { format!("{outside} of {} inhabited regions answer to another authority", inhabited.len()) },
    ));
    let contested = inhabited.iter().filter(|i| {
        let r = &w.regions[**i];
        r.capture.is_some() || r.controller != r.owner
    }).count();
    let wars = w.civs.iter().filter(|c| c.status != SeatStatus::Eliminated && w.top_authority(c.seat) == seat).any(|c| c.contacts.iter().any(|x| x.at_war));
    out.push(check(
        "No region occupied or contested",
        contested == 0 && !wars,
        if contested == 0 && !wars { "Control is settled everywhere".into() } else { format!("{contested} regions are occupied or contested{}", if wars { "; a war is in progress" } else { "" }) },
    ));
    let mut food_bad = 0;
    let mut water_bad = 0;
    let slot = (w.month % 12) as usize;
    for &i in &inhabited {
        let r = &w.regions[i];
        if Region::avg_bp(&r.food_hist) < 9500 || r.food_hist[slot] < 8000 {
            food_bad += 1;
        }
        if Region::avg_bp(&r.water_hist) < 9500 || r.water_hist[slot] < 8000 {
            water_bad += 1;
        }
    }
    out.push(check("Food access at least 95% over twelve months in every region", food_bad == 0, if food_bad == 0 { "No region falls short".into() } else { format!("{food_bad} regions fall short") }));
    out.push(check("Safe water at least 95% over twelve months in every region", water_bad == 0, if water_bad == 0 { "No region falls short".into() } else { format!("{water_bad} regions fall short") }));
    let form = ["C061", "C062", "C063"].iter().any(|id| civ.est_id(id));
    out.push(check("A governing form able to hold global authority is established", form, if form { "Established".into() } else { "None of the three global governing forms is established".into() }));
    out.push(check("Public order holds", civ.stability >= 35, format!("Stability {}", civ.stability)));
    out
}

pub fn ftl_checks(w: &World, seat: SeatId) -> Vec<Check> {
    let c = content();
    let civ = &w.civs[seat as usize];
    let mut out = Vec::new();
    out.push(check("Fleet-wide jump engineering standards understood", civ.knows_id("T167"), if civ.knows_id("T167") { "Understood".into() } else { "Not yet understood".into() }));
    let live: Vec<&Assembly> = civ.ftl.assemblies.iter().filter(|a| !a.retired).collect();
    let mut series = false;
    for a in &live {
        for b in &live {
            if a.yard_region != b.yard_region && a.built.abs_diff(b.built) <= 24 {
                series = true;
            }
        }
    }
    out.push(check("Two operational assemblies from two independent lines", live.len() >= 2 && series, format!("{} operational; series manufacture {}", live.len(), if series { "verified" } else { "not verified" })));
    let yard = c.f("jump_yard");
    let base = c.f("jump_base");
    let oyard = c.f("orbital_yard");
    let running = |kind: usize, r: &Region| r.fac(kind).map(|f| f.level > 0 && f.run.as_ref().map(|x| x.rate_bp >= 5000).unwrap_or(false)).unwrap_or(false);
    let yards = w.regions.iter().filter(|r| r.controller == Some(seat) && r.fac(yard).map(|f| f.level > 0 && f.staffed * 2 >= f.staff_needed.max(1)).unwrap_or(false)).count();
    out.push(check("Both assembly lines staffed", yards >= 2, format!("{yards} of 2 lines staffed")));
    let nodes = w.test_nodes.iter().filter(|n| {
        let r = &w.regions[**n as usize];
        w.authority(**n as usize) == Some(seat) && running(base, r)
    }).count();
    out.push(check("Three deployment nodes operating", nodes >= 3, format!("{nodes} of 3 nodes operating")));
    out.push(check("Three-node deployment exercise completed", civ.ftl.deployment_done.is_some(), civ.ftl.deployment_done.map(|m| format!("Completed in month {m}")).unwrap_or_else(|| "Not yet held".into())));
    out.push(check("Assembly replacement and crew relief verified", civ.ftl.replacement_done.is_some(), civ.ftl.replacement_done.map(|m| format!("Verified in month {m}")).unwrap_or_else(|| "Not yet verified".into())));
    let quals = |q: Qual| -> u32 { w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.quals[q.index()]).sum() };
    let (eng, orb) = (quals(Qual::FtlEngineer), quals(Qual::Orbital));
    out.push(check("Qualified jump engineers and orbital crews, with reliefs", eng >= 36 && orb >= 36, format!("{eng} jump engineers (36 needed), {orb} orbital crew (36 needed)")));
    let (spares, fuel) = (civ.stock_of(Good::Spares), civ.stock_of(Good::Fuel));
    out.push(check("Twelve months of maintenance stock on hand", spares >= 240_000 && fuel >= 200_000, format!("{} spares (240 needed), {} fuel (200 needed)", spares / 1000, fuel / 1000)));
    let support = w.regions.iter().any(|r| r.controller == Some(seat) && running(oyard, r));
    out.push(check("Orbital yard supporting the fleet", support, if support { "Operating".into() } else { "Not operating".into() }));
    out.push(check("Common mission charter across sites established", civ.est_id("C064"), if civ.est_id("C064") { "Established".into() } else { "Not established".into() }));
    out
}

pub fn valid_trials(w: &World, seat: SeatId) -> Vec<Month> {
    let month = w.month;
    w.civs[seat as usize].ftl.trials.iter().filter(|(m, _)| month.saturating_sub(*m) < TRIAL_WINDOW).map(|(m, _)| *m).collect()
}

pub fn trials_ok(w: &World, seat: SeatId) -> bool {
    let month = w.month;
    let t: Vec<&(Month, u32)> = w.civs[seat as usize].ftl.trials.iter().filter(|(m, _)| month.saturating_sub(*m) < TRIAL_WINDOW).collect();
    for a in &t {
        for b in &t {
            if a.1 != b.1 && a.0.abs_diff(b.0) >= TRIAL_SPACING {
                return true;
            }
        }
    }
    false
}

pub fn complete_trial(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    let month = w.month;
    let capital = w.civs[si].capital;
    let last = w.civs[si].ftl.trials.last().map(|t| t.1);
    let oyard = c.f("orbital_yard");
    let support = w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(oyard).map(|f| f.level > 0 && f.operated).unwrap_or(false));
    let pick = w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).map(|a| a.id).find(|id| Some(*id) != last).or_else(|| w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).map(|a| a.id).next());
    let Some(assembly) = pick else {
        brief(w, seat, "warning", "Jump trial cancelled".into(), "No operational jump assembly was available. Propellant and stores prepared for the trial were consumed.".into(), None, "objectives");
        return;
    };
    if !support {
        brief(w, seat, "warning", "Jump trial cancelled".into(), "No orbital yard was operating to support the flight.".into(), None, "objectives");
        return;
    }
    let governing = w.civs[si].ftl.gov_streak > 0;
    if governing {
        w.civs[si].ftl.trials.push((month, assembly));
    }
    let n = w.civs[si].ftl.trials.len();
    let name = w.civs[si].name.clone();
    moment(w, seat, MomentCategory::Endgame, format!("Loaded jump round trip, month {month}"),
        if governing {
            format!("An assembly of {name} carried a standard load out and back under fleet control. It is qualifying trial {n} of the current window.")
        } else {
            format!("An assembly of {name} carried a standard load out and back. It is a technical success; because it did not occur under effective global governance it does not count toward acceptance.")
        },
        Some(capital), "jump", true, vec![format!("Assembly #{assembly} returned in month {month}")]);
    if !w.civs[si].milestones.flags.iter().any(|f| f == "first_trial") {
        w.civs[si].milestones.flags.push("first_trial".into());
    }
    // everybody in contact hears that something left and came back
    for o in 0..w.civs.len() {
        if o != si && w.civs[o].contacts[si].met && w.civs[o].status != SeatStatus::Eliminated {
            reported(w, o as SeatId, MomentCategory::Endgame, format!("{name} reports a jump flight"), format!("{name} announced a loaded faster-than-light round trip. The claim has not been independently verified."), None, "jump", vec![format!("Announced in month {month}")]);
        }
    }
}

pub fn complete_deployment(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    let month = w.month;
    let base = c.f("jump_base");
    let nodes = w.test_nodes.iter().filter(|n| {
        let r = &w.regions[**n as usize];
        w.authority(**n as usize) == Some(seat) && r.fac(base).map(|f| f.level > 0 && f.operated && r.cap(Cap::FtlBase) > 0).unwrap_or(false)
    }).count();
    let live = w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).count();
    if nodes >= 3 && live >= 1 {
        w.civs[si].ftl.deployment_done = Some(month);
        let capital = w.civs[si].capital;
        moment(w, seat, MomentCategory::Endgame, "Three-node deployment exercise".into(), "Transport, maintenance and recovery were demonstrated at all three test nodes within the exercise window.".into(), Some(capital), "jump", true, vec![format!("Exercise closed in month {month}")]);
    } else {
        brief(w, seat, "warning", "Deployment exercise failed".into(), format!("{nodes} of 3 nodes were operating and {live} assemblies were available."), None, "objectives");
    }
}

pub fn complete_replacement(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    let month = w.month;
    let live: Vec<usize> = (0..w.civs[si].ftl.assemblies.len()).filter(|i| !w.civs[si].ftl.assemblies[*i].retired).collect();
    if live.len() >= 3 {
        let oldest = *live.iter().min_by_key(|i| w.civs[si].ftl.assemblies[**i].built).unwrap();
        w.civs[si].ftl.assemblies[oldest].retired = true;
        w.civs[si].ftl.replacement_done = Some(month);
        let capital = w.civs[si].capital;
        moment(w, seat, MomentCategory::Endgame, "Replacement and crew relief".into(), "A worn assembly was withdrawn, a new one took its place, and a relief crew took over operations without interruption.".into(), Some(capital), "jump", false, vec![format!("Hand-over verified in month {month}")]);
    } else {
        brief(w, seat, "warning", "Replacement could not be verified".into(), "A third assembly is needed so one can be withdrawn while two remain operational.".into(), None, "objectives");
    }
}

pub fn step(w: &mut World) {
    if w.outcome.is_some() {
        return;
    }
    let month = w.month;
    let mut winner: Option<SeatId> = None;
    for s in 0..w.civs.len() {
        let seat = s as SeatId;
        if w.civs[s].status == SeatStatus::Eliminated {
            continue;
        }
        let g = governance_checks(w, seat);
        let f = ftl_checks(w, seat);
        let g_ok = g.iter().all(|c| c.ok);
        let f_ok = f.iter().all(|c| c.ok);
        let was_g = w.civs[s].ftl.gov_streak;
        let was_f = w.civs[s].ftl.ftl_streak;
        {
            let ftl = &mut w.civs[s].ftl;
            ftl.gov_streak = if g_ok { ftl.gov_streak + 1 } else { 0 };
            ftl.ftl_streak = if f_ok { ftl.ftl_streak + 1 } else { 0 };
            ftl.gov_checks = g;
            ftl.ftl_checks = f;
            if f_ok && ftl.first_capability.is_none() {
                ftl.first_capability = Some(month);
            }
            if g_ok && ftl.integration_month.is_none() {
                ftl.integration_month = Some(month);
            }
        }
        let capital = w.civs[s].capital;
        if g_ok && was_g == 0 {
            let name = w.civs[s].name.clone();
            moment(w, seat, MomentCategory::Governance, "Global integration begins".into(), format!("Every inhabited region now answers to {name}, and food, water and order hold everywhere. The count of continuous governance months starts now."), Some(capital), "globe", true, vec![format!("All governance conditions first met in month {month}")]);
        }
        if !g_ok && was_g >= 6 {
            brief(w, seat, "danger", "Global governance was interrupted".into(), format!("After {was_g} months the continuous count has returned to zero. See the objectives panel for the failed condition."), None, "objectives");
        }
        if !f_ok && was_f >= 3 {
            brief(w, seat, "danger", "Fleet-wide jump capability lapsed".into(), format!("After {was_f} months the continuous count has returned to zero."), None, "objectives");
        }
        let eligible = w.civs[s].status == SeatStatus::Active && w.civs[s].overlord.is_none();
        if eligible && w.civs[s].ftl.gov_streak >= GOVERNANCE_MONTHS && w.civs[s].ftl.ftl_streak >= FTL_MONTHS && trials_ok(w, seat) && winner.is_none() {
            winner = Some(seat);
        }
    }
    if let Some(seat) = winner {
        let name = w.civs[seat as usize].name.clone();
        w.outcome = Some(Outcome { month, winner: Some(seat), reason: format!("{name} completed 96 months of global governance, 24 months of fleet-wide jump capability and two qualifying trials") });
        w.phase = Phase::Finished;
        let capital = w.civs[seat as usize].capital;
        moment(w, seat, MomentCategory::Endgame, "Before the stars".into(), format!("In month {month}, {name} met every condition: one government for the inhabited world, and a jump-capable service it can build, crew, supply and replace."), Some(capital), "victory", true, vec![format!("Complete victory settled in month {month}")]);
        return;
    }
    if !w.civs.iter().any(|c| c.status == SeatStatus::Active) {
        w.outcome = Some(Outcome { month, winner: None, reason: "No original seat remains eligible".into() });
        w.phase = Phase::Finished;
        return;
    }
    if month >= w.cfg.horizon {
        w.outcome = Some(Outcome { month, winner: None, reason: "The horizon was reached without a complete victory".into() });
        w.phase = Phase::Finished;
    }
}

pub fn reward(w: &World, seat: SeatId) -> f64 {
    match &w.outcome {
        Some(o) if o.winner == Some(seat) => 2.0 - o.month as f64 / w.cfg.horizon as f64,
        _ => -1.0,
    }
}
