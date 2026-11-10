//! Seat-specific projection of the authoritative world.
//!
//! Permission filtering happens here, before anything is summarized or
//! serialized. Unknown technologies and practices do not appear at all: no
//! placeholders, counts or stable hidden IDs.

use crate::actions::{channel_open, course_visible, facility_visible, prac_handle, tech_handle, view_clause};
use crate::content::{content, Cap, Req, Site, Tag, BELIEFS, RELIGION_SLOTS, TRAIT_NAMES};
use crate::sim::{culture, economy, military, population, projects, victory};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

fn qty(v: &[(Good, i64)]) -> Vec<GoodQty> {
    v.iter().map(|(g, a)| GoodQty { good: *g, amount: *a }).collect()
}

/// Human-readable checklist for a requirement, revealing only what the seat already knows of.
fn req_items(w: &World, seat: SeatId, req: &Req, prac_enacted: bool) -> (Vec<KnownRequirement>, bool) {
    let mut out = Vec::new();
    let mut unknown = false;
    fn atom(w: &World, seat: SeatId, r: &Req, prac_enacted: bool) -> Option<(String, bool, Option<String>)> {
        let c = content();
        let civ = &w.civs[seat as usize];
        let ctx = CivCtx { world: w, seat };
        use crate::content::ReqCtx;
        match r {
            Req::True => None,
            Req::Tech(i) => {
                if civ.tech[*i].state >= ST_DISCOVERED {
                    Some((format!("Understand: {}", c.techs[*i].name), civ.knows(*i), Some(tech_handle(w, seat, *i))))
                } else {
                    None
                }
            }
            Req::Prac(i) => {
                if civ.practice[*i].state >= 1 {
                    let ok = if prac_enacted { civ.practice[*i].state >= 3 } else { civ.established(*i) };
                    Some((format!("{}: {}", if prac_enacted { "Enacted" } else { "Established" }, c.practices[*i].name), ok, Some(prac_handle(w, seat, *i))))
                } else {
                    None
                }
            }
            Req::Fac(i) => Some((format!("A working {}", c.facilities[*i].name.to_lowercase()), ctx.fac(*i), None)),
            Req::Pop(n) => Some((format!("Population of at least {n}"), ctx.pop() >= *n, None)),
            Req::Regions(n) => Some((format!("Govern at least {n} regions"), ctx.regions() >= *n, None)),
            Req::QualAtLeast(q, n) => Some((format!("At least {n} {}", q.label().to_lowercase()), ctx.qual(*q) >= *n, None)),
            Req::Contact => Some(("Contact with another people".into(), ctx.contact(), None)),
            Req::Religion => Some(("A local religious tradition".into(), ctx.religion(), None)),
            Req::SciMethod => Some(("The scientific method as a working institution".into(), ctx.sci_method(), None)),
            Req::All(_) | Req::Any(_) => None,
        }
    }
    for r in req.conjuncts() {
        match r {
            Req::Any(alts) => {
                let mut names = Vec::new();
                let mut ok = false;
                let mut handle = None;
                for a in alts {
                    match a {
                        Req::All(inner) => {
                            let parts: Vec<_> = inner.iter().filter_map(|x| atom(w, seat, x, prac_enacted)).collect();
                            if parts.len() == inner.len() {
                                ok |= parts.iter().all(|p| p.1);
                                names.push(parts.iter().map(|p| p.0.clone()).collect::<Vec<_>>().join(" and "));
                            }
                        }
                        other => {
                            if let Some((n, s, h)) = atom(w, seat, other, prac_enacted) {
                                ok |= s;
                                names.push(n);
                                if handle.is_none() {
                                    handle = h;
                                }
                            }
                        }
                    }
                }
                if names.is_empty() {
                    unknown = true;
                } else {
                    let single = names.len() == 1;
                    out.push(KnownRequirement { text: names.join(" — or — "), satisfied: ok, handle: if single { handle } else { None } });
                }
            }
            other => match atom(w, seat, other, prac_enacted) {
                Some((text, satisfied, handle)) => out.push(KnownRequirement { text, satisfied, handle }),
                None => {
                    if !matches!(other, Req::True) {
                        unknown = true;
                    }
                }
            },
        }
    }
    (out, unknown)
}

fn deposit_known(civ: &Civ, d: Deposit) -> bool {
    match d {
        Deposit::CopperOre | Deposit::IronOre | Deposit::Coal => civ.knows_id("T014"),
        Deposit::Crude => civ.knows_id("T064") || civ.knows_id("T090"),
        Deposit::Minerals => civ.knows_id("T043"),
    }
}

fn fuzz(w: &World, seat: SeatId, key: u64, value: u32, spread_pct: u64) -> (u32, u32) {
    if value == 0 {
        return (0, 0);
    }
    // deterministic per seat, subject and year: re-querying never sharpens an estimate
    let year = (w.month / 12) as u64;
    let shift = draw_range(w.secret, &[stream("estimate"), seat as u64, key, year], spread_pct + 1) as i64 - (spread_pct as i64 / 2);
    let mid = (value as i64 * (100 + shift) / 100).max(1);
    let lo = mid * (100 - spread_pct as i64 / 2) / 100;
    let hi = mid * (100 + spread_pct as i64 / 2) / 100;
    let round = |v: i64| -> u32 {
        let step = if v >= 10_000 { 500 } else if v >= 1000 { 100 } else if v >= 100 { 10 } else { 5 };
        ((v / step) * step).max(0) as u32
    };
    (round(lo), round(hi).max(round(lo) + 1))
}

fn blocker_text(run: &RunStat) -> Vec<String> {
    let mut out = Vec::new();
    let b = run.blockers;
    if b & 1 != 0 {
        out.push("Not enough workers".into());
    }
    if b & 2 != 0 {
        out.push("Qualified staff are missing".into());
    }
    if b & 4 != 0 {
        let names: Vec<String> = run.missing.iter().map(|g| g.label().to_lowercase()).collect();
        out.push(format!("Short of {}", names.join(", ")));
    }
    if b & 8 != 0 {
        out.push("Not enough shaft power".into());
    }
    if b & 16 != 0 {
        out.push("Not enough electricity".into());
    }
    if b & 32 != 0 {
        out.push("Not enough compute".into());
    }
    if b & 64 != 0 {
        out.push("Worn equipment: upkeep has been missed".into());
    }
    if b & 128 != 0 {
        out.push("Stores are full; output throttled".into());
    }
    if b & 256 != 0 {
        out.push("The deposit is nearly exhausted".into());
    }
    if b & 512 != 0 {
        out.push("Unrest is disrupting work".into());
    }
    out
}

fn site_text(s: Site) -> String {
    match s {
        Site::Any => "Anywhere".into(),
        Site::Arable => "Arable land (one level per plot)".into(),
        Site::Pasture => "Grazing land".into(),
        Site::Fishery => "Coast or river fishing grounds".into(),
        Site::Forest => "Woodland and stone".into(),
        Site::River => "A river or ample water".into(),
        Site::Coast => "A coast".into(),
        Site::Hydro => "A fall of water or steady wind".into(),
        Site::Deposit(d) => format!("A known deposit of {}", d.label().to_lowercase()),
        Site::TestNode => "One of the three test nodes".into(),
        Site::With(k) => format!("Beside a {}", content().facilities[content().f(k)].name.to_lowercase()),
    }
}

fn site_key(s: Site) -> String {
    match s {
        Site::Any => "any".into(),
        Site::Arable => "arable".into(),
        Site::Pasture => "pasture".into(),
        Site::Fishery => "fishery".into(),
        Site::Forest => "forest".into(),
        Site::River => "river".into(),
        Site::Coast => "coast".into(),
        Site::Hydro => "hydro".into(),
        Site::Deposit(d) => format!("deposit:{}", serde_json::to_value(d).ok().and_then(|v| v.as_str().map(|x| x.to_string())).unwrap_or_default()),
        Site::TestNode => "test_node".into(),
        Site::With(k) => format!("with:{k}"),
    }
}

fn cap_text(c: Cap, v: i64) -> String {
    let n = v / 1000;
    match c {
        Cap::Storage => format!("Stores {n} food"),
        Cap::Water => format!("Water and sanitation for {n} residents"),
        Cap::Health => format!("Care for {n} residents"),
        Cap::SeatsLodge => format!("{n} apprenticeship places"),
        Cap::SeatsSchool => format!("{n} school places"),
        Cap::SeatsCollege => format!("{n} college places"),
        Cap::SeatsInstitute => format!("{n} technical training places"),
        Cap::Admin => format!("Administers {n} more regions"),
        Cap::Irrigation => format!("Waters {n} levels of fields"),
        Cap::GenCap => format!("Converts up to {n} shaft power to electricity"),
        Cap::GridLink => "Joins the national grid".into(),
        Cap::Transport => format!("Transport grade {n}"),
        Cap::Port => "Opens sea links".into(),
        Cap::Barracks => format!("Trains {n} soldiers at a time"),
        Cap::FtlYard => "An independent jump assembly line".into(),
        Cap::FtlBase => "A jump deployment node".into(),
        Cap::Launch => "Launch capability".into(),
        Cap::OrbitalStation => "A crewed orbital station".into(),
        Cap::OrbitalYard => "Orbital construction".into(),
        Cap::Sacred => "A centre for a religious movement".into(),
    }
}

fn venue_key(c: Cap) -> (&'static str, &'static str) {
    match c {
        Cap::SeatsLodge => ("lodge", "Teaching lodge"),
        Cap::SeatsSchool => ("school", "School"),
        Cap::SeatsCollege => ("college", "College"),
        _ => ("tech_institute", "Technical institute"),
    }
}

fn own_region(w: &World, seat: SeatId, ri: usize, link: i64) -> OwnRegion {
    let c = content();
    let r = &w.regions[ri];
    let lin = |i: u16| w.lineages.get(i as usize).map(|l| l.name.clone()).unwrap_or_default();
    let mut facilities = Vec::new();
    for f in &r.facilities {
        let def = &c.facilities[f.kind];
        let mut runs = Vec::new();
        if let Some(run) = &f.run {
            let rec = &def.recipes[run.recipe];
            runs.push(RecipeRun { recipe: rec.key.to_string(), name: rec.name.to_string(), rate_bp: run.rate_bp, blockers: blocker_text(run), missing: run.missing.clone() });
        }
        let (staffed, needed) = if def.food {
            let per = def.general as u32 * f.level as u32;
            (per.min(r.last.labor.food), per)
        } else {
            (f.staffed, f.staff_needed)
        };
        facilities.push(FacilityView {
            kind: def.key.to_string(),
            name: def.name.to_string(),
            level: f.level,
            max_level: economy::level_cap(w, seat, ri, def),
            staffed,
            staff_needed: needed,
            condition_bp: f.condition_bp,
            utilization_bp: f.run.as_ref().map(|x| x.rate_bp).unwrap_or(if needed > 0 { (staffed as u64 * 10_000 / needed as u64) as u16 } else { 10_000 }),
            runs,
            enabled: f.enabled,
        });
    }
    let quals = Qual::ALL
        .iter()
        .filter(|q| r.quals[q.index()] > 0)
        .map(|q| QualCount { qual: *q, count: r.quals[q.index()], employed: r.last.qual_employed.get(q.index()).copied().unwrap_or(0) + r.teachers[q.index()] })
        .collect();
    let slot = (w.month % 12) as usize;
    OwnRegion {
        population: r.population(),
        children: r.children(),
        working_age: r.working(),
        elders: r.elders(),
        blocks: r.blocks.iter().map(|b| BlockView { lineage: lin(b.lineage), religion: b.religion.and_then(|i| w.religions.get(i as usize)).map(|x| x.name.clone()), count: b.total() }).collect(),
        quals,
        labor: r.last.labor.clone(),
        facilities,
        food_fulfillment_bp: r.food_hist[slot],
        water_fulfillment_bp: r.water_hist[slot],
        water_capacity: population::water_capacity(r),
        health_pressure_bp: r.health_bp,
        unrest_bp: r.unrest_bp,
        transport_level: economy::transport_level(r),
        link_efficiency_bp: link as u16,
        power: PowerView {
            shaft_supply: r.last.shaft_supply,
            shaft_demand: r.last.shaft_demand,
            elec_supply: r.last.elec_supply,
            elec_demand: r.last.elec_demand,
            // compute is pooled nationally; the same figures appear in every region
            compute_supply: w.civs[seat as usize].compute_supply,
            compute_demand: w.civs[seat as usize].compute_demand,
        },
        occupied_since: if r.owner != r.controller { r.occupied_since } else { None },
        venues: [Cap::SeatsLodge, Cap::SeatsSchool, Cap::SeatsCollege, Cap::SeatsInstitute]
            .iter()
            .map(|v| {
                let (cap, reserved) = projects::venue_seats(w, seat, ri, *v);
                VenueSeats { venue: venue_key(*v).0.to_string(), capacity: cap.max(0) as u32, reserved: reserved.max(0) as u32 }
            })
            .filter(|v| v.capacity > 0 || v.reserved > 0)
            .collect(),
    }
}

pub fn victory_revealed(w: &World, seat: SeatId) -> bool {
    w.cfg.disclosed_objective || w.civs[seat as usize].milestones.interstellar.is_some()
}

pub fn observe(w: &World, seat: SeatId) -> Observation {
    let c = content();
    let si = seat as usize;
    let civ = &w.civs[si];
    let ctx = CivCtx { world: w, seat };
    let month = w.month;
    let revealed = victory_revealed(w, seat);
    let link = economy::link_efficiencies(w, seat);

    // ---- regions ------------------------------------------------------------
    let mut regions = Vec::new();
    for (ri, r) in w.regions.iter().enumerate() {
        let mem = &civ.memory[ri];
        if !mem.seen {
            continue;
        }
        let mine = r.controller == Some(seat) || r.owner == Some(seat);
        let visibility = if mine { Visibility::Own } else if mem.last_seen == month { Visibility::Visible } else { Visibility::Remembered };
        let current = visibility != Visibility::Remembered;
        let owner = if current { r.owner } else { mem.owner };
        let survey = if mem.surveyed {
            Some(SurveyView {
                arable: r.arable,
                pasture: r.pasture,
                wild_food: (r.wild / 1000) as u32,
                fishery: r.fishery,
                forest: r.forest,
                water: r.water,
                hydro: r.hydro,
                deposits: r
                    .deposits
                    .iter()
                    .filter(|d| deposit_known(civ, d.kind))
                    .map(|d| DepositView { kind: d.kind, remaining: if mine { d.remaining } else { (d.remaining / 10_000_000).max(1) * 10_000_000 }, quality_bp: d.quality_bp, epistemic: if mine { Epistemic::Verified } else { Epistemic::Estimated } })
                    .collect(),
                surveyed_month: mem.survey_month,
                detailed: true,
            })
        } else {
            None
        };
        let foreign = match owner {
            Some(o) if o != seat && !mine => {
                let (lo, hi) = fuzz(w, seat, 1000 + ri as u64, mem.pop_estimate, 50);
                Some(ForeignRegion { population_low: lo, population_high: hi, notable: mem.notable.clone() })
            }
            _ => None,
        };
        let settlement = if mine || current {
            r.settlement()
        } else {
            match mem.pop_estimate {
                0 => SettlementKind::Wilderness,
                1..=399 => SettlementKind::Camp,
                400..=1999 => SettlementKind::Village,
                2000..=7999 => SettlementKind::Town,
                8000..=29999 => SettlementKind::City,
                _ => SettlementKind::Metropolis,
            }
        };
        regions.push(RegionView {
            id: r.id,
            name: r.name.clone(),
            poly: r.poly.clone(),
            center: r.center,
            neighbors: r.neighbors.iter().filter(|(n, _)| civ.memory[*n as usize].seen).map(|(n, k)| NeighborLink { region: *n, kind: k.key().to_string() }).collect(),
            terrain: r.terrain,
            coastal: r.coastal,
            river: r.river,
            elevation: r.elevation,
            visibility,
            last_seen: mem.last_seen,
            owner,
            controller: if current { r.controller } else { mem.owner },
            settlement,
            survey,
            own: if r.controller == Some(seat) { Some(own_region(w, seat, ri, link[ri])) } else { None },
            foreign,
            test_node: revealed && w.test_nodes.contains(&r.id),
        });
    }

    // ---- own civilization -----------------------------------------------------
    let ctrl: Vec<&Region> = w.regions.iter().filter(|r| r.controller == Some(seat)).collect();
    let population: u32 = ctrl.iter().map(|r| r.population()).sum();
    let storage: i64 = ctrl.iter().map(|r| r.cap(Cap::Storage) + 400_000).sum();
    let goods = Good::ALL
        .iter()
        .map(|g| GoodLine {
            good: *g,
            stock: civ.stock_of(*g),
            produced: civ.last_flows.produced[g.index()],
            consumed: civ.last_flows.consumed[g.index()],
            traded_in: civ.last_flows.traded_in[g.index()],
            traded_out: civ.last_flows.traded_out[g.index()],
            capacity: if *g == Good::Food { Some(storage) } else { None },
        })
        .collect();
    let quals = Qual::ALL
        .iter()
        .map(|q| QualCount { qual: *q, count: ctrl.iter().map(|r| r.quals[q.index()]).sum(), employed: civ.qual_employed.get(q.index()).copied().unwrap_or(0) })
        .filter(|q| q.count > 0)
        .collect();
    let research = ResearchClass::ALL
        .iter()
        .map(|k| ResearchLine { class: *k, capacity: civ.research_cap[k.index()], used: civ.research_used[k.index()] })
        .filter(|l| l.capacity > 0 || l.used > 0)
        .collect();
    let working = civ.labor.working_age.max(1) as i64;
    let share = |n: i64| (n * 10_000 / working).clamp(0, 10_000) as u16;
    let mut factions = vec![
        FactionView {
            key: "cultivators".into(),
            name: "Cultivators and foragers".into(),
            description: "Households whose work is food.".into(),
            weight_bp: share(civ.labor.food as i64),
            support: (40 + (civ.food_ful_bp as i64 - 8000) / 50 + civ.stability as i64 / 4).clamp(0, 100) as u8,
            demand: if civ.food_ful_bp < 9500 { "Enough to eat, before anything else".into() } else if civ.stock_of(Good::Tools) <= 0 { "Tools that do not break mid-season".into() } else { "Secure tenure and fair calls on their labour".into() },
        },
        FactionView {
            key: "artisans".into(),
            name: "Artisans and works".into(),
            description: "People employed in workshops, mines and plants.".into(),
            weight_bp: share(civ.labor.facilities as i64),
            support: (45 + civ.stability as i64 / 3 + if civ.est_id("C018") || civ.est_id("C034") { 10 } else { 0 }).clamp(0, 100) as u8,
            demand: if civ.est_id("C033") && !civ.est_id("C034") { "A recognized voice in the works".into() } else { "Steady materials and maintained equipment".into() },
        },
        FactionView {
            key: "learned".into(),
            name: "Teachers and investigators".into(),
            description: "Learners, instructors and research staff.".into(),
            weight_bp: share(civ.labor.students as i64 + civ.labor.teachers as i64 + civ.research_cap.iter().sum::<i64>() / 1000),
            support: (50 + civ.stability as i64 / 4 + if civ.research_used.iter().sum::<i64>() > 0 { 10 } else { -10 }).clamp(0, 100) as u8,
            demand: "Funded questions, instruments and places for students".into(),
        },
        FactionView {
            key: "households".into(),
            name: "Unattached households".into(),
            description: "People with no steady post beyond household work.".into(),
            weight_bp: share(civ.labor.household as i64),
            support: (35 + civ.stability as i64 / 2).clamp(0, 100) as u8,
            demand: "Useful work nearby, or land to settle".into(),
        },
    ];
    if civ.labor.soldiers > 0 {
        factions.push(FactionView {
            key: "soldiers".into(),
            name: "Soldiers".into(),
            description: "People under arms.".into(),
            weight_bp: share(civ.labor.soldiers as i64),
            support: (60 - civ.war_weariness as i64 + civ.stability as i64 / 5).clamp(0, 100) as u8,
            demand: "Supply, relief and a purpose worth the losses".into(),
        });
    }
    if let Some(m) = &civ.movement {
        factions.push(FactionView {
            key: "faithful".into(),
            name: "The gathered faithful".into(),
            description: "Participants in the local religious movement.".into(),
            weight_bp: (m.participants as i64 * 10_000 / population.max(1) as i64) as u16,
            support: (55 + civ.stability as i64 / 4).clamp(0, 100) as u8,
            demand: if m.stage < 2 { "A place of their own to gather".into() } else { "Recognition and room to teach".into() },
        });
    }
    let own_civ = OwnCiv {
        name: civ.name.clone(),
        adjective: civ.adjective.clone(),
        color: civ.color.clone(),
        capital: civ.capital,
        population: population + civ.labor.soldiers,
        children: ctrl.iter().map(|r| r.children()).sum(),
        working_age: ctrl.iter().map(|r| r.working()).sum(),
        elders: ctrl.iter().map(|r| r.elders()).sum(),
        births_last_round: civ.last_flows.births,
        deaths_last_round: civ.last_flows.deaths,
        migration_last_round: civ.last_flows.migration,
        goods,
        quals,
        labor: civ.labor.clone(),
        research,
        policies: Policies {
            food_reserve_months: civ.food_reserve_months,
            labor_weights: LaborCategory::ALL.iter().map(|l| (*l, civ.labor_weights[l.index()])).collect(),
            mobilization_bp: civ.mobilization_bp,
        },
        factions,
        mobilization_cap_bp: economy::mobilization_cap(w, seat),
        stability: civ.stability,
        admin_capacity: culture::admin_capacity(w, seat),
        admin_load: culture::admin_load(w, seat),
        food_fulfillment_bp: civ.food_ful_bp,
        water_fulfillment_bp: civ.water_ful_bp,
        military_tier: military::military_tier(w, seat),
        recruit_room: military::recruit_room(w, seat),
        overlord: civ.overlord,
        subordinates: w.civs.iter().filter(|o| o.overlord == Some(seat)).map(|o| o.seat).collect(),
    };

    // ---- other civilizations -----------------------------------------------------
    let own_power: i64 = w.armies.iter().filter(|a| a.owner == seat).map(|a| a.count() as i64 * crate::content::TIER_POWER[a.tier as usize] / 1000).sum();
    let mut others = Vec::new();
    for o in &w.civs {
        if o.seat == seat || !civ.contacts[o.seat as usize].met {
            continue;
        }
        let ct = &civ.contacts[o.seat as usize];
        let known: Vec<usize> = (0..w.regions.len()).filter(|i| civ.memory[*i].seen && civ.memory[*i].owner == Some(o.seat)).collect();
        let est: u32 = known.iter().map(|i| civ.memory[*i].pop_estimate).sum();
        let (lo, hi) = fuzz(w, seat, 2000 + o.seat as u64, est, 50);
        let seen_armies: Vec<&Army> = w.armies.iter().filter(|a| a.owner == o.seat && civ.memory[a.region as usize].last_seen == month).collect();
        let their_power: i64 = seen_armies.iter().map(|a| a.count() as i64 * crate::content::TIER_POWER[a.tier as usize] / 1000).sum();
        let military_estimate = if seen_armies.is_empty() {
            "No formations observed".to_string()
        } else if their_power > own_power * 2 {
            "Observed forces far outmatch ours".to_string()
        } else if their_power * 10 > own_power * 12 {
            "Observed forces are stronger than ours".to_string()
        } else if their_power * 12 < own_power * 10 {
            "Observed forces are weaker than ours".to_string()
        } else {
            "Observed forces are comparable to ours".to_string()
        };
        others.push(ForeignCiv {
            seat: o.seat,
            name: o.name.clone(),
            adjective: o.adjective.clone(),
            color: o.color.clone(),
            controller: o.controller,
            status: o.status,
            contacted: true,
            contact_month: ct.month,
            at_war: ct.at_war,
            overlord: o.overlord,
            population_low: lo,
            population_high: hi,
            regions_known: known.len() as u16,
            military_estimate,
            observed_tier: seen_armies.iter().map(|a| a.tier).max(),
            trust: ct.trust.clamp(0, 100) as u8,
            notes: ct.notes.iter().rev().take(6).cloned().collect(),
        });
    }

    // ---- knowledge -------------------------------------------------------------------
    let mut techs = Vec::new();
    let mut leads = Vec::new();
    for (i, t) in c.techs.iter().enumerate() {
        let st = &civ.tech[i];
        if st.state == ST_UNKNOWN {
            continue;
        }
        let handle = tech_handle(w, seat, i);
        if st.state == ST_HINTED {
            let tag = t.tags.iter().copied().max_by_key(|x| civ.tag(*x)).unwrap_or(t.tags[0]);
            leads.push(Lead {
                handle,
                title: format!("An open question in {}", tag.name().to_lowercase()),
                detail: "Practitioners keep meeting a problem that current methods do not explain. A focused study could identify a workable line of investigation; it could also find little.".into(),
                source: st.source.clone(),
                month: st.disc_month,
                confidence_bp: (st.evidence * 4000 / (900 * (t.tier as i64 + 1)).max(1)).clamp(1500, 9000) as u16,
                study_work: projects::scaled(t.work * 15 / 100, w.cfg.pace_bp),
                class: t.class,
            });
            continue;
        }
        let (mut known_requirements, unknown_requirements) = req_items(w, seat, &t.prereq, false);
        let site_ok = projects::tech_site_ok(w, seat, i);
        if let Some(key) = t.needs_facility {
            known_requirements.push(KnownRequirement { text: format!("A working {}", c.facilities[c.f(key)].name.to_lowercase()), satisfied: site_ok, handle: None });
        }
        let in_project = civ.projects.iter().any(|p| p.kind == (ProjKind::Research { tech: i }));
        let mut links = Vec::new();
        let mut pre = Vec::new();
        t.prereq.techs(&mut pre);
        for p in pre {
            if civ.tech[p].state >= ST_DISCOVERED {
                links.push(tech_handle(w, seat, p));
            }
        }
        let full = projects::scaled(t.work, w.cfg.pace_bp) * (10_000 - st.discount_bp as i64) / 10_000;
        techs.push(TechCard {
            handle,
            name: t.name.clone(),
            field: t.group_title.clone(),
            label: t.label.clone(),
            state: knowledge_state(st.state).unwrap(),
            capability: t.capability.clone(),
            requirements: t.requirements.clone(),
            known_requirements,
            unknown_requirements,
            class: t.class,
            work_needed: full,
            work_done: if st.state >= ST_UNDERSTOOD { full } else { st.work.min(full) },
            source: st.source.clone(),
            discovered_month: st.disc_month,
            understood_month: if st.state >= ST_UNDERSTOOD { Some(st.und_month) } else { None },
            can_investigate: (st.state == ST_DISCOVERED || st.state == ST_INVESTIGATING) && !in_project && site_ok && t.prereq.eval(&ctx),
            enables: if st.state >= ST_UNDERSTOOD { c.tech_enables[i].clone() } else { vec![] },
            links,
        });
    }
    let domains = Tag::ALL
        .iter()
        .filter(|tag| (0..c.techs.len()).any(|i| civ.knows(i) && c.techs[i].tags.contains(tag)))
        .map(|tag| StudyDomain { key: tag.key().to_string(), name: tag.name().to_string(), description: tag.desc().to_string() })
        .collect();
    let knowledge = KnowledgeView { techs, leads, domains, scientific_method: civ.milestones.sci_method.is_some() };

    // ---- culture ------------------------------------------------------------------------
    let mut practices = Vec::new();
    for (i, p) in c.practices.iter().enumerate() {
        let st = &civ.practice[i];
        if st.state == 0 {
            continue;
        }
        let (mut reqs, _) = req_items(w, seat, &p.prereq, true);
        let (hard, _) = req_items(w, seat, &p.hard, false);
        reqs.extend(hard);
        let state = match st.state {
            1 => PracticeState::Recognized,
            2 => PracticeState::Reforming,
            _ => {
                if st.adoption_bp >= ESTABLISHED_BP { PracticeState::Established } else { PracticeState::Enacted }
            }
        };
        let mut links = Vec::new();
        let mut pre = Vec::new();
        p.prereq.pracs(&mut pre);
        for q in pre {
            if civ.practice[q].state >= 1 {
                links.push(prac_handle(w, seat, q));
            }
        }
        practices.push(PracticeCard {
            handle: prac_handle(w, seat, i),
            name: p.name.clone(),
            group: p.group.clone(),
            state,
            behavior: p.behavior.clone(),
            requirements: p.requirements.clone(),
            known_requirements: reqs,
            adoption_bp: st.adoption_bp,
            can_reform: st.state == 1 && p.prereq.eval(&PracEnactedCtx { world: w, seat, recognized_only: false }) && p.hard.eval(&ctx),
            reform_work: projects::scaled(p.work, w.cfg.pace_bp),
            enables: c.prac_enables[i].clone(),
            links,
            source: st.source.clone(),
            recognized_month: st.rec_month,
        });
    }
    let mut lineages = Vec::new();
    for (li, l) in w.lineages.iter().enumerate() {
        let pop: u32 = ctrl.iter().flat_map(|r| r.blocks.iter()).filter(|b| b.lineage as usize == li).map(|b| b.total()).sum();
        if pop == 0 {
            continue;
        }
        let traits = (0..8)
            .filter_map(|k| l.trait_since[k].map(|m| TraitView { name: TRAIT_NAMES[k].0.to_string(), description: TRAIT_NAMES[k].1.to_string(), since: m }))
            .collect();
        lineages.push(LineageView { key: format!("lineage-{li}"), name: l.name.clone(), population: pop, traits, origin: l.origin.clone() });
    }
    let belief_view = |key: &str| BELIEFS.iter().find(|b| b.key == key).map(|b| BeliefOption { key: b.key.to_string(), slot: b.slot.to_string(), name: b.name.to_string(), description: b.desc.to_string() });
    let mut religions = Vec::new();
    for (ri, rel) in w.religions.iter().enumerate() {
        let followers: u32 = ctrl.iter().flat_map(|r| r.blocks.iter()).filter(|b| b.religion == Some(ri as u16)).map(|b| b.total()).sum();
        let known = rel.founder == seat || followers > 0 || civ.contacts[rel.founder as usize].met;
        if !known {
            continue;
        }
        religions.push(ReligionView {
            key: format!("religion-{ri}"),
            name: rel.name.clone(),
            founder: Some(rel.founder),
            founded_month: rel.founded,
            holy_region: if civ.memory[rel.holy_region as usize].seen { Some(rel.holy_region) } else { None },
            beliefs: if rel.founder == seat || followers > 0 { rel.beliefs.iter().filter_map(|k| belief_view(k)).collect() } else { vec![] },
            followers_known: followers,
        });
    }
    let movement = civ.movement.as_ref().map(|m| {
        let (needed, next) = culture::movement_requirements(m.stage);
        let options: Vec<BeliefOption> = match m.stage {
            0 => BELIEFS.iter().filter(|b| b.slot == "Follower practice").filter_map(|b| belief_view(b.key)).collect(),
            3 => BELIEFS.iter().filter_map(|b| belief_view(b.key)).collect(),
            _ => vec![],
        };
        MovementView {
            region: m.region,
            stage: match m.stage {
                0 => "Local gatherings",
                1 => "Shared tradition",
                2 => "Sacred precinct",
                3 => "Recognized founder",
                _ => "Founded religion",
            }
            .to_string(),
            participants: m.participants,
            devotion: m.devotion,
            devotion_needed: needed,
            next_step: if next.is_empty() { None } else { Some(next.to_string()) },
            belief_options: options,
            slots_remaining: RELIGION_SLOTS.saturating_sub(w.religions.len() as u8),
        }
    });
    let culture_view = CultureView { practices, lineages, religions, movement };

    // ---- catalog ------------------------------------------------------------------------------
    let mut cat_fac = Vec::new();
    for (k, def) in c.facilities.iter().enumerate() {
        if !facility_visible(w, seat, k) {
            continue;
        }
        let (requirements, _) = req_items(w, seat, &def.req, false);
        let recipes = def
            .recipes
            .iter()
            .filter(|r| {
                let mut ts = Vec::new();
                r.req.techs(&mut ts);
                ts.iter().all(|t| civ.tech[*t].state >= ST_DISCOVERED)
            })
            .map(|r| {
                let mut outputs = qty(&r.outputs);
                let _ = &mut outputs;
                let mut note = String::new();
                if r.out_shaft > 0 {
                    note = format!("Delivers {} shaft power", r.out_shaft / 1000);
                }
                if r.out_elec > 0 {
                    note = format!("Delivers {} electricity", r.out_elec / 1000);
                }
                if r.out_compute > 0 {
                    note = format!("Delivers {} compute", r.out_compute / 1000);
                }
                if let Some((class, pts)) = r.research {
                    note = format!("Up to {} {} per month", pts / 1000, class.label().to_lowercase());
                }
                if r.assembly > 0 {
                    note = "One jump assembly per 24 months of full work".into();
                }
                RecipeView { key: r.key.to_string(), name: r.name.to_string(), inputs: qty(&r.inputs), outputs, shaft: r.shaft, elec: r.elec, compute: r.compute, out_shaft: r.out_shaft, out_elec: r.out_elec, out_compute: r.out_compute, research: r.research, note, available: r.req.eval(&ctx) }
            })
            .collect();
        let mut jobs: Vec<JobSpec> = def.skilled.iter().map(|(qs, n)| JobSpec { qual: Some(qs[0]), count: *n }).collect();
        if def.general > 0 {
            jobs.push(JobSpec { qual: None, count: def.general });
        }
        cat_fac.push(FacilityType {
            kind: def.key.to_string(),
            name: def.name.to_string(),
            category: def.category.to_string(),
            description: def.desc.to_string(),
            cost: qty(&def.cost),
            work: projects::scaled(def.work, w.cfg.pace_bp),
            jobs,
            recipes,
            provides: def.provides.iter().map(|(k, v)| cap_text(*k, *v)).collect(),
            site: site_text(def.site),
            site_key: site_key(def.site),
            max_level: def.max_level,
            upkeep: qty(&def.upkeep),
            requirements,
            available: def.req.eval(&ctx),
            labor_category: def.labor,
        });
    }
    let mut cat_courses = Vec::new();
    for (k, course) in c.courses.iter().enumerate() {
        if !course_visible(w, seat, k) {
            continue;
        }
        let (requirements, _) = req_items(w, seat, &course.req, false);
        let (venue, venue_name) = venue_key(course.venue);
        cat_courses.push(CourseType {
            key: course.id.clone(),
            name: course.name.clone(),
            description: course.desc.clone(),
            months: course.months,
            class_size: course.class_size,
            entrants: course.entrants.clone(),
            teachers: course.teachers.clone(),
            output: course.output,
            venue: venue.to_string(),
            venue_name: venue_name.to_string(),
            materials: qty(&course.materials),
            requirements,
            available: course.req.eval(&ctx),
        });
    }
    let mut unit_tiers = Vec::new();
    for t in &c.unit_tiers {
        let mut ts = Vec::new();
        t.req.techs(&mut ts);
        let mut ps = Vec::new();
        t.req.pracs(&mut ps);
        if !(ts.iter().all(|x| civ.tech[*x].state >= ST_DISCOVERED) && ps.iter().all(|x| civ.practice[*x].state >= 1)) {
            continue;
        }
        let (requirements, _) = req_items(w, seat, &t.req, false);
        unit_tiers.push(UnitTier {
            tier: t.tier,
            name: t.name.to_string(),
            role_names: Role::ALL.iter().map(|r| (*r, t.roles[r.index()].to_string())).collect(),
            equipment: qty(&t.equipment),
            upkeep: qty(&t.upkeep),
            training_months: t.training_months,
            requirements,
            available: t.req.eval(&ctx),
        });
    }

    // ---- projects, programmes, forces ---------------------------------------------------------------
    let projects_view = civ
        .projects
        .iter()
        .map(|p| {
            let remaining = (p.work_needed - p.work_done).max(0);
            let eta = if p.last_progress > 0 { Some(((remaining + p.last_progress - 1) / p.last_progress) as u32) } else { None };
            ProjectView {
                id: p.id,
                kind: match &p.kind {
                    ProjKind::Build { .. } => "build",
                    ProjKind::Research { .. } => "research",
                    ProjKind::LeadStudy { .. } => "lead",
                    ProjKind::Survey { .. } => "survey",
                    ProjKind::Settle { .. } => "settle",
                    ProjKind::Study { .. } => "study",
                    ProjKind::Resettle { .. } => "resettle",
                    ProjKind::Recruit { .. } => "recruit",
                    ProjKind::Reform { .. } => "reform",
                    ProjKind::Religion { .. } => "religion",
                    ProjKind::FtlTrial => "ftl_trial",
                    ProjKind::FtlDeployment => "ftl_deployment",
                    ProjKind::FtlReplacement => "ftl_replacement",
                }
                .to_string(),
                title: projects::project_title(w, &p.kind, p.region),
                region: match &p.kind {
                    ProjKind::Survey { region } => Some(*region),
                    ProjKind::Settle { to, .. } => Some(*to),
                    _ => p.region,
                },
                target: match &p.kind {
                    ProjKind::Build { facility, .. } => Some(c.facilities[*facility].key.to_string()),
                    ProjKind::Research { tech } | ProjKind::LeadStudy { tech } => Some(tech_handle(w, seat, *tech)),
                    ProjKind::Reform { practice } => Some(prac_handle(w, seat, *practice)),
                    ProjKind::Study { tag } => Some(Tag::ALL[*tag].key().to_string()),
                    _ => None,
                },
                work_needed: p.work_needed,
                work_done: p.work_done,
                inputs_needed: p.inputs.iter().map(|(g, n, _)| GoodQty { good: *g, amount: *n }).collect(),
                inputs_committed: p.inputs.iter().map(|(g, _, k)| GoodQty { good: *g, amount: *k }).collect(),
                priority: p.priority,
                paused: p.paused,
                started_month: p.started,
                last_progress: p.last_progress,
                blockers: p.blockers.clone(),
                eta_months_low: eta,
                eta_months_high: eta.map(|e| e + e / 2 + 1),
            }
        })
        .collect();
    let programs_view = civ
        .programs
        .iter()
        .map(|p| ProgramView {
            id: p.id,
            course: c.courses[p.course].id.clone(),
            course_name: c.courses[p.course].name.clone(),
            region: p.region,
            seats: p.seats,
            enrolled: p.enrolled,
            teachers: p.teachers,
            progress_months: p.progress,
            months: p.duration,
            graduates_total: p.graduates,
            paused: p.paused,
            blockers: p.blockers.clone(),
        })
        .collect();
    let armies = w
        .armies
        .iter()
        .filter(|a| a.owner == seat)
        .map(|a| ArmyView {
            id: a.id,
            name: a.name.clone(),
            region: a.region,
            soldiers: Role::ALL.iter().map(|r| (*r, a.soldiers[r.index()])).collect(),
            tier: a.tier,
            proficiency_bp: a.proficiency_bp,
            supply_bp: a.supply_bp,
            morale_bp: a.morale_bp,
            order: match a.order {
                ArmyOrder::Hold => "hold",
                ArmyOrder::Move { .. } => "move",
                ArmyOrder::Attack { .. } => "attack",
                _ => "hold",
            }
            .to_string(),
            target: match a.order {
                ArmyOrder::Move { to } => Some(to),
                ArmyOrder::Attack { region } => Some(region),
                _ => None,
            },
            training_months_left: a.training_left,
            in_battle: a.in_battle,
        })
        .collect();
    let foreign_armies = w
        .armies
        .iter()
        .filter(|a| a.owner != seat && civ.memory[a.region as usize].last_seen == month && civ.memory[a.region as usize].seen)
        .map(|a| {
            let (lo, hi) = fuzz(w, seat, 5000 + a.id as u64, a.count(), 60);
            ForeignArmyView { owner: a.owner, region: a.region, strength_low: lo, strength_high: hi, tier_estimate: if a.in_battle || w.at_war(seat, a.owner) { Some(a.tier) } else { None }, observed_month: month }
        })
        .collect();

    // ---- diplomacy -------------------------------------------------------------------------------------
    let channels = w
        .civs
        .iter()
        .filter(|o| o.seat != seat && civ.contacts[o.seat as usize].met && o.status != SeatStatus::Eliminated)
        .map(|o| ChannelView {
            seat: o.seat,
            selected_by_me: civ.selected.contains(&o.seat),
            // whom the other side selected is revealed only by the channel opening
            open: w.phase != Phase::Contact && channel_open(w, seat, o.seat),
            envelopes_used: w.envelopes[w.pair(seat, o.seat)],
            envelopes_limit: PAIR_ENVELOPES,
            sent_this_window: w.sent_window[seat as usize * w.n() + o.seat as usize],
        })
        .collect();
    let delivered = |m: &Msg| -> bool {
        if m.from == seat {
            return true;
        }
        // simultaneous windows: an envelope is read only after its window closes
        !(w.phase == Phase::Negotiate && m.round == w.round && m.window == w.window)
    };
    let messages = w
        .messages
        .iter()
        .filter(|m| (m.from == seat || m.to == seat) && m.round + 3 >= w.round && delivered(m))
        .map(|m| MessageView { id: m.id, from: m.from, to: m.to, month: m.month, round: m.round, window: m.window, intent: m.intent, text: m.text.clone() })
        .collect();
    let offers = w
        .offers
        .iter()
        .filter(|o| (o.from == seat || o.to == seat) && (o.status == "open" || o.expires_round + 1 >= w.round))
        .map(|o| OfferView {
            id: o.id,
            from: o.from,
            to: o.to,
            clauses: o.clauses.iter().map(|cl| view_clause(w, seat, cl)).collect(),
            summary: o.clauses.iter().map(|cl| crate::sim::diplomacy::clause_summary(w, cl)).collect(),
            text: o.text.clone(),
            created_month: o.created,
            expires_round: o.expires_round,
            status: o.status.clone(),
        })
        .collect();
    let mut treaties: Vec<TreatyView> = w
        .treaties
        .iter()
        .filter(|t| t.parties.contains(&seat))
        .map(|t| TreatyView {
            id: t.id,
            parties: t.parties,
            clauses: t.clauses.iter().map(|cl| view_clause(w, seat, cl)).collect(),
            summary: t.clauses.iter().map(|cl| crate::sim::diplomacy::clause_summary(w, cl)).collect(),
            signed_month: t.signed,
            ends_month: t.ends,
            status: t.status.clone(),
            performance: t.performance.clone(),
        })
        .collect();
    let active = treaties.iter().filter(|t| t.status == "active").count();
    if treaties.len() > active + 12 {
        let cut = treaties.len() - active - 12;
        let mut dropped = 0;
        treaties.retain(|t| {
            if t.status != "active" && dropped < cut {
                dropped += 1;
                false
            } else {
                true
            }
        });
    }
    let diplomacy = DiplomacyView { channels, messages, offers, treaties, wars: w.civs.iter().filter(|o| o.seat != seat && civ.contacts[o.seat as usize].at_war).map(|o| o.seat).collect() };

    // ---- objectives -------------------------------------------------------------------------------------
    let owned = w.owned(seat).len();
    let mut agendas = vec![
        Agenda { key: "population".into(), title: "People".into(), description: "Improve supply and health so the population can grow without hunger.".into(), progress: format!("{} people; food access {:.0}%, water {:.0}%", population, civ.food_ful_bp as f64 / 100.0, civ.water_ful_bp as f64 / 100.0) },
        Agenda { key: "economy".into(), title: "Livelihoods".into(), description: "Reduce stoppages, build a reliable surplus and keep works maintained.".into(), progress: format!("{:.0} months of food in store", civ.stock_of(Good::Food) as f64 / (population.max(1) as f64 * 1000.0)) },
        Agenda { key: "territory".into(), title: "Land".into(), description: "Develop and actually govern reachable regions.".into(), progress: format!("{owned} regions governed; administration can carry {}", culture::admin_capacity(w, seat)) },
        Agenda { key: "resources".into(), title: "Resources".into(), description: "Secure stable extraction or supply of the materials known to matter.".into(), progress: format!("{} known deposits under our control", ctrl.iter().map(|r| r.deposits.iter().filter(|d| deposit_known(civ, d.kind)).count()).sum::<usize>()) },
    ];
    let mut milestones = vec!["Craft and experience".to_string()];
    if civ.milestones.sci_method.is_some() {
        milestones.push("Scientific method".into());
        agendas.push(Agenda { key: "science".into(), title: "Systematic research".into(), description: "Organize concrete questions and the instruments, people and institutions that can answer them.".into(), progress: format!("{} methods understood", civ.tech.iter().filter(|t| t.state >= ST_UNDERSTOOD).count()) });
    }
    if civ.milestones.planetary.is_some() {
        milestones.push("Planetary perspective".into());
        agendas.push(Agenda { key: "planet".into(), title: "Planetary coordination".into(), description: "Space industry, long-range resources and the whole world as one system.".into(), progress: format!("{} of {} regions on the map", regions.len(), w.regions.len()) });
    }
    if civ.milestones.interstellar.is_some() {
        milestones.push("Interstellar feasibility".into());
    }
    let victory_view = if revealed {
        let live = &civ.ftl;
        Some(VictoryView {
            governance_months: live.gov_streak,
            governance_needed: GOVERNANCE_MONTHS,
            ftl_months: live.ftl_streak,
            ftl_needed: FTL_MONTHS,
            trials: victory::valid_trials(w, seat),
            governance_checks: if live.gov_checks.is_empty() { victory::governance_checks(w, seat) } else { live.gov_checks.clone() },
            ftl_checks: if live.ftl_checks.is_empty() { victory::ftl_checks(w, seat) } else { live.ftl_checks.clone() },
            test_nodes: w.test_nodes.iter().copied().filter(|n| civ.memory[*n as usize].seen).collect(),
            assemblies_operational: live.assemblies.iter().filter(|a| !a.retired).count() as u32,
            deployment_done: live.deployment_done.is_some(),
            replacement_done: live.replacement_done.is_some(),
            summary: "Complete victory needs all three at once: 96 continuous months as the highest real authority over every inhabited region, with food, water and order holding everywhere; 24 continuous months of fleet-wide jump capability with series manufacture, deployment, replacement and crews; and two loaded jump round trips at least 12 months apart inside the last 96 months, flown during that governance. Conquest never waives the jump requirements and jump flights never waive governance. Only one seat can win.".into(),
        })
    } else {
        None
    };
    let objectives = ObjectivesView { agendas, milestones, victory: victory_view };

    // ---- briefing: recorded events plus standing conditions ----------------------------------------------
    let mut briefing = civ.briefing.clone();
    if month == 0 {
        let home = &w.regions[civ.capital as usize];
        briefing.push(BriefingItem { severity: "info".into(), title: format!("{} people are camped at {}", population, home.name), detail: "They live by gathering, hunting and fishing, with stores for a few months. There is no currency, school, religion or state budget. Each round is one year; standing arrangements continue on their own.".into(), region: Some(civ.capital), panel: "map".into() });
        briefing.push(BriefingItem { severity: "info".into(), title: "A makers' circle already compares methods".into(), detail: "As people work, practitioners will report problems that current methods do not explain. Those leads appear in the knowledge panel, where they can be followed up and then investigated.".into(), region: None, panel: "knowledge".into() });
        briefing.push(BriefingItem { severity: "info".into(), title: "Only a share of spare labour answers a call".into(), detail: "Food comes first. Of the rest, custom lets the community call up a limited share for common projects such as building, surveying or settling new land. Institutions can raise that share later.".into(), region: None, panel: "economy".into() });
        briefing.push(BriefingItem { severity: "info".into(), title: "The land around is unrecorded".into(), detail: "A supplied survey party can record a neighbouring region; a settling party can then found a camp there.".into(), region: None, panel: "projects".into() });
    }
    let months_food = civ.stock_of(Good::Food) / (population.max(1) as i64 * 1000);
    if months_food < 2 && population > 0 {
        briefing.push(BriefingItem { severity: "danger".into(), title: "Less than two months of food in store".into(), detail: "Open land, add fields, pastures or fishing grounds, or lower other calls on labour.".into(), region: Some(civ.capital), panel: "economy".into() });
    }
    let idle_research: i64 = civ.research_cap.iter().sum::<i64>() - civ.research_used.iter().sum::<i64>();
    let pending = knowledge.techs.iter().filter(|t| t.can_investigate).count();
    if idle_research >= 2000 && pending > 0 {
        briefing.push(BriefingItem { severity: "warning".into(), title: "Investigators have spare time".into(), detail: format!("{pending} known question(s) could be investigated."), region: None, panel: "knowledge".into() });
    }
    if !knowledge.leads.is_empty() {
        briefing.push(BriefingItem { severity: "info".into(), title: format!("{} lead(s) await follow-up", knowledge.leads.len()), detail: "Leads become workable questions through a small study, or slowly through further experience.".into(), region: None, panel: "knowledge".into() });
    }
    let reforms = culture_view.practices.iter().filter(|p| p.can_reform).count();
    if reforms > 0 {
        briefing.push(BriefingItem { severity: "info".into(), title: format!("{reforms} practice(s) could be enacted"), detail: "Their real requirements are met; a reform needs the capital's time.".into(), region: None, panel: "culture".into() });
    }
    let inbox = diplomacy.offers.iter().filter(|o| o.to == seat && o.status == "open").count();
    if inbox > 0 {
        briefing.push(BriefingItem { severity: "warning".into(), title: format!("{inbox} proposal(s) await your answer"), detail: "Unsigned proposals lapse after next round.".into(), region: None, panel: "diplomacy".into() });
    }
    if civ.labor.household as i64 * 4 > working && working > 200 {
        briefing.push(BriefingItem { severity: "info".into(), title: "Many households lack steady work".into(), detail: "Facilities, schools or new settlements would employ them.".into(), region: None, panel: "economy".into() });
    }
    let rank = |s: &str| match s {
        "danger" => 0,
        "warning" => 1,
        "good" => 2,
        _ => 3,
    };
    briefing.sort_by_key(|b| rank(&b.severity));

    Observation {
        protocol_version: PROTOCOL_VERSION.to_string(),
        match_id: w.match_id.clone(),
        seat,
        month,
        round: w.round,
        months_per_round: w.cfg.months_per_round,
        horizon: w.cfg.horizon,
        phase: w.phase,
        window: w.window,
        ready: civ.ready,
        status: civ.status,
        outcome: w.outcome.as_ref().map(|o| MatchOutcome { finished_month: o.month, winner: o.winner, reason: o.reason.clone(), reward: victory::reward(w, seat) }),
        civ: own_civ,
        regions,
        world: WorldFrame { width: w.width, height: w.height, region_count: w.regions.len() as u16 },
        others,
        knowledge,
        culture: culture_view,
        catalog: CatalogView { facilities: cat_fac, courses: cat_courses, unit_tiers },
        projects: projects_view,
        programs: programs_view,
        armies,
        foreign_armies,
        diplomacy,
        objectives,
        briefing,
        chronicle: civ.chronicle.clone(),
        receipts: civ.receipts.clone(),
    }
}
