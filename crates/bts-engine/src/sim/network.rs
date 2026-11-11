//! Transport networks (design chapter 38, section 5, simplified by chapter 41).
//!
//! Each mode is a building line built per region: the stage sets the loss, the
//! levels set the capacity. A link between two regions carries a mode at the lower
//! stage and the lower level count of its two ends; river links carry natural
//! navigation without building and sea links need harbours at both ends. Carriage
//! inside a civilization follows the least-loss path from the capital. There is no
//! per-link passenger detail, no pipelines and no air freight of general goods.

use crate::content::{content, FacDef};
use crate::state::*;
use bts_protocol::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Roads = 0,
    Canal = 1,
    Harbour = 2,
    Rail = 3,
    Air = 4,
    Transit = 5,
}
pub const MODES: usize = 6;

/// The mode and stage (1-based) of a facility kind, if it is part of a network.
/// The Current and Wire tramways count as urban transit.
pub fn mode_of(def: &FacDef) -> Option<(Mode, u8)> {
    let m = match def.line {
        "roads" => Mode::Roads,
        "canals" => Mode::Canal,
        "harbour" => Mode::Harbour,
        "railway" => Mode::Rail,
        "air" => Mode::Air,
        "urban_transit" => Mode::Transit,
        _ if def.key == "tramways" => Mode::Transit,
        _ => return None,
    };
    Some((m, def.stage.max(1)))
}

/// What each facility kind is to the networks and cities, found once from content:
/// its mode and stage, the residents a level of urban transit moves, whether it is
/// dense housing, and its fortification stage (0 none).
#[derive(Clone, Copy, Debug, Default)]
pub struct KindInfo {
    pub mode: Option<(Mode, u8)>,
    pub transit: i64,
    pub dense: bool,
    pub fort: u8,
}

pub fn kind_info() -> &'static [KindInfo] {
    static T: std::sync::OnceLock<Vec<KindInfo>> = std::sync::OnceLock::new();
    T.get_or_init(|| {
        content()
            .facilities
            .iter()
            .map(|d| KindInfo {
                mode: mode_of(d),
                transit: match d.key {
                    "metro" => 3_000_000,
                    "tramways" => 1_000_000,
                    _ => 0,
                },
                dense: matches!(d.key, "apartments" | "towers"),
                fort: match d.key {
                    "walls" => 1,
                    "bastion" => 2,
                    "fortified_zone" => 3,
                    _ => 0,
                },
            })
            .collect()
    })
}

/// Region freight per level, by mode and stage (facility levels of works served).
const REGION_FREIGHT: [[i64; 3]; MODES] = [[6, 10, 20], [10, 20, 20], [6, 15, 30], [20, 25, 25], [1, 2, 2], [0, 0, 0]];
/// Link freight per level, kt a month, by mode and stage.
const LINK_FREIGHT: [[i64; 3]; MODES] = [[10, 30, 300], [60, 200, 200], [20, 300, 1_500], [200, 300, 300], [0, 0, 0], [0, 0, 0]];
/// Loss per link crossed, basis points, by mode and stage (0 = the mode does not carry).
const LOSS: [[i64; 3]; MODES] = [[500, 350, 100], [250, 150, 150], [600, 120, 50], [150, 120, 120], [0, 0, 0], [0, 0, 0]];
/// Loss on a link with nothing built: tracks, pack animals and coasting boats.
pub const TRACK_LOSS: i64 = 1_200;
pub const TRACK_FREIGHT: i64 = 2;
/// Natural river navigation (T013), and with ocean sailing (T028).
pub const RIVER_LOSS: i64 = 400;
pub const RIVER_LOSS_SAIL: i64 = 300;
/// The floor of the share delivered by a region with no path to the capital, and
/// of any path.
pub const CUT_OFF_BP: i64 = 4_000;

/// A region's network: the best stage of each mode and the levels of all its stages.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Net {
    pub stage: [u8; MODES],
    pub levels: [u16; MODES],
    /// Facility levels of works the network serves (design 5.3), before the base.
    pub freight: i64,
}

impl Net {
    pub fn has(&self, m: Mode) -> bool {
        self.levels[m as usize] > 0
    }
    pub fn stage(&self, m: Mode) -> u8 {
        self.stage[m as usize]
    }
    pub fn levels(&self, m: Mode) -> u16 {
        self.levels[m as usize]
    }
}

/// The network of a region: enabled levels in repair (a level below three tenths
/// of its condition carries nothing).
pub fn net(r: &Region) -> Net {
    let info = kind_info();
    let mut n = Net::default();
    for f in r.facilities.iter().filter(|f| f.enabled && f.level > 0 && f.condition_bp >= 3_000) {
        if let Some((m, s)) = info[f.kind].mode {
            let i = m as usize;
            n.stage[i] = n.stage[i].max(s);
            n.levels[i] += f.level;
            n.freight += f.level as i64 * REGION_FREIGHT[i][(s as usize - 1).min(2)];
        }
    }
    n
}

/// Facility levels of industry, extraction and power a region's network serves
/// (design 5.3): ten for tracks, plus each network level's freight.
pub fn freight_capacity(r: &Region) -> i64 {
    10 + net(r).freight
}

/// A coarse transport grade 0-3 for older views and the victory site check: none;
/// roads or a harbour; a railway or two modes; a railway with highways or a
/// container port, or a modern railway.
pub fn grade(r: &Region) -> u8 {
    let n = net(r);
    let modes = [Mode::Roads, Mode::Canal, Mode::Harbour, Mode::Rail].iter().filter(|m| n.has(**m)).count();
    if n.stage(Mode::Rail) >= 2 || (n.has(Mode::Rail) && (n.stage(Mode::Roads) >= 3 || n.stage(Mode::Harbour) >= 3)) {
        3
    } else if n.has(Mode::Rail) || modes >= 2 {
        2
    } else if modes >= 1 {
        1
    } else {
        0
    }
}

/// What a link carries: its least loss for general goods (basis points) and its
/// freight capacity (kt a month). `sail` is whether the carrier knows ocean sailing
/// (T028) and `boats` whether it knows hulls (T013).
pub fn link(a: &Net, b: &Net, kind: LinkKind, boats: bool, sail: bool) -> (i64, i64) {
    let (loss, cap, _) = link_mode(a, b, kind, boats, sail);
    (loss, cap)
}

/// [`link`] with the way the least loss is had: "tracks" (no network both ends
/// share), "roads", "canal", "harbour", "rail" or "river" (boats on the river
/// itself), for the views (job 4b).
pub fn link_mode(a: &Net, b: &Net, kind: LinkKind, boats: bool, sail: bool) -> (i64, i64, &'static str) {
    let mut loss = if kind == LinkKind::Pass { TRACK_LOSS * 3 / 2 } else { TRACK_LOSS };
    let mut cap = TRACK_FREIGHT;
    let mut mode = "tracks";
    let mut take = |m: Mode, extra_loss: Option<i64>| {
        let i = m as usize;
        let lv = a.levels[i].min(b.levels[i]) as i64;
        if lv == 0 {
            return;
        }
        let s = (a.stage[i].min(b.stage[i]).max(1) as usize - 1).min(2);
        let mut l = extra_loss.unwrap_or(LOSS[i][s]);
        let mut per = LINK_FREIGHT[i][s];
        if m == Mode::Harbour && s == 0 && sail {
            l = 300;
            per = 60;
        }
        if kind == LinkKind::Pass {
            l = l * 3 / 2;
            per /= 2;
        }
        if l > 0 && l < loss {
            loss = l;
            mode = match m {
                Mode::Roads => "roads",
                Mode::Canal => "canal",
                Mode::Harbour => "harbour",
                Mode::Rail => "rail",
                Mode::Air => "air",
                Mode::Transit => "transit",
            };
        }
        cap += lv * per;
    };
    match kind {
        LinkKind::Land | LinkKind::Pass => {
            take(Mode::Roads, None);
            take(Mode::Rail, None);
        }
        LinkKind::River => {
            take(Mode::Roads, None);
            take(Mode::Rail, None);
            take(Mode::Canal, None);
            if boats {
                let l = if sail { RIVER_LOSS_SAIL } else { RIVER_LOSS };
                if l < loss {
                    loss = l;
                    mode = "river";
                }
                cap += 20;
            }
        }
        LinkKind::Sea => take(Mode::Harbour, None),
    }
    (loss, cap, mode)
}

/// Share of non-food output that survives carriage to the common stock, by region:
/// `max(4,000, 10,000 - loss along the least-loss path from the capital through
/// regions the seat controls)`; 10,000 at the capital, 4,000 for a region with no
/// path (design 5.5).
pub fn link_efficiencies(w: &World, seat: SeatId) -> Vec<i64> {
    let n = w.regions.len();
    let civ = &w.civs[seat as usize];
    let (boats, sail) = (civ.knows_id("T013"), civ.knows_id("T028"));
    let capital = civ.capital as usize;
    let nets: Vec<Net> = w.regions.iter().map(|r| if r.controller == Some(seat) { net(r) } else { Net::default() }).collect();
    let mut dist = vec![i64::MAX; n];
    if capital < n && w.regions[capital].controller == Some(seat) {
        dist[capital] = 0;
        // Dijkstra over at most a few hundred regions: a linear scan per step is enough
        let mut done = vec![false; n];
        loop {
            let mut best: Option<usize> = None;
            for i in 0..n {
                if !done[i] && dist[i] != i64::MAX && best.map(|b| dist[i] < dist[b]).unwrap_or(true) {
                    best = Some(i);
                }
            }
            let Some(x) = best else { break };
            done[x] = true;
            for (nb, kind) in &w.regions[x].neighbors {
                let nb = *nb as usize;
                if w.regions[nb].controller != Some(seat) || done[nb] {
                    continue;
                }
                let (l, _) = link(&nets[x], &nets[nb], *kind, boats, sail);
                let d = dist[x] + l;
                if d < dist[nb] {
                    dist[nb] = d;
                }
            }
        }
    }
    (0..n)
        .map(|i| {
            if w.regions[i].controller != Some(seat) {
                0
            } else if i == capital {
                10_000
            } else if dist[i] == i64::MAX {
                CUT_OFF_BP
            } else {
                (10_000 - dist[i]).max(CUT_OFF_BP)
            }
        })
        .collect()
}

/// Food access of a region (design chapter 38, section 2.4), basis points:
/// `10,000 + best water term + best land term`, at most 22,000.
pub fn access_bp(r: &Region) -> i64 {
    let n = net(r);
    let mut water = if r.site.navigable_river || r.river { 2_500 } else { 0 };
    water = water.max(match n.stage(Mode::Harbour) {
        0 => 0,
        1 => 2_500,
        2 => 4_000,
        _ => 6_000,
    });
    water += match n.stage(Mode::Canal) {
        0 => 0,
        1 => 1_500,
        _ => 3_000,
    };
    let road = match n.stage(Mode::Roads) {
        0 => 0,
        1 => 1_000,
        2 => 1_500,
        _ => 3_000,
    };
    let rail = match n.stage(Mode::Rail) {
        0 => 0,
        1 => 3_000,
        _ => 4_000,
    };
    (10_000 + water + road.max(rail)).min(22_000)
}

/// Voluntary out-migration a region's best mode allows, basis points of its
/// residents a year (design chapter 38, section 3.4).
pub fn mobility_cap_bp(r: &Region) -> i64 {
    let n = net(r);
    if n.stage(Mode::Rail) >= 3 || n.stage(Mode::Air) >= 2 {
        250
    } else if n.stage(Mode::Roads) >= 3 {
        200
    } else if n.has(Mode::Rail) {
        150
    } else if n.has(Mode::Harbour) || r.site.navigable_river {
        80
    } else if n.has(Mode::Roads) {
        60
    } else {
        30
    }
}

/// Urban mobility of a region's city, residents who can reach their work
/// (design chapter 38, section 2.5).
pub fn urban_mobility(r: &Region) -> i64 {
    let n = net(r);
    let roads = n.levels(Mode::Roads) as i64 * if n.stage(Mode::Roads) >= 3 { 1_000_000 } else { 250_000 };
    let rail = n.levels(Mode::Rail) as i64 * 500_000;
    let info = kind_info();
    let transit: i64 = r.facilities.iter().filter(|f| f.enabled && f.level > 0).map(|f| f.level as i64 * info[f.kind].transit).sum();
    500_000 + roads + rail + transit
}

/// The reach weight of the best mode on a link (design 5.2, `w`), basis points.
pub fn reach_weight(a: &Net, b: &Net, kind: LinkKind) -> i64 {
    let both = |m: Mode| a.stage(m).min(b.stage(m));
    let mut w = 500;
    if kind == LinkKind::Sea {
        w = w.max(match both(Mode::Harbour) {
            0 => 500,
            1 => 1_000,
            2 => 2_000,
            _ => 2_500,
        });
    } else {
        w = w.max(match both(Mode::Roads) {
            0 => 500,
            1 => 1_000,
            2 => 1_500,
            _ => 3_500,
        });
        w = w.max(match both(Mode::Rail) {
            0 => 500,
            1 => 2_500,
            2 => 3_000,
            _ => 6_000,
        });
        if kind == LinkKind::River {
            w = w.max(1_500);
        }
    }
    w
}
