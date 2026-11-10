//! Seeded world generation: geography first, then resources, then starting societies.
//!
//! Only basic IEEE arithmetic and integer hashing are used, so a seed reproduces
//! the same world on every platform. The generated world is saved with the match;
//! replay never depends on regenerating it.

use crate::content::{content, RULESET_VERSION, CONTENT_VERSION, GENERATOR_VERSION};
use crate::state::*;
use crate::util::*;
use bts_protocol::*;

const W: f64 = 1600.0;
const H: f64 = 1000.0;

/// Starting population of a seat: `START_POP_MIN` plus up to `START_POP_SPREAD` people.
pub const START_POP_MIN: u32 = 236_000;
pub const START_POP_SPREAD: u32 = 12_000;
/// The starting age pyramid is laid out in bands of this many people.
const START_BAND: u32 = 1000;
/// Lorekeepers and artisans among the first people.
pub const START_LOREKEEPERS: u32 = 14_000;
pub const START_ARTISANS: u32 = 8_000;
/// Residents the natural water of a home region supports at least.
pub const HOME_WATER_MIN: u32 = 2_600_000;
/// Natural water is drawn in thousands of residents.
const WATER_STEP: u32 = 1000;

struct Noise {
    key: u64,
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
}

#[derive(Clone)]
struct Cell {
    x: f64,
    y: f64,
    poly: Vec<(f64, f64)>,
    edges: Vec<i32>,
    elev: f64,
    land: bool,
}

/// Clip the polygon of `site` against the bisector with `other`, keeping the side nearer `site`.
fn clip(poly: &[(f64, f64)], edges: &[i32], sx: f64, sy: f64, ox: f64, oy: f64, label: i32) -> (Vec<(f64, f64)>, Vec<i32>) {
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
];
pub const CIV_COLORS: [&str; 4] = ["#c1503a", "#2f73a0", "#5c8a36", "#8a59a8"];

fn region_name(secret: u64, i: usize, used: &mut Vec<String>) -> String {
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

fn rng_between(secret: u64, addr: &[u64], lo: i64, hi: i64) -> i64 {
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

pub fn generate(cfg: MatchConfig, entropy: u64) -> World {
    let secret = derive_secret(&cfg, entropy);
    let noise = Noise { key: draw(secret, &[stream("terrain")]) };
    let want = cfg.regions.max(8) as usize;

    // --- 1. sites on a jittered grid -------------------------------------
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

    // --- 2. elevation, land and sea ---------------------------------------
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
    let id_of = |cell: usize| land.iter().position(|c| *c == cell);

    let elevs: Vec<f64> = land.iter().map(|i| cells[*i].elev).collect();
    let emin = elevs.iter().cloned().fold(f64::MAX, f64::min);
    let emax = elevs.iter().cloned().fold(f64::MIN, f64::max);

    // --- 3. regions --------------------------------------------------------
    let mut used_names = Vec::new();
    let mut regions: Vec<Region> = Vec::new();
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
        let a = |k: u64, lo: i64, hi: i64| rng_between(secret, &[stream("attr"), rid as u64, k], lo, hi);
        let (arable, pasture, wild, forest, water, hydro) = match terrain {
            Terrain::Plains => (a(0, 30, 55), a(1, 15, 30), a(2, 380, 520), a(3, 4, 10), a(4, 1500, 3000), a(5, 0, 2)),
            Terrain::Hills => (a(0, 10, 22), a(1, 20, 35), a(2, 300, 420), a(3, 8, 16), a(4, 1000, 2000), a(5, 4, 8)),
            Terrain::Mountains => (a(0, 2, 6), a(1, 6, 14), a(2, 150, 240), a(3, 4, 10), a(4, 800, 1500), a(5, 8, 16)),
            Terrain::Forest => (a(0, 12, 24), a(1, 6, 12), a(2, 450, 600), a(3, 20, 36), a(4, 1500, 2500), a(5, 1, 3)),
            Terrain::Marsh => (a(0, 10, 22), a(1, 4, 8), a(2, 420, 560), a(3, 6, 12), a(4, 2500, 4000), a(5, 0, 2)),
            Terrain::Steppe => (a(0, 8, 16), a(1, 35, 55), a(2, 260, 360), a(3, 2, 5), a(4, 600, 1200), a(5, 1, 4)),
            Terrain::Desert => (a(0, 0, 4), a(1, 4, 10), a(2, 90, 160), a(3, 0, 2), a(4, 200, 500), a(5, 0, 3)),
            Terrain::Tundra => (a(0, 0, 3), a(1, 6, 12), a(2, 160, 260), a(3, 2, 8), a(4, 800, 1500), a(5, 1, 4)),
        };
        let poly: Vec<[i32; 2]> = c.poly.iter().map(|p| [p.0.round() as i32, p.1.round() as i32]).collect();
        let mut neighbors: Vec<(RegionId, LinkKind)> = Vec::new();
        for e in &c.edges {
            if *e >= 0 {
                if let Some(o) = id_of(*e as usize) {
                    if !neighbors.iter().any(|(x, _)| *x as usize == o) {
                        neighbors.push((o as RegionId, LinkKind::Land));
                    }
                }
            }
        }
        regions.push(Region {
            id: rid as RegionId,
            name: region_name(secret, rid, &mut used_names),
            poly,
            center: [c.x.round() as i32, c.y.round() as i32],
            neighbors,
            terrain,
            coastal,
            river: false,
            elevation: (height * 255.0) as u8,
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
        });
    }
    let nr = regions.len();

    // --- 4. rivers: flow from high wet regions downhill to the coast -------
    let mut sources: Vec<usize> = (0..nr)
        .filter(|i| matches!(regions[*i].terrain, Terrain::Mountains | Terrain::Hills))
        .collect();
    sources.sort_by_key(|i| (std::cmp::Reverse(regions[*i].elevation), *i));
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
            for (nb, _) in regions[cur].neighbors.clone() {
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
            let b = |k: u64, lo: i64, hi: i64| rng_between(secret, &[stream("riverattr"), i as u64, k], lo, hi);
            regions[i].arable += b(0, 6, 12) as u16;
            regions[i].water += b(1, 1200, 2200) as u32 * WATER_STEP;
            regions[i].hydro += b(2, 4, 8) as u16;
            regions[i].fishery += b(3, 3, 6) as u16;
            regions[i].wild += b(4, 40, 90) * 1000;
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

    // --- 5. sea links ------------------------------------------------------
    for i in 0..nr {
        if !regions[i].coastal {
            continue;
        }
        for j in (i + 1)..nr {
            if !regions[j].coastal || regions[i].neighbors.iter().any(|(n, _)| *n as usize == j) {
                continue;
            }
            let ci = &cells[land[i]];
            let cj = &cells[land[j]];
            let shared_sea = ci.edges.iter().any(|e| *e >= 0 && !cells[*e as usize].land && cj.edges.contains(e));
            let dx = (regions[i].center[0] - regions[j].center[0]) as f64;
            let dy = (regions[i].center[1] - regions[j].center[1]) as f64;
            if shared_sea && dx * dx + dy * dy < (cw * 2.6) * (cw * 2.6) {
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
                    let dx = (regions[i].center[0] - regions[j].center[0]) as i64;
                    let dy = (regions[i].center[1] - regions[j].center[1]) as i64;
                    let d = dx * dx + dy * dy;
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

    // --- 6. correlated deposits -------------------------------------------
    let belts: [(Deposit, u64, f64, i64, i64); 5] = [
        (Deposit::CopperOre, 40, 0.56, 80_000, 260_000),
        (Deposit::IronOre, 50, 0.52, 250_000, 800_000),
        (Deposit::Coal, 60, 0.54, 350_000, 1_200_000),
        (Deposit::Crude, 70, 0.57, 300_000, 1_000_000),
        (Deposit::Minerals, 80, 0.58, 40_000, 130_000),
    ];
    for i in 0..nr {
        let (x, y) = (regions[i].center[0] as f64, regions[i].center[1] as f64);
        for (kind, layer, threshold, lo, hi) in belts.iter() {
            let mut v = noise.fractal(*layer, x, y, 330.0);
            let t = regions[i].terrain;
            v += match (kind, t) {
                (Deposit::CopperOre, Terrain::Hills | Terrain::Mountains) => 0.10,
                (Deposit::IronOre, Terrain::Hills | Terrain::Mountains) => 0.10,
                (Deposit::Coal, Terrain::Hills | Terrain::Forest | Terrain::Plains) => 0.06,
                (Deposit::Crude, Terrain::Desert | Terrain::Steppe | Terrain::Tundra | Terrain::Marsh) => 0.10,
                (Deposit::Minerals, Terrain::Mountains | Terrain::Desert | Terrain::Tundra) => 0.10,
                _ => -0.02,
            };
            if v > *threshold {
                let amount = rng_between(secret, &[stream("deposit"), i as u64, *layer], *lo, *hi);
                let quality = rng_between(secret, &[stream("depq"), i as u64, *layer], 5500, 9500) as u16;
                regions[i].deposits.push(DepositState { kind: *kind, remaining: amount * 1000, quality_bp: quality });
            }
        }
    }

    // --- 7. starting positions ---------------------------------------------
    let seats = cfg.controllers.len().clamp(2, 4);
    let score = |r: &Region| -> i64 {
        let base = r.arable as i64 * 12 + r.wild / 1000 + r.water as i64 / (20 * WATER_STEP as i64) + r.forest as i64 * 6;
        let bonus = if r.river { 200 } else { 0 } + if r.coastal { 80 } else { 0 };
        let penalty = match r.terrain {
            Terrain::Mountains | Terrain::Desert | Terrain::Tundra => 600,
            _ => 0,
        };
        base + bonus - penalty
    };
    let mut cands: Vec<usize> = (0..nr).collect();
    cands.sort_by_key(|i| (std::cmp::Reverse(score(&regions[*i])), *i));
    cands.truncate((nr * 2 / 3).max(seats));
    let centers: Vec<[i32; 2]> = regions.iter().map(|r| r.center).collect();
    let dist = |a: usize, b: usize| -> i64 {
        let dx = (centers[a][0] - centers[b][0]) as i64;
        let dy = (centers[a][1] - centers[b][1]) as i64;
        dx * dx + dy * dy
    };
    let mut starts: Vec<usize> = vec![cands[0]];
    while starts.len() < seats {
        let mut best = (i64::MIN, cands[0]);
        for &c in &cands {
            if starts.contains(&c) {
                continue;
            }
            let dmin = starts.iter().map(|s| dist(*s, c)).min().unwrap();
            let v = isqrt(dmin) * 3 + score(&regions[c]) / 3;
            if v > best.0 {
                best = (v, c);
            }
        }
        starts.push(best.1);
    }
    // Rotate seat assignment by seed so seat 0 is not always the best site.
    let rot = draw_range(secret, &[stream("seat-rot")], seats as u64) as usize;
    starts.rotate_left(rot);

    // Viability guarantees: a costly but real autonomous route from every start.
    for (s, &home) in starts.iter().enumerate() {
        {
            let r = &mut regions[home];
            r.arable = r.arable.max(34);
            r.wild = r.wild.max(560_000);
            r.water = r.water.max(HOME_WATER_MIN);
            r.forest = r.forest.max(12);
            r.pasture = r.pasture.max(12);
            r.hydro = r.hydro.max(4);
        }
        // Regions within three links of home, nearest first.
        let mut near: Vec<(usize, usize)> = vec![(home, 0)];
        let mut qi = 0;
        while qi < near.len() {
            let (x, d) = near[qi];
            qi += 1;
            if d >= 3 {
                continue;
            }
            for (nb, _) in regions[x].neighbors.clone() {
                if !near.iter().any(|(y, _)| *y == nb as usize) {
                    near.push((nb as usize, d + 1));
                }
            }
        }
        let needed: [(Deposit, i64); 4] = [
            (Deposit::CopperOre, 120_000),
            (Deposit::IronOre, 350_000),
            (Deposit::Coal, 500_000),
            (Deposit::Minerals, 60_000),
        ];
        for (k, (kind, amount)) in needed.iter().enumerate() {
            if near.iter().any(|(x, _)| regions[*x].deposit(*kind).is_some()) {
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
            regions[target].deposits.push(DepositState { kind: *kind, remaining: amount * 1000, quality_bp: 7000 });
        }
    }

    // --- 8. test nodes: three mutually distant regions ----------------------
    let mut test_nodes: Vec<usize> = Vec::new();
    let first = (0..nr).max_by_key(|i| (starts.iter().map(|s| dist(*s, *i)).min().unwrap(), *i)).unwrap();
    test_nodes.push(first);
    while test_nodes.len() < 3 {
        let next = (0..nr)
            .filter(|i| !test_nodes.contains(i))
            .max_by_key(|i| (test_nodes.iter().map(|t| dist(*t, *i)).min().unwrap(), *i))
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

        // Starting people: a young age pyramid of roughly 240,000, laid out in whole
        // bands of a thousand. The founders the weights do not place in whole bands
        // (about three in twenty) are young adults of twenty, so half of the first
        // people are of child-bearing age and hardly any are past sixty-five. This is
        // the age structure ruleset 1.0.1 started from when it placed single people the
        // same way, and the opening demography is calibrated on it: a smooth pyramid
        // has a fifth fewer adults of child-bearing age and, in all-AI matches, leaves
        // populations about a sixth smaller through the first hundred years.
        let mut block = PopBlock::new(s as u16, None);
        let total = START_POP_MIN + rng_between(secret, &[stream("startpop"), s as u64], 0, START_POP_SPREAD as i64) as u32;
        let mut weights = [0u32; AGES];
        let mut wsum = 0u32;
        for (age, w) in weights.iter_mut().enumerate() {
            *w = if age < 60 { 100 - age as u32 } else if age < 75 { 30 - (age as u32 - 60) * 2 } else { 0 };
            wsum += *w;
        }
        let bands = total / START_BAND;
        let mut placed = 0u32;
        for age in 0..AGES {
            let nppl = bands * weights[age] / wsum * START_BAND;
            block.ages[age] = nppl;
            placed += nppl;
        }
        block.ages[20] += total - placed;
        {
            let r = &mut regions[home];
            r.owner = Some(s as SeatId);
            r.controller = Some(s as SeatId);
            r.blocks.push(block);
            r.quals[Qual::Lorekeeper.index()] = START_LOREKEEPERS;
            r.quals[Qual::Artisan.index()] = START_ARTISANS;
            for key in ["makers_circle", "camp", "workshop"] {
                r.facilities.push(Facility {
                    kind: c.f(key),
                    level: 1,
                    condition_bp: 10_000,
                    enabled: true,
                    staffed: 0,
                    staff_needed: 0,
                    skilled_bp: 10_000,
                    run: None,
                    operated: false,
                    assembly_progress: 0,
                });
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
            color: CIV_COLORS[s % 4].to_string(),
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
        width: W as i32,
        height: H as i32,
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
    };
    for s in 0..seats {
        crate::sim::knowledge::refresh_visibility(&mut world, s as SeatId);
    }
    world
}
