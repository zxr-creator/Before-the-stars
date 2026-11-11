//! Cities, land and provisioning (design chapter 37, sections 8.6-8.8; chapter 38,
//! sections 2 and 4, simplified by chapter 41).
//!
//! Every region has one principal city derived from its residents: the urban share
//! of the residents (off-land work times how densely transport and housing let
//! people live), and the city's share of the townspeople (primacy, from the site).
//! The city holds no separate population. Land is a budget of land units: towns,
//! works and networks take it, mostly from the flat farmland around them.

use crate::content::{content, Cap, Site};
use crate::sim::network::{self, Mode};
use crate::state::*;
use bts_protocol::*;

/// Lower bound, in city residents, of each city class (design chapter 38, section 2.1).
pub const CITY_BOUNDS: [(SettlementKind, u32); 7] = [
    (SettlementKind::Wilderness, 0),
    (SettlementKind::Camp, 1),
    (SettlementKind::Village, 10_000),
    (SettlementKind::Town, 50_000),
    (SettlementKind::City, 250_000),
    (SettlementKind::Metropolis, 5_000_000),
    (SettlementKind::Megalopolis, 20_000_000),
];

pub fn class_of(city: u32) -> SettlementKind {
    let mut kind = SettlementKind::Wilderness;
    for (k, lower) in CITY_BOUNDS {
        if city >= lower {
            kind = k;
        }
    }
    kind
}

/// Base concentration and its cap, basis points (design 2.2).
pub const CONCENTRATION_BASE: i64 = 3_000;
pub const CONCENTRATION_CAP: i64 = 7_500;
pub const URBAN_SHARE_CAP: i64 = 9_500;
/// Residents per land unit who live without housing levels.
pub const INFORMAL_PER_LU: i64 = 400_000;
/// Residents any region can feed from the common stock without stores.
pub const PROVISION_BASE: i64 = 100_000;
/// Field levels lost to the city in a year at most.
pub const ENCROACH_PER_YEAR: u16 = 5;

/// Posts away from the land and posts in extraction, last month.
fn posts(r: &Region) -> (i64, i64) {
    let c = content();
    let (mut off, mut ext) = (0i64, 0i64);
    for f in &r.facilities {
        let def = &c.facilities[f.kind];
        if def.food {
            continue;
        }
        if def.labor == Some(LaborCategory::Extraction) {
            ext += f.staffed as i64;
        } else {
            off += f.staffed as i64;
        }
    }
    (off, ext)
}

/// The off-land share of work, basis points (design 2.2): posts outside food and
/// extraction, construction and teaching, over them and the food workers at a
/// productivity of one and the extraction posts. People without a post (in this
/// ruleset a large pool, half the adults or more) are taken to live as the
/// employed do, so they change no share (the design counts half of them as
/// townspeople; with so large a pool that would make every era's towns alike).
pub fn off_land_bp(r: &Region) -> i64 {
    let l = &r.last.labor;
    let (off, ext) = posts(r);
    let food = if r.last.food_equiv > 0 { r.last.food_equiv } else { l.food } as i64;
    let num = off + l.projects as i64 + l.teachers as i64;
    let den = num + food + ext;
    if den <= 0 {
        0
    } else {
        num * 10_000 / den
    }
}

/// Residents housed in apartment blocks and towers (dense housing).
fn dense_housed(r: &Region) -> i64 {
    let c = content();
    r.facilities
        .iter()
        .filter(|f| f.enabled && matches!(c.facilities[f.kind].key, "apartments" | "towers"))
        .map(|f| c.facilities[f.kind].provides.iter().filter(|(k, _)| *k == Cap::Housing).map(|(_, v)| v * f.level as i64).sum::<i64>())
        .sum()
}

/// Concentration (design 2.2), basis points, without and with its dense-housing term.
pub fn concentration_bp(r: &Region) -> i64 {
    let n = network::net(r);
    let mut c = CONCENTRATION_BASE;
    if n.has(Mode::Harbour) || r.site.navigable_river {
        c += 500;
    }
    if n.has(Mode::Rail) {
        c += 1_000;
    }
    if n.stage(Mode::Roads) >= 3 {
        c += 500;
    }
    c += (500 * n.levels(Mode::Transit) as i64).min(1_000);
    c.min(CONCENTRATION_CAP)
}

/// Share of a region's residents who live in its towns and city, basis points
/// (design chapter 38, section 2.2): `min(9,500, off-land share x concentration)`.
pub fn urban_share(r: &Region) -> i64 {
    let n = off_land_bp(r);
    let c0 = concentration_bp(r);
    let pop = r.population() as i64;
    let urban0 = pop * (n * c0 / 10_000).min(URBAN_SHARE_CAP) / 10_000;
    let dense = dense_housed(r);
    let housing = if urban0 > 0 { 1_500 * dense.min(urban0) / urban0 } else { 0 };
    let c = (c0 + housing).min(CONCENTRATION_CAP);
    (n * c / 10_000).min(URBAN_SHARE_CAP)
}

/// The static part of a region's site score (design 2.3): geography only.
pub fn site_static(r: &Region) -> i64 {
    let mut s = 0;
    if r.coastal {
        s += 800;
    }
    if r.natural_harbour {
        s += 700;
    }
    if r.site.navigable_river {
        s += 800;
    }
    if r.site.river_mouth {
        s += 600;
    }
    if r.site.confluence {
        s += 400;
    }
    s += match r.terrain {
        Terrain::Plains => 600,
        Terrain::Steppe => 300,
        Terrain::Forest => 200,
        Terrain::Hills => 0,
        Terrain::Marsh => -200,
        Terrain::Desert => -400,
        Terrain::Mountains => -600,
        Terrain::Tundra => -800,
    };
    s += match r.climate {
        ClimateZone::Temperate => 600,
        ClimateZone::Continental => 200,
        ClimateZone::Tropical => 0,
        ClimateZone::Arid => -200,
        ClimateZone::Polar => -1_000,
    };
    if r.water >= 4_000_000 {
        s += 300;
    }
    let ways = r.neighbors.iter().filter(|(_, k)| *k != LinkKind::Sea).count() as i64;
    s += ((ways - 3).max(0) * 150).min(600);
    s
}

/// The amenity part of the static site (coast, harbour, climate, fresh water):
/// what draws settlers whatever stands there (design 3.3).
pub fn site_amenity(r: &Region) -> i64 {
    let mut s = 0;
    if r.coastal {
        s += 800;
    }
    if r.natural_harbour {
        s += 700;
    }
    s += match r.climate {
        ClimateZone::Temperate => 600,
        ClimateZone::Continental => 200,
        ClimateZone::Tropical => 0,
        ClimateZone::Arid => -200,
        ClimateZone::Polar => -1_000,
    };
    if r.water >= 4_000_000 {
        s += 300;
    }
    s
}

/// Site score: static geography, worked resources and a transport hub.
pub fn site_score(r: &Region) -> i64 {
    let c = content();
    let worked: i64 = r.facilities.iter().filter(|f| f.level > 0 && matches!(c.facilities[f.kind].site, Site::Deposit(_))).map(|f| f.level as i64).sum();
    let n = network::net(r);
    let modern = [n.stage(Mode::Rail) >= 2, n.stage(Mode::Harbour) >= 3, n.stage(Mode::Roads) >= 3, n.stage(Mode::Air) >= 2].iter().filter(|x| **x).count() as i64;
    site_static(r) + (worked / 5 * 100).min(500) + ((modern - 1).max(0) * 300).min(900)
}

pub fn is_capital(w: &World, ri: usize) -> bool {
    w.regions[ri].controller.map(|s| w.civs[s as usize].capital as usize == ri).unwrap_or(false)
}

/// Share of the townspeople who live in the principal city, basis points (design 2.3).
pub fn primacy(w: &World, ri: usize) -> i64 {
    let r = &w.regions[ri];
    (3_000 + site_score(r) * 3 / 10 + if is_capital(w, ri) { 1_000 } else { 0 }).clamp(3_000, 5_000)
}

/// Residents of the region's principal city.
pub fn city_size(w: &World, ri: usize) -> u32 {
    let r = &w.regions[ri];
    let pop = r.population() as i64;
    (pop * urban_share(r) / 10_000 * primacy(w, ri) / 10_000) as u32
}

pub fn city_class(w: &World, ri: usize) -> SettlementKind {
    class_of(city_size(w, ri))
}

/// Weight of a city class in town mortality (design 2.2), basis points.
pub fn mortality_weight(class: SettlementKind) -> i64 {
    match class {
        SettlementKind::Wilderness | SettlementKind::Camp => 0,
        SettlementKind::Village => 3_000,
        SettlementKind::Town => 6_000,
        SettlementKind::City => 10_000,
        SettlementKind::Metropolis => 12_000,
        SettlementKind::Megalopolis => 13_000,
    }
}

/// Congestion of the city (design 2.5), basis points off its city factor, at most 1,500.
pub fn congestion_bp(r: &Region, city: i64) -> i64 {
    if city <= 0 {
        return 0;
    }
    let mobility = network::urban_mobility(r);
    1_500 * (city - mobility).max(0) / city
}

/// Access bonus of the city (design 2.5): the cities it reaches over its links to
/// regions at peace with it, weighted by the best mode, at most +600.
pub fn access_bonus(w: &World, ri: usize, city: i64) -> i64 {
    let r = &w.regions[ri];
    let mut sizes = vec![0u32; w.regions.len()];
    for (nb, _) in &r.neighbors {
        sizes[*nb as usize] = city_size(w, *nb as usize);
    }
    access_bonus_with(w, ri, city, &sizes)
}

/// Every region's principal city, residents.
pub fn city_sizes(w: &World) -> Vec<u32> {
    (0..w.regions.len()).map(|i| city_size(w, i)).collect()
}

/// [`access_bonus`] with the neighbours' city sizes already reckoned.
pub fn access_bonus_with(w: &World, ri: usize, city: i64, sizes: &[u32]) -> i64 {
    let r = &w.regions[ri];
    let Some(me) = r.controller else { return 0 };
    let a = network::net(r);
    let mut reach = 0i64;
    for (nb, kind) in &r.neighbors {
        let j = *nb as usize;
        let Some(other) = w.regions[j].controller else { continue };
        if other != me && w.at_war(me, other) {
            continue;
        }
        let b = network::net(&w.regions[j]);
        reach += sizes[j] as i64 * network::reach_weight(&a, &b, *kind) / 10_000;
    }
    (600 * reach / city.max(1_000_000)).min(600)
}

/// Defence factor a city gives its defenders, basis points over 10,000 (design 4.1).
pub fn urban_defence_bp(class: SettlementKind) -> i64 {
    match class {
        SettlementKind::Town => 500,
        SettlementKind::City => 1_500,
        SettlementKind::Metropolis => 2_500,
        SettlementKind::Megalopolis => 3_500,
        _ => 0,
    }
}

/// What a region's fortifications add against attackers of a tier (design 4.2).
pub fn fort_bp(r: &Region, attacker_tier: u8) -> i64 {
    let t = attacker_tier;
    let lv = |k: &str| r.fac(content().f(k)).map(|f| f.enabled && f.level > 0).unwrap_or(false);
    let mut best = 0;
    if lv("walls") {
        best = best.max(match t {
            0 | 1 => 3_000,
            2 => 1_500,
            _ => 0,
        });
    }
    if lv("bastion") {
        best = best.max(match t {
            0..=2 => 3_000,
            3 => 1_000,
            _ => 0,
        });
    }
    if lv("fortified_zone") {
        best = best.max(if t <= 5 { 1_500 } else { 500 });
    }
    best
}

/// The defender's factor in a battle at a region: terrain times the city and its
/// fortifications, at most twice (design 4.1).
pub fn defence_bp(w: &World, ri: usize, terrain_bp: i64, attacker_tier: u8) -> i64 {
    let class = city_class(w, ri);
    (terrain_bp * (10_000 + urban_defence_bp(class) + fort_bp(&w.regions[ri], attacker_tier)) / 10_000).min(20_000)
}

/// Months of uncontested control that capture a region (design 4.3).
pub fn capture_months(class: SettlementKind) -> u8 {
    match class {
        SettlementKind::City => 6,
        SettlementKind::Metropolis => 7,
        SettlementKind::Megalopolis => 8,
        _ => 5,
    }
}

// ---------------------------------------------------------------------------
// Land (design chapter 37, section 8.6)
// ---------------------------------------------------------------------------

/// Rough land by terrain, land units (provisional, scaled like arable land).
pub fn rough_land(t: Terrain) -> i64 {
    match t {
        Terrain::Plains => 90,
        Terrain::Forest => 90,
        Terrain::Marsh => 135,
        Terrain::Hills => 180,
        Terrain::Steppe => 270,
        Terrain::Tundra => 450,
        Terrain::Mountains => 480,
        Terrain::Desert => 675,
    }
}

/// How a region's land is used, thousandths of a land unit.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct LandUse {
    pub total: i64,
    pub arable: i64,
    pub urban: i64,
    pub industrial: i64,
    /// Arable land the town and works stand on.
    pub urban_on_arable: i64,
    pub farmland: i64,
    pub pasture: i64,
    pub forest: i64,
    pub wild: i64,
    /// Residents housed in housing levels and residents living informally.
    pub housed: i64,
    pub informal: i64,
}

impl LandUse {
    /// Arable land left for fields after the town and works, whole land units.
    pub fn arable_left(&self) -> u16 {
        ((self.arable - self.urban_on_arable).max(0) / 1000).min(u16::MAX as i64) as u16
    }
}

pub fn land_use(r: &Region) -> LandUse {
    let c = content();
    let pop = r.population() as i64;
    let urban_people = pop * urban_share(r) / 10_000;
    let housed = r.cap(Cap::Housing).min(urban_people);
    let informal = urban_people - housed;
    let (mut built, mut industrial, mut farmland, mut pasture, mut forest) = (0i64, 0i64, 0i64, 0i64, 0i64);
    for f in r.facilities.iter().filter(|f| f.level > 0) {
        let def = &c.facilities[f.kind];
        let lv = f.level as i64;
        if def.line == "housing" {
            built += lv * def.land_milli;
        } else {
            industrial += lv * def.land_milli;
        }
        match def.site {
            Site::Arable => farmland += lv * 1000,
            Site::Pasture => pasture += lv * 1000,
            Site::Forest => forest += lv * 1000,
            _ => {}
        }
    }
    let urban = built + informal * 1000 / INFORMAL_PER_LU;
    let arable = r.arable as i64 * 1000;
    let rough = rough_land(r.terrain) * 1000;
    let total = arable + r.pasture as i64 * 1000 + r.forest as i64 * 1000 + rough;
    let urban_on_arable = ((urban + industrial) * arable / (arable + rough).max(1)).min(arable);
    let wild = (total - urban - industrial - farmland - pasture - forest).max(0);
    LandUse { total, arable, urban, industrial, urban_on_arable, farmland, pasture, forest, wild, housed, informal }
}

/// Residents the region can feed from the common stock beyond what it grows:
/// `(100,000 + storage provisioning) x access / 10,000` (design 37 §8.8, 38 §2.4).
pub fn provision_capacity(r: &Region) -> i64 {
    (PROVISION_BASE + r.cap(Cap::Provision)) * network::access_bp(r) / 10_000
}

/// Residents the region can feed at most this month: its own food and what its
/// stores and carriage bring in.
pub fn feedable(r: &Region) -> i64 {
    r.last.food_made / crate::content::FOOD_PER_PERSON_MONTH + provision_capacity(r)
}

/// On 1 January: fields beyond the arable land the town leaves are given up, at
/// most five levels a year a region, a quarter of their bill recovered.
pub fn encroach(w: &mut World, seat: SeatId) {
    if w.month % 12 != 0 {
        return;
    }
    let c = content();
    let fields = c.f("fields");
    for ri in 0..w.regions.len() {
        if w.regions[ri].controller != Some(seat) {
            continue;
        }
        let r = &w.regions[ri];
        let left = land_use(r).arable_left();
        // other works on arable land share it with the fields
        let others: u16 = r.facilities.iter().filter(|f| f.kind != fields && c.facilities[f.kind].site == Site::Arable).map(|f| f.level).sum();
        let have = r.fac(fields).map(|f| f.level).unwrap_or(0);
        let room = left.saturating_sub(others);
        if have <= room {
            continue;
        }
        let lost = (have - room).min(ENCROACH_PER_YEAR);
        crate::sim::projects::demolish(w, seat, ri, fields, lost);
        let name = w.regions[ri].name.clone();
        crate::sim::chronicle::brief(w, seat, "warning", format!("Farmland lost to the city at {name}"), format!("{lost} level(s) of fields gave way to streets and works. Housing saves land."), Some(ri as RegionId), "economy");
    }
}
