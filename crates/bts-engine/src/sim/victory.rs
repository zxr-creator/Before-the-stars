//! Complete victory: G96 AND F24 AND Trials96, checked every month-end.
//!
//! Conquest never waives jump capability and jump capability never waives real
//! governance of every inhabited region. A broken window clears only its own
//! consecutive counter.

use crate::content::{content, Cap};
use crate::sim::chronicle::{brief, moment, reported};
use crate::state::*;
use bts_protocol::*;

/// The installations of an independent jump programme (design chapter 35, slice E).
pub const PROGRAMME_WORKS: [&str; 7] = ["high_energy", "launch_complex", "orbital_station", "orbital_yard", "jump_testbed", "jump_yard", "jump_base"];

/// Base checks of the jump programme: frontier researcher-months a month (check 9),
/// holders per post with reliefs (7, as a ratio 3/2), course places per post (8, 1/20),
/// months a past cohort still counts (8), a year of hardware with margin (10, 6/5),
/// months of stores (11), transport grade and share of electric demand at the sites (12).
pub const FRONTIER_NEED: i64 = 30_000;
pub const CREW_RELIEF: (u32, u32) = (3, 2);
pub const PLACES_PER_POST: (u32, u32) = (1, 20);
pub const COHORT_MONTHS: Month = 60;
pub const HARDWARE_MARGIN: (i64, i64) = (6, 5);
pub const STORE_MONTHS: i64 = 12;
pub const SITE_TRANSPORT: u8 = 2;
pub const SITE_POWER_BP: i64 = 9000;
/// The goods of the industrial base (check 10; ruleset 3.0 adds magnets and lattice).
pub const HARDWARE_GOODS: [Good; 7] = [Good::Components, Good::Electronics, Good::Hardware, Good::Conductors, Good::Metal, Good::Magnets, Good::Lattice];

fn check(label: &str, ok: bool, detail: String) -> Check {
    Check { label: label.to_string(), detail, ok, category: String::new() }
}

fn base_check(category: &str, label: &str, ok: bool, detail: String) -> Check {
    Check { label: label.to_string(), detail, ok, category: category.to_string() }
}

/// The levels of each programme installation the seat's base is measured against:
/// what it has installed, and never less than an independent programme needs - two
/// assembly lines, three deployment nodes, and a launch complex, an orbital station
/// with its yard and a high-energy laboratory unless a partner serves it with that
/// installation under a joint programme. With the factor (basis points) by which
/// serving partners raises an installation's inputs, upkeep and electric draw.
/// Returns `(facility kind, levels, load)`; no population figure enters it.
pub fn programme_levels(w: &World, seat: SeatId) -> Vec<(usize, i64, i64)> {
    let c = content();
    PROGRAMME_WORKS
        .iter()
        .map(|key| {
            let kind = c.f(key);
            let installed: i64 = w.regions.iter().filter(|r| r.controller == Some(seat)).filter_map(|r| r.fac(kind)).filter(|f| f.enabled).map(|f| f.level as i64).sum();
            let served = |s: ProgrammeService| w.programme_access(seat, s);
            let floor = match *key {
                "jump_yard" => 2,
                "jump_base" => 3,
                "launch_complex" => (!served(ProgrammeService::Launch)) as i64,
                "orbital_station" | "orbital_yard" => (!served(ProgrammeService::OrbitalYard)) as i64,
                "high_energy" => (!served(ProgrammeService::HighEnergy)) as i64,
                _ => 0,
            };
            let load = service_of_facility(key)
                .map(|s| crate::sim::eras::hosting_load(w, seat, s))
                .unwrap_or(10_000);
            (kind, installed.max(floor), load)
        })
        .collect()
}

/// What the programme installations take of a good in a month at full rate, inputs
/// and upkeep, for the installations whose keys are listed.
fn programme_use(levels: &[(usize, i64, i64)], keys: &[&str], g: Good) -> i64 {
    let c = content();
    levels
        .iter()
        .filter(|(k, _, _)| keys.contains(&c.facilities[*k].key))
        .map(|(k, lv, load)| {
            let def = &c.facilities[*k];
            let per: i64 = def.recipes.first().map(|r| r.inputs.iter().filter(|(x, _)| *x == g).map(|(_, a)| *a).sum()).unwrap_or(0) + def.upkeep.iter().filter(|(x, _)| *x == g).map(|(_, a)| *a).sum::<i64>();
            per * lv * load / 10_000
        })
        .sum()
}

/// Deliveries of a good still contracted to the seat over the coming year under
/// active treaties.
pub fn contracted_imports(w: &World, seat: SeatId, g: Good) -> i64 {
    w.treaties
        .iter()
        .filter(|t| t.status == "active" && t.parties.contains(&seat))
        .flat_map(|t| t.clauses.iter().zip(t.remaining.iter()))
        .map(|(c, rem)| match c {
            Clause::Goods { from, good, amount_per_month, .. } if *from != seat && *good == g => amount_per_month * (*rem).min(12) as i64,
            _ => 0,
        })
        .sum()
}

/// Whether the seat has an active secondment that lends it holders of `q`.
pub fn seconded_to(w: &World, seat: SeatId, q: Qual) -> bool {
    w.treaties.iter().filter(|t| t.status == "active").flat_map(|t| t.secondments.iter()).any(|s| s.borrower == seat && s.qual == q && s.owed > 0 && w.month < s.due)
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
    // inhabited off-world sites count as regions (design chapter 37, 6.9): they must
    // answer to this government and keep their people housed, fed, watered and powered
    let sites = crate::sim::space::inhabited_sites(w);
    let top = |o: Option<SeatId>| o.map(|s| w.top_authority(s));
    let sites_outside = sites.iter().filter(|x| top(x.1) != Some(seat)).count();
    let sites_bad = sites.iter().filter(|x| !x.2).count();
    if !sites.is_empty() {
        out.push(check(
            "Highest authority over every inhabited off-world site",
            sites_outside == 0,
            if sites_outside == 0 { format!("All {} inhabited sites answer to this government", sites.len()) } else { format!("{sites_outside} of {} inhabited sites answer to another authority", sites.len()) },
        ));
    }
    let (food_bad, water_bad) = (food_bad + sites_bad, water_bad + sites_bad);
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
    let g = |n: i64| crate::util::group(n);
    let k = |n: i64| crate::util::group(n / 1000);
    // an installation is named only to a seat that has discovered it
    let name = |key: &str| -> String {
        let kind = c.f(key);
        if crate::actions::facility_visible(w, seat, kind) { c.facilities[kind].name.to_lowercase() } else { "programme installation".into() }
    };
    out.push(base_check("scientific", "Fleet-wide jump engineering standards understood", civ.knows_id("T167"), if civ.knows_id("T167") { "Understood".into() } else { "Not yet understood".into() }));
    let live: Vec<&Assembly> = civ.ftl.assemblies.iter().filter(|a| !a.retired).collect();
    // series manufacture is a fact of the record: two lines that each delivered an
    // assembly within 24 months of the other, whether or not both are still in service
    let mut series = false;
    for a in &civ.ftl.assemblies {
        for b in &civ.ftl.assemblies {
            if a.yard_region != b.yard_region && a.built.abs_diff(b.built) <= 24 {
                series = true;
            }
        }
    }
    out.push(base_check("industrial", "Two operational assemblies from two independent lines", live.len() >= 2 && series, format!("{} operational; series manufacture {}", live.len(), if series { "verified" } else { "not verified" })));
    let yard = c.f("jump_yard");
    let base = c.f("jump_base");
    let running = |kind: usize, r: &Region| r.fac(kind).map(|f| f.level > 0 && f.run.as_ref().map(|x| x.rate_bp >= 5000).unwrap_or(false)).unwrap_or(false);
    let own_running = |key: &str| -> bool {
        let kind = c.f(key);
        w.regions.iter().any(|r| r.controller == Some(seat) && running(kind, r))
    };
    let yards = w.regions.iter().filter(|r| r.controller == Some(seat) && r.fac(yard).map(|f| f.level > 0 && f.staffed * 2 >= f.staff_needed.max(1)).unwrap_or(false)).count();
    out.push(base_check("industrial", "Both assembly lines staffed", yards >= 2, format!("{yards} of 2 lines staffed")));
    let nodes = w.test_nodes.iter().filter(|n| {
        let r = &w.regions[**n as usize];
        w.authority(**n as usize) == Some(seat) && running(base, r)
    }).count();
    out.push(base_check("logistical", "Three deployment nodes operating", nodes >= 3, format!("{nodes} of 3 nodes operating")));
    out.push(base_check("service", "Three-node deployment exercise completed", civ.ftl.deployment_done.is_some(), civ.ftl.deployment_done.map(|m| format!("Completed in {}", crate::util::event_label(&w.cfg, m))).unwrap_or_else(|| "Not yet held".into())));
    out.push(base_check("service", "Assembly replacement and crew relief verified", civ.ftl.replacement_done.is_some(), civ.ftl.replacement_done.map(|m| format!("Verified in {}", crate::util::event_label(&w.cfg, m))).unwrap_or_else(|| "Not yet verified".into())));

    let levels = programme_levels(w, seat);
    // ---- 7. educational base, headcount: every post filled with reliefs --------------
    let posts = |q: Qual| -> u32 {
        levels.iter().map(|(kind, lv, _)| c.facilities[*kind].skilled.iter().filter(|(qs, _)| qs.iter().all(|x| *x == q)).map(|(_, n)| *n as i64 * lv).sum::<i64>()).sum::<i64>() as u32
    };
    let holders = |q: Qual| -> u32 { w.regions.iter().filter(|r| r.controller == Some(seat)).map(|r| r.quals[q.index()]).sum() };
    let (eng, orb) = (holders(Qual::FtlEngineer), holders(Qual::Orbital));
    let (eng_posts, orb_posts) = (posts(Qual::FtlEngineer), posts(Qual::Orbital));
    let (rn, rd) = CREW_RELIEF;
    let enough = |have: u32, need: u32| have as u64 * rd as u64 >= need as u64 * rn as u64;
    out.push(base_check(
        "educational",
        "Educational base: qualified crews for every post, with reliefs",
        enough(eng, eng_posts) && enough(orb, orb_posts),
        format!(
            "{} jump engineers for {} posts ({} needed); {} orbital crew for {} posts ({} needed); seconded experts resident here count",
            g(eng as i64), g(eng_posts as i64), g((eng_posts as u64 * rn as u64).div_ceil(rd as u64) as i64),
            g(orb as i64), g(orb_posts as i64), g((orb_posts as u64 * rn as u64).div_ceil(rd as u64) as i64)
        ),
    ));
    // ---- 8. educational base, replacement: courses, or experts on loan ---------------
    let mut parts = Vec::new();
    let mut replaced = true;
    for (q, need_posts) in [(Qual::FtlEngineer, eng_posts), (Qual::Orbital, orb_posts)] {
        let places: u32 = civ
            .programs
            .iter()
            .filter(|p| {
                let course = &c.courses[p.course];
                let r = &w.regions[p.region as usize];
                course.output == q && r.controller == Some(seat) && r.cap(course.venue) > 0 && (p.enrolled > 0 || (p.last_grad > 0 && w.month.saturating_sub(p.last_grad) < COHORT_MONTHS))
            })
            .map(|p| p.seats)
            .sum();
        let need = (need_posts as u64 * PLACES_PER_POST.0 as u64).div_ceil(PLACES_PER_POST.1 as u64) as u32;
        let loan = seconded_to(w, seat, q);
        let ok = places >= need || loan;
        replaced &= ok;
        parts.push(format!("{}: {} places in running courses ({} needed){}", q.label().to_lowercase(), g(places as i64), g(need as i64), if loan { ", experts on loan" } else { "" }));
    }
    out.push(base_check("educational", "Educational base: training that replaces the crews", replaced, parts.join("; ")));
    // ---- 9. scientific base ---------------------------------------------------------
    let frontier = civ.research_cap.get(ResearchClass::Frontier.index()).copied().unwrap_or(0);
    let lab_own = own_running("high_energy");
    let lab_shared = w.programme_access(seat, ProgrammeService::HighEnergy);
    out.push(base_check(
        "scientific",
        "Scientific base: frontier research capacity",
        frontier >= FRONTIER_NEED && (lab_own || lab_shared),
        format!(
            "{} researcher-months of frontier research a month ({} needed); {} {}",
            g(frontier), g(FRONTIER_NEED), name("high_energy"),
            if lab_own { "operating" } else if lab_shared { "served by a partner" } else { "not operating" }
        ),
    ));
    // ---- 10. industrial base --------------------------------------------------------
    let hardware_keys = ["jump_yard", "jump_base", "launch_complex", "orbital_yard"];
    let mut short = Vec::new();
    let mut lines = Vec::new();
    for good in HARDWARE_GOODS {
        let need = programme_use(&levels, &hardware_keys, good) * 12 * HARDWARE_MARGIN.0 / HARDWARE_MARGIN.1;
        let made = w.per_last_round(civ.last_flows.produced[good.index()] + civ.last_flows.withheld.get(good.index()).copied().unwrap_or(0), 12);
        let bought = contracted_imports(w, seat, good);
        if made + bought < need {
            short.push(format!("{}: {} made and {} contracted of {} needed", good.label().to_lowercase(), k(made), k(bought), k(need)));
        } else {
            lines.push(good.label().to_lowercase());
        }
    }
    out.push(base_check(
        "industrial",
        "Industrial base: a year of flight hardware from own output or contracts",
        short.is_empty(),
        if short.is_empty() { format!("Last year's output and contracted imports cover {} for a year with a fifth to spare", lines.join(", ")) } else { short.join("; ") },
    ));
    // ---- 11. logistical base, stores ------------------------------------------------
    let all: Vec<&str> = PROGRAMME_WORKS.to_vec();
    let spares_need = programme_use(&levels, &all, Good::Spares) * STORE_MONTHS;
    let fuel_need = programme_use(&levels, &all, Good::Fuel) * STORE_MONTHS;
    let (spares, fuel) = (civ.stock_of(Good::Spares), civ.stock_of(Good::Fuel));
    out.push(base_check(
        "logistical",
        "Logistical base: a year of fuel and spares in store",
        spares >= spares_need && fuel >= fuel_need,
        format!("{} spares ({} needed), {} fuel ({} needed)", k(spares), k(spares_need), k(fuel), k(fuel_need)),
    ));
    // ---- 12. logistical base, links and power at the sites ---------------------------
    let sites: Vec<&Region> = w.regions.iter().filter(|r| r.controller == Some(seat) && [yard, base].iter().any(|kind| r.fac(*kind).map(|f| f.level > 0).unwrap_or(false))).collect();
    let weak_links = sites.iter().filter(|r| crate::sim::economy::transport_level(r) < SITE_TRANSPORT).count();
    let dark = sites.iter().filter(|r| r.last.elec_supply * 10_000 < r.last.elec_demand * SITE_POWER_BP).count();
    out.push(base_check(
        "logistical",
        "Logistical base: freight links and electric supply at every programme site",
        !sites.is_empty() && weak_links == 0 && dark == 0,
        if sites.is_empty() { format!("No region holds a {} or a {}", name("jump_yard"), name("jump_base")) } else { format!("{} sites; {} below transport grade {}; {} received less than 90% of their electric demand", sites.len(), weak_links, SITE_TRANSPORT, dark) },
    ));
    // ---- 13. launch and recovery (design chapter 39, 4.6): a launch complex or later
    // stage that made boost or stood down at its cap in each of the last 12 months,
    // and a station in low Earth orbit with a shipyard module operating (own, or a
    // partner's under a joint programme)
    let streak = civ.space.streak;
    // a stage standing down at the boost cap is operating (its streak counts it so,
    // and so do the investigations that need a working launch complex)
    let lc = c.f("launch_complex");
    let standing = w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(lc).map(|f| f.level > 0 && f.run.as_ref().map(|x| x.blockers & 1024 != 0 && f.staffed * 2 >= f.staff_needed).unwrap_or(false)).unwrap_or(false));
    let launch = (streak >= 12 && (own_running("launch_complex") || standing), w.programme_access(seat, ProgrammeService::Launch));
    let oyard = (crate::sim::space::shipyard_operating(w, seat), w.programme_access(seat, ProgrammeService::OrbitalYard));
    let how = |x: (bool, bool)| if x.0 { "operating" } else if x.1 { "served by a partner" } else { "not operating" };
    out.push(base_check(
        "logistical",
        "Launch and recovery services operating",
        (launch.0 || launch.1) && (oyard.0 || oyard.1),
        format!(
            "{} {} (boost made or stood down at the cap {} of the last 12 months); a station in low Earth orbit with a shipyard module {}",
            name("launch_complex"),
            how(launch),
            streak.min(12),
            how(oyard)
        ),
    ));
    out.push(base_check("service", "Common mission charter across sites established", civ.est_id("C064"), if civ.est_id("C064") { "Established".into() } else { "Not established".into() }));
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
    let when = crate::util::event_label(&w.cfg, month);
    let capital = w.civs[si].capital;
    let last = w.civs[si].ftl.trials.last().map(|t| t.1);
    let oyard = c.f("orbital_yard");
    let support = w.regions.iter().any(|r| r.controller == Some(seat) && r.fac(oyard).map(|f| f.level > 0 && f.operated).unwrap_or(false)) || w.programme_access(seat, ProgrammeService::OrbitalYard);
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
    moment(w, seat, MomentCategory::Endgame, format!("Loaded jump round trip, {when}"),
        if governing {
            format!("An assembly of {name} carried a standard load out and back under fleet control. It is qualifying trial {n} of the current window.")
        } else {
            format!("An assembly of {name} carried a standard load out and back. It is a technical success; because it did not occur under effective global governance it does not count toward acceptance.")
        },
        Some(capital), "jump", true, vec![format!("Assembly #{assembly} returned in {when}")]);
    if !w.civs[si].milestones.flags.iter().any(|f| f == "first_trial") {
        w.civs[si].milestones.flags.push("first_trial".into());
    }
    // everybody in contact hears that something left and came back
    for o in 0..w.civs.len() {
        if o != si && w.civs[o].contacts[si].met && w.civs[o].status != SeatStatus::Eliminated {
            reported(w, o as SeatId, MomentCategory::Endgame, format!("{name} reports a jump flight"), format!("{name} announced a loaded faster-than-light round trip. The claim has not been independently verified."), None, "jump", vec![format!("Announced in {when}")]);
        }
    }
}

pub fn complete_deployment(w: &mut World, seat: SeatId) {
    let c = content();
    let si = seat as usize;
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let base = c.f("jump_base");
    let nodes = w.test_nodes.iter().filter(|n| {
        let r = &w.regions[**n as usize];
        w.authority(**n as usize) == Some(seat) && r.fac(base).map(|f| f.level > 0 && f.operated && r.cap(Cap::FtlBase) > 0).unwrap_or(false)
    }).count();
    let live = w.civs[si].ftl.assemblies.iter().filter(|a| !a.retired).count();
    if nodes >= 3 && live >= 1 {
        w.civs[si].ftl.deployment_done = Some(month);
        let capital = w.civs[si].capital;
        moment(w, seat, MomentCategory::Endgame, "Three-node deployment exercise".into(), "Transport, maintenance and recovery were demonstrated at all three test nodes within the exercise window.".into(), Some(capital), "jump", true, vec![format!("Exercise closed in {when}")]);
    } else {
        brief(w, seat, "warning", "Deployment exercise failed".into(), format!("{nodes} of 3 nodes were operating and {live} assemblies were available."), None, "objectives");
    }
}

pub fn complete_replacement(w: &mut World, seat: SeatId) {
    let si = seat as usize;
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let live: Vec<usize> = (0..w.civs[si].ftl.assemblies.len()).filter(|i| !w.civs[si].ftl.assemblies[*i].retired).collect();
    if live.len() >= 3 {
        let oldest = *live.iter().min_by_key(|i| w.civs[si].ftl.assemblies[**i].built).unwrap();
        w.civs[si].ftl.assemblies[oldest].retired = true;
        w.civs[si].ftl.replacement_done = Some(month);
        let capital = w.civs[si].capital;
        moment(w, seat, MomentCategory::Endgame, "Replacement and crew relief".into(), "A worn assembly was withdrawn, a new one took its place, and a relief crew took over operations without interruption.".into(), Some(capital), "jump", false, vec![format!("Hand-over verified in {when}")]);
    } else {
        brief(w, seat, "warning", "Replacement could not be verified".into(), "A third assembly is needed so one can be withdrawn while two remain operational.".into(), None, "objectives");
    }
}

pub fn step(w: &mut World) {
    if w.outcome.is_some() {
        return;
    }
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
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
            moment(w, seat, MomentCategory::Governance, "Global integration begins".into(), format!("Every inhabited region now answers to {name}, and food, water and order hold everywhere. The count of continuous governance months starts now."), Some(capital), "globe", true, vec![format!("All governance conditions first met in {when}")]);
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
        moment(w, seat, MomentCategory::Endgame, "Before the stars".into(), format!("In {when}, {name} met every condition: one government for the inhabited world, and a jump-capable service it can build, crew, supply and replace."), Some(capital), "victory", true, vec![format!("Complete victory settled in {when}")]);
        return;
    }
    if !w.civs.iter().any(|c| c.status == SeatStatus::Active) {
        w.outcome = Some(Outcome { month, winner: None, reason: "No original seat remains eligible".into() });
        w.phase = Phase::Finished;
        return;
    }
    if month >= w.cfg.horizon() {
        w.outcome = Some(Outcome { month, winner: None, reason: "The horizon was reached without a complete victory".into() });
        w.phase = Phase::Finished;
    }
}

pub fn reward(w: &World, seat: SeatId) -> f64 {
    match &w.outcome {
        Some(o) if o.winner == Some(seat) => crate::calendar::winner_reward(&w.cfg.calendar, o.month),
        _ => -1.0,
    }
}
