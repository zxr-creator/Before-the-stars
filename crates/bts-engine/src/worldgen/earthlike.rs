//! The generated Earth-like home world (design chapter 37, section 5.1; generator
//! `bts-worldgen/2.0.0`).
//!
//! An equirectangular map of 2,000 x 1,000 units whose x axis wraps: plates on the
//! sphere, elevation from continental crust and plate boundaries, climate from
//! latitude, height, distance from the sea and rain shadows, terrain from a
//! Whittaker-style table onto the eight terrains, and geology tags for resources.
//! Polar caps above 72 degrees are ice, not regions. Only basic IEEE arithmetic
//! (+, -, *, /, floor, sqrt, comparisons) and keyed integer hashes are used; the
//! cosine of latitude comes from an integer table, so a seed reproduces the same
//! world natively and in WebAssembly.

use super::*;

pub const MAP_W: f64 = 2000.0;
pub const MAP_H: f64 = 1000.0;
/// Latitude beyond which the map is polar ice.
const POLAR_LAT: f64 = 72.0;

/// cos(d) x 10,000 for whole degrees 0-90.
const COS_BP: [i32; 91] = [
    10000, 9998, 9994, 9986, 9976, 9962, 9945, 9925, 9903, 9877, 9848, 9816, 9781, 9744, 9703, 9659, 9613, 9563, 9511, 9455, 9397, 9336, 9272, 9205, 9135, 9063, 8988, 8910, 8829, 8746, 8660, 8572, 8480, 8387, 8290, 8192, 8090,
    7986, 7880, 7771, 7660, 7547, 7431, 7314, 7193, 7071, 6947, 6820, 6691, 6561, 6428, 6293, 6157, 6018, 5878, 5736, 5592, 5446, 5299, 5150, 5000, 4848, 4695, 4540, 4384, 4226, 4067, 3907, 3746, 3584, 3420, 3256, 3090, 2924,
    2756, 2588, 2419, 2250, 2079, 1908, 1736, 1564, 1392, 1219, 1045, 872, 698, 523, 349, 175, 0,
];

/// Latitude in degrees (north positive) of a map row.
pub fn lat_of(y: f64) -> f64 {
    90.0 - y * 180.0 / MAP_H
}

/// cos(latitude), interpolated in the integer table.
pub fn cos_lat(lat: f64) -> f64 {
    let d = lat.abs().min(90.0);
    let i = d.floor() as usize;
    let f = d - i as f64;
    let a = COS_BP[i] as f64;
    let b = COS_BP[(i + 1).min(90)] as f64;
    (a + (b - a) * f) / 10_000.0
}

/// The shorter east-west offset from `a` to `b` on the wrapped map.
fn wrap_dx(a: f64, b: f64) -> f64 {
    let mut d = b - a;
    if d > MAP_W / 2.0 {
        d -= MAP_W;
    } else if d < -MAP_W / 2.0 {
        d += MAP_W;
    }
    d
}

/// Moisture of the zonal circulation by latitude: the wet equatorial belt, the dry
/// subtropics, the wet westerlies, the dry poles.
fn band_moisture(lat: f64) -> f64 {
    const PTS: [(f64, f64); 10] = [(0.0, 0.95), (10.0, 0.85), (18.0, 0.50), (25.0, 0.26), (32.0, 0.32), (40.0, 0.58), (50.0, 0.74), (60.0, 0.64), (72.0, 0.42), (90.0, 0.30)];
    let a = lat.abs();
    for w in PTS.windows(2) {
        if a <= w[1].0 {
            let t = (a - w[0].0) / (w[1].0 - w[0].0);
            return w[0].1 + (w[1].1 - w[0].1) * t;
        }
    }
    0.30
}

struct ECell {
    x: f64,
    y: f64,
    poly: Vec<(f64, f64)>,
    edges: Vec<i32>,
    nbrs: Vec<usize>,
    polar: bool,
    plate: usize,
    elev: f64,
    conv: f64,
    div: f64,
    land: bool,
}

/// Terrain thresholds (calibrated so that terrain shares and land attributes match
/// the classic generator over a thousand worlds, keeping slice 2's calibration).
const MOUNTAIN_H: f64 = 0.915;
const HILLS_H: f64 = 0.70;

pub(crate) fn geography(cfg: &MatchConfig, secret: u64, attempt: u32) -> Geo {
    let key = draw(secret, &[stream("earthlike"), attempt as u64]);
    let noise = Noise { key };
    let rnd = |addr: &[u64]| draw(key, addr);
    let want = cfg.regions.max(8) as usize;
    // land is about 30% of all cells, and one land cell is one region
    let total = want * 10 / 3;
    let rows = ((isqrt(total as i64 * 10_000 / 2) + 50) / 100).max(3) as usize;
    let cols = (total + rows - 1) / rows;
    let cw = MAP_W / cols as f64;
    let ch = MAP_H / rows as f64;

    // --- 1. cells on a staggered jittered grid, Voronoi with an east-west wrap ----
    let mut cells: Vec<ECell> = Vec::with_capacity(rows * cols);
    for r in 0..rows {
        for c in 0..cols {
            let i = (r * cols + c) as u64;
            let jx = (rnd(&[stream("site"), i, 0]) % 1000) as f64 / 1000.0;
            let jy = (rnd(&[stream("site"), i, 1]) % 1000) as f64 / 1000.0;
            let mut x = (c as f64 + 0.5 * (r % 2) as f64 + 0.15 + jx * 0.7) * cw;
            if x >= MAP_W {
                x -= MAP_W;
            }
            let y = (r as f64 + 0.15 + jy * 0.7) * ch;
            let polar = lat_of(y).abs() > POLAR_LAT;
            cells.push(ECell { x, y, poly: vec![], edges: vec![], nbrs: vec![], polar, plate: 0, elev: 0.0, conv: 0.0, div: 0.0, land: false });
        }
    }
    let n = cells.len();
    let reach2 = (cw * 3.2) * (cw * 3.2) + (ch * 3.2) * (ch * 3.2);
    for i in 0..n {
        let (sx, sy) = (cells[i].x, cells[i].y);
        let mut poly = vec![(sx - MAP_W / 2.0, 0.0), (sx + MAP_W / 2.0, 0.0), (sx + MAP_W / 2.0, MAP_H), (sx - MAP_W / 2.0, MAP_H)];
        let mut edges = vec![-1, -1, -1, -1];
        for j in 0..n {
            if i == j {
                continue;
            }
            for shift in [-MAP_W, 0.0, MAP_W] {
                let (ox, oy) = (cells[j].x + shift, cells[j].y);
                let d2 = (ox - sx) * (ox - sx) + (oy - sy) * (oy - sy);
                if d2 > reach2 {
                    continue;
                }
                let (p, e) = clip(&poly, &edges, sx, sy, ox, oy, j as i32);
                poly = p;
                edges = e;
            }
        }
        let mut nbrs: Vec<usize> = edges.iter().filter(|e| **e >= 0).map(|e| *e as usize).collect();
        nbrs.sort();
        nbrs.dedup();
        cells[i].poly = poly;
        cells[i].edges = edges;
        cells[i].nbrs = nbrs;
    }
    // make adjacency symmetric (clipping is symmetric up to rounding)
    for i in 0..n {
        for k in 0..cells[i].nbrs.len() {
            let j = cells[i].nbrs[k];
            if !cells[j].nbrs.contains(&i) {
                cells[j].nbrs.push(i);
            }
        }
    }

    // --- 2. plates ----------------------------------------------------------------
    let np = 7 + (rnd(&[stream("plates")]) % 3) as usize;
    let seeds: Vec<(f64, f64, f64, f64)> = (0..np)
        .map(|p| {
            let x = (rnd(&[stream("plate"), p as u64, 0]) % 2000) as f64;
            let y = 130.0 + (rnd(&[stream("plate"), p as u64, 1]) % 740) as f64;
            let vx = (rnd(&[stream("plate"), p as u64, 2]) % 2001) as f64 / 1000.0 - 1.0;
            let vy = (rnd(&[stream("plate"), p as u64, 3]) % 2001) as f64 / 1000.0 - 1.0;
            (x, y, vx, vy)
        })
        .collect();
    // 35-40% of plates carry continental crust
    let n_cont = (np * 3 + 4) / 8;
    let mut plate_order: Vec<usize> = (0..np).collect();
    plate_order.sort_by_key(|p| (rnd(&[stream("continental"), *p as u64]), *p));
    let mut continental = vec![false; np];
    for p in plate_order.iter().take(n_cont) {
        continental[*p] = true;
    }
    for c in cells.iter_mut() {
        let warp = 0.75 + 0.5 * noise.fractal_wrapped(5, c.x, c.y, 250.0, MAP_W);
        let cl = cos_lat(lat_of(c.y)).max(0.2);
        let mut best = (f64::MAX, 0usize);
        for (p, s) in seeds.iter().enumerate() {
            let dx = wrap_dx(c.x, s.0) * cl;
            let dy = s.1 - c.y;
            let d = (dx * dx + dy * dy) * warp * (0.85 + 0.3 * ((rnd(&[stream("plate-size"), p as u64]) % 1000) as f64 / 1000.0));
            if d < best.0 {
                best = (d, p);
            }
        }
        c.plate = best.1;
    }

    // --- 3. elevation ----------------------------------------------------------------
    for i in 0..n {
        let p = cells[i].plate;
        let cont = continental[p];
        let (mut conv, mut div, mut cont_nb) = (0.0f64, 0.0f64, false);
        for &j in &cells[i].nbrs {
            let q = cells[j].plate;
            if q == p {
                continue;
            }
            let dx = wrap_dx(cells[i].x, cells[j].x);
            let dy = cells[j].y - cells[i].y;
            let len = (dx * dx + dy * dy).sqrt().max(1.0);
            // positive: this plate moves toward the other one across the boundary
            let rel = ((seeds[p].2 - seeds[q].2) * dx + (seeds[p].3 - seeds[q].3) * dy) / len;
            conv = conv.max(rel);
            div = div.max(-rel);
            cont_nb |= continental[q];
        }
        let mut e = if cont { 0.60 } else { 0.18 };
        if conv > 0.15 {
            e += if cont {
                0.38 * conv
            } else if cont_nb {
                -0.08 // the oceanic side of a subduction zone is a trench
            } else {
                0.30 * conv // island arc
            };
        }
        if div > 0.25 {
            e -= 0.12 * div;
        }
        e += 0.30 * (noise.fractal_wrapped(10, cells[i].x, cells[i].y, 400.0, MAP_W) - 0.5);
        // high latitudes are mostly sea (as the classic map's calibration assumes)
        e -= 0.30 * ((lat_of(cells[i].y).abs() - 45.0) / 27.0).max(0.0);
        cells[i].elev = e;
        cells[i].conv = if conv > 0.15 && (cont || !cont_nb) { conv } else { 0.0 };
        cells[i].div = div;
    }
    let mut order: Vec<usize> = (0..n).filter(|i| !cells[*i].polar).collect();
    order.sort_by(|a, b| cells[*b].elev.partial_cmp(&cells[*a].elev).unwrap().then(a.cmp(b)));
    for &i in order.iter().take(want) {
        cells[i].land = true;
    }
    let land: Vec<usize> = (0..n).filter(|i| cells[*i].land).collect();
    let mut id_of = vec![usize::MAX; n];
    for (rid, &ci) in land.iter().enumerate() {
        id_of[ci] = rid;
    }
    let sea = land.iter().map(|i| cells[*i].elev).fold(f64::MAX, f64::min);
    let emax = land.iter().map(|i| cells[*i].elev).fold(f64::MIN, f64::max);

    // --- 4. climate and terrain ---------------------------------------------------------
    // distance from the sea in land links
    let mut coast_d = vec![u32::MAX; land.len()];
    let mut queue = Vec::new();
    for (rid, &ci) in land.iter().enumerate() {
        if cells[ci].nbrs.iter().any(|j| !cells[*j].land) || cells[ci].edges.iter().any(|e| *e < 0) {
            coast_d[rid] = 0;
            queue.push(rid);
        }
    }
    let mut qi = 0;
    while qi < queue.len() {
        let r = queue[qi];
        qi += 1;
        for &j in &cells[land[r]].nbrs {
            let o = id_of[j];
            if o != usize::MAX && coast_d[o] == u32::MAX {
                coast_d[o] = coast_d[r] + 1;
                queue.push(o);
            }
        }
    }
    // height is the rank of relief (elevation above the sea, orogeny and roughness)
    // among the world's land, so that each world has the classic map's share of
    // mountains and hills wherever its belts lie
    let relief: Vec<f64> = land
        .iter()
        .map(|&ci| {
            let c = &cells[ci];
            let h01 = if emax > sea { (c.elev - sea) / (emax - sea) } else { 0.5 };
            let rough = noise.fractal_wrapped(20, c.x, c.y, 250.0, MAP_W);
            h01 * 0.55 + rough * 0.35 + 0.45 * c.conv
        })
        .collect();
    let mut rank: Vec<usize> = (0..land.len()).collect();
    rank.sort_by(|a, b| relief[*a].partial_cmp(&relief[*b]).unwrap().then(a.cmp(b)));
    let mut heights = vec![0.0f64; land.len()];
    for (k, &r) in rank.iter().enumerate() {
        heights[r] = k as f64 / (land.len() - 1).max(1) as f64;
    }
    let mut used_names = Vec::new();
    let mut regions: Vec<Region> = Vec::new();
    let mut tags = Vec::new();
    let mut moist_v = Vec::new();
    let mut ocean = Vec::new();
    let mut coast_edges = Vec::new();
    for (rid, &ci) in land.iter().enumerate() {
        let c = &cells[ci];
        let height = heights[rid];
        let lat = lat_of(c.y);
        let temp = -18.0 + 46.0 * cos_lat(lat) - 10.0 * height;
        let mut moist = band_moisture(lat);
        moist *= (1.0 - 0.13 * coast_d[rid].min(5) as f64).max(0.45);
        // rain shadows: westerlies blow from the west at 35-62 degrees, trade winds
        // from the east below 30
        let a = lat.abs();
        let upwind = if (35.0..=62.0).contains(&a) { -1.0 } else if a < 30.0 { 1.0 } else { 0.0 };
        if upwind != 0.0 && height <= MOUNTAIN_H {
            let shadow = c.nbrs.iter().any(|&j| {
                let o = id_of[j];
                if o == usize::MAX {
                    return false;
                }
                let dx = wrap_dx(c.x, cells[j].x);
                let dy = cells[j].y - c.y;
                dx * upwind > 0.0 && dx.abs() > dy.abs() && heights[o] > MOUNTAIN_H
            });
            if shadow {
                moist *= 0.55;
            }
        }
        moist = (moist + 0.26 * (noise.fractal_wrapped(30, c.x, c.y, 400.0, MAP_W) - 0.5)).clamp(0.0, 1.0);
        let coastal = coast_d[rid] == 0;
        let terrain = if height > MOUNTAIN_H {
            Terrain::Mountains
        } else if temp < -2.0 {
            Terrain::Tundra
        } else if height > HILLS_H {
            Terrain::Hills
        } else if moist < 0.31 {
            if temp > 9.0 { Terrain::Desert } else { Terrain::Steppe }
        } else if moist < 0.44 {
            Terrain::Steppe
        } else if moist > 0.74 {
            if height < 0.30 && coastal && temp > 5.0 { Terrain::Marsh } else { Terrain::Forest }
        } else if temp < 4.0 {
            Terrain::Forest
        } else {
            Terrain::Plains
        };
        let climate = if temp < -2.0 || terrain == Terrain::Tundra {
            ClimateZone::Polar
        } else if moist < 0.33 {
            ClimateZone::Arid
        } else if temp >= 21.0 {
            ClimateZone::Tropical
        } else if temp < 9.0 || (coast_d[rid] >= 3 && temp < 14.0) {
            ClimateZone::Continental
        } else {
            ClimateZone::Temperate
        };
        let poly: Vec<[i32; 2]> = c.poly.iter().map(|p| [p.0.round() as i32, p.1.round() as i32]).collect();
        let mut r = new_region(secret, rid, &mut used_names, poly, [(c.x.round() as i32).rem_euclid(MAP_W as i32), c.y.round() as i32], terrain, climate, coastal, height);
        for &j in &c.nbrs {
            let o = id_of[j];
            if o != usize::MAX && !r.neighbors.iter().any(|(x, _)| *x as usize == o) {
                r.neighbors.push((o as RegionId, LinkKind::Land));
            }
        }
        regions.push(r);
        let cont = continental[c.plate];
        tags.push(GeoTag {
            belt: c.conv > 0.3 || terrain == Terrain::Mountains,
            shield: cont && c.conv == 0.0 && c.div < 0.25 && coast_d[rid] >= 1,
            basin: (height < 0.42 && c.conv < 0.3) || (coastal && height < 0.5),
            rift: c.div > 0.35,
        });
        moist_v.push((moist * 255.0) as u8);
        ocean.push(c.nbrs.iter().filter(|j| !cells[**j].land && !cells[**j].polar).copied().collect());
        coast_edges.push(c.edges.iter().filter(|e| **e < 0 || !cells[**e as usize].land).count().min(255) as u8);
    }
    Geo { regions, width: MAP_W as i32, height: MAP_H as i32, wrap: true, tags, moist: moist_v, ocean, coast_edges, sea_reach: (cw * 2.6) as i64 }
}
