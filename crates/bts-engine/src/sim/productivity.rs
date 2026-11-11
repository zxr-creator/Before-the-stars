//! Labour productivity (design chapter 36, section 4, as changed by chapter 37,
//! section 8.3; ruleset 3.0 slice 6).
//!
//! For region `r` and sector `k`:
//!
//! ```text
//! LP(r, k) = clamp(F_edu x F_cul x F_rel x F_tech x F_city x F_health, 5,000, 40,000)
//! ```
//!
//! A works needs `10,000 / LP` of its method's general posts (after shared support);
//! automation (`F_auto`, 10,000-15,000) divides its qualified posts the same way. The
//! construction factor `min(LP(Construction), 15,000)` is the worker-months one
//! called-up worker supplies. None of it changes what a level makes: output per
//! level stays the recipe's hard ceiling, so higher productivity frees people,
//! never makes goods. Every effect comes from something the seat has - schooling,
//! established practices, a faith's doctrines, understood technologies, the
//! region's city, water and health - each bounded and named in the breakdown.
//!
//! The technology factor of a works counts only technologies whose era is at most
//! the works' era plus one: the era of its building line's stage, or of the method
//! it runs when that is later (a field worked by machine is modern farming).

use crate::content::{content, tech_era, FacDef, Recipe};
use crate::state::*;
use bts_protocol::*;

#[cfg(test)]
thread_local! {
    static NEUTRAL: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Tests of other mechanics fix every productivity factor at one on their thread,
/// so that their post counts and yields are the plain recipes'.
#[cfg(test)]
pub fn set_neutral(on: bool) {
    NEUTRAL.with(|n| n.set(on));
}

fn neutral() -> bool {
    #[cfg(test)]
    {
        NEUTRAL.with(|n| n.get())
    }
    #[cfg(not(test))]
    {
        false
    }
}

pub const SECTORS: usize = 6;
pub const LP_MIN: i64 = 5_000;
pub const LP_MAX: i64 = 40_000;
/// The automation factor's ceiling: 15,000, or 16,000 under the Automation Drive
/// charter (`sim::eras::auto_cap`), which clamps each seat's factor below this.
pub const LPQ_MAX: i64 = 16_000;
pub const CONSTRUCTION_MAX: i64 = 15_000;
/// Eras 0-9, and a cap of 10 that admits every technology.
pub const ERA_CAPS: usize = 11;

/// Productivity technologies: (sector, technology, basis points added while
/// understood) (design chapter 36, section 4.2).
pub const TECH_BONUS: &[(Sector, &str, i64)] = &[
    (Sector::Food, "T010", 300),
    (Sector::Food, "T056", 500),
    (Sector::Food, "T082", 300),
    (Sector::Food, "T121", 500),
    (Sector::Extraction, "T012", 300),
    (Sector::Extraction, "T036", 600),
    (Sector::Extraction, "T050", 400),
    (Sector::Extraction, "T063", 500),
    (Sector::Extraction, "T094", 800),
    (Sector::Extraction, "T121", 500),
    (Sector::Industry, "T016", 300),
    (Sector::Industry, "T044", 500),
    (Sector::Industry, "T062", 600),
    (Sector::Industry, "T066", 800),
    (Sector::Industry, "T071", 600),
    (Sector::Industry, "T082", 400),
    (Sector::Industry, "T101", 800),
    (Sector::Industry, "T107", 500),
    (Sector::Industry, "T113", 300),
    (Sector::Industry, "T116", 600),
    (Sector::Industry, "T122", 1_000),
    (Sector::Services, "T009", 300),
    (Sector::Services, "T026", 400),
    (Sector::Services, "T048", 500),
    (Sector::Services, "T113", 800),
    (Sector::Services, "T124", 1_000),
    (Sector::Services, "T122", 1_000),
    (Sector::Knowledge, "T048", 500),
    (Sector::Knowledge, "T113", 500),
    (Sector::Knowledge, "T116", 800),
    (Sector::Construction, "T024", 500),
    (Sector::Construction, "T050", 800),
    (Sector::Construction, "T067", 300),
    (Sector::Construction, "T094", 1_500),
    (Sector::Construction, "T121", 800),
];

/// Automation of qualified posts (`F_auto`): (sectors, technology, basis points).
pub const AUTO_BONUS: &[(&[Sector], &str, i64)] = &[
    (&[Sector::Industry], "T114", 1_000),
    (&[Sector::Services, Sector::Knowledge], "T116", 1_000),
    (&[Sector::Food, Sector::Extraction, Sector::Industry, Sector::Services, Sector::Knowledge, Sector::Construction], "T122", 2_500),
];

/// Established practices that raise a sector's productivity (the culture factor).
pub const PRACTICE_BONUS: &[(&str, &[Sector], i64)] = &[
    ("C005", &[Sector::Industry], 300),
    ("C006", &[Sector::Food], 300),
    ("C007", &[Sector::Food], 200),
    ("C017", &[Sector::Food], 400),
    ("C022", &[Sector::Industry], 300),
    ("C025", &[Sector::Services, Sector::Knowledge], 300),
    ("C026", &[Sector::Services], 500),
    ("C030", &[Sector::Industry], 400),
    ("C033", &[Sector::Industry], 800),
    ("C034", &[Sector::Industry], -200),
    ("C035", &[Sector::Industry], 500),
    ("C036", &[Sector::Services], 500),
    ("C041", &[Sector::Services], 300),
    ("C046", &[Sector::Food, Sector::Extraction, Sector::Industry, Sector::Services, Sector::Knowledge, Sector::Construction], 300),
    ("C049", &[Sector::Services], 500),
    ("C050", &[Sector::Services], 800),
];
/// Craft guilds (C018) raise industry until industrial employment (C033) replaces them.
pub const GUILDS: (&str, i64, &str) = ("C018", 500, "C033");

/// Doctrines of a region's majority faith (the religion factor): (belief, sectors, bp).
pub const DOCTRINE_BONUS: &[(&str, &[Sector], i64)] = &[
    ("shared_days", &[Sector::Construction], 500),
    ("sanctified_labour", &[Sector::Industry, Sector::Extraction], 500),
    ("stewardship", &[Sector::Food], 500),
    ("day_of_rest", &[Sector::Food, Sector::Extraction, Sector::Industry, Sector::Services, Sector::Knowledge, Sector::Construction], -300),
];
/// Field yield added by the Stewardship of the Land (basis points).
pub const STEWARDSHIP_YIELD_BP: i64 = 500;

/// The sector a works belongs to.
pub fn sector_of(def: &FacDef) -> Sector {
    if def.food {
        return Sector::Food;
    }
    match def.labor {
        Some(LaborCategory::Extraction) => Sector::Extraction,
        Some(LaborCategory::Industry) => Sector::Industry,
        Some(LaborCategory::Knowledge) => Sector::Knowledge,
        Some(LaborCategory::Construction) => Sector::Construction,
        Some(LaborCategory::Services) | None => Sector::Services,
    }
}

/// The era of a method: the latest era among the technologies it rests on.
pub fn recipe_era(r: &Recipe) -> u8 {
    r.era
}

/// The era of a field method.
pub fn field_method_era(i: usize) -> u8 {
    crate::sim::economy::FIELD_METHODS[i].techs.iter().map(|t| tech_era(t)).max().unwrap_or(0)
}

/// The era cap of the technology factor for a works: its own era, or the era of the
/// method it runs if later, plus one.
pub fn era_cap(def: &FacDef, method_era: u8) -> usize {
    (def.era.max(method_era) as usize + 1).min(ERA_CAPS - 1)
}

/// The class of a region's principal city for the city factor (design chapter 38,
/// section 2.1): until the cities slice, the region's settlement class.
pub fn city_class(w: &World, ri: usize) -> SettlementKind {
    settlement_class(w.regions[ri].population())
}

/// The city factor of one sector (design chapter 36, section 4.2): a capped
/// agglomeration effect on labour, from the city's class (for industry, services
/// and knowledge) and prosperity, less the cost of short water and poor health. A
/// function of its inputs so that later slices can add transport access and
/// agglomeration to them.
pub fn city_factor(class: SettlementKind, sector: Sector, prosperity_bp: i64, water_bp: i64, health_pressure_bp: i64) -> i64 {
    let class_bp = if matches!(sector, Sector::Industry | Sector::Services | Sector::Knowledge) {
        match class {
            SettlementKind::Wilderness | SettlementKind::Camp => 9_500,
            SettlementKind::Village => 10_000,
            SettlementKind::Town => 10_400,
            SettlementKind::City => 10_800,
            SettlementKind::Metropolis => 11_200,
            SettlementKind::Megalopolis => 11_400,
        }
    } else {
        10_000
    };
    let f = class_bp * (10_000 + 600 * prosperity_bp.clamp(0, 10_000) / 10_000) / 10_000;
    (f - 1_000 * (10_000 - water_bp.clamp(0, 10_000)) / 10_000 - health_pressure_bp.max(0) / 4).clamp(8_000, 12_500)
}

/// A seat's technology and automation factors, by sector and era cap (computed once
/// a month: they depend only on what it understands).
#[derive(Clone, Debug)]
pub struct CivTables {
    pub tech: [[i64; ERA_CAPS]; SECTORS],
    pub auto: [i64; SECTORS],
}

pub fn civ_tables(civ: &Civ) -> CivTables {
    let c = content();
    let mut tech = [[10_000i64; ERA_CAPS]; SECTORS];
    if neutral() {
        return CivTables { tech, auto: [10_000; SECTORS] };
    }
    for (sector, id, bp) in TECH_BONUS {
        let t = c.t(id);
        if civ.knows(t) {
            let era = c.techs[t].era as usize;
            for cap in era..ERA_CAPS {
                tech[sector.index()][cap] += bp;
            }
        }
    }
    let mut auto = [10_000i64; SECTORS];
    for (sectors, id, bp) in AUTO_BONUS {
        if civ.knows_id(id) {
            for s in sectors.iter() {
                auto[s.index()] += bp;
            }
        }
    }
    let cap = crate::sim::eras::auto_cap(civ);
    for a in auto.iter_mut() {
        *a = (*a).clamp(10_000, cap);
    }
    CivTables { tech, auto }
}

/// The factors of a region other than technology, by sector: education, culture,
/// religion, city and health (basis points each).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RegionFactors {
    pub edu: i64,
    pub cul: [i64; SECTORS],
    pub rel: [i64; SECTORS],
    pub city: [i64; SECTORS],
    pub health: i64,
}

impl RegionFactors {
    /// `LP` of a sector with a technology factor, bounded.
    pub fn lp(&self, sector: Sector, tech_bp: i64) -> i64 {
        let k = sector.index();
        let mut v = self.edu;
        for f in [self.cul[k], self.rel[k], tech_bp, self.city[k], self.health] {
            v = v * f / 10_000;
        }
        v.clamp(LP_MIN, LP_MAX)
    }
}

/// Share of working age holding a vocational or higher qualification, basis points.
pub fn skilled_share(r: &Region) -> i64 {
    let skilled: u64 = Qual::ALL.iter().filter(|q| !matches!(q, Qual::Literate | Qual::Lorekeeper)).map(|q| r.quals[q.index()] as u64).sum();
    (skilled * 10_000 / r.working().max(1) as u64).min(10_000) as i64
}

/// The majority lineage and faith of a region's people.
fn majority(r: &Region) -> (Option<u16>, Option<u16>) {
    let mut lin: Vec<(u16, u64)> = Vec::new();
    let mut rel: Vec<(Option<u16>, u64)> = Vec::new();
    for b in &r.blocks {
        let n = b.total() as u64;
        match lin.iter_mut().find(|x| x.0 == b.lineage) {
            Some(x) => x.1 += n,
            None => lin.push((b.lineage, n)),
        }
        match rel.iter_mut().find(|x| x.0 == b.religion) {
            Some(x) => x.1 += n,
            None => rel.push((b.religion, n)),
        }
    }
    let l = lin.iter().max_by_key(|x| (x.1, std::cmp::Reverse(x.0))).map(|x| x.0);
    let f = rel.iter().max_by_key(|x| (x.1, std::cmp::Reverse(x.0))).and_then(|x| x.0);
    (l, f)
}

/// The cultural tendency (axis) that drives a sector: Agricultural stewardship for
/// food, Industrial workmanship for industry and extraction, Urban organization for
/// services and construction, Revisability for knowledge.
pub fn tendency_axis(s: Sector) -> usize {
    match s {
        Sector::Food => 3,
        Sector::Extraction | Sector::Industry => 4,
        Sector::Services | Sector::Construction => 5,
        Sector::Knowledge => 1,
    }
}

/// Mean food access of a region over the last year, basis points.
pub fn food_access(r: &Region) -> i64 {
    r.food_hist.iter().map(|v| *v as i64).sum::<i64>() / 12
}

pub fn region_factors(w: &World, seat: SeatId, ri: usize) -> RegionFactors {
    if neutral() {
        return RegionFactors { edu: 10_000, cul: [10_000; SECTORS], rel: [10_000; SECTORS], city: [10_000; SECTORS], health: 10_000 };
    }
    let c = content();
    let civ = &w.civs[seat as usize];
    let r = &w.regions[ri];
    let lit = crate::sim::population::literate_share(r);
    let edu = 10_000 + 3_000 * lit / 10_000 + 2_000 * skilled_share(r) / 10_000;
    let (lineage, faith) = majority(r);
    let axes = lineage.and_then(|l| w.lineages.get(l as usize)).or_else(|| w.lineages.get(civ.lineage as usize)).map(|l| l.axes).unwrap_or([5_000; 8]);
    let mut cul = [10_000i64; SECTORS];
    let mut rel = [10_000i64; SECTORS];
    for s in Sector::ALL {
        let k = s.index();
        cul[k] += (axes[tendency_axis(*s)] as i64 - 5_000) / 5;
    }
    for (id, sectors, bp) in PRACTICE_BONUS {
        if civ.established(c.p(id)) {
            for s in sectors.iter() {
                cul[s.index()] += bp;
            }
        }
    }
    if civ.established(c.p(GUILDS.0)) && !civ.established(c.p(GUILDS.2)) {
        cul[Sector::Industry.index()] += GUILDS.1;
    }
    // charters and a golden age (design chapter 37, sections 3.3-3.4)
    for s in Sector::ALL {
        cul[s.index()] += crate::sim::eras::sector_lp_add(civ, *s, w.month);
    }
    if let Some(rl) = faith.and_then(|f| w.religions.get(f as usize)) {
        for (key, sectors, bp) in DOCTRINE_BONUS {
            if rl.beliefs.iter().any(|b| b == key) {
                for s in sectors.iter() {
                    rel[s.index()] += bp;
                }
            }
        }
    }
    for k in 0..SECTORS {
        cul[k] = cul[k].clamp(8_500, 13_000);
        rel[k] = rel[k].clamp(9_000, 11_500);
    }
    let pop = r.population() as i64;
    let water_bp = crate::util::ratio_bp(crate::sim::population::water_capacity(r) as i64, pop.max(1));
    let pressure = r.health_bp as i64;
    let class = city_class(w, ri);
    let mut city = [10_000i64; SECTORS];
    let trams = crate::sim::eras::tram_city_add(w, seat, ri);
    for s in Sector::ALL {
        city[s.index()] = city_factor(class, *s, 0, water_bp, pressure);
        if trams > 0 && matches!(s, Sector::Industry | Sector::Services | Sector::Knowledge) {
            city[s.index()] = (city[s.index()] + trams).min(13_000);
        }
    }
    let health = (10_000 - (10_000 - food_access(r).min(10_000)) / 2 - pressure / 4).clamp(6_000, 10_000) + crate::sim::eras::health_add(civ);
    RegionFactors { edu, cul, rel, city, health }
}

/// What the people's agricultural habits (Agricultural stewardship) and a faith of
/// stewards add to field yields, basis points (design chapter 36, section 4.2,
/// land yield factor; within the cap of twice the method).
pub fn field_land_bp(w: &World, seat: SeatId, ri: usize) -> i64 {
    if neutral() {
        return 10_000;
    }
    let r = &w.regions[ri];
    let (lineage, faith) = majority(r);
    let axis = lineage.or(Some(w.civs[seat as usize].lineage)).and_then(|l| w.lineages.get(l as usize)).map(|l| l.axes[3] as i64).unwrap_or(5_000);
    let doctrine = if faith.and_then(|f| w.religions.get(f as usize)).map(|f| f.beliefs.iter().any(|b| b == "stewardship")).unwrap_or(false) { STEWARDSHIP_YIELD_BP } else { 0 };
    10_000 + (axis - 5_000) / 10 + doctrine
}

/// General posts of `levels` levels under a method that needs `general_bp` of the
/// facility's general posts, after shared support (`saving_bp`) and productivity
/// (`lp_bp`), rounded up (design chapter 36, section 4.2).
pub fn general_posts_for(general: u32, levels: u32, general_bp: u16, saving_bp: u16, lp_bp: i64) -> u32 {
    let num = general as u128 * levels as u128 * general_bp.min(10_000) as u128 * (10_000 - saving_bp.min(10_000)) as u128 * 10_000;
    let den = 100_000_000u128 * lp_bp.clamp(LP_MIN, LP_MAX) as u128;
    ((num + den - 1) / den) as u32
}

/// Qualified posts `need` divided by the automation factor, rounded up.
pub fn qualified_posts_for(need: u32, lpq_bp: i64) -> u32 {
    ((need as u64 * 10_000 + lpq_bp.clamp(10_000, LPQ_MAX) as u64 - 1) / lpq_bp.clamp(10_000, LPQ_MAX) as u64) as u32
}

/// The breakdown of a region's productivity for its government (design chapter 36,
/// section 4.3): one view per sector, each factor named by what it rests on.
/// Factors from undiscovered technologies or unrecognized practices are never
/// named; a seat only ever gets bonuses from what it understands or established.
pub fn breakdown(w: &World, seat: SeatId, ri: usize) -> Vec<ProductivityView> {
    let c = content();
    let civ = &w.civs[seat as usize];
    let r = &w.regions[ri];
    let f = region_factors(w, seat, ri);
    let tables = civ_tables(civ);
    let lit = crate::sim::population::literate_share(r);
    let (lineage, faith) = majority(r);
    let pct = |bp: i64| format!("{}%", bp / 100);
    Sector::ALL
        .iter()
        .map(|s| {
            let k = s.index();
            let tech_bp = tables.tech[k][ERA_CAPS - 1];
            let mut factors = vec![FactorView { source: "education".into(), bp: f.edu as u32, detail: format!("Literate share {}, qualified share {}", pct(lit), pct(skilled_share(r))) }];
            let mut cul_detail = vec![format!("Tendency: {}", crate::content::TENDENCY_NAMES[tendency_axis(*s)])];
            for (id, sectors, _) in PRACTICE_BONUS {
                if sectors.contains(s) && civ.established(c.p(id)) {
                    cul_detail.push(format!("Practice: {}", c.practices[c.p(id)].name));
                }
            }
            if *s == Sector::Industry && civ.established(c.p(GUILDS.0)) && !civ.established(c.p(GUILDS.2)) {
                cul_detail.push(format!("Practice: {}", c.practices[c.p(GUILDS.0)].name));
            }
            cul_detail.extend(crate::sim::eras::sector_lp_notes(civ, *s, w.month));
            let _ = lineage;
            factors.push(FactorView { source: "culture".into(), bp: f.cul[k] as u32, detail: cul_detail.join("; ") });
            let mut rel_detail = Vec::new();
            if let Some(rl) = faith.and_then(|x| w.religions.get(x as usize)) {
                for (key, sectors, _) in DOCTRINE_BONUS {
                    if sectors.contains(s) && rl.beliefs.iter().any(|b| b == key) {
                        if let Some(b) = crate::content::BELIEFS.iter().find(|b| b.key == *key) {
                            rel_detail.push(format!("Doctrine: {}", b.name));
                        }
                    }
                }
            }
            factors.push(FactorView { source: "religion".into(), bp: f.rel[k] as u32, detail: if rel_detail.is_empty() { "No doctrine bearing on this work".into() } else { rel_detail.join("; ") } });
            let techs: Vec<String> = TECH_BONUS.iter().filter(|(x, id, _)| x == s && civ.knows_id(id)).map(|(_, id, _)| format!("Technology: {}", c.techs[c.t(id)].name)).collect();
            factors.push(FactorView { source: "technology".into(), bp: tech_bp as u32, detail: if techs.is_empty() { "No productivity technology yet".into() } else { format!("{} (works of older eras receive part)", techs.join("; ")) } });
            factors.push(FactorView { source: "city".into(), bp: f.city[k] as u32, detail: format!("{}: {} residents", city_class(w, ri).label(), crate::util::group(r.population() as i64)) });
            factors.push(FactorView { source: "health".into(), bp: f.health as u32, detail: format!("Food access {}, health pressure {}", pct(food_access(r)), pct(r.health_bp as i64)) });
            if tables.auto[k] > 10_000 {
                factors.push(FactorView { source: "automation".into(), bp: tables.auto[k] as u32, detail: "Applies to qualified posts".into() });
            }
            let saved = r.last.posts_saved.get(k).copied().unwrap_or(0);
            ProductivityView { sector: *s, total_bp: f.lp(*s, tech_bp) as u32, factors, posts_saved: saved }
        })
        .collect()
}
