//! Campaign-level warfare: training, supply, movement, simultaneous monthly
//! losses, capture after sustained control, and elimination.
//!
//! There is no combat die. Power is engaged people × 2.5^generation × proficiency ×
//! supply × morale × terrain, adjusted by the three-role counter matrix while the
//! two sides' mean generations differ by less than two (design chapter 37, 2.2).

use crate::content::{content, Cap, COUNTER, GEN_POWER};
use crate::sim::chronicle::{brief, moment, reported};
use crate::state::*;
use bts_protocol::*;

/// Home-defence militia: one working adult in forty, at most this many.
const MILITIA_MAX: u32 = 500_000;

/// The generation home militia fight with (design chapter 37, 2.4): two below the
/// best, raised to the best generation of which the kit store holds a set for every
/// militiaman, never above the best.
pub fn militia_gen(w: &World, seat: SeatId, militia: u32) -> u8 {
    let best = military_tier(w, seat);
    let kit = &w.civs[seat as usize].kit;
    let mut g = best.saturating_sub(2);
    for k in (g + 1)..=best {
        if kit.get(k as usize).copied().unwrap_or(0) >= militia.max(1) {
            g = k;
        }
    }
    g
}

/// Power per soldier of a formation (thousandths) and its generation (thousandths):
/// a refit blends the old and the new by the share converted (design 2.3).
pub fn unit_power(a: &Army) -> (i64, i64) {
    let g = a.fighting_gen() as usize;
    match a.refit_to {
        Some(t) => {
            let t = (t.saturating_sub(a.degraded) as usize).min(GEN_POWER.len() - 1);
            let s = a.refit_bp as i64;
            (GEN_POWER[g] * (10_000 - s) / 10_000 + GEN_POWER[t] * s / 10_000, (g as i64 * (10_000 - s) + t as i64 * s) / 10)
        }
        None => (GEN_POWER[g], g as i64 * 1000),
    }
}

pub fn military_tier(w: &World, seat: SeatId) -> u8 {
    let c = content();
    let ctx = CivCtx { world: w, seat };
    let mut best = 0;
    for t in &c.unit_tiers {
        if t.req.eval(&ctx) {
            best = best.max(t.tier);
        }
    }
    best
}

/// Additional soldiers the population would currently supply.
pub fn recruit_room(w: &World, seat: SeatId) -> u32 {
    let civ = &w.civs[seat as usize];
    let working: i64 = w.regions.iter().filter(|r| r.controller == Some(seat) && r.owner == Some(seat)).map(|r| r.working() as i64).sum();
    // even a camp can raise a small warband; rotating duty and professional command widen the pool
    let mut share: i64 = 800;
    if civ.est_id("C016") {
        share = 1200;
    }
    if civ.est_id("C037") {
        share = 1600;
    }
    if crate::sim::culture::belief_share(w, seat, "watchfulness") > 3000 {
        share += 200;
    }
    let m = w.lineages[civ.lineage as usize].axes[7] as i64;
    share = share * (5000 + m) / 10_000;
    if civ.contacts.iter().any(|c| c.at_war) {
        share = share * 3 / 2;
    }
    share = share * crate::sim::eras::recruit_bp(civ, w.month) / 10_000;
    let serving: i64 = w.armies.iter().filter(|a| a.owner == seat).map(|a| a.count() as i64).sum();
    let pending: i64 = civ.projects.iter().map(|p| if let ProjKind::Recruit { soldiers, .. } = p.kind { soldiers as i64 } else { 0 }).sum();
    ((working + serving) * share / 10_000 - serving - pending).max(0) as u32
}

pub fn hostile(w: &World, a: SeatId, b: SeatId) -> bool {
    a != b && w.at_war(a, b)
}

pub fn friendly(w: &World, a: SeatId, b: SeatId) -> bool {
    a == b || w.top_authority(a) == w.top_authority(b)
}

pub fn declare_war(w: &mut World, aggressor: SeatId, victim: SeatId, reason: &str) {
    if aggressor == victim || w.at_war(aggressor, victim) {
        return;
    }
    w.routes_dirty = true;
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let (an, vn) = (w.civs[aggressor as usize].name.clone(), w.civs[victim as usize].name.clone());
    let mut broke_pact = false;
    let mut ended = Vec::new();
    for (ti, t) in w.treaties.iter_mut().enumerate() {
        if t.status == "active" && t.parties.contains(&aggressor) && t.parties.contains(&victim) {
            if t.clauses.iter().any(|c| matches!(c, Clause::NonAggression { .. } | Clause::DefensivePact { .. } | Clause::Subordination { .. })) {
                broke_pact = true;
            }
            t.status = "broken".into();
            t.performance.push(format!("{when}: ended by war ({an} against {vn})"));
            ended.push(ti);
        }
    }
    // war ends every secondment and joint programme between the parties at once
    for ti in ended {
        crate::sim::diplomacy::end_cooperation(w, ti, crate::sim::diplomacy::Ending::War);
    }
    // a subordinate attacking, or being attacked by, its overlord ends the subordination
    if w.civs[aggressor as usize].overlord == Some(victim) {
        w.civs[aggressor as usize].overlord = None;
    }
    if w.civs[victim as usize].overlord == Some(aggressor) {
        w.civs[victim as usize].overlord = None;
    }
    for (x, y) in [(aggressor, victim), (victim, aggressor)] {
        let ct = &mut w.civs[x as usize].contacts[y as usize];
        ct.met = true;
        if ct.month == 0 {
            ct.month = month;
        }
        ct.at_war = true;
        ct.war_since = month;
    }
    {
        let ct = &mut w.civs[victim as usize].contacts[aggressor as usize];
        ct.trust = (ct.trust - if broke_pact { 45 } else { 25 }).max(0);
        ct.notes.push(format!("{when}: attacked us{}", if broke_pact { " in breach of a signed commitment" } else { "" }));
    }
    let capital_a = w.civs[aggressor as usize].capital;
    let capital_v = w.civs[victim as usize].capital;
    moment(w, aggressor, MomentCategory::War, format!("War against {vn}"), format!("{an} opened hostilities against {vn}. {reason}"), Some(capital_a), "war", true, vec![format!("Hostilities began in {when}")]);
    moment(w, victim, MomentCategory::War, format!("{an} attacks"), format!("Forces of {an} crossed into our territory. {vn} is at war."), Some(capital_v), "war", true, vec![format!("Hostilities began in {when}")]);
    brief(w, victim, "danger", format!("{an} has attacked"), "Raise and position forces, or seek terms.".into(), None, "military");
    for o in 0..w.civs.len() {
        let os = o as SeatId;
        if os == aggressor || os == victim || w.civs[o].status == SeatStatus::Eliminated {
            continue;
        }
        if w.civs[o].contacts[aggressor as usize].met {
            let ct = &mut w.civs[o].contacts[aggressor as usize];
            ct.trust = (ct.trust - if broke_pact { 15 } else { 5 }).max(0);
            reported(w, os, MomentCategory::War, format!("War between {an} and {vn}"), format!("Reports say {an} has attacked {vn}."), None, "war", vec![format!("Reported in {when}")]);
        }
        // defensive pacts answer the attack
        let pact = w.treaties.iter().any(|t| t.status == "active" && t.parties.contains(&os) && t.parties.contains(&victim) && t.clauses.iter().any(|c| matches!(c, Clause::DefensivePact { .. })));
        if pact && !w.at_war(os, aggressor) {
            declare_war(w, os, aggressor, "A defensive pact was invoked.");
        }
    }
    // subordinates follow their overlord into war
    for o in 0..w.civs.len() {
        let os = o as SeatId;
        if w.civs[o].overlord == Some(victim) && !w.at_war(os, aggressor) && os != aggressor {
            for (x, y) in [(aggressor, os), (os, aggressor)] {
                let ct = &mut w.civs[x as usize].contacts[y as usize];
                ct.at_war = true;
                ct.war_since = month;
                ct.met = true;
            }
        }
    }
}

pub fn make_peace(w: &mut World, a: SeatId, b: SeatId) {
    w.routes_dirty = true;
    let month = w.month;
    for (x, y) in [(a, b), (b, a)] {
        let ct = &mut w.civs[x as usize].contacts[y as usize];
        ct.at_war = false;
        ct.last_peace = month;
    }
    // forces standing on the other's land go home; unfinished captures lapse
    for i in 0..w.armies.len() {
        let (owner, region) = (w.armies[i].owner, w.armies[i].region as usize);
        let other = if owner == a { b } else if owner == b { a } else { continue };
        if w.regions[region].controller == Some(other) {
            let home = w.civs[owner as usize].capital;
            w.armies[i].region = home;
            w.armies[i].order = ArmyOrder::Hold;
        }
    }
    for r in w.regions.iter_mut() {
        if let Some((s, _)) = r.capture {
            if (s == a && r.controller == Some(b)) || (s == b && r.controller == Some(a)) {
                r.capture = None;
            }
        }
    }
}

fn next_step(w: &World, army: &Army, target: usize, attack: bool) -> Option<(usize, LinkKind)> {
    let start = army.region as usize;
    if start == target {
        return None;
    }
    let seat = army.owner;
    let sea_ok = w.civs[seat as usize].knows_id("T013");
    let n = w.regions.len();
    let mut prev: Vec<Option<usize>> = vec![None; n];
    let mut seen = vec![false; n];
    seen[start] = true;
    let mut queue = vec![start];
    let mut qi = 0;
    while qi < queue.len() {
        let x = queue[qi];
        qi += 1;
        if x == target {
            break;
        }
        for (nb, kind) in &w.regions[x].neighbors {
            let nb = *nb as usize;
            if seen[nb] || (*kind == LinkKind::Sea && !sea_ok) {
                continue;
            }
            let ctrl = w.regions[nb].controller;
            let passable = match ctrl {
                None => true,
                Some(c) => friendly(w, seat, c) || hostile(w, seat, c) || (attack && nb == target),
            };
            if !passable {
                continue;
            }
            seen[nb] = true;
            prev[nb] = Some(x);
            queue.push(nb);
        }
    }
    if !seen[target] {
        return None;
    }
    let mut cur = target;
    while let Some(p) = prev[cur] {
        if p == start {
            return w.link(start, cur).map(|k| (cur, k));
        }
        cur = p;
    }
    None
}

struct Side {
    armies: Vec<usize>,
    militia: u32,
    militia_tier: u8,
    /// Raider warriors (irregulars, equal roles, 80% power) and their generation.
    irregular: u32,
    irregular_gen: u8,
    irregular_morale: u16,
}

impl Side {
    fn of(armies: Vec<usize>) -> Side {
        Side { armies, militia: 0, militia_tier: 0, irregular: 0, irregular_gen: 0, irregular_morale: 8_000 }
    }
}

/// What a side brings: power by role, people, and its power-weighted generation
/// (thousandths).
struct Force {
    by_role: [i64; 3],
    people: u32,
    gen_milli: i64,
}

fn force(w: &World, side: &Side) -> Force {
    let mut by_role = [0i64; 3];
    let mut people = 0u32;
    let mut gen_w = 0i64;
    let mut pw = 0i64;
    for &ai in &side.armies {
        let a = &w.armies[ai];
        let quality = a.proficiency_bp as i64 * a.supply_bp.max(2000) as i64 / 10_000 * a.morale_bp.max(2000) as i64 / 10_000;
        // a tradition variant's bonuses by role (design chapter 37, section 2.6)
        let vp = crate::sim::eras::variant_power(&w.civs[a.owner as usize], a.variant);
        let (per, g) = unit_power(a);
        for role in 0..3 {
            let p = a.soldiers[role] as i64 * per / 1000 * quality / 10_000 * vp[role] / 10_000;
            by_role[role] += p;
            gen_w += p / 1000 * g;
            pw += p / 1000;
        }
        people += a.count();
    }
    if side.militia > 0 {
        // defenders of their own homes: untrained, lightly armed, holding positions
        let p = side.militia as i64 * GEN_POWER[side.militia_tier as usize] / 1000 * 4000 / 10_000;
        by_role[2] += p;
        gen_w += p / 1000 * side.militia_tier as i64 * 1000;
        pw += p / 1000;
        people += side.militia;
    }
    if side.irregular > 0 {
        let p = side.irregular as i64 * GEN_POWER[side.irregular_gen as usize] / 1000 * crate::sim::raiders::IRREGULAR_BP / 10_000 * side.irregular_morale.max(2_000) as i64 / 10_000;
        for r in by_role.iter_mut() {
            *r += p / 3;
        }
        gen_w += p / 1000 * side.irregular_gen as i64 * 1000;
        pw += p / 1000;
        people += side.irregular;
    }
    Force { by_role, people, gen_milli: if pw > 0 { gen_w / pw } else { 0 } }
}

/// The power a side engages against an enemy: the counter matrix applies while the
/// two mean generations differ by less than two; beyond that the older side's
/// factor is a flat 8,000 and the newer side's 10,000 (design chapter 37, 2.2).
fn engaged(f: &Force, enemy: &Force, terrain_bp: i64) -> i64 {
    let total: i64 = f.by_role.iter().sum();
    if total == 0 {
        return 0;
    }
    total * counter_bp(f.by_role, f.gen_milli, enemy.by_role, enemy.gen_milli) / 10_000 * terrain_bp / 10_000
}

/// The counter factor of a side against an enemy (basis points), from their power by
/// role and mean generations in thousandths (design chapter 37, 2.2).
pub(crate) fn counter_bp(own: [i64; 3], own_gen: i64, enemy: [i64; 3], enemy_gen: i64) -> i64 {
    let (total, esum): (i64, i64) = (own.iter().sum(), enemy.iter().sum());
    if total == 0 || esum == 0 {
        return 10_000;
    }
    if (own_gen - enemy_gen).abs() >= 2000 {
        return if own_gen < enemy_gen { 8_000 } else { 10_000 };
    }
    let mix = [own[0] * 10_000 / total, own[1] * 10_000 / total, own[2] * 10_000 / total];
    let emix = [enemy[0] * 10_000 / esum, enemy[1] * 10_000 / esum, enemy[2] * 10_000 / esum];
    let mut c = 0;
    for i in 0..3 {
        for j in 0..3 {
            c += mix[i] * emix[j] / 10_000 * COUNTER[i][j] / 10_000;
        }
    }
    c
}

fn terrain_factor(t: Terrain) -> i64 {
    match t {
        Terrain::Hills | Terrain::Mountains | Terrain::Forest | Terrain::Marsh => 11_500,
        _ => 10_500,
    }
}

fn home_militia(w: &World, ri: usize, ctrl: SeatId) -> u32 {
    if w.regions[ri].owner != Some(ctrl) {
        return 0;
    }
    let militia_f = crate::sim::eras::militia_bp(&w.civs[ctrl as usize]);
    ((w.regions[ri].working() as i64 / 40).min(MILITIA_MAX as i64) * militia_f / 10_000) as u32
}

fn defenders_of(w: &World, ri: usize, ctrl: SeatId) -> Side {
    let armies: Vec<usize> = (0..w.armies.len()).filter(|i| w.armies[*i].region as usize == ri && w.armies[*i].count() > 0 && friendly(w, w.armies[*i].owner, ctrl)).collect();
    let militia = home_militia(w, ri, ctrl);
    let mut side = Side::of(armies);
    side.militia = militia;
    side.militia_tier = militia_gen(w, ctrl, militia);
    side
}

/// The power defending a region against attackers of a generation (raid deterrence).
pub fn region_defence(w: &World, ri: usize, attacker_gen: u8) -> i64 {
    let Some(ctrl) = w.regions[ri].controller else { return 0 };
    let side = defenders_of(w, ri, ctrl);
    let f = force(w, &side);
    let t = crate::sim::cities::defence_bp(w, ri, terrain_factor(w.regions[ri].terrain), attacker_gen);
    f.by_role.iter().sum::<i64>() * t / 10_000
}

/// One month's battle of a raid on `ri` by camp `ci` (design chapter 40, 5.4).
/// Returns whether the raiders prevailed. Defender losses are booked as war
/// deaths of the seat; raider losses as deaths outside every seat's books.
pub fn raid_battle(w: &mut World, ci: usize, ri: usize) -> bool {
    let ctrl = w.regions[ri].controller.unwrap();
    let def = defenders_of(w, ri, ctrl);
    let mut att = Side::of(vec![]);
    att.irregular = crate::sim::raiders::warriors(w, ci);
    att.irregular_gen = w.raider_gen;
    att.irregular_morale = w.camps[ci].morale_bp;
    let (fa, fd) = (force(w, &att), force(w, &def));
    let pa = engaged(&fa, &fd, 10_000);
    let t = crate::sim::cities::defence_bp(w, ri, terrain_factor(w.regions[ri].terrain), w.raider_gen);
    let pd = engaged(&fd, &fa, t);
    if pd == 0 {
        return true;
    }
    let loss_att = (1000 * pd / pa.max(1)).clamp(10, 3000);
    let loss_def = (1000 * pa / pd.max(1)).clamp(0, 3000);
    let ld = apply_losses(w, &def, loss_def);
    let militia_lost = crate::sim::population::draw_adults(w, ri, (def.militia as i64 * loss_def / 10_000) as u32);
    let f = &mut w.civs[ctrl as usize].flows;
    f.deaths += ld + militia_lost;
    f.deaths_cause[crate::sim::population::CAUSE_WAR] += ld + militia_lost;
    crate::sim::raiders::kill_warriors(w, ci, (att.irregular as i64 * loss_att / 10_000) as u32);
    let won = pa > pd;
    let m = &mut w.camps[ci].morale_bp;
    *m = (*m as i64 + if won { 300 } else { -1500 }).clamp(500, 10_000) as u16;
    won
}

/// Formations fighting a raider camp in its own region (design chapter 40, 5.6).
fn camp_battles(w: &mut World) {
    let mut ci = 0;
    while ci < w.camps.len() {
        let ri = w.camps[ci].region as usize;
        let present: Vec<usize> = (0..w.armies.len()).filter(|i| w.armies[*i].region as usize == ri && w.armies[*i].count() > 0 && w.armies[*i].training_left == 0).collect();
        if present.is_empty() {
            ci += 1;
            continue;
        }
        let lead = w.armies[present[0]].owner;
        let att = Side::of(present.clone());
        let mut def = Side::of(vec![]);
        def.irregular = crate::sim::raiders::warriors(w, ci);
        def.irregular_gen = w.raider_gen;
        def.irregular_morale = w.camps[ci].morale_bp;
        if def.irregular == 0 {
            crate::sim::raiders::broken(w, ci, lead);
            continue;
        }
        // irregulars defend their home ground: x1.25 in rough land
        let home = if matches!(w.regions[ri].terrain, Terrain::Hills | Terrain::Mountains | Terrain::Forest | Terrain::Marsh) { 12_500 } else { 10_000 };
        let (fa, fd) = (force(w, &att), force(w, &def));
        let pa = engaged(&fa, &fd, 10_000);
        let pd = engaged(&fd, &fa, home);
        let loss_att = (1000 * pd / pa.max(1)).clamp(10, 3000);
        let loss_def = (1000 * pa / pd.max(1)).clamp(0, 3000);
        let la = apply_losses(w, &att, loss_att);
        let f = &mut w.civs[lead as usize].flows;
        f.deaths += la;
        f.deaths_cause[crate::sim::population::CAUSE_WAR] += la;
        let killed = crate::sim::raiders::kill_warriors(w, ci, (def.irregular as i64 * loss_def / 10_000) as u32);
        let m = &mut w.camps[ci].morale_bp;
        *m = (*m as i64 + if loss_def > loss_att { -1500 } else { 200 }).clamp(500, 10_000) as u16;
        for &ai in &present {
            let a = &mut w.armies[ai];
            a.morale_bp = (a.morale_bp as i64 + if loss_att > loss_def { -700 } else { 150 }).clamp(500, 10_000) as u16;
        }
        // the camp breaks when its warriors fall below a fifth or its morale fails
        let left = def.irregular - killed.min(def.irregular);
        if (left as u64) * 5 < def.irregular as u64 && pa > pd || w.camps[ci].morale_bp < 3_000 {
            crate::sim::raiders::broken(w, ci, lead);
            continue;
        }
        let rname = w.regions[ri].name.clone();
        brief(w, lead, "warning", format!("Fighting raiders at {rname}"), format!("Our forces lost {}; the raiders lost about {}.", crate::util::group(la as i64), crate::util::group(killed as i64)), Some(ri as RegionId), "military");
        ci += 1;
    }
}

fn apply_losses(w: &mut World, side: &Side, frac_bp: i64) -> u32 {
    let mut lost = 0;
    for &ai in &side.armies {
        // augmented soldiers (Living Systems) lose fewer
        let frac_bp = frac_bp * crate::sim::eras::variant_losses_bp(&w.civs[w.armies[ai].owner as usize], w.armies[ai].variant) / 10_000;
        let a = &mut w.armies[ai];
        for role in 0..3 {
            let l = (a.soldiers[role] as i64 * frac_bp / 10_000) as u32;
            let l = l.max(if a.soldiers[role] > 0 && frac_bp > 1500 { 1 } else { 0 }).min(a.soldiers[role]);
            a.soldiers[role] -= l;
            lost += l;
        }
        a.in_battle = true;
        a.proficiency_bp = (a.proficiency_bp + 60).min(10_000);
    }
    lost
}

/// Armistice by standing war policies (design chapter 36, section 2.6): when both
/// sides of a war accept a white peace and no region has changed hands between them
/// for the longer of their two terms and 36 months, the war ends as it stands.
pub fn armistices(w: &mut World) {
    let n = w.civs.len();
    let month = w.month;
    for a in 0..n {
        for b in a + 1..n {
            if !w.at_war(a as SeatId, b as SeatId) {
                continue;
            }
            let pa = w.civs[a].war_policy.get(b).copied().flatten();
            let pb = w.civs[b].war_policy.get(a).copied().flatten();
            let (Some((ma, _)), Some((mb, _))) = (pa, pb) else { continue };
            let need = (ma as u32).max(mb as u32).max(36);
            let ct = &w.civs[a].contacts[b];
            let since = ct.war_since.max(ct.last_control_change);
            if month < since + need {
                continue;
            }
            make_peace(w, a as SeatId, b as SeatId);
            let (an, bn) = (w.civs[a].name.clone(), w.civs[b].name.clone());
            let when = crate::util::event_label(&w.cfg, month);
            for (x, other) in [(a, bn.clone()), (b, an.clone())] {
                let cap = w.civs[x].capital;
                moment(w, x as SeatId, MomentCategory::Diplomacy, format!("Armistice with {other}"), format!("With no ground changing hands for {need} months and both governments willing, the war with {other} ended where the lines stood."), Some(cap), "treaty", true, vec![format!("Armistice in {when}")]);
            }
        }
    }
}

pub fn step(w: &mut World) {
    let c = content();
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    // munitions go five times as fast in a month of battle (design chapter 36, 5.4)
    let fought: Vec<bool> = w.armies.iter().map(|a| a.in_battle).collect();
    for a in w.armies.iter_mut() {
        a.in_battle = false;
    }
    armistices(w);

    // ---- training and upkeep --------------------------------------------------
    // the best generation of each seat (obsolescence) and refits still ordered
    let best: Vec<u8> = (0..w.civs.len()).map(|s| military_tier(w, s as SeatId)).collect();
    for i in 0..w.armies.len() {
        let (owner, id) = (w.armies[i].owner as usize, w.armies[i].id);
        if w.armies[i].refit_to.is_some() && !w.civs[owner].projects.iter().any(|p| matches!(p.kind, ProjKind::Refit { army, .. } if army == id)) {
            w.armies[i].refit_to = None;
            w.armies[i].refit_bp = 0;
        }
    }
    for i in 0..w.armies.len() {
        let owner = w.armies[i].owner as usize;
        let tier = w.armies[i].tier as usize;
        let count = w.armies[i].count() as i64;
        let def = &c.unit_tiers[tier];
        let mut ok: i64 = 10_000;
        let mut crit: i64 = 10_000;
        let obsolete = (tier as u8) + 3 <= best[owner];
        // the variant's swaps, the Standing Army's surcharge; a refit pays the new
        // generation's upkeep for the share converted (design 2.3)
        let mut upkeep: Vec<(Good, i64, bool)> = crate::sim::eras::variant_goods(w.armies[i].variant, &def.upkeep, true).into_iter().map(|(g, a)| (g, a, def.critical.contains(&g))).collect();
        if let Some(t) = w.armies[i].refit_to {
            let s = w.armies[i].refit_bp as i64;
            let nd = &c.unit_tiers[t as usize];
            let nv = crate::sim::eras::variant_for(&w.civs[owner], t);
            for u in upkeep.iter_mut() {
                u.1 = u.1 * (10_000 - s) / 10_000;
            }
            for (g, a) in crate::sim::eras::variant_goods(nv, &nd.upkeep, true) {
                let add = a * s / 10_000;
                match upkeep.iter_mut().find(|u| u.0 == g) {
                    Some(u) => u.1 += add,
                    None => upkeep.push((g, add, nd.critical.contains(&g))),
                }
            }
        }
        let mut upkeep_f = crate::sim::eras::army_upkeep_bp(&w.civs[owner]);
        if obsolete {
            // spares and tools for patterns no longer made (design 2.7)
            upkeep_f = upkeep_f * 3 / 2;
        }
        let cap_add = crate::sim::eras::proficiency_add(&w.civs[owner], tier as u8, w.armies[i].variant);
        if w.armies[i].variant.and_then(|v| crate::sim::eras::TRADITIONS.get(v as usize)).map(|t| t.key == "synthetic").unwrap_or(false) {
            // autonomous swarms draw compute from the month's supply
            let need = count * crate::sim::eras::SWARM_COMPUTE_PER_K / 1000;
            let civ = &mut w.civs[owner];
            let free = (civ.compute_supply - civ.compute_used).max(0);
            let got = need.min(free);
            civ.compute_used += got;
            if need > 0 {
                ok = ok.min(got * 10_000 / need);
            }
        }
        for (g, a, critical) in &upkeep {
            if *g == Good::Food {
                continue;
            }
            // upkeep is stated per thousand soldiers
            let need = a * count / 1000 * upkeep_f / 10_000 * if *g == Good::Munitions && fought.get(i).copied().unwrap_or(false) { 5 } else { 1 };
            if need > 0 {
                let got = w.civs[owner].take(*g, need);
                ok = ok.min(got * 10_000 / need);
                if *critical {
                    crit = crit.min(got * 10_000 / need);
                }
            }
        }
        let a = &mut w.armies[i];
        a.supply_bp = ((a.supply_bp as i64 * 2 + ok.min(a.supply_bp as i64 + 4000)) / 3).clamp(1000, 10_000) as u16;
        // vehicles parked, fighting dismounted: three months short of the critical
        // goods cost a generation, three months nearly without them two; one good
        // month restores it (design 2.5)
        if crit >= 8_000 {
            a.crit_low = 0;
            a.crit_vlow = 0;
            a.degraded = 0;
        } else {
            a.crit_low = if crit < 5_000 { a.crit_low.saturating_add(1) } else { 0 };
            a.crit_vlow = if crit < 2_000 { a.crit_vlow.saturating_add(1) } else { 0 };
            let d = if a.crit_vlow >= 3 { 2 } else if a.crit_low >= 3 { 1 } else { 0 };
            a.degraded = a.degraded.max(d).min(a.tier);
        }
        if a.training_left > 0 {
            a.training_left -= 1;
            let total = def.training_months.max(1) as i64;
            let done = total - a.training_left as i64;
            a.proficiency_bp = (3000 + 4000 * done / total) as u16;
        } else if (a.proficiency_bp as i64) < 7500 + cap_add {
            a.proficiency_bp += 20;
        }
        if a.refit_to.is_some() {
            // the retraining dip of a refit (design 2.3)
            a.proficiency_bp = a.proficiency_bp.min((6_000 + 3_000 * a.refit_bp as i64 / 10_000) as u16);
        }
        if a.morale_bp < 8000 {
            a.morale_bp += 150;
        }
        if obsolete {
            a.morale_bp = a.morale_bp.min(6_000);
        }
    }

    // ---- movement ----------------------------------------------------------------
    for i in 0..w.armies.len() {
        if w.armies[i].training_left > 0 {
            continue;
        }
        let order = w.armies[i].order.clone();
        let (target, attack) = match order {
            ArmyOrder::Move { to } => (to as usize, false),
            ArmyOrder::Attack { region } => (region as usize, true),
            _ => continue,
        };
        if w.armies[i].region as usize == target {
            if !attack {
                w.armies[i].order = ArmyOrder::Hold;
            }
            continue;
        }
        let Some((next, kind)) = next_step(w, &w.armies[i], target, attack) else {
            let owner = w.armies[i].owner;
            let name = w.armies[i].name.clone();
            w.armies[i].order = ArmyOrder::Hold;
            brief(w, owner, "warning", format!("{name} cannot reach its objective"), "No known passable route leads there. The formation is holding.".into(), None, "military");
            continue;
        };
        let needed = match kind {
            LinkKind::Land | LinkKind::River => 1,
            LinkKind::Pass | LinkKind::Sea => 2,
        };
        w.armies[i].move_progress += 1;
        if w.armies[i].move_progress < needed {
            continue;
        }
        w.armies[i].move_progress = 0;
        let owner = w.armies[i].owner;
        if let Some(ctrl) = w.regions[next].controller {
            if !friendly(w, owner, ctrl) && !hostile(w, owner, ctrl) {
                if attack && next == target && !w.first_month_of_round() {
                    // a war between seats begins only in the first month of a round:
                    // the formation waits at the border with its order standing
                    w.armies[i].move_progress = needed - 1;
                    continue;
                }
                if attack && next == target {
                    declare_war(w, owner, ctrl, "Its forces marched on a neighbouring region.");
                } else {
                    w.armies[i].order = ArmyOrder::Hold;
                    continue;
                }
            }
        }
        w.armies[i].region = next as RegionId;
    }

    // ---- raider camps ------------------------------------------------------------------
    camp_battles(w);

    // ---- battles and occupation -----------------------------------------------------
    for ri in 0..w.regions.len() {
        let present: Vec<usize> = (0..w.armies.len()).filter(|i| w.armies[*i].region as usize == ri && w.armies[*i].count() > 0).collect();
        let ctrl = w.regions[ri].controller;
        let Some(ctrl) = ctrl else { continue };
        let attackers: Vec<usize> = present.iter().copied().filter(|i| hostile(w, w.armies[*i].owner, ctrl) && w.armies[*i].training_left == 0).collect();
        if attackers.is_empty() {
            if w.regions[ri].capture.is_some() {
                w.regions[ri].capture = None;
            }
            continue;
        }
        let lead = w.armies[attackers[0]].owner;
        let def_side = defenders_of(w, ri, ctrl);
        let defenders = def_side.armies.clone();
        let militia = def_side.militia;
        let att_side = Side::of(attackers.clone());
        let (fa, fd) = (force(w, &att_side), force(w, &def_side));
        let (att_people, def_people) = (fa.people, fd.people);
        let pa = engaged(&fa, &fd, 10_000);
        // the city and its walls (design chapter 38, sections 4.1-4.2), against the
        // newest equipment among the attackers
        let att_tier = attackers.iter().map(|i| w.armies[*i].fighting_gen()).max().unwrap_or(0);
        let terrain_bp = crate::sim::cities::defence_bp(w, ri, terrain_factor(w.regions[ri].terrain), att_tier);
        let pd = engaged(&fd, &fa, terrain_bp);
        let contested = pd > 0 && def_people > 0;
        // defenders outmatched three to one cannot keep control, though they still fight
        let overwhelmed = contested && pa >= pd * 3;
        if contested {
            // simultaneous losses from the same month-start state
            // losses follow the power actually brought against a side; a handful of raiders
            // cannot bleed an army, and nobody loses more than three tenths in a month
            let loss_att = (1000 * pd / pa.max(1)).clamp(10, 3000);
            let loss_def = (1000 * pa / pd.max(1)).clamp(0, 3000);
            let la = apply_losses(w, &att_side, loss_att);
            let ld = apply_losses(w, &def_side, loss_def);
            // militia who fall are residents who die: exactly as many deaths are
            // recorded as people leave the region, and their share of its qualified
            // people is lost with them
            let militia_lost = crate::sim::population::draw_adults(w, ri, (militia as i64 * loss_def / 10_000) as u32);
            for &ai in &attackers {
                let a = &mut w.armies[ai];
                a.morale_bp = (a.morale_bp as i64 + if loss_att > loss_def { -700 } else { 150 }).clamp(500, 10_000) as u16;
            }
            for &ai in &defenders {
                let a = &mut w.armies[ai];
                a.morale_bp = (a.morale_bp as i64 + if loss_def > loss_att { -600 } else { 150 }).clamp(500, 10_000) as u16;
            }
            let lc = &mut w.civs[lead as usize];
            lc.flows.deaths += la;
            lc.flows.deaths_cause[crate::sim::population::CAUSE_WAR] += la;
            lc.war_weariness = (lc.war_weariness + ((la as i64 * 40 / att_people.max(1) as i64) as i32).max(1)).min(60);
            let dc = &mut w.civs[ctrl as usize];
            dc.flows.deaths += ld + militia_lost;
            dc.flows.deaths_cause[crate::sim::population::CAUSE_WAR] += ld + militia_lost;
            dc.war_weariness = (dc.war_weariness + 1).min(60);
            let rname = w.regions[ri].name.clone();
            let (la_txt, ld_txt) = (crate::util::group(la as i64), crate::util::group(ld as i64 + militia_lost as i64));
            brief(w, lead, "warning", format!("Fighting at {rname}"), format!("Our forces lost {la_txt}; the defenders are estimated to have lost {ld_txt}."), Some(ri as RegionId), "military");
            brief(w, ctrl, "danger", format!("Fighting at {rname}"), format!("We lost {ld_txt} defending; attackers are estimated to have lost {la_txt}."), Some(ri as RegionId), "military");
            if !overwhelmed {
                w.regions[ri].capture = None;
            }
            // broken formations withdraw or dissolve
            for &ai in attackers.iter().chain(defenders.iter()) {
                let broken = w.armies[ai].morale_bp < 3000 || (w.armies[ai].count() as u64) * 10 < (w.armies[ai].initial as u64) * 3;
                if broken && w.armies[ai].count() > 0 {
                    let owner = w.armies[ai].owner;
                    let retreat = w.regions[ri].neighbors.iter().map(|(n, _)| *n as usize).find(|n| w.regions[*n].controller.map(|c| friendly(w, owner, c)).unwrap_or(false));
                    match retreat {
                        Some(n) => {
                            w.armies[ai].region = n as RegionId;
                            w.armies[ai].order = ArmyOrder::Hold;
                            w.armies[ai].morale_bp = w.armies[ai].morale_bp.max(3500);
                        }
                        None => {
                            // with nowhere to withdraw to, the formation is destroyed:
                            // its soldiers are recorded as dead, not silently removed
                            let gone = w.armies[ai].count();
                            w.armies[ai].soldiers = [0; 3];
                            w.civs[owner as usize].flows.deaths += gone;
                            w.civs[owner as usize].flows.deaths_cause[crate::sim::population::CAUSE_WAR] += gone;
                        }
                    }
                }
            }
        }
        if !contested || overwhelmed {
            // the attacker must hold the region for five consecutive months
            let still_there = w.armies.iter().any(|a| a.region as usize == ri && a.owner == lead && a.count() > 0);
            if !still_there {
                w.regions[ri].capture = None;
                continue;
            }
            let progress = match w.regions[ri].capture {
                Some((s, n)) if s == lead => n + 1,
                _ => 1,
            };
            w.regions[ri].capture = Some((lead, progress));
            if progress >= crate::sim::cities::capture_months(crate::sim::cities::city_class(w, ri)) {
                let old = ctrl;
                // the people stay; their qualifications pass from one ledger to the other
                w.set_controller(ri, Some(lead));
                w.regions[ri].capture = None;
                w.regions[ri].occupied_since = Some(month);
                w.regions[ri].unrest_bp = 6000;
                for f in w.regions[ri].facilities.iter_mut() {
                    f.condition_bp = (f.condition_bp as i64 * 7 / 10).max(3000) as u16;
                }
                let rname = w.regions[ri].name.clone();
                let (ln, on) = (w.civs[lead as usize].name.clone(), w.civs[old as usize].name.clone());
                moment(w, lead, MomentCategory::War, format!("{rname} occupied"), format!("After {progress} months of control, {ln} administers {rname}. Its people, debts and damaged works come with it; cooperation does not."), Some(ri as RegionId), "war", true, vec![format!("Control established in {when}")]);
                moment(w, old, MomentCategory::Crisis, format!("{rname} lost"), format!("{on} no longer controls {rname}. {ln} holds it."), Some(ri as RegionId), "war", true, vec![format!("Control lost in {when}")]);
                brief(w, old, "danger", format!("{rname} has fallen"), format!("{ln} now controls it."), Some(ri as RegionId), "military");
            }
        }
    }

    // ---- sovereignty follows six months of stable control ----------------------------
    for ri in 0..w.regions.len() {
        let (owner, ctrl, since) = (w.regions[ri].owner, w.regions[ri].controller, w.regions[ri].occupied_since);
        if let (Some(o), Some(c2), Some(s)) = (owner, ctrl, since) {
            if o != c2 && month >= s + 6 {
                let contested = w.armies.iter().any(|a| a.region as usize == ri && a.owner == o && a.count() > 0);
                if !contested {
                    w.regions[ri].owner = Some(c2);
                    w.regions[ri].occupied_since = None;
                    let rname = w.regions[ri].name.clone();
                    brief(w, c2, "info", format!("{rname} is now governed as ours"), "Stable control has been verified. Services, order and reconstruction there are our responsibility.".into(), Some(ri as RegionId), "politics");
                    if w.civs[o as usize].capital as usize == ri {
                        if let Some(nc) = w.regions.iter().filter(|r| r.owner == Some(o)).max_by_key(|r| (r.population(), r.id)).map(|r| r.id) {
                            w.civs[o as usize].capital = nc;
                        }
                    }
                }
            }
        }
        if owner == ctrl {
            w.regions[ri].occupied_since = None;
        }
    }

    // ---- dissolved formations and eliminated polities -------------------------------------
    w.armies.retain(|a| a.count() > 0);
    for s in 0..w.civs.len() {
        if w.civs[s].status == SeatStatus::Eliminated {
            continue;
        }
        let seat = s as SeatId;
        let holds = w.regions.iter().any(|r| r.owner == Some(seat) || r.controller == Some(seat));
        if !holds {
            eliminate(w, seat);
        }
    }
    // barracks keep idle formations in practice
    for i in 0..w.armies.len() {
        let ri = w.armies[i].region as usize;
        if w.regions[ri].controller == Some(w.armies[i].owner) && w.regions[ri].cap(Cap::Barracks) > 0 && w.armies[i].proficiency_bp < 8500 && w.armies[i].training_left == 0 && w.armies[i].refit_to.is_none() {
            w.armies[i].proficiency_bp += 15;
        }
    }
}

pub fn eliminate(w: &mut World, seat: SeatId) {
    // colonies follow the metropole (design chapter 37, 6.6)
    crate::sim::space::pass_colonies(w, seat);
    let month = w.month;
    let when = crate::util::event_label(&w.cfg, month);
    let name = w.civs[seat as usize].name.clone();
    w.civs[seat as usize].status = SeatStatus::Eliminated;
    w.civs[seat as usize].eliminated_month = Some(month);
    w.civs[seat as usize].overlord = None;
    w.civs[seat as usize].projects.clear();
    // its courses close: learners and instructors go back to what they were, under
    // whoever governs the region now
    let programs = std::mem::take(&mut w.civs[seat as usize].programs);
    for p in &programs {
        crate::sim::projects::release_program(w, p);
    }
    // its soldiers lay down their arms where they stand and live on as residents
    // (in the old capital if they stand on land nobody governs): nobody vanishes
    let lineage = w.civs[seat as usize].lineage;
    let capital = w.civs[seat as usize].capital as usize;
    for i in 0..w.armies.len() {
        if w.armies[i].owner != seat {
            continue;
        }
        let n = w.armies[i].count();
        let here = w.armies[i].region as usize;
        let home = if w.regions[here].controller.is_some() { here } else { capital };
        crate::sim::population::return_adults(&mut w.regions[home], lineage, n);
    }
    w.armies.retain(|a| a.owner != seat);
    // its stores are abandoned: booked as lost, not left on a dead ledger
    for g in Good::ALL {
        let have = w.civs[seat as usize].stock_of(*g);
        w.civs[seat as usize].lose(*g, have);
    }
    for t in w.treaties.iter_mut() {
        if t.status == "active" && t.parties.contains(&seat) {
            t.status = "expired".into();
            t.performance.push(format!("{when}: {name} ceased to govern"));
        }
    }
    for o in 0..w.civs.len() {
        if w.civs[o].overlord == Some(seat) {
            w.civs[o].overlord = None;
        }
        w.civs[o].contacts[seat as usize].at_war = false;
        w.civs[seat as usize].contacts[o].at_war = false;
        if o != seat as usize && w.civs[o].contacts[seat as usize].met && w.civs[o].status != SeatStatus::Eliminated {
            reported(w, o as SeatId, MomentCategory::Governance, format!("{name} no longer governs"), format!("{name} holds no land and no effective government remains. Its people, property and debts continue under other authorities."), None, "ruin", vec![format!("Recorded in {when}")]);
        }
    }
    moment(w, seat, MomentCategory::Crisis, format!("The end of {name}"), "No region remains under our government. The people live on under other authorities.".into(), None, "ruin", true, vec![format!("Recorded in {when}")]);
}
