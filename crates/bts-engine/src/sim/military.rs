//! Campaign-level warfare: training, supply, movement, simultaneous monthly
//! losses, capture after sustained control, and elimination.
//!
//! There is no combat die. Power is engaged people × 2.5^tier × proficiency ×
//! supply × morale × terrain, adjusted by the three-role counter matrix.

use crate::content::{content, Cap, COUNTER, TIER_POWER};
use crate::sim::chronicle::{brief, moment, reported};
use crate::state::*;
use bts_protocol::*;

/// Home-defence militia: one working adult in forty, at most this many.
const MILITIA_MAX: u32 = 500_000;

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
}

fn side_power(w: &World, side: &Side, enemy_mix: [i64; 3], terrain_bp: i64) -> (i64, [i64; 3], u32) {
    let mut by_role = [0i64; 3];
    let mut people = 0u32;
    for &ai in &side.armies {
        let a = &w.armies[ai];
        let quality = a.proficiency_bp as i64 * a.supply_bp.max(2000) as i64 / 10_000 * a.morale_bp.max(2000) as i64 / 10_000;
        for role in 0..3 {
            by_role[role] += a.soldiers[role] as i64 * TIER_POWER[a.tier as usize] / 1000 * quality / 10_000;
        }
        people += a.count();
    }
    if side.militia > 0 {
        // defenders of their own homes: untrained, lightly armed, holding positions
        by_role[2] += side.militia as i64 * TIER_POWER[side.militia_tier as usize] / 1000 * 4000 / 10_000;
        people += side.militia;
    }
    let total: i64 = by_role.iter().sum();
    if total == 0 {
        return (0, [0; 3], people);
    }
    let mix = [by_role[0] * 10_000 / total, by_role[1] * 10_000 / total, by_role[2] * 10_000 / total];
    let esum: i64 = enemy_mix.iter().sum();
    let mut counter = 10_000;
    if esum > 0 {
        counter = 0;
        for i in 0..3 {
            for j in 0..3 {
                counter += mix[i] * enemy_mix[j] / 10_000 * COUNTER[i][j] / 10_000;
            }
        }
    }
    (total * counter / 10_000 * terrain_bp / 10_000, mix, people)
}

fn apply_losses(w: &mut World, side: &Side, frac_bp: i64) -> u32 {
    let mut lost = 0;
    for &ai in &side.armies {
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
    for a in w.armies.iter_mut() {
        a.in_battle = false;
    }
    armistices(w);

    // ---- training and upkeep --------------------------------------------------
    for i in 0..w.armies.len() {
        let owner = w.armies[i].owner as usize;
        let tier = w.armies[i].tier as usize;
        let count = w.armies[i].count() as i64;
        let def = &c.unit_tiers[tier];
        let mut ok: i64 = 10_000;
        for (g, a) in &def.upkeep {
            if *g == Good::Food {
                continue;
            }
            // upkeep is stated per thousand soldiers
            let need = a * count / 1000;
            if need > 0 {
                let got = w.civs[owner].take(*g, need);
                ok = ok.min(got * 10_000 / need);
            }
        }
        let a = &mut w.armies[i];
        a.supply_bp = ((a.supply_bp as i64 * 2 + ok.min(a.supply_bp as i64 + 4000)) / 3).clamp(1000, 10_000) as u16;
        if a.training_left > 0 {
            a.training_left -= 1;
            let total = def.training_months.max(1) as i64;
            let done = total - a.training_left as i64;
            a.proficiency_bp = (3000 + 4000 * done / total) as u16;
        } else if a.proficiency_bp < 7500 {
            a.proficiency_bp += 20;
        }
        if a.morale_bp < 8000 {
            a.morale_bp += 150;
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
        let defenders: Vec<usize> = present.iter().copied().filter(|i| friendly(w, w.armies[*i].owner, ctrl)).collect();
        let lead = w.armies[attackers[0]].owner;
        let home_defence = w.regions[ri].owner == Some(ctrl);
        let militia = if home_defence { (w.regions[ri].working() / 40).min(MILITIA_MAX) } else { 0 };
        let def_side = Side { armies: defenders.clone(), militia, militia_tier: military_tier(w, ctrl).min(1) };
        let att_side = Side { armies: attackers.clone(), militia: 0, militia_tier: 0 };
        let terrain_bp = match w.regions[ri].terrain {
            Terrain::Hills | Terrain::Mountains | Terrain::Forest | Terrain::Marsh => 11_500,
            _ => 10_500,
        };
        let (_, att_mix, att_people) = side_power(w, &att_side, [0; 3], 10_000);
        let (_, def_mix, def_people) = side_power(w, &def_side, [0; 3], 10_000);
        let (pa, _, _) = side_power(w, &att_side, def_mix, 10_000);
        let (pd, _, _) = side_power(w, &def_side, att_mix, terrain_bp);
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
            if progress >= 5 {
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
                moment(w, lead, MomentCategory::War, format!("{rname} occupied"), format!("After five months of control, {ln} administers {rname}. Its people, debts and damaged works come with it; cooperation does not."), Some(ri as RegionId), "war", true, vec![format!("Control established in {when}")]);
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
        if w.regions[ri].controller == Some(w.armies[i].owner) && w.regions[ri].cap(Cap::Barracks) > 0 && w.armies[i].proficiency_bp < 8500 && w.armies[i].training_left == 0 {
            w.armies[i].proficiency_bp += 15;
        }
    }
}

pub fn eliminate(w: &mut World, seat: SeatId) {
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
