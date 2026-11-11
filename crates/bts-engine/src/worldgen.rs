//! Seeded world generation: geography first, then resources, then starting societies.
//!
//! Only basic IEEE arithmetic and integer hashing are used, so a seed reproduces
//! the same world on every platform. The generated world is saved with the match;
//! replay never depends on regenerating it.

use crate::content::{content, RULESET_VERSION, CONTENT_VERSION, GENERATOR_VERSION};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

mod earthlike;

/// Starting population of a seat: `START_POP_MIN` plus up to `START_POP_SPREAD` people.
pub const START_POP_MIN: u32 = 236_000;
pub const START_POP_SPREAD: u32 = 12_000;
/// Relative size of each starting age: a young pyramid that thins evenly to sixty
/// and quickly after it, with nobody past seventy-four.
fn start_weight(age: usize) -> u64 {
    if age < 60 {
        100 - age as u64
    } else if age < 75 {
        30 - (age as u64 - 60) * 2
    } else {
        0
    }
}

/// `total` people laid out on the starting pyramid: each age gets its exact
/// proportional share, and the remainder of each division is carried to the next
/// age, so the cells sum to `total` and no age receives more than one extra person.
pub fn start_pyramid(total: u32) -> [u32; AGES] {
    let wsum: u64 = (0..AGES).map(start_weight).sum();
    let mut ages = [0u32; AGES];
    let mut rem: u64 = 0;
    for (age, cell) in ages.iter_mut().enumerate() {
        let x = total as u64 * start_weight(age) + rem;
        *cell = (x / wsum) as u32;
        rem = x % wsum;
    }
    ages
}

/// Lorekeepers and artisans among the first people.
pub const START_LOREKEEPERS: u32 = 14_000;
pub const START_ARTISANS: u32 = 8_000;
/// Residents the natural water of a home region supports at least.
pub const HOME_WATER_MIN: u32 = 2_600_000;
/// Natural water is drawn in thousands of residents.
const WATER_STEP: u32 = 1000;

pub(crate) struct Noise {
    pub(crate) key: u64,
}

impl Noise {
    fn lattice(&self, layer: u64, x: i64, y: i64) -> f64 {
        (draw(self.key, &[layer, x as u64, y as u64]) % 10_000) as f64 / 10_000.0
    }
    fn smooth(t: f64) -> f64 {
        t * t * (3.0 - 2.0 * t)
    }
    /// Value noise in 0..1 at the given cell size.
    fn value(&self, layer: u64, x: f64, y: f64, cell: f64) -> f64 {
        let gx = x / cell;
        let gy = y / cell;
        let x0 = gx.floor();
        let y0 = gy.floor();
        let tx = Self::smooth(gx - x0);
        let ty = Self::smooth(gy - y0);
        let (ix, iy) = (x0 as i64, y0 as i64);
        let a = self.lattice(layer, ix, iy);
        let b = self.lattice(layer, ix + 1, iy);
        let c = self.lattice(layer, ix, iy + 1);
        let d = self.lattice(layer, ix + 1, iy + 1);
        let top = a + (b - a) * tx;
        let bot = c + (d - c) * tx;
        top + (bot - top) * ty
    }
    fn fractal(&self, layer: u64, x: f64, y: f64, cell: f64) -> f64 {
        (self.value(layer, x, y, cell) * 4.0 + self.value(layer + 1, x, y, cell / 2.0) * 2.0 + self.value(layer + 2, x, y, cell / 4.0)) / 7.0
    }
    /// Value noise that repeats every `period` map units east-west (`period / cell`
    /// must be a whole number), so a wrapped map has no seam.
    fn value_wrapped(&self, layer: u64, x: f64, y: f64, cell: f64, period: f64) -> f64 {
        let p = (period / cell).round() as i64;
        let gx = x / cell;
        let gy = y / cell;
        let x0 = gx.floor();
        let y0 = gy.floor();
        let tx = Self::smooth(gx - x0);
        let ty = Self::smooth(gy - y0);
        let (ix, iy) = (x0 as i64, y0 as i64);
        let a = self.lattice(layer, ix.rem_euclid(p), iy);
        let b = self.lattice(layer, (ix + 1).rem_euclid(p), iy);
        let c = self.lattice(layer, ix.rem_euclid(p), iy + 1);
        let d = self.lattice(layer, (ix + 1).rem_euclid(p), iy + 1);
        let top = a + (b - a) * tx;
        let bot = c + (d - c) * tx;
        top + (bot - top) * ty
    }
    pub(crate) fn fractal_wrapped(&self, layer: u64, x: f64, y: f64, cell: f64, period: f64) -> f64 {
        (self.value_wrapped(layer, x, y, cell, period) * 4.0 + self.value_wrapped(layer + 1, x, y, cell / 2.0, period) * 2.0 + self.value_wrapped(layer + 2, x, y, cell / 4.0, period)) / 7.0
    }
}

#[derive(Clone)]
pub(crate) struct Cell {
    x: f64,
    y: f64,
    poly: Vec<(f64, f64)>,
    edges: Vec<i32>,
    elev: f64,
    land: bool,
}

/// Clip the polygon of `site` against the bisector with `other`, keeping the side nearer `site`.
pub(crate) fn clip(poly: &[(f64, f64)], edges: &[i32], sx: f64, sy: f64, ox: f64, oy: f64, label: i32) -> (Vec<(f64, f64)>, Vec<i32>) {
    let mx = (sx + ox) / 2.0;
    let my = (sy + oy) / 2.0;
    let nx = ox - sx;
    let ny = oy - sy;
    let side = |p: (f64, f64)| (p.0 - mx) * nx + (p.1 - my) * ny;
    let n = poly.len();
    let mut out = Vec::with_capacity(n + 2);
    let mut out_e = Vec::with_capacity(n + 2);
    for i in 0..n {
        let a = poly[i];
        let b = poly[(i + 1) % n];
        let da = side(a);
        let db = side(b);
        let e = edges[i];
        if da <= 0.0 {
            out.push(a);
            if db <= 0.0 {
                out_e.push(e);
            } else {
                // leaving the kept half-plane: edge a->x keeps label e, then x->next is the new bisector edge
                let t = da / (da - db);
                out_e.push(e);
                out.push((a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t));
                out_e.push(label);
            }
        } else if db <= 0.0 {
            let t = da / (da - db);
            out.push((a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t));
            out_e.push(e);
        }
    }
    (out, out_e)
}

const SYL_A: &[&str] = &["Ar", "Bel", "Cor", "Dun", "El", "Fen", "Gal", "Hal", "Is", "Kar", "Lor", "Mar", "Nor", "Or", "Pel", "Quen", "Ras", "Sel", "Tor", "Ul", "Val", "Wen", "Yar", "Zan", "Ash", "Bry", "Cal", "Dor", "Eth", "Fal"];
const SYL_B: &[&str] = &["a", "e", "i", "o", "u", "an", "en", "in", "or", "ar", "el", "ir", "os", "um", "eth", "ay"];
const SYL_C: &[&str] = &["dale", "mere", "ford", "haven", "reach", "wold", "mark", "holm", "moor", "crest", "vale", "strand", "fell", "gate", "run", "watch", "rest", "deep", "rise", "bank"];
const CIV_ROOTS: &[(&str, &str)] = &[
    ("Riverland", "Riverlander"), ("Clearbay", "Clearbay"), ("Greenreach", "Greenreach"), ("Farcape", "Farcaper"),
    ("Highmere", "Highmere"), ("Stonewold", "Stonewolder"), ("Amberfen", "Amberfen"), ("Longstrand", "Longstrander"),
    ("Sunmarch", "Sunmarcher"), ("Ironvale", "Ironvaler"), ("Westerholm", "Westerholmer"), ("Duskmoor", "Duskmoorer"),
];
pub const CIV_COLORS: [&str; 10] = ["#c1503a", "#2f73a0", "#5c8a36", "#8a59a8", "#c08a2a", "#2a9a9a", "#a8507a", "#6a6a3a", "#4a5aa8", "#8a4a2a"];

pub(crate) fn region_name(secret: u64, i: usize, used: &mut Vec<String>) -> String {
    for attempt in 0..20u64 {
        let a = SYL_A[draw_range(secret, &[stream("name"), i as u64, attempt, 0], SYL_A.len() as u64) as usize];
        let b = SYL_B[draw_range(secret, &[stream("name"), i as u64, attempt, 1], SYL_B.len() as u64) as usize];
        let c = SYL_C[draw_range(secret, &[stream("name"), i as u64, attempt, 2], SYL_C.len() as u64) as usize];
        let name = if draw_range(secret, &[stream("name"), i as u64, attempt, 3], 3) == 0 { format!("{a}{c}") } else { format!("{a}{b}{c}") };
        if !used.contains(&name) {
            used.push(name.clone());
            return name;
        }
    }
    format!("Region {i}")
}

pub(crate) fn rng_between(secret: u64, addr: &[u64], lo: i64, hi: i64) -> i64 {
    if hi <= lo {
        return lo;
    }
    lo + draw_range(secret, addr, (hi - lo + 1) as u64) as i64
}

pub fn derive_secret(cfg: &MatchConfig, entropy: u64) -> u64 {
    let label = format!("{}|{}|{}|{}|{}", cfg.seed.trim().to_lowercase(), cfg.regions, CONTENT_VERSION, RULESET_VERSION, GENERATOR_VERSION);
    let base = fnv(label.as_bytes());
    if cfg.public_seed {
        base
    } else {
        draw(base, &[entropy, stream("server-entropy")])
    }
}

/// A generated home world before resources and people: regions with their
/// geography and links, plus the geology the resource placement reads. Every map
/// source (the classic flat map, the generated Earth-like planet, and later the
/// real Earth) produces one of these; everything after it is shared.
pub(crate) struct Geo {
    pub regions: Vec<Region>,
    pub width: i32,
    pub height: i32,
    /// The map wraps east-west.
    pub wrap: bool,
    /// Geology of each region, for resource placement.
    pub tags: Vec<GeoTag>,
    /// Moisture of each region, 0-255 (river sources prefer wet highlands).
    pub moist: Vec<u8>,
    /// For each region, the ocean cells it borders (sea links join regions sharing one).
    pub ocean: Vec<Vec<usize>>,
    /// Polygon edges of each region facing open sea.
    pub coast_edges: Vec<u8>,
    /// Longest sea crossing a sea link may span, in map units.
    pub sea_reach: i64,
}

/// What lies under a region, as resource placement needs it (design chapter 37,
/// section 5.1, step 6).
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct GeoTag {
    /// A convergent orogenic belt: porphyry copper, granite tin, ore veins.
    pub belt: bool,
    /// An old continental shield: iron formations, uranium, rare earths.
    pub shield: bool,
    /// A sedimentary basin: coal in wet lowlands, oil and gas, evaporites.
    pub basin: bool,
    /// A rift or divergent margin.
    pub rift: bool,
}

/// Squared distance between two map points; on a wrapped map the shorter way round.
pub(crate) fn dist2(a: [i32; 2], b: [i32; 2], wrap_w: i32) -> i64 {
    let mut dx = (a[0] - b[0]).abs() as i64;
    if wrap_w > 0 {
        dx = dx.min(wrap_w as i64 - dx);
    }
    let dy = (a[1] - b[1]) as i64;
    dx * dx + dy * dy
}

/// The land attributes of a region of a terrain: arable land three times generator
/// 1.2's (design chapter 36, section 3.3), pasture, wild food in thousands of
/// rations, forest, natural water in thousands of residents, hydro sites. Shared
/// by every map source, so that a region of a kind is as productive on any map.
pub(crate) fn terrain_attrs(secret: u64, rid: usize, terrain: Terrain) -> (i64, i64, i64, i64, i64, i64) {
    let a = |k: u64, lo: i64, hi: i64| rng_between(secret, &[stream("attr"), rid as u64, k], lo, hi);
    match terrain {
        Terrain::Plains => (3 * a(0, 30, 55), a(1, 15, 30), a(2, 380, 520), a(3, 4, 10), a(4, 1500, 3000), a(5, 0, 2)),
        Terrain::Hills => (3 * a(0, 10, 22), a(1, 20, 35), a(2, 300, 420), a(3, 8, 16), a(4, 1000, 2000), a(5, 4, 8)),
        Terrain::Mountains => (3 * a(0, 2, 6), a(1, 6, 14), a(2, 150, 240), a(3, 4, 10), a(4, 800, 1500), a(5, 8, 16)),
        Terrain::Forest => (3 * a(0, 12, 24), a(1, 6, 12), a(2, 450, 600), a(3, 20, 36), a(4, 1500, 2500), a(5, 1, 3)),
        Terrain::Marsh => (3 * a(0, 10, 22), a(1, 4, 8), a(2, 420, 560), a(3, 6, 12), a(4, 2500, 4000), a(5, 0, 2)),
        Terrain::Steppe => (3 * a(0, 8, 16), a(1, 35, 55), a(2, 260, 360), a(3, 2, 5), a(4, 600, 1200), a(5, 1, 4)),
        Terrain::Desert => (3 * a(0, 0, 4), a(1, 4, 10), a(2, 90, 160), a(3, 0, 2), a(4, 200, 500), a(5, 0, 3)),
        Terrain::Tundra => (3 * a(0, 0, 3), a(1, 6, 12), a(2, 160, 260), a(3, 2, 8), a(4, 800, 1500), a(5, 1, 4)),
    }
}

/// A region of the given geography with its land attributes and nothing on it.
#[allow(clippy::too_many_arguments)]
pub(crate) fn new_region(secret: u64, rid: usize, used_names: &mut Vec<String>, poly: Vec<[i32; 2]>, center: [i32; 2], terrain: Terrain, climate: ClimateZone, coastal: bool, height: f64) -> Region {
    let (arable, pasture, wild, forest, water, hydro) = terrain_attrs(secret, rid, terrain);
    let a = |k: u64, lo: i64, hi: i64| rng_between(secret, &[stream("attr"), rid as u64, k], lo, hi);
    Region {
        id: rid as RegionId,
        name: region_name(secret, rid, used_names),
        poly,
        center,
        neighbors: Vec::new(),
        terrain,
        coastal,
        river: false,
        elevation: (height.clamp(0.0, 1.0) * 255.0) as u8,
        arable: arable as u16,
        pasture: pasture as u16,
        wild: wild * 1000,
        fishery: if coastal { a(6, 8, 16) as u16 } else { 0 },
        forest: forest as u16,
        water: water as u32 * WATER_STEP,
        hydro: hydro as u16,
        deposits: vec![],
        owner: None,
        controller: None,
        blocks: vec![],
        quals: [0; NQ],
        facilities: vec![],
        nutrition_debt: 0,
        health_bp: 0,
        unrest_bp: 0,
        food_hist: [10_000; 12],
        water_hist: [10_000; 12],
        capture: None,
        occupied_since: None,
        last: RegionMonth::default(),
        students: 0,
        teachers: [0; NQ],
        migr_rem: 0,
        outbreak: None,
        immune_until: 0,
        army_seen: 0,
        climate,
        site: SiteData::default(),
        spice_land: 0,
        bonuses: Vec::new(),
        natural_harbour: false,
        city_name: String::new(),
        city_at: center,
    }
}

/// The climate zone the classic map assigns from terrain and latitude (it has no
/// climate model of its own).
fn classic_climate(terrain: Terrain, lat: f64) -> ClimateZone {
    match terrain {
        Terrain::Tundra => ClimateZone::Polar,
        Terrain::Desert | Terrain::Steppe => ClimateZone::Arid,
        _ if lat < 0.30 => ClimateZone::Tropical,
        _ if lat > 0.62 => ClimateZone::Continental,
        _ => ClimateZone::Temperate,
    }
}

/// The flat map of ruleset 2.0 (generator 1.x geometry): jittered Voronoi cells on a
/// 1,600 x 1,000 rectangle, one land blob, noise terrain. Kept for fixtures.
fn classic_geography(cfg: &MatchConfig, secret: u64) -> Geo {
    const W: f64 = 1600.0;
    const H: f64 = 1000.0;
    let noise = Noise { key: draw(secret, &[stream("terrain")]) };
    let want = cfg.regions.max(8) as usize;
    let total_cells = want * 9 / 5;
    let cols = isqrt((total_cells as f64 * 1.6) as i64).max(4) as usize;
    let rows = (total_cells + cols - 1) / cols;
    let cw = W / cols as f64;
    let ch = H / rows as f64;
    let mut cells: Vec<Cell> = Vec::new();
    for r in 0..rows {
        for c in 0..cols {
            let i = (r * cols + c) as u64;
            let jx = (draw(secret, &[stream("site"), i, 0]) % 1000) as f64 / 1000.0;
            let jy = (draw(secret, &[stream("site"), i, 1]) % 1000) as f64 / 1000.0;
            let x = (c as f64 + 0.18 + jx * 0.64) * cw;
            let y = (r as f64 + 0.18 + jy * 0.64) * ch;
            cells.push(Cell { x, y, poly: vec![], edges: vec![], elev: 0.0, land: false });
        }
    }
    let n = cells.len();
    for i in 0..n {
        let mut poly = vec![(0.0, 0.0), (W, 0.0), (W, H), (0.0, H)];
        let mut edges = vec![-1, -1, -1, -1];
        let (sx, sy) = (cells[i].x, cells[i].y);
        for j in 0..n {
            if i == j {
                continue;
            }
            let (ox, oy) = (cells[j].x, cells[j].y);
            let d2 = (ox - sx) * (ox - sx) + (oy - sy) * (oy - sy);
            if d2 > (cw * 3.2) * (cw * 3.2) + (ch * 3.2) * (ch * 3.2) {
                continue;
            }
            let (p, e) = clip(&poly, &edges, sx, sy, ox, oy, j as i32);
            poly = p;
            edges = e;
        }
        cells[i].poly = poly;
        cells[i].edges = edges;
    }
    for c in cells.iter_mut() {
        let dx = (c.x - W / 2.0) / (W / 2.0);
        let dy = (c.y - H / 2.0) / (H / 2.0);
        let edge = 1.0 - (dx * dx * 0.55 + dy * dy * 0.75);
        c.elev = noise.fractal(10, c.x, c.y, 420.0) * 0.75 + edge * 0.35;
    }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|a, b| cells[*b].elev.partial_cmp(&cells[*a].elev).unwrap().then(a.cmp(b)));
    for &i in order.iter().take(want) {
        cells[i].land = true;
    }
    let land: Vec<usize> = (0..n).filter(|i| cells[*i].land).collect();
    let mut id_of = vec![usize::MAX; n];
    for (rid, &ci) in land.iter().enumerate() {
        id_of[ci] = rid;
    }
    let elevs: Vec<f64> = land.iter().map(|i| cells[*i].elev).collect();
    let emin = elevs.iter().cloned().fold(f64::MAX, f64::min);
    let emax = elevs.iter().cloned().fold(f64::MIN, f64::max);
    let mut used_names = Vec::new();
    let mut regions: Vec<Region> = Vec::new();
    let mut tags = Vec::new();
    let mut moist_v = Vec::new();
    let mut ocean = Vec::new();
    let mut coast_edges = Vec::new();
    for (rid, &ci) in land.iter().enumerate() {
        let c = &cells[ci];
        let e01 = if emax > emin { (c.elev - emin) / (emax - emin) } else { 0.5 };
        let rough = noise.fractal(20, c.x, c.y, 260.0);
        let height = (e01 * 0.55 + rough * 0.6).min(1.0);
        let moist = noise.fractal(30, c.x, c.y, 380.0);
        let lat = (c.y - H / 2.0).abs() / (H / 2.0);
        let coastal = c.edges.iter().any(|e| *e < 0 || !cells[*e as usize].land);
        let terrain = if height > 0.78 {
            Terrain::Mountains
        } else if lat > 0.86 {
            Terrain::Tundra
        } else if height > 0.62 {
            Terrain::Hills
        } else if moist < 0.36 {
            if lat < 0.45 { Terrain::Desert } else { Terrain::Steppe }
        } else if moist > 0.60 {
            if height < 0.40 && coastal { Terrain::Marsh } else { Terrain::Forest }
        } else if moist < 0.44 {
            Terrain::Steppe
        } else {
            Terrain::Plains
        };
        let poly: Vec<[i32; 2]> = c.poly.iter().map(|p| [p.0.round() as i32, p.1.round() as i32]).collect();
        let mut r = new_region(secret, rid, &mut used_names, poly, [c.x.round() as i32, c.y.round() as i32], terrain, classic_climate(terrain, lat), coastal, height);
        for e in &c.edges {
            if *e >= 0 && id_of[*e as usize] != usize::MAX {
                let o = id_of[*e as usize];
                if !r.neighbors.iter().any(|(x, _)| *x as usize == o) {
                    r.neighbors.push((o as RegionId, LinkKind::Land));
                }
            }
        }
        regions.push(r);
        let rough_land = matches!(terrain, Terrain::Hills | Terrain::Mountains);
        tags.push(GeoTag {
            belt: rough_land,
            shield: matches!(terrain, Terrain::Plains | Terrain::Hills | Terrain::Tundra) && !coastal,
            basin: matches!(terrain, Terrain::Plains | Terrain::Steppe | Terrain::Desert | Terrain::Marsh | Terrain::Forest) && height < 0.5,
            rift: false,
        });
        moist_v.push((moist * 255.0) as u8);
        ocean.push(c.edges.iter().filter(|e| **e >= 0 && !cells[**e as usize].land).map(|e| *e as usize).collect());
        coast_edges.push(c.edges.iter().filter(|e| **e < 0 || !cells[**e as usize].land).count().min(255) as u8);
    }
    Geo { regions, width: W as i32, height: H as i32, wrap: false, tags, moist: moist_v, ocean, coast_edges, sea_reach: (cw * 2.6) as i64 }
}

/// A region becomes a river region: more arable land, water, hydro sites,
/// fishing and wild food.
fn make_river(r: &mut Region, i: usize, secret: u64) {
    if r.river {
        return;
    }
    r.river = true;
    let b = |k: u64, lo: i64, hi: i64| rng_between(secret, &[stream("riverattr"), i as u64, k], lo, hi);
    r.arable += 3 * b(0, 6, 12) as u16;
    r.water += b(1, 1200, 2200) as u32 * WATER_STEP;
    r.hydro += b(2, 4, 8) as u16;
    r.fishery += b(3, 3, 6) as u16;
    r.wild += b(4, 40, 90) * 1000;
}

/// Rivers, mountain passes, sea links and connectivity, and the site data: the
/// part of geography every map source shares.
fn finish_geography(geo: &mut Geo, secret: u64) {
    let nr = geo.regions.len();
    let wrap_w = if geo.wrap { geo.width } else { 0 };
    // --- rivers: flow from high wet regions downhill to the coast -------------
    let regions = &mut geo.regions;
    let mut sources: Vec<usize> = (0..nr).filter(|i| matches!(regions[*i].terrain, Terrain::Mountains | Terrain::Hills)).collect();
    // wet highlands first: rivers rise where rain falls on high ground
    sources.sort_by_key(|i| (std::cmp::Reverse(regions[*i].elevation as u32 + geo.moist[*i] as u32 / 2), *i));
    let river_count = (nr / 7).max(3);
    for (k, &src) in sources.iter().take(river_count).enumerate() {
        let mut cur = src;
        let mut steps = 0;
        loop {
            regions[cur].river = true;
            if regions[cur].coastal && steps > 0 {
                break;
            }
            let mut next: Option<usize> = None;
            let mut best = regions[cur].elevation as i32 + 6;
            for (nb, kind) in regions[cur].neighbors.clone() {
                if kind == LinkKind::Sea {
                    continue;
                }
                let nb = nb as usize;
                let e = regions[nb].elevation as i32 - (draw_range(secret, &[stream("river"), k as u64, nb as u64], 12) as i32);
                if e < best && !(regions[nb].river && steps > 0 && regions[nb].elevation >= regions[cur].elevation) {
                    best = e;
                    next = Some(nb);
                }
            }
            match next {
                Some(nb) => {
                    for l in regions[cur].neighbors.iter_mut() {
                        if l.0 as usize == nb {
                            l.1 = LinkKind::River;
                        }
                    }
                    for l in regions[nb].neighbors.iter_mut() {
                        if l.0 as usize == cur {
                            l.1 = LinkKind::River;
                        }
                    }
                    if regions[nb].river {
                        break;
                    }
                    cur = nb;
                }
                None => break,
            }
            steps += 1;
            if steps > 12 {
                break;
            }
        }
    }
    for i in 0..nr {
        if regions[i].river {
            regions[i].river = false;
            make_river(&mut regions[i], i, secret);
        }
        if regions[i].coastal {
            regions[i].wild += 70_000;
        }
        // Mountain links are passes.
        let mountain = regions[i].terrain == Terrain::Mountains;
        let nbs: Vec<usize> = regions[i].neighbors.iter().map(|(n, _)| *n as usize).collect();
        for (k, nb) in nbs.iter().enumerate() {
            if (mountain || regions[*nb].terrain == Terrain::Mountains) && regions[i].neighbors[k].1 == LinkKind::Land {
                regions[i].neighbors[k].1 = LinkKind::Pass;
            }
        }
    }
    // --- sea links ---------------------------------------------------------------
    for i in 0..nr {
        if !regions[i].coastal {
            continue;
        }
        for j in (i + 1)..nr {
            if !regions[j].coastal || regions[i].neighbors.iter().any(|(n, _)| *n as usize == j) {
                continue;
            }
            let shared_sea = geo.ocean[i].iter().any(|e| geo.ocean[j].contains(e));
            if shared_sea && dist2(regions[i].center, regions[j].center, wrap_w) < geo.sea_reach * geo.sea_reach {
                regions[i].neighbors.push((j as RegionId, LinkKind::Sea));
                regions[j].neighbors.push((i as RegionId, LinkKind::Sea));
            }
        }
    }
    // Connect any isolated components with a sea link between their nearest members.
    loop {
        let mut comp = vec![usize::MAX; nr];
        let mut count = 0;
        for s in 0..nr {
            if comp[s] != usize::MAX {
                continue;
            }
            let mut stack = vec![s];
            comp[s] = count;
            while let Some(x) = stack.pop() {
                for (nb, _) in &regions[x].neighbors {
                    if comp[*nb as usize] == usize::MAX {
                        comp[*nb as usize] = count;
                        stack.push(*nb as usize);
                    }
                }
            }
            count += 1;
        }
        if count <= 1 {
            break;
        }
        let mut best = (i64::MAX, 0usize, 0usize);
        for i in 0..nr {
            for j in 0..nr {
                if comp[i] == 0 && comp[j] != 0 {
                    // prefer coasts: a crossing between two shores
                    let shore = if regions[i].coastal && regions[j].coastal { 1 } else { 4 };
                    let d = dist2(regions[i].center, regions[j].center, wrap_w) * shore;
                    if d < best.0 {
                        best = (d, i, j);
                    }
                }
            }
        }
        let (_, i, j) = best;
        regions[i].coastal = true;
        regions[j].coastal = true;
        if regions[i].fishery == 0 {
            regions[i].fishery = 8;
        }
        if regions[j].fishery == 0 {
            regions[j].fishery = 8;
        }
        regions[i].neighbors.push((j as RegionId, LinkKind::Sea));
        regions[j].neighbors.push((i as RegionId, LinkKind::Sea));
    }
    // --- site data: plain world data for later rules on cities and harbours -------
    for i in 0..nr {
        let r = &regions[i];
        let land_nbrs = r.neighbors.iter().filter(|(_, k)| *k != LinkKind::Sea).count() as i64;
        let river_links = r.neighbors.iter().filter(|(_, k)| *k == LinkKind::River).count();
        let coast = geo.coast_edges[i].max(if r.coastal { 1 } else { 0 });
        let jitter = |k: u64, lo: i64, hi: i64| rng_between(secret, &[stream("site-data"), i as u64, k], lo, hi);
        // a coast with land on several sides is sheltered; a long open coast is exposed
        let harbour = if r.coastal { (4000 + 1800 * land_nbrs.min(3) - 700 * (coast as i64 - 3).max(0) + jitter(0, -1500, 1500)).clamp(800, 10_000) } else { 0 };
        let flat = match r.terrain {
            Terrain::Plains => jitter(1, 8000, 9500),
            Terrain::Steppe => jitter(1, 7000, 9000),
            Terrain::Desert => jitter(1, 6000, 8000),
            Terrain::Marsh | Terrain::Forest | Terrain::Tundra => jitter(1, 5000, 7000),
            Terrain::Hills => jitter(1, 3000, 5000),
            Terrain::Mountains => jitter(1, 1000, 2500),
        };
        let mut amenity: i64 = match r.climate {
            ClimateZone::Temperate => 8000,
            ClimateZone::Tropical => 6500,
            ClimateZone::Continental => 5500,
            ClimateZone::Arid => 3500,
            ClimateZone::Polar => 1500,
        };
        amenity += match r.terrain {
            Terrain::Mountains => -1500,
            Terrain::Marsh | Terrain::Desert => -1000,
            Terrain::Plains => 500,
            _ => 0,
        };
        if r.coastal {
            amenity += 800;
        }
        if r.river {
            amenity += 500;
        }
        let site = SiteData {
            coast_edges: if r.coastal { coast } else { 0 },
            harbour_bp: harbour as u16,
            navigable_river: r.river && !matches!(r.terrain, Terrain::Mountains | Terrain::Hills),
            river_mouth: r.river && r.coastal,
            confluence: river_links >= 3,
            flat_bp: flat as u16,
            amenity_bp: amenity.clamp(0, 10_000) as u16,
            resource_bp: 0,
        };
        regions[i].site = site;
    }
    // natural harbours: about a third of coasts, three in five river mouths
    for i in 0..nr {
        let r = &regions[i];
        if !r.coastal {
            continue;
        }
        let chance = if r.site.river_mouth { 6_000 } else { 2_000 + r.site.harbour_bp as u64 / 6 };
        if draw_range(secret, &[stream("natural-harbour"), i as u64], 10_000) < chance {
            regions[i].natural_harbour = true;
            regions[i].site.harbour_bp = regions[i].site.harbour_bp.max(7_000);
        }
    }
    // the principal city: named, and placed on the shore (seaward of the centre, away
    // from the land neighbours) or on the river at the centre
    let mut used = regions.iter().map(|r| r.name.clone()).collect::<Vec<_>>();
    for i in 0..nr {
        regions[i].city_name = city_name(secret, i, regions[i].coastal, &mut used);
        let c = regions[i].center;
        let mut at = c;
        if regions[i].coastal && !regions[i].poly.is_empty() {
            let land: Vec<[i32; 2]> = regions[i].neighbors.iter().filter(|(_, k)| *k != LinkKind::Sea).map(|(n, _)| regions[*n as usize].center).collect();
            let near_land = |p: [i32; 2]| -> i64 { land.iter().map(|q| dist2(p, *q, wrap_w)).min().unwrap_or(0) };
            // the polygon is contiguous around its centre, so plain offsets apply
            let v = *regions[i].poly.iter().max_by_key(|p| (near_land(**p), -(p[0] as i64), -(p[1] as i64))).unwrap();
            at = [c[0] + (v[0] - c[0]) * 6 / 10, c[1] + (v[1] - c[1]) * 6 / 10];
            if wrap_w > 0 {
                at[0] = at[0].rem_euclid(wrap_w);
            }
        }
        regions[i].city_at = at;
    }
}

const CITY_A: &[&str] = &["Ast", "Bran", "Cer", "Dal", "Esk", "Fair", "Gor", "Hav", "Ister", "Jor", "Kel", "Lun", "Mor", "Ner", "Oss", "Pra", "Riv", "Sol", "Tam", "Ur", "Ves", "Wyn", "Xan", "Yor", "Zel", "Ald", "Bel", "Cas", "Dor", "Emb"];
const CITY_B: &[&str] = &["", "a", "e", "i", "o", "an", "er", "in", "ol", "ur"];
const CITY_C: &[&str] = &["ton", "burg", "ia", "polis", "grad", "by", "heim", "ora", "ium", "stad", "ville", "akar", "ost", "ene"];
const CITY_COAST: &[&str] = &["port", "mouth", "haven", "quay"];

/// A name for a region's principal city, distinct from every region and city name.
fn city_name(secret: u64, i: usize, coastal: bool, used: &mut Vec<String>) -> String {
    for attempt in 0..20u64 {
        let d = |k: u64, n: usize| draw_range(secret, &[stream("city-name"), i as u64, attempt, k], n as u64) as usize;
        let a = CITY_A[d(0, CITY_A.len())];
        let b = CITY_B[d(1, CITY_B.len())];
        let c = if coastal && d(3, 3) == 0 { CITY_COAST[d(2, CITY_COAST.len())] } else { CITY_C[d(2, CITY_C.len())] };
        let name = format!("{a}{b}{c}");
        if !used.contains(&name) {
            used.push(name.clone());
            return name;
        }
    }
    format!("City {i}")
}

/// Sea links between subpolar or polar regions that ice closes: seasonally where
/// both ends lie beyond 52 degrees of latitude, for most of the year where both lie
/// beyond 62 or both are polar.
fn ice_links(regions: &[Region], height: i32) -> Vec<IceLink> {
    let lat = |r: &Region| -> i64 { (90 - r.center[1] as i64 * 180 / height.max(1) as i64).abs() };
    let mut out = Vec::new();
    for r in regions {
        for (n, k) in &r.neighbors {
            let o = &regions[*n as usize];
            if *k != LinkKind::Sea || o.id <= r.id {
                continue;
            }
            let (la, lb) = (lat(r), lat(o));
            let polar = r.climate == ClimateZone::Polar && o.climate == ClimateZone::Polar;
            if la.min(lb) > 62 || polar {
                out.push(IceLink { a: r.id, b: o.id, permanent: true });
            } else if la.min(lb) > 52 {
                out.push(IceLink { a: r.id, b: o.id, permanent: false });
            }
        }
    }
    out
}

/// Mineral wealth within one link of each region, in basis points of the richest:
/// recorded as site data once deposits are placed.
fn resource_proximity(regions: &mut [Region]) {
    let weight = |d: &DepositState| -> i64 {
        let w = match d.kind {
            Deposit::CopperOre | Deposit::IronOre | Deposit::Coal | Deposit::Crude => 1,
            _ => 2,
        };
        w * (d.quality_bp as i64)
    };
    let own: Vec<i64> = regions.iter().map(|r| r.deposits.iter().map(weight).sum()).collect();
    let score: Vec<i64> = regions.iter().enumerate().map(|(i, r)| own[i] * 2 + r.neighbors.iter().map(|(n, _)| own[*n as usize]).sum::<i64>()).collect();
    let best = score.iter().copied().max().unwrap_or(0).max(1);
    for (i, r) in regions.iter_mut().enumerate() {
        r.site.resource_bp = (score[i] * 10_000 / best) as u16;
    }
}

/// What each deposit kind looks for and how much of it there is (design chapter
/// 36, table 5.3, at the scale of 48 regions): the number of regions (low, high),
/// the size per deposit in kilotonnes (low, high), and the geology bias.
struct DepositRule {
    kind: Deposit,
    regions: (usize, usize),
    kt: (i64, i64),
}

const DEPOSIT_RULES: [DepositRule; 15] = [
    DepositRule { kind: Deposit::CopperOre, regions: (16, 20), kt: (300_000, 1_200_000) },
    DepositRule { kind: Deposit::Tin, regions: (5, 7), kt: (10_000, 40_000) },
    DepositRule { kind: Deposit::IronOre, regions: (20, 24), kt: (2_000_000, 8_000_000) },
    DepositRule { kind: Deposit::Coal, regions: (18, 22), kt: (3_000_000, 12_000_000) },
    DepositRule { kind: Deposit::Saltpetre, regions: (6, 9), kt: (20_000, 80_000) },
    DepositRule { kind: Deposit::Salt, regions: (18, 22), kt: (500_000, 5_000_000) },
    DepositRule { kind: Deposit::Precious, regions: (8, 12), kt: (2, 10) },
    DepositRule { kind: Deposit::Crude, regions: (8, 12), kt: (1_000_000, 6_000_000) },
    DepositRule { kind: Deposit::Gas, regions: (8, 12), kt: (1_000_000, 5_000_000) },
    DepositRule { kind: Deposit::Bauxite, regions: (4, 6), kt: (500_000, 3_000_000) },
    DepositRule { kind: Deposit::UraniumOre, regions: (4, 6), kt: (5_000, 30_000) },
    DepositRule { kind: Deposit::RareEarths, regions: (3, 5), kt: (20_000, 100_000) },
    DepositRule { kind: Deposit::Lithium, regions: (3, 4), kt: (5_000, 30_000) },
    DepositRule { kind: Deposit::CobaltNickel, regions: (4, 6), kt: (20_000, 150_000) },
    DepositRule { kind: Deposit::Quartz, regions: (5, 8), kt: (50_000, 300_000) },
];

/// World minimum of regions holding each rare kind (design chapter 36, 5.3).
pub(crate) fn world_minimum(d: Deposit) -> usize {
    match d {
        Deposit::Tin => 5,
        Deposit::Lithium | Deposit::RareEarths | Deposit::UraniumOre | Deposit::Quartz | Deposit::CobaltNickel => 3,
        Deposit::Bauxite => 4,
        _ => 0,
    }
}

/// Gas fields rich in helium (`helium_bp` of 50 or more) in the world at least.
pub(crate) const HELIUM_RICH_MIN: usize = 2;

/// How strongly a region's geology, terrain and climate call for a deposit kind.
fn deposit_bias(d: Deposit, r: &Region, g: GeoTag) -> f64 {
    use Terrain::*;
    let t = r.terrain;
    let arid = r.climate == ClimateZone::Arid || matches!(t, Desert | Steppe);
    let rough = matches!(t, Hills | Mountains);
    let wet_lowland = g.basin && matches!(t, Plains | Hills | Forest | Marsh) && !matches!(r.climate, ClimateZone::Arid | ClimateZone::Polar);
    match d {
        Deposit::CopperOre => if g.belt { 0.30 } else if rough { 0.15 } else { 0.0 },
        Deposit::Tin => if g.belt && rough { 0.35 } else if rough { 0.15 } else { -0.1 },
        Deposit::IronOre => if g.shield || g.belt { 0.25 } else if matches!(t, Plains | Hills) { 0.10 } else { 0.0 },
        Deposit::Coal => if wet_lowland { 0.30 } else if matches!(t, Hills | Forest | Plains) { 0.10 } else { -0.1 },
        Deposit::Saltpetre => if t == Desert { 0.35 } else if arid || t == Hills { 0.18 } else { -0.1 },
        Deposit::Salt => if arid { 0.25 } else if g.basin && r.coastal { 0.15 } else { 0.0 },
        Deposit::Precious => if g.belt && rough { 0.30 } else if rough { 0.15 } else { -0.05 },
        Deposit::Crude => if g.basin && matches!(t, Desert | Steppe | Tundra | Marsh) { 0.35 } else if g.basin { 0.12 } else { -0.1 },
        Deposit::Gas => if g.basin && matches!(t, Desert | Steppe | Tundra | Marsh) { 0.30 } else if g.basin { 0.12 } else { -0.1 },
        Deposit::Bauxite => if r.climate == ClimateZone::Tropical && matches!(t, Plains | Hills | Forest) { 0.40 } else if r.climate == ClimateZone::Tropical { 0.15 } else { -0.15 },
        Deposit::UraniumOre => if g.shield || t == Desert { 0.25 } else if t == Mountains { 0.18 } else { -0.05 },
        Deposit::RareEarths => if g.shield || t == Mountains { 0.25 } else if t == Desert { 0.15 } else { -0.05 },
        Deposit::Lithium => if arid && (g.basin || g.rift) { 0.40 } else if arid { 0.20 } else { -0.15 },
        Deposit::CobaltNickel => if t == Mountains || g.belt { 0.25 } else if t == Tundra { 0.20 } else { -0.05 },
        Deposit::Quartz => if rough { 0.25 } else { -0.05 },
        Deposit::Volatiles | Deposit::Helium3 => -1.0,
    }
}

/// Deposits placed by geology and climate (design chapter 36, section 5.3; chapter
/// 37, section 5.1, step 6). For each kind the regions whose geology calls for it
/// most (with noise) receive one, as many as the table asks for this world's size;
/// then no starting neighbourhood (three links) may hold more than half of the
/// regions with a rare kind, and the larger ones are moved away. Gas fields get a
/// helium content, a few of them rich. Kilotonnes in the table, tonnes in the state.
fn place_deposits(geo: &mut Geo, secret: u64, starts: &[usize]) {
    let noise = Noise { key: draw(secret, &[stream("geology")]) };
    let nr = geo.regions.len();
    let near: Vec<Vec<usize>> = starts.iter().map(|h| within_links(&geo.regions, *h, 3).into_iter().map(|x| x.0).collect()).collect();
    for (k, rule) in DEPOSIT_RULES.iter().enumerate() {
        let layer = 40 + 10 * k as u64;
        let mut score: Vec<(f64, usize)> = (0..nr)
            .map(|i| {
                let r = &geo.regions[i];
                let (x, y) = (r.center[0] as f64, r.center[1] as f64);
                let v = if geo.wrap { noise.fractal_wrapped(layer, x, y, 250.0, geo.width as f64) } else { noise.fractal(layer, x, y, 330.0) };
                let mut sc = v + deposit_bias(rule.kind, r, geo.tags[i]);
                if rule.kind == Deposit::Gas && r.deposit(Deposit::Crude).is_some() {
                    sc += 0.25;
                }
                (sc, i)
            })
            .collect();
        score.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(a.1.cmp(&b.1)));
        let (lo, hi) = (rule.regions.0 * nr / 48, (rule.regions.1 * nr + 47) / 48);
        let want = (lo + draw_range(secret, &[stream("deposit-count"), k as u64], (hi - lo + 1) as u64) as usize).max(world_minimum(rule.kind)).min(nr);
        // a rare kind is not concentrated around one start: take the regions in order
        // of how strongly they call for it, skipping one that would put more than half
        // of the kind's regions in some start's neighbourhood while another will do
        let mut chosen: Vec<usize> = Vec::new();
        if world_minimum(rule.kind) > 0 {
            let cap = want / 2;
            for &(_, i) in &score {
                if chosen.len() >= want {
                    break;
                }
                let fits = near.iter().all(|n| !n.contains(&i) || chosen.iter().filter(|c| n.contains(c)).count() < cap);
                if fits {
                    chosen.push(i);
                }
            }
            for &(_, i) in &score {
                if chosen.len() >= want {
                    break;
                }
                if !chosen.contains(&i) {
                    chosen.push(i);
                }
            }
        } else {
            chosen = score.iter().take(want).map(|x| x.1).collect();
        }
        chosen.sort();
        for i in chosen {
            let amount = rng_between(secret, &[stream("deposit"), i as u64, layer], rule.kt.0, rule.kt.1);
            let quality = rng_between(secret, &[stream("depq"), i as u64, layer], 5500, 9500) as u16;
            geo.regions[i].deposits.push(DepositState::new(rule.kind, amount * 1000, quality));
        }
    }
    // helium content of gas fields: a few rich ones, the rest poor
    let mut gas: Vec<usize> = (0..nr).filter(|i| geo.regions[*i].deposit(Deposit::Gas).is_some()).collect();
    gas.sort_by_key(|i| (draw(secret, &[stream("helium-rank"), *i as u64]), *i));
    let rich = (HELIUM_RICH_MIN + draw_range(secret, &[stream("helium-count")], 3) as usize).min(gas.len());
    for (k, i) in gas.iter().enumerate() {
        let bp = if k < rich { rng_between(secret, &[stream("helium"), *i as u64], 50, 150) } else { rng_between(secret, &[stream("helium"), *i as u64], 0, 30) };
        if let Some(d) = geo.regions[*i].deposits.iter_mut().find(|d| d.kind == Deposit::Gas) {
            d.helium_bp = bp as u16;
        }
    }
}

/// Site bonuses (at most two per region) and spice land (design chapter 36, 5.3).
fn place_bonuses(regions: &mut [Region], secret: u64, starts: &[usize]) {
    for (i, r) in regions.iter_mut().enumerate() {
        let roll = |k: u64| draw_range(secret, &[stream("bonus"), i as u64, k], 10_000);
        let mut b: Vec<(Bonus, u16)> = Vec::new();
        let lowland = !matches!(r.terrain, Terrain::Hills | Terrain::Mountains | Terrain::Desert | Terrain::Tundra);
        if (r.river && lowland && roll(0) < 7_000) || starts.contains(&i) {
            b.push((Bonus::Floodplain, 2_500));
        }
        if r.coastal && r.fishery > 0 && roll(1) < 3_000 {
            b.push((Bonus::FishBanks, 5_000));
        }
        if matches!(r.terrain, Terrain::Steppe | Terrain::Plains) && r.pasture >= 20 && roll(2) < 3_500 {
            b.push((Bonus::WildHerds, 5_000));
        }
        if r.terrain == Terrain::Forest && r.forest >= 24 && roll(3) < 4_000 {
            b.push((Bonus::OldGrowth, 5_000));
        }
        if r.pasture >= 30 && roll(4) < 3_000 {
            b.push((Bonus::RichPasture, 3_000));
        }
        b.truncate(2);
        r.bonuses = b;
        r.spice_land = match (r.climate, r.terrain) {
            (ClimateZone::Tropical, Terrain::Plains | Terrain::Forest | Terrain::Marsh | Terrain::Hills) => rng_between(secret, &[stream("spice"), i as u64], 6, 20) as u16,
            (ClimateZone::Tropical, _) => rng_between(secret, &[stream("spice"), i as u64], 0, 4) as u16,
            _ => 0,
        };
    }
}

/// Regions within `links` links of `home` (every kind of link), nearest first.
pub(crate) fn within_links(regions: &[Region], home: usize, links: usize) -> Vec<(usize, usize)> {
    let mut near: Vec<(usize, usize)> = vec![(home, 0)];
    let mut seen = vec![false; regions.len()];
    seen[home] = true;
    let mut qi = 0;
    while qi < near.len() {
        let (x, d) = near[qi];
        qi += 1;
        if d >= links {
            continue;
        }
        for (nb, _) in &regions[x].neighbors {
            let nb = *nb as usize;
            if !seen[nb] {
                seen[nb] = true;
                near.push((nb, d + 1));
            }
        }
    }
    near
}

/// Link distance from `src` to every region; `land_only` ignores sea links.
fn link_distances(regions: &[Region], src: usize, land_only: bool) -> Vec<u32> {
    let mut dist = vec![u32::MAX; regions.len()];
    dist[src] = 0;
    let mut queue = vec![src];
    let mut qi = 0;
    while qi < queue.len() {
        let x = queue[qi];
        qi += 1;
        for (nb, k) in &regions[x].neighbors {
            if land_only && *k == LinkKind::Sea {
                continue;
            }
            let nb = *nb as usize;
            if dist[nb] == u32::MAX {
                dist[nb] = dist[x] + 1;
                queue.push(nb);
            }
        }
    }
    dist
}

/// How good a region is as a homeland of first cultivators.
fn home_score(r: &Region) -> i64 {
    let base = r.arable as i64 * 12 + r.wild / 1000 + r.water as i64 / (20 * WATER_STEP as i64) + r.forest as i64 * 6;
    let bonus = if r.river { 200 } else { 0 } + if r.coastal { 80 } else { 0 };
    let penalty = match r.terrain {
        Terrain::Mountains | Terrain::Desert | Terrain::Tundra => 600,
        _ => 0,
    };
    base + bonus - penalty
}

/// Starting regions (design chapter 37, section 5.1, step 7): temperate or
/// subtropical river regions, as many links apart as the world allows (four
/// wanted), each with room to grow over land. Returns the starts and the least
/// room any of them has (regions reachable over land within three links that are
/// nearer to it than to any other start).
fn choose_starts(regions: &[Region], seats: usize, wrap_w: i32) -> (Vec<usize>, usize) {
    let nr = regions.len();
    let fit = |r: &Region, strict: u8| -> bool {
        let harsh = matches!(r.terrain, Terrain::Mountains | Terrain::Desert | Terrain::Tundra);
        match strict {
            2 => !harsh && matches!(r.climate, ClimateZone::Temperate | ClimateZone::Tropical),
            1 => !harsh,
            _ => true,
        }
    };
    let rooms: Vec<usize> = (0..nr).map(|s| link_distances(regions, s, true).iter().filter(|d| **d <= 3).count()).collect();
    let land_room = |s: usize| -> usize { rooms[s] };
    let mut best: (i64, Vec<usize>, usize) = (i64::MIN, Vec::new(), 0);
    'levels: for strict in [2u8, 1, 0] {
        let mut cands: Vec<usize> = (0..nr).filter(|i| fit(&regions[*i], strict)).collect();
        if cands.len() < seats {
            continue;
        }
        cands.sort_by_key(|i| (std::cmp::Reverse(home_score(&regions[*i]) + land_room(*i) as i64 * 40), *i));
        let dists: Vec<Vec<u32>> = cands.iter().map(|c| link_distances(regions, *c, false)).collect();
        for apart in [4u32, 3, 2, 1] {
            // greedy from each of the best few candidates, keeping the fairest set
            for first in 0..cands.len().min(6) {
                let mut picked: Vec<usize> = vec![first];
                while picked.len() < seats {
                    let next = (0..cands.len())
                        .filter(|k| !picked.contains(k) && picked.iter().all(|p| dists[*p][cands[*k]] >= apart))
                        .max_by_key(|k| {
                            let spread: i64 = picked.iter().map(|p| isqrt(dist2(regions[cands[*p]].center, regions[cands[*k]].center, wrap_w))).min().unwrap_or(0);
                            (spread / 4 + home_score(&regions[cands[*k]]) / 3 + land_room(cands[*k]) as i64 * 30, std::cmp::Reverse(*k))
                        });
                    match next {
                        Some(k) => picked.push(k),
                        None => break,
                    }
                }
                if picked.len() < seats {
                    continue;
                }
                let starts: Vec<usize> = picked.iter().map(|k| cands[*k]).collect();
                let room = start_room_of(regions, &starts);
                let scores: Vec<i64> = starts.iter().map(|s| home_score(&regions[*s])).collect();
                let fair = scores.iter().min().unwrap() * 100 / scores.iter().max().unwrap().max(&1);
                let value = room.min(room_needed(nr, seats)) as i64 * 4000 + strict as i64 * 1500 + room.min(12) as i64 * 300 + fair * 5 + apart.min(4) as i64 * 2500;
                if value > best.0 {
                    best = (value, starts, room);
                }
            }
            if !best.1.is_empty() && best.2 >= room_needed(nr, seats) && apart >= 3 {
                break 'levels;
            }
        }
    }
    (best.1, best.2)
}

/// The least room of any start: regions reachable over land within three links
/// that are strictly nearer (over land) to it than to every other start.
pub(crate) fn start_room_of(regions: &[Region], starts: &[usize]) -> usize {
    let d: Vec<Vec<u32>> = starts.iter().map(|s| link_distances(regions, *s, true)).collect();
    (0..starts.len())
        .map(|k| (0..regions.len()).filter(|r| d[k][*r] <= 3 && (0..starts.len()).all(|o| o == k || d[o][*r] > d[k][*r])).count())
        .min()
        .unwrap_or(0)
}

/// Regions a viable start needs about it.
/// Regions a viable start needs about it: a third of an even share of the world
/// (four for 48 regions and four seats), at least three, for any number of seats.
pub(crate) fn room_needed(regions: usize, seats: usize) -> usize {
    (regions / (3 * seats.max(1))).max(3)
}

/// Seats a world is generated for: the configured controllers, two to ten.
pub(crate) const MAX_SEATS: usize = 10;

/// The geography of a match: the configured map source, then the shared steps.
/// An Earth-like world is drawn again (from the next address of the same secret)
/// when its starts would not be viable, at most a dozen times; the best attempt stands.
pub(crate) fn geography(cfg: &MatchConfig, secret: u64) -> (Geo, Vec<usize>) {
    let seats = cfg.controllers.len().clamp(2, MAX_SEATS);
    let mut best: Option<(usize, Geo, Vec<usize>)> = None;
    let attempts = if cfg.world == WorldKind::Classic { 1 } else { 12 };
    for attempt in 0..attempts {
        let mut geo = match cfg.world {
            WorldKind::Classic => classic_geography(cfg, secret),
            WorldKind::EarthLike => earthlike::geography(cfg, secret, attempt),
        };
        finish_geography(&mut geo, secret);
        let (starts, room) = choose_starts(&geo.regions, seats, if geo.wrap { geo.width } else { 0 });
        if starts.len() < seats {
            continue;
        }
        let good = room >= room_needed(geo.regions.len(), seats);
        if best.as_ref().map(|b| room > b.0).unwrap_or(true) {
            best = Some((room, geo, starts));
        }
        if good {
            break;
        }
    }
    let (_, mut geo, starts) = best.expect("a world with starting regions");
    // every homeland of first cultivators lies on a river: a start the river courses
    // missed gets a short river of its own, down to its lowest land neighbour
    for &h in &starts {
        if geo.regions[h].river {
            continue;
        }
        let low = geo.regions[h].neighbors.iter().filter(|(_, k)| *k != LinkKind::Sea).map(|(n, _)| *n as usize).min_by_key(|n| (geo.regions[*n].elevation, *n));
        if let Some(nb) = low {
            for l in geo.regions[h].neighbors.iter_mut().filter(|l| l.0 as usize == nb) {
                l.1 = LinkKind::River;
            }
            for l in geo.regions[nb].neighbors.iter_mut().filter(|l| l.0 as usize == h) {
                l.1 = LinkKind::River;
            }
            if !geo.regions[nb].river {
                make_river(&mut geo.regions[nb], nb, secret);
            }
        }
        make_river(&mut geo.regions[h], h, secret);
        geo.regions[h].site.navigable_river = !matches!(geo.regions[h].terrain, Terrain::Mountains | Terrain::Hills);
        geo.regions[h].site.river_mouth = geo.regions[h].coastal;
    }
    (geo, starts)
}

pub fn generate(cfg: MatchConfig, entropy: u64) -> World {
    let secret = derive_secret(&cfg, entropy);
    let (mut geo, mut starts) = geography(&cfg, secret);
    place_deposits(&mut geo, secret, &starts);
    place_bonuses(&mut geo.regions, secret, &starts);
    let wrap_w = if geo.wrap { geo.width } else { 0 };
    let seats = cfg.controllers.len().clamp(2, MAX_SEATS);
    // Rotate seat assignment by seed so seat 0 is not always the best site.
    let rot = draw_range(secret, &[stream("seat-rot")], seats as u64) as usize;
    starts.rotate_left(rot);
    let (width, height) = (geo.width, geo.height);
    let mut regions = geo.regions;
    let nr = regions.len();
    let dist = |a: usize, b: usize, regions: &[Region]| dist2(regions[a].center, regions[b].center, wrap_w);

    // Viability guarantees: a costly but real autonomous route from every start.
    for (s, &home) in starts.iter().enumerate() {
        {
            let r = &mut regions[home];
            r.arable = r.arable.max(102);
            r.wild = r.wild.max(560_000);
            r.water = r.water.max(HOME_WATER_MIN);
            r.forest = r.forest.max(12);
            r.pasture = r.pasture.max(12);
            r.hydro = r.hydro.max(4);
        }
        let near = within_links(&regions, home, 3);
        // at least this much within three links of home, in kilotonnes
        let needed: [(Deposit, i64); 3] = [
            (Deposit::CopperOre, 1_200_000),
            (Deposit::IronOre, 7_000_000),
            (Deposit::Coal, 10_000_000),
        ];
        for (k, (kind, amount)) in needed.iter().enumerate() {
            let have: i64 = near.iter().filter_map(|(x, _)| regions[*x].deposit(*kind)).map(|d| d.remaining).sum();
            let short = amount * 1000 - have;
            if short <= 0 {
                continue;
            }
            // Prefer rough terrain close to home that no other start will sit on.
            let mut pick = near
                .iter()
                .filter(|(x, d)| *d >= 1 && !starts.contains(x))
                .map(|(x, d)| {
                    let rough = matches!(regions[*x].terrain, Terrain::Hills | Terrain::Mountains | Terrain::Desert | Terrain::Tundra);
                    (*d as i64 * 10 - if rough { 15 } else { 0 } + draw_range(secret, &[stream("viab"), s as u64, k as u64, *x as u64], 5) as i64, *x)
                })
                .collect::<Vec<_>>();
            pick.sort();
            let target = pick.first().map(|p| p.1).unwrap_or(home);
            // a deposit already there is enlarged; otherwise a new one is placed
            match regions[target].deposits.iter_mut().find(|d| d.kind == *kind) {
                Some(d) => d.remaining += short,
                None => regions[target].deposits.push(DepositState::new(*kind, short, 7000)),
            }
        }
    }
    // salt within three links of every home: a deposit or a coast for pans
    for (s, &home) in starts.iter().enumerate() {
        let near = within_links(&regions, home, 3);
        if near.iter().any(|(x, _)| regions[*x].coastal || regions[*x].deposit(Deposit::Salt).is_some()) {
            continue;
        }
        let target = near.iter().filter(|(x, d)| *d >= 1 && !starts.contains(x)).map(|(x, d)| (*d, draw_range(secret, &[stream("viab-salt"), s as u64, *x as u64], 5), *x)).min().map(|p| p.2).unwrap_or(home);
        regions[target].deposits.push(DepositState::new(Deposit::Salt, 500_000_000, 7000));
    }
    resource_proximity(&mut regions);
    let ice_links = ice_links(&regions, height);

    // --- test nodes: three mutually distant regions -----------------------------
    let mut test_nodes: Vec<usize> = Vec::new();
    let first = (0..nr).max_by_key(|i| (starts.iter().map(|s| dist(*s, *i, &regions)).min().unwrap(), *i)).unwrap();
    test_nodes.push(first);
    while test_nodes.len() < 3 {
        let next = (0..nr)
            .filter(|i| !test_nodes.contains(i))
            .max_by_key(|i| (test_nodes.iter().map(|t| dist(*t, *i, &regions)).min().unwrap(), *i))
            .unwrap();
        test_nodes.push(next);
    }

    // --- 9. civilizations ---------------------------------------------------
    let c = content();
    let name_rot = draw_range(secret, &[stream("civ-names")], CIV_ROOTS.len() as u64) as usize;
    let mut civs: Vec<Civ> = Vec::new();
    let mut lineages: Vec<Lineage> = Vec::new();
    for s in 0..seats {
        let home = starts[s];
        let (name, adjective) = CIV_ROOTS[(name_rot + s) % CIV_ROOTS.len()];
        // Private tendencies shaped by the starting landscape.
        let mut axes = [0i32; 8];
        for (k, ax) in axes.iter_mut().enumerate() {
            *ax = 5000 + rng_between(secret, &[stream("axes"), s as u64, k as u64], -1200, 1200) as i32;
        }
        let r = &regions[home];
        if r.coastal {
            axes[6] += 500;
            axes[0] += 300;
        }
        if r.river {
            axes[3] += 400;
        }
        match r.terrain {
            Terrain::Hills | Terrain::Mountains => axes[4] += 400,
            Terrain::Steppe => {
                axes[7] += 400;
                axes[2] += 300;
            }
            Terrain::Forest => axes[2] += 300,
            _ => axes[3] += 200,
        }
        lineages.push(Lineage {
            name: format!("{} folk", regions[home].name),
            origin: format!("The first camps of {}", regions[home].name),
            home: s as SeatId,
            axes,
            drift_year: [0; 8],
            trait_since: [None; 8],
            trait_streak: [0; 8],
        });

        // Starting people: a smooth young age pyramid of roughly 240,000. Every age
        // gets its proportional share of the total; the people the division leaves
        // over are spread one by one down the pyramid by the running remainder, so
        // no age stands out (generator 1.1.0 put the whole remainder, about three
        // founders in twenty, at age twenty).
        let mut block = PopBlock::new(s as u16, None);
        let total = START_POP_MIN + rng_between(secret, &[stream("startpop"), s as u64], 0, START_POP_SPREAD as i64) as u32;
        block.ages = start_pyramid(total);
        {
            let r = &mut regions[home];
            r.owner = Some(s as SeatId);
            r.controller = Some(s as SeatId);
            r.blocks.push(block);
            r.quals[Qual::Lorekeeper.index()] = START_LOREKEEPERS;
            r.quals[Qual::Artisan.index()] = START_ARTISANS;
            for key in ["makers_circle", "camp", "quarry", "workshop"] {
                r.facilities.push(Facility::new(c.f(key), 1));
            }
        }

        let mut tech = vec![TechSt::default(); c.techs.len()];
        for id in ["T001", "T002", "T003", "T004"] {
            let t = &mut tech[c.t(id)];
            t.state = ST_ADOPTED;
            t.source = "Inherited practice".into();
        }
        let mut practice = vec![PracSt::default(); c.practices.len()];
        for id in ["C001", "C002", "C003"] {
            let p = &mut practice[c.p(id)];
            p.state = 3;
            p.adoption_bp = 9000;
            p.source = "Inherited custom".into();
        }
        // the declared initial endowment: 900,000 rations, 90 kt of materials, 45,000 tool lots
        let mut stock = vec![0i64; NG];
        stock[Good::Food.index()] = 900_000;
        stock[Good::Materials.index()] = 90_000;
        stock[Good::Tools.index()] = 45_000;

        civs.push(Civ {
            seat: s as SeatId,
            name: name.to_string(),
            adjective: adjective.to_string(),
            color: CIV_COLORS[s % CIV_COLORS.len()].to_string(),
            controller: cfg.controllers[s],
            status: SeatStatus::Active,
            capital: home as RegionId,
            lineage: s as u16,
            stock,
            flows: Flows::new(),
            last_flows: Flows::new(),
            use_ema: vec![0; NG],
            tech,
            practice,
            projects: vec![],
            programs: vec![],
            food_reserve_months: 4,
            labor_weights: [5; LaborCategory::COUNT],
            mobilization_bp: 10_000,
            memory: vec![RegionMemory::default(); nr],
            contacts: vec![Contact { trust: 50, ..Default::default() }; seats],
            selected: vec![],
            ready: false,
            auto_pass: false,
            chronicle: vec![],
            briefing: vec![],
            receipts: vec![],
            milestones: Milestones::default(),
            movement: None,
            founded_religion: false,
            ftl: FtlState::default(),
            stability: 70,
            overlord: None,
            tag_activity: vec![0; crate::content::Tag::COUNT],
            research_cap: vec![0; ResearchClass::COUNT],
            research_used: vec![0; ResearchClass::COUNT],
            compute_supply: 0,
            compute_demand: 0,
            labor: LaborSummary::default(),
            qual_employed: vec![0; NQ],
            food_ful_bp: 10_000,
            water_ful_bp: 10_000,
            surplus_streak: 0,
            famine_streak: 0,
            war_weariness: 0,
            study_done: vec![0; crate::content::Tag::COUNT],
            eliminated_month: None,
            army_counter: 0,
            pop_peak: 0,
            qual_flows: {
                // the declared initial endowment of qualified people
                let mut q = QualFlows::default();
                q.initial[Qual::Lorekeeper.index()] = START_LOREKEEPERS as i64;
                q.initial[Qual::Artisan.index()] = START_ARTISANS as i64;
                q
            },
            compute_used: 0,
            directives: Vec::new(),
            war_policy: vec![None; seats],
            tallies: Vec::new(),
            round_start_pop: 0,
            revisit_until: Vec::new(),
            era: Default::default(),
            diag: CivDiag::default(),
        });
    }

    let match_id = format!("bts-{:08x}", (draw(secret, &[stream("match-id")]) & 0xffff_ffff) as u32);
    let mut world = World {
        cfg,
        match_id,
        secret,
        month: 0,
        round: 1,
        phase: Phase::Contact,
        window: 0,
        width,
        height,
        regions,
        civs,
        armies: vec![],
        offers: vec![],
        treaties: vec![],
        messages: vec![],
        lineages,
        religions: vec![],
        test_nodes: test_nodes.iter().map(|t| *t as RegionId).collect(),
        outcome: None,
        next_id: 0,
        envelopes: vec![0; seats * seats],
        sent_window: vec![false; seats * seats],
        versions: vec![RULESET_VERSION.into(), CONTENT_VERSION.into(), GENERATOR_VERSION.into(), PROTOCOL_VERSION.into()],
        round_start: 0,
        last_round_months: 0,
        ice_links,
    };
    for s in 0..seats {
        crate::sim::knowledge::refresh_visibility(&mut world, s as SeatId);
    }
    world
}
