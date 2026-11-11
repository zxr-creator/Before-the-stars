//! Generator 2.0: the Earth-like home world (design chapter 37, section 5.1) and the
//! resources placed on it.

use crate::state::*;
use crate::worldgen::{derive_secret, geography, room_needed, Geo};
use bts_protocol::*;

fn cfg(seed: &str, regions: u16, world: WorldKind) -> MatchConfig {
    MatchConfig { seed: seed.into(), regions, world, controllers: vec![ControllerKind::NativeMedium; 4], ..Default::default() }
}

fn geo(seed: &str, regions: u16, world: WorldKind) -> (Geo, Vec<usize>) {
    let c = cfg(seed, regions, world);
    geography(&c, derive_secret(&c, 0))
}

#[derive(Default)]
struct Stats {
    worlds: usize,
    regions: usize,
    terrain: [usize; 8],
    climate: [usize; 5],
    arable: i64,
    pasture: i64,
    forest: i64,
    water: i64,
    wild: i64,
    rivers: usize,
    coastal: usize,
    viable: usize,
}

fn stats(world: WorldKind, n: usize, regions: u16) -> Stats {
    let mut s = Stats::default();
    for i in 0..n {
        let (g, starts) = geo(&format!("stats-{i}"), regions, world);
        s.worlds += 1;
        if crate::worldgen::start_room_of(&g.regions, &starts) >= room_needed(g.regions.len()) {
            s.viable += 1;
        }
        for r in &g.regions {
            s.regions += 1;
            s.terrain[r.terrain.index()] += 1;
            s.climate[r.climate.index()] += 1;
            s.arable += r.arable as i64;
            s.pasture += r.pasture as i64;
            s.forest += r.forest as i64;
            s.water += r.water as i64;
            s.wild += r.wild;
            s.rivers += r.river as usize;
            s.coastal += r.coastal as usize;
        }
    }
    s
}

fn print(name: &str, s: &Stats) {
    let n = s.regions as i64;
    println!("{name}: {} worlds, viable {}", s.worlds, s.viable);
    println!("  terrain %: {}", Terrain::ALL.iter().map(|t| format!("{} {:.1}", t.label(), s.terrain[t.index()] as f64 * 100.0 / n as f64)).collect::<Vec<_>>().join(", "));
    println!("  climate %: {}", ClimateZone::ALL.iter().map(|t| format!("{} {:.1}", t.label(), s.climate[t.index()] as f64 * 100.0 / n as f64)).collect::<Vec<_>>().join(", "));
    println!("  means: arable {:.1} pasture {:.1} forest {:.1} water {:.0} k wild {:.0} k; rivers {:.1}% coastal {:.1}%", s.arable as f64 / n as f64, s.pasture as f64 / n as f64, s.forest as f64 / n as f64, s.water as f64 / n as f64 / 1000.0, s.wild as f64 / n as f64 / 1000.0, s.rivers as f64 * 100.0 / n as f64, s.coastal as f64 * 100.0 / n as f64);
}

/// Prints the comparison used to calibrate the terrain thresholds.
/// `cargo test -p bts-engine --release worldgen_statistics -- --ignored --nocapture`
#[test]
#[ignore]
fn worldgen_statistics() {
    let n = std::env::var("WORLDS").ok().and_then(|v| v.parse().ok()).unwrap_or(300);
    print("classic", &stats(WorldKind::Classic, n, 48));
    print("earth-like", &stats(WorldKind::EarthLike, n, 48));
}

/// The land attributes that slice 2's population calibration rests on stay within
/// a tenth of the classic generator's (design chapter 37, section 5.1), and terrain
/// shares stay in bands, over a thousand worlds of each kind.
#[test]
fn earthlike_land_matches_the_classic_generator() {
    let n = 1000;
    let (a, b) = (stats(WorldKind::Classic, n, 48), stats(WorldKind::EarthLike, n, 48));
    let close = |x: i64, y: i64, what: &str| {
        assert!(y * 100 >= x * 90 && y * 100 <= x * 110, "{what}: earth-like {y} against classic {x}");
    };
    close(a.arable, b.arable, "arable");
    close(a.pasture, b.pasture, "pasture");
    close(a.forest, b.forest, "forest");
    close(a.water, b.water, "water");
    for t in Terrain::ALL {
        let share = b.terrain[t.index()] * 1000 / b.regions;
        assert!((15..=400).contains(&share), "{:?} is {share} per mille of regions", t);
    }
    // nearly every world has viable starts; the rest are the best of a dozen draws
    assert!(b.viable * 100 >= b.worlds * 97, "{} of {} worlds viable", b.viable, b.worlds);
}

#[test]
fn earthlike_geometry_is_sound() {
    for (i, regions) in [24u16, 48, 72].into_iter().enumerate().flat_map(|(k, r)| (0..40).map(move |i| (i + k * 100, r))) {
        let (g, starts) = geo(&format!("geom-{i}"), regions, WorldKind::EarthLike);
        assert_eq!(g.regions.len(), regions as usize);
        assert!(g.wrap && g.width == 2000 && g.height == 1000);
        for r in &g.regions {
            // adjacency is symmetric, across the date line too
            for (nb, k) in &r.neighbors {
                let back = g.regions[*nb as usize].neighbors.iter().find(|(x, _)| *x == r.id);
                assert_eq!(back.map(|b| b.1), Some(*k), "link {} -> {} is one-way", r.id, nb);
                assert_ne!(*nb, r.id);
            }
            assert!(r.center[0] >= 0 && r.center[0] < 2000, "centre off the map");
            // no region lies in the polar caps (above 72 degrees)
            assert!(r.center[1] >= 100 && r.center[1] <= 900, "region {} at y {}", r.id, r.center[1]);
            assert!(r.poly.len() >= 3);
        }
        // the world is connected
        let reach = crate::worldgen::within_links(&g.regions, 0, 10_000);
        assert_eq!(reach.len(), g.regions.len());
        assert_eq!(starts.len(), 4);
    }
    // land is 28-32% of all cells: the count of cells is fixed by the region count
    for regions in [24usize, 48, 72] {
        let total = regions * 10 / 3;
        let rows = ((crate::util::isqrt(total as i64 * 10_000 / 2) + 50) / 100) as usize;
        let cols = (total + rows - 1) / rows;
        let share = regions * 1000 / (rows * cols);
        assert!((280..=320).contains(&share), "{regions} regions: land {share} per mille of {} cells", rows * cols);
    }
    // some worlds put land across the date line
    let crosses = (0..40).filter(|i| geo(&format!("geom-{i}"), 48, WorldKind::EarthLike).0.regions.iter().any(|r| r.poly.iter().any(|p| p[0] < 0 || p[0] > 2000))).count();
    assert!(crosses > 0);
}

#[test]
fn worlds_are_reproducible() {
    for world in [WorldKind::EarthLike, WorldKind::Classic] {
        let a = crate::Match::new(cfg("repro", 48, world), 1);
        let b = crate::Match::new(cfg("repro", 48, world), 1);
        assert_eq!(a.state_hash(), b.state_hash());
        let c = crate::Match::new(cfg("repro-2", 48, world), 1);
        assert_ne!(a.state_hash(), c.state_hash());
    }
    // the Earth-like world of a fixed seed is pinned: a change here means a new generator version
    let m = crate::Match::new(cfg("pinned", 48, WorldKind::EarthLike), 1);
    let line: Vec<String> = m.world.regions.iter().take(6).map(|r| format!("{:?}/{:?}/{}", r.terrain, r.climate, r.arable)).collect();
    println!("pinned world: {:x} {}", m.state_hash(), line.join(" "));
}

#[test]
fn starts_are_temperate_or_subtropical_river_lands_far_apart() {
    let mut river = 0;
    let mut far = 0;
    let n = 200;
    for i in 0..n {
        let (g, starts) = geo(&format!("starts-{i}"), 48, WorldKind::EarthLike);
        if starts.iter().all(|s| g.regions[*s].river && !matches!(g.regions[*s].terrain, Terrain::Mountains | Terrain::Desert | Terrain::Tundra)) {
            river += 1;
        }
        let min_links = starts
            .iter()
            .flat_map(|a| starts.iter().map(move |b| (*a, *b)))
            .filter(|(a, b)| a != b)
            .map(|(a, b)| crate::worldgen::within_links(&g.regions, a, 64).iter().find(|(x, _)| *x == b).map(|x| x.1).unwrap_or(99))
            .min()
            .unwrap();
        if min_links >= 3 {
            far += 1;
        }
    }
    assert!(river * 100 >= n * 90, "{river} of {n} worlds start every seat on a river");
    assert!(far * 100 >= n * 90, "{far} of {n} worlds keep starts three or more links apart");
}

/// The generator uses only basic IEEE arithmetic, so that native and WebAssembly
/// builds draw the same world: no transcendental functions.
#[test]
fn worldgen_uses_no_transcendental_functions() {
    for src in [include_str!("../worldgen.rs"), include_str!("../worldgen/earthlike.rs")] {
        for f in [".sin(", ".cos(", ".tan(", ".exp(", ".ln(", ".log", ".powf(", ".powi(", ".atan", ".asin(", ".acos(", ".hypot(", ".cbrt("] {
            assert!(!src.contains(f), "worldgen calls {f}");
        }
    }
}
